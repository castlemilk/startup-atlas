// Browser-level graph interaction smoke test. Uses the Chrome already installed
// on the GitHub Actions runner and Node's built-in CDP WebSocket client.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {mkdtemp, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {extname, join, resolve, sep} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';

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
  '--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--disable-background-networking','--disable-extensions','--no-first-run',
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
      return {title:document.querySelector('h1').textContent,mastheads:document.querySelectorAll('[data-atlas-masthead="graph"]').length,
        activeRoute:document.querySelector('.atlas-masthead [data-atlas-view="graph"]')?.getAttribute('aria-current'),bodyNavigation:document.querySelectorAll('main [data-atlas-navigation]').length,
        toolbarOwnsControls:['graph-query','graph-depth','graph-list-toggle','graph-filters'].every(id=>document.getElementById(id).closest('.explorer-toolbar')),
        rootFill:getComputedStyle(root.querySelector('.node-shell')).fill,rootText:getComputedStyle(root.querySelector('.node-label')).fill,ink:color('--atlas-ink'),onAction:color('--atlas-on-action'),
        dock:[...document.querySelectorAll('.network-scale button')].map(rect),captions,nodes,list:document.querySelector('#graph-list').textContent};
    })()`);
    assert.equal(presentation.title,'Follow the connections.');
    assert.equal(presentation.mastheads,1,'Graph must use one shared masthead');
    assert.equal(presentation.activeRoute,'page','The masthead must identify the graph route');
    assert.equal(presentation.bodyNavigation,0,'Graph must not repeat the masthead navigation');
    assert.equal(presentation.toolbarOwnsControls,true,'Search, types, depth and connections belong to one toolbar');
    assert.equal(presentation.rootFill,presentation.ink,'The map root must use the forest identity card');
    assert.equal(presentation.rootText,presentation.onAction,'The dark root must have contrasting name text');
    assert.ok(presentation.dock.every(button=>Math.abs(button.y-presentation.dock[0].y)<=1),viewport+' camera controls must form a horizontal dock');
    for(const node of presentation.nodes){
      assert.match(node.font,/Georgia/i,'Graph identity names must share the serif display typeface');
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
  await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1050,deviceScaleFactor:1,mobile:false});
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
  await evaluate("document.querySelector('#graph-filters button[data-kind=person]').click();document.querySelector('#graph-filters button[data-kind=person]').click()");
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
  await evaluate(`${nodeExpression}.focus({preventScroll:true})`);
  await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
  await command('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
  assert.equal(await evaluate("document.querySelector('#graph-detail h2').textContent"),'Melanie Perkins','Enter must inspect the focused node');
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
  await evaluate("document.querySelector('#graph-detail [data-select=\"startup:fusion-books\"]').click()");
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
  await evaluate("document.querySelector('#graph-list-toggle').click()");
  assert.equal(await evaluate("document.querySelector('#graph-list').hidden"),false);
  assert.ok(await evaluate("document.querySelectorAll('#graph-list a[href^=\"https://\"]').length")>0,'List must show evidence links');
  await evaluate("document.querySelector('#graph-reset').click()");
  assert.deepEqual(coordinates(await evaluate(`${nodeExpression}.getAttribute('transform')`)).map(Math.round),coordinates(before).map(Math.round),'Reset must restore automatic placement');
  await screenshot('desktop.png');
  await evaluate("document.querySelector('#graph-detail [data-explore=\"person:melanie-perkins\"]').click()");
  assert.equal(await evaluate("new URLSearchParams(location.search).get('entity')"),'person:melanie-perkins','Explore from here must change the root explicitly');
  assert.equal(await evaluate("new URLSearchParams(location.search).has('selected')"),false);
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
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.network-mobile-guide')).display"),'block','Mobile users should see the map/list guidance');
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

  assert.deepEqual(exceptions,[],'Page must not raise unhandled JavaScript exceptions');
  console.log('Chrome graph interaction smoke test passed at desktop and mobile sizes');
} catch(error) {
  console.error('Interaction diagnostics:',JSON.stringify(await readDiagnostics().catch(()=>({state:'unavailable'}))));
  await captureFailure('failed-interaction.png').catch(()=>{});
  throw error;
} finally {
  socket?.close();chrome.kill();server.close();
  await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100}).catch(()=>{});
}
