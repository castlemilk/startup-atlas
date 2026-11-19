import assert from 'node:assert/strict';
import {copyFile,mkdtemp,readFile,rm} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {JSDOM} from 'jsdom';

const mode=process.argv[2]||'sqlite',fallback=mode.includes('fallback'),person=mode.includes('person'),programme=mode.includes('programme');
const psiquantum=mode.includes('psiquantum');
let temporary;
if(!fallback){
  temporary=await mkdtemp(join(tmpdir(),'atlas-entity-'));
  await copyFile('web/vendor/sql.js/sql-wasm.js',join(temporary,'sql-wasm.cjs'));
  const init=createRequire(import.meta.url)(join(temporary,'sql-wasm.cjs'));
  globalThis.initSqlJs=()=>init({locateFile:()=>resolve('web/vendor/sql.js/sql-wasm.wasm')});
}
const root={innerHTML:'',attributes:{},setAttribute(k,v){this.attributes[k]=v;},querySelectorAll(){return [];}};
globalThis.document={getElementById:()=>root,title:''};
globalThis.location={search:person?'?id=person%3Amelanie-perkins':programme?'?id=programme%3Astartmate':psiquantum?'?id=startup%3Apsiquantum':'?id=startup%3Acanva'};
globalThis.fetch=async url=>{
  if(url==='./data/atlas.sqlite')return new Response(await readFile('dist/data/atlas.sqlite'));
  if(url==='./data/graph.json')return new Response(await readFile('dist/data/graph.json'));
  if(url==='./data/catalogue.json')return new Response(await readFile('dist/data/catalogue.json'));
  throw new Error('Unexpected request: '+url);
};
await import('../dist/entity.js');
assert.equal(root.attributes['aria-busy'],'false');
if(person){
  assert.match(root.innerHTML,/<h1>Melanie Perkins<\/h1>/);
  assert.match(root.innerHTML,/entity\.html\?id=startup%3Acanva/);
  assert.match(root.innerHTML,/entity\.html\?id=startup%3Afusion-books/);
}else if(programme){
  assert.match(root.innerHTML,/<h1>Startmate Accelerator<\/h1>/);
  assert.match(root.innerHTML,/Programme details/);
  assert.match(root.innerHTML,/At least one full-time founder/);
}else if(psiquantum){
  const {window:{document}}=new JSDOM(root.innerHTML);
  assert.equal(document.querySelector('h1').textContent,'PsiQuantum');
  assert.equal(document.querySelector('a[href="#entity-funding"]').textContent,'Timeline');
  const timeline=document.querySelector('#entity-funding');
  const dates=[...timeline.querySelectorAll('ol time')].map(time=>time.dateTime);
  assert.deepEqual(dates,[...dates].sort());
  assert.ok(dates.includes('2024-04-30') && dates.includes('2025-02-26'));
  assert.match(timeline.textContent,/Public funding announcement/);
  assert.match(timeline.textContent,/Technical milestone/);
  assert.equal(timeline.querySelectorAll('a[href="https://www.psiquantum.com/news-import/psiquantum-1b-fundraise"]').length,1);
  const graph=JSON.parse(await readFile('dist/data/graph.json'));
  const seriesC=graph.funding_rounds.find(round=>round.id==='psiquantum-2020-series-c');
  if(!seriesC.announced_on){
    const undated=timeline.querySelector('.entity-timeline-undated');
    assert.equal(undated.querySelectorAll('time').length,0);
    assert.match(undated.textContent,/Series C[\s\S]*April 2020/);
  }
}else{
  assert.match(root.innerHTML,/<h1>Canva<\/h1>/);
  assert.match(root.innerHTML,/<h2>Founders<\/h2>/);
  for(const name of ['Melanie Perkins','Cliff Obrecht','Cameron Adams'])assert.match(root.innerHTML,new RegExp(name));
  assert.match(root.innerHTML,/<h2>Company details<\/h2>/);
  assert.match(root.innerHTML,/26 August 2013/);
  assert.match(root.innerHTML,/\$3 million \(currency unspecified\)/);
  assert.match(root.innerHTML,/entity\.html\?id=person%3Amelanie-perkins/);
  assert.match(root.innerHTML,/partner\.html\?name=Airtree/);
}
if(fallback)assert.match(root.innerHTML,/published backup/);
if(temporary)await rm(temporary,{recursive:true,force:true});
console.log('Entity profile '+mode+' smoke test passed');
