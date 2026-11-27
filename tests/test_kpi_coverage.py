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


kpi = load('atlas_kpi_coverage', 'scripts/kpi_coverage.py')
gap_report = load('atlas_crawl_gap_report', 'scripts/crawl_gap_report.py')

GENERATED = '2026-11-27T02:00:00Z'


def research_fixture():
    return {
        'startups': [
            {
                'name': 'Covered Co',
                'description': 'Fully recorded.',
                'funding_rounds': [{'stage': 'Seed'}],
                'profile_facts': [{'key': 'a'}, {'key': 'b'}, {'key': 'c'}],
                'founders': [
                    {'name': 'Pat Done', 'photo_url': 'https://x/p.png',
                     'linkedin': 'https://www.linkedin.com/in/patdone'},
                ],
            },
            {
                'name': 'Gappy Co',
                'description': 'Partially recorded.',
                'funding_rounds': [{'stage': 'Seed'}],
                'profile_facts': [{'key': 'a'}, {'key': 'b'}, {'key': 'c'}],
                'founders': [
                    {'name': 'No Photo', 'linkedin': 'https://www.linkedin.com/in/nophoto'},
                    {'name': 'No Linkedin', 'photo_url': 'https://x/n.png'},
                    {'name': 'Bare Founder'},
                ],
            },
            {
                'name': 'Thin Co',
                'description': '',
                'funding_rounds': [],
                'profile_facts': [{'key': 'a'}],
                'founders': [],
            },
        ],
    }


def partners_fixture():
    return {
        'Logo Capital': {'website': 'https://logo.example',
                         'logo': 'https://logo.example/logo.svg',
                         'linkedin': 'https://www.linkedin.com/company/logo-capital'},
        'Bare Ventures': {'website': 'https://bare.example'},
    }


def registry_fixture():
    return {'records': [
        {'scope_id': 'founder-linkedin',
         'entity_id': 'founder:gappy-co:bare-founder',
         'exhausted_at': '2026-11-27', 'reason': 'login-walled'},
        {'scope_id': 'founder-photos',
         'entity_id': 'founder:not-a-gap:covered-person',
         'exhausted_at': '2026-11-27', 'reason': 'not a gap; must be ignored'},
    ]}


def signal(report, signal_id):
    return next(s for s in report['signals'] if s['id'] == signal_id)


class ScopeParityTest(unittest.TestCase):
    """The KPI signals must reuse the gap report's own scope math."""

    def test_counts_match_gap_report_scopes(self):
        research, partners = research_fixture(), partners_fixture()
        scopes = {s['scope_id']: s for s in
                  gap_report.founder_scopes(research) + gap_report.partner_scopes(partners)}
        report = kpi.build_report(research, partners, {'records': []},
                                  generated_at=GENERATED)
        for signal_id, scope_id in (('C6', 'founder-photos'),
                                    ('C7', 'founder-linkedin'),
                                    ('C8', 'partner-logos'),
                                    ('C9', 'partner-linkedin')):
            entry = signal(report, signal_id)
            self.assertEqual(entry['total'], scopes[scope_id]['eligible_total'])
            self.assertEqual(entry['covered'], scopes[scope_id]['counts']['covered'])
            self.assertEqual(entry['uncovered_ids'], scopes[scope_id]['uncovered_ids'])

    def test_founder_counts(self):
        report = kpi.build_report(research_fixture(), partners_fixture(),
                                  {'records': []}, generated_at=GENERATED)
        self.assertEqual((signal(report, 'C6')['covered'], signal(report, 'C6')['total']), (2, 4))
        self.assertEqual((signal(report, 'C7')['covered'], signal(report, 'C7')['total']), (2, 4))
        self.assertEqual((signal(report, 'C8')['covered'], signal(report, 'C8')['total']), (1, 2))
        self.assertEqual((signal(report, 'C9')['covered'], signal(report, 'C9')['total']), (1, 2))


class ExhaustedSplitTest(unittest.TestCase):
    def test_exhausted_gap_is_not_an_open_gap(self):
        report = kpi.build_report(research_fixture(), partners_fixture(),
                                  registry_fixture(), generated_at=GENERATED)
        c7 = signal(report, 'C7')
        self.assertEqual(c7['gaps'], 2)
        self.assertEqual(c7['exhausted'], 1)
        self.assertEqual(c7['exhausted_ids'], ['founder:gappy-co:bare-founder'])
        self.assertEqual(c7['open_gaps'], 1)
        self.assertEqual(c7['open_ids'], ['founder:gappy-co:no-linkedin'])

    def test_exhausted_record_for_covered_entity_is_ignored(self):
        report = kpi.build_report(research_fixture(), partners_fixture(),
                                  registry_fixture(), generated_at=GENERATED)
        self.assertEqual(signal(report, 'C6')['exhausted'], 0)

    def test_all_gaps_exhausted_scores_green(self):
        registry = {'records': [
            {'scope_id': 'partner-logos', 'entity_id': 'partner:bare-ventures'},
            {'scope_id': 'partner-linkedin', 'entity_id': 'partner:bare-ventures'},
        ]}
        report = kpi.build_report(research_fixture(), partners_fixture(),
                                  registry, generated_at=GENERATED)
        self.assertEqual(signal(report, 'C8')['rag'], 'green')
        self.assertEqual(signal(report, 'C9')['rag'], 'green')
        self.assertEqual(signal(report, 'C8')['open_gaps'], 0)


class RagTrendTest(unittest.TestCase):
    def test_no_open_gaps_is_green_without_history(self):
        self.assertEqual(kpi.evaluate(0, [])[0], 'green')

    def test_baseline_with_gaps_is_amber(self):
        self.assertEqual(kpi.evaluate(5, [])[0], 'amber')

    def test_falling_gaps_are_amber(self):
        self.assertEqual(kpi.evaluate(4, [5])[0], 'amber')

    def test_growing_gaps_are_red(self):
        self.assertEqual(kpi.evaluate(6, [5])[0], 'red')

    def test_one_unchanged_refresh_is_amber(self):
        self.assertEqual(kpi.evaluate(5, [5])[0], 'amber')

    def test_two_unchanged_refreshes_are_red(self):
        self.assertEqual(kpi.evaluate(5, [5, 5])[0], 'red')

    def test_history_is_read_from_snapshots(self):
        history = {'snapshots': [
            {'signals': {'C6': {'open_gaps': 10}}},
            {'signals': {'C6': {'open_gaps': 9}}},
        ]}
        report = kpi.build_report(research_fixture(), partners_fixture(),
                                  {'records': []}, generated_at=GENERATED,
                                  history_doc=history)
        # Fixture has 2 open photo gaps, down from 9: amber, falling.
        c6 = signal(report, 'C6')
        self.assertEqual(c6['open_gaps'], 2)
        self.assertEqual(c6['rag'], 'amber')
        self.assertIn('fell', c6['rag_reason'])


class ThinRecordsTest(unittest.TestCase):
    def test_thin_rule(self):
        thin = kpi.thin_startups(research_fixture())
        self.assertEqual([entry['name'] for entry in thin], ['Thin Co'])
        entry = thin[0]
        self.assertEqual(entry['entity_id'], 'startup:thin-co')
        self.assertEqual(entry['funding_rounds'], 0)
        self.assertEqual(entry['profile_facts'], 1)
        self.assertFalse(entry['has_description'])
        self.assertEqual(len(entry['reasons']), 2)

    def test_zero_rounds_with_enough_facts_is_not_thin(self):
        research = {'startups': [{
            'name': 'Bootstrapped Co', 'description': 'Real, just unfunded.',
            'funding_rounds': [],
            'profile_facts': [{'key': 'a'}, {'key': 'b'}, {'key': 'c'}, {'key': 'd'}],
            'founders': [],
        }]}
        self.assertEqual(kpi.thin_startups(research), [])

    def test_missing_description_alone_is_thin(self):
        research = {'startups': [{
            'name': 'Undescribed Co', 'description': '  ',
            'funding_rounds': [{'stage': 'Seed'}],
            'profile_facts': [{'key': 'a'}, {'key': 'b'}, {'key': 'c'}],
            'founders': [],
        }]}
        self.assertEqual(len(kpi.thin_startups(research)), 1)

    def test_thin_signal_shape(self):
        report = kpi.build_report(research_fixture(), partners_fixture(),
                                  {'records': []}, generated_at=GENERATED)
        c10 = signal(report, 'C10')
        self.assertEqual(c10['total'], 3)
        self.assertEqual(c10['gaps'], 1)
        self.assertEqual(c10['open_gaps'], 1)
        self.assertEqual(c10['rag'], 'amber')


class CliTest(unittest.TestCase):
    def test_main_writes_report_summary_and_appends_history(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp = Path(tmp)
            (tmp / 'research.json').write_text(json.dumps(research_fixture()))
            (tmp / 'partners.json').write_text(json.dumps(partners_fixture()))
            (tmp / 'exhausted.json').write_text(json.dumps(registry_fixture()))
            history = tmp / 'history.json'
            out = tmp / 'report.json'
            summary = tmp / 'summary.md'
            argv = ['--research', str(tmp / 'research.json'),
                    '--partners', str(tmp / 'partners.json'),
                    '--exhausted', str(tmp / 'exhausted.json'),
                    '--history', str(history),
                    '--out', str(out), '--summary-md', str(summary)]
            self.assertEqual(kpi.main(argv), 0)
            report = json.loads(out.read_text())
            self.assertEqual(len(report['signals']), 5)
            self.assertIn('C6', summary.read_text())
            doc = json.loads(history.read_text())
            self.assertEqual(len(doc['snapshots']), 1)
            self.assertEqual(doc['snapshots'][0]['signals']['C7']['open_gaps'], 1)
            # Second run appends and trends against the first snapshot.
            self.assertEqual(kpi.main(argv), 0)
            doc = json.loads(history.read_text())
            self.assertEqual(len(doc['snapshots']), 2)

    def test_missing_exhausted_file_means_no_exhausted(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp = Path(tmp)
            (tmp / 'research.json').write_text(json.dumps(research_fixture()))
            (tmp / 'partners.json').write_text(json.dumps(partners_fixture()))
            out = tmp / 'report.json'
            self.assertEqual(kpi.main([
                '--research', str(tmp / 'research.json'),
                '--partners', str(tmp / 'partners.json'),
                '--exhausted', str(tmp / 'absent.json'),
                '--out', str(out)]), 0)
            report = json.loads(out.read_text())
            self.assertTrue(all(s['exhausted'] == 0 for s in report['signals']))


if __name__ == '__main__':
    unittest.main()
