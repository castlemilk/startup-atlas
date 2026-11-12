import test from 'node:test';
import assert from 'node:assert/strict';
import {filterLeads} from '../logic.js';
const profiles={Airtree:{people:[{name:'James Cameron',role:'Partner'}],companies:[{name:'Airwallex'}]}};
const state={query:'',partnerProvider:'all',partnerEvidence:'all',partnerCountry:'all',partnerLogo:false};
test('profile people and companies are searchable without losing filters',()=>{
  assert.deepEqual(filterLeads(['Airtree','Other'],{...state,query:'James Cameron'}, {},{},()=>false,null,profiles),['Airtree']);
  assert.deepEqual(filterLeads(['Airtree','Other'],{...state,query:'Airwallex'}, {},{},()=>false,null,profiles),['Airtree']);
  assert.deepEqual(filterLeads(['Airtree','Other'],{...state,query:'Airwallex',partnerProvider:'AWS'}, {},{},()=>false,null,profiles),[]);
});
