// These tests pin the existing runtime boundary. The source-only attachment
// contract is not a tool schema, publication approval or implemented adapter.
import test from 'node:test';
import assert from 'node:assert/strict';
import { repository, base } from './startup-edit-fixture.mjs';
import { createWorker } from '../src/worker.mjs';
import { OAuthStore } from '../src/storage.mjs';
import { OWNER_ID, seal } from '../src/common.mjs';
import { environment, tokenResponse } from './helpers.mjs';

const id = 'startup:example';
const sourceFile = 'data/startup-research.json';
const assetRef = {
  assetId: `asset:sha256:${'b'.repeat(64)}`,
  manifestDigest: `sha256:${'c'.repeat(64)}`,
  assetCommit: 'd'.repeat(40),
};
const unsupported = {
  asset_ref: assetRef,
  asset: assetRef,
  attachment: { ...assetRef, subjectId: id, role: 'logo' },
  approved: true,
  approval: { authenticated: true, publicUse: 'approved' },
};
const decode = result => result.structuredContent ?? JSON.parse(result.content[0].text);

async function connectedWorker(t) {
  const env = environment(), store = new OAuthStore(env.DB);
  t.after(() => env.DB.sqlite.close());
  const { version } = await store.beginAuth('owner');
  await store.save('owner', await seal({
    accessToken: tokenResponse.access_token, refreshToken: tokenResponse.refresh_token,
    expiresAt: Date.now() + 3600000, refreshExpiresAt: Date.now() + 7200000,
    githubUserId: OWNER_ID, installationId: 42,
  }, env, 'connection:owner'), version);
  const fixture = repository(), worker = createWorker({ fetcher: fixture.client.fetcher });
  const call = async (name, args) => {
    const response = await worker.fetch(new Request('https://atlas.example.com/mcp', {
      method: 'POST', headers: { 'oai-authenticated-user-id': 'owner', 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
    }), env);
    assert.equal(response.status, 200);
    return (await response.json()).result;
  };
  return { ...fixture, call };
}

test('hosted validation and proposal reject attachment and caller-approval fields at both record scopes', async t => {
  const { call, state, writes } = await connectedWorker(t);
  const before = decode(await call('atlas_get_startup_record', { id }));
  const edit = { id, expectedRecordRevision: before.recordRevision, patch: { reviewed_at: '2026-01-01' } };
  const preview = decode(await call('atlas_validate_startup_edit', { edit }));
  for (const [field, value] of Object.entries(unsupported)) {
    for (const nested of [false, true]) {
      const candidate = { ...edit, patch: nested
        ? { ...edit.patch, founders: [{ ...before.record.founders[0], [field]: value }] }
        : { ...edit.patch, [field]: value } };
      const path = nested ? `/patch/founders/0/${field}` : `/patch/${field}`;
      for (const name of ['atlas_validate_startup_edit', 'atlas_propose_startup_edit']) {
        const result = await call(name, { edit: candidate, ...(name === 'atlas_propose_startup_edit'
          ? { expectedRevision: preview.revision, validationToken: preview.validationToken } : {}) });
        assert.equal(result.isError, true, `${name} must reject ${path}`);
        const error = decode(result);
        assert.equal(error.code, 'VALIDATION_ERROR');
        assert.equal(error.details.path, path);
        assert.match(error.details.action, /validate.*again/i);
      }
    }
  }
  // A source-contract envelope is never a runtime edit, even when it contains
  // real-looking revision tokens. Its internal format is not being validated here.
  const contractEnvelope = { contractVersion: 'source-only-fixture',
    target: { recordId: id, expectedRecordRevision: before.recordRevision }, asset: assetRef };
  for (const [candidate, path] of [[contractEnvelope, '/contractVersion'],
    [{ ...edit, patch: contractEnvelope }, '/patch/contractVersion']]) {
    for (const name of ['atlas_validate_startup_edit', 'atlas_propose_startup_edit']) {
      const result = await call(name, { edit: candidate, ...(name === 'atlas_propose_startup_edit'
        ? { expectedRevision: preview.revision, validationToken: preview.validationToken } : {}) });
      assert.equal(result.isError, true);
      const error = decode(result);
      assert.equal(error.code, 'VALIDATION_ERROR');
      assert.equal(error.details.path, path);
      assert.match(error.details.action, /validate.*again/i);
    }
  }
  assert.equal(writes(), 0);
  assert.equal(state.refs.size, 0);
  assert.equal(state.prs.length, 0);
  assert.deepEqual(decode(await call('atlas_get_startup_record', { id })), before);
});

test('legacy startup tools cannot be used to smuggle an attachment or approval into metadata', async () => {
  const { client, writes } = repository();
  const before = await client.getStartupRecord(id);
  for (const [field, value] of Object.entries(unsupported)) {
    for (const nested of [false, true]) {
      const record = nested
        ? { ...before.record, founders: [{ ...before.record.founders[0], [field]: value }] }
        : { ...before.record, [field]: value };
      for (const operation of [() => client.validateStartup(record), () => client.proposeStartup(record, base)]) {
        await assert.rejects(operation, error => {
          assert.equal(error.code, 'VALIDATION_ERROR');
          assert.match(error.message, new RegExp(`\\.${field} is not supported`));
          return true;
        });
      }
    }
  }
  assert.equal(writes(), 0);
  assert.deepEqual(await client.getStartupRecord(id), before);
});

test('existing image URL fields do not accept asset IDs and a valid URL preview supplies no asset approval', async () => {
  const { client, writes } = repository();
  const before = await client.getStartupRecord(id);
  const edit = { id, expectedRecordRevision: before.recordRevision, patch: { reviewed_at: '2026-01-01' } };
  for (const patch of [
    { logo: assetRef.assetId, logo_source: 'https://example.com/press' },
    { founders: [{ ...before.record.founders[0], photo_url: assetRef.assetId, photo_source: 'https://example.com/team' }] },
  ]) await assert.rejects(client.validateStartupEdit({ ...edit, patch: { ...edit.patch, ...patch } }), { code: 'VALIDATION_ERROR' });
  const preview = await client.validateStartupEdit({ ...edit, patch: {
    ...edit.patch, logo: 'https://example.com/synthetic-logo.png', logo_source: 'https://example.com/press',
  } });
  assert.equal(preview.persisted, false);
  assert.equal(preview.published, false);
  assert.equal(Object.hasOwn(preview, 'approval'), false);
  assert.equal(Object.hasOwn(preview, 'assetVerified'), false);
  assert.equal(writes(), 0);
});

test('a company-scoped portrait update preserves shared-founder identity guards in source and graph', async () => {
  for (const association of ['source', 'graph']) {
    const { client, state, writes } = repository();
    const documents = state.commits.get(base).documents;
    const founder = documents[sourceFile].startups[0].founders[0];
    if (association === 'source') documents[sourceFile].startups[1].founders = [structuredClone(founder)];
    else documents['data/graph.json'].edges = [{ from: 'person:pat-founder', to: 'startup:other-startup', kind: 'founded' }];
    const before = await client.getStartupRecord(id);
    const edit = { id, expectedRecordRevision: before.recordRevision, patch: {
      reviewed_at: '2026-01-01', founders: [{ ...founder, photo_url: 'https://example.com/pat.png', photo_source: founder.source }],
    } };
    await assert.rejects(client.validateStartupEdit(edit), error => {
      assert.equal(error.code, 'IDENTITY_CONFLICT');
      assert.equal(error.details.personId, 'person:pat-founder');
      assert.equal(error.details.path, '/patch/founders/0');
      assert.match(error.details.action, /person-scoped reviewed migration/);
      return true;
    });
    assert.equal(writes(), 0);
    assert.deepEqual(await client.getStartupRecord(id), before);
  }
});

test('asset paths remain outside the file allowlist and one-file proposal recovery', async () => {
  const { client, state, writes } = repository();
  const paths = ['web/assets/logos/synthetic.png', 'data/assets/synthetic-manifest.json'];
  const callsBefore = state.calls.length;
  for (const path of paths) await assert.rejects(client.file(path, base), { code: 'INVALID_PATH' });
  assert.equal(state.calls.length, callsBefore, 'unsupported paths must not reach the mock transport');

  const before = await client.getStartupRecord(id);
  const edit = { id, expectedRecordRevision: before.recordRevision, patch: { reviewed_at: '2026-01-01' } };
  const preview = await client.validateStartupEdit(edit);
  const proposed = await client.proposeStartupEdit(edit, preview.revision, preview.validationToken);
  const count = writes();
  // A correct record digest cannot legitimize an extra file in the proposal.
  // This is in-memory fixture data, not an image file or GitHub operation.
  state.commits.get(proposed.headRevision).documents[paths[1]] = { synthetic: true };
  for (const operation of [() => client.getStartupEditProposal(edit),
    () => client.proposeStartupEdit(edit, preview.revision, preview.validationToken)]) {
    await assert.rejects(operation, error => {
      assert.equal(error.code, 'BRANCH_CONFLICT');
      assert.match(error.message, /one-file update.*Inspect it manually/);
      return true;
    });
  }
  assert.equal(writes(), count, 'recovery must not widen, repair or replay the proposal');
  assert.equal(state.refs.size, 1);
  assert.equal(state.prs.length, 1);
});
