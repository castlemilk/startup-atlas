import { escapeHtml as esc, sourceUrl } from './logic.js';
import { logoFor } from './logos.js';
import { openGraph } from './graph-store.js';
import { entityDetails, entityHref, kindName, neighborhood } from './graph-model.js';
import { createForceSimulation, layoutBounds, layoutNetwork } from './graph-layout.js';
import { renderIcon as icon } from './atlas-icons.js';

const $=id=>document.getElementById(id);
const entityKinds=['startup','partner','person','programme','provider'];
const kinds=new Set(entityKinds);
const compact=window.matchMedia?.('(max-width: 600px)');
let store, rootId, selectedId, depth=1, zoom=1, listVisible=false, searchTimer, composing=false;
let layout, bounds, simulation, frame=null, pan={x:0,y:0}, gesture=null, suppressClick=false;
const reducedMotion=window.matchMedia?.('(prefers-reduced-motion: reduce)');
const pinned=new Map();
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
  return '<g class="network-node'+(root?' is-root':'')+(selected?' is-selected':'')+'" data-node="'+esc(node.id)+'" data-kind="'+esc(node.kind)+'" role="button" tabindex="0" aria-pressed="'+String(selected)+'" aria-label="'+esc(kindName(node.kind)+': '+node.name+'. Press Enter to inspect; use arrow keys to move')+'" transform="translate('+node.x.toFixed(1)+' '+node.y.toFixed(1)+')"><rect class="node-shell" x="'+x+'" y="'+y+'" width="'+node.width+'" height="'+node.height+'" rx="8"></rect><rect class="node-avatar" x="'+(iconX-20)+'" y="-20" width="40" height="40" rx="7"></rect><text class="node-initials" x="'+iconX+'"'+(url?' visibility="hidden"':'')+'>'+esc(initials(node.name))+'</text>'+img+'<text class="node-label" y="'+nameY+'">'+label+'</text><rect class="node-kind-bg" x="'+nameX+'" y="'+(kindY-13)+'" width="'+(kind.length*6.4+14)+'" height="18" rx="5"></rect><text class="node-kind" x="'+(nameX+7)+'" y="'+kindY+'">'+esc(kind)+'</text><circle class="node-port" cx="'+x+'" cy="0" r="3"></circle><circle class="node-port" cx="'+(-x)+'" cy="0" r="3"></circle></g>';
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
  const view=neighborhood(store.graph,rootId,{depth,kinds,limit:compact?.matches?(depth===1?10:13):(depth===1?19:25)});
  layout=layoutNetwork(view,rootId,pinned);bounds=layoutBounds(layout);simulation=createForceSimulation(layout,pinned);
  const byId=new Map(layout.nodes.map(node=>[node.id,node]));
  const lines=layout.edges.map((edge,index)=>'<path class="network-link" data-edge="'+index+'" d="'+edgePath(byId.get(edge.from),byId.get(edge.to))+'"></path>').join('');
  $('graph-canvas').innerHTML='<g aria-hidden="true">'+lines+layout.edges.map(renderEdgeCaption).join('')+'</g>'+layout.nodes.map(renderNode).join('');
  $('graph-canvas').querySelectorAll('.network-node image').forEach(img=>img.addEventListener('error',()=>{img.setAttribute('visibility','hidden');img.previousElementSibling?.removeAttribute('visibility');}));
  $('graph-count').textContent=view.nodes.length+' entities · '+view.edges.length+' connections'+(view.truncated?' · limited neighbourhood':'');
  const root=store.graph.entities.find(entity=>entity.id===rootId);
  if($('network-heading'))$('network-heading').textContent='Around '+root.name;
  applyZoom();renderList(view);updateSelection();
}
function renderList(view) {
  const names=new Map(view.nodes.map(item=>[item.id,item]));
  const items=view.edges.map(edge=>{
    const from=names.get(edge.from),to=names.get(edge.to);if(!from||!to)return '';
    const source=sourceUrl(edge.source);
    return '<li><button type="button" data-select="'+esc(from.id)+'">'+esc(from.name)+'</button><span>→ '+esc(relationshipText(edge))+' →</span><button type="button" data-select="'+esc(to.id)+'">'+esc(to.name)+'</button>'+(source?'<a href="'+esc(source)+'" target="_blank" rel="noopener noreferrer">Evidence ↗</a>':'')+'</li>';
  }).filter(Boolean);
  $('graph-list').innerHTML='<h3>Visible connections</h3>'+(view.truncated?'<p class="detail-caption">This map shows a limited neighbourhood. Open a profile to see all its reviewed connections, or explore from another entity.</p>':'')+(items.length?'<ul>'+items.join('')+'</ul>':'<p class="detail-empty">No connections match the selected types.</p>');
  $('graph-list').hidden=!listVisible;
}
function relationshipText(edge) {
  return edge.description || ({founded:'founded',supports:'lists in portfolio',team_member:'team member at',offers:'offers'}[edge.kind] || 'Connected to');
}
function writeState(push=false) {
  if(!rootId)return;
  const params=new URLSearchParams(location.search);
  params.delete('startup');params.set('entity',rootId);
  if(selectedId && selectedId!==rootId)params.set('selected',selectedId);else params.delete('selected');
  if(depth===2)params.set('depth','2');else params.delete('depth');
  if(kinds.size===entityKinds.length)params.delete('types');else params.set('types',entityKinds.filter(kind=>kinds.has(kind)).join(','));
  const query=$('graph-query').value.trim();
  if(query)params.set('q',query);else params.delete('q');
  if(listVisible)params.set('list','1');else params.delete('list');
  const method=push?'pushState':'replaceState';
  history[method]?.(null,'','?'+params.toString());
}
function updateSelection() {
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
  const selectionNote=isRoot?'Map centred here.':visibleIds.has(selectedId)?'Selected within this map.':'Selected outside this map.';
  const inspectAction=isRoot?'':'<button class="detail-explore atlas-button" type="button" data-explore="'+esc(entity.id)+'">Explore from here</button>';
  $('graph-detail').innerHTML='<div class="detail-heading">'+logo+'<div><h2>'+esc(entity.name)+'</h2><p class="detail-kind atlas-badge" data-kind="'+esc(entity.kind)+'">'+esc(kindName(entity.kind))+'</p></div></div><p class="detail-selection-note" data-selection="'+(isRoot?'root':visibleIds.has(selectedId)?'within':'outside')+'">'+selectionNote+'</p><p class="detail-summary">'+esc(summary)+'</p><div class="detail-actions"><a class="detail-open atlas-button atlas-button-accent" data-atlas-profile-link href="'+esc(entityHref(entity))+'">'+icon('external')+'Open profile</a>'+inspectAction+'</div><section class="detail-section"><h3>Researched connections <span>'+details.edges.length+'</span></h3>'+(related.length?'<ul class="detail-related">'+related.slice(0,8).join('')+'</ul>'+(related.length>8?'<p class="detail-caption">Showing 8 of '+related.length+' researched connections. Open the profile for the complete researched list.</p>':''):'<p class="detail-empty">No reviewed connections yet.</p>')+'</section>'+(entity.kind==='startup'?'<section class="detail-section"><h3>Funding announcements</h3>'+(rounds.length?rounds.slice(0,2).map(round=>'<div class="detail-round"><strong>'+esc(round.stage||'Funding event')+' · '+esc(money(round.amount,round.currency,round.amount_text))+'</strong><span>'+esc(round.announced_on||'Date not disclosed')+' · historical announcement</span>'+evidence(round.source,'Announcement source')+'</div>').join(''):'<p class="detail-empty">Funding has not been researched yet.</p>')+'</section>':'')+(source?'<section class="detail-section"><h3>Sources</h3>'+source+'</section>':'');
  $('graph-detail').querySelectorAll('img').forEach(img=>img.addEventListener('error',()=>{img.hidden=true;if(img.nextElementSibling)img.nextElementSibling.hidden=false;}));
}
function select(id,writeHistory=true) {
  if(!store?.graph.entities.some(entity=>entity.id===id))return;
  const changed=selectedId!==id;
  selectedId=id;updateSelection();renderDetail();
  if(writeHistory&&changed)writeState(true);
}
function explore(id,writeHistory=true) {
  if(!store.graph.entities.some(entity=>entity.id===id)) {
    stopSimulation();layout=null;bounds=null;rootId=null;selectedId=null;
    $('graph-detail').innerHTML='<p class="detail-empty">This entry is not in the published graph. Search for another organisation.</p>';
    $('graph-canvas').innerHTML='<text x="460" y="320" text-anchor="middle">Entry not found</text>';
    $('graph-count').textContent='0 entities shown';
    return;
  }
  rootId=id;selectedId=id;zoom=1;pan={x:0,y:0};pinned.clear();
  renderMap();renderDetail();
  if(writeHistory)writeState(true);
}
function renderSearch() {
  if(!store)return;
  const query=$('graph-query').value.trim();
  writeState();
  if(!query){$('graph-results').hidden=true;$('graph-results').innerHTML='';return;}
  try {
    const results=store.search(query).filter(item=>kinds.has(item.kind));
    $('graph-results').innerHTML=results.length?results.map(item=>'<button class="explorer-result" type="button" data-explore="'+esc(item.id)+'"><strong>'+esc(item.name)+'</strong><small>'+esc(kindName(item.kind))+'</small></button>').join(''):'<p>No matching entries. Try another name or show more entity types.</p>';
    $('graph-results').hidden=false;
  } catch {
    $('graph-results').innerHTML='<p>Search is unavailable. Try again.</p>';$('graph-results').hidden=false;
  }
}
function selectFromEvent(event) {
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
  element.setAttribute('transform',`translate(${node.x} ${node.y})`);updateGeometry();reheat();
});
$('graph-filters').addEventListener('click',event=>{
  const button=event.target.closest('button[data-kind]');if(!button||!store)return;
  const kind=button.dataset.kind;if(!entityKinds.includes(kind))return;
  if(kinds.has(kind))kinds.delete(kind);else kinds.add(kind);
  button.setAttribute('aria-pressed',String(kinds.has(kind)));
  if(rootId){renderMap();renderDetail();writeState();}
  if(!$('graph-results').hidden)renderSearch();
});
$('graph-depth').addEventListener('change',event=>{depth=Number(event.target.value)===2?2:1;if(store&&rootId){renderMap();renderDetail();writeState();}});
$('graph-list-toggle').addEventListener('click',()=>{listVisible=!listVisible;syncListVisibility();writeState();});
function syncListVisibility() {
  $('graph-list-toggle').setAttribute('aria-pressed',String(listVisible));
  $('graph-list-toggle').querySelector('span').textContent=listVisible?'Hide connections':'Connections list';
  $('graph-list').hidden=!listVisible;
}
$('graph-zoom-in').addEventListener('click',()=>{zoom=Math.min(1.7,zoom+.2);applyZoom();});
$('graph-zoom-out').addEventListener('click',()=>{zoom=Math.max(.7,zoom-.2);applyZoom();});
$('graph-fit')?.addEventListener('click',()=>{if(!layout)return;bounds=layoutBounds(layout);zoom=1;pan={x:0,y:0};applyZoom();});
$('graph-reset').addEventListener('click',()=>{zoom=1;pan={x:0,y:0};pinned.clear();if(store&&rootId)renderMap();});
function restoreFromUrl() {
  if(!store)return;
  clearTimeout(searchTimer);
  const params=new URLSearchParams(location.search),nextRoot=params.get('entity')||params.get('startup')||'startup:canva';
  const nextDepth=params.get('depth')==='2'?2:1;
  const nextKinds=params.has('types')?params.get('types').split(',').filter(kind=>entityKinds.includes(kind)):entityKinds;
  const mapChanged=depth!==nextDepth || nextKinds.length!==kinds.size || nextKinds.some(kind=>!kinds.has(kind));
  depth=nextDepth;kinds.clear();nextKinds.forEach(kind=>kinds.add(kind));
  $('graph-depth').value=String(depth);
  for(const button of $('graph-filters').querySelectorAll('button[data-kind]'))button.setAttribute('aria-pressed',String(kinds.has(button.dataset.kind)));
  listVisible=params.get('list')==='1';syncListVisibility();
  $('graph-query').value=params.get('q')||'';
  if(nextRoot!==rootId)explore(nextRoot,false);
  else if(mapChanged)renderMap();
  if(rootId)select(params.get('selected')&&store.graph.entities.some(entity=>entity.id===params.get('selected'))?params.get('selected'):rootId,false);
  if($('graph-query').value)renderSearch();else {$('graph-results').hidden=true;$('graph-results').innerHTML='';}
}
window.addEventListener('popstate',restoreFromUrl);
compact?.addEventListener?.('change',()=>{if(store&&rootId){renderMap();renderDetail();}});

try {
  store=await openGraph();
  if(store.mode==='fallback')$('graph-status').textContent='Showing the published backup while the database is unavailable.';
  restoreFromUrl();
} catch {
  $('graph-status').textContent='The graph could not be loaded. Refresh to try again.';
  $('graph-detail').innerHTML='<p class="detail-empty">Profiles are temporarily unavailable.</p>';
  $('graph-canvas').innerHTML='<text x="460" y="320" text-anchor="middle">Graph unavailable</text>';
}
