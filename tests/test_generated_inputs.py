"""Tests for the generated-input stamp/verify contract (#145 Q2).

The fixture trees are synthetic: the stamp module takes an explicit --root,
so each test builds the minimal closure layout in a temp directory and never
touches the real repository data.
"""

import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
_spec = importlib.util.spec_from_file_location(
    'generated_inputs', ROOT / 'scripts' / 'generated_inputs.py')
generated_inputs = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(generated_inputs)


def build_tree(root, revision='rev-1'):
    """Create the closure layout with small stand-in contents."""
    for rel in generated_inputs.GENERATOR_CODE + generated_inputs.DATA_FILES:
        target = root / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(f'contents of {rel}\n', encoding='utf-8')
    manifests = root / 'web' / 'assets' / 'manifests'
    manifests.mkdir(parents=True, exist_ok=True)
    (manifests / 'one.json').write_text('{"asset": 1}\n', encoding='utf-8')
    return root


class StampVerifyTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.root = build_tree(Path(self._tmp.name))
        self._env = dict(os.environ)
        os.environ['ATLAS_SOURCE_REVISION'] = 'rev-1'

    def tearDown(self):
        os.environ.clear()
        os.environ.update(self._env)
        self._tmp.cleanup()

    def stamp(self):
        self.assertEqual(generated_inputs.stamp(self.root), 0)

    def verify(self):
        return generated_inputs.verify(self.root)

    def test_roundtrip_verifies(self):
        self.stamp()
        self.assertEqual(self.verify(), 0)
        stamp_data = json.loads(
            (self.root / generated_inputs.STAMP_PATH).read_text())
        self.assertEqual(stamp_data['source_revision'], 'rev-1')
        # Every closure file is recorded, including the manifest glob.
        self.assertIn('web/assets/manifests/one.json', stamp_data['files'])
        self.assertIn('data/catalogue.json', stamp_data['files'])
        self.assertIn('backend/internal/graph/snapshot.json',
                      stamp_data['files'])

    def test_missing_stamp_fails(self):
        self.assertEqual(self.verify(), 1)

    def test_mutated_output_fails(self):
        self.stamp()
        (self.root / 'data/graph.json').write_text('tampered\n')
        self.assertEqual(self.verify(), 1)

    def test_mutated_source_is_stale(self):
        self.stamp()
        (self.root / 'data/partner-leads.json').write_text('edited\n')
        self.assertEqual(self.verify(), 1)

    def test_deleted_output_fails(self):
        self.stamp()
        (self.root / 'data/catalogue.json').unlink()
        self.assertEqual(self.verify(), 1)

    def test_new_manifest_after_generation_fails(self):
        self.stamp()
        extra = self.root / 'web' / 'assets' / 'manifests' / 'two.json'
        extra.write_text('{"asset": 2}\n')
        self.assertEqual(self.verify(), 1)

    def test_revision_change_fails(self):
        self.stamp()
        os.environ['ATLAS_SOURCE_REVISION'] = 'rev-2'
        self.assertEqual(self.verify(), 1)

    def test_cli_verify_exit_codes(self):
        script = ROOT / 'scripts' / 'generated_inputs.py'
        run = subprocess.run(
            [sys.executable, str(script), 'verify', '--root', str(self.root)],
            capture_output=True, text=True)
        self.assertEqual(run.returncode, 1)
        self.stamp()
        run = subprocess.run(
            [sys.executable, str(script), 'verify', '--root', str(self.root)],
            capture_output=True, text=True)
        self.assertEqual(run.returncode, 0, run.stderr)


if __name__ == '__main__':
    unittest.main()
