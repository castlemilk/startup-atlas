import { escapeHtml as esc, sourceUrl } from './logic.js';
import { logoFor, logoClassFor } from './logos.js';
import { partnerRelationships } from './relationships.js';
import { slug, teamPersonId } from './graph-model.js';
import { icon, renderEvidenceHeading } from './atlas-ui.js';
import { createProfileEvidence, profileSource as link, profileTime, recordedProfileDate } from './profile-evidence.js';
import { installProfileTabs } from './profile-tabs.js';

const root = document.getElementById('profile');
const name = new URLSearchParams(location.search).get('name') || '';

async function fetchJson(path) {
  const response = await fetch(path, { cache: 'no-cache' });
  if (!response.ok) throw new Error('Unavailable');
  return response.json();
}

const socials = items => Array.isArray(items) ? items.filter(item => sourceUrl(item.source)).map(item => link(item.url, item.label)).join(' ') : '';
const initials = value => value.trim().split(/\s+/).slice(0, 2).map(part => part[0] || '').join('').toUpperCase();
const mark = (name, url, classes, { local = true, eager = false } = {}) => {
  const image = local ? logoFor(name) || sourceUrl(url) : sourceUrl(url);
  const treatment = local && logoFor(name) ? logoClassFor(name) : '';
  return `<span class="${esc(classes)} ${esc(treatment)}" aria-hidden="true">${image ? `<img src="${esc(image)}" alt=""${eager ? '' : ' loading="lazy"'} referrerpolicy="no-referrer"><span class="mark-fallback" hidden>${esc(initials(name))}</span>` : `<span>${esc(initials(name))}</span>`}</span>`;
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

function section(id, title, items, render, empty, { available = true, inspector = '', intro = '' } = {}) {
  const status = !available ? 'Unavailable' : items.length ? `${items.length} researched` : 'Awaiting research';
  const list = items.length
    ? `<div class="${inspector ? 'profile-company-explorer' : 'profile-records'}"><div class="profile-list">${items.map(render).join('')}</div>${inspector}</div>`
    : available ? `<p class="profile-empty atlas-empty">${esc(empty)}</p>`
    : '<p class="profile-empty atlas-empty">This part of the research could not be loaded. <a href="">Retry</a></p>';
  return `<section class="profile-section" id="${id}"><div class="profile-section-head"><h2>${esc(title)}</h2><span>${esc(status)}</span></div>${intro}${list}</section>`;
}

function installSectionNavigation(nav) {
  const sync = () => root.style.setProperty('--profile-nav-height', `${nav.offsetHeight}px`);
  sync();
  if (typeof ResizeObserver === 'function') new ResizeObserver(sync).observe(nav);
  root.addEventListener('focusin', ({ target }) => {
    if (!target.closest('.profile-body') || !target.matches(':focus-visible')) return;
    requestAnimationFrame(() => {
      if (document.activeElement !== target || getComputedStyle(nav).position !== 'sticky') return;
      const bar = nav.getBoundingClientRect();
      const control = target.getBoundingClientRect();
      if (bar.top <= 1 && control.top < bar.bottom && control.bottom > 0) {
        target.scrollIntoView({ block: 'start', behavior: 'instant' });
      }
    });
  });
}

function installCompanyInspector(companies, render, evidence, nav) {
  const inspector = root.querySelector('#partner-company-detail');
  if (!inspector) return;
  const explorer = inspector.parentElement;
  const inline = matchMedia('(max-width: 1200px), (max-height: 540px)');
  let selected = explorer.querySelector('[data-company-index][aria-pressed="true"]');

  function placeInspector() {
    const active = document.activeElement;
    explorer.toggleAttribute('data-inline-inspector', inline.matches);
    if (inline.matches) {
      const row = selected.closest('[data-company-row]');
      if (row.nextElementSibling !== inspector) row.after(inspector);
    } else if (inspector.parentElement !== explorer) {
      explorer.append(inspector);
    }
    if (document.activeElement !== active && inspector.contains(active)) active.focus({ preventScroll: true });
  }

  placeInspector();
  inline.addEventListener('change', placeInspector);
  for (const button of explorer.querySelectorAll('[data-company-index]')) {
    button.addEventListener('click', () => {
      const index = Number(button.dataset.companyIndex);
      if (button !== selected) {
        selected.setAttribute('aria-pressed', 'false');
        selected.closest('[data-company-row]').dataset.selected = 'false';
        selected = button;
        selected.setAttribute('aria-pressed', 'true');
        selected.closest('[data-company-row]').dataset.selected = 'true';
        inspector.innerHTML = render(index);
        evidence.enhance(inspector);
        installImages(inspector);
        placeInspector();
      }
      root.querySelector('#partner-company-selection').textContent = `Inspecting ${companies[index].name}.`;
      if (inline.matches) {
        const heading = inspector.querySelector('h3');
        heading.tabIndex = -1;
        heading.focus({ preventScroll: true });
      }
      const top = getComputedStyle(nav).position === 'sticky' ? nav.offsetHeight : 0;
      const bounds = inspector.getBoundingClientRect();
      if (bounds.top < top || bounds.bottom > innerHeight) {
        const block = bounds.height > innerHeight - top - 24 ? 'start' : 'nearest';
        inspector.scrollIntoView({ block, behavior: 'instant' });
      }
    });
  }
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
    root.innerHTML = '<div class="profile-return"><a class="profile-back" data-atlas-back href="./list.html?view=partners">All partners</a></div><div class="atlas-empty"><h1>Partner not found</h1><p>Return to the directory and choose an organisation from the research index.</p><a class="atlas-button" href="./list.html?view=partners">Browse partners</a></div>';
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

  const renderPerson = (person, index) => `<article class="profile-item">${mark(person.name, person.photo, 'profile-item-mark person', { local: false })}<div><h3><a class="partner-profile-link" data-atlas-profile-link href="${personLink(person)}" aria-label="Open person ${esc(person.name)}">${esc(person.name)}</a></h3><p>${esc(person.role || 'Role to verify')}</p><div class="profile-socials">${socials(person.socials)}</div></div><div class="profile-item-source">${evidence.action(personProofs[index], 'Evidence')}${link(person.photo_source, 'Photo source')}</div></article>`;
  const renderCompany = (company, index) => `<article class="profile-item profile-company-row" data-company-row="${index}" data-selected="${index === 0}">${mark(company.name, company.logo, 'profile-item-mark company')}<div><h3><a class="partner-profile-link" data-atlas-profile-link href="${companyLink(company)}">${esc(company.name)}</a></h3><p>${esc(company.relationship || 'Listed in portfolio')}</p>${company.logo_source && company.logo_source !== company.source ? link(company.logo_source, 'Logo source', 'profile-image-source') : ''}</div><div class="profile-item-source">${evidence.action(companyProofs[index], 'Evidence')}<button class="profile-inspect" type="button" data-company-index="${index}" aria-controls="partner-company-detail" aria-pressed="${index === 0}" aria-label="Inspect ${esc(company.name)}">Inspect</button></div></article>`;
  const renderCompanyDetail = index => {
    const company = companies[index];
    return `<div class="profile-company-identity">${mark(company.name, company.logo, 'profile-item-mark company', { eager: true })}<h3 id="partner-company-title">${esc(company.name)}</h3></div>
      <div class="profile-company-evidence"><p><strong>Recorded relationship</strong>${esc(company.relationship || 'Listed in portfolio')}</p><div class="profile-detail-source">${evidence.action(companyProofs[index], 'Relationship evidence')}</div></div>
      <div class="profile-company-actions"><a class="atlas-button atlas-button-primary" data-atlas-profile-link href="${companyLink(company)}">Open company profile ${icon('arrow')}</a><a class="profile-detail-graph" data-atlas-profile-graph="${esc(startupId(company))}" href="${graphLink(startupId(company))}">${icon('graph')}Explore company graph</a></div>`;
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
  const sampleNote = companies.length ? `<p class="profile-sample">Selected portfolio sample.${checked ? ` Checked ${profileTime(checked)}.` : ''}</p>` : '';
  const portfolio = section('partner-companies', 'Companies researched', companies, renderCompany,
    'No companies have been researched for this organisation yet. Explore its source website for more information.', { available: profilesAvailable, inspector: companyInspector, intro: sampleNote });
  const supporters = sponsors.length ? section('partner-supporters', 'Programme supporters', sponsors, renderSponsor, '') : '';
  const programme = `<section class="profile-section" id="partner-programmes"><div class="profile-section-head"><h2>Programme relationships</h2></div>${relationsHtml}</section>`;
  const coverage = profilesAvailable
    ? `${companies.length ? `${companies.length} compan${companies.length === 1 ? 'y' : 'ies'} researched` : 'Companies not yet researched'} · ${people.length ? `${people.length} public team profile${people.length === 1 ? '' : 's'}` : 'People not yet researched'}`
    : 'Company and team research unavailable';
  const websiteUrl = sourceUrl(record?.website);
  const website = websiteUrl ? `<a href="${esc(websiteUrl)}" target="_blank" rel="noopener noreferrer" aria-label="Website for ${esc(name)}">${icon('external')}${esc(new URL(websiteUrl).hostname.replace(/^www\./, ''))}</a>` : '';
  const externalProfiles = socials(detail.socials);

  const tabSections = [['partner-companies', 'Companies'], ['partner-people', 'People'],
    ...(sponsors.length ? [['partner-supporters', 'Supporters']] : []), ['partner-programmes', 'Programmes']];

  root.innerHTML = `<div class="profile-return"><a class="profile-back" data-atlas-back href="./list.html?view=partners">All partners</a></div>
    <header class="profile-hero"><div class="profile-brand">${mark(name, null, 'profile-logo', { eager: true })}<div class="profile-identity"><div class="profile-nameplate"><h1>${esc(name)}</h1><p class="profile-type">${esc(detail.type || 'Organisation')}</p></div><div class="profile-context"><p class="profile-intro">${esc(record?.description || 'This organisation is in the research index. Identity and activity research is pending.')}</p>${locationText || website ? `<div class="profile-hero-meta">${locationText ? `<span class="profile-geography">${icon('location')}${esc(locationText)}</span>` : ''}${website}</div>` : ''}</div></div></div>
    <div class="profile-actions"><a class="atlas-button atlas-button-primary" data-atlas-profile-graph="${esc(graphId)}" href="${graphHref}">${icon('graph')}Explore graph</a>${externalProfiles ? `<div class="profile-socials">${externalProfiles}</div>` : ''}</div></header>
    <div class="profile-sticky"><span class="profile-compact-identity" aria-hidden="true">${mark(name, null, 'profile-item-mark company')}<span>${esc(name)}</span></span><nav class="atlas-section-nav" role="tablist" aria-label="Profile sections">${tabSections.map(([id, label], index) => `<a role="tab" id="tab-${id}" href="#${id}" aria-controls="${id}" aria-selected="${index === 0}" tabindex="${index === 0 ? '0' : '-1'}">${label}</a>`).join('')}</nav></div>
    ${partial ? '<p class="profile-notice" role="status">Some profile research is unavailable. Showing the information that loaded. <a href="">Retry</a></p>' : ''}
    <div class="profile-body"><div class="profile-main">${portfolio}<p class="profile-selection-status" id="partner-company-selection" role="status" aria-live="polite"></p>${team}${supporters}${programme}</div>
    <aside class="profile-aside"><section><h2>Research coverage</h2><p class="profile-coverage">${esc(coverage)}.</p>${checked && (people.length || !companies.length) ? `<p>${people.length ? 'Public team sample checked' : 'Research checked'} ${profileTime(checked)}.</p>` : ''}</section>
    <section><h2>Organisation evidence</h2><p>${supplemental[0].status === 'rejected' ? 'Identity research could not be loaded.' : reviewedOn ? `Identity reviewed ${profileTime(reviewedOn)}.` : 'Identity requires review.'}</p>${evidence.action(identityProof, 'Identity source')}<p>Recorded geography, office locations and programme eligibility describe different things. Follow each source for its scope and dates.</p><a class="profile-jump-link" href="#partner-sources">Browse all sources ${icon('arrow')}</a></section></aside></div>
    <details class="profile-sources-footer"><summary class="profile-sources-summary">${renderEvidenceHeading()}<span class="profile-sources-count">${evidence.sourceCount()} source${evidence.sourceCount() === 1 ? '' : 's'}</span></summary><section class="profile-section" id="partner-sources">${evidence.index()}</section></details>
    ${evidence.dialog()}`;
  const nav = root.querySelector('.profile-sticky');
  installSectionNavigation(nav);
  installImages(root);
  installCompanyInspector(companies, renderCompanyDetail, evidence, nav);
  evidence.install(root);
  for (const [id] of tabSections) {
    const panel = document.getElementById(id);
    if (panel) {
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', `tab-${id}`);
    }
  }
  const tabsApi = installProfileTabs(root);
  if (tabsApi && location.hash) {
    const target = document.getElementById(location.hash.slice(1));
    if (target && target.id === 'partner-sources') {
      const details = target.closest('details');
      if (details) details.open = true;
      target.scrollIntoView();
    }
  }
  document.title = name + ' — Startup Atlas';
  const pageDescription = (record?.description || '').trim() || 'Explore sourced partner profiles, people, companies and programme relationships.';
  document.querySelector('meta[name="description"]')?.setAttribute('content', pageDescription);
  for (const selector of ['meta[property="og:title"]', 'meta[name="twitter:title"]']) document.querySelector(selector)?.setAttribute('content', document.title);
  for (const selector of ['meta[property="og:description"]', 'meta[name="twitter:description"]']) document.querySelector(selector)?.setAttribute('content', pageDescription);
}

try { await renderProfile(); } catch {
  root.innerHTML = '<div class="profile-return"><a class="profile-back" data-atlas-back href="./list.html?view=partners">All partners</a></div><div class="atlas-empty"><h1>Profile unavailable</h1><p>The directory could not be loaded.</p><a class="atlas-button" href="">Retry</a> <a class="atlas-button" href="./list.html?view=partners">Browse partners</a></div>';
}
root.setAttribute('aria-busy', 'false');
