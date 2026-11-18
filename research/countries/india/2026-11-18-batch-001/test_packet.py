#!/usr/bin/env python3
"""Offline packet invariants and reuse of #177, without changing shared code/data."""
from __future__ import annotations
import copy
from datetime import date, datetime
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import unicodedata
import unittest
from urllib.parse import urlsplit

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[3]
sys.path.insert(0,str(ROOT/'scripts'))
import plan_company_profiles as planner
def read(name):return json.loads((HERE/name).read_text())
def norm(value):return re.sub(r'[^\w]+','',unicodedata.normalize('NFKC',value).casefold())
def hostname(value):
    p=urlsplit(value if '://' in value else 'https://'+value)
    if p.username or p.password or not p.hostname or p.port not in (None,443):raise ValueError('Invalid hostname')
    return p.hostname.encode('idna').decode().lower().removeprefix('www.')
def graph_builder():
    spec=importlib.util.spec_from_file_location('packet_graph_builder',ROOT/'scripts/make-graph.py')
    mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod);return mod

class IndiaPacket(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.manifest=read('manifest.json');cls.records=read('startup-records.json')['startups']
        cls.claims=read('claim-ledger.json')['claims'];cls.sources=read('source-registry.json')['sources']
        cls.identities=read('company-identities.json')['companies'];cls.events=read('funding-events.json')['events']
        cls.claimby={c['claim_id']:c for c in cls.claims};cls.sourceby={s['source_id']:s for s in cls.sources}

    def test_01_existing_runtime_schema(self):
        r=subprocess.run(['node',str(HERE/'validate-records.mjs')],capture_output=True,text=True,check=True)
        receipt=json.loads(r.stdout);self.assertEqual(receipt['records'],21);self.assertEqual(receipt['negative_contract_checks'],3)

    def test_02_pinned_inputs_unchanged(self):
        for path,expected in self.manifest['baseline']['files'].items():
            self.assertEqual(hashlib.sha256((ROOT/path).read_bytes()).hexdigest(),expected,path)
        self.assertRegex(self.manifest['base_revision'],r'^[0-9a-f]{40}$')

    def test_03_unique_names_domains_ids_and_alias_normalization(self):
        self.assertEqual(len({norm(r['name']) for r in self.records}),len(self.records))
        self.assertEqual(len({hostname(r['website']) for r in self.records}),len(self.records))
        self.assertEqual(len(self.claimby),len(self.claims));self.assertEqual(len(self.sourceby),len(self.sources))
        self.assertEqual(hostname('https://WWW.Example.COM/path?q=1'),'example.com')
        self.assertEqual(norm('Ａｔｉ Robotics'),norm('ati robotics'))
        self.assertNotEqual(norm('Ati Robotics'),norm('Ati Motors'))
        ati=next(x for x in self.identities if x['canonical_name']=='Ati Robotics')
        self.assertTrue(any(a.get('value',a.get('name'))=='Ati Motors' for a in ati['aliases']))

    def test_04_deduplication_against_graph_and_overlay(self):
        baseline=json.loads((ROOT/'data/graph.json').read_text())
        current=[e for e in baseline['entities'] if e['kind']=='startup']
        self.assertEqual(len(current),46)
        for row in read('deduplication.json')['records']:
            self.assertFalse(row['existing_matches'])
            self.assertFalse({norm(n) for n in row['compared_names']} & {norm(e['name']) for e in current})
            self.assertFalse(set(row['compared_domains']) & {hostname(e['website']) for e in current if e.get('website')})

    def test_05_provenance_and_reviewed_access(self):
        for c in self.claims:
            if c['status'] in ['unsearched','searched_unknown','blocked','rejected','not_applicable']:
                self.assertTrue(c['rationale']);self.assertIsNone(c['value'])
                if c['status']=='searched_unknown':self.assertTrue(c['search_log'])
                continue
            s=self.sourceby[c['source_id']];self.assertEqual(s['url'],c['source_url'])
            self.assertTrue(c['source_url'].startswith('https://'));self.assertTrue(c['evidence'])
            if c['status']=='reviewed_staged':
                self.assertTrue(s['accessed']);self.assertTrue(c['accessed']);self.assertNotEqual(c['source_kind'],'discovery')
                self.assertLessEqual(datetime.fromisoformat(c['retrieved_at'].replace('Z','+00:00')),datetime.fromisoformat(c['reviewed_at'].replace('Z','+00:00')))

    def test_06_projection_mapping_excludes_held_claims(self):
        for row in read('projection-map.json')['records']:
            for path,ids in row['paths'].items():
                self.assertTrue(ids,(row['record_name'],path))
                for cid in ids:
                    c=self.claimby[cid];self.assertEqual(c['status'],'reviewed_staged');self.assertEqual(c['entity_id'],row['staging_entity_id'])
                    if path.startswith('/profile_facts/'):
                        self.assertNotIn(c['field'],['funding_round','funding_amount','funding_currency','round_participant'])
        dig=next(r for r in self.records if r['name']=='Digantara')
        self.assertFalse(dig.get('funding_rounds'))

    def test_07_unknown_is_not_zero(self):
        for r in self.records:
            self.assertNotEqual(r.get('founded_year'),0)
            self.assertFalse(any(v is None for v in r.values()))
            for e in r.get('funding_rounds',[]):
                self.assertNotEqual(e.get('amount'),0);self.assertEqual('amount' in e,'currency' in e)
        for e in self.events:
            if e.get('amount') is not None:self.assertRegex(e['currency'],r'^[A-Z]{3}$')
        for name in ['Sarvam AI','Chargebee']:
            record=next(r for r in self.records if r['name']==name)
            self.assertNotIn('amount',record['funding_rounds'][0]);self.assertIn('amount_text',record['funding_rounds'][0])

    def test_08_dates_and_precision(self):
        for r in self.records:
            date.fromisoformat(r['reviewed_at'])
            for e in r.get('funding_rounds',[]):
                if 'announced_on' in e:date.fromisoformat(e['announced_on'])
        for name in ['Skyroot Aerospace','Agnikul Cosmos']:
            r=next(r for r in self.records if r['name']==name)
            self.assertNotIn('announced_on',r['funding_rounds'][0])
        pix=next(i for i in self.identities if i['canonical_name']=='Pixxel')
        self.assertEqual(pix['founding_date']['value'],'2019-02-27')
        self.assertEqual(pix['founding_date']['precision'],'day')
        sarvam=next(i for i in self.identities if i['canonical_name']=='Sarvam AI')
        self.assertEqual(sarvam['founding_date']['value'],'2023-08');self.assertEqual(sarvam['founding_date']['precision'],'month')
        for e in self.events:
            if 'announced_date' in e:
                self.assertEqual(e['announced_date']['value'],e['announced_on'])
                self.assertEqual(e['announced_date']['precision'],e['date_precision'])
        ev={e['event_id']:e for e in self.events}
        for r in self.records:
            for e in r.get('funding_rounds',[]):
                if 'announced_on' in e:self.assertEqual(e['announced_on'],ev[e['id']]['announced_on'])

    def test_09_funding_relationship_integrity(self):
        ev={e['event_id']:e for e in self.events};self.assertEqual(len(ev),len(self.events));seen=set()
        for c in self.claims:
            if c['field']!='round_participant':continue
            v=c['value'];e=ev[v['event_id']]
            self.assertEqual(c['entity_id'],e['company_id']);self.assertIsNone(v['resolved_entity_id'])
            self.assertIn(v['role'],['lead','participant','unspecified'])
            key=(v['event_id'],norm(v['name']));self.assertNotIn(key,seen);seen.add(key)
            self.assertNotIn('portfolio_membership',c['field'])
            if c['status']=='reviewed_staged':self.assertEqual(e['status'],'reviewed_staged')
        self.assertTrue(all(c['value'].get('event_id') is None for c in self.claims if c['field']=='portfolio_membership'))

    def test_10_round_totals_transactions_and_components(self):
        e=next(e for e in self.events if e['company_id']=='staged:in:euler-motors')
        self.assertIsNone(e['amount']);self.assertEqual(e['investor_consideration']['amount'],5100000000)
        d=next(r for r in self.records if r['name']=='Dhruva Space')['funding_rounds'][0]
        self.assertNotIn('amount',d);self.assertIn('includes debt',d['amount_text'])
        j=next(e for e in self.events if e['company_id']=='staged:in:juspay')
        self.assertEqual(j['transaction_kind'],'mixed_primary_secondary');self.assertIsNone(j['primary_secondary_split'])

    def test_11_founder_and_adviser_role_boundaries(self):
        y=next(r for r in self.records if r['name']=='Yulu')
        self.assertNotIn('Anuj Tewari',[f['name'] for f in y['founders']])
        self.assertTrue(any('Anuj Tewari' in p['value'] for p in y['profile_facts']))
        participants={c['value']['name'] for c in self.claims if c['field']=='round_participant'}
        self.assertFalse({'Dexter Capital','Vertices Partners','Kumar Vembu'} & participants)

    def test_12_geography_is_not_inferred_from_membership(self):
        for name in ['Postman','Pixxel']:
            x=next(i for i in self.identities if i['canonical_name']==name)
            h=x['hq'];self.assertIn(h.get('country_code',h.get('country')),['US','United States'])
        for name in ['Sarvam AI','BrowserStack','Chargebee','Ninjacart']:
            self.assertIsNone(next(i for i in self.identities if i['canonical_name']==name)['hq'])
        ati=next(i for i in self.identities if i['canonical_name']=='Ati Robotics')
        self.assertEqual(ati['incorporation']['country_code'],'US');self.assertEqual(ati['hq']['as_of'],'2022')

    def test_13_manifest_coverage_accounting(self):
        m=self.manifest['counts'];c=read('coverage.json')
        self.assertEqual(m['company_claims'],len(self.claims));self.assertEqual(m['companies_reviewed'],len(self.records))
        self.assertEqual(m['funding_events_observed'],len(self.events))
        self.assertEqual(m['funding_events_projected'],sum(len(r.get('funding_rounds',[])) for r in self.records))
        self.assertEqual(m['companies_discovered_in_explicit_bounded_register'],m['companies_accepted_staged']+m['companies_rejected']+m['companies_deferred_unreviewed'])
        self.assertEqual(len(c['discoveries']),m['companies_discovered_in_explicit_bounded_register'])
        self.assertIsNone(m['country_population_denominator']);self.assertFalse(c['claims_of_completeness'])
        self.assertEqual(m['urls_with_readable_content']+m['urls_unavailable_or_insufficient'],len(self.sources))

    def test_14_queue_and_sources_grant_no_seed_approval(self):
        for s in self.sources:self.assertIs(s['crawler_seed_approved'],False)
        q=read('next-source-queue.json');self.assertFalse(q['automatic_execution'])
        for task in q['queue']:
            self.assertFalse(task['automatic_execution']);self.assertFalse(task.get('crawler_seed_approved',False))
            self.assertIsNone(task['cursor'])
        self.assertEqual(len(q['queue']),self.manifest['counts']['source_queue_tasks'])
        lead=next(x for x in q['queue'] if x['queue_id']=='in-pixxel-2026-series-c-review')
        self.assertEqual(lead['status'],'unreviewed_lead')
        self.assertFalse(any(e['company_id']=='staged:in:pixxel' and '2026' in e['event_id'] for e in self.events))

    def test_15_existing_planner_resumes_and_rejects_drift(self):
        base=json.loads((ROOT/'data/startup-research.json').read_text())
        combined={**base,'startups':base['startups']+self.records}
        with tempfile.TemporaryDirectory() as temp:
            op=Path(temp)/'overlay.json';op.write_text(json.dumps(combined,ensure_ascii=False))
            seeds=ROOT/'data/company-profile-seeds.csv';rev=self.manifest['base_revision']
            first=planner.build_plan(op,seeds,rev,7);page=first;seen=[]
            while True:
                seen.extend(page['items'])
                if page['next_cursor'] is None:break
                page=planner.build_plan(op,seeds,rev,7,page['next_cursor'])
            self.assertEqual(len(seen),66);self.assertEqual(len({i['source_record_name'] for i in seen}),66)
            newnames={r['name'] for r in self.records}
            self.assertTrue(all(i['seed_state']=='seed_review_required' for i in seen if i['source_record_name'] in newnames))
            with self.assertRaises(ValueError):planner.build_plan(op,seeds,'0'*40,7,first['next_cursor'])
            with self.assertRaises(ValueError):planner.build_plan(op,seeds,rev,8,first['next_cursor'])
            op.write_text(op.read_text()+'\n')
            with self.assertRaises(ValueError):planner.build_plan(op,seeds,rev,7,first['next_cursor'])

    def test_16_graph_preview_preserves_unknown_year(self):
        builder=graph_builder()
        load=lambda f:json.loads((ROOT/'data'/f).read_text())
        research=load('startup-research.json');research['startups']+=self.records
        graph=builder.build_graph(load('partner-profiles.json'),load('partner-leads.json'),load('partners-reviewed.json'),load('catalogue.json'),research)
        startups=[e for e in graph['entities'] if e['kind']=='startup'];self.assertEqual(len(startups),67)
        self.assertEqual(len({e['id'] for e in graph['funding_rounds']}),len(graph['funding_rounds']))
        unknown={r['name'] for r in self.records if 'founded_year' not in r}
        self.assertEqual(unknown,{'Agnikul Cosmos','Digantara','Postman'})
        for name in unknown:
            # Current #179 contract: preserve absence, never synthesize zero.
            self.assertNotIn('founded_year',next(e for e in startups if e['name']==name))
            i=next(i for i in self.identities if i['canonical_name']==name)
            self.assertTrue(any('remain absent' in h for h in i['projection_holds']))
            self.assertTrue(any(h['resolved_by']=='#179' for h in i['historical_projection_holds']))

if __name__=='__main__':unittest.main(verbosity=2)
