#!/usr/bin/env python3
"""Offline semantic regression checks for this bounded Singapore research packet."""
import argparse
import copy
import hashlib
import importlib.util
import io
import json
import re
import subprocess
import unittest
from collections import Counter
from datetime import date, datetime
from pathlib import Path
from urllib.parse import urlsplit

PACKET = Path(__file__).resolve().parents[1]
REPO = PACKET.parents[3]
BASE = '988a4ddcc4dbbc853da0c7f7899b6d6e7579f840'


def read(name):
    return json.loads((PACKET / name).read_text())


def digest(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def pointer(document, path):
    current = document
    for part in path.split('/')[1:]:
        key = part.replace('~1', '/').replace('~0', '~')
        current = current[int(key)] if isinstance(current, list) else current[key]
    return current


def event_id(claim):
    v = claim.get('value')
    return (v.get('event_id') or v.get('id')) if isinstance(v, dict) else None


def https(url):
    parts = urlsplit(url)
    return parts.scheme == 'https' and bool(parts.hostname) and not parts.username and not parts.password


def integrity_errors(companies, claims, sources):
    errors = []
    cm = {c['id']: c for c in companies}
    sm = {s['id']: s for s in sources}
    lm = {c['claim_id']: c for c in claims}
    events = {e['id']: (c, e) for c in companies for e in c['funding_events']}
    if len(events) != sum(len(c['funding_events']) for c in companies): errors.append('duplicate_event_id')
    if len(lm) != len(claims): errors.append('duplicate_claim_id')
    if len(sm) != len(sources): errors.append('duplicate_source_id')
    for claim in claims:
        sid = claim.get('source_id')
        source = sm.get(sid)
        if not source or source['url'] != claim.get('source_url'):
            errors.append('claim_source_mismatch'); continue
        if source['access_status'] != 'accessed' or source.get('disposition', '').startswith('excluded'):
            errors.append('unusable_source_for_claim')
        if claim.get('accessed') is not True: errors.append('claim_not_accessed')
        if claim.get('publication_state') != 'unsubmitted': errors.append('false_production_state')
        if claim['field'] == 'round_participant':
            value = claim['value']; link = events.get(value.get('event_id'))
            if not link or claim['entity_id'] != link[0]['id'] or value.get('company_id') != link[0]['id']:
                errors.append('orphan_or_cross_company_participant'); continue
            if value.get('role') not in {'lead', 'participant', 'unspecified'}: errors.append('unsupported_participant_role')
            if not any(p['name'] == value.get('name') and p['role'] == value.get('role') for p in link[1]['participants']): errors.append('unmatched_participant_claim')
            if claim.get('source_kind') == 'discovery': errors.append('portfolio_promoted_to_round')
    for company in companies:
        if len(company['claim_ids']) != len(set(company['claim_ids'])): errors.append('duplicate_company_claim_ref')
        for cid in company['claim_ids']:
            if cid not in lm or lm[cid]['entity_id'] != company['id']: errors.append('company_claim_scope')
        founded = company['founded']
        if founded['value'] in (0, '0', 'null', 'unknown'): errors.append('founding_null_sentinel')
        if not company['headquarters'].get('source_urls'): errors.append('missing_hq_provenance')
        if company['incorporation']['country_code'] is not None: errors.append('unexpected_group_incorporation_inference')
        for event in company['funding_events']:
            if event.get('amount') == 0: errors.append('unknown_amount_zero')
            if event.get('amount') is not None and (not isinstance(event['amount'], int) or not re.fullmatch('[A-Z]{3}', str(event.get('currency')))): errors.append('amount_without_explicit_currency')
            if event['company_id'] != company['id']: errors.append('event_company_mismatch')
            if not any(lm[i]['field'] == 'funding_round' for i in event['claim_ids']): errors.append('event_without_round_claim')
            amount_claims = [lm[i] for i in event['claim_ids'] if lm[i]['field'] in {'funding_round', 'funding_amount'}]
            if event.get('amount') is not None and not any(x['value'].get('amount') == event['amount'] and x['value'].get('currency') == event['currency'] for x in amount_claims): errors.append('unsourced_amount_currency_pair')
            for participant in event['participants']:
                if not participant.get('claim_ids'): errors.append('participant_without_event_evidence')
                for cid in participant.get('claim_ids', []):
                    cl = lm.get(cid)
                    if not cl or cl['field'] != 'round_participant' or event_id(cl) != event['id'] or cl['value'].get('name') != participant['name']: errors.append('participant_claim_mismatch')
    return errors


class PacketTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.companies = read('companies.json')['companies']
        cls.by_name = {c['canonical_name']: c for c in cls.companies}
        cls.claims = read('claims.json')['claims']
        cls.claim_map = {c['claim_id']: c for c in cls.claims}
        cls.sources = read('sources.json')['sources']
        cls.records = read('staging/startup-records.json')
        cls.alumni = read('staging/alumni-records.json')
        cls.records_by_name = {r['name']: r for r in cls.records + cls.alumni}
        cls.coverage = read('coverage.json')
        cls.manifest = read('staging/manifest.json')

    def test_01_exact_bounded_counts(self):
        expected = {'discovered_candidates': 42, 'reviewed_companies': 25, 'accepted_startup_candidates': 24, 'accepted_alumni': 1, 'rejected_companies': 0, 'unreviewed_candidates': 17, 'founder_observations': 57, 'selected_financing_events': 36, 'atomic_claims': 468, 'source_rows': 143, 'distinct_source_urls': 143}
        for key, value in expected.items(): self.assertEqual(self.coverage['counts'][key], value, key)
        self.assertEqual(len(self.companies), 25)
        self.assertEqual(len(self.records), 24)
        self.assertEqual(sum(len(c['founders']) for c in self.companies), 57)
        self.assertEqual(sum(len(c['funding_events']) for c in self.companies), 36)
        self.assertEqual(len(self.claims), 468)

    def test_02_original_input_hashes(self):
        for entry in read('provenance/input-manifest.json')['inputs']:
            self.assertEqual(sha(PACKET / entry['file']), entry['sha256'])

    def test_03_claim_source_and_funding_integrity(self):
        self.assertEqual(integrity_errors(self.companies, self.claims, self.sources), [])

    def test_04_unique_canonical_domains_and_ids(self):
        domains, ids = set(), set()
        for company in self.companies:
            domain = urlsplit(company['website']).hostname.lower().removeprefix('www.').rstrip('.')
            self.assertEqual(domain, company['canonical_domain'])
            self.assertNotIn(domain, domains); domains.add(domain)
            self.assertNotIn(company['id'], ids); ids.add(company['id'])
            self.assertTrue(https(company['website']))
        self.assertEqual(self.by_name['Coda']['id'], 'startup:coda')
        self.assertEqual(self.by_name['Coda']['input_entity_id'], 'startup:coda-payments')
        self.assertTrue(any(a['name'] == 'codapayments.com' for a in self.by_name['Coda']['aliases']))

    def test_05_date_precision_and_nulls(self):
        patterns = {'year': r'\d{4}', 'month': r'\d{4}-\d{2}', 'day': r'\d{4}-\d{2}-\d{2}'}
        for company in self.companies:
            founded = company['founded']
            if founded['value'] is not None: self.assertRegex(founded['value'], '^' + patterns[founded['precision']] + '$')
            self.assertIsNone(company['incorporation']['date'])
            for event in company['funding_events']:
                self.assertIsNone(event['closed_on'])
                if event.get('announced_on'):
                    self.assertRegex(event['announced_on'], '^' + patterns[event['announced_precision']] + '$')
        self.assertIsNone(self.by_name['Glints']['founded']['value'])
        self.assertNotIn('founded_year', self.records_by_name['Glints'])
        self.assertEqual(self.by_name['Carousell']['founded']['value'], '2012-08')
        self.assertTrue(any('2012-08' in f['value'] for f in self.records_by_name['Carousell']['profile_facts'] if f['key'] == 'founding-observation'))

    def test_06_retrieval_and_source_types(self):
        kinds = {'primary_company', 'primary_investor', 'regulatory', 'secondary', 'discovery'}
        for claim in self.claims:
            self.assertTrue(https(claim['source_url']))
            self.assertIn(claim['source_kind'], kinds)
            self.assertNotEqual(claim['source_kind'], 'discovery')
            self.assertEqual(claim['retrieved_on'], '2026-11-18')
            self.assertEqual(claim['retrieval_timestamp_precision'], 'day')
            self.assertIsNotNone(datetime.fromisoformat(claim['retrieved_at'].replace('Z', '+00:00')).tzinfo)
            for field in ('published_on', 'effective_on'):
                if claim[field] is not None: date.fromisoformat(claim[field])
            self.assertTrue(claim['evidence'].strip())

    def test_07_headquarters_not_incorporation(self):
        self.assertIsNone(self.by_name['Nium']['headquarters']['country_code'])
        self.assertEqual(self.by_name['Nium']['headquarters']['country_codes'], ['SG', 'US'])
        self.assertEqual(self.by_name['Patsnap']['headquarters']['country_codes'], ['SG', 'GB', 'CA'])
        self.assertEqual(self.by_name['Trax']['headquarters']['as_of'], '2017-06-28')
        for name in ('Carousell', 'ShopBack'):
            self.assertIn('regional', self.records_by_name[name]['profile_facts'][0]['value'])
        self.assertIn('self-report', self.by_name['AMILI']['headquarters']['notes'])
        self.assertEqual(self.claim_map['sg-dt-41ae270d8909f362']['confidence'], 'medium')
        legal = [c for c in self.claims if c['field'] == 'related_legal_entity' and c['value'].get('country_code') == 'SG']
        self.assertEqual({c['entity_id'] for c in legal}, {'startup:coda', 'startup:endowus', 'startup:syfe', 'startup:stashaway'})
        for c in self.companies: self.assertIsNone(c['incorporation']['country_code'])

    def test_08_secondary_and_debt_excluded_from_equity_projection(self):
        self.assertFalse(self.records_by_name['Coda'].get('funding_rounds'))
        ids = {e['id'] for r in self.records for e in r.get('funding_rounds', [])}
        self.assertNotIn('funding-societies-debt-lines-2022-02-16', ids)
        self.assertEqual(next(e for e in self.by_name['Coda']['funding_events'])['transaction_kind'], 'secondary_share_sale')
        self.assertEqual(next(e for e in self.by_name['Funding Societies']['funding_events'] if e['transaction_kind'] == 'debt_facilities')['amount'], 150000000)

    def test_09_aggregate_tranches_are_not_duplicate_events(self):
        syfe = self.by_name['Syfe']['funding_events']
        event = next(e for e in syfe if e['stage'] == 'Series C')
        self.assertEqual(event['amount'], 80000000)
        self.assertEqual(sorted(c['amount'] for c in event['components']), [27000000, 53000000])
        self.assertEqual(len([e for e in syfe if e['stage'] == 'Series C']), 1)
        shopback = self.by_name['ShopBack']['funding_events']
        self.assertEqual(len(shopback), 1); self.assertEqual(shopback[0]['amount'], 200000000)
        lead = next(p for p in shopback[0]['participants'] if p['name'] == 'Asia Partners')
        self.assertIn('initial', lead.get('participation_scope', ''))

    def test_10_lower_bound_and_note_conversion(self):
        event = self.by_name['Endowus']['funding_events'][0]
        self.assertEqual(event['transaction_kind'], 'funding_and_note_conversion')
        self.assertEqual(event['amount_qualifier'], 'greater_than')
        self.assertEqual(event['components'][0]['amount'], 20000000)
        self.assertIsNone(event['components'][1]['amount'])
        projected = self.records_by_name['Endowus']['funding_rounds'][0]
        self.assertNotIn('amount', projected)
        self.assertIn('More than', projected['amount_text'])

    def test_11_ambiguous_currency_and_capex(self):
        seed = next(e for e in self.by_name['SpeQtral']['funding_events'] if e['stage'] == 'Seed')
        self.assertIsNone(seed['amount']); self.assertIsNone(seed['currency'])
        lions = self.by_name['LionsBot']['funding_events'][0]
        self.assertIsNone(lions['amount']); self.assertIsNone(lions['announced_on'])
        self.assertFalse(any(e.get('amount') == 12000000 for e in self.by_name['LionsBot']['funding_events']))

    def test_12_announcement_not_republication_or_close(self):
        self.assertEqual(self.by_name['Aspire']['funding_events'][0]['announced_on'], '2023-02-14')
        eureka = self.by_name['Eureka Robotics']['funding_events'][0]
        self.assertEqual(eureka['announced_on'], '2024-12-12')
        self.assertIsNone(eureka['closed_on'])
        self.assertEqual(len(self.by_name['Atomionics']['funding_events']), 1)
        self.assertEqual(len([c for c in self.claims if c['entity_id'] == 'startup:atomionics' and c['status'] == 'conflict']), 2)

    def test_13_investor_round_relationships(self):
        nium = self.by_name['Nium']['funding_events'][0]
        self.assertEqual(len(nium['participants']), 1)
        self.assertEqual(nium['participants'][0]['identity_status'], 'unnamed')
        self.assertFalse({'BOND', 'NewView Capital', 'Tribe Capital'} & {p['name'] for p in nium['participants']})
        for company in self.companies:
            for event in company['funding_events']:
                for p in event['participants']: self.assertIsNone(p['resolved_entity_id'])

    def test_14_listed_alumnus_separate(self):
        self.assertEqual([r['name'] for r in self.alumni], ['Horizon Quantum'])
        self.assertNotIn('Horizon Quantum', {r['name'] for r in self.records})
        self.assertEqual(self.by_name['Horizon Quantum']['disposition'], 'ecosystem_alumnus_listed')
        self.assertTrue(any(f['key'] == 'listed-alumnus-status' for f in self.alumni[0]['profile_facts']))

    def test_15_projection_pointers_and_sources(self):
        for mapping in read('staging/projection-map.json'):
            record = self.records_by_name[mapping['record_name']]
            for field in mapping['field_map']:
                pointer(record, field['pointer'])
                self.assertTrue(field['claim_ids'], (record['name'], field['pointer']))
                for cid in field['claim_ids']:
                    self.assertIn(cid, self.claim_map)
                    self.assertEqual(self.claim_map[cid]['entity_id'], mapping['company_id'])
                if field['pointer'].startswith('/profile_facts/'):
                    self.assertIn(pointer(record, field['pointer'])['source'], field['source_urls'])
                if field['pointer'].startswith('/funding_rounds/') and field['pointer'].count('/') == 2:
                    self.assertIn(pointer(record, field['pointer'])['source'], field['source_urls'])
        for record in self.records + self.alumni:
            for key in ('founders', 'funding_rounds', 'profile_facts'):
                for item in record.get(key, []): self.assertTrue(https(item['source']))

    def test_16_trax_split_source_projection(self):
        e = next(e for e in self.records_by_name['Trax']['funding_rounds'] if 'series-e' in e['id'])
        self.assertNotIn('amount', e); self.assertNotIn('announced_on', e)
        self.assertIn('primary and secondary', e['note'])
        facts = {f['key']: f for f in self.records_by_name['Trax']['profile_facts']}
        self.assertIn('lw.com', facts['trax-series-e-2021-04-07-funding-amount']['source'])
        self.assertIn('investing.com', facts['trax-series-e-2021-04-07-funding-announcement-date']['source'])

    def test_17_dedupe_baseline_and_normalization(self):
        d = read('deduplication.json')
        self.assertEqual(d['base_revision'], BASE)
        self.assertEqual(len(d['records']), 25)
        self.assertTrue(all(r['decision'] == 'new_candidate' and not r['existing_matches'] for r in d['records']))
        self.assertEqual(read('provenance/graph-replay.json')['baseline']['startups'], 46)
        self.assertEqual(read('provenance/graph-replay.json')['baseline']['rounds'], 25)
        self.assertEqual(d['future_namesake_guard']['existing_domain'], 'ascenda.one')
        spec = importlib.util.spec_from_file_location('sg_builder_test', PACKET / 'tools/build_packet.py')
        module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
        self.assertEqual(module.norm_domain('HTTPS://WWW.NIUM.COM/payments'), 'nium.com')
        self.assertEqual(module.norm_name('  PatSnap '), module.norm_name('Patsnap'))
        self.assertNotEqual(module.norm_domain('ascenda.one'), module.norm_domain('ascenda.com'))

    def test_18_resumable_bounded_queue(self):
        q = self.coverage['next_candidates']; resume = self.coverage['resume']
        self.assertEqual(digest(q), resume['queue_sha256'])
        self.assertEqual(resume['all_pending_ids'], [x['queue_id'] for x in q])
        self.assertEqual(len({x['queue_id'] for x in q}), 17)
        self.assertEqual(resume['next_index'], 0)
        done = {x['queue_id'] for x in q[:5]}
        pending = [x for x in q if x['queue_id'] not in done]
        self.assertEqual(len(pending), 12)
        self.assertEqual(pending[0]['queue_id'], q[5]['queue_id'])
        self.assertIsNone(self.coverage['national_denominator'])
        self.assertFalse(self.coverage['complete_country_claim'])
        for x in q: self.assertFalse(x['seed_approval'])

    def test_19_access_restrictions_and_gaps(self):
        access = Counter(s['access_status'] for s in self.sources)
        self.assertEqual(access['blocked'], 8)
        excluded = [s for s in self.sources if s.get('disposition', '').startswith('excluded')]
        self.assertEqual(len(excluded), 1)
        self.assertEqual(excluded[0]['claim_ids'], [])
        self.assertFalse(self.manifest['cohort']['independently_verified'])
        self.assertIsNone(self.manifest['cohort']['nominal_gdp_value'])
        self.assertTrue(all(s.get('crawler_seed_approved') is False for s in self.sources))

    def test_20_no_schema_or_production_mutations(self):
        schema = REPO / self.manifest['schema_module']
        self.assertEqual(sha(schema), self.manifest['schema_module_sha256'])
        self.assertEqual(self.manifest['production_targets_modified'], [])
        for file in ['data/startup-research.json', 'data/company-profile-seeds.csv', 'scripts/make-graph.py', 'backend/hosted/src/startup-record.mjs']:
            original = subprocess.check_output(['git', 'show', f'{BASE}:{file}'], cwd=REPO)
            self.assertEqual(original, (REPO / file).read_bytes(), file)
        self.assertEqual(self.manifest['production_publication_state'], 'unsubmitted')
        self.assertFalse(self.manifest['seed_approval'])

    def test_21_existing_owner_graph_fix_is_respected(self):
        replay = read('provenance/graph-replay.json')
        self.assertEqual(replay['new_funding_id_collisions'], 0)
        self.assertEqual(replay['production_files_written'], 0)
        self.assertEqual(replay['existing_builder_unknown_year_zero_sentinel'], [])
        self.assertIn('startup:glints', replay['omitted_founded_year_ids'])
        self.assertIn('/pull/179', replay['owner_fix'])
        self.assertEqual(replay['simulation']['startups'], 70)

    def test_22_negative_missing_hq_source(self):
        cc = copy.deepcopy(self.companies); cc[0]['headquarters']['source_urls'] = []
        self.assertIn('missing_hq_provenance', integrity_errors(cc, self.claims, self.sources))

    def test_23_negative_zero_unknown_amount(self):
        cc = copy.deepcopy(self.companies)
        cc[0]['funding_events'][0]['amount'] = 0
        self.assertIn('unknown_amount_zero', integrity_errors(cc, self.claims, self.sources))

    def test_24_negative_orphan_participant(self):
        cl = copy.deepcopy(self.claims)
        item = next(x for x in cl if x['field'] == 'round_participant')
        item['value']['event_id'] = 'unrelated-event'
        self.assertIn('orphan_or_cross_company_participant', integrity_errors(self.companies, cl, self.sources))

    def test_25_negative_portfolio_inference(self):
        cl = copy.deepcopy(self.claims)
        next(x for x in cl if x['field'] == 'round_participant')['source_kind'] = 'discovery'
        self.assertIn('portfolio_promoted_to_round', integrity_errors(self.companies, cl, self.sources))

    def test_26_negative_source_access_failure(self):
        ss = copy.deepcopy(self.sources)
        used = next(s for s in ss if s['claim_ids'])
        used['access_status'] = 'blocked'
        self.assertIn('unusable_source_for_claim', integrity_errors(self.companies, self.claims, ss))

    def test_27_exact_claim_statuses(self):
        self.assertEqual(Counter(c['status'] for c in self.claims), {'reviewed_staged': 462, 'conflict': 6})
        self.assertEqual(len(read('decisions.json')['rejected_interpretations']), 18)


def main():
    parser = argparse.ArgumentParser(); parser.add_argument('--out', type=Path)
    args = parser.parse_args()
    stream = io.StringIO()
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(PacketTests)
    result = unittest.TextTestRunner(stream=stream, verbosity=2).run(suite)
    schema = subprocess.run(['node', str(PACKET / 'tests/validate_schema.mjs')], cwd=REPO, text=True, capture_output=True)
    try: schema_result = json.loads(schema.stdout)
    except json.JSONDecodeError: schema_result = {'valid': False, 'error': schema.stderr or schema.stdout}
    receipt = {'valid': result.wasSuccessful() and schema.returncode == 0, 'base_revision': BASE, 'tests_run': result.testsRun, 'failures': len(result.failures), 'errors': len(result.errors), 'test_log': stream.getvalue(), 'production_schema': schema_result, 'inputs': {name: sha(PACKET / name) for name in ['companies.json', 'claims.json', 'sources.json', 'staging/startup-records.json', 'staging/alumni-records.json', 'staging/projection-map.json', 'coverage.json']}, 'scope': 'Offline structural, provenance and bounded-regression checks. Independent source reviews are in reviews/. No production import, crawler run or completeness claim.'}
    text = json.dumps(receipt, ensure_ascii=False, indent=2) + '\n'
    if args.out: args.out.write_text(text)
    print(text)
    raise SystemExit(0 if receipt['valid'] else 1)


if __name__ == '__main__': main()
