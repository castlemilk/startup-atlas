"""Tests for scripts/loop_health_check.py (issues #375, #385).

All network access is replaced with a dict-backed fake fetcher and git
dates with a stub, so the suite needs no network and no live loop.
"""
import hashlib
import importlib.util
import json
import unittest
from unittest.mock import patch
from datetime import date, datetime, timezone
from pathlib import Path
from tempfile import TemporaryDirectory

ROOT = Path(__file__).resolve().parents[1]


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, ROOT / path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


health = load('loop_health_check', 'scripts/loop_health_check.py')
corpus = load('atlas_corpus', 'scripts/atlas_corpus.py')

NOW = datetime(2026, 11, 24, 1, 0, 0, tzinfo=timezone.utc)
TODAY = NOW.date()
INDEX = health.INDEX_BASE
VERSION = '20261123T104508Z-3cb2b0e6'

REVIEWED_BODIES = {
    'catalogue.json': json.dumps({
        'updated': '2026-11-20',
        'opportunities': [{'id': 'x', 'checked': '2026-11-20'},
                          {'id': 'y', 'checked': '2026-11-23'}],
    }).encode(),
    'partners-reviewed.json': json.dumps({
        'A Partner': {'website': 'https://example.com',
                      'reviewed_at': '2026-11-22'},
    }).encode(),
    'partner-profiles.json': json.dumps({
        'A Partner': {'type': 'vc', 'checked': '2026-11-21'},
    }).encode(),
    'startup-research.json': json.dumps({
        'reviewed': '2026-11-23',
        'startups': [{'name': 'S', 'reviewed_at': '2026-11-23'}],
    }).encode(),
    # graph.json joined REVIEWED_FILES when the indexer began emitting
    # the edges tables (#359); the fixture predated that and every test
    # using it failed on main until it was added here.
    'graph.json': json.dumps({
        'version': 1,
        'entities': [{'id': 'x', 'reviewed_at': '2026-11-22'}],
    }).encode(),
    # treemap-evidence.json is in REVIEWED_FILES (atlas_corpus) as a
    # reviewed query input; the fixture predated its addition and the
    # corpus-lag / all-green tests failed on main until it was added.
    'treemap-evidence.json': json.dumps({
        'market_caps': {'X': {'checked': '2026-11-22'}},
    }).encode(),
}


DEFAULT_QUEUE = {
    'version': 1,
    'entries': [
        {'id': 'fact:a', 'status': 'pending',
         'created_at': '2026-11-23T12:00:00Z'},
        {'id': 'fact:b', 'status': 'pending',
         'created_at': '2026-11-23T11:00:00Z'},
        {'id': 'fact:c', 'status': 'pending',
         'created_at': '2026-11-22T09:00:00Z'},
        {'id': 'fact:d', 'status': 'approved',
         'created_at': '2026-11-21T09:00:00Z'},
    ],
}


def make_data_dir(root, bodies=None, queue=DEFAULT_QUEUE):
    data = Path(root) / 'data'
    data.mkdir(parents=True)
    for name, body in (bodies or REVIEWED_BODIES).items():
        (data / name).write_bytes(body)
    if queue is not None:
        (data / 'review-queue.json').write_text(json.dumps(queue))
    return data


def healthy_responses(data_bodies=None):
    bodies = data_bodies or REVIEWED_BODIES
    manifest_files = {
        name: {'sha256': hashlib.sha256(body).hexdigest(), 'bytes': len(body)}
        for name, body in bodies.items()
    }
    manifest_sha = corpus.reviewed_manifest(
        {name: body for name, body in bodies.items()})['sha256']
    tables = {f't{i}': 10 for i in range(9)}
    latest = {
        'version': VERSION,
        'manifest': f'v1/{VERSION}/manifest.json',
        'generated_at': '2026-11-23T10:45:08Z',
        'tables': tables,
    }
    index_manifest = {
        'corpus': {'reviewed_manifest_sha256': manifest_sha,
                   'files': manifest_files},
        'tables': {'articles': {'file': 'articles.parquet', 'rows': 10}},
    }
    return {
        ('https://api.github.com/repos/castlemilk/startup-atlas/actions/'
         'workflows/partner-research.yml/runs?per_page=1'): (200, json.dumps({
            'workflow_runs': [{'status': 'completed', 'conclusion': 'success',
                               'created_at': '2026-11-23T09:00:00Z',
                               'html_url': 'https://example.com/run'}],
        }).encode()),
        INDEX + 'crawl-progress.json': (200, json.dumps({
            'version': 1, 'kind': 'crawl-progress',
            'run': {'run_id': '999', 'status': 'completed',
                    'updated_at': '2026-11-24T00:30:00Z',
                    'current_mode': None},
        }).encode()),
        INDEX + 'latest.json': (200, json.dumps(latest).encode()),
        INDEX + f'v1/{VERSION}/manifest.json': (
            200, json.dumps(index_manifest).encode()),
        INDEX + 'query.html': (200, (
            '<script type="importmap">{"imports": '
            '{"apache-arrow": "./vendor/duckdb/apache-arrow/Arrow.dom.mjs"}}'
            '</script>').encode()),
        INDEX + f'v1/{VERSION}/articles.parquet': (
            200, b'PAR1' + b'\x00' * 32 + b'PAR1'),
    }


class FakeFetch:
    def __init__(self, responses):
        self.responses = responses

    def __call__(self, url):
        if url not in self.responses:
            raise health.FetchError(f'unexpected url {url}')
        return self.responses[url]


def run(responses, data_dir):
    return health.run_checks(fetch=FakeFetch(responses), now=NOW,
                             data_dir=data_dir,
                             git_date=lambda p: date(2026, 11, 20))


def levels(report, name):
    return [lvl for lvl, n, _ in report.lines if n == name]


class LoopHealthCheckTests(unittest.TestCase):
    def setUp(self):
        # These fixtures exercise the HTTP/magic checks, not Parquet decoding.
        # Keep the stub bytes deterministic on machines that have PyArrow.
        self.enterContext(patch.dict('sys.modules', {'pyarrow': None}))

    def test_all_green(self):
        with TemporaryDirectory() as tmp:
            data = make_data_dir(tmp)
            report = run(healthy_responses(), data)
            self.assertEqual(report.worst, health.OK, report.render())
            self.assertIn('stalest reviewed file is catalogue.json at 4d',
                          report.render())

    def test_crawl_failure_is_red(self):
        responses = healthy_responses()
        key = [k for k in responses if 'api.github.com' in k][0]
        responses[key] = (200, json.dumps({'workflow_runs': [{
            'status': 'completed', 'conclusion': 'failure',
            'created_at': '2026-11-23T09:00:00Z',
            'html_url': 'https://example.com/run'}]}).encode())
        with TemporaryDirectory() as tmp:
            report = run(responses, make_data_dir(tmp))
            self.assertEqual(levels(report, 'crawl'), [health.RED])
            self.assertEqual(report.worst, health.RED)

    def test_crawl_rate_limit_is_warn_not_red(self):
        responses = healthy_responses()
        key = [k for k in responses if 'api.github.com' in k][0]
        responses[key] = (403, b'rate limited')
        with TemporaryDirectory() as tmp:
            report = run(responses, make_data_dir(tmp))
            self.assertEqual(levels(report, 'crawl'), [health.WARN])

    def test_old_index_is_red(self):
        responses = healthy_responses()
        latest = json.loads(responses[INDEX + 'latest.json'][1])
        latest['generated_at'] = '2026-11-19T10:45:08Z'
        responses[INDEX + 'latest.json'] = (200, json.dumps(latest).encode())
        with TemporaryDirectory() as tmp:
            report = run(responses, make_data_dir(tmp))
            self.assertEqual(levels(report, 'index'), [health.RED])

    def test_wrong_table_count_is_red(self):
        responses = healthy_responses()
        latest = json.loads(responses[INDEX + 'latest.json'][1])
        latest['tables'] = {'only': 3}
        responses[INDEX + 'latest.json'] = (200, json.dumps(latest).encode())
        with TemporaryDirectory() as tmp:
            report = run(responses, make_data_dir(tmp))
            self.assertEqual(levels(report, 'index'), [health.RED])

    def test_corpus_lag_is_warn_and_names_file(self):
        bodies = dict(REVIEWED_BODIES)
        bodies['catalogue.json'] = json.dumps({
            'opportunities': [{'checked': '2026-11-20'}]}).encode()
        with TemporaryDirectory() as tmp:
            data = make_data_dir(tmp, bodies)
            # Responses were built from the ORIGINAL bodies, so the local
            # catalogue now differs from the published corpus.
            report = run(healthy_responses(), data)
            self.assertEqual(levels(report, 'corpus-lag'), [health.WARN])
            detail = [d for _, n, d in report.lines if n == 'corpus-lag'][0]
            self.assertIn('catalogue.json', detail)

    def test_missing_import_map_is_red(self):
        responses = healthy_responses()
        responses[INDEX + 'query.html'] = (200, b'<html>no map</html>')
        with TemporaryDirectory() as tmp:
            report = run(responses, make_data_dir(tmp))
            self.assertEqual(levels(report, 'console'), [health.RED])

    def test_stale_file_over_seven_days_is_red(self):
        bodies = dict(REVIEWED_BODIES)
        bodies['partner-profiles.json'] = json.dumps({
            'A Partner': {'checked': '2026-11-10'}}).encode()
        responses = healthy_responses(bodies)
        with TemporaryDirectory() as tmp:
            report = run(responses, make_data_dir(tmp, bodies))
            self.assertEqual(levels(report, 'checked-stalest'), [health.RED])
            self.assertIn('partner-profiles.json at 14d', report.render())

    def test_file_without_dates_falls_back_to_git_and_labels_it(self):
        bodies = dict(REVIEWED_BODIES)
        bodies['startup-research.json'] = json.dumps({
            'startups': [{'name': 'S'}]}).encode()
        responses = healthy_responses(bodies)
        with TemporaryDirectory() as tmp:
            report = run(responses, make_data_dir(tmp, bodies))
            detail = [d for _, n, d in report.lines
                      if n == 'checked' and 'startup-research' in d][0]
            self.assertIn('git last-commit date (fallback', detail)

    def test_console_notes_pyarrow_absence_or_verifies(self):
        with TemporaryDirectory() as tmp:
            report = run(healthy_responses(), make_data_dir(tmp))
            detail = [d for _, n, d in report.lines if n == 'console'][0]
            try:
                import pyarrow  # noqa: F401
                self.assertIn('verified', detail)
            except ImportError:
                self.assertIn('pyarrow not available', detail)

    def _console_drift_run(self, tmp, bucket_js):
        responses = healthy_responses()
        responses[INDEX + 'query.js'] = (200, bucket_js)
        responses[INDEX + 'query.css'] = (200, b'css-bytes')
        web = Path(tmp) / 'web'
        web.mkdir()
        html = responses[INDEX + 'query.html'][1]
        (web / 'query.html').write_bytes(html)
        (web / 'query.js').write_bytes(b'repo-js-bytes')
        (web / 'query.css').write_bytes(b'css-bytes')
        return health.run_checks(fetch=FakeFetch(responses), now=NOW,
                                 data_dir=make_data_dir(tmp),
                                 git_date=lambda p: date(2026, 11, 20),
                                 web_dir=web)

    def test_console_drift_warns_when_bucket_query_js_is_stale(self):
        with TemporaryDirectory() as tmp:
            report = self._console_drift_run(tmp, b'stale-bucket-js')
            self.assertEqual(levels(report, 'console-drift'), [health.WARN])
            detail = [d for _, n, d in report.lines
                      if n == 'console-drift'][0]
            self.assertIn('query.js', detail)

    def test_console_drift_ok_when_bucket_matches_web_source(self):
        with TemporaryDirectory() as tmp:
            report = self._console_drift_run(tmp, b'repo-js-bytes')
            self.assertEqual(levels(report, 'console-drift'), [health.OK])

    def _progress_run(self, record):
        responses = healthy_responses()
        responses[INDEX + 'crawl-progress.json'] = (
            200, json.dumps(record).encode())
        with TemporaryDirectory() as tmp:
            return run(responses, make_data_dir(tmp))

    def test_progress_running_fresh_is_ok(self):
        report = self._progress_run({
            'run': {'run_id': '42', 'status': 'running',
                    'updated_at': '2026-11-24T00:59:30Z',
                    'current_mode': 'profiles'}})
        self.assertEqual(levels(report, 'crawl-progress'), [health.OK])

    def test_progress_running_stale_is_warn_never_red(self):
        report = self._progress_run({
            'run': {'run_id': '42', 'status': 'running',
                    'updated_at': '2026-11-24T00:30:00Z',
                    'current_mode': 'logos'}})
        self.assertEqual(levels(report, 'crawl-progress'), [health.WARN])
        self.assertIn('heartbeat stale', report.render())

    def test_progress_missing_record_is_warn_unverified(self):
        responses = healthy_responses()
        responses[INDEX + 'crawl-progress.json'] = (404, b'')
        with TemporaryDirectory() as tmp:
            report = run(responses, make_data_dir(tmp))
        self.assertEqual(levels(report, 'crawl-progress'), [health.WARN])
        self.assertNotEqual(report.worst, health.RED)

    # --- review queue (#426) -------------------------------------------

    def test_queue_fresh_is_ok_and_reports_pending_count(self):
        with TemporaryDirectory() as tmp:
            report = run(healthy_responses(), make_data_dir(tmp))
            self.assertEqual(levels(report, 'review-queue'), [health.OK])
            detail = [d for _, n, d in report.lines
                      if n == 'review-queue'][0]
            self.assertIn('3 pending of 4 entries', detail)

    def test_old_entries_do_not_imply_failed_noop_rebuild(self):
        # A successful crawl can stage no new entries, leaving all committed
        # entry timestamps older than the run. This is not a build failure.
        queue = {'version': 1, 'entries': [
            {'id': 'fact:old', 'status': 'pending',
             'created_at': '2026-11-20T08:00:00Z'}]}
        with TemporaryDirectory() as tmp:
            report = run(healthy_responses(), make_data_dir(tmp, queue=queue))
            self.assertEqual(levels(report, 'review-queue'), [health.OK])
            detail = [d for _, n, d in report.lines if n == 'review-queue'][0]
            self.assertIn('newest entry 2026-11-20', detail)
            self.assertIn('rebuild freshness unverified', detail)
            self.assertNotIn('builder may have broken', detail)

    def test_empty_queue_is_valid_without_creation_timestamps(self):
        with TemporaryDirectory() as tmp:
            report = run(healthy_responses(), make_data_dir(
                tmp, queue={'version': 1, 'entries': []}))
            self.assertEqual(levels(report, 'review-queue'), [health.OK])
            detail = [d for _, n, d in report.lines if n == 'review-queue'][0]
            self.assertIn('0 pending of 0 entries', detail)
            self.assertIn('rebuild freshness unverified', detail)

    def test_queue_pending_above_threshold_is_warn(self):
        queue = {'version': 1, 'entries': [
            {'id': f'fact:{i}', 'status': 'pending',
             'created_at': '2026-11-23T12:00:00Z'}
            for i in range(health.QUEUE_PENDING_WARN + 1)]}
        with TemporaryDirectory() as tmp:
            report = run(healthy_responses(), make_data_dir(tmp, queue=queue))
            self.assertEqual(levels(report, 'review-queue'), [health.WARN])
            detail = [d for _, n, d in report.lines
                      if n == 'review-queue'][0]
            self.assertIn(f'pending count {health.QUEUE_PENDING_WARN + 1}',
                          detail)

    def test_queue_unreadable_degrades_to_warn_unverified(self):
        with TemporaryDirectory() as tmp:
            data = make_data_dir(tmp, queue=None)
            (data / 'review-queue.json').write_bytes(b'not json {')
            report = run(healthy_responses(), data)
            self.assertEqual(levels(report, 'review-queue'), [health.WARN])
            detail = [d for _, n, d in report.lines
                      if n == 'review-queue'][0]
            self.assertIn('unverified', detail)
            self.assertNotEqual(report.worst, health.RED)

    def test_queue_missing_degrades_to_warn_unverified(self):
        with TemporaryDirectory() as tmp:
            report = run(healthy_responses(),
                         make_data_dir(tmp, queue=None))
            self.assertEqual(levels(report, 'review-queue'), [health.WARN])
            self.assertNotEqual(report.worst, health.RED)


if __name__ == '__main__':
    unittest.main()
