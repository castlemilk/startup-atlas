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
  self.assertEqual(fact['reviewed_at'],'2026-11-26')
  self.assertTrue(any(e['from']=='partner:boab-ai' and e['to']==company['id'] and e['kind']=='supports' for e in result['edges']))
  rounds=[r for r in result['funding_rounds'] if r['startup_id']==company['id']]
  self.assertEqual([r['id'] for r in rounds],['pi-exchange-2021-pre-series-a'])
  self.assertEqual(rounds[0]['stage'],'Pre-Series A');self.assertEqual(rounds[0]['announced_on'],'2021-08-25')
  self.assertEqual(rounds[0]['amount'],2000000);self.assertEqual(rounds[0]['currency'],'USD')
  founder=next(e for e in result['entities'] if e['id']=='person:quan-pham')
  self.assertEqual(founder['name'],'Quan Pham')
  edges=[e for e in result['edges'] if e['from']==founder['id'] and e['to']==company['id']]
  self.assertEqual(len(edges),1);self.assertEqual(edges[0]['kind'],'founded')
  self.assertEqual(edges[0]['source'],'https://www.prnewswire.com/news-releases/piexchange-announces-the-worlds-first-personal-data-bank-is-ready-300523051.html')
 def test_seed_is_disabled_and_remi_website_remains_quarantined(self):
  with (ROOT/'data/company-profile-seeds.csv').open() as stream: seeds=list(csv.DictReader(stream))
  seed=next(s for s in seeds if s['partner']=='PI.EXCHANGE')
  self.assertEqual(seed['approved'],'no');self.assertEqual(seed['official_website'],'https://www.mentana.ai/')
  self.assertFalse(any(s['partner']=='Remi AI' for s in seeds))
  research=json.loads((ROOT/'data/startup-research.json').read_text())
  remi=next(r for r in research['startups'] if r['name']=='Remi AI')
  self.assertFalse(remi.get('website'))
  self.assertEqual(remi['source'],'https://abr.business.gov.au/ABN/View/26608216306')
 def test_collector_cannot_activate_proposed_seed(self):
  spec=importlib.util.spec_from_file_location('pi_crawl',ROOT/'scripts/crawl.py')
  crawl=importlib.util.module_from_spec(spec);spec.loader.exec_module(crawl)
  research=json.loads((ROOT/'data/startup-research.json').read_text())
  seeds=crawl.load_approved_csv(ROOT/'data/company-profile-seeds.csv',
                                {r['name'] for r in research['startups']},require_qid=False)
  self.assertFalse(any(s['name'] in ('PI.EXCHANGE','Remi AI') for s in seeds))
  self.assertTrue(any(s['name']=='PsiQuantum' for s in seeds))
if __name__=='__main__': unittest.main()
