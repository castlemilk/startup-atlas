"""Adversarial packet checks; all fixtures are local and synthetic."""
from copy import deepcopy
import hashlib
import json
from pathlib import Path
import tempfile
import unittest

import validate_packet as checks


def fixture():
    timestamp = '2026-11-18T09:00:00Z'
    source = {'source_id':'test-source','url':'https://example.org/announcement','access_status':'accessed',
              'retrieved_at':timestamp,'crawler_seed_approved':False,'source_kind':'primary_investor'}
    event = {'id':'fixture-series-a','stage':'Series A','transaction_kind':'equity',
             'announced_on':'2025-04-12','announced_precision':'day','amount':1000000,'currency':'EUR',
             'amount_qualifier':'exact','source_ids':['test-source'],
             'participants':[{'name':'Example Fund','role':'lead','source_ids':['test-source']}]}
    company = {'entity_id':'staged:tr:fixture','name':'Fixture','website':'https://example.org/',
               'aliases':[],'description':'Synthetic company, never proposed.', 'headquarters':None,
               'incorporation':None,'founded':None,'founders':[],'funding_events':[event],
               'field_dispositions':{k:{'status':'unsearched','reason':'Not part of this fixture.'}
                                     for k in ['headquarters','incorporation','founded','founders']}}
    claim = {'claim_id':'test-participation','entity_id':company['entity_id'],'field':'round_participant',
             'value':{'event_id':event['id'],'name':'Example Fund','role':'lead'},'source_id':source['source_id'],
             'source_url':source['url'],'source_kind':'primary_investor','accessed':True,
             'retrieved_at':timestamp,'reviewed_at':timestamp,'status':'reviewed_staged',
             'evidence':'Synthetic fixture explicitly states lead participation.','publication_state':'unsubmitted'}
    event_claim = {**deepcopy(claim), 'claim_id':'test-event', 'field':'funding_round',
                   'value':{'event_id':event['id'],'company_id':company['entity_id'],
                            'transaction_kind':'equity','stage':'Series A','announced_on':'2025-04-12',
                            'announced_precision':'day','closed_on':None,'amount':1000000,'currency':'EUR'},
                   'evidence':'Synthetic investor announcement explicitly reports this Series A round, amount, currency and day.'}
    record = {'name':company['name'],'website':company['website'],'description':company['description'],
              'source':source['url'],'reviewed_at':'2026-11-18','funding_rounds':[
                  {'id':event['id'],'stage':'Series A','source':source['url'],'announced_on':'2025-04-12',
                   'amount':1000000,'currency':'EUR'}]}
    return {'companies':[company],'sources':[source],'claims':[claim,event_claim],'records':[record]}


def change_event(data, **values):
    """Change a synthetic event and its supporting fact together."""
    data['companies'][0]['funding_events'][0].update(values)
    data['claims'][1]['value'].update(values)


def alternate_claim(data, field, value):
    """Add a second source without inheriting facts from the first."""
    source={**deepcopy(data['sources'][0]),'source_id':'other-source','url':'https://example.net/release'}
    data['sources'].append(source)
    data['companies'][0]['funding_events'][0]['source_ids'].append(source['source_id'])
    claim={**deepcopy(data['claims'][1]),'claim_id':'other-claim','field':field,'value':value,
           'source_id':source['source_id'],'source_url':source['url']}
    data['claims'].append(claim)
    return source,claim


class EvidenceTests(unittest.TestCase):
    def test_positive_fixture(self):
        self.assertTrue(checks.validate_data(**fixture())['valid'])

    def reject(self, mutate):
        data=fixture(); mutate(data)
        with self.assertRaises(ValueError): checks.validate_data(**data)

    def test_unknown_amount_does_not_become_zero(self):
        self.reject(lambda d:d['companies'][0]['funding_events'][0].update(amount=0))

    def test_numeric_amount_requires_explicit_currency(self):
        self.reject(lambda d:d['companies'][0]['funding_events'][0].update(currency=None))

    def test_undisclosed_amount_cannot_have_numeric_value(self):
        self.reject(lambda d:d['companies'][0]['funding_events'][0].update(amount_qualifier='undisclosed'))

    def test_null_amount_survives_without_zero_projection(self):
        d=fixture(); d['companies'][0]['funding_events'][0].update(amount=None,currency=None,amount_qualifier='unknown')
        d['records'][0]['funding_rounds'][0].pop('amount'); d['records'][0]['funding_rounds'][0].pop('currency')
        self.assertTrue(checks.validate_data(**d)['valid'])

    def test_missing_dimension_is_not_known_empty(self):
        self.reject(lambda d:d['companies'][0]['field_dispositions'].pop('founders'))

    def test_null_assertion_is_not_a_reviewed_fact(self):
        self.reject(lambda d:d['claims'][0].update(value=None))

    def test_search_snippet_is_not_reviewed_evidence(self):
        self.reject(lambda d:d['claims'][0].update(accessed=False))

    def test_unavailable_source_cannot_support_reviewed_claim(self):
        self.reject(lambda d:d['sources'][0].update(access_status='unavailable'))

    def test_source_reference_must_match_exact_url(self):
        self.reject(lambda d:d['claims'][0].update(source_url='https://example.org/other'))

    def test_discovery_does_not_approve_crawler_seed(self):
        self.reject(lambda d:d['sources'][0].update(crawler_seed_approved=True))

    def test_portfolio_membership_is_not_event_participation(self):
        self.reject(lambda d:d['claims'][0].update(field='portfolio_membership'))

    def test_participant_cannot_point_to_other_event(self):
        self.reject(lambda d:d['claims'][0]['value'].update(event_id='unrelated-series-b'))

    def test_participant_has_its_own_evidence_source(self):
        self.reject(lambda d:d['companies'][0]['funding_events'][0]['participants'][0].update(source_ids=['missing']))

    def test_partial_date_cannot_be_padded_for_projection(self):
        self.reject(lambda d:change_event(d,announced_on='2025-04',announced_precision='month'))

    def test_partial_date_is_preserved_without_exact_day(self):
        d=fixture(); change_event(d,announced_on='2025-04',announced_precision='month')
        d['records'][0]['funding_rounds'][0].pop('announced_on')
        self.assertTrue(checks.validate_data(**d)['valid'])

    def test_acquisition_value_cannot_enter_funding_metric(self):
        d=fixture();change_event(d,transaction_kind='acquisition')
        d['claims'][1]['field']='ownership_transaction'
        with self.assertRaisesRegex(ValueError,'Only equity or sourced rounds'):
            checks.validate_data(**d)

    def test_currency_is_not_silently_converted(self):
        self.reject(lambda d:d['records'][0]['funding_rounds'][0].update(currency='USD'))

    def test_duplicate_claim_id_fails(self):
        self.reject(lambda d:d['claims'].append(deepcopy(d['claims'][0])))

    def test_duplicate_round_id_fails(self):
        self.reject(lambda d:d['companies'][0]['funding_events'].append(deepcopy(d['companies'][0]['funding_events'][0])))

    def test_debt_secondary_and_actual_mixed_kind_are_not_projected(self):
        for kind in ['debt','secondary','tender','mixed','mixed_equity_secondary_and_debt','grant']:
            d=fixture();change_event(d,transaction_kind=kind);d['claims'][1]['field']='financial_transaction'
            with self.subTest(kind=kind),self.assertRaisesRegex(ValueError,'Only equity or sourced rounds'):
                checks.validate_data(**d)

    def test_non_round_is_not_projected_even_without_an_amount(self):
        d=fixture();change_event(d,transaction_kind='acquisition',amount=None,currency=None)
        d['claims'][1]['field']='ownership_transaction'
        d['records'][0]['funding_rounds'][0].pop('amount');d['records'][0]['funding_rounds'][0].pop('currency')
        with self.assertRaisesRegex(ValueError,'Only equity or sourced rounds'):
            checks.validate_data(**d)

    def test_unspecified_instrument_is_allowed_for_a_sourced_round(self):
        d=fixture();change_event(d,transaction_kind='unspecified')
        self.assertTrue(checks.validate_data(**d)['valid'])

    def test_corporate_event_cannot_masquerade_as_unspecified_round(self):
        d=fixture();change_event(d,transaction_kind='unspecified');d['claims'][1]['field']='corporate_event'
        with self.assertRaisesRegex(ValueError,'financing-round evidence'):
            checks.validate_data(**d)

    def test_projected_stage_must_be_specified(self):
        for stage in [None,'unspecified','UNSPECIFIED','']:
            d=fixture();change_event(d,stage=stage);d['records'][0]['funding_rounds'][0]['stage']=stage
            with self.subTest(stage=stage),self.assertRaisesRegex(ValueError,'sourced, specified stage'):
                checks.validate_data(**d)

    def test_projected_stage_must_equal_reviewed_event(self):
        d=fixture();d['records'][0]['funding_rounds'][0]['stage']='Series B'
        with self.assertRaisesRegex(ValueError,'changes the funding stage'):
            checks.validate_data(**d)

    def test_participant_role_cannot_be_promoted_to_lead(self):
        d=fixture();d['claims'][0]['value']['role']='participant'
        with self.assertRaisesRegex(ValueError,'Participant role or source'):
            checks.validate_data(**d)

    def test_claim_source_kind_must_match_registry(self):
        d=fixture();d['sources'][0]['source_kind']='discovery'
        with self.assertRaisesRegex(ValueError,'Claim/source kind mismatch'):
            checks.validate_data(**d)

    def test_accepted_review_cannot_precede_retrieval(self):
        d=fixture();d['claims'][0]['retrieved_at']='2026-11-18T09:00:01Z'
        with self.assertRaisesRegex(ValueError,'review cannot precede'):
            checks.validate_data(**d)

    def test_review_order_compares_instants_across_timezone_offsets(self):
        d=fixture();d['claims'][0]['reviewed_at']='2026-11-18T10:00:00+01:00'
        self.assertTrue(checks.validate_data(**d)['valid'])

    def test_unknown_claim_entity_is_rejected(self):
        d=fixture();d['claims'].append({**deepcopy(d['claims'][0]),'claim_id':'orphan',
                                      'entity_id':'staged:tr:held','field':'description','value':'Held research'})
        with self.assertRaisesRegex(ValueError,'undeclared entity'):
            checks.validate_data(**d)

    def test_declared_held_or_ecosystem_claim_is_allowed(self):
        d=fixture();d['context_entity_ids']=['staged:tr:held']
        d['claims'].append({**deepcopy(d['claims'][0]),'claim_id':'held',
                            'entity_id':'staged:tr:held','field':'description','value':'Held research'})
        self.assertTrue(checks.validate_data(**d)['valid'])

    def test_founder_and_geography_sources_must_be_registered(self):
        for dimension,value in [
                ('founders',[{'name':'Unproven Founder','source_ids':['missing']}]),
                ('founded',{'value':'2020','precision':'year','source_ids':['missing']}),
                ('headquarters',{'city':'Istanbul','source_ids':['missing']}),
                ('incorporation',{'legal_name':'Example A.S.','source_ids':['missing']})]:
            d=fixture();d['companies'][0][dimension]=value
            with self.subTest(dimension=dimension),self.assertRaisesRegex(ValueError,'source is not registered'):
                checks.validate_data(**d)

    def test_invalid_closing_date_is_rejected(self):
        d=fixture();change_event(d,closed_on='2025-99-99',closed_precision='day')
        with self.assertRaises(ValueError):checks.validate_data(**d)

    def test_closing_date_requires_precision(self):
        d=fixture();change_event(d,closed_on='2025-04-11')
        with self.assertRaisesRegex(ValueError,'Unknown date precision'):
            checks.validate_data(**d)

    def test_close_before_announcement_is_valid_when_sourced(self):
        d=fixture();change_event(d,closed_on='2025-04-11',closed_precision='day')
        self.assertTrue(checks.validate_data(**d)['valid'])

    def test_closing_date_needs_matching_reviewed_evidence(self):
        d=fixture();d['companies'][0]['funding_events'][0].update(closed_on='2025-04-11',closed_precision='day')
        with self.assertRaisesRegex(ValueError,'closing date/precision has no matching'):
            checks.validate_data(**d)

    def test_event_cannot_exist_from_participant_evidence_alone(self):
        d=fixture();d['claims'].pop(1)
        with self.assertRaisesRegex(ValueError,'Event needs reviewed event-specific evidence'):
            checks.validate_data(**d)

    def test_event_stage_amount_and_date_need_matching_facts(self):
        for field,value in [('stage','Series B'),('amount',2000000),('currency','USD'),('announced_on','2025-04-13')]:
            d=fixture();d['claims'][1]['value'][field]=value
            with self.subTest(field=field),self.assertRaisesRegex(ValueError,'no matching reviewed claim'):
                checks.validate_data(**d)

    def test_event_fact_must_join_same_company_and_event(self):
        for key,value in [('event_id','another-round'),('company_id','staged:tr:another')]:
            d=fixture();d['claims'][1]['value'][key]=value
            with self.subTest(key=key),self.assertRaisesRegex(ValueError,'Event needs reviewed event-specific evidence'):
                checks.validate_data(**d)

    def test_split_stage_claim_variants_can_support_projection(self):
        for field in ['funding_round_stage','funding_stage']:
            d=fixture();d['claims'][1]['value']['stage']=None
            source,_=alternate_claim(d,field,{'event_id':'fixture-series-a','stage':'Series A'})
            record=d['records'][0]['funding_rounds'][0];record['source']=source['url']
            for key in ['amount','currency','announced_on']:record.pop(key)
            with self.subTest(field=field):self.assertTrue(checks.validate_data(**d)['valid'])

    def test_stage_source_id_cannot_inherit_another_sources_stage(self):
        d=fixture();source,_=alternate_claim(d,'funding_stage',{'event_id':'fixture-series-a','stage':'Series A'})
        d['claims'][1]['value']['stage_source_id']=source['source_id']
        with self.assertRaisesRegex(ValueError,'Projected source does not directly support stage'):
            checks.validate_data(**d)

    def test_projected_stage_cannot_inherit_from_unrelated_selected_source(self):
        d=fixture();source,_=alternate_claim(d,'funding_amount',{'event_id':'fixture-series-a','amount':1000000,'currency':'EUR'})
        d['records'][0]['funding_rounds'][0]['source']=source['url']
        with self.assertRaisesRegex(ValueError,'Projected source does not directly support stage'):
            checks.validate_data(**d)

    def test_split_amount_does_not_inherit_into_selected_stage_source(self):
        for field in ['funding_round_amount','funding_amount']:
            d=fixture();d['claims'][1]['value'].update(amount=None,currency=None)
            alternate_claim(d,field,{'event_id':'fixture-series-a','amount':1000000,'currency':'EUR'})
            with self.subTest(field=field),self.assertRaisesRegex(ValueError,'Projected source does not directly support amount and currency'):
                checks.validate_data(**d)
            d['records'][0]['funding_rounds'][0].pop('amount');d['records'][0]['funding_rounds'][0].pop('currency')
            self.assertTrue(checks.validate_data(**d)['valid'])

    def test_split_date_does_not_inherit_into_selected_stage_source(self):
        for field in ['funding_round_announcement_date','funding_announcement']:
            d=fixture();d['claims'][1]['value'].update(announced_on=None,announced_precision=None)
            alternate_claim(d,field,{'event_id':'fixture-series-a','announced_on':'2025-04-12','precision':'day'})
            with self.subTest(field=field),self.assertRaisesRegex(ValueError,'Projected source does not directly support announcement date'):
                checks.validate_data(**d)
            d['records'][0]['funding_rounds'][0].pop('announced_on')
            self.assertTrue(checks.validate_data(**d)['valid'])

    def test_investor_contribution_is_not_round_amount_evidence(self):
        d=fixture();d['claims'][1]['value'].update(amount=None,currency=None)
        alternate_claim(d,'funding_investor_contribution',{'event_id':'fixture-series-a','amount':1000000,'currency':'EUR'})
        with self.assertRaisesRegex(ValueError,'Event amount/currency has no matching'):
            checks.validate_data(**d)

    def test_raw_amount_cannot_be_assigned_to_a_source_without_it(self):
        d=fixture();d['records'][0]['funding_rounds'][0]['amount_text']='EUR 1 million'
        with self.assertRaisesRegex(ValueError,'raw amount text'):
            checks.validate_data(**d)
        d['claims'][1]['value']['raw_amount_text']='EUR 1 million'
        self.assertTrue(checks.validate_data(**d)['valid'])

    def test_valuation_cannot_be_invented_during_projection(self):
        d=fixture();d['records'][0]['funding_rounds'][0].update(valuation=10000000,valuation_currency='EUR')
        with self.assertRaisesRegex(ValueError,'changes or invents valuation'):
            checks.validate_data(**d)


class IdentityAndResumeTests(unittest.TestCase):
    def test_turkish_name_variants_are_candidates_only(self):
        a={'name':'MARTI','website':'https://a.example/'}; b={'name':'Martı','website':'https://b.example/'}
        before=deepcopy([a,b])
        self.assertIn('same_normalized_name_or_alias',checks.identities_match(a,b))
        self.assertEqual([a,b],before)
        self.assertEqual(checks.name_key('İstanbul'),checks.name_key('Istanbul'))

    def test_www_case_and_paths_do_not_hide_same_domain(self):
        self.assertEqual(checks.domain_key('https://WWW.Example.org/a?q=b'), checks.domain_key('https://example.org/'))

    def test_distinct_midas_domains_remain_distinct(self):
        self.assertNotEqual(checks.domain_key('https://getmidas.com/'),checks.domain_key('https://midas.app/'))

    def test_subdomains_are_not_automatically_parent_entities(self):
        self.assertNotEqual(checks.domain_key('https://fund.example.org/'),checks.domain_key('https://example.org/'))

    def test_credentials_and_http_are_rejected(self):
        for u in ['http://example.org/','https://user:password@example.org/','https://example.org:8443/']:
            with self.subTest(url=u),self.assertRaises(ValueError): checks.domain_key(u)

    def test_date_precision_validation(self):
        for value,precision in [('2025','year'),('2025-04','month'),('2025-04-12','day'),(None,'unknown')]:
            checks.date_with_precision(value,precision)
        for value,precision in [('2025-01-01','year'),('2025-02-30','day'),('2025-13','month'),('2025','unknown')]:
            with self.subTest(value=value),self.assertRaises(ValueError):checks.date_with_precision(value,precision)

    def test_duplicate_json_keys_fail(self):
        with tempfile.TemporaryDirectory() as td:
            p=Path(td)/'bad.json';p.write_text('{"amount": null, "amount": 0}')
            with self.assertRaises(ValueError):checks.read(p)

    def checkpoint(self):
        raw={'companies.json':b'original reviewed bytes'}
        checkpoint={'population_denominator':None,'collection_complete':False,'production_published':0,
                    'crawler_seed_approvals':0,'reviewed_entity_ids':['staged:tr:a'],'pending_entity_ids':['staged:tr:b'],
                    'accepted_entity_ids':['staged:tr:a'],'held_entity_ids':[],
                    'input_sha256':{k:hashlib.sha256(v).hexdigest() for k,v in raw.items()}}
        return checkpoint,raw

    def test_interrupted_checkpoint_replay_is_read_only(self):
        cp,raw=self.checkpoint(); before=deepcopy(cp)
        checks.check_checkpoint(cp,raw);checks.check_checkpoint(cp,raw)
        self.assertEqual(cp,before)
        self.assertEqual(cp['pending_entity_ids'],['staged:tr:b'])

    def test_resume_rejects_changed_source_bytes(self):
        cp,raw=self.checkpoint();raw['companies.json']+=b' mutation'
        with self.assertRaises(ValueError):checks.check_checkpoint(cp,raw)

    def test_resume_rejects_duplicate_or_overlapping_dispositions(self):
        for values in [['staged:tr:a'],['staged:tr:b','staged:tr:b']]:
            cp,raw=self.checkpoint();cp['pending_entity_ids']=values
            with self.assertRaises(ValueError):checks.check_checkpoint(cp,raw)

    def test_bounded_inventory_does_not_claim_population_completion(self):
        for field,value in [('population_denominator',0),('collection_complete',True),('production_published',1)]:
            cp,raw=self.checkpoint();cp[field]=value
            with self.assertRaises(ValueError):checks.check_checkpoint(cp,raw)

    def test_resume_requires_reviewed_to_equal_accepted_plus_held(self):
        cp,raw=self.checkpoint();cp['reviewed_entity_ids']=['staged:tr:unrelated']
        with self.assertRaisesRegex(ValueError,'Reviewed identities must equal'):
            checks.check_checkpoint(cp,raw)

    def test_resume_accepted_ids_must_match_actual_inventory(self):
        cp,raw=self.checkpoint()
        with self.assertRaisesRegex(ValueError,'differ from the company inventory'):
            checks.check_checkpoint(cp,raw,accepted_entity_ids={'staged:tr:other'})

    def test_held_reviewed_identity_must_be_declared(self):
        cp,raw=self.checkpoint();cp['held_entity_ids']=['staged:tr:held'];cp['reviewed_entity_ids'].append('staged:tr:held')
        with self.assertRaisesRegex(ValueError,'must be declared context'):
            checks.check_checkpoint(cp,raw)
        checks.check_checkpoint(cp,raw,accepted_entity_ids={'staged:tr:a'},context_entity_ids=['staged:tr:held'])

    def test_accepted_and_held_cannot_overlap(self):
        cp,raw=self.checkpoint();cp['held_entity_ids']=['staged:tr:a']
        with self.assertRaisesRegex(ValueError,'both accepted and held'):
            checks.check_checkpoint(cp,raw,context_entity_ids=['staged:tr:a'])

    def test_packet_checkpoint_binds_to_real_company_inventory(self):
        d=fixture();cp,raw=self.checkpoint();d.update(checkpoint=cp,bound_files=raw)
        with self.assertRaisesRegex(ValueError,'differ from the company inventory'):
            checks.validate_data(**d)

    def test_changed_imported_builder_is_rejected_before_execution(self):
        with tempfile.TemporaryDirectory() as td:
            p=Path(td)/'builder.py';p.write_bytes(b'original bytes')
            checks.check_imported_code(p,b'original bytes')
            p.write_bytes(b'changed code that must not execute')
            with self.assertRaisesRegex(ValueError,'differs from the pinned baseline'):
                checks.check_imported_code(p,b'original bytes')

    def test_missing_founding_zero_is_a_downstream_blocker(self):
        records=[{'name':'Fixture'}]
        graph={'entities':[{'id':'startup:fixture','kind':'startup','founded_year':0}]}
        blockers=checks.graph_semantic_blockers(records,graph)
        self.assertEqual(len(blockers),1)
        self.assertIsNone(blockers[0]['record_value'])
        self.assertEqual(blockers[0]['graph_value'],0)
        self.assertIn('/pull/179',blockers[0]['owner_dependency'])

    def test_existing_graph_zero_does_not_mislabel_proposed_known_year(self):
        records=[{'name':'Fixture','founded_year':2020}]
        graph={'entities':[{'id':'startup:fixture','kind':'startup','founded_year':2020},
                           {'id':'startup:existing','kind':'startup','founded_year':0}]}
        self.assertEqual(checks.graph_semantic_blockers(records,graph),[])


if __name__ == '__main__': unittest.main()
