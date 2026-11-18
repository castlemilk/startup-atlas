#!/usr/bin/env python3
"""Offline packet checks; imports the existing planner and graph builder.

Run from any directory. --write-results refreshes only this packet's receipts.
No network calls, source approval, production writes, or canonical entity merges.
"""
import argparse
from collections import Counter
from copy import deepcopy
from datetime import datetime, timezone
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import unicodedata
import unittest
from urllib.parse import urlsplit
import jsonschema

PACKET=Path(__file__).resolve().parent
REPO=PACKET.parents[3]
REVISION='988a4ddcc4dbbc853da0c7f7899b6d6e7579f840'
sys.path.insert(0,str(REPO/'scripts'))
import plan_company_profiles as planner

def read(name):
    return json.loads((PACKET/name).read_text())

def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()

def normalized_name(value):
    return re.sub(r'[^a-z0-9]','',unicodedata.normalize('NFKD',value).encode('ascii','ignore').decode().casefold())

def normalized_host(value):
    return (urlsplit(value or '').hostname or '').casefold().removeprefix('www.')

def check_references(claims,sources,events):
    errors=[]
    registry={s['url']:s for s in sources}
    event_ids={e['id'] for e in events}
    ids=[]; fingerprints=[]
    for c in claims:
        ids.append(c['claim_id'])
        fingerprints.append(json.dumps({k:c.get(k) for k in ['entity_id','field','value','source_url','effective_on']},sort_keys=True,ensure_ascii=False))
        source=registry.get(c['source_url'])
        if not source or not source['accessed'] or c['accessed'] is not True:errors.append('unaccessed claim source')
        if source and c['source_id']!=source['source_id']:errors.append('source identity mismatch')
        if c['value'] is None:errors.append('null asserted as fact')
        if c['source_kind']=='discovery':errors.append('discovery treated as reviewed evidence')
        if c['field'] in ['round_participant','debt_arranger','debt_provider']:
            value=c['value']
            if value.get('event_id') not in event_ids:errors.append('orphan funding relationship')
            if not value.get('name'):errors.append('missing participant name')
        value=c['value']
        if c['field']=='funding_round' and isinstance(value,dict) and value.get('amount') is not None and not value.get('currency'):errors.append('numeric amount without currency')
    if len(ids)!=len(set(ids)):errors.append('duplicate claim identifiers')
    if len(fingerprints)!=len(set(fingerprints)):errors.append('duplicate assertions')
    for e in events:
        if e.get('amount') is not None and (e['amount']<=0 or not e.get('currency')):errors.append('bad funding amount')
        if e.get('announced_on') and not re.fullmatch(r'\d{4}-\d{2}-\d{2}',e['announced_on']):errors.append('partial date in day-only field')
        for p in e['participants']:
            if p['event_id']!=e['id'] or not p['claim_ids']:errors.append('participant without event provenance')
            if p['source_url'] not in registry or not registry[p['source_url']]['accessed']:errors.append('participant unaccessed source')
            if p['resolved_entity_id'] is not None:errors.append('unreviewed canonical investor mapping')
    return errors

class PacketTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.records=read('companies.research.json')['records']
        cls.claims=read('claim-ledger.json')['claims']
        cls.sources=read('source-registry.json')['sources']
        cls.events=read('funding-observations.json')['observations']
        cls.projection=read('startups.staged.json')['startups']
        cls.event_by_id={e['id']:e for e in cls.events}
        cls.record_by_key={r['key']:r for r in cls.records}

    def test_local_research_schema(self):
        schema=read('packet-schema.json')
        for kind,file in [('companies','companies.research.json'),('ledger','claim-ledger.json'),('funding','funding-observations.json')]:
            validator=jsonschema.Draft202012Validator({'$ref':f'#/$defs/{kind}','$defs':schema['$defs']},format_checker=jsonschema.FormatChecker())
            errors=list(validator.iter_errors(read(file)))
            self.assertEqual([],[(list(e.path),e.message) for e in errors])

    def test_existing_production_schema_and_rejections(self):
        result=subprocess.run(['node',str(PACKET/'validate_legacy.mjs')],text=True,capture_output=True)
        self.assertEqual(0,result.returncode,result.stderr+result.stdout)
        receipt=json.loads(result.stdout)
        self.assertTrue(receipt['valid']);self.assertEqual(receipt['records'],23)
        self.assertEqual(receipt['negative_cases_rejected'],8)

    def test_provenance_relationships_and_injected_failures(self):
        self.assertEqual([],check_references(self.claims,self.sources,self.events))
        bad_sources=deepcopy(self.sources)
        used=self.claims[0]['source_url']
        next(s for s in bad_sources if s['url']==used)['accessed']=False
        self.assertIn('unaccessed claim source',check_references(self.claims,bad_sources,self.events))
        bad=deepcopy(self.claims)
        next(c for c in bad if c['field']=='round_participant')['value']['event_id']='missing-event'
        self.assertIn('orphan funding relationship',check_references(bad,self.sources,self.events))

    def test_count_reconciliation_and_no_population_claim(self):
        candidates=read('candidate-register.json')['candidates'];coverage=read('coverage.json')
        counts=Counter(c['status'] for c in candidates)
        self.assertEqual(len(candidates),37);self.assertEqual(counts,{'accepted_staged':23,'deferred':2,'rejected':2,'queued':10})
        self.assertEqual(coverage['candidate_counts']['reviewed'],27)
        self.assertEqual(len(self.records),24);self.assertEqual(len(self.claims),401)
        self.assertEqual(len(self.sources),141);self.assertEqual(sum(s['accessed'] for s in self.sources),121)
        self.assertIsNone(coverage['national_denominator']);self.assertFalse(coverage['completeness_claim'])
        self.assertIsNone(coverage['cohort']['nominal_gdp_usd']);self.assertFalse(coverage['cohort']['rank_independently_verified'])
        self.assertTrue(all(not c['production_accepted'] for c in candidates))

    def test_alias_domain_deduplication_and_full_baseline(self):
        self.assertEqual(normalized_name('Jüsto'),normalized_name('Justo'))
        self.assertEqual(normalized_name('Konfío'),normalized_name('konfio'))
        self.assertEqual(normalized_host('https://WWW.Clip.MX/route'),normalized_host('https://clip.mx'))
        self.assertNotEqual(normalized_host('https://clip.mx.attacker.example'),normalized_host('https://clip.mx'))
        baseline=read('baseline.json')['identity_inventory'];rows=read('deduplication.json')['rows']
        self.assertEqual(len(baseline),555)
        for row in rows:
            names=set(row['normalized_names']);domain=row['canonical_domain']
            matches=[e for e in baseline if normalized_name(e['name']) in names or (domain and normalized_host(e.get('website'))==domain)]
            self.assertEqual(matches,row['baseline_matches']);self.assertFalse(matches);self.assertFalse(row['batch_matches'])
        self.assertEqual(len({r['canonical_domain'] for r in self.records}),len(self.records))

    def test_unknowns_conflicts_and_date_precision(self):
        for key in ['microterra','toroto','rutopia','yalo']:
            self.assertIsNone(self.record_by_key[key]['founding'])
            staged=next(r for r in self.projection if normalized_name(r['name'])==normalized_name(self.record_by_key[key]['name']))
            self.assertNotIn('founded_year',staged)
        self.assertIsNone(self.record_by_key['stori']['headquarters'])
        self.assertEqual(self.record_by_key['yalo']['headquarters']['country'],'United States')
        self.assertTrue(self.record_by_key['apli']['country_assignment']['qualification'].startswith('Historical'))
        for event in self.events:
            if event['date_precision']!='day':self.assertIsNone(event['announced_on'])
        for r in self.projection:
            self.assertNotEqual(r.get('founded_year'),0)
            for e in r.get('funding_rounds',[]):
                self.assertEqual('amount' in e,'currency' in e)
                self.assertNotEqual(e.get('amount'),0)
                if 'announced_on' in e:self.assertEqual(self.event_by_id[e['id']]['date_precision'],'day')

    def test_financing_identity_and_no_target_cumulative_double_count(self):
        projected={e['id'] for r in self.projection for e in r.get('funding_rounds',[])}
        self.assertEqual(len(self.events),26);self.assertEqual(len(projected),24)
        held={e['id'] for e in self.events if not e['projection_eligible']}
        self.assertEqual(held,{'konfio-2021-09-29-series-e-extension','sofia-reported-2026-05-funding'})
        self.assertFalse(projected&held)
        self.assertIsNone(self.event_by_id['rutopia-2024-10-23-seed']['amount'])
        self.assertNotIn('Fondo Nimbus',[p['name'] for p in self.event_by_id['rutopia-2024-10-23-seed']['participants']])
        self.assertTrue(all(not e['aggregation_eligible'] for e in self.events))
        self.assertEqual(self.event_by_id['justo-2024-10-17-equity']['announcement_group_id'],self.event_by_id['justo-2024-10-17-debt']['announcement_group_id'])
        self.assertTrue(all('source_document_group' in e['announcement_group_kind'] for e in self.events))
        for r in self.projection:
            for e in r.get('funding_rounds',[]):
                original=self.event_by_id[e['id']]
                if 'debt' in original['transaction_kind'] or 'facility' in original['transaction_kind']:
                    self.assertNotIn('amount',e,'Mixed financing and facilities must not look like primary-equity totals in the legacy projection.')

    def test_instrument_roles_and_no_portfolio_to_round_edge(self):
        stori=self.event_by_id['stori-2022-07-15-series-c2']
        self.assertNotIn('Davidson Kempner Capital Management LP',[p['name'] for p in stori['participants']])
        self.assertTrue(any(p['name']=='Davidson Kempner Capital Management LP' and p['role']=='lender' for p in stori['lenders']))
        self.assertNotIn('arrangers',stori)
        self.assertEqual(self.event_by_id['justo-2024-10-17-debt']['participants'],[])
        self.assertEqual(self.event_by_id['justo-2024-10-17-debt']['arrangers'][0]['role'],'arranger')
        kueski=self.event_by_id['kueski-2021-12-02-financing']['participants']
        self.assertTrue(any(p['name']=='Victory Park Capital' and p['component']=='debt' and p['role']=='lead' for p in kueski))
        self.assertTrue(any(p['name']=='StepStone Group' and p['component']=='equity' and p['role']=='lead' for p in kueski))
        self.assertEqual(self.record_by_key['microterra']['funding_observation_ids'],[])
        self.assertEqual(self.record_by_key['apli']['funding_observation_ids'],[])
        self.assertTrue(all(not r.get('relationships') for r in self.projection))

    def test_all_projected_facts_have_accessed_source(self):
        registry={s['url']:s for s in self.sources}
        def check(url):self.assertTrue(url in registry and registry[url]['accessed'],url)
        for r in self.projection:
            check(r['source'])
            for kind in ['founders','funding_rounds','profile_facts']:
                for item in r.get(kind,[]):check(item['source'])
        for r in self.records:
            self.assertTrue(r['country_assignment']['nexus_claim_ids'],r['name'])
            self.assertTrue(set(r['claim_ids']).issubset({c['claim_id'] for c in self.claims}))

    def test_existing_planner_resume_and_recorded_pages(self):
        first=planner.build_plan(PACKET/'startups.staged.json',PACKET/'unapproved-sources.csv',REVISION,10)
        replay=planner.build_plan(PACKET/'startups.staged.json',PACKET/'unapproved-sources.csv',REVISION,10)
        self.assertEqual(first,replay)
        pages=[first]
        while pages[-1]['next_cursor']:
            pages.append(planner.build_plan(PACKET/'startups.staged.json',PACKET/'unapproved-sources.csv',REVISION,10,pages[-1]['next_cursor']))
        self.assertEqual(pages,read('planner-pages.json')['pages'])
        names=[i['source_record_name'] for p in pages for i in p['items']]
        self.assertEqual(len(names),23);self.assertEqual(len(set(names)),23)
        self.assertEqual(names,sorted(r['name'] for r in self.projection))
        self.assertEqual(first['population']['seed_states']['approved_seed_ready'],0)
        self.assertEqual(first['population']['seed_states']['seed_review_required'],23)
        self.assertTrue(pages[-1]['inventory_exhausted'])

    def test_planner_rejects_stale_revision_inputs_and_page_size(self):
        cursor=planner.build_plan(PACKET/'startups.staged.json',PACKET/'unapproved-sources.csv',REVISION,10)['next_cursor']
        with self.assertRaises(ValueError):planner.build_plan(PACKET/'startups.staged.json',PACKET/'unapproved-sources.csv','b'*40,10,cursor)
        with self.assertRaises(ValueError):planner.build_plan(PACKET/'startups.staged.json',PACKET/'unapproved-sources.csv',REVISION,5,cursor)
        with tempfile.TemporaryDirectory() as tmp:
            changed=Path(tmp)/'overlay.json';changed.write_bytes((PACKET/'startups.staged.json').read_bytes()+b'\n')
            with self.assertRaises(ValueError):planner.build_plan(changed,PACKET/'unapproved-sources.csv',REVISION,10,cursor)

    def test_graph_builder_offline_integration_and_unknown_preservation(self):
        spec=importlib.util.spec_from_file_location('mexico_graph',REPO/'scripts/make-graph.py')
        graph_module=importlib.util.module_from_spec(spec);spec.loader.exec_module(graph_module)
        def load(name):return json.loads((REPO/'data'/name).read_text())
        inputs=[load(n) for n in ['partner-profiles.json','partner-leads.json','partners-reviewed.json','catalogue.json']]
        original=load('startup-research.json')
        combined=deepcopy(original);combined['startups'].extend(deepcopy(self.projection))
        graph=graph_module.build_graph(*inputs,combined)
        again=graph_module.build_graph(*inputs,combined)
        self.assertEqual(graph,again)
        self.assertEqual(len(graph['entities']),len({e['id'] for e in graph['entities']}))
        self.assertEqual(sum(e['kind']=='startup' for e in graph['entities']),69)
        self.assertEqual(len(graph['funding_rounds']),49)
        rounds={(e['startup_id'],e['id']) for e in graph['funding_rounds']}
        self.assertEqual(len(rounds),49)
        unknown=next(e for e in graph['entities'] if e['id']=='startup:microterra')
        self.assertNotIn('founded_year',unknown,'Owners PR179 is merged at the revalidation base; unknown years must stay absent.')
        type(self).graph_receipt={'entities':len(graph['entities']),'startups':69,'funding_rounds':49,'edges':len(graph['edges']),'articles':len(graph['articles']),'deterministic':True,'unknown_founding_years_preserved':True,'boundary_note':'Revalidated against main 988a4dd after owner PR179; unknown years remain omitted. No generated production graph written.'}

    def test_baseline_production_files_unchanged(self):
        for name,expected in read('baseline-current.json')['input_hashes'].items():self.assertEqual(sha(REPO/name),expected,name)

    def test_capture_limits_and_authoritative_ledger(self):
        ids={c['claim_id'] for c in self.claims}
        for batch in read('captures/index.json')['batches']:
            capture=read(batch['file'])
            self.assertLessEqual(len(capture['documents']),100)
            self.assertTrue(set(capture['included_claim_ids']).issubset(ids))
            self.assertTrue(all(len(d['text'])<=250000 for d in capture['documents']))

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--write-results',action='store_true');args=parser.parse_args()
    output=io.StringIO();suite=unittest.defaultTestLoader.loadTestsFromTestCase(PacketTests)
    result=unittest.TextTestRunner(stream=output,verbosity=2).run(suite)
    print(output.getvalue(),end='')
    receipt={'valid':result.wasSuccessful(),'tests_run':result.testsRun,'failures':len(result.failures),'errors':len(result.errors),'checked_at':datetime.now(timezone.utc).isoformat(),'baseline_revision':REVISION,'test_names':[line for line in output.getvalue().splitlines() if line.startswith('test_')],'graph_integration':getattr(PacketTests,'graph_receipt',None),'warning':'Offline structural and semantic safeguards plus reused production contracts; no source approval, production publication or national-completeness verification.'}
    if args.write_results:
        (PACKET/'validation/packet-validation.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n')
        legacy=subprocess.run(['node',str(PACKET/'validate_legacy.mjs')],text=True,capture_output=True)
        if legacy.returncode==0:(PACKET/'validation/legacy-schema.json').write_text(legacy.stdout)
    print(json.dumps(receipt,ensure_ascii=False,indent=2))
    raise SystemExit(0 if result.wasSuccessful() else 1)

if __name__=='__main__':main()
