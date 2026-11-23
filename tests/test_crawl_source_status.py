"""Exercise the CLI reporting path from saved observations without network."""
from contextlib import redirect_stderr, redirect_stdout
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location('atlas_crawl_source_status', ROOT / 'scripts/crawl.py')
crawl = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(crawl)


class SourceStatusReportTests(unittest.TestCase):
    def run_saved(self, mode, saved):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            seed = root / 'seed.json'
            seed.write_text('{}')
            approved = root / 'approved.csv'
            approved.touch()
            argv = [mode, '--out', str(root / 'out')]
            if mode == 'company-profiles':
                argv += ['--approved', str(approved)]
            stdout, stderr = io.StringIO(), io.StringIO()
            function = 'crawl_program_directories' if mode == 'programs' else 'crawl_company_profiles'
            with (patch.object(crawl, 'CATALOGUE', seed), patch.object(crawl, 'PROGRAM_SOURCES', seed),
                  patch.object(crawl, '_sampler', return_value=None),
                  patch.object(crawl, 'Transport', return_value=None),
                  patch.object(crawl, function, return_value=saved),
                  redirect_stdout(stdout), redirect_stderr(stderr)):
                result = crawl.main(argv)
            self.assertEqual(json.loads((root / 'out' / f'latest-{mode}.json').read_text()), saved)
        return result, stdout.getvalue(), stderr.getvalue()

    def test_real_programme_saved_coverage_does_not_abort_and_names_four_failed_sources(self):
        saved = json.loads((ROOT / 'tests/fixtures/program-source-status-45160671561.json').read_text())
        saved['candidates'] = []
        result, stdout, stderr = self.run_saved('programs', saved)
        self.assertEqual(result, 0)
        self.assertIn('13/17 attempted pages fetched; 4 skipped or failed', stdout)
        self.assertEqual(stderr.strip(), 'Sources with no successful pages: Canada NRC IRAP support, '
                         'Innovative Solutions Canada AI governance challenge, Ignite Program NT, '
                         'Ignite Program Guidelines (18 June 2026)')

    def test_standard_source_failed_is_not_confused_with_partial_or_unattempted(self):
        results = [
            {'name': 'Partial', 'pages': [{'status': 'ok'}, {'status': 'skipped'}]},
            {'name': 'Blocked', 'pages': [{'status': 'skipped'}]},
            {'name': 'Not tried', 'pages': []},
        ]
        result, _, stderr = self.run_saved('company-profiles', {
            'results': results, 'coverage': crawl.page_fetch_coverage(results, []), 'candidates': [],
        })
        self.assertEqual(result, 0)
        self.assertEqual(stderr.strip(), 'Sources with no successful pages: Blocked')

    def test_programme_total_failure_reports_and_still_returns_nonzero(self):
        results = [{'name': 'Failed feed', 'pages': [{'status': 'skipped'}]}]
        result, _, stderr = self.run_saved('programs', {
            'results': results, 'candidates': [],
            'coverage': {'fetch_status': 'none_succeeded', 'pages_succeeded': 0, 'pages_attempted': 1,
                         'pages_skipped_or_failed': 1, 'observed_candidates': 0, 'returned_candidates': 0,
                         'omitted_candidates': 0, 'sources': [
                             {'source_name': 'Failed feed', 'fetch_status': 'none_succeeded'},
                             {'source_name': 'Not tried', 'fetch_status': 'not_attempted'},
                         ]},
        })
        self.assertEqual(result, 1)
        self.assertEqual(stderr.splitlines(), [
            'Sources with no successful pages: Failed feed',
            'No records could be fetched; inspect the snapshot for reasons.',
        ])
