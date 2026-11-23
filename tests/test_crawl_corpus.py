"""Tests for the crawl corpus publisher (scripts/publish_crawl_corpus.py).

All storage and GitHub calls are faked in-process; no credentials or
network access are needed.
"""
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, ROOT / path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


publisher = load('publish_crawl_corpus', 'scripts/publish_crawl_corpus.py')
# The publisher imports atlas_corpus itself; reuse that exact module object.
import sys
corpus = sys.modules['atlas_corpus']


class FakeClient:
    def __init__(self, *args, **kwargs):
        self.objects = {}

    def put_object(self, key, data, content_type='application/json'):
        self.objects[key] = data
        import hashlib
        return {'key': key, 'sha256': hashlib.sha256(data).hexdigest(),
                'bytes': len(data)}


class PublisherTests(unittest.TestCase):
    def setUp(self):
        self._real_client = publisher.client_for
        self._real_dispatch = publisher.dispatch_indexer
        self.fake = FakeClient()
        publisher.client_for = lambda config, **kw: self.fake
        self.dispatched = []
        publisher.dispatch_indexer = lambda *a, **k: self.dispatched.append(a) or True

    def tearDown(self):
        publisher.client_for = self._real_client
        publisher.dispatch_indexer = self._real_dispatch

    def _snapshots(self, tmp):
        root = Path(tmp) / 'research' / 'crawl'
        root.mkdir(parents=True)
        (root / 'latest-partners.json').write_text('{"mode": "partners"}')
        (root / 'partners-20261123T100000.json').write_text('{"mode": "partners"}')
        (root / 'latest-programs.json').write_text('{"mode": "programs"}')
        return root

    def test_publishes_run_and_latest_keys(self):
        config = corpus.CorpusConfig(
            endpoint='https://example.invalid', bucket='b',
            access_key='k', secret_key='s')
        with tempfile.TemporaryDirectory() as tmp:
            snapshots = self._snapshots(tmp)
            receipt = publisher.publish(snapshots, '45015041658', config)
        self.assertEqual(receipt['run_id'], '45015041658')
        self.assertEqual(receipt['modes'], ['partners', 'programs'])
        self.assertEqual(
            set(self.fake.objects),
            {
                'corpus/v1/crawl-snapshots/partners/45015041658.json',
                'corpus/v1/crawl/partners/latest.json',
                'corpus/v1/crawl-snapshots/programs/45015041658.json',
                'corpus/v1/crawl/programs/latest.json',
            })
        self.assertEqual(
            self.fake.objects['corpus/v1/crawl-snapshots/partners/45015041658.json'],
            b'{"mode": "partners"}')
        self.assertTrue(receipt['indexer_dispatched'])
        self.assertEqual(len(receipt['uploaded']), 4)

    def test_one_mode_failure_does_not_drop_other_modes(self):
        # Regression (crawl #46): the logos latest.json overwrite failed
        # with HTTP 403 and aborted the publish, silently dropping the
        # other five modes. Every key must now be attempted; failures are
        # reported together at the end.
        class FlakyClient(FakeClient):
            def put_object(self, key, data, content_type='application/json'):
                if key.endswith('/latest.json'):
                    raise corpus.CorpusError(
                        f'GCS POST b/{key} failed (HTTP 403)')
                return super().put_object(key, data, content_type)

        publisher.client_for = lambda config, **kw: FlakyClient()
        flaky = publisher.client_for(None)
        publisher.client_for = lambda config, **kw: flaky
        config = corpus.CorpusConfig(
            endpoint='https://example.invalid', bucket='b',
            access_key='k', secret_key='s')
        with tempfile.TemporaryDirectory() as tmp:
            snapshots = self._snapshots(tmp)
            with self.assertRaises(corpus.CorpusError) as ctx:
                publisher.publish(snapshots, 'run-46', config)
        self.assertIn('2 corpus upload(s) failed', str(ctx.exception))
        self.assertIn('partners/latest.json', str(ctx.exception))
        # Both modes' run snapshots were still uploaded.
        self.assertEqual(
            set(flaky.objects),
            {
                'corpus/v1/crawl-snapshots/partners/run-46.json',
                'corpus/v1/crawl-snapshots/programs/run-46.json',
            })

    def test_missing_stamped_snapshot_falls_back_to_latest(self):
        config = corpus.CorpusConfig(
            endpoint='https://example.invalid', bucket='b',
            access_key='k', secret_key='s')
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / 'crawl'
            root.mkdir()
            (root / 'latest-news.json').write_text('{"mode": "news"}')
            publisher.publish(root, 'run-1', config)
        self.assertEqual(
            self.fake.objects['corpus/v1/crawl-snapshots/news/run-1.json'],
            b'{"mode": "news"}')

    def test_dry_run_uploads_nothing(self):
        config = corpus.CorpusConfig(
            endpoint='https://example.invalid', bucket='b',
            access_key='k', secret_key='s')
        with tempfile.TemporaryDirectory() as tmp:
            snapshots = self._snapshots(tmp)
            receipt = publisher.publish(snapshots, 'run-1', config, dry_run=True)
        self.assertEqual(self.fake.objects, {})
        self.assertEqual(len(receipt['skipped_dry_run']), 4)
        self.assertFalse(receipt['indexer_dispatched'])

    def test_empty_snapshot_dir_uploads_nothing_and_skips_dispatch(self):
        config = corpus.CorpusConfig(
            endpoint='https://example.invalid', bucket='b',
            access_key='k', secret_key='s')
        with tempfile.TemporaryDirectory() as tmp:
            receipt = publisher.publish(Path(tmp), 'run-1', config)
        self.assertEqual(receipt['modes'], [])
        self.assertEqual(receipt['uploaded'], [])
        self.assertEqual(self.dispatched, [])

    def test_main_skips_cleanly_when_storage_not_configured(self):
        with tempfile.TemporaryDirectory() as tmp:
            snapshots = self._snapshots(tmp)
            code = publisher.main([
                '--snapshots', str(snapshots), '--run-id', 'run-1'])
        self.assertEqual(code, 0)
        self.assertEqual(self.fake.objects, {})

    def test_main_fails_on_missing_snapshot_dir(self):
        code = publisher.main([
            '--snapshots', '/nonexistent/crawl', '--run-id', 'run-1',
            '--dry-run'])
        self.assertEqual(code, 1)

    def test_main_dry_run_lists_uploads(self):
        with tempfile.TemporaryDirectory() as tmp:
            snapshots = self._snapshots(tmp)
            code = publisher.main([
                '--snapshots', str(snapshots), '--run-id', 'run-1', '--dry-run'])
        self.assertEqual(code, 0)
        self.assertEqual(self.fake.objects, {})


if __name__ == '__main__':
    unittest.main()
