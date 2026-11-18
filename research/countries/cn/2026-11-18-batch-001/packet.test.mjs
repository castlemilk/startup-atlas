import test from 'node:test';
import assert from 'node:assert/strict';
import {validateStartupRecord} from '../../../../backend/hosted/src/startup-record.mjs';
import {loadPacket,validatePacket,normalizedName,domainKey,resumeIds,sha256} from './validate.mjs';

const packet=()=>structuredClone(loadPacket());
test('complete packet validates with the actual current startup schema',()=>assert.equal(validatePacket(packet()).valid,true));
test('normalization handles fullwidth Latin and Chinese without discarding Chinese identity',()=>{
  assert.equal(normalizedName('  ＡＧＩＢＯＴ  '),'agibot');
  assert.equal(normalizedName('智元机器人'),'智元机器人');
  assert.notEqual(normalizedName('智元机器人'),normalizedName('银河通用'));
});
test('canonical domain comparison ignores www, case, paths and trailing slash',()=>{
  assert.equal(domainKey('https://WWW.EXAMPLE.COM/about/'),domainKey('https://example.com/'));
  assert.notEqual(domainKey('https://a.example.com/'),domainKey('https://b.example.com/'));
  assert.throws(()=>domainKey('https://someone:secret@example.com/'));
});
test('duplicate canonical domain requires review',()=>{
  const p=packet(), accepted=p.companies.companies.filter(x=>x.status==='accepted_staged');
  accepted[1].website=accepted[0].website;
  assert.throws(()=>validatePacket(p),/domain collision/);
});
test('existing Atlas identity is not treated as a new company',()=>{
  const p=packet(),first=p.companies.companies.find(x=>x.status==='accepted_staged');
  p.baseline.existing_startups.push({id:first.id,name:first.name,website:first.website});
  assert.throws(()=>validatePacket(p),/existing name/);
});
test('unknown numeric value stays omitted; zero and null are different',()=>{
  const r={name:'Boundary Fixture',source:'https://example.com/about',reviewed_at:'2026-11-18',funding_rounds:[{id:'boundary-fixture-a',stage:'A',source:'https://example.com/round'}]};
  validateStartupRecord(r);assert.equal(Object.hasOwn(r.funding_rounds[0],'amount'),false);
  const zero=structuredClone(r);zero.funding_rounds[0].amount=0;zero.funding_rounds[0].currency='CNY';validateStartupRecord(zero);
  const nil=structuredClone(r);nil.funding_rounds[0].amount=null;nil.funding_rounds[0].currency='CNY';assert.throws(()=>validateStartupRecord(nil));
});
test('an empty string is not a missing identity field',()=>{
  const r=packet().records.startups[0];r.website='';assert.throws(()=>validateStartupRecord(r));
});
test('a source snippet cannot be promoted by flipping its review label',()=>{
  const p=packet();p.claims.claims[0].accessed=false;assert.throws(()=>validatePacket(p),/source must be read/);
});
test('discovery-only source cannot support reviewed claims',()=>{
  const p=packet();p.claims.claims[0].source_kind='discovery';assert.throws(()=>validatePacket(p),/discovery is not review/);
});
test('a missing source registry entry is rejected',()=>{
  const p=packet(),url=p.claims.claims[0].source_url;p.sources.sources=p.sources.sources.filter(s=>s.url!==url);
  assert.throws(()=>validatePacket(p),/missing registry source/);
});
test('claim provenance cannot silently change subjects',()=>{
  const p=packet(),m=p.projection.fields[0];m.claim_ids=[p.claims.claims.find(c=>c.entity_id!==m.entity_id).claim_id];
  assert.throws(()=>validatePacket(p),/projection source subject/);
});
test('qualified funding cannot acquire exact numeric precision',()=>{
  const p=packet();const m=p.projection.fields.find(x=>/\/funding_rounds\/\d+\/amount$/.test(x.path));assert.ok(m,'packet contains an exact money case');
  m.precision='approximate';assert.throws(()=>validatePacket(p),/qualified amount/);
});
test('partial event dates cannot be padded to an artificial day',()=>{
  const p=packet();const m=p.projection.fields.find(x=>/\/funding_rounds\/\d+\/announced_on$/.test(x.path));assert.ok(m);
  m.precision='month';assert.throws(()=>validatePacket(p),/partial date/);
});
test('an altered numeric total is rejected even when metadata still says exact',()=>{
  const p=packet(),r=p.records.startups.find(x=>x.funding_rounds?.some(e=>e.amount));
  r.funding_rounds.find(e=>e.amount).amount+=1;
  assert.throws(()=>validatePacket(p),/equal exact sourced round total/);
});
test('an altered currency is rejected without performing currency conversion',()=>{
  const p=packet(),r=p.records.startups.find(x=>x.funding_rounds?.some(e=>e.amount));
  const e=r.funding_rounds.find(e=>e.amount);e.currency=e.currency==='USD'?'CNY':'USD';
  assert.throws(()=>validatePacket(p),/equal exact sourced round total/);
});
test('an altered announcement day is rejected even when metadata still says day',()=>{
  const p=packet(),r=p.records.startups.find(x=>x.funding_rounds?.some(e=>e.announced_on));
  r.funding_rounds.find(e=>e.announced_on).announced_on='2026-11-17';
  assert.throws(()=>validatePacket(p),/equal sourced announcement/);
});
test('an investor cheque cannot be promoted into the round total',()=>{
  const p=packet(),r=p.records.startups.find(x=>x.name==='Moonshot AI');
  const c=p.claims.claims.find(x=>x.entity_id==='startup:moonshot-ai'&&x.field==='round_participant');
  r.funding_rounds[0].amount=c.value.contribution_amount;r.funding_rounds[0].currency=c.value.contribution_currency;
  p.projection.fields.push({entity_id:c.entity_id,path:'/funding_rounds/0/amount',claim_ids:[c.claim_id],event_id:c.value.event_id,precision:'exact'});
  assert.throws(()=>validatePacket(p),/equal exact sourced round total/);
});
test('a publication bound cannot be assigned as the announcement day',()=>{
  const p=packet(),r=p.records.startups.find(x=>x.name==='StepFun');
  const c=p.claims.claims.find(x=>x.entity_id==='startup:stepfun'&&x.field==='funding_round.reported_on');
  r.funding_rounds[0].announced_on=c.value.date;
  p.projection.fields.push({entity_id:c.entity_id,path:'/funding_rounds/0/announced_on',claim_ids:[c.claim_id],event_id:c.value.event_id,precision:'day'});
  assert.throws(()=>validatePacket(p),/equal sourced announcement/);
});
test('nested participants also reject portfolio-only evidence',()=>{
  const p=packet(),c=p.claims.claims.find(x=>x.field==='funding_round'&&x.value.participants?.length);
  c.value.participants[0].evidence_scope='portfolio';
  assert.throws(()=>validatePacket(p),/portfolio membership/);
});
test('combined financing aggregates cannot become additive totals',()=>{
  const p=packet(),c=p.claims.claims.find(x=>x.field==='funding_aggregate');c.value.additive=true;
  assert.throws(()=>validatePacket(p),/non-additive/);
});
test('a registered but unrelated participant URL does not supply provenance',()=>{
  const p=packet(),c=p.claims.claims.find(x=>x.field==='funding_round'&&x.value.participants?.length);
  c.value.participants[0].source_url=p.claims.claims[0].source_url;
  assert.throws(()=>validatePacket(p),/participant source must match/);
});
test('derived participant names cannot drift from their backing claims',()=>{
  const p=packet(),e=p.funding.events.find(x=>x.participants.length);e.participants[0].name='Unsupported Investor';
  assert.throws(()=>validatePacket(p),/ledger participants differ/);
});
test('derived money observations cannot drift from their backing claims',()=>{
  const p=packet(),e=p.funding.events.find(x=>x.amount_observations.some(a=>a.amount));
  e.amount_observations.find(a=>a.amount).amount+=1;
  assert.throws(()=>validatePacket(p),/ledger amounts differ/);
});
test('projected round citations must support the particular event',()=>{
  const p=packet(),r=p.records.startups.find(x=>x.funding_rounds?.length);
  r.funding_rounds[0].source='https://www.deepseek.com/';
  assert.throws(()=>validatePacket(p),/source must match event evidence/);
});
test('an unsupported founder substitution is rejected',()=>{
  const p=packet(),r=p.records.startups.find(x=>x.founders?.length);r.founders[0].name='Unverified Person';
  assert.throws(()=>validatePacket(p),/founder name requires explicit/);
});
test('a company contact office cannot be relabelled as headquarters',()=>{
  const p=packet(),r=p.records.startups.find(x=>x.name==='Moonshot AI');
  r.profile_facts.find(x=>x.key==='contact-office').label='Headquarters';
  assert.throws(()=>validatePacket(p),/office cannot become headquarters/);
});
test('unknown schema/API fields remain rejected',()=>{
  const r=packet().records.startups[0];r.investors=[];assert.throws(()=>validateStartupRecord(r),/not supported/);
});
test('funding participation requires a known event, exact subject and event evidence',()=>{
  const p=packet(),c=p.claims.claims.find(x=>x.field==='round_participant');assert.ok(c);
  c.value.event_id='missing-event';assert.throws(()=>validatePacket(p),/orphan round/);
});
test('portfolio membership is not round participation',()=>{
  const p=packet(),c=p.claims.claims.find(x=>x.field==='round_participant');c.value.evidence_scope='portfolio';
  assert.throws(()=>validatePacket(p),/portfolio membership/);
});
test('unresolved investors cannot silently become canonical graph edges',()=>{
  const p=packet(),c=p.claims.claims.find(x=>x.field==='round_participant');c.value.resolved_entity_id='partner:sequoia-capital';
  assert.throws(()=>validatePacket(p),/not resolved/);
});
test('country denominator remains unknown and completeness remains false',()=>{
  const p=packet();p.coverage.eligible_population.denominator=0;assert.throws(()=>validatePacket(p),/national denominator/);
});
test('interrupted review checkpoint resumes only unfinished identity items',()=>{
  const p=packet(),all=p.companies.companies,reviewed=all.slice(0,3).map(x=>x.id);
  p.coverage.checkpoint.reviewed_ids=reviewed;
  assert.deepEqual(resumeIds(p.coverage,all),all.slice(3).map(x=>x.id));
  const reopened=JSON.parse(JSON.stringify(p.coverage));assert.deepEqual(resumeIds(reopened,all),resumeIds(p.coverage,all));
});
test('changed worklist invalidates a saved checkpoint; no implicit denominator expansion',()=>{
  const p=packet();p.companies.companies.push({id:'startup:new-unreviewed-company'});
  assert.throws(()=>resumeIds(p.coverage,p.companies.companies),/digest/);
});
test('repeated checkpoints do not change factual retrieval dates',()=>{
  const p=packet(),before=sha256(p.claims);resumeIds(p.coverage,p.companies.companies);resumeIds(p.coverage,p.companies.companies);
  assert.equal(sha256(p.claims),before);
});
test('research discovery cannot approve a crawler seed',()=>{
  const p=packet();p.sources.sources[0].crawler_seed_approved=true;assert.throws(()=>validatePacket(p),/seed approval/);
});
