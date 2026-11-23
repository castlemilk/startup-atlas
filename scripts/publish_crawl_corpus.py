#!/usr/bin/env python3
"""Publish crawl snapshots to the live-index corpus (object storage).

Run at the end of the partner-research crawl workflow, after the review
artifact is preserved. Uploads every ``latest-<mode>.json`` snapshot (and
its stamped sibling) to the private corpus bucket:

    corpus/v1/crawl/<mode>/<run-id>.json   (immutable, one per run)
    corpus/v1/crawl/<mode>/latest.json     (pointer to the newest run)

Then best-effort POSTs a ``repository_dispatch`` (``corpus-updated``) so the
async indexer workflow runs immediately; the scheduled indexer poll covers
a missed dispatch.

The script is safe to run before object storage is configured: with no
``ATLAS_CORPUS_*`` environment it prints a skip message and exits 0, so the
crawl workflow keeps working exactly as today. Upload failures exit 1 (the
workflow step runs with ``continue-on-error: true`` — a failed corpus push
must never fail a crawl).

Credentials come from the environment only; nothing secret is printed.
"""
import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from atlas_corpus import (  # noqa: E402
    CorpusConfig,
    CorpusError,
    crawl_latest_key,
    crawl_snapshot_key,
)
from atlas_gcp import client_for, is_configured  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
MODE_RE = re.compile(r'^[a-z0-9][a-z0-9-]*$')


def find_modes(snapshots_dir):
    """Modes present as latest-<mode>.json, in sorted order."""
    modes = []
    for path in sorted(snapshots_dir.glob('latest-*.json')):
        mode = path.name[len('latest-'):-len('.json')]
        if MODE_RE.match(mode):
            modes.append((mode, path))
    return modes


def stamped_snapshot(snapshots_dir, mode):
    """Newest stamped <mode>-<stamp>.json, or None when there is none."""
    candidates = [
        path for path in snapshots_dir.glob(f'{mode}-*.json')
        if not path.name.startswith('latest-')
    ]
    if not candidates:
        return None
    return max(candidates, key=lambda p: p.stat().st_mtime)


def dispatch_indexer(repo, token, run_id, modes, timeout=10):
    """POST a repository_dispatch; best-effort, returns True on 2xx."""
    if not repo or not token:
        return False
    url = f'https://api.github.com/repos/{repo}/dispatches'
    payload = json.dumps({
        'event_type': 'corpus-updated',
        'client_payload': {'run_id': run_id, 'modes': modes, 'source': 'crawl'},
    }).encode('utf-8')
    request = urllib.request.Request(url, data=payload, method='POST', headers={
        'Accept': 'application/vnd.github+json',
        'Authorization': f'Bearer {token}',
        'Content-Type': 'application/json',
    })
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return 200 <= response.status < 300
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as exc:
        print(f'Indexer dispatch failed (covered by the scheduled poll): {exc}',
              file=sys.stderr)
        return False


def publish(snapshots_dir, run_id, config, repo=None, token=None, dry_run=False):
    """Upload snapshots; returns the receipt dict.

    Uploads are attempted for every key even when some fail: one mode's
    failure must not silently drop the remaining modes (crawl #46 lost
    five of six modes when the logos latest.json overwrite failed first
    and aborted the loop). Failures are collected and raised as a single
    CorpusError after all modes have been attempted, so the step still
    reports failure (the workflow marks it continue-on-error).
    """
    uploaded = []
    skipped = []
    failed = []
    modes = [mode for mode, _ in find_modes(snapshots_dir)]
    client = None if dry_run else client_for(config)
    for mode, latest_path in find_modes(snapshots_dir):
        latest_bytes = latest_path.read_bytes()
        stamped = stamped_snapshot(snapshots_dir, mode)
        run_bytes = stamped.read_bytes() if stamped else latest_bytes
        for key, data in (
            (crawl_snapshot_key(mode, run_id), run_bytes),
            (crawl_latest_key(mode), latest_bytes),
        ):
            if dry_run:
                skipped.append({'key': key, 'bytes': len(data), 'dry_run': True})
                continue
            try:
                result = client.put_object(key, data, 'application/json')
            except CorpusError as exc:
                failed.append({'key': key, 'error': str(exc)})
                continue
            uploaded.append(result)
    if failed:
        summary = '; '.join(f"{f['key']}: {f['error']}" for f in failed)
        raise CorpusError(
            f'{len(failed)} corpus upload(s) failed after '
            f'{len(uploaded)} succeeded: {summary}')
    dispatched = False
    if uploaded and not dry_run:
        dispatched = dispatch_indexer(repo, token, run_id, modes)
    return {
        'run_id': run_id,
        'modes': modes,
        'uploaded': uploaded,
        'skipped_dry_run': skipped,
        'indexer_dispatched': dispatched,
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--snapshots', type=Path, default=ROOT / 'research/crawl',
                        help='Directory holding latest-<mode>.json snapshots')
    parser.add_argument('--run-id', default=None,
                        help='Crawl run id (default: GITHUB_RUN_ID or UTC stamp)')
    parser.add_argument('--repo', default=None,
                        help='owner/repo for the indexer dispatch (default: GITHUB_REPOSITORY)')
    parser.add_argument('--receipt', type=Path, default=None,
                        help='Write the JSON receipt to this path')
    parser.add_argument('--dry-run', action='store_true',
                        help='List what would be uploaded without touching storage')
    args = parser.parse_args(argv)

    config = CorpusConfig.from_env()
    if not is_configured(config) and not args.dry_run:
        print('Object storage is not configured (ATLAS_CORPUS_*); '
              'skipping corpus publish.')
        return 0
    if args.dry_run:
        config = CorpusConfig(endpoint='https://dry-run.invalid', bucket='dry-run',
                              access_key='dry-run', secret_key='dry-run')
    run_id = args.run_id or os.environ.get('GITHUB_RUN_ID') or \
        datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    if not args.snapshots.is_dir():
        print(f'Snapshot directory not found: {args.snapshots}', file=sys.stderr)
        return 1
    try:
        receipt = publish(
            args.snapshots, run_id, config,
            repo=args.repo or os.environ.get('GITHUB_REPOSITORY'),
            token=os.environ.get('GITHUB_TOKEN'),
            dry_run=args.dry_run,
        )
    except CorpusError as exc:
        print(f'Corpus publish failed: {exc}', file=sys.stderr)
        return 1
    print(json.dumps(receipt, indent=2))
    if args.receipt:
        args.receipt.write_text(json.dumps(receipt, indent=2) + '\n', encoding='utf-8')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
