import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { validateStartupRecord } from '../../backend/hosted/src/startup-record.mjs';
import { recordRevision } from '../../backend/hosted/src/startup-edit.mjs';
import { fixture, money, addClaim, SOURCE_REVISION } from './synthetic-fixtures.mjs';
import { validateContract, validateDate, validateMoney, resolveFact, projectParticipations, appendClaim, canonicalIdentity, contractDigest, migrateLegacyRecord, restoreLegacyRecord } from './reference-model.mjs';

const ROUND = 'round:fixture-seed';
const PARTICIPATION = 'participation:fixture-manager-seed';
const AMOUNT_IDS = ['claim:seed-amount', 'claim:seed-amount-syndicated'];
const clone = value => structuredClone(value);
const rawLegacy = fs.readFileSync(new URL('./fixtures/legacy-record.json', import.meta.url), 'utf8');
const getClaim = (p, id) => p.claims.find(c => c.id === id);
const relation = p => projectParticipations(p).relations.find(r => r.participation_id === PARTICIPATION);

function correction(packet, {review_status = 'reviewed', value = money({amount:'2600000.50',raw:'AUD 2,600,000.50'}), supersedes = AMOUNT_IDS, predicate = 'round_amount', subject_id = ROUND} = {}) {
  return addClaim(packet, {id:'claim:correction',subject_id,predicate,value,review_status,supersedes,correction_reason:'Synthetic source correction, with earlier evidence retained.'});
}
function decide(packet, {from_id = 'round:fixture-extension', to_id = ROUND, verdict = 'same', review_status = 'candidate', suffix = 'one'} = {}) {
  const id = `decision:${suffix}`, evidence = `evidence:decision-${suffix}`;
  packet.evidence.push({id:evidence,source_id:'source:announcement',subject_id:id,predicate:verdict === 'same' ? 'same_identity' : 'distinct_identity',basis:'explicit',statement:'Synthetic reviewed identity comparison, not a name-match inference.'});
  packet.identity_decisions.push({id,from_id,to_id,verdict,review_status,evidence_ids:[evidence],reason:'Synthetic explicit identity decision.'});
}

test('complete persisted synthetic fixture matches its factory and passes validation', () => {
  const saved = JSON.parse(fs.readFileSync(new URL('./fixtures/structured.json', import.meta.url)));
  assert.deepEqual(saved,fixture()); assert.equal(validateContract(saved),true);
  assert.equal(saved.rounds.length,2); assert.equal(saved.investors.length,3);
});
test('projection preserves separate membership and role evidence and its offline boundary', () => {
  const p = fixture(), before = clone(p), output = projectParticipations(p);
  assert.equal(output.authorization,'none'); assert.equal(output.runtime_supported,false); assert.equal(output.published,false);
  assert.equal(output.relations.length,2); assert.equal(relation(p).role,'lead');
  assert.deepEqual(relation(p).membership_claim_ids,['claim:fixture-manager-seed-membership']);
  assert.deepEqual(relation(p).role_claim_ids,['claim:fixture-manager-seed-role']);
  assert.equal(relation(p).predicate,'participated_in_funding_event');
  assert.deepEqual(output.held,[{participation_id:'participation:fixture-fund-seed',reason:'identity_unresolved'}]);
  assert.deepEqual(p,before);
});
test('opaque IDs and independent same-name identities do not coalesce', () => {
  const p=fixture(); p.investors[1].display_name=p.investors[0].display_name;
  assert.equal(validateContract(p),true); assert.notEqual(p.investors[0].id,p.investors[1].id);
  assert.equal(projectParticipations(p).held[0].reason,'identity_unresolved');
});
test('no source-stated role remains unknown, never false or inferred non-lead', () => {
  const p=fixture(); p.claims=p.claims.filter(c=>c.id!=='claim:fixture-manager-seed-role');
  assert.equal(relation(p).role,'unknown'); assert.deepEqual(relation(p).role_claim_ids,[]);
});
test('co-lead is a distinct source-stated role', () => {
  const p=fixture(); getClaim(p,'claim:fixture-manager-seed-role').value='co_lead'; assert.equal(relation(p).role,'co_lead');
});
test('structural participation and a role claim alone cannot create membership', () => {
  const p=fixture(); p.claims=p.claims.filter(c=>c.id!=='claim:fixture-manager-seed-membership');
  assert.equal(relation(p),undefined); assert.equal(projectParticipations(p).held.find(h=>h.participation_id===PARTICIPATION).reason,'membership_unknown');
});
test('candidate membership cannot create a reviewed relation', () => {
  const p=fixture(); getClaim(p,'claim:fixture-manager-seed-membership').review_status='candidate'; assert.equal(relation(p),undefined);
});
test('candidate round identity prevents relation despite reviewed membership', () => {
  const p=fixture(); p.rounds[0].review_status='candidate'; assert.equal(relation(p),undefined);
  assert.equal(projectParticipations(p).held.find(h=>h.participation_id===PARTICIPATION).reason,'round_identity_unreviewed');
});
test('portfolio and source evidence for a different predicate cannot authorize participation', () => {
  const p=fixture(); getClaim(p,'claim:fixture-manager-seed-membership').evidence_ids=['evidence:seed-amount'];
  assert.throws(()=>validateContract(p),/scope/);
});
test('discovery basis cannot be promoted solely through a claim status', () => {
  const p=fixture(); p.evidence.find(e=>e.id==='evidence:fixture-manager-seed-membership').basis='discovery';
  assert.throws(()=>validateContract(p),/Discovery/);
});
test('membership endpoints cannot be retargeted without new scoped evidence', () => {
  const p=fixture(); getClaim(p,'claim:fixture-manager-seed-membership').value.round_id='round:fixture-extension';
  assert.throws(()=>validateContract(p),/endpoints/);
});
test('retraction keeps original evidence but removes the derived relation', () => {
  const p=fixture(), previous=getClaim(p,'claim:fixture-manager-seed-membership');
  addClaim(p,{id:'claim:retraction',subject_id:PARTICIPATION,predicate:'participation',value:{...previous.value,assertion:'retracted'},supersedes:[previous.id],correction_reason:'Synthetic retraction explicitly corrects the earlier membership.'});
  assert.equal(relation(p),undefined); assert.ok(p.claims.includes(previous));
  assert.equal(projectParticipations(p).held.find(h=>h.participation_id===PARTICIPATION).reason,'membership_retracted');
});
test('contradictory active role claims hold the relationship', () => {
  const p=fixture(); addClaim(p,{id:'claim:role-conflict',subject_id:PARTICIPATION,predicate:'role',value:'co_lead'});
  assert.equal(resolveFact(p,PARTICIPATION,'role').status,'conflict'); assert.equal(relation(p),undefined);
});
test('contradictory transaction kinds are not selected by source order', () => {
  const p=fixture(); addClaim(p,{id:'claim:kind-conflict',subject_id:ROUND,predicate:'transaction_kind',value:'grant'});
  assert.equal(relation(p),undefined); assert.equal(projectParticipations(p).held.find(h=>h.participation_id===PARTICIPATION).reason,'transaction_kind_conflict');
});

const validMoney = [
  ['exact zero',money({amount:'0',raw:'AUD 0'})],
  ['large exact decimal',money({amount:'90071992547409931234567890.123456789',raw:null})],
  ['approximate',money({precision:'approximate'})],
  ['range',money({precision:'range',amount:null,minimum:'2500000.01',maximum:'3000000.009',raw:'AUD 2.5–3 million'})],
  ['strict lower bound',money({precision:'lower_bound',amount:null,minimum:'1000000',bound_inclusive:false})],
  ['inclusive lower bound',money({precision:'lower_bound',amount:null,minimum:'1000000',bound_inclusive:true})],
  ['upper bound',money({precision:'upper_bound',amount:null,maximum:'3000000',bound_inclusive:true})],
  ['undisclosed',money({status:'undisclosed',precision:null,amount:null})],
  ['unknown',money({status:'unknown',precision:null,amount:null})],
  ['ambiguous currency',money({currency:{status:'ambiguous',code:null,raw:'$'}})],
];
for(const [label,value] of validMoney) test(`money preserves ${label}`,()=>{
  const before=clone(value); validateMoney(value,['round_total']); assert.deepEqual(value,before);
});
const invalidMoney = [
  ['numeric JSON money',money({amount:2.5})],
  ['exponent',money({amount:'1e6'})],
  ['negative',money({amount:'-1'})],
  ['nonfinite',money({amount:'Infinity'})],
  ['leading zero',money({amount:'01'})],
  ['reversed exact decimal range',money({precision:'range',amount:null,minimum:'1.00000000000000000001',maximum:'1'})],
  ['undisclosed zero',money({status:'undisclosed',precision:null,amount:'0'})],
  ['unknown point estimate',money({status:'unknown'})],
  ['guessed currency code',money({currency:{status:'ambiguous',code:'USD',raw:'$'}})],
  ['missing bound operator',money({precision:'lower_bound',amount:null,minimum:'1000'})],
  ['cumulative total relabelled round',money({measure:'cumulative_total'})],
];
for(const [label,value] of invalidMoney) test(`money rejects ${label}`,()=>assert.throws(()=>validateMoney(value,['round_total'])));
test('amount and valuation/contribution purposes cannot be interchanged',()=>{
  const p=fixture(); getClaim(p,'claim:manager-contribution').value=money(); assert.throws(()=>validateContract(p),/measure/);
});
test('cumulative totals and components remain independent observations without sums',()=>{
  const p=fixture();
  addClaim(p,{id:'claim:total',subject_id:ROUND,predicate:'cumulative_funding',value:money({measure:'cumulative_total',amount:'10000000'})});
  addClaim(p,{id:'claim:component',subject_id:ROUND,predicate:'component_amount',value:money({measure:'debt_component',amount:'500000'})});
  assert.equal(resolveFact(p,ROUND,'round_amount').value.amount,'2500000.25');
  assert.equal(resolveFact(p,ROUND,'cumulative_funding').value.amount,'10000000');
});
test('pre-money and post-money valuations require measure choice instead of a false conflict',()=>{
  const p=fixture();
  addClaim(p,{id:'claim:pre-money',subject_id:ROUND,predicate:'valuation',value:money({measure:'pre_money',amount:'10000000'})});
  addClaim(p,{id:'claim:post-money',subject_id:ROUND,predicate:'valuation',value:money({measure:'post_money',amount:'12500000.25'})});
  const result=resolveFact(p,ROUND,'valuation'); assert.equal(result.status,'selection_required'); assert.deepEqual(result.measures,['post_money','pre_money']);
  assert.equal(resolveFact(p,ROUND,'valuation','pre_money').value.amount,'10000000');
  assert.equal(resolveFact(p,ROUND,'valuation','post_money').value.amount,'12500000.25');
  assert.equal(resolveFact(p,ROUND,'round_amount').value.amount,'2500000.25');
});
test('separate debt and equity components are selectable, never summed or falsely conflicting',()=>{
  const p=fixture();
  addClaim(p,{id:'claim:debt',subject_id:ROUND,predicate:'component_amount',value:money({measure:'debt_component',amount:'500000'})});
  addClaim(p,{id:'claim:equity',subject_id:ROUND,predicate:'component_amount',value:money({measure:'equity_component',amount:'2000000.25'})});
  assert.equal(resolveFact(p,ROUND,'component_amount').status,'selection_required');
  assert.equal(resolveFact(p,ROUND,'component_amount','debt_component').value.amount,'500000');
  assert.equal(resolveFact(p,ROUND,'round_amount').value.amount,'2500000.25');
});
test('financial corrections cannot silently relabel one measure as another',()=>{
  const p=fixture();
  addClaim(p,{id:'claim:pre',subject_id:ROUND,predicate:'valuation',value:money({measure:'pre_money'})});
  addClaim(p,{id:'claim:post-correction',subject_id:ROUND,predicate:'valuation',value:money({measure:'post_money'}),supersedes:['claim:pre'],correction_reason:'Invalid synthetic relabelling.'});
  assert.throws(()=>validateContract(p),/financial measure/);
});
test('invalid financial measure selectors reject instead of masquerading as unknown data',()=>{
  const p=fixture();
  for(const [predicate,measure] of [['valuation','round_total'],['component_amount','typo'],['stage','pre_money']]) assert.throws(()=>resolveFact(p,ROUND,predicate,measure),/selector/);
  assert.equal(resolveFact(p,ROUND,'valuation','pre_money').status,'unknown');
});

for(const [precision,value] of [['year','2025'],['month','2025-03'],['day','2024-02-29']]) test(`dates retain ${precision} precision without padding`,()=>{
  const d={status:'known',precision,value}; validateDate(d); assert.equal(d.value,value);
});
for(const status of ['unknown','undisclosed']) test(`dates preserve ${status}`,()=>validateDate({status,precision:null,value:null}));
for(const [precision,value] of [['day','2025-02-29'],['month','2025-13'],['day','2025-00-01'],['year','0000'],['day','2025-03'],['month','2025-03-01']]) test(`invalid date rejected ${value} at ${precision}`,()=>assert.throws(()=>validateDate({status:'known',precision,value})));
test('source publication and retrieval do not replace announcement or close dates',()=>{
  const p=fixture(); assert.equal(p.sources[0].published_on.value,'2025-04-02');
  assert.equal(resolveFact(p,ROUND,'announced_on').value.value,'2025-02-18');
  assert.deepEqual(resolveFact(p,ROUND,'closed_on').value,{status:'known',precision:'month',value:'2025-02'});
});
test('retrieval timestamps reject rollover calendar days',()=>{
  const p=fixture(); p.sources[0].retrieved_at='2025-02-30T00:00:00Z'; assert.throws(()=>validateContract(p),/calendar/);
});

test('syndicated copies keep both claim IDs but one declared source group',()=>{
  const p=fixture(), result=resolveFact(p,ROUND,'round_amount');
  assert.equal(result.status,'known'); assert.deepEqual(result.claim_ids,AMOUNT_IDS.slice().sort()); assert.deepEqual(result.source_groups,['source:announcement']);
});
test('syndication cycles fail instead of amplifying corroboration',()=>{
  const p=fixture(); p.sources[0].duplicate_of='source:syndicated-copy'; assert.throws(()=>validateContract(p),/cycle/);
});
test('idempotent claim repeat returns equal content and leaves input unchanged',()=>{
  const p=fixture(), before=clone(p), result=appendClaim(p,p.claims[0]); assert.deepEqual(result,before); assert.notEqual(result,p); assert.deepEqual(p,before);
});
test('same claim ID with changed payload is rejected',()=>{
  const p=fixture(), claim=clone(p.claims[0]); claim.value.assertion='retracted'; assert.throws(()=>appendClaim(p,claim),/collision/);
});
test('reviewed correction supersedes old assertions and keeps their evidence',()=>{
  const p=fixture(), old=p.claims.filter(c=>AMOUNT_IDS.includes(c.id)).map(clone); correction(p);
  const result=resolveFact(p,ROUND,'round_amount'); assert.equal(result.value.amount,'2600000.50'); assert.deepEqual(result.claim_ids,['claim:correction']);
  assert.deepEqual(p.claims.filter(c=>AMOUNT_IDS.includes(c.id)),old);
});
for(const review_status of ['candidate','rejected']) test(`${review_status} correction cannot hide reviewed claims`,()=>{
  const p=fixture(); correction(p,{review_status}); assert.equal(resolveFact(p,ROUND,'round_amount').value.amount,'2500000.25');
});
test('unresolved contradictory amounts have no preferred scalar value',()=>{
  const p=fixture(); addClaim(p,{id:'claim:conflict',subject_id:ROUND,predicate:'round_amount',value:money({amount:'3000000'})});
  const r=resolveFact(p,ROUND,'round_amount'); assert.equal(r.status,'conflict'); assert.equal(r.value,null); assert.equal(r.claim_ids.length,3);
});
test('corrections cannot cross predicate, subject or missing reference boundaries',()=>{
  for(const supersedes of [['claim:seed-stage'],['claim:extension-amount'],['claim:missing']]){
    const p=fixture(); correction(p,{supersedes}); assert.throws(()=>validateContract(p),/scope/);
  }
});
test('correction cycles are rejected',()=>{
  const p=fixture(); correction(p); const old=getClaim(p,'claim:seed-amount'); old.supersedes=['claim:correction']; old.correction_reason='Synthetic cycle'; assert.throws(()=>validateContract(p),/cycle/);
});
test('candidate duplicate event matches do not redirect identity',()=>{
  const p=fixture(); decide(p); validateContract(p); assert.equal(canonicalIdentity(p,'round:fixture-extension'),'round:fixture-extension');
});
test('reviewed duplicate decisions preserve the original event identities',()=>{
  const p=fixture(); decide(p,{review_status:'reviewed'}); validateContract(p); assert.equal(canonicalIdentity(p,'round:fixture-extension'),ROUND); assert.equal(p.rounds.length,2);
});
test('identity cycles and conflicting distinct decisions fail',()=>{
  const p=fixture(); decide(p,{review_status:'reviewed'}); decide(p,{from_id:ROUND,to_id:'round:fixture-extension',review_status:'reviewed',suffix:'cycle'}); assert.throws(()=>validateContract(p),/cycle/);
  const q=fixture(); decide(q,{review_status:'reviewed'}); decide(q,{review_status:'reviewed',verdict:'distinct',suffix:'distinct'}); assert.throws(()=>validateContract(q),/Distinct/);
});
test('fund versus manager cannot be merged through shared names',()=>{
  const p=fixture(); decide(p,{from_id:'investor:fixture-fund-unresolved',to_id:'investor:fixture-manager',review_status:'reviewed'}); assert.throws(()=>validateContract(p),/Fund, manager/);
});
test('round identity cannot cross canonical startup boundaries',()=>{
  const p=fixture(); p.entity_refs.push({id:'startup:fixture-other',kind:'startup'}); p.rounds[1].startup_id='startup:fixture-other'; decide(p,{review_status:'reviewed'}); assert.throws(()=>validateContract(p),/across startups/);
});
test('duplicate participation pairs require an explicit reviewed identity decision',()=>{
  const p=fixture(); p.participations.push({...p.participations[0],id:'participation:duplicate'}); assert.throws(()=>validateContract(p),/Duplicate participation/);
});
test('person cannot resolve to an organisation entity',()=>{
  const p=fixture(); p.investors[2].canonical_entity_id='partner:fixture-manager'; assert.throws(()=>validateContract(p),/Person/);
});
test('unknown fields, versions and non-synthetic executable packets reject',()=>{
  for(const mutate of [p=>p.extra=true,p=>p.synthetic=false,p=>p.schema_version='atlas.investor-rounds/2',p=>p.rounds[0].amount=5]){
    const p=fixture(); mutate(p); assert.throws(()=>validateContract(p));
  }
});

test('legacy migration and restoration are byte-exact and revision-bound',async()=>{
  const p=await migrateLegacyRecord('startup:fixture-orbit',rawLegacy,SOURCE_REVISION), original=JSON.parse(rawLegacy);
  assert.equal(restoreLegacyRecord(p),rawLegacy); assert.deepEqual(JSON.parse(restoreLegacyRecord(p)),original);
  assert.equal(p.legacy.record_revision,await recordRevision('startup:fixture-orbit',original));
  assert.equal(p.legacy.record_sha256,createHash('sha256').update(rawLegacy).digest('hex'));
  assert.deepEqual(p.rounds.map(r=>r.legacy_id),original.funding_rounds.map(r=>r.id));
  assert.ok(p.claims.every(c=>c.review_status==='candidate')); assert.ok(p.rounds.every(r=>r.review_status==='candidate'));
  assert.equal(p.investors.length,0); assert.equal(p.participations.length,0); assert.deepEqual(projectParticipations(p).relations,[]);
  assert.ok(p.sources.every(s=>s.retrieved_at===null && s.kind==='legacy_unclassified'));
  validateStartupRecord(JSON.parse(restoreLegacyRecord(p)));
});
test('migration preserves missing numeric amount, explicit zero and unparsed source text',async()=>{
  const p=await migrateLegacyRecord('startup:fixture-orbit',rawLegacy,SOURCE_REVISION);
  const raw=JSON.parse(rawLegacy), ambiguous=raw.funding_rounds.find(r=>r.amount_text), zero=raw.funding_rounds.find(r=>r.amount===0);
  const subject=`round:legacy-${ambiguous.id}`;
  assert.equal(p.claims.find(c=>c.subject_id===subject&&c.predicate==='round_amount'),undefined);
  assert.equal(p.claims.find(c=>c.subject_id===subject&&c.predicate==='announced_on'),undefined);
  assert.equal(p.claims.find(c=>c.subject_id===subject&&c.predicate==='legacy_amount_text').value,ambiguous.amount_text);
  const amount=p.claims.find(c=>c.subject_id===`round:legacy-${zero.id}`&&c.predicate==='round_amount').value;
  assert.equal(amount.amount,'0'); assert.equal(amount.precision,'legacy_unspecified');
});
test('sidecar changes have a separate digest and do not change original record bytes/revision',async()=>{
  const p=await migrateLegacyRecord('startup:fixture-orbit',rawLegacy,SOURCE_REVISION), before=clone(p), first=contractDigest(p);
  p.claims.find(c=>c.predicate==='stage').value='Synthetic disputed stage candidate';
  assert.notEqual(contractDigest(p),first); assert.equal(p.legacy.record_revision,before.legacy.record_revision); assert.equal(restoreLegacyRecord(p),rawLegacy);
});
test('legacy restoration rejects tampering and never translates a new-model-only packet',async()=>{
  const p=await migrateLegacyRecord('startup:fixture-orbit',rawLegacy,SOURCE_REVISION);
  p.legacy.record_json+=' '; assert.throws(()=>restoreLegacyRecord(p),/hash mismatch/);
  assert.throws(()=>restoreLegacyRecord(fixture()),/No legacy/);
});
test('current authoritative schema still rejects proposed fields after no-op migration',async()=>{
  const p=await migrateLegacyRecord('startup:fixture-orbit',rawLegacy,SOURCE_REVISION), record=JSON.parse(restoreLegacyRecord(p));
  record.funding_rounds[0].investors=fixture().investors; assert.throws(()=>validateStartupRecord(record),/not supported/);
});
