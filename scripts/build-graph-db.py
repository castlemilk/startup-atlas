#!/usr/bin/env python3
"""Compile the reviewed graph into a read-only SQLite/FTS4 snapshot."""
import argparse
import json
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def build(source, target):
    graph = json.loads(source.read_text(encoding='utf-8'))
    target.parent.mkdir(parents=True, exist_ok=True)
    target.unlink(missing_ok=True)
    db = sqlite3.connect(target)
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
        db.executemany('INSERT INTO metadata VALUES (?,?)', [('schema_version', '1'), ('source_revision', graph.get('source_revision', ''))])
        db.commit()
        if db.execute('PRAGMA integrity_check').fetchone()[0] != 'ok': raise ValueError('SQLite integrity check failed')
        db.execute('VACUUM')
    finally:
        db.close()
    print(f'Built SQLite graph: {len(entities)} entities, {len(graph["edges"])} relationships, {target.stat().st_size} bytes')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', type=Path, default=ROOT / 'data/graph.json')
    parser.add_argument('--out', type=Path, default=ROOT / 'dist/data/atlas.sqlite')
    args = parser.parse_args()
    build(args.source, args.out)
