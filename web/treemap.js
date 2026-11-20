import { escapeHtml as esc, sourceUrl } from './logic.js';
import { openGraph } from './graph-store.js';
import { entityHref, kindName } from './graph-model.js';
import { logoFor, logoClassFor } from './logos.js';
import {
  COLOURS, GROUPS, METRICS, cohort, cohortNames, colourEncoding, companyContext, companyFigure, currencies,
  formatValue, groupedTreemap, makeView, treemap, validYear,
} from './treemap-model.js';
import { animateAtlasChange, canAnimateAtlasChange } from './atlas-ui.js';
import { countryName, explorationHref, filterCompanies, hasCompanyScope, indexCompanies, readExploration, writeExploration } from './atlas-exploration.js';
import { mountExploration } from './atlas-explorer-controls.js';

const $ = id => document.getElementById(id);
const controls = $('treemap-controls'), chart = $('treemap-chart'), detail = $('treemap-detail');
const workspace = $('treemap-workspace'), main = $('treemap-main');
const filterToggle = $('treemap-filter-toggle'), filterFields = $('treemap-filter-fields');
const smallScreen = matchMedia('(max-width: 650px)');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const presentations = ['map','cards','list'];
const defaults = {
  presentation:'map', metric:'companies', currency:'USD', group:'sector', colour:'sector',
  period:'all', logos:true,
};
const titles = {valuation:'Recorded valuations', funding:'Funding announcements', companies:'Company count'};
let graph, graphStore, view, state, exploration, dimensions, companies, entities, periods, colours;
let lastWidth = 0, visibleCompanies = new Set(), queryCompanies = [];
let previousQuery, searchMatches;
const money = value => formatValue(value, state.metric, state.currency);
const countLabel = count => formatValue(count, 'companies');
const safeImageUrl = value => /^\.\/assets\/logos\/[a-z0-9-]+\.(svg|png)$/i.test(value || '') ? value : sourceUrl(value);
const safeImage = entity => safeImageUrl(logoFor(entity.name)) ||
  (state.presentation !== 'cards' && sourceUrl(entity.logo_source) ? safeImageUrl(entity.logo) : '') || '';
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
function presentationFrom(params) {
  return presentations.includes(params.get('view')) ? params.get('view') : defaults.presentation;
}
function showPresentation(presentation) {
  const isCards = presentation === 'cards';
  const mayCollapse = isCards || smallScreen.matches;
  const collapseFilters = mayCollapse && filterToggle.getAttribute('aria-expanded') === 'false';
  const locationFields = $('treemap-location-fields');
  const returnFilterFocus = collapseFilters && (filterFields.contains(document.activeElement) || locationFields?.contains(document.activeElement));
  document.body.dataset.treemapView = presentation;
  $('treemap-intro').hidden = isCards;
  $('treemap-board-heading').hidden = !isCards;
  $('treemap-panel').setAttribute('aria-labelledby', isCards ? 'treemap-board-title' : 'treemap-heading');
  filterToggle.hidden = !mayCollapse;
  filterFields.hidden = collapseFilters;
  if (locationFields) locationFields.hidden = collapseFilters;
  if (returnFilterFocus) filterToggle.focus();
  chart.hidden = presentation !== 'map';
  $('treemap-cards').hidden = !isCards;
  $('treemap-list').hidden = presentation !== 'list';
  main.querySelector('[data-treemap-presentation="list"]').hidden = presentation !== 'map';
  $('treemap-tile-disclosure').hidden = true;
}
function validCurrency(metric, requested) {
  const available = currencies(graph, metric);
  return available.includes(requested) ? requested : available.includes('USD') ? 'USD' : available[0] || 'USD';
}
function readState() {
  const params = new URLSearchParams(location.search);
  const presentation = presentationFrom(params);
  const group = params.get('group'), colour = params.get('colour');
  const modern = params.has('colour') || ['sector','country','city','stage'].includes(group)
    || ['hq','sector','stage','place','city','selected','density','logos'].some(key => params.has(key));
  // Historic share links omitted default grouping and colour.
  const legacy = !modern && (presentation !== 'map' || ['metric','period','company','currency'].some(key => params.has(key)));
  const metric = METRICS.includes(params.get('metric')) ? params.get('metric') : legacy ? 'funding' : defaults.metric;
  const shared = readExploration(params);
  const oldSelection = params.get('company');
  return {
    ...defaults, ...shared, presentation, metric, currency:validCurrency(metric, params.get('currency')),
    group:GROUPS.includes(group) ? group : legacy ? 'company' : defaults.group,
    colour:COLOURS.includes(colour) ? colour : legacy ? 'decade' : defaults.colour,
    period:periods.has(params.get('period')) ? params.get('period') : 'all',
    selected:shared.selected || (entities.get(oldSelection)?.kind === 'startup' ? oldSelection : ''),
    logos:params.get('logos') !== 'off',
  };
}
function writeState(replace = false) {
  const params = new URLSearchParams();
  params.set('view', state.presentation);
  params.set('metric', state.metric);
  if (state.metric !== 'companies') params.set('currency', state.currency);
  params.set('group', state.group);
  params.set('colour', state.colour);
  if (state.period !== 'all') params.set('period', state.period);
  if (!state.logos) params.set('logos', 'off');
  if (new URLSearchParams(location.search).get('embed') === '1') params.set('embed', '1');
  writeExploration(params,state);
  if (entities.get(state.selected)?.kind === 'startup') params.set('company', state.selected);
  const url = location.pathname + '?' + params + location.hash;
  if (url !== location.pathname + location.search + location.hash) {
    history[replace ? 'replaceState' : 'pushState'](null, '', url);
    $('treemap-share').textContent = 'Share view';
    $('treemap-share-status').textContent = '';
  }
  document.dispatchEvent(new Event('atlas:exploration-change'));
}
function syncControls() {
  const presentation = $('treemap-presentation');
  if (presentation.getAttribute('value') !== state.presentation) presentation.setAttribute('value', state.presentation);
  $('treemap-metric').value = state.metric;
  const available = currencies(graph, state.metric);
  const currency = $('treemap-currency');
  const key = available.join(',');
  if (currency.dataset.options !== key) {
    currency.dataset.options = key;
    currency.innerHTML = available.length ? available.map(code => `<option>${esc(code)}</option>`).join('')
      : `<option value="USD">${state.metric === 'companies' ? 'Not applicable' : 'No comparable figures'}</option>`;
  }
  if (!available.length) currency.options[0].textContent = state.metric === 'companies' ? 'Not applicable' : 'No comparable figures';
  currency.disabled = !available.length;
  currency.value = state.currency;
  $('treemap-currency-field').hidden = state.metric === 'companies';
  $('treemap-group').value = state.group;
  $('treemap-colour').value = state.colour;
  $('treemap-logos').checked = state.logos;
  document.body.dataset.treemapLogos = state.logos ? 'on' : 'off';
  document.body.dataset.treemapDensity = state.density;
  if ($('treemap-query').value !== state.query) $('treemap-query').value = state.query;
}
function profileContext(entity) {
  const context = companyContext(graph, entity, state.currency);
  const links = [evidenceLink(entity.website,'Website'), ...context.socials.map(link => evidenceLink(link.url,link.label))].filter(Boolean).join('');
  const figures = context.figures.map(({metric,row,reason,event}) => `<div><dt>${metric === 'funding' ? 'Funding announcement' : 'Recorded valuation'}</dt><dd>${row ? `<strong>${esc(formatValue(row.value,metric,state.currency,false))}</strong><span>Announced ${esc(row.event.announced_on)}</span>${evidenceLink(row.event.source,'Source')}${row.newerUnplotted ? '<span>Newer unplotted announcement</span>' : ''}` : event ? `${esc(missingFigureLabel({reason},metric))}${event.announced_on ? `<span>Announced ${esc(event.announced_on)}</span>` : ''}${evidenceLink(event.source,'Source')}` : `Not recorded in ${esc(state.currency)}`}</dd></div>`).join('');
  const founders = context.founders.slice(0,3).map(({person,source,socials}) => `<article class="treemap-founder">${mark(person)}<div><a href="${esc(entityHref(person))}">${esc(person.name)}</a><small>Founder · ${evidenceLink(source,'Evidence')}</small>${evidenceLink(person.website,'Profile')}${socials.map(link => evidenceLink(link.url,link.label)).join('')}${person.logo ? evidenceLink(person.logo_source,'Photo source') : ''}</div></article>`).join('');
  const facts = context.facts.slice(0,3).map(fact => `<div><dt>${esc(fact.label)}</dt><dd>${esc(fact.value)}${evidenceLink(fact.source,'Source')}${fact.reviewed_at ? `<small>Reviewed ${esc(fact.reviewed_at)}</small>` : ''}</dd></div>`).join('');
  return `${links ? `<div class="treemap-company-links">${links}</div>` : ''}<details class="treemap-context" ${context.figures.some(item => item.row) ? 'open' : ''}><summary>Financial context · ${esc(state.currency)}</summary><p>Separate historical observations, not interchangeable measures.</p><dl>${figures}<div><dt>Public market cap</dt><dd>Not recorded. Funding and private valuations are not market cap.</dd></div></dl></details><details class="treemap-context" open><summary>Founders · ${context.founders.length} recorded</summary>${founders || '<p>Founder details are not recorded yet.</p>'}${context.founders.length > 3 ? '<p>More founders in the full profile.</p>' : ''}<p class="treemap-context-caption">Portraits appear only where sourced; initials are placeholders.</p></details>${facts ? `<details class="treemap-context"><summary>Company details · ${context.facts.length} sourced ${context.facts.length === 1 ? 'fact' : 'facts'}</summary><dl>${facts}</dl>${context.facts.length > 3 ? '<p>More facts in the full profile.</p>' : ''}</details>` : ''}`;
}
function missingFigureLabel(figure, metric = state.metric) {
  if (figure.reason === 'recorded-zero') return formatValue(0,metric,state.currency) + ' recorded';
  if (figure.reason === 'undisclosed') return metric === 'valuation' ? 'Valuation undisclosed' : 'Amount undisclosed';
  if (figure.reason === 'unknown') return metric === 'valuation' ? 'Valuation not recorded' : 'Funding history not recorded';
  return 'No comparable figure in ' + state.currency;
}

function figurePanel(figure, entity) {
  const {event} = figure;
  if (figure.reason) {
    return `<p class="treemap-detail-value">${esc(missingFigureLabel(figure))}</p>
      ${event?.announced_on ? `<p>Announced ${esc(event.announced_on)}</p>` : ''}
      ${evidenceLink(event?.source,'Read the announcement')}`;
  }
  if (state.metric === 'companies') {
    const context = {
      map:'Every company has equal area in the treemap.',
      cards:'Cards use an editorial layout; card area does not encode company count.',
      list:'Each company counts equally in the list.',
    };
    return `<p class="treemap-detail-value">One company</p><p>${context[state.presentation]}</p>${evidenceLink(entity.source,'Read the profile source')}`;
  }
  return `<p class="treemap-detail-value">${esc(money(figure.value))}</p>
    <p>${state.metric === 'valuation' ? 'Historical announced valuation' : 'Recorded announcement amount'}</p>
    <dl>
      <div><dt>Recorded figure</dt><dd>${esc(formatValue(figure.value,state.metric,state.currency,false))}</dd></div>
      <div><dt>Announced</dt><dd>${esc(event.announced_on)}</dd></div>
      <div><dt>Event</dt><dd>${esc(event.stage || 'Not recorded')}</dd></div>
      <div><dt>Currency</dt><dd>${esc(state.currency)}</dd></div>
    </dl>
    ${figure.newerUnplotted ? '<p class="treemap-note">A newer announcement exists in this profile but is not plotted for this metric and currency.</p>' : ''}
    ${event.note ? `<p class="treemap-note">${esc(event.note)}</p>` : ''}
    ${evidenceLink(event.source,'Read the announcement')}`;
}

function showDetail() {
  main.querySelectorAll('[data-company]').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.company === state.selected));
  });
  const entity = entities.get(state.selected);
  const previousTab = detail.dataset.inspected === state.selected ? detail.querySelector('ui-tabs')?.value : '';
  detail.dataset.inspected = state.selected;
  if (!entity) {
    detail.innerHTML = state.selected
      ? '<h2>Selected record unavailable</h2><button type="button" class="atlas-button" data-treemap-clear-selection>Clear selection</button>'
      : '<h2>Inspect a company</h2><p>Select a company to see its recorded figures and sources.</p>';
    return;
  }
  const isCompany = entity.kind === 'startup';
  const inResults = visibleCompanies.has(state.selected);
  const figure = isCompany ? companyFigure(graph,entity,state.metric,state.currency) : null;
  const place = dimensions.get(entity.id);
  const locationLabel = place?.country ? [place.city,countryName(place.country)].filter(Boolean).join(', ') : '';
  const scope = inResults
    ? '<p class="treemap-selection-status" data-selection="inside">In current results</p>'
    : `<div class="treemap-outside" data-selection="outside">
         <p>Outside current results</p>
         ${isCompany ? '<button type="button" class="atlas-button" data-treemap-adjust>Adjust filters</button>' : ''}
       </div>`;
  detail.innerHTML = `
    <div class="treemap-detail-identity">${mark(entity)}<div>
      <h2>${esc(entity.name)}</h2>
      <p>${esc(isCompany ? ['Company',place?.sector,locationLabel].filter(Boolean).join(' · ') : kindName(entity.kind))}</p>
    </div></div>
    ${scope}
    ${isCompany ? `
      <ui-tabs default-value="${previousTab || (state.metric === 'companies' ? 'company' : 'figure')}" aria-label="Company inspection">
        <ui-tabs-list class="treemap-detail-view" aria-label="Company inspection">
          <ui-tabs-tab value="figure"><button type="button" id="treemap-figure-tab" data-detail-view="figure">Figure</button></ui-tabs-tab>
          <ui-tabs-tab value="company"><button type="button" id="treemap-company-tab" data-detail-view="company">Company</button></ui-tabs-tab>
        </ui-tabs-list>
        <ui-tabs-panel as-child value="figure" keep-mounted><section id="treemap-figure-panel">${figurePanel(figure,entity)}</section></ui-tabs-panel>
        <ui-tabs-panel as-child value="company" keep-mounted><section id="treemap-company-panel">
          <p>${esc(entity.summary || 'Company details are being researched.')}</p>
          <p class="treemap-note">${validYear(entity.founded_year) ? `Founded ${entity.founded_year}.` : 'Founding year not recorded.'}</p>
          ${profileContext(entity)}${evidenceLink(entity.source,'Read the profile source')}
        </section></ui-tabs-panel>
      </ui-tabs>`
      : `<p>${esc(entity.summary || 'Profile details are being researched.')}</p>${evidenceLink(entity.source,'Read the profile source')}`}
    <div class="treemap-detail-actions" data-company-name="${esc(entity.name)}">
      <a class="treemap-profile atlas-button atlas-button-accent" data-atlas-profile-link href="${esc(entityHref(entity))}">Open full profile ↗</a>
      <a class="atlas-button" href="${esc(explorationHref('./graph.html?entity=' + encodeURIComponent(entity.id),location.href,state))}">Show in graph</a>
      ${isCompany ? `<button type="button" class="atlas-button" data-atlas-compare="${esc(entity.id)}" aria-pressed="false"><span data-atlas-action-label>Compare</span></button>
      <button type="button" class="atlas-button" data-atlas-save-company="${esc(entity.id)}" aria-pressed="false"><span data-atlas-action-label>Save company</span></button>` : ''}
      <button type="button" class="treemap-clear-selection" data-treemap-clear-selection>Clear selection</button>
    </div>
    <p class="sr-only" role="status">Inspecting ${esc(entity.name)}.</p>`;
  watchImages(detail);
}

function emptyResults() {
  if (view.filteredCount) return '<p>No comparable figures in this selection. <button class="treemap-utility-button" type="button" data-treemap-count>Try company count</button></p>';
  if (!companies.length) return '<p>No company records are available in this snapshot.</p>';
  if ((state.drillCountry || state.period !== 'all') && queryCompanies.length) {
    return '<p>No companies match your filters in this group. <button class="treemap-utility-button" type="button" data-treemap-path="root">View all matching companies</button></p>';
  }
  return `<p>No companies match${state.query ? ' “' + esc(state.query) + '”' : ' these filters'}.
    <button class="treemap-utility-button" type="button" data-treemap-adjust>Adjust filters</button></p>`;
}

const tileBounds = tile => `left:${tile.x}px;top:${tile.y}px;width:${tile.width}px;height:${tile.height}px`;
const bucketView = () => state.group === 'decade' && state.period === 'all' && state.colour === 'decade';
function tileMarkup(tile, aggregate = false) {
  const {entity, event} = tile;
  const name = aggregate ? tile.name : entity.name;
  const colour = colours.forCompany(aggregate ? tile.children[0].entity : entity);
  const size = tile.width < 40 || tile.height < 40 ? 'micro tiny'
    : tile.width < 130 || tile.height < 85 ? 'tiny' : tile.width < 230 || tile.height < 160 ? 'compact' : '';
  const meta = aggregate ? `${countLabel(tile.count)} · Explore ↗`
    : event ? `Announced ${event.announced_on}`
    : state.group !== 'company' ? tile.groupName
    : validYear(entity.founded_year) ? `Founded ${entity.founded_year}` : 'Founding year not recorded';
  const description = aggregate
    ? `Explore ${name}, ${money(tile.value)}`
    : [name, money(tile.value), event ? meta : '', colour.detail || colour.name].filter(Boolean).join(', ');
  const target = aggregate ? `data-period="${esc(tile.id)}"`
    : `data-company="${esc(tile.id)}" aria-pressed="${state.selected === tile.id}" aria-controls="treemap-detail"`;
  return `<button type="button" class="treemap-tile ${size}${tile.width < 70 || tile.height < 70 ? ' mark-only' : ''}${state.metric === 'companies' && !aggregate ? ' count-company' : ''}"
    ${target} aria-label="${esc(description)}" style="${tileBounds(tile)};--tile-color:${colour.fill}">
    <span class="treemap-tile-inner">
      <span class="treemap-tile-top"><span class="treemap-value">${esc(money(tile.value))}</span></span>
      <span class="treemap-tile-identity">${aggregate || !state.logos ? '' : mark(entity)}<span><span class="treemap-tile-name">${esc(name)}</span><span class="treemap-tile-meta">${esc(meta)}</span></span></span>
    </span>
  </button>`;
}

function focusCopy(previous, root) {
  if (!previous || (previous.isConnected && !previous.closest('[hidden]'))) return;
  if (filterFields.hidden && previous.closest('.exploration-controls')) {
    filterToggle.focus({preventScroll:true});
    return;
  }
  const id = previous.id;
  if (id && $(id) && !$(id).closest('[hidden]')) { $(id).focus({preventScroll:true}); return; }
  for (const key of ['company','period','treemapGroup','treemapCountry']) {
    if (previous.dataset[key]) {
      const replacement = [...root.querySelectorAll('button')].find(button => button.dataset[key] === previous.dataset[key] && !button.closest('[hidden]'));
      if (replacement) { replacement.focus({preventScroll:true}); return; }
    }
  }
  $(state.presentation === 'cards' ? 'treemap-board-title' : 'treemap-heading').focus({preventScroll:true});
}

function draw() {
  if (!view || state.presentation !== 'map') return;
  const previous = chart.contains(document.activeElement) ? document.activeElement : null;
  const aggregate = bucketView();
  const items = aggregate ? view.groups.filter(group => group.value > 0) : view.rows;
  chart.style.height = items.length > 0
    ? ((items.length === 1 ? 260 : state.metric === 'companies' && items.length > 15 ? state.density === 'compact' ? 560 : 650 : 510) + 'px')
    : 'auto';
  const bounds = chart.getBoundingClientRect();
  lastWidth = bounds.width;
  if (!items.length) chart.innerHTML = emptyResults();
  else if (aggregate || state.group === 'company') {
    chart.innerHTML = treemap(items,bounds.width,bounds.height).map(tile => tileMarkup(tile,aggregate)).join('');
  } else {
    chart.innerHTML = groupedTreemap(view.groups,bounds.width,bounds.height).map(group => `
      <div class="treemap-plot-group" role="group" aria-label="${esc(group.name)}" style="${tileBounds(group)}">
        ${group.tiles.map(tile => tileMarkup(tile)).join('')}
      </div>`).join('');
  }
  $('treemap-tile-disclosure').hidden = true;
  watchImages(chart);
  focusCopy(previous,chart);
}
function cardMedia(entity) {
  const image = state.logos ? logoFor(entity.name) : '';
  return `<span class="treemap-card-media" aria-hidden="true">
    ${image ? `<img src="${esc(image)}" alt="" hidden>` : ''}
    <span class="treemap-card-word">${esc(entity.name)}</span>
  </span>`;
}
function colourMark(entity) {
  const entry = colours.forCompany(entity);
  return entry.name
    ? `<span class="treemap-record-colour"><i aria-hidden="true" style="--tile-color:${entry.fill}"></i>${esc(entry.name)}</span>`
    : '';
}
function drawCards() {
  const cards = $('treemap-cards');
  const grouped = bucketView();
  const items = grouped ? view.groups.filter(group => group.value > 0) : view.rows;
  if (!items.length) { cards.innerHTML = emptyResults(); return; }
  const isRanked = !grouped && state.metric !== 'companies';
  const tailSize = isRanked && items.length > 3 ? (items.length - 3) % 4 : 0;
  cards.innerHTML = items.map((item, index) => {
    const name = grouped ? item.name : item.entity.name;
    const companyCount = !grouped && state.metric === 'companies';
    const dimensionsForCompany = dimensions.get(item.id);
    const place = dimensionsForCompany?.country
      ? [dimensionsForCompany.city,countryName(dimensionsForCompany.country)].filter(Boolean).join(', ') : '';
    const value = companyCount ? '' : money(item.value);
    const year = !grouped && validYear(item.entity.founded_year) ? `est. ${item.entity.founded_year}` : '';
    const date = grouped ? 'Explore decade ↗' : item.event ? `Announced ${item.event.announced_on}` : 'View evidence ↗';
    const summary = grouped ? countLabel(item.count) : item.entity.summary || 'Company description not recorded.';
    const label = [name,value,item.event ? date : grouped ? 'Explore this founding decade' : 'Inspect company',
      item.newerUnplotted ? 'A newer announcement is not plotted' : ''].filter(Boolean).join(', ');
    let variant = companyCount ? ' count-company' : '';
    if (isRanked && index < 3) variant = index === 0 ? ' featured board-leader' : ' featured';
    if (tailSize && index >= items.length - tailSize) variant = tailSize === 1 ? ' compact-tail single-tail' : ' compact-tail';
    if (items.length === 1) variant += ' solo-card';
    const target = grouped ? `data-period="${esc(item.id)}"` : `data-company="${esc(item.id)}" aria-controls="treemap-detail" aria-pressed="${state.selected === item.id}"`;
    return `<button type="button" class="treemap-card${variant}" ${target} aria-label="${esc(label)}">
      ${value ? `<span class="treemap-card-top"><span class="treemap-card-rank">${index + 1}</span><span class="treemap-card-value">${esc(value)}</span></span>` : ''}
      ${grouped ? '' : cardMedia(item.entity)}
      <span class="treemap-card-body"><span class="treemap-card-name">${esc(name)}</span><span class="treemap-card-summary">${esc(summary)}</span>
        ${place ? `<span class="treemap-card-place">${esc(place)}</span>` : ''}
        <span class="treemap-card-footer"><span class="treemap-card-date">${esc(date)}</span>${year ? `<span class="treemap-card-year">${esc(year)}</span>` : ''}</span>
        ${!grouped && state.colour !== 'decade' ? colourMark(item.entity) : ''}
        ${item.newerUnplotted ? '<span class="treemap-card-note">Newer announcement not plotted</span>' : ''}
      </span>
    </button>`;
  }).join('');
  watchImages(cards);
}
function drawRankedList() {
  const list = $('treemap-list');
  list.innerHTML = view.rows.length ? `<ol>${view.rows.map((row, index) => `
    <li><span>${String(index + 1).padStart(2,'0')}</span><div>
      <button type="button" data-company="${esc(row.id)}" aria-pressed="${state.selected === row.id}" aria-controls="treemap-detail">
        ${state.logos ? mark(row.entity) : ''}<span>${esc(row.entity.name)}</span>
      </button>
      <small>${row.event ? `Announced ${esc(row.event.announced_on)}` : state.group !== 'company' ? esc(row.groupName) : ''}</small>
      ${state.colour !== 'decade' ? colourMark(row.entity) : ''}
      <a data-atlas-profile-link href="${esc(entityHref(row.entity))}">Full profile ↗</a>
    </div><div class="treemap-list-value"><strong>${esc(money(row.value))}</strong>
      ${row.event ? evidenceLink(row.event.source,'Announcement') : ''}
    </div></li>`).join('')}</ol>` : emptyResults();
  watchImages(list);
}

function groupAction(group) {
  if (state.group === 'decade') return state.period === 'all' ? 'Explore decade' : '';
  if (state.group === 'country') return group.country !== state.drillCountry ? 'Explore country' : '';
  if (state.group === 'city') {
    if (group.country === 'unknown') return state.drillCountry !== 'unknown' ? 'Explore unrecorded locations' : '';
    return group.country !== state.drillCountry || group.city !== state.drillCity ? 'Explore city' : '';
  }
  if (state.group === 'sector' || state.group === 'stage') return group.id !== state[state.group] ? 'Filter by ' + state.group : '';
  return '';
}

function renderGroups() {
  const host = $('treemap-groups');
  host.hidden = state.group === 'company' || !view.groups.length;
  host.innerHTML = host.hidden ? '' : `<ul aria-label="Company groups">${view.groups.map(group => {
    const action = groupAction(group);
    const figure = state.metric === 'companies' ? '' : group.children.length
      ? ` · ${money(group.value)} from ${countLabel(group.children.length)}` : ' · No comparable figures';
    const target = state.group === 'decade' ? `data-period="${esc(group.id)}"` : `data-treemap-group="${esc(group.id)}"`;
    return `<li><div><strong>${esc(group.name)}</strong><small>${esc(countLabel(group.count) + figure)}</small></div>
      ${action ? `<button class="treemap-group-action" type="button" ${target} aria-label="${esc(action + ': ' + group.name)}">${esc(action)} ↗</button>` : ''}
    </li>`;
  }).join('')}</ul>`;
}

function renderSiblings() {
  const host = $('treemap-sibling-countries');
  host.hidden = !state.drillCountry || state.countries.length < 2;
  if (host.hidden) { host.replaceChildren(); return; }
  const counts = new Map();
  for (const entity of queryCompanies) {
    const country = dimensions.get(entity.id)?.country || 'unknown';
    counts.set(country, (counts.get(country) || 0) + 1);
  }
  host.innerHTML = `<nav aria-label="Matching headquarters countries">
    ${state.countries.map(code => {
      const label = esc(countryName(code) + ' · ' + countLabel(counts.get(code) || 0));
      return code === state.drillCountry ? `<span aria-current="location">${label}</span>`
        : `<button type="button" class="treemap-utility-button" data-treemap-country="${esc(code)}">${label}</button>`;
    }).join('')}
    <button type="button" class="treemap-utility-button" data-treemap-path="root">View all matching countries</button>
  </nav>`;
}

function renderLegend() {
  const legend = $('treemap-legend');
  const isMap = state.presentation === 'map';
  const area = state.metric === 'companies' ? 'Area · One unit per company'
    : `Area · Latest comparable ${state.metric === 'valuation' ? 'valuation' : 'announcement'} per company in ${state.currency}`;
  const context = isMap ? area : state.presentation === 'cards'
    ? 'Card sizes follow the editorial layout.' : state.metric === 'companies'
      ? 'Companies in alphabetical order' : 'Rows ordered by recorded value';
  const plotted = new Set(view.rows.map(row => colours.forCompany(row.entity).id));
  const entries = colours.entries.filter(entry => state.colour === 'freshness' && entry.id !== 'unknown' || plotted.has(entry.id));
  const showColour = entries.length && (isMap || state.colour !== 'decade');
  legend.innerHTML = `<span>${esc(context)}</span>${showColour ? `
    <div class="treemap-legend-scale" data-colour="${state.colour}">
      <strong>${esc(colours.label)}</strong>
      ${colours.asOf ? `<small>As of ${esc(colours.asOf)}</small>` : ''}
      <ul>${entries.map(entry => `<li class="treemap-legend-item"><i aria-hidden="true" style="--tile-color:${entry.fill}"></i>${esc(entry.name)}</li>`).join('')}</ul>
    </div>` : ''}`;
}
function renderMissing() {
  $('treemap-missing').hidden = !view.missing.length;
  $('treemap-missing-label').textContent = `${countLabel(view.missing.length)} without a plotted ${state.metric === 'valuation' ? 'valuation' : 'announcement amount'} in ${state.currency}`;
  $('treemap-missing-list').innerHTML = view.missing.length
    ? `<ul>${view.missing.map(entity => `<li><button type="button" class="treemap-utility-button" data-company="${esc(entity.id)}" aria-controls="treemap-detail" aria-pressed="${state.selected === entity.id}">${esc(entity.name)}</button>
       <span>${esc(missingFigureLabel(view.missingFigures.get(entity.id)))}</span></li>`).join('')}</ul>`
    : '';
}

function render() {
  const previous = main.contains(document.activeElement) ? document.activeElement : null;
  if (previousQuery !== state.query) {
    searchMatches = state.query.trim() ? graphStore.search(state.query,graph.entities.length) : companies;
    previousQuery = state.query;
  }
  queryCompanies = filterCompanies(searchMatches,dimensions,state,{ignoreDrill:true});
  const scoped = filterCompanies(queryCompanies,dimensions,state);
  view = makeView(graph,{...state, query:'', dimensions, companies:scoped});
  visibleCompanies = new Set([...view.rows.map(row => row.id), ...view.missing.map(entity => entity.id)]);
  colours = colourEncoding(state.colour,companies,dimensions);
  const isMap = state.presentation === 'map', isCards = state.presentation === 'cards';
  const hasPeriod = state.period !== 'all';
  const scopeTitle = state.drillCity ? state.drillCity === 'unknown' ? 'City not recorded' : state.drillCity
    : state.drillCountry ? countryName(state.drillCountry) : 'Explore the ecosystem';
  $('treemap-page-title').textContent = scopeTitle;
  $('treemap-heading').textContent = titles[state.metric];
  $('treemap-board-title').textContent = titles[state.metric];
  $('treemap-instructions').textContent = isMap
    ? 'Each rectangle is proportional to its recorded value or company count. Select a company to read its evidence. Small tiles have equivalent controls in the ranked list.'
    : isCards
      ? 'Cards use an editorial layout; card area does not encode value or company count. Select a card to read its evidence.'
      : 'Select a company in the list to read its evidence. Financial figures are ranked by recorded value; company counts use alphabetical order.';
  const latest = `Latest dated numeric ${state.metric === 'valuation' ? 'valuation' : 'event amount'} recorded per company in ${state.currency}.`;
  $('treemap-subtitle').textContent = state.metric !== 'companies' ? latest : isMap
    ? 'Every company has equal area.' : 'Companies in alphabetical order.';
  $('treemap-board-context').textContent = state.metric !== 'companies' ? latest
    : bucketView() ? 'Founding decades ranked by company count.' : 'Companies in alphabetical order.';
  $('treemap-breadcrumb').hidden = state.group !== 'decade' && !hasPeriod;
  $('treemap-breadcrumb').innerHTML = hasPeriod
    ? `<button type="button" class="treemap-breadcrumb-button" data-period="all">All ecosystems</button> / ${esc(state.period)}`
    : 'All ecosystems';
  const coverage = `<span><strong>${view.rows.length}</strong> of ${view.filteredCount} matching companies ${isMap ? 'plotted' : 'shown'}</span>`;
  $('treemap-board-summary').innerHTML = coverage;
  $('treemap-summary').innerHTML = state.metric === 'companies'
    ? hasPeriod ? `<span><strong>${esc(countLabel(view.filteredCount))}</strong> in this group · ${esc(countLabel(queryCompanies.length))} match your filters</span>` : ''
    : coverage + (view.rows.length ? `<span><strong>${esc(money(view.total))}</strong> sum of displayed historical figures</span>` : '');
  const status = $('treemap-status');
  status.textContent = `${graphStore.mode === 'fallback' ? 'Showing the published JSON backup. ' : ''}${state.metric === 'companies'
    ? 'Company count includes records without financial data.' : 'Historical figures from the selected currency.'}`;
  status.classList.toggle('sr-only', graphStore.mode !== 'fallback');
  showPresentation(state.presentation);
  exploration.update(state,searchMatches,hasPeriod ? entity => cohort(entity) === state.period : undefined);
  renderGroups();
  renderSiblings();
  renderLegend();
  if (isCards) {
    $('treemap-list').replaceChildren();
    drawCards();
  } else {
    drawRankedList();
  }
  renderMissing();
  draw();
  showDetail();
  focusCopy(previous,main);
}
function tilePositions(surface) {
  return [...surface.querySelectorAll('button[data-company], button[data-period]')].slice(0, 36).flatMap(tile => {
    const rect = tile.getBoundingClientRect();
    if (!rect.width || !rect.height || rect.bottom < 0 || rect.top > innerHeight) return [];
    const key = tile.dataset.company || 'period:' + tile.dataset.period;
    return [{key, tile, rect}];
  });
}
function animateTilePositions(surface, before) {
  const moves = [], arrivals = [];
  for (const {key, tile, rect} of tilePositions(surface)) {
    const old = before.get(key);
    if (!old) { arrivals.push(tile); continue; }
    const x = old.left - rect.left, y = old.top - rect.top;
    if (Math.abs(x) > 1 || Math.abs(y) > 1) moves.push({tile, x, y});
  }
  if (!moves.length && !arrivals.length) return;
  animateAtlasChange(surface, timeline => {
    for (const {tile, x, y} of moves) {
      if (tile.isConnected) timeline.fromTo(tile, {x,y}, {x:0,y:0,duration:.34}, 0);
    }
    const visibleArrivals = arrivals.filter(tile => tile.isConnected);
    if (visibleArrivals.length) timeline.fromTo(visibleArrivals, {opacity:.68}, {opacity:1,stagger:{amount:.08}}, 0);
  });
}
function change(next, replace = false) {
  if (!state || Object.keys(next).every(key => next[key] === state[key])) return;
  const surface = state.presentation === 'cards' ? $('treemap-cards') : state.presentation === 'map' ? chart : null;
  const changesLayout = !replace && ['metric','currency','group','period','drillCountry','drillCity','density']
    .some(key => key in next && next[key] !== state[key]);
  const staysOnSurface = !next.presentation || next.presentation === state.presentation;
  const before = changesLayout && staysOnSurface && surface && canAnimateAtlasChange(surface)
    ? new Map(tilePositions(surface).map(({key,rect}) => [key,rect])) : null;
  state = {...state, ...next};
  syncControls();
  render();
  writeState(replace);
  if (before) animateTilePositions(surface,before);
}

function enterCountry(code) {
  change({drillCountry:code, drillCity:'', group:state.group === 'country' && code !== 'unknown' ? 'city' : state.group});
}
function activateGroup(id) {
  const group = view.groups.find(item => item.id === id);
  if (!group) return;
  if (state.group === 'country') enterCountry(group.country);
  else if (state.group === 'city') change({drillCountry:group.country, drillCity:group.country === 'unknown' ? '' : group.city});
  else if (state.group === 'sector' || state.group === 'stage') change({[state.group]:group.id});
}
function adjustFilters() {
  if (filterFields.hidden) {
    filterToggle.setAttribute('aria-expanded','true');
    showPresentation(state.presentation);
  }
  if (state.query) $('treemap-query').focus();
  else if (state.sector || state.stage) {
    const key = state.sector ? 'sector' : 'stage';
    ($(`atlas-${key}-trigger`) || $(`atlas-${key}`)).focus();
  } else if (hasCompanyScope(state)) exploration.openCountries();
  else $('treemap-query').focus();
}
function inspect(id) {
  if (!entities.has(id)) return;
  state.selected = id;
  showDetail();
  writeState();
  const bounds = detail.getBoundingClientRect();
  if (bounds.top < 0 || bounds.top > innerHeight - 120) {
    detail.focus({preventScroll:true});
    detail.scrollIntoView({block:'start', behavior:reducedMotion.matches ? 'instant' : 'smooth'});
  }
}
function clearSelection() {
  const selected = state.selected;
  state.selected = '';
  showDetail();
  writeState();
  const trigger = [...main.querySelectorAll('button[data-company]')].find(button =>
    button.dataset.company === selected && button.getClientRects().length);
  if (trigger) trigger.focus();
  else $(state.presentation === 'cards' ? 'treemap-board-title' : 'treemap-heading').focus();
}

controls.addEventListener('submit', event => event.preventDefault());
filterToggle.addEventListener('click', () => {
  if (!state) return;
  filterToggle.setAttribute('aria-expanded', String(filterFields.hidden));
  showPresentation(state.presentation);
});
controls.addEventListener('change', event => {
  if (!state) return;
  const {id, value, checked} = event.target;
  if (id === 'treemap-metric' && METRICS.includes(value)) change({metric:value, currency:validCurrency(value,state.currency)});
  else if (id === 'treemap-currency' && currencies(graph,state.metric).includes(value)) change({currency:value});
  else if (id === 'treemap-group' && GROUPS.includes(value)) change({group:value});
  else if (id === 'treemap-colour' && COLOURS.includes(value)) change({colour:value});
  else if (id === 'treemap-logos') change({logos:checked});
});
$('treemap-query').addEventListener('input', event => { if (!event.isComposing) change({query:event.target.value},true); });
$('treemap-query').addEventListener('compositionend', event => change({query:event.target.value},true));
$('treemap-reset').addEventListener('click', () => {
  if (!state) return;
  document.dispatchEvent(new Event('atlas:reset-exploration'));
  change({...defaults, ...readExploration(new URLSearchParams())});
});
for (const presentation of presentations) {
  $('show-' + presentation).addEventListener('click', () => {
    if (!$('treemap-presentation').api) change({presentation});
  });
}
$('treemap-presentation').addEventListener('valuechange', event => {
  if (presentations.includes(event.detail.value)) change({presentation:event.detail.value});
});
$('treemap-share').addEventListener('click', async () => {
  if (!state) return;
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
main.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button || !view) return;
  const action = button.dataset;
  if (action.period) change({period:action.period});
  else if (action.treemapGroup) activateGroup(action.treemapGroup);
  else if (action.treemapCountry) enterCountry(action.treemapCountry);
  else if (action.treemapPath === 'root') change({drillCountry:'', drillCity:'', period:'all'});
  else if (action.company) inspect(action.company);
  else if ('treemapClearSelection' in action) clearSelection();
  else if ('treemapAdjust' in action) adjustFilters();
  else if ('treemapCount' in action) change({metric:'companies'});
  else if (action.treemapPresentation) {
    change({presentation:action.treemapPresentation});
    $('treemap-list').querySelector('button')?.focus();
  }
});
detail.addEventListener('keydown', event => {
  if (event.key === 'Escape' && state?.selected) {
    event.preventDefault();
    clearSelection();
  }
});
function discloseTile(target) {
  const tile = target?.closest?.('.treemap-tile');
  const disclosure = $('treemap-tile-disclosure');
  disclosure.hidden = !tile;
  if (tile) disclosure.textContent = tile.getAttribute('aria-label');
}
chart.addEventListener('pointerover', event => discloseTile(event.target));
chart.addEventListener('pointerleave', () => discloseTile(chart.contains(document.activeElement) ? document.activeElement : null));
chart.addEventListener('focusin', event => discloseTile(event.target));
chart.addEventListener('focusout', event => discloseTile(event.relatedTarget && chart.contains(event.relatedTarget) ? event.relatedTarget : null));
smallScreen.addEventListener('change', () => { if (state) showPresentation(state.presentation); });
window.addEventListener('popstate', () => {
  if (!graph) return;
  state = readState();
  syncControls();
  render();
  writeState(true);
});

try {
  graphStore = await openGraph();
  graph = graphStore.graph;
  entities = new Map(graph.entities.map(entity => [entity.id,entity]));
  companies = graph.entities.filter(entity => entity.kind === 'startup');
  dimensions = indexCompanies(graph);
  periods = new Set(cohortNames(graph));
  $('treemap-presentation').removeAttribute('disabled');
  controls.querySelectorAll('input, select, button').forEach(control => { control.disabled = false; });
  exploration = mountExploration($('treemap-exploration'),{
    companies,dimensions,onChange:next => {
      if ('drillCountry' in next && next.drillCountry && state.group === 'country') enterCountry(next.drillCountry);
      else change(next);
    },
  });
  $('treemap-exploration').querySelector('.exploration-fields').id = 'treemap-location-fields';
  state = readState();
  syncControls();
  render();
  writeState(true);
  new ResizeObserver(entries => { if (entries[0].contentRect.width !== lastWidth) draw(); }).observe(chart);
} catch {
  $('treemap-status').textContent = 'The company snapshot could not be loaded. Reload this page to try again.';
  showPresentation(presentationFrom(new URLSearchParams(location.search)));
  const unavailable = '<p>The treemap is temporarily unavailable. <a href="">Reload this view</a> or <a href="./">return to the directory</a>.</p>';
  for (const panel of [chart, $('treemap-cards'), $('treemap-list')]) panel.innerHTML = unavailable;
  detail.innerHTML = '<p>Company evidence will appear when the snapshot is available.</p>';
  $('treemap-presentation').setAttribute('disabled', '');
  controls.querySelectorAll('input, select, button').forEach(control => {control.disabled = true;});
  main.querySelector('[data-treemap-presentation="list"]').hidden = true;
}
controls.setAttribute('aria-busy','false');
workspace.setAttribute('aria-busy','false');
