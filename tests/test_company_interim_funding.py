"""A saved issuer sentence can preserve a financing lead without inferring stage."""

import unittest

from scripts.company_metadata_funding import classify, saved_results
from scripts.stage_early_investments import name_key


class CompanyInterimFundingTests(unittest.TestCase):
    def test_pi_exchange_interim_close_is_round_lead_not_series_a(self):
        # Reconstructed from the issuer's bylined iTWire report, 25 August 2021.
        url = ('https://itwire.com/it-industry-news/deals/'
               'pi-exchange-primed-to-democratise-ai-after-%242-million-pre-series-a-funding-round')
        names = {name_key('PI.EXCHANGE')}
        wording = ('PI. Exchange has closed an interim round of US$2 million with participation '
                   'from investors including Boab AI, Artesian, Nextrans and Vision Creator.')
        self.assertEqual(classify(wording, names), ('round_lead', ['round_mention']))
        capture = {'url': url, 'acquisition': 'reviewer_paraphrase', 'excerpt': wording,
                   'retrieved_on': '2026-11-23', 'dates': {'published': '2021-08-25'}}
        document, = saved_results([capture], 'mentana.ai', names)
        self.assertTrue(document['review_required'])
        observation, = document['observations']
        self.assertEqual(observation, {
            **capture, 'bucket': 'round_lead', 'signals': ['round_mention'],
            'dates': {'published': {'value': '2021-08-25', 'precision': 'day'}},
        })
        for other in (
            wording.replace('has closed', 'plans to close'),
            wording.replace('has closed', 'has not closed'),
            wording.replace('PI. Exchange', 'PI. Exchange Foundation'),
            wording.replace('interim round', 'round of talks'),
            wording.replace('including Boab', 'including If Approved Boab'),
            wording[:-1] + '?',
            f'"{wording}"',
            f'{wording} Correction: the company had not closed the round.',
        ):
            with self.subTest(other=other):
                self.assertNotIn('round_mention', classify(other, names)[1])
        self.assertNotIn('round_mention', classify(wording, names, search_result=True)[1])
        self.assertEqual(classify('PI.EXCHANGE closed an AUD$2 million seed round.', names),
                         ('early_round_lead', ['round_mention', 'early_stage_mention']))
