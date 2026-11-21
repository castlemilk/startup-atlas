"""Offline coverage for financing language in saved source reviews."""

import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from scripts.company_metadata_funding import REVIEWED_ISSUER_ARTICLES, classify, prepare_funding_review, saved_results
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
SEED_WIRE_CITATION = 'https://www.businesswire.com/news/home/20990101000001/en/Example-Release'
SEED_WIRE_OPENING = (
    'MELBOURNE, Australia--(BUSINESS WIRE)--Ready Company, a venture-backed engineering startup, '
    'today announced closing a USD$3.2 million seed investment co-led by the Northstar founders’ '
    'and Example Capital investment consortium.'
)
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
CULTURE_AMP_SERIES_A = (
    'https://www.prnewswire.com/news-releases/culture-amp-secures-63-million-in-series-a-funding-'
    'to-grow-culture-first-companies-300044471.html'
)
# Reconstructions preserve the issuer wire's dateline, customer list and transaction clause.
CULTURE_AMP_CUSTOMERS = (
    ', which counts Acme, Northstar, New Harbor, Kestrel, Alpine and Silver Oak '
    'among the companies using its platform,'
)
CULTURE_AMP_SERIES_A_OPENING = (
    'SAN FRANCISCO, March 4, 2015 /PRNewswire/ --\N{NO-BREAK SPACE}People Analytics company Culture Amp'
    f'{CULTURE_AMP_CUSTOMERS} today announced that it has closed $6.3 million in Series A funding.'
)
CULTURE_AMP_SERIES_A_HEADLINE = 'Culture Amp Secures $6.3 Million In Series A Funding To Grow Culture-First Companies'
CULTURE_AMP_SERIES_B = (
    'https://www.prnewswire.com/news-releases/people-analytics-platform-snags-10-million-in-series-b-funding-'
    'led-by-index-ventures-300231274.html'
)
# Reconstruction preserves the issuer wire's dateline, apposition and closed-round wording.
CULTURE_AMP_REPORTED_CLOSE = (
    'SAN FRANCISCO, March 7, 2016 /PRNewswire/ --\N{NO-BREAK SPACE}Culture Amp, '
    'the people analytics company for workplace feedback, announced today that it has closed '
    'a $10 million Series B round.'
)
CULTURE_AMP_STARTUP_DAILY = (
    'https://www.startupdaily.net/other/'
    'facebook-acquires-masquerade-wework-raises-430-million-16-billion-valuation-plantminer-raises-3-5-million/'
)
# Startup Daily's subject and transaction wording with synthetic investor names.
CULTURE_AMP_NOMINAL_CLOSE = (
    'Melbourne employee engagement startup Culture Amp has announced the closing of a US$10 million Series B round, '
    'led by existing investors Alder Ventures with participation from Birch Capital and Cedar Ventures.'
)
RELATIVE_WIRE_DATELINE = 'BOSTON, May 9, 2017 /PRNewswire/ --\N{NO-BREAK SPACE}HR Tech World:\N{NO-BREAK SPACE}'
RELATIVE_WIRE_ASSERTION = (
    'Ready Company announced yesterday that it has raised a Series C round of $21 Million led by Alder Ventures.'
)
RELATIVE_WIRE_REPORT = RELATIVE_WIRE_DATELINE + RELATIVE_WIRE_ASSERTION
CULTURE_AMP_SERIES_D = 'https://www.cultureamp.com/blog/series-d-funding-announcement'
# Opening sentence of the issuer's reviewed Series D release.
CULTURE_AMP_FIRST_PERSON = (
    'It is with this success that I am proud to announce our latest US $40M Series D funding round.'
)
CULTURE_AMP_LINKED_ARTICLE = (
    'https://www.cultureamp.com/blog/culture-amp-raises-20-million-in-series-c-funding'
)
CULTURE_AMP_SERIES_C_WIRE = (
    'https://www.prnewswire.com/news-releases/'
    'culture-amp-announces-new-funding-to-empower-companies-everywhere-to-put-culture-first-300474440.html'
)
# The issuer statement's structure with synthetic location and investor text.
LINKED_ARTICLE_OPENING = (
    'Yesterday at an industry meeting, Culture Amp shared the news that we have raised a Series C round '
    'of $20 million led by Alder Ventures.'
)
LINKED_ARTICLE_CONTINUATION = (
    'Our previous investors offered their support.',
    'A board appointment was announced.',
    'The announcement concluded the session.',
)
# Reconstruction preserves the descriptor, completion verb, numbered stage and trailing amount.
DIRAQ_A2_COMPLETION = (
    'Diraq, a research company in optical measurements, today announced the successful completion '
    'of a Series A-2 capital raise of USD $15 million.'
)
DIRAQ_A2_EXPANSION = (
    'Diraq expanded its existing Series A-2 investment round to US$22 million, including the initial close.'
)
STAGE_FIRST_EXTENSION = (
    'Ready Company announced its Series A-2 had expanded to US$22 million, including the February close.'
)
# Reconstructions retain the issuer and investor statements' financing syntax.
ISSUER_EXTENSION = (
    'Ready Company, the Australian technology company developing new manufacturing tools, '
    'has closed a US$4.3 million extension to its Series A financing, bringing total Series A funding '
    'to more than US$14 million.'
)
INVESTOR_EXTENSION = (
    'Harbour-based Ready Company has secured US$2 million (approximately A$2.8 million) '
    'from the regional government fund as part of a US$4.3 million extension to its Series A financing, '
    'bringing its total Series A funding to more than US$14 million.'
)
NUMBERED_EXTENSION_DISCLOSURE = (
    'BOSTON, Jan 31, 2023 – Ready Company, a provider of planning software, today announced its Series B-1 '
    'fundraise of $12.5 million USD, with participation from Cedar Ventures. This Series B extension brings '
    'Ready Company’s total Series B raise to over $30 million USD, the largest among workflow software companies, '
    'according to Market data.'
)
INLINE_EXTENSION_DISCLOSURE = (
    'Boston, USA – October 8, 2024 – Ready Company, the leading provider of planning software, today announced '
    'the successful expansion of its Series B Funding Round to USD $40M (AUD $59M), with USD $9M of new capital.'
)
INVESTOR_UPDATE_DISCLOSURE = (
    'BOSTON, MASSACHUSETTS, July 25, 2023 – Ready Company, a global leader in developing workflow tools '
    'through cloud software, today announced the addition of Cedar Ventures as a new investor in their '
    'record-setting Series B funding round, which has raised $50 million USD.'
)
EXISTING_ROUND_DISCLOSURE = (
    'Ready Company announced the addition of Cedar Ventures as a new investor in its existing Series B funding round.'
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
    def first_person_review(captures, *, cited=CULTURE_AMP_SERIES_D, other_companies=(), other_rounds=(), company=None):
        if company is None:
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

    def diraq_completion_review(self, captures, *, opening=DIRAQ_A2_COMPLETION, event_changes=None, other_companies=()):
        article = REVIEWED_ISSUER_ARTICLES['Diraq']
        event = {'id': article['round_id'], 'source': article['round_source'], 'stage': article['stage'],
                 **article['round_terms'], **(event_changes or {})}
        company = {'name': 'Diraq', 'website': 'https://www.diraq.com/', 'funding_rounds': [event]}
        capture = {'url': article['url'], 'excerpt': opening, 'acquisition': 'page_excerpt',
                   'retrieved_on': '2026-11-20'}
        attestation = {**article, 'opening_sha256': digest(opening.encode())}
        with patch.dict(REVIEWED_ISSUER_ARTICLES, {'Diraq': attestation}):
            return self.first_person_review([{**capture, **item} for item in captures], company=company,
                                            other_companies=other_companies)

    def test_numbered_completion_requires_the_exact_saved_issuer_page_and_cited_round(self):
        article = REVIEWED_ISSUER_ARTICLES['Diraq']
        report = self.diraq_completion_review([{}, {}])
        document, = report['results']
        self.assertTrue(document['on_issuer_host'])
        self.assertTrue(document['review_required'])
        self.assertEqual(report['prior_rounds'], 'published')
        self.assertEqual(document['observations'], [{
            'url': article['url'], 'excerpt': DIRAQ_A2_COMPLETION, 'acquisition': 'page_excerpt',
            'retrieved_on': '2026-11-20', 'bucket': 'round_lead', 'signals': ['round_mention'],
        }])
        self.assertNotIn('round_mention', classify(DIRAQ_A2_COMPLETION, {'diraq'})[1])
        for capture, record in (
            ({'url': article['url'] + '#summary'}, {}),
            ({'url': article['url'] + '?from=search'}, {}),
            ({'url': article['url'].replace('www.diraq.com', 'diraq.com')}, {}),
            ({'url': article['round_source']}, {}),
            ({'acquisition': 'reviewer_paraphrase'}, {}),
            ({'acquisition': 'search_result'}, {}),
            ({'excerpt': DIRAQ_A2_COMPLETION.replace('today', 'yesterday')}, {}),
            ({}, {'id': 'diraq-earlier-round'}),
            ({}, {'stage': 'Series A'}),
            ({}, {'currency': 'AUD'}),
            ({}, {'amount': 22000000}),
            ({}, {'source': article['round_source'] + '#copy'}),
        ):
            with self.subTest(capture=capture, record=record):
                result, = self.diraq_completion_review([capture], event_changes=record)['results']
                self.assertNotIn('round_mention', result['observations'][0]['signals'])
        competitor = {'name': 'Acme', 'website': 'https://acme.example/',
                      'funding_rounds': [{'id': 'other-a2', 'source': article['round_source']}]}
        result, = self.diraq_completion_review([{}], other_companies=[competitor])['results']
        self.assertNotIn('round_mention', result['observations'][0]['signals'])

    def test_numbered_completion_requires_an_asserted_named_round_and_literal_amount(self):
        opening = DIRAQ_A2_COMPLETION
        for excerpt in (
            opening.replace('Diraq,', 'OtherCo,'),
            opening.replace('successful completion', 'intention to complete'),
            opening.replace('announced', 'has not announced'),
            opening.replace('Series A-2', 'Series A'),
            opening.replace('Series A-2', 'Series A-3'),
            opening.replace('USD $15', 'USD $22'),
            opening.replace('USD $15', 'US$15'),
            opening[:-1] + '?',
            f'“{opening}”',
            DIRAQ_A2_EXPANSION,
        ):
            with self.subTest(excerpt=excerpt):
                result, = self.diraq_completion_review([{}], opening=excerpt)['results']
                self.assertNotIn('round_mention', result['observations'][0]['signals'])

    def test_numbered_completion_binds_explicit_retractions_to_the_same_round(self):
        opening = DIRAQ_A2_COMPLETION
        denial = 'Diraq did not complete the Series A-2 capital raise of USD $15 million.'
        qualified = denial.replace('did not complete', 'did not successfully complete')
        possessive = 'Correction: Diraq’s USD $15 million Series A-2 round did not close.'
        perfect = possessive.replace('did not close', 'has not yet closed')
        board = 'One director joined the board.'
        research = 'The raise will support the company’s research and development.'
        for following, expected in (
            (denial, False),
            (qualified, False),
            (denial.replace('did not', 'did not in fact'), False),
            (denial.replace('complete', 'announce the successful completion of'), False),
            ('Diraq has not yet closed the Series A-2 round.', False),
            (possessive, False),
            (f'{board} {possessive}', False),
            (perfect, False),
            (f'{research} {perfect}', False),
            (denial.replace('Diraq', 'Acme'), True),
            (denial.replace('Series A-2', 'Series A'), True),
            (denial.replace('Series A-2', 'Series A-3'), True),
            (denial.replace('USD $15', 'USD $22'), True),
            (denial.replace('USD $15', 'US$15'), True),
            (denial.replace('complete', 'secure'), True),
            (qualified.replace('Diraq', 'Acme'), True),
            (qualified.replace('Series A-2', 'Series A-3'), True),
            (qualified.replace('USD $15', 'USD $22'), True),
            (f'{research} {perfect.replace("USD $15", "USD $22")}', True),
            (f'{board} {possessive.replace("Series A-2", "Series A-3")}', True),
            (f'“{denial}”', True),
            (denial[:-1] + '?', True),
            (f'“{qualified}”', True),
            (perfect[:-1] + '?', True),
            ('The legal close date was not disclosed.', True),
            (f'{denial} Diraq completed a US$20 million Series A.', True),
        ):
            with self.subTest(following=following):
                result, = self.diraq_completion_review([{'excerpt': f'{opening} {following}'}])['results']
                row, = result['observations']
                self.assertEqual('round_mention' in row['signals'], expected)
                if not expected:
                    self.assertIn('prospective_or_negated', row['signals'])

    def test_round_extension_wording_remains_review_context(self):
        context = ('context', ['round_extension_context'])
        for excerpt in (
            STAGE_FIRST_EXTENSION,
            'Ready Company closed a Series A extension.',
            'Ready Company announced its Series A-2 had expanded to an undisclosed amount.',
            STAGE_FIRST_EXTENSION.replace('had expanded', 'would expand'),
            STAGE_FIRST_EXTENSION.replace('had expanded', 'had not expanded'),
            STAGE_FIRST_EXTENSION.replace('had expanded', 'has now expanded'),
            STAGE_FIRST_EXTENSION.replace('had expanded', 'was later extended'),
            STAGE_FIRST_EXTENSION.replace('had expanded', 'will later be extended'),
            STAGE_FIRST_EXTENSION.replace('had expanded', 'has  now expanded'),
            STAGE_FIRST_EXTENSION.replace('had expanded', 'was later extended')[:-1] + '?',
            STAGE_FIRST_EXTENSION[:-1] + '?',
            ISSUER_EXTENSION,
            INVESTOR_EXTENSION,
        ):
            with self.subTest(excerpt=excerpt):
                self.assertEqual(classify(excerpt, {'ready company'}), context)
        self.assertNotIn('round_mention', classify(f'“{STAGE_FIRST_EXTENSION}”', {'ready company'})[1])
        quoted_timing = STAGE_FIRST_EXTENSION.replace('had expanded', 'has now expanded')
        self.assertNotIn('round_mention', classify(f'“{quoted_timing}”', {'ready company'})[1])
        other_issuer = STAGE_FIRST_EXTENSION.replace('Ready Company', 'Acme').replace(
            'the February close', 'an investment from Ready Company',
        )
        self.assertNotIn('round_extension_context', classify(other_issuer, {'ready company'})[1])

    def test_round_extension_does_not_hide_independent_round_statements(self):
        initial = 'Ready Company closed a US$20 million Series A.'
        other = 'Acme closed a US$8 million Series B.'
        self.assertEqual(classify(initial, {'ready company'}), ('round_lead', ['round_mention']))
        later = STAGE_FIRST_EXTENSION.replace('had expanded', 'was later extended')
        for excerpt in (f'{initial} {STAGE_FIRST_EXTENSION}', f'{STAGE_FIRST_EXTENSION} {initial}',
                        f'{later} {initial}'):
            with self.subTest(excerpt=excerpt):
                self.assertEqual(
                    classify(excerpt, {'ready company'}),
                    ('mixed_financing_lead', ['round_mention', 'round_extension_context']),
                )
        self.assertEqual(
            classify(f'{STAGE_FIRST_EXTENSION} {other}', {'acme'}),
            ('round_lead', ['round_mention']),
        )
        self.assertEqual(
            classify(f'{STAGE_FIRST_EXTENSION} {other}', {'ready company'}),
            ('context', ['round_extension_context']),
        )

    def test_round_extension_saved_review_retains_each_source(self):
        sources = [
            {'url': 'https://www.ready.example/extension', 'excerpt': ISSUER_EXTENSION,
             'acquisition': 'reviewer_paraphrase', 'retrieved_on': '2026-11-20',
             'dates': {'published': '2026-11-18'}},
            {'url': 'https://www.investor.example/investment', 'excerpt': INVESTOR_EXTENSION,
             'acquisition': 'reviewer_paraphrase', 'retrieved_on': '2026-11-20',
             'dates': {'published': '2026-11-16'}},
        ]
        repeated = [sources[0], sources[1], sources[0]]
        results = saved_results(repeated, 'www.ready.example', {'ready company'})
        self.assertEqual(results, saved_results(repeated[::-1], 'www.ready.example', {'ready company'}))
        self.assertEqual(len(results), 2)
        documents = {document['url']: document for document in results}
        for source in sources:
            document = documents[source['url']]
            self.assertTrue(document['review_required'])
            self.assertEqual(document['observations'], [{
                **source,
                'dates': {'published': {'value': source['dates']['published'], 'precision': 'day'}},
                'bucket': 'context',
                'signals': ['round_extension_context'],
            }])

    def test_saved_issuer_expansion_keeps_new_capital_and_expanded_totals(self):
        company = {'name': 'Ready Company', 'website': 'https://ready.example/'}
        cases = (
            (NUMBERED_EXTENSION_DISCLOSURE, {
                'series': 'Series B', 'new_capital': '$12.5 million USD', 'expanded_total': 'over $30 million USD',
            }),
            (INLINE_EXTENSION_DISCLOSURE, {
                'series': 'Series B', 'new_capital': 'USD $9M', 'expanded_total': 'USD $40M',
                'alternate_total': 'AUD $59M',
            }),
            (INLINE_EXTENSION_DISCLOSURE.replace(' (AUD $59M)', ''), {
                'series': 'Series B', 'new_capital': 'USD $9M', 'expanded_total': 'USD $40M',
            }),
            (INLINE_EXTENSION_DISCLOSURE.replace('USD $40M', '$40M USD'), {
                'series': 'Series B', 'new_capital': 'USD $9M', 'expanded_total': '$40M USD',
                'alternate_total': 'AUD $59M',
            }),
        )
        for excerpt, amounts in cases:
            with self.subTest(excerpt=excerpt):
                capture = {'url': 'https://ready.example/news/extension', 'excerpt': excerpt,
                           'retrieved_on': '2026-11-20', 'acquisition': 'page_excerpt'}
                report = self.first_person_review([capture, capture], company=company)
                self.assertEqual(report['repeated_url_hits'], 1)
                result, = report['results']
                self.assertTrue(result['review_required'])
                self.assertEqual(result['bucket'], 'context')
                self.assertEqual(result['observations'], [{
                    **capture, 'round_extension_amounts': amounts,
                    'bucket': 'context', 'signals': ['round_extension_context'],
                }])

    def test_expansion_amounts_need_matching_saved_issuer_assertions(self):
        company = {'name': 'Ready Company', 'website': 'https://ready.example/'}
        notice = INLINE_EXTENSION_DISCLOSURE
        numbered = NUMBERED_EXTENSION_DISCLOSURE
        capture = {'url': 'https://ready.example/news/extension', 'excerpt': notice,
                   'retrieved_on': '2026-11-20', 'acquisition': 'page_excerpt'}
        initial_close = 'Ready Company completed a US$15 million Series A.'
        for change in (
            {'excerpt': notice.replace('announced the successful expansion', 'plans a future expansion')},
            {'excerpt': notice.replace('of new capital', 'of unrelated bookings')},
            {'excerpt': notice.replace(', with USD $9M of new capital', '')},
            {'excerpt': notice.replace('AUD $59M', 'AUD $59M in orders')},
            {'excerpt': notice.replace('Ready Company', 'Other Company') + ' Ready Company was a customer.'},
            {'excerpt': notice[:-1] + '?'},
            {'excerpt': f'An observer said “{notice}”'},
            {'excerpt': notice + ' Ready Company did not expand its Series B.'},
            {'excerpt': numbered.replace('brings Ready Company’s total', 'brings Other Company’s total')},
            {'excerpt': numbered.replace('total Series B raise', 'total Series C raise')},
            {'excerpt': numbered.split(' This Series B extension', 1)[0]},
            {'excerpt': f'{notice} {initial_close}'},
            {'acquisition': 'search_result'},
            {'acquisition': 'reviewer_paraphrase'},
            {'url': 'https://wire.example/news/extension'},
            {'coverage_listing': {'article_url': 'https://wire.example/news/extension'}},
        ):
            with self.subTest(change=change):
                result, = self.first_person_review([{**capture, **change}], company=company)['results']
                observation, = result['observations']
                self.assertNotIn('round_extension_amounts', observation)
                if 'coverage_listing' in change:
                    self.assertEqual(observation['signals'], ['coverage_listing'])
                elif change.get('excerpt', '').endswith(initial_close):
                    self.assertIn('round_mention', observation['signals'])

    def test_issuer_expansion_with_same_or_missing_currency_keeps_ambiguous_context(self):
        company = {'name': 'Ready Company', 'website': 'https://ready.example/'}
        for totals in (
            'USD $40M (USD $59M)',
            'USD $40M (usd $40M)',
            'US$40M (USD $59M)',
            'AU$40M (AUD $59M)',
            '$40M USD (USD $59M)',
            '$40M (AUD $59M)',
        ):
            with self.subTest(totals=totals):
                excerpt = ('Ready Company announced the expansion of its Series B funding round to '
                           f'{totals}, with USD $9M of new capital.')
                capture = {'url': 'https://ready.example/news/extension', 'excerpt': excerpt,
                           'retrieved_on': '2026-11-20', 'acquisition': 'page_excerpt'}
                result, = self.first_person_review([capture], company=company)['results']
                self.assertTrue(result['review_required'])
                self.assertEqual(result['bucket'], 'context')
                self.assertEqual(result['observations'], [{
                    **capture, 'bucket': 'context', 'signals': ['round_extension_context', 'ambiguous_extension_total'],
                }])

    def test_saved_issuer_investor_update_adds_only_a_context_signal(self):
        company = {'name': 'Ready Company', 'website': 'https://ready.example/'}
        for excerpt in (
            INVESTOR_UPDATE_DISCLOSURE,
            EXISTING_ROUND_DISCLOSURE,
            EXISTING_ROUND_DISCLOSURE.replace('Cedar Ventures', 'Cedar Ventures LLC'),
            INVESTOR_UPDATE_DISCLOSURE.replace('$50 million USD', 'USD $0.001M'),
            EXISTING_ROUND_DISCLOSURE[:-1] + ', which has raised $0 million USD.',
        ):
            with self.subTest(excerpt=excerpt):
                capture = {'url': 'https://ready.example/news/investor', 'excerpt': excerpt,
                           'retrieved_on': '2026-11-21', 'acquisition': 'page_excerpt',
                           'dates': {'published': '2023-07-25'}}
                report = self.first_person_review([capture, capture], company=company)
                self.assertEqual(report['repeated_url_hits'], 1)
                result, = report['results']
                self.assertTrue(result['review_required'])
                self.assertEqual(result['bucket'], 'context')
                self.assertEqual(result['observations'], [{
                    **capture, 'dates': {'published': {'value': '2023-07-25', 'precision': 'day'}}, 'bucket': 'context',
                    'signals': ['backing_context', 'existing_round_investor_update'],
                }])

    def test_investor_update_cue_requires_a_complete_issuer_page_statement(self):
        company = {'name': 'Ready Company', 'website': 'https://ready.example/'}
        opening = EXISTING_ROUND_DISCLOSURE
        capture = {'url': 'https://ready.example/news/investor', 'excerpt': opening,
                   'retrieved_on': '2026-11-21', 'acquisition': 'page_excerpt'}
        for change in (
            {'url': 'https://wire.example/news/investor'},
            {'acquisition': 'search_result'},
            {'acquisition': 'reviewer_paraphrase'},
            {'excerpt': f'The newspaper reported “{opening}”'},
            {'excerpt': opening[:-1] + '?'},
            {'excerpt': opening.replace('announced the addition of', 'advised on the addition of')},
            {'excerpt': opening.replace('its existing', 'its client’s existing')},
            {'excerpt': opening.replace('Ready Company announced',
                                        'Ready Company, a global leader in developing legal services for its clients, announced')},
            {'excerpt': opening.replace('announced', 'plans to announce')},
            {'excerpt': opening.replace('announced', 'did not announce')},
            {'excerpt': opening.replace('Ready Company', 'Other Company') + ' Ready Company was mentioned.'},
            {'excerpt': opening.replace('existing ', '')},
            {'excerpt': opening.replace('its existing', 'the existing')},
            {'excerpt': opening[:-1] + ', subject to approval.'},
            {'excerpt': opening + ' The company later denied that Cedar Ventures had joined.'},
        ):
            with self.subTest(change=change):
                evidence = {**capture, **change}
                result, = self.first_person_review([evidence], company=company)['results']
                bucket, signals = classify(evidence['excerpt'], {'ready company'},
                                           search_result=evidence['acquisition'] == 'search_result')
                self.assertEqual(result['bucket'], bucket)
                self.assertEqual(result['observations'], [{**evidence, 'bucket': bucket, 'signals': signals}])

    def test_issuer_investor_update_needs_clear_label_and_evidence_of_existing_round(self):
        company = {'name': 'Ready Company', 'website': 'https://ready.example/'}
        existing = EXISTING_ROUND_DISCLOSURE
        for excerpt in (
            existing.replace('Cedar Ventures', 'No Named Investor'),
            existing.replace('Cedar Ventures', 'Cedar Ventures Or Pine'),
            existing.replace('Cedar Ventures', 'A New Investor'),
            existing.replace('Cedar Ventures', 'Undisclosed Investor'),
            existing.replace('Cedar Ventures', 'Cedar And Pine LLC'),
            existing.replace('its existing', 'its')[:-1] + ', which has raised $0 million USD.',
            existing.replace('its existing', 'its')[:-1] + ', which has raised USD $0.000M.',
        ):
            with self.subTest(excerpt=excerpt):
                capture = {'url': 'https://ready.example/news/investor', 'excerpt': excerpt,
                           'retrieved_on': '2026-11-21', 'acquisition': 'page_excerpt'}
                result, = self.first_person_review([capture], company=company)['results']
                self.assertTrue(result['review_required'])
                self.assertEqual(result['bucket'], 'context')
                self.assertEqual(result['observations'], [{
                    **capture, 'bucket': 'context', 'signals': ['backing_context'],
                }])

    def test_investor_update_cue_preserves_initial_round_and_extension_output(self):
        company = {'name': 'Ready Company', 'website': 'https://ready.example/'}
        initial = 'Ready Company completed a US$15 million Series A.'
        for excerpt, expected in ((initial, 'round_lead'), (INLINE_EXTENSION_DISCLOSURE, 'context')):
            capture = {'url': 'https://ready.example/news/financing', 'excerpt': excerpt,
                       'retrieved_on': '2026-11-21', 'acquisition': 'page_excerpt'}
            result, = self.first_person_review([capture], company=company)['results']
            row, = result['observations']
            self.assertEqual(result['bucket'], expected)
            if excerpt == initial:
                self.assertEqual(row['signals'], ['round_mention'])
            else:
                self.assertEqual(row['signals'], ['round_extension_context'])
                self.assertEqual(row['round_extension_amounts']['new_capital'], 'USD $9M')

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

    def linked_article_review(self, captures, *, attested=True, **options):
        article = REVIEWED_ISSUER_ARTICLES['Culture Amp']
        event = {'id': 'culture-amp-2017-series-c', 'stage': 'Series C', 'source': CULTURE_AMP_SERIES_C_WIRE}
        events = options.pop('other_rounds', [event])
        fixture_article = {
            **article,
            'opening_sha256': digest(LINKED_ARTICLE_OPENING.encode()),
            'continuation_sha256': tuple(digest(sentence.encode()) for sentence in LINKED_ARTICLE_CONTINUATION),
        }
        capture = {
            'url': CULTURE_AMP_LINKED_ARTICLE, 'acquisition': 'page_excerpt',
            'retrieved_on': '2026-11-20', 'excerpt': LINKED_ARTICLE_OPENING,
        }
        with patch.dict(REVIEWED_ISSUER_ARTICLES, {'Culture Amp': fixture_article} if attested else {}, clear=True):
            return self.first_person_review([{**capture, **item} for item in captures], other_rounds=events, **options)

    def test_linked_article_needs_exact_citation_and_page_excerpt(self):
        date = {'announced': '2017-06'}
        capture = {'dates': date}
        report = self.linked_article_review([capture, capture])
        result, = report['results']
        row, = result['observations']
        self.assertEqual(report['repeated_url_hits'], 1)
        self.assertTrue(result['review_required'])
        self.assertEqual(row, {
            'url': CULTURE_AMP_LINKED_ARTICLE, 'acquisition': 'page_excerpt', 'retrieved_on': '2026-11-20',
            'excerpt': LINKED_ARTICLE_OPENING, 'bucket': 'round_lead', 'signals': ['round_mention'],
            'dates': {'announced': {'value': '2017-06', 'precision': 'month'}},
        })
        event = {'id': 'culture-amp-2017-series-c', 'stage': 'Series C', 'source': CULTURE_AMP_SERIES_C_WIRE}
        for change, options in (
            ({'url': CULTURE_AMP_LINKED_ARTICLE + '?tracking=1'}, {}),
            ({'url': CULTURE_AMP_LINKED_ARTICLE + '#comment'}, {}),
            ({'url': CULTURE_AMP_LINKED_ARTICLE + '-repost'}, {}),
            ({'url': CULTURE_AMP_LINKED_ARTICLE.replace('www.cultureamp.com', 'participant.example')}, {}),
            ({'url': CULTURE_AMP_LINKED_ARTICLE.replace('www.cultureamp.com', 'cultureamp.com')}, {}),
            ({'url': CULTURE_AMP_SERIES_D}, {}),
            ({'acquisition': 'reviewer_paraphrase'}, {}),
            ({'acquisition': 'search_result'}, {}),
            ({}, {'attested': False}),
            ({}, {'other_rounds': []}),
            ({}, {'other_rounds': [{**event, 'id': 'other-series-c'}]}),
            ({}, {'other_rounds': [{**event, 'stage': 'Series E'}]}),
            ({}, {'other_rounds': [{**event, 'source': event['source'] + '#syndicate'}]}),
            ({}, {'other_companies': [{'name': 'Acme', 'website': 'https://cultureamp.com/about'}]}),
            ({}, {'other_companies': [{'name': 'Acme', 'website': 'https://acme.example/',
                                       'funding_rounds': [{**event, 'id': 'acme-series-c'}]}]}),
            ({}, {'other_rounds': [event, {**event, 'source': event['source'] + '#other'}]}),
            ({}, {'other_rounds': [event, {**event, 'source': CULTURE_AMP_LINKED_ARTICLE + '?other=1'}]}),
        ):
            with self.subTest(change=change, options=options):
                document, = self.linked_article_review([change], **options)['results']
                self.assertEqual(document['bucket'], 'context')
                self.assertEqual(document['observations'][0]['signals'], ['backing_context'])

    def test_linked_article_corrections_and_attribution_are_bounded(self):
        opening = LINKED_ARTICLE_OPENING
        amended = ' '.join((opening, *LINKED_ARTICLE_CONTINUATION))
        for excerpt, expected in (
            (opening, True),
            (amended, True),
            (f'{opening} The legal close date was not disclosed.', True),
            (f'{opening} We did not raise a Series E.', True),
            (f'{opening} Acme did not raise the Series C funding.', True),
            (f'{opening} We did not raise a $21 million Series C round.', True),
            (f'{opening} We did not raise $21 million in Series C funding.', True),
            (f'{opening} We did not raise a US$20 million Series C round.', True),
            (f'{opening} We did not close the Series C.', True),
            (f'{opening} “We did not raise a Series C.”', True),
            (f'{opening} We did not raise a Series C?', True),
            (f'{opening} We did not raise a Series C.', False),
            (f'{opening} We did not raise any Series C funding.', False),
            (f'{opening} We have not actually raised the funding.', False),
            (f'{opening} Culture Amp didn’t raise the Series C funding round.', False),
            (f'{opening} We did not raise a $20 million Series C round.', False),
            (f'{opening} We did not raise $20 million in Series C funding.', False),
            (f'{opening} We did not raise a Series C round of $20 million.', False),
            (f'{opening} I misspoke: we haven’t raised a $20 million Series C round.', False),
            (f'{opening} I misspoke. We didn’t raise a $20 million Series C round.', False),
            (f'{amended} We did not raise a $20 million Series C round.', False),
            (f'{amended} Correction: We did not raise $20 million in Series C funding.', False),
            (f'Culture Amp did not raise a Series C round. {opening}', False),
            (f'“{opening}”', False),
            (f'A customer said, “{opening}”', False),
            (opening[:-1] + '?', False),
            (opening.replace('we have raised', 'we plan to raise'), False),
            (opening.replace('we have raised', 'the customer has raised'), False),
            (opening.replace('Series C', 'Series D'), False),
            (opening.replace('$20 million', '$21 million'), False),
        ):
            with self.subTest(excerpt=excerpt):
                document, = self.linked_article_review([{'excerpt': excerpt}])['results']
                self.assertEqual('round_mention' in document['observations'][0]['signals'], expected)

    def test_linked_article_does_not_authorize_a_separate_excerpt(self):
        left, right = LINKED_ARTICLE_OPENING.split('we have', 1)
        report = self.linked_article_review([
            {'excerpt': left.strip()},
            {'excerpt': 'We have' + right},
            {'url': 'https://participant.example/news'},
        ])
        self.assertEqual(report['repeated_url_hits'], 1)
        self.assertEqual(sum(len(doc['observations']) for doc in report['results']), 3)
        self.assertTrue(all('round_mention' not in row['signals']
                            for doc in report['results'] for row in doc['observations']))

    def test_linked_article_binds_adjacent_actually_raise_denials(self):
        corrections = (
            ('Correction: Culture Amp did not actually raise the Series C funding.', False),
            ('Culture Amp didn’t actually raise a $20 million Series C round.', False),
            ('We actually did not raise a Series C round.', False),
            ('I misspoke. We actually did not raise a $20 million Series C round.', False),
            ('Correction: We didn’t actually raise a $21 million Series C round.', True),
            ('Culture Amp didn’t actually raise a US$20 million Series C round.', True),
            ('Correction: Culture Amp did not actually raise the Series D funding.', True),
            ('Correction: Acme did not actually raise the Series C funding.', True),
            ('Correction: Culture Amp did not actually close the Series C funding.', True),
            ('“Correction: Culture Amp did not actually raise the Series C funding.”', True),
            ('We actually did not raise a Series C round?', True),
            ('We did not actually raise a Series C round for Acme.', True),
            ('Other questions were asked. We actually did not raise a Series C round.', True),
        )
        openings = (LINKED_ARTICLE_OPENING, ' '.join((LINKED_ARTICLE_OPENING, *LINKED_ARTICLE_CONTINUATION)))
        excerpts = {f'{opening} {correction}': lead for opening in openings for correction, lead in corrections}
        document, = self.linked_article_review([{'excerpt': excerpt} for excerpt in excerpts])['results']
        for row in document['observations']:
            with self.subTest(excerpt=row['excerpt']):
                if excerpts[row['excerpt']]:
                    self.assertIn('round_mention', row['signals'])
                else:
                    self.assertEqual(row['bucket'], 'context')
                    self.assertIn('prospective_or_negated', row['signals'])

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

    def test_first_person_correction_requires_adjacent_matching_round_and_reviewed_page(self):
        lead = ('round_lead', ['round_mention'])
        denial = ('context', ['prospective_or_negated'])
        cases = (
            ('We did not raise the Series D funding.', denial),
            ('We have not actually raised the funding.', denial),
            ('I misspoke: we did not raise the Series D funding.', denial),
            ("We didn't raise our Series D funding.", denial),
            ('I misspoke: we haven’t actually raised the funding.', denial),
            ('I misspoke. We did not raise the Series D funding.', denial),
            ('Culture Amp did not raise the Series D funding.', denial),
            ('We did not raise the Series E funding.', lead),
            ('I misspoke: we did not raise the Series E funding.', lead),
            ('Acme did not raise the Series D funding.', lead),
            ('The legal close date was not disclosed.', lead),
            ("We haven't disclosed the legal close date.", lead),
            ('Culture Amp did not close the Series D funding round.', lead),
            ('We have not closed the Series D funding round.', lead),
            ('We did not raise the Series D funding for Acme.', lead),
            ('We did not raise the Series D funding?', lead),
            ('“We did not raise the Series D funding.”', lead),
            ('The issuer provided further context. We did not raise the Series D funding.', lead),
        )
        capture = {'url': CULTURE_AMP_SERIES_D, 'retrieved_on': '2026-11-19', 'acquisition': 'page_excerpt'}
        excerpts = {f'{CULTURE_AMP_FIRST_PERSON} {following}': expected for following, expected in cases}
        document, = self.first_person_review([
            {**capture, 'excerpt': excerpt} for excerpt in excerpts
        ])['results']
        self.assertTrue(document['review_required'])
        self.assertEqual(len(document['observations']), len(excerpts))
        for row in document['observations']:
            with self.subTest(excerpt=row['excerpt']):
                self.assertEqual((row['bucket'], row['signals']), excerpts[row['excerpt']])

        corrected = {**capture, 'excerpt': f'{CULTURE_AMP_FIRST_PERSON} {cases[0][0]}'}
        for override in ({'url': CULTURE_AMP_SERIES_D + '#reply'}, {'acquisition': 'search_result'}):
            with self.subTest(override=override):
                item, = self.first_person_review([{**corrected, **override}])['results']
                self.assertEqual(item['observations'][0]['signals'], [])
                self.assertEqual(item['bucket'], 'unmatched')

    def test_round_corrections_bind_determiners_to_an_explicit_matching_series(self):
        lead = ('round_lead', ['round_mention'])
        denial = ('context', ['prospective_or_negated'])
        mixed = ('mixed_financing_lead', ['round_mention', 'prospective_or_negated'])
        named_opening = 'Culture Amp announced today it has raised its Series D funding round.'
        named_denials = (
            'Culture Amp did not raise a Series D funding round.',
            'Culture Amp did not raise any Series D funding.',
            'Culture Amp did not raise an Series D funding round.',
        )
        cases = (
            *((CULTURE_AMP_FIRST_PERSON, correction, denial) for correction in named_denials),
            *((named_opening, correction, denial) for correction in named_denials),
            (CULTURE_AMP_FIRST_PERSON, 'We did not raise a Series D funding round.', denial),
            (CULTURE_AMP_FIRST_PERSON, 'We did not raise any Series D funding.', denial),
            (CULTURE_AMP_FIRST_PERSON, 'We did not raise an Series D funding round.', denial),
            (CULTURE_AMP_FIRST_PERSON, 'We did not raise a Series E.', lead),
            (CULTURE_AMP_FIRST_PERSON, 'Acme did not raise any Series D funding.', lead),
            (CULTURE_AMP_FIRST_PERSON, 'We did not raise any funding.', lead),
            (CULTURE_AMP_FIRST_PERSON, 'We did not raise a $50M Series D funding round.', lead),
            (named_opening, 'Culture Amp did not raise a Series E.', mixed),
            (named_opening, 'Acme did not raise a Series D funding round.', lead),
        )
        excerpts = {f'{opening} {following}': expected for opening, following, expected in cases}
        document, = self.first_person_review([
            {'url': CULTURE_AMP_SERIES_D, 'retrieved_on': '2026-11-19', 'acquisition': 'page_excerpt',
             'excerpt': excerpt}
            for excerpt in excerpts
        ])['results']
        self.assertTrue(document['review_required'])
        self.assertEqual(len(document['observations']), len(cases))
        for row in document['observations']:
            with self.subTest(excerpt=row['excerpt']):
                self.assertEqual((row['bucket'], row['signals']), excerpts[row['excerpt']])

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

    def test_customer_list_in_wire_opening_does_not_sever_the_named_issuer(self):
        opening = CULTURE_AMP_SERIES_A_OPENING
        alternate = opening.replace(' among the companies using its platform,', ' among its customers,')
        for excerpt in (
            opening,
            opening.replace(CULTURE_AMP_CUSTOMERS, ''),
            f'{opening} The release lists other deal parties.',
            CULTURE_AMP_SERIES_A_HEADLINE,
            alternate.replace(' and Silver Oak', ', and Silver Oak').replace('has closed', 'has raised'),
            alternate.split(' --\N{NO-BREAK SPACE}People Analytics company ')[1],
        ):
            with self.subTest(excerpt=excerpt):
                self.assertEqual(classify(excerpt, {'culture amp'}), ('round_lead', ['round_mention']))

    def test_customer_list_guard_requires_an_asserted_round_by_the_named_issuer(self):
        opening = CULTURE_AMP_SERIES_A_OPENING
        foreign = opening.replace('Culture Amp', 'Another Corp', 1).replace('counts Acme,', 'counts Culture Amp,')
        for excerpt, name in (
            (foreign, 'culture amp'),
            (opening, 'silver oak'),
            (f'A customer quoted “{opening}”', 'culture amp'),
            (f'“{opening}”', 'culture amp'),
            (f'{opening[:-1]}?', 'culture amp'),
            (opening.replace('which counts', 'which recently acquired'), 'culture amp'),
            (opening.replace(' and Silver Oak', ', Cedar, Maple, Willow and Silver Oak'), 'culture amp'),
            (opening.replace('it has closed', 'Acme has closed'), 'culture amp'),
            (opening.replace('it has closed', 'it plans to close'), 'culture amp'),
            (opening.replace('it has closed', 'it did not raise'), 'culture amp'),
            (opening.replace('Series A funding.', 'its planned Series A funding.'), 'culture amp'),
            (opening.replace('Series A funding.', 'Series A product line.'), 'culture amp'),
            (opening.replace('Series A funding.', 'Series A products and Series B funding.'), 'culture amp'),
            (opening.replace('Series A funding.', 'Series A funding if it secures approval.'), 'culture amp'),
        ):
            with self.subTest(excerpt=excerpt, name=name):
                self.assertNotIn('round_mention', classify(excerpt, {name})[1])
        self.assertEqual(classify(foreign, {'another corp'}), ('round_lead', ['round_mention']))

    def test_wire_round_correction_requires_adjacent_matching_issuer_and_stage(self):
        lead = ('round_lead', ['round_mention'])
        corrected = ('context', ['prospective_or_negated'])
        mixed = ('mixed_financing_lead', ['round_mention', 'prospective_or_negated'])
        denial = 'Culture Amp did not raise any Series A funding.'
        for opening in (CULTURE_AMP_SERIES_A_OPENING, f'{CULTURE_AMP_SERIES_A_HEADLINE}.'):
            for following, expected in (
                (denial, corrected),
                ('Culture Amp has not actually raised the funding.', corrected),
                ('Acme did not raise any Series A funding.', lead),
                ('Culture Amp did not raise any Series B funding.', mixed),
                ('The legal close date was not disclosed.', lead),
                (f'{denial[:-1]}?', mixed),
                (f'“{denial}”', mixed),
                (f'A separate transaction is under review. {denial}', mixed),
                (f'{denial} Culture Amp closed its Series D.', mixed),
            ):
                with self.subTest(opening=opening, following=following):
                    self.assertEqual(classify(f'  {opening}\n{following}', {'culture amp'}), expected)

    def test_wire_completion_correction_matches_the_asserted_action(self):
        lead = ('round_lead', ['round_mention'])
        corrected = ('context', ['prospective_or_negated'])
        closed = CULTURE_AMP_SERIES_A_OPENING
        raised = closed.replace('has closed', 'has raised')
        secured = closed.replace('has closed', 'has secured')
        denied_close = 'Culture Amp did not close the Series A funding round.'
        denied_funding_close = 'Culture Amp has not actually closed the funding.'
        denied_secured_round = 'Culture Amp has not secured its Series A.'
        for opening, following, expected in (
            (closed, denied_close, corrected),
            (closed, denied_funding_close, corrected),
            (secured, denied_secured_round, corrected),
            (secured, 'Culture Amp did not secure the funding.', corrected),
            (f'{CULTURE_AMP_SERIES_A_HEADLINE}.', denied_secured_round, corrected),
            (closed, denied_secured_round, lead),
            (secured, denied_close, lead),
            (raised, denied_close, lead),
            (raised, denied_funding_close, lead),
            (raised, denied_secured_round, lead),
            (CULTURE_AMP_DIRECT, 'Culture Amp did not close the Series E funding round.', lead),
            (closed, 'Culture Amp did not close the Series B funding round.', lead),
            (closed, 'Another Corp has not closed the funding.', lead),
            (closed, 'We did not close the Series A funding round.', lead),
            (closed, 'Culture Amp did not disclose the Series A legal close date.', lead),
            (closed, f'{denied_close[:-1]}?', lead),
            (closed, f'“{denied_close}”', lead),
            (closed, f'The issuer made another announcement. {denied_close}', lead),
            (closed, f'{denied_close} Culture Amp closed its Series D.',
             ('mixed_financing_lead', ['round_mention', 'prospective_or_negated'])),
        ):
            with self.subTest(opening=opening, following=following):
                self.assertEqual(classify(f'{opening} {following}', {'culture amp'}), expected)

    def test_wire_headline_and_opening_stay_in_one_review_only_document(self):
        captures = [
            {
                'url': CULTURE_AMP_SERIES_A,
                'excerpt': excerpt,
                'acquisition': 'reviewer_paraphrase',
                'retrieved_on': '2026-11-20',
                'dates': {'published': '2015-03-04'},
            }
            for excerpt in (CULTURE_AMP_SERIES_A_HEADLINE, CULTURE_AMP_SERIES_A_OPENING)
        ]
        document, = saved_results(captures * 2, 'cultureamp.com', {'culture amp'})
        self.assertEqual(document['url'], CULTURE_AMP_SERIES_A)
        self.assertTrue(document['review_required'])
        self.assertFalse(document['on_issuer_host'])
        self.assertEqual(document['bucket'], 'round_lead')
        self.assertCountEqual(document['observations'], [
            {
                **capture, 'dates': {'published': {'value': '2015-03-04', 'precision': 'day'}},
                'bucket': 'round_lead', 'signals': ['round_mention'],
            }
            for capture in captures
        ])

    def test_reported_close_requires_an_asserted_named_series_in_both_word_orders(self):
        lead = ('round_lead', ['round_mention'])
        no_lead = ('unmatched', [])
        for opening in (CULTURE_AMP_REPORTED_CLOSE,
                        CULTURE_AMP_REPORTED_CLOSE.replace('announced today', 'today announced')):
            with self.subTest(opening=opening):
                self.assertEqual(classify(opening, {'culture amp'}), lead)
                for excerpt in (
                    f'“{opening}”',
                    f'Another publisher quoted “{opening}”',
                    opening[:-1] + '?',
                    opening.replace('it has closed', '“it has closed') + '”',
                    opening.replace('Culture Amp, the people analytics company for workplace feedback,',
                                    'Another Corp, a vendor for Culture Amp,'),
                    opening.replace('Series B round.', 'Series B edition.'),
                    opening.replace('Series B round.', 'planned Series B round.'),
                ):
                    with self.subTest(excerpt=excerpt):
                        self.assertEqual(classify(excerpt, {'culture amp'}), no_lead)
                intent = opening.replace('has closed', 'plans to close')
                self.assertEqual(classify(intent, {'culture amp'}), ('context', ['prospective_or_negated']))
        self.assertEqual(
            classify('Culture Amp today announced that it has closed its seed round.', {'culture amp'}),
            ('early_round_lead', ['round_mention', 'early_stage_mention']),
        )

    def test_reported_close_correction_binds_the_adjacent_issuer_action_and_series(self):
        lead = ('round_lead', ['round_mention'])
        corrected = ('context', ['prospective_or_negated'])
        denial = 'Culture Amp did not close the Series B funding round.'
        for opening in (CULTURE_AMP_REPORTED_CLOSE,
                        CULTURE_AMP_REPORTED_CLOSE.replace('announced today', 'today announced')):
            for subsequent, expected in (
                (denial, corrected),
                ("Culture Amp didn't close the Series B funding round.", corrected),
                ('Culture Amp didn’t close the Series B funding round.', corrected),
                ('Culture Amp has not actually closed the funding.', corrected),
                (denial.replace('Series B', 'Series D'), lead),
                (denial.replace('Culture Amp', 'Another Corp'), lead),
                (denial.replace('Culture Amp', 'We'), lead),
                ('Culture Amp did not close a $10 million Series B round.', corrected),
                ('Culture Amp didn’t close a $10 million Series B round.', corrected),
                ('Culture Amp did not close a $20 million Series B round.', lead),
                ('Culture Amp did not close a US$10 million Series B round.', lead),
                ('Culture Amp did not close a $10m Series B round.', lead),
                ('Culture Amp did not close a $10 million Series B round?', lead),
                ('Another Corp did not close a $10 million Series B round.', lead),
                (denial[:-1] + '?', lead),
                (f'“{denial}”', lead),
                (f'The company discussed other activity. {denial}', lead),
                ('The legal close date was not disclosed.', lead),
                (f'{denial} Culture Amp closed its Series D.',
                 ('mixed_financing_lead', ['round_mention', 'prospective_or_negated'])),
            ):
                with self.subTest(opening=opening, subsequent=subsequent):
                    self.assertEqual(classify(f'{opening} {subsequent}', {'culture amp'}), expected)

    def test_reported_close_keeps_amount_valuation_and_date_as_separate_evidence(self):
        excerpt = CULTURE_AMP_REPORTED_CLOSE[:-1] + ' at a $20 million valuation.'
        capture = {
            'url': CULTURE_AMP_SERIES_B,
            'excerpt': excerpt,
            'acquisition': 'reviewer_paraphrase',
            'retrieved_on': '2026-11-20',
            'dates': {'published': '2016-03-07'},
        }
        document, = saved_results([capture, capture], 'cultureamp.com', {'culture amp'})
        self.assertTrue(document['review_required'])
        self.assertEqual(document['bucket'], 'mixed_financing_lead')
        self.assertEqual(document['observations'], [{
            **capture,
            'dates': {'published': {'value': '2016-03-07', 'precision': 'day'}},
            'bucket': 'mixed_financing_lead',
            'signals': ['round_mention', 'valuation'],
        }])

    def test_later_reported_close_requires_plain_unquoted_context(self):
        close = 'Culture Amp today announced that it has closed a $10 million Series B round.'
        preface = 'The company released its annual update.'
        correction = 'Culture Amp did not close the Series B funding round.'
        lead = ('round_lead', ['round_mention'])
        no_lead = ('unmatched', [])
        for excerpt, expected in (
            (f'{preface} {close}', lead),
            (f'Culture Amp released its annual update. {close}', lead),
            (f'Culture Amp’s annual update covered hiring. {preface} {close}', lead),
            (f'A spokesperson said “no comment.” {close}', lead),
            (f'A spokesperson said "no comment." {close}', lead),
            (f'{preface} {close} A spokesperson said “Other news follows.”', lead),
            (f'A spokesperson said “no comment. {close} Read the release.”', no_lead),
            (f'A spokesperson said “no comment.” {close} Culture Amp didn’t close the Series B funding round.',
             ('context', ['prospective_or_negated'])),
            (f'{preface} {close} {correction}', ('context', ['prospective_or_negated'])),
            (f'{preface} {close} {correction.replace("Series B", "Series D")}', lead),
            (f'{preface} {close} {correction.replace("Culture Amp", "Another Corp")}', lead),
            (f'{preface} “{close}”', no_lead),
            (f'A journalist wrote, “{preface} {close} These are the details.”', no_lead),
            (f'{preface} {close} This concludes the quotation.”', no_lead),
            (f'{preface} {close[:-1]}?', no_lead),
            (f'The reporter asked: {preface} {close}', no_lead),
            (f'Did the company announce this? {close}', no_lead),
            (f'The following is a hypothetical situation. {close}', no_lead),
        ):
            with self.subTest(excerpt=excerpt):
                self.assertEqual(classify(excerpt, {'culture amp'}), expected)

    def test_nominal_close_requires_an_asserted_round_of_the_named_company(self):
        opening = CULTURE_AMP_NOMINAL_CLOSE
        subject = 'Melbourne employee engagement startup Culture Amp'
        bare = opening.replace(subject, 'Culture Amp').split(', led by')[0] + '.'
        preface = 'The companies published a weekly update.'
        cases = (
            (opening, True),
            (bare, True),
            (f'{preface} {opening}', True),
            (f'A spokesperson said “No comment.” {opening}', True),
            (f'A spokesperson said “No comment. {opening}”', False),
            (f'“{opening}”', False),
            (opening[:-1] + '?', False),
            (f'A reporter asked: {opening}', False),
            (f'Was the round completed? {opening}', False),
            (f'An unnamed source speculated that {bare}', False),
            (opening.replace(subject, 'Acme, a supplier to Culture Amp,'), False),
            (opening.replace(subject, f'Acme profiled {subject}'), False),
            (opening.replace('the closing of', 'plans to complete'), False),
            (opening.replace('the closing of', 'the planned closing of'), False),
            (opening.replace('has announced', 'has not announced'), False),
            (opening.replace('Series B round', 'Series B product line'), False),
            ('Culture Amp has announced the closing of a US$10 million office project.', False),
            (bare[:-1] + ' on behalf of Acme.', False),
            (bare[:-1] + ' if its shareholders approve.', False),
            (bare[:-1] + ', led by Alder If Approved.', False),
        )
        for excerpt, eligible in cases:
            with self.subTest(excerpt=excerpt):
                self.assertEqual('round_mention' in classify(excerpt, {'culture amp'})[1], eligible)

    def test_nominal_close_holds_for_a_matching_retraction(self):
        opening = CULTURE_AMP_NOMINAL_CLOSE
        denial = 'Culture Amp did not close the Series B funding round.'
        amount_denial = 'Culture Amp didn’t actually close the US$10 million Series B round.'
        tagged = 'Correction: Culture Amp did not close a US$10 million Series B round.'
        intervening = 'A director will join the board.'
        cases = (
            (denial, False),
            (f'Correction: {denial}', False),
            (amount_denial, False),
            ('Culture Amp has not actually closed the funding.', False),
            ('Culture Amp actually did not close the Series B funding round.', False),
            ('Culture Amp hasn’t closed a US$10 million Series B round.', False),
            ('Culture Amp did not close a Series B round of US$10 million.', False),
            ('Culture Amp did not announce the closing of a US$10 million Series B round.', False),
            (f'{intervening} {tagged}', False),
            (denial.replace('Series B', 'Series D'), True),
            (denial.replace('Culture Amp', 'Acme'), True),
            (denial.replace('Culture Amp', 'We'), True),
            (denial.replace('close', 'secure'), True),
            (amount_denial.replace('US$10', 'US$20'), True),
            (amount_denial.replace('US$10', '$10'), True),
            (amount_denial.replace('US$10 million', 'US$10m'), True),
            ('Culture Amp did not close a Series B round of US$20 million.', True),
            (f'“{denial}”', True),
            (denial[:-1] + '?', True),
            ('The legal close date was not disclosed.', True),
            (f'A company issued an unrelated update. {denial}', True),
            (f'{intervening} {tagged.replace("Series B", "Series D")}', True),
            (f'{intervening} {tagged.replace("US$10", "US$20")}', True),
            (f'{intervening} Correction: {denial}', True),
            (f'Acme closed its Series A round. {tagged}', True),
            (f'“{intervening}” {tagged}', True),
        )
        for following, eligible in cases:
            with self.subTest(following=following):
                bucket, signals = classify(f'{opening} {following}', {'culture amp'})
                self.assertEqual('round_mention' in signals, eligible)
                if not eligible:
                    self.assertEqual(bucket, 'context')
                    self.assertIn('prospective_or_negated', signals)
        _, signals = classify(f'{opening} {denial} Culture Amp closed its Series D.', {'culture amp'})
        self.assertIn('round_mention', signals)

    def test_nominal_close_exact_named_retraction_forms(self):
        opening = 'Culture Amp has announced the closing of a US$10 million Series B round.'
        not_yet = 'Culture Amp has not yet closed its US$10 million Series B round.'
        in_fact = 'Culture Amp did not in fact close its US$10 million Series B round.'
        possessive = 'Correction: Culture Amp’s US$10 million Series B round did not close.'
        board = 'One director joined the board.'
        cases = (
            (not_yet, False),
            (in_fact, False),
            (possessive, False),
            (f'{board} {possessive}', False),
            (possessive.replace('’', "'"), False),
            (not_yet.replace('Series B', 'Series D'), True),
            (not_yet.replace('Culture Amp', 'OtherCo'), True),
            (not_yet.replace('US$10', 'A$10'), True),
            (in_fact.replace('US$10', 'US$20'), True),
            (possessive.replace('Culture Amp', 'OtherCo'), True),
            (possessive.replace('Series B', 'Series D'), True),
            (possessive.replace('US$10', 'US$20'), True),
            (possessive.replace('US$10', '$10'), True),
            (f'{board} {possessive.replace("US$10", "US$20")}', True),
            (f'“{not_yet}”', True),
            (f'“{possessive}”', True),
            (not_yet[:-1] + '?', True),
            (possessive[:-1] + '?', True),
            (f'{board} {possessive[:-1]}?', True),
            (f'{board} The company issued an update. {possessive}', True),
        )
        for following, eligible in cases:
            with self.subTest(following=following):
                bucket, signals = classify(f'{opening} {following}', {'culture amp'})
                if eligible:
                    self.assertIn('round_mention', signals)
                else:
                    self.assertEqual((bucket, signals), ('context', ['prospective_or_negated']))
        self.assertEqual(
            classify(f'{opening} {possessive} Culture Amp closed its Series D.', {'culture amp'}),
            ('mixed_financing_lead', ['round_mention', 'prospective_or_negated']),
        )

    def test_nominal_close_preserves_third_party_provenance_and_deduplication(self):
        capture = {'url': CULTURE_AMP_STARTUP_DAILY, 'excerpt': CULTURE_AMP_NOMINAL_CLOSE,
                   'acquisition': 'reviewer_paraphrase', 'retrieved_on': '2026-11-20',
                   'dates': {'published': '2016-03-11'}}
        search = {key: value for key, value in capture.items() if key != 'dates'}
        search['acquisition'] = 'search_result'
        unrelated = {**capture, 'acquisition': 'page_excerpt', 'excerpt': CULTURE_AMP_FIRST_PERSON}
        review = self.first_person_review([capture, capture, search, unrelated])
        document, = review['results']
        self.assertEqual(review['prior_rounds'], 'published')
        self.assertFalse(document['on_issuer_host'])
        self.assertTrue(document['review_required'])
        self.assertEqual(document['bucket'], 'round_lead')
        self.assertEqual(len(document['observations']), 3)
        observations = {row['acquisition']: row for row in document['observations']}
        self.assertEqual(observations['reviewer_paraphrase'], {
            **capture, 'dates': {'published': {'value': '2016-03-11', 'precision': 'day'}},
            'bucket': 'round_lead', 'signals': ['round_mention'],
        })
        for origin in ('page_excerpt', 'search_result'):
            self.assertNotIn('round_mention', observations[origin]['signals'])

    def test_cited_seed_wire_close_requires_a_complete_named_assertion(self):
        opening = SEED_WIRE_OPENING
        citation = ('ready company', 'seed')
        self.assertEqual(classify(opening, {'ready company'}, reviewed_round=citation),
                         ('early_round_lead', ['round_mention', 'early_stage_mention']))
        self.assertEqual(classify(opening, {'ready company'})[0], 'context')
        self.assertEqual(classify('Ready Company raised USD$3.2 million in seed funding.', {'ready company'})[0],
                         'early_round_lead')
        for excerpt in (
            opening[:-1] + '?',
            f'“{opening}”',
            f'A reporter recalled, “{opening}”',
            f'Reprinted for historical context. {opening}',
            opening.replace('announced closing', 'announced plans to close'),
            opening.replace('announced closing', 'did not announce closing'),
            opening.replace('today announced closing', 'expects to close'),
            opening.replace('today announced closing', 'today announced it may close'),
            opening[:-1] + ' if regulators approve.',
            opening.replace('Example Capital', 'If Approved'),
            opening.replace('Example Capital', 'Pending Approval'),
            opening.replace('Ready Company,', 'Another Corporation,'),
            opening.replace('Ready Company,', 'Ready Company Labs,'),
            opening.replace('Ready Company, a venture-backed engineering startup,',
                            'Another Corporation, a supplier to Ready Company,'),
            opening.replace('Ready Company, a venture-backed engineering startup,',
                            'Ready Company’s subsidiary Northstar,'),
            opening.replace('a venture-backed engineering startup', 'a subsidiary engineering startup'),
            opening.replace('a venture-backed engineering startup', 'a portfolio company of Northstar'),
            opening.replace('seed investment', 'seed investment in Northstar'),
            opening.replace('seed investment', 'seed funding grant'),
            opening.replace('seed investment', 'seed investment extension'),
            opening.replace('seed investment', 'pre-seed investment'),
        ):
            with self.subTest(excerpt=excerpt):
                self.assertNotIn('round_mention', classify(excerpt, {'ready company'}, reviewed_round=citation)[1])

    def test_cited_seed_wire_close_holds_a_retraction_of_the_same_event(self):
        opening = SEED_WIRE_OPENING
        citation = ('ready company', 'seed')
        denial = 'Ready Company did not close a USD$3.2 million seed investment.'
        correction = 'Correction: Ready Company’s USD$3.2 million seed investment has not yet closed.'
        passive = 'Correction: Ready Company’s USD$3.2 million seed investment was not closed.'
        definite = 'Correction: The USD$3.2 million seed investment did not close.'
        for following in (
            denial,
            denial.replace('did not close', 'didn’t actually close'),
            denial.replace('did not close', 'did not announce closing'),
            denial.replace('did not close', 'did not raise'),
            'Ready Company has not yet closed its seed round.',
            'Ready Company has not closed its USD$3.2 million seed investment yet.',
            'Ready Company has not actually closed the funding.',
            correction,
            f'The board also issued an update. {correction}',
            passive,
            'Correction: Ready Company’s seed round was never closed.',
            definite,
        ):
            with self.subTest(following=following):
                bucket, signals = classify(f'{opening} {following}', {'ready company'}, reviewed_round=citation)
                self.assertEqual(bucket, 'context')
                self.assertIn('prospective_or_negated', signals)
                self.assertNotIn('round_mention', signals)
        for following in (
            denial.replace('Ready Company', 'Another Corporation'),
            denial.replace('seed investment', 'pre-seed investment'),
            denial.replace('USD$3.2', 'USD$7.2'),
            denial.replace('USD$3.2', 'A$3.2'),
            'Ready Company has not closed its USD$7.2 million seed investment yet.',
            passive.replace('USD$3.2', 'USD$7.2'),
            passive.replace('Ready Company', 'Another Corporation'),
            passive.replace('seed investment', 'pre-seed investment'),
            definite.replace('USD$3.2', 'USD$7.2'),
            definite.replace('USD$3.2', '$3.2'),
            definite.replace('seed investment', 'pre-seed investment'),
            f'“{definite}”',
            definite[:-1] + '?',
            definite.removeprefix('Correction: '),
            f'The board also issued an update. {definite}',
            f'“{denial}”',
            denial[:-1] + '?',
            'The legal close date was not disclosed.',
            f'Another Corporation closed its Series C round. {correction}',
        ):
            with self.subTest(following=following):
                self.assertIn('round_mention', classify(f'{opening} {following}', {'ready company'},
                                                       reviewed_round=citation)[1])

    def test_seed_wire_close_keeps_saved_page_authority_and_provenance(self):
        event = {'id': 'ready-company-seed', 'stage': 'Seed', 'source': SEED_WIRE_CITATION}
        company = {'name': 'Ready Company', 'website': 'https://ready.example/', 'funding_rounds': [event]}
        capture = {'url': SEED_WIRE_CITATION, 'excerpt': SEED_WIRE_OPENING, 'acquisition': 'page_excerpt',
                   'retrieved_on': '2026-11-20', 'dates': {'published': '2021-08-25'}}
        paraphrase = {**capture, 'acquisition': 'reviewer_paraphrase'}
        lookup = {key: value for key, value in capture.items() if key != 'dates'} | {'acquisition': 'search_result'}
        variants = [
            {**capture, 'url': 'https://news.example/old-release'},
            {**capture, 'url': SEED_WIRE_CITATION.replace('000001', '000002')},
            {**capture, 'url': SEED_WIRE_CITATION + '#opening'},
            {**capture, 'url': SEED_WIRE_CITATION + '?ref=story'},
        ]
        report = self.first_person_review([capture, capture, paraphrase, lookup, *variants], company=company)
        leads = [result for result in report['results'] if result['bucket'] == 'early_round_lead']
        lead, = leads
        self.assertTrue(lead['review_required'])
        self.assertFalse(lead['on_issuer_host'])
        self.assertEqual(lead['url'], SEED_WIRE_CITATION)
        assertions = [row for row in lead['observations'] if 'round_mention' in row['signals']]
        reviewed, = assertions
        self.assertEqual(reviewed, {**capture, 'bucket': 'early_round_lead',
                                   'dates': {'published': {'value': '2021-08-25', 'precision': 'day'}},
                                   'signals': ['round_mention', 'early_stage_mention']})

        duplicate = {'name': 'Other Company', 'website': 'https://other.example/',
                     'funding_rounds': [{**event, 'stage': 'Series A', 'source': SEED_WIRE_CITATION + '?ref=other'}]}
        ambiguous = self.first_person_review([capture], company=company, other_companies=[duplicate])
        self.assertEqual(ambiguous['results'][0]['bucket'], 'context')
        wrong_stage = {**company, 'funding_rounds': [{**event, 'stage': 'Pre-seed'}]}
        self.assertEqual(self.first_person_review([capture], company=wrong_stage)['results'][0]['bucket'], 'context')

    def test_relative_wire_raises_require_a_named_assertion(self):
        wire = RELATIVE_WIRE_REPORT
        shortened = wire.replace(' announced yesterday ', ' announced ')
        declarative = RELATIVE_WIRE_ASSERTION.replace(' announced yesterday ', ' announced ')
        for excerpt in (
            wire,
            shortened,
            RELATIVE_WIRE_ASSERTION,
            f'The company released its annual update. {shortened}',
            f'A spokesperson said “no comment.” {shortened}',
        ):
            with self.subTest(excerpt=excerpt):
                self.assertEqual(classify(excerpt, {'ready company'}), ('round_lead', ['round_mention']))
        for excerpt in (
            f'“{shortened}”',
            f'{shortened[:-1]}?',
            f'A source wrote, “Some background. {shortened} Here are the details.”',
            f'{shortened} That concluded the quotation.”',
            f'Did the company confirm this? {shortened}',
            f'HR Tech World programme: {RELATIVE_WIRE_ASSERTION}',
            f'HR Tech World: {RELATIVE_WIRE_ASSERTION.replace(" announced yesterday ", " announced ")}',
            shortened.replace('HR Tech World:', 'Another Conference:'),
            shortened.replace('Ready Company announced', 'Another Corp, a vendor for Ready Company, announced'),
            wire.replace('has raised', 'plans to raise'),
            f'{wire[:-1]} If Confirmed.',
        ):
            with self.subTest(excerpt=excerpt):
                self.assertNotIn('round_mention', classify(excerpt, {'ready company'})[1])
        for excerpt in (
            declarative.replace('$21 Million led by Alder Ventures', '21 million dollars'),
            declarative.replace('led by Alder Ventures', 'to expand its business'),
            declarative.replace('Alder Ventures', 'alder ventures'),
        ):
            with self.subTest(excerpt=excerpt):
                self.assertEqual(classify(excerpt, {'ready company'}), ('round_lead', ['round_mention']))
                self.assertNotIn('round_mention', classify(f'“{excerpt}”', {'ready company'})[1])
                self.assertNotIn('round_mention', classify(f'{excerpt[:-1]}?', {'ready company'})[1])

    def test_relative_wire_raise_correction_binds_issuer_stage_action_and_stated_amount(self):
        denial = 'Ready Company did not raise the Series C funding.'
        corrected = ('context', ['prospective_or_negated', 'backing_context'])
        retained = ('round_lead', ['round_mention'])
        mixed = ('mixed_financing_lead', ['round_mention', 'prospective_or_negated'])
        for following, expected in (
            (denial, corrected),
            ('Ready Company didn’t raise the Series C funding round.', corrected),
            ("Ready Company didn't raise the Series C funding round.", corrected),
            ('Ready Company has not actually raised the funding.', corrected),
            ('Ready Company did not raise a Series C round of $21 million.', corrected),
            ('Ready Company didn’t raise $21 Million in its Series C funding round.', corrected),
            ('Ready Company did not raise a Series C round of $31 million.', mixed),
            ('Ready Company did not raise a Series C round of US$21 Million.', mixed),
            (denial.replace('Series C', 'Series D'), mixed),
            (denial.replace('Ready Company', 'Another Corp'), retained),
            (denial.replace('raise', 'close'), retained),
            ('The exact close date was not disclosed.', retained),
            (denial[:-1] + '?', mixed),
            (f'“{denial}”', mixed),
            (f'{denial} Ready Company closed its Series D.', mixed),
            (f'{denial} Ready Company announced yesterday that it has raised a Series D round of $50 million.', mixed),
        ):
            with self.subTest(following=following):
                self.assertEqual(classify(f'{RELATIVE_WIRE_REPORT} {following}', {'ready company'}), expected)

    def test_relative_wire_review_preserves_supplied_dates_and_holds_search_results(self):
        capture = {
            'url': 'https://www.prnewswire.com/example',
            'excerpt': RELATIVE_WIRE_REPORT,
            'acquisition': 'page_excerpt',
            'retrieved_on': '2026-11-20',
        }
        for extra, expected_dates in (
            ({}, {}),
            ({'dates': {'published': '2017-05-09'}},
             {'dates': {'published': {'value': '2017-05-09', 'precision': 'day'}}}),
        ):
            document, = saved_results([{**capture, **extra}], 'ready.example', {'ready company'})
            self.assertTrue(document['review_required'])
            self.assertEqual(document['observations'], [{
                **capture, **expected_dates, 'bucket': 'round_lead', 'signals': ['round_mention'],
            }])
        for excerpt in (capture['excerpt'], capture['excerpt'].replace(' announced yesterday ', ' announced ')):
            document, = saved_results(
                [{**capture, 'excerpt': excerpt, 'acquisition': 'search_result'}], 'ready.example', {'ready company'},
            )
            self.assertTrue(document['review_required'])
            self.assertEqual(document['bucket'], 'context')
            self.assertNotIn('round_mention', document['observations'][0]['signals'])

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

    def test_investor_plans_for_a_possessive_seed_stay_out_of_round_leads(self):
        names = {'ready company'}
        for excerpt in (
            "The investors plan to close Ready Company's seed round if approval is granted.",
            "Investors announced plans to complete Ready Company's seed round.",
            'Northstar investors intend to complete Ready Company’s seed round.',
            'Investors announced their intention to jointly complete Ready Company’s seed round.',
            'Northstar was expected to close Ready Company’s seed investment.',
            'Cedar Capital will close Ready Company’s US$3.2 million seed financing round.',
            'Northstar might complete Ready Company’s pre-seed round if the board approves.',
            'The investors are planning to jointly close Ready Company’s $3.2 million seed investment.',
            'Investors are scheduled to complete Ready Company’s seed round.',
            'Northstar investors will be closing Ready Company’s seed round next week.',
            'Northstar plans to complete due diligence and will close Ready Company’s seed round.',
            'Investors anticipate closing Ready Company’s seed round next month.',
            'Investors expect to successfully close Ready Company’s seed round.',
            'Investors are preparing to close Ready Company’s seed round.',
            'Investors anticipated jointly completing Ready Company’s seed round.',
            'Investors are preparing to complete Ready Company’s US$3.2 million pre-seed round.',
            'Investors agreed to close Ready Company’s seed round next week.',
            'Investors had agreed to close Ready Company’s seed round.',
            'Investors agree to jointly complete Ready Company’s US$3.2 million pre-seed round.',
            'Investors agreed to close Ready Company’s seed round next week. Bright Labs closed its seed round.',
        ):
            with self.subTest(excerpt=excerpt):
                self.assertNotIn('round_mention', classify(excerpt, names)[1])

    def test_possessive_seed_plan_guard_preserves_independent_completed_rounds(self):
        names = {'ready company'}
        for excerpt in (
            'Northstar and Cedar today completed Ready Company’s seed round initiated the prior year.',
            'Ready Company completed its seed round.',
            'Northstar Capital completed Ready Company’s US$3.2 million seed financing round.',
            'Northstar, which plans to complete distribution, completed Ready Company’s seed round.',
            'After announcing plans to complete, Ready Company’s seed round was completed.',
            'Ready Company’s seed funding round was completed after investors outlined plans to expand distribution.',
            'Northstar plans to complete a trial. Investors completed Ready Company’s seed round.',
            'Northstar expects to complete Bright Labs’ seed round. Ready Company completed its seed round.',
            'Northstar plans to complete Ready Company’s seed round. Ready Company closed its Series A.',
            'Northstar plans to complete Ready Company’s pre-seed round and Cedar completed Ready Company’s seed round.',
            'Investors completed Ready Company’s seed round last month after preparing for the close.',
            'Investors, who anticipate closing Bright Labs’ seed round, completed Ready Company’s seed round.',
            'After preparing to close, Ready Company’s seed round was completed.',
            'Investors expect to successfully close Bright Labs’ seed round. Ready Company completed its seed round.',
            'Investors completed Ready Company’s seed round last month after agreeing to close.',
            'Investors agreed to close Ready Company’s seed round next week. Ready Company closed its seed round a week later.',
            'After investors agreed to close, Ready Company’s seed round was completed.',
        ):
            with self.subTest(excerpt=excerpt):
                self.assertIn('round_mention', classify(excerpt, names)[1])

    def test_seed_contributions_stay_in_backing_context(self):
        for excerpt in (
            'Individual investors contributed $600,000 to Ready Company’s seed round.',
            'Northstar contributed a combined A$600,000 to Ready Company’s pre-seed financing round.',
            'Northstar contributed US$0.6 million to Ready Company’s seed investment.',
            'Northstar contributed $600,000 toward Ready Company’s seed round.',
            'Northstar contributed a total of $600,000 to Ready Company’s seed round.',
            'Northstar contributed a further $600,000 to Ready Company’s seed round.',
            'Northstar contributed an additional $600,000 to Ready Company’s seed round.',
            'Northstar contributed $600,000 as part of Ready Company’s seed round.',
            'Northstar contributed $600,000 to Ready Company’s $8.6 million seed round.',
            'Northstar contributed to Ready Company’s seed round.',
            'Northstar contributed $600,000 to Ready Company’s seed round. Bright Labs closed its seed round.',
        ):
            with self.subTest(excerpt=excerpt):
                self.assertEqual(classify(excerpt, {'ready company'}), ('context', ['backing_context']))

    def test_seed_contributions_preserve_independent_full_round_closings(self):
        partial = 'Northstar contributed $600,000 to Ready Company’s seed round.'
        issuer_close = 'Ready Company closed its $8.6 million seed round.'
        investors_close = 'Investors completed Ready Company’s seed round.'
        expected = ('early_round_lead', ['round_mention', 'early_stage_mention'])
        for excerpt in (
            issuer_close,
            investors_close,
            f'{partial} {issuer_close}',
            f'{issuer_close} {partial}',
            f'{partial[:-1]} and {issuer_close}',
            f'{partial[:-1]} and a separate syndicate completed Ready Company’s seed round.',
            f'Northstar contributed a total of $600,000 toward Ready Company’s $8.6 million seed round. {issuer_close}',
            f'Northstar contributed a further $600,000 as part of Ready Company’s seed round and {issuer_close}',
            'Northstar contributed $600,000 to Bright Labs’ pilot and Ready Company closed its seed round.',
        ):
            with self.subTest(excerpt=excerpt):
                self.assertEqual(classify(excerpt, {'ready company'}), expected)

    def test_relative_seed_close_requires_a_saved_named_completion(self):
        names = {'ready company'}
        prefix = 'Northstar contributed $600,000 to Ready Company’s seed round'
        closing = prefix + ', which Ready Company closed later.'
        lead = ('early_round_lead', ['round_mention', 'early_stage_mention'])
        backing = ('context', ['backing_context'])
        retracted = ('context', ['prospective_or_negated', 'backing_context'])
        cases = (
            (closing, lead),
            (closing.replace('closed later', 'closed'), lead),
            (closing.replace('closed later', 'later closed'), lead),
            (prefix + ', which Ready Company plans to close.', ('context', ['prospective_or_negated'])),
            (prefix + ', which Ready Company will later close.', backing),
            (prefix + ', which Bright Labs closed later.', backing),
            (f'“{closing}”', backing),
            (f'An analyst said “Here is a hypothetical. {closing} More follows.”', backing),
            (closing[:-1] + '?', backing),
            (f'If {closing}', backing),
            (f'Suppose {closing}', backing),
            (f'Imagine this. {closing}', backing),
            (closing + ' Ready Company did not close its seed round.', retracted),
            (closing + ' Correction: Ready Company’s seed round was never closed.', retracted),
            (closing + ' Ready Company did not close its pre-seed round.', lead),
            (closing + ' Bright Labs did not close its seed round.', lead),
        )
        for excerpt, expected in cases:
            with self.subTest(excerpt=excerpt):
                self.assertEqual(classify(excerpt, names), expected)
        self.assertEqual(classify(closing, names, search_result=True), backing)

    def test_later_seed_close_requires_a_named_saved_assertion(self):
        names = {'ready company'}
        agreement = 'Investors agreed to close Ready Company’s seed round next week. '
        completion = 'Ready Company later closed its seed round.'
        expected = ('early_round_lead', ['round_mention', 'early_stage_mention'])
        for prefix in ('', agreement):
            with self.subTest(prefix=prefix):
                self.assertEqual(classify(prefix + completion, names), expected)
                self.assertNotIn('round_mention', classify(prefix + completion, names, search_result=True)[1])
                closed_quote = f'An analyst said “no comment.” {completion}'
                self.assertEqual(classify(prefix + closed_quote, names), expected)
            for excerpt in (
                'Ready Company will later close its seed round.',
                'Ready Company plans to later close its seed round.',
                'Bright Labs later closed its seed round.',
                'Ready Company did not later close its seed round.',
                f'“{completion}”',
                f'An analyst wrote “Here is a possible outcome. {completion} More follows.”',
                completion[:-1] + '?',
                'If Ready Company later closed its seed round, investors would join.',
            ):
                with self.subTest(prefix=prefix, excerpt=excerpt):
                    self.assertNotIn('round_mention', classify(prefix + excerpt, names)[1])

    def test_later_seed_close_respects_adjacent_same_issuer_closing_retractions(self):
        agreement = 'Investors agreed to close Ready Company’s seed round next week. '
        completion = 'Ready Company later closed its seed round.'
        cases = (
            ('Ready Company did not close its seed round.', False),
            ('Ready Company didn’t later close its seed round.', False),
            ('Ready Company did not in fact later close its seed round.', False),
            ('Ready Company has not yet closed its seed round.', False),
            ('Correction: Ready Company’s seed round was never closed.', False),
            ('Correction: Ready Company’s seed round did not later close.', False),
            ('Bright Labs did not close its seed round.', True),
            ('Ready Company did not close its pre-seed round.', True),
            ('Correction: Ready Company’s pre-seed round did not later close.', True),
            ('Ready Company did not announce closing its seed round.', True),
            ('“Ready Company did not close its seed round.”', True),
            ('Did Ready Company not close its seed round?', True),
            ('The legal close date was not disclosed.', True),
        )
        for prefix in ('', agreement):
            for correction, is_lead in cases:
                with self.subTest(prefix=prefix, correction=correction):
                    bucket, signals = classify(f'{prefix}{completion} {correction}', {'ready company'})
                    self.assertEqual(bucket, 'early_round_lead' if is_lead else 'context')
                    self.assertEqual('round_mention' in signals, is_lead)

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
