// Deliberately small, in-memory specimens copied from data/graph.json.
// These controls never write to a profile, an account or persistent storage.
const records = Object.freeze([
  Object.freeze({id:'startup:canva',name:'Canva',initial:'C',summary:'Online design and publishing platform founded in Australia.'}),
  Object.freeze({id:'startup:airwallex',name:'Airwallex',initial:'A',summary:'Global payments and financial platform founded in Melbourne.'}),
  Object.freeze({id:'startup:bugcrowd',name:'Bugcrowd',initial:'B',summary:'Crowdsourced cybersecurity platform.'})
]);

const mounts = new WeakMap();
const escape = value => String(value ?? '').replace(/[&<>"']/g,character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
const paths = {
  search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 4.5 4.5"/>',
  bookmark:'<path d="M6 3.5h12v17l-6-4-6 4z"/>',
  reset:'<path d="M4 10a8 8 0 1 1 .8 6M4 4v6h6"/>',
  arrow:'<path d="M6 18 18 6M6 6h12v12"/>',
  close:'<path d="m6 6 12 12M18 6 6 18"/>',
  check:'<path d="m5 12 4.5 4.5L19 7"/>',
  compact:'<path d="M4 5h16M4 10h16M4 15h16M4 20h16"/>',
  comfortable:'<rect x="4" y="4" width="16" height="5" rx="1"/><rect x="4" y="15" width="16" height="5" rx="1"/>',
  select:'<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 9h8M8 15h5"/>',
  rail:'<path d="M5 4v16M10 7h10M10 12h10M10 17h6"/>'
};
const icon = (name,size=18) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;

function readPreferences() {
  const params = new URLSearchParams(location.search);
  return {
    material:params.get('material') === 'flat' ? 'flat' : 'tactile',
    edges:params.get('edges') === 'precise' ? 'precise' : 'soft'
  };
}

function template() {
  return `<div class="signal-tactile" data-material="tactile" data-edges="soft" data-density="comfortable">
    <div class="signal-controls-compare" aria-label="Component appearance">
      <div class="signal-controls-compare-copy"><span class="signal-controls-stud" aria-hidden="true"></span><div><strong>A little depth. A clear purpose.</strong><p>Compare the same controls in two finishes.</p></div></div>
      <fieldset class="signal-controls-setting"><legend>Material</legend><div class="signal-controls-segment" data-controls-segment><button type="button" id="signal-material-flat" data-control-material="flat" aria-pressed="false">Flat</button><button type="button" id="signal-material-tactile" data-control-material="tactile" aria-pressed="true">Tactile</button></div></fieldset>
      <fieldset class="signal-controls-setting"><legend>Edges</legend><div class="signal-controls-segment" data-controls-segment><button type="button" id="signal-edges-precise" data-control-edges="precise" aria-pressed="false">Precise</button><button type="button" id="signal-edges-soft" data-control-edges="soft" aria-pressed="true">Soft</button></div></fieldset>
    </div>

    <section class="signal-control-workstation" aria-labelledby="signal-control-workstation-title">
      <div class="signal-control-workstation-head"><div><p class="signal-controls-kicker">A working specimen</p><h3 id="signal-control-workstation-title">Build a small watchlist.</h3><p id="signal-control-sample-note">Sample Atlas records · preview only</p></div><span class="signal-controls-local"><i aria-hidden="true"></i>Local preview</span></div>
      <div class="signal-control-actions">
        <button id="signal-control-save" class="signal-control-button signal-control-primary" type="button" aria-pressed="false">${icon('bookmark')}<span>Save selected</span></button>
        <button id="signal-control-reset" class="signal-control-button signal-control-neutral" type="button">${icon('reset')}<span>Reset preview</span></button>
        <a id="signal-control-directory" class="signal-control-button signal-control-ghost" href="./index.html#directory"><span>Open directory</span>${icon('arrow',16)}</a>
      </div>

      <div class="signal-control-columns">
        <div class="signal-controls-list-pane">
          <div class="signal-controls-search"><label for="signal-control-search">Find a sample</label><div class="signal-search-well">${icon('search',20)}<input id="signal-control-search" type="search" placeholder="Search these 3 records…" autocomplete="off" spellcheck="false" aria-describedby="signal-control-sample-note"><button id="signal-control-clear-search" class="signal-control-clear" type="button" aria-label="Clear search" hidden>${icon('close',16)}</button></div></div>
          <div class="signal-controls-list-toolbar">
            <div class="signal-controls-filters" role="group" aria-label="Filter sample records" data-controls-segment><button type="button" id="signal-filter-all" data-control-filter="all" aria-pressed="true">All <span>3</span></button><button type="button" id="signal-filter-saved" data-control-filter="saved" aria-pressed="false">Saved <span id="signal-control-saved-count">0</span></button></div>
            <div class="signal-controls-density" role="group" aria-label="Row density" data-controls-segment><button type="button" id="signal-density-compact" data-control-density="compact" aria-label="Compact rows" title="Compact rows" aria-pressed="false">${icon('compact',18)}</button><button type="button" id="signal-density-comfortable" data-control-density="comfortable" aria-label="Comfortable rows" title="Comfortable rows" aria-pressed="true">${icon('comfortable',18)}</button></div>
          </div>
          <p id="signal-control-results-count" class="signal-controls-result-count">3 sample records</p>
          <ul id="signal-control-records" class="signal-control-records" aria-label="Sample Atlas records">${records.map(record => `<li data-record-item="${escape(record.id)}"><button type="button" class="signal-control-record" data-control-record="${escape(record.id)}" aria-pressed="false"><span class="signal-control-monogram" aria-hidden="true">${record.initial}</span><span class="signal-control-record-copy"><span class="signal-control-record-name">${record.name}<span class="signal-control-record-saved" data-record-saved hidden>${icon('bookmark',13)}<span>Saved</span></span></span><span class="signal-control-record-summary" data-record-summary>${record.summary}</span><code class="signal-control-record-id" data-record-id hidden>${record.id}</code></span><span class="signal-control-record-check" aria-hidden="true">${icon('check',16)}</span></button></li>`).join('')}</ul>
          <div id="signal-control-empty" class="signal-control-empty" hidden><span class="signal-control-empty-symbol" aria-hidden="true">${icon('search',24)}</span><h4 id="signal-control-empty-title">Nothing saved yet.</h4><p id="signal-control-empty-copy">Choose a sample record and use Save selected to keep it in this preview.</p><button type="button" id="signal-control-empty-action" class="signal-control-button signal-control-neutral">Show all records</button></div>
          <div class="signal-controls-options"><label class="signal-control-switch"><input id="signal-show-summaries" type="checkbox" role="switch" checked><span class="signal-control-switch-track" aria-hidden="true"><span></span></span><span>Show summaries</span></label><label class="signal-control-checkbox"><input id="signal-show-ids" type="checkbox"><span>Record IDs</span></label></div>
        </div>

        <aside id="signal-control-inspector" class="signal-control-inspector" aria-labelledby="signal-control-inspector-label" data-selected="startup:canva"><div class="signal-control-inspector-heading"><p id="signal-control-inspector-label" class="signal-controls-kicker">Selected record</p>${icon('select',18)}</div>
          <div id="signal-control-details"><div class="signal-control-inspect-mark" aria-hidden="true">C</div><p class="signal-controls-kind">Startup</p><h4 id="signal-control-name">Canva</h4><p id="signal-control-summary">Online design and publishing platform founded in Australia.</p><dl class="signal-control-facts"><div><dt>Record ID</dt><dd id="signal-control-id">startup:canva</dd></div><div><dt>Preview state</dt><dd id="signal-control-saved-label">Not saved</dd></div></dl><a id="signal-control-profile" class="signal-control-button signal-control-neutral" href="./entity.html?id=startup%3Acanva"><span>Open Atlas profile</span>${icon('arrow',16)}</a></div>
          <div id="signal-control-unselected" class="signal-control-unselected" hidden><span aria-hidden="true">${icon('select',32)}</span><h4>Choose a record.</h4><p>Select a sample to inspect it. Save selected will become available here in the preview.</p></div>
          <p class="signal-control-inspector-note">Summaries from the Atlas graph. Saved choices stay in this preview and clear on reload.</p>
        </aside>
      </div>
      <div class="signal-control-feedback"><span class="signal-control-feedback-mark" aria-hidden="true">${icon('rail',16)}</span><p id="signal-control-status" role="status" aria-live="polite" aria-atomic="true">Canva selected. Saved choices stay in this preview.</p></div>
    </section>

    <div class="signal-controls-specimens">
      <section class="signal-controls-state-section" aria-labelledby="signal-controls-states-title"><div class="signal-controls-specimen-heading"><p class="signal-controls-kicker">Button states</p><h3 id="signal-controls-states-title">Feel the action.</h3><p>Labelled samples show the full interaction range.</p></div><div class="signal-controls-state-grid">${[['rest','Rest'],['hover','Hover'],['pressed','Pressed'],['focus','Focus'],['disabled','Disabled']].map(([state,label]) => `<figure class="signal-controls-state"><span class="signal-control-button signal-control-primary signal-control-sample" data-control-sample="${state}" aria-hidden="true">${icon('bookmark',16)}<span>Save selected</span></span><figcaption>${label}</figcaption></figure>`).join('')}</div><p class="signal-controls-material-note">A satin top edge and a short bottom lip give actions weight. Pressing lowers the face; the focus ring stays distinct. Information rows remain flat.</p></section>
      <section class="signal-controls-radius-section" aria-labelledby="signal-controls-radius-title"><div class="signal-controls-specimen-heading"><p class="signal-controls-kicker">Radius hierarchy</p><h3 id="signal-controls-radius-title">Soft, with structure.</h3><p id="signal-controls-radius-description">Small parts stay precise. Larger surfaces get room to soften.</p></div><div id="signal-radius-scale" class="signal-controls-radius-scale">${[['compact','Detail'],['control','Control'],['row','Row'],['panel','Panel'],['feature','Feature'],['pill','Pill']].map(([role,label]) => `<div class="signal-controls-radius-item"><span class="signal-controls-radius-shape" data-radius-shape="${role}" aria-hidden="true"></span><strong>${label}</strong><code data-radius-value="${role}"></code></div>`).join('')}</div></section>
    </div>
  </div>`;
}

/** Mount a self-contained, in-memory component specimen into a supplied element. */
export function mountSignalControls(host) {
  if(!host || typeof host.replaceChildren !== 'function') throw new TypeError('mountSignalControls requires a host element.');
  if(mounts.has(host)) return mounts.get(host);

  host.innerHTML = template();
  const root = host.querySelector('.signal-tactile');
  const find = id => host.querySelector('#'+id);
  const events = new AbortController();
  const state = {...readPreferences(),query:'',filter:'all',density:'comfortable',selected:records[0].id,saved:new Set(),summaries:true,ids:false};
  const rows = new Map(records.map(record => [record.id,root.querySelector(`[data-control-record="${record.id}"]`)]));

  function announce(message) {
    find('signal-control-status').textContent = message;
  }

  function syncUrl() {
    const url = new URL(location.href);
    url.searchParams.set('material',state.material);
    url.searchParams.set('edges',state.edges);
    const next = url.pathname+url.search+url.hash;
    if(next !== location.pathname+location.search+location.hash) history.replaceState(history.state,'',next);
  }

  function renderPreferences({updateUrl=true}={}) {
    root.dataset.material = state.material;
    root.dataset.edges = state.edges;
    for(const value of ['flat','tactile']) find('signal-material-'+value).setAttribute('aria-pressed',String(value === state.material));
    for(const value of ['precise','soft']) find('signal-edges-'+value).setAttribute('aria-pressed',String(value === state.edges));
    const style = getComputedStyle(root);
    for(const role of ['compact','control','row','panel','feature','pill']) {
      const token = role === 'panel' ? '--signal-radius' : '--signal-radius-'+role;
      root.querySelector(`[data-radius-value="${role}"]`).textContent = style.getPropertyValue(token).trim();
    }
    find('signal-controls-radius-title').textContent = state.edges === 'soft' ? 'Soft, with structure.' : 'Precise, with rhythm.';
    find('signal-controls-radius-description').textContent = state.edges === 'soft' ? 'Small parts stay precise. Larger surfaces get room to soften.' : 'Tighter corners keep dense controls clear. Each scale still has its own role.';
    if(updateUrl) syncUrl();
  }

  function visibleRecords() {
    const query = state.query.trim().toLocaleLowerCase();
    return records.filter(record => (state.filter === 'all' || state.saved.has(record.id)) && (!query || `${record.name} ${record.summary} ${record.id}`.toLocaleLowerCase().includes(query)));
  }

  function renderRecords() {
    const visible = visibleRecords();
    const visibleIds = new Set(visible.map(record => record.id));
    if(state.selected && !visibleIds.has(state.selected)) state.selected = null;
    root.dataset.density = state.density;
    for(const record of records) {
      const row = rows.get(record.id);
      row.parentElement.hidden = !visibleIds.has(record.id);
      row.setAttribute('aria-pressed',String(record.id === state.selected));
      row.querySelector('[data-record-saved]').hidden = !state.saved.has(record.id);
      row.querySelector('[data-record-summary]').hidden = !state.summaries;
      row.querySelector('[data-record-id]').hidden = !state.ids;
    }
    for(const filter of ['all','saved']) find('signal-filter-'+filter).setAttribute('aria-pressed',String(filter === state.filter));
    for(const density of ['compact','comfortable']) find('signal-density-'+density).setAttribute('aria-pressed',String(density === state.density));
    find('signal-control-saved-count').textContent = String(state.saved.size);
    find('signal-control-results-count').textContent = `${visible.length} sample ${visible.length === 1 ? 'record' : 'records'}${state.filter === 'saved' ? ' saved' : ''}`;
    find('signal-control-clear-search').hidden = !state.query;
    find('signal-show-summaries').checked = state.summaries;
    find('signal-show-ids').checked = state.ids;

    const empty = visible.length === 0;
    const searched = Boolean(state.query.trim());
    find('signal-control-empty').hidden = !empty;
    find('signal-control-empty-title').textContent = searched ? 'No matching samples.' : 'Nothing saved yet.';
    find('signal-control-empty-copy').textContent = searched ? `No ${state.filter === 'saved' ? 'saved ' : ''}sample records match “${state.query.trim()}”.` : 'Choose a sample record and use Save selected to keep it in this preview.';
    find('signal-control-empty-action').textContent = searched ? 'Clear search' : 'Show all records';

    const selected = records.find(record => record.id === state.selected);
    const saved = Boolean(selected && state.saved.has(selected.id));
    const save = find('signal-control-save');
    save.disabled = !selected;
    save.setAttribute('aria-pressed',String(saved));
    find('signal-control-inspector').dataset.selected = selected?.id ?? '';
    find('signal-control-details').hidden = !selected;
    find('signal-control-unselected').hidden = Boolean(selected);
    if(selected) {
      root.querySelector('.signal-control-inspect-mark').textContent = selected.initial;
      find('signal-control-name').textContent = selected.name;
      find('signal-control-summary').textContent = selected.summary;
      find('signal-control-id').textContent = selected.id;
      find('signal-control-saved-label').textContent = saved ? 'Saved in this preview' : 'Not saved';
      find('signal-control-profile').href = './entity.html?id='+encodeURIComponent(selected.id);
    }
    return visible;
  }

  function chooseRecord(id) {
    const record = records.find(item => item.id === id);
    if(!record || !visibleRecords().some(item => item.id === id)) return;
    state.selected = id;
    renderRecords();
    announce(`${record.name} selected. ${state.saved.has(id) ? 'Saved in this preview.' : 'Ready to save in this preview.'}`);
  }

  function updateQuery(value) {
    state.query = value;
    if(find('signal-control-search').value !== value) find('signal-control-search').value = value;
    const visible = renderRecords();
    announce(`${visible.length} sample ${visible.length === 1 ? 'record' : 'records'} ${value.trim() ? 'match your search' : 'shown'}.`);
  }

  root.addEventListener('click',event => {
    const button = event.target.closest('button');
    if(!button || !root.contains(button) || button.disabled) return;
    if(button.dataset.controlMaterial || button.dataset.controlEdges) {
      if(button.dataset.controlMaterial) state.material = button.dataset.controlMaterial;
      if(button.dataset.controlEdges) state.edges = button.dataset.controlEdges;
      renderPreferences();
      announce(`${state.material === 'tactile' ? 'Tactile' : 'Flat'} controls with ${state.edges} edges.`);
      return;
    }
    if(button.dataset.controlFilter) {
      state.filter = button.dataset.controlFilter;
      const visible = renderRecords();
      announce(`${visible.length} ${state.filter === 'saved' ? 'saved ' : ''}sample ${visible.length === 1 ? 'record' : 'records'} shown.`);
      return;
    }
    if(button.dataset.controlDensity) {
      state.density = button.dataset.controlDensity;
      renderRecords();
      announce(`${state.density === 'compact' ? 'Compact' : 'Comfortable'} row spacing.`);
      return;
    }
    if(button.dataset.controlRecord) {
      chooseRecord(button.dataset.controlRecord);
      return;
    }
    if(button.id === 'signal-control-save') {
      const record = records.find(item => item.id === state.selected);
      if(!record) return;
      const hadFocus = document.activeElement === button;
      const wasSaved = state.saved.has(record.id);
      if(wasSaved) state.saved.delete(record.id); else state.saved.add(record.id);
      const visible = renderRecords();
      announce(`${record.name} ${wasSaved ? 'removed from' : 'saved in'} this preview. ${state.saved.size} saved ${state.saved.size === 1 ? 'record' : 'records'}.`);
      if(hadFocus && button.disabled) (visible.length ? rows.get(visible[0].id) : find('signal-control-empty-action')).focus({preventScroll:true});
      return;
    }
    if(button.id === 'signal-control-reset') {
      state.query = '';
      state.filter = 'all';
      state.density = 'comfortable';
      state.selected = null;
      state.saved.clear();
      state.summaries = true;
      state.ids = false;
      find('signal-control-search').value = '';
      renderRecords();
      announce('Preview reset. Select a sample record to inspect it.');
      return;
    }
    if(button.id === 'signal-control-clear-search') {
      updateQuery('');
      find('signal-control-search').focus({preventScroll:true});
      return;
    }
    if(button.id === 'signal-control-empty-action') {
      if(state.query.trim()) {
        updateQuery('');
        find('signal-control-search').focus({preventScroll:true});
      } else {
        state.filter = 'all';
        renderRecords();
        announce('All three sample records shown. Select one to inspect it.');
        find('signal-filter-all').focus({preventScroll:true});
      }
    }
  },{signal:events.signal});

  find('signal-control-search').addEventListener('input',event => updateQuery(event.target.value),{signal:events.signal});
  for(const [id,key] of [['signal-show-summaries','summaries'],['signal-show-ids','ids']]) find(id).addEventListener('change',event => {
    state[key] = event.target.checked;
    renderRecords();
    announce(`${key === 'summaries' ? 'Row summaries' : 'Record IDs'} ${state[key] ? 'shown' : 'hidden'}.`);
  },{signal:events.signal});

  root.addEventListener('keydown',event => {
    if(event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if(event.target.id === 'signal-control-search' && event.key === 'Escape' && state.query) {
      event.preventDefault();
      updateQuery('');
      return;
    }
    const row = event.target.closest('[data-control-record]');
    const segment = event.target.closest('[data-controls-segment]');
    const direction = ['ArrowRight','ArrowDown'].includes(event.key) ? 1 : ['ArrowLeft','ArrowUp'].includes(event.key) ? -1 : 0;
    if((!row && !segment) || (!direction && !['Home','End'].includes(event.key))) return;
    const buttons = row ? visibleRecords().map(record => rows.get(record.id)) : [...segment.querySelectorAll('button')];
    const current = buttons.indexOf(event.target.closest('button'));
    if(current < 0 || !buttons.length) return;
    event.preventDefault();
    const index = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length-1 : (current+direction+buttons.length)%buttons.length;
    buttons[index].focus({preventScroll:true});
    buttons[index].click();
  },{signal:events.signal});

  window.addEventListener('popstate',() => {
    Object.assign(state,readPreferences());
    renderPreferences({updateUrl:false});
  },{signal:events.signal});

  const api = {destroy() {
    events.abort();
    mounts.delete(host);
    host.replaceChildren();
    delete host.dataset.controlsReady;
  }};
  mounts.set(host,api);
  renderPreferences();
  renderRecords();
  root.dataset.controlsReady = 'true';
  host.dataset.controlsReady = 'true';
  return api;
}
