#!/usr/bin/env python3
"""Human-in-the-loop validation queue for the Startup Atlas knowledge graph.

Builds/updates the persistent queue ``data/review-queue.json`` (design doc
``docs/KG-CONNECTIVE-TISSUE.md`` section 5) from a crawl-review artifact
directory (``latest-*.json`` files) plus the reviewed data on disk.

Entry kinds
-----------
- ``merge`` — fuzzy identity match in the section 1 review band
  (score 0.65-0.90). Produced by ``scripts/entity_resolution.py``'s
  ``match_candidates`` (present, delivered by subagent A); the local
  fallback in this file implements the same documented algorithm
  (token Jaccard + host bonus; exact identity-key match = 1.0) and is
  used only when that module cannot be imported.
- ``edge`` — graph edge with confidence < 0.50. Confidence comes from
  the edge's own ``confidence`` field when present, otherwise from
  ``scripts/edge_scoring.py``'s ``score_edge`` over the edge's sources
  (one secondary source scores 0.50, so a single-sourced reviewed edge
  is never queued — only inferred or sourceless edges fall below 0.50).
- ``fact`` — draft funding fact from a news item: a draft-round shape
  (startup, amount, currency, stage, date, source URL). Only news whose
  title signals a funding round and whose amount mention appears in the
  title is proposed, so valuations and product prices are not mistaken
  for rounds.
- ``fact`` (value) — draft valuation/listing fact from a news item
  (#414d): a draft-value shape (startup, amount, currency, date, event
  kind in ``latest_value``'s basis vocabulary, stage when the headline
  names one, exchange/ticker when the headline literally carries them
  as ``(NYSE: PATH)``, source URL). Produced by
  ``produce_value_facts`` from the same news candidates the round
  producer reads — the amounts ``_draft_round`` deliberately skips
  because they are valuations, secondary sales or market caps rather
  than raises. Facts already recorded in the evidence stores
  (``startup-research`` round valuations, ``treemap-evidence``
  private valuations / market caps, judged through
  ``scripts/latest_value.py``'s own gates) are never re-proposed.
  Confidence is 0.5 — below the 0.55 fact gate — and the payload lives
  under ``draft_value``, not ``draft_round``, so the fact gating rule
  (which inspects ``draft_round`` only) can never auto-approve one:
  every value fact is a human decision, and approval means recording
  the figure in the evidence stores, where the existing derivation in
  ``latest_value.py`` picks it up. Nothing here publishes data.
- ``startup-lead`` — new portfolio-company name from the profiles crawl
  with nowhere to go yet. Ranked by (distinct partners mentioning it,
  has a website) and capped at 100 entries per run; the rest stay in the
  crawl artifact, not the queue.
- ``headshot`` — staged portrait candidate bound to a professional-bio
  row in profiles mode (#354/#406). The admin panel card shows the
  image; approval there is the promotion decision. Never auto-approved
  by confidence gating in v1.

After the producers run, confidence gating
(``scripts/review_gating.py``, thresholds in
``data/review-gating.json``) auto-approves the pending entries whose
per-kind rule passes; the rest stay pending for the admin panel.

Dedup
-----
Entries dedup by ``(kind, subject_key)``. A re-run never re-queues an
identical pending entry, and a rejected entry is never re-proposed for
identical evidence: the evidence URLs are fingerprinted (sha256 of the
sorted URL list) and a rejected entry with the same fingerprint blocks
any new entry with the same ``(kind, subject_key)``. New evidence for
the same subject may be proposed again.

Transitions
-----------
``decide(queue, entry_id, decision, by, note)`` moves a pending entry
to ``approved`` or ``rejected`` with ``decided_by`` / ``decided_at`` /
``decision_note``. An approved merge writes into ``data/identity.json``
(``merged_from`` + ``merges[]``) via ``entity_resolution.apply_merge``
when available, otherwise via the local writer in this file following
the same schema. Approved edges and facts record ``decided_by`` on the
entry only — they are applied by the existing MCP write path, never by
editing reviewed files from this builder.

Usage
-----
    python3 scripts/build-review-queue.py --artifact-dir <dir> --run 44 \
        --summary-md /tmp/review-queue-44.md [--queue data/review-queue.json]
"""

from __future__ import annotations

import argparse
import difflib
import hashlib
import json
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from datetime import date as calendar_date, datetime, timezone
from pathlib import Path
from urllib.parse import unquote, urlparse

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"

# --- optional sibling modules (guarded import; fall back when absent) ---
sys.path.insert(0, str(SCRIPTS))
try:  # subagent A: entity_resolution.py (not yet present at time of writing)
    import entity_resolution as _entity_resolution
except ImportError:  # pragma: no cover - fallback path, covered by tests
    _entity_resolution = None
try:  # subagent B: edge_scoring.py (present)
    import edge_scoring as _edge_scoring
except ImportError:  # pragma: no cover
    _edge_scoring = None
try:  # confidence gating (data/review-gating.json thresholds)
    import review_gating as _review_gating
except ImportError:  # pragma: no cover
    _review_gating = None
try:  # latest-value derivation (#414): its gated views of the evidence
    # stores define what "already recorded" means for value-fact dedup
    import latest_value as _latest_value
except ImportError:  # pragma: no cover
    _latest_value = None

QUEUE_VERSION = 1
REVIEW_LOW = 0.65
REVIEW_HIGH = 0.90
EDGE_LOW_CONFIDENCE = 0.50
STARTUP_LEAD_CAP = 100

# Generic name tokens shared by hundreds of firms. A merge proposal that
# rests on nothing but these (e.g. "1616 Ventures" -> "645 Ventures",
# every "* Foundation" -> the junk "Foundation" seed) is not a real
# identity claim. The matcher in entity_resolution.py scores token
# containment, so without this guard the queue floods with such pairs
# (345 proposals from run #44, 260 of them generic-only). A proposal
# survives only when the two names share a distinctive token, when the
# generic-stripped slugs are near-identical, or when one stripped slug
# contains the other ("box" in "boxgroup").
GENERIC_NAME_TOKENS = frozenset({
    "ventures", "venture", "capital", "partners", "partner",
    "foundation", "fund", "funds", "group", "labs", "lab", "inc", "llc",
    "co", "company", "holdings", "global", "international",
    "accelerator", "studio", "collective", "network", "ai", "the", "and",
    "of", "for", "founder", "founders",
})

FUNDING_TITLE_RE = re.compile(
    r"\b(secures?|raises?|raised|closes?|closed|announces?|lands?|bags?)\b"
    r".*\b(funding|round|series|seed|pre-seed|investment)\b"
    r"|\b(series\s+[a-z]|seed\s+round|funding\s+round|pre-seed\s+round)\b",
    re.IGNORECASE,
)
STAGE_RE = re.compile(
    r"\b(series\s+[A-Z](?:-\d+)?|pre-seed|seed|bridge)\b", re.IGNORECASE
)

# Value-fact headline signals (#414d). A money mention in a news title is
# a valuation/listing fact only when the title says so in so many words:
# "market cap" ahead of the figure, "secondary" in the title together
# with a valuation signal, or a valuation signal itself ("valued at",
# "at a $33B valuation", "$33B valuation"). Anything else stays with the
# round producer (or nowhere). Exchange/ticker are taken only from the
# literal "(NYSE: PATH)" headline form — never inferred.
VALUE_CONFIDENCE = 0.5
TICKER_RE = re.compile(
    r"\((NYSE|NASDAQ|LSE|ASX|TSX)\s*:\s*([A-Z][A-Z0-9.]{0,9})\)")
APPROX_RE = re.compile(
    r"\b(about|around|approximately|approx\.?|over|nearly|almost)\b",
    re.IGNORECASE)


def utcnow_iso():
    """Current UTC time as an ISO-8601 Z string."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def slug(name):
    """Canonical slug, mirroring ``make-graph.py`` (NFKD, ASCII, lower)."""
    value = unicodedata.normalize("NFKD", str(name)).encode("ascii", "ignore")
    return re.sub(r"[^a-z0-9]+", "-", value.decode().lower()).strip("-")


def normalise_host(url):
    """Lowercase host, strip leading ``www.`` and trailing dot."""
    if not url or not isinstance(url, str):
        return ""
    try:
        host = urlparse(url).hostname or ""
    except ValueError:
        host = ""
    host = host.lower()
    if host.startswith("www."):
        host = host[4:]
    return host.rstrip(".")


# Link text longer than this is a card/theme label, not a name. Mirrors
# crawl.py's PROFILE_LONG_LABEL rule, applied again here because a crawl
# artifact can carry polluted names produced before the crawl-side guard
# (or by another producer): run 44 queued eight leads whose names baked
# in a theme heading and/or the company's full marketing description
# (#462), e.g. "Decarbonise the planet Avarni AI-powered carbon ...".
LEAD_LABEL_MAX = 40

# A startup-lead whose name is built ONLY from taxonomy words is a
# partner-site theme/category page, not a company (#460): Madrona's
# Companies filter nav lists "AI & Intelligent Apps", "AI-Enabled
# Biotech", "Consumer & Marketplace" and "Data & Infrastructure" as
# themes profiling other companies, and the crawl emitted each one as
# a lead (two were rejected by agent review after opening the pages
# live). The vocabulary is deliberately narrow — sector/category nouns
# and modifiers, no words that carry identity in real company names
# (no "labs", "platform", "solutions", "technologies") — and the guard
# needs at least two tokens, so a distinctive name always survives.
THEME_LABEL_TOKENS = frozenset({
    "ai", "ml", "intelligent", "apps", "applications", "enabled",
    "biotech", "consumer", "marketplace", "data", "infrastructure",
    "health", "healthcare", "medtech", "fintech", "edtech", "agtech",
    "proptech", "insurtech", "regtech", "legaltech", "hrtech",
    "climate", "cleantech", "greentech", "energy", "sustainability",
    "cybersecurity", "security", "enterprise", "saas", "ecommerce",
    "commerce", "retail", "robotics", "autonomous", "mobility",
    "logistics", "manufacturing", "agriculture", "food", "travel",
    "media", "entertainment", "gaming", "education", "wellness",
    "finance", "financial", "payments", "banking", "insurance",
    "crypto", "web3", "blockchain", "defi", "quantum", "aerospace",
    "defense", "defence", "space", "hardware", "software", "cloud",
    "analytics", "automation", "iot", "semiconductors", "materials",
    "therapeutics", "diagnostics", "devices", "computing", "networks",
    "developer", "devtools", "tools", "and", "the", "of", "for",
})


def is_theme_label(name):
    """True when every token of ``name`` is a taxonomy/category word.

    Such a name labels a theme page that profiles other companies; it
    cannot be a single company's name (#460).
    """
    tokens = re.findall(r"[a-z0-9]+", str(name).casefold())
    return len(tokens) >= 2 and all(t in THEME_LABEL_TOKENS
                                    for t in tokens)


# One partner contributes at most a couple of candidate URLs for one
# company (URL variants of its profile page). A "lead" aggregating
# many distinct candidate URLs per mentioning partner is a listing
# page scraped as a subject (#460): the Partech "Full Profile" lead
# carried ~30 different companies' profile URLs as its evidence.
LEAD_MAX_URLS_PER_PARTNER = 2
LEAD_URL_FLOOR = 5


def _slug_derived_name(url):
    """Display name from the last URL path segment, title-cased.

    Mirrors crawl.py's ``slug_derived_name``: inferred, never verified.
    Returns None when no usable segment exists.
    """
    if not url or not isinstance(url, str):
        return None
    try:
        parts = urlparse(url)
    except ValueError:
        return None
    segments = [segment for segment in parts.path.split("/") if segment]
    if not segments:
        return None
    last = unquote(segments[-1]).strip(" .")
    words = [word for word in re.split(r"[-_]+", last) if word]
    if not words:
        return None
    name = " ".join(words).title()
    if len(name) < 2 or name.replace(" ", "").isdigit():
        return None
    return name


def clean_lead_name(name, url):
    """Reduce a long card/theme label to the company name from its URL.

    Only fires when the candidate URL's slug words appear as a
    contiguous run in the name text (the same test crawl.py applies),
    so a genuinely long company name is never replaced. Anything else
    is returned unchanged.
    """
    if len(name) <= LEAD_LABEL_MAX or not url:
        return name
    try:
        segments = [s for s in urlparse(url).path.split("/") if s]
    except ValueError:
        return name
    if not segments:
        return name
    slug_words = re.findall(r"[a-z0-9]+", unquote(segments[-1]).casefold())
    while slug_words and slug_words[-1].isdigit():
        slug_words.pop()
    if not slug_words:
        return name
    text_words = re.findall(r"[a-z0-9]+", name.casefold())
    if not any(text_words[i:i + len(slug_words)] == slug_words
               for i in range(len(text_words) - len(slug_words) + 1)):
        return name
    return _slug_derived_name(url) or name


def evidence_fingerprint(evidence):
    """Stable fingerprint of an entry's evidence URLs."""
    urls = sorted({str(u) for u in evidence if u})
    return hashlib.sha256("\n".join(urls).encode("utf-8")).hexdigest()


def _name_tokens(name):
    return set(re.findall(r"[a-z0-9]+", str(name).lower()))


def _jaccard(a, b):
    union = a | b
    return len(a & b) / len(union) if union else 0.0


def _stripped_slug(name):
    """Slug with generic tokens removed ('' when nothing distinctive)."""
    return "-".join(t for t in slug(name).split("-")
                    if t not in GENERIC_NAME_TOKENS)


def merge_is_plausible(subject_id, candidate_id):
    """Guard against the matcher's generic-token false positives.

    A merge proposal is plausible when the two names share at least
    one distinctive (non-generic) token, when their generic-stripped
    slugs are near-identical (difflib ratio > 0.80), or when one
    stripped slug contains the other ("box" in "boxgroup"). A name
    proposed against itself is never plausible. This is a queue-side
    guard only — it does not change entity_resolution's scores.
    """
    if subject_id == candidate_id:
        return False
    subject = subject_id.split(":", 1)[1]
    candidate = candidate_id.split(":", 1)[1]
    if (_name_tokens(subject) & _name_tokens(candidate)
            - GENERIC_NAME_TOKENS):
        return True
    stripped_subject = _stripped_slug(subject)
    stripped_candidate = _stripped_slug(candidate)
    if not stripped_subject or not stripped_candidate:
        return False
    if (stripped_subject in stripped_candidate
            or stripped_candidate in stripped_subject):
        return min(len(stripped_subject),
                   len(stripped_candidate)) >= 3
    return difflib.SequenceMatcher(
        None, stripped_subject, stripped_candidate).ratio() > 0.80


def local_match_candidates(name, identity_key, kind, registry):
    """Fallback for ``entity_resolution.match_candidates`` (section 1).

    ``registry`` is an identity-shaped dict (``{"entities": {id:
    {"name", "kind", "identity_key", ...}}}``). Exact identity-key
    match = 1.0 (auto-merge); otherwise token Jaccard plus a 0.15 host
    bonus when the identity keys share a host, capped at 0.89 so name
    similarity alone never auto-merges. Returns scored candidates
    sorted best-first: [{"id", "name", "score", "basis",
    "identity_key", "auto_merge"}]. Only scores >= 0.65 are returned.
    """
    name_tokens = _name_tokens(name)
    key_host = normalise_host("https://" + identity_key) if identity_key else ""
    out = []
    for cand_id, cand in (registry.get("entities") or {}).items():
        if cand.get("kind") != kind:
            continue
        cand_key = cand.get("identity_key") or ""
        if identity_key and cand_key and identity_key == cand_key:
            out.append({"id": cand_id, "name": cand.get("name", ""),
                        "score": 1.0, "basis": "identity-key",
                        "identity_key": cand_key, "auto_merge": True})
            continue
        score = _jaccard(name_tokens, _name_tokens(cand.get("name", "")))
        cand_host = normalise_host("https://" + cand_key) if cand_key else ""
        if key_host and cand_host and key_host == cand_host:
            score += 0.15
            basis = "name similarity + shared host"
        else:
            basis = "name similarity"
        score = round(min(score, 0.89), 2)
        if score >= REVIEW_LOW:
            out.append({"id": cand_id, "name": cand.get("name", ""),
                        "score": score, "basis": basis,
                        "identity_key": cand_key or None,
                        "auto_merge": False})
    out.sort(key=lambda c: (-c["score"], c["id"]))
    return out


def match_candidates(name, identity_key, kind, registry):
    """Score identity-match candidates, via entity_resolution if present."""
    if _entity_resolution is not None:
        return _entity_resolution.match_candidates(
            name, identity_key, kind, registry)
    return local_match_candidates(name, identity_key, kind, registry)


def _apply_merge_local(registry, from_id, to_id, basis, decided_by):
    """Fallback for ``entity_resolution.apply_merge`` (section 1 schema)."""
    entities = registry.setdefault("entities", {})
    for entity_id in (from_id, to_id):
        if entity_id not in entities:
            kind, name_slug = entity_id.split(":", 1)
            entities[entity_id] = {
                "name": name_slug.replace("-", " ").title(),
                "kind": kind, "aliases": [], "identity_key": None,
                "identity_basis": "name-only", "merged_from": [],
                "updated_at": utcnow_iso(),
            }
    winner = entities[to_id]
    if from_id not in winner["merged_from"]:
        winner["merged_from"].append(from_id)
    winner["updated_at"] = utcnow_iso()
    merges = registry.setdefault("merges", [])
    if not any(m.get("from") == from_id and m.get("to") == to_id
               for m in merges):
        merges.append({"from": from_id, "to": to_id, "basis": basis,
                       "decided_by": decided_by, "decided_at": utcnow_iso()})
    return registry


def apply_merge(registry, from_id, to_id, basis, decided_by):
    """Record a merge in the identity registry (section 1 schema)."""
    if _entity_resolution is not None:
        return _entity_resolution.apply_merge(
            registry, from_id, to_id, basis, decided_by)
    return _apply_merge_local(registry, from_id, to_id, basis, decided_by)


# ---------------------------------------------------------------- queue I/O

def new_queue():
    return {"version": QUEUE_VERSION, "entries": []}


def load_queue(path):
    path = Path(path)
    if not path.exists():
        return new_queue()
    with open(path, encoding="utf-8") as handle:
        data = json.load(handle)
    if data.get("version") != QUEUE_VERSION:
        raise ValueError(f"unsupported queue version: {data.get('version')!r}")
    data.setdefault("entries", [])
    return data


def save_queue(queue, path):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    entries = sorted(queue["entries"], key=lambda e: e["id"])
    with open(path, "w", encoding="utf-8") as handle:
        json.dump({"version": QUEUE_VERSION, "entries": entries},
                  handle, indent=2, ensure_ascii=False)
        handle.write("\n")


def load_json(path, default=None):
    path = Path(path)
    if not path.exists():
        return default
    with open(path, encoding="utf-8") as handle:
        return json.load(handle)


# ------------------------------------------------------------- entry helpers

def _new_entry(entry_id, kind, subject, subject_key, candidates, evidence,
               confidence, run):
    return {
        "id": entry_id,
        "kind": kind,
        "subject": subject,
        "subject_key": subject_key,
        "candidates": candidates,
        "evidence": sorted({str(u) for u in evidence if u}),
        "confidence": round(float(confidence), 2),
        "created_at": utcnow_iso(),
        "run": str(run),
        "status": "pending",
        "decided_by": None,
        "decided_at": None,
        "decision_note": None,
        "evidence_fingerprint": evidence_fingerprint(evidence),
    }


def add_entry(queue, entry):
    """Add ``entry`` unless dedup blocks it.

    Blocked when an entry with the same ``(kind, subject_key)`` is
    pending or approved, or when a rejected entry with the same key
    carries the identical evidence fingerprint. Returns True when the
    entry was added.
    """
    key = (entry["kind"], entry["subject_key"])
    for existing in queue["entries"]:
        if (existing["kind"], existing["subject_key"]) != key:
            continue
        if existing["status"] in ("pending", "approved"):
            return False
        if existing["status"] == "rejected" and existing.get(
                "evidence_fingerprint") == entry["evidence_fingerprint"]:
            return False
    entry["id"] = _unique_id(queue, entry["id"])
    queue["entries"].append(entry)
    return True


def _unique_id(queue, entry_id):
    """Disambiguate an id already used in the queue (re-proposal after a
    rejection with new evidence keeps the plain id for the first entry
    and takes ``#2``, ``#3`` ... after it)."""
    candidate, n = entry_id, 2
    existing_ids = {e["id"] for e in queue["entries"]}
    while candidate in existing_ids:
        candidate = f"{entry_id}#{n}"
        n += 1
    return candidate


def decide(queue, entry_id, decision, by, note=None, identity_path=None):
    """Decide a pending entry.

    ``decision`` is ``"approved"`` or ``"rejected"``. Sets ``status``,
    ``decided_by``, ``decided_at`` and ``decision_note``. An approved
    merge writes into the identity registry at ``identity_path``
    (``merged_from`` + ``merges[]``); approved edges and facts only
    record ``decided_by`` on the entry — they are applied by the
    existing MCP write path, never by editing reviewed files here.
    Returns the decided entry. Raises ValueError for an unknown id, a
    bad decision, or a non-pending entry.
    """
    if decision not in ("approved", "rejected"):
        raise ValueError(f"decision must be 'approved' or 'rejected', "
                         f"got {decision!r}")
    entry = next((e for e in queue["entries"] if e["id"] == entry_id), None)
    if entry is None:
        raise ValueError(f"unknown queue entry: {entry_id!r}")
    if entry["status"] != "pending":
        raise ValueError(f"entry {entry_id!r} is already "
                         f"{entry['status']}, cannot decide it again")
    entry["status"] = decision
    entry["decided_by"] = by
    entry["decided_at"] = utcnow_iso()
    entry["decision_note"] = note
    if decision == "approved" and entry["kind"] == "merge":
        if identity_path is None:
            identity_path = ROOT / "data" / "identity.json"
        registry = load_json(identity_path, None) or {
            "version": 1, "generated_at": utcnow_iso(),
            "source_revision": None, "entities": {}, "merges": [],
        }
        candidates = entry.get("candidates") or []
        if candidates:
            basis = candidates[0].get("basis", "review-queue")
            _ensure_merge_entities(registry, entry["subject"],
                                   candidates[0]["id"],
                                   entry.get("subject_key"))
            apply_merge(registry, entry["subject"],
                        candidates[0]["id"], basis, by or "review-queue")
            identity_path = Path(identity_path)
            identity_path.parent.mkdir(parents=True, exist_ok=True)
            with open(identity_path, "w", encoding="utf-8") as handle:
                json.dump(registry, handle, indent=2, ensure_ascii=False)
                handle.write("\n")
    return entry


# -------------------------------------------------------------- data sources

def _local_build_registry(data_dir):
    """Identity-shaped registry from the reviewed data on disk.

    Used only when ``entity_resolution`` cannot be imported. Seeds
    partners (reviewed + leads) and startups (startup-research) with
    website-host identity keys, falling back to ``name-only``.
    """
    data_dir = Path(data_dir)
    entities = {}

    def add(kind, name, identity_key, basis):
        entity_id = f"{kind}:{slug(name)}"
        entities.setdefault(entity_id, {
            "name": name, "kind": kind, "aliases": [],
            "identity_key": identity_key or None,
            "identity_basis": basis, "merged_from": [],
            "updated_at": utcnow_iso(),
        })

    reviewed = load_json(data_dir / "partners-reviewed.json", {}) or {}
    for name, record in reviewed.items():
        host = normalise_host((record or {}).get("website", ""))
        add("partner", name, host, "website-host" if host else "name-only")
    for name in load_json(data_dir / "partner-leads.json", []) or []:
        add("partner", name, None, "name-only")
    research = load_json(data_dir / "startup-research.json", {}) or {}
    for startup in research.get("startups", []):
        host = normalise_host(startup.get("website", ""))
        add("startup", startup["name"], host,
            "website-host" if host else "name-only")
    return {"version": 1, "generated_at": utcnow_iso(),
            "source_revision": None,
            "entities": dict(sorted(entities.items())), "merges": []}


def build_registry(data_dir):
    """Identity registry for matching, in the section 1 shape.

    Prefers the seeded ``data/identity.json`` when it exists, then
    ``entity_resolution.build_registry``; falls back to a local seed
    from the reviewed files when neither is available.
    """
    data_dir = Path(data_dir)
    identity = load_json(data_dir / "identity.json", None)
    if identity:
        return identity
    if _entity_resolution is not None:
        try:
            return _entity_resolution.build_registry(data_dir)
        except Exception:
            pass  # missing reviewed files in a test fixture: local seed
    return _local_build_registry(data_dir)


def _ensure_merge_entities(registry, from_id, to_id, subject_key):
    """Make sure both sides of a merge exist in the registry.

    ``entity_resolution.apply_merge`` raises on unknown IDs, but a
    queue subject is a crawl name that may not be registered yet. A
    missing side is added as a minimal record (name-only unless the
    subject key is a host or LinkedIn URL); nothing is invented beyond
    the name and the key the queue entry already carries.
    """
    entities = registry.setdefault("entities", {})
    for entity_id in (from_id, to_id):
        if entity_id in entities:
            continue
        kind, name_slug = entity_id.split(":", 1)
        key = None
        basis = "name-only"
        if entity_id == from_id and subject_key:
            if subject_key.startswith("linkedin.com/in/"):
                key, basis = subject_key, "linkedin-url"
            elif "." in subject_key and " " not in subject_key:
                key, basis = normalise_host(subject_key), "website-host"
        entities[entity_id] = {
            "name": name_slug.replace("-", " ").title(),
            "kind": kind, "aliases": [], "identity_key": key,
            "identity_basis": basis, "merged_from": [],
            "updated_at": utcnow_iso(),
        }
    return registry


def load_artifact(artifact_dir, stem):
    """Load ``latest-<stem>.json`` (or ``<stem>.json``) from the artifact."""
    artifact_dir = Path(artifact_dir)
    for name in (f"latest-{stem}.json", f"{stem}.json"):
        path = artifact_dir / name
        if path.exists():
            return load_json(path, {}) or {}
    return {}


# ---------------------------------------------------------------- producers

def produce_merges(artifact_dir, data_dir, run):
    """Merge entries from the section 1 review band (0.65-0.90)."""
    registry = build_registry(data_dir)
    entries = []

    def propose(name, kind, identity_key, evidence):
        if not name:
            return
        candidates = match_candidates(name, identity_key, kind, registry)
        subject = f"{kind}:{slug(name)}"
        for cand in candidates:
            if cand["score"] >= 1.0 or cand.get("auto_merge"):
                continue  # exact identity-key match: auto-merge, not queued
            if not (REVIEW_LOW <= cand["score"] <= REVIEW_HIGH):
                continue
            if not merge_is_plausible(subject, cand["id"]):
                continue  # generic-token-only or self match: not a claim
            key = identity_key or slug(name)
            entries.append(_new_entry(
                f"merge:{subject}", "merge", subject, key,
                [{"id": cand["id"], "score": cand["score"],
                  "basis": cand["basis"]}],
                evidence, cand["score"], run))
            break  # one proposal per subject: the best plausible hit

    partners = load_artifact(artifact_dir, "partners").get("candidates", [])
    reviewed_names = set(
        (load_json(Path(data_dir) / "partners-reviewed.json", {}) or {}).keys())
    lead_names = set(load_json(Path(data_dir) / "partner-leads.json", []) or [])
    for row in partners:
        name = (row.get("name") or "").strip()
        if not name or name in reviewed_names or name in lead_names:
            continue
        propose(name, "partner", normalise_host(row.get("website_candidate")),
                [row.get("source_url")])

    profiles = load_artifact(artifact_dir, "profiles").get("candidates", [])
    research = load_json(Path(data_dir) / "startup-research.json", {}) or {}
    known_startups = {s["name"] for s in research.get("startups", [])}
    for row in profiles:
        if row.get("kind") != "companies":
            continue
        name = (row.get("name") or "").strip()
        if not name or name in known_startups:
            continue
        # The candidate URL is a portfolio page on the partner's site,
        # not the company's own website, so it is not an identity key.
        propose(name, "startup", "",
                [row.get("candidate_url"), row.get("source_url")])

    # Person reconciliation (KG-10): the same LinkedIn URL at two firms
    # is the same person. Group people rows by LinkedIn identity key.
    by_linkedin = defaultdict(list)
    for row in profiles:
        if row.get("kind") != "people":
            continue
        url = row.get("candidate_url") or ""
        match = re.search(r"linkedin\.com/in/([a-z0-9-]+)", url, re.IGNORECASE)
        if match:
            by_linkedin["linkedin.com/in/" + match.group(1).lower()].append(row)
    for key, rows in sorted(by_linkedin.items()):
        firms = {r.get("partner") for r in rows if r.get("partner")}
        if len(firms) < 2:
            continue
        name = (rows[0].get("name") or "").strip()
        if not name:
            continue
        propose(name, "person", key,
                [r.get("candidate_url") for r in rows])
    return entries


def produce_edges(data_dir, run):
    """Edge entries for graph edges with confidence < 0.50."""
    graph = load_json(Path(data_dir) / "graph.json", None)
    if not graph:
        return []
    entries = []
    for edge in graph.get("edges", []):
        confidence = edge.get("confidence")
        if confidence is None and _edge_scoring is not None:
            confidence = _edge_scoring.score_edge([{
                "type": "secondary", "url": edge.get("source"),
                "reviewed_at": edge.get("last_verified")}])
        if confidence is None:
            continue  # no basis to judge confidence: never guess
        if confidence >= EDGE_LOW_CONFIDENCE:
            continue
        subject = f"{edge.get('from')} -> {edge.get('to')} [{edge.get('kind')}]"
        key = f"{edge.get('from')}|{edge.get('to')}|{edge.get('kind')}"
        entries.append(_new_entry(
            f"edge:{key}", "edge", subject, key, [],
            [edge.get("source")], confidence, run))
    return entries


def _draft_round(item):
    """Draft funding round from a news item, or None when not a round.

    Requires a funding signal in the title and an amount mention that
    appears in the title (so valuations and product prices are skipped).
    """
    title = item.get("title") or ""
    if not FUNDING_TITLE_RE.search(title):
        return None
    amount = None
    for mention in item.get("amount_mentions", []):
        text = mention.get("mention") or ""
        normalised = mention.get("normalised") or {}
        value = normalised.get("value")
        if value is None or text not in title:
            continue
        before = title.lower().split(text.lower(), 1)[0]
        if "valuation" in before[-30:]:
            continue
        amount = {"value": value, "currency": normalised.get("currency"),
                  "mention": text}
        break
    if amount is None:
        return None
    stage_match = STAGE_RE.search(title)
    stage = stage_match.group(1) if stage_match else None
    if stage:
        stage = stage.lower().replace("series ", "Series ").title() \
            if stage.lower().startswith("series") else stage.title()
        stage = {"Pre-Seed": "Pre-Seed", "Seed": "Seed",
                 "Bridge": "Bridge"}.get(stage, stage)
    date = (item.get("published_hint") or "").strip() or None
    if not date:
        checked = item.get("checked_at") or ""
        date = checked[:10] if checked else None
    return {
        "startup": item.get("startup") or "",
        "amount": amount["value"],
        "currency": amount["currency"],
        "stage": stage,
        "date": date,
        "source_url": item.get("url") or "",
    }


def produce_facts(artifact_dir, run):
    """Fact entries: draft funding rounds from news items."""
    news = load_artifact(artifact_dir, "news").get("candidates", [])
    entries = []
    for item in news:
        draft = _draft_round(item)
        if draft is None:
            continue
        confidence = 0.55 if draft["stage"] else 0.40
        key = f"{slug(draft['startup'])}:{slug(draft['stage'] or 'unknown')}" \
              f":{int(draft['amount'])}"
        entry = _new_entry(
            f"fact:{key}", "fact", f"startup:{slug(draft['startup'])}", key,
            [], [draft["source_url"], item.get("discovered_from")],
            confidence, run)
        entry["draft_round"] = draft
        entries.append(entry)
    return entries


def _signal_tail(text, window):
    """Title text after the last amount token, within ``window`` chars.

    Signal words describe the amount they sit next to, so when another
    figure intervenes ("raises $200 million at a $2 billion valuation")
    the words belong to that later figure, not to the mention being
    classified. Cutting the look-back at the last digit or ``$`` keeps
    each mention's signals its own.
    """
    return re.sub(r"^.*[\d$]", "", text[-window:], flags=re.S)


def _value_event_for_mention(title, mention_text):
    """Classify one title amount mention as a value event, or None.

    Returns ``(event, approximate)`` where ``event`` is one of
    ``latest_value``'s basis strings (``listed_market_cap``,
    ``secondary_sale``, ``last_round_post_money``,
    ``announced_valuation``). Title-only discipline, mirroring
    ``_draft_round``: the mention text must appear in the title, and
    the signal words must sit in the title around it.
    """
    position = title.find(mention_text)
    if position < 0:
        return None
    before = title[:position]
    after = title[position + len(mention_text):
                  position + len(mention_text) + 30]
    lowered = title.lower()
    before_tail = _signal_tail(before, 40).lower()
    after_lower = after.lower()
    valuation_at = after_lower.find("valuation")
    after_signal = valuation_at >= 0 and not re.search(
        r"[\d$]", after_lower[:valuation_at])
    valuation_signal = (
        "valuation" in before_tail or "valued at" in before_tail
        or "valuing" in before_tail or after_signal)
    cap_tail = _signal_tail(before, 60).lower()
    if "market cap" in cap_tail or "market capitalisation" in cap_tail \
            or "market capitalization" in cap_tail:
        event = "listed_market_cap"
    elif "secondary" in lowered and valuation_signal:
        event = "secondary_sale"
    elif valuation_signal:
        event = "last_round_post_money" if STAGE_RE.search(title) \
            else "announced_valuation"
    else:
        return None
    approximate = bool(APPROX_RE.search(before[-25:]))
    return event, approximate


def _recorded_value_events(data_dir):
    """Gated value events already in the evidence stores, by startup id.

    Built through ``latest_value``'s own views (``private_events`` /
    ``market_caps``) so dedup can never disagree with the derivation
    that would consume an approved fact. Returns {} when the module or
    the stores are unavailable — dedup then relies on the queue alone.
    """
    if _latest_value is None:
        return {}
    data_dir = Path(data_dir)
    research = load_json(data_dir / "startup-research.json", {}) or {}
    evidence = load_json(data_dir / "treemap-evidence.json", {}) or {}
    rounds_by_id = {}
    for startup in research.get("startups", []):
        rounds_by_id[_latest_value.startup_id_for(startup["name"])] = \
            startup.get("funding_rounds", [])
    startup_ids = set(rounds_by_id)
    for record in (evidence.get("private_valuations") or []) + \
            (evidence.get("market_caps") or []):
        if isinstance(record, dict) and record.get("startup_id"):
            startup_ids.add(record["startup_id"])
    recorded = {}
    for startup_id in sorted(startup_ids):
        private = _latest_value.private_events(
            rounds_by_id.get(startup_id, []),
            [r for r in evidence.get("private_valuations") or []
             if r.get("startup_id") == startup_id])
        caps = _latest_value.market_caps(
            [r for r in evidence.get("market_caps") or []
             if r.get("startup_id") == startup_id])
        recorded[startup_id] = {"private": private, "caps": caps}
    return recorded


def _already_recorded(events, event, amount, currency, date, source):
    """True when the evidence stores already hold this figure.

    A match needs the same amount — within 1%, because headlines round
    ("$5.71 billion" for a recorded 5,711,863,282.64) — and the same
    year-month (when both dates are known); currency must agree
    whenever both sides state one. A crawl headline's currency is
    often unstated (bare ``$``). Without a publication date, only
    the exact source of an immutable round valuation can establish a
    repeat. A rolling market-cap page can reuse its URL every day.
    """
    if not events:
        return False
    pool = events["caps"] if event == "listed_market_cap" \
        else events["private"]
    for record in pool:
        if abs(record["amount"] - amount) > 0.01 * max(
                record["amount"], amount):
            continue
        if currency and record.get("currency") \
                and currency != record["currency"]:
            continue
        recorded_date = record.get("date") or record.get("observed_on")
        if date and recorded_date:
            if date[:7] != recorded_date[:7]:
                continue
        elif (event != "last_round_post_money"
              or record.get("basis") != event
              or not source or record.get("source") != source):
            continue
        return True
    return False


def _draft_value(item, mention, event, approximate):
    """Draft valuation/listing fact from a news item and one mention."""
    title = item.get("title") or ""
    normalised = mention.get("normalised") or {}
    stage_match = STAGE_RE.search(title)
    stage = None
    if stage_match and event != "listed_market_cap":
        stage = stage_match.group(1)
        stage = stage.lower().replace("series ", "Series ").title() \
            if stage.lower().startswith("series") else stage.title()
        stage = {"Pre-Seed": "Pre-Seed", "Seed": "Seed",
                 "Bridge": "Bridge"}.get(stage, stage)
    exchange = ticker = None
    if event == "listed_market_cap":
        ticker_match = TICKER_RE.search(title)
        if ticker_match:
            exchange = {"NASDAQ": "Nasdaq"}.get(
                ticker_match.group(1), ticker_match.group(1))
            ticker = ticker_match.group(2)
    hint = (item.get("published_hint") or "").strip()
    published = re.match(r"^(\d{4}-\d{2}-\d{2})(?:$|T| )", hint)
    date = None
    if published:
        try:
            date = calendar_date.fromisoformat(published.group(1)).isoformat()
        except ValueError:
            pass  # Crawl time is not evidence of when a valuation occurred.
    return {
        "startup": item.get("startup") or "",
        "amount": normalised.get("value"),
        "currency": normalised.get("currency"),
        "date": date,
        "event": event,
        "stage": stage,
        "exchange": exchange,
        "ticker": ticker,
        "approximate": approximate,
        "source_url": item.get("url") or "",
    }


def produce_value_facts(artifact_dir, data_dir, run):
    """Fact entries: draft valuation/listing facts from news items (#414d).

    The continuous counterpart of the one-off 414c backfill: every
    crawl's news artifact is scanned for the valuation, secondary-sale
    and market-cap figures ``_draft_round`` deliberately skips, and
    each genuinely new one becomes a pending ``fact`` entry carrying a
    ``draft_value`` payload. Facts the evidence stores already hold are
    skipped (see ``_recorded_value_events``); queue-level dedup is
    ``add_entry``'s, as for every producer.
    """
    news = load_artifact(artifact_dir, "news").get("candidates", [])
    recorded = _recorded_value_events(data_dir)
    entries = []
    for item in news:
        title = item.get("title") or ""
        if not title:
            continue
        seen = set()
        for mention in item.get("amount_mentions", []):
            text = mention.get("mention") or ""
            normalised = mention.get("normalised") or {}
            if normalised.get("value") is None or not text:
                continue
            classified = _value_event_for_mention(title, text)
            if classified is None:
                continue
            event, approximate = classified
            draft = _draft_value(item, mention, event, approximate)
            dedup_key = (draft["startup"], event,
                         int(round(draft["amount"])))
            if dedup_key in seen:
                continue
            seen.add(dedup_key)
            startup_id = _latest_value.startup_id_for(draft["startup"]) \
                if _latest_value is not None \
                else f"startup:{slug(draft['startup'])}"
            if _already_recorded(recorded.get(startup_id), event,
                                 draft["amount"], draft["currency"],
                                 draft["date"], draft["source_url"]):
                continue
            month = draft["date"][:7] if draft["date"] else "undated"
            key = f"{slug(draft['startup'])}:value:{slug(event)}" \
                  f":{int(round(draft['amount']))}:{month}"
            entry = _new_entry(
                f"fact:{key}", "fact", f"startup:{slug(draft['startup'])}",
                key, [], [draft["source_url"], item.get("discovered_from")],
                VALUE_CONFIDENCE, run)
            entry["draft_value"] = draft
            entries.append(entry)
    return entries


def _candidate_identity(url):
    """Identity key from a candidate profile URL's last path segment.

    The segment's words with generic name tokens and trailing numeric
    tokens removed, or None when the URL has no usable segment. Variant
    slugs for one company (``foo`` vs ``foo-labs``) collapse to one
    identity; a genuinely different slug (``alloy`` vs ``alloy-index``)
    stays distinct (#487).
    """
    if not url or not isinstance(url, str):
        return None
    try:
        segments = [s for s in urlparse(url).path.split("/") if s]
    except ValueError:
        return None
    if not segments:
        return None
    words = re.findall(r"[a-z0-9]+", unquote(segments[-1]).casefold())
    while words and words[-1].isdigit():
        words.pop()
    words = [w for w in words if w not in GENERIC_NAME_TOKENS]
    return "-".join(words) or None


def _lead_bucket(rows):
    bucket = {"partners": set(), "urls": set(), "evidence": set(),
              "website": ""}
    for row in rows:
        if row.get("partner"):
            bucket["partners"].add(row["partner"])
        if row.get("candidate_url"):
            bucket["urls"].add(row["candidate_url"])
            bucket["website"] = row["candidate_url"]
        for url in (row.get("source_url"), row.get("candidate_url")):
            if url:
                bucket["evidence"].add(url)
    return bucket


def produce_startup_leads(artifact_dir, data_dir, run, exclude_slugs=()):
    """Startup-lead entries: new portfolio-company names, capped at 100.

    Ranked by (distinct partners mentioning it, has a website), then
    name for determinism. Names already in the startup index, or already
    proposed as a merge into a known startup (``exclude_slugs``), are
    not new and are skipped.
    """
    profiles = load_artifact(artifact_dir, "profiles").get("candidates", [])
    research = load_json(Path(data_dir) / "startup-research.json", {}) or {}
    known = {slug(s["name"]) for s in research.get("startups", [])}
    known |= set(exclude_slugs)
    rows_by_name = defaultdict(list)
    for row in profiles:
        if row.get("kind") != "companies":
            continue
        name = (row.get("name") or "").strip()
        # Strip theme headings / description text baked into a card
        # label, keying the lead on the company name only (#462).
        name = clean_lead_name(name, row.get("candidate_url") or "")
        if not name or slug(name) in known:
            continue
        # Theme/category pages are not companies (#460): a name made
        # only of taxonomy words labels a page profiling other firms.
        if is_theme_label(name):
            continue
        rows_by_name[name].append(row)
    # Same-name companies are distinct leads (#487): when one name's
    # mentions carry conflicting candidate-profile identities -- the
    # profile slug a partner itself uses for the company -- split the
    # group per identity instead of merging two companies into one
    # lead (the "Alloy" lead mixed Alloy, formerly Index, via
    # Blackbird's /portfolio/alloy-index with the robot-data company
    # via Square Peg's /portfolio/alloy). A partition whose identity
    # matches the name keeps the plain lead key; any other partition
    # is keyed by its profile identity. Mentions without a usable
    # profile identity stay with the name's own partition.
    grouped = {}
    for name, rows in rows_by_name.items():
        by_identity = defaultdict(list)
        unidentified = []
        for row in rows:
            identity = _candidate_identity(row.get("candidate_url"))
            if identity:
                by_identity[identity].append(row)
            else:
                unidentified.append(row)
        if len(by_identity) <= 1:
            grouped[slug(name)] = _lead_bucket(rows)
            continue
        name_identity = _stripped_slug(name) or slug(name)
        parts = {}
        for identity, part_rows in by_identity.items():
            key = slug(name) if identity == name_identity else identity
            parts.setdefault(key, []).extend(part_rows)
        if unidentified:
            parts.setdefault(slug(name), []).extend(unidentified)
        for key, part_rows in parts.items():
            grouped[key] = _lead_bucket(part_rows)
    # Listing-page artifacts (#460): a subject whose evidence spans
    # many distinct candidate URLs per mentioning partner is a
    # portfolio listing scraped as one "company", not a company.
    grouped = {
        key: bucket for key, bucket in grouped.items()
        if len(bucket["urls"]) <= max(
            LEAD_URL_FLOOR,
            LEAD_MAX_URLS_PER_PARTNER * max(1, len(bucket["partners"])))}
    ranked = sorted(
        grouped.items(),
        key=lambda kv: (-len(kv[1]["partners"]), -bool(kv[1]["website"]),
                        kv[0].lower()))
    entries = []
    for key, bucket in ranked[:STARTUP_LEAD_CAP]:
        confidence = 0.40 + 0.10 * min(len(bucket["partners"]) - 1, 2) \
            + (0.05 if bucket["website"] else 0.0)
        entry = _new_entry(
            f"startup-lead:{key}", "startup-lead",
            f"startup:{key}", key, [],
            sorted(bucket["evidence"]), confidence, run)
        entry["mentions"] = {
            "partners": sorted(bucket["partners"]),
            "website": bucket["website"] or None,
        }
        entries.append(entry)
    return entries


# ------------------------------------------------------------------ summary

def build_summary(queue, added, skipped, run):
    """Human-readable markdown summary of the queue state after a run."""
    by_kind = Counter(e["kind"] for e in queue["entries"])
    by_status = Counter(e["status"] for e in queue["entries"])
    added_by_kind = Counter(e["kind"] for e in added)
    lines = [
        f"# Review queue — run {run}",
        "",
        f"Queue: {len(queue['entries'])} entries "
        f"({dict(sorted(by_kind.items()))})",
        f"Status: {dict(sorted(by_status.items()))}",
        f"Added this run: {len(added)} "
        f"({dict(sorted(added_by_kind.items())) or 'none'}); "
        f"skipped as duplicates/rejected: {skipped}",
        "",
        "## New entries this run",
        "",
    ]
    if not added:
        lines.append("None.")
    for entry in sorted(added, key=lambda e: (e["kind"], e["subject"])):
        lines.append(
            f"- [{entry['kind']}] `{entry['id']}` — {entry['subject']} "
            f"(confidence {entry['confidence']:.2f})")
        if entry["kind"] == "fact" and entry.get("draft_round"):
            draft = entry["draft_round"]
            lines.append(
                f"  - draft round: {draft['startup']} — "
                f"{draft['stage'] or 'stage unknown'} "
                f"{draft['amount']:,.0f} {draft['currency'] or '(currency unknown)'}"
                f" on {draft['date'] or 'date unknown'}")
        if entry["kind"] == "fact" and entry.get("draft_value"):
            draft = entry["draft_value"]
            listing = f" ({draft['exchange']}: {draft['ticker']})" \
                if draft.get("ticker") else ""
            lines.append(
                f"  - draft value: {draft['startup']} — "
                f"{draft['event']}{listing} "
                f"{draft['amount']:,.0f} {draft['currency'] or '(currency unknown)'}"
                f" on {draft['date'] or 'date unknown'}")
        if entry["kind"] == "startup-lead" and entry.get("mentions"):
            mentions = entry["mentions"]
            lines.append(
                f"  - mentioned by {len(mentions['partners'])} partner(s): "
                f"{', '.join(mentions['partners'])}")
    lines.append("")
    lines.append("## Pending by kind")
    lines.append("")
    for kind in sorted(by_kind):
        pending = sum(1 for e in queue["entries"]
                      if e["kind"] == kind and e["status"] == "pending")
        lines.append(f"- {kind}: {pending} pending")
    return "\n".join(lines) + "\n"


# ---------------------------------------------------------------------- CLI

def produce_headshots(artifact_dir, run):
    """Headshot entries: staged portrait candidates from profiles mode.

    A ``professional-bio`` row carrying a ``headshot_candidate`` (the
    profiles-mode binding landed with #354/#406) becomes a queue entry
    whose card shows the image itself. Confidence reflects the staging
    reason: an allowed/same-host candidate scores 0.80; an external
    asset host requiring separate review scores 0.50. Headshots are
    NEVER auto-approved by gating in v1 (see data/review-gating.json) —
    publication stays a human decision in the admin panel.
    """
    profiles = load_artifact(artifact_dir, "profiles").get("candidates", [])
    entries = []
    for row in profiles:
        if row.get("kind") != "professional-bio":
            continue
        candidate = row.get("headshot_candidate") or {}
        url = candidate.get("candidate_url")
        name = (row.get("name") or "").strip()
        if not url or not name:
            continue
        company = row.get("company") or row.get("partner") or ""
        subject_key = f"{slug(company)}:{slug(name)}" if company else slug(name)
        confidence = 0.50 if candidate.get("reason") == \
            "External asset host requires separate review" else 0.80
        entry = _new_entry(
            f"headshot:{subject_key}", "headshot",
            f"person:{slug(name)}", subject_key, [],
            [url, candidate.get("source_url") or row.get("source_url")],
            confidence, run)
        entry["headshot"] = {
            "candidate_url": url,
            "source_url": candidate.get("source_url") or row.get("source_url"),
            "person_name": name,
            "company": company or None,
            "status": candidate.get("status"),
            "reason": candidate.get("reason"),
        }
        entries.append(entry)
    return entries


def build(artifact_dir, run, queue_path, data_dir, summary_path=None):
    """Build/update the queue from one crawl artifact. Returns the queue."""
    queue = load_queue(queue_path)
    merges = produce_merges(artifact_dir, data_dir, run)
    merged_slugs = {e["subject"].split(":", 1)[1] for e in merges
                    if e["subject"].startswith("startup:")}
    producers = [
        merges,
        produce_edges(data_dir, run),
        produce_facts(artifact_dir, run),
        produce_value_facts(artifact_dir, data_dir, run),
        produce_startup_leads(artifact_dir, data_dir, run, merged_slugs),
        produce_headshots(artifact_dir, run),
    ]
    added, skipped = [], 0
    for entries in producers:
        for entry in entries:
            if add_entry(queue, entry):
                added.append(entry)
            else:
                skipped += 1
    # Confidence gating: high-confidence entries proceed automatically;
    # the rest stay pending for the admin panel. Config is the single
    # place thresholds live; a missing config or module means no gating.
    if _review_gating is not None:
        gating_config = load_json(Path(data_dir) / "review-gating.json")
        if gating_config:
            _review_gating.apply_gating(queue, gating_config)
    save_queue(queue, queue_path)
    if summary_path:
        summary = build_summary(queue, added, skipped, run)
        Path(summary_path).write_text(summary, encoding="utf-8")
    return queue, added, skipped


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="Build/update the Startup Atlas review queue.")
    parser.add_argument("--artifact-dir", required=True,
                        help="crawl-review artifact dir (latest-*.json)")
    parser.add_argument("--run", required=True,
                        help="crawl run label recorded on new entries")
    parser.add_argument("--summary-md", default=None,
                        help="write a human-readable markdown summary here")
    parser.add_argument("--queue", default=None,
                        help="queue file (default: data/review-queue.json)")
    parser.add_argument("--data-dir", default=None,
                        help="reviewed data dir (default: data/)")
    parser.add_argument("--identity", default=None,
                        help="identity registry (default: data/identity.json)")
    args = parser.parse_args(argv)
    queue_path = Path(args.queue) if args.queue else ROOT / "data" / "review-queue.json"
    data_dir = Path(args.data_dir) if args.data_dir else ROOT / "data"
    queue, added, skipped = build(args.artifact_dir, args.run, queue_path,
                                  data_dir, args.summary_md)
    counts = Counter(e["kind"] for e in added)
    print(f"run {args.run}: added {len(added)} "
          f"({dict(sorted(counts.items()))}), skipped {skipped} duplicates; "
          f"queue now holds {len(queue['entries'])} entries")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
