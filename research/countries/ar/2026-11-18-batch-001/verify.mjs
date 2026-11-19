#!/usr/bin/env node
// Offline verification of this research packet. No network, writes or ingestion.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateStartupRecord, startupSlug } from '../../../../backend/hosted/src/startup-record.mjs';

const directory = dirname(fileURLToPath(import.meta.url));
const repository = resolve(directory, '../../../..');
const read = name => JSON.parse(readFileSync(resolve(directory, name), 'utf8'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const canonical = value => JSON.stringify(value, (_key, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v);
const nameKey = value => value.normalize('NFKD').replace(/[^\x00-\x7f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const hostKey = value => value ? new URL(value).hostname.toLowerCase().replace(/^www\./, '') : null;
const unique = values => new Set(values).size === values.length;
const httpUrl = value => { const u = new URL(value); assert.equal(u.protocol, 'https:'); assert.equal(u.username, ''); assert.equal(u.password, ''); };
const day = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(value).toISOString().slice(0,10) === value;
const stamp = value => typeof value === 'string' && /(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
const tests = [];
function test(name, fn) { fn(); tests.push({ name, passed: true }); }

const records = read('country-records.json').companies;
const projections = read('atlas-startups.json').startups;
const claims = read('claims.json').claims;
const sources = read('source-registry.json').sources;
const candidates = read('candidate-manifest.json').candidates;
const queue = read('next-source-queue.json').queue;
const checkpoint = read('checkpoint.json');
const coverage = read('coverage.json');
const provenance = read('build-provenance.json');
const baseline = read('baseline-inventory.json');
const byClaim = new Map(claims.map(c => [c.claim_id, c]));
const bySource = new Map(sources.map(s => [s.url, s]));
const projected = new Map(projections.map(p => [p.name, p]));
const events = records.flatMap(r => r.funding_events);
const byEvent = new Map(events.map(e => [e.event_id, e]));
const byCompany = new Map(records.map(r => [r.canonical_name, r]));
const graph = JSON.parse(readFileSync(resolve(repository, 'data/graph.json'), 'utf8'));
const overlay = JSON.parse(readFileSync(resolve(repository, 'data/startup-research.json'), 'utf8'));

function matches(candidate, existing) {
  const names = new Set([candidate.canonical_name, ...candidate.aliases.map(a => a.name)].map(nameKey));
  return existing.filter(e => names.has(nameKey(e.name)) || (e.website && hostKey(e.website) === candidate.canonical_domain) || e.id === candidate.proposed_atlas_id);
}
function validateAmount(event) {
  assert.equal(event.amount == null, event.currency == null, `${event.event_id}: amount/currency pair`);
  if (event.amount != null) { assert.ok(Number.isSafeInteger(event.amount) && event.amount > 0); assert.match(event.currency, /^[A-Z]{3}$/); }
  assert.equal(event.valuation == null, event.valuation_currency == null);
}
function validatePrecision(value, precision) {
  if (value == null) { assert.equal(precision, 'unknown'); return; }
  if (precision === 'day') assert.ok(day(value), value);
  else if (precision === 'month') { assert.match(value, /^\d{4}-(0[1-9]|1[0-2])$/); }
  else if (precision === 'year') assert.match(value, /^\d{4}$/);
  else assert.fail(`Unsupported date precision: ${precision}`);
}
function resume(cp, queued, leadList, qhash, chash) {
  assert.equal(cp.queue_sha256, qhash, 'Queue changed; explicitly reconcile a new checkpoint.');
  assert.equal(cp.candidate_manifest_sha256, chash, 'Candidates changed; explicitly reconcile a new checkpoint.');
  const completed = new Set(cp.completed_candidate_ids);
  assert.ok(unique(cp.completed_candidate_ids));
  assert.ok(unique(cp.pending_candidate_ids));
  assert.ok(cp.pending_candidate_ids.every(id => !completed.has(id)));
  const eligible = leadList.filter(c => !completed.has(c.candidate_id));
  assert.deepEqual(eligible.map(c => c.candidate_id), cp.pending_candidate_ids);
  assert.ok(queued.some(q => q.id === cp.next_queue_id));
  return eligible.map(c => c.candidate_id);
}

test('Existing runtime schema accepts all bounded startup projections', () => {
  assert.ok(records.length > 0 && records.length <= 50);
  assert.equal(records.length, projections.length);
  for (const p of projections) validateStartupRecord(p);
  assert.equal(hash(readFileSync(resolve(repository, provenance.runtime_schema_file))), provenance.runtime_schema_sha256);
});

test('Normalization preserves display names and detects domain, alias and identifier collisions', () => {
  assert.equal(nameKey('Stämm'), nameKey('STAMM'));
  assert.equal(nameKey('Ualá'), nameKey('Uala'));
  assert.equal(hostKey('https://WWW.Example.COM/path?x=1'), 'example.com');
  assert.equal(startupSlug('ucrop.it'), 'ucrop-it');
  const fixture = { canonical_name: 'Tiendanube', aliases: [{ name: 'Nuvemshop' }], canonical_domain: 'tiendanube.com', proposed_atlas_id: 'startup:tiendanube' };
  assert.equal(matches(fixture, [{ name: 'NUVEMSHOP', id: 'startup:nuvemshop' }]).length, 1);
  assert.equal(matches(fixture, [{ name: 'Renamed', id: 'startup:other', website: 'https://www.tiendanube.com/about' }]).length, 1);
  assert.equal(matches(fixture, [{ name: 'Unrelated', id: 'startup:unrelated', website: 'https://example.org/' }]).length, 0);
  assert.ok(unique(records.map(r => nameKey(r.canonical_name))));
  assert.ok(unique(records.map(r => r.canonical_domain)));
  assert.ok(unique(records.map(r => r.proposed_atlas_id)));
  const existing = [...graph.entities, ...overlay.startups.map(p => ({ ...p, id: `startup:${startupSlug(p.name)}` }))];
  for (const r of records) {
    assert.equal(hostKey(r.website), r.canonical_domain);
    assert.equal(r.proposed_atlas_id, `startup:${startupSlug(r.canonical_name)}`);
    assert.equal(matches(r, existing).length, 0, `${r.canonical_name}: reconcile existing entity first`);
    assert.deepEqual(r.deduplication.matches, []);
  }
});

test('Pinned graph and overlay remain unchanged and denominators match', () => {
  assert.equal(hash(canonical(graph)), baseline.graph_hash);
  assert.equal(hash(canonical(overlay)), baseline.overlay_hash);
  assert.equal(graph.entities.length, 537);
  assert.equal(graph.entities.filter(e => e.kind === 'startup').length, 46);
  assert.equal(overlay.startups.length, 45);
  assert.equal(coverage.denominators.national_startups, null);
});

test('Claim provenance is complete, uniquely identified and excludes rights-held sources', () => {
  assert.ok(unique(claims.map(c => c.claim_id)));
  assert.ok(unique(sources.map(s => s.source_id)));
  assert.ok(unique(sources.map(s => s.url)));
  const seen = new Set();
  for (const c of claims) {
    assert.ok(c.entity_id && c.field && c.rationale);
    assert.equal(c.publication_state, 'proposed');
    if (['searched_unknown','unsearched','blocked','rejected','not_applicable'].includes(c.status)) {
      if (c.status === 'searched_unknown') assert.ok(c.search_log?.length);
      continue;
    }
    assert.notEqual(c.value, null);
    httpUrl(c.source_url);
    const s = bySource.get(c.source_url);
    assert.ok(s, c.source_url);
    assert.equal(c.source_id, s.source_id);
    assert.equal(c.source_kind, s.source_kind);
    assert.ok(stamp(c.retrieved_at));
    assert.ok(c.published_on === null || day(c.published_on));
    assert.ok(c.effective_on === null || day(c.effective_on));
    if (c.status === 'reviewed_staged') {
      assert.equal(c.accessed, true); assert.equal(s.accessed, true);
      assert.notEqual(c.source_kind, 'discovery'); assert.ok(stamp(c.reviewed_at));
      assert.ok(!s.observations.some(o => o.reuse_hold || o.status === 'rights_review_hold'));
    }
    const key = canonical([c.entity_id,c.field,c.value,c.source_url,c.effective_on]);
    assert.ok(!seen.has(key), c.claim_id); seen.add(key);
  }
  for (const r of records) for (const id of r.claim_ids) assert.equal(byClaim.get(id)?.entity_id, r.entity_id);
});

test('Projection field sources retain founding milestones and country provenance', () => {
  for (const r of records) {
    const p = projected.get(r.canonical_name);
    const desc = claims.find(c => c.entity_id === r.entity_id && c.field === 'description');
    assert.equal(p.source, desc.source_url);
    if (p.founded_year !== undefined) {
      assert.equal(r.founding.precision, 'year');
      assert.notEqual(r.founding.kind, 'operating_launch');
      assert.equal(Number(r.founding.value), p.founded_year);
      assert.equal(r.founding.source_url, p.source);
    }
    const origin = p.profile_facts.find(f => f.key === 'argentina-connection');
    assert.equal(origin.value, r.country_inclusion.basis);
    assert.equal(origin.source, r.country_inclusion.source_url);
    assert.equal(byClaim.get(r.country_inclusion.claim_id).value, r.country_inclusion.basis);
    for (const f of [...p.profile_facts, ...p.founders]) assert.ok(bySource.get(f.source)?.accessed);
    for (const founder of r.founders) {
      assert.equal(byClaim.get(founder.claim_id).source_url, founder.source_url);
      assert.equal(byClaim.get(founder.claim_id).status, 'reviewed_staged');
    }
  }
});

test('Funding amounts, dates, component sources and participant relationships are consistent', () => {
  assert.ok(unique(events.map(e => e.event_id)));
  for (const r of records) for (const e of r.funding_events) {
    const p = projected.get(r.canonical_name).funding_rounds.find(f => f.id === e.event_id);
    assert.ok(p); validateAmount(e);
    validatePrecision(e.announced_on,e.announcement_precision);
    validatePrecision(e.closed_on,e.close_precision);
    assert.equal(e.company_id,r.entity_id);
    assert.equal(byClaim.get(e.claim_id).value.event_id,e.event_id);
    if (e.amount == null) { assert.ok(!Object.hasOwn(p,'amount')); assert.ok(!Object.hasOwn(p,'currency')); }
    else { assert.equal(p.amount,e.amount); assert.equal(p.currency,e.currency); assert.ok(e.component_sources.currency); }
    if (e.announcement_precision !== 'day' || e.announcement_date_kind === 'investor_announcement') assert.ok(!Object.hasOwn(p,'announced_on'));
    else assert.equal(p.announced_on,e.announced_on);
    for (const u of Object.values(e.component_sources).filter(Boolean)) assert.ok(bySource.get(u)?.accessed,u);
    assert.ok(unique(e.participants.map(pp => nameKey(pp.name))));
    for (const pp of e.participants) {
      assert.equal(pp.event_id,e.event_id);
      assert.ok(['lead','participant','unspecified'].includes(pp.role));
      assert.equal(pp.resolved_entity_id,null);
      const cl=byClaim.get(pp.claim_id);
      assert.equal(cl.field,'round_participant'); assert.equal(cl.status,'reviewed_staged');
      assert.equal(cl.value.event_id,e.event_id); assert.equal(cl.value.name,pp.name); assert.equal(cl.value.role,pp.role);
      assert.equal(cl.source_url,pp.source_url);
    }
    if (e.parent_event_id) assert.equal(byEvent.get(e.parent_event_id)?.company_id,r.entity_id);
  }
});

test('Material conflict and null regressions remain conservative', () => {
  assert.equal(byCompany.get('Humand').geography.headquarters,null);
  assert.equal(byCompany.get('Mural').geography.headquarters,null);
  assert.equal(byCompany.get('VU').geography.incorporation,null);
  assert.equal(byCompany.get('ucrop.it').geography.incorporation,null);
  assert.ok(byCompany.get('ucrop.it').geography.legal_domicile);
  for (const n of ['Henry','belo','Ualá']) assert.ok(!Object.hasOwn(projected.get(n),'founded_year'));
  assert.equal(byEvent.get('coderhouse-2021-series-a').amount,null);
  assert.equal(byEvent.get('puna-bio-2025-series-a').closed_on,null);
  assert.match(byEvent.get('puna-bio-2025-series-a').earlier_announcement.linkage_status,/provisional/);
  assert.equal(byEvent.get('kilimo-2024-series-a').announcement_date_kind,'reported_month');
  const uala=byCompany.get('Ualá').funding_events;
  assert.equal(uala.find(e=>e.amount_basis==='incremental_extension').parent_event_id,'uala-2024-11-11-series-e');
  assert.ok(!uala.some(e=>e.amount===366000000));
  assert.ok(!byEvent.get('michroma-2023-seed').participants.some(p=>/General Mills|301\s*INC/i.test(p.name)));
  assert.deepEqual(byEvent.get('rebill-2026-10-19-pre-series-a').participants.map(p=>p.name),['Guillermo Rauch']);
  assert.throws(()=>validateAmount({event_id:'invalid-fixture',amount:12,currency:null}));
  assert.throws(()=>validatePrecision('2024-06-01','month'));
  assert.throws(()=>validateStartupRecord({...projections[0],founded_year:null}));
  assert.throws(()=>validateStartupRecord({...projections[0],unexpected_schema_field:'not allowed'}));
});

test('Counts reconcile without equating candidates, rounds, participants or survey totals', () => {
  const n=coverage.counts;
  assert.equal(n.companies_discovered,candidates.length);
  assert.equal(n.companies_reviewed,records.length);
  assert.equal(n.companies_accepted_staged,records.length);
  assert.equal(n.companies_deferred_unreviewed,candidates.filter(c=>!c.reviewed).length);
  assert.equal(n.companies_discovered,n.companies_accepted_staged+n.companies_deferred_unreviewed+n.companies_rejected);
  assert.equal(n.funding_event_observations,events.length);
  assert.equal(n.named_participant_event_observations,events.reduce((n,e)=>n+e.participants.length,0));
  assert.equal(n.founder_observations,records.reduce((n,r)=>n+r.founders.length,0));
  assert.equal(n.claims,claims.length);
  assert.equal(n.source_registry_unique_urls,sources.length);
  assert.equal(n.source_urls_read_at_least_once,sources.filter(s=>s.accessed).length);
  const statuses={};for(const c of claims)statuses[c.status]=(statuses[c.status]||0)+1;
  assert.deepEqual(statuses,n.claim_statuses);
  assert.equal(n.production_companies_changed,0);
});

test('Bounded evidence capture covers every accepted claim exactly once', () => {
  const included=[];
  for (const f of readdirSync(directory).filter(f=>/^evidence-captures-\d+\.json$/.test(f))) {
    const capture=read(f);
    assert.ok(capture.documents.length<=100);
    assert.equal(capture.full_ledger_sha256,hash(readFileSync(resolve(directory,'claims.json'))));
    assert.equal(capture.automatic_submission_authorized,false);
    included.push(...capture.included_claim_ids);
  }
  assert.ok(unique(included));
  assert.deepEqual(included.sort(),claims.filter(c=>c.status==='reviewed_staged').map(c=>c.claim_id).sort());
});

test('Resume checkpoint is deterministic, skips reviewed candidates and rejects changed inputs', () => {
  const qhash=hash(readFileSync(resolve(directory,'next-source-queue.json')));
  const chash=hash(readFileSync(resolve(directory,'candidate-manifest.json')));
  const pending=resume(checkpoint,queue,candidates,qhash,chash);
  assert.equal(pending.length,43);
  assert.deepEqual(resume(checkpoint,queue,candidates,qhash,chash),pending);
  assert.throws(()=>resume(checkpoint,queue,candidates,'changed-input',chash));
  const bad=structuredClone(checkpoint);bad.pending_candidate_ids.push(bad.completed_candidate_ids[0]);
  assert.throws(()=>resume(bad,queue,candidates,qhash,chash));
  assert.ok(unique(queue.map(q=>q.id)));
  assert.ok(queue.every(q=>q.seed_approval===false && q.state==='pending' && q.bounded_next_batch>=1));
  assert.ok(sources.every(s=>s.crawler_seed_approved===false));
  assert.equal(checkpoint.national_completeness,false);
});

console.log(JSON.stringify({ passed:true, test_groups:tests.length, tests, counts:coverage.counts, limitations:'Offline structural and provenance checks; semantic source review is documented separately. No production ingestion, crawler approval or deployment.' },null,2));
