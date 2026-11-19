"""Offline coverage for financing language in saved source reviews."""

import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from scripts.company_metadata_funding import classify, prepare_funding_review, saved_results
from scripts.plan_company_profiles import digest
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
CULTURE_AMP_ISSUER = (
    'https://www.cultureamp.com/company/announcements/culture-amp-raises-82-million-dollars-in-global-funding'
)
CULTURE_AMP_WIRE = (
    'https://www.nasdaq.com/press-release/'
    'culture-amp-raises-%2482m-usd-in-global-funding-to-double-down-on-its-leadership'
)
# Reconstructions preserve the dateline, coordinated apposition and currency placement.
CULTURE_AMP_OPENING = (
    '[Sep 4, 2019 - Melbourne] Culture Amp, the People & Culture Platform, '
    'announced today it has raised USD$82 million in a Series E funding round.'
)
CULTURE_AMP_WIRE_OPENING = (
    'SAN FRANCISCO--(BUSINESS WIRE)-- Culture Amp, the People & Culture Platform, '
    'announced today it has raised $82 million USD in its Series E funding round.'
)
CULTURE_AMP_DIRECT = 'Culture Amp announced today it has raised USD$82 million in a Series E round of funding.'
CULTURE_AMP_SERIES_D = 'https://www.cultureamp.com/blog/series-d-funding-announcement'
# Opening sentence of the issuer's reviewed Series D release.
CULTURE_AMP_FIRST_PERSON = (
    'It is with this success that I am proud to announce our latest US $40M Series D funding round.'
)
CHIPS_MAY = (
    'https://www.nist.gov/news-events/news/2026/05/'
    'department-commerce-announces-letters-intent-9-companies-2-billion'
)
CHIPS_SEPTEMBER = (
    'https://www.nist.gov/news-events/news/2026/09/'
    'department-commerce-announces-finalization-chips-rd-award-psiquantum'
)
DIRAQ_CHIPS = (
    'https://www.diraq.com/newsdesk/diraq-signs-38m-letter-of-intent-with-the-us-department-of-commerce-'
    'under-chips-act-to-scale-domestic-quantum-computing-processors-using-silicon-spin-technology'
)
DIRAQ_DARPA = (
    'https://www.diraq.com/newsdesk/diraq-advances-to-final-stage-of-darpas-quantum-benchmarking-initiativenbsp'
)
SYNTHESIA_ADOBE = 'https://www.synthesia.io/post/100-million-revenue-adobe-investment'
SYNTHESIA_HEADLINE = (
    'Synthesia surpasses $100 million in annual recurring revenue and secures strategic investment from Adobe Ventures'
)
SYNTHESIA_OPENING = (
    'LONDON, UNITED KINGDOM, April 15, 2025 — Synthesia, a platform for enterprise video, '
    'announced that it has reached more than $100 million in ARR and received strategic investment from Adobe Ventures.'
)
SYNTHESIA_STRATEGIC = 'Synthesia secured a strategic investment from Adobe Ventures.'
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

# These reconstructions preserve the issuer's attribution and the three source structures.
DIRAQ_HEADLINE = 'Diraq signs $38M letter of intent with the U.S. Department of Commerce under the CHIPS Act.'
DIRAQ_OPENING = (
    'Palo Alto, Calif. — Diraq, an industry pioneer, today announced that it has signed a letter '
    'of intent (LOI) with the U.S. Department of Commerce for up to US$38M in proposed federal '
    'funding from the CHIPS Research and Development Office.'
)
DIRAQ_HISTORICAL = (
    'Diraq has also secured a letter of intent for $38M from the U.S. Department of Commerce '
    'under the CHIPS and Science Act to support U.S. production of its quantum processors.'
)
DARPA_SELECTION = "Diraq announced selection for Stage C of DARPA's Quantum Benchmarking Initiative."

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
    @staticmethod
    def first_person_review(captures, *, cited=CULTURE_AMP_SERIES_D, other_companies=(), other_rounds=()):
        company = {
            'name': 'Culture Amp', 'website': 'https://www.cultureamp.com/',
            'funding_rounds': [{'id': 'culture-amp-2018-series-d', 'stage': 'Series D', 'source': cited},
                               *other_rounds],
        }
        revision, plan_id = 'a' * 40, 'issuer-release-test'
        overlay = json.dumps({'startups': [company, *other_companies]}).encode()
        report = {
            'version': 1, 'revision': revision, 'plan_id': plan_id,
            'input_hashes': {'overlay_sha256': digest(overlay)},
            'queue': [{'name': company['name'], 'fields': {
                'identity': 'published', 'rounds': 'published', 'early_financing': 'unsearched',
            }}],
        }
        request = {'version': 1, 'revision': revision, 'plan_id': plan_id,
                   'companies': [{'name': company['name'], 'captures': captures}]}
        with TemporaryDirectory() as temp:
            folder = Path(temp)
            (folder / 'overlay.json').write_bytes(overlay)
            (folder / 'manifest.json').write_text(json.dumps(request))
            result = prepare_funding_review(report, folder / 'overlay.json', folder / 'manifest.json', {})
        return result['companies'][0]

    def test_first_person_round_uses_exact_reviewed_page_and_deduplicates(self):
        capture = {'url': CULTURE_AMP_SERIES_D, 'excerpt': CULTURE_AMP_FIRST_PERSON,
                   'retrieved_on': '2026-11-19', 'acquisition': 'page_excerpt'}
        self.assertEqual(classify(capture['excerpt'], {'culture amp'}), ('unmatched', []))
        report = self.first_person_review([capture, capture])
        self.assertEqual(report['repeated_url_hits'], 1)
        document, = report['results']
        self.assertTrue(document['review_required'])
        self.assertEqual(document['observations'], [{
            **capture, 'bucket': 'round_lead', 'signals': ['round_mention'],
        }])

        for change, provenance in (
            ({'url': CULTURE_AMP_SERIES_D + '#reply'}, {}),
            ({'url': 'https://www.cultureamp.com/blog'}, {}),
            ({'url': 'https://www.cultureamp.com/'}, {'cited': 'https://www.cultureamp.com/'}),
            ({'url': 'https://participant.example/company'}, {'cited': 'https://participant.example/company'}),
            ({'acquisition': 'reviewer_paraphrase'}, {}),
            ({'acquisition': 'search_result'}, {}),
            ({}, {'other_companies': [{'name': 'Other company', 'website': 'https://cultureamp.com/another'}]}),
            ({}, {'other_rounds': [{'id': 'other-round', 'stage': 'Series E', 'source': CULTURE_AMP_SERIES_D + '#e'}]}),
            ({}, {'other_companies': [{
                'name': 'Other company', 'website': 'https://other.example/',
                'funding_rounds': [{'stage': 'Series D', 'source': CULTURE_AMP_SERIES_D}],
            }]}),
        ):
            with self.subTest(change=change, provenance=provenance):
                result, = self.first_person_review([{**capture, **change}], **provenance)['results']
                self.assertEqual(result['bucket'], 'unmatched')

    def test_bound_first_person_round_requires_asserted_scope(self):
        lead = ('round_lead', ['round_mention'])
        excluded = ('unmatched', [])
        denial = ('context', ['prospective_or_negated'])
        opening = CULTURE_AMP_FIRST_PERSON
        cases = (
            (opening, lead),
            (opening + ' The legal close date was not disclosed.', lead),
            (opening + ' Another Corp did not raise the Series D funding.', lead),
            (opening + ' Culture Amp did not raise the Series E funding.',
             ('mixed_financing_lead', ['round_mention', 'prospective_or_negated'])),
            (opening[:-1] + ', but Culture Amp did not raise the Series D funding.', denial),
            (opening + ' Culture Amp did not raise the Series D funding.', denial),
            (opening + ' Culture Amp has not actually raised the funding.', denial),
            (opening.replace('I am proud', 'I am not proud'), excluded),
            (opening.replace('latest', 'planned'), excluded),
            (opening.replace('announce', 'discuss'), excluded),
            (opening.replace('Series D', 'Series E'), excluded),
            (opening.replace('funding round', 'product line'), excluded),
            (opening.replace('round.', 'round for Another Corp.'), excluded),
            (opening[:-1] + '?', excluded),
            (f'“{opening}”', excluded),
            (f'Another Corp’s founder said, “{opening}”', excluded),
            ('We are proud to announce our Series D funding', excluded),
        )
        for excerpt, expected in cases:
            with self.subTest(excerpt=excerpt):
                self.assertEqual(classify(excerpt, {'culture amp'}, reviewed_round=('culture amp', 'series d')),
                                 expected)

    def test_named_issuer_round_announced_today(self):
        for excerpt in (
            CULTURE_AMP_OPENING,
            CULTURE_AMP_WIRE_OPENING,
            CULTURE_AMP_DIRECT,
            CULTURE_AMP_DIRECT.replace('today it', 'today that it'),
            CULTURE_AMP_DIRECT.replace('today it', 'that it'),
            CULTURE_AMP_DIRECT.replace('announced today', 'today announced'),
            f'{CULTURE_AMP_WIRE_OPENING} The company started in Melbourne.',
        ):
            with self.subTest(excerpt=excerpt):
                self.assertEqual(classify(excerpt, ['culture amp']), ('round_lead', ['round_mention']))

        with_award = f'{CULTURE_AMP_DIRECT} The government separately awarded Culture Amp a grant.'
        self.assertEqual(classify(with_award, ['culture amp']),
                         ('mixed_financing_lead', ['round_mention', 'grant_or_public_support']))

    def test_announced_today_requires_affirmative_opening_and_exact_recipient(self):
        for excerpt in (
            f'{CULTURE_AMP_DIRECT[:-1]}?',
            f'{CULTURE_AMP_WIRE_OPENING[:-1]}？',
            CULTURE_AMP_DIRECT[:-1],
            f'{CULTURE_AMP_DIRECT[:-1]} and separately received an update?',
            f'“{CULTURE_AMP_DIRECT}”',
            f"'{CULTURE_AMP_DIRECT}",
            f'A speaker said, "{CULTURE_AMP_DIRECT}"',
            f'“Here is a rumour. {CULTURE_AMP_DIRECT} Further details are unclear.”',
            CULTURE_AMP_DIRECT.replace('today it', 'today “it') + '”',
            CULTURE_AMP_DIRECT.replace('has raised', 'has not raised'),
            CULTURE_AMP_DIRECT.replace('has raised', 'plans to raise'),
            f'{CULTURE_AMP_DIRECT[:-1]} only if diligence is completed.',
            f'{CULTURE_AMP_DIRECT[:-1]}... if diligence is completed.',
            CULTURE_AMP_DIRECT.replace('today it', 'today Another Corp'),
            CULTURE_AMP_DIRECT.replace('Culture Amp', 'Culture Amp and Another Corp'),
            CULTURE_AMP_DIRECT.replace('Culture Amp', 'Another Corp, a platform for Culture Amp,'),
            CULTURE_AMP_DIRECT.replace('Culture Amp', 'Culture Amp, the Data & Acme Platform,'),
            'Culture Amp announced today it has raised US$82 million, and Another Corp closed its Series E.',
            f'{CULTURE_AMP_DIRECT[:-1]} for Another Corp.',
            CULTURE_AMP_DIRECT.replace('round of funding.', 'product line.'),
            CULTURE_AMP_DIRECT.replace('in a Series E round of funding', 'to date, including its Series E'),
            CULTURE_AMP_DIRECT.replace('round of funding.', 'secondary share sale.'),
        ):
            with self.subTest(excerpt=excerpt):
                bucket, signals = classify(excerpt, ['culture amp'])
                self.assertIn(bucket, ('unmatched', 'context'))
                self.assertNotIn('round_mention', signals)

        borrowed_descriptor = CULTURE_AMP_WIRE_OPENING.replace('Culture Amp', 'Another Corp')
        self.assertEqual(classify(borrowed_descriptor, ['another corp']), ('unmatched', []))

    def test_announced_today_checks_the_next_statement_for_a_round_correction(self):
        round_lead = ('round_lead', ['round_mention'])
        negated = ('context', ['prospective_or_negated'])
        mixed = ('mixed_financing_lead', ['round_mention', 'prospective_or_negated'])
        same_round_denial = 'Culture Amp did not raise the Series E funding.'
        funding_denial = 'Culture Amp has not actually raised the funding.'
        cases = (
            (same_round_denial, negated),
            (funding_denial, negated),
            ('The legal close date was not disclosed.', round_lead),
            ('Acme did not raise Series E funding.', round_lead),
            ('Acme has not actually raised the funding.', round_lead),
            ('Culture Amp did not raise the Series D funding.', mixed),
            (f'{same_round_denial[:-1]} for Acme.', mixed),
            (f'{same_round_denial[:-1]}?', mixed),
            (f'“{same_round_denial}”', mixed),
            (f'A separate transaction is under review. {funding_denial}', round_lead),
            (f'{same_round_denial} Culture Amp closed its Series D.', mixed),
        )
        for following, expected in cases:
            with self.subTest(following=following):
                self.assertEqual(classify(f'{CULTURE_AMP_DIRECT} {following}', ['culture amp']), expected)
        self.assertEqual(classify(f'{CULTURE_AMP_WIRE_OPENING} {same_round_denial}', ['culture amp']), negated)

    def test_announced_today_saved_captures_keep_source_wording_and_publication_dates(self):
        captures = [
            {'url': url, 'excerpt': excerpt, 'acquisition': 'reviewer_paraphrase', 'retrieved_on': '2026-11-19',
             'dates': {'published': published}}
            for url, excerpt, published in (
                (CULTURE_AMP_ISSUER, CULTURE_AMP_OPENING, '2020-09-04'),
                (CULTURE_AMP_WIRE, CULTURE_AMP_WIRE_OPENING, '2019-09-03'),
            )
        ]
        results = saved_results(captures + captures[::-1], 'cultureamp.com', ['culture amp'])
        self.assertEqual(len(results), 2)
        for result, capture in zip(results, captures):
            with self.subTest(url=result['url']):
                published = {'value': capture['dates']['published'], 'precision': 'day'}
                self.assertEqual(result['url'], capture['url'])
                self.assertTrue(result['review_required'])
                self.assertEqual(result['bucket'], 'round_lead')
                self.assertEqual(result['observations'], [{
                    **capture, 'dates': {'published': published}, 'bucket': 'round_lead', 'signals': ['round_mention'],
                }])

    def test_synthesia_revenue_and_strategic_investment_are_distinct_review_cues(self):
        cases = (
            (SYNTHESIA_HEADLINE, ['annual_recurring_revenue', 'strategic_investment', 'backing_context']),
            (SYNTHESIA_OPENING, ['annual_recurring_revenue', 'strategic_investment']),
            (SYNTHESIA_STRATEGIC, ['strategic_investment', 'backing_context']),
            (f'{SYNTHESIA_STRATEGIC[:-1]} Ltd.', ['strategic_investment', 'backing_context']),
            ('Synthesia reached over $100 million in annual recurring revenue.', ['annual_recurring_revenue']),
            (f"{SYNTHESIA_OPENING} The statement also refers to Synthesia's January 2025 Series D.",
             ['annual_recurring_revenue', 'strategic_investment']),
        )
        for excerpt, expected in cases:
            with self.subTest(excerpt=excerpt):
                self.assertEqual(classify(excerpt, ['synthesia']), ('context', expected))
        series_e = 'Synthesia completed a $200 million Series E funding round at a $4 billion valuation.'
        self.assertEqual(classify(series_e, ['synthesia']), ('mixed_financing_lead', ['round_mention', 'valuation']))
        independent_round = 'Synthesia completed a Series D in January 2025.'
        self.assertEqual(classify(independent_round, ['synthesia']), ('round_lead', ['round_mention']))
        self.assertEqual(classify(f'{independent_round} {SYNTHESIA_STRATEGIC}', ['synthesia']),
                         ('mixed_financing_lead', ['round_mention', 'strategic_investment']))

    def test_issuer_financial_cues_require_assertion_and_exact_recipient(self):
        cases = (
            ('Synthesia announced a strategic partnership with Adobe Ventures.', ('unmatched', [])),
            ('Synthesia signed a commercial contract with Adobe Ventures.', ('context', ['commercial_contract'])),
            ('Synthesia made a strategic investment in Another Corp.', ('context', ['backing_context'])),
            (SYNTHESIA_OPENING.replace('Synthesia, a platform for enterprise video',
                                       'Another Corp, a platform for Synthesia'), ('unmatched', [])),
            (f'{SYNTHESIA_STRATEGIC[:-1]} for Another Corp.', ('context', ['backing_context'])),
            (f'“{SYNTHESIA_STRATEGIC[:-1]}?”', ('context', ['backing_context'])),
            (f'{SYNTHESIA_OPENING[:-1]}?', ('unmatched', [])),
            (f'{SYNTHESIA_OPENING[:-1]}？', ('unmatched', [])),
            (f'{SYNTHESIA_OPENING[:-1]} Inc. before any closing?', ('unmatched', [])),
            (f'{SYNTHESIA_STRATEGIC[:-1]} Ltd. if diligence is completed.', ('context', ['backing_context'])),
            (f'{SYNTHESIA_STRATEGIC[:-1]}... subject to approval.', ('context', ['backing_context'])),
            ('Synthesia Today announced it has received a strategic investment from Adobe Ventures.',
             ('context', ['backing_context'])),
            ('Synthesia expects to secure a strategic investment from Adobe Ventures.', ('context', ['backing_context'])),
            ('Synthesia never received a strategic investment from Adobe Ventures.', ('context', ['backing_context'])),
            ('Synthesia expects to reach $100 million in ARR.', ('unmatched', [])),
            ('Synthesia received strategic investment from its vendor.', ('context', ['backing_context'])),
            ('Synthesia Secures Strategic Investment From Adobe Ventures For Another Corp.',
             ('context', ['backing_context'])),
            ('Synthesia Secures Strategic Investment From Adobe Ventures On Behalf Of Another Corp.',
             ('context', ['backing_context'])),
            ('Synthesia Secures Strategic Investment From Adobe Ventures Pending Approval.',
             ('context', ['backing_context'])),
            ('Synthesia Secures Strategic Investment From Its Vendor.', ('context', ['backing_context'])),
        )
        for excerpt, expected in cases:
            with self.subTest(excerpt=excerpt):
                self.assertEqual(classify(excerpt, ['synthesia']), expected)

    def test_synthesia_saved_excerpt_and_paraphrase_keep_publication_provenance(self):
        captures = [
            {'url': SYNTHESIA_ADOBE, 'excerpt': excerpt, 'acquisition': kind,
             'retrieved_on': '2026-11-19', 'dates': {'published': '2025-04-15'}}
            for excerpt, kind in ((SYNTHESIA_HEADLINE, 'page_excerpt'), (SYNTHESIA_OPENING, 'reviewer_paraphrase'))
        ]
        document, = saved_results(captures + captures[::-1], 'www.synthesia.io', ['synthesia'])
        self.assertTrue(document['review_required'])
        self.assertTrue(document['on_issuer_host'])
        self.assertEqual(document['bucket'], 'context')
        self.assertCountEqual(document['observations'], [
            {**capture, 'bucket': 'context', 'signals': signals,
             'dates': {'published': {'value': '2025-04-15', 'precision': 'day'}}}
            for capture, signals in zip(captures, (
                ['annual_recurring_revenue', 'strategic_investment', 'backing_context'],
                ['annual_recurring_revenue', 'strategic_investment'],
            ))
        ])

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

    def test_chips_issuer_letter_requires_affirmative_recipient_and_agency(self):
        context = ('context', ['grant_or_public_support', 'public_support_letter_of_intent'])
        for excerpt in (
            DIRAQ_HEADLINE, DIRAQ_OPENING, DIRAQ_OPENING.replace('U.S. Department', 'U.S.  Department'),
            f'{DARPA_SELECTION} {DIRAQ_HISTORICAL}',
        ):
            with self.subTest(positive=excerpt):
                self.assertEqual(classify(excerpt, ['diraq']), context)
        for excerpt in (
            DARPA_SELECTION,
            DIRAQ_HISTORICAL.replace('U.S. Department of Commerce under the CHIPS and Science Act',
                                     'DARPA under its Quantum Benchmarking Initiative') + ' CHIPS is mentioned elsewhere.',
            DIRAQ_OPENING.replace('has signed', 'has not signed'),
            DIRAQ_OPENING.replace('has signed', 'expects to sign'),
            DIRAQ_OPENING.replace('Diraq, an industry pioneer', 'Another Corp, a Diraq partner'),
            DIRAQ_OPENING.replace('Diraq, an industry pioneer', 'Another Corp, the Diraq industry pioneer'),
            f'{DIRAQ_HEADLINE[:-1]} on behalf of Another Corp.',
            f'“{DIRAQ_HEADLINE[:-1]}?”',
            f'{DIRAQ_OPENING[:-1]}?',
            f'{DIRAQ_OPENING[:-1]}？',
            f'{DARPA_SELECTION} {DIRAQ_HISTORICAL[:-1]}?',
            f'{DIRAQ_HEADLINE[:-1]} and separately received an update?',
            'Diraq received a $38M payment from the U.S. Department of Commerce under the CHIPS Act.',
        ):
            with self.subTest(negative=excerpt):
                self.assertEqual(classify(excerpt, ['diraq']), ('unmatched', []))
        private = 'Diraq completed its US$38 million Series D.'
        self.assertEqual(classify(private, ['diraq']), ('round_lead', ['round_mention']))
        self.assertEqual(classify(f'{private} {DIRAQ_OPENING}', ['diraq']),
                         ('mixed_financing_lead', ['round_mention', *context[1]]))

    def test_chips_issuer_letters_keep_corroboration_as_undated_source_observations(self):
        captures = [
            {'url': url, 'excerpt': excerpt, 'acquisition': 'reviewer_paraphrase', 'retrieved_on': '2026-11-19'}
            for url, excerpt in ((DIRAQ_CHIPS, DIRAQ_HEADLINE), (DIRAQ_CHIPS, DIRAQ_OPENING),
                                 (DIRAQ_DARPA, f'{DARPA_SELECTION} {DIRAQ_HISTORICAL}'))
        ]
        results = saved_results(captures + captures[::-1], 'www.diraq.com', ['diraq'])
        self.assertEqual(len(results), 2)
        observed = {result['url']: result for result in results}
        for url in (DIRAQ_CHIPS, DIRAQ_DARPA):
            with self.subTest(source=url):
                self.assertTrue(observed[url]['review_required'])
                self.assertTrue(observed[url]['on_issuer_host'])
                self.assertEqual(observed[url]['bucket'], 'context')
                self.assertCountEqual(observed[url]['observations'], [
                    {**capture, 'bucket': 'context',
                     'signals': ['grant_or_public_support', 'public_support_letter_of_intent']}
                    for capture in captures if capture['url'] == url
                ])

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
