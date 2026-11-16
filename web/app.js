import { marketNames, escapeHtml as esc, sourceUrl, marketLabel, filterOpportunities, filterLeads } from './logic.js';
import { logoFor, logoClassFor } from './logos.js?v=3';
import { partnerRelationships } from './relationships.js';
import { openGraph } from './graph-store.js';
import { entityBadge, icon, renderEntityRow } from './atlas-ui.js';
import { entityDetails, entityHref } from './graph-model.js';

// The directory stays usable if an older browser cannot load the table model.
let opportunityRows=(items,state,saved,visible)=>{
  const rows=filterOpportunities(items,state,saved);
  return {total:rows.length,rows:rows.slice(0,visible)};
};
try { ({opportunityRows}=await import('./table-model.js')); }
catch(error) { console.warn('Table model unavailable; using the built-in directory view.',error); }

const byId = id => document.getElementById(id);
const controls = { search: byId('search'), entityKind:byId('entity-kind'), country: byId('country'), includeUnknown: byId('include-unknown'), kind: byId('kind'), access: byId('access'), sort: byId('sort'), partnerCountry: byId('partner-country'), partnerProvider: byId('partner-provider'), partnerEvidence: byId('partner-evidence'), partnerLogo: byId('partner-logo') };
const defaults = { view:'all', query:'', entityKind:'all', country:'all', includeUnknown:false, kind:'all', access:'all', sort:'recommended', partnerCountry:'all', partnerProvider:'all', partnerEvidence:'all', partnerLogo:false };
let state = { ...defaults }, data = null, visible = 12;
let inspectedEntity = '';
let saved = new Set();
try { const stored = JSON.parse(localStorage.getItem('startup-atlas-saved') || '[]'); if (Array.isArray(stored)) saved = new Set(stored.filter(x => typeof x === 'string')); } catch { /* Browsing remains available without storage. */ }


// Reuse the explorer's snapshot for the directory, so results and profiles
// read the same published revision. The old public JSON remains a fallback.
let graphStore=null;
try { graphStore=await openGraph(); } catch { /* Keep the catalogue usable. */ }
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
/* The authored facet menus share the Atlas utility icon vocabulary. */
const facetLabels={country:['location','Market'],kind:['filter','Resource'],access:['link','Access'],partnerCountry:['location','Country'],partnerProvider:['provider','Provider'],partnerEvidence:['source','Evidence']};
const facetOptionIcons={kind:{'AI model credits':'graph','Cloud credits':'provider','GPU & inference':'provider','Developer tools':'system','Data & analytics':'treemap','Business tools':'company','Founder programmes':'programme','Funding finders':'partners'},access:{Direct:'external','Partner referral':'partners',Community:'person',Investment:'company'},partnerEvidence:{official:'link',screenshot:'source',self_report:'source',reviewed:'check'}};
function facetOptionIcon(key,value) {
  const providerName=key==='partnerProvider'?({AWS:'Amazon Web Services',Vercel:'Vercel',Microsoft:'Microsoft'}[value]):null;
  const logo=providerName && logoFor(providerName);
  return logo?`<img class="facet-option-logo" src="${esc(logo)}" alt="">`:`<span class="facet-option-symbol" aria-hidden="true">${icon(facetOptionIcons[key]?.[value] || facetLabels[key][0])}</span>`;
}
const facetPopovers=new Map();
for (const [key,[glyph,label]] of Object.entries(facetLabels)) {
  const select=controls[key], details=document.createElement('details');
  details.className='facet-picker'; details.dataset.facet=key; if(select.disabled) details.dataset.disabled='true';
  const summary=document.createElement('summary');
  summary.innerHTML=`<span class="facet-icon" aria-hidden="true">${icon(glyph)}</span><span class="facet-label">${label}</span><span class="facet-value"></span><span class="facet-chevron" aria-hidden="true"></span>`;
  const panel=document.createElement('div'); panel.className='facet-panel';
  panel.innerHTML=`<div class="facet-panel-heading"><strong>${label}</strong><span>Choose one</span></div><div class="facet-options" role="group" aria-label="${label}">${[...select.options].map((option,index)=>{const text=index===0?({Market:'All markets',Resource:'All resources',Access:'All pathways',Provider:'All providers',Evidence:'All evidence',Country:'All countries'}[label]):option.textContent;return `<button type="button" class="facet-option" data-value="${esc(option.value)}" aria-pressed="false">${facetOptionIcon(key,option.value)}<span class="facet-option-text">${esc(text)}</span><span class="facet-option-check" aria-hidden="true">✓</span></button>`;}).join('')}</div>`;
  details.append(summary,panel); select.after(details); select.hidden=true; if(select.disabled){summary.setAttribute('aria-disabled','true'); summary.addEventListener('click',event=>event.preventDefault());}
  panel.addEventListener('click',event=>{const option=event.target.closest('button[data-value]');if(!option)return;select.value=option.dataset.value;select.dispatchEvent(new Event('change',{bubbles:true}));details.open=false;summary.focus();});
  details.addEventListener('toggle',()=>{if(details.open) for(const other of facetPopovers.values()) if(other!==details) other.open=false;});
  facetPopovers.set(key,details);
}
function syncFacets() {
  for(const [key,details] of facetPopovers) {
    const select=controls[key], selected=select.selectedOptions[0], active=select.value!=='all';
    details.dataset.active=String(active);
    details.querySelector('.facet-value').textContent=active?selected.textContent:'';
    details.querySelector('summary').setAttribute('aria-label',facetLabels[key][1]+(active?': '+selected.textContent:''));
    for(const option of details.querySelectorAll('button[data-value]')) option.setAttribute('aria-pressed',String(option.dataset.value===select.value));
  }
}
function focusFacet(key) { (facetPopovers.get(key)?.querySelector('summary') || controls[key]).focus(); }
document.addEventListener('pointerdown',event=>{for(const details of facetPopovers.values()) if(details.open && !details.contains(event.target)) details.open=false;});
document.addEventListener('keydown',event=>{if(event.key==='Escape') for(const details of facetPopovers.values()) if(details.open){details.open=false;details.querySelector('summary').focus();break;}});

function stateFromUrl() {
  const params = new URLSearchParams(location.search);
  const s = { ...defaults, query:params.get('q') || '' };
  const view = params.get('view'); if (['all','opportunities','partners','saved'].includes(view)) s.view = view;
  // Existing opportunity-filter links predate the All tab.
  else if (['country','kind','access','unknown'].some(key=>params.has(key))) s.view='opportunities';
  const type=params.get('type'); if (type && [...controls.entityKind.options].some(option=>option.value===type)) s.entityKind=type;
  const country = params.get('country'); if (country && (country === 'all' || Object.hasOwn(marketNames,country))) s.country = country;
  for (const name of ['kind','access','sort']) {
    const value = params.get(name); if (value && [...controls[name].options].some(option => option.value === value)) s[name] = value;
  }
  for (const [key,param] of [['partnerProvider','provider'],['partnerEvidence','evidence'],['partnerCountry','mappedCountry']]) { const value=params.get(param); if (value && [...controls[key].options].some(option=>option.value===value)) s[key]=value; }
  s.partnerLogo=params.get('logo')==='1';
  s.includeUnknown = params.get('unknown') === '1';
  return s;
}
function writeUrl() {
  const params = new URLSearchParams();
  if (visible>12) params.set('shown',String(visible));
  if (state.view !== defaults.view) params.set('view',state.view);
  if (state.query) params.set('q',state.query);
  if (state.entityKind!=='all') params.set('type',state.entityKind);
  if (state.country !== 'all') params.set('country',state.country);
  if (state.kind !== 'all') params.set('kind',state.kind);
  if (state.access !== 'all') params.set('access',state.access);
  if (state.sort !== 'recommended') params.set('sort',state.sort);
  if (state.includeUnknown) params.set('unknown','1');
  if (state.partnerProvider!=='all') params.set('provider',state.partnerProvider);
  if (state.partnerEvidence!=='all') params.set('evidence',state.partnerEvidence);
  if (state.partnerLogo) params.set('logo','1');
  if (state.partnerCountry!=='all') params.set('mappedCountry',state.partnerCountry);
  const suffix = params.toString();
  history.replaceState(null,'',`${location.pathname}${suffix ? `?${suffix}` : ''}${location.hash}`);
}
function syncControls() {
  controls.search.value=state.query; controls.entityKind.value=state.entityKind; controls.country.value=state.country; controls.includeUnknown.checked=state.includeUnknown;
  controls.search.placeholder=state.view==='all'?'Search startups, people, partners, programmes…':'Search providers, programmes, benefits…';
  controls.kind.value=state.kind; controls.access.value=state.access; controls.sort.value=state.sort;
  controls.partnerCountry.value=state.partnerCountry; controls.partnerProvider.value=state.partnerProvider; controls.partnerEvidence.value=state.partnerEvidence; controls.partnerLogo.checked=state.partnerLogo;
  syncFacets();
  byId('clear-search').hidden=!state.query;
  document.querySelectorAll('[data-view]').forEach(button => {
    const active=button.dataset.view===state.view; button.classList.toggle('active',active); button.setAttribute('aria-selected',String(active)); button.tabIndex=active?0:-1;
  });
  byId('directory-panel').setAttribute('aria-labelledby',`tab-${state.view}`);
}
function renderActiveFilters() {
  const filters=[];
  if (state.view==='all') {
    if (state.entityKind!=='all') filters.push({key:'entityKind',label:'Type',value:controls.entityKind.selectedOptions[0].textContent});
  } else if (state.view==='partners') {
    if (state.partnerCountry!=='all') filters.push({key:'partnerCountry',label:'Country',value:state.partnerCountry==='unmapped'?'Not mapped yet':state.partnerCountry});
    if (state.partnerProvider!=='all') filters.push({key:'partnerProvider',label:'Provider',value:state.partnerProvider});
    if (state.partnerEvidence!=='all') filters.push({key:'partnerEvidence',label:'Evidence',value:controls.partnerEvidence.selectedOptions[0].textContent});
    if (state.partnerLogo) filters.push({key:'partnerLogo',label:'Logo',value:'Available'});
  } else {
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
  const connections=graphStore?.graph.edges.filter(edge=>edge.from===item.id || edge.to===item.id).length;
  return renderEntityRow(item,connections,{inspectable:true,selected:item.id===inspectedEntity});
}

function inspectorSource(value,label='Source') {
  const href=sourceUrl(value);
  return href?`<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${icon('source')}${esc(label)} ${icon('external')}</a>`:'';
}
function inspectEntity(id,{moveFocus=false}={}) {
  inspectedEntity=id;
  for (const row of byId('results-list').querySelectorAll('[data-entity-id]')) {
    const selected=row.dataset.entityId===id;
    row.dataset.selected=String(selected);
    row.querySelector('[data-inspect-entity]')?.setAttribute('aria-pressed',String(selected));
  }
  const panel=byId('directory-inspector');
  if (!id || !graphStore) {
    panel.innerHTML=`<div class="directory-inspector-empty">${icon('source')}<p class="directory-eyebrow">THE RECORD, IN CONTEXT</p><h2>A closer look.</h2><p>Select <strong>Inspect</strong> beside a record to see its description, people and source-backed details.</p><p class="directory-inspector-note">Profiles and connections remain a separate step, so your search stays in place.</p></div>`;
    return;
  }
  const details=entityDetails(graphStore.graph,id), entity=details.entity;
  const facts=Array.isArray(entity.profile_facts)?entity.profile_facts.filter(fact=>fact.label&&fact.value&&sourceUrl(fact.source)):[];
  const related=new Map(details.related.map(item=>[item.id,item]));
  const founders=entity.kind==='startup'?details.edges.filter(edge=>edge.kind==='founded'&&edge.to===id&&related.get(edge.from)?.kind==='person'&&sourceUrl(edge.source)):[];
  const connections=details.edges.filter(edge=>related.has(edge.from===id?edge.to:edge.from)&&sourceUrl(edge.source));
  const contextEdges=entity.kind==='startup'?founders:connections;
  const relationship=edge=>edge.description||({founded:'Founded',supports:'Listed in portfolio',team_member:'Team member',offers:'Offers'}[edge.kind]||'Recorded connection');
  const people=contextEdges.slice(0,3).map(edge=>{const other=related.get(edge.from===id?edge.to:edge.from);return `<li><div><a href="${esc(entityHref(other))}">${esc(other.name)}</a><span>${esc(entity.kind==='startup'?'Founder':relationship(edge))}</span></div>${inspectorSource(edge.source,'Evidence')}</li>`;}).join('');
  const initials=entity.name.trim().split(/\s+/).slice(0,2).map(part=>part[0]||'').join('').toUpperCase();
  const image=sourceUrl(entity.logo)||logoFor(entity.name);
  const imageMarkup=image?`<img src="${esc(image)}" alt="" referrerpolicy="no-referrer"><span hidden>${esc(initials)}</span>`:`<span>${esc(initials)}</span>`;
  panel.innerHTML=`<div class="directory-inspector-top"><p class="directory-eyebrow">INSPECTED RECORD</p><button type="button" id="close-directory-inspector" class="atlas-button directory-inspector-close" aria-label="Close record inspection">${icon('close')}</button></div><div class="directory-inspector-identity"><span class="directory-inspector-mark" aria-hidden="true">${imageMarkup}</span><div><h2 id="directory-inspector-heading" tabindex="-1">${esc(entity.name)}</h2>${entityBadge(entity.kind)}</div></div><p class="directory-inspector-summary">${esc(entity.summary||'Further profile details are being researched.')}</p><section class="directory-inspector-section"><h3>${entity.kind==='startup'?'Founders':'Connections'} <span>${contextEdges.length} recorded</span></h3>${people?`<ul class="directory-inspector-people">${people}</ul>${contextEdges.length>3?`<p class="directory-inspector-note">Showing 3 of ${contextEdges.length}. Open the full profile for the researched connections.</p>`:''}`:`<p class="directory-inspector-note">${entity.kind==='startup'?'Founder details have not been recorded yet.':'Sourced connections have not been recorded yet.'}</p>`}</section><section class="directory-inspector-section"><h3>Sourced details</h3>${facts.length?`<dl class="directory-inspector-facts">${facts.slice(0,3).map(fact=>`<div><dt>${esc(fact.label)}</dt><dd>${esc(fact.value)}${inspectorSource(fact.source)}${fact.reviewed_at?`<small>Reviewed ${esc(fact.reviewed_at)}</small>`:''}</dd></div>`).join('')}</dl>${facts.length>3?`<p class="directory-inspector-note">Showing 3 of ${facts.length} recorded facts.</p>`:''}`:'<p class="directory-inspector-note">Additional facts have not been recorded. Follow the profile source for its original context.</p>'}${inspectorSource(entity.source,'Profile source')||'<p class="directory-inspector-note">A profile source has not been recorded.</p>'}</section><div class="directory-inspector-actions"><a class="atlas-button atlas-button-accent" href="${esc(entityHref(entity))}">Open profile ${icon('arrow')}</a><a class="atlas-button" href="./graph.html?entity=${encodeURIComponent(id)}">${icon('graph')}Explore connections</a></div><p class="sr-only" role="status">Inspecting ${esc(entity.name)}.</p>`;
  panel.querySelectorAll('img').forEach(img=>{const fallback=()=>{img.hidden=true;if(img.nextElementSibling)img.nextElementSibling.hidden=false;};img.addEventListener('error',fallback,{once:true});if(img.complete&&!img.naturalWidth)fallback();});
  byId('close-directory-inspector').addEventListener('click',()=>{
    const previous=inspectedEntity;inspectEntity('');
    const trigger=[...byId('results-list').querySelectorAll('[data-inspect-entity]')].find(button=>button.dataset.inspectEntity===previous);
    if(!trigger) return;
    if(window.matchMedia('(max-width: 900px)').matches) {
      trigger.focus({preventScroll:true});
      trigger.scrollIntoView({block:'nearest',behavior:'instant'});
    } else trigger.focus();
  });
  if(moveFocus&&window.matchMedia('(max-width: 900px)').matches) {
    byId('directory-inspector-heading').focus({preventScroll:true});
    panel.scrollIntoView({block:'start',behavior:'instant'});
  }
}

function render() {
  if (!data) return;
  syncControls();
  renderActiveFilters();
  const isPartners=state.view==='partners';
  const isAll=state.view==='all';
  const leads=isPartners?filterLeads(data.partnerLeads,state,data.reviewedPartners,partnerRelationships,name=>!!logoFor(name),mappedLocations,data.partnerProfiles):null;
  const entities=isAll&&graphStore?graphStore.search(state.query,Math.max(100,graphStore.graph.entities.length)).filter(item=>state.entityKind==='all'||item.kind===state.entityKind):[];
  const result=isAll?{total:entities.length,rows:entities.slice(0,visible)}:isPartners?{total:leads.length,rows:leads.slice(0,visible)}:opportunityRows(data.opportunities,state,saved,visible);
  const shown=result.rows, total=result.total;
  if (!isAll || !shown.some(item=>item.id===inspectedEntity)) inspectedEntity='';
  document.querySelector('.filters').hidden=isPartners||isAll;
  byId('entity-filter').hidden=!isAll;
  byId('partner-filter-controls').hidden=!isPartners;
  document.querySelector('.directory-layout').classList.toggle('partner-view',isPartners);
  document.querySelector('.directory-layout').classList.toggle('all-view',isAll);
  byId('directory-inspector').hidden=!isAll;
  byId('entity-columns').hidden=!isAll || !total;
  byId('directory-note').innerHTML=isAll?'<span aria-hidden="true">✳</span><p>Explore sourced profiles and connections. Some partner entries are research leads awaiting verification.</p>':isPartners?'<span aria-hidden="true">✳</span><p>Some names come from a historical screenshot and need verification. <strong>Provider-listed</strong> identifies a cited provider listing. Self-reported relationships are identified separately; neither guarantees access or credits. Mapped countries represent selected offices or programme locations, not geographic eligibility.</p>':'<span aria-hidden="true">✳</span><p>Locations marked <strong>to verify</strong> have no confirmed country eligibility in this research. An award is never guaranteed.</p>';
  byId('result-title').textContent=isAll?'ALL OF THE ATLAS':isPartners?'PARTNER INDEX':state.view==='saved'?'SAVED OPPORTUNITIES':'RESEARCHED OPPORTUNITIES';
  byId('result-count').textContent=isAll&&!graphStore?'Unavailable':`${total} ${total===1?'result':'results'}`;
  byId('graph-search-shortcut').href='./graph.html'+(state.query?'?q='+encodeURIComponent(state.query):'');
  byId('graph-search-shortcut').textContent='Explore the graph ↗';
  byId('result-columns').hidden=isAll || isPartners || !total;
  byId('saved-count').textContent=String(saved.size);
  byId('sort').disabled=isPartners||isAll;
  document.querySelector('.sort-label').hidden=isPartners||isAll;
  byId('results-list').setAttribute('aria-busy','false');
  if (isAll&&!graphStore) {
    byId('results-list').innerHTML='<div class="empty-state"><h3>Atlas search is unavailable</h3><p>You can still browse the Opportunities and Partner index tabs.</p></div>';
  } else if (!total) {
    const noSaved=state.view==='saved' && !saved.size;
    const explanation=noSaved?'Save an opportunity with its heart button to find it here later.':'Try another search or clear your filters to see more results.';
    byId('results-list').innerHTML=`<div class="empty-state"><h3>${noSaved?'Nothing saved yet':'No matches found'}</h3><p>${explanation}</p><div class="empty-state-actions"><button type="button" id="empty-action">${noSaved?'Browse opportunities':'Clear search and filters'}</button></div></div>`;
    byId('empty-action').addEventListener('click',()=>{update({...defaults,view:noSaved?'opportunities':state.view});controls.search.focus();});
  } else byId('results-list').innerHTML=shown.map((item,i)=>isAll?renderEntity(item):isPartners?renderLead(item):renderCard(item,i)).join('');
  byId('result-range').textContent=total ? `Showing ${shown.length} of ${total} results` : '';
  byId('load-more').hidden=visible>=total;
  byId('load-more').textContent=`Load more · ${Math.min(12,total-visible)} of ${total-visible} remaining ↓`;
  byId('results-list').querySelectorAll('[data-save]').forEach(button=>button.addEventListener('click',()=>save(button.dataset.save)));
  byId('results-list').querySelectorAll('.company-logo').forEach(image=>image.addEventListener('error',()=>{image.closest('.avatar')?.classList.remove('has-logo');image.remove();}));
  byId('results-list').querySelectorAll('.entity-row-image').forEach(image=>image.addEventListener('error',()=>{image.closest('.entity-row-mark')?.classList.remove('has-logo');image.remove();}));
  byId('results-list').querySelectorAll('[data-related]').forEach(button=>button.addEventListener('click',()=>{update({...defaults,query:button.dataset.related});controls.search.focus();}));
  if(isAll) inspectEntity(inspectedEntity);
  writeUrl();
}
function update(partial){Object.assign(state,partial);visible=12;render();}
const viewButtons=[...document.querySelectorAll('[data-view]')];
window.addEventListener('atlas:find-partner',event=>{
  const name=event.detail?.name;
  if (typeof name!=='string' || !data?.partnerLeads.includes(name)) return;
  update({...defaults,view:'partners',query:name});
  byId('directory').scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
  controls.search.focus({preventScroll:true});
});
for (const button of viewButtons) {
  button.addEventListener('click',()=>update({view:button.dataset.view}));
  button.addEventListener('keydown',event=>{
    const index=viewButtons.indexOf(button); let next;
    if (event.key==='ArrowRight') next=(index+1)%viewButtons.length;
    else if (event.key==='ArrowLeft') next=(index+viewButtons.length-1)%viewButtons.length;
    else if (event.key==='Home') next=0;
    else if (event.key==='End') next=viewButtons.length-1;
    else return;
    event.preventDefault(); update({view:viewButtons[next].dataset.view}); viewButtons[next].focus();
  });
}
controls.search.addEventListener('input',event=>{if (!event.isComposing) update({query:event.target.value});});
controls.search.addEventListener('compositionend',event=>update({query:event.target.value}));
controls.entityKind.addEventListener('change',event=>update({entityKind:event.target.value}));
controls.country.addEventListener('change',event=>update({country:event.target.value}));
controls.includeUnknown.addEventListener('change',event=>update({includeUnknown:event.target.checked}));
controls.kind.addEventListener('change',event=>update({kind:event.target.value}));
controls.access.addEventListener('change',event=>update({access:event.target.value}));
controls.sort.addEventListener('change',event=>update({sort:event.target.value}));
controls.partnerCountry.addEventListener('change',event=>update({partnerCountry:event.target.value}));
controls.partnerProvider.addEventListener('change',event=>update({partnerProvider:event.target.value}));
controls.partnerEvidence.addEventListener('change',event=>update({partnerEvidence:event.target.value}));
controls.partnerLogo.addEventListener('change',event=>update({partnerLogo:event.target.checked}));
byId('reset-filters').addEventListener('click',()=>update({...defaults,view:state.view}));
byId('active-filter-chips').addEventListener('click',event=>{
  const button=event.target.closest('[data-remove-filter]'); if (!button) return;
  const key=button.dataset.removeFilter;
  if (!['entityKind','country','includeUnknown','kind','access','partnerProvider','partnerEvidence','partnerLogo','partnerCountry'].includes(key)) return;
  update({[key]:defaults[key]}); focusFacet(key);
});
byId('clear-active-filters').addEventListener('click',()=>{const partnerView=state.view==='partners',allView=state.view==='all'; update(allView?{entityKind:'all'}:partnerView?{partnerProvider:'all',partnerEvidence:'all',partnerLogo:false,partnerCountry:'all'}:{country:'all',includeUnknown:false,kind:'all',access:'all'}); focusFacet(allView?'entityKind':partnerView?'partnerProvider':'country');});
byId('load-more').addEventListener('click',()=>{visible+=12;render();});
byId('results-list').addEventListener('click',event=>{const button=event.target.closest('[data-inspect-entity]');if(button&&graphStore)inspectEntity(button.dataset.inspectEntity===inspectedEntity?'':button.dataset.inspectEntity,{moveFocus:true});});
const visibleFromUrl=()=>{const value=Number(new URLSearchParams(location.search).get('shown'));return Number.isInteger(value)&&value>12?Math.min(value,1200):12;};
window.addEventListener('popstate',()=>{state=stateFromUrl();visible=visibleFromUrl();render();});
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
  render();
} catch {
  byId('results-list').setAttribute('aria-busy','false');
  byId('results-list').innerHTML='<div class="error"><strong>The catalogue could not be loaded.</strong> Check your connection and reload this page.</div>';
  byId('result-count').textContent='Unavailable';
}
