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
test('NSW pre-accelerators retain their specific applicant criteria',()=>{
 const nsw=data.opportunities.find(x=>x.id==='first-nations-nsw');
 const women=data.opportunities.find(x=>x.id==='first-nations-women-nsw');
 assert.ok(nsw.scope.includes('AU'));
 assert.match(nsw.eligibility,/NSW/);
 assert.match(women.eligibility,/not required/);
 assert.match(women.limits,/in-person intensive/);
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

test('regional programmes preserve location and financing restrictions',()=>{
 const uk=data.opportunities.find(x=>x.id==='luinc-business-accelerator');
 const ca=data.opportunities.find(x=>x.id==='futurpreneur-black');
 assert.deepEqual(uk.scope,['GB']);
 assert.match(uk.eligibility,/Leicester|area/);
 assert.match(uk.limits,/not guaranteed/);
 assert.deepEqual(ca.scope,['CA']);
 assert.match(ca.limits,/repayable loan/);
 assert.match(ca.limits,/excluded/);
});

test('South Africa funding and Singapore market access retain cohort restrictions',()=>{
 const za=data.opportunities.find(x=>x.id==='google-south-africa');
 const sg=data.opportunities.find(x=>x.id==='gia-london');
 assert.match(za.limits,/28 August/);
 assert.match(za.value,/R1 million/);
 assert.deepEqual(sg.scope,['SG']);
 assert.match(sg.eligibility,/30%/);
 assert.equal(sg.status,'Applications closed');
});

test('new South Australian and Queensland funding listings preserve geography and terms',()=>{
 const sa=data.opportunities.find(x=>x.id==='seed-start-grant-sa');
 const qld=data.opportunities.find(x=>x.id==='first-nations-innovation-acceleration-qld');
 assert.ok(sa && qld);
 assert.deepEqual(sa.scope,['AU']);
 assert.equal(sa.checked,'2026-11-11');
 assert.match(sa.eligibility,/South Australia/);
 assert.match(sa.limits,/2:1/);
 assert.match(sa.limits,/1:1/);
 assert.match(sa.eligibility,/turnover below A\$1 million/i);
 assert.deepEqual(qld.scope,['AU']);
 assert.equal(qld.status,'Open until 4 February 2027');
 assert.match(qld.eligibility,/First Nations-owned/);
 assert.match(qld.limits,/earlier if fully subscribed/);
 assert.match(qld.limits,/mature, established businesses/);
});

test('India seed-fund application closure is distinguished from ongoing scheme administration',()=>{
 const item=data.opportunities.find(x=>x.id==='startup-india');
 assert.equal(item.status,'Applications closed 31 May 2026');
 assert.equal(item.checked,'2026-11-12');
 assert.match(item.eligibility,/DPIIT-recognised/);
 assert.match(item.limits,/applications are closed/);
 assert.match(item.limits,/₹20 lakh/);
 assert.match(item.limits,/₹50 lakh/);
 assert.ok(item.extra.includes('https://seedfund.startupindia.gov.in/faq'));
});

test('British Columbia AI funding records co-funding, repayability and project eligibility',()=>{
 const item=data.opportunities.find(x=>x.id==='canada-raii-bc');
 assert.deepEqual(item.scope,['CA']);
 assert.equal(item.checked,'2026-11-11');
 assert.match(item.status,/23 November 2026/);
 assert.match(item.eligibility,/British Columbia/);
 assert.match(item.eligibility,/at least 1 year/);
 assert.match(item.limits,/repayable/);
 assert.match(item.limits,/50% of project funding/);
 assert.match(item.limits,/off-the-shelf AI purchases are excluded/);
});

test('West of England START programme does not imply a confirmed next cohort or guaranteed placement',()=>{
 const item=data.opportunities.find(x=>x.id==='start-west-england');
 assert.deepEqual(item.scope,['GB']);
 assert.equal(item.checked,'2026-11-11');
 assert.match(item.eligibility,/Bristol, South Gloucestershire or Bath/);
 assert.match(item.status,/dates unconfirmed/);
 assert.match(item.limits,/not a guaranteed/);
 assert.ok(item.extra.includes('https://www.gov.uk/business-finance-support/start-west-of-england'));
});

test('North East Pathways to Funding keeps its three-area eligibility and non-grant support clear',()=>{
 const item=data.opportunities.find(x=>x.id==='pathways-to-funding-north-east');
 assert.deepEqual(item.scope,['GB']);
 assert.equal(item.checked,'2026-11-11');
 assert.match(item.eligibility,/Newcastle, Northumberland, or North Tyneside/);
 assert.match(item.limits,/No grant or investment award is promised/);
 assert.match(item.status,/no deadline stated/);
 assert.ok(item.extra.includes('https://www.weareumi.co.uk/what-we-do/our-campaigns-programmes/pathways-to-funding'));
});

test('Innovative Solutions Canada AI challenge records Canadian thresholds and Phase 2 contract limits',()=>{
 const item=data.opportunities.find(x=>x.id==='isc-ai-governance-phase2-2026');
 assert.deepEqual(item.scope,['CA']);
 assert.equal(item.checked,'2026-11-11');
 assert.match(item.eligibility,/Canadian-incorporated/);
 assert.match(item.eligibility,/TRL 5–9/);
 assert.match(item.value,/C\$2,000,000/);
 assert.match(item.limits,/not an unconditional grant/);
 assert.match(item.status,/22 December 2026, 14:00 Eastern/);
});
