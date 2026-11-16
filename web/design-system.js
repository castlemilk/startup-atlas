import { escapeHtml as esc, sourceUrl } from './logic.js';
import { openGraph } from './graph-store.js';
import { entityHref } from './graph-model.js';
import { makeView } from './treemap-model.js';
import { entityBadge, icon, renderEntityRow } from './atlas-ui.js';
import { mountComponentWorkbench } from './design-workbench.js';
import { mountTokenReference } from './design-token-reference.js';
import { mountDesignRecipes } from './design-recipes.js';

const $ = id => document.getElementById(id);
mountComponentWorkbench($('component-workbench'));
mountTokenReference($('token-reference'));
mountDesignRecipes($('layout-recipes'));
const sectionLinks=[...document.querySelectorAll('.ds-sidebar nav a')];
const sections=sectionLinks.map(link=>({link,section:document.querySelector(link.hash)})).filter(item=>item.section);
let sectionFrame=0;
function queueSectionNavigation() {
  if(sectionFrame)return;
  sectionFrame=requestAnimationFrame(()=>{
    sectionFrame=0;
    // Re-evaluate every heading after jumps or expanding specimens. Intersection
    // entries only describe changed targets and can retain a previous section.
    const marker=Math.min(220,innerHeight*.25);
    let active=sections[0];
    for(const item of sections){if(item.section.getBoundingClientRect().top<=marker)active=item;}
    for(const item of sections){if(item===active)item.link.setAttribute('aria-current','location');else item.link.removeAttribute('aria-current');}
  });
}
window.addEventListener('scroll',queueSectionNavigation,{passive:true});
window.addEventListener('resize',queueSectionNavigation);
window.addEventListener('hashchange',queueSectionNavigation);
window.addEventListener('pageshow',queueSectionNavigation);
if('ResizeObserver' in window)new ResizeObserver(queueSectionNavigation).observe(document.querySelector('.ds-content'));
queueSectionNavigation();
const patterns = {
  search: {
    route:'./?type=startup#directory', title:'List and search view preview', caption:'Live directory · startup records',
    question:'Which entities should I explore?', purpose:'Search across startups, people, partners, providers and programmes, then follow a result into its profile or graph.',
    interaction:'Type a name or phrase, narrow by entity type and load more results. Opening a profile keeps a route back to the search.',
    contract:'Results describe the researched snapshot. A matching name or logo does not verify an organisation or relationship.',
    next:'Add a side inspector and richer structured facets as the sourced fields become available.'
  },
  treemap: {
    route:'./treemap.html?metric=funding&currency=USD', title:'Treemap view preview', caption:'Live treemap · recorded USD funding announcements',
    question:'How does the researched set compare?', purpose:'Compare a defined measure, inspect its source and switch to a ranked list when a tile is too small to read.',
    interaction:'Change metric, currency or founding-decade grouping. Select a tile to inspect its announcement, then open the company profile.',
    contract:'Area is linear. Monetary observations use one currency. Dates remain visible; an unknown is excluded and counted, never assigned zero.',
    next:'Add source-backed sector and region grouping after the structured data and non-overlapping grouping rules are established.'
  },
  graph: {
    route:'./graph.html?entity=startup%3Acanva&depth=2', title:'Relationship graph view preview', caption:'Live graph · Canva and its sourced connections',
    question:'How are these entities connected?', purpose:'Follow founders, portfolio listings, team memberships and programmes through a bounded relationship neighbourhood.',
    interaction:'Select a node to inspect without moving the map. Explore from here reroots it. Drag or use arrow keys to arrange nodes; Fit view preserves their positions.',
    contract:'Every edge has a recorded predicate and evidence. The inspector can show off-map entities; limited neighbourhoods disclose their bounds.',
    next:'Add deliberate branch expansion and saved graph arrangements without losing the distinction between selection and graph root.'
  },
  startup: {
    route:'./entity.html?id=startup%3Acanva', title:'Startup explorer preview', caption:'Live startup explorer · Canva',
    question:'Who built this company, and what is known?', purpose:'Start with the founders, then inspect company facts, funding announcements, connected organisations and their sources.',
    interaction:'Use the section navigation, follow a founder into other researched ventures, or open the same company in the graph.',
    contract:'Facts keep their sources and review dates. Historical funding events are not current valuations; missing research remains explicit.',
    next:'Add a richer dated company timeline, products and acquisitions once those relationships have source-backed records.'
  },
  partner: {
    route:'./partner.html?name=Airtree', title:'Partner and VC explorer preview', caption:'Live partner explorer · Airtree',
    question:'Whom does this organisation support?', purpose:'Explore the researched company sample, people and roles, programme relationships and source coverage.',
    interaction:'Open a researched company or team member, follow a programme relationship, or enter the organisation’s graph.',
    contract:'Use the recorded organisation type. A company sample is not a full portfolio; a listing does not establish a funding-round investment.',
    next:'Add portfolio list, treemap and graph lenses plus sourced investment thesis and fund details, keeping firms, funds and programmes distinct.'
  }
};
const tabs = [...document.querySelectorAll('[data-pattern]')];
function showPattern(key, write = true) {
  const pattern = patterns[key] || patterns.search;
  for (const tab of tabs) { const active=tab.dataset.pattern===key; tab.setAttribute('aria-selected',String(active)); tab.tabIndex=active?0:-1; }
  $('view-pattern').setAttribute('aria-labelledby','pattern-'+key);
  for (const property of ['question','purpose','interaction','contract','next','caption']) $('pattern-'+property).textContent=pattern[property];
  $('pattern-open').href=pattern.route;
  const url=new URL(pattern.route,location.href); url.searchParams.set('embed','1');
  const preview=$('view-preview');
  // Selecting the active pattern keeps its current search and inspection state.
  if(new URL(preview.getAttribute('src'),location.href).href!==url.href) preview.src=url.pathname+url.search+url.hash;
  preview.title=pattern.title;
  if(write) { const url=new URL(location.href); url.searchParams.set('pattern',key); history.replaceState(null,'',url.pathname+url.search+url.hash); }
}
for(const tab of tabs) {
  tab.addEventListener('click',()=>showPattern(tab.dataset.pattern));
  tab.addEventListener('keydown',event=>{
    let next;
    const index=tabs.indexOf(tab);
    if(event.key==='ArrowRight')next=(index+1)%tabs.length;
    if(event.key==='ArrowLeft')next=(index-1+tabs.length)%tabs.length;
    if(event.key==='Home')next=0;
    if(event.key==='End')next=tabs.length-1;
    if(next!==undefined){event.preventDefault();tabs[next].focus();showPattern(tabs[next].dataset.pattern);}
  });
}
function showDevice(device, write=true) {
  $('preview-stage').dataset.device=device;
  for(const button of document.querySelectorAll('[data-device]'))button.setAttribute('aria-pressed',String(button.dataset.device===device));
  if(write){const url=new URL(location.href);if(device==='mobile')url.searchParams.set('device',device);else url.searchParams.delete('device');history.replaceState(null,'',url.pathname+url.search+url.hash);}
}
document.querySelectorAll('[data-device]').forEach(button=>button.addEventListener('click',()=>showDevice(button.dataset.device)));
const params=new URLSearchParams(location.search);
if(params.has('pattern'))showPattern(Object.hasOwn(patterns,params.get('pattern'))?params.get('pattern'):'search',false);
if(params.get('device')==='mobile')showDevice('mobile',false);
window.addEventListener('popstate',()=>{
  const state=new URLSearchParams(location.search);
  showPattern(Object.hasOwn(patterns,state.get('pattern'))?state.get('pattern'):'search',false);
  showDevice(state.get('device')==='mobile'?'mobile':'desktop',false);
});
$('pattern-open').innerHTML='Open full view '+icon('external');
const swatches=[['Forest ink','--atlas-ink'],['Canvas','--atlas-canvas'],['Paper','--atlas-paper'],['Surface','--atlas-surface'],['Quiet border','--atlas-border'],['Accent','--atlas-accent']];
const styles=getComputedStyle(document.documentElement);
$('token-palette').innerHTML=swatches.map(([label,token])=>`<figure class="ds-swatch"><span class="ds-swatch-color" style="--swatch:var(${token})"></span><figcaption><strong>${label}</strong><code>${esc(styles.getPropertyValue(token).trim())}</code></figcaption></figure>`).join('');
$('entity-badges').innerHTML=['startup','person','partner','provider','programme'].map(entityBadge).join('');

function showState(state) {
  const specimens={
    ready:'<h3>Research is available.</h3><p>The specimen has recovered. Keep the next action visible and preserve the exploration context.</p><a class="atlas-button" href="./?type=startup#directory">Browse startup records</a>',
    empty:'<h3>No companies match this search.</h3><p>Try another name or clear the active filters. The wider research snapshot is still available.</p><button class="atlas-button" type="button" data-reset-specimen>Clear specimen filters</button>',
    partial:'<h3>Some research is unavailable.</h3><p>The profile is available, but the company sample could not be loaded. An unavailable dataset does not mean there are no companies.</p><span class="atlas-badge" data-tone="warning">Partial data</span>',
    error:'<h3>The research snapshot could not be loaded.</h3><p>Keep the search context visible and offer a clear way to retry.</p><button class="atlas-button" type="button" data-reset-specimen>Retry specimen</button>',
    loading:'<h3>Loading the research snapshot…</h3><p>The content area keeps its space while the selected view loads.</p><span class="ds-loader" aria-hidden="true"></span><p class="atlas-coverage">Loading-state specimen. This does not make a network request.</p>'
  };
  $('state-specimen').innerHTML=`<div class="atlas-empty">${specimens[state]}</div>`;
  document.querySelectorAll('[data-state]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.state===state)));
}
document.querySelectorAll('[data-state]').forEach(button=>button.addEventListener('click',()=>showState(button.dataset.state)));
$('state-specimen').addEventListener('click',event=>{if(event.target.closest('[data-reset-specimen]')){showState('ready');$('state-specimen').querySelector('a').focus();}});
showState('empty');

try {
  const store=await openGraph(),graph=store.graph,company=graph.entities.find(item=>item.id==='startup:canva')||graph.entities.find(item=>item.kind==='startup');
  const startups=graph.entities.filter(item=>item.kind==='startup');
  $('ds-snapshot').textContent=`${graph.entities.length} entity records · ${startups.length} startups in this build’s research snapshot.${store.mode==='fallback'?' Showing the published backup.':''}`;
  if(company) {
    const connections=graph.edges.filter(edge=>edge.from===company.id||edge.to===company.id);
    $('entity-specimen').innerHTML=renderEntityRow(company,connections.length);
    const edge=connections.find(item=>item.kind==='founded')||connections[0];
    const from=edge&&graph.entities.find(item=>item.id===edge.from),to=edge&&graph.entities.find(item=>item.id===edge.to);
    const evidence=edge&&sourceUrl(edge.source);
    $('relationship-specimen').innerHTML=from&&to?`<a href="${esc(entityHref(from))}">${esc(from.name)}</a><span>${esc(edge.description||edge.kind)}</span><a href="${esc(entityHref(to))}">${esc(to.name)}</a>${evidence?`<a class="ds-relationship-source" href="${esc(evidence)}" target="_blank" rel="noopener noreferrer">Read relationship evidence ${icon('external')}</a>`:''}`:'<p class="atlas-coverage">No sourced relationship recorded for this specimen.</p>';
    const fact=company.profile_facts?.find(item=>sourceUrl(item.source));
    $('fact-specimen').innerHTML=fact?`<dl><dt>${esc(fact.label)}</dt><dd>${esc(fact.value)}</dd></dl><p class="atlas-coverage"><a href="${esc(sourceUrl(fact.source))}" target="_blank" rel="noopener noreferrer">Read the source</a>${fact.reviewed_at?' · Reviewed '+esc(fact.reviewed_at):''}</p>`:'<p class="atlas-coverage">Company facts have not been recorded yet.</p>';
  } else {
    for(const id of ['entity-specimen','relationship-specimen','fact-specimen'])$(id).innerHTML='<p class="atlas-coverage">No startup specimen in this snapshot.</p>';
  }
  const funded=makeView(graph,{metric:'funding',currency:'USD',query:'',period:'all',group:'company'});
  $('coverage-specimen').textContent=`${funded.rows.length} of ${funded.filteredCount} researched startups have a comparable USD funding announcement.`;
  document.querySelectorAll('.entity-row-image').forEach(img=>img.addEventListener('error',()=>{img.closest('.entity-row-mark')?.classList.remove('has-logo');img.remove();}));
} catch {
  $('ds-snapshot').textContent='Research examples are unavailable. Design tokens and working view links remain available.';
  for(const id of ['entity-specimen','relationship-specimen','fact-specimen'])$(id).innerHTML='<p class="atlas-coverage">The research specimen could not be loaded. Reload this page to retry.</p>';
  $('coverage-specimen').textContent='Coverage unavailable for this snapshot.';
}
for(const id of ['entity-specimen','relationship-specimen','fact-specimen'])$(id).setAttribute('aria-busy','false');
