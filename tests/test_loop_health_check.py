"""Tests for scripts/loop_health_check.py (issues #375, #385).

All network access is replaced with a dict-backed fake fetcher and git
dates with a stub, so the suite needs no network and no live loop.
"""
import hashlib
import importlib.util
import json
import unittest
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
}


def make_data_dir(root, bodies=None):
    data = Path(root) / 'data'
    data.mkdir(parents=True)
    for name, body in (bodies or REVIEWED_BODIES).items():
        (data / name).write_bytes(body)
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


if __name__ == '__main__':
    unittest.main()
