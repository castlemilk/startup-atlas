import { escapeHtml as esc } from './logic.js';
import { renderIcon } from './atlas-icons.js';
import './atlas-ui.js';
import {
  principles, brandAnatomy, voiceExamples, motion, viewPlaybooks,
  directionBoards, editorialIllustrations
} from './design-handbook.js';

const $ = id => document.getElementById(id);
const icon = name => renderIcon(name);
const assetHref = asset => './design-assets.html?asset=' + encodeURIComponent(asset.id);
const patternHref = view => './design-system.html?pattern=' + encodeURIComponent(view.pattern) + '#views';
const list = items => `<ul class="direction-guidance-list">${items.map(item => `<li>${esc(item)}</li>`).join('')}</ul>`;
const viewIcons = {'list-search':'list',treemap:'treemap',graph:'graph',startup:'company',partner:'partners'};

function assetImage(asset, eager = false) {
  const dimensions = asset.width && asset.height ? ` width="${Number(asset.width)}" height="${Number(asset.height)}"` : '';
  return `<img src="${esc(asset.thumb || asset.image)}" alt="${esc(asset.alt)}"${dimensions} loading="${eager ? 'eager' : 'lazy'}" decoding="async"${eager ? ' fetchpriority="high"' : ''}>`;
}

function renderHero() {
  const asset = editorialIllustrations.find(item => item.id === 'illustration-discover') || editorialIllustrations[0];
  if (!asset) return;
  $('direction-hero-art').innerHTML = `<a href="${assetHref(asset)}" aria-label="Inspect the ${esc(asset.title)} editorial illustration">${assetImage(asset,true)}</a><figcaption><span>Editorial illustration<br>${esc(asset.title)} · symbolic artwork</span><a href="${assetHref(asset)}">Inspect asset ${icon('external')}</a></figcaption>`;
}

function renderPrinciples() {
  $('direction-principles').innerHTML = principles.map(principle => `<article class="direction-principle" id="principle-${esc(principle.id)}"><h3>${esc(principle.title)}</h3><p>${esc(principle.summary)}</p><details><summary>Apply this principle ${icon('chevron-down')}</summary><div class="direction-principle-guidance"><div><p class="direction-guidance-label">In practice</p>${list(principle.do)}</div><div><p class="direction-guidance-label">Watch for</p>${list(principle.avoid)}</div></div></details></article>`).join('');
}

function renderBoards() {
  $('direction-board-list').innerHTML = directionBoards.map(board => `<article class="direction-board" id="board-${esc(board.id)}"><figure><a class="direction-image-frame" href="${assetHref(board)}" aria-label="Inspect ${esc(board.title)} direction board">${assetImage(board)}</a><figcaption>${esc(board.caption)} · generated concept</figcaption></figure><div class="direction-board-copy"><p class="direction-asset-label">${icon('system')} ${esc(board.status)}</p><h3>${esc(board.title)}</h3><p>${esc(board.description)}</p><h4>Read it for</h4>${list(board.usage)}<div class="direction-board-actions"><a class="atlas-button" href="${assetHref(board)}">Inspect the board ${icon('external')}</a><a class="lab-text-link" href="${esc(board.image)}" download>Download ${icon('download')}</a></div></div></article>`).join('');
}

function renderIllustrations() {
  $('direction-illustrations').innerHTML = editorialIllustrations.map(asset => `<article class="direction-illustration" id="art-${esc(asset.id)}"><figure class="direction-illustration-plate"><a href="${assetHref(asset)}" aria-label="Inspect the ${esc(asset.title)} illustration">${assetImage(asset)}</a></figure><h3>${esc(asset.title)}</h3><p>${esc(asset.description)}</p><div class="direction-illustration-use"><h4>Where it belongs</h4>${list(asset.usage)}</div><div class="direction-illustration-use"><h4>Keep the boundary clear</h4>${list(asset.avoid)}</div><a class="lab-text-link" href="${assetHref(asset)}">Usage, transparency &amp; download ${icon('arrow')}</a></article>`).join('');
}

function renderAnatomy() {
  $('direction-brand-rules').innerHTML = brandAnatomy.map(rule => `<article class="direction-brand-rule"><p class="direction-rule-role">${esc(rule.role)}</p><h3>${esc(rule.title)}</h3><p>${esc(rule.guidance)}</p><details><summary>Usage notes</summary><div><div><p class="direction-guidance-label">Use deliberately</p>${list(rule.do)}</div><div><p class="direction-guidance-label">Avoid</p>${list(rule.avoid)}</div></div></details></article>`).join('');
  const styles = getComputedStyle(document.documentElement);
  const rootSize = Number.parseFloat(styles.fontSize) || 16;
  const scales = [['xs','Compact'],['sm','Control'],['md','Content'],['lg','Supporting']];
  $('direction-type-scale').innerHTML = scales.map(([size,label]) => {
    const token = `--atlas-text-${size}`;
    const value = styles.getPropertyValue(token).trim();
    const pixels = value.endsWith('rem') ? Number.parseFloat(value) * rootSize : Number.parseFloat(value);
    return `<div class="direction-type-step"><span style="font-size:var(${token})">${esc(String(pixels))}px</span><code>${label}</code></div>`;
  }).join('');
  $('direction-spacing-scale').innerHTML = [1,2,3,4,6,8,12].map(step => {
    const token = `--atlas-space-${step}`;
    const value = styles.getPropertyValue(token).trim();
    return `<div class="direction-spacing-step"><i style="width:var(${token})" aria-hidden="true"></i><span>${esc(value)}</span></div>`;
  }).join('');
}

const layouts = {
  workspace:{primary:'Working canvas',secondary:'Inspector',description:'The graph pairs a flexible canvas with a 335px inspector and a 16px gap, stacking below 820px. This specimen is a diagram of the structure.'},
  profile:{primary:'Identity, people and research',secondary:'Evidence rail',description:'Profiles use a narrower 1320px shell, a 280px evidence rail and 48px section gaps. Company facts, dated events and sources stay in a readable sequence.'},
  narrow:{primary:'Research in reading order',secondary:'Selected detail',description:'On a narrow screen, the inspector enters document flow. Controls wrap, full names remain readable and the graph or treemap keeps an equivalent list available.'}
};
document.querySelector('.direction-layout-switch').addEventListener('click',event => {
  const button = event.target.closest('button[data-layout]');
  if (!button || !layouts[button.dataset.layout]) return;
  const mode = button.dataset.layout, layout = layouts[mode], preview = $('direction-layout-preview');
  for (const control of document.querySelectorAll('.direction-layout-switch button[data-layout]')) control.setAttribute('aria-pressed',String(control === button));
  preview.dataset.layout = mode;
  preview.querySelector('.direction-layout-primary').textContent = layout.primary;
  preview.querySelector('.direction-layout-secondary').textContent = layout.secondary;
  $('direction-layout-description').textContent = layout.description;
});

function renderVoice() {
  $('direction-voice-examples').innerHTML = voiceExamples.map(example => `<article class="direction-voice-example"><h3>${esc(example.situation)}</h3><p class="direction-voice-prefer">${icon('check')}<span>${esc(example.prefer)}</span></p><p class="direction-voice-avoid"><span>Avoid</span> ${esc(example.avoid)}</p><p>${esc(example.why)}</p></article>`).join('');
}

function playbookSection(title, items) {
  return `<section class="direction-playbook-section"><h4>${title}</h4>${list(items)}</section>`;
}
function renderPlaybooks() {
  $('direction-playbooks').innerHTML = viewPlaybooks.map(view => `<details class="direction-playbook" id="playbook-${esc(view.id)}" data-playbook="${esc(view.id)}"><summary>${icon(viewIcons[view.id] || 'system')}<h3>${esc(view.title)}</h3><p>${esc(view.question)}</p><span class="direction-playbook-toggle">${icon('chevron-down')}</span></summary><div class="direction-playbook-body"><p class="direction-playbook-purpose">${esc(view.purpose)}</p><div class="direction-playbook-links"><a class="atlas-button atlas-button-primary" href="${esc(view.route)}">Open working view ${icon('external')}</a><a class="lab-text-link" href="${patternHref(view)}">Inspect the live pattern ${icon('external')}</a><a class="lab-text-link" href="./design-lab.html?concept=${encodeURIComponent(view.id)}">View the concept study ${icon('arrow')}</a></div><div class="direction-playbook-sections">${playbookSection('Structure and reading order',view.layout)}${playbookSection('Interaction and navigation',view.interaction)}${playbookSection('Data and evidence boundaries',view.dataBoundaries)}${playbookSection('Keyboard, mobile and access',view.accessibility)}</div><div class="direction-playbook-stages"><section class="direction-playbook-stage" data-stage="current"><h4>${icon('check')} Working today</h4>${list(view.current)}</section><section class="direction-playbook-stage" data-stage="next"><h4>${icon('plus')} Proposed next work</h4>${list(view.next)}</section></div><div class="direction-playbook-docs">${view.docs.map(doc => `<a href="${esc(doc.href)}">${esc(doc.label)}</a>`).join('')}<a href="#playbook-${esc(view.id)}">Link to this playbook ${icon('link')}</a></div></div></details>`).join('');
}
function updateExpandControl() {
  const all = [...document.querySelectorAll('[data-playbook]')];
  const expanded = all.length > 0 && all.every(item => item.open);
  $('playbooks-expand').setAttribute('aria-expanded',String(expanded));
  $('playbooks-expand').innerHTML = `${expanded ? 'Collapse' : 'Expand'} all playbooks ${icon(expanded ? 'minus' : 'plus')}`;
}
$('playbooks-expand').addEventListener('click',() => {
  const all = [...document.querySelectorAll('[data-playbook]')];
  const open = !all.every(item => item.open);
  for (const playbook of all) playbook.open = open;
  updateExpandControl();
});
$('direction-playbooks').addEventListener('toggle',updateExpandControl,true);

function openAnchoredPlaybook() {
  let id;
  try { id = decodeURIComponent(location.hash.slice(1)); } catch { return; }
  if (!id.startsWith('playbook-')) return;
  const playbook = $(id);
  if (!playbook?.matches('[data-playbook]')) return;
  playbook.open = true;
  updateExpandControl();
  requestAnimationFrame(() => playbook.scrollIntoView({block:'start',behavior:'auto'}));
}
window.addEventListener('hashchange',openAnchoredPlaybook);

const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
let manualReduced = false;
let detailAnimation = null;

function reducedMotion() { return motionPreference.matches || manualReduced; }
function durationMilliseconds(value) {
  const number = Number.parseFloat(value);
  return Number.isFinite(number) ? number * (value.trim().endsWith('ms') ? 1 : 1000) : 0;
}
function refreshMotionTokens() {
  const styles = getComputedStyle(document.documentElement);
  const easing = styles.getPropertyValue(motion.easing.token).trim();
  $('direction-motion-tokens').innerHTML = motion.tokens.map(token => `<div class="direction-motion-token"><strong>${esc(styles.getPropertyValue(token.token).trim())}</strong><span>${esc(token.role)}</span><code>${esc(token.token)}</code></div>`).join('') + `<div class="direction-motion-token"><strong class="direction-easing">${esc(easing)}</strong><span>Shared transition curve</span><code>${esc(motion.easing.token)}</code></div>`;
  const reduced = reducedMotion();
  $('motion-demo').dataset.reduced = String(reduced);
  $('motion-reduced').checked = reduced;
  $('motion-reduced').disabled = motionPreference.matches;
  const duration = reduced ? 0 : durationMilliseconds(styles.getPropertyValue('--atlas-duration-normal'));
  $('motion-preference').textContent = motionPreference.matches
    ? 'Your device requests reduced motion. The specimen uses 0ms transitions; selection and every action remain available.'
    : manualReduced
      ? 'Reduced motion preview: 0ms. The selected state updates immediately, with no detail animation.'
      : `Detail transition: ${duration}ms. Runtime token values are shown alongside; no animation runs until you inspect or reset.`;
  if (reduced) detailAnimation?.cancel();
}
function setInspection(person, announce = true) {
  const changed = $('motion-demo').dataset.selected !== (person ? 'person' : 'root');
  $('motion-demo').dataset.selected = person ? 'person' : 'root';
  $('motion-inspect').setAttribute('aria-pressed',String(person));
  $('motion-detail-label').textContent = person ? 'Inspected within this map' : 'Map root';
  $('motion-detail-title').textContent = person ? 'Maya Chen' : 'Aster';
  $('motion-detail-copy').textContent = person
    ? 'The person is inspected. Aster remains the root, and both nodes stay in place. Changing the starting point is a separate action in the working graph.'
    : 'The root defines this neighbourhood. Inspect the person to change the detail while keeping the map steady.';
  if (announce) $('motion-status').textContent = person
    ? 'Maya Chen is inspected. Aster remains the map root; the node positions have not changed.'
    : 'Aster is shown in the detail. The map root and node positions have not changed.';
  detailAnimation?.cancel();
  if (changed && !reducedMotion()) {
    const styles = getComputedStyle(document.documentElement);
    const duration = durationMilliseconds(styles.getPropertyValue('--atlas-duration-normal'));
    if (duration > 0 && typeof $('motion-detail').animate === 'function') {
      detailAnimation = $('motion-detail').animate([{opacity:.55},{opacity:1}],{duration,easing:styles.getPropertyValue('--atlas-ease').trim()});
    }
  }
}
$('motion-inspect').addEventListener('click',() => setInspection($('motion-demo').dataset.selected !== 'person'));
$('motion-reset').addEventListener('click',() => {
  manualReduced = false;
  setInspection(false);
  refreshMotionTokens();
  $('motion-status').textContent = 'Specimen reset. Aster is the root, and your device motion preference is respected.';
});
$('motion-reduced').addEventListener('change',event => {manualReduced = event.target.checked;refreshMotionTokens();});
motionPreference.addEventListener('change',refreshMotionTokens);

function watchImages() {
  for (const image of document.querySelectorAll('main img')) {
    const unavailable = () => {
      if (image.dataset.unavailable) return;
      image.dataset.unavailable = 'true';
      image.hidden = true;
      const message = document.createElement('span');
      message.className = 'direction-media-error';
      message.textContent = 'The image could not be loaded. Open the asset details for its description and download.';
      image.parentElement.append(message);
    };
    image.addEventListener('error',unavailable,{once:true});
    if (image.complete && !image.naturalWidth) unavailable();
  }
}
function observeChapters() {
  if (!('IntersectionObserver' in window)) return;
  const links = [...document.querySelectorAll('.direction-chapters a')];
  const sections = links.map(link => document.querySelector(link.getAttribute('href'))).filter(Boolean);
  const observer = new IntersectionObserver(entries => {
    const visible = entries.filter(entry => entry.isIntersecting).sort((a,b) => a.boundingClientRect.top - b.boundingClientRect.top);
    if (!visible.length) return;
    const id = visible[0].target.id;
    for (const link of links) {
      if (link.hash === '#' + id) link.setAttribute('aria-current','location');
      else link.removeAttribute('aria-current');
    }
  },{rootMargin:'-15% 0px -65% 0px'});
  for (const section of sections) observer.observe(section);
}

for (const placeholder of document.querySelectorAll('[data-direction-icon]')) placeholder.innerHTML = icon(placeholder.dataset.directionIcon);
renderHero();
renderPrinciples();
renderBoards();
renderIllustrations();
renderAnatomy();
renderVoice();
renderPlaybooks();
$('direction-motion-rules').innerHTML = motion.rules.map(rule => `<li>${esc(rule)}</li>`).join('');
$('direction-reduced-motion-rules').innerHTML = motion.reducedMotion.map(rule => `<li>${esc(rule)}</li>`).join('');
refreshMotionTokens();
watchImages();
observeChapters();
openAnchoredPlaybook();
