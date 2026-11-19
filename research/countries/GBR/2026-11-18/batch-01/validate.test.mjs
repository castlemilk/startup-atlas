import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { validateStartupRecord, mergeStartup, startupSlug } from '../../../../../backend/hosted/src/startup-record.mjs';

const read = name => JSON.parse(fs.readFileSync(new URL(name, import.meta.url), 'utf8'));
const core = read('records.json').startups;
const patches = read('existing-record-enrichment.json').startups;
const context = read('historical-context.json').startups;
const all = [...core, ...patches, ...context];
const companies = read('companies.json').companies;
const claims = read('claims.json').claims;
const cmap = new Map(claims.map(c => [c.claim_id, c]));
const sources = new Map(read('source-registry.json').sources.map(s => [s.source_id, s]));
const events = read('funding-events.json');
const coverage = read('coverage.json');
const old = read('../../../../../data/startup-research.json').startups;
const graph = read('../../../../../data/graph.json');
const mappings = read('projection-map.json').projections;
const canonicalName = x => x.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
const canonicalHost = x => new URL(x.includes('://') ? x : `https://${x}`).hostname.replace(/^www\./, '').toLowerCase();
const plain = x => JSON.parse(JSON.stringify(x));
const round = id => all.flatMap(r => r.funding_rounds || []).find(r => r.id === id);
const fact = id => cmap.get(id);
const validUrl = x => {const u = new URL(x); assert.equal(u.protocol, 'https:'); assert(!u.username && !u.password); assert(!u.pathname.endsWith('/robots.txt'));};

test('32 reviewed candidates reconcile to 25 new, 2 existing, 5 context and no production acceptance', () => {
  assert.equal(companies.length, 32); assert.equal(core.length, 25); assert.equal(patches.length, 2); assert.equal(context.length, 5);
  assert.equal(coverage.counts.accepted_for_staging, core.length + patches.length);
  assert.equal(coverage.counts.production_records_accepted, 0);
  assert.equal(coverage.denominator.uk_startup_population, null);
  assert.equal(coverage.denominator.completeness_claim, false);
});

test('all 32 records and two merged previews pass the actual current Atlas validator', () => {
  for (const row of all) validateStartupRecord(row);
  for (const patch of patches) validateStartupRecord(mergeStartup(old.find(r => r.name === patch.name), patch));
});

test('Revolut and Synthesia retain original sources, founding assertions, founders and exact rounds', () => {
  assert.deepEqual(patches.map(p => p.name), ['Revolut', 'Synthesia']);
  for (const patch of patches) {
    const baseline = old.find(r => r.name === patch.name), merged = mergeStartup(baseline, patch);
    assert.equal(merged.source, baseline.source); assert.equal(merged.reviewed_at, baseline.reviewed_at);
    assert.deepEqual(merged.founders, baseline.founders); assert.deepEqual(merged.funding_rounds, baseline.funding_rounds);
    assert.equal(merged.founded_year, baseline.founded_year);
    assert.equal(patch.funding_rounds, undefined); assert.equal(patch.founders, undefined);
  }
});

test('schema rejects unsupported fields, nulls, unpaired money and invented day precision', () => {
  const base = plain(core[0]);
  assert.throws(() => validateStartupRecord({...base, headquarters: 'London'}));
  assert.throws(() => validateStartupRecord({...base, founded_year: null}));
  for (const mutate of [r => r.amount = null, r => delete r.currency, r => r.announced_on = '2024-03', r => r.participants = []]) {
    const bad = plain(base); mutate(bad.funding_rounds[0]); assert.throws(() => validateStartupRecord(bad));
  }
});

test('Unicode name/domain normalization finds existing companies and does not merge Stream with unrelated services', () => {
  assert.equal(canonicalName(' Ｒｅｖｏｌｕｔ '), canonicalName('Revolut'));
  assert.equal(canonicalHost('https://www.Revolut.com/'), 'revolut.com');
  assert.notEqual(canonicalHost('https://stream.co/'), canonicalHost('https://getstream.io/'));
  assert.equal(new Set(companies.map(c => canonicalName(c.canonical_name))).size, 32);
  assert.equal(new Set(companies.map(c => canonicalHost(c.canonical_domain))).size, 32);
  const baselineNames = new Set(old.map(r => canonicalName(r.name)));
  for (const r of core) assert(!baselineNames.has(canonicalName(r.name)));
});

test('new proposed IDs and funding IDs do not collide with the baseline graph', () => {
  const ids = new Set(graph.entities.map(e => e.id));
  for (const r of core) assert(!ids.has(`startup:${startupSlug(r.name)}`));
  const incoming = [...core, ...context].flatMap(r => r.funding_rounds || []);
  assert.equal(new Set(incoming.map(r => r.id)).size, incoming.length);
  const existing = new Set(old.flatMap(r => r.funding_rounds || []).map(r => r.id));
  for (const r of incoming) assert(!existing.has(r.id));
});

test('provenance IDs resolve and reviewed claims have supporting accessed pages', () => {
  assert.equal(cmap.size, claims.length);
  for (const c of claims) {
    assert(companies.some(x => x.entity_id === c.entity_id));
    if (['reviewed_staged', 'candidate', 'conflict'].includes(c.status)) {
      const s = sources.get(c.source_id); assert(s); assert.equal(s.url, c.source_url); validUrl(c.source_url);
      assert(c.evidence && c.rationale); assert(!Number.isNaN(Date.parse(c.retrieved_at)));
      if (c.status === 'reviewed_staged') {assert.equal(c.accessed, true); assert(s.observations.some(o => o.accessed === true));}
    }
  }
  for (const m of mappings) for (const p of m.claim_map) for (const cid of p.claim_ids) assert(cmap.has(cid));
});

test('sidecar funding participants and secondary references resolve to actual events and sources', () => {
  const ids = new Set(events.events.map(e => e.event_id));
  assert.equal(ids.size, 42);
  for (const p of events.participants) {assert(ids.has(p.event_id)); assert(sources.has(p.source_id)); assert.equal(p.canonical_investor_id, null); assert(p.name);}
  function visit(v) {
    if (!v || typeof v !== 'object') return;
    for (const [k, x] of Object.entries(v)) {
      if (['event_id', 'parent_event_id', 'related_close_event_id', 'includes_round_event_id'].includes(k) && x !== null) assert(ids.has(x), `${k}: ${x}`);
      if (['source_ids', 'additional_source_ids'].includes(k)) for (const id of x) assert(sources.has(id), id);
      visit(x);
    }
  }
  for (const c of claims) visit(c.value);
  for (const c of companies) visit(c.conflicts);
});

test('normalized money requires sourced currency and unknowns never become zero', () => {
  function visit(v) {
    if (!v || typeof v !== 'object') return;
    if (typeof v.amount === 'number') {assert(v.amount > 0); assert(['GBP', 'USD', 'EUR'].includes(v.currency));}
    if (typeof v.valuation === 'number') {assert(v.valuation > 0); assert(['GBP', 'USD', 'EUR'].includes(v.valuation_currency));}
    for (const x of Object.values(v)) visit(x);
  }
  for (const c of claims) visit(c.value);
  for (const r of all) for (const f of r.funding_rounds || []) {
    assert.equal(Object.hasOwn(f, 'amount'), Object.hasOwn(f, 'currency'));
    if (f.amount !== undefined) assert(f.amount > 0 && ['GBP', 'USD', 'EUR'].includes(f.currency));
  }
  assert.equal(fact('uk-dt-cmr-surgical-015').value.amount, null);
  assert.equal(fact('uk-dt-cmr-surgical-015').value.currency, null);
});

test('production projections omit every unsupported null and are independently mapped to claims', () => {
  function check(v) {assert.notEqual(v, null); if (typeof v === 'object') for (const x of Object.values(v)) check(x);}
  for (const r of all) check(r);
  for (const r of core) {
    assert(r.website && r.description && r.source);
    const m = mappings.find(m => m.canonical_name === r.name); assert(m);
    const web = cmap.get(m.claim_map.find(x => x.record_path === 'website').claim_ids[0]);
    assert(['website', 'identity'].includes(web.field));
    for (const f of r.funding_rounds || []) {
      const p = m.claim_map.find(x => x.record_path === `funding_rounds.${f.id}`); assert(p);
      const v = cmap.get(p.claim_ids[0]).value;
      if (f.amount !== undefined) {assert.equal(f.amount, v.amount); assert.equal(f.currency, v.currency);}
    }
  }
});

test('mixed funding, grants, valuations and generic investor rosters stay outside projected venture rounds', () => {
  const ids = new Set(all.flatMap(r => r.funding_rounds || []).map(r => r.id));
  for (const id of ['tide-2025-strategic-investment', 'chemify-grants-2026', 'enterobiotix-financing-2024', 'cmr-surgical-mixed-growth-funding-2025', 'revolut-2026-11-fundraising-process']) assert(!ids.has(id));
  assert.equal(events.production_relationships_created, 0);
  assert(!events.participants.some(p => p.event_id === 'paragraf-series-c-2025'));
});

test('partial closes, extensions and conditional investments remain distinct', () => {
  assert.equal(round('pragmatic-semiconductor-series-d-first-close-2023').amount, 162000000);
  const qm = round('quantum-motion-series-c-second-close-2026'); assert.equal(qm.amount, undefined); assert.match(qm.note, /Incremental|original/);
  assert.match(round('cmr-surgical-stryker-preferred-investment-2026').note, /announced_subject_to_conditions/);
  assert.equal(round('cmr-surgical-stryker-preferred-investment-2026').amount, undefined);
  assert.match(round('gocardless-2022-series-g').note, /192m|192/);
});

test('conflicting dates and amounts do not acquire false precision', () => {
  assert.equal(round('paragraf-series-a-2019').announced_on, undefined);
  assert.match(round('paragraf-series-a-2019').note, /2019-03-07.*2019-07-15/);
  assert.equal(core.find(r => r.name === 'Chemify').founded_year, undefined);
  assert.equal(core.find(r => r.name === 'Paragraf').founded_year, undefined);
  assert.equal(round('riverlane-series-c-2024').amount, undefined);
  assert.equal(core.find(r => r.name === 'Luminance').founders, undefined);
  assert.equal(core.find(r => r.name === 'CMR Surgical').founders, undefined);
});

test('context cases cannot enter the current independent-company candidate set', () => {
  assert.deepEqual(new Set(context.map(r => r.name)), new Set(['GoCardless', 'ElevenLabs', 'Oxford Ionics', 'Phion Therapeutics', 'Ultraleap']));
  for (const r of core) assert(!context.some(c => c.name === r.name));
});

test('Stream and Cleo legal joins retain their exact boundaries', () => {
  const stream = companies.find(c => c.canonical_name === 'Stream'); assert.equal(stream.canonical_domain, 'stream.co');
  const sf = claims.filter(c => c.entity_id === stream.entity_id && ['incorporation', 'legal_identity'].includes(c.field));
  assert(sf.some(c => JSON.stringify(c.value).includes('11173225')));
  const cleo = fact('uk-fintech-cleo-009'); assert.equal(cleo.status, 'candidate');
  const projection = core.find(c => c.name === 'Cleo');
  assert(!JSON.stringify(projection).includes('09864205'));
});

test('ownership and crawler safety boundaries remain declarative and unchanged', () => {
  const manifest = read('manifest.json');
  assert.equal(manifest.delivery.production_write, false); assert.equal(manifest.delivery.seed_approval, false);
  assert.equal(manifest.delivery.live_crawl_requests, 0); assert.equal(manifest.delivery.schema_api_change, false);
  for (const s of sources.values()) {validUrl(s.url); assert.equal(s.automated_crawl_approved, false); assert.equal(s.crawler_seed_approval, 'not_requested');}
});

test('coverage and follow-up queue are fixed, unique and hash-bound', () => {
  const q = read('next-source-queue.json'); assert.equal(q.items.length, 46);
  assert.equal(new Set(q.items.map(x => x.queue_id)).size, 46);
  assert.equal(q.candidate_queue_sha256, coverage.denominator.sha256);
  assert.equal(coverage.counts.claims, claims.length);
  assert.equal(coverage.counts.round_participant_claims, events.participants.length);
  assert.equal(coverage.counts.distinct_source_urls, sources.size);
});

test('baseline hashes bind validation to the source data actually inspected', () => {
  const b = read('manifest.json').baseline;
  for (const [path, expected] of [[b.overlay_path, b.overlay_file_sha256], [b.graph_path, b.graph_file_sha256]]) {
    const bytes = fs.readFileSync(new URL('../../../../../' + path, import.meta.url));
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), expected);
  }
});
