"""Tests for the async live-index builder (scripts/build_live_index.py).

Builds against the real reviewed data/ files (small: <1 MB) into temp
directories; storage is faked in-process. Skips cleanly without pyarrow,
like the query-Parquet tests.
"""
import hashlib
import importlib.util
import json
import shutil
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PYARROW = importlib.util.find_spec('pyarrow') is not None


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, ROOT / path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


indexer = load('build_live_index', 'scripts/build_live_index.py')
# The indexer imports atlas_corpus itself; reuse that exact module object so
# CorpusError raised inside the indexer is the same class the tests catch.
import sys
corpus = sys.modules['atlas_corpus']

FIXED_NOW = datetime(2026, 11, 23, 10, 30, 0, tzinfo=timezone.utc)


class FakeStore:
    """In-memory stand-in for S3Client, recording upload order."""

    def __init__(self, objects=None):
        self.objects = dict(objects or {})
        self.put_order = []
        self.cache_control = {}

    def set_cache_control(self, key, cache_control):
        self.cache_control[key] = cache_control
        return {'key': key, 'cacheControl': cache_control}

    def put_object(self, key, data, content_type='application/octet-stream'):
        if isinstance(data, str):
            data = data.encode('utf-8')
        self.objects[key] = data
        self.put_order.append(key)
        return {'key': key, 'sha256': hashlib.sha256(data).hexdigest(),
                'bytes': len(data)}

    def put_json(self, key, obj):
        return self.put_object(
            key, json.dumps(obj, indent=2) + '\n', 'application/json')

    def get_object(self, key):
        if key not in self.objects:
            raise corpus.CorpusError(f'Object store GET x/{key} failed (HTTP 404)')
        return self.objects[key]

    def get_json(self, key):
        return json.loads(self.get_object(key).decode('utf-8'))


class ReviewedValuationInputTests(unittest.TestCase):
    def test_stored_corpus_round_trip_keeps_required_valuation_input(self):
        from unittest.mock import patch
        store = FakeStore()
        with tempfile.TemporaryDirectory() as tmp:
            data = Path(tmp) / 'data'
            data.mkdir()
            for name in {*corpus.REVIEWED_FILES, 'treemap-evidence.json', 'unreviewed.json'}:
                (data / name).write_bytes(json.dumps({'file': name}).encode())
            with patch.object(indexer, 'client_for', return_value=store):
                manifest = indexer.publish_reviewed_corpus(data, None, 'abc123', FIXED_NOW)
            downloaded = indexer.download_reviewed_corpus(store, Path(tmp) / 'download')
            evidence = (data / 'treemap-evidence.json').read_bytes()
            self.assertEqual(downloaded['treemap-evidence.json'], evidence)
            self.assertEqual(manifest['files']['treemap-evidence.json']['sha256'],
                             hashlib.sha256(evidence).hexdigest())
            self.assertEqual(store.put_order[-1], corpus.reviewed_manifest_key())
            self.assertNotIn('unreviewed.json', manifest['files'])
            self.assertNotIn(corpus.reviewed_key('unreviewed.json'), store.objects)

    def test_reviewed_input_paths_match_query_builder_and_publisher(self):
        import ast
        code = ast.parse((ROOT / 'scripts/build-query-parquet.py').read_text())
        public = next(ast.literal_eval(node.value) for node in code.body
                      if isinstance(node, ast.Assign)
                      and any(isinstance(t, ast.Name) and t.id == 'PUBLIC_DATA_FILES'
                              for t in node.targets))
        self.assertEqual(set(corpus.REVIEWED_FILES), set(public) | {'graph.json'})
        publisher = (ROOT / '.github/workflows/publish-reviewed-corpus.yml').read_text()
        self.assertIn("- 'data/treemap-evidence.json'", publisher)


class PublishGuardTests(unittest.TestCase):
    """Issue #150 (A3): skip only unchanged verified publication.

    The guarded publisher compares the candidate's content manifest (a
    pure content hash) with the already-published manifest. Identical
    releases produce an explicit no-op receipt and upload nothing;
    changed, missing or stale stored state takes the full path — a
    failure is never relabelled "unchanged".
    """

    LATER = datetime(2026, 11, 24, 10, 30, 0, tzinfo=timezone.utc)

    def make_corpus(self, tmp):
        data = Path(tmp) / 'data'
        data.mkdir()
        for name in corpus.REVIEWED_FILES:
            (data / name).write_bytes(json.dumps({'file': name}).encode())
        return data

    def guarded(self, store, data, revision, now):
        from unittest.mock import patch
        with patch.object(indexer, 'client_for', return_value=store):
            return indexer.publish_reviewed_corpus_if_changed(
                data, None, revision, now)

    def test_unchanged_corpus_is_a_noop_with_receipt(self):
        from unittest.mock import patch
        store = FakeStore()
        with tempfile.TemporaryDirectory() as tmp:
            data = self.make_corpus(tmp)
            with patch.object(indexer, 'client_for', return_value=store):
                indexer.publish_reviewed_corpus(data, None, 'abc123', FIXED_NOW)
            store.put_order.clear()
            manifest, receipt = self.guarded(store, data, 'def456', self.LATER)
            self.assertEqual(receipt['status'], 'unchanged')
            self.assertEqual(receipt['sha256'], manifest['sha256'])
            self.assertEqual(receipt['published_source_revision'], 'abc123')
            self.assertEqual(receipt['source_revision'], 'def456')
            self.assertEqual(store.put_order, [])

    def test_changed_corpus_publishes_in_full(self):
        store = FakeStore()
        with tempfile.TemporaryDirectory() as tmp:
            data = self.make_corpus(tmp)
            self.guarded(store, data, 'abc123', FIXED_NOW)
            store.put_order.clear()
            (data / 'catalogue.json').write_bytes(b'{"changed": true}')
            manifest, receipt = self.guarded(store, data, 'def456', self.LATER)
            self.assertEqual(receipt['status'], 'published')
            self.assertEqual(receipt['sha256'], manifest['sha256'])
            self.assertIn(corpus.reviewed_key('catalogue.json'), store.put_order)
            self.assertEqual(store.put_order[-1], corpus.reviewed_manifest_key())

    def test_missing_stored_manifest_publishes(self):
        store = FakeStore()
        with tempfile.TemporaryDirectory() as tmp:
            data = self.make_corpus(tmp)
            _, receipt = self.guarded(store, data, 'abc123', FIXED_NOW)
            self.assertEqual(receipt['status'], 'published')
            self.assertEqual(store.put_order[-1], corpus.reviewed_manifest_key())

    def test_stale_stored_manifest_publishes(self):
        store = FakeStore()
        with tempfile.TemporaryDirectory() as tmp:
            data = self.make_corpus(tmp)
            # A stored manifest whose hash no longer matches the candidate
            # is stale evidence, not an unchanged release.
            store.objects[corpus.reviewed_manifest_key()] = json.dumps(
                {'sha256': '0' * 64, 'source_revision': 'old'}).encode()
            _, receipt = self.guarded(store, data, 'abc123', FIXED_NOW)
            self.assertEqual(receipt['status'], 'published')

    def test_corrupt_stored_manifest_publishes(self):
        store = FakeStore()
        with tempfile.TemporaryDirectory() as tmp:
            data = self.make_corpus(tmp)
            store.objects[corpus.reviewed_manifest_key()] = b'not json'
            _, receipt = self.guarded(store, data, 'abc123', FIXED_NOW)
            self.assertEqual(receipt['status'], 'published')


@unittest.skipUnless(PYARROW, 'pyarrow is not installed')
class LiveIndexTests(unittest.TestCase):
    def test_build_writes_versioned_index_and_pointer(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / 'index'
            version, manifest, changed = indexer.build_index(
                ROOT / 'data', out, 'abc123', now=FIXED_NOW)
            self.assertTrue(changed)
            self.assertRegex(version, r'^20261123T103000Z-[0-9a-f]{8}$')
            self.assertEqual(manifest['index_version'], version)
            self.assertEqual(manifest['source_revision'], 'abc123')
            self.assertIsNone(manifest['previous_version'])
            self.assertEqual(
                set(manifest['tables']),
                {'opportunities', 'partners', 'partner_leads', 'startups',
                 'funding_rounds', 'articles', 'profile_facts', 'founders',
                 'socials', 'edges', 'relationships'})
            self.assertEqual(
                manifest['corpus']['reviewed_manifest_sha256'],
                corpus.reviewed_manifest(
                    indexer.read_reviewed_files(ROOT / 'data'),
                    'abc123', FIXED_NOW)['sha256'])
            for name in manifest['tables']:
                self.assertTrue((out / 'v1' / version / f'{name}.parquet').is_file())
            pointer = json.loads((out / 'latest.json').read_text(encoding='utf-8'))
            self.assertEqual(pointer['version'], version)
            self.assertEqual(
                pointer['manifest'], f'v1/{version}/manifest.json')
            self.assertEqual(
                pointer['tables']['startups'],
                manifest['tables']['startups']['rows'])
            import pyarrow.parquet as pq
            table = pq.read_table(out / 'v1' / version / 'startups.parquet')
            self.assertEqual(table.num_rows, manifest['tables']['startups']['rows'])
            self.assertGreater(table.num_rows, 0)

    def test_rebuild_with_unchanged_corpus_is_a_noop(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / 'index'
            version, _, changed = indexer.build_index(
                ROOT / 'data', out, 'abc123', now=FIXED_NOW)
            self.assertTrue(changed)
            # A later build with the same inputs must find the same version.
            version2, manifest2, changed2 = indexer.build_index(
                ROOT / 'data', out, 'abc123',
                now=datetime(2026, 11, 23, 11, 0, 0, tzinfo=timezone.utc))
            self.assertFalse(changed2)
            self.assertEqual(version2, version)
            self.assertEqual(manifest2['index_version'], version)

    def test_unchanged_corpus_is_noop_against_remote_pointer(self):
        # Issue #373: Cloud Run's out dir is ephemeral, so the local
        # pointer never survives a run. An unchanged corpus must still
        # be a no-op when the current state comes from the remote pointer.
        with tempfile.TemporaryDirectory() as tmp:
            first_out = Path(tmp) / 'first'
            version, manifest, changed = indexer.build_index(
                ROOT / 'data', first_out, 'abc123', now=FIXED_NOW)
            self.assertTrue(changed)
            pointer = json.loads(
                (first_out / 'latest.json').read_text(encoding='utf-8'))
            fresh_out = Path(tmp) / 'fresh'
            version2, manifest2, changed2 = indexer.build_index(
                ROOT / 'data', fresh_out, 'abc123',
                now=datetime(2026, 11, 23, 11, 0, 0, tzinfo=timezone.utc),
                remote_pointer=pointer, remote_manifest=manifest)
            self.assertFalse(changed2)
            self.assertEqual(version2, version)
            self.assertEqual(manifest2['index_version'], version)
            # Nothing was written to the fresh out dir.
            self.assertFalse((fresh_out / 'latest.json').exists())

    def test_changed_corpus_builds_against_remote_pointer(self):
        with tempfile.TemporaryDirectory() as tmp:
            first_out = Path(tmp) / 'first'
            version, manifest, _ = indexer.build_index(
                ROOT / 'data', first_out, 'abc123', now=FIXED_NOW)
            pointer = json.loads(
                (first_out / 'latest.json').read_text(encoding='utf-8'))
            corpus_dir = Path(tmp) / 'data'
            shutil.copytree(ROOT / 'data', corpus_dir)
            reviewed = json.loads(
                (corpus_dir / 'partner-profiles.json').read_text(encoding='utf-8'))
            first = next(iter(reviewed))
            reviewed[first]['geography'] = 'XX-test'
            (corpus_dir / 'partner-profiles.json').write_text(
                json.dumps(reviewed), encoding='utf-8')
            later = datetime(2026, 11, 23, 11, 0, 0, tzinfo=timezone.utc)
            version2, manifest2, changed2 = indexer.build_index(
                corpus_dir, Path(tmp) / 'fresh', 'abc123', now=later,
                remote_pointer=pointer, remote_manifest=manifest)
            self.assertTrue(changed2)
            self.assertNotEqual(version2, version)
            self.assertEqual(manifest2['previous_version'], version)

    def test_read_remote_pointer_returns_none_when_absent(self):
        self.assertIsNone(indexer.read_remote_pointer(FakeStore()))
        self.assertIsNone(
            indexer.read_remote_index_manifest(FakeStore(), None))
        self.assertIsNone(
            indexer.read_remote_index_manifest(FakeStore(), {'version': 'x'}))

    def test_main_corpus_store_publish_is_noop_when_remote_is_current(self):
        import unittest.mock as mock

        # Build once to get a pointer + manifest for the current corpus.
        with tempfile.TemporaryDirectory() as tmp:
            first_out = Path(tmp) / 'first'
            version, manifest, _ = indexer.build_index(
                ROOT / 'data', first_out, 'abc123', now=FIXED_NOW)
            pointer = json.loads(
                (first_out / 'latest.json').read_text(encoding='utf-8'))
            files = indexer.read_reviewed_files(ROOT / 'data')
            reviewed = corpus.reviewed_manifest(files, 'abc123', FIXED_NOW)
            objects = {corpus.reviewed_manifest_key(): json.dumps(reviewed).encode()}
            objects.update({
                corpus.reviewed_key(name): data for name, data in files.items()})
            objects['latest.json'] = json.dumps(pointer).encode()
            objects[corpus.index_manifest_key(version)] = json.dumps(
                manifest).encode()
            store = FakeStore(objects)
            config = corpus.CorpusConfig(
                endpoint='https://example.invalid', bucket='corpus',
                index_bucket='index', access_key='k', secret_key='s')
            out = Path(tmp) / 'index'
            with mock.patch.object(indexer, 'client_for', lambda *a, **k: store), \
                    mock.patch.object(
                        corpus.CorpusConfig, 'from_env',
                        classmethod(lambda cls, env=None: config)):
                code = indexer.main([
                    '--corpus-store', '--publish',
                    '--out', str(out), '--source-revision', 'abc123'])
            self.assertEqual(code, 0)
            # No uploads: the remote index already matches the corpus.
            self.assertEqual(store.put_order, [])

    def test_changed_corpus_produces_a_new_version(self):
        with tempfile.TemporaryDirectory() as tmp:
            corpus_dir = Path(tmp) / 'data'
            shutil.copytree(ROOT / 'data', corpus_dir)
            out = Path(tmp) / 'index'
            version, _, _ = indexer.build_index(
                corpus_dir, out, 'abc123', now=FIXED_NOW)
            reviewed = json.loads(
                (corpus_dir / 'partner-profiles.json').read_text(encoding='utf-8'))
            first = next(iter(reviewed))
            reviewed[first]['geography'] = 'XX-test'
            (corpus_dir / 'partner-profiles.json').write_text(
                json.dumps(reviewed), encoding='utf-8')
            later = datetime(2026, 11, 23, 11, 0, 0, tzinfo=timezone.utc)
            version2, manifest2, changed2 = indexer.build_index(
                corpus_dir, out, 'abc123', now=later)
            self.assertTrue(changed2)
            self.assertNotEqual(version2, version)
            self.assertEqual(manifest2['previous_version'], version)

    def test_missing_reviewed_file_fails_clearly(self):
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(corpus.CorpusError) as ctx:
                indexer.build_index(Path(tmp), Path(tmp) / 'out', 'abc123')
            self.assertIn('missing', str(ctx.exception))

    def test_publish_uploads_pointer_last(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / 'index'
            version, manifest, _ = indexer.build_index(
                ROOT / 'data', out, 'abc123', now=FIXED_NOW)
            store = FakeStore()
            config = corpus.CorpusConfig(
                endpoint='https://example.invalid', bucket='corpus',
                index_bucket='index', access_key='k', secret_key='s')
            real_client = indexer.client_for
            indexer.client_for = lambda *a, **k: store
            try:
                uploaded = indexer.publish_index(out, version, manifest, config)
            finally:
                indexer.client_for = real_client
            self.assertEqual(len(uploaded), 13)  # 11 tables (9 reviewed + edges/relationships, #359) + manifest + pointer
            self.assertEqual(store.put_order[-1], 'latest.json')
            self.assertEqual(
                json.loads(store.objects['latest.json'])['version'],
                version)
            # The pointer is overwritten in place in a publicly readable
            # bucket: it must be marked no-cache or readers (including
            # the indexer itself) can be served a stale copy (#373).
            self.assertEqual(store.cache_control, {'latest.json': 'no-cache'})

    def test_download_reviewed_corpus(self):
        files = indexer.read_reviewed_files(ROOT / 'data')
        manifest = corpus.reviewed_manifest(files, 'abc123', FIXED_NOW)
        objects = {corpus.reviewed_manifest_key(): json.dumps(manifest).encode()}
        objects.update({
            corpus.reviewed_key(name): data for name, data in files.items()})
        store = FakeStore(objects)
        with tempfile.TemporaryDirectory() as tmp:
            fetched = indexer.download_reviewed_corpus(store, Path(tmp) / 'corpus')
            self.assertEqual(set(fetched), set(files))
            self.assertEqual(fetched['catalogue.json'], files['catalogue.json'])

    def test_download_without_reviewed_manifest_fails_clearly(self):
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(corpus.CorpusError) as ctx:
                indexer.download_reviewed_corpus(FakeStore(), Path(tmp))
            self.assertIn('Bootstrap', str(ctx.exception))

    def test_main_builds_from_corpus_dir(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / 'index'
            code = indexer.main([
                '--corpus-dir', str(ROOT / 'data'), '--out', str(out),
                '--source-revision', 'abc123'])
            self.assertEqual(code, 0)
            self.assertTrue((out / 'latest.json').is_file())
            code2 = indexer.main([
                '--corpus-dir', str(ROOT / 'data'), '--out', str(out),
                '--source-revision', 'abc123'])
            self.assertEqual(code2, 0)

    def test_publish_reviewed_corpus_uploads_files_and_manifest(self):
        store = FakeStore()
        config = corpus.CorpusConfig(
            endpoint='https://example.invalid', bucket='corpus',
            access_key='k', secret_key='s')
        real_client = indexer.client_for
        indexer.client_for = lambda *a, **k: store
        try:
            manifest = indexer.publish_reviewed_corpus(
                ROOT / 'data', config, 'abc123', FIXED_NOW)
        finally:
            indexer.client_for = real_client
        self.assertEqual(set(manifest['files']), set(corpus.REVIEWED_FILES))
        self.assertEqual(
            set(store.objects),
            {corpus.reviewed_key(name) for name in corpus.REVIEWED_FILES}
            | {corpus.reviewed_manifest_key()})
        stored = json.loads(store.objects[corpus.reviewed_manifest_key()])
        self.assertEqual(stored['sha256'], manifest['sha256'])

    def test_main_bootstraps_from_repo_when_store_is_empty(self):
        import unittest.mock as mock

        store = FakeStore()
        config = corpus.CorpusConfig(
            endpoint='https://example.invalid', bucket='corpus',
            index_bucket='index', access_key='k', secret_key='s')
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / 'index'
            with mock.patch.object(indexer, 'client_for', lambda *a, **k: store), \
                    mock.patch.object(
                        corpus.CorpusConfig, 'from_env',
                        classmethod(lambda cls, env=None: config)):
                code = indexer.main([
                    '--corpus-store', '--bootstrap-from', str(ROOT / 'data'),
                    '--out', str(out), '--source-revision', 'abc123'])
            self.assertEqual(code, 0)
            # The reviewed corpus was seeded so later runs can use the store.
            self.assertIn(corpus.reviewed_manifest_key(), store.objects)
            pointer = json.loads((out / 'latest.json').read_text(encoding='utf-8'))
            version_dir = out / 'v1' / pointer['version']
            manifest = json.loads(
                (version_dir / 'manifest.json').read_text(encoding='utf-8'))
            self.assertTrue(manifest['corpus']['bootstrapped'])


if __name__ == '__main__':
    unittest.main()
