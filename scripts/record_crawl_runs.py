#!/usr/bin/env python3
"""Append one registry record per crawl mode run to data/crawl-runs.json.

Issue #538: the registry only ever held manual ``partners`` runs, although
the partner-research workflow runs eight modes. This script is the
workflow's bookkeeping step: after the crawl steps finish, it reads each
mode's snapshot from the snapshot directory, builds a record that satisfies
the strict registry schema in ``backend/mcp/crawls.mjs`` (run ID shape,
40-char catalogue revision, per-source revisions, outcome counts), and
appends it to the registry file it is pointed at. The workflow points it
at a copy inside the crawl artifact, so landing the updated registry on
main stays a reviewed data change -- the same pattern as the review
queue. Records are deduplicated by run ID, so re-running the step for the
same workflow run never double-records a mode.

A mode with no snapshot is skipped with a note, never fabricated: a
missing snapshot means that step produced nothing recordable.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# Workflow modes in workflow order, with the seed file each mode runs
# from. The seed file's SHA-256 is recorded for every source in the run,
# matching the precedent of the existing registry records.
MODE_SEED_FILES = {
    'partners': 'data/partner-sources.json',
    'programs': 'data/program-sources.json',
    'news': 'data/startup-news-sources.json',
    'logos': 'data/partner-logo-seeds.csv',
    'profiles': 'data/partner-logo-seeds.csv',
    'company-profiles': 'data/company-profile-seeds.csv',
    'portraits': 'data/company-profile-seeds.csv',
    'partner-candidates': 'data/partner-logo-seeds.csv',
}
WORKFLOW_MODES = list(MODE_SEED_FILES)

SNAPSHOT_FILES = {
    'partner-candidates': 'partner-update-candidates.json',
}


def snapshot_filename(mode):
    return SNAPSHOT_FILES.get(mode, f'latest-{mode}.json')


def _sha256_bytes(data):
    return hashlib.sha256(data).hexdigest()


def _parse_time(value):
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        parsed = datetime.fromisoformat(value.strip().replace('Z', '+00:00'))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _iso(moment):
    return moment.astimezone(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


def seed_source_ids(root, mode):
    """Source IDs a mode runs from, read from its seed file (JSON registry
    ``sources[].id`` or, for CSV seeds, the approved rows' names)."""
    seed_path = root / MODE_SEED_FILES[mode]
    if seed_path.suffix == '.json':
        document = json.loads(seed_path.read_text(encoding='utf-8'))
        return [source['id'] for source in document.get('sources', [])
                if isinstance(source, dict) and source.get('id')]
    with seed_path.open(newline='', encoding='utf-8') as handle:
        rows = list(csv.DictReader(handle))
    return [row['partner'] for row in rows
            if row.get('partner') and (row.get('approved') or '').strip().lower() == 'yes']


def _result_source_id(row):
    return row.get('id') or row.get('source_id') or row.get('name') or ''


def _source_outcomes(results):
    """Per-source status entries in the registry's outcome.sources shape."""
    entries = []
    for row in results:
        pages = row.get('pages', []) or []
        pages_ok = sum(1 for page in pages if page.get('status') == 'ok')
        entries.append({
            'source': row.get('name') or _result_source_id(row) or 'unknown',
            'status': 'ok' if pages_ok else 'failed',
            'pages_ok': pages_ok,
            'pages_attempted': len(pages),
        })
    return entries


def build_record(mode, snapshot_path, snapshot, *, root, catalogue_revision,
                 claimed_by, run_url, sequence, finished_at):
    """Build one validated-shape registry record for a finished mode run."""
    seed_rel = MODE_SEED_FILES[mode]
    seed_sha = _sha256_bytes((root / seed_rel).read_bytes())
    results = snapshot.get('results') if isinstance(snapshot.get('results'), list) else []
    candidates = snapshot.get('candidates') if isinstance(snapshot.get('candidates'), list) else []

    if mode in ('partners', 'programs', 'news'):
        source_ids = seed_source_ids(root, mode)
    else:
        source_ids = []
        for row in results:
            source_id = _result_source_id(row)
            if source_id and source_id not in source_ids:
                source_ids.append(source_id)
        if not source_ids:
            source_ids = seed_source_ids(root, mode)

    sources = _source_outcomes(results)
    if results:
        attempted = len(results)
        succeeded = sum(1 for entry in sources if entry['status'] == 'ok')
        failed = attempted - succeeded
        status = 'completed' if succeeded else 'failed'
    else:
        # Modes without per-source results (partner-candidates): producing
        # the snapshot at all is completion of the step.
        attempted = len(source_ids)
        succeeded = attempted
        failed = 0
        status = 'completed'

    started = _parse_time(snapshot.get('generated_at')) or finished_at
    if finished_at < started:
        finished_at = started
    run_id = f"crawl-{started.strftime('%Y%m%d')}-{mode}-{sequence:02d}"
    return {
        'version': 1,
        'run_id': run_id,
        'mode': mode,
        'scope': {
            'source_ids': source_ids,
            'seed_file': seed_rel,
            'seed_sha256': seed_sha,
        },
        'args': {},
        'catalogue_revision': catalogue_revision,
        'source_revisions': {source_id: seed_sha for source_id in source_ids},
        'claimed_by': claimed_by,
        'claimed_at': _iso(started),
        'lease_expires_at': _iso(started + timedelta(minutes=30)),
        'status': status,
        'started_at': _iso(started),
        'finished_at': _iso(finished_at),
        'outcome': {
            'sources_attempted': attempted,
            'sources_succeeded': succeeded,
            'sources_failed': failed,
            'candidates_discovered': len(candidates),
            'coverage_reference': f'research/crawl/{snapshot_path.name}',
            'notes': (f'Recorded by scripts/record_crawl_runs.py from the '
                      f'partner-research workflow snapshot ({snapshot_path.name}); '
                      f'see the crawl artifact for the full snapshot.'),
            'sources': sources,
        },
        'snapshot_sha256': _sha256_bytes(snapshot_path.read_bytes()),
        'artifact_url': None,
        'run_url': run_url,
        'review_status': 'unreviewed',
        'published_pr': None,
        'supersedes': None,
        'superseded_by': None,
    }


def append_records(registry_path, records):
    """Append records to the registry file, skipping existing run IDs.

    Returns (added, skipped). The file is rewritten atomically in the
    registry's established format (sorted keys, two-space indent).
    """
    registry_path = Path(registry_path)
    document = json.loads(registry_path.read_text(encoding='utf-8'))
    if not isinstance(document, dict) or not isinstance(document.get('runs'), list):
        raise ValueError(f'Invalid crawl registry in {registry_path}: expected a runs list')
    seen = {run.get('run_id') for run in document['runs']}
    added, skipped = [], []
    for record in records:
        if record['run_id'] in seen:
            skipped.append(record['run_id'])
            continue
        seen.add(record['run_id'])
        document['runs'].append(record)
        added.append(record['run_id'])
    if added:
        text = json.dumps(document, ensure_ascii=False, indent=2, sort_keys=True) + '\n'
        temporary = registry_path.with_suffix(registry_path.suffix + '.tmp')
        temporary.write_text(text, encoding='utf-8')
        os.replace(temporary, registry_path)
    return added, skipped


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--registry', type=Path, default=ROOT / 'data/crawl-runs.json')
    parser.add_argument('--snapshots', type=Path, default=ROOT / 'research/crawl')
    parser.add_argument('--root', type=Path, default=ROOT,
                        help='Repository root the seed files are read from')
    parser.add_argument('--catalogue-revision', required=True,
                        help='40-character main commit the crawl was based on (github.sha)')
    parser.add_argument('--claimed-by', default='github-actions')
    parser.add_argument('--run-url', default=None,
                        help='HTTPS URL of the workflow run, recorded on each record')
    parser.add_argument('--sequence', type=int, default=1,
                        help='Run sequence number used as the run ID suffix (workflow run number)')
    parser.add_argument('--finished-at', default=None,
                        help='ISO timestamp the bookkeeping step ran (defaults to now, UTC)')
    args = parser.parse_args(argv)
    if not re.fullmatch(r'[a-f0-9]{40}', args.catalogue_revision or ''):
        parser.error('--catalogue-revision must be the 40-character main commit')
    if args.run_url is not None and not args.run_url.startswith('https://'):
        parser.error('--run-url must be an HTTPS URL or omitted')
    finished_at = _parse_time(args.finished_at) or datetime.now(timezone.utc)
    sequence = args.sequence % 100 or 1

    records = []
    for mode in WORKFLOW_MODES:
        snapshot_path = args.snapshots / snapshot_filename(mode)
        if not snapshot_path.exists():
            print(f'{mode}: no snapshot at {snapshot_path}; skipped (nothing recorded)')
            continue
        snapshot = json.loads(snapshot_path.read_text(encoding='utf-8'))
        records.append(build_record(
            mode, snapshot_path, snapshot, root=args.root,
            catalogue_revision=args.catalogue_revision,
            claimed_by=args.claimed_by, run_url=args.run_url,
            sequence=sequence, finished_at=finished_at))
    added, skipped = append_records(args.registry, records)
    for record in records:
        state = 'recorded' if record['run_id'] in added else 'already recorded'
        print(f"{record['mode']}: {record['run_id']} {state} "
              f"({record['outcome']['sources_succeeded']}/{record['outcome']['sources_attempted']} sources ok, "
              f"{record['outcome']['candidates_discovered']} candidates)")
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (OSError, ValueError) as exc:
        print(f'Error: {exc}', file=sys.stderr)
        sys.exit(2)
