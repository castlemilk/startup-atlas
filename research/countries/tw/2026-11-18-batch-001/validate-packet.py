#!/usr/bin/env python3
"""Offline validation for this research packet. Never writes production data or crawls."""
from __future__ import annotations
import argparse, copy, hashlib, importlib.util, json, re, subprocess, sys, unicodedata
from collections import Counter
from pathlib import Path
from urllib.parse import urlsplit

PACKET=Path(__file__).resolve().parent
REPO=PACKET.parents[3]

def load(name):return json.loads((PACKET/name).read_text())
def digest(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def norm(s):return re.sub(r'[^\w]+','',unicodedata.normalize('NFKC',s).casefold())
def host(s):return (urlsplit(s if '://' in s else 'https://'+s).hostname or '').casefold().removeprefix('www.') if s else None
def require(condition,message):
    if not condition:raise ValueError(message)
def unique(rows,key):
    values=[r[key] for r in rows];require(len(values)==len(set(values)),f'Duplicate {key}')
def import_file(name,path):
    spec=importlib.util.spec_from_file_location(name,path);mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod);return mod
def full_day(value):
    import datetime
    require(isinstance(value,str) and bool(re.fullmatch(r'\d{4}-\d{2}-\d{2}',value)),'Expected exact day, no partial-date padding')
    datetime.date.fromisoformat(value)

def evidence_check(claims,sources):
    sm={s['source_id']:s for s in sources};unique(sources,'source_id');unique(claims,'claim_id')
    for c in claims:
        require(c.get('entity_id') and c.get('field') and c.get('status'),'Incomplete claim identity/disposition')
        if c.get('source_id'):
            require(c['source_id'] in sm,'Unregistered claim source')
            require(c.get('source_url')==sm[c['source_id']]['url'],'Claim/source URL mismatch')
        if c['status'] in ['reviewed_staged','conflict']:
            require(c.get('source_id') in sm,'Accepted/conflicting observation lacks source')
            require(c.get('accessed') is True and sm[c['source_id']]['accessed'] is True,'Unaccessed source promoted to fact')
            require(c.get('evidence') and c.get('retrieved_at'),'Missing per-claim provenance')
        require(c.get('publication_state')=='unsubmitted','Claim incorrectly marked published')

def funding_check(events,parts,company_ids,claims,sources):
    unique(events,'event_id');unique(parts,'participation_id');em={e['event_id']:e for e in events};cm={c['claim_id']:c for c in claims};sm={s['source_id']:s for s in sources}
    for e in events:
        require(e['company_id'] in company_ids,'Event orphan company')
        require(e['source_ids'] and e['claim_ids'],'Event lacks provenance')
        for sid in e['source_ids']:require(sid in sm and sm[sid]['accessed'],'Event source unavailable')
        for cid in e['claim_ids']:require(cid in cm and cm[cid]['entity_id']==e['company_id'],'Event claim crosses company')
        d=e['date'];precision=d.get('precision');value=d.get('value')
        if value is not None:
            require(precision in ['year','month','day'],'Unknown event precision')
            require(bool(re.fullmatch({'year':r'\d{4}','month':r'\d{4}-\d{2}','day':r'\d{4}-\d{2}-\d{2}'}[precision],value)),'Date precision mismatch')
        if e['announced_on'] is not None:full_day(e['announced_on']);require(precision=='day','Invented day from partial event date')
        if e['closed_on'] is not None:full_day(e['closed_on'])
        for amount,currency in [('amount','currency'),('valuation','valuation_currency')]:
            require((e.get(amount) is None)==(e.get(currency) is None),'Unpaired currency/amount')
            if e.get(amount) is not None:
                require(type(e[amount]) is int and e[amount]>0,'Zero/invalid amount used as unknown')
                require(bool(re.fullmatch('[A-Z]{3}',e[currency])),'Invalid currency')
        if e['amount_precision']=='strict_lower_bound':require(e['amount'] is None and e['amount_lower_bound']>0,'Lower bound converted to exact amount')
        if e['event_status']=='planned_announcement':require(e['amount'] is None and e['closed_on'] is None and e['production_projection']=='profile_fact','Planned contribution treated as completed round')
    for p in parts:
        require(p['event_id'] in em,'Orphan participant event')
        e=em[p['event_id']];require(p['company_id']==e['company_id'],'Participant assigned to wrong company')
        require(p['resolved_entity_id'] is None,'Unreviewed canonical investor identity')
        require(p['role'] in ['lead','participant','unspecified'],'Unsupported participant role')
        require(p['claim_ids'] and p['source_ids'],'Participant lacks source or claim')
        for sid in p['source_ids']:require(sid in sm and sm[sid]['accessed'],'Participant source unavailable')
        for cid in p['claim_ids']:
            require(cid in cm and cm[cid]['entity_id']==p['company_id'],'Participant claim crosses company')
            require(cm[cid].get('source_id') in e['source_ids'],'Participant evidence not tied to event source')
            require(cm[cid]['field'] in ['round_participant','funding_participant','funding_round','funding_event'],'Portfolio/programme relationship misused as event investment')

def checkpoint_check(coverage,queue_path,decision_path):
    cp=coverage['resume_checkpoint']
    require(cp['queue_sha256']==digest(queue_path),'Stale queue checkpoint')
    require(cp['decisions_sha256']==digest(decision_path),'Stale decisions checkpoint')
    require(coverage['country_denominator'] is None and coverage['country_completion_percentage'] is None,'Unsupported national completeness claim')

def reject_probe(label,fn):
    try:fn()
    except (ValueError,KeyError):return {'name':label,'rejected':True}
    raise AssertionError('Negative probe was accepted: '+label)

def validate():
    manifest=load('manifest.json');companies=load('companies.json')['companies'];claims=load('claims.json')['claims'];sources=load('source-registry.json')['sources'];projections=load('startup-records.json')['startups'];funding=load('funding-events.json');coverage=load('coverage.json');decisions=load('decisions.json');queue=load('next-source-queue.json')['queue'];trace=load('projection-provenance.json')['items']
    for name,sha in manifest['input_sha256'].items():require(digest(REPO/name)==sha,'Pinned baseline changed: '+name)
    unique(companies,'entity_id');unique(companies,'canonical_domain');unique(companies,'proposed_atlas_id');unique(queue,'queue_id')
    require(len(companies)==len(projections)<=50,'Invalid bounded projection count')
    company_ids={c['entity_id'] for c in companies};evidence_check(claims,sources);funding_check(funding['events'],funding['participants'],company_ids,claims,sources)
    checkpoint_check(coverage,PACKET/'next-source-queue.json',PACKET/'decisions.json')
    require(norm('ＫＤＡＮ')==norm('kdan'),'Unicode normalization failed')
    require(host('https://WWW.KDAN.COM/about?x=1')==host('kdan.com'),'Host normalization failed')
    require(all(c['crawler_seed_approved'] is False for c in companies+sources+queue),'Research promoted to crawler approval')
    require(all(c['disposition']=='accepted_staged' and c['publication_state']=='unsubmitted' for c in companies),'Staging/publication state mismatch')
    require({p['name'] for p in projections}=={c['canonical_name'] for c in companies},'Company/projection mismatch')
    for c in companies:
        require(c['canonical_domain']==host(c['website']),'Canonical domain mismatch')
        require(all(x in {'headquarters','incorporation','operating_locations','operating_base','origin_observation'} for x in c['geography']),'Unexpected geography semantics')
        require(c['founding'] is None or c['founding'].get('value')!=0,'Unknown founding year used as zero')
        require(c['founders_complete'] is False and c['funding_coverage_complete'] is False,'Unsupported completeness')
    cm={c['claim_id']:c for c in claims}
    for t in trace:
        require(t['claim_ids'],'Empty projection provenance')
        for cid in t['claim_ids']:require(cm[cid]['entity_id']==t['entity_id'] and cm[cid]['source_url']==t['source_url'],'Cross-entity/source projection provenance')
        if t['pointer'].endswith('/founded_year'):
            require(all(cm[cid]['field'] in ['founded_year','founding','founding_date'] for cid in t['claim_ids']),'Founding year lacks a semantic founding claim')
    # Execute the product's actual validator, not a copied approximation.
    node="import fs from 'node:fs'; import {validateStartupRecord} from './backend/hosted/src/startup-record.mjs'; const x=JSON.parse(fs.readFileSync(process.argv[1],'utf8')); for(const r of x.startups)validateStartupRecord(r); console.log(JSON.stringify({validated:x.startups.length}));"
    result=subprocess.run(['node','--input-type=module','-e',node,str(PACKET/'startup-records.json')],cwd=REPO,text=True,capture_output=True,check=True)
    schema=json.loads(result.stdout)
    # Rebuild in memory from authoritative source; never call the builder's writing main().
    g=import_file('packet_graph',REPO/'scripts/make-graph.py')
    dat=lambda n:json.loads((REPO/'data'/n).read_text())
    inputs=[dat(n) for n in ['partner-profiles.json','partner-leads.json','partners-reviewed.json','catalogue.json']]
    old=dat('startup-research.json');baseline=g.build_graph(*inputs,old)
    baseline_ids={e['id'] for e in baseline['entities']};baseline_names={norm(e['name']) for e in baseline['entities']};baseline_hosts={host(e.get('website')) for e in baseline['entities'] if e.get('website')}
    dedup=[]
    for c in companies:
        aliases=[a.get('name') for a in c['aliases'] if isinstance(a,dict) and a.get('name')]
        domains=[a.get('domain') for a in c['aliases'] if isinstance(a,dict) and a.get('domain')]
        require(c['proposed_atlas_id'] not in baseline_ids,'Existing company slug collision')
        require(not ({norm(c['canonical_name'])}|{norm(a) for a in aliases})&baseline_names,'Existing name/alias collision')
        require(not ({c['canonical_domain']}|{host(a) for a in domains})&baseline_hosts,'Existing domain/alias collision')
        dedup.append({'name':c['canonical_name'],'proposed_atlas_id':c['proposed_atlas_id'],'result':'no_exact_normalized_name_alias_domain_or_id_match'})
    founders=['person:'+g.slug(f['name']) for p in projections for f in p.get('founders',[])]
    require(all(f!='person:' for f in founders),'Empty founder ASCII identity')
    require(len(founders)==len(set(founders)),'Cross-company founder slug collision')
    require(not set(founders)&baseline_ids,'Existing founder slug collision')
    rounds=[e['id'] for p in projections for e in p.get('funding_rounds',[])]
    require(len(rounds)==len(set(rounds)),'Duplicate projected event ID')
    require(not set(rounds)&{e['id'] for e in baseline['funding_rounds']},'Existing event ID collision')
    combined=g.build_graph(*inputs,{**old,'startups':old['startups']+projections})
    require(set(rounds)<={e['id'] for e in combined['funding_rounds']},'Graph dropped funding event')
    zeros=sorted(e['name'] for e in combined['entities'] if e['name'] in {p['name'] for p in projections} and e.get('founded_year')==0)
    require(not zeros,'Unknown founding year converted to zero')
    absent_names=sorted(p['name'] for p in projections if 'founded_year' not in p)
    for e in combined['entities']:
        if e['name'] in absent_names:require('founded_year' not in e,'Unknown founding year must remain absent')
    require(all(e['amount'] is None for e in funding['events'] if e['event_id'] in ['ikala-2024-series-b-plus','funnow-hotai-2026-09-22','kkday-2024-12-financing']),'Qualified funding encoded exactly')
    require(not any(e['id']=='funnow-hotai-2026-09-22' for p in projections for e in p.get('funding_rounds',[])),'Prospective event projected as completed financing')
    require(not projection_by_name(projections,'TeamT5').get('founded_year'),'Conflicting year projected')
    require(not projection_by_name(projections,'KryptoGO').get('funding_rounds'),'Conflicting headline projected as round')
    # Reuse the current deterministic planner and verify all finite input pages.
    sys.path.insert(0,str(REPO/'scripts'));planner=import_file('packet_profile_planner',REPO/'scripts/plan_company_profiles.py')
    recorded=load('planner-baseline.json')['pages'];seen=[]
    for i,page in enumerate(recorded):
        cursor=None if i==0 else recorded[i-1]['next_cursor']
        live=planner.build_plan(REPO/'data/startup-research.json',REPO/'data/company-profile-seeds.csv',manifest['base_revision'],limit=10,cursor=cursor)
        require(live==page,'Planner resume output changed');seen += [v['source_record_name'] for v in page['items']]
    require(len(seen)==len(set(seen))==45 and recorded[-1]['inventory_exhausted'],'Planner skipped/duplicated inventory')
    probes=[]
    bad=copy.deepcopy(claims);next(c for c in bad if c['status']=='reviewed_staged')['source_id']='missing'
    probes.append(reject_probe('missing claim source',lambda:evidence_check(bad,sources)))
    for label,change in [('zero as unknown',lambda e:e.update(amount=0,currency='USD')),('amount without currency',lambda e:e.update(amount=1,currency=None)),('padded partial date',lambda e:e.update(announced_on='2023-12-01',date={'value':'2023-12','precision':'month','basis':'completion_period'})),('lower bound as exact',lambda e:e.update(amount=20800000,currency='USD',amount_precision='strict_lower_bound'))]:
        changed=copy.deepcopy(funding['events']);change(changed[0]);probes.append(reject_probe(label,lambda:funding_check(changed,funding['participants'],company_ids,claims,sources)))
    for label,change in [('orphan participant',lambda p:p.update(event_id='missing')),('cross-company participant',lambda p:p.update(company_id='unresolved:startup:other'))]:
        changed=copy.deepcopy(funding['participants']);change(changed[0]);probes.append(reject_probe(label,lambda:funding_check(funding['events'],changed,company_ids,claims,sources)))
    probes.append(reject_probe('duplicate canonical domain',lambda:unique(companies+[companies[0]],'canonical_domain')))
    changed=copy.deepcopy(coverage);changed['resume_checkpoint']['queue_sha256']='0'*64
    probes.append(reject_probe('stale queue checkpoint',lambda:checkpoint_check(changed,PACKET/'next-source-queue.json',PACKET/'decisions.json')))
    probes.append(reject_probe('stale planner cursor',lambda:planner.build_plan(REPO/'data/startup-research.json',REPO/'data/company-profile-seeds.csv','0'*40,limit=10,cursor=recorded[0]['next_cursor'])))
    counts=coverage['counts'];require(counts==manifest['counts'],'Manifest/coverage count mismatch')
    require(counts['discovered_unique_candidates']==42 and counts['reviewed_companies']==24 and counts['accepted_staged']==20,'Candidate denominator mismatch')
    require(counts['claims']==len(claims) and counts['source_observations']==len(sources),'Evidence counts differ')
    require(counts['unique_source_urls']==len({s['url'] for s in sources}),'Unique URL count differs')
    return {'status':'pass_research_packet','base_revision':manifest['base_revision'],'production_integration_status':'pending_existing_owner_review_not_published','checks':{'current_record_validator':schema,'normalized_dedup':dedup,'source_rebuilt_baseline':{'entities':len(baseline['entities']),'kinds':dict(Counter(e['kind'] for e in baseline['entities'])),'rounds':len(baseline['funding_rounds'])},'founder_references':len(founders),'funding_entries_projected':len(rounds),'funding_events_staged':len(funding['events']),'event_participations':len(funding['participants']),'claims_checked':len(claims),'projection_provenance_items':len(trace),'in_memory_combined_graph':{'entities':len(combined['entities']),'rounds':len(combined['funding_rounds']),'articles':len(combined['articles'])},'unknown_founding_years_preserved_absent':absent_names,'planner':{'pages':len(recorded),'unique_records':len(seen),'exhaustion_scope':'supplied baseline overlay only'},'negative_probes':probes},'owner_findings':{'unknown_year_fix':'Resolved upstream in #179; no zero synthesized in final graph check.','same_source_articles_collapse':{'Jmem Tek':{'rounds':3,'articles':1},'JelloX Biotech':{'rounds':2,'articles':1},'CancerFree Biotech':{'rounds':2,'articles':1}},'runtime_files_changed':False}}

def projection_by_name(rows,name):return next(r for r in rows if r['name']==name)

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--report',action='store_true');parser.add_argument('--checksums',action='store_true');args=parser.parse_args()
    report=validate()
    if args.checksums:
        lines=(PACKET/'SHA256SUMS').read_text().splitlines()
        for line in lines:
            sha,name=line.split('  ',1);require(digest(PACKET/name)==sha,'Checksum mismatch: '+name)
        print('Verified',len(lines),'checksums')
    if args.report:(PACKET/'validation.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(report,ensure_ascii=False,indent=2))
