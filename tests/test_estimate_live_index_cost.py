"""Tests for the _get retry in scripts/estimate_live_index_cost.py.

The bucket listings are large enough that a read can come back short
(http.client.IncompleteRead) — a flaky network read, not a missing
resource, so the estimator retries before giving up.
"""
import http.client
import importlib.util
import io
import json
import unittest
import unittest.mock as mock
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

spec = importlib.util.spec_from_file_location(
    'estimate_live_index_cost', ROOT / 'scripts' / 'estimate_live_index_cost.py')
estimator = importlib.util.module_from_spec(spec)
spec.loader.exec_module(estimator)


class GetRetryTests(unittest.TestCase):
    def test_retries_incomplete_read_then_succeeds(self):
        payload = json.dumps({'items': []}).encode()
        response = mock.MagicMock()
        response.__enter__.return_value = io.BytesIO(payload)
        response.__exit__.return_value = False
        calls = {'n': 0}
        request_ids = []

        def flaky(req, *args, **kwargs):
            calls['n'] += 1
            request_ids.append(id(req))
            if calls['n'] == 1:
                raise http.client.IncompleteRead(b'{"items":', 10)
            return response

        with mock.patch.object(estimator.urllib.request, 'urlopen', flaky), \
                mock.patch.object(estimator.time, 'sleep'):
            self.assertEqual(
                estimator._get('https://example.invalid/x'), {'items': []})
        self.assertEqual(calls['n'], 2)
        # A fresh Request per attempt: reusing one makes Google's
        # front-end answer HTTP 400 on the retry (23 Nov 2026).
        self.assertEqual(len(set(request_ids)), 2)

    def test_retries_remote_disconnected_then_succeeds(self):
        payload = json.dumps({'items': []}).encode()
        response = mock.MagicMock()
        response.__enter__.return_value = io.BytesIO(payload)
        response.__exit__.return_value = False
        calls = {'n': 0}

        def flaky(req, *args, **kwargs):
            calls['n'] += 1
            if calls['n'] == 1:
                raise http.client.RemoteDisconnected(
                    'Remote end closed connection without response')
            return response

        with mock.patch.object(estimator.urllib.request, 'urlopen', flaky), \
                mock.patch.object(estimator.time, 'sleep'):
            self.assertEqual(
                estimator._get('https://example.invalid/x'), {'items': []})
        self.assertEqual(calls['n'], 2)

    def test_raises_after_exhausting_attempts(self):
        def always_short(*args, **kwargs):
            raise http.client.IncompleteRead(b'', 10)

        with mock.patch.object(estimator.urllib.request, 'urlopen', always_short), \
                mock.patch.object(estimator.time, 'sleep'):
            with self.assertRaises(http.client.IncompleteRead):
                estimator._get('https://example.invalid/x', attempts=2)


if __name__ == '__main__':
    unittest.main()
