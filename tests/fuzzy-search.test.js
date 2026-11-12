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
