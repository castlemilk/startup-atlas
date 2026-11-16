import { escapeHtml as esc, sourceUrl } from './logic.js';
import { entityHref, kindName } from './graph-model.js';
import { logoFor } from './logos.js';

const paths = {
  list: '<path d="M8 6h12M8 12h12M8 18h12"/><path d="M3 6h.01M3 12h.01M3 18h.01"/>',
  treemap: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 3v18M12 11h9M3 15h9"/>',
  graph: '<circle cx="5" cy="12" r="3"/><circle cx="18" cy="5" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8 10 7-4M8 14l7 4"/>',
  external: '<path d="M14 4h6v6M20 4 10 14M10 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
  system: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 17.5h7m-3.5-3.5v7"/>',
  fit: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/><rect x="8" y="8" width="8" height="8" rx="1"/>',
  reset: '<path d="M4 10a8 8 0 1 1 1 8M4 4v6h6"/>'
};

export function icon(name) {
  return `<svg class="atlas-icon" viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.arrow}</svg>`;
}

export function entityBadge(kind) {
  return `<span class="atlas-badge" data-kind="${esc(kind)}">${esc(kindName(kind))}</span>`;
}

export function renderViewNavigation(active) {
  const views = [
    ['directory', './#directory', 'list', 'List & search'],
    ['treemap', './treemap.html', 'treemap', 'Treemap'],
    ['graph', './graph.html', 'graph', 'Graph']
  ];
  return `<nav class="atlas-view-nav" aria-label="Explore the Atlas">${views.map(([name, href, glyph, label]) => `<a href="${href}" data-atlas-view="${name}" data-atlas-base="${href}"${active === name ? ' aria-current="page"' : ''}>${icon(glyph)}${label}</a>`).join('')}<a class="atlas-system-link" href="./design-system.html"${active === 'system' ? ' aria-current="page"' : ''}>${icon('system')}Design system</a></nav>`;
}

/** Shared directory specimen; labels never imply verification beyond the source. */
export function renderEntityRow(item, connections = null) {
  const initials = item.name.trim().split(/\s+/).slice(0, 2).map(part => part[0] || '').join('').toUpperCase();
  const logo = sourceUrl(item.logo) || logoFor(item.name);
  const summary = item.summary || (item.kind === 'partner' ? 'Research lead; identity and relationships may need review.' : 'Further profile details are being researched.');
  const href = sourceUrl(item.source);
  const count = Number.isInteger(connections) && connections >= 0 ? `<span>${connections} recorded ${connections === 1 ? 'connection' : 'connections'}</span>` : '';
  return `<article class="entity-row" data-kind="${esc(item.kind)}"><span class="entity-row-mark${logo ? ' has-logo' : ''}" aria-hidden="true"><span>${esc(initials)}</span>${logo ? `<img class="entity-row-image" src="${esc(logo)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : ''}</span><div class="entity-row-main"><h3><a href="${esc(entityHref(item))}">${esc(item.name)}</a></h3><p>${esc(summary)}</p><div class="entity-row-meta">${count}${href ? `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">Profile source</a>` : '<span>Source not recorded</span>'}</div></div><span class="entity-row-kind">${entityBadge(item.kind)}</span><a class="entity-row-graph" href="./graph.html?entity=${encodeURIComponent(item.id)}" aria-label="Explore ${esc(item.name)} connections">Graph ${icon('graph')}</a></article>`;
}

/** Return context is confined to public Atlas routes on the same deployment. */
export function safeAtlasReturn(value, base) {
  try {
    const current = new URL(base), target = new URL(value, current);
    const folder = current.pathname.slice(0, current.pathname.lastIndexOf('/') + 1);
    if (target.origin !== current.origin || !target.pathname.startsWith(folder)) return null;
    const route = target.pathname.slice(folder.length);
    if (!['', 'index.html', 'entity.html', 'partner.html', 'graph.html', 'treemap.html', 'design-system.html'].includes(route)) return null;
    return target.pathname + target.search + target.hash;
  } catch { return null; }
}

export function installAtlasUI(doc = document) {
  const base = location.href;
  if (new URLSearchParams(location.search).get('embed') === '1') doc.body.classList.add('atlas-embedded');
  for (const placeholder of doc.querySelectorAll('[data-atlas-navigation]')) placeholder.innerHTML = renderViewNavigation(placeholder.dataset.atlasNavigation);
  let refreshQueued = false;
  const refresh = () => {
    refreshQueued = false;
    for (const button of doc.querySelectorAll('[data-atlas-clear-for]')) {
      const input = doc.getElementById(button.dataset.atlasClearFor);
      button.hidden = !input?.value;
    }
    const query = doc.getElementById('search')?.value || doc.getElementById('graph-query')?.value || doc.getElementById('treemap-query')?.value || '';
    const params = new URLSearchParams(location.search);
    for (const link of doc.querySelectorAll('[data-atlas-view]')) {
      const next = new URL(link.dataset.atlasBase, base);
      if (query) next.searchParams.set('q', query);
      if (link.dataset.atlasView === 'graph') {
        const entity = params.get('entity') || params.get('id');
        if (entity) next.searchParams.set('entity', entity);
      }
      const href = next.pathname + next.search + next.hash;
      if (link.getAttribute('href') !== href) link.setAttribute('href', href);
    }
    let context;
    try { context = JSON.parse(sessionStorage.getItem('atlas:return:' + location.pathname + location.search) || 'null'); } catch { /* Storage is optional. */ }
    const destination = context && safeAtlasReturn(context.href, base);
    if (destination && typeof context.label === 'string') for (const link of doc.querySelectorAll('[data-atlas-back]')) {
      if (link.getAttribute('href') !== destination) link.setAttribute('href', destination);
      if (link.textContent !== context.label) link.textContent = context.label;
    }
  };
  const queueRefresh = () => { if (!refreshQueued) { refreshQueued = true; queueMicrotask(refresh); } };
  doc.addEventListener('click', event => {
    const clear = event.target.closest('[data-atlas-clear-for]');
    if (clear) {
      const input = doc.getElementById(clear.dataset.atlasClearFor);
      if (input) { input.value = ''; input.dispatchEvent(new Event('input', {bubbles:true})); input.focus(); refresh(); }
      return;
    }
    const link = event.target.closest('a[href]');
    if (!link || link.hasAttribute('data-atlas-back')) return;
    const target = new URL(link.href, base);
    if (target.origin !== location.origin || !/(?:entity|partner)\.html$/.test(target.pathname)) return;
    // Section anchors do not start a new profile journey or replace its origin.
    if (target.pathname + target.search === location.pathname + location.search) return;
    const from = safeAtlasReturn(location.href, base);
    if (!from) return;
    const page = location.pathname.split('/').pop();
    const label = page === 'graph.html' ? 'Back to graph' : page === 'treemap.html' ? 'Back to treemap' : ['entity.html','partner.html'].includes(page) ? 'Back to ' + doc.title.split(' — ')[0] : page === 'design-system.html' ? 'Back to design system' : 'Back to search results';
    try { sessionStorage.setItem('atlas:return:' + target.pathname + target.search, JSON.stringify({href:from,label})); } catch { /* Plain links remain available. */ }
  });
  doc.addEventListener('input', queueRefresh);
  doc.addEventListener('change', queueRefresh);
  window.addEventListener('popstate', queueRefresh);
  window.addEventListener('pageshow', queueRefresh);
  new MutationObserver(queueRefresh).observe(doc.body, {childList:true, subtree:true});
  refresh();
}

if (typeof document !== 'undefined' && document.body) installAtlasUI();
