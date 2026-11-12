import { escapeHtml as esc, sourceUrl } from './logic.js';
import { logoFor, logoClassFor } from './logos.js';
import { partnerRelationships } from './relationships.js';

const root=document.getElementById('profile');
const name=new URLSearchParams(location.search).get('name') || '';
const fetchJson=async path=>{const response=await fetch(path,{cache:'no-cache'});if(!response.ok)throw new Error('Unavailable');return response.json();};
const link=(url,label)=>{const href=sourceUrl(url);return href?`<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>`:'';};
const initials=value=>value.split(/\s+/).slice(0,2).map(x=>x[0]||'').join('').toUpperCase();
const section=(title,items,render,empty)=>`<section class="profile-section"><div class="profile-section-head"><h2>${esc(title)}</h2><span>${items.length ? 'Selected research' : 'Not yet researched'}</span></div>${items.length?`<div class="profile-list">${items.map(render).join('')}</div><p class="profile-caption">A selected sample, not a complete list. Follow the sources for current details.</p>`:`<p class="profile-empty">${esc(empty)}</p>`}</section>`;
try {
  const [catalogue,reviewed,profiles,places]=await Promise.all([
    fetchJson('./data/catalogue.json'),fetchJson('./data/partners-reviewed.json').catch(()=>({})),
    fetchJson('./data/partner-profiles.json').catch(()=>({})),fetchJson('./data/map-locations.json').catch(()=>([]))
  ]);
  if(!Array.isArray(catalogue.partnerLeads) || !catalogue.partnerLeads.includes(name)) {
    root.innerHTML='<a class="profile-back" href="./?view=partners#directory">← All partners</a><h1>Partner not found</h1><p>Return to the directory and choose an organisation.</p>';
  } else {
    const record=Object.hasOwn(reviewed,name)?reviewed[name]:null;
    const detail=Object.hasOwn(profiles,name)?profiles[name]:{};
    const relations=Object.hasOwn(partnerRelationships,name)?partnerRelationships[name]:[];
    const locations=Array.isArray(places)?places.filter(p=>Array.isArray(p.partners)&&p.partners.some(x=>x.name===name)):[];
    const mark=logoFor(name), people=Array.isArray(detail.people)?detail.people:[], companies=Array.isArray(detail.companies)?detail.companies:[];
    const locationText=detail.geography || [...new Set(locations.map(p=>p.country))].join(', ') || 'Location to verify';
    const renderPerson=p=>`<article class="profile-item"><div class="profile-item-mark" aria-hidden="true">${esc(initials(p.name))}</div><div><h3>${esc(p.name)}</h3><p>${esc(p.role || 'Role to verify')}</p></div><span class="profile-item-source">${link(p.source,'Source')}</span></article>`;
    const renderCompany=c=>`<article class="profile-item"><div class="profile-item-mark company" aria-hidden="true">${esc(initials(c.name))}</div><div><h3>${esc(c.name)}</h3><p>${esc(c.relationship || 'Listed in portfolio')}</p></div><span class="profile-item-source">${link(c.source,'Source')}</span></article>`;
    const relationsHtml=relations.length?relations.map(r=>`<article class="profile-relationship"><div><strong>${esc(r.provider)}</strong><span>${esc(r.programme)}</span></div><p>${esc(r.relationship)}</p>${link(r.source,'Evidence')}</article>`).join(''):'<p class="profile-empty">No provider relationships have been reviewed for this organisation yet.</p>';
    root.innerHTML=`<a class="profile-back" href="./?view=partners#directory">← All partners</a>
      <div class="profile-hero"><div class="profile-brand"><div class="profile-logo ${mark?esc(logoClassFor(name)):''}">${mark?`<img src="${esc(mark)}" alt="">`:`<span aria-hidden="true">${esc(initials(name))}</span>`}</div><div><p class="profile-eyebrow">PARTNER PROFILE</p><h1>${esc(name)}</h1><p class="profile-meta">${esc(detail.type || 'Organisation')} <span>·</span> ${esc(locationText)}</p></div></div><div class="profile-intro"><p>${esc(record?.description || 'This organisation is in the research index. Its identity, activities and relationships need further review.')}</p><div class="profile-actions">${link(record?.website,'Visit website')}${link(record?.source,'Identity source')}</div></div></div>
      <div class="profile-body"><div class="profile-main">
      ${section('People',people,renderPerson,'People and roles have not been researched for this organisation yet.')}
      ${section('Companies supported',companies,renderCompany,'No companies have been researched for this organisation yet.')}
      </div><aside class="profile-aside"><section><h2>Programme relationships</h2><p class="profile-aside-note">A listing or self-reported relationship does not guarantee access or credits.</p>${relationsHtml}</section><section><h2>Research notes</h2><p>${record?.reviewed_at?`Identity reviewed ${esc(record.reviewed_at)}.`:'Identity requires review.'} ${detail.checked?`People and company sample checked ${esc(detail.checked)}.`:''}</p><p>Office and programme locations are not eligibility claims. Sources can change.</p></section></aside></div>`;
    document.title=name+' — Startup Atlas';
    const logo=root.querySelector('.profile-logo img');logo?.addEventListener('error',()=>{logo.replaceWith(document.createTextNode(initials(name)));});
  }
} catch {
  root.innerHTML='<a class="profile-back" href="./?view=partners#directory">← All partners</a><h1>Profile unavailable</h1><p>The directory could not be loaded. Refresh to try again.</p>';
}
root.setAttribute('aria-busy','false');
