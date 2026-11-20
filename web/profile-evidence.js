import { escapeHtml as esc, sourceUrl } from './logic.js';
import { icon } from './atlas-ui.js';

const dateFormat = {
  year: new Intl.DateTimeFormat('en-AU', { year: 'numeric', timeZone: 'UTC' }),
  month: new Intl.DateTimeFormat('en-AU', { year: 'numeric', month: 'short', timeZone: 'UTC' }),
  day: new Intl.DateTimeFormat('en-AU', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' })
};

export function recordedProfileDate(value) {
  if (typeof value !== 'string' || !/^\d{4}(?:-\d{2}(?:-\d{2})?)?$/.test(value) || value.startsWith('0000')) return null;
  const full = value + (value.length === 4 ? '-01-01' : value.length === 7 ? '-01' : '');
  const date = new Date(`${full}T00:00:00Z`);
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== full) return null;
  const precision = value.length === 4 ? 'year' : value.length === 7 ? 'month' : 'day';
  return { value, label: dateFormat[precision].format(date) };
}

export const profileTime = date => date ? `<time datetime="${esc(date.value)}">${esc(date.label)}</time>` : '';

export function profileSource(url, label, className = '') {
  const href = sourceUrl(url);
  return href ? `<a${className ? ` class="${esc(className)}"` : ''} href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>` : '';
}

function citationDates(citation) {
  return [
    ['Published', citation.published_on], ['Checked', citation.checked_at], ['Reviewed', citation.reviewed_at]
  ].map(([label, value]) => {
    const date = recordedProfileDate(value);
    return date ? `<span>${label} ${profileTime(date)}</span>` : '';
  }).join('');
}

function citationLabel(citation) {
  const url = sourceUrl(citation.url);
  return citation.title || citation.publisher || (url && new URL(url).hostname) || 'Recorded citation';
}

function citationMeta(citation) {
  const title = citationLabel(citation);
  const publisher = citation.publisher || (sourceUrl(citation.url) && new URL(citation.url).hostname);
  return `${publisher && publisher !== title ? `<span>${esc(publisher)}</span>` : ''}${citationDates(citation)}`;
}

const panelId = 'profile-claim-evidence';

export function createProfileEvidence(subject) {
  const claims = [];

  function add({ label, value, sources, fields = [], note = '' }) {
    const citations = sources.filter(item => item?.url || item?.title || item?.publisher);
    if (!citations.length) return null;
    return claims.push({ label, value, citations, fields, note }) - 1;
  }

  function action(id, label = 'Sources') {
    const claim = claims[id];
    if (!claim) return '';
    const fallback = claim.citations.find(item => sourceUrl(item.url));
    return `<span class="profile-proof" data-profile-claim="${id}">${profileSource(fallback?.url, label, 'profile-proof-direct') || '<span class="profile-citation-unavailable">Source link unavailable</span>'}</span>`;
  }

  function index() {
    const bySource = new Map();
    for (const claim of claims) {
      for (const citation of claim.citations) {
        const key = sourceUrl(citation.url) || citation.title || citation.url || citation.publisher;
        const entry = bySource.get(key) || { citation, labels: new Set() };
        if (!entry.citation.title && citation.title) entry.citation = { ...entry.citation, ...citation };
        entry.labels.add(claim.label);
        bySource.set(key, entry);
      }
    }
    if (!bySource.size) return '<p class="profile-empty atlas-empty">Source references are unavailable for this record.</p>';
    return `<ul class="profile-source-index">${[...bySource.values()].map(({ citation, labels }) => `<li>${icon('source')}<div><strong>${profileSource(citation.url, citationLabel(citation)) || esc(citationLabel(citation))}</strong><div class="profile-citation-meta">${citationMeta(citation)}</div><p>${[...labels].map(esc).join(' · ')}</p></div></li>`).join('')}</ul>`;
  }

  function dialog() {
    return claims.length ? `<ui-dialog id="${panelId}">
      <ui-dialog-content class="profile-evidence-panel" initial-focus="#profile-evidence-close" hidden>
        <div class="profile-evidence-head">${icon('source')}<ui-dialog-title>Claim evidence</ui-dialog-title><ui-dialog-close><button type="button" class="atlas-button" id="profile-evidence-close" aria-label="Close claim evidence">${icon('close')}</button></ui-dialog-close></div>
        <div class="profile-evidence-scroll"><ui-dialog-description class="profile-evidence-claim"></ui-dialog-description><div data-profile-evidence-body></div></div>
      </ui-dialog-content>
    </ui-dialog>` : '';
  }

  function enhance(scope) {
    if (!globalThis.customElements) return;
    customElements.whenDefined('ui-dialog-trigger').then(() => {
      for (const holder of scope.querySelectorAll('[data-profile-claim]')) {
        const claim = claims[holder.dataset.profileClaim];
        if (!claim || holder.querySelector('ui-dialog-trigger')) continue;
        const trigger = document.createElement('ui-dialog-trigger');
        trigger.setAttribute('for', panelId);
        trigger.payload = claim;
        trigger.innerHTML = `<button class="profile-source-action" type="button" aria-label="Sources for ${esc(claim.label)}">${icon('source')}<span>Sources</span></button>`;
        holder.prepend(trigger);
      }
    });
  }

  function install(scope) {
    const control = scope.querySelector?.(`#${panelId}`);
    if (!control) return;
    const description = control.querySelector('ui-dialog-description');
    const body = control.querySelector('[data-profile-evidence-body]');
    const narrow = matchMedia('(max-width: 640px)');
    const setPresentation = () => control.setAttribute('presentation', narrow.matches ? 'sheet' : 'dialog');
    setPresentation();
    narrow.addEventListener('change', setPresentation);
    control.addEventListener('payloadchange', event => {
      const claim = event.detail.value;
      if (!claim) return;
      description.textContent = claim.label;
      body.innerHTML = `<p class="profile-evidence-value">${esc(claim.value)}</p><dl class="profile-evidence-fields"><div><dt>Profile</dt><dd>${esc(subject)}</dd></div>${claim.fields.map(([label, value]) => `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl>
        ${claim.note ? `<p class="profile-evidence-note">${esc(claim.note)}</p>` : ''}
        <ul class="profile-evidence-citations">${claim.citations.map(citation => `<li><strong>${esc(citationLabel(citation))}</strong><div class="profile-citation-meta">${citationMeta(citation)}</div>${profileSource(citation.url, 'Open original source', 'atlas-button atlas-button-primary') || '<p class="profile-citation-unavailable">Source link unavailable</p>'}</li>`).join('')}</ul>`;
      control.querySelector('.profile-evidence-scroll').scrollTop = 0;
    });
    enhance(scope);
  }

  return { add, action, index, dialog, enhance, install };
}
