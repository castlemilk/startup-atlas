import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { filterOpportunities, filterLeads, marketLabel, sourceUrl } from '../logic.js';
const data=JSON.parse(await readFile(new URL('../data/catalogue.json',import.meta.url),'utf8'));
const state={view:'opportunities',query:'',country:'all',includeUnknown:false,kind:'all',access:'all',sort:'recommended'};
test('catalogue retains distinct records with sources and honest geography',()=>{
  assert.equal(data.partnerLeads.length,183);
  assert.equal(new Set(data.partnerLeads).size,183);
  assert.ok(data.opportunities.length>=40);
  assert.equal(new Set(data.opportunities.map(x=>x.id)).size,data.opportunities.length);
  for(const item of data.opportunities){
    assert.ok(item.scope.length>0,`${item.id} scope`);
    assert.ok(item.eligibility && item.limits && item.checked,`${item.id} conditions`);
    assert.ok(sourceUrl(item.url),`${item.id} official source`);
    for(const link of item.extra)assert.ok(sourceUrl(link),`${item.id} extra source`);
    assert.ok(!(item.scope.includes('UNKNOWN') && item.scope.length>1),`${item.id} ambiguous geography`);
  }
});
test('country selection never treats an unknown location as eligible by default',()=>{
 const selected=filterOpportunities(data.opportunities,{...state,country:'AU'},new Set());
 assert.ok(selected.some(x=>x.id==='nvidia'));
 assert.ok(selected.some(x=>x.id==='zfellows'));
 assert.ok(!selected.some(x=>x.scope.includes('UNKNOWN')));
 assert.ok(!selected.some(x=>x.id==='google-india'));
 const expanded=filterOpportunities(data.opportunities,{...state,country:'AU',includeUnknown:true},new Set());
 assert.ok(expanded.some(x=>x.id==='aws-founders'));
 assert.ok(!expanded.some(x=>x.id==='google-india'));
});
test('search, filters, favourites, and partner search compose correctly',()=>{
 assert.deepEqual(filterOpportunities(data.opportunities,{...state,query:'bedrock',access:'Direct'},new Set()).map(x=>x.id),['aws-founders']);
 assert.deepEqual(filterOpportunities(data.opportunities,{...state,view:'saved'},new Set(['nvidia'])).map(x=>x.id),['nvidia']);
 assert.ok(filterLeads(data.partnerLeads,{query:'blackbird'}).includes('Blackbird Ventures'));
 assert.deepEqual(filterLeads(data.partnerLeads,{query:'not a partner name'}),[]);
});
test('source links reject unsafe protocols and market labels distinguish uncertainty',()=>{
 assert.equal(sourceUrl('javascript:alert(1)'),null);
 assert.equal(sourceUrl('https://example.com/'), 'https://example.com/');
 assert.equal(marketLabel(['UNKNOWN']),'Location to verify');
 assert.equal(marketLabel(['WORLD']),'Worldwide applicants');
});
