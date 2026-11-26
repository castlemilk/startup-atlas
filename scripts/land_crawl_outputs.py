#!/usr/bin/env python3
"""Land one crawl run's bookkeeping outputs back onto the committed data.

Finding F2 of the crawler self-critique (round 2, 2026-11-26): the
partner-research workflow builds an updated review queue, crawl-run
registry and sampler source-state on every run, but only into the run
artifact -- the committed copies went stale (the queue's newest entries
were from run 44, the registry ended 2026-11-23, and the source state
stayed the empty stub, so the sampler started every run with no memory
and failure backoff could never engage).

This script is the merge half of the landing. The workflow's "Land crawl
outputs on main" step clones the current main, runs this script with the
run's artifact directory as the built side and the clone's ``data/`` as
the committed side, then commits exactly the three files. Merging --
rather than overwriting with the run's copies -- is what makes the
landing safe against concurrent writers: while a crawl runs, the admin
panel / admin MCP can commit review decisions to ``data/review-queue.json``
on main, and those decisions must never be clobbered by a queue the run
built from an older seed.

Merge rules:

- Review queue (``data/review-queue.json``): entries are keyed by ``id``.
  An entry that carries a decision on the committed side (``decided_by``
  set, or a status other than ``pending``) always wins over the run's
  copy. Undecided entries take the run's fresher copy; entries present on
  only one side are kept.
- Crawl runs (``data/crawl-runs.json``): union by ``run_id`` (the same
  dedup the recorder applies), committed order first.
- Source state (``data/crawl-source-state.json``): per source, the
  record with the later ``last_fetch_at`` wins; ties go to the higher
  ``total_runs``, then to the run's record. Sources present on only one
  side are kept.

A built file that is missing is skipped with a note -- nothing is ever
fabricated. Files whose merged content equals the committed content are
left untouched. The script does no git operations, so the cron's local
close-out can reuse it against a checkout exactly as the workflow does.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

QUEUE_FILE = 'review-queue.json'
RUNS_FILE = 'crawl-runs.json'
STATE_FILE = 'crawl-source-state.json'
FILES = (QUEUE_FILE, RUNS_FILE, STATE_FILE)


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


def _is_decided(entry):
    """A queue entry carries a decision once someone (or the auto-gate)
    has decided it: ``decided_by`` is stamped, or it left ``pending``."""
    return bool(entry.get('decided_by')) or entry.get('status') not in (None, 'pending')


def merge_review_queue(built, latest):
    """Merge the run's queue into the committed queue.

    Returns (document, stats). Committed order is preserved; entries the
    run newly produced append in built order.
    """
    built_by_id = {}
    built_unkeyed = []
    for entry in built.get('entries', []):
        if entry.get('id'):
            built_by_id[entry['id']] = entry
        else:
            built_unkeyed.append(entry)
    merged = []
    stats = {'kept_decisions': 0, 'refreshed': 0, 'kept_committed_only': 0, 'added': 0}
    seen = set()
    for entry in latest.get('entries', []):
        entry_id = entry.get('id')
        seen.add(entry_id)
        candidate = built_by_id.get(entry_id)
        if candidate is None:
            merged.append(entry)
            stats['kept_committed_only'] += 1
        elif _is_decided(entry):
            merged.append(entry)
            stats['kept_decisions'] += 1
        else:
            merged.append(candidate)
            stats['refreshed'] += 1
    for entry in built.get('entries', []):
        if entry.get('id') and entry['id'] not in seen:
            merged.append(entry)
            stats['added'] += 1
    merged.extend(built_unkeyed)
    stats['added'] += len(built_unkeyed)
    document = dict(latest)
    document['entries'] = merged
    return document, stats


def merge_crawl_runs(built, latest):
    """Union of run records by run_id; committed order first."""
    seen = {record.get('run_id') for record in latest.get('runs', [])}
    runs = list(latest.get('runs', []))
    added = 0
    for record in built.get('runs', []):
        if record.get('run_id') not in seen:
            runs.append(record)
            seen.add(record.get('run_id'))
            added += 1
    document = dict(latest)
    document['runs'] = runs
    return document, {'added': added, 'total': len(runs)}


def _newer_state_record(built_record, latest_record):
    """Pick the fresher of two sampler records for one source.

    Later ``last_fetch_at`` wins; a tie goes to the higher ``total_runs``
    and then to the run's (built) record, which derives from the newest
    crawl data. Returns (record, winner) with winner 'built' or 'latest'.
    """
    built_key = (_parse_time(built_record.get('last_fetch_at')) or dt.datetime.min.replace(tzinfo=dt.timezone.utc),
                 _count(built_record, 'total_runs'))
    latest_key = (_parse_time(latest_record.get('last_fetch_at')) or dt.datetime.min.replace(tzinfo=dt.timezone.utc),
                  _count(latest_record, 'total_runs'))
    if built_key >= latest_key:
        return built_record, 'built'
    return latest_record, 'latest'


def merge_source_state(built, latest):
    """Merge sampler state per source by record recency."""
    built_sources = built.get('sources', {}) or {}
    latest_sources = latest.get('sources', {}) or {}
    sources = {}
    stats = {'from_built': 0, 'from_latest': 0, 'built_only': 0, 'latest_only': 0}
    for source_id in list(latest_sources) + [s for s in built_sources if s not in latest_sources]:
        built_record = built_sources.get(source_id)
        latest_record = latest_sources.get(source_id)
        if built_record is None:
            sources[source_id] = latest_record
            stats['latest_only'] += 1
        elif latest_record is None:
            sources[source_id] = built_record
            stats['built_only'] += 1
        else:
            record, winner = _newer_state_record(built_record, latest_record)
            sources[source_id] = record
            stats['from_built' if winner == 'built' else 'from_latest'] += 1
    document = dict(latest)
    document['sources'] = sources
    stamps = [s for s in (built.get('updated_at'), latest.get('updated_at')) if _parse_time(s)]
    if stamps:
        document['updated_at'] = max(stamps, key=_parse_time)
    return document, stats


MERGERS = {
    QUEUE_FILE: merge_review_queue,
    RUNS_FILE: merge_crawl_runs,
    STATE_FILE: merge_source_state,
}


def _load(path):
    return json.loads(path.read_text(encoding='utf-8'))


def _write_atomic(path, document):
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_text(json.dumps(document, ensure_ascii=False, indent=2) + '\n',
                         encoding='utf-8')
    os.replace(temporary, path)


def land(artifact_dir, data_dir):
    """Merge each built file in ``artifact_dir`` into ``data_dir``.

    Returns a list of (filename, action, detail) tuples; action is one of
    'landed', 'unchanged', 'skipped'.
    """
    results = []
    for name in FILES:
        built_path = artifact_dir / name
        data_path = data_dir / name
        if not built_path.exists():
            results.append((name, 'skipped', f'no built file at {built_path}'))
            continue
        built = _load(built_path)
        if not data_path.exists():
            _write_atomic(data_path, built)
            results.append((name, 'landed', 'no committed copy; built file landed as-is'))
            continue
        latest = _load(data_path)
        merged, stats = MERGERS[name](built, latest)
        if merged == latest:
            results.append((name, 'unchanged', f'committed copy already current ({stats})'))
        else:
            _write_atomic(data_path, merged)
            results.append((name, 'landed', f'merged ({stats})'))
    return results


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument('--artifact-dir', type=Path, default=ROOT / 'research/crawl',
                        help='directory holding the run-built queue/registry/state files')
    parser.add_argument('--data-dir', type=Path, default=ROOT / 'data',
                        help='directory holding the committed copies to merge into')
    args = parser.parse_args(argv)
    for name, action, detail in land(args.artifact_dir, args.data_dir):
        print(f'{name}: {action} -- {detail}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
