#!/usr/bin/env python3
"""Build the Loom atlas export from the reviewed graph.

Loom's on-demand atlas reader (loom-core/atlas-sqlite) range-reads a SQLite
database with two tables:

    articles(topic, id, title, degree)
    edges(topic, source, target)

and a manifest listing the topics plus the inter-topic connection counts.
Each topic is a cluster of articles; opening a topic loads only that topic's
block, so the graph explorer can grow far beyond what fits in one JSON
download. The full reader (loom-core/atlas) instead fetches one JSON file
with every block, which keeps the explorer working without WebAssembly.

Mapping from the Atlas graph (data/graph.json):

- One topic per entity kind (partner, person, programme, provider,
  startup), sorted alphabetically so topic ids are stable.
- Article ids are contiguous inside a topic, assigned in sorted entity-id
  order. ``first`` is the topic's first article id, ``count`` its size.
- Degree is the number of incident edges.
- Each edge is stored under its source entity's topic, matching Loom's
  convention that a block holds the edges out of its own articles.
  Cross-topic edges appear once a reader opens both topics.
- Topic colours reuse the site's light-theme kind tokens from
  web/design-tokens.css so the atlas overview matches the explorer.
- Topic positions are a deterministic circle, radius 100.

Outputs (all under --out-dir, default dist/data):
- loom-atlas.sqlite: the range-readable database.
- loom-atlas-manifest.json: AtlasManifest plus database, databaseBytes,
  pageSize and full, as the loom docs/examples/atlas.ts publisher does.
- loom-atlas-full.json: every block as a JSON array for the full reader.

The builder only reads the committed graph.json; it never regenerates the
graph, so it stays usable while make-graph.py is blocked on a data fix.
"""
import argparse
import json
import math
import os
import sqlite3
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# Site light-theme kind tokens (web/design-tokens.css). Unknown kinds fall
# back to the neutral border-strong token.
KIND_COLORS = {
    'partner': '#6b4d6b',
    'person': '#76582a',
    'programme': '#76521b',
    'provider': '#275a62',
    'startup': '#31513b',
}
KIND_LABELS = {
    'partner': 'Partners',
    'person': 'People',
    'programme': 'Programmes',
    'provider': 'Providers',
    'startup': 'Startups',
}
FALLBACK_COLOR = '#60675d'


def label_for(kind):
    if kind in KIND_LABELS:
        return KIND_LABELS[kind]
    return kind.replace('-', ' ').title() + 's'


def build_topics(graph):
    """Assign numeric ids and topics. Returns (topics, articles, edges)."""
    entities = sorted(graph['entities'], key=lambda e: e['id'])
    seen = set()
    for entity in entities:
        if entity['id'] in seen:
            raise ValueError(f"Duplicate entity id: {entity['id']}")
        seen.add(entity['id'])
    kinds = sorted({entity['kind'] for entity in entities})
    topics = []
    article_id = {}
    articles = {}  # numeric id -> (topic, title, degree)
    degree = {entity['id']: 0 for entity in entities}
    for edge in graph['edges']:
        for end in (edge['from'], edge['to']):
            if end not in degree:
                raise ValueError(f"Graph edge refers to a missing entity: {end}")
        degree[edge['from']] += 1
        if edge['to'] != edge['from']:
            degree[edge['to']] += 1
    next_id = 0
    for topic_id, kind in enumerate(kinds):
        members = [e for e in entities if e['kind'] == kind]
        first = next_id
        for entity in members:
            article_id[entity['id']] = next_id
            articles[next_id] = (topic_id, entity['name'], degree[entity['id']])
            next_id += 1
        angle = -math.pi / 2 + 2 * math.pi * topic_id / max(len(kinds), 1)
        topics.append({
            'id': topic_id,
            'label': label_for(kind),
            'color': KIND_COLORS.get(kind, FALLBACK_COLOR),
            'first': first,
            'count': len(members),
            'x': round(100 * math.cos(angle), 2),
            'y': round(100 * math.sin(angle), 2),
        })
    edges = []
    connections = {}
    for edge in graph['edges']:
        source = article_id[edge['from']]
        target = article_id[edge['to']]
        source_topic = articles[source][0]
        target_topic = articles[target][0]
        edges.append((source_topic, source, target))
        key = (source_topic, target_topic)
        connections[key] = connections.get(key, 0) + 1
    edges.sort()
    return topics, articles, edges, sorted(
        [from_topic, to_topic, count]
        for (from_topic, to_topic), count in connections.items()
    )


def build_blocks(topics, articles, edges):
    """One AtlasBlock per topic, in topic order."""
    blocks = []
    for topic in topics:
        topic_id = topic['id']
        block_articles = sorted(
            [article_id, title, degree]
            for article_id, (article_topic, title, degree) in articles.items()
            if article_topic == topic_id
        )
        block_edges = sorted(
            [source, target]
            for (edge_topic, source, target) in edges
            if edge_topic == topic_id
        )
        blocks.append({'topic': topic_id, 'articles': block_articles, 'edges': block_edges})
    return blocks


def write_sqlite(target, topics, articles, edges, blocks, source_revision):
    target.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary_name = tempfile.mkstemp(prefix='.loom-atlas-', suffix='.sqlite', dir=target.parent)
    os.close(fd)
    temporary = Path(temporary_name)
    db = sqlite3.connect(temporary)
    try:
        db.executescript('''
          PRAGMA journal_mode=OFF;
          CREATE TABLE articles (topic INTEGER NOT NULL, id INTEGER NOT NULL, title TEXT NOT NULL, degree INTEGER NOT NULL, PRIMARY KEY(topic, id));
          CREATE TABLE edges (topic INTEGER NOT NULL, source INTEGER NOT NULL, target INTEGER NOT NULL);
          CREATE INDEX edges_topic ON edges(topic);
          CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        ''')
        db.executemany(
            'INSERT INTO articles VALUES (?,?,?,?)',
            [(topic, article_id, title, degree) for article_id, (topic, title, degree) in sorted(articles.items())],
        )
        db.executemany('INSERT INTO edges VALUES (?,?,?)', edges)
        db.executemany('INSERT INTO metadata VALUES (?,?)', [
            ('schema_version', '1'),
            ('source_revision', source_revision or ''),
            ('entity_count', str(len(articles))),
            ('edge_count', str(len(edges))),
            ('topic_count', str(len(topics))),
        ])
        db.commit()
        if db.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
            raise ValueError('SQLite integrity check failed')
        page_size = db.execute('PRAGMA page_size').fetchone()[0]
        db.execute('VACUUM')
    except BaseException:
        db.close()
        temporary.unlink(missing_ok=True)
        raise
    else:
        db.close()
        try:
            temporary.replace(target)
        finally:
            temporary.unlink(missing_ok=True)
    return page_size


def atomic_write_text(target, content):
    target.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary_name = tempfile.mkstemp(prefix='.loom-atlas-', suffix='.tmp', dir=target.parent)
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as handle:
            handle.write(content)
        Path(temporary_name).replace(target)
    except BaseException:
        Path(temporary_name).unlink(missing_ok=True)
        raise


def build(source, out_dir):
    graph = json.loads(source.read_text(encoding='utf-8'))
    topics, articles, edges, connections = build_topics(graph)
    blocks = build_blocks(topics, articles, edges)
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    database = out_dir / 'loom-atlas.sqlite'
    page_size = write_sqlite(database, topics, articles, edges, blocks, graph.get('source_revision', ''))
    database_bytes = database.stat().st_size
    if database_bytes % page_size != 0:
        raise ValueError('Atlas database size is not a whole number of SQLite pages')
    manifest = {
        'topics': topics,
        'connections': connections,
        'database': 'loom-atlas.sqlite',
        'databaseBytes': database_bytes,
        'pageSize': page_size,
        'full': 'loom-atlas-full.json',
    }
    atomic_write_text(out_dir / 'loom-atlas-manifest.json', json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    atomic_write_text(out_dir / 'loom-atlas-full.json', json.dumps(blocks, ensure_ascii=False, separators=(',', ':')) + '\n')
    print(f'Built Loom atlas: {len(topics)} topics, {len(articles)} articles, {len(edges)} edges, {database_bytes} bytes')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', type=Path, default=ROOT / 'data/graph.json')
    parser.add_argument('--out-dir', type=Path, default=ROOT / 'dist/data')
    args = parser.parse_args()
    build(args.source, args.out_dir)
