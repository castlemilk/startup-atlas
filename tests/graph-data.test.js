import { startupSourceCoverage } from '../backend/hosted/src/coverage.mjs';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';
import { entityDetails, fundingTimelineArticles, neighborhood, searchSnapshot, teamPersonId } from '../web/graph-model.js';

test('funding timeline keeps reviewed evidence and hides duplicate round links', () => {
  const source = 'https://example.com/closed-offer';
  const legacy = { url: source, kind: 'funding announcement' };
  const fallback = { url: source, kind: 'funding source' };
  const reviewed = { url: source, kind: 'equity crowdfunding close record' };
  const separate = { url: 'https://example.com/another-announcement', kind: 'funding announcement' };
  const insecure = { url: 'http://example.com/http', kind: 'news' };
  assert.deepEqual(fundingTimelineArticles([legacy, fallback, reviewed, separate, insecure], [{source}]), [reviewed, separate]);
});

test('coverage counts distinct source documents for each type of startup evidence',()=>{
  const coverage=startupSourceCoverage({
    entities:[
      {id:'startup:one',kind:'startup',source:'https://company.example/about#overview',profile_facts:[
        {label:'Founded',value:'2014',source:'https://company.example/about#history'},
        {label:'Office',value:'Melbourne',source:'https://company.example/office'},
        {label:'Sector',value:'',source:'https://company.example/news'},
      ]},
      {id:'startup:two',kind:'startup',source:'http://company.example/'},
      {id:'person:one',kind:'person'},
      {id:'person:two',kind:'person'},
      {id:'partner:one',kind:'partner'},
    ],
    edges:[
      {from:'person:one',to:'startup:one',kind:'founded',source:'https://company.example/team'},
      {from:'person:two',to:'startup:one',kind:'founded',source:'https://company.example/team'},
      {from:'person:two',to:'startup:one',kind:'team_member',source:'https://company.example/new-hire'},
      {from:'partner:one',to:'startup:one',kind:'founded',source:'https://partner.example/'},
    ],
    funding_rounds:[
      {startup_id:'startup:one',source:'https://company.example/round'},
      {startup_id:'startup:one',source:'https://company.example/round#details'},
      {startup_id:'startup:one',source:''},
    ],
  });
  assert.deepEqual([...coverage],[['startup:one',{profile:2,founders:1,funding:1}],['startup:two',{profile:0,founders:0,funding:0}]]);
});

test('generated graph keeps startup, founder and historical funding evidence connected',async()=>{
  const graph=JSON.parse(await readFile(new URL('../data/graph.json',import.meta.url),'utf8'));
  const nodes=new Map(graph.entities.map(x=>[x.id,x]));
  assert.equal(nodes.get('startup:canva').name,'Canva');
  assert.ok(graph.edges.some(x=>x.from==='person:melanie-perkins'&&x.to==='startup:canva'&&x.source.startsWith('https://')));
  assert.ok(graph.edges.some(x=>x.from==='partner:airtree'&&x.to==='startup:canva'&&x.source.startsWith('https://')));
  assert.ok(graph.edges.some(x=>x.from==='provider:startmate'&&x.to==='programme:startmate'&&x.kind==='offers'));
  assert.ok(graph.edges.some(x=>x.from===teamPersonId('Elicia McDonald','Airtree')&&x.to==='partner:airtree'&&x.kind==='team_member'));
  assert.ok(entityDetails(graph,'person:melanie-perkins').related.some(x=>x.id==='startup:canva'));
  assert.ok(entityDetails(graph,'person:melanie-perkins').related.some(x=>x.id==='startup:fusion-books'));
  assert.ok(searchSnapshot(graph,'Melanie Perkins').some(x=>x.id==='person:melanie-perkins'));
  const view=neighborhood(graph,'startup:canva',{depth:1});
  assert.ok(view.nodes.some(x=>x.id==='person:melanie-perkins'));
  assert.ok(view.nodes.some(x=>x.id==='partner:airtree'));
  assert.ok(neighborhood(graph,'startup:canva',{depth:2}).nodes.some(x=>x.id==='startup:fusion-books'));
  assert.ok(neighborhood(graph,'startup:canva',{depth:2,limit:13}).nodes.some(x=>x.id==='startup:fusion-books'));
  assert.ok(view.edges.every(x=>view.nodes.some(n=>n.id===x.from)&&view.nodes.some(n=>n.id===x.to)));
  assert.ok(!neighborhood(graph,'startup:canva',{kinds:['partner']}).nodes.some(x=>x.kind==='person'));
  assert.throws(()=>neighborhood(graph,'person:missing'),/not found/);
  const round=graph.funding_rounds.find(x=>x.id==='airwallex-2025-series-f');
  assert.equal(round.amount,300000000);assert.equal(round.currency,'USD');assert.match(round.note,/secondary/i);
  const seriesH=graph.funding_rounds.find(x=>x.id==='airwallex-2026-series-h');
  assert.equal(seriesH.amount,320000000);assert.equal(seriesH.valuation,11000000000);assert.equal(seriesH.currency,'USD');
  for(const edge of graph.edges){assert.ok(nodes.has(edge.from)&&nodes.has(edge.to));assert.match(edge.source,/^https:\/\//);}
});

test('reviewed accelerator cohort connects partner, startup and founders with evidence',async()=>{
  const graph=JSON.parse(await readFile(new URL('../data/graph.json',import.meta.url),'utf8'));
  const cohort='https://www.startmate.com/writing/meet-our-summer26-accelerator-cohort';
  const partner=entityDetails(graph,'partner:startmate');
  assert.ok(partner.edges.some(edge=>edge.to==='startup:deeligence'&&edge.source===cohort&&edge.description.includes('cohort')));
  const founder=entityDetails(graph,'person:elena-tsalanidis');
  assert.ok(founder.edges.some(edge=>edge.to==='startup:deeligence'&&edge.kind==='founded'&&edge.source==='https://www.deeligence.com/about'));
  assert.ok(searchSnapshot(graph,'Elena Tsalanidis').some(entity=>entity.id==='startup:deeligence'));
  assert.ok(neighborhood(graph,'partner:startmate',{depth:2,limit:60}).nodes.some(entity=>entity.id==='person:elena-tsalanidis'));
  const deeligenceRounds=graph.funding_rounds.filter(round=>round.startup_id==='startup:deeligence');
  assert.equal(deeligenceRounds.some(round=>round.source===cohort),false);
  assert.ok(deeligenceRounds.some(round=>round.id==='deeligence-2024-funding'&&round.source==='https://launchvic.org/case-studies/the-legaltech-startup-revolutionising-due-diligence-with-ai/'));
  assert.ok(deeligenceRounds.every(round=>!Object.hasOwn(round,'currency')&&!Object.hasOwn(round,'amount')));
  const flowgoFounders=entityDetails(graph,'startup:flowgo').edges.filter(edge=>edge.kind==='founded');
  assert.deepEqual(flowgoFounders.map(edge=>edge.from).sort(),['person:anthony-see','person:jason-hor']);
  assert.ok(flowgoFounders.every(edge=>edge.source==='https://www.startmate.com/writing/a-500-order-starts-as-a-whatsapp-message-flowgo-handles-the-rest'));
  assert.ok(!flowgoFounders.some(edge=>edge.from==='person:jason-cai'));
  assert.ok(searchSnapshot(graph,'Jason Hor').some(entity=>entity.id==='startup:flowgo'));
  assert.ok(entityDetails(graph,'startup:zabidou').edges.some(edge=>edge.from==='person:cibby-pulikkaseril'&&edge.kind==='founded'));
  assert.equal(entityDetails(graph,'startup:zabidou').edges.some(edge=>edge.from==='person:nathan-kirchner'&&edge.kind==='founded'),false);
});

test('Cuttable seed history separates the initial round and extension from the combined total', async () => {
  const graph = JSON.parse(await readFile(new URL('../data/graph.json', import.meta.url), 'utf8'));
  const profile = entityDetails(graph, 'startup:cuttable');
  const original = 'https://www.squarepeg.vc/blog/investment-notes-cuttable-au-5-5m-seed';
  const extension = 'https://www.linkedin.com/posts/cuttable_cuttable-test-faster-grow-faster-activity-7360467697383469056-464t';
  assert.deepEqual(profile.rounds.filter(r => [original, extension].includes(r.source))
    .map(({id, stage, amount, currency, announced_on, source}) => [id, stage, amount, currency, announced_on, source]), [
    ['cuttable-2024-seed', 'Seed', 5500000, 'AUD', '2024-07-23', original],
    ['cuttable-2025-seed-extension', 'Seed extension', 4500000, 'AUD', '2025-08-11', extension],
  ]);
  assert.ok(!profile.rounds.some(r => r.announced_on === '2025-08-11' && r.amount === 10000000 && r.currency === 'AUD'));
  assert.ok(profile.articles.some(a => a.url === 'https://rampersand.substack.com/p/investment-notes-cuttable'));
  assert.ok(profile.articles.some(a => a.url === 'https://www.marketing-interactive.com/cuttable-raises-10m-to-launch-ai-driven-creative-platform-for-ecommerce-brands'));
});

test('Airwallex Series D has three distinct source-backed tranches, not cumulative totals', async () => {
  const graph = JSON.parse(await readFile(new URL('../data/graph.json', import.meta.url), 'utf8'));
  const rounds = graph.funding_rounds.filter(r => r.startup_id === 'startup:airwallex');
  const seriesD = rounds.filter(r => r.stage_normalised === 'Series D').sort((a, b) => a.announced_on.localeCompare(b.announced_on));
  const newsroom = 'https://www.airwallex.com/global/newsroom/';
  assert.deepEqual(seriesD.map(r => [r.announced_on, r.amount, r.currency, r.stage, r.source]), [
    ['2020-04-16', 160000000, 'USD', 'Series D', newsroom + 'airwallex-closes-usd160m-in-record-fundraising-round-to-date'],
    ['2020-09-29', 40000000, 'USD', 'Series D extension', newsroom + 'airwallexs-extended-series-d-fundraising-brings-total-round-to-usd200m'],
    ['2021-03-24', 100000000, 'USD', 'Series D extension', newsroom + 'airwallexs-latest-capital-puts-valuation-at-usd-2-6-billion'],
  ]);
  assert.equal(seriesD.reduce((sum, round) => sum + round.amount, 0), 300000000);
  assert.equal(seriesD[2].lead_investor, 'Greenoaks');
  assert.equal(rounds.find(r => r.id === 'airwallex-2025-series-f').amount, 300000000);
});

test('Airwallex distinguishes two same-sized Series E extensions and their valuations', async () => {
  const graph = JSON.parse(await readFile(new URL('../data/graph.json', import.meta.url), 'utf8'));
  const rounds = graph.funding_rounds.filter(r => r.startup_id === 'startup:airwallex');
  const seriesE = rounds.filter(r => r.stage_normalised === 'Series E')
    .sort((a, b) => a.announced_on.localeCompare(b.announced_on));
  assert.deepEqual(seriesE.map(r => [r.announced_on, r.amount, r.currency, r.valuation, r.valuation_currency]), [
    ['2021-09-20', 200000000, 'USD', 4000000000, 'USD'],
    ['2021-11-18', 100000000, 'USD', 5500000000, 'USD'],
    ['2022-10-11', 100000000, 'USD', 5600000000, 'USD'],
  ]);
  assert.equal(new Set(seriesE.map(r => r.source)).size, 3);
  assert.ok(seriesE.every(r => r.source.startsWith('https://www.airwallex.com/global/newsroom/')));
  assert.equal(seriesE[1].lead_investor, 'Lone Pine Capital');
  assert.equal(seriesE[2].lead_investor, undefined);
  assert.ok(seriesE[2].participants.includes('Square Peg'));
  assert.equal(rounds.filter(r => r.stage_normalised === 'Series D').length, 3);
});

test('Forerunner Ventures resolves to the canonical Series A lead for Andromeda Robotics', async () => {
  const graph = JSON.parse(await readFile(new URL('../data/graph.json', import.meta.url), 'utf8'));
  const roundId = 'andromeda-2025-09-aud-series-a';
  const node = graph.entities.find(x => x.id === 'partner:forerunner');
  assert.ok(node.aliases.includes('Forerunner Ventures'));
  assert.ok(!graph.entities.some(x => x.id === 'partner:forerunner-ventures'));
  const round = graph.funding_rounds.find(x => x.id === roundId);
  assert.equal(round.lead_investor, 'Forerunner Ventures');
  const lead = graph.edges.filter(x => x.kind === 'led_round' && x.round_id === roundId);
  assert.deepEqual(lead.map(x => [x.from, x.to, x.source]), [
    ['partner:forerunner', 'startup:andromeda-robotics', round.source],
  ]);
});

test('reviewed Salesforce Ventures resolves only the explicitly sourced funding roles', async () => {
  const graph = JSON.parse(await readFile(new URL('../data/graph.json', import.meta.url), 'utf8'));
  const id = 'partner:salesforce-ventures';
  const nodes = graph.entities.filter(node => node.id === id);
  assert.equal(nodes.length, 1);
  assert.equal(nodes[0].website, 'https://salesforceventures.com/');
  const related = graph.edges.filter(edge => edge.from === id && ['led_round', 'participated_in'].includes(edge.kind));
  const reviewedRoles = [
    ['airwallex-2020-series-d', 'startup:airwallex', 'participated_in'],
    ['airwallex-2021-series-e', 'startup:airwallex', 'participated_in'],
    ['airwallex-2022-series-e2', 'startup:airwallex', 'participated_in'],
    ['airwallex-2025-series-f', 'startup:airwallex', 'participated_in'],
    ['q-ctrl-2026-series-c', 'startup:q-ctrl', 'led_round'],
  ];
  for (const [id, startup, kind] of reviewedRoles) {
    const round = graph.funding_rounds.find(round => round.id === id);
    const matching = related.filter(edge => edge.round_id === id);
    assert.deepEqual(matching.map(edge => [edge.to, edge.kind, edge.source]), [[startup, kind, round.source]]);
  }
  assert.equal(related.some(edge => edge.round_id === 'airwallex-2021-series-e1'), false);
});
