import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import index_country_research as index


class CountryIndexTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / 'countries'
        self.root.mkdir()
        self.seeds = Path(self.temp.name) / 'seeds.csv'
        self.seeds.write_text('partner,official_website,approved\nExample,https://example.com/,yes\n')
        self.revision = 'a' * 40
        self.write('GB/companies.json', {'companies': [{'name': 'Example', 'website': 'https://example.com/',
                   'status': 'context_only_hold', 'source_urls': ['https://example.com/news'], 'founded_year': None}]})
        self.write('PL/companies.json', {'companies': [{'canonical_name': 'Example', 'website': 'https://www.example.com/',
                   'status': 'reviewed_staged'}]})

    def write(self, path, value):
        path = self.root / path
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(value))

    def build(self, **kwargs):
        return index.build_index(self.root, self.seeds, self.revision, **kwargs)

    def test_preserves_holds_unknowns_and_source_identity(self):
        result = self.build()
        self.assertEqual(result['counts']['source_record_occurrences'], 2)
        first = result['items'][0]
        self.assertEqual(first['record']['status'], 'context_only_hold')
        self.assertIsNone(first['record']['founded_year'])
        self.assertEqual(first['provenance']['pointer'], '/companies/0')
        self.assertEqual(first['seed_match'], 'exact_name_and_url_candidate')
        self.assertEqual(first['crawl_state'], 'not_scheduled')
        self.assertEqual(len(self.build(section='collisions')['items']), 1)
        self.assertEqual(self.build(section='collisions')['items'][0]['decision'], 'identity_review_required_no_merge')
        self.assertEqual(result['counts']['production_admissions'], 0)

    def test_pagination_and_query(self):
        first = self.build(limit=1)
        second = self.build(limit=1, cursor=first['next_cursor'])
        self.assertIsNone(second['next_cursor'])
        self.assertNotEqual(first['items'], second['items'])
        self.assertEqual(self.build(query='context_only_hold')['counts']['matching_occurrences'], 1)
        self.assertEqual(first['index_id'], self.build(limit=1)['index_id'])

    def test_stale_cursor_rejected_on_any_document_change(self):
        cursor = self.build(limit=1)['next_cursor']
        (self.root / 'README.md').write_text('New review hold')
        with self.assertRaises(ValueError):
            self.build(limit=1, cursor=cursor)

    def test_cursor_binds_seed_revision_and_query(self):
        cursor = self.build(limit=1)['next_cursor']
        for kwargs in ({'query': 'Example'}, {'limit': 2}, {'section': 'sources'}):
            with self.assertRaises(ValueError):
                self.build(cursor=cursor, **kwargs)
        self.revision = 'b' * 40
        with self.assertRaises(ValueError):
            self.build(limit=1, cursor=cursor)
        self.revision = 'a' * 40
        self.seeds.write_text(self.seeds.read_text() + 'Other,https://other.example/,yes\n')
        with self.assertRaises(ValueError):
            self.build(limit=1, cursor=cursor)

    def test_refuses_duplicate_json_keys_and_nonfinite_values(self):
        for raw in ('{"name":"A","name":"B"}', '{"x":NaN}', '{"x":1e309}'):
            (self.root / 'bad.json').write_text(raw)
            with self.assertRaises(ValueError):
                self.build()

    def test_refuses_symlink(self):
        (self.root / 'linked').symlink_to(self.seeds)
        with self.assertRaises(ValueError):
            self.build()

    def test_source_url_is_not_approval(self):
        result = self.build()
        self.assertTrue(all(s['access_state'] == 'not_assessed' for s in self.build(section='sources')['items']))
        self.assertEqual(result['items'][1]['seed_match'], 'no_exact_approved_seed_match')

    def test_rejects_invalid_revision_bounds_and_cursor(self):
        for kwargs in ({'limit': 0}, {'limit': True}, {'query': 'a' * 257}, {'cursor': 'bad'}):
            with self.assertRaises(ValueError):
                self.build(**kwargs)
        self.revision = 'main'
        with self.assertRaises(ValueError):
            self.build()

    def test_escapes_json_pointer_and_retains_unusual_fields(self):
        self.write('PL/companies.json', {'a/b~': {'name': 'Other', 'website': 'http://bad.example/', 'custom': [1, 2]}})
        item = self.build()['items'][1]
        self.assertEqual(item['provenance']['pointer'], '/a~1b~0')
        self.assertIsNone(item['host'])
        self.assertEqual(item['record']['custom'], [1, 2])

    def test_identity_tuple_cannot_collide(self):
        self.write('a.json', {'b.json#': {'name': 'A', 'website': 'https://a.example/'}})
        self.write('a.json#/b.json', {'name': 'B', 'website': 'https://b.example/'})
        keys = [item['source_record_key'] for item in self.build()['items']]
        self.assertEqual(len(keys), len(set(keys)))

    def test_resource_bounds_fail_closed(self):
        for constant in ('MAX_FILES', 'MAX_TOTAL_BYTES', 'MAX_NODES', 'MAX_OUTPUT_BYTES'):
            with patch.object(index, constant, 1), self.assertRaises(ValueError):
                self.build()
        deep = None
        for _ in range(66):
            deep = [deep]
        self.write('deep.json', deep)
        with self.assertRaises(ValueError):
            self.build()

    def test_all_sections_are_independently_paginated(self):
        for section in ('records', 'sources', 'documents', 'collisions'):
            whole = self.build(section=section)['items']
            page = self.build(section=section, limit=1)
            items = page['items'][:]
            while page['next_cursor']:
                page = self.build(section=section, limit=1, cursor=page['next_cursor'])
                items.extend(page['items'])
            self.assertEqual(items, whole)
            self.assertNotIn('source_url_occurrences', page)
            self.assertNotIn('documents', page)
        with self.assertRaises(ValueError):
            self.build(section='unknown')

    def test_files_not_mutated(self):
        before = {p: p.read_bytes() for p in self.root.rglob('*') if p.is_file()}
        self.build()
        self.assertEqual(before, {p: p.read_bytes() for p in before})


if __name__ == '__main__':
    unittest.main()
