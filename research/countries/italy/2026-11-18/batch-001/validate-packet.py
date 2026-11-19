#!/usr/bin/env python3
"""Offline country-packet checks; current graph builder is used in memory only."""
import copy
import importlib.util
import json
import re
import sys
import tempfile
from collections import Counter
from datetime import date
from pathlib import Path
from unittest.mock import patch

sys.dont_write_bytecode = True

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('italy_packet', HERE/'build-packet.py')
b = importlib.util.module_from_spec(spec)
spec.loader.exec_module(b)
checks = []

def check(name, condition):
    if not condition:
        raise AssertionError(name)
    checks.append(name)

def reject(name, callback):
    try:
        callback()
    except (AssertionError, ValueError, KeyError):
        checks.append(name)
        return
    raise AssertionError(name+' did not reject invalid input')

def valid_checkpoint(cp):
    core = {k:v for k,v in cp.items() if k!='state_sha256'}
    assert cp['state_sha256']==b.digest(core), 'checkpoint digest'
    for path, digest in cp['evidence_sha256'].items():
        assert b.sha(HERE/path)==digest, 'evidence changed'
    assert b.sha(HERE/'source-registry.json')==cp['source_registry_sha256'], 'registry changed'
    accepted, rejected, reviewed, pending = (set(cp[k]) for k in ('accepted_ids','rejected_ids','reviewed_ids','pending_candidate_ids'))
    assert accepted.isdisjoint(rejected) and accepted|rejected==reviewed, 'review partition'
    assert pending.isdisjoint(reviewed), 'pending overlap'
    assert not cp['production_submitted_ids'], 'no production submission in checkpoint'

def positive_claim(claim, sources):
    if claim['status'] not in ('reviewed_staged','conflict'):
        assert claim.get('value') is None, 'unknown is not a positive value'
        return
    sid=claim.get('source_id')
    assert sid in sources, 'missing source ID'
    source=sources[sid]
    assert source['accessed'] is True and source['content_state']=='usable', 'unusable source accepted'
    assert claim['source_url']==source['url'], 'source URL mismatch'
    assert source['source_kind']!='discovery', 'discovery-only acceptance'
    assert claim.get('retrieved_at') and claim.get('reviewed_at'), 'missing review/retrieval time'
    for other in claim.get('source_ids',[]):
        assert sources[other]['accessed'] and sources[other]['content_state']=='usable', 'unusable supporting source'
    for url in claim.get('supporting_source_urls',[]):
        assert any(s['url']==url and s['accessed'] and s['content_state']=='usable' for s in sources.values()), 'unregistered supporting URL'

def pending_slice(cp, completed=(), limit=10):
    return [x for x in cp['pending_candidate_ids'] if x not in set(completed)][:limit]

def contains_null(value):
    if value is None:
        return True
    if isinstance(value, dict):
        return any(contains_null(v) for v in value.values())
    if isinstance(value, list):
        return any(contains_null(v) for v in value)
    return False

def main():
    sources_list=b.read(HERE/'source-registry.json')['sources']
    sources={s['id']:s for s in sources_list}
    claims=b.read(HERE/'claims.json')['claims']
    companies=b.read(HERE/'company-index.json')['companies']
    manifest=b.read(HERE/'country-manifest.json')
    cp=b.read(HERE/'checkpoint.json')
    baseline=b.read(HERE/'baseline-snapshot.json')
    dedup=b.read(HERE/'deduplication.json')
    check('unique source IDs and valid HTTPS URLs',len(sources)==len(sources_list) and all(s['url'].startswith('https://') for s in sources_list))
    check('source attempts have retrieval dates and are unapproved for crawling',all(s.get('retrieved_at','').startswith('2026-11-18') and s['crawler_seed_approved'] is False for s in sources_list))
    check('unique atomic claim IDs',len({c['claim_id'] for c in claims})==len(claims))
    for c in claims:
        positive_claim(c,sources)
    check('all positive/conflict claims resolve accessed non-discovery evidence',True)
    check('known unknown dispositions remain null',all(c.get('value') is None for c in claims if c['status'] in ('unsearched','searched_unknown','blocked')))
    unknown=next(c for c in claims if c['status']=='searched_unknown')
    reject('mutation: unknown numeric zero is rejected',lambda:positive_claim({**unknown,'value':0},sources))
    good=next(c for c in claims if c['status']=='reviewed_staged')
    reject('mutation: wrong source URL is rejected',lambda:positive_claim({**good,'source_url':'https://example.invalid/'},sources))
    bad_sources=copy.deepcopy(sources);bad_sources[good['source_id']]['accessed']=False
    reject('mutation: inaccessible evidence cannot support accepted claim',lambda:positive_claim(good,bad_sources))

    check('URL case/www/path normalization',b.domain('HTTPS://WWW.Example.COM./news?q=1')=='example.com')
    check('subdomains and lookalike domains stay distinct',b.domain('https://invest.example.com')!=b.domain('https://example.com') and b.domain('https://example.com.evil.test')!='example.com')
    check('Unicode and whitespace names normalize conservatively',b.norm_name('  ＡＩＫＯ  ')==b.norm_name('aiko') and b.norm_name('Caracol AM')!=b.norm_name('Caracol'))
    check('Atlas accent slug collision key is explicit',b.slug('José Silva')==b.slug('Jose Silva'))
    check('company identities/domains are unique',len({c['id'] for c in companies})==len(companies)==len({c['canonical_domain'] for c in companies}))
    check('no pinned-existing startup identity or founder collisions',dedup['matched_existing_company_count']==0 and dedup['founder_match_count']==0 and not dedup['within_batch_identity_collisions'])
    check('explicit alias evidence retained',all(any(a['name']==alias for a in c['aliases']) for name,alias in [('Smartness','Smartpricing'),('Domyn','iGenius'),('SQIM','MOGU SRL')] for c in companies if c['name']==name))

    valid_checkpoint(cp)
    check('checkpoint hashes and disjoint review partition',True)
    tampered=copy.deepcopy(cp);tampered['accepted_ids'].append('staging:it:invented')
    reject('mutation: checkpoint tampering rejected',lambda:valid_checkpoint(tampered))
    stale=copy.deepcopy(cp);stale['evidence_sha256']['evidence/general.json']='0'*64;stale['state_sha256']=b.digest({k:v for k,v in stale.items() if k!='state_sha256'})
    reject('mutation: stale evidence checkpoint rejected',lambda:valid_checkpoint(stale))
    first=pending_slice(cp);second=pending_slice(cp,first)
    check('bounded continuation is deterministic and disjoint',first==pending_slice(cp) and len(first)<=10 and not set(first)&set(second))
    check('continuation terminates without duplicate candidate review',pending_slice(cp,cp['pending_candidate_ids'])==[])
    counts=manifest['counts']
    check('candidate count reconciliation',counts['discovered_unique_candidates']==counts['reviewed_companies']+counts['pending_primary_identity_review'] and counts['reviewed_companies']==counts['accepted_staging']+counts['rejected_reference_only'])
    check('bounded up-to-50 accepted checkpoint',0<counts['accepted_staging']<=50 and counts['accepted_staging']==len(cp['accepted_ids']))
    check('no national completeness or publication claim',manifest['denominators']['national_atlas_eligible_startup_population'] is None and manifest['source_pagination_exhausted'] is False and counts['published_companies']==0)
    check('claim status counts reconcile',dict(Counter(c['status'] for c in claims))==counts['claim_statuses'])

    for path,digest in baseline['inputs'].items():
        check('pinned source unchanged: '+path,b.sha(b.ROOT/path)==digest)
    check('current graph builder unchanged',b.sha(b.ROOT/'scripts/make-graph.py')==baseline['builder_sha256'])
    projections=b.read(HERE/'startup-proposals.json')['startups']
    check('projection count and names match accepted identities',len(projections)==len(cp['accepted_ids']) and {r['name'] for r in projections}=={c['name'] for c in companies if c['id'] in cp['accepted_ids']})
    check('reference-only entities excluded from proposals',not {'Fiscozen','Bending Spoons'} & {r['name'] for r in projections})
    check('production proposals omit null fields',all(not contains_null(record) for record in projections))
    check('no invented typed investor relationships',all(not r.get('relationships') for r in projections))
    for record in projections:
        for event in record.get('funding_rounds',[]):
            assert ('amount' in event)==('currency' in event), 'amount/currency pair'
            if 'amount' in event:
                assert type(event['amount']) is int and event['amount']>0, 'unknown or noninteger numeric amount'
            if 'announced_on' in event:
                assert re.fullmatch(r'\d{4}-\d{2}-\d{2}',event['announced_on'])
                date.fromisoformat(event['announced_on'])
    check('projected funding numeric/date semantics',True)
    base_research=b.read(b.ROOT/'data/startup-research.json')
    combined=copy.deepcopy(base_research)
    combined['startups'].extend(projections)
    graph=b.graph_from_source(combined)
    original=b.graph_from_source()
    check('in-memory integration retains all original startup records',combined['startups'][:len(base_research['startups'])]==base_research['startups'])
    base_entities={n['id']:n for n in original['entities']}
    next_entities={n['id']:n for n in graph['entities']}
    unknown_founding_names=[r['name'] for r in projections if 'founded_year' not in r]
    check('upstream #179 preserves omitted founding years without zero sentinel',all('founded_year' not in next_entities['startup:'+b.slug(name)] for name in unknown_founding_names))
    check('in-memory integration preserves every existing graph entity',all(next_entities[k]==v for k,v in base_entities.items()))
    edge_key=lambda e:json.dumps(e,sort_keys=True)
    old_edges={edge_key(e) for e in original['edges']}
    new_edges={edge_key(e) for e in graph['edges']}
    check('all prior graph edges preserved',old_edges<=new_edges)
    added=[e for e in graph['edges'] if edge_key(e) not in old_edges]
    check('only explicitly sourced founder edges added; no investor edges',all(e['kind']=='founded' and e['source'].startswith('https://') for e in added))
    check('global round IDs unique after integration',len({r['id'] for r in graph['funding_rounds']})==len(graph['funding_rounds']))
    # Reuse #177 unchanged to verify this real packet remains unapproved and resumable.
    sys.path.insert(0,str(b.ROOT/'scripts'))
    import plan_company_profiles as planner
    import crawl
    with tempfile.TemporaryDirectory(prefix='italy-planner-') as tmp:
        overlay=Path(tmp)/'overlay.json';seeds=Path(tmp)/'seeds.csv'
        overlay.write_text(json.dumps(combined,ensure_ascii=False)+'\n')
        seed_bytes=(b.ROOT/'data/company-profile-seeds.csv').read_bytes()
        seeds.write_bytes(seed_bytes)
        with patch.object(crawl.Transport,'request',side_effect=AssertionError('Network forbidden in country validation')),patch.object(crawl.socket,'getaddrinfo',side_effect=AssertionError('DNS forbidden in country validation')):
            first_page=planner.build_plan(overlay,seeds,b.BASE,10)
            check('existing planner is deterministic for exact inputs',first_page==planner.build_plan(overlay,seeds,b.BASE,10))
            page=first_page;pages=1;items=list(page['items'])
            while page['next_cursor']:
                page=planner.build_plan(overlay,seeds,b.BASE,10,page['next_cursor'])
                pages+=1;items.extend(page['items'])
            names=[i['source_record_name'] for i in items]
            check('existing planner resumes combined overlay exactly once',len(names)==len(combined['startups'])==len(set(names)) and set(names)=={r['name'] for r in combined['startups']})
            additions=[i for i in items if i['source_record_name'] in {r['name'] for r in projections}]
            check('all new Italy companies require separate seed review',len(additions)==22 and all(i['seed_state']=='seed_review_required' and i['approved_url'] is None and i['collection_state']=='not_assessed' for i in additions))
            cursor=first_page['next_cursor']
            reject('existing planner rejects revision drift',lambda:planner.build_plan(overlay,seeds,'0'*40,10,cursor))
            reject('existing planner rejects page-size drift',lambda:planner.build_plan(overlay,seeds,b.BASE,11,cursor))
            original_bytes=overlay.read_bytes();overlay.write_bytes(original_bytes+b'\n')
            reject('existing planner rejects overlay-byte drift',lambda:planner.build_plan(overlay,seeds,b.BASE,10,cursor))
            overlay.write_bytes(original_bytes);seeds.write_bytes(seed_bytes+b'\n')
            reject('existing planner rejects seed-byte drift',lambda:planner.build_plan(overlay,seeds,b.BASE,10,cursor))
        planner_receipt={'valid':True,'implementation':'scripts/plan_company_profiles.py','implementation_sha256':b.sha(b.ROOT/'scripts/plan_company_profiles.py'),'base_revision':b.BASE,'snapshot_kind':'temporary_combined_overlay_not_committed_production','source_records':len(names),'pages':pages,'page_size':10,'new_italy_records':len(additions),'new_italy_seed_states':dict(Counter(i['seed_state'] for i in additions)),'new_italy_collection_states':dict(Counter(i['collection_state'] for i in additions)),'population':first_page['population'],'cursor_drift_rejections':['revision','page size','overlay bytes','seed bytes'],'network_and_dns':'guarded against invocation','source_approval_changes':0,'collection_runs':0,'warning':'Inventory exhausted means these input records were paginated, not that company collection or national coverage is complete.'}
        b.write('planner-validation.json',planner_receipt)
    receipt={'valid':True,'checks_passed':len(checks),'checks':checks,'base_revision':b.BASE,'input_hashes':{'startup-proposals.json':b.sha(HERE/'startup-proposals.json'),'claims.json':b.sha(HERE/'claims.json'),'source-registry.json':b.sha(HERE/'source-registry.json'),'checkpoint.json':b.sha(HERE/'checkpoint.json')},'integration':{'mode':'in_memory_only','baseline_startups':baseline['counts']['startups'],'combined_startups':sum(n['kind']=='startup' for n in graph['entities']),'combined_entities':len(graph['entities']),'combined_edges':len(graph['edges']),'combined_funding_rounds':len(graph['funding_rounds']),'added_founder_edges':len(added),'typed_investor_edges_added':0,'production_files_written':0},'limitations':['Structural and bounded semantic validation does not establish exhaustive source truth, completeness or publication.','No national denominator, complete founder/funding history or legal incorporation audit.']}
    receipt['integration']['unknown_founding_years']={'upstream_fix_pr':179,'names':unknown_founding_names,'generated_graph_behavior':'field omitted; no zero synthesized','initial_research_base':b.INITIAL_BASE,'validated_integration_base':b.BASE}
    b.write('packet-validation.json',receipt)
    print(json.dumps({k:receipt[k] for k in ('valid','checks_passed','integration')}))

if __name__=='__main__':
    main()
