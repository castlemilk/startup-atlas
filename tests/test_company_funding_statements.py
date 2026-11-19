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
EASYCEP_ISSUER = (
    'https://easycep.com/blog/easycep-turkiye-nin-ilk-yenilenmis-elektronik-urun-'
    'pazaryeri-olarak-9-milyon-liralik-tohum-yatirimini-aldi-49'
)
EASYCEP_ESG = (
    'https://s3.eu-central-1.amazonaws.com/cdn.easycep.com/fileserver/Reports/'
    'EasyCep_ESG_Report_Final_2023_compressed.pdf'
)
CHIPS_MAY = (
    'https://www.nist.gov/news-events/news/2026/05/'
    'department-commerce-announces-letters-intent-9-companies-2-billion'
)
CHIPS_SEPTEMBER = (
    'https://www.nist.gov/news-events/news/2026/09/'
    'department-commerce-announces-finalization-chips-rd-award-psiquantum'
)
# Short source-based reconstructions place the cohort frame beside its recipient rows.
CHIPS_COHORT = 'The Department of Commerce signed letters of intent under the CHIPS and Science Act.'
DIRAQ_PLANNED = 'Diraq will receive up to $38 million in planned funding.'
PSIQUANTUM_PLANNED = 'PsiQuantum will receive $100 million in planned funding.'
PSIQUANTUM_SIGNED = (
    'Commerce announced today the signing of a final award of up to $100 million to PsiQuantum '
    'under the CHIPS and Science Act.'
)
# Source-based reconstruction of the September release with its dateline.
PSIQUANTUM_DATELINE = (
    'WASHINGTON, D.C. — The U.S. Department of Commerce announced the signing of a final award of up to '
    '$100 million to PsiQuantum under the CHIPS and Science Act.'
)
PSIQUANTUM_RESEARCH = 'The supported research concerns photonic components and semiconductor manufacturing.'

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
    # The release review supplied these structures. Product detail is abbreviated.
    ('arkeus-developing-apposition', 'Arkeus', ARKEUS,
     'Arkeus, a company developing equipment and software for use on crewed and remotely operated '
     'aircraft, today announced it has raised A$4.45 million in seed funding.',
     'early_round_lead', ('early_stage_mention',)),
    ('airwallex-dateline-and-valuation', 'Airwallex', AIRWALLEX,
     'SAN FRANCISCO — Airwallex, a leading global payments and financial platform for modern '
     'businesses, has completed a US$300 million Series F funding round at a US$6.2 billion valuation. '
     'The round includes US$150 million in secondary share transfers.',
     'mixed_financing_lead', ('valuation', 'debt_or_secondary')),
    ('quasar-awarded-from', QUASAR, QUASAR_CSIRO,
     'Quasar Satellite Technologies received $8.6 million in a seed round plus $1.9 million '
     'awarded from the NSW Physical Sciences Fund.',
     'mixed_financing_lead', ('early_stage_mention', 'grant_or_public_support')),
    # English reconstructions for the replay. The issuer announcement is in Turkish;
    # the English ESG timeline (p. 8) supplies month-level timing.
    ('easycep-investment-month', 'EasyCep', EASYCEP_ISSUER,
     'EasyCep received a 9 million TL seed investment in April 2021.',
     'early_round_lead', ('early_stage_mention',)),
    ('easycep-date-first-control', 'EasyCep', EASYCEP_ESG,
     'In April 2021, EasyCep received seed funding.',
     'early_round_lead', ('early_stage_mention',)),
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
    ('outbound-investment', 'Ready Company made a seed investment in Another Corp.', 'context'),
    ('outbound-investment-with-month', 'Ready Company made a seed investment in April 2021.', 'context'),
    ('unspecified-beneficiary', 'Ready Company announced a seed investment in April 2021.', 'context'),
    ('investment-purpose', 'Ready Company received a seed investment in a regional expansion programme.', 'context'),
    ('investment-purpose-after-month',
     'Ready Company received a seed investment in April 2021 to back Another Corp.', 'context'),
    ('investment-target-with-month',
     'Ready Company received a seed investment in Another Corp in April 2021.', 'context'),
    ('month-looking-investee', 'Ready Company received a seed investment in April 2021 Labs.', 'context'),
    ('unqualified-month', 'Ready Company received a seed investment in April.', 'context'),
    ('year-only', 'Ready Company received a seed investment in 2021.', 'context'),
    ('two-digit-year', 'Ready Company received a seed investment in April 21.', 'context'),
    ('incomplete-timing', 'Ready Company received a seed investment in.', 'context'),
    ('investment-question', 'Ready Company received a seed investment in April 2021?', 'context'),
    ('forecast-receipt', 'Ready Company plans to raise a seed investment in April 2021.', 'context'),
    ('unqualified-tl', 'Ready Company received TL seed investment in April 2021.', 'context'),
    ('received-with-month', 'Ready Company received a seed investment in April 2021.', 'early_round_lead'),
    ('received-with-tl', 'Ready Company received a 9 million TL seed investment.', 'early_round_lead'),
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
    ('incidental-company-in-description',
     'Another Corp, a company developing specialist equipment and software for clients including '
     'Ready Company, today announced it has raised seed funding.', 'unmatched'),
    ('grant-with-description',
     'Ready Company, a company developing equipment for aircraft, today announced it has received '
     'a government grant for its $5.5 million project.', 'context'),
    ('secondary-with-platform-description',
     'SAN FRANCISCO — Ready Company, a leading financial platform for modern businesses, '
     'has completed its Series F secondary share sale.', 'context'),
    ('intent-with-platform-description',
     'SAN FRANCISCO — Ready Company, a leading financial platform for modern businesses, '
     'today announced it plans to raise seed funding.', 'context'),
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

    def test_easycep_reconstruction_remains_review_evidence(self):
        cases = [case for case in SOURCE_CASES if case[1] == 'EasyCep']
        captures = [
            {'url': url, 'excerpt': excerpt, 'acquisition': 'reviewer_paraphrase', 'retrieved_on': '2026-11-19'}
            for _, _, url, excerpt, _, _ in cases
        ]
        results = saved_results(captures, 'easycep.com', ['easycep'])
        self.assertEqual(len(results), 2)
        for result in results:
            with self.subTest(url=result['url']):
                self.assertTrue(result['review_required'])
                source = next(capture for capture in captures if capture['url'] == result['url'])
                self.assertEqual(result['observations'], [{
                    **source, 'bucket': 'early_round_lead', 'signals': ['round_mention', 'early_stage_mention'],
                }])

    def test_chips_review_cues_require_recipient_and_programme_context(self):
        cohorts = f'{CHIPS_COHORT} {DIRAQ_PLANNED} {PSIQUANTUM_PLANNED}'
        cases = (
            ('diraq', cohorts, 'public_support_letter_of_intent'),
            ('psiquantum', cohorts, 'public_support_letter_of_intent'),
            ('psiquantum', PSIQUANTUM_SIGNED, 'public_support_signed_award'),
            ('diraq', f'{CHIPS_COHORT} {PSIQUANTUM_PLANNED} Diraq is listed elsewhere.', None),
            ('diraq', f'{PSIQUANTUM_SIGNED} Diraq was in the May cohort.', None),
            ('diraq', f'{CHIPS_COHORT} Diraq and PsiQuantum will receive $100 million in planned funding.', None),
            ('diraq', DIRAQ_PLANNED, None),
            ('diraq', f'{CHIPS_COHORT} A new unrelated subject follows. {DIRAQ_PLANNED}', None),
            ('diraq', f'{DIRAQ_PLANNED} {CHIPS_COHORT}', None),
            ('psiquantum', PSIQUANTUM_SIGNED.replace('announced today', 'expects to announce'), None),
            ('psiquantum', 'Commerce disbursed $100 million to PsiQuantum under the CHIPS and Science Act.', None),
        )
        for name, excerpt, cue in cases:
            with self.subTest(name=name, excerpt=excerpt):
                expected = ('context', ['grant_or_public_support', cue]) if cue else ('unmatched', [])
                self.assertEqual(classify(excerpt, [name]), expected)

    def test_chips_signing_and_independent_private_round_remain_distinct(self):
        private_round = 'PsiQuantum completed a Series D.'
        self.assertEqual(classify(private_round, ['psiquantum']), ('round_lead', ['round_mention']))
        self.assertEqual(classify(f'{private_round} {PSIQUANTUM_SIGNED}', ['psiquantum']), (
            'mixed_financing_lead', ['round_mention', 'grant_or_public_support', 'public_support_signed_award'],
        ))

    def test_chips_signing_with_dateline_requires_asserted_statement(self):
        self.assertEqual(classify(f'{PSIQUANTUM_DATELINE} {PSIQUANTUM_RESEARCH}', ['psiquantum']), (
            'context', ['grant_or_public_support', 'public_support_signed_award'],
        ))
        question = f'{PSIQUANTUM_DATELINE[:-1]}?'
        for excerpt in (
            f'{question} {PSIQUANTUM_RESEARCH}',
            f'“{question}”',
            f'{PSIQUANTUM_DATELINE[:-1]} and separately received an update?',
        ):
            with self.subTest(excerpt=excerpt):
                self.assertEqual(classify(excerpt, ['psiquantum']), ('unmatched', []))

    def test_chips_cohort_requires_asserted_and_contiguous_recipient_statements(self):
        frame_question = f'{CHIPS_COHORT[:-1]}?'
        recipient_question = f'{DIRAQ_PLANNED[:-1]}?'
        cases = (
            ('diraq', f'{frame_question} {DIRAQ_PLANNED}'),
            ('diraq', f'“{frame_question}” {DIRAQ_PLANNED}'),
            ('diraq', f'{CHIPS_COHORT} {recipient_question}'),
            ('diraq', f'{CHIPS_COHORT} “{recipient_question}”'),
            ('psiquantum', f'{CHIPS_COHORT} {recipient_question} {PSIQUANTUM_PLANNED}'),
            # The May release contains intervening portfolio prose before the recipient lines.
            ('diraq', f'{CHIPS_COHORT} These funds will support a portfolio of quantum companies. {DIRAQ_PLANNED}'),
        )
        for company, excerpt in cases:
            with self.subTest(company=company, excerpt=excerpt):
                self.assertEqual(classify(excerpt, [company]), ('unmatched', []))

    def test_chips_captures_keep_source_caps_and_publication_dates_separate(self):
        sources = (
            (CHIPS_MAY, f'{CHIPS_COHORT} {DIRAQ_PLANNED} {PSIQUANTUM_PLANNED}', '2026-05-21',
             'public_support_letter_of_intent'),
            (CHIPS_SEPTEMBER, f'{PSIQUANTUM_DATELINE} {PSIQUANTUM_RESEARCH}', '2026-09-08',
             'public_support_signed_award'),
        )
        captures = [
            {'url': url, 'excerpt': excerpt, 'dates': {'published': published},
             'acquisition': 'reviewer_paraphrase', 'retrieved_on': '2026-11-19'}
            for url, excerpt, published, _ in sources
        ]
        results = saved_results(captures + captures[::-1], 'psiquantum.com', ['psiquantum'])
        self.assertEqual(len(results), 2)
        observed = {result['url']: result for result in results}
        for url, excerpt, published, cue in sources:
            with self.subTest(source=url):
                result = observed[url]
                self.assertTrue(result['review_required'])
                self.assertEqual(result['bucket'], 'context')
                self.assertEqual(result['observations'], [{
                    'url': url, 'excerpt': excerpt, 'acquisition': 'reviewer_paraphrase', 'retrieved_on': '2026-11-19',
                    'dates': {'published': {'value': published, 'precision': 'day'}},
                    'bucket': 'context', 'signals': ['grant_or_public_support', cue],
                }])
