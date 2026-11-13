import assert from 'node:assert/strict';
import {copyFile,mkdtemp,readFile,rm} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';

const mode=process.argv[2]||'sqlite';
let temporary;
if (mode==='sqlite') {
  temporary=await mkdtemp(join(tmpdir(),'atlas-directory-'));
  await copyFile('vendor/sql.js/sql-wasm.js',join(temporary,'sql-wasm.cjs'));
  const init=createRequire(import.meta.url)(join(temporary,'sql-wasm.cjs'));
  globalThis.initSqlJs=()=>init({locateFile:()=>resolve('vendor/sql.js/sql-wasm.wasm')});
}

function element(value='') {
  return {value,hidden:false,disabled:false,textContent:'',innerHTML:'',dataset:{},options:[],handlers:{},attributes:{},
    classList:{toggle(){},remove(){}},
    get selectedOptions(){return this.options.filter(option=>option.value===this.value).slice(0,1);},
    add(option){this.options.push(option);},after(){},focus(){},scrollIntoView(){},
    addEventListener(event,callback){this.handlers[event]=callback;},
    setAttribute(name,value){this.attributes[name]=value;},querySelectorAll(){return [];},
    querySelector(){return element();}};
}
const values={country:['all','AU'],kind:['all','Cloud credits'],access:['all','Direct'],sort:['recommended','name'],
  'entity-kind':['all','startup','person','partner','provider','programme'],
  'partner-country':['all','unmapped'],'partner-provider':['all','Vercel','AWS','Microsoft','LaunchVic'],
  'partner-evidence':['all','official','screenshot','self_report','reviewed']};
const elements=new Map();
function get(id) {
  if (!elements.has(id)) {
    const el=element(values[id]?.[0]||'');
    el.options=(values[id]||[]).map(value=>({value,textContent:value}));
    elements.set(id,el);
  }
  return elements.get(id);
}
const views=['all','opportunities','partners','saved'].map(view=>{const el=element();el.dataset.view=view;return el;});
const selectors=new Map([['.filters',element()],['.directory-layout',element()],['.sort-label',element()]]);
globalThis.document={getElementById:get,querySelector:selector=>selectors.get(selector),
  querySelectorAll:selector=>selector==='[data-view]'?views:[],addEventListener(){},
  createElement(){const el=element(),children=[];el.append=(...items)=>children.push(...items);el.querySelector=selector=>selector==='summary'?children[0]:element();return el;}};
globalThis.Option=function(text,value){return {textContent:text,value};};
globalThis.window={addEventListener(){},matchMedia:()=>({matches:false})};
globalThis.location={search:'?q=Melanie%20Perkins',pathname:'/',hash:'#directory'};
let currentUrl='';
globalThis.history={replaceState(_state,_title,url){currentUrl=url;}};
globalThis.localStorage={getItem(){return null;},setItem(){}};
const fetched=[];
globalThis.fetch=async url=>{
  fetched.push(url);
  if (url==='./data/atlas.sqlite') return new Response(await readFile('dist/data/atlas.sqlite'));
  if (url==='./data/graph.json' && mode==='unavailable') return new Response('',{status:503});
  if (url.startsWith('./data/')) return new Response(await readFile('dist/'+url.slice(2)));
  throw new Error('Unexpected request: '+url);
};

await import('../dist/app.js');
const results=get('results-list');
if (mode==='unavailable') {
  assert.match(results.innerHTML,/Atlas search is unavailable/);
  assert.match(results.innerHTML,/Opportunities and Partner index/);
} else {
  assert.match(results.innerHTML,/Melanie Perkins/);
  assert.match(results.innerHTML,/entity\.html\?id=person%3Amelanie-perkins/);
  assert.match(results.innerHTML,/entity\.html\?id=startup%3Acanva/);
  get('entity-kind').value='person';
  get('entity-kind').handlers.change({target:{value:'person'}});
  assert.match(results.innerHTML,/Melanie Perkins/);
  assert.doesNotMatch(results.innerHTML,/entity\.html\?id=startup%3Acanva/);
  assert.match(currentUrl,/type=person/);
  get('entity-kind').value='all';
  get('entity-kind').handlers.change({target:{value:'all'}});
}
get('search').handlers.input({target:{value:''},isComposing:false});
views.find(button=>button.dataset.view==='opportunities').handlers.click();
assert.match(results.innerHTML,/opportunity-row/);
views.find(button=>button.dataset.view==='partners').handlers.click();
assert.match(results.innerHTML,/partner\.html\?name=/);
if (mode==='sqlite') {
  assert.ok(fetched.includes('./data/atlas.sqlite'));
  assert.ok(!fetched.includes('./data/catalogue.json'));
  assert.ok(!fetched.includes('./data/graph.json'));
} else {
  assert.ok(fetched.includes('./data/graph.json'));
  assert.ok(fetched.includes('./data/catalogue.json'));
}
if (temporary) await rm(temporary,{recursive:true,force:true});
console.log('Directory '+mode+' smoke test passed');
