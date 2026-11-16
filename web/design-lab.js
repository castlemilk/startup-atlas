import concepts from './design-concepts.js';
import { escapeHtml as esc } from './logic.js';
import { entityBadge } from './atlas-ui.js';

const $ = id => document.getElementById(id);
const byId = new Map(concepts.map(concept => [concept.id, concept]));
const dialog = $('concept-dialog');
let selectedId = null;
let lastOpener = null;
let dialogHistoryEntry = false;
let closingForNavigation = false;
let galleryState = readGalleryState();
let copyAttempt = 0;
let specimenSelected = false;

function readGalleryState() {
  const params = new URLSearchParams(location.search);
  return {query:(params.get('q') || '').slice(0,200), view:byId.has(params.get('view')) ? params.get('view') : 'all'};
}
function syncUrl(mode = 'replace', conceptId = selectedId) {
  const url = new URL(location.href);
  if (galleryState.query) url.searchParams.set('q',galleryState.query); else url.searchParams.delete('q');
  if (galleryState.view !== 'all') url.searchParams.set('view',galleryState.view); else url.searchParams.delete('view');
  if (conceptId) url.searchParams.set('concept',conceptId); else url.searchParams.delete('concept');
  const next = url.pathname + url.search + url.hash;
  if (next !== location.pathname + location.search + location.hash) history[mode === 'push' ? 'pushState' : 'replaceState'](null,'',next);
}
function patternHref(concept) {
  return './design-system.html?pattern=' + encodeURIComponent(concept.pattern) + '#views';
}
function normalized(value) {
  return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase();
}
function watchImages(container) {
  for (const image of container.querySelectorAll('img')) {
    const unavailable = () => image.parentElement.classList.add('lab-image-failed');
    image.addEventListener('error',unavailable,{once:true});
    if (image.complete && !image.naturalWidth) unavailable();
  }
}

function renderHero() {
  const featured = byId.get('graph') || concepts[0];
  const supporting = byId.get('startup') || concepts[1] || featured;
  if (!featured) return;
  $('hero-studies').innerHTML = `<span class="lab-hero-annotation">Follow the connection <span aria-hidden="true">↘</span></span><figure class="lab-hero-figure"><button type="button" data-open-concept="${esc(featured.id)}" aria-label="Open ${esc(featured.title)} concept study"><img src="${esc(featured.thumb || featured.image)}" alt="${esc(featured.alt)}" fetchpriority="high" width="1200" height="800"></button><figcaption><strong>${esc(featured.title)}</strong><span>Study ${esc(featured.number)} · illustrative interface</span></figcaption></figure><div class="lab-hero-note"><img src="${esc(supporting.thumb || supporting.image)}" alt="" width="180" height="140"><div><p>From the network<br>to the company.</p><button type="button" data-open-concept="${esc(supporting.id)}">Open the startup study ↗</button></div></div>`;
  watchImages($('hero-studies'));
}

function renderGallery() {
  $('concept-search').value = galleryState.query;
  $('concept-filter').value = galleryState.view;
  $('clear-concept-search').hidden = !galleryState.query;
  const terms = normalized(galleryState.query).trim().split(/\s+/).filter(Boolean);
  const matches = concepts.filter(concept => (galleryState.view === 'all' || concept.id === galleryState.view) && terms.every(term => normalized([concept.title,concept.question,concept.description,...concept.focus].join(' ')).includes(term)));
  $('concept-count').textContent = `${matches.length} of ${concepts.length} ${concepts.length === 1 ? 'study' : 'studies'}`;
  $('concept-empty').hidden = matches.length > 0;
  $('concept-gallery').hidden = !matches.length;
  $('concept-gallery').innerHTML = matches.map(concept => `<article class="lab-concept-card" data-concept="${esc(concept.id)}"><button class="lab-concept-image-button" type="button" data-open-concept="${esc(concept.id)}" aria-label="Open ${esc(concept.title)} concept study"><img src="${esc(concept.thumb || concept.image)}" alt="${esc(concept.alt)}" width="1200" height="800" loading="lazy"><span class="lab-image-open" aria-hidden="true">↗</span></button><div class="lab-card-heading"><h3><button type="button" data-open-concept="${esc(concept.id)}">${esc(concept.title)}</button></h3><span class="lab-study-number">${esc(concept.number)}</span></div><p class="lab-card-question">${esc(concept.question)}</p><span class="lab-card-caption">Concept study — illustrative interface</span><div class="lab-card-footer"><button class="lab-open-text" type="button" data-open-concept="${esc(concept.id)}">Inspect study <span aria-hidden="true">↗</span></button><a href="${esc(concept.route)}">Working view <span aria-hidden="true">↗</span></a></div></article>`).join('');
  watchImages($('concept-gallery'));
}

function renderBriefs() {
  $('view-brief-list').innerHTML = concepts.map(concept => `<details class="lab-brief"><summary><span class="lab-study-number">${esc(concept.number)}</span><strong>${esc(concept.title)}</strong><span class="lab-brief-question">${esc(concept.question)}</span><span class="lab-brief-toggle" aria-hidden="true">+</span></summary><div class="lab-brief-body"><p>${esc(concept.description)}</p><div><ul>${concept.focus.map(item => `<li>${esc(item)}</li>`).join('')}</ul><div class="lab-brief-actions"><button class="atlas-button" type="button" data-open-concept="${esc(concept.id)}">Inspect the study</button><a class="lab-text-link" href="${esc(patternHref(concept))}">Working pattern <span aria-hidden="true">↗</span></a></div></div></div></details>`).join('');
}

function showConcept(id, opener = null, navigation = false) {
  const concept = byId.get(id);
  if (!concept) return;
  const wasOpen = dialog.open;
  selectedId = id;
  if (!wasOpen) {
    lastOpener = opener || (document.activeElement !== document.body ? document.activeElement : null);
    dialogHistoryEntry = !navigation;
  }
  $('dialog-title').textContent = concept.title;
  $('dialog-position').textContent = `Study ${concept.number} / ${String(concepts.length).padStart(2,'0')}`;
  $('dialog-announcement').textContent = `Study ${Number(concept.number)} of ${concepts.length}: ${concept.title}.`;
  $('dialog-question').textContent = concept.question;
  $('dialog-description').textContent = concept.description;
  $('dialog-focus').innerHTML = concept.focus.map(item => `<li>${esc(item)}</li>`).join('');
  $('dialog-live').href = concept.route;
  $('dialog-pattern').href = patternHref(concept);
  $('dialog-download').href = concept.image;
  $('dialog-download').setAttribute('download',concept.image.split('/').pop());
  $('dialog-prompt-details').hidden = !concept.prompt;
  $('dialog-prompt-details').open = false;
  $('dialog-prompt').textContent = [concept.prompt,concept.revisionPrompt ? 'Image refinement: ' + concept.revisionPrompt : ''].filter(Boolean).join('\n\n');
  const image = $('dialog-image');
  $('dialog-image-status').hidden = false;
  $('dialog-image-status').textContent = 'Loading concept image…';
  image.hidden = false;
  image.alt = concept.alt;
  image.src = concept.image;
  if (image.complete && image.naturalWidth) $('dialog-image-status').hidden = true;
  $('dialog-prev').disabled = concepts.length < 2;
  $('dialog-next').disabled = concepts.length < 2;
  if (!wasOpen) { dialog.showModal(); document.body.classList.add('lab-dialog-open'); }
  dialog.scrollTop = 0;
  if (!navigation) syncUrl(wasOpen ? 'replace' : 'push',id);
}
function restoreOpener() {
  const fallback = selectedId && document.querySelector(`.lab-concept-card[data-concept="${CSS.escape(selectedId)}"] button`);
  const focus = lastOpener?.isConnected ? lastOpener : fallback || $('concept-search');
  focus?.focus({preventScroll:true});
}
function closeConcept(navigation = false) {
  if (!dialog.open) { selectedId = null; return; }
  const useBack = !navigation && dialogHistoryEntry;
  closingForNavigation = true;
  dialog.close();
  document.body.classList.remove('lab-dialog-open');
  restoreOpener();
  closingForNavigation = false;
  selectedId = null;
  dialogHistoryEntry = false;
  if (!navigation) {
    if (useBack) history.back();
    else syncUrl('replace',null);
  }
}
function stepConcept(direction) {
  const index = concepts.findIndex(concept => concept.id === selectedId);
  const next = concepts[(index + direction + concepts.length) % concepts.length];
  if (next) showConcept(next.id);
}
document.addEventListener('click',event => {
  const opener = event.target.closest('[data-open-concept]');
  if (opener) showConcept(opener.dataset.openConcept,opener);
});
$('dialog-close').addEventListener('click',() => closeConcept());
$('dialog-prev').addEventListener('click',() => stepConcept(-1));
$('dialog-next').addEventListener('click',() => stepConcept(1));
dialog.addEventListener('cancel',event => {event.preventDefault();closeConcept();});
dialog.addEventListener('click',event => {
  if (event.target !== dialog) return;
  const rect = dialog.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeConcept();
});
dialog.addEventListener('keydown',event => {
  if (event.altKey || event.ctrlKey || event.metaKey || /INPUT|SELECT|TEXTAREA/.test(event.target.tagName)) return;
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {event.preventDefault();stepConcept(event.key === 'ArrowLeft' ? -1 : 1);}
});
dialog.addEventListener('close',() => {
  if (!dialog.open) document.body.classList.remove('lab-dialog-open');
  if (!closingForNavigation && selectedId && !dialog.open) {
    restoreOpener(); selectedId = null; dialogHistoryEntry = false; syncUrl('replace',null);
  }
});
$('dialog-image').addEventListener('load',() => {$('dialog-image-status').hidden = true;});
$('dialog-image').addEventListener('error',() => {
  $('dialog-image').hidden = true;
  $('dialog-image-status').hidden = false;
  $('dialog-image-status').textContent = 'The image could not be loaded. The design brief and working-view links remain available.';
});

$('concept-controls').addEventListener('submit',event => event.preventDefault());
function updateSearch(event) {
  if (event?.isComposing) return;
  galleryState.query = $('concept-search').value.slice(0,200);
  renderGallery(); syncUrl();
}
$('concept-search').addEventListener('input',updateSearch);
$('concept-search').addEventListener('compositionend',updateSearch);
$('concept-filter').addEventListener('change',event => {galleryState.view = event.target.value;renderGallery();syncUrl();});
$('clear-concept-search').addEventListener('click',() => {galleryState.query = '';renderGallery();syncUrl();$('concept-search').focus();});
$('reset-concepts').addEventListener('click',() => {galleryState = {query:'',view:'all'};renderGallery();syncUrl();$('concept-search').focus();});
window.addEventListener('popstate',() => {
  const next = readGalleryState();
  if (next.query !== galleryState.query || next.view !== galleryState.view) {galleryState = next;renderGallery();}
  const id = new URLSearchParams(location.search).get('concept');
  if (byId.has(id)) showConcept(id,null,true);
  else closeConcept(true);
});

const palette = [
  {label:'Forest ink',token:'--atlas-ink',dark:true},
  {label:'Paper',token:'--atlas-paper'},
  {label:'Canvas',token:'--atlas-canvas'},
  {label:'Surface',token:'--atlas-surface'},
  {label:'Rust accent',token:'--atlas-accent',dark:true},
  {label:'Muted ink',token:'--atlas-muted',dark:true}
];
const styles = getComputedStyle(document.documentElement);
$('token-palette').innerHTML = palette.map(item => {
  const value = styles.getPropertyValue(item.token).trim();
  return `<button class="lab-swatch" type="button" data-copy-token="${item.token}" aria-label="Copy ${esc(item.label)} ${esc(value)}"><span class="lab-swatch-colour" style="--swatch:var(${item.token});--swatch-ink:var(${item.dark ? '--atlas-on-action' : '--atlas-ink'})"><svg viewBox="0 0 20 20" aria-hidden="true"><rect x="6" y="6" width="10" height="11" rx="1.5"></rect><path d="M12 6V3H3v10h3"></path></svg></span><strong>${item.label}</strong><code>${esc(value)}</code></button>`;
}).join('');
$('lab-entity-badges').innerHTML = ['startup','person','partner','provider','programme'].map(entityBadge).join('');
$('token-palette').addEventListener('click',async event => {
  const button = event.target.closest('[data-copy-token]');
  if (!button) return;
  const item = palette.find(item => item.token === button.dataset.copyToken);
  if (!item) return;
  const value = getComputedStyle(document.documentElement).getPropertyValue(item.token).trim();
  const attempt = ++copyAttempt;
  $('copy-fallback').hidden = true;
  $('token-feedback').dataset.tone = '';
  $('token-feedback').textContent = `Copying ${item.label}…`;
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
    await navigator.clipboard.writeText(value);
    if (attempt !== copyAttempt) return;
    $('token-feedback').dataset.tone = 'success';
    $('token-feedback').textContent = `${item.label} copied: ${value}.`;
  } catch {
    if (attempt !== copyAttempt) return;
    $('token-feedback').dataset.tone = 'error';
    $('token-feedback').textContent = `The clipboard is unavailable. Select and copy ${item.label} manually: ${value}.`;
    $('copy-fallback').hidden = false;
    $('copy-value').value = value;
    $('copy-value').focus(); $('copy-value').select();
  }
});

const specimenEntities = {
  startup:{name:'Aster Studio',initials:'AS',description:'A fictional company for exploring identity, readable details and the next useful action.',fact:'Founder research'},
  person:{name:'Sample founder',initials:'SF',description:'A fictional person record for exploring role labels, related companies and research context.',fact:'Role research'},
  partner:{name:'Northfield Ventures',initials:'NV',description:'A fictional partner record for exploring organisation identity and clearly scoped company research.',fact:'Company sample'},
  provider:{name:'Example Cloud',initials:'EC',description:'A fictional provider record for exploring a service identity and its related programmes.',fact:'Programme research'},
  programme:{name:'Atlas Residency',initials:'AR',description:'A fictional programme record for exploring participation details, conditions and evidence.',fact:'Eligibility research'}
};
function renderPlayground(announce = true) {
  const kind = $('play-kind').value, density = $('play-density').value, state = $('play-state').value;
  const preview = $('playground-preview'), entity = specimenEntities[kind];
  preview.dataset.kind = kind; preview.dataset.density = density; preview.dataset.state = state;
  if (state === 'ready') {
    preview.innerHTML = `<article class="lab-specimen-card${specimenSelected ? ' is-selected' : ''}"><div class="lab-specimen-identity"><span class="lab-specimen-mark" aria-hidden="true">${entity.initials}</span><div><h3>${entity.name}</h3>${entityBadge(kind)}</div></div><p class="lab-specimen-description">${entity.description}</p><dl class="lab-specimen-facts"><div><dt>${entity.fact}</dt><dd>Not recorded</dd></div><div><dt>Content status</dt><dd>Fictional specimen</dd></div></dl><div class="lab-specimen-actions"><button id="play-select" class="atlas-button atlas-button-primary" type="button" aria-pressed="${specimenSelected}">${specimenSelected ? 'Clear selection' : 'Select specimen'}</button><a class="lab-text-link" href="./design-system.html#components">Shared components ↗</a></div>${specimenSelected ? `<p class="lab-specimen-selection"><strong>${entity.name} is selected.</strong> The inspector state is local to this example; the Atlas research has not changed.</p>` : ''}</article>`;
  } else {
    const states = {
      loading:{title:'Making space for the research.',copy:'This is a loading-state specimen. The content footprint stays stable; no network request is running.',action:'Finish loading specimen',badge:'Loading example',tone:''},
      empty:{title:'No records match this selection.',copy:'Explain the absence and keep a useful next step visible. Here, clearing the specimen filters restores the example.',action:'Clear specimen filters',badge:'No results',tone:''},
      partial:{title:'Some research is unavailable.',copy:'The identity is available, but related company research did not load. Missing information does not mean there are no connections.',action:'Show complete specimen',badge:'Partial data',tone:'warning'},
      error:{title:'The research could not be loaded.',copy:'Keep the reader’s context and offer a clear recovery action. This example simulates recovery without making a request.',action:'Retry specimen',badge:'Unavailable',tone:'error'}
    };
    const example = states[state];
    preview.innerHTML = `<div class="lab-specimen-state">${state === 'partial' ? `<div class="lab-specimen-identity"><span class="lab-specimen-mark" aria-hidden="true">${entity.initials}</span><div><h3>${entity.name}</h3>${entityBadge(kind)}</div></div>` : ''}<span class="atlas-badge"${example.tone ? ` data-tone="${example.tone}"` : ''}>${example.badge}</span>${state === 'loading' ? '<div class="lab-loading-indicator" aria-hidden="true"><i></i><i></i><i></i></div>' : ''}<h3>${example.title}</h3><p>${example.copy}</p><button id="play-recover" class="atlas-button" type="button">${example.action}</button></div>`;
  }
  if (announce) $('playground-feedback').textContent = `${kind[0].toUpperCase()+kind.slice(1)} specimen · ${density} density · ${state === 'ready' ? 'ready' : $('play-state').selectedOptions[0].textContent.toLowerCase()}.`;
}
$('playground-controls').addEventListener('submit',event => event.preventDefault());
for (const id of ['play-kind','play-density','play-state']) $(id).addEventListener('change',() => {specimenSelected = false;renderPlayground();});
$('play-reset').addEventListener('click',() => {
  $('play-kind').value = 'startup'; $('play-density').value = 'comfortable'; $('play-state').value = 'ready';
  specimenSelected = false; renderPlayground(); $('playground-feedback').textContent = 'Playground reset to the comfortable startup specimen.';
});
$('playground-preview').addEventListener('click',event => {
  if (event.target.closest('#play-recover')) {
    $('play-state').value = 'ready'; specimenSelected = false; renderPlayground();
    $('playground-feedback').textContent = 'The specimen is ready. No research request was made.';
    $('play-select').focus();
  } else if (event.target.closest('#play-select')) {
    specimenSelected = !specimenSelected; renderPlayground(false);
    $('playground-feedback').textContent = specimenSelected ? 'Specimen selected. This is a local interaction example.' : 'Specimen selection cleared.';
    $('play-select').focus({preventScroll:true});
  }
});

renderHero();
renderGallery();
renderBriefs();
renderPlayground(false);
const initialConcept = new URLSearchParams(location.search).get('concept');
if (byId.has(initialConcept)) showConcept(initialConcept,null,true);
else if (initialConcept) syncUrl('replace',null);
