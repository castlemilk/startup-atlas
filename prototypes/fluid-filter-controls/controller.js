const owners = new WeakMap();
const scopes = { all: 'All records', startup: 'Startups', partner: 'Partners', provider: 'Providers' };
const countries = { all: 'Any country', AU: 'Australia', NZ: 'New Zealand', GB: 'United Kingdom', US: 'United States' };
const modes = new Set(['fluid', 'baseline', 'reduced']);

export async function loadFluidCurve() {
  const { springCss } = await import('./vendor/spring.js');
  return springCss({ w: 44, z: 1 }).easing;
}

export function mountFilterControls(root, options = {}) {
  owners.get(root)?.destroy();
  const doc = root.ownerDocument, win = doc.defaultView;
  const group = root.querySelector('[data-scope]');
  const marker = root.querySelector('ui-segmented-control-indicator');
  const inputPart = root.querySelector('ui-input');
  const input = root.querySelector('[data-query]');
  const country = root.querySelector('[data-country]');
  const countryTrigger = root.querySelector('[data-country-trigger]');
  const status = root.querySelector('[data-results-status]');
  const feedback = root.querySelector('[data-feedback]');
  const chips = [...root.querySelectorAll('[data-remove]')];
  const rows = [...root.querySelectorAll('[data-record]')];
  const media = options.mediaQuery || win.matchMedia('(prefers-reduced-motion: reduce)');
  const loadCurve = options.loadCurve || loadFluidCurve;
  const supportsLinear = options.supportsLinear ?? Boolean(win.CSS?.supports('transition-timing-function', 'linear(0, 1)'));
  const events = new win.AbortController();
  const running = new Set();
  let alive = true, composing = false, curve = null, requested = false, failed = false;
  let mode = modes.has(options.mode) ? options.mode : 'fluid';
  let forceFallback = false;
  let state = {
    scope: Object.hasOwn(scopes, group.value) ? group.value : 'all',
    country: country.value || 'all',
    query: input.value || ''
  };

  function setDisabled(disabled) {
    for (const control of root.querySelectorAll('ui-segmented-control, ui-select, ui-button, input, button')) control.disabled = disabled;
  }

  function stopMotion() {
    root.dataset.transitionReady = 'false';
    for (const animation of running) animation.cancel();
    running.clear();
    for (const animation of marker.getAnimations?.() || []) animation.cancel();
    // Commit the final CSS geometry before a later action re-enables transitions.
    void marker.getBoundingClientRect();
  }

  function allowed() {
    return alive && mode === 'fluid' && Boolean(curve) && !media.matches && !doc.hidden;
  }

  function policy() {
    stopMotion();
    root.dataset.mode = mode;
    root.dataset.motionAllowed = String(allowed());
    root.dataset.reduced = String(media.matches || mode === 'reduced');
    root.dataset.curve = failed ? 'unavailable' : !curve ? 'pending' : supportsLinear && !forceFallback ? 'linear' : 'fallback';
    root.style.setProperty('--filter-specimen-ease', supportsLinear && !forceFallback && curve ? curve : 'var(--atlas-ease)');
    root.dispatchEvent(new win.CustomEvent('filtermotionstatus', { detail: motionState() }));
    if (!requested && mode === 'fluid' && !media.matches && !doc.hidden) {
      requested = true;
      Promise.resolve().then(loadCurve).then(value => {
        if (!alive) return;
        if (typeof value !== 'string' || !value.startsWith('linear(')) throw new TypeError('Expected a CSS spring curve');
        curve = value;
        policy();
      }).catch(() => {
        if (!alive) return;
        failed = true;
        policy();
      });
    }
  }

  function pulse() {
    for (const animation of running) animation.cancel();
    running.clear();
    if (!allowed() || !feedback.animate) return;
    const style = win.getComputedStyle(root);
    const duration = Number.parseFloat(style.getPropertyValue('--atlas-duration-fast')) || 0;
    if (!duration) return;
    const animation = feedback.animate([{ opacity: 0.16 }, { opacity: 0 }], { duration, easing: 'ease-out' });
    running.add(animation);
    animation.onfinish = () => { running.delete(animation); };
  }

  function render(announce = true) {
    group.value = state.scope;
    country.value = state.country;
    if (!composing) {
      inputPart.value = state.query;
      input.value = state.query;
    }
    const query = state.query.trim().toLocaleLowerCase();
    let visible = 0;
    for (const row of rows) {
      row.hidden = !((state.scope === 'all' || row.dataset.type === state.scope) &&
        (state.country === 'all' || row.dataset.country === state.country) &&
        (!query || row.textContent.toLocaleLowerCase().includes(query)));
      if (!row.hidden) visible++;
    }
    const labels = {
      scope: state.scope === 'all' ? '' : scopes[state.scope],
      country: state.country === 'all' ? '' : countries[state.country],
      query: state.query.trim() ? 'Search: ' + state.query : ''
    };
    for (const chip of chips) {
      const label = labels[chip.dataset.remove];
      chip.parentElement.hidden = !label;
      chip.querySelector('[data-chip-label]').textContent = label;
      chip.setAttribute('aria-label', 'Remove ' + (chip.dataset.remove === 'scope' ? 'entity type' : chip.dataset.remove) + ' filter: ' + label);
    }
    const count = Object.values(labels).filter(Boolean).length;
    root.querySelector('[data-no-filters]').hidden = count > 0;
    root.querySelector('[data-result-count]').textContent = String(visible);
    root.querySelector('[data-empty]').hidden = visible > 0;
    const message = visible + ' specimen record' + (visible === 1 ? '' : 's') + '. ' + (count ? count + ' active filter' + (count === 1 ? '.' : 's.') : 'No active filters.');
    if (status.textContent !== message) status.textContent = message;
    if (announce) root.dispatchEvent(new win.CustomEvent('filtercommit', { detail: { ...state, visible } }));
  }

  function commit(next, focus, reconcile = false) {
    if (!alive) return;
    const changed = Object.keys(next).some(key => state[key] !== next[key]);
    if (!changed) { if (reconcile) render(false); focus?.focus(); return; }
    root.dataset.transitionReady = String(allowed());
    state = { ...state, ...next };
    render();
    focus?.focus();
    pulse();
  }

  function focusScope() {
    return group.querySelector('ui-segmented-control-item[value="all"]');
  }

  function onInput(event) {
    if (composing || event.isComposing) return;
    commit({ query: input.value });
  }

  group.addEventListener('valuechange', event => {
    if (!Object.hasOwn(scopes, event.detail.value)) { event.preventDefault(); return; }
    commit({ scope: event.detail.value });
  }, { signal: events.signal });
  inputPart.addEventListener('valuechange', event => {
    const explicit = ['clear-press', 'imperative'].includes(event.detail.reason);
    if (explicit) composing = false;
    if (composing || event.detail.event?.isComposing) return;
    commit({ query: String(event.detail.value ?? '') }, undefined, explicit);
  }, { signal: events.signal });
  input.addEventListener('input', onInput, { signal: events.signal });
  input.addEventListener('compositionstart', () => { composing = true; }, { signal: events.signal });
  input.addEventListener('compositionend', () => { composing = false; commit({ query: input.value }); }, { signal: events.signal });
  country.addEventListener('valuechange', event => {
    if (!Object.hasOwn(countries, event.detail.value)) { event.preventDefault(); return; }
    commit({ country: event.detail.value });
  }, { signal: events.signal });
  for (const chip of chips) chip.addEventListener('click', () => {
    const key = chip.dataset.remove;
    if (key === 'query') composing = false;
    commit({ [key]: key === 'query' ? '' : 'all' }, key === 'query' ? input : key === 'country' ? countryTrigger : focusScope(), key === 'query');
  }, { signal: events.signal });
  for (const reset of root.querySelectorAll('[data-reset]')) reset.addEventListener('click', () => {
    composing = false;
    commit({ scope: 'all', country: 'all', query: '' }, input, true);
  }, { signal: events.signal });
  doc.addEventListener('visibilitychange', policy, { signal: events.signal });
  if (media.addEventListener) media.addEventListener('change', policy);
  else media.addListener(policy);

  function motionState() {
    return { mode, reduced: media.matches || mode === 'reduced', hidden: doc.hidden,
      allowed: allowed(), curve: failed ? 'unavailable' : !curve ? 'pending' : supportsLinear && !forceFallback ? 'linear' : 'fallback' };
  }

  const controller = {
    getState() { return { ...state }; },
    getMotionState: motionState,
    setMode(value) {
      if (!alive || !modes.has(value)) return;
      mode = value;
      policy();
    },
    setFallback(value) {
      if (!alive) return;
      forceFallback = Boolean(value);
      policy();
    },
    destroy() {
      if (!alive) return;
      alive = false;
      events.abort();
      if (media.removeEventListener) media.removeEventListener('change', policy);
      else media.removeListener(policy);
      country.api?.close();
      stopMotion();
      root.dataset.motionAllowed = 'false';
      root.dataset.ready = 'false';
      root.querySelector('[data-static-note]').textContent = 'Filtering is paused. The last applied filters and matching records remain visible.';
      setDisabled(true);
      if (owners.get(root) === controller) owners.delete(root);
    }
  };
  owners.set(root, controller);
  country.items = Object.entries(countries).map(([value, label]) => ({ value, label }));
  setDisabled(false);
  root.dataset.ready = 'true';
  render(false);
  policy();
  return controller;
}
