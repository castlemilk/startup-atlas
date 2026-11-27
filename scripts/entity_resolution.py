#!/usr/bin/env python3
"""Shared identity / entity resolution for the Startup Atlas knowledge graph.

Design: docs/KG-CONNECTIVE-TISSUE.md section 1.

Canonical IDs keep the existing scheme from scripts/make-graph.py:
``kind:slug(name)`` (``startup:canva``, ``partner:airtree``,
``person:melanie-perkins``). ``slug()`` is imported from make-graph.py so
the normalisation never drifts between the two modules.

Identity keys (the join key per kind):

- Startup / partner / provider: normalised website host (lowercase, strip
  ``www.``, strip trailing dot). No website means no identity key.
- Person: normalised LinkedIn URL (``linkedin.com/in/<slug>``, lowercase
  host, query params and trailing slash stripped). Otherwise the person
  stays scoped per partner (``person:<slug>--<partner>``), as today.
  The URL is read from the person row's recorded ``linkedin`` field
  first, then its ``socials``, then (founders only, legacy) a
  ``profile_url`` that is itself a LinkedIn profile URL — see
  :func:`_person_linkedin` and docs/PERSON-IDENTITY.md.

Matching thresholds (from the design):

- auto-merge >= 0.90, and ONLY with a shared identity key (website host
  or LinkedIn URL) AND equivalent names (token sets equal once legal
  suffixes are dropped). Name similarity alone never auto-merges, and
  a shared key alone does not auto-merge either: distinct entities can
  share one host — a subsidiary on its parent's domain, a programme on
  its firm's domain — so a shared key with non-equivalent names is a
  review-band proposal (basis ``shared-key-name-mismatch``), never a
  merge. See :func:`match_candidates`.
- review band 0.65-0.90 -> the validation queue.
- below 0.65 -> no proposal.

An entry with no website and no LinkedIn gets
``identity_basis: "name-only"`` and ``identity_key: null``: the canonical
ID (``kind:slug(name)``) is its only identifier, and it is never treated
as a shared identity key, so a name-only entry can never auto-merge.

Review-queue replay: :func:`build_registry` applies APPROVED merge
decisions from ``data/review-queue.json`` on top of the seed (see
:func:`replay_queue_decisions`), so a human decision recorded in the
queue is part of the registry — and therefore of the graph — every
time the registry is regenerated. Rejected and pending entries change
nothing. Replay is deterministic and idempotent: entries are applied
in sorted order with the entry's own ``decided_at`` / ``decided_by``,
never the wall clock.

Unmerge replay (#68, DATA-02: a merge is reversible): recorded
unmerges in ``data/identity-unmerges.json`` replay last (see
:func:`replay_unmerges`), reversing a seeded or queue merge exactly —
the merge record is removed, the winner's ``merged_from`` loses the
entry, and only the aliases that merge added to the winner are
removed (``apply_merge`` records them as ``aliases_added`` for this
purpose). The reversal itself is kept in the registry's top-level
``unmerges[]`` list with the original merge's decider and date, so
the audit trail survives even though the merge is gone. Record a new
unmerge with ``record_unmerge`` or the ``unmerge`` CLI subcommand;
the pair then stays split across every regeneration until the log
entry is removed.
"""
import argparse
import difflib
import json
import re
import subprocess
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]

# Reuse make-graph.py's slug() so canonical IDs never drift. Loaded via
# importlib because scripts/ is not a package (same pattern as the tests).
import importlib.util

def _load_make_graph():
    spec = importlib.util.spec_from_file_location(
        'atlas_make_graph', ROOT / 'scripts' / 'make-graph.py')
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod

slug = _load_make_graph().slug

REGISTRY_VERSION = 1
AUTO_MERGE_THRESHOLD = 0.90
REVIEW_MIN_SCORE = 0.65
# A score without a shared identity key is capped below the auto-merge
# threshold: name similarity alone can propose, never merge.
NAME_ONLY_SCORE_CAP = 0.89
# A shared identity key whose names are NOT equivalent (a subsidiary
# on its parent's host, a programme on its firm's host, a person whose
# name changed on the same LinkedIn) scores below the review gate's
# merge auto-approve threshold (0.88 in data/review-gating.json) as
# well as below AUTO_MERGE_THRESHOLD, with a basis that carries no
# identity-key marker: the pair is proposed for human review and can
# never be auto-decided by either path.
SHARED_KEY_NAME_MISMATCH_SCORE = 0.87
# Corporate-form tokens that do not distinguish one entity from
# another: "Canva" and "Canva Pty Ltd" are the same name for identity
# purposes. Descriptive tokens ("Labs", "Health", "Accelerator",
# "Ventures") DO distinguish, so they are deliberately absent.
LEGAL_NAME_TOKENS = frozenset({
    'pty', 'ltd', 'limited', 'inc', 'llc', 'plc', 'gmbh', 'co',
    'company', 'corp', 'corporation', 'the',
})


def _utcnow():
    return datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


def normalise_host(value):
    """Normalise a website URL or bare host to a joinable host key.

    Lowercases, strips a leading ``www.``, strips a trailing dot, and
    drops any path, query, fragment, port or userinfo. Returns ``''``
    for an empty/unparseable value.
    """
    if not value:
        return ''
    text = str(value).strip().lower()
    if '://' not in text:
        text = 'https://' + text
    try:
        host = urlparse(text).hostname or ''
    except ValueError:
        host = ''
    if host.startswith('www.'):
        host = host[4:]
    return host.rstrip('.')


def normalise_linkedin(value):
    """Normalise a LinkedIn profile URL to ``linkedin.com/in/<slug>``.

    Lowercases the host, strips query params and trailing slash, and
    collapses locale subdomains (``au.linkedin.com`` -> ``linkedin.com``).
    Returns ``''`` when the value is not a LinkedIn ``/in/`` profile URL.
    """
    if not value:
        return ''
    text = str(value).strip()
    if '://' not in text:
        text = 'https://' + text
    try:
        parsed = urlparse(text)
    except ValueError:
        return ''
    host = (parsed.hostname or '').lower()
    if host.startswith('www.'):
        host = host[4:]
    # Locale subdomains (au., uk., ...) are the same LinkedIn.
    if host.endswith('.linkedin.com'):
        host = 'linkedin.com'
    if host != 'linkedin.com':
        return ''
    path = parsed.path.strip('/').lower()
    match = re.match(r'in/([a-z0-9][a-z0-9\-]*)$', path)
    if not match:
        return ''
    return 'linkedin.com/in/' + match.group(1)


def identity_key_for(kind, website=None, linkedin_url=None):
    """Return ``(identity_key, identity_basis)`` for one entity.

    Persons resolve on their LinkedIn URL; every other kind resolves on
    its website host. With neither, the basis is ``"name-only"`` and the
    key is ``None`` (see the module docstring).
    """
    if kind == 'person':
        key = normalise_linkedin(linkedin_url) if linkedin_url else ''
        if key:
            return key, 'linkedin-url'
        return None, 'name-only'
    key = normalise_host(website) if website else ''
    if key:
        return key, 'website-host'
    return None, 'name-only'


def _name_tokens(name):
    return set(slug(name).split('-')) - {''}


def names_equivalent(a, b):
    """True when two names are the same entity name for identity use.

    Token sets must be equal once corporate-form tokens
    (:data:`LEGAL_NAME_TOKENS`) are dropped, and non-empty — with one
    person-name allowance: a single-letter token may stand for the
    full token it initialises ("J Example" vs "Jane Example", the
    #366 cross-firm spelling variant). Anything else — an extra
    descriptive token ("Acme Health" vs "Acme Labs", "Acme
    Accelerator" vs "Acme"), a changed token, a name change on the
    same LinkedIn — is a different name, however strong the other
    evidence is.
    """
    tokens_a = _name_tokens(a) - LEGAL_NAME_TOKENS
    tokens_b = _name_tokens(b) - LEGAL_NAME_TOKENS
    if not tokens_a or not tokens_b:
        return False
    if tokens_a == tokens_b:
        return True
    if len(tokens_a) != len(tokens_b):
        return False
    unmatched = list(tokens_b)
    for token in sorted(tokens_a):
        hit = next((other for other in unmatched
                    if other == token
                    or (len(token) == 1 and other.startswith(token))
                    or (len(other) == 1 and token.startswith(other))),
                   None)
        if hit is None:
            return False
        unmatched.remove(hit)
    return True


def name_similarity(a, b):
    """Token-based name similarity in [0, 1].

    The max of token Jaccard, token containment (one name's tokens fully
    inside the other's, e.g. ``Canva`` vs ``Canva Pty Ltd``), and a
    character-level ratio on the slugs (catches ``LaunchVic`` vs
    ``Launch Vic``). Similarity alone never auto-merges; it only feeds
    the review band, so erring towards proposing is the safe direction.
    """
    tokens_a, tokens_b = _name_tokens(a), _name_tokens(b)
    if not tokens_a or not tokens_b:
        return 0.0
    shared = tokens_a & tokens_b
    jaccard = len(shared) / len(tokens_a | tokens_b)
    containment = len(shared) / min(len(tokens_a), len(tokens_b))
    char_ratio = difflib.SequenceMatcher(None, slug(a), slug(b)).ratio()
    return max(jaccard, containment, 0.85 * char_ratio)


def match_candidates(name, identity_key, kind, registry):
    """Return scored merge candidates for one entity, best first.

    ``identity_key`` is the entity's own key (a website host for
    startups/partners/providers, a LinkedIn URL for people); it is
    normalised here, so callers may pass a raw URL. ``registry`` is a
    registry dict as produced by :func:`build_registry` (or loaded from
    ``data/identity.json``).

    Each candidate is ``{"id", "name", "score", "basis", "identity_key",
    "auto_merge"}``. Only candidates scoring >= 0.65 are returned. An
    exact identity-key match with an equivalent name (see
    :func:`names_equivalent`) scores 1.0 and is the only route to
    ``auto_merge``. A shared key with a non-equivalent name — a
    subsidiary or programme sharing its parent/firm host, a person
    whose name changed on the same LinkedIn — is a distinct entity
    until a human says otherwise: it is proposed at
    :data:`SHARED_KEY_NAME_MISMATCH_SCORE` with basis
    ``shared-key-name-mismatch`` and ``auto_merge`` False. Anything
    else is capped at 0.89.
    """
    if kind == 'person':
        own_key = normalise_linkedin(identity_key) if identity_key else ''
    else:
        own_key = normalise_host(identity_key) if identity_key else ''
    entities = registry.get('entities', {})
    results = []
    for entity_id, entity in entities.items():
        if entity.get('kind') != kind:
            continue
        other_key = entity.get('identity_key') or ''
        # A shared identity key is an exact key match between two
        # entries that both actually have one. Name-only entries have
        # identity_key None, so they can never match this way.
        shared_key = bool(own_key and other_key and own_key == other_key)
        if shared_key and names_equivalent(name, entity.get('name', '')):
            results.append({'id': entity_id, 'name': entity.get('name', ''),
                            'score': 1.0, 'basis': 'identity-key',
                            'identity_key': other_key, 'auto_merge': True})
            continue
        if shared_key:
            # Same host/LinkedIn, different name: a subsidiary on its
            # parent's domain, a programme on its firm's domain, or a
            # person whose name changed. Distinct entities that happen
            # to share a key — propose for review, never auto-merge,
            # and keep the score and basis clear of the review gate's
            # merge auto-approve rule.
            results.append({'id': entity_id, 'name': entity.get('name', ''),
                            'score': SHARED_KEY_NAME_MISMATCH_SCORE,
                            'basis': 'shared-key-name-mismatch',
                            'identity_key': other_key, 'auto_merge': False})
            continue
        score = name_similarity(name, entity.get('name', ''))
        # Host bonus: same registrable domain under a different
        # subdomain (e.g. blog.example.com vs example.com) is weak
        # evidence — a nudge inside the review band, never a merge.
        if own_key and other_key:
            own_parts, other_parts = own_key.split('.'), other_key.split('.')
            if len(own_parts) >= 2 and len(other_parts) >= 2 \
                    and own_parts[-2:] == other_parts[-2:]:
                score = min(NAME_ONLY_SCORE_CAP, score + 0.10)
        score = min(score, NAME_ONLY_SCORE_CAP)
        if score >= REVIEW_MIN_SCORE:
            results.append({'id': entity_id, 'name': entity.get('name', ''),
                            'score': round(score, 2),
                            'basis': 'name-similarity',
                            'identity_key': other_key or None,
                            'auto_merge': False})
    results.sort(key=lambda c: (-c['score'], c['id']))
    return results


def apply_merge(registry, from_id, to_id, basis, decided_by, decided_at=None):
    """Record a merge of ``from_id`` into ``to_id``.

    Writes the record in both places the design requires: the canonical
    entity's ``entities[to_id]["merged_from"]`` and the top-level
    ``merges[]`` list. The losing entity is kept and marked with
    ``merged_into`` so the graph builder can resolve old edges to the
    winner. The winner inherits the loser's aliases. Raises ``ValueError``
    on unknown IDs, a self-merge, or merging an already-merged entity.

    The aliases this merge actually adds to the winner (the loser's
    name when it differs, plus any loser aliases the winner did not
    already carry) are recorded on the merge record as
    ``aliases_added`` — omitted when empty — so :func:`apply_unmerge`
    can reverse the merge exactly, removing only what it added.
    """
    entities = registry.setdefault('entities', {})
    merges = registry.setdefault('merges', [])
    if from_id not in entities:
        raise ValueError(f'Unknown merge source: {from_id!r}')
    if to_id not in entities:
        raise ValueError(f'Unknown merge target: {to_id!r}')
    if from_id == to_id:
        raise ValueError('Cannot merge an entity into itself')
    if entities[from_id].get('merged_into'):
        raise ValueError(
            f'{from_id!r} already merged into {entities[from_id]["merged_into"]!r}')
    if any(m['from'] == from_id for m in merges):
        raise ValueError(f'{from_id!r} already has a recorded merge')
    decided_at = decided_at or _utcnow()
    winner = entities[to_id]
    loser = entities[from_id]
    aliases_added = []
    loser_name = loser.get('name', '')
    if loser_name and loser_name.casefold() != winner.get('name', '').casefold():
        if loser_name not in winner.setdefault('aliases', []):
            winner['aliases'].append(loser_name)
            aliases_added.append(loser_name)
    for alias in loser.get('aliases', []):
        if alias not in winner.setdefault('aliases', []):
            winner['aliases'].append(alias)
            aliases_added.append(alias)
    if from_id not in winner.setdefault('merged_from', []):
        winner['merged_from'].append(from_id)
    winner['updated_at'] = decided_at
    loser['merged_into'] = to_id
    loser['updated_at'] = decided_at
    record = {'from': from_id, 'to': to_id, 'basis': basis,
              'decided_by': decided_by, 'decided_at': decided_at}
    if aliases_added:
        record['aliases_added'] = aliases_added
    merges.append(record)
    merges.sort(key=lambda m: (m['from'], m['to']))
    return registry


def apply_unmerge(registry, from_id, decided_by, decided_at=None,
                  reason=None):
    """Reverse the recorded merge of ``from_id`` (#68: merges are
    reversible).

    Undoes :func:`apply_merge` exactly: the merge record leaves
    ``merges[]``, ``from_id`` leaves the winner's ``merged_from``, the
    loser's ``merged_into`` is cleared, and the winner's aliases lose
    precisely the aliases the merge added (the record's
    ``aliases_added``). Merge records written before ``aliases_added``
    existed fall back to the aliases :func:`apply_merge` would have
    added — the loser's name when it differs from the winner's, plus
    the loser's aliases — which is exact unless the winner carried
    one of them independently before the merge. The reversal is
    appended to the top-level ``unmerges[]`` audit list with the
    original merge's basis, decider and date, so the audit trail is
    preserved even though the merge is gone. The loser entity itself
    was never deleted, so its claims, assets and relations are
    untouched. Raises ``ValueError`` on an unknown ID or when
    ``from_id`` has no recorded merge.
    """
    entities = registry.setdefault('entities', {})
    merges = registry.setdefault('merges', [])
    unmerges = registry.setdefault('unmerges', [])
    if from_id not in entities:
        raise ValueError(f'Unknown unmerge source: {from_id!r}')
    record = next((m for m in merges if m['from'] == from_id), None)
    if record is None:
        raise ValueError(f'{from_id!r} has no recorded merge to reverse')
    to_id = record['to']
    loser = entities[from_id]
    if loser.get('merged_into') != to_id:
        raise ValueError(
            f'{from_id!r} is not merged into {to_id!r} '
            f'(merged_into: {loser.get("merged_into")!r})')
    if to_id not in entities:
        raise ValueError(f'Unknown merge target: {to_id!r}')
    winner = entities[to_id]
    decided_at = decided_at or _utcnow()
    if 'aliases_added' in record:
        added = record['aliases_added']
    else:
        added = []
        loser_name = loser.get('name', '')
        if (loser_name
                and loser_name.casefold() != winner.get('name', '').casefold()):
            added.append(loser_name)
        added.extend(loser.get('aliases', []))
    for alias in added:
        if alias in winner.get('aliases', []):
            winner['aliases'].remove(alias)
    if from_id in winner.get('merged_from', []):
        winner['merged_from'].remove(from_id)
    winner['updated_at'] = decided_at
    del loser['merged_into']
    loser['updated_at'] = decided_at
    merges.remove(record)
    audit = {'from': from_id, 'to': to_id, 'basis': record.get('basis'),
             'merge_decided_by': record.get('decided_by'),
             'merge_decided_at': record.get('decided_at'),
             'decided_by': decided_by, 'decided_at': decided_at}
    if reason:
        audit['reason'] = reason
    unmerges.append(audit)
    unmerges.sort(key=lambda u: (u['from'], u['to'], u['decided_at']))
    return registry


def resolve_canonical_id(registry, entity_id):
    """Follow ``merged_into`` links to the canonical winner of an ID.

    Returns ``entity_id`` unchanged when it is not merged. Follows
    chains (A -> B -> C) and raises ``ValueError`` on a merge cycle.
    """
    entities = registry.get('entities', {})
    seen = set()
    current = entity_id
    while current in entities and entities[current].get('merged_into'):
        if current in seen:
            raise ValueError(f'Merge cycle at {current!r}')
        seen.add(current)
        current = entities[current]['merged_into']
    return current


def _add_entity(entities, kind, name, identity_key, identity_basis,
                aliases=None, updated_at=None):
    entity_id = f'{kind}:{slug(name)}'
    if not slug(name):
        raise ValueError(f'Empty entity identity: {name!r}')
    existing = entities.get(entity_id)
    if existing is not None:
        if existing['name'].casefold() != name.casefold():
            raise ValueError(
                f'Ambiguous entity slug: {existing["name"]!r}, {name!r}')
        # A stronger identity basis replaces a weaker one (a website
        # found later beats an earlier name-only seed); a weaker one
        # never overwrites a stronger one.
        strength = {'name-only': 0, 'website-host': 1, 'linkedin-url': 1}
        if strength[identity_basis] > strength[existing['identity_basis']]:
            existing['identity_key'] = identity_key
            existing['identity_basis'] = identity_basis
        for alias in (aliases or []):
            if alias not in existing['aliases']:
                existing['aliases'].append(alias)
        existing['updated_at'] = updated_at or existing['updated_at']
        return entity_id
    entities[entity_id] = {
        'name': name,
        'kind': kind,
        'aliases': list(aliases or []),
        'identity_key': identity_key,
        'identity_basis': identity_basis,
        'merged_from': [],
        'updated_at': updated_at or _utcnow(),
    }
    return entity_id


def _linkedin_from_socials(socials):
    for social in socials or []:
        url = social.get('url', '') if isinstance(social, dict) else ''
        if normalise_linkedin(url):
            return url
    return None


def _person_linkedin(row):
    """Return the LinkedIn profile URL recorded on a person row.

    Sources are tried in a fixed precedence order and the first one
    that normalises to a valid ``linkedin.com/in/<slug>`` key wins
    (docs/PERSON-IDENTITY.md):

    1. the row's explicit ``linkedin`` field — the reviewed identity
       assertion, recorded first-class so the join does not depend on
       incidental fields;
    2. a LinkedIn entry in the row's ``socials``;
    3. the row's ``profile_url``, when it is itself a LinkedIn profile
       URL (legacy: the first founders were keyed this way before the
       explicit field existed).

    A present-but-invalid value never masks a valid later source, and
    a non-LinkedIn ``profile_url`` (a bio page) yields nothing.
    Returns ``None`` when no source yields a key.
    """
    for candidate in (row.get('linkedin'),
                      _linkedin_from_socials(row.get('socials')),
                      row.get('profile_url')):
        if candidate and normalise_linkedin(candidate):
            return candidate
    return None


def _git_revision():
    try:
        out = subprocess.run(
            ['git', 'rev-parse', '--short', 'HEAD'], cwd=ROOT,
            capture_output=True, text=True, timeout=10)
        if out.returncode == 0:
            return out.stdout.strip()
    except (OSError, subprocess.SubprocessError):
        pass
    return None


def _ensure_registry_entity(entities, entity_id, subject_key=None,
                            updated_at=None):
    """Add a minimal registry entry for ``entity_id`` when missing.

    Mirrors ``build-review-queue.py``'s ``_ensure_merge_entities`` (the
    writer ``decide()`` uses when an approved merge names an entity the
    seed never produced — a crawl candidate, by construction). Nothing
    is invented beyond the name carried by the ID's slug and the key
    the queue entry itself carries: a LinkedIn subject key stays a
    LinkedIn key, a host-like subject key stays a website key, anything
    else is ``name-only``.
    """
    if entity_id in entities:
        return entity_id
    kind, name_slug = entity_id.split(':', 1)
    key, basis = None, 'name-only'
    if subject_key:
        if subject_key.startswith('linkedin.com/in/'):
            key, basis = subject_key, 'linkedin-url'
        elif '.' in subject_key and ' ' not in subject_key:
            key = normalise_host(subject_key)
            basis = 'website-host' if key else 'name-only'
            key = key or None
    entities[entity_id] = {
        'name': name_slug.replace('-', ' ').title(),
        'kind': kind, 'aliases': [], 'identity_key': key,
        'identity_basis': basis, 'merged_from': [],
        'updated_at': updated_at or _utcnow()}
    return entity_id


def replay_queue_decisions(registry, data_dir, queue_path=None):
    """Replay APPROVED review-queue merge decisions into ``registry``.

    Reads ``review-queue.json`` from ``data_dir`` (or ``queue_path``)
    when it exists. Every ``merge`` entry with ``status ==
    "approved"`` and at least one candidate is applied, in sorted
    ``(subject, candidate)`` order, via :func:`apply_merge` with the
    entry's recorded ``decided_by`` / ``decided_at`` and the
    candidate's basis — so the registry carries the decision exactly
    as the queue recorded it, and regenerating twice produces
    identical output. A subject the seed never produced is first
    added as a minimal entry (see :func:`_ensure_registry_entity`),
    matching what ``decide()`` writes when it applies a merge
    directly. Rejected and pending entries, and approved entries of
    other kinds (facts, edges — applied by the MCP write path, not
    the registry), change nothing. A decision whose subject is
    already merged, or whose target resolves back to the subject, is
    skipped rather than raising: replay must never fail a build.
    """
    data_dir = Path(data_dir)
    queue_path = Path(queue_path) if queue_path else data_dir / 'review-queue.json'
    if not queue_path.is_file():
        return registry
    queue = json.loads(queue_path.read_text(encoding='utf-8'))
    approved = []
    for entry in queue.get('entries', []):
        if entry.get('kind') != 'merge' or entry.get('status') != 'approved':
            continue
        candidates = entry.get('candidates') or []
        if not candidates or not candidates[0].get('id'):
            continue
        approved.append(entry)
    approved.sort(key=lambda e: (e['subject'], e['candidates'][0]['id']))
    entities = registry.setdefault('entities', {})
    for entry in approved:
        from_id = entry['subject']
        candidate = entry['candidates'][0]
        decided_at = entry.get('decided_at') or registry.get('generated_at')
        _ensure_registry_entity(entities, from_id,
                                entry.get('subject_key'),
                                updated_at=decided_at)
        _ensure_registry_entity(entities, candidate['id'],
                                updated_at=decided_at)
        if entities[from_id].get('merged_into'):
            continue  # already merged (seed or an earlier replay entry)
        to_id = resolve_canonical_id(registry, candidate['id'])
        if to_id == from_id:
            continue
        apply_merge(registry, from_id, to_id,
                    basis=candidate.get('basis') or 'review-queue',
                    decided_by=entry.get('decided_by') or 'review-queue',
                    decided_at=decided_at)
    return registry


UNMERGES_FILENAME = 'identity-unmerges.json'


def load_unmerges(data_dir, unmerges_path=None):
    """Read the recorded unmerges from ``data/identity-unmerges.json``.

    Returns the ``unmerges`` list (empty when the file does not exist
    yet — no unmerge has ever been recorded).
    """
    data_dir = Path(data_dir)
    path = (Path(unmerges_path) if unmerges_path
            else data_dir / UNMERGES_FILENAME)
    if not path.is_file():
        return []
    payload = json.loads(path.read_text(encoding='utf-8'))
    return list(payload.get('unmerges', []))


def replay_unmerges(registry, data_dir, unmerges_path=None):
    """Replay recorded unmerges into ``registry``, reversing merges.

    Reads ``identity-unmerges.json`` from ``data_dir`` (or
    ``unmerges_path``) when it exists and applies each record, in
    ``(decided_at, from, to)`` order, via :func:`apply_unmerge` with
    the record's own ``decided_by`` / ``decided_at`` / ``reason`` — so
    a reversed pair stays split every time the registry is
    regenerated, exactly as approved queue merges stay merged. A
    record whose pair is not currently merged into the recorded
    target (already reversed, or never merged) is skipped rather
    than raising: replay must never fail a build.
    """
    records = load_unmerges(data_dir, unmerges_path=unmerges_path)
    records.sort(key=lambda r: (r.get('decided_at') or '', r['from'],
                                r['to']))
    registry.setdefault('unmerges', [])
    entities = registry.setdefault('entities', {})
    for record in records:
        from_id, to_id = record['from'], record['to']
        if entities.get(from_id, {}).get('merged_into') != to_id:
            continue  # not merged into that target; nothing to reverse
        apply_unmerge(registry, from_id,
                      decided_by=record.get('decided_by') or 'unmerge-log',
                      decided_at=record.get('decided_at'),
                      reason=record.get('reason'))
    return registry


def record_unmerge(data_dir, from_id, to_id, decided_by, reason=None,
                   decided_at=None):
    """Append an unmerge record to ``data/identity-unmerges.json``.

    This is the durable half of an unmerge: once recorded, every
    registry regeneration replays it (see :func:`replay_unmerges`)
    and the pair stays split. Creates the log file when missing.
    Raises ``ValueError`` when the same pair is already recorded.
    Returns the record written. Regenerate the registry afterwards
    (``python3 scripts/entity_resolution.py``) to apply it.
    """
    data_dir = Path(data_dir)
    path = data_dir / UNMERGES_FILENAME
    if path.is_file():
        payload = json.loads(path.read_text(encoding='utf-8'))
    else:
        payload = {'version': 1, 'unmerges': []}
    records = payload.setdefault('unmerges', [])
    if any(r['from'] == from_id and r['to'] == to_id for r in records):
        raise ValueError(
            f'Unmerge already recorded: {from_id!r} -/-> {to_id!r}')
    record = {'from': from_id, 'to': to_id, 'decided_by': decided_by,
              'decided_at': decided_at or _utcnow()}
    if reason:
        record['reason'] = reason
    records.append(record)
    records.sort(key=lambda r: (r.get('decided_at') or '', r['from'],
                                r['to']))
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + '\n',
        encoding='utf-8')
    return record


def build_registry(data_dir=None, source_revision=None, generated_at=None):
    """Seed the identity registry from the reviewed files on disk.

    Reads ``partner-leads.json``, ``partners-reviewed.json``,
    ``partner-profiles.json`` and ``startup-research.json`` from
    ``data_dir`` (default ``<repo>/data``). Nothing is invented: an
    entry with no website and no LinkedIn is seeded ``name-only`` and
    is never auto-merged. A person's LinkedIn URL is read from the
    row's recorded ``linkedin`` field, its ``socials``, or a LinkedIn
    ``profile_url`` (see :func:`_person_linkedin`). Merges are
    recorded only for exact
    identity-key matches found in this reviewed data — a LinkedIn URL
    shared by a scoped profile person (``person:<slug>--<partner>``)
    and a canonical person entry — plus the APPROVED merge decisions
    replayed from ``review-queue.json`` in the same data directory
    (see :func:`replay_queue_decisions`), minus any merge reversed by
    the unmerges recorded in ``identity-unmerges.json`` in the same
    directory (see :func:`replay_unmerges`).
    """
    data_dir = Path(data_dir) if data_dir else ROOT / 'data'
    now = generated_at or _utcnow()

    def load(name):
        return json.loads((data_dir / name).read_text(encoding='utf-8'))

    leads = load('partner-leads.json')
    reviewed = load('partners-reviewed.json')
    profiles = load('partner-profiles.json')
    research = load('startup-research.json')

    entities = {}
    registry = {'version': REGISTRY_VERSION,
                'generated_at': now,
                'source_revision': source_revision or _git_revision(),
                'entities': entities, 'merges': [], 'unmerges': []}

    # Partners: every lead is seeded; reviewed records supply the
    # website host and any reviewed ``aliases`` (names a partner is
    # also known by — e.g. a crawl candidate that turned out to be
    # this firm — recorded so future crawls resolve to this entity
    # instead of re-proposing a merge). Unreviewed leads have no
    # website on file, so they are name-only and can never auto-merge.
    for name in leads:
        record = reviewed.get(name, {})
        key, basis = identity_key_for('partner', website=record.get('website'))
        _add_entity(entities, 'partner', name, key, basis,
                    aliases=record.get('aliases'), updated_at=now)
    # Reviewed partners not in the leads list (none today, but the
    # seed must not silently drop a reviewed record).
    for name, record in reviewed.items():
        if name not in leads:
            key, basis = identity_key_for(
                'partner', website=record.get('website'))
            _add_entity(entities, 'partner', name, key, basis,
                        aliases=record.get('aliases'), updated_at=now)

    # Startups from research first: their websites give the host key,
    # so profile-company rows below enrich rather than duplicate them.
    for startup in research.get('startups', []):
        key, basis = identity_key_for(
            'startup', website=startup.get('website'))
        _add_entity(entities, 'startup', startup['name'], key, basis,
                    updated_at=now)
        for founder in startup.get('founders', []):
            linkedin = _person_linkedin(founder)
            key, basis = identity_key_for(
                'person', linkedin_url=linkedin)
            _add_entity(entities, 'person', founder['name'], key, basis,
                        updated_at=now)

    # Partner profiles: people (scoped per partner unless a LinkedIn
    # URL reconciles them), portfolio companies, and sponsors.
    for partner, profile in profiles.items():
        if f'partner:{slug(partner)}' not in entities:
            _add_entity(entities, 'partner', partner, None, 'name-only',
                        updated_at=now)
        for person in profile.get('people', []):
            linkedin = _person_linkedin(person)
            scoped_id = f'person:{slug(person["name"])}--{slug(partner)}'
            if linkedin:
                key, basis = identity_key_for('person', linkedin_url=linkedin)
                # Canonical (unscoped) entry keyed on the LinkedIn URL.
                _add_entity(entities, 'person', person['name'], key, basis,
                            updated_at=now)
                canonical_id = f'person:{slug(person["name"])}'
                # Scoped entry, kept so old edges resolve, then merged
                # into the canonical entry on the shared LinkedIn URL.
                if scoped_id not in entities:
                    entities[scoped_id] = {
                        'name': person['name'], 'kind': 'person',
                        'aliases': [], 'identity_key': key,
                        'identity_basis': basis, 'merged_from': [],
                        'updated_at': now}
                apply_merge(registry, scoped_id, canonical_id,
                            basis='linkedin-url',
                            decided_by='seed:reviewed-data',
                            decided_at=now)
            else:
                if scoped_id not in entities:
                    entities[scoped_id] = {
                        'name': person['name'], 'kind': 'person',
                        'aliases': [], 'identity_key': None,
                        'identity_basis': 'name-only', 'merged_from': [],
                        'updated_at': now}
        for company in profile.get('companies', []):
            company_id = f'startup:{slug(company["name"])}'
            if company_id not in entities:
                _add_entity(entities, 'startup', company['name'], None,
                            'name-only', updated_at=now)
        for sponsor in profile.get('sponsors', []):
            sponsor_id = f'provider:{slug(sponsor["name"])}'
            if sponsor_id not in entities:
                key, basis = identity_key_for(
                    'provider', website=sponsor.get('website'))
                _add_entity(entities, 'provider', sponsor['name'], key,
                            basis, updated_at=now)

    # Human decisions last: approved review-queue merges replay on
    # top of the seed, so they survive every regeneration.
    replay_queue_decisions(registry, data_dir)

    # Recorded unmerges replay after every merge source, so a
    # reversed pair stays split no matter which path merged it.
    replay_unmerges(registry, data_dir)

    # Do not replay aliases from the generated registry: they may have
    # been inherited from a merge that has since been reversed.

    registry['entities'] = dict(sorted(entities.items()))
    registry['merges'] = sorted(registry['merges'],
                                key=lambda m: (m['from'], m['to']))
    registry['unmerges'] = sorted(
        registry['unmerges'],
        key=lambda u: (u['from'], u['to'], u['decided_at']))
    return registry


def load_registry(path=None):
    """Load a registry dict from ``data/identity.json`` (default)."""
    path = Path(path) if path else ROOT / 'data' / 'identity.json'
    return json.loads(path.read_text(encoding='utf-8'))


def main(argv=None):
    parser = argparse.ArgumentParser(
        prog='entity_resolution.py',
        description='Regenerate data/identity.json from the reviewed '
                    'data files.')
    subparsers = parser.add_subparsers(dest='command')
    unmerge_parser = subparsers.add_parser(
        'unmerge',
        help='Record an unmerge in data/identity-unmerges.json and '
             'regenerate the registry with the pair split.')
    unmerge_parser.add_argument('from_id',
                                help='The merged-away entity ID to restore')
    unmerge_parser.add_argument('to_id',
                                help='The entity ID it was merged into')
    unmerge_parser.add_argument('--by', required=True,
                                help='Who decided the unmerge')
    unmerge_parser.add_argument('--reason', default=None,
                                help='Why the merge was wrong (audit trail)')
    args = parser.parse_args(argv)
    if args.command == 'unmerge':
        record = record_unmerge(ROOT / 'data', args.from_id, args.to_id,
                                decided_by=args.by, reason=args.reason)
        print(f"Recorded unmerge {record['from']} -/-> {record['to']} "
              f"in {ROOT / 'data' / UNMERGES_FILENAME}")
    registry = build_registry()
    target = ROOT / 'data' / 'identity.json'
    target.write_text(
        json.dumps(registry, ensure_ascii=False, indent=2) + '\n',
        encoding='utf-8')
    by_kind = {}
    for entity in registry['entities'].values():
        by_kind[entity['kind']] = by_kind.get(entity['kind'], 0) + 1
    name_only = sum(1 for e in registry['entities'].values()
                    if e['identity_basis'] == 'name-only')
    print(f"Identity registry: {len(registry['entities'])} entities "
          f"({by_kind}), {len(registry['merges'])} merges, "
          f"{len(registry['unmerges'])} unmerges, "
          f"{name_only} name-only")
    print(f"Wrote {target}")


if __name__ == '__main__':
    main()
