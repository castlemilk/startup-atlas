/**
 * GitHub issue proxy for the Startup Atlas MCP server.
 *
 * The `atlas_create_issue` tool files a GitHub issue through the GitHub
 * REST API, so the agent loop can populate issues itself instead of
 * waiting on a per-issue approval card or on the kpi-backlog workflow.
 * The workflow stays as a fallback; this is the direct path.
 *
 * Create-only in v1: no edit, close, delete or comment support.
 *
 * Safety rules, in order:
 * 1. The token comes from the `ATLAS_GITHUB_TOKEN` environment variable
 *    only (read once at server startup). It is never logged, never put
 *    in a URL or a request body, and never appears in an error message.
 *    The `ATLAS_` prefix matters: DeepHost's `reservedProcessEnv`
 *    strips `GOOGLE_*` variables, so a `GOOGLE_*` token would silently
 *    vanish on the hosted app.
 * 2. The tool is a write tool: it only runs when the server started
 *    with `--write` (and, over HTTP, the caller's Google account is in
 *    `ATLAS_GOOGLE_WRITE_EMAILS`). Without a token it reports
 *    `GITHUB_TOKEN_MISSING` instead of attempting a call.
 * 3. Idempotency: with a `dedupKey` the client searches for an open
 *    issue carrying the `[kpi-backlog:KEY]` title marker first and
 *    returns that issue instead of filing a duplicate — the same
 *    convention as `scripts/kpi_backlog.py` and the kpi-backlog
 *    workflow. Without a key it creates directly; the caller owns
 *    dedup in that case.
 * 4. No retries, ever. A failed search aborts before any create, and
 *    a failed create is reported, never retried: retrying a create
 *    whose outcome is unknown is how duplicates happen.
 */
import { EntryError } from '../../scripts/catalogue-entries.mjs';

export const DEFAULT_GITHUB_REPO = 'castlemilk/startup-atlas';
export const GITHUB_API_BASE = 'https://api.github.com';
export const MARKER_PREFIX = 'kpi-backlog';
export const DEDUP_KEY_RE = /^[A-Z]+[0-9]+(-[a-z])?$/;
const REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const MARKER_RE = /\[kpi-backlog:[A-Z]+[0-9]+(-[a-z])?\]/;

const MAX_TITLE = 200;
const MAX_BODY = 65536;
const MAX_LABELS = 10;
const MAX_LABEL = 50;

export function dedupMarker(key) {
  return `[${MARKER_PREFIX}:${key}]`;
}

function fail(code, message) {
  throw new EntryError(code, message);
}

function validateArgs({ repo, title, body, labels, dedupKey }) {
  if (typeof repo !== 'string' || !REPO_RE.test(repo) || repo.length > MAX_TITLE) {
    fail('VALIDATION_ERROR', 'repo must look like owner/name.');
  }
  if (typeof title !== 'string' || title.length < 1 || title.length > MAX_TITLE) {
    fail('VALIDATION_ERROR', `title must be 1-${MAX_TITLE} characters.`);
  }
  if (typeof body !== 'string' || body.length < 1 || body.length > MAX_BODY) {
    fail('VALIDATION_ERROR', `body must be 1-${MAX_BODY} characters.`);
  }
  if (!Array.isArray(labels) || labels.length > MAX_LABELS || labels.some(label => typeof label !== 'string' || label.length < 1 || label.length > MAX_LABEL)) {
    fail('VALIDATION_ERROR', `labels must be an array of at most ${MAX_LABELS} strings of 1-${MAX_LABEL} characters.`);
  }
  if (dedupKey !== null && dedupKey !== undefined && !DEDUP_KEY_RE.test(dedupKey)) {
    fail('VALIDATION_ERROR', 'dedup_key must look like F3 or Q4-a (the kpi-backlog key format).');
  }
}

export class GitHubIssuesClient {
  constructor({ token = '', fetchImpl = fetch, apiBase = GITHUB_API_BASE } = {}) {
    this.token = token;
    this.fetchImpl = fetchImpl;
    this.apiBase = apiBase.replace(/\/$/, '');
  }

  get configured() {
    return Boolean(this.token);
  }

  headers() {
    return {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${this.token}`,
      'content-type': 'application/json',
      'user-agent': 'startup-atlas-mcp/1.0',
      'x-github-api-version': '2022-11-28',
    };
  }

  /** Map a GitHub API failure to an EntryError. Never includes the token. */
  async throwForResponse(response, what) {
    const status = response.status;
    if (status === 401) {
      fail('GITHUB_AUTH_ERROR', 'GitHub rejected the token (401). Check that ATLAS_GITHUB_TOKEN is a valid token with access to the repository; it may have expired or been revoked.');
    }
    if (status === 403) {
      const remaining = response.headers?.get?.('x-ratelimit-remaining');
      const reset = response.headers?.get?.('x-ratelimit-reset');
      const retryAfter = response.headers?.get?.('retry-after');
      if (remaining === '0') {
        const when = reset ? new Date(Number(reset) * 1000).toISOString() : 'unknown';
        fail('GITHUB_RATE_LIMITED', `GitHub rate limit exhausted (403); no issue was created. Limit resets at ${when}. Wait until then and retry once — do not retry in a loop.`);
      }
      if (retryAfter) {
        fail('GITHUB_RATE_LIMITED', `GitHub secondary rate limit hit (403); no issue was created. Retry after ${retryAfter} seconds, once.`);
      }
      fail('GITHUB_FORBIDDEN', `GitHub refused the request (403) while ${what}. The token may lack Issues permission on the repository, or the repository may be private to it.`);
    }
    if (status === 404) {
      fail('GITHUB_REPO_NOT_FOUND', `GitHub returned 404 while ${what}. The repository does not exist or the token cannot see it; check the repo name and the token's repository access.`);
    }
    if (status === 422) {
      let detail = '';
      try {
        const payload = await response.json();
        const errors = Array.isArray(payload?.errors) ? payload.errors.map(error => error.message ?? error.code ?? JSON.stringify(error)).join('; ') : '';
        detail = errors || payload?.message || '';
      } catch { /* fall through with the status alone */ }
      fail('GITHUB_VALIDATION_ERROR', `GitHub rejected the issue as invalid (422) while ${what}${detail ? `: ${detail}` : ''}. A named label usually does not exist on the repository yet.`);
    }
    fail('GITHUB_ERROR', `GitHub API request failed (${status}) while ${what}. No issue was confirmed created; check the repository before retrying.`);
  }

  async request(path, { method = 'GET', body = undefined, what }) {
    let response;
    try {
      response = await this.fetchImpl(`${this.apiBase}${path}`, {
        method,
        headers: this.headers(),
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch (error) {
      // The request never completed, so its outcome is unknown. Say so
      // plainly instead of claiming success or failure either way.
      fail('GITHUB_ERROR', `Could not reach the GitHub API while ${what}: ${error.message}. The issue was not confirmed created; check the repository before retrying.`);
    }
    if (!response.ok) await this.throwForResponse(response, what);
    return response.json();
  }

  /**
   * Find an open issue in `repo` whose title carries the marker for
   * `key`, e.g. `[kpi-backlog:F3]`. Returns
   * `{ number, title, url, state }` or null. Any search failure throws
   * before a create is attempted.
   */
  async findOpenByMarker(repo, key) {
    const query = `repo:${repo} in:title ${dedupMarker(key)} state:open`;
    const payload = await this.request(`/search/issues?q=${encodeURIComponent(query)}`, { what: `searching ${repo} for ${dedupMarker(key)}` });
    const items = Array.isArray(payload?.items) ? payload.items : [];
    const open = items.find(item => item.state === 'open');
    if (!open) return null;
    return { number: open.number, title: open.title, url: open.html_url, state: open.state };
  }

  /**
   * File an issue, or return the existing open one when `dedupKey` is
   * given and its marker is already on an open issue. Returns
   * `{ created, repository, dedupKey, issue }`. Never retries.
   */
  async createIssue({ repo = DEFAULT_GITHUB_REPO, title, body, labels = [], dedupKey = null } = {}) {
    validateArgs({ repo, title, body, labels, dedupKey });
    if (!this.configured) {
      fail('GITHUB_TOKEN_MISSING', 'ATLAS_GITHUB_TOKEN is not set, so atlas_create_issue cannot file anything. Set a GitHub token with Issues write access on the repository in the server environment (see docs/MCP-HTTP.md) and restart the server.');
    }
    let finalTitle = title;
    if (dedupKey) {
      const marker = dedupMarker(dedupKey);
      if (!MARKER_RE.test(title)) finalTitle = `${marker} ${title}`;
      const existing = await this.findOpenByMarker(repo, dedupKey);
      if (existing) return { created: false, repository: repo, dedupKey, issue: existing };
    }
    const payload = await this.request(`/repos/${repo}/issues`, {
      method: 'POST',
      body: { title: finalTitle, body, labels },
      what: `creating an issue in ${repo}`,
    });
    return {
      created: true,
      repository: repo,
      dedupKey,
      issue: { number: payload.number, title: payload.title, url: payload.html_url, state: payload.state },
    };
  }
}
