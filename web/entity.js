import { escapeHtml as esc, sourceUrl } from './logic.js';
import { logoFor } from './logos.js';
import { openGraph } from './graph-store.js';
import { entityDetails, entityHref, kindName } from './graph-model.js';

const root = document.getElementById('entity-profile');
const identity = new URLSearchParams(location.search).get('id') || '';
const source = (url, label = 'Source') => {
  const safe = sourceUrl(url);
  return safe ? `<a href="${esc(safe)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>` : '';
};
const initials = name => name.trim().split(/\s+/).slice(0, 2).map(part => part[0] || '').join('').toUpperCase();
const imageUrl = value => sourceUrl(value) || (/^\.\/assets\/logos\/[a-z0-9-]+\.(?:svg|png)$/i.test(value || '') ? value : '');
const mark = entity => {
  const image = imageUrl(entity.logo) || imageUrl(logoFor(entity.name));
  return `<span class="entity-mark ${entity.kind === 'person' ? 'entity-mark-person' : ''}" aria-hidden="true">${image ? `<img src="${esc(image)}" alt="" loading="lazy" referrerpolicy="no-referrer"><span class="entity-mark-fallback" hidden>${esc(initials(entity.name))}</span>` : esc(initials(entity.name))}</span>`;
};
const money = (value, currency, amountText) => {
  if (value == null || !currency) return amountText || 'Amount not recorded';
  try {
    return new Intl.NumberFormat('en-AU', { style: 'currency', currency, maximumFractionDigits: 0 }).format(Number(value));
  } catch {
    return `${value} ${currency}`;
  }
};
const relationLabel = (entity, edge, other) => {
  if (edge.kind === 'founded') return entity.kind === 'person' ? 'Founded' : 'Founder';
  if (edge.kind === 'supports') return entity.kind === 'startup' ? 'Listed in portfolio' : 'Portfolio company';
  if (edge.kind === 'team_member') return edge.description || 'Team member';
  if (edge.kind === 'offers') return entity.kind === 'programme' ? 'Programme operator' : 'Programme';
  return edge.description || kindName(other.kind);
};
const sectionHeading = (title, note = '') => `<div class="entity-section-heading"><h2>${esc(title)}</h2>${note ? `<span>${esc(note)}</span>` : ''}</div>`;

function connectionRows(details, edges = details.edges) {
  const names = new Map(details.related.map(item => [item.id, item]));
  return edges.map(edge => {
    const other = names.get(edge.from === details.entity.id ? edge.to : edge.from);
    if (!other) return '';
    return `<article class="entity-connection">${mark(other)}<div class="entity-connection-copy"><a data-atlas-profile-link href="${esc(entityHref(other))}">${esc(other.name)}</a><span>${esc(relationLabel(details.entity, edge, other))}</span></div><div class="entity-connection-source">${source(edge.source, 'Evidence')}</div></article>`;
  }).join('');
}

function programmeDetails(offer) {
  if (!offer) return '';
  const fields = [['Status', offer.status], ['Eligibility', offer.eligibility], ['Value', offer.value], ['Conditions', offer.limits], ['Geography', Array.isArray(offer.scope) ? offer.scope.join(', ') : '']].filter(([, value]) => value);
  return `<section class="entity-section" id="entity-programme">${sectionHeading('Programme details')}<dl class="entity-facts">${fields.map(([label, value]) => `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl></section>`;
}

try {
  const store = await openGraph();
  const details = entityDetails(store.graph, identity);
  const entity = details.entity;
  const isStartup = entity.kind === 'startup';
  const offer = entity.kind === 'programme' ? await store.opportunity(entity.opportunity_id) : null;
  const founderEdges = isStartup ? details.edges.filter(edge => edge.kind === 'founded' && details.related.some(item => item.id === (edge.from === entity.id ? edge.to : edge.from) && item.kind === 'person')) : [];
  const otherEdges = details.edges.filter(edge => !founderEdges.includes(edge));
  const connections = connectionRows(details, otherEdges);
  const founders = connectionRows(details, founderEdges);
  const facts = Array.isArray(entity.profile_facts) ? entity.profile_facts.filter(fact => fact.label && fact.value && sourceUrl(fact.source)) : [];
  const rounds = [...details.rounds].sort((a, b) => (b.announced_on || '').localeCompare(a.announced_on || ''));
  const articles = [...details.articles].sort((a, b) => (b.published_on || '').localeCompare(a.published_on || ''));
  const socialLinks = Array.isArray(entity.socials) ? entity.socials.filter(item => sourceUrl(item.url) && sourceUrl(item.source)).map(item => source(item.url, item.label)).join(' ') : '';
  const founded = Number.isInteger(entity.founded_year) && entity.founded_year > 0 ? `Founded ${entity.founded_year}` : '';
  const sectionLinks = [
    ...(offer ? [['entity-programme', 'Programme']] : []),
    ...(isStartup ? [['entity-founders', 'Founders'], ['entity-company', 'Company'], ['entity-funding', 'Funding']] : []),
    ['entity-connections', 'Connections'], ['entity-sources', 'Sources']
  ];
  const coverage = isStartup
    ? `${founderEdges.length ? `${founderEdges.length} founder${founderEdges.length === 1 ? '' : 's'} recorded` : 'Founders not yet researched'} · ${facts.length} sourced company fact${facts.length === 1 ? '' : 's'} · ${rounds.length ? `${rounds.length} recorded funding event${rounds.length === 1 ? '' : 's'}` : 'Funding not yet researched'}`
    : `${details.edges.length} researched connection${details.edges.length === 1 ? '' : 's'}`;

  root.innerHTML = `<a class="profile-back" data-atlas-back href="./graph.html?entity=${encodeURIComponent(entity.id)}">Back to graph</a>
    <div class="entity-hero">
      <div class="entity-hero-identity">${mark(entity)}<div><h1>${esc(entity.name)}</h1><p class="entity-hero-note"><span class="atlas-badge" data-kind="${esc(entity.kind)}">${esc(kindName(entity.kind))}</span>${founded ? `<span>${esc(founded)}</span>` : ''}</p></div></div>
      <div class="entity-hero-copy"><p>${esc(entity.summary || 'This profile is connected to the sources and organisations listed below. More details are being researched.')}</p><div class="entity-actions"><a class="atlas-button atlas-button-primary" href="./graph.html?entity=${encodeURIComponent(entity.id)}">Explore connections</a>${source(entity.website, 'Website')}${socialLinks}</div></div>
    </div>
    <p class="atlas-coverage profile-coverage"><strong>Research coverage</strong><span>${esc(coverage)}.</span></p>
    <nav class="atlas-section-nav" aria-label="Profile sections">${sectionLinks.map(([id, label]) => `<a href="#${id}">${label}</a>`).join('')}</nav>
    ${store.mode === 'fallback' ? '<p class="entity-notice" role="status">Showing the published backup while the database is unavailable.</p>' : ''}
    <div class="entity-content"><div class="entity-main">
      ${programmeDetails(offer)}
      ${isStartup ? `<section class="entity-section" id="entity-founders">${sectionHeading('Founders', founderEdges.length ? `${founderEdges.length} recorded` : 'Not yet researched')}${founders ? `<div class="entity-connections">${founders}</div>` : '<p class="entity-empty atlas-empty">Founder information has not been researched yet. The source links may contain more detail.</p>'}</section>
      <section class="entity-section" id="entity-company">${sectionHeading('Company details', facts.length ? 'Source-backed facts' : 'Not yet researched')}${facts.length ? `<dl class="entity-facts">${facts.map(fact => `<div><dt>${esc(fact.label)}</dt><dd>${esc(fact.value)}<span class="entity-fact-source">${source(fact.source, 'Source')}${fact.reviewed_at ? ` · reviewed ${esc(fact.reviewed_at)}` : ''}</span></dd></div>`).join('')}</dl>` : '<p class="entity-empty atlas-empty">Additional company facts have not been recorded. Details will appear here with their sources and review dates.</p>'}</section>
      <section class="entity-section" id="entity-funding">${sectionHeading('Funding history', rounds.length ? `${rounds.length} recorded event${rounds.length === 1 ? '' : 's'}` : 'Not yet researched')}${rounds.length ? rounds.map(round => `<article class="entity-round"><div class="entity-round-event"><strong>${esc(round.stage || 'Funding round')}</strong><span>${esc(round.announced_on || 'Date not disclosed')}</span></div><div class="entity-round-amount"><strong>${esc(money(round.amount, round.currency, round.amount_text))}</strong>${round.valuation ? `<span>Historical valuation ${esc(money(round.valuation, round.valuation_currency))}</span>` : ''}</div>${round.note ? `<p>${esc(round.note)}</p>` : ''}<div class="entity-round-source">${source(round.source, 'Announcement')}</div></article>`).join('') : '<p class="entity-empty atlas-empty">Funding has not been researched yet. An unrecorded amount does not mean the company has raised no funding.</p>'}<p class="entity-caption">Historical announcements, not current valuations or total funding raised. Amounts retain their recorded currencies.</p></section>` : ''}
      <section class="entity-section" id="entity-connections">${sectionHeading('Connections', `${otherEdges.length} researched`)}${connections ? `<div class="entity-connections">${connections}</div>` : '<p class="entity-empty atlas-empty">No other reviewed connections have been added yet.</p>'}</section>
    </div>
    <aside class="entity-aside"><section id="entity-sources"><h2>Sources &amp; context</h2><p>Each connection links to the source that describes it. A portfolio listing does not by itself establish a funding round.</p><div class="entity-source-list">${source(entity.source, 'Profile source')}${source(entity.logo_source, 'Image source')}</div></section>
      <section><h2>News &amp; research</h2>${articles.length ? `<ul>${articles.map(article => `<li>${source(article.url, article.title)}<span>${esc(article.published_on || 'Publication date not recorded')}</span></li>`).join('')}</ul>` : '<p>No news sources have been added to this profile yet.</p>'}</section>
    </aside></div>`;
  root.querySelectorAll('.entity-mark img').forEach(img => img.addEventListener('error', () => {
    img.hidden = true;
    if (img.nextElementSibling) img.nextElementSibling.hidden = false;
  }));
  document.title = entity.name + ' — Startup Atlas';
} catch {
  root.innerHTML = '<a class="profile-back" data-atlas-back href="./graph.html">Back to graph</a><div class="atlas-empty"><h1>Profile unavailable</h1><p>This profile could not be found or loaded. Return to the graph to choose another entry, or reload this page to try again.</p><a class="atlas-button" href="./graph.html">Open knowledge graph</a></div>';
}
root.setAttribute('aria-busy', 'false');
