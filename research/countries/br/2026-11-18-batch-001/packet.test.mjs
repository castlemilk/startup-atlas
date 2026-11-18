import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPacket, validatePacket, normalizeName, normalizeDomain } from './validate.mjs';

const original=loadPacket();
const copied=()=>structuredClone(original);
const invalid=(packet,pattern)=>{const result=validatePacket(packet,{verifyBaselines:false});assert.equal(result.valid,false);assert.match(result.errors.join('\n'),pattern);};
const company=(packet,name)=>packet.dossiers.companies.find(c=>c.name===name);
const record=(packet,name)=>packet.records.startups.find(c=>c.name===name);

test('22 records and all claim/event relationships validate against pinned production schema',()=>{
  const result=validatePacket(original);assert.deepEqual(result.errors,[]);assert.equal(result.counts.accepted_staged_companies,22);
  assert.equal(result.counts.funding_events,25);assert.equal(result.counts.event_participant_assertions,98);
});
test('normalization preserves meaningful spelling while matching Unicode/case/host variants',()=>{
  assert.equal(normalizeName('  Ｎｏｍａｄ   '),'nomad');assert.equal(normalizeName('BEEP   SAÚDE'),'beep saúde');
  assert.equal(normalizeDomain('https://WWW.CREDITAS.COM./ir/'),'creditas.com');
  assert.throws(()=>normalizeDomain('https://user:password@example.com'));
});
test('existing canonical-domain or alias collision is held for review',()=>{
  const p=copied();p.baseline.identities.push({id:'startup:other',normal_name:'another name',normal_host:'creditas.com'});
  invalid(p,/existing Atlas identity collision/);
  const q=copied();company(q,'Nomad').aliases.push('Cora');invalid(q,/cross-company name or alias collision/);
});
test('unresolved amounts cannot become zero or null production scalars',()=>{
  const p=copied();record(p,'Beep Saúde').funding_rounds[0].amount=0;record(p,'Beep Saúde').funding_rounds[0].currency='USD';
  invalid(p,/unknown amount\/currency leaked/);
  const q=copied();record(q,'Cromai').funding_rounds[0].amount=null;invalid(q,/production schema|unknown amount/);
});
test('year and month funding dates are not padded into artificial days',()=>{
  const p=copied();record(p,'QI Tech').funding_rounds.find(e=>e.id.includes('extension')).announced_on='2025-07-01';
  invalid(p,/invented date precision/);
  const q=copied();record(q,'Alice').funding_rounds[0].announced_on='2021-01-01';invalid(q,/invented date precision/);
});
test('inaccessible and discovery-only sources cannot support accepted claims',()=>{
  const p=copied();p.registry.sources.find(s=>s.id==='h-alice-manifesto').accessed=false;invalid(p,/inaccessible source/);
  const q=copied();q.registry.sources.find(s=>s.id==='h-alice-manifesto').source_kind='discovery';invalid(q,/discovery or unsupported source/);
});
test('invented retrieval times and orphaned field provenance are rejected',()=>{
  const p=copied();p.ledger.claims.find(c=>c.status==='reviewed_staged').retrieved_at='2026-11-18T00:00:00Z';invalid(p,/invented retrieval time/);
  const q=copied();q.projection.mappings[0].claim_ids=['absent'];invalid(q,/Unproven projection/);
});
test('participant links require the exact event and may not substitute portfolio membership',()=>{
  const p=copied();p.participants.participants[0].event_id='unrelated-round';invalid(p,/dangling event|participant claim mismatch/);
  const q=copied();q.participants.participants[0].relationship_basis='portfolio_membership';invalid(q,/portfolio membership cannot prove/);
  const r=copied();r.participants.participants[0].resolved_entity_id='partner:softbank';invalid(r,/investor identity silently resolved/);
});
test('transaction scopes retain extensions, commitments, mixed proceeds and debt',()=>{
  assert.equal(record(original,'Loft').funding_rounds[0].amount,100000000);
  assert.equal(record(original,'EBANX').funding_rounds[0].amount,400000000);
  const omie=company(original,'Omie').funding_events.find(e=>e.id==='omie-series-d-2025');
  assert.equal(omie.amount,150000000);assert.match(omie.transaction_kind,/secondary_unsplit/);
  assert.equal(company(original,'Solinftec').funding_events[0].transaction_kind,'convertible_debt');
  assert(!company(original,'Solinftec').funding_events[0].participants.some(p=>/Circularis/.test(p.name)));
  assert.equal(company(original,'Mombak').funding_events.length,1);assert.equal(company(original,'Mombak').funding_events[0].amount,30000000);
});
test('history and legal geography remain scoped instead of flattened',()=>{
  for(const name of ['QuintoAndar','Conta Azul','Dock','Asaas'])assert(!Object.hasOwn(record(original,name),'founded_year'));
  const creditas=company(original,'Creditas');assert.equal(creditas.facts.find(f=>f.field==='headquarters').value.country_code,'BR');
  assert.equal(creditas.facts.find(f=>f.field==='incorporation').value.country_code,'KY');
  assert.equal(company(original,'Solinftec').facts.find(f=>f.field==='headquarters').value.locations.length,2);
  assert.equal(company(original,'Conta Azul').facts.find(f=>f.field==='ownership_status').value.independent_startup,false);
  assert.equal(record(original,'Nilo Saúde').founders.length,3);assert.equal(record(original,'Cora').founders.length,3);
  assert.match(record(original,'Dock').profile_facts.find(f=>f.key.startsWith('founder-')).value,/modern Dock business/);
});
test('queue discovery cannot become seed approval or a national denominator',()=>{
  const p=copied();p.queue.source_queue[0].crawler_seed_approved=true;invalid(p,/queue falsely approved/);
  const q=copied();q.manifest.national_eligible_startup_denominator=398;invalid(q,/National denominator must remain unknown/);
});
test('source publication dates stay distinct from funding announcement dates',()=>{
  const r=record(original,'RecargaPay');
  assert.equal(r.funding_rounds[0].announced_on,'2021-02-24');
  assert.equal(r.articles.find(a=>a.url===r.funding_rounds[0].source).published_on,'2021-03-26');
  const p=copied();record(p,'RecargaPay').articles[0].published_on='2021-02-24';
  invalid(p,/article publication date must not inherit/);
});
