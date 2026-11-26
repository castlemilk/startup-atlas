# Startup Atlas MCP — integration guide

How to connect an MCP client to Startup Atlas and what you can do once
connected. This is the integrator's guide to the **hosted** server: the
endpoint, the tools, the sign-in flow, worked examples and the failure
modes you will actually hit.

For the operator's view — running the HTTP server yourself, environment
variables, the admin panel and the admin MCP in depth — see
[MCP over HTTP (Google OAuth)](MCP-HTTP.md). For the local stdio server
and the entry/provenance contract, see [Startup Atlas MCP](MCP.md).

## The three surfaces — do not confuse them

Atlas has three MCP entry points with different auth and write
behaviour. This guide covers the first.

| Surface | Where | Auth | Writes |
| --- | --- | --- | --- |
| **Hosted HTTP MCP** (this guide) | `https://gamma-systems-pty-ltd-startup-atlas-mcp.apps.deephost.benebsworth.com/mcp` | Google OAuth (this server's own authorization server) | Write mode is enabled on the live deployment; the four write tools additionally require an allow-listed writer account (see "Writes") |
| **Local stdio MCP** | `backend/mcp/server.mjs` in a checkout | None — it runs as you, on your machine | Local checkout only, and only with `--write` |
| **Private Site MCP** | `backend/hosted/` (separate Cloudflare service) | Sites identity + GitHub App OAuth | Opens **draft PRs**; never edits `main` directly |

The hosted and stdio servers share one codebase and one tool list
(18 tools). The private Site is a different service with its own tool
names (`atlas_propose_startup_edit`, `atlas_get_connection`, …) — see
[backend/hosted/README.md](../backend/hosted/README.md).

## The hosted server at a glance

- **MCP endpoint:** `https://gamma-systems-pty-ltd-startup-atlas-mcp.apps.deephost.benebsworth.com/mcp`
  (Streamable HTTP transport; server name `startup-atlas`, version `1.0.0`)
- **Admin MCP endpoint:** `…/mcp/admin` — review-queue tools, admin
  accounts only (see "Admin surface" below)
- **Health (public, no auth):** `GET …/health`
- **Admin panel (humans):** `…/admin` — browser sign-in, same allow-list
  family as the admin MCP

Live `/health`, verified 26 Nov 2026:

```json
{"status":"ok","server":"startup-atlas","transport":"streamable-http","tools":18,"writeEnabled":true,"auth":"google-oauth","oauthEnabled":true,"githubIssuesConfigured":true,"adminEnabled":true,"adminQueueWriteConfigured":true,"adminMcpEnabled":true,"adminTools":6,"adminServiceAuthConfigured":true}
```

Two things to read correctly in that output:

- `tools: 18` is the `/mcp` tool count; `adminTools` is the separate
  `/mcp/admin` count. The code on `main` defines **8** admin tools
  (the batch pair from #87 included); the live deployment reports **6**
  because it predates that merge — a redeploy closes the gap. When in
  doubt, `tools/list` against the live endpoint is the truth, not any
  document (including this one).
- `/health` is the first diagnostic for every connection problem: it
  tells you the server is up, which surfaces are enabled, and whether
  write mode and issue filing are configured — booleans only, never a
  secret.

## Who can connect

Access is allow-listed, fail-closed. Your Google account must be on
the server's allowed-emails list before any tool call succeeds, and
the Google OAuth consent screen is in **Testing** mode, which
independently restricts sign-in to the project's listed test users.
If you are on neither list, sign-in completes at Google but the server
refuses you (see Troubleshooting). There is no anonymous or API-key
mode.

## Connect a client

An OAuth-capable MCP client needs only the endpoint URL — it discovers
registration, authorization and token endpoints itself from the
server's metadata:

- Protected resource metadata: `<base>/.well-known/oauth-protected-resource/mcp`
- Authorization server metadata: `<base>/.well-known/oauth-authorization-server`
- Client registration: `POST <base>/oauth/register` (dynamic, RFC 7591)
- Authorize: `<base>/oauth/authorize` → Google sign-in → `<base>/oauth/callback`
- Token / revoke: `<base>/oauth/token`, `<base>/oauth/revoke`

### Claude Code

```sh
claude mcp add --transport http startup-atlas https://gamma-systems-pty-ltd-startup-atlas-mcp.apps.deephost.benebsworth.com/mcp
```

Then run `/mcp` inside Claude Code and choose **Authenticate** for
`startup-atlas`; it opens the browser sign-in flow described below.

### claude.ai and Claude Desktop (custom connector)

1. Open **Settings → Connectors** and choose **Add custom connector**.
2. Name it `Startup Atlas` and paste the endpoint URL:
   `https://gamma-systems-pty-ltd-startup-atlas-mcp.apps.deephost.benebsworth.com/mcp`
3. Add it, then choose **Connect** — the browser sign-in flow starts.

### Cursor

Add the server to `mcp.json` (Settings → MCP → Add new MCP server, or
edit the file directly):

```json
{
  "mcpServers": {
    "startup-atlas": {
      "url": "https://gamma-systems-pty-ltd-startup-atlas-mcp.apps.deephost.benebsworth.com/mcp"
    }
  }
}
```

Cursor prompts you to authenticate the first time the server is used;
that starts the same browser flow.

### Any other MCP client (the generic flow)

1. Point the client at the `/mcp` URL as a Streamable HTTP server.
2. On the first call the server answers `401` with a
   `WWW-Authenticate` header naming the protected-resource metadata
   URL. The client fetches it, then the authorization-server metadata,
   and learns the endpoints above.
3. The client registers itself dynamically (`POST /oauth/register`) —
   no client ID or secret is ever handed out by a human — and opens
   the authorize URL with PKCE (S256 is the only challenge method
   supported, as the MCP specification requires).
4. You sign in with Google (next section). The server verifies the
   resulting Google ID token against Google's JWKS, checks your email
   against the allow-list, and issues its own tokens: an **access
   token valid for 1 hour** and a **refresh token valid for 30 days**
   that rotates on every use. The client stores them and refreshes
   silently from then on.
5. Tool calls are ordinary JSON-RPC POSTs to `/mcp` with
   `Authorization: Bearer <access token>` and
   `Accept: application/json, text/event-stream`. Keep the
   `Mcp-Session-Id` header the server returns from `initialize` —
   `/mcp` is session-based. (The admin surface is the opposite:
   stateless, no session header issued or needed.)

**What you see at the Google step.** A standard Google sign-in and a
consent screen for the Atlas OAuth app requesting the `openid`,
`email` and `profile` scopes — nothing else; the server never asks for
Drive, Gmail or any other Google data. Because the consent screen is
in Testing mode, Google shows its "unverified app" notice; that is
expected for this deployment, and only listed test users can proceed
past it. One account-specific gotcha: if your Google account offers
only a **passkey** at the "verify it's you" step (the owner's account
does), complete sign-in on a phone where the passkey works — a cloud
or remote browser cannot.

**Clients without OAuth support** can call `/mcp` directly with a
Google ID token as the Bearer token (obtained from Google's own
sign-in); it is verified the same way — signature, issuer, audience,
expiry, `email_verified`, allow-list:

```sh
curl -s -X POST https://gamma-systems-pty-ltd-startup-atlas-mcp.apps.deephost.benebsworth.com/mcp \
  -H "Authorization: Bearer $GOOGLE_ID_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

One hard limit: **`/oauth/register` sends no CORS headers**, so a
browser-based client cannot register cross-origin. Use a native
client (all of the above are), or register from a non-browser context.

## Tools on `/mcp` (18)

Grouped by purpose. Parameters are summarised; `tools/list` returns
each tool's full JSON Schema, and the server rejects unexpected
arguments, so introspect rather than guessing.

### Catalogue and opportunities (read: 4, write: 1)

- `atlas_get_catalogue_info` — catalogue revision, entry categories,
  access routes, write mode and the evidence requirements. A good
  first call: it tells you what the server can do and how fresh its
  data is.
- `atlas_search_opportunities` — search opportunities by name,
  organisation, ID or summary (`query`, optional `limit` 1–100).
- `atlas_get_opportunity` — one full entry plus its recorded
  provenance (`id`).
- `atlas_validate_opportunity` — validate a proposed entry and
  provenance without writing; returns the `expectedRevision` an add
  requires. Validates structure, not the truth of the claims.
- `atlas_add_opportunity` *(write)* — append a validated entry.
  Add-only, safe to retry with identical content.

### Partners (read: 3, write: 1)

- `atlas_search_partners` — search partner leads and their reviewed
  metadata. A name match is a lead, not proof of a relationship.
- `atlas_get_partner` — one exact partner name and its reviewed record.
- `atlas_validate_partner` — validate reviewed partner metadata
  (website, description, source, review date) and get its revision.
- `atlas_upsert_partner` *(write)* — add or update reviewed metadata
  for an **existing** lead, against a fresh validated revision. New
  lead names still enter through the research workflow, not this tool.

### Startup records (read: 3, write: 1)

- `atlas_search_startup_records` — search the authoritative startup
  records (names, websites, descriptions, funding history as recorded
  in the source data).
- `atlas_get_startup_record` — the complete record for one canonical
  startup ID, including its funding rounds and sources, plus the
  record digest an edit needs.
- `atlas_validate_startup_edit` — preview an edit against the record
  digest; nothing is persisted.
- `atlas_apply_startup_edit` *(write)* — apply a validated edit,
  guarded by the exact revision and validation token. See the
  [record editing contract](MCP-RECORD-EDITS.md) for the full
  workflow.

### Crawl registry and live status (read-only: 4)

- `atlas_list_crawl_runs` — recorded crawl runs, filterable by
  `mode`, `source_id`, `status` and `since`.
- `atlas_get_crawl_run` — one run's full record, including its outcome
  and linked publication PR.
- `atlas_get_crawl_claims` — current per-source crawl claims; an
  expired lease is reported `stale`, never as live.
- `atlas_crawl_status` — **live** crawl progress from the record the
  crawl itself publishes while running: per-mode sources done/total,
  candidates so far, current source, heartbeat age. When no crawl is
  running it returns the last completed run's summary; an unreachable
  record is reported `unknown`, never invented.

The registry is advisory: no MCP tool triggers a crawl, and a claim
never authorises fetching a source. See the
[crawl coordination contract](CRAWL-COORDINATION.md).

### Issue filing (write: 1)

- `atlas_create_issue` — file a GitHub issue in
  `castlemilk/startup-atlas` (the default `repo`) through the GitHub
  API. Create-only — it never edits, closes or comments. With a
  `dedup_key` it first returns any open issue carrying the
  `[kpi-backlog:KEY]` marker instead of filing a duplicate, and a
  failed create is never retried, so an uncertain outcome is never
  silently doubled. Error codes and token setup are in
  [MCP-HTTP.md](MCP-HTTP.md#github-issues-atlas_create_issue).

### Writes, precisely

Four tools write: `atlas_add_opportunity`, `atlas_upsert_partner`,
`atlas_apply_startup_edit`, `atlas_create_issue`. On the hosted
server a write needs **both** write mode on (it is:
`writeEnabled: true`) **and** your Google account on the write
allow-list — a read-allow-listed account calling a write tool gets
`WRITE_FORBIDDEN`. Data writes act on the server's own copy of the
repository and are **not a publication path**: nothing commits, pushes
or publishes from them. The exception is `atlas_create_issue`, which
files a real issue immediately. Published-data changes go through the
local stdio server against a checkout (branch → review → merge) or
the private Site's draft-PR flow.

### What `/mcp` does not do

- **No graph traversal tool.** Relationships are explored in the
  site's graph explorer, or queried from the live index tables
  (`edges`, `relationships`) — see "Other ways to consume the data".
- **No source fetching.** The server never fetches a URL to verify a
  claim; the caller checks the primary source and records provenance.
- **No crawl control and no deletes.** Writes are add/update-only
  within the shapes above.

## Example prompts

Once connected, these are the shapes that work well:

- *Search:* "Use Startup Atlas to search opportunities for
  'accelerator' in the catalogue, then read the full entry and
  provenance for the best match."
- *Startups and funding rounds:* "Search the Atlas startup records
  for Airwallex, read its full record, and summarise its funding
  rounds — stage, amount, date and who led each round — from the
  recorded sources."
- *Partners:* "Is Airtree already a partner lead in Startup Atlas?
  Show me its reviewed metadata and where it came from."
- *Crawl status:* "Is an Atlas crawl running right now? If so, which
  mode and source is it on, how many candidates so far, and how old
  is the heartbeat?"
- *Before proposing data:* "Validate this opportunity entry against
  the Atlas catalogue and tell me the revision I would need to add
  it — do not add it yet."

## Admin surface (`/mcp/admin` and `/admin`)

A separate MCP surface on the same host serves the **review queue**
(the human-in-the-loop gate between crawled candidates and published
data), alongside a browser panel at `/admin`. It is not part of the
public integration offer: it answers only to admin-allow-listed
accounts, and one scoped service credential used by the unattended
agent review pass (valid on this surface only — it is refused on
`/mcp` and means nothing to the panel).

Tools (8 in the code on `main`; the live deployment currently serves
6 of them — the batch pair below awaits a redeploy — see the
`/health` note above):

- `atlas_admin_list_review_queue` — queue entries with `kind`,
  `status` and confidence-`band` filters, lowest confidence first,
  each carrying its confidence-gating verdict.
- `atlas_admin_get_review_item` — one entry's full evidence plus the
  verdict and its reason.
- `atlas_admin_decide_review_item` — approve, reject or **defer** one
  entry. A note citing the evidence relied on is required; the tool
  refuses a decision without one.
- `atlas_admin_preview_review_batch` / `atlas_admin_decide_review_batch`
  — dry-run then apply a batch of decisions in one write-back commit,
  guarded by the preview's revision; a stale batch is refused whole.
- `atlas_admin_undo_review_decision` — revert any decision (human,
  auto-gate or agent) back to pending; the undo is itself committed.
- `atlas_admin_get_review_gating` — the confidence-gating config
  (thresholds per kind; `enabled: false` is the kill switch).
- `atlas_admin_list_auto_applied` — the audit trail of decisions the
  auto-gate made without a human.

Decisions write back to `data/review-queue.json` through the GitHub
Contents API and are attributed (`decided_by`): the owner's email,
`auto-gate`, or `agent-review`. Unlike `/mcp`, this surface is
**stateless** — no `Mcp-Session-Id` is issued or honoured. Full detail:
[MCP-HTTP.md](MCP-HTTP.md#admin-mcp-mcpadmin--the-review-queue-as-tools).

## Other ways to consume the data

MCP is one consumption path, not the only one:

- **Query console (SQL in the browser).** Run analytical SQL against
  the published catalogue with DuckDB-WASM, entirely client-side:
  `query.html` on the published site, or the copy served beside the
  index at
  `https://storage.googleapis.com/single-station-515408-g9-atlas-index/query.html`.
  Tables include `opportunities`, `partners`, `startups` and
  `funding_rounds`. See [the query console doc](QUERY.md).
- **The live index (files, no auth).** A public, versioned snapshot
  of the reviewed corpus as Parquet tables. Start from the pointer
  `https://storage.googleapis.com/single-station-515408-g9-atlas-index/latest.json`
  (it names the current `version`, its `manifest` and the
  `source_revision` it was built from), then fetch the manifest and
  the tables you need. 11 tables, including `edges` and
  `relationships` for graph-shaped questions. See
  [the live index doc](LIVE-INDEX.md).
- **The raw repository JSONs.** `data/catalogue.json`,
  `data/startup-research.json`, `data/partners-reviewed.json` and
  friends in this repo are the reviewed sources the other paths are
  built from — fine for one-off analysis, with the caveat that they
  change only through the review workflow.

## Troubleshooting

**`GET /health` first.** It separates "server down" from "my client /
account" in one request, and its `tools` / `adminTools` counts tell
you what the deployment actually serves.

| Symptom | Meaning | Fix |
| --- | --- | --- |
| `401` on `/mcp`, `WWW-Authenticate` header present | No token, or an expired/invalid one | Reconnect/authenticate in the client; it should refresh silently — if it can't, remove and re-add the connector |
| `401` on `/mcp/admin` | Same, on the admin surface | Authenticate; the admin surface needs its own token (its protected-resource metadata is at `/.well-known/oauth-protected-resource/mcp/admin`) |
| `403` on `/mcp`, or `error=access_denied` at the OAuth callback | Your Google account verified fine but is **not on the allow-list** (or not a consent-screen test user) | Ask the owner to add your account; there is no self-service path |
| `403` on `/mcp/admin` with a valid token | Authenticated, but not on the **admin** allow-list — a stricter list than `/mcp`'s | Expected for non-admin accounts; use `/mcp` |
| Sign-in worked an hour ago, now `401` | Access tokens live 1 hour; the client's refresh should have handled it | Re-authenticate once; if it recurs, the server likely restarted/redeployed — **all OAuth state is in server memory**, so a restart invalidates registrations, sessions and refresh tokens, and every client must sign in again |
| "Unknown or expired login session" at the callback | The login session lives 10 minutes and the consent step took longer | Restart the flow from the client's authenticate action |
| Browser-based client cannot register | `/oauth/register` has no CORS support | Use a native MCP client, or register from a non-browser context |
| Google shows only a passkey prompt you can't satisfy here | Account-level sign-in setting, not a server fault | Complete the sign-in on a phone |
| Tool returns `WRITE_FORBIDDEN` | Your account is read-allow-listed but not write-allow-listed | Ask the owner for write access, or use the stdio server on your own checkout |
| Tool returns `GITHUB_TOKEN_MISSING` / `READ_ONLY` (issue filing, admin write-back) | The server-side capability is not configured in that deployment | Operator issue — see [MCP-HTTP.md](MCP-HTTP.md) |

## Self-hosting

Everything above is the hosted deployment, but the same server runs
anywhere Node 20+ does: Google Cloud Console setup, the environment
variable reference, DeepHost handler-mode notes and the security
model are in [MCP-HTTP.md](MCP-HTTP.md). The local stdio server —
the write path for published data — is in [MCP.md](MCP.md).

---

*Accuracy: this guide was verified on 26 Nov 2026 against the code on
`main` (commit `5e0e827`), the live `/health` and OAuth discovery
endpoints, and the live index pointer. The one known drift is
`adminTools` (6 live vs 8 in code, above). The backend test suite
(`npm --prefix backend/mcp test`, 103 tests) covers the stdio, HTTP /
OAuth, admin and issue-filing behaviour described here.*
