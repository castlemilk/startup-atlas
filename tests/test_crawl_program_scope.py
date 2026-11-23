"""Replay retained programme-page link observations without fetching any URL."""
from copy import deepcopy
import importlib.util
import json
from pathlib import Path
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location('crawl_program_scope', ROOT / 'scripts/crawl.py')
crawl = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(crawl)
SOURCE = 'wa-carbon-innovation-grants-r3'
DOCUMENTS = f'{SOURCE}-documents'
REGISTRY = json.loads((ROOT / 'data/program-sources.json').read_text())
FIXTURE = json.loads((ROOT / 'tests/fixtures/wa-carbon-programmes-crawl-45-46.json').read_text())


def replay(rows):
    with patch.object(crawl, 'crawl_sites', return_value={'results': deepcopy(rows)}):
        return crawl.crawl_program_directories(REGISTRY, object(), object())


class ScopedProgrammeReplayTests(unittest.TestCase):
    def test_saved_landing_page_keeps_named_official_documents_and_raw_links(self):
        for run, rows in FIXTURE['runs'].items():
            with self.subTest(run=run):
                result = replay(rows)
                all_raw = next(row['pages'][0]['links'] for row in rows if row['id'] == SOURCE)
                self.assertEqual(result['results'][0]['pages'][0]['links'], all_raw)
                candidates = [c for c in result['candidates'] if c['source_id'] == SOURCE]
                self.assertEqual([c['label'] for c in candidates],
                                 ['Carbon Innovation Grants Program Round 3 documents'])
                self.assertTrue(candidates[0]['review_required'])
                self.assertEqual(candidates[0]['source_url'], rows[0]['url'])

    def test_nearby_document_and_broad_directory_controls(self):
        rows = deepcopy(FIXTURE['runs']['45169210509'])
        landing = rows[0]['pages'][0]
        landing['links'].extend([
            {'text':'Carbon Innovation Grant Programme Guide', 'context':'',
             'url':'https://www.wa.gov.au/system/files/carbon-innovation-grant-programme-guide.pdf'},
            {'text':'Carbon Innovation Grants Program', 'context':'',
             'url':'https://www.wa.gov.au.example/fake-carbon-innovation-grants-program'},
        ])
        result = replay(rows)
        self.assertIn('Carbon Innovation Grant Programme Guide', [
            c['label'] for c in result['candidates'] if c['source_id']==SOURCE
        ])
        self.assertFalse(any('wa.gov.au.example' in c['program_url'] for c in result['candidates']))
        self.assertTrue(any('Sample template of the funding agreement for pilot project' in c['label']
                            for c in result['candidates'] if c['source_id']==DOCUMENTS))
        self.assertTrue(any(c['source_id'] == 'startmate-offerings' for c in result['candidates']))


class QueenslandFemaleFoundersReplayTests(unittest.TestCase):
    source = 'qld-female-founders'
    target = 'https://innovation.qld.gov.au/grants-and-programs/female-founders-co-investment-fund'
    fixture = json.loads(
        (ROOT / 'tests/fixtures/qld-female-founders-programmes-crawl-45-46.json').read_text()
    )

    def test_saved_single_fund_keeps_the_state_application_not_generic_navigation(self):
        for run, rows in self.fixture['runs'].items():
            with self.subTest(run=run):
                result = replay(rows)
                self.assertEqual(result['results'], rows)
                rows_for_fund = [c for c in result['candidates'] if c['source_id'] == self.source]
                self.assertEqual([(c['label'], c['program_url']) for c in rows_for_fund],
                                 [('Learn how to apply', self.target)])
                self.assertTrue(rows_for_fund[0]['review_required'])
                self.assertIn('Research and Development Tax Incentive portal', [
                    c['label'] for c in result['candidates'] if c['source_id'] == 'au-grants'
                ])

    def test_similarly_named_hosts_and_unrelated_state_grants_do_not_match(self):
        rows = deepcopy(self.fixture['runs']['45169210509'])
        page = next(row['pages'][0] for row in rows if row['id'] == self.source)
        for url in (
            self.target.replace('innovation.qld.gov.au', 'innovation.qld.gov.au.example'),
            self.target.replace('innovation.qld.gov.au', 'innovation.qld.gov.au:444'),
            self.target + '-other',
        ):
            page['links'].append({'text': 'Female Founders Co-Investment Fund', 'url': url})
        result = replay(rows)
        self.assertEqual([c['program_url'] for c in result['candidates']
                          if c['source_id'] == self.source], [self.target])


class GoogleApacAcceleratorReplayTests(unittest.TestCase):
    source = 'google-apac'
    base = 'https://startup.google.com/intl/cloud/programs/accelerator/'
    fixture = json.loads(
        (ROOT / 'tests/fixtures/google-apac-programmes-crawl-45-46.json').read_text()
    )

    def test_saved_cards_survive_while_global_navigation_is_not_a_regional_lead(self):
        for run, rows in self.fixture['runs'].items():
            with self.subTest(run=run):
                result = replay(rows)
                self.assertEqual(result['results'], rows)
                kept = [c for c in result['candidates'] if c['source_id'] == self.source]
                self.assertEqual([c['program_url'] for c in kept], [self.base + name + '/' for name in (
                    'australia-new-zealand', 'india', 'japan', 'korea', 'singapore', 'southeast-asia',
                )])
                self.assertTrue(all(c['review_required'] for c in kept))
                self.assertIn('Cloud credits', [c['label'] for c in result['candidates']
                                                if c['source_id'] == 'google-directory'])

    def test_direct_regional_child_may_be_new_but_not_nested_or_another_host(self):
        rows = deepcopy(self.fixture['runs']['45169210509'])
        page = next(r['pages'][0] for r in rows if r['id'] == self.source)
        regional = 'https://startup.google.com/programs/accelerator/new-region/'
        page['links'].extend({'text': 'Accelerator regional programme', 'url': u} for u in (
            regional,
            regional + 'apply/',
            regional.replace('startup.google.com', 'startup.google.com.example'),
            regional.replace('new-region', 'asia-pacific'),
            regional.replace('startup.google.com', 'startup.google.com:444'),
        ))
        result = replay(rows)
        self.assertEqual([c['program_url'] for c in result['candidates']
                          if c['source_id'] == self.source][-1:], [regional])
        self.assertEqual(sum(c['source_id'] == self.source for c in result['candidates']), 7)


class IndiaSchemeNavigationReplayTests(unittest.TestCase):
    source = 'india-schemes'
    fixture = json.loads(
        (ROOT / 'tests/fixtures/india-navigation-crawl-45-46.json').read_text()
    )

    def test_portal_navigation_is_not_a_scheme_but_actual_leads_survive(self):
        for run, rows in self.fixture['runs'].items():
            with self.subTest(run=run):
                result = replay(rows)
                self.assertEqual(result['results'], rows)
                scoped = [r for r in result['candidates'] if r['source_id'] == self.source]
                labels = {r['label'] for r in scoped}
                self.assertTrue({
                    'Startup India Seed Fund Scheme', 'Credit Guarantee Scheme for Startups',
                    'Startup India Fund of Funds 2.0 Scheme', 'Apply for DPIIT Recognition',
                }.issubset(labels))
                self.assertTrue({'FAQs', 'Apply for Startup India Logo', 'Mentors',
                                 'Verify/Download Certificate', 'B. Benefits',
                                 'E. Process After Applying'}.isdisjoint(labels))
                self.assertEqual(len(scoped), 51)
                self.assertTrue(any(r['source_id'] == 'qld-female-founders'
                                    and r['label'] == 'Learn how to apply'
                                    for r in result['candidates']))

    def test_another_scheme_fragment_or_external_partner_is_not_filtered(self):
        rows = deepcopy(self.fixture['runs']['45169210509'])
        page = next(r['pages'][0] for r in rows if r['id'] == self.source)
        urls = ('https://www.startupindia.gov.in/content/sih/en/seed-scheme.html#apply',
                'https://seedfund.startupindia.gov.in/content/sih/en/search.html',
                page['final_url'] + '#new-funding-scheme')
        page['links'].extend({'text': 'Startup grant and funding programme', 'url': url}
                             for url in urls)
        result = replay(rows)
        self.assertTrue(set(urls).issubset(r['program_url'] for r in result['candidates']))
