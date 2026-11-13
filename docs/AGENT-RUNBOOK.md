# Startup Atlas agent runbook

## Establish current state

1. Inspect main, open PRs, the latest Pages run and the active hourly iteration before starting; do not overwrite concurrent work.
2. Use the Startup Atlas HTTP MCP connection status tool. If connected, search before adding and use validate → add for a source-backed opportunity. Add creates a **draft PR**, not a deployment; check its exact diff and CI before any merge.
3. The deployed private MCP and the public Pages site are separate deployments. Confirm the Site version and live tool discovery; a merge to GitHub alone does not update the MCP.

## Collector and research

The crawler uses curated sources and approved partner websites. The owner requested no robots.txt requests. Keep HTTPS/approved-host checks, global address validation, response limits, rate limits and 429 stop behavior. Do not defeat browser challenges, authentication or network access controls.

Run `npm run crawl -- partners --follow 0` to discover directory leads and `npm run crawl -- logos --approved data/partner-logo-seeds.csv --partners-only --follow 0 --logo-limit 2` to stage candidates. Approved websites can omit a Wikidata ID for crawling; identity import still requires one. Allow additional CDN hosts only when independently identified on the official organisation page.

A page can contain portfolio companies' logos. Header/home-link placement and structured metadata help rank candidates but never prove identity. Check the actual asset and its attribution/terms before publishing. The collector stages opaque files; it does not automatically publish them. Avoid silently merging a provider's partner list into an unrelated screenshot index. Record source URL, review date, relationship and eligibility separately.

The manually triggered **Partner research crawl** GitHub Actions workflow can run the existing bounded collector and retain review artifacts for 14 days. Check each source's status and candidate disposition; a successful job does not imply a successful download or an approved logo. Never add a workflow that runs a live crawl on every PR.

The workflow also produces `partner-update-candidates.json` from the approved-site snapshot. Each description is unreviewed page metadata, not a factual determination. Confirm the exact organisation and current source, edit the text if needed, and add `reviewed_at` in YYYY-MM-DD form. For an existing lead, use HTTP MCP `atlas_validate_partner`, inspect the previous record and fresh revision, then `atlas_propose_partner` to open a draft PR. Review its diff and CI; only the merged and deployed data appears in the partner index. Never replay an unconfirmed write: inspect the branch/PR first.

## Private MCP and GitHub OAuth

The Site uses Sites identity at the MCP boundary and a separate, repository-scoped GitHub App OAuth connection. Use `atlas_get_connection`, then read/search tools to confirm real access. The repository implements hosted partner update proposals; confirm the deployed Site version and live tool discovery before claiming the tools are available. Local stdio also provides reviewed partner metadata updates.

Cloudflare Workers rejects `redirect: 'error'` for fetch. Use `redirect: 'manual'` and reject non-success responses; never forward credentials across redirects. Workers' native fetch needs its global receiver; use the existing `globalThis.fetch.bind(globalThis)` defaults. Node-only mocks can miss both issues. Preserve the workerd and receiver-checking tests, single-use OAuth state, encrypted storage, token-specific revocation and uncertain-write handling.

A `CONNECT_GITHUB` error can mean several different things. Check the exact code path and sanitized Site logs; do not expose or repeat callback URLs, authorization codes, credentials or token request bodies. An unconfirmed token exchange may have succeeded remotely: never replay its one-time code or a possibly rotated refresh token. Start a fresh authorization only when needed.

## Deployment and environment

The public site deploys through the repository's Pages workflow. The private MCP Site must be published through its own source/version flow and remains owner-private. Confirm the live version, test MCP connection and search, and keep OAuth/permissions and D1 bindings intact.

Local sandbox DNS can fail even when GitHub and web connectors work. Do not claim a local crawl succeeded from connector access, bypass network controls, expose short-lived credentials, deploy an old Site version as if it included new code, or send source credentials to a third party. If the Site source host is unavailable, finish independent work, report the exact blocker, and resume publication from an authorized network-enabled environment. The connector and hosted MCP may each have independent GitHub authorizations.

## Tests

Use `npm test`, `npm run test:mcp`, `npm --prefix hosted test` and the relevant builds as appropriate. Hosted OAuth also needs Workers-compatible verification, not solely mocks. Check the exact commit and deployment result; run a live read through the MCP after publishing.

## Search publication

The public browser builds its Fuse search from the currently loaded catalogue and reviewed partner records; there is no independent persistent search index to update. MCP opportunity PRs include the generated catalogue, and partner proposals update the reviewed data. After merge, Pages publishes those files; a fresh page load revalidates both files with the browser cache. Check exact and typo searches after deployment. A draft PR or local MCP write is not searchable on the public site until merged and deployed.

The separate knowledge graph explorer builds a SQLite/FTS4 snapshot during `npm run build`. The Pages workflow rebuilds on main updates and daily at 03:17 UTC. For startup additions or edits, verify each claim and use `atlas_validate_startup` followed by `atlas_propose_startup` only if those tools are exposed by the deployed private MCP. Review the draft and CI; after merge check Pages and compare the MCP's published `revision` with `mainRevision`. The generated SQLite and published graph JSON come from the same build. If the MCP source host cannot be reached, do not describe repository-only changes as live MCP capabilities. See [knowledge graph storage and updates](KNOWLEDGE-GRAPH.md).
