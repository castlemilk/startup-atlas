#!/usr/bin/env python3
"""Read-only provenance, graph and resumability checks for Netherlands batch 001."""
import copy
import datetime
import importlib.util
import json
import re
import subprocess
from collections import Counter
from pathlib import Path
from urllib.parse import urlsplit

HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('nl_project',HERE/'project.py')
P=importlib.util.module_from_spec(spec);spec.loader.exec_module(P)
ROOT=P.ROOT
checks=[]
def check(name, function):
    try:
        detail=function()
        checks.append({'id':name,'status':'passed',**({'detail':detail} if detail is not None else {})})
    except Exception as error:
        checks.append({'id':name,'status':'failed','error':str(error)})
def require(condition, message):
    if not condition: raise AssertionError(message)
def unique(values,label): require(len(values)==len(set(values)),label+' must be unique')
def https(url):
    u=urlsplit(url)
    return u.scheme=='https' and bool(u.hostname) and not u.username and not u.password and not u.path.lower().endswith('/robots.txt')
def aware_time(value):
    try: return datetime.datetime.fromisoformat(value.replace('Z','+00:00')).tzinfo is not None
    except (ValueError,TypeError,AttributeError): return False
def all_source_urls(obj):
    if isinstance(obj,dict):
        for key,value in obj.items():
            if (key=='source_url' or key.endswith('_source_url')) and isinstance(value,str): yield value
            elif key in ['source_urls','supporting_source_urls','identity_source_urls'] and isinstance(value,list):
                yield from value
            elif isinstance(value,(dict,list)): yield from all_source_urls(value)
    elif isinstance(obj,list):
        for value in obj: yield from all_source_urls(value)

companies=P.read(HERE/'companies.json')['companies']
records=P.read(HERE/'startup-records.json')['startups']
claims=P.read(HERE/'claims.json')['claims']
sources=P.read(HERE/'source-registry.json')['sources']
source_map={s['url']:s for s in sources}
coverage=P.read(HERE/'coverage.json')
candidates=P.read(HERE/'candidate-ledger.json')['candidates']
queue=P.read(HERE/'next-sources.json')['entries']
manifest=P.read(HERE/'manifest.json')
dedup=P.read(HERE/'deduplication.json')
before={p:P.file_hash(ROOT/p) for p in P.PRODUCTION_INPUTS}

def validate_sources():
    unique([s['id'] for s in sources],'source IDs');unique([s['url'] for s in sources],'source URLs')
    for s in sources:
        require(https(s['url']),'Unsafe or robots URL in registry')
        require(s.get('crawler_seed_approved') is False,'Research must not approve seeds')
        if s.get('accessed'): require(aware_time(s['retrieved_at']),f'Missing timestamp: {s["url"]}')
    for u in all_source_urls(companies):
        require(u in source_map,f'Company claim source absent from registry: {u}')
        require(source_map[u].get('accessed') and source_map[u].get('evidence_usable') is not False,f'Unusable company claim source: {u}')
    return {'registry_urls':len(sources),'distinct_company_source_urls':len(set(all_source_urls(companies)))}
check('source_registry_and_company_provenance',validate_sources)

def validate_claims():
    unique([c['claim_id'] for c in claims],'claim IDs')
    for c in claims:
        require(c['publication_state']=='unsubmitted','Research PR is not production publication')
        if c['status'] in ['unsearched','searched_unknown','blocked','rejected','not_applicable']:
            require(bool(c.get('rationale')),'Disposition rationale missing')
            if c['status']=='searched_unknown':require(bool(c.get('search_log')),'Unknown needs bounded search log')
            continue
        require(c['value'] is not None,'Null is not a positive claim')
        s=source_map[c['source_url']]
        require(s.get('accessed') and s.get('evidence_usable') is not False,'Reviewed claim has unusable source')
        require(c['source_kind']==s['source_kind'],'Claim/source kind mismatch')
        require(c['source_id']==s['id'],'Claim/source ID mismatch')
        require(c['source_kind']!='discovery','Discovery-only evidence accepted')
        require(aware_time(c['retrieved_at']) and aware_time(c['reviewed_at']),'Timezone missing')
        for key in ['published_on','effective_on']:
            if c[key] is not None: datetime.date.fromisoformat(c[key])
        for u in c.get('supporting_source_urls',[]):require(u in source_map and source_map[u].get('accessed'),'Missing supporting source')
    return dict(Counter(c['status'] for c in claims))
check('atomic_claim_provenance_and_dispositions',validate_claims)

def validate_funding():
    events={e['id']:(c,e) for c in companies for e in c['funding_rounds']}
    unique([e['id'] for c in companies for e in c['funding_rounds']],'event IDs')
    for _,e in events.values():
        require((e.get('amount') is None)==(e.get('currency') is None),'Selected amount/currency null pair differs')
        if e.get('amount') is not None:require(isinstance(e['amount'],int) and e['amount']>0,'Unknown amount represented as zero/non-integer')
        precision=e['date_precision'];date=e.get('announced_on')
        require(bool(re.fullmatch({'day':r'\d{4}-\d{2}-\d{2}','month':r'\d{4}-\d{2}','year':r'\d{4}'}[precision],date)), 'Date/precision mismatch')
        if precision=='day':datetime.date.fromisoformat(date)
        for p in e.get('participants',[]):require(p.get('resolved_entity_id') is None,'Unreviewed investor ID resolution')
    relation_count=0
    for c in claims:
        if c['field'] not in ['round_participant','financing_support']:continue
        value=c['value'];event=events[value['event_id']][1]
        matching=[p for p in event['participants'] if p['name']==value['name'] and p['role']==value['role'] and p['source_url']==c['source_url']]
        require(len(matching)==1,'Event relation not supported by exact staged participant')
        if c['field']=='round_participant':
            require(value['role'] in ['lead','participant','unspecified'],'Lender/programme incorrectly typed as equity investor')
            relation_count+=1
        else:require(value['role'] in ['lender','programme'],'Unexpected support role')
    require(relation_count==coverage['counts']['round_participant_relationships'],'Participant count mismatch')
    require(all(e['id']!='crisp-2024-09' for _,e in events.values()),'Crisp court loan was promoted into completed equity')
    return {'financing_events':len(events),'event_specific_participants':relation_count,'lender_or_programme_support':sum(c['field']=='financing_support' for c in claims)}
check('funding_events_instruments_and_relationships',validate_funding)

def validate_identity():
    for key in ['staging_id','proposed_atlas_id','domain_normalized']:
        unique([c[key] for c in companies],key)
    require(all(not r['matched_existing_ids'] for r in dedup['startup_checks']),'Existing startup match must be resolved')
    require(not dedup['founder_identity_collisions'],'Unreviewed founder identity collision')
    falqon=next(c for c in companies if c['canonical_name']=='Falqon Systems')
    require('Q*Bird' in [a['name'] for a in falqon['aliases']],'Former name lost')
    require(all('valid_to' not in a for a in falqon['aliases']),'Alias announcement became unverified legal-effective date')
    alq=next(c for c in companies if c['canonical_name']=='Alquion')
    require(not set(['Battolyser Systems','VDL Hydrogen Systems'])&set(a['name'] for a in alq['aliases']),'Predecessor merged as alias')
    require(not alq['funding_rounds'],'Predecessor financing copied into Alquion')
    require(next(c for c in companies if c['canonical_name']=='Cradle')['hq'] is None,'Cross-border footprint became sole Dutch HQ')
    return {'existing_startup_matches':0,'founder_slug_collisions':0}
check('canonical_identity_alias_and_country_boundaries',validate_identity)

def validate_counts():
    unique([c['candidate_id'] for c in candidates],'candidate IDs')
    counts=coverage['counts']
    reviewed=sum(c['reviewed'] for c in candidates)
    accepted=sum(c['decision']=='accepted_staged' for c in candidates)
    pending=sum(c['decision']=='pending_company_verification' for c in candidates)
    deferred=sum(c['decision'].startswith('deferred_') for c in candidates)
    rejected=sum(c['decision']=='rejected' for c in candidates)
    require(counts['discovered']==len(candidates),'Discovery count mismatch')
    require(counts['reviewed']==reviewed==accepted+deferred+rejected,'Review accounting mismatch')
    require(len(candidates)==reviewed+pending,'Disjoint disposition accounting mismatch')
    require(counts['accepted_staged']==accepted==len(records)==len(companies),'Acceptance/projection mismatch')
    require(coverage['national_denominator'] is None and coverage['complete'] is False,'Unsupported national completeness')
    require(all(c.get('canonical_domain') is None for c in candidates if not c['reviewed']),'Unreviewed lead acquired invented domain')
    return {'discovered':len(candidates),'reviewed':reviewed,'accepted':accepted,'deferred':deferred,'rejected':rejected,'pending':pending}
check('bounded_disposition_counts_and_null_denominator',validate_counts)

def resume(checkpoint, expected_fingerprint):
    require(checkpoint['snapshot_fingerprint']==expected_fingerprint,'Stale resume fingerprint')
    unique(checkpoint['completed_candidate_ids'],'completed checkpoint IDs')
    unique(checkpoint['pending_candidate_ids'],'pending checkpoint IDs')
    require(not set(checkpoint['completed_candidate_ids'])&set(checkpoint['pending_candidate_ids']),'Candidate appears completed and pending')
    require(set(checkpoint['completed_candidate_ids'])|set(checkpoint['pending_candidate_ids'])==set(c['candidate_id'] for c in candidates),'Checkpoint coverage differs')
    require(checkpoint['terminal_observed'] is False,'Unobserved terminal state claimed')
    return checkpoint['pending_candidate_ids'][:4]
def validate_resume():
    bindings=coverage['bound_snapshot']
    for key,name in [('companies_sha256','companies.json'),('candidate_ledger_sha256','candidate-ledger.json'),('source_registry_sha256','source-registry.json'),('queue_sha256','next-sources.json')]:
        require(bindings[key]==P.file_hash(HERE/name),'Resume bound input hash changed')
    expected=P.digest(bindings)
    require(expected==coverage['snapshot_fingerprint'],'Coverage fingerprint mismatch')
    first=resume(coverage['resume_checkpoint'],expected)
    require(first==['lead:photonbridge','lead:euclyd','lead:eyeo','lead:groove-quantum'],'Wrong next named batch')
    bad=copy.deepcopy(coverage['resume_checkpoint']);bad['snapshot_fingerprint']='0'*64
    try:resume(bad,expected)
    except AssertionError:pass
    else:raise AssertionError('Stale checkpoint accepted')
    bad=copy.deepcopy(coverage['resume_checkpoint']);bad['pending_candidate_ids'].append(bad['completed_candidate_ids'][0])
    try:resume(bad,expected)
    except AssertionError:pass
    else:raise AssertionError('Duplicated progress accepted')
    unique([q['id'] for q in queue],'queue IDs')
    for q in queue:require(q['crawler_seed_approved'] is False and q['complete'] is False,'Queue became seed approval or completion')
    return {'next_candidate_ids':first,'stale_hash_negative_control':'rejected','duplicate_progress_negative_control':'rejected','queue_entries':len(queue)}
check('resumable_coverage_and_negative_controls',validate_resume)

def graph_check():
    graph_spec=importlib.util.spec_from_file_location('nl_graph_validation',ROOT/'scripts/make-graph.py')
    G=importlib.util.module_from_spec(graph_spec);graph_spec.loader.exec_module(G)
    args=[G.load(n) for n in ['partner-profiles.json','partner-leads.json','partners-reviewed.json','catalogue.json']]
    old=G.load('startup-research.json')
    base=G.build_graph(*args,old)
    combined=copy.deepcopy(old);combined['startups']+=copy.deepcopy(records)
    result=G.build_graph(*args,combined)
    old_nodes={n['id']:n for n in base['entities']};new_nodes={n['id']:n for n in result['entities']}
    require(all(new_nodes[k]==v for k,v in old_nodes.items()),'Baseline entity changed in dry run')
    require(combined['startups'][:len(old['startups'])]==old['startups'],'Baseline records changed')
    require(len(result['funding_rounds'])==len(base['funding_rounds'])+coverage['counts']['financing_events'],'Funding relationship count lost')
    new_edges=[e for e in result['edges'] if e not in base['edges']]
    require(len(new_edges)==coverage['counts']['founder_attributions'],'Founder edge count mismatch')
    require(all(e['kind']=='founded' and e['source'] in source_map for e in new_edges),'Unsupported investor or source-free graph edge created')
    require('founded_year' not in next(r for r in records if r['name']=='Qblox'),'Unknown founding year gained value')
    qblox=new_nodes['startup:qblox']
    require('founded_year' not in qblox or qblox['founded_year']==0,'Unexpected founding-year serialization; review required')
    refresh=P.read(HERE/'main-refresh.json') if (HERE/'main-refresh.json').exists() else None
    return {'baseline_entities':len(base['entities']),'baseline_startups':sum(n['kind']=='startup' for n in base['entities']),'baseline_overlay_records':len(old['startups']),'dry_run_entities':len(result['entities']),'dry_run_startups':sum(n['kind']=='startup' for n in result['entities']),'dry_run_funding_events':len(result['funding_rounds']),'new_sourced_founder_edges':len(new_edges),'baseline_records_unchanged':True,'unknown_year_serialization':{'company':'Qblox','projection':'omitted','checked_builder_output':qblox.get('founded_year'),'checked_builder_uses_old_zero_sentinel':'founded_year' in qblox,'owner_fix_verified_on_newer_main':bool(refresh and refresh['findings']['existing_owner_fix_preserves_unknown_founding_year']),'refresh_receipt':'main-refresh.json' if refresh else None},'runtime_snapshot_written':False}
check('existing_graph_builder_in_memory_integration',graph_check)

def negative_normalization():
    require(P.norm_name('  Ｐｉｃｎｉｃ  ')==P.norm_name('Picnic'),'Unicode normalization broken')
    require(P.domain('https://www.PICNIC.app/path')==P.domain('https://picnic.app/'),'Domain normalization broken')
    require(P.slug('René Example')==P.slug('Rene Example'),'Expected collision fixture no longer collides')
    try:unique([P.slug('René Example'),P.slug('Rene Example')],'founder slug fixture')
    except AssertionError:pass
    else:raise AssertionError('Lossy ASCII collision accepted')
    require(not https('https://user:secret@example.com/'),'Credential URL allowed')
    require(not https('https://example.com/robots.txt'),'robots URL allowed')
    return {'unicode_name_variant':'matched','www_domain_variant':'matched','ascii_slug_collision':'rejected','credential_and_robots_urls':'rejected'}
check('normalization_collision_and_provenance_negative_controls',negative_normalization)

def pinned_inputs():
    require(manifest['base_revision']==P.BASE,'Manifest base changed')
    require(before==manifest['input_byte_sha256'],'Pinned input hashes mismatch')
    for path in P.PRODUCTION_INPUTS:
        require((ROOT/path).read_bytes()==subprocess.check_output(['git','show',f'{P.BASE}:{path}'],cwd=ROOT),'Production input differs from pinned commit')
    require(before=={p:P.file_hash(ROOT/p) for p in P.PRODUCTION_INPUTS},'Validation mutated production inputs')
    require(all(not b for k,b in manifest['boundaries'].items() if isinstance(b,bool)),'Ownership boundary changed')
    return {'production_input_files':len(before),'unchanged':True,'pinned_revision':P.BASE}
check('pinned_baseline_and_no_production_mutation',pinned_inputs)

failed=[c for c in checks if c['status']=='failed']
result={'validator':'netherlands-packet-provenance-graph-resume','checked_at':datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds').replace('+00:00','Z'),'status':'failed' if failed else 'passed','counts':{'checks':len(checks),'passed':len(checks)-len(failed),'failed':len(failed)},'checks':checks,'scope':'Read-only staging validation. Source truth was manually reviewed; graph dry run is not publication. The old-base unknown-year behavior and separately verified owner fix on newer main are distinguished.'}
print(json.dumps(result,ensure_ascii=False,indent=2))
raise SystemExit(1 if failed else 0)
