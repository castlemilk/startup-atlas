#!/usr/bin/env python3
"""Offline Indonesia packet checks. Reads production inputs; never writes them.

Run from any directory: python3 -B <this file> [--out report.json]
The current repository schema and graph functions are reused directly. This is
research-packet validation, not a replacement crawler, proposal API or importer.
"""
import argparse
import copy
import hashlib
import importlib.util
import json
import re
import subprocess
import sys
import unicodedata
from collections import Counter
from datetime import date, datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
checks = 0

def require(condition, message):
    global checks
    checks += 1
    if not condition: raise ValueError(message)

def read(p): return json.loads(p.read_text(encoding='utf-8'))
def filehash(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def digest(v): return hashlib.sha256(json.dumps(v,sort_keys=True,ensure_ascii=False,separators=(',',':')).encode()).hexdigest()
def normalize(s): return ' '.join(unicodedata.normalize('NFKC',s).casefold().split())
def slug(s): return re.sub(r'[^a-z0-9]+','-',unicodedata.normalize('NFKD',s).encode('ascii','ignore').decode().lower()).strip('-')
def host(s): return (urlsplit(s or '').hostname or '').lower().rstrip('.').removeprefix('www.')
def https(s):
    try:
        u=urlsplit(s)
        return u.scheme=='https' and bool(u.hostname) and not u.username and not u.password and u.port in (None,443) and not any(c.isspace() for c in s)
    except (TypeError,ValueError): return False
def timestamp(s):
    try:return datetime.fromisoformat(s.replace('Z','+00:00')).utcoffset() is not None
    except (ValueError,AttributeError):return False
def is_day(s):
    try:return isinstance(s,str) and date.fromisoformat(s).isoformat()==s
    except ValueError:return False

def check_amount(obj,label):
    amount=obj.get('amount');currency=obj.get('currency')
    require((amount is None)==(currency is None),label+': amount/currency parity')
    if amount is not None:
        require(type(amount) is int and amount>0,label+': unknown is not zero')
        require(bool(re.fullmatch(r'[A-Z]{3}',currency)),label+': currency code')

def check_coverage(cov):
    cp=cov['checkpoint'];q=cov['source_queue'];c=cov['candidates']
    require(cp['queue_sha256']==digest(q),'Queue changed without checkpoint update')
    require(cp['candidates_sha256']==digest(c),'Candidates changed without checkpoint update')
    ids=[x['queue_id'] for x in q]
    require(len(ids)==len(set(ids)),'Duplicate queue ID')
    require(ids==cp['queue_order'],'Resume order mismatch')
    require(0<=cp['queue_offset']<len(ids),'Invalid resume offset')
    require(ids[cp['queue_offset']]==cp['next_queue_id'],'Resume next-item mismatch')
    done=set(cp['completed_candidates']);pending=set(cp['pending_candidate_ids'])
    require(not done&pending,'Candidates both completed and pending')
    require(done|pending=={x['candidate_id'] for x in c},'Checkpoint loses candidates')
    require(all(not x['crawler_seed_approved'] for x in q),'Research queue approved crawler seed')
    require(cov['national_startup_denominator'] is None and not cov['completeness_claim'],'Unsupported national completeness')

def validate():
    manifest=read(HERE/'manifest.json')
    records=read(HERE/'records.json')
    companies=read(HERE/'company-index.json')['companies']
    events=read(HERE/'funding-events.json')['events']
    claims=read(HERE/'evidence-ledger.json')['claims']
    sources=read(HERE/'source-registry.json')['sources']
    cov=read(HERE/'coverage.json')
    projections=read(HERE/'projection-map.json')['records']
    baseline=read(HERE/'source-baseline.json')
    dedup=read(HERE/'deduplication.json')
    bysource={s['source_id']:s for s in sources}
    require(len(bysource)==len(sources),'Duplicate source IDs')
    for s in sources:
        require(https(s['url']),'Invalid source URL: '+s['source_id'])
        require(timestamp(s['retrieved_at']),'Missing retrieval timestamp: '+s['source_id'])
        require(type(s['accessed']) is bool,'Source access status must be explicit')
        require(not s['crawler_seed_approved'],'Source discovery approved a seed')
        require(s['published_on'] is None or is_day(s['published_on']),'Publication day fabricated from partial date')
    keys=set();claimids=set()
    dispositions={'unsearched','searched_unknown','blocked','not_applicable','rejected'}
    for c in claims:
        require(c['claim_id'] not in claimids,'Duplicate claim ID');claimids.add(c['claim_id'])
        require(c['publication_state']=='unsubmitted','Research claim marked published')
        if c['status'] in dispositions:
            require(bool(c.get('rationale')),'Missing unknown/disposition rationale')
            if c['status']=='searched_unknown':require(bool(c.get('search_log')),'Unknown needs searched-source log')
            continue
        require(c.get('value') is not None,'Null submitted as a fact')
        require(c['source_id'] in bysource,'Missing claim source')
        source=bysource[c['source_id']]
        require(c['source_url']==source['url'],'Claim source-ID/URL mismatch')
        require(source['accessed'] and c['accessed'],'Accepted inaccessible evidence')
        require(c['source_kind']!='discovery','Search/discovery promoted as evidence')
        require(timestamp(c['retrieved_at']),'Claim retrieval timestamp missing')
        require(c['published_on'] is None or is_day(c['published_on']),'Invalid publication date')
        require(c['effective_on'] is None or is_day(c['effective_on']),'Invalid effective date')
        for sid in c.get('source_ids',[c['source_id']]):
            require(sid in bysource and bysource[sid]['accessed'],'Supporting claim source missing or inaccessible')
        key=digest({k:c.get(k) for k in ('entity_id','field','value','source_url','effective_on')})
        require(key not in keys,'Duplicate claim observation');keys.add(key)
    names=[normalize(x['canonical_name']) for x in companies]
    domains=[x['canonical_domain'] for x in companies]
    ids=[x['staging_id'] for x in companies]
    require(len(names)==len(set(names))==len(set(domains))==len(set(ids))==23,'Company identity duplication')
    require(len(records)==len(companies)==len(projections),'Projection/company mismatch')
    for c in companies:
        require(host(c['website'])==c['canonical_domain'],'Canonical host mismatch')
        require(c['proposed_atlas_id']=='startup:'+slug(c['canonical_name']),'Production slug mismatch')
        for e in baseline['startups']:
            require(normalize(c['canonical_name'])!=normalize(e['name']),'Existing normalized-name collision')
            require(c['proposed_atlas_id']!=e['id'],'Existing production-ID collision')
            if e.get('website'):require(c['canonical_domain']!=host(e['website']),'Existing canonical-host collision')
    require(dedup['duplicate_existing_companies']==0,'Unresolved existing duplicate')
    for filename,expected in baseline['inputs'].items():
        require(filehash(ROOT/'data'/filename)==expected,'Pinned production input changed: '+filename)
    eventids=[e['event_id'] for e in events]
    require(len(eventids)==len(set(eventids))==29,'Capital event duplicate/missing')
    participants=0
    for e in events:
        require(e['company_id'] in ids,'Orphan capital event')
        check_amount(e,e['event_id'])
        if e.get('announced_on'):
            if e.get('date_precision')=='day':require(is_day(e['announced_on']),'Bad precise event date')
        require(not e['eligible_for_automatic_equity_total'],'Mixed event automatically aggregated')
        for p in e['participants']:
            participants+=1
            require(p['event_id']==e['event_id'],'Orphan round participant')
            require(p['evidence_basis'] in {'event_specific_announcement','event_specific_regulatory_filing'},'Portfolio-only round attribution')
            require(p['role'] in {'lead','participant','unspecified'},'Unsupported canonical role')
            require(all(s in bysource and bysource[s]['accessed'] for s in p['source_ids']),'Participant source unavailable')
            matching=[c for c in claims if c['field']=='round_participant' and c.get('value',{}).get('event_id')==e['event_id'] and c['value'].get('name')==p['name']]
            require(bool(matching),'Participant lacks event-specific claim')
    require(participants==manifest['counts']['event_participant_observations'],'Participant count mismatch')
    byname={r['name']:r for r in records};byevent={e['event_id']:e for e in events}
    readable_urls={s['url'] for s in sources if s['accessed']}
    for rec in records:
        for item in [rec]+rec.get('founders',[])+rec.get('profile_facts',[])+rec.get('funding_rounds',[]):
            require(item['source'] in readable_urls,'Projected field source not in accessed registry')
    for mapping in projections:
        rec=byname[mapping['record_name']]
        require(mapping['proposed_atlas_id']=='startup:'+slug(rec['name']),'Projection/company identity mismatch')
        mapped={x['projected_id'] for x in mapping['round_mappings']}
        require(mapped=={x['id'] for x in rec['funding_rounds']},'Projection drops or invents a round')
        for item in mapping['round_mappings']:
            require(item['research_event_id'] in byevent,'Projection points to missing research event')
            parent=byevent[item['research_event_id']]
            require(parent['company_id']==mapping['company_id'],'Projection points to another company event')
            fr=next(x for x in rec['funding_rounds'] if x['id']==item['projected_id'])
            if item['basis']=='equity_component':
                equity=next(x for x in parent['components'] if x['kind']=='equity')
                require(fr['amount']==equity['amount'] and fr['currency']==equity['currency'],'Projected component differs from evidence')
            elif 'amount' in fr:
                require(fr['amount']==parent['amount'] and fr['currency']==parent['currency'],'Projected event amount differs from evidence')
    require(byname['JULO']['funding_rounds'][0]['amount']==30000000,'JULO equity includes debt')
    julo=byevent['julo-2022-04-series-b-and-credit-facility']
    require(julo['amount']==sum(x['amount'] for x in julo['components'])==80000000,'JULO component reconciliation')
    require(byname['Fazz']['funding_rounds'][0]['amount']==75000000,'Fazz equity includes term sheet')
    require(next(f for f in byname['Fazz']['founders'] if f['name']=='Hendra Kwik')['source']=='https://fazz.com/about/','Fazz CEO-only release used as founder evidence')
    require('id-fin-s02' in next(c for c in claims if c['entity_id']=='staging:id:xendit' and c['field']=='founding')['source_ids'],'Xendit conflict source omitted')
    require(byevent['fazz-2022-09-lendable-term-sheet']['transaction_kind']=='debt_facility_term_sheet','Fazz facility status lost')
    for name in ['Traveloka','DANA']:
        require('amount' not in byname[name]['funding_rounds'][0],name+' contribution/facility promoted to round scalar')
    for name in ['Paxel','ALAMI']:
        require('amount' not in byname[name]['funding_rounds'][0],name+' unknown amount became numeric')
    require('amount' not in byname['Flip']['funding_rounds'][1],'Flip cumulative amount treated as extension amount')
    require('announced_on' not in byname['CrediBook']['funding_rounds'][0],'CrediBook conflict erased')
    require('announced_on' not in byname['Astro']['funding_rounds'][0],'Astro month assigned arbitrary day')
    require('announced_on' not in byname['Paxel']['funding_rounds'][0],'Paxel month assigned arbitrary day')
    for eid in ['dana-2022-08-dsst-transfer','dana-2024-dsst-receivables-conversion']:
        require(byevent[eid]['announced_on'] is None,'Retrospective DANA transaction became announcement')
        require(bool(byevent[eid]['occurred_on']),'DANA transaction occurrence lost')
    require(bysource['id-fin-s23']['published_on'] is None and bysource['id-fin-s23']['updated_on']=='2020-09-21','Pintu update treated as publication')
    require(bysource['id-fin-s25']['published_on'] is None,'Pintu whitepaper as-of treated as publication')
    check_coverage(cov)
    require(len(cov['candidates'])==39 and len(cov['checkpoint']['pending_candidate_ids'])==15,'Candidate denominator mismatch')
    require(sum(x['reviewed'] for x in cov['candidates'])==24,'Reviewed count mismatch')
    require(cov['source_denominators'][0]['count']==15,'ITB source denominator mismatch')
    # Actual shared schema and merge semantics, using only memory.
    node_script=r'''
import fs from 'node:fs';
import {validateStartupRecord,mergeStartup,startupSlug} from './backend/hosted/src/startup-record.mjs';
const records=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));
for(const record of records)validateStartupRecord(record);
const current=records.find(x=>x.name==='Paxel');
const old={...current,funding_rounds:[{...current.funding_rounds[0],amount:23000000,currency:'USD'}]};
const merged=mergeStartup(old,current);
if(merged.funding_rounds[0].amount!==23000000)throw new Error('Known merge behavior changed: review gate');
const unknowns=records.filter(x=>!Object.hasOwn(x,'founded_year')).map(x=>x.name);
console.log(JSON.stringify({schema_valid_records:records.length,omission_retains_previous_amount:true,unknown_founding_names:unknowns,unicode_slug:startupSlug('Ｆｌｉｐ')}));
'''
    result=subprocess.run(['node','--input-type=module','-e',node_script,str(HERE/'records.json')],cwd=ROOT,capture_output=True,text=True,check=True)
    schema=json.loads(result.stdout)
    require(schema['schema_valid_records']==23,'Schema count mismatch')
    require(schema['unicode_slug']=='flip','Production normalization mismatch')
    spec=importlib.util.spec_from_file_location('indonesia_actual_graph',ROOT/'scripts/make-graph.py')
    graphmod=importlib.util.module_from_spec(spec);spec.loader.exec_module(graphmod)
    original=read(ROOT/'data/startup-research.json')
    combined=copy.deepcopy(original);combined['startups'].extend(records)
    graph=graphmod.build_graph(read(ROOT/'data/partner-profiles.json'),read(ROOT/'data/partner-leads.json'),read(ROOT/'data/partners-reviewed.json'),read(ROOT/'data/catalogue.json'),combined)
    zero_names=[n['name'] for n in graph['entities'] if n['id'] in {c['proposed_atlas_id'] for c in companies} and n.get('founded_year')==0]
    absent_names=[n['name'] for n in graph['entities'] if n['id'] in {c['proposed_atlas_id'] for c in companies} and 'founded_year' not in n]
    require(not zero_names,'Unknown founding year became zero after owner fix')
    require(sorted(absent_names)==sorted(schema['unknown_founding_names']),'Owner fix failed to preserve unknown founding years')
    require(len([n for n in graph['entities'] if n['kind']=='startup'])==69,'In-memory graph startup collision')
    require(len(graph['funding_rounds'])==51,'In-memory funding identity collision')
    # Negative fixtures check the actual remaining data risks, not UI/runtime code.
    negative=[]
    def rejects(label,fn):
        try:fn()
        except ValueError:negative.append(label)
        else:raise ValueError('Negative fixture not rejected: '+label)
    rejects('known amount without currency',lambda:check_amount({'amount':30000000},'fixture'))
    rejects('unknown represented as zero',lambda:check_amount({'amount':0,'currency':'USD'},'fixture'))
    tampered=copy.deepcopy(cov);tampered['source_queue'][0]['next_action']='Changed after checkpoint'
    rejects('changed queue invalidates resume pin',lambda:check_coverage(tampered))
    broken=copy.deepcopy(cov);broken['checkpoint']['pending_candidate_ids'].append(broken['checkpoint']['completed_candidates'][0])
    rejects('completed candidate requeued',lambda:check_coverage(broken))
    require(normalize('  Ｆｌｉｐ  ')==normalize('flip'),'NFKC identity normalization')
    require(host('https://WWW.XENDIT.CO/path?x=1')=='xendit.co','Host normalization')
    require(host('https://app.xendit.co/')!=host('https://xendit.co/'),'Subdomain improperly collapsed')
    require(slug('Payfazz')!=slug('Fazz'),'Predecessor merged by heuristic')
    split=17;ordered=cov['checkpoint']['queue_order']
    require(ordered[:split]+ordered[split:]==ordered and len(set(ordered))==len(ordered),'Resume loses/repeats work')
    return dict(valid=True,checked_at=datetime.now(timezone.utc).isoformat(),validated_revision=manifest['repository']['base_revision'],checks=checks,records=23,claims=len(claims),source_observations=len(sources),registered_unique_urls=len({s['url'] for s in sources}),capital_events=len(events),participants=participants,negative_fixtures_passed=negative,schema=schema,source_input_hashes_unchanged=True,deduplication={'baseline_startups':46,'new_staged_startups':23,'matches':0},in_memory_graph={'entities':len(graph['entities']),'startups':69,'funding_events':51,'unknown_founding_omissions_preserved':absent_names,'zero_founding_values':zero_names,'written_to_disk':False},resolved_owner_fix={'pull_request':'https://github.com/castlemilk/startup-atlas/pull/179','unknown_founding_omission_preserved':True},known_owner_integration_gates={'merge_omission_retains_previous_numeric_amount':True},production_ready=False,limitations='Structural, provenance-link and targeted semantic validation; no complete current-operations audit or production publication. Data acceptance, live merge preflight and releases remain with existing owners.')

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--out',type=Path);args=parser.parse_args()
    try:result=validate()
    except (ValueError,KeyError,AssertionError,subprocess.CalledProcessError) as exc:
        print(json.dumps({'valid':False,'checks_completed':checks,'error':str(exc)},indent=2));sys.exit(1)
    if args.out:args.out.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(result,ensure_ascii=False,indent=2))
