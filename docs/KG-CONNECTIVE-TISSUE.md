# Startup Atlas — knowledge-graph connective tissue (design)

Branch: `kg/connective-tissue` (worktree `~/workspace/atlas-worktrees/atlas-kg`),
based on main `647857b`. Local only — no push, no PR, no merge.

**Reconcile note (23 Nov 2026, Ben approved):** the branch was merged onto
remote main `f9c1de8` (PR #381) locally — the VM cannot git-fetch, so main's
tree was imported from the codeload tarball as a snapshot commit parented on
`647857b`. Data files took main's versions and the generators were re-run on
top: backfill (HQ 42 filled / 10 ambiguous / 3 missing, 56 stages normalised,
7 deadlines), identity registry re-seeded (398 entities, 4 merges), graph
regenerated (v2, 610 entities, 319 scored edges, 67 rounds). In
`scripts/crawl.py`, main's bounded `profile_lead_batch` (Startmate/USV card
evidence) was integrated with §4's slug-derived names — card evidence names
win and are never slug-derived; the slug fallback applies to non-card links
only, and one branch test was updated to assert that merged behaviour. In
`scripts/make-graph.py`, main's `technology_providers` entities and the
'funding source' article kind were folded into the v2 builder. Verified:
Python 722 tests (1 failure, `test_pi_exchange_identity`, fails identically
on pristine main — main's data gained the PI.EXCHANGE round after the test
was written), MCP 40/40, JS subsets in pages.yml 26/26 + 39/39.

## Goal

Ben's goal: a database and map of every startup in the world, built from the
crawling network. Today the graph is a list, not a network: 30% of entities
isolated, 87% with degree ≤ 1, no funding edges, no way to tell a fresh fact
from a stale one, and no path for a fuzzy match to become a trusted merge.
This build adds the connective tissue in five pieces:

1. **Shared identity / entity resolution** — one canonical node per real-world
   entity across sources, with an alias/merge record.
2. **Edge freshness + confidence** — every edge carries when it was last
   verified and how much it should be trusted, with the basis stated.
3. **Extended schema** — relationships, funding signals, structured fields,
   and change over time (supersede, never silently overwrite).
4. **Crawl sampling layer** — stop re-crawling the same ground; prioritise
   stale, changed, or low-confidence sources; skip-unchanged done correctly.
5. **Human-in-the-loop validation queue** — fuzzy merges and low-confidence
   edges go to a review queue; decisions are recorded back into the graph.

## Principles

- **Source-backed, always.** Every node/edge/fact keeps its source URL.
  Nothing enters the graph without a source.
- **Inferred is marked inferred.** Anything derived (slug names, backfilled
  fields, fuzzy matches) carries `inferred: true` and a lower confidence.
  Never guess silently.
- **Additive, never destructive.** Graph format version 1 → 2 adds fields;
  no existing key is removed or renamed. Old readers ignore unknown fields.
  Superseded records stay in the file, marked — they are not deleted.
- **No silent reverts.** A fact changes only via a recorded supersede or a
  queue decision, with `decided_by` and a timestamp.
- **Live-index compatible.** The DuckDB tables / manifest contract stays
  compatible. New tables are additive. `build-query-parquet.py` and the
  live-index indexer live on other (unmerged) branches and are NOT copied
  into this branch — the wiring for them is specified in §6 and is a
  follow-up patch once those branches merge.
- **Tests for every piece.** New behaviour ships with unit tests using
  `unittest` (repo convention: `python3 -m unittest discover -s tests -p
  "test_*.py"`). Tests load scripts via `importlib` (see `tests/test_graph.py`).
  A test that only passes against fixtures with the wrong field names is a
  bug — test against real reviewed records (the #349 lesson).

## Data vintage (read this before quoting counts)

The branch base is main `647857b` (#311): **51 startups, 50 rounds,
202 leads, 33 reviewed partners, 11 partner profiles, 104 opportunities**.
Remote main (23 Nov) has 55 / 63 / 203 / 36 / 124. The machinery in this
build is data-agnostic; counts below are measured on the branch's files.
Do not hard-code remote-main counts into code or tests.

## 1. Identity — `scripts/entity_resolution.py`, `data/identity.json`

Owner: subagent A. No other subagent edits these files.

### Canonical IDs (unchanged)

Keep the existing scheme: `kind:slug(name)` (`startup:canva`,
`partner:airtree`, `person:melanie-perkins`). `slug()` is the existing
`make-graph.py` normalisation (NFKD, ASCII, lowercase, non-alphanumerics
→ `-`). Do not change it — changing slugs would rename every node.

### Identity keys (the join key per kind)

- **Startup:** normalised website host (lowercase, strip `www.`, strip
  trailing dot). Fallback: slug of the name.
- **Partner:** normalised website host when known, else slug of the name.
- **Person:** normalised LinkedIn URL when present (`linkedin.com/in/<slug>`,
  lowercase host, strip query params and trailing slash). Otherwise the
  person stays scoped per partner (`person:<slug>--<partner>`), as today.

### Registry — `data/identity.json`

```json
{"version": 1, "generated_at": "2026-11-23T…Z", "source_revision": "647857b",
 "entities": {
   "startup:canva": {"aliases": ["Canva Pty Ltd"], "identity_key": "canva.com",
     "identity_basis": "website-host", "merged_from": [], "updated_at": "…"},
   "person:jane-example": {"aliases": [], "identity_key": "linkedin.com/in/jane-example",
     "identity_basis": "linkedin-url", "merged_from": ["person:jane-example--airtree"],
     "updated_at": "…"}},
 "merges": [{"from": "person:jane-example--airtree", "to": "person:jane-example",
   "basis": "linkedin-url", "decided_by": "review-queue", "decided_at": "…"}]}
```

- Seed it from the reviewed files on disk (leads, reviewed partners,
  profiles, research). Every seeded entry gets `identity_basis` and
  `updated_at`; nothing is invented — an entry with no website and no
  LinkedIn gets `identity_basis: "name-only"` and is never auto-merged.
- `merged_from` is the permanent record: the graph builder resolves a
  merged ID to its canonical winner, so old edges keep resolving.

### Matching

- `match_candidates(name, identity_key, kind, registry)` returns scored
  candidates: exact identity-key match = 1.0; same host + name similarity
  ≥ 0.9 = auto-merge band; name similarity alone never auto-merges.
- Similarity: token-based (normalised name tokens, Jaccard) plus a host
  bonus. Thresholds: **auto-merge ≥ 0.90** (requires a shared identity key
  — host or LinkedIn — not name alone); **review band 0.65–0.90** → the
  validation queue (§5); **below 0.65** → no proposal.
- `apply_merge(registry, from_id, to_id, basis, decided_by)` records the
  merge in both `entities[].merged_from` and `merges[]`. Merges are only
  applied from the queue (§5) or from an exact identity-key match found
  in reviewed data — never from an unreviewed crawl row.
- Person reconciliation (KG-10): same LinkedIn URL at two firms is the
  same person. Start with the 4 LinkedIn-carrying profile people and any
  founder whose LinkedIn is found in review. Do not merge on name alone.

## 2. Edge freshness + confidence — `scripts/edge_scoring.py`

Owner: subagent B. Pure functions; no other file edits except its tests.

### Model (deterministic, documented in the module docstring)

`score_edge(sources)` where each source is
`{type: "primary" | "secondary" | "inferred", url, reviewed_at}`:

- Base **0.50** for a single reviewed source.
- **+0.15** per additional *independent* source (distinct host), capped
  so the total never exceeds **0.95**.
- **+0.10** if any source is primary (official site, filing, the
  company's own announcement).
- **−0.20** if any part of the edge is inferred (slug-derived name,
  backfilled field, fuzzy match).
- **> 0.80 requires ≥ 2 independent sources agreeing.** A single source
  caps at 0.80 no matter what.
- Floor **0.05**. Scores are rounded to 2 decimals.

### Freshness

- `freshness(last_verified, today)`: `days_since_verified`; **stale** when
  `last_verified` is more than **90 days** old or absent. Stale edges are
  flagged (`"stale": true`), never silently dropped.
- `last_verified` sourcing, in order: the source record's `reviewed_at` /
  `checked` date; the crawl-run date for crawl-derived edges; the research
  file's `reviewed` date as a last resort. Never invent a date — if none
  exists, `last_verified` is `null` and the edge is stale.

### Edge fields (added by the graph builder, §3)

```json
{"from": "…", "to": "…", "kind": "supports", "description": "…", "source": "…",
 "first_seen": "2026-11-13", "last_verified": "2026-11-20",
 "confidence": 0.65,
 "confidence_basis": {"sources": 1, "source_types": ["secondary"],
   "agreement": false, "inferred": false},
 "stale": false}
```

## 3. Extended schema + graph builder — `scripts/make-graph.py`, `scripts/backfill_structured_fields.py`

Owner: subagent C. Also owns `scripts/graph_edges_parquet.py` (§6) and
`tests/test_graph_kg.py` (do not edit the existing `tests/test_graph.py`).

### Graph format version 2 (additive)

`data/graph.json` gains `"version": 2`. Keys `entities`, `edges`,
`funding_rounds`, `articles` are unchanged. Entities gain `canonical_id`
(same as `id` today — the field exists so merged IDs can be traced) and
`aliases` (list, default `[]`). Edges gain the §2 fields. The builder
must still pass the existing `tests/test_graph.py` and `graph-data`
contract: deterministic ordering, unique round IDs, no self-relations.

### Funding edges (KG-5)

- Round schema gains `lead_investor` (string or null) and `participants`
  (list, default `[]`) and `event_on` (date or null, when known). These
  are additive fields on `startup-research.json` rounds; no existing
  round is rewritten.
- `make-graph.py` emits `led_round` (funder → startup, with `round_id`
  and the round source) when `lead_investor` is set, and
  `participated_in` for each participant. The funder node is resolved
  via §1 identity matching against partner leads; if there is no match,
  skip the edge and count it in the build output as a warning —
  **never fail the build on partial data**.
- Relationship vocabulary (documented in the module docstring and in
  `docs/KG-CONNECTIVE-TISSUE.md` §3): `founded`, `team_member`,
  `supports`, `supports_programme`, `offers`, `programme_relationship`,
  `led_round`, `participated_in`, `subsidiary_of`, `integrates_with`,
  `listed_in_portfolio`.

### Structured fields (KG-4) — `scripts/backfill_structured_fields.py`

Backfill from data already in the repo; never guess:

- **Startup `hq_country` / `hq_city`**: parse the existing HQ profile
  facts (`headquarters`, `business-base`, `co-headquarters`,
  `sydney-headquarters` keys — 52/55 at remote main; measure the actual
  count on this branch's files). City + country from the fact value
  (`"Sydney, Australia"` → city Sydney, country Australia). If the
  parse is ambiguous, leave the field absent and list the startup in
  the backfill report. The script writes the fields into
  `startup-research.json` and prints a report (filled / ambiguous /
  missing). Commit the data change as its own commit.
- **Round `stage_normalised`**: controlled vocabulary —
  `Pre-Seed, Seed, Series A, Series B, Series C, Series D, Series E,
  Series F, Bridge, Grant, Debt, Crowdfunding, IPO, Acquisition,
  Unknown`. Map the ~20 free-text spellings (`Seed round` → `Seed`,
  `Series A-2` → `Series A`, `Funding round (stage not stated)` →
  `Unknown`). The original `stage` is always preserved.
- **Opportunity `deadline` + controlled `status`**: `deadline` is an
  ISO date or null, extracted only when a date parses unambiguously
  from the status text; otherwise null and the opportunity is listed
  in the report. Controlled status vocabulary: `Open, Closing soon,
  Closed, Check intake, Eligibility review, Partner required,
  Apply / verify, Unknown`. **Correction made during integration:**
  the controlled value goes in a NEW field, `status_controlled`, and
  `status` keeps the original free text verbatim — existing consumers
  render `status` (`web/app.js` "Status & source", `web/entity.js`)
  and `tests/catalogue.test.js` asserts on it, so replacing it would
  have broken the site and the catalogue contract. (The first version
  of the backfill moved the original into `status_text`; the script
  migrates that shape back on sight.)
- **Identity hook in the builder**: `make-graph.py` reads
  `data/identity.json` when it exists and resolves any `merged_from`
  ID to its canonical winner before emitting edges. If the file is
  absent, behaviour is unchanged.

### Change over time

- `profile_facts` and `funding_rounds` records gain optional
  `superseded_by` (the replacing record's id/key), `superseded_at`,
  `superseded_reason`. A superseded record stays in the file, marked.
  The graph builder and the Parquet builder exclude superseded records
  from the live graph/tables; the Parquet `profile_facts` table carries
  an `is_superseded` boolean so the history stays queryable.
- Identity merges are the change record for nodes (§1 `merges[]`).

## 4. Crawl sampling — `scripts/crawl_sampling.py` + `scripts/crawl.py`

Owner: subagent D. Only D edits `scripts/crawl.py`. Preserve the house
rules: host restrictions, per-host throttling, response limits, 429
handling, and never request or inspect robots.txt.

### Sampling policy — `scripts/crawl_sampling.py`

`score_source(state)` → priority 0–100, from a persisted per-source
state record (`data/crawl-source-state.json`, created by the sampler;
seeded empty — no invented history):

- **Staleness:** +1 per day since the last successful fetch, capped at 30.
- **Change signal:** +5 per new/changed candidate row the source yielded
  on its last run (cap 25).
- **Low-confidence supply:** +2 per low-confidence edge currently sourced
  from it (cap 20) — re-crawl what would raise trust.
- **Failure backoff:** 1 consecutive failure → priority halved; 2 →
  quartered; 3+ → skipped until the state is manually reset (a dead
  source must not burn the run). Failures are recorded per source with
  the HTTP status.
- Sources run in priority order within each mode; per-mode caps are
  unchanged. The sampler is advisory at first: it orders and annotates,
  it does not drop sources except the 3+-failure backoff.

### Skip-unchanged, done correctly (fixes #349)

- Partner-update candidates carry `site_description`; reviewed records
  carry **`description`** (0 of 33 reviewed partners on this branch have
  a `site_description` field — that is the bug). The comparison reads
  the reviewed record's `description`, normalised (strip, collapse
  whitespace, casefold), against the candidate's `site_description`,
  plus a website comparison. Skip only when both match.
- The test for this MUST use a real reviewed record from
  `data/partners-reviewed.json` (the critique's lesson: a fixture with
  the wrong field name is how this shipped broken).
- Note: the skip was first implemented on the unmerged branch
  `collection/improvements-batch-1`; this branch implements it
  correctly from scratch on main, so the other branch's version is
  superseded — record that in the final report.

### Extraction fixes that feed identity quality (R1, R6, R12)

- **R1 slug-derived names:** in `extract_profile_leads`, when link text
  is a generic CTA/badge (`( FULL PROFILE )`, `link`, round badges like
  `Seed, 2019`, category labels) or missing, derive the name from the
  last URL path segment, title-cased, flagged `name_source: url_slug`.
- **R6 cross-page dedupe:** dedupe companies/people/image rows by
  (normalised name, URL) across all pages of a partner, not per page.
- **R12 per-source status:** the run summary and the registry outcome
  record per-source status (ok / failed / rows), not just totals. A
  source yielding 0 pages ok is annotated, not silently green.
- Tests use small fixtures copied into `tests/fixtures/` from the real
  run #41/#44 artifacts (never read the scratch artifact dir from a
  test — tests must be self-contained).

## 5. Validation queue — `scripts/build-review-queue.py`, `data/review-queue.json`

Owner: subagent E. Only E touches these files. Starting point: the
uncommitted queue builder precedent in the crawl-review scratch dir
(`~/workspace/.jarvis/idea-executions/26210847-6ff3-47de-95fd-d9d3fcffc0a3/scratch/build-queue.py`
— read it, do not copy it blindly; it built the run #36 queue).

### Queue file — `data/review-queue.json` (persistent, append-only)

```json
{"version": 1, "entries": [
  {"id": "merge:person:jane-example--airtree",
   "kind": "merge", "subject": "person:jane-example--airtree",
   "subject_key": "linkedin.com/in/jane-example",
   "candidates": [{"id": "person:jane-example", "score": 0.82,
     "basis": "linkedin-url + name"}],
   "evidence": ["https://…/team", "https://…/portfolio"],
   "confidence": 0.82, "created_at": "2026-11-23T…Z",
   "run": "45129626751", "status": "pending",
   "decided_by": null, "decided_at": null, "decision_note": null}]}
```

- Entry kinds: `merge` (fuzzy identity, §1 review band), `edge`
  (low-confidence edge, confidence < 0.50), `fact` (draft funding fact
  from news, e.g. a draft round), `startup-lead` (new portfolio-company
  name with nowhere to go).
- Dedup by `(kind, subject_key)` — a re-run never re-queues an identical
  pending entry. A rejected entry is never re-proposed for identical
  evidence (fingerprint the evidence URLs).
- `startup-lead` volume control: ~258 new names/run would flood the
  queue. Rank by (number of distinct partners mentioning it, has a
  website) and cap at **100 entries per run**. The rest stay in the
  crawl artifact, not the queue.

### Transitions

- `decide(queue, entry_id, decision, by, note)` → `approved` or
  `rejected`, with `decided_by`, `decided_at`, `decision_note`.
  Approved merges write into `data/identity.json` (`merged_from` +
  `merges[]`); approved edges record `decided_by` on the edge;
  approved facts are applied to the reviewed file by the existing MCP
  write path (the queue does not edit reviewed files itself).
- The builder also emits a `--summary-md` human-readable summary (the
  run #36 docx/xlsx precedent, in repo-reviewable markdown form).
- Seed the queue from the real run #44 artifact on disk
  (`…/scratch/crawl-review-44/latest-*.json`) — real data, never invented.
- **Identity replay (landed after the first validation pass):**
  `entity_resolution.build_registry()` applies the queue's APPROVED
  merge decisions on top of the seed via `replay_queue_decisions()` —
  deterministically, in sorted order, with each entry's own
  `decided_by`/`decided_at`. Subjects the seed never produced are
  added as minimal entries first (the same shape `decide()` writes),
  so regenerating `data/identity.json` always reproduces the decided
  merges and the stored-file invariant holds with decisions landed.
  Rejected and pending entries change nothing. First pass result:
  41 approved merges replayed (registry 398 → 439 entities,
  4 → 45 merges); the graph's 38 distinct canonical winners carry the
  merged names as aliases.

## 6. Parquet edges table + wiring — `scripts/graph_edges_parquet.py`

Owner: subagent C.

- New module `scripts/graph_edges_parquet.py`: reads the regenerated
  `data/graph.json` (or `build_graph()` output) and writes
  `edges.parquet` + `relationships.parquet` (columns: source, target,
  kind, description, source_url, first_seen, last_verified, confidence,
  stale) plus a manifest entry in the same shape as
  `build-query-parquet.py`'s manifest. Uses pyarrow (26.0.1 on this VM).
  Tests use a small fixture graph, not the live file.
- **Wiring (documented, not built here):** `build-query-parquet.py`
  (branch `feature/duckdb-wasm-query`) and the live-index indexer
  `build_live_index.py` (branch `infra/gcp-terraform-bootstrap`) gain
  the `edges` / `relationships` tables by importing this module's
  builder — a ~10-line patch in each, to land once those branches
  merge. This branch does not copy those files in (they are not on
  main).

### The exact wiring patches (recorded when piece 3 finished)

DuckDB branch — in `scripts/build-query-parquet.py`, in `build()`,
immediately after `tables = build_tables(data_dir)` (6 added lines; the
existing manifest loop then writes both new tables automatically):

```python
    # KG connective tissue: edges / relationships tables from the version-2
    # graph (scripts/graph_edges_parquet.py). data/graph.json is regenerated
    # by scripts/make-graph.py and sits beside the reviewed files.
    import graph_edges_parquet
    graph = json.loads((data_dir / 'graph.json').read_text(encoding='utf-8'))
    tables.update(graph_edges_parquet.build_tables(graph))
```

Live-index branch — in `scripts/build_live_index.py`, add one loader
next to `load_parquet_builder()`, and in `build_index()` immediately
after `tables = builder.build_tables(Path(corpus_dir))` (13 added
lines; the corpus holds only the 4 reviewed files, so the graph is
rebuilt in-process — `catalogue['partnerLeads']` is verified to be the
same 202-name set as `data/partner-leads.json`):

```python
def load_script(name, filename):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'scripts' / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module
```

```python
    # KG connective tissue: edges / relationships tables from the v2 graph,
    # rebuilt in-process from the reviewed corpus files.
    corpus = Path(corpus_dir)
    read = lambda name: json.loads((corpus / name).read_text(encoding='utf-8'))
    catalogue = read('catalogue.json')
    graph = load_script('atlas_make_graph', 'make-graph.py').build_graph(
        read('partner-profiles.json'), catalogue['partnerLeads'],
        read('partners-reviewed.json'), catalogue, read('startup-research.json'))
    tables.update(load_script('atlas_graph_edges', 'graph_edges_parquet.py').build_tables(graph))
```

## 7. What is deliberately NOT in this build

- **No MCP tools.** A queue-read tool or a partner-profiles write tool
  (R14/D4) is a separate, Ben-decided build; the MCP server is mid-rebase
  on another branch. The queue is file-based so the review loop can use
  it without the MCP.
- **No explorer UI changes** (KG-2, KG-11) and no Loom wiring — the graph
  data gets better first; the surfaces consume it after.
- **No JS-rendered-site fetching** (R16/D2) and no new crawl sources
  (D3/D5) — scope decisions for Ben, not this build.
- **No startup-intake write path** beyond the `startup-lead` queue
  entries — the curated-vs-growing decision (D-C/KG-9) is Ben's, and the
  intake build follows it.
- **No backfill of lead investors from held articles** — that is review
  work (a human pass over the 54 held articles), not code. The schema
  fields land here; the values land by review.

## 8. Decisions for Ben (defaults chosen so the build does not block)

| Decision | Default in this build | If Ben wants otherwise |
|---|---|---|
| Auto-merge threshold | 0.90, identity-key required | Raise to 0.95 (fewer auto-merges) or lower to 0.85 |
| Review band | 0.65–0.90 → queue | Widen/narrow the band |
| Stale after | 90 days without re-verification | 30 / 180 days |
| Startup-lead queue cap | 100/run, ranked | Raise the cap or rank differently |
| Failure backoff | 3+ consecutive failures → skip until reset | Different backoff ladder |
| Curated 55 vs growing index (D-C) | Queue-only intake; no auto-intake | Growing → build the intake write path next |

## 9. File ownership (no two subagents touch the same file)

- A (identity): `scripts/entity_resolution.py`, `tests/test_entity_resolution.py`, `data/identity.json`
- B (scoring): `scripts/edge_scoring.py`, `tests/test_edge_scoring.py`
- C (schema/graph/parquet): `scripts/make-graph.py`, `scripts/backfill_structured_fields.py`, `scripts/graph_edges_parquet.py`, `tests/test_graph_kg.py`, `data/startup-research.json` + `data/catalogue.json` (backfill data changes only, own commit)
- D (sampling): `scripts/crawl.py`, `scripts/crawl_sampling.py`, `tests/test_crawl_sampling.py`, `tests/fixtures/*`
- E (queue): `scripts/build-review-queue.py`, `tests/test_review_queue.py`, `data/review-queue.json`
- Coordinator (me): this doc, final integration, full test runs, the commit.

## 10. How to work on this branch

- **Do not commit.** Leave changes in the working tree; the coordinator
  reviews, runs the full suites, and commits once.
- Run only your own tests plus the directly affected existing test files
  (e.g. C runs `tests/test_graph.py`). The coordinator runs the full
  Python suite and the MCP suite at the end.
- Never write into `data/` except where §9 says your piece does, and
  never write build outputs into the repo (use `tempfile` dirs in tests).
- Do not touch `backend/mcp/`, `web/`, `.github/`, `infra/`, `docs/`
  (other than this file, which the coordinator owns), or any other
  branch's worktree. Do not push, open a PR, or merge anything.
- If a tool result flags an execution-risk check: report it verbatim in
  your final handoff and keep going with the authorised build/test work
  in this repo (Ben's own Startup Atlas checkout; this build is explicitly
  authorised). Do not silently stop.
