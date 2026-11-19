// Synthetic protocol regressions for the existing local schema only. No image
// bytes, production records, accepted attachment fields or storage paths change.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const repo = fileURLToPath(new URL('../../../', import.meta.url));
const id = 'startup:example';
const founder = { name: 'Pat Founder', source: 'https://example.com/team' };
const startup = { name: 'Example', source: 'https://example.com/', reviewed_at: '2026-01-01', founders: [founder] };
const files = {
  'data/startup-research.json': { reviewed: '2026-01-01', startups: [startup] },
  'data/graph.json': { entities: [{ id, name: 'Example', kind: 'startup' }] },
  'data/partner-leads.json': [], 'data/partners-reviewed.json': {},
  'data/catalogue.json': { opportunities: [], partnerLeads: [] },
  'data/opportunities-added.json': { schemaVersion: 1, entries: [] },
};
const decode = result => result.structuredContent ?? JSON.parse(result.content[0].text);

async function connect(t, writeEnabled) {
  // Canonicalize fixture TMPDIR for macOS; production symlink checks stay intact.
  const dir = await realpath(await mkdtemp(path.join(tmpdir(), 'atlas-attachment-boundary-')));
  await mkdir(path.join(dir, 'data'));
  await mkdir(path.join(dir, 'scripts'));
  await Promise.all(Object.entries(files).map(([file, data]) => writeFile(path.join(dir, file), `${JSON.stringify(data)}\n`)));
  await writeFile(path.join(dir, 'scripts/make-data.py'), '# synthetic fixture; never executed\n');
  const transport = new StdioClientTransport({ command: process.execPath,
    args: [path.join(repo, 'backend/mcp/server.mjs'), '--repo', dir, ...(writeEnabled ? ['--write'] : [])], stderr: 'pipe' });
  let stderr = '';
  transport.stderr?.on('data', chunk => { stderr += chunk; });
  const client = new Client({ name: 'atlas-attachment-boundary-test', version: '1.0.0' });
  t.after(async () => { await client.close(); await rm(dir, { recursive: true, force: true }); assert.equal(stderr, ''); });
  await client.connect(transport);
  return { dir, client };
}

test('write-enabled stdio rejects attachment and approval fields with paths and preserves all fixture bytes', async t => {
  const { dir, client } = await connect(t, true);
  const bytes = async () => Object.fromEntries(await Promise.all(Object.keys(files).map(async file => [file, await readFile(path.join(dir, file), 'utf8')])));
  const before = await bytes();
  const current = decode(await client.callTool({ name: 'atlas_get_startup_record', arguments: { id } }));
  const edit = { id, expectedRecordRevision: current.recordRevision, patch: { reviewed_at: '2026-01-02' } };
  const preview = decode(await client.callTool({ name: 'atlas_validate_startup_edit', arguments: { edit } }));
  const asset = { assetId: `asset:sha256:${'b'.repeat(64)}`, manifestDigest: `sha256:${'c'.repeat(64)}`, assetCommit: 'd'.repeat(40) };
  const unsupported = { asset_ref: asset, asset, approved: true, approval: { authenticated: true, publicUse: 'approved' } };
  for (const [field, value] of Object.entries(unsupported)) {
    for (const nested of [false, true]) {
      const candidate = { ...edit, patch: nested
        ? { ...edit.patch, founders: [{ ...founder, [field]: value }] }
        : { ...edit.patch, [field]: value } };
      for (const name of ['atlas_validate_startup_edit', 'atlas_apply_startup_edit']) {
        const result = await client.callTool({ name, arguments: { edit: candidate,
          ...(name === 'atlas_apply_startup_edit' ? { expectedRevision: preview.revision, validationToken: preview.validationToken } : {}) } });
        assert.equal(result.isError, true);
        const error = decode(result);
        assert.equal(error.code, 'VALIDATION_ERROR');
        assert.equal(error.details.path, nested ? `/patch/founders/0/${field}` : `/patch/${field}`);
        assert.match(error.details.action, /validate.*again/i);
      }
    }
  }
  const contractEnvelope = { contractVersion: 'source-only-fixture',
    target: { recordId: id, expectedRecordRevision: current.recordRevision }, asset };
  for (const [candidate, path] of [[contractEnvelope, '/contractVersion'],
    [{ ...edit, patch: contractEnvelope }, '/patch/contractVersion']]) {
    for (const name of ['atlas_validate_startup_edit', 'atlas_apply_startup_edit']) {
      const result = await client.callTool({ name, arguments: { edit: candidate,
        ...(name === 'atlas_apply_startup_edit' ? { expectedRevision: preview.revision, validationToken: preview.validationToken } : {}) } });
      assert.equal(result.isError, true);
      const error = decode(result);
      assert.equal(error.code, 'VALIDATION_ERROR');
      assert.equal(error.details.path, path);
      assert.match(error.details.action, /validate.*again/i);
    }
  }
  assert.deepEqual(await bytes(), before);
  assert.deepEqual((await readdir(path.join(dir, 'data'))).sort(), Object.keys(files).map(file => path.basename(file)).sort());
  assert.deepEqual(decode(await client.callTool({ name: 'atlas_get_startup_record', arguments: { id } })), current);
});

test('a local image URL preview cannot enable writes when --write is absent', async t => {
  const { dir, client } = await connect(t, false);
  const file = path.join(dir, 'data/startup-research.json'), before = await readFile(file, 'utf8');
  const current = decode(await client.callTool({ name: 'atlas_get_startup_record', arguments: { id } }));
  const edit = { id, expectedRecordRevision: current.recordRevision, patch: {
    reviewed_at: '2026-01-02', logo: 'https://example.com/synthetic-logo.png', logo_source: 'https://example.com/press',
  } };
  const preview = decode(await client.callTool({ name: 'atlas_validate_startup_edit', arguments: { edit } }));
  assert.equal(preview.persisted, false);
  assert.equal(preview.published, false);
  const result = await client.callTool({ name: 'atlas_apply_startup_edit', arguments: {
    edit, expectedRevision: preview.revision, validationToken: preview.validationToken,
  } });
  assert.equal(result.isError, true);
  assert.equal(decode(result).code, 'READ_ONLY');
  assert.equal(await readFile(file, 'utf8'), before);
  assert.ok(!(await readdir(path.join(dir, 'data'))).includes('.atlas-mcp-write.lock'));
});
