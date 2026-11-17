// Only this standalone artwork route loads these pinned, self-hosted UMD files.
// Cache a successful load per document; a destroyed owner cannot mount late work.
const pendingLoads = new WeakMap();
const version = '3.15.1';

function loadScript(document, name) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const timeout = document.defaultView.setTimeout(() => finish(new Error(`Motion runtime timed out: ${name}`)), 8000);
    function finish(error) {
      document.defaultView.clearTimeout(timeout);
      script.onload = script.onerror = null;
      if (error) { script.remove(); reject(error); }
      else resolve();
    }
    script.src = new URL(`./vendor/${name}`, import.meta.url).href;
    script.async = true;
    script.onload = () => finish();
    script.onerror = () => finish(new Error(`Motion runtime unavailable: ${name}`));
    document.head.append(script);
  });
}

export function loadMotionRuntime(document) {
  if (pendingLoads.has(document)) return pendingLoads.get(document);
  const promise = (async () => {
    const window = document.defaultView;
    // A host that already supplies GSAP should inject loadRuntime instead. Do
    // not replace a different global runtime or silently bind to its version.
    if (window.gsap && window.gsap.version !== version) throw new Error('Host GSAP version differs from the isolated pilot');
    if (window.ScrollTrigger && window.ScrollTrigger.version !== version) throw new Error('Host ScrollTrigger version differs from the isolated pilot');
    if (!window.gsap) await loadScript(document, 'gsap.min.js');
    if (!window.ScrollTrigger) await loadScript(document, 'ScrollTrigger.min.js');
    if (window.gsap?.version !== version || window.ScrollTrigger?.version !== version) throw new Error('Motion runtime did not initialise');
    window.gsap.registerPlugin(window.ScrollTrigger);
    return { gsap: window.gsap, ScrollTrigger: window.ScrollTrigger };
  })();
  pendingLoads.set(document, promise);
  promise.catch(() => pendingLoads.delete(document));
  return promise;
}
