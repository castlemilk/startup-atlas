import assert from 'node:assert/strict';
import { after, afterEach, beforeEach, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { setupAtlasDOM, settleAtlasDOM } from './support/atlas-sdk-dom.js';
import fixtures from '../specimens/evidence-journey/fixtures.json' with { type: 'json' };
import { buildFixtures } from '../specimens/evidence-journey/fixture-source.mjs';
import { renderJourney, renderDocument, sourceLink } from '../specimens/evidence-journey/render.mjs';
import { mountEvidenceJourney } from '../specimens/evidence-journey/journey.mjs';
import { mountDemo, createSyntheticAdapters } from '../specimens/evidence-journey/demo.mjs';
import { checkSourceRead, checkPreview, checkProposal, compareMain, describePublication, claimValue } from '../specimens/evidence-journey/model.mjs';
import { recordRevision, startupEditIdentity, prepareStartupEdit } from '../backend/hosted/src/startup-edit.mjs';

const dom = setupAtlasDOM();
const { installAtlasSDK, atlasUIAgent } = await import('../web/atlas-sdk.js');
let sdk = installAtlasSDK(document), mounted = [], hidden = false;
Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => hidden ? 'hidden' : 'visible' });
const aster = fixtures.edit.id, lumen = 'startup:specimen-lumen', north = 'startup:specimen-north';
const clone = value => structuredClone(value);
const sourceSnapshot = source => ({research:{startups:[clone(source.record)]},head:source.revision,
  graph:{entities:clone(fixtures.rows)},leads:[],catalogue:{opportunities:[]}});
const defer = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return {promise, resolve, reject}; };

function markup(prefix = 'evidence') {
  const parent = document.createElement('div');
  parent.innerHTML = renderJourney(fixtures, prefix);
  document.body.append(parent);
  return parent.firstElementChild;
}

function mount({ prefix = 'evidence', adapters = createSyntheticAdapters(fixtures), inspector = null, demo = false } = {}) {
  const root = markup(prefix);
  const instance = demo ? mountDemo(root, fixtures, {adapters, inspector}) : mountEvidenceJourney(root, {
    rows:fixtures.rows, claimsFor:id => fixtures.claims[id] || [],
    candidateFor:(id,key) => id === aster && key === 'deployment-region' ? fixtures.edit : null,
    adapters, inspector,
  });
  mounted.push(instance);
  return {root, instance, api:instance.journey || instance};
}

const select = async (api, id = aster, options = {}) => { assert.equal(api.select(id, options), true); await settleAtlasDOM(); };
const click = (root, action) => root.querySelector(`[data-ej-action="${action}"]`).click();
const by = (root, hook) => root.querySelector(`[data-ej-${hook}]`);
const selectedButton = (root, id = aster) => [...root.querySelectorAll('[data-ej-select]')].find(button => button.dataset.ejSelect === id);

beforeEach(() => { sdk.destroy(); document.body.innerHTML = ''; window.history.replaceState(null,'','/startup-atlas/'); hidden = false; });
afterEach(() => { for (const instance of mounted) instance.destroy(); mounted = []; sdk.destroy(); });
after(() => dom.window.close());

test('synthetic fixtures reproduce through the existing source validator with one bounded claim change', async () => {
  assert.deepEqual(await buildFixtures(), fixtures);
  assert.deepEqual(fixtures.preview.changedPaths, ['/profile_facts/0/value']);
  assert.deepEqual(fixtures.proposal.record, fixtures.preview.merged);
  assert.deepEqual(fixtures.mainAfter.record, fixtures.preview.merged);
  assert.equal(fixtures.mainBefore.recordRevision, fixtures.preview.recordRevision);
  assert.equal(fixtures.mainAfter.recordRevision, fixtures.preview.nextRecordRevision);
  assert.notEqual(fixtures.proposal.revision, fixtures.mainAfter.revision);
  assert.equal(fixtures.proposal.published, false);
  assert.equal(fixtures.synthetic, true);
  assert.equal(Object.hasOwn(fixtures.sourceRecords[north].record, 'profile_facts'), false);
});

test('static markup has complete evidence, useful local dossiers, unique labels and no enabled script-only actions', () => {
  const root = markup();
  assert.equal(by(root,'fallback').hidden, false);
  assert.match(by(root,'fallback').textContent, /Australia and|Australia/);
  assert.match(by(root,'fallback').textContent, /Conflicting sources/);
  assert.match(by(root,'fallback').textContent, /Review date not recorded/);
  assert.match(by(root,'fallback').textContent, /No profile claims recorded/);
  for (const button of root.querySelectorAll('button')) assert.equal(button.disabled, true);
  for (const anchor of root.querySelectorAll('a[data-ej-open]')) assert.ok(document.getElementById(anchor.hash.slice(1)));
  for (const label of root.querySelectorAll('label[for]')) assert.ok(document.getElementById(label.htmlFor));
  assert.equal(root.querySelectorAll('img,iframe,video').length, 0);
  assert.match(renderDocument(fixtures), /lang="en-AU"/);
});

test('missing, null, empty and numeric zero values remain distinguishable in the presentation', () => {
  assert.equal(claimValue({knowledge:'unknown'}), 'Not recorded');
  assert.equal(claimValue({knowledge:'recorded',value:null}), 'Not recorded');
  assert.equal(claimValue({knowledge:'recorded',value:''}), 'Recorded empty value');
  assert.equal(claimValue({knowledge:'recorded',value:0}), '0');
});

test('data text is escaped and unsafe sources never become executable or credential-bearing links', () => {
  assert.doesNotMatch(sourceLink('javascript:alert(1)'), /href=/);
  assert.doesNotMatch(sourceLink('https://person:secret@example.com'), /href=/);
  const exact = 'https://aster.example.com/regions?part=1&other=2#quoted';
  const parsed = new window.DOMParser().parseFromString(sourceLink(exact, '<script>'), 'text/html');
  assert.equal(parsed.querySelector('a').getAttribute('href'), exact);
  assert.equal(parsed.querySelectorAll('script').length, 0);
});

test('preview binding rejects wrong identity, revision and altered baseline content', async () => {
  for (const change of [value => value.id = lumen, value => value.revision = 'd'.repeat(40), value => value.recordRevision = 'e'.repeat(64), value => value.previous.name = 'Wrong record']) {
    const value = clone(fixtures.preview); change(value);
    await assert.rejects(checkPreview(value, fixtures.mainBefore, fixtures.edit), {code:'READBACK_MISMATCH'});
  }
});

test('proposal acceptance requires matching intent, head, full record and unpublished source context', async () => {
  for (const change of [value => value.id = lumen, value => value.intentDigest = 'd'.repeat(64), value => value.revision = 'c'.repeat(40), value => value.record.profile_facts[0].source = 'https://other.example.com', value => value.published = true]) {
    const value = clone(fixtures.proposal); change(value);
    await assert.rejects(checkProposal(value, fixtures.preview), {code:'READBACK_MISMATCH'});
  }
  for (const status of ['proposed','closed','merged']) assert.equal((await checkProposal({...fixtures.proposal,status},fixtures.preview)).published, false);
});

test('main readback compares full record as well as digest without mistaking object-key order for change', async () => {
  assert.equal((await compareMain(fixtures.mainAfter,fixtures.preview)).status,'matching');
  assert.equal((await compareMain(fixtures.mainBefore,fixtures.preview)).status,'mismatch');
  const changed = clone(fixtures.mainAfter); changed.record.profile_facts[0].value = 'Different';
  await assert.rejects(compareMain(changed,fixtures.preview), {code:'READBACK_MISMATCH'});
  changed.recordRevision = await recordRevision(aster, changed.record);
  assert.equal((await compareMain(changed,fixtures.preview)).status,'mismatch');
  const reordered = clone(fixtures.mainAfter); reordered.record = Object.fromEntries(Object.entries(reordered.record).reverse());
  assert.equal((await compareMain(reordered,fixtures.preview)).status,'matching');
  await assert.rejects(compareMain({...fixtures.mainAfter,origin:'proposal'},fixtures.preview), {code:'READBACK_MISMATCH'});
});

test('published revision state is qualified independently and contradictory current labels reject', () => {
  assert.equal(describePublication(fixtures.publishedBefore,aster).status,'pending_publication');
  assert.equal(describePublication(fixtures.publishedAfter,aster).status,'current');
  assert.throws(() => describePublication({...fixtures.publishedBefore,indexStatus:'current'},aster), {code:'READBACK_MISMATCH'});
  assert.throws(() => describePublication(fixtures.publishedAfter,lumen), {code:'READBACK_MISMATCH'});
  assert.equal(describePublication({startup:{id:aster},revision:null,mainRevision:null,indexStatus:'unknown'},aster).status,'unknown');
});

test('a valid preview for another edit cannot substitute for the exact reviewed candidate', async () => {
  const otherEdit = clone(fixtures.edit);
  otherEdit.patch.profile_facts[0].value = 'A different proposed region';
  const other = await prepareStartupEdit(sourceSnapshot(fixtures.mainBefore),otherEdit);
  await assert.rejects(checkPreview(other, fixtures.mainBefore, fixtures.edit), {code:'READBACK_MISMATCH'});
  const mixed = {...clone(fixtures.preview),merged:other.merged,nextRecordRevision:other.nextRecordRevision};
  await assert.rejects(checkPreview(mixed, fixtures.mainBefore, fixtures.edit), {code:'READBACK_MISMATCH'});
  const tampered = clone(fixtures.preview); tampered.merged.description = 'Altered contents';
  await assert.rejects(checkPreview(tampered, fixtures.mainBefore, fixtures.edit), {code:'READBACK_MISMATCH'});
});

test('source integrity checks identity and digest and copies caller-owned envelopes before hashing', async () => {
  const input = clone(fixtures.mainBefore);
  const accepted = checkSourceRead(input, aster);
  input.record.description = 'Caller changed the envelope during verification';
  assert.deepEqual((await accepted).record,fixtures.mainBefore.record);
  await assert.rejects(checkSourceRead(input,aster),{code:'READBACK_MISMATCH'});
  input.record.name = 'Wrong canonical entity'; input.recordRevision = await recordRevision(aster,input.record);
  await assert.rejects(checkSourceRead(input,aster),{code:'READBACK_MISMATCH'});
});

test('an exact same-intent proposal remains valid with its original older base after unrelated main advances', async () => {
  const source = {...clone(fixtures.mainBefore),revision:'d'.repeat(40)};
  const preview = await prepareStartupEdit(sourceSnapshot(source),fixtures.edit);
  await checkPreview(preview,source,fixtures.edit);
  assert.equal((await checkProposal(fixtures.proposal,preview)).baseRevision,fixtures.mainBefore.revision);
  assert.notEqual(fixtures.proposal.baseRevision,preview.revision);
});

test('a repository already-present receipt is an explicit no-op rather than an uncertain proposal', async () => {
  const edit = {...clone(fixtures.edit),expectedRecordRevision:fixtures.mainAfter.recordRevision};
  const preview = await prepareStartupEdit(sourceSnapshot(fixtures.mainAfter),edit);
  const receipt = {...clone(fixtures.mainAfter),...await startupEditIdentity(edit),status:'already_present'};
  assert.deepEqual(preview.previous,preview.merged);
  assert.equal((await checkProposal(receipt,preview)).status,'already_present');
  const adapters=createSyntheticAdapters(fixtures);
  adapters.simulateProposal=()=>({...clone(fixtures.mainAfter),intentDigest:fixtures.preview.intentDigest,branch:fixtures.preview.branch,status:'already_present'});
  const {root,api}=mount({adapters}); await select(api); await api.review(); await api.simulate();
  assert.equal(api.snapshot().session.uncertain,false);
  assert.match(by(root,'readbacks').textContent,/Already present; no proposal/);
  assert.match(by(root,'readbacks').textContent,/No proposal was created/);
});

test('publication does not claim current when its main observation differs from an independent source read', async () => {
  const adapters=createSyntheticAdapters(fixtures);
  adapters.readPublished=()=>({...clone(fixtures.publishedAfter),revision:fixtures.mainBefore.revision,mainRevision:fixtures.mainBefore.revision});
  const {root,api}=mount({adapters}); await select(api); await api.review(); await api.readback();
  assert.equal(api.snapshot().session.publication.status,'context_mismatch');
  assert.match(by(root,'readbacks').textContent,/Main observations disagree/);
  assert.match(by(root,'readbacks').textContent,/Independent source main/);
  assert.doesNotMatch(by(root,'readbacks').textContent,/Reported snapshot revisions agree/);
});

test('source snapshot or record changes permanently invalidate a retained preview until fresh validation', async () => {
  for (const next of [{...clone(fixtures.mainBefore),revision:'d'.repeat(40)},fixtures.mainAfter]) {
    let current=fixtures.mainBefore;
    const adapters=createSyntheticAdapters(fixtures); adapters.readSource=()=>clone(current);
    const {root,api}=mount({prefix:`changed-${next===fixtures.mainAfter?'record':'snapshot'}`,adapters});
    await select(api); await api.review(); current=next; await api.readSource();
    assert.equal(api.snapshot().session.previewValid,false);
    assert.deepEqual(api.snapshot().session.preview,fixtures.preview);
    await api.readback();
    assert.equal(api.snapshot().session.error,null);
    assert.equal(await api.simulate(),false);
    assert.equal(root.querySelector('[data-ej-action="simulate"]').disabled,true);
    assert.match(by(root,'review-reason').textContent,/retained preview cannot be proposed/);
  }
});

test('failed revalidation cannot be undone by a successful unrelated read', async () => {
  const adapters=createSyntheticAdapters(fixtures);
  const {api}=mount({adapters}); await select(api); await api.review();
  adapters.validate=()=>Promise.reject(Object.assign(new Error('Source advanced'),{code:'STALE_REVISION'}));
  assert.equal(await api.review(),false);
  adapters.readMain=()=>clone(fixtures.mainBefore);
  await api.readback();
  assert.equal(api.snapshot().session.previewValid,false);
  assert.equal(await api.simulate(),false);
});

test('synchronous main-read failure still yields the independent published context', async () => {
  const adapters=createSyntheticAdapters(fixtures); let publishedReads=0;
  adapters.readMain=()=>{throw new Error('Synchronous source adapter failure');};
  adapters.readPublished=()=>{publishedReads++;return clone(fixtures.publishedAfter);};
  const {root,api}=mount({adapters}); await select(api); await api.review(); await api.readback();
  assert.equal(publishedReads,1);
  assert.equal(api.snapshot().session.main.status,'unavailable');
  assert.equal(api.snapshot().session.publication.status,'current');
  assert.match(by(root,'readbacks').textContent,/independent main context has not been established/);
});

test('digest verification that finishes after A to B to A cannot mutate the retained A session', async () => {
  const {api}=mount(); await select(api);
  const started=defer(), release=defer();
  const original=crypto.subtle.digest; let calls=0;
  crypto.subtle.digest=async function(...args){if(++calls===1){started.resolve();await release.promise;}return original.apply(this,args);};
  try {
    const attempt=api.review(); await started.promise;
    await select(api,lumen); await select(api,aster);
    const before=api.snapshot().session;
    release.resolve(); assert.equal(await attempt,false);
    assert.deepEqual(api.snapshot().session,before);
    assert.equal(api.snapshot().session.preview,null);
  } finally {release.resolve();crypto.subtle.digest=original;}
});

test('complete synthetic journey keeps preview, draft, authoritative main and publication distinct', async () => {
  const {root,api} = mount();
  const opener = selectedButton(root); opener.focus(); await select(api,aster,{opener});
  assert.equal(document.activeElement,opener);
  assert.equal(by(root,'entity-heading').textContent,'Specimen Aster');
  assert.match(by(root,'claims').textContent,/Australia/);
  assert.equal(await api.review(),true);
  assert.equal(document.activeElement.id,'evidence-review');
  assert.match(by(root,'preview').textContent,/Preview ready; nothing saved/);
  assert.equal(await api.simulate(),true);
  assert.equal(api.snapshot().session.proposal.published,false);
  assert.equal(api.snapshot().session.main,null);
  assert.equal(await api.readback(),true);
  const state = api.snapshot().session;
  assert.equal(state.main.status,'matching');
  assert.equal(state.publication.status,'pending_publication');
  assert.match(by(root,'readbacks').textContent,/Publication pending/);
  assert.match(by(root,'readbacks').textContent,/published: false/);
  assert.match(by(root,'readbacks').textContent,/does not establish publication/);
});

test('unknown, empty and conflict claims remain readable and cannot become unsupported edit payloads', async () => {
  const {root,api} = mount();
  await select(api);
  root.querySelector('[data-ej-claim="employee-count"]').click();
  assert.match(by(root,'claims').textContent,/Not recorded/);
  assert.equal(await api.review(),false);
  await select(api,lumen);
  assert.match(by(root,'claims').textContent,/No profile claims recorded/);
  assert.equal(await api.review(),false);
  await select(api,north);
  assert.match(by(root,'claims').textContent,/Conflicting sources/);
  assert.equal(by(root,'claims').querySelectorAll('.ej-alternatives li').length,2);
  assert.equal(await api.review(),false);
});

test('freshness review stays claim-specific after a newer record-level review', async () => {
  const {root,api} = mount(); await select(api);
  root.querySelector('[data-ej-claim="retention-window"]').click();
  const text = root.querySelector('.ej-source-rail').textContent;
  assert.match(text,/Needs freshness review/);
  assert.match(text,/2025-05-14/);
  assert.match(text,/Policy:/);
  assert.match(text,/Evaluated/);
  assert.doesNotMatch(text,/verified today|up to date/i);
});

test('filter membership does not implicitly close, retarget, discard review or move focus', async () => {
  const {root,api} = mount(); await select(api); await api.review();
  const query = by(root,'query'); query.disabled = false; query.focus();
  api.setResults([fixtures.rows.find(row=>row.id===lumen)]);
  assert.equal(api.snapshot().selected,aster);
  assert.equal(api.snapshot().session.preview.intentDigest,fixtures.preview.intentDigest);
  assert.equal(by(root,'membership').hidden,false);
  assert.equal(document.activeElement,query);
  assert.equal(api.close(),true);
  assert.equal(document.activeElement.id,'evidence-results');
});

test('zero search matches and a failed search have different copy and preserve existing result context', async () => {
  const {root,api} = mount();
  api.setResults([], {status:'error',reason:'Synthetic index failed.'});
  assert.match(by(root,'results-state').textContent,/Search unavailable/);
  assert.equal(root.querySelectorAll('[data-ej-select]').length,3);
  api.setResults([]);
  assert.equal(by(root,'count').textContent,'0 of 3 synthetic records');
  assert.match(by(root,'results-state').textContent,/No matches/);
});

test('a late source response cannot overwrite a newer canonical selection', async () => {
  const pending = defer();
  const adapters = createSyntheticAdapters(fixtures); const original = adapters.readSource;
  adapters.readSource = id => id === aster ? pending.promise : original(id);
  const {root,api} = mount({adapters});
  api.select(aster); await select(api,lumen);
  pending.resolve(fixtures.mainBefore); await settleAtlasDOM();
  assert.equal(api.snapshot().selected,lumen);
  assert.equal(api.snapshot().session.source.id,lumen);
  assert.equal(by(root,'entity-heading').textContent,'Specimen Lumen');
  assert.match(by(root,'claims').textContent,/No profile claims/);
});

test('unknown IDs and a rejecting inspector seam leave the current journey untouched', async () => {
  const calls = [];
  const inspector = {select(id,context){calls.push([id,context]);return id!==north;},close(context){calls.push(['close',context]);},destroy(){throw new Error('Foreign inspector lifetime must remain host-owned');}};
  const {root,api} = mount({inspector}); const opener = selectedButton(root);
  await select(api,aster,{opener});
  assert.equal(api.select(north),false);
  assert.equal(api.select('startup:missing'),false);
  assert.equal(api.snapshot().selected,aster);
  api.close(); api.destroy();
  assert.deepEqual(calls.at(-1),['close',{reason:'dismiss',restoreFocus:true}]);
  assert.equal(calls[0][1].opener,opener);
});

test('stale and conflict review outcomes preserve source identity without enabling proposal', async () => {
  for (const outcome of ['conflict','stale']) {
    const {root,api} = mount({prefix:`case-${outcome}`,adapters:createSyntheticAdapters(fixtures,()=>outcome)});
    await select(api); assert.equal(await api.review(),false);
    assert.equal(api.snapshot().selected,aster);
    assert.equal(api.snapshot().session.source.recordRevision,fixtures.mainBefore.recordRevision);
    assert.equal(root.querySelector('[data-ej-action="simulate"]').disabled,true);
    assert.match(by(root,'error-action').textContent,/review|reconcile/);
  }
});

test('uncertain result retains exact intent and permits only read-only proposal recovery', async () => {
  const adapters = createSyntheticAdapters(fixtures,()=> 'uncertain'); let attempts = 0;
  const original = adapters.simulateProposal; adapters.simulateProposal = (...args) => { attempts++; return original(...args); };
  const {root,api} = mount({adapters}); await select(api); await api.review();
  assert.equal(await api.simulate(),false);
  assert.equal(api.snapshot().session.uncertain,true);
  assert.deepEqual(api.snapshot().session.intent,fixtures.edit);
  assert.equal(await api.simulate(),false); assert.equal(await api.review(),false); assert.equal(attempts,1);
  await select(api,lumen); await select(api,aster);
  assert.equal(api.snapshot().session.uncertain,true);
  assert.equal(await api.recover(),true);
  assert.equal(api.snapshot().session.uncertain,false);
  assert.equal(api.snapshot().session.proposal.headRevision,fixtures.proposal.headRevision);
  assert.equal(attempts,1);
  assert.match(by(root,'readbacks').textContent,/published: false/);
});

test('not-found recovery is not permission to replay a proposal', async () => {
  const {root,api} = mount({adapters:createSyntheticAdapters(fixtures,()=> 'not-found')});
  await select(api); await api.review(); await api.simulate(); await api.recover();
  assert.equal(api.snapshot().session.recoveryNotFound,true);
  assert.equal(await api.simulate(),false);
  assert.equal(await api.review(),false);
  assert.match(by(root,'review-reason').textContent,/does not authorise an automatic retry/);
});

test('main mismatch does not report a matching record or silently change the reviewed target', async () => {
  const {root,api} = mount({adapters:createSyntheticAdapters(fixtures,()=> 'mismatch')});
  await select(api); await api.review(); await api.readback();
  assert.equal(api.snapshot().session.main.status,'mismatch');
  assert.equal(api.snapshot().session.preview.nextRecordRevision,fixtures.preview.nextRecordRevision);
  assert.match(by(root,'readbacks').textContent,/Record differs from review/);
  assert.doesNotMatch(by(root,'readbacks').textContent,/Reviewed record matches/);
});

test('independent read failures retain the successful context and do not become empty data', async () => {
  for (const outcome of ['unavailable','index-error']) {
    const {root,api} = mount({prefix:`case-${outcome}`,adapters:createSyntheticAdapters(fixtures,()=>outcome)});
    await select(api); await api.review(); await api.readback();
    const state = api.snapshot().session;
    assert.equal(outcome==='unavailable'?state.main.status:state.publication.status,'unavailable');
    assert.equal(outcome==='unavailable'?state.publication.status:state.main.status,outcome==='unavailable'?'pending_publication':'matching');
    assert.match(by(root,'readbacks').textContent,/Read unavailable/);
    assert.equal(root.querySelectorAll('[data-ej-select]').length,3);
  }
});

test('a failed refresh visibly retains earlier source and published evidence with its original revisions', async () => {
  const adapters=createSyntheticAdapters(fixtures);
  const {root,api}=mount({adapters}); await select(api); await api.review(); await api.readback();
  const original=api.snapshot().session;
  const fail=()=>Promise.reject(new Error('Synthetic refresh unavailable'));
  adapters.readMain=adapters.readPublished=adapters.readSource=fail;
  await api.readback(); await api.readSource();
  const state=api.snapshot().session;
  assert.deepEqual(state.source,original.source);
  assert.deepEqual(state.main.value,original.main.value);
  assert.deepEqual(state.publication.value,original.publication.value);
  assert.match(by(root,'source-status').textContent,/Last successful source read/);
  assert.match(by(root,'readbacks').textContent,/Earlier source evidence remains/);
  assert.match(by(root,'readbacks').textContent,/Earlier projection evidence remains/);
});

test('duplicate activation is blocked while a request is pending and cancellation does not replay it', async () => {
  const pending = defer(); let calls = 0;
  const adapters = createSyntheticAdapters(fixtures); adapters.validate=()=>{calls++;return pending.promise;};
  const {root,api} = mount({adapters}); await select(api);
  const attempt = api.review(); assert.equal(await api.review(),false); assert.equal(calls,1);
  click(root,'cancel'); pending.resolve(fixtures.preview); await attempt;
  assert.equal(api.snapshot().session.preview,null);
  assert.equal(api.snapshot().session.error.code,'INTERRUPTED');
  assert.match(by(root,'status').textContent,/Read interrupted/);
  assert.doesNotMatch(by(root,'status').textContent,/in progress/);
  assert.equal(calls,1);
});

test('hidden-document interruption preserves uncertain intent and resumes without work or focus replay', async () => {
  const pending=defer(); let calls=0;
  const adapters=createSyntheticAdapters(fixtures); adapters.simulateProposal=()=>{calls++;return pending.promise;};
  const {root,api}=mount({adapters}); await select(api); await api.review();
  const attempt=api.simulate(); const focused=document.activeElement;
  hidden=true; document.dispatchEvent(new Event('visibilitychange'));
  pending.resolve(fixtures.proposal); await attempt;
  assert.equal(api.snapshot().session.uncertain,true);
  assert.equal(api.snapshot().session.proposal,null);
  hidden=false; document.dispatchEvent(new Event('visibilitychange')); await settleAtlasDOM();
  assert.equal(calls,1); assert.equal(document.activeElement,focused);
  assert.match(by(root,'readbacks').textContent,/Outcome uncertain/);
});

test('late readback cannot cross selection and destroy prevents stale callbacks from changing static fallback', async () => {
  const pending=defer(); const adapters=createSyntheticAdapters(fixtures); adapters.readMain=()=>pending.promise;
  const {root,api}=mount({adapters}); await select(api); await api.review();
  const attempt=api.readback(); await select(api,lumen); api.destroy();
  const before=root.innerHTML; pending.resolve(fixtures.mainAfter); await attempt; await settleAtlasDOM();
  assert.equal(root.innerHTML,before);
  assert.equal(by(root,'fallback').hidden,false);
  assert.equal(api.snapshot().disposed,true);
});

test('multiple roots have independent selection, callbacks and uniquely associated IDs', async () => {
  const left=mount({prefix:'left'}), right=mount({prefix:'right'});
  await select(left.api,aster); await select(right.api,north);
  left.api.destroy();
  assert.equal(right.api.snapshot().selected,north);
  assert.equal(right.root.querySelector('[data-ej-action="close"]').disabled,false);
  const ids=[...document.querySelectorAll('[id]')].map(element=>element.id);
  assert.equal(new Set(ids).size,ids.length);
  for(const element of document.querySelectorAll('[aria-labelledby]')) for(const id of element.getAttribute('aria-labelledby').split(/\s+/)) assert.ok(document.getElementById(id));
});

test('replacement demo disposes old handlers and old destroy cannot disable the replacement', async () => {
  const root=markup(); const first=mountDemo(root,fixtures); mounted.push(first);
  const next=mountDemo(root,fixtures); mounted.push(next); first.destroy();
  by(root,'query').value='Lumen'; by(root,'query').dispatchEvent(new Event('input',{bubbles:true}));
  assert.equal(by(root,'query').disabled,false);
  assert.deepEqual(next.journey.snapshot().visibleIds,[lumen]);
});

test('canonical SDK agent operates the actual search, filter and review journey once per action', async () => {
  const {root,api}=mount({demo:true}); sdk=installAtlasSDK(document); await settleAtlasDOM();
  const entries=atlasUIAgent.snapshot().filter(item=>!item.offPage&&item.component!=='more');
  for(const entry of entries) assert.ok(entry.label,`Unnamed SDK component ${entry.ref}`);
  for(const label of ['Search synthetic records','Country','Inspect Specimen Aster','Review correction','Simulate draft proposal','Read authoritative results']) assert.ok(entries.some(item=>item.label===label),`Missing ${label}`);
  const result=await atlasUIAgent.act({steps:[{ref:'Search synthetic records',action:'setValue',args:['Aster']},{ref:'Country',action:'setValue',args:['Australia']},{ref:'Inspect Specimen Aster',action:'press'}]});
  assert.equal(result.ok,true,result.error?.message); await settleAtlasDOM();
  assert.deepEqual(api.snapshot().visibleIds,[aster]); assert.equal(api.snapshot().selected,aster);
  assert.equal((await atlasUIAgent.act({steps:[{ref:'Review correction',action:'press'}]})).ok,true); await settleAtlasDOM();
  assert.ok(api.snapshot().session.preview);
  assert.equal((await atlasUIAgent.act({steps:[{ref:'Simulate draft proposal',action:'press'}]})).ok,true); await settleAtlasDOM();
  assert.ok(api.snapshot().session.proposal);
  assert.equal((await atlasUIAgent.act({steps:[{ref:'Read authoritative results',action:'press'}]})).ok,true); await settleAtlasDOM();
  assert.equal(api.snapshot().session.main.status,'matching');
  assert.match(by(root,'status').textContent,/Independent readbacks/);
});

test('IME, SDK clear and country changes keep committed search separate from an unfinished draft', async () => {
  const {root,api}=mount({demo:true}); sdk=installAtlasSDK(document); await settleAtlasDOM();
  const query=by(root,'query'), country=by(root,'country');
  query.dispatchEvent(new Event('compositionstart',{bubbles:true})); query.value='Aster';
  query.dispatchEvent(new InputEvent('input',{bubbles:true,isComposing:true}));
  country.value='New Zealand'; country.dispatchEvent(new Event('change',{bubbles:true}));
  assert.deepEqual(api.snapshot().visibleIds,[lumen]); assert.equal(query.value,'Aster');
  by(root,'clear').hidden=false; by(root,'clear').click(); await settleAtlasDOM();
  assert.equal(query.value,''); assert.equal(document.activeElement,query);
  query.dispatchEvent(new Event('compositionend',{bubbles:true}));
  assert.equal(query.value,''); assert.deepEqual(api.snapshot().visibleIds,[lumen]);
});

test('source-only URL restore uses isolated query keys without discarding unrelated context or selection', async () => {
  window.history.replaceState(null,'','/startup-atlas/?keep=1&ejq=Aster&ejcountry=Australia');
  const {root,api}=mount({demo:true}); await select(api);
  assert.deepEqual(api.snapshot().visibleIds,[aster]);
  window.history.replaceState(null,'','/startup-atlas/?keep=1&ejq=Lumen&ejcountry=New%20Zealand');
  window.dispatchEvent(new Event('popstate'));
  assert.deepEqual(api.snapshot().visibleIds,[lumen]); assert.equal(api.snapshot().selected,aster);
  assert.equal(new URL(window.location.href).searchParams.get('keep'),'1');
  assert.equal(by(root,'membership').hidden,false);
});

test('the owned source has no transport, browser launcher, motion ticker or live write integration', async () => {
  for(const file of ['model.mjs','journey.mjs','demo.mjs','entry.mjs']) {
    const source=await readFile(new URL(`../specimens/evidence-journey/${file}`,import.meta.url),'utf8');
    assert.doesNotMatch(source,/\bfetch\s*\(|XMLHttpRequest|WebSocket|requestAnimationFrame|setInterval|\.animate\s*\(|child_process|playwright|puppeteer|webdriver/);
  }
});
