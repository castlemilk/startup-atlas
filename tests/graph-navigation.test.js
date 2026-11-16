import test from 'node:test';
import assert from 'node:assert/strict';

// Exercise real graph event handlers against a small sourced neighbourhood.
// This verifies navigation state and geometry retention; browser tests own rendering.
test('inspecting graph entities preserves the map and explicit exploration reroots', async () => {
  const graph={
    entities:[
      {id:'startup:canva',name:'Canva',kind:'startup',summary:'Design platform'},
      {id:'person:melanie-perkins',name:'Melanie Perkins',kind:'person'},
      {id:'partner:airtree',name:'Airtree',kind:'partner'},
      {id:'startup:fusion-books',name:'Fusion Books',kind:'startup'}
    ],
    edges:[
      {from:'person:melanie-perkins',to:'startup:canva',kind:'founded',source:'https://example.com/founder'},
      {from:'partner:airtree',to:'startup:canva',kind:'supports',source:'https://example.com/portfolio'},
      {from:'person:melanie-perkins',to:'startup:fusion-books',kind:'founded',source:'https://example.com/other-company'}
    ],funding_rounds:[],articles:[]
  };
  const elements=new Map(),windowEvents=new Map(),historyEntries=[];
  function element(dataset={}) {
    const classes=new Set(),attributes={};
    return {dataset,attributes,handlers:{},value:'',hidden:false,textContent:'',_html:'',nodes:[],edges:[],
      classList:{toggle(name,on){if(on)classes.add(name);else classes.delete(name);},contains(name){return classes.has(name);}},
      addEventListener(name,fn){this.handlers[name]=fn;},
      setAttribute(name,value){attributes[name]=String(value);},getAttribute(name){return attributes[name];},
      focus(){globalThis.document.activeElement=this;},
      get innerHTML(){return this._html;},
      set innerHTML(value){
        this._html=value;
        if(this!==elements.get('graph-canvas'))return;
        this.nodes=[...value.matchAll(/<g class="([^"]+)" data-node="([^"]+)"[^>]+transform="([^"]+)"/g)].map(match=>{
          const node=element({node:match[2]});match[1].split(' ').forEach(name=>node.classList.toggle(name,true));
          node.setAttribute('transform',match[3]);return node;
        });
        this.edges=[...value.matchAll(/data-edge="(\d+)"/g)].map(()=>element());
      },
      querySelectorAll(selector){
        if(selector==='.network-node')return this.nodes;
        if(selector==='button[data-kind]')return this.filters||[];
        return [];
      },
      querySelector(selector){
        if(selector==='span')return this.label||(this.label=element());
        if(selector==='.network-node.is-root')return this.nodes.find(node=>node.classList.contains('is-root'));
        const edge=selector.match(/^\[data-edge="(\d+)"\]$/);if(edge)return this.edges[Number(edge[1])];
        return null;
      },
      createSVGPoint(){return {x:0,y:0,matrixTransform(){return {x:this.x,y:this.y};}};},
      getScreenCTM(){return {inverse(){return {};}};},setPointerCapture(){}
    };
  }
  for(const id of ['graph-search','graph-query','graph-results','graph-detail','graph-status','graph-canvas','graph-count','graph-list','graph-filters','graph-depth','graph-list-toggle','graph-zoom-in','graph-zoom-out','graph-reset','graph-fit','network-heading'])elements.set(id,element());
  elements.get('graph-filters').filters=['startup','partner','person','programme','provider'].map(kind=>element({kind}));
  const previous={};
  for(const key of ['document','window','location','history','fetch'])previous[key]=globalThis[key];
  globalThis.document={getElementById:id=>elements.get(id)};
  globalThis.window={addEventListener:(name,fn)=>windowEvents.set(name,fn)};
  globalThis.location={search:'?entity=startup%3Acanva'};
  globalThis.history={
    pushState(_state,_title,url){historyEntries.push(url);globalThis.location.search=url;},
    replaceState(_state,_title,url){globalThis.location.search=url;}
  };
  globalThis.fetch=async path=>path==='./data/graph.json'?Response.json(graph):new Response('',{status:404});
  const click=(id,dataset)=>elements.get(id).handlers.click({target:{closest:()=>({dataset})}});
  try {
    await import('../web/graph.js');
    const canvas=elements.get('graph-canvas'),detail=elements.get('graph-detail'),query=elements.get('graph-query');
    assert.match(detail.innerHTML,/<h2>Canva<\/h2>/);
    assert.match(elements.get('network-heading').textContent,/Around Canva/);
    const founder=canvas.nodes.find(node=>node.dataset.node==='person:melanie-perkins');
    canvas.handlers.keydown({target:{closest:()=>founder},key:'ArrowRight',preventDefault(){}});
    elements.get('graph-zoom-in').handlers.click();
    const geometry=founder.getAttribute('transform'),viewBox=canvas.getAttribute('viewBox'),mapMarkup=canvas.innerHTML;
    canvas.handlers.keydown({target:{closest:()=>founder},key:'Enter',preventDefault(){}});
    assert.match(detail.innerHTML,/<h2>Melanie Perkins<\/h2>/);
    assert.equal(new URLSearchParams(location.search).get('entity'),'startup:canva');
    assert.equal(new URLSearchParams(location.search).get('selected'),'person:melanie-perkins');
    assert.equal(canvas.innerHTML,mapMarkup,'Inspection must not recreate the graph');
    assert.equal(canvas.getAttribute('viewBox'),viewBox,'Inspection must retain pan and zoom');
    assert.equal(founder.getAttribute('transform'),geometry,'Inspection must retain a moved node');
    assert.equal(founder.getAttribute('aria-pressed'),'true');
    assert.match(detail.innerHTML,/Relationship source/);
    assert.match(detail.innerHTML,/Outside current map/);
    const inspectedUrl=location.search;
    click('graph-detail',{select:'startup:fusion-books'});
    assert.match(detail.innerHTML,/<h2>Fusion Books<\/h2>/);
    assert.match(detail.innerHTML,/Selected outside this map/);
    assert.equal(canvas.innerHTML,mapMarkup,'Inspecting an off-map relationship must retain context');
    location.search=inspectedUrl;windowEvents.get('popstate')();
    assert.match(detail.innerHTML,/<h2>Melanie Perkins<\/h2>/);
    assert.equal(canvas.getAttribute('viewBox'),viewBox,'Back within the same root keeps the viewport');
    click('graph-detail',{explore:'person:melanie-perkins'});
    assert.equal(new URLSearchParams(location.search).get('entity'),'person:melanie-perkins');
    assert.equal(new URLSearchParams(location.search).has('selected'),false);
    assert.match(elements.get('network-heading').textContent,/Around Melanie Perkins/);
    assert.notEqual(canvas.innerHTML,mapMarkup);
    assert.match(canvas.innerHTML,/data-node="startup:fusion-books"/);
    location.search='?entity=startup%3Acanva&selected=startup%3Afusion-books&depth=2&types=person,startup&list=1&q=Melanie';
    windowEvents.get('popstate')();
    assert.match(detail.innerHTML,/<h2>Fusion Books<\/h2>/);
    assert.equal(elements.get('graph-depth').value,'2');
    assert.equal(elements.get('graph-list').hidden,false);
    assert.match(elements.get('graph-results').innerHTML,/Melanie Perkins/);
    assert.doesNotMatch(canvas.innerHTML,/data-node="partner:airtree"/);
    query.value='';query.handlers.input({});
    assert.equal(elements.get('graph-results').hidden,true,'Clearing search is immediate');
    assert.equal(new URLSearchParams(location.search).has('q'),false);
    location.search='?entity=missing';windowEvents.get('popstate')();
    assert.match(detail.innerHTML,/not in the published graph/);
    assert.equal(elements.get('graph-count').textContent,'0 entities shown');
    click('graph-results',{explore:'startup:canva'});
    assert.match(detail.innerHTML,/<h2>Canva<\/h2>/,'Search recovers an unknown graph root');
    assert.ok(historyEntries.length>=3);
  } finally {
    for(const [key,value] of Object.entries(previous))if(value===undefined)delete globalThis[key];else globalThis[key]=value;
  }
});
