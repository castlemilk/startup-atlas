import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { mountInspector } from './inspector.js';
import * as motion from './vendor/usefluid-motion-0.1.2/index.js';

// These are source-level lifecycle tests, not browser evidence. jsdom does not
// implement layout, native dialog modality, focus trapping, or OS preferences.
// The explicit dialog/geometry/media/rAF stubs below exercise host decisions;
// responsive rendering and native focus behavior need real-browser acceptance.

function markup(prefix) {
  return `<section data-fi-root style="--atlas-duration-normal: 240ms">
    <h2 id="${prefix}-fallback" data-fi-fallback tabindex="-1">Records</h2>
    <div data-fi-list>
      ${['a', 'b', 'c'].map(id => `<div data-fi-row>
        <button id="${prefix}-${id}" data-fi-select="${id}" disabled
          aria-controls="${prefix}-panel" aria-expanded="false">Record ${id.toUpperCase()}</button>
      </div>`).join('')}
    </div>
    <p data-fi-empty>Choose a record.</p>
    <p data-fi-status role="status"></p>
    <dialog id="${prefix}-panel" data-fi-panel aria-labelledby="${prefix}-title" style="border-width: 2px;">
      <h2 id="${prefix}-title" data-fi-title tabindex="-1"></h2>
      <button data-fi-close>Close details</button>
      <div data-fi-content></div>
    </dialog>
    <div data-fi-static>Inline details for Record A, Record B, and Record C.</div>
    ${['a', 'b', 'c'].map(id => `<template data-fi-record="${id}" data-fi-name="Record ${id.toUpperCase()}">
      <p id="${prefix}-${id}-summary">Only record ${id.toUpperCase()} details.</p>
      <a href="#${prefix}-fallback">Record ${id.toUpperCase()} source</a>
    </template>`).join('')}
  </section>`;
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

async function microtasks() {
  await new Promise(resolve => setImmediate(resolve));
}

function fixture(t, { roots = 1, reduced = false, narrow = false, hidden = false } = {}) {
  const dom = new JSDOM(`<!doctype html><html><body>
    <button id="outside">Unrelated control</button>
    ${Array.from({ length: roots }, (_, index) => markup(`fi-${index}`)).join('')}
  </body></html>`, { pretendToBeVisual: true, url: 'https://fixture.invalid/' });
  const { window } = dom;
  const { document } = window;
  const controllers = [];
  const media = new Map();
  let currentHidden = hidden;
  let now = 0;
  let nextFrame = 1;
  const frames = new Map();
  const visibilityListeners = new Set();
  const originalAdd = document.addEventListener.bind(document);
  const originalRemove = document.removeEventListener.bind(document);
  document.addEventListener = (type, listener, options) => {
    if (type === 'visibilitychange') visibilityListeners.add(listener);
    originalAdd(type, listener, options);
  };
  document.removeEventListener = (type, listener, options) => {
    if (type === 'visibilitychange') visibilityListeners.delete(listener);
    originalRemove(type, listener, options);
  };
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => currentHidden });
  Object.defineProperty(document, 'visibilityState', {
    configurable: true, get: () => currentHidden ? 'hidden' : 'visible',
  });
  window.matchMedia = query => {
    if (!media.has(query)) {
      const listeners = new Set();
      const item = {
        media: query,
        matches: query.includes('reduced-motion') ? reduced : narrow,
        listeners,
        addEventListener(type, listener) { if (type === 'change') listeners.add(listener); },
        removeEventListener(type, listener) { if (type === 'change') listeners.delete(listener); },
        set(matches) {
          if (matches === item.matches) return;
          item.matches = matches;
          const event = new window.Event('change');
          Object.defineProperties(event, { matches: { value: matches }, media: { value: query } });
          for (const listener of [...listeners]) listener.call(item, event);
        },
      };
      media.set(query, item);
    }
    return media.get(query);
  };
  window.requestAnimationFrame = callback => {
    const id = nextFrame++;
    frames.set(id, callback);
    return id;
  };
  window.cancelAnimationFrame = id => frames.delete(id);
  // Labelled geometry stub: it indicates fixture visibility only, not rendering.
  window.HTMLElement.prototype.getClientRects = function () {
    const dialog = this.closest('dialog');
    if (!this.isConnected || this.closest('[hidden],[inert]') || (dialog && !dialog.open)) return [];
    return [new window.DOMRect(100, 100, 320, 400)];
  };
  window.HTMLElement.prototype.getBoundingClientRect = function () {
    return new window.DOMRect(100, 100, 320, 400);
  };
  for (const dialog of document.querySelectorAll('dialog')) {
    dialog.show = function () { this.open = true; this.dataset.testModal = 'false'; };
    dialog.showModal = function () { this.open = true; this.dataset.testModal = 'true'; };
    dialog.close = function () {
      if (!this.open) return;
      this.open = false;
      queueMicrotask(() => this.dispatchEvent(new window.Event('close')));
    };
  }
  const rootElements = [...document.querySelectorAll('[data-fi-root]')];
  const result = {
    window, document, rootElements, frames, media, visibilityListeners,
    root: rootElements[0],
    mount(index = 0, options = {}) {
      const controller = mountInspector(rootElements[index], {
        loadMotion: async () => motion,
        supportsLinear: () => true,
        ...options,
      });
      controllers.push(controller);
      return controller;
    },
    button(id, index = 0) { return rootElements[index].querySelector(`[data-fi-select="${id}"]`); },
    get panel() { return rootElements[0].querySelector('[data-fi-panel]'); },
    get title() { return rootElements[0].querySelector('[data-fi-title]'); },
    get content() { return rootElements[0].querySelector('[data-fi-content]'); },
    get fallback() { return rootElements[0].querySelector('[data-fi-fallback]'); },
    get reduced() { return window.matchMedia('(prefers-reduced-motion: reduce)'); },
    get narrow() { return window.matchMedia('(max-width: 700px)'); },
    visibility(value) {
      currentHidden = value;
      document.dispatchEvent(new window.Event('visibilitychange'));
    },
    step(milliseconds = 1000 / 60) {
      now += milliseconds;
      const scheduled = [...frames.values()];
      frames.clear();
      for (const callback of scheduled) callback(now);
    },
    drain() {
      let count = 0;
      while (frames.size && count < 180) { result.step(); count += 1; }
      assert.equal(frames.size, 0, 'the fixture must reach rest without a perpetual frame loop');
    },
  };
  t.after(() => {
    for (const controller of controllers) controller.destroy();
    window.close();
  });
  return result;
}

test('rapid A/B/C selection updates facts immediately and keeps one opening trajectory', async t => {
  const f = fixture(t);
  const inspector = f.mount();
  await microtasks();
  assert.equal(inspector.snapshot().motionState, 'ready');
  inspector.select('a', { opener: f.button('a') });
  f.step();
  const moving = inspector.snapshot();
  assert.ok(moving.value > 0 && moving.value < 1);
  assert.ok(moving.velocity > 0);
  inspector.select('b', { opener: f.button('b') });
  inspector.select('c', { opener: f.button('c') });
  inspector.select('c', { opener: f.button('c'), focus: 'preserve' });
  const latest = inspector.snapshot();
  assert.equal(latest.selectedId, 'c');
  assert.equal(latest.generation, moving.generation, 'selection does not restart the open target');
  assert.equal(latest.value, moving.value);
  assert.equal(latest.velocity, moving.velocity);
  assert.equal(f.frames.size, 1);
  assert.equal(f.title.textContent, 'Record C');
  assert.match(f.content.textContent, /Only record C details/);
  assert.doesNotMatch(f.content.textContent, /Only record [AB] details/);
  assert.deepEqual(['a', 'b', 'c'].map(id => f.button(id).getAttribute('aria-expanded')), ['false', 'false', 'true']);
  f.drain();
  assert.equal(inspector.snapshot().phase, 'open');
  assert.equal(inspector.snapshot().value, 1);
});

test('close then reopen retargets the actual spring without resetting its value or velocity', async t => {
  const f = fixture(t);
  const inspector = f.mount();
  await microtasks();
  inspector.select('a', { opener: f.button('a') });
  f.drain();
  inspector.close();
  f.step();
  f.step();
  const closing = inspector.snapshot();
  assert.equal(closing.phase, 'closing');
  assert.ok(closing.value > 0 && closing.value < 1);
  assert.ok(closing.velocity < 0);
  inspector.select('c', { opener: f.button('c') });
  const reopened = inspector.snapshot();
  assert.equal(reopened.phase, 'opening');
  assert.equal(reopened.value, closing.value);
  assert.equal(reopened.velocity, closing.velocity);
  assert.equal(reopened.target, 1);
  assert.equal(f.frames.size, 1);
  f.drain();
  assert.equal(inspector.snapshot().selectedId, 'c');
  assert.equal(inspector.snapshot().phase, 'open');
  assert.equal(f.panel.open, true);
});

test('deferred runtime leaves working readable details and does not replay when it arrives', async t => {
  const f = fixture(t);
  const loading = deferred();
  let loads = 0;
  const inspector = f.mount(0, { loadMotion: () => { loads += 1; return loading.promise; } });
  inspector.select('a', { opener: f.button('a') });
  inspector.select('c', { opener: f.button('c') });
  assert.equal(inspector.snapshot().phase, 'open');
  assert.equal(inspector.snapshot().motionState, 'loading');
  assert.equal(f.title.textContent, 'Record C');
  assert.equal(f.frames.size, 0);
  const paints = inspector.snapshot().paints;
  loading.resolve(motion);
  await microtasks();
  assert.equal(loads, 1);
  assert.equal(inspector.snapshot().motionState, 'ready');
  assert.equal(inspector.snapshot().value, 1);
  assert.equal(inspector.snapshot().paints, paints);
  assert.equal(f.frames.size, 0);
});

test('failed motion runtime preserves selection, facts, dismissal and focus return', async t => {
  const f = fixture(t);
  const inspector = f.mount(0, { loadMotion: async () => { throw new Error('fixture runtime unavailable'); } });
  await microtasks();
  assert.equal(inspector.snapshot().motionState, 'unavailable');
  assert.equal(inspector.select('b', { opener: f.button('b') }), true);
  assert.equal(f.title.textContent, 'Record B');
  assert.match(f.content.textContent, /Only record B details/);
  assert.equal(f.document.activeElement, f.button('b'), 'desktop auto focus keeps the selecting control');
  assert.equal(f.frames.size, 0);
  inspector.close();
  assert.equal(f.panel.open, false);
  assert.equal(f.document.activeElement, f.button('b'));
});

test('live reduced-motion changes settle latest intent and returning to full motion does not replay', async t => {
  const f = fixture(t);
  const inspector = f.mount();
  await microtasks();
  inspector.select('a', { opener: f.button('a') });
  f.step();
  inspector.select('c', { opener: f.button('c') });
  f.reduced.set(true);
  assert.equal(inspector.snapshot().phase, 'open');
  assert.equal(inspector.snapshot().selectedId, 'c');
  assert.equal(inspector.snapshot().value, 1);
  assert.equal(inspector.snapshot().velocity, 0);
  assert.equal(f.frames.size, 0);
  const paints = inspector.snapshot().paints;
  f.reduced.set(false);
  assert.equal(f.frames.size, 0);
  assert.equal(inspector.snapshot().paints, paints);
  inspector.close();
  f.step();
  f.reduced.set(true);
  assert.equal(inspector.snapshot().phase, 'closed');
  assert.equal(inspector.snapshot().value, 0);
  assert.equal(f.panel.open, false);
  assert.equal(f.frames.size, 0);
});

test('hidden-tab cleanup settles the latest selection and latest dismissal without replay', async t => {
  const f = fixture(t);
  const inspector = f.mount();
  await microtasks();
  inspector.select('a', { opener: f.button('a') });
  f.step();
  inspector.select('c', { opener: f.button('c') });
  f.visibility(true);
  assert.equal(inspector.snapshot().phase, 'open');
  assert.equal(inspector.snapshot().selectedId, 'c');
  assert.equal(inspector.snapshot().value, 1);
  assert.equal(f.frames.size, 0);
  const paints = inspector.snapshot().paints;
  f.visibility(false);
  assert.equal(inspector.snapshot().paints, paints);
  assert.equal(f.frames.size, 0);
  inspector.close();
  f.step();
  f.visibility(true);
  assert.equal(inspector.snapshot().phase, 'closed');
  assert.equal(f.panel.open, false);
  assert.equal(f.frames.size, 0);
  f.visibility(false);
  assert.equal(f.panel.open, false);
  assert.equal(f.frames.size, 0);
});

test('initial reduced motion and hidden state perform no animation', async t => {
  for (const environment of [{ reduced: true }, { hidden: true }]) {
    const f = fixture(t, environment);
    const inspector = f.mount();
    await microtasks();
    inspector.select('b', { opener: f.button('b') });
    assert.equal(inspector.snapshot().phase, 'open');
    assert.equal(inspector.snapshot().value, 1);
    assert.equal(f.frames.size, 0);
    inspector.close();
    assert.equal(inspector.snapshot().phase, 'closed');
    assert.equal(f.frames.size, 0);
  }
});

test('destroy cancels owned work, removes listeners and makes escaped callbacks harmless', async t => {
  const f = fixture(t);
  const authoredStyle = f.panel.getAttribute('style');
  const inspector = f.mount();
  await microtasks();
  inspector.select('a', { opener: f.button('a') });
  const escapedFrame = [...f.frames.values()][0];
  assert.equal(f.visibilityListeners.size, 1);
  inspector.destroy();
  const destroyed = inspector.snapshot();
  assert.equal(destroyed.phase, 'destroyed');
  assert.equal(f.frames.size, 0);
  assert.equal(f.visibilityListeners.size, 0);
  assert.equal(f.reduced.listeners.size, 0);
  assert.equal(f.narrow.listeners.size, 0);
  assert.equal(f.panel.getAttribute('style'), authoredStyle);
  assert.equal(f.root.querySelector('[data-fi-static]').hidden, false);
  assert.equal(f.button('a').disabled, true);
  escapedFrame(500);
  f.reduced.set(true);
  f.visibility(true);
  inspector.destroy();
  assert.equal(inspector.snapshot().paints, destroyed.paints);
  assert.equal(inspector.select('c'), false);
  assert.equal(inspector.close(), false);
  assert.equal(f.frames.size, 0);
});

test('remount owns the root while a superseded loader and old destroy remain harmless', async t => {
  const f = fixture(t);
  const oldLoad = deferred();
  const oldInspector = f.mount(0, { loadMotion: () => oldLoad.promise });
  oldInspector.select('a', { opener: f.button('a') });
  const inspector = f.mount();
  await microtasks();
  inspector.select('c', { opener: f.button('c') });
  const before = inspector.snapshot();
  oldLoad.resolve(motion);
  await microtasks();
  oldInspector.destroy();
  assert.equal(oldInspector.snapshot().destroyed, true);
  assert.equal(inspector.snapshot().selectedId, 'c');
  assert.equal(inspector.snapshot().generation, before.generation);
  assert.equal(f.title.textContent, 'Record C');
  assert.equal(f.button('c').disabled, false);
  assert.equal(f.visibilityListeners.size, 1);
  assert.equal(f.reduced.listeners.size, 1);
  assert.equal(f.frames.size, 1);
  f.drain();
});

test('a late runtime rejection after destruction cannot overwrite fallback state', async t => {
  const f = fixture(t);
  const oldLoad = deferred();
  const inspector = f.mount(0, { loadMotion: () => oldLoad.promise });
  await microtasks();
  inspector.destroy();
  const status = f.root.querySelector('[data-fi-status]').textContent;
  oldLoad.reject(new Error('late fixture rejection'));
  await microtasks();
  assert.equal(inspector.snapshot().phase, 'destroyed');
  assert.equal(f.root.querySelector('[data-fi-status]').textContent, status);
  assert.equal(f.frames.size, 0);
});

test('an escaped frame from an interrupted generation cannot finish the replacement', async t => {
  const f = fixture(t);
  const inspector = f.mount();
  await microtasks();
  inspector.select('a', { opener: f.button('a') });
  const stale = [...f.frames.values()][0];
  inspector.close();
  inspector.select('c', { opener: f.button('c') });
  const before = inspector.snapshot();
  stale(1000);
  assert.deepEqual(inspector.snapshot(), before);
  assert.equal(f.frames.size, 1);
  f.drain();
  assert.equal(inspector.snapshot().phase, 'open');
  assert.equal(inspector.snapshot().selectedId, 'c');
});

test('CSS linear support selects the official curve or the explicit supported fallback', async t => {
  for (const supports of [true, false]) {
    const f = fixture(t);
    let inspectedEasing;
    f.mount(0, { supportsLinear: easing => { inspectedEasing = easing; return supports; } });
    await microtasks();
    assert.equal(inspectedEasing, motion.springCss(motion.springs.firm).easing);
    assert.equal(f.root.dataset.fiEasing, supports ? 'linear' : 'fallback');
    assert.equal(f.root.style.getPropertyValue('--fi-selection-easing'), supports
      ? inspectedEasing : 'cubic-bezier(.2,.8,.2,1)');
  }
});

test('sibling roots keep identity, selection, frames and teardown independent', async t => {
  const f = fixture(t, { roots: 2 });
  const first = f.mount(0);
  const second = f.mount(1);
  await microtasks();
  first.select('a', { opener: f.button('a', 0) });
  second.select('c', { opener: f.button('c', 1) });
  const ids = [...f.document.querySelectorAll('[id]')].map(node => node.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(f.button('a', 0).getAttribute('aria-controls'), f.rootElements[0].querySelector('dialog').id);
  assert.equal(f.button('c', 1).getAttribute('aria-controls'), f.rootElements[1].querySelector('dialog').id);
  assert.equal(f.frames.size, 2);
  first.destroy();
  assert.equal(f.frames.size, 1);
  assert.equal(f.visibilityListeners.size, 1);
  assert.equal(f.reduced.listeners.size, 1);
  assert.equal(second.snapshot().selectedId, 'c');
  assert.equal(f.button('c', 1).disabled, false);
  f.drain();
  assert.equal(second.snapshot().phase, 'open');
});

test('dismissal returns application focus to the latest opener', async t => {
  const f = fixture(t);
  const inspector = f.mount();
  await microtasks();
  inspector.select('a', { opener: f.button('a') });
  inspector.select('c', { opener: f.button('c') });
  assert.equal(f.document.activeElement, f.button('c'), 'desktop auto focus keeps the latest selecting control');
  inspector.close();
  f.drain();
  assert.equal(f.document.activeElement, f.button('c'));
});

test('a disconnected or disabled opener falls back to the authored records heading', async t => {
  for (const missing of ['disconnected', 'disabled']) {
    const f = fixture(t);
    const inspector = f.mount();
    await microtasks();
    const opener = f.button('b');
    inspector.select('b', { opener });
    if (missing === 'disconnected') opener.closest('[data-fi-row]').remove();
    else opener.disabled = true;
    inspector.close();
    f.drain();
    assert.equal(f.document.activeElement, f.fallback);
  }
});

test('focus deliberately moved elsewhere during exit is not stolen on completion', async t => {
  const f = fixture(t);
  const inspector = f.mount();
  await microtasks();
  inspector.select('a', { opener: f.button('a') });
  f.drain();
  inspector.close();
  const outside = f.document.querySelector('#outside');
  outside.focus();
  f.drain();
  assert.equal(f.document.activeElement, outside);
  inspector.select('b', { opener: f.button('b') });
  f.drain();
  outside.focus();
  inspector.close({ restoreFocus: false });
  f.drain();
  assert.equal(f.document.activeElement, outside);
});

test('a mobile mode change settles current intent and preserves panel focus without replay', async t => {
  const f = fixture(t);
  const inspector = f.mount();
  await microtasks();
  inspector.select('b', { opener: f.button('b') });
  f.step();
  f.narrow.set(true);
  assert.equal(inspector.snapshot().mode, 'modal');
  assert.equal(inspector.snapshot().phase, 'open');
  assert.equal(f.panel.dataset.testModal, 'true');
  assert.equal(f.document.activeElement, f.title);
  assert.equal(f.frames.size, 0);
  await microtasks();
  assert.equal(inspector.snapshot().intendedOpen, true, 'queued native close notification cannot dismiss the reopened dialog');
  f.narrow.set(false);
  assert.equal(inspector.snapshot().mode, 'nonmodal');
  assert.equal(f.panel.dataset.testModal, 'false');
  assert.equal(f.document.activeElement, f.title);
  assert.equal(f.frames.size, 0);
});

test('Escape on desktop and dialog cancel on mobile dismiss through the controller', async t => {
  const f = fixture(t);
  const inspector = f.mount();
  await microtasks();
  inspector.select('a', { opener: f.button('a') });
  const escape = new f.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
  f.title.dispatchEvent(escape);
  assert.equal(escape.defaultPrevented, true);
  f.drain();
  assert.equal(inspector.snapshot().phase, 'closed');
  f.narrow.set(true);
  inspector.select('c', { opener: f.button('c') });
  const cancel = new f.window.Event('cancel', { cancelable: true });
  f.panel.dispatchEvent(cancel);
  assert.equal(cancel.defaultPrevented, true);
  f.drain();
  assert.equal(inspector.snapshot().phase, 'closed');
  assert.equal(f.document.activeElement, f.button('c'));
});

test('a detached root discovered during a frame disposes owned work', async t => {
  const f = fixture(t);
  const inspector = f.mount();
  await microtasks();
  inspector.select('a', { opener: f.button('a') });
  f.root.remove();
  f.step();
  assert.equal(inspector.snapshot().destroyed, true);
  assert.equal(f.frames.size, 0);
  assert.equal(f.visibilityListeners.size, 0);
  assert.equal(f.reduced.listeners.size, 0);
});

test('an unknown entity cannot replace current content or start another transition', async t => {
  const f = fixture(t);
  const inspector = f.mount();
  await microtasks();
  inspector.select('a', { opener: f.button('a') });
  const before = inspector.snapshot();
  assert.equal(inspector.select('missing', { opener: f.button('c') }), false);
  assert.deepEqual(inspector.snapshot(), before);
  assert.equal(f.title.textContent, 'Record A');
  assert.equal(f.frames.size, 1);
});

test('desktop Inspect auto focus stays on its control while mobile and explicit panel requests enter details', async t => {
  const f = fixture(t);
  const inspector = f.mount();
  await microtasks();
  f.button('a').click();
  assert.equal(f.document.activeElement, f.button('a'));
  f.button('b').click();
  assert.equal(f.document.activeElement, f.button('b'));
  assert.equal(inspector.snapshot().selectedId, 'b');
  inspector.select('b', { opener: f.button('b'), focus: 'panel' });
  assert.equal(f.document.activeElement, f.title);
  inspector.close();
  f.drain();
  f.narrow.set(true);
  f.button('c').click();
  assert.equal(inspector.snapshot().mode, 'modal');
  assert.equal(f.document.activeElement, f.title);
});

test('a new programmatic entity without an opener clears stale return identity and repairs removed detail focus', async t => {
  const f = fixture(t);
  const inspector = f.mount();
  await microtasks();
  inspector.select('a', { opener: f.button('a'), focus: 'panel' });
  f.drain();
  const oldDetailLink = f.content.querySelector('a');
  oldDetailLink.focus();
  assert.equal(f.document.activeElement, oldDetailLink);
  inspector.select('b');
  assert.equal(oldDetailLink.isConnected, false);
  assert.equal(f.document.activeElement, f.title, 'auto selection repairs focus from the replaced details');
  inspector.close();
  f.drain();
  assert.equal(f.document.activeElement, f.fallback, 'a different entity must not return to the previous entity opener');
});

test('an Escape already consumed by a detail control does not dismiss the inspector', async t => {
  const f = fixture(t);
  const inspector = f.mount();
  await microtasks();
  inspector.select('a', { opener: f.button('a'), focus: 'panel' });
  f.drain();
  const detail = f.content.querySelector('a');
  detail.addEventListener('keydown', event => {
    if (event.key === 'Escape') event.preventDefault();
  });
  const before = inspector.snapshot();
  const event = new f.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
  detail.dispatchEvent(event);
  assert.equal(event.defaultPrevented, true);
  assert.deepEqual(inspector.snapshot(), before);
  assert.equal(f.panel.open, true);
});

test('destroy restores the authored root easing and its priority through the CSS API', async t => {
  const f = fixture(t);
  const property = '--fi-selection-easing';
  const authoredValue = 'steps(3, end)';
  f.root.style.setProperty(property, authoredValue);
  // jsdom 26 drops !important on custom properties. This labelled priority stub
  // and write spy verify the restoration API call, not real CSS cascade behavior.
  const originalPriority = f.root.style.getPropertyPriority.bind(f.root.style);
  const originalSet = f.root.style.setProperty.bind(f.root.style);
  const writes = [];
  f.root.style.getPropertyPriority = name => name === property ? 'important' : originalPriority(name);
  f.root.style.setProperty = (name, value, priority = '') => {
    writes.push({ name, value, priority });
    originalSet(name, value, priority);
  };
  const inspector = f.mount();
  await microtasks();
  assert.notEqual(f.root.style.getPropertyValue(property), authoredValue);
  inspector.destroy();
  assert.equal(f.root.style.getPropertyValue(property), authoredValue);
  assert.deepEqual(writes.at(-1), { name: property, value: authoredValue, priority: 'important' });
  assert.equal(f.root.style.getPropertyValue('--atlas-duration-normal'), '240ms');
});

test('environment and breakpoint changes while closed never move body focus to fallback or a former opener', async t => {
  const f = fixture(t);
  const inspector = f.mount();
  await microtasks();
  const originalFocus = f.window.HTMLElement.prototype.focus;
  const focusCalls = [];
  f.window.HTMLElement.prototype.focus = function (...args) {
    focusCalls.push(this);
    return originalFocus.apply(this, args);
  };
  const changeEnvironment = () => {
    f.reduced.set(true);
    f.reduced.set(false);
    f.visibility(true);
    f.visibility(false);
    f.narrow.set(true);
    f.narrow.set(false);
  };
  assert.equal(f.document.activeElement, f.document.body);
  changeEnvironment();
  assert.equal(inspector.snapshot().phase, 'closed');
  assert.equal(f.document.activeElement, f.document.body);
  assert.equal(focusCalls.length, 0);
  inspector.select('a', { opener: f.button('a') });
  inspector.close();
  f.drain();
  await microtasks();
  f.document.activeElement.blur();
  focusCalls.length = 0;
  assert.equal(f.document.activeElement, f.document.body);
  changeEnvironment();
  assert.equal(inspector.snapshot().phase, 'closed');
  assert.equal(f.document.activeElement, f.document.body);
  assert.equal(focusCalls.length, 0, 'closed inspector must not reclaim its old opener');
  assert.equal(f.frames.size, 0);
});

test('explicit host invalidation preserves unrelated focus even if native close restores an old opener', async t => {
  const f = fixture(t);
  const inspector = f.mount();
  await microtasks();
  inspector.select('a', { opener: f.button('a') });
  f.drain();
  // A labelled native-restoration approximation tests the app guard; this is
  // not evidence of a browser's actual dialog focus-restoration algorithm.
  const originalClose = f.panel.close.bind(f.panel);
  f.panel.close = () => {
    originalClose();
    f.button('a').focus();
  };
  const outside = f.document.querySelector('#outside');
  outside.focus();
  inspector.close({ reason: 'invalidated', restoreFocus: false });
  f.drain();
  assert.equal(f.document.activeElement, outside);
  assert.equal(inspector.snapshot().phase, 'closed');
  assert.equal(f.root.querySelector('[data-fi-status]').textContent, 'The inspected record is no longer in this view.');
});

test('hidden explicit selection and mode changes do not invoke application focus methods', async t => {
  const f = fixture(t, { hidden: true });
  const outside = f.document.querySelector('#outside');
  outside.focus();
  const originalFocus = f.window.HTMLElement.prototype.focus;
  const focusCalls = [];
  f.window.HTMLElement.prototype.focus = function (...args) {
    focusCalls.push(this);
    return originalFocus.apply(this, args);
  };
  const inspector = f.mount();
  await microtasks();
  inspector.select('a', { opener: f.button('a'), focus: 'panel' });
  inspector.select('a', { opener: f.button('a'), focus: 'panel' });
  inspector.select('b', { opener: f.button('b'), focus: 'preserve' });
  f.narrow.set(true);
  inspector.select('c', { opener: f.button('c'), focus: 'panel' });
  f.narrow.set(false);
  inspector.close();
  assert.equal(focusCalls.length, 0);
  assert.equal(f.document.activeElement, outside);
  assert.equal(inspector.snapshot().phase, 'closed');
  assert.equal(f.frames.size, 0);
});

test('desktop preserve keeps an external control focused across opening and a different selection despite supplied openers', async t => {
  const f = fixture(t);
  const inspector = f.mount();
  await microtasks();
  const outside = f.document.querySelector('#outside');
  // Labelled approximation: native dialog.show() may move focus. This tests
  // restoration of the pre-show control, not a browser's native focus algorithm.
  const originalShow = f.panel.show.bind(f.panel);
  f.panel.show = () => {
    originalShow();
    f.panel.querySelector('[data-fi-close]').focus();
  };
  outside.focus();
  inspector.select('a', { opener: f.button('a'), focus: 'preserve' });
  assert.equal(f.document.activeElement, outside);
  assert.equal(inspector.snapshot().selectedId, 'a');
  const opening = inspector.snapshot();
  inspector.select('b', { opener: f.button('b'), focus: 'preserve' });
  assert.equal(f.document.activeElement, outside);
  assert.equal(inspector.snapshot().selectedId, 'b');
  assert.equal(inspector.snapshot().generation, opening.generation);
  assert.equal(f.title.textContent, 'Record B');
  f.drain();
  assert.equal(f.document.activeElement, outside);
});

test('removing only the opener button leaves its row clear and allows dismissal, later selection and teardown', async t => {
  const f = fixture(t);
  const inspector = f.mount();
  await microtasks();
  const opener = f.button('a');
  const row = opener.closest('[data-fi-row]');
  inspector.select('a', { opener, focus: 'panel' });
  f.drain();
  assert.equal(row.dataset.selected, 'true');
  opener.remove();
  assert.equal(row.isConnected, true, 'the authored row deliberately remains mounted');
  assert.equal(opener.closest('[data-fi-row]'), null);
  assert.doesNotThrow(() => inspector.close());
  assert.equal(row.dataset.selected, 'false', 'the surviving row must not retain stale selection');
  f.drain();
  assert.equal(inspector.snapshot().phase, 'closed');
  assert.equal(f.panel.open, false);
  assert.equal(f.document.activeElement, f.fallback);
  assert.doesNotThrow(() => inspector.select('b', { opener: f.button('b'), focus: 'panel' }));
  f.drain();
  assert.equal(inspector.snapshot().selectedId, 'b');
  assert.equal(f.title.textContent, 'Record B');
  assert.equal(row.dataset.selected, 'false');
  assert.doesNotThrow(() => inspector.destroy());
  assert.equal(inspector.snapshot().phase, 'destroyed');
  assert.equal(f.frames.size, 0);
});

test('a trigger reparented outside its root retains host attributes and cannot activate the former inspector', async t => {
  const f = fixture(t);
  const inspector = f.mount();
  await microtasks();
  const moved = f.button('a');
  const oldRow = moved.closest('[data-fi-row]');
  inspector.select('a', { opener: moved, focus: 'panel' });
  f.drain();
  const hostRow = f.document.createElement('div');
  hostRow.dataset.fiRow = '';
  hostRow.dataset.selected = 'host-selection';
  f.document.body.append(hostRow);
  hostRow.append(moved);
  moved.setAttribute('aria-controls', 'host-panel');
  moved.setAttribute('aria-expanded', 'false');
  moved.dataset.hostOwned = 'true';
  moved.disabled = false;
  let hostClicks = 0;
  moved.addEventListener('click', () => { hostClicks += 1; });
  const attributes = () => [...moved.attributes].map(({ name, value }) => [name, value]);
  const hostAttributes = attributes();
  inspector.select('b', { opener: f.button('b'), focus: 'panel' });
  assert.equal(oldRow.dataset.selected, 'false');
  assert.equal(hostRow.dataset.selected, 'host-selection');
  assert.deepEqual(attributes(), hostAttributes);
  const beforeClick = inspector.snapshot();
  moved.click();
  assert.equal(hostClicks, 1, 'the new host can use the reparented control');
  assert.deepEqual(inspector.snapshot(), beforeClick, 'the old click listener must respect current root ownership');
  assert.equal(f.title.textContent, 'Record B');
  inspector.close({ restoreFocus: false });
  f.drain();
  assert.deepEqual(attributes(), hostAttributes);
  inspector.destroy();
  assert.equal(moved.disabled, false, 'teardown must not disable a control now owned outside the root');
  assert.deepEqual(attributes(), hostAttributes);
  assert.equal(hostRow.dataset.selected, 'host-selection');
  assert.equal(f.frames.size, 0);
});

test('modal Tab wraps ordinary boundaries in both directions and leaves middle navigation to the browser', async t => {
  const f = fixture(t, { narrow: true });
  const inspector = f.mount();
  await microtasks();
  inspector.select('a', { opener: f.button('a') });
  f.drain();
  const first = f.panel.querySelector('[data-fi-close]');
  const last = f.content.querySelector('a');
  const middle = f.document.createElement('button');
  middle.textContent = 'Fixture auxiliary action';
  f.content.prepend(middle);
  // Uses the labelled visible geometry stub. jsdom does not perform native Tab
  // navigation; only the application's boundary focus and cancellation are tested.
  const tabAt = (element, shiftKey = false) => {
    element.focus();
    const event = new f.window.KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true });
    element.dispatchEvent(event);
    return event;
  };
  assert.equal(tabAt(last).defaultPrevented, true);
  assert.equal(f.document.activeElement, first);
  assert.equal(tabAt(first, true).defaultPrevented, true);
  assert.equal(f.document.activeElement, last);
  assert.equal(tabAt(f.title, true).defaultPrevented, true);
  assert.equal(f.document.activeElement, last);
  assert.equal(tabAt(middle).defaultPrevented, false);
  assert.equal(f.document.activeElement, middle, 'the application must not move middle focus itself');
  assert.equal(tabAt(middle, true).defaultPrevented, false);
  assert.equal(f.document.activeElement, middle);
  assert.equal(inspector.snapshot().intendedOpen, true);
  inspector.close();
  assert.equal(inspector.snapshot().phase, 'closing');
  assert.equal(f.panel.open, true, 'native modality remains until the exit finishes');
  assert.equal(tabAt(last).defaultPrevented, true, 'the still-open modal keeps its boundary during exit');
  assert.equal(f.document.activeElement, first);
  assert.equal(tabAt(first, true).defaultPrevented, true);
  assert.equal(f.document.activeElement, last);
  f.drain();
  assert.equal(f.panel.open, false);
});

test('Tab boundary handling does not override desktop, already-consumed or browser modifier semantics', async t => {
  const f = fixture(t);
  const inspector = f.mount();
  await microtasks();
  inspector.select('a', { opener: f.button('a'), focus: 'panel' });
  f.drain();
  const last = f.content.querySelector('a');
  const dispatch = extra => {
    last.focus();
    const event = new f.window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true, ...extra });
    last.dispatchEvent(event);
    return event;
  };
  assert.equal(dispatch({}).defaultPrevented, false, 'desktop inspector does not trap Tab');
  assert.equal(f.document.activeElement, last);
  f.narrow.set(true);
  last.addEventListener('keydown', event => event.preventDefault(), { once: true });
  assert.equal(dispatch({}).defaultPrevented, true);
  assert.equal(f.document.activeElement, last, 'a detail control that consumed Tab retains its own behavior');
  for (const modifiers of [{ ctrlKey: true }, { altKey: true }, { metaKey: true }]) {
    assert.equal(dispatch(modifiers).defaultPrevented, false);
    assert.equal(f.document.activeElement, last, 'modified Tab must not invoke the application boundary guard');
  }
  f.visibility(true);
  last.focus();
  const originalFocus = f.window.HTMLElement.prototype.focus;
  let hiddenFocusCalls = 0;
  f.window.HTMLElement.prototype.focus = function (...args) {
    hiddenFocusCalls += 1;
    return originalFocus.apply(this, args);
  };
  const hiddenTab = new f.window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
  last.dispatchEvent(hiddenTab);
  assert.equal(hiddenTab.defaultPrevented, false);
  assert.equal(hiddenFocusCalls, 0, 'hidden-tab synthetic input must not trigger an application focus change');
  f.window.HTMLElement.prototype.focus = originalFocus;
});

test('teardown removes the panel Tab boundary listener before a new host reuses the dialog', async t => {
  const f = fixture(t, { narrow: true });
  const keydownListeners = new Set();
  const originalAdd = f.panel.addEventListener.bind(f.panel);
  const originalRemove = f.panel.removeEventListener.bind(f.panel);
  f.panel.addEventListener = (type, listener, options) => {
    if (type === 'keydown') keydownListeners.add(listener);
    originalAdd(type, listener, options);
  };
  f.panel.removeEventListener = (type, listener, options) => {
    if (type === 'keydown') keydownListeners.delete(listener);
    originalRemove(type, listener, options);
  };
  const inspector = f.mount();
  await microtasks();
  inspector.select('a', { opener: f.button('a') });
  f.drain();
  assert.equal(keydownListeners.size, 1);
  inspector.destroy();
  assert.equal(keydownListeners.size, 0, 'the listener is removed, not merely disabled by a stale state guard');
  // The labelled dialog stub stands in for a new host's ownership after teardown.
  f.panel.showModal();
  const last = f.content.querySelector('a');
  last.focus();
  const event = new f.window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
  last.dispatchEvent(event);
  assert.equal(event.defaultPrevented, false);
  assert.equal(f.document.activeElement, last);
});
