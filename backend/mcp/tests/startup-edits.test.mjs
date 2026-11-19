import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, symlink, link } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StartupStore } from '../startups.mjs';
import { startupEditSchema } from '../../hosted/src/startup-edit.mjs';

const repo = fileURLToPath(new URL('../../../', import.meta.url));
const source = 'https://example.com/about';
const startup = {
  name: 'Example', description: 'Source-backed example company.', website: 'https://example.com/', source, reviewed_at: '2026-01-01',
  founders: [{ name: 'Pat Founder', source: 'https://example.com/team' }],
  funding_rounds: [{ id: 'example-seed', stage: 'Seed', amount: 500000, currency: 'AUD', source: 'https://example.com/seed' }],
  profile_facts: [{ key: 'official-press-materials', label: 'Official press materials', value: 'Logo publication remains held pending usage permission.', source: 'https://example.com/press', reviewed_at: '2026-01-01' }],
  socials: [{ label: 'LinkedIn', url: 'https://www.linkedin.com/company/example', source, reviewed_at: '2026-01-01' }],
};
const social = { label: 'YouTube', url: 'https://www.youtube.com/@example', source: 'https://example.com/', reviewed_at: '2026-01-02' };
const files = {
  'data/startup-research.json': { reviewed: '2026-01-01', startups: [startup, { name: 'Other', description: 'Another reviewed company.', website: 'https://other.example.com/', source: 'https://other.example.com/about', reviewed_at: '2026-01-01' }] },
  'data/graph.json': { entities: [{ id: 'startup:example', kind: 'startup', name: 'Example', summary: 'A deliberately incomplete graph projection.' }, { id: 'startup:other', kind: 'startup', name: 'Other' }] },
  'data/partner-leads.json': [],
  'data/catalogue.json': { opportunities: [], partnerLeads: [] },
  'data/opportunities-added.json': { schemaVersion: 1, entries: [] },
  'data/partners-reviewed.json': {},
};

async function fixture(t, writeEnabled = true) {
  const dir = await mkdtemp(path.join(tmpdir(), 'atlas-startup-edit-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(path.join(dir, 'data'));
  await mkdir(path.join(dir, 'scripts'));
  await Promise.all(Object.entries(files).map(([file, value]) => writeFile(path.join(dir, file), JSON.stringify(value) + '\n')));
  await writeFile(path.join(dir, 'scripts/make-data.py'), '# protocol fixture; never executed\n');
  const store = new StartupStore(dir, { writeEnabled });
  return { dir, store };
}
async function bytes(dir) {
  return Object.fromEntries(await Promise.all(Object.keys(files).map(async file => [file, await readFile(path.join(dir, file), 'utf8')])));
}
async function intended(store, patch = { reviewed_at: '2026-01-02', socials: [social] }) {
  const current = await store.get('startup:example');
  return { id: current.id, expectedRecordRevision: current.recordRevision, patch };
}
async function cleanDataDirectory(dir) {
  assert.deepEqual((await readdir(path.join(dir, 'data'))).sort(), Object.keys(files).map(file => path.basename(file)).sort());
}
const decoded = result => JSON.parse(result.content[0].text);

test('local startup source reads and previews retain complete records and do not write', async t => {
  const { store, dir } = await fixture(t, false);
  const before = await bytes(dir);
  const found = await store.search('Source-backed example', 1);
  assert.equal(found.total, 1);
  assert.equal(found.records[0].id, 'startup:example');
  assert.deepEqual(found.records[0].record, startup);
  assert.match(found.records[0].recordRevision, /^[a-f0-9]{64}$/);
  assert.equal(found.origin, 'local_repository');
  assert.equal(found.published, false);
  const record = await store.get('startup:example');
  assert.deepEqual(record.record, startup);
  const edit = await intended(store);
  const preview = await store.validate(edit);
  assert.equal(preview.recordRevision, record.recordRevision);
  assert.match(preview.revision, /^[a-f0-9]{64}$/);
  assert.equal(preview.merged.socials.length, 2);
  assert.deepEqual(preview.merged.founders, startup.founders);
  assert.equal(preview.persisted, false);
  assert.equal(preview.published, false);
  assert.equal(Object.hasOwn(preview, 'research'), false);
  await assert.rejects(store.apply(edit, preview.revision, preview.validationToken), { code: 'READ_ONLY' });
  assert.deepEqual(await bytes(dir), before);
  await cleanDataDirectory(dir);
});

test('local startup writes change only the reviewed overlay and return its authoritative digest', async t => {
  const { store, dir } = await fixture(t);
  const before = await bytes(dir), edit = await intended(store), preview = await store.validate(edit);
  const saved = await store.apply(edit, preview.revision, preview.validationToken);
  assert.equal(saved.status, 'saved');
  assert.equal(saved.persisted, true);
  assert.equal(saved.published, false);
  assert.equal(saved.origin, 'local_repository');
  assert.equal(saved.recordRevision, preview.nextRecordRevision);
  assert.equal(saved.nextRecordRevision, saved.recordRevision);
  assert.equal(saved.baseRevision, preview.revision);
  assert.notEqual(saved.revision, saved.baseRevision);
  assert.deepEqual(saved.record, preview.merged);
  const readback = await store.get(edit.id);
  assert.deepEqual(readback.record, saved.record);
  assert.equal(readback.recordRevision, saved.recordRevision);
  assert.equal(readback.revision, saved.revision);
  assert.deepEqual(saved.record.funding_rounds, startup.funding_rounds);
  assert.deepEqual(saved.record.founders, startup.founders);
  assert.deepEqual(saved.record.profile_facts, startup.profile_facts);
  assert.equal(saved.record.source, source);
  assert.equal(saved.record.logo, undefined);
  const after = await bytes(dir);
  assert.deepEqual(Object.keys(after).filter(file => after[file] !== before[file]), ['data/startup-research.json']);
  assert.deepEqual(JSON.parse(after['data/startup-research.json']).startups[1], files['data/startup-research.json'].startups[1]);
  await assert.rejects(store.apply(edit, preview.revision, preview.validationToken), { code: 'STALE_REVISION' });
  assert.deepEqual(await bytes(dir), after);
  await cleanDataDirectory(dir);
});

test('local startup no-op preserves exact bytes and returns already_present without claiming persistence', async t => {
  const { store, dir } = await fixture(t);
  const before = await bytes(dir), edit = await intended(store, { reviewed_at: startup.reviewed_at });
  const preview = await store.validate(edit), saved = await store.apply(edit, preview.revision, preview.validationToken);
  assert.equal(saved.status, 'already_present');
  assert.equal(saved.persisted, false);
  assert.equal(saved.recordRevision, preview.recordRevision);
  assert.deepEqual(await bytes(dir), before);
  await cleanDataDirectory(dir);
});

test('local startup edits honour the shared catalogue lock without removing another writer lock', async t => {
  const { store, dir } = await fixture(t);
  const before = await bytes(dir), edit = await intended(store), preview = await store.validate(edit);
  const lock = path.join(dir, 'data/.atlas-mcp-write.lock');
  await writeFile(lock, 'another-writer');
  await assert.rejects(store.apply(edit, preview.revision, preview.validationToken), { code: 'WRITE_BUSY' });
  assert.equal(await readFile(lock, 'utf8'), 'another-writer');
  assert.deepEqual(await bytes(dir), before);
});

test('local startup apply rejects an edited intent even when both revision preconditions still match', async t => {
  const { store, dir } = await fixture(t);
  const before = await bytes(dir), edit = await intended(store), preview = await store.validate(edit);
  const changed = { ...edit, patch: { ...edit.patch, description: 'Different intended description.' } };
  await assert.rejects(store.apply(changed, preview.revision, preview.validationToken), { code: 'VALIDATION_CONFLICT' });
  assert.deepEqual(await bytes(dir), before);
  await cleanDataDirectory(dir);
});

test('every local input participates in optimistic concurrency, including an unrelated record', async t => {
  for (const relative of ['data/startup-research.json', 'data/graph.json', 'data/partner-leads.json', 'data/catalogue.json']) {
    await t.test(relative, async child => {
      const { store, dir } = await fixture(child);
      const edit = await intended(store), preview = await store.validate(edit);
      const file = path.join(dir, relative);
      const document = JSON.parse(await readFile(file, 'utf8'));
      if (relative === 'data/startup-research.json') document.startups[1].description = 'An independently corrected description.';
      // Even whitespace is part of the local snapshot precondition.
      await writeFile(file, JSON.stringify(document, null, 2) + '\n\n');
      const afterConcurrentChange = await bytes(dir);
      await assert.rejects(store.apply(edit, preview.revision, preview.validationToken), error => {
        assert.equal(error.code, 'STALE_REVISION');
        assert.equal(error.details.path, 'expectedRevision');
        assert.match(error.details.currentRevision, /^[a-f0-9]{64}$/);
        return true;
      });
      assert.deepEqual(await bytes(dir), afterConcurrentChange);
      await cleanDataDirectory(dir);
    });
  }
});

test('a stale record digest cannot be validated against a freshly read local snapshot', async t => {
  const { store, dir } = await fixture(t);
  const edit = await intended(store), file = path.join(dir, 'data/startup-research.json');
  const research = JSON.parse(await readFile(file, 'utf8'));
  research.startups[0].description = 'Someone else corrected this record.';
  await writeFile(file, JSON.stringify(research) + '\n');
  const before = await bytes(dir);
  await assert.rejects(store.validate(edit), { code: 'RECORD_CONFLICT' });
  assert.deepEqual(await bytes(dir), before);
});

test('a non-MCP change during preparation is detected before atomic replacement', async t => {
  const { store, dir } = await fixture(t);
  const edit = await intended(store), preview = await store.validate(edit);
  const sourceBefore = await readFile(store.file, 'utf8'), snapshot = store.snapshot.bind(store);
  let calls = 0;
  store.snapshot = async () => {
    if (++calls === 2) await writeFile(path.join(dir, 'data/graph.json'), JSON.stringify({ ...files['data/graph.json'], source_revision: 'changed-externally' }));
    return snapshot();
  };
  await assert.rejects(store.apply(edit, preview.revision, preview.validationToken), { code: 'STALE_REVISION' });
  assert.equal(await readFile(store.file, 'utf8'), sourceBefore);
  await cleanDataDirectory(dir);
});

test('a readback failure after rename returns a recoverable uncertain result without replaying', async t => {
  const { store, dir } = await fixture(t);
  const edit = await intended(store), preview = await store.validate(edit), snapshot = store.snapshot.bind(store);
  let calls = 0;
  store.snapshot = async () => {
    if (++calls === 3) throw new Error(`Simulated read failure at ${dir}`);
    return snapshot();
  };
  await assert.rejects(store.apply(edit, preview.revision, preview.validationToken), error => {
    assert.equal(error.code, 'WRITE_UNCERTAIN');
    assert.equal(error.details.id, edit.id);
    assert.equal(error.details.nextRecordRevision, preview.nextRecordRevision);
    assert.match(error.details.action, /atlas_get_startup_record/);
    assert.ok(!JSON.stringify(error).includes(dir));
    return true;
  });
  const readback = await new StartupStore(dir).get(edit.id);
  assert.equal(readback.recordRevision, preview.nextRecordRevision);
  assert.deepEqual(readback.record, preview.merged);
  assert.equal(readback.published, false);
  await cleanDataDirectory(dir);
});

test('unsafe source files are rejected before locks or replacements', async t => {
  for (const kind of ['symlink', 'hardlink']) {
    await t.test(kind, async child => {
      const { store, dir } = await fixture(child);
      const edit = await intended(store), preview = await store.validate(edit), file = store.file;
      const outside = path.join(dir, 'original-records.json');
      const original = await readFile(file, 'utf8');
      await writeFile(outside, original);
      await rm(file);
      await (kind === 'symlink' ? symlink(outside, file) : link(outside, file));
      await assert.rejects(store.apply(edit, preview.revision, preview.validationToken), { code: 'UNSAFE_PATH' });
      assert.equal(await readFile(outside, 'utf8'), original);
      assert.ok(!(await readdir(path.join(dir, 'data'))).includes('.atlas-mcp-write.lock'));
    });
  }
});

test('invalid startup edit payloads and unsupported corrections leave local bytes untouched', async t => {
  const { store, dir } = await fixture(t);
  const before = await bytes(dir), edit = await intended(store);
  for (const patch of [
    { reviewed_at: '2026-01-02', name: 'Renamed' },
    { reviewed_at: '2026-01-02', unknown_field: 'value' },
    { reviewed_at: '2026-01-02', socials: null },
    { reviewed_at: '2026-01-02', remove: ['socials'] },
    { reviewed_at: '2026-01-02', socials: [{ ...social, source: 'http://example.com/' }] },
  ]) await assert.rejects(store.validate({ ...edit, patch }));
  await assert.rejects(store.get('../data/startup-research.json'));
  await assert.rejects(store.search('', 101), { code: 'VALIDATION_ERROR' });
  assert.deepEqual(await bytes(dir), before);
  await cleanDataDirectory(dir);
});

test('official MCP client discovers, validates, applies and reads startup edits over real stdio', async t => {
  const { dir } = await fixture(t);
  const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(repo, 'backend/mcp/server.mjs'), '--repo', dir, '--write'], stderr: 'pipe' });
  let stderr = ''; transport.stderr?.on('data', chunk => { stderr += chunk; });
  const client = new Client({ name: 'atlas-startup-contract-test', version: '1.0.0' });
  t.after(async () => { await client.close(); assert.equal(stderr, ''); });
  await client.connect(transport);
  const { tools } = await client.listTools();
  assert.deepEqual(tools.find(tool => tool.name === 'atlas_validate_startup_edit').inputSchema.properties.edit, startupEditSchema);
  assert.equal(tools.find(tool => tool.name === 'atlas_apply_startup_edit').annotations.readOnlyHint, false);
  assert.equal(tools.find(tool => tool.name === 'atlas_apply_startup_edit').annotations.idempotentHint, false);
  const current = decoded(await client.callTool({ name: 'atlas_get_startup_record', arguments: { id: 'startup:example' } }));
  assert.deepEqual(current.record, startup);
  const edit = { id: current.id, expectedRecordRevision: current.recordRevision, patch: { reviewed_at: '2026-01-02', socials: [social] } };
  const validation = await client.callTool({ name: 'atlas_validate_startup_edit', arguments: { edit } });
  assert.equal(validation.isError, undefined);
  const preview = decoded(validation);
  const saved = await client.callTool({ name: 'atlas_apply_startup_edit', arguments: { edit, expectedRevision: preview.revision, validationToken: preview.validationToken } });
  assert.equal(saved.isError, undefined);
  assert.equal(decoded(saved).published, false);
  assert.equal(decoded(saved).recordRevision, preview.nextRecordRevision);
  const readback = decoded(await client.callTool({ name: 'atlas_get_startup_record', arguments: { id: edit.id } }));
  assert.deepEqual(readback.record, preview.merged);
  const stale = await client.callTool({ name: 'atlas_validate_startup_edit', arguments: { edit } });
  assert.equal(stale.isError, true);
  assert.equal(decoded(stale).code, 'RECORD_CONFLICT');
  assert.deepEqual(stale.structuredContent, decoded(stale));
  assert.ok(decoded(stale).details.action);
  assert.ok(!JSON.stringify(stale).includes(dir));
});
