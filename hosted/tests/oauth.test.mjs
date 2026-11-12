import test from 'node:test';
import assert from 'node:assert/strict';
import { GitHubOAuth } from '../src/oauth.mjs';
import { OAuthStore } from '../src/storage.mjs';
import { seal, unseal } from '../src/common.mjs';
import { environment, oauthProvider, tokenResponse } from './helpers.mjs';

async function begin(oauth) {
  const response = await oauth.start('owner');
  const authorization = new URL(response.headers.get('Location'));
  const cookie = response.headers.get('Set-Cookie').split(';')[0];
  const callback = new URL('https://atlas.example.com/auth/github/callback');
  callback.searchParams.set('state', authorization.searchParams.get('state'));
  callback.searchParams.set('code', 'synthetic-code');
  return { response, authorization, cookie, request: new Request(callback, { headers: { Cookie: cookie } }) };
}
test('OAuth uses GitHub App code flow, PKCE S256, exact callback and server-encrypted storage', async () => {
  const env = environment(), provider = oauthProvider();
  const oauth = new GitHubOAuth(env, provider);
  const start = await begin(oauth);
  assert.equal(start.authorization.origin, 'https://github.com');
  assert.equal(start.authorization.searchParams.get('scope'), 'offline_access');
  assert.equal(start.authorization.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(start.authorization.searchParams.get('code_challenge').length, 43);
  assert.equal(start.authorization.searchParams.get('redirect_uri'), 'https://atlas.example.com/auth/github/callback');
  assert.match(start.response.headers.get('Set-Cookie'), /HttpOnly; Secure; SameSite=Lax/);
  assert.ok(!start.authorization.href.includes(env.GITHUB_CLIENT_SECRET));
  const callback = await oauth.callback(start.request, 'owner');
  assert.equal(callback.status, 303);
  assert.equal(callback.headers.get('Location'), 'https://atlas.example.com/?connection=connected');
  const exchange = new URLSearchParams(provider.calls[0].init.body);
  assert.equal(exchange.get('repository_id'), '1453828311');
  assert.equal(exchange.get('code_verifier').length, 43);
  const saved = await oauth.store.get('owner');
  assert.ok(!saved.payload.includes(tokenResponse.access_token));
  assert.ok(!saved.payload.includes(tokenResponse.refresh_token));
  assert.equal(await oauth.access('owner'), tokenResponse.access_token);
  assert.equal((await oauth.status('owner')).connected, true);
  await assert.rejects(oauth.callback(start.request, 'owner'), { code: 'INVALID_STATE' });
  await assert.rejects(unseal(saved.payload, env, 'connection:other-user'), { code: 'CONNECT_GITHUB' });
});

test('OAuth state rejects cross-user, missing browser cookie, expired and cancelled flows', async () => {
  let now = Date.now();
  const env = environment(), provider = oauthProvider();
  const oauth = new GitHubOAuth(env, { ...provider, clock: () => now });
  const start = await begin(oauth);
  await assert.rejects(oauth.callback(start.request, 'intruder'), { code: 'INVALID_STATE' });
  await assert.rejects(oauth.callback(new Request(start.request.url), 'owner'), { code: 'INVALID_STATE' });
  assert.equal(provider.calls.length, 0);
  const expired = await begin(oauth); now += 601000;
  await assert.rejects(oauth.callback(expired.request, 'owner'), { code: 'INVALID_STATE' });
  const cancelled = await begin(oauth);
  const url = new URL(cancelled.request.url); url.searchParams.set('error', 'access_denied');
  const response = await oauth.callback(new Request(url, { headers: { Cookie: cancelled.cookie } }), 'owner');
  assert.match(response.headers.get('Location'), /cancelled$/);
  assert.equal(provider.calls.length, 0);
});

test('wrong GitHub owner, broad app permissions and multiple selected repositories fail closed', async () => {
  const cases = [
    [url => url.endsWith('/user'), { id: 999 }, 'WRONG_ACCOUNT'],
    [url => url.includes('/user/installations?'), { installations: [{ id: 42, account: { id: 7474316 }, repository_selection: 'all', permissions: { contents: 'write', pull_requests: 'write' } }] }, 'INSTALLATION_SCOPE'],
    [url => url.includes('/user/installations?'), { installations: [{ id: 42, account: { id: 7474316 }, repository_selection: 'selected', permissions: { contents: 'write', pull_requests: 'write', administration: 'write' } }] }, 'INSTALLATION_SCOPE'],
    [url => url.includes('/repositories?'), { total_count: 2, repositories: [] }, 'INSTALLATION_SCOPE'],
  ];
  for (const [matches, body, code] of cases) {
    const provider = oauthProvider();
    const oauth = new GitHubOAuth(environment(), { fetcher: (url, init) => matches(url) ? Promise.resolve(Response.json(body)) : provider.fetcher(url, init) });
    const start = await begin(oauth);
    await assert.rejects(oauth.callback(start.request, 'owner'), { code });
    assert.equal((await oauth.store.get('owner')).payload, null);
  }
});

test('refresh is single-owner, rotates encrypted tokens and never replays an uncertain refresh', async () => {
  const env = environment(), store = new OAuthStore(env.DB);
  const now = Date.now();
  const tokens = { accessToken: 'old', refreshToken: 'refresh-old', expiresAt: now - 1, refreshExpiresAt: now + 100000 };
  await store.save('owner', await seal(tokens, env, 'connection:owner'), (await store.beginAuth('owner')).version);
  let release;
  let calls = 0;
  const oauth = new GitHubOAuth(env, { store, fetcher: async () => { calls++; await new Promise(resolve => { release = resolve; }); return Response.json(tokenResponse); } });
  const first = oauth.access('owner');
  while (!release) await new Promise(resolve => setTimeout(resolve, 1));
  await assert.rejects(oauth.access('owner'), { code: 'REFRESH_BUSY' });
  release(); assert.equal(await first, tokenResponse.access_token); assert.equal(calls, 1);
  assert.equal((await store.get('owner')).version, 3);
  await store.save('owner', await seal(tokens, env, 'connection:owner'), (await store.beginAuth('owner')).version);
  const unavailable = new GitHubOAuth(env, { store, fetcher: async () => { throw new Error('lost response'); } });
  await assert.rejects(unavailable.access('owner'), { code: 'CONNECT_GITHUB' });
  assert.equal((await store.get('owner')).payload, null);
});

test('disconnect removes local access and attempts token-specific provider revocation', async () => {
  const env = environment(), provider = oauthProvider(), oauth = new GitHubOAuth(env, provider);
  const start = await begin(oauth); await oauth.callback(start.request, 'owner');
  assert.deepEqual(await oauth.disconnect('owner'), { disconnected: true, revoked: true });
  assert.equal((await oauth.store.get('owner')).payload, null);
  assert.equal(provider.calls.at(-1).init.method, 'DELETE');
  assert.ok(provider.calls.at(-1).url.endsWith('/token'));
});

test('disconnect invalidates an in-flight callback and never revives the connection', async () => {
  const env = environment(), provider = oauthProvider(), oauth = new GitHubOAuth(env, provider);
  const start = await begin(oauth);
  const verify = oauth.verify.bind(oauth);
  oauth.verify = async token => { const result = await verify(token); await oauth.disconnect('owner'); return result; };
  await assert.rejects(oauth.callback(start.request, 'owner'), { code: 'INVALID_STATE' });
  assert.equal((await oauth.status('owner')).connected, false);
  assert.equal((await oauth.store.get('owner')).payload, null);
  assert.ok(provider.calls.some(call => call.url.endsWith('/token') && call.init.method === 'DELETE'));
});

test('abandoned refresh lease requires reauthorization without reusing its refresh token', async () => {
  const env = environment(), store = new OAuthStore(env.DB);
  const now = Date.now();
  await store.save('owner', await seal({ accessToken: 'old', refreshToken: 'old-refresh', expiresAt: now - 1, refreshExpiresAt: now + 999999 }, env, 'connection:owner'), (await store.beginAuth('owner')).version);
  const row = await store.get('owner');
  assert.equal(await store.claim('owner', row.version, 'crashed-worker', now - 120000), true);
  let calls = 0;
  const oauth = new GitHubOAuth(env, { store, fetcher: () => { calls++; throw new Error('must not exchange'); } });
  await assert.rejects(oauth.access('owner'), { code: 'CONNECT_GITHUB' });
  assert.equal(calls, 0);
  assert.equal((await store.get('owner')).payload, null);
});

test('disconnect and reconnect cannot be erased by a stale refresh failure (no version ABA)', async () => {
  const env = environment(), store = new OAuthStore(env.DB), now = Date.now();
  const initial = { accessToken: 'old', refreshToken: 'old-refresh', expiresAt: now - 1, refreshExpiresAt: now + 999999 };
  await store.save('owner', await seal(initial, env, 'connection:owner'), (await store.beginAuth('owner')).version);
  let fail;
  const oauth = new GitHubOAuth(env, { store, fetcher: async () => new Promise((_, reject) => { fail = reject; }) });
  const pending = oauth.access('owner');
  while (!fail) await new Promise(resolve => setTimeout(resolve, 1));
  await store.disconnect('owner');
  const next = { ...initial, accessToken: 'new-connection', expiresAt: now + 900000 };
  await store.save('owner', await seal(next, env, 'connection:owner'), (await store.beginAuth('owner')).version);
  fail(new Error('lost old response'));
  await assert.rejects(pending, { code: 'CONNECT_GITHUB' });
  assert.equal(await oauth.access('owner'), 'new-connection');
});

test('an uncertain refresh plus failed invalidation never releases the old refresh token for replay', async () => {
  const env = environment(), store = new OAuthStore(env.DB), now = Date.now();
  await store.save('owner', await seal({ accessToken: 'old', refreshToken: 'old-refresh', expiresAt: now - 1, refreshExpiresAt: now + 999999 }, env, 'connection:owner'), (await store.beginAuth('owner')).version);
  const invalidate = store.invalidate.bind(store);
  store.invalidate = async () => { throw new Error('temporary database failure'); };
  let calls = 0;
  const oauth = new GitHubOAuth(env, { store, fetcher: async () => { calls++; throw new Error('uncertain exchange'); } });
  await assert.rejects(oauth.access('owner'), /temporary database failure/);
  assert.ok((await store.get('owner')).lock_owner);
  store.invalidate = invalidate;
  await assert.rejects(oauth.access('owner'), { code: 'REFRESH_BUSY' });
  assert.equal(calls, 1);
});

test('a provider 404 during disconnect does not claim confirmed revocation', async () => {
  const env = environment(), provider = oauthProvider();
  const oauth = new GitHubOAuth(env, { fetcher: (url, init) => init.method === 'DELETE' ? Promise.resolve(new Response(null, { status: 404 })) : provider.fetcher(url, init) });
  const start = await begin(oauth); await oauth.callback(start.request, 'owner');
  assert.deepEqual(await oauth.disconnect('owner'), { disconnected: true, revoked: false });
  assert.equal((await oauth.status('owner')).connected, false);
});


test('disconnect without a stored token cannot claim confirmed provider revocation', async () => {
  const oauth = new GitHubOAuth(environment(), oauthProvider());
  assert.deepEqual(await oauth.disconnect('owner'), { disconnected: true, revoked: false });
});

test('token exchange failure logs only safe classification and never retries', async t => {
  const rows=[];
  t.mock.method(console,'error',value=>rows.push(value));
  let calls=0;
  const oauth=new GitHubOAuth(environment(),{fetcher:async ()=>{calls++; const error=new Error('private-canary'); error.name='TimeoutError'; throw error;}});
  await assert.rejects(oauth.tokenRequest({code:'one-use-code-canary'}),{code:'CONNECT_GITHUB'});
  assert.equal(calls,1);
  assert.deepEqual(rows.map(JSON.parse),[{event:'github_token_exchange_unconfirmed',kind:'timeout'}]);
  assert.ok(!JSON.stringify(rows).includes('canary'));
});
