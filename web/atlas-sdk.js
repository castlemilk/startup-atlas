import '@ui-sdk/web/button';
import '@ui-sdk/web/checkbox';
import '@ui-sdk/web/dialog';
import '@ui-sdk/web/input';
import '@ui-sdk/web/popover';
import '@ui-sdk/web/select';
import '@ui-sdk/web/segmented-control';
import '@ui-sdk/web/tabs';
import { createAgent } from '@ui-sdk/web/agent';
import { escapeHtml as esc } from './logic.js';
import { renderIcon } from './atlas-icons.js';

const installations = new WeakMap();
export const atlasUIAgent = typeof document === 'undefined' ? null : createAgent();

function controlLabel(control) {
  if (control.dataset.atlasLabel) return control.dataset.atlasLabel;
  if (control.getAttribute('aria-label')) return control.getAttribute('aria-label');
  const labels = Array.from(control.labels || [], label => {
    const copy = label.cloneNode(true);
    copy.querySelectorAll('select,input,button,ui-select').forEach(child => child.remove());
    return copy.textContent.trim();
  });
  return labels.filter(Boolean).join(' ') || control.placeholder || control.id;
}

export function installAtlasSDK(doc = document) {
  if (installations.has(doc)) return installations.get(doc);
  const selections = new Map(), inputs = new Map(), actions = new Map(), checks = new Map();
  let queued = false;

  function enhanceSelect(native) {
    const label = controlLabel(native), root = doc.createElement('ui-select');
    root.className = 'atlas-sdk-select' + (native.dataset.atlasFacet ? ' facet-picker' : '');
    root.dataset.nativeId = native.id;
    if (native.dataset.atlasFacet) root.dataset.facet = native.dataset.atlasFacet;
    root.setAttribute('default-value', native.value);
    const glyph = native.dataset.atlasIcon;
    root.innerHTML = `<ui-select-label class="sr-only">${esc(label)}</ui-select-label><ui-select-trigger><button type="button" id="${esc(native.id)}-trigger" class="atlas-select-trigger${glyph ? ' facet-trigger' : ''}">${glyph ? `<span class="facet-icon" aria-hidden="true">${renderIcon(glyph)}</span>` : ''}<ui-select-value></ui-select-value><span class="atlas-select-chevron" aria-hidden="true">${renderIcon('chevron-down')}</span></button></ui-select-trigger><ui-select-content class="atlas-select-content${glyph ? ' facet-panel' : ''}" align="start" side-offset="6" collision-padding="12" keep-mounted></ui-select-content>`;
    native.dataset.atlasNative = 'select';
    native.after(root);
    native.hidden = true;
    selections.set(native, { root, signature: '' });
    for (const original of native.labels || []) {
      if (original.htmlFor === native.id) original.htmlFor = native.id + '-trigger';
    }
    root.addEventListener('valuechange', event => {
      if (event.target !== root || event.detail.value === null) return;
      native.value = String(event.detail.value);
      native.dispatchEvent(new Event('change', { bubbles: true }));
    });
    syncSelect(native, selections.get(native));
  }

  function syncSelect(native, entry) {
    const { root } = entry;
    if (native.dataset.atlasFacet && !root.dataset.facet) {
      root.dataset.facet = native.dataset.atlasFacet;
      root.classList.add('facet-picker');
      const trigger = root.querySelector('.atlas-select-trigger');
      trigger.classList.add('facet-trigger');
      if (native.dataset.atlasIcon) trigger.insertAdjacentHTML('afterbegin', `<span class="facet-icon" aria-hidden="true">${renderIcon(native.dataset.atlasIcon)}</span>`);
      root.querySelector('ui-select-content').classList.add('facet-panel');
      root.querySelector('ui-select-label').textContent = native.dataset.atlasLabel;
      entry.signature = '';
    }
    const options = Array.from(native.options, option => ({ value: option.value, label: option.textContent.trim(), disabled: option.disabled }));
    const signature = JSON.stringify(options);
    if (signature !== entry.signature) {
      entry.signature = signature;
      root.querySelector('ui-select-content').innerHTML = options.map(option => `<ui-select-item class="atlas-select-option${native.dataset.atlasFacet ? ' facet-option' : ''}" value="${esc(option.value)}" data-value="${esc(option.value)}"${option.disabled ? ' disabled' : ''}><span>${esc(option.label)}</span><ui-select-item-indicator aria-hidden="true">${renderIcon('check')}</ui-select-item-indicator></ui-select-item>`).join('');
      root.items = options;
    }
    if (root.value !== native.value) root.value = native.value;
    if (root.disabled !== native.disabled) root.disabled = native.disabled;
    const active = String(native.value !== 'all');
    if (root.dataset.active !== active) root.dataset.active = active;
  }

  function enhanceInput(native) {
    const wrapper = doc.createElement('ui-input');
    const parent = native.parentElement;
    const clear = parent.querySelector('[data-atlas-clear-for="' + native.id + '"]');
    if (clear) {
      const group = doc.createElement('ui-input-group');
      group.className = 'atlas-sdk-input-group';
      while (parent.firstChild) group.append(parent.firstChild);
      parent.append(group);
      const part = doc.createElement('ui-input-clear');
      clear.before(part);
      part.append(clear);
    }
    native.before(wrapper);
    wrapper.append(native);
    inputs.set(native, wrapper);
  }

  function enhanceButton(native) {
    const wrapper = doc.createElement('ui-button');
    if (native.disabled) wrapper.disabled = true;
    native.before(wrapper);
    wrapper.append(native);
    actions.set(native, wrapper);
  }

  function enhanceCheckbox(native) {
    const label = controlLabel(native), wrapper = doc.createElement('ui-checkbox');
    wrapper.id = native.id + '-control';
    wrapper.className = 'atlas-sdk-checkbox';
    wrapper.setAttribute('aria-label', label);
    if (native.checked) wrapper.setAttribute('default-checked', '');
    wrapper.innerHTML = `<ui-checkbox-indicator aria-hidden="true">${renderIcon('check')}</ui-checkbox-indicator>`;
    const parentLabel = native.closest('label');
    native.before(wrapper);
    if (parentLabel) parentLabel.after(native);
    native.hidden = true;
    native.dataset.atlasNative = 'checkbox';
    wrapper.addEventListener('checkedchange', event => {
      native.checked = event.detail.value === true;
      native.dispatchEvent(new Event('change', { bubbles: true }));
    });
    checks.set(native, wrapper);
  }

  function sync() {
    queued = false;
    for (const native of doc.querySelectorAll('select[id]:not([data-atlas-native])')) enhanceSelect(native);
    for (const native of doc.querySelectorAll('input[type="search"]')) {
      if (!native.closest('ui-input,ui-select')) enhanceInput(native);
    }
    for (const native of doc.querySelectorAll('input[type="checkbox"][id]:not([data-atlas-native])')) enhanceCheckbox(native);
    for (const native of doc.querySelectorAll('button, a.atlas-button, .atlas-view-nav a')) {
      if (native.closest('ui-button,ui-dialog-trigger,ui-dialog-close,ui-input-clear,ui-popover-trigger,ui-popover-close,ui-select,ui-segmented-control,ui-tabs-tab') || native.matches('[role="tab"]')) continue;
      enhanceButton(native);
    }
    for (const [native, entry] of selections) {
      if (!native.isConnected) { selections.delete(native); continue; }
      syncSelect(native, entry);
    }
    for (const [native, wrapper] of inputs) {
      if (!native.isConnected) { inputs.delete(native); continue; }
      if (wrapper.value !== native.value) wrapper.value = native.value;
    }
    for (const [native, wrapper] of actions) {
      if (!native.isConnected) { actions.delete(native); continue; }
      if (wrapper.disabled !== Boolean(native.disabled)) wrapper.disabled = Boolean(native.disabled);
    }
    for (const [native, wrapper] of checks) {
      if (!native.isConnected) { checks.delete(native); continue; }
      if (wrapper.checked !== native.checked) wrapper.checked = native.checked;
      if (wrapper.disabled !== native.disabled) wrapper.disabled = native.disabled;
    }
  }

  function queue() {
    if (!queued) { queued = true; queueMicrotask(sync); }
  }

  const observer = new MutationObserver(queue);
  const installation = { sync, destroy() { observer.disconnect(); doc.removeEventListener('atlas:controls-sync', queue); doc.removeEventListener('change', queue); doc.removeEventListener('input', queue); installations.delete(doc); } };
  installations.set(doc, installation);
  sync();
  observer.observe(doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled'] });
  doc.addEventListener('atlas:controls-sync', queue);
  doc.addEventListener('change', queue);
  doc.addEventListener('input', queue);
  doc.body.dataset.atlasSdk = 'ready';
  return installation;
}

if (typeof document !== 'undefined' && document.body) {
  window.atlasUIAgent = atlasUIAgent;
  installAtlasSDK();
}
