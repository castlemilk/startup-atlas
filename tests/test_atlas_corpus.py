"""Tests for the live-index object-store client (scripts/atlas_corpus.py).

The SigV4 signing is verified against a local stub HTTP server that records
requests: no real credentials and no network access are needed. Tests run
with the standard library only.
"""
import http.server
import importlib.util
import json
import threading
import unittest
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, ROOT / path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


corpus = load('atlas_corpus', 'scripts/atlas_corpus.py')

FIXED_NOW = datetime(2026, 11, 23, 10, 30, 0, tzinfo=timezone.utc)


class StubHandler(http.server.BaseHTTPRequestHandler):
    store = {}
    requests = []

    def _record(self, method):
        length = int(self.headers.get('Content-Length') or 0)
        body = self.rfile.read(length) if length else b''
        type(self).requests.append({
            'method': method, 'path': self.path,
            'headers': dict(self.headers), 'body': body,
        })
        return body

    def do_PUT(self):
        body = self._record('PUT')
        type(self).store[self.path] = body
        self.send_response(200)
        self.send_header('Content-Length', '0')
        self.end_headers()

    def do_GET(self):
        self._record('GET')
        body = type(self).store.get(self.path)
        if body is None:
            self.send_response(404)
            self.send_header('Content-Length', '0')
            self.end_headers()
            return
        self.send_response(200)
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_HEAD(self):
        self._record('HEAD')
        if self.path in type(self).store:
            self.send_response(200)
        else:
            self.send_response(404)
        self.send_header('Content-Length', '0')
        self.end_headers()

    def log_message(self, *args):  # keep test output quiet
        pass


class CorpusConfigTests(unittest.TestCase):
    def test_not_configured_without_env(self):
        config = corpus.CorpusConfig.from_env({})
        self.assertFalse(config.configured)
        with self.assertRaises(corpus.CorpusError):
            config.require_configured()

    def test_configured_with_all_env_vars(self):
        config = corpus.CorpusConfig.from_env({
            'ATLAS_CORPUS_ENDPOINT': 'https://example.r2.cloudflarestorage.com',
            'ATLAS_CORPUS_BUCKET': 'startup-atlas-corpus',
            'ATLAS_CORPUS_INDEX_BUCKET': 'startup-atlas-index',
            'ATLAS_CORPUS_REGION': 'auto',
            'ATLAS_CORPUS_ACCESS_KEY_ID': 'test-key',
            'ATLAS_CORPUS_SECRET_ACCESS_KEY': 'test-secret',
        })
        self.assertTrue(config.configured)
        self.assertEqual(config.region, 'auto')
        self.assertEqual(config.index_bucket, 'startup-atlas-index')
        config.require_configured()  # must not raise

    def test_missing_any_one_var_is_not_configured(self):
        base = {
            'ATLAS_CORPUS_ENDPOINT': 'https://example.invalid',
            'ATLAS_CORPUS_BUCKET': 'b',
            'ATLAS_CORPUS_ACCESS_KEY_ID': 'k',
            'ATLAS_CORPUS_SECRET_ACCESS_KEY': 's',
        }
        for missing in base:
            env = {k: v for k, v in base.items() if k != missing}
            self.assertFalse(corpus.CorpusConfig.from_env(env).configured, missing)


class CorpusLayoutTests(unittest.TestCase):
    def test_keys(self):
        self.assertEqual(
            corpus.crawl_snapshot_key('partners', '45015041658'),
            'corpus/v1/crawl-snapshots/partners/45015041658.json')
        self.assertEqual(
            corpus.crawl_latest_key('partners'),
            'corpus/v1/crawl/partners/latest.json')
        # The lifecycle exemption, pinned: snapshot keys live under
        # crawl-snapshots/ so the bucket's 90-day expiry rule matches
        # them, while pointer keys stay under crawl/<mode>/, which the
        # rule never matches.
        self.assertTrue(
            corpus.crawl_snapshot_key('partners', '45015041658')
            .startswith('corpus/v1/crawl-snapshots/'))
        self.assertFalse(
            corpus.crawl_latest_key('partners')
            .startswith('corpus/v1/crawl-snapshots/'))
        self.assertEqual(
            corpus.reviewed_key('catalogue.json'),
            'corpus/v1/reviewed/catalogue.json')
        self.assertEqual(
            corpus.reviewed_manifest_key(), 'corpus/v1/reviewed/manifest.json')
        self.assertEqual(
            corpus.index_manifest_key('20261123T103000Z-9f3ac2e1'),
            'v1/20261123T103000Z-9f3ac2e1/manifest.json')
        self.assertEqual(
            corpus.index_table_key('20261123T103000Z-9f3ac2e1', 'partners'),
            'v1/20261123T103000Z-9f3ac2e1/partners.parquet')
        self.assertEqual(corpus.index_latest_key(), 'latest.json')

    def test_index_version_is_content_addressed(self):
        version = corpus.make_index_version(FIXED_NOW, '9f3ac2e1' + '0' * 56)
        self.assertEqual(version, '20261123T103000Z-9f3ac2e1')
        self.assertEqual(
            corpus.make_index_version(FIXED_NOW, '9f3ac2e1' + '0' * 56), version)
        self.assertNotEqual(
            corpus.make_index_version(FIXED_NOW, 'aaaaaaaa' + '0' * 56), version)

    def test_reviewed_manifest_is_deterministic(self):
        files = {'catalogue.json': b'{"a": 1}', 'partners-reviewed.json': b'{}'}
        first = corpus.reviewed_manifest(files, 'abc123', FIXED_NOW)
        second = corpus.reviewed_manifest(
            dict(reversed(list(files.items()))), 'abc123', FIXED_NOW)
        self.assertEqual(first, second)
        self.assertEqual(first['files']['catalogue.json']['bytes'], 8)
        changed = corpus.reviewed_manifest(
            {'catalogue.json': b'{"a": 2}', 'partners-reviewed.json': b'{}'},
            'abc123', FIXED_NOW)
        self.assertNotEqual(changed['sha256'], first['sha256'])

    def test_latest_pointer_shape(self):
        pointer = corpus.latest_pointer(
            '20261123T103000Z-9f3ac2e1',
            'v1/20261123T103000Z-9f3ac2e1/manifest.json',
            '2026-11-23T10:30:00Z', 'abc123',
            {'partners': {'rows': 23}, 'startups': {'rows': 51}})
        self.assertEqual(pointer['version'], '20261123T103000Z-9f3ac2e1')
        self.assertEqual(
            pointer['manifest'],
            'v1/20261123T103000Z-9f3ac2e1/manifest.json')
        self.assertEqual(pointer['tables'], {'partners': 23, 'startups': 51})


class SigningTests(unittest.TestCase):
    def test_signature_is_deterministic_and_body_sensitive(self):
        kwargs = dict(
            method='PUT', url='https://example.invalid/bucket/key.json',
            headers={'Content-Type': 'application/json'}, body=b'{"a": 1}',
            access_key='AKID', secret_key='secret', region='auto',
            now=FIXED_NOW)
        first = corpus.sign_request(**kwargs)
        second = corpus.sign_request(**kwargs)
        self.assertEqual(first['Authorization'], second['Authorization'])
        changed = corpus.sign_request(**{**kwargs, 'body': b'{"a": 2}'})
        self.assertNotEqual(
            changed['Authorization'], first['Authorization'])
        auth = first['Authorization']
        self.assertTrue(auth.startswith(
            'AWS4-HMAC-SHA256 Credential=AKID/20261123/auto/s3/aws4_request, '
            'SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date, '
            'Signature='))
        signature = auth.rsplit('Signature=', 1)[1]
        self.assertRegex(signature, r'^[0-9a-f]{64}$')
        self.assertEqual(first['x-amz-date'], '20261123T103000Z')

    def test_error_messages_never_carry_secrets(self):
        import urllib.error

        class FailingOpener:
            def open(self, request):
                raise urllib.error.URLError('connection refused')

        config = corpus.CorpusConfig(
            endpoint='https://example.invalid', bucket='b',
            access_key='AKID', secret_key='do-not-leak')
        client = corpus.S3Client(config, opener=FailingOpener())
        with self.assertRaises(corpus.CorpusError) as ctx:
            client.get_object('missing.json')
        self.assertNotIn('do-not-leak', str(ctx.exception))
        self.assertNotIn('AKID', str(ctx.exception))


class StubServerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), StubHandler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()

    def setUp(self):
        StubHandler.store.clear()
        StubHandler.requests.clear()
        endpoint = f'http://127.0.0.1:{self.server.server_address[1]}'
        config = corpus.CorpusConfig(
            endpoint=endpoint, bucket='test-bucket',
            access_key='AKID', secret_key='secret', region='auto')
        self.client = corpus.S3Client(config)

    def test_put_get_head_round_trip(self):
        result = self.client.put_object(
            'corpus/v1/reviewed/catalogue.json', b'{"x": 1}',
            'application/json')
        self.assertEqual(result['bytes'], 8)
        self.assertTrue(self.client.exists('corpus/v1/reviewed/catalogue.json'))
        self.assertEqual(
            self.client.get_object('corpus/v1/reviewed/catalogue.json'),
            b'{"x": 1}')
        self.assertFalse(self.client.exists('corpus/v1/reviewed/nope.json'))
        put = StubHandler.requests[0]
        self.assertEqual(put['method'], 'PUT')
        self.assertTrue(put['headers']['Authorization'].startswith(
            'AWS4-HMAC-SHA256 Credential=AKID/'))
        self.assertEqual(put['body'], b'{"x": 1}')

    def test_put_json_and_get_json(self):
        self.client.put_json('latest.json', {'version': 'v1'})
        self.assertEqual(
            self.client.get_json('latest.json'), {'version': 'v1'})

    def test_get_missing_raises_corpus_error(self):
        with self.assertRaises(corpus.CorpusError) as ctx:
            self.client.get_object('nope.json')
        self.assertIn('HTTP 404', str(ctx.exception))


if __name__ == '__main__':
    unittest.main()
