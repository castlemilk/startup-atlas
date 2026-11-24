#!/usr/bin/env python3
"""Publish the DuckDB query console to the live-index bucket.

The console exists in exactly one canonical source: ``web/query.html``,
``web/query.js`` and ``web/query.css`` in this repository (the Pages site
builds and serves the same files). The copy at the root of the public
index bucket is a *published artefact* of that source — it was originally
placed by hand during the GCP bootstrap and drifted (a stale query.js
missing the edges examples is what prompted issue #439). Run this script
after changing any console file so the bucket copy is regenerated from
source, never edited in place:

    ATLAS_CORPUS_BACKEND=gcs \
    ATLAS_CORPUS_INDEX_BUCKET=<index bucket> \
    ATLAS_GCP_PROJECT=<project> \
    python3 scripts/publish_query_console.py

The vendored DuckDB/Arrow trees under ``vendor/duckdb/`` in the bucket
come from ``scripts/build.mjs``. Pass ``--from-dist dist`` after a build
to re-sync them from the build output; only do this when the DuckDB-WASM
version in package-lock has changed, and verify the console afterwards
(the loop health check covers the import map and a Parquet smoke test).

Credentials resolve the same way as the live-index publisher's
(``scripts/atlas_gcp.py``: metadata server, ADC file, or gcloud).
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from atlas_gcp import GCSConfig, client_for  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]

CONSOLE_FILES = {
    'query.html': 'text/html; charset=utf-8',
    'query.js': 'text/javascript; charset=utf-8',
    'query.css': 'text/css; charset=utf-8',
}

VENDOR_TYPES = {
    '.mjs': 'text/javascript; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.wasm': 'application/wasm',
    '.json': 'application/json',
}


def publish(client, web_dir, dist_dir=None, dry_run=False):
    uploaded = []
    for name, content_type in CONSOLE_FILES.items():
        data = (web_dir / name).read_bytes()
        if not dry_run:
            client.put_object(name, data, content_type=content_type)
            # Console files are overwritten in place on a public bucket;
            # without no-cache a stale copy can be served for up to an
            # hour (the #373 lesson). Versioned index objects stay
            # immutable and are not touched here.
            client.set_cache_control(name, 'no-cache')
        uploaded.append(name)
    if dist_dir is not None:
        vendor_dir = dist_dir / 'vendor' / 'duckdb'
        if not vendor_dir.is_dir():
            raise SystemExit(f'--from-dist {dist_dir}: {vendor_dir} not found '
                             '(run `node scripts/build.mjs` first)')
        for path in sorted(vendor_dir.rglob('*')):
            if not path.is_file():
                continue
            key = path.relative_to(dist_dir).as_posix()
            content_type = VENDOR_TYPES.get(path.suffix,
                                            'application/octet-stream')
            if not dry_run:
                client.put_object(key, path.read_bytes(),
                                  content_type=content_type)
            uploaded.append(key)
    return uploaded


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--web-dir', type=Path, default=ROOT / 'web',
                        help='Directory holding the canonical console source')
    parser.add_argument('--from-dist', type=Path, default=None,
                        help='Also sync vendor/duckdb from this build output')
    parser.add_argument('--dry-run', action='store_true',
                        help='List what would be uploaded without writing')
    args = parser.parse_args(argv)

    config = GCSConfig.from_env()
    if config.backend != 'gcs' or not config.index_bucket:
        print('GCS is not configured: set ATLAS_CORPUS_BACKEND=gcs and '
              'ATLAS_CORPUS_INDEX_BUCKET (see the module docstring).',
              file=sys.stderr)
        return 2
    client = client_for(config, bucket=config.index_bucket)
    uploaded = publish(client, args.web_dir, args.from_dist, args.dry_run)
    verb = 'would upload' if args.dry_run else 'uploaded'
    print(f'{verb} {len(uploaded)} console object(s) to '
          f'gs://{config.index_bucket}/: ' + ', '.join(uploaded[:8])
          + ('…' if len(uploaded) > 8 else ''))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
