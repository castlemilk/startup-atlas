import { countryName, indexCompanies } from './atlas-exploration.js';
import { renderIcon } from './atlas-icons.js';
import { entityHref } from './graph-model.js';
import { openGraph } from './graph-store.js';
import { escapeHtml as esc } from './logic.js';

const storageKey = 'atlas:workspace:v1';
const startupId = /^startup:[a-z0-9][a-z0-9_-]{0,159}$/i;
const defaultName = id=>id.slice('startup:'.length).replaceAll('-',' ');
const actionSelector = '[data-atlas-save-company], [data-atlas-compare]';
const newWorkspace = () => ({saved:{},compare:{},notes:{},views:{}});

export function installWorkspace(doc,safeReturn) {
  if (!doc.querySelector?.('[data-atlas-workspace]')) return;
  const view = doc.defaultView;
  let state = newWorkspace(), mode = 'saved', graph = null, dimensions = null;
  let loading = false, unavailable = false, fallbackOpener, companyScope;

  function explorerLink(value) {
    const safe = safeReturn(value,view.location.href);
    if (!safe) return null;
    const url = new URL(safe,view.location.href);
    if (!['','index.html','graph.html','treemap.html'].includes(url.pathname.split('/').pop())) return null;
    url.searchParams.delete('embed');
    url.searchParams.sort();
    return url.pathname + url.search + url.hash;
  }

  function read() {
    try {
      const raw = JSON.parse(view.localStorage.getItem(storageKey) || 'null');
      for (const key of Object.keys(state)) {
        const records = raw?.[key];
        state[key] = Object.fromEntries(Object.entries(records ?? {}).filter(([id,value])=>
          typeof value==='string' && (key==='views' ? explorerLink(id)===id : startupId.test(id))));
      }
    } catch { /* Keep the active page state if storage is unavailable. */ }
  }
  read();
  doc.body.insertAdjacentHTML('beforeend',`<p class="sr-only" data-atlas-workspace-status role="status"></p>
    <ui-dialog id="atlas-workspace-dialog" presentation="auto">
      <ui-dialog-backdrop class="atlas-workspace-backdrop" hidden></ui-dialog-backdrop>
      <ui-dialog-content class="atlas-workspace-panel" initial-focus="[data-workspace-close]" hidden>
        <header class="atlas-workspace-header">
          <ui-dialog-title as-child><h2 id="atlas-workspace-title">Saved companies</h2></ui-dialog-title>
          <ui-dialog-close><button type="button" data-workspace-close aria-label="Close workspace">${renderIcon('close')}</button></ui-dialog-close>
        </header>
        <ui-dialog-description class="atlas-workspace-description">Stored in this browser.</ui-dialog-description>
        <p data-workspace-error role="alert" hidden></p>
        <div class="atlas-workspace-body"></div>
      </ui-dialog-content>
    </ui-dialog>`);
  const status = doc.querySelector('[data-atlas-workspace-status]');
  const dialog = doc.getElementById('atlas-workspace-dialog');
  const panel = dialog.querySelector('ui-dialog-content');
  const title = dialog.querySelector('h2');
  const detail = dialog.querySelector('.atlas-workspace-body');
  const error = dialog.querySelector('[data-workspace-error]');
  const close = dialog.querySelector('[data-workspace-close]');
  let nativeDialog;

  function save(next) {
    try {
      view.localStorage.setItem(storageKey, JSON.stringify(next));
      state = next;
      return true;
    } catch { return false; }
  }

  function sync() {
    for (const button of doc.querySelectorAll(actionSelector)) {
      const kind = button.hasAttribute('data-atlas-save-company') ? 'saved' : 'compare';
      const id = button.dataset.atlasSaveCompany || button.dataset.atlasCompare;
      const active = Object.hasOwn(state[kind],id);
      const text = kind==='saved' ? active ? 'Saved' : 'Save' : active ? 'Comparing' : 'Compare';
      if (button.getAttribute('aria-pressed')!==String(active)) button.setAttribute('aria-pressed',String(active));
      const label = button.querySelector('[data-atlas-action-label]') || (button.childElementCount===0 ? button : null);
      if (label && label.textContent!==text) label.textContent = text;
    }
    for (const button of doc.querySelectorAll('[data-atlas-panel]')) {
      const key = button.dataset.atlasPanel;
      const count = Object.keys(state[key]).length + (key==='saved' ? Object.keys(state.views).length : 0);
      const label = key==='saved' ? 'Saved' : 'Compare';
      const text = count ? `${label} (${count})` : label;
      const target = button.querySelector('[data-atlas-panel-label]') || button;
      if (target.textContent!==text) target.textContent = text;
    }
    const activeView = Object.hasOwn(state.views,explorerLink(view.location.href));
    for (const button of doc.querySelectorAll('[data-atlas-save-view]')) {
      button.setAttribute('aria-pressed',String(activeView));
      const label = button.querySelector('[data-atlas-action-label]');
      const text = activeView ? 'View saved' : 'Save view';
      if (label.textContent!==text) label.textContent = text;
    }
    const comparing = Object.entries(state.compare);
    for (const tray of doc.querySelectorAll('[data-atlas-compare-tray]')) {
      tray.hidden = comparing.length===0;
      const markup = comparing.length ? `<h2>Compare</h2><ul aria-label="Selected companies">${comparing.map(([id,name])=>
        `<li><button type="button" data-tray-remove="${esc(id)}" aria-label="Remove ${esc(name)} from comparison"><span>${esc(name)}</span>${renderIcon('close')}</button></li>`
      ).join('')}</ul><ui-dialog-trigger for="atlas-workspace-dialog"><button type="button" class="atlas-button" data-atlas-tray-compare aria-haspopup="dialog">Compare (${comparing.length})</button></ui-dialog-trigger>` : '';
      if (tray.dataset.contents!==markup) {
        tray.innerHTML = markup;
        tray.dataset.contents = markup;
      }
    }
    for (const field of doc.querySelectorAll('[data-atlas-notes]:not([data-notes-ready])')) {
      const id = field.dataset.atlasNotes;
      if (!startupId.test(id)) continue;
      field.dataset.notesReady = 'true';
      field.innerHTML = `<h2>Personal notes</h2><p>Stored in this browser only.</p>
        <form><label class="sr-only" for="atlas-company-note">Note for this company</label>
          <textarea id="atlas-company-note" maxlength="5000" rows="4" placeholder="Add a note"></textarea>
          <div class="atlas-note-actions"><button type="submit" class="atlas-button">Save note</button><span role="status"></span></div>
        </form>`;
      const note = field.querySelector('textarea');
      const feedback = field.querySelector('[role="status"]');
      note.value = state.notes[id] || '';
      note.addEventListener('input',()=>{feedback.textContent = note.value===(state.notes[id] || '') ? '' : 'Unsaved changes';});
      field.querySelector('form').addEventListener('submit',event=>{
        event.preventDefault();
        read();
        const notes = {...state.notes};
        if (note.value.trim()) notes[id] = note.value;
        else delete notes[id];
        feedback.textContent = save({...state,notes}) ? 'Note saved' : 'Couldn’t save this note. Your text is still here. Try again.';
      });
    }
  }

  function render() {
    const active = detail.contains(doc.activeElement) ? doc.activeElement : null;
    const control = ['data-workspace-remove','data-workspace-profile','data-workspace-view','data-workspace-view-remove'].find(attr=>active?.hasAttribute(attr));
    const activeId = control ? active.getAttribute(control) : null;
    title.textContent = mode==='compare' ? 'Compare companies' : 'Saved companies and views';
    const items = Object.entries(state[mode]);
    if (!items.length) {
      detail.innerHTML = `<p class="atlas-workspace-empty">${mode==='compare' ? 'Choose Compare on a company to add it here.' : 'Save a company to find it here again.'}</p>`;
    } else {
      const byId = new Map((graph?.entities ?? []).map(item=>[item.id,item]));
      const inScope=mode==='compare' && companyScope && !companyScope.host.closest('[hidden]') ? companyScope.ids : null;
      const outside=inScope ? items.filter(([id])=>!inScope.has(id)).length : 0;
      detail.innerHTML = `${inScope ? `<p class="atlas-workspace-description">${items.length} selected${outside ? ` · ${outside} outside current results` : ''}</p>` : ''}${mode==='compare' && loading ? '<p role="status">Loading company facts…</p>' : ''}${mode==='compare' && unavailable ? '<p role="status">Company facts are unavailable. Profile links are still available.</p>' : ''}
        <ul class="atlas-workspace-list" data-mode="${mode}">${items.map(([id,savedName])=>{
          const entity = byId.get(id);
          const name = entity?.name || savedName || defaultName(id);
          const facts = dimensions?.get(id);
          const rows = facts ? `<dl>${[
            ['Headquarters',facts.country ? [facts.city,countryName(facts.country)].filter(Boolean).join(', ') : 'Not recorded'],
            ['Primary sector',facts.sector || 'Not recorded'],
            ['Last recorded stage',facts.stage || 'Not recorded'],
            ['Last profile fact review',facts.newestFactReview || 'Not recorded'],
          ].map(([label,value])=>`<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl>` : '';
          return `<li><h3><a data-workspace-profile="${esc(id)}" href="${esc(entityHref(entity || {id,kind:'startup'}))}">${esc(name)}</a></h3>${inScope && !inScope.has(id) ? '<p class="atlas-workspace-description">Outside current results</p>' : ''}${mode==='compare' ? rows : ''}
            <button type="button" data-workspace-remove="${esc(id)}" aria-label="Remove ${esc(name)} from ${mode==='compare' ? 'comparison' : 'saved companies'}">Remove</button></li>`;
        }).join('')}</ul>`;
    }
    if (mode==='saved' && Object.keys(state.views).length) {
      detail.insertAdjacentHTML('beforeend',`<section class="atlas-saved-views"><h3>Saved views</h3><ul class="atlas-workspace-list" data-mode="saved">${Object.entries(state.views).map(([href,name])=>
        `<li><h3><a data-workspace-view="${esc(href)}" href="${esc(href)}">${esc(name)}</a></h3><button type="button" data-workspace-view-remove="${esc(href)}" aria-label="Remove saved view ${esc(name)}">Remove</button></li>`
      ).join('')}</ul></section>`);
    }
    if (control) (Array.from(detail.querySelectorAll(`[${control}]`)).find(entry=>entry.getAttribute(control)===activeId) || detail.querySelector('a') || close).focus();
  }

  function show(key,opener) {
    mode = key;
    error.hidden = true;
    if (mode==='compare' && Object.keys(state.compare).length && !loading && !graph && !unavailable) {
      loading = true;
      openGraph().then(store=>{
        graph = store.graph;
        dimensions = indexCompanies(graph);
      }).catch(()=>{unavailable = true;}).finally(()=>{loading = false; render();});
    }
    render();
    if (!nativeDialog && view.customElements.get('ui-dialog')) return false;
    if (!nativeDialog) {
      nativeDialog = doc.createElement('dialog');
      nativeDialog.className = 'atlas-workspace-panel';
      nativeDialog.setAttribute('aria-labelledby',title.id);
      nativeDialog.append(...panel.childNodes);
      doc.body.append(nativeDialog);
      nativeDialog.addEventListener('close',()=>fallbackOpener?.focus());
      close.addEventListener('click',()=>nativeDialog.close());
    }
    fallbackOpener = opener;
    if (!nativeDialog.open) nativeDialog.showModal();
    close.focus();
    return true;
  }

  function toggle(button) {
    const kind = button.hasAttribute('data-atlas-save-company') ? 'saved' : 'compare';
    const id = button.dataset.atlasSaveCompany || button.dataset.atlasCompare;
    if (!startupId.test(id)) return;
    read();
    const group = {...state[kind]};
    const active = Object.hasOwn(group,id);
    const name = button.closest('[data-company-name]')?.dataset.companyName || defaultName(id);
    if (active) delete group[id];
    else group[id] = name;
    const oldError = button.nextElementSibling;
    if (oldError?.matches('.atlas-workspace-action-error')) oldError.remove();
    if (!save({...state,[kind]:group})) {
      button.insertAdjacentHTML('afterend','<span class="atlas-workspace-action-error" role="alert">Couldn’t update your workspace. Try again.</span>');
      return;
    }
    status.textContent = kind==='saved' ? (active ? 'Company removed from saved companies' : 'Company saved') : (active ? 'Company removed from comparison' : 'Company added to comparison');
    sync();
  }

  function toggleView(button) {
    const href = explorerLink(view.location.href);
    if (!href) return;
    read();
    const views = {...state.views};
    const exists = Object.hasOwn(views,href);
    if (exists) delete views[href];
    else {
      const title = doc.querySelector('main h1')?.textContent.trim() || 'Explorer';
      const query = new URL(href,view.location.href).searchParams.get('q');
      views[href] = query && !title.includes(query) ? `${title} · ${query}` : title;
    }
    const feedback = button.closest('[data-atlas-explorer-actions]').querySelector('[data-atlas-export-status]');
    feedback.textContent = save({...state,views}) ? (exists ? 'View removed from Saved.' : 'View added to Saved.') : 'Couldn’t save this view. Try again.';
    feedback.hidden = false;
    sync();
  }

  function removeItem(key,id) {
    read();
    const group = {...state[key]};
    delete group[id];
    return save({...state,[key]:group});
  }

  doc.addEventListener('click',event=>{
    const open = event.target.closest('[data-atlas-panel],[data-atlas-tray-compare]');
    if (open && show(open.dataset.atlasPanel || 'compare',open)) event.stopPropagation();
  },{capture:true});
  doc.addEventListener('click',event=>{
    const button = event.target.closest(actionSelector);
    if (button) toggle(button);
    const saveView = event.target.closest('[data-atlas-save-view]');
    if (saveView) toggleView(saveView);
    const trayRemove = event.target.closest('[data-tray-remove]');
    if (trayRemove) {
      const tray = trayRemove.closest('[data-atlas-compare-tray]');
      if (removeItem('compare',trayRemove.dataset.trayRemove)) {
        status.textContent = 'Company removed from comparison';
        sync();
        const next = tray.querySelector('[data-tray-remove]') || [...doc.querySelectorAll('[data-atlas-compare],[data-atlas-panel="compare"],[data-atlas-save-view]')].find(button=>button.getClientRects().length);
        next?.focus();
      } else status.textContent = 'Couldn’t update your comparison. Try again.';
    }
    const remove = event.target.closest('[data-workspace-remove],[data-workspace-view-remove]');
    if (!remove) return;
    const viewLink = remove.dataset.workspaceViewRemove;
    if (removeItem(viewLink ? 'views' : mode,viewLink || remove.dataset.workspaceRemove)) { error.hidden = true; render(); sync(); }
    else { error.hidden = false; error.textContent = `Couldn’t remove this ${viewLink ? 'view' : 'company'}. Try again.`; }
  });
  doc.addEventListener('atlas:reset-exploration',()=>{read(); if (save({...state,compare:{}})) sync();});
  doc.addEventListener('atlas:company-scope',event=>{companyScope={ids:new Set(event.detail),host:event.target};});
  doc.addEventListener('atlas:exploration-change',sync);
  view.addEventListener('popstate',sync);
  view.addEventListener('storage',event=>{if (event.key===storageKey || event.key===null) {read(); sync(); render();}});
  view.addEventListener('pageshow',()=>{read(); sync();});
  new MutationObserver(sync).observe(doc.body,{subtree:true,childList:true});
  sync();
}
