import csv
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
import plan_company_profiles as plan
import crawl


class PlanTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.overlay = Path(self.temp.name) / 'overlay.json'
        self.seeds = Path(self.temp.name) / 'seeds.csv'
        self.rows = [{'name': 'Beta', 'website': 'https://beta.test/'},
                     {'name': 'Alpha', 'website': 'https://alpha.test/', 'founders': [{'name': 'A'}]},
                     {'name': 'No Website'}]
        self.write(self.rows)
        self.seeds.write_text('partner,official_website,approved\nBeta,https://beta.test/,yes\nAlpha,https://alpha.test/,no\n')

    def write(self, rows):
        self.overlay.write_text(json.dumps({'startups': rows}))

    def result(self, **kwargs):
        return plan.build_plan(self.overlay, self.seeds, 'a' * 40, **kwargs)

    def test_population_presence_and_approval_are_separate(self):
        result = self.result()
        self.assertEqual(result['population']['source_records'], 3)
        self.assertEqual(result['population']['seed_states']['approved_seed_ready'], 1)
        self.assertEqual(result['population']['seed_states']['seed_review_required'], 1)
        self.assertEqual(result['population']['seed_states']['missing_reviewed_website'], 1)
        self.assertEqual(result['field_presence_totals']['founders'], 1)
        self.assertTrue(all(row['collection_state'] == 'not_assessed' for row in result['items']))
        self.assertEqual([row['approved_url'] for row in result['items']], [None, 'https://beta.test/', None])
        self.assertIn('not crawl completion', result['warning'])

    def test_resume_enumerates_once_in_exact_name_order(self):
        first = self.result(limit=1)
        replay = self.result(limit=1)
        self.assertEqual(first, replay)
        second = self.result(limit=1, cursor=first['next_cursor'])
        third = self.result(limit=1, cursor=second['next_cursor'])
        self.assertEqual([r['items'][0]['source_record_name'] for r in (first, second, third)],
                         ['Alpha', 'Beta', 'No Website'])
        self.assertIsNone(third['next_cursor'])
        self.assertTrue(third['inventory_exhausted'])
        self.assertFalse(first['inventory_exhausted'])

    def test_cursor_rejects_input_revision_batch_and_version_drift(self):
        cursor = self.result(limit=1)['next_cursor']
        with self.assertRaises(ValueError): self.result(limit=2, cursor=cursor)
        with self.assertRaises(ValueError): plan.build_plan(self.overlay, self.seeds, 'b' * 40, 1, cursor)
        self.overlay.write_text(self.overlay.read_text() + '\n')
        with self.assertRaises(ValueError): self.result(limit=1, cursor=cursor)
        self.write(self.rows)
        self.seeds.write_text(self.seeds.read_text() + '\n')
        with self.assertRaises(ValueError): self.result(limit=1, cursor=cursor)
        with self.assertRaises(ValueError): self.result(limit=1, cursor=cursor.replace('v1:', 'v2:'))

    def test_rejects_malformed_outside_and_nonboundary_cursors(self):
        binding = self.result(limit=2)['plan_id']
        for cursor in ['bad', f'v1:{binding}:0', f'v1:{binding}:1', f'v1:{binding}:3',
                       f'v1:{binding}:-1', f'v1:{binding}:99999', 'x' * 101]:
            with self.subTest(cursor=cursor), self.assertRaises(ValueError):
                self.result(limit=2, cursor=cursor)

    def test_duplicate_source_names_and_malformed_records_fail(self):
        for rows in [[self.rows[0], self.rows[0]], [{}], [None], [{'name': ' spaced '}],
                     [{'name': 'line\nbreak'}], [{'name': 10}]]:
            self.write(rows)
            with self.subTest(rows=rows), self.assertRaises(ValueError): self.result()

    def test_similar_names_are_not_normalized_or_merged(self):
        self.write([{'name': 'A-B'}, {'name': 'A B'}, {'name': 'a b'}, {'name': 'Á B'}])
        self.seeds.write_text('partner,official_website,approved\n')
        self.assertEqual(self.result()['population']['source_records'], 4)

    def test_empty_population_is_not_coverage_success(self):
        self.write([]); self.seeds.write_text('partner,official_website,approved\n')
        result = self.result()
        self.assertEqual(result['items'], [])
        self.assertEqual(result['population']['source_records'], 0)
        self.assertIsNone(result['next_cursor'])
        self.assertNotIn('verified', result)

    def test_unapproved_rows_never_become_ready(self):
        self.seeds.write_text('partner,official_website,approved\nBeta,https://beta.test/,false\n')
        self.assertEqual(self.result()['population']['seed_states']['approved_seed_ready'], 0)

    def test_duplicate_unknown_invalid_approved_rows_fail_like_collector(self):
        for rows in ['Beta,https://beta.test/,yes\nBeta,https://beta.test/,yes\n',
                     'Unknown,https://beta.test/,yes\n', 'Beta,http://beta.test/,yes\n',
                     'Beta,https://127.0.0.1/,yes\n', 'Beta,https://beta.test:80/,yes\n']:
            self.seeds.write_text('partner,official_website,approved\n' + rows)
            with self.subTest(rows=rows), self.assertRaises((ValueError, crawl.CrawlError)): self.result()

    def test_approved_host_mismatch_is_blocked(self):
        self.seeds.write_text('partner,official_website,approved\nBeta,https://other.test/,yes\n')
        beta = self.result()['items'][1]
        self.assertEqual(beta['seed_state'], 'seed_host_mismatch')
        self.assertIsNone(beta['approved_url'])

    def test_source_policy_is_checked_without_network(self):
        for url in ['https://beta.test/robots.txt', 'https://beta.test/%72obots.txt']:
            self.seeds.write_text('partner,official_website,approved\nBeta,' + url + ',yes\n')
            with patch.object(crawl.Transport, 'request', side_effect=AssertionError('network forbidden')), \
                    patch.object(crawl.socket, 'getaddrinfo', side_effect=AssertionError('DNS forbidden')):
                result = self.result()
            self.assertEqual(result['items'][1]['seed_state'], 'seed_url_blocked')
            self.assertIsNone(result['items'][1]['approved_url'])

    def test_invalid_reviewed_website_and_zero_presence(self):
        self.write([{'name': 'Beta', 'website': 'http://beta.test/', 'founded_year': 0}])
        result = self.result()
        self.assertEqual(result['items'][0]['seed_state'], 'invalid_reviewed_website')
        self.assertEqual(result['items'][0]['field_presence']['founded_year'], 'present')

    def test_shared_parser_matches_file_path_including_bom(self):
        self.seeds.write_text('\ufeffpartner,official_website,approved\nBeta,https://beta.test/,true\n')
        expected = crawl.load_approved_csv(self.seeds, set(['Beta']), require_qid=False)
        actual = list(plan.approved_from_bytes(self.seeds.read_bytes(), set(['Beta'])).values())
        self.assertEqual(actual, expected)

    def test_ambiguous_csv_headers_and_row_width_fail_closed(self):
        for content in [
            'partner,official_website,approved,approved\nBeta,https://beta.test/,no,yes\n',
            'partner,official_website,approved\nBeta,https://beta.test/,yes,extra\n',
            'partner,official_website,approved\nBeta,https://beta.test/\n',
        ]:
            self.seeds.write_text(content)
            with self.subTest(content=content), self.assertRaises(ValueError): self.result()

    def test_bounds_and_header(self):
        for limit in [0, 101, True, 1.5]:
            with self.subTest(limit=limit), self.assertRaises(ValueError): self.result(limit=limit)
        for revision in ['main', 'A' * 40, 'a' * 39]:
            with self.assertRaises(ValueError): plan.build_plan(self.overlay, self.seeds, revision)
        self.seeds.write_text('name,url\n')
        with self.assertRaises(ValueError): self.result()
        with patch.object(plan, 'MAX_BYTES', 1), self.assertRaises(ValueError): self.result()
        with patch.object(plan, 'MAX_STARTUPS', 1), self.assertRaises(ValueError): self.result()

    def test_cli_success_and_invalid_cursor_fail_closed(self):
        cmd = [sys.executable, str(ROOT/'scripts/plan_company_profiles.py'), '--overlay', str(self.overlay),
               '--approved', str(self.seeds), '--revision', 'a'*40, '--limit', '1']
        result = subprocess.run(cmd, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout)['returned'], 1)
        failure = subprocess.run(cmd + ['--cursor', 'bad'], capture_output=True, text=True)
        self.assertEqual(failure.returncode, 1)
        self.assertEqual(failure.stdout, '')


if __name__ == '__main__': unittest.main()
