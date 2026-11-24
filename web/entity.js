import { escapeHtml as esc, sourceUrl } from './logic.js';
import { logoClassFor } from './logos.js';
import { graphArtwork } from './graph-artwork.js';
import { openGraph } from './graph-store.js';
import { entityDetails, entityHref, fundingTimelineArticles, kindName } from './graph-model.js';
import { icon, renderEvidenceHeading } from './atlas-ui.js';
import { companyLocationFacts, countryName, indexCompanies } from './atlas-exploration.js';
import { createProfileEvidence, profileSource, profileTime, recordedProfileDate } from './profile-evidence.js';

const root = document.getElementById('entity-profile');
const identity = new URLSearchParams(location.search).get('id') || '';
const initials = name => name.trim().split(/\s+/).slice(0, 2).map(part => part[0] || '').join('').toUpperCase();
const mark = (entity, hero = false) => {
  const { url: image } = graphArtwork(entity);
  const classes = ['entity-mark', entity.kind === 'person' ? 'entity-mark-person' : '', logoClassFor(entity.name),
    hero && entity.id === 'startup:canva' && image?.includes('_Canva.png') ? 'entity-mark-padded-wordmark' : ''].filter(Boolean).join(' ');
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
  return `<article class="${rowClass}">${mark(other)}<div class="entity-connection-copy"><a data-atlas-profile-link href="${href}"${personAction ? ` aria-label="Open person ${esc(other.name)}"` : ''}>${esc(other.name)}${personAction ? `<span class="entity-person-action" aria-hidden="true">Open person ${icon('arrow')}</span>` : ` ${icon('arrow')}`}</a><span>${esc(label)}${meta ? ` · ${esc(meta)}` : ''}</span></div><div class="entity-connection-source">${evidence}</div></article>`;
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

function sharedFounderRecords(graph, entity, founders, named, evidence, citation) {
  const byCompany = new Map();
  const people = new Set(founders.map(edge => edge.from));
  for (const edge of graph.edges) {
    if (edge.kind !== 'founded' || edge.to === entity.id || !people.has(edge.from) || named.get(edge.to)?.kind !== 'startup') continue;
    const partner = byCompany.get(edge.to) || [];
    partner.push(edge);
    byCompany.set(edge.to, partner);
  }
  return [...byCompany].map(([id, edges]) => {
    const other = named.get(id);
    const names = [...new Set(edges.map(edge => named.get(edge.from).name))];
    const label = `Shared ${names.length === 1 ? 'founder' : 'founders'}: ${new Intl.ListFormat('en-AU').format(names)}`;
    const sources = [...new Set(edges.map(edge => edge.source))].map(url => citation(url));
    const claim = evidence.add({ label: `Shared founders with ${other.name}`, value: label, sources });
    return { other, label, evidence: evidence.action(claim), rowClass: 'entity-shared-company' };
  });
}

function founderPreview(people) {
  const founder = person => `<li><a class="entity-founder-preview-link" data-atlas-profile-link href="${esc(entityHref(person))}" aria-label="Open person ${esc(person.name)}">${mark(person)}<span><strong>${esc(person.name)}</strong><small>Founder</small></span>${icon('chevron-right')}</a></li>`;
  return `<section class="entity-overview-block"><div class="entity-overview-block-head"><h3>Founders</h3><a class="profile-jump-link" href="#entity-founders">View people ${icon('arrow')}</a></div>${people.length ? `<ul class="entity-founder-preview">${people.slice(0, 3).map(founder).join('')}</ul>` : empty('Founding relationships have not been researched yet.')}</section>`;
}

function foundingDiagram(entity, founders, graphHref) {
  if (!founders.length) return '';
  return `<aside class="entity-people-rail" aria-label="Relationship explorer"><h3>Relationship explorer</h3><div class="entity-founder-network">
    <h4>Founding relationships</h4><div class="entity-network-map">
      <div class="entity-network-people">${founders.slice(0, 3).map(person => `<a data-atlas-profile-link href="${esc(entityHref(person))}">${mark(person)}<strong>${esc(person.name)}</strong></a>`).join('')}</div>
      <div class="entity-network-predicate"><span>Founded</span></div>
      <div class="entity-network-company">${mark(entity)}<strong>${esc(entity.name)}</strong></div>
    </div>${founders.length > 3 ? `<p>Showing 3 of ${founders.length} recorded founders.</p>` : ''}
    <a class="atlas-button atlas-button-primary" data-atlas-profile-graph="${esc(entity.id)}" href="${graphHref}">Open full graph ${icon('arrow')}</a>
  </div></aside>`;
}

function programmeDetails(offer, unavailable, evidence, citation) {
  if (!offer && !unavailable) return '';
  if (unavailable) return `<section class="entity-section" id="entity-programme">${heading('Programme details')}<p class="profile-notice" role="status">Programme details could not be loaded. <a href="">Retry</a></p></section>`;
  const checked = recordedProfileDate(offer.checked);
  const programmeSource = sourceUrl(offer.url);
  const primary = citation(programmeSource, { checked_at: checked?.value });
  const fields = new Map([
    ['Status', offer.status], ['Eligibility', offer.eligibility], ['Value', offer.value], ['Conditions', offer.limits],
    ['Geography', Array.isArray(offer.scope) ? offer.scope.join(', ') : '']
  ].filter(([, value]) => value));
  for (const [label, value] of Object.entries(offer.facts || {})) {
    if (typeof value === 'string' && value && !fields.has(label)) fields.set(label, value);
  }
  const extras = Array.isArray(offer.extra) ? offer.extra : [];
  const documents = [...new Set(extras.map(sourceUrl).filter(url => url && url !== programmeSource))];
  for (const url of documents) evidence.add({ label: 'Supplementary programme document', value: offer.name, sources: [citation(url)] });
  const rows = [...fields].map(([label, value]) => {
    const claim = evidence.add({ label: `Programme ${label.toLowerCase()}`, value, sources: [primary] });
    const proof = evidence.action(claim, 'Sources', 'compact');
    return `<div${value.length > 90 ? ' class="entity-programme-long"' : ''}><dt>${esc(label)}</dt><dd><span>${esc(value)}</span>${proof ? `<span class="entity-fact-source">${proof}</span>` : ''}</dd></div>`;
  });
  return `<section class="entity-section" id="entity-programme">${heading('Programme details')}
    <div class="entity-programme-source">${checked ? `<span>Research checked ${profileTime(checked)}</span>` : ''}${profileSource(programmeSource, 'Programme source')}${documents.length ? '<a href="#entity-sources">Supporting documents</a>' : ''}</div>
    <dl class="entity-facts entity-programme-facts">${rows.join('')}</dl></section>`;
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

function recordRound(round, evidence, citation) {
  const { date, label: dateLabel } = fundingDate(round);
  const title = round.stage || 'Funding event';
  const amount = money(round.amount, round.currency, round.amount_text);
  const fields = [
    ['Event type', title],
    ['Event date', recordedProfileDate(round.event_on)?.label || 'Not recorded'],
    ['Announcement date', recordedProfileDate(round.announced_on)?.label || 'Not recorded'],
    ['Currency', round.currency || 'Not specified']
  ];
  const claim = evidence.add({ label: `${title} · reported amount`, value: amount, fields, sources: [citation(round.source)], note: round.note });
  return { round, title, date, dateLabel, claim, amount, fields };
}

function roundRow({ round, title, date, dateLabel, amount, claim, fields }, named, evidence, citation) {
  const participants = fundingParticipants(round, named, evidence, citation);
  return `<li><details class="entity-round" id="entity-round-${esc(round.id)}"><summary><span class="entity-round-event"><strong>${esc(title)}</strong><span>${date ? `${esc(dateLabel)} · ${profileTime(date)}` : 'Event and announcement dates unrecorded'}</span></span><strong class="entity-round-amount">${esc(amount)}</strong>${icon('chevron-down')}</summary><div class="entity-round-detail"><dl class="entity-round-facts">${fields.slice(1).map(([label, value]) => `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join('')}${round.valuation != null ? `<div><dt>Historical valuation</dt><dd>${esc(money(round.valuation, round.valuation_currency))}</dd></div>` : ''}</dl>${round.note ? `<p>${esc(round.note)}</p>` : ''}<div class="entity-round-participants"><h3>Participants</h3>${participants}</div>${evidence.action(claim, 'Evidence')}</div></details></li>`;
}

function articleRow({ article, title, date }, evidence, citation) {
  const category = article.kind || 'Article';
  const label = category[0].toUpperCase() + category.slice(1);
  const claim = evidence.add({ label: title, value: label, sources: [citation(article.url)] });
  return `<li><article class="entity-timeline-entry"><div class="entity-round-event"><strong>${esc(title)}</strong><span>${esc(label)} · ${date ? `Published ${profileTime(date)}` : 'Publication date unrecorded'}</span></div>${evidence.action(claim, 'Evidence')}</article></li>`;
}

function companyTimeline(rounds, articles, named, evidence, citation) {
  const entries = [...rounds];
  for (const article of fundingTimelineArticles(articles, rounds.map(entry => entry.round))) {
    entries.push({ date: recordedProfileDate(article.published_on), title: article.title, article });
  }
  const dated = entries.filter(entry => entry.date).sort((a, b) => a.date.value.localeCompare(b.date.value));
  const undated = entries.filter(entry => !entry.date);
  const render = entry => entry.round ? roundRow(entry, named, evidence, citation) : articleRow(entry, evidence, citation);
  const coverage = rounds.length
    ? '<p class="entity-section-intro">Historical announcements and recorded financing events. Amounts retain their recorded currencies. A lifetime fundraising total is unavailable.</p>'
    : empty('The published research has no recorded financing events for this company.');
  return `<section class="entity-section" id="entity-funding">${heading('Funding history')}${coverage}
    ${dated.length ? `<ol class="entity-timeline">${dated.map(render).join('')}</ol>` : ''}
    ${undated.length ? `<h3 class="entity-undated-heading">Undated records</h3><ul class="entity-timeline entity-timeline-undated">${undated.map(render).join('')}</ul>` : ''}</section>`;
}

function fundingPreview(entry) {
  if (!entry) return '';
  const noCurrency = / \(currency unspecified\)$/i;
  const shownAmount = entry.amount.replace(noCurrency, '');
  const context = noCurrency.test(entry.amount) ? 'Currency unspecified in source' : '';
  const amountStyle = shownAmount.length > 28 ? ' entity-funding-sample-description' : '';
  return `<section class="entity-overview-block entity-overview-funding"><h3>Funding snapshot</h3>
    <p>${icon('source')}Recorded financing · ${esc(entry.dateLabel.toLowerCase())}</p>
    <div class="entity-funding-sample"><strong>${profileTime(entry.date)}</strong><span>${esc(entry.title)}</span><strong class="entity-funding-sample-amount${amountStyle}">${esc(shownAmount)}</strong>${context ? `<small>${esc(context)}</small>` : ''}<a class="profile-jump-link" href="#entity-funding" data-reveal-funding="entity-round-${esc(entry.round.id)}">Open funding ${icon('arrow')}</a></div>
  </section>`;
}

function placeOverviewFacts() {
  const facts = root.querySelector?.('.entity-overview-facts');
  const slot = root.querySelector?.('.entity-mobile-facts');
  if (!facts || !slot) return;
  const desktop = facts.parentElement;
  const more = facts.querySelector('.entity-more-facts');
  const moreDesktop = more?.parentElement;
  const moreMobile = root.querySelector('.entity-mobile-facts-extra');
  const narrow = matchMedia('(max-width: 960px)');
  function position() {
    const target = narrow.matches ? slot : desktop;
    if (facts.parentElement === target) return;
    const active = document.activeElement;
    const restore = facts.contains(active) || more?.contains(active);
    target.prepend(facts);
    if (more && moreMobile) (narrow.matches ? moreMobile : moreDesktop).append(more);
    if (restore) active.focus({ preventScroll: true });
  }
  position();
  narrow.addEventListener('change', position);
}

function measureProfileNavigation() {
  const nav = root.querySelector?.(':is(.entity-company-sticky, .entity-dossier-sticky) .atlas-section-nav');
  if (!nav) return;
  const sync = () => root.style.setProperty('--profile-nav-height', `${nav.offsetHeight}px`);
  sync();
  if (typeof ResizeObserver === 'function') new ResizeObserver(sync).observe(nav);
}

async function renderProfile() {
  const store = await openGraph();
  const { entity, edges, rounds, articles } = entityDetails(store.graph, identity);
  const isStartup = entity.kind === 'startup';
  const focusedDossier = entity.kind === 'person' || entity.kind === 'programme';
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

  const evidence = createProfileEvidence(entity.name, { keepSourceVisible: focusedDossier });
  const articlesBySource = new Map(store.graph.articles.map(item => [sourceUrl(item.url), item]));
  const citation = (url, extra = {}) => {
    const article = articlesBySource.get(sourceUrl(url));
    return { url, title: article?.title, published_on: article?.published_on, ...extra };
  };
  const summary = entity.summary || '';
  const summaryProof = evidence.add({ label: !summary && focusedDossier ? 'Profile identity' : 'Profile description', value: summary || entity.name, sources: [citation(entity.source)] });
  evidence.add({ label: 'Profile image', value: entity.name, sources: [citation(entity.logo_source)] });
  const facts = (Array.isArray(entity.profile_facts) ? entity.profile_facts : []).filter(fact => fact.label && fact.value);
  const foundingYear = Number.isInteger(entity.founded_year) && entity.founded_year > 0 ? String(entity.founded_year) : '';
  if (foundingYear && !facts.some(fact => /^(?:founding year|founded)$/i.test(fact.label))) facts.unshift({ label: 'Founding year', value: foundingYear, source: entity.source });
  const recordedFacts = facts.map(fact => ({ ...fact, proof: evidence.add({
    label: fact.label, value: fact.value, sources: [citation(fact.source, { reviewed_at: fact.reviewed_at })]
  }) }));
  const places = companyLocationFacts(recordedFacts);
  const place = places.length === 1 ? places[0] : null;
  const dimensions = isStartup ? indexCompanies({ entities: [entity], funding_rounds: [] }).get(entity.id) : null;
  const websiteUrl = sourceUrl(entity.website);
  const website = websiteUrl ? `<a href="${esc(websiteUrl)}" target="_blank" rel="noopener noreferrer" aria-label="Website for ${esc(entity.name)}">${icon('external')}${esc(new URL(websiteUrl).hostname.replace(/^www\./, ''))}</a>` : '';
  const datedPlace = place?.value.match(/^(.+?) \(reported in ((?:FY)?\d{4})\)$/i);
  const placeLabel = datedPlace ? `${esc(datedPlace[1])} <small>${esc(datedPlace[2])}</small>` : esc(place?.value || '');
  const heroMetadata = [place ? `<span aria-label="${esc(place.value)}">${icon('location')}${placeLabel}</span>` : '', website].filter(Boolean).join('');
  const returnContext = [dimensions?.country ? countryName(dimensions.country) : '', dimensions?.sector].filter(Boolean).join(' / ');
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
    const meta = [!role && !personAction ? kindName(other.kind) : '', edgeDateText(edge, role), sourceDate ? `Source published ${sourceDate.label}` : ''].filter(Boolean).join(' · ');
    const value = edge.kind === 'founded'
      ? `${named.get(edge.from).name} founded ${named.get(edge.to).name}`
      : label;
    const relation = role ? 'Reported role' : edge.kind === 'founded' ? 'Founding relationship' : 'Relationship';
    const claim = evidence.add({ label: `${relation} · ${other.name}`, value, fields: [[kindName(other.kind), other.name], ...dates], sources: [citation(edge.source)] });
    return connectionRow({ other, label, meta, evidence: evidence.action(claim, 'Evidence'), personAction });
  }

  const founderPeople = [...new Map(founders.map(edge => [edge.from, named.get(edge.from)])).values()];
  const sharedCompanies = sharedFounderRecords(store.graph, entity, founders, named, evidence, citation);
  const sharedCompany = sharedCompanies[0];
  const recordedRounds = rounds.map(round => recordRound(round, evidence, citation));
  const historicSample = recordedRounds.filter(entry => entry.date && entry.claim !== null && (entry.round.amount != null || entry.round.amount_text))
    .sort((a, b) => a.date.value.localeCompare(b.date.value))[0];
  const graphAction = (className = '') => `<a class="atlas-button atlas-button-primary${className ? ` ${className}` : ''}" data-atlas-profile-graph="${esc(entity.id)}" href="${shareProfile}">${icon('graph')}Explore graph</a>`;
  const companyActions = isStartup ? `<button type="button" class="atlas-button" data-atlas-save-company="${esc(entity.id)}" data-company-name="${esc(entity.name)}">${icon('plus')}<span data-atlas-action-label>Save</span></button><button type="button" class="atlas-button" data-atlas-compare="${esc(entity.id)}" data-company-name="${esc(entity.name)}">${icon('copy')}<span data-atlas-action-label>Compare</span></button>` : '';
  const factMarks = { headquarters: 'location', 'co-headquarters': 'location', 'business-base': 'location', 'product-launch': 'calendar', 'founding-year-source': 'calendar' };
  const keyFacts = [...new Set([
    recordedFacts.find(fact => /^(?:product launched|founding year|founded)$/i.test(fact.label)), place, ...recordedFacts,
  ].filter(Boolean))].slice(0, 2);
  const otherFacts = recordedFacts.filter(fact => !keyFacts.includes(fact));
  const factRow = fact => `<div${fact.value.length > 72 ? ' class="entity-fact-long"' : ''}><dt>${icon(factMarks[fact.key] || 'source')} <span>${esc(fact.label)}</span></dt><dd><span>${esc(fact.value)}</span><span class="entity-fact-source">${evidence.action(fact.proof, 'Sources', 'compact') || '<span>Source not recorded</span>'}</span></dd></div>`;
  const overviewFacts = `<section class="entity-overview-facts" aria-label="Company facts"><h3>Company facts</h3>
    ${keyFacts.length ? `<dl class="entity-facts">${keyFacts.map(factRow).join('')}</dl>` : empty('Additional company facts have not been recorded.')}
    ${website ? `<dl class="entity-facts"><div class="entity-fact-website"><dt>${icon('link')} Website</dt><dd>${website}</dd></div></dl>` : ''}
    ${otherFacts.length ? `<div class="entity-facts-extra"><details class="entity-more-facts"><summary>More company facts ${icon('chevron-down')}</summary><dl class="entity-facts">${otherFacts.map(factRow).join('')}</dl></details></div>` : ''}</section>`;
  const previewSources = evidence.preview([summaryProof, place?.proof, historicSample?.claim, ...recordedFacts.map(fact => fact.proof)].filter(id => id != null).slice(0, 3));
  const overview = isStartup ? `<section class="entity-section entity-overview" id="entity-company">
    <div class="entity-overview-main">${heading('Company overview')}
      <div class="entity-overview-summary"><p>${esc(summary || 'A company description has not been recorded.')}</p>${evidence.action(summaryProof, 'Sources', 'compact')}</div>
      <div class="entity-mobile-facts"></div>
      ${founderPreview(founderPeople)}
      ${graphAction('entity-overview-mobile-graph')}
      <div class="entity-mobile-facts-extra"></div>
      ${fundingPreview(historicSample)}
      ${sharedCompany ? `<section class="entity-overview-block"><h3>Connected through founders</h3><div class="entity-overview-related">${mark(sharedCompany.other)}<strong>${esc(sharedCompany.other.name)}</strong><p>${esc(sharedCompany.label)}</p><a class="profile-jump-link" data-atlas-profile-link href="${esc(entityHref(sharedCompany.other))}">Open company ${icon('arrow')}</a></div></section>` : ''}
    </div>
    <aside class="entity-aside entity-overview-rail" aria-label="Company facts, sources and personal notes">${overviewFacts}
      <section><div class="entity-overview-block-head"><h3>Sources</h3><a class="profile-jump-link entity-all-sources" href="#entity-sources">View all sources ${icon('arrow')}</a></div>${previewSources || empty('Source references are unavailable for this profile.')}</section>
      <section data-atlas-notes="${esc(entity.id)}" aria-label="Private notes"></section>
    </aside>
  </section>` : '';
  const employmentRows = employment.length ? `<div class="entity-connections">${employment.map(edge => renderConnection(edge, { personAction: isStartup, role: true })).join('')}</div>` : empty('Employment roles and dates are unavailable in the published research.');
  const employmentSection = `<div class="entity-subsection"><h3>Employment roles</h3>${employmentRows}</div>`;
  const people = isStartup ? `<section class="entity-section entity-people" id="entity-founders">${heading('People & connections')}<div class="entity-people-layout"><div><div class="entity-subsection"><h3>Founders</h3>${founders.length ? `<div class="entity-connections entity-founder-records">${founders.map(edge => renderConnection(edge, { personAction: true })).join('')}</div>` : empty('Founding relationships have not been researched yet.')}</div>${employmentSection}${sharedCompanies.length ? `<div class="entity-subsection"><h3>Shared company history</h3><div class="entity-connections">${sharedCompanies.map(connectionRow).join('')}</div></div>` : ''}</div>${foundingDiagram(entity, founderPeople, shareProfile)}</div></section>`
    : employment.length ? `<section class="entity-section" id="entity-employment">${heading('Employment roles')}${employmentRows}</section>` : '';
  const funding = isStartup ? companyTimeline(recordedRounds, articles, named, evidence, citation) : '';
  const relationships = `<section class="entity-section" id="entity-connections">${heading('Relationships')}${otherEdges.length ? `<div class="entity-subsection">${focusedDossier ? '' : '<h3>Related records</h3>'}<div class="entity-connections">${otherEdges.map(edge => renderConnection(edge)).join('')}</div></div>` : empty('No further relationships are recorded in the published research.')}${focusedDossier ? '' : `<a class="atlas-button" data-atlas-profile-graph="${esc(entity.id)}" href="${shareProfile}">${icon('graph')}Explore relationships</a>`}</section>`;
  const programme = programmeDetails(offer, programmeUnavailable, evidence, citation);
  const references = `<section class="entity-section${focusedDossier ? ' entity-dossier-sources' : ''}" id="entity-sources"><div class="entity-section-heading">${renderEvidenceHeading()}</div>${focusedDossier ? `<p class="entity-evidence-coverage">${esc(count(edges.length, 'recorded relationship'))}</p>` : ''}${evidence.index()}</section>`;
  const compactBar = isStartup ? `<div class="entity-compact-bar"><a class="profile-back atlas-button" data-atlas-back href="./list.html">Open list</a>
    <div class="entity-compact-brand">${mark(entity, true)}<div><strong>${esc(entity.name)}</strong>${website}</div></div>
    <div class="entity-actions">${companyActions}${graphAction()}</div></div>` : '';
  const type = esc(isStartup ? 'Company' : kindName(entity.kind));
  const title = `<h1>${esc(entity.name)}</h1>`;
  root.classList?.toggle('entity-evidence-dossier', focusedDossier);
  root.innerHTML = `<div class="profile-return"><a class="profile-back" data-atlas-back href="./list.html">Open list</a>${returnContext ? `<span class="profile-return-context">${esc(returnContext)}</span>` : ''}</div>
    <header class="entity-hero${isStartup ? ' entity-company-hero' : ''}"><div class="entity-hero-identity">${mark(entity, isStartup)}<div class="entity-hero-copy">${focusedDossier ? `${title}<p class="entity-dossier-type">${type}</p>` : `<p class="profile-kicker">${type}</p>${title}`}${summary || !focusedDossier ? `<p>${esc(summary || 'Explore the connected records and evidence below.')}</p>` : ''}${heroMetadata ? `<div class="entity-hero-meta">${heroMetadata}</div>` : ''}</div></div>
    <div class="entity-actions">${companyActions}${graphAction('entity-hero-graph')}</div>${socials ? `<div class="entity-external-links">${socials}</div>` : ''}</header>
    <div class="profile-sticky${isStartup ? ' entity-company-sticky' : focusedDossier ? ' entity-dossier-sticky' : ''}">${compactBar}<span class="profile-compact-identity" aria-hidden="true">${mark(entity)}<span>${esc(entity.name)}</span></span><nav class="atlas-section-nav" aria-label="Profile sections">${sectionLinks.map(([id, label]) => `<a href="#${id}">${label}</a>`).join('')}</nav></div>
    ${store.mode === 'fallback' ? '<p class="profile-notice" role="status">Showing the published backup while the database is unavailable.</p>' : ''}
    <div class="entity-layout${isStartup ? ' entity-company-layout' : ''}"><div class="entity-dossier">${programme}${overview}${people}${funding}${relationships}${focusedDossier ? '' : references}</div>
    ${focusedDossier ? references : isStartup ? '' : `<aside class="entity-aside" aria-label="Research at a glance"><section><h2>Research coverage</h2><p>${esc(count(edges.length, 'recorded relationship'))}.</p></section></aside>`}</div>
    ${evidence.dialog()}`;
  placeOverviewFacts();
  measureProfileNavigation();
  evidence.install(root);
  root.querySelectorAll('[data-reveal-funding]').forEach(link => link.addEventListener('click', () => {
    const round = document.getElementById(link.dataset.revealFunding);
    if (round) round.open = true;
  }));
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
  const pageDescription = (entity.summary || '').trim() || 'Explore the people, startups and programmes connected across Startup Atlas.';
  document.querySelector('meta[name="description"]')?.setAttribute('content', pageDescription);
  for (const selector of ['meta[property="og:title"]', 'meta[name="twitter:title"]']) document.querySelector(selector)?.setAttribute('content', document.title);
  for (const selector of ['meta[property="og:description"]', 'meta[name="twitter:description"]']) document.querySelector(selector)?.setAttribute('content', pageDescription);
}

try { await renderProfile(); } catch {
  root.innerHTML = '<div class="profile-return"><a class="profile-back" data-atlas-back href="./list.html">Open list</a></div><div class="atlas-empty"><h1>Profile unavailable</h1><p>This profile could not be found or loaded.</p><a class="atlas-button" href="">Retry</a> <a class="atlas-button" href="./graph.html">Open knowledge graph</a></div>';
}
root.setAttribute('aria-busy', 'false');
