import test from 'node:test';
import assert from 'node:assert/strict';
import {validateStartupRecord} from '../../../../backend/hosted/src/startup-record.mjs';
import {domainKey, findIdentityMatches, validateProvenance, validateFundingRelations, validatePacket, readPacket} from './validate.mjs';

const record = () => ({name:'Synthetic Sample', website:'https://sample.example/', source:'https://sample.example/about', reviewed_at:'2026-11-18'});
const source = () => ({source_id:'s',url:'https://sample.example/round',access_status:'accessed',crawler_seed_approved:false});
const evidence = () => ({claim_id:'c',entity_id:'staging:de:sample',field:'funding_round',value:{event_id:'sample-2025'},source_url:'https://sample.example/round',source_kind:'primary_company',accessed:true,retrieved_at:'2026-11-18T09:00:00Z',reviewed_at:'2026-11-18T09:00:00Z',status:'reviewed_staged',evidence:'Synthetic company funding announcement.',rationale:'Synthetic fixture.'});
const event = () => ({event_id:'sample-2025',company_id:'staging:de:sample',evidence_claim_id:'c',source_url:'https://sample.example/round',amount:null,currency:null});

test('real staged packet passes the current production record validator and evidence checks', () => {
  const result=validatePacket(readPacket()); assert(result.valid); assert(result.records>0 && result.records<=50);
});
test('domain normalization handles www, case and trailing DNS dot without broad suffix merging', () => {
  assert.equal(domainKey('https://WWW.Example.com./about'),'example.com');
  assert.notEqual(domainKey('https://bank.example.com/'),domainKey('https://example.com/'));
  assert.throws(()=>domainKey('http://example.com'));
  assert.throws(()=>domainKey('https://user:password@example.com'));
});
test('aliases, domains and canonical slugs find candidates but do not merge identities', () => {
  const existing=[{name:'New Name',website:'https://www.example.com',aliases:['Old Name']}];
  assert(findIdentityMatches(existing,{name:'  OLD NAME ',website:'https://other.example'}).length===1);
  assert(findIdentityMatches(existing,{name:'Other',website:'https://example.com/'}).length===1);
  assert.equal(existing.length,1);
});
test('unknowns are omitted from production projection; null is not accepted as a deletion', () => {
  assert.doesNotThrow(()=>validateStartupRecord(record()));
  assert.throws(()=>validateStartupRecord({...record(),founded_year:null}));
  assert.throws(()=>validateStartupRecord({...record(),description:''}));
  assert.throws(()=>validateStartupRecord({...record(),incorporation_country:'DE'}));
});
test('funding amounts require currency and valid day precision in the unchanged schema', () => {
  const funding={id:'sample-2025',stage:'Series A',source:'https://sample.example/round'};
  assert.doesNotThrow(()=>validateStartupRecord({...record(),funding_rounds:[funding]}));
  assert.throws(()=>validateStartupRecord({...record(),funding_rounds:[{...funding,amount:100}]}));
  assert.throws(()=>validateStartupRecord({...record(),funding_rounds:[{...funding,announced_on:'2025-06'}]}));
});
test('unaccessed or blocked evidence cannot support a reviewed claim', () => {
  assert.throws(()=>validateProvenance([{...evidence(),accessed:false}],[source()]));
  assert.throws(()=>validateProvenance([evidence()],[{...source(),access_status:'unavailable'}]));
  assert.throws(()=>validateProvenance([evidence()],[{...source(),crawler_seed_approved:true}]));
});
test('null accepted values and fabricated publication are rejected', () => {
  assert.throws(()=>validateProvenance([{...evidence(),value:null}],[source()]));
  assert.throws(()=>validateProvenance([{...evidence(),status:'published_verified'}],[source()]));
  assert.doesNotThrow(()=>validateProvenance([{claim_id:'u',entity_id:'staging:de:sample',field:'incorporation',status:'unsearched',rationale:'Not yet inspected.'}],[source()]));
});
test('orphan, cross-company and portfolio-derived participation fail', () => {
  const c=evidence();
  const pc={...evidence(),claim_id:'p',field:'round_participant',value:{event_id:'sample-2025',name:'Example Investor',role:'lead'}};
  const p={event_id:'sample-2025',company_id:'staging:de:sample',name:'Example Investor',role:'lead',resolved_entity_id:null,evidence_claim_id:'p',source_url:pc.source_url,relationship_basis:'explicit_round_announcement'};
  assert.doesNotThrow(()=>validateFundingRelations([event()],[p],[c,pc]));
  assert.throws(()=>validateFundingRelations([event()],[{...p,event_id:'missing'}],[c,pc]));
  assert.throws(()=>validateFundingRelations([event()],[{...p,relationship_basis:'portfolio_membership'}],[c,pc]));
  assert.throws(()=>validateFundingRelations([event()],[p],[c,{...pc,entity_id:'staging:de:other'}]));
  assert.throws(()=>validateFundingRelations([event()],[{...p,company_id:'staging:de:other'}],[c,pc]));
  assert.throws(()=>validateFundingRelations([event()],[{...p,name:'Different Investor'}],[c,pc]));
});
test('source ID corruption and projected funding mutation or deletion fail', () => {
  let p=readPacket();
  p.claims.claims.find(c=>c.status==='reviewed_staged').source_id='nonexistent-source';
  assert.throws(()=>validatePacket(p));
  p=readPacket();
  p.records.startups.flatMap(r=>r.funding_rounds||[]).find(r=>r.amount).amount+=1000000;
  assert.throws(()=>validatePacket(p));
  p=readPacket();
  p.records.startups.find(r=>r.funding_rounds?.length).funding_rounds=[];
  assert.throws(()=>validatePacket(p));
});
test('duplicate event and participation observations are rejected', () => {
  assert.throws(()=>validateFundingRelations([event(),event()],[],[evidence()]));
  assert.throws(()=>validateProvenance([evidence(),evidence()],[source()]));
});
