# Live-index loop

How a crawl becomes a queryable index, end to end. The pipeline is
**crawl → static corpus (GCS) → async indexer (Cloud Run Job) →
DuckDB/WASM-served index (public GCS bucket)**. A crawl is dispatched,
its snapshots are published to the corpus bucket, the indexer builds
Parquet tables from the reviewed corpus, and the query console reads them
straight from the index bucket in the browser — no server, no PR, no
redeploy.

This document records the loop as actually run on 23 Nov 2026 (crawl
#43), with the real commands, IDs and values observed. Infrastructure is
defined in `infra/terraform/` (project `single-station-515408-g9`,
region `australia-southeast1`); the runbook for the bootstrap itself is
`infra/GCP-BOOTSTRAP.md`.

## Stage 1 — Crawl

The partner-research workflow runs on GitHub Actions
(`.github/workflows/partner-research.yml`, branch `main`). Dispatch it
from the Actions tab (there is no workflow-dispatch tool on this VM) and
wait for the run to succeed.

Observed run (crawl #43, 23 Nov 2026):

- Run ID `45107803260`, main `32bcee0`, succeeded in 2m 55s.
- Artifact ID `14788237018`, `partner-crawl-review.zip`, 2,434,549 bytes.
- Counts (registry convention — partners + programs + news + logos +
  profiles + partner updates, excluding portraits): partners 1,564,
  programs 154, news 5, logos 312, profiles 2,486, partner updates 30 —
  **4,551 total** (crawl #42: 4,548). Portraits 52, still 0 files.
- Review the artifact before publishing it: download the zip, extract
  it, diff the per-mode JSONs against the previous crawl. The review
  note for #43 lives at
  `workspace/goals/global-startup-tracking/hidden_files/crawl-43-review-2026-11-23.md`.

## Stage 2 — Trigger the index

Two publishes, then a trigger. Both scripts are ADC-native (they read
`~/.config/gcloud/application_default_credentials.json`; the gcloud CLI
has no account authed on this VM, so do not use `gcloud` commands in
scripts).

### 2a. Publish the crawl snapshots

```bash
python3 scripts/publish_crawl_corpus.py \
  --snapshots <extracted-artifact-dir> --run-id 45107803260
```

with `ATLAS_CORPUS_BACKEND=gcs`,
`ATLAS_CORPUS_BUCKET=single-station-515408-g9-atlas-corpus` and the
other `ATLAS_*` variables from the environment. Exit 0 writes 12
objects: `corpus/v1/crawl-snapshots/<mode>/45107803260.json` and
`corpus/v1/crawl/<mode>/latest.json` for all six modes. (Snapshots moved
to their own `crawl-snapshots/` prefix so the corpus bucket's lifecycle
rule can expire them after 90 days; the `latest.json` pointers and the
reviewed corpus never expire. Snapshots published before the move sit
under the old `corpus/v1/crawl/<mode>/<run-id>.json` keys and are not
covered by the rule.) It reports
`indexer_dispatched: false` in a manual run — there is no GitHub token
for `repository_dispatch` outside Actions, so the manual run does not
trigger the indexer; the 15-minute scheduler covers it (see 2c).

### 2b. Publish the reviewed corpus

The indexer builds from the **reviewed** files, not the raw crawl
output: `data/catalogue.json`, `data/partners-reviewed.json`,
`data/partner-profiles.json`, `data/startup-research.json`, and
`data/treemap-evidence.json`. Include the generated `data/graph.json`
for relationship tables. Sync them
from remote main first (the local checkout may be behind), then publish:

```python
publish_reviewed_corpus(
    '/tmp/main-reviewed', CorpusConfig.from_env(),
    source_revision='32bcee00364968c64b6b1c2da8a74fdd1c179965')
```

This writes `corpus/v1/reviewed/<file>` for those inputs plus
`corpus/v1/reviewed/manifest.json`. The manifest `sha256` is a pure
content hash over the per-file entries (not the timestamp), so the same
file bytes always yield the same sha. For crawl #43 the new reviewed
manifest sha was `a6d6e63c020683bb6ee755d4a5d3a89c5dcd97320ddb77af0cf7360d956590d0`.

### 2c. Trigger the indexer

Either wait for the scheduler — Cloud Scheduler job
`atlas-live-indexer-poll` fires every 15 minutes (Australia/Melbourne)
and runs the Cloud Run Job `atlas-live-indexer` — or trigger it
manually with a Cloud Run `:run` call against the job. The job image is
digest-pinned via the Terraform variable `indexer_image`; `:latest`
alone never registers as a change.

## Stage 3 — Index complete

Check the execution, not the job: a Run API execution resource carries
`completionTime` and `conditions` at the top level (there is no `status`
object). A successful run prints `Built index <version>: 11 tables, N
rows, from <corpus-sha[:12]>` and `Published … objects …; latest.json
now points at <version>.`

Observed run (manual trigger, 23 Nov 2026): execution
`atlas-live-indexer-td5zx`, completed in 8.53s. New version
`20261123T035050Z-a6d6e63c` (generated 03:50:50Z, source revision
`e69eb45`): opportunities 124, partners 36, partner_leads 202,
startups 55, funding_rounds 64, articles 73, profile_facts 147,
founders 118, socials 7 — **826 rows total**.

Public pointer (always the newest version):

```
https://storage.googleapis.com/single-station-515408-g9-atlas-index/latest.json
```

A version is `v1/<timestamp>-<reviewed-manifest-sha[:8]>/` in the index
bucket; `latest.json` is written last, so a reader never sees a
half-published version.

**Known behaviour — the scheduler republishes every 15 minutes even
when nothing changed.** The indexer's "up to date" check compares the
reviewed manifest sha against the *local* output directory, which is
fresh on every Cloud Run execution (ephemeral `/tmp`), so it never
fires in the cloud and every tick builds and publishes a new
timestamped version. Observed: the scheduler republished
`20261123T044508Z-a6d6e63c` at 04:45Z with the same corpus sha
`a6d6e63c`. The versions are correct and cheap, but it is wasteful
(11 objects per tick, retained 90 days). The fix is to compare against
the remote `latest.json` instead of the local output dir — filed as
issue #373, not fixed here.

## Stage 4 — Fetch and query in the browser

Console (public, no sign-in):

```
https://storage.googleapis.com/single-station-515408-g9-atlas-index/query.html
```

The page reads its index base from the
`<meta name="atlas-live-index">` tag, follows
`latest.json` → `manifest.json` → the eleven Parquet tables, loads them
into DuckDB-WASM in the browser, and runs SQL locally — nothing is
uploaded. The engine files are tens of MB, so the first load takes a
while; the page reports "Ready — 11 tables loaded" when it is usable.

### The apache-arrow import map (a real gap, fixed 23 Nov 2026)

The first browser run of this loop failed at this stage: the page's
provenance loaded, but both queries failed with *"Query failed: Module
name, 'apache-arrow' does not resolve to a valid URL."* Root cause:
`duckdb-browser.mjs` contains bare imports
`import * as u from "apache-arrow"` (twice), and Arrow itself imports
`flatbuffers` and `tslib`. Browsers cannot resolve bare specifiers
without an import map, and the build vendored only the five DuckDB
files — no apache-arrow, no import map in `web/query.html`. The
console could never have run a query as built; the same gap would have
hit the Pages deployment.

The fix, applied to the live bucket and to the repo on this branch:

- `web/query.html` carries an import map (before any module script)
  mapping `apache-arrow` → `./vendor/duckdb/apache-arrow/Arrow.dom.mjs`,
  `flatbuffers` → `./vendor/duckdb/flatbuffers/flatbuffers.js`,
  `tslib` → `./vendor/duckdb/tslib.mjs`.
- The bucket holds the vendored trees: apache-arrow 17.0.0's ESM files
  (143 `.mjs` files, ~635 KB), flatbuffers 24.3.25's `mjs/` closure
  (6 `.js` files), and `tslib.es6.mjs` (2.8.1). The arrow ESM entry is
  `Arrow.dom.mjs` — the small re-export shim alone is not enough, the
  whole module tree is required, and its only bare imports are the
  three mapped above (plus `apache-arrow` itself, a circular
  self-import that resolves through the map).
- `scripts/build.mjs` now vendors all three from
  `node_modules/` (they arrive as transitive dependencies of
  `@duckdb/duckdb-wasm@1.32.0`) alongside the five DuckDB files, and
  fails fast with the install command if `apache-arrow` is missing.

One residual quirk: the first load after the fix briefly showed the old
error — a stale cached copy of `query.html` from the earlier failed
session. A single reload picked up the fixed page and everything ran.
If the console ever shows the `apache-arrow` error again, reload once
before assuming anything is broken.

### Verified queries (23 Nov 2026, cloud browser, index `20261123T044508Z-a6d6e63c`, 9 tables, 826 rows)

Provenance shown on the page: *"Index 20261123T044508Z-a6d6e63c ·
9 tables, 826 rows. Generated 23/11/2026, 3:45:08 pm from e69eb45."*

Opportunities by kind:

```sql
SELECT kind, COUNT(*) AS n FROM opportunities
GROUP BY kind ORDER BY n DESC
```

| kind | n |
| --- | --- |
| Founder programmes | 59 |
| Funding finders | 19 |
| Cloud credits | 12 |
| Developer tools | 8 |
| Business tools | 8 |
| AI model credits | 7 |
| GPU & inference | 7 |
| Data & analytics | 4 |

Top AUD funding totals (8 ms / 24 ms respectively — both queries ran
in well under a second once the engine was loaded):

```sql
SELECT startup, COUNT(*) AS rounds, SUM(amount) AS total_aud
FROM funding_rounds WHERE currency = 'AUD'
GROUP BY startup ORDER BY total_aud DESC LIMIT 5
```

| startup | rounds | total_aud |
| --- | --- | --- |
| Gilmour Space | 1 | 217000000 |
| Loam Bio | 1 | 105000000 |
| Morse Micro | 1 | 88000000 |
| Eucalyptus | 1 | 60000000 |
| ENA Respiratory | 3 | 37930000 |

## Stage 5 — KPI review → backlog → issues → fixes → re-measure

The loop does not end at a working query. The Atlas KPIs dashboard
tracks 17 indicators (F1–F4 freshness, C1–C5 coverage, Q1–Q4 quality,
T1–T4 throughput/cost; definitions and the 23 Nov 2026 scoreboard —
11 red, 4 amber, 2 green — are in
`workspace/goals/global-startup-tracking/hidden_files/process-critique-and-kpis-2026-11-23.md`),
and the daily refresh re-measures them. A red indicator becomes a
backlog entry, the entry becomes a GitHub issue, the issue becomes a
fix, and the next measurement shows whether the fix worked.

1. **Re-measure.** The daily KPI refresh re-runs the measurements
   (index pointer, corpus lag, crawl runs, bucket listings, Paprika
   cluster readings) and updates the dashboard when a value moved.
2. **Append to the backlog file.** For a red indicator with no
   covering issue, append an entry to `data/kpi-backlog.json` —
   `key` (the indicator id, e.g. `F3`), `title`, `body` (problem,
   evidence with numbers/dates, proposed fix), `labels` (always
   includes `kpi-backlog`), `status: open`, `created` date:

   ```bash
   python3 scripts/kpi_backlog.py add --key F3 --indicator F3 \
     --title "..." --body "..."
   ```

   `add` dedupes by key, so the same indicator cannot be entered
   twice. Check the live open-issue list first — an entry that
   duplicates a filed issue is noise, not a ticket.
3. **The workflow files the issue.** `.github/workflows/kpi-backlog.yml`
   runs when `data/kpi-backlog.json` changes on `main`, on a daily
   schedule (08:15 AEDT backstop), and on manual dispatch. It checks
   out the repo and runs `python3 scripts/kpi_backlog.py file`, which
   uses the `gh` CLI with the repository's default `GITHUB_TOKEN`
   (`permissions: issues: write, contents: read`). **No agent needs
   issue permission** — the repo files its own tickets. That is the
   whole point: an unattended loop cannot approve a per-call
   permission card, so the filing step runs with the token the
   workflow already has.
4. **Fix in branches, merge, re-measure.** The fix lands the usual
   way — a branch and a PR, merged by the owner. Once merged and the
   indicator re-measures, mark the entry done:

   ```bash
   python3 scripts/kpi_backlog.py done F3
   ```

### Idempotency rule (read this before touching either file)

An entry is filed exactly once. Its `key` appears in the issue title
as `[kpi-backlog:F3]`, and before creating, the script searches for
an issue with that key and the `kpi-backlog` label **in any state**
(`--state all`), so even a closed issue blocks a re-file. The
workflow never writes the backlog file and never commits anything,
so it cannot trigger itself: issue creation fires no `push` event,
and the `push` trigger is scoped to `data/kpi-backlog.json` on `main`
anyway. To re-file a closed issue, reopen the issue or change the
entry's key. A `gh` failure is loud, not silent — the run fails
instead of pretending the ticket exists.

Seeded 23 Nov 2026 (checked against the live open-issue list, no
duplicates): `F3` loop wall-clock ~2 h, `F4` stalest dataset 10 days,
`Q4` per-source status. Deliberately not seeded: `C2` (partner review
18% — its fix path is the review-queue builder, issue #377) and `T2`
(unpushed branches — an owner action, pushing, not a code fix).

## Instrumentation — what is measured, and how

Every number in this document comes from one of these sources. If a
number cannot be produced by a command below, it is not a metric yet.

| What | Source | Command / location |
|---|---|---|
| Crawl duration + conclusion | GitHub Actions API (public) | `workflow_runs` for `partner-research.yml`; 8 recent runs 2.5–3.0 min, 8/8 succeeded |
| Indexer execution time | Cloud Run API (ADC) | Job executions: 10.1–42.1s wall incl. container start, median 13.9s (n=14); the build itself 8.5–9.6s |
| Index version + rows | `latest.json` (public) | Version, `generated_at`, per-table rows |
| Per-table compressed size | Index manifest `tables[].bytes` | Recorded by `build_live_index.py` since 23 Nov 2026 (older manifests lack it — fall back to the bucket listing) |
| Stage timings | Indexer stdout | `download+build …s` and `publish …s` printed by `main()` |
| Compression | Manifest + bucket | Reviewed JSON 330,649 bytes → Parquet 108,996 bytes = **3.03× (67.0% smaller)**, 132 bytes/row; crawl snapshots 7.57 MB raw → 2.43 MB zip = 3.11× |
| Console first-load payload | Bucket listing | ~40.9 MB: WASM 39.4 MB (96%), worker 0.8 MB, arrow tree 0.6 MB, rest < 0.1 MB. Cache-Control is `public, max-age=3600`, no content-encoding — repeat visits after an hour re-download the full WASM |
| Cost | `scripts/estimate_live_index_cost.py` | Recomputes everything above from live data and prints a monthly estimate. Measured 23 Nov 2026: **~$0.67/month at 100 console visits/month** (storage $0.02, writes $0.16, Cloud Run $0.00 — inside the free tier — egress $0.49). At 1,000 visits/month ≈ $4.94, egress-dominated. Fixing #373 (publish only on change) cuts writes and runs ~95%; the WASM download is the cost lever after that |
| Hosted MCP health | DeepHost telemetry (via Paprika Observe) | `deephost_get_app_telemetry` — **currently failing: "Paprika Observe returned HTTP 404"** on both `metrics` and `logs` signals (23 Nov 2026, ~16:30 AEDT; it worked that morning). Filed as a DeepHost issue |

### Gaps (not yet instrumented)

- **The query console has no telemetry at all** — no loads, query
  times, or errors are recorded anywhere. The arrow bug proved the
  cost of this. Covered by issue #375 (smoke test + loop health
  check).
- **Paprika Observe is reachable from this VM** — the Cloudflare
  allowlist rule "Allow Muse - Paprika Observe" (rule ID
  `e266889ac84c4ef9845ab5e27c60c527`, benebsworth.com zone, set 23 Nov
  2026 ~17:12 AEDT) skips Browser Integrity Check + Super Bot Fight
  Mode Rules + managed rules for `paprika.benebsworth.com/observe/*`,
  fixing the HTTP 403 error 1010 block. Live MCP queries ran 17:13–
  17:14 AEDT 23 Nov 2026 (cluster dashboard + providers, 13/14 OK).
  The connector is `custom.paprika-observe`; its doc records the fix.
- **The corpus bucket has no lifecycle rule** — snapshots accumulate
  forever (17 objects, 15.5 MB today; ~45 MB/day at 3 crawls/day).
  The index bucket deletes `v1/` objects after 90 days; the corpus
  bucket has no equivalent. Small money today, unbounded growth.
- **No billing alert or cost dashboard** — spend is ~$1/month, so
  this is a tripwire for later, not a fire now. The estimate script
  is the measuring stick until traffic grows.

## Operator checklist

1. Dispatch the partner-research workflow; wait for success.
2. Download the `partner-crawl-review` artifact; review the diff
   against the previous crawl and write the review note.
3. `scripts/publish_crawl_corpus.py --snapshots <dir> --run-id <id>`.
4. Sync the reviewed inputs and generated graph from remote main; publish them.
5. Trigger the indexer (manual `:run` or wait for the scheduler).
6. Verify the execution completed and read the new version + row
   counts from `latest.json`.
7. Open the console, confirm the provenance line matches the new
   version, run a query.
8. KPI review: after the daily refresh, append any red indicator with
   no covering issue to `data/kpi-backlog.json`
   (`scripts/kpi_backlog.py add`); the `kpi-backlog` workflow files
   the issue. When a fix merges and the indicator re-measures, mark
   the entry done (`scripts/kpi_backlog.py done <key>`).
