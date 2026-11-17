import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join, resolve, sep } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const repository = resolve(new URL('../..', import.meta.url).pathname);
const fixturePath = '/specimens/fluid-inspector/index.html';
const output = process.env.ATLAS_INSPECTOR_EVIDENCE_DIR || join(process.env.RUNNER_TEMP || tmpdir(), 'startup-atlas-graph', 'fluid-inspector');
const checkoutRevision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repository, encoding: 'utf8' }).trim();
const report = { sourceRevision: process.env.ATLAS_SOURCE_REVISION || checkoutRevision, checkoutRevision,
  startedAt: new Date().toISOString(), browser: null, sandbox: 'enabled; no sandbox-disabling flags',
  scopeLimits: ['Chrome viewport and touch emulation; no physical-device, WebKit, Firefox or screen-reader speech acceptance.'],
  scenarios: [], screenshots: [], accessibilityTrees: [], environmentTransitions: [], modalFocusTraces: [], sourceFiles: {}, consoleErrors: [], exceptions: [], requests: [], limitations: [] };
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.json': 'application/json' };
const selectors = { first: '[data-fi-select="startup:canva"]', second: '[data-fi-select="person:melanie-perkins"]', third: '[data-fi-select="startup:fusion-books"]' };
let server, chrome, socket, profile, command, evaluate, origin, targetId;
let chromeLog = '', chromeFailure = null, serial = 0, navigationSerial = 0;
const pending = new Map();

async function until(fn, message, timeout = 8000) {
  const end = Date.now() + timeout;
  let lastError;
  do {
    if (chromeFailure) throw new Error(chromeFailure + '\n' + chromeLog);
    try { const result = await fn(); if (result) return result; } catch (error) { lastError = error; }
    await delay(30);
  } while (Date.now() < end);
  throw new Error(message + (lastError ? ': ' + lastError.message : ''));
}

async function check(id, name, fn, metadata = {}) {
  const started = Date.now();
  const scenario = { id, name, environment: 'real Chrome browser', ...metadata };
  try {
    scenario.observations = await fn();
    scenario.result = scenario.observations?.acceptance === 'pending' ? 'pending' : 'pass';
    console.log(`${scenario.result.toUpperCase()} ${id} ${name}`);
  } catch (error) {
    scenario.result = 'fail';
    scenario.message = error.message;
    throw error;
  } finally {
    scenario.durationMs = Date.now() - started;
    report.scenarios.push(scenario);
  }
}

async function viewport(width, height) {
  const started = Date.now();
  await command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width <= 700, screenWidth: width, screenHeight: height });
  await command('Emulation.setTouchEmulationEnabled', { enabled: width <= 700 });
  const observed = await until(async () => {
    const s = await evaluate(`(() => {
      const c=window.atlasInspectorSpecimen?.controller, panel=document.querySelector('[data-fi-panel]');
      return {width:innerWidth,height:innerHeight,narrow:matchMedia('(max-width: 700px)').matches,
        controller:c?.snapshot() || null,panelOpen:panel?.open || false,modal:panel?.matches(':modal') || false};
    })()`);
    if (s.width !== width || s.height !== height || s.narrow !== (width <= 700)) return false;
    const c = s.controller;
    if (!c || c.destroyed || c.phase === 'unsupported') return s;
    if (c.mode !== (s.narrow ? 'modal' : 'nonmodal') || c.pendingFrames !== 0) return false;
    if (c.intendedOpen) return c.phase === 'open' && s.panelOpen && s.modal === s.narrow ? s : false;
    return c.phase === 'closed' && !s.panelOpen && !s.modal ? s : false;
  }, `Viewport ${width}×${height} did not reach matching media, controller and native dialog state`, 1000);
  report.environmentTransitions.push({ kind: 'viewport', requested: { width, height }, observed, durationMs: Date.now() - started });
  return observed;
}

async function preference(value) {
  const started = Date.now();
  const before = await evaluate(`({matches:matchMedia('(prefers-reduced-motion: reduce)').matches,
    hasAudit:!!window.__inspectorAudit,reducedEvents:window.__inspectorAudit?.reducedChanges.length || 0})`);
  const target = value === 'reduce';
  await command('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value }] });
  const observed = await until(async () => {
    const s = await evaluate(`({matches:matchMedia('(prefers-reduced-motion: reduce)').matches,
      reducedEvents:window.__inspectorAudit?.reducedChanges.length || 0,
      controller:window.atlasInspectorSpecimen?.controller.snapshot() || null})`);
    if (s.matches !== target) return false;
    if (before.hasAudit && before.matches !== target && s.reducedEvents <= before.reducedEvents) return false;
    return s;
  }, `Reduced-motion media change to ${value} was not delivered`, 1000);
  report.environmentTransitions.push({ kind: 'reduced-motion', requested: value, before, observed, durationMs: Date.now() - started });
  return observed;
}

async function navigate(search = '', { ready = true } = {}) {
  const url = new URL(origin + fixturePath + search);
  url.searchParams.set('acceptanceRun', String(++navigationSerial));
  await command('Page.navigate', { url: url.href });
  await until(() => evaluate(`document.readyState === 'complete' && location.href === ${JSON.stringify(url.href)}`), 'Fixture did not finish loading');
  if (ready) await until(() => evaluate(`!!window.atlasInspectorSpecimen && document.querySelector('[data-fi-root]').dataset.fiMotion !== 'loading'`), 'Inspector did not finish loading its optional motion');
}

async function key(name, shift = false) {
  const keys = { Enter: { code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' }, Space: { code: 'Space', key: ' ', windowsVirtualKeyCode: 32, text: ' ' }, Tab: { code: 'Tab', windowsVirtualKeyCode: 9 }, Escape: { code: 'Escape', windowsVirtualKeyCode: 27 } };
  const detail = keys[name];
  assert.ok(detail, `Unsupported test key ${name}`);
  await command('Input.dispatchKeyEvent', { type: 'keyDown', key: detail.key || name, modifiers: shift ? 8 : 0, ...detail });
  await command('Input.dispatchKeyEvent', { type: 'keyUp', key: detail.key || name, code: detail.code, windowsVirtualKeyCode: detail.windowsVirtualKeyCode, modifiers: shift ? 8 : 0 });
}

async function focus(selector) {
  await evaluate(`document.querySelector(${JSON.stringify(selector)}).focus()`);
}

async function click(selector) {
  const point = await evaluate(`(() => { const e=document.querySelector(${JSON.stringify(selector)}); e.scrollIntoView({block:'center',behavior:'instant'}); const r=e.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2,hit:e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}; })()`);
  assert.ok(point.hit, `Control must be reachable: ${selector}`);
  await command('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', buttons: 1, clickCount: 1 });
  await command('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', buttons: 0, clickCount: 1 });
}

const stateExpression = `(() => {
  const root=document.querySelector('[data-fi-root]'), panel=root.querySelector('[data-fi-panel]'), active=document.activeElement;
  const r=panel.getBoundingClientRect(), close=root.querySelector('[data-fi-close]'), cr=close.getBoundingClientRect();
  return {...window.atlasInspectorSpecimen.controller.snapshot(), title:root.querySelector('[data-fi-title]').textContent,
    selectedButtons:[...root.querySelectorAll('[data-fi-select][aria-expanded="true"]')].map(e=>e.dataset.fiSelect),
    detailId:root.querySelector('[data-fi-content] .fi-id')?.textContent,
    source:root.querySelector('[data-fi-content] .fi-evidence a')?.getAttribute('href'),
    profile:root.querySelector('[data-fi-content] .fi-profile')?.getAttribute('href'),
    panelOpen:panel.open, modal:panel.matches(':modal'), documentHasFocus:document.hasFocus(), activeTag:active?.tagName,
    activeId:active?.id, activeSelect:active?.dataset.fiSelect || null,
    activeInPanel:panel.contains(active), activeIsClose:active===close, activeIsFallback:active===root.querySelector('[data-fi-fallback]'),
    activeIsSource:active===root.querySelector('[data-fi-content] .fi-evidence a'), activeIsProfile:active===root.querySelector('[data-fi-content] .fi-profile'),
    focused:active?.outerHTML.slice(0,400), focusVisible:active?.matches(':focus-visible'),
    ownedAnimations:root.getAnimations({subtree:true}).filter(a=>a.playState==='running').length,
    visibility:document.visibilityState, viewport:{width:innerWidth,height:innerHeight},
    overflow:document.documentElement.scrollWidth-innerWidth,
    panelRect:{x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom}, closeRect:{width:cr.width,height:cr.height},
    easing:root.dataset.fiEasing, nativeLinear:CSS.supports('transition-timing-function','linear(0, 1)'),
    actualEasing:getComputedStyle(root.querySelector('.fi-selection-mark')).transitionTimingFunction};
})()`;
const state = () => evaluate(stateExpression);

async function settled(kind = 'open') {
  return until(async () => { const s = await state(); return s.phase === kind && s.pendingFrames === 0 ? s : null; }, `Inspector did not settle ${kind}`);
}

function selected(s, id, name) {
  assert.equal(s.selectedId, id);
  assert.deepEqual(s.selectedButtons, [id]);
  assert.equal(s.detailId, id);
  assert.equal(s.title, name);
  assert.ok(s.profile.endsWith(encodeURIComponent(id)));
  assert.ok(s.source.startsWith('https://'));
}

async function capture(name) {
  const file = name + '.png';
  const result = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await writeFile(join(output, file), Buffer.from(result.data, 'base64'));
  report.screenshots.push({ file, ...(await evaluate(`({viewport:{width:innerWidth,height:innerHeight},theme:document.documentElement.dataset.theme,reduced:matchMedia('(prefers-reduced-motion: reduce)').matches})`)) });
  const axFile = name + '.ax.json';
  await writeFile(join(output, axFile), JSON.stringify(await command('Accessibility.getFullAXTree'), null, 2) + '\n');
  report.accessibilityTrees.push(axFile);
  return file;
}

const auditScript = `(() => {
  const audit=window.__inspectorAudit={events:[],selections:[],visibility:[],reducedChanges:[]};
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  reduced.addEventListener('change',event=>audit.reducedChanges.push({matches:event.matches,time:performance.now()}));
  document.addEventListener('click',e=>{if(e.target.closest?.('[data-fi-select],[data-fi-close],[data-fi-burst],[data-fi-reverse]'))audit.events.push({type:e.type,trusted:e.isTrusted,target:e.target.outerHTML,time:performance.now()});},true);
  document.addEventListener('visibilitychange',()=>audit.visibility.push({state:document.visibilityState,hidden:document.hidden,time:performance.now()}));
  document.addEventListener('DOMContentLoaded',()=>{
    const root=document.querySelector('[data-fi-root]'); if(!root)return;
    new MutationObserver(records=>{if(records.some(r=>r.attributeName==='data-fi-selected')&&root.dataset.fiSelected)audit.selections.push({id:root.dataset.fiSelected,title:root.querySelector('[data-fi-title]').textContent,detailId:root.querySelector('[data-fi-content] .fi-id')?.textContent,profile:root.querySelector('[data-fi-content] .fi-profile')?.getAttribute('href'),time:performance.now()});}).observe(root,{attributes:true});
  });
})()`;

try {
  await mkdir(output, { recursive: true });
  for (const path of ['index.html', 'entry.js', 'inspector.js', 'inspector.css', 'page.css', 'fixtures.json', 'vendor/usefluid-motion-0.1.2/manifest.json']) {
    const bytes = await readFile(join(repository, 'specimens/fluid-inspector', path));
    report.sourceFiles[path] = { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
  }
  for (const path of ['web/design-tokens.css', 'web/design-aesthetic-tokens.css']) {
    const bytes = await readFile(join(repository, path));
    report.sourceFiles[path] = { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
  }
  const vendorRoot = join(repository, 'specimens/fluid-inspector/vendor/usefluid-motion-0.1.2');
  const manifest = JSON.parse(await readFile(join(vendorRoot, 'manifest.json'), 'utf8'));
  for (const file of manifest.files) {
    const bytes = await readFile(join(vendorRoot, file.path));
    assert.equal(bytes.length, file.bytes, `Vendor byte length: ${file.path}`);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256, `Vendor integrity: ${file.path}`);
  }
  report.vendorIntegrity = { package: manifest.package, version: manifest.version, filesVerified: manifest.files.length, tarballIntegrity: manifest.tarballIntegrity };
  server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      const allowed = pathname.startsWith('/specimens/fluid-inspector/') || ['/web/design-tokens.css', '/web/design-aesthetic-tokens.css'].includes(pathname) || pathname.startsWith('/web/assets/fonts/');
      const file = resolve(repository, '.' + pathname);
      if (!allowed || !file.startsWith(repository + sep)) { response.writeHead(404).end('Not found'); return; }
      const bytes = await readFile(file);
      response.writeHead(200, { 'content-type': mime[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' }).end(bytes);
    } catch { response.writeHead(404).end('Not found'); }
  });
  await new Promise((resolveListen, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolveListen));
  origin = `http://127.0.0.1:${server.address().port}`;
  profile = await mkdtemp(join(tmpdir(), 'atlas-inspector-chrome-'));
  chrome = spawn(process.env.CHROME_BIN || 'google-chrome', ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  chrome.stderr.on('data', data => { chromeLog = (chromeLog + data).slice(-10000); });
  chrome.once('error', error => { chromeFailure = error.message; });
  chrome.once('exit', (code, signal) => { if (!report.finishedAt) chromeFailure = `Chrome exited (${signal || code})`; });
  const port = await until(async () => Number((await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]), 'Sandboxed Chrome did not start', 30000);
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const target = targets.find(item => item.type === 'page');
  assert.ok(target, 'Chrome must expose its isolated test tab');
  targetId = target.id;
  socket = new WebSocket(target.webSocketDebuggerUrl);
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const operation = pending.get(message.id);
      if (!operation) return;
      pending.delete(message.id); clearTimeout(operation.timer);
      if (message.error) operation.reject(new Error(JSON.stringify(message.error)));
      else operation.resolve(message.result);
    } else if (message.method === 'Runtime.exceptionThrown') report.exceptions.push(message.params.exceptionDetails);
    else if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') report.consoleErrors.push(message.params.args.map(arg => arg.value || arg.description).join(' '));
    else if (message.method === 'Network.requestWillBeSent') report.requests.push(message.params.request.url);
  });
  await new Promise((resolveOpen, reject) => { socket.addEventListener('open', resolveOpen, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  command = (method, params = {}) => new Promise((resolveCommand, reject) => {
    const id = ++serial;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 12000);
    pending.set(id, { resolve: resolveCommand, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
  evaluate = async expression => {
    const result = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  report.browser = await command('Browser.getVersion');
  await command('Page.enable'); await command('Runtime.enable'); await command('Network.enable'); await command('Accessibility.enable');
  await command('Page.addScriptToEvaluateOnNewDocument', { source: auditScript });
  await viewport(1440, 1000); await preference('no-preference'); await navigate();

  await check('I01-I02', 'Desktop native activation, focus preservation and latest-opener return', async () => {
    await focus(selectors.first); await key('Enter');
    let s = await settled(); selected(s, 'startup:canva', 'Canva');
    assert.equal(s.modal, false); assert.equal(s.activeSelect, 'startup:canva');
    for (let i = 0; i < 5; i++) await key('Tab');
    assert.equal((await state()).activeIsClose, true, 'Panel actions must remain reachable in normal desktop Tab order');
    await key('Escape'); s = await settled('closed'); assert.equal(s.activeSelect, 'startup:canva');
    await focus(selectors.second); await key('Space');
    s = await settled(); selected(s, 'person:melanie-perkins', 'Melanie Perkins');
    await click(selectors.third); s = await settled(); selected(s, 'startup:fusion-books', 'Fusion Books');
    await key('Escape'); s = await settled('closed'); assert.equal(s.activeSelect, 'startup:fusion-books');
    const events = await evaluate('window.__inspectorAudit.events');
    assert.ok(events.filter(event => event.trusted).length >= 3, 'Native inputs must dispatch trusted activations');
    return { state: s, events, focusContract: 'Desktop Inspect preserves its opener focus and remains nonmodal; panel actions are in normal Tab order.' };
  }, { viewport: { width: 1440, height: 1000 }, input: 'native Enter, Space, Tab, Escape and pointer' });

  await check('I03', 'Rapid selection commits coherent latest identity', async () => {
    await navigate(); await click('.fi-review > summary'); await click('[data-fi-burst]');
    await until(async () => (await state()).selectedId === 'startup:fusion-books', 'Burst did not reach its final record');
    const s = await settled(); selected(s, 'startup:fusion-books', 'Fusion Books');
    const trace = await evaluate('window.__inspectorAudit.selections');
    for (const item of trace) { assert.equal(item.id, item.detailId); assert.ok(item.profile.endsWith(encodeURIComponent(item.id))); }
    assert.deepEqual([...new Set(trace.map(item => item.id))], ['startup:canva', 'person:melanie-perkins', 'startup:fusion-books']);
    return { trace, final: s };
  }, { input: 'Native specimen burst action, then its documented timed controller selections' });

  await check('I04-I05', 'Close/reopen preserves value and velocity; same selection is idempotent', async () => {
    await navigate();
    const trace = await evaluate(`(async () => {
      const api=window.atlasInspectorSpecimen, c=api.controller;
      api.inspect(0); await new Promise(requestAnimationFrame); const opening=c.snapshot();
      c.close(); const reversed=c.snapshot(); await new Promise(requestAnimationFrame); const closing=c.snapshot();
      api.inspect(1); const reopened=c.snapshot(); const beforeSame=c.snapshot(); api.inspect(1); const afterSame=c.snapshot();
      return {opening,reversed,closing,reopened,beforeSame,afterSame};
    })()`);
    assert.equal(trace.opening.pendingFrames, 1);
    assert.equal(trace.opening.value, trace.reversed.value); assert.equal(trace.opening.velocity, trace.reversed.velocity);
    assert.equal(trace.closing.value, trace.reopened.value); assert.equal(trace.closing.velocity, trace.reopened.velocity);
    assert.equal(trace.beforeSame.generation, trace.afterSame.generation);
    const s = await settled(); selected(s, 'person:melanie-perkins', 'Melanie Perkins'); assert.equal(s.panelOpen, true);
    return { trace, final: s };
  }, { input: 'Documented controller, actual browser frames' });

  await check('I07', 'Missing opener falls back; invalidation preserves external focus', async () => {
    await navigate(); await click(selectors.first); await settled();
    await evaluate(`document.querySelector(${JSON.stringify(selectors.first)}).remove()`);
    await click('[data-fi-close]'); const missing = await settled('closed'); assert.equal(missing.activeIsFallback, true);
    await click(selectors.second); await settled();
    await evaluate(`document.querySelector('[data-fi-theme]').closest('details').open=true; document.querySelector('[data-fi-theme]').focus(); window.atlasInspectorSpecimen.controller.close({reason:'invalidated',restoreFocus:false})`);
    const invalidated = await settled('closed');
    assert.ok(invalidated.focused.includes('data-fi-theme'), 'A host-owned control must keep focus after invalidation');
    return { missing, invalidated };
  });

  await check('I08', 'Live viewport changes preserve intent and native modality', async () => {
    await navigate(); await evaluate('window.atlasInspectorSpecimen.inspect(0)');
    await viewport(390, 844); let s = await settled(); selected(s, 'startup:canva', 'Canva'); assert.equal(s.modal, true);
    const narrow = s;
    await viewport(1440, 1000); s = await settled(); assert.equal(s.modal, false); selected(s, 'startup:canva', 'Canva');
    const desktop = s;
    await evaluate('window.atlasInspectorSpecimen.controller.close()'); await viewport(390, 844);
    s = await settled('closed'); assert.equal(s.panelOpen, false); assert.equal(s.modal, false);
    await viewport(1440, 1000);
    return { narrow, desktop, crossedWhileClosing: s };
  });

  await check('I09-I10', 'Live reduced-motion preference settles open/close and does not replay', async () => {
    await preference('reduce'); await navigate(); await click(selectors.first);
    const initial = await state(); selected(initial, 'startup:canva', 'Canva'); assert.equal(initial.phase, 'open'); assert.equal(initial.pendingFrames, 0);
    await preference('no-preference'); await key('Escape'); await settled('closed');
    await evaluate('window.atlasInspectorSpecimen.inspect(1)');
    const beforeOpenFlip = await state(); assert.equal(beforeOpenFlip.pendingFrames, 1);
    await preference('reduce');
    await until(async () => { const s = await state(); return s.reduced && s.phase === 'open' && !s.pendingFrames; }, 'Live reduce did not stop opening');
    const afterOpenFlip = await state(); assert.equal(afterOpenFlip.ownedAnimations, 0); selected(afterOpenFlip, 'person:melanie-perkins', 'Melanie Perkins');
    const paints = afterOpenFlip.paints; await preference('no-preference'); await delay(300);
    const restored = await state(); assert.equal(restored.paints, paints); assert.equal(restored.pendingFrames, 0);
    await evaluate('window.atlasInspectorSpecimen.controller.close()');
    const beforeCloseFlip = await state(); assert.equal(beforeCloseFlip.pendingFrames, 1);
    await preference('reduce'); const afterCloseFlip = await settled('closed'); assert.equal(afterCloseFlip.ownedAnimations, 0); assert.equal(afterCloseFlip.activeSelect, 'person:melanie-perkins');
    await preference('no-preference'); await delay(300); assert.equal((await state()).pendingFrames, 0);
    return { initial, beforeOpenFlip, afterOpenFlip, restored, beforeCloseFlip, afterCloseFlip };
  }, { preferenceMechanism: 'CDP Emulation.setEmulatedMedia in the already mounted document; real MediaQueryList change events' });

  await check('I11', 'Actual tab visibility transition', async () => {
    await navigate(); await evaluate('window.atlasInspectorSpecimen.inspect(0)');
    const background = await command('Target.createTarget', { url: 'about:blank', background: false });
    try {
      await command('Target.activateTarget', { targetId: background.targetId });
      let hidden = false;
      try {
        await until(() => evaluate(`document.hidden && window.__inspectorAudit.visibility.some(event=>event.hidden)`), 'Headless Chrome did not deliver hidden-tab visibility', 1000);
        hidden = true;
      } catch {}
      if (!hidden) {
        const limitation = 'Actual tab activation did not make the inspector document hidden in this headless environment. Hidden-tab acceptance remains pending; deterministic listener tests are separate.';
        report.limitations.push(limitation);
        return { acceptance: 'pending', attemptedMechanism: 'Target.createTarget + Target.activateTarget', limitation, observedVisibility: await evaluate('document.visibilityState') };
      }
      const hiddenState = await state(); assert.equal(hiddenState.pendingFrames, 0); assert.equal(hiddenState.phase, 'open');
      const paints = hiddenState.paints;
      await command('Target.activateTarget', { targetId });
      await until(() => evaluate(`!document.hidden && window.__inspectorAudit.visibility.at(-1)?.hidden===false`), 'Inspector tab did not deliver visible-tab restoration', 1000); await delay(300);
      const restored = await state(); assert.equal(restored.paints, paints); assert.equal(restored.pendingFrames, 0);
      return { acceptance: 'pass', hiddenState, restored, trace: await evaluate('window.__inspectorAudit.visibility') };
    } finally { await command('Target.activateTarget', { targetId }); await command('Target.closeTarget', { targetId: background.targetId }); }
  });

  await check('I12', 'Destroy, remount and stale destroy callback', async () => {
    await navigate();
    const before = await evaluate(`(() => {const c=window.atlasInspectorSpecimen.controller; window.__oldInspector=c; window.atlasInspectorSpecimen.inspect(0); c.destroy(); c.destroy(); return c.snapshot();})()`);
    assert.equal(before.destroyed, true); assert.equal(before.pendingFrames, 0);
    await preference('reduce'); await preference('no-preference'); await delay(300);
    const after = await evaluate('window.__oldInspector.snapshot()'); assert.equal(after.paints, before.paints);
    await click('.fi-review > summary'); await click('[data-fi-mount]');
    await until(() => evaluate(`window.atlasInspectorSpecimen.controller.snapshot().motionState==='ready'`), 'Remount did not load');
    await evaluate('window.__oldInspector.destroy()'); await click(selectors.third);
    const remounted = await settled(); selected(remounted, 'startup:fusion-books', 'Fusion Books'); assert.equal(remounted.destroyed, false);
    return { destroyed: before, afterEnvironmentChanges: after, remounted };
  });

  await check('I13', 'Sibling ownership and host animation survive teardown', async () => {
    await navigate();
    const result = await evaluate(`(async () => {
      const {mountInspector}=await import('./inspector.js'); const root=document.querySelector('[data-fi-root]');
      const other=root.cloneNode(true); for(const e of other.querySelectorAll('[id]'))e.id='sibling-'+e.id;
      for(const e of other.querySelectorAll('[aria-labelledby],[aria-controls]'))for(const key of ['aria-labelledby','aria-controls'])if(e.hasAttribute(key))e.setAttribute(key,e.getAttribute(key).split(/\\s+/).map(id=>'sibling-'+id).join(' '));
      other.style.setProperty('--fi-selection-easing','ease-in','important');
      root.after(other); const b=mountInspector(other); await new Promise(resolve=>setTimeout(resolve,30));
      const sentinel=document.createElement('span');sentinel.textContent='Host sentinel';sentinel.style.cssText='color:rgb(11,22,33);font-family:serif';document.body.append(sentinel);const host=sentinel.animate([{opacity:1},{opacity:.9}],{duration:2000});
      const bOpener=other.querySelector('[data-fi-select]'); b.select(bOpener.dataset.fiSelect,{opener:bOpener});
      const a=window.atlasInspectorSpecimen.controller;a.select('startup:canva',{opener:root.querySelector('[data-fi-select]')});a.destroy(false);
      const during={a:a.snapshot(),b:b.snapshot(),hostPlayState:host.playState,color:getComputedStyle(sentinel).color};
      await new Promise(resolve=>setTimeout(resolve,350));const after={b:b.snapshot(),panelOpen:other.querySelector('[data-fi-panel]').open,hostPlayState:host.playState,uniqueIds:new Set([...document.querySelectorAll('[id]')].map(e=>e.id)).size===[...document.querySelectorAll('[id]')].length};
      b.destroy(false);const restoredEasing={value:other.style.getPropertyValue('--fi-selection-easing'),priority:other.style.getPropertyPriority('--fi-selection-easing')};
      host.cancel();other.remove();sentinel.remove();return {during,after,restoredEasing};
    })()`);
    assert.equal(result.during.a.pendingFrames, 0); assert.equal(result.during.b.pendingFrames, 1); assert.equal(result.during.hostPlayState, 'running');
    assert.equal(result.after.b.phase, 'open'); assert.equal(result.after.panelOpen, true); assert.equal(result.after.uniqueIds, true); assert.equal(result.after.hostPlayState, 'running');
    assert.equal(result.during.color, 'rgb(11, 22, 33)');
    assert.deepEqual(result.restoredEasing, { value: 'ease-in', priority: 'important' });
    return result;
  }, { input: 'Test host fixture with two independently authored ID scopes and a finite host-owned animation' });

  await check('I14', 'CSS linear capability and explicit fallback preserve semantics', async () => {
    await navigate(); const supported = await state();
    assert.equal(supported.nativeLinear, true); assert.equal(supported.easing, 'linear'); assert.ok(supported.actualEasing.startsWith('linear('));
    await navigate('?linear=off'); await click(selectors.first); const fallback = await settled();
    assert.equal(fallback.easing, 'fallback'); assert.ok(fallback.actualEasing.startsWith('cubic-bezier(')); selected(fallback, 'startup:canva', 'Canva');
    return { supported, fallback, unsupportedPath: 'Injected feature-test result; not an old browser compatibility claim' };
  });

  await check('I15', 'Failed optional motion and no-JavaScript preserve evidence', async () => {
    await navigate('?motion=fail'); await click(selectors.third); const failed = await state();
    selected(failed, 'startup:fusion-books', 'Fusion Books'); assert.equal(failed.phase, 'open'); assert.equal(failed.pendingFrames, 0); assert.equal(failed.motionState, 'unavailable');
    await command('Emulation.setScriptExecutionDisabled', { value: true });
    let noJavaScript;
    try {
      await navigate('', { ready: false });
      noJavaScript = await evaluate(`(() => {const root=document.querySelector('[data-fi-root]');return {staticVisible:!root.querySelector('[data-fi-static]').hidden,records:root.querySelectorAll('[data-fi-static] article').length,disabled:[...root.querySelectorAll('[data-fi-select]')].every(e=>e.disabled),links:[...root.querySelectorAll('[data-fi-static] a')].map(e=>e.href),liveInspector:!!window.atlasInspectorSpecimen};})()`);
      assert.equal(noJavaScript.staticVisible, true); assert.equal(noJavaScript.records, 3); assert.equal(noJavaScript.disabled, true); assert.equal(noJavaScript.liveInspector, false); assert.equal(noJavaScript.links.length, 6);
      await capture('no-javascript-desktop');
    } finally { await command('Emulation.setScriptExecutionDisabled', { value: false }); }
    return { failedMotion: failed, noJavaScript };
  });

  for (const [width, height] of [[1440, 1000], [390, 844], [320, 740]]) {
    for (const theme of ['light', 'dark']) {
      await check('I06-I17', `${width}px ${theme} appearance, focus and overflow`, async () => {
        await viewport(width, height); await preference('no-preference'); await navigate();
        if (theme === 'dark') { await click('.fi-review > summary'); await click('[data-fi-theme]'); }
        await evaluate('window.scrollTo({top:0,behavior:"instant"})');
        await focus(selectors.third); await key('Enter'); let s = await settled(); selected(s, 'startup:fusion-books', 'Fusion Books');
        assert.ok(s.overflow <= 1, 'Page must not overflow horizontally'); assert.ok(s.closeRect.width >= 44 && s.closeRect.height >= 44);
        assert.ok(s.panelRect.x >= 0 && s.panelRect.x + s.panelRect.width <= width + 1);
        if (width <= 700) assert.equal(s.activeId, 'inspector-title');
        else assert.equal(s.activeSelect, 'startup:fusion-books');
        assert.equal(s.focusVisible, true);
        if (width <= 700) {
          assert.equal(s.modal, true); assert.ok(s.panelRect.bottom <= height + 1);
          const trace = { viewport: { width, height }, theme, steps: [], backgroundFocusAttempt: null };
          report.modalFocusTraces.push(trace);
          const reached = new Set();
          async function tabStep(shift = false, purpose = 'cycle') {
            await key('Tab', shift);
            const current = await state();
            const inPanel = current.activeInPanel && current.documentHasFocus;
            const outsideDocument = !current.activeInPanel && !current.documentHasFocus && ['BODY', 'HTML'].includes(current.activeTag);
            const target = current.activeIsClose ? 'close' : current.activeIsSource ? 'source' : current.activeIsProfile ? 'profile' : current.activeInPanel ? 'panel' : outsideDocument ? 'outside-document' : 'outside';
            trace.steps.push({ key: shift ? 'Shift+Tab' : 'Tab', purpose, target,
              documentHasFocus: current.documentHasFocus, activeTag: current.activeTag, activeId: current.activeId,
              activeSelect: current.activeSelect, activeInPanel: current.activeInPanel, modal: current.modal,
              focused: current.focused });
            assert.equal(current.modal, true, 'Tab navigation must preserve native modality');
            assert.ok(inPanel, 'Ordinary modal Tab must stay on a rendered panel action');
            if (inPanel) reached.add(target);
            return current;
          }
          assert.equal((await tabStep()).activeIsClose, true);
          for (let i = 0; i < 6; i++) await tabStep();
          await tabStep(true);
          assert.ok(['close', 'source', 'profile'].every(target => reached.has(target)), 'Native Tab must reach Close, evidence source and profile');
          assert.ok(trace.steps.some((step, i) => i && step.key === 'Tab' && step.target === 'close' && trace.steps[i - 1].target === 'profile'), 'Forward boundary must wrap directly from profile to Close');
          assert.ok(trace.steps.some((step, i) => i && step.key === 'Shift+Tab' && step.target === 'profile' && trace.steps[i - 1].target === 'close'), 'Reverse boundary must wrap directly from Close to profile');
          trace.backgroundFocusAttempt = await evaluate(`(() => {
            const before=document.activeElement, panel=document.querySelector('[data-fi-panel]'), background=document.querySelector('[data-fi-select]');
            background.focus();
            return {sameActive:document.activeElement===before,activeInPanel:panel.contains(document.activeElement),
              documentHasFocus:document.hasFocus(),activeTag:document.activeElement.tagName,backgroundFocused:document.activeElement===background};
          })()`);
          assert.equal(trace.backgroundFocusAttempt.sameActive, true, 'The native modal must reject background focus');
          assert.equal(trace.backgroundFocusAttempt.activeInPanel, true);
          assert.equal(trace.backgroundFocusAttempt.documentHasFocus, true);
          assert.equal(trace.backgroundFocusAttempt.backgroundFocused, false);
          await focus('[data-fi-title]');
          s = await state();
          assert.equal(s.activeId, 'inspector-title'); assert.equal(s.documentHasFocus, true); assert.equal(s.focusVisible, true);
        } else assert.equal(s.modal, false);
        const colors = await evaluate(`(() => {const r=document.querySelector('[data-fi-root]'),p=r.querySelector('[data-fi-panel]'),t=r.querySelector('[data-fi-title]'),m=r.querySelector('.fi-content .fi-id'),b=r.querySelector('[data-selected="true"]');return {title:getComputedStyle(t).color,surface:getComputedStyle(p).backgroundColor,muted:getComputedStyle(m).color,focus:getComputedStyle(document.activeElement).outlineColor,selectedBorder:getComputedStyle(b).borderTopColor,selectedSurface:getComputedStyle(b).backgroundColor};})()`);
        const linear = value => { const c = value / 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; };
        const luminance = color => { const rgb = color.match(/[\d.]+/g).slice(0, 3).map(Number); return rgb.map(linear).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0); };
        const contrast = (a, b) => { const values = [luminance(a), luminance(b)].sort((x, y) => y - x); return (values[0] + .05) / (values[1] + .05); };
        const ratios = { title: contrast(colors.title, colors.surface), muted: contrast(colors.muted, colors.surface), focus: contrast(colors.focus, colors.surface), selected: contrast(colors.selectedBorder, colors.selectedSurface) };
        assert.ok(ratios.title >= 4.5 && ratios.muted >= 4.5 && ratios.focus >= 3 && ratios.selected >= 3, JSON.stringify(ratios));
        const file = await capture(`${width}-${theme}-selected-focus`);
        await key('Escape'); const dismissed = await settled('closed'); assert.equal(dismissed.activeSelect, 'startup:fusion-books');
        return { selected: s, colors, contrastRatios: ratios, screenshot: file, dismissed };
      }, { viewport: { width, height }, theme, input: 'Native Enter, Tab, Shift+Tab, Escape' });
    }
  }

  await check('I16-I18', 'Settled inspector has no continuing frame or animation work', async () => {
    await viewport(1440, 1000); await navigate(); await click(selectors.first); const before = await settled();
    await delay(600); const after = await state();
    assert.equal(after.pendingFrames, 0); assert.equal(after.ownedAnimations, 0); assert.equal(after.paints, before.paints);
    selected(after, 'startup:canva', 'Canva');
    return { windowMs: 600, before, after };
  });
  assert.deepEqual(report.exceptions, [], 'No uncaught browser exceptions');
  assert.deepEqual(report.consoleErrors, [], 'No browser console errors');
  assert.ok(report.requests.every(url => url.startsWith(origin) || url.startsWith('data:')), 'Specimen must not load external resources');
  report.status = report.limitations.length ? 'passed-with-explicit-pending-acceptance' : 'passed';
  console.log(`Inspector acceptance: ${report.scenarios.length} checks, ${report.limitations.length} pending limitations.`);
} catch (error) {
  report.status = 'failed'; report.failure = error.stack || error.message; report.chromeLog = chromeLog;
  if (evaluate) report.failureState = await state().catch(() => null);
  if (command) await capture('failure').catch(() => {});
  console.error(error.stack || error); process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString();
  await mkdir(output, { recursive: true });
  await writeFile(join(output, 'inspector-browser-report.json'), JSON.stringify(report, null, 2) + '\n');
  for (const operation of pending.values()) { clearTimeout(operation.timer); operation.reject(new Error('Browser acceptance finished')); }
  pending.clear(); socket?.close();
  if (chrome && chrome.exitCode === null && chrome.signalCode === null) {
    chrome.kill('SIGTERM'); await Promise.race([new Promise(resolveExit => chrome.once('exit', resolveExit)), delay(1000)]);
    if (chrome.exitCode === null && chrome.signalCode === null) chrome.kill('SIGKILL');
  }
  server?.closeAllConnections(); server?.close();
  if (profile) await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}
