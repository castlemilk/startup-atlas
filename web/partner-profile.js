import { escapeHtml as esc, sourceUrl } from './logic.js';
import { logoFor, logoClassFor } from './logos.js';
import { partnerRelationships } from './relationships.js';
import { slug, teamPersonId } from './graph-model.js';
import { icon, renderEvidenceHeading } from './atlas-ui.js';
import { createProfileEvidence, profileSource as link, profileTime, recordedProfileDate } from './profile-evidence.js';

const root = document.getElementById('profile');
const name = new URLSearchParams(location.search).get('name') || '';

async function fetchJson(path) {
  const response = await fetch(path, { cache: 'no-cache' });
  if (!response.ok) throw new Error('Unavailable');
  return response.json();
}

const socials = items => Array.isArray(items) ? items.filter(item => sourceUrl(item.source)).map(item => link(item.url, item.label)).join(' ') : '';
const initials = value => value.trim().split(/\s+/).slice(0, 2).map(part => part[0] || '').join('').toUpperCase();
const mark = (name, url, classes = '', local = true) => {
  const image = local ? logoFor(name) || sourceUrl(url) : sourceUrl(url);
  const treatment = local && logoFor(name) ? logoClassFor(name) : '';
  return `<span class="${esc(classes)} ${esc(treatment)}" aria-hidden="true">${image ? `<img src="${esc(image)}" alt="" referrerpolicy="no-referrer"><span class="mark-fallback" hidden>${esc(initials(name))}</span>` : `<span>${esc(initials(name))}</span>`}</span>`;
};
const personLink = person => `./entity.html?id=${encodeURIComponent(teamPersonId(person.name, name))}`;
const startupId = company => 'startup:' + slug(company.name);
const companyLink = company => `./entity.html?id=${encodeURIComponent(startupId(company))}`;
const graphLink = entity => `./graph.html?entity=${encodeURIComponent(entity)}`;

function installImages(scope) {
  for (const img of scope.querySelectorAll('.profile-item-mark img, .profile-logo img')) {
    function fallback() {
      img.hidden = true;
      img.nextElementSibling.hidden = false;
    }
    if (img.complete && !img.naturalWidth) fallback();
    else img.addEventListener('error', fallback, { once: true });
  }
}

function section(id, title, items, render, empty, { available = true, inspector = '' } = {}) {
  const status = !available ? 'Unavailable' : items.length ? `${items.length} researched` : 'Awaiting research';
  const list = items.length
    ? `<div class="${inspector ? 'profile-company-explorer' : 'profile-records'}"><div class="profile-list">${items.map(render).join('')}</div>${inspector}</div>`
    : available ? `<p class="profile-empty atlas-empty">${esc(empty)}</p>`
    : '<p class="profile-empty atlas-empty">This part of the research could not be loaded. <a href="">Retry</a></p>';
  return `<section class="profile-section" id="${id}"><div class="profile-section-head"><h2>${esc(title)}</h2><span>${esc(status)}</span></div>${list}</section>`;
}

async function renderProfile() {
  const [catalogue, supplemental] = await Promise.all([
    fetchJson('./data/catalogue.json'),
    Promise.allSettled([
      fetchJson('./data/partners-reviewed.json'),
      fetchJson('./data/partner-profiles.json'),
      fetchJson('./data/map-locations.json')
    ])
  ]);
  if (!Array.isArray(catalogue.partnerLeads) || !catalogue.partnerLeads.includes(name)) {
    root.innerHTML = '<div class="profile-return"><a class="profile-back" data-atlas-back href="./?view=partners#directory">All partners</a></div><div class="atlas-empty"><h1>Partner not found</h1><p>Return to the directory and choose an organisation from the research index.</p><a class="atlas-button" href="./?view=partners#directory">Browse partners</a></div>';
    return;
  }

  const [reviewed, profiles, places] = supplemental.map(result => result.status === 'fulfilled' ? result.value : null);
  const profilesAvailable = profiles && typeof profiles === 'object';
  const partial = supplemental.some(result => result.status === 'rejected');
  const record = reviewed && Object.hasOwn(reviewed, name) ? reviewed[name] : null;
  const detail = profilesAvailable && Object.hasOwn(profiles, name) ? profiles[name] : {};
  const relations = Object.hasOwn(partnerRelationships, name) ? partnerRelationships[name] : [];
  const locations = Array.isArray(places) ? places.filter(place => Array.isArray(place.partners) && place.partners.some(item => item.name === name)) : [];
  const locationText = detail.geography || [...new Set(locations.map(place => place.country))].join(', ');
  const people = Array.isArray(detail.people) ? detail.people : [];
  const companies = Array.isArray(detail.companies) ? detail.companies : [];
  const sponsors = Array.isArray(detail.sponsors) ? detail.sponsors : [];
  const checked = recordedProfileDate(detail.checked);
  const reviewedOn = recordedProfileDate(record?.reviewed_at);
  const evidence = createProfileEvidence(name);
  const identityProof = evidence.add({
    label: 'Organisation identity', value: record?.description || name,
    sources: [{ url: record?.source, reviewed_at: record?.reviewed_at }]
  });
  const graphId = 'partner:' + slug(name);
  const graphHref = graphLink(graphId);
  const companyProofs = companies.map(company => evidence.add({
    label: `Portfolio relationship · ${company.name}`, value: company.relationship || 'Listed in portfolio',
    fields: [['Company', company.name], ...(checked ? [['Research sample checked', checked.label]] : [])],
    sources: [{ url: company.source }]
  }));
  const personProofs = people.map(person => evidence.add({
    label: `Reported role · ${person.name}`, value: person.role || 'Role to verify',
    fields: [['Person', person.name], ...(checked ? [['Research sample checked', checked.label]] : [])],
    sources: [{ url: person.source }]
  }));

  const renderPerson = (person, index) => `<article class="profile-item">${mark(person.name, person.photo, 'profile-item-mark person', false)}<div><h3><a class="partner-profile-link" data-atlas-profile-link href="${personLink(person)}" aria-label="Open person ${esc(person.name)}">${esc(person.name)}</a></h3><p>${esc(person.role || 'Role to verify')}</p><div class="profile-socials">${socials(person.socials)}</div></div><div class="profile-item-source">${evidence.action(personProofs[index], 'Evidence')}${link(person.photo_source, 'Photo source')}</div></article>`;
  const renderCompany = (company, index) => `<article class="profile-item profile-company-row" data-company-row="${index}" data-selected="${index === 0}">${mark(company.name, company.logo, 'profile-item-mark company')}<div><h3><a class="partner-profile-link" data-atlas-profile-link href="${companyLink(company)}">${esc(company.name)}</a></h3><p>${esc(company.relationship || 'Listed in portfolio')}</p></div><div class="profile-item-source">${evidence.action(companyProofs[index], 'Evidence')}<button class="profile-inspect" type="button" data-company-index="${index}" aria-controls="partner-company-detail" aria-pressed="${index === 0}" aria-label="Inspect ${esc(company.name)}">Inspect</button>${company.logo_source && company.logo_source !== company.source ? link(company.logo_source, 'Logo source') : ''}</div></article>`;
  const renderCompanyDetail = index => {
    const company = companies[index];
    return `<div class="profile-company-identity">${mark(company.name, company.logo, 'profile-item-mark company')}<div><span class="profile-kicker">Selected company</span><h3 id="partner-company-title">${esc(company.name)}</h3></div></div>
      <div class="profile-company-evidence"><p><strong>Recorded relationship</strong>${esc(company.relationship || 'Listed in portfolio')}</p><div class="profile-detail-source">${evidence.action(companyProofs[index], 'Relationship evidence')}</div></div>
      <a class="atlas-button atlas-button-primary" data-atlas-profile-link href="${companyLink(company)}">Open company profile ${icon('arrow')}</a><a class="profile-detail-graph" data-atlas-profile-graph="${esc(startupId(company))}" href="${graphLink(startupId(company))}">${icon('graph')}Explore company graph</a>`;
  };
  const companyInspector = companies.length ? `<aside class="profile-company-detail" id="partner-company-detail" aria-labelledby="partner-company-title">${renderCompanyDetail(0)}</aside>` : '';
  const renderSponsor = sponsor => {
    const proof = evidence.add({ label: `Programme support · ${sponsor.name}`, value: sponsor.relationship || 'Relationship to verify', sources: [{ url: sponsor.source }] });
    return `<article class="profile-item">${mark(sponsor.name, sponsor.logo, 'profile-item-mark company')}<div><h3>${esc(sponsor.name)}</h3><p>${esc(sponsor.relationship || 'Relationship to verify')}</p></div><div class="profile-item-source">${evidence.action(proof, 'Evidence')}${link(sponsor.logo_source, 'Logo source')}</div></article>`;
  };
  const relationsHtml = relations.length ? relations.map(relation => {
    const proof = evidence.add({ label: `Programme relationship · ${relation.provider}`, value: relation.relationship, fields: [['Programme', relation.programme]], sources: [{ url: relation.source }] });
    return `<article class="profile-relationship"><div class="profile-relationship-heading">${mark(relation.provider, null, 'profile-item-mark company')}<div><strong>${esc(relation.provider)}</strong><span>${esc(relation.programme)}</span></div></div><p>${esc(relation.relationship)}</p>${evidence.action(proof, 'Evidence')}</article>`;
  }).join('') : '<p class="profile-empty atlas-empty">No provider relationships have been reviewed for this organisation yet.</p>';

  const team = section('partner-people', 'People & reported roles', people, renderPerson, 'People and roles have not been researched for this organisation yet.', { available: profilesAvailable });
  const portfolio = section('partner-companies', 'Companies researched', companies, renderCompany,
    'No companies have been researched for this organisation yet. Explore its source website for more information.', { available: profilesAvailable, inspector: companyInspector });
  const supporters = sponsors.length ? section('partner-supporters', 'Programme supporters', sponsors, renderSponsor, '') : '';
  const programme = `<section class="profile-section" id="partner-programmes"><div class="profile-section-head"><h2>Programme relationships</h2></div>${relationsHtml}</section>`;
  const coverage = profilesAvailable
    ? `${companies.length ? `${companies.length} compan${companies.length === 1 ? 'y' : 'ies'} researched` : 'Companies not yet researched'} · ${people.length ? `${people.length} public team profile${people.length === 1 ? '' : 's'}` : 'People not yet researched'}`
    : 'Company and team research unavailable';
  const websiteUrl = sourceUrl(record?.website);
  const website = websiteUrl ? `<a href="${esc(websiteUrl)}" target="_blank" rel="noopener noreferrer" aria-label="Website for ${esc(name)}">${icon('external')}${esc(new URL(websiteUrl).hostname.replace(/^www\./, ''))}</a>` : '';
  const externalProfiles = socials(detail.socials);

  root.innerHTML = `<div class="profile-return"><a class="profile-back" data-atlas-back href="./?view=partners#directory">All partners</a>${detail.type ? `<span class="profile-return-context">${esc(detail.type)}</span>` : ''}</div>
    <header class="profile-hero"><div class="profile-brand">${mark(name, null, 'profile-logo')}<div class="profile-identity"><p class="profile-kicker">${esc(detail.type || 'Organisation')}</p><h1>${esc(name)}</h1><p class="profile-intro">${esc(record?.description || 'This organisation is in the research index. Identity and activity research is pending.')}</p>${locationText || website ? `<div class="profile-hero-meta">${locationText ? `<span class="profile-geography">${icon('location')}${esc(locationText)}</span>` : ''}${website}</div>` : ''}</div></div>
    <div class="profile-actions"><a class="atlas-button atlas-button-primary" data-atlas-profile-graph="${esc(graphId)}" href="${graphHref}">${icon('graph')}Explore graph</a>${externalProfiles ? `<div class="profile-socials">${externalProfiles}</div>` : ''}</div></header>
    <div class="profile-sticky"><span class="profile-compact-identity" aria-hidden="true">${mark(name, null, 'profile-item-mark company')}<span>${esc(name)}</span></span><nav class="atlas-section-nav" aria-label="Profile sections"><a href="#partner-companies">Companies</a><a href="#partner-people">People</a>${sponsors.length ? '<a href="#partner-supporters">Supporters</a>' : ''}<a href="#partner-programmes">Programmes</a><a href="#partner-sources">Sources</a></nav></div>
    ${partial ? '<p class="profile-notice" role="status">Some profile research is unavailable. Showing the information that loaded. <a href="">Retry</a></p>' : ''}
    <div class="profile-body"><div class="profile-main">${portfolio}<p class="profile-selection-status" id="partner-company-selection" role="status" aria-live="polite"></p>${team}${supporters}${programme}
    <section class="profile-section" id="partner-sources"><div class="profile-section-head">${renderEvidenceHeading()}</div>${evidence.index()}</section></div>
    <aside class="profile-aside"><section><h2>Research coverage</h2><p class="profile-coverage">${esc(coverage)}.${profilesAvailable ? ' This is a selected sample, not the organisation’s full portfolio or team.' : ''}</p>${checked ? `<p>People and company sample checked ${profileTime(checked)}.</p>` : ''}</section>
    <section><h2>Organisation evidence</h2><p>${supplemental[0].status === 'rejected' ? 'Identity research could not be loaded.' : reviewedOn ? `Identity reviewed ${profileTime(reviewedOn)}.` : 'Identity requires review.'}</p>${evidence.action(identityProof, 'Identity source')}<p>Recorded geography, office locations and programme eligibility describe different things. Follow each source for its scope and dates.</p><a class="profile-jump-link" href="#partner-sources">Browse all sources ${icon('arrow')}</a></section></aside></div>
    ${evidence.dialog()}`;
  evidence.install(root);
  installImages(root);
  root.querySelectorAll('[data-company-index]').forEach(button => button.addEventListener('click', () => {
    const index = Number(button.dataset.companyIndex);
    const company = companies[index];
    if (!Number.isInteger(index) || !company) return;
    root.querySelectorAll('[data-company-index]').forEach(control => control.setAttribute('aria-pressed', String(control === button)));
    root.querySelectorAll('[data-company-row]').forEach(row => { row.dataset.selected = String(Number(row.dataset.companyRow) === index); });
    const inspector = root.querySelector('#partner-company-detail');
    inspector.innerHTML = renderCompanyDetail(index);
    evidence.enhance(inspector);
    installImages(inspector);
    root.querySelector('#partner-company-selection').textContent = `Inspecting ${company.name}. Its recorded relationship and source are shown in the company detail panel.`;
    if (matchMedia('(max-width: 1200px)').matches) {
      const heading = inspector.querySelector('h3');
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
      inspector.scrollIntoView({ block: 'start', behavior: 'instant' });
    }
  }));
  if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
  document.title = name + ' — Startup Atlas';
}

try { await renderProfile(); } catch {
  root.innerHTML = '<div class="profile-return"><a class="profile-back" data-atlas-back href="./?view=partners#directory">All partners</a></div><div class="atlas-empty"><h1>Profile unavailable</h1><p>The directory could not be loaded.</p><a class="atlas-button" href="">Retry</a> <a class="atlas-button" href="./?view=partners#directory">Browse partners</a></div>';
}
root.setAttribute('aria-busy', 'false');
