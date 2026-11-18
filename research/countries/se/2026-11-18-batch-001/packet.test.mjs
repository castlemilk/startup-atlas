import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';
import { validateStartupRecord } from '../../../../backend/hosted/src/startup-record.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'../../../..');
const read=name=>JSON.parse(readFileSync(path.join(here,name),'utf8'));
const {claims}=read('claims.json');
const {companies}=read('companies.json');
const {sources}=read('source-registry.json');
const {startups}=read('staged-startups.json');
const manifest=read('manifest.json');
const claimMap=new Map(claims.map(c=>[c.claim_id,c]));
const sourceMap=new Map(sources.map(s=>[s.url,s]));
const companyMap=new Map(companies.map(c=>[c.id,c]));
const events=new Map(claims.filter(c=>c.field==='funding_round').map(c=>[c.value.event_id,c]));
const one=name=>startups.find(s=>s.name===name);
const norm=x=>x.normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim();
const date=/^\d{4}-\d{2}-\d{2}$/;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const hasNull=x=>x===null||Array.isArray(x)&&x.some(hasNull)||x&&typeof x==='object'&&Object.values(x).some(hasNull);

test('every accepted projection passes the repository startup-record validator',()=>{
  assert.equal(startups.length,19);
  startups.forEach(validateStartupRecord);
  assert.equal(new Set(startups.map(s=>norm(s.name))).size,startups.length);
  assert(!startups.some(hasNull),'Legacy schema omits unknown fields; rich ledger retains nulls');
});

test('all facts retain accessed registered sources and dated review provenance',()=>{
  assert.equal(claimMap.size,claims.length);
  assert.equal(sourceMap.size,sources.length);
  for(const c of claims){
    assert(c.value!==null,c.claim_id);
    assert(['reviewed_staged','conflict'].includes(c.status),c.claim_id);
    assert.equal(c.accessed,true,c.claim_id);
    assert(sourceMap.get(c.source_url)?.accessed,c.claim_id);
    assert.match(c.source_url,/^https:\/\//);
    assert(!new URL(c.source_url).username);
    assert(Number.isFinite(Date.parse(c.retrieved_at)),c.claim_id);
    assert(Number.isFinite(Date.parse(c.reviewed_at)),c.claim_id);
    assert(Date.parse(c.reviewed_at)>=Date.parse(c.retrieved_at),c.claim_id);
    for(const k of ['published_on','effective_on']) assert(c[k]===null||date.test(c[k]),c.claim_id+':'+k);
    assert(c.evidence.trim()&&c.rationale.trim(),c.claim_id);
    assert.equal(c.publication_state,'unsubmitted');
  }
});

test('funding references point to one event and the same company without guessed investors',()=>{
  assert.equal(events.size,35);
  for(const c of claims.filter(c=>c.field==='round_participant')){
    const e=events.get(c.value.event_id);
    assert(e,c.claim_id);
    assert.equal(e.entity_id,c.entity_id);
    assert.equal(c.value.company_id,c.entity_id);
    assert(['lead','participant','unspecified'].includes(c.value.role));
    assert.equal(c.value.resolved_entity_id,null,'No fund/manager identity is silently invented');
  }
  for(const e of events.values()){
    assert(companyMap.has(e.entity_id));
    assert.equal(e.value.company_id,e.entity_id);
    assert.equal(e.value.amount===null,e.value.currency===null,e.claim_id);
    if(e.value.amount!==null){assert(Number.isSafeInteger(e.value.amount)&&e.value.amount>0);assert.match(e.value.currency,/^[A-Z]{3}$/);}
    assert.equal(e.value.valuation===null,e.value.valuation_currency===null,e.claim_id);
    if(e.value.announced_on!==null) assert.equal(e.value.announced_on.length,{day:10,month:7,year:4}[e.value.date_precision],e.claim_id);
  }
});

test('advisers and generic portfolio backers are not promoted to round investors',()=>{
  const participants=claims.filter(c=>c.field==='round_participant');
  for(const adviser of claims.filter(c=>c.field==='funding_advisor')){
    assert(!participants.some(p=>p.value.event_id===adviser.value.event_id&&norm(p.value.name)===norm(adviser.value.name)));
  }
  assert(!participants.some(p=>p.entity_id==='startup:epishine'&&/pareto/i.test(p.value.name)));
  assert(!participants.some(p=>p.value.event_id==='funding:neko-health:2023-series-a'&&/prima materia/i.test(p.value.name)));
  assert(!participants.some(p=>p.value.event_id==='funding:altris:2025-additional-funding'));
});

test('conditional commitments, mixed consideration and debt are outside simple legacy rounds',()=>{
  const rounds=startups.flatMap(s=>s.funding_rounds||[]);
  assert(!rounds.some(r=>/capitainer.*2024|alight.*2022|voi.*bonds/.test(r.id)));
  const conditional=events.get('funding:capitainer:2024-we-investment').value;
  assert.equal(conditional.amount,null);
  assert.match(one('Capitainer').profile_facts.find(f=>f.label.includes('conditional')).value,/contingent/);
  assert(one('Alight').profile_facts.some(f=>/secondary/.test(f.value)));
  assert(one('Voi Technology').profile_facts.some(f=>/framework capacity/.test(f.value)));
});

test('currency corroboration and alternative amounts preserve their own sources',()=>{
  const syre=one('Syre');
  assert.equal(syre.funding_rounds[0].currency,undefined);
  assert(syre.profile_facts.some(f=>f.label==='Financing currency corroboration'&&/USD 100,000,000/.test(f.value)&&/syre-signs-mou/.test(f.source)));
  assert(!syre.profile_facts.find(f=>f.label==='Financing currency corroboration').value.includes('2024-05-23'));
  const tandem=one('Tandem Health');
  assert(!tandem.funding_rounds[0].note.includes('EUR 40'));
  assert(tandem.profile_facts.some(f=>f.label==='Alternative financing amount observation'&&/kinnevik.com/.test(f.source)));
  const mentimeter=one('Mentimeter');
  assert(!mentimeter.funding_rounds[0].note.includes('SEK432'));
  assert(mentimeter.profile_facts.some(f=>/432,000,000/.test(f.value)&&f.source==='https://www.mentimeter.com/investors'));
});

test('Visa joins the existing Mynt event with its actual later disclosure date',()=>{
  const mynt=one('Mynt'); assert.equal(mynt.funding_rounds.length,1);
  assert(!mynt.funding_rounds[0].note.includes('Visa'));
  const visa=mynt.profile_facts.find(f=>f.label==='Additional sourced round participant'&&f.value.startsWith('Visa;'));
  assert(visa); assert.match(visa.value,/participation disclosed 2025-04-10/);
  assert.match(visa.value,/linked to the previously announced Series B/);
  assert(!visa.value.includes('2024-12-11'),'Disclosure source does not establish the original exact round day');
});

test('founding conflicts and month precision are retained without invented exact dates',()=>{
  assert.equal(one('Capitainer').founded_year,undefined);
  assert.equal(one('Mentimeter').founded_year,undefined);
  for(const name of ['Capitainer','Mentimeter']) assert.equal(one(name).profile_facts.filter(f=>/Founding observation \(conflicting sources\)/.test(f.label)).length,2);
  const e=events.get('funding:elypta:2019-late-seed').value;
  assert.equal(e.closed_on,'2019-12'); assert.equal(e.closed_date_precision,'month');
  assert.equal(e.announced_on,'2020-01-23');
  assert(one('Elypta').profile_facts.some(f=>f.value.startsWith('2019-12 (month precision)')));
});

test('lifecycle and current HQ holds remain outside the 19 proposed profiles',()=>{
  assert.deepEqual(companies.filter(c=>c.disposition==='held').map(c=>c.name).sort(),['Einride','Heart Aerospace','Normative','Planhat','Sana','Stegra','X Shore'].sort());
  assert.deepEqual(companies.filter(c=>c.disposition==='rejected').map(c=>c.name),['Northvolt']);
  for(const c of companies.filter(c=>c.disposition!=='accepted')) assert(!startups.some(s=>s.name===c.name));
  assert(one('Alight').profile_facts.some(f=>/majority/.test(f.value)));
});

test('all claims are accounted for in a projection map or explicit research-only rationale',()=>{
  const map=read('projection-map.json');
  const accounted=new Set([...map.mapped,...map.research_only].map(x=>x.claim_id));
  assert.deepEqual([...accounted].sort(),[...claimMap.keys()].sort());
  assert(map.research_only.every(x=>!map.mapped.some(y=>y.claim_id===x.claim_id)),'Distinct claim categories do not overlap');
  for(const item of map.mapped) assert(companyMap.get(item.company_id)?.disposition==='accepted');
  const c=read('coverage.json').counts;
  assert.equal(c.reviewed_companies,c.accepted_company_profiles+c.held_companies+c.rejected_from_active_scope);
  assert.equal(c.registered_discovered_companies,c.reviewed_companies+c.unreviewed_named_discoveries);
  assert.equal(c.claim_observations,claims.length);
});

test('normalized names, aliases and domains have no matches in the pinned rebuilt graph',()=>{
  const d=read('deduplication.json');
  assert.equal(d.compared_built_entities,555); assert.equal(d.compared_source_startups,45);
  assert(d.company_checks.every(c=>c.matches.length===0));
  assert.equal(d.existing_founder_identity_matches.length,0);
  assert.equal(norm('  MENTIMETER  '),norm('Mentimeter'));
  assert.equal(norm('Ｎｅｋｏ Health'),norm('Neko Health'));
});

test('unknown values cannot become null or fabricated zero in a production record',()=>{
  const base=structuredClone(one('Mynt'));
  assert.throws(()=>validateStartupRecord({...base,founded_year:null}));
  assert.throws(()=>validateStartupRecord({...base,founded_year:0}));
  const bad=structuredClone(base); bad.funding_rounds[0].currency=undefined;
  assert.throws(()=>validateStartupRecord(bad));
  for(const company of companies) for(const f of Object.values(company.field_status)){
    if(['searched_unknown','unsearched','blocked'].includes(f.status)) assert.equal(f.value,null);
    if(f.status==='searched_unknown') assert(f.search_log?.length);
  }
});

test('manifest binds original inputs and research does not grant seed approval',()=>{
  for(const [p,expected] of Object.entries(manifest.baseline_files_sha256)) assert.equal(sha(readFileSync(path.join(root,p))),expected,p);
  for(const [p,expected] of Object.entries(manifest.observation_files_sha256)) assert.equal(sha(readFileSync(path.join(here,'observations',p))),expected,p);
  assert(read('source-queue.json').items.every(q=>q.crawler_seed_approved===false));
  assert.equal(read('coverage.json').country_denominator,null);
  assert.equal(read('coverage.json').country_completeness,false);
  assert.equal(manifest.run.production_modified,false);
});
