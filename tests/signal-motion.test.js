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

function fixture(t, { reduced = false } = {}) {
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
  window.matchMedia = () => preference;
  const observers = [];
  window.IntersectionObserver = class {
    constructor(callback) { this.callback = callback; this.connected = false; observers.push(this); }
    observe(target) { this.target = target; this.connected = true; }
    disconnect() { this.connected = false; }
    leave() { this.callback([{ target: this.target, isIntersecting: false }]); }
  };
  const root = window.document.querySelector('[data-motion-pilot]');
  root.querySelector('#motion-stage').getBoundingClientRect = () => ({
    width: 640, height: 500, top: 20, bottom: 520, left: 0, right: 640,
  });
  const still = root.querySelector('#motion-static');
  const replay = root.querySelector('#motion-replay');
  return {
    window, root, preference, listeners, observers, still, replay,
    setStill(value) {
      still.checked = value;
      still.dispatchEvent(new window.Event('change', { bubbles: true }));
    },
  };
}

// This double exercises ownership and cancellation. The browser suite verifies
// animation and media-query behaviour against the real self-hosted GSAP files.
function runtimeDouble() {
  const state = { mounts: 0, reverts: 0, restarts: 0, settlements: 0, active: new Set(), triggers: new Set() };
  let scope;
  const gsap = {
    matchMedia() {
      state.mounts++;
      const owner = { timelines: [], triggers: [], cleanup: undefined, reverted: false };
      state.active.add(owner);
      return {
        add(_conditions, handler) {
          scope = owner;
          owner.cleanup = handler({ conditions: { allowed: true, compact: false } });
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
        fromTo() { return this; },
        restart() {
          assert.equal(owner.reverted, false, 'a reverted owner must never restart');
          state.restarts++;
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
      scope.triggers.push(options);
      state.triggers.add(options);
      return options;
    },
  };
  return { gsap, ScrollTrigger, state };
}

function researchContent(root) {
  return [...root.querySelectorAll('h1,h2,h3,p:not(#motion-status),dt,dd,a[data-source-view]')]
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
