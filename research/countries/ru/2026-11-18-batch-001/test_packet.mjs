import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeName, normalizeDomain, validatePartialDate, findDuplicateCandidates, validatePacket, loadPacket } from './validate.mjs';

const baseline = await loadPacket();
const existing = [
  ...JSON.parse(await readFile(new URL('../../../../data/startup-research.json', import.meta.url),'utf8')).startups,
  ...JSON.parse(await readFile(new URL('../../../../data/graph.json', import.meta.url),'utf8')).entities.filter(entity => entity.kind === 'startup'),
];
const copy = () => structuredClone(baseline);
const reject = (mutate, expression) => { const packet=copy(); mutate(packet); assert.throws(()=>validatePacket(packet,existing),expression); };
const mutateProjection = (packet, select, mutate) => {
  const record = packet.records.startups.find(select);
  assert.ok(record, 'Fixture needs a matching projected record');
  const profile = packet.profiles.find(item => item.record.name === record.name);
  mutate(record); mutate(profile.record);
  return profile;
};

test('complete saved research packet validates against the current record contract',()=>{
  const result=validatePacket(baseline,existing);
  assert.equal(result.valid,true);
  assert.equal(result.production_written,false);
  assert.equal(result.integration_holds,undefined);
  assert.ok(result.integration_requirements.length>0);
  assert.ok(result.records>0 && result.records<=50);
});
test('names normalize width, case and whitespace without transliterating Cyrillic',()=>{
  assert.equal(normalizeName('  ＱＡＰＰ  '),'qapp');
  assert.equal(normalizeName('Mindbox\u00a0  Labs'),'mindbox labs');
  assert.notEqual(normalizeName('КуАпп'),normalizeName('QApp'));
});
test('official-domain normalization ignores paths and www but preserves subdomain identity',()=>{
  assert.equal(normalizeDomain('https://WWW.Genotek.ru/about?campaign=1#part'),'genotek.ru');
  assert.equal(normalizeDomain(null),null);
  assert.notEqual(normalizeDomain('https://labs.example.org'),normalizeDomain('https://example.org'));
  assert.throws(()=>normalizeDomain('https://user:password@example.org'),/HTTPS/);
  assert.throws(()=>normalizeDomain('http://example.org'),/HTTPS/);
});
test('dedup detects verified aliases against existing names',()=>{
  const profile={candidate_id:'x',canonical_name:'New label',aliases:['QAPP'],record:{name:'New label',website:'https://another.test'}};
  assert.equal(findDuplicateCandidates([profile],[{name:'QApp',website:'https://qapp.tech/'}])[0].decision,'review_existing_identity');
});
test('dedup detects existing official domains even after a rebrand',()=>{
  const profile={candidate_id:'x',canonical_name:'Different',aliases:[],record:{name:'Different',website:'https://www.qapp.tech/about'}};
  assert.equal(findDuplicateCandidates([profile],[{name:'QApp',website:'https://qapp.tech/'}])[0].matches.length,1);
});
test('dedup retains aliases on both sides and does not depend on candidate order',()=>{
  const first={candidate_id:'a',canonical_name:'Alpha',aliases:['Общее имя'],record:{name:'Alpha',website:'https://alpha.example'}};
  const second={candidate_id:'b',canonical_name:'Beta',aliases:['Общее имя'],record:{name:'Beta',website:'https://beta.example'}};
  for (const pair of [[first,second],[second,first]]) assert.equal(findDuplicateCandidates(pair,[])[1].decision,'review_existing_identity');
  assert.equal(findDuplicateCandidates([first],[{name:'Old name',aliases:['Общее имя'],website:'https://old.example'}])[0].decision,'review_existing_identity');
});
test('verified alternative domains participate in identity review',()=>{
  const profile={candidate_id:'x',canonical_name:'New label',aliases:[],alternate_domains:[{domain:'old.example'}],record:{name:'New label',website:'https://new.example'}};
  assert.equal(findDuplicateCandidates([profile],[{name:'Old label',website:'https://www.old.example/about'}])[0].decision,'review_existing_identity');
});
test('profiles and records must be exactly the same projection',()=>reject(p=>{p.records.startups[0].description='Changed without updating the reviewed profile.';},/exact parity/));
test('accepted coverage joins by candidate identity rather than only count',()=>reject(p=>{
  const candidate=p.coverage.candidates.find(x=>x.status==='accepted');
  candidate.candidate_id='ru-unrelated';
},/coverage identities/));
test('all projected source URLs must be registered and accessed',()=>reject(p=>{
  mutateProjection(p,()=>true,r=>{r.source='https://unopened.example/about';});
},/Projected source/));
test('a valid schema with no evidence cannot become an accepted packet',()=>reject(p=>{p.claims=[];},/nonempty accepted claims/));
test('profile claim references cannot borrow another company evidence',()=>reject(p=>{
  const claim=p.claims.find(x=>x.status==='reviewed_staged'&&x.entity_id===p.profiles[0].entity_id);
  claim.entity_id=p.profiles[1].entity_id;
},/same company entity|omitted an accepted/));
test('projected founder must match an accepted founder name and source',()=>reject(p=>{
  mutateProjection(p,r=>r.founders?.length,r=>{r.founders[0].name='Unverified Founder';});
},/matching accepted name and source/));
test('unknown or conflicting founding year cannot acquire an unsupported projection',()=>reject(p=>{
  mutateProjection(p,r=>!Object.hasOwn(r,'founded_year'),r=>{r.founded_year=2010;});
},/matching accepted founding claim/));
test('unknown fields stay omitted from production projection, not null',()=>reject(p=>{p.records.startups[0].founded_year=null;},/founded_year|Null/));
test('new production fields cannot be smuggled through a research projection',()=>reject(p=>{p.records.startups[0].headquarters='Moscow';},/not supported/));
test('unknown funding is not converted into numeric zero',()=>reject(p=>{p.records.startups[0].funding_rounds=[{id:'bad-zero',stage:'Unknown',source:p.records.startups[0].source,amount:0,currency:'USD'}];},/Unknown funding/));
test('partial dates retain their actual precision',()=>{
  assert.equal(validatePartialDate({value:'2021',precision:'year'}),true);
  assert.equal(validatePartialDate({value:'2021-09',precision:'month'}),true);
  assert.throws(()=>validatePartialDate({value:'2021-01-01',precision:'year'}),/precision/);
  assert.throws(()=>validatePartialDate({value:'2021-02-29',precision:'day'}),/calendar/);
});
test('source registries cannot automatically approve crawler seeds',()=>reject(p=>{p.sources[0].crawler_seed_approved=true;},/approve crawler/));
test('every accepted claim must point to its exact registered source',()=>reject(p=>{const c=p.claims.find(x=>x.status==='reviewed_staged');c.source_url='https://different.example/';},/provenance/));
test('search snippets cannot be promoted to reviewed evidence',()=>reject(p=>{const c=p.claims.find(x=>x.status==='reviewed_staged');c.source_kind='discovery';},/snippets|source kind/));
test('registry and accepted claim source classifications must agree',()=>reject(p=>{
  const claim=p.claims.find(x=>x.status==='reviewed_staged');p.sources.find(x=>x.source_id===claim.source_id).source_kind='discovery';
},/source kind|Projected source/));
test('unknown claim status cannot bypass the accessed-page requirement',()=>reject(p=>{
  const claim=p.claims.find(x=>x.status==='reviewed_staged');claim.status='accepted_typo';claim.accessed=false;
},/Unrecognized claim status/));
test('unopened pages cannot support accepted facts',()=>reject(p=>{const c=p.claims.find(x=>x.status==='reviewed_staged');c.accessed=false;},/Unopened/));
test('duplicate claim observations are rejected',()=>reject(p=>{p.claims.push(p.claims[0]);},/claim ID/));
test('round identity must be unique across companies',()=>reject(p=>{p.events.push(p.events[0]);},/financing-event ID/));
test('portfolio membership cannot become event participation',()=>reject(p=>{p.events.find(x=>x.participants?.length).participants[0].evidence_basis='portfolio_membership';},/Portfolio/));
test('investor contributions cannot become full round amounts',()=>reject(p=>{const e=p.events[0];e.amount=824000000;e.currency='RUB';e.amount_scope='investor_contribution';},/round-total/));
test('numeric financing without explicit currency is rejected',()=>reject(p=>{p.events[0].amount=4000000;p.events[0].currency=null;},/explicit currency/));
test('numeric company receipt needs an explicit amount basis',()=>reject(p=>{
  const event=p.events.find(x=>Number.isInteger(x.amount));event.amount_basis='secondary_share_transfer';
},/amount basis/));
test('production amount must equal the reviewed financing event amount',()=>reject(p=>{
  mutateProjection(p,r=>r.funding_rounds?.some(x=>Number.isInteger(x.amount)),r=>{r.funding_rounds.find(x=>Number.isInteger(x.amount)).amount+=1;});
},/amount\/currency/));
test('financing event cannot move to another company',()=>reject(p=>{
  const event=p.events[0];event.company_id=p.profiles.find(x=>x.entity_id!==event.company_id).entity_id;
},/matching eligible event|company differ/));
test('excluded financing observation cannot project into a company record',()=>reject(p=>{
  p.events[0].production_projection=false;
},/matching eligible event/));
test('partial announcement date cannot gain invented day precision in projection',()=>reject(p=>{
  const profile=mutateProjection(p,r=>r.funding_rounds?.length,r=>{r.funding_rounds[0].announced_on='2021-01-01';});
  const id=profile.projection_map?.funding_rounds?.[profile.record.funding_rounds[0].id]||profile.record.funding_rounds[0].id;
  p.events.find(x=>x.event_id===id).announced_on={value:'2021',precision:'year'};
},/day-precision announcement/));
test('projected announcement day cannot differ from its event',()=>reject(p=>{
  const profile=mutateProjection(p,r=>r.funding_rounds?.length,r=>{r.funding_rounds[0].announced_on='2021-01-01';});
  const id=profile.projection_map?.funding_rounds?.[profile.record.funding_rounds[0].id]||profile.record.funding_rounds[0].id;
  p.events.find(x=>x.event_id===id).announced_on={value:'2021-01-02',precision:'day'};
},/day-precision announcement/));
test('reviewed participants cannot point to nonexistent events',()=>reject(p=>{p.claims.find(x=>x.field==='round_participant'&&x.status==='reviewed_staged').value.event_id='missing-event';},/unknown event/));
test('country denominator remains unknown rather than a guessed zero',()=>reject(p=>{p.coverage.country_startup_denominator=0;},/denominator/));
test('accepted and published counts remain separate',()=>reject(p=>{p.coverage.counts.published=1;},/published/));
test('interrupted-review checkpoint cannot drop a reviewed candidate',()=>reject(p=>{p.queue.checkpoint.reviewed_candidate_ids.pop();},/checkpoint/));
test('reloading a saved checkpoint preserves the complete next-source queue',()=>{
  const reloaded=JSON.parse(JSON.stringify(baseline));
  assert.deepEqual(validatePacket(reloaded,existing).candidate_counts,validatePacket(baseline,existing).candidate_counts);
  assert.deepEqual(reloaded.queue,baseline.queue);
});
test('queue remains a review handoff, never an executable approved crawl',()=>reject(p=>{p.queue.source_queue[0].approved_for_crawl=true;},/Queue cannot/));
test('known source population cannot be a negative placeholder',()=>reject(p=>{p.queue.source_queue[0].eligible_population=-1;},/population cannot be negative/));
