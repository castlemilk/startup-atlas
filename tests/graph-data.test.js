import {readFile} from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';
import { entityDetails, neighborhood, searchSnapshot, teamPersonId } from '../graph-model.js';

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
