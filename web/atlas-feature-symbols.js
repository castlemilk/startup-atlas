/** Signal feature symbols: an optical 24px counterpart to the rendered artwork. */
const definitions = [
  ['mcp', 'MCP', 'A coupling between two context interfaces.', '<path d="M9 4H5L3 6v12l2 2h4v-5H7V9h2ZM15 4h4l2 2v12l-2 2h-4v-5h2V9h-2Z"/><path class="feature-accent" d="M9 11h6v2H9Z" fill="currentColor" stroke="none"/>'],
  ['treemap', 'Treemap', 'A bounded plane with distinct partitions.', '<path d="M5 3h14l2 2v14l-2 2H5l-2-2V5Z"/><path d="M13 3v18M3 14h10M13 10h8"/><path class="feature-accent" d="M5 5h6v7H5Z" fill="currentColor" stroke="none"/>'],
  ['search', 'Search & rankings', 'An ordered index with one selected record.', '<path d="M6 3h14v4H6ZM6 17h14v4H6Z"/><path class="feature-accent" d="M3 10h17v4H3Z"/><path d="M6 12h.01M9 12h8"/>'],
  ['graph', 'Knowledge graph', 'A selected junction and its immediate connections.', '<path d="M6 6.5h6V10M17 5.5h-5V10M6 18h6v-4M18 17.5h-6V14"/><path d="M3 4h3v5H3ZM17 3h4v5h-4ZM3 16h3v5H3ZM18 15h3v5h-3Z"/><path class="feature-accent" d="M10 10h4v4h-4Z" fill="currentColor"/>']
];

export const featureSymbols = Object.freeze(definitions.map(([id,name,description,paths]) => Object.freeze({id,name,description,paths,viewBox:'0 0 24 24',size:24,strokeWidth:1.5})));
const registry = new Map(featureSymbols.map(symbol => [symbol.id,symbol]));
const escape = value => String(value).replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));

function svg(id, {size=24,title=''}={}, standalone=false) {
  const symbol = registry.get(id);
  if(!symbol) throw new RangeError('Unknown Atlas feature symbol: '+id);
  const dimension = Number.isFinite(Number(size)) ? Math.min(256,Math.max(16,Number(size))) : 24;
  const label = title || (standalone ? symbol.name : '');
  return `<svg xmlns="http://www.w3.org/2000/svg" class="signal-feature-symbol" width="${dimension}" height="${dimension}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="square" stroke-linejoin="miter"${label ? ` role="img" aria-label="${escape(label)}"` : ' aria-hidden="true"'} focusable="false">${label ? `<title>${escape(label)}</title>` : ''}${symbol.paths}</svg>`;
}

export function featureSymbol(id, options={}) { return svg(id,options,false); }
export function exportFeatureSymbol(id, options={}) { return svg(id,options,true)+'\n'; }
export default featureSymbols;
