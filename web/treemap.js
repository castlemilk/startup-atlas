import { escapeHtml as esc, sourceUrl } from './logic.js';
import { openGraph } from './graph-store.js';
import { entityHref } from './graph-model.js';
import { logoFor, logoClassFor } from './logos.js';
import { METRICS, companyContext, validYear, cohort, cohortNames, currencies, makeView, formatValue, treemap } from './treemap-model.js';

const $ = id => document.getElementById(id);
const controls = $('treemap-controls'), chart = $('treemap-chart'), detail = $('treemap-detail');
const titles = {valuation:'Recorded valuations', funding:'Funding announcements', companies:'Companies in the Atlas'};
const palette = ['#c9dfc7','#dce6bd','#d1e1e4','#ecddc3','#e1dceb','#d8e2d1'];
let graph, view, state, storeMode, lastWidth = 0, cohortColors = new Map();
const money = value => formatValue(value, state.metric, state.currency);
const safeImageUrl = value => /^\.\/assets\/logos\/[a-z0-9-]+\.(svg|png)$/i.test(value || '') ? value : sourceUrl(value);
const safeImage = entity => safeImageUrl(logoFor(entity.name)) || safeImageUrl(entity.logo) || '';
const initials = name => name.trim().split(/\s+/).slice(0, 2).map(part => part[0] || '').join('').toUpperCase();
const mark = entity => { const image = safeImage(entity); return `<span class="treemap-logo ${esc(logoClassFor(entity.name))}">${image ? `<img src="${esc(image)}" alt="" hidden referrerpolicy="no-referrer"><span>${esc(initials(entity.name))}</span>` : esc(initials(entity.name))}</span>`; };
const evidenceLink = (url, label) => sourceUrl(url) ? `<a class="treemap-source" href="${esc(sourceUrl(url))}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>` : '';
function watchImages(root) {
  root.querySelectorAll('img').forEach(img => {
    const fallback = () => {img.hidden = true; if (img.nextElementSibling) img.nextElementSibling.hidden = false;};
    const loaded = () => {img.hidden = false; if (img.nextElementSibling) img.nextElementSibling.hidden = true;};
    img.addEventListener('load', loaded, {once:true});
    img.addEventListener('error', fallback, {once:true});
    if (img.complete) {if (img.naturalWidth) loaded(); else fallback();}
  });
}
function readState() {
  const params = new URLSearchParams(location.search);
  const metric = METRICS.includes(params.get('metric')) ? params.get('metric') : 'funding';
  const available = currencies(graph, metric);
  const requested = params.get('currency');
  const currency = available.includes(requested) ? requested : available.includes('USD') ? 'USD' : available[0] || 'USD';
  const periods = new Set(graph.entities.filter(entity => entity.kind === 'startup').map(cohort));
  return {metric, currency, group: params.get('group') === 'decade' ? 'decade' : 'company', query:(params.get('q') || '').slice(0, 200), period:periods.has(params.get('period')) ? params.get('period') : 'all', presentation:['cards', 'list'].includes(params.get('view')) ? params.get('view') : 'map', company:(params.get('company') || '').slice(0, 200)};
}
function writeState(replace = false) {
  const params = new URLSearchParams();
  params.set('metric', state.metric);
  if (state.metric !== 'companies') params.set('currency', state.currency);
  if (state.group === 'decade') params.set('group', state.group);
  if (state.query) params.set('q', state.query);
  if (state.period !== 'all') params.set('period', state.period);
  if (state.presentation !== 'map') params.set('view', state.presentation);
  if (state.company) params.set('company', state.company);
  const suffix = params.toString();
  const url = location.pathname + (suffix ? '?' + suffix : '');
  if (url !== location.pathname + location.search) {
    history[replace ? 'replaceState' : 'pushState'](null, '', url);
    $('treemap-share').textContent = 'Share view';
    $('treemap-share-status').textContent = '';
  }
}
function syncControls() {
  $('treemap-metric').value = state.metric;
  const available = currencies(graph, state.metric);
  $('treemap-currency').innerHTML = available.length ? available.map(currency => `<option>${esc(currency)}</option>`).join('') : '<option value="USD">Not applicable</option>';
  $('treemap-currency').disabled = !available.length;
  $('treemap-currency').value = state.currency;
  $('treemap-group').value = state.group;
  $('treemap-query').value = state.query;
}
function profileContext(entity) {
  const context = companyContext(graph, entity, state.currency);
  const links = [evidenceLink(entity.website,'Website'), ...context.socials.map(link => evidenceLink(link.url,link.label))].filter(Boolean).join('');
  const figures = context.figures.map(({metric,row}) => `<div><dt>${metric === 'funding' ? 'Funding announcement' : 'Recorded valuation'}</dt><dd>${row ? `<strong>${esc(formatValue(row.value,metric,state.currency))}</strong><span>Announced ${esc(row.event.announced_on)}</span>${evidenceLink(row.event.source,'Source')}${row.newerUnplotted ? '<span>Newer unplotted announcement</span>' : ''}` : `Not recorded in ${esc(state.currency)}`}</dd></div>`).join('');
  const founders = context.founders.slice(0,3).map(({person,source,socials}) => `<article class="treemap-founder">${mark(person)}<div><a href="${esc(entityHref(person))}">${esc(person.name)}</a><small>Founder · ${evidenceLink(source,'Evidence')}</small>${evidenceLink(person.website,'Profile')}${socials.map(link => evidenceLink(link.url,link.label)).join('')}${person.logo ? evidenceLink(person.logo_source,'Photo source') : ''}</div></article>`).join('');
  const facts = context.facts.slice(0,3).map(fact => `<div><dt>${esc(fact.label)}</dt><dd>${esc(fact.value)}${evidenceLink(fact.source,'Source')}${fact.reviewed_at ? `<small>Reviewed ${esc(fact.reviewed_at)}</small>` : ''}</dd></div>`).join('');
  return `${links ? `<div class="treemap-company-links">${links}</div>` : ''}<details class="treemap-context" ${context.figures.some(item => item.row) ? 'open' : ''}><summary>Financial context · ${esc(state.currency)}</summary><p>Separate historical observations, not interchangeable measures.</p><dl>${figures}<div><dt>Public market cap</dt><dd>Not recorded. Funding and private valuations are not market cap.</dd></div></dl></details><details class="treemap-context" open><summary>Founders · ${context.founders.length} recorded</summary>${founders || '<p>Founder details are not recorded yet.</p>'}${context.founders.length > 3 ? '<p>More founders in the full profile.</p>' : ''}<p class="treemap-context-caption">Portraits appear only where sourced; initials are placeholders.</p></details>${facts ? `<details class="treemap-context"><summary>Company details · ${context.facts.length} sourced ${context.facts.length === 1 ? 'fact' : 'facts'}</summary><dl>${facts}</dl>${context.facts.length > 3 ? '<p>More facts in the full profile.</p>' : ''}</details>` : ''}`;
}
function showDetail(row) {
  state.company = row?.id || '';
  document.querySelectorAll('[data-company]').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.company === state.company));
    button.setAttribute('aria-controls', 'treemap-detail');
  });
  if (!row) { detail.innerHTML = '<p class="treemap-eyebrow">THE EVIDENCE</p><h2>Start with a company.</h2><p>Select a tile, card or company in the ranked list to see the announcement, its date and the original source.</p><p class="treemap-note">The Atlas is a researched selection. No comparable value means “not recorded”, never zero.</p>'; return; }
  const {entity, event} = row;
  const figure = event
    ? `<p class="treemap-detail-value">${esc(money(row.value))}</p><p>${state.metric === 'valuation' ? 'Historical announced valuation' : 'Recorded announcement amount'}</p><dl><div><dt>Announced</dt><dd>${esc(event.announced_on)}</dd></div><div><dt>Event</dt><dd>${esc(event.stage || 'Not recorded')}</dd></div><div><dt>Currency</dt><dd>${esc(state.currency)}</dd></div></dl>${row.newerUnplotted ? '<p class="treemap-note">A newer announcement exists in this profile but is not plotted for this metric and currency.</p>' : ''}${event.note ? `<p class="treemap-note">${esc(event.note)}</p>` : ''}${evidenceLink(event.source,'Read the announcement')}`
    : `<p class="treemap-detail-value">One company</p><p>${state.presentation === 'map' ? 'Every company has equal area in the treemap.' : state.presentation === 'cards' ? 'Cards use an editorial layout; card area does not encode company count.' : 'Each company counts equally in the list.'} Company count is not a financial comparison.</p>${evidenceLink(entity.source,'Read the profile source')}`;
  detail.innerHTML = `<p class="treemap-eyebrow">INSPECTED COMPANY</p><div class="treemap-detail-identity">${mark(entity)}<div><h2>${esc(entity.name)}</h2></div></div><div class="treemap-detail-view" role="tablist" aria-label="Company inspection"><button type="button" id="treemap-figure-tab" role="tab" aria-controls="treemap-figure-panel" data-detail-view="figure" aria-selected="true">Figure</button><button type="button" id="treemap-company-tab" role="tab" aria-controls="treemap-company-panel" data-detail-view="company" aria-selected="false" tabindex="-1">Company</button></div><section id="treemap-figure-panel" role="tabpanel" aria-labelledby="treemap-figure-tab">${figure}</section><section id="treemap-company-panel" role="tabpanel" aria-labelledby="treemap-company-tab" hidden><p>${esc(entity.summary || 'Company details are being researched.')}</p><p class="treemap-note">${validYear(entity.founded_year) ? `Founded ${entity.founded_year}.` : 'Founding year not recorded.'}</p>${profileContext(entity)}${evidenceLink(entity.source,'Read the profile source')}</section><a class="treemap-profile atlas-button atlas-button-accent" href="${esc(entityHref(entity))}">Open full profile ↗</a><p class="treemap-note">${state.metric === 'companies' ? 'All companies count equally, including those without financial data.' : 'Unknown or non-comparable amounts are excluded. These are historical observations.'}</p>`;
  const tabs = [...detail.querySelectorAll('[data-detail-view]')];
  const selectView = (name, focus = false) => {
    for (const tab of tabs) {const active=tab.dataset.detailView===name;tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;if(active&&focus)tab.focus();}
    $('treemap-figure-panel').hidden=name!=='figure';
    $('treemap-company-panel').hidden=name!=='company';
  };
  tabs.forEach((tab,index) => {
    tab.addEventListener('click', () => selectView(tab.dataset.detailView));
    tab.addEventListener('keydown', event => {
      const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:event.key==='ArrowRight'?(index+1)%tabs.length:event.key==='ArrowLeft'?(index+tabs.length-1)%tabs.length:null;
      if(next===null)return;
      event.preventDefault();selectView(tabs[next].dataset.detailView,true);
    });
  });
  selectView(event?'figure':'company');
  watchImages(detail);
}
function draw() {
  if (!view || state.presentation !== 'map') return;
  const grouped = state.group === 'decade' && state.period === 'all';
  const items = grouped ? view.groups : view.rows;
  if (!items.length) {chart.innerHTML = `<p>${view.filteredCount ? 'No comparable figures in this selection. Try another currency or choose Company count to include every company.' : 'No companies match. Try a different search or reset the filters.'}</p>`; return;}
  chart.style.height = (items.length === 1 ? 260 : state.metric === 'companies' && items.length > 15 ? 690 : 510) + 'px';
  const bounds = chart.getBoundingClientRect(); lastWidth = bounds.width;
  const tiles = treemap(items, bounds.width, bounds.height);
  chart.innerHTML = tiles.map((tile, index) => {
    const name = grouped ? tile.name : tile.entity.name;
    const color = cohortColors.get(grouped ? tile.id : tile.group) || palette[0];
    const size = tile.width < 40 || tile.height < 40 ? 'micro tiny' : tile.width < 130 || tile.height < 85 ? 'tiny' : tile.width < 230 || tile.height < 160 ? 'compact' : '';
    const meta = grouped ? `${tile.count} ${tile.count === 1 ? 'company' : 'companies'} · Explore →` : tile.event ? `Announced ${tile.event.announced_on}` : validYear(tile.entity.founded_year) ? `Founded ${tile.entity.founded_year}` : 'Founding year not recorded';
    const label = `${name}, ${money(tile.value)}${grouped ? ', explore this founding decade' : tile.event ? ', announced ' + tile.event.announced_on : ''}`;
    return `<button type="button" class="treemap-tile ${size} ${tile.width < 70 || tile.height < 70 ? 'mark-only' : ''} ${state.metric === 'companies' && !grouped ? 'count-company' : ''}" ${grouped ? `data-period="${esc(tile.id)}"` : `data-company="${esc(tile.id)}" aria-pressed="${state.company === tile.id}"`} aria-label="${esc(label)}" title="${esc(label)}" style="left:${tile.x}px;top:${tile.y}px;width:${tile.width}px;height:${tile.height}px;--tile-color:${color}"><span class="treemap-tile-inner"><span class="treemap-tile-top"><span class="treemap-rank">${String(index + 1).padStart(2, '0')}</span><span class="treemap-value">${esc(money(tile.value))}</span></span><span class="treemap-tile-identity">${grouped ? '' : mark(tile.entity)}<span><span class="treemap-tile-name">${esc(name)}</span><span class="treemap-tile-meta">${esc(meta)}</span></span></span></span></button>`;
  }).join('');
  watchImages(chart);
}
function drawCards() {
  const cards = $('treemap-cards');
  const grouped = state.group === 'decade' && state.period === 'all';
  const items = grouped ? view.groups : view.rows;
  if (!items.length) {
    cards.innerHTML = `<p class="treemap-cards-empty">${view.filteredCount ? 'No comparable figures in this selection. Try another currency or choose Company count to include every company.' : 'No companies match. Try a different search or reset the filters.'}</p>`;
    return;
  }
  cards.innerHTML = items.map((item, index) => {
    const name = grouped ? item.name : item.entity.name;
    const companyCount = state.metric === 'companies' && !grouped;
    const color = cohortColors.get(grouped ? item.id : item.group) || palette[0];
    const value = companyCount ? 'Company' : money(item.value);
    const year = grouped ? `${item.count} ${item.count === 1 ? 'company' : 'companies'}` : validYear(item.entity.founded_year) ? `est. ${item.entity.founded_year}` : 'Year not recorded';
    const date = grouped ? 'Explore decade →' : item.event ? `Announced ${item.event.announced_on}` : 'View evidence →';
    const summary = grouped ? item.id === 'Not recorded' ? 'Companies with no recorded founding year.' : `Explore companies founded in the ${item.name}.` : item.entity.summary || 'Company details are being researched.';
    const label = `${index + 1}. ${name}${companyCount ? '' : ', ' + money(item.value)}${grouped ? ', explore this founding decade' : item.event ? ', announced ' + item.event.announced_on : ''}${item.newerUnplotted ? '. A newer announcement is not plotted.' : ''}`;
    return `<button type="button" class="treemap-card ${index < 3 ? 'featured' : ''} ${companyCount ? 'count-company' : ''}" ${grouped ? `data-period="${esc(item.id)}"` : `data-company="${esc(item.id)}" aria-pressed="${state.company === item.id}"`} aria-label="${esc(label)}" style="--card-color:${color}"><span class="treemap-card-top"><span class="treemap-card-rank">${String(index + 1).padStart(2, '0')}</span><span class="treemap-card-value">${esc(value)}</span></span><span class="treemap-card-body">${grouped ? '' : mark(item.entity)}<span class="treemap-card-name">${esc(name)}</span><span class="treemap-card-summary">${esc(summary)}</span></span><span class="treemap-card-footer"><span class="treemap-card-year">${esc(year)}</span><span class="treemap-card-date">${esc(date)}</span></span>${item.newerUnplotted ? '<span class="treemap-card-note">Newer announcement not plotted</span>' : ''}</button>`;
  }).join('');
  watchImages(cards);
}
function render() {
  view = makeView(graph, state);
  const selectedRow = view.rows.find(row => row.id === state.company);
  state.company = selectedRow?.id || '';
  const isMap = state.presentation === 'map', isCards = state.presentation === 'cards';
  const groupedCards = isCards && state.group === 'decade' && state.period === 'all';
  $('treemap-heading').textContent = titles[state.metric];
  $('treemap-instructions').textContent = isMap
    ? 'Each rectangle is proportional to its recorded value or company count. Select a company to read its evidence. Small tiles have equivalent controls in the ranked list. Select a founding decade to explore the companies within it.'
    : isCards
      ? 'Cards use an editorial layout; card area does not encode value or company count. Select a company to read its evidence. Select a founding decade to explore the companies within it.'
      : 'Select a company in the list to read its evidence. Financial figures are ranked by recorded value; company counts use alphabetical order.';

  $('treemap-subtitle').textContent = state.metric === 'companies' ? `${isMap ? 'Every company has equal area.' : groupedCards ? 'Founding decades ranked by company count.' : 'Companies in alphabetical order; no financial ranking.'} Color indicates the recorded founding decade.` : `Latest dated numeric ${state.metric === 'valuation' ? 'valuation' : 'event amount'} recorded per company in ${state.currency}.`;
  $('treemap-breadcrumb').innerHTML = state.period === 'all' ? 'ALL COMPANIES' : `<button type="button" class="treemap-breadcrumb-button" data-period="all">ALL COMPANIES</button> / ${esc(state.period.toUpperCase())}`;
  $('treemap-summary').innerHTML = `<span><strong>${view.rows.length}</strong> of ${view.filteredCount} matching companies ${isMap ? 'plotted' : 'shown'}</span>${state.metric !== 'companies' && view.rows.length ? `<span><strong>${esc(money(view.total))}</strong> sum of displayed figures</span>` : ''}`;
  $('treemap-status').textContent = `${storeMode === 'fallback' ? 'Showing the published JSON backup. ' : ''}${state.metric === 'companies' ? 'Company count includes records without financial data.' : 'Historical figures, not current values. Unknown or non-comparable amounts are excluded.'}`;
  $('treemap-legend').innerHTML = `<span>${isMap ? `Area = ${state.metric === 'companies' ? 'company count' : 'recorded value'}` : isCards ? 'Cards use an editorial layout; area does not encode value' : state.metric === 'companies' ? 'Companies in alphabetical order' : 'Rows ordered by recorded value'} · Founding decade:</span> ${view.groups.map(group => `<span class="treemap-legend-item"><i aria-hidden="true" style="background:${cohortColors.get(group.id)}"></i>${esc(group.name)}</span>`).join('')}`;
  $('show-map').setAttribute('aria-pressed', String(isMap));
  $('show-cards').setAttribute('aria-pressed', String(isCards));
  $('show-list').setAttribute('aria-pressed', String(state.presentation === 'list'));
  chart.hidden = !isMap;
  $('treemap-cards').hidden = !isCards;
  $('treemap-list').hidden = state.presentation !== 'list';
  $('treemap-share').textContent = 'Share view';
  $('treemap-share-status').textContent = '';
  $('treemap-list').innerHTML = view.rows.length ? `<ol>${view.rows.map((row, index) => `<li><span>${String(index + 1).padStart(2, '0')}</span><div><button type="button" data-company="${esc(row.id)}" aria-pressed="false">${mark(row.entity)}<span>${esc(row.entity.name)}</span></button><small>${row.event ? `Announced ${esc(row.event.announced_on)}` : esc(row.group)}</small><a href="${esc(entityHref(row.entity))}">Full profile ↗</a></div><div class="treemap-list-value"><strong>${esc(money(row.value))}</strong>${row.event ? `<a href="${esc(sourceUrl(row.event.source))}" target="_blank" rel="noopener noreferrer">Announcement ↗</a>` : ''}</div></li>`).join('')}</ol>` : '<p>No comparable companies in this selection. Change the filters or try Company count.</p>';
  watchImages($('treemap-list'));
  $('treemap-missing').hidden = !view.missing.length;
  $('treemap-missing-label').textContent = `${view.missing.length} matching ${view.missing.length === 1 ? 'company has' : 'companies have'} no comparable ${state.metric === 'valuation' ? 'valuation' : 'amount'} in ${state.currency}`;
  $('treemap-missing-list').innerHTML = view.missing.map(entity => `<a href="${esc(entityHref(entity))}">${esc(entity.name)}</a>`).join('');
  draw();
  drawCards();
  showDetail(selectedRow);
}
function change(next, replace = false, preserveSelection = false) {
  state = {...state, ...next, company:preserveSelection ? state.company : ''};
  syncControls(); render(); writeState(replace);
}
controls.addEventListener('submit', event => event.preventDefault());
controls.addEventListener('change', event => {
  if (!graph) return;
  if (event.target.id === 'treemap-metric') {
    const metric = event.target.value, available = currencies(graph, metric);
    change({metric, currency:available.includes(state.currency) ? state.currency : available.includes('USD') ? 'USD' : available[0] || 'USD'});
  } else if (event.target.id === 'treemap-currency') change({currency:event.target.value});
  else if (event.target.id === 'treemap-group') change({group:event.target.value, period:'all'});
});
$('treemap-query').addEventListener('input', event => {if (graph && !event.isComposing) change({query:event.target.value}, true);});
$('treemap-query').addEventListener('compositionend', event => {if (graph) change({query:event.target.value}, true);});
$('treemap-reset').addEventListener('click', () => {if (graph) change({metric:'funding', currency:'USD', group:'company', query:'', period:'all', presentation:'map'});});
$('show-map').addEventListener('click', () => {if (graph) change({presentation:'map'}, false, true);});
$('show-cards').addEventListener('click', () => {if (graph) change({presentation:'cards'}, false, true);});
$('show-list').addEventListener('click', () => {if (graph) change({presentation:'list'}, false, true);});
$('treemap-share').addEventListener('click', async () => {
  if (!graph) return;
  const button = $('treemap-share');
  const url = location.href;
  try {
    await navigator.clipboard.writeText(url);
    if (location.href !== url) return;
    button.textContent = 'Link copied';
    $('treemap-share-status').textContent = 'View link copied, including filters and the selected company.';
  } catch {
    if (location.href !== url) return;
    button.textContent = 'Copy URL from address bar';
    $('treemap-share-status').textContent = 'Clipboard unavailable. Copy the link from your browser’s address bar; it includes the current view.';
  }
});
$('treemap-workspace').addEventListener('click', event => {
  const period = event.target.closest('[data-period]');
  if (period) {change({period:period.dataset.period}); return;}
  const company = event.target.closest('[data-company]');
  if (company) {
    showDetail(view.rows.find(row => row.id === company.dataset.company)); writeState();
    const bounds = detail.getBoundingClientRect();
    if (bounds.top < 0 || bounds.top > innerHeight - 120) {
      detail.focus({preventScroll:true});
      detail.scrollIntoView({block:'start', behavior:matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'});
    }
  }
});
window.addEventListener('popstate', () => {if (graph) {state = readState(); syncControls(); render(); writeState(true);}});
try {
  const store = await openGraph(); graph = store.graph; storeMode = store.mode;
  cohortColors = new Map(cohortNames(graph).map((name, index) => [name, palette[index % palette.length]]));
  state = readState(); syncControls(); render(); writeState(true);
  new ResizeObserver(entries => {if (entries[0].contentRect.width !== lastWidth) draw();}).observe(chart);
} catch {
  $('treemap-status').textContent = 'The company snapshot could not be loaded. Reload this page to try again.';
  chart.innerHTML = '<p>The treemap is temporarily unavailable. <a href="./">Return to the directory</a> or reload to try again.</p>';
  detail.innerHTML = '<p>Company evidence will appear when the snapshot is available.</p>';
  controls.querySelectorAll('input, select, button').forEach(control => {control.disabled = true;});
  document.querySelectorAll('.treemap-panel-actions button').forEach(control => {control.disabled = true;});
}
$('treemap-workspace').setAttribute('aria-busy', 'false');
