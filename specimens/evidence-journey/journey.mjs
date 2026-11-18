import { escapeHtml as esc } from '../../web/logic.js';
import { checkSourceRead, checkPreview, checkProposal, compareMain, describePublication,
  explainError, freshSession, previewMatchesSource } from './model.mjs';
import { renderClaim, renderPreview, renderReadbacks, renderResults } from './render.mjs';

const owners = new WeakMap();

export function mountEvidenceJourney(root, { rows, claimsFor, candidateFor, adapters, inspector = null }) {
  if (!root?.isConnected) throw new TypeError('Mount a connected, authored journey root.');
  owners.get(root)?.destroy();
  const doc = root.ownerDocument, view = doc.defaultView, prefix = root.dataset.ejPrefix;
  const listeners = new view.AbortController();
  const sessions = new Map(), rendered = new Map();
  let selected = null, opener = null, visibleRows = rows, disposed = false, epoch = 0, inFlight = null;
  const query = hook => root.querySelector(`[data-ej-${hook}]`);
  const action = name => root.querySelector(`[data-ej-action="${name}"]`);
  const session = () => selected ? sessions.get(selected) : null;
  const visible = () => doc.visibilityState !== 'hidden';
  const usable = element => element?.isConnected && root.contains(element) && !element.disabled && !element.closest('[hidden],[inert]');
  const focus = element => { if (visible() && usable(element)) element.focus({ preventScroll: true }); };
  const message = text => { query('status').textContent = text; };
  const setHTML = (hook, html) => {
    if (rendered.get(hook) !== html) { query(hook).innerHTML = html; rendered.set(hook, html); }
  };
  const listen = (element, type, handler) => element.addEventListener(type, handler, { signal: listeners.signal });

  function render() {
    if (disposed) return;
    const item = session(), row = rows.find(value => value.id === selected);
    query('entity-heading').textContent = row?.name || 'Choose a record';
    query('identity').textContent = row?.id || 'No entity selected';
    query('membership').hidden = !selected || visibleRows.some(value => value.id === selected);
    root.querySelector('.ej-dossier').setAttribute('aria-busy', String(Boolean(item?.busy)));
    for (const element of root.querySelectorAll('[data-ej-row]')) {
      const active = element.dataset.ejRow === selected;
      element.dataset.selected = String(active);
      element.querySelector('[data-ej-select]').setAttribute('aria-pressed', String(active));
    }
    const claims = row ? claimsFor(row.id, item?.source) : [];
    const claim = claims.find(value => value.key === item?.claimKey);
    const hasCandidate = Boolean(claim && candidateFor(selected, claim.key));
    action('close').disabled = !item;
    action('source').disabled = !item || Boolean(item.busy);
    action('cancel').disabled = !item?.busy;
    action('review').disabled = !item?.source || !hasCandidate || Boolean(item?.busy) || item.uncertain || item.recoveryNotFound || claim?.knowledge === 'conflict';
    action('simulate').disabled = !item?.previewValid || !previewMatchesSource(item?.preview, item?.source) || Boolean(item?.busy) || item.uncertain || item.recoveryNotFound || Boolean(item.proposal) || Boolean(item.error);
    action('recover').disabled = !item?.preview || !item.uncertain || Boolean(item?.busy);
    action('readback').disabled = !item?.preview || Boolean(item?.busy);
    query('source-status').textContent = item?.busy === 'source' ? 'Reading the selected source record…' : item?.source
      ? `Last successful source read: ${item.source.revision}. This source-file context is separate from publication.`
      : row ? 'Published specimen context remains visible. The editable source record has not been read.' : 'Select a record to inspect its evidence.';
    if (!row) setHTML('claims', '');
    else if (!claims.length) setHTML('claims', '<p class="atlas-empty">No profile claims recorded in this specimen. This does not establish that the entity has no such facts.</p>');
    else setHTML('claims', `<div class="ej-claim-layout"><section aria-label="Recorded and missing claims"><h3>Claims</h3><ul class="ej-claim-list">${claims.map(value => `<li><button type="button" data-ej-claim="${esc(value.key)}" aria-pressed="${value.key === item.claimKey}"><span>${esc(value.label)}</span><span class="ej-meta">${({recorded:'Recorded',unknown:'Not recorded',conflict:'Conflicting sources'})[value.knowledge] || 'Needs review'}</span></button></li>`).join('')}</ul></section><section class="ej-source-rail" aria-labelledby="${prefix}-claim-title"><h3 id="${prefix}-claim-title" tabindex="-1">${esc(claim?.label || 'Choose a claim')}</h3>${claim ? renderClaim(claim) : ''}</section></div>`);
    query('review-reason').textContent = item?.uncertain ? 'Keep the original reviewed intent until read-only recovery resolves the uncertain outcome.' : item?.recoveryNotFound ? 'No matching proposal was observed. This does not authorise an automatic retry; the record owner must inspect the original intent.' : item?.preview && (!item.previewValid || !previewMatchesSource(item.preview, item.source)) ? 'This retained preview cannot be proposed. Read the current source, reconcile its baseline and validate the exact intent again.' : hasCandidate
      ? 'Review the proposed region correction against its exact source record.' : 'This selected claim has no correction candidate. Missing and conflicting evidence remain explicit.';
    setHTML('preview', renderPreview(item?.preview));
    setHTML('readbacks', renderReadbacks(item || {}));
    query('error').hidden = !item?.error;
    if (item?.error) {
      doc.getElementById(`${prefix}-error-title`).textContent = item.error.title;
      query('error-message').textContent = `${item.error.code}: ${item.error.message}`;
      query('error-action').textContent = item.error.action;
    }
    doc.dispatchEvent(new view.Event('atlas:controls-sync'));
  }

  function interrupt(reason = 'Read interrupted') {
    epoch += 1;
    inFlight?.abort();
    inFlight = null;
    const item = session();
    if (!item?.busy) return;
    const mayHaveWritten = item.busy === 'simulate' || item.busy === 'recover';
    item.busy = null;
    if (mayHaveWritten) item.uncertain = true;
    item.error = explainError({ code: mayHaveWritten ? 'WRITE_UNCERTAIN' : 'INTERRUPTED', message: reason });
    render();
    message(`${item.error.title}. ${item.error.action}`);
  }

  async function run(kind, operation, prepare) {
    const item = session(), id = selected;
    if (disposed || !root.isConnected || !item || item.busy) return false;
    const token = ++epoch;
    inFlight = new view.AbortController();
    item.busy = kind;
    item.error = null;
    render();
    message(kind === 'source' ? `Reading source for ${rows.find(row => row.id === id).name}.` : `Synthetic ${kind} read in progress.`);
    try {
      const result = await operation(inFlight.signal);
      if (disposed || !root.isConnected || token !== epoch || id !== selected) return false;
      // Preparation is pure: asynchronous integrity checks must finish before a
      // current-generation check permits any retained-session mutation.
      const patch = await prepare(result, item);
      if (disposed || !root.isConnected || token !== epoch || id !== selected) return false;
      Object.assign(item, patch);
      message(item.error ? `${item.error.title}. ${item.error.action}` : ({source:'Source record ready.',review:'Preview ready. Nothing saved.',simulate:'Synthetic proposal receipt inspected. Main and publication remain separate.',recover:'Read-only recovery finished.',readback:'Independent readbacks received. Review each context.'})[kind]);
      return true;
    } catch (error) {
      if (disposed || !root.isConnected || token !== epoch || id !== selected) return false;
      item.error = explainError(error);
      if (['RECORD_CONFLICT', 'STALE_REVISION', 'VALIDATION_CONFLICT', 'SOURCE_INHERITANCE', 'IDENTITY_CONFLICT', 'AMBIGUOUS_ID'].includes(error?.code)) item.previewValid = false;
      if (kind === 'simulate' || kind === 'recover') item.uncertain = true;
      message(`${item.error.title}. ${item.error.action}`);
      return false;
    } finally {
      if (!disposed && token === epoch) { item.busy = null; inFlight = null; render(); }
    }
  }

  function readSource() {
    const id = selected;
    return run('source', signal => adapters.readSource(id, { signal }), async (value, item) => {
      const next = await checkSourceRead(value, id);
      const error = item.preview && !previewMatchesSource(item.preview, next)
        ? explainError({ code: next.recordRevision === item.preview.recordRevision ? 'STALE_REVISION' : 'RECORD_CONFLICT', message: 'A fresh source read differs from the review baseline or validation snapshot.' }) : null;
      return {source: next, error, previewValid: Boolean(item.previewValid && !error)};
    });
  }

  function select(id, { opener: nextOpener = null, focus: focusPolicy = 'preserve' } = {}) {
    if (disposed || !rows.some(row => row.id === id)) return false;
    if (inspector?.select && inspector.select(id, { opener: nextOpener, focus: focusPolicy }) === false) return false;
    if (selected !== id) interrupt('Selection changed before the read completed.');
    selected = id;
    opener = nextOpener;
    if (!sessions.has(id)) {
      const item = freshSession();
      item.claimKey = claimsFor(id, null)[0]?.key || null;
      sessions.set(id, item);
    }
    render();
    if (!inspector && focusPolicy === 'panel') focus(query('entity-heading'));
    if (!session().source && !session().busy) void readSource();
    return true;
  }

  function close({ restoreFocus = true } = {}) {
    if (disposed || !selected) return false;
    const previous = selected, target = opener;
    interrupt('Inspection closed before the read completed.');
    selected = null;
    opener = null;
    render();
    if (inspector?.close) inspector.close({ reason: 'dismiss', restoreFocus });
    else if (restoreFocus) {
      const current = [...root.querySelectorAll('[data-ej-select]')].find(element => element.dataset.ejSelect === previous);
      focus(usable(target) ? target : usable(current) ? current : doc.getElementById(`${prefix}-results`));
    }
    message('Inspection closed. Search and filters are preserved.');
    return true;
  }

  function review() {
    const item = session(), candidate = item && candidateFor(selected, item.claimKey);
    if (!item?.source || !candidate || item.uncertain || item.recoveryNotFound || item.busy ||
        claimsFor(selected, item.source).find(claim => claim.key === item.claimKey)?.knowledge === 'conflict') return Promise.resolve(false);
    const intent = structuredClone(candidate);
    if (intent.id !== selected || intent.expectedRecordRevision !== item.source.recordRevision) {
      item.error = explainError({ code: 'RECORD_CONFLICT', message: 'The correction candidate belongs to a different source record revision.' });
      render();
      return Promise.resolve(false);
    }
    item.proposal = item.main = item.publication = null;
    item.previewValid = false;
    const source = structuredClone(item.source);
    const promise = run('review', signal => adapters.validate(structuredClone(intent), { signal }), async value => ({
      preview: await checkPreview(value, source, intent), previewValid: true, intent, stage: 'review',
    }));
    focus(doc.getElementById(`${prefix}-review`));
    return promise;
  }

  function simulate() {
    const item = session();
    if (!item?.previewValid || !previewMatchesSource(item?.preview, item?.source) || item.busy || item.error || item.uncertain || item.recoveryNotFound || item.proposal) return Promise.resolve(false);
    const preview = structuredClone(item.preview);
    const promise = run('simulate', signal => adapters.simulateProposal(structuredClone(item.intent), structuredClone(preview), { signal }), async value => ({
      proposal: await checkProposal(value, preview), uncertain: false, stage: 'readback',
    }));
    focus(doc.getElementById(`${prefix}-readback`));
    return promise;
  }

  function recover() {
    const item = session();
    if (!item?.preview || !item.uncertain || item.busy) return Promise.resolve(false);
    const preview = structuredClone(item.preview);
    return run('recover', signal => adapters.recoverProposal(structuredClone(item.intent), { signal }), async value => {
      if (value?.status === 'not_found') {
        if (value.intentDigest !== preview.intentDigest || value.id !== preview.id || value.branch !== preview.branch) throw new Error('Recovery did not identify the original intent.');
        return {recoveryNotFound: true, uncertain: false};
      }
      return {proposal: await checkProposal(value, preview), uncertain: false};
    });
  }

  function readback() {
    const item = session(), id = selected;
    if (!item?.preview || item.busy) return Promise.resolve(false);
    const preview = structuredClone(item.preview);
    const promise = run('readback', signal => Promise.allSettled([
      Promise.resolve().then(() => adapters.readMain(id, { signal })),
      Promise.resolve().then(() => adapters.readPublished(id, { signal })),
    ]), async (values, current) => {
      const [main, published] = values;
      const publicationInput = published.status === 'fulfilled' ? structuredClone(published.value) : null;
      const patch = {stage: 'readback'};
      let firstError = null;
      try {
        if (main.status === 'rejected') throw main.reason;
        patch.main = await compareMain(main.value, preview);
        if (!previewMatchesSource(preview, patch.main.value)) patch.previewValid = false;
      } catch (error) { patch.main = { status: 'unavailable', value: current.main?.value, error: explainError(error) }; firstError = error; }
      try {
        if (published.status === 'rejected') throw published.reason;
        patch.publication = describePublication(publicationInput, id, patch.main.status === 'unavailable' ? null : patch.main.value.revision);
      } catch (error) { patch.publication = { status: 'unavailable', value: current.publication?.value, error: explainError(error) }; firstError ||= error; }
      if (firstError) patch.error = explainError(firstError);
      return patch;
    });
    focus(doc.getElementById(`${prefix}-readback`));
    return promise;
  }

  function setResults(nextRows, { status = 'ready', reason = '' } = {}) {
    if (disposed) return;
    if (status === 'ready') {
      visibleRows = nextRows.filter(row => rows.some(known => known.id === row.id));
      setHTML('results', renderResults(visibleRows, prefix, selected));
      for (const control of root.querySelectorAll('[data-ej-select]')) control.disabled = false;
      query('count').textContent = `${visibleRows.length} of ${rows.length} synthetic records`;
    }
    query('results-state').hidden = status === 'ready' && visibleRows.length > 0;
    query('results-state').textContent = status === 'error' ? `Search unavailable. ${reason} Earlier results retain their original context.` : status === 'loading' ? 'Searching the supplied synthetic snapshot…' : 'No matches for these filters. Clear the search or filters to recover.';
    render();
    message(status === 'ready' ? `${visibleRows.length} synthetic records match. ${selected && !visibleRows.some(row => row.id === selected) ? 'The inspected entity remains selected outside these results.' : ''}` : query('results-state').textContent);
  }

  function resetDemo() {
    if (disposed) return;
    interrupt('Synthetic scenario changed.');
    sessions.clear();
    const id = selected;
    selected = null;
    rendered.clear();
    if (id) select(id, { opener }); else render();
  }

  listen(root, 'click', event => {
    const control = event.target.closest('button,a[data-ej-open]');
    if (!control || control.closest('[data-evidence-journey]') !== root || control.disabled) return;
    if (control.dataset.ejSelect || control.dataset.ejOpen) {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      select(control.dataset.ejSelect || control.dataset.ejOpen, { opener: control, focus: control.dataset.ejOpen ? 'panel' : 'preserve' });
      return;
    }
    if (control.dataset.ejClaim && session()) {
      if (!claimsFor(selected, session().source).some(claim => claim.key === control.dataset.ejClaim)) return;
      interrupt('Claim changed before the read completed.');
      session().claimKey = control.dataset.ejClaim;
      render();
      focus(doc.getElementById(`${prefix}-claim-title`));
      return;
    }
    const handlers = { close, source: readSource, review, simulate, recover, readback, cancel: () => interrupt('Read cancelled explicitly.') };
    const handler = handlers[control.dataset.ejAction];
    if (handler) void handler();
  });
  listen(root, 'keydown', event => {
    if (event.key === 'Escape' && !event.defaultPrevented && !event.target.closest('ui-select,select,input,textarea') && root.querySelector('.ej-dossier').contains(event.target)) {
      event.preventDefault(); close();
    }
  });
  listen(doc, 'visibilitychange', () => { if (!visible()) interrupt('Document hidden before the read completed.'); });
  listen(view, 'pagehide', () => interrupt('Page left before the read completed.'));
  query('fallback').hidden = true;
  query('mode').textContent = 'Interactive synthetic specimen. No service connection, record write, merge or publication is performed.';
  for (const control of root.querySelectorAll('[data-ej-select]')) control.disabled = false;
  render();

  const api = { select, close, review, simulate, recover, readback, readSource, setResults, resetDemo,
    snapshot: () => structuredClone({ selected, visibleIds: visibleRows.map(row => row.id), session: session(), disposed }),
    destroy() {
      if (disposed) return;
      interrupt('Journey disposed before the read completed.');
      disposed = true;
      listeners.abort();
      if (owners.get(root) === api) owners.delete(root);
      query('fallback').hidden = false;
      for (const control of root.querySelectorAll('[data-ej-select],[data-ej-claim],[data-ej-action]')) control.disabled = true;
      query('mode').textContent = 'Interactive review stopped. Static synthetic evidence remains available below.';
    },
  };
  owners.set(root, api);
  return api;
}
