import test from 'node:test';
import assert from 'node:assert/strict';
import { companyPlaceLabel, countryFlag, countryName, explorationHref, filterCompanies, indexCompanies, readExploration, writeExploration } from '../web/atlas-exploration.js';

const source='https://example.com/record';
const fact=(label,value,extra={})=>({label,value,source,...extra});
const company=(slug,facts)=>({id:'startup:'+slug,kind:'startup',profile_facts:facts});
const au=company('au',[fact('Headquarters','Sydney, Australia',{reviewed_at:'2026-11-13'}),fact('Primary sector','Design')]);
const nz=company('nz',[fact('Headquarters','New Zealand'),fact('Primary sector','Design')]);
const gb=company('gb',[fact('Headquarters','London, United Kingdom'),fact('Primary sector','Finance')]);
const contested=company('contested',[
  fact('Headquarters','Sydney, Australia'),fact('Headquarters','New Zealand and Australia'),
  fact('Primary sector','Design'),fact('Primary sector','Finance'),
]);
const unknown=company('unknown',[fact('Founding location','Canada'),fact('Headquarters','Ottawa, Canada',{source:''})]);
const person={id:'person:a',kind:'person'};
const entities=[au,nz,gb,contested,unknown,person];
const funding=(startup,stage,announced_on,extra={})=>({startup_id:startup.id,stage,announced_on,source,...extra});
const index=indexCompanies({entities,funding_rounds:[
  funding(au,'Series A','2025-07-02'),funding(au,'Series B','2026-01-03',{source:'http://example.com'}),
  funding(nz,'Seed','2025-01-03'),funding(nz,'Funding round (stage undisclosed)','2026-01-04'),
  funding(gb,'Seed','2026-03-09'),funding(gb,'Series A','2026-03-09'),
]},new Map([[au.id,{type:'Design & media'}],[gb.id,{type:'Financial software'}]]));
const scope=(query='')=>readExploration(new URLSearchParams(query));
const ids=items=>items.map(item=>item.id);

test('company dimensions use only sourced and consistent headquarters, sector and dated funding claims',()=>{
  assert.deepEqual(index.get(au.id),{country:'AU',city:'Sydney',technology:'Design & media',sector:'Design',stage:'Series A',newestFactReview:'2026-11-13'});
  assert.deepEqual(index.get(nz.id),{country:'NZ',city:'',technology:'',sector:'Design',stage:'',newestFactReview:''});
  assert.equal(index.get(gb.id).stage,'','different stages on the latest date remain unclassified');
  for (const entity of [contested,unknown]) assert.deepEqual(index.get(entity.id),{country:'',city:'',technology:'',sector:'',stage:'',newestFactReview:''});
  assert.equal(index.has(person.id),false);
});

test('countries combine with OR and location, technology, stage and sector combine with AND',()=>{
  assert.deepEqual(ids(filterCompanies(entities,index,scope())),ids([au,nz,gb,contested,unknown]));
  const selected=scope('hq=AU&hq=NZ&sector=Design&place=AU&city=Sydney');
  assert.deepEqual(ids(filterCompanies(entities,index,selected)),[au.id]);
  assert.deepEqual(ids(filterCompanies(entities,index,selected,{ignoreDrill:true})),ids([au,nz]));
  assert.deepEqual(ids(filterCompanies(entities,index,scope('hq=AU&hq=NZ&sector=Finance&stage=Seed'))),[]);
  assert.deepEqual(ids(filterCompanies(entities,index,scope('hq=unknown&sector=unknown'))),ids([contested,unknown]));
  assert.deepEqual(ids(filterCompanies(entities,index,scope('technology=Design+%26+media&sector=Design'))),[au.id]);
  assert.deepEqual(ids(filterCompanies(entities,index,scope('technology=unknown&hq=NZ'))),[nz.id]);
  assert.deepEqual(ids(filterCompanies(entities,index,scope('place=NZ&city=unknown'))),[nz.id]);
});

test('a state or province in a sourced headquarters string is never treated as the city',()=>{
  const entity=company('austin',[fact('Headquarters','Austin, Texas, United States')]);
  const row=indexCompanies({entities:[entity]}).get(entity.id);
  assert.equal(row.country,'US');
  assert.equal(row.city,'');
});

test('country grouping distinguishes a business base, explicit co-headquarters and unresolved claims',()=>{
  const base = company('base',[fact('Business base','Melbourne, Australia'),fact('Office','London, United Kingdom')]);
  const relocated = company('relocated',[...base.profile_facts,fact('Headquarters','London, United Kingdom')]);
  const dual = company('dual',[fact('Co-headquarters','San Francisco, United States and Singapore')]);
  const conflict = company('conflict',[...dual.profile_facts,fact('Headquarters','San Francisco, United States')]);
  const companies = [base,relocated,dual,conflict];
  const dimensions = indexCompanies({entities:companies});
  assert.equal(dimensions.get(base.id).country,'AU');
  assert.equal(companyPlaceLabel(dimensions.get(base.id)),'Melbourne, Australia · business base');
  assert.equal(companyPlaceLabel(dimensions.get(relocated.id)),'London, United Kingdom');
  assert.equal(countryName(dimensions.get(dual.id).country),'Multiple headquarters');
  assert.equal(companyPlaceLabel(dimensions.get(dual.id)),'San Francisco, United States and Singapore');
  assert.equal(dimensions.get(conflict.id).country,'');
  const selected = scope('hq=multiple&place=multiple&city=San+Francisco');
  assert.equal(selected.drillCity,'');
  assert.deepEqual(readExploration(writeExploration(new URLSearchParams(),selected)),selected);
  assert.deepEqual(ids(filterCompanies(companies,dimensions,selected)),[dual.id]);
  assert.deepEqual(ids(filterCompanies(companies,dimensions,scope('hq=unknown'))),[conflict.id]);
});

test('view links round-trip facets and inspection and preserve the destination route state',()=>{
  const state=scope('q=design&hq=AU&hq=AU&hq=bogus&hq=unknown&place=AU&city=Sydney&technology=Design+%26+media&sector=Design&stage=Seed&selected=startup:au&anchor=startup:gb&type=startup&density=compact');
  assert.deepEqual(state.countries,['AU','unknown']);
  assert.deepEqual(readExploration(writeExploration(new URLSearchParams(),state)),state);
  const target=explorationHref('./graph.html?depth=2#graph-main','https://example.com/startup-atlas/treemap.html',state);
  const url=new URL(target,'https://example.com');
  assert.equal(url.pathname,'/startup-atlas/graph.html');
  assert.equal(url.hash,'#graph-main');
  assert.equal(url.searchParams.get('depth'),'2');
  assert.deepEqual(readExploration(url.searchParams),state);
  assert.equal(scope('place=unknown&city=Sydney').drillCity,'');
  assert.equal(scope('selected=https://example.com').selected,'');
});

test('registry-only business bases preserve country without implying a city', async()=>{
  const {readFile} = await import('node:fs/promises');
  const {entities} = JSON.parse(await readFile(new URL('../data/graph.json',import.meta.url),'utf8'));
  const dimensions = indexCompanies({entities});
  const bases = new Map([
    ['CrossCourtAI','NSW 2010'], ['Superstat','VIC 3121'], ['Wiingman','NSW 2026'],
    ['Remi AI','NSW 2777'], ['Strongroom AI','VIC 3145'],
  ]);
  for (const [name,postcode] of bases) {
    const observed = entities.find(entity=>entity.kind==='startup' && entity.name===name);
    const row = dimensions.get(observed.id);
    assert.equal(row.country,'AU',name);
    assert.equal(row.city,'',name+' must not be included in city filters without city evidence');
    assert.equal(companyPlaceLabel(row),postcode+', Australia · business base',name);
  }
  assert.equal(dimensions.get('startup:loam-bio').city,'Orange','an explicit city remains selectable');
  assert.equal(dimensions.get('startup:zabidou').city,'North Sydney','the disclosed headquarters supersedes the registry-only base');
  assert.equal(dimensions.get('startup:eucalyptus').city,'Sydney','the disclosed headquarters is selectable by city');
  assert.equal(dimensions.get('startup:uluu').city,'','the separately sourced operating base does not imply a headquarters city');
  assert.equal(companyPlaceLabel(dimensions.get('startup:goterra')),'Canberra, Australia (historical)','explorer locations preserve the historical headquarters qualifier');
  assert.equal(dimensions.get('startup:bugcrowd').country,'multiple','explicit co-headquarters remain grouped');
});

test('country flags derive from canonical ISO codes only (#415)',()=>{
  assert.equal(countryFlag('AU'),'🇦🇺');
  assert.equal(countryFlag('US'),'🇺🇸');
  assert.equal(countryFlag('GB'),'🇬🇧');
  assert.equal(countryFlag('NZ'),'🇳🇿');
  for (const code of ['unknown','multiple','','au','XX',null,undefined]) assert.equal(countryFlag(code),'',JSON.stringify(code));
});
