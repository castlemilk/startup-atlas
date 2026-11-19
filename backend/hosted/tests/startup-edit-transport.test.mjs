import test from 'node:test';
import assert from 'node:assert/strict';
import { repository, base } from './startup-edit-fixture.mjs';
import { recordRevision } from '../src/startup-edit.mjs';
import { createWorker, tools } from '../src/worker.mjs';
import { OAuthStore } from '../src/storage.mjs';
import { OWNER_ID, seal } from '../src/common.mjs';
import { environment, tokenResponse } from './helpers.mjs';

const sourceFile = 'data/startup-research.json';
const id = 'startup:example';
const social = { label: 'LinkedIn', url: 'https://www.linkedin.com/company/example', source: 'https://example.com/', reviewed_at: '2026-01-01' };
const reorder = value => Array.isArray(value) ? value.map(reorder) : value && typeof value === 'object'
  ? Object.fromEntries(Object.entries(value).reverse().map(([key, child]) => [key, reorder(child)])) : value;
async function intent(client, patch = {}) {
  const record = await client.getStartupRecord(id);
  return { id, expectedRecordRevision: record.recordRevision, patch: { reviewed_at: '2026-01-01', socials: [social], ...patch } };
}

test('canonical source read and validation expose exact records and never write', async () => {
  const { client, state, writes } = repository();
  const read = await client.getStartupRecord(id);
  assert.equal(read.origin, 'repository');
  assert.equal(read.revision, base);
  assert.equal(read.recordRevision, await recordRevision(id, read.record));
  assert.deepEqual(read.record, state.commits.get(base).documents[sourceFile].startups[0]);
  const edit = await intent(client), preview = await client.validateStartupEdit(edit);
  assert.deepEqual(preview.merged.socials, [social]);
  assert.deepEqual(preview.merged.founders, read.record.founders);
  assert.equal(preview.merged.source, read.record.source);
  assert.equal(preview.published, false);
  assert.equal(preview.persisted, false);
  assert.equal(Object.hasOwn(preview, 'research'), false);
  assert.equal(writes(), 0);
  const missing = await client.getStartupEditProposal(edit);
  assert.equal(missing.status, 'not_found');
  assert.equal(missing.intentDigest, preview.intentDigest);
  assert.equal(missing.branch, preview.branch);
  assert.equal(writes(), 0);
});

test('a proposal returns verified exact-head readback and preserves all other records', async () => {
  const { client, state, writes } = repository();
  const edit = await intent(client), preview = await client.validateStartupEdit(edit);
  const receipt = await client.proposeStartupEdit(edit, preview.revision, preview.validationToken);
  assert.equal(receipt.status, 'proposed');
  assert.equal(receipt.origin, 'proposal');
  assert.equal(receipt.baseRevision, base);
  assert.equal(receipt.revision, receipt.headRevision);
  assert.equal(receipt.recordRevision, preview.nextRecordRevision);
  assert.deepEqual(receipt.record, preview.merged);
  assert.equal(receipt.published, false);
  assert.equal(state.head, base);
  assert.equal(state.prs.length, 1);
  assert.equal(state.prs[0].draft, true);
  const tree = state.calls.find(call => call.path === '/git/trees').body.tree;
  assert.deepEqual(tree.map(file => file.path), [sourceFile]);
  const changed = JSON.parse(tree[0].content);
  assert.deepEqual(changed.startups[1], state.commits.get(base).documents[sourceFile].startups[1]);
  const count = writes(), recovered = await client.getStartupEditProposal(edit);
  assert.equal(writes(), count);
  assert.deepEqual(recovered, receipt);
  assert.deepEqual((await client.getStartupRecord(id)).record.socials, undefined);
});

test('strict edits reject stale repository or record revisions and changed validation intents before writes', async () => {
  const { client, state, writes, advance } = repository();
  const edit = await intent(client), preview = await client.validateStartupEdit(edit);
  await assert.rejects(client.proposeStartupEdit({ ...edit, patch: { ...edit.patch, description: 'Changed after preview' } }, preview.revision, preview.validationToken), { code: 'VALIDATION_CONFLICT' });
  await assert.rejects(client.proposeStartupEdit(edit, preview.revision, '0'.repeat(64)), { code: 'VALIDATION_CONFLICT' });
  assert.equal(writes(), 0);
  advance();
  await assert.rejects(client.proposeStartupEdit(edit, preview.revision, preview.validationToken), error => {
    assert.equal(error.code, 'STALE_REVISION');
    assert.equal(error.details.actualRevision, state.head);
    assert.equal(error.details.retryable, false);
    return true;
  });
  state.commits.get(state.head).documents[sourceFile].startups[0].description = 'A concurrently reviewed description';
  await assert.rejects(client.validateStartupEdit(edit), { code: 'RECORD_CONFLICT' });
  assert.equal(writes(), 0);
});

test('object-key retries reconcile the same intent after unrelated main changes without mutation', async () => {
  const { client, writes, advance } = repository();
  const edit = await intent(client), preview = await client.validateStartupEdit(edit);
  const first = await client.proposeStartupEdit(edit, preview.revision, preview.validationToken), count = writes();
  advance();
  const retry = await client.proposeStartupEdit(reorder(edit), preview.revision, preview.validationToken);
  assert.equal(retry.branch, first.branch);
  assert.equal(retry.headRevision, first.headRevision);
  assert.equal(retry.intentDigest, first.intentDigest);
  assert.equal(writes(), count);
});

test('concurrent identical edits yield one branch and draft, with read-only recovery for the uncertain caller', async () => {
  const { client, state, writes } = repository();
  const edit = await intent(client), preview = await client.validateStartupEdit(edit);
  const outcomes = await Promise.allSettled([
    client.proposeStartupEdit(edit, preview.revision, preview.validationToken),
    client.proposeStartupEdit(edit, preview.revision, preview.validationToken),
  ]);
  assert.ok(outcomes.some(outcome => outcome.status === 'fulfilled' && outcome.value.status === 'proposed'));
  for (const outcome of outcomes) if (outcome.status === 'rejected') assert.equal(outcome.reason.code, 'WRITE_UNCERTAIN');
  assert.equal(state.refs.size, 1);
  assert.equal(state.prs.length, 1);
  const count = writes(), recovered = await client.getStartupEditProposal(edit);
  assert.equal(recovered.recordRevision, preview.nextRecordRevision);
  assert.equal(writes(), count);
});

test('a no-op returns repository readback without creating a branch or PR', async () => {
  const { client, writes, state } = repository();
  const read = await client.getStartupRecord(id);
  const edit = { id, expectedRecordRevision: read.recordRevision, patch: { reviewed_at: read.record.reviewed_at } };
  const preview = await client.validateStartupEdit(edit);
  const result = await client.proposeStartupEdit(edit, preview.revision, preview.validationToken);
  assert.equal(result.status, 'already_present');
  assert.equal(result.recordRevision, read.recordRevision);
  assert.equal(result.published, false);
  assert.equal(writes(), 0);
  assert.equal(state.refs.size, 0);
});

for (const [path, expectedStatus] of [['/git/trees', 'not_found'], ['/git/commits', 'not_found'], ['/git/refs', 'partial'], ['/pulls', 'proposed']]) {
  test(`lost response after ${path} is reconciled by reads without completing a partial write`, async () => {
    const { client, state, writes } = repository();
    const edit = await intent(client), preview = await client.validateStartupEdit(edit);
    state.fault = { path, when: 'after' };
    await assert.rejects(client.proposeStartupEdit(edit, preview.revision, preview.validationToken), error => {
      assert.equal(error.code, 'WRITE_UNCERTAIN');
      assert.equal(error.details.branch, preview.branch);
      assert.equal(error.details.expectedRecordRevision, preview.nextRecordRevision);
      assert.equal(error.details.recoveryTool, 'atlas_get_startup_edit_proposal');
      return true;
    });
    const count = writes();
    if (expectedStatus === 'partial') {
      await assert.rejects(client.getStartupEditProposal(edit), { code: 'WRITE_UNCERTAIN' });
      await assert.rejects(client.proposeStartupEdit(edit, preview.revision, preview.validationToken), { code: 'WRITE_UNCERTAIN' });
      assert.equal(state.prs.length, 0);
    } else {
      const recovered = await client.getStartupEditProposal(edit);
      assert.equal(recovered.status, expectedStatus);
      if (expectedStatus === 'proposed') assert.equal(recovered.recordRevision, preview.nextRecordRevision);
    }
    assert.equal(writes(), count);
  });
}

test('tampered proposal content, PR heads and missing branches remain recovery conflicts', async () => {
  for (const damage of ['content', 'head', 'branch']) {
    const { client, state, writes } = repository();
    const edit = await intent(client), preview = await client.validateStartupEdit(edit);
    const proposal = await client.proposeStartupEdit(edit, preview.revision, preview.validationToken);
    if (damage === 'content') state.commits.get(proposal.headRevision).documents[sourceFile].startups[1].description = 'Unrelated change';
    if (damage === 'head') state.prs[0].head.sha = 'e'.repeat(40);
    if (damage === 'branch') state.refs.delete(proposal.branch);
    const count = writes();
    await assert.rejects(client.getStartupEditProposal(edit), { code: damage === 'branch' ? 'WRITE_UNCERTAIN' : 'BRANCH_CONFLICT' });
    assert.equal(writes(), count);
  }
});

test('closed and merged matching proposals report their state without implying publication', async () => {
  const { client, state, writes } = repository();
  const edit = await intent(client), preview = await client.validateStartupEdit(edit);
  await client.proposeStartupEdit(edit, preview.revision, preview.validationToken);
  const count = writes();
  state.prs[0].state = 'closed';
  assert.equal((await client.getStartupEditProposal(edit)).status, 'closed');
  state.prs[0].merged_at = '2026-01-02T00:00:00Z';
  const merged = await client.getStartupEditProposal(edit);
  assert.equal(merged.status, 'merged');
  assert.equal(merged.published, false);
  assert.equal(writes(), count);
});

test('legacy startup proposals also enforce limits on the complete merged record', async () => {
  const { client, state, writes } = repository();
  state.commits.get(base).documents[sourceFile].startups[0].profile_facts = Array.from({ length: 100 }, (_, index) => ({
    key: `fact-${index}`, label: 'Fact', value: 'Existing evidence', source: 'https://example.com/facts', reviewed_at: '2026-01-01',
  }));
  const record = { name: 'Example', source: 'https://example.com/about', reviewed_at: '2026-01-01', profile_facts: [{
    key: 'one-more', label: 'Another fact', value: 'Extra evidence', source: 'https://example.com/facts', reviewed_at: '2026-01-01',
  }] };
  await assert.rejects(client.validateStartup(record), { code: 'VALIDATION_ERROR' });
  await assert.rejects(client.proposeStartup(record, base), { code: 'VALIDATION_ERROR' });
  assert.equal(writes(), 0);
});

test('new tool schemas retain OAuth boundaries and return actionable validation details', async () => {
  const env = environment(), store = new OAuthStore(env.DB), { version } = await store.beginAuth('owner');
  await store.save('owner', await seal({ accessToken: tokenResponse.access_token, refreshToken: tokenResponse.refresh_token,
    expiresAt: Date.now() + 3600000, refreshExpiresAt: Date.now() + 7200000, githubUserId: OWNER_ID, installationId: 42 }, env, 'connection:owner'), version);
  const fixture = repository(), worker = createWorker({ fetcher: fixture.client.fetcher });
  const call = async (name, args) => {
    const request = new Request('https://atlas.example.com/mcp', { method: 'POST', headers: { 'oai-authenticated-user-id': 'owner', 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }) });
    return (await (await worker.fetch(request, env)).json()).result;
  };
  for (const name of ['atlas_get_startup_record', 'atlas_validate_startup_edit', 'atlas_get_startup_edit_proposal'])
    assert.equal(tools.find(tool => tool.name === name).annotations.readOnlyHint, true);
  assert.equal(tools.find(tool => tool.name === 'atlas_propose_startup_edit').annotations.readOnlyHint, false);
  const read = await call('atlas_get_startup_record', { id });
  const edit = { id, expectedRecordRevision: read.structuredContent.recordRevision, patch: { reviewed_at: '2026-01-01', socials: [social] } };
  const preview = await call('atlas_validate_startup_edit', { edit });
  assert.deepEqual(preview.structuredContent.merged.socials, [social]);
  const invalid = await call('atlas_validate_startup_edit', { edit: { ...edit, patch: { ...edit.patch, unknown: 'unsupported' } } });
  assert.equal(invalid.isError, true);
  const error = JSON.parse(invalid.content[0].text);
  assert.equal(error.code, 'VALIDATION_ERROR');
  assert.ok(error.details.path);
  assert.ok(error.details.action);
  assert.doesNotMatch(JSON.stringify(invalid), /ghu_test_not_real|ghr_test_not_real/);
  const proposed = await call('atlas_propose_startup_edit', { edit, expectedRevision: preview.structuredContent.revision, validationToken: preview.structuredContent.validationToken });
  assert.equal(proposed.structuredContent.status, 'proposed');
  assert.equal(proposed.structuredContent.recordRevision, preview.structuredContent.nextRecordRevision);
  assert.equal(proposed.structuredContent.published, false);
  const disconnected = createWorker({ fetcher: () => { throw new Error('No repository request expected'); } });
  const request = new Request('https://atlas.example.com/mcp', { method: 'POST', headers: { 'oai-authenticated-user-id': 'owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'atlas_get_startup_record', arguments: { id } } }) });
  const rejected = (await (await disconnected.fetch(request, environment())).json()).result;
  assert.equal(JSON.parse(rejected.content[0].text).code, 'CONNECT_GITHUB');
});
