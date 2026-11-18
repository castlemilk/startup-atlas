// Atlas Fluid Signal adapter. Generated from integrations/fluid-signal/src/index.js.
// Includes @usefluid/motion 0.1.2 (MIT); see THIRD-PARTY.txt.

// node_modules/@usefluid/motion/spring.js
var springs = {
  snappy: { w: 22, z: 0.8 },
  soft: { w: 13, z: 0.86 },
  bouncy: { w: 17, z: 0.58 },
  firm: { w: 32, z: 1 }
};
var out = { x: 0, v: 0 };
function stepSpring(x, v, target, w, z, dt) {
  const d = x - target;
  if (z < 1) {
    const wd = w * Math.sqrt(1 - z * z);
    const e = Math.exp(-z * w * dt);
    const c = Math.cos(wd * dt);
    const s = Math.sin(wd * dt);
    const b = (v + z * w * d) / wd;
    out.x = target + e * (d * c + b * s);
    out.v = e * (v * c - (z * w * v + w * w * d) / wd * s);
  } else if (z === 1) {
    const e = Math.exp(-w * dt);
    const b = v + w * d;
    out.x = target + e * (d + b * dt);
    out.v = e * (v - w * b * dt);
  } else {
    const k = w * Math.sqrt(z * z - 1);
    const r1 = -z * w + k;
    const r2 = -z * w - k;
    const a = (v - r2 * d) / (r1 - r2);
    const b = d - a;
    const e1 = Math.exp(r1 * dt);
    const e2 = Math.exp(r2 * dt);
    out.x = target + a * e1 + b * e2;
    out.v = a * r1 * e1 + b * r2 * e2;
  }
  return out;
}
var REST_X = 1e-3;
var REST_V = 0.01;
function createSpring(initial, config = springs.snappy) {
  const spring = {
    value: initial,
    velocity: 0,
    target: initial,
    step(dt) {
      const r = stepSpring(spring.value, spring.velocity, spring.target, config.w, config.z, dt);
      spring.value = r.x;
      spring.velocity = r.v;
      if (Math.abs(r.x - spring.target) < REST_X && Math.abs(r.v) < REST_V) {
        spring.value = spring.target;
        spring.velocity = 0;
        return false;
      }
      return true;
    },
    jump(value) {
      spring.value = spring.target = value;
      spring.velocity = 0;
    }
  };
  return spring;
}
function springCss(config = springs.snappy, samples = 40) {
  let t = 0;
  const dt = 1 / 120;
  const probe = createSpring(0, config);
  probe.target = 1;
  while (probe.step(dt) && t < 6)
    t += dt;
  const replay = createSpring(0, config);
  replay.target = 1;
  const stops = ["0"];
  for (let i = 1; i < samples; i++) {
    replay.step(t / samples);
    stops.push(replay.value.toFixed(4));
  }
  stops.push("1");
  const easing = `linear(${stops.join(", ")})`;
  const duration = Math.round(t * 1e3);
  return {
    easing,
    duration,
    transition(property, delay = 0) {
      return {
        transitionProperty: property,
        transitionDuration: `${duration}ms`,
        transitionDelay: `${delay}ms`,
        transitionTimingFunction: easing
      };
    }
  };
}

// src/index.js
var firm = springCss(springs.firm);
var owners = /* @__PURE__ */ new WeakMap();
var policies = /* @__PURE__ */ new WeakMap();
var roles = { feedback: "--atlas-duration-fast", context: "--atlas-duration-normal" };
var rootSelector = "[data-atlas-fluid]";
var layerSelector = "[data-atlas-fluid-layer]";
var fluidSignalVersion = Object.freeze({ adapter: "0.1.0", fluid: "0.1.2" });
function assertRoot(root) {
  if (!root?.isConnected || !root.matches?.(rootSelector) || !root.ownerDocument?.defaultView) {
    throw new TypeError("Fluid Signal needs a connected [data-atlas-fluid] root.");
  }
}
function durationMs(value) {
  const match = /^(\d+(?:\.\d+)?|\.\d+)(ms|s)$/.exec(value.trim());
  if (!match) return null;
  const valueMs = Number(match[1]) * (match[2] === "s" ? 1e3 : 1);
  return Number.isFinite(valueMs) && valueMs <= 1e3 ? valueMs : null;
}
function profile(root, role, reduced, observable) {
  if (!Object.hasOwn(roles, role)) throw new TypeError("Motion role must be feedback or context.");
  const window = root.ownerDocument.defaultView;
  const style = window.getComputedStyle(root);
  const duration = durationMs(style.getPropertyValue(roles[role]));
  const fallback = style.getPropertyValue("--atlas-ease").trim();
  const supports = (value) => window.CSS?.supports?.("animation-timing-function", value) ?? false;
  const linear = supports(firm.easing);
  const validFallback = Boolean(fallback) && (!window.CSS?.supports || supports(fallback));
  const reason = reduced === true ? "reduced-motion" : !observable || reduced === null ? "preference-unavailable" : duration === null ? "invalid-duration-token" : duration === 0 ? "zero-duration" : !linear && !validFallback ? "invalid-easing-token" : null;
  return Object.freeze({
    duration: reason ? 0 : duration,
    easing: linear ? firm.easing : validFallback ? fallback : "linear",
    fallbackEasing: validFallback ? fallback : null,
    curve: linear ? "fluid-firm" : "signal-fallback",
    reason
  });
}
function getSignalMotionProfile(root, role = "context") {
  assertRoot(root);
  const window = root.ownerDocument.defaultView;
  const query = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  const observable = Boolean(query?.addEventListener || query?.addListener);
  return profile(root, role, query?.matches ?? null, observable);
}
function acquirePolicy(document, onSuspend) {
  let policy = policies.get(document);
  if (!policy) {
    const window = document.defaultView;
    const query = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    let reduced = query?.matches ?? null;
    const subscribers = /* @__PURE__ */ new Set();
    const suspend = () => {
      for (const subscriber of [...subscribers]) subscriber();
    };
    const changed = (event) => {
      reduced = typeof event?.matches === "boolean" ? event.matches : null;
      if (reduced !== false) suspend();
    };
    const visibility = () => {
      if (document.hidden) suspend();
    };
    const pagehide = () => suspend();
    if (query?.addEventListener) query.addEventListener("change", changed);
    else query?.addListener?.(changed);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", pagehide);
    policy = {
      subscribers,
      observable: Boolean(query?.addEventListener || query?.addListener),
      get reduced() {
        return reduced;
      },
      release() {
        if (query?.removeEventListener) query.removeEventListener("change", changed);
        else query?.removeListener?.(changed);
        document.removeEventListener("visibilitychange", visibility);
        window.removeEventListener("pagehide", pagehide);
        policies.delete(document);
      }
    };
    policies.set(document, policy);
  }
  policy.subscribers.add(onSuspend);
  return {
    get reduced() {
      return policy.reduced;
    },
    get observable() {
      return policy.observable;
    },
    release() {
      policy.subscribers.delete(onSuspend);
      if (!policy.subscribers.size) policy.release();
    }
  };
}
function mountFluidSignal(root) {
  assertRoot(root);
  owners.get(root)?.destroy();
  const document = root.ownerDocument;
  const window = document.defaultView;
  const active = /* @__PURE__ */ new Map();
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
  function transition(layer, { from = { x: 0, y: 0 }, role = "context" } = {}) {
    if (disposed) return { animated: false, reason: "destroyed" };
    if (!root.isConnected || !layer?.isConnected) {
      settle();
      return { animated: false, reason: "disconnected" };
    }
    if (layer === root || !root.contains(layer) || !layer.matches(layerSelector) || layer.closest(rootSelector) !== root) {
      throw new TypeError("Animate only an exclusive [data-atlas-fluid-layer] inside this root.");
    }
    if (!from || !Number.isFinite(from.x) || !Number.isFinite(from.y)) {
      throw new TypeError("Motion offsets x and y must be finite numbers.");
    }
    const config = profile(root, role, policy.reduced, policy.observable);
    const previous = active.get(layer);
    const current = previous ? window.getComputedStyle(layer).transform : "none";
    cancel(layer);
    const staticResult = (reason) => ({ animated: false, reason });
    if (config.reason) return staticResult(config.reason);
    if (document.hidden) return staticResult("hidden");
    if (typeof layer.animate !== "function") return staticResult("animation-unavailable");
    const finalTransform = window.getComputedStyle(layer).transform;
    if (finalTransform && finalTransform !== "none") return staticResult("layer-has-transform");
    if (layer.getAnimations?.().some((animation2) => !["finished", "idle"].includes(animation2.playState))) {
      return staticResult("layer-has-animation");
    }
    if (!previous && from.x === 0 && from.y === 0) return staticResult("unchanged");
    const interrupted = current && current !== "none" ? ` ${current}` : "";
    const frames = [{ transform: `translate(${from.x}px, ${from.y}px)${interrupted}` }, { transform: "none" }];
    const options = { duration: config.duration, easing: config.easing, fill: "none" };
    let animation;
    try {
      animation = layer.animate(frames, options);
    } catch {
      if (!config.fallbackEasing || config.easing === config.fallbackEasing) return staticResult("animation-unavailable");
      try {
        animation = layer.animate(frames, { ...options, easing: config.fallbackEasing });
      } catch {
        return staticResult("animation-unavailable");
      }
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
    transition,
    cancel,
    settle,
    destroy,
    inspect: () => Object.freeze({
      disposed,
      reducedMotion: policy.reduced,
      preferenceObservable: policy.observable,
      hidden: document.hidden,
      activeAnimations: active.size
    })
  });
  owners.set(root, controller);
  return controller;
}
export {
  fluidSignalVersion,
  getSignalMotionProfile,
  mountFluidSignal
};
