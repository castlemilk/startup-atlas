#!/usr/bin/env python3
"""Build the versioned live index from the reviewed corpus.

The async half of the live-index pipeline: read the reviewed data files
(either from a local directory or downloaded from the private corpus bucket),
rebuild the DuckDB Parquet tables with the same generator the static build
uses (``scripts/build-query-parquet.py``), and write a new immutable index
version plus a ``latest.json`` pointer.

    latest.json
    v1/<version>/manifest.json
    v1/<version>/<table>.parquet

The staging directory mirrors the index bucket layout exactly, so serving
it over HTTP reproduces what the browser fetches from the bucket.

The version is content-addressed (UTC timestamp + short sha of the reviewed
manifest), so rebuilding unchanged inputs is a no-op: the indexer exits 0
with "index up to date" and uploads nothing. ``--publish`` uploads the new
version to the public index bucket, writing ``latest.json`` last so readers
never see a half-published version.

Triggers: the ``live-index`` GitHub Actions workflow (15-minute schedule,
``repository_dispatch`` from the crawl/MCP publishers, manual dispatch).
No credentials are needed for a local build from ``--corpus-dir``.
"""
import argparse
import importlib.util
import json
import shutil
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from atlas_corpus import (  # noqa: E402
    REVIEWED_FILES,
    CorpusConfig,
    CorpusError,
    index_latest_key,
    index_manifest_key,
    index_table_key,
    latest_pointer,
    make_index_version,
    reviewed_key,
    reviewed_manifest,
    reviewed_manifest_key,
)
from atlas_gcp import client_for, is_configured  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]


def load_parquet_builder():
    spec = importlib.util.spec_from_file_location(
        'atlas_query_parquet', ROOT / 'scripts' / 'build-query-parquet.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def read_reviewed_files(data_dir):
    """Return {filename: bytes} for the four reviewed files, or raise."""
    data_dir = Path(data_dir)
    missing = [name for name in REVIEWED_FILES if not (data_dir / name).is_file()]
    if missing:
        raise CorpusError(
            f'Reviewed corpus at {data_dir} is missing: {", ".join(missing)}')
    return {name: (data_dir / name).read_bytes() for name in REVIEWED_FILES}


def download_reviewed_corpus(client, dest_dir):
    """Download reviewed/ from the corpus bucket; returns {filename: bytes}."""
    try:
        manifest = client.get_json(reviewed_manifest_key())
    except CorpusError as exc:
        raise CorpusError(
            'Reviewed corpus is not published yet (no '
            'corpus/v1/reviewed/manifest.json). Bootstrap with '
            '--corpus-dir data on the first run.'
        ) from exc
    dest_dir = Path(dest_dir)
    dest_dir.mkdir(parents=True, exist_ok=True)
    files = {}
    for name in REVIEWED_FILES:
        data = client.get_object(reviewed_key(name))
        (dest_dir / name).write_bytes(data)
        files[name] = data
    (dest_dir / 'manifest.json').write_text(
        json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    return files


def read_local_pointer(out_dir):
    pointer_path = Path(out_dir) / 'latest.json'
    if not pointer_path.is_file():
        return None
    try:
        return json.loads(pointer_path.read_text(encoding='utf-8'))
    except (json.JSONDecodeError, OSError):
        return None


def read_local_index_manifest(out_dir, pointer):
    if not pointer or not pointer.get('manifest'):
        return None
    # The pointer's manifest path is bucket-relative (v1/<v>/manifest.json)
    # and the staging directory mirrors the bucket layout exactly, so the
    # same path resolves locally.
    manifest_path = Path(out_dir) / pointer['manifest']
    if not manifest_path.is_file():
        return None
    try:
        return json.loads(manifest_path.read_text(encoding='utf-8'))
    except (json.JSONDecodeError, OSError):
        return None


def read_remote_pointer(client):
    """Fetch latest.json from the index bucket; None when it is absent.

    Cloud Run's out dir is ephemeral, so the local pointer never survives
    a run: the indexer must compare against the published pointer, not
    the local one, or it republishes a new version every 15 minutes even
    when the corpus is unchanged (issue #373).
    """
    try:
        return client.get_json(index_latest_key())
    except (CorpusError, ValueError):
        return None


def read_remote_index_manifest(client, pointer):
    """Fetch the manifest the remote pointer names; None when it is absent."""
    if not pointer or not pointer.get('version'):
        return None
    try:
        return client.get_json(index_manifest_key(pointer['version']))
    except (CorpusError, ValueError):
        return None


def build_index(corpus_dir, out_dir, source_revision='', now=None, force=False,
                bootstrapped=False, remote_pointer=None, remote_manifest=None):
    """Build (or confirm up to date) the index from a local corpus dir.

    Returns (version, manifest, changed). Writes the version directory and
    ``latest.json`` under out_dir when changed. ``bootstrapped`` records
    that the input came from the repo checkout because the corpus bucket
    had no reviewed files yet (first run only). ``remote_pointer`` and
    ``remote_manifest`` are the published latest.json and the manifest it
    names; they are the current state when the local out dir is ephemeral
    (Cloud Run), so an unchanged corpus is a no-op there too.
    """
    now = now or datetime.now(timezone.utc)
    out_dir = Path(out_dir)
    files = read_reviewed_files(corpus_dir)
    manifest = reviewed_manifest(files, source_revision, now)
    current_pointer = read_local_pointer(out_dir) or remote_pointer
    current_manifest = read_local_index_manifest(out_dir, current_pointer)
    if current_manifest is None and remote_manifest is not None:
        current_manifest = remote_manifest
    current_sha = (current_manifest or {}).get('corpus', {}).get(
        'reviewed_manifest_sha256')
    if not force and current_sha == manifest['sha256'] and current_pointer:
        return current_pointer['version'], current_manifest, False

    builder = load_parquet_builder()
    version = make_index_version(now, manifest['sha256'])
    version_dir = out_dir / 'v1' / version
    version_dir.mkdir(parents=True, exist_ok=True)
    tables = builder.build_tables(Path(corpus_dir))
    import pyarrow.parquet as pq
    manifest_tables = {}
    for name, table in tables.items():
        table_path = version_dir / f'{name}.parquet'
        pq.write_table(table, table_path, compression='zstd')
        # Record the compressed size per table so speed/cost/compression
        # can be measured from the manifest alone, without listing the
        # bucket (see docs/LIVE-INDEX-LOOP.md, "Instrumentation").
        manifest_tables[name] = {
            'file': f'{name}.parquet',
            'rows': table.num_rows,
            'columns': table.column_names,
            'bytes': table_path.stat().st_size,
        }
    index_manifest = {
        'version': 1,
        'index_version': version,
        'generated_at': now.isoformat().replace('+00:00', 'Z'),
        'source_revision': source_revision,
        'previous_version': current_pointer.get('version') if current_pointer else None,
        'corpus': {
            'reviewed_manifest_sha256': manifest['sha256'],
            'files': manifest['files'],
            'bootstrapped': bootstrapped,
        },
        'tables': manifest_tables,
    }
    (version_dir / 'manifest.json').write_text(
        json.dumps(index_manifest, indent=2) + '\n', encoding='utf-8')
    pointer = latest_pointer(
        version, index_manifest_key(version),
        index_manifest['generated_at'], source_revision, manifest_tables)
    (out_dir / 'latest.json').write_text(
        json.dumps(pointer, indent=2) + '\n', encoding='utf-8')
    return version, index_manifest, True


def publish_reviewed_corpus(corpus_dir, config, source_revision='', now=None):
    """Upload the four reviewed files + manifest to the corpus bucket.

    Used on the bootstrap run so the corpus becomes the source of truth for
    later runs. Returns the reviewed manifest.
    """
    now = now or datetime.now(timezone.utc)
    files = read_reviewed_files(corpus_dir)
    manifest = reviewed_manifest(files, source_revision, now)
    client = client_for(config)
    for name, data in files.items():
        client.put_object(reviewed_key(name), data, 'application/json')
    client.put_json(reviewed_manifest_key(), manifest)
    return manifest


def publish_index(out_dir, version, manifest, config):
    """Upload a built version directory + pointer to the index bucket."""
    client = client_for(config, bucket=config.index_bucket or config.bucket)
    version_dir = Path(out_dir) / 'v1' / version
    uploaded = []
    for name in manifest['tables']:
        uploaded.append(client.put_object(
            index_table_key(version, name),
            (version_dir / f'{name}.parquet').read_bytes(),
            'application/vnd.apache.parquet'))
    uploaded.append(client.put_json(
        index_manifest_key(version),
        json.loads((version_dir / 'manifest.json').read_text(encoding='utf-8'))))
    # Pointer last: a reader that sees the new pointer sees a complete version.
    pointer = json.loads((Path(out_dir) / 'latest.json').read_text(encoding='utf-8'))
    uploaded.append(client.put_json(index_latest_key(), pointer))
    # latest.json is the one object overwritten in place, and the index
    # bucket is publicly readable: with no explicit Cache-Control a
    # publicly readable object may be served from Google's download
    # cache for up to an hour after an overwrite. That stale read is
    # what kept the scheduler republishing after the #373 fix — every
    # tick read the pre-change pointer, saw a different corpus sha in
    # its manifest, and rebuilt. Mark the pointer no-cache so readers
    # (the indexer itself, the query console) always revalidate. The
    # versioned objects are immutable and need no such handling. Only
    # the GCS client implements set_cache_control; other backends are
    # left as-is.
    set_cache_control = getattr(client, 'set_cache_control', None)
    if set_cache_control is not None:
        set_cache_control(index_latest_key(), 'no-cache')
    return uploaded


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument('--corpus-dir', type=Path,
                        help='Local directory holding the reviewed JSON files')
    source.add_argument('--corpus-store', action='store_true',
                        help='Download the reviewed corpus from object storage')
    parser.add_argument('--out', type=Path, default=ROOT / 'live-index',
                        help='Staging directory for the built index versions')
    parser.add_argument('--source-revision', default=None,
                        help='Source revision to record (default: git HEAD)')
    parser.add_argument('--publish', action='store_true',
                        help='Upload the new version to the index bucket')
    parser.add_argument('--force', action='store_true',
                        help='Rebuild even when the corpus is unchanged')
    parser.add_argument('--bootstrap-from', type=Path, default=None,
                        help='With --corpus-store, build from this local dir '
                             'and seed the corpus when the bucket has no '
                             'reviewed files yet (first run only)')
    args = parser.parse_args(argv)

    builder = load_parquet_builder()
    source_revision = args.source_revision or builder.git_revision()
    config = CorpusConfig.from_env()
    out_dir = args.out
    out_dir.mkdir(parents=True, exist_ok=True)
    # Stage timings, printed at the end so each run reports its own
    # download+build and publish durations (see "Instrumentation" in
    # docs/LIVE-INDEX-LOOP.md).
    t0 = time.monotonic()

    if args.corpus_store:
        if not is_configured(config):
            print('Object storage is not configured: set ATLAS_CORPUS_BACKEND=gcs '
                  'with ATLAS_CORPUS_BUCKET (GCP), or the ATLAS_CORPUS_* S3/R2 '
                  'variables.', file=sys.stderr)
            return 1
        client = client_for(config)
        tmp = tempfile.TemporaryDirectory()
        try:
            try:
                download_reviewed_corpus(client, tmp.name)
            except CorpusError as exc:
                if args.bootstrap_from and 'not published yet' in str(exc):
                    print(f'{exc} Bootstrapping from {args.bootstrap_from}.')
                    version, manifest, changed = build_index(
                        args.bootstrap_from, out_dir, source_revision,
                        force=args.force, bootstrapped=True)
                    # Seed even when the index itself is unchanged: the corpus
                    # is still empty and later runs must be able to use it.
                    seeded = publish_reviewed_corpus(
                        args.bootstrap_from, config, source_revision)
                    print(f'Seeded the reviewed corpus ({len(seeded["files"])} files).')
                else:
                    raise
            else:
                # The scheduler runs with --publish on an ephemeral out
                # dir, so the local pointer never survives a run: compare
                # against the published pointer instead (issue #373).
                # Without this the indexer republishes a new version every
                # 15 minutes even when the corpus is unchanged.
                remote_pointer = remote_manifest = None
                if args.publish:
                    index_client = client_for(
                        config, bucket=config.index_bucket or config.bucket)
                    remote_pointer = read_remote_pointer(index_client)
                    remote_manifest = read_remote_index_manifest(
                        index_client, remote_pointer)
                version, manifest, changed = build_index(
                    tmp.name, out_dir, source_revision, force=args.force,
                    remote_pointer=remote_pointer,
                    remote_manifest=remote_manifest)
        except CorpusError as exc:
            print(str(exc), file=sys.stderr)
            return 1
        finally:
            tmp.cleanup()
    else:
        try:
            version, manifest, changed = build_index(
                args.corpus_dir, out_dir, source_revision, force=args.force)
        except CorpusError as exc:
            print(str(exc), file=sys.stderr)
            return 1

    if not changed:
        print(f'Index up to date at {version}; nothing to publish '
              f'(download+build {time.monotonic() - t0:.1f}s).')
        return 0
    total = sum(table['rows'] for table in manifest['tables'].values())
    total_bytes = sum(table.get('bytes', 0)
                      for table in manifest['tables'].values())
    print(f'Built index {version}: {len(manifest["tables"])} tables, '
          f'{total} rows, {total_bytes} bytes, from '
          f'{manifest["corpus"]["reviewed_manifest_sha256"][:12]} '
          f'(download+build {time.monotonic() - t0:.1f}s).')
    if args.publish:
        if not is_configured(config):
            print('Object storage is not configured: set ATLAS_CORPUS_BACKEND=gcs '
                  'with ATLAS_CORPUS_BUCKET (GCP), or the ATLAS_CORPUS_* S3/R2 '
                  'variables.', file=sys.stderr)
            return 1
        if not config.index_bucket:
            print('ATLAS_CORPUS_INDEX_BUCKET is not set; cannot publish.',
                  file=sys.stderr)
            return 1
        publish_started = time.monotonic()
        uploaded = publish_index(out_dir, version, manifest, config)
        print(f'Published {len(uploaded)} objects to {config.index_bucket}; '
              f'latest.json now points at {version} '
              f'(publish {time.monotonic() - publish_started:.1f}s).')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
