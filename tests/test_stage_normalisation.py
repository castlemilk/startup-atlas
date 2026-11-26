"""Guard: a round whose raw ``stage`` states a recognisable stage must
never sit at ``stage_normalised == 'Unknown'`` in the committed data.

The 2026-11-26 richness audit found 29 of 98 rounds at Unknown even
though the sources stated the stage verbatim ("Accelerator" cohort
deals, issuer-announced "Pre-Series A", a "strategic growth
financing"). Those spellings joined the controlled vocabulary in
``scripts/backfill_structured_fields.py``. "Secondary" joined on the
same basis later that day (Wise's source-stated secondary rounds). This test keeps them from
silently regressing: every committed round's ``stage_normalised`` must
equal what the normaliser derives from its raw ``stage``, and any raw
spelling that still maps to Unknown must be one of the known
stage-less spellings below — a new spelling landing at Unknown fails
here and forces a conscious vocabulary decision instead of silent
data loss.

Stdlib only, so it runs everywhere (tests/test_graph_kg.py pins the
same normaliser but imports pyarrow at module level).
"""
import importlib.util
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, ROOT / path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


backfill = load('atlas_backfill_stage_guard',
                'scripts/backfill_structured_fields.py')

# Raw stage spellings that genuinely carry no stage information: the
# source never stated one, or stated that it was not disclosed. These
# may sit at Unknown; nothing else may.
STAGE_LESS_SPELLINGS = {
    'Funding round',
    'Funding round (stage not stated)',
    'Funding round (stage undisclosed)',
}


def all_rounds():
    research = json.loads(
        (ROOT / 'data/startup-research.json').read_text(encoding='utf-8'))
    for startup in research['startups']:
        for round_ in startup.get('funding_rounds', []):
            yield startup['name'], round_


class NormaliserSpellingTests(unittest.TestCase):
    def test_source_stated_stages_normalise_to_themselves(self):
        self.assertEqual(backfill.normalise_stage('Accelerator'), 'Accelerator')
        self.assertEqual(backfill.normalise_stage('Pre-Series A'), 'Pre-Series A')
        self.assertEqual(
            backfill.normalise_stage('Strategic growth financing'), 'Growth')
        self.assertEqual(backfill.normalise_stage('Secondary'), 'Secondary')

    def test_stage_less_spellings_stay_unknown(self):
        for spelling in STAGE_LESS_SPELLINGS:
            self.assertEqual(backfill.normalise_stage(spelling), 'Unknown',
                             spelling)


class CommittedDataStageGuardTests(unittest.TestCase):
    def test_every_round_matches_the_normaliser(self):
        mismatches = [
            f"{name}: stage={r.get('stage')!r} recorded "
            f"{r.get('stage_normalised')!r}, normaliser derives "
            f"{backfill.normalise_stage(r.get('stage'))!r}"
            for name, r in all_rounds()
            if r.get('stage_normalised')
            != backfill.normalise_stage(r.get('stage'))
        ]
        self.assertEqual(mismatches, [])

    def test_no_recognisable_stage_sits_at_unknown(self):
        offenders = [
            f"{name}: stage={r.get('stage')!r}"
            for name, r in all_rounds()
            if r.get('stage_normalised') == 'Unknown'
            and (r.get('stage') or '') not in STAGE_LESS_SPELLINGS
        ]
        self.assertEqual(offenders, [])


if __name__ == '__main__':
    unittest.main()
