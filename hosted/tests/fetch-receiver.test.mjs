import test from 'node:test';
import assert from 'node:assert/strict';
import { GitHubOAuth } from '../src/oauth.mjs';
import { GitHubCatalogue } from '../src/github.mjs';
import { createWorker } from '../src/worker.mjs';
import { environment, oauthProvider, tokenResponse } from './helpers.mjs';

// Workerd's native fetch requires its global receiver, unlike permissive Node fetch
// or ordinary injected functions. Exercise defaults without injecting a fetcher.
function requireGlobalFetch(t, provider) {
  return t.mock.method(globalThis, 'fetch', function (url, init) {
    if (this !== globalThis) throw new TypeError('Illegal invocation');
    assert.equal(init.redirect, 'manual');
    return provider(url, init);
  });
}

test('default OAuth fetch preserves the global receiver for exchange, verification and revocation', async t => {
  const provider = oauthProvider();
  const fetch = requireGlobalFetch(t, provider.fetcher);
  const oauth = new GitHubOAuth(environment());
  assert.equal((await oauth.tokenRequest({ code: 'synthetic-code' })).accessToken, tokenResponse.access_token);
  assert.equal((await oauth.api('/user', 'synthetic-token')).id, 7474316);
  assert.equal(await oauth.revokeToken('synthetic-token'), true);
  assert.equal(fetch.mock.callCount(), 3);
});

test('default repository fetch preserves the global receiver', async t => {
  const fetch = requireGlobalFetch(t, async () => Response.json({ object: { sha: 'a'.repeat(40) } }));
  const catalogue = new GitHubCatalogue('synthetic-token');
  assert.equal((await catalogue.api('/git/ref/heads/main')).object.sha, 'a'.repeat(40));
  assert.equal(fetch.mock.callCount(), 1);
});

test('default Worker fetch stays globally bound when forwarded to OAuth and repository clients', async t => {
  const provider = oauthProvider(), env = environment(), revision = 'a'.repeat(40);
  requireGlobalFetch(t, async (url, init) => {
    if (url.includes('/repos/')) {
      if (url.endsWith('/git/ref/heads/main')) return Response.json({ object: { sha: revision } });
      const data = url.includes('partner-leads.json') ? ['Synthetic Partner'] : {};
      return Response.json({ type: 'file', encoding: 'base64', size: 100, content: btoa(JSON.stringify(data)) });
    }
    return provider.fetcher(url, init);
  });
  const worker = createWorker();
  const request = (path, init = {}) => new Request(`${env.PUBLIC_ORIGIN}${path}`, { ...init, headers: { 'oai-authenticated-user-id': 'owner', ...init.headers } });
  const start = await worker.fetch(request('/auth/github/start', { method: 'POST', headers: { Origin: env.PUBLIC_ORIGIN } }), env);
  assert.equal(start.status, 303);
  const authorization = new URL(start.headers.get('Location'));
  const callback = await worker.fetch(request(`/auth/github/callback?${new URLSearchParams({ state: authorization.searchParams.get('state'), code: 'synthetic-code' })}`, { headers: { Cookie: start.headers.get('Set-Cookie').split(';')[0] } }), env);
  assert.equal(callback.status, 303);
  const search = await (await worker.fetch(request('/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'atlas_search_partners', arguments: {} } }) }), env)).json();
  assert.equal(search.result.structuredContent.revision, revision);
  assert.deepEqual(search.result.structuredContent.partners, [{ name: 'Synthetic Partner', record: null }]);
});
