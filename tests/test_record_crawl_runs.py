import hashlib
import importlib.util
import json
import re
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


recorder = load('atlas_record_crawl_runs', 'scripts/record_crawl_runs.py')

REVISION = 'a' * 40
FINISHED = recorder._parse_time('2026-11-25T01:05:00Z')


def snapshot(mode, results, candidates, generated='2026-11-25T01:00:00Z'):
    return {'version': 1, 'mode': mode, 'generated_at': generated,
            'results': results, 'candidates': candidates}


def row(name, url, statuses, row_id=None):
    result = {'name': name, 'url': url,
              'pages': [{'status': status} for status in statuses]}
    if row_id:
        result['id'] = row_id
    return result


class RecordCrawlRunsTests(unittest.TestCase):
    def build(self, mode, snap, tmp):
        path = Path(tmp) / recorder.snapshot_filename(mode)
        path.write_text(json.dumps(snap), encoding='utf-8')
        return recorder.build_record(
            mode, path, snap, root=ROOT, catalogue_revision=REVISION,
            claimed_by='github-actions', run_url='https://github.com/x/y/actions/runs/1',
            sequence=47, finished_at=FINISHED)

    def assert_valid_shape(self, record):
        # Mirror of the hard constraints in backend/mcp/crawls.mjs.
        self.assertRegex(record['run_id'], r'^crawl-\d{8}-[a-z0-9-]+-\d{2}$')
        self.assertIn(record['mode'], recorder.WORKFLOW_MODES)
        self.assertTrue(record['scope']['source_ids'])
        self.assertRegex(record['scope']['seed_sha256'], r'^[a-f0-9]{64}$')
        self.assertRegex(record['catalogue_revision'], r'^[a-f0-9]{40}$')
        self.assertEqual(set(record['source_revisions']),
                         set(record['scope']['source_ids']))
        for value in record['source_revisions'].values():
            self.assertRegex(value, r'^[a-f0-9]{64}$')
        for key in ('claimed_at', 'lease_expires_at', 'started_at', 'finished_at'):
            self.assertRegex(record[key], r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$')
        outcome = record['outcome']
        self.assertLessEqual(outcome['sources_succeeded'] + outcome['sources_failed'],
                             outcome['sources_attempted'])
        for entry in outcome['sources']:
            self.assertLessEqual(entry['pages_ok'], entry['pages_attempted'])
            self.assertIn(entry['status'], ('ok', 'failed', 'not_attempted'))
        self.assertRegex(record['snapshot_sha256'], r'^[a-f0-9]{64}$')

    def test_partners_record_uses_registry_seed_ids_and_counts(self):
        with tempfile.TemporaryDirectory() as tmp:
            snap = snapshot('partners', [
                row('GitHub for Startups partner directory', 'https://github.com/enterprise/startups/partners', ['ok', 'ok']),
                row('AWS Activate featured', 'https://aws.amazon.com/activate', ['skipped']),
            ], [{'name': 'Example VC'}])
            record = self.build('partners', snap, tmp)
        self.assert_valid_shape(record)
        seed = json.loads((ROOT / 'data/partner-sources.json').read_text())
        self.assertEqual(record['scope']['source_ids'],
                         [source['id'] for source in seed['sources']])
        self.assertEqual(record['run_id'], 'crawl-20261125-partners-47')
        self.assertEqual(record['status'], 'completed')
        self.assertEqual(record['outcome']['sources_attempted'], 2)
        self.assertEqual(record['outcome']['sources_succeeded'], 1)
        self.assertEqual(record['outcome']['sources_failed'], 1)
        self.assertEqual(record['outcome']['candidates_discovered'], 1)
        self.assertEqual(record['outcome']['sources'][0]['pages_ok'], 2)

    def test_all_failed_sources_record_failed_status(self):
        with tempfile.TemporaryDirectory() as tmp:
            snap = snapshot('news', [row('Canva', 'https://www.canva.com/newsroom/news/', ['skipped'])], [])
            record = self.build('news', snap, tmp)
        self.assert_valid_shape(record)
        self.assertEqual(record['status'], 'failed')
        self.assertEqual(record['outcome']['sources_failed'], 1)

    def test_csv_mode_source_ids_come_from_results(self):
        with tempfile.TemporaryDirectory() as tmp:
            snap = snapshot('profiles', [
                row('Blackbird Ventures', 'https://www.blackbird.vc/', ['ok'], 'partner:Q123'),
                row('Blackbird Ventures', 'https://www.blackbird.vc/', ['ok'], 'partner:Q123'),
            ], [])
            record = self.build('profiles', snap, tmp)
        self.assert_valid_shape(record)
        self.assertEqual(record['scope']['source_ids'], ['partner:Q123'])

    def test_partner_candidates_record_without_results(self):
        with tempfile.TemporaryDirectory() as tmp:
            snap = {'version': 1, 'mode': 'partner-candidates',
                    'generated_at': '2026-11-25T01:00:00Z',
                    'candidates': [{'partner': 'Blackbird Ventures'}]}
            record = self.build('partner-candidates', snap, tmp)
        self.assert_valid_shape(record)
        self.assertEqual(record['status'], 'completed')
        self.assertEqual(record['outcome']['candidates_discovered'], 1)
        self.assertEqual(record['outcome']['sources'], [])

    def test_snapshot_hash_matches_file_bytes(self):
        with tempfile.TemporaryDirectory() as tmp:
            snap = snapshot('portraits', [row('PsiQuantum', 'https://www.psiquantum.com/', ['ok'])], [])
            record = self.build('portraits', snap, tmp)
            raw = (Path(tmp) / 'latest-portraits.json').read_bytes()
        self.assertEqual(record['snapshot_sha256'], hashlib.sha256(raw).hexdigest())

    def test_append_dedupes_by_run_id(self):
        with tempfile.TemporaryDirectory() as tmp:
            registry = Path(tmp) / 'crawl-runs.json'
            registry.write_text(json.dumps({'version': 1, 'runs': []}), encoding='utf-8')
            snap = snapshot('partners', [row('X', 'https://example.com/', ['ok'])], [])
            record = self.build('partners', snap, tmp)
            added, skipped = recorder.append_records(registry, [record])
            self.assertEqual(added, [record['run_id']])
            self.assertEqual(skipped, [])
            added, skipped = recorder.append_records(registry, [record])
            self.assertEqual(added, [])
            self.assertEqual(skipped, [record['run_id']])
            document = json.loads(registry.read_text())
            self.assertEqual(len(document['runs']), 1)


if __name__ == '__main__':
    unittest.main()
