import {assets} from './design-handbook.js';
import {atlasIcons, iconRegistry, iconCategories, renderIcon, exportIcon} from './atlas-icons.js';
import {escapeHtml as esc} from './logic.js';
import './atlas-ui.js';

const $ = id => document.getElementById(id);
const byAsset = new Map(assets.map(asset => [asset.id,asset]));
const kindLabels = {concept:'Concept study',direction:'Direction board',illustration:'Editorial illustration',feature:'Feature graphic'};
const choices = {
  kind:['all','concept','direction','illustration','feature'], category:['all',...iconCategories.map(category => category.id)],
  size:['16','24','32','48'], stroke:['1.5','1.65','2.25'], color:['ink','accent','white'], backdrop:['paper','surface','forest']
};
const defaults = {kind:'all',category:'all',size:'24',stroke:'1.65',color:'ink',backdrop:'paper',icon:'search'};
const dialog = $('asset-dialog');
let state = readState();
let selectedAssetId = null;
let lastAssetOpener = null;
let assetHistoryEntry = false;
let closingForNavigation = false;
let downloadUrl = null;
let currentSvg = '';
let copyAttempt = 0;

function readState() {
  const params = new URLSearchParams(location.search);
  const result = {assetq:(params.get('assetq') || '').slice(0,200),iconq:(params.get('iconq') || '').slice(0,100)};
  for (const [name,values] of Object.entries(choices)) result[name] = values.includes(params.get(name)) ? params.get(name) : defaults[name];
  result.icon = Object.hasOwn(iconRegistry,params.get('icon')) ? params.get('icon') : defaults.icon;
  return result;
}
function syncUrl(mode = 'replace') {
  const url = new URL(location.href);
  for (const [name,value] of Object.entries(state)) {
    if (value && value !== defaults[name]) url.searchParams.set(name,value);
    else url.searchParams.delete(name);
  }
  if (selectedAssetId) url.searchParams.set('asset',selectedAssetId);
  else url.searchParams.delete('asset');
  const next = url.pathname + url.search + url.hash;
  if (next !== location.pathname + location.search + location.hash) history[mode === 'push' ? 'pushState' : 'replaceState'](null,'',next);
}
function normalized(value) { return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase(); }
function matchesQuery(query,content) {
  const searchable = normalized(content);
  return normalized(query).trim().split(/\s+/).filter(Boolean).every(term => searchable.includes(term));
}
function dimensions(asset) {
  const width = Number.isFinite(asset.width) && asset.width > 0 ? asset.width : 1200;
  const height = Number.isFinite(asset.height) && asset.height > 0 ? asset.height : asset.kind === 'illustration' ? 1200 : 800;
  return {width,height};
}
function imageMetadata(asset) {
  const format = (asset.image.split('.').pop() || 'image').toUpperCase();
  return `${format}${asset.width && asset.height ? ` · ${asset.width} × ${asset.height}` : ''}${asset.transparent ? ' · transparent' : ''}`;
}
function watchImages(container) {
  for (const image of container.querySelectorAll('img')) {
    const unavailable = () => image.closest('button')?.classList.add('asset-image-failed');
    image.addEventListener('error',unavailable,{once:true});
    if (image.complete && !image.naturalWidth) unavailable();
  }
}
function renderFeature() {
  const asset = byAsset.get('illustration-discover') || assets.find(item => item.kind === 'illustration') || assets[0];
  if (!asset) return;
  const size = dimensions(asset);
  $('asset-feature').innerHTML = `<figure><button type="button" data-open-asset="${esc(asset.id)}" aria-label="Preview ${esc(asset.title)}"><img src="${esc(asset.thumb || asset.image)}" width="${size.width}" height="${size.height}" alt="${esc(asset.alt)}" fetchpriority="high"><span class="asset-image-error">Image unavailable. Open the preview to read its usage guidance.</span></button><figcaption><strong>${esc(asset.title)}</strong><span>${esc(kindLabels[asset.kind])}</span></figcaption></figure>`;
  watchImages($('asset-feature'));
  $('asset-collection-summary').textContent = `${assets.length} image assets. ${atlasIcons.length} utility icons. Explore the original and proposed directions.`;
}
function renderAssets() {
  $('asset-search').value = state.assetq;
  $('asset-kind').value = state.kind;
  $('asset-clear').hidden = !state.assetq;
  const matches = assets.filter(asset => (state.kind === 'all' || asset.kind === state.kind) && matchesQuery(state.assetq,[asset.title,asset.description,...asset.tags,...asset.usage].join(' ')));
  $('asset-count').textContent = `${matches.length} of ${assets.length} images`;
  $('asset-gallery').hidden = !matches.length;
  $('asset-empty').hidden = matches.length > 0;
  $('asset-gallery').innerHTML = matches.map(asset => {
    const size = dimensions(asset);
    return `<article class="asset-card" data-asset="${esc(asset.id)}" data-kind="${esc(asset.kind)}" data-transparent="${Boolean(asset.transparent)}"><button class="lab-concept-image-button" type="button" data-open-asset="${esc(asset.id)}" aria-label="Preview ${esc(asset.title)}"><img src="${esc(asset.thumb || asset.image)}" alt="${esc(asset.alt)}" width="${size.width}" height="${size.height}" loading="lazy"><span class="asset-image-error">Image unavailable. Open the preview to read its usage guidance.</span><span class="lab-image-open" aria-hidden="true">${renderIcon('plus')}</span></button><p class="asset-kind">${esc(kindLabels[asset.kind])}</p><div class="asset-card-heading"><h3><button type="button" data-open-asset="${esc(asset.id)}">${esc(asset.title)}</button></h3></div><p>${esc(asset.description)}</p><div class="asset-card-footer"><span>${esc(imageMetadata(asset))}</span><a href="${esc(asset.image)}" download aria-label="Download ${esc(asset.title)}">Download ${renderIcon('download')}</a></div></article>`;
  }).join('');
  watchImages($('asset-gallery'));
}

// Reuses the lab's native modal, image status, focus-return and history contract.
function showAsset(id, opener = null, navigation = false) {
  const asset = byAsset.get(id);
  if (!asset) return;
  const wasOpen = dialog.open;
  if (!wasOpen) {
    lastAssetOpener = opener || (document.activeElement !== document.body ? document.activeElement : null);
    assetHistoryEntry = !navigation;
  }
  selectedAssetId = id;
  $('asset-dialog-title').textContent = asset.title;
  $('asset-dialog-kind').textContent = kindLabels[asset.kind];
  $('asset-dialog-position').textContent = `Image ${assets.indexOf(asset)+1} of ${assets.length}`;
  $('asset-dialog-announcement').textContent = `Image ${assets.indexOf(asset)+1} of ${assets.length}: ${asset.title}.`;
  $('asset-dialog-description').textContent = asset.description;
  $('asset-dialog-caption').textContent = asset.caption;
  const size = dimensions(asset);
  const image = $('asset-dialog-image');
  image.hidden = false;
  image.width = size.width; image.height = size.height;
  image.alt = asset.alt;
  $('asset-image-status').hidden = false;
  $('asset-image-status').textContent = 'Loading image…';
  image.src = asset.image;
  if (image.complete && image.naturalWidth) $('asset-image-status').hidden = true;
  $('asset-dialog-image-wrap').dataset.transparent = String(Boolean(asset.transparent));
  $('asset-dialog-meta').innerHTML = `<div><dt>File</dt><dd>${esc(imageMetadata(asset))}</dd></div><div><dt>Artwork</dt><dd>${asset.kind === 'concept' ? 'Illustrative interface' : 'Generated design asset'}</dd></div>`;
  $('asset-dialog-usage').innerHTML = asset.usage.map(item => `<li>${esc(item)}</li>`).join('');
  $('asset-dialog-avoid').innerHTML = asset.avoid.map(item => `<li>${esc(item)}</li>`).join('');
  $('asset-download').href = asset.image;
  $('asset-download').download = asset.image.split('/').pop();
  $('asset-working-view').hidden = !asset.route;
  if (asset.route) $('asset-working-view').href = asset.route;
  $('asset-prompt-details').hidden = !asset.prompt;
  $('asset-prompt-details').open = false;
  $('asset-prompt').textContent = [asset.prompt,asset.revisionPrompt ? 'Image refinement: ' + asset.revisionPrompt : ''].filter(Boolean).join('\n\n');
  $('asset-dialog-prev').disabled = assets.length < 2;
  $('asset-dialog-next').disabled = assets.length < 2;
  if (!wasOpen) { dialog.showModal(); document.body.classList.add('lab-dialog-open'); }
  dialog.scrollTop = 0;
  if (!navigation) syncUrl(wasOpen ? 'replace' : 'push');
}
function restoreAssetOpener() {
  const fallback = selectedAssetId && document.querySelector(`#asset-gallery [data-open-asset="${CSS.escape(selectedAssetId)}"]`);
  (lastAssetOpener?.isConnected ? lastAssetOpener : fallback || $('asset-search')).focus({preventScroll:true});
}
function closeAsset(navigation = false) {
  if (!dialog.open) { selectedAssetId = null; return; }
  const useBack = !navigation && assetHistoryEntry;
  closingForNavigation = true;
  dialog.close(); document.body.classList.remove('lab-dialog-open');
  restoreAssetOpener();
  closingForNavigation = false;
  selectedAssetId = null; assetHistoryEntry = false;
  if (!navigation) { if (useBack) history.back(); else syncUrl(); }
}
function stepAsset(direction) {
  const index = assets.findIndex(asset => asset.id === selectedAssetId);
  const next = assets[(index + direction + assets.length) % assets.length];
  if (next) showAsset(next.id);
}

const colorTokens = {ink:'--atlas-ink',accent:'--atlas-accent',white:'--atlas-on-action'};
const backdropTokens = {paper:'--atlas-paper',surface:'--atlas-surface',forest:'--atlas-ink'};
function tokenValue(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
function luminance(hex) {
  const value = hex.replace('#','');
  if (!/^[\da-f]{6}$/i.test(value)) return null;
  const rgb = [0,2,4].map(index => parseInt(value.slice(index,index+2),16)/255).map(channel => channel <= .04045 ? channel/12.92 : ((channel+.055)/1.055)**2.4);
  return .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];
}
function renderIconGrid() {
  $('icon-search').value = state.iconq;
  $('icon-category').value = state.category;
  $('icon-clear').hidden = !state.iconq;
  const matches = atlasIcons.filter(icon => (state.category === 'all' || icon.category === state.category) && matchesQuery(state.iconq,[icon.id,icon.label,icon.description,...icon.tags].join(' ')));
  $('icon-count').textContent = `${matches.length} of ${atlasIcons.length} icons`;
  $('icon-empty').hidden = matches.length > 0;
  $('icon-grid').hidden = !matches.length;
  $('icon-grid').innerHTML = matches.map(icon => `<button type="button" class="asset-icon-option" data-select-icon="${esc(icon.id)}" aria-pressed="${icon.id === state.icon}" aria-controls="icon-inspector" aria-label="Inspect ${esc(icon.label)} icon">${renderIcon(icon.id)}<span>${esc(icon.label)}</span></button>`).join('');
}
function renderIconInspector() {
  const record = iconRegistry[state.icon];
  const color = tokenValue(colorTokens[state.color]);
  const options = {size:Number(state.size),strokeWidth:Number(state.stroke),color};
  $('icon-selected-title').textContent = record.label;
  $('icon-selected-id').textContent = record.id;
  $('icon-selected-description').textContent = record.description;
  for (const name of ['size','stroke','color','backdrop']) $('icon-'+name).value = state[name];
  const preview = $('icon-preview');
  preview.dataset.backdrop = state.backdrop;
  preview.dataset.icon = record.id;
  preview.innerHTML = renderIcon(record.id,{...options,className:'asset-icon-symbol',label:record.label});
  const foreground = luminance(color), background = luminance(tokenValue(backdropTokens[state.backdrop]));
  const lowContrast = foreground !== null && background !== null && (Math.max(foreground,background)+.05)/(Math.min(foreground,background)+.05) < 3;
  $('icon-contrast-note').dataset.tone = lowContrast ? 'warning' : '';
  $('icon-contrast-note').textContent = lowContrast ? 'Low preview contrast. Choose another colour or backdrop. SVG exports stay transparent.' : 'Backdrop is for preview only. SVG exports stay transparent.';
  currentSvg = exportIcon(record.id,options);
  $('icon-code').textContent = currentSvg;
  if (downloadUrl) URL.revokeObjectURL(downloadUrl);
  downloadUrl = URL.createObjectURL(new Blob([currentSvg],{type:'image/svg+xml'}));
  $('icon-download').href = downloadUrl;
  $('icon-download').download = `atlas-${record.id}-${state.size}px.svg`;
  $('icon-default-download').href = `./assets/design-icons/${record.id}.svg`;
  $('icon-default-download').download = `atlas-${record.id}.svg`;
  copyAttempt++;
  $('icon-feedback').dataset.tone = '';
  $('icon-feedback').textContent = `${record.label} selected. Size, stroke and colour are included in the SVG.`;
  $('icon-copy-fallback').hidden = true;
}

document.addEventListener('click',event => {
  const opener = event.target.closest('[data-open-asset]');
  if (opener) showAsset(opener.dataset.openAsset,opener);
  const iconButton = event.target.closest('[data-select-icon]');
  if (iconButton) {
    state.icon = iconButton.dataset.selectIcon;
    for (const button of $('icon-grid').querySelectorAll('[data-select-icon]')) button.setAttribute('aria-pressed',String(button === iconButton));
    renderIconInspector(); syncUrl();
    if (matchMedia('(max-width: 900px)').matches) {
      $('icon-inspector').scrollIntoView({block:'start',behavior:'instant'});
      $('icon-selected-title').focus({preventScroll:true});
    }
  }
});
for (const id of ['asset-controls','icon-controls','icon-style-controls']) $(id).addEventListener('submit',event => event.preventDefault());
function updateSearch(field,event) {
  if (event?.isComposing) return;
  if (field === 'asset') { state.assetq = $('asset-search').value.slice(0,200); renderAssets(); }
  else { state.iconq = $('icon-search').value.slice(0,100); renderIconGrid(); }
  syncUrl();
}
for (const field of ['asset','icon']) for (const event of ['input','compositionend']) $(field+'-search').addEventListener(event,eventObject => updateSearch(field,eventObject));
$('asset-kind').addEventListener('change',event => {state.kind = event.target.value; renderAssets(); syncUrl();});
$('asset-reset').addEventListener('click',() => {state.assetq = ''; state.kind = 'all'; renderAssets(); syncUrl(); $('asset-search').focus();});
$('icon-category').addEventListener('change',event => {state.category = event.target.value; renderIconGrid(); syncUrl();});
$('icon-reset').addEventListener('click',() => {state.iconq = ''; state.category = 'all'; renderIconGrid(); syncUrl(); $('icon-search').focus();});
for (const name of ['size','stroke','color','backdrop']) $('icon-'+name).addEventListener('change',event => {state[name] = event.target.value; renderIconInspector(); syncUrl();});
$('icon-copy').addEventListener('click',async () => {
  const attempt = ++copyAttempt, value = currentSvg, label = iconRegistry[state.icon].label;
  $('icon-copy-fallback').hidden = true;
  $('icon-feedback').dataset.tone = '';
  $('icon-feedback').textContent = `Copying ${label} SVG…`;
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
    await navigator.clipboard.writeText(value);
    if (attempt !== copyAttempt) return;
    $('icon-feedback').dataset.tone = 'success';
    $('icon-feedback').textContent = `${label} SVG copied.`;
  } catch {
    if (attempt !== copyAttempt) return;
    $('icon-feedback').dataset.tone = 'error';
    $('icon-feedback').textContent = `The clipboard is unavailable. Select and copy the ${label} SVG below.`;
    $('icon-copy-fallback').hidden = false;
    $('icon-copy-value').value = value;
    $('icon-copy-value').focus(); $('icon-copy-value').select();
  }
});
$('asset-dialog-close').addEventListener('click',() => closeAsset());
$('asset-dialog-prev').addEventListener('click',() => stepAsset(-1));
$('asset-dialog-next').addEventListener('click',() => stepAsset(1));
dialog.addEventListener('cancel',event => {event.preventDefault(); closeAsset();});
dialog.addEventListener('keydown',event => {
  if (event.isComposing || event.altKey || event.ctrlKey || event.metaKey || /INPUT|SELECT|TEXTAREA/.test(event.target.tagName)) return;
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {event.preventDefault(); stepAsset(event.key === 'ArrowLeft' ? -1 : 1);}
});
dialog.addEventListener('click',event => {
  if (event.target !== dialog) return;
  const rect = dialog.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeAsset();
});
dialog.addEventListener('close',() => {
  if (!dialog.open) document.body.classList.remove('lab-dialog-open');
  if (!closingForNavigation && selectedAssetId && !dialog.open) {restoreAssetOpener(); selectedAssetId = null; assetHistoryEntry = false; syncUrl();}
});
$('asset-dialog-image').addEventListener('load',() => {$('asset-image-status').hidden = true;});
$('asset-dialog-image').addEventListener('error',() => {
  $('asset-dialog-image').hidden = true;
  $('asset-image-status').hidden = false;
  $('asset-image-status').textContent = 'The image could not be loaded. Its usage guidance and download link remain available.';
});
window.addEventListener('popstate',() => {
  const next = readState();
  const galleryChanged = next.assetq !== state.assetq || next.kind !== state.kind;
  const iconsChanged = next.iconq !== state.iconq || next.category !== state.category;
  const appearanceChanged = ['icon','size','stroke','color','backdrop'].some(name => next[name] !== state[name]);
  state = next;
  if (galleryChanged) renderAssets();
  if (iconsChanged || appearanceChanged) renderIconGrid();
  if (appearanceChanged) renderIconInspector();
  const asset = new URLSearchParams(location.search).get('asset');
  if (byAsset.has(asset)) showAsset(asset,null,true); else closeAsset(true);
});

for (const placeholder of document.querySelectorAll('span[data-icon]')) placeholder.innerHTML = renderIcon(placeholder.dataset.icon);
$('icon-category').insertAdjacentHTML('beforeend',iconCategories.map(category => `<option value="${esc(category.id)}">${esc(category.label)}</option>`).join(''));
$('icon-library-description').textContent = `${atlasIcons.length} utility icons for the small decisions that keep exploration moving.`;
renderFeature(); renderAssets(); renderIconGrid(); renderIconInspector();
const initialAsset = new URLSearchParams(location.search).get('asset');
if (byAsset.has(initialAsset)) showAsset(initialAsset,null,true);
syncUrl();
