"""Data-quality and resumability regression checks, including deliberate invalid fixtures."""
import copy,json,unittest
from pathlib import Path
from validate_packet import load_packet,validate_packet,resume,name_key,domain,slug,event_id

class PacketChecks(unittest.TestCase):
 @classmethod
 def setUpClass(cls):cls.original=load_packet()
 def setUp(self):self.p=copy.deepcopy(self.original)
 def rejects(self,needle):
  result=validate_packet(self.p)
  self.assertFalse(result['valid']);self.assertTrue(any(needle in e for e in result['errors']),result['errors'])
 def test_valid_bounded_packet(self):self.assertTrue(validate_packet(self.p)['valid'])
 def test_name_and_domain_normalization(self):
  self.assertEqual(name_key('  CROÍValve  '),name_key('CROI\u0301Valve'))
  self.assertEqual(slug('CroíValve'),'croivalve')
  self.assertEqual(domain('https://WWW.Example.COM./path'),'example.com')
 def test_duplicate_company_domain_rejected(self):
  self.p['companies']['companies'][1]['website']=self.p['companies']['companies'][0]['website'];self.rejects('duplicate canonical website')
 def test_duplicate_company_alias_rejected(self):
  self.p['companies']['companies'][1]['alias_names'].append(self.p['companies']['companies'][0]['name']);self.rejects('duplicate alias across companies')
 def test_unknown_money_cannot_be_zero(self):
  e=next(e for c in self.p['companies']['companies'] for e in c['funding_rounds'] if e['amount'] is None)
  e.update(amount=0,currency='USD');self.rejects('zero-imputed unknown')
 def test_amount_requires_currency(self):
  e=next(e for c in self.p['companies']['companies'] for e in c['funding_rounds'] if e['amount'] is not None)
  e['currency']=None;self.rejects('amount and currency')
 def test_currency_requires_amount(self):
  e=next(e for c in self.p['companies']['companies'] for e in c['funding_rounds'] if e['amount'] is None)
  e['currency']='USD';self.rejects('amount and currency')
 def test_unaccessed_source_cannot_support_reviewed_claim(self):
  cl=next(c for c in self.p['claims']['claims'] if c['status']=='reviewed_staged')
  next(s for s in self.p['source-registry']['sources'] if s['url']==cl['source_url'])['accessed']=False
  self.rejects('unaccessed reviewed claim')
 def test_discovery_source_cannot_support_reviewed_claim(self):
  cl=next(c for c in self.p['claims']['claims'] if c['status']=='reviewed_staged');cl['source_kind']='discovery';self.rejects('discovery cannot support')
 def test_orphan_participant_rejected(self):
  cl=next(c for c in self.p['claims']['claims'] if c['field']=='round_participant');cl['value']['event_id']='missing-event';self.rejects('orphan participant')
 def test_cross_company_participant_rejected(self):
  cl=next(c for c in self.p['claims']['claims'] if c['field']=='round_participant');cl['entity_id']='staging:ie:not-this-company';self.rejects('cross-company participant')
 def test_mixed_event_id_keys_join(self):
  med=next(c for c in self.p['claims']['claims'] if c['research_lane']=='medtech' and c['field']=='funding_round')
  deep=next(c for c in self.p['claims']['claims'] if c['research_lane']=='deeptech' and c['field']=='funding_round')
  self.assertEqual(event_id(med['value']),med['value']['id']);self.assertEqual(event_id(deep['value']),deep['value']['event_id'])
 def test_partial_date_is_not_padded(self):
  r=next(r for r in self.p['startup-records']['startups'] if r['name']=='ProVerum')
  fr=next(f for f in r['funding_rounds'] if f['id']=='proverum-2022-01-series-a');self.assertNotIn('announced_on',fr)
  fr['announced_on']='2022-01-01';self.rejects('partial funding date padded')
 def test_conflicting_currency_withheld(self):
  r=next(r for r in self.p['startup-records']['startups'] if r['name']=='Luminate Medical')
  e=next(e for e in r['funding_rounds'] if e['id']=='luminate-medical-2024-09-series-a');self.assertNotIn('amount',e)
  e.update(amount=15000000,currency='USD');self.rejects('conflicting Luminate currency')
 def test_grant_decimal_and_secondary_not_legacy_rounds(self):
  prov=next(c for c in self.p['companies']['companies'] if c['name']=='Provizio');self.assertEqual(prov['funding_rounds'][0]['amount'],2499962.5)
  projected=[f['id'] for key in ['startup-records','boundary-records'] for r in self.p[key]['startups'] for f in r['funding_rounds']]
  self.assertNotIn('provizio-p-apt-960667',projected);self.assertNotIn('workhuman-2020-06-23-secondary',projected)
 def test_source_registry_and_claim_map_count_reconcile(self):
  self.p['projection-map']['claims'].pop();self.rejects('claim projection map is incomplete')
 def test_resume_exhausts_only_pending_queue_without_duplicates(self):
  q=self.p['queue'];page=resume(q,limit=10);items=page['items'];self.assertIsNotNone(page['next_cursor'])
  while page['next_cursor']:
   page=resume(q,page['next_cursor'],10);items+=page['items']
  self.assertEqual(len(items),18);self.assertEqual(len({x['candidate_id'] for x in items}),18);self.assertIsNone(page['next_cursor'])
 def test_stale_revision_cursor_rejected(self):
  q=self.p['queue'];cur=copy.deepcopy(q['next_cursor']);cur['baseline_revision']='0'*40
  with self.assertRaisesRegex(ValueError,'stale'):resume(q,cur)
 def test_queue_mutation_invalidates_cursor(self):
  q=self.p['queue'];q['payload']['candidates'][0]['reason']='changed'
  with self.assertRaisesRegex(ValueError,'hash mismatch'):resume(q)
 def test_cursor_offset_bounds(self):
  q=self.p['queue'];cur=copy.deepcopy(q['next_cursor']);cur['offset']=19
  with self.assertRaisesRegex(ValueError,'offset'):resume(q,cur)
 def test_fin_alias_matches_existing_provider_and_stays_held(self):
  fin=next(c for c in self.p['deduplication']['companies'] if c['entity_id']=='staging:ie:fin-intercom')
  self.assertIn('provider:intercom',{m['id'] for m in fin['matches']})
  self.assertNotIn('Fin',{r['name'] for r in self.p['startup-records']['startups']})
  self.assertIn('Fin',{r['name'] for r in self.p['boundary-records']['startups']})
 def test_seed_approval_is_never_implicit(self):
  self.p['source-registry']['sources'][0]['crawler_seed_approved']=True;self.rejects('source cannot approve seed')

if __name__=='__main__':unittest.main()
