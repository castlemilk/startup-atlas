import { mountInspector } from './inspector.js';

const root = document.querySelector('[data-fi-root]');
const parameters = new URLSearchParams(location.search);
const options = {};
if (parameters.get('linear') === 'off') options.supportsLinear = () => false;
if (parameters.get('motion') === 'fail') options.loadMotion = () => Promise.reject(new Error('Deliberate specimen motion failure.'));
let controller = mountInspector(root, options);
const timers = new Set();
const diagnostics = document.querySelector('[data-fi-diagnostics]');
const mountButton = document.querySelector('[data-fi-mount]');
const selectButtons = [...root.querySelectorAll('[data-fi-select]')];

function after(delay, action) {
  const timer = setTimeout(() => { timers.delete(timer); action(); }, delay);
  timers.add(timer);
}

function inspect(index) {
  const opener = selectButtons[index];
  controller.select(opener.dataset.fiSelect, { opener });
}

function read() {
  diagnostics.textContent = JSON.stringify({ ...controller.snapshot(), cssEasing: root.dataset.fiEasing,
    forcedUnsupportedLinear: parameters.get('linear') === 'off', forcedMotionFailure: parameters.get('motion') === 'fail',
    viewport: { width: innerWidth, height: innerHeight } }, null, 2);
}

document.querySelector('[data-fi-theme]').addEventListener('click', event => {
  const dark = root.dataset.theme !== 'dark';
  root.dataset.theme = dark ? 'dark' : 'light';
  document.documentElement.dataset.theme = root.dataset.theme;
  event.currentTarget.textContent = dark ? 'Show light specimen' : 'Show dark specimen';
});
document.querySelector('[data-fi-burst]').addEventListener('click', () => {
  inspect(0);
  after(35, () => inspect(1));
  after(65, () => { inspect(2); read(); });
});
document.querySelector('[data-fi-reverse]').addEventListener('click', () => {
  inspect(0);
  after(40, () => controller.close());
  after(80, () => { inspect(1); read(); });
});
mountButton.addEventListener('click', () => {
  timers.forEach(clearTimeout);
  timers.clear();
  if (controller.snapshot().destroyed) {
    controller = mountInspector(root, options);
    mountButton.textContent = 'Unmount inspector';
  } else {
    controller.destroy();
    mountButton.textContent = 'Mount inspector';
  }
  read();
});
document.querySelector('[data-fi-read]').addEventListener('click', read);
window.addEventListener('pagehide', () => {
  timers.forEach(clearTimeout);
  timers.clear();
  controller.destroy(false);
});
window.addEventListener('pageshow', event => {
  if (event.persisted && controller.snapshot().destroyed) {
    controller = mountInspector(root, options);
    mountButton.textContent = 'Unmount inspector';
  }
});
// Test-only public harness; the production host would retain its own controller handle.
window.atlasInspectorSpecimen = { get controller() { return controller; }, read, inspect };
read();
