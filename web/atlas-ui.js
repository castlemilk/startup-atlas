import { escapeHtml as esc, sourceUrl } from './logic.js';
import { entityHref, kindName } from './graph-model.js';
import { logoFor } from './logos.js';
import { renderIcon } from './atlas-icons.js';
import { featureSymbol } from './atlas-feature-symbols.js';
import { explorationHref, readExploration } from './atlas-exploration.js';
import { installWorkspace } from './atlas-workspace.js';

const gsapVersion = '3.15.1';
const gsapLoads = new WeakMap();
const activeMotions = new WeakMap();
const reducedMotionQuery = '(prefers-reduced-motion: reduce)';

function loadExplorerGsap(doc) {
  if (gsapLoads.has(doc)) return gsapLoads.get(doc);
  const view = doc.defaultView;
  const request = new Promise((resolve, reject) => {
    if (view.gsap) {
      if (view.gsap.version === gsapVersion) resolve(view.gsap);
      else reject(Error('Unexpected GSAP version'));
      return;
    }
    const script = doc.createElement('script');
    function finish() {
      view.clearTimeout(timeout);
      script.onload = script.onerror = null;
      if (view.gsap?.version === gsapVersion) resolve(view.gsap);
      else { script.remove(); reject(Error('GSAP unavailable')); }
    }
    const timeout = view.setTimeout(finish, 3000);
    script.onload = script.onerror = finish;
    script.src = new URL('./assets/design-lab/signal-motion-pilot/vendor/gsap.min.js', import.meta.url);
    doc.head.append(script);
  });
  gsapLoads.set(doc, request);
  request.catch(() => gsapLoads.delete(doc));
  return request;
}

export function canAnimateAtlasChange(owner) {
  const doc = owner.ownerDocument;
  return owner.isConnected && !doc.hidden && !doc.defaultView.matchMedia(reducedMotionQuery).matches;
}

/** Enhance a completed update. The result and its controls are already usable. */
export function animateAtlasChange(owner, populate) {
  activeMotions.get(owner)?.();
  if (!canAnimateAtlasChange(owner)) return;
  const doc = owner.ownerDocument, view = doc.defaultView;
  const requestedAt = view.performance.now();
  const listeners = new view.AbortController();
  let context;
  function finish() {
    if (activeMotions.get(owner) !== finish) return;
    activeMotions.delete(owner);
    listeners.abort();
    context?.revert();
  }
  const options = {signal:listeners.signal};
  activeMotions.set(owner, finish);
  view.matchMedia(reducedMotionQuery).addEventListener('change', finish, options);
  view.addEventListener('pagehide', finish, options);
  doc.addEventListener('visibilitychange', () => { if (doc.hidden) finish(); }, options);
  loadExplorerGsap(doc).then(gsap => {
    if (activeMotions.get(owner) !== finish) return;
    if (!canAnimateAtlasChange(owner) || view.performance.now() - requestedAt > 220) { finish(); return; }
    let timeline;
    context = gsap.context(() => {
      timeline = gsap.timeline({ paused:true, defaults:{duration:.28,ease:'power3.out'}, onComplete:finish });
      populate(timeline);
    }, owner);
    if (timeline.duration()) timeline.play();
    else finish();
  }).catch(finish);
}

export function icon(name) {
  return renderIcon(name);
}

export function entityBadge(kind) {
  return `<span class="atlas-badge" data-kind="${esc(kind)}">${esc(kindName(kind))}</span>`;
}

export function renderEvidenceHeading() {
  return `<h2 class="atlas-evidence-heading"><span class="atlas-evidence-mark" aria-hidden="true">${icon('source')}</span>Sources &amp; context</h2>`;
}

export function renderViewNavigation(active) {
  const views = [
    ['directory', './#directory', 'search', 'List & search'],
    ['treemap', './treemap.html', 'treemap', 'Treemap'],
    ['graph', './graph.html', 'graph', 'Graph']
  ];
  return `<nav class="atlas-view-nav" aria-label="Explore the Atlas">${views.map(([name, href, glyph, label]) => `<a href="${href}" data-atlas-view="${name}" data-atlas-base="${href}"${active === name ? ' aria-current="page"' : ''}>${featureSymbol(glyph, { size: 18 })}${label}</a>`).join('')}</nav>`;
}

/** One operational masthead, derived from the five Atlas wireframes. */
export function renderAtlasMasthead(active = '') {
  const workspace = ['directory','treemap','graph','entity','partner','profile'].includes(active);
  return `<div class="atlas-brand-bar"><a class="atlas-wordmark" href="./" aria-label="Startup Atlas home"><span class="atlas-diamond-mark" aria-hidden="true"><i></i><i></i><i></i><i></i></span><span>startup atlas</span></a><div class="atlas-view-bar">${renderViewNavigation(active)}</div><div class="atlas-brand-actions">
    ${workspace ? `<div class="atlas-workspace-actions" data-atlas-workspace role="group" aria-label="Your workspace">
      <ui-dialog-trigger for="atlas-workspace-dialog"><button type="button" data-atlas-panel="saved" aria-haspopup="dialog">Saved</button></ui-dialog-trigger>
      <ui-dialog-trigger for="atlas-workspace-dialog"><button type="button" data-atlas-panel="compare" aria-haspopup="dialog">Compare</button></ui-dialog-trigger>
    </div>` : ''}
    <a class="atlas-system-link" href="./design-system.html" aria-label="Design system"${active === 'system' ? ' aria-current="page"' : ''}>${icon('system')}<span>Design system</span></a>
  </div></div>`;
}

function renderSourceCoverage({profile, founders, funding}) {
  const cells = [['Profile', profile], ['Founders', founders], ['Funding', funding]];
  return `<dl class="directory-evidence-counts" aria-label="Recorded sources">${cells.map(([label, count]) => {
    // The Bklit heatmap scale is grouped at 3+ to match the Atlas coverage legend.
    const level = Math.min(count, 3);
    return `<div data-level="${level}"><dt>${label}</dt><dd>${count || 'Unknown'}</dd></div>`;
  }).join('')}</dl>`;
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
  const context = options.coverage
    ? renderSourceCoverage(options.coverage)
    : `<span class="entity-row-kind">${entityBadge(item.kind)}</span>`;
  return `<article class="entity-row${inspectable ? ' entity-row-inspectable' : ''}" data-kind="${esc(item.kind)}"${inspectable ? ` data-entity-id="${esc(item.id)}" data-selected="${options.selected === true}"` : ''}><span class="entity-row-mark${logo ? ' has-logo' : ''}" aria-hidden="true"><span>${esc(initials)}</span>${logo ? `<img class="entity-row-image" src="${esc(logo)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : ''}</span><div class="entity-row-main"><h3><a href="${esc(entityHref(item))}">${esc(item.name)}</a></h3><p>${esc(summary)}</p><div class="entity-row-meta">${count}${href ? `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">Profile source</a>` : '<span>Source not recorded</span>'}</div></div>${context}<div class="entity-row-actions">${inspection}<a class="entity-row-graph" href="${esc(options.graphHref || `./graph.html?entity=${encodeURIComponent(item.id)}`)}" aria-label="Explore ${esc(item.name)} connections">Graph ${icon('graph')}</a></div></article>`;
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
  installWorkspace(doc);
  const returnKey = 'atlas:return:' + location.pathname + location.search;
  const scrollKey = 'atlas:scroll:' + location.pathname + location.search;
  let returnScroll;
  try {
    returnScroll = JSON.parse(sessionStorage.getItem(scrollKey) || 'null');
    sessionStorage.removeItem(scrollKey);
  } catch { /* Browser storage can be disabled. */ }
  let exploration;
  let sectionFrame = 0;
  const updateSections = () => {
    sectionFrame = 0;
    for (const nav of doc.querySelectorAll('.atlas-section-nav')) {
      const sticky = nav.closest('.profile-sticky');
      if (sticky) sticky.toggleAttribute('data-stuck',sticky.getBoundingClientRect().top<=1);
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
    const params = new URLSearchParams(location.search);
    let context;
    try { context = JSON.parse(sessionStorage.getItem(returnKey) || 'null'); } catch { /* Browser storage can be disabled. */ }
    const destination = context && safeAtlasReturn(context.href, base);
    exploration = readExploration(params);
    const search = doc.getElementById('search') || doc.getElementById('graph-query') || doc.getElementById('treemap-query');
    if (search) exploration.query = search.value;
    const profileId = params.get('id');
    if (destination && !search) {
      exploration = readExploration(context.filters ? new URLSearchParams(context.filters) : new URL(destination,base).searchParams);
    }
    if (profileId && !search) exploration.selected = profileId;
    for (const link of doc.querySelectorAll('[data-atlas-view]')) {
      const next = new URL(link.dataset.atlasBase, base);
      if (link.dataset.atlasView === 'graph') {
        const entity = exploration.graphAnchor || params.get('entity') || exploration.selected;
        if (entity) next.searchParams.set('entity', entity);
      }
      const href = explorationHref(next,base,exploration);
      if (link.getAttribute('href') !== href) link.setAttribute('href', href);
    }
    for (const link of doc.querySelectorAll('[data-atlas-profile-graph]')) {
      const root = link.dataset.atlasProfileGraph;
      const href = explorationHref(`./graph.html?entity=${encodeURIComponent(root)}`,base,{...exploration,graphAnchor:root,selected:root});
      if (link.getAttribute('href')!==href) link.setAttribute('href',href);
    }
    if (destination && typeof context.label === 'string') for (const link of doc.querySelectorAll('[data-atlas-back]')) {
      if (link.getAttribute('href') !== destination) link.setAttribute('href', destination);
      if (link.textContent !== context.label) link.textContent = context.label;
    }
    if (returnScroll && Number.isFinite(returnScroll.y) && doc.documentElement.scrollHeight - innerHeight >= returnScroll.y - 2) {
      const {x,y} = returnScroll;
      returnScroll = null;
      requestAnimationFrame(()=>window.scrollTo({left:x,top:y,behavior:'instant'}));
    }
  };
  const queueRefresh = () => { if (!refreshQueued) { refreshQueued = true; queueMicrotask(refresh); } };
  doc.addEventListener('click', event => {
    const clear = event.target.closest('[data-atlas-clear-for]');
    if (clear && !clear.closest('ui-input-clear')) {
      const input = doc.getElementById(clear.dataset.atlasClearFor);
      if (input) { input.value = ''; input.dispatchEvent(new Event('input', {bubbles:true})); input.focus(); refresh(); }
      return;
    }
    const link = event.target.closest('a[href]');
    if (!link || event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const target = new URL(link.href, base);
    if (link.hasAttribute('data-atlas-back')) {
      if (!safeAtlasReturn(target,base)) return;
      try {
        const context = JSON.parse(sessionStorage.getItem(returnKey) || 'null');
        if (context?.scroll && safeAtlasReturn(context.href,base)===target.pathname+target.search+target.hash) {
          sessionStorage.setItem('atlas:scroll:' + target.pathname + target.search,JSON.stringify(context.scroll));
        }
      } catch { /* Ordinary navigation still works. */ }
      return;
    }
    if (target.origin !== location.origin || !/(?:entity|partner)\.html$/.test(target.pathname)) return;
    // Section anchors do not start a new profile journey or replace its origin.
    if (target.pathname + target.search === location.pathname + location.search) return;
    const from = safeAtlasReturn(location.href, base);
    if (!from) return;
    const page = location.pathname.split('/').pop();
    const label = page === 'graph.html' ? 'Back to graph' : page === 'treemap.html' ? 'Back to treemap' : ['entity.html','partner.html'].includes(page) ? 'Back to ' + doc.title.split(' — ')[0] : page === 'design-system.html' ? 'Back to design system' : page === 'design-lab.html' ? 'Back to design lab' : page === 'design-direction.html' ? 'Back to design direction' : page === 'design-assets.html' ? 'Back to asset library' : 'Back to search results';
    const filters = new URL(explorationHref('./',base,exploration),base).search;
    try { sessionStorage.setItem('atlas:return:' + target.pathname + target.search, JSON.stringify({href:from,label,filters,scroll:{x:window.scrollX,y:window.scrollY}})); } catch { /* Plain links remain available. */ }
  });
  doc.addEventListener('input', queueRefresh);
  doc.addEventListener('change', queueRefresh);
  doc.addEventListener('atlas:exploration-change', queueRefresh);
  window.addEventListener('popstate', queueRefresh);
  window.addEventListener('pageshow', queueRefresh);
  new MutationObserver(queueRefresh).observe(doc.body, {childList:true, subtree:true});
  refresh();
}

if (typeof document !== 'undefined' && document.body) installAtlasUI();
