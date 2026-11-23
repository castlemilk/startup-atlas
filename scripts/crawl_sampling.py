#!/usr/bin/env python3
"""Advisory crawl sampling: prioritise stale, changed or low-confidence sources.

Policy (design doc docs/KG-CONNECTIVE-TISSUE.md section 4):

- Staleness: +1 per day since the last successful fetch, capped at 30. A
  source with no successful fetch on record is maximally stale (30): it has
  never been verified, so it is prioritised, not assumed fresh.
- Change signal: +5 per new/changed candidate row the source yielded on its
  last run, capped at 25.
- Low-confidence supply: +2 per low-confidence edge currently sourced from
  it, capped at 20 -- re-crawl what would raise trust.
- Failure backoff: 1 consecutive failure halves the priority, 2 quarters
  it, 3+ skips the source until the state is manually reset (see
  ``reset_source``). Failures are recorded per source with the HTTP status.

The sampler orders and annotates; it drops nothing except the 3+-failure
backoff. State lives in ``data/crawl-source-state.json`` and is seeded empty
-- no history is invented. A source id is its seed URL, the one stable key
shared by the sites and profiles crawl modes.
"""
from __future__ import annotations
import datetime as dt
import json
import os
from pathlib import Path
import re
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_STATE_PATH = ROOT / 'data/crawl-source-state.json'

STALENESS_CAP_DAYS = 30
CHANGE_POINTS_PER_ROW = 5
CHANGE_CAP = 25
LOW_CONFIDENCE_POINTS_PER_EDGE = 2
LOW_CONFIDENCE_CAP = 20
BACKOFF_SKIP_AFTER = 3


def utc_now():
    return dt.datetime.now(dt.timezone.utc)


def _parse_time(value):
    """Parse an ISO timestamp into an aware UTC datetime, or None."""
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        parsed = dt.datetime.fromisoformat(value.strip().replace('Z', '+00:00'))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=dt.timezone.utc)
    return parsed.astimezone(dt.timezone.utc)


def _count(record, field):
    try:
        return max(0, int(record.get(field) or 0))
    except (TypeError, ValueError):
        return 0


def score_source(record, now=None):
    """Priority 0-100 for one per-source state record.

    ``record`` is the source's entry from ``data/crawl-source-state.json``
    (or ``{}`` for a source with no history). ``now`` is injectable for
    tests; it defaults to the current UTC time. A backed-off source
    (3+ consecutive failures) scores 0; callers must also check
    ``is_backed_off`` to keep it out of the run entirely.
    """
    record = record or {}
    failures = _count(record, 'consecutive_failures')
    if failures >= BACKOFF_SKIP_AFTER:
        return 0
    now = now or utc_now()
    last_success = _parse_time(record.get('last_success_at'))
    if last_success is None:
        days = STALENESS_CAP_DAYS
    else:
        days = max(0, (now - last_success).days)
    priority = min(days, STALENESS_CAP_DAYS)
    priority += min(_count(record, 'new_changed_rows_last_run') * CHANGE_POINTS_PER_ROW, CHANGE_CAP)
    priority += min(_count(record, 'low_confidence_edges') * LOW_CONFIDENCE_POINTS_PER_EDGE, LOW_CONFIDENCE_CAP)
    if failures == 1:
        priority = int(priority * 0.5)
    elif failures == 2:
        priority = int(priority * 0.25)
    return max(0, min(100, priority))


def is_backed_off(record):
    """True when a source has failed 3+ times in a row and must be skipped."""
    return _count(record or {}, 'consecutive_failures') >= BACKOFF_SKIP_AFTER


def _normalise_text(value):
    return ' '.join(str(value).split()).casefold() if isinstance(value, str) else ''


def _normalise_website(value):
    """Compare websites by host + path, ignoring case, www. and trailing slash."""
    if not isinstance(value, str):
        return ''
    raw = value.strip().casefold().rstrip('/')
    if not raw:
        return ''
    try:
        parts = urlsplit(raw if '://' in raw else 'https://' + raw)
    except ValueError:
        return raw
    host = (parts.hostname or '').removeprefix('www.')
    path = parts.path.rstrip('/')
    return f'{host}{path}'


def should_skip_unchanged(candidate, reviewed_record):
    """True only when a partner-update candidate is unchanged since import.

    The candidate's fresh ``site_description`` is compared against the
    reviewed record's ``description`` (normalised: strip, collapse
    whitespace, casefold), PLUS a website comparison. Skip only when both
    match. This is the #349 fix: the previous implementation read the
    reviewed record's ``site_description``, a field reviewed records do
    not carry (0 of 33 reviewed partners have one) -- they carry
    ``description``. A candidate may also carry its description inside
    ``suggested_record['description']``; that is accepted as the fresh
    site description.

    Either description missing or empty, or either website missing, never
    skips: absence of evidence is not evidence of no change.
    """
    if not isinstance(candidate, dict) or not isinstance(reviewed_record, dict):
        return False
    suggested = candidate.get('suggested_record')
    if not isinstance(suggested, dict):
        suggested = {}
    site_description = candidate.get('site_description') or suggested.get('description') or ''
    reviewed_description = reviewed_record.get('description') or ''
    if not _normalise_text(site_description) or not _normalise_text(reviewed_description):
        return False
    if _normalise_text(site_description) != _normalise_text(reviewed_description):
        return False
    candidate_site = candidate.get('website') or suggested.get('website') or ''
    reviewed_site = reviewed_record.get('website') or ''
    if not candidate_site.strip() or not reviewed_site.strip():
        return False
    return _normalise_website(candidate_site) == _normalise_website(reviewed_site)


def http_status_from_reason(reason):
    """Extract an HTTP status code from a crawl failure reason, or None."""
    if not isinstance(reason, str):
        return None
    match = re.search(r'HTTP (\d{3})\b', reason)
    return int(match.group(1)) if match else None


def _blank_record(source_id):
    return {'source_id': source_id, 'last_success_at': None, 'last_fetch_at': None,
            'consecutive_failures': 0, 'last_status': None,
            'last_failure_at': None, 'last_failure_status': None,
            'new_changed_rows_last_run': 0, 'low_confidence_edges': 0, 'total_runs': 0}


def record_outcome(state, source_id, *, ok, status=None, new_changed_rows=0,
                   low_confidence_edges=None, now=None):
    """Record one source's run outcome into the state dict (in place).

    On success the failure streak resets and the fetch becomes the last
    success; on failure the streak grows and the HTTP status is kept
    (``last_failure_status``). ``new_changed_rows`` is how many new/changed
    candidate rows the source yielded on this run; ``low_confidence_edges``
    replaces the stored count when given. Returns the updated record.
    """
    sources = state.setdefault('sources', {})
    record = sources.setdefault(source_id, _blank_record(source_id))
    moment = (now or utc_now()).isoformat(timespec='seconds')
    record['last_fetch_at'] = moment
    record['last_status'] = status
    record['total_runs'] = _count(record, 'total_runs') + 1
    if ok:
        record['last_success_at'] = moment
        record['consecutive_failures'] = 0
        record['new_changed_rows_last_run'] = max(0, int(new_changed_rows or 0))
    else:
        record['consecutive_failures'] = _count(record, 'consecutive_failures') + 1
        record['last_failure_at'] = moment
        record['last_failure_status'] = status
        record['new_changed_rows_last_run'] = 0
    if low_confidence_edges is not None:
        record['low_confidence_edges'] = max(0, int(low_confidence_edges))
    state['updated_at'] = moment
    return record


def _candidate_source_name(candidate):
    return (candidate.get('partner') or candidate.get('source_name')
            or candidate.get('startup') or '')


def record_run_outcomes(state, results, candidates, *, now=None):
    """Fold one crawl run's per-source outcomes into the state dict.

    ``results`` are the crawl result rows (each with ``url``, ``name`` and
    ``pages``); ``candidates`` are the run's candidate rows, attributed to
    a source by partner/source_name/startup. A source is ok when at least
    one of its pages fetched; the recorded status is the first successful
    page's HTTP status, else the HTTP status parsed from the first failed
    page's reason (None when the failure was not an HTTP error).
    """
    candidates = candidates or []
    for row in results or []:
        pages = row.get('pages', []) or []
        ok = any(page.get('status') == 'ok' for page in pages)
        status = None
        if ok:
            status = next((page.get('http_status') for page in pages
                           if page.get('status') == 'ok'), None)
        else:
            status = next((http_status_from_reason(page.get('reason'))
                           for page in pages if page.get('status') != 'ok'), None)
        rows = sum(1 for candidate in candidates
                   if _candidate_source_name(candidate) == row.get('name'))
        record_outcome(state, row.get('url') or row.get('name') or 'unknown',
                       ok=ok, status=status, new_changed_rows=rows, now=now)
    return state


def order_sources(entries, state, key='url', now=None):
    """Order source entries by sampler priority; split out backed-off ones.

    Returns ``(ordered, skipped)``. Entries are shallow copies annotated
    with ``sampling_priority``; skipped entries additionally carry
    ``sampling_skipped: True`` and a ``sampling_reason``. Ordering is
    stable, so equal priorities keep catalogue order. Nothing is dropped
    except the 3+-failure backoff. ``now`` is injectable for tests.
    """
    records = (state or {}).get('sources') or {}
    ordered = []
    skipped = []
    for entry in entries:
        source_id = entry.get(key) or ''
        record = records.get(source_id) or {}
        annotated = {**entry, 'sampling_priority': score_source(record, now=now)}
        if is_backed_off(record):
            annotated['sampling_skipped'] = True
            annotated['sampling_reason'] = (
                f"{_count(record, 'consecutive_failures')} consecutive failures; "
                'skipped until manually reset')
            skipped.append(annotated)
        else:
            ordered.append(annotated)
    ordered.sort(key=lambda item: -item['sampling_priority'])
    return ordered, skipped


def reset_source(state, source_id):
    """Manually clear a source's failure backoff so it runs again.

    Returns True when the source had a state record, False otherwise.
    The failure history is kept (``last_failure_*``) -- only the streak
    that blocks the source is cleared.
    """
    record = (state or {}).get('sources', {}).get(source_id)
    if record is None:
        return False
    record['consecutive_failures'] = 0
    record['manually_reset_at'] = utc_now().isoformat(timespec='seconds')
    return True


def load_state(path=DEFAULT_STATE_PATH):
    """Load the sampler state file; a missing file seeds empty (no history)."""
    path = Path(path)
    if not path.exists():
        return {'version': 1, 'sources': {}}
    try:
        data = json.loads(path.read_text(encoding='utf-8'))
    except ValueError as exc:
        raise ValueError(f'Invalid crawl source state in {path}: {exc}') from exc
    if not isinstance(data, dict) or not isinstance(data.get('sources'), dict):
        raise ValueError(f'Invalid crawl source state in {path}: expected a sources object')
    return data


def save_state(state, path=DEFAULT_STATE_PATH):
    """Atomically write the sampler state file."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_text(json.dumps(state, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    os.replace(temporary, path)
    return path
