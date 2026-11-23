# Startup Atlas live-index infrastructure (GCP) — Terraform
#
# Phase 1 of the live-index pipeline, re-scoped to GCP per Ben's direction
# (23 Nov 2026): all infra via Terraform, Application Default Credentials,
# no long-lived keys. See infra/GCP-BOOTSTRAP.md for the runbook.
#
# Resources created:
#   - GCS corpus bucket (private) + GCS index bucket (public, CORS for Pages)
#   - Artifact Registry repo for the indexer image
#   - Service accounts: indexer (Cloud Run Job), scheduler (Cloud Scheduler),
#     github-actions (Workload Identity Federation, no keys)
#   - Cloud Run Job (async indexer) + Cloud Scheduler job (15-minute trigger)
#   - The 6 APIs the pipeline needs (storage, run, scheduler, iam,
#     artifactregistry, secretmanager — the last for phase 2, nothing stored
#     in it yet)
#
# State: local by default (infra/terraform/, gitignored). Moving to a GCS
# backend is a documented follow-up; see the commented backend block in
# versions.tf. Never commit *.tfstate to the repo.

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }

  # Follow-up: move state into a GCS backend once the bootstrap has run.
  # Create the state bucket first (it must already exist), then uncomment:
  #
  # backend "gcs" {
  #   bucket = "<project-id>-atlas-terraform-state"
  #   prefix = "live-index"
  # }
}
