import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { JSDOM } from 'jsdom';
import { mountFilterControls, loadFluidCurve } from '../prototypes/fluid-filter-controls/controller.js';

const html = await readFile(new URL('../prototypes/fluid-filter-controls/index.html', import.meta.url), 'utf8');

function fixture({ reduced = false, visible = true, siblingOf } = {}) {
  const dom = siblingOf?.dom || new JSDOM(html, { pretendToBeVisual: true, url: 'http://localhost/specimen/' });
  const { window } = dom, doc = window.document;
  const root = siblingOf ? siblingOf.root.cloneNode(true) : doc.querySelector('[data-fluid-controls]');
  if (siblingOf) {
    const ids = new Map();
    for (const element of [root, ...root.querySelectorAll('[id]')].filter(element => element.id)) {
      ids.set(element.id, 'sibling-' + element.id);
      element.id = ids.get(element.id);
    }
    for (const element of [root, ...root.querySelectorAll('[for],[aria-labelledby],[aria-describedby],[aria-controls]')]) {
      for (const attribute of ['for', 'aria-labelledby', 'aria-describedby', 'aria-controls']) {
        if (element.hasAttribute(attribute)) element.setAttribute(attribute, element.getAttribute(attribute).split(/\s+/).map(id => ids.get(id) || id).join(' '));
      }
    }
    doc.body.append(root);
  }
  const listeners = new Set();
  const media = {
    matches: reduced,
    addEventListener(name, listener) { listeners.add(listener); },
    removeEventListener(name, listener) { listeners.delete(listener); },
    set(value) { this.matches = value; for (const listener of [...listeners]) listener({ matches: value }); }
  };
  const visibility = siblingOf?.visibility || { visible };
  if (!siblingOf) Object.defineProperty(doc, 'hidden', { configurable: true, get: () => !visibility.visible });
  root.style.setProperty('--atlas-duration-fast', '140ms');
  const animations = [];
  root.querySelector('[data-feedback]').animate = (frames, options) => {
    const animation = { cancelled: false, frames, options, cancel() { this.cancelled = true; } };
    animations.push(animation);
    return animation;
  };
  const marker = root.querySelector('ui-segmented-control-indicator');
  const markerAnimation = { cancelled: 0, cancel() { this.cancelled++; } };
  marker.getAnimations = () => [markerAnimation];
  for (const item of root.querySelectorAll('ui-segmented-control-item')) item.tabIndex = 0;
  let commits = 0;
  root.addEventListener('filtercommit', () => commits++);
  return {
    dom, window, doc, root, media, listeners, animations, markerAnimation, visibility,
    get commits() { return commits; },
    visible(value) { visibility.visible = value; doc.dispatchEvent(new window.Event('visibilitychange')); },
    mount(options = {}) { return mountFilterControls(root, { mediaQuery: media, supportsLinear: true, loadCurve: async () => 'linear(0, 1)', ...options }); },
    scope(value) { root.querySelector('[data-scope]').dispatchEvent(new window.CustomEvent('valuechange', { detail: { value }, cancelable: true })); },
    query(value, extra = {}) {
      const input = root.querySelector('[data-query]'); input.value = value;
      input.dispatchEvent(new window.InputEvent('input', { bubbles: true, ...extra }));
    },
    count() { return Number(root.querySelector('[data-result-count]').textContent); }
  };
}

const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

test('filter selection commits matching records synchronously and ignores unchanged selections', () => {
  const f = fixture(), owner = f.mount();
  assert.equal(f.count(), 8);
  f.scope('startup');
  assert.equal(f.count(), 4);
  assert.equal(owner.getState().scope, 'startup');
  assert.equal(f.root.querySelector('[data-scope]').value, 'startup');
  assert.match(f.root.querySelector('[data-results-status]').textContent, /^4 specimen records/);
  assert.equal(f.commits, 1);
  f.scope('startup');
  assert.equal(f.commits, 1);
  f.scope('partner'); f.scope('provider');
  assert.equal(owner.getState().scope, 'provider');
  assert.equal(f.count(), 2);
  assert.equal(f.commits, 3);
  owner.destroy(); f.dom.window.close();
});

test('search composition leaves committed records unchanged until the completed value', () => {
  const f = fixture(), owner = f.mount(), input = f.root.querySelector('[data-query]');
  input.dispatchEvent(new f.window.CompositionEvent('compositionstart'));
  f.query('Aster', { isComposing: true });
  f.root.querySelector('ui-input').dispatchEvent(new f.window.CustomEvent('valuechange', { detail: { value: 'Aster' } }));
  assert.equal(f.count(), 8);
  assert.equal(owner.getState().query, '');
  input.dispatchEvent(new f.window.CompositionEvent('compositionend'));
  assert.equal(f.count(), 1);
  assert.equal(owner.getState().query, 'Aster');
  assert.equal(f.commits, 1);
  owner.destroy(); f.dom.window.close();
});

test('chip removal and no-match recovery retain deliberate focus destinations', () => {
  const f = fixture(), owner = f.mount();
  f.scope('provider');
  const country = f.root.querySelector('[data-country]');
  country.dispatchEvent(new f.window.CustomEvent('valuechange', { detail: { value: 'GB' } }));
  assert.equal(f.count(), 0);
  assert.equal(f.root.querySelector('[data-empty]').hidden, false);
  const countryChip = f.root.querySelector('[data-remove="country"]');
  countryChip.focus(); countryChip.click();
  assert.equal(f.doc.activeElement, f.root.querySelector('[data-country-trigger]'));
  assert.equal(countryChip.parentElement.hidden, true);
  assert.equal(f.count(), 2);
  const scopeChip = f.root.querySelector('[data-remove="scope"]');
  scopeChip.focus(); scopeChip.click();
  assert.equal(f.doc.activeElement, f.root.querySelector('ui-segmented-control-item[value="all"]'));
  f.query('missing');
  const queryChip = f.root.querySelector('[data-remove="query"]');
  queryChip.focus(); queryChip.click();
  assert.equal(f.doc.activeElement, f.root.querySelector('[data-query]'));
  f.query('missing');
  f.root.querySelector('[data-empty] [data-reset]').click();
  assert.equal(f.count(), 8);
  assert.deepEqual(owner.getState(), { scope: 'all', country: 'all', query: '' });
  assert.equal(f.doc.activeElement, f.root.querySelector('[data-query]'));
  owner.destroy(); f.dom.window.close();
});

test('unrelated filter changes preserve the active IME draft', () => {
  const f = fixture(), owner = f.mount(), input = f.root.querySelector('[data-query]');
  input.dispatchEvent(new f.window.CompositionEvent('compositionstart'));
  f.query('研究', { isComposing: true });
  f.scope('partner');
  const country = f.root.querySelector('[data-country]');
  country.dispatchEvent(new f.window.CustomEvent('valuechange', { detail: { value: 'AU' } }));
  assert.equal(input.value, '研究');
  assert.equal(owner.getState().query, '');
  assert.equal(f.count(), 1);
  input.dispatchEvent(new f.window.CompositionEvent('compositionend'));
  assert.equal(owner.getState().query, '研究');
  assert.equal(f.count(), 0);
  owner.destroy(); f.dom.window.close();
});

test('disposing a filtered specimen describes the retained state truthfully', () => {
  const f = fixture(), owner = f.mount();
  f.scope('partner'); owner.destroy();
  assert.equal(f.count(), 2);
  assert.match(f.root.querySelector('[data-static-note]').textContent, /last applied filters and matching records remain visible/);
  assert.doesNotMatch(f.root.querySelector('[data-static-note]').textContent, /all eight/);
  f.dom.window.close();
});

test('explicit reset clears an uncommitted IME draft even when committed filters are unchanged', () => {
  const f = fixture(), owner = f.mount(), input = f.root.querySelector('[data-query]');
  input.dispatchEvent(new f.window.CompositionEvent('compositionstart'));
  f.query('研究', { isComposing: true });
  f.root.querySelector('[data-reset]').click();
  assert.equal(input.value, '');
  input.dispatchEvent(new f.window.CompositionEvent('compositionend'));
  assert.equal(f.count(), 8);
  assert.equal(owner.getState().query, '');
  owner.destroy(); f.dom.window.close();
});

test('SDK clear reasons discard an active composition and reconcile both input and results', () => {
  for (const reason of ['clear-press', 'imperative']) {
    const f = fixture(), owner = f.mount(), input = f.root.querySelector('[data-query]');
    f.query('Aster');
    input.dispatchEvent(new f.window.CompositionEvent('compositionstart'));
    f.query('Aster研究', { isComposing: true });
    f.root.querySelector('ui-input').dispatchEvent(new f.window.CustomEvent('valuechange', { detail: { value: '', reason } }));
    assert.equal(input.value, '');
    assert.equal(owner.getState().query, '');
    assert.equal(f.count(), 8);
    owner.destroy(); f.dom.window.close();
  }
});

test('live reduced-motion changes cancel owned feedback and never replay on return', async () => {
  const f = fixture(), owner = f.mount(); await flush();
  f.scope('startup');
  assert.equal(f.animations.length, 1);
  assert.equal(f.root.dataset.transitionReady, 'true');
  f.media.set(true);
  assert.equal(f.animations[0].cancelled, true);
  assert.equal(f.root.dataset.transitionReady, 'false');
  assert.equal(owner.getMotionState().allowed, false);
  f.scope('provider');
  assert.equal(f.count(), 2);
  f.media.set(false);
  assert.equal(f.root.dataset.transitionReady, 'false');
  assert.equal(f.animations.length, 1);
  assert.equal(owner.getState().scope, 'provider');
  f.scope('partner');
  assert.equal(f.animations.length, 2);
  owner.destroy(); f.dom.window.close();
});

test('initial reduced motion gates the optional package and preserves all filtering', async () => {
  const f = fixture({ reduced: true }); let calls = 0;
  const owner = f.mount({ loadCurve: async () => { calls++; return 'linear(0, 1)'; } });
  await flush(); assert.equal(calls, 0);
  f.scope('partner'); assert.equal(f.count(), 2);
  f.media.set(false); await flush();
  assert.equal(calls, 1);
  assert.equal(f.animations.length, 0);
  assert.equal(f.root.dataset.transitionReady, 'false');
  owner.destroy(); f.dom.window.close();
});

test('baseline, explicit reduced and unsupported linear paths keep the same committed state', async () => {
  for (const mode of ['baseline', 'reduced', 'fluid']) {
    const f = fixture(), owner = f.mount({ mode, supportsLinear: false }); await flush();
    f.scope('startup'); f.query('Aster');
    assert.equal(f.count(), 1);
    assert.deepEqual(owner.getState(), { scope: 'startup', country: 'all', query: 'Aster' });
    assert.equal(f.root.style.getPropertyValue('--filter-specimen-ease'), 'var(--atlas-ease)');
    if (mode !== 'fluid') assert.equal(f.animations.length, 0);
    else assert.equal(owner.getMotionState().curve, 'fallback');
    owner.destroy(); f.dom.window.close();
  }
});

test('hidden document settles, accepts the latest state and does not replay on visibility return', async () => {
  const f = fixture(), owner = f.mount(); await flush();
  f.scope('partner');
  f.visible(false);
  assert.equal(f.animations[0].cancelled, true);
  assert.equal(f.root.dataset.motionAllowed, 'false');
  f.scope('provider'); f.query('Meridian');
  assert.equal(f.count(), 1);
  f.visible(true);
  assert.equal(f.root.dataset.transitionReady, 'false');
  assert.equal(f.animations.length, 1);
  assert.equal(owner.getState().scope, 'provider');
  owner.destroy(); f.dom.window.close();
});

test('failed motion remains a working baseline without a retry loop', async () => {
  const f = fixture(); let attempts = 0;
  const owner = f.mount({ loadCurve: async () => { attempts++; throw new Error('unavailable'); } });
  await flush();
  assert.equal(owner.getMotionState().curve, 'unavailable');
  f.scope('startup'); assert.equal(f.count(), 4);
  f.media.set(true); f.media.set(false); f.visible(false); f.visible(true);
  await flush(); assert.equal(attempts, 1); assert.equal(f.animations.length, 0);
  owner.destroy(); f.dom.window.close();
});

test('destroy removes listeners, disables the stale root and ignores deferred completion', async () => {
  const f = fixture(); let resolveCurve;
  const owner = f.mount({ loadCurve: () => new Promise(resolve => { resolveCurve = resolve; }) });
  const country = f.root.querySelector('[data-country]');
  let closed = 0;
  country.api = { close() { assert.equal(country.disabled, false); closed++; } };
  await flush(); owner.destroy(); owner.destroy();
  assert.equal(closed, 1);
  assert.equal(f.listeners.size, 0);
  assert.equal(f.root.querySelector('[data-query]').disabled, true);
  resolveCurve('linear(0, 1)'); await flush();
  f.scope('startup'); f.query('Aster');
  assert.equal(f.count(), 8);
  assert.equal(f.root.dataset.motionAllowed, 'false');
  assert.equal(f.root.dataset.ready, 'false');
  f.dom.window.close();
});

test('replacement owns the root and stale destruction cannot disable it', async () => {
  const f = fixture(); let resolveOld;
  const old = f.mount({ loadCurve: () => new Promise(resolve => { resolveOld = resolve; }) });
  await flush(); f.scope('partner');
  const next = f.mount(); await flush();
  assert.equal(f.listeners.size, 1);
  assert.equal(next.getState().scope, 'partner');
  old.destroy(); resolveOld('linear(0, 1)'); await flush();
  assert.equal(f.root.querySelector('[data-query]').disabled, false);
  f.scope('startup'); assert.equal(f.count(), 4);
  assert.equal(f.commits, 2);
  next.destroy(); assert.equal(f.listeners.size, 0); f.dom.window.close();
});

test('sibling roots in one document do not cancel each other’s feedback or listeners', async () => {
  const a = fixture(), b = fixture({ siblingOf: a });
  assert.equal(a.root.ownerDocument, b.root.ownerDocument);
  assert.equal(a.doc.querySelectorAll('[data-fluid-controls]').length, 2);
  assert.notEqual(a.root.id, b.root.id);
  assert.equal(b.root.querySelector('[id="' + b.root.getAttribute('aria-labelledby') + '"]')?.id, 'sibling-specimen-title');
  const ownerA = a.mount(), ownerB = b.mount(); await flush();
  a.scope('startup'); b.scope('partner');
  ownerA.destroy();
  assert.equal(a.animations[0].cancelled, true);
  assert.equal(b.animations[0].cancelled, false);
  assert.equal(b.listeners.size, 1);
  b.scope('provider'); assert.equal(b.count(), 2);
  a.visible(false);
  assert.equal(ownerB.getMotionState().hidden, true);
  assert.equal(b.animations.at(-1).cancelled, true);
  ownerB.destroy(); a.dom.window.close();
});

test('verbatim Fluid files match reviewed provenance and expose the real spring CSS API', async () => {
  const directory = new URL('../prototypes/fluid-filter-controls/vendor/', import.meta.url);
  const manifest = JSON.parse(await readFile(new URL('manifest.json', directory), 'utf8'));
  assert.equal(manifest.version, '0.1.2');
  for (const [name, expected] of Object.entries(manifest.files)) {
    const actual = createHash('sha256').update(await readFile(new URL(name, directory))).digest('hex');
    assert.equal(actual, expected, name);
  }
  assert.match(await loadFluidCurve(), /^linear\(0, .*1\)$/);
});

test('native browser acceptance remains blocked', {
  skip: 'BLOCKED: The existing Chrome permission request is unresolved. Source/DOM checks do not establish native browser acceptance.'
}, () => {});
