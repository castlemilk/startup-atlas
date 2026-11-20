import { escapeHtml as esc, sourceUrl } from './logic.js';
import { entityHref, kindName } from './graph-model.js';
import { logoFor } from './logos.js';
import { renderIcon } from './atlas-icons.js';
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
    ['treemap', './treemap.html', 'treemap', 'Treemap'],
    ['graph', './graph.html', 'graph', 'Graph'],
    ['directory', './#directory', 'list', 'List'],
  ];
  return `<nav class="atlas-view-nav" aria-label="Explore the Atlas">${views.map(([name, href, glyph, label]) => `<a href="${href}" data-atlas-view="${name}" data-atlas-base="${href}"${active === name ? ' aria-current="page"' : ''}>${icon(glyph)}${label}</a>`).join('')}</nav>`;
}

export function renderAtlasMasthead(active = '', {viewSpecimen=true}={}) {
  const exploring = ['directory','treemap','graph','entity','partner','profile'].includes(active);
  const workspace = exploring && !viewSpecimen;
  const ids = viewSpecimen ? 'atlas-specimen' : 'atlas';
  const sources = active==='entity' ? '#entity-sources' : active==='partner' ? '#partner-sources' : './#method';
  return `<div class="atlas-brand-bar"${workspace ? ' data-atlas-workspace' : ''}>
    <a class="atlas-wordmark" href="./" aria-label="Startup Atlas home"><span class="atlas-diamond-mark" aria-hidden="true"><i></i><i></i><i></i><i></i></span><span>startup atlas</span></a>
    <div class="atlas-mobile-header-actions">
      <button type="button" data-atlas-header-toggle="search" aria-label="Site search" aria-controls="${ids}-site-search" aria-expanded="false">${icon('search')}</button>
      <button type="button" data-atlas-header-toggle="menu" aria-label="Site navigation" aria-controls="${ids}-main-nav ${ids}-nav-actions" aria-expanded="false"><span class="atlas-menu-icon" aria-hidden="true"></span></button>
    </div>
    <nav class="atlas-primary-nav" id="${ids}-main-nav" aria-label="Main navigation">
      <a class="atlas-explore-link" href="./#directory"${exploring ? ' aria-current="true"' : ''}>Explore</a>
      ${workspace ? '<ui-dialog-trigger for="atlas-workspace-dialog"><button type="button" data-atlas-panel="saved" aria-haspopup="dialog">Saved</button></ui-dialog-trigger>' : ''}
      <a href="${sources}">Sources</a>
    </nav>
    <form class="atlas-site-search" id="${ids}-site-search" role="search" aria-label="Search the Atlas" action="./#directory" method="get">
      <label for="${ids}-global-query" class="sr-only">Search the Atlas</label>
      <button type="submit" aria-label="Find records">${icon('search')}</button>
      <input name="q" id="${ids}-global-query" type="search" placeholder="Search companies, people, programmes" autocomplete="off" maxlength="200">
      <input name="type" type="hidden" value="all">
    </form>
    <div class="atlas-brand-actions" id="${ids}-nav-actions">
      ${workspace ? `<ui-dialog-trigger for="atlas-workspace-dialog"><button type="button" data-atlas-panel="compare" aria-haspopup="dialog">${icon('copy')}<span data-atlas-panel-label>Compare</span></button></ui-dialog-trigger>` : ''}
      <a class="atlas-system-link" href="./design-system.html" aria-label="Design system"${active === 'system' ? ' aria-current="page"' : ''}>${icon('system')}</a>
    </div>
    ${viewSpecimen ? `<div class="atlas-view-bar">${renderViewNavigation(active)}</div>` : ''}
  </div>`;
}

export function renderExplorerActions(active) {
  return `${renderViewNavigation(active)}
    <div class="atlas-view-utilities">
      <button class="atlas-button" type="button" data-atlas-save-view>${icon('link')}<span data-atlas-action-label>Save view</span></button>
      <button class="atlas-button" type="button" data-atlas-export="${esc(active)}">${icon('download')}<span>Export</span></button>
    </div><p class="atlas-view-action-status" data-atlas-export-status role="status" hidden></p>`;
}

const csvField = value => {
  const text = String(value ?? '');
  return '"' + (/^\s*[=+\-@]/.test(text) ? "'" : '') + text.replaceAll('"','""') + '"';
};

function exportAtlasRecords(doc, button) {
  const status = button.closest('[data-atlas-explorer-actions]').querySelector('[data-atlas-export-status]');
  const result = {records:null};
  doc.dispatchEvent(new CustomEvent('atlas:export-records',{detail:result}));
  if (!result.records?.length) {
    status.hidden = false;
    status.textContent = result.records ? 'There are no matching records to export.' : 'Records are loading. Try exporting again.';
    return;
  }
  const rows = [['Name','Type','Record ID','Source'],...result.records.map(record=>[
    record.name,record.kind==='opportunity' ? 'Opportunity' : kindName(record.kind),record.id,sourceUrl(record.source) || '',
  ])];
  const blob = new Blob([rows.map(row=>row.map(csvField).join(',')).join('\r\n')+'\r\n'],{type:'text/csv;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const link = doc.createElement('a');
  link.href = url;
  link.download = `startup-atlas-${button.dataset.atlasExport}.csv`;
  doc.body.append(link);
  link.click();
  link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  status.textContent = `Exported ${result.records.length} ${result.records.length===1 ? 'record' : 'records'}.`;
  status.hidden = false;
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
  for (const placeholder of doc.querySelectorAll('[data-atlas-masthead]')) placeholder.innerHTML = renderAtlasMasthead(placeholder.dataset.atlasMasthead,{viewSpecimen:false});
  for (const placeholder of doc.querySelectorAll('[data-atlas-navigation]')) placeholder.innerHTML = renderViewNavigation(placeholder.dataset.atlasNavigation);
  for (const placeholder of doc.querySelectorAll('[data-atlas-explorer-actions]')) placeholder.innerHTML = renderExplorerActions(placeholder.dataset.atlasExplorerActions);
  installWorkspace(doc,safeAtlasReturn);
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
  function toggleHeader(header,mode) {
    for (const toggle of header.querySelectorAll('[data-atlas-header-toggle]')) {
      const key=toggle.dataset.atlasHeaderToggle;
      const open=key===mode && !header.hasAttribute('data-'+key+'-open');
      header.toggleAttribute('data-'+key+'-open',open);
      toggle.setAttribute('aria-expanded',String(open));
      if (open && key==='search') header.querySelector('input[type="search"]').focus();
    }
  }
  doc.addEventListener('keydown',event=>{
    const header=event.target.closest?.('.atlas-brand-bar');
    if (event.key!=='Escape' || !header) return;
    const mode=header.hasAttribute('data-search-open') ? 'search' : header.hasAttribute('data-menu-open') ? 'menu' : '';
    if (!mode) return;
    event.preventDefault();
    toggleHeader(header,'');
    header.querySelector(`[data-atlas-header-toggle="${mode}"]`).focus();
  });
  doc.addEventListener('click', event => {
    const disclosure=event.target.closest('[data-atlas-header-toggle]');
    if (disclosure) {toggleHeader(disclosure.closest('.atlas-brand-bar'),disclosure.dataset.atlasHeaderToggle);return;}
    const exportButton=event.target.closest('[data-atlas-export]');
    if (exportButton) {exportAtlasRecords(doc,exportButton);return;}
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
