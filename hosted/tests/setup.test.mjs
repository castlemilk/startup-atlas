import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorker, tools } from '../src/worker.mjs';
import { GitHubClientConfig, readSetupBody } from '../src/setup.mjs';
import { GitHubClientConfigStore, OAuthStore } from '../src/storage.mjs';
import { seal, unseal } from '../src/common.mjs';
import { environment, oauthProvider, tokenResponse, entry, provenance } from './helpers.mjs';

const secret = 'synthetic-github-client-secret-not-real';
const pending = () => { const env = environment(); delete env.GITHUB_CLIENT_SECRET; return env; };
const pageRequest = (path = '/setup', user = 'owner') => new Request(`https://atlas.example.com${path}`, { headers: user ? { 'oai-authenticated-user-id': user } : {} });
const post = (env, { body = new URLSearchParams({ action: 'save-existing-secret', client_secret: secret }).toString(), user = 'owner', origin = env.PUBLIC_ORIGIN, path = '/setup', headers = {} } = {}) => new Request(`${env.PUBLIC_ORIGIN}${path}`, {
  method: 'POST', headers: { ...(user ? { 'oai-authenticated-user-id': user } : {}), ...(origin ? { Origin: origin } : {}), 'Content-Type': 'application/x-www-form-urlencoded', ...headers }, body,
});
const rpc = (method, params, user = 'owner') => new Request('https://atlas.example.com/mcp', { method: 'POST', headers: { 'oai-authenticated-user-id': user, 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
const rows = env => env.DB.sqlite.prepare('SELECT * FROM github_client_configs').all();

test('missing client secret allows authenticated setup, discovery and read-only readiness but no repository operation', async () => {
  const env = pending(); let calls = 0;
  const worker = createWorker({ fetcher: () => { calls++; throw new Error('No upstream permitted'); } });
  assert.equal((await worker.fetch(pageRequest('/'), env)).status, 200);
  const html = await (await worker.fetch(pageRequest(), env)).text();
  assert.match(html, /type="password"/); assert.match(html, /autocomplete="new-password"/);
  assert.match(html, /method="post" action="\/setup"/); assert.match(html, /Do not paste it into chat/);
  assert.ok(!html.includes('value="' + secret));
  for (const method of ['server/discover', 'initialize', 'ping', 'tools/list']) {
    const reply = await (await worker.fetch(rpc(method), env)).json();
    assert.ok(reply.result, method);
  }
  assert.equal(tools.length, 7);
  assert.ok(!tools.some(tool => /secret|setup/i.test(tool.name)));
  const status = await (await worker.fetch(rpc('tools/call', { name: 'atlas_get_connection' }), env)).json();
  assert.deepEqual(status.result.structuredContent, { connected: false, repository: 'castlemilk/startup-atlas', setupRequired: true, connectUrl: env.PUBLIC_ORIGIN, setupUrl: `${env.PUBLIC_ORIGIN}/setup` });
  for (const name of ['atlas_search_opportunities', 'atlas_get_opportunity', 'atlas_validate_opportunity', 'atlas_add_opportunity']) {
    const args = name === 'atlas_add_opportunity' ? { entry, provenance, expectedRevision: 'a'.repeat(40) } : {};
    const result = await (await worker.fetch(rpc('tools/call', { name, arguments: args }), env)).json();
    assert.equal(result.result.isError, true); assert.match(result.result.content[0].text, /SETUP_REQUIRED/);
  }
  for (const path of ['/auth/github/start', '/auth/github/disconnect']) assert.equal((await worker.fetch(post(env, { path }), env)).status, 503);
  assert.equal((await worker.fetch(pageRequest('/auth/github/callback?state=invalid'), env)).status, 503);
  assert.equal(calls, 0); assert.equal(rows(env).length, 0);
  assert.equal(env.DB.sqlite.prepare('SELECT count(*) AS n FROM oauth_states').get().n, 0);
  assert.equal(env.DB.sqlite.prepare('SELECT count(*) AS n FROM oauth_connections').get().n, 0);
});

test('setup requires Sites identity and exact same-origin POST before accepting a body', async () => {
  const env = pending(), worker = createWorker();
  for (const request of [pageRequest('/setup', null), post(env, { user: null }), new Request(`${env.PUBLIC_ORIGIN}/setup`, { headers: { 'OAI-Sites-Authorization': 'Bearer synthetic-not-a-user' } })]) {
    assert.equal((await worker.fetch(request, env)).status, 401);
  }
  for (const origin of [null, 'null', 'https://evil.example.com', `${env.PUBLIC_ORIGIN}.evil.example.com`, `${env.PUBLIC_ORIGIN}/`]) assert.equal((await worker.fetch(post(env, { origin }), env)).status, 403);
  const put = new Request(`${env.PUBLIC_ORIGIN}/setup`, { method: 'PUT', headers: { 'oai-authenticated-user-id': 'owner', Origin: env.PUBLIC_ORIGIN } });
  assert.equal((await worker.fetch(put, env)).status, 403);
  const wrongHost = new Request('https://evil.example.com/setup', { method: 'POST', headers: { 'oai-authenticated-user-id': 'owner', Origin: env.PUBLIC_ORIGIN } });
  assert.equal((await worker.fetch(wrongHost, env)).status, 403);
  assert.equal(rows(env).length, 0);
});

test('setup saves only ciphertext and never returns, caches or reflects a submitted secret', async () => {
  const env = pending(), worker = createWorker(), config = new GitHubClientConfig(env);
  const response = await worker.fetch(post(env), env);
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('Location'), `${env.PUBLIC_ORIGIN}/?setup=saved`);
  assert.equal(await response.text(), '');
  const landing = await worker.fetch(pageRequest('/?setup=saved'), env);
  const html = await landing.text();
  assert.match(html, /saved encrypted/); assert.match(html, /did not authorize a new GitHub connection/);
  assert.ok(!html.includes(secret)); assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(response.headers.get('Referrer-Policy'), 'no-referrer');
  assert.match(landing.headers.get('Content-Security-Policy'), /form-action 'self'/);
  const saved = rows(env)[0];
  assert.equal(saved.user_id, 'owner'); assert.ok(!saved.payload.includes(secret));
  assert.deepEqual(await unseal(saved.payload, env, config.context('owner')), { clientSecret: secret });
  assert.equal((await config.forUser('owner')).GITHUB_CLIENT_SECRET, secret);
  const home = await (await worker.fetch(pageRequest('/'), env)).text();
  assert.match(home, /Connect GitHub/); assert.ok(!home.includes(secret));
  const setup = await (await worker.fetch(pageRequest(), env)).text();
  assert.match(setup, /already configured/); assert.ok(!setup.includes('type="password"'));
  const status = await (await worker.fetch(rpc('tools/call', { name: 'atlas_get_connection' }), env)).json();
  assert.equal(status.result.structuredContent.setupRequired, false);
  assert.ok(!JSON.stringify(status).includes(secret));
});

test('write-once setup prevents replacement, duplicate submissions and concurrent overwrites', async () => {
  const env = pending(), worker = createWorker();
  const first = await worker.fetch(post(env), env); assert.equal(first.status, 303);
  const initial = rows(env)[0].payload;
  const other = 'another-synthetic-client-secret-not-real';
  const repeated = await worker.fetch(post(env, { body: new URLSearchParams({ action: 'save-existing-secret', client_secret: other }).toString() }), env);
  assert.equal(repeated.status, 409); assert.ok(!(await repeated.text()).includes(other));
  assert.equal(rows(env)[0].payload, initial);
  const racing = pending();
  const results = await Promise.all([worker.fetch(post(racing), racing), worker.fetch(post(racing), racing)]);
  assert.deepEqual(results.map(value => value.status).sort(), [303, 409]);
  assert.equal(rows(racing).length, 1);
});

test('encrypted configuration is bound to the Site user, origin, client ID and purpose', async () => {
  const env = pending(), config = new GitHubClientConfig(env);
  await config.create('owner', secret);
  assert.equal(await config.load('other-user'), null);
  await assert.rejects(config.forUser('other-user'), { code: 'SETUP_REQUIRED' });
  const saved = rows(env)[0].payload;
  for (const context of [config.context('other-user'), 'connection:owner', 'state:owner:fixture']) await assert.rejects(unseal(saved, env, context));
  for (const changed of [{ PUBLIC_ORIGIN: 'https://different.example.com' }, { GITHUB_CLIENT_ID: 'different-client' }, { OAUTH_ENCRYPTION_KEY: btoa('b'.repeat(32)) }]) await assert.rejects(new GitHubClientConfig({ ...env, ...changed }).load('owner'), { code: 'SETUP_REQUIRED' });
  await env.DB.prepare('INSERT INTO github_client_configs (user_id, payload) VALUES (?, ?)').bind('other-user', saved).run();
  await assert.rejects(config.load('other-user'), { code: 'SETUP_REQUIRED' });
  assert.equal(await config.load('owner'), secret);
});

test('other users cannot read or overwrite owner configuration or OAuth connection records', async () => {
  const env = pending(), worker = createWorker(), oauthStore = new OAuthStore(env.DB);
  await worker.fetch(post(env), env);
  const ownerPayload = rows(env)[0].payload;
  const version = (await oauthStore.beginAuth('owner')).version;
  await oauthStore.save('owner', 'synthetic-existing-encrypted-connection', version);
  const connection = await oauthStore.get('owner');
  const status = await (await worker.fetch(rpc('tools/call', { name: 'atlas_get_connection' }, 'other'), env)).json();
  assert.equal(status.result.structuredContent.setupRequired, true);
  assert.equal((await worker.fetch(post(env, { user: 'other' }), env)).status, 303);
  assert.equal((await new GitHubClientConfigStore(env.DB).get('owner')).payload, ownerPayload);
  assert.deepEqual(await oauthStore.get('owner'), connection);
});

test('server secret retains precedence and disables D1 setup without reading or changing saved secrets', async () => {
  const env = pending(); await new GitHubClientConfig(env).create('owner', secret);
  const ciphertext = rows(env)[0].payload;
  env.GITHUB_CLIENT_SECRET = 'server-configured-secret-not-real';
  const config = new GitHubClientConfig(env);
  config.store.get = () => { throw new Error('Must not read D1 when server secret is configured'); };
  assert.equal(await config.load('owner'), env.GITHUB_CLIENT_SECRET);
  await assert.rejects(config.create('owner', secret), { code: 'ALREADY_CONFIGURED' });
  const worker = createWorker();
  const html = await (await worker.fetch(pageRequest(), env)).text();
  assert.match(html, /already configured/); assert.ok(!html.includes('type="password"'));
  assert.equal((await worker.fetch(post(env), env)).status, 409);
  assert.equal(rows(env)[0].payload, ciphertext);
});

test('setup payload schema rejects duplicate, missing, extra, invalid and query fields without reflection', async () => {
  const env = pending(), worker = createWorker();
  const valid = new URLSearchParams({ action: 'save-existing-secret', client_secret: secret }).toString();
  const invalid = [
    '', `client_secret=${secret}`, 'action=save-existing-secret', valid + '&extra=x', valid + '&action=save-existing-secret', valid + `&client_secret=${secret}`,
    valid.replace('save-existing-secret', 'replace-secret'), 'action=save-existing-secret&client_secret=', 'action=save-existing-secret&client_secret=short',
    'action=save-existing-secret&client_secret=' + 'x'.repeat(257), 'action=save-existing-secret&client_secret=%00' + secret,
    'action=save-existing-secret&client_secret=%ZZ' + secret, 'action=save-existing-secret&client_secret=%3Cscript%3E' + secret,
    'action=save-existing-secret&client_secret=' + secret + '+',
  ];
  for (const body of invalid) {
    const response = await worker.fetch(post(env, { body }), env);
    assert.equal(response.status, 400, body); assert.ok(!(await response.text()).includes(secret));
  }
  for (const headers of [{ 'Content-Type': 'application/json' }, { 'Content-Type': 'text/plain' }, { 'Content-Type': 'multipart/form-data' }, { 'Content-Type': 'application/x-www-form-urlencoded; charset=iso-8859-1' }, { 'Content-Encoding': 'gzip' }]) assert.equal((await worker.fetch(post(env, { headers }), env)).status, 415);
  for (const request of [post(env, { path: `/setup?client_secret=${secret}` }), pageRequest(`/setup?client_secret=${secret}`)]) {
    const response = await worker.fetch(request, env); assert.equal(response.status, 400); assert.ok(!(await response.text()).includes(secret));
  }
  const noIdentityKey = post(env, { body: valid + '&user_id=other' });
  assert.equal((await worker.fetch(noIdentityKey, env)).status, 400);
  assert.equal(rows(env).length, 0);
});

test('setup streaming body limit applies without Content-Length and cancels oversized input', async () => {
  const env = pending(), worker = createWorker(); let cancelled = false;
  const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(2048)); controller.enqueue(new Uint8Array(2049)); }, cancel() { cancelled = true; } });
  const request = new Request(`${env.PUBLIC_ORIGIN}/setup`, { method: 'POST', headers: { 'oai-authenticated-user-id': 'owner', Origin: env.PUBLIC_ORIGIN, 'Content-Type': 'application/x-www-form-urlencoded' }, body: stream, duplex: 'half' });
  assert.equal((await worker.fetch(request, env)).status, 413); assert.equal(cancelled, true);
  assert.equal((await worker.fetch(post(env, { headers: { 'Content-Length': '4097' } }), env)).status, 413);
  assert.equal((await readSetupBody(new Request('https://atlas.example.com/setup', { method: 'POST', body: 'a'.repeat(4096) }))).length, 4096);
  const invalidUtf8 = post(env, { body: new Uint8Array([0xff, 0xfe]) });
  assert.equal((await worker.fetch(invalidUtf8, env)).status, 400);
  assert.equal(rows(env).length, 0);
});

test('setup enforces a total body deadline even when stream cancellation never resolves', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let cancelled = false;
  const stream = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('action=')); }, cancel() { cancelled = true; return new Promise(() => {}); } });
  const request = new Request('https://atlas.example.com/setup', { method: 'POST', body: stream, duplex: 'half' });
  const read = readSetupBody(request);
  const rejected = assert.rejects(read, { code: 'REQUEST_TIMEOUT', status: 408 });
  t.mock.timers.tick(5001);
  await rejected; assert.equal(cancelled, true);
});

test('missing or malformed server encryption configuration still fails closed', async () => {
  const worker = createWorker();
  for (const missing of ['PUBLIC_ORIGIN', 'GITHUB_CLIENT_ID', 'OAUTH_ENCRYPTION_KEY', 'DB']) {
    const env = pending(); delete env[missing];
    assert.equal((await worker.fetch(pageRequest(), env)).status, 503);
    assert.equal((await worker.fetch(post({ ...env, PUBLIC_ORIGIN: 'https://atlas.example.com' }), env)).status, 503);
  }
  for (const key of ['broken!', btoa('short')]) {
    const env = { ...pending(), OAUTH_ENCRYPTION_KEY: key };
    assert.equal((await worker.fetch(post(env), env)).status, 503); assert.equal(rows(env).length, 0);
  }
});

test('storage failures and corrupted ciphertext never expose submitted values or database errors', async () => {
  const env = pending(), worker = createWorker();
  const prepare = env.DB.prepare;
  env.DB.prepare = () => { throw new Error(`database error: ${secret}`); };
  const response = await worker.fetch(post(env), env);
  assert.equal(response.status, 500); assert.ok(!(await response.text()).includes(secret));
  env.DB.prepare = prepare;
  await env.DB.prepare('INSERT INTO github_client_configs (user_id, payload) VALUES (?, ?)').bind('owner', secret).run();
  const broken = await worker.fetch(pageRequest(), env); assert.equal(broken.status, 503); assert.ok(!(await broken.text()).includes(secret));
  assert.equal(rows(env)[0].payload, secret);
});

test('D1-configured secret works through existing OAuth callback and token-specific disconnect flow', async () => {
  const env = pending(), provider = oauthProvider(), worker = createWorker(provider);
  assert.equal((await worker.fetch(post(env), env)).status, 303);
  const start = await worker.fetch(post(env, { path: '/auth/github/start' }), env);
  assert.equal(start.status, 303);
  const authorization = new URL(start.headers.get('Location'));
  const callback = new URL(`${env.PUBLIC_ORIGIN}/auth/github/callback`);
  callback.searchParams.set('state', authorization.searchParams.get('state')); callback.searchParams.set('code', 'synthetic-code');
  const connected = await worker.fetch(new Request(callback, { headers: { 'oai-authenticated-user-id': 'owner', Cookie: start.headers.get('Set-Cookie').split(';')[0] } }), env);
  assert.equal(connected.status, 303); assert.ok(!connected.headers.get('Location').includes(secret));
  assert.equal(new URLSearchParams(provider.calls[0].init.body).get('client_secret'), secret);
  const status = await (await worker.fetch(rpc('tools/call', { name: 'atlas_get_connection' }), env)).json();
  assert.equal(status.result.structuredContent.connected, true); assert.equal(status.result.structuredContent.setupRequired, false);
  assert.ok(!JSON.stringify(status).includes(secret)); assert.ok(!JSON.stringify(status).includes(tokenResponse.access_token));
  const disconnected = await worker.fetch(post(env, { path: '/auth/github/disconnect' }), env);
  assert.equal(disconnected.status, 200);
  assert.equal(provider.calls.at(-1).init.headers.Authorization, `Basic ${btoa(`${env.GITHUB_CLIENT_ID}:${secret}`)}`);
  assert.equal(await new GitHubClientConfig(env).load('owner'), secret);
});

test('a previously connected token cannot enable repository writes after its user config is absent', async () => {
  const env = pending(), store = new OAuthStore(env.DB), worker = createWorker({ fetcher: () => { throw new Error('No GitHub access allowed'); } });
  await store.save('owner', await seal({ accessToken: 'synthetic-valid-token', expiresAt: Date.now() + 999999, refreshExpiresAt: Date.now() + 999999 }, env, 'connection:owner'), (await store.beginAuth('owner')).version);
  const reply = await (await worker.fetch(rpc('tools/call', { name: 'atlas_add_opportunity', arguments: { entry, provenance, expectedRevision: 'a'.repeat(40) } }), env)).json();
  assert.equal(reply.result.isError, true); assert.match(reply.result.content[0].text, /SETUP_REQUIRED/);
});
