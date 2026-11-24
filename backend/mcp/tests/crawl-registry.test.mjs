import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, cp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { CrawlRegistry } from '../crawls.mjs';

const repo = fileURLToPath(new URL('../../../', import.meta.url));
// The registry is append-only: freeze the original 20 Nov seed entry as the
// fixture so later run records do not break these tests.
const live = JSON.parse(await readFile(path.join(repo, 'data/crawl-runs.json'), 'utf8'));
const seedRun = live.runs.find(run => run.run_id === 'crawl-20261120-partners-01');
const seed = { version: 1, runs: [seedRun] };

const run = (overrides = {}) => {
  const copy = JSON.parse(JSON.stringify(seedRun));
  return { ...copy, ...overrides };
};
const liveRun = run({
  run_id: 'crawl-20261120-partners-02', status: 'running', finished_at: null,
  claimed_at: '2026-11-20T03:40:00Z', lease_expires_at: '2999-01-01T00:00:00Z',
});
const staleRun = run({
  run_id: 'crawl-20261120-partners-03', status: 'running', finished_at: null,
  claimed_at: '2026-11-20T03:40:00Z', lease_expires_at: '2020-01-01T00:00:00Z',
});

async function registryWith(t, document) {
  const dir = await mkdtemp(path.join(tmpdir(), 'atlas-crawls-'));
  await mkdir(path.join(dir, 'data'));
  await writeFile(path.join(dir, 'data/crawl-runs.json'), typeof document === 'string' ? document : JSON.stringify(document));
  t.after(async () => { await rm(dir, { recursive: true, force: true }); });
  return new CrawlRegistry(dir);
}
const codeOf = async promise => {
  try { await promise; return null; }
  catch (error) { return error.code; }
};

test('empty registry lists no runs and reports a revision', async t => {
  const registry = await registryWith(t, { version: 1, runs: [] });
  const listed = await registry.list({});
  assert.equal(listed.total, 0);
  assert.deepEqual(listed.runs, []);
  assert.match(listed.revision, /^[a-f0-9]{64}$/);
  assert.equal((await registry.claims({})).total, 0);
});

test('seed registry reads the 20 Nov partners run and derives no claims from a failed run', async t => {
  const registry = await registryWith(t, seed);
  const listed = await registry.list({});
  assert.equal(listed.total, 1);
  assert.equal(listed.runs[0].run_id, 'crawl-20261120-partners-01');
  assert.equal(listed.runs[0].status, 'failed');
  assert.equal(listed.runs[0].outcome.candidates_discovered, 0);
  const found = await registry.get('crawl-20261120-partners-01');
  assert.equal(found.run.snapshot_sha256, '3b7743ae775c7ff836a0ee884ca4dae85048c48519ef9b22adf61d9c354b9c36');
  assert.equal((await registry.claims({})).total, 0);
  assert.equal(await codeOf(registry.get('crawl-20261120-partners-99')), 'NOT_FOUND');
  assert.equal(await codeOf(registry.get('not-a-run-id')), 'VALIDATION_ERROR');
});

test('list filters by mode, source, status and start date', async t => {
  const registry = await registryWith(t, { version: 1, runs: [seedRun, run({ run_id: 'crawl-20261121-programs-01', mode: 'programs', status: 'completed', finished_at: '2026-11-21T03:00:00Z', started_at: '2026-11-21T02:00:00Z', claimed_at: '2026-11-21T02:00:00Z', lease_expires_at: '2026-11-21T02:30:00Z' })] });
  assert.equal((await registry.list({ mode: 'programs' })).total, 1);
  assert.equal((await registry.list({ mode: 'partners' })).total, 1);
  assert.equal((await registry.list({ source_id: 'aws-activate-featured' })).total, 2);
  assert.equal((await registry.list({ source_id: 'no-such-source' })).total, 0);
  assert.equal((await registry.list({ status: 'completed' })).total, 1);
  assert.equal((await registry.list({ status: 'failed' })).total, 1);
  assert.equal((await registry.list({ since: '2026-11-21' })).total, 1);
  assert.equal((await registry.list({ since: '2026-11-22' })).total, 0);
  assert.equal((await registry.list({ limit: 1 })).runs.length, 1);
  assert.equal(await codeOf(registry.list({ mode: 'not-a-mode' })), 'VALIDATION_ERROR');
  assert.equal(await codeOf(registry.list({ limit: 0 })), 'VALIDATION_ERROR');
});

test('claims derive live and stale entries from claimed and running runs only', async t => {
  const registry = await registryWith(t, { version: 1, runs: [seedRun, liveRun, staleRun] });
  const claims = await registry.claims({});
  assert.equal(claims.total, 10);
  assert.equal(claims.claims.filter(claim => claim.status === 'live').length, 5);
  assert.equal(claims.claims.filter(claim => claim.status === 'stale').length, 5);
  assert.equal(claims.claims[0].run_id, 'crawl-20261120-partners-03');
  const oneSource = await registry.claims({ source_id: 'aws-activate-featured' });
  assert.equal(oneSource.total, 2);
  assert.deepEqual(oneSource.claims.map(claim => claim.status).sort(), ['live', 'stale']);
  assert.equal((await registry.claims({ mode: 'programs' })).total, 0);
});

test('malformed, duplicate and invalid registry records fail closed', async t => {
  assert.equal(await codeOf((await registryWith(t, '{not json')).snapshot()), 'INVALID_REGISTRY');
  assert.equal(await codeOf((await registryWith(t, { version: 2, runs: [] })).snapshot()), 'INVALID_REGISTRY');
  assert.equal(await codeOf((await registryWith(t, { version: 1, runs: [seedRun, seedRun] })).snapshot()), 'INVALID_REGISTRY');
  assert.equal(await codeOf((await registryWith(t, { version: 1, runs: [run({ status: 'done' })] })).snapshot()), 'VALIDATION_ERROR');
  assert.equal(await codeOf((await registryWith(t, { version: 1, runs: [run({ catalogue_revision: 'short' })] })).snapshot()), 'VALIDATION_ERROR');
  assert.equal(await codeOf((await registryWith(t, { version: 1, runs: [run({ status: 'running', finished_at: '2026-11-20T03:36:00Z' })] })).snapshot()), 'VALIDATION_ERROR');
  assert.equal(await codeOf((await registryWith(t, { version: 1, runs: [run({ outcome: { ...seedRun.outcome, sources_succeeded: 9 } })] })).snapshot()), 'VALIDATION_ERROR');
  const overLimit = { version: 1, runs: Array.from({ length: 201 }, (_, index) => run({ run_id: `crawl-202611${20 + Math.floor(index / 100)}-partners-${String(index % 100 + 1).padStart(2, '0')}` })) };
  assert.equal(await codeOf((await registryWith(t, overLimit)).snapshot()), 'INVALID_REGISTRY');
});

test('outcome.sources records per-source status and is validated when present', async t => {
  const withSources = run({ outcome: { ...seedRun.outcome, sources: [
    { source: 'Live source', status: 'ok', pages_ok: 3, pages_attempted: 3 },
    { source: 'Dead source', status: 'failed', pages_ok: 0, pages_attempted: 2 },
    { source: 'Untried source', status: 'not_attempted', pages_ok: 0, pages_attempted: 0 },
  ] } });
  const registry = await registryWith(t, { version: 1, runs: [withSources] });
  const found = await registry.get(withSources.run_id);
  assert.equal(found.run.outcome.sources.length, 3);
  assert.equal(found.run.outcome.sources[1].status, 'failed');
  // Absent sources stays valid (records written before per-source status existed).
  assert.equal(await codeOf((await registryWith(t, seed)).snapshot()), null);
  const badStatus = run({ outcome: { ...seedRun.outcome, sources: [
    { source: 'X', status: 'green', pages_ok: 0, pages_attempted: 1 }] } });
  assert.equal(await codeOf((await registryWith(t, { version: 1, runs: [badStatus] })).snapshot()), 'VALIDATION_ERROR');
  const overOk = run({ outcome: { ...seedRun.outcome, sources: [
    { source: 'X', status: 'ok', pages_ok: 2, pages_attempted: 1 }] } });
  assert.equal(await codeOf((await registryWith(t, { version: 1, runs: [overOk] })).snapshot()), 'VALIDATION_ERROR');
  const extraKey = run({ outcome: { ...seedRun.outcome, sources: [
    { source: 'X', status: 'ok', pages_ok: 1, pages_attempted: 1, note: 'nope' }] } });
  assert.equal(await codeOf((await registryWith(t, { version: 1, runs: [extraKey] })).snapshot()), 'VALIDATION_ERROR');
});

const decoded = result => JSON.parse(result.content[0].text);

test('official MCP client discovers the crawl tools and reads the registry over real stdio', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'atlas-crawl-protocol-'));
  await cp(path.join(repo, 'data'), path.join(dir, 'data'), { recursive: true });
  // Serve the frozen single-run seed fixture, not the live registry, so this
  // test stays deterministic as run records are appended.
  await writeFile(path.join(dir, 'data/crawl-runs.json'), JSON.stringify(seed));
  await mkdir(path.join(dir, 'scripts'));
  await cp(path.join(repo, 'scripts/make-data.py'), path.join(dir, 'scripts/make-data.py'));
  const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(repo, 'backend/mcp/server.mjs'), '--repo', dir], stderr: 'pipe' });
  let stderr = '';
  transport.stderr?.on('data', chunk => { stderr += chunk; });
  const client = new Client({ name: 'atlas-test-client', version: '1.0.0' });
  t.after(async () => { await client.close(); await rm(dir, { recursive: true, force: true }); assert.equal(stderr, ''); });
  await client.connect(transport);
  const { tools } = await client.listTools();
  assert.equal(tools.length, 18);
  for (const name of ['atlas_list_crawl_runs', 'atlas_get_crawl_run', 'atlas_get_crawl_claims']) {
    assert.equal(tools.find(item => item.name === name).annotations.readOnlyHint, true);
  }
  const listed = decoded(await client.callTool({ name: 'atlas_list_crawl_runs', arguments: {} }));
  assert.equal(listed.total, 1);
  assert.equal(listed.runs[0].run_id, 'crawl-20261120-partners-01');
  const found = decoded(await client.callTool({ name: 'atlas_get_crawl_run', arguments: { run_id: 'crawl-20261120-partners-01' } }));
  assert.equal(found.run.mode, 'partners');
  const claims = decoded(await client.callTool({ name: 'atlas_get_crawl_claims', arguments: {} }));
  assert.equal(claims.total, 0);
  const missing = await client.callTool({ name: 'atlas_get_crawl_run', arguments: { run_id: 'crawl-20261120-partners-99' } });
  assert.equal(missing.isError, true);
  assert.equal(decoded(missing).code, 'NOT_FOUND');
});
