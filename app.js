import { marketNames, escapeHtml as esc, sourceUrl, marketLabel, filterOpportunities, filterLeads } from './logic.js';
import { logoFor } from './logos.js';

const byId = id => document.getElementById(id);
const controls = { search: byId('search'), country: byId('country'), includeUnknown: byId('include-unknown'), kind: byId('kind'), access: byId('access'), sort: byId('sort') };
const defaults = { view:'opportunities', query:'', country:'all', includeUnknown:false, kind:'all', access:'all', sort:'recommended' };
let state = { ...defaults }, data = null, visible = 12;
let saved = new Set();
try { const stored = JSON.parse(localStorage.getItem('startup-atlas-saved') || '[]'); if (Array.isArray(stored)) saved = new Set(stored.filter(x => typeof x === 'string')); } catch { /* Browsing remains available without storage. */ }

function stateFromUrl() {
  const params = new URLSearchParams(location.search);
  const s = { ...defaults, query:params.get('q') || '' };
  const view = params.get('view'); if (['opportunities','partners','saved'].includes(view)) s.view = view;
  const country = params.get('country'); if (country && (country === 'all' || Object.hasOwn(marketNames,country))) s.country = country;
  for (const name of ['kind','access','sort']) {
    const value = params.get(name); if (value && [...controls[name].options].some(option => option.value === value)) s[name] = value;
  }
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
  const suffix = params.toString();
  history.replaceState(null,'',`${location.pathname}${suffix ? `?${suffix}` : ''}${location.hash}`);
}
function syncControls() {
  controls.search.value=state.query; controls.country.value=state.country; controls.includeUnknown.checked=state.includeUnknown;
  controls.kind.value=state.kind; controls.access.value=state.access; controls.sort.value=state.sort;
  byId('clear-search').hidden=!state.query;
  document.querySelectorAll('[data-view]').forEach(button => {
    const active=button.dataset.view===state.view; button.classList.toggle('active',active); button.setAttribute('aria-selected',String(active)); button.tabIndex=active?0:-1;
  });
  byId('directory-panel').setAttribute('aria-labelledby',`tab-${state.view}`);
}
function renderActiveFilters() {
  const filters=[];
  if (state.country!=='all') filters.push({key:'country',label:'Market',value:marketNames[state.country] || state.country});
  if (state.includeUnknown) filters.push({key:'includeUnknown',label:'Location',value:'Include locations to verify'});
  if (state.kind!=='all') filters.push({key:'kind',label:'Resource',value:state.kind});
  if (state.access!=='all') filters.push({key:'access',label:'Pathway',value:state.access});
  byId('active-filter-bar').hidden=state.view==='partners' || !filters.length;
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
  return `<span class="avatar ${variant} ${logo?'has-logo':''}" aria-hidden="true"><span class="avatar-initials">${esc(initials)}</span>${logo?`<img class="company-logo" src="${esc(logo)}" alt="" loading="lazy" decoding="async">`:''}</span>`;
}
function badge(label,tone='neutral') {
  return `<span class="badge" data-tone="${tone}" data-variant="soft" data-size="md"><span class="badge-label">${esc(label)}</span></span>`;
}
function renderCard(item,index) {
  const savedItem=saved.has(item.id);
  const links=[item.url,...item.extra].map((url,i)=>{ const href=sourceUrl(url); return href ? `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${i===0?'Official source':'More terms'} ↗</a>` : ''; }).join('');
  const locationTone=item.scope.includes('UNKNOWN')?'warning':'neutral';
  const facts=Object.entries(item.facts || {}).map(([label,value])=>`<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join('');
  return `<article class="card"><div class="card-top"><div class="identity">${avatarFor(item.org,index%3===1?'alt':'')}<div><h3>${esc(item.name)}</h3><div class="provider">${esc(item.org)} · ${esc(item.status)}</div></div></div><button class="save" type="button" data-save="${esc(item.id)}" aria-pressed="${savedItem}" aria-label="${savedItem?'Remove':'Save'} ${esc(item.name)}${savedItem?' from':' to'} saved opportunities">${savedItem?'♥':'♡'}</button></div><div class="value">${esc(item.value)}</div><p class="card-summary">${esc(item.summary)}</p><div class="tags">${badge(item.kind)}${badge(item.access,'accent')}${badge(marketLabel(item.scope),locationTone)}</div><details><summary>Eligibility and conditions</summary><div class="details-body">${facts?`<dl class="fact-grid">${facts}</dl>`:''}<p><strong>Who it’s for.</strong> ${esc(item.eligibility)}</p><p><strong>Read the fine print.</strong> ${esc(item.limits)}</p><div class="sources">${links}</div><div class="checked">Research snapshot · ${esc(item.checked)}</div></div></details></article>`;
}
function renderLead(name) {
  const related=data.relatedPartners?.[name];
  const reviewed=Object.hasOwn(data.reviewedPartners || {},name)?data.reviewedPartners[name]:null;
  const description=reviewed?(reviewed.site_description || reviewed.description || 'Identity reviewed; provider relationships and credit access require separate verification.'):(related?'A related entry has been researched. Membership, investment and credit access have separate requirements.':'Identity, location and any provider relationship require verification.');
  const action=related?`<button type="button" class="related-link" data-related="${esc(related)}">See related research →</button>`:'';
  const website=reviewed && sourceUrl(reviewed.site_source || reviewed.website); const source=reviewed && sourceUrl(reviewed.source);
  const links=reviewed?`<div class="lead-sources">${website?`<a href="${esc(website)}" target="_blank" rel="noopener noreferrer">Website source ↗</a>`:''}${source?`<a href="${esc(source)}" target="_blank" rel="noopener noreferrer">Identity source ↗</a>`:''}</div>`:'';
  return `<article class="card lead-card"><div class="identity">${avatarFor(name,'alt')}<div><h3>${esc(name)}</h3><div class="provider">Partner index · research lead</div></div></div><p class="card-summary">${esc(description)}</p><div class="tags">${badge(reviewed?'Identity reviewed':related?'Research available':'Not assessed',(related||reviewed)?'accent':'warning')}${badge('Relationship to verify')}</div>${links}${action}</article>`;
}
function render() {
  if (!data) return;
  syncControls();
  renderActiveFilters();
  const isPartners=state.view==='partners';
  const list=isPartners?filterLeads(data.partnerLeads,state,data.reviewedPartners):filterOpportunities(data.opportunities,state,saved);
  const shown=list.slice(0,visible);
  document.querySelector('.filters').hidden=isPartners;
  document.querySelector('.directory-layout').classList.toggle('partner-view',isPartners);
  byId('directory-note').innerHTML=isPartners?'<span aria-hidden="true">✳</span><p>These names came from an earlier source list. <strong>They are discovery leads, not verified provider partners.</strong> Open related research where available; other names still need assessment.</p>':'<span aria-hidden="true">✳</span><p>Locations marked <strong>to verify</strong> have no confirmed country eligibility in this research. An award is never guaranteed.</p>';
  byId('result-title').textContent=isPartners?'PARTNER INDEX':state.view==='saved'?'SAVED OPPORTUNITIES':'RESEARCHED OPPORTUNITIES';
  byId('result-count').textContent=`${list.length} ${list.length===1?'result':'results'}`;
  byId('saved-count').textContent=String(saved.size);
  byId('sort').disabled=isPartners;
  byId('results-list').setAttribute('aria-busy','false');
  if (!list.length) {
    const noSaved=state.view==='saved' && !saved.size;
    const explanation=noSaved?'Save an opportunity with its heart button to find it here later.':'Try another search or clear your filters to see more results.';
    byId('results-list').innerHTML=`<div class="empty-state"><h3>${noSaved?'Nothing saved yet':'No matches found'}</h3><p>${explanation}</p><div class="empty-state-actions"><button type="button" id="empty-action">${noSaved?'Browse opportunities':'Clear search and filters'}</button></div></div>`;
    byId('empty-action').addEventListener('click',()=>{update({...defaults,view:noSaved?'opportunities':state.view});controls.search.focus();});
  } else byId('results-list').innerHTML=shown.map((item,i)=>isPartners?renderLead(item):renderCard(item,i)).join('');
  byId('load-more').hidden=visible>=list.length;
  byId('load-more').textContent=`Load more · ${Math.min(12,list.length-visible)} of ${list.length-visible} remaining ↓`;
  byId('results-list').querySelectorAll('[data-save]').forEach(button=>button.addEventListener('click',()=>save(button.dataset.save)));
  byId('results-list').querySelectorAll('.company-logo').forEach(image=>image.addEventListener('error',()=>{image.closest('.avatar')?.classList.remove('has-logo');image.remove();}));
  byId('results-list').querySelectorAll('[data-related]').forEach(button=>button.addEventListener('click',()=>{update({...defaults,query:button.dataset.related});controls.search.focus();}));
  writeUrl();
}
function update(partial){Object.assign(state,partial);visible=12;render();}
const viewButtons=[...document.querySelectorAll('[data-view]')];
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
byId('reset-filters').addEventListener('click',()=>update({...defaults,view:state.view}));
byId('active-filter-chips').addEventListener('click',event=>{
  const button=event.target.closest('[data-remove-filter]'); if (!button) return;
  const key=button.dataset.removeFilter;
  if (!['country','includeUnknown','kind','access'].includes(key)) return;
  update({[key]:defaults[key]}); controls[key].focus();
});
byId('clear-active-filters').addEventListener('click',()=>{update({country:'all',includeUnknown:false,kind:'all',access:'all'});controls.country.focus();});
byId('load-more').addEventListener('click',()=>{visible+=12;render();});
window.addEventListener('popstate',()=>{state=stateFromUrl();visible=12;render();});
state=stateFromUrl(); syncControls();
try {
  const [response,reviewedResponse]=await Promise.all([fetch('./data/catalogue.json'),fetch('./data/partners-reviewed.json').catch(()=>null)]);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  data=await response.json();
  try {
    const reviewed=reviewedResponse?.ok ? await reviewedResponse.json() : {};
    data.reviewedPartners=reviewed && typeof reviewed==='object' && !Array.isArray(reviewed) ? reviewed : {};
  }
  catch { data.reviewedPartners={}; }
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
