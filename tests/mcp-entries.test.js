import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, cp, readFile, writeFile, rm, symlink, link, rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { CatalogueStore } from '../mcp/store.mjs';
import { validateOpportunity, validateProvenance, mergeAdditions } from '../scripts/catalogue-entries.mjs';

export const entry = {
  id: 'example-founder-programme', name: 'Example Founder Programme', org: 'Example Foundation',
  kind: 'Founder programmes', access: 'Direct', scope: ['UNKNOWN'], value: 'Mentoring; no cash award established',
  summary: 'An example-only test programme. Never publish this fixture.', eligibility: 'Eligibility requires source review.',
  limits: 'No award, membership or geographic entitlement is implied.', url: 'https://example.com/programme',
  status: 'Check intake', checked: '2026-01-01', extra: [], facts: {},
};
export const provenance = { sourceUrls: [entry.url], reviewedOn: entry.checked, evidence: 'Fixture-only evidence to verify persistence and validation; not real research.' };
const clone = value => structuredClone(value);
const root = new URL('../', import.meta.url);
async function fixture(t) {
  const dir = await mkdtemp(path.join(tmpdir(), 'atlas-mcp-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(path.join(dir, 'scripts'));
  await cp(new URL('data/', root), path.join(dir, 'data'), { recursive: true });
  for (const file of ['make-data.py', 'merge-additions.mjs', 'catalogue-entries.mjs']) await cp(new URL(`scripts/${file}`, root), path.join(dir, 'scripts', file));
  execFileSync('python3', ['scripts/make-data.py'], { cwd: dir });
  return dir;
}

test('valid opportunity requires honest geography, safe URLs, dates and exact provenance', () => {
  assert.equal(validateOpportunity(entry), entry);
  assert.equal(validateProvenance(provenance, entry), provenance);
  const mutations = [
    x => { x.id = '../escape'; }, x => { x.checked = '2026-02-30'; },
    x => { x.scope = ['UNKNOWN', 'AU']; }, x => { x.scope = ['WORLD', 'US']; },
    x => { x.scope = ['AU', 'AU']; }, x => { x.url = 'javascript:alert(1)'; },
    x => { x.url = 'https://secret:password@example.com/'; }, x => { x.url = 'https://127.0.0.1/'; },
    x => { x.url = 'https://localhost/'; }, x => { x.url = 'https://[::1]/'; },
    x => { x.url = 'https://foo.internal/'; }, x => { x.url = 'https://example.com:8443/'; },
    x => { x.extra = [x.url]; }, x => { x.extra = ['https://example.com/a', 'https://example.com/a']; },
    x => { x.eligibility = ' '; }, x => { delete x.limits; }, x => { x.madeUpField = 'not supported'; },
    x => { x.facts = { constructor: 'unsafe' }; }, x => { x.facts = { Count: 7 }; },
  ];
  for (const mutate of mutations) { const value = clone(entry); mutate(value); assert.throws(() => validateOpportunity(value)); }
  assert.throws(() => validateProvenance({ ...provenance, reviewedOn: '2026-02-01' }, entry));
  assert.throws(() => validateProvenance({ ...provenance, sourceUrls: ['https://elsewhere.com/'] }, entry));
  assert.throws(() => validateProvenance({ ...provenance, privateNotes: 'not allowed' }, entry));
});

test('validation is read-only; writes are disabled unless explicitly enabled', async t => {
  const dir = await fixture(t);
  const store = new CatalogueStore(dir);
  const before = await readFile(store.additionsPath, 'utf8');
  const result = await store.validate(entry, provenance);
  assert.equal(result.status, 'valid');
  await assert.rejects(store.add(entry, provenance, result.revision), { code: 'READ_ONLY' });
  assert.equal(await readFile(store.additionsPath, 'utf8'), before);
});

test('durable additions survive process restart and repeated full catalogue regeneration', async t => {
  const dir = await fixture(t);
  const store = new CatalogueStore(dir, { writeEnabled: true });
  const original = await store.snapshot();
  const result = await store.add(entry, provenance, original.revision);
  assert.equal(result.status, 'added'); assert.equal(result.published, false);
  const restarted = new CatalogueStore(dir, { writeEnabled: true });
  assert.deepEqual((await restarted.get(entry.id)).provenance, provenance);
  assert.equal((await restarted.search('EXAMPLE founder')).total, 1);
  for (let run = 0; run < 2; run++) execFileSync('python3', ['scripts/make-data.py'], { cwd: dir });
  const generated = JSON.parse(await readFile(store.cataloguePath, 'utf8'));
  assert.equal(generated.opportunities.length, original.opportunities.length + 1);
  assert.deepEqual(generated.opportunities.at(-1), entry);
  assert.deepEqual(generated.opportunities.slice(0, -1), original.catalogue.opportunities);
  assert.equal(generated.updated, original.catalogue.updated);
  assert.equal((await restarted.search()).total, generated.opportunities.length);
  assert.equal((await restarted.snapshot()).additions.entries.length, original.additions.entries.length + 1);
});

test('identical retries are idempotent even with the original revision; replacements fail', async t => {
  const store = new CatalogueStore(await fixture(t), { writeEnabled: true });
  const baseline = (await store.snapshot()).additions.entries.length;
  const { revision } = await store.validate(entry, provenance);
  await store.add(entry, provenance, revision);
  assert.equal((await store.add(entry, provenance, revision)).status, 'already_present');
  await assert.rejects(store.add({ ...entry, value: 'Changed value' }, provenance, revision), { code: 'DUPLICATE_ID' });
  await assert.rejects(store.validate({ ...entry, id: 'other-id', name: 'EXAMPLE FOUNDER PROGRAMME' }, provenance), { code: 'DUPLICATE_ENTRY' });
  assert.equal((await store.snapshot()).additions.entries.length, baseline + 1);
});

test('stale revisions and generator changes cannot replace work', async t => {
  const store = new CatalogueStore(await fixture(t), { writeEnabled: true });
  const original = await store.snapshot();
  await writeFile(path.join(store.root, 'scripts/make-data.py'), '# concurrent source edit\n', { flag: 'a' });
  await assert.rejects(store.add(entry, provenance, original.revision), { code: 'STALE_REVISION' });
  assert.equal(await readFile(store.additionsPath, 'utf8'), original.additionsText);
  const fresh = await store.snapshot();
  await store.add(entry, provenance, fresh.revision);
  await assert.rejects(store.add({ ...entry, id: 'second', name: 'Second Programme' }, provenance, fresh.revision), { code: 'STALE_REVISION' });
});

test('concurrent MCP writers serialize without losing an addition', async t => {
  const dir = await fixture(t);
  const first = new CatalogueStore(dir, { writeEnabled: true });
  const second = new CatalogueStore(dir, { writeEnabled: true });
  const snapshot = await first.snapshot();
  const { revision } = snapshot;
  const baseline = snapshot.additions.entries.length;
  const other = { ...entry, id: 'second-programme', name: 'Second Programme' };
  const results = await Promise.allSettled([first.add(entry, provenance, revision), second.add(other, provenance, revision)]);
  assert.equal(results.filter(x => x.status === 'fulfilled').length, 1);
  const error = results.find(x => x.status === 'rejected').reason;
  assert.ok(['WRITE_BUSY', 'STALE_REVISION'].includes(error.code));
  assert.equal((await first.snapshot()).additions.entries.length, baseline + 1);
  const missing = (await first.snapshot()).opportunities.some(x => x.id === entry.id) ? other : entry;
  await second.add(missing, provenance, (await second.snapshot()).revision);
  assert.equal((await first.snapshot()).additions.entries.length, baseline + 2);
});

test('corrupt data, stale locks and linked destinations fail closed', async t => {
  const store = new CatalogueStore(await fixture(t), { writeEnabled: true });
  const { revision } = await store.snapshot();
  await writeFile(store.lockPath, 'existing writer');
  await assert.rejects(store.add(entry, provenance, revision), { code: 'WRITE_BUSY' });
  assert.equal(await readFile(store.lockPath, 'utf8'), 'existing writer');
  await rm(store.lockPath);
  await writeFile(store.additionsPath, '{ corrupt');
  await assert.rejects(store.snapshot());
  await rm(store.additionsPath);
  await symlink(store.cataloguePath, store.additionsPath);
  await assert.rejects(store.snapshot(), { code: 'UNSAFE_PATH' });
});

test('future dates and collisions with curated entries fail before publication', async t => {
  const store = new CatalogueStore(await fixture(t), { writeEnabled: true });
  await assert.rejects(store.validate({ ...entry, checked: '2999-01-01' }, { ...provenance, reviewedOn: '2999-01-01' }), { code: 'VALIDATION_ERROR' });
  const { catalogue } = await store.snapshot();
  const duplicate = { ...entry, id: catalogue.opportunities[0].id };
  await assert.rejects(store.validate(duplicate, provenance), { code: 'DUPLICATE_ID' });
  assert.throws(() => mergeAdditions(catalogue, { schemaVersion: 1, entries: [{ entry: duplicate, provenance, addedAt: '2026-01-01T00:00:00.000Z' }] }), /already exists/);
});

test('a populated generated additions source survives subsequent adds and regeneration', async t => {
  const dir = await fixture(t);
  const store = new CatalogueStore(dir, { writeEnabled: true });
  const original = await store.snapshot();
  const first = { ...entry, id: 'already-added-fixture', name: 'Existing Added Fixture' };
  await store.add(first, provenance, original.revision);
  execFileSync('python3', ['scripts/make-data.py'], { cwd: dir });
  const generated = await store.snapshot();
  await store.add(entry, provenance, generated.revision);
  execFileSync('python3', ['scripts/make-data.py'], { cwd: dir });
  const final = await store.snapshot();
  assert.equal(final.additions.entries.length, original.additions.entries.length + 2);
  assert.equal(final.catalogue.opportunities.length, original.opportunities.length + 2);
  assert.deepEqual(final.catalogue.opportunities.find(x => x.id === first.id), first);
  assert.deepEqual(final.catalogue.opportunities.find(x => x.id === entry.id), entry);
});

test('manual edits during preparation are detected and retained', async t => {
  const store = new CatalogueStore(await fixture(t), { writeEnabled: true });
  const original = await store.snapshot();
  const snapshot = store.snapshot.bind(store);
  let calls = 0;
  const concurrent = { entry: { ...entry, id: 'concurrent-entry', name: 'Concurrent Entry' }, provenance, addedAt: '2026-01-01T00:00:00.000Z' };
  store.snapshot = async () => {
    const current = await snapshot();
    if (++calls === 1) await writeFile(store.additionsPath, JSON.stringify({ ...current.additions, entries: [...current.additions.entries, concurrent] }));
    return current;
  };
  await assert.rejects(store.add(entry, provenance, original.revision), { code: 'STALE_REVISION' });
  const saved = await snapshot();
  assert.deepEqual(saved.additions.entries.at(-1), concurrent);
  assert.equal(saved.additions.entries.length, original.additions.entries.length + 1);
});

test('directory symlinks and hard-linked destinations are refused', async t => {
  const dir = await fixture(t);
  const store = new CatalogueStore(dir, { writeEnabled: true });
  await link(store.additionsPath, path.join(dir, 'linked.json'));
  await assert.rejects(store.snapshot(), { code: 'UNSAFE_PATH' });
  await rm(path.join(dir, 'linked.json'));
  await rename(path.join(dir, 'data'), path.join(dir, 'real-data'));
  await symlink(path.join(dir, 'real-data'), path.join(dir, 'data'));
  await assert.rejects(store.snapshot(), { code: 'UNSAFE_PATH' });
});
