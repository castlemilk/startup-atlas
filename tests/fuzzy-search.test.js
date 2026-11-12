import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterLeads, filterOpportunities } from '../logic.js';

test('partner search handles a typo and keeps exact short searches precise', () => {
  const leads = ['Blackbird Ventures', 'Startmate', 'Antler'];
  assert.deepEqual(filterLeads(leads, {query:'blackbrd'}), ['Blackbird Ventures']);
  assert.deepEqual(filterLeads(leads, {query:'st'}), ['Startmate']);
  assert.deepEqual(filterLeads(leads, {query:'zz'}), []);
});

test('opportunity fuzzy fallback respects country and saved filters', () => {
  const item = (id, name, scope) => ({id,name,scope,org:'Provider',kind:'Funding',access:'Direct',value:'',summary:'',eligibility:'',limits:'',status:'',facts:{}});
  const items=[item('au','Blackbird', ['AU']),item('us','Blackbird', ['US'])];
  const state={query:'blackbrd',country:'AU',includeUnknown:false,kind:'all',access:'all',view:'saved',sort:'recommended'};
  assert.deepEqual(filterOpportunities(items,state,new Set(['au','us'])).map(x=>x.id), ['au']);
  assert.deepEqual(filterOpportunities(items,state,new Set(['us'])), []);
});

test('exact matches remain preferred over fuzzy suggestions', () => {
  const leads=['Startmate','Antler'];
  assert.deepEqual(filterLeads(leads,{query:'start'}), ['Startmate']);
  assert.deepEqual(filterLeads(leads,{query:''}), ['Antler','Startmate']);
});

test('partner search finds only sourced provider relationships', () => {
  const relationships={FirmA:[{provider:'Vercel',programme:'Vercel for Startups',relationship:'Listed startup partner'}]};
  assert.deepEqual(filterLeads(['FirmA','FirmB'],{query:'vercel'}, {}, relationships),['FirmA']);
  assert.deepEqual(filterLeads(['FirmA','FirmB'],{query:'vercel for startups'}, {}, relationships),['FirmA']);
  assert.deepEqual(filterLeads(['FirmA','FirmB'],{query:'aws'}, {}, relationships),[]);
});

test('historical screenshot leads are searchable and distinct from provider-confirmed matches', async () => {
  const {partnerRelationships}=await import('../relationships.js');
  const leads=['USV','Carthona'];
  assert.deepEqual(new Set(filterLeads(leads,{query:'Vercel'}, {}, partnerRelationships)),new Set(leads));
  assert.ok(partnerRelationships.USV.some(x=>x.relationship==='Listed startup partner' && x.source==='https://vercel.com/startups'));
  assert.ok(partnerRelationships.Carthona.some(x=>x.source===null && x.relationship.includes('unverified')));
});

test('partner facets combine provider, evidence and available logos', () => {
  const links={Alpha:[{provider:'Vercel',source:null},{provider:'AWS',source:'https://aws.example/'}],Beta:[{provider:'Vercel',source:'https://vercel.example/'}]};
  const items=['Alpha','Beta']; const reviewed={Alpha:{description:'Known'}};
  const state={query:'',partnerProvider:'Vercel',partnerEvidence:'official',partnerLogo:true};
  assert.deepEqual(filterLeads(items,state,reviewed,links,name=>name==='Beta'),['Beta']);
  assert.deepEqual(filterLeads(items,{...state,partnerLogo:false,partnerEvidence:'screenshot'},reviewed,links),['Alpha']);
  assert.deepEqual(filterLeads(items,{...state,partnerLogo:false,partnerProvider:'AWS',partnerEvidence:'screenshot'},reviewed,links),[]);
  assert.deepEqual(filterLeads(items,{...state,partnerLogo:false,partnerEvidence:'reviewed'},reviewed,links),['Alpha']);
});
