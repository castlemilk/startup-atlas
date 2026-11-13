import test from 'node:test';
import assert from 'node:assert/strict';
import { filterLeads } from '../web/logic.js';

const names=['Self Reporter','Provider Listed'];
const relationships={
  'Self Reporter':[{provider:'Microsoft',source:'https://example.com/claim',evidence:'self_report',relationship:'Self-reported'}],
  'Provider Listed':[{provider:'AWS',source:'https://example.com/list',relationship:'Listed'}]
};
const base={query:'',partnerProvider:'all',partnerEvidence:'all',partnerLogo:false,partnerCountry:'all'};
test('self-reported relationships do not count as provider listings',()=>{
  assert.deepEqual(filterLeads(names,{...base,partnerEvidence:'official'}, {},relationships),['Provider Listed']);
  assert.deepEqual(filterLeads(names,{...base,partnerEvidence:'self_report'}, {},relationships),['Self Reporter']);
  assert.deepEqual(filterLeads(names,{...base,partnerProvider:'Microsoft',partnerEvidence:'official'}, {},relationships),[]);
  assert.deepEqual(filterLeads(names,{...base,partnerProvider:'Microsoft',partnerEvidence:'self_report'}, {},relationships),['Self Reporter']);
});

test('country filter includes sourced programme location without inventing an office',()=>{
  const rel={'Boab AI':[{provider:'LaunchVic',source:'https://launchvic.org/source',country:'Australia'}]};
  assert.deepEqual(filterLeads(['Boab AI','Unknown'],{...base,partnerCountry:'Australia'}, {},rel,()=>false,[]),['Boab AI']);
  assert.deepEqual(filterLeads(['Boab AI','Unknown'],{...base,partnerCountry:'unmapped'}, {},rel,()=>false,[]),['Unknown']);
});
