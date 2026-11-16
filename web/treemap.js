import { escapeHtml as esc, sourceUrl } from './logic.js';
import { openGraph } from './graph-store.js';
import { entityHref } from './graph-model.js';
import { logoFor, logoClassFor } from './logos.js';
import { METRICS, validYear, cohort, cohortNames, currencies, makeView, formatValue, treemap } from './treemap-model.js';

const $ = id => document.getElementById(id);
const controls = $('treemap-controls'), chart = $('treemap-chart'), detail = $('treemap-detail');
const titles = {valuation:'Recorded valuations', funding:'Funding announcements', companies:'Companies in the Atlas'};
const palette = ['#c9dfc7','#dce6bd','#d1e1e4','#ecddc3','#e1dceb','#d8e2d1'];
let graph, view, state, storeMode, selected = '', lastWidth = 0, cohortColors = new Map();
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
  return {metric, currency, group: params.get('group') === 'decade' ? 'decade' : 'company', query:(params.get('q') || '').slice(0, 200), period:periods.has(params.get('period')) ? params.get('period') : 'all', list:params.get('view') === 'list'};
}
function writeState(replace = false) {
  const params = new URLSearchParams();
  params.set('metric', state.metric);
  if (state.metric !== 'companies') params.set('currency', state.currency);
  if (state.group === 'decade') params.set('group', state.group);
  if (state.query) params.set('q', state.query);
  if (state.period !== 'all') params.set('period', state.period);
  if (state.list) params.set('view', 'list');
  const suffix = params.toString();
  const url = location.pathname + (suffix ? '?' + suffix : '');
  if (url !== location.pathname + location.search) history[replace ? 'replaceState' : 'pushState'](null, '', url);
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
function showDetail(row) {
  selected = row?.id || '';
  document.querySelectorAll('[data-company]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.company === selected)));
  if (!row) { detail.innerHTML = '<p class="treemap-eyebrow">THE EVIDENCE</p><h2>Start with a company.</h2><p>Select a tile or a company in the ranked list to see the announcement, its date and the original source.</p><p class="treemap-note">The Atlas is a researched selection. No comparable value means “not recorded”, never zero.</p>'; return; }
  const {entity, event} = row;
  detail.innerHTML = `<p class="treemap-eyebrow">${state.metric === 'companies' ? 'COMPANY PROFILE' : 'RECORDED FIGURE'}</p>${mark(entity)}<h2>${esc(entity.name)}</h2>${event ? `<p class="treemap-detail-value">${esc(money(row.value))}</p><p>${state.metric === 'valuation' ? 'Historical announced valuation' : 'Recorded announcement amount'}</p><dl><div><dt>Announced</dt><dd>${esc(event.announced_on)}</dd></div><div><dt>Event</dt><dd>${esc(event.stage || 'Not recorded')}</dd></div><div><dt>Currency</dt><dd>${esc(state.currency)}</dd></div></dl>` : ''}<p>${esc(entity.summary || 'Company details are being researched.')}</p><p class="treemap-note">${validYear(entity.founded_year) ? `Founded ${entity.founded_year}.` : 'Founding year not recorded.'}${row.newerUnplotted ? ' A newer announcement exists in this profile but is not plotted for this metric and currency.' : ''}</p>${event?.note ? `<p class="treemap-note">${esc(event.note)}</p>` : ''}${evidenceLink(event?.source || entity.source, event ? 'Read the announcement' : 'Read the profile source')}<a class="treemap-profile" href="${esc(entityHref(entity))}">Open full profile ↗</a>`;
  watchImages(detail);
}
function draw() {
  if (!view || state.list) return;
  const grouped = state.group === 'decade' && state.period === 'all';
  const items = grouped ? view.groups : view.rows;
  if (!items.length) {chart.innerHTML = `<p>${view.filteredCount ? 'No comparable figures in this selection. Try another currency or choose Company count to include every company.' : 'No companies match. Try a different search or reset the filters.'}</p>`; return;}
  chart.style.height = (state.metric === 'companies' && items.length > 15 ? 690 : 510) + 'px';
  const bounds = chart.getBoundingClientRect(); lastWidth = bounds.width;
  const tiles = treemap(items, bounds.width, bounds.height);
  chart.innerHTML = tiles.map((tile, index) => {
    const name = grouped ? tile.name : tile.entity.name;
    const color = cohortColors.get(grouped ? tile.id : tile.group) || palette[0];
    const size = tile.width < 40 || tile.height < 40 ? 'micro tiny' : tile.width < 130 || tile.height < 85 ? 'tiny' : tile.width < 230 || tile.height < 160 ? 'compact' : '';
    const meta = grouped ? `${tile.count} ${tile.count === 1 ? 'company' : 'companies'} · Explore →` : tile.event ? `Announced ${tile.event.announced_on}` : validYear(tile.entity.founded_year) ? `Founded ${tile.entity.founded_year}` : 'Founding year not recorded';
    const label = `${name}, ${money(tile.value)}${grouped ? ', explore this founding decade' : tile.event ? ', announced ' + tile.event.announced_on : ''}`;
    return `<button type="button" class="treemap-tile ${size} ${tile.width < 70 || tile.height < 70 ? 'mark-only' : ''} ${state.metric === 'companies' && !grouped ? 'count-company' : ''}" ${grouped ? `data-period="${esc(tile.id)}"` : `data-company="${esc(tile.id)}" aria-pressed="${selected === tile.id}"`} aria-label="${esc(label)}" title="${esc(label)}" style="left:${tile.x}px;top:${tile.y}px;width:${tile.width}px;height:${tile.height}px;--tile-color:${color}"><span class="treemap-tile-inner"><span class="treemap-tile-top"><span class="treemap-rank">${String(index + 1).padStart(2, '0')}</span><span class="treemap-value">${esc(money(tile.value))}</span></span><span class="treemap-tile-identity">${grouped ? '' : mark(tile.entity)}<span><span class="treemap-tile-name">${esc(name)}</span><span class="treemap-tile-meta">${esc(meta)}</span></span></span></span></button>`;
  }).join('');
  watchImages(chart);
}
function render({preserveSelection = false} = {}) {
  view = makeView(graph, state);
  $('treemap-heading').textContent = titles[state.metric];
  $('treemap-subtitle').textContent = state.metric === 'companies' ? 'Every company has equal area. Color indicates its recorded founding decade.' : `Latest dated numeric ${state.metric === 'valuation' ? 'valuation' : 'event amount'} recorded per company in ${state.currency}.`;
  $('treemap-breadcrumb').innerHTML = state.period === 'all' ? 'ALL COMPANIES' : `<button type="button" class="treemap-breadcrumb-button" data-period="all">ALL COMPANIES</button> / ${esc(state.period.toUpperCase())}`;
  $('treemap-summary').innerHTML = `<span><strong>${view.rows.length}</strong> of ${view.filteredCount} matching companies plotted</span>${state.metric !== 'companies' && view.rows.length ? `<span><strong>${esc(money(view.total))}</strong> sum of displayed figures</span>` : ''}`;
  $('treemap-status').textContent = `${storeMode === 'fallback' ? 'Showing the published JSON backup. ' : ''}${state.metric === 'companies' ? 'Company count includes records without financial data.' : 'Historical figures, not current values. Unknown or non-comparable amounts are excluded.'}`;
  $('treemap-legend').innerHTML = `<span>Area = ${state.metric === 'companies' ? 'company count' : 'recorded value'} · Founding decade:</span> ${view.groups.map(group => `<span class="treemap-legend-item"><i aria-hidden="true" style="background:${cohortColors.get(group.id)}"></i>${esc(group.name)}</span>`).join('')}`;
  $('show-map').setAttribute('aria-pressed', String(!state.list));
  $('show-list').setAttribute('aria-pressed', String(state.list));
  chart.hidden = state.list;
  $('treemap-list').hidden = !state.list;
  $('treemap-list').innerHTML = view.rows.length ? `<ol>${view.rows.map((row, index) => `<li><span>${String(index + 1).padStart(2, '0')}</span><div><button type="button" data-company="${esc(row.id)}" aria-pressed="false">${mark(row.entity)}<span>${esc(row.entity.name)}</span></button><small>${row.event ? `Announced ${esc(row.event.announced_on)}` : esc(row.group)}</small><a href="${esc(entityHref(row.entity))}">Full profile ↗</a></div><div class="treemap-list-value"><strong>${esc(money(row.value))}</strong>${row.event ? `<a href="${esc(sourceUrl(row.event.source))}" target="_blank" rel="noopener noreferrer">Announcement ↗</a>` : ''}</div></li>`).join('')}</ol>` : '<p>No comparable companies in this selection. Change the filters or try Company count.</p>';
  watchImages($('treemap-list'));
  $('treemap-missing').hidden = !view.missing.length;
  $('treemap-missing-label').textContent = `${view.missing.length} matching ${view.missing.length === 1 ? 'company has' : 'companies have'} no comparable ${state.metric === 'valuation' ? 'valuation' : 'amount'} in ${state.currency}`;
  $('treemap-missing-list').innerHTML = view.missing.map(entity => `<a href="${esc(entityHref(entity))}">${esc(entity.name)}</a>`).join('');
  draw();
  showDetail(preserveSelection ? view.rows.find(row => row.id === selected) : null);
}
function change(next, replace = false, preserveSelection = false) {
  state = {...state, ...next};
  syncControls(); writeState(replace); render({preserveSelection});
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
$('treemap-query').addEventListener('input', event => {if (graph) change({query:event.target.value}, true);});
$('treemap-reset').addEventListener('click', () => {if (graph) change({metric:'funding', currency:'USD', group:'company', query:'', period:'all', list:false});});
$('show-map').addEventListener('click', () => {if (graph) change({list:false}, false, true);});
$('show-list').addEventListener('click', () => {if (graph) change({list:true}, false, true);});
$('treemap-workspace').addEventListener('click', event => {
  const period = event.target.closest('[data-period]');
  if (period) {change({period:period.dataset.period}); return;}
  const company = event.target.closest('[data-company]');
  if (company) showDetail(view.rows.find(row => row.id === company.dataset.company));
});
window.addEventListener('popstate', () => {if (graph) {state = readState(); syncControls(); render();}});
try {
  const store = await openGraph(); graph = store.graph; storeMode = store.mode;
  cohortColors = new Map(cohortNames(graph).map((name, index) => [name, palette[index % palette.length]]));
  state = readState(); syncControls(); render();
  new ResizeObserver(entries => {if (entries[0].contentRect.width !== lastWidth) draw();}).observe(chart);
} catch {
  $('treemap-status').textContent = 'The company snapshot could not be loaded. Reload this page to try again.';
  chart.innerHTML = '<p>The treemap is temporarily unavailable. <a href="./">Return to the directory</a> or reload to try again.</p>';
  detail.innerHTML = '<p>Company evidence will appear when the snapshot is available.</p>';
  controls.querySelectorAll('input, select, button').forEach(control => {control.disabled = true;});
}
$('treemap-workspace').setAttribute('aria-busy', 'false');
