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
