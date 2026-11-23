"""Tests for the GCS live-index backend (scripts/atlas_gcp.py).

The GCS JSON API, the metadata server and the OAuth token endpoint are all
simulated by local stub HTTP servers: no real credentials and no network
access are needed. Tests run with the standard library only, mirroring
tests/test_atlas_corpus.py.
"""
import http.server
import json
import os
import sys
import tempfile
import threading
import unittest
import urllib.parse
from pathlib import Path

STAGING = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(STAGING / 'scripts'))

import atlas_gcp as gcp  # noqa: E402
from atlas_corpus import CorpusConfig  # noqa: E402


class GcsStubHandler(http.server.BaseHTTPRequestHandler):
    """Simulates the GCS JSON API (upload / download / metadata)."""
    store = {}
    requests = []
    # Tokens the stub accepts; a request with any other Bearer token gets 401.
    valid_tokens = {'good-token'}
    fail_once_with = {}  # path -> status code to return once, then behave

    def _record(self, method):
        length = int(self.headers.get('Content-Length') or 0)
        body = self.rfile.read(length) if length else b''
        type(self).requests.append({
            'method': method, 'path': self.path,
            'headers': dict(self.headers), 'body': body,
        })
        return body

    def _auth_ok(self):
        return self.headers.get('Authorization') in {
            f'Bearer {token}' for token in type(self).valid_tokens}

    def _maybe_fail_once(self):
        status = type(self).fail_once_with.pop(self.path, None)
        if status is not None:
            self.send_response(status)
            self.send_header('Content-Length', '0')
            self.end_headers()
            return True
        return False

    def _key_from_path(self):
        parsed = urllib.parse.urlparse(self.path)
        query = urllib.parse.parse_qs(parsed.query)
        if 'name' in query:
            return urllib.parse.unquote(query['name'][0])
        prefix = '/storage/v1/b/'
        rest = parsed.path[len(prefix):]
        # rest is <bucket>/o/<encoded key>
        return urllib.parse.unquote(rest.split('/o/', 1)[1])

    def do_POST(self):
        body = self._record('POST')
        if not self._auth_ok():
            self.send_response(401)
            self.send_header('Content-Length', '0')
            self.end_headers()
            return
        if self._maybe_fail_once():
            return
        type(self).store[self._key_from_path()] = body
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        payload = json.dumps({'name': self._key_from_path()}).encode()
        self.send_header('Content-Length', str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        self._record('GET')
        if not self._auth_ok():
            self.send_response(401)
            self.send_header('Content-Length', '0')
            self.end_headers()
            return
        key = self._key_from_path()
        if 'alt=media' in self.path:
            body = type(self).store.get(key)
            if body is None:
                self.send_response(404)
                self.send_header('Content-Length', '0')
                self.end_headers()
                return
            self.send_response(200)
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if key in type(self).store:
            payload = json.dumps({'name': key}).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
            return
        self.send_response(404)
        self.send_header('Content-Length', '0')
        self.end_headers()

    def log_message(self, *args):  # keep test output quiet
        pass


class TokenStubHandler(http.server.BaseHTTPRequestHandler):
    """Simulates the metadata server and the OAuth token endpoint."""
    mode = 'metadata'  # or 'oauth'
    requests = []

    def _record(self, method):
        length = int(self.headers.get('Content-Length') or 0)
        body = self.rfile.read(length) if length else b''
        type(self).requests.append({
            'method': method, 'path': self.path,
            'headers': dict(self.headers), 'body': body,
        })
        return body

    def do_GET(self):
        self._record('GET')
        if type(self).mode != 'metadata':
            self.send_response(404)
            self.send_header('Content-Length', '0')
            self.end_headers()
            return
        payload = json.dumps({'access_token': 'meta-token'}).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_POST(self):
        self._record('POST')
        if type(self).mode != 'oauth':
            self.send_response(404)
            self.send_header('Content-Length', '0')
            self.end_headers()
            return
        payload = json.dumps({'access_token': 'adc-token'}).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, *args):
        pass


def start_server(handler):
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server, thread


class TokenResolutionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.token_server, _ = start_server(TokenStubHandler)
        cls.token_base = f'http://127.0.0.1:{cls.token_server.server_address[1]}'

    @classmethod
    def tearDownClass(cls):
        cls.token_server.shutdown()
        cls.token_server.server_close()

    def _no_token_env(self):
        return {'ATLAS_GCP_ACCESS_TOKEN': '', 'GOOGLE_APPLICATION_CREDENTIALS': '/nonexistent.json'}

    def test_env_token_wins(self):
        token = gcp.get_access_token(
            environ={'ATLAS_GCP_ACCESS_TOKEN': 'env-token'},
            metadata_base=self.token_base, adc_path='/nonexistent.json',
            run_gcloud=lambda: (_ for _ in ()).throw(AssertionError('must not run gcloud')))
        self.assertEqual(token, 'env-token')

    def test_metadata_server_token(self):
        TokenStubHandler.mode = 'metadata'
        token = gcp.get_access_token(
            environ=self._no_token_env(), metadata_base=self.token_base,
            adc_path='/nonexistent.json', run_gcloud=lambda: None)
        self.assertEqual(token, 'meta-token')

    def test_adc_authorized_user_refresh(self):
        TokenStubHandler.mode = 'oauth'
        with tempfile.NamedTemporaryFile('w', suffix='.json', delete=False) as f:
            json.dump({
                'type': 'authorized_user',
                'client_id': 'cid', 'client_secret': 'csec',
                'refresh_token': 'rtok',
            }, f)
            adc_path = f.name
        try:
            token = gcp.get_access_token(
                environ=self._no_token_env(),
                metadata_base='http://127.0.0.1:1',  # unreachable: must fall through
                adc_path=adc_path, token_url=f'{self.token_base}/token',
                run_gcloud=lambda: None)
            self.assertEqual(token, 'adc-token')
        finally:
            os.unlink(adc_path)

    def test_service_account_adc_falls_through_to_gcloud(self):
        with tempfile.NamedTemporaryFile('w', suffix='.json', delete=False) as f:
            json.dump({'type': 'service_account', 'private_key': 'x'}, f)
            adc_path = f.name
        try:
            calls = []
            token = gcp.get_access_token(
                environ=self._no_token_env(),
                metadata_base='http://127.0.0.1:1',
                adc_path=adc_path, token_url=f'{self.token_base}/token',
                run_gcloud=lambda: calls.append(True) or _FakeRun('gcloud-token'))
            self.assertEqual(token, 'gcloud-token')
            self.assertEqual(calls, [True])
        finally:
            os.unlink(adc_path)

    def test_nothing_available_returns_none(self):
        token = gcp.get_access_token(
            environ=self._no_token_env(),
            metadata_base='http://127.0.0.1:1',
            adc_path='/nonexistent.json',
            run_gcloud=lambda: _FakeRun(''))
        self.assertIsNone(token)


class _FakeRun:
    def __init__(self, stdout):
        self.stdout = stdout


class GCSClientTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server, _ = start_server(GcsStubHandler)
        cls.base = f'http://127.0.0.1:{cls.server.server_address[1]}'

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()

    def setUp(self):
        GcsStubHandler.store.clear()
        GcsStubHandler.requests.clear()
        GcsStubHandler.fail_once_with.clear()
        config = gcp.GCSConfig(
            backend='gcs', bucket='test-corpus',
            index_bucket='test-index', project='test-project')
        self.client = gcp.GCSClient(
            config, token_provider=lambda: 'good-token',
            api_base=self.base, upload_base=self.base)

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
        put = GcsStubHandler.requests[0]
        self.assertEqual(put['method'], 'POST')
        self.assertEqual(
            put['headers']['Authorization'], 'Bearer good-token')
        self.assertIn('uploadType=media', put['path'])
        self.assertIn('name=corpus%2Fv1%2Freviewed%2Fcatalogue.json', put['path'])
        self.assertEqual(put['body'], b'{"x": 1}')

    def test_put_json_and_get_json(self):
        self.client.put_json('latest.json', {'version': 'v1'})
        self.assertEqual(self.client.get_json('latest.json'), {'version': 'v1'})

    def test_get_missing_raises_corpus_error(self):
        with self.assertRaises(gcp.CorpusError) as ctx:
            self.client.get_object('nope.json')
        self.assertIn('HTTP 404', str(ctx.exception))

    def test_401_refreshes_token_once_and_retries(self):
        tokens = iter(['stale-token', 'good-token'])
        config = gcp.GCSConfig(backend='gcs', bucket='test-corpus')
        client = gcp.GCSClient(
            config, token_provider=lambda: next(tokens),
            api_base=self.base, upload_base=self.base)
        result = client.put_object('k.json', b'{}', 'application/json')
        self.assertEqual(result['bytes'], 2)
        auths = [r['headers']['Authorization']
                 for r in GcsStubHandler.requests if r['method'] == 'POST']
        self.assertEqual(auths, ['Bearer stale-token', 'Bearer good-token'])

    def test_error_messages_never_carry_the_token(self):
        config = gcp.GCSConfig(backend='gcs', bucket='test-corpus')
        client = gcp.GCSClient(
            config, token_provider=lambda: 'sekret-token',
            api_base='http://127.0.0.1:1', upload_base='http://127.0.0.1:1')
        with self.assertRaises(gcp.CorpusError) as ctx:
            client.get_object('missing.json')
        self.assertNotIn('sekret-token', str(ctx.exception))

    def test_no_token_is_a_clear_error(self):
        config = gcp.GCSConfig(backend='gcs', bucket='test-corpus')
        client = gcp.GCSClient(
            config, token_provider=lambda: None,
            api_base=self.base, upload_base=self.base)
        with self.assertRaises(gcp.CorpusError) as ctx:
            client.get_object('k.json')
        self.assertIn('Application Default', str(ctx.exception))


class BackendSelectionTests(unittest.TestCase):
    def test_gcs_selected_by_backend_env(self):
        config = CorpusConfig(endpoint='https://example.invalid', bucket='b',
                              access_key='k', secret_key='s')
        gcp_config = gcp.GCSConfig.from_env({
            'ATLAS_CORPUS_BACKEND': 'gcs',
            'ATLAS_CORPUS_BUCKET': 'c', 'ATLAS_CORPUS_INDEX_BUCKET': 'i',
            'ATLAS_GCP_PROJECT': 'p'})
        self.assertIsInstance(gcp.client_for(config, gcp_config), gcp.GCSClient)

    def test_s3_is_the_default(self):
        config = CorpusConfig(endpoint='https://example.invalid', bucket='b',
                              access_key='k', secret_key='s')
        gcp_config = gcp.GCSConfig.from_env({})
        self.assertEqual(gcp_config.backend, 's3')
        client = gcp.client_for(config, gcp_config)
        self.assertEqual(type(client).__name__, 'S3Client')

    def test_is_configured_is_backend_aware(self):
        s3 = CorpusConfig.from_env({})
        self.assertFalse(gcp.is_configured(s3, gcp.GCSConfig.from_env({})))
        gcs_only = gcp.GCSConfig.from_env({
            'ATLAS_CORPUS_BACKEND': 'gcs', 'ATLAS_CORPUS_BUCKET': 'c'})
        self.assertTrue(gcp.is_configured(s3, gcs_only))
        gcs_no_bucket = gcp.GCSConfig.from_env({'ATLAS_CORPUS_BACKEND': 'gcs'})
        self.assertFalse(gcp.is_configured(s3, gcs_no_bucket))


if __name__ == '__main__':
    unittest.main()
