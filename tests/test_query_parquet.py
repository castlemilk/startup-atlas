"""Tests for the DuckDB query dataset generator (scripts/build-query-parquet.py).

Skips cleanly when pyarrow is not installed: the generator itself fails
loudly in that case, and CI installs pyarrow only for the main-branch build,
so the PR checks must not depend on it.
"""
import importlib.util
import json
import re
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PYARROW = importlib.util.find_spec('pyarrow') is not None


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, ROOT / path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@unittest.skipUnless(PYARROW, 'pyarrow is not installed')
class QueryParquetTests(unittest.TestCase):
    def test_generated_tables_match_the_published_json(self):
        generator = load('atlas_query_parquet', 'scripts/build-query-parquet.py')
        catalogue = json.loads((ROOT / 'data/catalogue.json').read_text(encoding='utf-8'))
        partners = json.loads((ROOT / 'data/partners-reviewed.json').read_text(encoding='utf-8'))
        startups = json.loads((ROOT / 'data/startup-research.json').read_text(encoding='utf-8'))['startups']
        with tempfile.TemporaryDirectory() as temp:
            out = Path(temp) / 'query'
            manifest = generator.build(out)
            self.assertEqual(manifest['version'], 1)
            self.assertRegex(manifest.get('source_revision', ''), r'^[0-9a-f]{40}$')
            expected_tables = {
                'opportunities': len(catalogue['opportunities']),
                'partners': len(partners),
                'partner_leads': len(catalogue['partnerLeads']),
                'startups': len(startups),
                'funding_rounds': sum(len(s.get('funding_rounds') or []) for s in startups),
                'articles': sum(len(s.get('articles') or []) for s in startups),
                'profile_facts': sum(len(s.get('profile_facts') or []) for s in startups),
                'founders': sum(len(s.get('founders') or []) for s in startups),
                'socials': sum(len(s.get('socials') or []) for s in startups),
            }
            self.assertEqual(set(manifest['tables']), set(expected_tables))
            import pyarrow.parquet as pq
            for name, rows in expected_tables.items():
                table = pq.read_table(out / f'{name}.parquet')
                self.assertEqual(table.num_rows, rows, name)
                self.assertEqual(
                    manifest['tables'][name]['columns'], table.column_names, name
                )
                self.assertEqual(manifest['tables'][name]['file'], f'{name}.parquet')
            written = json.loads((out / 'manifest.json').read_text(encoding='utf-8'))
            self.assertEqual(written, manifest)
            # The static build also writes the latest.json pointer the query
            # page follows first (same shape the live indexer writes).
            latest = json.loads((out / 'latest.json').read_text(encoding='utf-8'))
            self.assertEqual(latest['manifest'], 'manifest.json')
            self.assertRegex(latest['version'], r'^static-[0-9a-f]{12}$')
            self.assertEqual(latest['generated_at'], manifest['generated_at'])
            self.assertEqual(latest['source_revision'], manifest['source_revision'])
            self.assertEqual(
                latest['tables'],
                {name: info['rows'] for name, info in manifest['tables'].items()})

    def test_generator_rejects_unexpected_value_types(self):
        generator = load('atlas_query_parquet', 'scripts/build-query-parquet.py')
        with self.assertRaises(ValueError):
            generator._int(1.5)
        with self.assertRaises(ValueError):
            generator._str_list(['ok', 7])

    def test_generator_exits_without_pyarrow(self):
        # Run the script with an empty import path so pyarrow cannot be found.
        # The failure must be explicit, not a silent missing dataset.
        env = {'PATH': '/usr/bin:/bin', 'PYTHONNOUSERSITE': '1'}
        result = subprocess.run(
            [sys.executable, str(ROOT / 'scripts/build-query-parquet.py'),
             '--out', str(Path(tempfile.gettempdir()) / 'query-no-pyarrow')],
            capture_output=True, text=True, env=env, cwd=ROOT,
        )
        self.assertEqual(result.returncode, 2)
        self.assertIn('pyarrow', result.stderr)


if __name__ == '__main__':
    unittest.main()
