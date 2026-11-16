// Browser-level treemap and ranked-card checks. Uses the Chrome already installed
// on the GitHub Actions runner and Node's built-in CDP WebSocket client.
import assert from 'node:assert/strict';
import {makeView,formatValue} from '../dist/treemap-model.js';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {mkdtemp, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {extname, join, resolve, sep} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';

const root=resolve('dist'), profile=await mkdtemp(join(tmpdir(),'atlas-treemap-chrome-'));
const screenshotDir=process.env.ATLAS_SCREENSHOTS_DIR||join(tmpdir(),'atlas-treemap-screenshots');
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
  const pending=new Map(), exceptions=[], browserMessages=[];let sequence=0, documentLoads=0;
  socket.addEventListener('message',event=>{
    const message=JSON.parse(event.data);
    if(message.method==='Page.domContentEventFired')documentLoads++;
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
  async function move(type,x,y,button='none',buttons=0) {
    await command('Input.dispatchMouseEvent',{type,x,y,button,buttons,clickCount:1});
  }
  async function drag(x,y,dx,dy) {
    await move('mouseMoved',x,y);
    await move('mousePressed',x,y,'left',1);
    await move('mouseMoved',x+dx,y+dy,'left',1);
    await move('mouseReleased',x+dx,y+dy,'left',0);
  }
  async function screenshot(name,fullPage=false) {
    await mkdir(screenshotDir,{recursive:true});
    const params={format:'png'};
    if(fullPage){
      await evaluate("scrollTo({top:0,behavior:'instant'})");
      const size=await evaluate('({width:innerWidth,height:Math.min(document.documentElement.scrollHeight,3600)})');
      params.captureBeyondViewport=true;params.clip={x:0,y:0,...size,scale:1};
    }
    const image=await command('Page.captureScreenshot',params);
    await writeFile(join(screenshotDir,name),Buffer.from(image.data,'base64'));
  }
  captureFailure=screenshot;
  await command('Runtime.enable'); await command('Page.enable');
  await command('Page.bringToFront');
  await command('Emulation.setFocusEmulationEnabled',{enabled:true});
  await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});
  const settled=()=>until(()=>evaluate("document.querySelector('#treemap-workspace')?.getAttribute('aria-busy')==='false'"),'Treemap did not settle');
  const navigate = async suffix => {
    const before=documentLoads;
    await command('Page.navigate',{url:address+'/treemap.html'+suffix});
    await until(async()=>documentLoads>before,'Treemap navigation did not load a new document');
    await settled();
  };
  const reload=async()=>{
    const before=documentLoads;await command('Page.reload');
    await until(async()=>documentLoads>before,'Treemap reload did not load a new document');
    await settled();
  };
  const change = (id,value) => evaluate(`(()=>{const e=document.getElementById(${JSON.stringify(id)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const text = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).textContent`);
  const cardIds=()=>evaluate("Array.from(document.querySelectorAll('#treemap-cards .treemap-card[data-company]'),card=>card.dataset.company)");
  const snapshot=JSON.parse(await readFile('dist/data/graph.json','utf8')), valuation=makeView(snapshot,{metric:'valuation',currency:'USD'});
  await navigate('');
  assert.equal(await evaluate("document.querySelector('#treemap-metric').value"),'funding');
  assert.match(await text('#treemap-subtitle'),/event amount/);
  await screenshot('funding-default-desktop.png');
  await navigate('?metric=companies');
  assert.equal(await evaluate("document.querySelector('#treemap-metric').value"),'companies');
  assert.equal(await evaluate("document.querySelectorAll('.treemap-tile').length"),JSON.parse(await readFile('dist/data/graph.json','utf8')).entities.filter(entity=>entity.kind==='startup').length);
  await screenshot('companies-desktop.png');
  await change('treemap-metric','valuation');
  assert.match(await text('#treemap-summary'),new RegExp(formatValue(valuation.total,'valuation','USD').replaceAll('.', '\\.')));
  assert.equal(await evaluate("document.querySelectorAll('.treemap-tile').length"),valuation.rows.length);
  await click('[data-company="startup:canva"]');
  assert.match(await text('#treemap-detail'),/USD 40B/);assert.match(await text('#treemap-detail'),/2021-09-15/);
  assert.match(await evaluate("document.querySelector('.treemap-profile').getAttribute('href')"),/startup%3Acanva/);
  await screenshot('valuation-desktop.png');
  await change('treemap-metric','funding');
  await click('[data-company="startup:psiquantum"]');
  assert.match(await text('#treemap-detail'),/USD 450M/);assert.match(await text('#treemap-detail'),/newer announcement/);
  await change('treemap-currency','AUD');
  assert.match(await text('#treemap-summary'),/AUD/);assert.doesNotMatch(await text('#treemap-summary'),/USD/);
  await screenshot('funding-aud-desktop.png');

  // Cards use the existing financial read model and keep its source caveats.
  await change('treemap-currency','USD');await click('#show-cards');
  const funding=makeView(snapshot,{metric:'funding',currency:'USD'});
  assert.equal(await evaluate("document.querySelector('#treemap-cards').hidden"),false);
  assert.equal(await evaluate("document.querySelector('#treemap-chart').hidden"),true);
  assert.equal(await evaluate("document.querySelector('#treemap-list').hidden"),true);
  assert.deepEqual(await cardIds(),funding.rows.map(row=>row.id),'Cards must preserve the financial ranking and coverage');
  const cardText=await evaluate("Array.from(document.querySelectorAll('#treemap-cards .treemap-card[data-company]'),card=>card.textContent)");
  funding.rows.forEach((row,index)=>{
    assert.ok(cardText[index].includes(row.entity.name),'Cards must display their company name');
    assert.ok(cardText[index].includes(formatValue(row.value,'funding','USD')),'Cards must display the same monetary observation as the map');
  });
  await click('#treemap-cards [data-company="startup:psiquantum"]');
  assert.match(await text('#treemap-detail'),/USD 450M/);
  assert.match(await text('#treemap-detail'),/newer announcement/);
  const selectedFunding=funding.rows.find(row=>row.id==='startup:psiquantum');
  assert.ok((await text('#treemap-detail')).includes(selectedFunding.event.announced_on));
  assert.equal(await evaluate("document.querySelector('#treemap-detail .treemap-source').href"),new URL(selectedFunding.event.source).href);
  assert.equal(await evaluate("new URL(location.href).searchParams.get('company')"),'startup:psiquantum');
  assert.equal(await evaluate("new URL(location.href).searchParams.get('view')"),'cards');
  await screenshot('cards-funding-desktop.png',true);
  await click('#treemap-company-tab');
  assert.equal(await evaluate("document.querySelector('#treemap-company-panel').hidden"),false,'Cards retain the company inspector');
  await click('#treemap-figure-tab');
  assert.equal(await evaluate("document.querySelector('#treemap-figure-panel').hidden"),false,'Cards retain the figure inspector');
  const sharedUrl=await evaluate('location.href');
  await reload();
  assert.equal(await evaluate('location.href'),sharedUrl,'Shared card state must survive reload');
  assert.equal(await evaluate("document.querySelector('#treemap-cards').hidden"),false);
  assert.equal(await text('#treemap-detail h2'),'PsiQuantum');
  assert.deepEqual(await cardIds(),funding.rows.map(row=>row.id));
  await click('#show-list');assert.equal(await text('#treemap-detail h2'),'PsiQuantum');
  await click('#show-cards');assert.equal(await text('#treemap-detail h2'),'PsiQuantum');
  await evaluate('history.back()');
  await until(()=>evaluate("document.querySelector('#treemap-list').hidden===false"),'Back did not restore the list presentation');
  assert.equal(await text('#treemap-detail h2'),'PsiQuantum');
  await evaluate('history.forward()');
  await until(()=>evaluate("document.querySelector('#treemap-cards').hidden===false"),'Forward did not restore cards');
  assert.equal(await text('#treemap-detail h2'),'PsiQuantum');
  await click('#treemap-share');
  await until(()=>evaluate("document.querySelector('#treemap-share-status').textContent.trim().length>0"),'Sharing did not report copy success or its browser-address fallback');
  await evaluate("(()=>{const e=document.querySelector('#treemap-query');e.value='no company matches this';e.dispatchEvent(new Event('input',{bubbles:true}));})()");
  assert.equal((await cardIds()).length,0);
  assert.match(await text('#treemap-cards'),/No (?:comparable )?companies/);
  await evaluate("(()=>{const e=document.querySelector('#treemap-query');e.value='';e.dispatchEvent(new Event('input',{bubbles:true}));})()");
  assert.deepEqual(await cardIds(),funding.rows.map(row=>row.id));
  await click('#show-map');

  await change('treemap-metric','companies');await change('treemap-group','decade');
  assert.ok(await evaluate("document.querySelectorAll('[data-period]').length>=3"));
  await click('[data-period="2010s"]');assert.match(await text('#treemap-breadcrumb'),/2010S/);
  await evaluate('history.back()');await until(()=>evaluate("document.querySelector('#treemap-breadcrumb').textContent==='ALL COMPANIES'"),'Back did not restore cohort');
  await evaluate('history.forward()');await until(()=>evaluate("document.querySelector('#treemap-breadcrumb').textContent.includes('2010S')"),'Forward did not restore cohort');
  await click('[data-period="all"]');
  await click('#show-cards');
  const companyView=makeView(snapshot,{metric:'companies'});
  assert.deepEqual(await evaluate("Array.from(document.querySelectorAll('#treemap-cards [data-period]'),card=>card.dataset.period)"),companyView.groups.map(group=>group.id),'Grouped cards must preserve the existing founding-decade view');
  await click('#treemap-cards [data-period="2010s"]');
  assert.match(await text('#treemap-breadcrumb'),/2010S/);
  assert.deepEqual(await cardIds(),makeView(snapshot,{metric:'companies',period:'2010s'}).rows.map(row=>row.id),'A decade card must drill down to the same companies as its map');
  await click('[data-period="all"]');await click('#show-list');
  assert.equal(await evaluate("document.querySelector('#treemap-list').hidden"),false);
  assert.ok(await evaluate("document.querySelectorAll('#treemap-list .treemap-logo img').length>0"),'Ranked list must retain logo images');
  await change('treemap-group','company');await click('#show-map');
  assert.ok(await evaluate("Array.from(document.querySelectorAll('.treemap-tile.compact .treemap-logo')).some(el=>getComputedStyle(el).display!=='none')"),'Compact company tiles must retain marks');
  await screenshot('company-logos-desktop.png');
  await evaluate("globalThis.logoUnderTest=document.querySelector('#treemap-list img[src*=revolut]')");
  await until(()=>evaluate("logoUnderTest.complete&&logoUnderTest.naturalWidth>0&&!logoUnderTest.hidden"),'Bundled logo must decode before testing failure');
  await evaluate("logoUnderTest.src='/missing-logo-regression.svg'");
  await until(()=>evaluate("logoUnderTest.complete&&!logoUnderTest.naturalWidth&&logoUnderTest.hidden&&!logoUnderTest.nextElementSibling.hidden"),'Failed logo must show initials');
  await click('#show-list');
  await click('#treemap-reset');
  await evaluate("(()=>{const e=document.querySelector('#treemap-query');e.value='no company matches this';e.dispatchEvent(new Event('input',{bubbles:true}));})()");
  assert.match(await text('#treemap-chart'),/No companies match/);
  await click('#treemap-reset');await change('treemap-metric','valuation');await change('treemap-currency','USD');
  await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await until(()=>evaluate("document.querySelector('#treemap-chart').getBoundingClientRect().width<390"),'Mobile did not resize');
  assert.equal(await evaluate('document.documentElement.scrollWidth<=window.innerWidth'),true,'No horizontal overflow on mobile');
  await screenshot('valuation-mobile.png');
  await change('treemap-metric','companies');
  await screenshot('company-logos-mobile.png');
  await command('Emulation.setDeviceMetricsOverride',{width:320,height:844,deviceScaleFactor:1,mobile:true});
  await until(()=>evaluate("document.querySelector('#treemap-chart').getBoundingClientRect().width<320"),'Small mobile did not resize');
  assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true,'No horizontal overflow at 320px');
  const masthead=await evaluate("(()=>{const links=[...document.querySelectorAll('.atlas-masthead [data-atlas-view]')].map(a=>a.getBoundingClientRect()),brand=document.querySelector('.atlas-wordmark').getBoundingClientRect(),system=document.querySelector('.atlas-masthead .atlas-system-link').getBoundingClientRect();return {sameRow:Math.max(...links.map(r=>r.top))-Math.min(...links.map(r=>r.top))<1,brandClear:brand.right<=system.left||brand.bottom<=system.top||system.bottom<=brand.top};})()");
  assert.ok(masthead.sameRow,'The three primary views should share one row at 320px');
  assert.ok(masthead.brandClear,'The home identity and design-system link must not overlap');
  await screenshot('company-logos-mobile-320.png');
  await change('treemap-metric','funding');await screenshot('funding-mobile-320.png');
  await change('treemap-metric','companies');
  assert.ok(await evaluate("Array.from(document.querySelectorAll('.treemap-tile.tiny:not(.micro) .treemap-logo')).some(el=>getComputedStyle(el).display!=='none')"),'Mobile small company tiles must retain marks');
  await change('treemap-metric','valuation');
  await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await click('#show-cards');
  assert.deepEqual(await cardIds(),valuation.rows.map(row=>row.id),'Mobile cards must preserve the valuation rows');
  assert.equal(await evaluate('document.documentElement.scrollWidth<=window.innerWidth'),true,'Cards must not overflow at 390px');
  await screenshot('cards-valuation-mobile.png',true);
  await command('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await evaluate("scrollTo({top:0,behavior:'instant'})");
  assert.equal(await evaluate("document.querySelector('#treemap-detail').getBoundingClientRect().top>innerHeight-120"),true,'The mobile evidence panel must start below the cards for this activation check');
  await click('#treemap-cards [data-company="startup:canva"]');
  await until(()=>evaluate("(()=>{const panel=document.querySelector('#treemap-detail'),r=panel.getBoundingClientRect();return panel.querySelector('h2')?.textContent==='Canva'&&document.activeElement===panel&&r.top>=-1&&r.top<innerHeight-120;})()"),'Activating a mobile card did not focus and reveal its offscreen evidence');
  await screenshot('cards-evidence-mobile.png');
  await command('Emulation.setEmulatedMedia',{features:[]});
  await command('Emulation.setDeviceMetricsOverride',{width:320,height:844,deviceScaleFactor:1,mobile:true});
  assert.equal(await evaluate('document.documentElement.scrollWidth<=window.innerWidth'),true,'Cards must not overflow at 320px');
  await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await click('#show-list');
  await evaluate("document.querySelector('#treemap-list [data-company]').focus()");
  assert.equal(await evaluate("document.activeElement?.dataset.company"),'startup:canva','The visible company button must own keyboard focus');
  await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,nativeVirtualKeyCode:13,text:'\r',unmodifiedText:'\r'});
  await command('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
  await until(()=>evaluate("document.querySelector('#treemap-detail h2')?.textContent==='Canva'"),'Enter did not activate the focused company');
  assert.equal(await text('#treemap-detail h2'),'Canva');
  await click('.treemap-profile');await until(()=>evaluate("document.querySelector('#entity-profile')?.getAttribute('aria-busy')==='false'"),'Profile did not load');
  assert.equal(await text('h1'),'Canva');
  // Company context exposes existing reviewed founder/media evidence, not guessed metadata.
  await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});
  await navigate('?metric=companies&q=Morse');
  await click('#treemap-chart [data-company="startup:morse-micro"]');
  assert.equal(await evaluate("document.querySelectorAll('#treemap-detail .treemap-founder').length"),2);
  assert.equal(await evaluate("document.querySelectorAll('#treemap-detail .treemap-founder img').length"),2);
  assert.match(await text('#treemap-detail'),/Financial context/);
  assert.match(await text('#treemap-detail'),/Public market cap/);
  assert.match(await text('#treemap-detail'),/Not recorded in USD/);
  assert.ok(await evaluate("Array.from(document.querySelectorAll('#treemap-detail .treemap-founder a')).some(a=>a.textContent.includes('Profile')&&a.href.includes('linkedin.com'))"),'Founder profile links must use recorded URLs');
  assert.ok(await evaluate("document.querySelector('#treemap-chart').getBoundingClientRect().height<=300"),'A single filtered company must not become an oversized empty tile');
  await screenshot('company-context-desktop.png');
  await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await until(()=>evaluate("document.querySelector('#treemap-chart').getBoundingClientRect().width<390"),'Context mobile did not resize');
  assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true,'Context must not overflow at390px');
  await screenshot('company-context-mobile.png');
  await navigate('?metric=companies&q=Revolut');await click('#treemap-chart [data-company="startup:revolut"]');
  assert.match(await text('#treemap-detail'),/Company details/);
  assert.match(await text('#treemap-detail'),/12,200/);
  // Exercise progressive fallback by rejecting only the database request.
  await command('Network.enable');await command('Network.setBlockedURLs',{urls:['*atlas.sqlite*']});
  await navigate('?metric=valuation');assert.match(await text('#treemap-status'),/JSON backup/);
  assert.equal(await evaluate("document.querySelectorAll('.treemap-tile').length"),valuation.rows.length);
  await command('Network.setBlockedURLs',{urls:['*atlas.sqlite*','*data/graph.json*']});
  await navigate('');assert.match(await text('#treemap-status'),/could not be loaded/);
  assert.equal(await evaluate("document.querySelector('#treemap-metric').disabled"),true);
  assert.deepEqual(exceptions,[],'Treemap must not raise unhandled JavaScript exceptions');
  console.log('Treemap browser checks passed: proportional views, ranked cards, currencies, source caveats, grouped drilldown, shared selection/history, keyboard/profile navigation, desktop/mobile, SQLite/JSON fallback and unavailable state.');
} catch(error) {
  await captureFailure('treemap-failed.png').catch(()=>{});throw error;
} finally {
  socket?.close();chrome.kill();server.close();
  await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100}).catch(()=>{});
}
