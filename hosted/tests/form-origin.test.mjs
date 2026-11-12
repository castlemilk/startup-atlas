import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorker } from '../src/worker.mjs';
import { seal } from '../src/common.mjs';
import { OAuthStore } from '../src/storage.mjs';
import { environment } from './helpers.mjs';

const get = (env, path) => new Request(`${env.PUBLIC_ORIGIN}${path}`, { headers: { 'oai-authenticated-user-id': 'owner' } });
const post = (env, path, origin = env.PUBLIC_ORIGIN) => new Request(`${env.PUBLIC_ORIGIN}${path}`, {
  method: 'POST',
  headers: {
    'oai-authenticated-user-id': 'owner',
    ...(origin === null ? {} : { Origin: origin }),
    'Content-Type': 'application/x-www-form-urlencoded',
    // Neither same-origin metadata nor Referer may replace the Origin check.
    'Sec-Fetch-Site': 'same-origin', 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-Dest': 'document',
    Referer: `${env.PUBLIC_ORIGIN}/`,
  },
  body: path === '/setup' ? new URLSearchParams({ action: 'save-existing-secret', client_secret: 'synthetic-form-regression-not-real' }) : undefined,
});

test('every HTML form preserves same-origin navigation POST Origin without external referrers', async () => {
  const env = environment(), worker = createWorker();
  delete env.GITHUB_CLIENT_SECRET;
  const assertForm = async (path, action) => {
    const response = await worker.fetch(get(env, path), env);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Referrer-Policy'), 'same-origin');
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.match(response.headers.get('Content-Security-Policy'), /form-action 'self'/);
    assert.ok((await response.text()).includes(`method="post" action="${action}"`));
  };
  await assertForm('/setup', '/setup');
  assert.equal((await worker.fetch(post(env, '/setup'), env)).status, 303);
  await assertForm('/?setup=saved', '/auth/github/start');
  const store = new OAuthStore(env.DB);
  const { version } = await store.beginAuth('owner');
  await store.save('owner', await seal({ expiresAt: Date.now() + 60000, refreshExpiresAt: Date.now() + 120000 }, env, 'connection:owner'), version);
  await assertForm('/', '/auth/github/disconnect');
});

test('all browser mutations reject missing, null and foreign Origin even with same-origin metadata', async () => {
  const env = environment(); let calls = 0;
  delete env.GITHUB_CLIENT_SECRET;
  const worker = createWorker({ fetcher: () => { calls++; throw new Error('No upstream expected'); } });
  for (const path of ['/setup', '/auth/github/start', '/auth/github/disconnect']) {
    for (const origin of [null, 'null', 'https://evil.example.com', `${env.PUBLIC_ORIGIN}.evil.example.com`, `${env.PUBLIC_ORIGIN}/`]) {
      const response = await worker.fetch(post(env, path, origin), env);
      assert.equal(response.status, 403, `${path}: ${origin}`);
      assert.equal((await response.json()).code, 'FORBIDDEN_ORIGIN');
      assert.equal(response.headers.get('Referrer-Policy'), 'no-referrer');
    }
  }
  assert.equal(calls, 0);
  for (const table of ['github_client_configs', 'oauth_states', 'oauth_connections']) {
    assert.equal(env.DB.sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get().n, 0);
  }
});

test('exact-origin form POSTs succeed while redirects and JSON retain no-referrer', async () => {
  const env = environment(), worker = createWorker();
  delete env.GITHUB_CLIENT_SECRET;
  for (const path of ['/setup', '/auth/github/start']) {
    const response = await worker.fetch(post(env, path), env);
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('Referrer-Policy'), 'no-referrer');
  }
  const disconnected = await worker.fetch(post(env, '/auth/github/disconnect'), env);
  assert.equal(disconnected.status, 200);
  assert.equal(disconnected.headers.get('Referrer-Policy'), 'same-origin');
  assert.match(await disconnected.text(), /GitHub disconnected/);
});
