import { escapeHtml as esc, sourceUrl } from './logic.js';
import { logoFor } from './logos.js';
import { openGraph } from './graph-store.js';
import { entityDetails, entityHref, kindName } from './graph-model.js';

const root=document.getElementById('entity-profile');
const identity=new URLSearchParams(location.search).get('id') || '';
const source=(url,label='Source')=>{const safe=sourceUrl(url);return safe?`<a href="${esc(safe)}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>`:'';};
const initials=name=>name.trim().split(/\s+/).slice(0,2).map(part=>part[0]||'').join('').toUpperCase();
const imageUrl=value=>sourceUrl(value)||(/^\.\/assets\/logos\/[a-z0-9-]+\.(?:svg|png)$/i.test(value||'')?value:'');
const mark=entity=>{const image=imageUrl(entity.logo)||imageUrl(logoFor(entity.name));return `<span class="entity-mark ${entity.kind==='person'?'entity-mark-person':''}">${image?`<img src="${esc(image)}" alt="" loading="lazy" referrerpolicy="no-referrer"><span class="entity-mark-fallback" hidden>${esc(initials(entity.name))}</span>`:esc(initials(entity.name))}</span>`;};
const money=(value,currency)=>{if(value==null || !currency)return 'Amount not disclosed';try{return new Intl.NumberFormat('en-AU',{style:'currency',currency,maximumFractionDigits:0}).format(Number(value));}catch{return `${value} ${currency}`;}};
const relationLabel=(entity,edge,other)=>{
  if(edge.kind==='founded') return entity.kind==='person'?'Founded':'Founder';
  if(edge.kind==='supports') return entity.kind==='startup'?'Listed in portfolio':'Portfolio company';
  if(edge.kind==='team_member') return edge.description || 'Team member';
  if(edge.kind==='offers') return entity.kind==='programme'?'Programme operator':'Programme';
  return edge.description || kindName(other.kind);
};

function connectionRows(details, edges=details.edges) {
  const names=new Map(details.related.map(item=>[item.id,item]));
  return edges.map(edge=>{
    const other=names.get(edge.from===details.entity.id?edge.to:edge.from);if(!other)return '';
    return `<article class="entity-connection">${mark(other)}<div class="entity-connection-copy"><a href="${esc(entityHref(other))}">${esc(other.name)}</a><span>${esc(relationLabel(details.entity,edge,other))}</span></div><div class="entity-connection-source">${source(edge.source,'Evidence')}</div></article>`;
  }).join('');
}

function programmeDetails(offer) {
  if(!offer)return '';
  const fields=[['Status',offer.status],['Eligibility',offer.eligibility],['Value',offer.value],['Conditions',offer.limits],['Geography',Array.isArray(offer.scope)?offer.scope.join(', '):'']].filter(([,value])=>value);
  return `<section class="entity-section"><div class="entity-section-heading"><span>01 / DETAILS</span><h2>Programme details</h2></div><dl class="entity-facts">${fields.map(([label,value])=>`<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl></section>`;
}

try {
  const store=await openGraph(), details=entityDetails(store.graph,identity), entity=details.entity;
  const offer=entity.kind==='programme'?await store.opportunity(entity.opportunity_id):null;
  const founderEdges=entity.kind==='startup'?details.edges.filter(edge=>edge.kind==='founded' && details.related.some(item=>item.id===(edge.from===entity.id?edge.to:edge.from)&&item.kind==='person')):[];
  const connections=connectionRows(details,details.edges.filter(edge=>!founderEdges.includes(edge)));
  const founders=connectionRows(details,founderEdges);
  const facts=Array.isArray(entity.profile_facts)?entity.profile_facts.filter(fact=>fact.label&&fact.value&&sourceUrl(fact.source)):[];
  const rounds=[...details.rounds].sort((a,b)=>(b.announced_on||'').localeCompare(a.announced_on||''));
  const articles=[...details.articles].sort((a,b)=>(b.published_on||'').localeCompare(a.published_on||''));
  const socialLinks=Array.isArray(entity.socials)?entity.socials.filter(item=>sourceUrl(item.url)&&sourceUrl(item.source)).map(item=>source(item.url,item.label)).join(' '):'';
  root.innerHTML=`<a class="profile-back" href="./graph.html?entity=${encodeURIComponent(entity.id)}">← Back to the graph</a>
    <div class="entity-hero"><div class="entity-hero-identity">${mark(entity)}<div><p class="profile-eyebrow">STARTUP ATLAS / ${esc(kindName(entity.kind).toUpperCase())}</p><h1>${esc(entity.name)}</h1><p class="entity-hero-note">${entity.founded_year?`Founded ${esc(String(entity.founded_year))}`:'A source-backed profile'}</p></div></div><div class="entity-hero-copy"><p>${esc(entity.summary || 'This profile is connected to the sources and organisations listed below. More details are being researched.')}</p><div class="entity-actions">${source(entity.website,'Website')}${source(entity.source,'Profile source')}${socialLinks}<a href="./graph.html?entity=${encodeURIComponent(entity.id)}">Explore connections ↗</a></div></div></div>
    ${store.mode==='fallback'?'<p class="entity-notice" role="status">Showing the published backup while the database is unavailable.</p>':''}
    <div class="entity-content"><div class="entity-main">${programmeDetails(offer)}${entity.kind==='startup'?`<section class="entity-section"><div class="entity-section-heading"><span>PEOPLE / ${String(founderEdges.length).padStart(2,'0')}</span><h2>Founders</h2></div>${founders?`<div class="entity-connections">${founders}</div>`:'<p class="entity-empty">Founder information has not been researched yet.</p>'}</section>${facts.length?`<section class="entity-section"><div class="entity-section-heading"><span>REVIEWED FACTS</span><h2>Company details</h2></div><dl class="entity-facts">${facts.map(fact=>`<div><dt>${esc(fact.label)}</dt><dd>${esc(fact.value)} <span class="entity-fact-source">${source(fact.source,'Source')}${fact.reviewed_at?` · reviewed ${esc(fact.reviewed_at)}`:''}</span></dd></div>`).join('')}</dl></section>`:''}`:''}<section class="entity-section"><div class="entity-section-heading"><span>NETWORK / ${String(details.edges.length-founderEdges.length).padStart(2,'0')}</span><h2>Connections</h2></div>${connections?`<div class="entity-connections">${connections}</div>`:'<p class="entity-empty">No other reviewed connections have been added yet.</p>'}</section>
    ${entity.kind==='startup'?`<section class="entity-section"><div class="entity-section-heading"><span>HISTORY / FUNDING</span><h2>Funding</h2></div>${rounds.length?rounds.map(round=>`<article class="entity-round"><div><strong>${esc(round.stage || 'Funding round')}</strong><span>${esc(round.announced_on || 'Date not disclosed')}</span></div><div><strong>${esc(money(round.amount,round.currency))}</strong>${round.valuation?`<span>Historical valuation ${esc(money(round.valuation,round.valuation_currency))}</span>`:''}</div>${round.note?`<p>${esc(round.note)}</p>`:''}${source(round.source,'Announcement')}</article>`).join(''):'<p class="entity-empty">Funding has not been researched yet.</p>'}<p class="entity-caption">Figures reflect historical announcements and are not necessarily current valuations.</p></section>`:''}</div>
    <aside class="entity-aside"><section><p class="entity-aside-label">SOURCE NOTES</p><h2>Follow the evidence.</h2><p>Each connection links to the source that describes it. A portfolio listing does not by itself establish a funding round.</p><div class="entity-source-list">${source(entity.source,'Profile source')}${source(entity.logo_source,'Image source')}</div></section>${articles.length?`<section><p class="entity-aside-label">LATEST RESEARCH</p><h2>News &amp; sources</h2><ul>${articles.map(article=>`<li>${source(article.url,article.title)}<span>${esc(article.published_on || '')}</span></li>`).join('')}</ul></section>`:''}</aside></div>`;
  root.querySelectorAll('.entity-mark img').forEach(img=>img.addEventListener('error',()=>{img.hidden=true;if(img.nextElementSibling)img.nextElementSibling.hidden=false;}));
  document.title=entity.name+' — Startup Atlas';
} catch {
  root.innerHTML='<a class="profile-back" href="./graph.html">← Knowledge graph</a><h1>Profile unavailable</h1><p>This profile could not be found or loaded. Return to the graph to choose another entry.</p>';
}
root.setAttribute('aria-busy','false');
