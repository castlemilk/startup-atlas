import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import {
  fluidSignalVersion,
  getSignalMotionProfile,
  mountFluidSignal,
} from '../web/assets/design-lab/fluid-signal-adapter/adapter.js';

const bundleURL = new URL('../web/assets/design-lab/fluid-signal-adapter/adapter.js', import.meta.url);
const signalEase = 'cubic-bezier(.2,.8,.2,1)';

test('the checked-in bundle receipt matches source, lockfile and distribution bytes', async () => {
  const distribution = new URL('../web/assets/design-lab/fluid-signal-adapter/', import.meta.url);
  const sources = new URL('../integrations/fluid-signal/', import.meta.url);
  const manifest = JSON.parse(await readFile(new URL('manifest.json', distribution), 'utf8'));
  for (const [base, hashes] of [[sources, manifest.sourceSha256], [distribution, manifest.outputSha256]]) {
    for (const [path, hash] of Object.entries(hashes)) {
      assert.equal(createHash('sha256').update(await readFile(new URL(path, base))).digest('hex'), hash, path);
    }
  }
});

// These doubles check DOM and resource ownership. They do not simulate native
// WAAPI interpolation, rendering, keyboard defaults or browser visibility.
function fixture(t, { reduced = false, linearSupport = true, legacy = false, media = true, observable = true, css = true } = {}) {
  const dom = new JSDOM('<!doctype html><button id="outside">Outside</button><main></main>', {
    url: 'https://example.test/startup-atlas/?kind=startup#research',
    pretendToBeVisual: true,
  });
  const { window } = dom;
  const { document } = window;
  const controllers = new Set();
  t.after(() => { for (const controller of controllers) controller.destroy(); window.close(); });
  const mediaListeners = new Set();
  const visibilityListeners = new Set();
  const pagehideListeners = new Set();
  const query = { matches: reduced };
  if (observable && legacy) {
    query.addListener = listener => mediaListeners.add(listener);
    query.removeListener = listener => mediaListeners.delete(listener);
  } else if (observable) {
    query.addEventListener = (type, listener) => { if (type === 'change') mediaListeners.add(listener); };
    query.removeEventListener = (type, listener) => { if (type === 'change') mediaListeners.delete(listener); };
  }
  if (media) window.matchMedia = () => query;
  else window.matchMedia = undefined;
  if (css) window.CSS = {
    supports: (property, value) => property === 'animation-timing-function'
      && (value.startsWith('linear(') ? linearSupport : value === signalEase || value === 'linear'),
  };
  else window.CSS = undefined;
  const watchListeners = (target, name, set) => {
    const add = target.addEventListener.bind(target);
    const remove = target.removeEventListener.bind(target);
    target.addEventListener = (type, listener, ...args) => {
      if (type === name) set.add(listener);
      return add(type, listener, ...args);
    };
    target.removeEventListener = (type, listener, ...args) => {
      if (type === name) set.delete(listener);
      return remove(type, listener, ...args);
    };
  };
  watchListeners(document, 'visibilitychange', visibilityListeners);
  watchListeners(window, 'pagehide', pagehideListeners);
  let hidden = false;
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  let frameRequests = 0;
  window.requestAnimationFrame = () => { frameRequests++; return frameRequests; };
  const states = new WeakMap();
  const computed = window.getComputedStyle.bind(window);
  window.getComputedStyle = element => {
    const style = computed(element);
    const active = [...(states.get(element)?.live || [])].at(-1);
    return new Proxy(style, {
      get(target, property) {
        if (property === 'transform') return active?.sampledTransform ?? (target.transform || 'none');
        const value = Reflect.get(target, property, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
  };
  function layer(element) {
    const state = { element, attempts: [], animations: [], live: new Set(), reject: null };
    states.set(element, state);
    element.getAnimations = () => [...state.live];
    element.animate = (frames, options) => {
      state.attempts.push({ frames: structuredClone(frames), options: { ...options } });
      if (state.reject?.(frames, options)) throw new window.DOMException('Unsupported animation', 'NotSupportedError');
      const animation = {
        playState: 'running', onfinish: null, oncancel: null, cancels: 0,
        sampledTransform: frames[0].transform,
        sample(value) { this.sampledTransform = value; },
        cancel() {
          this.cancels++;
          this.playState = 'idle';
          state.live.delete(this);
          this.oncancel?.();
        },
        finish() {
          this.playState = 'finished';
          state.live.delete(this);
          this.onfinish?.();
        },
      };
      state.animations.push(animation);
      state.live.add(animation);
      return animation;
    };
    return state;
  }
  function root(id = 'first') {
    const element = document.createElement('section');
    element.id = id;
    element.setAttribute('data-atlas-fluid', '');
    element.innerHTML = `<button id="${id}-inspect" type="button" aria-pressed="false">Inspect</button>
      <label for="${id}-kind">Kind</label><select id="${id}-kind"><option value="startup">Startup</option></select>
      <div data-atlas-fluid-layer><p>Funding has not been researched.</p><a href="https://example.test/source">Source</a></div>`;
    element.style.setProperty('--atlas-duration-fast', '140ms');
    element.style.setProperty('--atlas-duration-normal', '240ms');
    element.style.setProperty('--atlas-ease', signalEase);
    document.querySelector('main').append(element);
    const visual = layer(element.querySelector('[data-atlas-fluid-layer]'));
    return { element, visual, button: element.querySelector('button') };
  }
  return {
    window, document, root, layer, query, mediaListeners, visibilityListeners, pagehideListeners,
    get frameRequests() { return frameRequests; },
    mount(element) { const controller = mountFluidSignal(element); controllers.add(controller); return controller; },
    reduce(value) { query.matches = value; for (const listener of [...mediaListeners]) listener({ matches: value }); },
    hide(value) { hidden = value; document.dispatchEvent(new window.Event('visibilitychange')); },
    pagehide() { window.dispatchEvent(new window.Event('pagehide')); },
  };
}

const move = (controller, visual, x = 16, y = 4, role = 'context') =>
  controller.transition(visual.element, { from: { x, y }, role });

test('the pinned bundle imports without a browser or starting a frame loop', () => {
  assert.deepEqual(fluidSignalVersion, { adapter: '0.1.0', fluid: '0.1.2' });
  assert.ok(Object.isFrozen(fluidSignalVersion));
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
    if (typeof window !== 'undefined' || typeof document !== 'undefined') throw Error('Not an SSR process');
    globalThis.requestAnimationFrame = () => { throw Error('Import scheduled a frame'); };
    const adapter = await import(${JSON.stringify(bundleURL.href)});
    if (typeof adapter.mountFluidSignal !== 'function') throw Error('Missing public API');
  `], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
});

test('Signal durations and live host overrides are read at each transition', t => {
  const f = fixture(t);
  const { element, visual } = f.root();
  const controller = f.mount(element);
  assert.equal(getSignalMotionProfile(element, 'feedback').duration, 140);
  assert.equal(getSignalMotionProfile(element).duration, 240);
  move(controller, visual, 8, 0, 'feedback');
  assert.equal(visual.attempts.at(-1).options.duration, 140);
  element.style.setProperty('--atlas-duration-normal', '.18s');
  move(controller, visual);
  assert.equal(visual.attempts.at(-1).options.duration, 180);
  element.style.setProperty('--atlas-duration-normal', '0ms');
  assert.deepEqual(move(controller, visual), { animated: false, reason: 'zero-duration' });
  assert.equal(visual.attempts.length, 2);
  assert.equal(controller.inspect().activeAnimations, 0);
  assert.equal(visual.live.size, 0);
});

test('Fluid linear easing uses Signal duration and native animation ownership', t => {
  const f = fixture(t);
  const { element, visual } = f.root();
  const controller = f.mount(element);
  const profile = getSignalMotionProfile(element);
  assert.equal(profile.curve, 'fluid-firm');
  assert.match(profile.easing, /^linear\(/);
  assert.equal(profile.fallbackEasing, signalEase);
  assert.deepEqual(move(controller, visual), { animated: true, reason: null });
  assert.equal(visual.attempts[0].options.easing, profile.easing);
  assert.equal(visual.attempts[0].options.duration, 240);
  assert.equal(visual.attempts[0].options.fill, 'none');
  assert.equal(f.frameRequests, 0, 'the adapter must not introduce a JavaScript ticker');
});

test('unsupported linear easing falls back explicitly to the host Signal easing', t => {
  const f = fixture(t, { linearSupport: false });
  const { element, visual } = f.root();
  const controller = f.mount(element);
  assert.equal(getSignalMotionProfile(element).curve, 'signal-fallback');
  assert.deepEqual(move(controller, visual), { animated: true, reason: null });
  assert.equal(visual.attempts[0].options.easing, signalEase);
  assert.equal(visual.attempts.length, 1);
});

test('a native rejection of the supported Fluid curve retries only the Signal fallback', t => {
  const f = fixture(t);
  const { element, visual } = f.root();
  const controller = f.mount(element);
  visual.reject = (_frames, options) => options.easing.startsWith('linear(');
  assert.deepEqual(move(controller, visual), { animated: true, reason: null });
  assert.equal(visual.attempts.length, 2);
  assert.equal(visual.attempts[1].options.easing, signalEase);
  assert.deepEqual(visual.attempts[1].frames, visual.attempts[0].frames);
  assert.equal(visual.animations.length, 1);
  assert.equal(controller.inspect().activeAnimations, 1);
});

test('unusable durations or fallback easing leave final DOM static', t => {
  const f = fixture(t, { linearSupport: false });
  const { element, visual } = f.root();
  const controller = f.mount(element);
  for (const duration of ['', '-20ms', 'auto', 'Infinityms']) {
    element.style.setProperty('--atlas-duration-normal', duration);
    assert.deepEqual(move(controller, visual), { animated: false, reason: 'invalid-duration-token' });
  }
  element.style.setProperty('--atlas-duration-normal', '240ms');
  element.style.setProperty('--atlas-ease', 'not-an-easing');
  assert.deepEqual(move(controller, visual), { animated: false, reason: 'invalid-easing-token' });
  assert.equal(visual.attempts.length, 0);
});

test('animation failures stay local and do not disable a sibling', t => {
  const f = fixture(t);
  const a = f.root('a'), b = f.root('b');
  const first = f.mount(a.element), second = f.mount(b.element);
  a.visual.reject = () => true;
  assert.deepEqual(move(first, a.visual), { animated: false, reason: 'animation-unavailable' });
  assert.equal(a.visual.attempts.length, 2);
  assert.equal(first.inspect().activeAnimations, 0);
  assert.deepEqual(move(second, b.visual), { animated: true, reason: null });
});

test('state, text, native backing controls, focus and history stay host-owned', t => {
  const f = fixture(t);
  const { element, visual, button } = f.root();
  const controller = f.mount(element);
  let activations = 0;
  button.addEventListener('click', () => { activations++; button.setAttribute('aria-pressed', 'true'); });
  button.focus();
  button.click();
  f.window.history.replaceState({ selected: 'company:example' }, '', '?kind=startup&selected=example#research');
  const before = { html: element.innerHTML, url: f.window.location.href, history: f.window.history.state };
  move(controller, visual);
  const key = new f.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
  button.dispatchEvent(key);
  f.reduce(true);
  controller.destroy();
  assert.equal(activations, 1);
  assert.equal(key.defaultPrevented, false);
  assert.equal(f.document.activeElement, button);
  assert.equal(element.innerHTML, before.html);
  assert.equal(f.window.location.href, before.url);
  assert.deepEqual(f.window.history.state, before.history);
  assert.equal(element.querySelector('select').value, 'startup');
});

test('root and layer validation prevents cross-owner or nested animation', t => {
  const f = fixture(t);
  const a = f.root('a'), b = f.root('b');
  const controller = f.mount(a.element);
  assert.throws(() => mountFluidSignal(f.document.querySelector('main')), TypeError);
  const detached = a.element.cloneNode(true);
  assert.throws(() => mountFluidSignal(detached), TypeError);
  assert.throws(() => controller.transition(a.element), TypeError);
  assert.throws(() => move(controller, b.visual), TypeError);
  assert.throws(() => controller.transition(a.button, { from: { x: 1, y: 0 } }), TypeError);
  a.element.append(b.element);
  assert.throws(() => move(controller, b.visual), TypeError);
  assert.equal(a.visual.attempts.length + b.visual.attempts.length, 0);
});

test('invalid requests do not disturb a valid in-flight effect', t => {
  const f = fixture(t);
  const { element, visual } = f.root();
  const controller = f.mount(element);
  move(controller, visual);
  const animation = visual.animations[0];
  assert.throws(() => move(controller, visual, NaN), TypeError);
  assert.throws(() => move(controller, visual, 1, Infinity), TypeError);
  assert.throws(() => move(controller, visual, 1, 0, 'success'), TypeError);
  assert.equal(animation.cancels, 0);
  assert.equal(controller.inspect().activeAnimations, 1);
});

test('rapid interruption composes sampled visual offset with the new host layout delta', t => {
  const f = fixture(t);
  const { element, visual } = f.root();
  const controller = f.mount(element);
  move(controller, visual, 30, 10);
  const first = visual.animations[0];
  first.sample('matrix(1, 0, 0, 1, 11, 3)');
  const oldFinish = first.onfinish;
  const oldCancel = first.oncancel;
  move(controller, visual, -18, 5);
  assert.equal(first.cancels, 1);
  assert.deepEqual(visual.attempts[1].frames, [
    { transform: 'translate(-18px, 5px) matrix(1, 0, 0, 1, 11, 3)' },
    { transform: 'none' },
  ]);
  const replacement = visual.animations[1];
  oldFinish();
  oldCancel();
  assert.equal(replacement.cancels, 0, 'late events cannot cancel a replacement');
  assert.equal(controller.inspect().activeAnimations, 1);
  assert.equal(visual.live.size, 1);
  replacement.sample('matrix(1, 0, 0, 1, -4, 2)');
  move(controller, visual, 0, 0);
  assert.match(visual.attempts[2].frames[0].transform, /matrix\(1, 0, 0, 1, -4, 2\)$/);
  assert.equal(visual.live.size, 1);
});

test('normal finish releases the effect and a duplicate completion is harmless', t => {
  const f = fixture(t);
  const { element, visual } = f.root();
  const controller = f.mount(element);
  move(controller, visual);
  const animation = visual.animations[0], lateFinish = animation.onfinish;
  animation.finish();
  lateFinish();
  assert.equal(controller.inspect().activeAnimations, 0);
  assert.equal(visual.live.size, 0);
  assert.equal(animation.onfinish, null);
  assert.equal(animation.oncancel, null);
  assert.equal(f.window.getComputedStyle(visual.element).transform, 'none');
});

test('cancel and settle release only animations belonging to their controller', t => {
  const f = fixture(t);
  const a = f.root('a'), b = f.root('b');
  const extra = f.document.createElement('div');
  extra.setAttribute('data-atlas-fluid-layer', '');
  a.element.append(extra);
  const extraVisual = f.layer(extra);
  const first = f.mount(a.element), second = f.mount(b.element);
  move(first, a.visual); move(first, extraVisual); move(second, b.visual);
  first.cancel(b.visual.element);
  assert.equal(second.inspect().activeAnimations, 1);
  first.cancel(a.visual.element);
  assert.equal(first.inspect().activeAnimations, 1);
  assert.equal(extraVisual.live.size, 1);
  first.settle();
  first.settle();
  assert.equal(first.inspect().activeAnimations, 0);
  assert.equal(extraVisual.live.size, 0);
  assert.equal(b.visual.live.size, 1);
});

test('multiple roots share policy listeners and the last destroy releases them', t => {
  const f = fixture(t);
  const a = f.root('a'), b = f.root('b');
  const first = f.mount(a.element), second = f.mount(b.element);
  const listeners = () => [f.mediaListeners.size, f.visibilityListeners.size, f.pagehideListeners.size];
  assert.deepEqual(listeners(), [1, 1, 1]);
  move(first, a.visual); move(second, b.visual);
  first.destroy(); first.destroy();
  assert.equal(a.visual.live.size, 0);
  assert.equal(b.visual.live.size, 1);
  assert.deepEqual(listeners(), [1, 1, 1]);
  second.destroy();
  assert.equal(b.visual.live.size, 0);
  assert.deepEqual(listeners(), [0, 0, 0]);
  assert.deepEqual(move(first, a.visual), { animated: false, reason: 'destroyed' });
});

test('same-root remount disposes the previous owner and old teardown cannot touch the new one', t => {
  const f = fixture(t);
  const { element, visual } = f.root();
  const previous = f.mount(element);
  move(previous, visual);
  const replacement = f.mount(element);
  assert.equal(previous.inspect().disposed, true);
  assert.equal(visual.live.size, 0);
  move(replacement, visual);
  previous.destroy(); previous.settle(); previous.cancel(visual.element);
  assert.equal(replacement.inspect().activeAnimations, 1);
  assert.equal(visual.live.size, 1);
  assert.equal(f.mediaListeners.size, 1);
});

test('separate documents retain independent reduced-motion policies', t => {
  const firstDocument = fixture(t), secondDocument = fixture(t);
  const a = firstDocument.root('a'), b = secondDocument.root('b');
  const first = firstDocument.mount(a.element), second = secondDocument.mount(b.element);
  move(first, a.visual); move(second, b.visual);
  firstDocument.reduce(true);
  assert.equal(a.visual.live.size, 0);
  assert.equal(b.visual.live.size, 1);
  assert.equal(second.inspect().reducedMotion, false);
});

test('initial reduced motion wins over nonzero host duration overrides', t => {
  const f = fixture(t, { reduced: true });
  const { element, visual } = f.root();
  const controller = f.mount(element);
  assert.equal(getSignalMotionProfile(element).duration, 0);
  assert.deepEqual(move(controller, visual), { animated: false, reason: 'reduced-motion' });
  assert.equal(visual.attempts.length, 0);
  f.reduce(false);
  assert.equal(visual.attempts.length, 0, 'preference restoration must not replay an old transition');
  assert.deepEqual(move(controller, visual), { animated: true, reason: null });
});

test('diagnostics cannot consume a pending native media-query change', t => {
  const f = fixture(t);
  let actual = false, comparison = false;
  // Model a native getter that refreshes the comparison used by later event
  // delivery. Polling that same getter must not swallow the pending change.
  Object.defineProperty(f.query, 'matches', {
    get() { comparison = actual; return actual; },
  });
  const a = f.root('a'), b = f.root('b');
  const first = f.mount(a.element), second = f.mount(b.element);
  move(first, a.visual); move(second, b.visual);
  actual = true;
  for (let index = 0; index < 10; index++) {
    first.inspect(); second.inspect();
  }
  if (comparison !== actual) {
    comparison = actual;
    for (const listener of [...f.mediaListeners]) listener({ matches: actual });
  }
  assert.equal(a.visual.live.size + b.visual.live.size, 0);
  assert.equal(first.inspect().reducedMotion, true);
  assert.equal(second.inspect().reducedMotion, true);
  assert.deepEqual(move(first, a.visual), { animated: false, reason: 'reduced-motion' });
});

test('an unknown media event settles both owners until a later explicit transition is eligible', t => {
  const f = fixture(t);
  const a = f.root('a'), b = f.root('b');
  const first = f.mount(a.element), second = f.mount(b.element);
  move(first, a.visual); move(second, b.visual);
  for (const listener of [...f.mediaListeners]) listener({ matches: 'unknown' });
  for (const [controller, visual] of [[first, a.visual], [second, b.visual]]) {
    assert.equal(controller.inspect().reducedMotion, null);
    assert.equal(controller.inspect().activeAnimations, 0);
    assert.equal(visual.live.size, 0);
    assert.equal(visual.animations[0].cancels, 1);
    assert.deepEqual(move(controller, visual), { animated: false, reason: 'preference-unavailable' });
    assert.equal(visual.attempts.length, 1);
  }
  f.reduce(false);
  assert.equal(first.inspect().reducedMotion, false);
  assert.equal(second.inspect().reducedMotion, false);
  assert.equal(a.visual.attempts.length + b.visual.attempts.length, 2);
  assert.equal(a.visual.live.size + b.visual.live.size, 0, 'restoring eligibility must not replay prior requests');
  assert.deepEqual(move(first, a.visual), { animated: true, reason: null });
  assert.equal(first.inspect().activeAnimations, 1);
  assert.equal(second.inspect().activeAnimations, 0);
  assert.equal(b.visual.attempts.length, 1);
});

test('zero CSS duration prevents motion before the pending preference callback arrives', t => {
  const f = fixture(t);
  const { element, visual } = f.root();
  const controller = f.mount(element);
  move(controller, visual);
  // Model CSS updating before event delivery; this is not a browser scheduling
  // assertion. The controller still holds its earlier false preference value.
  f.query.matches = true;
  element.style.setProperty('--atlas-duration-fast', '0ms');
  element.style.setProperty('--atlas-duration-normal', '0ms');
  assert.equal(controller.inspect().reducedMotion, false);
  assert.deepEqual(move(controller, visual), { animated: false, reason: 'zero-duration' });
  assert.deepEqual(move(controller, visual, 2, 0, 'feedback'), { animated: false, reason: 'zero-duration' });
  assert.equal(visual.attempts.length, 1);
  assert.equal(visual.animations[0].cancels, 1);
  assert.equal(visual.live.size, 0);
  assert.equal(controller.inspect().activeAnimations, 0);
  f.reduce(true);
  assert.equal(controller.inspect().reducedMotion, true);
  assert.equal(visual.attempts.length, 1);
  element.style.setProperty('--atlas-duration-fast', '140ms');
  element.style.setProperty('--atlas-duration-normal', '240ms');
  f.reduce(false);
  assert.equal(visual.attempts.length, 1);
  assert.equal(visual.live.size, 0);
  assert.deepEqual(move(controller, visual), { animated: true, reason: null });
});

test('a late listener from a destroyed policy cannot cancel a remounted owner', t => {
  const f = fixture(t);
  const { element, visual } = f.root();
  const previous = f.mount(element);
  const [oldListener] = f.mediaListeners;
  move(previous, visual);
  previous.destroy();
  assert.equal(f.mediaListeners.size, 0);
  assert.equal(visual.live.size, 0);
  const current = f.mount(element);
  const [currentListener] = f.mediaListeners;
  assert.notEqual(currentListener, oldListener);
  move(current, visual);
  const animation = visual.animations.at(-1);
  oldListener({ matches: true });
  assert.equal(current.inspect().reducedMotion, false);
  assert.equal(current.inspect().activeAnimations, 1);
  assert.equal(visual.live.size, 1);
  assert.equal(animation.cancels, 0);
  currentListener({ matches: true });
  assert.equal(current.inspect().reducedMotion, true);
  assert.equal(current.inspect().activeAnimations, 0);
  assert.equal(visual.live.size, 0);
  assert.equal(animation.cancels, 1);
  current.destroy();
  assert.deepEqual([f.mediaListeners.size, f.visibilityListeners.size, f.pagehideListeners.size], [0, 0, 0]);
});

for (const legacy of [false, true]) {
  test(`live reduced motion cancels every owned effect without replay (${legacy ? 'legacy' : 'modern'} listener)`, t => {
    const f = fixture(t, { legacy });
    const a = f.root('a'), b = f.root('b');
    const first = f.mount(a.element), second = f.mount(b.element);
    move(first, a.visual); move(second, b.visual);
    f.reduce(true);
    assert.equal(a.visual.live.size + b.visual.live.size, 0);
    assert.equal(first.inspect().activeAnimations + second.inspect().activeAnimations, 0);
    assert.deepEqual(move(first, a.visual), { animated: false, reason: 'reduced-motion' });
    f.reduce(false);
    assert.equal(a.visual.attempts.length + b.visual.attempts.length, 2);
    first.destroy(); second.destroy();
    assert.equal(f.mediaListeners.size, 0);
  });
}

test('hidden-document cancellation is immediate and becoming visible does not replay', t => {
  const f = fixture(t);
  const { element, visual } = f.root();
  const controller = f.mount(element);
  move(controller, visual);
  f.hide(true);
  assert.equal(visual.live.size, 0);
  assert.equal(controller.inspect().activeAnimations, 0);
  assert.deepEqual(move(controller, visual), { animated: false, reason: 'hidden' });
  f.hide(false);
  assert.equal(visual.attempts.length, 1);
  assert.deepEqual(move(controller, visual), { animated: true, reason: null });
});

test('pagehide settles effects and pageshow alone does not restart them', t => {
  const f = fixture(t);
  const { element, visual } = f.root();
  const controller = f.mount(element);
  move(controller, visual);
  f.pagehide();
  assert.equal(visual.live.size, 0);
  assert.equal(controller.inspect().activeAnimations, 0);
  f.window.dispatchEvent(new f.window.Event('pageshow'));
  assert.equal(visual.attempts.length, 1);
});

test('missing APIs provide a static or canonical easing fallback', t => {
  const noMedia = fixture(t, { media: false });
  const a = noMedia.root();
  const first = noMedia.mount(a.element);
  assert.deepEqual(move(first, a.visual), { animated: false, reason: 'preference-unavailable' });
  assert.equal(first.inspect().reducedMotion, null);
  assert.equal(first.inspect().preferenceObservable, false);
  const noAnimation = fixture(t);
  const b = noAnimation.root();
  const second = noAnimation.mount(b.element);
  b.visual.element.animate = undefined;
  assert.deepEqual(move(second, b.visual), { animated: false, reason: 'animation-unavailable' });
  const noCSS = fixture(t, { css: false });
  const c = noCSS.root();
  const third = noCSS.mount(c.element);
  assert.deepEqual(move(third, c.visual), { animated: true, reason: null });
  assert.equal(c.visual.attempts[0].options.easing, signalEase);
});

test('a media preference that cannot be observed remains static without claiming reduction', t => {
  const f = fixture(t, { observable: false });
  const { element, visual } = f.root();
  const controller = f.mount(element);
  assert.equal(controller.inspect().reducedMotion, false);
  assert.equal(controller.inspect().preferenceObservable, false);
  assert.equal(getSignalMotionProfile(element).duration, 0);
  assert.equal(getSignalMotionProfile(element).reason, 'preference-unavailable');
  assert.deepEqual(move(controller, visual), { animated: false, reason: 'preference-unavailable' });
  f.reduce(true);
  f.reduce(false);
  assert.deepEqual(move(controller, visual), { animated: false, reason: 'preference-unavailable' });
  assert.equal(visual.attempts.length, 0);
});

test('a transformed or externally animated layer is left with its existing owner', t => {
  const f = fixture(t);
  const { element, visual } = f.root();
  const controller = f.mount(element);
  visual.element.style.transform = 'translateX(10px)';
  assert.deepEqual(move(controller, visual), { animated: false, reason: 'layer-has-transform' });
  assert.equal(visual.element.style.transform, 'translateX(10px)');
  visual.element.style.transform = 'none';
  const external = { playState: 'running', sampledTransform: 'none', cancel: () => assert.fail('Foreign animation cancelled') };
  visual.live.add(external);
  assert.deepEqual(move(controller, visual), { animated: false, reason: 'layer-has-animation' });
  controller.destroy();
  assert.ok(visual.live.has(external));
  assert.equal(visual.attempts.length, 0);
});

test('no-op and disconnected transitions do not leave effects running', t => {
  const f = fixture(t);
  const { element, visual } = f.root();
  const controller = f.mount(element);
  assert.deepEqual(controller.transition(visual.element), { animated: false, reason: 'unchanged' });
  assert.equal(visual.attempts.length, 0);
  move(controller, visual);
  element.remove();
  assert.deepEqual(move(controller, visual), { animated: false, reason: 'disconnected' });
  assert.equal(visual.live.size, 0);
  controller.destroy();
  assert.equal(f.mediaListeners.size, 0);
});
