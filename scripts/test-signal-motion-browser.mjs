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
      const control=event.target.closest?.('#motion-replay,#motion-static');
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

try {
  await mkdir(outputDir, {recursive:true});
  profile = await mkdtemp(join(tmpdir(), 'atlas-motion-chrome-'));
  server = createServer(async (req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
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
  report.status='passed';
  console.log(`Signal motion acceptance passed (${report.checks.length} checks).`);
} catch (error) {
  report.status='failed';
  report.failure=error.stack || error.message;
  report.chromeLog=chromeLog;
  if (evaluate) {
    report.diagnostics=await motionState().catch(() => ({unavailable:true}));
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
