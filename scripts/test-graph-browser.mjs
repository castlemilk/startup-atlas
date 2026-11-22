// Browser-level graph interaction smoke test. Uses the Chrome already installed
// on the GitHub Actions runner and Node's built-in CDP WebSocket client.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {mkdtemp, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {extname, join, resolve, sep} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {neighborhood} from '../web/graph-model.js';
import {sourceUrl} from '../web/logic.js';
import {countryName, indexCompanies} from '../web/atlas-exploration.js';

const root=resolve('dist'), profile=await mkdtemp(join(tmpdir(),'atlas-chrome-'));
const screenshotDir=process.env.ATLAS_SCREENSHOTS_DIR||join(tmpdir(),'atlas-graph-screenshots');
const contentTypes={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.sqlite':'application/octet-stream','.svg':'image/svg+xml','.png':'image/png'};
const requests=[];
const server=createServer(async(req,res)=>{
  try {
    const path=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
    if(path!==root&&!path.startsWith(root+sep)){res.writeHead(403).end();return;}
    const bytes=await readFile(path===root?join(root,'index.html'):path);
    requests.push({url:req.url,status:200});
    res.writeHead(200,{'Content-Type':contentTypes[extname(path)]||'application/octet-stream'}).end(bytes);
  } catch {requests.push({url:req.url,status:404});res.writeHead(404).end();}
});
await new Promise((resolveListen,reject)=>server.once('error',reject).listen(0,'127.0.0.1',resolveListen));
const address=`http://127.0.0.1:${server.address().port}`;
const chrome=spawn(process.env.CHROME_BIN||'google-chrome',[
  '--headless=new','--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader','--disable-dev-shm-usage','--disable-background-networking','--disable-extensions','--no-first-run',
  '--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'
],{stdio:['ignore','ignore','pipe']});
let socket, spawnError, chromeExit, chromeLog='';
let captureFailure=async()=>{}, readDiagnostics=async()=>({state:'unavailable'});
chrome.on('error',error=>{spawnError=error;});
chrome.on('exit',(code,signal)=>{chromeExit=`Chrome exited (${code ?? signal})`;});
chrome.stderr.on('data',chunk=>{chromeLog=(chromeLog+chunk.toString()).slice(-5000);});

async function until(fn,message,attempts=100) {
  for(let i=0;i<attempts;i++) {
    if(spawnError)throw spawnError;
    if(chromeExit)throw new Error(chromeExit+'\n'+chromeLog);
    const result=await fn().catch(()=>null);
    if(result)return result;
    await delay(100);
  }
  throw new Error(message+'\n'+chromeLog);
}
try {
  // Cold CI runners can take longer to start Chrome; allow 45 seconds only here.
  // Page interactions retain the normal polling budget.
  const port=await until(async()=>Number((await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]),'Chrome did not start',450);
  const target=await until(async()=>{
    const targets=await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    return targets.find(item=>item.type==='page');
  },'Chrome did not expose a page',450);
  socket=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolveOpen,reject)=>{socket.addEventListener('open',resolveOpen,{once:true});socket.addEventListener('error',reject,{once:true});});
  const pending=new Map(), exceptions=[], browserMessages=[];let sequence=0,navigationCount=0;
  socket.addEventListener('message',event=>{
    const message=JSON.parse(event.data);
    if(message.method==='Page.frameNavigated'&&!message.params.frame.parentId)navigationCount++;
    if(message.method==='Runtime.exceptionThrown')exceptions.push(message.params.exceptionDetails.exception?.description||message.params.exceptionDetails.text);
    if(message.method==='Runtime.consoleAPICalled'&&['error','warning'].includes(message.params.type))browserMessages.push(message.params.args.map(item=>item.value||item.description||'').join(' '));
    if(!message.id)return;
    const item=pending.get(message.id);if(!item)return;pending.delete(message.id);
    if(message.error)item.reject(new Error(message.error.message));else item.resolve(message.result);
  });
  function command(method,params={}) {
    const id=++sequence;
    return new Promise((resolveCommand,reject)=>{pending.set(id,{resolve:resolveCommand,reject});socket.send(JSON.stringify({id,method,params}));});
  }
  async function evaluate(expression) {
    const response=await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
    if(response.exceptionDetails)throw new Error(response.exceptionDetails.text);
    return response.result.value;
  }
  async function assertGraphControlSizes(viewport) {
    const controls=await evaluate(`['graph-fit','graph-reset'].map(id=>{
      const button=document.getElementById(id),icon=button?.querySelector('svg');
      const size=element=>{const rect=element?.getBoundingClientRect();return rect?{width:rect.width,height:rect.height}:null;};
      return {id,button:size(button),icon:size(icon)};
    })`);
    for(const control of controls) {
      const detail=viewport+' '+control.id+' '+JSON.stringify(control);
      assert.ok(control.icon && control.icon.width>0 && control.icon.height>0 && control.icon.width<=24 && control.icon.height<=24,
        'Graph control SVG must remain a visible icon at most 24px; '+detail);
      assert.ok(control.button && control.button.width>=24 && control.button.height>=24 && control.button.width<=60 && control.button.height<=60,
        'Graph control button must remain a compact operable target between 24px and 60px; '+detail);
    }
  }
  async function assertLoomLabels(minimum, fitted=false) {
    const labels=await evaluate(`(() => {
      const canvas=document.querySelector('#graph-loom-canvas').getBoundingClientRect();
      const labels=[...document.querySelectorAll('.network-loom-label:not([hidden])')];
      const bounds=labels.map(label=>label.getBoundingClientRect());
      const markers=[...document.querySelectorAll('#graph-loom-controls .network-node')].map(node=>node.getBoundingClientRect());
      const intersects=(a,b)=>a.left<b.right && a.right>b.left && a.top<b.bottom && a.bottom>b.top;
      return {count:labels.length,
        clipped:bounds.flatMap((rect,index)=>rect.left<canvas.left || rect.right>canvas.right || rect.top<canvas.top || rect.bottom>canvas.bottom
          ? [{name:labels[index].textContent, rect:rect.toJSON(), canvas:canvas.toJSON()}] : []),
        overlapping:bounds.some((rect,index)=>bounds.slice(index+1).some(other=>intersects(rect,other))),
        fitted:labels.filter(label=>label.classList.contains('is-fit-label') && label.clientHeight>=44 &&
          label.firstElementChild.scrollHeight<=label.firstElementChild.clientHeight+2).length,
        coversMarker:bounds.some(rect=>markers.some(marker=>intersects(rect,marker)))};
    })()`);
    assert.ok(labels.count>=minimum,`Expected at least ${minimum} readable Loom labels: ${JSON.stringify(labels)}`);
    assert.deepEqual(labels.clipped,[],'Loom labels must fit inside the stage');
    assert.equal(labels.overlapping,false,'Visible Loom labels must not overlap');
    if (fitted) {
      assert.equal(labels.fitted,minimum,'Every node in the mobile overview needs a readable touch-sized label');
      assert.equal(labels.coversMarker,false,'Overview labels must clear every glyph');
    }
  }
  async function assertVisibleContextWires() {
    const clip=await evaluate(`(() => {
      const stage=document.querySelector('#graph-loom-canvas').getBoundingClientRect();
      return {x:stage.left+scrollX,y:stage.top+scrollY,width:stage.width,height:stage.height,scale:1};
    })()`);
    const {data}=await command('Page.captureScreenshot',{format:'png',clip,captureBeyondViewport:true});
    const pixels=await evaluate(`(async () => {
      const source=document.querySelector('#graph-loom-canvas');
      const bitmap=await createImageBitmap(await (await fetch('data:image/png;base64,${data}')).blob());
      const canvas=document.createElement('canvas');
      canvas.width=bitmap.width;canvas.height=bitmap.height;
      const context=canvas.getContext('2d',{willReadFrequently:true});
      const palette=getComputedStyle(source);
      const [paper,wire]=['--atlas-paper','--atlas-border-strong'].map(token=>{
        context.fillStyle=palette.getPropertyValue(token).trim();
        context.fillRect(0,0,1,1);
        return context.getImageData(0,0,1,1).data;
      });
      context.drawImage(bitmap,0,0);
      const image=context.getImageData(8,8,canvas.width-16,canvas.height-16).data;
      let count=0;
      for(let i=0;i<image.length;i+=4) {
        const alpha=(paper[0]-image[i])/(paper[0]-wire[0]);
        if(alpha<.68||alpha>.98)continue;
        if([1,2].every(channel=>Math.abs(image[i+channel]-(paper[channel]*(1-alpha)+wire[channel]*alpha))<=2)) count++;
      }
      return count;
    })()`);
    assert.ok(pixels>120,`Full map must paint visible context wires while the root is selected. Found ${pixels} pixels.`);
  }
  async function assertWireframePresentation(viewport) {
    const presentation=await evaluate(`(()=>{
      const svg=document.querySelector('#graph-canvas'),root=svg.querySelector('.network-node.is-root');
      const color=token=>{const probe=document.createElement('span');probe.style.color='var('+token+')';document.body.append(probe);const value=getComputedStyle(probe).color;probe.remove();return value;};
      const rect=element=>{const r=element.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};
      const captions=[...svg.querySelectorAll('.network-edge-caption[visibility="visible"]')].map(element=>({title:element.querySelector('title').textContent,rect:rect(element)}));
      const nodes=[...svg.querySelectorAll('.network-node')].map(element=>{
        const shell=element.querySelector('.node-shell').getBBox(),label=element.querySelector('.node-label').getBBox(),kind=element.querySelector('.node-kind').getBBox();
        return {id:element.dataset.node,rect:rect(element),shell:{x:shell.x,y:shell.y,width:shell.width,height:shell.height},label:{x:label.x,y:label.y,width:label.width,height:label.height},kind:{x:kind.x,y:kind.y,width:kind.width,height:kind.height},font:getComputedStyle(element.querySelector('.node-label')).fontFamily};
      });
      const canvas=svg.closest('.network-canvas'),rail=document.querySelector('#graph-detail');
      const rootShell=getComputedStyle(root.querySelector('.node-shell'));
      return {title:document.querySelector('h1').textContent,mastheads:document.querySelectorAll('[data-atlas-masthead="graph"]').length,
        activeRoute:document.querySelector('[data-atlas-explorer-actions] [data-atlas-view="graph"]')?.getAttribute('aria-current'),mastheadViews:document.querySelectorAll('.atlas-masthead [data-atlas-view]').length,
        toolbarOwnsControls:['graph-depth','graph-list-toggle','graph-filters','graph-pin'].every(id=>document.getElementById(id).closest('.network-toolbar')),
        scopeOwnsControls:['graph-query','atlas-hq-value','atlas-sector','atlas-stage'].every(id=>document.getElementById(id).closest('.graph-filter-tray')),
        rootFill:rootShell.fill,rootStroke:rootShell.stroke,accent:color('--atlas-accent'),surface:color('--atlas-surface'),rootText:getComputedStyle(root.querySelector('.node-label')).fill,ink:color('--atlas-ink'),
        noGrid:getComputedStyle(canvas).backgroundImage==='none',canvas:rect(canvas),rail:rect(rail),
        mark:rect(rail.querySelector('.detail-mark')),railTitle:rect(rail.querySelector('h2')),
        dock:[...svg.closest('.network-panel').querySelectorAll('.network-scale button')].map(rect),captions,nodes,list:document.querySelector('#graph-list').textContent};
    })()`);
    assert.equal(presentation.title,'Canva / Relationships');
    assert.equal(presentation.mastheads,1,'Graph must use one shared masthead');
    assert.equal(presentation.activeRoute,'page','The page toolbar must identify the graph route');
    assert.equal(presentation.mastheadViews,0,'The masthead must leave explorer views to the page toolbar');
    assert.equal(presentation.toolbarOwnsControls,true,'Relationship controls belong beside the graph');
    assert.equal(presentation.scopeOwnsControls,true,'Search and company facets share the warm tray');
    assert.equal(presentation.rootFill,presentation.surface,'The map root must be a white identity card');
    assert.equal(presentation.rootText,presentation.ink,'Graph titles use forest ink');
    if(viewport==='desktop') {
      assert.equal(presentation.rootStroke,presentation.accent,'The selected root has a rust outline');
      assert.ok(presentation.rail.x>presentation.canvas.x+presentation.canvas.width,'The inspector must sit beside the chart');
      assert.ok(presentation.mark.width>=150&&presentation.mark.y<presentation.railTitle.y,'A company wordmark leads the inspector');
      const root=presentation.nodes.find(node=>node.id==='startup:canva');
      assert.ok(presentation.nodes.filter(node=>node.id.startsWith('person:')).every(node=>node.rect.x<root.rect.x),'Founders sit to the left of the selected company');
    }
    assert.equal(presentation.noGrid,true,'The graph uses a solid paper canvas');
    assert.ok(presentation.dock.every(button=>Math.abs(button.y-presentation.dock[0].y)<=1),viewport+' camera controls must form a horizontal dock');
    assert.ok(presentation.dock[0].y>=presentation.canvas.y+presentation.canvas.height,'Camera controls belong below the canvas');
    for(const node of presentation.nodes){
      assert.match(node.font,/^"?Atlas Newsreader/i,'Graph identity names must share the editorial display typeface');
      for(const [name,box] of [['name',node.label],['kind',node.kind]]){
        assert.ok(box.x>=node.shell.x&&box.x+box.width<=node.shell.x+node.shell.width-3,viewport+' '+node.id+' '+name+' must fit its identity card: '+JSON.stringify(node));
        assert.ok(box.y>=node.shell.y&&box.y+box.height<=node.shell.y+node.shell.height-2,viewport+' '+node.id+' '+name+' must fit vertically');
      }
    }
    assert.ok(presentation.captions.length>0,viewport+' sparse maps must expose a readable predicate');
    const overlaps=(a,b)=>a.x<b.x+b.width-1&&a.x+a.width>b.x+1&&a.y<b.y+b.height-1&&a.y+a.height>b.y+1;
    for(let i=0;i<presentation.captions.length;i++){
      const caption=presentation.captions[i];
      assert.ok(presentation.list.includes(caption.title),'A visible caption must repeat a real predicate from the evidence list');
      assert.ok(!presentation.nodes.some(node=>overlaps(caption.rect,node.rect)),viewport+' predicate caption must not cover a node card');
      assert.ok(!presentation.captions.slice(i+1).some(other=>overlaps(caption.rect,other.rect)),viewport+' predicate captions must not overlap');
    }
  }
  async function move(type,x,y,button='none',buttons=0) {
    await command('Input.dispatchMouseEvent',{type,x,y,button,buttons,clickCount:1});
  }
  async function drag(x,y,dx,dy) {
    await move('mouseMoved',x,y);
    await move('mousePressed',x,y,'left',1);
    await move('mouseMoved',x+dx,y+dy,'left',1);
    await move('mouseReleased',x+dx,y+dy,'left',0);
  }
  async function screenshot(name) {
    await mkdir(screenshotDir,{recursive:true});
    const image=await command('Page.captureScreenshot',{format:'png'});
    await writeFile(join(screenshotDir,name),Buffer.from(image.data,'base64'));
  }
  captureFailure=screenshot;
  readDiagnostics=async()=>({
    state:await evaluate(`(()=>{
      const node=document.querySelector('[data-node="person:melanie-perkins"]'),r=node?.getBoundingClientRect();
      const x=r?.x+r?.width/2,y=r?.y+r?.height/2,hit=Number.isFinite(x)&&Number.isFinite(y)?document.elementFromPoint(x,y):null;
      return {url:location.href,scrollY,viewport:{width:innerWidth,height:innerHeight},
        node:r?{x:r.x,y:r.y,width:r.width,height:r.height,transform:node.getAttribute('transform')}:null,
        hit:hit?.outerHTML?.slice(0,400)};
    })()`).catch(()=>'<unavailable>'),exceptions,browserMessages,
  });
  await command('Page.enable');await command('Runtime.enable');
  const {identifier:fallbackScript}=await command('Page.addScriptToEvaluateOnNewDocument',{source:`(()=>{
    const getContext=HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext=function(type,...options) {
      return type==='webgl2'?null:getContext.call(this,type,...options);
    };
  })()`});
  await command('Emulation.setDeviceMetricsOverride',{width:1586,height:992,deviceScaleFactor:1,mobile:false});
  await command('Page.navigate',{url:`${address}/graph.html?entity=startup%3Acanva`});
  try {
    await until(()=>evaluate("!!document.querySelector('[data-node=\"person:melanie-perkins\"]') && document.querySelector('#graph-detail h2')?.textContent==='Canva'"),'Graph did not render');
  } catch(error) {
    console.error('Graph diagnostics:',await evaluate("JSON.stringify({url:location.href,title:document.title,ready:document.readyState,status:document.querySelector('#graph-status')?.textContent,detail:document.querySelector('#graph-detail')?.textContent,svg:document.querySelector('#graph-canvas')?.textContent})").catch(()=>'<unavailable>'));
    console.error('Requests:',JSON.stringify(requests),'Exceptions:',JSON.stringify(exceptions),'Console:',JSON.stringify(browserMessages));
    await screenshot('failed-desktop.png').catch(()=>{});
    throw error;
  }
  await assertGraphControlSizes('desktop');
  await assertWireframePresentation('desktop');
  await screenshot('graph-wireframe-desktop.png');
  await evaluate("document.querySelector('#graph-canvas').scrollIntoView({block:'center',behavior:'instant'})");
  const nodeExpression="document.querySelector('[data-node=\"person:melanie-perkins\"]')";
  const before=await evaluate(`${nodeExpression}.getAttribute('transform')`);
  const neighbourBefore=await evaluate("document.querySelector('[data-node=\"startup:canva\"]').getAttribute('transform')");
  // The site uses smooth scrolling. Wait until the actual pointer target is at
  // the measured position; an in-flight scroll can otherwise move it between
  // measuring the rectangle and dispatching the mouse press.
  const rect=await until(async()=>{
    const point=await evaluate(`(()=>{const r=${nodeExpression}.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return {x,y,hit:document.elementFromPoint(x,y)?.closest('[data-node]')?.getAttribute('data-node')};})()`);
    return point?.hit==='person:melanie-perkins'?point:null;
  },'The founder node was not reachable at its measured position');
  await drag(rect.x,rect.y,65,40);
  const moved=await evaluate(`${nodeExpression}.getAttribute('transform')`);
  assert.notEqual(moved,before,'Dragging must move the node');
  await until(async()=>await evaluate("document.querySelector('[data-node=\"startup:canva\"]').getAttribute('transform')")!==neighbourBefore,'A connected node did not respond to the force simulation');
  assert.equal(await evaluate("document.querySelector('#graph-detail h2').textContent"),'Canva','Dragging must not change the selected profile');
  await evaluate(`${nodeExpression}.focus()`);
  await command('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});
  await command('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});
  const keyboard=await evaluate(`${nodeExpression}.getAttribute('transform')`);
  assert.notEqual(keyboard,moved,'Arrow keys must move the focused node');
  await evaluate("document.querySelector('.network-types summary').click()");
  assert.equal(await evaluate("document.querySelector('#graph-filters').checkVisibility()"),true,'Entity types exposes the existing type controls');
  await evaluate("document.querySelector('#graph-filters button[data-kind=person]').click();document.querySelector('#graph-filters button[data-kind=person]').click()");
  await evaluate("document.querySelector('.network-types summary').click()");
  const restored=await evaluate(`${nodeExpression}.getAttribute('transform')`);
  const coordinates=value=>value.match(/-?\d+(?:\.\d+)?/g).map(Number);
  const keyboardPosition=coordinates(keyboard);
  const restoredPosition=coordinates(restored);
  // Rerendering serializes the saved SVG position to one decimal place.
  assert.ok(restoredPosition.every((value,index)=>Math.abs(value-keyboardPosition[index])<=.051),
    'Filtering must retain the node position within SVG serialization precision');
  const canvasRect=await evaluate("(()=>{const r=document.querySelector('#graph-canvas').getBoundingClientRect();return {x:r.x+15,y:r.y+15};})()");
  const viewBox=await evaluate("document.querySelector('#graph-canvas').getAttribute('viewBox')");
  await drag(canvasRect.x,canvasRect.y,45,25);
  assert.notEqual(await evaluate("document.querySelector('#graph-canvas').getAttribute('viewBox')"),viewBox,'Dragging the background must pan');
  await evaluate("document.querySelector('#graph-zoom-in').click()");
  const inspectedViewBox=await evaluate("document.querySelector('#graph-canvas').getAttribute('viewBox')");
  const placedNodes=await evaluate("[...document.querySelectorAll('.network-node')].map(node=>[node.dataset.node,node.getAttribute('transform')])");
  async function restoreInspection(id) {
    await evaluate(`(()=>{const url=new URL(location.href);url.searchParams.set('selected',${JSON.stringify(id)});
      history.pushState(null,'',url);window.dispatchEvent(new PopStateEvent('popstate'));})()`);
  }
  await restoreInspection('person:melanie-perkins');
  await evaluate(`${nodeExpression}.focus({preventScroll:true})`);
  await command('Input.dispatchKeyEvent',{type:'keyDown',key:'a',code:'KeyA',windowsVirtualKeyCode:65});
  await command('Input.dispatchKeyEvent',{type:'keyUp',key:'a',code:'KeyA',windowsVirtualKeyCode:65});
  assert.equal(await evaluate("document.querySelector('#graph-detail h2').textContent"),'Melanie Perkins','A saved selection highlights the named record');
  assert.equal(await evaluate("new URLSearchParams(location.search).get('entity')"),'startup:canva','Inspection must keep the map root');
  assert.equal(await evaluate("new URLSearchParams(location.search).get('selected')"),'person:melanie-perkins');
  assert.equal(await evaluate("document.querySelector('.network-node.is-root').dataset.node"),'startup:canva');
  assert.equal(await evaluate(`${nodeExpression}.getAttribute('aria-pressed')`),'true');
  assert.equal(await evaluate("document.activeElement?.getAttribute('data-node')"),'person:melanie-perkins','Keyboard inspection must retain node focus');
  const focusedSelection=await evaluate(`(()=>{const selected=document.querySelector('.network-node.is-selected'),root=document.querySelector('.network-node.is-root');return {rootFill:getComputedStyle(root.querySelector('.node-shell')).fill,selectedFill:getComputedStyle(selected.querySelector('.node-shell')).fill,selectedStroke:getComputedStyle(selected.querySelector('.node-shell')).stroke,rootStroke:getComputedStyle(root.querySelector('.node-shell')).stroke,focusDash:getComputedStyle(selected.querySelector('.node-shell')).strokeDasharray,focused:selected.matches(':focus-visible')};})()`);
  assert.notEqual(focusedSelection.selectedFill,focusedSelection.rootFill,'Inspection must stay visually distinct from the root');
  assert.notEqual(focusedSelection.selectedStroke,focusedSelection.rootStroke,'The inspected card needs a distinct outline');
  assert.equal(focusedSelection.focused,true,'Keyboard inspection must retain visible focus');
  assert.notEqual(focusedSelection.focusDash,'none','Focused graph cards need the distinct dashed focus treatment');
  assert.equal(await evaluate("document.querySelector('#graph-canvas').getAttribute('viewBox')"),inspectedViewBox,'Inspection must retain pan and zoom');
  assert.deepEqual(await evaluate("[...document.querySelectorAll('.network-node')].map(node=>[node.dataset.node,node.getAttribute('transform')])"),placedNodes,'Inspection must retain manual placement and graph geometry');
  assert.ok(await evaluate("document.querySelectorAll('.network-link.is-selected').length")>0,'Inspection must identify adjacent edges');
  assert.ok(await evaluate("document.querySelectorAll('#graph-detail .detail-related a[href^=\"https://\"]').length")>0,'Inspector relationships must expose their evidence');
  await restoreInspection('startup:fusion-books');
  assert.equal(await evaluate("document.querySelector('#graph-detail h2').textContent"),'Fusion Books');
  assert.match(await evaluate("document.querySelector('.detail-selection-note').textContent"),/outside this map/);
  assert.equal(await evaluate("new URLSearchParams(location.search).get('entity')"),'startup:canva','Inspecting an off-map relationship must retain the map');
  assert.deepEqual(await evaluate("[...document.querySelectorAll('.network-node')].map(node=>[node.dataset.node,node.getAttribute('transform')])"),placedNodes);
  await evaluate('history.back()');
  await until(()=>evaluate("document.querySelector('#graph-detail h2')?.textContent==='Melanie Perkins'"),'Back did not restore the previous inspected profile');
  assert.equal(await evaluate("document.querySelector('#graph-canvas').getAttribute('viewBox')"),inspectedViewBox,'Back within one root must retain the viewport');
  await evaluate("document.querySelector('#graph-fit').click()");
  assert.deepEqual(await evaluate("[...document.querySelectorAll('.network-node')].map(node=>[node.dataset.node,node.getAttribute('transform')])"),placedNodes,'Fit view must preserve manual node positions');
  assert.notEqual(await evaluate("document.querySelector('#graph-canvas').getAttribute('viewBox')"),inspectedViewBox,'Fit view must adjust the panned and zoomed viewport');
  assert.equal(await evaluate("document.querySelector('#graph-zoom-number').textContent"),'100%');
  assert.equal(await evaluate("document.querySelector('#graph-pin').getAttribute('aria-pressed')"),'true','A manually moved selection shows its pinned state');
  await evaluate("document.querySelector('#graph-pin').click()");
  assert.equal(await evaluate("document.querySelector('#graph-pin').getAttribute('aria-pressed')"),'false','The toolbar can release a pinned node');
  await evaluate("document.querySelector('#graph-list-toggle').click()");
  assert.equal(await evaluate("document.querySelector('#graph-list').hidden"),false);
  assert.ok(await evaluate("document.querySelectorAll('#graph-list a[href^=\"https://\"]').length")>0,'List must show evidence links');
  await evaluate("document.querySelector('#graph-reset').click()");
  assert.deepEqual(coordinates(await evaluate(`${nodeExpression}.getAttribute('transform')`)).map(Math.round),coordinates(before).map(Math.round),'Reset must restore automatic placement');
  await screenshot('desktop.png');
  await evaluate(`${nodeExpression}.focus({preventScroll:true})`);
  await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
  await command('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
  assert.equal(await evaluate("new URLSearchParams(location.search).get('entity')"),'person:melanie-perkins','Enter follows the focused node to its neighbourhood');
  assert.equal(await evaluate("new URLSearchParams(location.search).get('selected')"),'person:melanie-perkins');
  assert.equal(await evaluate("document.querySelector('.network-node.is-root').dataset.node"),'person:melanie-perkins');
  assert.ok(await evaluate("!!document.querySelector('[data-node=\"startup:fusion-books\"]')"),'The new neighbourhood must include the founder’s other sourced venture');
  await screenshot('desktop-explored.png');
  await evaluate('history.back()');
  await until(()=>evaluate("document.querySelector('.network-node.is-root')?.dataset.node==='startup:canva' && document.querySelector('#graph-detail h2')?.textContent==='Melanie Perkins'"),'Back did not restore map root and inspected profile');
  // A shareable URL must restore actual filters and selection after a full load.
  await command('Page.navigate',{url:`${address}/graph.html?entity=startup%3Acanva&selected=person%3Amelanie-perkins&depth=2&types=startup,person&list=1`});
  await until(()=>evaluate("document.querySelector('#graph-detail h2')?.textContent==='Melanie Perkins' && !!document.querySelector('[data-node=\"startup:fusion-books\"]')"),'The shared two-hop selection did not load');
  assert.equal(await evaluate("document.querySelector('#graph-depth').value"),'2');
  assert.equal(await evaluate("document.querySelector('#graph-filters button[data-kind=partner]').getAttribute('aria-pressed')"),'false');
  assert.equal(await evaluate("document.querySelector('#graph-list').hidden"),false);
  assert.equal(await evaluate("!!document.querySelector('[data-node=\"partner:airtree\"]')"),false);
  await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  const mobileReloadGeneration=navigationCount;
  await command('Page.reload');
  await until(async()=>navigationCount>mobileReloadGeneration,'Mobile reload did not commit');
  await until(()=>evaluate("!!document.querySelector('[data-node=\"startup:canva\"]')"),'Mobile graph did not render');
  await assertGraphControlSizes('mobile');
  await assertWireframePresentation('mobile');
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.network-map-guide')).display"),'block','Mobile users should see the map/list guidance');
  assert.ok(await evaluate("document.querySelector('#graph-list-toggle').getBoundingClientRect().height>=44"),'The mobile list toggle must have a touch-sized target');
  assert.ok(await evaluate("[...document.querySelectorAll('#graph-list li button')].every(button=>button.getBoundingClientRect().height>=44)"),'Mobile relationship controls must have touch-sized targets');
  assert.ok(await evaluate("[...document.querySelectorAll('#graph-list li')].every(row=>{const [from,to]=row.querySelectorAll('button'), relation=row.querySelector('span');return from.getBoundingClientRect().bottom<=relation.getBoundingClientRect().top+1 && relation.getBoundingClientRect().bottom<=to.getBoundingClientRect().top+1})"),'Mobile relationship rows must read from entity to predicate to entity');
  await screenshot('graph-wireframe-mobile.png');
  await evaluate("document.querySelector('#graph-canvas').scrollIntoView({block:'center',behavior:'instant'})");
  assert.equal(await evaluate("document.querySelector('#graph-detail h2').textContent"),'Melanie Perkins','Reload must restore the selected profile independently of the root');
  assert.equal(await evaluate("document.querySelector('.network-node.is-root').dataset.node"),'startup:canva');
  assert.equal(await evaluate("document.querySelector('#graph-depth').value"),'2');
  assert.equal(await evaluate("document.querySelector('#graph-list').hidden"),false);
  assert.ok(await evaluate("document.documentElement.scrollWidth<=innerWidth"),'Mobile graph must not overflow the page horizontally');
  await screenshot('mobile.png');
  await evaluate("document.querySelector('#graph-query').value='Melanie';document.querySelector('#graph-query').dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('#graph-search').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))");
  await until(()=>evaluate("!document.querySelector('#graph-results').hidden && !!document.querySelector('#graph-results [data-explore=\"person:melanie-perkins\"]')"),'Search did not render matching entities');
  assert.equal(await evaluate("document.querySelector('[data-atlas-clear-for=\"graph-query\"]').hidden"),false);
  await evaluate("document.querySelector('[data-atlas-clear-for=\"graph-query\"]').click()");
  assert.equal(await evaluate("document.querySelector('#graph-query').value"),'');
  assert.equal(await evaluate("document.querySelector('#graph-results').hidden"),true,'Clear must hide search results immediately');
  assert.equal(await evaluate("new URLSearchParams(location.search).has('q')"),false);
  assert.equal(await evaluate("document.activeElement?.id"),'graph-query','Clear returns focus to the query');

  await command('Emulation.setDeviceMetricsOverride',{width:1280,height:720,deviceScaleFactor:1,mobile:false});
  await command('Page.navigate',{url:`${address}/graph.html?entity=startup%3Acanva&selected=person%3Acameron-adams`});
  await until(()=>evaluate("document.querySelector('#graph-detail h2')?.textContent==='Cameron Adams'"),'The zoomed keyboard fixture did not load');
  await evaluate(`(() => {
    document.querySelector('#graph-fit').click();
    for(let step=0;step<4;step++) document.querySelector('#graph-zoom-in').click();
    document.querySelector('#graph-center').click();
    document.querySelector('.network-node[data-node="person:cameron-adams"]').focus();
  })()`);
  const nodeCount=await evaluate(`(() => {
    const nodes=[...document.querySelectorAll('.network-node')];
    return nodes.length-1-nodes.indexOf(document.activeElement);
  })()`);
  assert.ok(nodeCount>=3,'The focused node must precede more nodes in the zoomed keyboard order');
  for(let index=0;index<nodeCount;index++) {
    await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
    await command('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
    const focused=await evaluate(`(() => {
      const node=document.activeElement;
      const card=node.querySelector('.node-shell')?.getBoundingClientRect();
      const canvas=document.querySelector('#graph-canvas').getBoundingClientRect();
      return {id:node.dataset.node || node.id,visible:!!card && card.left>=canvas.left-1 && card.right<=canvas.right+1
        && card.top>=canvas.top-1 && card.bottom<=canvas.bottom+1};
    })()`);
    assert.ok(focused.visible,`Zoomed graph keyboard focus must reveal its node: ${JSON.stringify(focused)}`);
  }
  assert.equal(await evaluate("document.querySelector('#graph-detail h2').textContent"),'Cameron Adams');

  await command('Emulation.setDeviceMetricsOverride',{width:320,height:480,deviceScaleFactor:1,mobile:true});
  await command('Page.navigate',{url:`${address}/graph.html?entity=startup%3Acanva`});
  await until(()=>evaluate("document.querySelector('#graph-detail h2')?.textContent==='Canva'&&document.querySelector('#graph-list').hidden"),'The short graph viewport did not settle');
  await evaluate('document.fonts.ready.then(()=>true)');
  assert.ok(await evaluate(`(() => {
    const canvas=document.querySelector('.network-canvas').getBoundingClientRect();
    return canvas.top<innerHeight-32 && document.documentElement.scrollWidth<=innerWidth;
  })()`),'A short phone must see the canvas start without sideways overflow');
  await evaluate("document.querySelector('#graph-list-toggle').focus()");
  await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r',unmodifiedText:'\r'});
  await command('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
  await until(()=>evaluate(`(() => {
    const heading=document.querySelector('#graph-list h3');
    const bounds=heading.getBoundingClientRect();
    return document.activeElement===heading && bounds.top>=0 && bounds.bottom<innerHeight
      && document.querySelector('.network-node.is-root').dataset.node==='startup:canva';
  })()`),'Opening Connections list must reveal and focus the list while preserving the graph root');

  await command('Page.removeScriptToEvaluateOnNewDocument',{identifier:fallbackScript});
  await command('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  await command('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await command('Page.navigate',{url:`${address}/graph.html?entity=startup%3Acanva`});
  const loomReady="document.querySelector('.network-canvas')?.dataset.renderer==='loom'";
  const graph=JSON.parse(await readFile(join(root,'data','graph.json'),'utf8'));
  const airtree='partner:airtree', person='person:melanie-perkins', next='startup:fusion-books';
  await until(()=>evaluate(`${loomReady}&&document.querySelector('#graph-loom-controls .is-root')?.dataset.node==='startup:canva'`),'Loom did not render the real graph');
  await evaluate("document.querySelector('#graph-loom-canvas').scrollIntoView({block:'center',behavior:'instant'})");
  await evaluate('document.fonts.ready.then(()=>true)');
  await assertLoomLabels(7);
  const airtreeNode=`#graph-loom-controls [data-node="${airtree}"]`;
  const pan=await evaluate(`(() => {
    const canvas=document.querySelector('#graph-loom-canvas').getBoundingClientRect();
    const rect=document.querySelector('${airtreeNode}').getBoundingClientRect();
    return {x:canvas.left+canvas.width/4,y:canvas.top+24,dx:canvas.right-rect.right+rect.width/2};
  })()`);
  await move('mousePressed',pan.x,pan.y,'left',1);
  await move('mouseMoved',pan.x+pan.dx,pan.y,'left',1);
  await move('mouseReleased',pan.x+pan.dx,pan.y,'left');
  await until(()=>evaluate(`(() => {
    const canvas=document.querySelector('#graph-loom-canvas').getBoundingClientRect();
    const rect=document.querySelector('${airtreeNode}').getBoundingClientRect();
    return rect.left<canvas.right && rect.right>canvas.right;
  })()`),'The focus test must pan Airtree partly out of view');
  await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
  await command('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
  await evaluate(`document.querySelector('${airtreeNode}').focus({preventScroll:true})`);
  await until(()=>evaluate(`(() => {
    const node=document.querySelector('${airtreeNode}');
    const canvas=document.querySelector('#graph-loom-canvas').getBoundingClientRect(), rect=node.getBoundingClientRect();
    return document.activeElement===node && node.matches(':focus-visible') && rect.right<canvas.right-5 && rect.left>canvas.left+5;
  })()`),'Keyboard focus must bring a partly clipped Loom node fully into view');
  assert.equal(await evaluate("document.querySelector('#graph-zoom-number').textContent"),'100%','Keyboard reveal must retain the current zoom');
  await evaluate("document.querySelector('#graph-fit').click()");
  await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  await until(()=>evaluate(`(() => {
    const mark=document.querySelector('${airtreeNode} .network-loom-mark');
    const img=mark.querySelector('img');
    return mark.dataset.logo==='loaded' && mark.classList.contains('logo-on-dark') &&
      img.naturalWidth/img.naturalHeight>3 && getComputedStyle(img).objectFit==='contain';
  })()`),'The complete Airtree wordmark must load against its dark surface');
  const namePoint=await until(()=>evaluate(`(() => {
    const label=document.querySelector('${airtreeNode} .network-loom-label');
    const rect=label.getBoundingClientRect(),x=rect.x+rect.width/2,y=rect.y+rect.height/2;
    return !label.hidden && document.elementFromPoint(x,y)===label && {x,y};
  })()`),'The Airtree name must be a usable traversal target');
  await move('mousePressed',namePoint.x,namePoint.y,'left',1);
  await move('mouseReleased',namePoint.x,namePoint.y,'left');
  await until(()=>evaluate(`${loomReady}&&document.querySelector('#graph-loom-controls .is-root')?.dataset.node==='${airtree}'`),'Clicking the Airtree label must follow its links');
  const airtreeEdge=graph.edges.find(edge=>edge.from===airtree && edge.to==='startup:canva');
  assert.equal(await evaluate("document.querySelector('.detail-relation-evidence h3').textContent"),'Relationship followed');
  assert.equal(await evaluate("document.querySelector('.detail-relation-evidence a').href"),airtreeEdge.source);
  assert.equal(await evaluate("document.querySelector('#graph-back').getAttribute('aria-label')"),'Previous view: Canva');
  await evaluate("document.querySelector('#graph-back').click()");
  await until(()=>evaluate(`document.querySelector('#graph-loom-controls .is-root')?.dataset.node==='startup:canva'`),'Previous view must restore Canva');
  const point=await until(()=>evaluate(`(()=>{
    const rect=document.querySelector('#graph-loom-controls [data-node="${person}"]').getBoundingClientRect();
    const x=rect.x+rect.width/2,y=rect.y+rect.height/2;
    return document.elementFromPoint(x,y)?.id==='graph-loom-canvas'&&{x,y};
  })()`),'Loom node is outside the clickable map');
  await move('mousePressed',point.x,point.y,'left',1);
  await move('mouseReleased',point.x,point.y,'left');
  await until(()=>evaluate(`${loomReady}&&document.querySelector('#graph-loom-controls .is-root')?.dataset.node==='${person}'`),'Clicking a Loom node must follow the relationship');
  assert.equal(await evaluate("document.querySelector('#graph-detail h2').textContent"),'Melanie Perkins');
  assert.equal(await evaluate(`new URLSearchParams(location.search).get('entity')`),person);
  assert.ok(await evaluate(`!!document.querySelector('#graph-detail [data-select="${next}"]')`),'The new neighbourhood exposes the next recorded relationship');
  await screenshot('graph-loom-followed.png');
  await evaluate(`document.querySelector('#graph-loom-controls [data-node="${next}"]').focus({preventScroll:true})`);
  await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r',unmodifiedText:'\r'});
  await command('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
  await until(()=>evaluate(`new URLSearchParams(location.search).get('entity')==='${next}'&&document.activeElement.dataset.node==='${next}'`),'Keyboard traversal did not focus the new Loom root');
  await evaluate('history.back()');
  await until(()=>evaluate(`${loomReady}&&document.querySelector('#graph-loom-controls .is-root')?.dataset.node==='${person}'`),'Back did not restore the prior Loom neighbourhood');
  assert.equal(await evaluate('document.activeElement.dataset.node'),person,'Back must restore keyboard focus to the map');

  await command('Emulation.setDeviceMetricsOverride',{width:320,height:740,deviceScaleFactor:1,mobile:true});
  const blockedPortrait='person:ben-simai--startmate';
  const portraitUrl=graph.entities.find(entity=>entity.id===blockedPortrait).logo;
  await command('Network.enable');
  await command('Network.setBlockedURLs',{urls:[portraitUrl]});
  await command('Page.navigate',{url:`${address}/graph.html?entity=partner%3Astartmate&depth=2&list=1`});
  const startmate='partner:startmate';
  const neighbourhood=neighborhood(graph,startmate,{depth:2,limit:Infinity});
  const startmateEdges=neighbourhood.edges.filter(edge=>edge.from===startmate||edge.to===startmate);
  const expectedSources=neighbourhood.edges.map(edge=>sourceUrl(edge.source)).filter(Boolean).sort();
  const listSources="[...document.querySelectorAll('#graph-list li a')].map(link=>link.href).sort()";
  const loomNodeCount="document.querySelectorAll('#graph-loom-controls .network-node').length";
  await until(()=>evaluate(`${loomReady}&&document.querySelector('#graph-loom-controls .is-root')?.dataset.node==='partner:startmate'`),'The dense mobile Loom map did not load');
  assert.ok(startmateEdges.length>19,'The Startmate test must exceed the old node cap');
  assert.equal(await evaluate("document.querySelectorAll('#graph-detail .detail-related li').length"),startmateEdges.length);
  assert.equal(await evaluate("document.querySelectorAll('#graph-list li').length"),neighbourhood.edges.length,'The mobile list retains the entire neighbourhood');
  assert.deepEqual(await evaluate(listSources),expectedSources,'The overview list must retain every matched source');
  assert.equal(await evaluate(loomNodeCount),6,'Mobile Fit should show the root and five direct neighbours');
  for(const [width,height] of [[320,740],[390,844],[667,375]]) {
    await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true});
    await evaluate('document.fonts.ready.then(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))');
    await assertLoomLabels(6,true);
    assert.equal(await evaluate("document.querySelector('#graph-zoom-number').textContent"),'100%');
    assert.ok(await evaluate("document.documentElement.scrollWidth<=innerWidth"),`Overview must fit the ${width}px document`);
  }
  await command('Emulation.setDeviceMetricsOverride',{width:320,height:740,deviceScaleFactor:1,mobile:true});
  await until(()=>evaluate(`(() => {
    const dock=document.querySelector('.network-panel .network-scale'), bounds=dock.getBoundingClientRect();
    return innerWidth===320 && document.documentElement.scrollWidth<=innerWidth && [...dock.querySelectorAll('button,output')].every(control=>{
      const rect=control.getBoundingClientRect();
      return rect.bottom<=bounds.top+45 && rect.right<=innerWidth && (control.tagName!=='BUTTON' || rect.height>=44);
    });
  })()`),'The camera controls must fit on one row at 320px');
  await evaluate("document.querySelector('#graph-zoom-in').click();document.querySelector('#graph-fit').click()");
  await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  await assertLoomLabels(6,true);
  await evaluate("document.querySelector('#graph-loom-canvas').scrollIntoView({block:'center',behavior:'instant'})");
  await until(()=>evaluate(`(() => {
    const mark=document.querySelector('[data-node="${blockedPortrait}"] .network-loom-mark');
    return mark?.dataset.logo==='unavailable' && !mark.querySelector('span').hidden && mark.textContent==='BS';
  })()`),'A blocked portrait must leave visible initials in the graph');
  assert.ok(await evaluate(`(() => {
    const mark=document.querySelector('[data-node="provider:launchvic"] .network-loom-mark');
    return mark?.classList.contains('logo-on-dark') && getComputedStyle(mark.querySelector('img')).objectFit==='contain';
  })()`),'The published light LaunchVic wordmark must fit on a dark tile');
  await screenshot('graph-loom-mobile-fit.png');
  await evaluate("document.querySelector('#graph-full-map').click()");
  await until(()=>evaluate(`${loomNodeCount}===${neighbourhood.nodes.length}`),'Full map must draw the complete neighbourhood');
  assert.equal(await evaluate("document.querySelector('#graph-full-map').getAttribute('aria-pressed')"),'true');
  assert.deepEqual(await evaluate(listSources),expectedSources,'Changing the map view must keep the list sources');
  await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  await assertVisibleContextWires();
  const zoomPercent="parseInt(document.querySelector('#graph-zoom-number').textContent,10)";
  for(let step=0;step<4;step++) {
    const before=await evaluate(zoomPercent);
    await evaluate("document.querySelector('#graph-zoom-in').click()");
    await until(()=>evaluate(`${zoomPercent}>${before}`),'Each zoom step must reach the full map');
  }
  await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  await assertLoomLabels(2);
  await evaluate("document.querySelector('#graph-full-map').click()");
  await until(()=>evaluate(`${loomNodeCount}===6 && document.querySelectorAll('.network-loom-label.is-fit-label:not([hidden])').length===6`),'Turning off Full map must restore all labels in the mobile overview');
  await assertLoomLabels(6,true);

  await command('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
  await evaluate("document.querySelector('#graph-loom-canvas').scrollIntoView({block:'center',behavior:'instant'})");
  const overviewTap=await until(()=>evaluate(`(() => {
    const label=document.querySelector('#graph-loom-controls .network-node:not(.is-root) .network-loom-label.is-fit-label');
    const rect=label?.getBoundingClientRect();if (!rect) return false;
    const x=rect.x+rect.width/2,y=rect.y+rect.height/2;
    return document.elementFromPoint(x,y)===label && {id:label.closest('button').dataset.node,x,y};
  })()`),'The mobile overview label must be tappable');
  const overviewEdge=startmateEdges.find(edge=>edge.from===overviewTap.id||edge.to===overviewTap.id);
  await command('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:overviewTap.x,y:overviewTap.y}]});
  await command('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await until(()=>evaluate(`document.querySelector('#graph-loom-controls .is-root')?.dataset.node===${JSON.stringify(overviewTap.id)}`),'Tapping a name must open the next neighbourhood');
  assert.equal(await evaluate("document.querySelector('.detail-relation-evidence a').href"),sourceUrl(overviewEdge.source));
  if(overviewTap.id===blockedPortrait) {
    await until(()=>evaluate("!!document.querySelector('.detail-mark[data-logo=unavailable] .detail-mark-fallback:not([hidden])')"),'A blocked portrait must leave initials in the inspector');
  }
  await evaluate("document.querySelector('#graph-back').click()");
  await until(()=>evaluate(`document.querySelector('#graph-loom-controls .is-root')?.dataset.node==='${startmate}'`),'Previous view must restore the mobile overview');
  assert.deepEqual(await evaluate(listSources),expectedSources);
  await command('Network.setBlockedURLs',{urls:[]});

  await command('Page.navigate',{url:`${address}/graph.html?entity=person%3Amelanie-perkins`});
  await until(()=>evaluate(`${loomReady}&&document.querySelector('#graph-loom-controls .is-root')?.dataset.node==='${person}'`),'The touch traversal fixture did not render');
  await evaluate("document.querySelector('#graph-loom-canvas').scrollIntoView({block:'center',behavior:'instant'})");
  const touch=await until(()=>evaluate(`(()=>{
    const rect=document.querySelector('#graph-loom-controls [data-node="${next}"]').getBoundingClientRect();
    const x=rect.x+rect.width/2,y=rect.y+rect.height/2;
    return document.elementFromPoint(x,y)?.id==='graph-loom-canvas'&&{x,y};
  })()`),'Touch cannot reach the next Loom node');
  await command('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[touch]});
  await command('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await until(()=>evaluate(`${loomReady}&&document.querySelector('#graph-loom-controls .is-root')?.dataset.node==='${next}'`),'Tapping a Loom node did not follow its relationships');

  await command('Emulation.setDeviceMetricsOverride',{width:667,height:375,deviceScaleFactor:1,mobile:true});
  await command('Page.navigate',{url:`${address}/graph.html?entity=${encodeURIComponent(person)}`});
  await until(()=>evaluate(`${loomReady}&&document.querySelector('#graph-loom-controls .is-root')?.dataset.node==='${person}'`),'The landscape Loom map did not load');
  assert.ok(await evaluate(`(() => {
    const canvas=document.querySelector('#graph-loom-canvas').getBoundingClientRect();
    return canvas.top<innerHeight-65 && document.documentElement.scrollWidth<=innerWidth;
  })()`),'Landscape must show the Loom canvas in the first viewport');
  await assertLoomLabels(3);

  await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  const alloovium='startup:alloovium';
  const founderIds=['person:zander-schweitzer','person:cielo-nicolosi','person:omar-elloumi'];
  const connections=neighborhood(graph,alloovium,{depth:1,limit:Infinity});
  for (const id of [...founderIds,'partner:y-combinator','partner:lyra-capital','provider:microsoft','provider:procore']) {
    assert.ok(connections.edges.some(edge=>(edge.from===id||edge.to===id)&&sourceUrl(edge.source)),`Missing sourced connection for ${id}`);
  }
  await command('Page.navigate',{url:`${address}/graph.html?entity=${encodeURIComponent(alloovium)}&list=1`});
  await until(()=>evaluate(`${loomReady}&&document.querySelector('#graph-loom-controls .is-root')?.dataset.node==='${alloovium}'`),'Alloovium did not load in the mobile graph');
  await evaluate("document.querySelector('#graph-loom-canvas').scrollIntoView({block:'center',behavior:'instant'})");
  await until(()=>evaluate(`(() => {
    return ${JSON.stringify([alloovium,...founderIds])}.every(id=>{
      const img=document.querySelector('#graph-loom-controls [data-node="'+id+'"] .network-loom-mark[data-logo="loaded"] img');
      return img?.naturalWidth>0 && new URL(img.src).origin===location.origin &&
        getComputedStyle(img).objectFit===(id.startsWith('person:')?'cover':'contain');
    });
  })()`),'The company mark and all three founder portraits must render from the built site');
  assert.deepEqual(await evaluate(listSources),connections.edges.map(edge=>sourceUrl(edge.source)).filter(Boolean).sort());
  assert.equal(await evaluate("document.documentElement.scrollWidth<=innerWidth"),true);
  await screenshot('graph-alloovium-artwork-mobile.png');

  const companies=graph.entities.filter(entity=>entity.kind==='startup').map(entity=>entity.id).sort();
  const countryGroups=Object.fromEntries([...indexCompanies(graph)].map(([id,place])=>[id,countryName(place.country)]));
  const countryLabels=[...new Set(Object.values(countryGroups))].sort();
  const idsInGroup=group=>companies.filter(id=>countryGroups[id]===group);
  const changeGrouping=group=>evaluate(`(()=>{
    const select=document.querySelector('#graph-company-group');select.value=${JSON.stringify(group)};select.dispatchEvent(new Event('change',{bubbles:true}));
  })()`);
  const companyMapReady="document.querySelector('#graph-company-map')?.dataset.renderer==='loom'&&!document.querySelector('#graph-company-overview').hidden";
  async function checkCompanyMap({ids=companies,groupLabels=[],allNames=false}={}) {
    const map=await evaluate(`(async()=>{
      // Loom projects the new anchors on the next paint after a resize or regroup.
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      const canvas=document.querySelector('#graph-company-loom'), frame=canvas.getBoundingClientRect();
      const nodes=[...document.querySelectorAll('#graph-company-nodes [data-node]')];
      const labels=[...document.querySelectorAll('#graph-company-nodes :is(.network-loom-label,.graph-company-cluster-label):not([hidden])')];
      const boxes=labels.map(el=>el.getBoundingClientRect());
      const overlaps=(a,b)=>a.left<b.right && a.right>b.left && a.top<b.bottom && a.bottom>b.top;
      return {ids:nodes.map(node=>node.dataset.node).sort(), onCanvas:nodes.filter(node=>{
        const r=node.getBoundingClientRect();
        return r.left>=frame.left-1 && r.right<=frame.right+1 && r.top>=frame.top-1 && r.bottom<=frame.bottom+1;
      }).length, groups:labels.filter(el=>el.dataset.group).map(el=>el.dataset.group),
      names:labels.filter(el=>el.classList.contains('network-loom-label')).map(el=>el.textContent),
      hasBoundaries:!!document.querySelector('#graph-company-boundaries svg path'),
      hasGL:canvas.getContext('webgl2')?.drawingBufferWidth>0,
      clip:labels.filter((el,i)=>el.scrollWidth>el.clientWidth+1 || el.scrollHeight>el.clientHeight+1 ||
        boxes[i].left<frame.left || boxes[i].right>frame.right || boxes[i].top<frame.top || boxes[i].bottom>frame.bottom).map(el=>el.textContent),
      overlap:boxes.some((box,i)=>boxes.slice(i+1).some(other=>overlaps(box,other))),
      readable:labels.every(el=>parseFloat(getComputedStyle(el).fontSize)>=12),overflow:document.documentElement.scrollWidth>innerWidth};
    })()`);
    assert.deepEqual(map.ids,ids,'The Loom graph must contain every company in the current overview or group');
    assert.equal(map.onCanvas,ids.length,'Every marker must be fully contained at Fit');
    if (allNames) assert.equal(map.names.length,ids.length,'Every company name must be visible in group view');
    assert.ok(map.hasGL && map.hasBoundaries,'The company canvas should paint via Loom with rendered group outlines');
    assert.deepEqual(map.clip,[],'Visible labels must fit the canvas and their allocated width');
    assert.ok(map.readable && !map.overlap && !map.overflow,'Company labels should be readable without overlap or page overflow');
    for (const group of groupLabels) assert.ok(map.groups.includes(group),`Missing map label for ${group}`);
    return map;
  }
  async function checkCountryMap() {
    const map=await checkCompanyMap({groupLabels:countryLabels});
    assert.deepEqual(map.groups.sort(),countryLabels);
    const rendered=await evaluate("Object.fromEntries([...document.querySelectorAll('#graph-company-nodes [data-node]')].map(node=>[node.dataset.node,node.dataset.group]))");
    assert.deepEqual(rendered,countryGroups);
    return map;
  }
  await command('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  await command('Page.navigate',{url:`${address}/graph.html`});
  await until(()=>evaluate(companyMapReady),'Default Graph must mount the company Loom canvas');
  await evaluate('document.fonts.ready.then(()=>true)');
  assert.equal(await evaluate("document.querySelector('#graph-company-group').value"),'sector');
  const desktopCompanies=await checkCompanyMap({groupLabels:['Design & media','Financial software']});
  assert.ok(desktopCompanies.names.length>10,'A desktop Fit should include readable company names');
  await screenshot('graph-all-companies-desktop.png');
  await changeGrouping('country');
  await until(checkCountryMap,'Desktop country Fit must show the sourced headquarters groups');
  await screenshot('graph-company-countries-desktop.png');
  await changeGrouping('sector');

  for (const [width,height] of [[844,390],[621,700],[390,844],[320,640]]) {
    await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true});
    await until(()=>evaluate("!!document.querySelector('.graph-company-cluster-label[data-fit-group]')"),'Phone Fit must reserve label slots for each group');
    const groups=await evaluate("[...new Set([...document.querySelectorAll('#graph-company-nodes [data-node]')].map(node=>node.dataset.group))]");
    await until(()=>checkCompanyMap({groupLabels:groups}),`Phone Fit did not finish laying out all companies at ${width}px`);
    await evaluate("document.querySelector('#graph-company-loom').scrollIntoView({block:'center',behavior:'instant'})");
    await screenshot(`graph-all-companies-${width}.png`);
    if (width===390) {
      const start=await evaluate(`(()=>{
        const canvas=document.querySelector('#graph-company-loom');
        scrollTo({top:scrollY+canvas.getBoundingClientRect().top-135,behavior:'instant'});
        const frame=canvas.getBoundingClientRect();
        return {x:frame.left+4,y:frame.top+310,scrollY};
      })()`);
      await command('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:start.x,y:start.y}]});
      for (const delta of [25,55,90,130]) await command('Input.dispatchTouchEvent',{
        type:'touchMove',touchPoints:[{x:start.x,y:start.y-delta}]
      });
      await command('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      await until(()=>evaluate(`scrollY>${start.scrollY+35}`),'A vertical swipe on the fitted map should scroll the phone page');
    }
  }
  await changeGrouping('country');
  await until(checkCountryMap,'Phone country Fit must show the sourced headquarters groups');
  assert.equal(await evaluate("new URL(location.href).searchParams.get('group')"),'country');
  const dual=idsInGroup('Multiple headquarters'), australian=idsInGroup('Australia');
  assert.ok(dual.includes('startup:airwallex') && dual.includes('startup:bugcrowd'),'Explicit co-headquarters retain one marker per company');
  await evaluate(`document.querySelector('.graph-company-cluster-label[data-group="Multiple headquarters"]').click()`);
  await until(()=>checkCompanyMap({ids:dual,allNames:true}),'The multiple headquarters group must show every member and name');
  await evaluate("document.querySelector('#graph-company-fit').click()");
  await until(checkCountryMap,'Fit all should restore the entire country map');
  await evaluate("document.querySelector('.graph-company-cluster-label[data-group=Australia]').click()");
  const canvaCompany="#graph-company-nodes [data-node='startup:canva']";
  await until(()=>evaluate(`!document.querySelector(${JSON.stringify(canvaCompany+' .network-loom-label')}).hidden`),'Zooming to Australia must make Canva’s name readable');
  const australiaMap=await until(()=>checkCompanyMap({ids:australian,allNames:true}),'Australia must fit all its names after resizing the canvas');
  assert.equal(await evaluate("document.querySelector('#graph-company-guide').textContent"),`Australia · ${australian.length} companies`);
  assert.ok(australiaMap.names.includes('Canva'));
  await until(()=>evaluate(`(()=>{
    const logo=document.querySelector(${JSON.stringify(canvaCompany+' .network-loom-mark[data-logo=loaded] img')});
    return logo?.naturalWidth>0 && logo.getBoundingClientRect().width>=40;
  })()`),'Group view should render a readable full-size company mark');
  const companyPoint=await evaluate(`(()=>{
    const company=document.querySelector(${JSON.stringify(canvaCompany)});
    company.scrollIntoView({block:'center',behavior:'instant'});
    const r=company.getBoundingClientRect();
    return {x:r.left+r.width/2,y:r.top+r.height/2};
  })()`);
  await command('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[companyPoint]});
  await command('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await until(()=>evaluate("document.querySelector('#graph-loom-controls .is-root')?.dataset.node==='startup:canva'"),'Tapping a native company glyph must traverse into its relationship graph');
  await evaluate('history.back()');
  await until(()=>evaluate(`${companyMapReady}&&new URL(location.href).searchParams.get('group')==='country'`),'Back must restore the company Loom map and country grouping');
  await until(()=>checkCompanyMap({ids:australian,allNames:true}),'Back must restore the company’s previous group');
  assert.equal(await evaluate("document.querySelector('#graph-company-zoom-group').value"),'Australia');
  await evaluate(`document.querySelector(${JSON.stringify(canvaCompany)}).focus({preventScroll:true})`);
  await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r',unmodifiedText:'\r'});
  await command('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
  await until(()=>evaluate("document.querySelector('#graph-detail h2')?.textContent==='Canva'"),'Keyboard traversal must open Canva');
  await evaluate("document.querySelector('#graph-back-to-companies').click()");
  await until(()=>evaluate("document.activeElement?.dataset.node==='startup:canva'&&!document.querySelector('#graph-company-map').hidden"),'Companies must return focus to the opening node');
  await until(()=>checkCompanyMap({ids:australian,allNames:true}),'Focusable return must preserve the fitted company group');

  assert.deepEqual(exceptions,[],'Page must not raise unhandled JavaScript exceptions');
  console.log('Chrome graph checks passed for all-company Loom Fit and grouping, phone traversal, context wires, artwork, mobile neighbourhood Fit and SVG fallback');
} catch(error) {
  console.error('Interaction diagnostics:',JSON.stringify(await readDiagnostics().catch(()=>({state:'unavailable'}))));
  await captureFailure('failed-interaction.png').catch(()=>{});
  throw error;
} finally {
  socket?.close();chrome.kill();server.close();
  await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100}).catch(()=>{});
}
