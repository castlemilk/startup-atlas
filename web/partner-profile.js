import { escapeHtml as esc, sourceUrl } from './logic.js';
import { logoFor, logoClassFor } from './logos.js';
import { partnerRelationships } from './relationships.js';
import { slug, teamPersonId } from './graph-model.js';
import { icon, renderEvidenceHeading } from './atlas-ui.js';

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
const section = (id, title, items, render, empty, available = true, inspector = '') => `<section class="profile-section" id="${id}"><div class="profile-section-head"><h2>${esc(title)}</h2><span>${!available ? 'Unavailable' : items.length ? `${items.length} researched` : 'Not yet researched'}</span></div>${items.length ? `${inspector ? '<p class="profile-caption">Select a company to inspect its recorded relationship and evidence.</p><div class="profile-company-explorer">' : ''}<div class="profile-list">${items.map(render).join('')}</div>${inspector}${inspector ? '</div>' : ''}<p class="profile-caption">A researched sample. Follow the sources for the full, current picture.</p>` : `<p class="profile-empty atlas-empty">${esc(available ? empty : 'This part of the research could not be loaded. Reload the page to try again.')}</p>`}</section>`;
const installProfileImages = scope => scope.querySelectorAll('.profile-item-mark img').forEach(img => img.addEventListener('error', () => {
  img.hidden = true;
  const fallback = img.nextElementSibling;
  if (fallback) fallback.hidden = false;
}));

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
    const renderCompany = (company, index) => `<article class="profile-item profile-company-row" data-company-row="${index}" data-selected="${index === 0}">${imageMark(logoFor(company.name) ? new URL(logoFor(company.name), location.href).href : company.logo, company.name, 'company')}<div><h3><a class="partner-profile-link" data-atlas-profile-link href="./entity.html?id=${encodeURIComponent('startup:' + slug(company.name))}">${esc(company.name)}</a></h3><p>${esc(company.relationship || 'Listed in portfolio')}</p></div><span class="profile-item-source">${link(company.source, 'Evidence')}<button class="profile-inspect" type="button" data-company-index="${index}" aria-controls="partner-company-detail" aria-pressed="${index === 0}" aria-label="Inspect ${esc(company.name)}">Inspect ${icon('arrow')}</button>${company.logo_source ? link(company.logo_source, 'Logo source') : ''}</span></article>`;
    const renderCompanyDetail = company => `<div class="profile-company-identity">${imageMark(logoFor(company.name) ? new URL(logoFor(company.name), location.href).href : company.logo, company.name, 'company')}<div><span class="profile-detail-label">Selected company</span><h3 id="partner-company-title">${esc(company.name)}</h3></div></div><div class="profile-company-evidence"><h4>In this research sample</h4><p><strong>Recorded relationship</strong>${esc(company.relationship || 'Listed in portfolio')}</p><div class="profile-detail-source">${icon('source')}${link(company.source, 'Relationship evidence') || '<span>Source not recorded</span>'}</div><p class="profile-caption">A portfolio listing does not establish an investment in a particular funding round.</p></div><a class="atlas-button atlas-button-accent" data-atlas-profile-link href="./entity.html?id=${encodeURIComponent('startup:' + slug(company.name))}">Open company profile ${icon('arrow')}</a><a class="profile-detail-graph" href="./graph.html?entity=${encodeURIComponent('startup:' + slug(company.name))}">${icon('graph')}Explore company connections</a>`;
    const companyInspector = companies.length ? `<aside class="profile-company-detail" id="partner-company-detail" aria-labelledby="partner-company-title">${renderCompanyDetail(companies[0])}</aside>` : '';
    const renderSponsor = sponsor => `<article class="profile-item">${imageMark(logoFor(sponsor.name) ? new URL(logoFor(sponsor.name), location.href).href : sponsor.logo, sponsor.name, 'company')}<div><h3>${esc(sponsor.name)}</h3><p>${esc(sponsor.relationship || 'Relationship to verify')}</p></div><span class="profile-item-source">${link(sponsor.source, 'Evidence')}${sponsor.logo_source ? link(sponsor.logo_source, 'Logo source') : ''}</span></article>`;
    const relationsHtml = relations.length ? relations.map(relation => `<article class="profile-relationship"><div class="profile-relationship-heading">${imageMark(logoFor(relation.provider) ? new URL(logoFor(relation.provider), location.href).href : null, relation.provider, 'company')}<div><strong>${esc(relation.provider)}</strong><span>${esc(relation.programme)}</span></div></div><p>${esc(relation.relationship)}</p>${link(relation.source, 'Evidence')}</article>`).join('') : '<p class="profile-empty">No provider relationships have been reviewed for this organisation yet.</p>';
    const coverage = profilesAvailable
      ? `${companies.length ? `${companies.length} compan${companies.length === 1 ? 'y' : 'ies'} researched` : 'Companies not yet researched'} · ${people.length ? `${people.length} public team profile${people.length === 1 ? '' : 's'}` : 'People not yet researched'}`
      : 'Company and team research unavailable';

    root.innerHTML = `<a class="profile-back" data-atlas-back href="./?view=partners#directory">All partners</a>
      <div class="profile-hero"><div class="profile-brand"><div class="profile-logo ${mark ? esc(logoClassFor(name)) : ''}" aria-hidden="true">${mark ? `<img src="${esc(mark)}" alt="">` : `<span>${esc(initials(name))}</span>`}</div><div class="profile-identity"><div class="profile-title-line"><h1>${esc(name)}</h1><span class="atlas-badge" data-kind="partner">${esc(detail.type || 'Organisation')}</span></div><div class="profile-intro"><p>${esc(record?.description || 'This organisation is in the research index. Its identity, activities and relationships need further review.')}</p><div class="profile-actions"><a class="atlas-button atlas-button-primary" href="${graphHref}">${icon('graph')}Explore connections</a>${link(record?.website, 'Website')}${socials(detail.socials)}<span class="profile-geography">${icon('location')}${esc(locationText)}</span></div></div></div></div></div>
      <p class="atlas-coverage profile-coverage"><strong>Research coverage</strong><span>${esc(coverage)}. This is a selected sample, not the organisation’s full portfolio or team.</span></p>
      <nav class="atlas-section-nav" aria-label="Profile sections"><a href="#partner-companies">Companies</a><a href="#partner-people">People</a>${sponsors.length ? '<a href="#partner-supporters">Supporters</a>' : ''}<a href="#partner-programmes">Programmes</a><a href="#partner-sources">Sources</a></nav>
      ${partial ? '<p class="profile-notice" role="status">Some profile research is unavailable. Showing the information that loaded; reload this page to try again.</p>' : ''}
      <div class="profile-body"><div class="profile-main">
        ${section('partner-companies', 'Companies researched', companies, renderCompany, 'No companies have been researched for this organisation yet. Explore its source website for more information.', profilesAvailable, companyInspector)}
        <p class="profile-selection-status" id="partner-company-selection" role="status" aria-live="polite"></p>
        <section class="profile-section" id="partner-programmes"><div class="profile-section-head"><h2>Programme relationships</h2><span>${relations.length} recorded</span></div><p class="profile-aside-note">A listing or self-reported relationship does not guarantee access or credits.</p>${relationsHtml}</section>
        ${sponsors.length ? section('partner-supporters', 'Programme supporters', sponsors, renderSponsor, '') : ''}
      </div><aside class="profile-aside">
        ${section('partner-people', 'People & roles', people, renderPerson, 'People and roles have not been researched for this organisation yet.', profilesAvailable)}
        <section id="partner-sources">${renderEvidenceHeading()}<div class="profile-source-links atlas-evidence-links">${link(record?.source, 'Identity source')}</div><p>${supplemental[0].status === 'rejected' ? 'Identity research could not be loaded.' : record?.reviewed_at ? `Identity reviewed ${esc(record.reviewed_at)}.` : 'Identity requires review.'} ${detail.checked ? `People and company sample checked ${esc(detail.checked)}.` : ''}</p><p>Recorded geography, office locations and programme eligibility describe different things. Follow each source for its scope and dates.</p></section>
      </aside></div>`;
    installProfileImages(root);
    root.querySelectorAll('[data-company-index]').forEach(button => button.addEventListener('click', () => {
      const index = Number(button.dataset.companyIndex);
      const company = companies[index];
      if (!Number.isInteger(index) || !company) return;
      root.querySelectorAll('[data-company-index]').forEach(control => control.setAttribute('aria-pressed', String(control === button)));
      root.querySelectorAll('[data-company-row]').forEach(row => { row.dataset.selected = String(Number(row.dataset.companyRow) === index); });
      const inspector = root.querySelector('#partner-company-detail');
      inspector.innerHTML = renderCompanyDetail(company);
      installProfileImages(inspector);
      root.querySelector('#partner-company-selection').textContent = `Inspecting ${company.name}. Its recorded relationship and source are shown in the company detail panel.`;
      if (matchMedia('(max-width: 1200px)').matches) {
        const heading = inspector.querySelector('h3');
        heading.tabIndex = -1;
        heading.focus({ preventScroll: true });
        inspector.scrollIntoView({ block: 'start', behavior: 'instant' });
      }
    }));
    document.title = name + ' — Startup Atlas';
    const logo = root.querySelector('.profile-logo img');
    logo?.addEventListener('error', () => logo.replaceWith(document.createTextNode(initials(name))));
  }
} catch {
  root.innerHTML = '<a class="profile-back" data-atlas-back href="./?view=partners#directory">All partners</a><div class="atlas-empty"><h1>Profile unavailable</h1><p>The directory could not be loaded. Reload this page to try again, or return to the partner index.</p><a class="atlas-button" href="./?view=partners#directory">Browse partners</a></div>';
}
root.setAttribute('aria-busy', 'false');
