#!/usr/bin/env python3
"""Exercise merged planner #177 against staged input without changing seed approvals."""
import json
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[4]
sys.path.insert(0, str(REPO / 'scripts'))
from plan_company_profiles import build_plan
from crawl import CrawlError

REVISION = json.loads((HERE / 'manifest.json').read_text())['baseline']['revision']
STAGED = HERE / 'records.json'
# A header-only offline fixture approves nothing. The production CSV is untouched.
SEEDS = HERE / 'staged-unapproved-seeds.csv'

class ResumeTests(unittest.TestCase):
    def test_production_seed_manifest_is_not_silently_reused_for_an_incomplete_overlay(self):
        with self.assertRaisesRegex(CrawlError, 'Invalid approved row'):
            build_plan(STAGED, REPO / 'data/company-profile-seeds.csv', REVISION, limit=7)

    def test_bounded_pages_exhaust_only_the_25_record_staged_input(self):
        names, cursor, pages = [], None, []
        while True:
            result = build_plan(STAGED, SEEDS, REVISION, limit=7, cursor=cursor)
            pages.append(result)
            names.extend(x['source_record_name'] for x in result['items'])
            self.assertLessEqual(result['returned'], 7)
            self.assertEqual(result['population']['source_records'], 25)
            self.assertEqual(result['population']['seed_states']['approved_seed_ready'], 0)
            self.assertTrue(all(x['collection_state'] == 'not_assessed' for x in result['items']))
            cursor = result['next_cursor']
            if cursor is None: break
        expected = sorted(x['name'] for x in json.loads(STAGED.read_text())['startups'])
        self.assertEqual(names, expected)
        self.assertEqual(len(set(names)), 25)
        self.assertEqual([p['returned'] for p in pages], [7, 7, 7, 4])
        self.assertTrue(pages[-1]['inventory_exhausted'])

    def test_resume_and_replay_are_deterministic(self):
        first = build_plan(STAGED, SEEDS, REVISION, limit=7)
        second = build_plan(STAGED, SEEDS, REVISION, limit=7, cursor=first['next_cursor'])
        replay = build_plan(STAGED, SEEDS, REVISION, limit=7, cursor=first['next_cursor'])
        self.assertEqual(second, replay)
        self.assertFalse(set(x['source_record_name'] for x in first['items']) & set(x['source_record_name'] for x in second['items']))

    def test_stale_cursor_rejects_changed_bytes_revision_limit_and_seed_file(self):
        cursor = build_plan(STAGED, SEEDS, REVISION, limit=7)['next_cursor']
        with tempfile.TemporaryDirectory(prefix='atlas-uk-resume-') as directory:
            root = Path(directory)
            changed = root / 'records.json'; changed.write_bytes(STAGED.read_bytes() + b'\n')
            changed_seeds = root / 'seeds.csv'; changed_seeds.write_bytes(SEEDS.read_bytes() + b'\n')
            cases = [(changed, SEEDS, REVISION, 7), (STAGED, changed_seeds, REVISION, 7), (STAGED, SEEDS, '0' * 40, 7), (STAGED, SEEDS, REVISION, 8)]
            for overlay, seeds, revision, limit in cases:
                with self.subTest(overlay=overlay.name, seeds=seeds.name, revision=revision, limit=limit):
                    with self.assertRaisesRegex(ValueError, 'Cursor does not match'):
                        build_plan(overlay, seeds, revision, limit=limit, cursor=cursor)

    def test_duplicate_identity_and_invalid_boundary_are_rejected(self):
        first = build_plan(STAGED, SEEDS, REVISION, limit=7)
        bad_cursor = first['next_cursor'].rsplit(':', 1)[0] + ':1'
        with self.assertRaisesRegex(ValueError, 'boundary'):
            build_plan(STAGED, SEEDS, REVISION, limit=7, cursor=bad_cursor)
        with tempfile.TemporaryDirectory(prefix='atlas-uk-duplicates-') as directory:
            data = json.loads(STAGED.read_text()); data['startups'].append(data['startups'][0])
            duplicate = Path(directory) / 'records.json'; duplicate.write_text(json.dumps(data))
            with self.assertRaisesRegex(ValueError, 'Duplicate source-record names'):
                build_plan(duplicate, SEEDS, REVISION, limit=7)

if __name__ == '__main__': unittest.main(verbosity=2)
