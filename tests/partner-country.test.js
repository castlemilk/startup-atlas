import test from 'node:test';
import assert from 'node:assert/strict';
import { filterLeads } from '../web/logic.js';

const names=['Airtree','Global VC','Unknown'];
const locations=[
  {country:'Australia',partners:[{name:'Airtree'},{name:'Global VC'}]},
  {country:'United Kingdom',partners:[{name:'Global VC'}]}
];
const base={query:'',partnerCountry:'all',partnerProvider:'all',partnerEvidence:'all',partnerLogo:false};

test('mapped country uses explicit mapped places and composes with provider filters',()=>{
  const links={'Global VC':[{provider:'Vercel',source:'https://vercel.com/'}]};
  assert.deepEqual(filterLeads(names,{...base,partnerCountry:'Australia'}, {},links,()=>false,locations),['Airtree','Global VC']);
  assert.deepEqual(filterLeads(names,{...base,partnerCountry:'Australia',partnerProvider:'Vercel'}, {},links,()=>false,locations),['Global VC']);
  assert.deepEqual(filterLeads(names,{...base,partnerCountry:'United Kingdom'}, {},links,()=>false,locations),['Global VC']);
});

test('unmapped is explicit and missing map data never appears as confirmed unmapped',()=>{
  assert.deepEqual(filterLeads(names,{...base,partnerCountry:'unmapped'}, {},{},()=>false,locations),['Unknown']);
  assert.deepEqual(filterLeads(names,{...base,partnerCountry:'unmapped'}, {},{},()=>false,null),[]);
  assert.equal(filterLeads(names,base, {},{},()=>false,null).length,3);
});
