import test from 'node:test';
import assert from 'node:assert/strict';
import { explorationHref, filterCompanies, indexCompanies, readExploration, writeExploration } from '../web/atlas-exploration.js';

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
]});
const scope=(query='')=>readExploration(new URLSearchParams(query));
const ids=items=>items.map(item=>item.id);

test('company dimensions use only sourced and consistent headquarters, sector and dated funding claims',()=>{
  assert.deepEqual(index.get(au.id),{country:'AU',city:'Sydney',sector:'Design',stage:'Series A',newestFactReview:'2026-11-13'});
  assert.deepEqual(index.get(nz.id),{country:'NZ',city:'',sector:'Design',stage:'',newestFactReview:''});
  assert.equal(index.get(gb.id).stage,'','different stages on the latest date remain unclassified');
  for (const entity of [contested,unknown]) assert.deepEqual(index.get(entity.id),{country:'',city:'',sector:'',stage:'',newestFactReview:''});
  assert.equal(index.has(person.id),false);
});

test('countries combine with OR and location, stage and sector combine with AND',()=>{
  assert.deepEqual(ids(filterCompanies(entities,index,scope())),ids([au,nz,gb,contested,unknown]));
  const selected=scope('hq=AU&hq=NZ&sector=Design&place=AU&city=Sydney');
  assert.deepEqual(ids(filterCompanies(entities,index,selected)),[au.id]);
  assert.deepEqual(ids(filterCompanies(entities,index,selected,{ignoreDrill:true})),ids([au,nz]));
  assert.deepEqual(ids(filterCompanies(entities,index,scope('hq=AU&hq=NZ&sector=Finance&stage=Seed'))),[]);
  assert.deepEqual(ids(filterCompanies(entities,index,scope('hq=unknown&sector=unknown'))),ids([contested,unknown]));
  assert.deepEqual(ids(filterCompanies(entities,index,scope('place=NZ&city=unknown'))),[nz.id]);
});

test('a state or province in a sourced headquarters string is never treated as the city',()=>{
  const entity=company('austin',[fact('Headquarters','Austin, Texas, United States')]);
  const row=indexCompanies({entities:[entity]}).get(entity.id);
  assert.equal(row.country,'US');
  assert.equal(row.city,'');
});

test('view links round-trip facets and inspection and preserve the destination route state',()=>{
  const state=scope('q=design&hq=AU&hq=AU&hq=bogus&hq=unknown&place=AU&city=Sydney&sector=Design&stage=Seed&selected=startup:au&anchor=startup:gb&type=startup&density=compact');
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
