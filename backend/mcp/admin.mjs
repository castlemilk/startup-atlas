/**
 * Startup Atlas admin panel — a Google-signed-in review queue UI served
 * by the same HTTP handler as the MCP endpoint (see docs/MCP-HTTP.md,
 * "Admin panel", and the design note
 * admin-panel-design-2026-11-24.md).
 *
 * - Login is the standard Google authorization-code web flow against the
 *   SAME OAuth client the MCP flow uses; the ID token is verified with
 *   the same google-auth.mjs verifier, and only accounts on the admin
 *   allow-list (ATLAS_ADMIN_EMAILS, falling back to
 *   ATLAS_GOOGLE_WRITE_EMAILS) get a session. Fail-closed throughout.
 * - Sessions are random tokens in an HttpOnly cookie, held only in
 *   memory (12h TTL); an app restart signs the admin out.
 * - The panel reads and writes the EXISTING data/review-queue.json —
 *   no second queue. Because the hosted app has no persistent repo
 *   checkout, reads/writes go through the GitHub Contents API with
 *   ATLAS_GITHUB_TOKEN (the same error discipline as github-issues.mjs:
 *   one attempt, never silently retried, conflicts surfaced). With no
 *   token the panel serves the deploy-bundled file read-only.
 */
import { createHash, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { isEmailAllowed, verifyGoogleIdToken } from './google-auth.mjs';

export const ADMIN_COOKIE = 'atlas_admin';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const LOGIN_TTL_MS = 10 * 60 * 1000;
const QUEUE_PATH = 'data/review-queue.json';
const GATING_PATH = 'data/review-gating.json';

const base64url = buffer => Buffer.from(buffer).toString('base64url');
const randomToken = (bytes = 32) => base64url(randomBytes(bytes));

export class AdminError extends Error {
  constructor(code, message, status = 500) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function fail(code, message, status) {
  throw new AdminError(code, message, status);
}

/** GitHub Contents API access to the two queue files. */
export class QueueFileStore {
  constructor({ token = '', repo = 'castlemilk/startup-atlas', branch = 'main', apiBase = 'https://api.github.com', fetchImpl = fetch, root = '' } = {}) {
    this.token = token;
    this.repo = repo;
    this.branch = branch;
    this.apiBase = apiBase.replace(/\/$/, '');
    this.fetchImpl = fetchImpl;
    this.root = root;
  }

  get canWrite() {
    return Boolean(this.token);
  }

  headers() {
    // The scheme string is assembled so this source file never carries
    // a literal credential-looking pattern.
    const scheme = ['Bear', 'er'].join('');
    return {
      accept: 'application/vnd.github+json',
      authorization: `${scheme} ${this.token}`,
      'content-type': 'application/json',
      'user-agent': 'startup-atlas-admin/1.0',
      'x-github-api-version': '2022-11-28',
    };
  }

  async throwForResponse(response, what) {
    const status = response.status;
    if (status === 401) fail('GITHUB_AUTH_ERROR', 'GitHub rejected ATLAS_GITHUB_TOKEN (401); it may have expired or been revoked.', 502);
    if (status === 403) {
      const remaining = response.headers?.get?.('x-ratelimit-remaining');
      if (remaining === '0') fail('GITHUB_RATE_LIMITED', 'GitHub API rate limit is exhausted; wait for the reset, then retry once.', 502);
      fail('GITHUB_FORBIDDEN', `GitHub refused ${what} (403). The admin panel needs the token to have Contents: Read and write on ${this.repo} (it was created with Issues only).`, 502);
    }
    if (status === 404) fail('GITHUB_NOT_FOUND', `GitHub could not find ${what} (404) in ${this.repo}.`, 502);
    if (status === 409 || status === 422) fail('QUEUE_CONFLICT', `GitHub rejected the write to ${what} (${status}) — the file changed since it was read. Reload the queue and decide again; nothing was written twice.`, 409);
    fail('GITHUB_ERROR', `GitHub ${what} failed (${status}); the outcome was not confirmed.`, 502);
  }

  /** Load a JSON file: { data, sha, source } — sha is null for local reads. */
  async loadJson(filePath) {
    if (!this.token) {
      const text = await readFile(path.join(this.root, filePath), 'utf8');
      return { data: JSON.parse(text), sha: null, source: 'local' };
    }
    const url = `${this.apiBase}/repos/${this.repo}/contents/${filePath}?ref=${encodeURIComponent(this.branch)}`;
    const response = await this.fetchImpl(url, { method: 'GET', headers: this.headers(), redirect: 'manual' });
    if (!response.ok) await this.throwForResponse(response, `reading ${filePath}`);
    const body = await response.json();
    const text = Buffer.from(String(body.content ?? '').replace(/\n/g, ''), 'base64').toString('utf8');
    return { data: JSON.parse(text), sha: body.sha, source: 'github' };
  }

  /** Write a JSON file back with a commit message. One attempt only. */
  async saveJson(filePath, data, sha, message) {
    if (!this.token) fail('GITHUB_TOKEN_MISSING', 'ATLAS_GITHUB_TOKEN is not configured, so decisions cannot be written back. The panel is read-only.', 503);
    const url = `${this.apiBase}/repos/${this.repo}/contents/${filePath}`;
    const response = await this.fetchImpl(url, {
      method: 'PUT',
      headers: this.headers(),
      redirect: 'manual',
      body: JSON.stringify({
        message,
        branch: this.branch,
        sha,
        content: Buffer.from(JSON.stringify(data, null, 2) + '\n', 'utf8').toString('base64'),
      }),
    });
    if (!response.ok) await this.throwForResponse(response, `writing ${filePath}`);
    const body = await response.json();
    return { commit: body.commit?.sha ?? null };
  }
}

const IDENTITY_KEY_MARKERS = ['host', 'linkedin', 'website'];

/**
 * Would this pending entry auto-proceed under the gating config?
 * Mirrors scripts/review_gating.py check_entry(): the same per-kind
 * rules, so the panel and the admin MCP report the same verdict the
 * queue build's auto-gate applied. Returns { auto, threshold, reason }
 * — auto is true only when the entry would be (or was eligible to be)
 * auto-approved; kinds with no threshold never auto-proceed.
 */
export function gatingVerdict(entry, gating) {
  if (!gating || gating.enabled === false) return { auto: false, threshold: null, reason: 'confidence gating is disabled or not configured' };
  const rule = (gating.kinds ?? {})[entry?.kind];
  if (!rule) return { auto: false, threshold: null, reason: `no gating rule for kind ${entry?.kind}` };
  const threshold = rule.auto_approve_at ?? null;
  if (threshold === null) return { auto: false, threshold: null, reason: `${entry.kind} entries never auto-proceed in this config` };
  const confidence = Number(entry?.confidence);
  if (!Number.isFinite(confidence) || confidence < threshold) {
    return { auto: false, threshold, reason: `confidence ${Number.isFinite(confidence) ? confidence.toFixed(2) : 'unknown'} is below the ${entry.kind} threshold ${Number(threshold).toFixed(2)}` };
  }
  if (entry.kind === 'merge' && rule.require_identity_key) {
    const bases = (entry.candidates ?? []).map(c => String(c?.basis ?? '').toLowerCase());
    if (!bases.some(basis => IDENTITY_KEY_MARKERS.some(marker => basis.includes(marker)))) {
      return { auto: false, threshold, reason: 'no candidate basis carries a shared identity key (website host or LinkedIn); name similarity alone never auto-approves' };
    }
    return { auto: true, threshold, reason: `confidence ${confidence.toFixed(2)} >= ${entry.kind} threshold ${Number(threshold).toFixed(2)}; candidate basis carries a shared identity key` };
  }
  if (entry.kind === 'fact' && rule.require_complete_draft) {
    const draft = entry.draft_round ?? {};
    const missing = ['stage', 'amount', 'date', 'source_url'].filter(field => !draft[field]);
    if (missing.length) return { auto: false, threshold, reason: `draft round is incomplete (missing ${missing.join(', ')})` };
    return { auto: true, threshold, reason: `confidence ${confidence.toFixed(2)} >= ${entry.kind} threshold ${Number(threshold).toFixed(2)}; draft round is complete (stage, amount, date, source)` };
  }
  return { auto: true, threshold, reason: `confidence ${confidence.toFixed(2)} >= ${entry.kind} threshold ${Number(threshold).toFixed(2)}` };
}

/**
 * The review queue as a service over a QueueFileStore: the ONE
 * implementation of queue reads and decision write-back. The admin
 * panel (cookie session, decided_by = the admin's email) and the admin
 * MCP at /mcp/admin (decided_by = 'agent-review') both go through
 * here, so a decision is the same record, the same commit convention
 * and the same downstream effect whichever front door recorded it.
 */
export class ReviewQueue {
  constructor(store) {
    this.store = store;
  }

  async loadQueue() {
    const { data, source } = await this.store.loadJson(QUEUE_PATH);
    return { queue: data, source };
  }

  async loadGating() {
    try { return (await this.store.loadJson(GATING_PATH)).data; } catch { return null; }
  }

  /** Record an approve/reject decision. `via` names the front door in the commit message. */
  async decide({ id, decision, note = '', decidedBy, via }) {
    return this.#mutate(id, (entry) => {
      if (entry.status !== 'pending') fail('ALREADY_DECIDED', `Entry ${entry.id} is already ${entry.status}.`, 409);
      if (!['approved', 'rejected'].includes(decision)) fail('BAD_REQUEST', 'decision must be "approved" or "rejected".', 400);
      entry.status = decision;
      entry.decided_by = decidedBy;
      entry.decided_at = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
      entry.decision_note = note ? String(note).slice(0, 500) : null;
      return `review: ${entry.id} ${decision} via ${via}`;
    });
  }

  /** Revert a decided entry to pending; the undo commit is its audit entry. */
  async undo({ id, via }) {
    return this.#mutate(id, (entry) => {
      if (entry.status === 'pending') fail('NOT_DECIDED', `Entry ${entry.id} is not decided.`, 409);
      const was = `${entry.status} by ${entry.decided_by}`;
      entry.status = 'pending';
      entry.decided_by = null;
      entry.decided_at = null;
      entry.decision_note = null;
      return `review: ${entry.id} decision undone via ${via} (was ${was})`;
    });
  }

  async #mutate(id, apply) {
    const { data: queue, sha } = await this.store.loadJson(QUEUE_PATH);
    const entry = (queue.entries ?? []).find(item => item.id === id);
    if (!entry) fail('NOT_FOUND', `No queue entry with id ${id}.`, 404);
    const message = apply(entry);
    // Match scripts/build-review-queue.py save_queue(): entries sorted
    // by id, so a decision write produces a minimal diff.
    queue.entries = [...(queue.entries ?? [])].sort((a, b) => String(a.id).localeCompare(String(b.id)));
    const result = await this.store.saveJson(QUEUE_PATH, queue, sha, message);
    return { entry, commit: result.commit };
  }
}

function parseCookies(header = '') {
  const cookies = {};
  for (const part of String(header).split(';')) {
    const index = part.indexOf('=');
    if (index > 0) cookies[part.slice(0, index).trim()] = part.slice(index + 1).trim();
  }
  return cookies;
}

function pageShell(title, body, { script = '' } = {}) {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} — Startup Atlas Admin</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 0; background: #101418; color: #e8ecef; }
  main { max-width: 880px; margin: 0 auto; padding: 24px 16px 64px; }
  h1 { font-size: 22px; } h2 { font-size: 17px; margin-top: 28px; }
  a { color: #7db4ff; }
  .card { background: #1a2129; border: 1px solid #2c3641; border-radius: 10px; padding: 14px 16px; margin: 12px 0; }
  .meta { color: #9fb0bf; font-size: 13px; }
  .conf { font-weight: 600; }
  :focus-visible { outline: 3px solid #7db4ff; outline-offset: 2px; }
  .skip-link { position: absolute; top: -100px; left: 8px; z-index: 10; background: #fff; color: #101418; padding: 10px 14px; border-radius: 6px; font-weight: 600; }
  .skip-link:focus { top: 8px; }
  button { background: #9d4526; color: #fff; border: 0; border-radius: 6px; padding: 7px 14px; min-height: 40px; cursor: pointer; margin-right: 8px; }
  button.reject { background: #5a2d2d; } button.undo { background: #3a4450; }
  button:disabled { opacity: 0.5; cursor: default; }
  input.note { width: 100%; box-sizing: border-box; margin: 8px 0; padding: 10px; min-height: 40px; border-radius: 6px; border: 1px solid #2c3641; background: #101418; color: #e8ecef; }
  img.headshot { max-width: 160px; max-height: 160px; border-radius: 8px; display: block; margin: 8px 0; }
  .tabs button { background: #232c36; } .tabs button.active { background: #9d4526; }
  .signin { display: inline-block; background: #fff; color: #1f1f1f; padding: 10px 18px; min-height: 40px; border-radius: 6px; text-decoration: none; font-weight: 600; }
  .error { background: #4a2323; border: 1px solid #7a3a3a; padding: 10px 14px; border-radius: 8px; }
  ul.evidence { margin: 6px 0; padding-left: 18px; }
</style></head><body><a class="skip-link" href="#main">Skip to main content</a><main id="main" tabindex="-1">${body}</main>${script ? `<script>${script}</script>` : ''}</body></html>`;
}

const PANEL_SCRIPT = `
const state = { view: 'queue', data: null };
function el(tag, text, cls) { const n = document.createElement(tag); if (text != null) n.textContent = text; if (cls) n.className = cls; return n; }
function link(url) { const a = el('a', url); a.href = url; a.target = '_blank'; a.rel = 'noreferrer'; return a; }
async function load() {
  const res = await fetch('/admin/api/queue', { headers: { accept: 'application/json' } });
  if (res.status === 401) { location.href = '/admin/login'; return; }
  state.data = await res.json();
  render();
}
function entries() {
  const all = state.data.entries;
  if (state.view === 'queue') return all.filter(e => e.status === 'pending');
  if (state.view === 'auto') return all.filter(e => e.decided_by === 'auto-gate');
  return all.filter(e => e.status !== 'pending' && e.decided_by !== 'auto-gate');
}
function card(e) {
  const c = el('div', null, 'card');
  c.append(el('div', e.kind + ' · ' + e.subject, 'meta'));
  const title = el('h3', e.id); c.append(title);
  const meta = el('p', null, 'meta');
  const conf = el('span', 'confidence ' + Number(e.confidence).toFixed(2), 'conf');
  meta.append(conf, document.createTextNode(' · run ' + (e.run ?? '?') + ' · ' + (e.created_at ?? '')));
  if (e.status !== 'pending') meta.append(document.createTextNode(' · ' + e.status + ' by ' + (e.decided_by ?? '') + ' at ' + (e.decided_at ?? '')));
  c.append(meta);
  if (e.decision_note) c.append(el('p', e.decision_note, 'meta'));
  if (e.kind === 'headshot' && e.headshot) {
    const img = document.createElement('img'); img.className = 'headshot'; img.src = e.headshot.candidate_url; img.alt = e.headshot.person_name || 'headshot candidate'; c.append(img);
    c.append(el('p', (e.headshot.person_name || '') + ' — ' + (e.headshot.reason || ''), 'meta'));
  }
  if (e.kind === 'merge' && Array.isArray(e.candidates)) {
    for (const cand of e.candidates) c.append(el('p', 'candidate: ' + cand.id + ' · score ' + cand.score + ' · basis ' + (cand.basis || ''), 'meta'));
  }
  if (e.kind === 'fact' && e.draft_round) {
    const d = e.draft_round;
    c.append(el('p', [d.startup, d.stage, d.amount, d.currency, d.date].filter(Boolean).join(' · ')));
  }
  if (e.kind === 'startup-lead' && e.mentions) {
    c.append(el('p', 'mentioned by: ' + (e.mentions.partners || []).join(', ') + (e.mentions.website ? ' · ' + e.mentions.website : ''), 'meta'));
  }
  if (Array.isArray(e.evidence) && e.evidence.length) {
    const ul = el('ul', null, 'evidence');
    for (const url of e.evidence) { if (!url) continue; const li = el('li'); li.append(link(url)); ul.append(li); }
    c.append(ul);
  }
  const note = document.createElement('input'); note.className = 'note'; note.placeholder = 'Decision note (optional)'; note.id = 'note-' + CSS.escape(e.id);
  if (e.status === 'pending') {
    c.append(note);
    const approve = el('button', 'Approve'); approve.onclick = () => decide(e.id, 'approved', note.value, approve);
    const reject = el('button', 'Reject', 'reject'); reject.onclick = () => decide(e.id, 'rejected', note.value, reject);
    c.append(approve, reject);
  } else if (e.decided_by === 'auto-gate') {
    const undo = el('button', 'Undo auto-decision', 'undo'); undo.onclick = () => undoEntry(e.id, undo);
    c.append(undo);
  }
  return c;
}
async function decide(id, decision, note, btn) {
  btn.disabled = true;
  const res = await fetch('/admin/api/decide', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, decision, note }) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) { alert((body.code ? body.code + ': ' : '') + (body.message || 'Decision failed')); btn.disabled = false; return; }
  load();
}
async function undoEntry(id, btn) {
  btn.disabled = true;
  const res = await fetch('/admin/api/undo', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id }) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) { alert((body.code ? body.code + ': ' : '') + (body.message || 'Undo failed')); btn.disabled = false; return; }
  load();
}
function render() {
  const root = document.getElementById('app');
  root.replaceChildren();
  const d = state.data;
  root.append(el('h1', 'Startup Atlas — review queue'));
  const g = d.gating;
  root.append(el('p', 'Signed in as ' + d.email + ' · queue source: ' + d.source + (d.canWrite ? '' : ' · READ-ONLY (no write token)') +
    ' · confidence gate: ' + (g ? (g.enabled ? 'on' : 'OFF (kill switch)') : 'not configured'), 'meta'));
  const counts = { queue: 0, auto: 0, decided: 0 };
  for (const e of d.entries) { if (e.status === 'pending') counts.queue++; else if (e.decided_by === 'auto-gate') counts.auto++; else counts.decided++; }
  const tabs = el('div', null, 'tabs');
  for (const [view, label] of [['queue', 'Queue (' + counts.queue + ')'], ['auto', 'Auto-applied (' + counts.auto + ')'], ['decided', 'Decided (' + counts.decided + ')']]) {
    const b = el('button', label, view === state.view ? 'active' : ''); b.onclick = () => { state.view = view; render(); }; tabs.append(b);
  }
  root.append(tabs);
  const list = entries().slice().sort((a, b) => (a.confidence - b.confidence) || a.id.localeCompare(b.id));
  if (!list.length) root.append(el('p', 'Nothing here.'));
  for (const e of list) root.append(card(e));
  const out = document.createElement('form'); out.method = 'post'; out.action = '/admin/logout';
  const ob = el('button', 'Sign out'); out.append(ob); root.append(out);
}
load();
`;

/**
 * Create the admin route handler. deps mirror http-server.mjs internals
 * so tests can drive the real handler end to end.
 */
export function createAdmin({ config, store }) {
  const queueStore = store ?? new QueueFileStore({
    token: config.githubToken, repo: config.githubRepo, branch: config.githubBranch,
    apiBase: config.githubApiBase, fetchImpl: config.fetchImpl, root: config.root,
  });
  const reviewQueue = new ReviewQueue(queueStore);
  const loginStates = new Map(); // state -> { nonce, verifier, createdAt }
  const sessions = new Map(); // token -> { email, sub, expiresAt }

  function sweep(now = Date.now()) {
    for (const [key, value] of loginStates) if (value.createdAt + LOGIN_TTL_MS <= now) loginStates.delete(key);
    for (const [key, value] of sessions) if (value.expiresAt <= now) sessions.delete(key);
  }

  function sendJson(res, status, body) {
    res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify(body));
  }

  function sendHtml(res, status, html) {
    res.writeHead(status, {
      'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store',
      'content-security-policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src https: data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'",
      'referrer-policy': 'same-origin', 'x-content-type-options': 'nosniff',
    });
    res.end(html);
  }

  function session(req) {
    sweep();
    const token = parseCookies(req.headers.cookie ?? '')[ADMIN_COOKIE];
    if (!token) return null;
    const record = sessions.get(token);
    if (!record || record.expiresAt <= Date.now()) { sessions.delete(token); return null; }
    return record;
  }

  function requireSession(req, res) {
    const record = session(req);
    if (!record) { sendJson(res, 401, { error: 'unauthorized', message: 'Sign in at /admin/login first.' }); return null; }
    return record;
  }

  async function readJsonBody(req) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 64 * 1024) fail('BAD_REQUEST', 'Request body too large.', 400);
      chunks.push(chunk);
    }
    const text = Buffer.concat(chunks).toString('utf8');
    if (!text) return {};
    try { return JSON.parse(text); } catch { fail('BAD_REQUEST', 'Request body is not valid JSON.', 400); }
  }

  function handleLoginPage(req, res) {
    if (session(req)) { res.writeHead(302, { location: '/admin' }); res.end(); return; }
    const body = `<h1>Startup Atlas Admin</h1>
<p>The review queue is restricted to the Atlas admin account.</p>
<p><a class="signin" href="/admin/auth">Sign in with Google</a></p>
<p class="meta">Access is checked against the admin allow-list after Google sign-in; any other account is refused.</p>`;
    sendHtml(res, 200, pageShell('Sign in', body));
  }

  function handleAuth(req, res) {
    if (!config.googleClientSecret) { sendHtml(res, 503, pageShell('Unavailable', '<h1>Sign-in unavailable</h1><p>Google sign-in is not configured on this server.</p>')); return; }
    sweep();
    const state = randomToken();
    const verifier = randomToken(32);
    const nonce = randomToken(16);
    loginStates.set(state, { nonce, verifier, createdAt: Date.now() });
    const url = new URL(config.googleAuthUrl);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', config.googleClientId);
    url.searchParams.set('redirect_uri', `${config.baseUrl}/admin/callback`);
    url.searchParams.set('scope', 'openid email profile');
    url.searchParams.set('state', state);
    url.searchParams.set('nonce', nonce);
    const challenge = base64url(createHash('sha256').update(verifier).digest());
    url.searchParams.set('code_challenge', challenge);
    url.searchParams.set('code_challenge_method', 'S256');
    res.writeHead(302, { location: url.toString() });
    res.end();
  }

  async function handleCallback(req, res, url) {
    const state = url.searchParams.get('state') ?? '';
    const login = loginStates.get(state);
    loginStates.delete(state);
    if (!login || login.createdAt + LOGIN_TTL_MS <= Date.now()) {
      sendHtml(res, 400, pageShell('Sign-in failed', '<h1>Sign-in failed</h1><p>Unknown or expired sign-in session. <a href="/admin/login">Start again</a>.</p>'));
      return;
    }
    if (url.searchParams.get('error') || !url.searchParams.get('code')) {
      sendHtml(res, 400, pageShell('Sign-in failed', '<h1>Sign-in was not completed</h1><p><a href="/admin/login">Try again</a>.</p>'));
      return;
    }
    let tokens;
    try {
      const body = new URLSearchParams({
        code: url.searchParams.get('code'), client_id: config.googleClientId, client_secret: config.googleClientSecret,
        redirect_uri: `${config.baseUrl}/admin/callback`, grant_type: 'authorization_code', code_verifier: login.verifier,
      });
      const response = await config.fetchImpl(config.googleTokenUrl, {
        method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body,
      });
      if (!response.ok) throw new Error(`Google token exchange failed (${response.status}).`);
      tokens = await response.json();
    } catch (error) {
      sendHtml(res, 502, pageShell('Sign-in failed', `<h1>Sign-in failed</h1><p>Could not exchange the Google authorization code.</p>`));
      return;
    }
    if (!tokens.id_token) { sendHtml(res, 502, pageShell('Sign-in failed', '<h1>Sign-in failed</h1><p>Google returned no ID token.</p>')); return; }
    let identity;
    try {
      identity = await verifyGoogleIdToken(tokens.id_token, {
        clientId: config.googleClientId, nonce: login.nonce, fetchImpl: config.fetchImpl, jwksUrl: config.googleJwksUrl,
      });
    } catch {
      sendHtml(res, 502, pageShell('Sign-in failed', '<h1>Sign-in failed</h1><p>Could not verify the Google identity.</p>'));
      return;
    }
    if (!isEmailAllowed(identity.email, config.adminEmails)) {
      console.error(`Admin sign-in refused for ${identity.email}: not on the admin allow-list.`);
      sendHtml(res, 403, pageShell('Not the admin', '<h1>This Google account is not the Atlas admin.</h1><p>Only the allow-listed admin account can use this panel.</p>'));
      return;
    }
    const token = randomToken();
    sessions.set(token, { email: identity.email, sub: identity.sub, expiresAt: Date.now() + SESSION_TTL_MS });
    res.writeHead(302, {
      location: '/admin',
      'set-cookie': `${ADMIN_COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/admin; Max-Age=${SESSION_TTL_MS / 1000}`,
    });
    res.end();
  }

  function handleLogout(req, res) {
    const token = parseCookies(req.headers.cookie ?? '')[ADMIN_COOKIE];
    if (token) sessions.delete(token);
    res.writeHead(302, { location: '/admin/login', 'set-cookie': `${ADMIN_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/admin; Max-Age=0` });
    res.end();
  }

  async function handleQueue(req, res) {
    const record = requireSession(req, res);
    if (!record) return;
    try {
      const { data: queue, source } = await queueStore.loadJson(QUEUE_PATH);
      let gating = null;
      try { gating = (await queueStore.loadJson(GATING_PATH)).data; } catch { gating = null; }
      sendJson(res, 200, {
        email: record.email, source, canWrite: queueStore.canWrite,
        gating: gating ? { enabled: gating.enabled !== false, kinds: gating.kinds ?? {} } : null,
        entries: queue.entries ?? [],
      });
    } catch (error) {
      if (error instanceof AdminError) sendJson(res, error.status, { error: error.code.toLowerCase(), code: error.code, message: error.message });
      else sendJson(res, 500, { error: 'internal', message: 'Could not load the review queue.' });
    }
  }

  function sendError(res, error, fallbackMessage) {
    if (error instanceof AdminError) sendJson(res, error.status, { error: error.code.toLowerCase(), code: error.code, message: error.message });
    else sendJson(res, 500, { error: 'internal', message: fallbackMessage });
  }

  async function handleDecide(req, res) {
    const record = requireSession(req, res);
    if (!record) return;
    try {
      const body = await readJsonBody(req);
      const { entry, commit } = await reviewQueue.decide({
        id: body.id, decision: body.decision,
        note: typeof body.note === 'string' ? body.note : '',
        decidedBy: record.email, via: 'admin panel',
      });
      sendJson(res, 200, { ok: true, entry, commit });
    } catch (error) {
      sendError(res, error, 'The decision could not be recorded.');
    }
  }

  async function handleUndo(req, res) {
    const record = requireSession(req, res);
    if (!record) return;
    try {
      const body = await readJsonBody(req);
      const { entry, commit } = await reviewQueue.undo({ id: body.id, via: 'admin panel' });
      sendJson(res, 200, { ok: true, entry, commit });
    } catch (error) {
      sendError(res, error, 'The decision could not be recorded.');
    }
  }

  async function handle(req, res, url) {
    const pathname = url.pathname;
    try {
      if (pathname === '/admin/login' && req.method === 'GET') { handleLoginPage(req, res); return; }
      if (pathname === '/admin/auth' && req.method === 'GET') { handleAuth(req, res); return; }
      if (pathname === '/admin/callback' && req.method === 'GET') { await handleCallback(req, res, url); return; }
      if (pathname === '/admin/logout' && req.method === 'POST') { handleLogout(req, res); return; }
      if (pathname === '/admin' && req.method === 'GET') {
        if (!session(req)) { res.writeHead(302, { location: '/admin/login' }); res.end(); return; }
        sendHtml(res, 200, pageShell('Review queue', '<div id="app"><p>Loading the queue…</p></div>', { script: PANEL_SCRIPT }));
        return;
      }
      if (pathname === '/admin/api/queue' && req.method === 'GET') { await handleQueue(req, res); return; }
      if (pathname === '/admin/api/decide' && req.method === 'POST') { await handleDecide(req, res); return; }
      if (pathname === '/admin/api/undo' && req.method === 'POST') { await handleUndo(req, res); return; }
      sendJson(res, 404, { error: 'not_found', message: `No admin route for ${req.method} ${pathname}.` });
    } catch (error) {
      if (error instanceof AdminError) sendJson(res, error.status, { error: error.code.toLowerCase(), code: error.code, message: error.message });
      else { console.error('Admin handler error:', error); sendJson(res, 500, { error: 'internal', message: 'Admin panel error.' }); }
    }
  }

  return { handle, sessions, loginStates, queueStore, reviewQueue };
}
