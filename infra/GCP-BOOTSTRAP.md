# GCP bootstrap for the live-index pipeline

One task file, one command: `task bootstrap`. Everything the live-index
pipeline needs in GCP — buckets, service accounts, Workload Identity
Federation, the Cloud Run Job indexer and its 15-minute trigger — is
declared in `infra/terraform/` and created from Application Default
Credentials. No long-lived keys anywhere.

This re-scopes the storage/serving half of the live-index design
(`atlas-live-index-design-2026-11-23.md`, which chose R2) to GCP. The
corpus/index layouts, the `latest.json` pointer protocol, the Parquet
schemas and the review gate (only reviewed files are indexed) are
unchanged; only the provider moved.

## What Terraform creates

| Resource | Notes |
|---|---|
| GCS corpus bucket `<project>-atlas-corpus` | Private, uniform access, public access prevented, versioning on. Crawl snapshots + reviewed files. Lifecycle: per-run snapshots under `corpus/v1/crawl-snapshots/` are deleted 90 days after creation (plus a 1-day noncurrent purge, since versioning is on); the `latest.json` pointers and reviewed files never expire. |
| GCS index bucket `<project>-atlas-index` | Public (`allUsers: objectViewer`), CORS `GET` from the Pages origin, old `v1/` versions deleted after 90 days. Versioned Parquet + `latest.json`. |
| Artifact Registry repo `atlas` (Docker) | Holds the indexer image. |
| SA `atlas-live-indexer` | Cloud Run Job identity. `objectAdmin` on both buckets, `logging.logWriter`. |
| SA `atlas-live-scheduler` | Invokes the job (`run.invoker` on the job only). |
| SA `atlas-github-actions` + WIF pool/provider | GitHub Actions federates with its OIDC token and impersonates this SA. No keys. Grants: corpus `objectCreator` + `objectViewer`, index `objectAdmin`. |
| Cloud Run Job `atlas-live-indexer` | Runs `scripts/build_live_index.py --corpus-store --bootstrap-from data --out /tmp/live-index --publish` from the image built by `task image`. |
| Cloud Scheduler job `atlas-live-indexer-poll` | `*/15 * * * *` (Australia/Melbourne), POSTs the job `:run` endpoint with the scheduler SA's OIDC token. |
| APIs | storage, run, cloudscheduler, iam, artifactregistry, secretmanager (the last for phase 2; nothing stored yet). |

## Prerequisites

- `go-task`, `terraform`, `gcloud`, `docker` (image build only).
- Application Default Credentials: `gcloud auth application-default login`
  (once, on the operator's machine).
- A GCP project id — set `ATLAS_GCP_PROJECT=<id>` or
  `gcloud config set project <id>`. The account needs project IAM admin
  (or the specific roles to create buckets, service accounts, WIF pools,
  Cloud Run jobs and scheduler jobs) plus service-usage admin to enable APIs.
- A Docker daemon for the image build (or build the image in CI — see below).

## Commands (repo root)

```
task validate    # checks CLIs, ADC, project access, APIs, GitHub secrets — fails fast
task plan        # terraform plan, no changes
task bootstrap   # validate -> create registry -> build+push image -> apply -> next steps
task image       # rebuild + push the indexer image (after script changes)
task verify      # fetch the live latest.json + show scheduler/job state
task destroy     # guarded: needs CONFIRM_DESTROY=yes
```

### Why bootstrap is two-phase

The Cloud Run Job references the indexer image, and the image can only be
pushed once the Artifact Registry repo exists. So `task bootstrap` applies
just the registry first, builds and pushes the image, then applies the
rest. `task image` on its own assumes the registry already exists.

### After bootstrap

1. **GitHub secrets** (Settings > Secrets > Actions) — exact values from
   `terraform output github_secrets`:
   `GCP_WORKLOAD_IDENTITY_PROVIDER`, `GCP_SERVICE_ACCOUNT`,
   `ATLAS_GCP_PROJECT`, `ATLAS_CORPUS_BUCKET`, `ATLAS_CORPUS_INDEX_BUCKET`,
   `ATLAS_CORPUS_BACKEND` (= the literal string `gcs`).
2. **Point the query console at the live index** (separate PR, after
   verification): set the `<meta name="atlas-live-index">` tag in
   `web/query.html` to the `index_public_url` output
   (`https://storage.googleapis.com/<index-bucket>/`).
3. **Verify**: `task verify` — fetches `latest.json` from the public bucket
   and shows the scheduler + latest job execution. The first Cloud Run Job
   execution bootstraps the corpus from the repo `data/` in the image and
   builds index version 1.
4. **Watch the first crawl**: the next partner-research run publishes its
   snapshots to the corpus bucket (WIF auth), and the indexer picks them up
   within 15 minutes (or immediately via `repository_dispatch` to the
   Actions workflow, which stays as a fallback).

## How each writer authenticates (no keys)

| Writer | Auth |
|---|---|
| Local `task` / scripts | ADC: `gcloud auth application-default login`, or `ATLAS_GCP_ACCESS_TOKEN` |
| GitHub Actions (crawl + indexer fallback) | WIF: `google-github-actions/auth@v2` with the two secrets above; the token is passed as `ATLAS_GCP_ACCESS_TOKEN` to the Python steps |
| Cloud Run Job | Attached service account (`atlas-live-indexer`); the metadata server issues its token |
| Local MCP (`--write`) | ADC on Ben's machine, same as local scripts; the Node publisher resolves the token the same way (`backend/mcp/gcs.mjs`) |

The Python client (`scripts/atlas_gcp.py`) resolves tokens in this order:
explicit `ATLAS_GCP_ACCESS_TOKEN` → metadata server → `authorized_user`
ADC file refresh → `gcloud auth application-default print-access-token`.
`service_account` ADC files fall through to gcloud (the stdlib cannot sign
RS256 JWTs). Tokens are cached per process and refreshed once on a 401;
they never appear in logs or errors.

## Rollback and failure modes

- **Bad index version:** rewrite `latest.json` in the index bucket to an
  earlier version (versions are immutable keys).
- **Indexer down:** the query page keeps serving the last published version;
  the 15-minute poll retries automatically.
- **Corpus write fails:** crawl/MCP keep working; the poll picks the change
  up once storage is back.
- **Buckets deleted / infra torn down (`task destroy`):** remove the meta
  tag; the site falls back to the static build.
- **Terraform state** is local by default (`infra/terraform/`, gitignored).
  Moving it to a GCS backend is a documented follow-up (see the commented
  block in `infra/terraform/versions.tf`).

## Costs (phase 1, at today's sizes)

Corpus ~728 KB JSON, index ~1 MB Parquet per version. GCS Standard in
`australia-southeast1`, Cloud Run Job a few minutes a day, Cloud Scheduler
free tier: effectively a few cents a month. The cost that scales is index
reads — every browser visitor downloads Parquet. GCS egress is charged
(unlike R2's $0); if readership grows, put a load balancer + Cloud CDN in
front of the index bucket (phase 2) instead of serving
`storage.googleapis.com` directly.

## Phase 2 (not built yet)

- **Custom domain + CDN** for the index bucket (load balancer with a
  Cloud CDN backend bucket), then the meta tag points at the domain.
- **Event-driven trigger:** GCS notification (Eventarc) on
  `corpus/v1/reviewed/*` object-create → Cloud Run Job execution, for
  sub-minute freshness after reviewed writes. The 15-minute poll stays as
  a safety net.
- **Terraform state in a GCS backend.**
- **External-account ADC support** in `scripts/atlas_gcp.py` so the
  `google-github-actions/auth` default credential file works without the
  `ATLAS_GCP_ACCESS_TOKEN` plumbing in the workflows.
- **Explorer/graph on the live index** (design phase 3) — a versioned
  `graph.json` in the index bucket; the Pages build becomes a pure UI deploy.
