import { JSDOM } from 'jsdom';

export function setupAtlasDOM() {
  const dom = new JSDOM('<!doctype html><html lang="en"><head></head><body></body></html>', {
    url: 'https://atlas.example/startup-atlas/',
    pretendToBeVisual: true,
  });
  const { window } = dom;
  for (const name of ['window', 'document', 'HTMLElement', 'Element', 'Node', 'Document', 'HTMLInputElement', 'HTMLButtonElement', 'HTMLSelectElement', 'HTMLFormElement', 'HTMLFieldSetElement', 'HTMLLabelElement', 'NodeFilter', 'SVGElement', 'ShadowRoot', 'MutationObserver', 'customElements', 'Event', 'CustomEvent', 'InputEvent', 'KeyboardEvent', 'MouseEvent', 'FocusEvent', 'AbortController', 'AbortSignal']) {
    Object.defineProperty(globalThis, name, { value: name === 'window' ? window : window[name], configurable: true, writable: true });
  }
  Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true });
  globalThis.getComputedStyle = window.getComputedStyle.bind(window);
  globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
  globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
  globalThis.__UI_SDK_STRICT__ = true;
  globalThis.CSS = window.CSS = {
    escape: value => String(value).replace(/[^a-zA-Z0-9_-]/g, character => `\\${character}`),
    supports: () => false,
    registerProperty() {},
  };
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  globalThis.matchMedia = window.matchMedia;
  HTMLElement.prototype.showPopover = function () {};
  HTMLElement.prototype.hidePopover = function () {};
  Element.prototype.getAnimations = () => [];
  Element.prototype.scrollIntoView = function () {};
  Element.prototype.checkVisibility = () => true;
  Element.prototype.getClientRects = () => [];
  document.elementFromPoint = () => null;
  document.elementsFromPoint = () => [];
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.ResizeObserver = globalThis.ResizeObserver;
  const attachInternals = HTMLElement.prototype.attachInternals;
  HTMLElement.prototype.attachInternals = function () {
    const internals = attachInternals.call(this);
    Object.assign(internals, {
      setFormValue() {}, setValidity() {}, checkValidity: () => true, reportValidity: () => true,
    });
    Object.defineProperty(internals, 'states', { value: new Set(), configurable: true });
    return internals;
  };
  document.head.append(Object.assign(document.createElement('style'), { textContent: '[popover] { display: block !important }' }));
  return dom;
}

export async function settleAtlasDOM() {
  await new Promise(resolve => setTimeout(resolve, 0));
  await new Promise(resolve => setTimeout(resolve, 0));
}
