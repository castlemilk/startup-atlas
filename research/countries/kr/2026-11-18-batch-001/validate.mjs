#!/usr/bin/env node
// Country-only offline validation; imports the existing production record validator.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {validateStartupRecord,startupSlug} from '../../../../backend/hosted/src/startup-record.mjs';

const here=dirname(fileURLToPath(import.meta.url));
const read=n=>JSON.parse(readFileSync(resolve(here,n),'utf8'));
const bytes=n=>readFileSync(resolve(here,n));
const digest=b=>createHash('sha256').update(b).digest('hex');
const manifest=read('manifest.json'),companies=read('companies.json'),claims=read('claims.json').claims;
const sources=read('sources.json').sources,records=read('startup-records.json').startups,mapping=read('projection-map.json').records;
const coverage=read('coverage.json'),checkpoint=read('checkpoint.json'),queue=read('next-source-queue.json');
const baseline=read('evidence/built-baseline.json');
const C=new Map(claims.map(x=>[x.claim_id,x])),S=new Map(sources.map(x=>[x.id,x]));
const companyById=new Map(companies.companies.map(x=>[x.staging_id,x]));
const accepted=new Set(companies.companies.filter(x=>x.review_disposition==='accepted_staged').map(x=>x.staging_id));
const tests=[];
function test(name,fn){fn();tests.push({name,status:'passed'});}
const normal=s=>s.normalize('NFKC').toLocaleLowerCase('en-US').replace(/\s+/g,' ').trim();
const host=s=>new URL(s).hostname.toLowerCase().replace(/^www\./,'').replace(/\.$/,'');
const unique=(a,label)=>assert.equal(new Set(a).size,a.length,label);
const clone=x=>structuredClone(x);

function checkProvenance(record,map){
  const refs=map.field_claim_ids;
  for(const [field,ids] of Object.entries(refs))for(const id of ids){
    const cl=C.get(id);assert.ok(cl,`missing claim ${id}`);assert.equal(cl.entity_id,map.staging_id);assert.equal(cl.status,'reviewed_staged');assert.equal(cl.accessed,true);assert.equal(S.get(cl.source_id).accessed,true);
  }
  assert.equal(record.source,C.get(refs.description[0]).source_url);
  assert.equal(record.description,C.get(refs.description[0]).value);
  if(record.founded_year!==undefined){const cl=C.get(refs.founded_year[0]);assert.equal(record.source,cl.source_url);assert.equal(record.founded_year,Number((cl.value.date??cl.value.value).slice(0,4)));}
  for(const [i,f] of (record.founders??[]).entries()){
    const cl=C.get(refs[`founders.${i}`][0]);assert.equal(cl.field,'founder');assert.equal(f.name,cl.value.name);assert.equal(f.source,cl.source_url);assert.ok(startupSlug(f.name));
  }
  for(const [i,f] of (record.profile_facts??[]).entries())assert.equal(f.source,C.get(refs[`profile_facts.${i}`][0]).source_url);
  for(const [i,e] of (record.funding_rounds??[]).entries()){
    const cl=C.get(refs[`funding_rounds.${i}`][0]);const v=cl.value;
    assert.equal(cl.field,'funding_round');assert.equal(e.id,v.event_id);assert.equal(e.source,cl.source_url);
    assert.equal(e.stage,v.stage??'Investment (stage not reported)');
    if(e.announced_on!==undefined)assert.equal(e.announced_on,v.announced_on,'day must be sourced, not padded or publication-substituted');
    if(e.amount!==undefined){assert.ok(v.amount!==null&&v.currency!==null);assert.equal(e.amount,v.amount);assert.equal(e.currency,v.currency);assert.ok(['KRW','USD'].includes(e.currency));assert.ok(e.amount>0,'unknown is not zero');}
    else assert.ok(v.amount===null||v.amount===undefined,'known supported amount unexpectedly lost');
    if(v.currency===null||v.currency===undefined){assert.equal(e.amount,undefined);assert.equal(e.currency,undefined);}
    assert.equal(e.valuation,undefined,'valuations retained in research, not silently presented as current');
  }
  assert.equal(record.relationships,undefined,'event participants must not become generic company relationships');
}
function checkParticipants(rows){
  const events=new Map(rows.filter(x=>['funding_round','investment_event'].includes(x.field)).map(x=>[x.value.event_id,x]));
  for(const p of rows.filter(x=>['round_participant','event_participant'].includes(x.field))){
    const e=events.get(p.value.event_id);assert.ok(e,'orphan event participant');assert.equal(p.entity_id,e.entity_id,'cross-company participant/event link');assert.equal(p.value.resolved_entity_id,null,'unresolved investor must not be silently joined');
  }
}
function checkResume(cp,q){
  assert.equal(cp.source_revision,manifest.source_revision);
  const hash=digest(Buffer.from(JSON.stringify(q,null,2)+'\n'));
  assert.equal(cp.next_source_queue_sha256,hash,'queue mutation requires a new checkpoint');
  const data={revision:cp.source_revision,selection:cp.selected_candidate_order,queue_sha256:hash};
  assert.equal(cp.configuration_fingerprint,digest(Buffer.from(JSON.stringify(data))));
  unique(cp.selected_candidate_order,'candidate order duplicates');
  assert.equal(cp.selected_candidate_order.length,coverage.company_counts.selected_discovered);
  const done=new Set(cp.reviewed_candidate_ids);assert.equal(done.size,coverage.company_counts.reviewed);
  assert.deepEqual(cp.selected_candidate_order.filter(x=>!done.has(x)),cp.remaining_candidate_ids);
  assert.equal(q.queue.every(x=>x.status==='queued'&&x.crawler_approval===false),true);
}

test('Existing strict production schema accepts every staged startup record',()=>records.forEach(validateStartupRecord));
test('Record schema rejects research-only properties, explicit nulls and partial dates',()=>{
  assert.throws(()=>validateStartupRecord({...records[0],country_code:'KR'}));
  assert.throws(()=>validateStartupRecord({...records[0],founded_year:null}));
  const bad=clone(records.find(x=>x.funding_rounds?.length));bad.funding_rounds[0].announced_on='2022-08';assert.throws(()=>validateStartupRecord(bad));
});
test('Normalized company names, domains, aliases and graph slugs are collision-free',()=>{
  unique(records.map(x=>normal(x.name)),'names');unique(records.map(x=>host(x.website)),'domains');unique(records.map(x=>startupSlug(x.name)),'slugs');
  const dedup=read('deduplication.json');assert.equal(dedup.exact_baseline_matches,0);assert.deepEqual(dedup.within_packet_collisions,[]);
  for(const c of companies.companies)assert.equal(host(c.website),c.canonical_domain);
  for(const r of records)assert.equal(baseline.startups.some(x=>normal(x.name)===normal(r.name)||x.id==='startup:'+startupSlug(r.name)||(x.website&&host(x.website)===host(r.website))),false);
});
test('Source/claim IDs, URLs, access states and retrieval timestamps are consistent',()=>{
  unique(sources.map(x=>x.id),'source IDs');unique(claims.map(x=>x.claim_id),'claim IDs');
  for(const cl of claims){const s=S.get(cl.source_id);assert.ok(s);assert.equal(cl.source_url,s.url);assert.ok(Number.isFinite(Date.parse(cl.retrieved_at)));assert.equal(cl.retrieved_at.slice(0,10),'2026-11-18');if(cl.status==='reviewed_staged'){assert.equal(cl.accessed,true);assert.equal(s.accessed,true);assert.ok(cl.evidence&&cl.rationale);}}
  for(const s of sources){assert.equal(new URL(s.url).protocol,'https:');assert.equal(s.crawler_approval,false);}
});
test('Every projected field and event is bound to reviewed company claims',()=>{
  assert.equal(records.length,mapping.length);for(const r of records){const m=mapping.find(x=>x.name===r.name);assert.ok(accepted.has(m.staging_id));checkProvenance(r,m);}
});
test('Unknown amounts cannot become zero or an inferred ISO currency',()=>{
  const index=records.findIndex(r=>r.funding_rounds?.some(x=>x.amount===undefined));const r=clone(records[index]);const ei=r.funding_rounds.findIndex(x=>x.amount===undefined);r.funding_rounds[ei].amount=0;r.funding_rounds[ei].currency='USD';assert.throws(()=>checkProvenance(r,mapping[index]));
  assert.equal(records.some(r=>r.founded_year===0||r.funding_rounds?.some(e=>e.amount===0)),false);
});
test('Funding date and source substitutions are rejected by evidence bindings',()=>{
  const i=records.findIndex(r=>r.funding_rounds?.some(x=>!x.announced_on));const r=clone(records[i]);r.funding_rounds.find(x=>!x.announced_on).announced_on='2022-01-01';assert.throws(()=>checkProvenance(r,mapping[i]));
  const j=records.findIndex(r=>r.funding_rounds?.length);const r2=clone(records[j]);r2.funding_rounds[0].source=records[(j+1)%records.length].source;assert.throws(()=>checkProvenance(r2,mapping[j]));
});
test('Funding participant relationships resolve within their own company/event',()=>checkParticipants(claims));
test('Orphan and cross-company participation mutations are rejected',()=>{
  const a=clone(claims);a.find(x=>x.field==='round_participant').value.event_id='nonexistent';assert.throws(()=>checkParticipants(a));
  const b=clone(claims);b.find(x=>x.field==='round_participant').entity_id='unresolved:kr:other-company';assert.throws(()=>checkParticipants(b));
});
test('Held and conflicting events cannot enter the strict projection',()=>{
  const ids=new Set(records.flatMap(x=>(x.funding_rounds??[]).map(e=>e.id)));
  for(const cl of claims.filter(x=>x.field==='funding_round'))assert.equal(ids.has(cl.value.event_id),accepted.has(cl.entity_id)&&cl.status==='reviewed_staged');
  assert.equal(records.some(x=>x.name==='Wrtn Technologies'),false);assert.equal(records.find(x=>x.name==='Deep Bio').funding_rounds,undefined);
  assert.equal(records.find(x=>x.name==='Medical AI').founded_year,undefined);
});
test('Portfolio, totals, fundraising intentions and stake purchases are not invented rounds',()=>{
  const ids=records.flatMap(x=>(x.funding_rounds??[]).map(e=>e.id));
  assert.equal(ids.some(x=>x.includes('standard-energy')),false);
  assert.equal(claims.some(x=>x.field==='round_participant'&&x.entity_id==='unresolved:kr:bucketplace'),false);
  const intention=claims.find(x=>x.field==='fundraising_intention');assert.ok(intention);assert.equal(ids.some(x=>x.includes('channel')&&x.includes('2024')),false);
  assert.equal(coverage.funding.aggregate_funding_total,null);
});
test('Funding IDs are globally unique against the pinned production overlay',()=>{
  const prod=JSON.parse(readFileSync(resolve(here,'../../../../data/startup-research.json'),'utf8'));
  unique([...prod.startups,...records].flatMap(x=>(x.funding_rounds??[]).map(e=>e.id)),'round IDs');
});
test('Counts reconcile with explicit candidate dispositions, not a country denominator',()=>{
  const n=coverage.company_counts;assert.equal(n.selected_discovered,28);assert.equal(n.reviewed,n.accepted_staged+n.held+n.rejected_from_this_startup_batch);assert.equal(n.selected_discovered,n.reviewed+n.discovery_only);assert.equal(n.accepted_staged,records.length);assert.equal(coverage.denominator.country_startup_population,null);assert.equal(coverage.denominator.country_complete,false);assert.equal(n.accepted_complete_profiles,0);
  assert.equal(coverage.company_claims_total,claims.length);assert.equal(coverage.funding.projected_events,records.reduce((s,x)=>s+(x.funding_rounds?.length??0),0));assert.equal(coverage.queue.items,queue.queue.length);
});
test('Scoped geography never upgrades a business address to headquarters',()=>{
  const f=records.find(x=>x.name==='FuriosaAI');assert.ok(f.profile_facts.some(x=>x.label.includes('principal place of business')));assert.equal(f.profile_facts.some(x=>x.label==='Headquarters'),false);
  for(const name of ['Upstage','Viva Republica','Bucketplace','RIDI','Tridge'])assert.equal(records.find(x=>x.name===name).profile_facts.some(x=>/headquarters/i.test(x.label)),false);
});
test('Resume checkpoint retains every reviewed candidate and source queue item',()=>checkResume(checkpoint,queue));
test('Queue, candidate order and source revision mutations invalidate resume',()=>{
  const q=clone(queue);q.queue.shift();assert.throws(()=>checkResume(checkpoint,q));
  const cp=clone(checkpoint);cp.selected_candidate_order.reverse();assert.throws(()=>checkResume(cp,queue));
  const cp2=clone(checkpoint);cp2.source_revision='0'.repeat(40);assert.throws(()=>checkResume(cp2,queue));
});
test('Research manifest leaves production, crawler approval and deployment untouched',()=>{
  assert.equal(manifest.staging_only,true);assert.equal(manifest.production_schema_changed,false);for(const k of ['production_writes','crawler_seed_approvals','crawler_runs','deployments'])assert.equal(manifest[k],0);
});
console.log(JSON.stringify({packet_id:manifest.packet_id,status:'passed',test_groups:tests.length,records:records.length,funding_events:coverage.funding.projected_events,claims:claims.length,sources:sources.length,tests},null,2));
