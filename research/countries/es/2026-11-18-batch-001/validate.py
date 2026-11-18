#!/usr/bin/env python3
"""Offline integration checks for this bounded research packet; never publishes.

Uses the current repository record validator, graph builder and #177 planner.
Writes only packet receipts when --write-receipts is explicitly supplied.
"""
import argparse
import copy
import hashlib
import importlib.util
import json
from collections import Counter, defaultdict
from datetime import date, datetime, timezone
from pathlib import Path
import re
import subprocess
import sys
import tempfile
from urllib.parse import urlsplit

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(ROOT / 'scripts'))
import project
import plan_company_profiles as planner

def read(name):
    return json.loads((HERE / name).read_text(encoding='utf-8'))

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def https(url):
    p = urlsplit(url)
    return p.scheme == 'https' and bool(p.hostname) and not p.username and not p.password and p.port in (None, 443)

def host(url):
    return urlsplit(url).hostname.lower().removeprefix('www.') if url else None

def source_value_claims(claims, field, value):
    return [c for c in claims if c['field'] == field and c.get('value') == value]

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--write-receipts', action='store_true')
    args = parser.parse_args()
    tests = []
    def check(name, condition, detail=None):
        if not condition:
            raise AssertionError((name, detail))
        tests.append({'name': name, 'passed': True, **({'detail': detail} if detail is not None else {})})

    companies = read('companies.json')['companies']
    claims = read('claims.json')['claims']
    sources = read('source-registry.json')['sources']
    records = read('startups.json')['startups']
    mapping = read('projection-map.json')['records']
    queue = read('next-source-queue.json')
    baseline = read('baseline.json')
    validation_baseline = read('validation-baseline.json')
    claim_by = {c['claim_id']: c for c in claims}
    source_by = {s['id']: s for s in sources}
    company_by = {c['name']: c for c in companies}
    events = {e['id']: (c,e) for c in companies for e in c['funding_events']}

    check('unique_company_and_staging_ids', len(companies) == len(company_by) == len({c['staging_id'] for c in companies}))
    check('unique_source_and_claim_ids', len(source_by) == len(sources) and len(claim_by) == len(claims))
    check('unique_event_ids', len(events) == sum(len(c['funding_events']) for c in companies))
    check('source_urls_are_public_https', all(https(s['url']) for s in sources))
    check('source_retrieval_timezone_and_calendar_date', all(datetime.fromisoformat(s['retrieved_at'].replace('Z','+00:00')).utcoffset() is not None and s['retrieved_at'][:10] == '2026-11-18' for s in sources))
    check('no_approved_sources', all(s['crawler_seed_status'] == 'not_approved' for s in sources))
    check('claims_are_unsubmitted', all(c['publication_state'] == 'unsubmitted' for c in claims))
    semantic = set()
    dispositions = {'searched_unknown', 'unsearched', 'blocked', 'rejected', 'not_applicable'}
    for c in claims:
        if c['status'] in dispositions:
            assert c.get('rationale')
            if c['status'] == 'searched_unknown': assert c.get('search_log')
            continue
        s = source_by[c['source_id']]
        assert c['source_url'] == s['url'] and c['source_kind'] == s['kind']
        assert c['value'] is not None and c.get('evidence') and c.get('rationale')
        assert c['confidence'] in {'high','medium','low'}
        assert c['source_kind'] in {'primary_company','primary_investor','regulatory','secondary','discovery'}
        for k in ['published_on','effective_on']:
            if c[k] is not None: assert date.fromisoformat(c[k]).isoformat() == c[k]
        assert datetime.fromisoformat(c['retrieved_at'].replace('Z','+00:00')).utcoffset() is not None
        if c['status'] == 'reviewed_staged':
            assert c['accessed'] is True and s['accessed'] is True and s['kind'] != 'discovery'
            assert not s['rights_review_required']
            assert datetime.fromisoformat(c['reviewed_at'].replace('Z','+00:00')).utcoffset() is not None
        key = json.dumps({k:c.get(k) for k in ['entity_id','field','value','source_url','effective_on']},sort_keys=True,ensure_ascii=False)
        assert key not in semantic, c['claim_id']; semantic.add(key)
    check('claim_provenance_status_dates_and_semantic_uniqueness', True)

    for c in companies:
        assert c['canonical_domain'] == host(c['website']) and c['existing_entity_id'] is None
        assert set(c['claim_ids']) <= set(claim_by)
        for founder in c.get('founders') or []:
            assert founder['resolved_entity_id'] is None and founder['claim_ids']
        for event in c['funding_events']:
            if event['amount'] is not None:
                assert type(event['amount']) is int and event['amount'] > 0 and re.fullmatch(r'[A-Z]{3}',event['currency'])
            assert event['closed_on'] is None, 'This bounded pass did not establish exact close dates.'
            assert event['claim_ids']
            for participant in event.get('participants') or []:
                assert participant['resolved_entity_id'] is None and participant['claim_ids']
                for cid in participant['claim_ids']:
                    cl = claim_by[cid]; val = cl['value']
                    assert cl['field'] in {'round_participant','financing_provider'}
                    assert val['event_id'] == event['id']
                    assert project.normalized_name(val['name']) == project.normalized_name(participant['name'])
    check('company_founder_funding_referential_integrity', True)
    check('explicit_unknown_not_zero_amounts', all(e['amount'] != 0 for _,e in events.values()))
    check('founder_and_funding_coverage_not_claimed_complete', all('unknown_denominator' in c['founders_completeness'] and 'unknown_denominator' in c['funding_history_completeness'] for c in companies))

    expected, expected_map, expected_seeds = project.generate()
    check('deterministic_projection_matches_committed_records', expected == read('startups.json'))
    check('deterministic_projection_map_matches', expected_map == read('projection-map.json'))
    check('unapproved_seed_file_matches_projection', expected_seeds == (HERE/'collector-seeds.csv').read_text())
    for m in mapping:
        for path in m['paths']:
            if path['path'] == '/reviewed_at': continue
            assert path['claim_ids'] and path['source_ids']
            for cid in path['claim_ids']:
                cl=claim_by[cid];assert cl['status']=='reviewed_staged' and not source_by[cl['source_id']]['rights_review_required']
    check('every_projected_group_has_eligible_claim_provenance', True)
    check('no_typed_investor_or_unresolved_relationship_projection', all('relationships' not in r and all('participants' not in e for e in r.get('funding_rounds',[])) for r in records))

    node = json.loads(subprocess.check_output(['node',str(HERE/'validate-records.mjs')],cwd=ROOT,text=True))
    check('current_runtime_record_validator_and_negative_fixtures', node['valid'], node)
    try:
        import jsonschema
        schema=json.loads(subprocess.check_output(['node',str(HERE/'validate-records.mjs'),'--schema'],cwd=ROOT,text=True))
        for r in records: jsonschema.Draft202012Validator(schema,format_checker=jsonschema.FormatChecker()).validate(r)
        check('exported_current_json_schema', True, {'records':len(records)})
    except ImportError:
        tests.append({'name':'exported_current_json_schema','passed':None,'detail':'jsonschema optional dependency unavailable; exact runtime validator still required above.'})

    byname={r['name']:r for r in records}; projected_events={e['id']:e for r in records for e in r.get('funding_rounds',[])}
    check('founding_conflicts_not_numeric_or_zero', all('founded_year' not in byname[n] for n in ['Quibim','INBRAIN Neuroelectronics']))
    check('unknown_founders_omitted_not_empty_fact', 'founders' not in byname['Cocoon Bioscience'])
    for n in ['Seqera','INBRAIN Neuroelectronics','Quibim']:
        for e in byname[n]['funding_rounds']:
            if 'currency not explicit' in e.get('amount_text','') or 'currency not explicit' in e.get('note','') or 'ISO currency not explicit' in e.get('amount_text','') or 'dollar currency not explicit' in e.get('amount_text',''):
                assert 'amount' not in e and 'currency' not in e
    check('ambiguous_dollar_currency_not_guessed', all('amount' not in projected_events[x] and 'currency' not in projected_events[x] for x in ['es-seqera-series-b-2025-05-06','es-inbrain-neuroelectronics-series-b-2024-10-29','es-reg-quibim-series-a-2025']))
    check('partial_dates_not_padded_or_replaced_by_publication_date', all('announced_on' not in projected_events[x] for x in ['es-reg-pld-series-c-2026-initial','es-reg-matteco-series-a-2024','es-reg-ipronics-series-b-2026','es-mad-cabify-event-eib-loan-2022-12-13','es-mad-payflow-event-cusp-reported-2025-06-02']))
    check('mixed_funding_lower_bounds_and_interim_close_text_only', all('amount' not in projected_events[x] for x in ['es-mad-idoven-event-eic-package-announced-2022-06-21','es-mad-payflow-event-cusp-reported-2025-06-02','es-mad-bdeo-event-mixed-financing-2023-06-29','es-mad-seedtag-event-advent-2022-07-27','es-submer-growth-2024-10-03']))
    check('bdeo_intermediary_relationship_survives_legacy_note', 'CDTI participated through K Fund' in projected_events['es-mad-bdeo-event-mixed-financing-2023-06-29']['note'])
    check('targets_facilities_contributions_extension_and_history_not_imported', all(i not in projected_events for i,(_,e) in events.items() if e['projection_policy']['mode']=='sidecar_only'))
    check('rebrand_single_entity', 'Perk' in byname and 'TravelPerk' not in byname and any(a['name']=='TravelPerk' for a in company_by['Perk']['aliases']))
    check('base_not_mislabelled_headquarters', all(company_by[n]['headquarters'] is None and company_by[n].get('reported_base') for n in ['Clikalia','Idoven','Sateliot']))
    check('foreign_and_cross_border_hq_scope_preserved', company_by['Perk']['scope_class']=='spain_origin_foreign_hq' and company_by['Seedtag']['headquarters']['global_headquarters'] is None)
    check('zeleros_historical_not_active_or_dissolution_assertion', 'Zeleros' not in byname and company_by['Zeleros']['review_disposition'].startswith('rejected_current'))
    check('multiverse_independent_projection_only', len(byname['Multiverse Computing']['founders'])==2 and 'bullhoundcapital.com' in byname['Multiverse Computing']['source'] and not any(f['key']=='incorporation' for f in byname['Multiverse Computing']['profile_facts']))

    # Build existing graph in memory, so portfolio-only startups also participate in dedup.
    spec=importlib.util.spec_from_file_location('make_graph',ROOT/'scripts/make-graph.py');graphmod=importlib.util.module_from_spec(spec);spec.loader.exec_module(graphmod)
    load=lambda n:json.loads((ROOT/'data'/n).read_text())
    inputs=[load(n) for n in ['partner-profiles.json','partner-leads.json','partners-reviewed.json','catalogue.json']]
    overlay=load('startup-research.json');before=graphmod.build_graph(*inputs,overlay)
    existing=[e for e in before['entities'] if e['kind']=='startup']
    exact_existing={project.normalized_name(e['name']):e['id'] for e in existing}
    domain_existing={host(e.get('website')):e['id']for e in existing if e.get('website')}
    collisions=[];alias_collisions=[];keys={};domains={}
    for c in companies:
        names=[c['name']]+[a['name'] for a in c['aliases']]
        for name in names:
            key=project.normalized_name(name)
            if key in exact_existing:collisions.append({'company':c['name'],'existing':exact_existing[key],'match':name})
            if key in keys and keys[key]!=c['name']:alias_collisions.append([c['name'],keys[key],name])
            keys[key]=c['name']
        if c['canonical_domain'] in domain_existing:collisions.append({'company':c['name'],'existing':domain_existing[c['canonical_domain']],'match':'domain'})
        assert c['canonical_domain'] not in domains;domains[c['canonical_domain']]=c['name']
    check('dedup_names_aliases_domains_against_built_current_catalogue', not collisions and not alias_collisions, {'existing_overlay':len(overlay['startups']),'existing_built_startups':len(existing),'collisions':collisions,'intra_batch_alias_collisions':alias_collisions})
    check('normalization_regression_examples', project.normalized_name('INBRAIN Neuroelectronics')==project.normalized_name('inbrain neuroelectronics') and project.normalized_name('Daniel Pérez-López')==project.normalized_name('Daniel Perez Lopez') and host('https://www.perk.com/path')==host('https://perk.com/'))
    after=graphmod.build_graph(*inputs,{'startups':overlay['startups']+records})
    check('existing_graph_builder_accepts_projection_without_slug_or_event_collision', len([e for e in after['entities']if e['kind']=='startup'])==len(existing)+len(records))
    previous={e['id']:e for e in before['entities']};new={e['id']:e for e in after['entities']}
    check('in_memory_preview_preserves_all_existing_entities', all(new[k]==v for k,v in previous.items()))
    check('preview_does_not_create_investor_edges', all(e['kind']!='invested_in' for e in after['edges'] if e not in before['edges']))
    runtime_limitations=[]
    for r in records:
        entity=new['startup:'+project.slug(r['name'])]
        if 'founded_year' not in r and entity.get('founded_year')==0:
            runtime_limitations.append({'company':r['name'],'field':'founded_year','packet_value':'omitted_unknown_or_conflict','existing_builder_value':0,'disposition':'owner_resolution_required_before_production_import'})
    check('merged_owner_fix_179_preserves_unknown_years', not runtime_limitations and all('founded_year' not in new['startup:'+project.slug(n)] for n in ['INBRAIN Neuroelectronics','Quibim']))

    before_hashes={f:digest(ROOT/f) for f in validation_baseline['input_files']}
    check('production_and_contract_input_bytes_unchanged_from_refreshed_main', before_hashes==validation_baseline['input_files'])
    check('production_data_unchanged_since_initial_inspection',all(digest(ROOT/f)==h for f,h in baseline['input_files'].items() if f.startswith('data/')))
    revision=validation_baseline['source_revision']
    pages=[];cursor=None
    while True:
        p=planner.build_plan(HERE/'startups.json',HERE/'collector-seeds.csv',revision,10,cursor)
        pages.append(p)
        if not p['next_cursor']:break
        cursor=p['next_cursor']
    names=[i['source_record_name']for p in pages for i in p['items']]
    check('existing_177_planner_bounded_pages_cover_exact_staged_population', len(names)==len(records)==len(set(names)), {'pages':[p['returned']for p in pages]})
    check('planner_has_no_approved_seeds_or_collection_claim', all(i['seed_state']=='seed_review_required' and i['collection_state']=='not_assessed'for p in pages for i in p['items']))
    replay=planner.build_plan(HERE/'startups.json',HERE/'collector-seeds.csv',revision,10,pages[0]['next_cursor'])
    check('interruption_resume_cursor_replays_identical_second_page', replay==pages[1])
    rejected=0
    with tempfile.TemporaryDirectory() as temp:
        overlay_path=Path(temp)/'changed.json';seed_path=Path(temp)/'changed.csv'
        overlay_path.write_bytes((HERE/'startups.json').read_bytes()+b'\n')
        seed_path.write_bytes((HERE/'collector-seeds.csv').read_bytes()+b'\n')
        cases=[(overlay_path,HERE/'collector-seeds.csv',revision,10),
               (HERE/'startups.json',seed_path,revision,10),
               (HERE/'startups.json',HERE/'collector-seeds.csv','0'*40,10),
               (HERE/'startups.json',HERE/'collector-seeds.csv',revision,9)]
        for ov,se,rev,lim in cases:
            try:planner.build_plan(ov,se,rev,lim,pages[0]['next_cursor'])
            except ValueError:rejected+=1
    check('stale_cursor_rejects_changed_overlay_seed_revision_and_limit',rejected==4)
    check('national_and_source_completion_not_inferred_from_inventory', queue['national_denominator'] is None and queue['source_populations_exhausted'] is False and all(not q['exhausted'] for q in queue['source_queue']))
    check('queued_company_names_do_not_duplicate_reviewed', not ({project.normalized_name(q['name'])for q in queue['candidates']} & {project.normalized_name(c['name'])for c in companies}))

    counts={'discovered_named_candidates':len(companies)+len(queue['candidates']),
            'reviewed_companies':len(companies),'accepted_staged_companies':len(records),
            'rejected_current_projection_historical_retained':len(companies)-len(records),
            'discovered_unreviewed_companies':len(queue['candidates']),
            'national_denominator':None,'source_observations':len(sources),'unique_source_urls':len({s['url']for s in sources}),
            'sources_by_access_status':dict(Counter(s['access_status']for s in sources)),
            'rights_flagged_sources':sum(s['rights_review_required']for s in sources),
            'claims':len(claims),'claims_by_status':dict(Counter(c['status']for c in claims)),
            'financing_observations':len(events),'projected_financing_events':len(projected_events),
            'sidecar_only_financing_observations':sum(e['projection_policy']['mode']=='sidecar_only'for _,e in events.values()),
            'projected_numeric_amounts':sum('amount'in e for e in projected_events.values()),
            'projected_qualified_text_amounts':sum('amount'not in e for e in projected_events.values()),
            'projected_founder_relationships':sum(len(r.get('founders',[]))for r in records),
            'source_queues':len(queue['source_queue']),'company_followups':len(queue['company_followups']),
            'approved_crawler_seeds':0,'production_records_written':0}
    check('bounded_review_partition',counts['reviewed_companies']==counts['accepted_staged_companies']+counts['rejected_current_projection_historical_retained'] and counts['discovered_named_candidates']==counts['reviewed_companies']+counts['discovered_unreviewed_companies'])
    receipt={'valid':True,'checked_at':datetime.now(timezone.utc).isoformat(),'source_revision':revision,
             'scope':'offline_packet_and_in_memory_preview_only','counts':counts,'checks':tests,
             'runtime_integration_holds':runtime_limitations,'production_inputs_sha256':before_hashes,
             'limitations':['Structural checks are not proof of source truth or full ecosystem coverage.',
                            'Initial-main unknown-year synthesis was resolved by existing owner PR179, merged at ff4d51cf729d6a654787e9a1db63967b292df8c9. Current in-memory graph preserves omissions. Auto-created funding article dates can remain empty when the announcement day is unknown; source publication dates remain in the ledger.',
                            'No crawler, MCP mutation, production deployment or merge was performed.']}
    if args.write_receipts:
        artifacts={'verification.json':receipt,'coverage.json':{'scope':'bounded_first_research_batch','counts':counts,'company_decisions':[{'name':c['name'],'staging_id':c['staging_id'],'disposition':c['review_disposition'],'country_scope':c['scope_class']}for c in companies],'completion_claim':'No defensible national denominator. Selected source populations not exhausted.'},
                   'planner-checkpoint.json':{'scope':'existing_177_inventory_only','revision_binding_note':'Base revision identifies compatibility contracts. Staged overlay bytes are separate research artifacts, not claimed to be present at that base revision.','page_size':10,'pages':pages,'research_resume':'next-source-queue.json','collection_complete':False}}
        for name,data in artifacts.items():(HERE/name).write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'valid':True,'checks':len(tests),'counts':counts,'runtime_integration_holds':runtime_limitations},ensure_ascii=False,indent=2))

if __name__=='__main__':
    main()
