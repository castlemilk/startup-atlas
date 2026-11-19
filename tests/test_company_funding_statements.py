"""Offline coverage for financing language in saved source reviews."""

import unittest

from scripts.company_metadata_funding import classify, saved_results
from scripts.stage_early_investments import name_key


ARKEUS = 'https://arkeus.com/news/arkeus-new-funding-2023-december'
AIRWALLEX = (
    'https://www.airwallex.com/global/newsroom/'
    'airwallex-raises-usd300-million-at-a-usd6-2-billion-valuation-to-build-the-future-of-global-banking'
)
QUASAR_CSIRO = 'https://www.csiro.au/en/news/all/news/2023/february/partner-quasar-dih-funding'
QUASAR_ISSUER = (
    'https://newswire.telecomramblings.com/2023/12/'
    'csiro-spin-out-quasars-world-first-space-domain-awareness-launch-to-revolutionise-space-industry/'
)
QUASAR = 'Quasar Satellite Technologies'

# These sentences preserve relevant wording and scope from the source reviews.
# The full verbatim paragraphs were not retained in the offline review packets.
SOURCE_CASES = (
    ('arkeus-apposition', 'Arkeus', ARKEUS,
     'Arkeus, an Australian startup, today announced it has raised A$4.45 million in seed funding '
     'led by Main Sequence, with participation from Salus Ventures and Steve Baxter, whom the issuer '
     'describes as from Beaten Zone Venture Partners.',
     'early_round_lead', ('early_stage_mention',)),
    ('arkeus-direct', 'Arkeus', ARKEUS,
     'Arkeus announced AUD 4.45 million in seed funding. Main Sequence led the round.',
     'early_round_lead', ('early_stage_mention',)),
    ('airwallex-valuation', 'Airwallex', AIRWALLEX,
     'Airwallex raises USD300 million in a Series F funding round at a USD6.2 billion valuation. '
     'The round includes US$150 million in secondary share transfers.',
     'mixed_financing_lead', ('valuation', 'debt_or_secondary')),
    ('airwallex-direct', 'Airwallex', AIRWALLEX,
     'Airwallex announced a Series F financing round.',
     'round_lead', ('round_mention',)),
    ('airwallex-secondary', 'Airwallex', AIRWALLEX,
     'Airwallex reported US$150 million in secondary share transfers as part of the Series F.',
     'context', ('debt_or_secondary',)),
    ('quasar-award', QUASAR, QUASAR_CSIRO,
     'Quasar Satellite Technologies received $8.6 million in a seed round plus $1.9 million '
     'awarded by the NSW Physical Sciences Fund.',
     'mixed_financing_lead', ('early_stage_mention', 'grant_or_public_support')),
    ('quasar-direct', QUASAR, QUASAR_CSIRO,
     'Quasar Satellite Technologies reported $8.6 million in seed funding.',
     'early_round_lead', ('early_stage_mention',)),
    ('quasar-conflicting-amount', QUASAR, QUASAR_ISSUER,
     'Quasar Satellite Technologies launched in 2021 with AU$8.7 million in seed funding. '
     'The release also describes a separate NSW grant and a hub contract.',
     'mixed_financing_lead', ('early_stage_mention', 'grant_or_public_support', 'commercial_contract')),
    ('arkeus-commonwealth-grant', 'Arkeus',
     'https://arkeus.com/news/2-46-million-igp-grant-to-accelerate-arkeus-sovereign-manufacturing',
     'Arkeus received an A$2.46 million Commonwealth grant for a project valued at A$5.5 million.',
     'context', ('grant_or_public_support',)),
)

GUARD_CASES = (
    ('seed-grant', 'Ready Company was awarded a seed funding grant.', 'context'),
    ('renamed-grant', 'Ready Company announced seed funding, a government grant.', 'context'),
    ('grant-package', 'Ready Company received a $5 million package including a seed funding grant '
     'plus a separate government award.', 'context'),
    ('product-series', 'Ready Company announced its Series A product line.', 'unmatched'),
    ('actual-series', 'Ready Company announced its Series A.', 'round_lead'),
    ('joint-release-other-issuer', 'Ready Company partnered with Another Corp, which raised seed funding.', 'unmatched'),
    ('apposition-other-issuer',
     'Ready Company and Another Corp, an equipment maker, announced the latter has raised seed funding.', 'unmatched'),
    ('parenthesized-other-issuer',
     'Another Corp (a supplier to Ready Company) today announced it has raised seed funding.', 'unmatched'),
    ('investment-target', 'Ready Company received a seed investment in Another Corp.', 'context'),
    ('other-series-at-valuation',
     "Ready Company announced Another Corp's Series A at a $16 million valuation.", 'context'),
    ('ambiguous-valuation-scope',
     'Ready Company reported seed funding at a $6 million valuation for Another Corp.', 'context'),
    ('prospective-announcement',
     'Ready Company today announced it expects to raise seed funding.', 'context'),
    ('secondary-only',
     'Ready Company announced its Series A secondary share sale.', 'context'),
    ('award-purpose',
     'Ready Company received an award from the NSW Physical Sciences Fund for a seed funding round.', 'context'),
    ('round-with-grouped-amount',
     'Ready Company, an independent startup, announced it has raised USD5,000,000 in a Series A '
     'at a $30 million valuation.', 'mixed_financing_lead'),
    ('round-with-month', 'Ready Company received seed funding in March.', 'early_round_lead'),
    ('separate-grant', 'Ready Company raised seed funding and separately received a grant.', 'mixed_financing_lead'),
)


class CompanyFundingStatementTests(unittest.TestCase):
    def test_source_attributed_wording_and_scope(self):
        for case, name, _, excerpt, expected, required_signals in SOURCE_CASES:
            with self.subTest(case=case):
                bucket, signals = classify(excerpt, [name_key(name)])
                self.assertEqual(bucket, expected)
                self.assertTrue(set(required_signals).issubset(signals), signals)
                if bucket == 'context':
                    self.assertNotIn('round_mention', signals)

    def test_financing_scope_guards(self):
        for case, excerpt, expected in GUARD_CASES:
            with self.subTest(case=case):
                bucket, signals = classify(excerpt, ['ready company'])
                self.assertEqual(bucket, expected)
                if bucket in ('context', 'unmatched'):
                    self.assertNotIn('round_mention', signals)

    def test_saved_replay_preserves_contradictory_amounts_and_date_scope(self):
        selected = {case[0]: case for case in SOURCE_CASES}
        captures = []
        for case, date in (('quasar-award', '2023-02-20'), ('quasar-conflicting-amount', '2023-12-06')):
            _, _, url, excerpt, _, _ = selected[case]
            captures.append({'url': url, 'excerpt': excerpt, 'acquisition': 'reviewer_paraphrase',
                             'retrieved_on': '2026-11-19', 'dates': {'published': date}})
        results = saved_results(captures, 'qsat.au', [name_key(QUASAR)])
        self.assertEqual(len(results), 2)
        for result in results:
            self.assertTrue(result['review_required'])
            self.assertEqual(result['bucket'], 'mixed_financing_lead')
            original = next(capture for capture in captures if capture['url'] == result['url'])
            self.assertEqual(len(result['observations']), 1)
            observation = result['observations'][0]
            self.assertEqual(observation['excerpt'], original['excerpt'])
            self.assertEqual(observation['acquisition'], 'reviewer_paraphrase')
            self.assertEqual(observation['dates'], {
                'published': {'value': original['dates']['published'], 'precision': 'day'},
            })
            self.assertNotIn('amount', observation)
