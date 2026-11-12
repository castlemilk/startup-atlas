import { marketNames, escapeHtml as esc, sourceUrl, marketLabel, filterOpportunities, filterLeads } from './logic.js';
import { logoFor, logoClassFor } from './logos.js?v=2';
import { partnerRelationships } from './relationships.js';

// The directory stays usable if an older browser cannot load the table model.
let opportunityRows=(items,state,saved,visible)=>{
  const rows=filterOpportunities(items,state,saved);
  return {total:rows.length,rows:rows.slice(0,visible)};
};
try { ({opportunityRows}=await import('./table-model.js')); }
catch(error) { console.warn('Table model unavailable; using the built-in directory view.',error); }

const byId = id => document.getElementById(id);
const controls = { search: byId('search'), country: byId('country'), includeUnknown: byId('include-unknown'), kind: byId('kind'), access: byId('access'), sort: byId('sort'), partnerCountry: byId('partner-country'), partnerProvider: byId('partner-provider'), partnerEvidence: byId('partner-evidence'), partnerLogo: byId('partner-logo') };
const defaults = { view:'opportunities', query:'', country:'all', includeUnknown:false, kind:'all', access:'all', sort:'recommended', partnerCountry:'all', partnerProvider:'all', partnerEvidence:'all', partnerLogo:false };
let state = { ...defaults }, data = null, visible = 12;
let saved = new Set();
try { const stored = JSON.parse(localStorage.getItem('startup-atlas-saved') || '[]'); if (Array.isArray(stored)) saved = new Set(stored.filter(x => typeof x === 'string')); } catch { /* Browsing remains available without storage. */ }


// Map locations are curated office/programme evidence, not eligibility.
let mappedLocations=null;
try {
  const response=await fetch('./data/map-locations.json',{cache:'no-cache'});
  const locations=response.ok?await response.json():null;
  if (!Array.isArray(locations)) throw new Error('Invalid locations');
  mappedLocations=locations;
  for (const country of [...new Set(locations.map(x=>x.country).filter(x=>typeof x==='string' && x))].sort()) {
    controls.partnerCountry.add(new Option(country,country));
  }
} catch {
  controls.partnerCountry.disabled=true;
  controls.partnerCountry.options[0].textContent='Countries unavailable';
}
/* Gamma-inspired single-choice menus with visible option icons. */
const facetLabels={country:['🌏','Market'],kind:['✦','Resource'],access:['↗','Access'],partnerCountry:['🌍','Country'],partnerProvider:['🏢','Provider'],partnerEvidence:['🔎','Evidence']};
const facetOptionIcons={
  country:{all:'🌍',AU:'🇦🇺',NZ:'🇳🇿',US:'🇺🇸',GB:'🇬🇧',CA:'🇨🇦',IN:'🇮🇳',SG:'🇸🇬',JP:'🇯🇵',KR:'🇰🇷',BR:'🇧🇷',ZA:'🇿🇦',FR:'🇫🇷'},
  kind:{all:'✦','AI model credits':'✨','Cloud credits':'☁️','GPU & inference':'⚡','Developer tools':'🛠️','Data & analytics':'📊','Business tools':'🧰','Founder programmes':'🚀','Funding finders':'💰'},
  access:{all:'✦',Direct:'↗','Partner referral':'🤝',Community:'👥',Investment:'💼'},
  partnerCountry:{all:'🌍',unmapped:'📍',Australia:'🇦🇺','United States':'🇺🇸','United Kingdom':'🇬🇧',France:'🇫🇷',Singapore:'🇸🇬'},partnerProvider:{all:'🌐'},partnerEvidence:{all:'✦',official:'🔗',screenshot:'📷',self_report:'💬',reviewed:'✓'}
};
function facetOptionIcon(key,value) {
  const providerName=key==='partnerProvider'?({AWS:'Amazon Web Services',Vercel:'Vercel',Microsoft:'Microsoft'}[value]):null;
  const logo=providerName && logoFor(providerName);
  return logo?`<img class="facet-option-logo" src="${esc(logo)}" alt="">`:`<span class="facet-option-symbol" aria-hidden="true">${esc(facetOptionIcons[key]?.[value] || '✦')}</span>`;
}
const facetPopovers=new Map();
for (const [key,[icon,label]] of Object.entries(facetLabels)) {
  const select=controls[key], details=document.createElement('details');
  details.className='facet-picker'; details.dataset.facet=key; if(select.disabled) details.dataset.disabled='true';
  const summary=document.createElement('summary');
  summary.innerHTML=`<span class="facet-icon" aria-hidden="true">${icon}</span><span class="facet-label">${label}</span><span class="facet-value"></span><span class="facet-chevron" aria-hidden="true"></span>`;
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
  const view = params.get('view'); if (['opportunities','partners','saved'].includes(view)) s.view = view;
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
  if (state.view !== defaults.view) params.set('view',state.view);
  if (state.query) params.set('q',state.query);
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
  controls.search.value=state.query; controls.country.value=state.country; controls.includeUnknown.checked=state.includeUnknown;
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
  if (state.view==='partners') {
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
  return `<article class="card opportunity-row"><div class="identity row-identity">${avatarFor(item.org,index%3===1?'alt':'')}<div><h3>${esc(item.name)}</h3><div class="provider">${esc(item.org)}</div><p class="card-summary">${esc(item.summary)}</p></div></div><div class="row-resource"><span class="row-label">Resource</span>${badge(item.kind,'neutral',resourceColors[item.kind]||'other')}<small>${esc(item.access)}</small></div><div class="row-market"><span class="row-label">Location</span>${badge(marketLabel(item.scope),locationTone)}</div><div class="row-benefit"><span class="row-label">Benefit</span><strong>${esc(item.value)}</strong></div><div class="row-source"><span class="row-label">Status &amp; source</span><span>${esc(item.status)}</span>${primary?`<a href="${esc(primary)}" target="_blank" rel="noopener noreferrer" aria-label="Official source for ${esc(item.name)} (opens in a new tab)">Source</a>`:''}<small>Checked ${esc(item.checked)}</small></div><button class="save" type="button" data-save="${esc(item.id)}" aria-pressed="${savedItem}" aria-label="${savedItem?'Remove':'Save'} ${esc(item.name)}${savedItem?' from':' to'} saved opportunities">${savedItem?'♥':'♡'}</button><details><summary>Eligibility and conditions</summary><div class="details-body">${facts?`<dl class="fact-grid">${facts}</dl>`:''}<p><strong>Who it’s for.</strong> ${esc(item.eligibility)}</p><p><strong>Read the fine print.</strong> ${esc(item.limits)}</p><div class="sources">${links}</div><div class="checked">Research snapshot · ${esc(item.checked)}</div></div></details></article>`;
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
function render() {
  if (!data) return;
  syncControls();
  renderActiveFilters();
  const isPartners=state.view==='partners';
  const leads=isPartners?filterLeads(data.partnerLeads,state,data.reviewedPartners,partnerRelationships,name=>!!logoFor(name),mappedLocations,data.partnerProfiles):null;
  const result=isPartners?{total:leads.length,rows:leads.slice(0,visible)}:opportunityRows(data.opportunities,state,saved,visible);
  const shown=result.rows, total=result.total;
  document.querySelector('.filters').hidden=isPartners;
  byId('partner-filter-controls').hidden=!isPartners;
  document.querySelector('.directory-layout').classList.toggle('partner-view',isPartners);
  byId('directory-note').innerHTML=isPartners?'<span aria-hidden="true">✳</span><p>Some names come from a historical screenshot and need verification. <strong>Provider-listed</strong> identifies a cited provider listing. Self-reported relationships are identified separately; neither guarantees access or credits. Mapped countries represent selected offices or programme locations, not geographic eligibility.</p>':'<span aria-hidden="true">✳</span><p>Locations marked <strong>to verify</strong> have no confirmed country eligibility in this research. An award is never guaranteed.</p>';
  byId('result-title').textContent=isPartners?'PARTNER INDEX':state.view==='saved'?'SAVED OPPORTUNITIES':'RESEARCHED OPPORTUNITIES';
  byId('result-count').textContent=`${total} ${total===1?'result':'results'}`;
  byId('result-columns').hidden=isPartners || !total;
  byId('saved-count').textContent=String(saved.size);
  byId('sort').disabled=isPartners;
  byId('results-list').setAttribute('aria-busy','false');
  if (!total) {
    const noSaved=state.view==='saved' && !saved.size;
    const explanation=noSaved?'Save an opportunity with its heart button to find it here later.':'Try another search or clear your filters to see more results.';
    byId('results-list').innerHTML=`<div class="empty-state"><h3>${noSaved?'Nothing saved yet':'No matches found'}</h3><p>${explanation}</p><div class="empty-state-actions"><button type="button" id="empty-action">${noSaved?'Browse opportunities':'Clear search and filters'}</button></div></div>`;
    byId('empty-action').addEventListener('click',()=>{update({...defaults,view:noSaved?'opportunities':state.view});controls.search.focus();});
  } else byId('results-list').innerHTML=shown.map((item,i)=>isPartners?renderLead(item):renderCard(item,i)).join('');
  byId('load-more').hidden=visible>=total;
  byId('load-more').textContent=`Load more · ${Math.min(12,total-visible)} of ${total-visible} remaining ↓`;
  byId('results-list').querySelectorAll('[data-save]').forEach(button=>button.addEventListener('click',()=>save(button.dataset.save)));
  byId('results-list').querySelectorAll('.company-logo').forEach(image=>image.addEventListener('error',()=>{image.closest('.avatar')?.classList.remove('has-logo');image.remove();}));
  byId('results-list').querySelectorAll('[data-related]').forEach(button=>button.addEventListener('click',()=>{update({...defaults,query:button.dataset.related});controls.search.focus();}));
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
byId('clear-search').addEventListener('click',()=>{update({query:''});controls.search.focus();});
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
  if (!['country','includeUnknown','kind','access','partnerProvider','partnerEvidence','partnerLogo','partnerCountry'].includes(key)) return;
  update({[key]:defaults[key]}); focusFacet(key);
});
byId('clear-active-filters').addEventListener('click',()=>{const partnerView=state.view==='partners'; update(partnerView?{partnerProvider:'all',partnerEvidence:'all',partnerLogo:false,partnerCountry:'all'}:{country:'all',includeUnknown:false,kind:'all',access:'all'}); focusFacet(partnerView?'partnerProvider':'country');});
byId('load-more').addEventListener('click',()=>{visible+=12;render();});
window.addEventListener('popstate',()=>{state=stateFromUrl();visible=12;render();});
state=stateFromUrl(); syncControls();
try {
  const [response,reviewedResponse,profileResponse]=await Promise.all([fetch('./data/catalogue.json',{cache:'no-cache'}),fetch('./data/partners-reviewed.json',{cache:'no-cache'}).catch(()=>null),fetch('./data/partner-profiles.json',{cache:'no-cache'}).catch(()=>null)]);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  data=await response.json();
  try {
    const reviewed=reviewedResponse?.ok ? await reviewedResponse.json() : {};
    data.reviewedPartners=reviewed && typeof reviewed==='object' && !Array.isArray(reviewed) ? reviewed : {};
  }
  catch { data.reviewedPartners={}; }
  try { data.partnerProfiles=profileResponse?.ok ? await profileResponse.json() : {}; } catch { data.partnerProfiles={}; }
  if (!Array.isArray(data.opportunities) || !Array.isArray(data.partnerLeads)) throw new Error('Invalid catalogue');
  byId('opportunity-count').textContent=data.opportunities.length;
  byId('opportunity-tab-count').textContent=data.opportunities.length;
  byId('lead-count').textContent=data.partnerLeads.length;
  byId('partner-tab-count').textContent=data.partnerLeads.length;
  const markets=new Set(data.opportunities.flatMap(item=>item.scope).filter(code=>code!=='WORLD'&&code!=='UNKNOWN'));
  byId('country-count').textContent=markets.size;
  render();
} catch {
  byId('results-list').setAttribute('aria-busy','false');
  byId('results-list').innerHTML='<div class="error"><strong>The catalogue could not be loaded.</strong> Check your connection and reload this page.</div>';
  byId('result-count').textContent='Unavailable';
}
