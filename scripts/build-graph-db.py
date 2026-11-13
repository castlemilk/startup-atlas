#!/usr/bin/env python3
"""Compile reviewed public catalogue and graph data into a SQLite snapshot."""
import argparse
import hashlib
import json
import os
import sqlite3
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# Explicitly list public inputs. An unreviewed file added under data/ must not
# accidentally become downloadable just because it has a familiar extension.
PUBLIC_DATA_FILES = (
    'catalogue.json', 'graph.json', 'land.geojson', 'map-locations.json',
    'opportunities-added.json', 'partner-leads.json', 'partner-logo-seeds.csv',
    'partner-profiles.json', 'partner-sources.json', 'partners-reviewed.json',
    'program-sources.json', 'startup-news-sources.json', 'startup-research.json',
)


def read_public_data(data_dir):
    documents, parsed = {}, {}
    for name in PUBLIC_DATA_FILES:
        content = (data_dir / name).read_bytes().decode('utf-8')
        documents[name] = content
        if name.endswith(('.json', '.geojson')):
            parsed[name] = json.loads(content)
    return documents, parsed


def read_mappings():
    result = subprocess.run(
        ['node', str(ROOT / 'scripts/export-database-mappings.mjs')],
        check=True, capture_output=True, text=True, cwd=ROOT,
    )
    return json.loads(result.stdout)


def build(source, target, data_dir=None, mappings=None):
    graph = json.loads(source.read_text(encoding='utf-8'))
    documents, data = read_public_data(data_dir) if data_dir else ({}, {})
    if data_dir and mappings is None:
        mappings = read_mappings()
    mappings = mappings or {}
    target.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary_name = tempfile.mkstemp(prefix='.atlas-', suffix='.sqlite', dir=target.parent)
    os.close(fd)
    temporary = Path(temporary_name)
    db = sqlite3.connect(temporary)
    try:
        db.executescript('''
          PRAGMA journal_mode=OFF;
          CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
          CREATE TABLE entities (id TEXT PRIMARY KEY, kind TEXT NOT NULL, name TEXT NOT NULL, data TEXT NOT NULL);
          CREATE TABLE edges (source_id TEXT NOT NULL, target_id TEXT NOT NULL, data TEXT NOT NULL);
          CREATE INDEX edges_source ON edges(source_id);
          CREATE INDEX edges_target ON edges(target_id);
          CREATE TABLE funding_rounds (startup_id TEXT NOT NULL, announced_on TEXT, data TEXT NOT NULL);
          CREATE INDEX funding_startup ON funding_rounds(startup_id);
          CREATE TABLE articles (startup_id TEXT NOT NULL, published_on TEXT, data TEXT NOT NULL);
          CREATE INDEX articles_startup ON articles(startup_id);
          CREATE TABLE source_documents (path TEXT PRIMARY KEY, sha256 TEXT NOT NULL, content TEXT NOT NULL);
          CREATE TABLE opportunities (id TEXT PRIMARY KEY, name TEXT NOT NULL, provider TEXT NOT NULL, data TEXT NOT NULL, addition_data TEXT);
          CREATE TABLE partner_records (name TEXT PRIMARY KEY, reviewed_data TEXT, profile_data TEXT);
          CREATE TABLE locations (id TEXT PRIMARY KEY, data TEXT NOT NULL);
          CREATE TABLE logo_mappings (name TEXT PRIMARY KEY, data TEXT NOT NULL);
          CREATE TABLE provider_relationships (partner TEXT NOT NULL, ordinal INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY(partner, ordinal));
          CREATE VIRTUAL TABLE entity_search USING fts4(id, name, summary, connections, tokenize=unicode61);
        ''')
        encode = lambda value: json.dumps(value, ensure_ascii=False, separators=(',', ':'))
        entities = {item['id']: item for item in graph['entities']}
        related = {identity: [] for identity in entities}
        for edge in graph['edges']:
            if edge['from'] not in entities or edge['to'] not in entities:
                raise ValueError('Graph edge refers to a missing entity')
            related[edge['from']].append(entities[edge['to']]['name'])
            related[edge['to']].append(entities[edge['from']]['name'])
            db.execute('INSERT INTO edges VALUES (?,?,?)', (edge['from'], edge['to'], encode(edge)))
        for event in graph['funding_rounds']:
            if event['startup_id'] not in entities: raise ValueError('Funding event refers to a missing startup')
            related[event['startup_id']].extend((event.get('stage', ''), event.get('note', '')))
            db.execute('INSERT INTO funding_rounds VALUES (?,?,?)', (event['startup_id'], event.get('announced_on'), encode(event)))
        for article in graph['articles']:
            if article['startup_id'] not in entities: raise ValueError('Article refers to a missing startup')
            related[article['startup_id']].append(article.get('title', ''))
            db.execute('INSERT INTO articles VALUES (?,?,?)', (article['startup_id'], article.get('published_on'), encode(article)))
        for item in graph['entities']:
            db.execute('INSERT INTO entities VALUES (?,?,?,?)', (item['id'], item['kind'], item['name'], encode(item)))
            db.execute('INSERT INTO entity_search VALUES (?,?,?,?)', (item['id'], item['name'], item.get('summary', ''), ' '.join(related[item['id']])))
        for name, content in documents.items():
            db.execute('INSERT INTO source_documents VALUES (?,?,?)',
                       (name, hashlib.sha256(content.encode('utf-8')).hexdigest(), content))
        if data:
            addition_entries = data['opportunities-added.json']['entries']
            additions = {item['entry']['id']: item for item in addition_entries}
            if len(additions) != len(addition_entries): raise ValueError('Duplicate added opportunity identifiers')
            for item in data['catalogue.json']['opportunities']:
                addition = additions.pop(item['id'], None)
                if addition and addition['entry'] != item:
                    raise ValueError(f'Added opportunity differs from catalogue: {item["id"]}')
                db.execute('INSERT INTO opportunities VALUES (?,?,?,?,?)',
                           (item['id'], item['name'], item['org'], encode(item), encode(addition) if addition else None))
            if additions: raise ValueError(f'Added opportunities absent from catalogue: {sorted(additions)}')
            reviewed, profiles = data['partners-reviewed.json'], data['partner-profiles.json']
            for name in sorted(set(data['partner-leads.json']) | set(reviewed) | set(profiles)):
                db.execute('INSERT INTO partner_records VALUES (?,?,?)',
                           (name, encode(reviewed[name]) if name in reviewed else None,
                            encode(profiles[name]) if name in profiles else None))
            for item in data['map-locations.json']:
                db.execute('INSERT INTO locations VALUES (?,?)', (item['id'], encode(item)))
            for item in mappings.get('logos', []):
                db.execute('INSERT INTO logo_mappings VALUES (?,?)', (item['name'], encode(item)))
            for partner, relationships in mappings.get('relationships', {}).items():
                for ordinal, relationship in enumerate(relationships):
                    db.execute('INSERT INTO provider_relationships VALUES (?,?,?)', (partner, ordinal, encode(relationship)))
        db.executemany('INSERT INTO metadata VALUES (?,?)', [('schema_version', '2'), ('source_revision', graph.get('source_revision', ''))])
        db.commit()
        if db.execute('PRAGMA integrity_check').fetchone()[0] != 'ok': raise ValueError('SQLite integrity check failed')
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
    print(f'Built SQLite snapshot: {len(entities)} entities, {len(graph["edges"])} relationships, {len(documents)} public documents, {target.stat().st_size} bytes')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', type=Path, default=ROOT / 'data/graph.json')
    parser.add_argument('--out', type=Path, default=ROOT / 'dist/data/atlas.sqlite')
    args = parser.parse_args()
    build(args.source, args.out, ROOT / 'data')
