# Crawl coordination

This document is a coordination contract. The registry and the MCP read
tools that query it are part of this contract; claim and write tools are a
later PR.

## Why

Crawling today is manual and human-driven, with two routes and no durable
record of who ran what:

- Local: `npm run crawl -- <mode>` from a checkout (`scripts/crawl.py`).
  Modes: `sites`, `discover`, `programs`, `partners`, `captures`,
  `apply-reviewed`, `logos`, `partner-candidates`, `profiles`,
  `company-profiles`, `news`.
- Remote: the manual `workflow_dispatch`-only **Partner research crawl**
  (`.github/workflows/partner-research.yml`, 15-minute timeout,
  `contents: read`): partners → programs → news → logos → profiles →
  partner-candidates, then uploads `research/crawl/` as a
  `partner-crawl-review` artifact retained 14 days.

There is no schedule and no crawl on pull requests; the runbook explicitly
forbids adding a crawl-on-PR workflow. Duplicate and overlap avoidance is
convention, not a lock: inspect main, open PRs, running work and deployment
before starting, and do not overwrite concurrent work. Inside one run,
`crawl.py` deduplicates a programme link within one registry source and final
page, reuses cached pages explicitly, and reports coverage, but a second agent
on another machine cannot see any of that: crawl outputs are timestamped and
`latest-*.json` snapshots under gitignored `research/crawl/`.

The curated frontier is the source list, not a registry:
`data/partner-sources.json` (5 partner directories),
`data/program-sources.json` (17 programme registries),
`data/partner-logo-seeds.csv` (32 approved partners).

## What coordination records

One record per crawl run, and one claim per source inside that run.

### Run record

```json
{
  "version": 1,
  "run_id": "crawl-20261120-partners-01",
  "mode": "partners",
  "scope": {
    "source_ids": ["github-for-startups-partners", "aws-activate-featured"],
    "seed_file": "data/partner-sources.json",
    "seed_sha256": "64-hex-digest-of-the-seed-file-bytes"
  },
  "args": { "limit": null, "follow": 0, "delay": 2 },
  "catalogue_revision": "40-char-main-commit-sha-the-run-was-based-on",
  "source_revisions": { "github-for-startups-partners": "64-hex-digest" },
  "claimed_by": "agent-or-person-name",
  "claimed_at": "2026-11-20T03:30:00Z",
  "lease_expires_at": "2026-11-20T04:00:00Z",
  "status": "completed",
  "started_at": "2026-11-20T03:30:00Z",
  "finished_at": "2026-11-20T03:35:18Z",
  "outcome": {
    "sources_attempted": 5,
    "sources_succeeded": 0,
    "sources_failed": 5,
    "candidates_discovered": 0,
    "coverage_reference": "research/crawl/partners-20261120T033518Z.json",
    "notes": "All sources skipped: host resolved to a non-public address.",
    "sources": [
      { "source": "Example directory", "status": "failed", "pages_ok": 0, "pages_attempted": 2 }
    ]
  },
  "snapshot_sha256": "64-hex-digest-of-the-crawl-snapshot-file",
  "artifact_url": "https://github.com/castlemilk/startup-atlas/actions/runs/<id>",
  "run_url": "https://github.com/castlemilk/startup-atlas/actions/runs/<id>",
  "review_status": "unreviewed",
  "published_pr": null,
  "supersedes": null,
  "superseded_by": null
}
```

- `run_id` is `crawl-<YYYYMMDD>-<mode>-<nn>`, unique per run.
- `status` is one of `claimed`, `running`, `completed`, `failed`,
  `abandoned`, `superseded`.
- `review_status` is one of `unreviewed`, `in_review`, `reviewed`,
  `published`. It is separate from `status`: a completed run is still
  unreviewed until a human has read its candidates.
- `snapshot_sha256` is the digest of the crawl snapshot file. The snapshot
  itself stays gitignored under `research/crawl/` (or in the Actions
  artifact); only the digest is committed, so a record can prove which
  snapshot it describes without publishing the snapshot.
- `published_pr` is the pull request number that published reviewed
  candidates from this run, once one exists.
- `outcome.sources` is optional per-source status copied from the crawl
  snapshot's `coverage.sources` (`source`, `status` — `ok`, `failed` or
  `not_attempted` — `pages_ok`, `pages_attempted`). Record it when a run
  finishes so a dead source is visible in the registry itself, not only
  by opening the run artifact. Records written before it existed stay
  valid without it.

### Source claim

A claim is `(mode, source_id)` → `run_id`, plus `lease_expires_at` and
`status`. It is derived from the run records; there is no separate claim
store. Candidate identity stays `(source_id, canonical URL, normalised
name)` — observations from different sources are never merged into one
programme or partner.

## The sequence

```
claim (MCP, later PR) → run crawl → snapshot + artifact → human review
  → atlas_validate_opportunity / atlas_validate_partner
  → atlas_add_opportunity / atlas_propose_partner draft PR referencing run_id
  → merge → Pages deploy → run record updated to published with PR/commit
```

Rules:

1. **Record before you start.** A crawl must be recorded before it runs,
   with its run ID, mode, sources, base revision (the 40-character main
   commit the run is based on) and where the artifact will land. Records
   live in `data/crawl-runs.json` (append-only); until claim tools exist,
   append the record through the normal branch/review workflow.
2. **Leases, not locks.** A claim lasts a bounded time (default 30 minutes
   for a partners run) and can be extended by a heartbeat. Expiry never
   deletes history: it only makes the claim recoverable by another worker,
   through an explicit recover event that preserves the prior attempt.
3. **A crashed worker leaves `status: running` with an expired lease.**
   The next worker must recover that run (recording the evidence) before
   re-claiming the same source. Two workers on the same source at the same
   time is a conflict, not a race to fetch.
4. **Never rewrite history.** Append a new record, or a superseding record
   that names the record it supersedes. Keep the last 200 runs in the
   registry file; older runs are archived to `research/crawl/` packets.
5. **The registry is advisory.** A claim does not authorise fetching a
   source, and the registry never overrides a transport guard. It is the
   thread that ties a published entry back to the crawl that found it; it
   never short-circuits review.
6. **Workflow runs are recorded by the workflow** (issue #538). The
   partner-research workflow's bookkeeping step runs
   `scripts/record_crawl_runs.py` over every mode snapshot and writes the
   updated registry to `research/crawl/crawl-runs.json` in the crawl
   artifact, alongside the updated `data/crawl-source-state.json`
   (per-source sampler state, recorded by `crawl.py` for every fetch
   mode). Landing either file back on main stays a reviewed data change,
   like the review queue; until a landing happens, the committed registry
   legitimately lags the latest workflow run rather than implying
   coverage it does not have.

## What does not change

- No robots.txt requests or inspection. The owner requested this; the
  shared URL normalizer rejects robots.txt path segments before DNS or
  HTTP.
- HTTPS and approved-host checks, public-address validation, per-host
  delay (at least 1 second), 12-second timeout, 1 MB response limit and
  429 host-pause behaviour in `scripts/crawl.py` are unchanged.
- No crawl on pull requests. No crawl schedule. No MCP shell, fetch or
  Git tool, and MCP never triggers a crawl.
- No automatic publication of unreviewed leads. Crawl outputs remain
  unreviewed leads until a human reviews them and the normal
  validate → add / propose path publishes them.
- No credentials, tokens or secret-bearing cursors in the registry.

## Where the registry lives

The registry is a committed, append-only JSON file,
`data/crawl-runs.json`, read through `backend/mcp/crawls.mjs`
(`CrawlRegistry`: read and schema-validate only, no writes) and queried
with the read-only MCP tools `atlas_list_crawl_runs`,
`atlas_get_crawl_run` and `atlas_get_crawl_claims` (see
[the MCP tools](MCP.md#crawl-runs-read-only)). Its first entry is the
20 Nov 2026 partners run: 5 sources attempted, 0 fetched, DNS-blocked —
an honest first entry, not a successful crawl. Per-source revisions are
the SHA-256 of the file that defines that source (for the partners run,
`data/partner-sources.json` for all five sources).

Claim and write tools (`atlas_claim_crawl`, `atlas_update_crawl_run`,
`atlas_release_crawl_claim`, `atlas_recover_crawl_run`) are a separate,
later PR, after this read path is reviewed and merged.

Two existing pieces are deliberately not the coordination store:

- `scripts/collection_coverage.py` and
  [the collection coverage contract](COLLECTION-COVERAGE-CONTRACT.md)
  (OPS-01 / #89, CRAWL-01 / #77) are an offline, unintegrated SQLite
  ledger for checkpoint and resume *inside* one long run (attempt budgets,
  host pauses, interrupted-attempt recovery). A SQLite binary in git is
  unreviewable and has no shared location, so it stays a per-run
  checkpoint store. It also states its mapping needs collection-owner
  review before any adapter is built.
- [The scoped document approval proposal](CRAWL-SCOPE.md) (#213) is a
  draft the owner agreed with in principle but requested corrections on;
  it is not adopted and has no runtime activation.

Run state must not live only in `research/crawl/latest-*.json` (gitignored,
invisible across machines) or only in Actions artifacts (14-day retention,
not MCP-queryable).

## Current state (2026-11-20)

- Local sandbox DNS can fail even when GitHub and web connectors work:
  public hosts resolve to non-public addresses (`198.18.148.x`), and the
  crawler refuses to fetch them. Local crawls therefore fetch nothing.
  The Partner research crawl workflow is the working crawl route from
  such an environment.
- The [17 November bounded research packet](../research/programmes/2026-11-17/README.md)
  records an actual four-source DNS failure, an offline replay of those
  saved outcomes, and separately acquired primary-source research.
- On 20 Nov 2026 a local partners run attempted all 5 partner sources
  and fetched 0: every source skipped with "host resolved to a
  non-public address". It is the first entry in `data/crawl-runs.json`
  (`crawl-20261120-partners-01`) — an honest first entry, not a
  successful crawl.
- Do not base a PR on a stale checkout. The checkout this contract was
  written from had fallen 28 commits behind main; rebase to current main
  and re-check open PRs and the Pages run before raising anything.
