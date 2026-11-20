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
const elements=new Map(),windowEvents=new Map();
function element(dataset={}) {
  const classes=new Set();
  return {dataset,textContent:'',value:'',hidden:false,handlers:{},attributes:{},nodes:[],edges:[],_html:'',
    addEventListener(event,callback){this.handlers[event]=callback;},
    setAttribute(name,value){this.attributes[name]=String(value);},
    classList:{toggle(name,on){if(on)classes.add(name);else classes.delete(name);},contains:name=>classes.has(name)},
    focus(){document.activeElement=this;},
    get innerHTML(){return this._html;},
    set innerHTML(value){
      this._html=value;
      if(this!==elements.get('graph-canvas'))return;
      this.nodes=[...value.matchAll(/<g class="([^"]+)" data-node="([^"]+)"[^>]+transform="([^"]+)"/g)].map(match=>{
        const node=element({node:match[2]});
        match[1].split(' ').forEach(name=>node.classList.toggle(name,true));
        node.setAttribute('transform',match[3]);return node;
      });
      this.edges=[...value.matchAll(/data-edge="(\d+)"/g)].map(()=>element());
    },
    querySelectorAll(selector){return selector==='.network-node'?this.nodes:[];},
    querySelector(selector){
      if(selector==='span')return this.span||(this.span=element());
      if(selector==='.network-node.is-root')return this.nodes.find(node=>node.classList.contains('is-root'));
      const edge=selector.match(/^\[data-edge="(\d+)"\]$/);return edge?this.edges[Number(edge[1])]:null;
    },
    createSVGPoint(){return {x:0,y:0,matrixTransform(){return {x:this.x,y:this.y};}};},
    getScreenCTM(){return {inverse(){return {};}};},getBoundingClientRect(){return {width:1200,height:720};},
    viewBox:{baseVal:{width:1200,height:720}},setPointerCapture(){}
  };
}
for(const id of ['graph-search','graph-query','graph-results','graph-detail','graph-status','graph-canvas','graph-count','graph-list','graph-filters','graph-depth','graph-list-toggle','graph-zoom-in','graph-zoom-out','graph-fit','graph-reset','network-heading'])elements.set(id,element());
globalThis.document=Object.assign(new EventTarget(),{getElementById:id=>elements.get(id),hidden:false});
globalThis.window={addEventListener:(name,callback)=>windowEvents.set(name,callback)};
globalThis.location={search:mode==='query'?'?q=Melanie%20Perkins':'?startup=startup%3Acanva'};
let selectedUrl;
globalThis.history={
  pushState(_state,_title,url){selectedUrl=url;location.search=url;},
  replaceState(_state,_title,url){location.search=url;}
};
let sqliteReads=0,jsonReads=0;
globalThis.fetch=async url=>{
  if(url==='./data/atlas.sqlite'){sqliteReads++;return new Response(await readFile('dist/data/atlas.sqlite'));}
  if(url==='./data/graph.json'){jsonReads++;return mode==='unavailable'?new Response('',{status:503}):Response.json(snapshot);}
  throw new Error('Unexpected request: '+url);
};
const click=(id,dataset)=>elements.get(id).handlers.click({target:{closest:()=>({dataset})}});
try {
  await import('../dist/graph.js');
  if(mode==='unavailable') {
    assert.match(elements.get('graph-status').textContent,/could not be loaded/);
    assert.match(elements.get('graph-detail').innerHTML,/temporarily unavailable/);
  } else {
    const canvas=elements.get('graph-canvas'),detail=elements.get('graph-detail');
    assert.match(detail.innerHTML,/<h2>Canva<\/h2>/);
    assert.match(canvas.innerHTML,/data-node="person:melanie-perkins"/);
    assert.match(canvas.innerHTML,/class="network-link"/);
    const movable=canvas.nodes.find(node=>node.dataset.node==='person:melanie-perkins');
    canvas.handlers.keydown({target:{closest:()=>movable},key:'ArrowRight',preventDefault(){}});
    assert.match(movable.attributes.transform,/^translate\(/);
    const keyboardPosition=movable.attributes.transform;
    canvas.handlers.pointerdown({button:0,pointerId:1,clientX:0,clientY:0,target:{closest:()=>movable}});
    canvas.handlers.pointermove({pointerId:1,clientX:30,clientY:20});
    canvas.handlers.pointerup({pointerId:1,type:'pointerup'});
    elements.get('graph-depth').handlers.change({target:{value:'1'}});
    const [x,y]=keyboardPosition.match(/-?\d+(?:\.\d+)?/g).map(Number);
    const moved=canvas.innerHTML.match(/data-node="person:melanie-perkins"[^>]*transform="translate\(([^ ]+) ([^)]+)\)"/);
    assert.ok(moved);assert.equal(Number(moved[1]),Number((x+30).toFixed(1)));assert.equal(Number(moved[2]),Number((y+20).toFixed(1)));
    if(mode==='query')assert.match(elements.get('graph-results').innerHTML,/Melanie Perkins/);
    assert.match(detail.innerHTML,/200,000,000/);
    elements.get('graph-zoom-in').handlers.click();
    const mapMarkup=canvas.innerHTML,viewBox=canvas.attributes.viewBox;
    click('graph-detail',{select:'person:melanie-perkins'});
    assert.match(detail.innerHTML,/<h2>Melanie Perkins<\/h2>/);
    assert.match(detail.innerHTML,/Canva/);
    const selection=new URLSearchParams(selectedUrl);
    assert.equal(selection.get('entity'),'startup:canva','Inspection must retain the graph root');
    assert.equal(selection.get('selected'),'person:melanie-perkins');
    assert.equal(canvas.innerHTML,mapMarkup,'Inspection must retain the laid-out graph');
    assert.equal(canvas.attributes.viewBox,viewBox,'Inspection must retain pan and zoom');
    assert.equal(canvas.nodes.find(node=>node.dataset.node==='person:melanie-perkins').attributes['aria-pressed'],'true');
    assert.match(detail.innerHTML,/Relationship source/);
    const inspectedUrl=location.search;
    click('graph-detail',{select:'startup:fusion-books'});
    assert.match(detail.innerHTML,/Selected outside this map/);
    assert.equal(canvas.innerHTML,mapMarkup,'Off-map inspection must not replace the neighbourhood');
    location.search=inspectedUrl;windowEvents.get('popstate')();
    assert.match(detail.innerHTML,/<h2>Melanie Perkins<\/h2>/);
    assert.equal(canvas.attributes.viewBox,viewBox,'Back within the same root must retain pan and zoom');
    const positions=canvas.nodes.map(node=>[node.dataset.node,node.attributes.transform]);
    elements.get('graph-fit').handlers.click();
    assert.deepEqual(canvas.nodes.map(node=>[node.dataset.node,node.attributes.transform]),positions,'Fit view must retain node positions');
    click('graph-detail',{explore:'person:melanie-perkins'});
    assert.equal(new URLSearchParams(selectedUrl).get('entity'),'person:melanie-perkins','Explicit exploration changes root');
    assert.equal(new URLSearchParams(selectedUrl).get('selected'),'person:melanie-perkins');
    assert.match(canvas.innerHTML,/data-node="startup:fusion-books"/);
    assert.match(elements.get('network-heading').textContent,/Around Melanie Perkins/);
    elements.get('graph-query').value='Airwallex';
    elements.get('graph-search').handlers.submit({preventDefault(){}});
    assert.match(elements.get('graph-results').innerHTML,/Airwallex/);
    click('graph-results',{explore:'startup:airwallex'});
    assert.equal(new URLSearchParams(selectedUrl).get('entity'),'startup:airwallex','Search selection starts a new neighbourhood');
    elements.get('graph-query').value='';elements.get('graph-query').handlers.input({});
    assert.equal(elements.get('graph-results').hidden,true,'Clearing must hide results immediately');
    assert.equal(new URLSearchParams(location.search).has('q'),false);
    location.search='?entity=startup%3Acanva&selected=person%3Amelanie-perkins&depth=2&types=startup,person&list=1';
    windowEvents.get('popstate')();
    assert.equal(elements.get('graph-depth').value,'2');
    assert.equal(elements.get('graph-list').hidden,false);
    assert.match(detail.innerHTML,/<h2>Melanie Perkins<\/h2>/);
    assert.match(canvas.innerHTML,/data-node="startup:fusion-books"/);
    assert.doesNotMatch(canvas.innerHTML,/data-node="partner:airtree"/);
    assert.match(elements.get('graph-list').innerHTML,/Canva/);
    elements.get('graph-list-toggle').handlers.click();
    assert.equal(elements.get('graph-list').hidden,true);
    if(mode==='sqlite'||mode==='query'){assert.ok(sqliteReads>0);assert.equal(jsonReads,0);}
    else {assert.ok(jsonReads>0);assert.match(elements.get('graph-status').textContent,/backup/);}
  }
  console.log('Graph explorer '+mode+' smoke test passed');
} finally {
  if(temporary)await rm(temporary,{recursive:true,force:true});
}
