# Startup Atlas MCP — tool reference

The complete, per-tool reference for both MCP surfaces served by
`backend/mcp/`: the 18 catalogue tools on `/mcp` (and the identical
stdio server) and the 13 tools on `/mcp/admin` (8 review-queue
tools and 5 distributed-crawl work-queue tools).

Companion docs: [install & connect quickstart](INSTALL-MCP.md)
(the fastest path to a working client),
[integration guide](MCP-INTEGRATION.md) (connect a
client, worked prompts, troubleshooting),
[MCP over HTTP](MCP-HTTP.md) (operator reference: OAuth, environment
variables, admin panel, security model),
[local stdio server](MCP.md) (entry/provenance contract, persistence),
[record editing contract](MCP-RECORD-EDITS.md) (the startup-edit
schema in full), [crawl coordination contract](CRAWL-COORDINATION.md)
(run/claim schema and the claim → run → review → publish sequence).

Verified against the code on `main` on 27 Nov 2026
(`backend/mcp/server.mjs`, `backend/mcp/admin-mcp.mjs`,
`backend/mcp/http-server.mjs`) and the live `/health` of the hosted
deployment, which reports `tools: 18`, `adminTools: 13`. `tools/list`
against a live endpoint remains the final authority for any one
deployment — a deployment built from older code serves fewer tools.

## Conventions that apply to every tool

- **Call shape.** Tools are called with the MCP `tools/call` method.
  Over HTTP that is a JSON-RPC 2.0 POST; the examples below use the
  hosted endpoint and the envelope every client sends:

  ```json
  {"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"<tool>","arguments":{ }}}
  ```

- **Success shape.** A successful call returns the result twice: as a
  JSON string in `content[0].text` and as `structuredContent`. The
  examples show the `structuredContent` object.
- **Error shape.** A failed call returns `isError: true` with
  `structuredContent` of `{ "code", "message" }` (plus `details` on
  some validation errors). Codes are stable strings — branch on
  `code`, never on the message text. Common codes:
  `VALIDATION_ERROR` (bad or unexpected argument — the server rejects
  any argument not in the tool's schema), `UNKNOWN_TOOL`,
  `NOT_FOUND`, `READ_ONLY` (write attempted on a read-only server),
  `WRITE_FORBIDDEN` (HTTP: account not on the write allow-list),
  `STALE_REVISION` (the data changed since validation — re-read and
  re-validate), `WRITE_BUSY` (another local writer holds the lock),
  `EVIDENCE_NOTE_REQUIRED` (admin decisions), `QUEUE_CONFLICT`
  (admin batch revision mismatch), `NOT_CONFIGURED`,
  `GITHUB_TOKEN_MISSING` and the `GITHUB_*` family documented in
  [MCP-HTTP.md](MCP-HTTP.md#github-issues-atlas_create_issue).
- **Auth.** `/mcp` over HTTP requires a Bearer token (this server's
  OAuth access token, or a Google ID token) for an allow-listed
  Google account; the four write tools additionally require write
  mode plus a write-allow-listed account. `/mcp/admin` requires an
  admin-allow-listed account or the scoped service credential.
  Stdio has no caller identity: `--write` alone gates writes. Full
  detail in [MCP-HTTP.md](MCP-HTTP.md).
- **Sessions.** `/mcp` is session-based: keep the `Mcp-Session-Id`
  returned by `initialize` (an unknown or foreign session id gets a
  404 `Unknown MCP session id.`). `/mcp/admin` is stateless: no
  session id is issued or honoured, GET/DELETE answer 405.
- **The server never fetches sources.** No tool browses, crawls or
  verifies a claim against the live web. The caller checks the
  primary source and records provenance. Validation is structural,
  never a truth check.
- **Revisions are digests.** `revision` / `expectedRevision` /
  `recordRevision` values are SHA-256 hex digests of the data they
  guard. They are preconditions, not version numbers: pass back
  exactly the value the corresponding read/validate call returned.

## Catalogue and opportunities

### `atlas_get_catalogue_info` — read

Catalogue revision, entry categories, access routes, write mode and
the evidence requirements. A good first call: it reports how much
data this server holds and whether it can write.

| Parameter | Type | Required | Notes |
| --- | --- | --- | --- |
| — | — | — | No parameters. |

Returns: `{ revision, writeEnabled, opportunities, partnerLeads,
kinds[], accessRoutes[], publication, evidence }` — the last two are
human-readable statements of the publication path and the evidence
rules.

```json
{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"atlas_get_catalogue_info","arguments":{}}}
```

```json
{"revision":"<sha256>","writeEnabled":true,"opportunities":124,"partnerLeads":227,"kinds":["accelerator","grant"],"accessRoutes":["application","referral"],"publication":"Local repository edits only. …","evidence":"Sources are supplied by the caller, not fetched or independently verified by this server. …"}
```

### `atlas_search_opportunities` — read

Search opportunities by name, organisation, ID or summary. Includes
local additions awaiting publication.

| Parameter | Type | Required | Notes |
| --- | --- | --- | --- |
| `query` | string ≤ 200 chars | no | Default `""` (matches all). |
| `limit` | integer 1–100 | no | Default 20. |

Returns: `{ revision, total, entries[] }` — `total` counts all
matches; `entries` is capped at `limit`.

```json
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"atlas_search_opportunities","arguments":{"query":"accelerator","limit":5}}}
```

### `atlas_get_opportunity` — read

One full opportunity entry and, for MCP additions, its recorded
provenance.

| Parameter | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | string, slug pattern `^[a-z0-9]+(?:-[a-z0-9]+)*$` | yes | |

Returns: `{ revision, entry, provenance }` (`provenance` is `null`
for curated entries).

### `atlas_validate_opportunity` — read

Validate a proposed entry and its provenance — structure, dates,
HTTPS links, geography, duplicates — without writing. Returns the
`expectedRevision` an add requires. Validates structure, not the
truth of source claims.

| Parameter | Type | Required | Notes |
| --- | --- | --- | --- |
| `entry` | object | yes | The full opportunity schema — fields and rules in [MCP.md](MCP.md#entry-and-provenance-contract); `tools/list` returns the JSON Schema. |
| `provenance` | object | yes | `sourceUrls` exactly matching the entry's sources, plus a public `evidence` explanation and `reviewedOn` date. |

Returns: `{ status, revision, persisted: false, entry }` where
`status` is `valid` for a new entry or `already_present` for an exact
existing one.

### `atlas_add_opportunity` — write

Append one validated entry to `data/opportunities-added.json`.
Add-only; an exact retry with identical content returns
`already_present` and is safe. Never commits, pushes, publishes or
changes existing entries. Do not include private application details.

| Parameter | Type | Required | Notes |
| --- | --- | --- | --- |
| `entry` | object | yes | As validated. |
| `provenance` | object | yes | As validated. |
| `expectedRevision` | string, `^[a-f0-9]{64}$` | yes | From `atlas_validate_opportunity`. |

Returns: `{ status: "added" | "already_present", id, revision,
published: false }`. `published` is always `false`: publication goes
through the repository release workflow (see
[MCP.md](MCP.md#persistence-and-publication)).

```json
{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"atlas_add_opportunity","arguments":{"entry":{"id":"example-programme","…":"…"},"provenance":{"sourceUrls":["https://example.org/programme"],"evidence":"Terms read on the official page, 2026-11-27.","reviewedOn":"2026-11-27"},"expectedRevision":"<sha256 from validate>"}}}
```

## Partners

Partner records here are *reviewed metadata for existing leads*. A
name match is a lead, not proof of a provider relationship, and new
lead names enter through the research workflow — no tool creates one.

### `atlas_search_partners` — read

| Parameter | Type | Required | Notes |
| --- | --- | --- | --- |
| `query` | string ≤ 200 chars | no | Default `""`. |
| `limit` | integer 1–100 | no | Default 20. |

Returns: `{ revision, total, partners: [{ name, record }] }` —
`record` is the reviewed metadata, or `null` for a lead with none yet.

### `atlas_get_partner` — read

| Parameter | Type | Required | Notes |
| --- | --- | --- | --- |
| `name` | string 1–200 chars | yes | The exact lead name. |

Returns: `{ name, record, revision }`.

### `atlas_validate_partner` — read

Validate reviewed partner metadata and return the current revision.
Does not independently verify claims. Fails with `NOT_FOUND` for a
name that is not already a lead.

| Parameter | Type | Required | Notes |
| --- | --- | --- | --- |
| `name` | string 1–200 chars | yes | Existing lead name. |
| `record` | object | yes | Required: `website` (URI), `description` (8–500 chars), `source` (URI), `reviewed_at` (`YYYY-MM-DD`). Optional: `amounts` (≤ 10 structured currency records — original, currency, USD conversion, rate, rate date/source and conversion status, per [CURRENCY.md](CURRENCY.md)). |

Returns: `{ name, record, revision, persisted: false, previous }` —
`previous` is the record currently stored (or `null`).

### `atlas_upsert_partner` — write

Add or update reviewed metadata for an existing lead. Requires write
mode and the fresh revision from validation; no automatic
publication. Writes only `data/partners-reviewed.json`.

| Parameter | Type | Required | Notes |
| --- | --- | --- | --- |
| `name` | string 1–200 chars | yes | |
| `record` | object | yes | As validated. |
| `expectedRevision` | string, `^[a-f0-9]{64}$` | yes | From `atlas_validate_partner`. |

Returns: the stored `{ name, record, revision }` readback.

```json
{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"atlas_validate_partner","arguments":{"name":"Airtree","record":{"website":"https://www.airtree.vc/","description":"Australian venture capital firm investing from pre-seed to growth.","source":"https://www.airtree.vc/","reviewed_at":"2026-11-26"}}}}
```

## Startup records

The authoritative startup records (`data/startup-research.json` in
the server's checkout). IDs are canonical: `startup:<slug>` (pattern
`^startup:[a-z0-9]+(?:-[a-z0-9]+)*$`). The full edit schema, source
attribution rules and conflict/recovery cases are the
[record editing contract](MCP-RECORD-EDITS.md); this section is the
per-tool summary.

### `atlas_search_startup_records` — read

| Parameter | Type | Required | Notes |
| --- | --- | --- | --- |
| `query` | string ≤ 200 chars | no | Default `""`. |
| `limit` | integer 1–100 | no | Default 20. |

Returns: `{ revision, schemaVersion, sourceFile, origin:
"local_repository", total, records: [{ id, record, recordRevision }],
published: false }`. Reads the local snapshot only — it does not
fetch sources or read the published graph.

### `atlas_get_startup_record` — read

| Parameter | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | string, `startup:<slug>` | yes | |

Returns: the complete record descriptor — `{ id, record,
recordRevision, origin: "local_repository", published: false, … }`.
The `recordRevision` digest is the edit precondition for the two
tools below; it is a digest of this local snapshot, not a published
revision.

### `atlas_validate_startup_edit` — read

Preview an edit against its record digest: structure, merged limits
and source inheritance are validated; source truth is not. Nothing
is persisted.

| Parameter | Type | Required | Notes |
| --- | --- | --- | --- |
| `edit` | object | yes | The edit schema (canonical `id` plus the fields to change, each carrying its source) — full definition in [MCP-RECORD-EDITS.md](MCP-RECORD-EDITS.md). |

Returns: the merged preview plus `{ origin: "local_repository",
persisted: false, published: false }`, including the
`validationToken` and revision an apply requires.

### `atlas_apply_startup_edit` — write

Apply a validated edit to this server's local checkout only. Uses
the shared write lock and returns authoritative readback. Never
commits, pushes, merges or publishes. Inspect an uncertain result
before attempting another write — do not blind-retry.

| Parameter | Type | Required | Notes |
| --- | --- | --- | --- |
| `edit` | object | yes | The same edit that was validated. |
| `expectedRevision` | string, `^[a-f0-9]{64}$` | yes | From validation. |
| `validationToken` | string, `^[a-f0-9]{64}$` | yes | From validation. |

Returns: the post-write readback, in the shape of
`atlas_get_startup_record`.

## Crawl registry and live status

All four tools are read-only. No MCP tool triggers a crawl, and the
registry never authorises fetching a source. How crawls actually run
is described under [The crawl pipeline](#the-crawl-pipeline) below.

### `atlas_list_crawl_runs` — read

List recorded crawl runs from `data/crawl-runs.json`.

| Parameter | Type | Required | Notes |
| --- | --- | --- | --- |
| `mode` | string enum | no | One of the registry modes: `sites`, `discover`, `programs`, `partners`, `captures`, `apply-reviewed`, `logos`, `partner-candidates`, `profiles`, `company-profiles`, `portraits`, `news`. (The scheduled workflow runs the 8 modes listed under the crawl pipeline; the enum also accepts legacy modes from earlier registry entries.) |
| `source_id` | string ≤ 200 chars | no | |
| `status` | string enum | no | `claimed`, `running`, `completed`, `failed`, `abandoned`, `superseded`. |
| `since` | string ≤ 100 chars | no | ISO date/time lower bound on run start. |
| `limit` | integer 1–100 | no | Default 20. |

Returns: `{ revision, total, runs[] }`.

### `atlas_get_crawl_run` — read

| Parameter | Type | Required | Notes |
| --- | --- | --- | --- |
| `run_id` | string, pattern `^crawl-[0-9]{8}-[a-z0-9-]+-[0-9]{2}$` | yes | e.g. `crawl-20261120-partners-01`. |

Returns: `{ revision, run }` — the full record: mode, scope and
source IDs, base revision, claim/lease fields, outcome counts,
snapshot digest, artifact URL, review status and the linked
publication PR once published.

### `atlas_get_crawl_claims` — read

Current crawl claims per source, derived from `claimed` and
`running` runs. A claim whose lease has expired is reported as
`stale`, never as live — the coordination signal agents use to avoid
crawling a source another worker owns.

| Parameter | Type | Required | Notes |
| --- | --- | --- | --- |
| `mode` | string enum | no | As `atlas_list_crawl_runs`. |
| `source_id` | string ≤ 200 chars | no | |

Returns: `{ revision, total, claims[] }`.

### `atlas_crawl_status` — read

**Live** crawl progress, read from `crawl-progress.json` — the
record the running crawl itself publishes to the public index bucket
(the KPIs dashboard renders the same object). Fetched over plain
HTTPS, cached server-side for 15 s.

| Parameter | Type | Required | Notes |
| --- | --- | --- | --- |
| `include_modes` | boolean | no | Default `true`; `false` omits the per-mode rows from a *running* response. |

Returns one of three states:

- Running: `{ state: "running", run_id, run_url, trigger,
  started_at, elapsed_s, heartbeat_age_s, heartbeat_stale,
  current_mode, modes: [{ mode, status, sources_done,
  sources_total, candidates, errors, pages_attempted,
  pages_succeeded, current_source, last_error }], totals,
  percent_complete }`. `heartbeat_stale` is `true` when the
  heartbeat is older than 120 s; a stale heartbeat is flagged,
  never reclassified as failed.
- Idle: `{ state: "idle", heartbeat_age_s, last_completed: { run_id,
  run_url, status, started_at, finished_at, modes[], totals } }` —
  the last completed run's summary.
- Unreachable: `{ state: "unknown", error }` — the record could not
  be fetched; the state is reported as unknown, never invented.
  Fall back to `atlas_list_crawl_runs`.

```json
{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"atlas_crawl_status","arguments":{}}}
```

```json
{"state":"running","run_id":"crawl-20261127-partners-01","heartbeat_age_s":12,"heartbeat_stale":false,"current_mode":"profiles","percent_complete":43,"modes":[{"mode":"partners","status":"completed","sources_done":53,"sources_total":53,"candidates":812,"errors":0}],"totals":{"candidates":5821}}
```

## Issue filing

### `atlas_create_issue` — write

File a GitHub issue through the GitHub API. Create-only: it never
edits, closes, deletes or comments. Requires write mode and a
server-side `ATLAS_GITHUB_TOKEN`; without the token the tool reports
`GITHUB_TOKEN_MISSING` and files nothing. A failed create is never
retried, so an uncertain outcome is never silently doubled.

| Parameter | Type | Required | Notes |
| --- | --- | --- | --- |
| `repo` | string, `owner/name` | no | Default `castlemilk/startup-atlas`. |
| `title` | string 1–200 chars | yes | |
| `body` | string 1–65,536 chars | yes | |
| `labels` | array of ≤ 10 strings (≤ 50 chars each) | no | Labels must already exist on the repository (`GITHUB_VALIDATION_ERROR` otherwise). |
| `dedup_key` | string, pattern `^[A-Z]+[0-9]+(-[a-z])?$` | no | The kpi-backlog key (e.g. `F3`). With it, the tool first searches for an open issue carrying the `[kpi-backlog:KEY]` marker and returns that issue instead of filing a duplicate. |

Returns: `{ created, repository, dedupKey, issue: { number, title,
url, state } }` — `created: false` means the returned issue is the
pre-existing dedup match.

```json
{"jsonrpc":"2.0","id":6,"method":"tools/call","params":{"name":"atlas_create_issue","arguments":{"title":"[kpi-backlog:F3] Crawl errors not surfaced","body":"Problem, evidence with numbers/dates, proposed fix.","labels":["kpi-backlog"],"dedup_key":"F3"}}}
```

## Admin surface — `/mcp/admin` (13 tools)

A separate MCP server (`startup-atlas-admin`) on the same host. It
serves the review queue — the human-in-the-loop gate between
crawled candidates and published data — and the distributed crawl
work queue (the five `atlas_admin_crawl_*` tools, documented with
the crawl pipeline below), and only to
admin-allow-listed identities or the scoped service credential (see
[MCP-HTTP.md](MCP-HTTP.md#admin-mcp-mcpadmin--the-review-queue-as-tools)).
Decisions write back to `data/review-queue.json` through the GitHub
Contents API — the same `ReviewQueue` path the `/admin` panel uses —
and are attributed `decided_by: "agent-review"` on this surface.
Every decision is reversible with `atlas_admin_undo_review_decision`.
Queue kinds are `merge`, `fact`, `startup-lead`, `headshot`,
`edge` and `social` — the six the kind filter accepts.

### `atlas_admin_list_review_queue` — read

Entries returned lowest-confidence first — the order a reviewer
should work them — each carrying its confidence-gating verdict.

| Parameter | Type | Required | Notes |
| --- | --- | --- | --- |
| `kind` | enum: `merge`, `fact`, `startup-lead`, `headshot`, `edge`, `social` | no | |
| `status` | enum: `pending`, `approved`, `rejected`, `deferred` | no | |
| `band` | enum: `above_gate`, `below_gate` | no | `above_gate` = meets its kind's auto-proceed threshold in `data/review-gating.json`. |
| `limit` | integer 1–200 | no | Default 50. |

Returns: `{ source, total, entries[] }` — each entry augmented with
`gating: { auto, … }`, the verdict and its reason.

### `atlas_admin_get_review_item` — read

| Parameter | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | string 1–300 chars | yes | Queue entry ID, e.g. `startup-lead:acme`. |

Returns: `{ source, entry, gating }` — the full entry (candidates,
evidence, draft payload, any existing decision) plus whether it
would auto-proceed, the threshold, and why. Unknown IDs fail with
`NOT_FOUND`.

### `atlas_admin_decide_review_item` — write

Record one decision through the panel's write-back path. Never
retries a write: a conflict means the queue changed since it was
read, so re-read and decide again.

| Parameter | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | string 1–300 chars | yes | Entry must be `pending` or `deferred`. |
| `decision` | enum: `approved`, `rejected`, `deferred` | yes | Deferring is not final: it records what further evidence is needed and the entry can be decided later. |
| `note` | string 1–500 chars | yes | **Must cite the evidence relied on** (for a defer, the evidence still missing). A decision without an evidence note is refused with `EVIDENCE_NOTE_REQUIRED`. |

Returns: `{ ok: true, entry, commit }` — `commit` identifies the
GitHub write-back commit (`review: <id> <decision> via admin MCP`).

```json
{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"atlas_admin_decide_review_item","arguments":{"id":"startup-lead:acme","decision":"approved","note":"Company's own site and its Startmate cohort page both name the company and link the founder profile checked 2026-11-27."}}}
```

### `atlas_admin_preview_review_batch` — read

Dry-run a batch of decisions: returns the per-entry diff the batch
would write, plus the queue revision it was planned against. Writes
nothing. Decisions are validated exactly as the apply path validates
them, so an invalid batch fails here first.

| Parameter | Type | Required | Notes |
| --- | --- | --- | --- |
| `decisions` | array of 1–50 `{ id, decision, note }` | yes | Same field rules as the single-decision tool; every decision needs its own evidence note. |

Returns: `{ ok: true, dry_run: true, source, revision, changes[] }`
— pass `revision` as `expected_revision` to the apply call.

### `atlas_admin_decide_review_batch` — write

Apply a batch in **one** write-back commit, all-or-nothing. If the
queue changed since the preview, the whole batch is refused with
`QUEUE_CONFLICT` and nothing is written — a retried or stale batch
cannot duplicate decisions or overwrite newer ones.

| Parameter | Type | Required | Notes |
| --- | --- | --- | --- |
| `decisions` | array of 1–50 `{ id, decision, note }` | yes | As previewed. |
| `expected_revision` | string 1–200 chars | yes | The `revision` returned by `atlas_admin_preview_review_batch`. |

Returns: `{ ok: true, entries, changes, commit, revision }`.

### `atlas_admin_undo_review_decision` — write

Revert a decided entry (human, auto-gate or agent) back to
`pending`. The undo is committed with its own message naming what
was undone, so the audit trail keeps both entries.

| Parameter | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | string 1–300 chars | yes | |

Returns: `{ ok: true, entry, commit }`.

### `atlas_admin_get_review_gating` — read

No parameters. Returns `{ gating }` — the contents of
`data/review-gating.json`: the `enabled` flag (`false` is the kill
switch for all auto-approval) and the per-kind auto-approve
thresholds and requirements. As committed: merges ≥ 0.88 with
`require_identity_key`; facts ≥ 0.55 with `require_complete_draft`;
startup-leads ≥ 0.65; `edge`, `headshot` and `social` have
`auto_approve_at: null` and never auto-approve. Fails with
`NOT_CONFIGURED` if the config cannot be loaded.

### `atlas_admin_list_auto_applied` — read

The auto-applied audit trail: entries decided by the confidence
auto-gate, newest first. These are the decisions that proceeded
without a human; each is reversible with
`atlas_admin_undo_review_decision`.

| Parameter | Type | Required | Notes |
| --- | --- | --- | --- |
| `kind` | enum, as list | no | |
| `limit` | integer 1–200 | no | Default 50. |

Returns: `{ source, decided_by, total, entries[] }`.

## The crawl pipeline

How crawls run today, and where the MCP fits. The MCP is the
**observation and coordination** layer — it never runs a crawl.

1. **Dispatch.** Crawls run as the *Partner research crawl* GitHub
   Actions workflow (`.github/workflows/partner-research.yml`,
   manual `workflow_dispatch`; the daily run is dispatched each
   morning). The job (30-minute budget) runs
   `python3 scripts/crawl.py <mode>` per mode against the approved
   seed files, with GCP access via Workload Identity Federation.
   The same modes can be run locally from a checkout
   (`npm run crawl -- <mode> …`), and a run is recorded in the
   registry before it starts — see the
   [coordination contract](CRAWL-COORDINATION.md) and the worked
   example in the [agent runbook](AGENT-RUNBOOK.md).
2. **The 8 workflow modes.** `partners` (directory leads),
   `programs` (programme directories), `news` (startup news leads),
   `logos` (approved partner logos), `profiles` (team/portfolio
   leads), `company-profiles` (deep pass over approved companies),
   `portraits` (professional-bio rows + headshot candidates) and
   `partner-candidates` (logo snapshot reconciliation). Steps after
   the first are `continue-on-error`: one mode's outage degrades
   its own snapshot, never the whole run.
3. **Live progress.** With `ATLAS_CRAWL_PROGRESS=1` the crawl
   publishes `crawl-progress.json` to the public index bucket as it
   runs — the record `atlas_crawl_status` and the KPIs dashboard
   both read. Candidates land in the corpus bucket
   (`ATLAS_CORPUS_BACKEND=gcs`); the workflow also retains a
   `partner-crawl-review` Actions artifact for 14 days.
4. **Review queue.** After the crawl, `scripts/build-review-queue.py`
   folds the candidates into `data/review-queue.json` — its
   producers cover merges, edges, facts, value facts, startup
   leads, headshots and socials — and `scripts/review_gating.py`
   applies
   the confidence gates from `data/review-gating.json`.
   Above-gate entries proceed automatically with an audit trail;
   the rest wait in the queue.
5. **Decisions and landing.** A human decides in the `/admin`
   panel, or the agent review pass decides through `/mcp/admin`
   (hourly; service-credential auth). Approved facts, merges and
   leads flow into the data files through the normal write paths;
   the daily crawl's F2 auto-landing commits above-gate results,
   and the live index republishes from `main` — so a decided item
   becomes visible in `atlas_crawl_status`'s successor run and in
   the published index without any MCP write to published data.
6. **Coordination between agents.** Before crawling a source, an
   agent checks `atlas_get_crawl_claims`: a live claim means
   another worker owns that source until its lease expires; a
   `stale` claim must be recovered explicitly, with evidence,
   before re-claiming. During a run, agents watch
   `atlas_crawl_status`; after it, `atlas_list_crawl_runs` /
   `atlas_get_crawl_run` give the recorded outcome, and the run's
   gap report (`scripts/crawl_gap_report.py`) reports the scopes
   the run left uncovered, so the next run can be aimed at them.

### Distributed / multi-agent crawl scheduling — the work queue

The crawl work queue (`data/crawl-work-queue.json`) partitions a
crawl run into claimable work units so any number of agents can
crawl concurrently without double-working an entity. The queue only
coordinates: outputs keep flowing through the paths above
(snapshots → review queue → corpus/index), and completing a unit
records a pointer to the output, never the output itself.
`scripts/crawl_work_queue.py` is the source of truth for the
semantics; the five `atlas_admin_crawl_*` tools on `/mcp/admin`
mirror it over the same GitHub Contents API store as the review
queue (see also [MCP-HTTP.md](MCP-HTTP.md), "Distributed crawl work
queue").

**Work-unit model.** A unit is one of:

- a **mode unit** — one crawl mode × one shard of that mode's seed
  set (`kind: "mode"`, with `mode` and `source_ids[]`); or
- a **coverage unit** — one coverage scope from
  `scripts/crawl_gap_report.py` output × one shard of its uncovered
  entity ids (`kind: "coverage"`, with `scope_id` and
  `entity_ids[]`), so a run can be aimed directly at the gaps a
  previous run left.

Each unit carries `unit_id` (`cwu-<run_id>-<seq>`), `run_id`,
`status` (`pending`, `claimed`, `done`, `failed`, `dead`),
`claimed_by` / `claimed_at` / `lease_expires_at`, `attempts` /
`max_attempts` (default 3), `result` and `last_error`. Shards
default to 10 ids; with `--agents N` the shard size is tuned to
roughly two shards per agent, so faster agents take a second shard
instead of idling.

**Claim/lease semantics.** Exactly one agent holds a unit at a
time: the MCP surface persists through the Contents API sha check
(a contested claim retries once on the next unit), and CLI claims
in one checkout are flock-guarded. A claim takes a lease —
default 30 minutes (1,800 s, matching the `crawl-runs.json`
precedent; tools accept `lease_seconds` from 60 to 14,400) — and
`atlas_admin_crawl_heartbeat` extends it. There is no sweeper:
expired leases return to `pending` lazily, on the next mutating
operation, and status reads report them as pending (the CLI
`sweep` command forces a reclaim). Completion is idempotent:
repeating a completion with the same `agent_id` and `result_ref`
returns `already_done: true` and writes nothing; a completion
with a different result is refused with `ALREADY_DONE`. A late
completion is accepted only while the unit is still held by the
same agent — once an expired lease has been re-claimed by someone
else, the late completion is refused with `NOT_HELD` rather than
overwriting the new holder's work. Failing a unit returns it to
`pending` while attempts remain, otherwise it becomes `dead` and
stays visible as the failure record. `agent_id` is an attribution
label; the admin allow-list / service credential remains the
authority.

#### `atlas_admin_crawl_claim` — write

Claim the next pending unit, optionally filtered to one run, kind,
mode or coverage scope.

| Parameter | Type | Required | Notes |
| --- | --- | --- | --- |
| `agent_id` | string ≥ 1 char | yes | Attribution label for the claiming agent. |
| `run_id` | string | no | Restrict to one run. |
| `kind` | enum: `mode`, `coverage` | no | |
| `mode` | string | no | Restrict to one crawl mode. |
| `scope_id` | string | no | Restrict to one coverage scope. |
| `lease_seconds` | integer 60–14400 | no | Default 1800 (30 min). |

Returns: `{ ok: true, source, unit, commit }` — `unit: null` when
no matching work remains (the agent's loop is done). `commit`
identifies the GitHub write-back commit.

```json
{"jsonrpc":"2.0","id":8,"method":"tools/call","params":{"name":"atlas_admin_crawl_claim","arguments":{"agent_id":"agent-1","run_id":"dcrawl-20261127-a"}}}
```

#### `atlas_admin_crawl_heartbeat` — write

Extend the lease on a unit you hold.

| Parameter | Type | Required | Notes |
| --- | --- | --- | --- |
| `agent_id` | string ≥ 1 char | yes | Must be the current holder. |
| `unit_id` | string ≥ 1 char | yes | |
| `lease_seconds` | integer 60–14400 | no | Default 1800 (30 min). |

Returns: `{ ok: true, source, unit, commit }`. Fails with
`NOT_HELD` when the unit is not claimed by `agent_id` — including
after the lease expired and the unit returned to the pool.

#### `atlas_admin_crawl_complete` — write

Record the result of a unit you hold. Completing a unit publishes
nothing: the output itself still flows through the normal
review-queue/corpus path.

| Parameter | Type | Required | Notes |
| --- | --- | --- | --- |
| `agent_id` | string ≥ 1 char | yes | Must be the current holder. |
| `unit_id` | string ≥ 1 char | yes | |
| `result_ref` | string ≥ 1 char | yes | Pointer to the output: snapshot path, artifact, staged findings file or PR. |
| `outcome` | object | no | Free-form summary of the result. |

Returns: `{ ok: true, source, unit, already_done, commit }` —
`already_done: true` when the same `agent_id` + `result_ref` was
already recorded (no write made).

#### `atlas_admin_crawl_fail` — write

Fail a unit you hold, recording the error.

| Parameter | Type | Required | Notes |
| --- | --- | --- | --- |
| `agent_id` | string ≥ 1 char | yes | Must be the current holder. |
| `unit_id` | string ≥ 1 char | yes | |
| `error` | string ≥ 1 char | yes | Recorded as the unit's `last_error`. |

Returns: `{ ok: true, source, unit, commit }` — the unit is back
to `pending` while attempts remain, else `dead`.

#### `atlas_admin_crawl_status` — read

Read-only queue summary; expired leases are reported as pending
(they are reclaimable).

| Parameter | Type | Required | Notes |
| --- | --- | --- | --- |
| `run_id` | string | no | Restrict the summary to one run. |

Returns: `{ ok: true, source, total, by_status, runs }` — counts
by status, overall and per run.

**The CLI.** `scripts/crawl_work_queue.py` exposes the same state
machine from a checkout, against the same queue file (`--queue`
overrides the default `data/crawl-work-queue.json`):
`enqueue --run-id <id> [--modes <list>|all] [--gap-report <file>]
[--shard-size N] [--agents N] [--max-attempts N]`,
`claim --agent <id> [--run-id …] [--kind …] [--mode …]
[--scope-id …] [--lease-seconds N]`, `heartbeat`, `complete
--result-ref <ref> [--outcome-json <json>]`, `fail --error <msg>`,
`release` (give a unit back without consuming an attempt),
`sweep` (reclaim expired leases now) and `status [--run-id …]`.
Enqueue is CLI-only — partitioning needs the checkout's seed files
and gap report, which the hosted server does not have — and a
`run_id` may only be enqueued once (`RUN_EXISTS`). There is no MCP
`release` tool in this version.

**Multi-agent walkthrough.** A dispatcher partitions the run once;
every agent then drains the same queue:

```bash
# Dispatcher, in a checkout of main:
python3 scripts/crawl_gap_report.py --out /tmp/gap.json
python3 scripts/crawl_work_queue.py enqueue --run-id dcrawl-$(date -u +%Y%m%d)-a \
    --modes all --gap-report /tmp/gap.json --agents 4
# Land data/crawl-work-queue.json via the normal browser route (or work locally).

# Each agent loops until claim returns no work — via /mcp/admin:
#   atlas_admin_crawl_claim    { agent_id: "agent-1", run_id: "dcrawl-…" }
#   … do the unit's crawl, heartbeat on long units …
#   atlas_admin_crawl_complete { agent_id: "agent-1", unit_id: "cw-…",
#                                result_ref: "<snapshot/artifact/PR>",
#                                outcome: { … } }
# or via the CLI: crawl_work_queue.py claim --agent agent-1 … complete …

python3 scripts/crawl_work_queue.py status   # counts by status, per run
```

## See also

- [Install & connect quickstart](INSTALL-MCP.md) — the hosted
  endpoint (nothing to install) and the one-command local path per
  client.
- [Integration guide](MCP-INTEGRATION.md) — connecting Claude,
  Cursor and other clients; example prompts; troubleshooting.
- [MCP over HTTP](MCP-HTTP.md) — running the server, OAuth and
  Google setup, the admin panel, the service credential, error
  codes for issue filing, security model.
- [Local stdio MCP](MCP.md) — stdio setup, the entry/provenance
  contract, persistence, concurrency and recovery.
- [Record editing contract](MCP-RECORD-EDITS.md) — the startup
  edit schema and its hosted draft-PR counterpart.
- [Crawl coordination contract](CRAWL-COORDINATION.md) — run and
  claim record schemas, lease handling.
- [Agent runbook](AGENT-RUNBOOK.md) — the collector/MCP operating
  loop and known failure modes.
