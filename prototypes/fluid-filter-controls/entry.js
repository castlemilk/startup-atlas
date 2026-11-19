import '@ui-sdk/web/segmented-control';
import '@ui-sdk/web/button';
import '@ui-sdk/web/input';
import '@ui-sdk/web/select';
import { createAgent } from '@ui-sdk/web/agent';
import { mountFilterControls } from './controller.js';

const agent = createAgent();
const root = document.querySelector('[data-fluid-controls]');
const mode = document.querySelector('[data-example-mode]');
const theme = document.querySelector('[data-example-theme]');
const fallback = document.querySelector('[data-example-fallback]');
const note = document.querySelector('[data-example-status]');
const params = new URLSearchParams(location.search);
mode.value = ['fluid', 'baseline', 'reduced'].includes(params.get('mode')) ? params.get('mode') : 'fluid';
theme.value = params.get('theme') === 'dark' ? 'dark' : 'light';
fallback.checked = params.get('fallback') === 'true';
root.dataset.theme = theme.value;
let controller;

function status() {
  const state = controller?.getMotionState();
  if (!state) return;
  note.textContent = state.reduced ? 'Reduced motion: immediate selection and feedback.' :
    state.mode === 'baseline' ? 'Baseline: the same controls with no decorative transition.' :
    state.curve === 'unavailable' ? 'Motion unavailable: baseline controls remain usable.' :
    state.curve === 'pending' ? 'Controls ready. Preparing the optional spring curve.' :
    state.curve === 'fallback' ? 'Compatibility easing: finite Atlas transition.' : 'Fluid curve: a finite transition follows each selection.';
}

function mount() {
  controller = mountFilterControls(root, { mode: mode.value });
  controller.setFallback(fallback.checked);
  status();
}

await Promise.all(['ui-segmented-control', 'ui-input', 'ui-button', 'ui-select'].map(tag => customElements.whenDefined(tag)));
mount();
for (const control of [mode, theme, fallback]) control.disabled = false;
mode.addEventListener('change', () => { controller.setMode(mode.value); status(); });
theme.addEventListener('change', () => { root.dataset.theme = theme.value; });
fallback.addEventListener('change', () => { controller.setFallback(fallback.checked); status(); });
root.addEventListener('filtermotionstatus', status);
window.addEventListener('pagehide', () => { controller.destroy(); });
window.addEventListener('pageshow', event => { if (event.persisted) mount(); });

// Local acceptance and manual remount surface, confined to this prototype page.
window.atlasFilterSpecimen = { agent, mountFilterControls, get controller() { return controller; } };
