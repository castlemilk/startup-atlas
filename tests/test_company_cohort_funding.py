"""Offline regression checks for cohort capital attribution."""

import unittest

from scripts.company_metadata_funding import classify, saved_results
from scripts.stage_early_investments import name_key


class CompanyCohortFundingTests(unittest.TestCase):
    def test_launchvic_cohort_capital_is_context_not_round(self):
        # Reconstruction of two adjacent LaunchVic paragraphs (16 Feb 2021).
        # https://launchvic.org/funding-news/backing-victoria-as-a-leading-ai-technology-destination/
        roster = ("Boab’s first round of scaleups include Victorian companies Pi.Exchange, "
                  "Plaetos and Strongroom AI and fellow Australian outfits Daitum and Remi AI.")
        terms = ("Each participating company will receive a minimum of $300,000 in capital "
                 "as part of a tailored six-month program addressing specific company challenges.")
        excerpt = f'{roster} {terms}'
        for company in ('PI.EXCHANGE', 'Strongroom AI', 'Daitum', 'Remi AI'):
            self.assertEqual(classify(excerpt, {name_key(company)}),
                             ('context', ['programme_capital_commitment']))
        names = {name_key('PI.EXCHANGE')}
        url = ('https://launchvic.org/funding-news/'
               'backing-victoria-as-a-leading-ai-technology-destination/')
        capture = {'url': url, 'excerpt': excerpt, 'acquisition': 'reviewer_paraphrase',
                   'retrieved_on': '2026-11-23', 'dates': {'published': '2021-02-16'}}
        self.assertEqual(saved_results([capture, capture], 'mentana.ai', names), [{
            'url': url, 'on_issuer_host': False, 'bucket': 'context', 'review_required': True,
            'observations': [{
                **capture, 'bucket': 'context', 'signals': ['programme_capital_commitment'],
                'dates': {'published': {'value': '2021-02-16', 'precision': 'day'}},
            }],
        }])
        self.assertEqual(classify(excerpt, names, search_result=True), ('unmatched', []))
        self.assertEqual(classify(excerpt, {name_key('Exchange')}), ('unmatched', []))
        misleading = [
            f'A proposal for {roster} {terms}',
            f'Draft {roster} {terms}',
            f'The accelerator {roster} {terms}',
            f'{roster} {terms.replace("Each participating company", "The accelerator")}',
            f'{roster.replace("Pi.Exchange,", "Pi.Exchange Foundation,")} {terms}',
            f'{roster} The programme was announced yesterday. {terms}',
            f'{roster} Each company is eligible for up to $5 million in future rounds.',
            f'{roster} A total of $1.5 million was committed across the cohort.',
            f'{roster} {terms.replace("will receive", "may receive")}',
            f'{roster} {terms.replace("a tailored", "a proposed, if approved,")}',
            f'{roster.replace("Pi.Exchange,", "Pi.Exchange, which withdrew,")} {terms}',
            f'{roster.replace("Pi.Exchange,", "Pi.Exchange as mentor,")} {terms}',
        ]
        for sample in misleading:
            with self.subTest(sample=sample):
                self.assertNotIn('programme_capital_commitment', classify(sample, names)[1])
        self.assertEqual(classify('PI.EXCHANGE closed an AUD$2 million seed round.', names),
                         ('early_round_lead', ['round_mention', 'early_stage_mention']))
