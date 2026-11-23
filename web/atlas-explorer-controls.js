import { companyFacets, countryName, filterCompanies, hasCompanyScope, multipleHeadquarters } from './atlas-exploration.js';
import { renderIcon } from './atlas-icons.js';
import { escapeHtml as esc } from './logic.js';

const format = new Intl.NumberFormat('en');
const companyCount = count => `${format.format(count)} ${count===1 ? 'company' : 'companies'}`;
const cityName = value => value==='unknown' ? 'City not recorded' : value;
const facetByKey = new Map(companyFacets.map(facet=>[facet.key,facet]));
const facetLabel = (key,value) => value==='unknown' ? `${facetByKey.get(key).label} not recorded` : value;
const ordered = (values,label) => [...new Set(values)].sort((a,b)=>a==='unknown' ? 1 : b==='unknown' ? -1 : label(a).localeCompare(label(b)));
const option = (value,label) => `<option value="${esc(value)}">${esc(label)}</option>`;
const allCompanies = () => true;

export function mountExploration(host,{companies,dimensions,onChange,showDensity=true,hideEmptySector=false,fieldsHost,narrowQuery='(max-width: 620px)'}) {
  if (!host?.ownerDocument?.createElement) return {update(){},openCountries(){}};
  const doc = host.ownerDocument;
  const choices = [...dimensions.values()];
  const visibleFacets = companyFacets.filter(({key})=>key!=='sector' || !hideEmptySector || choices.some(item=>item.sector));
  const countries = ordered([...choices.map(item=>item.country).filter(Boolean),'unknown'],countryName);
  let state = {countries:[],density:'comfortable'}, matches = companies, routeMatches = companies, draft = new Set(), draftScope;
  host.classList.add('exploration-controls');
  host.innerHTML = `<div class="exploration-fields">
    <div class="exploration-field exploration-country">
      <span class="exploration-label" id="atlas-hq-label">Headquarters country</span>
      <ui-popover presentation="auto">
        <ui-popover-trigger><button type="button" class="exploration-country-trigger" aria-labelledby="atlas-hq-label atlas-hq-value">
          <span class="exploration-mobile-label" id="atlas-mobile-filters">${renderIcon('filter')}<span>Filters</span></span>
          <span id="atlas-hq-value">All locations</span><span class="exploration-country-chevron">${renderIcon('chevron-down')}</span>
        </button></ui-popover-trigger>
        <ui-popover-content class="exploration-popover" side="bottom" align="start" initial-focus="#atlas-country-search" hidden>
          <div class="exploration-popover-head">
            <ui-popover-title as-child><h2 id="atlas-filter-title">Headquarters country</h2></ui-popover-title>
            <div class="exploration-draft-fields">
              ${visibleFacets.map(({key,label})=>`<label>${label}<select data-draft-field="${key}"></select></label>`).join('')}
            </div>
            <span class="exploration-draft-country">Headquarters country</span>
            <label class="sr-only" for="atlas-country-search">Search country or code</label>
            <input id="atlas-country-search" type="search" placeholder="Search country or code" autocomplete="off">
            <p>Companies in current scope · Match any selected country</p>
          </div>
          <ul class="exploration-country-options" aria-label="Headquarters countries"></ul>
          <p class="exploration-country-empty" hidden>No countries match this search.</p>
          <div class="exploration-popover-foot">
            <p class="exploration-draft" role="status"></p>
            <p class="exploration-error" role="alert" hidden>Couldn’t update results. Your choices are kept. Showing previous results.</p>
            <div class="exploration-popover-actions">
              <button type="button" data-draft-clear>Clear selection</button>
              <ui-popover-close><button type="button" data-draft-cancel>Cancel</button></ui-popover-close>
              <button type="button" class="exploration-apply">Apply filters</button>
            </div>
          </div>
        </ui-popover-content>
      </ui-popover>
    </div>
    ${visibleFacets.map(({key,label,all})=>`<div class="exploration-field exploration-desktop-field"><label class="exploration-label" for="atlas-${key}">${label}</label>
      <select id="atlas-${key}" data-exploration-field="${key}">${option('',all)}</select></div>`).join('')}
    ${showDensity ? '<div class="exploration-field"><label class="exploration-label" for="atlas-density">Density</label><select id="atlas-density" data-exploration-field="density"><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select></div>' : ''}
  </div>
  <div class="exploration-applied" hidden>
    <ul class="exploration-chips" aria-label="Applied company filters"></ul>
    <span class="exploration-match-any" hidden>Matches either country</span>
    <button type="button" class="exploration-text-button" data-clear-facets>Clear filters</button>
  </div>
  <div class="exploration-scope">
    <nav aria-label="Current ecosystem" class="exploration-breadcrumb"></nav>
    <p class="exploration-result-count" role="status"></p>
    <div class="exploration-drill-field"><label class="exploration-label" for="atlas-drill">Explore location</label><select id="atlas-drill"></select></div>
  </div>`;
  const row = host.querySelector('.exploration-fields');
  if (fieldsHost) {
    fieldsHost.prepend(row);
    host.classList.add('exploration-controls-split');
  }
  const find = selector=>host.querySelector(selector) || row.querySelector(selector);
  const popup = find('ui-popover');
  const narrow = doc.defaultView?.matchMedia?.(narrowQuery);
  const trigger = find('.exploration-country-trigger');
  const panel = find('ui-popover-content');
  const title = find('#atlas-filter-title');
  const search = find('#atlas-country-search');
  const options = find('.exploration-country-options');
  const summary = find('.exploration-draft');
  const finish = find('.exploration-apply');
  const clearDraft = find('[data-draft-clear]');
  const failed = find('.exploration-error');
  const empty = find('.exploration-country-empty');
  const chips = find('.exploration-chips');
  const clearFacets = find('[data-clear-facets]');
  const breadcrumb = find('.exploration-breadcrumb');
  const drill = find('#atlas-drill');
  const fields = [...row.querySelectorAll('[data-exploration-field]')];
  const draftFields = [...popup.querySelectorAll('[data-draft-field]')];
  const mobileLabel = find('.exploration-mobile-label span');
  let nativePopup = false;

  function placePopup() {
    popup.setAttribute('presentation',narrow?.matches ? 'sheet' : 'popover');
    trigger.setAttribute('aria-labelledby',narrow?.matches ? 'atlas-mobile-filters' : 'atlas-hq-label atlas-hq-value');
    panel.setAttribute('initial-focus',narrow?.matches ? 'content' : '#atlas-country-search');
    title.textContent = narrow?.matches ? 'Filters' : 'Headquarters country';
  }
  placePopup();
  narrow?.addEventListener?.('change',placePopup);

  function openCountries() {
    if (popup.api) {
      popup.open = true;
      return;
    }
    nativePopup = true;
    beginDraft();
    panel.hidden = false;
    panel.setAttribute('role','dialog');
    panel.setAttribute('aria-labelledby',title.id);
    trigger.setAttribute('aria-expanded','true');
    if (narrow?.matches) {
      panel.tabIndex = -1;
      panel.focus();
    } else search.focus();
  }

  function closeCountries() {
    if (popup.api) popup.open = false;
    else if (nativePopup) {
      nativePopup = false;
      panel.hidden = true;
      trigger.setAttribute('aria-expanded','false');
      trigger.focus();
    }
  }

  function draftFacets() {
    return Object.fromEntries(draftFields.map(control=>[control.dataset.draftField,control.value]));
  }

  function renderDraft() {
    const query = search.value.trim().toLowerCase();
    const next = {...state,...draftFacets(),countries:[...draft]};
    const counts = new Map();
    for (const item of filterCompanies(routeMatches,dimensions,next,{ignoreCountry:true})) {
      const code = dimensions.get(item.id)?.country || 'unknown';
      counts.set(code,(counts.get(code) ?? 0)+1);
    }
    let visible = 0;
    for (const row of options.children) {
      const key = row.dataset.hq;
      row.hidden = Boolean(query && !`${countryName(key)} ${key}`.toLowerCase().includes(query));
      if (!row.hidden) visible++;
      row.querySelector('input').checked = draft.has(key);
      row.querySelector('.exploration-option-count').textContent = format.format(counts.get(key) ?? 0);
    }
    empty.hidden = visible!==0;
    clearDraft.disabled = draft.size===0 && !(narrow?.matches && companyFacets.some(({key})=>next[key]));
    const count = filterCompanies(routeMatches,dimensions,next).length;
    const selectedLabel = draft.size===1 ? '1 location selected' : `${draft.size} locations selected`;
    summary.textContent = `${selectedLabel} · ${companyCount(count)} ${count===1 ? 'matches' : 'match'}`;
    doc.dispatchEvent(new Event('atlas:controls-sync'));
  }

  function beginDraft() {
    draftScope = scopeKey(state);
    for (const control of draftFields) {
      const field = fields.find(item=>item.dataset.explorationField===control.dataset.draftField);
      setChoices(control,field.dataset.optionMarkup ?? field.innerHTML,field.value);
    }
    draft = new Set(state.countries);
    search.value = '';
    failed.hidden = true;
    finish.textContent = 'Apply filters';
    options.innerHTML = ordered([...countries,...draft],countryName).map(code=>`<li data-hq="${esc(code)}"><label for="atlas-hq-${esc(code)}">
      <input type="checkbox" id="atlas-hq-${esc(code)}" value="${esc(code)}" aria-label="${esc(countryName(code))}">
      <span>${esc(countryName(code))}</span><span class="exploration-option-count"></span></label></li>`).join('');
    renderDraft();
  }

  function setChoices(control,markup,value) {
    if (control.dataset.optionMarkup!==markup) {
      control.innerHTML = markup;
      control.dataset.optionMarkup = markup;
    }
    control.value = value;
  }

  const scopeKey = state=>JSON.stringify([state.query,state.countries,...companyFacets.map(({key})=>state[key]),state.drillCountry,state.drillCity,state.period]);
  function focusLocation() {
    const target=doc.getElementById('atlas-drill-trigger') || drill;
    (target.getClientRects().length ? target : trigger).focus();
  }

  function update(next,searchMatches=companies,inRouteScope=allCompanies) {
    state = next;
    matches = searchMatches;
    routeMatches = inRouteScope===allCompanies ? matches : matches.filter(inRouteScope);
    if ((popup.open || nativePopup) && draftScope!==scopeKey(state)) closeCountries();
    const applied = state.countries ?? [];
    find('#atlas-hq-value').textContent = applied.length===0 ? 'All locations' : applied.length<=2 ? applied.map(countryName).join(' + ') : `${applied.length} locations selected`;
    for (const control of fields) {
      const key = control.dataset.explorationField;
      if (key==='density') {
        control.value = state.density;
        continue;
      }
      const selected = state[key] || '';
      const values = ordered([...choices.map(item=>item[key]).filter(Boolean),'unknown',...(selected ? [selected] : [])],value=>facetLabel(key,value));
      setChoices(control,option('',facetByKey.get(key).all) + values.map(value=>option(value,facetLabel(key,value))).join(''),selected);
    }
    const appliedFacets = [...applied.map(code=>['country',code,`HQ: ${countryName(code)}`])];
    for (const {key} of companyFacets) if (state[key]) appliedFacets.push([key,state[key],facetLabel(key,state[key])]);
    mobileLabel.textContent = appliedFacets.length ? `Filters (${appliedFacets.length})` : 'Filters';
    const markup = appliedFacets.map(([key,value,label])=>`<li><button type="button" data-remove-facet="${key}" data-value="${esc(value)}" aria-label="Remove ${esc(label)}">${esc(label)}${renderIcon('close')}</button></li>`).join('');
    if (chips.dataset.rendered!==markup) {
      chips.innerHTML = markup;
      chips.dataset.rendered = markup;
    }
    find('.exploration-applied').hidden = appliedFacets.length===0;
    const either = find('.exploration-match-any');
    either.hidden = applied.length<2;
    either.textContent = applied.length===2 ? 'Matches either country' : 'Matches any selected country';
    const parent = state.drillCountry;
    const city = state.drillCity;
    const currentCountry = countryName(parent);
    const root = parent ? '<button type="button" data-drill-parent="all">All ecosystems</button>' : '<span aria-current="location">All ecosystems</span>';
    const cityCrumb = city ? `<span aria-hidden="true">/</span><span aria-current="location">${esc(cityName(city))}</span>` : '';
    const countryCrumb = parent ? `<span aria-hidden="true">/</span>${city ? `<button type="button" data-drill-parent="country">${esc(currentCountry)}</button>` : `<span aria-current="location">${esc(currentCountry)}</span>`}` : '';
    const pathMarkup = root + countryCrumb + cityCrumb;
    if (breadcrumb.dataset.rendered!==pathMarkup) {
      breadcrumb.innerHTML = pathMarkup;
      breadcrumb.dataset.rendered = pathMarkup;
    }
    const filtered = filterCompanies(matches,dimensions,state,{ignoreDrill:true});
    const routeFiltered=inRouteScope===allCompanies ? filtered : filtered.filter(inRouteScope);
    const visible = parent ? filterCompanies(routeFiltered,dimensions,state) : routeFiltered;
    host.dispatchEvent(new CustomEvent('atlas:company-scope',{bubbles:true,detail:visible.map(item=>item.id)}));
    const counts = find('.exploration-result-count');
    counts.textContent = parent || inRouteScope!==allCompanies ? `${companyCount(visible.length)} ${parent ? 'in this location' : 'in this group'} · ${companyCount(filtered.length)} ${filtered.length===1 ? 'matches' : 'match'} your filters` : `${companyCount(visible.length)} in scope`;
    const available = new Set();
    for (const item of routeFiltered) {
      const dimension = dimensions.get(item.id);
      const code = dimension?.country || 'unknown';
      if (!parent) available.add(code);
      else if (parent===code && code!=='unknown' && code!==multipleHeadquarters) available.add(dimension?.city || 'unknown');
    }
    const label = parent ? cityName : countryName;
    const values = ordered(available,label);
    setChoices(drill,option('',parent ? 'Choose a city' : 'Choose a country') + values.map(value=>option(value,label(value))).join(''),'');
    find('.exploration-drill-field').hidden = Boolean(city) || !values.length;
    host.dataset.companyScope = String(hasCompanyScope(state));
    doc.dispatchEvent(new Event('atlas:controls-sync'));
  }

  popup.addEventListener('openchange',event=>{if (event.detail.value) beginDraft();});
  trigger.addEventListener('click',()=>{if (!popup.api) nativePopup ? closeCountries() : openCountries();});
  find('[data-draft-cancel]').addEventListener('click',()=>{if (!popup.api) closeCountries();});
  doc.addEventListener('pointerdown',event=>{
    if (nativePopup && !popup.contains(event.target)) closeCountries();
  });
  panel.addEventListener('keydown',event=>{
    if (nativePopup && event.key==='Escape') { event.preventDefault(); closeCountries(); }
  });
  search.addEventListener('input',renderDraft);
  draftFields.forEach(control=>control.addEventListener('change',renderDraft));
  options.addEventListener('change',event=>{
    const input=event.target;
    if (!input.matches?.('input[type=checkbox]')) return;
    const code=input.closest('[data-hq]')?.dataset.hq;
    if (!code) return;
    if (input.checked) draft.add(code);
    else draft.delete(code);
    renderDraft();
  });
  clearDraft.addEventListener('click',()=>{
    draft.clear();
    if (narrow?.matches) draftFields.forEach(control=>{control.value='';});
    renderDraft();
    search.focus();
  });
  finish.addEventListener('click',()=>{
    try {
      onChange(narrow?.matches ? {...draftFacets(),countries:[...draft]} : {countries:[...draft]});
      closeCountries();
    } catch {
      failed.hidden = false;
      finish.textContent = 'Retry';
    }
  });
  fields.forEach(control=>control.addEventListener('change',()=>onChange({[control.dataset.explorationField]:control.value})));
  chips.addEventListener('click',event=>{
    const item = event.target.closest('[data-remove-facet]');
    if (!item) return;
    const key = item.dataset.removeFacet;
    onChange(key==='country' ? {countries:state.countries.filter(code=>code!==item.dataset.value)} : {[key]:''});
    (chips.querySelector('button') || trigger).focus();
  });
  clearFacets.addEventListener('click',()=>{onChange({countries:[],...Object.fromEntries(companyFacets.map(({key})=>[key,'']))});trigger.focus();});
  breadcrumb.addEventListener('click',event=>{
    const link = event.target.closest('[data-drill-parent]');
    if (!link) return;
    onChange(link.dataset.drillParent==='all' ? {drillCountry:'',drillCity:''} : {drillCity:''});
    const parent = breadcrumb.querySelector('button');
    if (parent) parent.focus();
    else focusLocation();
  });
  drill.addEventListener('change',()=>{
    if (drill.value) onChange(state.drillCountry ? {drillCity:drill.value} : {drillCountry:drill.value,drillCity:''});
    if (find('.exploration-drill-field').hidden) (breadcrumb.querySelector('button') || trigger).focus();
  });
  return {update,openCountries};
}
