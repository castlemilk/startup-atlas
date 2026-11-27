import { startupSourceCoverage } from '../backend/hosted/src/coverage.mjs';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';
import { entityDetails, fundingTimelineArticles, neighborhood, rankSearchResults, searchSnapshot, searchTier, slug, teamPersonId } from '../web/graph-model.js';

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
  assert.ok(graph.edges.some(x=>x.from==='person:elicia-mcdonald'&&x.to==='partner:airtree'&&x.kind==='team_member'));
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
  // The 2024 round's uncertainty is preserved: no amount or currency was
  // ever sourced for it, and the cohort listing itself is not a round
  // source. The cohort membership does, however, convert under #534 to
  // a separate Accelerator round carrying Startmate's published
  // standard-deal terms, sourced from the deal table — not the listing.
  const deeligence2024=deeligenceRounds.find(round=>round.id==='deeligence-2024-funding');
  assert.ok(!Object.hasOwn(deeligence2024,'currency')&&!Object.hasOwn(deeligence2024,'amount'));
  const deeligenceAccelerator=deeligenceRounds.find(round=>round.id==='deeligence-2026-startmate-accelerator');
  assert.ok(deeligenceAccelerator&&deeligenceAccelerator.amount===120000&&deeligenceAccelerator.currency==='AUD'&&deeligenceAccelerator.lead_investor==='Startmate'&&deeligenceAccelerator.source==='https://www.startmate.com/writing/startmate-accelerator-investment-terms-101');
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

test('Airwallex Series C keeps the announced round separate from cumulative funding and valuation bounds', async () => {
  const graph = JSON.parse(await readFile(new URL('../data/graph.json', import.meta.url), 'utf8'));
  const rounds = graph.funding_rounds.filter(r => r.startup_id === 'startup:airwallex');
  const seriesC = rounds.filter(r => r.stage_normalised === 'Series C');
  assert.equal(seriesC.length, 1);
  const [round] = seriesC;
  assert.deepEqual([round.id, round.announced_on, round.amount, round.currency, round.lead_investor], [
    'airwallex-2019-series-c', '2019-03-26', 100000000, 'USD', 'DST Global',
  ]);
  assert.equal(round.source, 'https://www.airwallex.com/global/newsroom/airwallex-unicorn-series-C-DST-100m');
  assert.equal(Object.hasOwn(round, 'valuation'), false);
  assert.match(round.note, /valuation over US\$1 billion/);
  assert.ok(graph.edges.some(e => e.round_id === round.id && e.from === 'partner:square-peg' && e.kind === 'participated_in'));
  assert.equal(rounds.filter(r => r.stage_normalised === 'Series D').length, 3);
});

test('Airwallex keeps its four early raises distinct and does not date historical mentions as announcements', async () => {
  const graph = JSON.parse(await readFile(new URL('../data/graph.json', import.meta.url), 'utf8'));
  const rounds = graph.funding_rounds.filter(r => r.startup_id === 'startup:airwallex');
  const early = rounds.filter(r => /^(Pre-Series A|Series A\+?|Series B)$/.test(r.stage));
  assert.deepEqual(early.map(r => [r.id, r.stage, r.announced_on ?? null, r.amount, r.currency]).sort(), [
    ['airwallex-2016-pre-series-a', 'Pre-Series A', '2016-07-05', 3000000, 'USD'],
    ['airwallex-2017-series-a', 'Series A', null, 13000000, 'USD'],
    ['airwallex-2017-series-a-plus', 'Series A+', '2017-12-13', 6000000, 'USD'],
    ['airwallex-2018-series-b', 'Series B', '2018-07-03', 80000000, 'USD'],
  ]);
  const [preA, a, aPlus, b] = ['airwallex-2016-pre-series-a', 'airwallex-2017-series-a', 'airwallex-2017-series-a-plus', 'airwallex-2018-series-b'].map(id => early.find(r => r.id === id));
  assert.equal(preA.stage_normalised, 'Pre-Series A');
  assert.equal(aPlus.stage_normalised, 'Series A');
  assert.equal(preA.lead_investor, 'Gobi Partners');
  assert.deepEqual(a.participants, ['Tencent Holdings', 'Sequoia Capital China', 'Mastercard']);
  assert.deepEqual(b.participants, ['Tencent', 'Sequoia China', 'Hillhouse', 'Horizons Ventures', 'Central Capital Ventura', 'Square Peg Capital']);
  assert.equal(b.lead_investor ?? null, null);
  for (const round of [aPlus, b]) {
    assert.ok(graph.edges.some(e => e.round_id === round.id && e.from === 'partner:square-peg' && e.kind === 'participated_in'));
  }
  assert.ok(rounds.every(r => ![19000000, 22000000, 102000000].includes(r.amount)));
  assert.equal(rounds.find(r => r.id === 'airwallex-2019-series-c').amount, 100000000);
});

test('co-founder edges connect every founder pair of a startup (#527)', async () => {
  const graph = JSON.parse(await readFile(new URL('../data/graph.json', import.meta.url), 'utf8'));
  const nodes = new Map(graph.entities.map(x => [x.id, x]));
  const foundersByStartup = new Map();
  for (const edge of graph.edges) {
    if (edge.kind !== 'founded') continue;
    const list = foundersByStartup.get(edge.to) || [];
    list.push(edge.from);
    foundersByStartup.set(edge.to, list);
  }
  const expected = new Set();
  for (const [startupId, founders] of foundersByStartup) {
    const unique = [...new Set(founders)].sort();
    for (let i = 0; i < unique.length; i++)
      for (let j = i + 1; j < unique.length; j++)
        expected.add(`${unique[i]}|${unique[j]}|${startupId}`);
  }
  const actual = graph.edges.filter(edge => edge.kind === 'co_founder');
  assert.equal(actual.length, expected.size);
  for (const edge of actual) {
    assert.ok(expected.has(`${edge.from}|${edge.to}|${edge.startup_id}`), `unexpected co-founder edge ${edge.from} -> ${edge.to}`);
    assert.equal(nodes.get(edge.from).kind, 'person');
    assert.equal(nodes.get(edge.to).kind, 'person');
    assert.ok(edge.from < edge.to);
    assert.equal(edge.description, `Co-founder of ${nodes.get(edge.startup_id).name}`);
    assert.match(edge.source, /^https:\/\//);
    assert.equal(typeof edge.confidence, 'number');
    assert.ok(edge.confidence >= 0.5);
    assert.equal(edge.confidence_basis.inferred, false);
  }
  // The Canva trio is fully connected, and Perkins/Obrecht carry one edge
  // per shared startup (Canva and Fusion Books).
  assert.equal(actual.filter(edge => edge.startup_id === 'startup:canva').length, 3);
  assert.equal(actual.filter(edge => edge.from === 'person:cliff-obrecht' && edge.to === 'person:melanie-perkins').length, 2);
  // A person's view surfaces the co-founder as a relationship.
  assert.ok(entityDetails(graph, 'person:melanie-perkins').related.some(x => x.id === 'person:cliff-obrecht'));
});

test('founder blurbs are sourced, dated and carried onto person entities (#528)', async () => {
  const graph = JSON.parse(await readFile(new URL('../data/graph.json', import.meta.url), 'utf8'));
  const research = JSON.parse(await readFile(new URL('../data/startup-research.json', import.meta.url), 'utf8'));
  const people = new Map(graph.entities.filter(x => x.kind === 'person').map(x => [x.name, x]));
  let recorded = 0;
  for (const startup of research.startups) {
    for (const founder of startup.founders || []) {
      if (!founder.blurb) continue;
      recorded++;
      const { text, sources, verified_at } = founder.blurb;
      assert.ok(typeof text === 'string' && text.length > 0 && text.length <= 1000, `${founder.name} blurb text`);
      assert.ok(Array.isArray(sources) && sources.length >= 1 && sources.length <= 10, `${founder.name} blurb sources`);
      for (const source of sources) assert.match(source, /^https:\/\//);
      assert.match(verified_at, /^\d{4}-\d{2}-\d{2}$/);
      // The graph entity carries the reviewed blurb unchanged.
      assert.deepEqual(people.get(founder.name)?.blurb, founder.blurb, `${founder.name} blurb reaches the graph`);
    }
  }
  assert.ok(recorded >= 11, `expected the first enrichment tranche, found ${recorded}`);
  // The Alloovium founders Ben named are all enriched.
  for (const name of ['Cielo Nicolosi', 'Omar Elloumi', 'Zander Schweitzer'])
    assert.ok(people.get(name)?.blurb?.text.includes('Alloovium'), `${name} has an Alloovium blurb`);
  // No person outside the founder records carries a blurb in this slice.
  for (const person of people.values())
    if (person.blurb) assert.ok(person.id.startsWith('person:') && !person.id.includes('--'), `${person.id} blurb is on a canonical person`);
});

test('curated funding rounds reach the graph unchanged, with no phantom rounds (#529)', async () => {
  const graph = JSON.parse(await readFile(new URL('../data/graph.json', import.meta.url), 'utf8'));
  const research = JSON.parse(await readFile(new URL('../data/startup-research.json', import.meta.url), 'utf8'));
  // The fields a reviewer curates on a round. The graph builder carries a
  // research round verbatim (plus startup_id and derived fields such as
  // participants), so every curated value must survive generation exactly:
  // a published round that drops or zeroes the amount, moves the date or
  // loses the lead investor is the #529 failure mode, for any startup.
  const curatedFields = ['stage', 'announced_on', 'amount', 'currency', 'amount_text',
    'valuation', 'valuation_currency', 'lead_investor', 'lead_investors', 'source'];
  const graphRounds = new Map(graph.funding_rounds.map(round => [round.id, round]));
  let recorded = 0;
  for (const startup of research.startups) {
    const startupId = `startup:${slug(startup.name)}`;
    for (const round of startup.funding_rounds || []) {
      if ('superseded_by' in round) continue;
      recorded++;
      const published = graphRounds.get(round.id);
      assert.ok(published, `${startup.name} round ${round.id} is missing from the graph`);
      assert.equal(published.startup_id, startupId, `${round.id} is attached to the wrong startup`);
      for (const field of curatedFields) {
        if (field in round) assert.deepEqual(published[field], round[field],
          `${round.id} ${field} changed between the research record and the graph`);
      }
      graphRounds.delete(round.id);
    }
  }
  assert.ok(recorded > 0, 'expected curated funding rounds in the research data');
  // Anything left in the graph has no curated source record: a phantom round
  // (e.g. a second, cohort-derived $0 round shadowing the curated one).
  assert.deepEqual([...graphRounds.keys()], [], 'graph carries funding rounds with no research record');
  // The case Ben flagged: Alloovium's two accelerator rounds publish with
  // their sourced amounts and organisers named.
  const alloovium = graph.funding_rounds.filter(round => round.startup_id === 'startup:alloovium');
  assert.deepEqual(alloovium.map(round => [round.id, round.amount, round.currency, round.announced_on, round.lead_investor]), [
    ['alloovium-2026-startmate-accelerator', 120000, 'AUD', '2026-02-17', 'Startmate'],
    ['alloovium-2026-y-combinator-accelerator', 500000, 'USD', '2026-06-05', 'Y Combinator'],
  ]);
});

test('search ranking policy orders exact, alias, prefix, name-term and context matches (#76)',()=>{
  const entities=[
    {id:'startup:context',kind:'startup',name:'Zebra Health',summary:'Backed by Airtree in 2024.'},
    {id:'partner:airtree-ventures',kind:'partner',name:'Airtree Ventures',aliases:['Airtree'],summary:'Venture capital.'},
    {id:'startup:air',kind:'startup',name:'Air',summary:'Workflow software.'},
    {id:'startup:airborne',kind:'startup',name:'Airborne Labs',summary:'Drones.'},
    {id:'person:air',kind:'person',name:'Air',summary:'Founder.'},
  ];
  const graph={entities,edges:[],funding_rounds:[],articles:[]};
  // Exact alias (tier 1) beats a connection/summary-only mention (tier 5),
  // and the fallback now finds alias matches at all (parity with SQLite).
  assert.equal(searchSnapshot(graph,'airtree')[0].id,'partner:airtree-ventures');
  assert.equal(searchTier(entities[1],'airtree'),1);
  assert.equal(searchTier(entities[0],'airtree'),5);
  // Exact name (tier 0) leads; within the tier startups precede people.
  assert.deepEqual(searchSnapshot(graph,'air').map(x=>x.id),
    ['startup:air','person:air','startup:airborne','partner:airtree-ventures','startup:context']);
  assert.equal(searchTier(entities[2],'air'),0);
  assert.equal(searchTier(entities[3],'air'),2);
  // Every term in the name (tier 3) beats a summary-only match (tier 5).
  assert.equal(searchTier({name:'Labs Airborne'},'airborne labs'),3);
  assert.equal(searchTier({name:'Other',aliases:['Airtree Ventures Fund']},'airtree'),4);
  // rankSearchResults is deterministic regardless of input order.
  const shuffled=[entities[4],entities[0],entities[3],entities[1],entities[2]];
  assert.deepEqual(rankSearchResults(shuffled,'air').map(x=>x.id),
    rankSearchResults(entities,'air').map(x=>x.id));
});
