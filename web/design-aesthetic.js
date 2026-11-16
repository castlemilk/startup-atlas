import {aestheticFeatures,aestheticReferences,aestheticDirection,aestheticAssets,featureGraphics} from './design-aesthetic-data.js';
import {featureSymbols,featureSymbol} from './atlas-feature-symbols.js';

const $ = id => document.getElementById(id);
const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
const features = new Map(aestheticFeatures.map(feature => [feature.id,feature]));
const graphics = new Map(featureGraphics.map(asset => [asset.id,asset]));
const arrow = '<span aria-hidden="true">↗</span>';
let state = readState();

function readState() {
  const params = new URLSearchParams(location.search);
  return {
    feature:features.has(params.get('feature')) ? params.get('feature') : 'graph',
    theme:params.get('theme') === 'dark' ? 'dark' : 'light',
    placement:params.get('placement') === 'header' ? 'header' : 'menu'
  };
}

function syncUrl() {
  const url = new URL(location.href);
  for(const key of ['feature','theme','placement']) url.searchParams.set(key,state[key]);
  const next = url.pathname+url.search+url.hash;
  if(next !== location.pathname+location.search+location.hash) history.replaceState(null,'',next);
}

function applyImage(image, feature, source=feature.image) {
  if(image.getAttribute('src') !== source) image.src = source;
  image.alt = feature.alt;
}

function renderStructure() {
  $('signal-principles').innerHTML = aestheticDirection.principles.map(principle => `<article class="signal-principle"><h2>${escape(principle.title)}</h2><p>${escape(principle.detail)}</p></article>`).join('');
  $('signal-feature-tabs').innerHTML = aestheticFeatures.map(feature => `<button type="button" data-feature="${escape(feature.id)}" aria-pressed="false">${featureSymbol(feature.id,{size:28})}<span><strong>${escape(feature.title)}</strong><small>${escape(feature.shape)}</small></span></button>`).join('');
  $('signal-menu').innerHTML = aestheticFeatures.map(feature => `<button type="button" class="signal-menu-item" data-menu-feature="${escape(feature.id)}" aria-pressed="false"><img src="${escape(feature.thumb)}" alt="" width="68" height="68" decoding="async"><span><strong>${escape(feature.title)}</strong><small>${escape(feature.description)}</small></span><span class="signal-menu-arrow" aria-hidden="true">→</span></button>`).join('');
  $('signal-graphics').innerHTML = aestheticFeatures.map(feature => {
    const asset = graphics.get(feature.graphicId);
    return `<article class="signal-graphic-card" data-graphic="${escape(feature.id)}"><div class="signal-graphic-art"><span class="signal-graphic-tag">${escape(feature.shape)}</span><img src="${escape(feature.image)}" alt="${escape(feature.alt)}" width="${asset.width}" height="${asset.height}" loading="lazy" decoding="async"></div><div class="signal-graphic-heading"><h3>${escape(feature.title)}</h3><span>${escape(feature.verb)}</span></div><p>${escape(feature.detail)}</p><a class="signal-text-link" data-download-graphic="${escape(feature.id)}" href="${escape(feature.image)}" download>Download artwork <span aria-hidden="true">↓</span></a></article>`;
  }).join('');
  $('signal-symbols').innerHTML = featureSymbols.map(symbol => `<article class="signal-symbol-card" data-symbol="${escape(symbol.id)}"><h4>${escape(symbol.name)}</h4><div class="signal-symbol-sizes"><div class="signal-symbol-size">${featureSymbol(symbol.id,{size:24})}<span>24px</span></div><div class="signal-symbol-size">${featureSymbol(symbol.id,{size:48})}<span>48px</span></div></div><a class="signal-text-link" data-download-symbol="${escape(symbol.id)}" href="./assets/feature-symbols/${escape(symbol.id)}.svg" download>Download SVG <span aria-hidden="true">↓</span></a></article>`).join('');
  $('signal-references').innerHTML = aestheticReferences.map(reference => `<article class="signal-reference"><a href="${escape(reference.url)}" target="_blank" rel="noopener noreferrer">${escape(reference.title)} ${arrow}<span class="signal-sr-only"> (opens in a new tab)</span></a><p>${escape(reference.note)}</p></article>`).join('');
  $('signal-prompts').innerHTML = [{title:'Shared material & camera',prompt:aestheticDirection.masterPrompt},...featureGraphics.map(asset => ({title:asset.title,prompt:asset.prompt}))].map(item => `<details class="signal-prompt"><summary>${escape(item.title)}</summary><pre tabindex="0" aria-label="${escape(item.title)} generation brief">${escape(item.prompt)}</pre></details>`).join('');
  const board = aestheticAssets.find(asset => asset.id === aestheticDirection.boardId);
  if(board) {
    $('signal-system-art').src = board.image;
    $('signal-system-art').alt = board.alt;
    $('signal-system-art').width = board.width;
    $('signal-system-art').height = board.height;
  }
}

function renderPalette() {
  const styles = getComputedStyle(document.body);
  const roles = [['bg','Canvas'],['surface','Surface'],['ink','Graphite'],['soft','Subtle'],['line-strong','Boundary'],['accent','Signal']];
  $('signal-palette').innerHTML = roles.map(([role,label]) => {
    const value = styles.getPropertyValue('--signal-'+role).trim();
    return `<div class="signal-palette-item"><span class="signal-palette-colour" style="--palette-colour:var(--signal-${role})"></span><strong>${label}</strong><code>${escape(value)}</code></div>`;
  }).join('');
}

function renderState({updateUrl=true}={}) {
  const feature = features.get(state.feature);
  const menuOpen = state.placement === 'menu';
  const hidingFocusedItem = !menuOpen && $('signal-menu').contains(document.activeElement);
  document.body.dataset.theme = state.theme;
  $('signal-preview').dataset.feature = state.feature;
  $('signal-preview').dataset.placement = state.placement;
  $('signal-menu-toggle').setAttribute('aria-expanded',String(menuOpen));
  $('signal-menu').hidden = !menuOpen;
  $('signal-header-copy').hidden = menuOpen;
  for(const button of $('signal-feature-tabs').querySelectorAll('[data-feature]')) button.setAttribute('aria-pressed',String(button.dataset.feature === state.feature));
  for(const button of document.querySelectorAll('[data-menu-feature]')) button.setAttribute('aria-pressed',String(button.dataset.menuFeature === state.feature));
  for(const theme of ['light','dark']) $('signal-theme-'+theme).setAttribute('aria-pressed',String(theme === state.theme));
  for(const placement of ['menu','header']) $('signal-placement-'+placement).setAttribute('aria-pressed',String(placement === state.placement));
  applyImage($('signal-preview-art'),feature);
  applyImage($('signal-hero-art'),feature);
  $('signal-hero-feature').textContent = feature.title;
  $('signal-hero-shape').textContent = feature.shape;
  $('signal-preview-title').textContent = feature.title;
  $('signal-preview-description').textContent = feature.description;
  $('signal-preview-shape').textContent = feature.shape;
  $('signal-preview-verb').textContent = feature.verb+' the ecosystem';
  $('signal-header-title').textContent = feature.title;
  $('signal-header-description').textContent = feature.description;
  for(const id of ['signal-live-link','signal-header-link']) {
    $(id).setAttribute('href',feature.route);
    $(id).innerHTML = escape(feature.routeLabel)+' '+arrow;
  }
  $('signal-selection-status').textContent = `${feature.title} selected. ${menuOpen ? 'Feature menu' : 'Page header'} in ${state.theme} appearance.`;
  document.querySelector('meta[name="theme-color"]').content = state.theme === 'dark' ? '#101114' : '#fafafc';
  renderPalette();
  if(hidingFocusedItem) $('signal-menu-toggle').focus({preventScroll:true});
  if(updateUrl) syncUrl();
}

function chooseFeature(id) {
  if(!features.has(id)) return;
  state.feature = id;
  renderState();
}

function choosePlacement(placement,{restoreFocus=false}={}) {
  state.placement = placement;
  renderState();
  if(restoreFocus) $('signal-menu-toggle').focus({preventScroll:true});
}

function keyboardFeatures(event,selector,attribute) {
  if(event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  const direction = ['ArrowRight','ArrowDown'].includes(event.key) ? 1 : ['ArrowLeft','ArrowUp'].includes(event.key) ? -1 : 0;
  if(!direction && !['Home','End'].includes(event.key)) return;
  const button = event.target.closest(selector);
  if(!button) return;
  event.preventDefault();
  const buttons = [...event.currentTarget.querySelectorAll(selector)];
  const current = buttons.indexOf(button);
  const index = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length-1 : (current+direction+buttons.length)%buttons.length;
  buttons[index].focus();
  chooseFeature(buttons[index].dataset[attribute]);
}

renderStructure();
renderState();

$('signal-feature-tabs').addEventListener('click',event => {
  const button = event.target.closest('[data-feature]');
  if(button) chooseFeature(button.dataset.feature);
});
$('signal-feature-tabs').addEventListener('keydown',event => keyboardFeatures(event,'[data-feature]','feature'));
$('signal-menu').addEventListener('click',event => {
  const button = event.target.closest('[data-menu-feature]');
  if(button) chooseFeature(button.dataset.menuFeature);
});
$('signal-menu').addEventListener('keydown',event => keyboardFeatures(event,'[data-menu-feature]','menuFeature'));
$('signal-menu-toggle').addEventListener('click',() => choosePlacement(state.placement === 'menu' ? 'header' : 'menu'));
for(const placement of ['menu','header']) $('signal-placement-'+placement).addEventListener('click',() => choosePlacement(placement));
for(const theme of ['light','dark']) $('signal-theme-'+theme).addEventListener('click',() => {state.theme=theme;renderState();});
document.addEventListener('keydown',event => {
  if(event.key !== 'Escape' || state.placement !== 'menu' || !$('signal-preview').contains(document.activeElement)) return;
  event.preventDefault();
  choosePlacement('header',{restoreFocus:true});
});
window.addEventListener('popstate',() => {state=readState();renderState({updateUrl:false});});
document.body.dataset.ready = 'true';
