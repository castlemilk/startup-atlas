import test from 'node:test';
import assert from 'node:assert/strict';
import {GitHubCatalogue} from '../src/github.mjs';

test('graph MCP reads the published revision and searches sourced relationships',async()=>{
  const head='a'.repeat(40), data={source_revision:head,entities:[{id:'startup:canva',kind:'startup',name:'Canva'},{id:'partner:airtree',kind:'partner',name:'Airtree'}],edges:[{from:'partner:airtree',to:'startup:canva',kind:'supports',source:'https://example.com'}],funding_rounds:[{startup_id:'startup:canva',stage:'Series A',currency:'USD',amount:200000000}],articles:[{startup_id:'startup:canva',title:'Funding',url:'https://example.com/news'}]};
  const calls=[];
  const catalogue=new GitHubCatalogue('token',{fetcher:async(url,init)=>{calls.push({url,init});return Response.json(data);}});
  catalogue.api=async()=>({object:{sha:head}});
  const search=await catalogue.searchGraph('airtree',10);
  assert.deepEqual(search.entities.map(e=>e.name),['Airtree','Canva']);
  assert.equal(search.revision,head);assert.equal(search.indexStatus,'current');
  assert.equal(calls[0].init.headers.Authorization,undefined);
  assert.equal(calls[0].init.redirect,'manual');
  const result=await catalogue.getStartup('startup:canva');
  assert.equal(result.related_entities[0].name,'Airtree');assert.equal(result.funding_rounds[0].currency,'USD');assert.equal(result.articles.length,1);
  data.source_revision='b'.repeat(40);
  assert.equal((await catalogue.searchGraph('canva')).indexStatus,'pending_publication');
  await assert.rejects(()=>catalogue.getStartup('partner:airtree'),/startup graph ID/);
  await assert.rejects(()=>catalogue.getStartup('startup:missing'),/not found/);
});
