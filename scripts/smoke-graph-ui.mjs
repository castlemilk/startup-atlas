// Exercise the built UI with the real SQLite WASM engine and its static fallback.
import assert from 'node:assert/strict';
import { copyFile, mkdtemp, readFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const mode=process.argv[2] || 'sqlite';
const snapshot=JSON.parse(await readFile(new URL('../dist/data/graph.json',import.meta.url),'utf8'));
let temporary;
if(mode==='sqlite'){
  temporary=await mkdtemp(join(tmpdir(),'atlas-wasm-'));
  await copyFile(new URL('../vendor/sql.js/sql-wasm.js',import.meta.url),join(temporary,'sql-wasm.cjs'));
  const init=createRequire(import.meta.url)(join(temporary,'sql-wasm.cjs'));
  globalThis.initSqlJs=()=>init({locateFile:()=>resolve('vendor/sql.js/sql-wasm.wasm')});
}
const elements=new Map();
for(const id of ['graph-search','graph-query','graph-results','graph-detail','result-count','graph-status'])elements.set(id,{
  textContent:'',innerHTML:'',value:'',handlers:{},addEventListener(event,callback){this.handlers[event]=callback;},
});
globalThis.document={getElementById:id=>elements.get(id)};
globalThis.location={search:'?startup=startup%3Acanva',href:''};
let selectedUrl;
globalThis.history={replaceState(_state,_title,url){selectedUrl=url;}};
let sqliteReads=0,jsonReads=0;
globalThis.fetch=async url=>{
  if(url==='./data/atlas.sqlite'){sqliteReads++;return new Response(await readFile('dist/data/atlas.sqlite'));}
  if(url==='./data/graph.json'){jsonReads++;return mode==='unavailable'?new Response('',{status:503}):Response.json(snapshot);}
  throw new Error(`Unexpected request: ${url}`);
};
async function until(predicate){for(let i=0;i<200;i++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,10));}assert.fail('Explorer did not update');}
await import('../dist/graph.js');
if(mode==='unavailable'){
  await until(()=>elements.get('graph-results').innerHTML.includes('could not be loaded'));
  await until(()=>elements.get('graph-detail').innerHTML.includes('Unable to load'));
}else{
  await until(()=>elements.get('graph-detail').innerHTML.includes('<h2>Canva</h2>'));
  assert.match(elements.get('graph-detail').innerHTML,/Melanie Perkins/);
  assert.match(elements.get('graph-detail').innerHTML,/200,000,000/);
  assert.match(selectedUrl,/startup%3Acanva/);
  await until(()=>elements.get('result-count').textContent.endsWith('results'));
  elements.get('graph-query').value='Airwallex';
  elements.get('graph-search').handlers.submit({preventDefault(){}});
  await until(()=>elements.get('result-count').textContent!=='100+ results');
  assert.match(elements.get('graph-results').innerHTML,/Airwallex/);
  elements.get('graph-results').handlers.click({target:{closest(){return {dataset:{kind:'startup',id:'startup:airwallex',name:'Airwallex'}};}}});
  await until(()=>elements.get('graph-detail').innerHTML.includes('<h2>Airwallex</h2>'));
  const profile=elements.get('graph-detail').innerHTML;
  assert.ok(profile.indexOf('Series H')<profile.indexOf('Series F'));
  if(mode==='sqlite'){assert.ok(sqliteReads>0);assert.equal(jsonReads,0);assert.equal(elements.get('graph-status').textContent,'');}
  else {assert.ok(jsonReads>0);assert.match(elements.get('graph-status').textContent,/Basic search/);}
}
if(temporary)await rm(temporary,{recursive:true,force:true});
console.log(`Graph explorer ${mode} smoke test passed`);
