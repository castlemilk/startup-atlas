import { searchSnapshot } from '../../web/graph-model.js';
import { mountEvidenceJourney } from './journey.mjs';

const failure = (code, message) => Object.assign(new Error(message), { code });
const owners = new WeakMap();

export function createSyntheticAdapters(fixtures, outcome = () => 'pending') {
  const value = item => Promise.resolve(structuredClone(item));
  const requireAster = id => { if (id !== fixtures.edit.id) throw failure('NOT_FOUND', 'This synthetic readback is defined only for Specimen Aster.'); };
  return {
    readSource(id) {
      if (outcome() === 'source-error') return Promise.reject(failure('NOT_FOUND', 'No editable source envelope was supplied for this synthetic outcome.'));
      return fixtures.sourceRecords[id] ? value(fixtures.sourceRecords[id]) : Promise.reject(failure('NOT_FOUND', 'No source record in this fixture.'));
    },
    validate(edit) {
      requireAster(edit.id);
      if (outcome() === 'conflict') return Promise.reject(failure('RECORD_CONFLICT', 'The synthetic whole-record revision changed after the source read.'));
      if (outcome() === 'stale') return Promise.reject(failure('STALE_REVISION', 'The synthetic main revision changed before validation.'));
      return value(fixtures.preview);
    },
    simulateProposal(edit) {
      requireAster(edit.id);
      if (['uncertain', 'not-found'].includes(outcome())) return Promise.reject(failure('WRITE_UNCERTAIN', 'This synthetic response was lost after an unconfirmed proposal attempt.'));
      return value(fixtures.proposal);
    },
    recoverProposal(edit) {
      requireAster(edit.id);
      return value(outcome() === 'not-found' ? {status:'not_found', id:edit.id, intentDigest:fixtures.preview.intentDigest, branch:fixtures.preview.branch} : fixtures.proposal);
    },
    readMain(id) {
      requireAster(id);
      if (outcome() === 'unavailable') return Promise.reject(failure('UNAVAILABLE', 'Synthetic source read unavailable; the reviewed intent is retained.'));
      return value(outcome() === 'mismatch' ? fixtures.mainBefore : fixtures.mainAfter);
    },
    readPublished(id) {
      requireAster(id);
      if (outcome() === 'index-error') return Promise.reject(failure('INDEX_UNAVAILABLE', 'The synthetic published projection is unavailable.'));
      return value(outcome() === 'current' ? fixtures.publishedAfter : fixtures.publishedBefore);
    },
  };
}

export function mountDemo(root, fixtures, { adapters, inspector, selectFirst = false } = {}) {
  owners.get(root)?.destroy();
  const doc = root.ownerDocument, view = doc.defaultView;
  const abort = new view.AbortController();
  const query = root.querySelector('[data-ej-query]'), country = root.querySelector('[data-ej-country]');
  const scenario = root.querySelector('[data-ej-scenario]'), clear = root.querySelector('[data-ej-clear]');
  let composing = false, ignoreCompositionEnd = false, committed = '', disposed = false;
  const graph = { entities: fixtures.rows, edges: [], funding_rounds: [], articles: [] };
  const journey = mountEvidenceJourney(root, {
    rows: fixtures.rows, claimsFor: id => fixtures.claims[id] || [],
    candidateFor: (id, key) => id === fixtures.edit.id && key === 'deployment-region' ? fixtures.edit : null,
    adapters: adapters || createSyntheticAdapters(fixtures, () => scenario.value), inspector,
  });
  const listen = (element, type, handler, capture = false) => element.addEventListener(type, handler, { signal: abort.signal, capture });
  const syncSDK = () => doc.dispatchEvent(new view.Event('atlas:controls-sync'));

  function apply(history = 'replace') {
    const rows = searchSnapshot(graph, committed).filter(row => country.value === 'all' || row.country === country.value);
    journey.setResults(rows);
    clear.hidden = !query.value;
    if (history) {
      const url = new URL(view.location.href);
      for (const [key, value] of [['ejq', committed], ['ejcountry', country.value === 'all' ? '' : country.value]]) {
        if (value) url.searchParams.set(key, value); else url.searchParams.delete(key);
      }
      if (url.href !== view.location.href) view.history[history === 'push' ? 'pushState' : 'replaceState'](null, '', url);
    }
    syncSDK();
  }

  function restore() {
    const params = new URL(view.location.href).searchParams;
    committed = (params.get('ejq') || '').slice(0, 200);
    query.value = committed;
    country.value = ['Australia', 'New Zealand'].includes(params.get('ejcountry')) ? params.get('ejcountry') : 'all';
    composing = false;
    ignoreCompositionEnd = true;
    apply(null);
  }

  listen(query, 'compositionstart', () => { composing = true; ignoreCompositionEnd = false; });
  listen(query, 'compositionend', () => {
    composing = false;
    if (ignoreCompositionEnd) { query.value = committed; syncSDK(); return; }
    committed = query.value.slice(0, 200); apply();
  });
  listen(query, 'input', event => {
    if (composing || event.isComposing) return;
    committed = query.value.slice(0, 200); apply();
  });
  listen(root.querySelector('[data-ej-search-form]'), 'submit', event => {
    event.preventDefault();
    if (composing) return;
    committed = query.value.slice(0, 200); apply();
  });
  listen(country, 'change', () => apply('push'));
  listen(clear, 'click', () => {
    composing = false; ignoreCompositionEnd = true; committed = '';
    if (!clear.closest('ui-input-clear')) {
      query.value = ''; query.dispatchEvent(new view.Event('input', {bubbles:true})); query.focus();
    }
  }, true);
  listen(root.querySelector('[data-ej-reset]'), 'click', () => {
    composing = false; ignoreCompositionEnd = true; committed = ''; query.value = ''; country.value = 'all';
    apply('push'); query.focus();
  });
  listen(scenario, 'change', () => journey.resetDemo());
  listen(view, 'popstate', restore);
  for (const control of [query, country, scenario, clear, root.querySelector('[data-ej-reset]')]) control.disabled = false;
  restore();
  const hashId = view.location.hash.slice(1);
  const linked = fixtures.rows.find(row => hashId === `${root.dataset.ejPrefix}-fallback-${row.id}`);
  if (linked || selectFirst) journey.select(linked?.id || fixtures.rows[0].id);
  const api = { journey, destroy() {
    if (disposed) return;
    disposed = true;
    abort.abort(); journey.destroy();
    for (const control of [query, country, scenario, clear, root.querySelector('[data-ej-reset]')]) control.disabled = true;
    if (owners.get(root) === api) owners.delete(root);
    syncSDK();
  } };
  owners.set(root, api);
  return api;
}
