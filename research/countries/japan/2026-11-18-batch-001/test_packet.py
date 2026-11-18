import copy
import json
import unittest
from pathlib import Path
import packet_tools as p


class JapanPacketTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.packet = json.loads((p.HERE / 'companies.json').read_text())
        cls.ledger = json.loads((p.HERE / 'claims.json').read_text())

    def changed(self):
        return copy.deepcopy(self.packet)

    def event(self, packet):
        return next(c['value'] for co in packet['companies'] for c in co['claims'] if c['field'] == 'funding_round' and c['value']['participants'])

    def test_real_packet_and_provenance(self):
        self.assertGreater(p.validate_packet(self.packet)['companies'], 0)
        p.check_sources(self.packet, self.ledger)

    def test_unicode_alias_and_domain_normalization(self):
        self.assertEqual(p.normalized_name('  ＳｍａｒｔＨＲ  '), p.normalized_name('SmartHR'))
        self.assertEqual(p.normalized_host('https://WWW.Example.com:443/about?x=1'), 'example.com')
        self.assertEqual(p.normalized_host('https://example.com/'), 'example.com')
        self.assertNotEqual(p.normalized_host('https://subsidiary.example.com/'), 'example.com')

    def test_duplicate_company_domain_fails(self):
        packet = self.changed()
        packet['companies'][1]['website'] = packet['companies'][0]['website']
        with self.assertRaisesRegex(ValueError, 'duplicate candidate'):
            p.validate_packet(packet)

    def test_unknown_incorporation_is_null(self):
        self.assertTrue(any(c['incorporation'] is None for c in self.packet['companies']))
        packet = self.changed()
        packet['companies'][0]['incorporation'] = {'country': 'JP'}
        with self.assertRaisesRegex(ValueError, 'source references'):
            p.validate_packet(packet)

    def test_partial_dates_never_padded_as_facts(self):
        p.valid_partial_date('2019-10', 'month')
        p.valid_partial_date(None, 'unknown')
        for value, precision in [('2019-10', 'day'), ('2019-13', 'month'), ('2025-02-30', 'day'), (None, 'day')]:
            with self.assertRaises(ValueError):
                p.valid_partial_date(value, precision)

    def test_source_missing_or_unaccessed_fails(self):
        packet = self.changed()
        sid = packet['companies'][0]['claims'][0]['source_ids'][0]
        next(s for s in packet['sources'] if s['id'] == sid)['accessed'] = False
        with self.assertRaisesRegex(ValueError, 'not accessed'):
            p.validate_packet(packet)

    def test_null_amount_does_not_become_zero(self):
        packet = self.changed()
        event = self.event(packet)
        event['amount'] = 0
        event['currency'] = 'JPY'
        with self.assertRaisesRegex(ValueError, 'positive integer'):
            p.validate_packet(packet)
        event['amount'] = None
        event['currency'] = None
        event['numeric_projection_allowed'] = False
        p.validate_packet(packet)

    def test_missing_amount_currency_pair_fails(self):
        packet = self.changed()
        event = self.event(packet)
        event['amount'] = 100
        event['currency'] = None
        with self.assertRaisesRegex(ValueError, 'both be null'):
            p.validate_packet(packet)

    def test_portfolio_is_not_event_participation(self):
        packet = self.changed()
        self.event(packet)['participants'][0]['basis'] = 'portfolio_membership'
        with self.assertRaisesRegex(ValueError, 'portfolio membership'):
            p.validate_packet(packet)

    def test_wrong_round_and_inferred_investor_id_fail(self):
        for field, value in [('round_id', 'different-event'), ('canonical_entity_id', 'partner:invented')]:
            packet = self.changed()
            self.event(packet)['participants'][0][field] = value
            with self.assertRaises(ValueError):
                p.validate_packet(packet)

    def test_duplicate_funding_and_participants_fail(self):
        packet = self.changed()
        event = self.event(packet)
        event['participants'].append(copy.deepcopy(event['participants'][0]))
        with self.assertRaisesRegex(ValueError, 'duplicate participant'):
            p.validate_packet(packet)
        packet = self.changed()
        company = next(co for co in packet['companies'] if any(c['field'] == 'funding_round' for c in co['claims']))
        duplicate = copy.deepcopy(next(c for c in company['claims'] if c['field'] == 'funding_round'))
        duplicate['id'] += ':duplicate-review'
        company['claims'].append(duplicate)
        with self.assertRaisesRegex(ValueError, 'duplicate event ID'):
            p.validate_packet(packet)

    def test_resume_is_idempotent_and_interruption_safe(self):
        ids = [c['id'] for c in self.packet['companies']]
        before = p.checkpoint(self.packet, [])
        partial = p.checkpoint(self.packet, ids[:3])
        self.assertEqual(p.resume(self.packet, before), ids)
        self.assertEqual(p.resume(self.packet, partial), ids[3:])
        self.assertEqual(p.resume(self.packet, partial), ids[3:])
        self.assertEqual(partial, p.checkpoint(self.packet, ids[:3]))
        self.assertFalse(partial['country_complete'])
        self.assertIsNone(partial['national_denominator'])

    def test_resume_rejects_new_input_revision_or_corruption(self):
        mark = p.checkpoint(self.packet, [])
        packet = self.changed()
        packet['base_revision'] = 'a' * 40
        with self.assertRaises(ValueError):
            p.resume(packet, mark)
        packet = self.changed()
        packet['companies'][0]['gaps'].append('new finding')
        with self.assertRaises(ValueError):
            p.resume(packet, mark)
        mark['remaining_ids'] = []
        with self.assertRaises(ValueError):
            p.resume(self.packet, mark)

    def test_research_does_not_grant_crawler_or_publication(self):
        packet = self.changed()
        packet['sources'][0]['crawler_seed_approved'] = True
        with self.assertRaisesRegex(ValueError, 'not source approval'):
            p.validate_packet(packet)
        packet = self.changed()
        packet['delivery_state'] = 'published_verified'
        with self.assertRaisesRegex(ValueError, 'cannot claim publication'):
            p.validate_packet(packet)

    def test_ledger_url_cannot_drift_from_source(self):
        ledger = copy.deepcopy(self.ledger)
        ledger['claims'][0]['source_url'] = 'https://example.com/wrong'
        with self.assertRaisesRegex(ValueError, 'URL drift'):
            p.check_sources(self.packet, ledger)


class JapanPacketAdversarialTests(unittest.TestCase):
    """Small standalone fixtures exercise semantic failures before data assembly."""

    def setUp(self):
        sources = [
            {'id': sid, 'url': url, 'accessed': True, 'crawler_seed_approved': False,
             'retrieved_at': '2026-11-18T00:00:00Z'}
            for sid, url in [('company', 'https://example.com/about'),
                             ('announcement', 'https://example.com/seed')]
        ]
        claims = [
            {'id': 'example-identity', 'field': 'identity',
             'value': {'legal_name': 'Example Inc.', 'registry_identifier': None},
             'source_ids': ['company'], 'evidence': 'Company identifies its legal name.',
             'status': 'reviewed_staged'},
            {'id': 'example-seed-claim', 'field': 'funding_round',
             'value': {'id': 'example-2024-seed', 'stage': 'Seed',
                       'date': '2024-06-20', 'date_precision': 'day',
                       'date_kind': 'announcement', 'original_date_kind': 'announcement',
                       'amount': 1000000, 'currency': 'JPY',
                       'amount_precision': 'reported', 'transaction_kind': 'equity',
                       'amount_scope': 'event_total', 'overlap_status': 'no_known_overlap',
                       'numeric_projection_allowed': True, 'participants': []},
             'source_ids': ['company', 'announcement'],
             'evidence': 'Company explicitly announced the equity seed financing.',
             'status': 'reviewed_staged'},
        ]
        company = {'id': 'staged:jp:example', 'name': 'Example',
                   'website': 'https://example.com/', 'disposition': 'accepted',
                   'disposition_reason': 'Reviewed test fixture', 'incorporation': None,
                   'claims': claims, 'gaps': []}
        self.packet = {'packet_kind': 'japan-country-research-v1',
                       'delivery_state': 'unsubmitted', 'base_revision': 'a' * 40,
                       'sources': sources, 'companies': [company]}
        self.event = claims[1]['value']
        by_id = {s['id']: s for s in sources}
        self.ledger = {'claims': [
            {'canonical_claim_id': claim['id'],
             'claim_id': claim['id'] + ':source:' + source_id,
             'entity_id': company['id'], 'field': claim['field'],
             'value': copy.deepcopy(claim['value']), 'source_id': source_id,
             'source_url': by_id[source_id]['url'], 'evidence': claim['evidence'],
             'status': claim['status']}
            for claim in claims for source_id in claim['source_ids']
        ]}

    def test_complete_multisource_ledger_passes(self):
        p.validate_packet(self.packet)
        p.check_sources(self.packet, self.ledger)

    def test_ledger_nested_value_and_missing_null_fail(self):
        ledger = copy.deepcopy(self.ledger)
        ledger['claims'][-1]['value']['amount'] += 1
        with self.assertRaisesRegex(ValueError, 'ledger value drift'):
            p.check_sources(self.packet, ledger)
        ledger = copy.deepcopy(self.ledger)
        del ledger['claims'][0]['value']['registry_identifier']
        with self.assertRaisesRegex(ValueError, 'ledger value drift'):
            p.check_sources(self.packet, ledger)

    def test_ledger_omitted_secondary_source_fails_even_with_enough_rows(self):
        ledger = copy.deepcopy(self.ledger)
        ledger['claims'].pop()
        self.assertEqual(len(ledger['claims']), len(self.packet['companies'][0]['claims']))
        with self.assertRaisesRegex(ValueError, 'lost an assertion or source binding'):
            p.check_sources(self.packet, ledger)

    def test_ledger_fabricated_and_duplicate_rows_fail(self):
        ledger = copy.deepcopy(self.ledger)
        ledger['claims'][-1]['claim_id'] = 'fabricated:source:announcement'
        with self.assertRaisesRegex(ValueError, 'fabricated ledger claim ID'):
            p.check_sources(self.packet, ledger)
        ledger = copy.deepcopy(self.ledger)
        ledger['claims'][-1] = copy.deepcopy(ledger['claims'][0])
        with self.assertRaisesRegex(ValueError, 'duplicate ledger assertion'):
            p.check_sources(self.packet, ledger)

    def test_ledger_cannot_rebind_subject_field_source_or_status(self):
        for field, value in [('canonical_claim_id', 'example-identity'),
                             ('entity_id', 'staged:jp:different'), ('field', 'founder'),
                             ('source_id', 'company'), ('evidence', 'Unreviewed replacement'),
                             ('status', 'published_verified')]:
            with self.subTest(field=field):
                ledger = copy.deepcopy(self.ledger)
                ledger['claims'][-1][field] = value
                with self.assertRaisesRegex(ValueError, 'ledger .* drift'):
                    p.check_sources(self.packet, ledger)

    def test_numeric_flag_cannot_override_mixed_debt_grant_or_unknown_instrument(self):
        for instrument in ('mixed_equity_and_debt', 'debt', 'grant', 'credit_facility',
                           'venture_financing', 'equity_with_prior_convertible_warrants'):
            with self.subTest(instrument=instrument):
                self.event['transaction_kind'] = instrument
                with self.assertRaisesRegex(ValueError, 'unsafe numeric projection'):
                    p.validate_packet(self.packet)

    def test_numeric_flag_cannot_override_cumulative_unknown_or_overlapping_scope(self):
        for scope in ('cumulative_total', 'overlapping_round_total', 'unknown',
                      'combined_financing_headline', 'incremental_agreements'):
            with self.subTest(scope=scope):
                self.event['amount_scope'] = scope
                with self.assertRaisesRegex(ValueError, 'unsafe numeric projection'):
                    p.validate_packet(self.packet)
        self.event['amount_scope'] = 'event_total'
        for overlap in ('overlapping_total', 'unknown'):
            with self.subTest(overlap=overlap):
                self.event['overlap_status'] = overlap
                with self.assertRaisesRegex(ValueError, 'unsafe numeric projection'):
                    p.validate_packet(self.packet)

    def test_numeric_projection_requires_reported_exact_and_nonnull_amount(self):
        for precision in ('approximate', 'strict_lower_bound', 'converted', 'undisclosed'):
            with self.subTest(precision=precision):
                self.event['amount_precision'] = precision
                with self.assertRaisesRegex(ValueError, 'unsafe numeric projection'):
                    p.validate_packet(self.packet)
        self.event['amount_precision'] = 'reported'
        self.event['amount'] = self.event['currency'] = None
        with self.assertRaisesRegex(ValueError, 'unsafe numeric projection'):
            p.validate_packet(self.packet)

    def test_primary_component_and_incremental_equity_are_explicitly_allowed(self):
        for instrument in ('equity', 'new_share_allotment'):
            for scope, overlap in [('primary_component', 'no_known_overlap'),
                                   ('named_investor_contribution', 'no_known_overlap'),
                                   ('incremental_amount', 'incremental')]:
                with self.subTest(instrument=instrument, scope=scope):
                    self.event.update(transaction_kind=instrument, amount_scope=scope,
                                      overlap_status=overlap)
                    p.validate_packet(self.packet)

    def test_nonprojected_observations_keep_amount_and_unknowns(self):
        self.event.update(transaction_kind='mixed_equity_and_debt',
                          amount_scope='overlapping_round_total',
                          overlap_status='overlapping_total', numeric_projection_allowed=False)
        p.validate_packet(self.packet)
        self.assertEqual(self.event['amount'], 1000000)
        self.event['amount'] = self.event['currency'] = None
        self.event['amount_precision'] = 'undisclosed'
        p.validate_packet(self.packet)
        self.assertIsNone(self.event['amount'])

    def test_permission_and_access_flags_are_booleans(self):
        self.event['numeric_projection_allowed'] = 'false'
        with self.assertRaisesRegex(ValueError, 'explicit boolean'):
            p.validate_packet(self.packet)
        self.event['numeric_projection_allowed'] = True
        self.packet['sources'][0]['accessed'] = 'false'
        with self.assertRaisesRegex(ValueError, 'not accessed'):
            p.validate_packet(self.packet)


if __name__ == '__main__':
    unittest.main()
