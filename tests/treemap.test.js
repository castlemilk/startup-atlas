import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {companyContext, cohort, cohortNames, comparableEvent, currencies, makeView, formatValue, treemap} from '../web/treemap-model.js';
import * as model from '../web/treemap-model.js';
const company = (id, name=id, founded_year) => ({id, kind:'startup', name, founded_year});
const event = (id, startup_id, announced_on, value, currency='USD', extra={}) => ({id, startup_id, announced_on, amount:value, valuation:value, currency, valuation_currency:currency, source:'https://example.com/evidence', ...extra});
const graph = {entities:[company('a','Alpha',2013),company('b','Beta',0),company('c','Gamma',2005),{id:'person:a',kind:'person',name:'Not a company'}], funding_rounds:[event('a-old','a','2020-01-01',10),event('a-new','a','2025-01-01',20),event('a-aud','a','2026-01-01',200,'AUD'),event('b-text','b','2026-02-01',null),event('c-aud','c','2022-01-01',30,'AUD')]};
test('selects one latest eligible event per company and keeps currencies separate',()=>{
  const usd=makeView(graph,{metric:'valuation',currency:'USD'});
  assert.equal(usd.rows.length,1);assert.equal(usd.rows[0].event.id,'a-new');assert.equal(usd.total,20);assert.equal(usd.rows[0].newerUnplotted,true);
  assert.equal(usd.filteredCount,3);assert.deepEqual(usd.missing.map(item=>item.id),['b','c']);
  const aud=makeView(graph,{metric:'funding',currency:'AUD'});assert.equal(aud.total,230);assert.equal(aud.rows.length,2);
  assert.deepEqual(currencies(graph,'valuation'),['AUD','USD']);
});
test('unknown, zero, text, non-finite, undated or unsourced amounts are never plotted',()=>{
  for(const patch of [{amount:0},{amount:-1},{amount:NaN},{amount:Infinity},{amount:'20'},{currency:''},{currency:'usd'},{announced_on:''},{announced_on:'2026-99-99'},{announced_on:'2026-02-30'},{source:'javascript:alert(1)'},{source:null}]){
    assert.equal(comparableEvent(event('e','a','2025-01-01',20,'USD',patch),'funding'),false,JSON.stringify(patch));
  }
  assert.equal(comparableEvent(event('e','a','2025-01-01',20,'USD',{valuation_currency:''}),'valuation'),false);
});
test('a newer text-only amount never replaces or pretends to be an older numeric amount',()=>{
  const view=makeView({...graph,funding_rounds:[event('old','a','2021-07-27',450e6),event('new','a','2025-09-10',null,'USD',{amount_text:'$1 billion; currency not explicit'})]},{metric:'funding'});
  assert.equal(view.rows[0].value,450e6);assert.equal(view.rows[0].event.id,'old');assert.equal(view.rows[0].newerUnplotted,true);
});
test('company count, unknown founding years, search and grouping are grounded',()=>{
  const view=makeView(graph,{metric:'companies'});assert.equal(view.total,3);assert.equal(view.missing.length,0);assert.ok(view.rows.every(row=>row.value===1));
  assert.equal(cohort(company('x','x',0)),'Not recorded');assert.equal(cohort(company('x','x',2015)),'2010s');
  assert.equal(makeView(graph,{metric:'companies',period:'Not recorded'}).rows[0].id,'b');
  assert.equal(makeView(graph,{metric:'companies',query:'alPhA'}).rows[0].id,'a');
  assert.equal(makeView(graph,{metric:'companies',query:'nothing'}).rows.length,0);
  assert.equal(view.groups.reduce((s,g)=>s+g.value,0),3);
});
test('groups the filtered population by sourced classification and keeps unknown companies in the totals', () => {
  const dimensions = new Map([
    ['a', {country:'AU', city:'Perth', sector:'Software', stage:'Series A'}],
    ['b', {country:'GB', city:'Perth', sector:'Software'}],
    ['c', {}],
  ]);
  const sectors = makeView(graph, {metric:'funding', group:'sector', dimensions});
  assert.deepEqual(sectors.groups.map(group => [group.name,group.count,group.children.length,group.value]), [
    ['Software',2,1,20], ['Sector not recorded',1,0,0],
  ]);
  const cities = makeView(graph, {metric:'companies', group:'city', dimensions});
  assert.deepEqual(cities.groups.map(group => group.name).sort(), ['City not recorded','Perth, Australia','Perth, United Kingdom']);
  const stages = makeView(graph, {metric:'companies', group:'stage', dimensions, companies:graph.entities.slice(0,2)});
  assert.deepEqual(stages.groups.map(group => [group.name,group.count]), [['Series A',1],['Stage not recorded',1]]);
  const countries = makeView(graph, {metric:'companies', group:'country', dimensions});
  assert.deepEqual(countries.groups.map(group => group.id).sort(), ['AU','GB','unknown']);
});
test('preserves explicit zero and undisclosed funding outside the proportional layout', () => {
  const view = makeView({...graph,funding_rounds:[
    event('zero','a','2020-01-01',0,'AUD'),
    event('undisclosed','b','2025-01-01',null,'AUD',{amount_text:'Amount not disclosed'}),
  ]}, {metric:'funding',currency:'AUD'});
  assert.deepEqual(view.rows, []);
  assert.equal(view.filteredCount, 3);
  assert.equal(view.missingFigures.get('a').reason, 'recorded-zero');
  assert.equal(view.missingFigures.get('a').event.announced_on, '2020-01-01');
  assert.equal(view.missingFigures.get('b').reason, 'undisclosed');
  assert.equal(view.missingFigures.get('c').reason, 'unknown');
});
test('same-date ties and input order produce deterministic layouts and event choices',()=>{
  const rounds=[event('z','a','2025-01-01',40),event('a','a','2025-01-01',20)];
  assert.equal(makeView({...graph,funding_rounds:rounds}).rows[0].event.id,'a');
  const items=[{id:'z',value:10},{id:'a',value:10},{id:'b',value:30}];
  assert.deepEqual(treemap(items,100,100),treemap(items.toReversed(),100,100));
});
test('treemap conserves weighted area, does not overlap and stays in bounds',()=>{
  for(const [width,height] of [[1000,510],[350,440],[1,1],[37,920]]) for(const values of [[1],[40,11,3.15],Array(46).fill(1),[100000,100,1,.01]]){
    const total=values.reduce((a,b)=>a+b,0), tiles=treemap(values.map((value,i)=>({id:String(i),value})),width,height);
    for(const t of tiles){assert.ok(t.x>=-1e-7&&t.y>=-1e-7&&t.x+t.width<=width+1e-7&&t.y+t.height<=height+1e-7);assert.ok(Math.abs(t.width*t.height/(width*height)-t.value/total)<1e-8);}
    for(let i=0;i<tiles.length;i++)for(let j=i+1;j<tiles.length;j++){const a=tiles[i],b=tiles[j];assert.ok(a.x+a.width<=b.x+1e-7||b.x+b.width<=a.x+1e-7||a.y+a.height<=b.y+1e-7||b.y+b.height<=a.y+1e-7);}
  }
  assert.deepEqual(treemap([],100,100),[]);assert.deepEqual(treemap([{id:'x',value:0}],100,100),[]);assert.deepEqual(treemap([{id:'x',value:1}],0,100),[]);
});
test('nested groups preserve each company’s original share of the total area', () => {
  const view = makeView(graph, {metric:'funding',currency:'AUD',group:'country',dimensions:new Map([
    ['a',{country:'AU'}], ['b',{country:'GB'}], ['c',{country:'US'}],
  ])});
  const width = 640, height = 475;
  const groups = model.groupedTreemap(view.groups, width, height);
  assert.deepEqual(groups.map(group => group.id), ['AU','US']);
  for (const group of groups) for (const tile of group.tiles) {
    assert.ok(Math.abs(tile.width * tile.height / (width * height) - tile.value / view.total) < 1e-8);
  }
});
test('colour uses stable categories and ages only full, valid fact review dates', () => {
  const companies = graph.entities.slice(0,3);
  const dimensions = new Map([
    ['a',{country:'AU',sector:'Software',newestFactReview:'2026-10-20'}],
    ['b',{country:'NZ',sector:'Software',newestFactReview:'2026-09'}],
    ['c',{country:'AU',sector:'Energy',newestFactReview:'2026-07-01'}],
  ]);
  const sector = model.colourEncoding('sector',companies,dimensions);
  assert.equal(sector.forCompany(companies[0]).name,'Software');
  assert.equal(sector.forCompany(companies[0]).fill,sector.forCompany(companies[1]).fill);
  assert.notEqual(sector.forCompany(companies[0]).fill,sector.forCompany(companies[2]).fill);
  const country = model.colourEncoding('country',companies,dimensions);
  assert.equal(country.forCompany(companies[0]).fill,country.forCompany(companies[2]).fill);
  assert.deepEqual(country.entries,model.colourEncoding('country',companies.toReversed(),dimensions).entries);
  const freshness = model.colourEncoding('freshness',companies,dimensions,'2026-11-20');
  assert.equal(freshness.forCompany(companies[0]).name,'31–90 days');
  assert.equal(freshness.forCompany(companies[1]).name,'Review date not recorded');
  assert.equal(freshness.forCompany(companies[2]).name,'91–180 days');
  assert.ok(freshness.entries.some(entry => entry.fill===freshness.forCompany(companies[2]).fill));
});
test('money is explicitly currency-labelled and count has no money formatting',()=>{
  assert.equal(formatValue(40e9,'valuation','USD'),'USD 40B');assert.equal(formatValue(1,'companies','USD'),'1 company');
});
test('current graph exposes honest coverage without multiplying valuations across rounds',async()=>{
  const published=JSON.parse(await readFile('data/graph.json','utf8'));
  const view=makeView(published,{metric:'valuation',currency:'USD'});
  assert.equal(view.rows.find(row=>row.id==='startup:airwallex').value,11e9);
  assert.equal(view.rows.find(row=>row.id==='startup:canva').value,40e9);
  assert.equal(view.rows.length+view.missing.length,published.entities.filter(entity=>entity.kind==='startup').length);
  assert.equal(new Set(view.rows.map(row=>row.id)).size,view.rows.length);
});

test('cohort palette keys are stable across entity ordering and financial filtering',()=>{
  assert.deepEqual(cohortNames(graph),['2000s','2010s','Not recorded']);
  assert.deepEqual(cohortNames({...graph,entities:graph.entities.toReversed()}),cohortNames(graph));
});


test('company context preserves separate funding and valuation observations without market-cap inference',()=>{
  const context=companyContext(graph,graph.entities[0],'USD');
  assert.deepEqual(context.figures.map(item=>[item.metric,item.row.value]),[['funding',20],['valuation',20]]);
  assert.equal(Object.hasOwn(context,'marketCap'),false);
  assert.equal(companyContext(graph,graph.entities[1],'USD').figures[0].row,null);
});
test('context requires founder direction, person identity and HTTPS evidence; deduplicates without mutating',()=>{
  const person={id:'p',kind:'person',name:'Founder',logo:'https://example.com/photo',logo_source:'https://example.com/team',socials:[{label:'LinkedIn',url:'https://example.com/profile',source:'https://example.com/team'}]};
  const edge={from:'p',to:'a',kind:'founded',source:'https://example.com/team'};
  const g={...graph,entities:[...graph.entities,person],edges:[edge,edge,{...edge,kind:'team_member'},{...edge,from:'a',to:'p'}]};
  const before=JSON.stringify(g),context=companyContext(g,g.entities[0]);
  assert.equal(context.founders.length,1);assert.equal(context.founders[0].person.logo,person.logo);assert.equal(context.founders[0].socials.length,1);assert.equal(JSON.stringify(g),before);
  assert.equal(companyContext({...g,edges:[{...edge,source:'javascript:bad'}]},g.entities[0]).founders.length,0);
});
test('unsourced portraits, facts and social handles never acquire invented evidence',()=>{
  const entity={...graph.entities[0],profile_facts:[{label:'Team',value:'100',source:'https://example.com/report'},{label:'Guess',value:'999',source:''}],socials:[{label:'Bad',url:'https://example.com/user',source:''}]};
  const g={...graph,entities:[entity,{id:'p',kind:'person',name:'Founder',logo:'https://example.com/photo'}],edges:[{from:'p',to:'a',kind:'founded',source:'https://example.com/team'}]};
  const context=companyContext(g,entity);assert.equal(context.facts.length,1);assert.equal(context.socials.length,0);assert.equal(context.founders[0].person.logo,'');
});
