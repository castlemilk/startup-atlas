import { escapeHtml as esc } from './logic.js';
import { renderIcon } from './atlas-icons.js';

// Values deliberately live only in design-tokens.css. This catalogue owns names,
// roles and usage guidance; every value and exported snapshot is read at runtime.
export const tokenGroups = [
  {id:'palette', label:'Colour & surfaces', description:'The porcelain canvas, graphite text, cobalt actions and raised faces.'},
  {id:'entity', label:'Entity colours', description:'Named entity kinds, each with a foreground and quiet companion surface.'},
  {id:'status', label:'Research states', description:'Partial and unavailable data remain different from entity kind.'},
  {id:'type', label:'Typography', description:'Display, interface and utility families, with the compact interface scale.'},
  {id:'spacing', label:'Spacing', description:'A shared rhythm from close metadata to generous section separation.'},
  {id:'shape', label:'Shape & depth', description:'Control, row, panel and feature corners, with distinct material shadows.'},
  {id:'layout', label:'Layout', description:'Reference dimensions for the page and graph inspector.'},
  {id:'motion', label:'Motion', description:'Short transitions, with computed durations reflecting reduced motion.'},
  {id:'scrollbar', label:'Scrollbars', description:'One visible, operable baseline for application-owned overflow.'}
];

const definitions = [
  ['ink','palette','colour','Graphite ink','Primary text, strong navigation and the dark header or graph root.'],
  ['action','palette','colour','Action','Primary buttons and source or navigation links.'],
  ['action-hover','palette','colour','Action hover','The hover surface of a primary action; retain its label and geometry.'],
  ['muted','palette','colour','Supporting text','Metadata, supporting copy and placeholders on light surfaces.'],
  ['canvas','palette','colour','Working canvas','The pale background for graph marks and quiet comparison surfaces.'],
  ['paper','palette','colour','Page canvas','The neutral page and evidence canvas; its role remains distinct from the working canvas.'],
  ['surface','palette','colour','Content surface','Content panels, input fields and neutral buttons.'],
  ['border','palette','colour','Quiet border','Separators and panel edges; do not use it as small text.'],
  ['border-strong','palette','colour','Strong border','Stronger structural rules and control boundaries.'],
  ['soft','palette','colour','Soft surface','Grouped controls, hover and quiet selected context.'],
  ['accent','palette','colour','Cobalt accent','Current view, section underline, inspected entity outlines and highlighted profile actions.'],
  ['selection-soft','palette','colour','Selected surface','A pale companion to the cobalt outline; selection also needs a contrasting marker and explicit control state.'],
  ['focus','palette','colour','Keyboard focus','The visible focus outline on light surfaces; it is not an entity category.'],
  ['on-action','palette','colour','On action','Text and icons on dark action or navigation surfaces.'],
  ['face-top','palette','colour','Neutral face top','The light edge of a raised neutral control; use with its bottom face and readable boundary.'],
  ['face-bottom','palette','colour','Neutral face bottom','The lower face of a raised neutral control; check label contrast across the complete gradient.'],
  ['action-top','palette','colour','Primary face top','The upper cobalt face of a primary action, paired with on-action text.'],
  ['action-bottom','palette','colour','Primary face bottom','The lower cobalt face of a primary action; keeps the shallow raised treatment coherent.'],
  ['action-border','palette','colour','Primary boundary','The identifiable boundary of a filled primary action.'],
  ['startup','entity','colour','Startup foreground','Startup labels and marks identify entity kind, not research verification or performance.'],
  ['startup-soft','entity','colour','Startup surface','The pale partner to the startup foreground.'],
  ['partner','entity','colour','Partner foreground','Partner and organisation labels; use the recorded organisation type.'],
  ['partner-soft','entity','colour','Partner surface','The pale partner to the partner foreground.'],
  ['person','entity','colour','Person foreground','People and founder labels, paired with a circular entity mark.'],
  ['person-soft','entity','colour','Person surface','The pale partner to the person foreground.'],
  ['programme','entity','colour','Programme foreground','Programme labels; ochre here is a category, not a warning.'],
  ['programme-soft','entity','colour','Programme surface','The pale partner to the programme foreground.'],
  ['provider','entity','colour','Provider foreground','Provider and platform labels.'],
  ['provider-soft','entity','colour','Provider surface','The pale partner to the provider foreground.'],
  ['warning','status','colour','Partial data foreground','Caution or partial research, always with a specific text explanation.'],
  ['warning-soft','status','colour','Partial data surface','The supporting surface for a recoverable research gap.'],
  ['danger','status','colour','Unavailable foreground','Unavailable or failed research; preserve a useful recovery action.'],
  ['danger-soft','status','colour','Unavailable surface','The supporting surface for an error or unavailable state.'],
  ['font-display','type','family','Display family','Precise sans headings, the wordmark and primary entity names.'],
  ['font-body','type','family','Interface family','Controls, facts, source notes and supporting research content.'],
  ['font-mono','type','family','Utility family','Commands, token names, code, dates and compact comparable annotations.'],
  ['text-xs','type','text','Compact text','Secondary navigation and supplementary coverage notes.'],
  ['text-sm','type','text','Control text','Shared controls and compact metadata.'],
  ['text-md','type','text','Interface text','Standard entity names and interface text.'],
  ['text-lg','type','text','Supporting text','More spacious supporting copy.'],
  ['space-1','spacing','space','Close spacing','The smallest separation for tightly related elements.'],
  ['space-2','spacing','space','Control spacing','Compact gaps within controls and labels.'],
  ['space-3','spacing','space','Compact spacing','Closely grouped controls and metadata.'],
  ['space-4','spacing','space','Standard spacing','Common panel gaps and content rhythm.'],
  ['space-6','spacing','space','Group spacing','Separation between related content groups.'],
  ['space-8','spacing','space','Section spacing','Room between sections within a larger composition.'],
  ['space-12','spacing','space','Editorial spacing','Generous separation for profile and editorial sections.'],
  ['radius-control','shape','radius','Control radius','Buttons, input fields and compact controls.'],
  ['radius-row','shape','radius','Selected row radius','The local shape around an inspected or independently highlighted record.'],
  ['radius-panel','shape','radius','Panel radius','Content panels and visualization containers.'],
  ['radius-feature','shape','radius','Feature radius','Large identity, introductory and feature-art surfaces.'],
  ['shadow-control','shape','shadow','Raised control shadow','A shallow upper highlight and lower lip on an actionable control.'],
  ['shadow-inset','shape','shadow','Inset well shadow','Fields sit slightly inside their surrounding working surface.'],
  ['shadow-pressed','shape','shadow','Pressed control shadow','An inset pressure state; preserve focus and avoid shifting adjacent content.'],
  ['shadow-panel','shape','shadow','Panel shadow','Restrained separation between a working panel and the page canvas.'],
  ['shadow-overlay','shape','shadow','Overlay shadow','Floating context such as an open Select popup; stronger than resting panel depth.'],
  ['page-max','layout','layout','Page maximum','The common outer width across research views; readable text remains bounded within each panel.'],
  ['panel-width','layout','layout','Graph inspector','The graph inspector reference width; the panel stacks on narrow screens.'],
  ['duration-fast','motion','duration','Fast duration','Short colour and surface transitions. Reduced motion resolves this to zero.'],
  ['duration-normal','motion','duration','Normal duration','Short state transitions. Reduced motion resolves this to zero.'],
  ['ease','motion','easing','Interface easing','The shared curve for deliberate interface transitions.'],
  ['scroll-thumb','scrollbar','colour','Scrollbar thumb','The default thumb in application-owned overflow regions.'],
  ['scroll-hover','scrollbar','colour','Scrollbar hover','The thumb while the pointer is over it.'],
  ['scroll-active','scrollbar','colour','Scrollbar active','The thumb during direct interaction.'],
  ['scroll-track','scrollbar','colour','Scrollbar track','The track and inset surrounding the thumb.']
];

export const tokenMetadata = definitions.map(([id,group,kind,label,usage]) => Object.freeze({name:`--atlas-${id}`,group,kind,label,usage}));
const byName = new Map(tokenMetadata.map(token => [token.name,token]));
const colourTokens = tokenMetadata.filter(token => token.kind === 'colour');
const colourNames = new Set(colourTokens.map(token => token.name));
const groupNames = new Set(tokenGroups.map(group => group.id));

/** Parse the opaque hex / sRGB values used by the canonical token sheet. */
export function parseColor(value) {
  const input = String(value || '').trim();
  const hex = input.match(/^#([\da-f]{3}|[\da-f]{6})$/i);
  if (hex) {
    const full = hex[1].length === 3 ? [...hex[1]].map(character => character + character).join('') : hex[1];
    return [0,2,4].map(index => parseInt(full.slice(index,index + 2),16));
  }
  const rgb = input.match(/^rgb\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*\)$/i)
    || input.match(/^rgb\(\s*(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s*\)$/i);
  if (!rgb) return null;
  const channels = rgb.slice(1).map(Number);
  return channels.every(channel => channel >= 0 && channel <= 255) ? channels : null;
}

/** WCAG sRGB relative luminance. Unsupported or non-opaque values return null. */
export function relativeLuminance(value) {
  const channels = Array.isArray(value) ? value : parseColor(value);
  if (!channels || channels.length !== 3 || !channels.every(channel => Number.isFinite(channel) && channel >= 0 && channel <= 255)) return null;
  const linear = channels.map(channel => channel / 255).map(channel => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4);
  return .2126 * linear[0] + .7152 * linear[1] + .0722 * linear[2];
}

export function contrastRatio(foreground,background) {
  const first = relativeLuminance(foreground), second = relativeLuminance(background);
  if (first === null || second === null) return null;
  return (Math.max(first,second) + .05) / (Math.min(first,second) + .05);
}

function normalise(value) {
  return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('en-AU');
}

function readState() {
  const params = new URLSearchParams(location.search);
  return {
    query:(params.get('tokenq') || '').slice(0,160),
    group:groupNames.has(params.get('tokenGroup')) ? params.get('tokenGroup') : 'all',
    foreground:colourNames.has(params.get('foreground')) ? params.get('foreground') : '--atlas-ink',
    background:colourNames.has(params.get('background')) ? params.get('background') : '--atlas-surface'
  };
}

function previewMarkup(token) {
  const name = token.name;
  if (token.kind === 'colour') return `<span class="dt-swatch" style="background:var(${name})" aria-hidden="true"></span>`;
  if (token.kind === 'family') return `<span class="dt-family-sample" style="font-family:var(${name})" aria-hidden="true">Follow a connection.</span>`;
  if (token.kind === 'text') return `<span class="dt-text-sample" style="font-size:var(${name})" aria-hidden="true">A readable label</span>`;
  if (token.kind === 'space') return `<span class="dt-space-sample" aria-hidden="true"><i style="width:var(${name});height:var(${name})"></i></span>`;
  if (token.kind === 'radius') return `<span class="dt-shape-sample" aria-hidden="true"><i style="border-radius:var(${name})"></i></span>`;
  if (token.kind === 'shadow') return `<span class="dt-shape-sample" aria-hidden="true"><i style="box-shadow:var(${name});border-radius:var(--atlas-radius-panel)"></i></span>`;
  if (token.kind === 'layout') return `<span class="dt-layout-sample" aria-hidden="true"><i style="width:min(100%, calc(var(${name}) / 8))"></i><small>Width at 1:8 scale</small></span>`;
  if (token.kind === 'duration') return `<span class="dt-motion-sample" aria-hidden="true">${renderIcon('arrow')}<span>State transition</span></span>`;
  return `<span class="dt-easing-sample" aria-hidden="true"><span>Start</span>${renderIcon('arrow')}<span>Settle</span></span>`;
}

export function mountTokenReference(rootElement) {
  if (!rootElement || rootElement.dataset.tokenReferenceMounted === 'true') return;
  rootElement.dataset.tokenReferenceMounted = 'true';
  rootElement.classList.add('dt-root');
  let state = readState();
  let composing = false;
  let copyAttempt = 0;
  let exportUrls = [];
  let values = new Map();
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const openGroups = new Set(['palette']);
  const $ = id => rootElement.querySelector('#'+id);
  const colourOptions = colourTokens.map(token => `<option value="${token.name}">${esc(token.label)}</option>`).join('');
  rootElement.innerHTML = `
    <div class="dt-intro"><p>Each value below comes from the stylesheet running this page. Choose a role, inspect its application, then copy a token into your component.</p><a href="./design-tokens.css" download>Canonical CSS ${renderIcon('download')}</a></div>
    <section class="dt-contrast" aria-labelledby="contrast-heading">
      <div class="dt-contrast-heading"><div><h3 id="contrast-heading">Put a colour pair to work.</h3><p>Compare text, symbols and their immediate background.</p></div><span class="dt-contrast-kicker">Contrast check</span></div>
      <div class="dt-contrast-controls"><div class="dt-field"><label for="contrast-foreground">Foreground</label><select id="contrast-foreground">${colourOptions}</select></div><button type="button" class="atlas-button dt-swap" id="contrast-swap" aria-label="Swap foreground and background">${renderIcon('reset')}<span>Swap</span></button><div class="dt-field"><label for="contrast-background">Background</label><select id="contrast-background">${colourOptions}</select></div></div>
      <div class="dt-contrast-layout"><div class="dt-contrast-sample" id="contrast-sample" aria-hidden="true"><div class="dt-sample-mark">${renderIcon('graph',{size:32})}<span>Startup Atlas</span></div><p class="dt-sample-heading">Follow the evidence.</p><p class="dt-sample-body">A useful connection has a source. Keep the name, the relationship and the evidence together.</p><span class="dt-sample-rule"></span><span class="dt-sample-label">Text &amp; interface mark</span></div><div class="dt-contrast-result" aria-live="polite" aria-atomic="true"><p class="dt-ratio" id="contrast-ratio"></p><p id="contrast-pair" class="dt-pair"></p><ul class="dt-checks"><li id="contrast-normal"></li><li id="contrast-large"></li><li id="contrast-ui"></li></ul></div></div>
      <p class="dt-note" id="contrast-note">Normal text needs 4.5:1. Large text needs 3:1: at least 24 CSS px, or approximately 18.667 CSS px when bold. Meaningful interface marks need 3:1 against adjacent colours. Thresholds use the unrounded ratio. This checks an opaque colour pair, not the complete component or page.</p>
      <p class="dt-source-links"><a href="https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html" target="_blank" rel="noreferrer">W3C text contrast ${renderIcon('external')}</a><a href="https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html" target="_blank" rel="noreferrer">W3C non-text contrast ${renderIcon('external')}</a></p>
    </section>
    <div class="dt-catalogue-heading"><div><h3>Find the right token.</h3><p>Roles stay distinct even when two values happen to match.</p></div><div class="dt-export-actions"><a class="atlas-button" id="token-export-json" download="atlas-tokens-runtime.json">All tokens · JSON ${renderIcon('download')}</a><a class="atlas-button" id="token-export-css" download="atlas-tokens-runtime.css">All tokens · CSS ${renderIcon('download')}</a></div></div>
    <div class="dt-token-controls"><div class="dt-field dt-search-field"><label for="token-search">Search tokens</label><div class="atlas-search-control"><input type="search" id="token-search" autocomplete="off" spellcheck="false" maxlength="160" placeholder="Try focus, spacing or an exact token"><button type="button" id="token-clear" class="atlas-clear" data-atlas-clear-for="token-search" aria-label="Clear token search" hidden>${renderIcon('close')}</button></div></div><div class="dt-field"><label for="token-group">Token family</label><select id="token-group"><option value="all">All families</option>${tokenGroups.map(group=>`<option value="${group.id}">${esc(group.label)}</option>`).join('')}</select></div></div>
    <div class="dt-results-bar"><p id="token-count" role="status" aria-live="polite"></p><button type="button" class="dt-text-button" id="token-expand" aria-expanded="false" aria-controls="token-grid">Expand all families</button></div>
    <p class="dt-runtime-note" id="token-runtime-note"></p>
    <div id="token-grid" class="dt-token-groups"></div>
    <div id="token-empty" class="atlas-empty" hidden><h4>No tokens match these filters.</h4><p>Search a name or usage, or return to the complete reference.</p><button class="atlas-button" id="token-reset" type="button">Reset token filters</button></div>
    <div class="dt-feedback-area"><p id="token-feedback" class="dt-feedback" role="status" aria-live="polite" aria-atomic="true">Choose Name, Value or CSS beside a token to copy it.</p><div id="token-copy-fallback" hidden><label for="token-fallback-code">Copy this token manually</label><textarea id="token-fallback-code" readonly rows="3" spellcheck="false" style="resize:none"></textarea><button type="button" id="token-fallback-close" class="dt-text-button">Close copy fallback</button></div></div>
    <p class="dt-note">Both exports include all ${tokenMetadata.length} canonical tokens, regardless of these filters. They are snapshots of the current computed values, including the motion preference. Use <a href="./design-tokens.css" download>the canonical stylesheet</a> for the maintained definitions and reduced-motion rules. <a href="./docs/TOKENS.md">Read the token handoff</a>.</p>`;

  function readValues() {
    const computed = getComputedStyle(document.documentElement);
    values = new Map(tokenMetadata.map(token => [token.name,computed.getPropertyValue(token.name).trim()]));
  }

  function syncUrl(mode = 'replace') {
    const url = new URL(location.href);
    const entries = {tokenq:state.query,tokenGroup:state.group === 'all' ? '' : state.group,foreground:state.foreground === '--atlas-ink' ? '' : state.foreground,background:state.background === '--atlas-surface' ? '' : state.background};
    for (const [key,value] of Object.entries(entries)) if (value) url.searchParams.set(key,value); else url.searchParams.delete(key);
    const next = url.pathname + url.search + url.hash;
    if (next !== location.pathname + location.search + location.hash) history[mode === 'push' ? 'pushState' : 'replaceState'](null,'',next);
  }

  function renderExports() {
    const snapshot = {
      name:'Startup Atlas runtime tokens',
      source:'web/design-tokens.css',
      scope:'All canonical --atlas tokens; compatibility aliases are excluded.',
      reducedMotion:reducedMotion.matches,
      tokens:Object.fromEntries(tokenMetadata.map(token => [token.name,{value:values.get(token.name),group:token.group,type:token.kind,usage:token.usage}]))
    };
    const css = `/* Startup Atlas: computed runtime snapshot, not the canonical stylesheet.\n * All ${tokenMetadata.length} canonical tokens. Reduced motion: ${reducedMotion.matches ? 'active' : 'inactive'}.\n * Canonical definitions and media rules: design-tokens.css\n */\n:root {\n${tokenMetadata.map(token => `  ${token.name}: ${values.get(token.name)};`).join('\n')}\n}\n`;
    for (const url of exportUrls) URL.revokeObjectURL(url);
    exportUrls = [URL.createObjectURL(new Blob([JSON.stringify(snapshot,null,2)+'\n'],{type:'application/json'})),URL.createObjectURL(new Blob([css],{type:'text/css'}))];
    $('token-export-json').href = exportUrls[0];
    $('token-export-css').href = exportUrls[1];
    $('token-runtime-note').textContent = reducedMotion.matches ? 'Reduced motion is active. The live duration tokens and exports resolve to 0ms; every final state remains available.' : 'Live values are read from canonical CSS. Reduced motion changes duration values automatically; exports include the current preference.';
    $('token-runtime-note').dataset.reduced = String(reducedMotion.matches);
  }

  function renderContrast() {
    $('contrast-foreground').value = state.foreground;
    $('contrast-background').value = state.background;
    const foreground = values.get(state.foreground), background = values.get(state.background);
    const ratio = contrastRatio(foreground,background);
    const sample = $('contrast-sample');
    sample.style.setProperty('--dt-foreground',`var(${state.foreground})`);
    sample.style.setProperty('--dt-background',`var(${state.background})`);
    sample.dataset.foreground = state.foreground;
    sample.dataset.background = state.background;
    $('contrast-pair').textContent = `${byName.get(state.foreground).label} ${foreground} on ${byName.get(state.background).label.toLocaleLowerCase('en-AU')} ${background}`;
    $('contrast-ratio').textContent = ratio === null ? 'Unavailable' : `${ratio.toFixed(2)}:1`;
    $('contrast-ratio').dataset.ratio = ratio === null ? '' : String(ratio);
    for (const [id,label,threshold] of [['normal','Normal text',4.5],['large','Large text',3],['ui','Meaningful marks',3]]) {
      const result = $('contrast-'+id), pass = ratio !== null && ratio >= threshold;
      result.dataset.pass = String(pass);
      result.innerHTML = `<span>${label}</span><strong>${ratio === null ? 'Not evaluated' : pass ? 'Meets' : 'Below'} ${threshold}:1</strong>`;
    }
  }

  function updateExpandLabel() {
    const disclosures = [...$('token-grid').querySelectorAll('.dt-token-family')];
    const allOpen = disclosures.length > 0 && disclosures.every(detail => detail.open);
    $('token-expand').textContent = allOpen ? 'Collapse all families' : 'Expand all families';
    $('token-expand').setAttribute('aria-expanded',String(allOpen));
    $('token-expand').hidden = disclosures.length === 0;
  }

  function renderCatalogue() {
    // A rebuilt catalogue no longer owns an earlier copy interaction. A delayed
    // permission response must not restore old feedback or take focus from search.
    ++copyAttempt;
    $('token-copy-fallback').hidden = true;
    $('token-fallback-code').value = '';
    $('token-feedback').dataset.tone = '';
    $('token-feedback').textContent = 'Choose Name, Value or CSS beside a token to copy it.';
    const terms = normalise(state.query).trim().split(/\s+/).filter(Boolean);
    const filtered = tokenMetadata.filter(token => (state.group === 'all' || token.group === state.group) && terms.every(term => normalise(`${token.name} ${token.label} ${token.usage} ${token.group}`).includes(term)));
    $('token-search').value = state.query;
    $('token-clear').hidden = !state.query;
    $('token-group').value = state.group;
    $('token-count').textContent = `${filtered.length} of ${tokenMetadata.length} tokens`;
    $('token-empty').hidden = filtered.length > 0;
    $('token-grid').hidden = !filtered.length;
    $('token-grid').innerHTML = tokenGroups.map(group => {
      const members = filtered.filter(token => token.group === group.id);
      if (!members.length) return '';
      const open = terms.length > 0 || state.group !== 'all' || openGroups.has(group.id);
      return `<details class="dt-token-family" data-token-group="${group.id}"${open ? ' open' : ''}><summary><span><strong>${esc(group.label)}</strong><small>${esc(group.description)}</small></span><span class="dt-family-count">${members.length}</span></summary><div class="dt-token-grid">${members.map(token => `<article class="dt-token-card" data-token="${token.name}" data-token-kind="${token.kind}"><div class="dt-token-preview">${previewMarkup(token)}</div><div class="dt-token-copy"><h4>${esc(token.label)}</h4><code class="dt-token-name"><a href="./design-tokens.css" aria-label="${token.name} in the canonical stylesheet">${token.name}</a></code><code class="dt-token-value">${esc(values.get(token.name) || 'Not defined')}</code><p>${esc(token.usage)}</p><div class="dt-copy-actions" role="group" aria-label="Copy ${esc(token.label)} token">${['name','value','css'].map(kind=>`<button type="button" data-token-copy="${kind}" data-token-name="${token.name}" aria-label="Copy ${kind === 'css' ? 'CSS declaration for' : kind+' of'} ${token.name}">${kind === 'css' ? 'CSS' : kind[0].toUpperCase()+kind.slice(1)} ${renderIcon('copy')}</button>`).join('')}</div><span class="dt-token-feedback"></span></div></article>`).join('')}</div></details>`;
    }).join('');
    for (const details of $('token-grid').querySelectorAll('.dt-token-family')) details.addEventListener('toggle',() => {
      if (details.open) openGroups.add(details.dataset.tokenGroup); else openGroups.delete(details.dataset.tokenGroup);
      updateExpandLabel();
    });
    updateExpandLabel();
  }

  function updateSearch(event) {
    if (composing || event?.isComposing) return;
    state.query = $('token-search').value.slice(0,160);
    renderCatalogue(); syncUrl();
  }

  async function copyToken(button) {
    const name = button.dataset.tokenName, kind = button.dataset.tokenCopy;
    if (!byName.has(name) || !['name','value','css'].includes(kind)) return;
    const computed = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    const value = kind === 'name' ? name : kind === 'value' ? computed : `${name}: ${computed};`;
    const attempt = ++copyAttempt;
    for (const feedback of rootElement.querySelectorAll('.dt-token-feedback')) feedback.textContent = '';
    const localFeedback = button.closest('[data-token]').querySelector('.dt-token-feedback');
    const copyLabel = kind === 'css' ? 'CSS' : kind[0].toUpperCase()+kind.slice(1);
    localFeedback.textContent = `Copying ${copyLabel.toLocaleLowerCase('en-AU')}…`;
    $('token-copy-fallback').hidden = true;
    $('token-feedback').dataset.tone = '';
    $('token-feedback').textContent = `Copying ${name} ${kind === 'css' ? 'CSS declaration' : kind}…`;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(value);
      if (attempt !== copyAttempt || !button.isConnected || !rootElement.contains(button)) return;
      localFeedback.textContent = `${copyLabel} copied.`;
      $('token-feedback').dataset.tone = 'success';
      $('token-feedback').textContent = `${name} ${kind === 'css' ? 'CSS declaration' : kind} copied.`;
    } catch {
      if (attempt !== copyAttempt || !button.isConnected || !rootElement.contains(button)) return;
      localFeedback.textContent = 'Manual copy is available below.';
      $('token-feedback').dataset.tone = 'error';
      $('token-feedback').textContent = 'The clipboard is unavailable. Select and copy the token below.';
      $('token-copy-fallback').hidden = false;
      $('token-fallback-code').value = value;
      $('token-fallback-code').focus(); $('token-fallback-code').select();
    }
  }

  $('token-search').addEventListener('compositionstart',() => {composing = true;});
  $('token-search').addEventListener('compositionend',event => {composing = false; updateSearch(event);});
  $('token-search').addEventListener('input',updateSearch);
  // The shared Atlas clear handler clears, dispatches input and restores focus.
  // Reset the composition guard first so a deliberate clear always applies.
  $('token-clear').addEventListener('click',() => {composing = false;});
  $('token-search').addEventListener('keydown',event => {if (event.key === 'Enter' && !event.isComposing && !composing) {event.preventDefault(); updateSearch();}});
  $('token-group').addEventListener('change',event => {state.group = groupNames.has(event.target.value) ? event.target.value : 'all'; renderCatalogue(); syncUrl('push');});
  $('token-reset').addEventListener('click',() => {composing = false; state.query = ''; state.group = 'all'; renderCatalogue(); syncUrl(); $('token-search').focus();});
  $('token-expand').addEventListener('click',() => {
    const details = [...$('token-grid').querySelectorAll('.dt-token-family')];
    const next = !details.every(item => item.open);
    for (const item of details) {item.open = next; if (next) openGroups.add(item.dataset.tokenGroup); else openGroups.delete(item.dataset.tokenGroup);}
    updateExpandLabel();
  });
  for (const channel of ['foreground','background']) $('contrast-'+channel).addEventListener('change',event => {
    if (!colourNames.has(event.target.value)) return;
    state[channel] = event.target.value; renderContrast(); syncUrl('push');
  });
  $('contrast-swap').addEventListener('click',() => {
    [state.foreground,state.background] = [state.background,state.foreground]; renderContrast(); syncUrl('push');
  });
  $('token-fallback-close').addEventListener('click',() => {
    ++copyAttempt; $('token-copy-fallback').hidden = true;
    $('token-feedback').dataset.tone = '';
    $('token-feedback').textContent = 'Choose Name, Value or CSS beside a token to copy it.';
    $('token-search').focus();
  });
  rootElement.addEventListener('click',event => {
    const button = event.target.closest('[data-token-copy]');
    if (button && rootElement.contains(button)) copyToken(button);
  });
  window.addEventListener('popstate',() => {state = readState(); composing = false; renderCatalogue(); renderContrast();});
  reducedMotion.addEventListener('change',() => {
    ++copyAttempt; readValues(); renderCatalogue(); renderContrast(); renderExports();
    $('token-copy-fallback').hidden = true;
    $('token-feedback').dataset.tone = '';
    $('token-feedback').textContent = 'Runtime values updated for the motion preference.';
  });
  readValues(); renderCatalogue(); renderContrast(); renderExports();
  return {refresh() {readValues(); renderCatalogue(); renderContrast(); renderExports();}};
}
