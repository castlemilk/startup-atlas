import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorker } from '../src/worker.mjs';
import { seal } from '../src/common.mjs';
import { OAuthStore } from '../src/storage.mjs';
import { environment } from './helpers.mjs';

const githubAuthorize = 'https://github.com/login/oauth/authorize';
const basePolicy = "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'";
const connectPolicy = basePolicy.replace("form-action 'self'", `form-action 'self' ${githubAuthorize}`);
const request = (env, path, method = 'GET', body) => new Request(`${env.PUBLIC_ORIGIN}${path}`, {
  method,
  headers: { 'oai-authenticated-user-id': 'owner', ...(method === 'POST' ? { Origin: env.PUBLIC_ORIGIN, 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
  ...(body ? { body } : {}),
});
const assertPage = async (worker, env, path, policy, method = 'GET') => {
  const response = await worker.fetch(request(env, path, method), env);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Content-Security-Policy'), policy, path);
  assert.equal(response.headers.get('Referrer-Policy'), 'same-origin');
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  return response.text();
};

test('only configured, disconnected connection pages allow GitHub authorization redirects', async () => {
  for (const configuration of ['server', 'user']) {
    const env = environment(), worker = createWorker();
    if (configuration === 'user') {
      delete env.GITHUB_CLIENT_SECRET;
      const saved = await worker.fetch(request(env, '/setup', 'POST', new URLSearchParams({ action: 'save-existing-secret', client_secret: 'synthetic-csp-test-not-real' })), env);
      assert.equal(saved.status, 303);
    }
    for (const path of ['/', '/?setup=saved', '/?connection=cancelled']) {
      const html = await assertPage(worker, env, path, connectPolicy);
      assert.match(html, /<form method="post" action="\/auth\/github\/start">/);
      assert.doesNotMatch(html, /<input|<script/);
    }
    // A saved credential is never re-displayed, and setup retains self-only CSP.
    await assertPage(worker, env, '/setup', basePolicy);
  }
});

test('setup, unconfigured, connected and disconnected confirmation pages stay self-only', async () => {
  const env = environment(), worker = createWorker({ fetcher: () => { throw new Error('No network expected'); } });
  delete env.GITHUB_CLIENT_SECRET;
  await assertPage(worker, env, '/', basePolicy);
  const setup = await assertPage(worker, env, '/setup', basePolicy);
  assert.match(setup, /<form method="post" action="\/setup"/);
  env.GITHUB_CLIENT_SECRET = 'synthetic-csp-test-not-real';
  const store = new OAuthStore(env.DB);
  const { version } = await store.beginAuth('owner');
  await store.save('owner', await seal({ expiresAt: Date.now() + 60000, refreshExpiresAt: Date.now() + 120000 }, env, 'connection:owner'), version);
  const connected = await assertPage(worker, env, '/', basePolicy);
  assert.match(connected, /<form method="post" action="\/auth\/github\/disconnect">/);
  // Provider traffic is mocked; no live revocation is performed.
  await assertPage(worker, env, '/auth/github/disconnect', basePolicy, 'POST');
});

test('the CSP exception matches only the hardcoded provider endpoint and never changes POST initiation', async () => {
  const env = environment(), worker = createWorker({ fetcher: () => { throw new Error('No network expected'); } });
  const html = await worker.fetch(request(env, '/'), env);
  const formAction = html.headers.get('Content-Security-Policy').split('; ').find(value => value.startsWith('form-action '));
  assert.equal(formAction, `form-action 'self' ${githubAuthorize}`);
  assert.equal((await worker.fetch(request(env, '/auth/github/start'), env)).status, 403);
  const started = await worker.fetch(request(env, '/auth/github/start?redirect_uri=https://evil.example.com/&provider=https://evil.example.com/', 'POST'), env);
  assert.equal(started.status, 303);
  assert.equal(started.headers.get('Referrer-Policy'), 'no-referrer');
  const target = new URL(started.headers.get('Location'));
  assert.equal(`${target.origin}${target.pathname}`, githubAuthorize);
  assert.equal(target.searchParams.get('redirect_uri'), `${env.PUBLIC_ORIGIN}/auth/github/callback`);
  assert.equal(target.searchParams.get('code_challenge_method'), 'S256');
  assert.match(target.searchParams.get('state'), /^[A-Za-z0-9_-]{43}$/);
  assert.match(started.headers.get('Set-Cookie'), /; HttpOnly; Secure; SameSite=Lax; Max-Age=600$/);
});
