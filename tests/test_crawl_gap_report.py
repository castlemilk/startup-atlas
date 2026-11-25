import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, ROOT / path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


gap_report = load('atlas_crawl_gap_report', 'scripts/crawl_gap_report.py')

GENERATED = '2026-11-25T01:05:00Z'


def gappy_graph():
    """One planted gap per scope, plus covered controls."""
    return {
        'entities': [
            {'id': 'startup:funded', 'kind': 'startup',
             'logo': 'https://example.com/funded.png'},
            {'id': 'startup:cohort', 'kind': 'startup',
             'logo': 'https://example.com/cohort.png'},
            {'id': 'startup:plain', 'kind': 'startup'},
            {'id': 'person:complete', 'kind': 'person',
             'logo': 'https://example.com/complete.png',
             'socials': [{'label': 'LinkedIn',
                          'url': 'https://linkedin.com/in/complete'}]},
            {'id': 'person:bare', 'kind': 'person'},
        ],
        'edges': [
            {'from': 'startup:cohort', 'to': 'programme:accel',
             'kind': 'participated_in'},
            {'from': 'startup:funded', 'to': 'programme:accel',
             'kind': 'participated_in', 'round_id': 'round:funded-1'},
        ],
        'funding_rounds': [
            {'id': 'round:funded-1', 'startup_id': 'startup:funded',
             'lead_investor': 'Lead Capital'},
            {'id': 'round:leaderless', 'startup_id': 'startup:funded'},
        ],
    }


def complete_graph():
    return {
        'entities': [
            {'id': 'startup:funded', 'kind': 'startup',
             'logo': 'https://example.com/funded.png'},
            {'id': 'person:complete', 'kind': 'person',
             'logo': 'https://example.com/complete.png',
             'socials': [{'label': 'LinkedIn',
                          'url': 'https://linkedin.com/in/complete'}]},
        ],
        'edges': [
            {'from': 'startup:funded', 'to': 'programme:accel',
             'kind': 'participated_in'},
        ],
        'funding_rounds': [
            {'id': 'round:funded-1', 'startup_id': 'startup:funded',
             'lead_investor': 'Lead Capital'},
        ],
    }


def scope(report, scope_id):
    return next(s for s in report['scopes'] if s['scope_id'] == scope_id)


class GapReportTests(unittest.TestCase):

    def test_planted_gaps_are_flagged_per_scope(self):
        report = gap_report.build_report(gappy_graph(), generated_at=GENERATED)
        self.assertEqual(scope(report, 'cohort-rounds')['uncovered_ids'],
                         ['startup:cohort'])
        self.assertEqual(scope(report, 'startup-funding')['uncovered_ids'],
                         ['startup:cohort', 'startup:plain'])
        self.assertEqual(scope(report, 'startup-logos')['uncovered_ids'],
                         ['startup:plain'])
        self.assertEqual(scope(report, 'person-headshots')['uncovered_ids'],
                         ['person:bare'])
        self.assertEqual(scope(report, 'person-socials')['uncovered_ids'],
                         ['person:bare'])
        self.assertEqual(scope(report, 'round-lead-investors')['uncovered_ids'],
                         ['round:leaderless'])
        for entry in report['scopes']:
            self.assertEqual(entry['completion'], 'partial')
        self.assertEqual(report['totals']['uncovered'], 7)

    def test_complete_graph_reports_no_gaps(self):
        report = gap_report.build_report(complete_graph(),
                                         generated_at=GENERATED)
        self.assertTrue(report['scopes'])
        for entry in report['scopes']:
            self.assertEqual(entry['uncovered_ids'], [])
            self.assertEqual(entry['completion'], 'complete')
        self.assertEqual(report['totals']['uncovered'], 0)

    def test_empty_graph_produces_an_empty_report(self):
        report = gap_report.build_report({}, generated_at=GENERATED)
        self.assertEqual(report['scopes'], [])
        self.assertEqual(report['totals'],
                         {'eligible': 0, 'covered': 0, 'uncovered': 0})

    def test_summary_names_counts_and_gap_ids(self):
        report = gap_report.build_report(gappy_graph(), generated_at=GENERATED)
        summary = gap_report.render_summary(report)
        self.assertIn('**7 gaps**', summary)
        self.assertIn('startup:cohort', summary)
        self.assertIn('person:bare', summary)
        clean = gap_report.render_summary(
            gap_report.build_report(complete_graph(), generated_at=GENERATED))
        self.assertIn('**0 gaps**', clean)
        self.assertIn('No gaps.', clean)

    def test_main_writes_json_and_summary_files(self):
        with tempfile.TemporaryDirectory() as directory:
            directory = Path(directory)
            graph_path = directory / 'graph.json'
            graph_path.write_text(json.dumps(gappy_graph()), encoding='utf-8')
            out_path = directory / 'crawl-gap-report.json'
            summary_path = directory / 'crawl-gap-report.md'
            result = gap_report.main([
                '--graph', str(graph_path), '--out', str(out_path),
                '--summary-md', str(summary_path),
                '--catalogue-revision', 'a' * 40,
                '--generated-at', GENERATED])
            self.assertEqual(result, 0)
            written = json.loads(out_path.read_text(encoding='utf-8'))
            self.assertEqual(written['generated_at'], GENERATED)
            self.assertEqual(written['catalogue_revision'], 'a' * 40)
            self.assertEqual(written['totals']['uncovered'], 7)
            self.assertIn('**7 gaps**',
                          summary_path.read_text(encoding='utf-8'))

    def test_main_rejects_an_unreadable_graph(self):
        with tempfile.TemporaryDirectory() as directory:
            missing = Path(directory) / 'nope.json'
            self.assertEqual(gap_report.main(['--graph', str(missing)]), 2)


if __name__ == '__main__':
    unittest.main()
