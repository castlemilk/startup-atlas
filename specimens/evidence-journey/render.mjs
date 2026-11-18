import { escapeHtml as esc, sourceUrl } from '../../web/logic.js';
import { renderIcon } from '../../web/atlas-icons.js';
import { claimValue } from './model.mjs';

const button = (action, label, extra = '') => `<button type="button" class="atlas-button" data-ej-action="${action}" ${extra}>${label}</button>`;
const code = value => `<code>${esc(value ?? 'Not supplied')}</code>`;

export function sourceLink(value, label = 'Open source') {
  if (!sourceUrl(value)) return '<span>Source not recorded</span>';
  const parsed = new URL(value);
  if (parsed.username || parsed.password) return '<span>Source URL needs review</span>';
  return `<a href="${esc(value)}" target="_blank" rel="noopener noreferrer">${esc(label)} ${renderIcon('external')}</a>`;
}

function freshness(claim) {
  const item = claim.freshness;
  return `<p class="ej-condition"><strong>${item?.status === 'stale' ? 'Needs freshness review' : 'Freshness not established'}</strong> ${esc(item?.reason || 'No freshness decision was supplied for this claim.')}${item?.asOf ? ` Evaluated ${esc(item.asOf)}.` : ''}${item?.policy ? ` Policy: ${esc(item.policy)}.` : ''}</p>`;
}

export function renderClaim(claim) {
  const alternatives = claim.alternatives || [];
  return `<div class="ej-claim-value">${esc(claimValue(claim))}</div>
    ${claim.knowledge === 'conflict' ? `<p class="ej-condition" data-tone="warning"><strong>Conflicting sources</strong> No winner has been selected.</p><ul class="ej-alternatives">${alternatives.map(item => `<li><strong>${esc(item.value)}</strong><br>${sourceLink(item.source, 'Source for this observation')}<p>${esc(item.source || '')}</p><p>Claim reviewed: ${esc(item.reviewed_at || 'Not recorded')}</p></li>`).join('')}</ul>` : ''}
    <dl class="ej-facts"><div><dt>Claim source</dt><dd>${sourceLink(claim.source)}<span class="ej-url">${esc(claim.source || 'Not recorded')}</span></dd></div><div><dt>Claim reviewed</dt><dd>${claim.reviewed_at ? `<time datetime="${esc(claim.reviewed_at)}">${esc(claim.reviewed_at)}</time>` : 'Review date not recorded'}</dd></div></dl>
    ${freshness(claim)}`;
}

export function renderResults(rows, prefix, selected = null) {
  return rows.map(row => `<article class="ej-result" data-ej-row="${esc(row.id)}" data-selected="${row.id === selected}">
    <span class="ej-initial" aria-hidden="true">${esc(row.name.split(' ').at(-1).slice(0,1))}</span>
    <div><h3><a href="#${prefix}-fallback-${esc(row.id)}" data-ej-open="${esc(row.id)}">${esc(row.name)}</a></h3><p>${esc(row.summary)}</p><span class="ej-meta">Startup · ${esc(row.country)}</span></div>
    <button class="atlas-button ej-inspect" type="button" data-ej-select="${esc(row.id)}" aria-label="Inspect ${esc(row.name)}" aria-pressed="${row.id === selected}" disabled>${renderIcon('search')}Inspect</button>
  </article>`).join('');
}

export function renderPreview(preview) {
  if (!preview) return '<p class="ej-muted">Read the claim and source, then review the proposed correction.</p>';
  const fact = preview.merged.profile_facts?.find(item => item.key === 'deployment-region');
  const previous = preview.previous.profile_facts?.find(item => item.key === 'deployment-region');
  return `<div class="ej-diff"><div><span class="ej-eyebrow">Current source value</span><p>${esc(previous?.value || 'Not recorded')}</p></div><div><span class="ej-eyebrow">Proposed value</span><p>${esc(fact?.value || 'Not recorded')}</p></div></div>
    <p>Source for the proposed value: ${sourceLink(fact?.source)}<span class="ej-url">${esc(fact?.source || '')}</span></p>
    <p>Claim reviewed: ${esc(fact?.reviewed_at || 'Not recorded')}. The other claims keep their own review dates.</p>
    <p><strong>Preview ready; nothing saved.</strong> Structural validation does not verify the source claim.</p>
    <p>Changed paths: ${preview.changedPaths.map(code).join(', ') || 'None'}</p>
    ${preview.warnings.length ? `<ul class="ej-condition">${preview.warnings.map(item => `<li>${esc(item.code)} · ${esc(item.path)} · ${esc(item.action)}</li>`).join('')}</ul>` : '<p class="ej-muted">No structural warnings in this synthetic preview.</p>'}
    <details><summary>Full review context and record diff</summary><dl class="ej-facts"><div><dt>Source revision</dt><dd>${code(preview.revision)}</dd></div><div><dt>Previous record digest</dt><dd>${code(preview.recordRevision)}</dd></div><div><dt>Expected record digest</dt><dd>${code(preview.nextRecordRevision)}</dd></div><div><dt>Intent digest</dt><dd>${code(preview.intentDigest)}</dd></div></dl><h3>Before</h3><pre>${esc(JSON.stringify(preview.previous, null, 2))}</pre><h3>After</h3><pre>${esc(JSON.stringify(preview.merged, null, 2))}</pre></details>`;
}

export function renderReadbacks(session) {
  const proposal = session.proposal;
  const main = session.main;
  const publication = session.publication;
  return `<div class="ej-receipts">
    <section><h3>Proposal outcome</h3><p class="ej-receipt-state">${session.uncertain ? 'Outcome uncertain' : proposal?.status === 'already_present' ? 'Already present; no proposal' : proposal ? `Proposal ${esc(proposal.status)}` : session.recoveryNotFound ? 'No matching proposal observed' : 'Not read'}</p>
      <p>${proposal?.status === 'already_present' ? 'The supplied repository receipt already contains the reviewed values. No proposal was created. Publication needs its own read.' : proposal ? 'The supplied proposal-head record matches the reviewed intent. Main and publication need their own reads.' : session.uncertain ? 'Use read-only recovery. Keep the original intent; do not automatically resubmit.' : 'A preview has not created a proposal.'}</p>
      ${proposal ? `<dl>${proposal.status === 'already_present' ? `<dt>Repository receipt revision</dt><dd>${code(proposal.revision)}</dd>` : `<dt>Head revision</dt><dd>${code(proposal.headRevision)}</dd><dt>Original proposal base</dt><dd>${code(proposal.baseRevision)}</dd>`}<dt>Record digest</dt><dd>${code(proposal.recordRevision)}</dd></dl>` : ''}
      <p class="ej-muted">${proposal ? 'Receipt says published: false.' : 'No publication established.'}</p></section>
    <section><h3>Authoritative main</h3><p class="ej-receipt-state">${main?.status === 'matching' ? 'Reviewed record matches' : main?.status === 'mismatch' ? 'Record differs from review' : main?.status === 'unavailable' ? 'Read unavailable' : 'Not read'}</p>
      <p>${main?.status === 'matching' ? 'The full source record and digest agree with the review target.' : main?.status === 'mismatch' ? 'Keep the reviewed target visible. Reconcile the fresh record before any next edit.' : main?.status === 'unavailable' && main.value ? 'This read failed. Earlier source evidence remains below with its original revision.' : 'This is a separate read of the authoritative source file.'}</p>
      ${main?.value ? `<dl><dt>Main source revision</dt><dd>${code(main.value.revision)}</dd><dt>Record digest</dt><dd>${code(main.value.recordRevision)}</dd></dl><details><summary>Readback source record</summary><pre>${esc(JSON.stringify(main.value.record, null, 2))}</pre></details>` : ''}
      <p class="ej-muted">A source match does not establish publication.</p></section>
    <section><h3>Published snapshot</h3><p class="ej-receipt-state">${({current:'Reported snapshot revisions agree',pending_publication:'Publication pending',context_mismatch:'Main observations disagree',unknown:'Publication state unknown',unavailable:'Read unavailable'})[publication?.status] || 'Not read'}</p>
      <p>${publication?.status === 'context_mismatch' ? 'The projection response observes a different main revision from the independent source read. Do not claim a current publication from these contexts.' : publication?.status === 'current' ? `The reported published and main revisions agree.${publication.comparedMainRevision ? ' The independent source read observes the same main revision.' : ' The independent main context has not been established.'} Claim-level projection acceptance remains a separate gate.` : publication?.status === 'pending_publication' ? 'The published snapshot differs from its reported main revision. Retain its existing source context.' : publication?.status === 'unavailable' && publication.value ? 'This read failed. Earlier projection evidence remains below with its original revisions.' : 'A graph projection is separate from the full source record.'}</p>
      ${publication?.value ? `<dl><dt>Published revision</dt><dd>${code(publication.value.revision)}</dd><dt>Projection observed main</dt><dd>${code(publication.value.mainRevision)}</dd>${publication.comparedMainRevision ? `<dt>Independent source main</dt><dd>${code(publication.comparedMainRevision)}</dd>` : ''}</dl>` : ''}
      <p class="ej-muted">Snapshot age does not refresh claim review dates.</p></section>
  </div>`;
}

export function renderJourney(fixtures, prefix = 'evidence') {
  if (!/^[a-z][a-z0-9-]*$/.test(prefix)) throw new TypeError('Use a unique lowercase ID prefix.');
  const controls = `${prefix}-search`;
  return `<section data-evidence-journey data-ej-prefix="${prefix}" aria-labelledby="${prefix}-title">
    <header class="ej-heading"><div><p class="ej-eyebrow">Atlas Signal · evidence journey</p><h1 id="${prefix}-title" tabindex="-1">Follow a claim through review.</h1><p>Find an entity, inspect its source and compare the result with an authoritative readback.</p></div><div class="ej-scope"><strong>Synthetic specimen</strong><span>3 fictional records · no live writes</span></div></header>
    <p class="ej-note" data-ej-mode>Static evidence is available below. Interactive review needs JavaScript. All records, sources and receipts here are synthetic.</p>
    <nav class="ej-journey-nav" aria-label="Evidence journey"><a href="#${prefix}-results">Search & filter</a><a href="#${prefix}-entity">Entity & claim</a><a href="#${prefix}-review">Review & propose</a><a href="#${prefix}-readback">Readback</a></nav>
    <div class="ej-workspace">
      <section class="ej-directory" aria-labelledby="${prefix}-results"><div class="ej-panel-heading"><h2 id="${prefix}-results" tabindex="-1">Find a record</h2><span class="ej-meta" data-ej-count>3 synthetic records</span></div>
        <form data-ej-search-form novalidate><label for="${controls}">Search synthetic records</label><div class="ej-search-field"><input id="${controls}" type="search" data-ej-query placeholder="Name or description" autocomplete="off" disabled><button type="button" class="atlas-button" data-ej-clear data-atlas-clear-for="${controls}" aria-label="Clear synthetic search" hidden disabled>Clear</button></div><label for="${prefix}-country">Country</label><select id="${prefix}-country" data-ej-country disabled><option value="all">All countries</option><option value="Australia">Australia</option><option value="New Zealand">New Zealand</option></select></form>
        <div data-ej-results>${renderResults(fixtures.rows, prefix)}</div>
        <p data-ej-results-state class="atlas-empty" hidden></p>
        <button type="button" class="atlas-button" data-ej-reset disabled>Clear all filters</button>
      </section>
      <div class="ej-dossier">
        <section class="ej-entity" aria-labelledby="${prefix}-entity"><div class="ej-panel-heading"><div><p class="ej-eyebrow">Selected entity</p><h2 id="${prefix}-entity" data-ej-entity-heading tabindex="-1">Choose a record</h2></div>${button('close', 'Close inspection', 'disabled')}</div><p class="ej-id" data-ej-identity>No entity selected</p><p data-ej-membership class="ej-condition" hidden>Outside current results. This entity remains selected.</p><p data-ej-source-status>Select a record to inspect its evidence.</p><div class="ej-actions">${button('source', 'Read source record', 'disabled')}${button('cancel', 'Cancel pending read', 'disabled')}</div><div data-ej-claims></div></section>
        <section class="ej-review" aria-labelledby="${prefix}-review"><div class="ej-panel-heading"><div><p class="ej-eyebrow">Review the exact change</p><h2 id="${prefix}-review" tabindex="-1">Proposed correction</h2></div><span class="ej-meta">In memory only</span></div><p data-ej-review-reason>The Aster region claim has one synthetic correction available.</p><div class="ej-actions">${button('review', 'Review correction', 'disabled')}${button('simulate', 'Simulate draft proposal', 'disabled')}${button('recover', 'Inspect proposal outcome', 'disabled')}</div><div data-ej-preview>${renderPreview(null)}</div><p class="ej-note">Live proposal submission is unavailable in this specimen. The record owner supplies the authenticated validation and proposal flow.</p></section>
      </div>
    </div>
    <section class="ej-readback" aria-labelledby="${prefix}-readback"><div class="ej-panel-heading"><div><p class="ej-eyebrow">Compare independent contexts</p><h2 id="${prefix}-readback" tabindex="-1">What has actually changed?</h2></div>${button('readback', 'Read authoritative results', 'disabled')}</div><p>Every result below is a supplied synthetic envelope. Readback never merges, publishes or retries a write.</p><div data-ej-readbacks>${renderReadbacks({})}</div></section>
    <section data-ej-error class="ej-error" aria-labelledby="${prefix}-error-title" hidden><h2 id="${prefix}-error-title" tabindex="-1">Read needs attention</h2><p data-ej-error-message></p><p data-ej-error-action></p></section>
    <p class="ej-status" role="status" aria-label="Evidence journey status" aria-live="polite" aria-atomic="true" data-ej-status>Static synthetic evidence ready.</p>
    <details class="ej-scenarios"><summary>Explore synthetic outcomes</summary><label for="${prefix}-scenario">Synthetic outcome</label><select id="${prefix}-scenario" data-ej-scenario disabled><option value="pending">Main matches; publication pending</option><option value="current">Main matches; snapshot current</option><option value="conflict">Record conflict during review</option><option value="stale">Stale source revision</option><option value="uncertain">Uncertain proposal outcome</option><option value="not-found">Recovery finds no proposal</option><option value="mismatch">Main readback mismatch</option><option value="unavailable">Main readback unavailable</option><option value="source-error">Source read unavailable</option><option value="index-error">Published read unavailable</option></select><p>Changing an outcome resets the local demonstration. These choices are test inputs, not application settings or live service status.</p></details>
    <section data-ej-fallback aria-label="Static synthetic dossiers"><h2>Read the complete synthetic dossiers</h2>${fixtures.rows.map(row => `<article id="${prefix}-fallback-${esc(row.id)}"><h3>${esc(row.name)}</h3><p>${esc(row.summary)}</p><p>${code(row.id)}</p>${(fixtures.claims[row.id] || []).map(claim => `<h4>${esc(claim.label)}</h4>${renderClaim(claim)}`).join('') || '<p>No profile claims recorded in this specimen. This is not evidence that the entity has no such facts.</p>'}</article>`).join('')}</section>
  </section>`;
}

export function renderDocument(fixtures) {
  return `<!doctype html><html lang="en-AU" data-evidence-journey-page><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Atlas evidence review · synthetic specimen</title><link rel="stylesheet" href="./design-tokens.css"><link rel="stylesheet" href="./atlas-ui.css"><link rel="stylesheet" href="./atlas-sdk.css"><link rel="stylesheet" href="./journey.css"><link rel="stylesheet" href="./page.css"></head><body><a class="ej-skip" href="#evidence-title">Skip to evidence journey</a><header class="ej-masthead"><span>startupatlas</span><span>Research specimen / source and DOM review</span></header><main>${renderJourney(fixtures)}</main><footer class="ej-footer">Signal identity · synthetic data · native visual acceptance pending</footer><script type="module" src="./entry.js"></script></body></html>`;
}
