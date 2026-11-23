# Live index pipeline

Crawl → object storage (corpus) → async indexer → versioned Parquet index →
DuckDB-WASM in the browser. This is the pipeline that finally lets an MCP
edit or a crawl reach the live site without a PR merge and a Pages rebuild.
Full design: the design doc in the project goal files,
`atlas-live-index-design-2026-11-23.md` (originally R2 vs S3; infra re-scoped
to GCP 23 Nov 2026 — see `infra/GCP-BOOTSTRAP.md`).

## Buckets

| Bucket | Access | Contents |
|---|---|---|
| `startup-atlas-corpus` | Private (GCS, uniform access, public access prevented) | Raw crawl snapshots + reviewed data files |
| `startup-atlas-index` | Public (`allUsers: objectViewer`, CORS for the Pages origin) | Versioned Parquet index + `latest.json` |

Storage is **Google Cloud Storage** (see `infra/GCP-BOOTSTRAP.md`); auth is
Application Default Credentials — no long-lived keys. The R2/S3 path still
exists in the code (`ATLAS_CORPUS_BACKEND=s3`) but GCP is the deployed backend.

## Configuration (environment only, never in the repo)

```
ATLAS_CORPUS_BACKEND       gcs
ATLAS_CORPUS_BUCKET        <project>-atlas-corpus
ATLAS_CORPUS_INDEX_BUCKET  <project>-atlas-index
ATLAS_GCP_PROJECT          <project-id>
ATLAS_GCP_ACCESS_TOKEN     (GitHub Actions only; from the auth action)
ATLAS_INDEXER_REPO         castlemilk/startup-atlas   # for repository_dispatch
GITHUB_TOKEN               # dispatch auth (Actions provides it)
```

Infra is Terraform in `infra/terraform/`; run `task bootstrap`
(see `infra/GCP-BOOTSTRAP.md`). No long-lived keys: local runs use ADC
(`gcloud auth application-default login`), GitHub Actions uses Workload
Identity Federation, Cloud Run uses its attached service account.

GitHub secrets of the same names feed the two workflows. With no
`ATLAS_CORPUS_*` environment every writer skips cleanly and the repo behaves
exactly as before the pipeline existed.

## The three stages

### 1. Corpus writes

- **Crawl** — `.github/workflows/partner-research.yml` runs
  `python3 scripts/publish_crawl_corpus.py --snapshots research/crawl
  --run-id <github.run_id>` after the artifact upload. It PUTs each
  `latest-<mode>.json` snapshot (and its stamped sibling) to
  `corpus/v1/crawl-snapshots/<mode>/…` (the stamped run snapshot, which
  the corpus bucket's lifecycle rule expires after 90 days) and
  `corpus/v1/crawl/<mode>/latest.json` (the pointer, never expired),
  then POSTs a `corpus-updated`
  `repository_dispatch`. The step has `continue-on-error: true`; a failed
  push never fails a crawl. Dry-run:
  `python3 scripts/publish_crawl_corpus.py --snapshots research/crawl --dry-run`
- **MCP** — after a validated partner/startup upsert, `backend/mcp/corpus.mjs`
  PUTs the changed reviewed file to `corpus/v1/reviewed/…`, rewrites
  `corpus/v1/reviewed/manifest.json` from the local files, and dispatches
  the indexer. Best-effort and after the write lock is released; the upsert
  result gains `liveIndex: {status: 'queued'|'skipped'|'failed'}` and keeps
  `published: false`.

### 2. Async indexer

`.github/workflows/live-index.yml` — every 15 minutes, on
`repository_dispatch` (`corpus-updated`), or manual dispatch. It runs
`scripts/build_live_index.py --corpus-store --bootstrap-from data --out
live-index --publish`:

- Downloads `corpus/v1/reviewed/` from the corpus bucket (first run: no
  reviewed manifest yet, so it builds from the repo `data/` and seeds the
  corpus with those files).
- Rebuilds only when the reviewed manifest sha256 changed; otherwise exits
  0 with "index up to date".
- Writes `v1/<version>/` (9 Parquet tables + manifest) and swaps
  `latest.json` last. Versions are immutable and content-addressed
  (`<UTC>-<short sha>`); rollback is rewriting the pointer.

Local use: `python3 scripts/build_live_index.py --corpus-dir data --out
live-index` (no credentials needed; add `--publish` with env set to upload).

### 3. Serving

`web/query.html` + `web/query.js` follow `latest.json` from the index base:
the `<meta name="atlas-live-index">` URL when set, otherwise the
same-origin `./data/query/` from the static build. The static build now
writes `latest.json` next to `manifest.json`, so both paths speak one
protocol; an older deploy without `latest.json` falls back to `manifest.json`
directly. The provenance line shows the index version, generation time, and
source revision.

To point the page at the live index, set the meta tag's `content` to the
index bucket's public base URL (trailing slash), e.g.
`https://index.example.com/`. Removing it returns the page to the static
build. CORS on the index bucket must allow `GET` from the Pages origin.

## Rollback and failure modes

- **Bad index version:** rewrite `latest.json` to an earlier
  version (versions are immutable, so this is always safe).
- **Indexer down:** the query page keeps serving the last published version;
  the 15-minute poll retries automatically.
- **Corpus write fails:** crawl/MCP keep working; the poll picks the change
  up once storage is back (MCP) or the next crawl republishes (crawl).
- **Buckets deleted:** remove the meta tag; the site falls back to the
  static build.

## Phase 2 (not built yet)

GCS event notification (Eventarc) on `corpus/v1/reviewed/*` object-create →
Cloud Run Job execution, for sub-minute freshness after reviewed writes.
The 15-minute Cloud Scheduler poll stays as a safety net.
