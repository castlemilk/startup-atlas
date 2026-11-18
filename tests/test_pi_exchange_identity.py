import csv
import importlib.util
import json
from pathlib import Path
import unittest
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('pi_graph',ROOT/'scripts/make-graph.py')
graph=importlib.util.module_from_spec(spec);spec.loader.exec_module(graph)
class PiExchangeIdentityTests(unittest.TestCase):
 def test_minimal_enrichment_retains_identity_and_cohort(self):
  result=graph.build_graph(*[json.loads((ROOT/'data'/n).read_text()) for n in ['partner-profiles.json','partner-leads.json','partners-reviewed.json','catalogue.json','startup-research.json']])
  matches=[e for e in result['entities'] if e['id'] in ['startup:pi-exchange','startup:mentana']]
  self.assertEqual(len(matches),1);company=matches[0]
  self.assertEqual(company['id'],'startup:pi-exchange');self.assertEqual(company['name'],'PI.EXCHANGE')
  self.assertEqual(company['website'],'https://www.mentana.ai/')
  fact=next(f for f in company['profile_facts'] if f['key']=='trading-name')
  self.assertTrue(fact['value'].startswith('Mentana. '));self.assertNotIn('note',fact);self.assertEqual(fact['source'],'https://www.mentana.ai/website-terms-of-use')
  self.assertEqual(fact['reviewed_at'],'2026-11-18')
  self.assertTrue(any(e['from']=='partner:boab-ai' and e['to']==company['id'] and e['kind']=='supports' for e in result['edges']))
  self.assertFalse(any(r['startup_id']==company['id'] for r in result['funding_rounds']))
 def test_seed_is_disabled_and_remi_untouched(self):
  with (ROOT/'data/company-profile-seeds.csv').open() as stream: seeds=list(csv.DictReader(stream))
  seed=next(s for s in seeds if s['partner']=='PI.EXCHANGE')
  self.assertEqual(seed['approved'],'no');self.assertEqual(seed['official_website'],'https://www.mentana.ai/')
  self.assertFalse(any(s['partner']=='Remi AI' for s in seeds))
  research=json.loads((ROOT/'data/startup-research.json').read_text())
  self.assertFalse(any(r['name']=='Remi AI' for r in research['startups']))
 def test_collector_cannot_activate_proposed_seed(self):
  spec=importlib.util.spec_from_file_location('pi_crawl',ROOT/'scripts/crawl.py')
  crawl=importlib.util.module_from_spec(spec);spec.loader.exec_module(crawl)
  research=json.loads((ROOT/'data/startup-research.json').read_text())
  seeds=crawl.load_approved_csv(ROOT/'data/company-profile-seeds.csv',
                                {r['name'] for r in research['startups']},require_qid=False)
  self.assertFalse(any(s['name'] in ('PI.EXCHANGE','Remi AI') for s in seeds))
  self.assertTrue(any(s['name']=='PsiQuantum' for s in seeds))
if __name__=='__main__': unittest.main()
