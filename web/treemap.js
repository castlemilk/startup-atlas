import { escapeHtml as esc, sourceUrl } from './logic.js';
import { openGraph } from './graph-store.js';
import { entityHref, kindName } from './graph-model.js';
import { logoFor, logoClassFor } from './logos.js';
import {
  COLOURS, COMPANY_VALUE, GROUPS, METRICS, cohort, cohortNames, colourEncoding, companyContext, companyFigure, currencies,
  formatValue, groupedTreemap, indexCompanyValues, loadTreemapEvidence, makeView, tileTicker, treemap, validYear,
} from './treemap-model.js';
import { animateAtlasChange, canAnimateAtlasChange, icon } from './atlas-ui.js';
import { companyPlaceLabel, countryName, explorationHref, filterCompanies, hasCompanyScope, indexCompanies, multipleHeadquarters, readExploration, writeExploration } from './atlas-exploration.js';
import { mountExploration } from './atlas-explorer-controls.js';

const $ = id => document.getElementById(id);
const controls = $('treemap-controls'), chart = $('treemap-chart'), detail = $('treemap-detail');
const workspace = $('treemap-workspace'), main = $('treemap-main');
const filterToggle = $('treemap-filter-toggle'), filterFields = $('treemap-filter-fields');
const fieldsHost = $('treemap-location-fields');
const inspectorSheet = $('treemap-inspector-sheet'), sheetContent = $('treemap-sheet-content'), detailSeat = $('treemap-detail-seat');
const smallScreen = matchMedia('(max-width: 720px)');
const sheetViewport = matchMedia('(max-width: 900px)');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const presentations = ['map','cards','list'];
const defaults = {
  presentation:'map', metric:COMPANY_VALUE, currency:'USD', group:'technology', colour:'technology',
  period:'all', logos:true,
};
const titles = {valuation:'Recorded valuations', funding:'Funding announcements', 'market-cap':'Public market cap', companies:'Company count', [COMPANY_VALUE]:'Company value'};
const figureNames = {valuation:'Recorded valuation', funding:'Funding announcement', 'market-cap':'Public market cap'};
const valueBases = {'market-cap':'Market cap', valuation:'Private valuation'};
const ownershipNames = {public:'Publicly listed', private:'Privately held', subsidiary:'Subsidiary'};
const valueBasisNames = {listed_market_cap:'Listed market cap', last_round_post_money:'Last round post-money', secondary_sale:'Secondary sale', announced_valuation:'Announced valuation'};
const figureDate = (event,metric) => metric === 'market-cap' ? event.observed_on : event.announced_on;
const dateLabel = metric => metric === 'market-cap' ? 'As of' : 'Announced';
const datedFigure = (event,metric) => figureDate(event,metric) ? `${dateLabel(metric)} ${figureDate(event,metric)}` : '';
const newerFigure = metric => metric === 'market-cap' ? 'Newer market-cap observation outside this currency' : 'Newer announcement not plotted';
let graph, graphStore, view, state, exploration, dimensions, companies, entities, periods, colours;
let technology, ownership, marketCaps, privateValuations, companyValues, evidenceAvailable;
let lastWidth = 0, lastHeight = 0, visibleCompanies = new Set(), queryCompanies = [];
let previousQuery, searchMatches;
let sheetSuspended = false;
const money = value => formatValue(value, state.metric, state.currency);
const figureAmount = (figure, compact = true) => `${figure.basis && figure.event?.approximate ? '≈ ' : ''}${formatValue(figure.value, figure.basis || state.metric, figure.currency || state.currency, compact)}`;
const figureBadge = basis => basis ? `<span class="treemap-figure-basis" data-figure-basis="${basis}"><i aria-hidden="true"></i><span>${valueBases[basis]}</span></span>` : '';
const availableCurrencies = metric => currencies(graph,metric,marketCaps,companyValues);
const countLabel = count => formatValue(count, 'companies');
const safeImageUrl = value => /^\.\/assets\/logos\/[a-z0-9-]+\.(svg|png)$/i.test(value || '') ? value : sourceUrl(value);
const safeImage = entity => safeImageUrl(logoFor(entity.name)) ||
  (state.presentation !== 'cards' && sourceUrl(entity.logo_source) ? safeImageUrl(entity.logo) : '') || '';
// Cards can use these already published marks while the graph still cites the reviewed asset and issuer.
const reviewedCardMarks = new Map([
  ['startup:synthesia', {file:'synthesia.svg', source:'https://www.synthesia.io/'}],
  ['startup:culture-amp', {file:'culture-amp.svg', source:'https://www.cultureamp.com/company/media-kit'}],
  ['startup:quantum-brilliance', {file:'quantum-brilliance.svg', source:'https://quantumbrilliance.com/'}],
]);
function reviewedCardLogo(entity) {
  const mark = reviewedCardMarks.get(entity.id);
  if (entity.kind !== 'startup' || !mark || entity.logo_source !== mark.source ||
      entity.logo !== 'https://castlemilk.github.io/startup-atlas/assets/logos/' + mark.file) return '';
  return './assets/logos/' + mark.file;
}
const initials = name => name.trim().split(/\s+/).slice(0, 2).map(part => part[0] || '').join('').toUpperCase();
const logoCanvases = new Map([
  ['https://cdn.prod.website-files.com/65dd072aa7402b211d7d6ccf/65deeccca712cb796025a2bd_Canva.png', 'cream'],
  ['https://cdn.prod.website-files.com/65dd072aa7402b211d7d6ccf/682e6024c5310854fd2e8771_Airwallex.png', 'cream'],
  ['https://cdn.prod.website-files.com/65dd072aa7402b211d7d6ccf/65deebb3b1f92c263f5ae217_eucalyptus.png', 'cream'],
  ['https://cdn.prod.website-files.com/65dd072aa7402b211d7d6ccf/65deeae7438d7008c86bcb61_go1.png', 'cream'],
  ['https://cdn.prod.website-files.com/606fb05b65b92b81e55c6d25/64257e22d4819ad5c47dfe76_Portfolio-Cauldron-Logo-Lrg.jpg', 'white'],
  ['https://cdn.prod.website-files.com/606fb05b65b92b81e55c6d25/63b64e9a0e651d1d03862588_Portfolio-Gilmour-Space-Logo-Lrg.jpg', 'white'],
  ['https://cdn.prod.website-files.com/606fb05b65b92b81e55c6d25/61e7373efa113ef6ed2559dd_Portfolio-Loam-Logo-Lrg.jpg', 'white'],
  ['https://cdn.prod.website-files.com/606fb05b65b92b81e55c6d25/64f9522a52d943ac73545d0b_Portfolio-uluu-Logo-Lrg.jpg', 'white'],
]);
const mark = entity => {
  const image = safeImage(entity);
  const canvas = logoCanvases.get(image);
  return `<span class="treemap-logo ${esc(logoClassFor(entity.name))}"${canvas ? ` data-logo-canvas="${canvas}"` : ''} aria-hidden="true">${image ? `<img src="${esc(image)}" alt="" hidden referrerpolicy="no-referrer">` : ''}<span>${esc(initials(entity.name))}</span></span>`;
};
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
  const hideDesktopFacets = isCards && !smallScreen.matches && collapseFilters;
  const returnFilterFocus = collapseFilters && (filterFields.contains(document.activeElement) || (hideDesktopFacets && fieldsHost.contains(document.activeElement)));
  document.body.dataset.treemapView = presentation;
  $('treemap-page-heading').hidden = isCards;
  $('treemap-board-heading').hidden = !isCards;
  $('treemap-panel').setAttribute('aria-labelledby', isCards ? 'treemap-board-title' : 'treemap-heading');
  filterToggle.hidden = !mayCollapse;
  filterToggle.textContent = smallScreen.matches ? 'Display' : 'Filters';
  filterFields.hidden = collapseFilters;
  fieldsHost.hidden = hideDesktopFacets;
  if (returnFilterFocus) filterToggle.focus();
  chart.hidden = presentation !== 'map';
  $('treemap-canvas-frame').hidden = chart.hidden;
  $('treemap-cards').hidden = !isCards;
  $('treemap-list').hidden = presentation !== 'list';
  main.querySelector('[data-treemap-presentation="list"]').hidden = presentation !== 'map';
  $('treemap-tile-disclosure').hidden = true;
}
function validCurrency(metric, requested) {
  const available = availableCurrencies(metric);
  return available.includes(requested) ? requested : available.includes('USD') ? 'USD' : available[0] || 'USD';
}
function readState() {
  const params = new URLSearchParams(location.search);
  const presentation = presentationFrom(params);
  const group = params.get('group'), colour = params.get('colour'), requestedMetric = params.get('metric');
  const modern = params.has('colour') || ['market-cap',COMPANY_VALUE].includes(requestedMetric) || ['technology','sector','country','city','stage'].includes(group)
    || ['hq','sector','stage','place','city','selected','density','logos'].some(key => params.has(key));
  // Historic share links omitted default grouping and colour.
  const legacy = !modern && (presentation !== 'map' || ['metric','period','company','currency'].some(key => params.has(key)));
  const metric = METRICS.includes(requestedMetric) ? requestedMetric : legacy ? 'funding' : defaults.metric;
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
  const available = availableCurrencies(state.metric);
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
  $('atlas-density').value = state.density;
  const densityControl = $('treemap-density');
  if (densityControl.getAttribute('value') !== state.density) densityControl.setAttribute('value',state.density);
  $('treemap-logos').checked = state.logos;
  document.body.dataset.treemapLogos = state.logos ? 'on' : 'off';
  document.body.dataset.treemapDensity = state.density;
  if ($('treemap-query').value !== state.query) $('treemap-query').value = state.query;
}
function profileContext(entity) {
  const context = companyContext(graph, entity, state.currency, marketCaps, privateValuations);
  const technologyFact = technology.get(entity.id);
  const owner = ownership.get(entity.id);
  const companyValue = companyValues.get(entity.id);
  const logoSource = state.presentation === 'cards' && reviewedCardLogo(entity) ? evidenceLink(entity.logo_source,'Logo source') : '';
  const links = [evidenceLink(entity.website,'Website'), logoSource, ...context.socials.map(link => evidenceLink(link.url,link.label))].filter(Boolean).join('');
  const figures = context.figures.map(({metric,row,reason,event}) => {
    const date = event ? datedFigure(event, metric) : '';
    const value = row ? `<strong>${esc(formatValue(row.value,metric,state.currency,false))}</strong>` : esc(missingFigureLabel({reason},metric));
    const listing = event && metric === 'market-cap' ? `<span>${esc(event.exchange)} · ${esc(event.ticker)}</span>` : '';
    return `<div><dt>${figureNames[metric]}</dt><dd>${value}${listing}${date ? `<span>${esc(date)}</span>` : ''}
      ${evidenceLink(event?.source,'Source')}${row?.newerUnplotted ? `<span>${newerFigure(metric)}</span>` : ''}</dd></div>`;
  }).join('');
  const founders = context.founders.map(({person,source,socials}) => `<article class="treemap-founder">${mark(person)}<div><a href="${esc(entityHref(person))}">${esc(person.name)}</a><small>Founder · ${evidenceLink(source,'Evidence')}</small>${evidenceLink(person.website,'Profile')}${socials.map(link => evidenceLink(link.url,link.label)).join('')}${person.logo ? evidenceLink(person.logo_source,'Photo source') : ''}</div></article>`).join('');
  const facts = context.facts.map(fact => `<div><dt>${esc(fact.label)}</dt><dd>${esc(fact.value)}${evidenceLink(fact.source,'Source')}${fact.reviewed_at ? `<small>Reviewed ${esc(fact.reviewed_at)}</small>` : ''}</dd></div>`).join('');
  const rounds = context.rounds.map(round => {
    const amount = Number.isFinite(round.amount) && round.currency ? formatValue(round.amount,'funding',round.currency) : round.amount_text;
    const valuation = Number.isFinite(round.valuation) && round.valuation_currency ? `${formatValue(round.valuation,'valuation',round.valuation_currency)} valuation` : round.valuation_text;
    const terms = [round.announced_on, amount, valuation].filter(Boolean).join(' · ');
    return `<div><dt>${esc(round.stage || 'Funding announcement')}</dt><dd>${esc(terms || 'Terms unavailable')} ${evidenceLink(round.source,'Source')}${round.note ? `<small>${esc(round.note)}</small>` : ''}</dd></div>`;
  }).join('');
  const valueContext = companyValue?.event ? `<div><dt>${valueBases[companyValue.basis]}</dt><dd><strong>${esc(figureAmount(companyValue))}</strong> <span>${esc(datedFigure(companyValue.event,companyValue.basis))}</span> ${evidenceLink(companyValue.event.source,'Value source')}</dd></div>` : '';
  const lv = context.value;
  const listingLine = context.listing?.status === 'public'
    ? `<p>Listed · ${esc(context.listing.exchange)}: ${esc(context.listing.ticker)}</p>`
    : context.listing && ownershipNames[context.listing.status] ? `<p>${esc(ownershipNames[context.listing.status])}</p>` : '';
  const valueBlock = `<section class="treemap-value-block"><h3>Value</h3>${lv
    ? `<p class="treemap-detail-value">${lv.approximate ? '≈ ' : ''}${esc(formatValue(lv.amount,'valuation',lv.currency,false))}</p>
       <p>${esc(valueBasisNames[lv.basis] || 'Recorded value')} · As of ${esc(lv.as_of)} ${evidenceLink(lv.source,'Value source')}</p>`
    : '<p>Valuation not recorded.</p>'}${listingLine}</section>`;
  const history = context.valueHistory.length ? `<section class="treemap-value-history"><h3>Valuation history</h3><dl>${context.valueHistory.map(entry => `<div><dt>${esc(entry.date)} · ${esc(entry.label)}</dt><dd>${entry.approximate ? '≈ ' : ''}${esc(formatValue(entry.amount,'valuation',entry.currency))}${entry.ticker ? ` · ${esc(entry.exchange)}: ${esc(entry.ticker)}` : ''} ${evidenceLink(entry.source,'Source')}</dd></div>`).join('')}</dl></section>` : '';
  return `${valueBlock}${history}<p class="treemap-note"><strong>Technology type</strong> ${esc(technologyFact?.type || 'Not recorded')}${technologyFact ? `<br>${esc(technologyFact.detail)} ${evidenceLink(technologyFact.source,'Technology source')}` : ''}</p>
    ${owner ? `<p class="treemap-note"><strong>${ownershipNames[owner.status]}</strong> · ${esc(owner.observed_on)}<br>${esc(owner.detail)} ${evidenceLink(owner.source,'Ownership source')}</p>` : '<p>Ownership evidence not recorded.</p>'}
    <section class="treemap-founders"><h3>Founders</h3>${founders || '<p>Founder details are not recorded yet.</p>'}</section>
    <details class="treemap-context"><summary>Financial context</summary><dl>${valueContext}${figures}</dl></details>
    ${facts ? `<details class="treemap-context"><summary>Company details · ${context.facts.length} sourced ${context.facts.length === 1 ? 'fact' : 'facts'}</summary><dl>${facts}</dl></details>` : ''}
    ${rounds ? `<details class="treemap-context"><summary>Funding history · ${context.rounds.length} recorded</summary><dl>${rounds}</dl></details>` : ''}
    ${links ? `<div class="treemap-company-links">${links}</div>` : ''}`;
}
function missingFigureLabel(figure, metric = state.metric) {
  if (metric === COMPANY_VALUE) {
    if (figure.reason === 'ownership-not-recorded') return 'Ownership evidence not recorded';
    if (figure.reason === 'not-standalone') return 'No standalone company value';
    if (figure.reason === 'different-currency') return `Latest ${valueBases[figure.basis].toLowerCase()} is in ${figure.currency}`;
    return figure.basis === 'market-cap' ? 'No sourced market cap' : 'No comparable private valuation';
  }
  if (figure.reason === 'recorded-zero') return formatValue(0,metric,state.currency) + ' recorded';
  if (figure.reason === 'undisclosed') return metric === 'valuation' ? 'Valuation undisclosed' : 'Amount undisclosed';
  if (figure.reason === 'unknown') return {
    valuation:'Valuation not recorded',
    funding:'Funding history not recorded',
    'market-cap':'No recorded public market cap',
  }[metric];
  return 'No comparable figure in ' + state.currency;
}

function figureSources(...links) {
  const markup = links.join('');
  return markup ? `<div class="treemap-figure-sources">${markup}</div>` : '';
}

function figurePanel(figure, entity) {
  const {event, basis = state.metric} = figure;
  const isCompanyValue = state.metric === COMPANY_VALUE;
  if (figure.reason) {
    return `<p class="treemap-detail-value">${esc(missingFigureLabel(figure))}</p>
      ${event ? `<p>${esc(datedFigure(event,basis))}</p>` : ''}
      ${figureSources(evidenceLink(event?.source,isCompanyValue ? 'Value source' : 'Read the announcement'),
        isCompanyValue ? evidenceLink(ownership.get(entity.id)?.source,'Ownership source') : '')}`;
  }
  if (state.metric === 'companies') {
    const context = {
      map:'Every company has equal area in the treemap.',
      cards:'Cards use an editorial layout; card area does not encode company count.',
      list:'Each company counts equally in the list.',
    };
    return `<p class="treemap-detail-value">One company</p><p>${context[state.presentation]}</p>${figureSources(evidenceLink(entity.source,'Read the profile source'))}`;
  }
  if (basis === 'market-cap') {
    const calculation = event.calculation;
    const price = calculation ? formatValue(calculation.close,state.metric,state.currency,false) : '';
    const shares = calculation ? new Intl.NumberFormat('en').format(calculation.shares) : '';
    return `<p class="treemap-detail-value">${esc(money(figure.value))}</p>
      <p>Recorded public market cap${calculation ? ' estimate' : ''}</p>
      <dl>
        <div><dt>Market cap</dt><dd>${esc(formatValue(figure.value,state.metric,state.currency,false))}</dd></div>
        <div><dt>As of</dt><dd>${esc(event.observed_on)}</dd></div>
        <div><dt>Listing</dt><dd>${esc(event.exchange)} · ${esc(event.ticker)}</dd></div>
        ${calculation ? `<div><dt>Closing price</dt><dd>${esc(price)}</dd></div>
          <div><dt>Shares used</dt><dd>${esc(shares)}<br><small>As of ${esc(calculation.shares_as_of)}</small></dd></div>` : ''}
      </dl>
      ${event.note ? `<p class="treemap-note">${esc(event.note)}</p>` : ''}
      ${figure.newerUnplotted ? `<p class="treemap-note">${newerFigure(state.metric)}.</p>` : ''}
      ${figureSources(evidenceLink(event.source,calculation ? 'Closing price source' : 'Market cap source'),
        evidenceLink(calculation?.close_data,'Dated exchange data'),
        evidenceLink(calculation?.shares_source,'Shares outstanding source'),
        evidenceLink(calculation?.share_terms_source,'Share-class rights'))}`;
  }
  return `<p class="treemap-detail-value">${esc(figureAmount(figure))}</p>
    <p>${isCompanyValue ? 'Private valuation' : basis === 'valuation' ? 'Historical announced valuation' : 'Recorded announcement amount'}</p>
    <dl>
      <div><dt>${isCompanyValue ? 'Valuation' : 'Recorded figure'}</dt><dd>${esc(figureAmount(figure,false))}</dd></div>
      <div><dt>Announced</dt><dd>${esc(event.announced_on)}</dd></div>
      <div><dt>Event</dt><dd>${esc(event.stage || 'Not recorded')}</dd></div>
    </dl>
    ${figure.newerUnplotted ? `<p class="treemap-note">${isCompanyValue ? 'A newer announcement did not supply a sourced valuation.' : 'A newer announcement exists in this profile but is not plotted for this metric and currency.'}</p>` : ''}
    ${event.note ? `<p class="treemap-note">${esc(event.note)}</p>` : ''}
    ${figureSources(evidenceLink(event.source,isCompanyValue ? 'Valuation source' : 'Read the announcement'),
      evidenceLink(event.supporting_source,'Supporting source'))}`;
}

function showDetail() {
  main.querySelectorAll('[data-company]').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.company === state.selected));
  });
  const entity = entities.get(state.selected);
  const sameCompany = detail.dataset.inspected === state.selected;
  const previousTab = sameCompany ? detail.querySelector('ui-tabs')?.value : '';
  detail.dataset.inspected = state.selected;
  if (!entity) {
    detail.innerHTML = state.selected
      ? '<h2>Selected record unavailable</h2><button type="button" class="atlas-button" data-treemap-clear-selection>Clear selection</button>'
      : '<h2>Inspect a company</h2><p>Select a tile to see the company, its figures and sources.</p>';
    syncInspectorPlacement();
    return;
  }
  const isCompany = entity.kind === 'startup';
  const inResults = visibleCompanies.has(state.selected);
  const figure = isCompany ? companyFigure(graph,entity,state.metric,state.currency,marketCaps,companyValues) : null;
  const place = dimensions.get(entity.id);
  const locationLabel = companyPlaceLabel(place);
  const founded = validYear(entity.founded_year) ? `Founded ${entity.founded_year}` : '';
  const scope = inResults ? ''
    : `<div class="treemap-outside" data-selection="outside">
         <p>Outside current results</p>
         ${isCompany ? '<button type="button" class="atlas-button" data-treemap-adjust>Adjust filters</button>' : ''}
       </div>`;
  detail.innerHTML = `
    <div class="treemap-detail-copy">
      <div class="treemap-detail-heading">${mark(entity)}
        <div>
          <h2>${esc(entity.name)}</h2>
          <p class="treemap-detail-kind">${esc(isCompany ? ['Company',place?.technology || place?.sector].filter(Boolean).join(' · ') : kindName(entity.kind))}</p>
        </div>
        <button type="button" class="treemap-clear-selection" data-treemap-clear-selection aria-label="Clear selection">${icon('close')}</button>
      </div>
      ${entity.summary ? `<p class="treemap-detail-description">${esc(entity.summary)}</p>` : ''}
      ${locationLabel || founded ? `<div class="treemap-detail-meta">
        ${locationLabel ? `<span>${icon('location')}${esc(locationLabel)}</span>` : ''}
        ${founded ? `<span>${icon('calendar')}${esc(founded)}</span>` : ''}
      </div>` : ''}
      ${scope}
    ${isCompany ? `
      <ui-tabs default-value="${previousTab || (state.metric === 'companies' ? 'company' : 'figure')}" aria-label="Company inspection">
        <ui-tabs-list class="treemap-detail-view" aria-label="Company inspection">
          <ui-tabs-tab value="figure"><button type="button" id="treemap-figure-tab" data-detail-view="figure">Figure</button></ui-tabs-tab>
          <ui-tabs-tab value="company"><button type="button" id="treemap-company-tab" data-detail-view="company">Overview</button></ui-tabs-tab>
        </ui-tabs-list>
        <ui-tabs-panel as-child value="figure" keep-mounted><section id="treemap-figure-panel">${figurePanel(figure,entity)}</section></ui-tabs-panel>
        <ui-tabs-panel as-child value="company" keep-mounted><section id="treemap-company-panel">
          ${profileContext(entity)}${evidenceLink(entity.source,'Read the profile source')}
        </section></ui-tabs-panel>
      </ui-tabs>`
      : evidenceLink(entity.source,'Read the profile source')}
    </div>
    <div class="treemap-detail-actions" data-company-name="${esc(entity.name)}">
      <a class="treemap-profile atlas-button atlas-button-accent" data-atlas-profile-link href="${esc(entityHref(entity))}">Open profile</a>
      <a class="atlas-button treemap-graph-link" href="${esc(explorationHref('./graph.html?entity=' + encodeURIComponent(entity.id),location.href,state))}">${icon('graph')} Show in graph</a>
      ${isCompany ? `<button type="button" class="atlas-button" data-atlas-compare="${esc(entity.id)}" aria-pressed="false"><span data-atlas-action-label>Compare</span></button>
      <button type="button" class="atlas-button" data-atlas-save-company="${esc(entity.id)}" aria-pressed="false"><span data-atlas-action-label>Save company</span></button>` : ''}
    </div>
    <p class="sr-only" role="status">Inspecting ${esc(entity.name)}.</p>`;
  watchImages(detail);
  syncInspectorPlacement();
  if (!sameCompany) sheetContent.scrollTop = 0;
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
  const {entity, event, basis} = tile;
  const name = aggregate ? tile.name : entity.name;
  const colour = colours.forCompany(aggregate ? tile.children[0].entity : entity);
  const size = tile.width < 40 || tile.height < 40 ? 'micro tiny'
    : tile.width < 112 || tile.height < 80 ? 'tiny' : tile.width < 220 || tile.height < 150 ? 'compact' : '';
  const valueLayout = !basis ? '' : tile.width >= 180 && tile.height >= 22 && tile.height < 64 ? ' treemap-value-row'
    : tile.width >= 70 && tile.width < 132 && tile.height >= 116 ? ' treemap-value-column' : '';
  const meta = aggregate ? `${countLabel(tile.count)} · Explore ↗`
    : event ? datedFigure(event,basis || state.metric)
    : entity.summary || (validYear(entity.founded_year) ? `Founded ${entity.founded_year}` : '');
  const description = aggregate
    ? `Explore ${name}, ${money(tile.value)}`
    : [name, valueBases[basis], figureAmount(tile), event ? meta : '', colour.detail || colour.name].filter(Boolean).join(', ');
  const target = aggregate ? `data-period="${esc(tile.id)}"`
    : `data-company="${esc(tile.id)}" aria-pressed="${state.selected === tile.id}" aria-controls="treemap-detail"`;
  const markOnly = !valueLayout && (tile.width < 70 || tile.height < 70);
  const ticker = aggregate ? '' : tileTicker(tile);
  return `<button type="button" class="treemap-tile ${size}${valueLayout}${markOnly ? ' mark-only' : ''}${state.metric === 'companies' && !aggregate ? ' count-company' : ''}"
    ${target} aria-label="${esc(description)}"${basis ? ` title="${esc(description)}"` : ''} style="${tileBounds(tile)};--tile-color:${colour.fill}">
    <span class="treemap-tile-inner">
      ${aggregate ? '' : '<span class="treemap-tile-selection" aria-hidden="true">Selected</span>'}
      ${figureBadge(basis)}
      <span class="treemap-tile-identity">${aggregate || !state.logos ? '' : mark(entity)}<span class="treemap-tile-copy"><span class="treemap-tile-name">${esc(name)}</span>${meta ? `<span class="treemap-tile-meta">${esc(meta)}</span>` : ''}</span></span>
      ${aggregate || state.metric !== 'companies' ? `<span class="treemap-value">${esc(figureAmount(tile))}</span>` : ''}
      ${ticker ? `<span class="treemap-tile-ticker">${esc(ticker)}</span>` : ''}
    </span>
  </button>`;
}

function focusCopy(previous, root) {
  if (!previous || (previous.isConnected && !previous.closest('[hidden]'))) return;
  if (filterFields.hidden && previous.closest('.exploration-controls')) {
    (smallScreen.matches ? fieldsHost.querySelector('.exploration-country-trigger') || filterToggle : filterToggle).focus({preventScroll:true});
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
  const stacked = state.group === 'city' && !!state.drillCountry && !state.drillCity;
  const groupCount = view.groups.filter(group => group.value > 0).length;
  const headingHeight = 44;
  const extraHeight = stacked && items.length > 1 ? groupCount * headingHeight : 0;
  chart.style.height = items.length > 0
    ? items.length === 1 ? '245px' : stacked ? (Math.max(260, 410 - extraHeight) + extraHeight) + 'px' : ''
    : 'auto';
  const bounds = chart.getBoundingClientRect();
  lastWidth = bounds.width;
  lastHeight = bounds.height;
  const inlineGroups = new Set();
  if (!items.length) chart.innerHTML = emptyResults();
  else if (aggregate || state.group === 'company') {
    chart.innerHTML = treemap(items,bounds.width,bounds.height).map(tile => tileMarkup(tile,aggregate)).join('');
    if (aggregate) for (const group of items) inlineGroups.add(group.id);
  } else {
    chart.innerHTML = groupedTreemap(view.groups,bounds.width,bounds.height,{heading:headingHeight,stacked}).map(group => {
      const hasTitle = group.headingHeight >= 18 && group.width >= 116;
      const compactTitle = group.headingHeight < 36 || group.width < 180;
      const action = groupAction(group);
      const showAction = action && group.headingHeight >= 44 && group.width >= 300;
      if (hasTitle && (!action || showAction)) inlineGroups.add(group.id);
      const tint = state.group === state.colour ? colours.forCompany(group.children[0].entity).fill : 'var(--atlas-soft)';
      return `<div class="treemap-plot-group${stacked ? ' treemap-plot-group-row' : ''}" role="group" aria-label="${esc(group.name)}" style="${tileBounds(group)};--treemap-group-tint:${tint}">
        ${hasTitle ? `<div class="treemap-plot-heading${compactTitle ? ' treemap-plot-heading-compact' : ''}" style="height:${group.headingHeight}px">${groupTitle(group)}${showAction ? groupActionButton(group,action) : ''}</div>` : ''}
        ${group.tiles.map(tile => tileMarkup(tile)).join('')}
      </div>`;
    }).join('');
  }
  renderGroups(view.groups.filter(group => !inlineGroups.has(group.id)));
  $('treemap-tile-disclosure').hidden = true;
  watchImages(chart);
  focusCopy(previous,chart);
}
function cardMedia(entity) {
  const image = state.logos ? logoFor(entity.name) || reviewedCardLogo(entity) : '';
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
    const place = companyPlaceLabel(dimensionsForCompany);
    const value = companyCount ? '' : figureAmount(item);
    const year = !grouped && validYear(item.entity.founded_year) ? `est. ${item.entity.founded_year}` : '';
    const metric = item.basis || state.metric;
    const date = grouped ? 'Explore decade ↗' : item.event ? datedFigure(item.event,metric) : 'View evidence ↗';
    const summary = grouped ? countLabel(item.count) : item.entity.summary || 'Company description not recorded.';
    const label = [name,value,valueBases[item.basis],item.event ? date : grouped ? 'Explore this founding decade' : 'Inspect company',
      item.newerUnplotted ? newerFigure(metric) : ''].filter(Boolean).join(', ');
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
        ${figureBadge(item.basis)}
        <span class="treemap-card-footer"><span class="treemap-card-date">${esc(date)}</span>${year ? `<span class="treemap-card-year">${esc(year)}</span>` : ''}</span>
        ${!grouped && state.colour !== 'decade' ? colourMark(item.entity) : ''}
        ${item.newerUnplotted ? `<span class="treemap-card-note">${newerFigure(metric)}</span>` : ''}
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
      ${figureBadge(row.basis)}
      <small>${row.event ? esc(datedFigure(row.event,row.basis || state.metric)) : state.group !== 'company' ? esc(row.groupName) : ''}</small>
      ${state.colour !== 'decade' ? colourMark(row.entity) : ''}
      <a data-atlas-profile-link href="${esc(entityHref(row.entity))}">Full profile ↗</a>
    </div><div class="treemap-list-value"><strong>${esc(figureAmount(row))}</strong>
      ${row.event ? evidenceLink(row.event.source,(row.basis || state.metric) === 'market-cap'
        ? row.event.calculation ? 'Closing price source' : 'Market cap source' : row.basis ? 'Valuation source' : 'Announcement') : ''}
    </div></li>`).join('')}</ol>` : emptyResults();
  watchImages(list);
}

function groupAction(group) {
  if (state.group === 'decade') return state.period === 'all' ? 'Explore decade' : '';
  if ((state.group === 'country' || state.group === 'city') && group.country===multipleHeadquarters) {
    return state.drillCountry===multipleHeadquarters ? '' : 'Explore group';
  }
  if (state.group === 'country') return group.country !== state.drillCountry ? 'Explore country' : '';
  if (state.group === 'city') {
    if (group.country === 'unknown') return state.drillCountry !== 'unknown' ? 'Explore unrecorded locations' : '';
    return group.country !== state.drillCountry || group.city !== state.drillCity ? 'Explore city' : '';
  }
  if (state.group === 'sector' || state.group === 'stage') return group.id !== state[state.group] ? 'Filter by ' + state.group : '';
  return '';
}

function groupTitle(group) {
  const name = state.group === 'city' && group.city && state.drillCountry && group.country === state.drillCountry
    ? group.city === 'unknown' ? 'City not recorded' : group.city : group.name;
  const figure = state.metric === 'companies' ? countLabel(group.count) : group.children.length
    ? `${money(group.value)} · ${countLabel(group.children.length)} plotted` : 'No comparable figures';
  return `<span class="treemap-group-title"><strong>${esc(name)}</strong><small>${esc(figure)}</small></span>`;
}
function groupActionButton(group, action) {
  const target = state.group === 'decade' ? `data-period="${esc(group.id)}"` : `data-treemap-group="${esc(group.id)}"`;
  return `<button class="treemap-group-action" type="button" ${target} aria-label="${esc(action + ' · ' + group.name)}">${esc(action)} ${icon('external')}</button>`;
}
function renderGroups(groups = view.groups) {
  const host = $('treemap-groups');
  const rows = state.group === 'company' ? '' : groups.map(group => {
    const action = groupAction(group);
    if (!group.children.length && !action) return '';
    return `<li>${groupTitle(group)}${action ? groupActionButton(group,action) : ''}</li>`;
  }).join('');
  host.hidden = !rows;
  host.innerHTML = rows ? `<ul aria-label="Company groups">${rows}</ul>` : '';
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
  const context = isMap ? 'Neutral tiles' : state.presentation === 'cards'
    ? 'Card sizes follow the editorial layout.' : state.metric === 'companies'
      ? 'Companies in alphabetical order' : 'Rows ordered by recorded value';
  const plotted = new Set(view.rows.map(row => colours.forCompany(row.entity).id));
  const entries = colours.entries.filter(entry => state.colour === 'freshness' && entry.id !== 'unknown' || plotted.has(entry.id));
  const showColour = entries.length && (isMap || state.colour !== 'decade');
  const basisKey = state.metric === COMPANY_VALUE && view.rows.length ? `<div class="treemap-figure-key">
    ${Object.keys(valueBases).map(basis => {
      const count = view.rows.filter(row => row.basis === basis).length;
      return `<span>${figureBadge(basis)} <span>${count}</span></span>`;
    }).join('')}
  </div>` : '';
  legend.innerHTML = `${showColour ? `
    <div class="treemap-legend-scale" data-colour="${state.colour}">
      <strong>${esc(colours.label)}</strong>
      ${colours.asOf ? `<small>As of ${esc(colours.asOf)}</small>` : ''}
      <ul>${entries.map(entry => `<li class="treemap-legend-item"><i aria-hidden="true" style="--tile-color:${entry.fill}"></i>${esc(entry.name)}</li>`).join('')}</ul>
    </div>` : `<span>${esc(context)}</span>`}${basisKey}`;
}
function renderNoValueBand() {
  const band = $('treemap-novalue');
  const show = state.presentation === 'map' && state.metric !== 'companies' && view.missing.length > 0;
  band.hidden = !show;
  if (!show) { $('treemap-novalue-tiles').replaceChildren(); return; }
  $('treemap-novalue-tiles').innerHTML = view.missing.map(entity => `<button type="button" class="treemap-novalue-tile" data-company="${esc(entity.id)}" aria-controls="treemap-detail" aria-pressed="${state.selected === entity.id}">
    ${state.logos ? mark(entity) : ''}<span class="treemap-novalue-name">${esc(entity.name)}</span>
    <span class="treemap-novalue-reason">${esc(missingFigureLabel(view.missingFigures.get(entity.id)))}</span></button>`).join('');
  watchImages(band);
}

function renderMissing() {
  $('treemap-missing').hidden = !view.missing.length;
  const measure = {valuation:'Valuation', funding:'Funding amount', 'market-cap':'Market cap', [COMPANY_VALUE]:'Company value'}[state.metric];
  $('treemap-missing-label').textContent = `${measure} unavailable for ${countLabel(view.missing.length)} in ${state.currency}`;
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
  view = makeView(graph,{...state, query:'', dimensions, companies:scoped, marketCaps, companyValues});
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
  const latest = state.metric === COMPANY_VALUE ? `Market caps and private valuations · ${state.currency}`
    : state.metric === 'market-cap' ? `Recorded ${state.currency} market cap for listed companies.`
    : `Latest dated ${state.currency} ${state.metric === 'valuation' ? 'valuation' : 'event amount'} per company.`;
  $('treemap-subtitle').textContent = isCards ? '' : state.metric !== 'companies' ? latest : isMap
    ? 'Area · One unit per company' : 'Companies in alphabetical order.';
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
  const valueUnavailable = state.metric === COMPANY_VALUE && !ownership.size;
  const statusMessage = state.metric === 'companies' ? 'Company count includes records without financial data.'
    : valueUnavailable ? 'Company value evidence is unavailable.'
    : state.metric === COMPANY_VALUE ? 'Figures can have different observation dates.'
    : state.metric === 'market-cap' ? 'Dated public-market observations in the selected currency.'
    : 'Historical figures from the selected currency.';
  status.textContent = [
    graphStore.mode === 'fallback' ? 'Showing the published JSON backup.' : '',
    evidenceAvailable ? '' : 'Technology and public market-cap evidence is unavailable.',
    statusMessage,
  ].filter(Boolean).join(' ');
  status.classList.toggle('sr-only', graphStore.mode !== 'fallback' && evidenceAvailable && !valueUnavailable);
  showPresentation(state.presentation);
  exploration.update(state,searchMatches,hasPeriod ? entity => cohort(entity) === state.period : undefined);
  if (!isMap) renderGroups();
  renderSiblings();
  renderLegend();
  if (isCards) {
    $('treemap-list').replaceChildren();
    drawCards();
  } else {
    drawRankedList();
  }
  renderMissing();
  renderNoValueBand();
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
  change({drillCountry:code, drillCity:'', group:state.group === 'country' && code !== 'unknown' && code !== multipleHeadquarters ? 'city' : state.group});
}
function activateGroup(id) {
  const group = view.groups.find(item => item.id === id);
  if (!group) return;
  if (state.group === 'country') enterCountry(group.country);
  else if (state.group === 'city') change({drillCountry:group.country, drillCity:group.country === 'unknown' ? '' : group.city});
  else if (state.group === 'sector' || state.group === 'stage') change({[state.group]:group.id});
}
function adjustFilters() {
  if (inspectorSheet.open) {
    sheetSuspended = true;
    syncInspectorPlacement();
    queueMicrotask(() => state.query ? $('treemap-query').focus() : exploration.openCountries());
    return;
  }
  if (filterFields.hidden) {
    filterToggle.setAttribute('aria-expanded','true');
    showPresentation(state.presentation);
  }
  if (state.query) $('treemap-query').focus();
  else if (!smallScreen.matches && (state.sector || state.stage)) {
    const key = state.sector ? 'sector' : 'stage';
    ($(`atlas-${key}-trigger`) || $(`atlas-${key}`)).focus();
  } else if (hasCompanyScope(state)) exploration.openCountries();
  else $('treemap-query').focus();
}
function syncInspectorPlacement() {
  const useSheet = Boolean(state?.selected && sheetViewport.matches && inspectorSheet.api);
  const open = useSheet && !sheetSuspended;
  if (!open && inspectorSheet.open) inspectorSheet.open = false;
  const seat = useSheet ? sheetContent : detailSeat;
  if (detail.parentElement !== seat) seat.append(detail);
  detailSeat.hidden = useSheet;
  $('treemap-inspector-reopen').hidden = !useSheet || open;
  if (open && !inspectorSheet.open) inspectorSheet.open = true;
}
function inspect(id, fromKeyboard) {
  if (!entities.has(id)) return;
  state.selected = id;
  sheetSuspended = false;
  showDetail();
  writeState();
  if (inspectorSheet.open) return;
  const bounds = detail.getBoundingClientRect();
  const needsScroll = bounds.top < 0 || bounds.top > innerHeight - 120;
  if (fromKeyboard || needsScroll) detail.focus({preventScroll:true});
  if (needsScroll) {
    detail.scrollIntoView({block:'start', behavior:reducedMotion.matches ? 'instant' : 'smooth'});
  }
}
function clearSelection() {
  const selected = state.selected;
  state.selected = '';
  sheetSuspended = false;
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
  if (id === 'treemap-metric' && METRICS.includes(value)) change({
    metric:value, currency:validCurrency(value,state.currency), ...(value === COMPANY_VALUE ? {group:'technology'} : {}),
  });
  else if (id === 'treemap-currency' && availableCurrencies(state.metric).includes(value)) change({currency:value});
  else if (id === 'treemap-group' && GROUPS.includes(value)) change({group:value});
  else if (id === 'treemap-colour' && COLOURS.includes(value)) change({colour:value});
  else if (id === 'atlas-density' && ['comfortable','compact'].includes(value)) change({density:value});
  else if (id === 'treemap-logos') change({logos:checked});
});
$('treemap-query').addEventListener('input', event => { if (!event.isComposing) change({query:event.target.value},true); });
$('treemap-query').addEventListener('compositionend', event => change({query:event.target.value},true));
$('treemap-reset').addEventListener('click', () => {
  if (!state) return;
  document.dispatchEvent(new Event('atlas:reset-exploration'));
  change({...defaults, ...readExploration(new URLSearchParams())});
});
$('treemap-inspector-reopen').addEventListener('click', () => {
  sheetSuspended = false;
  syncInspectorPlacement();
});
for (const presentation of presentations) {
  $('show-' + presentation).addEventListener('click', () => {
    if (!$('treemap-presentation').api) change({presentation});
  });
}
$('treemap-presentation').addEventListener('valuechange', event => {
  if (presentations.includes(event.detail.value)) change({presentation:event.detail.value});
});
$('treemap-density').addEventListener('valuechange', event => {
  const density = $('atlas-density');
  density.value = event.detail.value;
  density.dispatchEvent(new Event('change',{bubbles:true}));
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
  else if (action.company) inspect(action.company,event.detail === 0 && button === document.activeElement);
  else if ('treemapClearSelection' in action) clearSelection();
  else if ('treemapAdjust' in action) adjustFilters();
  else if ('treemapCount' in action) change({metric:'companies'});
  else if (action.treemapPresentation) {
    change({presentation:action.treemapPresentation});
    $('treemap-list').querySelector('button')?.focus();
  }
});
detail.addEventListener('keydown', event => {
  if (event.key === 'Escape' && state?.selected && !event.defaultPrevented && !inspectorSheet.open) {
    event.preventDefault();
    clearSelection();
  }
});
inspectorSheet.addEventListener('openchange',event => {
  if (!event.detail.value && state?.selected && sheetViewport.matches && !sheetSuspended) {
    queueMicrotask(() => { if (!inspectorSheet.open && state.selected && sheetViewport.matches && !sheetSuspended) clearSelection(); });
  }
});
inspectorSheet.addEventListener('openchangecomplete',event => {
  if (event.detail.value && inspectorSheet.open && !detail.contains(document.activeElement)) detail.focus({preventScroll:true});
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
sheetViewport.addEventListener('change', () => { if (state) syncInspectorPlacement(); });
customElements.whenDefined('ui-dialog').then(() => { if (state) syncInspectorPlacement(); });
window.addEventListener('popstate', () => {
  if (!graph) return;
  const next = readState();
  if (next.selected !== state.selected) sheetSuspended = false;
  state = next;
  syncControls();
  render();
  writeState(true);
});
document.addEventListener('atlas:export-records',event => {
  if (!view) return;
  event.detail.records = [...view.rows.map(row => row.entity), ...view.missing]
    .map(({id,name,kind,source}) => ({id,name,kind,source}));
});

try {
  graphStore = await openGraph();
  graph = graphStore.graph;
  entities = new Map(graph.entities.map(entity => [entity.id,entity]));
  companies = graph.entities.filter(entity => entity.kind === 'startup');
  const researched = await loadTreemapEvidence(graphStore);
  ({technology,ownership,marketCaps,privateValuations,available:evidenceAvailable} = researched);
  companyValues = indexCompanyValues(graph,researched);
  dimensions = indexCompanies(graph,technology);
  periods = new Set(cohortNames(graph));
  $('treemap-presentation').removeAttribute('disabled');
  $('treemap-density').removeAttribute('disabled');
  controls.querySelectorAll('input, select, button').forEach(control => { control.disabled = false; });
  const marketOption = $('treemap-metric').querySelector('option[value="market-cap"]');
  marketOption.disabled = !marketCaps.length;
  if (marketCaps.length) marketOption.textContent = 'Market cap';
  $('treemap-metric').querySelector(`option[value="${COMPANY_VALUE}"]`).disabled = !availableCurrencies(COMPANY_VALUE).length;
  exploration = mountExploration($('treemap-exploration'),{
    companies,dimensions,fieldsHost,showDensity:false,onChange:next => {
      if ('drillCountry' in next && next.drillCountry && state.group === 'country') enterCountry(next.drillCountry);
      else change(next);
    },
  });
  state = readState();
  syncControls();
  render();
  writeState(true);
  new ResizeObserver(([entry]) => {
    const {width,height} = entry.contentRect;
    if (width !== lastWidth || height !== lastHeight) draw();
  }).observe(chart);
} catch {
  $('treemap-status').textContent = 'The company snapshot could not be loaded. Reload this page to try again.';
  showPresentation(presentationFrom(new URLSearchParams(location.search)));
  const unavailable = '<p>The treemap is temporarily unavailable. <a href="">Reload this view</a> or <a href="./list.html">return to the list</a>.</p>';
  for (const panel of [chart, $('treemap-cards'), $('treemap-list')]) panel.innerHTML = unavailable;
  detail.innerHTML = '<p>Company evidence will appear when the snapshot is available.</p>';
  $('treemap-presentation').setAttribute('disabled', '');
  $('treemap-density').setAttribute('disabled', '');
  controls.querySelectorAll('input, select, button').forEach(control => {control.disabled = true;});
  main.querySelector('[data-treemap-presentation="list"]').hidden = true;
}
controls.setAttribute('aria-busy','false');
workspace.setAttribute('aria-busy','false');
