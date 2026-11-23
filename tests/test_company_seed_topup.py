"""A saved issuer's incremental seed funding is not its cumulative total."""

import unittest

from scripts.company_metadata_funding import classify, saved_results
from scripts.stage_early_investments import name_key


# Reviewer reconstruction of the saved August 2025 issuer article. Its old
# URL now redirects; keep the original source identity rather than attributing
# this wording to the company’s later-accessible social announcement.
SOURCE = 'https://www.cuttable.com/blog/the-worlds-first-ai-creative-agency'
TOPUP = (
    'Cuttable secured an additional A$4.5 million in funding, on top of its original A$5.5 million '
    'raised 12 months ago, bringing its total seed raise to AUD$10 million. '
    'This round was led by Square Peg, supported by Rampersand and Previously Unavailable.'
)
NAMES = {name_key('Cuttable')}


class SavedSeedTopupTests(unittest.TestCase):
    def test_review_cue_only_for_incremental_raise(self):
        self.assertEqual(classify(TOPUP, NAMES), ('early_round_lead', ['round_mention', 'early_stage_mention']))
        capture = {'url': SOURCE, 'excerpt': TOPUP, 'retrieved_on': '2026-11-23', 'acquisition': 'reviewer_paraphrase'}
        document, = saved_results([capture], 'www.cuttable.com', NAMES)
        self.assertTrue(document['review_required'])
        self.assertTrue(document['on_issuer_host'])
        observation, = document['observations']
        self.assertEqual(observation, {**capture, 'bucket': 'early_round_lead',
                                       'signals': ['round_mention', 'early_stage_mention']})

    def test_ignore_wrong_entity_proposals_grants_totals_and_corrections(self):
        for name, sample in (
            ('total-only', "Cuttable's total seed raise stands at AU$10M."),
            ('negated', TOPUP.replace('secured', 'has not secured', 1)),
            ('proposal', TOPUP.replace('secured', 'plans to secure', 1)),
            ('wrong issuer', TOPUP.replace('Cuttable', 'Cuttable Agency', 1)),
            ('wrong amount type', TOPUP.replace('in funding', 'in grant funding', 1)),
            ('no increment', TOPUP.replace('A$4.5 million', 'A$0 million', 1)),
            ('incompatible arithmetic', TOPUP.replace('AUD$10 million', 'AUD$14 million')),
            ('mixed currency', TOPUP.replace('AUD$10 million', 'US$10 million')),
            ('quoted', f'"{TOPUP}"'),
            ('correction', TOPUP + ' Correction: the additional capital had not closed.'),
            ('question', TOPUP[:-1] + '?'),
            ('conditional', TOPUP.replace('supported by', 'subject to approval by')),
            ('missing confirmation', TOPUP.split(' This round')[0]),
            ('conditional named lender', TOPUP.replace('Square Peg', 'Pending Approval')),
            ('unrelated prefix', 'A proposal described these next steps. ' + TOPUP),
        ):
            with self.subTest(label=name):
                self.assertNotIn('round_mention', classify(sample, NAMES)[1])
        self.assertNotIn('round_mention', classify(TOPUP, NAMES, search_result=True)[1])

    def test_explicit_seed_and_aggregate_behavior_is_preserved(self):
        self.assertEqual(classify('Cuttable closed an AUD$4.5 million seed round.', NAMES),
                         ('early_round_lead', ['round_mention', 'early_stage_mention']))
        self.assertEqual(classify("Cuttable's total seed raise stands at AU$10M.", NAMES), ('unmatched', []))
