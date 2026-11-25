import importlib.util
import json
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, ROOT / path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


loom_atlas = load('atlas_loom_atlas', 'scripts/build-loom-atlas.py')
build = loom_atlas.build
build_blocks = loom_atlas.build_blocks
build_topics = loom_atlas.build_topics

SMALL_GRAPH = {
    'version': 1,
    'source_revision': 'test-revision',
    'entities': [
        {'id': 'startup:canva', 'kind': 'startup', 'name': 'Canva'},
        {'id': 'startup:fusion-books', 'kind': 'startup', 'name': 'Fusion Books'},
        {'id': 'partner:airtree', 'kind': 'partner', 'name': 'Airtree'},
        {'id': 'person:melanie-perkins', 'kind': 'person', 'name': 'Melanie Perkins'},
        {'id': 'partner:orphan', 'kind': 'partner', 'name': 'Orphan Partner'},
    ],
    'edges': [
        {'from': 'person:melanie-perkins', 'to': 'startup:canva', 'kind': 'founded', 'source': 'https://example.com/founder'},
        {'from': 'partner:airtree', 'to': 'startup:canva', 'kind': 'supports', 'source': 'https://example.com/portfolio'},
        {'from': 'person:melanie-perkins', 'to': 'startup:fusion-books', 'kind': 'founded', 'source': 'https://example.com/other'},
    ],
    'funding_rounds': [],
    'articles': [],
}


class BuildLoomAtlasTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.work = Path(self.tmp.name)
        self.source = self.work / 'graph.json'
        self.source.write_text(json.dumps(SMALL_GRAPH), encoding='utf-8')
        self.out_dir = self.work / 'dist' / 'data'

    def tearDown(self):
        self.tmp.cleanup()

    def build(self):
        build(self.source, self.out_dir)
        return self.out_dir

    def test_topics_are_one_per_kind_with_contiguous_article_ids(self):
        topics, articles, edges, connections = build_topics(SMALL_GRAPH)
        self.assertEqual([t['label'] for t in topics], ['Partners', 'People', 'Startups'])
        self.assertEqual([(t['first'], t['count']) for t in topics], [(0, 2), (2, 1), (3, 2)])
        self.assertEqual(articles[0], (0, 'Airtree', 1))
        self.assertEqual(articles[1], (0, 'Orphan Partner', 0))
        self.assertEqual(articles[2], (1, 'Melanie Perkins', 2))
        self.assertEqual(articles[3], (2, 'Canva', 2))
        self.assertEqual(articles[4], (2, 'Fusion Books', 1))
        # Connections include within-topic pairs and both directions.
        self.assertIn([0, 2, 1], connections)  # Airtree -> Canva
        self.assertIn([1, 2, 2], connections)  # Melanie -> Canva, Fusion Books
        self.assertEqual(sum(c for _, _, c in connections), 3)

    def test_manifest_shape_and_page_size_rule(self):
        out_dir = self.build()
        manifest = json.loads((out_dir / 'loom-atlas-manifest.json').read_text(encoding='utf-8'))
        self.assertEqual([t['label'] for t in manifest['topics']], ['Partners', 'People', 'Startups'])
        self.assertEqual(manifest['database'], 'loom-atlas.sqlite')
        self.assertEqual(manifest['full'], 'loom-atlas-full.json')
        self.assertGreater(manifest['databaseBytes'], 0)
        self.assertEqual(manifest['databaseBytes'] % manifest['pageSize'], 0)
        self.assertEqual(manifest['pageSize'], 4096)

    def test_sqlite_answers_the_loom_reader_queries(self):
        out_dir = self.build()
        db = sqlite3.connect(out_dir / 'loom-atlas.sqlite')
        try:
            # Exactly the queries createSQLiteAtlasReader runs in loom-core.
            articles = db.execute(
                'SELECT topic,id,title,degree FROM articles WHERE topic IN (?) ORDER BY topic,id', (2,)
            ).fetchall()
            self.assertEqual(articles, [(2, 3, 'Canva', 2), (2, 4, 'Fusion Books', 1)])
            edges = db.execute(
                'SELECT topic,source,target FROM edges WHERE topic IN (?) ORDER BY topic,source,target', (1,)
            ).fetchall()
            self.assertEqual(edges, [(1, 2, 3), (1, 2, 4)])
            self.assertEqual(
                db.execute("SELECT value FROM metadata WHERE key='source_revision'").fetchone()[0],
                'test-revision',
            )
        finally:
            db.close()

    def test_full_json_matches_the_sqlite_blocks(self):
        out_dir = self.build()
        blocks = json.loads((out_dir / 'loom-atlas-full.json').read_text(encoding='utf-8'))
        topics, articles, edges, _ = build_topics(SMALL_GRAPH)
        self.assertEqual(blocks, build_blocks(topics, articles, edges))
        startups = blocks[2]
        self.assertEqual(startups['articles'], [[3, 'Canva', 2], [4, 'Fusion Books', 1]])
        self.assertEqual(startups['edges'], [])

    def test_build_is_deterministic(self):
        first = self.build()
        first_manifest = (first / 'loom-atlas-manifest.json').read_bytes()
        first_full = (first / 'loom-atlas-full.json').read_bytes()
        first_dump = self.dump(first / 'loom-atlas.sqlite')
        second_dir = self.work / 'second'
        build(self.source, second_dir)
        self.assertEqual((second_dir / 'loom-atlas-manifest.json').read_bytes(), first_manifest)
        self.assertEqual((second_dir / 'loom-atlas-full.json').read_bytes(), first_full)
        self.assertEqual(self.dump(second_dir / 'loom-atlas.sqlite'), first_dump)

    @staticmethod
    def dump(path):
        db = sqlite3.connect(path)
        try:
            return '\n'.join(db.iterdump())
        finally:
            db.close()

    def test_missing_edge_target_is_an_error(self):
        broken = dict(SMALL_GRAPH)
        broken['edges'] = [{'from': 'startup:canva', 'to': 'startup:missing', 'kind': 'supports', 'source': 'https://example.com'}]
        with self.assertRaises(ValueError):
            build_topics(broken)


class BuildLoomAtlasCliTests(unittest.TestCase):
    def test_cli_builds_from_a_graph_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            work = Path(tmp)
            source = work / 'graph.json'
            source.write_text(json.dumps(SMALL_GRAPH), encoding='utf-8')
            out_dir = work / 'out'
            result = subprocess.run(
                [sys.executable, str(ROOT / 'scripts/build-loom-atlas.py'),
                 '--source', str(source), '--out-dir', str(out_dir)],
                capture_output=True, text=True, cwd=ROOT,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn('Built Loom atlas: 3 topics, 5 articles, 3 edges', result.stdout)
            self.assertTrue((out_dir / 'loom-atlas.sqlite').exists())
            self.assertTrue((out_dir / 'loom-atlas-manifest.json').exists())
            self.assertTrue((out_dir / 'loom-atlas-full.json').exists())


if __name__ == '__main__':
    unittest.main()
