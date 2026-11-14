import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorker} from '../src/worker.mjs';
import {OAuthStore} from '../src/storage.mjs';
import {OWNER_ID,seal} from '../src/common.mjs';
import {environment,tokenResponse} from './helpers.mjs';

test('authenticated MCP validates and proposes a startup update without publishing it',async()=>{
  const env=environment(),store=new OAuthStore(env.DB),{version}=await store.beginAuth('owner');
  await store.save('owner',await seal({accessToken:tokenResponse.access_token,refreshToken:tokenResponse.refresh_token,
    expiresAt:Date.now()+3600000,refreshExpiresAt:Date.now()+7200000,githubUserId:OWNER_ID,installationId:42},env,'connection:owner'),version);
  const head='a'.repeat(40),calls=[];
  const records={
    'data/startup-research.json':{reviewed:'2025-01-01',startups:[{name:'Example',description:'Existing company',website:'https://example.com/',source:'https://example.com/',founders:[{name:'Pat Founder',source:'https://example.com/team'}]}]},
    'data/graph.json':{entities:[{id:'startup:example',name:'Example',kind:'startup'}]},
    'data/partner-leads.json':[], 'data/catalogue.json':{opportunities:[]},
  };
  const fetcher=async(target,init={})=>{
    const url=new URL(target),method=init.method||'GET',path=url.pathname.replace('/repos/castlemilk/startup-atlas','');
    assert.equal(url.origin,'https://api.github.com');
    const body=init.body?JSON.parse(init.body):null;calls.push({path,method,body});
    if(path==='/git/ref/heads/main')return Response.json({object:{sha:head}});
    if(path.startsWith('/contents/')){const data=records[path.slice('/contents/'.length)];assert.equal(url.searchParams.get('ref'),head);return Response.json({type:'file',encoding:'base64',size:100,content:Buffer.from(JSON.stringify(data)).toString('base64')});}
    if(path.startsWith('/git/ref/heads/'))return new Response(null,{status:404});
    if(path===`/git/commits/${head}`)return Response.json({tree:{sha:'base-tree'}});
    if(path==='/git/trees')return Response.json({sha:'new-tree'});
    if(path==='/git/commits')return Response.json({sha:'b'.repeat(40)});
    if(path==='/git/refs')return Response.json({ref:body.ref});
    if(path==='/pulls'&&method==='GET')return Response.json([]);
    if(path==='/pulls')return Response.json({html_url:'https://github.com/castlemilk/startup-atlas/pull/999'});
    throw new Error(`Unexpected ${method} ${path}`);
  };
  const worker=createWorker({fetcher});
  const call=async(name,args)=>{
    const request=new Request('https://atlas.example.com/mcp',{method:'POST',headers:{'oai-authenticated-user-id':'owner','Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})});
    return (await (await worker.fetch(request,env)).json()).result;
  };
  const record={name:'Example',source:'https://example.com/news',reviewed_at:'2026-01-01',funding_rounds:[{id:'example-series-a',stage:'Series A',amount:2000000,currency:'AUD',source:'https://example.com/news'}]};
  const validation=await call('atlas_validate_startup',{record});
  assert.equal(validation.structuredContent.revision,head);
  assert.equal(validation.structuredContent.merged.founders[0].name,'Pat Founder');
  const proposal=await call('atlas_propose_startup',{record,expectedRevision:head});
  assert.equal(proposal.structuredContent.status,'proposed');assert.equal(proposal.structuredContent.published,false);
  assert.deepEqual(calls.find(x=>x.path==='/git/trees').body.tree.map(x=>x.path),['data/startup-research.json']);
  assert.equal(calls.find(x=>x.path==='/pulls'&&x.method==='POST').body.draft,true);
  assert.doesNotMatch(JSON.stringify(proposal),/ghu_test_not_real|ghr_test_not_real/);
});
