# Startup Atlas MCP over HTTP (Google OAuth)

The same 17 tools as the local stdio server, reachable over HTTP instead of
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
| `ATLAS_GITHUB_TOKEN` | for `atlas_create_issue` | GitHub token with Issues write access on the repository (see "GitHub issues"). Without it the tool reports `GITHUB_TOKEN_MISSING` and files nothing. Never commit it; keep it in the server environment only. |
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

Gating, in order: the server must run with `--write`; over HTTP the
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
verified ID token and a Google access token both open the 17 tools,
read-only mode and the per-account write gate behave, and the full
register → authorize → Google → callback → token → MCP flow issues a
working access token (including PKCE mismatch, refresh and revoke).
