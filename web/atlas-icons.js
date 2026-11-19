/**
 * Canonical Atlas utility marks: a 24 × 24 grid, open strokes and round joins.
 * Geometry is authored here once. Existing Atlas paths retain their exact data.
 * This module is DOM-free so the site and downloadable SVG pack share one source.
 */
const definitions = [
  ['list', 'List', 'explore', 'Scan records in a readable list.', ['directory', 'rows', 'search'], '<path d="M8 6h12M8 12h12M8 18h12"/><path d="M3 6h.01M3 12h.01M3 18h.01"/>'],
  ['treemap', 'Treemap', 'explore', 'Compare a measure through proportional areas.', ['chart', 'area', 'funding'], '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 3v18M12 11h9M3 15h9"/>'],
  ['graph', 'Graph', 'explore', 'Follow recorded connections between entities.', ['network', 'connection', 'relationship'], '<circle cx="5" cy="12" r="3"/><circle cx="18" cy="5" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8 10 7-4M8 14l7 4"/>'],
  ['external', 'External link', 'navigation', 'Open a destination outside the current context.', ['open', 'source', 'website'], '<path d="M14 4h6v6M20 4 10 14M10 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5"/>'],
  ['arrow', 'Arrow right', 'navigation', 'Continue to the next destination.', ['next', 'forward', 'right'], '<path d="M4 12h16m-6-6 6 6-6 6"/>'],
  ['close', 'Close', 'navigation', 'Close a preview or clear a field.', ['dismiss', 'clear', 'remove'], '<path d="m6 6 12 12M18 6 6 18"/>'],
  ['search', 'Search', 'explore', 'Find a record or narrow a collection.', ['find', 'query', 'discover'], '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>'],
  ['system', 'Design system', 'explore', 'Open the collection of shared interface patterns.', ['components', 'catalogue', 'grid'], '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 17.5h7m-3.5-3.5v7"/>'],
  ['fit', 'Fit view', 'explore', 'Bring the current visualization into view.', ['zoom', 'canvas', 'frame'], '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/><rect x="8" y="8" width="8" height="8" rx="1"/>'],
  ['reset', 'Reset', 'actions', 'Restore the starting state of a local control.', ['refresh', 'restore', 'retry'], '<path d="M4 10a8 8 0 1 1 1 8M4 4v6h6"/>'],
  ['download', 'Download', 'actions', 'Save a file to the device.', ['export', 'save', 'file'], '<path d="M12 3v12m-5-5 5 5 5-5M4 16v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/>'],
  ['copy', 'Copy', 'actions', 'Copy a value or a code fragment.', ['clipboard', 'duplicate', 'svg'], '<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>'],
  ['check', 'Check', 'actions', 'Confirm a completed action; pair it with explicit text.', ['complete', 'success', 'done'], '<path d="m4 12 5 5L20 6"/>'],
  ['plus', 'Plus', 'actions', 'Add an item or expand the current view.', ['add', 'expand', 'increase'], '<path d="M12 4v16M4 12h16"/>'],
  ['minus', 'Minus', 'actions', 'Remove an item or reduce the current view.', ['collapse', 'decrease', 'subtract'], '<path d="M4 12h16"/>'],
  ['chevron-down', 'Chevron down', 'navigation', 'Indicate an expandable section or downward movement.', ['expand', 'select', 'down'], '<path d="m5 9 7 7 7-7"/>'],
  ['chevron-up', 'Chevron up', 'navigation', 'Indicate a collapsed section or upward movement.', ['collapse', 'up'], '<path d="m5 15 7-7 7 7"/>'],
  ['chevron-left', 'Chevron left', 'navigation', 'Move to the previous item.', ['previous', 'back', 'left'], '<path d="m15 5-7 7 7 7"/>'],
  ['chevron-right', 'Chevron right', 'navigation', 'Move to the next item.', ['next', 'forward', 'right'], '<path d="m9 5 7 7-7 7"/>'],
  ['arrow-left', 'Arrow left', 'navigation', 'Return to the preceding destination.', ['previous', 'return', 'back'], '<path d="M20 12H4m6-6-6 6 6 6"/>'],
  ['filter', 'Filter', 'explore', 'Adjust the scope of a visible collection.', ['scope', 'refine', 'controls'], '<path d="M3 6h6m4 0h8M3 12h12m4 0h2M3 18h2m4 0h12M9 3v6m6 0v6M5 15v6"/>'],
  ['link', 'Link', 'evidence', 'Reference a connection or shareable destination.', ['url', 'connection', 'relationship'], '<path d="m10 7 2-2a5 5 0 0 1 7 7l-2 2M14 17l-2 2a5 5 0 0 1-7-7l2-2m2 5 6-6"/>'],
  ['company', 'Company', 'entities', 'Identify a company or startup record.', ['startup', 'business', 'organisation'], '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 7h1m4 0h1M9 11h1m4 0h1M10 21v-6h4v6"/>'],
  ['person', 'Person', 'entities', 'Identify a founder or team member.', ['founder', 'people', 'team'], '<circle cx="12" cy="7" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>'],
  ['partners', 'Partner', 'entities', 'Identify an organisation connected to the ecosystem.', ['investor', 'vc', 'fund', 'organisation'], '<circle cx="8" cy="7" r="3"/><path d="M2 21v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6m2 5a5 5 0 0 1 4 5v1"/>'],
  ['programme', 'Programme', 'entities', 'Identify a programme or opportunity.', ['accelerator', 'offer', 'opportunity'], '<path d="M5 21V3m0 1h13l-3 4 3 4H5"/>'],
  ['provider', 'Provider', 'entities', 'Identify a provider of tools or services.', ['service', 'platform', 'cloud'], '<path d="M7 19a5 5 0 0 1-1-9.9A6 6 0 0 1 18 9a5 5 0 0 1 0 10H7Z"/>'],
  ['source', 'Source document', 'evidence', 'Show where a recorded claim comes from.', ['document', 'evidence', 'reference'], '<path d="M14 3H5a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9l-6-6Zm0 0v6h6M8 13h8m-8 4h6"/>'],
  ['calendar', 'Calendar', 'evidence', 'Label a recorded date or deadline.', ['date', 'deadline', 'time'], '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 11h18M7 15h1m4 0h1m4 0h1M7 18h1m4 0h1"/>'],
  ['location', 'Location', 'evidence', 'Label a recorded place without implying eligibility.', ['place', 'geography', 'map'], '<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2.5"/>'],
  ['info', 'Information', 'evidence', 'Explain context, limitations or useful detail.', ['help', 'about', 'context'], '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10h.01"/>'],
  ['warning', 'Warning', 'evidence', 'Call attention to a recoverable issue with a text explanation.', ['partial', 'unavailable', 'caution'], '<path d="M10.3 4.1 2.5 18a2 2 0 0 0 1.7 3h15.6a2 2 0 0 0 1.7-3L13.7 4.1a2 2 0 0 0-3.4 0ZM12 9v5m0 3h.01"/>']
];

export const iconCategories = Object.freeze([
  {id:'explore', label:'Explore'}, {id:'navigation', label:'Navigation'},
  {id:'actions', label:'Actions'}, {id:'entities', label:'Entities'}, {id:'evidence', label:'Evidence'}
].map(Object.freeze));

export const atlasIcons = Object.freeze(definitions.map(([id,label,category,description,tags,paths]) =>
  Object.freeze({id,label,category,description,tags:Object.freeze(tags),paths,viewBox:'0 0 24 24'})
));
export const iconRegistry = Object.freeze(Object.fromEntries(atlasIcons.map(icon => [icon.id,icon])));
const aliases = Object.freeze({'arrow-right':'arrow'});
const escapeAttribute = value => String(value).replace(/[&<>"']/g,character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
const finiteNumber = (value, fallback, min, max) => Number.isFinite(Number(value)) ? Math.min(max,Math.max(min,Number(value))) : fallback;

/** Unknown names intentionally retain the existing right-arrow fallback. */
export function getIcon(name) {
  const id = Object.hasOwn(aliases,name) ? aliases[name] : name;
  return Object.hasOwn(iconRegistry,id) ? iconRegistry[id] : iconRegistry.arrow;
}

function svg(name, options, standalone) {
  const record = getIcon(name);
  const size = finiteNumber(options.size ?? 24,24,8,256);
  const stroke = finiteNumber(options.strokeWidth ?? 1.65,1.65,0.5,3);
  const color = /^(?:currentColor|#[\da-f]{3,4}|#[\da-f]{6}|#[\da-f]{8})$/i.test(options.color || '') ? options.color : 'currentColor';
  const classes = String(options.className ?? (standalone ? '' : 'atlas-icon')).split(/\s+/).filter(value => /^[a-z_][a-z\d_-]*$/i.test(value)).join(' ');
  const label = options.label == null ? (standalone ? record.label : '') : String(options.label);
  return `<svg${standalone ? ' xmlns="http://www.w3.org/2000/svg"' : ''}${classes ? ` class="${classes}"` : ''} width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${escapeAttribute(color)}" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round"${label ? ` role="img" aria-label="${escapeAttribute(label)}"` : ' aria-hidden="true"'} focusable="false">${standalone && label ? `<title>${escapeAttribute(label)}</title>` : ''}${record.paths}</svg>`;
}

/** Safe decorative UI SVG by default; pass a label for a meaningful standalone mark. */
export function renderIcon(name, options = {}) { return svg(name,options,false); }

/** Deterministic, self-contained SVG for copying, downloading and static pack generation. */
export function exportIcon(name, options = {}) { return svg(name,options,true) + '\n'; }

export default atlasIcons;
