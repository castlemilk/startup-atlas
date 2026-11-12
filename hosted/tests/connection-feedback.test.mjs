import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorker } from '../src/worker.mjs';
import { GitHubOAuth } from '../src/oauth.mjs';
import { OAuthStore } from '../src/storage.mjs';
import { OWNER_ID, REPOSITORY_ID, seal } from '../src/common.mjs';
import { environment, oauthProvider, tokenResponse } from './helpers.mjs';

const request = (env, path = '/', user = 'owner', init = {}) => new Request(`${env.PUBLIC_ORIGIN}${path}`, {
  ...init, headers: { 'oai-authenticated-user-id': user, ...init.headers },
});
const seed = async (env, user = 'owner', fields = {}) => {
  const store = new OAuthStore(env.DB);
  const { version } = await store.beginAuth(user);
  await store.save(user, await seal({
    accessToken: tokenResponse.access_token, refreshToken: tokenResponse.refresh_token,
    expiresAt: Date.now() + 60000, refreshExpiresAt: Date.now() + 120000,
    githubUserId: OWNER_ID, installationId: 42, ...fields,
  }, env, `connection:${user}`), version);
};
const assertConnected = html => {
  assert.match(html, /role="status"/);
  assert.match(html, /<h2 id="connection-title">GitHub connected<\/h2>/);
  assert.match(html, /href="https:\/\/github.com\/castlemilk"><strong>@castlemilk<\/strong>/);
  assert.match(html, /href="https:\/\/github.com\/castlemilk\/startup-atlas"/);
  assert.match(html, /href="https:\/\/castlemilk.github.io\/startup-atlas\/">Open Startup Atlas/);
  assert.match(html, /href="https:\/\/github.com\/castlemilk\/startup-atlas\/pulls"/);
  assert.match(html, /Return to your chat/);
  assert.match(html, /If needed, select the Startup Atlas plugin/);
  assert.match(html, /Search Startup Atlas for Australian founder programmes/);
  assert.match(html, /official source: \[paste URL\]/);
  assert.match(html, /draft pull request for review/);
  assert.match(html, /does not merge or publish changes/);
  assert.match(html, /<form method="post" action="\/auth\/github\/disconnect">/);
  assert.doesNotMatch(html, /action="\/auth\/github\/start"|<script|<input/);
  for (const hidden of [String(OWNER_ID), String(REPOSITORY_ID), tokenResponse.access_token, tokenResponse.refresh_token, 'expiresAt', 'test-client-secret-not-real']) {
    assert.ok(!html.includes(hidden), `Page must not expose ${hidden}`);
  }
};

test('verified OAuth callback leads to a visible success panel which survives reload without query parameters', async () => {
  const env = environment(), provider = oauthProvider(), worker = createWorker(provider);
  const started = await worker.fetch(request(env, '/auth/github/start', 'owner', { method: 'POST', headers: { Origin: env.PUBLIC_ORIGIN } }), env);
  const authorize = new URL(started.headers.get('Location'));
  const cookie = started.headers.get('Set-Cookie').split(';')[0];
  const callbackPath = `/auth/github/callback?${new URLSearchParams({ state: authorize.searchParams.get('state'), code: 'synthetic-code' })}`;
  const callback = await worker.fetch(request(env, callbackPath, 'owner', { headers: { Cookie: cookie } }), env);
  assert.equal(callback.status, 303);
  assert.equal(callback.headers.get('Location'), `${env.PUBLIC_ORIGIN}/?connection=connected`);
  const requestsBeforePage = provider.calls.length;
  for (const path of ['/?connection=connected', '/', '/', '/?connection=cancelled']) {
    const response = await worker.fetch(request(env, path), env);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.equal(response.headers.get('Content-Security-Policy'), "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
    assertConnected(await response.text());
  }
  assert.equal(provider.calls.length, requestsBeforePage, 'Rendering must not recheck GitHub, renew tokens, or write repository data');
  const status = await new GitHubOAuth(env).status('owner');
  assert.equal(status.connected, true);
  assert.equal(status.githubLogin, 'castlemilk');
  assert.equal(typeof status.expiresAt, 'string', 'Existing status fields remain compatible');
});

test('query parameters cannot claim success without a saved connection for this Site user', async () => {
  const env = environment(), worker = createWorker({ fetcher: () => { throw new Error('No network expected'); } });
  for (const path of ['/', '/?connection=connected', '/?connection=cancelled', '/?connection=connected&githubLogin=castlemilk']) {
    const response = await worker.fetch(request(env, path), env);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.doesNotMatch(html, /GitHub connected|Connection complete|Connected as|connection-title/);
    assert.match(html, /action="\/auth\/github\/start"/);
  }
  await seed(env);
  const other = await worker.fetch(request(env, '/?connection=connected', 'another-site-user'), env);
  assert.doesNotMatch(await other.text(), /GitHub connected|Connected as/);
});

test('expired, disconnected, and unconfigured connections cannot display the success panel', async () => {
  const env = environment(), provider = oauthProvider(), worker = createWorker(provider);
  await seed(env, 'owner', { refreshExpiresAt: Date.now() - 1000 });
  const expired = await worker.fetch(request(env, '/?connection=connected'), env);
  assert.doesNotMatch(await expired.text(), /GitHub connected|Connected as/);
  assert.equal((await new GitHubOAuth(env).status('owner')).githubLogin, undefined);
  await seed(env);
  const disconnected = await worker.fetch(request(env, '/auth/github/disconnect', 'owner', { method: 'POST', headers: { Origin: env.PUBLIC_ORIGIN } }), env);
  assert.equal(disconnected.status, 200);
  for (const path of ['/', '/?connection=connected']) {
    assert.doesNotMatch(await (await worker.fetch(request(env, path), env)).text(), /GitHub connected|Connected as/);
  }
  await seed(env);
  delete env.GITHUB_CLIENT_SECRET;
  const unconfigured = await worker.fetch(request(env, '/?connection=connected'), env);
  const html = await unconfigured.text();
  assert.match(html, /Finish private GitHub setup/);
  assert.doesNotMatch(html, /GitHub connected|Connected as/);
});

test('the public identity is derived only from the verified owner ID, not stored display text', async () => {
  const env = environment(), worker = createWorker({ fetcher: () => { throw new Error('No network expected'); } });
  for (const githubUserId of [undefined, OWNER_ID + 1, String(OWNER_ID)]) {
    await seed(env, 'owner', { githubUserId, githubLogin: 'castlemilk' });
    const status = await new GitHubOAuth(env).status('owner');
    assert.equal(status.connected, true, 'Legacy connection status remains compatible');
    assert.equal(status.githubLogin, undefined);
    const html = await (await worker.fetch(request(env), env)).text();
    assert.match(html, /Your GitHub connection is saved/);
    assert.doesNotMatch(html, /Connected as|account was verified|@castlemilk/);
  }
  await seed(env, 'owner', { githubLogin: '<script>untrusted</script>' });
  assertConnected(await (await worker.fetch(request(env), env)).text());
});
