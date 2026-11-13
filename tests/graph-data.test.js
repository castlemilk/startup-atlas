import {readFile} from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';

test('generated graph keeps startup, founder and historical funding evidence connected',async()=>{
  const graph=JSON.parse(await readFile(new URL('../data/graph.json',import.meta.url),'utf8'));
  const nodes=new Map(graph.entities.map(x=>[x.id,x]));
  assert.equal(nodes.get('startup:canva').name,'Canva');
  assert.ok(graph.edges.some(x=>x.from==='person:melanie-perkins'&&x.to==='startup:canva'&&x.source.startsWith('https://')));
  assert.ok(graph.edges.some(x=>x.from==='partner:airtree'&&x.to==='startup:canva'&&x.source.startsWith('https://')));
  const round=graph.funding_rounds.find(x=>x.id==='airwallex-2025-series-f');
  assert.equal(round.amount,300000000);assert.equal(round.currency,'USD');assert.match(round.note,/secondary/i);
  const seriesH=graph.funding_rounds.find(x=>x.id==='airwallex-2026-series-h');
  assert.equal(seriesH.amount,320000000);assert.equal(seriesH.valuation,11000000000);assert.equal(seriesH.currency,'USD');
  for(const edge of graph.edges){assert.ok(nodes.has(edge.from)&&nodes.has(edge.to));assert.match(edge.source,/^https:\/\//);}
});
