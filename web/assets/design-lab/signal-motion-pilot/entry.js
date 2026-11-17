import { mountMotionPilot } from './motion.js';

const root = document.querySelector('[data-motion-pilot]');
let destroy;
function mount() {
  destroy?.();
  destroy = root ? mountMotionPilot(root) : undefined;
}
window.addEventListener('pagehide', () => { destroy?.(); destroy = undefined; });
window.addEventListener('pageshow', event => { if (event.persisted) mount(); });
mount();
