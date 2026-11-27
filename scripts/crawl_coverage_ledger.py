#!/usr/bin/env python3
"""Write a per-run collection-coverage ledger for one crawl run (#89).

This module adapts the crawler's in-memory result rows to the offline
``scripts/collection_coverage.py`` Ledger contract. It is the wiring that
``collection_coverage``'s integration note anticipated: the ledger is
written only when the crawler is passed ``--coverage-ledger PATH``; it
stays opt-in, per-run and offline, and it never feeds back into the
crawl itself.

Population semantics are deliberately narrow: each scope's exact
population is *the set of entities this run attempted on one host*, not
the source's whole universe. A ``complete`` checkpoint therefore means
"every entity this run set out to fetch on that host was retrieved",
never "the host has been fully enumerated".

Snapshot kind is ``built``: the ledger describes a snapshot the crawler
has just built locally; it asserts nothing about a commit or a
publication.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
import hashlib
import json
from pathlib import Path
import re
import sys

try:
    from scripts import collection_coverage as _coverage
except ImportError:  # run as scripts/crawl.py: scripts/ is on sys.path
    try:
        import collection_coverage as _coverage
    except ImportError:
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        import collection_coverage as _coverage

Ledger = _coverage.Ledger
MANUAL_FAILURES = _coverage.MANUAL_FAILURES
MAX_EVENTS = _coverage.MAX_EVENTS
MAX_ITEMS = _coverage.MAX_ITEMS
MAX_SCOPES = _coverage.MAX_SCOPES

_TIME_FORMAT = "%Y-%m-%dT%H:%M:%SZ"
_RETRIEVED_ROW_STATUSES = frozenset({"ok", "candidates", "no_matches"})
_RATE_LIMIT_DELAY_SECONDS = 3600


def _canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"),
                      ensure_ascii=False, allow_nan=False, default=str)


def _sha256(value):
    text = value if isinstance(value, str) else _canonical(value)
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _parse_time(value):
    return datetime.strptime(value, _TIME_FORMAT).replace(tzinfo=timezone.utc)


def _format_time(value):
    return value.strftime(_TIME_FORMAT)


def _bounded_text(value, fallback_prefix):
    """Return ``value`` if it satisfies the contract's text rules, else a
    short deterministic hash reference that does."""
    if (isinstance(value, str) and 0 < len(value) <= 256
            and value == value.strip()
            and not any(ord(c) < 32 for c in value)):
        return value
    return f"{fallback_prefix}:{_sha256(str(value))[:32]}"


def _ref(value, fallback):
    """Evidence references allow up to 2048 characters."""
    if (isinstance(value, str) and 0 < len(value) <= 2048
            and value == value.strip()
            and not any(ord(c) < 32 for c in value)):
        return value
    return fallback


def _primary_url(row):
    url = row.get("url")
    if isinstance(url, str) and url.strip():
        return url
    pages = row.get("pages")
    if isinstance(pages, list):
        for page in pages:
            if isinstance(page, dict):
                for key in ("url", "final_url"):
                    candidate = page.get(key)
                    if isinstance(candidate, str) and candidate.strip():
                        return candidate
    return None


def _host_of(url):
    from urllib.parse import urlsplit
    try:
        host = urlsplit(url).hostname
    except ValueError:
        return None
    if not host:
        return None
    host = host.lower()
    if not re.fullmatch(r"[a-z0-9]+(?:[.-][a-z0-9]+)*", host):
        return None
    return host


def _entity_id(row, primary_url):
    raw = row.get("id")
    if raw is None or (isinstance(raw, str) and not raw.strip()):
        raw = primary_url
    return _bounded_text(raw if isinstance(raw, str) else str(raw), "entity")


def _pages_summary(row):
    pages = row.get("pages")
    summary_pages = []
    if isinstance(pages, list):
        for page in pages:
            if isinstance(page, dict):
                summary_pages.append({
                    "url": page.get("url"), "status": page.get("status"),
                    "reason": page.get("reason"),
                    "http_status": page.get("http_status"),
                })
            else:
                summary_pages.append({"status": None, "value": str(page)})
    return {"status": row.get("status"), "reason": row.get("reason"),
            "pages": summary_pages}


def _retrieved(row):
    pages = row.get("pages")
    if isinstance(pages, list):
        return any(isinstance(page, dict) and page.get("status") == "ok"
                   for page in pages)
    if "pages" in row:
        return False
    return row.get("status") in _RETRIEVED_ROW_STATUSES


def _failure_reason(row, summary):
    """Map a failed row onto a contract failure reason.

    Rate limiting is checked first because the contract gives it special
    host-pause semantics; exact manual-failure reasons (as a page/row
    status or reason value, or the equivalent spaced phrase) keep their
    manual retry disposition; everything else is source_unavailable.
    """
    values = []
    if row.get("status") is not None:
        values.append(str(row["status"]))
    if row.get("reason") is not None:
        values.append(str(row["reason"]))
    for page in summary["pages"]:
        for key in ("status", "reason", "http_status"):
            if page.get(key) is not None:
                values.append(str(page[key]))
    blob = " ".join(values).lower()
    if ("429" in blob or "rate_limit" in blob or "rate limit" in blob
            or "too many requests" in blob or re.search(r"\brate\b", blob)):
        return "http_rate_limited"
    phrases = {
        "access_blocked": ("access_blocked", "access blocked"),
        "parser_error": ("parser_error", "parser error", "parse error"),
        "identity_unresolved": ("identity_unresolved", "identity unresolved"),
    }
    for reason in sorted(MANUAL_FAILURES):
        if any(phrase in blob for phrase in phrases.get(reason, (reason,))):
            return reason
    return "source_unavailable"


def _scope_id(mode, host):
    raw = f"crawl-{mode}-{host}"
    sanitised = re.sub(r"[^A-Za-z0-9._:-]+", "-", raw).strip()
    if len(sanitised) <= 256:
        return sanitised
    return sanitised[:223] + "-" + _sha256(raw)[:32]


def _attempt_id(run_id, entity_id):
    candidate = f"{run_id}:{entity_id}:1"
    if len(candidate) <= 256:
        return candidate
    return "attempt:" + _sha256(candidate)[:32]


def _group_results(mode, results):
    """Group rows by host: {host: {entity_id: (row, primary_url)}}.

    Rows without a usable primary URL (or without a hostname in it) are
    skipped. Duplicate entity ids on one host keep a retrieved row in
    preference to a failed one, so a later duplicate cannot erase a
    success already observed in the same run.
    """
    grouped = {}
    for row in results or []:
        if not isinstance(row, dict):
            continue
        primary_url = _primary_url(row)
        if primary_url is None:
            continue
        host = _host_of(primary_url)
        if host is None:
            continue
        entity_id = _entity_id(row, primary_url)
        bucket = grouped.setdefault(host, {})
        existing = bucket.get(entity_id)
        if existing is None or (not _retrieved(existing[0]) and _retrieved(row)):
            bucket[entity_id] = (row, primary_url)
    return grouped


def _select_scopes(grouped):
    """Cap the scope/item counts the contract allows, without raising.

    Hosts are taken by row count (largest first, host name as a stable
    tie-break) up to MAX_SCOPES; items are then taken in that host order
    up to MAX_ITEMS in total.
    """
    hosts = sorted(grouped, key=lambda host: (-len(grouped[host]), host))
    selected = {}
    remaining = MAX_ITEMS
    for host in hosts[:MAX_SCOPES]:
        if remaining <= 0:
            break
        items = grouped[host]
        if len(items) > remaining:
            items = {entity_id: items[entity_id]
                     for entity_id in sorted(items)[:remaining]}
        selected[host] = items
        remaining -= len(items)
    return selected


def build_ledger_config(*, mode, run_id, catalogue_revision, created_at, results):
    """Build the exact Ledger config for a run (also used to reopen it).

    Deterministic in its inputs, so a caller that kept the run's mode,
    run_id, catalogue_revision and created_at can rebuild the config and
    ``Ledger.open(path, config, read_only=True)`` the written ledger.
    Returns ``(config, selected)`` where ``selected`` is the grouped,
    capped ``{host: {entity_id: (row, primary_url)}}`` mapping the
    config's scopes were built from.
    """
    selected = _select_scopes(_group_results(mode, results))
    scopes = []
    for host in sorted(selected, key=lambda h: _scope_id(mode, h)):
        entity_ids = sorted(selected[host])
        scopes.append({
            "id": _scope_id(mode, host),
            "source_id": host,
            "host": host,
            "entity_kind": mode,
            "dimension": "pages",
            "temporal_scope": "single-run",
            "source_revision": _sha256(f"{mode}:{host}"),
            "parser_version": "crawl.py",
            "eligibility_rule": (
                "Entities are exactly the crawl result rows for this host "
                "attempted in this run."),
            "population": {
                "status": "exact",
                "eligible_ids": entity_ids,
                "as_of": created_at,
                "evidence": {
                    "ref": _ref(f"crawl-run:{run_id}", "crawl-run"),
                    "sha256": _sha256(entity_ids),
                },
                "reason": (
                    "The population is this run's attempted set on the host, "
                    "enumerated from the crawl result rows; it is not the "
                    "host's whole universe."),
            },
            "freshness_seconds": None,
        })
    total = sum(len(items) for items in selected.values())
    config = {
        "version": 1,
        "run_id": run_id,
        "catalogue_revision": catalogue_revision,
        "snapshot_kind": "built",
        "created_at": created_at,
        "attempt_budget": max(1, total),
        "scopes": scopes,
    }
    return config, selected


def _scope_events(*, mode, run_id, created_at, host, items):
    """Events for one scope, ordered so a host pause can do no harm.

    All events share ``at == created_at`` (monotonic, and the contract's
    initial retry disposition is due at that instant). A rate-limited
    finish pauses the host until after ``created_at``, which would block
    any later start on that host — so rate-limited items are finished
    last in the scope, after every other item has started and finished.
    """
    scope_id = _scope_id(mode, host)
    rate_after = _format_time(_parse_time(created_at)
                              + timedelta(seconds=_RATE_LIMIT_DELAY_SECONDS))
    prepared = []
    for entity_id in sorted(items):
        row, primary_url = items[entity_id]
        summary = _pages_summary(row)
        retrieved = _retrieved(row)
        reason = None if retrieved else _failure_reason(row, summary)
        prepared.append((entity_id, row, primary_url, summary, retrieved, reason))
    # Non-rate-limited items first; rate-limited items last (stable in
    # entity-id order within each partition).
    prepared.sort(key=lambda item: item[5] == "http_rate_limited")

    events = []
    for entity_id, row, primary_url, _summary, _ok, _reason in prepared:
        events.append({
            "type": "discover", "scope_id": scope_id, "at": created_at,
            "entity_id": entity_id,
            "evidence": {"ref": _ref(primary_url, entity_id),
                         "sha256": _sha256(row)},
        })
    failed = 0
    for entity_id, _row, primary_url, summary, retrieved, reason in prepared:
        attempt_id = _attempt_id(run_id, entity_id)
        events.append({
            "type": "start", "scope_id": scope_id, "at": created_at,
            "entity_id": entity_id, "attempt_id": attempt_id,
        })
        if retrieved:
            finish = {
                "type": "finish", "scope_id": scope_id, "at": created_at,
                "entity_id": entity_id, "attempt_id": attempt_id,
                "outcome": "retrieved",
                "evidence": {"ref": _ref(primary_url, entity_id),
                             "sha256": _sha256(summary)},
                "reason": None, "retry": {"mode": "none", "after": None},
            }
        else:
            failed += 1
            if reason == "http_rate_limited":
                retry = {"mode": "automatic", "after": rate_after}
            elif reason in MANUAL_FAILURES:
                retry = {"mode": "manual", "after": None}
            else:
                retry = {"mode": "automatic", "after": created_at}
            finish = {
                "type": "finish", "scope_id": scope_id, "at": created_at,
                "entity_id": entity_id, "attempt_id": attempt_id,
                "outcome": "unavailable",
                "evidence": {"ref": _ref(primary_url, entity_id),
                             "sha256": _sha256(summary)},
                "reason": reason, "retry": retry,
            }
        events.append(finish)
    total = len(prepared)
    if failed == 0:
        checkpoint = {
            "type": "checkpoint", "scope_id": scope_id, "at": created_at,
            "cursor": None, "status": "complete", "truncated": False,
            "reason": None,
            "evidence": {"ref": _ref(f"crawl-run:{run_id}:{scope_id}", scope_id),
                         "sha256": _sha256(sorted(items))},
        }
    else:
        checkpoint = {
            "type": "checkpoint", "scope_id": scope_id, "at": created_at,
            "cursor": None, "status": "partial", "truncated": False,
            "reason": f"{failed} of {total} items unavailable in this run",
            "evidence": {"ref": _ref(f"crawl-run:{run_id}:{scope_id}", scope_id),
                         "sha256": _sha256(sorted(items))},
        }
    events.append(checkpoint)
    return events


def record_run_ledger(path, *, mode, run_id, catalogue_revision, created_at,
                      results):
    """Create the coverage ledger for one crawl run and return its report.

    ``path`` must not already exist (the Ledger contract is one immutable
    run per file). A run with no usable result rows creates no file and
    returns an empty report rather than raising, since the contract
    requires at least one scope.
    """
    config, selected = build_ledger_config(
        mode=mode, run_id=run_id, catalogue_revision=catalogue_revision,
        created_at=created_at, results=results)
    if not config["scopes"]:
        return {
            "run_id": run_id, "catalogue_revision": catalogue_revision,
            "snapshot_kind": config["snapshot_kind"], "sequence": 0,
            "as_of": created_at, "attempt_budget_remaining": config["attempt_budget"],
            "host_pauses": {}, "scopes": [], "entities_by_kind": {},
        }
    events = []
    for host in sorted(selected, key=lambda h: _scope_id(mode, h)):
        events.extend(_scope_events(
            mode=mode, run_id=run_id, created_at=created_at,
            host=host, items=selected[host]))
    ledger = Ledger.create(path, config)
    try:
        sequence = 0
        for index in range(0, len(events), MAX_EVENTS):
            batch = events[index:index + MAX_EVENTS]
            receipt = ledger.apply(
                f"ledger-batch-{sequence + 1}", sequence, batch, created_at)
            sequence = receipt["sequence"]
        return ledger.report(created_at)
    finally:
        ledger.close()
