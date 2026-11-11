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
    assert.ok(item.facts && typeof item.facts === 'object' && !Array.isArray(item.facts),`${item.id} facts`);
  }
});
test('new programme metadata is searchable and geography stays explicit',()=>{
 assert.ok(filterOpportunities(data.opportunities,{...state,query:'excluded for new entrants'},new Set()).some(x=>x.id==='cloudflare-founders'));
 assert.ok(filterOpportunities(data.opportunities,{...state,country:'CA'},new Set()).some(x=>x.id==='canada-irap'));
 assert.ok(filterOpportunities(data.opportunities,{...state,kind:'Data & analytics'},new Set()).some(x=>x.id==='neon-self-funded'));
 assert.equal(data.opportunities.find(x=>x.id==='digitalocean-startups').status,'Applications paused');
});
test('new startup offers keep regional and intake restrictions visible',()=>{
 const inIndia=filterOpportunities(data.opportunities,{...state,country:'IN',query:'HubSpot'},new Set());
 const inAustralia=filterOpportunities(data.opportunities,{...state,country:'AU',query:'HubSpot'},new Set());
 assert.ok(inIndia.some(x=>x.id==='hubspot-bootstrap'));
 assert.ok(!inAustralia.some(x=>x.id==='hubspot-bootstrap'));
 assert.equal(data.opportunities.find(x=>x.id==='industry-growth').status,'Applications paused');
 assert.match(data.opportunities.find(x=>x.id==='notion-direct').limits,/one month/);
});
test('Fly and Linear record material award and renewal restrictions',()=>{
 const fly=data.opportunities.find(x=>x.id==='fly-startups');
 const linear=data.opportunities.find(x=>x.id==='linear-startups');
 assert.match(fly.eligibility,/Bootstrapped companies are excluded/);
 assert.match(fly.limits,/expire one year/);
 assert.match(linear.limits,/automatically renews/);
 assert.equal(linear.access,'Partner referral');
});
test('Vercel offer distinguishes current billing from legacy credit terms',()=>{
 const item=data.opportunities.find(x=>x.id==='vercel');
 assert.match(item.limits,/payment method is required/i);
 assert.match(item.limits,/standard rates apply/i);
 assert.match(item.limits,/Earlier grants/);
});
test('Temporal direct and AWS partner offers remain distinct',()=>{
 const direct=data.opportunities.find(x=>x.id==='temporal-startups');
 const partner=data.opportunities.find(x=>x.id==='temporal-aws');
 assert.equal(direct.access,'Direct');
 assert.equal(partner.access,'Partner referral');
 assert.match(direct.eligibility,/active usage/i);
 assert.match(partner.limits,/do not assume they can be combined/i);
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
