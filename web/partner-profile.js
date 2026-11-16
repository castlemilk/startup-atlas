import { escapeHtml as esc, sourceUrl } from './logic.js';
import { logoFor, logoClassFor } from './logos.js';
import { partnerRelationships } from './relationships.js';
import { slug, teamPersonId } from './graph-model.js';

const root = document.getElementById('profile');
const name = new URLSearchParams(location.search).get('name') || '';
const fetchJson = async path => {
  const response = await fetch(path, { cache: 'no-cache' });
  if (!response.ok) throw new Error('Unavailable');
  return response.json();
};
const link = (url, label) => {
  const href = sourceUrl(url);
  return href ? `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>` : '';
};
const socials = items => Array.isArray(items) ? items.filter(item => sourceUrl(item.url) && sourceUrl(item.source)).map(item => link(item.url, item.label)).join(' ') : '';
const initials = value => value.split(/\s+/).slice(0, 2).map(part => part[0] || '').join('').toUpperCase();
const imageMark = (url, label, extra = '') => {
  const image = sourceUrl(url);
  return `<div class="profile-item-mark ${esc(extra)}" aria-hidden="true">${image ? `<img src="${esc(image)}" alt="" loading="lazy" referrerpolicy="no-referrer"><span class="mark-fallback" hidden>${esc(initials(label))}</span>` : `<span>${esc(initials(label))}</span>`}</div>`;
};
const section = (id, title, items, render, empty, available = true) => `<section class="profile-section" id="${id}"><div class="profile-section-head"><h2>${esc(title)}</h2><span>${!available ? 'Unavailable' : items.length ? `${items.length} researched` : 'Not yet researched'}</span></div>${items.length ? `<div class="profile-list">${items.map(render).join('')}</div><p class="profile-caption">A researched sample. Follow the sources for the full, current picture.</p>` : `<p class="profile-empty atlas-empty">${esc(available ? empty : 'This part of the research could not be loaded. Reload the page to try again.')}</p>`}</section>`;

try {
  const [catalogue, supplemental] = await Promise.all([
    fetchJson('./data/catalogue.json'),
    Promise.allSettled([
      fetchJson('./data/partners-reviewed.json'),
      fetchJson('./data/partner-profiles.json'),
      fetchJson('./data/map-locations.json')
    ])
  ]);
  const [reviewed, profiles, places] = supplemental.map((result, index) => result.status === 'fulfilled' ? result.value : index === 2 ? [] : {});
  const profilesAvailable = supplemental[1].status === 'fulfilled';
  const partial = supplemental.some(result => result.status === 'rejected');

  if (!Array.isArray(catalogue.partnerLeads) || !catalogue.partnerLeads.includes(name)) {
    root.innerHTML = '<a class="profile-back" data-atlas-back href="./?view=partners#directory">All partners</a><div class="atlas-empty"><h1>Partner not found</h1><p>Return to the directory and choose an organisation from the research index.</p><a class="atlas-button" href="./?view=partners#directory">Browse partners</a></div>';
  } else {
    const record = Object.hasOwn(reviewed, name) ? reviewed[name] : null;
    const detail = Object.hasOwn(profiles, name) ? profiles[name] : {};
    const relations = Object.hasOwn(partnerRelationships, name) ? partnerRelationships[name] : [];
    const locations = Array.isArray(places) ? places.filter(place => Array.isArray(place.partners) && place.partners.some(item => item.name === name)) : [];
    const mark = logoFor(name);
    const people = Array.isArray(detail.people) ? detail.people : [];
    const companies = Array.isArray(detail.companies) ? detail.companies : [];
    const sponsors = Array.isArray(detail.sponsors) ? detail.sponsors : [];
    const locationText = detail.geography || [...new Set(locations.map(place => place.country))].join(', ') || 'Geography not recorded';
    const graphHref = `./graph.html?entity=${encodeURIComponent('partner:' + slug(name))}`;
    const renderPerson = person => `<article class="profile-item">${imageMark(person.photo, person.name, 'person')}<div><h3><a class="partner-profile-link" data-atlas-profile-link href="./entity.html?id=${encodeURIComponent(teamPersonId(person.name, name))}">${esc(person.name)}</a></h3><p>${esc(person.role || 'Role to verify')}</p><div class="profile-socials">${socials(person.socials)}</div></div><span class="profile-item-source">${link(person.source, 'Evidence')}${person.photo_source ? link(person.photo_source, 'Photo source') : ''}</span></article>`;
    const renderCompany = company => `<article class="profile-item">${imageMark(logoFor(company.name) ? new URL(logoFor(company.name), location.href).href : company.logo, company.name, 'company')}<div><h3><a class="partner-profile-link" data-atlas-profile-link href="./entity.html?id=${encodeURIComponent('startup:' + slug(company.name))}">${esc(company.name)}</a></h3><p>${esc(company.relationship || 'Listed in portfolio')}</p></div><span class="profile-item-source">${link(company.source, 'Evidence')}${company.logo_source ? link(company.logo_source, 'Logo source') : ''}</span></article>`;
    const renderSponsor = sponsor => `<article class="profile-item">${imageMark(logoFor(sponsor.name) ? new URL(logoFor(sponsor.name), location.href).href : sponsor.logo, sponsor.name, 'company')}<div><h3>${esc(sponsor.name)}</h3><p>${esc(sponsor.relationship || 'Relationship to verify')}</p></div><span class="profile-item-source">${link(sponsor.source, 'Evidence')}${sponsor.logo_source ? link(sponsor.logo_source, 'Logo source') : ''}</span></article>`;
    const relationsHtml = relations.length ? relations.map(relation => `<article class="profile-relationship"><div class="profile-relationship-heading">${imageMark(logoFor(relation.provider) ? new URL(logoFor(relation.provider), location.href).href : null, relation.provider, 'company')}<div><strong>${esc(relation.provider)}</strong><span>${esc(relation.programme)}</span></div></div><p>${esc(relation.relationship)}</p>${link(relation.source, 'Evidence')}</article>`).join('') : '<p class="profile-empty">No provider relationships have been reviewed for this organisation yet.</p>';
    const coverage = profilesAvailable
      ? `${companies.length ? `${companies.length} compan${companies.length === 1 ? 'y' : 'ies'} researched` : 'Companies not yet researched'} · ${people.length ? `${people.length} public team profile${people.length === 1 ? '' : 's'}` : 'People not yet researched'}`
      : 'Company and team research unavailable';

    root.innerHTML = `<a class="profile-back" data-atlas-back href="./?view=partners#directory">All partners</a>
      <div class="profile-hero">
        <div class="profile-brand"><div class="profile-logo ${mark ? esc(logoClassFor(name)) : ''}" aria-hidden="true">${mark ? `<img src="${esc(mark)}" alt="">` : `<span>${esc(initials(name))}</span>`}</div><div><h1>${esc(name)}</h1><p class="profile-meta"><span class="atlas-badge" data-kind="partner">${esc(detail.type || 'Organisation')}</span></p><p class="profile-geography">${esc(locationText)}</p></div></div>
        <div class="profile-intro"><p>${esc(record?.description || 'This organisation is in the research index. Its identity, activities and relationships need further review.')}</p><div class="profile-actions"><a class="atlas-button atlas-button-primary" href="${graphHref}">Explore connections</a>${link(record?.website, 'Website')}${socials(detail.socials)}</div></div>
      </div>
      <p class="atlas-coverage profile-coverage"><strong>Research coverage</strong><span>${esc(coverage)}. This is a selected sample, not the organisation’s full portfolio or team.</span></p>
      <nav class="atlas-section-nav" aria-label="Profile sections"><a href="#partner-companies">Companies</a><a href="#partner-people">People</a>${sponsors.length ? '<a href="#partner-supporters">Supporters</a>' : ''}<a href="#partner-programmes">Programmes</a><a href="#partner-sources">Sources</a></nav>
      ${partial ? '<p class="profile-notice" role="status">Some profile research is unavailable. Showing the information that loaded; reload this page to try again.</p>' : ''}
      <div class="profile-body"><div class="profile-main">
        ${section('partner-companies', 'Companies researched', companies, renderCompany, 'No companies have been researched for this organisation yet. Explore its source website for more information.', profilesAvailable)}
        ${section('partner-people', 'People & roles', people, renderPerson, 'People and roles have not been researched for this organisation yet.', profilesAvailable)}
        ${sponsors.length ? section('partner-supporters', 'Programme supporters', sponsors, renderSponsor, '') : ''}
      </div><aside class="profile-aside">
        <section id="partner-programmes"><h2>Programme relationships</h2><p class="profile-aside-note">A listing or self-reported relationship does not guarantee access or credits.</p>${relationsHtml}</section>
        <section id="partner-sources"><h2>Sources &amp; context</h2><div class="profile-source-links">${link(record?.source, 'Identity source')}</div><p>${supplemental[0].status === 'rejected' ? 'Identity research could not be loaded.' : record?.reviewed_at ? `Identity reviewed ${esc(record.reviewed_at)}.` : 'Identity requires review.'} ${detail.checked ? `People and company sample checked ${esc(detail.checked)}.` : ''}</p><p>Recorded geography, office locations and programme eligibility describe different things. Follow each source for its scope and dates.</p></section>
      </aside></div>`;
    root.querySelectorAll('.profile-item-mark img').forEach(img => img.addEventListener('error', () => {
      img.hidden = true;
      const fallback = img.nextElementSibling;
      if (fallback) fallback.hidden = false;
    }));
    document.title = name + ' — Startup Atlas';
    const logo = root.querySelector('.profile-logo img');
    logo?.addEventListener('error', () => logo.replaceWith(document.createTextNode(initials(name))));
  }
} catch {
  root.innerHTML = '<a class="profile-back" data-atlas-back href="./?view=partners#directory">All partners</a><div class="atlas-empty"><h1>Profile unavailable</h1><p>The directory could not be loaded. Reload this page to try again, or return to the partner index.</p><a class="atlas-button" href="./?view=partners#directory">Browse partners</a></div>';
}
root.setAttribute('aria-busy', 'false');
