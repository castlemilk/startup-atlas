import assert from 'node:assert/strict';
import test from 'node:test';
import { createWorker } from '../src/worker.mjs';
import { OWNER_ID, seal } from '../src/common.mjs';
import { OAuthStore } from '../src/storage.mjs';
import { environment, tokenResponse } from './helpers.mjs';

const head='a'.repeat(40);
const graph={
  source_revision:'b'.repeat(40),
  entities:[
    {id:'startup:canva',kind:'startup',name:'Canva',source:'https://example.com/about#intro',profile_facts:[{label:'Headquarters',value:'Australia',source:'https://example.com/about#location'}]},
    {id:'startup:example',kind:'startup',name:'Example <Research>'},
    {id:'person:founder',kind:'person',name:'Founder'},
  ],
  edges:[{from:'person:founder',to:'startup:canva',kind:'founded',source:'https://example.com/founders'}],
  funding_rounds:[{startup_id:'startup:canva',source:'https://example.com/funding'}],
  articles:[],
};

function fetchCoverage(worker,env,search='',user='owner') {
  return worker.fetch(new Request(`https://atlas.example.com/coverage${search}`,{
    headers:user ? {'oai-authenticated-user-id':user} : {},
  }),env);
}

async function connect(env) {
  const store=new OAuthStore(env.DB);
  const {version}=await store.beginAuth('owner');
  const payload=await seal({accessToken:tokenResponse.access_token,refreshToken:tokenResponse.refresh_token,
    expiresAt:Date.now()+3600000,refreshExpiresAt:Date.now()+7200000,githubUserId:OWNER_ID,installationId:42},env,'connection:owner');
  await store.save('owner',payload,version);
}

test('coverage requires a private Site identity and the caller’s existing repository connection',async()=>{
  const env=environment();
  let calls=0;
  const worker=createWorker({fetcher:async()=>{calls++; throw new Error('unexpected upstream request');}});
  const signedOut=await fetchCoverage(worker,env,'',null);
  assert.equal(signedOut.status,401);
  assert.equal((await signedOut.json()).code,'SIGN_IN_REQUIRED');
  await connect(env);
  const unconnected=await fetchCoverage(worker,env,'','another-user');
  assert.equal(unconnected.status,401);
  assert.match(await unconnected.text(),/Connect GitHub to review evidence coverage/);
  assert.equal(calls,0);
});

test('coverage reports the published revision, deduplicates source counts and filters gaps',async()=>{
  const env=environment();
  await connect(env);
  const calls=[];
  const worker=createWorker({fetcher:async(url,init)=>{
    calls.push({url,init});
    return url.startsWith('https://api.github.com/') ? Response.json({object:{sha:head}}) : Response.json(graph);
  }});
  const reply=await fetchCoverage(worker,env);
  const html=await reply.text();
  assert.equal(reply.status,200);
  assert.equal(reply.headers.get('Cache-Control'),'no-store');
  assert.match(html,/Published graph differs from main/);
  assert.match(html,/Showing 1–2 of 2 companies/);
  assert.match(html,/Example &lt;Research&gt;/);
  assert.match(html,/id=startup%3Acanva#entity-sources/);
  assert.match(html,/data-company-id="startup:canva"[\s\S]*data-group="profile" data-count="1"[\s\S]*data-group="founders" data-count="1"[\s\S]*data-group="funding" data-count="1"/);
  assert.equal(calls.length,2);
  assert.equal(calls[1].init.headers.Authorization,undefined);
  const filtered=await (await fetchCoverage(worker,env,'?gap=founders&q=example')).text();
  assert.match(filtered,/Showing 1–1 of 1 company/);
  assert.match(filtered,/data-company-id="startup:example"/);
  assert.doesNotMatch(filtered,/data-company-id="startup:canva"/);
  const empty=await (await fetchCoverage(worker,env,'?q=%22%3E%3Cscript%3E')).text();
  assert.match(empty,/No companies match these filters/);
  assert.doesNotMatch(empty,/<script>/);
});

test('coverage distinguishes upstream failure from empty coverage',async()=>{
  const env=environment();
  await connect(env);
  const worker=createWorker({fetcher:async(url)=>url.startsWith('https://api.github.com/') ? Response.json({object:{sha:head}}) : new Response('Unavailable',{status:503})});
  const reply=await fetchCoverage(worker,env);
  assert.equal(reply.status,503);
  const html=await reply.text();
  assert.match(html,/coverage report is temporarily unavailable/);
  assert.doesNotMatch(html,/No companies match/);
});
