locals {
  corpus_bucket = var.corpus_bucket_name != "" ? var.corpus_bucket_name : "${var.project_id}-atlas-corpus"
  index_bucket  = var.index_bucket_name != "" ? var.index_bucket_name : "${var.project_id}-atlas-index"

  # Image built by `task image` (bootstrap builds + pushes it after the
  # Artifact Registry repo exists). The job references it, so a full apply
  # before the first image push fails — that is why bootstrap is two-phase.
  # Redeploys pin a digest explicitly (var.indexer_image); a plain
  # `:latest` ref never shows up as a Terraform change, so the job would
  # keep running the old image.
  indexer_image = var.indexer_image != "" ? var.indexer_image : "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.indexer.repository_id}/atlas-indexer:latest"

  # APIs the pipeline needs. secretmanager is enabled for phase 2 (the
  # GitHub dispatch token); nothing is stored in it yet.
  apis = [
    "storage.googleapis.com",
    "run.googleapis.com",
    "cloudscheduler.googleapis.com",
    "iam.googleapis.com",
    "artifactregistry.googleapis.com",
    "secretmanager.googleapis.com",
  ]
}

resource "google_project_service" "apis" {
  for_each           = toset(local.apis)
  project            = var.project_id
  service            = each.value
  disable_on_destroy = false
}

# --- Buckets ---------------------------------------------------------------
# Same two-bucket layout as the design doc; only the provider changed
# (R2 -> GCS). The corpus bucket stays private; the index bucket is public
# because every browser visitor fetches Parquet from it.

resource "google_storage_bucket" "corpus" {
  name                        = local.corpus_bucket
  location                    = var.region
  project                     = var.project_id
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false

  # Reviewed files are overwritten in place; versioning is the rollback.
  versioning {
    enabled = true
  }

  labels = {
    app       = "startup-atlas"
    component = "live-index-corpus"
  }

  depends_on = [google_project_service.apis]
}

resource "google_storage_bucket" "index" {
  name                        = local.index_bucket
  location                    = var.region
  project                     = var.project_id
  uniform_bucket_level_access = true
  # Must stay unset/"inherited": "enforced" would block the public read below.
  force_destroy = false

  # DuckDB-WASM fetches Parquet from the Pages origin.
  cors {
    origin          = [var.pages_origin]
    method          = ["GET"]
    response_header = ["Content-Type", "Content-Length"]
    max_age_seconds = 3600
  }

  # Index versions are immutable keys (v1/<version>/...); prune old ones by
  # age. latest.json lives at the bucket root and is never matched.
  lifecycle_rule {
    condition {
      age            = var.index_retention_days
      matches_prefix = ["v1/"]
    }
    action {
      type = "Delete"
    }
  }

  labels = {
    app       = "startup-atlas"
    component = "live-index"
  }

  depends_on = [google_project_service.apis]
}

# Public read on the index bucket only. The corpus bucket has no such grant.
resource "google_storage_bucket_iam_member" "index_public_read" {
  bucket = google_storage_bucket.index.name
  role   = "roles/storage.objectViewer"
  member = "allUsers"
}

# --- Artifact Registry (indexer image) -------------------------------------

resource "google_artifact_registry_repository" "indexer" {
  project       = var.project_id
  location      = var.region
  repository_id = "atlas"
  format        = "DOCKER"

  depends_on = [google_project_service.apis]
}

# --- Service accounts -------------------------------------------------------
# No long-lived keys anywhere: the indexer and scheduler use their attached
# service accounts; GitHub Actions federates via Workload Identity (below).

resource "google_service_account" "indexer" {
  project      = var.project_id
  account_id   = "atlas-live-indexer"
  display_name = "Startup Atlas live-index indexer (Cloud Run Job)"
}

resource "google_service_account" "scheduler" {
  project      = var.project_id
  account_id   = "atlas-live-scheduler"
  display_name = "Startup Atlas live-index scheduler (Cloud Scheduler)"
}

resource "google_service_account" "github_actions" {
  project      = var.project_id
  account_id   = "atlas-github-actions"
  display_name = "Startup Atlas GitHub Actions (Workload Identity Federation)"
}

# Indexer: read + write both buckets (it seeds the corpus on the bootstrap
# run and publishes index versions), plus log writing.
resource "google_storage_bucket_iam_member" "indexer_corpus" {
  bucket = google_storage_bucket.corpus.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.indexer.email}"
}

resource "google_storage_bucket_iam_member" "indexer_index" {
  bucket = google_storage_bucket.index.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.indexer.email}"
}

resource "google_project_iam_member" "indexer_logging" {
  project = var.project_id
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${google_service_account.indexer.email}"
}

# GitHub Actions (federated): crawl publishes snapshots to the corpus
# bucket; the Actions indexer fallback reads the corpus and publishes the
# index. This mirrors the corpus publisher's needs and nothing more.
resource "google_storage_bucket_iam_member" "github_corpus_create" {
  bucket = google_storage_bucket.corpus.name
  role   = "roles/storage.objectCreator"
  member = "serviceAccount:${google_service_account.github_actions.email}"
}

resource "google_storage_bucket_iam_member" "github_corpus_read" {
  bucket = google_storage_bucket.corpus.name
  role   = "roles/storage.objectViewer"
  member = "serviceAccount:${google_service_account.github_actions.email}"
}

resource "google_storage_bucket_iam_member" "github_index" {
  bucket = google_storage_bucket.index.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.github_actions.email}"
}

# --- Workload Identity Federation (GitHub -> GCP, no keys) -----------------

resource "google_iam_workload_identity_pool" "github" {
  project                   = var.project_id
  workload_identity_pool_id = "github-actions"
  display_name              = "GitHub Actions"
  description               = "Federated identity for castlemilk/startup-atlas workflows."

  depends_on = [google_project_service.apis]
}

resource "google_iam_workload_identity_pool_provider" "github" {
  project                            = var.project_id
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github"
  display_name                       = "GitHub OIDC"
  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.repository" = "assertion.repository"
    "attribute.actor"      = "assertion.actor"
  }
  attribute_condition = "assertion.repository == \"${var.github_repo}\""
  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

# The federated GitHub identity may impersonate the github-actions SA, and
# only for this repo (enforced by the attribute condition above).
resource "google_service_account_iam_member" "github_wif" {
  service_account_id = google_service_account.github_actions.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/${var.github_repo}"
}

# --- Cloud Run Job (async indexer) ------------------------------------------

resource "google_cloud_run_v2_job" "indexer" {
  name     = "atlas-live-indexer"
  location = var.region
  project  = var.project_id

  template {
    parallelism = 1
    task_count  = 1

    template {
      containers {
        image   = local.indexer_image
        command = ["python3"]
        args = [
          "scripts/build_live_index.py",
          "--corpus-store",
          "--bootstrap-from", "data",
          "--out", "/tmp/live-index",
          "--publish",
        ]

        env {
          name  = "ATLAS_CORPUS_BACKEND"
          value = "gcs"
        }
        env {
          name  = "ATLAS_CORPUS_BUCKET"
          value = google_storage_bucket.corpus.name
        }
        env {
          name  = "ATLAS_CORPUS_INDEX_BUCKET"
          value = google_storage_bucket.index.name
        }
        env {
          name  = "ATLAS_GCP_PROJECT"
          value = var.project_id
        }

        resources {
          limits = {
            cpu    = var.indexer_cpu
            memory = var.indexer_memory
          }
        }
      }

      service_account = google_service_account.indexer.email
      timeout         = var.indexer_timeout
    }
  }

  depends_on = [google_project_service.apis]
}

# Scheduler invokes the job; nothing else needs run.invoker on it.
resource "google_cloud_run_v2_job_iam_member" "scheduler_invokes_job" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_job.indexer.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.scheduler.email}"
}

# --- Cloud Scheduler (15-minute trigger) ------------------------------------
# The poll is the primary trigger; repository_dispatch from the crawl/MCP
# publishers still works through the Actions workflow as a fallback.

resource "google_cloud_scheduler_job" "indexer_poll" {
  name             = "atlas-live-indexer-poll"
  region           = var.region
  project          = var.project_id
  schedule         = "*/15 * * * *"
  time_zone        = var.scheduler_timezone
  attempt_deadline = "320s"

  http_target {
    http_method = "POST"
    uri         = "https://${var.region}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${var.project_id}/jobs/${google_cloud_run_v2_job.indexer.name}:run"
    headers = {
      "Content-Type" = "application/json"
    }
    body = base64encode("{}")

    oauth_token {
      service_account_email = google_service_account.scheduler.email
    }
  }

  depends_on = [
    google_project_service.apis,
    google_cloud_run_v2_job_iam_member.scheduler_invokes_job,
  ]
}
