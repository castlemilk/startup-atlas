import { escapeHtml as esc, sourceUrl } from './logic.js';
import { graphArtwork, graphInitials, showGraphArtwork } from './graph-artwork.js';
import { openGraph } from './graph-store.js';
import { entityDetails, entityHref, kindName, neighborhood } from './graph-model.js';
import { createForceSimulation, layoutBounds, layoutNetwork } from './graph-layout.js';
import { mountCompanyLoom, mountLoom } from './graph-loom.js';
import { mountAtlasExplorer } from './graph-atlas.js';
import { mainConnections, mobileFit, mobileFitHeight } from './graph-mobile-fit.js';
import { renderIcon as icon } from './atlas-icons.js';
import { animateAtlasChange } from './atlas-ui.js';
import { filterCompanies, indexCompanies, readExploration, writeExploration, countryName } from './atlas-exploration.js';
import { mountExploration } from './atlas-explorer-controls.js';
import { loadTreemapEvidence } from './treemap-model.js';

const $=id=>document.getElementById(id);
const entityKinds=['startup','partner','person','programme','provider'];
const kinds=new Set(entityKinds);
const compact=window.matchMedia?.('(max-width: 600px)');
const mobileOverview=window.matchMedia?.(mobileFit.media);
let store, rootId, selectedId, depth=1, zoom=1, listVisible=false, searchTimer, composing=false;
let layout, bounds, simulation, frame=null, pan={x:0,y:0}, gesture=null, suppressClick=false;
let loom, loomViewport, loomUnavailable=false, renderedCameraKey;
let companyLoom, companySections=[];
let atlasExplorer;
const reducedMotion=window.matchMedia?.('(prefers-reduced-motion: reduce)');
const pinned=new Map();
let scope=readExploration(new URLSearchParams(location.search));
let dimensions, controls, currentView, mapView, fullMap=false, companyGroup='sector';
let searchMatches=[], searchedQuery, visibleCompanies=new Set();
const evidence=(url,label='Source')=>{const safe=sourceUrl(url);return safe?'<a class="detail-source" href="'+esc(safe)+'" target="_blank" rel="noopener noreferrer">'+esc(label)+' ↗</a>':'';};
const money=(value,currency,amountText)=>{if(value==null||!currency)return amountText || 'Amount not recorded';try{return new Intl.NumberFormat('en-AU',{style:'currency',currency,maximumFractionDigits:0}).format(Number(value));}catch{return String(value)+' '+currency;}};

function renderNode(node) {
  const root = node.id===rootId;
  const selected = node.id===selectedId;
  const { url, classes, portrait } = graphArtwork(node);
  const x = -node.width/2, y = -node.height/2;
  const branded = root && node.kind==='startup';
  const iconX = branded ? 0 : x+30;
  const iconY = branded ? y+37 : 0;
  const nameX = x+(branded ? 18 : 58);
  const lineHeight = root ? 23 : 20;
  const nameY = branded ? y+88 : node.lines.length>1 ? -14 : -4;
  const kind = node.kind==='startup' ? 'Company' : kindName(node.kind);
  const kindY = nameY+(node.lines.length-1)*lineHeight+21;
  const label = node.lines.map((line,index)=>`<tspan x="${nameX}" dy="${index ? lineHeight : 0}">${esc(line)}</tspan>`).join('');
  const cropsPadding = classes.includes('padded-mark');
  const logo = !url ? '' : branded
    ? `<svg x="${x+18}" y="${y+7}" width="${node.width-36}" height="67" viewBox="${cropsPadding ? '18 36.75 64 26.5' : '0 0 100 100'}"><image href="${esc(url)}" width="100" height="100" preserveAspectRatio="xMidYMid meet"></image></svg>`
    : `<image${portrait ? ' class="node-portrait"' : ''} href="${esc(url)}" x="${iconX-18}" y="-18" width="36" height="36" preserveAspectRatio="xMidYMid ${portrait ? 'slice' : 'meet'}"></image>`;
  const context = node.kind!=='startup'||!visibleCompanies.has(node.id);
  const avatarClass = classes.includes('logo-on-dark') ? ' logo-on-dark' : '';
  const accessible = `${kindName(node.kind)}: ${node.name}${context ? ' · Relationship context' : ''}. Press Enter to follow connections; use arrow keys to move`;
  return `<g class="network-node${root ? ' is-root' : ''}${selected ? ' is-selected' : ''}" data-node="${esc(node.id)}" data-kind="${esc(node.kind)}" data-context="${context}" role="button" tabindex="0" aria-pressed="${selected}" aria-label="${esc(accessible)}" transform="translate(${node.x.toFixed(1)} ${node.y.toFixed(1)})">
    <rect class="node-shell" x="${x}" y="${y}" width="${node.width}" height="${node.height}" rx="6"></rect>
    <g class="node-avatar-plate${avatarClass}"${branded && url ? ' visibility="hidden"' : ''}>
      <rect class="node-avatar" x="${iconX-20}" y="${iconY-20}" width="40" height="40" rx="${portrait ? 20 : 5}"></rect>
      <text class="node-initials" x="${iconX}" y="${iconY}"${url && !branded ? ' visibility="hidden"' : ''}>${esc(graphInitials(node.name))}</text>
    </g>${logo}
    <text class="node-label" y="${nameY}">${label}</text>
    <text class="node-kind" x="${nameX}" y="${kindY}">${esc(kind)}</text>
  </g>`;
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
  reportZoom(Math.round(zoom*100));
}
function reportZoom(zoomPercent) {
  const readout = $('graph-zoom-number');
  const percent = `${zoomPercent}%`;
  if (readout && readout.textContent!==percent) readout.textContent = percent;
}
function cameraKey(overview) {
  return 'atlas:graph-camera:'+rootId+':'+depth+':'+entityKinds.filter(kind=>kinds.has(kind)).join(',')+':'+Boolean(compact?.matches)+(overview?':main-connections':'');
}
function saveCamera() {
  if (!renderedCameraKey) return;
  syncPin();
  try { sessionStorage.setItem(renderedCameraKey,JSON.stringify({zoom,pan,loom:loom?.savedViewport(),pinned:[...pinned]})); } catch { /* Camera remains available on this page. */ }
}
function restoreCamera(overview, reset=false) {
  zoom=1;pan={x:0,y:0};loomViewport=null;pinned.clear();
  if (reset) return;
  try {
    const camera=JSON.parse(sessionStorage.getItem(cameraKey(overview)) || 'null');
    if (!camera) return;
    if (Number.isFinite(camera.zoom) && camera.zoom>=.7 && camera.zoom<=1.7) zoom=camera.zoom;
    if (Number.isFinite(camera.pan?.x) && Number.isFinite(camera.pan?.y)) pan=camera.pan;
    if (camera.loom?.zoom>0 && ['x','y','z','zoom','yaw','pitch'].every(key=>Number.isFinite(camera.loom[key]))) loomViewport=camera.loom;
    for (const [id,point] of camera.pinned || []) {
      if (Number.isFinite(point?.x) && Number.isFinite(point?.y)) pinned.set(id,{x:point.x,y:point.y,z:Number.isFinite(point.z)?point.z:0});
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

function mapControls() {
  return loom ? $('graph-loom-controls') : $('graph-canvas');
}

function rememberPin(id, point) {
  if (point) pinned.set(id, { x: point.x, y: point.y, z: point.z });
  else pinned.delete(id);
  saveCamera();
}

function resetLoom() {
  loom?.destroy();
  loom=null;
  const canvas=$('graph-loom-canvas');
  if (!canvas) return;
  canvas.hidden=true;
  $('graph-loom-controls').hidden=true;
  $('graph-canvas').removeAttribute('hidden');
  canvas.parentElement.dataset.renderer='svg';
  canvas.parentElement.style.removeProperty('--graph-fit-height');
}

function renderLoom(view,dense,overview) {
  const canvas=$('graph-loom-canvas');
  if (!canvas || loomUnavailable) return;
  const controls=$('graph-loom-controls');
  if (overview) canvas.parentElement.style.setProperty('--graph-fit-height',`${mobileFitHeight(view.nodes.length-1)}px`);
  canvas.hidden=false;
  controls.hidden=false;
  $('graph-canvas').setAttribute('hidden','');
  try {
    loom=mountLoom({canvas,controls,view,root:rootId,dense,overview,kinds:entityKinds,pins:pinned,viewport:loomViewport,
      traverse:traverseMap,rememberPin,reportZoom});
    canvas.parentElement.dataset.renderer='loom';
  } catch {
    loomUnavailable=true;
    resetLoom();
  }
}

function renderMap({resetCamera=false}={}) {
  const previousViewport=loom?.savedViewport();
  stopSimulation();
  resetLoom();
  const view=neighborhood(store.graph,rootId,{depth,kinds,limit:Infinity});
  const dense=view.nodes.length>25;
  const fitted=mobileOverview?.matches && !loomUnavailable ? mainConnections(view,rootId) : null;
  const useOverview=Boolean(fitted) && !fullMap;
  currentView=view;
  mapView=useOverview ? fitted : view;
  layout=null;bounds=null;simulation=null;
  if (resetCamera || renderedCameraKey!==cameraKey(useOverview)) restoreCamera(useOverview,resetCamera);
  else loomViewport=previousViewport;
  renderLoom(mapView,dense && !useOverview,useOverview);
  if (!loom) {
    mapView=view;
    if (useOverview) restoreCamera(false,resetCamera);
    layout=layoutNetwork(view,rootId,pinned);
    bounds=layoutBounds(layout);
    simulation=createForceSimulation(layout,pinned);
    renderSvgMap();
  }
  renderedCameraKey=cameraKey(mapView!==currentView);
  const toggle=$('graph-full-map');
  if (toggle) {
    toggle.hidden=!(loom && fitted);
    toggle.setAttribute('aria-pressed',String(!toggle.hidden && fullMap));
  }
  const root=store.graph.entities.find(entity=>entity.id===rootId);
  if($('network-heading'))$('network-heading').textContent='Around '+root.name;
  if($('graph-title'))$('graph-title').textContent=`${root.name} / Relationships`;
  const guide=document.querySelector?.('.network-map-guide');
  if (guide) {
    guide.dataset.dense=String(Boolean(loom) && dense && mapView===currentView);
    guide.textContent=guide.dataset.dense==='true' ? 'Zoom for names or open the connections list.' : 'Tap a node to follow its connections.';
  }
  renderGraphScope();updateSelection();
}
function renderSvgMap() {
  const byId=new Map(layout.nodes.map(node=>[node.id,node]));
  const lines=layout.edges.map((edge,index)=>'<path class="network-link" data-edge="'+index+'" marker-end="url(#graph-arrow)" d="'+edgePath(byId.get(edge.from),byId.get(edge.to))+'"></path>').join('');
  $('graph-canvas').innerHTML='<defs><marker id="graph-arrow" viewBox="0 0 8 8" refX="8" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path fill="context-stroke" d="M0 0 L8 4 L0 8 Z"></path></marker></defs><g aria-hidden="true">'+lines+layout.edges.map(renderEdgeCaption).join('')+'</g>'+layout.nodes.map(renderNode).join('');
  $('graph-canvas').querySelectorAll('.network-node image').forEach(img=>img.addEventListener('error',()=>{
    const node = img.closest('.network-node');
    img.setAttribute('visibility','hidden');
    node.querySelector('.node-avatar-plate')?.removeAttribute('visibility');
    node.querySelector('.node-initials')?.removeAttribute('visibility');
  }));
  applyZoom();
}
function renderCompanyOverview(saved) {
  const groups=new Map();
  for (const entity of searchMatches) {
    if (!visibleCompanies.has(entity.id)) continue;
    const dimension=dimensions.get(entity.id);
    const label=companyGroup==='country' ? countryName(dimension?.country)
      : dimension?.sector || dimension?.technology || 'Sector not recorded';
    if (!groups.has(label)) groups.set(label,[]);
    groups.get(label).push(entity);
  }
  const byName=(a,b)=>a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
  companySections=[...groups].sort(([left],[right])=>Number(left.endsWith('not recorded'))-Number(right.endsWith('not recorded')) || left.localeCompare(right));
  const board=$('graph-company-groups');
  $('graph-overview-count').textContent=`${visibleCompanies.size} ${visibleCompanies.size===1 ? 'company' : 'companies'} in scope`;
  board.innerHTML=companySections.map(([label,items],index)=>`<section class="graph-company-group" aria-labelledby="graph-company-group-${index}">
    <h3 id="graph-company-group-${index}">${esc(label)} <span>${items.length}</span></h3>
    <ul>${items.sort(byName).map(entity=>{
      const params=writeExploration(new URLSearchParams(),{...scope,selected:entity.id,graphAnchor:entity.id});
      params.set('entity',entity.id);
      if (companyGroup==='country') params.set('group',companyGroup);
      return `<li><a class="graph-company-link" data-graph-company="${esc(entity.id)}" href="./graph.html?${esc(params.toString())}">${detailArtwork(entity,true)}<span>${esc(entity.name)}</span></a></li>`;
    }).join('')}</ul>
  </section>`).join('');
  board.querySelectorAll('img').forEach(img=>showGraphArtwork(img,img.nextElementSibling));
  renderCompanyMap(saved);
}

function companyViewKey() {
  const filters=writeExploration(new URLSearchParams(),{...scope,selected:'',graphAnchor:''});
  return `${companyGroup}:${filters}`;
}

function rememberCompanyView(id) {
  if (!companyLoom) return;
  const focused=document.activeElement;
  history.replaceState({...history.state,atlasCompanyView:{key:companyViewKey(),group:$('graph-company-zoom-group').value,
    camera:companyLoom.savedViewport(),scroll:window.scrollY,
    focus:id && (focused?.dataset.node===id || focused?.dataset.graphCompany===id) ? id : ''}},'');
}

function renderCompanyMap(saved) {
  const panel=$('graph-company-map');
  if (!panel) return;
  destroyCompanyMap();
  delete panel.dataset.renderer;
  const directory=$('graph-company-directory');
  const mapTools=$('graph-company-map-tools');
  const empty=companySections.length===0;
  directory.hidden=panel.hidden=mapTools.hidden=empty;
  $('graph-company-empty').hidden=!empty;
  if (empty) return;
  const groupControl=$('graph-company-zoom-group');
  const options='<option value="">All groups</option>'+companySections.map(([label,items])=>
    `<option value="${esc(label)}">${esc(label)} (${items.length})</option>`).join('');
  if (groupControl.dataset.options!==options) {
    groupControl.innerHTML=options;
    groupControl.dataset.options=options;
  }
  const selectedGroup=companySections.find(([label])=>label===saved?.group);
  const groups=selectedGroup ? [selectedGroup] : companySections;
  const ids=new Set(groups.flatMap(([,items])=>items.map(item=>item.id)));
  groupControl.value=selectedGroup?.[0] || '';
  const edges=store.graph.edges.filter(edge=>ids.has(edge.from) && ids.has(edge.to) && sourceUrl(edge.source));
  panel.dataset.view=selectedGroup ? 'group' : 'overview';
  $('graph-company-guide').textContent=selectedGroup
    ? `${selectedGroup[0]} · ${ids.size} ${ids.size===1?'company':'companies'}` : 'Choose a group to read company names.';
  document.dispatchEvent(new Event('atlas:controls-sync'));
  try {
    companyLoom=mountCompanyLoom({canvas:$('graph-company-loom'),controls:$('graph-company-nodes'),
      boundaries:$('graph-company-boundaries'),groups,edges,reading:Boolean(selectedGroup),saved:saved?.camera,
      traverse:openCompanyConnections,selectGroup:zoomCompanyGroup,reportZoom:reportCompanyZoom});
    panel.dataset.renderer='loom';
  } catch {
    panel.hidden=mapTools.hidden=true;
    directory.open=true;
  }
}

function reportCompanyZoom(percent) {
  const output=$('graph-company-zoom-number'), minus=$('graph-company-zoom-out');
  if (output.textContent!==`${percent}%`) output.textContent=`${percent}%`;
  if (minus.disabled!==(percent<=100)) minus.disabled=percent<=100;
}

function destroyCompanyMap() {
  companyLoom?.destroy();
  companyLoom=null;
}

function zoomCompanyGroup(group, moveFocus=false) {
  const control=$('graph-company-zoom-group');
  renderCompanyMap({group});
  $('graph-overview-heading').scrollIntoView({block:'nearest',behavior:'instant'});
  if (moveFocus) ($('graph-company-zoom-group-trigger') || control).focus({preventScroll:true});
}

function openCompanyConnections(id, keyboard) {
  traverse(id,keyboard,null);
  $('network-heading').scrollIntoView({block:'nearest',behavior:'instant'});
}

function showCompanyOverview(saved) {
  if (rootId) saveCamera();
  stopSimulation();resetLoom();layout=null;bounds=null;currentView=null;mapView=null;
  rootId=null;selectedId=null;renderedCameraKey=null;fullMap=false;
  $('graph-neighborhood').hidden=true;
  $('graph-company-overview').hidden=false;
  $('graph-title').textContent='Relationships';
  const view=saved?.key===companyViewKey() ? saved : null;
  renderCompanyOverview(view);
  if (view && Number.isFinite(view.scroll)) window.scrollTo({top:view.scroll,behavior:'instant'});
  if (view?.focus && companyLoom?.focusNode(view.focus)) return true;
  return false;
}

function renderGraphScope() {
  if (!$('graph-company-overview').hidden) { renderCompanyOverview(); return; }
  if (!currentView) return;
  const companyCount=currentView.nodes.filter(node=>visibleCompanies.has(node.id) && kinds.has('startup')).length;
  const label=companyCount===1?'1 company in scope':companyCount+' companies in scope';
  $('graph-count').textContent=mapView===currentView ? label+' · '+currentView.edges.length+' connections'
    : `${mapView.nodes.length-1} direct neighbours shown · ${currentView.edges.length} connections in list`;
  const nodes=new Map(currentView.nodes.map(node=>[node.id,node]));
  for (const node of mapControls().querySelectorAll('.network-node')) {
    const entity=nodes.get(node.dataset.node);
    const contextual=!visibleCompanies.has(entity.id)||!kinds.has('startup');
    node.setAttribute('data-context',String(contextual));
    node.setAttribute('aria-label',kindName(entity.kind)+': '+entity.name+(contextual?' · Relationship context':'')+'. Press Enter to follow connections; use arrow keys to move');
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
  $('graph-list').innerHTML='<div class="network-list-heading"><h3 tabindex="-1">All matching connections</h3><a href="#graph-list-toggle">Back to map</a></div>'+(items.length?'<ul>'+items.join('')+'</ul>':'<p class="detail-empty">No connections match the selected types.</p>');
  $('graph-list').hidden=!listVisible;
}
function relationshipText(edge) {
  if (edge.kind==='offers') return 'offers';
  if (edge.kind==='founded') return 'founded';
  if (edge.kind==='supports' && (!edge.description || edge.description==='Listed in portfolio')) return 'lists in portfolio';
  return edge.description || (edge.kind==='team_member' ? 'team member at' : 'connected to');
}
function syncGraphPrevious() {
  const button=$('graph-back');
  if (!button) return;
  const previous=history.state?.atlasGraphPrevious;
  const entity=store.graph.entities.find(entity=>entity.id===previous);
  button.hidden=!entity;
  button.setAttribute('aria-label',entity && previous!==rootId ? 'Previous view: '+entity.name : 'Previous view');
}
function writeState(push=false, previous=rootId, followed=null) {
  if (!rootId && $('graph-company-overview').hidden) return;
  const params=new URLSearchParams(location.search);
  params.delete('startup');
  if (rootId) params.set('entity',rootId); else params.delete('entity');
  if (rootId && !selectedId) params.set('inspection','none'); else params.delete('inspection');
  if (companyGroup==='country') params.set('group',companyGroup); else params.delete('group');
  scope={...scope,graphAnchor:rootId || '',selected:selectedId || ''};
  writeExploration(params,scope);
  if(depth===2)params.set('depth','2');else params.delete('depth');
  if(kinds.size===entityKinds.length)params.delete('types');else params.set('types',entityKinds.filter(kind=>kinds.has(kind)).join(','));
  if(listVisible)params.set('list','1');else params.delete('list');
  const method=push?'pushState':'replaceState';
  const next=params.size ? '?'+params.toString() : '';
  if (next!==location.search) {
    const state=push ? { ...history.state, atlasGraphPrevious:previous,
      atlasGraphFrom:previous!==rootId ? followed : history.state?.atlasGraphFrom } : history.state;
    history[method]?.(state,'',location.pathname+next+(location.hash || ''));
  }
  syncGraphPrevious();
  document.dispatchEvent(new CustomEvent('atlas:exploration-change',{detail:{...scope}}));
}
function syncPin() {
  const button = $('graph-pin');
  if (!button) return;
  button.disabled = !mapView?.nodes.some(node=>node.id===selectedId);
  button.setAttribute('aria-pressed',String(!button.disabled && pinned.has(selectedId)));
}
function updateSelection() {
  const canCenter=mapView?.nodes.some(node=>node.id===selectedId);
  const center=$('graph-center');
  if (center) center.disabled=!canCenter;
  syncPin();
  const inspectionLink=document.querySelector?.('.network-inspector-link');
  if (inspectionLink) inspectionLink.hidden=!selectedId;
  for(const element of mapControls().querySelectorAll('.network-node')) {
    const selected=element.dataset.node===selectedId;
    element.classList.toggle('is-selected',selected);element.setAttribute('aria-pressed',String(selected));
  }
  if (loom) { loom.select(selectedId);return; }
  layout?.edges.forEach((edge,index)=>{
    $('graph-canvas').querySelector('[data-edge="'+index+'"]')?.classList.toggle('is-selected',edge.from===selectedId || edge.to===selectedId);
  });
  updateEdgeCaptions();
}
function detailArtwork(entity, mini=false) {
  const { url, classes }=graphArtwork(entity);
  const image=url ? `<img src="${esc(url)}" alt="" decoding="async"${mini ? ' loading="lazy"' : ''} referrerpolicy="no-referrer">` : '';
  return `<span class="${mini ? 'detail-mini' : 'detail-mark'}${url ? ' has-logo' : ''} ${classes}" aria-hidden="true">${image}<span class="detail-mark-fallback">${esc(graphInitials(entity.name))}</span></span>`;
}
function renderDetail() {
  if (!selectedId) {
    $('graph-detail').innerHTML='<h2>Inspect a connection</h2><p class="detail-empty">Select a node or a record in the connections list to see its sources.</p>';
    return;
  }
  const details=entityDetails(store.graph,selectedId), entity=details.entity, names=new Map(details.related.map(item=>[item.id,item]));
  const visibleIds=new Set(mapView?.nodes.map(node=>node.id));
  const listedIds=new Set(currentView?.nodes.map(node=>node.id));
  const orderedEdges = [...details.edges].sort((a,b)=>Number(b.kind==='founded')-Number(a.kind==='founded'));
  const related=orderedEdges.map(edge=>{
    const other=names.get(edge.from===selectedId?edge.to:edge.from);if(!other)return '';
    const location=listedIds.has(other.id) ? 'In connections list' : 'Outside current map';
    return '<li>'+detailArtwork(other,true)+'<div class="detail-connection-copy"><button type="button" data-select="'+esc(other.id)+'">'+esc(other.name)+'</button><small>'+esc(relationshipText(edge))+'</small>'+(visibleIds.has(other.id)?'':'<small class="detail-outside">'+location+'</small>')+evidence(edge.source,'Relationship source')+'</div></li>';
  }).filter(Boolean);
  const rounds=[...details.rounds].sort((a,b)=>(b.announced_on||'').localeCompare(a.announced_on||''));
  const articles=[...details.articles].sort((a,b)=>(b.published_on||'').localeCompare(a.published_on||''));
  const summary=entity.summary || 'This entry is connected to the sources and organisations below. More details are being researched.';
  const source=evidence(entity.source,'Profile source')+evidence(entity.website,entity.kind==='person'?'Professional profile':'Website')+evidence(entity.logo_source,'Image source');
  const isRoot=selectedId===rootId;
  const outOfScope=entity.kind==='startup'&&!visibleCompanies.has(selectedId);
  const selectionNote=outOfScope?'Outside current results':isRoot?'Map centred here.':visibleIds.has(selectedId)?'Selected within this map.':listedIds.has(selectedId)?'Selected in the connections list.':'Selected outside this map.';
  const inspectAction=isRoot?'':'<button class="detail-explore atlas-button" type="button" data-explore="'+esc(entity.id)+'">Explore from here</button>';
  const company=dimensions.get(selectedId);
  const headquarters=company?.location || (company?.country ? [company.city,countryName(company.country)].filter(Boolean).join(', ') : 'Not recorded');
  const recovery=outOfScope?'<div class="graph-recovery"><button type="button" data-graph-adjust>Adjust filters</button><button type="button" data-graph-clear>Clear selection</button></div>':'';
  const actions=company?'<div class="graph-workspace-actions" data-company-name="'+esc(entity.name)+'"><button type="button" class="atlas-button" data-atlas-save-company="'+esc(entity.id)+'">Save</button><button type="button" class="atlas-button" data-atlas-compare="'+esc(entity.id)+'">Compare</button></div>':'';
  const facts=company?'<dl class="graph-company-facts"><div><dt>'+(company.businessBase?'Business base':'Headquarters')+'</dt><dd>'+esc(headquarters)+'</dd></div><div><dt>Primary sector</dt><dd>'+esc(company.sector || 'Not recorded')+'</dd></div></dl>':'';
  const identityIcon = {startup:'company',partner:'partners',person:'person',programme:'programme',provider:'provider'}[entity.kind] || 'company';
  const from = isRoot && history.state?.atlasGraphFrom;
  const followed = from && orderedEdges.find(edge=>(edge.from===from || edge.to===from) && sourceUrl(edge.source));
  const reviewed = followed || orderedEdges.find(edge=>sourceUrl(edge.source));
  const nameOf = id => id===selectedId ? entity.name : names.get(id)?.name;
  const reviewedRelation = reviewed && nameOf(reviewed.from) && nameOf(reviewed.to)
    ? `<div class="detail-relation-evidence"><h3>${followed ? 'Relationship followed' : 'Relationship evidence'}</h3>
      <p><strong>${esc(nameOf(reviewed.from))}</strong> ${esc(relationshipText(reviewed))} <strong>${esc(nameOf(reviewed.to))}</strong></p>
      ${evidence(reviewed.source,'Read relationship source')}</div>` : '';
  $('graph-detail').innerHTML=`<div class="detail-heading">${detailArtwork(entity)}<h2>${esc(entity.name)}</h2><p class="detail-kind">${icon(identityIcon)}${entity.kind==='startup' ? 'Company' : esc(kindName(entity.kind))}</p></div>
    <p class="detail-selection-note" data-selection="${outOfScope?'excluded':isRoot?'root':visibleIds.has(selectedId)?'within':'outside'}">${selectionNote}</p>${recovery}
    ${facts}<p class="detail-summary">${esc(summary)}</p>${reviewedRelation}
    <div class="detail-actions"><a class="detail-open atlas-button atlas-button-accent" data-atlas-profile-link href="${esc(entityHref(entity))}">Open profile${icon('external')}</a>${inspectAction}${actions}</div>
    <section class="detail-section"><h3>Recorded connections <span>${details.edges.length}</span></h3>${related.length?'<ul class="detail-related">'+related.join('')+'</ul>':'<p class="detail-empty">No reviewed connections yet.</p>'}</section>
    ${company?'<section class="detail-section"><h3>Recorded financing <span>'+rounds.length+'</span></h3>'+(rounds.length?rounds.map(round=>'<div class="detail-round"><strong>'+esc(round.stage||'Funding event')+' · '+esc(money(round.amount,round.currency,round.amount_text))+'</strong><span>'+esc(round.announced_on||'Date not recorded')+'</span>'+evidence(round.source,'Funding source')+'</div>').join(''):'<p class="detail-empty">No recorded financing events.</p>')+'</section>':''}
    ${company?'<section class="detail-section"><h3>Articles <span>'+articles.length+'</span></h3>'+(articles.length?articles.map(article=>'<div class="detail-round"><strong>'+esc(article.title||'Article')+'</strong><span>'+esc(article.published_on||'Date not recorded')+'</span>'+evidence(article.url,'Article source')+'</div>').join(''):'<p class="detail-empty">No recorded articles.</p>')+'</section>':''}
    ${source?'<section class="detail-section"><h3>Sources</h3>'+source+'</section>':''}`;
  $('graph-detail').querySelectorAll('img').forEach(img=>showGraphArtwork(img,img.nextElementSibling));
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
function explore(id,writeHistory=true,followed=null) {
  if (writeHistory) rememberCompanyView(id);
  destroyCompanyMap();
  $('graph-company-overview').hidden=true;
  $('graph-neighborhood').hidden=false;
  if(!store.graph.entities.some(entity=>entity.id===id)) {
    stopSimulation();resetLoom();layout=null;bounds=null;currentView=null;mapView=null;rootId=null;selectedId=null;renderedCameraKey=null;
    if($('graph-full-map'))$('graph-full-map').hidden=true;
    $('graph-detail').innerHTML='<p class="detail-empty">This entry is not in the published graph. Search for another organisation.</p>';
    $('graph-canvas').innerHTML='<text x="460" y="320" text-anchor="middle">Entry not found</text>';
    $('graph-count').textContent='0 entities shown';
    if($('graph-title'))$('graph-title').textContent='Relationships';
    if($('network-heading'))$('network-heading').textContent='Connections';
    return;
  }
  const previous=rootId;
  if (rootId!==id) { if (writeHistory) saveCamera();rootId=id; }
  selectedId=id;
  renderMap();
  if(writeHistory)writeState(true,previous,followed);
  renderDetail();
}

function traverse(id, focusMap=false, followed=rootId) {
  if (!store?.graph.entities.some(entity=>entity.id===id)) return;
  if (id===rootId) select(id);
  else explore(id,true,followed);
  if (focusMap) focusMapNode(id);
}

function traverseMap(id, focusMap=false) {
  const canvas=$('graph-canvas').parentElement;
  const before=canvas?.getBoundingClientRect();
  traverse(id,focusMap);
  if (before && before.top<innerHeight && before.bottom>0) {
    const delta=canvas.getBoundingClientRect().top-before.top;
    if (delta) window.scrollBy({top:delta,behavior:'instant'});
  }
}

function focusMapNode(id) {
  if (loom) loom.focusControl(id);
  else $('graph-canvas').querySelector('.network-node.is-root')?.focus({preventScroll:true});
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
  const id=target.dataset.explore || target.dataset.select;
  traverse(id,Boolean(target.dataset.explore),event.currentTarget===$('graph-results') ? null : rootId);
  if (event.currentTarget===$('graph-detail') && !target.dataset.explore) $('graph-detail').querySelector('.detail-open')?.focus({preventScroll:true});
  if (event.currentTarget===$('graph-list')) $('graph-list').querySelector('h3')?.focus({preventScroll:true});
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
svg.addEventListener('focusin',event=>{
  const node=event.target.closest('.network-node:focus-visible');
  if(!node) return;
  const card=node.querySelector('.node-shell').getBoundingClientRect();
  const view=svg.getBoundingClientRect();
  if(card.left<view.left || card.right>view.right || card.top<view.top || card.bottom>view.bottom) centerNode(node.dataset.node);
});
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
    if(!completed.moved)traverseMap(completed.node.id);
  }
}
svg.addEventListener('pointerup',finishGesture);
svg.addEventListener('pointercancel',finishGesture);
svg.addEventListener('click',event=>{if(suppressClick){suppressClick=false;return;}const node=event.target.closest('[data-node]');if(node)traverseMap(node.dataset.node);});
svg.addEventListener('keydown',event=>{
  const element=event.target.closest('[data-node]');if(!element)return;
  if(event.key==='Enter'||event.key===' '){event.preventDefault();traverseMap(element.dataset.node,true);return;}
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
  if(rootId){renderMap();renderDetail();writeState();}
  if(!$('graph-results').hidden)renderSearchResults();
});
$('graph-depth').addEventListener('change',event=>{
  const next=Number(event.target.value)===2?2:1;
  if (depth!==next) {saveCamera();depth=next;}
  if(store&&rootId){renderMap();renderDetail();writeState();}
});
$('graph-list-toggle').addEventListener('click',()=>{
  listVisible=!listVisible;
  syncListVisibility();
  writeState();
  if (!listVisible) return;
  const heading=$('graph-list').querySelector('h3');
  const bounds=heading?.getBoundingClientRect();
  if (bounds && (bounds.top<0 || bounds.bottom>innerHeight)) {
    heading.focus({preventScroll:true});
    heading.scrollIntoView({block:'start',behavior:'instant'});
  }
});
function syncListVisibility() {
  $('graph-list-toggle').setAttribute('aria-pressed',String(listVisible));
  $('graph-list-toggle').querySelector('span').textContent=listVisible?'Hide connections':'Connections list';
  $('graph-list').hidden=!listVisible;
}
function changeZoom(delta) {
  if (loom) loom.zoom(delta);
  else { zoom=Math.min(1.7,Math.max(.7,zoom+delta));applyZoom(); }
  saveCamera();
}
$('graph-zoom-in').addEventListener('click',()=>changeZoom(.2));
$('graph-zoom-out').addEventListener('click',()=>changeZoom(-.2));
$('graph-back')?.addEventListener('click',()=>history.back());
$('graph-back-to-companies').addEventListener('click',()=>{
  const previous=rootId;
  const regainedFocus=showCompanyOverview(history.state?.atlasCompanyView);
  writeState(true,previous);
  if (!regainedFocus) $('graph-overview-heading').focus({preventScroll:Boolean(history.state?.atlasCompanyView)});
});
$('graph-company-group').addEventListener('change',event=>{
  rememberCompanyView();
  companyGroup=event.target.value;
  renderCompanyOverview();
  writeState(true);
});
$('graph-company-zoom-group')?.addEventListener('change',event=>zoomCompanyGroup(event.target.value));
$('graph-company-zoom-in')?.addEventListener('click',()=>companyLoom?.zoom(1));
$('graph-company-zoom-out')?.addEventListener('click',()=>companyLoom?.zoom(-1));
$('graph-company-fit')?.addEventListener('click',()=>zoomCompanyGroup(''));
$('graph-company-open-list')?.addEventListener('click',()=>{
  const list=$('graph-company-directory');
  list.open=true;
  const summary=list.querySelector('summary');
  summary.focus({preventScroll:true});
  summary.scrollIntoView({block:'start',behavior:'instant'});
});
$('graph-company-groups').addEventListener('click',event=>{
  const link=event.target.closest('[data-graph-company]');
  if (!link || event.button!==0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  openCompanyConnections(link.dataset.graphCompany,event.detail===0);
});
$('graph-full-map')?.addEventListener('click',()=>{
  if (!rootId) return;
  saveCamera();fullMap=!fullMap;
  renderMap();renderDetail();
});
$('graph-fit')?.addEventListener('click',()=>{
  if(!currentView)return;
  if (loom) loom.fit();
  else {bounds=layoutBounds(layout);zoom=1;pan={x:0,y:0};applyZoom();}
  saveCamera();
});
function centerNode(id) {
  if (loom) {
    if (mapView.nodes.some(node=>node.id===id)) { loom.center(id);saveCamera(); }
    return;
  }
  const node=layout?.nodes.find(node=>node.id===id);
  if (!node || !bounds) return;
  pan={x:node.x-bounds.x-bounds.width/2,y:node.y-bounds.y-bounds.height/2};
  applyZoom();saveCamera();
}
$('graph-center')?.addEventListener('click',()=>centerNode(selectedId));
$('graph-pin')?.addEventListener('click',()=>{
  if (loom) {
    if (mapView.nodes.some(node=>node.id===selectedId)) loom.setPin(selectedId,pinned.has(selectedId));
    return;
  }
  const selected = layout?.nodes.find(node=>node.id===selectedId);
  if (!selected) return;
  if (pinned.has(selected.id)) { pinned.delete(selected.id); reheat(); }
  else pinned.set(selected.id,{x:selected.x,y:selected.y});
  saveCamera();
});
$('graph-reset').addEventListener('click',()=>{if(store&&rootId){renderMap({resetCamera:true});saveCamera();}});
function restoreFromUrl() {
  if(!store)return;
  const active=document.activeElement;
  const restoreMapFocus=mapControls().contains?.(active);
  const previous=$('graph-back');
  clearTimeout(searchTimer);
  const params=new URLSearchParams(location.search),nextScope=readExploration(params);
  const nextRoot=params.get('entity')||params.get('startup')||nextScope.graphAnchor||nextScope.selected||null;
  companyGroup=params.get('group')==='country' ? 'country' : 'sector';
  $('graph-company-group').value=companyGroup;
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
  let restoredCompanyFocus=false;
  if (!nextRoot) restoredCompanyFocus=showCompanyOverview(history.state?.atlasCompanyView);
  else if(nextRoot!==rootId)explore(nextRoot,false);
  else if(mapChanged)renderMap();
  else renderGraphScope();
  const selected=params.get('inspection')==='none' ? null
    : store.graph.entities.some(entity=>entity.id===nextScope.selected) ? nextScope.selected : rootId;
  if(rootId)select(selected,false);
  renderSearchResults();
  writeState();
  if (restoreMapFocus || (active===previous && previous?.hidden)) {
    if (rootId) focusMapNode(rootId);
    else if (!restoredCompanyFocus) $('graph-overview-heading').focus({preventScroll:true});
  }
}
window.addEventListener('popstate',restoreFromUrl);
window.addEventListener('pagehide',event=>{
  if (!event.persisted) { destroyCompanyMap(); atlasExplorer?.destroy(); atlasExplorer=null; }
  if (!loom) return;
  saveCamera();
  if (!event.persisted) loom.destroy();
});
function resizeMap() {
  if (!store || !rootId) return;
  const focusedId=mapControls().contains?.(document.activeElement) ? document.activeElement?.dataset?.node : null;
  saveCamera();renderMap();renderDetail();
  if (focusedId) focusMapNode(mapView.nodes.some(node=>node.id===focusedId) ? focusedId : rootId);
}
compact?.addEventListener?.('change',resizeMap);
mobileOverview?.addEventListener?.('change',resizeMap);

document.addEventListener('atlas:export-records',event=>{
  if (!$('graph-company-overview').hidden) {
    event.detail.records=searchMatches.filter(node=>visibleCompanies.has(node.id));
    return;
  }
  if (!currentView) return;
  event.detail.records = currentView.nodes.filter(node=>kinds.has(node.kind) && (node.kind!=='startup' || visibleCompanies.has(node.id)));
});
const typeMenu = document.querySelector?.('.network-types');
typeMenu?.addEventListener('keydown',event=>{
  if (event.key==='Escape' && typeMenu.open) {
    typeMenu.open = false;
    typeMenu.querySelector('summary').focus();
  }
});
document.addEventListener('pointerdown',event=>{
  if (typeMenu?.open && !typeMenu.contains(event.target)) typeMenu.open = false;
});

try {
  store=await openGraph();
  if(store.mode==='fallback')$('graph-status').textContent='Showing the published backup while the database is unavailable.';
  const {technology}=await loadTreemapEvidence(store);
  dimensions=indexCompanies(store.graph,technology);
  const host=$('graph-exploration');
  controls=mountExploration(host,{companies:store.graph.entities,dimensions,onChange:changeScope,fieldsHost:$('graph-location-fields'),
    narrowQuery:'(max-width: 620px), (max-width: 920px) and (max-height: 540px)'});
  if (host) host.hidden=false;
  restoreFromUrl();
} catch {
  $('graph-status').textContent='The graph could not be loaded. Refresh to try again.';
  $('graph-detail').innerHTML='<p class="detail-empty">Profiles are temporarily unavailable.</p>';
  $('graph-canvas').innerHTML='<text x="460" y="320" text-anchor="middle">Graph unavailable</text>';
}

// On-demand atlas overview (#367): an additional whole-graph view fed by
// the Loom atlas export. It is independent of the explorer above — any
// failure leaves the section hidden and the full-graph path untouched,
// which stays the fallback until the atlas path is verified live.
try {
  const section=$('graph-atlas');
  atlasExplorer=await mountAtlasExplorer({
    canvas:$('graph-atlas-canvas'),
    topicsHost:$('graph-atlas-topics'),
    reveal:()=>{section.hidden=false;},
    onStatus:text=>{$('graph-atlas-status').textContent=text;},
    onPick:text=>{$('graph-atlas-pick').textContent=text;},
  });
} catch {
  atlasExplorer=null;
  const section=$('graph-atlas');
  if (section) section.hidden=true;
}
