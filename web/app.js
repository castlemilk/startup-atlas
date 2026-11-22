import { marketNames, escapeHtml as esc, sourceUrl, marketLabel, filterOpportunities, filterLeads } from './logic.js';
import { logoFor, logoClassFor } from './logos.js?v=3';
import { partnerRelationships } from './relationships.js';
import { openGraph } from './graph-store.js';
import { entityBadge, icon, renderEntityRow } from './atlas-ui.js';
import { entityDetails, entityHref, slug } from './graph-model.js';
import { companyFacets, companyPlaceLabel, filterCompanies, hasCompanyScope, indexCompanies, readExploration, writeExploration } from './atlas-exploration.js';
import { mountExploration } from './atlas-explorer-controls.js';
import { companyColumnGroups, companyColumns, defaultCompanyColumns, compareCompanyRecords, indexCompanyMetadata } from './company-columns.js';
import { loadTreemapEvidence } from './treemap-model.js';

// The directory stays usable if an older browser cannot load the table model.
let opportunityRows=(items,state,saved,visible)=>{
  const rows=filterOpportunities(items,state,saved);
  return {total:rows.length,rows:rows.slice(0,visible)};
};
try { ({opportunityRows}=await import('./table-model.js')); }
catch(error) { console.warn('Table model unavailable; using the built-in directory view.',error); }

const byId = id => document.getElementById(id);
const controls = { search: byId('search'), entityKind:byId('entity-kind'), country: byId('country'), includeUnknown: byId('include-unknown'), kind: byId('kind'), access: byId('access'), sort: byId('sort'), density:byId('directory-density'), partnerCountry: byId('partner-country'), partnerProvider: byId('partner-provider'), partnerEvidence: byId('partner-evidence'), partnerLogo: byId('partner-logo') };
const defaults = { view:'all', query:'', entityKind:'all', columns:null, country:'all', includeUnknown:false, kind:'all', access:'all', sort:'recommended', partnerCountry:'all', partnerProvider:'all', partnerEvidence:'all', partnerLogo:false };
const entitySorts = [['recommended','Search relevance'],['name','Name A–Z'],['name-desc','Name Z–A']];
const companySorts = [...entitySorts, ...[...companyColumns].filter(([,column])=>column.sort).map(([key,column])=>[key,column.sort])];
const opportunitySorts = [['recommended','Featured first'],['name','Name A–Z']];
const companyFilterReset = {countries:[],...Object.fromEntries(companyFacets.map(({key})=>[key,'']))};
const pageSize = 12;
const paddedCanvaWordmark='https://cdn.prod.website-files.com/65dd072aa7402b211d7d6ccf/65deeccca712cb796025a2bd_Canva.png';
const densityControl = byId('directory-density-view');
const densityField = byId('directory-density-field');
const companyOptions = byId('directory-company-options');
const scopeControls = byId('directory-scope-controls');
const mobileOptions = byId('directory-mobile-options');
const optionsViewport = window.matchMedia('(max-width: 800px)');
const panel = byId('directory-inspector');
const inspectorSeat = byId('directory-inspector-seat');
const inspectorSheet = byId('directory-inspector-sheet');
const inspectorSheetContent = byId('directory-sheet-content');
const sheetViewport = window.matchMedia('(max-width: 1169px)');
const scrollControls = byId('directory-table-scroll');
const previousColumns = byId('directory-columns-prev');
const nextColumns = byId('directory-columns-next');
let tableFrame, resultPage, autoPageUntil=0;
const tableObserver = typeof ResizeObserver==='function' ? new ResizeObserver(syncTableScroll) : null;
let state = { ...defaults }, data = null, visible = pageSize;
let searchEntry = false;
let sheetSuspended = false;
let renderedSelection = null;
let sortSignature = '';
let queryMatches = [];
let previousQuery;
let saved = new Set();
try { const stored = JSON.parse(localStorage.getItem('startup-atlas-saved') || '[]'); if (Array.isArray(stored)) saved = new Set(stored.filter(x => typeof x === 'string')); } catch { /* Browsing remains available without storage. */ }


// Reuse the explorer's snapshot for the directory, so results and profiles
// read the same published revision. The old public JSON remains a fallback.
let graphStore=null;
try { graphStore=await openGraph(); } catch { /* Keep the catalogue usable. */ }
const entitiesById = new Map(graphStore?.graph.entities.map(entity=>[entity.id, entity]));
const partnersByName = new Map(graphStore?.graph.entities.filter(entity=>entity.kind==='partner').map(entity=>[entity.name, entity]));
const companies = graphStore?.graph.entities.filter(entity=>entity.kind==='startup') ?? [];
const research = graphStore ? await loadTreemapEvidence(graphStore) : null;
const dimensions = graphStore ? indexCompanies(graphStore.graph,research.technology) : new Map();
const companyMetadata = graphStore ? indexCompanyMetadata(graphStore.graph,dimensions,research) : new Map();
const connectionCounts = new Map();
for (const {from,to} of graphStore?.graph.edges ?? []) {
  for (const id of new Set([from,to])) connectionCounts.set(id, (connectionCounts.get(id) ?? 0) + 1);
}
const showCompanyFilters = () => Boolean(graphStore && state.view === 'all' && ['all','startup'].includes(state.entityKind));
const isCompanyView = () => showCompanyFilters() && (state.entityKind==='startup' || hasCompanyScope(state));
const explorationHost = byId('directory-exploration');
const fieldsHost = byId('directory-exploration-fields');
const exploration = explorationHost.ownerDocument && graphStore ? mountExploration(explorationHost, {
  companies, dimensions, onChange:partial=>update(partial), showDensity:false, hideEmptySector:true, fieldsHost,
}) : null;
async function publicDocument(name) {
  if (graphStore) return graphStore.document(name);
  const response=await fetch('./data/'+name,{cache:'no-cache'});
  if (!response.ok) throw new Error('Public document unavailable');
  return response.json();
}

// Map locations are curated office/programme evidence, not eligibility.
let mappedLocations=null;
try {
  const locations=await publicDocument('map-locations.json');
  if (!Array.isArray(locations)) throw new Error('Invalid locations');
  mappedLocations=locations;
  for (const country of [...new Set(locations.map(x=>x.country).filter(x=>typeof x==='string' && x))].sort()) {
    controls.partnerCountry.add(new Option(country,country));
  }
} catch {
  controls.partnerCountry.disabled=true;
  controls.partnerCountry.options[0].textContent='Countries unavailable';
}
const facetLabels={country:['location','Market'],kind:['filter','Resource'],access:['link','Access'],partnerCountry:['location','Country'],partnerProvider:['provider','Provider'],partnerEvidence:['source','Evidence']};
for (const [key,[glyph,label]] of Object.entries(facetLabels)) {
  Object.assign(controls[key].dataset, {atlasFacet:key, atlasIcon:glyph, atlasLabel:label});
}
function syncFacets() {
  if (typeof CustomEvent !== 'undefined') document.dispatchEvent?.(new CustomEvent('atlas:controls-sync'));
}
function focusFacet(key) {
  if (key==='entityKind' && optionsViewport.matches && mobileOptions.api) mobileOptions.open=true;
  (byId(controls[key].id+'-control') || byId(controls[key].id+'-trigger') || controls[key]).focus();
}

function placeDirectoryOptions() {
  const mobile=Boolean(optionsViewport.matches && mobileOptions.api);
  const menu=byId('directory-options-panel-body');
  const scopeSeat=mobile ? menu : byId('directory-scope-controls-seat');
  const densitySeat=mobile ? menu : companyOptions;
  if (!mobile && mobileOptions.open) mobileOptions.open=false;
  if (scopeControls.parentElement!==scopeSeat) scopeSeat.append?.(scopeControls);
  if (densityField.parentElement!==densitySeat) densitySeat.append?.(densityField);
}

function stateFromUrl() {
  const params = new URLSearchParams(location.search);
  const s = { ...defaults, ...readExploration(params) };
  const view = params.get('view'); if (['all','opportunities','partners','saved'].includes(view)) s.view = view;
  // Existing opportunity-filter links predate the All tab.
  else if (['country','kind','access','unknown'].some(key=>params.has(key))) s.view='opportunities';
  const type=params.get('type'); if (type && [...controls.entityKind.options].some(option=>option.value===type)) s.entityKind=type;
  if (s.view==='all' && !type && !s.query && (!s.selected || s.selected.startsWith('startup:'))) s.entityKind='startup';
  if (s.view==='all' && s.entityKind==='startup') s.sort='name';
  if (params.has('columns')) s.columns = [...companyColumns.keys()].filter(key=>params.get('columns').split(',').includes(key));
  if (companySorts.some(([value])=>value===params.get('sort'))) s.sort=params.get('sort');
  const country = params.get('country'); if (country && (country === 'all' || Object.hasOwn(marketNames,country))) s.country = country;
  for (const name of ['kind','access']) {
    const value = params.get(name); if (value && [...controls[name].options].some(option => option.value === value)) s[name] = value;
  }
  for (const [key,param] of [['partnerProvider','provider'],['partnerEvidence','evidence'],['partnerCountry','mappedCountry']]) { const value=params.get(param); if (value && [...controls[key].options].some(option=>option.value===value)) s[key]=value; }
  s.partnerLogo=params.get('logo')==='1';
  s.includeUnknown = params.get('unknown') === '1';
  return s;
}
function writeUrl(mode) {
  const params = writeExploration(new URLSearchParams(location.search), state);
  const legacyOpportunityScope=state.country!=='all' || state.kind!=='all' || state.access!=='all' || state.includeUnknown;
  for (const [key, value] of [
    ['shown',visible>pageSize ? visible : ''],['view',state.view===defaults.view && !legacyOpportunityScope ? '' : state.view],
    ['type',state.view==='all' || state.entityKind!=='all' ? state.entityKind : ''],['coverage',''],
    ['columns',state.columns?.join(',') ?? null],['sort',state.sort==='recommended' ? '' : state.sort],
    ['country',state.country==='all' ? '' : state.country],['kind',state.kind==='all' ? '' : state.kind],
    ['access',state.access==='all' ? '' : state.access],['unknown',state.includeUnknown ? '1' : ''],
    ['provider',state.partnerProvider==='all' ? '' : state.partnerProvider],['evidence',state.partnerEvidence==='all' ? '' : state.partnerEvidence],
    ['logo',state.partnerLogo ? '1' : ''],['mappedCountry',state.partnerCountry==='all' ? '' : state.partnerCountry],
  ]) {
    if (value || (key==='columns' && value!==null)) params.set(key,value);
    else params.delete(key);
  }
  const suffix = params.toString();
  const current = `${location.pathname}${location.search}${location.hash}`;
  const next = `${location.pathname}${suffix ? `?${suffix}` : ''}${location.hash}`;
  if (next===current) return;
  if (mode==='push' && typeof history.pushState==='function') history.pushState(history.state,'',next);
  else history.replaceState(history.state,'',next);
}

function explorationChanged() {
  if (typeof CustomEvent!=='undefined') document.dispatchEvent?.(new CustomEvent('atlas:exploration-change'));
}

function graphHref(entityId=state.selected) {
  const params = writeExploration(new URLSearchParams(), {...state,selected:entityId});
  if (entityId) params.set('entity',entityId);
  const suffix=params.toString();
  return './graph.html' + (suffix ? `?${suffix}` : '');
}

function activeColumns() {
  return state.columns ?? defaultCompanyColumns;
}

function syncControls() {
  controls.search.value=state.query; controls.entityKind.value=state.entityKind; controls.country.value=state.country; controls.includeUnknown.checked=state.includeUnknown;
  controls.search.placeholder={all:isCompanyView()?'Filter companies':'Search the Atlas',opportunities:'Search opportunities',partners:'Search partners',saved:'Search saved opportunities'}[state.view];
  controls.kind.value=state.kind; controls.access.value=state.access;
  const sorts=state.view==='all' ? (isCompanyView() ? companySorts : entitySorts) : opportunitySorts;
  const signature=sorts[0][1]+sorts.length;
  if (sortSignature!==signature && controls.sort.replaceChildren) {
    controls.sort.replaceChildren(...sorts.map(([value,label])=>new Option(label,value)));
    sortSignature=signature;
  }
  controls.sort.value=sorts.some(([value])=>value===state.sort) ? state.sort : 'recommended';
  controls.density.value=state.density;
  densityControl.setAttribute('value',state.density);
  const columns=activeColumns();
  for (const key of companyColumns.keys()) byId('column-'+key).checked=columns.includes(key);
  byId('directory-column-count').textContent=`${columns.length} of ${companyColumns.size} shown`;
  controls.partnerCountry.value=state.partnerCountry; controls.partnerProvider.value=state.partnerProvider; controls.partnerEvidence.value=state.partnerEvidence; controls.partnerLogo.checked=state.partnerLogo;
  syncFacets();
  byId('clear-search').hidden=!state.query;
  document.querySelectorAll('[data-view]').forEach(button => {
    const active=button.dataset.view===state.view; button.classList.toggle('active',active);
  });
  byId('directory-scope').setAttribute('value',state.view);
  byId('directory-panel').setAttribute('aria-labelledby',`tab-${state.view}`);
}
function renderActiveFilters() {
  const filters=[];
  if (state.view==='partners') {
    if (state.partnerCountry!=='all') filters.push({key:'partnerCountry',label:'Country',value:state.partnerCountry==='unmapped'?'Not mapped yet':state.partnerCountry});
    if (state.partnerProvider!=='all') filters.push({key:'partnerProvider',label:'Provider',value:state.partnerProvider});
    if (state.partnerEvidence!=='all') filters.push({key:'partnerEvidence',label:'Evidence',value:controls.partnerEvidence.selectedOptions[0].textContent});
    if (state.partnerLogo) filters.push({key:'partnerLogo',label:'Logo',value:'Available'});
  } else if (state.view!=='all') {
  if (state.country!=='all') filters.push({key:'country',label:'Market',value:marketNames[state.country] || state.country});
  if (state.includeUnknown) filters.push({key:'includeUnknown',label:'Location',value:'Include locations to verify'});
  if (state.kind!=='all') filters.push({key:'kind',label:'Resource',value:state.kind});
  if (state.access!=='all') filters.push({key:'access',label:'Pathway',value:state.access});
  }
  byId('active-filter-bar').hidden=!filters.length;
  byId('active-filter-count').textContent=String(filters.length);
  byId('active-filter-chips').innerHTML=filters.map(({key,label,value})=>`<li><span><small>${esc(label)}</small>${esc(value)}</span><button type="button" data-remove-filter="${esc(key)}" aria-label="Remove ${esc(label)}: ${esc(value)}">×</button></li>`).join('');
}
function save(id) {
  if (saved.has(id)) saved.delete(id); else saved.add(id);
  try { localStorage.setItem('startup-atlas-saved',JSON.stringify([...saved])); } catch { /* Keep this session usable. */ }
  if (state.view === 'saved') { render(); controls.search.focus(); return; }
  byId('saved-count').textContent=String(saved.size);
  const control=[...document.querySelectorAll('[data-save]')].find(button=>button.dataset.save===id);
  const item=data.opportunities.find(candidate=>candidate.id===id);
  if (control && item) {
    const isSaved=saved.has(id);
    control.setAttribute('aria-pressed',String(isSaved));
    control.setAttribute('aria-label',`${isSaved?'Remove':'Save'} ${item.name}${isSaved?' from':' to'} saved opportunities`);
    control.textContent=isSaved?'♥':'♡';
  }
}
function avatarFor(name,variant='') {
  const initials=name.split(/\s+/).slice(0,2).map(part=>part[0]||'').join('').toUpperCase();
  const logo=logoFor(name);
  return `<span class="avatar ${variant} ${logo?`has-logo ${logoClassFor(name)}`:''}" aria-hidden="true"><span class="avatar-initials">${esc(initials)}</span>${logo?`<img class="company-logo" src="${esc(logo)}" alt="" loading="lazy" decoding="async">`:''}</span>`;
}
const resourceColors={'Cloud credits':'cloud','AI model credits':'ai','GPU & inference':'compute','Developer tools':'developer','Data & analytics':'data','Business tools':'business','Founder programmes':'founder','Funding finders':'funding'};
function badge(label,tone='neutral',resource='') {
  return `<span class="badge" data-tone="${tone}" data-variant="soft" data-size="md"${resource?` data-resource="${esc(resource)}"`:''}><span class="badge-label">${esc(label)}</span></span>`;
}
function renderCard(item,index) {
  const savedItem=saved.has(item.id);
  const links=[item.url,...item.extra].map((url,i)=>{ const href=sourceUrl(url); return href ? `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer" aria-label="${i===0?'Official source':'More terms'} for ${esc(item.name)} (opens in a new tab)">${i===0?'Official source':'More terms'}</a>` : ''; }).join('');
  const locationTone=item.scope.includes('UNKNOWN')?'warning':'neutral';
  const facts=Object.entries(item.facts || {}).map(([label,value])=>`<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join('');
  const primary=sourceUrl(item.url);
  return `<article class="card opportunity-row"><div class="identity row-identity">${avatarFor(item.org,index%3===1?'alt':'')}<div><h3><a class="partner-profile-link" href="./entity.html?id=${encodeURIComponent('programme:'+item.id)}">${esc(item.name)}</a></h3><div class="provider">${esc(item.org)}</div><p class="card-summary">${esc(item.summary)}</p></div></div><div class="row-resource"><span class="row-label">Resource</span>${badge(item.kind,'neutral',resourceColors[item.kind]||'other')}<small>${esc(item.access)}</small></div><div class="row-market"><span class="row-label">Location</span>${badge(marketLabel(item.scope),locationTone)}</div><div class="row-benefit"><span class="row-label">Benefit</span><strong>${esc(item.value)}</strong></div><div class="row-source"><span class="row-label">Status &amp; source</span><span>${esc(item.status)}</span>${primary?`<a href="${esc(primary)}" target="_blank" rel="noopener noreferrer" aria-label="Official source for ${esc(item.name)} (opens in a new tab)">Source</a>`:''}<small>Checked ${esc(item.checked)}</small></div><button class="save" type="button" data-save="${esc(item.id)}" aria-pressed="${savedItem}" aria-label="${savedItem?'Remove':'Save'} ${esc(item.name)}${savedItem?' from':' to'} saved opportunities">${savedItem?'♥':'♡'}</button><details><summary>Eligibility and conditions</summary><div class="details-body">${facts?`<dl class="fact-grid">${facts}</dl>`:''}<p><strong>Who it’s for.</strong> ${esc(item.eligibility)}</p><p><strong>Read the fine print.</strong> ${esc(item.limits)}</p><div class="sources">${links}</div><div class="checked">Research snapshot · ${esc(item.checked)}</div></div></details></article>`;
}
function renderLead(name) {
  const related=data.relatedPartners?.[name];
  const relationships=Object.hasOwn(partnerRelationships,name)?partnerRelationships[name]:[];
  const providerListed=relationships.some(link=>sourceUrl(link.source) && link.evidence!=='self_report');
  const selfReported=relationships.some(link=>sourceUrl(link.source) && link.evidence==='self_report');
  const providerLinks=relationships.map(link=>{const href=sourceUrl(link.source); const label=`${esc(link.provider)} · ${esc(link.relationship)}`; return href?`<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${label} ↗</a>`:`<span>${label}</span>`;}).join('');
  const reviewed=Object.hasOwn(data.reviewedPartners || {},name)?data.reviewedPartners[name]:null;
  const description=reviewed?(reviewed.site_description || reviewed.description || 'Identity reviewed; provider relationships and credit access require separate verification.'):(related?'A related entry has been researched. Membership, investment and credit access have separate requirements.':(providerListed?'Identity details need review; see the cited provider listing.':'Identity, location and provider relationships require verification.'));
  const action=related?`<button type="button" class="related-link" data-related="${esc(related)}">See related research →</button>`:'';
  const website=reviewed && sourceUrl(reviewed.site_source || reviewed.website); const source=reviewed && sourceUrl(reviewed.source);
  const links=reviewed?`<div class="lead-sources">${website?`<a href="${esc(website)}" target="_blank" rel="noopener noreferrer">Website ↗</a>`:''}${source?`<a href="${esc(source)}" target="_blank" rel="noopener noreferrer">Evidence source ↗</a>`:''}${reviewed.reviewed_at?`<span>Reviewed ${esc(reviewed.reviewed_at.slice(0,10))}</span>`:''}</div>`:'';
  return `<article class="card lead-card"><div class="identity">${avatarFor(name,'alt')}<div><h3><a class="partner-profile-link" href="./partner.html?name=${encodeURIComponent(name)}">${esc(name)}</a></h3><div class="provider">Partner index · research lead</div></div></div><p class="card-summary">${esc(description)}</p><div class="tags">${badge(reviewed?'Identity reviewed':related?'Research available':'Not assessed',(related||reviewed)?'accent':'warning')}${badge(providerListed?'Provider-listed':selfReported?'Self-reported':'Relationship to verify',providerListed?'accent':'neutral')}</div>${links}${providerLinks?`<div class="lead-sources">${providerLinks}</div>`:''}${action}</article>`;
}
function renderEntity(item) {
  return renderEntityRow(item, connectionCounts.get(item.id) ?? 0, {
    inspectable:true, selected:item.id===state.selected, graphHref:graphHref(item.id),
  });
}

function orderEntities(entities, sort) {
  if (sort==='recommended') return entities;
  return [...entities].sort((a,b)=>compareCompanyRecords(a,b,sort,companyMetadata));
}

function identityMark(item, {inspector=false}={}) {
  const initials=item.name.trim().split(/\s+/).slice(0,2).map(part=>part[0]||'').join('').toUpperCase();
  const image=sourceUrl(item.logo) || logoFor(item.name);
  const mark=inspector ? 'directory-inspector-mark' : 'entity-row-mark';
  const portfolioLogo=image && item.logo_source==='https://www.airtree.vc/companies';
  const framing=image===paddedCanvaWordmark ? ' directory-canva-mark' : portfolioLogo ? ' directory-portfolio-logo' : '';
  return `<span class="${mark}${image?' has-logo':''}${framing}" aria-hidden="true"><span>${esc(initials)}</span>${image?`<img class="entity-row-image" src="${esc(image)}" alt="" ${inspector?'':'loading="lazy"'} decoding="async" referrerpolicy="no-referrer">`:''}</span>`;
}

function companyHeader(key, label, sortable=true) {
  const column=companyColumns.get(key);
  const active=state.sort===key || (key==='name' && state.sort==='name-desc');
  const descending=state.sort==='name-desc' || column?.descending || column?.compare;
  const direction=column?.compare ? 'other' : descending ? 'descending' : 'ascending';
  const heading=sortable ? `<button type="button" class="directory-column-sort" data-directory-sort="${key}">${esc(label)}${active?icon(descending?'chevron-down':'chevron-up'):''}</button>` : esc(label);
  const style=key==='name' ? ' class="directory-identity-heading"' : ` data-column="${key}"${column.kind?` data-column-kind="${column.kind}"`:''}`;
  return `<th scope="col"${style}${active?` aria-sort="${direction}"`:''}>${heading}</th>`;
}

function renderCompanyCell(key,column,metadata,name) {
  const value=column.read(metadata);
  const note=value!=null ? column.note?.(value,metadata) : null;
  const source=value!=null && sourceUrl(column.source?.(value,metadata));
  const text=value==null ? 'Not recorded' : column.kind==='people'
    ? value.map(person=>`<a href="${esc(entityHref(person))}">${esc(person.name)}</a>`).join(', ')
    : esc(column.format ? column.format(value) : value);
  const sourceLink=source ? `<a href="${esc(source)}" target="_blank" rel="noopener noreferrer" aria-label="Source for ${esc(name)} ${esc(column.label.toLowerCase())}">Source</a>` : '';
  return `<td role="cell" class="directory-company-value" data-column="${key}"${column.kind?` data-column-kind="${column.kind}"`:''}>
    <span class="directory-cell-label">${esc(column.label)}</span><span class="${value==null?'directory-missing':'directory-cell-value'}">${text}</span>${note || sourceLink?`<small class="directory-cell-note">${note?esc(note):''}${note && sourceLink?' · ':''}${sourceLink}</small>`:''}</td>`;
}

function renderCompanyRow(item, columns) {
  const selected=item.id===state.selected;
  const metadata=companyMetadata.get(item.id);
  const fields=columns.map(([key,column])=>renderCompanyCell(key,column,metadata,item.name)).join('');
  return `<tr role="row" class="entity-row directory-company-row" data-kind="startup" data-entity-id="${esc(item.id)}" data-selected="${selected}">
    <td class="directory-compare-cell"><button type="button" class="directory-compare-toggle" data-atlas-compare="${esc(item.id)}" data-company-name="${esc(item.name)}" aria-label="Compare ${esc(item.name)}" aria-pressed="false"><span>${icon('check')}</span></button></td>
    <td role="cell" class="entity-row-main"><div class="directory-row-identity">${identityMark(item)}<h3><a href="${esc(entityHref(item))}">${esc(item.name)}</a></h3></div></td>
    ${fields}
    <td role="cell" class="directory-row-actions-cell"><div class="entity-row-actions"><button type="button" class="entity-row-inspect" data-inspect-entity="${esc(item.id)}" aria-controls="directory-inspector" aria-label="Inspect ${esc(item.name)}" aria-pressed="${selected}">${icon('arrow')}<span class="sr-only">Inspect</span></button><a class="entity-row-graph" href="${esc(graphHref(item.id))}" aria-label="Explore ${esc(item.name)} connections">${icon('graph')}</a></div></td>
  </tr>`;
}

function renderCompanyTable(rows, columns) {
  const headers=columns.map(([key,column])=>companyHeader(key,column.label,Boolean(column.sort))).join('');
  return `<div id="directory-table-frame" class="directory-table-frame" role="region" aria-label="Company results table" tabindex="0"><table class="directory-table" role="table" aria-label="Company results">
    <colgroup><col class="directory-check-column"><col class="directory-identity-column">${columns.map(()=>'<col class="directory-data-column">').join('')}<col class="directory-explore-column"></colgroup>
    <thead><tr><th class="directory-compare-heading" scope="col"><span class="sr-only">Compare</span></th>${companyHeader('name','Company')}${headers}<th class="directory-actions-heading" scope="col"><span class="sr-only">Explore</span></th></tr></thead>
    <tbody role="rowgroup">${rows}</tbody>
  </table></div>`;
}

function syncTableScroll() {
  const overflow=tableFrame && tableFrame.scrollWidth-tableFrame.clientWidth>1;
  scrollControls.hidden=!overflow;
  if (!tableFrame) return;
  tableFrame.toggleAttribute?.('data-wide',Boolean(overflow));
  tableFrame.tabIndex=overflow || tableFrame.scrollHeight-tableFrame.clientHeight>1 ? 0 : -1;
  previousColumns.setAttribute('aria-disabled',String(!overflow || tableFrame.scrollLeft<1));
  nextColumns.setAttribute('aria-disabled',String(!overflow || tableFrame.scrollLeft+tableFrame.clientWidth>=tableFrame.scrollWidth-1));
}

function mountCompanyTable(frame,scrollLeft) {
  tableObserver?.disconnect();
  tableFrame=frame;
  if (frame) {
    frame.scrollLeft=scrollLeft;
    frame.addEventListener('scroll',syncTableScroll,{passive:true});
    tableObserver?.observe(frame);
    const table=frame.querySelector('.directory-table');
    if (table && tableObserver) tableObserver.observe(table);
  }
  syncTableScroll();
}

function inspectorSource(value, label) {
  const href=sourceUrl(value);
  if (!href) return '';
  const publisher=new URL(href).hostname.replace(/^www\./,'');
  return `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(label ?? publisher)} ${icon('external')}</a>`;
}

function inspectorClaim({label,value,source,reviewed_at:reviewed}) {
  return `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd><dd class="directory-claim-source">${inspectorSource(source)}${reviewed?`<small>Reviewed ${esc(reviewed)}</small>`:''}</dd></div>`;
}

function renderInspectorRecord(entity) {
  const {id,kind,name}=entity;
  const company=kind==='startup';
  const details=entityDetails(graphStore.graph,id);
  const facts=Array.isArray(entity.profile_facts)?entity.profile_facts.filter(fact=>fact.label&&fact.value&&sourceUrl(fact.source)):[];
  const related=new Map(details.related.map(item=>[item.id,item]));
  const connections=details.edges.flatMap(edge=>{
    const other=related.get(edge.from===id?edge.to:edge.from);
    if (!other || !sourceUrl(edge.source) || (company && !(edge.kind==='founded' && edge.to===id && other.kind==='person'))) return [];
    const label=company?'Founder':edge.description || 'Recorded connection';
    return [{other,label,source:edge.source}];
  });
  const founderPreview=[...new Map(connections.map(({other})=>[other.id,other])).values()].slice(0,3);
  const people=connections.map(({other,label,source})=>`<li><div><a href="${esc(entityHref(other))}">${esc(other.name)}</a><span>${esc(label)}</span></div>${inspectorSource(source,'Evidence')}</li>`).join('');
  const companyInfo=dimensions.get(id);
  const country=companyPlaceLabel(companyInfo);
  const launch=facts.find(fact=>fact.label.toLowerCase()==='product launched');
  const launchYears=launch?.value.match(/\b[12]\d{3}\b/g) ?? [];
  const launchYear=launchYears.length===1 ? launchYears[0] : '';
  const overviewFacts=company ? facts.filter(fact=>fact.label.toLowerCase()==='founded').slice(0,1) : facts.slice(0,3);
  const funding=details.rounds.filter(round=>sourceUrl(round.source)).map(round=>({
    label:round.stage || 'Funding announcement', value:round.announced_on || 'Announcement date not recorded', source:round.source,
  }));
  const founding=new Map();
  for (const {other,source} of company ? connections : []) {
    const founders=founding.get(source) ?? new Set();
    founders.add(other.name);
    founding.set(source,founders);
  }
  const founderClaims=Array.from(founding,([source,founders])=>({label:founders.size===1?'Founder':'Founders',value:[...founders].join(', '),source}));
  const claims=[...(launch?[launch]:[]), ...founderClaims, ...facts.filter(fact=>fact!==launch), ...funding];
  const profileSource=inspectorSource(entity.source,'Profile source');
  const peopleLabel=company?'People':'Connections';
  return `<div class="directory-inspector-top">
    <div class="directory-inspector-identity">${identityMark(entity,{inspector:true})}<div><h2 id="directory-inspector-heading" tabindex="-1">${esc(name)}</h2><p>${company?'Company':entityBadge(kind)}${companyInfo?.sector?`<span> · ${esc(companyInfo.sector)}</span>`:''}</p></div></div>
    <button type="button" id="close-directory-inspector" class="atlas-button directory-inspector-close" aria-label="Close record inspection">${icon('close')}</button>
  </div>
  ${country||launchYear?`<div class="directory-inspector-meta">${country?`<span>${icon('location')} ${esc(country)}</span>`:''}${launchYear?`<span>${icon('calendar')} Launched ${esc(launchYear)}</span>`:''}</div>`:''}
  <div class="directory-inspector-scroll">
    <div class="directory-inspector-outside" id="directory-inspector-outside" role="status" hidden>
      <strong>Outside current results</strong><p id="directory-exclusion-reason"></p>
      <div><button type="button" id="directory-adjust-filters" class="atlas-button">Adjust filters</button><button type="button" class="atlas-button" data-clear-directory-selection>Clear selection</button></div>
    </div>
    <ui-tabs class="directory-inspector-tabs" default-value="overview" aria-label="Record details">
      <ui-tabs-list aria-label="Record details">
        <ui-tabs-tab value="overview"><button type="button">Overview</button></ui-tabs-tab>
        <ui-tabs-tab value="people"><button type="button">${peopleLabel}</button></ui-tabs-tab>
        <ui-tabs-tab value="sources"><button type="button">Sources</button></ui-tabs-tab>
      </ui-tabs-list>
      <ui-tabs-panel value="overview"><div class="directory-inspector-section">
        <p class="directory-inspector-summary">${esc(entity.summary || 'Further profile details are being researched.')}</p>
        ${overviewFacts.length?`<dl class="directory-inspector-facts">${overviewFacts.map(inspectorClaim).join('')}</dl>`:''}
        ${company&&founderPreview.length?`<h3>Founders</h3><ul class="directory-inspector-founder-preview">${founderPreview.map(person=>`<li><a href="${esc(entityHref(person))}">${icon('person')}${esc(person.name)}</a></li>`).join('')}</ul>`:''}
      </div></ui-tabs-panel>
      <ui-tabs-panel value="people"><div class="directory-inspector-section">
        <h3>${company?'Recorded founders':'Recorded connections'}</h3>
        ${people?`<ul class="directory-inspector-people">${people}</ul>`:`<p>${company?'Founder details':'Sourced connections'} have not been recorded.</p>`}
      </div></ui-tabs-panel>
      <ui-tabs-panel value="sources"><div class="directory-inspector-section">
        ${claims.length?`<dl class="directory-inspector-facts">${claims.map(inspectorClaim).join('')}</dl>`:''}
        ${profileSource || (claims.length===0?'<p>No source links have been recorded.</p>':'')}
      </div></ui-tabs-panel>
    </ui-tabs>
  </div>
  <div class="directory-inspector-actions">
    <a class="atlas-button atlas-button-primary atlas-button-accent" href="${esc(entityHref(entity))}">Open profile ${icon('arrow')}</a>
    <a class="atlas-button" id="directory-inspector-graph" href="${esc(graphHref(id))}">${icon('graph')}Show in graph</a>
    ${company?`<div class="directory-inspector-workspace"><button type="button" class="atlas-button" data-atlas-save-company="${esc(id)}" data-company-name="${esc(name)}" aria-pressed="false">Save</button><button type="button" class="atlas-button" data-atlas-compare="${esc(id)}" data-company-name="${esc(name)}" aria-pressed="false">Compare</button></div>`:''}
  </div>`;
}

let resultIds = new Set();
let exportRecords = null;
document.addEventListener('atlas:export-records',event=>{
  if (exportRecords && event.detail) event.detail.records=exportRecords;
});

function exportRows(matches) {
  if (state.view==='all') return graphStore ? matches : null;
  if (state.view==='partners') return matches.map(name=>{
    const entity=partnersByName.get(name);
    const reviewed=Object.hasOwn(data.reviewedPartners,name) ? data.reviewedPartners[name] : null;
    return {id:entity?.id ?? `partner:${slug(name)}`,name,kind:'partner',source:sourceUrl(entity?.source || reviewed?.source) || ''};
  });
  return matches.map(item=>({id:`programme:${item.id}`,name:item.name,kind:'programme',source:sourceUrl(item.url) || ''}));
}

function exclusionReason(entity) {
  if (state.entityKind!=='all' && entity.kind!==state.entityKind) return 'This record is outside the selected entity type.';
  if (isCompanyView() && entity.kind!=='startup') return 'The applied company filters show company records.';
  if (!queryMatches.some(item=>item.id===entity.id)) return 'This record does not match your search.';
  return 'This record does not match the applied company filters or location.';
}

function syncInspectorPlacement() {
  const enabled=Boolean(graphStore && state.view==='all' && state.selected);
  const modal=Boolean(enabled && sheetViewport.matches && inspectorSheet.api);
  const open=modal && !sheetSuspended;
  if (!open && inspectorSheet.open) inspectorSheet.open=false;
  inspectorSeat.hidden=!enabled || modal;
  panel.hidden=!enabled;
  const seat=modal?inspectorSheetContent:inspectorSeat;
  if (seat.append && panel.parentElement!==seat) seat.append(panel);
  if (open && !inspectorSheet.open) inspectorSheet.open=true;
  document.querySelector('.directory-layout').classList.toggle('has-inspection', enabled && !modal);
  byId('directory-inspector-reopen').hidden=!modal || open;
}

function renderInspector({moveFocus=false}={}) {
  const id=state.view==='all' && graphStore ? state.selected : '';
  for (const row of byId('results-list').querySelectorAll('[data-entity-id]')) {
    const selected=row.dataset.entityId===id;
    row.dataset.selected=String(selected);
    row.querySelector('[data-inspect-entity]')?.setAttribute('aria-pressed',String(selected));
  }
  const entity=entitiesById.get(id);
  if (id!==renderedSelection) {
    renderedSelection=id;
    panel.innerHTML=entity ? renderInspectorRecord(entity) : id
      ? `<div class="directory-inspector-top"><h2 id="directory-inspector-heading" tabindex="-1">Record unavailable</h2><button type="button" id="close-directory-inspector" class="atlas-button directory-inspector-close" aria-label="Close record inspection">${icon('close')}</button></div><p>This record is missing from the current Atlas snapshot.</p>`
      : '<div class="directory-inspector-empty"><h2>Company details</h2><p>Inspect a company to see its record and sources.</p></div>';
    watchImages(panel);
    inspectorSheetContent.scrollTop=0;
  }
  if (entity) {
    byId('directory-inspector-outside').hidden=resultIds.has(id);
    if (!resultIds.has(id)) byId('directory-exclusion-reason').textContent=exclusionReason(entity);
    byId('directory-inspector-graph').href=graphHref(id);
  }
  syncInspectorPlacement();
  if (moveFocus && id && sheetViewport.matches) {
    byId('directory-inspector-heading').focus({preventScroll:true});
    if (!inspectorSheet.open) panel.scrollIntoView({block:'start',behavior:'instant'});
  }
}

function watchImages(owner) {
  owner.querySelectorAll('.company-logo,.entity-row-image').forEach(image=>{
    const fallback=()=>{
      image.closest('.avatar,.entity-row-mark,.directory-inspector-mark')?.classList.remove('has-logo');
      image.remove();
    };
    image.addEventListener('error',fallback,{once:true});
    if (image.complete && !image.naturalWidth) fallback();
  });
}

const opportunityFilters={country:'all',includeUnknown:false,kind:'all',access:'all'};
const partnerFilters={partnerProvider:'all',partnerEvidence:'all',partnerLogo:false,partnerCountry:'all'};

function updateDirectoryHeading() {
  const titles={all:'List',opportunities:'Opportunities',partners:'Partner index',saved:'Saved opportunities'};
  const subtitles={
    all:'Search companies, people, programmes and partners.',
    opportunities:'Find sourced credits and founder programmes.',
    partners:'Explore organisations and their published connections.',
    saved:'Return to opportunities you saved in this browser.',
  };
  const company=isCompanyView();
  byId('directory-heading').textContent=company ? 'Companies' : titles[state.view];
  byId('directory-subtitle').textContent=company ? 'Browse companies by technology, location and funding stage.' : subtitles[state.view];
}

function render({moveInspectionFocus=false}={}) {
  if (!data) return;
  syncControls();
  renderActiveFilters();
  const isPartners=state.view==='partners';
  const isAll=state.view==='all';
  const companyView=isCompanyView();
  const results=byId('results-list');
  const scrollLeft=tableFrame?.scrollLeft || 0;
  const focusedInspection=results.contains?.(document.activeElement) ? document.activeElement.dataset.inspectEntity : '';
  const layout=document.querySelector('.directory-layout');
  if (isAll && graphStore && previousQuery!==state.query) {
    queryMatches=graphStore.search(state.query,graphStore.graph.entities.length);
    previousQuery=state.query;
  }
  const matches=isAll ? (companyView ? filterCompanies(queryMatches,dimensions,state)
    : queryMatches.filter(item=>state.entityKind==='all'||item.kind===state.entityKind)) : [];
  const entities=orderEntities(matches, controls.sort.value);
  const leads=isPartners ? filterLeads(data.partnerLeads,state,data.reviewedPartners,partnerRelationships,name=>!!logoFor(name),mappedLocations,data.partnerProfiles) : null;
  const filtered=isAll ? entities : isPartners ? leads : opportunityRows(data.opportunities,state,saved,data.opportunities.length).rows;
  const shown=filtered.slice(0,visible), total=filtered.length;
  const columns=companyView ? activeColumns().map(key=>[key,companyColumns.get(key)]) : [];
  const renderItem=companyView ? item=>renderCompanyRow(item,columns)
    : isAll ? renderEntity : isPartners ? renderLead : renderCard;
  exportRecords=exportRows(filtered);
  resultIds=new Set(matches.map(item=>item.id));
  document.querySelector('.filters').hidden=isPartners||isAll;
  byId('entity-filter').hidden=!isAll;
  byId('partner-filter-controls').hidden=!isPartners;
  explorationHost.hidden=!showCompanyFilters();
  fieldsHost.hidden=!showCompanyFilters();
  if (showCompanyFilters()) exploration?.update(state,queryMatches);
  layout.classList.toggle('partner-view',isPartners);
  layout.classList.toggle('all-view',isAll);
  layout.classList.toggle('directory-company-view',companyView);
  layout.classList.toggle('directory-company-results',companyView && total>0);
  layout.dataset.density=state.density;
  byId('entity-columns').hidden=!isAll || !total || companyView;
  companyOptions.hidden=densityField.hidden=!companyView;
  byId('all-tab-count').hidden=companyView;
  if (!companyView && byId('directory-columns').open) byId('directory-columns').open=false;
  byId('directory-note').hidden=isAll;
  if (!isAll) byId('directory-note').innerHTML=isPartners
    ? '<p><strong>Provider-listed</strong> means a provider source names the organisation. Self-reported relationships and historical leads are labelled separately. Mapped locations describe selected offices or programmes.</p>'
    : '<p>Confirm eligibility and award conditions in the original source. A location marked <strong>to verify</strong> needs further research.</p>';
  updateDirectoryHeading();
  byId('result-title').textContent=companyView?'Companies':isAll?'Records':isPartners?'Partner index':state.view==='saved'?'Saved opportunities':'Researched opportunities';
  byId('result-count').textContent=isAll&&!graphStore ? 'Unavailable' : `${total} ${total===1?'result':'results'}`;
  byId('graph-search-shortcut').hidden=!isAll || companyView;
  byId('graph-search-shortcut').href=graphHref();
  byId('result-columns').hidden=isAll || isPartners || !total;
  byId('saved-count').textContent=String(saved.size);
  controls.sort.disabled=isPartners;
  byId('sort').parentElement && (byId('sort').parentElement.hidden=isPartners);
  results.setAttribute('aria-busy','false');
  if (isAll && !graphStore) {
    results.innerHTML='<div class="empty-state"><h3>Atlas search is unavailable</h3><p>You can still browse the Opportunities and Partner index tabs.</p></div>';
  } else if (!total) {
    const noSaved=state.view==='saved' && !saved.size;
    const heading=noSaved?'Nothing saved yet':companyView?'No companies match this scope':'No matches found';
    const explanation=noSaved?'Save opportunities with the heart button to find them here.':'Try another search or adjust the applied filters.';
    const action=noSaved?'Browse opportunities':state.query?'Clear search':companyView?'Adjust filters':'Clear filters';
    results.innerHTML=`<div class="empty-state"><h3>${heading}</h3><p>${explanation}</p><div class="empty-state-actions"><button type="button" id="empty-action">${action}</button></div></div>`;
    byId('empty-action').addEventListener('click',()=>{
      if (noSaved) update({view:'opportunities',query:'',...opportunityFilters});
      else if (state.query) update({query:''});
      else if (companyView && exploration) { exploration.openCountries(); return; }
      else clearLegacyFilters();
      controls.search.focus();
    });
  } else {
    const rows=shown.map(renderItem).join('');
    results.innerHTML=companyView ? renderCompanyTable(rows,columns) : rows;
  }
  mountCompanyTable(companyView && total ? results.querySelector('.directory-table-frame') : null,scrollLeft);
  resultPage={items:filtered,renderItem,target:companyView && total ? results.querySelector('tbody') : results};
  autoPageUntil=0;
  syncResultRange();
  watchImages(results);
  renderInspector({moveFocus:moveInspectionFocus});
  if (focusedInspection) focusInspectionTrigger(focusedInspection);
  explorationChanged();
}

function update(partial,{keepRange=false,historyMode='push',inspectOnly=false,moveFocus=false}={}) {
  searchEntry=false;
  if (mobileOptions.open && partial.view && partial.view!==state.view) mobileOptions.open=false;
  Object.assign(state,partial);
  if (!keepRange) visible=pageSize;
  writeUrl(historyMode);
  if (inspectOnly) {
    renderInspector({moveFocus});
    byId('graph-search-shortcut').href=graphHref();
    explorationChanged();
  } else render();
}

function clearLegacyFilters() {
  if (state.view==='all') update({entityKind:'all'});
  else update(state.view==='partners' ? partnerFilters : opportunityFilters);
}

function focusInspectionTrigger(id, {reveal=false}={}) {
  const trigger=[...byId('results-list').querySelectorAll('[data-inspect-entity]')]
    .find(button=>button.dataset.inspectEntity===id) || controls.search;
  trigger.focus({preventScroll:true});
  if (reveal) trigger.scrollIntoView({block:'nearest',behavior:'instant'});
}

function clearSelection() {
  if (!state.selected) return;
  const previous=state.selected;
  sheetSuspended=false;
  update({selected:''},{keepRange:true,inspectOnly:true});
  focusInspectionTrigger(previous,{reveal:true});
}

function editExclusion() {
  const entity=entitiesById.get(state.selected);
  sheetSuspended=sheetViewport.matches;
  syncInspectorPlacement();
  if (entity && state.entityKind!=='all' && entity.kind!==state.entityKind) {
    focusFacet('entityKind');
  } else if (queryMatches.some(item=>item.id===state.selected) && exploration && hasCompanyScope(state)) {
    exploration.openCountries();
  } else controls.search.focus();
}

const viewButtons=[...document.querySelectorAll('[data-view]')];
window.addEventListener('atlas:find-partner',event=>{
  const name=event.detail?.name;
  if (typeof name!=='string' || !data?.partnerLeads.includes(name)) return;
  update({...partnerFilters,view:'partners',query:name});
  byId('directory').scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
  controls.search.focus({preventScroll:true});
});
for (const button of viewButtons) {
  button.addEventListener('click',()=>{if (!button.closest?.('ui-segmented-control')?.api) update({view:button.dataset.view});});
  button.addEventListener('keydown',event=>{
    if (button.closest?.('ui-segmented-control')?.api) return;
    const index=viewButtons.indexOf(button); let next;
    if (event.key==='ArrowRight') next=(index+1)%viewButtons.length;
    else if (event.key==='ArrowLeft') next=(index+viewButtons.length-1)%viewButtons.length;
    else if (event.key==='Home') next=0;
    else if (event.key==='End') next=viewButtons.length-1;
    else return;
    event.preventDefault(); update({view:viewButtons[next].dataset.view}); viewButtons[next].focus();
  });
}
document.addEventListener('valuechange',event=>{if (event.target.id==='directory-scope') update({view:event.detail.value});},{capture:true});
function changeQuery(query) {
  if (query===state.query) return;
  update({query},{historyMode:searchEntry?'replace':'push'});
  searchEntry=true;
}
controls.search.addEventListener('input',event=>{if (!event.isComposing) changeQuery(event.target.value);});
controls.search.addEventListener('compositionend',event=>changeQuery(event.target.value));
controls.search.addEventListener('blur',()=>{searchEntry=false;});
controls.entityKind.addEventListener('change',event=>update({entityKind:event.target.value}));
controls.country.addEventListener('change',event=>update({country:event.target.value}));
controls.includeUnknown.addEventListener('change',event=>update({includeUnknown:event.target.checked}));
controls.kind.addEventListener('change',event=>update({kind:event.target.value}));
controls.access.addEventListener('change',event=>update({access:event.target.value}));
controls.sort.addEventListener('change',event=>update({sort:event.target.value},{keepRange:true}));
function changeDensity(value) {
  if (['comfortable','compact'].includes(value) && state.density!==value) update({density:value},{keepRange:true});
}
controls.density.addEventListener('change',event=>changeDensity(event.target.value));
densityControl.addEventListener('valuechange',event=>changeDensity(event.detail.value));
densityControl.addEventListener('click',event=>{
  if (!densityControl.api) changeDensity(event.target.closest('[data-density-value]')?.dataset.densityValue);
});
byId('directory-column-choices').innerHTML=[...companyColumnGroups].map(([group,label])=>
  `<fieldset><legend>${esc(label)}</legend>${[...companyColumns].filter(([,column])=>column.group===group).map(([key,column])=>
    `<label><input type="checkbox" id="column-${key}" data-company-column="${key}"> ${esc(column.label)}</label>`).join('')}</fieldset>`).join('');
for (const [button,direction] of [[previousColumns,-1],[nextColumns,1]]) {
  button.addEventListener('click',()=>{
    if (tableFrame && button.getAttribute('aria-disabled')!=='true') tableFrame.scrollBy({left:direction*Math.max(180,tableFrame.clientWidth/2)});
  });
}
for (const key of companyColumns.keys()) {
  byId('column-'+key).addEventListener('change',event=>{
    const columns=new Set(activeColumns());
    if (event.target.checked) columns.add(key);
    else columns.delete(key);
    update({columns:[...companyColumns.keys()].filter(name=>columns.has(name))},{keepRange:true});
  });
}
byId('reset-directory-columns').addEventListener('click',()=>update({columns:null},{keepRange:true}));
const columnsPopup=byId('directory-columns');
const columnsPanel=byId('directory-columns-panel');
function setNativeColumns(open) {
  const trigger=columnsPopup.querySelector('.directory-columns-trigger');
  columnsPanel.hidden=!open;
  trigger.setAttribute('aria-expanded',String(open));
  if (open) {
    columnsPanel.setAttribute('role','dialog');
    columnsPanel.querySelector('input')?.focus();
  } else trigger.focus();
}
columnsPopup.addEventListener('click',event=>{
  if (columnsPopup.api) return;
  if (event.target.closest('.directory-columns-trigger')) setNativeColumns(columnsPanel.hidden);
  else if (event.target.closest('ui-popover-close')) setNativeColumns(false);
});
columnsPopup.addEventListener('keydown',event=>{
  if (!columnsPopup.api && !columnsPanel.hidden && event.key==='Escape') setNativeColumns(false);
});
controls.partnerCountry.addEventListener('change',event=>update({partnerCountry:event.target.value}));
controls.partnerProvider.addEventListener('change',event=>update({partnerProvider:event.target.value}));
controls.partnerEvidence.addEventListener('change',event=>update({partnerEvidence:event.target.value}));
controls.partnerLogo.addEventListener('change',event=>update({partnerLogo:event.target.checked}));
byId('reset-filters').addEventListener('click',()=>update({...opportunityFilters,query:'',sort:'recommended'}));
byId('active-filter-chips').addEventListener('click',event=>{
  const button=event.target.closest('[data-remove-filter]'); if (!button) return;
  const key=button.dataset.removeFilter;
  if (!['entityKind','country','includeUnknown','kind','access','partnerProvider','partnerEvidence','partnerLogo','partnerCountry'].includes(key)) return;
  update({[key]:defaults[key]}); focusFacet(key);
});
byId('clear-active-filters').addEventListener('click',()=>{
  clearLegacyFilters();
  focusFacet(state.view==='all'?'entityKind':state.view==='partners'?'partnerProvider':'country');
});
function syncResultRange() {
  const total=resultPage?.items.length || 0;
  byId('result-range').textContent=total ? `Showing ${Math.min(visible,total)} of ${total} results` : '';
  byId('load-more').hidden=visible>=total;
}

function appendPage({moveFocus=false}={}) {
  if (!resultPage || visible>=resultPage.items.length) return;
  const {items,renderItem,target}=resultPage;
  const first=visible;
  const next=items.slice(first,first+pageSize);
  target.insertAdjacentHTML('beforeend',next.map((item,index)=>renderItem(item,first+index)).join(''));
  visible+=pageSize;
  autoPageUntil=0;
  writeUrl(moveFocus ? 'push' : 'replace');
  syncResultRange();
  for (const row of [...target.children].slice(first)) watchImages(row);
  explorationChanged();
  if (moveFocus) {
    const row=target.children[first];
    row?.querySelector('h3 a[href]')?.focus({preventScroll:true});
    row?.scrollIntoView({block:'start',inline:'nearest',behavior:'instant'});
  }
}

byId('load-more').addEventListener('click',()=>appendPage({moveFocus:true}));
function armAutoPage() { autoPageUntil=performance.now()+1400; }
window.addEventListener('wheel',event=>{ if (event.deltaY>0) armAutoPage(); },{passive:true});
window.addEventListener('touchmove',armAutoPage,{passive:true});
window.addEventListener('keydown',event=>{
  if (['ArrowDown','PageDown','End',' '].includes(event.key) && !event.target.closest?.('input,select,textarea,button,[contenteditable]')) armAutoPage();
});
window.addEventListener('scroll',event=>{
  if (performance.now()>autoPageUntil || !resultPage || visible>=resultPage.items.length) return;
  if (event.target===tableFrame) {
    if (tableFrame.scrollTop+tableFrame.clientHeight>=tableFrame.scrollHeight-96) appendPage();
  } else if (event.target===document && (!tableFrame || tableFrame.scrollHeight<=tableFrame.clientHeight+1)) {
    const last=resultPage.target.lastElementChild?.getBoundingClientRect();
    if (last && last.bottom<=innerHeight+96 && last.bottom>0) appendPage();
  }
},{capture:true,passive:true});
byId('results-list').addEventListener('click',event=>{
  const saveButton=event.target.closest('[data-save]');
  if (saveButton) { save(saveButton.dataset.save); return; }
  const related=event.target.closest('[data-related]');
  if (related) {
    update({view:'all',query:related.dataset.related,entityKind:'all',...companyFilterReset,drillCountry:'',drillCity:''});
    controls.search.focus();
    return;
  }
  const sortButton=event.target.closest('[data-directory-sort]');
  if (sortButton) {
    const key=sortButton.dataset.directorySort;
    update({sort:key==='name' && state.sort==='name' ? 'name-desc' : key},{keepRange:true});
    requestAnimationFrame(()=>byId('results-list').querySelector(`[data-directory-sort="${key}"]`)?.focus({preventScroll:true}));
    return;
  }
  const button=event.target.closest('[data-inspect-entity]');
  if (!button || !graphStore) return;
  const id=button.dataset.inspectEntity;
  if (id===state.selected && !sheetSuspended) clearSelection();
  else {
    sheetSuspended=false;
    update({selected:id},{keepRange:true,inspectOnly:true,moveFocus:true});
  }
});
panel.addEventListener('click',event=>{
  if (event.target.closest('#close-directory-inspector,[data-clear-directory-selection]')) clearSelection();
  else if (event.target.closest('#directory-adjust-filters')) editExclusion();
});
panel.addEventListener('keydown',event=>{
  if (event.key==='Escape' && !event.defaultPrevented && !inspectorSheet.open) clearSelection();
});
inspectorSheet.addEventListener('openchange',event=>{
  if (event.detail.value || !state.selected || !sheetViewport.matches || sheetSuspended || state.view!=='all') return;
  queueMicrotask(()=>{if (!inspectorSheet.open) clearSelection();});
});
inspectorSheet.addEventListener('openchangecomplete',event=>{
  // History can restore focus after the modal opens. Put it inside the sheet once the opening has settled.
  if (event.detail.value && inspectorSheet.open && !panel.contains(document.activeElement)) {
    byId('directory-inspector-heading')?.focus({preventScroll:true});
  }
});
byId('directory-inspector-reopen').addEventListener('click',()=>{
  sheetSuspended=false;
  renderInspector({moveFocus:true});
});
sheetViewport.addEventListener?.('change',()=>{
  if (data) syncInspectorPlacement();
});
optionsViewport.addEventListener?.('change',()=>{
  placeDirectoryOptions();
  if (data) updateDirectoryHeading();
});
window.customElements?.whenDefined('ui-popover').then(placeDirectoryOptions);
window.customElements?.whenDefined('ui-dialog').then(()=>{
  if (data) syncInspectorPlacement();
});
const visibleFromUrl=()=>{
  const value=Number(new URLSearchParams(location.search).get('shown'));
  return Number.isInteger(value)&&value>pageSize ? Math.min(value,1200) : pageSize;
};
window.addEventListener('popstate',()=>{
  const next=stateFromUrl();
  const priorSelection=state.selected;
  const reopenInspection=Boolean(next.selected && next.selected!==priorSelection && sheetViewport.matches);
  const restoreInspectionFocus=priorSelection && !next.selected && panel.contains?.(document.activeElement);
  if (next.selected!==state.selected) sheetSuspended=false;
  searchEntry=false;
  state=next;
  visible=visibleFromUrl();
  render({moveInspectionFocus:reopenInspection});
  if (restoreInspectionFocus) focusInspectionTrigger(priorSelection);
});
state=stateFromUrl(); visible=visibleFromUrl(); syncControls();
try {
  const [catalogue,reviewed,profiles]=await Promise.all([publicDocument('catalogue.json'),publicDocument('partners-reviewed.json').catch(()=>({})),publicDocument('partner-profiles.json').catch(()=>({}))]);
  data=catalogue;
  try {
    data.reviewedPartners=reviewed && typeof reviewed==='object' && !Array.isArray(reviewed) ? reviewed : {};
  }
  catch { data.reviewedPartners={}; }
  try { data.partnerProfiles=profiles && typeof profiles==='object' && !Array.isArray(profiles) ? profiles : {}; } catch { data.partnerProfiles={}; }
  if (!Array.isArray(data.opportunities) || !Array.isArray(data.partnerLeads)) throw new Error('Invalid catalogue');
  byId('opportunity-count').textContent=data.opportunities.length;
  byId('opportunity-tab-count').textContent=data.opportunities.length;
  byId('lead-count').textContent=data.partnerLeads.length;
  byId('partner-tab-count').textContent=data.partnerLeads.length;
  byId('all-tab-count').textContent=graphStore?graphStore.graph.entities.length:'—';
  const markets=new Set(data.opportunities.flatMap(item=>item.scope).filter(code=>code!=='WORLD'&&code!=='UNKNOWN'));
  byId('country-count').textContent=markets.size;
  writeUrl('replace');
  render();
} catch {
  byId('results-list').setAttribute('aria-busy','false');
  byId('results-list').innerHTML='<div class="error"><strong>The catalogue could not be loaded.</strong> Check your connection and reload this page.</div>';
  byId('result-count').textContent='Unavailable';
}
