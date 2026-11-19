import copy
from hashlib import sha256
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from scripts import stage_early_investments as intake


ROOT = Path(__file__).resolve().parents[1]
EXAMPLE = ROOT / 'research/funding/2026-11-19-psiquantum/manifest.json'
CIK = '0002070804'
VEHICLE = '0002107443'
FIRST = '0001996366-25-000006'
AMENDMENT = '0001996366-25-000007'
SECOND = '0001996366-25-000008'
MISSING = '0001996366-25-000009'


def statement(**updates):
    return {
        'form': 'D', 'primary_issuer': {'cik': CIK, 'name': 'PsiQuantum, Corp.'},
        'co_issuers': [], 'instruments': ['Equity'],
        'first_sale': '2025-05-15', 'offered': {'as_stated': 'Indefinite'},
        'sold': {'as_stated': '$20.00', 'number': '20.00', 'currency': 'USD'},
        **updates,
    }


class EarlyInvestmentTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.path = Path(temp.name) / 'manifest.json'
        self.manifest = json.loads(EXAMPLE.read_bytes())
        self.manifest['inputs'] = []

    def save(self, value, accession=FIRST, *, cik=CIK, filed='2025-05-30', xml=False):
        filename = f'capture-{len(self.manifest["inputs"])}.{"xml" if xml else "json"}'
        content = value if xml else json.dumps(value, ensure_ascii=False).encode()
        (self.path.parent / filename).write_bytes(content)
        url = f'https://www.sec.gov/Archives/edgar/data/{int(cik)}/{accession.replace("-", "")}'
        entry = {
            'file': filename,
            'format': 'sec_form_d_xml' if xml else 'sec_form_d_json',
            'acquisition': 'saved_original' if xml else 'reviewed_public_excerpt',
            'acquired_on': '2026-11-19',
            'url': url + '/primary_doc.xml',
            'sha256': sha256(content).hexdigest(),
            'accession': accession, 'filed_on': filed,
            'filing_index_url': f'{url}/{accession}-index.html',
        }
        self.manifest['inputs'].append(entry)
        return entry

    def report(self):
        self.path.write_text(json.dumps(self.manifest), encoding='utf-8')
        # The normal entry point reads files only, even when their provenance carries live URLs.
        with patch('socket.socket', side_effect=AssertionError('Network access from offline adapter')):
            return intake.stage(self.path)

    def test_reviewed_issuer_excerpt_and_attributed_early_rounds(self):
        report = intake.stage(EXAMPLE)
        self.assertEqual(report['manifest_sha256'], sha256(EXAMPLE.read_bytes()).hexdigest())
        self.assertEqual(report['publication_state'], 'review_only')
        self.assertEqual(report['coverage']['source_population'], 'unknown')
        self.assertEqual(report['coverage']['saved_inputs'], 5)
        filed, = report['filings']
        self.assertEqual(filed['entity'], 'psiquantum-us')
        self.assertEqual(filed['issuer_state'], 'resolved_issuer')
        self.assertEqual(filed['accession'], FIRST)
        self.assertEqual(filed['filed_on'], {'value': '2025-05-30', 'precision': 'day'})
        self.assertEqual(filed['first_sale'], {'value': '2025-05-15', 'precision': 'day'})
        self.assertEqual(filed['sold'], {'as_stated': '$22,000,008', 'number': '22000008', 'currency': 'USD'})
        self.assertEqual(filed['offered'], filed['sold'])
        self.assertEqual(filed['instruments'], ['Equity'])
        self.assertIsNone(filed['named_round_id'])
        self.assertIsNone(filed['stage'])
        self.assertIsNone(filed['participants'])
        self.assertEqual(filed['source']['catalogue_revision'], report['catalogue_revision'])
        self.assertEqual(filed['source']['acquisition'], 'reviewed_public_excerpt')
        source_file = EXAMPLE.parent / filed['source']['file']
        self.assertEqual(filed['source']['sha256'], sha256(source_file.read_bytes()).hexdigest())

        rows = report['observations']
        a, = [row for row in rows if row['stage'] == 'Series A']
        self.assertEqual(a['dates'], {'reported': {'value': '2016', 'precision': 'year'}})
        self.assertEqual(a['participants'], [{'name': 'Playground Global', 'role': 'lead'}])
        self.assertNotIn('amount', a)
        b, = [row for row in rows if row['stage'] == 'Series B']
        self.assertEqual(b['status'], 'unresolved')
        self.assertIsNone(b['participants'])
        dates = [row['dates'] for row in rows if row['stage'] == 'Series C']
        self.assertEqual(dates, [
            {'closed': {'value': '2019-11', 'precision': 'month'}},
            {'announced': {'value': '2020-04', 'precision': 'month'}},
        ])

    def test_aliases_remain_leads_without_an_exact_primary_issuer(self):
        self.save(statement(primary_issuer={'name': 'PsiQuantum'}))
        self.save(statement(primary_issuer={'name': 'PsiQuantum', 'cik': '123'}), AMENDMENT, cik='123')
        report = self.report()
        self.assertEqual([x['issuer_state'] for x in report['filings']], ['ambiguous_alias', 'unresolved_issuer'])
        self.assertEqual(report['filings'][0]['alias_candidates'], ['psiquantum-uk', 'psiquantum-us'])
        self.assertEqual(report['offerings'], [])

    def test_excludes_vehicle_joint_and_pooled_filings(self):
        self.save(statement(primary_issuer={'cik': VEHICLE, 'name': 'Synthetic PsiQuantum vehicle'}), cik=VEHICLE)
        self.save(statement(co_issuers=[{'cik': VEHICLE, 'name': 'Synthetic co-issuer'}]), AMENDMENT)
        self.save(statement(instruments=['Pooled Investment Fund Interests']), SECOND)
        report = self.report()
        self.assertEqual([x['issuer_state'] for x in report['filings']],
                         ['excluded_entity', 'excluded_co_issuers', 'excluded_pooled_fund'])
        self.assertFalse(report['offerings'])

    def test_hold_an_archive_or_registered_name_conflict(self):
        self.save(statement(), cik=VEHICLE)
        self.save(statement(primary_issuer={'cik': CIK, 'name': 'Another operating company'}), AMENDMENT)
        self.assertEqual([x['issuer_state'] for x in self.report()['filings']], ['issuer_conflict'] * 2)

    def test_amendments_in_any_input_order_keep_one_current_statement_and_no_sum(self):
        self.save(statement(form='D/A', previous_accession=AMENDMENT,
                            sold={'as_stated': '$30', 'number': '30', 'currency': 'USD'}), SECOND, filed='2025-07-01')
        self.save(statement(), FIRST)
        self.save(statement(form='D/A', previous_accession=FIRST,
                            sold={'as_stated': '$25', 'number': '25', 'currency': 'USD'}), AMENDMENT, filed='2025-06-01')
        report = self.report()
        offering, = report['offerings']
        self.assertEqual(offering['accessions'], [FIRST, AMENDMENT, SECOND])
        self.assertEqual(offering['latest_in_saved_chain'], SECOND)
        self.assertEqual(offering['lineage_state'], 'single_chain')
        self.assertEqual({row['accession']: row['sold']['number'] for row in report['filings']},
                         {FIRST: '20.00', AMENDMENT: '25', SECOND: '30'})
        self.assertNotIn('sold', offering)
        self.assertNotIn('total', report)

    def test_sibling_amendments_and_missing_previous_stay_visible(self):
        self.save(statement())
        self.save(statement(form='D/A', previous_accession=FIRST), AMENDMENT)
        self.save(statement(form='D/A', previous_accession=FIRST), SECOND, filed='2025-07-01')
        lonely = '0001996366-25-000015'
        self.save(statement(form='D/A', previous_accession=MISSING), lonely)
        report = self.report()
        offering, = report['offerings']
        self.assertEqual(offering['lineage_state'], 'branch_conflict')
        self.assertIsNone(offering['latest_in_saved_chain'])
        self.assertEqual(report['filings'][-1]['lineage_state'], 'missing_previous_filing')

    def test_wrong_entity_or_cyclic_amendment_never_joins_an_offering(self):
        self.save(statement(form='D/A', previous_accession=AMENDMENT))
        self.save(statement(form='D/A', previous_accession=FIRST), AMENDMENT)
        self.save(statement(primary_issuer={'cik': VEHICLE, 'name': 'Synthetic vehicle'}), SECOND, cik=VEHICLE)
        self.save(statement(form='D/A', previous_accession=SECOND), MISSING)
        report = self.report()
        self.assertEqual([x['lineage_state'] for x in report['filings']],
                         ['cyclic_lineage', 'cyclic_lineage', 'outside_resolved_issuer', 'lineage_conflict'])
        self.assertFalse(report['offerings'])

    def test_untagged_round_guesses_are_rejected_as_filing_fields(self):
        for key, value in [('stage', 'Series E'), ('participants', ['Named venture firm']), ('named_round_id', 'round-a')]:
            self.manifest['inputs'] = []
            self.save(statement(**{key: value}))
            with self.subTest(key=key), self.assertRaisesRegex(ValueError, 'Expected fields'):
                self.report()

    def test_digest_and_accession_both_bind_the_saved_input(self):
        entry = self.save(statement())
        (self.path.parent / entry['file']).write_text('{"unreviewed":"change"}', encoding='utf-8')
        with self.assertRaisesRegex(ValueError, 'digest mismatch'):
            self.report()
        self.manifest['inputs'] = []
        entry = self.save(statement())
        entry['accession'] = AMENDMENT
        with self.assertRaisesRegex(ValueError, 'accession directory'):
            self.report()

    def test_dates_stay_precise_and_calendar_checked(self):
        self.assertEqual(intake.date_observation('2020'), {'value': '2020', 'precision': 'year'})
        self.assertEqual(intake.date_observation('2020-02'), {'value': '2020-02', 'precision': 'month'})
        for bad in ('2019-02-29', '2020-02-00', '2020-00'):
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                intake.date_observation(bad)
        self.save(statement(first_sale='2020-02'))
        with self.assertRaisesRegex(ValueError, 'exact day'):
            self.report()

    def test_saved_xml_keeps_pending_sale_equity_and_unknown_currency(self):
        raw = b'''<edgarSubmission xmlns="http://www.sec.gov/edgar/formd">
          <submissionType>D</submissionType><testOrLive>LIVE</testOrLive>
          <primaryIssuer><cik>2070804</cik><entityName>PsiQuantum, Corp.</entityName></primaryIssuer>
          <offeringData>
            <typeOfFiling><dateOfFirstSale><yetToOccur>true</yetToOccur></dateOfFirstSale></typeOfFiling>
            <typesOfSecuritiesOffered><isEquityType>true</isEquityType></typesOfSecuritiesOffered>
            <offeringSalesAmounts><totalOfferingAmount>Indefinite</totalOfferingAmount><totalAmountSold>0</totalAmountSold></offeringSalesAmounts>
          </offeringData></edgarSubmission>'''
        self.save(raw, xml=True)
        filed, = self.report()['filings']
        self.assertEqual(filed['issuer_state'], 'resolved_issuer')
        self.assertIsNone(filed['first_sale'])
        self.assertEqual(filed['first_sale_state'], 'pending')
        self.assertEqual(filed['instruments'], ['Equity'])
        self.assertEqual(filed['offered'], {'as_stated': 'Indefinite', 'number': None, 'currency': None})
        self.assertEqual(filed['sold'], {'as_stated': '0', 'number': '0', 'currency': None})

    def test_xml_amendment_preserves_the_explicit_predecessor(self):
        self.save(statement())
        raw = f'''<edgarSubmission>
          <submissionType>D/A</submissionType>
          <primaryIssuer><cik>{CIK}</cik><entityName>PsiQuantum, Corp.</entityName></primaryIssuer>
          <offeringData><typeOfFiling><newOrAmendment><isAmendment>true</isAmendment>
            <previousAccessionNumber>{FIRST}</previousAccessionNumber>
          </newOrAmendment></typeOfFiling></offeringData>
          </edgarSubmission>'''.encode()
        self.save(raw, AMENDMENT, xml=True, filed='2025-07-01')
        report = self.report()
        self.assertEqual(report['filings'][1]['previous_accession'], FIRST)
        self.assertEqual(report['offerings'][0]['latest_in_saved_chain'], AMENDMENT)
        self.assertIsNone(report['filings'][1]['sold'])

    def test_xml_with_unknown_joint_issuer_structure_fails_closed(self):
        raw = b'''<edgarSubmission><submissionType>D</submissionType>
          <primaryIssuer><cik>2070804</cik><entityName>PsiQuantum, Corp.</entityName></primaryIssuer>
          <coIssuerList><unknown /></coIssuerList></edgarSubmission>'''
        self.save(raw, xml=True)
        with self.assertRaisesRegex(ValueError, 'co-issuer XML structure'):
            self.report()

    def test_duplicate_accessions_fail_instead_of_multiplying_offerings(self):
        entry = self.save(statement())
        self.manifest['inputs'].append(copy.deepcopy(entry))
        with self.assertRaisesRegex(ValueError, 'Duplicate SEC accession'):
            self.report()
