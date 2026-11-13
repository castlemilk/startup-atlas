import {readFile} from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';
import { entityDetails, neighborhood, searchSnapshot, teamPersonId } from '../web/graph-model.js';

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
  assert.equal(graph.funding_rounds.some(round=>round.startup_id==='startup:deeligence'),false);
  const flowgoFounders=entityDetails(graph,'startup:flowgo').edges.filter(edge=>edge.kind==='founded');
  assert.deepEqual(flowgoFounders.map(edge=>edge.from).sort(),['person:anthony-see','person:jason-hor']);
  assert.ok(flowgoFounders.every(edge=>edge.source==='https://www.startmate.com/writing/a-500-order-starts-as-a-whatsapp-message-flowgo-handles-the-rest'));
  assert.ok(!flowgoFounders.some(edge=>edge.from==='person:jason-cai'));
  assert.ok(searchSnapshot(graph,'Jason Hor').some(entity=>entity.id==='startup:flowgo'));
  assert.ok(entityDetails(graph,'startup:zabidou').edges.some(edge=>edge.from==='person:cibby-pulikkaseril'&&edge.kind==='founded'));
  assert.equal(entityDetails(graph,'startup:zabidou').edges.some(edge=>edge.from==='person:nathan-kirchner'&&edge.kind==='founded'),false);
});
