#!/usr/bin/env node
/**
 * Startup Atlas MCP over HTTP with Google OAuth.
 *
 * The same 18 tools as the stdio server (backend/mcp/server.mjs), exposed
 * over Streamable HTTP at /mcp, behind OAuth 2.0 where Google is the
 * identity provider:
 *
 * - This server is its own OAuth authorization server for MCP clients
 *   (dynamic client registration, authorization-code flow with PKCE, token
 *   and revocation endpoints, plus the standard discovery metadata).
 * - The Google leg is a standard authorization-code exchange: the user
 *   signs in with Google, Google returns an ID token, this server verifies
 *   it against Google's JWKS and only then issues an MCP access token.
 * - Clients may also call /mcp directly with a Google ID token as the
 *   Bearer token; it is verified the same way.
 *
 * Access control is fail-closed and layered:
 * 1. No Bearer token, or a token that does not verify, is rejected (401).
 * 2. A verified Google account must be in ATLAS_GOOGLE_ALLOWED_EMAILS to
 *    call any tool (403 otherwise). An unset list allows nobody.
 * 3. The four write tools additionally require write mode (--write, or
 *    ATLAS_MCP_WRITE_ENABLED=true on handler-mode hosts that cannot
 *    pass CLI flags) AND an email in
 *    ATLAS_GOOGLE_WRITE_EMAILS (403 WRITE_FORBIDDEN otherwise).
 *    `atlas_create_issue` additionally needs ATLAS_GITHUB_TOKEN; without
 *    it the tool reports GITHUB_TOKEN_MISSING and files nothing.
 *
 * A separate admin MCP surface lives at /mcp/admin (admin-mcp.mjs): the
 * same Bearer verification, but the identity must additionally be on
 * the admin allow-list, and it exposes only the review-queue tools so
 * the assistant can decide queue items itself (decided_by
 * 'agent-review') through the panel's write-back path.
 *
 * /mcp/admin additionally accepts a service credential: when
 * ATLAS_ADMIN_SERVICE_TOKEN is set, a Bearer token matching it
 * (constant-time comparison) authenticates as the service identity
 * (authMethod 'service-token'). This exists because the agent review
 * pass runs unattended: Google sign-in for the admin account is
 * passkey-only interactively, and every OAuth client registration and
 * refresh token lives only in this process's memory, so a redeploy
 * kills the OAuth chain. The credential is scoped to /mcp/admin ONLY
 * — it is never consulted on /mcp or the admin panel — and when the
 * variable is unset the surface behaves exactly as before.
 *
 * Nothing here triggers a crawl, fetches a source, shells out or runs
 * Git. The crawl registry stays advisory, exactly as in the stdio
 * server. The one exception is `atlas_create_issue`, which calls the
 * GitHub REST API (never the git binary) to file an issue — only when
 * --write is on, the caller may write, and ATLAS_GITHUB_TOKEN is set.
 * No secret is ever hard-coded: GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET
 * come from the environment (see docs/MCP-HTTP.md for the Google Cloud
 * Console setup). Tokens and OAuth state live only in memory.
 */
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CatalogueStore } from './store.mjs';
import { createServer, WRITE_TOOLS } from './server.mjs';
import { createAdmin } from './admin.mjs';
import { ADMIN_TOOLS, createAdminServer } from './admin-mcp.mjs';
import {
  GOOGLE_JWKS_URL,
  GOOGLE_TOKENINFO_URL,
  clearJwksCache,
  isEmailAllowed,
  parseEmailAllowList,
  resolveGoogleIdentity,
  secretsEqual,
  verifyGoogleIdToken,
} from './google-auth.mjs';

const GOOGLE_AUTH_URL_DEFAULT = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL_DEFAULT = 'https://oauth2.googleapis.com/token';
const ACCESS_TOKEN_TTL_SECONDS = 3600;
const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 3600;
const AUTH_CODE_TTL_SECONDS = 600;
const LOGIN_SESSION_TTL_SECONDS = 600;
const ACCESS_TOKEN_PREFIX = 'atlas-access-';

const base64url = buffer => Buffer.from(buffer).toString('base64url');
const randomToken = (bytes = 32) => base64url(randomBytes(bytes));
const sha256Base64url = value => base64url(createHash('sha256').update(value).digest());

export function buildConfig(env = process.env, argv = process.argv.slice(2)) {
  let root = fileURLToPath(new URL('../../', import.meta.url));
  // Handler-mode hosts (DeepHost) import the root server.js and cannot
  // pass CLI flags, so write mode can also be enabled from the
  // environment. Only an explicit truthy value enables it; anything
  // else — including an unset variable — fails closed, exactly like a
  // missing --write flag.
  let writeEnabled = ['1', 'true', 'yes'].includes(
    String(env.ATLAS_MCP_WRITE_ENABLED ?? '').trim().toLowerCase());
  let host = env.ATLAS_HTTP_HOST ?? '0.0.0.0';
  let port = Number(env.PORT ?? env.ATLAS_HTTP_PORT ?? 3000);
  for (let index = 0; index < argv.length; index++) {
    if (argv[index] === '--write') writeEnabled = true;
    else if (argv[index] === '--repo' && argv[index + 1]) root = path.resolve(argv[++index]);
    else if (argv[index] === '--port' && argv[index + 1]) port = Number(argv[++index]);
    else if (argv[index] === '--host' && argv[index + 1]) host = argv[++index];
    else throw new Error('Usage: node backend/mcp/http-server.mjs [--repo /absolute/path/to/startup-atlas] [--write] [--host 127.0.0.1] [--port 3000]');
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid --port / PORT / ATLAS_HTTP_PORT.');
  const baseUrl = (env.ATLAS_HTTP_BASE_URL ?? `http://${host}:${port}`).replace(/\/$/, '');
  return {
    root, writeEnabled, host, port, baseUrl,
    // ATLAS_GOOGLE_* is the primary name: DeepHost's runtime strips any
    // GOOGLE_* variable from a handler worker's environment (its reserved
    // prefix list), so GOOGLE_CLIENT_ID set in the console never reaches
    // the process. GOOGLE_* remains as the local-dev fallback.
    googleClientId: env.ATLAS_GOOGLE_CLIENT_ID ?? env.GOOGLE_CLIENT_ID ?? '',
    googleClientSecret: env.ATLAS_GOOGLE_CLIENT_SECRET ?? env.GOOGLE_CLIENT_SECRET ?? '',
    googleAuthUrl: env.ATLAS_GOOGLE_AUTH_URL ?? env.GOOGLE_AUTH_URL ?? GOOGLE_AUTH_URL_DEFAULT,
    googleTokenUrl: env.ATLAS_GOOGLE_TOKEN_URL ?? env.GOOGLE_TOKEN_URL ?? GOOGLE_TOKEN_URL_DEFAULT,
    googleJwksUrl: env.ATLAS_GOOGLE_JWKS_URL ?? env.GOOGLE_JWKS_URL ?? GOOGLE_JWKS_URL,
    googleTokeninfoUrl: env.ATLAS_GOOGLE_TOKENINFO_URL ?? env.GOOGLE_TOKENINFO_URL ?? GOOGLE_TOKENINFO_URL,
    allowedEmails: parseEmailAllowList(env.ATLAS_GOOGLE_ALLOWED_EMAILS),
    writeEmails: parseEmailAllowList(env.ATLAS_GOOGLE_WRITE_EMAILS),
    // Admin panel allow-list: ATLAS_ADMIN_EMAILS when set, otherwise the
    // MCP write allow-list (in production both name the owner only).
    adminEmails: parseEmailAllowList(env.ATLAS_ADMIN_EMAILS) ?? parseEmailAllowList(env.ATLAS_GOOGLE_WRITE_EMAILS),
    // Service credential for /mcp/admin only (see the header comment).
    // Empty/unset disables it — fail-closed, no behaviour change.
    adminServiceToken: env.ATLAS_ADMIN_SERVICE_TOKEN ?? '',
    githubToken: env.ATLAS_GITHUB_TOKEN ?? '',
    // Where the admin panel reads/writes data/review-queue.json through
    // the GitHub Contents API. The API base is overridable for tests,
    // like the GOOGLE_*_URL overrides.
    githubRepo: env.ATLAS_GITHUB_REPO ?? 'castlemilk/startup-atlas',
    githubBranch: env.ATLAS_GITHUB_BRANCH ?? 'main',
    githubApiBase: env.ATLAS_GITHUB_API_BASE ?? 'https://api.github.com',
    fetchImpl: fetch,
  };
}

function validateConfig(config) {
  const problems = [];
  if (!config.googleClientId) problems.push('ATLAS_GOOGLE_CLIENT_ID (or GOOGLE_CLIENT_ID) is not set.');
  if (!config.allowedEmails) problems.push('ATLAS_GOOGLE_ALLOWED_EMAILS is not set (an unset list allows nobody).');
  if (problems.length > 0) throw new Error(`HTTP MCP server is not configured: ${problems.join(' ')}`);
}

/** In-memory OAuth state. Single instance only; nothing is persisted. */
export function createOAuthStores() {
  return {
    clients: new Map(), // clientId -> { clientId, clientSecret, redirectUris, createdAt }
    loginSessions: new Map(), // loginId -> { clientId, redirectUri, state, codeChallenge, scope, resource, createdAt, googleVerifier }
    authCodes: new Map(), // code -> { clientId, redirectUri, codeChallenge, email, sub, scopes, resource, expiresAt }
    accessTokens: new Map(), // token -> { email, sub, clientId, scopes, resource, expiresAt }
    refreshTokens: new Map(), // token -> { email, sub, clientId, scopes, resource, expiresAt }
  };
}

function sweep(stores, now = Date.now()) {
  for (const [key, value] of stores.loginSessions) if (value.createdAt + LOGIN_SESSION_TTL_SECONDS * 1000 <= now) stores.loginSessions.delete(key);
  for (const [key, value] of stores.authCodes) if (value.expiresAt <= now) stores.authCodes.delete(key);
  for (const [key, value] of stores.accessTokens) if (value.expiresAt <= now) stores.accessTokens.delete(key);
  for (const [key, value] of stores.refreshTokens) if (value.expiresAt <= now) stores.refreshTokens.delete(key);
}

function sendJson(res, status, body, extraHeaders = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', ...extraHeaders });
  res.end(payload);
}

function sendOAuthError(res, status, error, description) {
  sendJson(res, status, { error, ...(description ? { error_description: description } : {}) });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > 1024 * 1024) { reject(new Error('Request body too large.')); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function readJsonBody(req) {
  const text = await readBody(req);
  if (!text) return {};
  try { return JSON.parse(text); } catch { throw Object.assign(new Error('Request body is not valid JSON.'), { status: 400 }); }
}

async function readFormBody(req) {
  const text = await readBody(req);
  return new URLSearchParams(text);
}

function isLoopbackRedirect(uri) {
  try {
    const url = new URL(uri);
    return (url.protocol === 'http:' && (url.hostname === '127.0.0.1' || url.hostname === 'localhost' || url.hostname === '[::1]')) || url.protocol === 'https:';
  } catch { return false; }
}

export function createHttpHandler(store, config, stores = createOAuthStores()) {
  validateConfig(config);
  const sessions = new Map();
  const adminSessions = new Map();
  const issuer = new URL(config.baseUrl);
  const mcpResource = `${config.baseUrl}/mcp`;
  const adminMcpResource = `${config.baseUrl}/mcp/admin`;
  const scopesSupported = ['openid', 'email', 'profile'];
  const resourceMetadataUrl = `${config.baseUrl}/.well-known/oauth-protected-resource/mcp`;
  const adminResourceMetadataUrl = `${config.baseUrl}/.well-known/oauth-protected-resource/mcp/admin`;
  const sweepTimer = setInterval(() => sweep(stores), 5 * 60 * 1000);
  sweepTimer.unref();

  const oauthEnabled = Boolean(config.googleClientSecret);
  if (!oauthEnabled) console.error('Warning: GOOGLE_CLIENT_SECRET is not set. The /oauth/* authorization-code flow is disabled; /mcp still accepts verified Google ID tokens.');
  const admin = createAdmin({ config });

  function issueTokens(email, sub, clientId, scopes, resource) {
    const now = Date.now();
    const accessToken = ACCESS_TOKEN_PREFIX + randomToken();
    const refreshToken = randomToken();
    stores.accessTokens.set(accessToken, { email, sub, clientId, scopes, resource, expiresAt: now + ACCESS_TOKEN_TTL_SECONDS * 1000 });
    stores.refreshTokens.set(refreshToken, { email, sub, clientId, scopes, resource, expiresAt: now + REFRESH_TOKEN_TTL_SECONDS * 1000 });
    return { access_token: accessToken, token_type: 'Bearer', expires_in: ACCESS_TOKEN_TTL_SECONDS, refresh_token: refreshToken, scope: scopes.join(' ') };
  }

  /** Resolve a Bearer value to { email, sub, clientId, scopes, source } or null. */
  async function resolveBearer(token) {
    const now = Date.now();
    const issued = stores.accessTokens.get(token);
    if (issued) {
      if (issued.expiresAt <= now) { stores.accessTokens.delete(token); return null; }
      return { email: issued.email, sub: issued.sub, clientId: issued.clientId, scopes: issued.scopes, source: 'mcp-oauth' };
    }
    if (token.startsWith(ACCESS_TOKEN_PREFIX)) return null;
    try {
      const identity = await resolveGoogleIdentity(token, { clientId: config.googleClientId, fetchImpl: config.fetchImpl, jwksUrl: config.googleJwksUrl, tokeninfoUrl: config.googleTokeninfoUrl });
      return { email: identity.email, sub: identity.sub, clientId: 'google', scopes: scopesSupported, source: identity.method };
    } catch {
      return null;
    }
  }

  async function authenticate(req, res) {
    const header = req.headers.authorization ?? '';
    const match = /^Bearer\s+(\S+)$/.exec(header);
    if (!match) {
      res.writeHead(401, { 'www-authenticate': `Bearer resource_metadata="${resourceMetadataUrl}", error="invalid_token", error_description="A Bearer token is required."`, 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'unauthorized', message: 'A Bearer token is required. Authenticate with Google first; see docs/MCP-HTTP.md.' }));
      return null;
    }
    const identity = await resolveBearer(match[1]);
    if (!identity) {
      res.writeHead(401, { 'www-authenticate': `Bearer resource_metadata="${resourceMetadataUrl}", error="invalid_token", error_description="The Bearer token did not verify."`, 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'unauthorized', message: 'The Bearer token did not verify as a Google identity or an issued MCP token.' }));
      return null;
    }
    if (!isEmailAllowed(identity.email, config.allowedEmails)) {
      sendJson(res, 403, { error: 'forbidden', message: 'This Google account is outside the allowed list.' });
      return null;
    }
    return {
      token: match[1], clientId: identity.clientId, scopes: identity.scopes,
      expiresAt: undefined, extra: { email: identity.email, sub: identity.sub, authMethod: identity.source },
    };
  }

  // The service identity the ATLAS_ADMIN_SERVICE_TOKEN credential
  // authenticates as. The email is a synthetic .invalid address: it can
  // never be a real Google account, so it can never collide with — or
  // be impersonated by — the OAuth path, and queue decisions stay
  // attributed decided_by 'agent-review' by admin-mcp.mjs regardless
  // of which credential presented.
  const ADMIN_SERVICE_EMAIL = 'agent-review@service.atlas.invalid';
  const ADMIN_SERVICE_SUB = 'service:agent-review';

  /**
   * The admin MCP's gate is stricter than /mcp's: the Bearer token must
   * verify the same way, but the identity must be on the ADMIN
   * allow-list (ATLAS_ADMIN_EMAILS, falling back to
   * ATLAS_GOOGLE_WRITE_EMAILS) — an ordinary allow-listed reader gets
   * 403 here. Fail-closed exactly like the panel's callback check.
   *
   * One exception, checked first and only here: the service credential
   * (ATLAS_ADMIN_SERVICE_TOKEN). It exists for the unattended agent
   * review pass, whose operator cannot do an interactive passkey
   * sign-in per run and whose OAuth registrations/refresh tokens die
   * with this process on every redeploy. It is scoped to this surface
   * only — authenticate() for /mcp never consults it — and unset means
   * off. The comparison is constant-time (secretsEqual).
   */
  async function authenticateAdmin(req, res) {
    const header = req.headers.authorization ?? '';
    const match = /^Bearer\s+(\S+)$/.exec(header);
    if (!match) {
      res.writeHead(401, { 'www-authenticate': `Bearer resource_metadata="${adminResourceMetadataUrl}", error="invalid_token", error_description="A Bearer token is required."`, 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'unauthorized', message: 'A Bearer token is required. Authenticate with Google first; see docs/MCP-HTTP.md.' }));
      return null;
    }
    if (config.adminServiceToken && secretsEqual(match[1], config.adminServiceToken)) {
      console.error(JSON.stringify({ event: 'admin_auth', surface: '/mcp/admin', method: 'service-token', identity: ADMIN_SERVICE_SUB }));
      return {
        token: match[1], clientId: 'service', scopes: scopesSupported,
        expiresAt: undefined, extra: { email: ADMIN_SERVICE_EMAIL, sub: ADMIN_SERVICE_SUB, authMethod: 'service-token' },
      };
    }
    const identity = await resolveBearer(match[1]);
    if (!identity) {
      res.writeHead(401, { 'www-authenticate': `Bearer resource_metadata="${adminResourceMetadataUrl}", error="invalid_token", error_description="The Bearer token did not verify."`, 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'unauthorized', message: 'The Bearer token did not verify as a Google identity or an issued MCP token.' }));
      return null;
    }
    if (!isEmailAllowed(identity.email, config.adminEmails)) {
      sendJson(res, 403, { error: 'forbidden', message: 'This Google account is not the Atlas admin. The admin MCP serves the admin account only.' });
      return null;
    }
    return {
      token: match[1], clientId: identity.clientId, scopes: identity.scopes,
      expiresAt: undefined, extra: { email: identity.email, sub: identity.sub, authMethod: identity.source },
    };
  }

  async function handleAdminMcp(req, res) {
    if (req.headers.origin && req.headers.origin !== issuer.origin) {
      sendJson(res, 403, { error: 'forbidden', message: 'Unrecognized Origin for this MCP endpoint.' });
      return;
    }
    const authInfo = await authenticateAdmin(req, res);
    if (!authInfo) return;
    const sessionId = req.headers['mcp-session-id'];
    const { clientId, extra: { email, sub } } = authInfo;
    let session = typeof sessionId === 'string' ? adminSessions.get(sessionId) : undefined;
    if (sessionId !== undefined && (!session || session.clientId !== clientId || session.email !== email || session.sub !== sub)) {
      sendJson(res, 404, { error: 'not_found', message: 'Unknown MCP session id.' });
      return;
    }
    req.auth = authInfo;
    if (req.method === 'POST') {
      let body;
      try { body = await readJsonBody(req); } catch (error) { sendJson(res, 400, { error: 'bad_request', message: error.message }); return; }
      if (!session) {
        const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => randomUUID() });
        const server = createAdminServer({ config });
        transport.onclose = () => { if (transport.sessionId) adminSessions.delete(transport.sessionId); };
        await server.connect(transport);
        session = { transport, clientId, email, sub };
      }
      await session.transport.handleRequest(req, res, body);
      if (session.transport.sessionId) adminSessions.set(session.transport.sessionId, session);
      return;
    }
    if (req.method === 'GET' || req.method === 'DELETE') {
      if (!session) { sendJson(res, 404, { error: 'not_found', message: 'Unknown MCP session id.' }); return; }
      await session.transport.handleRequest(req, res);
      return;
    }
    sendJson(res, 405, { error: 'method_not_allowed', message: 'Use POST, GET or DELETE on /mcp/admin.' });
  }

  function writeAuthorizer(authInfo, toolName) {
    // A read-only server lets the stores report READ_ONLY themselves; the
    // HTTP layer only adds the per-account check when writes are enabled.
    if (!store.writeEnabled) return true;
    const email = authInfo?.extra?.email;
    if (!isEmailAllowed(email, config.writeEmails)) return false;
    return WRITE_TOOLS.includes(toolName);
  }

  async function handleMcp(req, res) {
    if (req.headers.origin && req.headers.origin !== issuer.origin) {
      sendJson(res, 403, { error: 'forbidden', message: 'Unrecognized Origin for this MCP endpoint.' });
      return;
    }
    const authInfo = await authenticate(req, res);
    if (!authInfo) return;
    const sessionId = req.headers['mcp-session-id'];
    const { clientId, extra: { email, sub } } = authInfo;
    let session = typeof sessionId === 'string' ? sessions.get(sessionId) : undefined;
    if (sessionId !== undefined && (!session || session.clientId !== clientId || session.email !== email || session.sub !== sub)) {
      sendJson(res, 404, { error: 'not_found', message: 'Unknown MCP session id.' });
      return;
    }
    req.auth = authInfo;
    if (req.method === 'POST') {
      let body;
      try { body = await readJsonBody(req); } catch (error) { sendJson(res, 400, { error: 'bad_request', message: error.message }); return; }
      if (!session) {
        const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => randomUUID() });
        const server = createServer(store, { writeAuthorizer, githubToken: config.githubToken });
        transport.onclose = () => { if (transport.sessionId) sessions.delete(transport.sessionId); };
        await server.connect(transport);
        session = { transport, clientId, email, sub };
      }
      await session.transport.handleRequest(req, res, body);
      if (session.transport.sessionId) sessions.set(session.transport.sessionId, session);
      return;
    }
    if (req.method === 'GET' || req.method === 'DELETE') {
      if (!session) { sendJson(res, 404, { error: 'not_found', message: 'Unknown MCP session id.' }); return; }
      await session.transport.handleRequest(req, res);
      return;
    }
    sendJson(res, 405, { error: 'method_not_allowed', message: 'Use POST, GET or DELETE on /mcp.' });
  }

  function oauthMetadata() {
    return {
      issuer: config.baseUrl,
      authorization_endpoint: `${config.baseUrl}/oauth/authorize`,
      token_endpoint: `${config.baseUrl}/oauth/token`,
      registration_endpoint: `${config.baseUrl}/oauth/register`,
      revocation_endpoint: `${config.baseUrl}/oauth/revoke`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      scopes_supported: scopesSupported,
      token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post'],
      revocation_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post'],
    };
  }

  async function handleRegister(req, res) {
    if (!oauthEnabled) { sendOAuthError(res, 503, 'temporarily_unavailable', 'GOOGLE_CLIENT_SECRET is not configured, so the OAuth flow is disabled.'); return; }
    let body;
    try { body = await readJsonBody(req); } catch (error) { sendOAuthError(res, 400, 'invalid_request', error.message); return; }
    if (!Array.isArray(body.redirect_uris) || body.redirect_uris.length === 0 || !body.redirect_uris.every(uri => typeof uri === 'string' && isLoopbackRedirect(uri))) {
      sendOAuthError(res, 400, 'invalid_redirect_uri', 'redirect_uris must be a non-empty list of https URLs, or http loopback URLs for native clients.');
      return;
    }
    const clientId = `atlas-${randomToken(16)}`;
    const clientSecret = randomToken();
    stores.clients.set(clientId, { clientId, clientSecret, redirectUris: body.redirect_uris, createdAt: Date.now() });
    sendJson(res, 201, {
      client_id: clientId, client_secret: clientSecret, client_id_issued_at: Math.floor(Date.now() / 1000),
      redirect_uris: body.redirect_uris, grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'],
      token_endpoint_auth_method: 'client_secret_basic', client_name: body.client_name ?? undefined,
    });
  }

  async function handleAuthorize(req, res, url) {
    if (!oauthEnabled) { sendOAuthError(res, 503, 'temporarily_unavailable', 'GOOGLE_CLIENT_SECRET is not configured, so the OAuth flow is disabled.'); return; }
    const params = url.searchParams;
    const client = stores.clients.get(params.get('client_id') ?? '');
    if (!client) { sendOAuthError(res, 400, 'invalid_client', 'Unknown client_id. Register first at POST /oauth/register.'); return; }
    const redirectUri = params.get('redirect_uri') ?? '';
    if (!client.redirectUris.includes(redirectUri)) { sendOAuthError(res, 400, 'invalid_request', 'redirect_uri does not match a registered redirect URI.'); return; }
    if (params.get('response_type') !== 'code') { sendOAuthError(res, 400, 'unsupported_response_type', 'Only response_type=code is supported.'); return; }
    const codeChallenge = params.get('code_challenge') ?? '';
    if (params.get('code_challenge_method') !== 'S256' || !codeChallenge) { sendOAuthError(res, 400, 'invalid_request', 'PKCE code_challenge with method S256 is required.'); return; }
    const resource = params.get('resource');
    if (resource && resource !== mcpResource && resource !== adminMcpResource && resource !== config.baseUrl) {
      sendOAuthError(res, 400, 'invalid_target', `resource must be ${mcpResource} or ${adminMcpResource}.`);
      return;
    }
    const scope = (params.get('scope') ?? '').split(/\s+/).filter(Boolean);
    if (scope.length > 0 && scope.some(item => !scopesSupported.includes(item))) { sendOAuthError(res, 400, 'invalid_scope', `Supported scopes: ${scopesSupported.join(' ')}.`); return; }
    const loginId = randomToken();
    const googleVerifier = randomToken(32);
    const nonce = randomToken(16);
    stores.loginSessions.set(loginId, {
      clientId: client.clientId, redirectUri, state: params.get('state') ?? '', codeChallenge,
      scope: scope.length > 0 ? scope : scopesSupported, resource: mcpResource, createdAt: Date.now(), googleVerifier, nonce,
    });
    const googleUrl = new URL(config.googleAuthUrl);
    googleUrl.searchParams.set('response_type', 'code');
    googleUrl.searchParams.set('client_id', config.googleClientId);
    googleUrl.searchParams.set('redirect_uri', `${config.baseUrl}/oauth/callback`);
    googleUrl.searchParams.set('scope', 'openid email profile');
    googleUrl.searchParams.set('state', loginId);
    googleUrl.searchParams.set('nonce', nonce);
    googleUrl.searchParams.set('code_challenge', sha256Base64url(googleVerifier));
    googleUrl.searchParams.set('code_challenge_method', 'S256');
    googleUrl.searchParams.set('access_type', 'offline');
    res.writeHead(302, { location: googleUrl.toString() });
    res.end();
  }

  async function handleCallback(req, res, url) {
    if (!oauthEnabled) { sendOAuthError(res, 503, 'temporarily_unavailable', 'GOOGLE_CLIENT_SECRET is not configured, so the OAuth flow is disabled.'); return; }
    const params = url.searchParams;
    const state = params.get('state') ?? '';
    const login = stores.loginSessions.get(state);
    stores.loginSessions.delete(state);
    if (!login || login.createdAt + LOGIN_SESSION_TTL_SECONDS * 1000 <= Date.now()) {
      sendOAuthError(res, 400, 'invalid_request', 'Unknown or expired login session. Start again at /oauth/authorize.');
      return;
    }
    if (params.get('error')) {
      const target = new URL(login.redirectUri);
      target.searchParams.set('error', 'access_denied');
      target.searchParams.set('error_description', params.get('error_description') ?? 'Google sign-in was not completed.');
      if (login.state) target.searchParams.set('state', login.state);
      res.writeHead(302, { location: target.toString() });
      res.end();
      return;
    }
    const code = params.get('code') ?? '';
    if (!code) { sendOAuthError(res, 400, 'invalid_request', 'Google returned no authorization code.'); return; }
    let tokens;
    try {
      const body = new URLSearchParams({
        code, client_id: config.googleClientId, client_secret: config.googleClientSecret,
        redirect_uri: `${config.baseUrl}/oauth/callback`, grant_type: 'authorization_code', code_verifier: login.googleVerifier,
      });
      const response = await config.fetchImpl(config.googleTokenUrl, {
        method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body,
      });
      if (!response.ok) throw new Error(`Google token exchange failed (${response.status}).`);
      tokens = await response.json();
    } catch (error) {
      sendOAuthError(res, 502, 'server_error', `Could not exchange the Google authorization code: ${error.message}`);
      return;
    }
    if (!tokens.id_token) { sendOAuthError(res, 502, 'server_error', 'Google returned no ID token.'); return; }
    let identity;
    try {
      identity = await verifyGoogleIdToken(tokens.id_token, {
        clientId: config.googleClientId, nonce: login.nonce, fetchImpl: config.fetchImpl, jwksUrl: config.googleJwksUrl,
      });
    } catch (error) {
      sendOAuthError(res, 502, 'server_error', `Could not verify the Google ID token: ${error.message}`);
      return;
    }
    if (!isEmailAllowed(identity.email, config.allowedEmails)) {
      const target = new URL(login.redirectUri);
      target.searchParams.set('error', 'access_denied');
      target.searchParams.set('error_description', 'This Google account is outside the allowed list.');
      if (login.state) target.searchParams.set('state', login.state);
      res.writeHead(302, { location: target.toString() });
      res.end();
      return;
    }
    const authCode = randomToken();
    stores.authCodes.set(authCode, {
      clientId: login.clientId, redirectUri: login.redirectUri, codeChallenge: login.codeChallenge,
      email: identity.email, sub: identity.sub, scopes: login.scope, resource: login.resource,
      expiresAt: Date.now() + AUTH_CODE_TTL_SECONDS * 1000,
    });
    const target = new URL(login.redirectUri);
    target.searchParams.set('code', authCode);
    if (login.state) target.searchParams.set('state', login.state);
    res.writeHead(302, { location: target.toString() });
    res.end();
  }

  async function readClientAuth(req, form) {
    const header = req.headers.authorization ?? '';
    const basic = /^Basic\s+(\S+)$/.exec(header);
    if (basic) {
      const decoded = Buffer.from(basic[1], 'base64').toString('utf8');
      const separator = decoded.indexOf(':');
      if (separator > 0) return { clientId: decoded.slice(0, separator), clientSecret: decoded.slice(separator + 1) };
    }
    return { clientId: form.get('client_id') ?? '', clientSecret: form.get('client_secret') ?? '' };
  }

  async function handleToken(req, res) {
    if (!oauthEnabled) { sendOAuthError(res, 503, 'temporarily_unavailable', 'GOOGLE_CLIENT_SECRET is not configured, so the OAuth flow is disabled.'); return; }
    let form;
    try { form = await readFormBody(req); } catch (error) { sendOAuthError(res, 400, 'invalid_request', error.message); return; }
    const grantType = form.get('grant_type') ?? '';
    const { clientId, clientSecret } = await readClientAuth(req, form);
    const client = stores.clients.get(clientId);
    if (!client || !secretsEqual(clientSecret, client.clientSecret)) { sendOAuthError(res, 401, 'invalid_client', 'Unknown client or wrong client_secret.'); return; }
    if (grantType === 'authorization_code') {
      const code = form.get('code') ?? '';
      const record = stores.authCodes.get(code);
      if (!record || record.expiresAt <= Date.now()) {
        sendOAuthError(res, 400, 'invalid_grant', 'Unknown or expired authorization code.');
        return;
      }
      stores.authCodes.delete(code);
      if (record.clientId !== clientId) { sendOAuthError(res, 400, 'invalid_grant', 'Authorization code was issued to a different client.'); return; }
      if (record.redirectUri !== (form.get('redirect_uri') ?? '')) { sendOAuthError(res, 400, 'invalid_grant', 'redirect_uri does not match the authorization request.'); return; }
      const verifier = form.get('code_verifier') ?? '';
      if (!verifier || sha256Base64url(verifier) !== record.codeChallenge) { sendOAuthError(res, 400, 'invalid_grant', 'PKCE code_verifier does not match the code_challenge.'); return; }
      const tokens = issueTokens(record.email, record.sub, clientId, record.scopes, record.resource);
      sendJson(res, 200, tokens);
      return;
    }
    if (grantType === 'refresh_token') {
      const presented = form.get('refresh_token') ?? '';
      const record = stores.refreshTokens.get(presented);
      if (!record || record.clientId !== clientId || record.expiresAt <= Date.now()) {
        sendOAuthError(res, 400, 'invalid_grant', 'Unknown or expired refresh token.');
        return;
      }
      stores.refreshTokens.delete(presented);
      const scope = (form.get('scope') ?? '').split(/\s+/).filter(Boolean);
      const scopes = scope.length > 0 ? scope.filter(item => record.scopes.includes(item)) : record.scopes;
      const tokens = issueTokens(record.email, record.sub, clientId, scopes, record.resource);
      sendJson(res, 200, tokens);
      return;
    }
    sendOAuthError(res, 400, 'unsupported_grant_type', 'Supported grant types: authorization_code, refresh_token.');
  }

  async function handleRevoke(req, res) {
    let form;
    try { form = await readFormBody(req); } catch (error) { sendOAuthError(res, 400, 'invalid_request', error.message); return; }
    const token = form.get('token') ?? '';
    stores.accessTokens.delete(token);
    stores.refreshTokens.delete(token);
    sendJson(res, 200, {});
  }

  return async function handler(req, res) {
    try {
      const url = new URL(req.url ?? '/', config.baseUrl);
      const pathname = url.pathname;
      if (pathname === '/health' && req.method === 'GET') {
        // Fingerprint of the configured /mcp/admin service credential, so
        // the operator can confirm which value this process holds without
        // either side seeing the other's secret: the token's length plus
        // the first 10 hex chars of its SHA-256. Both fields are absent
        // when the credential is not configured; the token itself is
        // never exposed.
        const serviceTokenFingerprint = config.adminServiceToken ? {
          adminServiceTokenLength: config.adminServiceToken.length,
          adminServiceTokenSha256: createHash('sha256').update(config.adminServiceToken, 'utf8').digest('hex').slice(0, 10),
        } : {};
        sendJson(res, 200, { status: 'ok', server: 'startup-atlas', transport: 'streamable-http', tools: 18, writeEnabled: store.writeEnabled, auth: 'google-oauth', oauthEnabled, githubIssuesConfigured: Boolean(config.githubToken), adminEnabled: oauthEnabled, adminQueueWriteConfigured: Boolean(config.githubToken), adminMcpEnabled: true, adminTools: ADMIN_TOOLS.length, adminServiceAuthConfigured: Boolean(config.adminServiceToken), ...serviceTokenFingerprint });
        return;
      }
      if (pathname === '/admin' || pathname.startsWith('/admin/')) { await admin.handle(req, res, url); return; }
      if (pathname === '/mcp/admin') { await handleAdminMcp(req, res); return; }
      if (pathname === '/mcp') { await handleMcp(req, res); return; }
      if (pathname === '/.well-known/oauth-authorization-server' && req.method === 'GET') { sendJson(res, 200, oauthMetadata()); return; }
      if (pathname === '/.well-known/oauth-protected-resource/mcp/admin' && req.method === 'GET') {
        sendJson(res, 200, { resource: adminMcpResource, authorization_servers: [config.baseUrl], scopes_supported: scopesSupported, bearer_methods_supported: ['header'] });
        return;
      }
      if ((pathname === '/.well-known/oauth-protected-resource' || pathname === '/.well-known/oauth-protected-resource/mcp') && req.method === 'GET') {
        sendJson(res, 200, { resource: mcpResource, authorization_servers: [config.baseUrl], scopes_supported: scopesSupported, bearer_methods_supported: ['header'] });
        return;
      }
      if (pathname === '/oauth/register' && req.method === 'POST') { await handleRegister(req, res); return; }
      if (pathname === '/oauth/authorize' && req.method === 'GET') { await handleAuthorize(req, res, url); return; }
      if (pathname === '/oauth/callback' && req.method === 'GET') { await handleCallback(req, res, url); return; }
      if (pathname === '/oauth/token' && req.method === 'POST') { await handleToken(req, res); return; }
      if (pathname === '/oauth/revoke' && req.method === 'POST') { await handleRevoke(req, res); return; }
      sendJson(res, 404, { error: 'not_found', message: `No route for ${req.method} ${pathname}. See docs/MCP-HTTP.md.` });
    } catch (error) {
      console.error(error);
      if (!res.headersSent) sendJson(res, 500, { error: 'server_error', message: 'Internal error. See the server log.' });
    }
  };
}

export async function createHandler(env = process.env, argv = process.argv.slice(2)) {
  const config = buildConfig(env, argv);
  validateConfig(config);
  const store = new CatalogueStore(config.root, { writeEnabled: config.writeEnabled });
  await store.snapshot();
  clearJwksCache();
  return createHttpHandler(store, config);
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const config = buildConfig(env, argv);
  const handler = await createHandler(env, argv);
  const server = http.createServer(handler);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(config.port, config.host, resolve);
  });
  console.error(`Startup Atlas MCP (HTTP) listening on http://${config.host}:${config.port}/mcp (write ${config.writeEnabled ? 'enabled' : 'disabled'}, OAuth ${config.googleClientSecret ? 'enabled' : 'ID-token only'}).`);
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
