import { escapeHtml as esc, sourceUrl } from './logic.js';
import { logoFor } from './logos.js';
import { openGraph } from './graph-store.js';
import { entityDetails, entityHref, kindName, neighborhood } from './graph-model.js';
import { createForceSimulation, layoutBounds, layoutNetwork } from './graph-layout.js';
import { renderIcon as icon } from './atlas-icons.js';
import { animateAtlasChange } from './atlas-ui.js';
import { filterCompanies, indexCompanies, readExploration, writeExploration, countryName } from './atlas-exploration.js';
import { mountExploration } from './atlas-explorer-controls.js';

const $=id=>document.getElementById(id);
const entityKinds=['startup','partner','person','programme','provider'];
const kinds=new Set(entityKinds);
const compact=window.matchMedia?.('(max-width: 600px)');
let store, rootId, selectedId, depth=1, zoom=1, listVisible=false, searchTimer, composing=false;
let layout, bounds, simulation, frame=null, pan={x:0,y:0}, gesture=null, suppressClick=false;
const reducedMotion=window.matchMedia?.('(prefers-reduced-motion: reduce)');
const pinned=new Map();
let scope=readExploration(new URLSearchParams(location.search));
let dimensions, controls, currentView;
let searchMatches=[], searchedQuery, visibleCompanies=new Set();
const initials=name=>name.trim().split(/\s+/).slice(0,2).map(part=>part[0]||'').join('').toUpperCase();
const imageUrl=value=>sourceUrl(value)||(/^\.\/assets\/logos\/[a-z0-9-]+\.(?:svg|png)$/i.test(value||'')?value:'');
const entityImage=entity=>imageUrl(entity.logo)||imageUrl(logoFor(entity.name));
const evidence=(url,label='Source')=>{const safe=sourceUrl(url);return safe?'<a class="detail-source" href="'+esc(safe)+'" target="_blank" rel="noopener noreferrer">'+esc(label)+' ↗</a>':'';};
const money=(value,currency,amountText)=>{if(value==null||!currency)return amountText || 'Amount not recorded';try{return new Intl.NumberFormat('en-AU',{style:'currency',currency,maximumFractionDigits:0}).format(Number(value));}catch{return String(value)+' '+currency;}};

function renderNode(node) {
  const root=node.id===rootId, selected=node.id===selectedId, url=entityImage(node), x=-node.width/2, y=-node.height/2;
  const iconX=x+29, nameX=x+57, lineHeight=root?23:20, nameY=node.lines.length>1?-15:-5;
  const kind=kindName(node.kind).toUpperCase(),kindY=nameY+(node.lines.length-1)*lineHeight+23;
  const label=node.lines.map((line,index)=>'<tspan x="'+nameX+'" dy="'+(index?lineHeight:0)+'">'+esc(line)+'</tspan>').join('');
  const img=url?'<image href="'+esc(url)+'" x="'+(iconX-16)+'" y="-16" width="32" height="32" preserveAspectRatio="xMidYMid meet"></image>':'';
  const context=node.kind!=='startup'||!visibleCompanies.has(node.id);
  return '<g class="network-node'+(root?' is-root':'')+(selected?' is-selected':'')+'" data-node="'+esc(node.id)+'" data-kind="'+esc(node.kind)+'" data-context="'+context+'" role="button" tabindex="0" aria-pressed="'+String(selected)+'" aria-label="'+esc(kindName(node.kind)+': '+node.name+(context?' · Relationship context':'')+'. Press Enter to inspect; use arrow keys to move')+'" transform="translate('+node.x.toFixed(1)+' '+node.y.toFixed(1)+')"><rect class="node-shell" x="'+x+'" y="'+y+'" width="'+node.width+'" height="'+node.height+'" rx="8"></rect><rect class="node-avatar" x="'+(iconX-20)+'" y="-20" width="40" height="40" rx="7"></rect><text class="node-initials" x="'+iconX+'"'+(url?' visibility="hidden"':'')+'>'+esc(initials(node.name))+'</text>'+img+'<text class="node-label" y="'+nameY+'">'+label+'</text><rect class="node-kind-bg" x="'+nameX+'" y="'+(kindY-13)+'" width="'+(kind.length*6.4+14)+'" height="18" rx="5"></rect><text class="node-kind" x="'+(nameX+7)+'" y="'+kindY+'">'+esc(kind)+'</text><circle class="node-port" cx="'+x+'" cy="0" r="3"></circle><circle class="node-port" cx="'+(-x)+'" cy="0" r="3"></circle></g>';
}
function edgePoints(a,b) {
  const dx=b.x-a.x,dy=b.y-a.y, horizontal=Math.abs(dx)/(a.width+b.width)>Math.abs(dy)/(a.height+b.height);
  if(horizontal) {
    const sign=dx>=0?1:-1, x1=a.x+sign*a.width/2, x2=b.x-sign*b.width/2, bend=Math.max(36,Math.abs(x2-x1)*.45);
    return [{x:x1,y:a.y},{x:x1+sign*bend,y:a.y},{x:x2-sign*bend,y:b.y},{x:x2,y:b.y}];
  }
  const sign=dy>=0?1:-1,y1=a.y+sign*a.height/2,y2=b.y-sign*b.height/2,bend=Math.max(36,Math.abs(y2-y1)*.45);
  return [{x:a.x,y:y1},{x:a.x,y:y1+sign*bend},{x:b.x,y:y2-sign*bend},{x:b.x,y:y2}];
}
function edgePath(a,b) {
  const [p0,p1,p2,p3]=edgePoints(a,b);
  return `M ${p0.x} ${p0.y} C ${p1.x} ${p1.y}, ${p2.x} ${p2.y}, ${p3.x} ${p3.y}`;
}
function edgeCaption(edge) {
  const full=relationshipText(edge),label=full.length>32?full.slice(0,31).trim()+'…':full;
  return {full,label,width:Math.max(64,label.length*6.5+20)};
}
function renderEdgeCaption(edge,index) {
  const {full,label,width}=edgeCaption(edge);
  return '<g class="network-edge-caption" data-edge-label="'+index+'" visibility="hidden"><title>'+esc(full)+'</title><rect x="'+(-width/2)+'" y="-12" width="'+width+'" height="24" rx="12"></rect><text>'+esc(label)+'</text></g>';
}
function updateEdgeCaptions() {
  if(!layout)return;
  const svg=$('graph-canvas'),byId=new Map(layout.nodes.map(node=>[node.id,node])),placed=[];
  const overlaps=(a,b)=>a.x<b.x+b.width+8&&a.x+a.width+8>b.x&&a.y<b.y+b.height+8&&a.y+a.height+8>b.y;
  const cards=layout.nodes.map(node=>({x:node.x-node.width/2,y:node.y-node.height/2,width:node.width,height:node.height}));
  // Sparse maps can name every clear edge. Dense maps prioritise the inspected
  // entity; the complete predicate and evidence remain in the equivalent list.
  const edges=layout.edges.map((edge,index)=>({edge,index,selected:edge.from===selectedId||edge.to===selectedId})).sort((a,b)=>Number(b.selected)-Number(a.selected));
  for(const {edge,index,selected} of edges) {
    const element=svg.querySelector('[data-edge-label="'+index+'"]');if(!element)continue;
    element.setAttribute('visibility','hidden');element.classList.toggle('is-selected',selected);
    if(layout.edges.length>10&&!selected)continue;
    const points=edgePoints(byId.get(edge.from),byId.get(edge.to)),{width}=edgeCaption(edge);
    for(const t of [.5,.38,.62]) {
      const u=1-t,weights=[u*u*u,3*u*u*t,3*u*t*t,t*t*t];
      const point={x:points.reduce((sum,p,i)=>sum+p.x*weights[i],0),y:points.reduce((sum,p,i)=>sum+p.y*weights[i],0)};
      const box={x:point.x-width/2,y:point.y-12,width,height:24};
      if(cards.some(card=>overlaps(box,card))||placed.some(other=>overlaps(box,other)))continue;
      element.setAttribute('transform',`translate(${point.x} ${point.y})`);element.setAttribute('visibility','visible');placed.push(box);break;
    }
  }
}
function applyZoom() {
  if(!bounds)return;
  const w=bounds.width/zoom,h=bounds.height/zoom;
  $('graph-canvas').setAttribute('viewBox',[bounds.x+(bounds.width-w)/2+pan.x,bounds.y+(bounds.height-h)/2+pan.y,w,h].join(' '));
}
function cameraKey() {
  return 'atlas:graph-camera:'+rootId+':'+depth+':'+entityKinds.filter(kind=>kinds.has(kind)).join(',')+':'+Boolean(compact?.matches);
}
function saveCamera() {
  if (!rootId) return;
  try { sessionStorage.setItem(cameraKey(),JSON.stringify({zoom,pan,pinned:[...pinned]})); } catch { /* Camera remains available on this page. */ }
}
function restoreCamera() {
  zoom=1;pan={x:0,y:0};pinned.clear();
  if (!rootId) return;
  try {
    const camera=JSON.parse(sessionStorage.getItem(cameraKey()) || 'null');
    if (!camera) return;
    if (Number.isFinite(camera.zoom) && camera.zoom>=.7 && camera.zoom<=1.7) zoom=camera.zoom;
    if (Number.isFinite(camera.pan?.x) && Number.isFinite(camera.pan?.y)) pan=camera.pan;
    for (const [id,point] of camera.pinned || []) {
      if (Number.isFinite(point?.x) && Number.isFinite(point?.y)) pinned.set(id,point);
    }
  } catch { /* Use the default camera when storage is unavailable. */ }
}
function updateGeometry() {
  const svg=$('graph-canvas'), byId=new Map(layout.nodes.map(node=>[node.id,node]));
  for(const element of svg.querySelectorAll('.network-node')) {const node=byId.get(element.dataset.node);if(node)element.setAttribute('transform',`translate(${node.x} ${node.y})`);}
  layout.edges.forEach((edge,index)=>svg.querySelector('[data-edge="'+index+'"]')?.setAttribute('d',edgePath(byId.get(edge.from),byId.get(edge.to))));
  updateEdgeCaptions();
}
function stopSimulation() {
  if(frame!==null&&typeof window.cancelAnimationFrame==='function')window.cancelAnimationFrame(frame);
  frame=null;
}
function reheat() {
  stopSimulation();
  if(!simulation||document.hidden)return;
  if(reducedMotion?.matches||typeof window.requestAnimationFrame!=='function') {
    for(let i=0;i<70;i++)simulation.tick(Math.max(.15,1-i/80));
    updateGeometry();return;
  }
  let remaining=120;
  const step=()=>{
    if(reducedMotion?.matches||document.hidden){stopSimulation();return;}
    simulation.tick(Math.max(.15,remaining/120));updateGeometry();
    remaining--;
    frame=remaining>0?window.requestAnimationFrame(step):null;
  };
  frame=window.requestAnimationFrame(step);
}
// Preserve the current geometry when motion becomes inappropriate; restoring
// visibility or preference must not replay an interrupted relaxation.
reducedMotion?.addEventListener?.('change',()=>{if(reducedMotion.matches)stopSimulation();});
document.addEventListener('visibilitychange',()=>{if(document.hidden)stopSimulation();});
window.addEventListener('pagehide',stopSimulation);

function renderMap() {
  stopSimulation();
  const view=neighborhood(store.graph,rootId,{depth,kinds,limit:compact?.matches?(depth===1?10:13):(depth===1?19:25)});
  currentView=view;
  layout=layoutNetwork(view,rootId,pinned);bounds=layoutBounds(layout);simulation=createForceSimulation(layout,pinned);
  const byId=new Map(layout.nodes.map(node=>[node.id,node]));
  const lines=layout.edges.map((edge,index)=>'<path class="network-link" data-edge="'+index+'" marker-end="url(#graph-arrow)" d="'+edgePath(byId.get(edge.from),byId.get(edge.to))+'"></path>').join('');
  $('graph-canvas').innerHTML='<defs><marker id="graph-arrow" viewBox="0 0 8 8" refX="8" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path fill="context-stroke" d="M0 0 L8 4 L0 8 Z"></path></marker></defs><g aria-hidden="true">'+lines+layout.edges.map(renderEdgeCaption).join('')+'</g>'+layout.nodes.map(renderNode).join('');
  $('graph-canvas').querySelectorAll('.network-node image').forEach(img=>img.addEventListener('error',()=>{img.setAttribute('visibility','hidden');img.previousElementSibling?.removeAttribute('visibility');}));
  const root=store.graph.entities.find(entity=>entity.id===rootId);
  if($('network-heading'))$('network-heading').textContent='Around '+root.name;
  applyZoom();renderGraphScope();updateSelection();
}
function renderGraphScope() {
  if (!currentView) return;
  const companyCount=currentView.nodes.filter(node=>visibleCompanies.has(node.id) && kinds.has('startup')).length;
  const label=companyCount===1?'1 company in scope':companyCount+' companies in scope';
  $('graph-count').textContent=label+' · '+currentView.edges.length+' connections'+(currentView.truncated?' · limited neighbourhood':'');
  for (const node of $('graph-canvas').querySelectorAll('.network-node')) {
    const entity=currentView.nodes.find(item=>item.id===node.dataset.node);
    const contextual=!visibleCompanies.has(entity.id)||!kinds.has('startup');
    node.setAttribute('data-context',String(contextual));
    node.setAttribute('aria-label',kindName(entity.kind)+': '+entity.name+(contextual?' · Relationship context':'')+'. Press Enter to inspect; use arrow keys to move');
  }
  renderList(currentView);
}
function renderList(view) {
  const names=new Map(view.nodes.map(item=>[item.id,item]));
  const items=view.edges.map(edge=>{
    const from=names.get(edge.from),to=names.get(edge.to);if(!from||!to)return '';
    const source=sourceUrl(edge.source);
    const nodeButton=entity=>'<button type="button" data-select="'+esc(entity.id)+'"'+(visibleCompanies.has(entity.id)?'':' data-context="true"')+'>'+esc(entity.name)+'</button>';
    return '<li>'+nodeButton(from)+'<span>→ '+esc(relationshipText(edge))+' →</span>'+nodeButton(to)+(source?'<a href="'+esc(source)+'" target="_blank" rel="noopener noreferrer">Evidence ↗</a>':'')+'</li>';
  }).filter(Boolean);
  $('graph-list').innerHTML='<h3>Visible connections</h3>'+(view.truncated?'<p class="detail-caption">This map shows a limited neighbourhood. Open a profile to see all its reviewed connections, or explore from another entity.</p>':'')+(items.length?'<ul>'+items.join('')+'</ul>':'<p class="detail-empty">No connections match the selected types.</p>');
  $('graph-list').hidden=!listVisible;
}
function relationshipText(edge) {
  if (edge.kind==='offers') return 'offers';
  if (edge.kind==='founded') return 'founded';
  if (edge.kind==='supports' && (!edge.description || edge.description==='Listed in portfolio')) return 'lists in portfolio';
  return edge.description || (edge.kind==='team_member' ? 'team member at' : 'connected to');
}
function writeState(push=false) {
  if(!rootId)return;
  const params=new URLSearchParams(location.search);
  params.delete('startup');params.set('entity',rootId);
  if (selectedId) params.delete('inspection');else params.set('inspection','none');
  scope={...scope,graphAnchor:rootId,selected:selectedId || ''};
  writeExploration(params,scope);
  if(depth===2)params.set('depth','2');else params.delete('depth');
  if(kinds.size===entityKinds.length)params.delete('types');else params.set('types',entityKinds.filter(kind=>kinds.has(kind)).join(','));
  if(listVisible)params.set('list','1');else params.delete('list');
  const method=push?'pushState':'replaceState';
  if ('?'+params.toString()!==location.search) history[method]?.(null,'','?'+params.toString()+(location.hash || ''));
  document.dispatchEvent(new CustomEvent('atlas:exploration-change',{detail:{...scope}}));
}
function updateSelection() {
  const canCenter=layout?.nodes.some(node=>node.id===selectedId);
  const center=$('graph-center');
  if (center) center.disabled=!canCenter;
  const inspectionLink=document.querySelector?.('.network-inspector-link');
  if (inspectionLink) inspectionLink.hidden=!selectedId;
  for(const element of $('graph-canvas').querySelectorAll('.network-node')) {
    const selected=element.dataset.node===selectedId;
    element.classList.toggle('is-selected',selected);element.setAttribute('aria-pressed',String(selected));
  }
  layout?.edges.forEach((edge,index)=>{
    $('graph-canvas').querySelector('[data-edge="'+index+'"]')?.classList.toggle('is-selected',edge.from===selectedId || edge.to===selectedId);
  });
  updateEdgeCaptions();
}
function renderDetail() {
  if (!selectedId) {
    $('graph-detail').innerHTML='<h2>Inspect a connection</h2><p class="detail-empty">Select a node or a record in the connections list to see its sources.</p>';
    return;
  }
  const details=entityDetails(store.graph,selectedId), entity=details.entity, names=new Map(details.related.map(item=>[item.id,item]));
  const visibleIds=new Set(layout?.nodes.map(node=>node.id)||[]);
  const related=details.edges.map(edge=>{
    const other=names.get(edge.from===selectedId?edge.to:edge.from);if(!other)return '';
    const image=entityImage(other);
    const icon=image?'<img src="'+esc(image)+'" alt="" loading="lazy" referrerpolicy="no-referrer"><span class="detail-mark-fallback" hidden>'+esc(initials(other.name))+'</span>':esc(initials(other.name));
    return '<li><span class="detail-mini" aria-hidden="true">'+icon+'</span><div class="detail-connection-copy"><button type="button" data-select="'+esc(other.id)+'">'+esc(other.name)+'</button><small>'+esc(relationshipText(edge))+'</small>'+(visibleIds.has(other.id)?'':'<small class="detail-outside">Outside current map</small>')+evidence(edge.source,'Relationship source')+'</div></li>';
  }).filter(Boolean);
  const url=entityImage(entity),rounds=[...details.rounds].sort((a,b)=>(b.announced_on||'').localeCompare(a.announced_on||''));
  const logo='<span class="detail-mark '+(entity.kind==='person'?'person':'')+'">'+(url?'<img src="'+esc(url)+'" alt="" referrerpolicy="no-referrer"><span class="detail-mark-fallback" hidden>'+esc(initials(entity.name))+'</span>':esc(initials(entity.name)))+'</span>';
  const summary=entity.summary || 'This entry is connected to the sources and organisations below. More details are being researched.';
  const source=evidence(entity.source,'Profile source')+evidence(entity.website,entity.kind==='person'?'Professional profile':'Website')+evidence(entity.logo_source,'Image source');
  const isRoot=selectedId===rootId;
  const outOfScope=entity.kind==='startup'&&!visibleCompanies.has(selectedId);
  const selectionNote=outOfScope?'Outside current results':isRoot?'Map centred here.':visibleIds.has(selectedId)?'Selected within this map.':'Selected outside this map.';
  const inspectAction=isRoot?'':'<button class="detail-explore atlas-button" type="button" data-explore="'+esc(entity.id)+'">Explore from here</button>';
  const company=dimensions.get(selectedId);
  const headquarters=company?.country ? [company.city,countryName(company.country)].filter(Boolean).join(', ') : 'Not recorded';
  const recovery=outOfScope?'<div class="graph-recovery"><button type="button" data-graph-adjust>Adjust filters</button><button type="button" data-graph-clear>Clear selection</button></div>':'';
  const actions=company?'<div class="graph-workspace-actions" data-company-name="'+esc(entity.name)+'"><button type="button" class="atlas-button" data-atlas-save-company="'+esc(entity.id)+'">Save</button><button type="button" class="atlas-button" data-atlas-compare="'+esc(entity.id)+'">Compare</button></div>':'';
  const facts=company?'<dl class="graph-company-facts"><div><dt>Headquarters</dt><dd>'+esc(headquarters)+'</dd></div><div><dt>Primary sector</dt><dd>'+esc(company.sector || 'Not recorded')+'</dd></div></dl>':'';
  $('graph-detail').innerHTML=`<div class="detail-heading">${logo}<div><h2>${esc(entity.name)}</h2><p class="detail-kind atlas-badge" data-kind="${esc(entity.kind)}">${esc(kindName(entity.kind))}</p></div></div>
    <p class="detail-selection-note" data-selection="${outOfScope?'excluded':isRoot?'root':visibleIds.has(selectedId)?'within':'outside'}">${selectionNote}</p>${recovery}
    ${facts}<p class="detail-summary">${esc(summary)}</p><div class="detail-actions"><a class="detail-open atlas-button atlas-button-accent" data-atlas-profile-link href="${esc(entityHref(entity))}">${icon('external')}Open profile</a>${inspectAction}</div>${actions}
    <section class="detail-section"><h3>Recorded connections <span>${details.edges.length}</span></h3>${related.length?'<ul class="detail-related">'+related.slice(0,8).join('')+'</ul>'+(related.length>8?'<p class="detail-caption">Showing 8 of '+related.length+' recorded connections. Open the profile for the complete list.</p>':''):'<p class="detail-empty">No reviewed connections yet.</p>'}</section>
    ${company?'<section class="detail-section"><h3>Funding announcements</h3>'+(rounds.length?rounds.slice(0,2).map(round=>'<div class="detail-round"><strong>'+esc(round.stage||'Funding event')+' · '+esc(money(round.amount,round.currency,round.amount_text))+'</strong><span>'+esc(round.announced_on||'Date not disclosed')+' · historical announcement</span>'+evidence(round.source,'Announcement source')+'</div>').join(''):'<p class="detail-empty">No recorded funding announcements.</p>')+'</section>':''}
    ${source?'<section class="detail-section"><h3>Sources</h3>'+source+'</section>':''}`;
  $('graph-detail').querySelectorAll('img').forEach(img=>img.addEventListener('error',()=>{img.hidden=true;if(img.nextElementSibling)img.nextElementSibling.hidden=false;}));
}
function select(id,writeHistory=true) {
  if(id&&!store?.graph.entities.some(entity=>entity.id===id))return;
  const changed=selectedId!==id;
  selectedId=id;updateSelection();renderDetail();
  if(writeHistory&&changed){
    writeState(true);
    const detail=$('graph-detail'), heading=detail.querySelector('.detail-heading');
    const links=[...svg.querySelectorAll('.network-link.is-selected')].slice(0,8);
    animateAtlasChange(detail,timeline=>{
      if(!heading?.isConnected)return;
      timeline.fromTo(heading,{x:-7,opacity:.7},{x:0,opacity:1},0);
      const visibleLinks=links.filter(link=>link.isConnected);
      if(visibleLinks.length)timeline.fromTo(visibleLinks,{opacity:.45},{opacity:1},0);
    });
  }
}
function explore(id,writeHistory=true) {
  if(!store.graph.entities.some(entity=>entity.id===id)) {
    stopSimulation();layout=null;bounds=null;currentView=null;rootId=null;selectedId=null;
    $('graph-detail').innerHTML='<p class="detail-empty">This entry is not in the published graph. Search for another organisation.</p>';
    $('graph-canvas').innerHTML='<text x="460" y="320" text-anchor="middle">Entry not found</text>';
    $('graph-count').textContent='0 entities shown';
    return;
  }
  if (rootId!==id) { if (writeHistory) saveCamera();rootId=id;restoreCamera(); }
  selectedId=id;
  renderMap();renderDetail();
  if(writeHistory)writeState(true);
}
function updateScope(next) {
  if (searchedQuery!==next.query) {
    searchMatches=store.search(next.query,store.graph.entities.length);
    searchedQuery=next.query;
  }
  visibleCompanies=new Set(filterCompanies(searchMatches,dimensions,next).map(company=>company.id));
  scope=next;
  controls?.update(scope,searchMatches);
  const shell=$('graph-main');
  if (shell) shell.dataset.density=scope.density;
}
function changeScope(patch) {
  updateScope({...scope,...patch});
  renderGraphScope();
  if (rootId) renderDetail();
  if (!$('graph-results').hidden) renderSearchResults();
  writeState(true);
}
function renderSearchResults() {
  const box=$('graph-results');
  if(!scope.query){box.hidden=true;box.innerHTML='';return;}
  const results=searchMatches.filter(item=>kinds.has(item.kind)&&(item.kind!=='startup'||visibleCompanies.has(item.id))).slice(0,100);
  box.innerHTML=results.length?results.map(item=>'<button class="explorer-result" type="button" data-explore="'+esc(item.id)+'"><strong>'+esc(item.name)+'</strong><small>'+esc(kindName(item.kind))+(item.kind==='startup'?'':' · Context')+'</small></button>').join(''):'<p>No matching entries. Try another name, adjust the company filters or show more entity types.</p>';
  box.hidden=false;
}
function renderSearch() {
  if(!store)return;
  try {
    updateScope({...scope,query:$('graph-query').value.trim()});
    renderSearchResults();
    renderGraphScope();
    if (rootId) renderDetail();
    writeState();
  } catch {
    $('graph-results').innerHTML='<p>Search is unavailable. Try again.</p>';$('graph-results').hidden=false;
  }
}
function selectFromEvent(event) {
  if(event.target.closest('[data-graph-adjust]')?.hasAttribute?.('data-graph-adjust')) {controls?.openCountries();return;}
  if(event.target.closest('[data-graph-clear]')?.hasAttribute?.('data-graph-clear')) {select(null);$('graph-detail').focus();return;}
  const target=event.target.closest('[data-select], [data-explore]');if(!target)return;
  $('graph-results').hidden=true;
  if(target.dataset.explore){explore(target.dataset.explore);$('graph-canvas').querySelector('.network-node.is-root')?.focus({preventScroll:true});}
  else {
    select(target.dataset.select);
    if(event.currentTarget===$('graph-detail'))$('graph-detail').querySelector('.detail-open')?.focus({preventScroll:true});
  }
}
$('graph-search').addEventListener('submit',event=>{event.preventDefault();if(composing||event.isComposing)return;clearTimeout(searchTimer);renderSearch();});
function queueSearch(event) {
  clearTimeout(searchTimer);
  if(composing||event?.isComposing)return;
  if(!$('graph-query').value.trim()){renderSearch();return;}
  searchTimer=setTimeout(renderSearch,180);
}
$('graph-query').addEventListener('input',queueSearch);
$('graph-query').addEventListener('compositionstart',()=>{composing=true;clearTimeout(searchTimer);});
$('graph-query').addEventListener('compositionend',()=>{composing=false;queueSearch();});
$('graph-query').addEventListener('keydown',event=>{if(event.key==='Escape')$('graph-results').hidden=true;});
$('graph-results').addEventListener('click',selectFromEvent);
$('graph-detail').addEventListener('click',selectFromEvent);
$('graph-list').addEventListener('click',selectFromEvent);
const svg=$('graph-canvas');
function graphPoint(event,matrix=svg.getScreenCTM().inverse()) {
  const point=svg.createSVGPoint();point.x=event.clientX;point.y=event.clientY;
  return point.matrixTransform(matrix);
}
svg.addEventListener('pointerdown',event=>{
  if(!layout||event.button!==0)return;
  const target=event.target.closest('[data-node]'),matrix=svg.getScreenCTM().inverse(),point=graphPoint(event,matrix);
  const node=target&&layout.nodes.find(item=>item.id===target.dataset.node);
  gesture={pointer:event.pointerId,node,point,matrix,startX:event.clientX,startY:event.clientY,original:node?{x:node.x,y:node.y}:null,pan:{...pan},moved:false};
  svg.setPointerCapture?.(event.pointerId);
});
svg.addEventListener('pointermove',event=>{
  if(!gesture||gesture.pointer!==event.pointerId)return;
  const dx=event.clientX-gesture.startX,dy=event.clientY-gesture.startY;
  if(Math.hypot(dx,dy)>4)gesture.moved=true;
  if(!gesture.moved)return;
  if(gesture.node) {
    const point=graphPoint(event,gesture.matrix),node=gesture.node;
    node.x=gesture.original.x+point.x-gesture.point.x;node.y=gesture.original.y+point.y-gesture.point.y;
    pinned.set(node.id,{x:node.x,y:node.y});
    const element=svg.querySelectorAll('.network-node');
    for(const item of element)if(item.dataset.node===node.id)item.setAttribute('transform',`translate(${node.x} ${node.y})`);
    updateGeometry();reheat();
  } else {const point=graphPoint(event,gesture.matrix);pan={x:gesture.pan.x-(point.x-gesture.point.x),y:gesture.pan.y-(point.y-gesture.point.y)};applyZoom();}
});
function finishGesture(event) {
  if(!gesture||gesture.pointer!==event.pointerId)return;
  const completed=gesture;gesture=null;
  if(completed.moved)saveCamera();
  if(event.type==='pointercancel')return;
  if(completed.moved||completed.node){
    suppressClick=true;setTimeout(()=>{suppressClick=false;},0);
    if(!completed.moved)select(completed.node.id);
  }
}
svg.addEventListener('pointerup',finishGesture);
svg.addEventListener('pointercancel',finishGesture);
svg.addEventListener('click',event=>{if(suppressClick){suppressClick=false;return;}const node=event.target.closest('[data-node]');if(node)select(node.dataset.node);});
svg.addEventListener('keydown',event=>{
  const element=event.target.closest('[data-node]');if(!element)return;
  if(event.key==='Enter'||event.key===' '){event.preventDefault();select(element.dataset.node);return;}
  const directions={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]},direction=directions[event.key];
  if(!direction)return;event.preventDefault();
  const node=layout.nodes.find(item=>item.id===element.dataset.node),step=event.shiftKey?50:20;
  node.x+=direction[0]*step;node.y+=direction[1]*step;pinned.set(node.id,{x:node.x,y:node.y});
  element.setAttribute('transform',`translate(${node.x} ${node.y})`);updateGeometry();reheat();saveCamera();
});
$('graph-filters').addEventListener('click',event=>{
  const button=event.target.closest('button[data-kind]');if(!button||!store)return;
  const kind=button.dataset.kind;if(!entityKinds.includes(kind))return;
  saveCamera();
  if(kinds.has(kind))kinds.delete(kind);else kinds.add(kind);
  button.setAttribute('aria-pressed',String(kinds.has(kind)));
  if(rootId){restoreCamera();renderMap();renderDetail();writeState();}
  if(!$('graph-results').hidden)renderSearchResults();
});
$('graph-depth').addEventListener('change',event=>{
  const next=Number(event.target.value)===2?2:1;
  if (depth!==next) { saveCamera();depth=next;restoreCamera(); }
  if(store&&rootId){renderMap();renderDetail();writeState();}
});
$('graph-list-toggle').addEventListener('click',()=>{listVisible=!listVisible;syncListVisibility();writeState();});
function syncListVisibility() {
  $('graph-list-toggle').setAttribute('aria-pressed',String(listVisible));
  $('graph-list-toggle').querySelector('span').textContent=listVisible?'Hide connections':'Connections list';
  $('graph-list').hidden=!listVisible;
}
$('graph-zoom-in').addEventListener('click',()=>{zoom=Math.min(1.7,zoom+.2);applyZoom();saveCamera();});
$('graph-zoom-out').addEventListener('click',()=>{zoom=Math.max(.7,zoom-.2);applyZoom();saveCamera();});
$('graph-fit')?.addEventListener('click',()=>{if(!layout)return;bounds=layoutBounds(layout);zoom=1;pan={x:0,y:0};applyZoom();saveCamera();});
$('graph-center')?.addEventListener('click',()=>{
  const selected=layout?.nodes.find(node=>node.id===selectedId);
  if (!selected || !bounds) return;
  pan={x:selected.x-bounds.x-bounds.width/2,y:selected.y-bounds.y-bounds.height/2};
  applyZoom();saveCamera();
});
$('graph-reset').addEventListener('click',()=>{zoom=1;pan={x:0,y:0};pinned.clear();if(store&&rootId)renderMap();saveCamera();});
function restoreFromUrl() {
  if(!store)return;
  clearTimeout(searchTimer);
  const params=new URLSearchParams(location.search),nextScope=readExploration(params);
  const nextRoot=params.get('entity')||params.get('startup')||nextScope.graphAnchor||nextScope.selected||'startup:canva';
  const nextDepth=params.get('depth')==='2'?2:1;
  const nextKinds=params.has('types')?params.get('types').split(',').filter(kind=>entityKinds.includes(kind)):entityKinds;
  const mapChanged=depth!==nextDepth || nextKinds.length!==kinds.size || nextKinds.some(kind=>!kinds.has(kind));
  if (mapChanged || nextRoot!==rootId) saveCamera();
  depth=nextDepth;kinds.clear();nextKinds.forEach(kind=>kinds.add(kind));
  $('graph-depth').value=String(depth);
  for(const button of $('graph-filters').querySelectorAll('button[data-kind]'))button.setAttribute('aria-pressed',String(kinds.has(button.dataset.kind)));
  listVisible=params.get('list')==='1';syncListVisibility();
  $('graph-query').value=nextScope.query;
  updateScope(nextScope);
  if(nextRoot!==rootId)explore(nextRoot,false);
  else if(mapChanged){restoreCamera();renderMap();}
  else renderGraphScope();
  const selected=params.get('inspection')==='none' ? null
    : store.graph.entities.some(entity=>entity.id===nextScope.selected) ? nextScope.selected : rootId;
  if(rootId)select(selected,false);
  renderSearchResults();
  writeState();
}
window.addEventListener('popstate',restoreFromUrl);
compact?.addEventListener?.('change',()=>{if(store&&rootId){restoreCamera();renderMap();renderDetail();}});

try {
  store=await openGraph();
  if(store.mode==='fallback')$('graph-status').textContent='Showing the published backup while the database is unavailable.';
  dimensions=indexCompanies(store.graph);
  const host=$('graph-exploration');
  controls=mountExploration(host,{companies:store.graph.entities,dimensions,onChange:changeScope});
  if (host) host.hidden=false;
  restoreFromUrl();
} catch {
  $('graph-status').textContent='The graph could not be loaded. Refresh to try again.';
  $('graph-detail').innerHTML='<p class="detail-empty">Profiles are temporarily unavailable.</p>';
  $('graph-canvas').innerHTML='<text x="460" y="320" text-anchor="middle">Graph unavailable</text>';
}
