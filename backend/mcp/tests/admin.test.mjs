import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, randomBytes, sign as cryptoSign } from 'node:crypto';
import { createServer as createHttpServer } from 'node:http';
import { mkdtemp, mkdir, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildConfig, createHttpHandler } from '../http-server.mjs';
import { clearJwksCache } from '../google-auth.mjs';

const repo = fileURLToPath(new URL('../../../', import.meta.url));
const b64u = value => Buffer.from(value).toString('base64url');

const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const publicJwk = { ...publicKey.export({ format: 'jwk' }), kid: 'test-key', use: 'sig', alg: 'RS256' };

function signIdToken({ email, aud, nonce }) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT', kid: 'test-key' };
  const payload = { iss: 'https://accounts.google.com', aud, sub: 'google-sub-1', email, email_verified: true, iat: now, exp: now + 3600, nonce };
  const input = `${b64u(JSON.stringify(header))}.${b64u(JSON.stringify(payload))}`;
  return `${input}.${b64u(cryptoSign('RSA-SHA256', Buffer.from(input), privateKey))}`;
}

let mockEmail = 'admin@example.com';
let mockGooglePort;

function startMockGoogle() {
  const codes = new Map();
  const server = createHttpServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname === '/oauth2/v3/certs') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ keys: [publicJwk] }));
      return;
    }
    if (url.pathname === '/o/oauth2/v2/auth') {
      const target = new URL(url.searchParams.get('redirect_uri'));
      const code = b64u(randomBytes(16));
      codes.set(code, url.searchParams.get('nonce'));
      target.searchParams.set('code', code);
      target.searchParams.set('state', url.searchParams.get('state'));
      res.writeHead(302, { location: target.toString() });
      res.end();
      return;
    }
    if (url.pathname === '/oauth2/v4/token' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        const form = new URLSearchParams(body);
        const nonce = codes.get(form.get('code'));
        if (!codes.delete(form.get('code'))) { res.writeHead(400, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: 'invalid_grant' })); return; }
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ id_token: signIdToken({ email: mockEmail, aud: 'test-google-client', nonce }), access_token: 'mock-access', token_type: 'Bearer', expires_in: 3600 }));
      });
      return;
    }
    res.writeHead(404);
    res.end();
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => { mockGooglePort = server.address().port; resolve(server); }));
}

// Mock GitHub Contents API: an in-memory two-file repo.
const githubFiles = new Map();
let githubPort;
function seedGithub() {
  githubFiles.clear();
  const queue = {
    version: 1,
    entries: [{
      id: 'startup-lead:testco', kind: 'startup-lead', subject: 'startup:testco', subject_key: 'testco',
      candidates: [], evidence: ['https://example.com/portfolio'], confidence: 0.45,
      created_at: '2026-11-24T00:00:00Z', run: '47', status: 'pending',
      decided_by: null, decided_at: null, decision_note: null, evidence_fingerprint: 'x',
      mentions: { partners: ['Airtree'], website: 'https://testco.example.com' },
    }],
  };
  githubFiles.set('data/review-queue.json', { text: JSON.stringify(queue, null, 2) + '\n', sha: 'sha-1' });
  githubFiles.set('data/review-gating.json', { text: JSON.stringify({ version: 1, enabled: true, decided_by: 'auto-gate', kinds: {} }), sha: 'sha-g' });
}
function startMockGithub() {
  seedGithub();
  const server = createHttpServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const match = /^\/repos\/[^/]+\/[^/]+\/contents\/(.+)$/.exec(url.pathname);
    if (!match || req.headers.authorization !== 'Bearer test-token') { res.writeHead(404, { 'content-type': 'application/json' }); res.end('{}'); return; }
    const filePath = decodeURIComponent(match[1]);
    const file = githubFiles.get(filePath);
    if (req.method === 'GET') {
      if (!file) { res.writeHead(404, { 'content-type': 'application/json' }); res.end('{}'); return; }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ content: Buffer.from(file.text, 'utf8').toString('base64'), sha: file.sha }));
      return;
    }
    if (req.method === 'PUT') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        const parsed = JSON.parse(body);
        if (!file || parsed.sha !== file.sha) { res.writeHead(422, { 'content-type': 'application/json' }); res.end('{}'); return; }
        file.text = Buffer.from(parsed.content, 'base64').toString('utf8');
        file.sha = `sha-${Math.random()}`;
        file.message = parsed.message;
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ commit: { sha: 'commit-1' } }));
      });
      return;
    }
    res.writeHead(405);
    res.end();
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => { githubPort = server.address().port; resolve(server); }));
}

async function freePort() {
  const server = createHttpServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

async function startApp({ withToken = true } = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), 'atlas-admin-'));
  await cp(path.join(repo, 'data'), path.join(dir, 'data'), { recursive: true });
  await mkdir(path.join(dir, 'scripts'));
  await cp(path.join(repo, 'scripts/make-data.py'), path.join(dir, 'scripts/make-data.py'));
  const port = await freePort();
  const env = {
    ...process.env,
    GOOGLE_CLIENT_ID: 'test-google-client',
    GOOGLE_CLIENT_SECRET: 'test-secret',
    ATLAS_GOOGLE_ALLOWED_EMAILS: 'reader@example.com,admin@example.com',
    ATLAS_GOOGLE_WRITE_EMAILS: 'admin@example.com',
    GOOGLE_AUTH_URL: `http://127.0.0.1:${mockGooglePort}/o/oauth2/v2/auth`,
    GOOGLE_TOKEN_URL: `http://127.0.0.1:${mockGooglePort}/oauth2/v4/token`,
    GOOGLE_JWKS_URL: `http://127.0.0.1:${mockGooglePort}/oauth2/v3/certs`,
    GOOGLE_TOKENINFO_URL: `http://127.0.0.1:${mockGooglePort}/tokeninfo`,
    ATLAS_HTTP_BASE_URL: `http://127.0.0.1:${port}`,
  };
  if (withToken) {
    env.ATLAS_GITHUB_TOKEN = 'test-token';
    env.ATLAS_GITHUB_API_BASE = `http://127.0.0.1:${githubPort}`;
  } else {
    delete env.ATLAS_GITHUB_TOKEN;
  }
  const config = buildConfig(env, ['--repo', dir, '--port', String(port)]);
  const { CatalogueStore } = await import('../store.mjs');
  const store = new CatalogueStore(config.root, { writeEnabled: config.writeEnabled });
  await store.snapshot();
  const server = createHttpServer(createHttpHandler(store, config));
  await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
  return { server, dir, base: `http://127.0.0.1:${port}` };
}

async function signIn(base) {
  const authRes = await fetch(`${base}/admin/auth`, { redirect: 'manual' });
  assert.equal(authRes.status, 302);
  const googleRes = await fetch(authRes.headers.get('location'), { redirect: 'manual' });
  assert.equal(googleRes.status, 302);
  const callbackRes = await fetch(googleRes.headers.get('location'), { redirect: 'manual' });
  return callbackRes;
}

let mockGoogle;
let mockGithub;
let app;
let localApp;

test.before(async () => {
  clearJwksCache();
  mockGoogle = await startMockGoogle();
  mockGithub = await startMockGithub();
  app = await startApp({ withToken: true });
  localApp = await startApp({ withToken: false });
});

test.after(async () => {
  for (const item of [app, localApp]) {
    await new Promise(resolve => item.server.close(resolve));
    await rm(item.dir, { recursive: true, force: true });
  }
  await new Promise(resolve => mockGoogle.close(resolve));
  await new Promise(resolve => mockGithub.close(resolve));
});

test('admin panel gates: login page is public, panel and API refuse anonymous requests', async () => {
  const login = await fetch(`${app.base}/admin/login`);
  assert.equal(login.status, 200);
  assert.match(await login.text(), /Sign in with Google/);

  const panel = await fetch(`${app.base}/admin`, { redirect: 'manual' });
  assert.equal(panel.status, 302);
  assert.equal(panel.headers.get('location'), '/admin/login');

  const api = await fetch(`${app.base}/admin/api/queue`);
  assert.equal(api.status, 401);

  const health = await (await fetch(`${app.base}/health`)).json();
  assert.equal(health.adminEnabled, true);
  assert.equal(health.adminQueueWriteConfigured, true);
});

test('a verified Google account outside the admin list is refused at the callback', async () => {
  mockEmail = 'reader@example.com';
  const callbackRes = await signIn(app.base);
  assert.equal(callbackRes.status, 403);
  assert.equal(callbackRes.headers.get('set-cookie'), null);
  assert.match(await callbackRes.text(), /not the Atlas admin/);
});

test('the admin account signs in, reads the queue, decides and undoes via GitHub write-back', async () => {
  mockEmail = 'admin@example.com';
  seedGithub();
  const callbackRes = await signIn(app.base);
  assert.equal(callbackRes.status, 302);
  assert.equal(callbackRes.headers.get('location'), '/admin');
  const cookie = callbackRes.headers.get('set-cookie').split(';')[0];
  assert.ok(cookie.startsWith('atlas_admin='));

  const panel = await fetch(`${app.base}/admin`, { headers: { cookie } });
  assert.equal(panel.status, 200);
  const panelText = await panel.text();
  assert.match(panelText, /review queue/);
  // Fact cards must render draft_value (valuation/listing figures from the
  // crawl intake) as well as draft_round, or reviewers decide them blind.
  assert.match(panelText, /e\.draft_value/);

  const queueRes = await fetch(`${app.base}/admin/api/queue`, { headers: { cookie } });
  assert.equal(queueRes.status, 200);
  const queueBody = await queueRes.json();
  assert.equal(queueBody.email, 'admin@example.com');
  assert.equal(queueBody.source, 'github');
  assert.equal(queueBody.canWrite, true);
  assert.equal(queueBody.entries.length, 1);
  assert.equal(queueBody.gating.enabled, true);

  const decideRes = await fetch(`${app.base}/admin/api/decide`, {
    method: 'POST', headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ id: 'startup-lead:testco', decision: 'approved', note: 'Looks right.' }),
  });
  assert.equal(decideRes.status, 200);
  const stored = JSON.parse(githubFiles.get('data/review-queue.json').text);
  assert.equal(stored.entries[0].status, 'approved');
  assert.equal(stored.entries[0].decided_by, 'admin@example.com');
  assert.equal(stored.entries[0].decision_note, 'Looks right.');
  assert.match(githubFiles.get('data/review-queue.json').message, /startup-lead:testco approved/);

  const againRes = await fetch(`${app.base}/admin/api/decide`, {
    method: 'POST', headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ id: 'startup-lead:testco', decision: 'rejected' }),
  });
  assert.equal(againRes.status, 409);

  const undoRes = await fetch(`${app.base}/admin/api/undo`, {
    method: 'POST', headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ id: 'startup-lead:testco' }),
  });
  assert.equal(undoRes.status, 200);
  const restored = JSON.parse(githubFiles.get('data/review-queue.json').text);
  assert.equal(restored.entries[0].status, 'pending');
  assert.equal(restored.entries[0].decided_by, null);
});

test('without a GitHub token the panel serves the bundled queue read-only', async () => {
  mockEmail = 'admin@example.com';
  const callbackRes = await signIn(localApp.base);
  assert.equal(callbackRes.status, 302);
  const cookie = callbackRes.headers.get('set-cookie').split(';')[0];

  const queueRes = await fetch(`${localApp.base}/admin/api/queue`, { headers: { cookie } });
  assert.equal(queueRes.status, 200);
  const queueBody = await queueRes.json();
  assert.equal(queueBody.source, 'local');
  assert.equal(queueBody.canWrite, false);
  assert.ok(queueBody.entries.length > 100);

  // The write-disabled 503 fires before any state validation, so any
  // real entry id exercises it; the bundled queue may legitimately have
  // zero pending entries (it was fully decided on 25 Nov 2026).
  const target = queueBody.entries.find(item => item.status === 'pending')
    ?? queueBody.entries[0];
  assert.ok(target);
  const decideRes = await fetch(`${localApp.base}/admin/api/decide`, {
    method: 'POST', headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ id: target.id, decision: 'approved' }),
  });
  assert.equal(decideRes.status, 503);
  assert.equal((await decideRes.json()).code, 'GITHUB_TOKEN_MISSING');
});

test('buildConfig: admin list falls back to the write list, ATLAS_ADMIN_EMAILS wins', () => {
  const base = { ATLAS_GOOGLE_CLIENT_ID: 'x', ATLAS_GOOGLE_ALLOWED_EMAILS: 'a@example.com', ATLAS_GOOGLE_WRITE_EMAILS: 'writer@example.com' };
  assert.deepEqual([...buildConfig(base, []).adminEmails], ['writer@example.com']);
  assert.deepEqual([...buildConfig({ ...base, ATLAS_ADMIN_EMAILS: 'boss@example.com' }, []).adminEmails], ['boss@example.com']);
});
