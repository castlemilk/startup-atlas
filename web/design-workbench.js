import { escapeHtml as esc } from './logic.js';
import { entityBadge, icon, renderEntityRow, renderViewNavigation } from './atlas-ui.js';
import { componentCategories, componentSpecs, componentSpecById, resolveComponentState, filterComponentSpecs } from './design-component-specs.js';

const fixtureNames = ['Aster Labs','Maya Chen','Northbank Ventures'];
const rowFixtures = {
  startup:{id:'startup:aster-labs',name:'Aster Labs',kind:'startup',summary:'Fictional tools for collecting and comparing field observations.'},
  person:{id:'person:maya-chen',name:'Maya Chen',kind:'person',summary:'Fictional founder of Aster Labs. This is a component specimen.'},
  partner:{id:'partner:northbank',name:'Northbank Ventures',kind:'partner',summary:'Fictional organisation used to demonstrate a researched-company row.'},
  long:{id:'startup:aster-observatory',name:'Aster Observatory for Environmental Research and Field Systems',kind:'startup',summary:'A deliberately long fictional name tests wrapping, reading order and accessible link text.'},
  missing:{id:'startup:aster-labs',name:'Aster Labs',kind:'startup',summary:''}
};

function sourceNote(id, title = 'Read the fictional source note', open = false) {
  return `<details class="dc-disclosure" id="${id}"${open ? ' open' : ''}><summary>${icon('source')}${title}</summary><div class="dc-disclosure-content"><strong>Fictional company announcement</strong><p>This note is authored only to demonstrate the evidence layout. It is not a citation or a record in the Atlas dataset.</p><dl class="dc-note-dates"><div><dt>Example event date</dt><dd>12 January 2026</dd></div><div><dt>Example review date</dt><dd>15 January 2026</dd></div></dl></div></details>`;
}

function renderActions(variant) {
  const unavailable = variant !== 'ready';
  return `<div class="dc-demo-stack"><div class="dc-demo-actions"><button type="button" class="atlas-button atlas-button-primary" id="dc-demo-action" aria-pressed="false" aria-controls="dc-action-detail"${unavailable ? ' disabled' : ''}${variant === 'busy' ? ' aria-busy="true"' : ''}>${icon('graph')}Inspect specimen</button><button type="button" class="atlas-button" data-dc-reset-action${unavailable ? ' disabled' : ''}>Reset selection</button><button type="button" class="atlas-button" disabled aria-describedby="dc-action-limit">Compare · planned</button></div><p class="atlas-coverage" id="dc-action-limit">Comparison is a planned capability, so its specimen is unavailable.${variant === 'disabled' ? ' Inspection is also disabled in this variant.' : variant === 'busy' ? ' The primary control demonstrates a busy state; no request is running.' : ''}</p><div class="dc-inline-note" id="dc-action-detail" hidden><strong>Aster Labs selected</strong><p>This local inspection note is the entire action. No research data changed.</p></div><p class="dc-demo-status" id="dc-action-status" role="status">${variant === 'busy' ? 'Busy-state specimen. Control dimensions remain unchanged.' : variant === 'disabled' ? 'Unavailable-state specimen. The controls cannot run.' : 'Select Inspect specimen to reveal a local note.'}</p></div>`;
}

function renderBadge(variant) {
  const labels = {startup:'Aster Labs',person:'Maya Chen',partner:'Northbank Ventures',provider:'Fieldwork Cloud',programme:'First Field Programme'};
  return `<div class="dc-demo-identity"><span class="dc-demo-initials" aria-hidden="true">${esc(labels[variant].split(' ').slice(0,2).map(part=>part[0]).join(''))}</span><div><h4>${esc(labels[variant])}</h4>${entityBadge(variant)}<p class="atlas-coverage">Fictional identity · the badge describes kind only</p></div></div>`;
}

function renderRow(variant) {
  const item = rowFixtures[variant];
  const markup = renderEntityRow(item,variant === 'missing' ? null : 3)
    .replace(/href="(?:\.\/entity\.html\?[^"\s]*|\.\/partner\.html\?[^"\s]*)"/g,'href="#dc-row-profile" data-dc-local="profile"')
    .replace(/href="\.\/graph\.html\?[^"\s]*"/g,'href="#dc-row-connections" data-dc-local="connections"')
    .replace(`aria-label="Explore ${esc(item.name)} connections"`,`aria-label="Inspect ${esc(item.name)} fictional connections"`)
    .replace(/>Graph (<svg)/,'>Connections $1');
  return `<div class="dc-row-stage">${markup}<details class="dc-disclosure" id="dc-row-details"><summary>Fictional detail preview</summary><div class="dc-disclosure-content"><h4 id="dc-row-profile" tabindex="-1">${esc(item.name)}</h4><p>This identity exists only in the component catalogue. The profile link opens this local detail.</p><h4 id="dc-row-connections" tabindex="-1">Specimen connections</h4><p>${variant === 'missing' ? 'Connections have not been researched in this specimen. The count remains unknown.' : 'Three fictional connections demonstrate the count treatment. They are not Atlas research records.'}</p></div></details></div>`;
}

function renderSearch(variant) {
  const query = variant === 'filtered' ? 'Aster' : variant === 'empty' ? 'unmatched' : '';
  return `<div class="dc-demo-search"><label class="dc-field-label" for="dc-demo-search">Search fictional entities</label><div class="atlas-search-control"><input id="dc-demo-search" type="search" value="${query}" placeholder="Try Aster or Maya" autocomplete="off" maxlength="80" aria-describedby="dc-demo-search-count"><button type="button" class="atlas-clear" data-atlas-clear-for="dc-demo-search" aria-label="Clear fictional entity search"${query ? '' : ' hidden'}>${icon('close')}</button></div><p class="atlas-coverage" id="dc-demo-search-count" role="status"></p><ul class="dc-search-results" id="dc-demo-search-results"></ul><p class="dc-search-empty" id="dc-demo-search-empty" hidden>No fictional entities match. Clear the search or try another name.</p></div>`;
}

function renderClaim(variant) {
  const unknown = variant === 'unknown';
  return `<div class="dc-claim"><span class="dc-small-label">Fictional funding announcement</span><dl><dt>Recorded amount</dt><dd>${unknown ? 'Not recorded' : 'USD 2,400,000'}</dd></dl><p class="dc-claim-context">${unknown ? 'The amount has not been recorded in this specimen. It is excluded from comparable funding totals.' : variant === 'historical' ? 'Announced 12 January 2020. This historic observation is not a current valuation.' : 'Announced 12 January 2026. The amount describes this one fictional announcement.'}</p><p class="atlas-coverage"><strong>${unknown ? '2 of 3' : '3 of 3'}</strong> fictional companies have a comparable USD amount.${unknown ? ' One unknown amount is excluded.' : ''}</p>${sourceNote('dc-claim-source','Read the presentation note')}</div>`;
}

function renderRelationship(variant) {
  if (variant === 'unknown') return `<div class="atlas-empty"><h4>No connection recorded.</h4><p>Aster Labs and Northbank Ventures are fictional examples. Without a source-backed predicate, their proximity would not establish a relationship.</p><span class="atlas-badge" data-tone="warning">Unresearched</span></div>`;
  const founded = variant === 'founded';
  return `<div class="dc-relationship"><div class="dc-relationship-line"><div><strong>${founded ? 'Maya Chen' : 'Aster Labs'}</strong>${entityBadge(founded ? 'person' : 'startup')}</div><span class="dc-predicate">${founded ? 'founded' : 'listed in portfolio of'}${icon('arrow')}</span><div><strong>${founded ? 'Aster Labs' : 'Northbank Ventures'}</strong>${entityBadge(founded ? 'startup' : 'partner')}</div></div><p class="atlas-coverage">${founded ? 'Fictional founder connection. The named predicate describes the relationship.' : 'Fictional portfolio listing. It does not establish a round investment, amount or date.'}</p>${sourceNote('dc-relationship-source')}</div>`;
}

function renderStatus(variant) {
  const content = {
    ready:'<h4 id="dc-ready-heading" tabindex="-1">The specimen is ready.</h4><p>The fictional company profile and its three example connections are available.</p><span class="atlas-badge" data-kind="startup">Fictional research</span>',
    loading:'<h4>Loading the research snapshot…</h4><p>The content region keeps its space while the route loads. This is a static state specimen; no request is running.</p><span class="atlas-coverage">Loading-state specimen</span>',
    empty:'<h4>No companies match this search.</h4><p>The dataset is available. Clear the local specimen filters to restore its ready state.</p><button class="atlas-button" type="button" data-dc-recover>Clear specimen filters</button>',
    partial:'<h4>Some research is unavailable.</h4><p>The fictional profile remains available, but its company sample could not be loaded. Unavailable data does not mean zero companies.</p><span class="atlas-badge" data-tone="warning">Partial data</span><button class="atlas-button" type="button" data-dc-recover>Restore specimen</button>',
    error:'<h4>The research snapshot is unavailable.</h4><p>Keep the exploration context and provide a reachable way to recover. This control restores the local specimen.</p><button class="atlas-button" type="button" data-dc-recover>Retry specimen</button>'
  };
  return `<div class="dc-state-frame"><div class="atlas-empty"${variant === 'loading' ? ' aria-busy="true"' : ''}>${content[variant]}</div></div>`;
}

function previewMarkup(component,variant) {
  switch(component) {
    case 'actions': return renderActions(variant);
    case 'badge': return renderBadge(variant);
    case 'entity-row': return renderRow(variant);
    case 'search': return renderSearch(variant);
    case 'source': return `<div class="dc-demo-stack"><div class="dc-source-claim"><span class="dc-small-label">Fictional company fact</span><h4>Aster Labs was founded in 2024.</h4><p>The source note states what would need to be verified before publishing this claim.</p></div>${sourceNote('dc-source-disclosure','Inspect the source context',variant === 'expanded')}</div>`;
    case 'claim': return renderClaim(variant);
    case 'relationship': return renderRelationship(variant);
    case 'status': return renderStatus(variant);
    case 'navigation': return `<div class="dc-demo-navigation">${renderViewNavigation(variant)}<p class="atlas-coverage">Live route links · ${variant === 'directory' ? 'List & search' : variant === 'treemap' ? 'Treemap' : 'Graph'} is the current-view treatment in this specimen.</p></div>`;
    default: return '';
  }
}

/** Mount one catalogue in a page that already loads the canonical Atlas styles. */
export function mountComponentWorkbench(root) {
  if (!root || root.dataset.componentReady === 'true') return;
  root.classList.add('dc-workbench');
  root.innerHTML = `<div class="dc-toolbar"><div class="dc-search-field"><label for="component-search">Find a component</label><div class="atlas-search-control"><input id="component-search" type="search" placeholder="Try evidence, identity or loading" autocomplete="off" maxlength="160"><button id="component-clear" class="atlas-clear" type="button" data-atlas-clear-for="component-search" aria-label="Clear component search" hidden>${icon('close')}</button></div></div><div class="dc-category-field"><label for="component-category">Category</label><select id="component-category"><option value="all">All components</option>${componentCategories.map(category=>`<option value="${category.id}">${category.label}</option>`).join('')}</select></div><p id="component-count" class="atlas-coverage" role="status"></p></div><div class="dc-workspace"><aside class="dc-browser" aria-label="Component catalogue"><div id="component-list" class="dc-component-list"></div><div class="dc-no-results" id="component-empty" hidden><p>No components match these filters.</p><button type="button" class="atlas-button" id="component-reset">Reset filters</button></div></aside><div class="dc-inspector"><div class="dc-component-heading"><div><span class="dc-component-status" id="component-status"></span><h3 id="component-title" tabindex="-1"></h3></div><div class="dc-variant-control"><label for="component-variant">Variant</label><select id="component-variant"></select></div></div><p class="dc-description" id="component-description"></p><p id="component-selection-context" class="atlas-coverage" hidden></p><div class="dc-preview-header"><span>Live specimen</span><span>Fictional data · safe to explore</span></div><div class="dc-preview" id="component-preview"></div><p class="dc-specimen-feedback" id="component-specimen-feedback" role="status" aria-live="polite"></p><div class="dc-guidance"><div><h4>Use it for</h4><p id="component-use"></p></div><div><h4>Keep this boundary</h4><p id="component-avoid"></p></div><div><h4>Keyboard &amp; access</h4><p id="component-keyboard"></p></div></div><div class="dc-owner"><h4>Implementation owner</h4><div id="component-owners"></div><p id="component-integration"></p></div><details class="dc-code-disclosure" id="component-code-details"><summary>${icon('source')}Preview markup</summary><div class="dc-code-content"><div class="dc-code-actions"><button type="button" class="atlas-button" id="component-copy">${icon('copy')}Copy HTML</button><a class="atlas-button" id="component-download" download="atlas-actions-ready.html">${icon('download')}Download markup</a></div><p class="atlas-coverage">The markup follows the current preview. Load the Atlas styles and implement the documented behaviour owner when reusing it.</p><pre class="dc-code"><code id="component-code"></code></pre><p id="component-feedback" class="dc-copy-feedback" role="status" aria-live="polite"></p><div id="component-copy-fallback" hidden><label for="component-copy-text">Select and copy the HTML</label><textarea id="component-copy-text" readonly rows="10" spellcheck="false"></textarea></div></div></details></div></div>`;
  const $ = id => root.querySelector('#'+id);
  let state = resolveComponentState(new URLSearchParams(location.search));
  let catalogueComposing = false, specimenComposing = false, copySequence = 0, code = '', downloadUrl = '';
  const preview = $('component-preview');

  function writeUrl(push = false) {
    const url = new URL(location.href);
    for (const [key,value] of [['component',state.component === 'actions' ? '' : state.component],['componentq',state.query],['componentKind',state.category === 'all' ? '' : state.category],['variant',state.variant === componentSpecById[state.component].variants[0][0] ? '' : state.variant]]) {
      if (value) url.searchParams.set(key,value); else url.searchParams.delete(key);
    }
    const next = url.pathname+url.search+url.hash;
    if (next !== location.pathname+location.search+location.hash) history[push ? 'pushState' : 'replaceState'](null,'',next);
  }

  function syncCode() {
    const next = preview.innerHTML.trim();
    if (next === code) return;
    code = next;
    copySequence += 1;
    $('component-code').textContent = code;
    $('component-copy-text').value = code;
    $('component-feedback').textContent = '';
    $('component-copy-fallback').hidden = true;
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    const record = componentSpecById[state.component];
    const header = `<!-- Atlas component specimen: ${record.label} / ${state.variant}\nFictional demonstration only. Requires styles.css, field-atlas.css, design-tokens.css, atlas-ui.css and design-workbench.css.\nMarkup only; see docs/COMPONENTS.md for the behaviour owner. -->\n`;
    downloadUrl = URL.createObjectURL(new Blob([header,code,'\n'],{type:'text/html;charset=utf-8'}));
    $('component-download').href = downloadUrl;
    $('component-download').download = `atlas-${state.component}-${state.variant}.html`;
  }

  function renderList() {
    const records = filterComponentSpecs(state.query,state.category);
    $('component-count').textContent = `${records.length} of ${componentSpecs.length} components`;
    $('component-list').innerHTML = records.map(record=>`<button type="button" class="dc-component-choice" data-component="${record.id}" aria-pressed="${record.id === state.component}"><span class="dc-choice-icon">${icon(record.glyph)}</span><span><strong>${record.label}</strong><small>${record.summary}</small></span>${record.id === state.component ? `<span class="dc-choice-selected" aria-hidden="true">${icon('check')}</span>` : ''}</button>`).join('');
    $('component-empty').hidden = records.length > 0;
    $('component-clear').hidden = !state.query;
    const selectedVisible = records.some(record=>record.id===state.component);
    $('component-selection-context').hidden = selectedVisible;
    $('component-selection-context').textContent = selectedVisible ? '' : `${componentSpecById[state.component].label} remains selected while the catalogue is filtered.`;
  }

  function updateSearchSpecimen() {
    const input = $('dc-demo-search');
    if (!input) return;
    const query = input.value.trim().toLocaleLowerCase('en-AU');
    const matches = fixtureNames.filter(name=>name.toLocaleLowerCase('en-AU').includes(query));
    input.setAttribute('value',input.value);
    $('dc-demo-search-count').textContent = `${matches.length} of ${fixtureNames.length} fictional entities`;
    $('dc-demo-search-results').innerHTML = matches.map(name=>`<li>${esc(name)}<span>Fictional specimen</span></li>`).join('');
    $('dc-demo-search-empty').hidden = matches.length > 0;
    preview.querySelector('[data-atlas-clear-for="dc-demo-search"]').hidden = !input.value;
    syncCode();
  }

  function renderSelection({announce=false,focus=false} = {}) {
    specimenComposing = false;
    const record = componentSpecById[state.component];
    $('component-status').textContent = record.status;
    $('component-title').textContent = record.label;
    $('component-description').textContent = record.description;
    $('component-variant').innerHTML = record.variants.map(([id,label])=>`<option value="${id}"${id===state.variant?' selected':''}>${label}</option>`).join('');
    for (const key of ['use','avoid','keyboard','integration']) $('component-'+key).textContent = record[key];
    $('component-owners').innerHTML = record.owners.map(([file,label])=>`<a href="./${file}"><code>${file}</code><span>${label}</span></a>`).join('');
    preview.dataset.component = state.component;
    preview.dataset.variant = state.variant;
    preview.innerHTML = previewMarkup(state.component,state.variant);
    if (state.component === 'search') updateSearchSpecimen();
    renderList();
    syncCode();
    $('component-specimen-feedback').textContent = announce ? `${record.label}: ${record.variants.find(([id])=>id===state.variant)[1]} specimen.` : '';
    if (focus) $('component-title').focus({preventScroll:true});
  }

  function selectVariant(variant, options = {}) {
    if (!componentSpecById[state.component].variants.some(([id])=>id===variant)) return;
    state.variant = variant;
    writeUrl(true);
    renderSelection({announce:true,...options});
  }

  root.addEventListener('click',event=>{
    if (event.target.closest('#component-clear')) catalogueComposing = false;
    if (event.target.closest('[data-atlas-clear-for="dc-demo-search"]')) specimenComposing = false;
    const choice = event.target.closest('[data-component]');
    if (choice?.classList.contains('dc-component-choice')) {
      state.component = choice.dataset.component;
      state.variant = componentSpecById[state.component].variants[0][0];
      writeUrl(true);
      const narrow = matchMedia('(max-width: 780px)').matches;
      renderSelection({announce:true,focus:narrow});
      if (narrow) $('component-title').scrollIntoView({block:'nearest',behavior:'instant'});
      else root.querySelector(`[data-component="${state.component}"].dc-component-choice`)?.focus({preventScroll:true});
    }
    if (event.target.closest('#component-reset')) {
      state.query='';state.category='all';$('component-search').value='';$('component-category').value='all';writeUrl();renderList();$('component-search').focus();
    }
    if (event.target.closest('#dc-demo-action') && !$('dc-demo-action').disabled) {
      const button=$('dc-demo-action'),selected=button.getAttribute('aria-pressed')!=='true';
      button.setAttribute('aria-pressed',String(selected));$('dc-action-detail').hidden=!selected;
      $('dc-action-status').textContent=selected?'Aster Labs is selected in this local specimen.':'The local selection is cleared.';
      syncCode();
    }
    if (event.target.closest('[data-dc-reset-action]') && !event.target.closest('[data-dc-reset-action]').disabled) {
      $('dc-demo-action').setAttribute('aria-pressed','false');$('dc-action-detail').hidden=true;$('dc-action-status').textContent='The local selection is cleared.';syncCode();
    }
    const localLink=event.target.closest('[data-dc-local]');
    if (localLink) { event.preventDefault();$('dc-row-details').open=true;$(localLink.dataset.dcLocal==='profile'?'dc-row-profile':'dc-row-connections').focus();syncCode(); }
    if (event.target.closest('[data-dc-recover]')) { selectVariant('ready');$('dc-ready-heading').focus({preventScroll:true}); }
  });
  $('component-search').addEventListener('compositionstart',()=>{catalogueComposing=true;});
  $('component-search').addEventListener('compositionend',()=>{catalogueComposing=false;state.query=$('component-search').value.slice(0,160);writeUrl();renderList();});
  $('component-search').addEventListener('input',event=>{if(catalogueComposing||event.isComposing)return;state.query=event.target.value.slice(0,160);writeUrl();renderList();});
  $('component-category').addEventListener('change',event=>{state.category=event.target.value;writeUrl();renderList();});
  $('component-variant').addEventListener('change',event=>selectVariant(event.target.value));
  preview.addEventListener('compositionstart',event=>{if(event.target.id==='dc-demo-search')specimenComposing=true;});
  preview.addEventListener('compositionend',event=>{if(event.target.id==='dc-demo-search'){specimenComposing=false;updateSearchSpecimen();}});
  preview.addEventListener('input',event=>{if(event.target.id==='dc-demo-search'&&!specimenComposing&&!event.isComposing)updateSearchSpecimen();});
  preview.addEventListener('toggle',event=>{
    // A queued toggle from a removed specimen must not change a newer selection.
    if (!preview.contains(event.target)) return;
    if (event.target.id==='dc-source-disclosure'&&state.component==='source') {
      const next=event.target.open?'expanded':'closed';
      if(next!==state.variant){state.variant=next;preview.dataset.variant=next;$('component-variant').value=next;writeUrl(true);}
    }
    syncCode();
  },true);
  $('component-copy').addEventListener('click',async()=>{
    syncCode();const sequence=++copySequence,content=code;
    $('component-feedback').textContent='Copying HTML…';$('component-copy-fallback').hidden=true;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(content);
      if(sequence!==copySequence)return;
      $('component-feedback').textContent='HTML copied.';
    } catch {
      if(sequence!==copySequence)return;
      $('component-feedback').textContent='Clipboard access is unavailable. Select and copy the HTML below.';
      $('component-copy-fallback').hidden=false;$('component-copy-text').value=content;$('component-copy-text').focus();$('component-copy-text').select();
    }
  });
  const restore = ()=>{state=resolveComponentState(new URLSearchParams(location.search));$('component-search').value=state.query;$('component-category').value=state.category;renderSelection();};
  window.addEventListener('popstate',restore);
  const observer=new MutationObserver(syncCode);
  observer.observe(preview,{subtree:true,childList:true,attributes:true,characterData:true});
  restore();
  root.dataset.componentReady='true';
  return ()=>{window.removeEventListener('popstate',restore);observer.disconnect();if(downloadUrl)URL.revokeObjectURL(downloadUrl);};
}
