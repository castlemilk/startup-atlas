# Startup Atlas MCP over HTTP (Google OAuth)

The same 18 tools as the local stdio server, reachable over HTTP instead of
a local process. Transport is the MCP **Streamable HTTP** transport at
`/mcp`, and authentication is **OAuth 2.0 with Google as the identity
provider**. This is separate from the owner-private ChatGPT Site in
`backend/hosted/` (see [backend/hosted/README.md](../backend/hosted/README.md)); it does not
change that setup.

## Service behaviour

- Same tools, same behaviour: catalogue search/get/validate/add, partner
  search/get/validate/upsert, startup record reads/edits, and the
  read-only crawl-run registry (`atlas_list_crawl_runs`,
  `atlas_get_crawl_run`, `atlas_get_crawl_claims`), and GitHub issue
  filing (`atlas_create_issue`, see below). No shell, fetch or Git
  tool; MCP never triggers a crawl; the registry stays advisory.
- Writes work exactly as in stdio: they need `--write` **and** the caller's
  Google account to be in `ATLAS_GOOGLE_WRITE_EMAILS`. Writes still only
  change the local checkout — nothing commits, pushes or publishes.
  The one exception is `atlas_create_issue`, which files a real GitHub
  issue through the GitHub API (never the git binary) — see
  "GitHub issues" below. It additionally needs `ATLAS_GITHUB_TOKEN`.
- No secret is hard-coded or committed. Google credentials come from the
  environment. Tokens and OAuth state live only in the server's memory;
  restarting the server invalidates issued MCP tokens.
- The server must be reachable by the client at a stable public HTTPS
  origin for the OAuth flow (redirect URIs must match exactly). It binds
  `0.0.0.0` by default so a container platform's proxy can reach it, and
  listens on the platform's `PORT` when set (otherwise `ATLAS_HTTP_PORT`,
  default `3000`); for local-only use set `ATLAS_HTTP_HOST=127.0.0.1`.
  Exposing it publicly needs a reverse proxy / TLS terminator in front —
  this server does not do TLS itself.

## DeepHost hosting (handler mode, not a long-lived server)

DeepHost's "node" framework does **not** run `npm start` and does not run
a long-lived server process. Its runtime imports `server.js` at the
artifact root once, takes its default export as a Node http handler
`(req, res) => ...`, and serves every request itself over a unix socket.
That file is the entrypoint: without it the app fails every request with
"handler could not start", and no start script, bind host or `PORT`
setting changes that — this was the cause of the outage on every build
before `server.js` existed, including the builds that fixed the bind
and dependency-install bugs.

`server.js` exports the same handler `node backend/mcp/http-server.mjs`
listens with locally (via the exported `createHandler()` in
`backend/mcp/http-server.mjs`); only the `listen()` is skipped. The
handler is built once at worker start, so a missing
`GOOGLE_CLIENT_ID` / `ATLAS_GOOGLE_ALLOWED_EMAILS` still fails the
worker at import time rather than per request. The `start` script in
`package.json` is for local runs only; DeepHost never executes it.
Deployments also need "Automatic deployments" enabled in the DeepHost
console ("Deploy branch pushes") — it is off by default, and a push
with it off deploys nothing and says nothing.

The app deploys the branch configured in the console; that branch must
contain the code being configured. A redeploy of an old branch picks up
new env vars but none of the newer tools.

To enable writes (including `atlas_create_issue`) on the hosted app,
set all three in the console env and redeploy a build that contains
the tool:

- `ATLAS_MCP_WRITE_ENABLED=true` — handler mode cannot pass `--write`.
- `ATLAS_GOOGLE_WRITE_EMAILS` — the Google accounts allowed to write.
- `ATLAS_GITHUB_TOKEN` — only needed for `atlas_create_issue`.

Verify afterwards with `GET /health`: `tools` should count every tool
in the deployed build, `writeEnabled` should be `true`, and
`githubIssuesConfigured` should be `true` when the token is set.

## 1. Google Cloud Console setup

For a new host, configure a Google OAuth client for its callback in
[Google Cloud Console](https://console.cloud.google.com/apis/credentials):

1. Pick (or create) the Google Cloud project that should own the client.
2. **OAuth consent screen**: configure it (user type External is fine for
   a personal server), add the Google account(s) that may use the MCP as
   test users if the app stays in testing, and add the scopes
   `openid`, `email`, `profile` (non-sensitive; no verification is needed
   for those scopes alone while the app is in testing).
3. **Create credentials → OAuth client ID → Web application.** Name it
   e.g. `Startup Atlas MCP (HTTP)`.
4. **Authorised redirect URIs** — add exactly this one, using the public
   origin the server will run at (replace the host):
   `https://mcp.example.com/oauth/callback`
   For local-only testing you may instead use
   `http://127.0.0.1:3000/oauth/callback` — but a localhost redirect only
   works for clients on the same machine as the server.
5. Copy the **Client ID** and **Client secret** it shows. Do not paste
   them into chat, a file in the repo, or a client configuration — put
   them in the server's environment (step 2).

## 2. Run the server

```sh
npm ci --prefix backend/mcp --ignore-scripts
npm run data:generate

export GOOGLE_CLIENT_ID='YOUR_GOOGLE_CLIENT_ID'
export GOOGLE_CLIENT_SECRET='YOUR_GOOGLE_CLIENT_SECRET'
export ATLAS_HTTP_BASE_URL='https://mcp.example.com'
export ATLAS_GOOGLE_ALLOWED_EMAILS='owner@example.com'
export ATLAS_GOOGLE_WRITE_EMAILS='owner@example.com'
# Optional: enables atlas_create_issue (GitHub issue filing). Omit it and
# the tool reports GITHUB_TOKEN_MISSING instead of filing anything.
# export ATLAS_GITHUB_TOKEN=<redacted>
# Omit --write for a read-only server; writes also need the email above.
npm run mcp:http -- --write
```

Environment variables:

| Variable | Required | What it does |
| --- | --- | --- |
| `ATLAS_GOOGLE_CLIENT_ID` | yes | OAuth client ID from step 1. Also the expected audience of Google ID tokens. `GOOGLE_CLIENT_ID` is the local fallback — DeepHost's runtime strips every `GOOGLE_*` variable from a handler worker, so on DeepHost the `ATLAS_GOOGLE_*` name must be used. |
| `ATLAS_GOOGLE_CLIENT_SECRET` | yes for the OAuth flow | Client secret from step 1. Without it, `/oauth/*` returns 503 and only direct Google ID-token Bearer auth works. `GOOGLE_CLIENT_SECRET` is the local fallback, stripped on DeepHost the same way. |
| `ATLAS_HTTP_BASE_URL` | yes for OAuth | Public origin, no trailing slash, e.g. `https://mcp.example.com`. Used for the issuer, redirect URIs and resource metadata. Defaults to `http://127.0.0.1:<port>`. |
| `ATLAS_GOOGLE_ALLOWED_EMAILS` | yes | Comma-separated Google account emails allowed to call any tool. Unset or empty allows nobody (fail-closed). |
| `ATLAS_GOOGLE_WRITE_EMAILS` | for writes | Comma-separated emails allowed to use the four write tools (also needs `--write`). Unset means no HTTP writes at all. |
| `ATLAS_MCP_WRITE_ENABLED` | for writes on handler-mode hosts | `true` (also `1`/`yes`) enables write mode where the host imports `server.js` and cannot pass the `--write` flag (DeepHost). Any other value, or unset, keeps the server read-only. Never a substitute for the write allow-list: both are required. |
| `ATLAS_GITHUB_TOKEN` | for `atlas_create_issue` | GitHub token with Issues write access on the repository (see "GitHub issues"). Without it the tool reports `GITHUB_TOKEN_MISSING` and files nothing. Never commit it; keep it in the server environment only. |
| `ATLAS_ADMIN_EMAILS` | no | Admin panel allow-list. Unset falls back to `ATLAS_GOOGLE_WRITE_EMAILS`; if both are unset the panel allows nobody. |
| `ATLAS_GITHUB_REPO` | no | Repository the admin panel reads/writes the review queue in, default `castlemilk/startup-atlas`. |
| `ATLAS_GITHUB_BRANCH` | no | Branch for admin queue reads/writes, default `main`. |
| `ATLAS_GITHUB_API_BASE` | no | GitHub API base override; only needed for tests. Default `https://api.github.com`. |
| `ATLAS_HTTP_HOST` | no | Bind host, default `0.0.0.0` (use `127.0.0.1` for local-only). |
| `PORT` | no | Bind port, set by container platforms; takes precedence over `ATLAS_HTTP_PORT` when set. |
| `ATLAS_HTTP_PORT` | no | Bind port, default `3000`. |
| `GOOGLE_AUTH_URL`, `GOOGLE_TOKEN_URL`, `GOOGLE_JWKS_URL`, `GOOGLE_TOKENINFO_URL` | no | Google endpoint overrides; only needed for tests. Defaults are Google's production URLs. |

The server exits at startup if `ATLAS_GOOGLE_CLIENT_ID` (or its
`GOOGLE_CLIENT_ID` fallback) or `ATLAS_GOOGLE_ALLOWED_EMAILS` is missing. `--repo <path>` selects another
compatible checkout, as with stdio.

## 3. Connect a client

The MCP endpoint is `<base>/mcp` (Streamable HTTP). A client that
supports MCP OAuth (the standard flow) discovers everything itself:

- Protected resource metadata: `<base>/.well-known/oauth-protected-resource/mcp`
- Authorization server metadata: `<base>/.well-known/oauth-authorization-server`
- Client registration: `POST <base>/oauth/register` (dynamic, RFC 7591)
- Authorize: `<base>/oauth/authorize` → Google sign-in → `<base>/oauth/callback`
- Token / revoke: `<base>/oauth/token`, `<base>/oauth/revoke`

Flow: the client registers, redirects the user to the authorize URL, the
user signs in with Google, Google returns an ID token to this server,
this server verifies it against Google's JWKS and checks the allow-list,
then issues the client an MCP access token (1 hour) and refresh token
(30 days). The client then calls `/mcp` with `Authorization: Bearer
<access token>`.

Clients without OAuth support can call `/mcp` directly with a Google ID
token as the Bearer token (obtained from Google's own sign-in); it is
verified the same way, including audience, issuer, expiry and the
allow-list. Example:

```sh
curl -s -X POST https://mcp.example.com/mcp \
  -H "Authorization: Bearer $GOOGLE_ID_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

`GET /health` is public and reports status, tool count, write mode and
whether the OAuth flow is enabled. `githubIssuesConfigured` reports
whether `ATLAS_GITHUB_TOKEN` is set — a boolean only, never the token.

## Admin panel (`/admin`) — review queue with Google sign-in

The same handler serves a small admin panel for the human-in-the-loop
review queue (`data/review-queue.json`). The public Pages site is static
and cannot do auth; the panel lives here because this app already
verifies Google identity.

- **Login:** `GET /admin` redirects to `/admin/login`, which offers one
  **Sign in with Google** button. The flow is the standard Google
  authorization-code web flow against the SAME OAuth client as the MCP
  flow (separate callback: `<base>/admin/callback` — **this URI must be
  added as a second authorised redirect URI on the Google OAuth
  client**, alongside `/oauth/callback`). The ID token is verified
  exactly like an MCP login (JWKS, issuer, audience, expiry,
  `email_verified`, nonce), then the email is checked against the
  **admin allow-list**: `ATLAS_ADMIN_EMAILS` when set, otherwise
  `ATLAS_GOOGLE_WRITE_EMAILS`. Any other verified account gets a 403
  page and no session — fail-closed, like `/mcp`. A session is a random
  token in an `HttpOnly; Secure; SameSite=Lax` cookie, held only in
  memory for 12 hours; `POST /admin/logout` ends it. A server restart
  signs the admin out.
- **Queue UI:** three views — **Queue** (pending, lowest confidence
  first), **Auto-applied** (decisions made by confidence gating, each
  with an Undo button), **Decided**. Cards show the evidence per kind:
  merge candidates with scores and bases, draft rounds for `fact`
  entries, partner mentions for `startup-lead`s, and the image itself
  for `headshot` candidates.
- **Write-back:** decisions are recorded in `data/review-queue.json`
  itself (`status`, `decided_by`, `decided_at`, `decision_note`) via
  the **GitHub Contents API** using `ATLAS_GITHUB_TOKEN` — the hosted
  app has no persistent checkout, so nothing is written locally. The
  token therefore needs **Contents: Read and write** on the repository
  in addition to Issues (the token setup above grants Issues only; add
  Contents or decisions fail with `GITHUB_FORBIDDEN` and the panel says
  so). Writes fetch a fresh blob sha first, commit with the message
  `review: <id> <decision> via admin panel`, and are never silently
  retried; a sha conflict returns 409 and the UI asks for a reload.
  With no token configured the panel serves the deploy-bundled queue
  read-only and decisions return `GITHUB_TOKEN_MISSING`. Repo, branch
  and API base are configurable (`ATLAS_GITHUB_REPO`,
  `ATLAS_GITHUB_BRANCH`, `ATLAS_GITHUB_API_BASE`).
- **Confidence gating:** `scripts/review_gating.py` runs at the end of
  every queue build and applies the thresholds in
  `data/review-gating.json` — the one place they live. Entries whose
  per-kind rule passes are marked approved with `decided_by:
  'auto-gate'` and a note naming the score, threshold and rule, so the
  existing consumers (identity replay, the MCP fact write path) treat
  them like human decisions. Merges additionally require a candidate
  basis carrying a shared identity key (website host or LinkedIn);
  name similarity alone never auto-approves. `edge` and `headshot`
  entries never auto-approve in v1. `"enabled": false` in the config
  is the kill switch. Auto-decisions are listed in the panel's
  Auto-applied view and reversible there (back to pending).
- `GET /health` additionally reports `adminEnabled` (Google sign-in
  configured) and `adminQueueWriteConfigured` (a GitHub token is set —
  a boolean only, never the token).

## Admin MCP (`/mcp/admin`) — the review queue as tools

A **separate** MCP surface on the same handler — not part of `/mcp`,
whose 17 catalogue tools are unchanged. It exists so the assistant
(Dog box) can work the review queue itself, taking the owner out of
the loop wherever the evidence allows; the panel above remains the
owner's own front door onto the same queue.

- **Access:** the same Google OAuth / Bearer verification as `/mcp`
  (an issued MCP access token or a Google ID token), then a stricter
  check: the identity must be on the **admin allow-list**
  (`ATLAS_ADMIN_EMAILS`, falling back to `ATLAS_GOOGLE_WRITE_EMAILS`).
  No token → 401; a verified account that is not the admin → 403. Its
  protected-resource metadata lives at
  `/.well-known/oauth-protected-resource/mcp/admin`, and the OAuth
  authorization endpoint accepts `resource=<base>/mcp/admin` as well
  as `<base>/mcp`. `GET /health` reports `adminMcpEnabled` and
  `adminTools` alongside the unchanged `tools: 18`.
- **Tools (6):** `atlas_admin_list_review_queue` (filters: `kind`,
  `status`, confidence `band` — `above_gate` / `below_gate` against
  `data/review-gating.json`; lowest confidence first, each entry
  carrying its gating verdict), `atlas_admin_get_review_item` (full
  evidence plus the verdict and its reason),
  `atlas_admin_decide_review_item`, `atlas_admin_undo_review_decision`,
  `atlas_admin_get_review_gating`, and
  `atlas_admin_list_auto_applied` (the auto-gate audit trail).
- **Same write-back, distinct attribution:** decisions go through the
  panel's `ReviewQueue` service and the GitHub Contents API — same
  `data/review-queue.json` records, same commit convention
  (`review: <id> <decision> via admin MCP`), same downstream consumers
  (identity replay, the fact write path). Agent decisions are recorded
  with `decided_by: "agent-review"` so they are always distinguishable
  from the owner's (his email) and the auto-gate's (`auto-gate`), and
  this surface opens no new path into published Atlas data.
- **Operating intent:** the assistant reviews the human-band items
  itself where the evidence is clear-cut. A decision REQUIRES a note
  citing the evidence relied on — the tool refuses a decision without
  one. Anything genuinely ambiguous stays pending for the owner's
  panel queue; that queue is for his calls only. Every agent decision
  is reversible with `atlas_admin_undo_review_decision`, and the undo
  commit names what was undone, so the trail keeps both entries.

## GitHub issues (`atlas_create_issue`)

The loop files issues straight from the MCP server instead of waiting
on a per-issue approval card. The tool is create-only in v1: it never
edits, closes, deletes or comments on an issue.

```jsonc
// tools/call atlas_create_issue
{
  "repo": "castlemilk/startup-atlas",   // optional, this is the default
  "title": "Automate the manual loop steps",
  "body": "Problem, evidence with numbers/dates, proposed fix.",
  "labels": ["kpi-backlog"],            // optional, at most 10
  "dedup_key": "F3"                     // optional, the kpi-backlog key
}
```

Gating, in order: the server must run with write mode on (`--write`,
or `ATLAS_MCP_WRITE_ENABLED=true` on a handler-mode host such as
DeepHost, which cannot pass CLI flags); over HTTP the
caller's Google account must also be in `ATLAS_GOOGLE_WRITE_EMAILS`;
and `ATLAS_GITHUB_TOKEN` must be set. Any missing piece fails closed
(`READ_ONLY`, `WRITE_FORBIDDEN` or `GITHUB_TOKEN_MISSING`) before any
GitHub call is made. **The hosted DeepHost app stays read-only
(`writeEnabled: false`, no token) unless Ben deliberately configures
the token and write mode there** — deploying this branch does not by
itself enable issue filing from the hosted app.

Token setup (Ben — do this once, in GitHub, not in the repo):

1. GitHub → Settings → Developer settings → Personal access tokens →
   **Fine-grained tokens** → Generate new token.
2. Resource owner: `castlemilk`; Repository access: **Only select
   repositories** → `castlemilk/startup-atlas`.
3. Permissions → Repository permissions → **Issues: Read and write**.
   Nothing else is needed; do not grant Contents or Actions.
4. Put the token in the server environment as `ATLAS_GITHUB_TOKEN`
   (DeepHost console env vars for the hosted app, or the shell for a
   local server). Never paste it into chat, a file, or a test — tests
   use a fake token string only.

Idempotency: with `dedup_key` the tool searches first for an open
issue whose title carries the `[kpi-backlog:KEY]` marker — the same
convention as `scripts/kpi_backlog.py` and the kpi-backlog workflow —
and returns that issue (`created: false`) instead of filing a
duplicate. A closed issue with the same marker does not block a fresh
file. Without `dedup_key` the tool creates directly and the caller
owns dedup. The tool never retries: a failed search aborts before any
create, and a failed create is reported, never retried, so an outcome
that is unknown is never silently doubled.

Error codes: `GITHUB_TOKEN_MISSING` (no token configured),
`GITHUB_AUTH_ERROR` (401 — token invalid, expired or revoked),
`GITHUB_FORBIDDEN` (403 — token lacks Issues permission),
`GITHUB_RATE_LIMITED` (403 with an exhausted limit — the message names
the reset time; wait, then retry once), `GITHUB_REPO_NOT_FOUND` (404 —
wrong repo name or no access), `GITHUB_VALIDATION_ERROR` (422 — usually
a label that does not exist on the repository yet), `GITHUB_ERROR`
(anything else, including a network failure — the message says the
outcome was not confirmed, so check the repository before retrying).

The kpi-backlog workflow (`.github/workflows/kpi-backlog.yml`, on the
infra bootstrap branch) is the fallback path once it merges: it files
the same `[kpi-backlog:KEY]` issues from
`data/kpi-backlog.json` using the repo's own `GITHUB_TOKEN`, so the
loop still files issues even on a server without the token. Both paths
dedupe on the same title marker, so they cannot double-file each other
while the issue stays open.

## Security notes

- Every request to `/mcp` needs a Bearer token; unauthenticated requests
  get 401 with a `WWW-Authenticate` header pointing at the protected
  resource metadata. A verified Google account outside the allow-list
  gets 403, including at the OAuth callback (the client is redirected
  with `error=access_denied`).
- Google ID tokens are verified by RS256 signature against Google's JWKS
  (cached one hour), issuer, audience (`GOOGLE_CLIENT_ID`), expiry and
  `email_verified`. Google access tokens are verified through Google's
  tokeninfo endpoint.
- Authorization codes are single-use, 10-minute, PKCE-bound (S256, as
  the MCP spec requires). Login sessions expire after 10 minutes.
  Refresh tokens rotate on use.
- The server never stores a Google token, client secret or MCP token on
  disk, and never returns one in a tool response. The write lock and
  atomic-rename behaviour of the stdio server are unchanged.

## Verification

```sh
npm --prefix backend/mcp test   # 58 tests: 48 stdio (including 17 GitHub-issue) + 10 HTTP/OAuth
```

The HTTP tests run a mock Google (JWKS, authorize, token, tokeninfo)
with a generated RSA key and exercise the real server over loopback:
unauthenticated/forged/expired/unlisted identities are rejected, a
verified ID token and a Google access token both open the 18 tools,
read-only mode and the per-account write gate behave, and the full
register → authorize → Google → callback → token → MCP flow issues a
working access token (including PKCE mismatch, refresh and revoke).
