// Isolated Signal artwork acceptance checks. Uses runner Chrome and Node 22's
// built-in CDP WebSocket client; no browser automation dependency or deployment.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {mkdtemp, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {extname, join, resolve, sep} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';

const siteRoot = resolve('dist');
const pilotPath = '/assets/design-lab/signal-motion-pilot/index.html';
const embedPath = '/__signal-motion-embed';
const outputDir = process.env.ATLAS_SCREENSHOTS_DIR || join(tmpdir(), 'atlas-signal-motion');
const report = {sourceRevision: process.env.ATLAS_SOURCE_REVISION || null, checks: [], measurements: {}, screenshots: [], requests: [], exceptions: [], console: []};
const mime = {'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.png':'image/png', '.webp':'image/webp', '.woff2':'font/woff2', '.json':'application/json'};
let profile, server, chrome, socket, command, evaluate, chromeFailure, chromeLog = '', blockVendor = false;
let serial = 0, run = 0;
const pending = new Map();
const vendorRequest = path => /\/(?:gsap|ScrollTrigger)\.min\.js(?:\?|$)/.test(path);

async function until(fn, message, timeout = 10000) {
  const end = Date.now() + timeout;
  let lastError;
  do {
    if (chromeFailure) throw new Error(chromeFailure + '\n' + chromeLog);
    try { const value = await fn(); if (value) return value; } catch (error) { lastError = error; }
    await delay(60);
  } while (Date.now() < end);
  throw new Error(message + (lastError ? ': ' + lastError.message : ''));
}

async function check(name, fn) {
  const start = Date.now();
  try {
    const detail = await fn();
    report.checks.push({name, status:'passed', durationMs:Date.now() - start, ...(detail === undefined ? {} : {detail})});
    console.log('PASS ' + name);
  } catch (error) {
    report.checks.push({name, status:'failed', durationMs:Date.now() - start, message:error.message});
    throw error;
  }
}

async function screenshot(name, fullPage=false) {
  const options = {format:'png', captureBeyondViewport:fullPage};
  if (fullPage) {
    const size = (await command('Page.getLayoutMetrics')).cssContentSize;
    options.clip = {x:0,y:0,width:size.width,height:size.height,scale:1};
  }
  const result = await command('Page.captureScreenshot', options);
  await writeFile(join(outputDir, name + '.png'), Buffer.from(result.data, 'base64'));
  report.screenshots.push(name + '.png');
}

const auditScript = `(() => {
  const audit = window.__signalMotionAudit = {cls:0, settledCls:0, settled:false, shifts:[], samples:[], events:[], eventSequence:0, lastPageShowPersisted:null};
  try {
    new PerformanceObserver(list => {
      for (const item of list.getEntries()) {
        if (!item.hadRecentInput) audit.cls += item.value;
        // Also include input-adjacent shifts after fonts/images settle: toggling
        // motion must not rearrange the document even when CLS would ignore it.
        if (audit.settled) audit.settledCls += item.value;
        if (item.value > 0) {
          const rect=value=>({x:value.x,y:value.y,width:value.width,height:value.height});
          audit.shifts.push({time:item.startTime,value:item.value,hadRecentInput:item.hadRecentInput,settled:audit.settled,
            sources:(item.sources || []).slice(0,6).map(source=>({tag:source.node?.tagName || null,id:source.node?.id || null,
              class:source.node?.getAttribute?.('class') || null,previous:rect(source.previousRect),current:rect(source.currentRect)}))});
          if(audit.shifts.length>24)audit.shifts.shift();
        }
      }
    }).observe({type:'layout-shift', buffered:true});
  } catch {}
  window.addEventListener('pageshow', event => {audit.lastPageShowPersisted = event.persisted;});
  for (const type of ['keydown','keypress','keyup','click','pointerdown','pointerup','touchstart','touchend']) {
    document.addEventListener(type, event => {
      const control=event.target.closest?.('[data-motion-replay],[data-motion-still]');
      if(!control)return;
      audit.events.push({sequence:++audit.eventSequence,type,target:control.id,trusted:event.isTrusted,key:event.key || null,code:event.code || null,hidden:document.hidden,time:performance.now()});
      if(audit.events.length>80)audit.events.shift();
    },{capture:true,passive:true});
  }
})();`;

const readingExpression = `(() => {
  // Caption paragraphs are covered individually. Selecting their figcaption
  // container would also snapshot the intentionally changing status message.
  const elements = [...document.querySelectorAll('main h1, main h2, main h3, main p, main li, main dt, main dd, main a[href], main label')];
  return elements.filter(element => element.id !== 'motion-status' && !element.closest('noscript,[aria-hidden="true"]')).map(element => {
    let opacity = 1, visible = true;
    for (let node = element; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      opacity *= Number(style.opacity);
      visible &&= style.visibility === 'visible' && style.display !== 'none';
    }
    const rect = element.getBoundingClientRect();
    return {tag:element.tagName, text:element.textContent.trim(), opacity, visible:visible && rect.width > 0 && rect.height > 0};
  });
})()`;

async function assertReadable() {
  const reading = await evaluate(readingExpression);
  assert.ok(reading.length >= 5, 'The pilot must contain static explanatory text and links');
  assert.ok(reading.every(item => item.visible && item.opacity >= .999), 'Prose and source links must stay fully visible: ' + JSON.stringify(reading.filter(item => !item.visible || item.opacity < .999)));
  const links = await evaluate(`[...document.querySelectorAll('[data-source-view][href]')].filter(link => link.textContent.trim() && !link.getAttribute('href').startsWith('#')).map(link => ({text:link.textContent.trim(),href:link.href}))`);
  assert.equal(links.length, 3, 'All three labelled research-view links must remain available');
  return reading.filter(item => item.tag !== 'LABEL').map(({tag,text}) => ({tag,text}));
}

async function assertBounds(label) {
  const bounds = await evaluate(`(() => {
    const stage = document.querySelector('#motion-stage').getBoundingClientRect();
    return {width:innerWidth, documentWidth:document.documentElement.scrollWidth, stage:{x:stage.x,width:stage.width,height:stage.height}, font:getComputedStyle(document.querySelector('h1')).fontFamily,
      overflow:[...document.querySelectorAll('main h1,main h2,main p,main a,main label,main button')].filter(element => {
        const r=element.getBoundingClientRect(); return r.width && (r.left < -1 || r.right > innerWidth + 1);
      }).map(element => element.id || element.textContent.trim().slice(0,90))};
  })()`);
  assert.ok(bounds.documentWidth <= bounds.width + 1, label + ' page must not overflow: ' + JSON.stringify(bounds));
  assert.deepEqual(bounds.overflow, [], label + ' text and controls must fit the viewport');
  assert.ok(bounds.stage.width > 0 && bounds.stage.height > 0, 'Artwork must reserve layout space');
  assert.match(bounds.font, /Atlas Geist/i, 'Canonical self-hosted Geist must remain in use');
  return bounds;
}

async function motionState() {
  return evaluate(`(() => ({disabled:document.querySelector('#motion-replay').disabled,
    checked:document.querySelector('#motion-static').checked,
    triggers:window.ScrollTrigger?.getAll().length || 0,
    active:window.gsap?.globalTimeline.getChildren(true,true,true).filter(animation => animation.isActive()).length || 0,
    styles:[...document.querySelectorAll('[data-motion-layer]')].map(layer => ({transform:layer.style.transform,opacity:layer.style.opacity})),
    status:document.querySelector('#motion-status')?.textContent.trim()}))()`);
}

async function waitReady() {
  await until(async () => !(await motionState()).disabled, 'Artwork replay did not become available');
}

async function waitStatic() {
  return until(async () => {
    const state = await motionState();
    return state.disabled && state.triggers === 0 && state.active === 0 && state.styles.every(style => !style.transform && !style.opacity) ? state : null;
  }, 'Motion did not fully revert to its static state');
}

async function waitIdle() {
  return until(async () => { const state = await motionState(); return state.active === 0 ? state : null; }, 'Decorative animation did not finish', 12000);
}

async function key(keyName, code, keyCode) {
  // Match a native Enter press: Chrome needs the character fields to produce
  // keypress/default button activation, not only a keydown for JS handlers.
  const character = keyName === 'Enter' ? {nativeVirtualKeyCode:keyCode,text:'\r',unmodifiedText:'\r'} : {};
  await command('Input.dispatchKeyEvent', {type:'keyDown', key:keyName, code, windowsVirtualKeyCode:keyCode, ...character});
  await command('Input.dispatchKeyEvent', {type:'keyUp', key:keyName, code, windowsVirtualKeyCode:keyCode});
}

async function centre(selector) {
  await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center',behavior:'instant'})`);
  return evaluate(`(() => {const element=document.querySelector(${JSON.stringify(selector)}),r=element.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,width:r.width,height:r.height,hit:element.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))};})()`);
}

async function click(selector) {
  const point = await centre(selector);
  assert.ok(point.hit, selector + ' must be reachable at its visible position');
  await command('Input.dispatchMouseEvent', {type:'mousePressed', x:point.x, y:point.y, button:'left', buttons:1, clickCount:1});
  await command('Input.dispatchMouseEvent', {type:'mouseReleased', x:point.x, y:point.y, button:'left', buttons:0, clickCount:1});
}

async function sampleMotion(trigger, {nativeReplay=false}={}) {
  // Normalize "none" and an identity matrix to the same value, so merely
  // assigning a resting transform cannot be mistaken for observed movement.
  const transformsExpression = `[...document.querySelectorAll('[data-motion-layer]')].map(layer => {
    const m=new DOMMatrixReadOnly(getComputedStyle(layer).transform);
    return [m.a,m.b,m.c,m.d,m.e,m.f].map(value=>Math.round(value*10000)/10000).join(',');
  })`;
  const before = await evaluate(transformsExpression);
  const eventBaseline = await evaluate(`window.__signalMotionAudit.eventSequence`);
  await evaluate(`(() => {
    const audit=window.__signalMotionAudit;
    const generation=(audit.generation || 0)+1;
    audit.generation=generation;
    audit.samples=[];
    audit.sampleEnd=performance.now()+1800;
    const sample=()=>{
      if(audit.generation!==generation)return;
      audit.samples.push({reading:${readingExpression}, transforms:[...document.querySelectorAll('[data-motion-layer]')].map(layer=>getComputedStyle(layer).transform)});
      if(performance.now()<audit.sampleEnd)requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  })()`);
  await trigger();
  if (nativeReplay) {
    await until(() => evaluate(`window.__signalMotionAudit.events.some(event=>event.sequence>${eventBaseline} && event.type==='click' && event.target==='motion-replay' && event.trusted)`), 'Replay input did not dispatch a trusted native click', 2000);
    report.measurements.trustedReplayActivations = (report.measurements.trustedReplayActivations || 0) + 1;
  }
  await until(async () => {
    const transforms = await evaluate(transformsExpression);
    return transforms.some((transform, index) => transform !== before[index]);
  }, (nativeReplay ? 'Replay input' : 'First scroll entry') + ' did not animate any decorative layer', 2000);
}

const sampleReplay = trigger => sampleMotion(trigger, {nativeReplay:true});

// This fixture belongs to the acceptance server, not the published site. It
// embeds the current authored component twice, with static unique ID references.
async function embeddingFixture(styled) {
  const page = await readFile(join(siteRoot, pilotPath), 'utf8');
  const source = page.match(/<main\b[^>]*\bdata-motion-pilot[\s\S]*?<\/main>/)?.[0];
  assert.ok(source, 'The published pilot must expose its authored component root');
  const instance = name => {
    const ids = new Map([...source.matchAll(/\bid="([^"]+)"/g)].map(match => [match[1], name + '-' + match[1]]));
    return source.replace(/^<main\b/, '<section data-test-pilot="' + name + '"').replace(/<\/main>$/, '</section>')
      .replace(/\bid="([^"]+)"/g, (_, id) => 'id="' + ids.get(id) + '"')
      .replace(/\b(aria-labelledby|aria-describedby|for)="([^"]+)"/g, (_, key, value) => key + '="' + value.split(/\s+/).map(id => ids.get(id) || id).join(' ') + '"')
      .replace(/\b(href|src)="([^"]+)"/g, (_, key, value) => {
        if (value.startsWith('#')) return key + '="#' + (ids.get(value.slice(1)) || value.slice(1)) + '"';
        if (/^[a-z]+:/i.test(value)) return key + '="' + value + '"';
        const url = new URL(value.replaceAll('&amp;', '&'), 'http://fixture.invalid' + pilotPath);
        return key + '="' + (url.pathname + url.search + url.hash).replaceAll('&', '&amp;') + '"';
      });
  };
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Embedded motion acceptance host</title><link rel="icon" href="data:,"><link rel="stylesheet" href="/design-tokens.css">
<style>
html { overflow-y:scroll; scroll-padding-top:7px; scrollbar-gutter:auto; }
body { margin:13px; color:#392441; background:#eee4dd; font:15px/1.3 Georgia,serif; }
main { width:auto; margin:0; }
header, footer { display:block; padding:7px; background:#dbcbbd; }
h1,h2,h3 { margin:5px 0; font:700 19px/1.3 Georgia,serif; letter-spacing:normal; }
a { color:#735012; text-underline-offset:2px; }
button,input { font:14px Georgia,serif; }
button,label { cursor:crosshair; }
a:focus-visible,button:focus-visible,input:focus-visible { outline:2px dashed #8d241e; outline-offset:1px; }
::selection { background:#ffdc80; color:#641208; }
.button { display:inline-block; min-height:36px; padding:4px 8px; border:2px dotted #735012; border-radius:0; background:#f4edcb; color:#392441; box-shadow:none; transition:color 2s linear; }
.hero,.principles,.journeys { display:block; padding:4px; border:0; }
.eyebrow,.lede,.motion-status { margin:2px 0; font:15px/1.3 Georgia,serif; color:#392441; }
.journey-grid { display:block; border:0; }
.journey-grid article { padding:3px; border:0; }
.masthead { display:block; min-height:0; padding:7px; }
#host-reference { width:680px; max-width:100%; }
#host-animation { display:inline-block; animation:host-pulse 3s linear infinite alternate; }
@keyframes host-pulse { from { filter:brightness(1); } to { filter:brightness(.95); } }
.embed-slot { width:min(980px,100%); margin:28px 0; }
.embed-slot-narrow { width:320px; max-width:100%; }
</style>${styled ? '<link id="embedded-motion-css" rel="stylesheet" href="/assets/design-lab/signal-motion-pilot/motion.css">' : ''}</head><body>
<main><section id="host-reference"><header class="masthead" data-host-sentinel><h1 data-host-sentinel>Host research workspace</h1><a id="host-link" href="#host-details" data-host-sentinel>Host navigation</a></header>
<div class="hero" data-host-sentinel><h2 data-host-sentinel>Host heading</h2><p class="lede" data-host-sentinel>Host text keeps its own typography and colour.</p><button id="host-action" class="button" data-host-sentinel>Host action</button><label data-host-sentinel><input id="host-checkbox" type="checkbox" data-host-sentinel>Host choice</label></div>
<div id="host-details" class="principles" data-host-sentinel><dl><dt data-host-sentinel>Host term</dt><dd data-host-sentinel>Host definition</dd></dl><span id="host-animation">Host-owned animation</span><output id="host-count">0</output></div>
<div class="journeys journey-grid" data-host-sentinel><article data-host-sentinel><h3 data-host-sentinel>Host journey</h3><p class="eyebrow motion-status" data-host-sentinel>Host status remains readable.</p></article></div><footer data-host-sentinel>Host footer</footer></section>
<div class="embed-slot" id="embed-slot-a">${instance('a')}</div><div class="embed-slot embed-slot-narrow" id="embed-slot-b">${instance('b')}</div></main>
<script>document.querySelector('#host-action').addEventListener('click',()=>{document.querySelector('#host-count').value=String(Number(document.querySelector('#host-count').value)+1);});</script></body></html>`;
}

const hostSnapshotExpression = `(() => {
  const properties=['color','backgroundColor','fontFamily','fontSize','fontWeight','lineHeight','letterSpacing','display','margin','padding','boxSizing','border','borderRadius','boxShadow','cursor','transitionDuration','animationName','animationDuration','scrollPaddingTop','scrollbarGutter'];
  const styles=element=>Object.fromEntries(properties.map(key=>[key,getComputedStyle(element)[key]]));
  const focusStyle=getComputedStyle(document.activeElement);
  return {document:styles(document.documentElement),body:styles(document.body),focus:{id:document.activeElement?.id,visible:document.activeElement.matches(':focus-visible'),outline:focusStyle.outline,offset:focusStyle.outlineOffset},
    sentinels:[...document.querySelectorAll('[data-host-sentinel]')].map(element=>{const r=element.getBoundingClientRect(),selection=getComputedStyle(element,'::selection');return {tag:element.tagName,id:element.id,style:styles(element),selection:{color:selection.color,background:selection.backgroundColor},rect:{x:r.x+scrollX,y:r.y+scrollY,width:r.width,height:r.height}};}),
    hostAnimation:{name:getComputedStyle(document.querySelector('#host-animation')).animationName,count:document.querySelector('#host-animation').getAnimations().length}};
})()`;

const hostAppearance = ({focus, ...appearance}) => appearance;

async function embeddedState(name) {
  return evaluate(`(() => {
    const root=document.querySelector('[data-test-pilot="${name}"]'),contains=target=>target instanceof Node && root.contains(target);
    const animations=window.gsap?.globalTimeline.getChildren(true,true,true) || [];
    const tweens=animations.filter(animation=>animation.targets?.().some(contains));
    const timelines=animations.filter(animation=>animation.getChildren?.(false,true,false).some(tween=>tween.targets().some(contains)));
    return {state:root.dataset.motionState,mounted:root.dataset.motionMounted,checked:root.querySelector('[data-motion-still]').checked,
      disabled:root.querySelector('[data-motion-replay]').disabled,stillDisabled:root.querySelector('[data-motion-still]').disabled,
      status:root.querySelector('[data-motion-status]').textContent.trim(),triggers:window.ScrollTrigger?.getAll().filter(trigger=>contains(trigger.trigger)).length || 0,
      active:tweens.filter(tween=>tween.isActive()).length,tweens:tweens.length,durations:timelines.map(timeline=>timeline.duration()),
      styles:[...root.querySelectorAll('[data-motion-layer]')].map(layer=>({transform:layer.style.transform,opacity:layer.style.opacity}))};
  })()`);
}

async function assertEmbeddedReading() {
  const result=await evaluate(`(() => {
    const ids=[...document.querySelectorAll('[id]')].map(element=>element.id);
    return {styled:!!document.querySelector('#embedded-motion-css')?.sheet,uniqueIds:new Set(ids).size===ids.length,roots:[...document.querySelectorAll('[data-test-pilot]')].map(root=>{
      const input=root.querySelector('[data-motion-still]'),status=root.querySelector('[data-motion-status]');
      const reading=[...root.querySelectorAll('h1,h2,h3,p,li,dt,dd,a[href]')].filter(element=>element!==status && !element.closest('[aria-hidden="true"]')).map(element=>{
        let opacity=1,visible=true;for(let node=element;node;node=node.parentElement){const style=getComputedStyle(node);opacity*=Number(style.opacity);visible&&=style.display!=='none'&&style.visibility==='visible';}
        const r=element.getBoundingClientRect();return {tag:element.tagName,text:element.textContent.trim(),visible:visible&&r.width>0&&r.height>0,opacity};});
      return {name:root.dataset.testPilot,reading,links:[...root.querySelectorAll('[data-source-view]')].map(link=>link.getAttribute('href')),
        typography:{lede:getComputedStyle(root.querySelector('.lede')).fontFamily,status:getComputedStyle(status).fontFamily},
        localLabel:input.labels.length===1 && root.contains(input.labels[0]) && input.labels[0].control===input,
        localDescriptions:[...root.querySelectorAll('[aria-describedby]')].every(element=>element.getAttribute('aria-describedby').split(/\\s+/).every(id=>root.contains(document.getElementById(id)))),
        localHeadings:[...root.querySelectorAll('[aria-labelledby]')].every(element=>element.getAttribute('aria-labelledby').split(/\\s+/).every(id=>root.contains(document.getElementById(id))))};
    })};
  })()`);
  assert.equal(result.uniqueIds,true,'Embedded markup must have unique IDs before enhancement');
  assert.equal(result.roots.length,2);
  for(const root of result.roots){
    assert.ok(root.localLabel && root.localDescriptions && root.localHeadings,root.name+' label and ARIA references must remain in that instance');
    assert.ok(root.reading.length>=5 && root.reading.every(item=>item.visible && item.opacity>=.999),root.name+' source content must stay fully readable');
    assert.equal(root.links.length,3);
    assert.ok(root.links.every(href=>href.startsWith('/') && !href.startsWith('//')),'Fixture research links must retain absolute local destinations');
    if(result.styled)for(const [role,font] of Object.entries(root.typography))assert.match(font,/^["']?Atlas Geist["']?(?:,|$)/,root.name+' '+role+' must retain canonical Geist inside the host');
  }
  if(result.styled)report.measurements.embeddedTypography=result.roots.map(({name,typography})=>({name,...typography}));
  return result.roots.map(root=>({name:root.name,reading:root.reading.map(({tag,text})=>({tag,text})),links:root.links}));
}

async function waitEmbedded(name, kind) {
  return until(async () => {
    const state=await embeddedState(name);
    if(kind==='ready')return !state.disabled ? state : null;
    if(kind==='idle')return state.active===0 ? state : null;
    return state.disabled && state.triggers===0 && state.active===0 && state.styles.every(style=>!style.transform&&!style.opacity) ? state : null;
  }, 'Embedded '+name+' did not reach '+kind);
}

async function replayEmbedded(name, trigger) {
  const baseline=await evaluate('window.__signalMotionAudit.eventSequence');
  await trigger();
  await until(()=>evaluate(`window.__signalMotionAudit.events.some(event=>event.sequence>${baseline} && event.type==='click' && event.target==='${name}-motion-replay' && event.trusted)`),'Embedded replay needs a trusted native click');
  await until(async()=>{const state=await embeddedState(name);return state.active>0 && state.styles.some(style=>style.transform);},'Embedded '+name+' did not visibly start playback',2000);
}

try {
  await mkdir(outputDir, {recursive:true});
  profile = await mkdtemp(join(tmpdir(), 'atlas-motion-chrome-'));
  server = createServer(async (req, res) => {
    const requestURL = new URL(req.url, 'http://localhost');
    const pathname = requestURL.pathname;
    if (pathname === embedPath) {
      try { res.writeHead(200, {'Content-Type':'text/html','Cache-Control':'no-cache'}).end(await embeddingFixture(requestURL.searchParams.get('styled')==='1')); }
      catch(error) { res.writeHead(500).end(String(error)); }
      return;
    }
    if (pathname === '/__signal-motion-away') {
      res.writeHead(200, {'Content-Type':'text/html','Cache-Control':'no-cache'}).end('<!doctype html><title>Navigation check</title><p>Navigation check</p>');
      return;
    }
    if (blockVendor && vendorRequest(req.url)) {
      report.requests.push({url:req.url,status:503,expectedFailure:true});
      res.writeHead(503, {'Cache-Control':'no-store'}).end('Unavailable for acceptance test');
      return;
    }
    try {
      let path = resolve(siteRoot, '.' + decodeURIComponent(pathname));
      if (path !== siteRoot && !path.startsWith(siteRoot + sep)) { res.writeHead(403).end(); return; }
      if (pathname.endsWith('/')) path = join(path, 'index.html');
      const data = await readFile(path);
      report.requests.push({url:req.url,status:200,bytes:data.length});
      res.writeHead(200, {'Content-Type':mime[extname(path)] || 'application/octet-stream','Cache-Control':'no-cache'}).end(data);
    } catch {
      report.requests.push({url:req.url,status:404});
      res.writeHead(404).end();
    }
  });
  await new Promise((resolveListen,reject) => server.once('error',reject).listen(0,'127.0.0.1',resolveListen));
  const origin = `http://127.0.0.1:${server.address().port}`;
  chrome = spawn(process.env.CHROME_BIN || 'google-chrome', ['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--disable-background-networking','--disable-extensions','--no-first-run','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'], {stdio:['ignore','ignore','pipe']});
  chrome.once('error', error => {chromeFailure = error.message;});
  chrome.once('exit', (code,signal) => {chromeFailure = `Chrome exited (${code ?? signal})`;});
  chrome.stderr.on('data', chunk => {chromeLog = (chromeLog + chunk).slice(-5000);});
  const port = await until(async () => Number((await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]), 'Chrome did not start', 45000);
  const target = await until(async () => (await (await fetch(`http://127.0.0.1:${port}/json/list`, {signal:AbortSignal.timeout(5000)})).json()).find(item => item.type === 'page'), 'Chrome did not expose a page');
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolveOpen,reject) => {
    const timer=setTimeout(() => reject(new Error('CDP connection timed out')),10000);
    socket.addEventListener('open', () => {clearTimeout(timer);resolveOpen();}, {once:true});
    socket.addEventListener('error', error => {clearTimeout(timer);reject(error);}, {once:true});
  });
  socket.addEventListener('message', event => {
    const message=JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') report.exceptions.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    if (message.method === 'Runtime.consoleAPICalled' && ['error','warning'].includes(message.params.type)) report.console.push(message.params.args.map(arg => arg.value || arg.description || '').join(' '));
    if (!message.id) return;
    const item=pending.get(message.id);
    if (!item) return;
    pending.delete(message.id);clearTimeout(item.timer);
    if (message.error) item.reject(new Error(message.error.message)); else item.resolve(message.result);
  });
  socket.addEventListener('close', () => {
    for (const item of pending.values()) {clearTimeout(item.timer);item.reject(new Error('CDP connection closed'));}
    pending.clear();
  });
  command = (method,params={}) => new Promise((resolveCommand,reject) => {
    const id=++serial;
    const timer=setTimeout(() => {pending.delete(id);reject(new Error(method + ' timed out'));},12000);
    pending.set(id,{resolve:resolveCommand,reject,timer});
    socket.send(JSON.stringify({id,method,params}));
  });
  evaluate = async expression => {
    const result = await command('Runtime.evaluate', {expression, returnByValue:true, awaitPromise:true});
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  await command('Page.enable');
  await command('Runtime.enable');
  await command('Network.enable');
  await command('Network.setCacheDisabled', {cacheDisabled:true});
  await command('Performance.enable');
  await command('Page.addScriptToEvaluateOnNewDocument', {source:auditScript});

  const viewport = async (width, mobile=false, height=mobile ? 844 : 1050) => {
    await command('Emulation.setDeviceMetricsOverride', {width,height,deviceScaleFactor:1,mobile});
    await command('Emulation.setTouchEmulationEnabled', {enabled:mobile,maxTouchPoints:1});
  };
  const preference = value => command('Emulation.setEmulatedMedia', {features:[{name:'prefers-reduced-motion',value}]});
  const navigate = async () => {
    const url = origin + pilotPath + '?acceptance=' + (++run);
    await command('Page.navigate', {url});
    await until(() => evaluate(`location.href===${JSON.stringify(url)} && document.readyState!=='loading' && !!document.querySelector('[data-motion-pilot]')`), 'Pilot document did not load');
    await evaluate(`Promise.all([document.fonts.ready,...[...document.images].filter(image=>image.complete || image.loading!=='lazy').map(image=>image.decode().catch(()=>{}))])`);
    // Drain font/layout observer deliveries before measuring later motion. A
    // Node-side wait also works when the document has JavaScript disabled.
    await delay(120);
    await evaluate(`window.__signalMotionAudit && Object.assign(window.__signalMotionAudit,{settled:true,settledCls:0})`);
  };
  const navigateEmbedded = async (styled=true) => {
    const url=origin+embedPath+'?styled='+(styled?'1':'0')+'&acceptance='+(++run);
    await command('Page.navigate',{url});
    await until(()=>evaluate(`location.href===${JSON.stringify(url)} && document.readyState!=='loading' && document.querySelectorAll('[data-test-pilot]').length===2`),'Embedded host document did not load');
    await evaluate(`Promise.all([document.fonts.ready,...[...document.images].map(image=>image.decode().catch(()=>{}))])`);
    await delay(120);
    await evaluate(`window.__signalMotionAudit && Object.assign(window.__signalMotionAudit,{settled:true,settledCls:0})`);
  };
  const mountEmbedded = async (failA=false) => {
    await evaluate(`(async()=>{
      const {mountMotionPilot}=await import('/assets/design-lab/signal-motion-pilot/motion.js');
      const roots=Object.fromEntries([...document.querySelectorAll('[data-test-pilot]')].map(root=>[root.dataset.testPilot,root]));
      const owners={};
      window.__embedding={roots,owners,mount(name,fail=false){owners[name]=mountMotionPilot(roots[name],fail?{loadRuntime:()=>Promise.reject(new Error('Expected per-instance runtime failure'))}:undefined);},destroy(name){owners[name]?.();delete owners[name];}};
      window.addEventListener('pagehide',()=>Object.values(owners).forEach(destroy=>destroy()),{once:true});
      window.__embedding.mount('a',${failA});window.__embedding.mount('b');
    })()`);
  };

  let canonicalReading;
  await check('Reduced-motion first visit keeps static content and skips vendor loading', async () => {
    await viewport(1440);
    await preference('reduce');
    const start = report.requests.length;
    await navigate();
    await delay(200);
    canonicalReading = await assertReadable();
    await waitStatic();
    assert.equal(report.requests.slice(start).filter(request => vendorRequest(request.url)).length, 0, 'Reduced motion must not request GSAP vendors');
    assert.equal(await evaluate(`document.querySelector('#motion-replay') instanceof HTMLButtonElement && document.querySelector('#motion-static') instanceof HTMLInputElement && document.querySelector('#motion-static').type==='checkbox'`), true);
    assert.equal(await evaluate(`[...document.querySelectorAll('[data-motion-layer]')].filter(layer=>layer.closest('[aria-hidden="true"]')).length`), 3, 'All three artwork layers must belong to an explicitly decorative subtree');
    report.measurements.desktop = await assertBounds('1440px');
    await screenshot('01-desktop-reduced');
  });

  await check('Live opt-in loads local runtime with a single scoped trigger', async () => {
    await preference('no-preference');
    await centre('#motion-stage');
    await waitReady();
    assert.ok((await motionState()).triggers <= 1, 'At most one artwork trigger may exist; a completed once trigger can retire');
    assert.deepEqual(await assertReadable(), canonicalReading);
    const resources = await evaluate(`performance.getEntriesByType('resource').map(item=>({url:item.name,bytes:item.transferSize})).filter(item=>/\\/(?:gsap|ScrollTrigger)\\.min\\.js(?:\\?|$)/.test(item.url))`);
    assert.equal(resources.length, 2, 'Both local motion runtime files must be loaded');
    assert.ok(resources.every(item => new URL(item.url).origin === origin), 'Vendor scripts must be self-hosted');
    report.measurements.runtimeResources = resources;
    await waitIdle();
  });

  await check('Keyboard replay preserves focus and visible focus treatment', async () => {
    await evaluate(`document.activeElement?.blur()`);
    let reached=false;
    for (let i=0;i<30;i++) {
      await key('Tab','Tab',9);
      if (await evaluate(`document.activeElement?.id==='motion-replay'`)) {reached=true;break;}
    }
    assert.ok(reached, 'Replay must be reachable by native Tab navigation');
    const focused = await evaluate(`(() => {const button=document.querySelector('#motion-replay'),style=getComputedStyle(button);return {visible:button.matches(':focus-visible'),outline:parseFloat(style.outlineWidth),outlineStyle:style.outlineStyle,shadow:style.boxShadow};})()`);
    assert.ok(focused.visible && ((focused.outline > 0 && focused.outlineStyle !== 'none') || focused.shadow !== 'none'), 'Keyboard focus needs an observable ring');
    await sampleReplay(() => key('Enter','Enter',13));
    assert.equal(await evaluate(`document.activeElement?.id`), 'motion-replay');
    await screenshot('02-desktop-keyboard-replay');
  });

  await check('Text and sources remain opaque throughout artwork replay', async () => {
    await delay(1900);
    const samples = await evaluate(`window.__signalMotionAudit.samples`);
    assert.ok(samples.length > 2, 'Multiple animation frames must be sampled');
    assert.ok(samples.every(sample => sample.reading.every(item => item.visible && item.opacity >= .999)), 'Only decorative layers may fade');
    assert.deepEqual(await assertReadable(), canonicalReading);
    await waitIdle();
    report.measurements.replayFramesSampled = samples.length;
  });

  await check('Scrolling artwork offscreen settles it without automatic re-entry replay', async () => {
    await sampleReplay(() => click('#motion-replay'));
    await evaluate(`window.scrollTo({top:document.documentElement.scrollHeight,behavior:'instant'})`);
    await until(() => evaluate(`document.querySelector('#motion-stage').getBoundingClientRect().bottom<=0`), 'The offscreen check must fully leave the artwork behind');
    await waitIdle();
    await assertReadable();
    await centre('#motion-stage');
    await delay(250);
    assert.equal((await motionState()).active, 0, 'Re-entry must not automatically replay completed artwork');
    assert.ok((await motionState()).triggers <= 1, 'Re-entry must not accumulate triggers');
    await screenshot('03-offscreen-return');
  });

  await check('Changing device preference during replay cancels and reverts motion', async () => {
    await sampleReplay(() => click('#motion-replay'));
    await preference('reduce');
    const state = await waitStatic();
    assert.ok(state.status, 'The static state must have readable guidance');
    assert.deepEqual(await assertReadable(), canonicalReading);
    await screenshot('03-preference-interruption');
  });

  await check('Manual still control reverts motion and survives device preference changes', async () => {
    await preference('no-preference');
    await waitReady();
    await sampleReplay(() => click('#motion-replay'));
    await click('#motion-static');
    assert.equal((await waitStatic()).checked, true);
    await preference('reduce');
    await waitStatic();
    await preference('no-preference');
    assert.equal((await waitStatic()).checked, true, 'Device preference changes must preserve the manual choice');
    assert.deepEqual(await assertReadable(), canonicalReading);
    await screenshot('04-manual-still');
    await click('#motion-static');
    await waitReady();
    assert.ok((await motionState()).triggers <= 1, 'Manual preference changes must not accumulate triggers');
  });

  await check('Page lifecycle cleanup and persisted restoration do not duplicate animation', async () => {
    for (let i=0;i<2;i++) {
      await sampleReplay(() => click('#motion-replay'));
      await evaluate(`window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}))`);
      const state = await waitStatic();
      assert.equal(state.triggers, 0, 'Pagehide must remove ScrollTrigger');
      assert.equal(state.active, 0, 'Pagehide must kill active animation');
      assert.ok(state.styles.every(style => !style.transform && !style.opacity), 'Pagehide must restore authored styles');
      await evaluate(`window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}))`);
      await waitReady();
      assert.ok((await motionState()).triggers <= 1, 'Restoring a page must create at most one trigger');
    }
    return {method:'PageTransitionEvent lifecycle dispatch; actual navigation checked separately'};
  });

  await check('Real navigate-away and Back restore a usable pilot', async () => {
    await command('Page.navigate', {url:origin + '/__signal-motion-away'});
    await until(() => evaluate(`location.pathname==='/__signal-motion-away' && document.readyState==='complete'`), 'Navigation away did not complete');
    await evaluate('history.back()');
    await until(() => evaluate(`location.pathname===${JSON.stringify(pilotPath)} && !!document.querySelector('[data-motion-pilot]')`), 'Back did not restore the pilot');
    await waitReady();
    assert.ok((await motionState()).triggers <= 1, 'Back navigation must not accumulate triggers');
    assert.deepEqual(await assertReadable(), canonicalReading);
    return {bfcacheObserved:await evaluate(`window.__signalMotionAudit?.lastPageShowPersisted===true`)};
  });

  await check('Idle artwork has no active animation and preserves settled layout', async () => {
    await waitIdle();
    const before = (await command('Performance.getMetrics')).metrics.find(metric => metric.name === 'TaskDuration')?.value;
    await delay(800);
    const after = (await command('Performance.getMetrics')).metrics.find(metric => metric.name === 'TaskDuration')?.value;
    assert.equal((await motionState()).active, 0);
    const layout = await evaluate(`({initialCLS:window.__signalMotionAudit.cls, settledLayoutShift:window.__signalMotionAudit.settledCls})`);
    assert.ok(layout.settledLayoutShift < .001, 'Motion must not shift the settled layout: ' + JSON.stringify(layout));
    report.measurements.idle = {...layout, sampleMilliseconds:800, taskDurationMilliseconds:(after-before)*1000, activeAnimations:0};
    return report.measurements.idle;
  });

  await check('First scroll entry animates initially offscreen artwork', async () => {
    // The ordinary 844px mobile viewport can already show the stage on load.
    // A short viewport establishes a real offscreen start without changing DOM.
    await viewport(390,true,400);
    await navigate();
    await waitReady();
    await until(() => evaluate(`document.querySelector('#motion-stage').getBoundingClientRect().top>=innerHeight`), 'Entry test must start with the artwork fully below the viewport');
    await waitIdle();
    const before = await evaluate(`[...document.querySelectorAll('[data-motion-layer]')].map(layer=>({identity:new DOMMatrixReadOnly(getComputedStyle(layer).transform).isIdentity,opacity:Number(getComputedStyle(layer).opacity)}))`);
    assert.ok(before.every(layer=>layer.identity && layer.opacity===1), 'Offscreen artwork must begin at its complete static appearance');
    assert.equal((await motionState()).triggers, 1, 'A pending entry needs exactly one trigger');
    await sampleMotion(() => centre('#motion-stage'));
    assert.deepEqual(await assertReadable(), canonicalReading);
    await screenshot('05-mobile-first-entry');
    await waitIdle();
    report.measurements.firstScrollEntry={width:390,height:400,movementObserved:true};
  });

  for (const width of [390,320]) {
    await check(width + 'px layout and touch replay preserve reading and bounds', async () => {
      await viewport(width,true);
      await navigate();
      report.measurements['mobile' + width] = await assertBounds(width + 'px');
      assert.deepEqual(await assertReadable(), canonicalReading);
      await screenshot('05-mobile-' + width + '-top');
      await centre('#motion-stage');
      await waitReady();
      await waitIdle();
      const point = await centre('#motion-replay');
      assert.ok(point.hit && point.height >= 44 && point.width >= 44, 'Replay needs a reachable touch target at least 44px');
      await sampleReplay(async () => {
        await command('Input.dispatchTouchEvent', {type:'touchStart',touchPoints:[{x:point.x,y:point.y,radiusX:2,radiusY:2,force:1}]});
        await command('Input.dispatchTouchEvent', {type:'touchEnd',touchPoints:[]});
      });
      await screenshot('06-mobile-' + width + '-replay');
      await assertBounds(width + 'px during replay');
      await waitIdle();
      const shift = await evaluate(`window.__signalMotionAudit.settledCls`);
      assert.ok(shift < .001, width + 'px replay must preserve layout; shift=' + shift);
      await preference('reduce');
      await waitStatic();
      assert.deepEqual(await assertReadable(), canonicalReading);
      await screenshot('07-mobile-' + width + '-reduced');
      await preference('no-preference');
    });
  }

  await check('No-JavaScript page retains source content, links and reserved artwork', async () => {
    await viewport(390,true);
    await command('Emulation.setScriptExecutionDisabled', {value:true});
    const start=report.requests.length;
    try {
      await navigate();
      assert.deepEqual(await assertReadable(), canonicalReading);
      await assertBounds('390px no JavaScript');
      assert.equal(await evaluate(`document.querySelector('#motion-replay').disabled`), true);
      assert.equal(report.requests.slice(start).filter(request => vendorRequest(request.url)).length, 0);
      await screenshot('08-no-javascript');
    } finally {
      await command('Emulation.setScriptExecutionDisabled', {value:false});
    }
  });

  await check('Unavailable motion vendor fails open to readable static content', async () => {
    blockVendor=true;
    const start=report.requests.length;
    try {
      await navigate();
      await centre('#motion-stage');
      await until(() => Promise.resolve(report.requests.slice(start).some(request => request.expectedFailure)), 'Missing-vendor scenario did not request the vendor');
      await delay(200);
      await waitStatic();
      assert.deepEqual(await assertReadable(), canonicalReading);
      assert.ok((await motionState()).status, 'Failed enhancement needs readable static guidance');
      await screenshot('09-missing-vendor');
    } finally {blockVendor=false;}
  });

  await check('Fresh navigation recovers after a vendor failure without uncaught errors', async () => {
    await navigate();
    await centre('#motion-stage');
    await waitReady();
    assert.ok((await motionState()).triggers <= 1, 'Recovery must not accumulate triggers');
    assert.deepEqual(report.exceptions, [], 'The pilot must not raise uncaught JavaScript exceptions');
    const failures=report.requests.filter(request => request.status >= 400 && !request.expectedFailure && !request.url.startsWith('/favicon.ico'));
    assert.deepEqual(failures, [], 'Local pilot resources must resolve');
    assert.deepEqual(await assertReadable(), canonicalReading);
  });

  let embeddedReading, hostBefore;
  await check('Embedded stylesheet and reduced mounts preserve host styling, focus and animation', async () => {
    await viewport(1440);
    await preference('reduce');
    const requestStart=report.requests.length;
    await navigateEmbedded(false);
    // Reach a real host control with keyboard before the component stylesheet
    // arrives, so global focus rules cannot hide behind an unfocused snapshot.
    for(let i=0;i<30 && await evaluate(`document.activeElement?.id!=='host-action'`);i++)await key('Tab','Tab',9);
    assert.equal(await evaluate(`document.activeElement?.id`),'host-action');
    hostBefore=await evaluate(hostSnapshotExpression);
    assert.equal(hostBefore.focus.visible,true);
    assert.equal(hostBefore.hostAnimation.count,1,'The fixture must have a running host-owned animation');
    embeddedReading=await assertEmbeddedReading();
    await evaluate(`new Promise((resolve,reject)=>{const link=document.createElement('link');link.id='embedded-motion-css';link.rel='stylesheet';link.href='/assets/design-lab/signal-motion-pilot/motion.css';link.onload=resolve;link.onerror=()=>reject(new Error('Embedded CSS failed'));document.head.append(link);})`);
    await evaluate('document.fonts.ready');
    await mountEmbedded();
    for(let i=0;i<3;i++) {
      await waitEmbedded('a','static');
      await evaluate(`window.__embedding.mount('a')`);
    }
    await waitEmbedded('a','static');
    await waitEmbedded('b','static');
    await delay(120);
    const hostAfter=await evaluate(hostSnapshotExpression);
    assert.deepEqual(hostAfter,hostBefore,'Loading and mounting the component must not restyle or move host elements');
    assert.deepEqual(await assertEmbeddedReading(),embeddedReading);
    assert.equal(report.requests.slice(requestStart).filter(request=>vendorRequest(request.url)).length,0,'Reduced repeated mounts must not request the motion runtime');
    assert.equal(await evaluate(`!!document.querySelector('link[href$="/page.css"],script[src$="/entry.js"]')`),false,'The host must embed only the component surface');
    await click('#host-action');
    assert.equal(await evaluate(`document.querySelector('#host-count').value`),'1','Host controls must remain usable');
    report.measurements.embeddedHost={width:1440,hostSentinels:hostAfter.sentinels.length,stylesAndGeometryUnchanged:true,focusPreserved:true,hostAnimationPreserved:true,reducedVendorRequests:0,before:hostBefore,after:hostAfter};
    await screenshot('10-embedded-host-reduced');
  });

  await check('Two embedded owners share runtime and teardown leaves sibling motion intact', async () => {
    const requestsBefore=report.requests.length;
    await preference('no-preference');
    await waitEmbedded('a','ready');
    await waitEmbedded('b','ready');
    assert.equal(report.requests.slice(requestsBefore).filter(request=>vendorRequest(request.url)).length,2,'Concurrent owners must load each vendor once');
    await centre('[data-test-pilot="b"] [data-motion-stage]');
    await waitEmbedded('b','idle');
    await replayEmbedded('b',()=>click('[data-test-pilot="b"] [data-motion-replay]'));
    const isolation=await evaluate(`(() => {
      const root=window.__embedding.roots.b,all=window.gsap.globalTimeline.getChildren(true,true,true),tweens=all.filter(tween=>tween.targets?.().some(target=>target instanceof Node && root.contains(target)));
      const styles=()=>[...root.querySelectorAll('[data-motion-layer]')].map(layer=>layer.getAttribute('style'));
      const before=styles(),active=tweens.some(tween=>tween.isActive());
      window.__embedding.destroy('a');
      return {activeBefore:active,activeAfter:tweens.some(tween=>tween.isActive()),sameTweens:tweens.every(tween=>window.gsap.globalTimeline.getChildren(true,true,true).includes(tween)),before,after:styles()};
    })()`);
    assert.ok(isolation.activeBefore && isolation.activeAfter && isolation.sameTweens,'Destroying A must not kill B’s active timeline');
    assert.deepEqual(isolation.after,isolation.before,'Destroying A must not rewrite B’s layer styles');
    const destroyed=await waitEmbedded('a','static');
    assert.equal(destroyed.mounted,undefined);
    assert.match(destroyed.status,/static|inactive/i,'Destroyed controls need truthful static guidance');
    await waitEmbedded('b','idle');
    const sibling=await embeddedState('b');
    for(let i=0;i<3;i++) {
      await evaluate(`(() => {const old=window.__embedding.owners.a;window.__embedding.mount('a');old?.();})()`);
      const state=await waitEmbedded('a','ready');
      assert.equal(state.tweens,3,'Repeated mounts must retain one three-layer timeline');
      assert.ok(state.triggers<=1,'Repeated mounts must not accumulate root-owned triggers');
    }
    assert.deepEqual(await embeddedState('b'),sibling,'Repeated A mounts must leave B’s owner and styles intact');
    assert.deepEqual(hostAppearance(await evaluate(hostSnapshotExpression)),hostAppearance(hostBefore));
    assert.deepEqual(await assertEmbeddedReading(),embeddedReading);
    report.measurements.embeddedOwnership={sharedVendorRequests:2,repeatedMounts:3,siblingActiveDuringDestroy:true,inlineStylesReverted:true};
  });

  await check('A 320px embedded container reflows and keeps keyboard, touch and local controls', async () => {
    const narrow=await evaluate(`(() => {
      const root=document.querySelector('[data-test-pilot="b"]'),r=root.getBoundingClientRect(),stage=root.querySelector('[data-motion-stage]').getBoundingClientRect();
      return {viewport:innerWidth,width:r.width,scrollWidth:root.scrollWidth,clientWidth:root.clientWidth,columns:getComputedStyle(root.querySelector('.hero')).gridTemplateColumns,
        font:getComputedStyle(root.querySelector('h1')).fontFamily,stage:{x:stage.x-r.x,width:stage.width,height:stage.height},overflow:[...root.querySelectorAll('h1,h2,h3,p,a,button,label,dt,dd')].filter(element=>{const box=element.getBoundingClientRect();return box.width && (box.left<r.left-1 || box.right>r.right+1);}).map(element=>element.id||element.textContent.trim().slice(0,70))};
    })()`);
    assert.equal(narrow.viewport,1440,'The narrow case must be caused by the host container, not a narrow viewport');
    assert.equal(narrow.width,320);
    assert.ok(narrow.scrollWidth<=narrow.clientWidth+1);
    assert.deepEqual(narrow.overflow,[]);
    assert.equal(narrow.columns.trim().split(/\s+/).length,1,'Narrow embedded hero must use a single column');
    assert.match(narrow.font,/Atlas Geist/);
    await click('[data-test-pilot="b"] .static-control');
    assert.equal((await waitEmbedded('b','static')).checked,true,'B’s implicit label must operate its own input');
    assert.equal((await embeddedState('a')).checked,false,'B’s label must not operate A’s input');
    assert.equal((await embeddedState('a')).disabled,false);
    await click('[data-test-pilot="b"] .static-control');
    await waitEmbedded('b','ready');
    await evaluate('document.activeElement?.blur()');
    for(let i=0;i<60 && await evaluate(`document.activeElement?.id!=='b-motion-replay'`);i++)await key('Tab','Tab',9);
    assert.equal(await evaluate(`document.activeElement?.id`),'b-motion-replay','Native Tab must reach the second instance');
    await replayEmbedded('b',()=>key('Enter','Enter',13));
    // A completed GSAP timeline can detach from the global timeline. Inspect
    // its duration during this native replay rather than assuming retention.
    const compact=await embeddedState('b');
    assert.ok(compact.durations.length===1 && compact.durations[0]<=.321,'Compact timing must follow the narrow root');
    assert.equal(await evaluate(`document.activeElement?.id`),'b-motion-replay');
    const focus=await evaluate(`(()=>{const button=document.activeElement,style=getComputedStyle(button);return {visible:button.matches(':focus-visible'),outline:parseFloat(style.outlineWidth),style:style.outlineStyle};})()`);
    assert.ok(focus.visible && focus.outline>0 && focus.style!=='none');
    await screenshot('11-embedded-320-keyboard');
    await waitEmbedded('b','idle');
    await command('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
    const point=await centre('[data-test-pilot="b"] [data-motion-replay]');
    assert.ok(point.hit && point.width>=44 && point.height>=44);
    await replayEmbedded('b',async()=>{
      await command('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:point.x,y:point.y,radiusX:2,radiusY:2,force:1}]});
      await command('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    });
    await preference('reduce');
    await waitEmbedded('a','static');
    await waitEmbedded('b','static');
    assert.deepEqual(await assertEmbeddedReading(),embeddedReading);
    assert.deepEqual(hostAppearance(await evaluate(hostSnapshotExpression)),hostAppearance(hostBefore),'Live reduced motion must not cancel or restyle host content');
    report.measurements.embeddedNarrow={...narrow,compactDuration:compact.durations[0],keyboardFocus:focus,touchTarget:{width:point.width,height:point.height},liveReducedRevertedBoth:true};
  });

  await check('An embedded runtime failure remains static without disabling its sibling', async () => {
    await viewport(1440);
    await preference('no-preference');
    await navigateEmbedded();
    await mountEmbedded(true);
    await until(async()=>{const state=await embeddedState('a');return state.state==='unavailable' && state.disabled;},'Failed embedded owner did not expose its static fallback');
    await waitEmbedded('a','static');
    await waitEmbedded('b','ready');
    assert.deepEqual(await assertEmbeddedReading(),embeddedReading);
    await centre('[data-test-pilot="b"] [data-motion-stage]');
    await waitEmbedded('b','idle');
    await replayEmbedded('b',()=>click('[data-test-pilot="b"] [data-motion-replay]'));
    await evaluate(`window.__embedding.destroy('a')`);
    assert.equal((await embeddedState('b')).disabled,false);
    await waitEmbedded('b','idle');
    assert.deepEqual(await assertEmbeddedReading(),embeddedReading);
    await click('#host-action');
    assert.equal(await evaluate(`document.querySelector('#host-count').value`),'1');
    await screenshot('12-embedded-failure');
  });

  await check('Embedded no-JavaScript markup keeps independent labels, descriptions and sources', async () => {
    await preference('reduce');
    const start=report.requests.length;
    await command('Emulation.setScriptExecutionDisabled',{value:true});
    try {
      await navigateEmbedded();
      assert.deepEqual(await assertEmbeddedReading(),embeddedReading);
      for(const name of ['a','b']){
        const state=await embeddedState(name);
        assert.ok(state.disabled && state.stillDisabled && state.triggers===0);
      }
      assert.equal(report.requests.slice(start).filter(request=>vendorRequest(request.url)).length,0);
      assert.equal(await evaluate(`document.querySelector('#host-animation').getAnimations().length`),1,'No-JS reduced fallback must not cancel the host animation');
      await centre('[data-test-pilot="b"] [data-motion-stage]');
      await screenshot('13-embedded-no-javascript');
    } finally {await command('Emulation.setScriptExecutionDisabled',{value:false});}
  });
  assert.deepEqual(report.exceptions,[],'Embedded acceptance must not raise uncaught exceptions');
  assert.deepEqual(report.console,[],'Embedded acceptance must not log browser warnings or errors');

  // Full-page capture requests a surface larger than the tested viewport. Keep
  // review artifacts on fresh documents after the acceptance measurements, and
  // expose any observed shift instead of resetting a running audit.
  report.measurements.fullPageReviewCaptures=[];
  const captureMetrics = () => evaluate(`(() => {
    const audit=window.__signalMotionAudit,stage=document.querySelector('#motion-stage').getBoundingClientRect();
    return {time:performance.now(),viewport:{width:innerWidth,height:innerHeight,scrollY,visualWidth:visualViewport?.width,visualHeight:visualViewport?.height},
      document:{width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight},
      stage:{x:stage.x,y:stage.y,width:stage.width,height:stage.height},initialCLS:audit.cls,settledLayoutShift:audit.settledCls,shifts:audit.shifts};
  })()`);
  for (const capture of [{name:'01-desktop-reduced-full',width:1440,mobile:false},{name:'05-mobile-320-full',width:320,mobile:true}]) {
    await viewport(capture.width,capture.mobile);
    await preference('reduce');
    await navigate();
    await waitStatic();
    const before=await captureMetrics();
    await screenshot(capture.name,true);
    await delay(150); // Allow buffered LayoutShift entries to reach the observer.
    const after=await captureMetrics();
    report.measurements.fullPageReviewCaptures.push({name:capture.name+'.png',phase:'after all acceptance checks',preference:'reduce',before,after});
  }
  await viewport(1440);
  await preference('reduce');
  await navigateEmbedded();
  await mountEmbedded();
  await waitEmbedded('a','static');
  await waitEmbedded('b','static');
  await screenshot('14-embedded-host-full',true);
  report.status='passed';
  console.log(`Signal motion acceptance passed (${report.checks.length} checks).`);
} catch (error) {
  report.status='failed';
  report.failure=error.stack || error.message;
  report.chromeLog=chromeLog;
  if (evaluate) {
    report.diagnostics=await motionState().catch(() => ({unavailable:true}));
    if(await evaluate(`!!document.querySelector('[data-test-pilot]')`).catch(()=>false)) {
      report.embeddedDiagnostics=await Promise.all(['a','b'].map(name=>embeddedState(name).catch(()=>({name,unavailable:true}))));
      report.embeddedHostDiagnostics=await evaluate(hostSnapshotExpression).catch(()=>({unavailable:true}));
    }
    report.interactionDiagnostics=await evaluate(`(() => {
      const stage=document.querySelector('#motion-stage'),button=document.querySelector('#motion-replay'),audit=window.__signalMotionAudit;
      const rect=element=>{const r=element?.getBoundingClientRect();return r?{x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom}:null;};
      return {url:location.href,hidden:document.hidden,visibilityState:document.visibilityState,documentHasFocus:document.hasFocus(),
        reduced:matchMedia('(prefers-reduced-motion: reduce)').matches,state:document.querySelector('[data-motion-pilot]')?.dataset.motionState,
        viewport:{width:innerWidth,height:innerHeight,scrollY},stage:rect(stage),button:rect(button),focused:document.activeElement?.id,
        events:audit?.events || [],layoutShifts:audit?.shifts || [],sampleCount:audit?.samples.length || 0,
        distinctSampledTransforms:[...new Set((audit?.samples || []).map(sample=>JSON.stringify(sample.transforms)))].slice(0,20).map(value=>JSON.parse(value)),
        animations:window.gsap?.globalTimeline.getChildren(true,true,true).map(animation=>({duration:animation.duration(),time:animation.time(),progress:animation.progress(),paused:animation.paused(),active:animation.isActive()})) || []};
    })()`).catch(() => ({unavailable:true}));
  }
  if (command) await screenshot('failure').catch(() => {});
  console.error(error.stack || error);
  process.exitCode=1;
} finally {
  await mkdir(outputDir,{recursive:true}).catch(() => {});
  await writeFile(join(outputDir,'signal-motion-report.json'),JSON.stringify(report,null,2)+'\n').catch(error => console.error('Could not write report:',error.message));
  for (const item of pending.values()) {clearTimeout(item.timer);item.reject(new Error('Acceptance script finished'));}
  pending.clear();
  socket?.close();
  if (chrome && chrome.exitCode === null && chrome.signalCode === null) {
    chrome.kill('SIGTERM');
    await Promise.race([new Promise(resolveExit => chrome.once('exit',resolveExit)),delay(1000)]);
    if (chrome.exitCode === null && chrome.signalCode === null) chrome.kill('SIGKILL');
  }
  server?.closeAllConnections();
  server?.close();
  if (profile) await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100}).catch(() => {});
}
