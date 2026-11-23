#!/usr/bin/env python3
"""Estimate the live-index pipeline's speed, compression and cost from live data.

Read-only: lists the two GCS buckets, the Cloud Run job's executions and
the partner-research workflow runs, then prints the measured numbers and
a monthly cost estimate. GCP prices below are November 2026 list prices
for australia-southeast1, labelled approximate — they are for planning,
not billing. Cloud Run's free tier (180,000 vCPU-seconds and 360,000
GiB-seconds per month) usually covers this pipeline entirely.

    python3 scripts/estimate_live_index_cost.py [--console-visits-per-month N]

Requires the ATLAS_CORPUS_* environment (see infra/GCP-BOOTSTRAP.md).
The index bucket is public, so its numbers need no credentials; the
corpus bucket and Cloud Run executions use Application Default
Credentials.
"""

import argparse
import http.client
import json
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from atlas_corpus import CorpusConfig  # noqa: E402
from atlas_gcp import get_access_token  # noqa: E402

GCS_API = 'https://storage.googleapis.com/storage/v1/b'
RUN_API = 'https://run.googleapis.com/v2/projects'
GH_API = ('https://api.github.com/repos/castlemilk/startup-atlas/'
          'actions/workflows/partner-research.yml/runs?per_page=8')

# November 2026 GCP list prices (approximate, australia-southeast1).
PRICE_GCS_GB_MONTH = 0.020
PRICE_CLASS_A_PER_10K = 0.05
PRICE_EGRESS_PER_GB = 0.12
PRICE_VCPU_SECOND = 0.000024
PRICE_GIB_SECOND = 0.0000025
FREE_VCPU_SECONDS_MONTH = 180_000
FREE_GIB_SECONDS_MONTH = 360_000


def _get(url, token=None, attempts=5):
    """GET a JSON document, retrying truncated reads.

    The bucket listings are large enough that a read can come back
    short (http.client.IncompleteRead) — that is a flaky network read,
    not a missing resource, so retry before giving up. Build a fresh
    Request on every attempt: reusing one across retries makes Google's
    front-end answer HTTP 400 (verified 23 Nov 2026).
    """
    last = None
    for attempt in range(attempts):
        req = urllib.request.Request(url)
        if token:
            req.add_header('Authorization', f'Bearer {token}')
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                return json.load(resp)
        except (http.client.IncompleteRead, urllib.error.URLError,
                ConnectionError, TimeoutError) as exc:
            # IncompleteRead: truncated body. RemoteDisconnected (a
            # ConnectionError): the connection dropped before any
            # response. Both are transport flakes on this VM, not
            # missing resources, so retry before giving up.
            last = exc
            time.sleep(2 * (attempt + 1))
    raise last


def _list_objects(bucket, prefix, token=None):
    items, page = [], None
    while True:
        # Small pages: a 1,000-item listing is ~26 KB and this VM's
        # network truncates reads that large (IncompleteRead) often
        # enough that even retries fail; even 100-item pages (~11 KB)
        # truncate. 25-item pages are ~3 KB and complete reliably.
        url = (f'{GCS_API}/{bucket}/o?prefix={prefix}'
               f'&fields=items(name,size,updated),nextPageToken'
               f'&maxResults=25')
        if page:
            url += f'&pageToken={page}'
        d = _get(url, token)
        items += d.get('items', [])
        page = d.get('nextPageToken')
        if not page:
            return items


def _parse_time(value):
    return datetime.fromisoformat(value.replace('Z', '+00:00'))


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--console-visits-per-month', type=int, default=100,
                        help='Assumed first-load console visits/month '
                             '(default: 100).')
    args = parser.parse_args(argv)
    config = CorpusConfig.from_env()
    token = None
    try:
        token = get_access_token()
    except Exception:
        pass  # Public-bucket numbers still work without credentials.

    now = datetime.now(timezone.utc)

    # --- Index bucket: versions, storage, compression -------------------
    index_items = _list_objects(config.index_bucket or
                                'single-station-515408-g9-atlas-index',
                                'v1/')
    versions = sorted({i['name'].split('/')[1] for i in index_items})
    index_bytes = sum(int(i['size']) for i in index_items)
    day_ago = now - timedelta(days=1)
    # Version stamps are YYYYMMDDTHHMMSSZ; parse them directly.
    recent = [v for v in versions
              if datetime.strptime(v[:15], '%Y%m%dT%H%M%S')
              .replace(tzinfo=timezone.utc) > day_ago]
    pointer = _get(f'https://storage.googleapis.com/'
                   f'{config.index_bucket or "single-station-515408-g9-atlas-index"}/latest.json')
    manifest = _get(f'https://storage.googleapis.com/'
                    f'{config.index_bucket or "single-station-515408-g9-atlas-index"}/'
                    f'{pointer["manifest"]}')
    tables = manifest['tables']
    rows = sum(t['rows'] for t in tables.values())
    # Per-table bytes: prefer the manifest field (recorded since the
    # instrumentation change); older manifests lack it, so fall back to
    # the bucket listing for the current version dir.
    if all('bytes' in t for t in tables.values()):
        table_bytes = sum(t['bytes'] for t in tables.values())
    else:
        version_items = _list_objects(
            config.index_bucket or 'single-station-515408-g9-atlas-index',
            f'v1/{pointer["version"]}/')
        table_bytes = sum(int(i['size']) for i in version_items
                          if i['name'].endswith('.parquet'))
    corpus_files = manifest['corpus']['files']
    corpus_json_bytes = sum(f['bytes'] for f in corpus_files.values())

    # --- Console first-load payload ------------------------------------
    # selectBundle() loads ONE wasm bundle (mvp or eh) + its worker, plus
    # duckdb-browser.mjs, the vendored apache-arrow tree, flatbuffers,
    # tslib, query.js and query.css. Sum those paths, not the whole vendor
    # dir (which holds both bundles).
    vendor_items = _list_objects(
        config.index_bucket or 'single-station-515408-g9-atlas-index',
        'vendor/duckdb/')
    root_items = _list_objects(
        config.index_bucket or 'single-station-515408-g9-atlas-index',
        'query.')
    by_name = {i['name']: int(i['size'])
               for i in vendor_items + root_items}
    wasm = by_name.get('vendor/duckdb/duckdb-mvp.wasm', 0)
    worker = by_name.get('vendor/duckdb/duckdb-browser-mvp.worker.js', 0)
    main_mjs = by_name.get('vendor/duckdb/duckdb-browser.mjs', 0)
    arrow = sum(s for n, s in by_name.items()
                if n.startswith('vendor/duckdb/apache-arrow/'))
    flatbuffers = sum(s for n, s in by_name.items()
                      if n.startswith('vendor/duckdb/flatbuffers/'))
    tslib = by_name.get('vendor/duckdb/tslib.mjs', 0)
    query_js = by_name.get('query.js', 0)
    query_css = by_name.get('query.css', 0)
    first_load = (wasm + worker + main_mjs + arrow + flatbuffers + tslib
                  + query_js + query_css)

    # --- Corpus bucket ---------------------------------------------------
    corpus_bucket = config.bucket or 'single-station-515408-g9-atlas-corpus'
    corpus_items = []
    if token and corpus_bucket:
        try:
            corpus_items = _list_objects(corpus_bucket, 'corpus/', token)
        except Exception as exc:  # noqa: BLE001 - report, don't fail
            print(f'corpus bucket unreadable: {exc}', file=sys.stderr)
    corpus_bytes = sum(int(i['size']) for i in corpus_items)

    # --- Cloud Run executions (last 100) ---------------------------------
    import os
    project = os.environ.get('ATLAS_GCP_PROJECT',
                             'single-station-515408-g9')
    execs = []
    if token and project:
        try:
            d = _get(f'{RUN_API}/{project}/locations/'
                     f'{config.region if config.region != "auto" else "australia-southeast1"}/jobs/'
                     f'atlas-live-indexer/executions?pageSize=100', token)
            execs = d.get('executions', [])
        except Exception as exc:  # noqa: BLE001
            print(f'Cloud Run executions unreadable: {exc}', file=sys.stderr)
    durations = []
    for e in execs:
        if e.get('createTime') and e.get('completionTime'):
            durations.append((_parse_time(e['completionTime']) -
                              _parse_time(e['createTime'])).total_seconds())
    durations.sort()
    median_duration = durations[len(durations) // 2] if durations else 0
    # Run rate from the median gap between consecutive versions (the
    # system is only hours old, so a 24h count understates the tick).
    version_times = sorted(datetime.strptime(v[:15], '%Y%m%dT%H%M%S')
                           .replace(tzinfo=timezone.utc) for v in versions)
    gaps = [(b - a).total_seconds()
            for a, b in zip(version_times, version_times[1:])]
    gaps.sort()
    median_gap = gaps[len(gaps) // 2] if gaps else 900
    runs_day = int(86400 / max(median_gap, 1))

    # --- Crawl runs --------------------------------------------------------
    crawls = []
    try:
        d = _get(GH_API)
        for r in d.get('workflow_runs', []):
            crawls.append((
                r['id'],
                (_parse_time(r['updated_at']) -
                 _parse_time(r['created_at'])).total_seconds() / 60,
                r['conclusion']))
    except Exception as exc:  # noqa: BLE001
        print(f'GitHub runs unreadable: {exc}', file=sys.stderr)

    # --- Print -------------------------------------------------------------
    print('== Speed (measured) ==')
    if crawls:
        print(f'crawl: {len(crawls)} recent runs, '
              f'{min(c[1] for c in crawls):.1f}-{max(c[1] for c in crawls):.1f} min, '
              f'{sum(1 for c in crawls if c[2] == "success")}/{len(crawls)} succeeded')
    if durations:
        print(f'indexer execution (incl. container start): '
              f'{min(durations):.1f}-{max(durations):.1f}s '
              f'(median {median_duration:.1f}s, n={len(durations)})')
    print(f'index versions in the last 24h: {len(recent)} '
          f'({len(versions)} total, {len(index_items)} objects); '
          f'median gap between versions {median_gap / 60:.0f} min')
    print(f'console first-load payload: {first_load / 1e6:.1f} MB '
          f'(WASM {wasm / 1e6:.1f} MB, {100 * wasm / max(first_load, 1):.0f}% of it)')
    print()
    print('== Compression (measured) ==')
    print(f'reviewed JSON -> Parquet: {corpus_json_bytes:,} -> '
          f'{table_bytes:,} bytes = {corpus_json_bytes / max(table_bytes, 1):.2f}x '
          f'({100 * (1 - table_bytes / max(corpus_json_bytes, 1)):.1f}% smaller), '
          f'{rows} rows, {table_bytes / max(rows, 1):.0f} bytes/row')
    print(f'index version on disk: {table_bytes + 3098:,} bytes '
          f'(tables + manifest)')
    print()
    print('== Cost (estimated, list prices, approximate) ==')
    index_gb = index_bytes / 1e9
    corpus_gb = corpus_bytes / 1e9
    vcpu_s_day = runs_day * median_duration
    gib_s_day = vcpu_s_day * 2  # job requests 2 GiB
    # Steady-state index storage at the current publish rate, 90-day retention.
    steady_gb = runs_day * (index_bytes / max(len(versions), 1)) / 1e9 * 90
    storage_mo = steady_gb * PRICE_GCS_GB_MONTH + corpus_gb * PRICE_GCS_GB_MONTH
    ops_mo = runs_day * 11 * 30 / 10_000 * PRICE_CLASS_A_PER_10K
    run_mo = (max(vcpu_s_day * 30 - FREE_VCPU_SECONDS_MONTH, 0) * PRICE_VCPU_SECOND
              + max(gib_s_day * 30 - FREE_GIB_SECONDS_MONTH, 0) * PRICE_GIB_SECOND)
    egress_mo = (args.console_visits_per_month * first_load / 1e9
                 * PRICE_EGRESS_PER_GB)
    print(f'index bucket now: {len(versions)} versions, '
          f'{len(index_items)} objects, {index_bytes:,} bytes')
    print(f'corpus bucket now: {len(corpus_items)} objects, '
          f'{corpus_bytes:,} bytes (no lifecycle rule — grows unbounded)')
    print(f'scheduler runs: ~{runs_day}/day (median version gap '
          f'{median_gap / 60:.0f} min); '
          f'steady-state index storage at 90-day retention: ~{steady_gb:.2f} GB')
    print(f'estimated monthly: storage ${storage_mo:.2f} + '
          f'writes ${ops_mo:.2f} + Cloud Run ${run_mo:.2f} '
          f'(free tier covers it at this rate) + egress '
          f'${egress_mo:.2f} at {args.console_visits_per_month} console '
          f'visits/month = ~${storage_mo + ops_mo + run_mo + egress_mo:.2f}/month')
    print(f'if issue #373 is fixed (publish only on change, ~5 runs/day): '
          f'writes and runs drop ~95%; egress (WASM downloads) dominates.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
