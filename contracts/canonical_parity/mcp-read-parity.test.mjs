import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, readdir, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { StartupStore } from '../../backend/mcp/startups.mjs';
import { GitHubCatalogue } from '../../backend/hosted/src/github.mjs';
import { recordRevision } from '../../backend/hosted/src/startup-edit.mjs';
import { startupSlug, validateStartupRecord } from '../../backend/hosted/src/startup-record.mjs';
import { slug, teamPersonId } from '../../web/graph-model.js';

// These are offline source adapters, not MCP transports, authentication or live
// hosted acceptance. No SDK, token, connection, server or write method is used.
const fixture = JSON.parse(await readFile(new URL('./fixtures.json', import.meta.url), 'utf8'));
const id = fixture.expected.startup_id;
const record = fixture.inputs.research.startups.find(item => `startup:${startupSlug(item.name)}` === id);
const paths = ['data/startup-research.json', 'data/graph.json', 'data/partner-leads.json', 'data/catalogue.json'];
const graphUrl = 'https://castlemilk.github.io/startup-atlas/data/graph.json';
let generated, graph, sourceDocuments, networkAttempts = 0;
const originalFetch = globalThis.fetch;

before(async () => {
  globalThis.fetch = async () => { networkAttempts++; throw new Error('Network is forbidden in parity fixtures'); };
  generated = await realpath(await mkdtemp(path.join(tmpdir(), 'atlas-parity-generated-')));
  execFileSync('python3', ['-B', fileURLToPath(new URL('./build_fixture.py', import.meta.url)), '--out', generated], { encoding: 'utf8' });
  graph = JSON.parse(await readFile(path.join(generated, 'graph.json'), 'utf8'));
  sourceDocuments = Object.fromEntries(await Promise.all(paths.map(async name => [name,
    JSON.parse(await readFile(path.join(generated, 'public-inputs', path.basename(name)), 'utf8'))])));
});

after(async () => {
  globalThis.fetch = originalFetch;
  if (generated) await rm(generated, { recursive: true, force: true });
  assert.equal(networkAttempts, 0, 'No request may reach the real network boundary');
});

async function readers(t, { rawRecord = record, publishedGraph = graph } = {}) {
  const documents = structuredClone(sourceDocuments);
  documents['data/startup-research.json'].startups = documents['data/startup-research.json'].startups.map(item =>
    `startup:${startupSlug(item.name)}` === id ? structuredClone(rawRecord) : item);
  documents['data/graph.json'] = structuredClone(publishedGraph);
  const bytes = Object.fromEntries(paths.map(name => [name, JSON.stringify(documents[name], null, 2) + '\n']));
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'atlas-parity-reads-')));
  await mkdir(path.join(root, 'data'));
  await Promise.all(paths.map(name => writeFile(path.join(root, name), bytes[name])));
  t.after(async () => {
    try {
      for (const name of paths) assert.equal(await readFile(path.join(root, name), 'utf8'), bytes[name], `Read mutated ${name}`);
      assert.deepEqual((await readdir(path.join(root, 'data'))).sort(), paths.map(name => path.basename(name)).sort());
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  const calls = [];
  // Preserve the actual file decoder, startupSnapshot and record/graph readers.
  // Only their external I/O boundary is replaced, with GET-only exact routes.
  const hosted = Object.create(GitHubCatalogue.prototype);
  hosted.api = async (suffix, options = {}) => {
    assert.equal(options.method ?? 'GET', 'GET');
    assert.equal(options.body, undefined);
    calls.push(suffix);
    if (suffix === '/git/ref/heads/main') return { object: { sha: fixture.main_revision } };
    const url = new URL(suffix, 'https://offline.invalid');
    assert.equal(url.origin, 'https://offline.invalid');
    assert.deepEqual([...url.searchParams], [['ref', fixture.main_revision]]);
    assert.ok(url.pathname.startsWith('/contents/'));
    const content = bytes[url.pathname.slice('/contents/'.length)];
    assert.equal(typeof content, 'string', `Unexpected source request: ${suffix}`);
    return { type: 'file', encoding: 'base64', size: Buffer.byteLength(content), content: Buffer.from(content).toString('base64') };
  };
  hosted.fetcher = async (url, options = {}) => {
    assert.equal(url, graphUrl);
    assert.equal(options.method ?? 'GET', 'GET');
    assert.equal(options.body, undefined);
    assert.equal(options.redirect, 'manual');
    assert.equal(new Headers(options.headers).has('Authorization'), false);
    return Response.json(publishedGraph);
  };
  return { local: new StartupStore(root, { writeEnabled: false }), hosted, calls };
}

test('canonical source readers retain exact Unicode identity, record digest and provenance', async t => {
  const { local, hosted, calls } = await readers(t);
  const localRead = await local.get(id), hostedRead = await hosted.getStartupRecord(id);
  for (const key of ['id', 'record', 'recordRevision', 'schemaVersion', 'sourceFile', 'published'])
    assert.deepEqual(localRead[key], hostedRead[key]);
  assert.deepEqual(localRead.record, record);
  // Independently calculated with Python hashlib + sorted compact UTF-8 JSON.
  assert.equal(localRead.recordRevision, '943133d77725ab379bb2a96498d1146191bcac758bb451360117e5c8fb491185');
  assert.equal(localRead.record.source, 'https://startup.example.test/about?x=1#evidence');
  assert.equal(localRead.record.profile_facts[0].source, fixture.expected.profile_fact_source);
  assert.equal(Object.hasOwn(localRead.record, 'founded_year'), false);
  assert.deepEqual(localRead.record.socials, []);
  assert.equal(localRead.origin, 'local_repository');
  assert.equal(hostedRead.origin, 'repository');
  assert.equal(localRead.schemaVersion, 'startup-edit-v1');
  assert.equal(localRead.sourceFile, 'data/startup-research.json');
  assert.equal(localRead.published, false);
  assert.match(localRead.revision, /^[a-f0-9]{64}$/);
  // Python hashlib over the four fixture documents in `paths` order, each
  // re-encoded as two-space JSON plus LF in a compact JSON string array.
  // Updated for graph format v2 (docs/KG-CONNECTIVE-TISSUE.md §3): the
  // generated graph document now carries version 2 plus per-edge
  // freshness/confidence fields, so its bytes — and only its bytes —
  // changed; the authoritative record digest above remains unchanged.
  assert.equal(localRead.revision, '3384bfbd11d6f28317af203cce644012dc5dadd2cb5ce8967bcdf352d77e9180');
  assert.equal(hostedRead.revision, fixture.main_revision);
  assert.notEqual(localRead.revision, hostedRead.revision);
  assert.equal(`startup:${startupSlug(record.name)}`, id);
  assert.equal(`startup:${slug(record.name)}`, id);
  assert.equal(`person:${slug('Ada Example')}`, fixture.expected.founder_id);
  assert.equal(teamPersonId('Ada Example', 'Synthetic Firm'), fixture.expected.team_member_id);
  assert.notEqual(fixture.expected.founder_id, fixture.expected.team_member_id);
  assert.deepEqual(calls, ['/git/ref/heads/main', ...paths.map(name => `/contents/${name}?ref=${fixture.main_revision}`)]);
});

const rawBase = { name: 'Café Synthetic', source: 'https://synthetic.example/about?b=2&a=1', reviewed_at: '2026-11-17' };
// Python hashlib goldens use ensure_ascii=False, sort_keys=True and separators=(',', ':').
// Null/empty-string socials are intentionally invalid edit values: preserving
// historical raw JSON on read does not grant permission to submit it as an edit.
for (const [label, extra, expected, schemaValid] of [
  ['missing', {}, 'aa82aeb3690ff6eed00522c037430879e6d4189fea1694595c09a3a7bd37f94f', true],
  ['null', { socials: null }, 'dac1fa7868209ba1a4fcb41f1dd0fa9dde7b3ea91a61b82454059cdfb25a6c27', false],
  ['empty string', { socials: '' }, '25f516a75187c0e74cfae8bfe40944404829a3301ae8c645344bd1144b4a91d4', false],
  ['empty array', { socials: [] }, 'de395559742a9e005b018d29b63de512d50b61ec8612b8b90cf9cf3982470888', true],
]) test(`raw optional socials ${label} retains its distinct source-read digest`, async t => {
  const rawRecord = { ...rawBase, ...extra }, { local, hosted } = await readers(t, { rawRecord });
  for (const result of [await local.get(id), await hosted.getStartupRecord(id)]) {
    assert.deepEqual(result.record, rawRecord);
    assert.equal(result.recordRevision, expected);
    assert.equal(Object.hasOwn(result.record, 'socials'), label !== 'missing');
  }
  if (schemaValid) assert.doesNotThrow(() => validateStartupRecord(rawRecord));
  else assert.throws(() => validateStartupRecord(rawRecord), { code: 'VALIDATION_ERROR' });
});

test('record revision ignores object key order but preserves array order, source bytes and identity', async () => {
  const value = { ...rawBase, socials: [
    { label: 'First', url: 'https://social.example.test/first', source: rawBase.source, reviewed_at: rawBase.reviewed_at },
    { label: 'Second', url: 'https://social.example.test/second', source: rawBase.source, reviewed_at: rawBase.reviewed_at },
  ] };
  const reorder = item => Array.isArray(item) ? item.map(reorder) : item && typeof item === 'object'
    ? Object.fromEntries(Object.entries(item).reverse().map(([key, child]) => [key, reorder(child)])) : item;
  const digest = await recordRevision(id, value);
  assert.equal(await recordRevision(id, reorder(value)), digest);
  assert.notEqual(await recordRevision(id, { ...value, socials: [...value.socials].reverse() }), digest);
  assert.notEqual(await recordRevision(id, { ...value, source: 'https://synthetic.example/about?a=1&b=2' }), digest);
  assert.notEqual(await recordRevision('startup:other-synthetic', value), digest);
});

test('a graph-only entity is readable as a projection but not an authoritative source record', async t => {
  const graphOnly = { id: 'startup:graph-only-synthetic', kind: 'startup', name: 'Graph Only Synthetic' };
  const publishedGraph = { ...graph, entities: [...graph.entities, graphOnly] };
  const { local, hosted } = await readers(t, { publishedGraph });
  assert.deepEqual((await hosted.getStartup(graphOnly.id)).startup, graphOnly);
  await assert.rejects(local.get(graphOnly.id), { code: 'NOT_FOUND' });
  await assert.rejects(hosted.getStartupRecord(graphOnly.id), { code: 'NOT_FOUND' });
});

for (const [label, rawRevision, expectedRevision, status] of [
  ['missing', undefined, null, 'unknown'],
  ['null', null, null, 'unknown'],
  ['empty', '', null, 'unknown'],
  ['invalid', 'not-a-git-sha', null, 'unknown'],
  ['current', fixture.main_revision, fixture.main_revision, 'current'],
  ['stale', fixture.source_revision, fixture.source_revision, 'pending_publication'],
]) test(`published graph ${label} revision remains distinct from the repository revision`, async t => {
  const publishedGraph = structuredClone(graph);
  if (rawRevision === undefined) delete publishedGraph.source_revision;
  else publishedGraph.source_revision = rawRevision;
  const { hosted } = await readers(t, { publishedGraph });
  for (const result of [await hosted.getStartup(id), await hosted.searchGraph('Café Synthetic', 20)]) {
    assert.equal(result.revision, expectedRevision);
    assert.equal(result.mainRevision, fixture.main_revision);
    assert.equal(result.indexStatus, status);
  }
});
