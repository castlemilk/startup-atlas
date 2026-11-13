import assert from 'node:assert/strict';
import {copyFile,mkdtemp,readFile,rm} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';

const mode=process.argv[2]||'sqlite';
const snapshot=JSON.parse(await readFile('dist/data/graph.json','utf8'));
let temporary;
if(mode==='sqlite'||mode==='query') {
  temporary=await mkdtemp(join(tmpdir(),'atlas-wasm-'));
  await copyFile('vendor/sql.js/sql-wasm.js',join(temporary,'sql-wasm.cjs'));
  const init=createRequire(import.meta.url)(join(temporary,'sql-wasm.cjs'));
  globalThis.initSqlJs=()=>init({locateFile:()=>resolve('vendor/sql.js/sql-wasm.wasm')});
}
const elements=new Map();
for(const id of ['graph-search','graph-query','graph-results','graph-detail','graph-status','graph-canvas','graph-count','graph-list','graph-filters','graph-depth','graph-list-toggle','graph-zoom-in','graph-zoom-out','graph-reset']) {
  const span={textContent:''};
  elements.set(id,{textContent:'',innerHTML:'',value:'',hidden:false,handlers:{},attributes:{},
    addEventListener(event,callback){this.handlers[event]=callback;},
    setAttribute(name,value){this.attributes[name]=value;},querySelectorAll(){return [];},querySelector(){return span;}});
}
globalThis.document={getElementById:id=>elements.get(id)};
globalThis.window={addEventListener(){}};
globalThis.location={search:mode==='query'?'?q=Melanie%20Perkins':'?startup=startup%3Acanva'};
let selectedUrl;
globalThis.history={pushState(_state,_title,url){selectedUrl=url;}};
let sqliteReads=0,jsonReads=0;
globalThis.fetch=async url=>{
  if(url==='./data/atlas.sqlite'){sqliteReads++;return new Response(await readFile('dist/data/atlas.sqlite'));}
  if(url==='./data/graph.json'){jsonReads++;return mode==='unavailable'?new Response('',{status:503}):Response.json(snapshot);}
  throw new Error('Unexpected request: '+url);
};
await import('../dist/graph.js');
if(mode==='unavailable') {
  assert.match(elements.get('graph-status').textContent,/could not be loaded/);
  assert.match(elements.get('graph-detail').innerHTML,/temporarily unavailable/);
} else {
  assert.match(elements.get('graph-detail').innerHTML,/<h2>Canva<\/h2>/);
  assert.match(elements.get('graph-canvas').innerHTML,/data-node="person:melanie-perkins"/);
  if(mode==='query')assert.match(elements.get('graph-results').innerHTML,/Melanie Perkins/);
  assert.match(elements.get('graph-detail').innerHTML,/200,000,000/);
  elements.get('graph-detail').handlers.click({target:{closest(){return {dataset:{select:'person:melanie-perkins'}};}}});
  assert.match(elements.get('graph-detail').innerHTML,/<h2>Melanie Perkins<\/h2>/);
  assert.match(elements.get('graph-detail').innerHTML,/Canva/);
  assert.match(selectedUrl,/person%3Amelanie-perkins/);
  elements.get('graph-query').value='Airwallex';
  elements.get('graph-search').handlers.submit({preventDefault(){}});
  assert.match(elements.get('graph-results').innerHTML,/Airwallex/);
  elements.get('graph-list-toggle').handlers.click();
  assert.equal(elements.get('graph-list').hidden,false);
  assert.match(elements.get('graph-list').innerHTML,/Canva/);
  if(mode==='sqlite'||mode==='query'){assert.ok(sqliteReads>0);assert.equal(jsonReads,0);}
  else {assert.ok(jsonReads>0);assert.match(elements.get('graph-status').textContent,/backup/);}
}
if(temporary)await rm(temporary,{recursive:true,force:true});
console.log('Graph explorer '+mode+' smoke test passed');
