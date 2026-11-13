import test from 'node:test';
import assert from 'node:assert/strict';
import {GitHubCatalogue} from '../src/github.mjs';

test('graph MCP search and startup read use one pinned repository revision',async()=>{
  const catalogue=new GitHubCatalogue('token');
  const data={entities:[{id:'startup:canva',kind:'startup',name:'Canva'},{id:'partner:airtree',kind:'partner',name:'Airtree'}],edges:[{from:'partner:airtree',to:'startup:canva',kind:'supports',source:'https://example.org'}],funding_rounds:[{startup_id:'startup:canva',currency:'USD',amount:200000000}],articles:[{startup_id:'startup:canva',url:'https://example.org/news'}]};
  catalogue.api=async()=>({object:{sha:'a'.repeat(40)}});
  catalogue.file=async(path,ref)=>{assert.equal(path,'data/graph.json');assert.equal(ref,'a'.repeat(40));return data;};
  const search=await catalogue.searchGraph('canva',10);assert.equal(search.entities[0].id,'startup:canva');assert.equal(search.revision,'a'.repeat(40));
  const result=await catalogue.getStartup('startup:canva');assert.equal(result.related_entities[0].name,'Airtree');assert.equal(result.funding_rounds[0].currency,'USD');assert.equal(result.articles.length,1);
  await assert.rejects(()=>catalogue.getStartup('partner:airtree'),/startup graph ID/);
  await assert.rejects(()=>catalogue.getStartup('startup:missing'),/not found/);
});
