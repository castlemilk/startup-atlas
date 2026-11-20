# Startup Atlas agent runbook

## Establish current state

1. Inspect main, open PRs, the latest Pages run and the active hourly iteration before starting; do not overwrite concurrent work.
2. Use the Startup Atlas HTTP MCP connection status tool. If connected, search before adding and use validate → add for a source-backed opportunity. Add creates a **draft PR**, not a deployment; check its exact diff and CI before any merge.
3. The deployed private MCP and the public Pages site are separate deployments. Confirm the Site version and live tool discovery; a merge to GitHub alone does not update the MCP.

## Collector and research

The crawler uses curated sources and approved partner websites. The owner requested no robots.txt requests. The shared URL normalizer rejects robots.txt path segments before DNS or HTTP, including percent-encoded paths and redirect destinations. This is a source-access prohibition, not robots-rule parsing; no robots content is fetched or inspected. Keep HTTPS/approved-host checks, global address validation, response limits, rate limits and 429 stop behavior. Do not defeat browser challenges, authentication or network access controls.

Before starting a crawl, record it as described in [the crawl coordination contract](CRAWL-COORDINATION.md): run ID, mode, sources, base revision and where the artifact will land. The registry is advisory only — a claim does not authorise fetching a source and never overrides a transport guard. Do not base a PR on a stale checkout: rebase to current main and re-check open PRs and the Pages run before raising anything.

### Coordinated crawl workflow (worked example)

Use the read-only registry tools (`atlas_list_crawl_runs`, `atlas_get_crawl_run`, `atlas_get_crawl_claims`) through the local stdio MCP or the deployed MCP before, during and after every crawl:

1. **Check for live claims first.** Query `atlas_get_crawl_claims` for the sources you plan to crawl. A live claim means another worker owns that source until its lease expires — do not start on it. A stale claim (expired lease, run still `running`) must be recovered explicitly, with the evidence recorded, before the source is re-claimed.
2. **Record the run before it starts.** Append a record to `data/crawl-runs.json` through the normal branch/review workflow (until claim tools exist, there is no MCP write for this): `run_id` (`crawl-<YYYYMMDD>-<mode>-<nn>`), `mode`, `scope.source_ids`, the seed file's SHA-256, the 40-character main commit the run is based on as `catalogue_revision`, `claimed_by`, `claimed_at`, a 30-minute `lease_expires_at` for a partners run, and `status: claimed`. Also record where the artifact will land.
3. **Run the crawl.** Locally (`npm run crawl -- partners --follow 0`) or via the manual Partner research crawl workflow dispatch, which uploads `research/crawl/` as a `partner-crawl-review` artifact retained 14 days.
4. **Record the outcome.** Update the same record: `status` (`completed` / `failed`), `finished_at`, `outcome` counts, `snapshot_sha256` of the crawl snapshot, and `artifact_url`. The snapshot itself stays gitignored (or in the Actions artifact); only its digest is committed. The run stays `review_status: unreviewed` until a human has read its candidates.
5. **Review, then publish with the run ID.** Validate candidates (`atlas_validate_opportunity` / `atlas_validate_partner`), then add/propose through the normal path, referencing the `run_id` in the proposal so the published entry traces back to the crawl that found it. After the publishing PR merges, update the run record to `review_status: published` with `published_pr` set.

Worked example: the 20 Nov 2026 partners run `crawl-20261120-partners-01` (5 sources, 0 fetched, DNS-blocked) is the first registry entry. A follow-on partners run would first check `atlas_get_crawl_claims` (that run's lease has long expired, so its sources are free), record `crawl-20261121-partners-01` with the current main revision and the five partner source IDs, dispatch the Partner research crawl workflow, then record the outcome and artifact URL before any candidate is reviewed.

Run `npm run crawl -- partners --follow 0` to discover directory leads and `npm run crawl -- logos --approved data/partner-logo-seeds.csv --partners-only --follow 0 --logo-limit 2` to stage candidates. Approved websites can omit a Wikidata ID for crawling; identity import still requires one. Allow additional CDN hosts only when independently identified on the official organisation page.

A page can contain portfolio companies' logos. Header/home-link placement and structured metadata help rank candidates but never prove identity. Check the actual asset and its attribution/terms before publishing. The collector stages opaque files; it does not automatically publish them. Avoid silently merging a provider's partner list into an unrelated screenshot index. Record source URL, review date, relationship and eligibility separately.

The manually triggered **Partner research crawl** GitHub Actions workflow can run the existing bounded collector and retain review artifacts for 14 days. Check each source's status and candidate disposition; a successful job does not imply a successful download or an approved logo. Never add a workflow that runs a live crawl on every PR.

The workflow also produces `partner-update-candidates.json` from the approved-site snapshot. Each description is unreviewed page metadata, not a factual determination. Confirm the exact organisation and current source, edit the text if needed, and add `reviewed_at` in YYYY-MM-DD form. For an existing lead, use HTTP MCP `atlas_validate_partner`, inspect the previous record and fresh revision, then `atlas_propose_partner` to open a draft PR. Review its diff and CI; only the merged and deployed data appears in the partner index. Never replay an unconfirmed write: inspect the branch/PR first.

The source implementation uses stable partner/startup proposal branches independent of the validation revision and JSON object key order. Retrying a matching proposal only returns a receipt after verifying its one-file diff, complete file content, single-parent history, ancestry and exact PR head. An existing branch without a confirmed PR, a missing branch with an existing PR, or any unverified change stops for manual inspection; it never completes an uncertain partial proposal. New proposals still require a fresh main revision. Confirm these capabilities are deployed before relying on them.

### Programme discovery provenance

`programs` emits unreviewed **source observations**, not a count of unique programmes. A repeated programme link on one source page is deduplicated, while observations from another registry source or final page keep their own `source_id`, `source_url`, `source_scope` and `checked_at`. The review CSV retains the same attribution and leaves approval blank. `source_scope` describes the directory, not applicant eligibility; a shared operator or domain does not establish that two programme names are the same offering.

Read `coverage` before interpreting an empty candidate list. `pages_attempted` counts unique requested URLs using the collector's cache key, not HTTP exchanges across redirects. `page_observations` includes cached pages reused by another source, with reuse explicit globally and per source. Fetch states distinguish all-success, partial and total failure; successful text with no matches may still need parser review. Observed, returned and omitted candidate counts expose the 1,000-observation output limit globally and per source. A truncated batch is not a complete programme inventory.

The [17 November bounded research packet](../research/programmes/2026-11-17/README.md) records an actual four-source DNS failure, an offline replay of those saved outcomes, and separately acquired primary-source research. A readable web-tool excerpt does not turn a failed direct crawl into a successful download. Keep research claims and pending identity/terms checks outside the published catalogue until reviewed through the normal proposal path.

### Wikidata metadata outcomes

In `discover`, a row's `status` describes the **name search**, not whether entity metadata was retrieved. Each candidate separately records `metadata_fetch.status`, the exact API request `source`, and `checked_at`; failures also retain a `reason`. The candidate's human-readable Wikidata source and any directory provenance are preserved. `checked_at` is a retrieval check, not an identity or factual review date.

| Metadata status | Meaning | `properties` |
| --- | --- | --- |
| `ok` | The requested entity supplied usable claims. Explicit empty claim maps, including the legacy API's empty-array representation, are valid. | Extracted supported values, or `{}` when none were extracted. |
| `failed` | The request, HTTP response, JSON/API response or entity-batch envelope failed. | Absent; metadata remains unknown. |
| `unavailable` | A successful batch omitted the QID, marked it missing, returned a conflicting entity ID or supplied unusable claims. The reason distinguishes these cases. | Absent; metadata remains unknown. |

The review CSV includes `metadata_status`, `metadata_checked_at`, `metadata_source` and `metadata_reason`, alongside the existing source fields and blank approval column. A blank metadata status in an older export does not establish success. Even `ok` with empty properties means only that this bounded extraction found no supported values; it does not prove that the organisation lacks a founder, website or location. Wikidata candidates still require identity and primary-source review before publication. The [Wikibase Action API documentation](https://www.mediawiki.org/wiki/Wikibase/API) describes the legacy empty-map representation and unsuccessful API responses.

Read `metadata_coverage` independently of the search rows. It counts unique requested QIDs and their final successful, failed and unavailable outcomes. Repeated candidate references reuse the same per-QID outcome, including failures and provenance, within one discovery run. `api_operations` counts `wbgetentities` client calls, including failed oversized parent batches before bounded splitting and calls rejected by the transport after a rate limit; it is not a count of HTTP exchanges or name searches. A partially recovered batch retains its successful entities. JSON and CSV are saved before the CLI returns: all requested metadata failing or unavailable returns exit 1, while any successful entity (including valid empty claims) returns exit 0 with explicit coverage. Successful searches with no matches require no metadata request and return exit 0; total search failure still returns exit 1. Partial output is never proof of complete collection.

## Private MCP and GitHub OAuth

The Site uses Sites identity at the MCP boundary and a separate, repository-scoped GitHub App OAuth connection. Use `atlas_get_connection`, then read/search tools to confirm real access. The repository implements hosted partner update proposals; confirm the deployed Site version and live tool discovery before claiming the tools are available. Local stdio also provides reviewed partner metadata updates.

Cloudflare Workers rejects `redirect: 'error'` for fetch. Use `redirect: 'manual'` and reject non-success responses; never forward credentials across redirects. Workers' native fetch needs its global receiver; use the existing `globalThis.fetch.bind(globalThis)` defaults. Node-only mocks can miss both issues. Preserve the workerd and receiver-checking tests, single-use OAuth state, encrypted storage, token-specific revocation and uncertain-write handling.

A `CONNECT_GITHUB` error can mean several different things. Check the exact code path and sanitized Site logs; do not expose or repeat callback URLs, authorization codes, credentials or token request bodies. An unconfirmed token exchange may have succeeded remotely: never replay its one-time code or a possibly rotated refresh token. Start a fresh authorization only when needed.

## Deployment and environment

The public site deploys through the repository's Pages workflow. The private MCP Site must be published through its own source/version flow and remains owner-private. Confirm the live version, test MCP connection and search, and keep OAuth/permissions and D1 bindings intact.

Local sandbox DNS can fail even when GitHub and web connectors work. Do not claim a local crawl succeeded from connector access, bypass network controls, expose short-lived credentials, deploy an old Site version as if it included new code, or send source credentials to a third party. If the Site source host is unavailable, finish independent work, report the exact blocker, and resume publication from an authorized network-enabled environment. The connector and hosted MCP may each have independent GitHub authorizations.

## Tests

Use `npm test`, `npm run test:mcp`, `npm --prefix backend/hosted test` and the relevant builds as appropriate. Hosted OAuth also needs Workers-compatible verification, not solely mocks. Check the exact commit and deployment result; run a live read through the MCP after publishing.

## Search publication

The public browser builds its Fuse search from the currently loaded catalogue and reviewed partner records; there is no independent persistent search index to update. MCP opportunity PRs include the generated catalogue, and partner proposals update the reviewed data. After merge, Pages publishes those files; a fresh page load revalidates both files with the browser cache. Check exact and typo searches after deployment. A draft PR or local MCP write is not searchable on the public site until merged and deployed.

The separate knowledge graph explorer builds a SQLite/FTS4 snapshot during `npm run build`. The Pages workflow builds and verifies a new public snapshot after main updates or a manual Pages run on main. Pull requests keep the same build check and run checks for their changed area, with no Pages build or browser screenshots. Run Deep Atlas checks manually for the full data, MCP, Go, browser and screenshot suites. For startup additions or edits, verify each claim and use `atlas_validate_startup` followed by `atlas_propose_startup` only if those tools are exposed by the deployed private MCP. Review the draft and CI; after merge check Pages and compare the MCP's published `revision` with `mainRevision`. The generated SQLite and published graph JSON come from the same build. If the MCP source host cannot be reached, do not describe repository-only changes as live MCP capabilities. See [knowledge graph storage and updates](KNOWLEDGE-GRAPH.md).

## Company profile evidence

`python3 scripts/crawl.py company-profiles --approved data/company-profile-seeds.csv --partner PsiQuantum --follow 2` collects page-scoped company research using the same HTTPS/public-address, response-size, throttle, redirect and rate-limit controls as partner profiles. The CSV retains the historical `partner` column name but this mode validates against researched startup names and their reviewed official website hosts, not partner leads. It does not modify the partner importer or publish records.

Packets retain page descriptions, structured subjects (including source-claimed person roles/images/sameAs), logo candidates, labelled image candidates and outbound social links. These are observations, not verified profiles, headshots, employment or company-owned accounts. A team page can contain other organisations and people; never attach its images or socials to the company automatically. Image and social destinations are not fetched. Coverage distinguishes failed pages from successful empty results. Inspect each source, subject and asset permission before a separate reviewed publication.

Company packets also stage newsroom and professional-bio candidates. A digest-verified company scope can name the exact newsroom, article and bio documents in priority order. The collector reads at most the lower of the scope's `max_follow` and the caller's `--follow` after the homepage and skips denied URLs. Review and approve those documents separately before collection. An unscoped seed still uses the existing bounded team, portfolio and About discovery.

Article candidates retain each fetched source and explicit publication-date evidence. Document-level publication metadata belongs in the page head. Dates inside body markup require an explicit article item that names the current or declared canonical URL. Structured dates require active JSON-LD and an explicit matching document reference from `url`, `mainEntityOfPage` or `@id`. Fragment-only identifiers leave the date unbound, and disagreement among document references withholds that structured date. A same-host canonical groups copies only when the canonical article was also collected in the batch. Distinct publication assertions are retained within a bound. Missing, conflicting or incomplete evidence leaves the day unset. Reviewers classify the underlying event, its date and its financial scope.

A professional-bio candidate requires a structured person on their stated bio page, a name on the reviewed founder roster, and an explicit affiliation with the company's official website. Direct LinkedIn references on that person record and the person's declared image remain candidates until reviewed.

Use the [existing image intake and rights review](../contracts/mcp_assets/README.md) for selected portrait candidates. A candidate can cite an unavailable asset host. Its URL does not grant asset retrieval or publication approval, and scoped document approval covers documents only. A collector code change requires a separately reviewed implementation digest for the scoped launcher.

Retain the dated company-profile packet for review. The exact candidate and source fields stay in that packet. The offline replay records page outcomes and the SHA-256 of the original packet. Use the digest to find the packet when reviewing the accompanying evidence.

PsiQuantum's homepage links LinkedIn, X and YouTube. Its official `/press-materials` page offers credited logo downloads, but `/terms-conditions` restricts copying/display and trademark use without permission. The directory links the press source without copying or embedding those logos. The source link is not a licence or an assertion that rights have cleared.
