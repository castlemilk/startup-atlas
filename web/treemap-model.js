import { countryName } from './atlas-exploration.js';

export const COMPANY_VALUE = 'company-value';
export const METRICS = ['valuation', 'funding', 'market-cap', 'companies', COMPANY_VALUE];
export const GROUPS = ['technology', 'sector', 'country', 'city', 'stage', 'company', 'decade'];
export const COLOURS = ['technology', 'sector', 'country', 'freshness', 'none', 'decade'];
export const validYear = value => Number.isInteger(value) && value >= 1800 && value <= new Date().getUTCFullYear();
export const cohort = entity => validYear(entity.founded_year) ? `${Math.floor(entity.founded_year / 10) * 10}s` : 'Not recorded';
export const cohortNames = graph => [...new Set(graph.entities.filter(entity => entity.kind === 'startup').map(cohort))].sort();
const positive = value => typeof value === 'number' && Number.isFinite(value) && value > 0;
const dated = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value;
};
const source = value => { try { return new URL(value).protocol === 'https:'; } catch { return false; } };
const normalize = value => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const marketCap = 'market-cap';
const validCurrency = value => typeof value === 'string' && /^[A-Z]{3}$/.test(value);
const amountOf = (record, metric) => metric === 'valuation' ? record.valuation : record.amount;
const currencyOf = (record, metric) => metric === 'valuation' ? record.valuation_currency : record.currency;
const dateOf = (record, metric) => metric === marketCap ? record.observed_on : record.announced_on;
const sourcedAmount = (record, metric) => source(record.source) && dated(dateOf(record, metric)) && validCurrency(currencyOf(record, metric));
const observations = (graph, metric, marketCaps) => metric === marketCap ? marketCaps : graph.funding_rounds || [];

export async function loadTreemapEvidence(store) {
  let document;
  try { document = await store.document('treemap-evidence.json'); }
  catch { /* Older snapshots can still show the other measures. */ }
  return {...indexTreemapEvidence(store.graph,document), available:document?.version===1};
}

export function indexTreemapEvidence(graph, document) {
  const technology = new Map(), marketCaps = [], ownership = new Map(), privateValuations = [];
  const evidence = {technology, marketCaps, ownership, privateValuations};
  if (document?.version !== 1) return evidence;
  const ids = new Set(graph.entities.filter(entity => entity.kind === 'startup').map(entity => entity.id));
  for (const [id, fact] of Object.entries(document.technology ?? {})) {
    if (ids.has(id) && typeof fact?.type === 'string' && fact.type.trim() &&
        typeof fact.detail === 'string' && fact.detail.trim() && source(fact.source)) {
      technology.set(id, fact);
    }
  }
  const seen = new Set();
  for (const record of Array.isArray(document.market_caps) ? document.market_caps : []) {
    if (!ids.has(record?.startup_id) || !comparableEvent(record, marketCap) ||
        typeof record.ticker !== 'string' || !record.ticker.trim() ||
        typeof record.exchange !== 'string' || !record.exchange.trim()) continue;
    const inputs = record.calculation;
    if (inputs !== undefined && (!positive(inputs?.close) || !Number.isSafeInteger(inputs.shares) || inputs.shares <= 0 ||
        !dated(inputs.shares_as_of) || inputs.shares_as_of > record.observed_on || !source(inputs.shares_source) ||
        (inputs.close_data !== undefined && !source(inputs.close_data)) ||
        (inputs.share_terms_source !== undefined && !source(inputs.share_terms_source)) ||
        Math.abs(record.amount - inputs.close * inputs.shares) > .01)) continue;
    const key = JSON.stringify([record.startup_id, record.currency, record.observed_on]);
    if (seen.has(key)) continue;
    seen.add(key);
    marketCaps.push(record);
  }
  for (const [id, fact] of Object.entries(document.ownership ?? {})) {
    if (ids.has(id) && ['public','private','subsidiary'].includes(fact?.status) && dated(fact.observed_on) &&
        source(fact.source) && typeof fact.detail === 'string' && fact.detail.trim()) ownership.set(id, fact);
  }
  const valuationIds = new Set();
  for (const record of Array.isArray(document.private_valuations) ? document.private_valuations : []) {
    if (!ids.has(record?.startup_id) || !comparableEvent(record, 'valuation') ||
        typeof record.id !== 'string' || !record.id.trim() || valuationIds.has(record.id) ||
        typeof record.stage !== 'string' || !record.stage.trim() ||
        (record.supporting_source !== undefined && !source(record.supporting_source)) ||
        (record.approximate !== undefined && typeof record.approximate !== 'boolean')) continue;
    valuationIds.add(record.id);
    privateValuations.push(record);
  }
  return evidence;
}

export function comparableEvent(round, metric) {
  return sourcedAmount(round, metric) && positive(amountOf(round, metric));
}
export function currencies(graph, metric, marketCaps = [], companyValues = new Map()) {
  if (metric === 'companies') return [];
  if (metric === COMPANY_VALUE) return [...new Set([...companyValues.values()].flatMap(figure => figure.currency || []))].sort();
  return [...new Set(observations(graph, metric, marketCaps)
    .filter(round => sourcedAmount(round, metric) && (positive(amountOf(round, metric)) || amountOf(round, metric) === 0))
    .map(round => currencyOf(round, metric)))].sort();
}

export function matchingCompanies(entities, query) {
  const terms = normalize(query).trim().split(/\s+/).filter(Boolean);
  return entities.filter(entity => entity.kind === 'startup' &&
    terms.every(term => normalize(`${entity.name} ${entity.summary || ''}`).includes(term)));
}

function groupFor(entity, grouping, {country = '', city = '', sector = '', stage = '', technology = ''} = {}) {
  switch (grouping) {
    case 'technology': return {id:technology || 'unknown', name:technology || 'Technology type not recorded'};
    case 'sector': return {id:sector || 'unknown', name:sector || 'Sector not recorded'};
    case 'country': return {id:country || 'unknown', name:countryName(country), country:country || 'unknown'};
    case 'city': return {
      id:JSON.stringify([country || 'unknown', city || 'unknown']),
      name:country ? `${city || 'City not recorded'}, ${countryName(country)}` : 'City not recorded',
      country:country || 'unknown', city:city || 'unknown',
    };
    case 'stage': return {id:stage || 'unknown', name:stage || 'Stage not recorded'};
    case 'company': return {id:'all', name:'All companies'};
    default: return {id:cohort(entity), name:cohort(entity)};
  }
}

function observation(events, metric, currency) {
  const sourced = events.filter(record => source(record.source)).sort((a,b) =>
    String(dateOf(b, metric) || '').localeCompare(String(dateOf(a, metric) || '')) ||
    String(a.id ?? a.ticker).localeCompare(String(b.id ?? b.ticker)));
  const eligible = sourced.filter(record => sourcedAmount(record, metric) && (!currency || currencyOf(record, metric) === currency));
  const event = eligible.find(record => positive(amountOf(record, metric)));
  if (event) return {event, value:amountOf(event, metric), newerUnplotted:sourced.some(record => dateOf(record, metric) > dateOf(event, metric))};
  if (metric === marketCap) return {reason:sourced.length ? 'not-comparable' : 'unknown'};
  const zero = eligible.find(round => amountOf(round, metric) === 0);
  if (zero) return {reason:'recorded-zero', event:zero, value:0};
  const undisclosed = sourced.find(round => {
    const text = metric === 'valuation' ? round.valuation_text : round.amount_text;
    return amountOf(round, metric) == null && typeof text === 'string' && /^(?:(?:round )?amount |valuation )?(?:undisclosed|not disclosed)\.?$/i.test(text.trim());
  });
  if (undisclosed) return {reason:'undisclosed', event:undisclosed};
  return {reason:sourced.length ? 'not-comparable' : 'unknown'};
}

function observationsByCompany(records) {
  const events = new Map();
  for (const record of records) {
    if (!events.has(record.startup_id)) events.set(record.startup_id, []);
    events.get(record.startup_id).push(record);
  }
  return events;
}

export function indexFundingFigures(graph) {
  const figures = new Map();
  for (const [id, events] of observationsByCompany(graph.funding_rounds || [])) {
    const figure = observation(events, 'funding');
    if (!figure.reason || figure.reason === 'recorded-zero') {
      figures.set(id, {...figure, basis:'funding', currency:figure.event.currency});
    }
  }
  return figures;
}

export function indexCompanyValues(graph, {ownership, marketCaps, privateValuations}) {
  const quotes = observationsByCompany(marketCaps);
  const valuations = observationsByCompany([...(graph.funding_rounds || []), ...privateValuations]);
  return new Map([...ownership].map(([id, fact]) => {
    if (fact.status === 'subsidiary') return [id, {reason:'not-standalone'}];
    const basis = fact.status === 'public' ? marketCap : 'valuation';
    const events = basis === marketCap ? quotes : valuations;
    const figure = observation(events.get(id) || [], basis);
    return [id, figure.reason ? {basis, reason:'value-not-recorded'}
      : {...figure, basis, currency:currencyOf(figure.event,basis)}];
  }));
}

function companyValueFigure(companyValues, id, currency) {
  const figure = companyValues.get(id);
  if (!figure) return {reason:'ownership-not-recorded'};
  if (figure.reason || figure.currency === currency) return figure;
  return {basis:figure.basis, currency:figure.currency, event:figure.event, reason:'different-currency'};
}

export function companyFigure(graph, entity, metric, currency, marketCaps = [], companyValues = new Map()) {
  if (metric === 'companies') return {value:1};
  if (metric === COMPANY_VALUE) return companyValueFigure(companyValues,entity.id,currency);
  return observation(observations(graph, metric, marketCaps).filter(record => record.startup_id === entity.id), metric, currency);
}

export function makeView(graph, {metric = 'valuation', currency = 'USD', query = '', period = 'all', group:grouping = 'decade', dimensions, companies = graph.entities, marketCaps = [], companyValues = new Map()} = {}) {
  const population = matchingCompanies(companies, query).filter(entity => period === 'all' || cohort(entity) === period);
  const rows = [], missing = [], missingFigures = new Map(), groups = new Map();
  const events = observationsByCompany(metric === 'companies' || metric === COMPANY_VALUE ? [] : observations(graph,metric,marketCaps));
  for (const entity of population) {
    const key = groupFor(entity, grouping, dimensions?.get(entity.id));
    if (!groups.has(key.id)) groups.set(key.id, {...key, count:0, value:0, children:[]});
    const group = groups.get(key.id);
    group.count++;
    const figure = metric === 'companies' ? {value:1}
      : metric === COMPANY_VALUE ? companyValueFigure(companyValues,entity.id,currency)
      : observation(events.get(entity.id) || [], metric, currency);
    if (figure.reason) {
      missing.push(entity);
      missingFigures.set(entity.id, figure);
      continue;
    }
    const row = {id:entity.id, entity, group:key.id, groupName:key.name, ...figure};
    group.children.push(row);
    group.value += row.value;
    rows.push(row);
  }
  rows.sort((a,b) => b.value - a.value || a.entity.name.localeCompare(b.entity.name) || a.id.localeCompare(b.id));
  return {
    rows, missing, missingFigures,
    groups:[...groups.values()].sort((a,b) => b.value - a.value || a.name.localeCompare(b.name)),
    filteredCount:population.length,
    total:rows.reduce((sum,row) => sum + row.value, 0),
  };
}

export function formatValue(value, metric, currency, compact = true) {
  if (metric === 'companies') return `${value} ${value === 1 ? 'company' : 'companies'}`;
  const number = new Intl.NumberFormat('en', {notation: compact ? 'compact' : 'standard', maximumFractionDigits: compact ? 2 : 20}).format(value);
  return `${currency} ${number}`;
}
// Squarified area layout. Padding lives inside each rectangle so weights retain
// their proportions, including very small values. The list is an equivalent UI.
export function treemap(items, width, height) {
  if (!(width > 0 && height > 0)) return [];
  const sorted = items.filter(item => positive(item.value)).slice().sort((a, b) => b.value - a.value || String(a.id).localeCompare(String(b.id)));
  if (!sorted.length) return [];
  const total = sorted.reduce((sum, item) => sum + item.value, 0);
  const remaining = sorted.map(item => ({...item, area: item.value / total * width * height}));
  const output = []; let x = 0, y = 0, w = width, h = height, row = [];
  const worst = (entries, side) => {
    if (!entries.length || !side) return Infinity;
    const sum = entries.reduce((s, item) => s + item.area, 0), min = Math.min(...entries.map(item => item.area)), max = Math.max(...entries.map(item => item.area));
    return Math.max(side * side * max / (sum * sum), sum * sum / (side * side * min));
  };
  function place(entries) {
    const area = entries.reduce((s, item) => s + item.area, 0);
    if (w >= h) {
      const rw = Math.min(w, area / h); let ry = y;
      for (const item of entries) { const rh = item.area / rw; output.push({...item, x, y: ry, width: rw, height: rh}); ry += rh; }
      x += rw; w = Math.max(0, w - rw);
    } else {
      const rh = Math.min(h, area / w); let rx = x;
      for (const item of entries) { const rw = item.area / rh; output.push({...item, x: rx, y, width: rw, height: rh}); rx += rw; }
      y += rh; h = Math.max(0, h - rh);
    }
  }
  while (remaining.length) {
    const next = remaining[0], side = Math.min(w, h);
    if (!row.length || worst([...row, next], side) <= worst(row, side)) row.push(remaining.shift());
    else { place(row); row = []; }
  }
  if (row.length) place(row);
  return output;
}

export function groupedTreemap(groups, width, height, {heading=0,stacked=false} = {}) {
  const eligible = groups.filter(group => positive(group.value));
  if (!eligible.length || !(width > 0 && height > 0)) return [];
  const stack = stacked && heading * eligible.length < height;
  let regions;
  if (stack) {
    const available = height - heading * eligible.length;
    const total = eligible.reduce((sum,group) => sum + group.value,0);
    let y = 0;
    regions = eligible.map(group => {
      const region = {...group, x:0, y, width, height:heading + group.value / total * available};
      y += region.height;
      return region;
    });
  } else {
    regions = treemap(eligible,width,height);
  }
  // Reserve the same area fraction in every mosaic group so company weights stay proportional.
  const fraction = stack ? 0 : Math.min(.15, heading / Math.max(...regions.map(group => group.height)));
  return regions.map(group => {
    const headingHeight = stack ? heading : group.height * fraction;
    const tiles = treemap(group.children,group.width,group.height - headingHeight)
      .map(tile => ({...tile, y:tile.y + headingHeight}));
    return {...group,headingHeight,tiles};
  });
}

const neutral = 'var(--atlas-soft)';
const categoricalFill = index => index < 6 ? `var(--atlas-map-${index + 1})` : `hsl(${Math.round(index * 137.508) % 360} 38% 83%)`;
const freshnessBands = [
  {id:'0', name:'0–30 days', limit:30, weight:10},
  {id:'1', name:'31–90 days', limit:90, weight:20},
  {id:'2', name:'91–180 days', limit:180, weight:31},
  {id:'3', name:'181+ days', limit:Infinity, weight:42},
].map(band => ({...band, fill:`color-mix(in srgb, var(--atlas-ink) ${band.weight}%, var(--atlas-surface))`}));

export function colourEncoding(mode, companies, dimensions, asOf = new Date().toISOString().slice(0,10)) {
  if (mode === 'none') return {label:'Neutral tiles', entries:[], forCompany:() => ({fill:neutral})};
  if (mode === 'freshness') {
    const missing = {id:'unknown', name:'Review date not recorded', fill:neutral};
    return {
      label:'Days since last recorded fact review', asOf, entries:[...freshnessBands,missing],
      forCompany(entity) {
        const date = dimensions.get(entity.id)?.newestFactReview;
        if (!dated(date) || date > asOf) return missing;
        const days = (Date.parse(asOf) - Date.parse(date)) / 86400000;
        return {...freshnessBands.find(band => days <= band.limit), detail:`Last recorded fact review ${date} (${days} ${days === 1 ? 'day' : 'days'} ago)`};
      },
    };
  }
  const key = entity => groupFor(entity, mode, dimensions.get(entity.id));
  const groups = [...new Map(companies.map(company => {
    const group = key(company);
    return [group.id,group];
  })).values()].sort((a,b) => a.name.localeCompare(b.name));
  let index = 0;
  const entries = groups.map(group => ({...group, fill:group.id === 'unknown' || group.id === 'Not recorded' ? neutral : categoricalFill(index++)}));
  const byId = new Map(entries.map(entry => [entry.id,entry]));
  return {
    label:{technology:'Technology type', sector:'Primary sector', country:'Headquarters country', decade:'Founding decade'}[mode],
    entries,
    forCompany:entity => byId.get(key(entity).id),
  };
}

// Context is evidence-backed metadata, never a substitute for sizing observations.
export function companyContext(graph, entity, currency='USD', marketCaps = []) {
  const socials = value => Array.isArray(value) ? value.filter(link => link.label && source(link.url) && source(link.source)) : [];
  const seen = new Set();
  const founders = (graph.edges || []).filter(edge => edge.kind === 'founded' && edge.to === entity.id && source(edge.source)).flatMap(edge => {
    const person = graph.entities.find(item => item.id === edge.from && item.kind === 'person');
    if (!person || seen.has(person.id)) return [];
    seen.add(person.id);
    return [{person:{...person,logo:source(person.logo_source) && source(person.logo) ? person.logo : ''},source:edge.source,socials:socials(person.socials)}];
  });
  return {
    facts:Array.isArray(entity.profile_facts) ? entity.profile_facts.filter(fact => fact.label && fact.value && source(fact.source)) : [],
    socials:socials(entity.socials), founders,
    rounds:(graph.funding_rounds || []).filter(round => round.startup_id === entity.id && source(round.source))
      .sort((a,b) => String(b.announced_on || '').localeCompare(String(a.announced_on || ''))),
    figures:['funding','valuation',marketCap].map(metric => {
      const figure = companyFigure(graph,entity,metric,currency,marketCaps);
      return {metric, row:figure.reason ? null : figure, reason:figure.reason, event:figure.event};
    }),
  };
}
