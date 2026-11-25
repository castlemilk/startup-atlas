#!/usr/bin/env python3
"""Publish the reviewed corpus (the allowlisted data/*.json files) to the corpus bucket.

Issue #376: a merged change under data/ used to wait for the next crawl
(or a manual live-index bootstrap) before the corpus — and therefore the
live index — saw it. The ``publish-reviewed-corpus`` workflow runs this
script on every push to main that touches a reviewed file; the 15-minute
indexer then rebuilds from the new manifest on its next tick.

Configuration comes from the environment, exactly like the other corpus
publishers: ATLAS_CORPUS_BACKEND=gcs with ATLAS_CORPUS_BUCKET (plus the
GCP workload-identity credentials in CI). With no backend configured the
script exits 2 without touching anything, so it is safe to run locally.
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from atlas_corpus import CorpusConfig, CorpusError  # noqa: E402
from atlas_gcp import is_configured  # noqa: E402
from build_live_index import publish_reviewed_corpus_if_changed  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--corpus-dir', type=Path, default=ROOT / 'data',
                        help='Directory holding the reviewed JSON inputs')
    parser.add_argument('--source-revision', default='',
                        help='Source revision to record in the manifest')
    args = parser.parse_args(argv)

    config = CorpusConfig.from_env()
    if not is_configured(config):
        print('Object storage is not configured: set ATLAS_CORPUS_BACKEND=gcs '
              'with ATLAS_CORPUS_BUCKET (GCP), or the ATLAS_CORPUS_* S3/R2 '
              'variables.', file=sys.stderr)
        return 2
    try:
        manifest, receipt = publish_reviewed_corpus_if_changed(
            args.corpus_dir, config, args.source_revision)
    except CorpusError as exc:
        print(str(exc), file=sys.stderr)
        return 1
    if receipt['status'] == 'unchanged':
        # Explicit no-op publication receipt (issue #150 A3): the validated
        # candidate is byte-identical to the already-published corpus.
        print(f"No-op publication receipt: {json.dumps(receipt, sort_keys=True)}")
        return 0
    print(f"Published reviewed corpus sha256 {manifest['sha256']} "
          f"({len(manifest['files'])} files) from {args.corpus_dir}")
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
