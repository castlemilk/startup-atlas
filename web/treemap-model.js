// A read-only view of the published graph. Never infer money from free text,
// convert currencies, sum overlapping rounds, or turn missing values into zero.
export const METRICS = ['valuation', 'funding', 'companies'];
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

export function comparableEvent(round, metric) {
  if (!source(round.source) || !dated(round.announced_on)) return false;
  return metric === 'valuation'
    ? positive(round.valuation) && /^[A-Z]{3}$/.test(round.valuation_currency || '')
    : positive(round.amount) && /^[A-Z]{3}$/.test(round.currency || '');
}
export function currencies(graph, metric) {
  if (metric === 'companies') return [];
  return [...new Set(graph.funding_rounds.filter(round => comparableEvent(round, metric)).map(round => metric === 'valuation' ? round.valuation_currency : round.currency))].sort();
}
export function makeView(graph, {metric = 'valuation', currency = 'USD', query = '', period = 'all'} = {}) {
  const terms = normalize(query).trim().split(/\s+/).filter(Boolean);
  const companies = graph.entities.filter(entity => entity.kind === 'startup' &&
    (period === 'all' || cohort(entity) === period) &&
    terms.every(term => normalize([entity.name, entity.summary].join(' ')).includes(term)));
  const rows = [], missing = [];
  for (const entity of companies) {
    if (metric === 'companies') { rows.push({id: entity.id, entity, value: 1, group: cohort(entity)}); continue; }
    const events = graph.funding_rounds.filter(round => round.startup_id === entity.id);
    const eligible = events.filter(round => comparableEvent(round, metric) && (metric === 'valuation' ? round.valuation_currency : round.currency) === currency)
      .sort((a, b) => b.announced_on.localeCompare(a.announced_on) || a.id.localeCompare(b.id));
    if (!eligible.length) { missing.push(entity); continue; }
    const event = eligible[0];
    rows.push({id: entity.id, entity, event, value: metric === 'valuation' ? event.valuation : event.amount, group: cohort(entity),
      newerUnplotted: events.some(round => round.announced_on > event.announced_on && round !== event)});
  }
  rows.sort((a, b) => b.value - a.value || a.entity.name.localeCompare(b.entity.name));
  const groups = [...new Set(rows.map(row => row.group))].map(name => {
    const children = rows.filter(row => row.group === name);
    return {id: name, name, count: children.length, value: children.reduce((sum, row) => sum + row.value, 0), children};
  }).sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
  return {rows, groups, missing, filteredCount: companies.length, total: rows.reduce((sum, row) => sum + row.value, 0)};
}
export function formatValue(value, metric, currency, compact = true) {
  if (metric === 'companies') return `${value} ${value === 1 ? 'company' : 'companies'}`;
  const number = new Intl.NumberFormat('en', {notation: compact ? 'compact' : 'standard', maximumFractionDigits: compact ? 2 : 0}).format(value);
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

// Context is evidence-backed metadata, never a substitute for sizing observations.
export function companyContext(graph, entity, currency='USD') {
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
    figures:['funding','valuation'].map(metric => ({metric,row:makeView(graph,{metric,currency}).rows.find(row => row.id === entity.id) || null})),
  };
}
