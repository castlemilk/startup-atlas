import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { JSDOM } from 'jsdom';
import { mountMotionPilot } from '../web/assets/design-lab/signal-motion-pilot/motion.js';

const pageURL = new URL('../web/assets/design-lab/signal-motion-pilot/index.html', import.meta.url);
const html = readFileSync(pageURL, 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));

test('vendored runtime and reused artwork match recorded provenance', () => {
  const manifestURL = new URL('./vendor/manifest.json', pageURL);
  const manifest = JSON.parse(readFileSync(manifestURL, 'utf8'));
  assert.equal(manifest.package, 'gsap');
  assert.equal(manifest.version, '3.15.1');
  assert.equal(manifest.files.length, 2);
  for (const file of manifest.files) {
    const bytes = readFileSync(new URL(file.file, manifestURL));
    assert.equal(bytes.length, file.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256);
    assert.match(bytes.subarray(0, 250).toString(), /@license Copyright 2026, GreenSock/);
  }
  const provenance = JSON.parse(readFileSync(new URL('./artwork-provenance.json', pageURL), 'utf8'));
  assert.equal(provenance.artwork.length, 3);
  for (const artwork of provenance.artwork) {
    const bytes = readFileSync(new URL(artwork.file, pageURL));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), artwork.sha256);
  }
});

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function fixture(t, { reduced = false, width = 1200, resize = true } = {}) {
  const dom = new JSDOM(html, {
    url: 'https://example.test/startup-atlas/assets/design-lab/signal-motion-pilot/index.html',
    pretendToBeVisual: true,
  });
  t.after(() => dom.window.close());
  const { window } = dom;
  const listeners = new Set();
  const preference = {
    matches: reduced,
    addEventListener(type, listener) { if (type === 'change') listeners.add(listener); },
    removeEventListener(type, listener) { if (type === 'change') listeners.delete(listener); },
    set(value) {
      this.matches = value;
      for (const listener of [...listeners]) listener({ matches: value });
    },
  };
  window.matchMedia = query => query === '(prefers-reduced-motion: reduce)'
    ? preference : { matches: query === '(max-width: 640px)' && window.innerWidth <= 640 };
  const visibilityListeners = new Set();
  const addListener = window.document.addEventListener.bind(window.document);
  const removeListener = window.document.removeEventListener.bind(window.document);
  window.document.addEventListener = (type, listener, ...options) => {
    if (type === 'visibilitychange') visibilityListeners.add(listener);
    addListener(type, listener, ...options);
  };
  window.document.removeEventListener = (type, listener, ...options) => {
    if (type === 'visibilitychange') visibilityListeners.delete(listener);
    removeListener(type, listener, ...options);
  };
  const observers = [];
  window.IntersectionObserver = class {
    constructor(callback) { this.callback = callback; this.connected = false; observers.push(this); }
    observe(target) { this.target = target; this.connected = true; }
    disconnect() { this.connected = false; }
    leave() { this.callback([{ target: this.target, isIntersecting: false }]); }
  };
  const resizeObservers = [];
  if (resize) window.ResizeObserver = class {
    constructor(callback) { this.callback = callback; this.connected = false; resizeObservers.push(this); }
    observe(target) { this.target = target; this.connected = true; }
    disconnect() { this.connected = false; }
    deliver(width) { this.callback([{ target: this.target, contentRect: { width } }]); }
  };
  const root = window.document.querySelector('[data-motion-pilot]');
  const view = { window, preference, listeners, visibilityListeners, observers, resizeObservers };
  return { ...view, ...instance(view, root, width) };
}

function instance(view, root, width) {
  const { window, resizeObservers } = view;
  root.getBoundingClientRect = () => ({ width, height: 1200, top: 0, bottom: 1200, left: 0, right: width });
  root.querySelector('[data-motion-stage]').getBoundingClientRect = () => ({ width: 640, height: 500, top: 20, bottom: 520, left: 0, right: 640 });
  const still = root.querySelector('[data-motion-still]');
  const replay = root.querySelector('[data-motion-replay]');
  return {
    root, still, replay,
    setStill(value) {
      still.checked = value;
      still.dispatchEvent(new window.Event('change', { bubbles: true }));
    },
    setWidth(value) {
      width = value;
      resizeObservers.filter(observer => observer.connected && observer.target === root).forEach(observer => observer.deliver(value));
    },
  };
}

function sibling(view, prefix, width = 1200) {
  const root = view.root.cloneNode(true);
  // This fixture represents host-authored unique IDs, before enhancement. The
  // runtime never rewrites IDs or owns document-wide label/ARIA references.
  const ids = new Map();
  for (const element of [root, ...root.querySelectorAll('[id]')]) {
    if (element.id) { ids.set(element.id, prefix + '-' + element.id); element.id = ids.get(element.id); }
  }
  for (const element of root.querySelectorAll('[aria-labelledby],[aria-describedby]')) {
    for (const attribute of ['aria-labelledby', 'aria-describedby']) {
      if (element.hasAttribute(attribute)) element.setAttribute(attribute, element.getAttribute(attribute).split(/\s+/).map(id => ids.get(id) || id).join(' '));
    }
  }
  for (const link of root.querySelectorAll('a[href^="#"]')) {
    const id = link.getAttribute('href').slice(1);
    if (ids.has(id)) link.setAttribute('href', '#' + ids.get(id));
  }
  view.window.document.body.append(root);
  return instance(view, root, width);
}

// This double exercises ownership and cancellation. The browser suite verifies
// animation and media-query behaviour against the real self-hosted GSAP files.
function runtimeDouble({ fallbackCompact = false } = {}) {
  const state = { mounts: 0, reverts: 0, restarts: 0, settlements: 0, owners: [], active: new Set(), triggers: new Set() };
  let scope;
  const gsap = {
    matchMedia() {
      state.mounts++;
      const owner = { timelines: [], targets: [], triggers: [], restarts: 0, cleanup: undefined, reverted: false };
      state.active.add(owner);
      state.owners.push(owner);
      return {
        add(conditions, handler, root) {
          assert.ok(root?.matches('[data-motion-pilot]'), 'GSAP must receive the explicit pilot root as its scope');
          owner.root = root;
          owner.conditions = conditions;
          scope = owner;
          owner.cleanup = handler({ conditions: { allowed: true, compact: fallbackCompact } });
          scope = undefined;
        },
        revert() {
          if (owner.reverted) return;
          owner.reverted = true;
          state.reverts++;
          state.active.delete(owner);
          owner.triggers.forEach(trigger => state.triggers.delete(trigger));
          owner.cleanup?.();
        },
      };
    },
    timeline() {
      const owner = scope;
      const timeline = {
        fromTo(target, from, to, position) {
          assert.equal(target.closest('[data-motion-pilot]'), owner.root, 'Every animated layer must belong to this owner');
          owner.targets.push({ target, from, to, position });
          return this;
        },
        restart() {
          assert.equal(owner.reverted, false, 'a reverted owner must never restart');
          state.restarts++;
          owner.restarts++;
          return this;
        },
        pause() { return this; },
        progress(value) { if (value === 1) state.settlements++; return this; },
      };
      owner.timelines.push(timeline);
      return timeline;
    },
  };
  const ScrollTrigger = {
    create(options) {
      assert.equal(options.trigger.closest('[data-motion-pilot]'), scope.root, 'A trigger must belong to its scoped root');
      scope.triggers.push(options);
      state.triggers.add(options);
      return options;
    },
  };
  return { gsap, ScrollTrigger, state };
}

function researchContent(root) {
  return [...root.querySelectorAll('h1,h2,h3,p:not([data-motion-status]),dt,dd,a[data-source-view]')]
    .map(element => ({ tag: element.tagName, text: element.textContent, href: element.getAttribute('href') }));
}

test('initial reduced motion keeps the complete page available without requesting the runtime', async t => {
  const view = fixture(t, { reduced: true });
  const before = researchContent(view.root);
  let requests = 0;
  const destroy = mountMotionPilot(view.root, { loadRuntime() { requests++; return runtimeDouble(); } });
  t.after(destroy);
  await flush();

  assert.equal(requests, 0);
  assert.equal(view.root.dataset.motionState, 'reduced');
  assert.equal(view.replay.disabled, true);
  assert.equal(view.still.disabled, true);
  assert.deepEqual(researchContent(view.root), before);
  assert.equal(view.root.querySelectorAll('a[data-source-view]').length, 3);
});

test('keeping the artwork still while loading prevents a late runtime from mounting', async t => {
  const view = fixture(t);
  const pending = deferred();
  const runtime = runtimeDouble();
  let requests = 0;
  const destroy = mountMotionPilot(view.root, { loadRuntime() { requests++; return pending.promise; } });
  t.after(destroy);
  await flush();
  assert.equal(requests, 1);

  view.setStill(true);
  pending.resolve(runtime);
  await flush();
  assert.equal(runtime.state.mounts, 0);
  assert.equal(runtime.state.restarts, 0);
  assert.equal(view.root.dataset.motionState, 'static');
  assert.equal(view.replay.disabled, true);

  view.setStill(false);
  await flush();
  assert.equal(requests, 1, 'the already loaded runtime can be reused');
  assert.equal(runtime.state.active.size, 1);
  assert.equal(view.replay.disabled, false);
});

test('destroying a pending owner prevents late setup and removes its listeners and observer', async t => {
  const view = fixture(t);
  const pending = deferred();
  const runtime = runtimeDouble();
  const destroy = mountMotionPilot(view.root, { loadRuntime: () => pending.promise });
  await flush();
  assert.equal(view.listeners.size, 1);
  destroy();
  destroy();
  pending.resolve(runtime);
  await flush();

  assert.equal(runtime.state.mounts, 0);
  assert.equal(view.listeners.size, 0);
  assert.ok(view.observers.every(observer => !observer.connected));
  assert.equal(view.root.dataset.motionState, 'destroyed');
  assert.equal(view.root.hasAttribute('data-motion-mounted'), false);
  assert.equal(view.replay.disabled, true);
  assert.equal(view.still.disabled, true);
});

test('remounting the same root disposes the old owner without disposing the replacement', async t => {
  const view = fixture(t);
  const runtime = runtimeDouble();
  const loadRuntime = () => runtime;
  const first = mountMotionPilot(view.root, { loadRuntime });
  await flush();
  const second = mountMotionPilot(view.root, { loadRuntime });
  t.after(second);
  await flush();

  assert.equal(runtime.state.reverts, 1);
  assert.equal(runtime.state.active.size, 1);
  assert.equal(runtime.state.triggers.size, 1);
  assert.equal(view.listeners.size, 1);
  assert.equal(view.observers.filter(observer => observer.connected).length, 1);
  first();
  view.replay.click();
  assert.equal(runtime.state.restarts, 1, 'only the replacement owns Replay');
  assert.equal(runtime.state.active.size, 1);

  second();
  assert.equal(runtime.state.active.size, 0);
  assert.equal(runtime.state.triggers.size, 0);
  assert.equal(view.listeners.size, 0);
});

test('manual still and a live reduced-motion change cancel the local owner without removing research content', async t => {
  const view = fixture(t);
  const runtime = runtimeDouble();
  const before = researchContent(view.root);
  const destroy = mountMotionPilot(view.root, { loadRuntime: () => runtime });
  t.after(destroy);
  await flush();
  view.replay.click();
  assert.equal(runtime.state.restarts, 1);

  view.setStill(true);
  assert.equal(runtime.state.active.size, 0);
  assert.equal(runtime.state.triggers.size, 0);
  assert.equal(view.root.dataset.motionState, 'static');
  view.replay.click();
  assert.equal(runtime.state.restarts, 1);

  view.setStill(false);
  view.preference.set(true);
  assert.equal(runtime.state.active.size, 0);
  assert.equal(view.root.dataset.motionState, 'reduced');
  assert.equal(view.replay.disabled, true);
  view.preference.set(false);
  assert.equal(runtime.state.active.size, 1);
  assert.equal(view.still.disabled, false);
  assert.deepEqual(researchContent(view.root), before);
});

test('offscreen and hidden-page signals settle motion, while explicit replay respects visibility', async t => {
  const view = fixture(t);
  const runtime = runtimeDouble();
  const destroy = mountMotionPilot(view.root, { loadRuntime: () => runtime });
  t.after(destroy);
  await flush();
  view.replay.click();
  view.observers[0].leave();
  assert.equal(runtime.state.settlements, 1);

  Object.defineProperty(view.window.document, 'hidden', { configurable: true, value: true });
  view.window.document.dispatchEvent(new view.window.Event('visibilitychange'));
  view.replay.click();
  assert.equal(runtime.state.settlements, 2);
  assert.equal(runtime.state.restarts, 1, 'a hidden page cannot replay');

  Object.defineProperty(view.window.document, 'hidden', { configurable: true, value: false });
  view.window.document.dispatchEvent(new view.window.Event('visibilitychange'));
  assert.equal(runtime.state.restarts, 1, 'returning to the tab does not force a replay');
});

test('runtime failure preserves semantic content and working research destinations', async t => {
  const view = fixture(t);
  const before = researchContent(view.root);
  const destinations = [...view.root.querySelectorAll('a[data-source-view]')].map(link => link.href);
  const destroy = mountMotionPilot(view.root, { loadRuntime: () => Promise.reject(new Error('blocked request')) });
  t.after(destroy);
  await flush();

  assert.equal(view.root.dataset.motionState, 'unavailable');
  assert.equal(view.replay.disabled, true);
  assert.deepEqual(researchContent(view.root), before);
  assert.deepEqual([...view.root.querySelectorAll('a[data-source-view]')].map(link => link.href), destinations);
  assert.equal(view.root.querySelectorAll('h1').length, 1);
  assert.equal(view.root.querySelectorAll('h2').length, 2);
  assert.equal(view.root.querySelector('figure figcaption').textContent.includes('Index, Partition and Junction'), true);
});

test('two embedded roots share a runtime without sharing animation or cleanup ownership', async t => {
  const first = fixture(t);
  const second = sibling(first, 'second', 360);
  const runtime = runtimeDouble();
  const firstContent = researchContent(first.root), secondContent = researchContent(second.root);
  const destroyFirst = mountMotionPilot(first.root, { loadRuntime: () => runtime });
  const destroySecond = mountMotionPilot(second.root, { loadRuntime: () => runtime });
  t.after(destroyFirst); t.after(destroySecond);
  await flush();
  const [firstOwner, secondOwner] = runtime.state.owners;
  assert.deepEqual(runtime.state.owners.map(owner => owner.root), [first.root, second.root]);
  assert.ok(runtime.state.owners.every(owner => owner.targets.length === 3));
  assert.equal(runtime.state.active.size, 2);
  assert.equal(first.listeners.size, 2);
  assert.equal(first.visibilityListeners.size, 2);

  first.replay.click(); second.replay.click();
  assert.equal(firstOwner.restarts, 1); assert.equal(secondOwner.restarts, 1);
  destroyFirst();
  assert.equal(firstOwner.reverted, true);
  assert.equal(secondOwner.reverted, false);
  assert.equal(runtime.state.active.size, 1);
  assert.equal(second.replay.disabled, false);
  assert.equal(first.root.querySelector('[data-motion-status]').textContent, 'Static artwork. All content and research links remain available.');

  const replacement = mountMotionPilot(first.root, { loadRuntime: () => runtime });
  t.after(replacement);
  await flush();
  destroyFirst();
  second.replay.click();
  assert.equal(secondOwner.restarts, 2, 'Destroying or remounting its sibling must not steal Replay');
  assert.equal(runtime.state.active.size, 2);
  assert.equal(first.listeners.size, 2);
  assert.equal(first.visibilityListeners.size, 2);
  assert.deepEqual(researchContent(first.root), firstContent);
  assert.deepEqual(researchContent(second.root), secondContent);

  replacement(); destroySecond();
  assert.equal(runtime.state.active.size, 0);
  assert.equal(runtime.state.triggers.size, 0);
  assert.equal(first.listeners.size, 0);
  assert.equal(first.visibilityListeners.size, 0);
  assert.ok([...first.observers, ...first.resizeObservers].every(observer => !observer.connected));
});

test('a deferred previous owner cannot replace the current mount or respond to stale resize delivery', async t => {
  const view = fixture(t);
  const pending = deferred(), previousRuntime = runtimeDouble(), currentRuntime = runtimeDouble();
  const previous = mountMotionPilot(view.root, { loadRuntime: () => pending.promise });
  await flush();
  const previousObserver = view.resizeObservers[0];
  const current = mountMotionPilot(view.root, { loadRuntime: () => currentRuntime });
  t.after(current);
  await flush();
  const currentStatus = view.root.querySelector('[data-motion-status]').textContent;
  pending.resolve(previousRuntime);
  await flush();
  previous(); previousObserver.deliver(300);
  view.replay.click();
  assert.equal(previousRuntime.state.mounts, 0);
  assert.equal(currentRuntime.state.mounts, 1);
  assert.equal(currentRuntime.state.active.size, 1);
  assert.equal(currentRuntime.state.restarts, 1);
  assert.equal(view.root.querySelector('[data-motion-status]').textContent, currentStatus);
  assert.equal(view.root.dataset.motionState, 'ready');
  assert.equal(view.listeners.size, 1);
  assert.equal(view.visibilityListeners.size, 1);
  assert.equal(view.resizeObservers.filter(observer => observer.connected).length, 1);
});

test('repeated reduced-motion mounts preserve static content and never request the runtime', async t => {
  const view = fixture(t, { reduced: true });
  const before = researchContent(view.root), runtime = runtimeDouble();
  let requests = 0;
  const loadRuntime = () => { requests++; return runtime; };
  for (let iteration = 0; iteration < 4; iteration++) {
    const destroy = mountMotionPilot(view.root, { loadRuntime });
    await flush();
    view.setWidth(iteration % 2 ? 900 : 360);
    assert.equal(view.root.dataset.motionState, 'reduced');
    assert.equal(view.replay.disabled, true);
    assert.deepEqual(researchContent(view.root), before);
    destroy(); destroy();
    assert.equal(view.listeners.size, 0);
    assert.equal(view.visibilityListeners.size, 0);
    assert.ok([...view.observers, ...view.resizeObservers].every(observer => !observer.connected));
  }
  assert.equal(requests, 0);
  assert.equal(runtime.state.mounts, 0);
  const destroy = mountMotionPilot(view.root, { loadRuntime });
  t.after(destroy);
  view.preference.set(false);
  await flush();
  assert.equal(requests, 1);
  assert.equal(runtime.state.active.size, 1);
  assert.equal(view.replay.disabled, false);
});

test('host-authored IDs and implicit labels keep static, failed and manually still instances separate', async t => {
  const first = fixture(t), second = sibling(first, 'second', 360);
  const firstContent = researchContent(first.root), secondContent = researchContent(second.root);
  for (const view of [first, second]) {
    const label = view.still.closest('label');
    assert.equal(label.hasAttribute('for'), false, 'The checkbox must use its local implicit label');
    assert.equal(label.control, view.still, 'Labels must associate correctly before enhancement');
    for (const element of view.root.querySelectorAll('[aria-labelledby],[aria-describedby]')) {
      for (const attribute of ['aria-labelledby', 'aria-describedby']) {
        for (const id of (element.getAttribute(attribute) || '').split(/\s+/).filter(Boolean)) {
          assert.ok(view.root.contains(first.window.document.getElementById(id)), 'Authored ARIA references must resolve inside their own instance');
        }
      }
    }
  }
  const runtime = runtimeDouble();
  const destroyFirst = mountMotionPilot(first.root, { loadRuntime: () => Promise.reject(new Error('blocked host runtime')) });
  const destroySecond = mountMotionPilot(second.root, { loadRuntime: () => runtime });
  t.after(destroyFirst); t.after(destroySecond);
  await flush();
  assert.equal(first.root.dataset.motionState, 'unavailable');
  assert.equal(second.root.dataset.motionState, 'ready');
  second.still.closest('label').click();
  assert.equal(second.still.checked, true);
  assert.equal(second.root.dataset.motionState, 'static');
  assert.equal(first.still.checked, false);
  assert.equal(first.root.dataset.motionState, 'unavailable');
  assert.equal(runtime.state.active.size, 0);
  assert.deepEqual(researchContent(first.root), firstContent);
  assert.deepEqual(researchContent(second.root), secondContent);
});

test('container width controls compact motion and rebuilds only on threshold crossings', async t => {
  const view = fixture(t, { width: 680 });
  view.root.style.padding = '20px';
  view.root.style.border = '1px solid';
  const runtime = runtimeDouble();
  const destroy = mountMotionPilot(view.root, { loadRuntime: () => runtime });
  t.after(destroy);
  await flush();
  let owner = runtime.state.owners.at(-1);
  assert.equal(owner.conditions.compact, undefined, 'Observed container width must replace the viewport breakpoint');
  assert.ok(owner.targets.every(({from,to}) => from.y === 6 && from.rotation === 0 && from.scale === 1 && to.duration === .24));
  assert.equal(owner.targets.at(-1).position + owner.targets.at(-1).to.duration, .32);
  view.replay.click();
  view.setWidth(400);
  assert.equal(runtime.state.mounts, 1, 'Resizing within one range must not rebuild animation');
  view.setWidth(900);
  owner = runtime.state.owners.at(-1);
  assert.equal(runtime.state.reverts, 1);
  assert.equal(runtime.state.active.size, 1);
  assert.ok(owner.targets.every(({from,to}) => from.y === 16 && from.scale === .98 && to.duration === .48));
  assert.equal(owner.targets.at(-1).position + owner.targets.at(-1).to.duration, .72);
  owner.triggers[0].onEnter();
  assert.equal(runtime.state.restarts, 1, 'Crossing a breakpoint must preserve the already-played choice');

  view.setStill(true);
  view.setWidth(360);
  assert.equal(runtime.state.active.size, 0);
  assert.equal(view.root.dataset.motionState, 'static');
  assert.equal(runtime.state.mounts, 2, 'Manual still mode must survive container changes');
  view.setStill(false);
  assert.ok(runtime.state.owners.at(-1).targets.every(({from}) => from.y === 6));
  const resizeObserver = view.resizeObservers[0];
  const mounts = runtime.state.mounts;
  resizeObserver.deliver(0); resizeObserver.deliver(-1);
  assert.equal(runtime.state.mounts, mounts, 'Hidden or invalid zero-size observations must not rebuild');
  destroy(); resizeObserver.deliver(900);
  assert.equal(resizeObserver.connected, false);
  assert.equal(runtime.state.active.size, 0);
  assert.equal(runtime.state.mounts, mounts);
});

test('without ResizeObserver compact timing retains the viewport media-query fallback', async t => {
  const view = fixture(t, { width: 360, resize: false });
  const runtime = runtimeDouble({ fallbackCompact: true });
  const destroy = mountMotionPilot(view.root, { loadRuntime: () => runtime });
  t.after(destroy);
  await flush();
  const owner = runtime.state.owners[0];
  assert.equal(owner.conditions.compact, '(max-width: 640px)');
  assert.ok(owner.targets.every(({from,to}) => from.y === 6 && to.duration === .24));
  assert.equal(view.resizeObservers.length, 0);
});

test('pilot local navigation resolves to existing route sources and anchors', () => {
  const dom = new JSDOM(html);
  try {
    const links = [...dom.window.document.querySelectorAll('a[href]')];
    const localLinks = links.filter(link => !/^[a-z][a-z\d+.-]*:/i.test(link.getAttribute('href')));
    assert.ok(localLinks.length >= 7);
    for (const link of localLinks) {
      const target = new URL(link.getAttribute('href'), pageURL);
      assert.ok(existsSync(fileURLToPath(target)), `Missing local destination: ${link.getAttribute('href')}`);
      if (target.hash) {
        const destination = new JSDOM(readFileSync(target, 'utf8'));
        try {
          assert.ok(destination.window.document.getElementById(decodeURIComponent(target.hash.slice(1))), `Missing anchor: ${link.getAttribute('href')}`);
        } finally { destination.window.close(); }
      }
    }
  } finally { dom.window.close(); }
});
