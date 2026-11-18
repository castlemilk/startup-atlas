#!/usr/bin/env python3
"""Offline, packet-scoped checks. No crawl, production write or seed approval.

Run from any directory with Python 3.10+ and Node 20+ available. The strict
production-record check imports the repository's actual validator; this file
does not define or extend an Atlas API. Checksums are checked separately.
"""
from pathlib import Path
from urllib.parse import urlsplit
import hashlib
import importlib.util
import json
import re
import subprocess
import tempfile
import unicodedata
import unittest

PACKET = Path(__file__).resolve().parent
REPO = PACKET.parents[3]


def read(name):
    return json.loads((PACKET / name).read_text())


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()).hexdigest()


def name_key(value):
    return ' '.join(unicodedata.normalize('NFKC', value).casefold().split())


def domain_key(value):
    return (urlsplit(value).hostname or '').lower().rstrip('.').removeprefix('www.')


def referenced_source_ids(value):
    if isinstance(value, dict):
        for key, item in value.items():
            if key.endswith('source_ids'):
                yield from item
            elif key == 'source_id' and isinstance(item, str):
                yield item
            else:
                yield from referenced_source_ids(item)
    elif isinstance(value, list):
        for item in value:
            yield from referenced_source_ids(item)


class PacketChecks(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.companies = read('companies.json')['companies']
        cls.records = read('staged-startups.json')['startups']
        cls.historical = read('historical-startups.json')['startups']
        cls.claims = read('claims.json')['claims']
        cls.sources = read('sources.json')['sources']
        cls.source_map = {s['id']: s for s in cls.sources}
        cls.by_name = {c['canonical_name']: c for c in cls.companies}
        cls.projections = {r['name']: r for r in cls.records + cls.historical}

    def test_current_strict_atlas_schema_and_negative_cases(self):
        script = r'''
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const [packet, repo] = process.argv.slice(1);
const {validateStartupRecord} = await import(pathToFileURL(path.join(repo,'backend/hosted/src/startup-record.mjs')));
const records = ['staged-startups.json','historical-startups.json'].flatMap(file => JSON.parse(readFileSync(path.join(packet,file),'utf8')).startups);
for (const record of records) validateStartupRecord(record);
const base = {name:'Validation fixture',source:'https://example.com/source',reviewed_at:'2026-01-01'};
assert.throws(() => validateStartupRecord({...base,country_code:'IL'}));
assert.throws(() => validateStartupRecord({...base,founded_year:0}));
assert.throws(() => validateStartupRecord({...base,founded_year:null}));
const round = {id:'fixture-seed',stage:'Seed',source:'https://example.com/round'};
assert.throws(() => validateStartupRecord({...base,funding_rounds:[{...round,amount:1}]}));
assert.throws(() => validateStartupRecord({...base,funding_rounds:[{...round,currency:'USD'}]}));
assert.throws(() => validateStartupRecord({...base,funding_rounds:[round,round]}));
assert.throws(() => validateStartupRecord({...base,funding_rounds:[{...round,announced_on:'2025-01'}]}));
validateStartupRecord({...base,funding_rounds:[round]});
validateStartupRecord({...base,funding_rounds:[{...round,amount:0,currency:'USD'}]});
'''
        result = subprocess.run(['node', '--input-type=module', '-e', script, str(PACKET), str(REPO)], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_normalization_and_dedup_against_pinned_inventory(self):
        self.assertEqual(name_key('  QＥＤＭＡ  '), 'qedma')
        self.assertEqual(domain_key('https://WWW.QODO.AI./about?x=1'), 'qodo.ai')
        baseline = read('baseline-identities.json')
        existing = baseline['overlay_identities'] + baseline['published_startups'] + baseline['non_startup_entity_identities']
        seen_names, seen_domains = {}, set()
        for company in self.companies:
            keys = {name_key(company['canonical_name']), *(name_key(a['value']) for a in company['aliases'])}
            domain = domain_key(company['website'])
            self.assertEqual(domain, company['canonical_domain'])
            self.assertNotIn(domain, seen_domains)
            seen_domains.add(domain)
            for key in keys:
                self.assertNotIn(key, seen_names)
                seen_names[key] = company['candidate_id']
            for old in existing:
                self.assertNotIn(name_key(old['name']), keys)
                if old.get('website'):
                    self.assertNotEqual(domain_key(old['website']), domain)
        self.assertEqual(read('deduplication.json')['baseline_collisions'], [])
        self.assertEqual(len(read('deduplication.json')['comparisons']), len(self.companies))

    def test_baseline_input_hashes_and_planner_pagination(self):
        baseline = read('baseline-identities.json')
        self.assertEqual(hashlib.sha256((REPO/'data/startup-research.json').read_bytes()).hexdigest(), baseline['overlay_sha256'])
        self.assertEqual(hashlib.sha256((REPO/'data/company-profile-seeds.csv').read_bytes()).hexdigest(), baseline['seeds_sha256'])
        pages = read('baseline-planner.json')['pages']
        self.assertEqual([p['offset'] for p in pages], [0, 10, 20, 30, 40])
        self.assertEqual(len({p['plan_id'] for p in pages}), 1)
        items = [i for page in pages for i in page['items']]
        self.assertEqual(len(items), baseline['overlay_records'])
        self.assertEqual(len({i['source_record_name'] for i in items}), len(items))
        self.assertTrue(pages[-1]['inventory_exhausted'])
        self.assertIsNone(pages[-1]['next_cursor'])
        self.assertTrue(all(i['collection_state'] == 'not_assessed' for i in items))

    def test_existing_graph_and_planner_with_temporary_combined_input(self):
        # Exercise existing implementations in memory/temporary files only.
        spec = importlib.util.spec_from_file_location('atlas_graph', REPO/'scripts/make-graph.py')
        graph_module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(graph_module)
        import sys
        sys.path.insert(0, str(REPO/'scripts'))
        try:
            import plan_company_profiles as planner
        finally:
            sys.path.pop(0)
        data = lambda name: json.loads((REPO/'data'/name).read_text())
        arguments = [data(name) for name in ['partner-profiles.json','partner-leads.json','partners-reviewed.json','catalogue.json']]
        original = data('startup-research.json')
        combined = {**original, 'startups':original['startups']+self.records}
        baseline = graph_module.build_graph(*arguments, original)
        preview = graph_module.build_graph(*arguments, combined)
        baseline_nodes = {e['id']:e for e in baseline['entities']}
        preview_nodes = {e['id']:e for e in preview['entities']}
        self.assertEqual({key:preview_nodes[key] for key in baseline_nodes}, baseline_nodes)
        self.assertEqual(sum(e['kind']=='startup' for e in preview['entities']), 67)
        # The existing owner's merged #179 fix must preserve Qodo's unknown year.
        self.assertNotIn('founded_year', preview_nodes['startup:qodo'])
        self.assertEqual(len({e['id'] for e in preview['funding_rounds']}), len(preview['funding_rounds']))
        with tempfile.TemporaryDirectory(prefix='atlas-israel-validation-') as directory:
            overlay = Path(directory)/'overlay.json'
            overlay.write_text(json.dumps(combined))
            cursor, items, pages = None, [], 0
            revision = read('main-refresh.json')['verified_main_revision']
            while True:
                page = planner.build_plan(overlay, REPO/'data/company-profile-seeds.csv', revision, 10, cursor)
                pages += 1
                items.extend(page['items'])
                cursor = page['next_cursor']
                if cursor is None:
                    break
                self.assertLess(pages, 8)
            self.assertEqual((len(items),pages), (66,7))
            self.assertEqual(len({i['source_record_name'] for i in items}),66)
            selected = {r['name'] for r in self.records}
            self.assertTrue(all(i['seed_state']=='seed_review_required' for i in items if i['source_record_name'] in selected))

    def test_provenance_sources_and_resolvable_raw_pointers(self):
        self.assertEqual(len(self.sources), len(self.source_map))
        for source in self.sources:
            url = urlsplit(source['url'])
            self.assertEqual(url.scheme, 'https')
            self.assertIsNone(url.username)
            self.assertIsNone(url.password)
            self.assertNotEqual(url.path.rstrip('/').lower(), '/robots.txt')
            self.assertEqual(source['retrieved_on'], '2026-11-18')
            self.assertFalse(source['crawler_seed_approved'])
        for file in ['companies.json','claims.json','conflicts.json','discovery-candidates.json','next-source-queue.json']:
            for source_id in referenced_source_ids(read(file)):
                self.assertIn(source_id, self.source_map, (file, source_id))
        for company in self.companies:
            file, pointer = company['raw_record_reference'].split('#')
            value = read(file)
            for segment in pointer.strip('/').split('/'):
                value = value[int(segment)] if isinstance(value, list) else value[segment]
            self.assertEqual(value.get('canonical_name', value.get('name')), company['canonical_name'])
        self.assertEqual(len({c['claim_id'] for c in self.claims}), len(self.claims))
        for claim in self.claims:
            if claim['status'] != 'reviewed_staged':
                self.assertIsNone(claim['value'])
                self.assertTrue(claim['rationale'])
                continue
            self.assertIsNotNone(claim['value'])
            self.assertTrue(claim['accessed'])
            self.assertIn(claim['source_url'], claim['supporting_source_urls'])
            for sid in claim['source_ids']:
                self.assertTrue(self.source_map[sid]['accessed'], sid)
            self.assertRegex(claim['retrieved_at'], r'T.*(?:Z|[+]\d\d:\d\d)$')

    def test_missing_values_date_precision_and_acquisition_holds(self):
        self.assertEqual({r['name'] for r in self.historical}, {'Hailo','Oasis Security','Bluewhite'})
        self.assertTrue(all(c['company_status']['value'] is None for c in self.companies if c['disposition'] == 'accepted_staged'))
        qodo = self.by_name['Qodo']
        self.assertIsNone(qodo['founding']['value'])
        self.assertEqual(qodo['founding']['status'], 'conflict')
        self.assertNotIn('founded_year', self.projections['Qodo'])
        self.assertFalse(any(f['key'] == 'founding' for f in self.projections['Qodo']['profile_facts']))
        for company in self.companies:
            founded = company['founding']
            if founded['value'] is not None:
                pattern = {'year':r'\d{4}', 'month':r'\d{4}-\d{2}', 'day':r'\d{4}-\d{2}-\d{2}'}[founded['precision']]
                self.assertRegex(str(founded['value']), '^'+pattern+'$')
                self.assertEqual(self.projections[company['canonical_name']]['founded_year'], int(str(founded['value'])[:4]))
        self.assertTrue(self.by_name['Deepdub']['access_policy'])
        self.assertTrue(self.by_name['Pentera']['access_policy'])
        for name in ['Qodo','D-ID','Deepdub','Quantum Machines','Qedma']:
            self.assertIsNone(self.by_name[name]['incorporation']['value']['country_code'])

    def test_financing_parentage_currency_and_non_additive_observations(self):
        events = {e['id']:(c,e) for c in self.companies for e in c['funding_events']}
        self.assertEqual(len(events), sum(len(c['funding_events']) for c in self.companies))
        projected = {e['id']:e for record in self.records+self.historical for e in record.get('funding_rounds',[])}
        self.assertEqual(set(events), set(projected))
        for eid, (company,event) in events.items():
            projection = projected[eid]
            if event.get('currency') is None:
                self.assertNotIn('amount', projection)
                self.assertNotIn('currency', projection)
            else:
                self.assertEqual((projection['amount'], projection['currency']), (event['amount'], event['currency']))
                self.assertTrue(event.get('currency_source_ids'), eid)
                self.assertTrue(all(sid in event['source_ids'] for sid in event['currency_source_ids']))
            precision = event.get('announced_on_precision', event.get('date_precision'))
            if precision != 'day' or event.get('announced_on') is None:
                self.assertNotIn('announced_on', projection)
            if event.get('parent_event_id'):
                self.assertIn(event['parent_event_id'], events)
                self.assertEqual(events[event['parent_event_id']][0]['proposed_id'], company['proposed_id'])
            self.assertNotEqual(event.get('amount'), 0)
        ai21 = projected['ai21-labs-2023-series-c']
        self.assertEqual(ai21['announced_on'], '2023-11-21')
        self.assertIn('208', ai21['amount_text'])
        self.assertEqual(len(self.by_name['AI21 Labs']['funding_events']), 1)
        self.assertEqual(events['classiq-2025-11-strategic-up-round'][1]['event_period_precision'], 'month')
        self.assertTrue(self.by_name['Aidoc']['funding_observations'])

    def test_event_specific_participants_without_canonical_edges(self):
        expected = [(c['proposed_id'],e['id'],p) for c in self.companies for e in c['funding_events'] for p in e['participants']]
        claims = [c for c in self.claims if c['field']=='round_participant']
        self.assertEqual(len(claims), len(expected))
        actual = {(c['value']['company_id'],c['value']['event_id'],c['value']['name']):c for c in claims}
        self.assertEqual(len(actual), len(claims))
        for company,event,participant in expected:
            claim = actual[(company,event,participant['name'])]
            self.assertEqual(claim['source_ids'], participant['source_ids'])
            self.assertEqual(claim['value']['role_as_reported'], participant['role'])
            self.assertIsNone(claim['value']['resolved_entity_id'])
            for field in ['entity_kind','identity_note','vehicle_as_stated']:
                if field in participant:
                    self.assertEqual(claim['value'][field], participant[field])
        self.assertTrue(all('relationships' not in record for record in self.records+self.historical))

    def test_resume_digest_and_conservative_coverage(self):
        queue, coverage = read('next-source-queue.json'), read('coverage.json')
        pending = queue['pending_items']
        self.assertEqual(queue['queue_sha256'], digest(pending))
        self.assertEqual(queue['next_item_id'], pending[0]['item_id'])
        self.assertEqual(len({x['item_id'] for x in pending}), len(pending))
        self.assertEqual(set(queue['completed_company_ids']), {c['candidate_id'] for c in self.companies})
        self.assertFalse(set(queue['completed_company_ids']) & {x['item_id'] for x in pending})
        self.assertTrue(all(x['state']=='pending' and x['crawl_seed_approved'] is False for x in pending))
        self.assertFalse(queue['source_pagination_exhausted'])
        self.assertIsNone(queue['national_denominator'])
        self.assertIsNone(coverage['national_startup_denominator'])
        self.assertEqual(coverage['reviewed_company_candidates'], len(self.companies))
        self.assertEqual(coverage['accepted_staged_company_records'], len(self.records))
        self.assertEqual(coverage['held_historical_acquired_records'], len(self.historical))
        self.assertEqual(coverage['discovered_company_candidates'], len(self.companies)+len(read('discovery-candidates.json')['candidates']))
        self.assertEqual(coverage['claims'], len(self.claims))
        self.assertEqual(coverage['round_participant_claims'], len([c for c in self.claims if c['field']=='round_participant']))
        self.assertEqual(coverage['unique_registered_source_urls'], len({s['url'] for s in self.sources}))
        for field in ['production_records_changed','published_records','new_crawler_seed_approvals','canonical_investor_edges_created','crawls_run']:
            self.assertEqual(coverage[field], 0)


if __name__ == '__main__':
    unittest.main(verbosity=2)
