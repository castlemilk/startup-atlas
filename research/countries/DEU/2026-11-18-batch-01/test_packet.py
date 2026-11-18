"""Exercise #177's existing offline planner against staged country records.

No collector or #178 synthetic replay adapter is activated. A complete inventory
page sequence is never reported as a complete country or live collection run.
"""
import csv
import hashlib
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[3]
sys.path.insert(0, str(REPO / 'scripts'))
from plan_company_profiles import build_plan  # noqa: E402

REVISION = 'f4bcbf7030d741772bb750deee584efa3ee17749'

class CountryInventoryTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='atlas-de-inventory-')
        self.root = Path(self.tmp.name)
        self.overlay = self.root / 'records.json'
        self.seeds = self.root / 'seed-review.csv'
        self.overlay.write_bytes((HERE / 'records.json').read_bytes())
        self.seeds.write_bytes((HERE / 'seed-review.csv').read_bytes())

    def tearDown(self):
        self.tmp.cleanup()

    def plan(self, **kwargs):
        return build_plan(self.overlay, self.seeds, REVISION, **kwargs)

    def test_all_staged_records_once_across_bounded_pages(self):
        names, cursor, pages = [], None, 0
        while True:
            page = self.plan(limit=10, cursor=cursor)
            self.assertLessEqual(page['returned'], 10)
            self.assertTrue(all(x['seed_state']=='seed_review_required' for x in page['items']))
            self.assertTrue(all(x['collection_state']=='not_assessed' for x in page['items']))
            names.extend(x['source_record_name'] for x in page['items'])
            pages += 1
            cursor = page['next_cursor']
            if cursor is None:
                break
            self.assertLess(pages, 10)
        expected = sorted(x['name'] for x in json.loads(self.overlay.read_text())['startups'])
        self.assertEqual(names, expected)
        self.assertEqual(len(names), len(set(names)))
        self.assertEqual(page['population']['seed_states']['approved_seed_ready'], 0)
        self.assertIn('not crawl completion', page['warning'])

    def test_restart_from_saved_cursor_and_exact_replay(self):
        first = self.plan(limit=10)
        checkpoint = self.root / 'checkpoint.json'
        checkpoint.write_text(json.dumps({'revision':REVISION,'next_cursor':first['next_cursor'],
                                           'overlay_sha256':first['overlay_sha256'],
                                           'seeds_sha256':first['seeds_sha256'],'limit':10}))
        saved = json.loads(checkpoint.read_text())
        resumed = build_plan(self.overlay,self.seeds,saved['revision'],limit=saved['limit'],cursor=saved['next_cursor'])
        self.assertEqual(resumed,self.plan(limit=10,cursor=first['next_cursor']))
        self.assertFalse({x['source_record_name'] for x in first['items']} & {x['source_record_name'] for x in resumed['items']})

    def test_cursor_rejects_changed_overlay_bytes(self):
        cursor = self.plan(limit=10)['next_cursor']
        self.overlay.write_bytes(self.overlay.read_bytes()+b'\n')
        with self.assertRaisesRegex(ValueError,'Cursor does not match'):
            self.plan(limit=10,cursor=cursor)

    def test_cursor_rejects_changed_seed_bytes(self):
        cursor = self.plan(limit=10)['next_cursor']
        self.seeds.write_bytes(self.seeds.read_bytes()+b'\n')
        with self.assertRaisesRegex(ValueError,'Cursor does not match'):
            self.plan(limit=10,cursor=cursor)

    def test_cursor_rejects_revision_or_batch_size_change(self):
        cursor = self.plan(limit=10)['next_cursor']
        with self.assertRaisesRegex(ValueError,'Cursor does not match'):
            build_plan(self.overlay,self.seeds,'0'*40,limit=10,cursor=cursor)
        with self.assertRaisesRegex(ValueError,'Cursor does not match'):
            self.plan(limit=5,cursor=cursor)

    def test_unknown_website_is_a_gap_not_zero_or_approval(self):
        self.overlay.write_text(json.dumps({'startups':[{'name':'Known','website':'https://known.example/'},{'name':'Unknown'}]}))
        self.seeds.write_text('partner,official_website,approved\n')
        p = self.plan(limit=10)
        self.assertEqual(p['population']['seed_states']['missing_reviewed_website'],1)
        self.assertEqual(p['population']['seed_states']['seed_review_required'],1)
        self.assertTrue(all(x['approved_url'] is None for x in p['items']))

    def test_production_seed_allowlist_remains_exactly_pinned(self):
        pin=json.loads((HERE/'baseline-identities.json').read_text())['input_files']['data/company-profile-seeds.csv']
        before=hashlib.sha256((REPO/'data/company-profile-seeds.csv').read_bytes()).hexdigest()
        self.plan(limit=10)
        after=hashlib.sha256((REPO/'data/company-profile-seeds.csv').read_bytes()).hexdigest()
        self.assertEqual(before,pin)
        self.assertEqual(before,after)
        rows=list(csv.DictReader(io.StringIO(self.seeds.read_text())))
        self.assertTrue(all(not r['approved'] for r in rows))

if __name__ == '__main__':
    unittest.main()
