import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const directory = dirname(fileURLToPath(import.meta.url));
const repository = resolve(directory, '../..');
const bundle = resolve(repository, 'web/assets/design-lab/fluid-signal-adapter/adapter.js');
const output = process.env.ATLAS_FLUID_REPORT || resolve(repository, '../fluid-signal-native-report.json');
const executable = process.env.CHROME_BIN || '/usr/bin/chromium';
const report = {
  sourceRevision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repository, encoding: 'utf8' }).trim(),
  bundleSha256: createHash('sha256').update(await readFile(bundle)).digest('hex'),
  startedAt: new Date().toISOString(),
  executable, nodeVersion: process.version, phase: 'runtime-check', checks: [], gaps: [], exceptions: [], requests: [],
  scope: 'Isolated native adapter fixture. No production route, Hardware, React, filter or inspector specimen acceptance.',
};
let server, chrome, socket, profile, command, evaluate, chromeFailure, chromeLog = '';
const pending = new Map();
let serial = 0;

async function until(fn, message, timeout = 6000) {
  const deadline = Date.now() + timeout;
  let lastError;
  do {
    if (chromeFailure) throw new Error(`${chromeFailure}\n${chromeLog}`);
    try { const value = await fn(); if (value) return value; } catch (error) { lastError = error; }
    await delay(40);
  } while (Date.now() < deadline);
  throw new Error(message + (lastError ? `: ${lastError.message}` : ''));
}

async function check(name, run) {
  const start = Date.now();
  try {
    const detail = await run();
    report.checks.push({ name, result: 'passed', milliseconds: Date.now() - start, detail });
    console.log(`PASS ${name}`);
  } catch (error) {
    report.checks.push({ name, result: 'failed', message: error.message });
    throw error;
  }
}

function connect(url) {
  return new Promise((resolveConnection, reject) => {
    socket = new WebSocket(url);
    const timer = setTimeout(() => reject(new Error('CDP connection timed out')), 8000);
    socket.addEventListener('open', () => { clearTimeout(timer); resolveConnection(); }, { once: true });
    socket.addEventListener('error', event => { clearTimeout(timer); reject(new Error(String(event))); }, { once: true });
    socket.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (message.method === 'Runtime.exceptionThrown') report.exceptions.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
      if (!message.id) return;
      const item = pending.get(message.id);
      if (!item) return;
      pending.delete(message.id);
      clearTimeout(item.timer);
      if (message.error) item.reject(new Error(message.error.message)); else item.resolve(message.result);
    });
    socket.addEventListener('close', () => {
      for (const item of pending.values()) { clearTimeout(item.timer); item.reject(new Error('CDP connection closed')); }
      pending.clear();
    });
  });
}

try {
  if (Number(process.versions.node.split('.')[0]) < 22 || typeof WebSocket !== 'function') {
    throw new Error('The native harness requires Node 22 or newer with its built-in WebSocket. The adapter itself supports Node 20 imports.');
  }
  report.phase = 'server-setup';
  const routes = new Map([
    ['/', [resolve(directory, 'fixtures/native.html'), 'text/html']],
    ['/fixture.js', [resolve(directory, 'fixtures/native.js'), 'text/javascript']],
    ['/adapter.js', [bundle, 'text/javascript']],
    ['/tokens.css', [resolve(repository, 'web/assets/design-lab/fluid-signal-adapter/tokens.css'), 'text/css']],
    ['/design-tokens.css', [resolve(repository, 'web/design-tokens.css'), 'text/css']],
    ['/assets/fonts/geist-sans-variable.woff2', [resolve(repository, 'web/assets/fonts/geist-sans-variable.woff2'), 'font/woff2']],
    ['/assets/fonts/geist-mono-variable.woff2', [resolve(repository, 'web/assets/fonts/geist-mono-variable.woff2'), 'font/woff2']],
  ]);
  server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost');
    if (url.pathname === '/away') { response.writeHead(200, { 'Content-Type': 'text/html' }).end('<!doctype html><title>Native navigation target</title><p>Navigation completed.</p>'); return; }
    if (url.pathname === '/adapter.js' && url.searchParams.has('failure')) { response.writeHead(503).end('Expected fixture runtime failure.'); return; }
    const route = routes.get(url.pathname);
    if (!route) { response.writeHead(404).end(); return; }
    try {
      const bytes = await readFile(route[0]);
      report.requests.push({ path: url.pathname, bytes: bytes.length });
      response.writeHead(200, { 'Content-Type': route[1], 'Cache-Control': 'no-store' }).end(bytes);
    } catch (error) { response.writeHead(500).end(String(error)); }
  });
  await new Promise((resolveListen, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolveListen));
  const origin = `http://127.0.0.1:${server.address().port}`;
  profile = await mkdtemp(join(tmpdir(), 'atlas-fluid-native-'));
  report.phase = 'browser-launch';
  chrome = spawn(executable, [
    '--headless=new', '--disable-gpu', '--disable-dev-shm-usage', '--disable-background-networking',
    '--disable-extensions', '--no-first-run', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  chrome.once('error', error => { chromeFailure = error.message; });
  chrome.once('exit', (code, signal) => { chromeFailure = `Chromium exited (${code ?? signal})`; });
  chrome.stderr.on('data', chunk => { chromeLog = (chromeLog + chunk).slice(-8000); });
  const port = await until(async () => Number((await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]), 'Chromium did not start', 12000);
  report.phase = 'browser-connect';
  const target = await until(async () => (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(item => item.type === 'page'), 'No page target');
  await connect(target.webSocketDebuggerUrl);
  command = (method, params = {}) => new Promise((resolveCommand, reject) => {
    const id = ++serial;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timed out`)); }, 8000);
    pending.set(id, { resolve: resolveCommand, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
  evaluate = async expression => {
    const result = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  report.browser = await command('Browser.getVersion');
  await command('Page.enable');
  await command('Runtime.enable');
  await command('Network.enable');
  await command('Emulation.setDeviceMetricsOverride', { width: 1280, height: 960, deviceScaleFactor: 1, mobile: false });
  const preference = value => command('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value }] });
  const navigate = async (query = '') => {
    await command('Page.navigate', { url: origin + '/' + query });
    await until(() => evaluate("document.readyState === 'complete' && !!window.fixture && fixture.importStatus !== 'loading'"), 'Fixture did not initialize');
  };
  const key = async (key, code, value) => {
    const character = key === 'Enter' ? { text: '\r', unmodifiedText: '\r' } : {};
    await command('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: value, nativeVirtualKeyCode: value, ...character });
    await command('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: value, nativeVirtualKeyCode: value });
  };
  await preference('no-preference');
  await navigate();
  report.phase = 'acceptance';

  await check('Native WAAPI and CSS linear use canonical Signal durations', async () => {
    const result = await evaluate(`(() => {
      const root = fixture.roots.a;
      const fast = fixture.module.getSignalMotionProfile(root, 'feedback');
      const normal = fixture.module.getSignalMotionProfile(root, 'context');
      const started = fixture.commit('a', 200);
      const animation = fixture.layers.a.getAnimations()[0];
      animation.pause(); animation.currentTime = 80;
      return {fast: fast.duration, normal: normal.duration, curve: normal.curve, nativeLinear: CSS.supports('animation-timing-function','linear(0, 1)'), started, timing: animation.effect.getTiming().duration, transform: getComputedStyle(fixture.layers.a).transform, left: fixture.layers.a.style.left, state: fixture.state.a};
    })()`);
    assert.equal(result.fast, 140); assert.equal(result.normal, 240);
    assert.equal(result.nativeLinear, true); assert.equal(result.curve, 'fluid-firm');
    assert.equal(result.started.animated, true); assert.equal(result.timing, 240);
    assert.notEqual(result.transform, 'none'); assert.equal(result.left, '200px'); assert.equal(result.state.left, 200);
    return result;
  });

  await check('Rapid interruption preserves rendered position and latest host layout', async () => {
    const result = await evaluate(`(() => {
      fixture.reset('a'); fixture.commit('a', 220);
      const old = fixture.layers.a.getAnimations()[0]; old.pause(); old.currentTime = 100;
      const before = fixture.layers.a.getBoundingClientRect().x;
      fixture.commit('a', 80);
      const next = fixture.layers.a.getAnimations()[0]; next.pause(); next.currentTime = 0;
      const after = fixture.layers.a.getBoundingClientRect().x;
      const count = fixture.owners.a.inspect().activeAnimations;
      next.finish();
      return {before, after, delta: Math.abs(before-after), count, oldState: old.playState, canonicalLeft: fixture.layers.a.style.left, host: fixture.state.a};
    })()`);
    assert.ok(result.delta < .1, JSON.stringify(result)); assert.equal(result.count, 1);
    assert.equal(result.oldState, 'idle'); assert.equal(result.canonicalLeft, '80px'); assert.equal(result.host.left, 80);
    await until(() => evaluate('fixture.owners.a.inspect().activeAnimations === 0 && fixture.layers.a.getAnimations().length === 0'), 'Finished effect was not released');
    return result;
  });

  await check('Forced no-linear capability branch uses native Signal cubic fallback', async () => {
    const result = await evaluate(`(() => {
      const original = CSS.supports;
      CSS.supports = (property, value) => String(value).startsWith('linear(') ? false : original.call(CSS, property, value);
      try {
        fixture.reset('a'); const profile = fixture.module.getSignalMotionProfile(fixture.roots.a, 'feedback');
        fixture.commit('a', 200, 'feedback');
        const animation = fixture.layers.a.getAnimations()[0]; animation.pause(); animation.currentTime = 70;
        const result = {curve: profile.curve, duration: animation.effect.getTiming().duration, easing: animation.effect.getTiming().easing, transform: getComputedStyle(fixture.layers.a).transform};
        fixture.owners.a.settle(); return result;
      } finally { CSS.supports = original; }
    })()`);
    assert.equal(result.curve, 'signal-fallback'); assert.equal(result.duration, 140);
    assert.equal(result.easing, 'cubic-bezier(0.2, 0.8, 0.2, 1)'); assert.notEqual(result.transform, 'none');
    return {...result, limitation: 'Capability detection was forced; native cubic rendering is real, an older CSS engine was not tested.'};
  });

  await check('Live native media preference cancels both instances and does not replay', async () => {
    await evaluate("for (const name of ['a','b']) {fixture.reset(name); fixture.commit(name, 200); fixture.layers[name].getAnimations()[0].pause();}");
    await preference('reduce');
    await until(() => evaluate("['a','b'].every(name => fixture.owners[name].inspect().reducedMotion && fixture.owners[name].inspect().activeAnimations === 0 && fixture.layers[name].getAnimations().length === 0)"), 'Live reduced motion did not settle both owners');
    const reduced = await evaluate("({duration:fixture.module.getSignalMotionProfile(fixture.roots.a).duration, token:getComputedStyle(fixture.roots.a).getPropertyValue('--atlas-duration-normal'), result:fixture.commit('a',80), state:fixture.state.a})");
    assert.equal(reduced.duration, 0); assert.equal(reduced.token.trim(), '0ms'); assert.equal(reduced.result.animated, false); assert.equal(reduced.state.left, 80);
    await preference('no-preference');
    await until(() => evaluate('!fixture.owners.a.inspect().reducedMotion'), 'Preference restoration did not arrive');
    assert.equal(await evaluate('fixture.owners.a.inspect().activeAnimations + fixture.owners.b.inspect().activeAnimations'), 0);
    return reduced;
  });

  await check('Independent teardown and remount preserve sibling and foreign native animation', async () => {
    const result = await evaluate(`(() => {
      window.foreignAnimation = document.querySelector('#foreign').animate([{transform:'none'},{transform:'translateX(100px)'}], {duration:10000}); foreignAnimation.pause();
      for (const name of ['a','b']) {fixture.reset(name); fixture.commit(name,200); fixture.layers[name].getAnimations()[0].pause();}
      const old = fixture.owners.a; old.destroy(); fixture.mount('a'); old.destroy();
      return {old:old.inspect(), next:fixture.owners.a.inspect(), sibling:fixture.owners.b.inspect(), foreign:foreignAnimation.playState, siblingNative:fixture.layers.b.getAnimations().length};
    })()`);
    assert.equal(result.old.disposed, true); assert.equal(result.next.disposed, false);
    assert.equal(result.old.activeAnimations, 0); assert.equal(result.next.activeAnimations, 0);
    assert.equal(result.sibling.activeAnimations, 1); assert.equal(result.siblingNative, 1); assert.equal(result.foreign, 'paused');
    await evaluate('fixture.owners.b.settle(); foreignAnimation.cancel();');
    return result;
  });

  await check('Scoped token aliases preserve host styles and zero duration overrides', async () => {
    const result = await evaluate(`(async () => {
      const sentinel = document.querySelector('#sentinel');
      const snapshot = () => {const s=getComputedStyle(sentinel),r=sentinel.getBoundingClientRect();return {font:s.fontFamily,color:s.color,padding:s.padding,border:s.border,width:r.width,height:r.height,fluid:s.getPropertyValue('--fluid-accent')};};
      const before=snapshot(); const css=document.createElement('link');css.rel='stylesheet';css.href='/tokens.css';
      await new Promise((resolve,reject)=>{css.onload=resolve;css.onerror=reject;document.head.append(css)});
      const after=snapshot(), root=getComputedStyle(fixture.roots.a);
      fixture.roots.a.style.setProperty('--atlas-duration-fast','0ms'); fixture.reset('a'); const zero=fixture.commit('a',200,'feedback');
      fixture.roots.a.style.removeProperty('--atlas-duration-fast');
      return {before,after,accent:root.getPropertyValue('--fluid-accent').trim(),canonical:root.getPropertyValue('--atlas-action').trim(),zero};
    })()`);
    assert.deepEqual(result.after, result.before); assert.equal(result.accent, result.canonical); assert.equal(result.zero.animated, false); assert.equal(result.zero.reason, 'zero-duration');
    return result;
  });

  await check('Trusted keyboard activation preserves focus URL and immediate semantic state', async () => {
    await evaluate("fixture.reset('a');fixture.reset('b');document.querySelector('#trigger-a').focus();");
    const url = await evaluate('location.href');
    await key('Tab', 'Tab', 9);
    assert.equal(await evaluate('document.activeElement.id'), 'trigger-b');
    await key('Enter', 'Enter', 13);
    const result = await evaluate("({url:location.href,focus:document.activeElement.id,outline:getComputedStyle(document.activeElement).outlineWidth,pressed:document.activeElement.getAttribute('aria-pressed'),a:fixture.state.a,b:fixture.state.b,event:fixture.events.at(-1)})");
    assert.equal(result.url, url); assert.equal(result.focus, 'trigger-b'); assert.equal(result.outline, '3px');
    assert.equal(result.pressed, 'true'); assert.equal(result.a.changes, 0); assert.equal(result.b.left, 200); assert.equal(result.event.trusted, true);
    return result;
  });

  await check('Actual background target attempt reports visibility truthfully', async () => {
    await evaluate("fixture.reset('a');fixture.commit('a',200);fixture.layers.a.getAnimations()[0].pause();");
    const other = await command('Target.createTarget', { url: origin + '/away', background: false });
    await command('Target.activateTarget', { targetId: other.targetId });
    await delay(150);
    const result = await evaluate('({hidden:document.hidden,state:document.visibilityState,active:fixture.owners.a.inspect().activeAnimations})');
    await command('Target.closeTarget', { targetId: other.targetId });
    await command('Page.bringToFront');
    if (result.hidden) assert.equal(result.active, 0);
    else report.gaps.push('Headless target activation did not make the original document hidden; genuine background-tab acceptance remains pending.');
    await evaluate('fixture.owners.a.settle()');
    return {...result, nativeHiddenVerified: result.hidden};
  });

  await check('Synthetic visibility event cancels native effects without claiming hidden-tab acceptance', async () => {
    const result = await evaluate(`(() => {
      fixture.reset('a'); fixture.commit('a',200); fixture.layers.a.getAnimations()[0].pause();
      Object.defineProperty(document,'hidden',{configurable:true,value:true}); document.dispatchEvent(new Event('visibilitychange'));
      const hidden=fixture.owners.a.inspect(); delete document.hidden; document.dispatchEvent(new Event('visibilitychange'));
      return {hidden,visible:fixture.owners.a.inspect(),native:fixture.layers.a.getAnimations().length};
    })()`);
    assert.equal(result.hidden.activeAnimations, 0); assert.equal(result.visible.activeAnimations, 0); assert.equal(result.native, 0);
    return {...result, trigger: 'Synthetic visibility; native WAAPI effect cleanup only.'};
  });

  await check('Trusted page navigation releases active effects', async () => {
    await evaluate("fixture.reset('a');fixture.commit('a',200);fixture.layers.a.getAnimations()[0].pause();sessionStorage.removeItem('fluid-pagehide');");
    await command('Page.navigate', { url: origin + '/away' });
    const result = await until(() => evaluate("location.pathname === '/away' && JSON.parse(sessionStorage.getItem('fluid-pagehide'))"), 'Actual pagehide receipt missing');
    assert.equal(result.trusted, true); assert.deepEqual(result.active, [0,0]);
    return {...result, limitation: 'Navigation tested; persisted BFCache restoration was not forced.'};
  });

  await check('Unavailable adapter leaves native host action usable', async () => {
    await navigate('?failure=1');
    assert.equal(await evaluate('fixture.importStatus'), 'unavailable');
    await evaluate("document.querySelector('#trigger-a').focus()");
    await key('Enter','Enter',13);
    const result = await evaluate("({state:fixture.state.a,pressed:document.querySelector('#trigger-a').getAttribute('aria-pressed'),focus:document.activeElement.id,text:document.querySelector('#content-a').textContent,animations:document.getAnimations().length})");
    assert.equal(result.state.left, 200); assert.equal(result.pressed,'true'); assert.equal(result.focus,'trigger-a'); assert.equal(result.animations,0); assert.match(result.text,/current state/);
    return result;
  });

  await check('No-JavaScript content and narrow layout remain readable', async () => {
    await command('Emulation.setDeviceMetricsOverride',{width:320,height:844,deviceScaleFactor:1,mobile:false});
    await command('Emulation.setScriptExecutionDisabled',{value:true});
    await command('Page.navigate',{url:origin+'/?nojs=1'});
    await until(()=>evaluate("document.readyState === 'complete' && document.querySelector('#content-a')"),'No-JavaScript fixture did not load');
    const result=await evaluate(`(() => ({fixtureAbsent:typeof fixture === 'undefined',width:innerWidth,scrollWidth:document.documentElement.scrollWidth,links:document.querySelectorAll('a[href]').length,text:document.querySelector('#content-a').textContent,opacity:getComputedStyle(document.querySelector('#content-a')).opacity,controls:[...document.querySelectorAll('button')].map(button=>({text:button.textContent,disabled:button.disabled}))}))()`);
    assert.equal(result.fixtureAbsent,true); assert.ok(result.scrollWidth<=result.width); assert.ok(result.links>0); assert.equal(result.opacity,'1'); assert.equal(result.controls.length,2); assert.ok(result.controls.every(control=>control.text && !control.disabled));
    return {...result,limitation:'Readable baseline and native controls inspected; no-JavaScript application filtering is not implemented by this fixture.'};
  });
  assert.deepEqual(report.exceptions,[]);
  report.status='passed';
} catch (error) {
  report.status = report.checks.length || report.browser ? 'failed' : 'blocked';
  report.error = error.message;
  if (report.status === 'blocked') report.gaps.push(`Native setup did not complete during ${report.phase}. No sandbox disabling, permission change or alternative browser was attempted. All native acceptance checks remain unexecuted.`);
  process.exitCode = report.status === 'failed' ? 1 : 2;
  console.error(`${report.status.toUpperCase()}: ${error.message}`);
} finally {
  socket?.close();
  if (chrome && chrome.exitCode === null) chrome.kill('SIGTERM');
  if (server?.listening) await new Promise(resolveClose=>server.close(resolveClose));
  if (profile) await rm(profile,{recursive:true,force:true});
  report.finishedAt=new Date().toISOString();
  await writeFile(output,JSON.stringify(report,null,2)+'\n');
  console.log(`Native adapter report: ${output}`);
}
