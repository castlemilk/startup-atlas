import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve, dirname} from 'node:path';
import {validateStartupRecord, startupSlug} from '../../../../backend/hosted/src/startup-record.mjs';
import {publicHttps, validDate} from '../../../../scripts/catalogue-entries.mjs';

// This validates one research packet. It is not a source approval, collector,
// production schema, investor-round API, factual verifier, or publication path.
const HERE=dirname(fileURLToPath(import.meta.url));
const REPO=resolve(HERE,'../../../..');
const read=name=>JSON.parse(readFileSync(resolve(HERE,name),'utf8'));
export const sha256=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
export const normalizedName=value=>value.normalize('NFKC').toLocaleLowerCase('en').replace(/\s+/g,' ').trim();
export function domainKey(value){
  publicHttps(value,'website');
  return new URL(value).hostname.toLowerCase().replace(/^www\./,'');
}
function stamp(value,label){assert.equal(typeof value,'string',label);assert.match(value,/T.*(?:Z|[+-]\d\d:\d\d)$/u,label);assert.ok(Number.isFinite(Date.parse(value)),label);}
function unique(values,label){assert.equal(new Set(values).size,values.length,label);}
function getPath(object,path){return path.split('/').filter(Boolean).reduce((o,k)=>o?.[k],object);}

export function resumeIds(coverage,companies){
  const ordered=companies.map(x=>x.id);
  assert.equal(sha256(ordered),coverage.checkpoint.worklist_sha256,'checkpoint worklist digest');
  assert.deepEqual(coverage.checkpoint.ordered_ids,ordered,'checkpoint order');
  unique(coverage.checkpoint.reviewed_ids,'duplicate reviewed IDs');
  for(const id of coverage.checkpoint.reviewed_ids)assert.ok(ordered.includes(id),'unknown reviewed ID');
  return ordered.filter(id=>!coverage.checkpoint.reviewed_ids.includes(id));
}

export function validatePacket(packet){
  const {claims,records,companies,sources,coverage,projection,baseline,funding}=packet;
  const facts=claims.claims, byClaim=new Map(facts.map(x=>[x.claim_id,x]));
  const bySource=new Map(sources.sources.map(x=>[x.url,x]));
  unique(facts.map(x=>x.claim_id),'duplicate claim IDs');
  unique(sources.sources.map(x=>x.source_id),'duplicate source IDs');
  unique(sources.sources.map(x=>x.url),'duplicate source URLs');
  for(const s of sources.sources){
    publicHttps(s.url,'source URL');
    assert.equal(s.crawler_seed_approved,false,'research is not seed approval');
    assert.ok(Array.isArray(s.access_observations));
  }
  for(const c of facts){
    assert.ok(['reviewed_staged','conflict'].includes(c.status),'reviewed source assertions only; conflicts are not resolved canonical facts');
    assert.equal(c.accessed,true,'reviewed source must be read');
    assert.notEqual(c.value,null,'unknown is a disposition, not a factual null');
    assert.notEqual(c.source_kind,'discovery','discovery is not review');
    assert.ok(['primary_company','primary_investor','regulatory','secondary'].includes(c.source_kind));
    publicHttps(c.source_url,'claim source');
    assert.ok(bySource.has(c.source_url),'claim missing registry source');
    assert.ok(bySource.get(c.source_url).claim_ids.includes(c.claim_id),'source reverse provenance missing');
    stamp(c.retrieved_at,'retrieval timestamp');stamp(c.reviewed_at,'review timestamp');
    for(const field of ['published_on','effective_on'])if(c[field]!==null)validDate(c[field],field);
    assert.ok(c.evidence?.trim()&&c.rationale?.trim(),'claim evidence/rationale');
    assert.equal(c.publication_state,'unsubmitted','facts remain unsubmitted to production');
  }
  const members=companies.companies;
  unique(members.map(x=>x.id),'duplicate company IDs');
  const accepted=members.filter(x=>x.status==='accepted_staged');
  const names=accepted.map(x=>normalizedName(x.name));unique(names,'normalised company name collision');
  unique(accepted.map(x=>domainKey(x.website)),'canonical domain collision');
  const knownNames=new Set(baseline.existing_startups.map(x=>normalizedName(x.name)));
  const knownDomains=new Set(baseline.existing_startups.filter(x=>x.website).map(x=>domainKey(x.website)));
  for(const c of accepted){
    assert.equal(c.id,'startup:'+startupSlug(c.name),'canonical candidate ID');
    assert.ok(c.china_basis_claim_ids.length,'China nexus requires evidence');
    assert.ok(!knownNames.has(normalizedName(c.name)),'existing name needs update review');
    assert.ok(!knownDomains.has(domainKey(c.website)),'existing domain needs update review');
    for(const id of [...c.claim_ids,...c.china_basis_claim_ids]){
      assert.equal(byClaim.get(id)?.entity_id,c.id,'wrong company claim endpoint');
    }
  }
  assert.equal(records.startups.length,accepted.length,'projection/acceptance count');
  unique(records.startups.map(x=>startupSlug(x.name)),'projection ID collision');
  const rounds=new Set();
  const recordById=new Map();
  const eventById=new Map(funding.events.map(e=>[e.event_id,e]));
  unique(funding.events.map(e=>e.event_id),'duplicate indexed funding events');
  for(const e of funding.events){
    assert.equal(e.participant_list_complete,false,'incomplete participant rosters remain incomplete');
    assert.equal(e.graph_relationships_created,0,'no speculative graph relationships');
    for(const id of e.claim_ids)assert.equal(byClaim.get(id)?.entity_id,e.company_id,'event source subject');
    for(const p of e.participants){
      assert.equal(p.event_id,e.event_id,'participant event index mismatch');
      assert.ok(e.claim_ids.includes(p.supporting_claim_id),'participant missing event-specific claim');
    }
  }
  for(const r of records.startups){
    validateStartupRecord(r);assert.ok(r.website&&r.description,'new-record requirements');
    const eid='startup:'+startupSlug(r.name);recordById.set(eid,r);
    assert.ok(accepted.some(c=>c.id===eid),'nonaccepted record projected');
    assert.ok(!Object.hasOwn(r,'relationships'),'unresolved investor identities must not create edges');
    for(const f of r.founders||[])assert.ok(startupSlug(f.name),'Chinese-only founder requires identity handoff');
    for(const e of r.funding_rounds||[]){
      assert.ok(!rounds.has(e.id),'duplicate event ID');rounds.add(e.id);
      assert.ok(e.id.startsWith(startupSlug(r.name)+'-'),'event/company identity');
      assert.ok(!Object.hasOwn(e,'investors')&&!Object.hasOwn(e,'participants'),'no new API fields');
    }
  }
  unique(projection.fields.map(m=>m.entity_id+'|'+m.path),'duplicate projection mapping');
  for(const m of projection.fields){
    const r=recordById.get(m.entity_id);assert.ok(r,'mapping for absent record');
    assert.notEqual(getPath(r,m.path),undefined,'mapping for absent path');
    assert.ok(m.claim_ids.length,'field has no provenance');
    for(const id of m.claim_ids)assert.equal(byClaim.get(id)?.entity_id,m.entity_id,'projection source subject');
    const mapped=m.claim_ids.map(id=>byClaim.get(id));
    if(m.path==='/name')assert.ok(mapped.some(c=>c.field==='name'&&c.value===r.name||c.field==='identity'&&c.value.canonical_name===r.name),'projected canonical name needs exact identity evidence');
    if(m.path==='/description')assert.ok(mapped.some(c=>c.field==='description'&&c.value===r.description),'projected description differs from reviewed assertion');
    if(m.path==='/website')assert.ok(mapped.some(c=>c.field==='website'&&domainKey(c.value)===domainKey(r.website)||c.field==='identity'&&domainKey(c.value.website)===domainKey(r.website)),'projected domain differs from reviewed identity');
    if(/\/founders\/\d+\/name$/.test(m.path)){
      const actual=getPath(r,m.path);
      assert.ok(mapped.some(c=>['founder','founders'].includes(c.field)&&(Array.isArray(c.value)?c.value:[c.value])
        .some(f=>[f.name_english,f.english_name,f.name].includes(actual))),'projected founder name requires explicit founder assertion');
    }
    if(/^\/profile_facts\/\d+$/.test(m.path)){
      const fact=getPath(r,m.path);
      assert.ok(mapped.some(c=>c.source_url===fact.source),'profile fact source must match evidence');
      if(/headquarters/i.test(fact.label))assert.ok(mapped.some(c=>['headquarters','headquarters_district'].includes(c.field)),'contact or operating office cannot become headquarters');
    }
    if(m.path.startsWith('/funding_rounds/')){
      assert.ok(eventById.has(m.event_id),'funding projection requires original event ID');
      const event=eventById.get(m.event_id);
      assert.equal(event.company_id,m.entity_id,'funding projection event subject');
      for(const id of m.claim_ids)assert.ok(event.claim_ids.includes(id),'funding projection claim belongs to different event');
      if(/^\/funding_rounds\/\d+$/.test(m.path))assert.ok(mapped.some(c=>c.source_url===getPath(r,m.path).source),'funding projection source must match event evidence');
    }
    if(/\/funding_rounds\/\d+\/amount$/.test(m.path)){
      assert.equal(m.precision,'exact','qualified amount cannot become exact numeric total');
      const amount=getPath(r,m.path),currency=getPath(r,m.path.replace(/amount$/,'currency'));
      assert.ok(mapped.some(c=>['funding_round','funding_round.amount'].includes(c.field)
        &&c.value.amount===amount&&c.value.currency===currency
        &&['exact','reported_exact'].includes(c.value.amount_qualifier||c.value.qualifier)
        &&(c.value.amount_scope||'round_total')==='round_total'),
        'projected amount/currency must equal exact sourced round total, not a contribution or bound');
    }
    if(/\/funding_rounds\/\d+\/announced_on$/.test(m.path)){
      assert.equal(m.precision,'day','partial date cannot become day precision');
      const day=getPath(r,m.path);
      assert.ok(mapped.some(c=>c.field==='funding_round'&&c.value.announced_on===day
          &&(!c.value.announced_on_precision||c.value.announced_on_precision==='day')
        ||c.field==='funding_round.announced_on'&&c.value.date===day&&c.value.precision==='day'),
        'projected announcement day must equal sourced announcement, not publication or a partial date');
    }
  }
  for(const [eid,r] of recordById){
    for(const key of Object.keys(r).filter(x=>!['reviewed_at','source'].includes(x))){
      assert.ok(projection.fields.some(m=>m.entity_id===eid&&(m.path==='/'+key||m.path.startsWith('/'+key+'/'))),'unmapped record field '+key);
    }
    for(const [index,e] of (r.funding_rounds||[]).entries()){
      const prefix='/funding_rounds/'+index;
      for(const key of ['amount','announced_on'])if(Object.hasOwn(e,key)){
        assert.ok(projection.fields.some(m=>m.entity_id===eid&&m.path===prefix+'/'+key),'sensitive funding field needs direct provenance');
      }
      assert.ok(projection.fields.some(m=>m.entity_id===eid&&(m.path===prefix||m.path.startsWith(prefix+'/'))),'unmapped funding event');
    }
  }
  assert.equal(coverage.eligible_population.denominator,null,'no national denominator');
  assert.equal(coverage.eligible_population.complete,false,'no completeness claim');
  assert.equal(coverage.crawler_runs,0,'no live crawl');
  assert.equal(coverage.production_writes,0,'no production record write');
  assert.equal(coverage.counts.accepted_staged,accepted.length);
  assert.equal(coverage.counts.reviewed,members.filter(x=>x.status!=='queued').length);
  assert.equal(coverage.counts.worklist_discovered,members.length);
  assert.deepEqual(resumeIds(coverage,members),coverage.checkpoint.pending_ids,'resumable worklist');
  for(const c of facts){
    const participants=c.field==='round_participant'?[c.value]:c.field==='funding_round'?c.value.participants:[];
    for(const p of participants){
      assert.ok(p?.event_id&&p?.name,'participant identity');
      assert.ok(eventById.has(p.event_id),'orphan round participation');
      assert.equal(eventById.get(p.event_id).company_id,c.entity_id,'participant company mismatch');
      assert.ok(['lead','participant','unspecified'].includes(p.role),'explicit participant role');
      assert.equal(p.resolved_entity_id,null,'investor graph identity not resolved in this packet');
      assert.equal(p.evidence_scope,'event_specific','portfolio membership is not a round');
      assert.equal(p.supporting_claim_id,c.claim_id,'participant evidence subject');
      assert.ok(bySource.has(p.source_url),'participant source missing registry');
      assert.equal(p.source_url,c.source_url,'participant source must match its supporting claim');
    }
    if(c.field==='funding_aggregate')assert.equal(c.value.additive,false,'funding aggregates are non-additive');
  }
  for(const e of funding.events){
    const eventClaims=e.claim_ids.map(id=>byClaim.get(id));
    const participants=eventClaims.flatMap(c=>c.field==='round_participant'?[c.value]:c.field==='funding_round'?c.value.participants:[]);
    assert.deepEqual(e.participants,participants,'derived funding ledger participants differ from claims');
    const amounts=eventClaims.filter(c=>['funding_round','funding_round.amount'].includes(c.field)).map(c=>({
      claim_id:c.claim_id,amount:c.value.amount??null,currency:c.value.currency??null,
      qualifier:c.value.amount_qualifier||c.value.qualifier||'unknown',amount_scope:c.value.amount_scope||'round_total',
      amount_text:c.value.amount_text??null,source_url:c.source_url}));
    assert.deepEqual(e.amount_observations,amounts,'derived funding ledger amounts differ from claims');
  }
  return {valid:true,companies_reviewed:coverage.counts.reviewed,accepted_startups:accepted.length,
    reviewed_claims:facts.length,sources:sources.sources.length,legacy_funding_events:rounds.size,
    production_writes:0,crawler_runs:0,scope:'offline staging validation; no source-truth or publication assertion'};
}

export function loadPacket(){return {claims:read('claims.json'),records:read('startup-records.json'),companies:read('companies.json'),sources:read('source-registry.json'),coverage:read('coverage.json'),projection:read('projection-map.json'),baseline:read('baseline.json'),funding:read('funding-ledger.json')};}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const result=validatePacket(loadPacket());
  for(const f of read('baseline.json').files){
    assert.equal(sha256(readFileSync(resolve(REPO,f.path),'utf8')),f.sha256,'pinned baseline changed: '+f.path);
  }
  console.log(JSON.stringify(result,null,2));
}
