import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, randomBytes, sign as cryptoSign } from 'node:crypto';
import { createServer as createHttpServer } from 'node:http';
import { mkdtemp, mkdir, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { buildConfig, createHttpHandler } from '../http-server.mjs';
import { clearJwksCache } from '../google-auth.mjs';

const repo = fileURLToPath(new URL('../../../', import.meta.url));
const b64u = value => Buffer.from(value).toString('base64url');
const sha256B64u = value => b64u(createHash('sha256').update(value).digest());

const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const publicJwk = { ...publicKey.export({ format: 'jwk' }), kid: 'test-key', use: 'sig', alg: 'RS256' };

function signIdToken({ email, aud, nonce, expInSeconds = 3600, iss = 'https://accounts.google.com' }) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT', kid: 'test-key' };
  const payload = { iss, aud, sub: 'google-sub-1', email, email_verified: true, iat: now, exp: now + expInSeconds, nonce };
  const input = `${b64u(JSON.stringify(header))}.${b64u(JSON.stringify(payload))}`;
  return `${input}.${b64u(cryptoSign('RSA-SHA256', Buffer.from(input), privateKey))}`;
}

let mockEmail = 'reader@example.com';
let mockNonceMatches = true;
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
        const code = form.get('code');
        const nonce = codes.get(code);
        if (!codes.delete(code)) { res.writeHead(400, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: 'invalid_grant' })); return; }
        res.writeHead(200, { 'content-type': 'application/json' });
        const idToken = signIdToken({ email: mockEmail, aud: 'test-google-client', nonce: mockNonceMatches ? nonce : 'nonmatching-fixture' });
        res.end(JSON.stringify({ access_token: 'mock-google-access', id_token: idToken, token_type: 'Bearer', expires_in: 3600 }));
      });
      return;
    }
    if (url.pathname === '/tokeninfo') {
      if (url.searchParams.get('access_token') !== 'mock-google-access') {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid_token' }));
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ aud: 'test-google-client', email: mockEmail, email_verified: 'true', expires_in: 3600, sub: 'google-sub-1' }));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => { mockGooglePort = server.address().port; resolve(server); }));
}

async function freePort() {
  const server = createHttpServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

async function makeTempRepo() {
  const dir = await mkdtemp(path.join(tmpdir(), 'atlas-http-'));
  await cp(path.join(repo, 'data'), path.join(dir, 'data'), { recursive: true });
  await mkdir(path.join(dir, 'scripts'));
  await cp(path.join(repo, 'scripts/make-data.py'), path.join(dir, 'scripts/make-data.py'));
  return dir;
}

async function startMcpHttp({ write = false } = {}) {
  const dir = await makeTempRepo();
  const port = await freePort();
  const env = {
    ...process.env,
    GOOGLE_CLIENT_ID: 'test-google-client',
    GOOGLE_CLIENT_SECRET: 'test-google-secret',
    ATLAS_GOOGLE_ALLOWED_EMAILS: 'reader@example.com,writer@example.com',
    ATLAS_GOOGLE_WRITE_EMAILS: 'writer@example.com',
    GOOGLE_AUTH_URL: `http://127.0.0.1:${mockGooglePort}/o/oauth2/v2/auth`,
    GOOGLE_TOKEN_URL: `http://127.0.0.1:${mockGooglePort}/oauth2/v4/token`,
    GOOGLE_JWKS_URL: `http://127.0.0.1:${mockGooglePort}/oauth2/v3/certs`,
    GOOGLE_TOKENINFO_URL: `http://127.0.0.1:${mockGooglePort}/tokeninfo`,
    ATLAS_HTTP_BASE_URL: `http://127.0.0.1:${port}`,
  };
  const config = buildConfig(env, ['--repo', dir, ...(write ? ['--write'] : []), '--port', String(port)]);
  const { CatalogueStore } = await import('../store.mjs');
  const store = new CatalogueStore(config.root, { writeEnabled: config.writeEnabled });
  await store.snapshot();
  const handler = createHttpHandler(store, config);
  const server = createHttpServer(handler);
  await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
  return { server, dir, port, base: `http://127.0.0.1:${port}` };
}

test('buildConfig enables write mode from the environment for handler-mode hosts', () => {
  const base = {
    ATLAS_GOOGLE_CLIENT_ID: 'test-google-client',
    ATLAS_GOOGLE_ALLOWED_EMAILS: 'reader@example.com',
  };
  assert.equal(buildConfig({ ...base, ATLAS_MCP_WRITE_ENABLED: 'true' }, []).writeEnabled, true);
  assert.equal(buildConfig({ ...base, ATLAS_MCP_WRITE_ENABLED: ' TRUE ' }, []).writeEnabled, true);
  assert.equal(buildConfig({ ...base, ATLAS_MCP_WRITE_ENABLED: '1' }, []).writeEnabled, true);
  assert.equal(buildConfig({ ...base, ATLAS_MCP_WRITE_ENABLED: 'false' }, []).writeEnabled, false);
  assert.equal(buildConfig({ ...base, ATLAS_MCP_WRITE_ENABLED: 'enabled' }, []).writeEnabled, false);
  assert.equal(buildConfig({ ...base }, []).writeEnabled, false);
  assert.equal(buildConfig({ ...base }, ['--write']).writeEnabled, true);
  assert.equal(buildConfig({ ...base, ATLAS_MCP_WRITE_ENABLED: 'false' }, ['--write']).writeEnabled, true);
});

const decoded = result => JSON.parse(result.content[0].text);
const entry = {
  id: 'http-test', name: 'HTTP Test', org: 'Example Foundation', kind: 'Founder programmes', access: 'Direct',
  scope: ['UNKNOWN'], value: 'Not a real offer', summary: 'Fixture only.', eligibility: 'Fixture only.', limits: 'Fixture only.',
  url: 'https://example.com/http', status: 'Check intake', checked: '2026-01-01', extra: [], facts: {},
};
const provenance = { sourceUrls: [entry.url], reviewedOn: entry.checked, evidence: 'HTTP fixture only, never a real opportunity.' };

async function connectHttp(t, base, token) {
  const transport = new StreamableHTTPClientTransport(new URL(`${base}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${token}` } } });
  const client = new Client({ name: 'atlas-http-test-client', version: '1.0.0' });
  t.after(async () => { await client.close(); });
  await client.connect(transport);
  return client;
}

let mock;
let readOnly;
let writeServer;

test.before(async () => {
  clearJwksCache();
  mock = await startMockGoogle();
  readOnly = await startMcpHttp({ write: false });
  writeServer = await startMcpHttp({ write: true });
});

test.after(async () => {
  await new Promise(resolve => readOnly.server.close(resolve));
  await new Promise(resolve => writeServer.server.close(resolve));
  await new Promise(resolve => mock.close(resolve));
  await rm(readOnly.dir, { recursive: true, force: true });
  await rm(writeServer.dir, { recursive: true, force: true });
});

test('health and OAuth discovery metadata are public and point at this server', async () => {
  const health = await (await fetch(`${readOnly.base}/health`)).json();
  assert.equal(health.status, 'ok');
  assert.equal(health.tools, 17);
  assert.equal(health.githubIssuesConfigured, false);
  assert.equal(health.writeEnabled, false);
  assert.equal(health.auth, 'google-oauth');
  const as = await (await fetch(`${readOnly.base}/.well-known/oauth-authorization-server`)).json();
  assert.equal(as.issuer, readOnly.base);
  assert.equal(as.authorization_endpoint, `${readOnly.base}/oauth/authorize`);
  assert.equal(as.token_endpoint, `${readOnly.base}/oauth/token`);
  assert.deepEqual(as.code_challenge_methods_supported, ['S256']);
  const pr = await (await fetch(`${readOnly.base}/.well-known/oauth-protected-resource/mcp`)).json();
  assert.equal(pr.resource, `${readOnly.base}/mcp`);
  assert.deepEqual(pr.authorization_servers, [readOnly.base]);
});

test('unauthenticated, forged and unlisted Google identities are rejected before any tool runs', async () => {
  const noAuth = await fetch(`${readOnly.base}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  assert.equal(noAuth.status, 401);
  assert.match(noAuth.headers.get('www-authenticate'), /resource_metadata/);
  const forged = await fetch(`${readOnly.base}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json', Authorization: 'Bearer not-a-token' }, body: '{}' });
  assert.equal(forged.status, 401);
  const outsider = signIdToken({ email: 'outsider@example.com', aud: 'test-google-client' });
  const forbidden = await fetch(`${readOnly.base}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json', Authorization: `Bearer ${outsider}` }, body: '{}' });
  assert.equal(forbidden.status, 403);
  const expired = signIdToken({ email: 'reader@example.com', aud: 'test-google-client', expInSeconds: -60 });
  const stale = await fetch(`${readOnly.base}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json', Authorization: `Bearer ${expired}` }, body: '{}' });
  assert.equal(stale.status, 401);
});

test('a verified Google ID token and a Google access token both open the same 17 tools over HTTP', async t => {
  const idToken = signIdToken({ email: 'reader@example.com', aud: 'test-google-client' });
  const byId = await connectHttp(t, readOnly.base, idToken);
  const { tools } = await byId.listTools();
  assert.equal(tools.length, 17);
  assert.equal(decoded(await byId.callTool({ name: 'atlas_get_catalogue_info', arguments: {} })).writeEnabled, false);
  const byAccess = await connectHttp(t, readOnly.base, 'mock-google-access');
  assert.equal(decoded(await byAccess.callTool({ name: 'atlas_get_catalogue_info', arguments: {} })).opportunities >= 92, true);
});

test('atlas_create_issue over HTTP reports GITHUB_TOKEN_MISSING when no token is configured', async t => {
  const writerToken = signIdToken({ email: 'writer@example.com', aud: 'test-google-client' });
  const client = await connectHttp(t, writeServer.base, writerToken);
  const result = await client.callTool({ name: 'atlas_create_issue', arguments: { title: 'x', body: 'y' } });
  assert.equal(result.isError, true);
  assert.equal(decoded(result).code, 'GITHUB_TOKEN_MISSING');
});

test('read-only HTTP server rejects writes, and a read-only Google account cannot write even with --write', async t => {
  const readerToken = signIdToken({ email: 'reader@example.com', aud: 'test-google-client' });
  const writerToken = signIdToken({ email: 'writer@example.com', aud: 'test-google-client' });
  const readOnlyClient = await connectHttp(t, readOnly.base, writerToken);
  const validation = decoded(await readOnlyClient.callTool({ name: 'atlas_validate_opportunity', arguments: { entry, provenance } }));
  const denied = await readOnlyClient.callTool({ name: 'atlas_add_opportunity', arguments: { entry, provenance, expectedRevision: validation.revision } });
  assert.equal(denied.isError, true);
  assert.equal(decoded(denied).code, 'READ_ONLY');
  const writeClient = await connectHttp(t, writeServer.base, readerToken);
  const validation2 = decoded(await writeClient.callTool({ name: 'atlas_validate_opportunity', arguments: { entry, provenance } }));
  const forbidden = await writeClient.callTool({ name: 'atlas_add_opportunity', arguments: { entry, provenance, expectedRevision: validation2.revision } });
  assert.equal(forbidden.isError, true);
  assert.equal(decoded(forbidden).code, 'WRITE_FORBIDDEN');
});

test('an allow-listed writer can add over HTTP with --write, and the add is searchable', async t => {
  const writerToken = signIdToken({ email: 'writer@example.com', aud: 'test-google-client' });
  const client = await connectHttp(t, writeServer.base, writerToken);
  const validation = decoded(await client.callTool({ name: 'atlas_validate_opportunity', arguments: { entry, provenance } }));
  const added = await client.callTool({ name: 'atlas_add_opportunity', arguments: { entry, provenance, expectedRevision: validation.revision } });
  assert.equal(added.isError, undefined);
  assert.equal(decoded(added).status, 'added');
  assert.equal(decoded(await client.callTool({ name: 'atlas_search_opportunities', arguments: { query: 'HTTP Test' } })).total, 1);
});

test('dynamic client registration rejects non-https redirect URIs', async () => {
  const response = await fetch(`${readOnly.base}/oauth/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ redirect_uris: ['http://example.com/callback'] }) });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, 'invalid_redirect_uri');
});

test('MCP sessions are private to the account that opened them', async t => {
  const endpoint = new URL('/mcp', readOnly.base);
  const reader = signIdToken({ email: 'reader@example.com', aud: 'test-google-client' });
  const writer = signIdToken({ email: 'writer@example.com', aud: 'test-google-client' });
  const transport = new StreamableHTTPClientTransport(endpoint, { requestInit: { headers: { Authorization: `Bearer ${reader}` } } });
  const client = new Client({ name: 'atlas-http-isolation-test', version: '1.0.0' });
  t.after(async () => { await transport.terminateSession(); await client.close(); });
  await client.connect(transport);
  assert.ok(transport.sessionId);
  const otherAccount = await fetch(endpoint, {
    method: 'DELETE', headers: { 'mcp-session-id': transport.sessionId, Authorization: `Bearer ${writer}` },
  });
  assert.equal(otherAccount.status, 404);
  const crossOrigin = await fetch(endpoint, {
    method: 'DELETE', headers: { 'mcp-session-id': transport.sessionId, Authorization: `Bearer ${reader}`, Origin: 'https://other.example' },
  });
  assert.equal(crossOrigin.status, 403);
  assert.equal((await client.listTools()).tools.length, 17);
});

test('full OAuth code flow through mock Google issues a working MCP access token', async t => {
  const register = await fetch(`${readOnly.base}/oauth/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ redirect_uris: ['http://127.0.0.1:18999/callback'], client_name: 'http-test-client' }) });
  assert.equal(register.status, 201);
  const { client_id: clientId, client_secret: clientSecret } = await register.json();
  assert.ok(clientId.startsWith('atlas-'));
  assert.ok(clientSecret.length > 20);

  const verifier = b64u(randomBytes(32));
  const challenge = sha256B64u(verifier);

  async function runAuthorizeFlow(state, expectedCallbackStatus = 302) {
    const authorizeUrl = new URL(`${readOnly.base}/oauth/authorize`);
    authorizeUrl.searchParams.set('response_type', 'code');
    authorizeUrl.searchParams.set('client_id', clientId);
    authorizeUrl.searchParams.set('redirect_uri', 'http://127.0.0.1:18999/callback');
    authorizeUrl.searchParams.set('scope', 'openid email');
    authorizeUrl.searchParams.set('state', state);
    authorizeUrl.searchParams.set('code_challenge', challenge);
    authorizeUrl.searchParams.set('code_challenge_method', 'S256');
    authorizeUrl.searchParams.set('resource', `${readOnly.base}/mcp`);
    const authorize = await fetch(authorizeUrl, { redirect: 'manual' });
    assert.equal(authorize.status, 302);
    const googleLocation = authorize.headers.get('location');
    assert.match(googleLocation, new RegExp(`^http://127\\.0\\.0\\.1:${mockGooglePort}/o/oauth2/v2/auth`));
    assert.match(googleLocation, /client_id=test-google-client/);
    const googleRedirect = await fetch(googleLocation, { redirect: 'manual' });
    assert.equal(googleRedirect.status, 302);
    const callbackUrl = new URL(googleRedirect.headers.get('location'));
    assert.equal(callbackUrl.origin, readOnly.base);
    assert.equal(callbackUrl.pathname, '/oauth/callback');
    const callback = await fetch(callbackUrl, { redirect: 'manual' });
    assert.equal(callback.status, expectedCallbackStatus);
    if (expectedCallbackStatus !== 302) {
      assert.match((await callback.json()).error_description, /nonce did not match/);
      return null;
    }
    const clientRedirect = new URL(callback.headers.get('location'));
    assert.equal(clientRedirect.origin, 'http://127.0.0.1:18999');
    assert.equal(clientRedirect.searchParams.get('state'), state);
    return clientRedirect.searchParams.get('code');
  }

  mockNonceMatches = false;
  try {
    await runAuthorizeFlow('nonce-check', 502);
  } finally {
    mockNonceMatches = true;
  }

  // The bad-verifier attempt consumes the single-use code, so each exchange
  // below uses a fresh code from a fresh authorize round.
  const firstCode = await runAuthorizeFlow('test-state');
  assert.ok(firstCode);
  const badVerifier = await fetch(`${readOnly.base}/oauth/token`, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', Authorization: `Basic ${b64u(`${clientId}:${clientSecret}`)}` },
    body: new URLSearchParams({ grant_type: 'authorization_code', code: firstCode, redirect_uri: 'http://127.0.0.1:18999/callback', code_verifier: 'wrong-verifier' }),
  });
  assert.equal(badVerifier.status, 400);
  assert.equal((await badVerifier.json()).error, 'invalid_grant');

  const code = await runAuthorizeFlow('test-state-2');
  assert.ok(code);

  const tokenResponse = await fetch(`${readOnly.base}/oauth/token`, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', Authorization: `Basic ${b64u(`${clientId}:${clientSecret}`)}` },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: 'http://127.0.0.1:18999/callback', code_verifier: verifier }),
  });
  assert.equal(tokenResponse.status, 200);
  const tokens = await tokenResponse.json();
  assert.equal(tokens.token_type, 'Bearer');
  assert.equal(tokens.expires_in, 3600);
  assert.ok(tokens.refresh_token);

  const client = await connectHttp(t, readOnly.base, tokens.access_token);
  const { tools } = await client.listTools();
  assert.equal(tools.length, 17);

  const refreshed = await fetch(`${readOnly.base}/oauth/token`, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', Authorization: `Basic ${b64u(`${clientId}:${clientSecret}`)}` },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token }),
  });
  assert.equal(refreshed.status, 200);
  assert.ok((await refreshed.json()).access_token);

  const revoked = await fetch(`${readOnly.base}/oauth/revoke`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: tokens.access_token }) });
  assert.equal(revoked.status, 200);
  const afterRevoke = await fetch(`${readOnly.base}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json', Authorization: `Bearer ${tokens.access_token}` }, body: '{}' });
  assert.equal(afterRevoke.status, 401);
});

test('Google sign-in for an account outside the allow-list is refused at the callback', async () => {
  mockEmail = 'outsider@example.com';
  try {
    const register = await fetch(`${readOnly.base}/oauth/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ redirect_uris: ['http://127.0.0.1:18999/callback'] }) });
    const { client_id: clientId } = await register.json();
    const verifier = b64u(randomBytes(32));
    const authorizeUrl = new URL(`${readOnly.base}/oauth/authorize`);
    authorizeUrl.searchParams.set('response_type', 'code');
    authorizeUrl.searchParams.set('client_id', clientId);
    authorizeUrl.searchParams.set('redirect_uri', 'http://127.0.0.1:18999/callback');
    authorizeUrl.searchParams.set('state', 'deny-state');
    authorizeUrl.searchParams.set('code_challenge', sha256B64u(verifier));
    authorizeUrl.searchParams.set('code_challenge_method', 'S256');
    const authorize = await fetch(authorizeUrl, { redirect: 'manual' });
    const googleRedirect = await fetch(authorize.headers.get('location'), { redirect: 'manual' });
    const callback = await fetch(googleRedirect.headers.get('location'), { redirect: 'manual' });
    assert.equal(callback.status, 302);
    const clientRedirect = new URL(callback.headers.get('location'));
    assert.equal(clientRedirect.searchParams.get('error'), 'access_denied');
  } finally {
    mockEmail = 'reader@example.com';
  }
});
