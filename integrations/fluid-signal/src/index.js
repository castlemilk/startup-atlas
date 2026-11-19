import { springCss, springs } from '@usefluid/motion';

const firm = springCss(springs.firm);
const owners = new WeakMap();
const policies = new WeakMap();
const roles = { feedback: '--atlas-duration-fast', context: '--atlas-duration-normal' };
const rootSelector = '[data-atlas-fluid]';
const layerSelector = '[data-atlas-fluid-layer]';

export const fluidSignalVersion = Object.freeze({ adapter: '0.1.0', fluid: '0.1.2' });

function assertRoot(root) {
  if (!root?.isConnected || !root.matches?.(rootSelector) || !root.ownerDocument?.defaultView) {
    throw new TypeError('Fluid Signal needs a connected [data-atlas-fluid] root.');
  }
}

function durationMs(value) {
  const match = /^(\d+(?:\.\d+)?|\.\d+)(ms|s)$/.exec(value.trim());
  if (!match) return null;
  const valueMs = Number(match[1]) * (match[2] === 's' ? 1000 : 1);
  return Number.isFinite(valueMs) && valueMs <= 1000 ? valueMs : null;
}

function profile(root, role, reduced, observable) {
  if (!Object.hasOwn(roles, role)) throw new TypeError('Motion role must be feedback or context.');
  const window = root.ownerDocument.defaultView;
  const style = window.getComputedStyle(root);
  const duration = durationMs(style.getPropertyValue(roles[role]));
  const fallback = style.getPropertyValue('--atlas-ease').trim();
  const supports = (value) => window.CSS?.supports?.('animation-timing-function', value) ?? false;
  const linear = supports(firm.easing);
  const validFallback = Boolean(fallback) && (!window.CSS?.supports || supports(fallback));
  const reason = reduced === true ? 'reduced-motion' : !observable || reduced === null ? 'preference-unavailable'
    : duration === null ? 'invalid-duration-token'
    : duration === 0 ? 'zero-duration' : !linear && !validFallback ? 'invalid-easing-token' : null;
  return Object.freeze({
    duration: reason ? 0 : duration,
    easing: linear ? firm.easing : validFallback ? fallback : 'linear',
    fallbackEasing: validFallback ? fallback : null,
    curve: linear ? 'fluid-firm' : 'signal-fallback',
    reason,
  });
}

export function getSignalMotionProfile(root, role = 'context') {
  assertRoot(root);
  const window = root.ownerDocument.defaultView;
  const query = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const observable = Boolean(query?.addEventListener || query?.addListener);
  return profile(root, role, query?.matches ?? null, observable);
}

function acquirePolicy(document, onSuspend) {
  let policy = policies.get(document);
  if (!policy) {
    const window = document.defaultView;
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    let reduced = query?.matches ?? null;
    const subscribers = new Set();
    const suspend = () => { for (const subscriber of [...subscribers]) subscriber(); };
    // Keep diagnostics observational. Reading a watched MQL's matches getter
    // can refresh a browser's comparison cache before its change is delivered.
    const changed = event => {
      reduced = typeof event?.matches === 'boolean' ? event.matches : null;
      if (reduced !== false) suspend();
    };
    const visibility = () => { if (document.hidden) suspend(); };
    const pagehide = () => suspend();
    if (query?.addEventListener) query.addEventListener('change', changed);
    else query?.addListener?.(changed);
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('pagehide', pagehide);
    policy = {
      subscribers,
      observable: Boolean(query?.addEventListener || query?.addListener),
      get reduced() { return reduced; },
      release() {
        if (query?.removeEventListener) query.removeEventListener('change', changed);
        else query?.removeListener?.(changed);
        document.removeEventListener('visibilitychange', visibility);
        window.removeEventListener('pagehide', pagehide);
        policies.delete(document);
      },
    };
    policies.set(document, policy);
  }
  policy.subscribers.add(onSuspend);
  return {
    get reduced() { return policy.reduced; },
    get observable() { return policy.observable; },
    release() {
      policy.subscribers.delete(onSuspend);
      if (!policy.subscribers.size) policy.release();
    },
  };
}

export function mountFluidSignal(root) {
  assertRoot(root);
  owners.get(root)?.destroy();
  const document = root.ownerDocument;
  const window = document.defaultView;
  const active = new Map();
  let disposed = false;

  function remove(layer, entry) {
    if (active.get(layer) !== entry) return;
    active.delete(layer);
    entry.animation.onfinish = null;
    entry.animation.oncancel = null;
    entry.animation.cancel();
  }

  function cancel(layer) {
    const entry = active.get(layer);
    if (entry) remove(layer, entry);
  }

  function settle() {
    for (const [layer, entry] of [...active]) remove(layer, entry);
  }

  const policy = acquirePolicy(document, settle);

  function transition(layer, { from = { x: 0, y: 0 }, role = 'context' } = {}) {
    if (disposed) return { animated: false, reason: 'destroyed' };
    if (!root.isConnected || !layer?.isConnected) { settle(); return { animated: false, reason: 'disconnected' }; }
    if (layer === root || !root.contains(layer) || !layer.matches(layerSelector) || layer.closest(rootSelector) !== root) {
      throw new TypeError('Animate only an exclusive [data-atlas-fluid-layer] inside this root.');
    }
    if (!from || !Number.isFinite(from.x) || !Number.isFinite(from.y)) {
      throw new TypeError('Motion offsets x and y must be finite numbers.');
    }
    const config = profile(root, role, policy.reduced, policy.observable);
    const previous = active.get(layer);
    const current = previous ? window.getComputedStyle(layer).transform : 'none';
    cancel(layer);
    const staticResult = reason => ({ animated: false, reason });
    if (config.reason) return staticResult(config.reason);
    if (document.hidden) return staticResult('hidden');
    if (typeof layer.animate !== 'function') return staticResult('animation-unavailable');
    const finalTransform = window.getComputedStyle(layer).transform;
    if (finalTransform && finalTransform !== 'none') return staticResult('layer-has-transform');
    if (layer.getAnimations?.().some(animation => !['finished', 'idle'].includes(animation.playState))) {
      return staticResult('layer-has-animation');
    }
    if (!previous && from.x === 0 && from.y === 0) return staticResult('unchanged');
    // The host's layout delta and the interrupted visual offset compose before
    // the next paint. Canonical layout stays in the host, not in an animation.
    const interrupted = current && current !== 'none' ? ` ${current}` : '';
    const frames = [{ transform: `translate(${from.x}px, ${from.y}px)${interrupted}` }, { transform: 'none' }];
    const options = { duration: config.duration, easing: config.easing, fill: 'none' };
    let animation;
    try {
      animation = layer.animate(frames, options);
    } catch {
      if (!config.fallbackEasing || config.easing === config.fallbackEasing) return staticResult('animation-unavailable');
      try { animation = layer.animate(frames, { ...options, easing: config.fallbackEasing }); }
      catch { return staticResult('animation-unavailable'); }
    }
    const entry = { animation };
    active.set(layer, entry);
    animation.onfinish = () => remove(layer, entry);
    animation.oncancel = () => remove(layer, entry);
    return { animated: true, reason: null };
  }

  function destroy() {
    if (disposed) return;
    disposed = true;
    settle();
    policy.release();
    if (owners.get(root) === controller) owners.delete(root);
  }

  const controller = Object.freeze({
    transition, cancel, settle, destroy,
    inspect: () => Object.freeze({
      disposed,
      reducedMotion: policy.reduced,
      preferenceObservable: policy.observable,
      hidden: document.hidden,
      activeAnimations: active.size,
    }),
  });
  owners.set(root, controller);
  return controller;
}
