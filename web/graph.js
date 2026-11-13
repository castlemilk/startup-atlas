import { escapeHtml as esc, sourceUrl } from './logic.js';
import { logoFor } from './logos.js';
import { openGraph } from './graph-store.js';
import { entityDetails, entityHref, kindName, neighborhood } from './graph-model.js';
import { createForceSimulation, groupBounds, layoutBounds, layoutNetwork } from './graph-layout.js';

const $=id=>document.getElementById(id);
const kinds=new Set(['startup','partner','person','programme','provider']);
const compact=window.matchMedia?.('(max-width: 600px)');
let store, selectedId, depth=1, zoom=1, listVisible=false, searchTimer;
let layout, bounds, simulation, frame=null, pan={x:0,y:0}, gesture=null, suppressClick=false;
const reducedMotion=window.matchMedia?.('(prefers-reduced-motion: reduce)');
const pinned=new Map();
const initials=name=>name.trim().split(/\s+/).slice(0,2).map(part=>part[0]||'').join('').toUpperCase();
const imageUrl=value=>sourceUrl(value)||(/^\.\/assets\/logos\/[a-z0-9-]+\.(?:svg|png)$/i.test(value||'')?value:'');
const entityImage=entity=>imageUrl(entity.logo)||imageUrl(logoFor(entity.name));
const evidence=(url,label='Source')=>{const safe=sourceUrl(url);return safe?'<a class="detail-source" href="'+esc(safe)+'" target="_blank" rel="noopener noreferrer">'+esc(label)+' ↗</a>':'';};
const money=(value,currency)=>{if(value==null||!currency)return 'Amount not disclosed';try{return new Intl.NumberFormat('en-AU',{style:'currency',currency,maximumFractionDigits:0}).format(Number(value));}catch{return String(value)+' '+currency;}};

function renderNode(node) {
  const root=node.id===selectedId, url=entityImage(node), x=-node.width/2, y=-node.height/2;
  const iconX=x+25, nameX=x+49, nameY=node.lines.length>1?-6:1;
  const label=node.lines.map((line,index)=>'<tspan x="'+nameX+'" dy="'+(index?15:0)+'">'+esc(line)+'</tspan>').join('');
  const img=url?'<image href="'+esc(url)+'" x="'+(iconX-15)+'" y="-15" width="30" height="30" preserveAspectRatio="xMidYMid meet"></image>':'';
  return '<g class="network-node'+(root?' is-root':'')+'" data-node="'+esc(node.id)+'" data-kind="'+esc(node.kind)+'" role="button" tabindex="0" aria-label="'+esc(kindName(node.kind)+': '+node.name+'. Press Enter to explore; use arrow keys to move')+'" transform="translate('+node.x.toFixed(1)+' '+node.y.toFixed(1)+')"><rect class="node-shell" x="'+x+'" y="'+y+'" width="'+node.width+'" height="'+node.height+'" rx="12"></rect><circle class="node-avatar" cx="'+iconX+'" cy="0" r="19"></circle><text class="node-initials" x="'+iconX+'"'+(url?' visibility="hidden"':'')+'>'+esc(initials(node.name))+'</text>'+img+'<text class="node-label" y="'+nameY+'">'+label+'</text><text class="node-kind" x="'+nameX+'" y="'+(nameY+(node.lines.length-1)*15+14)+'">'+esc(kindName(node.kind))+'</text><circle class="node-port" cx="'+x+'" cy="0" r="3"></circle><circle class="node-port" cx="'+(-x)+'" cy="0" r="3"></circle></g>';
}
function edgePath(a,b) {
  const dx=b.x-a.x,dy=b.y-a.y, horizontal=Math.abs(dx)/(a.width+b.width)>Math.abs(dy)/(a.height+b.height);
  if(horizontal) {
    const sign=dx>=0?1:-1, x1=a.x+sign*a.width/2, x2=b.x-sign*b.width/2, bend=Math.max(36,Math.abs(x2-x1)*.45);
    return `M ${x1} ${a.y} C ${x1+sign*bend} ${a.y}, ${x2-sign*bend} ${b.y}, ${x2} ${b.y}`;
  }
  const sign=dy>=0?1:-1,y1=a.y+sign*a.height/2,y2=b.y-sign*b.height/2,bend=Math.max(36,Math.abs(y2-y1)*.45);
  return `M ${a.x} ${y1} C ${a.x} ${y1+sign*bend}, ${b.x} ${y2-sign*bend}, ${b.x} ${y2}`;
}
function applyZoom() {
  if(!bounds)return;
  const w=bounds.width/zoom,h=bounds.height/zoom;
  $('graph-canvas').setAttribute('viewBox',[bounds.x+(bounds.width-w)/2+pan.x,bounds.y+(bounds.height-h)/2+pan.y,w,h].join(' '));
}
function updateGeometry() {
  const svg=$('graph-canvas'), byId=new Map(layout.nodes.map(node=>[node.id,node]));
  for(const element of svg.querySelectorAll('.network-node')) {const node=byId.get(element.dataset.node);if(node)element.setAttribute('transform',`translate(${node.x} ${node.y})`);}
  layout.edges.forEach((edge,index)=>svg.querySelector('[data-edge="'+index+'"]')?.setAttribute('d',edgePath(byId.get(edge.from),byId.get(edge.to))));
  for(const group of layout.groups) {
    const area=groupBounds(layout.nodes.filter(node=>node.group===group.key));
    const ellipse=svg.querySelector('[data-group="'+group.key+'"]'),label=svg.querySelector('[data-group-label="'+group.key+'"]');
    if(ellipse&&area)for(const key of ['cx','cy','rx','ry'])ellipse.setAttribute(key,area[key]);
    if(label&&area){label.setAttribute('x',area.cx);label.setAttribute('y',area.labelY);}
  }
}
function stopSimulation() {
  if(frame!==null&&typeof window.cancelAnimationFrame==='function')window.cancelAnimationFrame(frame);
  frame=null;
}
function reheat() {
  stopSimulation();
  if(!simulation)return;
  if(reducedMotion?.matches||typeof window.requestAnimationFrame!=='function') {
    for(let i=0;i<70;i++)simulation.tick(Math.max(.15,1-i/80));
    updateGeometry();return;
  }
  let remaining=120;
  const step=()=>{
    simulation.tick(Math.max(.15,remaining/120));updateGeometry();
    remaining--;
    frame=remaining>0?window.requestAnimationFrame(step):null;
  };
  frame=window.requestAnimationFrame(step);
}
function renderMap() {
  stopSimulation();
  const view=neighborhood(store.graph,selectedId,{depth,kinds,limit:compact?.matches?(depth===1?10:13):(depth===1?19:25)});
  layout=layoutNetwork(view,selectedId,pinned);bounds=layoutBounds(layout);simulation=createForceSimulation(layout,pinned);
  const byId=new Map(layout.nodes.map(node=>[node.id,node]));
  const areas=layout.groups.map(group=>{const area=groupBounds(layout.nodes.filter(node=>node.group===group.key));return '<ellipse class="network-group" data-group="'+group.key+'" cx="'+area.cx+'" cy="'+area.cy+'" rx="'+area.rx+'" ry="'+area.ry+'"></ellipse><text class="network-group-label" data-group-label="'+group.key+'" x="'+area.cx+'" y="'+area.labelY+'">'+group.label+'</text>';}).join('');
  const lines=layout.edges.map((edge,index)=>'<path class="network-link" data-edge="'+index+'" d="'+edgePath(byId.get(edge.from),byId.get(edge.to))+'"></path>').join('');
  $('graph-canvas').innerHTML='<g aria-hidden="true">'+areas+lines+'</g>'+layout.nodes.map(renderNode).join('');
  $('graph-canvas').querySelectorAll('.network-node image').forEach(img=>img.addEventListener('error',()=>{img.setAttribute('visibility','hidden');img.previousElementSibling?.removeAttribute('visibility');}));
  $('graph-count').textContent=view.nodes.length+' entities shown'+(view.truncated?' · view limited':'');
  applyZoom();renderList(view);
}
function renderList(view) {
  const names=new Map(view.nodes.map(item=>[item.id,item]));
  const items=view.edges.map(edge=>{
    const from=names.get(edge.from),to=names.get(edge.to);if(!from||!to)return '';
    const source=sourceUrl(edge.source);
    return '<li><button type="button" data-select="'+esc(from.id)+'">'+esc(from.name)+'</button><span>→ '+esc(edge.description||'Connected to')+' →</span><button type="button" data-select="'+esc(to.id)+'">'+esc(to.name)+'</button>'+(source?'<a href="'+esc(source)+'" target="_blank" rel="noopener noreferrer">Evidence ↗</a>':'')+'</li>';
  }).filter(Boolean);
  $('graph-list').innerHTML='<h3>Visible connections</h3>'+(items.length?'<ul>'+items.join('')+'</ul>':'<p class="detail-empty">No connections match the selected types.</p>');
  $('graph-list').hidden=!listVisible;
}
function renderDetail() {
  const details=entityDetails(store.graph,selectedId), entity=details.entity, names=new Map(details.related.map(item=>[item.id,item]));
  const related=details.edges.map(edge=>{
    const other=names.get(edge.from===selectedId?edge.to:edge.from);if(!other)return '';
    const image=entityImage(other);
    const icon=image?'<img src="'+esc(image)+'" alt="" loading="lazy" referrerpolicy="no-referrer"><span class="detail-mark-fallback" hidden>'+esc(initials(other.name))+'</span>':esc(initials(other.name));
    return '<li><span class="detail-mini" aria-hidden="true">'+icon+'</span><button type="button" data-select="'+esc(other.id)+'">'+esc(other.name)+'<small>'+esc(edge.description||kindName(other.kind))+'</small></button></li>';
  }).filter(Boolean);
  const url=entityImage(entity),rounds=[...details.rounds].sort((a,b)=>(b.announced_on||'').localeCompare(a.announced_on||''));
  const logo='<span class="detail-mark '+(entity.kind==='person'?'person':'')+'">'+(url?'<img src="'+esc(url)+'" alt="" referrerpolicy="no-referrer"><span class="detail-mark-fallback" hidden>'+esc(initials(entity.name))+'</span>':esc(initials(entity.name)))+'</span>';
  const summary=entity.summary || 'This entry is connected to the sources and organisations below. More details are being researched.';
  const source=evidence(entity.source,'Profile source')+evidence(entity.website,entity.kind==='person'?'Professional profile':'Website')+evidence(entity.logo_source,'Image source');
  $('graph-detail').innerHTML='<p class="detail-eyebrow">SELECTED PROFILE</p><div class="detail-heading">'+logo+'<div><p class="detail-kind">'+esc(kindName(entity.kind))+'</p><h2>'+esc(entity.name)+'</h2></div></div><p class="detail-summary">'+esc(summary)+'</p><a class="detail-open" href="'+esc(entityHref(entity))+'">Open profile ↗</a><section class="detail-section"><h3>CONNECTIONS</h3>'+(related.length?'<ul class="detail-related">'+related.slice(0,8).join('')+'</ul>'+(related.length>8?'<p class="detail-caption">Open the profile or list view for more connections.</p>':''):'<p class="detail-empty">No reviewed connections yet.</p>')+'</section>'+(entity.kind==='startup'?'<section class="detail-section"><h3>FUNDING</h3>'+(rounds.length?rounds.slice(0,2).map(round=>'<div class="detail-round"><strong>'+esc(round.stage)+' · '+esc(money(round.amount,round.currency))+'</strong><span>'+esc(round.announced_on||'Date not disclosed')+' · historical announcement</span></div>').join(''):'<p class="detail-empty">Funding has not been researched yet.</p>')+'</section>':'')+(source?'<section class="detail-section"><h3>SOURCES</h3>'+source+'</section>':'');
  $('graph-detail').querySelectorAll('img').forEach(img=>img.addEventListener('error',()=>{img.hidden=true;if(img.nextElementSibling)img.nextElementSibling.hidden=false;}));
}
function select(id,writeHistory=true) {
  if(!store.graph.entities.some(entity=>entity.id===id)) {
    $('graph-detail').innerHTML='<p class="detail-empty">This entry is not in the published graph. Search for another organisation.</p>';
    $('graph-canvas').innerHTML='<text x="460" y="320" text-anchor="middle">Entry not found</text>';
    $('graph-count').textContent='0 entities shown';
    return;
  }
  selectedId=id;zoom=1;pan={x:0,y:0};pinned.clear();
  if(writeHistory)history.pushState(null,'','?entity='+encodeURIComponent(id));
  renderMap();renderDetail();
}
function renderSearch() {
  if(!store)return;
  const query=$('graph-query').value.trim();
  if(!query){$('graph-results').hidden=true;$('graph-results').innerHTML='';return;}
  try {
    const results=store.search(query).filter(item=>kinds.has(item.kind));
    $('graph-results').innerHTML=results.length?results.map(item=>'<button class="explorer-result" type="button" data-select="'+esc(item.id)+'"><strong>'+esc(item.name)+'</strong><small>'+esc(kindName(item.kind))+'</small></button>').join(''):'<p>No matching entries. Try another name or show more entity types.</p>';
    $('graph-results').hidden=false;
  } catch {
    $('graph-results').innerHTML='<p>Search is unavailable. Try again.</p>';$('graph-results').hidden=false;
  }
}
function selectFromEvent(event) {
  const target=event.target.closest('[data-select]');if(!target)return;
  $('graph-results').hidden=true;select(target.dataset.select);
}
$('graph-search').addEventListener('submit',event=>{event.preventDefault();clearTimeout(searchTimer);renderSearch();});
$('graph-query').addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(renderSearch,180);});
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
  if(event.key==='Enter'||event.key===' '){event.preventDefault();select(element.dataset.node);svg.querySelector('.network-node.is-root')?.focus();return;}
  const directions={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]},direction=directions[event.key];
  if(!direction)return;event.preventDefault();
  const node=layout.nodes.find(item=>item.id===element.dataset.node),step=event.shiftKey?50:20;
  node.x+=direction[0]*step;node.y+=direction[1]*step;pinned.set(node.id,{x:node.x,y:node.y});
  element.setAttribute('transform',`translate(${node.x} ${node.y})`);updateGeometry();reheat();
});
$('graph-filters').addEventListener('click',event=>{const button=event.target.closest('button[data-kind]');if(!button||!store)return;const kind=button.dataset.kind;if(kinds.has(kind))kinds.delete(kind);else kinds.add(kind);button.setAttribute('aria-pressed',String(kinds.has(kind)));renderMap();if(!$('graph-results').hidden)renderSearch();});
$('graph-depth').addEventListener('change',event=>{depth=Number(event.target.value)===2?2:1;if(store&&selectedId)renderMap();});
$('graph-list-toggle').addEventListener('click',()=>{listVisible=!listVisible;$('graph-list-toggle').setAttribute('aria-pressed',String(listVisible));$('graph-list-toggle').querySelector('span').textContent=listVisible?'Hide list':'List view';$('graph-list').hidden=!listVisible;});
$('graph-zoom-in').addEventListener('click',()=>{zoom=Math.min(1.7,zoom+.2);applyZoom();});
$('graph-zoom-out').addEventListener('click',()=>{zoom=Math.max(.7,zoom-.2);applyZoom();});
$('graph-reset').addEventListener('click',()=>{zoom=1;pan={x:0,y:0};pinned.clear();if(store&&selectedId)renderMap();});
window.addEventListener('popstate',()=>{const params=new URLSearchParams(location.search);select(params.get('entity')||params.get('startup')||'startup:canva',false);});
compact?.addEventListener?.('change',()=>{if(store&&selectedId)renderMap();});

try {
  store=await openGraph();
  if(store.mode==='fallback')$('graph-status').textContent='Showing the published backup while the database is unavailable.';
  const params=new URLSearchParams(location.search);
  select(params.get('entity')||params.get('startup')||'startup:canva',false);
  if(params.get('q')){$('graph-query').value=params.get('q');renderSearch();}
} catch {
  $('graph-status').textContent='The graph could not be loaded. Refresh to try again.';
  $('graph-detail').innerHTML='<p class="detail-empty">Profiles are temporarily unavailable.</p>';
  $('graph-canvas').innerHTML='<text x="460" y="320" text-anchor="middle">Graph unavailable</text>';
}
