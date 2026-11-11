import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, cp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const repo = fileURLToPath(new URL('../../', import.meta.url));
const entry = {
  id: 'protocol-test', name: 'Protocol Test', org: 'Example Foundation', kind: 'Founder programmes', access: 'Direct',
  scope: ['UNKNOWN'], value: 'Not a real offer', summary: 'Fixture only.', eligibility: 'Fixture only.', limits: 'Fixture only.',
  url: 'https://example.com/protocol', status: 'Check intake', checked: '2026-01-01', extra: [], facts: {},
};
const provenance = { sourceUrls: [entry.url], reviewedOn: entry.checked, evidence: 'Protocol fixture only, never a real opportunity.' };
async function connect(t, write) {
  const dir = await mkdtemp(path.join(tmpdir(), 'atlas-protocol-'));
  await cp(path.join(repo, 'data'), path.join(dir, 'data'), { recursive: true });
  await mkdir(path.join(dir, 'scripts'));
  await cp(path.join(repo, 'scripts/make-data.py'), path.join(dir, 'scripts/make-data.py'));
  const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(repo, 'mcp/server.mjs'), '--repo', dir, ...(write ? ['--write'] : [])], stderr: 'pipe' });
  let stderr = ''; transport.stderr?.on('data', chunk => { stderr += chunk; });
  const client = new Client({ name: 'atlas-test-client', version: '1.0.0' });
  t.after(async () => { await client.close(); await rm(dir, { recursive: true, force: true }); assert.equal(stderr, ''); });
  await client.connect(transport);
  return { client, dir };
}
const decoded = result => JSON.parse(result.content[0].text);

test('official MCP client discovers tools, reads, validates, adds and retries over real stdio', async t => {
  const { client, dir } = await connect(t, true);
  const { tools } = await client.listTools();
  assert.equal(tools.length, 5);
  assert.equal(tools.find(x => x.name === 'atlas_add_opportunity').annotations.readOnlyHint, false);
  assert.ok(tools.filter(x => x.name !== 'atlas_add_opportunity').every(x => x.annotations.readOnlyHint));
  const baseline = JSON.parse(await readFile(path.join(dir, 'data/opportunities-added.json'), 'utf8')).entries.length;
  const info = decoded(await client.callTool({ name: 'atlas_get_catalogue_info', arguments: {} }));
  assert.equal(info.writeEnabled, true);
  assert.ok(info.opportunities >= 92);
  const validation = decoded(await client.callTool({ name: 'atlas_validate_opportunity', arguments: { entry, provenance } }));
  assert.equal(validation.status, 'valid');
  const args = { entry, provenance, expectedRevision: validation.revision };
  const added = await client.callTool({ name: 'atlas_add_opportunity', arguments: args });
  assert.equal(added.isError, undefined);
  assert.equal(decoded(added).status, 'added');
  assert.equal(decoded(added).published, false);
  assert.equal(decoded(await client.callTool({ name: 'atlas_add_opportunity', arguments: args })).status, 'already_present');
  assert.deepEqual(decoded(await client.callTool({ name: 'atlas_get_opportunity', arguments: { id: entry.id } })).entry, entry);
  assert.equal(decoded(await client.callTool({ name: 'atlas_search_opportunities', arguments: { query: 'Protocol Test' } })).total, 1);
  assert.equal(JSON.parse(await readFile(path.join(dir, 'data/opportunities-added.json'), 'utf8')).entries.length, baseline + 1);
});

test('protocol rejects read-only mutations, unknown tools and malformed arguments without crashing', async t => {
  const { client } = await connect(t, false);
  const validation = decoded(await client.callTool({ name: 'atlas_validate_opportunity', arguments: { entry, provenance } }));
  const write = await client.callTool({ name: 'atlas_add_opportunity', arguments: { entry, provenance, expectedRevision: validation.revision } });
  assert.equal(write.isError, true); assert.equal(decoded(write).code, 'READ_ONLY');
  for (const request of [
    { name: 'unknown', arguments: {} },
    { name: 'atlas_get_catalogue_info', arguments: { unexpected: true } },
    { name: 'atlas_validate_opportunity', arguments: {} },
    { name: 'atlas_search_opportunities', arguments: { limit: 10000 } },
    { name: 'atlas_get_opportunity', arguments: { id: '../escape' } },
  ]) assert.equal((await client.callTool(request)).isError, true);
  assert.ok(decoded(await client.callTool({ name: 'atlas_get_catalogue_info', arguments: {} })).opportunities >= 92);
});
