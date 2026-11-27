import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {companyContext, cohort, cohortNames, comparableEvent, currencies, makeView, formatValue, treemap} from '../web/treemap-model.js';
import * as model from '../web/treemap-model.js';
import {indexCompanies} from '../web/atlas-exploration.js';
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
test('editorial group headings preserve relative company areas in mosaic and city layouts', () => {
  const groups = [
    {id:'a', value:100, children:[{id:'a-1',value:75},{id:'a-2',value:25}]},
    {id:'b', value:40, children:[{id:'b-1',value:40}]},
  ];
  for (const stacked of [false,true]) {
    const chart = model.groupedTreemap(groups,600,480,{heading:36,stacked});
    const tiles = chart.flatMap(group => group.tiles);
    const area = tile => tile.width * tile.height;
    const total = tiles.reduce((sum,tile) => sum + area(tile),0);
    assert.ok(chart.every(group => group.headingHeight > 0 && group.tiles.every(tile => tile.y >= group.headingHeight)));
    assert.ok(tiles.every(tile => Math.abs(area(tile)/total - tile.value/140)<1e-8));
    if (stacked) assert.ok(chart.every(group => group.width===600 && group.headingHeight===36));
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
  assert.deepEqual(context.figures.map(item=>[item.metric,item.row?.value]),[['funding',20],['valuation',20],['market-cap',undefined]]);
  assert.equal(Object.hasOwn(context,'marketCap'),false);
  assert.equal(companyContext(graph,graph.entities[1],'USD').figures[0].row,null);
});

test('public market cap selects the latest eligible close per currency and keeps missing companies off the map',()=>{
  const quote = (startup_id,amount,observed_on='2026-11-19',currency='USD') =>
    ({startup_id,amount,observed_on,currency,ticker:startup_id.toUpperCase(),exchange:'NYSE',source:'https://example.com/quote'});
  const data = {
    version:1,
    technology:{
      a:{type:'Quantum technology',detail:'Builds quantum processors.',source:'https://example.com/product'},
      b:{type:'Business software',detail:'Builds automation tools.',source:'https://example.com/product'},
      c:{type:'Guess',detail:'Unsourced.',source:'http://example.com/product'},
    },
    market_caps:[
      quote('a',100,'2026-10-06'), quote('a',480), quote('a',900,'2026-11-20','GBP'), quote('b',240),
      {...quote('c',700),calculation:{close:5,shares:50,shares_as_of:'2026-11-19',shares_source:'https://example.com/shares'}},
      quote('a',0), quote('missing',1500), quote('b',400,'2026-02-30'), quote('b',700),
    ],
  };
  const {marketCaps,technology} = model.indexTreemapEvidence(graph,data);
  const dimensions = new Map([...technology].map(([id,fact])=>[id,{technology:fact.type}]));
  assert.deepEqual(currencies(graph,'market-cap',marketCaps),['GBP','USD']);
  const usd = makeView(graph,{metric:'market-cap',currency:'USD',group:'technology',marketCaps,dimensions});
  assert.deepEqual(usd.rows.map(row=>[row.id,row.value,row.groupName]),[
    ['a',480,'Quantum technology'], ['b',240,'Business software'],
  ]);
  assert.deepEqual(usd.missing.map(entity=>entity.id),['c']);
  assert.equal(usd.rows[0].newerUnplotted,true);
  const tiles = model.groupedTreemap(usd.groups,900,420,{heading:40}).flatMap(group=>group.tiles);
  const areas = new Map(tiles.map(tile=>[tile.id,tile.width*tile.height]));
  assert.ok(Math.abs(areas.get('a')/areas.get('b')-2)<1e-8);
  assert.equal(makeView(graph,{metric:'market-cap',currency:'GBP',marketCaps}).missingFigures.get('b').reason,'not-comparable');
  assert.equal(makeView(graph,{metric:'companies',group:'technology',dimensions}).groups.at(-1).name,'Technology type not recorded');
});

test('company value uses the verified ownership basis and latest sourced figure in one currency',()=>{
  const market = (id,amount,observed_on) => ({startup_id:id,amount,observed_on,currency:'USD',ticker:id.toUpperCase(),exchange:'NYSE',source:'https://example.com/market'});
  const owner = status => ({status,observed_on:'2026-11-20',detail:'Ownership receipt.',source:'https://example.com/ownership'});
  const supplemental = {...event('b-valuation','b','2026-10-08',15),stage:'Secondary share sale',approximate:true};
  const fixture = {...graph,
    entities:[...graph.entities,company('d'),company('e'),company('f')],
    funding_rounds:[...graph.funding_rounds,event('d-usd','d','2025-01-02',30),event('d-aud','d','2026-01-02',60,'AUD'),event('e-private','e','2024-01-01',1000),event('f-unsure','f','2026-01-01',5000)],
  };
  const evidence = model.indexTreemapEvidence(fixture,{
    version:1, ownership:{a:owner('public'),b:owner('private'),c:owner('public'),d:owner('private'),e:owner('subsidiary'),f:{...owner('private'),source:'http://example.com/guess'}},
    market_caps:[market('a',28,'2026-11-19'),market('a',30,'2026-11-20'),market('b',200,'2026-11-20')],
    private_valuations:[supplemental,{...supplemental,valuation:80}, {...supplemental,id:'undated',announced_on:''}],
  });
  assert.equal(evidence.privateValuations.length,1);
  const companyValues = model.indexCompanyValues(fixture,evidence);
  const dimensions = new Map([['a',{technology:'Quantum technology'}],['b',{technology:'Business software'}]]);
  const usd = makeView(fixture,{metric:model.COMPANY_VALUE,currency:'USD',group:'technology',companyValues,dimensions});
  assert.deepEqual(usd.rows.map(row=>[row.id,row.basis,row.value]),[['a','market-cap',30],['b','valuation',15]]);
  assert.equal(usd.rows[0].event.observed_on,'2026-11-20');
  assert.equal(usd.rows[1].event.approximate,true);
  assert.deepEqual([...usd.missingFigures].map(([id,figure])=>[id,figure.reason]),[
    ['c','value-not-recorded'],['d','different-currency'],['e','not-standalone'],['f','ownership-not-recorded'],
  ]);
  assert.equal(usd.missingFigures.get('d').currency,'AUD');
  assert.deepEqual(currencies(fixture,model.COMPANY_VALUE,evidence.marketCaps,companyValues),['AUD','USD']);
  assert.deepEqual(makeView(fixture,{metric:model.COMPANY_VALUE,currency:'AUD',companyValues}).rows.map(row=>[row.id,row.value]),[['d',60]]);
  assert.equal(model.companyFigure(fixture,fixture.entities[1],model.COMPANY_VALUE,'USD',evidence.marketCaps,companyValues).event.id,supplemental.id);
});

test('reviewed treemap evidence matches published identities and market-cap calculations',async()=>{
  const published = JSON.parse(await readFile('data/graph.json','utf8'));
  const evidence = JSON.parse(await readFile('data/treemap-evidence.json','utf8'));
  const indexed = model.indexTreemapEvidence(published,evidence);
  const {technology,marketCaps,ownership,privateValuations} = indexed;
  assert.equal(technology.size,Object.keys(evidence.technology).length);
  assert.equal(marketCaps.length,evidence.market_caps.length);
  assert.equal(ownership.size,Object.keys(evidence.ownership).length);
  assert.equal(privateValuations.length,evidence.private_valuations.length);
  assert.equal(technology.get('startup:psiquantum').type,'Quantum technology');
  assert.ok(new Set([...technology.values()].map(fact=>fact.type)).size>=10);
  const usd = makeView(published,{metric:'market-cap',currency:'USD',marketCaps});
  assert.ok(usd.rows.some(row=>row.id==='startup:wise'));
  assert.ok(usd.rows.some(row=>row.id==='startup:uipath'));
  const values = model.indexCompanyValues(published,indexed);
  assert.equal(values.get('startup:wise').basis,'market-cap');
  assert.equal(values.get('startup:revolut').basis,'valuation');
  assert.equal(values.get('startup:eucalyptus').reason,'not-standalone');
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

test('company context carries the derived value, listing and full valuation history (#414b)', () => {
  const entity = {id:'a', kind:'startup', name:'Alpha',
    latest_value:{amount:20, currency:'USD', amount_usd:20, as_of:'2025-01-01', basis:'last_round_post_money', approximate:false, source:'https://example.com/evidence'},
    listing:{status:'public', exchange:'NYSE', ticker:'ALP'}};
  const g = {entities:[entity], edges:[], funding_rounds:graph.funding_rounds};
  const privateValuations = [{id:'a-sec', startup_id:'a', announced_on:'2024-06-01', stage:'Secondary sale', valuation:15, valuation_currency:'USD', source:'https://example.com/secondary', approximate:true}];
  const marketCaps = [{startup_id:'a', observed_on:'2026-01-15', amount:25, currency:'USD', source:'https://example.com/cap', exchange:'NYSE', ticker:'ALP'}];
  const context = companyContext(g, entity, 'USD', marketCaps, privateValuations);
  assert.equal(context.value.amount, 20);
  assert.deepEqual(context.listing, {status:'public', exchange:'NYSE', ticker:'ALP'});
  // Newest first across all three stores; the AUD round is a separate currency observation and still history.
  assert.deepEqual(context.valueHistory.map(entry => entry.date), ['2026-01-15','2026-01-01','2025-01-01','2024-06-01','2020-01-01']);
  assert.equal(context.valueHistory[0].basis, 'listed_market_cap');
  assert.equal(context.valueHistory[0].ticker, 'ALP');
  assert.equal(context.valueHistory[3].approximate, true);
  const bare = companyContext(g, {id:'b', kind:'startup', name:'Beta'}, 'USD');
  assert.equal(bare.value, null);
  assert.equal(bare.listing, null);
  assert.deepEqual(bare.valueHistory, []);
});

test('tile ticker shows only for listed tiles large enough for the extra line',()=>{
  const listed={basis:'market-cap',event:{ticker:'PATH',exchange:'NYSE'},width:128,height:236};
  assert.equal(model.tileTicker(listed),'NYSE: PATH');
  assert.equal(model.tileTicker({...listed,width:100,height:96}),'NYSE: PATH');
  assert.equal(model.tileTicker({...listed,width:99}),'');
  assert.equal(model.tileTicker({...listed,height:95}),'');
  assert.equal(model.tileTicker({...listed,basis:'valuation'}),'');
  assert.equal(model.tileTicker({...listed,event:{}}),'');
  assert.equal(model.tileTicker({...listed,event:undefined}),'');
  assert.equal(model.tileTicker(null),'');
});

test('published listed companies keep their tickers at desktop board sizes (#414b regression)',async()=>{
  const published=JSON.parse(await readFile('data/graph.json','utf8'));
  const evidence=JSON.parse(await readFile('data/treemap-evidence.json','utf8'));
  const indexed=model.indexTreemapEvidence(published,evidence);
  const companyValues=model.indexCompanyValues(published,indexed);
  const dimensions=indexCompanies(published,indexed.technology);
  const companies=published.entities.filter(entity=>entity.kind==='startup');
  const view=makeView(published,{metric:model.COMPANY_VALUE,currency:'USD',group:'technology',dimensions,companies,marketCaps:indexed.marketCaps,companyValues});
  // The default company-value board groups tiles into narrow columns; the two
  // listed tiles lay out ~105-160px wide, below the original 132px gate.
  for(const [width,height] of [[1400,580],[1200,520]]) {
    const tiles=new Map(model.groupedTreemap(view.groups,width,height,{heading:44}).flatMap(group=>group.tiles).map(tile=>[tile.id,tile]));
    assert.equal(model.tileTicker(tiles.get('startup:uipath')),'NYSE: PATH',`UiPath ticker at ${width}x${height}`);
    assert.equal(model.tileTicker(tiles.get('startup:wise')),'Nasdaq: WSE',`Wise ticker at ${width}x${height}`);
    assert.equal(model.tileTicker(tiles.get('startup:revolut')),'','Private companies carry no ticker');
  }
});

test('founder index applies the context evidence rules and derives initials (#415)',()=>{
  const photo={id:'p1',kind:'person',name:'Ada Lovelace',logo:'https://example.com/ada.png',logo_source:'https://example.com/team'};
  const bare={id:'p2',kind:'person',name:'Grace Brewster Hopper',logo:'https://example.com/grace.png'};
  const plain={id:'p3',kind:'person',name:'Nik Storonsky',logo:'',logo_source:''};
  const g={entities:[company('a','Alpha',2013),photo,bare,plain],edges:[
    {from:'p1',to:'a',kind:'founded',source:'https://example.com/team'},
    {from:'p1',to:'a',kind:'founded',source:'https://example.com/team'},
    {from:'p2',to:'a',kind:'founded',source:'https://example.com/team'},
    {from:'p3',to:'a',kind:'founded',source:'https://example.com/team'},
    {from:'p1',to:'a',kind:'team_member',source:'https://example.com/team'},
    {from:'p1',to:'a',kind:'founded',source:'javascript:bad'},
    {from:'a',to:'p1',kind:'founded',source:'https://example.com/team'},
  ]};
  const founders=model.indexFounders(g).get('a');
  assert.deepEqual(founders.map(founder=>founder.id),['p1','p2','p3'],'one entry per founder, edge order, duplicates and wrong kinds/directions excluded');
  assert.equal(founders[0].photo,photo.logo,'photo carried when image and source are both HTTPS');
  assert.equal(founders[0].initials,'AL');
  assert.equal(founders[1].photo,'','a portrait URL without a recorded source is never shown');
  assert.equal(founders[1].initials,'GB','initials use the first two name words');
  assert.equal(founders[2].photo,'');
  assert.equal(founders[2].initials,'NS');
  assert.equal(model.indexFounders(g).has('p1'),false,'people never key the index');
});

test('founder index covers the published graph without inventing photos (#415)',async()=>{
  const published=JSON.parse(await readFile('data/graph.json','utf8'));
  const index=model.indexFounders(published);
  assert.equal(index.size,54,'every startup but one has recorded founders');
  const entries=[...index.values()].flat();
  assert.equal(entries.length,124);
  assert.equal(entries.filter(founder=>founder.photo).length,88,'photo entries match the graph-held portraits');
  assert.equal(new Set(entries.filter(founder=>founder.photo).map(founder=>founder.id)).size,86,'across 86 distinct people');
  assert.equal([...index.values()].filter(founders=>founders.some(founder=>founder.photo)).length,47,'across 47 companies');
  const canva=index.get('startup:canva');
  assert.deepEqual(canva.map(founder=>founder.initials),['CA','CO','MP']);
  assert.ok(canva.every(founder=>founder.photo.endsWith('.png')));
  assert.ok(index.get('startup:superstat').every(founder=>founder.photo===''),'companies without recorded portraits fall back to initials');
});

test('tile founders render only on tiles large enough for the extra row (#415)',()=>{
  const founders=[{id:'p1',name:'Ada Lovelace',initials:'AL',photo:''}];
  assert.equal(model.tileFounders({width:128,height:236},founders),founders);
  assert.equal(model.tileFounders({width:100,height:120},founders),founders);
  assert.deepEqual(model.tileFounders({width:99,height:120},founders),[]);
  assert.deepEqual(model.tileFounders({width:100,height:119},founders),[]);
  assert.deepEqual(model.tileFounders({width:400,height:400},[]),[]);
  assert.deepEqual(model.tileFounders({width:400,height:400},undefined),[]);
  assert.deepEqual(model.tileFounders(null,founders),[]);
});
