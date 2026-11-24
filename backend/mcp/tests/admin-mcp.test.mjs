import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign as cryptoSign } from 'node:crypto';
import { createServer as createHttpServer } from 'node:http';
import { mkdtemp, mkdir, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { buildConfig, createHttpHandler } from '../http-server.mjs';
import { clearJwksCache } from '../google-auth.mjs';
import { ADMIN_TOOLS } from '../admin-mcp.mjs';

const repo = fileURLToPath(new URL('../../../', import.meta.url));
const b64u = value => Buffer.from(value).toString('base64url');

const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const publicJwk = { ...publicKey.export({ format: 'jwk' }), kid: 'test-key', use: 'sig', alg: 'RS256' };

function signIdToken({ email, aud }) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT', kid: 'test-key' };
  const payload = { iss: 'https://accounts.google.com', aud, sub: `sub-${email}`, email, email_verified: true, iat: now, exp: now + 3600 };
  const input = `${b64u(JSON.stringify(header))}.${b64u(JSON.stringify(payload))}`;
  return `${input}.${b64u(cryptoSign('RSA-SHA256', Buffer.from(input), privateKey))}`;
}

let mockGooglePort;
function startMockGoogle() {
  const server = createHttpServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname === '/oauth2/v3/certs') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ keys: [publicJwk] }));
      return;
    }
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end('{}');
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => { mockGooglePort = server.address().port; resolve(server); }));
}

// Mock GitHub Contents API: an in-memory two-file repo (same shape as
// the admin panel tests).
const githubFiles = new Map();
let githubPort;
function seedGithub() {
  githubFiles.clear();
  const queue = {
    version: 1,
    entries: [
      {
        id: 'headshot:psiquantum:jane-doe', kind: 'headshot', subject: 'startup:psiquantum', subject_key: 'psiquantum:jane-doe',
        candidates: [], evidence: ['https://example.com/about'], confidence: 0.99,
        created_at: '2026-11-24T00:00:00Z', run: '47', status: 'pending',
        decided_by: null, decided_at: null, decision_note: null, evidence_fingerprint: 'h',
        headshot: { person_name: 'Jane Doe', candidate_url: 'https://example.com/jane.jpg', reason: 'Photo of Jane Doe' },
      },
      {
        id: 'merge:partner:accel', kind: 'merge', subject: 'partner:accel', subject_key: 'accel',
        candidates: [{ id: 'partner:accel-partners', score: 0.93, basis: 'same website host accel.com' }],
        evidence: ['https://accel.com'], confidence: 0.92,
        created_at: '2026-11-24T00:00:00Z', run: '47', status: 'pending',
        decided_by: null, decided_at: null, decision_note: null, evidence_fingerprint: 'm',
      },
      {
        id: 'startup-lead:testco', kind: 'startup-lead', subject: 'startup:testco', subject_key: 'testco',
        candidates: [], evidence: ['https://example.com/portfolio'], confidence: 0.45,
        created_at: '2026-11-24T00:00:00Z', run: '47', status: 'pending',
        decided_by: null, decided_at: null, decision_note: null, evidence_fingerprint: 'x',
        mentions: { partners: ['Airtree'], website: 'https://testco.example.com' },
      },
      {
        id: 'startup-lead:autoco', kind: 'startup-lead', subject: 'startup:autoco', subject_key: 'autoco',
        candidates: [], evidence: ['https://example.com/auto'], confidence: 0.81,
        created_at: '2026-11-23T00:00:00Z', run: '46', status: 'approved',
        decided_by: 'auto-gate', decided_at: '2026-11-23T09:00:00Z',
        decision_note: 'confidence 0.81 >= startup-lead threshold 0.65', evidence_fingerprint: 'a',
        mentions: { partners: ['Square Peg'], website: 'https://autoco.example.com' },
      },
    ],
  };
  githubFiles.set('data/review-queue.json', { text: JSON.stringify(queue, null, 2) + '\n', sha: 'sha-1' });
  githubFiles.set('data/review-gating.json', {
    text: JSON.stringify({
      version: 1, enabled: true, decided_by: 'auto-gate',
      kinds: {
        merge: { auto_approve_at: 0.88, require_identity_key: true },
        'startup-lead': { auto_approve_at: 0.65 },
        headshot: { auto_approve_at: null },
        fact: { auto_approve_at: 0.55, require_complete_draft: true },
        edge: { auto_approve_at: null },
      },
    }),
    sha: 'sha-g',
  });
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

async function startApp(extraEnv = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), 'atlas-admin-mcp-'));
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
    ATLAS_ADMIN_SERVICE_TOKEN: '',
    ATLAS_GITHUB_TOKEN: 'test-token',
    ATLAS_GITHUB_API_BASE: `http://127.0.0.1:${githubPort}`,
    GOOGLE_AUTH_URL: `http://127.0.0.1:${mockGooglePort}/o/oauth2/v2/auth`,
    GOOGLE_TOKEN_URL: `http://127.0.0.1:${mockGooglePort}/oauth2/v4/token`,
    GOOGLE_JWKS_URL: `http://127.0.0.1:${mockGooglePort}/oauth2/v3/certs`,
    GOOGLE_TOKENINFO_URL: `http://127.0.0.1:${mockGooglePort}/tokeninfo`,
    ATLAS_HTTP_BASE_URL: `http://127.0.0.1:${port}`,
    ...extraEnv,
  };
  const config = buildConfig(env, ['--repo', dir, '--port', String(port)]);
  const { CatalogueStore } = await import('../store.mjs');
  const store = new CatalogueStore(config.root, { writeEnabled: config.writeEnabled });
  await store.snapshot();
  const server = createHttpServer(createHttpHandler(store, config));
  await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
  return { server, dir, base: `http://127.0.0.1:${port}` };
}

async function connect(t, base, pathname, token) {
  const transport = new StreamableHTTPClientTransport(new URL(`${base}${pathname}`), { requestInit: { headers: { Authorization: `Bearer ${token}` } } });
  const client = new Client({ name: 'atlas-admin-mcp-test', version: '1.0.0' });
  t.after(async () => { await client.close(); });
  await client.connect(transport);
  return client;
}

const decoded = result => JSON.parse(result.content[0].text);
const adminToken = () => signIdToken({ email: 'admin@example.com', aud: 'test-google-client' });
const readerToken = () => signIdToken({ email: 'reader@example.com', aud: 'test-google-client' });

const initializeBody = JSON.stringify({
  jsonrpc: '2.0', id: 1, method: 'initialize',
  params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'gate-test', version: '1.0.0' } },
});

const SERVICE_TOKEN = '<MASKED_SECRET_001>';

let mockGoogle;
let mockGithub;
let app;
let serviceApp;

test.before(async () => {
  clearJwksCache();
  mockGoogle = await startMockGoogle();
  mockGithub = await startMockGithub();
  app = await startApp();
  serviceApp = await startApp({ ATLAS_ADMIN_SERVICE_TOKEN: SERVICE_TOKEN });
});

test.after(async () => {
  await new Promise(resolve => app.server.close(resolve));
  await rm(app.dir, { recursive: true, force: true });
  await new Promise(resolve => serviceApp.server.close(resolve));
  await rm(serviceApp.dir, { recursive: true, force: true });
  await new Promise(resolve => mockGoogle.close(resolve));
  await new Promise(resolve => mockGithub.close(resolve));
});

test('/mcp/admin refuses unauthenticated and forged callers with 401', async () => {
  const anonymous = await fetch(`${app.base}/mcp/admin`, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: initializeBody });
  assert.equal(anonymous.status, 401);
  assert.match(anonymous.headers.get('www-authenticate') ?? '', /oauth-protected-resource\/mcp\/admin/);

  const forged = await fetch(`${app.base}/mcp/admin`, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: 'Bearer <redacted>' }, body: initializeBody });
  assert.equal(forged.status, 401);
});

test('/mcp/admin refuses a verified non-admin account with 403, while /mcp admits it', async () => {
  const refused = await fetch(`${app.base}/mcp/admin`, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: `Bearer ${readerToken()}` }, body: initializeBody });
  assert.equal(refused.status, 403);
  assert.match((await refused.json()).message, /not the Atlas admin/);
});

test('the admin account gets exactly the admin tools, disjoint from /mcp', async t => {
  const client = await connect(t, app.base, '/mcp/admin', adminToken());
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map(tool => tool.name).sort(), ADMIN_TOOLS.map(tool => tool.name).sort());
  assert.equal(tools.length, 6);
  assert.ok(tools.every(tool => tool.name.startsWith('atlas_admin_')));

  const health = await (await fetch(`${app.base}/health`)).json();
  assert.equal(health.tools, 18);
  assert.equal(health.adminMcpEnabled, true);
  assert.equal(health.adminTools, 6);
});

test('queue listing filters by status and band and carries gating verdicts', async t => {
  const client = await connect(t, app.base, '/mcp/admin', adminToken());
  const pending = decoded(await client.callTool({ name: 'atlas_admin_list_review_queue', arguments: { status: 'pending' } }));
  assert.equal(pending.total, 3);
  assert.deepEqual(pending.entries.map(entry => entry.id), ['startup-lead:testco', 'merge:partner:accel', 'headshot:psiquantum:jane-doe']);
  const verdicts = Object.fromEntries(pending.entries.map(entry => [entry.id, entry.gating.auto]));
  assert.equal(verdicts['merge:partner:accel'], true);
  assert.equal(verdicts['startup-lead:testco'], false);
  assert.equal(verdicts['headshot:psiquantum:jane-doe'], false);

  const above = decoded(await client.callTool({ name: 'atlas_admin_list_review_queue', arguments: { status: 'pending', band: 'above_gate' } }));
  assert.deepEqual(above.entries.map(entry => entry.id), ['merge:partner:accel']);

  const item = decoded(await client.callTool({ name: 'atlas_admin_get_review_item', arguments: { id: 'merge:partner:accel' } }));
  assert.equal(item.entry.candidates[0].basis, 'same website host accel.com');
  assert.match(item.gating.reason, /identity key/);

  const gating = decoded(await client.callTool({ name: 'atlas_admin_get_review_gating', arguments: {} }));
  assert.equal(gating.gating.enabled, true);
  assert.equal(gating.gating.kinds.merge.auto_approve_at, 0.88);

  const auto = decoded(await client.callTool({ name: 'atlas_admin_list_auto_applied', arguments: {} }));
  assert.equal(auto.decided_by, 'auto-gate');
  assert.deepEqual(auto.entries.map(entry => entry.id), ['startup-lead:autoco']);
});

test('decide requires an evidence note, writes back as agent-review, and undo restores pending', async t => {
  seedGithub();
  const client = await connect(t, app.base, '/mcp/admin', adminToken());

  const noNote = await client.callTool({ name: 'atlas_admin_decide_review_item', arguments: { id: 'startup-lead:testco', decision: 'approved', note: '  ' } });
  assert.equal(noNote.isError, true);
  assert.equal(decoded(noNote).code, 'EVIDENCE_NOTE_REQUIRED');

  const decided = decoded(await client.callTool({
    name: 'atlas_admin_decide_review_item',
    arguments: { id: 'startup-lead:testco', decision: 'approved', note: 'Evidence: Airtree portfolio page lists TestCo with its own website; identity matches the mention.' },
  }));
  assert.equal(decided.ok, true);
  assert.equal(decided.entry.decided_by, 'agent-review');
  const stored = JSON.parse(githubFiles.get('data/review-queue.json').text);
  const entry = stored.entries.find(item => item.id === 'startup-lead:testco');
  assert.equal(entry.status, 'approved');
  assert.equal(entry.decided_by, 'agent-review');
  assert.match(entry.decision_note, /Airtree portfolio page/);
  assert.equal(githubFiles.get('data/review-queue.json').message, 'review: startup-lead:testco approved via admin MCP');

  const again = await client.callTool({ name: 'atlas_admin_decide_review_item', arguments: { id: 'startup-lead:testco', decision: 'rejected', note: 'Second decision attempt.' } });
  assert.equal(again.isError, true);
  assert.equal(decoded(again).code, 'ALREADY_DECIDED');

  const undone = decoded(await client.callTool({ name: 'atlas_admin_undo_review_decision', arguments: { id: 'startup-lead:testco' } }));
  assert.equal(undone.entry.status, 'pending');
  const restored = JSON.parse(githubFiles.get('data/review-queue.json').text);
  const restoredEntry = restored.entries.find(item => item.id === 'startup-lead:testco');
  assert.equal(restoredEntry.status, 'pending');
  assert.equal(restoredEntry.decided_by, null);
  assert.equal(githubFiles.get('data/review-queue.json').message, 'review: startup-lead:testco decision undone via admin MCP (was approved by agent-review)');
});

test('/mcp regression: the catalogue surface still serves its 18 tools and no admin tools', async t => {
  const client = await connect(t, app.base, '/mcp', readerToken());
  const { tools } = await client.listTools();
  assert.equal(tools.length, 18);
  assert.ok(tools.every(tool => !tool.name.startsWith('atlas_admin_')));
});

test('service credential: the configured token authenticates /mcp/admin and decides as agent-review', async t => {
  seedGithub();
  const health = await (await fetch(`${serviceApp.base}/health`)).json();
  assert.equal(health.adminServiceAuthConfigured, true);

  const client = await connect(t, serviceApp.base, '/mcp/admin', SERVICE_TOKEN);
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map(tool => tool.name).sort(), ADMIN_TOOLS.map(tool => tool.name).sort());

  const decided = decoded(await client.callTool({
    name: 'atlas_admin_decide_review_item',
    arguments: { id: 'startup-lead:testco', decision: 'approved', note: 'Evidence: Airtree portfolio page lists TestCo with its own website; identity matches the mention.' },
  }));
  assert.equal(decided.ok, true);
  // Same attribution as the OAuth path: the queue record cannot tell
  // (and must not need to tell) which credential presented.
  assert.equal(decided.entry.decided_by, 'agent-review');
  const stored = JSON.parse(githubFiles.get('data/review-queue.json').text);
  assert.equal(stored.entries.find(item => item.id === 'startup-lead:testco').decided_by, 'agent-review');
  assert.equal(githubFiles.get('data/review-queue.json').message, 'review: startup-lead:testco approved via admin MCP');
});

test('service credential: a wrong token and no token get 401 on /mcp/admin', async () => {
  const wrong = await fetch(`${serviceApp.base}/mcp/admin`, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: 'Bearer service-token-WRONG' }, body: initializeBody });
  assert.equal(wrong.status, 401);

  const anonymous = await fetch(`${serviceApp.base}/mcp/admin`, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: initializeBody });
  assert.equal(anonymous.status, 401);
});

test('service credential: scoped to /mcp/admin only — /mcp refuses it, and the panel is untouched', async () => {
  const catalogue = await fetch(`${serviceApp.base}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: `Bearer ${SERVICE_TOKEN}` }, body: initializeBody });
  assert.equal(catalogue.status, 401);

  const panel = await fetch(`${serviceApp.base}/admin/api/queue`, { headers: { authorization: `Bearer ${SERVICE_TOKEN}` } });
  assert.equal(panel.status, 401);
});

test('service credential: inert when ATLAS_ADMIN_SERVICE_TOKEN is unset, Google path unaffected either way', async () => {
  const health = await (await fetch(`${app.base}/health`)).json();
  assert.equal(health.adminServiceAuthConfigured, false);

  const refused = await fetch(`${app.base}/mcp/admin`, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: `Bearer ${SERVICE_TOKEN}` }, body: initializeBody });
  assert.equal(refused.status, 401);

  // The Google path still works on the app that HAS the credential set:
  // the admin's ID token initializes a session (200), the reader's gets
  // the admin surface's 403 — exactly as without the feature.
  const adminInit = await fetch(`${serviceApp.base}/mcp/admin`, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: `Bearer ${adminToken()}` }, body: initializeBody });
  assert.equal(adminInit.status, 200);
  const readerInit = await fetch(`${serviceApp.base}/mcp/admin`, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: `Bearer ${readerToken()}` }, body: initializeBody });
  assert.equal(readerInit.status, 403);
});
