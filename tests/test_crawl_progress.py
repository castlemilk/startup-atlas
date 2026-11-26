"""Tests for scripts/crawl_progress.py — the live crawl-progress reporter.

Storage is a fake in-memory client and the clock is fake: no network, no
GCS. The reporter must never raise into a crawl, so failure injection is
asserted to be swallowed.
"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))

import crawl_progress as cp  # noqa: E402


class FakeClient:
    def __init__(self, fail=False):
        self.store = {}
        self.cache_stamps = []
        self.fail = fail
        self.puts = 0

    def put_json(self, key, obj):
        if self.fail:
            raise RuntimeError('storage down')
        import copy
        self.store[key] = copy.deepcopy(obj)
        self.puts += 1
        return {'key': key}

    def get_json(self, key):
        if self.fail:
            raise RuntimeError('storage down')
        if key not in self.store:
            raise KeyError(key)
        import copy
        return copy.deepcopy(self.store[key])

    def set_cache_control(self, key, value):
        if self.fail:
            raise RuntimeError('storage down')
        self.cache_stamps.append((key, value))


class FakeClock:
    def __init__(self, start=1_000_000.0):
        self.now = start

    def __call__(self):
        return self.now

    def advance(self, seconds):
        self.now += seconds


def make_reporter(client, clock, run_id='111', archive=None):
    return cp.ProgressReporter(
        client, archive, run_id=run_id, run_url='https://example/runs/111',
        trigger='workflow_dispatch', source_revision='abc123', clock=clock)


class ReporterTests(unittest.TestCase):
    def setUp(self):
        self.client = FakeClient()
        self.clock = FakeClock()
        self.reporter = make_reporter(self.client, self.clock)

    def record(self):
        return self.client.store[cp.crawl_progress_key()]

    def test_fresh_record_shape(self):
        self.reporter.begin_run()
        record = self.record()
        self.assertEqual(record['kind'], 'crawl-progress')
        self.assertEqual(record['version'], 1)
        self.assertEqual(list(record['modes']), cp.WORKFLOW_MODES)
        self.assertTrue(all(
            m['status'] == 'pending' for m in record['modes'].values()))
        self.assertEqual(record['run']['status'], 'running')
        self.assertEqual(record['run']['run_id'], '111')
        self.assertEqual(record['run']['heartbeat_seq'], 1)
        self.assertIsNone(record['last_completed'])
        # Every flush stamps no-cache (the T3/#373 lesson).
        self.assertIn((cp.crawl_progress_key(), 'no-cache'),
                      self.client.cache_stamps)

    def test_mode_lifecycle_and_counts(self):
        self.reporter.begin_run()
        self.reporter.mode_started('profiles', sources_total=2)
        self.reporter.source_done('profiles', 'Blackbird', candidates=10)
        self.clock.advance(10)
        self.reporter.source_done('profiles', 'Broken Co', failed=True,
                                  error='HTTP 500', candidates=10)
        data = {'candidates': [1, 2, 3],
                'coverage': {'pages_attempted': 9, 'pages_succeeded': 7,
                             'sources': [{'status': 'ok'},
                                         {'status': 'failed'}]}}
        self.reporter.mode_finished('profiles', data)
        entry = self.record()['modes']['profiles']
        self.assertEqual(entry['status'], 'completed')
        self.assertEqual(entry['sources_done'], 2)
        self.assertEqual(entry['sources_failed'], 1)
        self.assertEqual(entry['candidates'], 3)
        self.assertEqual(entry['pages_attempted'], 9)
        self.assertEqual(entry['pages_succeeded'], 7)
        self.assertIsNone(entry['current_source'])
        totals = self.record()['totals']
        self.assertEqual(totals['sources_done'], 2)
        self.assertEqual(totals['candidates'], 3)
        self.assertEqual(totals['errors'], 1)

    def test_flush_throttle(self):
        self.reporter.begin_run()
        puts_after_begin = self.client.puts
        self.reporter.mode_started('news', sources_total=30)
        puts_after_start = self.client.puts
        self.assertGreater(puts_after_start, puts_after_begin)
        # Inside the throttle window, per-source flushes are coalesced…
        for i in range(3):
            self.reporter.source_done('news', f'S{i}')
        self.assertEqual(self.client.puts, puts_after_start)
        # …until the source-count threshold trips.
        for i in range(3, 10):
            self.reporter.source_done('news', f'S{i}')
        self.assertGreater(self.client.puts, puts_after_start)
        # …or the time interval passes.
        puts = self.client.puts
        self.clock.advance(cp.FLUSH_INTERVAL_S + 1)
        self.reporter.source_done('news', 'S10')
        self.assertGreater(self.client.puts, puts)

    def test_same_run_adopts_record(self):
        self.reporter.begin_run()
        self.reporter.mode_started('partners', sources_total=12)
        other = make_reporter(self.client, self.clock)
        other.begin_run()
        self.assertEqual(other.record['modes']['partners']['status'],
                         'running')
        self.assertEqual(other.record['run']['started_at'],
                         self.record()['run']['started_at'])

    def test_finished_run_moves_to_last_completed(self):
        self.reporter.begin_run()
        self.reporter.mode_started('partners', sources_total=1)
        self.reporter.source_done('partners', 'Airtree', candidates=42)
        self.reporter.mode_finished('partners', {'candidates': [0] * 42})
        self.reporter.stamp_terminal('completed')
        nxt = make_reporter(self.client, self.clock, run_id='222')
        nxt.begin_run()
        last = nxt.record['last_completed']
        self.assertEqual(last['run_id'], '111')
        self.assertEqual(last['status'], 'completed')
        self.assertEqual(last['modes']['partners']['candidates'], 42)
        self.assertEqual(nxt.record['run']['run_id'], '222')

    def test_live_foreign_run_blocks_writes(self):
        self.reporter.begin_run()  # heartbeat fresh at t0
        foreign = make_reporter(self.client, self.clock, run_id='999')
        foreign.begin_run()
        self.assertTrue(foreign.conflict)
        foreign.mode_started('news', sources_total=5)
        foreign.flush(force=True)
        # The foreign reporter never overwrote the live record.
        self.assertEqual(self.record()['run']['run_id'], '111')

    def test_stale_foreign_run_is_taken_over(self):
        self.reporter.begin_run()
        self.clock.advance(cp.STALE_HEARTBEAT_S + 60)
        foreign = make_reporter(self.client, self.clock, run_id='999')
        foreign.begin_run()
        self.assertFalse(foreign.conflict)
        self.assertEqual(self.record()['run']['run_id'], '999')
        # The abandoned run never finished, so it is not a "last completed".
        self.assertIsNone(self.record()['last_completed'])

    def test_storage_failure_never_raises(self):
        failing = FakeClient(fail=True)
        reporter = make_reporter(failing, self.clock)
        reporter.begin_run()          # get + put both fail: swallowed
        reporter.mode_started('news', sources_total=3)
        reporter.source_done('news', 'X', failed=True, error='boom')
        reporter.mode_finished('news', {'candidates': []})
        reporter.stamp_terminal('failed')
        self.assertEqual(failing.store, {})

    def test_terminal_stamp_archives_and_skips_running_modes(self):
        archive = FakeClient()
        reporter = make_reporter(self.client, self.clock, archive=archive)
        reporter.begin_run()
        reporter.mode_started('logos')
        reporter.stamp_terminal('failed')
        record = self.record()
        self.assertEqual(record['run']['status'], 'failed')
        self.assertIsNotNone(record['run']['finished_at'])
        self.assertEqual(record['modes']['logos']['status'], 'skipped')
        archived = archive.store[cp.crawl_progress_archive_key('111')]
        self.assertEqual(archived['run']['status'], 'failed')

    def test_counts_from_data_shapes(self):
        self.assertEqual(cp.counts_from_data(None), {})
        self.assertEqual(cp.counts_from_data({'candidates': [1, 2]}),
                         {'candidates': 2})
        directory = {'coverage': {'sources': [
            {'status': 'ok'}, {'status': 'failed'}, {'status': 'ok'}]}}
        counts = cp.counts_from_data(directory)
        self.assertEqual(counts['sources_total'], 3)
        self.assertEqual(counts['sources_failed'], 1)

    def test_reused_mode_failures_counted_once(self):
        # F4: portraits reusing the company-profiles fetches carries the
        # same coverage; the shared failed source belongs to
        # company-profiles alone, so the run total counts it once.
        coverage = {'pages_attempted': 3, 'pages_succeeded': 2,
                    'sources': [{'status': 'failed'}, {'status': 'ok'}]}
        reused = {'candidates': [1, 2], 'coverage': coverage,
                  'reused_company_profiles':
                      {'snapshot': 'latest-company-profiles.json'}}
        self.assertEqual(cp.counts_from_data(reused), {'candidates': 2})
        self.reporter.begin_run()
        self.reporter.mode_finished(
            'company-profiles', {'candidates': [1], 'coverage': coverage})
        self.reporter.mode_finished('portraits', reused)
        record = self.record()
        self.assertEqual(record['modes']['company-profiles']['errors'], 1)
        portraits = record['modes']['portraits']
        self.assertEqual(portraits['errors'], 0)
        self.assertEqual(portraits['sources_failed'], 0)
        self.assertEqual(portraits['candidates'], 2)
        self.assertEqual(record['totals']['errors'], 1)


class CrawlInstrumentationTests(unittest.TestCase):
    """Two real crawl modes driven with a stub transport + real reporter."""

    def _run_modes(self):
        import importlib.util
        import types
        spec = importlib.util.spec_from_file_location(
            'atlas_crawl_for_progress',
            Path(__file__).resolve().parents[1] / 'scripts' / 'crawl.py')
        crawl = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(crawl)

        html = ('<html><head><title>Hi</title></head>'
                '<body><p>Hello world</p></body></html>').encode()

        class FixtureTransport:
            def request(self, url, allowed_host=None, **kwargs):
                return 200, {'Content-Type': 'text/html'}, html, url

        client = FakeClient()
        reporter = make_reporter(client, FakeClock())
        reporter.begin_run()

        catalogue = {'opportunities': [
            {'id': 'x', 'name': 'X Co', 'url': 'https://x.example/',
             'extra': []}], 'partnerLeads': []}
        site_args = types.SimpleNamespace(
            mode='partners', partners_only=False, only=[], approved=None,
            limit=0, follow=0)
        reporter.mode_started('partners')
        data = crawl.crawl_sites(catalogue, site_args, FixtureTransport(),
                                 progress=reporter)
        reporter.mode_finished('partners', data)

        registry = {'sources': [
            {'id': 's1', 'name': 'X Co', 'url': 'https://x.example/news'}]}
        news_args = types.SimpleNamespace(
            mode='news', only=[], limit=0, follow=0)
        reporter.mode_started('news')
        news = crawl.crawl_startup_news(registry, news_args,
                                        FixtureTransport(),
                                        progress=reporter)
        reporter.mode_finished('news', news)
        return client.store[cp.crawl_progress_key()]

    def test_two_modes_emit_progress_record(self):
        record = self._run_modes()
        partners = record['modes']['partners']
        self.assertEqual(partners['status'], 'completed')
        self.assertEqual(partners['sources_total'], 1)
        self.assertEqual(partners['sources_done'], 1)
        self.assertEqual(partners['sources_failed'], 0)
        news = record['modes']['news']
        self.assertEqual(news['status'], 'completed')
        self.assertEqual(news['sources_done'], 1)
        self.assertEqual(news['candidates'], 0)
        self.assertEqual(record['totals']['sources_done'], 2)

    def _run_failing_modes(self):
        import importlib.util
        import types
        spec = importlib.util.spec_from_file_location(
            'atlas_crawl_for_progress_failures',
            Path(__file__).resolve().parents[1] / 'scripts' / 'crawl.py')
        crawl = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(crawl)

        class FailingTransport:
            def request(self, url, allowed_host=None, **kwargs):
                return 500, {'Content-Type': 'text/html'}, b'', url

        client = FakeClient()
        reporter = make_reporter(client, FakeClock())
        reporter.begin_run()

        catalogue = {'opportunities': [
            {'id': 'x', 'name': 'X Co', 'url': 'https://x.example/',
             'extra': []}], 'partnerLeads': []}
        site_args = types.SimpleNamespace(
            mode='partners', partners_only=False, only=[], approved=None,
            limit=0, follow=0)
        reporter.mode_started('partners')
        data = crawl.crawl_sites(catalogue, site_args, FailingTransport(),
                                 progress=reporter)
        reporter.mode_finished('partners', data)

        registry = {'sources': [
            {'id': 's1', 'name': 'X Co', 'url': 'https://x.example/news'}]}
        news_args = types.SimpleNamespace(
            mode='news', only=[], limit=0, follow=0)
        reporter.mode_started('news')
        news = crawl.crawl_startup_news(registry, news_args,
                                        FailingTransport(),
                                        progress=reporter)
        reporter.mode_finished('news', news)
        return client.store[cp.crawl_progress_key()]

    def test_failed_sources_record_last_error(self):
        # Critique R2 F3: crawl.py must pass the failing page's reason as
        # error= so the durable record is diagnosable, not just counted.
        record = self._run_failing_modes()
        for mode in ('partners', 'news'):
            entry = record['modes'][mode]
            self.assertEqual(entry['sources_failed'], 1, mode)
            self.assertEqual(entry['errors'], 1, mode)
            self.assertEqual(entry['last_error'], 'HTTP 500', mode)
        self.assertEqual(record['totals']['errors'], 2)


class EnvGateTests(unittest.TestCase):
    def test_disabled_without_flag(self):
        self.assertIsNone(cp.reporter_from_env({}))
        self.assertIsNone(cp.reporter_from_env(
            {'ATLAS_CRAWL_PROGRESS': '0'}))

    def test_disabled_without_index_bucket(self):
        env = {'ATLAS_CRAWL_PROGRESS': '1', 'ATLAS_CORPUS_BACKEND': 'gcs',
               'ATLAS_CORPUS_BUCKET': 'corpus-bucket'}
        self.assertIsNone(cp.reporter_from_env(env))


if __name__ == '__main__':
    unittest.main()
