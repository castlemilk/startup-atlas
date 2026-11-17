const owners = new WeakMap();

export function mountInspector(root, options = {}) {
  if (!root?.isConnected) throw new TypeError('A connected inspector root is required.');
  owners.get(root)?.destroy(false);
  const document = root.ownerDocument;
  const window = document.defaultView;
  const panel = root.querySelector('[data-fi-panel]');
  const title = root.querySelector('[data-fi-title]');
  const content = root.querySelector('[data-fi-content]');
  const fallback = root.querySelector('[data-fi-fallback]');
  const status = root.querySelector('[data-fi-status]');
  const empty = root.querySelector('[data-fi-empty]');
  const staticContent = root.querySelector('[data-fi-static]');
  const buttons = [...root.querySelectorAll('[data-fi-select]')];
  const controls = buttons.map(button => ({ button, row: button.closest('[data-fi-row]') }));
  const templates = new Map([...root.querySelectorAll('template[data-fi-record]')].map(template => [template.dataset.fiRecord, template]));
  if (!panel || !title || !content || !fallback || !status || !empty || !staticContent || !templates.size) {
    throw new TypeError('The complete authored inspector markup is required.');
  }
  if (typeof panel.showModal !== 'function' || typeof panel.show !== 'function') {
    status.textContent = 'Inline record details are available below.';
    return { select: () => false, close: () => false, destroy() {}, snapshot: () => ({ phase: 'unsupported', pendingFrames: 0 }) };
  }
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const narrow = window.matchMedia('(max-width: 700px)');
  const cleanups = [];
  const loadMotion = options.loadMotion || (() => import('./vendor/usefluid-motion-0.1.2/index.js'));
  const supportsLinear = options.supportsLinear || (easing => window.CSS?.supports('transition-timing-function', easing) === true);
  let spring = null;
  let destroyed = false;
  let intendedOpen = false;
  let selectedId = null;
  let opener = null;
  let frame = null;
  let lastTime = null;
  let elapsed = 0;
  let paints = 0;
  let generation = 0;
  let mode = narrow.matches ? 'modal' : 'nonmodal';
  let phase = 'closed';
  let motionState = 'loading';
  let returnRequested = true;
  let returnAtClose = null;
  let duration = 240;
  const authoredStyle = panel.getAttribute('style');
  const authoredEasing = root.style.getPropertyValue('--fi-selection-easing');
  const authoredEasingPriority = root.style.getPropertyPriority('--fi-selection-easing');

  function listen(target, event, callback) {
    target.addEventListener(event, callback);
    cleanups.push(() => target.removeEventListener(event, callback));
  }

  function syncDiagnostics() {
    root.dataset.fiPhase = phase;
    root.dataset.fiSelected = selectedId || '';
    root.dataset.fiMotion = motionState;
    root.dataset.fiStatic = String(reduced.matches || document.hidden || motionState !== 'ready');
    root.dataset.fiFrames = String(frame === null ? 0 : 1);
    root.dataset.fiPaints = String(paints);
    root.dataset.fiMode = mode;
  }

  function cancelFrame() {
    if (frame !== null) window.cancelAnimationFrame(frame);
    frame = null;
    lastTime = null;
  }

  function syncSelection(id) {
    for (const { button, row } of controls) {
      const owned = root.contains(button);
      const selected = owned && button.dataset.fiSelect === id;
      if (owned) button.setAttribute('aria-expanded', String(selected));
      if (row && root.contains(row)) row.dataset.selected = String(selected);
    }
  }

  function paint(value) {
    const remaining = 1 - Math.min(1, Math.max(0, value));
    panel.style.transform = mode === 'modal'
      ? `translate3d(0, ${remaining * 20}px, 0)`
      : `translate3d(${remaining * -12}px, 0, 0)`;
    paints += 1;
    syncDiagnostics();
  }

  function focusable(element) {
    return element?.isConnected && typeof element.focus === 'function'
      && !element.matches(':disabled,[aria-disabled="true"]')
      && !element.closest('[hidden],[inert]')
      && window.getComputedStyle(element).visibility !== 'hidden'
      && element.getClientRects().length > 0;
  }

  function focusReturn(active) {
    if (document.hidden) return;
    const external = active && active !== document.body && !panel.contains(active);
    if (!returnRequested || (external && active !== returnAtClose && active !== opener)) {
      if (external && focusable(active)) active.focus({ preventScroll: true });
      return;
    }
    const target = focusable(opener) ? opener : focusable(fallback) ? fallback : null;
    target?.focus({ preventScroll: true });
  }

  function complete(activeBeforeClose = document.activeElement) {
    const wasShowing = panel.open || phase === 'opening' || phase === 'open' || phase === 'closing';
    cancelFrame();
    spring?.jump(intendedOpen ? 1 : 0);
    if (intendedOpen) {
      phase = 'open';
      paint(1);
    } else {
      phase = 'closed';
      if (panel.open) panel.close();
      panel.style.removeProperty('transform');
      empty.hidden = false;
      if (wasShowing) focusReturn(activeBeforeClose);
      syncDiagnostics();
    }
  }

  function schedule() {
    if (frame !== null || destroyed) return;
    const ticket = generation;
    frame = window.requestAnimationFrame(time => {
      if (destroyed || ticket !== generation) return;
      frame = null;
      if (reduced.matches || document.hidden || !root.isConnected) {
        if (!root.isConnected) destroy(false);
        else complete();
        return;
      }
      const dt = lastTime === null ? 1 / 60 : Math.min(0.05, Math.max(0, (time - lastTime) / 1000));
      lastTime = time;
      elapsed += dt * 1000;
      const moving = spring.step(dt);
      paint(spring.value);
      if (!moving || elapsed >= duration) complete();
      else schedule();
    });
    syncDiagnostics();
  }

  function transition() {
    generation += 1;
    cancelFrame();
    elapsed = 0;
    const token = window.getComputedStyle(root).getPropertyValue('--atlas-duration-normal').trim();
    duration = token.endsWith('ms') ? Number.parseFloat(token) : token.endsWith('s') ? Number.parseFloat(token) * 1000 : 240;
    if (!Number.isFinite(duration) || duration < 0) duration = 240;
    if (!spring || reduced.matches || document.hidden || duration === 0) return complete();
    spring.target = intendedOpen ? 1 : 0;
    phase = intendedOpen ? 'opening' : 'closing';
    paint(spring.value);
    schedule();
  }

  function show() {
    if (panel.open) return;
    if (mode === 'modal') panel.showModal();
    else panel.show();
  }

  function select(id, { opener: nextOpener = null, focus = 'auto' } = {}) {
    if (destroyed) return false;
    const template = templates.get(id);
    if (!template) return false;
    const priorFocus = document.activeElement;
    const hadPanelFocus = panel.contains(priorFocus);
    const same = intendedOpen && selectedId === id;
    if (nextOpener || selectedId !== id) opener = nextOpener;
    if (same) {
      if (focus === 'panel' && !document.hidden) title.focus({ preventScroll: true });
      return true;
    }
    const wasOpen = intendedOpen;
    selectedId = id;
    intendedOpen = true;
    returnRequested = true;
    title.textContent = template.dataset.fiName;
    content.replaceChildren(template.content.cloneNode(true));
    syncSelection(id);
    empty.hidden = true;
    show();
    status.textContent = `${template.dataset.fiName} selected. Details are available.`;
    if (!document.hidden) {
      if (focus === 'panel' || mode === 'modal' || (focus === 'auto' && hadPanelFocus)
        || (focus === 'preserve' && hadPanelFocus && !priorFocus.isConnected)) title.focus({ preventScroll: true });
      else if (focus === 'preserve' && focusable(priorFocus)) priorFocus.focus({ preventScroll: true });
      else if (focus === 'auto' && nextOpener && focusable(nextOpener)) nextOpener.focus({ preventScroll: true });
    }
    if (!wasOpen) transition();
    else syncDiagnostics();
    return true;
  }

  function close({ reason = 'dismiss', restoreFocus = true } = {}) {
    if (destroyed || !intendedOpen) return false;
    intendedOpen = false;
    selectedId = null;
    returnRequested = restoreFocus;
    returnAtClose = document.activeElement;
    syncSelection(null);
    status.textContent = reason === 'invalidated' ? 'The inspected record is no longer in this view.' : 'Details closed.';
    transition();
    return true;
  }

  function changeMode() {
    if (destroyed) return;
    const nextMode = narrow.matches ? 'modal' : 'nonmodal';
    if (nextMode === mode) return;
    const active = document.activeElement;
    const hadPanelFocus = panel.contains(active);
    mode = nextMode;
    if (panel.open) panel.close();
    if (intendedOpen) {
      show();
      if (!document.hidden && (hadPanelFocus || mode === 'modal')) {
        (focusable(active) && panel.contains(active) ? active : title).focus({ preventScroll: true });
      } else if (!document.hidden && focusable(active)) active.focus({ preventScroll: true });
    }
    // Modality changes settle the current intent; a viewport resize does not replay entry.
    generation += 1;
    complete(active);
  }

  function environmentChanged() {
    if (destroyed) return;
    if (reduced.matches || document.hidden) {
      generation += 1;
      complete();
    }
    syncDiagnostics();
  }

  function destroy(restoreFocus = true) {
    if (destroyed) return;
    destroyed = true;
    generation += 1;
    cancelFrame();
    cleanups.splice(0).forEach(cleanup => cleanup());
    returnRequested = restoreFocus && panel.contains(document.activeElement);
    returnAtClose = document.activeElement;
    if (panel.open) panel.close();
    focusReturn(returnAtClose);
    if (authoredStyle === null) panel.removeAttribute('style');
    else panel.setAttribute('style', authoredStyle);
    for (const button of buttons) {
      if (root.contains(button)) button.disabled = true;
    }
    syncSelection(null);
    intendedOpen = false;
    selectedId = null;
    phase = 'destroyed';
    if (authoredEasing) root.style.setProperty('--fi-selection-easing', authoredEasing, authoredEasingPriority);
    else root.style.removeProperty('--fi-selection-easing');
    root.dataset.fiStatic = 'true';
    staticContent.hidden = false;
    empty.hidden = true;
    status.textContent = 'Interactive inspector unmounted. Inline record details remain available.';
    syncDiagnostics();
    root.dataset.fiStatic = 'true';
    if (owners.get(root) === controller) owners.delete(root);
  }

  const controller = {
    select, close, destroy,
    snapshot: () => ({ selectedId, intendedOpen, phase, mode, motionState, reduced: reduced.matches,
      hidden: document.hidden, pendingFrames: frame === null ? 0 : 1, paints, generation,
      value: spring?.value ?? (intendedOpen ? 1 : 0), velocity: spring?.velocity ?? 0,
      target: spring?.target ?? (intendedOpen ? 1 : 0), destroyed }),
  };
  owners.set(root, controller);
  for (const button of buttons) {
    button.disabled = false;
    button.setAttribute('aria-controls', panel.id);
    listen(button, 'click', () => {
      if (root.contains(button)) select(button.dataset.fiSelect, { opener: button });
    });
  }
  listen(root.querySelector('[data-fi-close]'), 'click', () => close());
  listen(root, 'keydown', event => {
    if (!event.defaultPrevented && event.key === 'Escape' && intendedOpen && mode === 'nonmodal') {
      event.preventDefault();
      close();
    }
  });
  listen(panel, 'cancel', event => { event.preventDefault(); close(); });
  listen(panel, 'keydown', event => {
    if (event.defaultPrevented || event.key !== 'Tab' || event.altKey || event.ctrlKey || event.metaKey
      || mode !== 'modal' || !panel.open || document.hidden) return;
    const stops = [...panel.querySelectorAll('button, a[href], input, select, textarea, summary, [tabindex]')]
      .filter(element => element.tabIndex >= 0 && focusable(element));
    const first = stops[0];
    const last = stops.at(-1);
    const active = document.activeElement;
    // Keep ordinary Tab on a visible action instead of a focused document viewport.
    if (!first || (event.shiftKey && (active === first || active === title)) || (!event.shiftKey && active === last)) {
      event.preventDefault();
      (event.shiftKey ? last : first)?.focus({ preventScroll: true });
      if (!first) title.focus({ preventScroll: true });
    }
  });
  listen(panel, 'close', () => {
    // Native mode-switch close events arrive later, after the same dialog reopened.
    if (!destroyed && !panel.open && intendedOpen) close();
  });
  listen(panel, 'click', event => {
    if (mode !== 'modal' || event.target !== panel) return;
    const rect = panel.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close();
  });
  listen(reduced, 'change', environmentChanged);
  listen(narrow, 'change', changeMode);
  listen(document, 'visibilitychange', environmentChanged);
  staticContent.hidden = true;
  empty.hidden = false;
  status.textContent = 'Choose a record to inspect.';
  syncDiagnostics();
  Promise.resolve().then(loadMotion).then(runtime => {
    if (destroyed || owners.get(root) !== controller) return;
    spring = runtime.createSpring(intendedOpen ? 1 : 0, runtime.springs.firm);
    const { easing } = runtime.springCss(runtime.springs.firm);
    const linear = supportsLinear(easing);
    root.style.setProperty('--fi-selection-easing', linear ? easing : 'cubic-bezier(.2,.8,.2,1)');
    root.dataset.fiEasing = linear ? 'linear' : 'fallback';
    motionState = 'ready';
    syncDiagnostics();
  }).catch(() => {
    if (destroyed || owners.get(root) !== controller) return;
    motionState = 'unavailable';
    spring = null;
    generation += 1;
    complete();
  });
  return controller;
}
