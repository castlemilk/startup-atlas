import { escapeHtml as esc, sourceUrl } from './logic.js';
import { entityHref, kindName } from './graph-model.js';
import { logoFor } from './logos.js';
import { renderIcon } from './atlas-icons.js';

export function icon(name) {
  return renderIcon(name);
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

/** One operational masthead, derived from the five Atlas wireframes. */
export function renderAtlasMasthead(active = '') {
  return `<a class="atlas-wordmark" href="./" aria-label="Startup Atlas home"><span class="atlas-diamond-mark" aria-hidden="true"><i></i><i></i><i></i><i></i></span><span>startupatlas</span></a>${renderViewNavigation(active)}`;
}

/** Shared directory specimen; labels never imply verification beyond the source. */
export function renderEntityRow(item, connections = null, options = {}) {
  const initials = item.name.trim().split(/\s+/).slice(0, 2).map(part => part[0] || '').join('').toUpperCase();
  const logo = sourceUrl(item.logo) || logoFor(item.name);
  const summary = item.summary || (item.kind === 'partner' ? 'Research lead; identity and relationships may need review.' : 'Further profile details are being researched.');
  const href = sourceUrl(item.source);
  const count = Number.isInteger(connections) && connections >= 0 ? `<span>${connections} recorded ${connections === 1 ? 'connection' : 'connections'}</span>` : '';
  const inspectable = options.inspectable === true;
  const inspection = inspectable ? `<button type="button" class="entity-row-inspect" data-inspect-entity="${esc(item.id)}" aria-pressed="${options.selected === true}" aria-label="Inspect ${esc(item.name)}">${icon('search')}<span>Inspect</span></button>` : '';
  return `<article class="entity-row${inspectable ? ' entity-row-inspectable' : ''}" data-kind="${esc(item.kind)}"${inspectable ? ` data-entity-id="${esc(item.id)}" data-selected="${options.selected === true}"` : ''}><span class="entity-row-mark${logo ? ' has-logo' : ''}" aria-hidden="true"><span>${esc(initials)}</span>${logo ? `<img class="entity-row-image" src="${esc(logo)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : ''}</span><div class="entity-row-main"><h3><a href="${esc(entityHref(item))}">${esc(item.name)}</a></h3><p>${esc(summary)}</p><div class="entity-row-meta">${count}${href ? `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">Profile source</a>` : '<span>Source not recorded</span>'}</div></div><span class="entity-row-kind">${entityBadge(item.kind)}</span><div class="entity-row-actions">${inspection}<a class="entity-row-graph" href="./graph.html?entity=${encodeURIComponent(item.id)}" aria-label="Explore ${esc(item.name)} connections">Graph ${icon('graph')}</a></div></article>`;
}

/** Return context is confined to public Atlas routes on the same deployment. */
export function safeAtlasReturn(value, base) {
  try {
    const current = new URL(base), target = new URL(value, current);
    const folder = current.pathname.slice(0, current.pathname.lastIndexOf('/') + 1);
    if (target.origin !== current.origin || !target.pathname.startsWith(folder)) return null;
    const route = target.pathname.slice(folder.length);
    if (!['', 'index.html', 'entity.html', 'partner.html', 'graph.html', 'treemap.html', 'design-system.html', 'design-lab.html', 'design-direction.html', 'design-assets.html'].includes(route)) return null;
    return target.pathname + target.search + target.hash;
  } catch { return null; }
}

export function installAtlasUI(doc = document) {
  const base = location.href;
  if (new URLSearchParams(location.search).get('embed') === '1') doc.body.classList.add('atlas-embedded');
  for (const placeholder of doc.querySelectorAll('[data-atlas-masthead]')) placeholder.innerHTML = renderAtlasMasthead(placeholder.dataset.atlasMasthead);
  for (const placeholder of doc.querySelectorAll('[data-atlas-navigation]')) placeholder.innerHTML = renderViewNavigation(placeholder.dataset.atlasNavigation);
  let sectionFrame = 0;
  const updateSections = () => {
    sectionFrame = 0;
    for (const nav of doc.querySelectorAll('.atlas-section-nav')) {
      const entries = Array.from(nav.querySelectorAll('a[href^="#"]')).map(link => ({link, section:doc.getElementById(link.getAttribute('href').slice(1))})).filter(entry => entry.section && !entry.section.hidden).map(entry => ({...entry, top:entry.section.getBoundingClientRect().top}));
      // Profile sections can sit in parallel columns. Use their visual position,
      // with the followed anchor resolving sections that share the same row.
      const threshold = Math.min(180, innerHeight * .25);
      let current = entries[0];
      if (current?.top <= threshold) current = entries.filter(entry => entry.top <= threshold).sort((a,b) => b.top-a.top)[0] || current;
      const followed = entries.find(entry => entry.link.getAttribute('href') === location.hash);
      if (followed && ((followed.top >= 0 && followed.top <= threshold) || (current && Math.abs(followed.top-current.top) < 2))) current = followed;
      for (const entry of entries) {
        if (entry === current) entry.link.setAttribute('aria-current','location');
        else entry.link.removeAttribute('aria-current');
      }
    }
  };
  const queueSections = () => { if (doc.querySelectorAll('.atlas-section-nav').length && !sectionFrame) sectionFrame = requestAnimationFrame(updateSections); };
  window.addEventListener('scroll', queueSections, {passive:true});
  window.addEventListener('resize', queueSections);
  window.addEventListener('hashchange', queueSections);
  let refreshQueued = false;
  const refresh = () => {
    refreshQueued = false;
    queueSections();
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
    const label = page === 'graph.html' ? 'Back to graph' : page === 'treemap.html' ? 'Back to treemap' : ['entity.html','partner.html'].includes(page) ? 'Back to ' + doc.title.split(' — ')[0] : page === 'design-system.html' ? 'Back to design system' : page === 'design-lab.html' ? 'Back to design lab' : page === 'design-direction.html' ? 'Back to design direction' : page === 'design-assets.html' ? 'Back to asset library' : 'Back to search results';
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
