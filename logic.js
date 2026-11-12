import Fuse from './vendor/fuse.mjs';
export const marketNames = { AU: 'Australia', NZ: 'New Zealand', US: 'United States', GB: 'United Kingdom', CA: 'Canada', IN: 'India', SG: 'Singapore', JP: 'Japan', KR: 'South Korea', BR: 'Brazil', ZA: 'South Africa', FR: 'France' };
export const escapeHtml = (value) => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export function sourceUrl(value) {
  try { const url = new URL(value); return url.protocol === 'https:' ? url.href : null; } catch { return null; }
}
export function marketLabel(scope) {
  if (scope.includes('WORLD')) return 'Worldwide applicants';
  if (scope.includes('UNKNOWN')) return 'Location to verify';
  return scope.map(code => marketNames[code] || code).join(' + ');
}
// Preserve substring matches; offer typo-tolerant suggestions only when no exact
// match remains after the active filters. Short queries stay exact to avoid noise.
function search(items, query, text) {
  if (!query) return items;
  const exact=items.filter(item => text(item).toLocaleLowerCase().includes(query));
  if (exact.length || query.length < 3) return exact;
  const indexed=items.map(item => ({item, text:text(item)}));
  return new Fuse(indexed, {keys:['text'], threshold:0.3, ignoreLocation:true, minMatchCharLength:3})
    .search(query).map(result => result.item.item);
}
export function filterOpportunities(items, state, saved) {
  const query = state.query.trim().toLocaleLowerCase();
  const eligible = items.filter(item => {
    const matchesMarket = state.country === 'all' || item.scope.includes(state.country) || item.scope.includes('WORLD') || (state.includeUnknown && item.scope.includes('UNKNOWN'));
    return matchesMarket && (state.kind === 'all' || item.kind === state.kind) && (state.access === 'all' || item.access === state.access) && (state.view !== 'saved' || saved.has(item.id));
  });
  const results=search(eligible, query, item => [item.name, item.org, item.kind, item.access, item.value, item.summary, item.eligibility, item.limits, item.status, marketLabel(item.scope), ...Object.entries(item.facts || {}).flat()].join(' '));
  return state.sort === 'name' ? results.sort((a,b) => a.name.localeCompare(b.name)) : results;
}
export function filterLeads(items, state, reviewed={}) {
  const query = state.query.trim().toLocaleLowerCase();
  const results=search(items, query, name => {
    const item=reviewed[name] || {};
    return [name,item.description,item.site_description,item.website].filter(Boolean).join(' ');
  });
  return query && !items.some(name => name.toLocaleLowerCase().includes(query)) ? results : results.sort((a,b) => a.localeCompare(b));
}
