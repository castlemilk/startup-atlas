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
const {assets,directionBoards,editorialIllustrations,viewPlaybooks}=await import(pathToFileURL(join(root,'design-handbook.js')).href);
const {atlasIcons}=await import(pathToFileURL(join(root,'atlas-icons.js')).href);
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
assert.equal(assets.length,10,'The handbook publishes two boards, three illustrations and five concepts');
assert.equal(directionBoards.length,2);
assert.equal(editorialIllustrations.length,3);
assert.deepEqual(viewPlaybooks.map(view=>view.id),expectedIds,'Each explorer needs its own playbook');
assert.equal(atlasIcons.length,32,'The shared utility library must publish all reviewed marks');
for(const asset of assets) {
  assert.ok(asset.title&&asset.alt&&asset.usage.length&&asset.avoid.length,'Assets need identity, alternatives and usage boundaries: '+asset.id);
  for(const file of [asset.image,asset.thumb])assert.ok((await readFile(resolve(root,file))).byteLength>0,'Missing handbook asset: '+file);
}
for(const icon of atlasIcons)assert.match(await readFile(join(root,'assets/design-icons',icon.id+'.svg'),'utf8'),/<svg\b/,'Each canonical icon needs a downloadable SVG: '+icon.id);
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
    const result=await command('Page.navigate',{url:address+path});
    assert.ok(!result.errorText,'Navigation failed: '+(result.errorText||path));
    if(result.loaderId)await until(async()=>navigationCount>generation,'Navigation did not commit: '+path);
    else await until(()=>evaluate(`location.href===${JSON.stringify(address+path)}`),'Same-document navigation did not commit: '+path);
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
    state:await evaluate(`({url:location.href,title:document.title,ready:document.readyState,viewport:{width:innerWidth,height:innerHeight},heading:document.querySelector('main h1')?.textContent,dialogOpen:document.querySelector('#concept-dialog')?.open,dialogTitle:document.querySelector('#dialog-title')?.textContent,assetDialogOpen:document.querySelector('#asset-dialog')?.open,assetDialogTitle:document.querySelector('#asset-dialog-title')?.textContent,filter:document.querySelector('#concept-filter')?.value,query:document.querySelector('#concept-search')?.value,assetKind:document.querySelector('#asset-kind')?.value,assetQuery:document.querySelector('#asset-search')?.value,icon:document.querySelector('#icon-preview')?.dataset.icon,motion:document.querySelector('#motion-demo')?.dataset.selected,body:document.body?.innerText?.slice(-1800)})`).catch(()=>'<unavailable>'),
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
  async function assertConceptImageGeometry(label) {
    const selectors=['.lab-hero-figure img',...concepts.map(concept=>galleryOpener(concept.id)+' img')];
    for(const selector of selectors) {
      const quoted=JSON.stringify(selector);
      await evaluate(`document.querySelector(${quoted}).scrollIntoView({block:'center',behavior:'instant'})`);
      await until(()=>evaluate(`(()=>{const image=document.querySelector(${quoted});return image.complete&&image.naturalWidth>0;})()`),label+' image did not decode: '+selector);
      // Layout dimensions exclude the hero's intentional rotation and hover scale.
      // Check the rendered box, since correct source dimensions alone miss a fixed HTML height.
      const box=await evaluate(`(()=>{const image=document.querySelector(${quoted});return {width:image.offsetWidth,height:image.offsetHeight,src:image.currentSrc};})()`);
      assert.ok(box.width>0&&box.height>0&&Math.abs(box.width/box.height-1.5)<0.03,`${label} concept preview must retain its 3:2 landscape box: ${JSON.stringify(box)}`);
    }
    await evaluate("scrollTo({top:0,behavior:'instant'})");
  }

  await navigate('/design-lab.html',galleryReady);
  await assertConceptImageGeometry('Desktop');
  await screenshot('atlas-design-lab-hero-desktop.png');
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
  await assertConceptImageGeometry('390px');
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

  // The handbook adds editorial guidance and local demonstrations without
  // creating a second implementation of the research views or dataset.
  async function reveal(selector) {
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'start',inline:'nearest',behavior:'instant'})`);
    await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  }
  async function decodeImage(selector,label) {
    await reveal(selector);
    await until(()=>evaluate(`(()=>{const image=document.querySelector(${JSON.stringify(selector)});return image?.complete&&image.naturalWidth>0&&!image.hidden;})()`),label+' image did not decode');
    const geometry=await evaluate(`(()=>{const image=document.querySelector(${JSON.stringify(selector)}),style=getComputedStyle(image);return {width:image.offsetWidth,height:image.offsetHeight,fit:style.objectFit,naturalWidth:image.naturalWidth,naturalHeight:image.naturalHeight};})()`);
    assert.ok(geometry.width>0&&geometry.height>0,label+' image needs a visible footprint');
    assert.equal(geometry.fit,'contain',label+' must preserve the full image composition');
    return geometry;
  }
  async function captureSection(selector,name) {await reveal(selector);await screenshot(name);}
  const directionReady="document.querySelectorAll('[data-playbook]').length===5&&document.querySelectorAll('.direction-board').length===2&&document.querySelectorAll('.direction-illustration').length===3&&!!document.querySelector('#motion-demo')";
  const nodeGeometry=()=>evaluate(`(()=>{const parent=document.querySelector('#motion-demo').getBoundingClientRect();return ['.direction-motion-root','#motion-inspect'].map(selector=>{const rect=document.querySelector(selector).getBoundingClientRect();return {x:rect.x-parent.x,y:rect.y-parent.y,width:rect.width,height:rect.height};});})()`);
  async function assertNodeGeometry(before,label) {
    const after=await nodeGeometry();
    assert.equal(after.length,before.length);
    for(let i=0;i<before.length;i++)for(const key of ['x','y','width','height'])assert.ok(Math.abs(before[i][key]-after[i][key])<0.5,label+' moved a graph specimen node: '+JSON.stringify({before,after}));
  }
  await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1050,deviceScaleFactor:1,mobile:false});
  await navigate('/design-direction.html',directionReady);
  assert.equal(await evaluate("document.querySelector('.lab-header-nav [aria-current=page]').getAttribute('href')"),'./design-direction.html');
  const directionImageCount=await evaluate("document.querySelectorAll('main img').length");
  assert.equal(directionImageCount,6,'Handbook should show a hero illustration, two boards and three illustration plates');
  for(let index=0;index<directionImageCount;index++) {
    await evaluate(`document.querySelectorAll('main img')[${index}].setAttribute('data-test-image','${index}')`);
    await decodeImage(`[data-test-image="${index}"]`,'Desktop direction '+index);
  }
  await evaluate("scrollTo({top:0,behavior:'instant'})");
  await screenshot('atlas-direction-hero-desktop.png');
  await assertNoOverflow('Desktop design direction');
  await captureSection('#direction-boards','atlas-direction-boards-desktop.png');
  await captureSection('#illustration-language','atlas-direction-illustrations-desktop.png');
  await captureSection('#brand-anatomy','atlas-direction-anatomy-desktop.png');

  // Native disclosures must expose complete playbooks and explicit delivery boundaries.
  const firstPlaybook=`#playbook-${viewPlaybooks[0].id}`;
  await click(firstPlaybook+' > summary');
  assert.ok(await evaluate(`document.querySelector(${JSON.stringify(firstPlaybook)}).open`));
  await press(' ','Space',32);
  await until(()=>evaluate(`!document.querySelector(${JSON.stringify(firstPlaybook)}).open`),'Space should close the native playbook disclosure');
  await press('Enter','Enter',13);
  await until(()=>evaluate(`document.querySelector(${JSON.stringify(firstPlaybook)}).open`),'Enter should open the native playbook disclosure');
  for(const view of viewPlaybooks) {
    const selector=`#playbook-${view.id}`;
    if(!await evaluate(`document.querySelector(${JSON.stringify(selector)}).open`))await click(selector+' > summary');
    assert.ok((await text(selector+' [data-stage="current"]')).includes(view.current[0]),view.id+' should expose its implemented behaviour');
    assert.ok((await text(selector+' [data-stage="next"]')).includes(view.next[0]),view.id+' should label its proposed next work');
    assert.equal(await evaluate(`document.querySelector(${JSON.stringify(selector+' a.atlas-button-primary')}).href`),new URL(view.route,address+'/design-direction.html').href);
    await assertNoOverflow('Desktop '+view.id+' playbook');
  }
  await captureSection('#playbook-graph','atlas-direction-graph-playbook-desktop.png');
  await click('#playbooks-expand');
  assert.equal(await evaluate("document.querySelectorAll('[data-playbook][open]').length"),0,'Collapse all must close every playbook');
  assert.equal(await evaluate("document.querySelector('#playbooks-expand').getAttribute('aria-expanded')"),'false');
  await click('#playbooks-expand');
  assert.equal(await evaluate("document.querySelectorAll('[data-playbook][open]').length"),5,'Expand all must reveal every playbook');
  await click('#playbooks-expand');

  for(const mode of ['profile','narrow','workspace']) {
    await click(`.direction-layout-switch button[data-layout="${mode}"]`);
    assert.equal(await evaluate("document.querySelector('#direction-layout-preview').dataset.layout"),mode);
    assert.equal(await evaluate(`document.querySelector('.direction-layout-switch button[data-layout="${mode}"]').getAttribute('aria-pressed')`),'true');
    assert.equal(await evaluate("document.querySelectorAll('.direction-layout-switch [aria-pressed=true]').length"),1,'Only the displayed layout can be selected');
    assert.ok((await text('#direction-layout-description')).length>60,'Layout changes need a concrete explanation');
  }
  assert.match(await text('#direction-layout-description'),/335px/,'Workspace specimen should describe the actual inspector geometry');
  await reveal('#motion-behaviour');
  const stationaryNodes=await nodeGeometry();
  await click('#motion-inspect');
  assert.equal(await evaluate("document.querySelector('#motion-demo').dataset.selected"),'person');
  assert.equal(await evaluate("document.querySelector('#motion-inspect').getAttribute('aria-pressed')"),'true');
  assert.equal((await text('#motion-detail-title')).trim(),'Maya Chen');
  assert.match(await text('#motion-status'),/Aster remains the map root/);
  await assertNodeGeometry(stationaryNodes,'Inspection');
  await captureSection('#motion-behaviour','atlas-direction-interaction-desktop.png');
  await click('#motion-reduced');
  assert.equal(await evaluate("document.querySelector('#motion-demo').dataset.reduced"),'true');
  assert.match(await text('#motion-preference'),/0ms/);
  await click('#motion-inspect');
  assert.equal(await evaluate("document.querySelector('#motion-demo').dataset.selected"),'root','Reduced motion must preserve the toggle action');
  assert.equal(await evaluate("document.querySelector('#motion-detail').getAnimations().filter(animation=>animation.playState==='running').length"),0,'The reduced-motion preview must not animate detail');
  await click('#motion-reset');
  assert.equal(await evaluate("document.querySelector('#motion-demo').dataset.selected"),'root');
  assert.equal(await evaluate("document.querySelector('#motion-reduced').checked"),false);
  await command('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await until(()=>evaluate("document.querySelector('#motion-demo').dataset.reduced==='true'&&document.querySelector('#motion-reduced').disabled"),'Device reduced motion must override the preview');
  assert.deepEqual(await evaluate("['--atlas-duration-fast','--atlas-duration-normal'].map(token=>getComputedStyle(document.documentElement).getPropertyValue(token).trim())"),['0ms','0ms']);
  await click('#motion-inspect');
  assert.equal(await evaluate("document.querySelector('#motion-demo').dataset.selected"),'person');
  assert.equal(await evaluate("document.querySelector('#motion-detail').getAnimations().filter(animation=>animation.playState==='running').length"),0,'Device reduced motion must prevent the detail animation');
  await click('#motion-reset');
  assert.ok(await evaluate("document.querySelector('#motion-reduced').checked&&document.querySelector('#motion-reduced').disabled"),'Reset must preserve the device preference');
  await command('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
  await until(()=>evaluate("document.querySelector('#motion-demo').dataset.reduced==='false'&&!document.querySelector('#motion-reduced').disabled"),'The specimen should respond when the device preference changes');
  await captureSection('#voice','atlas-direction-voice-desktop.png');

  // Native playbooks support direct links and real profile return continuity.
  await navigate('/design-direction.html#playbook-startup',directionReady+"&&document.querySelector('#playbook-startup').open");
  const directionReturn=await evaluate('location.pathname+location.search+location.hash');
  const directionJourney=navigationCount;
  await click('#playbook-startup a.atlas-button-primary');
  await until(async()=>navigationCount>directionJourney,'The startup playbook should open the real profile');
  await until(()=>evaluate("document.querySelector('#entity-profile h1')?.textContent==='Canva'&&document.querySelector('[data-atlas-back]')?.textContent==='Back to design direction'"),'The startup profile must preserve its handbook entry point');
  assert.equal(await evaluate("document.querySelector('[data-atlas-back]').href"),address+directionReturn);
  const directionBack=navigationCount;
  await click('[data-atlas-back]');
  await until(async()=>navigationCount>directionBack,'Profile return must navigate back to the handbook');
  await until(()=>evaluate(directionReady+"&&document.querySelector('#playbook-startup').open"),'Return should reopen the linked startup playbook');
  assert.equal(await evaluate('location.pathname+location.search+location.hash'),directionReturn);

  await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await navigate('/design-direction.html',directionReady);
  await decodeImage('#direction-hero-art img','390px direction hero');
  await evaluate("scrollTo({top:0,behavior:'instant'})");
  await screenshot('atlas-direction-hero-mobile.png');
  await assertNoOverflow('390px design direction');
  await captureSection('#direction-boards','atlas-direction-boards-mobile.png');
  await captureSection('#brand-anatomy','atlas-direction-anatomy-mobile.png');
  await click('.direction-layout-switch button[data-layout="narrow"]');
  assert.equal(await evaluate("document.querySelector('#direction-layout-preview').dataset.layout"),'narrow');
  await assertNoOverflow('390px layout specimen');
  await click('#motion-inspect');
  assert.equal(await evaluate("document.querySelector('#motion-demo').dataset.selected"),'person');
  await assertNoOverflow('390px interaction specimen');
  await captureSection('#motion-behaviour','atlas-direction-interaction-mobile.png');
  await click('#motion-reset');
  await click('#playbook-partner > summary');
  assert.ok(await evaluate("document.querySelector('#playbook-partner').open"));
  await assertNoOverflow('390px expanded partner playbook');
  await captureSection('#playbook-partner','atlas-direction-playbook-mobile.png');

  // The asset collection must serve every original image and thumbnail, retain
  // its full composition, and keep editorial artwork separate from research.
  const assetIds=assets.map(asset=>asset.id);
  const assetsReady=`document.querySelectorAll('#asset-gallery .asset-card').length===${assets.length}&&document.querySelectorAll('#icon-grid [data-select-icon]').length===${atlasIcons.length}`;
  const assetPath=value=>new URL(value,address+'/design-assets.html').pathname;
  const assetOpener=id=>`#asset-gallery .asset-card[data-asset="${id}"] .lab-concept-image-button`;
  const visibleAssets=()=>evaluate("[...document.querySelectorAll('#asset-gallery .asset-card')].filter(card=>!card.hidden&&card.getClientRects().length).map(card=>card.dataset.asset)");
  const assetLoaded=asset=>`(()=>{const dialog=document.querySelector('#asset-dialog'),image=document.querySelector('#asset-dialog-image');return dialog?.open&&document.querySelector('#asset-dialog-title')?.textContent.trim()===${JSON.stringify(asset.title)}&&image?.complete&&image.naturalWidth>0&&new URL(image.currentSrc).pathname===${JSON.stringify(assetPath(asset.image))};})()`;
  const assetClosed="!document.querySelector('#asset-dialog').open&&!new URLSearchParams(location.search).has('asset')";
  async function expectAssets(ids,message) {
    await until(async()=>JSON.stringify(await visibleAssets())===JSON.stringify(ids),message);
    assert.deepEqual(await visibleAssets(),ids,message);
  }
  await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1050,deviceScaleFactor:1,mobile:false});
  await navigate('/design-assets.html',assetsReady);
  assert.equal(await evaluate("document.querySelector('.lab-header-nav [aria-current=page]').getAttribute('href')"),'./design-assets.html');
  await decodeImage('#asset-feature img','Desktop assets hero');
  await evaluate("scrollTo({top:0,behavior:'instant'})");
  await screenshot('atlas-assets-hero-desktop.png');
  await assertNoOverflow('Desktop asset library');
  assert.equal(await evaluate("document.querySelector('#asset-count').getAttribute('role')"),'status');
  for(const kind of ['direction','illustration','concept']) {
    await choose('#asset-kind',kind);
    await expectAssets(assets.filter(asset=>asset.kind===kind).map(asset=>asset.id),'Collection filter must isolate '+kind+' assets');
    assert.equal(await evaluate("new URLSearchParams(location.search).get('kind')"),kind);
  }
  await choose('#asset-kind','all');
  await fill('#asset-search',directionBoards[0].title);
  await until(async()=>(await visibleAssets()).includes(directionBoards[0].id)&&(await visibleAssets()).length<assets.length,'Asset title search must narrow the collection');
  assert.equal(await evaluate("new URLSearchParams(location.search).get('assetq')"),directionBoards[0].title);
  await click('#asset-clear');
  assert.equal(await evaluate('document.activeElement.id'),'asset-search');
  await expectAssets(assetIds,'Clearing asset search should restore the collection');
  await fill('#asset-search','atlas-no-image-zzzz-72915');
  await expectAssets([],'An unmatched asset query must have no results');
  assert.ok(await evaluate("!document.querySelector('#asset-empty').hidden&&document.querySelector('#asset-empty').getClientRects().length>0"));
  await click('#asset-reset');
  await expectAssets(assetIds,'Asset reset must recover from no results');
  assert.equal(await evaluate("new URLSearchParams(location.search).has('assetq')"),false);
  for(const asset of assets) {
    const opener=assetOpener(asset.id);
    await decodeImage(opener+' img','Desktop '+asset.id+' thumbnail');
    await click(opener);
    await until(()=>evaluate(assetLoaded(asset)),'Full asset did not decode: '+asset.id);
    assert.equal(await evaluate("new URLSearchParams(location.search).get('asset')"),asset.id);
    assert.equal(await evaluate("document.querySelector('#asset-dialog-image').alt"),asset.alt);
    assert.ok(await evaluate("document.querySelector('#asset-dialog').getAttribute('aria-labelledby')?.split(' ').includes('asset-dialog-title')"));
    assert.ok(await evaluate("document.querySelector('#asset-dialog').contains(document.activeElement)"));
    assert.equal(await evaluate("new URL(document.querySelector('#asset-download').href).pathname"),assetPath(asset.image));
    assert.equal(await evaluate("document.querySelector('#asset-dialog-image-wrap').dataset.transparent"),String(Boolean(asset.transparent)));
    assert.ok((await text('#asset-dialog-usage')).includes(asset.usage[0]),'The asset must carry its usage guidance');
    if(asset.route)assert.equal(await evaluate("document.querySelector('#asset-working-view').href"),new URL(asset.route,address+'/design-assets.html').href);
    else assert.ok(await evaluate("document.querySelector('#asset-working-view').hidden"),'Editorial artwork must not invent a working research route');
    if(asset.transparent) {
      assert.ok(await evaluate("(()=>{const image=document.querySelector('#asset-dialog-image'),canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;const context=canvas.getContext('2d');context.drawImage(image,0,0,64,64);const data=context.getImageData(0,0,64,64).data;for(let i=3;i<data.length;i+=4)if(data[i]<255)return true;return false;})()"),'Transparent artwork must contain actual alpha: '+asset.id);
    }
    await assertNoOverflow('Desktop '+asset.id+' asset dialog');
    if(asset.id==='direction-field-guide'||asset.id==='illustration-connect')await screenshot('atlas-assets-'+asset.id+'-dialog-desktop.png');
    await click('#asset-dialog-close');
    await until(()=>evaluate(assetClosed),'Closing an asset must clear its dialog/history state');
    assert.ok(await evaluate(`document.activeElement?.matches(${JSON.stringify(opener)})`),'Asset dialog must restore its exact original opener');
  }
  for(const asset of assets)for(const file of [asset.image,asset.thumb])assert.ok(requests.some(request=>request.status===200&&new URL(request.url,address).pathname===assetPath(file)),'Asset image was not served: '+file);
  await captureSection('#image-collection','atlas-assets-collection-desktop.png');

  const firstAsset=assets[0],nextAsset=assets[1];
  await click(assetOpener(firstAsset.id));
  await until(()=>evaluate(assetLoaded(firstAsset)),'Asset dialog should reopen');
  await click('#asset-dialog-next');
  await until(()=>evaluate(assetLoaded(nextAsset)),'Next should advance through the asset collection');
  assert.equal(await evaluate("document.querySelector('#asset-dialog-announcement').getAttribute('role')"),'status');
  assert.ok((await text('#asset-dialog-announcement')).includes(nextAsset.title),'Asset navigation must announce the new title');
  await press('ArrowLeft','ArrowLeft',37);
  await until(()=>evaluate(assetLoaded(firstAsset)),'ArrowLeft should return to the previous asset');
  await press('ArrowRight','ArrowRight',39);
  await until(()=>evaluate(assetLoaded(nextAsset)),'ArrowRight should advance to the next asset');
  await click('#asset-dialog-prev');
  await until(()=>evaluate(assetLoaded(firstAsset)),'Previous control must remain operable');
  await evaluate("(()=>{const dialog=document.querySelector('#asset-dialog');const controls=[...dialog.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),[tabindex]')].filter(control=>control.tabIndex>=0&&control.getClientRects().length);controls[0].focus();})()");
  await press('Tab','Tab',9,1);
  assert.ok(await evaluate("document.querySelector('#asset-dialog').contains(document.activeElement)"),'Asset modal must contain Shift+Tab focus');
  await press('Tab','Tab',9);
  assert.ok(await evaluate("document.querySelector('#asset-dialog').contains(document.activeElement)"),'Asset modal must contain Tab focus');
  await press('Escape','Escape',27);
  await until(()=>evaluate(assetClosed),'Escape must dismiss the asset dialog');
  assert.ok(await evaluate(`document.activeElement?.matches(${JSON.stringify(assetOpener(firstAsset.id))})`),'Browsing assets must preserve the original focus-return control');
  const linkedIllustration=editorialIllustrations.find(asset=>asset.id==='illustration-connect');
  await navigate('/design-assets.html?kind=illustration&assetq=Connect&asset='+linkedIllustration.id,assetLoaded(linkedIllustration));
  assert.equal(await evaluate("document.querySelector('#asset-kind').value"),'illustration');
  assert.equal(await evaluate("document.querySelector('#asset-search').value"),'Connect');
  await press('Escape','Escape',27);
  await until(()=>evaluate(assetClosed),'A direct asset link should close without leaving the asset library');
  assert.equal(await evaluate('location.pathname'),'/design-assets.html');
  assert.equal(await evaluate("new URLSearchParams(location.search).get('kind')"),'illustration');
  assert.equal(await evaluate("new URLSearchParams(location.search).get('assetq')"),'Connect');
  assert.ok((await visibleAssets()).includes(linkedIllustration.id),'Closing a deep link must retain the filtered collection');

  // The icon workbench changes real SVG geometry/paint and exports those exact choices.
  await navigate('/design-assets.html',assetsReady);
  const visibleIcons=()=>evaluate("[...document.querySelectorAll('#icon-grid [data-select-icon]')].filter(button=>button.getClientRects().length).map(button=>button.dataset.selectIcon)");
  assert.deepEqual(await visibleIcons(),atlasIcons.map(icon=>icon.id));
  assert.equal(await evaluate("document.querySelector('#icon-count').getAttribute('role')"),'status');
  for(const category of ['explore','navigation','actions','entities','evidence']) {
    await choose('#icon-category',category);
    assert.deepEqual(await visibleIcons(),atlasIcons.filter(icon=>icon.category===category).map(icon=>icon.id),'Icon category must filter actual SVG choices');
    assert.equal(await evaluate("new URLSearchParams(location.search).get('category')"),category);
  }
  await choose('#icon-category','all');
  await fill('#icon-search','graph');
  assert.ok((await visibleIcons()).includes('graph')&&(await visibleIcons()).length<atlasIcons.length,'Icon search should narrow the real collection');
  await click('#icon-clear');
  assert.equal(await evaluate('document.activeElement.id'),'icon-search');
  assert.equal((await visibleIcons()).length,32);
  await fill('#icon-search','atlas-no-icon-zzzz-72915');
  assert.deepEqual(await visibleIcons(),[]);
  assert.ok(await evaluate("!document.querySelector('#icon-empty').hidden&&document.querySelector('#icon-empty').getClientRects().length>0"));
  await click('#icon-reset');
  assert.equal((await visibleIcons()).length,32,'Reset must recover all utility icons');
  await click('#icon-grid [data-select-icon="graph"]');
  assert.equal(await evaluate("document.querySelector('#icon-preview').dataset.icon"),'graph');
  assert.ok(await evaluate("document.activeElement.matches('#icon-grid [data-select-icon=graph]')"),'Desktop icon selection should retain its grid focus');
  assert.equal(await evaluate("document.querySelectorAll('#icon-grid [aria-pressed=true]').length"),1);
  for(const size of ['16','32','48']) {
    await choose('#icon-size',size);
    const geometry=await evaluate("(()=>{const svg=document.querySelector('#icon-preview > svg'),rect=svg.getBoundingClientRect();return {width:rect.width,height:rect.height,attribute:svg.getAttribute('width'),viewBox:svg.getAttribute('viewBox')};})()");
    assert.ok(Math.abs(geometry.width-Number(size))<0.5&&Math.abs(geometry.height-Number(size))<0.5,'The SVG preview must render at the chosen size: '+JSON.stringify(geometry));
    assert.equal(geometry.attribute,size);
    assert.equal(geometry.viewBox,'0 0 24 24');
  }
  await choose('#icon-stroke','2.25');
  assert.equal(await evaluate("document.querySelector('#icon-preview > svg').getAttribute('stroke-width')"),'2.25');
  assert.equal(await evaluate("Number.parseFloat(getComputedStyle(document.querySelector('#icon-preview > svg')).strokeWidth)"),2.25,'Selected stroke must survive shared CSS');
  await choose('#icon-color','accent');
  const accent=await evaluate("getComputedStyle(document.documentElement).getPropertyValue('--atlas-accent').trim()");
  assert.equal(await evaluate("document.querySelector('#icon-preview > svg').getAttribute('stroke')"),accent);
  await choose('#icon-color','white');
  assert.equal(await evaluate("document.querySelector('#icon-contrast-note').dataset.tone"),'warning','White on paper should reveal the low-contrast note');
  await choose('#icon-backdrop','forest');
  assert.equal(await evaluate("document.querySelector('#icon-preview').dataset.backdrop"),'forest');
  assert.equal(await evaluate("document.querySelector('#icon-contrast-note').dataset.tone"),'','A suitable dark backdrop should clear the preview warning');
  const iconSvg=await text('#icon-code');
  const exported=await evaluate("(async()=>{const response=await fetch(document.querySelector('#icon-download').href),source=await response.text(),doc=new DOMParser().parseFromString(source,'image/svg+xml'),svg=doc.documentElement;return {source,width:svg.getAttribute('width'),height:svg.getAttribute('height'),stroke:svg.getAttribute('stroke'),weight:svg.getAttribute('stroke-width'),fill:svg.getAttribute('fill'),namespace:svg.namespaceURI,errors:doc.querySelectorAll('parsererror').length,download:document.querySelector('#icon-download').download};})()");
  assert.equal(exported.source,iconSvg,'Download must contain the SVG shown in the inspector');
  assert.deepEqual([exported.width,exported.height,exported.stroke,exported.weight,exported.fill,exported.errors],['48','48','#ffffff','2.25','none',0]);
  assert.equal(exported.namespace,'http://www.w3.org/2000/svg');
  assert.match(exported.download,/graph.*48px\.svg$/);
  const defaultSvg=await evaluate("(async()=>{const response=await fetch(document.querySelector('#icon-default-download').href),source=await response.text(),svg=new DOMParser().parseFromString(source,'image/svg+xml').documentElement;return {status:response.status,width:svg.getAttribute('width'),weight:svg.getAttribute('stroke-width')};})()");
  assert.deepEqual(defaultSvg,{status:200,width:'24',weight:'1.65'},'Default SVG download must remain canonical');
  await click('#icon-copy');
  await until(()=>evaluate("['success','error'].includes(document.querySelector('#icon-feedback').dataset.tone)"),'Copy SVG needs completed success or manual-copy feedback');
  assert.equal(await evaluate("document.querySelector('#icon-feedback').getAttribute('role')"),'status');
  assert.match(await text('#icon-feedback'),/Graph.*SVG|SVG.*Graph/i);
  if(await evaluate("document.querySelector('#icon-feedback').dataset.tone==='error'")) {
    assert.ok(await evaluate("!document.querySelector('#icon-copy-fallback').hidden&&document.querySelector('#icon-copy-value').getClientRects().length>0"));
    assert.equal(await evaluate("document.querySelector('#icon-copy-value').value"),iconSvg);
    assert.equal(await evaluate('document.activeElement.id'),'icon-copy-value');
  } else assert.match(await text('#icon-feedback'),/copied/i);
  await assertNoOverflow('Desktop SVG icon workbench');
  await captureSection('#icon-library','atlas-icons-library-desktop.png');
  await captureSection('#icon-inspector','atlas-icons-workbench-desktop.png');
  const kit=await evaluate("(async()=>{const response=await fetch(document.querySelector('#design-kit-download').href),bytes=new Uint8Array(await response.arrayBuffer());return {status:response.status,length:bytes.length,signature:[...bytes.slice(0,4)]};})()");
  assert.equal(kit.status,200,'The complete design kit must be downloadable');
  assert.ok(kit.length>1000);
  assert.deepEqual(kit.signature,[80,75,3,4],'Design kit must be a real ZIP archive');

  await navigate('/design-assets.html?icon=graph&category=explore&iconq=graph&size=48&stroke=2.25&color=white&backdrop=forest#icon-library',"document.querySelector('#icon-preview')?.dataset.icon==='graph'&&document.querySelector('#icon-size')?.value==='48'");
  assert.deepEqual(await evaluate("['size','stroke','color','backdrop','category'].map(name=>document.querySelector('#icon-'+name).value)"),['48','2.25','white','forest','explore'],'Icon deep links should restore export choices and collection scope');
  assert.equal(await evaluate("document.querySelector('#icon-search').value"),'graph');
  assert.equal(await evaluate("document.querySelector('#icon-preview > svg').getAttribute('width')"),'48');
  await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await navigate('/design-assets.html',assetsReady);
  await decodeImage('#asset-feature img','390px assets hero');
  await evaluate("scrollTo({top:0,behavior:'instant'})");
  await screenshot('atlas-assets-hero-mobile.png');
  await assertNoOverflow('390px assets and icons');
  await choose('#asset-kind','illustration');
  await expectAssets(editorialIllustrations.map(asset=>asset.id),'Mobile native collection filter should remain usable');
  await captureSection('#image-collection','atlas-assets-collection-mobile.png');
  await click(assetOpener(linkedIllustration.id));
  await until(()=>evaluate(assetLoaded(linkedIllustration)),'Mobile asset dialog must decode its full image');
  await assertNoOverflow('390px asset dialog');
  const assetBox=await evaluate("(()=>{const r=document.querySelector('#asset-dialog').getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:innerWidth,height:innerHeight};})()");
  assert.ok(assetBox.left>=-1&&assetBox.right<=assetBox.width+1&&assetBox.top>=-1&&assetBox.bottom<=assetBox.height+1,'Mobile asset dialog must fit the viewport: '+JSON.stringify(assetBox));
  await screenshot('atlas-assets-dialog-mobile.png');
  await click('#asset-dialog-next');
  const afterLinked=assets[(assets.indexOf(linkedIllustration)+1)%assets.length];
  await until(()=>evaluate(assetLoaded(afterLinked)),'Mobile asset next control must remain usable');
  await click('#asset-dialog-close');
  await until(()=>evaluate(assetClosed),'Mobile asset close should restore collection scope');
  assert.ok(await evaluate(`document.activeElement?.matches(${JSON.stringify(assetOpener(linkedIllustration.id))})`),'Mobile asset browsing should restore the original opener');
  await click('#icon-grid [data-select-icon="person"]');
  assert.equal(await evaluate("document.querySelector('#icon-preview').dataset.icon"),'person');
  assert.equal(await evaluate('document.activeElement.id'),'icon-selected-title','Narrow icon selection should focus the revealed inspector');
  await choose('#icon-size','32');
  assert.equal(await evaluate("Math.round(document.querySelector('#icon-preview > svg').getBoundingClientRect().width)"),32);
  await assertNoOverflow('390px icon inspector');
  await captureSection('#icon-inspector','atlas-icons-workbench-mobile.png');
  await click('.asset-icon-return');
  await fill('#icon-search','atlas-no-mobile-icon-zzzz');
  assert.deepEqual(await visibleIcons(),[]);
  await click('#icon-reset');
  assert.equal((await visibleIcons()).length,32,'Mobile icon recovery should restore the grid');
  await captureSection('#icon-library','atlas-icons-library-mobile.png');

  assert.deepEqual(exceptions,[],'The design microsite must not raise unhandled JavaScript exceptions');
  assert.deepEqual(browserMessages.filter(message=>message.level==='error'),[],'The design microsite must not log application errors');
  const missingAssets=requests.filter(request=>request.status===404&&!request.url.startsWith('/favicon.ico'));
  assert.deepEqual(missingAssets,[],'All microsite pages, modules, images, SVGs and downloads must be published');
  console.log('Design microsite browser checks passed: existing five-concept lab suite; ten decoded assets and real illustration transparency; accessible dialog navigation/focus/deep links; 32-icon filtering, styled SVG previews, exact exports and copy feedback; five native playbooks, profile return, layout and reduced-motion demos; desktop/390px layouts and focused screenshots.');
} catch(error) {
  console.error('Design lab diagnostics:',JSON.stringify(await readDiagnostics().catch(()=>({state:'unavailable'}))));
  await captureFailure('atlas-design-lab-failed.png').catch(()=>{});
  throw error;
} finally {
  socket?.close();chrome.kill();server.close();
  await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100}).catch(()=>{});
}
