#!/usr/bin/env python3
"""Focused in-memory corruption tests; no evidence files are modified."""
from copy import deepcopy
import sys
import unittest

sys.dont_write_bytecode = True

from validate_packet import (
    ACCEPTED, EXCLUDED, HERE, OWNED_PATH, canonical_hash, load_packet,
    normalize_name, normalized_domain, validate_legacy, validate_packet,
)


class PacketTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.valid_packet = load_packet()

    def reject(self, change, code):
        changed = deepcopy(self.valid_packet)
        change(changed)
        result = validate_packet(changed, check_schema=False, check_legacy=False)
        self.assertFalse(result['valid'], 'Corruption was silently accepted')
        self.assertIn(code, {error['code'] for error in result['errors']}, result['errors'])

    @staticmethod
    def claim(packet, *, field=None, state=None):
        return next(c for c in packet['claims.json']['claims']
                    if (field is None or c['field'] == field)
                    and (state is None or c['status'] == state))

    def test_valid_packet_and_actual_production_schema(self):
        result = validate_packet(self.valid_packet, changed_paths=[OWNED_PATH + 'validate_packet.py'])
        self.assertTrue(result['valid'], result['errors'])
        self.assertTrue(result['legacy_validator']['valid'])
        self.assertEqual(result['legacy_validator']['records'], 19)
        self.assertIn('six JSON Schema envelopes with format checking', result['checks'])

    def test_missing_currency_cannot_pass_with_numeric_amount(self):
        def change(packet):
            event = next(e for e in packet['funding.staged.json']['events'] if e['amount'])
            event['currency'] = None
        self.reject(change, 'MONEY_PAIR')

    def test_unknown_financing_cannot_become_zero_even_with_mirrors_changed(self):
        def change(packet):
            event = next(e for e in packet['funding.staged.json']['events'] if e['amount'] is None)
            claim = next(c for c in packet['claims.json']['claims'] if c['claim_id'] == event['claim_id'])
            for value in (event, event['original_claim_value'], claim['value']):
                value['amount'], value['currency'] = 0, 'USD'
        self.reject(change, 'UNKNOWN_ZERO')

    def test_unknown_headcount_cannot_become_zero(self):
        self.reject(lambda packet: self.claim(packet, field='headcount', state='unsearched').update(value=0),
                    'UNKNOWN_ZERO')

    def test_missing_source_is_rejected(self):
        self.reject(lambda packet: self.claim(packet, state='reviewed_staged').update(source_id='missing-source'),
                    'SOURCE_MISSING')

    def test_source_url_cannot_be_rebound_to_another_registered_page(self):
        def change(packet):
            claim = self.claim(packet, state='reviewed_staged')
            claim['source_url'] = next(s['url'] for s in packet['sources.json']['sources']
                                       if s['url'] != claim['source_url'])
        self.reject(change, 'SOURCE_BINDING')

    def test_failed_access_cannot_support_reviewed_claim(self):
        def change(packet):
            claim = self.claim(packet, state='reviewed_staged')
            source = next(s for s in packet['sources.json']['sources'] if s['source_id'] == claim['source_id'])
            source['accessed'] = False
        self.reject(change, 'SOURCE_ACCESS')

    def test_participant_cannot_reference_missing_event(self):
        def change(packet):
            self.claim(packet, field='round_participant')['value']['event_id'] = 'unresolved:funding:missing'
        self.reject(change, 'EVENT_REF')

    def test_participant_cannot_move_to_another_company(self):
        def change(packet):
            claim = self.claim(packet, field='round_participant')
            other = next(e for e in packet['funding.staged.json']['events'] if e['company_id'] != claim['entity_id'])
            claim['value']['event_id'] = other['event_id']
        self.reject(change, 'EVENT_COMPANY')

    def test_portfolio_membership_cannot_become_round_participation(self):
        def change(packet):
            self.claim(packet, field='round_participant')['value']['participation_scope'] = 'portfolio_only'
        self.reject(change, 'PARTICIPATION_EVIDENCE')

    def test_portfolio_only_evidence_is_not_an_explicit_round_claim(self):
        def change(packet):
            self.claim(packet, field='round_participant')['evidence'] = 'Portfolio membership only.'
        self.reject(change, 'PARTICIPATION_EVIDENCE')

    def test_canonical_investor_edges_remain_forbidden(self):
        def change(packet):
            packet['funding.staged.json']['events'][0]['participants'][0]['canonical_investor_id'] = 'partner:unreviewed-investor'
        self.reject(change, 'CANONICAL_EDGE')

    def test_founding_conflict_cannot_be_hidden_by_legacy_year(self):
        def change(packet):
            company = next(c for c in packet['companies.staged.json']['companies'] if c['founded'].get('status') == 'conflict')
            record = next(r for r in packet['records.staged.json']['startups'] if r['name'] == company['name'])
            record['founded_year'] = 2018
        self.reject(change, 'FOUNDING_CONFLICT')

    def test_founding_precision_rejects_invented_day(self):
        def change(packet):
            company = next(c for c in packet['companies.staged.json']['companies'] if c['founded']['precision'] == 'month')
            company['founded']['value'] += '-01'
        self.reject(change, 'DATE_PRECISION')

    def test_alias_collision_is_rejected(self):
        def change(packet):
            companies = packet['companies.staged.json']['companies']
            companies[1]['aliases'].append({'name':companies[0]['name'], 'type':'reported_alias'})
        self.reject(change, 'IDENTITY_COLLISION')

    def test_domain_collision_is_rejected(self):
        def change(packet):
            companies = packet['companies.staged.json']['companies']
            companies[1]['canonical_domain'] = companies[0]['canonical_domain']
            companies[1]['website'] = companies[0]['website']
        self.reject(change, 'DOMAIN_COLLISION')

    def test_baseline_identity_cannot_be_staged_as_new(self):
        def change(packet):
            packet['companies.staged.json']['companies'][0]['aliases'].append({
                'name':packet['baseline.json']['startup_inventory'][0]['name'], 'type':'reported_alias'})
        self.reject(change, 'BASELINE_DUPLICATE')

    def test_changed_queue_hash_is_rejected(self):
        self.reject(lambda packet: packet['queue.json']['checkpoint'].update(worklist_sha256='0' * 64),
                    'QUEUE_HASH')

    def test_changed_worklist_cannot_reuse_checkpoint(self):
        def change(packet):
            packet['queue.json']['company_worklist'][-1]['name'] = 'Changed queued company'
        self.reject(change, 'QUEUE_HASH')

    def test_cursor_cannot_skip_queued_company(self):
        def change(packet):
            queue = packet['queue.json']
            skipped = queue['checkpoint']['next_index'] + 1
            queue['checkpoint'].update(next_index=skipped,
                                       cursor=f'{canonical_hash(queue["company_worklist"])}:{skipped}',
                                       next_item_id=queue['company_worklist'][skipped]['item_id'])
        self.reject(change, 'QUEUE_CURSOR')

    def test_rejected_company_cannot_enter_projection(self):
        def change(packet):
            excluded = next(c for c in packet['companies.staged.json']['companies'] if c['disposition'] == EXCLUDED)
            record = deepcopy(packet['records.staged.json']['startups'][0])
            record['name'] = excluded['name']
            record['website'] = excluded['website']
            record.pop('funding_rounds', None)
            record.pop('founders', None)
            packet['records.staged.json']['startups'].append(record)
        self.reject(change, 'PROJECTION_EXCLUDED')

    def test_tranche_cannot_reference_another_company(self):
        def change(packet):
            event = next(e for e in packet['funding.staged.json']['events'] if e['related_event'])
            other = next(e for e in packet['funding.staged.json']['events'] if e['company_id'] != event['company_id'])
            event['related_event']['event_id'] = other['event_id']
        self.reject(change, 'TRANCHE_COMPANY')

    def test_components_must_reconcile_to_total(self):
        def change(packet):
            event = next(e for e in packet['funding.staged.json']['events'] if e['components'])
            event['components'][0]['amount'] += 1
        self.reject(change, 'TRANCHE_TOTAL')

    def test_tranche_relationship_cannot_disappear_in_projection(self):
        def change(packet):
            event = next(e for e in packet['funding.staged.json']['events'] if e['related_event'])
            event['related_event'] = None
        self.reject(change, 'TRANCHE_PROJECTION')

    def test_facility_capacity_cannot_be_projected_as_cash_raised(self):
        def change(packet):
            event = next(e for e in packet['funding.staged.json']['events'] if e['amount_measure'] == 'facility_capacity')
            event_suffix = event['event_id'].removeprefix('unresolved:funding:')
            round_record = next(f for r in packet['records.staged.json']['startups']
                                for f in r.get('funding_rounds', []) if f['id'] == event_suffix)
            round_record.update(amount=event['amount'], currency=event['currency'])
        self.reject(change, 'FACILITY_CAPACITY')

    def test_manifest_counts_are_recomputed(self):
        self.reject(lambda packet: packet['manifest.json']['counts'].update(company_claims=1), 'COUNT_MISMATCH')

    def test_changed_baseline_requires_new_deduplication(self):
        def change(packet):
            packet['_actual_input_hashes']['data/startup-research.json'] = '0' * 64
        self.reject(change, 'BASELINE_HASH')

    def test_country_scope_rejects_parent_path(self):
        self.reject(lambda packet: packet['manifest.json'].update(owned_path='../other-country/'), 'FILE_SCOPE')

    def test_production_file_changes_fail_scope_check(self):
        result = validate_packet(self.valid_packet, check_schema=False, check_legacy=False,
                                 changed_paths=['data/startup-research.json'])
        self.assertIn('FILE_SCOPE', {e['code'] for e in result['errors']})

    def test_research_source_cannot_approve_itself_for_crawling(self):
        self.reject(lambda packet: packet['sources.json']['sources'][0].update(crawler_seed_approved=True),
                    'SOURCE_APPROVAL')

    def test_legacy_bridge_uses_real_additional_property_rule(self):
        document = deepcopy(self.valid_packet['records.staged.json'])
        document['startups'][0]['investors'] = ['unsupported schema expansion']
        result = validate_legacy(document)
        self.assertFalse(result['valid'])
        self.assertTrue(any('not supported' in error['message'] for error in result['errors']))

    def test_normalization_examples(self):
        self.assertEqual(normalize_name('Péter Fankhauser'), 'peter-fankhauser')
        self.assertEqual(normalize_name('  Swiss–Mile  '), 'swissmile')
        self.assertEqual(normalized_domain('https://WWW.ANYBOTICS.COM/anything'), 'anybotics.com')


if __name__ == '__main__':
    unittest.main(verbosity=2)
