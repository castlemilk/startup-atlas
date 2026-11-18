"""Offline regressions over copies of the delivered packet, never live data writes."""
from copy import deepcopy
import json
from pathlib import Path
import tempfile
import unittest

from validate_packet import (load_packet, normalize_name, normalize_domain,
                             queued_task_order, validate_bundle, validate_resume,
                             coverage_receipt_errors)

DIRECTORY=Path(__file__).resolve().parent.parent


class PacketTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.original,cls.baseline=load_packet(DIRECTORY)

    def setUp(self):
        self.packet=deepcopy(self.original)

    def result(self):
        return validate_bundle(self.packet,self.baseline)

    def rejects(self,fragment):
        result=self.result()
        self.assertFalse(result['valid'])
        self.assertTrue(any(fragment in e for e in result['errors']),result['errors'])

    def test_actual_packet_joins_and_counts(self):
        result=self.result()
        self.assertTrue(result['valid'],result['errors'])
        self.assertEqual(result['counts']['companies'],len(self.packet['companies.json']['companies']))
        self.assertEqual(result['counts']['claims'],len(self.packet['claims.json']['claims']))
        self.assertEqual(result['counts']['unique_funding_events'],result['counts']['projected_funding_events'])

    def test_name_normalization_and_namesakes(self):
        self.assertEqual(normalize_name('  Ｖａｎｔａ,   Inc. '),normalize_name('vanta, inc.'))
        self.assertNotEqual(normalize_name('Café'),normalize_name('CAFE'))
        self.assertNotEqual(normalize_name('Vanta Inc.'),normalize_name('Vanta'))
        self.assertEqual(normalize_domain('https://WWW.GLEAN.COM/about'),normalize_domain('glean.com'))
        self.assertNotEqual(normalize_domain('glean.ai'),normalize_domain('glean.com'))
        self.assertNotEqual(normalize_domain('app.example.com'),normalize_domain('example.com'))

    def test_duplicate_canonical_domain_is_rejected(self):
        companies=self.packet['companies.json']['companies']
        companies[1]['canonical_domain']=companies[0]['canonical_domain']
        self.rejects('duplicate domain')

    def test_alias_collision_requires_identity_review(self):
        companies=self.packet['companies.json']['companies']
        companies[1].setdefault('aliases',[]).append(companies[0]['canonical_name'])
        self.rejects('duplicate name or alias')

    def test_failed_source_cannot_support_reviewed_claim(self):
        claim=next(c for c in self.packet['claims.json']['claims'] if c['status']=='reviewed_staged')
        sid=claim['source_ids'][0]
        next(s for s in self.packet['source-registry.json']['sources'] if s['id']==sid)['accessed']=False
        self.rejects('inaccessible source')

    def test_missing_source_join_is_rejected(self):
        self.packet['claims.json']['claims'][0]['source_ids']=['synthetic:missing-source']
        self.rejects('unknown source reference')

    def test_wrong_identity_page_is_not_accepted_even_when_readable(self):
        claim=next(c for c in self.packet['claims.json']['claims'] if c['status']=='reviewed_staged')
        sid=claim['source_ids'][0]
        next(s for s in self.packet['source-registry.json']['sources'] if s['id']==sid)['review_outcome']='rejected_identity_mismatch'
        self.rejects('identity mismatch was promoted')

    def test_company_claim_receipt_cannot_drop_an_observation(self):
        self.packet['companies.json']['companies'][0]['claim_ids'].pop()
        self.rejects('claim IDs differ')

    def test_pending_claim_cannot_claim_publication(self):
        self.packet['claims.json']['claims'][0]['publication_state']='published_verified'
        self.rejects('other than unsubmitted')

    def test_numeric_amount_requires_explicit_currency(self):
        claim=next(c for c in self.packet['claims.json']['claims'] if c['field']=='funding_round')
        claim['value']['amount']=100
        claim['value']['currency']=None
        self.rejects('lacks explicit currency')

    def test_unknown_amount_is_not_projected_as_zero(self):
        record=next(r for r in self.packet['atlas-records.json']['startups'] if r.get('funding_rounds'))
        record['funding_rounds'][0].update(amount=0,currency='USD')
        self.rejects('no matching reviewed amount/currency evidence')

    def test_lower_bound_is_not_projected_as_exact(self):
        claim=next(c for c in self.packet['claims.json']['claims'] if c['field']=='funding_round' and c['value'].get('amount_precision')=='lower_bound')
        company=next(c for c in self.packet['companies.json']['companies'] if c['staging_id']==claim['entity_id'])
        records=self.packet['atlas-records.json']['startups']+self.packet['withheld-records.json']['startups']
        record=next(r for r in records if r['name']==company['canonical_name'])
        fr=next(r for r in record['funding_rounds'] if r['id']==claim['value']['event_id'])
        fr.update(amount=300000000,currency='USD')
        self.rejects('lower bound promoted to exact')

    def test_participant_must_join_the_companys_event(self):
        claim=next(c for c in self.packet['claims.json']['claims'] if c['field']=='round_participant')
        claim['value']['event_id']='synthetic-missing-round'
        self.rejects('missing or different-company funding event')

    def test_portfolio_membership_is_not_a_round_relationship(self):
        claim=next(c for c in self.packet['claims.json']['claims'] if c['field']=='round_participant')
        claim['value']['participation_source_scope']='portfolio_membership'
        self.rejects('portfolio membership')

    def test_unresolved_investor_is_not_promoted_to_a_typed_edge(self):
        company=self.packet['companies.json']['companies'][0]
        record=next(r for r in self.packet['atlas-records.json']['startups'] if r['name']==company['canonical_name'])
        record['relationships']=[{'kind':'funded_by','target_id':'partner:synthetic-investor','description':'Synthetic invalid edge','source':record['source']}]
        self.rejects('unresolved investor promoted')

    def test_an_additional_source_does_not_double_count_a_round(self):
        claim=deepcopy(next(c for c in self.packet['claims.json']['claims'] if c['field']=='funding_round'))
        count_before=self.result()['counts']['unique_funding_events']
        original_source=next(s for s in self.packet['source-registry.json']['sources'] if s['id']==claim['source_ids'][0])
        source=deepcopy(original_source)
        source.update(id='synthetic-corroboration',url='https://example.com/synthetic-corroboration')
        claim.update(claim_id='synthetic-corroboration-claim',source_ids=[source['id']],source_url=source['url'])
        self.packet['source-registry.json']['sources'].append(source)
        self.packet['claims.json']['claims'].append(claim)
        company=next(c for c in self.packet['companies.json']['companies'] if c['staging_id']==claim['entity_id'])
        company['claim_ids'].append(claim['claim_id'])
        company['source_ids'].append(source['id'])
        result=self.result()
        self.assertTrue(result['valid'],result['errors'])
        self.assertEqual(result['counts']['unique_funding_events'],count_before)


class ResumeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.packet,_=load_packet(DIRECTORY)
        cls.original=json.loads((DIRECTORY/'resume.json').read_text())
        cls.ecosystem=json.loads((DIRECTORY/'ecosystem.json').read_text())
        cls.coverage=json.loads((DIRECTORY/'coverage.json').read_text())

    def setUp(self):
        self.resume=deepcopy(self.original)

    def result(self,coverage=None):
        return validate_resume(self.resume,self.packet['companies.json']['companies'],self.ecosystem,
                               self.coverage if coverage is None else coverage,DIRECTORY)

    def test_actual_checkpoint_hashes_and_dynamic_receipts(self):
        result=self.result()
        self.assertTrue(result['valid'],result['errors'])
        self.assertEqual(result['pending_discoveries'],len(self.ecosystem['discovery_only_candidates']))
        self.assertEqual(result['completed_initial_reviews'],len(self.packet['companies.json']['companies']))
        packet_receipt=validate_bundle(self.packet)
        self.assertEqual(coverage_receipt_errors(self.packet,self.ecosystem,self.coverage,packet_receipt),[])

    def test_stale_coverage_receipt_cannot_hide_added_sources(self):
        coverage=deepcopy(self.coverage)
        coverage['counts']['source_registry_entries']+=1
        errors=coverage_receipt_errors(self.packet,self.ecosystem,coverage,validate_bundle(self.packet))
        self.assertTrue(any('source_registry_entries' in e for e in errors))

    def test_changed_input_requires_a_new_checkpoint(self):
        key=next(iter(self.resume['checkpoint_inputs']))
        self.resume['checkpoint_inputs'][key]='0'*64
        self.assertTrue(any('fingerprint does not match' in e for e in self.result()['errors']))

    def test_missing_discovery_is_not_silently_marked_reviewed(self):
        self.resume['pending_discovery_ids'].pop()
        self.assertTrue(any('pending discovery IDs' in e for e in self.result()['errors']))

    def test_duplicate_tasks_and_seed_approval_are_rejected(self):
        self.resume['tasks'][1]['task_id']=self.resume['tasks'][0]['task_id']
        self.resume['tasks'][0]['crawler_seed_approved']=True
        errors=self.result()['errors']
        self.assertTrue(any('task IDs' in e for e in errors))
        self.assertTrue(any('crawler-seed approval' in e for e in errors))

    def test_review_completion_does_not_complete_unknown_history(self):
        coverage=deepcopy(self.coverage)
        coverage['field_coverage'][0]['funding_history_complete']=True
        self.assertTrue(any('complete founder/funding history' in e for e in self.result(coverage)['errors']))
        # A completed company review does not remove its queued follow-up work.
        eid=self.resume['completed_company_reviews'][0]
        fixture=[{'task_id':'follow-up','priority':1,'status':'queued','company_id':eid}]
        self.assertEqual(queued_task_order(fixture)[0]['company_id'],eid)

    def test_selection_is_stable_by_priority_then_task_id(self):
        tasks=[{'task_id':'b','status':'queued','priority':2},
               {'task_id':'a','status':'queued','priority':2},
               {'task_id':'unprioritized','status':'queued'},
               {'task_id':'first','status':'queued','priority':0},
               {'task_id':'already-finished','status':'complete','priority':-1}]
        expected=['first','a','b','unprioritized']
        self.assertEqual([t['task_id'] for t in queued_task_order(tasks)],expected)
        self.assertEqual([t['task_id'] for t in queued_task_order(list(reversed(tasks)))],expected)
        actual=[t['task_id'] for t in queued_task_order(self.resume['tasks'])]
        self.assertEqual(actual,[t['task_id'] for t in queued_task_order(list(reversed(self.resume['tasks'])))])

    def test_restart_preserves_cursor_access_failure_and_selection(self):
        first=queued_task_order(self.resume['tasks'])[0]
        first['cursor']='synthetic:page-2'
        first['last_access_failure']={'status':429,'retry_policy':'preserve existing owner throttle'}
        selected=first['task_id']
        with tempfile.TemporaryDirectory() as temporary:
            path=Path(temporary)/'synthetic-checkpoint.json'
            path.write_text(json.dumps(self.resume,sort_keys=True))
            restarted=json.loads(path.read_text())
        resumed=queued_task_order(restarted['tasks'])[0]
        self.assertEqual(resumed['task_id'],selected)
        self.assertEqual(resumed['cursor'],'synthetic:page-2')
        self.assertEqual(resumed['last_access_failure'],first['last_access_failure'])
        self.assertFalse(resumed['automatic_execution'])


if __name__=='__main__':
    unittest.main()
