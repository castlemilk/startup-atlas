import { escapeHtml as esc, sourceUrl } from './logic.js';
import { logoFor } from './logos.js';
import { openGraph } from './graph-store.js';
import { entityDetails, entityHref, kindName, neighborhood } from './graph-model.js';

const $=id=>document.getElementById(id);
const kinds=new Set(['startup','partner','person','programme','provider']);
const compact=window.matchMedia?.('(max-width: 600px)');
let store, selectedId, depth=1, zoom=1, listVisible=false, searchTimer;
const initials=name=>name.trim().split(/\s+/).slice(0,2).map(part=>part[0]||'').join('').toUpperCase();
const imageUrl=value=>sourceUrl(value)||(/^\.\/assets\/logos\/[a-z0-9-]+\.(?:svg|png)$/i.test(value||'')?value:'');
const entityImage=entity=>imageUrl(entity.logo)||imageUrl(logoFor(entity.name));
const evidence=(url,label='Source')=>{const safe=sourceUrl(url);return safe?'<a class="detail-source" href="'+esc(safe)+'" target="_blank" rel="noopener noreferrer">'+esc(label)+' ↗</a>':'';};
const money=(value,currency)=>{if(value==null||!currency)return 'Amount not disclosed';try{return new Intl.NumberFormat('en-AU',{style:'currency',currency,maximumFractionDigits:0}).format(Number(value));}catch{return String(value)+' '+currency;}};

function labels(name) {
  const words=name.split(/\s+/), lines=[''];
  for(const word of words) {
    const current=lines.length-1;
    if(lines[current] && (lines[current]+' '+word).length>16 && lines.length<2) lines.push(word);
    else lines[current]+=(lines[current]?' ':'')+word;
  }
  if(lines[lines.length-1].length>23) lines[lines.length-1]=lines[lines.length-1].slice(0,22)+'…';
  return lines;
}
function positions(nodes) {
  const map=new Map();map.set(selectedId,{x:460,y:316});
  for(const level of [1,2]) {
    const ring=nodes.filter(node=>node.level===level);
    const rx=level===1?235:370,ry=level===1?184:255;
    ring.forEach((node,index)=>{const angle=-Math.PI/2+(2*Math.PI*index/Math.max(ring.length,1));map.set(node.id,{x:460+Math.cos(angle)*rx,y:316+Math.sin(angle)*ry});});
  }
  return map;
}
function renderNode(node,point) {
  const root=node.id===selectedId, r=compact?.matches?(root?42:33):(root?34:25), url=entityImage(node), words=labels(node.name);
  const lineHeight=compact?.matches?26:16;
  const label=words.map((line,index)=>'<tspan x="0" dy="'+(index?lineHeight:0)+'">'+esc(line)+'</tspan>').join('');
  const img=url?'<image href="'+esc(url)+'" x="'+(-r+6)+'" y="'+(-r+6)+'" width="'+(r*2-12)+'" height="'+(r*2-12)+'" preserveAspectRatio="xMidYMid meet"></image>':'';
  return '<g class="network-node'+(root?' is-root':'')+'" data-node="'+esc(node.id)+'" data-kind="'+esc(node.kind)+'" role="button" tabindex="0" aria-label="'+esc(kindName(node.kind)+': '+node.name+'. Explore connections')+'" transform="translate('+point.x.toFixed(1)+' '+point.y.toFixed(1)+')"><circle class="node-shell" r="'+r+'"></circle><text class="node-initials"'+(url?' visibility="hidden"':'')+'>'+esc(initials(node.name))+'</text>'+img+'<text class="node-label" y="'+(r+(compact?.matches?27:20))+'">'+label+'</text><text class="node-kind" y="'+(r+(compact?.matches?45:35)+(words.length-1)*lineHeight)+'">'+esc(kindName(node.kind))+'</text></g>';
}
function applyZoom() {
  const w=920/zoom,h=640/zoom;
  $('graph-canvas').setAttribute('viewBox',[(920-w)/2,(640-h)/2,w,h].join(' '));
}
function renderMap() {
  const view=neighborhood(store.graph,selectedId,{depth,kinds,limit:compact?.matches?(depth===1?10:13):(depth===1?19:25)});
  const points=positions(view.nodes);
  const lines=view.edges.map(edge=>{const a=points.get(edge.from),b=points.get(edge.to);return '<line x1="'+a.x.toFixed(1)+'" y1="'+a.y.toFixed(1)+'" x2="'+b.x.toFixed(1)+'" y2="'+b.y.toFixed(1)+'"></line>';}).join('');
  $('graph-canvas').innerHTML='<g aria-hidden="true">'+lines+'</g>'+view.nodes.map(node=>renderNode(node,points.get(node.id))).join('');
  $('graph-canvas').querySelectorAll('.network-node image').forEach(img=>img.addEventListener('error',()=>{img.setAttribute('visibility','hidden');img.previousElementSibling?.removeAttribute('visibility');}));
  $('graph-count').textContent=view.nodes.length+' entities shown'+(view.truncated?' · view limited':'');
  applyZoom();
  renderList(view);
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
  selectedId=id;zoom=1;
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
$('graph-canvas').addEventListener('click',event=>{const node=event.target.closest('[data-node]');if(node)select(node.dataset.node);});
$('graph-canvas').addEventListener('keydown',event=>{const node=event.target.closest('[data-node]');if(node&&(event.key==='Enter'||event.key===' ')){event.preventDefault();select(node.dataset.node);$('graph-canvas').querySelector('.network-node.is-root')?.focus();}});
$('graph-filters').addEventListener('click',event=>{const button=event.target.closest('button[data-kind]');if(!button||!store)return;const kind=button.dataset.kind;if(kinds.has(kind))kinds.delete(kind);else kinds.add(kind);button.setAttribute('aria-pressed',String(kinds.has(kind)));renderMap();if(!$('graph-results').hidden)renderSearch();});
$('graph-depth').addEventListener('change',event=>{depth=Number(event.target.value)===2?2:1;if(store&&selectedId)renderMap();});
$('graph-list-toggle').addEventListener('click',()=>{listVisible=!listVisible;$('graph-list-toggle').setAttribute('aria-pressed',String(listVisible));$('graph-list-toggle').querySelector('span').textContent=listVisible?'Hide list':'List view';$('graph-list').hidden=!listVisible;});
$('graph-zoom-in').addEventListener('click',()=>{zoom=Math.min(1.7,zoom+.2);applyZoom();});
$('graph-zoom-out').addEventListener('click',()=>{zoom=Math.max(.7,zoom-.2);applyZoom();});
$('graph-reset').addEventListener('click',()=>{zoom=1;applyZoom();});
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
