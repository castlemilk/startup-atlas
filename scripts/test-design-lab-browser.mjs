// Real Chrome coverage for the image-led design lab, including modal accessibility.
// Uses the repository's CDP harness and settled, hit-tested pointer interactions.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {mkdtemp, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {extname, join, resolve, sep} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';

import {pathToFileURL} from 'node:url';

const root=resolve('dist');
const {designConcepts:concepts}=await import(pathToFileURL(join(root,'design-concepts.js')).href);
const expectedIds=['list-search','treemap','graph','startup','partner'];
assert.deepEqual(concepts.map(concept=>concept.id),expectedIds,'The five requested view concepts must be published');
for(const concept of concepts) {
  assert.ok(concept.title&&concept.alt,'Each concept needs a title and meaningful image alternative');
  assert.notEqual(concept.image,concept.thumb,'Gallery thumbnails and full-size assets must be distinct');
  for(const asset of [concept.image,concept.thumb]) {
    assert.match(asset,/^\.\/assets\/design-lab\/[a-z0-9-]+\.(webp|png|jpe?g)$/i);
    assert.ok((await readFile(resolve(root,asset))).byteLength>0,'Missing concept asset: '+asset);
  }
}
const profile=await mkdtemp(join(tmpdir(),'atlas-design-lab-chrome-'));
const screenshotDir=process.env.ATLAS_SCREENSHOTS_DIR||join(tmpdir(),'atlas-design-lab-screenshots');
const contentTypes={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.sqlite':'application/octet-stream','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.jpeg':'image/jpeg','.md':'text/markdown'};
const requests=[];
const server=createServer(async(req,res)=>{
  try {
    const path=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
    if(path!==root&&!path.startsWith(root+sep)){res.writeHead(403).end();return;}
    const file=path===root?join(root,'index.html'):path;
    const bytes=await readFile(file);
    requests.push({url:req.url,status:200});
    res.writeHead(200,{'Content-Type':contentTypes[extname(file)]||'application/octet-stream'}).end(bytes);
  } catch {requests.push({url:req.url,status:404});res.writeHead(404).end();}
});
await new Promise((resolveListen,reject)=>server.once('error',reject).listen(0,'127.0.0.1',resolveListen));
const address=`http://127.0.0.1:${server.address().port}`;
const chrome=spawn(process.env.CHROME_BIN||'google-chrome',[
  '--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--disable-background-networking','--disable-extensions','--no-first-run',
  '--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'
],{stdio:['ignore','ignore','pipe']});
let socket,spawnError,chromeExit,chromeLog='';
let captureFailure=async()=>{},readDiagnostics=async()=>({state:'unavailable'});
chrome.on('error',error=>{spawnError=error;});
chrome.on('exit',(code,signal)=>{chromeExit=`Chrome exited (${code??signal})`;});
chrome.stderr.on('data',chunk=>{chromeLog=(chromeLog+chunk.toString()).slice(-5000);});
async function until(fn,message) {
  for(let i=0;i<150;i++) {
    if(spawnError)throw spawnError;
    if(chromeExit)throw new Error(chromeExit+'\n'+chromeLog);
    const result=await fn().catch(()=>null);
    if(result)return result;
    await delay(100);
  }
  throw new Error(message+'\n'+chromeLog);
}
try {
  const port=await until(async()=>Number((await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]),'Chrome did not start');
  const target=await until(async()=>{
    const targets=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    return targets.find(item=>item.type==='page');
  },'Chrome did not expose a page');
  socket=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolveOpen,reject)=>{socket.addEventListener('open',resolveOpen,{once:true});socket.addEventListener('error',reject,{once:true});});
  const pending=new Map(),exceptions=[],browserMessages=[];
  let sequence=0,navigationCount=0;
  socket.addEventListener('message',event=>{
    const message=JSON.parse(event.data);
    if(message.method==='Page.frameNavigated'&&!message.params.frame.parentId)navigationCount++;
    if(message.method==='Runtime.exceptionThrown')exceptions.push(message.params.exceptionDetails.exception?.description||message.params.exceptionDetails.text);
    if(message.method==='Runtime.consoleAPICalled'&&['error','warning'].includes(message.params.type))browserMessages.push({level:message.params.type,text:message.params.args.map(item=>item.value||item.description||'').join(' ')});
    if(!message.id)return;
    const item=pending.get(message.id);if(!item)return;pending.delete(message.id);
    clearTimeout(item.timeout);
    if(message.error)item.reject(new Error(message.error.message));else item.resolve(message.result);
  });
  function command(method,params={}) {
    const id=++sequence;
    return new Promise((resolveCommand,reject)=>{
      const timeout=setTimeout(()=>{pending.delete(id);reject(new Error(`Chrome command timed out: ${method}`));},20000);
      pending.set(id,{resolve:resolveCommand,reject,timeout});
      socket.send(JSON.stringify({id,method,params}));
    });
  }
  async function evaluate(expression) {
    const response=await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
    if(response.exceptionDetails)throw new Error(response.exceptionDetails.exception?.description||response.exceptionDetails.text);
    return response.result.value;
  }
  async function navigate(path,ready) {
    const generation=navigationCount;
    await command('Page.navigate',{url:address+path});
    await until(async()=>navigationCount>generation,'Navigation did not commit: '+path);
    await until(()=>evaluate(ready),'View did not become ready: '+path);
  }
  let lastPointerAction;
  async function click(selector) {
    const quoted=JSON.stringify(selector);
    lastPointerAction={selector};
    await evaluate(`(()=>{
      const el=document.querySelector(${quoted});
      if(!el)throw new Error('Missing control: '+${quoted});
      const trace=window.__atlasTestPointerTrace||(window.__atlasTestPointerTrace={events:[]});
      trace.events=[];
      if(!trace.installed){
        trace.installed=true;
        for(const type of ['pointermove','pointerdown','pointerup','click'])document.addEventListener(type,event=>{
          const target=event.target.closest?.('button,a,input,select')||event.target;
          trace.events.push({type,target:target.tagName,id:target.id,concept:target.dataset?.openConcept,x:event.clientX,y:event.clientY,scrollY,trusted:event.isTrusted});
          if(trace.events.length>12)trace.events.shift();
        },true);
      }
      el.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'});
    })()`);
    // Scroll anchoring or an iframe fragment navigation can move a control after
    // scrollIntoView returns. Check geometry and hit targets across two frames,
    // move the real pointer, then check again before pressing at that position.
    const settledPoint=`(async()=>{
      const read=()=>{
        const el=document.querySelector(${quoted}),r=el?.getBoundingClientRect();
        if(!r||r.width<=0||r.height<=0||el.matches(':disabled'))return null;
        const x=r.x+r.width/2,y=r.y+r.height/2,hit=document.elementFromPoint(x,y);
        return hit&&(hit===el||el.contains(hit))?{x,y,width:r.width,height:r.height,scrollX,scrollY}:null;
      };
      const first=read();await new Promise(requestAnimationFrame);
      const second=read();await new Promise(requestAnimationFrame);
      const third=read();
      return first&&second&&third&&Object.keys(first).every(key=>Math.abs(first[key]-second[key])<0.5&&Math.abs(second[key]-third[key])<0.5)?third:null;
    })()`;
    const point=await until(async()=>{
      // A preceding fragment link can finish its smooth scroll after the first
      // reveal. Retry only when the target's click point has left the viewport.
      const revealed=await evaluate(`(()=>{
        const el=document.querySelector(${quoted}),r=el?.getBoundingClientRect();
        if(!r)return false;
        const x=r.x+r.width/2,y=r.y+r.height/2,outside=x<=0||x>=innerWidth||y<=0||y>=innerHeight;
        if(outside)el.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'});
        return outside;
      })()`);
      if(revealed)lastPointerAction.scrollRetries=(lastPointerAction.scrollRetries||0)+1;
      const before=await evaluate(settledPoint);
      if(!before)return false;
      await command('Input.dispatchMouseEvent',{type:'mouseMoved',x:before.x,y:before.y,button:'none',buttons:0});
      const after=await evaluate(settledPoint);
      return after&&Math.abs(before.x-after.x)<0.5&&Math.abs(before.y-after.y)<0.5?after:false;
    },'Control did not remain reachable under the pointer: '+selector);
    lastPointerAction.point=point;
    await command('Input.dispatchMouseEvent',{type:'mousePressed',x:point.x,y:point.y,button:'left',buttons:1,clickCount:1});
    await command('Input.dispatchMouseEvent',{type:'mouseReleased',x:point.x,y:point.y,button:'left',buttons:0,clickCount:1});
    lastPointerAction.events=await evaluate('window.__atlasTestPointerTrace?.events').catch(()=>null);
  }
  async function press(key,code,keyCode,modifiers=0) {
    await command('Input.dispatchKeyEvent',{type:'keyDown',key,code,windowsVirtualKeyCode:keyCode,modifiers});
    await command('Input.dispatchKeyEvent',{type:'keyUp',key,code,windowsVirtualKeyCode:keyCode,modifiers});
  }
  async function screenshot(name,fullPage=false) {
    await mkdir(screenshotDir,{recursive:true});
    const options={format:'png'};
    if(fullPage) {
      const size=(await command('Page.getLayoutMetrics')).cssContentSize;
      options.captureBeyondViewport=true;
      options.clip={x:0,y:0,width:size.width,height:size.height,scale:1};
    }
    const image=await command('Page.captureScreenshot',options);
    await writeFile(join(screenshotDir,name),Buffer.from(image.data,'base64'));
  }
  async function assertNoOverflow(label) {
    const dimensions=await evaluate('({scroll:document.documentElement.scrollWidth,viewport:innerWidth})');
    assert.ok(dimensions.scroll<=dimensions.viewport+1,`${label} overflows horizontally: ${JSON.stringify(dimensions)}`);
  }
  const text=selector=>evaluate(`document.querySelector(${JSON.stringify(selector)})?.textContent||''`);
  captureFailure=screenshot;
  readDiagnostics=async()=>({
    state:await evaluate(`({url:location.href,title:document.title,ready:document.readyState,viewport:{width:innerWidth,height:innerHeight},heading:document.querySelector('main h1')?.textContent,dialogOpen:document.querySelector('#concept-dialog')?.open,dialogTitle:document.querySelector('#dialog-title')?.textContent,filter:document.querySelector('#concept-filter')?.value,query:document.querySelector('#concept-search')?.value,body:document.body?.innerText?.slice(-1800)})`).catch(()=>'<unavailable>'),
    lastPointerAction,exceptions,browserMessages,failedRequests:requests.filter(request=>request.status!==200)
  });
  await command('Page.enable');await command('Runtime.enable');await command('Network.enable');
  await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1050,deviceScaleFactor:1,mobile:false});

  const galleryReady="document.querySelectorAll('#concept-gallery .lab-concept-card').length===5&&!!document.querySelector('#concept-filter')";
  const visibleConcepts=()=>evaluate("[...document.querySelectorAll('#concept-gallery .lab-concept-card')].filter(card=>!card.hidden&&card.getClientRects().length).map(card=>card.dataset.concept)");
  const conceptPath=value=>new URL(value,address+'/design-lab.html').pathname;
  const galleryOpener=id=>`#concept-gallery .lab-concept-card[data-concept="${id}"] .lab-concept-image-button`;
  const dialogLoaded=concept=>`(()=>{const dialog=document.querySelector('#concept-dialog'),image=document.querySelector('#dialog-image');return dialog?.open&&document.querySelector('#dialog-title')?.textContent.trim()===${JSON.stringify(concept.title)}&&image?.complete&&image.naturalWidth>0&&new URL(image.currentSrc).pathname===${JSON.stringify(conceptPath(concept.image))};})()`;
  const dialogClosed="!document.querySelector('#concept-dialog').open&&!new URLSearchParams(location.search).has('concept')";
  async function choose(selector,value) {
    const options=await evaluate(`[...document.querySelector(${JSON.stringify(selector)}).options].map(option=>option.value)`);
    const index=options.indexOf(value);assert.ok(index>=0,'Missing option '+value+' in '+selector);
    await click(selector);
    await press('Home','Home',36);
    for(let i=0;i<index;i++)await press('ArrowDown','ArrowDown',40);
    await press('Enter','Enter',13);
    await until(()=>evaluate(`document.querySelector(${JSON.stringify(selector)}).value===${JSON.stringify(value)}`),'Native selection did not change: '+selector);
  }
  async function fill(selector,value) {
    await click(selector);
    await press('a','KeyA',65,2);
    if(value)await command('Input.insertText',{text:value});else await press('Backspace','Backspace',8);
  }
  async function expectVisible(ids,message) {
    await until(async()=>JSON.stringify(await visibleConcepts())===JSON.stringify(ids),message);
    assert.deepEqual(await visibleConcepts(),ids,message);
  }

  await navigate('/design-lab.html',galleryReady);
  assert.equal(await evaluate("document.querySelector('#concept-count').getAttribute('role')"),'status');
  await expectVisible(expectedIds,'All five concept cards should be available initially');
  await assertNoOverflow('Desktop design lab');

  // Type and text search must change real results and preserve a shareable scope.
  await choose('#concept-filter','graph');
  await expectVisible(['graph'],'Type filter should isolate the graph concept');
  assert.equal(await evaluate("new URLSearchParams(location.search).get('view')"),'graph');
  await choose('#concept-filter','all');
  const graphConcept=concepts.find(concept=>concept.id==='graph');
  await fill('#concept-search',graphConcept.title);
  await until(async()=>(await visibleConcepts()).includes('graph'),'Search must find the concept by its title');
  assert.equal(await evaluate("new URLSearchParams(location.search).get('q')"),graphConcept.title);
  await click('#clear-concept-search');
  assert.equal(await evaluate("document.querySelector('#concept-search').value"),'');
  assert.equal(await evaluate('document.activeElement.id'),'concept-search','Clear should return keyboard focus to search');
  await expectVisible(expectedIds,'Clearing search should restore the complete gallery');
  await fill('#concept-search','atlas-no-concept-zzzz-72915');
  await expectVisible([],'An unmatched query should produce zero concepts');
  assert.ok(await evaluate("!document.querySelector('#concept-empty').hidden&&document.querySelector('#concept-empty').getClientRects().length>0"),'No-results state should be visibly actionable');
  await click('#reset-concepts');
  await expectVisible(expectedIds,'Reset should recover the gallery from no results');
  assert.equal(await evaluate("document.querySelector('#concept-filter').value"),'all');
  assert.equal(await evaluate("document.querySelector('#concept-search').value"),'');
  assert.equal(await evaluate("new URLSearchParams(location.search).has('q')"),false);

  // Load every thumbnail and every full asset through the actual gallery controls.
  for(const concept of concepts) {
    const opener=galleryOpener(concept.id);
    await click(opener);
    await until(()=>evaluate(dialogLoaded(concept)),'The full concept image did not decode: '+concept.id);
    assert.equal(await evaluate("new URLSearchParams(location.search).get('concept')"),concept.id);
    assert.equal(await evaluate("document.querySelector('#dialog-image').alt"),concept.alt);
    assert.ok(await evaluate("document.querySelector('#concept-dialog').getAttribute('aria-labelledby')?.split(' ').includes('dialog-title')"),'The dialog must be named by its visible title');
    assert.ok(await evaluate("document.querySelector('#concept-dialog').contains(document.activeElement)"),'Opening a dialog should move keyboard focus inside it');
    assert.equal(await evaluate("new URL(document.querySelector('#dialog-download').href).pathname"),conceptPath(concept.image),'Download must reference the full image');
    assert.equal(await evaluate("document.querySelector('#dialog-live').href"),new URL(concept.route,address+'/design-lab.html').href,'Working-view link must preserve the manifest route and its scope');
    await assertNoOverflow('Desktop '+concept.id+' dialog');
    await screenshot('atlas-design-lab-'+concept.id+'.png');
    await click('#dialog-close');
    await until(()=>evaluate(dialogClosed),'Dialog and its history entry did not close');
    assert.ok(await evaluate(`document.activeElement?.matches(${JSON.stringify(opener)})`),'Closing must restore the exact gallery image opener');
    assert.equal(await evaluate("new URLSearchParams(location.search).has('concept')"),false);
  }
  await until(()=>evaluate("[...document.querySelectorAll('#concept-gallery .lab-concept-card img')].length===5&&[...document.querySelectorAll('#concept-gallery .lab-concept-card img')].every(image=>image.complete&&image.naturalWidth>0)"),'Every concept thumbnail must decode');
  for(const concept of concepts) {
    assert.ok(requests.some(request=>request.status===200&&new URL(request.url,address).pathname===conceptPath(concept.image)),'Full concept was not served: '+concept.id);
    assert.ok(requests.some(request=>request.status===200&&new URL(request.url,address).pathname===conceptPath(concept.thumb)),'Concept thumbnail was not served: '+concept.id);
  }

  // Dialog controls and keyboard browsing preserve the original focus-return target.
  const treemapConcept=concepts.find(concept=>concept.id==='treemap');
  await click(galleryOpener('treemap'));
  await until(()=>evaluate(dialogLoaded(treemapConcept)),'Treemap dialog did not reopen');
  await click('#dialog-next');
  await until(()=>evaluate(dialogLoaded(graphConcept)),'Next should open the following concept');
  assert.equal(await evaluate("document.querySelector('#dialog-announcement').getAttribute('role')"),'status');
  assert.match(await text('#dialog-announcement'),/Study 3 of 5: Relationship graph/,'Switching studies must announce the new title');
  await evaluate("(()=>{const dialog=document.querySelector('#concept-dialog');document.querySelector('#dialog-prompt-details').open=true;document.querySelector('#dialog-prev').focus({preventScroll:true});dialog.scrollTop=dialog.scrollHeight;})()");
  assert.ok(await evaluate("document.querySelector('#concept-dialog').scrollTop>0"),'The expanded generation brief should scroll');
  await press('ArrowLeft','ArrowLeft',37);
  await until(()=>evaluate(dialogLoaded(treemapConcept)),'Browsing from a long brief should open the preceding study');
  assert.equal(await evaluate("document.querySelector('#concept-dialog').scrollTop"),0,'A new study should show its image from the top');
  await click('#dialog-next');
  await until(()=>evaluate(dialogLoaded(graphConcept)),'Next should reopen the graph');
  await click('#dialog-prev');
  await until(()=>evaluate(dialogLoaded(treemapConcept)),'Previous should return to the preceding concept');
  await press('ArrowRight','ArrowRight',39);
  await until(()=>evaluate(dialogLoaded(graphConcept)),'ArrowRight should browse concepts');
  await press('ArrowLeft','ArrowLeft',37);
  await until(()=>evaluate(dialogLoaded(treemapConcept)),'ArrowLeft should browse concepts');
  await evaluate("(()=>{const dialog=document.querySelector('#concept-dialog');const controls=[...dialog.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),[tabindex]')].filter(control=>control.tabIndex>=0&&control.getClientRects().length);controls[0].focus();})()");
  await press('Tab','Tab',9,1);
  assert.ok(await evaluate("document.querySelector('#concept-dialog').contains(document.activeElement)"),'Shift+Tab must keep focus inside the modal');
  await press('Tab','Tab',9);
  assert.ok(await evaluate("document.querySelector('#concept-dialog').contains(document.activeElement)"),'Tab must keep focus inside the modal');
  await press('Escape','Escape',27);
  await until(()=>evaluate(dialogClosed),'Escape should close the modal and its history entry');
  assert.ok(await evaluate(`document.activeElement?.matches(${JSON.stringify(galleryOpener('treemap'))})`),'Browsing the dialog must not replace its initial opener');

  await navigate('/design-lab.html?view=graph&q=graph&concept=graph',dialogLoaded(graphConcept));
  assert.equal(await evaluate("document.querySelector('#concept-filter').value"),'graph');
  assert.equal(await evaluate("document.querySelector('#concept-search').value"),'graph');
  await press('Escape','Escape',27);
  await until(()=>evaluate(dialogClosed),'Deep-linked dialog should close');
  await expectVisible(['graph'],'Closing a deep link should preserve the gallery scope');
  assert.equal(await evaluate("new URLSearchParams(location.search).get('view')"),'graph');
  assert.equal(await evaluate("new URLSearchParams(location.search).get('q')"),'graph');

  // A real profile journey should return to the same filtered, open concept.
  const startupConcept=concepts.find(concept=>concept.id==='startup');
  await navigate('/design-lab.html?view=startup&q=startup&concept=startup',dialogLoaded(startupConcept));
  const labReturn=await evaluate('location.pathname+location.search+location.hash');
  const profileNavigation=navigationCount;
  await click('#dialog-live');
  await until(async()=>navigationCount>profileNavigation,'Working-view link did not navigate to the startup profile');
  await until(()=>evaluate("document.querySelector('#entity-profile h1')?.textContent==='Canva'&&document.querySelector('[data-atlas-back]')?.textContent==='Back to design lab'"),'Startup profile should retain its design-lab entry point');
  assert.equal(await evaluate('location.href'),new URL(startupConcept.route,address+'/design-lab.html').href,'Working-view action must open the manifest startup profile');
  assert.equal(await evaluate("document.querySelector('[data-atlas-back]').href"),address+labReturn,'Profile return must preserve concept, query and view');
  const returnNavigation=navigationCount;
  await click('[data-atlas-back]');
  await until(async()=>navigationCount>returnNavigation,'Profile return did not navigate back to the design lab');
  await until(()=>evaluate(dialogLoaded(startupConcept)),'Returning from the profile must reopen the startup concept');
  assert.equal(await evaluate('location.pathname+location.search+location.hash'),labReturn);
  assert.deepEqual(await evaluate("[document.querySelector('#concept-filter').value,document.querySelector('#concept-search').value]"),['startup','startup'],'Profile return must restore the gallery scope');
  await expectVisible(['startup'],'Profile return should retain the single startup study');
  await navigate('/design-lab.html',galleryReady);

  // Token-copy feedback must expose success or a useful manual-copy fallback.
  await click('[data-copy-token="--atlas-ink"]');
  await until(()=>evaluate("['success','error'].includes(document.querySelector('#token-feedback')?.dataset.tone)"),'Token copy did not finish with success or a manual-copy fallback');
  assert.equal(await evaluate("document.querySelector('#token-feedback').getAttribute('role')"),'status');
  const tokenFeedback=await text('#token-feedback');
  assert.match(tokenFeedback,/copied|copy|clipboard/i,'Clipboard failure must offer a manual alternative');
  const ink=await evaluate("getComputedStyle(document.documentElement).getPropertyValue('--atlas-ink').trim()");
  assert.ok(tokenFeedback.includes('--atlas-ink')||tokenFeedback.toLowerCase().includes(ink.toLowerCase()),'Token feedback must identify the selected token or value');
  if(await evaluate("document.querySelector('#token-feedback').dataset.tone==='error'")) {
    assert.ok(await evaluate("!document.querySelector('#copy-fallback').hidden&&document.querySelector('#copy-fallback').getClientRects().length>0"),'Clipboard failure should expose a visible manual-copy field');
    assert.equal(await evaluate("document.querySelector('#copy-value').value"),ink);
    assert.equal(await evaluate('document.activeElement.id'),'copy-value','Manual copy should focus the selectable token value');
  } else {
    assert.match(tokenFeedback,/copied/i,'Successful clipboard feedback should confirm completion');
  }

  const comfortableHeight=await evaluate("document.querySelector('#playground-preview .lab-specimen-card').getBoundingClientRect().height");
  await choose('#play-density','compact');
  assert.equal(await evaluate("document.querySelector('#playground-preview').dataset.density"),'compact');
  await until(()=>evaluate(`document.querySelector('#playground-preview .lab-specimen-card').getBoundingClientRect().height<${comfortableHeight-4}`),'Compact density must visibly reduce the specimen height');
  await choose('#play-kind','person');
  assert.equal(await evaluate("document.querySelector('#playground-preview').dataset.kind"),'person');
  assert.equal((await text('#playground-preview h3')).trim(),'Sample founder','Entity selection must change the visible specimen identity');
  assert.match(await text('#playground-preview'),/Person/,'Entity type needs a visible text label');
  await click('#play-select');
  assert.equal(await evaluate("document.querySelector('#play-select').getAttribute('aria-pressed')"),'true');
  assert.match(await text('#playground-preview .lab-specimen-selection'),/Sample founder is selected/,'Selection must visibly identify the active specimen');
  await click('#play-select');
  assert.equal(await evaluate("document.querySelector('#play-select').getAttribute('aria-pressed')"),'false');
  assert.equal(await evaluate("document.querySelector('#playground-preview .lab-specimen-selection')===null"),true,'Clearing selection must remove its inspector message');
  const stateContent={loading:/Loading example/,empty:/No records match this selection/,partial:/Some research is unavailable/,error:/The research could not be loaded/};
  for(const [state,expectedContent] of Object.entries(stateContent)) {
    await choose('#play-state',state);
    assert.equal(await evaluate("document.querySelector('#playground-preview').dataset.state"),state,'The specimen should render the selected state');
    assert.match(await text('#playground-preview'),expectedContent,'Each state must show its own useful explanation');
    assert.ok(await evaluate("document.querySelector('#play-recover').getClientRects().length>0"),'Each nonready specimen should expose recovery');
  }
  await click('#play-recover');
  await until(()=>evaluate("document.querySelector('#playground-preview').dataset.state==='ready'"),'Recovery should return the specimen to ready');
  await click('#play-reset');
  assert.deepEqual(await evaluate("[document.querySelector('#play-density').value,document.querySelector('#play-state').value,document.querySelector('#play-kind').value]"),['comfortable','ready','startup']);
  assert.deepEqual(await evaluate("(()=>{const d=document.querySelector('#playground-preview').dataset;return [d.density,d.state,d.kind];})()"),['comfortable','ready','startup']);
  await assertNoOverflow('Desktop interactive playground');
  await evaluate("scrollTo({top:0,behavior:'instant'})");
  await screenshot('atlas-design-lab-desktop.png',true);

  await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await navigate('/design-lab.html',galleryReady);
  for(const concept of concepts) {
    const selector=galleryOpener(concept.id)+' img';
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center',behavior:'instant'})`);
    await until(()=>evaluate(`(()=>{const image=document.querySelector(${JSON.stringify(selector)});return image.complete&&image.naturalWidth>0;})()`),'Mobile concept thumbnail did not decode: '+concept.id);
  }
  await evaluate("scrollTo({top:0,behavior:'instant'})");
  await assertNoOverflow('390px design lab');
  await screenshot('atlas-design-lab-mobile.png',true);
  await click(galleryOpener('graph'));
  await until(()=>evaluate(dialogLoaded(graphConcept)),'Mobile graph concept should open and decode');
  await assertNoOverflow('390px concept dialog');
  const dialogBox=await evaluate("(()=>{const r=document.querySelector('#concept-dialog').getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:innerWidth,height:innerHeight};})()");
  assert.ok(dialogBox.left>=-1&&dialogBox.right<=dialogBox.width+1&&dialogBox.top>=-1&&dialogBox.bottom<=dialogBox.height+1,'Mobile dialog must fit its viewport: '+JSON.stringify(dialogBox));
  await screenshot('atlas-design-lab-dialog-mobile.png');
  await click('#dialog-next');
  await until(()=>evaluate(dialogLoaded(concepts.find(concept=>concept.id==='startup'))),'Mobile next control should remain operable');
  await click('#dialog-close');
  await until(()=>evaluate(dialogClosed),'Mobile dialog should close and restore the gallery URL');
  assert.ok(await evaluate(`document.activeElement?.matches(${JSON.stringify(galleryOpener('graph'))})`),'Mobile dialog should return focus to its initial gallery opener');
  await choose('#play-state','error');
  await assertNoOverflow('390px playground error state');
  await screenshot('atlas-design-lab-playground-mobile.png');

  assert.deepEqual(exceptions,[],'Design lab must not raise unhandled JavaScript exceptions');
  assert.deepEqual(browserMessages.filter(message=>message.level==='error'),[],'Design lab must not log application errors');
  const missingAssets=requests.filter(request=>request.status===404&&!request.url.startsWith('/favicon.ico'));
  assert.deepEqual(missingAssets,[],'All design-lab page, module and image assets must be published');
  console.log('Design lab browser checks passed: five decoded concepts, gallery filtering/search/recovery, accessible image dialog and keyboard navigation, deep links and profile return, token-copy feedback, component states and 390px layouts.');
} catch(error) {
  console.error('Design lab diagnostics:',JSON.stringify(await readDiagnostics().catch(()=>({state:'unavailable'}))));
  await captureFailure('atlas-design-lab-failed.png').catch(()=>{});
  throw error;
} finally {
  socket?.close();chrome.kill();server.close();
  await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100}).catch(()=>{});
}
