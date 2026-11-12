import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorker } from '../src/worker.mjs';
import { environment } from './helpers.mjs';
const call = (method, params) => new Request('https://atlas.example.com/mcp', { method: 'POST', headers: { 'oai-authenticated-user-id': 'owner', 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });

test('hosted MCP fails closed without identity or secure configuration', async () => {
  const worker = createWorker();
  assert.equal((await worker.fetch(new Request('https://atlas.example.com/'), environment())).status, 401);
  assert.equal((await worker.fetch(call('tools/list'), {})).status, 503);
  const result = await worker.fetch(new Request('https://evil.example.com/', { headers: { 'oai-authenticated-user-id': 'owner' } }), environment());
  assert.equal(result.status, 403);
});
test('discovery and connection tools run without exposing or creating GitHub credentials', async () => {
  const worker = createWorker({ fetcher: () => { throw new Error('No network expected'); } }), env = environment();
  const discovery = await (await worker.fetch(call('server/discover'), env)).json();
  assert.ok(discovery.result.supportedVersions.includes('2026-07-28'));
  const list = await (await worker.fetch(call('tools/list'), env)).json();
  assert.equal(list.result.tools.length, 7);
  assert.ok(list.result.tools.some(x => x.name === 'atlas_search_partners' && x.annotations.readOnlyHint));
  assert.ok(list.result.tools.some(x => x.name === 'atlas_get_partner' && x.annotations.readOnlyHint));
  const connection = await (await worker.fetch(call('tools/call', { name: 'atlas_get_connection', arguments: {} }), env)).json();
  assert.equal(connection.result.structuredContent.connected, false);
  const search = await (await worker.fetch(call('tools/call', { name: 'atlas_search_opportunities', arguments: {} }), env)).json();
  assert.equal(search.result.isError, true);
  assert.match(search.result.content[0].text, /CONNECT_GITHUB/);
});
test('OAuth initiation requires a same-origin explicit POST and callback redirects remain fixed', async () => {
  const worker = createWorker(), env = environment();
  for (const request of [
    new Request('https://atlas.example.com/auth/github/start', { headers: { 'oai-authenticated-user-id': 'owner' } }),
    new Request('https://atlas.example.com/auth/github/start', { method: 'POST', headers: { 'oai-authenticated-user-id': 'owner', Origin: 'https://evil.example.com' } }),
  ]) assert.equal((await worker.fetch(request, env)).status, 403);
  const result = await worker.fetch(new Request('https://atlas.example.com/auth/github/start', { method: 'POST', headers: { 'oai-authenticated-user-id': 'owner', Origin: env.PUBLIC_ORIGIN } }), env);
  assert.equal(result.status, 303);
  const url = new URL(result.headers.get('Location'));
  assert.equal(url.origin, 'https://github.com');
  assert.equal(url.searchParams.get('redirect_uri'), `${env.PUBLIC_ORIGIN}/auth/github/callback`);
});
test('MCP rejects cross-origin, malformed JSON and unknown tools without secrets in errors', async () => {
  const worker = createWorker(), env = environment();
  const foreign = call('tools/list'); foreign.headers.set('Origin', 'https://evil.example.com');
  assert.equal((await worker.fetch(foreign, env)).status, 403);
  const malformed = new Request('https://atlas.example.com/mcp', { method: 'POST', headers: { 'oai-authenticated-user-id': 'owner', 'Content-Type': 'application/json' }, body: '{broken' });
  assert.equal((await worker.fetch(malformed, env)).status, 400);
  const unknown = await (await worker.fetch(call('tools/call', { name: 'not-a-tool' }), env)).text();
  assert.match(unknown, /UNKNOWN_TOOL/); assert.ok(!unknown.includes(env.GITHUB_CLIENT_SECRET));
});

test('OAuth callback errors stay sanitized HTTP responses and MCP negotiation is consistent', async () => {
  const worker = createWorker(), env = environment();
  const callback = new Request('https://atlas.example.com/auth/github/callback?state=invalid', { headers: { 'oai-authenticated-user-id': 'owner' } });
  const response = await worker.fetch(callback, env);
  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, 'INVALID_STATE');
  const initialized = await (await worker.fetch(call('initialize', { protocolVersion: '2026-07-28' }), env)).json();
  assert.equal(initialized.result.protocolVersion, '2026-07-28');
  const get = new Request('https://atlas.example.com/mcp', { headers: { 'oai-authenticated-user-id': 'owner' } });
  assert.equal((await worker.fetch(get, env)).status, 405);
  const notification = new Request('https://atlas.example.com/mcp', { method: 'POST', headers: { 'oai-authenticated-user-id': 'owner', 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/cancelled' }) });
  assert.equal((await worker.fetch(notification, env)).status, 202);
});
