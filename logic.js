export const marketNames = { AU: 'Australia', NZ: 'New Zealand', US: 'United States', GB: 'United Kingdom', IN: 'India', SG: 'Singapore', JP: 'Japan', KR: 'South Korea', BR: 'Brazil', ZA: 'South Africa', FR: 'France' };
export const escapeHtml = (value) => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export function sourceUrl(value) {
  try { const url = new URL(value); return url.protocol === 'https:' ? url.href : null; } catch { return null; }
}
export function marketLabel(scope) {
  if (scope.includes('WORLD')) return 'Worldwide applicants';
  if (scope.includes('UNKNOWN')) return 'Location to verify';
  return scope.map(code => marketNames[code] || code).join(' + ');
}
export function filterOpportunities(items, state, saved) {
  const query = state.query.trim().toLocaleLowerCase();
  return items.filter(item => {
    const searchable = [item.name, item.org, item.kind, item.access, item.value, item.summary, item.eligibility, item.limits, item.status, marketLabel(item.scope)].join(' ').toLocaleLowerCase();
    const matchesMarket = state.country === 'all' || item.scope.includes(state.country) || item.scope.includes('WORLD') || (state.includeUnknown && item.scope.includes('UNKNOWN'));
    return (!query || searchable.includes(query)) && matchesMarket && (state.kind === 'all' || item.kind === state.kind) && (state.access === 'all' || item.access === state.access) && (state.view !== 'saved' || saved.has(item.id));
  }).sort((a, b) => state.sort === 'name' ? a.name.localeCompare(b.name) : 0);
}
export function filterLeads(items, state, reviewed={}) {
  const query = state.query.trim().toLocaleLowerCase();
  return items.filter(name => {
    const item=reviewed[name] || {};
    const searchable=[name,item.description,item.site_description,item.website].filter(Boolean).join(' ').toLocaleLowerCase();
    return !query || searchable.includes(query);
  }).sort((a,b) => a.localeCompare(b));
}
