import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

// Preserve this historical harness without starting setup, a server or a browser.
// There is deliberately no environment override for the unresolved permission hold.
throw new Error('BLOCKED: Native browser acceptance is held while the existing Chrome permission request remains unresolved.');

const { buildSpecimen } = await import('../prototypes/fluid-filter-controls/build.mjs');

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = process.env.ATLAS_FLUID_SCREENSHOTS_DIR || join(process.env.RUNNER_TEMP || tmpdir(), 'startup-atlas-graph', 'fluid-filter-controls');
let sourceRevision = process.env.ATLAS_SOURCE_REVISION || null;
try { sourceRevision ||= execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repository, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch {}
const report = { sourceRevision, status: 'running', sourceHashes: {}, checks: [], measurements: {}, screenshots: [], requests: [], exceptions: [], console: [], browserLogs: [], coverageGaps: [], limitations: ['Chrome emulation does not establish physical-device, WebKit, Firefox or assistive-technology acceptance.'] };
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2' };
let workspace, profile, server, chrome, socket, command, evaluate, origin, chromeFailure, chromeLog = '', blockVendor = false, serial = 0, navigation = 0;
const pending = new Map();
const rootSelector = '[data-fluid-controls]';
const scopeSelector = value => `${rootSelector} ui-segmented-control-item[value="${value}"]`;

async function until(fn, message, timeout = 10000) {
  const end = Date.now() + timeout;
  let last;
  do {
    if (chromeFailure) throw new Error(chromeFailure + '\n' + chromeLog);
    try { const value = await fn(); if (value) return value; } catch (error) { last = error; }
    await delay(35);
  } while (Date.now() < end);
  throw new Error(message + (last ? ': ' + last.message : ''));
}

async function check(name, fn) {
  const started = Date.now();
  try {
    const detail = await fn();
    const status = detail?.observed === false ? 'not-observed' : 'passed';
    report.checks.push({ name, status, durationMs: Date.now() - started, ...(detail === undefined ? {} : { detail }) });
    console.log((status === 'passed' ? 'PASS ' : 'GAP ') + name);
  } catch (error) {
    report.checks.push({ name, status: 'failed', durationMs: Date.now() - started, message: error.message });
    throw error;
  }
}

const auditScript = `(() => {
  const audit = window.__filterAudit = { commits: [], visibility: [], keys: [], rafCalls: 0, pendingFrames: new Set(), listeners: [] };
  const nativeRequest = requestAnimationFrame.bind(window), nativeCancel = cancelAnimationFrame.bind(window);
  window.requestAnimationFrame = callback => {
    audit.rafCalls++;
    const id = nativeRequest(time => { audit.pendingFrames.delete(id); callback(time); });
    audit.pendingFrames.add(id); return id;
  };
  window.cancelAnimationFrame = id => { audit.pendingFrames.delete(id); nativeCancel(id); };
  const add = EventTarget.prototype.addEventListener, remove = EventTarget.prototype.removeEventListener;
  EventTarget.prototype.addEventListener = function(type, callback, options) {
    if ((this === document && type === 'visibilitychange') || (this instanceof MediaQueryList && type === 'change')) {
      const capture = typeof options === 'boolean' ? options : Boolean(options?.capture);
      if (!audit.listeners.some(item => item.active && item.target === this && item.type === type && item.callback === callback && item.capture === capture)) {
        const entry = { target: this, type, callback, capture, active: !options?.signal?.aborted };
        audit.listeners.push(entry);
        if (options?.signal) add.call(options.signal, 'abort', () => { entry.active = false; }, { once: true });
      }
    }
    return add.call(this, type, callback, options);
  };
  EventTarget.prototype.removeEventListener = function(type, callback, options) {
    const capture = typeof options === 'boolean' ? options : Boolean(options?.capture);
    for (const entry of audit.listeners) if (entry.target === this && entry.type === type && entry.callback === callback && entry.capture === capture) entry.active = false;
    return remove.call(this, type, callback, options);
  };
  add.call(document, 'filtercommit', event => {
    const root = event.target;
    const item = { detail: event.detail, time: performance.now(), visible: [...root.querySelectorAll('[data-record]')].filter(row => !row.hidden).map(row => row.dataset.record), count: root.querySelector('[data-result-count]')?.textContent };
    audit.commits.push(item);
    queueMicrotask(() => { item.checked = root.querySelector('[role="radio"][aria-checked="true"]')?.getAttribute('value'); });
  }, { capture: true });
  add.call(document, 'visibilitychange', event => audit.visibility.push({ hidden: document.hidden, trusted: event.isTrusted, time: performance.now() }));
  add.call(document, 'keydown', event => audit.keys.push({ key: event.key, trusted: event.isTrusted, target: event.target.id || event.target.getAttribute?.('value') || event.target.tagName }));
})();`;

const stateExpression = `(() => {
  const root = document.querySelector('[data-fluid-controls]'), controller = window.__testController || window.atlasFilterSpecimen?.controller;
  const group = root?.querySelector('[data-scope]'), marker = root?.querySelector('ui-segmented-control-indicator'), selected = group?.querySelector('[aria-checked="true"]');
  const rect = element => { const r = element?.getBoundingClientRect(); return r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null; };
  const animations = root ? root.getAnimations({ subtree: true }).filter(animation => animation.playState === 'running' || animation.playState === 'pending').map(animation => ({ state: animation.playState, property: animation.transitionProperty || null, duration: animation.effect?.getTiming().duration })) : [];
  return { url: location.href, title: document.title, ready: root?.dataset.ready, state: controller?.getState(), motion: controller?.getMotionState(),
    groupRole: group?.getAttribute('role'), items: [...(group?.querySelectorAll('[role="radio"]') || [])].map(item => ({ value: item.getAttribute('value'), checked: item.getAttribute('aria-checked'), tabIndex: item.tabIndex, checkOpacity: getComputedStyle(item.querySelector('.fc-check')).opacity })),
    records: [...(root?.querySelectorAll('[data-record]') || [])].filter(row => !row.hidden).map(row => row.dataset.record), count: root?.querySelector('[data-result-count]')?.textContent,
    status: root?.querySelector('[data-results-status]')?.textContent, empty: root ? !root.querySelector('[data-empty]').hidden : null,
    focused: { id: document.activeElement?.id, value: document.activeElement?.getAttribute('value'), tag: document.activeElement?.tagName, visible: document.activeElement?.matches(':focus-visible'), inGroup: !!document.activeElement?.closest('[data-scope]') },
    marker: rect(marker), selected: rect(selected), easing: marker ? getComputedStyle(marker).transitionTimingFunction : null, duration: marker ? getComputedStyle(marker).transitionDuration : null,
    animations, visibility: document.visibilityState, listeners: window.__filterAudit?.listeners.filter(item => item.active).map(item => item.type), rafCalls: window.__filterAudit?.rafCalls, pendingFrames: window.__filterAudit?.pendingFrames.size };
})()`;
const state = () => evaluate(stateExpression);

async function viewport(width, mobile = false, height = mobile ? 844 : 1050) {
  await command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
  await command('Emulation.setTouchEmulationEnabled', { enabled: mobile, maxTouchPoints: 1 });
}
const preference = value => command('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value }] });

async function navigate(params = '', { ready = true } = {}) {
  const url = `${origin}/index.html?run=${++navigation}${params ? '&' + params : ''}`;
  await command('Page.navigate', { url });
  await until(() => evaluate(`location.href === ${JSON.stringify(url)} && document.readyState !== 'loading' && !!document.querySelector('[data-fluid-controls]')`), 'Specimen did not load');
  if (ready) await until(() => evaluate(`!!window.atlasFilterSpecimen && document.querySelector('[data-fluid-controls]').dataset.ready === 'true'`), 'Specimen controls did not mount');
  await evaluate('document.fonts.ready');
  if (ready) await assertSettled();
}

async function waitCurve(expected = 'linear') {
  return until(async () => { const current = await state(); return current.motion?.curve === expected ? current : null; }, 'Motion curve did not reach ' + expected);
}
async function waitIdle() {
  return until(async () => { const current = await state(); return current.animations.length === 0 ? current : null; }, 'Specimen did not settle');
}
function aligned(current) {
  return current.marker && current.selected && ['x', 'y', 'width', 'height'].every(key => Math.abs(current.marker[key] - current.selected[key]) <= 1.2);
}
async function assertSettled() {
  return until(async () => { const current = await state(); return current.animations.length === 0 && aligned(current) ? current : null; }, 'Decorative marker did not settle on the committed selection');
}
async function assertNoReplay(label, milliseconds = 320) {
  const sample = await evaluate(`new Promise(resolve => {
    const root=document.querySelector('[data-fluid-controls]'),start=performance.now();let frames=0,maxActive=0;
    const inspect=()=>{frames++;maxActive=Math.max(maxActive,root.getAnimations({subtree:true}).filter(animation=>animation.playState==='running'||animation.pending).length);if(performance.now()-start>=${milliseconds})resolve({frames,maxActive,elapsedMs:performance.now()-start});else requestAnimationFrame(inspect);};inspect();
  })`);
  assert.ok(sample.frames >= 3, label + ' needs observations across rendered frames');
  assert.equal(sample.maxActive, 0, label + ' must not start a decorative replay');
  return sample;
}
async function screenshot(name, fullPage = false) {
  const options = { format: 'png', captureBeyondViewport: fullPage };
  if (fullPage) {
    const size = (await command('Page.getLayoutMetrics')).cssContentSize;
    options.clip = { x: 0, y: 0, width: size.width, height: size.height, scale: 1 };
  }
  const result = await command('Page.captureScreenshot', options);
  await writeFile(join(outputDir, name + '.png'), Buffer.from(result.data, 'base64'));
  report.screenshots.push(name + '.png');
}
async function key(keyName, code, keyCode, modifiers = 0) {
  const character = keyName === 'Enter' ? { nativeVirtualKeyCode: keyCode, text: '\r', unmodifiedText: '\r' } : keyName === ' ' ? { text: ' ', unmodifiedText: ' ' } : {};
  await command('Input.dispatchKeyEvent', { type: 'keyDown', key: keyName, code, windowsVirtualKeyCode: keyCode, modifiers, ...character });
  await command('Input.dispatchKeyEvent', { type: 'keyUp', key: keyName, code, windowsVirtualKeyCode: keyCode, modifiers });
}
async function centre(selector) {
  await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({ block: 'center', behavior: 'instant' })`);
  const point = await evaluate(`(() => { const element = document.querySelector(${JSON.stringify(selector)}), r = element.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, width: r.width, height: r.height, hit: element.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)) }; })()`);
  assert.ok(point.hit, selector + ' must be reachable');
  return point;
}
async function click(selector) {
  const point = await centre(selector);
  await command('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', buttons: 1, clickCount: 1 });
  await command('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', buttons: 0, clickCount: 1 });
}
async function input(text) {
  await click('[data-query]');
  await key('a', 'KeyA', 65, 2);
  await command('Input.insertText', { text });
}
async function setCountry(value) {
  await evaluate(`document.querySelector('ui-select[data-country]').api.setValue(${JSON.stringify(value)})`);
}
async function expectScope(scope, count) {
  const current = await until(async () => { const value = await state(); return value.state?.scope === scope && Number(value.count) === count ? value : null; }, 'Expected scope ' + scope + ' and ' + count + ' records');
  assert.equal(current.groupRole, 'radiogroup');
  assert.equal(current.items.length, 4);
  assert.equal(current.items.filter(item => item.checked === 'true').length, 1);
  assert.equal(current.items.find(item => item.checked === 'true').value, scope);
  assert.equal(current.items.filter(item => item.tabIndex === 0).length, 1);
  assert.equal(current.items.find(item => item.checked === 'true').checkOpacity, '1');
  return current;
}
async function assertBounds(label) {
  const result = await evaluate(`(() => {
    const root = document.querySelector('[data-fluid-controls]'), box = root.getBoundingClientRect();
    const visible = element => element.getClientRects().length && element.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}) && !element.closest('[hidden],.fc-sr-only');
    const controls = [...root.querySelectorAll('button,input,select,ui-segmented-control-item')].filter(visible);
    const overflow = [...root.querySelectorAll('h2,h3,p,label,button,input,select,ui-segmented-control-item,.fc-name,.fc-description,.fc-kind')].filter(visible).filter(element => { const r = element.getBoundingClientRect(); return r.left < box.left - 1 || r.right > box.right + 1; }).map(element => element.id || element.textContent.trim().slice(0,70));
    return { viewport: innerWidth, documentWidth: document.documentElement.scrollWidth, root: { width: box.width, scrollWidth: root.scrollWidth, clientWidth: root.clientWidth }, overflow,
      targets: controls.map(element => { const r = element.getBoundingClientRect(); return { label: element.getAttribute('aria-label') || element.textContent.trim() || element.id, width: r.width, height: r.height }; }),
      font: getComputedStyle(root).fontFamily, columns: getComputedStyle(root.querySelector('[data-scope]')).gridTemplateColumns };
  })()`);
  assert.ok(result.documentWidth <= result.viewport + 1, label + ' page overflow: ' + JSON.stringify(result));
  assert.ok(result.root.scrollWidth <= result.root.clientWidth + 1, label + ' component overflow: ' + JSON.stringify(result));
  assert.deepEqual(result.overflow, [], label + ' text/control bounds');
  assert.ok(result.targets.every(target => target.width >= 43.5 && target.height >= 43.5), label + ' needs 44px targets: ' + JSON.stringify(result.targets));
  assert.match(result.font, /Atlas Geist/);
  return result;
}
async function contrast() {
  return evaluate(`(() => {
    const root = document.querySelector('[data-fluid-controls]');
    const resolve = token => { const probe = document.createElement('span'); probe.style.color = 'var(' + token + ')'; root.append(probe); const color = getComputedStyle(probe).color; probe.remove(); return color; };
    const rgb = color => color.match(/[0-9.]+/g).slice(0,3).map(Number);
    const luminance = color => rgb(color).map(value => { value /= 255; return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4; }).reduce((sum,value,index) => sum + value * [.2126,.7152,.0722][index],0);
    const ratio = (a,b) => { const values = [luminance(a),luminance(b)].sort((x,y) => y-x); return (values[0]+.05)/(values[1]+.05); };
    const pairs = [ ['body','--fc-ink','--fc-surface',4.5], ['metadata','--fc-muted','--fc-surface',4.5], ['unselected label','--fc-muted','--fc-soft',4.5], ['selected chip','--fc-ink','--fc-selected',4.5], ['button top','--fc-ink','--fc-face-top',4.5], ['button bottom','--fc-ink','--fc-face-bottom',4.5], ['count','--fc-accent','--fc-selected',4.5], ['focus on surface','--fc-focus','--fc-surface',3], ['focus on track','--fc-focus','--fc-soft',3], ['selected check','--fc-accent','--fc-surface',3], ['field edge','--fc-control-edge','--fc-surface',3], ['track edge','--fc-control-edge','--fc-soft',3] ];
    const measured=pairs.map(([label,foreground,background,minimum]) => { const fg=resolve(foreground),bg=resolve(background); return {label,foreground:fg,background:bg,ratio:ratio(fg,bg),minimum}; });
    const input=root.querySelector('[data-query]'),placeholder=getComputedStyle(input,'::placeholder'),background=getComputedStyle(input).backgroundColor;
    measured.push({label:'search placeholder',foreground:placeholder.color,background,ratio:ratio(placeholder.color,background),minimum:4.5,opacity:Number(placeholder.opacity)});
    return measured;
  })()`);
}

try {
  await mkdir(outputDir, { recursive: true });
  workspace = await mkdtemp(join(tmpdir(), 'atlas-filter-site-'));
  profile = await mkdtemp(join(tmpdir(), 'atlas-filter-chrome-'));
  for (const path of ['prototypes/fluid-filter-controls/controller.js', 'prototypes/fluid-filter-controls/entry.js', 'prototypes/fluid-filter-controls/controls.css', 'prototypes/fluid-filter-controls/index.html', 'prototypes/fluid-filter-controls/vendor/spring.js', 'scripts/test-fluid-filter-controls-browser.mjs']) {
    report.sourceHashes[path] = createHash('sha256').update(await readFile(join(repository, path))).digest('hex');
  }
  await buildSpecimen(workspace);
  server = createServer(async (req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (blockVendor && pathname === '/vendor/spring.js') {
      report.requests.push({ url: req.url, status: 503, expectedFailure: true });
      res.writeHead(503, { 'Cache-Control': 'no-store' }).end('Expected unavailable motion vendor'); return;
    }
    try {
      let path = resolve(workspace, '.' + decodeURIComponent(pathname));
      if (path !== workspace && !path.startsWith(workspace + sep)) { res.writeHead(403).end(); return; }
      if (pathname.endsWith('/')) path = join(path, 'index.html');
      const content = await readFile(path);
      report.requests.push({ url: req.url, status: 200, bytes: content.length });
      res.writeHead(200, { 'Content-Type': mime[extname(path)] || 'application/octet-stream', 'Cache-Control': 'no-store' }).end(content);
    } catch { report.requests.push({ url: req.url, status: 404 }); res.writeHead(404).end(); }
  });
  await new Promise((resolveListen, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolveListen));
  origin = `http://127.0.0.1:${server.address().port}`;
  chrome = spawn(process.env.CHROME_BIN || 'google-chrome', ['--headless=new', '--disable-gpu', '--disable-dev-shm-usage', '--disable-background-networking', '--no-first-run', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  chrome.once('error', error => { chromeFailure = error.message; });
  chrome.once('exit', (code, signal) => { chromeFailure = `Chrome exited (${code ?? signal})`; });
  chrome.stderr.on('data', chunk => { chromeLog = (chromeLog + chunk).slice(-6000); });
  const port = await until(async () => Number((await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]), 'Chrome did not start with its ordinary sandbox', 45000);
  const target = await until(async () => (await (await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(5000) })).json()).find(item => item.type === 'page'), 'Chrome did not expose a page');
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolveOpen, reject) => {
    const timer = setTimeout(() => reject(new Error('CDP connection timed out')), 10000);
    socket.addEventListener('open', () => { clearTimeout(timer); resolveOpen(); }, { once: true });
    socket.addEventListener('error', error => { clearTimeout(timer); reject(error); }, { once: true });
  });
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') report.exceptions.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    if (message.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(message.params.type)) report.console.push(message.params.args.map(arg => arg.value || arg.description || '').join(' '));
    if (message.method === 'Log.entryAdded' && ['error', 'warning'].includes(message.params.entry.level)) report.browserLogs.push(message.params.entry);
    if (!message.id) return;
    const item = pending.get(message.id); if (!item) return;
    pending.delete(message.id); clearTimeout(item.timer);
    if (message.error) item.reject(new Error(message.error.message)); else item.resolve(message.result);
  });
  socket.addEventListener('close', () => {
    for (const item of pending.values()) { clearTimeout(item.timer); item.reject(new Error('CDP connection closed')); }
    pending.clear();
  });
  command = (method, params = {}) => new Promise((resolveCommand, reject) => {
    const id = ++serial, timer = setTimeout(() => { pending.delete(id); reject(new Error(method + ' timed out')); }, 12000);
    pending.set(id, { resolve: resolveCommand, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
  evaluate = async expression => {
    const result = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  await command('Page.enable'); await command('Runtime.enable'); await command('Network.enable'); await command('Log.enable');
  await command('Network.setCacheDisabled', { cacheDisabled: true });
  await command('Page.addScriptToEvaluateOnNewDocument', { source: auditScript });
  report.environment = { browser: await command('Browser.getVersion'), origin, sandbox: 'ordinary Chrome sandbox; no sandbox-disable flags', transport: 'Node 22 raw CDP' };

  await check('Reduced first visit renders functional controls without the optional motion vendor', async () => {
    await viewport(1440); await preference('reduce');
    const start = report.requests.length;
    await navigate();
    assert.equal((await state()).title, 'Atlas — Filter and control continuity');
    await expectScope('all', 8);
    assert.equal((await state()).motion.reduced, true);
    assert.equal(report.requests.slice(start).filter(request => request.url.startsWith('/vendor/')).length, 0);
    await click(scopeSelector('provider')); await expectScope('provider', 2); await assertSettled();
    assert.equal((await state()).duration, '0s');
    await screenshot('01-desktop-reduced');
  });

  await check('Keyboard selection commits records once and preserves an independent focus ring', async () => {
    await preference('no-preference'); await navigate(); await waitCurve();
    for (let i = 0; i < 30 && !(await state()).focused.inGroup; i++) await key('Tab', 'Tab', 9);
    assert.equal((await state()).focused.value, 'all');
    const before = await evaluate('window.__filterAudit.commits.length');
    await key('ArrowRight', 'ArrowRight', 39);
    let current = await expectScope('startup', 4);
    assert.equal(current.focused.value, 'startup'); assert.equal(current.focused.visible, true);
    const commits = await evaluate('window.__filterAudit.commits');
    assert.equal(commits.length - before, 1, 'One key selection must produce one committed filter change');
    assert.deepEqual(commits.at(-1).visible, current.records);
    assert.equal(commits.at(-1).count, '4'); assert.equal(commits.at(-1).checked, 'startup');
    const ring = await evaluate(`(() => { const style=getComputedStyle(document.activeElement);return {width:parseFloat(style.outlineWidth),style:style.outlineStyle,offset:parseFloat(style.outlineOffset)}; })()`);
    assert.ok(ring.width >= 3 && ring.style !== 'none' && ring.offset >= 2);
    await key('Tab', 'Tab', 9); assert.equal((await state()).focused.inGroup, false);
    await key('Tab', 'Tab', 9, 8); assert.equal((await state()).focused.value, 'startup');
    await key('ArrowLeft', 'ArrowLeft', 37); await expectScope('all', 8);
    assert.ok((await evaluate('window.__filterAudit.keys')).some(event => event.key === 'ArrowRight' && event.trusted));
    await screenshot('02-keyboard-focus');
    return { ring, immediateCommit: commits.at(-1) };
  });

  await check('Motion interruption retains the displayed position and immediately commits the latest result set', async () => {
    await navigate(); await waitCurve(); await assertSettled();
    const initial = (await state()).marker;
    await click(scopeSelector('provider')); await expectScope('provider', 2);
    await until(async () => { const value=await state(); return value.animations.length && Math.abs(value.marker.x-initial.x)>1 && !aligned(value); }, 'The marker must visibly travel before interruption', 1500);
    const sample = await evaluate(`(async () => {
      const root=document.querySelector('[data-fluid-controls]'),group=root.querySelector('[data-scope]'),marker=root.querySelector('ui-segmented-control-indicator');
      const rect=()=>{const r=marker.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};
      const before=rect();group.api.setValue('partner');await Promise.resolve();const after=rect();
      const immediate={scope:window.atlasFilterSpecimen.controller.getState().scope,count:root.querySelector('[data-result-count]').textContent,check:group.querySelector('[aria-checked="true"]')?.getAttribute('value')};
      const frames=[];await new Promise(resolve=>{const end=performance.now()+380;const capture=()=>{frames.push(rect());if(performance.now()<end)requestAnimationFrame(capture);else resolve();};requestAnimationFrame(capture);});
      return {before,after,immediate,frames};
    })()`);
    assert.equal(sample.immediate.scope, 'partner'); assert.equal(sample.immediate.check, 'partner'); assert.equal(sample.immediate.count, '2');
    assert.ok(Math.abs(sample.before.x-sample.after.x)<2 && Math.abs(sample.before.y-sample.after.y)<2, 'Retarget must begin at the current displayed position: ' + JSON.stringify(sample));
    assert.ok(sample.frames.length >= 3 && new Set(sample.frames.map(frame=>frame.x.toFixed(2))).size > 1, 'Retargeted travel must be observed across frames');
    await assertSettled(); report.measurements.interruption=sample;
  });

  await check('Live device preference cancels motion and does not replay when restored', async () => {
    await navigate(); await waitCurve();
    await click(scopeSelector('provider')); await expectScope('provider',2);
    await until(async()=> (await state()).animations.length > 0,'Selection did not start motion');
    const before=await state(); await preference('reduce');
    const reduced=await assertSettled(); assert.equal(reduced.motion.reduced,true); assert.equal(reduced.motion.allowed,false); assert.deepEqual(reduced.records,before.records);
    await preference('no-preference'); await assertNoReplay('Reduced-motion preference restoration');
    const restored=await assertSettled(); assert.equal(restored.motion.reduced,false); assert.equal(restored.animations.length,0); assert.deepEqual(restored.state,before.state);
    await screenshot('03-live-preference-settled');
  });

  await check('Native specimen settings apply modes and themes while the device preference remains authoritative', async () => {
    await navigate();await waitCurve();
    await evaluate(`document.querySelector('[data-example-mode]').focus()`);await key('Home','Home',36);await key('ArrowDown','ArrowDown',40);
    await until(()=>evaluate(`window.atlasFilterSpecimen.controller.getMotionState().mode==='baseline'`),'Native mode selector did not choose Baseline');
    await click(scopeSelector('provider'));await expectScope('provider',2);assert.equal((await state()).animations.length,0);
    await evaluate(`document.querySelector('[data-example-mode]').focus()`);await key('End','End',35);
    await until(()=>evaluate(`window.atlasFilterSpecimen.controller.getMotionState().mode==='reduced'`),'Native mode selector did not choose Reduced motion');
    await preference('reduce');await key('Home','Home',36);
    await until(()=>evaluate(`window.atlasFilterSpecimen.controller.getMotionState().mode==='fluid'`),'Native mode selector did not return to Fluid');
    assert.equal((await state()).motion.reduced,true);assert.equal((await state()).motion.allowed,false);
    await preference('no-preference');await assertNoReplay('Native mode and device preference restoration');
    await evaluate(`document.querySelector('[data-example-theme]').focus()`);await key('End','End',35);
    await until(()=>evaluate(`document.querySelector('[data-fluid-controls]').dataset.theme==='dark'`),'Native appearance selector did not choose the dark study');
    assert.equal(await evaluate(`document.activeElement===document.querySelector('[data-example-theme]')`),true);
    await expectScope('provider',2);
  });

  await check('Baseline, reduced and Fluid modes retain identical filter and focus outcomes', async () => {
    const outcomes=[];
    for(const mode of ['baseline','reduced','fluid']) {
      await navigate('mode='+mode); if(mode==='fluid')await waitCurve();
      await click(scopeSelector('startup')); await expectScope('startup',4);
      await evaluate(`document.querySelector('[data-country-trigger]').focus()`); await key('Enter','Enter',13);
      await until(()=>evaluate(`document.querySelector('[data-country-trigger]').getAttribute('aria-expanded')==='true'`),'SDK Country popup did not open');
      await key('Home','Home',36);await key('ArrowDown','ArrowDown',40);await key('Enter','Enter',13);
      await until(()=>evaluate(`document.querySelector('ui-select[data-country]').value==='AU'`),'Country keyboard selection failed');
      assert.equal((await state()).count,'2'); assert.equal((await state()).focused.id,'fixture-country');
      await input('Aster'); assert.equal((await state()).count,'1');
      await click('[data-remove="query"]'); assert.equal((await state()).focused.id,'fixture-search'); assert.equal((await state()).count,'2');
      await click('[data-remove="country"]'); assert.equal((await state()).focused.id,'fixture-country'); assert.equal((await state()).count,'4');
      await click('[data-remove="scope"]'); const all=await expectScope('all',8); assert.equal(all.focused.value,'all');
      await input('no-matching-fixture'); assert.equal((await state()).empty,true); assert.equal((await state()).count,'0');
      await evaluate(`document.querySelector('[data-empty] [data-reset]').focus()`); await key('Enter','Enter',13);
      const recovered=await expectScope('all',8); assert.equal(recovered.focused.id,'fixture-search');
      await input('Aster'); await evaluate(`document.querySelector('.fc-head [data-reset]').focus()`); await key(' ','Space',32);
      assert.equal((await state()).focused.id,'fixture-search'); assert.equal((await state()).count,'8');
      await input('Tidal'); await click('ui-input-clear button');
      const cleared=await state(); assert.equal(cleared.state.query,'');assert.equal(cleared.focused.id,'fixture-search');
      outcomes.push({mode,state:cleared.state,records:cleared.records,status:cleared.status});
      if(mode!=='fluid')assert.equal(cleared.animations.length,0);
    }
    for(const item of outcomes.slice(1))assert.deepEqual({...item,mode:null},{...outcomes[0],mode:null});
    return outcomes;
  });

  await check('Composition input waits for completion and SDK agent actions update the same state once', async () => {
    await navigate();await waitCurve();
    const composition=await evaluate(`(() => {const input=document.querySelector('[data-query]'),controller=window.atlasFilterSpecimen.controller;input.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));input.value='Aster';input.dispatchEvent(new InputEvent('input',{bubbles:true,isComposing:true,data:'Aster'}));const during=controller.getState();document.querySelector('ui-select[data-country]').api.setValue('AU');const draft=input.value;input.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'Aster'}));return {during,draft,after:controller.getState()};})()`);
    assert.equal(composition.during.query,'');assert.equal(composition.draft,'Aster');assert.equal(composition.after.query,'Aster');assert.equal((await state()).count,'1');
    await setCountry('all');
    const agent=await evaluate(`window.atlasFilterSpecimen.agent.snapshot()`);
    const search=agent.find(item=>item.label==='Search records'&&item.actions.includes('setValue'));
    const group=agent.find(item=>item.label==='Entity type'&&item.actions.includes('setValue'));
    const country=agent.find(item=>item.label==='Country'&&item.actions.includes('setValue'));
    assert.ok(search&&group&&country,'All three named SDK controls must expose their documented actions');
    const before=await evaluate('window.__filterAudit.commits.length');
    const result=await evaluate(`window.atlasFilterSpecimen.agent.act(${JSON.stringify({steps:[{ref:search.ref,action:'setValue',args:['']},{ref:group.ref,action:'setValue',args:['provider']},{ref:country.ref,action:'setValue',args:['AU']}]})})`);
    assert.equal(result.ok,true);await expectScope('provider',1);assert.equal(await evaluate('window.__filterAudit.commits.length')-before,3);
    return {composition,agentControls:[search,group,country].map(({label,actions})=>({label,actions}))};
  });

  await check('CSS linear compatibility branch computes Atlas easing and keeps selection usable', async () => {
    await navigate();await waitCurve();await click('[data-example-fallback]');
    await click(scopeSelector('provider'));const fallback=await expectScope('provider',2);
    assert.equal(fallback.motion.curve,'fallback');assert.match(fallback.easing,/^cubic-bezier\(/);assert.ok(!fallback.easing.startsWith('linear('));await assertSettled();
    const forced=await evaluate(`(() => { const root=document.querySelector('[data-fluid-controls]');window.__testController=window.atlasFilterSpecimen.mountFilterControls(root,{supportsLinear:false});return window.__testController.getMotionState(); })()`);
    await waitCurve('fallback');await click(scopeSelector('startup'));await expectScope('startup',4);const current=await assertSettled();assert.match(current.easing,/^cubic-bezier\(/);
    return {uiFallback:fallback.easing,featureDetectionFallback:current.easing,initial:forced};
  });

  await check('Real hidden-tab transition is observed when headless Chrome supports it', async () => {
    await navigate();await waitCurve();await click(scopeSelector('provider'));
    let extra;
    try {
      extra=await command('Target.createTarget',{url:'about:blank',background:false});
      await command('Target.activateTarget',{targetId:extra.targetId});
      const hidden=await until(()=>evaluate('document.hidden'),'Headless tab did not become hidden',800).catch(()=>false);
      if(!hidden) {
        const limitation='Real tab hiding was not exposed by headless Chrome; the separate injected visibility test establishes controller logic only.';
        report.coverageGaps.push(limitation);return {observed:false,limitation};
      }
      await evaluate(`document.querySelector('[data-scope]').api.setValue('startup')`);
      const current=await assertSettled();assert.equal(current.motion.hidden,true);assert.equal(current.motion.allowed,false);assert.equal(current.state.scope,'startup');
      assert.ok((await evaluate('window.__filterAudit.visibility')).some(event=>event.hidden&&event.trusted));
      await command('Page.bringToFront');await until(()=>evaluate('!document.hidden'),'Original tab did not return');await assertNoReplay('Real tab visibility restoration');
      const restored=await assertSettled();assert.equal(restored.state.scope,'startup');assert.equal(restored.animations.length,0);
      return {observed:true,events:await evaluate('window.__filterAudit.visibility')};
    } finally {if(extra?.targetId)await command('Target.closeTarget',{targetId:extra.targetId});await command('Page.bringToFront');}
  });

  await check('Injected visibility seam settles the latest state and does not replay', async () => {
    await navigate();await waitCurve();await click(scopeSelector('provider'));
    await evaluate(`(() => {window.__hiddenDescriptor=Object.getOwnPropertyDescriptor(document,'hidden');window.__hiddenForTest=true;Object.defineProperty(document,'hidden',{configurable:true,get:()=>window.__hiddenForTest});document.dispatchEvent(new Event('visibilitychange'));document.querySelector('[data-scope]').api.setValue('partner');})()`);
    try {
      const hidden=await assertSettled();assert.equal(hidden.motion.hidden,true);assert.equal(hidden.motion.allowed,false);assert.equal(hidden.state.scope,'partner');
      await evaluate(`window.__hiddenForTest=false;document.dispatchEvent(new Event('visibilitychange'))`);await assertNoReplay('Injected visibility restoration');
      const shown=await assertSettled();assert.equal(shown.state.scope,'partner');assert.equal(shown.animations.length,0);
      return {method:'Injected document.hidden getter and untrusted visibilitychange event; not real tab evidence',latest:shown.state};
    } finally {await evaluate(`if(window.__hiddenDescriptor)Object.defineProperty(document,'hidden',window.__hiddenDescriptor);else delete document.hidden;document.dispatchEvent(new Event('visibilitychange'))`);}
  });

  await check('Destroy and repeated remount remove controller listeners without stale-owner interference', async () => {
    await navigate();await waitCurve();await click(scopeSelector('provider'));
    const before=await state();
    await click('[data-country-trigger]');
    await until(()=>evaluate(`document.querySelector('[data-country-trigger]').getAttribute('aria-expanded')==='true'`),'Country must be open before disposal');
    await evaluate(`window.atlasFilterSpecimen.controller.destroy()`);
    const destroyed=await state();assert.equal(destroyed.ready,'false');assert.equal(destroyed.animations.length,0);assert.equal(destroyed.listeners.length,before.listeners.length-2);
    assert.equal(await evaluate(`document.querySelector('[data-country-trigger]').getAttribute('aria-expanded')`),'false','Disposal must close the owned Country popup');
    assert.equal(await evaluate(`document.querySelector('ui-select-content').checkVisibility({checkOpacity:true,checkVisibilityCSS:true})`),false,'Disposed popup must not remain visible');
    assert.equal(await evaluate(`[...document.querySelectorAll('[data-fluid-controls] button,[data-fluid-controls] input,[data-fluid-controls] select')].every(control=>control.disabled)`),true);
    for(let i=0;i<3;i++) {
      await evaluate(`(() => {const previous=window.__testController || window.atlasFilterSpecimen.controller;window.__testController=window.atlasFilterSpecimen.mountFilterControls(document.querySelector('[data-fluid-controls]'));previous.destroy();})()`);
      await waitCurve();assert.equal((await state()).listeners.length,before.listeners.length);
      assert.equal(await evaluate(`document.querySelector('[data-country-trigger]').getAttribute('aria-expanded')`),'false','Remount must not restore a stale open popup');
    }
    const count=await evaluate('window.__filterAudit.commits.length');await click(scopeSelector('startup'));await expectScope('startup',4);
    assert.equal(await evaluate('window.__filterAudit.commits.length')-count,1);await assertSettled();
    await click('[data-country-trigger]');await until(()=>evaluate(`document.querySelector('[data-country-trigger]').getAttribute('aria-expanded')==='true'`),'Remounted Country popup must remain usable');await key('Escape','Escape',27);
    await until(()=>evaluate(`document.activeElement===document.querySelector('[data-country-trigger]')&&document.querySelector('[data-country-trigger]').getAttribute('aria-expanded')==='false'`),'Remounted Country must dismiss and restore focus');
    return {remounts:3,listenersMounted:before.listeners.length,listenersDisposed:destroyed.listeners.length,openPopupClosedOnDisposal:true};
  });

  await check('Independent sibling survives disposal and a late loader cannot resurrect a removed owner', async () => {
    await navigate();await waitCurve();
    await evaluate(`(async () => {
      const text=await (await fetch('/index.html')).text(),parsed=new DOMParser().parseFromString(text,'text/html'),root=parsed.querySelector('[data-fluid-controls]');
      const ids=new Map([...root.querySelectorAll('[id]'),root].filter(element=>element.id).map(element=>[element.id,'sibling-'+element.id]));
      for(const element of [root,...root.querySelectorAll('*')]) {if(element.id)element.id=ids.get(element.id);for(const attribute of ['for','aria-labelledby','aria-describedby','aria-controls'])if(element.hasAttribute(attribute))element.setAttribute(attribute,element.getAttribute(attribute).split(/\\s+/).map(id=>ids.get(id)||id).join(' '));}
      root.dataset.sibling='true';document.querySelector('.study-shell').append(root);window.__sibling=root;window.__siblingController=window.atlasFilterSpecimen.mountFilterControls(root);
      await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);
    })()`);
    await until(()=>evaluate(`window.__siblingController.getMotionState().curve==='linear'`),'Sibling did not load its motion curve');
    await click('[data-sibling] ui-segmented-control-item[value="provider"]');
    await until(()=>evaluate(`(() => {const root=window.__sibling,marker=root.querySelector('ui-segmented-control-indicator').getBoundingClientRect(),selected=root.querySelector('[aria-checked="true"]').getBoundingClientRect();return root.getAnimations({subtree:true}).some(animation=>animation.playState==='running')&&Math.abs(marker.x-selected.x)>1;})()`),'Sibling transition must be visibly active before the other root is destroyed');
    const isolation=await evaluate(`(() => {const root=window.__sibling,marker=root.querySelector('ui-segmented-control-indicator'),before=marker.getBoundingClientRect();const activeBefore=root.getAnimations({subtree:true}).filter(animation=>animation.playState==='running').length;window.atlasFilterSpecimen.controller.destroy();const after=marker.getBoundingClientRect();return {activeBefore,activeAfter:root.getAnimations({subtree:true}).filter(animation=>animation.playState==='running').length,before:before.x,after:after.x,state:window.__siblingController.getState()};})()`);
    assert.ok(isolation.activeBefore>0&&isolation.activeAfter>0);assert.equal(isolation.before,isolation.after);assert.equal(isolation.state.scope,'provider');
    const lifecycle=await evaluate(`(async () => {const root=document.querySelector('[data-fluid-controls]');let finish;const old=window.atlasFilterSpecimen.mountFilterControls(root,{loadCurve:()=>new Promise(resolve=>{finish=resolve;})});await Promise.resolve();const next=window.atlasFilterSpecimen.mountFilterControls(root,{mode:'baseline'});window.__testController=next;old.destroy();finish('linear(0,1)');await Promise.resolve();await Promise.resolve();return {ready:root.dataset.ready,motion:next.getMotionState(),disabled:root.querySelector('[data-query]').disabled};})()`);
    assert.equal(lifecycle.ready,'true');assert.equal(lifecycle.motion.mode,'baseline');assert.equal(lifecycle.disabled,false);
    await evaluate(`window.__siblingController.destroy();window.__sibling.remove()`);await assertNoReplay('Removed sibling and settled replacement');
    return {isolation,deferredReplacement:lifecycle};
  });

  await check('Component CSS preserves unrelated host styles and a 320px root reflows within desktop', async () => {
    await viewport(1440);await navigate('mode=reduced');
    await evaluate(`(() => {const style=document.createElement('style');style.textContent='#host-sentinel{font:17px Georgia;color:rgb(72,36,26);background:rgb(245,235,210);padding:7px;border:2px dotted brown;border-radius:0;outline:2px dashed brown}';document.head.append(style);const host=document.createElement('button');host.id='host-sentinel';host.className='fc-help fc-label';host.textContent='Host control';document.body.prepend(host);document.querySelector('link[href="./controls.css"]').remove();})()`);
    const appearance=`(() => {const e=document.querySelector('#host-sentinel'),s=getComputedStyle(e),r=e.getBoundingClientRect();return {font:s.font,color:s.color,background:s.backgroundColor,padding:s.padding,border:s.border,borderRadius:s.borderRadius,outline:s.outline,width:r.width,height:r.height};})()`;
    const before=await evaluate(appearance);
    await evaluate(`new Promise((resolve,reject)=>{const link=document.createElement('link');link.rel='stylesheet';link.href='./controls.css';link.onload=resolve;link.onerror=reject;document.head.append(link);})`);
    assert.deepEqual(await evaluate(appearance),before);
    await evaluate(`document.querySelector('[data-fluid-controls]').style.width='320px'`);await assertSettled();
    const narrow=await assertBounds('320px embedded root');assert.equal(narrow.viewport,1440);assert.equal(narrow.root.width,320);assert.equal(narrow.columns.split(/\s+/).length,2);
    await click(scopeSelector('provider'));await expectScope('provider',2);await assertSettled();await screenshot('04-embedded-320');
    return {host:before,narrow};
  });

  for(const width of [1440,390,320])for(const theme of ['light','dark'])await check(`${width}px ${theme} layout, control contrast and touch targets`,async()=>{
    await viewport(width,width<500);await preference('no-preference');await navigate('theme='+theme);await waitCurve();
    const bounds=await assertBounds(width+'px '+theme),pairs=await contrast();
    for(const pair of pairs){assert.ok(pair.ratio>=pair.minimum,theme+' '+pair.label+' contrast '+pair.ratio.toFixed(3)+' < '+pair.minimum);if(pair.opacity!==undefined)assert.equal(pair.opacity,1,'Measured placeholder must use the full computed text colour');}
    const point=await centre(scopeSelector('provider'));
    if(width<500){await command('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:point.x,y:point.y,radiusX:2,radiusY:2,force:1}]});await command('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
    else await click(scopeSelector('provider'));
    await expectScope('provider',2);await assertSettled();await assertBounds(width+'px '+theme+' filtered');
    await click('[data-country-trigger]');
    await until(()=>evaluate(`document.querySelector('[data-country-trigger]').getAttribute('aria-expanded')==='true'`),'Responsive Country popup did not open');
    const popup=await evaluate(`(() => {const element=document.querySelector('ui-select-content'),r=element.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom,viewportWidth:innerWidth,viewportHeight:innerHeight};})()`);
    assert.ok(popup.width>0&&popup.height>0&&popup.x>=-1&&popup.y>=-1&&popup.right<=popup.viewportWidth+1&&popup.bottom<=popup.viewportHeight+1,'Country popup must fit the viewport: '+JSON.stringify(popup));
    await key('Escape','Escape',27);await until(()=>evaluate(`document.activeElement===document.querySelector('[data-country-trigger]')&&document.querySelector('[data-country-trigger]').getAttribute('aria-expanded')==='false'`),'Country Escape must close and restore trigger focus');
    await screenshot(`05-${width}-${theme}`);
    report.measurements[width+'-'+theme]={bounds,contrast:pairs,popup};
  });

  await check('Long active-filter labels wrap at 320px and enlarged reading text remains inside the root',async()=>{
    await viewport(320,true);await navigate('mode=reduced');
    await input('An intentionally long search label with several words and averylongunbrokenspecimenlabel');
    await assertBounds('320px long chip');
    await evaluate(`(() => {const root=document.querySelector('[data-fluid-controls]');const sizes=[...root.querySelectorAll('label,ui-segmented-control-item,.fc-name,.fc-description,.fc-kind,.fc-footer,[data-chip-label],button')].map(element=>[element,parseFloat(getComputedStyle(element).fontSize)]);for(const [element,size] of sizes)element.style.fontSize=(size*2)+'px';})()`);
    await assertSettled();await assertBounds('320px enlarged text');
    await screenshot('06-long-label-enlarged-text');
    return {method:'200% font-size fixture on visible reading/control text, not browser zoom or OS text scaling'};
  });

  await check('No JavaScript retains all static records and truthful unavailable controls',async()=>{
    await viewport(390,true);await command('Emulation.setScriptExecutionDisabled',{value:true});const start=report.requests.length;
    try{await navigate('',{ready:false});const reading=await evaluate(`(() => {const root=document.querySelector('[data-fluid-controls]');return {records:[...root.querySelectorAll('[data-record]')].filter(row=>!row.hidden).length,note:root.querySelector('.fc-static-note').checkVisibility(),disabled:[...root.querySelectorAll('button,input,select')].every(control=>control.disabled),ready:root.dataset.ready};})()`);assert.equal(reading.records,8);assert.equal(reading.note,true);assert.equal(reading.disabled,true);assert.equal(reading.ready,'false');assert.equal(report.requests.slice(start).filter(request=>request.url.startsWith('/vendor/')).length,0);await screenshot('07-no-javascript');return reading;}
    finally{await command('Emulation.setScriptExecutionDisabled',{value:false});}
  });

  await check('Unavailable optional vendor preserves usable baseline filtering and honest status',async()=>{
    blockVendor=true;const start=report.requests.length;
    try{await navigate();await waitCurve('unavailable');assert.ok(report.requests.slice(start).some(request=>request.expectedFailure));await click(scopeSelector('startup'));await expectScope('startup',4);const current=await assertSettled();assert.equal(current.motion.allowed,false);assert.match(await evaluate(`document.querySelector('[data-example-status]').textContent`),/unavailable.*baseline/i);await screenshot('08-unavailable-vendor');}
    finally{blockVendor=false;}
  });

  await check('Idle specimen has no perpetual animation or repeated frame scheduling',async()=>{
    await viewport(1440);await navigate();await waitCurve();await click(scopeSelector('partner'));await expectScope('partner',2);await assertSettled();await until(()=>evaluate('window.__filterAudit.pendingFrames.size===0'),'SDK measurement frames did not settle');
    const before=await state();await delay(800);const after=await state();
    assert.equal(after.animations.length,0);assert.equal(after.pendingFrames,0);assert.equal(after.rafCalls,before.rafCalls);assert.deepEqual(after.state,before.state);
    return {sampleMs:800,scheduledFrames:after.rafCalls-before.rafCalls,activeAnimations:0};
  });

  await check('Browser health and self-hosted resources remain clean',async()=>{
    assert.deepEqual(report.exceptions,[]);assert.deepEqual(report.console,[]);
    assert.deepEqual(report.requests.filter(request=>request.status>=400&&!request.expectedFailure),[]);
    const unexpected=report.browserLogs.filter(entry=>!(entry.source==='network'&&entry.url?.startsWith(origin+'/vendor/spring.js')&&/503/.test(entry.text)));
    assert.deepEqual(unexpected,[],'Only the deliberately blocked vendor may produce a browser network error');
    const resources=await evaluate(`performance.getEntriesByType('resource').map(entry=>entry.name)`);
    assert.ok(resources.every(url=>new URL(url).origin===origin),'Specimen resources must be local');
    return {exceptions:0,consoleWarningsOrErrors:0,expectedVendorFailures:report.requests.filter(request=>request.expectedFailure).length};
  });
  report.status=report.coverageGaps.length?'passed-with-gaps':'passed';console.log(`Fluid filter acceptance ${report.status} (${report.checks.length} checks).`);
} catch(error) {
  report.status='failed';report.failure=error.stack||error.message;report.chromeLog=chromeLog;
  if(evaluate)report.diagnostics=await state().catch(()=>({unavailable:true}));
  if(command)await screenshot('failure').catch(()=>{});
  console.error(error.stack||error);process.exitCode=1;
} finally {
  await mkdir(outputDir,{recursive:true}).catch(()=>{});
  await writeFile(join(outputDir,'fluid-filter-controls-report.json'),JSON.stringify(report,null,2)+'\n').catch(error=>console.error('Could not write browser report:',error.message));
  for(const item of pending.values()){clearTimeout(item.timer);item.reject(new Error('Acceptance harness finished'));}pending.clear();socket?.close();
  if(chrome&&chrome.exitCode===null&&chrome.signalCode===null){chrome.kill('SIGTERM');await Promise.race([new Promise(resolveExit=>chrome.once('exit',resolveExit)),delay(1000)]);if(chrome.exitCode===null&&chrome.signalCode===null)chrome.kill('SIGKILL');}
  server?.closeAllConnections();server?.close();
  if(profile)await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100}).catch(()=>{});
  if(workspace)await rm(workspace,{recursive:true,force:true,maxRetries:5,retryDelay:100}).catch(()=>{});
}
