import test from 'node:test';
import assert from 'node:assert/strict';
import {GitHubCatalogue} from '../src/github.mjs';
import {createWorker} from '../src/worker.mjs';
import {OAuthStore} from '../src/storage.mjs';
import {OWNER_ID,seal} from '../src/common.mjs';
import {environment,tokenResponse} from './helpers.mjs';

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

test('graph search paginates a stable snapshot and rejects stale or malformed cursors',async()=>{
  const head='a'.repeat(40), data={source_revision:head,entities:Array.from({length:205},(_,i)=>({id:`startup:${i}`,kind:'startup',name:`Company ${String(i).padStart(3,'0')}`})),edges:[],funding_rounds:[],articles:[]};
  const catalogue=new GitHubCatalogue('token',{fetcher:async()=>Response.json(data)});
  catalogue.api=async()=>({object:{sha:head}});
  const first=await catalogue.searchGraph('',100);
  const second=await catalogue.searchGraph('',100,first.nextCursor);
  const third=await catalogue.searchGraph('',100,second.nextCursor);
  const ids=[...first.entities,...second.entities,...third.entities].map(e=>e.id);
  assert.equal(first.total,205); assert.equal(ids.length,205); assert.equal(new Set(ids).size,205); assert.equal(third.nextCursor,null);
  await assert.rejects(()=>catalogue.searchGraph('Company',100,first.nextCursor),/snapshot or query changed/);
  await assert.rejects(()=>catalogue.searchGraph('',100,'invalid'),/Invalid graph search cursor/);
  data.entities[0].name='Changed';
  await assert.rejects(()=>catalogue.searchGraph('',100,first.nextCursor),/snapshot or query changed/);
});

test('authenticated MCP exposes and forwards graph cursors',async()=>{
  const env=environment(), store=new OAuthStore(env.DB), {version}=await store.beginAuth('owner');
  await store.save('owner',await seal({accessToken:tokenResponse.access_token,refreshToken:tokenResponse.refresh_token,expiresAt:Date.now()+3600000,refreshExpiresAt:Date.now()+7200000,githubUserId:OWNER_ID,installationId:42},env,'connection:owner'),version);
  const head='a'.repeat(40),graph={source_revision:head,entities:Array.from({length:101},(_,i)=>({id:`startup:${i}`,kind:'startup',name:`Company ${i}`})),edges:[],funding_rounds:[],articles:[]};
  const worker=createWorker({fetcher:async url=>url.startsWith('https://api.github.com/')?Response.json({object:{sha:head}}):Response.json(graph)});
  const rpc=async(method,params)=> (await (await worker.fetch(new Request('https://atlas.example.com/mcp',{method:'POST',headers:{'oai-authenticated-user-id':'owner','Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})}),env)).json()).result;
  const list=await rpc('tools/list');
  assert.equal(list.tools.find(t=>t.name==='atlas_search_graph').inputSchema.properties.cursor.type,'string');
  const first=await rpc('tools/call',{name:'atlas_search_graph',arguments:{limit:100}});
  const second=await rpc('tools/call',{name:'atlas_search_graph',arguments:{limit:100,cursor:first.structuredContent.nextCursor}});
  assert.equal(first.structuredContent.entities.length,100); assert.equal(second.structuredContent.entities.length,1); assert.equal(second.structuredContent.nextCursor,null);
  graph.entities.pop();
  const stale=await rpc('tools/call',{name:'atlas_search_graph',arguments:{cursor:first.structuredContent.nextCursor}});
  assert.equal(stale.isError,true); assert.match(stale.content[0].text,/STALE_CURSOR/);
});
