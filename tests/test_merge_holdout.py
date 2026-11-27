"""Tests for the #88 labelled merge holdout and its evaluation.

The holdout freezes the review queue's decided merge entries as
ground truth (approved = same entity, rejected = distinct). These
tests pin the holdout's shape and the one safety invariant the
matcher must never break on labelled data: a pair a human rejected
must never be auto-merged on replay.
"""

import importlib.util
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def _load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


build_mod = _load('build_merge_holdout', ROOT / 'scripts' / 'build_merge_holdout.py')
eval_mod = _load('evaluate_merge_holdout', ROOT / 'scripts' / 'evaluate_merge_holdout.py')

HOLDOUT = json.loads((ROOT / 'data' / 'merge-holdout.json').read_text())


class HoldoutShapeTests(unittest.TestCase):
    def test_cases_carry_both_labels(self):
        labels = {c['label'] for c in HOLDOUT['cases']}
        self.assertEqual(labels, {'same', 'distinct'})

    def test_holdout_is_large_enough_to_measure(self):
        self.assertGreaterEqual(len(HOLDOUT['cases']), 50)
        distinct = [c for c in HOLDOUT['cases'] if c['label'] == 'distinct']
        self.assertGreaterEqual(len(distinct), 10)

    def test_every_case_has_matcher_visible_sides(self):
        for case in HOLDOUT['cases']:
            for side in (case['subject'], case['candidate']):
                self.assertTrue(side['name'], case['queue_id'])
                self.assertIn(side['kind'], ('partner', 'startup', 'person', 'provider'))
                self.assertIn(side['name_source'],
                              ('identity-registry', 'subject-key-slug'))
            self.assertTrue(case['decided_by'], case['queue_id'])

    def test_committed_holdout_matches_builder_output(self):
        rebuilt = build_mod.build_holdout()
        self.assertEqual(rebuilt['cases'], HOLDOUT['cases'])


class HoldoutEvaluationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.metrics = eval_mod.evaluate(HOLDOUT)

    def test_no_false_auto_merges(self):
        # The safety invariant: a human-rejected pair must never be
        # auto-merged by the current matcher.
        self.assertEqual(self.metrics['false_merges'], 0)
        self.assertEqual(self.metrics['distinct_containment'], 1.0)

    def test_every_same_pair_reaches_the_review_band(self):
        self.assertEqual(self.metrics['same_recall'], 1.0)

    def test_band_precision_is_measured_and_reported(self):
        # Not a quality gate — a record that the metric exists and is
        # sane. The measured value lives in docs/MERGE-HOLDOUT.md.
        self.assertIsNotNone(self.metrics['band_precision'])
        self.assertGreater(self.metrics['band_precision'], 0.5)
        self.assertLessEqual(self.metrics['band_precision'], 1.0)


if __name__ == '__main__':
    unittest.main()
