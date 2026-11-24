// Real tab behaviour for profile pages (issue #419). The tab list keeps native
// anchor tabs so deep links (`#entity-funding`) and no-JS navigation still
// resolve; this module upgrades them to the ARIA tabs pattern: one panel is
// visible at a time, selection follows the URL hash, and in-page jump links
// activate the panel that contains their target instead of scrolling a
// stacked page.

export function tabIndexForHash(panelIds, hash) {
  if (typeof hash !== 'string' || !hash.startsWith('#')) return -1;
  return panelIds.indexOf(hash.slice(1));
}

// Keyboard contract for a tablist (ARIA tabs pattern, automatic activation):
// arrows move between tabs with wrap-around, Home/End jump to the ends.
export function tabIndexForKey(current, key, count) {
  if (!Number.isInteger(count) || count < 1) return -1;
  const index = Math.min(Math.max(current, 0), count - 1);
  switch (key) {
    case 'ArrowRight':
    case 'ArrowDown': return (index + 1) % count;
    case 'ArrowLeft':
    case 'ArrowUp': return (index - 1 + count) % count;
    case 'Home': return 0;
    case 'End': return count - 1;
    default: return -1;
  }
}

const escapeId = id => globalThis.CSS?.escape ? CSS.escape(id) : String(id).replace(/[^a-zA-Z0-9_-]/g, '\\$&');

export function installProfileTabs(scope, { history: historyImpl = globalThis.history, location: locationImpl = globalThis.location } = {}) {
  const tablist = scope.querySelector('[role="tablist"]');
  if (!tablist) return null;
  const tabs = [...tablist.querySelectorAll('[role="tab"]')];
  const panels = tabs.map(tab => scope.querySelector(`#${escapeId(tab.getAttribute('aria-controls') || '')}`)).filter(Boolean);
  if (!tabs.length || tabs.length !== panels.length) return null;
  const panelIds = panels.map(panel => panel.id);
  let active = 0;

  function activate(index, { focus = false, updateHash = true } = {}) {
    if (index < 0 || index >= tabs.length) return;
    active = index;
    tabs.forEach((tab, i) => {
      const selected = i === index;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      panels[i].hidden = !selected;
    });
    if (updateHash && locationImpl.hash !== `#${panelIds[index]}`) {
      historyImpl.replaceState(null, '', `#${panelIds[index]}`);
    }
    if (focus) tabs[index].focus();
  }

  tabs.forEach((tab, index) => {
    tab.addEventListener('click', event => {
      event.preventDefault();
      activate(index);
    });
    tab.addEventListener('keydown', event => {
      const next = tabIndexForKey(index, event.key, tabs.length);
      if (next === -1) return;
      event.preventDefault();
      activate(next, { focus: true });
    });
  });

  // In-page jump links ("View people", "Supporting documents", evidence
  // shortcuts) select the panel holding their target; a target inside the
  // collapsed sources footer opens it instead. Links to the active panel's
  // own contents keep their default in-panel anchor behaviour.
  scope.addEventListener('click', event => {
    const link = event.target.closest?.('a[href^="#"]');
    if (!link || link.getAttribute('role') === 'tab' || !scope.contains(link)) return;
    const target = scope.querySelector(`#${escapeId(link.getAttribute('href').slice(1))}`);
    if (!target) return;
    const panel = target.closest('[role="tabpanel"]');
    const panelIndex = panel ? panels.indexOf(panel) : -1;
    if (panelIndex !== -1 && panelIndex !== active) {
      event.preventDefault();
      activate(panelIndex);
      if (target !== panel) target.scrollIntoView();
      return;
    }
    const details = target.closest('details');
    if (details && !details.open) {
      event.preventDefault();
      details.open = true;
      target.scrollIntoView();
    }
  });

  globalThis.addEventListener?.('hashchange', () => {
    const index = tabIndexForHash(panelIds, locationImpl.hash);
    if (index !== -1 && index !== active) activate(index, { updateHash: false });
  });

  const fromHash = tabIndexForHash(panelIds, locationImpl.hash);
  activate(fromHash === -1 ? 0 : fromHash, { updateHash: false });
  return { activate, get activeIndex() { return active; }, tabs, panels };
}
