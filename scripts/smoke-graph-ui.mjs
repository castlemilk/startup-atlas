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
  await copyFile('web/vendor/sql.js/sql-wasm.js',join(temporary,'sql-wasm.cjs'));
  const init=createRequire(import.meta.url)(join(temporary,'sql-wasm.cjs'));
  globalThis.initSqlJs=()=>init({locateFile:()=>resolve('web/vendor/sql.js/sql-wasm.wasm')});
}
const elements=new Map();
for(const id of ['graph-search','graph-query','graph-results','graph-detail','graph-status','graph-canvas','graph-count','graph-list','graph-filters','graph-depth','graph-list-toggle','graph-zoom-in','graph-zoom-out','graph-reset']) {
  const span={textContent:''};
  elements.set(id,{textContent:'',innerHTML:'',value:'',hidden:false,handlers:{},attributes:{},
    addEventListener(event,callback){this.handlers[event]=callback;},
    setAttribute(name,value){this.attributes[name]=value;},querySelectorAll(){return [];},querySelector(selector){return selector.startsWith('[data-')?null:span;},
    createSVGPoint(){return {x:0,y:0,matrixTransform(){return {x:this.x,y:this.y};}};},
    getScreenCTM(){return {inverse(){return {};}};},getBoundingClientRect(){return {width:1200,height:720};},
    viewBox:{baseVal:{width:1200,height:720}},setPointerCapture(){}});
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
  assert.match(elements.get('graph-canvas').innerHTML,/class="network-link"/);
  const canvas=elements.get('graph-canvas');
  const movable={dataset:{node:'person:melanie-perkins'},attributes:{},setAttribute(name,value){this.attributes[name]=value;}};
  canvas.handlers.keydown({target:{closest(){return movable;}},key:'ArrowRight',preventDefault(){}});
  assert.match(movable.attributes.transform,/^translate\(/);
  const keyboardPosition=movable.attributes.transform;
  canvas.handlers.pointerdown({button:0,pointerId:1,clientX:0,clientY:0,target:{closest(){return movable;}}});
  canvas.handlers.pointermove({pointerId:1,clientX:30,clientY:20});
  canvas.handlers.pointerup({pointerId:1,type:'pointerup'});
  elements.get('graph-depth').handlers.change({target:{value:'1'}});
  const [x,y]=keyboardPosition.match(/-?\d+(?:\.\d+)?/g).map(Number);
  const moved=canvas.innerHTML.match(/data-node="person:melanie-perkins"[^>]*transform="translate\(([^ ]+) ([^)]+)\)"/);
  assert.ok(moved);assert.equal(Number(moved[1]),Number((x+30).toFixed(1)));assert.equal(Number(moved[2]),Number((y+20).toFixed(1)));
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
