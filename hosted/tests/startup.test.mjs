import test from 'node:test';
import assert from 'node:assert/strict';
import {GitHubCatalogue} from '../src/github.mjs';

const head='a'.repeat(40);
const before={name:'Example',description:'A source-backed company',website:'https://example.com/',source:'https://example.com/about',founders:[{name:'Pat Founder',source:'https://example.com/about'}],funding_rounds:[{id:'example-seed',stage:'Seed',amount:500000,currency:'AUD',source:'https://example.com/seed'}]};
const update={name:'Example',source:'https://example.com/news',reviewed_at:'2026-01-01',funding_rounds:[{id:'example-series-a',stage:'Series A',amount:2000000,currency:'AUD',announced_on:'2025-01-02',source:'https://example.com/news'}]};
function fixture(){
  const calls=[],state={head,existing:false},client=new GitHubCatalogue('fake');
  client.file=async(path,ref)=>{assert.equal(ref,head);if(path==='data/startup-research.json')return {reviewed:'2025-01-01',startups:[structuredClone(before)]};if(path==='data/graph.json')return {entities:[{id:'startup:example',name:'Example',kind:'startup'}]};if(path==='data/partner-leads.json')return ['Acme Ventures'];if(path==='data/catalogue.json')return {opportunities:[]};throw new Error(path);};
  client.api=async(path,options={})=>{
    calls.push({path,...options});
    if(path==='/git/ref/heads/main')return {object:{sha:state.head}};
    if(path.startsWith('/git/ref/heads/'))return state.existing?{object:{sha:'b'.repeat(40)}}:null;
    if(path.startsWith('/git/commits/')&&!options.method)return {tree:{sha:'tree'}};
    if(path==='/git/trees')return {sha:'new-tree'};
    if(path==='/git/commits')return {sha:'c'.repeat(40)};
    if(path==='/git/refs')return {ref:options.body.ref};
    if(path==='/pulls')return {html_url:'https://github.com/castlemilk/startup-atlas/pull/999'};
    throw new Error(path);
  };
  return {client,calls,state};
}
test('startup validation preserves existing founder and funding records',async()=>{
  const {client,calls}=fixture();const result=await client.validateStartup(update);
  assert.equal(result.id,'startup:example');assert.equal(result.revision,head);
  assert.equal(result.merged.founders[0].name,'Pat Founder');
  assert.deepEqual(result.merged.funding_rounds.map(x=>x.id),['example-seed','example-series-a']);
  assert.equal(calls.filter(x=>x.method==='POST').length,0);
  await assert.rejects(client.validateStartup({...update,source:'http://example.com'}),{code:'VALIDATION_ERROR'});
  await assert.rejects(client.validateStartup({...update,funding_rounds:[{...update.funding_rounds[0],currency:undefined}]}),{code:'VALIDATION_ERROR'});
  await assert.rejects(client.validateStartup({...update,unknown:'value'}),{code:'VALIDATION_ERROR'});
  await assert.rejects(client.validateStartup({...update,name:'a'.repeat(193)}),{code:'VALIDATION_ERROR'});
});
test('startup proposal changes only the reviewed data file and never retries an uncertain branch',async()=>{
  const {client,calls,state}=fixture();
  await assert.rejects(client.proposeStartup(update,'d'.repeat(40)),{code:'STALE_REVISION'});
  const result=await client.proposeStartup(update,head);
  assert.equal(result.status,'proposed');assert.equal(result.published,false);
  const tree=calls.find(x=>x.path==='/git/trees').body.tree;
  assert.deepEqual(tree.map(x=>x.path),['data/startup-research.json']);
  const research=JSON.parse(tree[0].content);
  assert.deepEqual(research.startups[0].funding_rounds.map(x=>x.id),['example-seed','example-series-a']);
  assert.equal(calls.find(x=>x.path==='/pulls').body.draft,true);
  state.existing=true;const writes=calls.filter(x=>x.method==='POST').length;
  await assert.rejects(client.proposeStartup(update,head),{code:'WRITE_UNCERTAIN'});
  assert.equal(calls.filter(x=>x.method==='POST').length,writes);
});
test('new startup profiles need an official site and conflicting identifiers are rejected',async()=>{
  const {client}=fixture();
  const fresh={name:'Another',source:'https://example.com/news',reviewed_at:'2026-01-01'};
  await assert.rejects(client.validateStartup(fresh),{code:'VALIDATION_ERROR'});
  await assert.rejects(client.validateStartup({...fresh,name:'Exampĺe',website:'https://example.com/',description:'Another organisation'}),{code:'DUPLICATE_ID'});
  const valid=await client.validateStartup({...fresh,website:'https://example.com/',description:'Another organisation'});
  assert.equal(valid.previous,null);assert.equal(valid.id,'startup:another');
  const relationship={target_id:'partner:acme-ventures',kind:'backed_by',description:'Backed by Acme',source:'https://example.com/investors'};
  assert.equal((await client.validateStartup({...fresh,website:'https://example.com/',description:'Another organisation',relationships:[relationship]})).merged.relationships[0].target_id,relationship.target_id);
  await assert.rejects(client.validateStartup({...fresh,website:'https://example.com/',description:'Another organisation',relationships:[{...relationship,target_id:'partner:missing'}]}),{code:'VALIDATION_ERROR'});
});
