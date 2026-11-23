#!/usr/bin/env python3
"""Build Parquet edges tables from the version-2 graph.

Reads the regenerated ``data/graph.json`` (or a ``build_graph()`` output
dict) and writes ``edges.parquet`` + ``relationships.parquet`` plus a
``manifest.json``. The two tables carry the same rows: ``edges`` is the
graph-native name and ``relationships`` is the DuckDB-facing alias the
query console / live-index indexer exposes, so both consumers read the
same content under the name they expect.

Columns: source, target, kind, description, source_url, first_seen,
last_verified, confidence, stale.

The manifest has the same shape as ``build-query-parquet.py``'s manifest
(``version``, ``generated_at``, ``source_revision``, ``tables`` mapping
each table to ``file`` / ``rows`` / ``columns``).

Requires pyarrow: ``pip install pyarrow``.

Wiring into the DuckDB query console (``build-query-parquet.py``) and the
live-index indexer (``build_live_index.py``) is a follow-up patch once
those branches merge — see the report for the exact patch text. This
module is standalone and does not import either of them.
"""
import argparse
import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

try:
    import pyarrow as pa
    import pyarrow.parquet as pq
except ImportError as exc:  # pragma: no cover - exercised by the skip test
    print(
        'graph_edges_parquet.py needs pyarrow (pip install pyarrow). '
        'Install it and re-run the build.',
        file=sys.stderr,
    )
    raise SystemExit(2) from exc

ROOT = Path(__file__).resolve().parents[1]

EDGE_COLUMNS = (
    'source', 'target', 'kind', 'description', 'source_url',
    'first_seen', 'last_verified', 'confidence', 'stale',
)

EDGE_SCHEMA = pa.schema([
    ('source', pa.string()),
    ('target', pa.string()),
    ('kind', pa.string()),
    ('description', pa.string()),
    ('source_url', pa.string()),
    ('first_seen', pa.string()),
    ('last_verified', pa.string()),
    ('confidence', pa.float64()),
    ('stale', pa.bool_()),
])


def git_revision():
    revision = os.environ.get('ATLAS_SOURCE_REVISION') or os.environ.get('GITHUB_SHA')
    if revision:
        return revision
    try:
        return subprocess.check_output(
            ['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True
        ).strip()
    except Exception:
        return ''


def edge_rows(graph):
    """One row per graph edge, in the graph's deterministic edge order."""
    rows = []
    for edge in graph.get('edges', []):
        rows.append({
            'source': edge['from'],
            'target': edge['to'],
            'kind': edge['kind'],
            'description': edge.get('description', ''),
            'source_url': edge.get('source', ''),
            'first_seen': edge.get('first_seen'),
            'last_verified': edge.get('last_verified'),
            'confidence': edge.get('confidence'),
            'stale': bool(edge.get('stale', True)),
        })
    return rows


def build_tables(graph):
    """Return {'edges': Table, 'relationships': Table} from a graph dict."""
    rows = edge_rows(graph)
    columns = [
        pa.array([row[field.name] for row in rows], type=field.type)
        for field in EDGE_SCHEMA
    ]
    table = pa.Table.from_arrays(columns, schema=EDGE_SCHEMA)
    return {'edges': table, 'relationships': table}


def build(out, graph_path=None, graph=None, source_revision=None):
    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)
    if graph is None:
        graph = json.loads(Path(graph_path or ROOT / 'data' / 'graph.json')
                           .read_text(encoding='utf-8'))
    tables = build_tables(graph)
    manifest_tables = {}
    for name, table in tables.items():
        filename = f'{name}.parquet'
        pq.write_table(table, out / filename, compression='zstd')
        manifest_tables[name] = {
            'file': filename,
            'rows': table.num_rows,
            'columns': table.column_names,
        }
    manifest = {
        'version': 1,
        'generated_at': datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z'),
        'source_revision': source_revision if source_revision is not None else git_revision(),
        'tables': manifest_tables,
    }
    (out / 'manifest.json').write_text(
        json.dumps(manifest, indent=2) + '\n', encoding='utf-8'
    )
    return manifest


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--graph', type=Path, default=ROOT / 'data' / 'graph.json')
    parser.add_argument('--out', type=Path, default=ROOT / 'dist' / 'data' / 'graph')
    args = parser.parse_args(argv)
    manifest = build(args.out, graph_path=args.graph)
    total = sum(table['rows'] for table in manifest['tables'].values())
    print(f"Wrote {len(manifest['tables'])} Parquet tables ({total} rows) to {args.out}")
    return 0


if __name__ == '__main__':
    sys.exit(main())
