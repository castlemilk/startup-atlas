import { escapeHtml as esc, sourceUrl } from './logic.js';
import { logoFor, logoClassFor } from './logos.js';
import { openGraph } from './graph-store.js';
import { entityDetails, entityHref, kindName } from './graph-model.js';
import { icon, renderEvidenceHeading } from './atlas-ui.js';
import { createProfileEvidence, profileSource, profileTime, recordedProfileDate } from './profile-evidence.js';

const root = document.getElementById('entity-profile');
const identity = new URLSearchParams(location.search).get('id') || '';
const initials = name => name.trim().split(/\s+/).slice(0, 2).map(part => part[0] || '').join('').toUpperCase();
const mark = entity => {
  const image = sourceUrl(entity.logo) || logoFor(entity.name);
  const classes = ['entity-mark', entity.kind === 'person' ? 'entity-mark-person' : '', logoClassFor(entity.name)].filter(Boolean).join(' ');
  return `<span class="${classes}" aria-hidden="true">${image ? `<img src="${esc(image)}" alt="" referrerpolicy="no-referrer"><span class="entity-mark-fallback" hidden>${esc(initials(entity.name))}</span>` : esc(initials(entity.name))}</span>`;
};
const heading = title => `<div class="entity-section-heading"><h2>${esc(title)}</h2></div>`;
const empty = message => `<p class="entity-empty atlas-empty">${esc(message)}</p>`;
const graphLink = id => `./graph.html?entity=${encodeURIComponent(id)}`;
const count = (size, word) => `${size} ${word}${size === 1 ? '' : 's'}`;

function money(value, currency, amountText) {
  if (value == null) return amountText || 'Amount not recorded';
  if (!currency) return amountText || `${value} (currency unspecified)`;
  try {
    return new Intl.NumberFormat('en-AU', { style: 'currency', currency, currencyDisplay: 'code', maximumFractionDigits: 0 }).format(Number(value));
  } catch {
    return `${value} ${currency}`;
  }
}

function relationshipLabel(entity, edge, other) {
  switch (edge.kind) {
    case 'founded': return entity.kind === 'person' ? 'Founded' : 'Founder';
    case 'supports': return entity.kind === 'startup' ? 'Listed in portfolio' : 'Portfolio company';
    case 'team_member':
    case 'employment': return edge.description || 'Reported team role';
    case 'offers': return entity.kind === 'programme' ? 'Programme operator' : 'Programme';
    case 'subsidiary_of': return edge.from === entity.id ? 'Parent organisation' : 'Subsidiary';
    default: return edge.description || kindName(other.kind);
  }
}

function connectionRow({ other, label, meta = '', evidence, personAction = false, rowClass = 'entity-connection' }) {
  const href = esc(entityHref(other));
  return `<article class="${rowClass}">${mark(other)}<div class="entity-connection-copy"><a data-atlas-profile-link href="${href}"${personAction ? ` aria-label="Open person ${esc(other.name)}"` : ''}>${esc(other.name)} ${icon('arrow')}</a><span>${esc(label)}${meta ? ` · ${esc(meta)}` : ''}</span></div><div class="entity-connection-source">${evidence}</div></article>`;
}

function authoredDates(edge) {
  const start = recordedProfileDate(edge.started_on);
  const end = recordedProfileDate(edge.ended_on);
  const reported = recordedProfileDate(edge.reported_on);
  return [
    ...(start ? [['Started', start.label]] : []),
    ...(end ? [['Ended', end.label]] : []),
    ...(reported ? [['Role reported', reported.label]] : [])
  ];
}

function edgeDateText(edge, employment) {
  const dates = authoredDates(edge).map(([label, date]) => `${label} ${date}`);
  if (employment && edge.status === 'former') dates.unshift('Former role');
  if (employment && edge.status !== 'former' && !edge.ended_on) dates.push('Current status unrecorded');
  return dates.join(' · ');
}

function renderSharedFounders(graph, entity, founders, named, evidence, citation) {
  const byCompany = new Map();
  const people = new Set(founders.map(edge => edge.from));
  for (const edge of graph.edges) {
    if (edge.kind !== 'founded' || edge.to === entity.id || !people.has(edge.from) || named.get(edge.to)?.kind !== 'startup') continue;
    const partner = byCompany.get(edge.to) || [];
    partner.push(edge);
    byCompany.set(edge.to, partner);
  }
  if (!byCompany.size) return '';
  return `<div class="entity-subsection"><h3>Shared company history</h3><div class="entity-connections">${[...byCompany].map(([id, edges]) => {
    const other = named.get(id);
    const names = [...new Set(edges.map(edge => named.get(edge.from).name))];
    const label = `Shared ${names.length === 1 ? 'founder' : 'founders'}: ${new Intl.ListFormat('en-AU').format(names)}`;
    const sources = [...new Set(edges.map(edge => edge.source))].map(url => citation(url));
    const claim = evidence.add({ label: `Shared founders with ${other.name}`, value: label, sources });
    return connectionRow({ other, label, evidence: evidence.action(claim), rowClass: 'entity-shared-company' });
  }).join('')}</div></div>`;
}

function programmeDetails(offer, unavailable) {
  if (!offer && !unavailable) return '';
  const fields = offer ? [['Status', offer.status], ['Eligibility', offer.eligibility], ['Value', offer.value], ['Conditions', offer.limits], ['Geography', Array.isArray(offer.scope) ? offer.scope.join(', ') : '']].filter(([, value]) => value) : [];
  return `<section class="entity-section" id="entity-programme">${heading('Programme details')}${unavailable ? '<p class="profile-notice" role="status">Programme details could not be loaded. <a href="">Retry</a></p>' : `<dl class="entity-facts">${fields.map(([label, value]) => `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl>`}</section>`;
}

function fundingDate(round) {
  const event = recordedProfileDate(round.event_on);
  const announcement = recordedProfileDate(round.announced_on);
  return event ? { date: event, label: 'Event date' } : { date: announcement, label: 'Announcement date' };
}

function fundingParticipants(round, named, evidence, citation) {
  if (!Array.isArray(round.participants) || !round.participants.length) return '<p>Participants have not been recorded for this event.</p>';
  const rows = round.participants.map(participant => {
    const entity = named.get(participant.entity_id);
    const name = entity?.name || participant.name;
    if (!name) return '';
    const role = { lead: 'Lead', participant: 'Participant' }[String(participant.role || '').toLowerCase()] || 'Role not recorded';
    const claim = evidence.add({
      label: `${round.stage || 'Funding event'} participant · ${name}`, value: role,
      sources: [citation(participant.source || round.source)]
    });
    return `<li>${entity ? `<a data-atlas-profile-link href="${esc(entityHref(entity))}">${esc(name)}</a>` : `<strong>${esc(name)}</strong>`}<span>${esc(role)}</span>${evidence.action(claim)}</li>`;
  }).filter(Boolean);
  return rows.length ? `<ul class="entity-participants">${rows.join('')}</ul>` : '<p>Participants have not been recorded for this event.</p>';
}

function roundRow({ round, title, date, dateLabel }, named, evidence, citation) {
  const amount = money(round.amount, round.currency, round.amount_text);
  const fields = [
    ['Event type', title],
    ['Event date', recordedProfileDate(round.event_on)?.label || 'Not recorded'],
    ['Announcement date', recordedProfileDate(round.announced_on)?.label || 'Not recorded'],
    ['Currency', round.currency || 'Not specified']
  ];
  const claim = evidence.add({ label: `${title} · reported amount`, value: amount, fields, sources: [citation(round.source)], note: round.note });
  const participants = fundingParticipants(round, named, evidence, citation);
  return `<li><details class="entity-round"><summary><span class="entity-round-event"><strong>${esc(title)}</strong><span>${date ? `${esc(dateLabel)} · ${profileTime(date)}` : 'Event and announcement dates unrecorded'}</span></span><strong class="entity-round-amount">${esc(amount)}</strong>${icon('chevron-down')}</summary><div class="entity-round-detail"><dl class="entity-round-facts">${fields.slice(1).map(([label, value]) => `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join('')}${round.valuation != null ? `<div><dt>Historical valuation</dt><dd>${esc(money(round.valuation, round.valuation_currency))}</dd></div>` : ''}</dl>${round.note ? `<p>${esc(round.note)}</p>` : ''}<div class="entity-round-participants"><h3>Participants</h3>${participants}</div>${evidence.action(claim, 'Evidence')}</div></details></li>`;
}

function articleRow({ article, title, date }, evidence, citation) {
  const category = article.kind || 'Article';
  const label = category[0].toUpperCase() + category.slice(1);
  const claim = evidence.add({ label: title, value: label, sources: [citation(article.url)] });
  return `<li><article class="entity-timeline-entry"><div class="entity-round-event"><strong>${esc(title)}</strong><span>${esc(label)} · ${date ? `Published ${profileTime(date)}` : 'Publication date unrecorded'}</span></div>${evidence.action(claim, 'Evidence')}</article></li>`;
}

function companyTimeline(rounds, articles, named, evidence, citation) {
  const entries = rounds.map(round => {
    const { date, label: dateLabel } = fundingDate(round);
    return { date, dateLabel, title: round.stage || 'Funding event', round };
  });
  const roundSources = new Set(rounds.map(round => sourceUrl(round.source)).filter(Boolean));
  for (const article of articles) {
    const url = sourceUrl(article.url);
    if (!url || (article.kind === 'funding announcement' && roundSources.has(url))) continue;
    entries.push({ date: recordedProfileDate(article.published_on), title: article.title, article });
  }
  const dated = entries.filter(entry => entry.date).sort((a, b) => a.date.value.localeCompare(b.date.value));
  const undated = entries.filter(entry => !entry.date);
  const render = entry => entry.round ? roundRow(entry, named, evidence, citation) : articleRow(entry, evidence, citation);
  const coverage = rounds.length
    ? '<p class="entity-section-intro">Historical announcements and recorded financing events. Amounts retain their recorded currencies. A lifetime fundraising total is unavailable.</p>'
    : empty('No recorded funding announcements. The published research has no financing events for this company.');
  return `<section class="entity-section" id="entity-funding">${heading('Funding history')}${coverage}
    ${dated.length ? `<ol class="entity-timeline">${dated.map(render).join('')}</ol>` : ''}
    ${undated.length ? `<h3 class="entity-undated-heading">Undated records</h3><ul class="entity-timeline entity-timeline-undated">${undated.map(render).join('')}</ul>` : ''}</section>`;
}

async function renderProfile() {
  const store = await openGraph();
  const { entity, edges, rounds, articles } = entityDetails(store.graph, identity);
  const isStartup = entity.kind === 'startup';
  const named = new Map(store.graph.entities.map(item => [item.id, item]));
  const otherEntity = edge => named.get(edge.from === entity.id ? edge.to : edge.from);
  const founders = isStartup ? edges.filter(edge => edge.kind === 'founded' && edge.to === entity.id && otherEntity(edge)?.kind === 'person') : [];
  const employment = isStartup || entity.kind === 'person' ? edges.filter(edge => ['team_member', 'employment'].includes(edge.kind) && otherEntity(edge)) : [];
  const otherEdges = edges.filter(edge => !founders.includes(edge) && !employment.includes(edge) && otherEntity(edge));
  let offer = null;
  let programmeUnavailable = false;
  if (entity.kind === 'programme') {
    try { offer = await store.opportunity(entity.opportunity_id); } catch { programmeUnavailable = true; }
  }

  const evidence = createProfileEvidence(entity.name);
  const articlesBySource = new Map(store.graph.articles.map(item => [sourceUrl(item.url), item]));
  const citation = (url, extra = {}) => {
    const article = articlesBySource.get(sourceUrl(url));
    return { url, title: article?.title, published_on: article?.published_on, ...extra };
  };
  const summary = entity.summary || '';
  const summaryProof = evidence.add({ label: 'Profile description', value: summary || entity.name, sources: [citation(entity.source)] });
  const imageProof = evidence.add({ label: 'Profile image', value: entity.name, sources: [citation(entity.logo_source)] });
  const facts = (Array.isArray(entity.profile_facts) ? entity.profile_facts : []).filter(fact => fact.label && fact.value);
  const foundingYear = Number.isInteger(entity.founded_year) && entity.founded_year > 0 ? String(entity.founded_year) : '';
  if (foundingYear && !facts.some(fact => /^(?:founding year|founded)$/i.test(fact.label))) facts.unshift({ label: 'Founding year', value: foundingYear, source: entity.source });
  const recordedFacts = facts.map(fact => ({ ...fact, proof: evidence.add({
    label: fact.label, value: fact.value, sources: [citation(fact.source, { reviewed_at: fact.reviewed_at })]
  }) }));
  const places = recordedFacts.filter(fact => /^(?:reported )?headquarters$/i.test(fact.label) && sourceUrl(fact.source));
  const place = places.length === 1 ? places[0] : null;
  const sector = recordedFacts.find(fact => /^(?:primary )?sector$/i.test(fact.label) && sourceUrl(fact.source));
  const heroMetadata = [place ? `<span>${icon('location')}${esc(place.value)}</span>` : '', sector ? `<span>${esc(sector.value)}</span>` : ''].filter(Boolean).join('');
  const website = profileSource(entity.website, 'Website', 'atlas-button');
  const socials = (Array.isArray(entity.socials) ? entity.socials : []).filter(item => sourceUrl(item.source)).map(item => profileSource(item.url, item.label)).join(' ');
  const shareProfile = graphLink(entity.id);
  const sectionLinks = [
    ...(isStartup ? [['entity-company', 'Overview'], ['entity-founders', 'People'], ['entity-funding', 'Funding']] : []),
    ...(offer || programmeUnavailable ? [['entity-programme', 'Programme']] : []),
    ...(!isStartup && employment.length ? [['entity-employment', 'Employment']] : []),
    ['entity-connections', 'Relationships'], ['entity-sources', 'Sources']
  ];

  function renderConnection(edge, { personAction = false, role = false } = {}) {
    const other = otherEntity(edge);
    const label = relationshipLabel(entity, edge, other);
    const dates = authoredDates(edge);
    const sourceDate = recordedProfileDate(citation(edge.source).published_on);
    const meta = [!role ? kindName(other.kind) : '', edgeDateText(edge, role), sourceDate ? `Source published ${sourceDate.label}` : ''].filter(Boolean).join(' · ');
    const value = edge.kind === 'founded'
      ? `${named.get(edge.from).name} founded ${named.get(edge.to).name}`
      : label;
    const relation = role ? 'Reported role' : edge.kind === 'founded' ? 'Founding relationship' : 'Relationship';
    const claim = evidence.add({ label: `${relation} · ${other.name}`, value, fields: [[kindName(other.kind), other.name], ...dates], sources: [citation(edge.source)] });
    return connectionRow({ other, label, meta, evidence: evidence.action(claim, 'Evidence'), personAction });
  }

  const overview = isStartup ? `<section class="entity-section" id="entity-company">${heading('Company overview')}
    <p class="entity-section-intro">${esc(summary || 'A company description has not been recorded.')}${evidence.action(summaryProof)}</p>
    ${recordedFacts.length ? `<div class="entity-subsection"><h3>Company facts</h3><dl class="entity-facts">${recordedFacts.map(fact => `<div><dt>${esc(fact.label)}</dt><dd><span>${esc(fact.value)}</span><span class="entity-fact-source">${evidence.action(fact.proof) || '<span>Source not recorded</span>'}</span></dd></div>`).join('')}</dl></div>` : empty('Additional company facts have not been recorded.')}</section>` : '';
  const employmentSection = `<div class="entity-subsection"><h3>Employment roles</h3>${employment.length ? `<div class="entity-connections">${employment.map(edge => renderConnection(edge, { personAction: isStartup, role: true })).join('')}</div>` : empty('Employment roles and dates are unavailable in the published research.')}</div>`;
  const people = isStartup ? `<section class="entity-section" id="entity-founders">${heading('People')}<div class="entity-subsection"><h3>Founders</h3>${founders.length ? `<div class="entity-connections">${founders.map(edge => renderConnection(edge, { personAction: true })).join('')}</div>` : empty('Founding relationships have not been researched yet.')}</div>${employmentSection}${renderSharedFounders(store.graph, entity, founders, named, evidence, citation)}</section>`
    : employment.length ? `<section class="entity-section" id="entity-employment">${employmentSection}</section>` : '';
  const funding = isStartup ? companyTimeline(rounds, articles, named, evidence, citation) : '';
  const relationships = `<section class="entity-section" id="entity-connections">${heading('Relationships')}${otherEdges.length ? `<div class="entity-subsection"><h3>Related records</h3><div class="entity-connections">${otherEdges.map(edge => renderConnection(edge)).join('')}</div></div>` : empty('No further relationships are recorded in the published research.')}<a class="atlas-button" data-atlas-profile-graph="${esc(entity.id)}" href="${shareProfile}">${icon('graph')}Explore relationships</a></section>`;
  const references = `<section class="entity-section" id="entity-sources"><div class="entity-section-heading">${renderEvidenceHeading()}</div>${evidence.index()}</section>`;
  const sidebar = isStartup
    ? `<section><h2>Research coverage</h2><dl class="entity-coverage-list"><div><dt>Founders</dt><dd><a href="#entity-founders">${founders.length ? esc(count(founders.length, 'founder') + ' recorded') : 'Research unavailable'}</a></dd></div><div><dt>Funding</dt><dd><a href="#entity-funding">${rounds.length ? esc(count(rounds.length, 'event') + ' recorded') : 'History unavailable'}</a></dd></div><div><dt>Relationships</dt><dd><a href="#entity-connections">${otherEdges.length ? esc(count(otherEdges.length, 'related record')) : 'Coverage unavailable'}</a></dd></div></dl></section>`
    : `<section><h2>Research coverage</h2><p>${esc(count(edges.length, 'recorded relationship'))}.</p></section>`;
  const sourceRail = summaryProof !== null || imageProof !== null
    ? `<section><h2>Profile evidence</h2><div class="entity-rail-evidence">${summaryProof !== null ? `<div><span>Profile description</span>${evidence.action(summaryProof, 'Profile source')}</div>` : ''}${imageProof !== null ? `<div><span>Profile image</span>${evidence.action(imageProof, 'Image source')}</div>` : ''}</div><a class="profile-jump-link" href="#entity-sources">Browse all sources ${icon('arrow')}</a></section>` : '';

  root.innerHTML = `<div class="profile-return"><a class="profile-back" data-atlas-back href="./#directory">Open directory</a></div>
    <header class="entity-hero"><div class="entity-hero-identity">${mark(entity)}<div class="entity-hero-copy"><p class="profile-kicker">${esc(isStartup ? 'Company' : kindName(entity.kind))}</p><h1>${esc(entity.name)}</h1><p>${esc(summary || 'Explore the connected records and evidence below.')}</p>${heroMetadata ? `<div class="entity-hero-meta">${heroMetadata}</div>` : ''}</div></div>
    <div class="entity-actions">${website}${isStartup ? `<button type="button" class="atlas-button" data-atlas-save-company="${esc(entity.id)}" data-company-name="${esc(entity.name)}">Save</button><button type="button" class="atlas-button" data-atlas-compare="${esc(entity.id)}" data-company-name="${esc(entity.name)}">Compare</button>` : ''}<a class="atlas-button atlas-button-primary" data-atlas-profile-graph="${esc(entity.id)}" href="${shareProfile}">${icon('graph')}Explore graph</a></div>${socials ? `<div class="entity-external-links">${socials}</div>` : ''}</header>
    <div class="profile-sticky"><span class="profile-compact-identity" aria-hidden="true">${mark(entity)}<span>${esc(entity.name)}</span></span><nav class="atlas-section-nav" aria-label="Profile sections">${sectionLinks.map(([id, label]) => `<a href="#${id}">${label}</a>`).join('')}</nav></div>
    ${store.mode === 'fallback' ? '<p class="profile-notice" role="status">Showing the published backup while the database is unavailable.</p>' : ''}
    <div class="entity-layout"><div class="entity-dossier">${programmeDetails(offer, programmeUnavailable)}${overview}${people}${funding}${relationships}${references}</div>
    <aside class="entity-aside" aria-label="Research at a glance">${sidebar}${sourceRail}${isStartup ? `<section data-atlas-notes="${esc(entity.id)}" aria-label="Private notes"></section>` : ''}</aside></div>
    ${evidence.dialog()}`;
  evidence.install(root);
  root.querySelectorAll('.entity-mark img').forEach(img => {
    function fallback() {
      img.hidden = true;
      img.nextElementSibling.hidden = false;
    }
    if (img.complete && !img.naturalWidth) fallback();
    else img.addEventListener('error', fallback, { once: true });
  });
  if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
  document.title = entity.name + ' — Startup Atlas';
}

try { await renderProfile(); } catch {
  root.innerHTML = '<div class="profile-return"><a class="profile-back" data-atlas-back href="./#directory">Open directory</a></div><div class="atlas-empty"><h1>Profile unavailable</h1><p>This profile could not be found or loaded.</p><a class="atlas-button" href="">Retry</a> <a class="atlas-button" href="./graph.html">Open knowledge graph</a></div>';
}
root.setAttribute('aria-busy', 'false');
