import { loadMotionRuntime } from './runtime-loader.js';

const owners = new WeakMap();

/** Own only this root's decorative layers; return complete, idempotent cleanup. */
export function mountMotionPilot(root, { loadRuntime = loadMotionRuntime } = {}) {
  owners.get(root)?.();
  const document = root.ownerDocument;
  const window = document.defaultView;
  const stage = root.querySelector('[data-motion-stage]');
  const layers = [...root.querySelectorAll('[data-motion-layer]')];
  const replay = root.querySelector('[data-motion-replay]');
  const still = root.querySelector('[data-motion-still]');
  const status = root.querySelector('[data-motion-status]');
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  let disposed = false, manual = still.checked, played = false;
  let runtime, media, loading, failed = false, play, settle;
  const observesSize = typeof window.ResizeObserver === 'function';
  const rootStyle = window.getComputedStyle(root);
  const contentWidth = root.getBoundingClientRect().width -
    ['paddingLeft', 'paddingRight', 'borderLeftWidth', 'borderRightWidth']
      .reduce((sum, property) => sum + (parseFloat(rootStyle[property]) || 0), 0);
  let compactWidth = Number.isFinite(contentWidth) && contentWidth > 0
    ? contentWidth <= 640 : window.matchMedia('(max-width: 640px)').matches;

  function inViewport() {
    const bounds = stage.getBoundingClientRect();
    return bounds.width > 0 && bounds.height > 0 && bounds.bottom > 0 && bounds.top < window.innerHeight;
  }

  function controls() {
    if (disposed) return;
    still.disabled = preference.matches;
    replay.disabled = preference.matches || manual || !play;
    let state, message;
    if (preference.matches) [state, message] = ['reduced', 'Your device requests reduced motion. The complete artwork stays still.'];
    else if (manual) [state, message] = ['static', 'Artwork is kept still. All content and research links remain available.'];
    else if (failed) [state, message] = ['unavailable', 'Motion is unavailable. The complete artwork and research links remain available.'];
    else if (play) [state, message] = ['ready', 'Plays once on entry. Replay when you choose, or keep the artwork still.'];
    else [state, message] = ['loading', 'The artwork is ready. Motion controls are loading.'];
    root.dataset.motionState = state;
    status.textContent = message;
  }

  function revert() {
    const previous = media;
    media = null;
    previous?.revert();
    play = settle = undefined;
  }

  function initialise() {
    if (disposed || media || !runtime || preference.matches || manual) return;
    const { gsap, ScrollTrigger } = runtime;
    media = gsap.matchMedia();
    const conditions = { allowed: '(prefers-reduced-motion: no-preference)' };
    if (!observesSize) conditions.compact = '(max-width: 640px)';
    media.add(conditions, context => {
      if (!context.conditions.allowed || manual || disposed) return;
      const compact = observesSize ? compactWidth : context.conditions.compact;
      const token = window.getComputedStyle(root).getPropertyValue('--atlas-duration-normal').trim();
      const milliseconds = parseFloat(token) * (token.endsWith('ms') ? 1 : 1000);
      const normal = Number.isFinite(milliseconds) && milliseconds > 0 ? milliseconds / 1000 : .24;
      const duration = compact ? normal : normal * 2;
      const gap = compact ? normal / 6 : normal / 2;
      const distance = compact ? 6 : 16;
      const timeline = gsap.timeline({ paused: true, defaults: { ease: 'power2.out' } });
      layers.forEach((layer, index) => {
        timeline.fromTo(layer, {
          x: index === 1 ? distance : -distance,
          y: distance,
          rotation: compact ? 0 : (index === 1 ? 1 : -1),
          scale: compact ? 1 : .98,
          opacity: .86,
        }, {
          x: 0, y: 0, rotation: 0, scale: 1, opacity: 1,
          duration, immediateRender: false,
        }, index * gap);
      });
      play = () => {
        if (disposed || preference.matches || manual || document.hidden || !inViewport()) return;
        played = true;
        timeline.restart();
      };
      settle = () => { timeline.pause().progress(1); };
      const enter = () => { if (!played) play?.(); };
      ScrollTrigger.create({
        trigger: stage, start: 'top 85%', end: 'bottom top', once: true,
        onEnter: enter, onEnterBack: enter,
      });
      controls();
      return () => { play = settle = undefined; };
    }, root);
    controls();
  }

  async function sync() {
    if (disposed) return;
    if (preference.matches || manual) { revert(); controls(); return; }
    controls();
    if (runtime) { initialise(); return; }
    if (loading || failed) return;
    // The device preference and manual control gate even the vendor requests.
    loading = Promise.resolve().then(() => loadRuntime(document));
    try {
      runtime = await loading;
      if (!disposed) initialise();
    } catch {
      if (!disposed) { failed = true; revert(); }
    } finally {
      loading = null;
      controls();
    }
  }

  const onReplay = () => play?.();
  const onStill = () => { manual = still.checked; void sync(); };
  const onPreference = () => { void sync(); };
  const onVisibility = () => { if (document.hidden) settle?.(); };
  // Visibility is a separate stop guarantee, including a fast scroll that skips
  // the ScrollTrigger interval. Re-entry never forces a replay.
  const observer = window.IntersectionObserver ? new window.IntersectionObserver(entries => {
    if (entries.some(entry => entry.target === stage && !entry.isIntersecting)) settle?.();
  }) : null;
  // Container-sized embeds can be narrow inside a wide desktop. Rebuild only
  // this root when its content box crosses the CSS container breakpoint.
  const resizeObserver = observesSize ? new window.ResizeObserver(entries => {
    if (disposed) return;
    const entry = entries.find(entry => entry.target === root);
    if (!entry) return;
    const width = entry.contentRect.width;
    if (!Number.isFinite(width) || width <= 0) return;
    const compact = width <= 640;
    if (compact === compactWidth) return;
    compactWidth = compact;
    revert();
    initialise();
    controls();
  }) : null;

  function destroy() {
    if (disposed) return;
    disposed = true;
    observer?.disconnect();
    resizeObserver?.disconnect();
    replay.removeEventListener('click', onReplay);
    still.removeEventListener('change', onStill);
    preference.removeEventListener('change', onPreference);
    document.removeEventListener('visibilitychange', onVisibility);
    revert();
    replay.disabled = still.disabled = true;
    status.textContent = 'Static artwork. All content and research links remain available.';
    root.dataset.motionState = 'destroyed';
    delete root.dataset.motionMounted;
    if (owners.get(root) === destroy) owners.delete(root);
  }

  owners.set(root, destroy);
  root.dataset.motionMounted = 'true';
  replay.addEventListener('click', onReplay);
  still.addEventListener('change', onStill);
  preference.addEventListener('change', onPreference);
  document.addEventListener('visibilitychange', onVisibility);
  observer?.observe(stage);
  resizeObserver?.observe(root);
  void sync();
  return destroy;
}
