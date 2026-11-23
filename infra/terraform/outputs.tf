output "corpus_bucket_name" {
  description = "Private GCS corpus bucket (crawl snapshots + reviewed files)."
  value       = google_storage_bucket.corpus.name
}

output "index_bucket_name" {
  description = "Public GCS index bucket (versioned Parquet + latest.json)."
  value       = google_storage_bucket.index.name
}

output "index_public_url" {
  description = "Public base URL of the index bucket — the value for the atlas-live-index meta tag in web/query.html once verified."
  value       = "https://storage.googleapis.com/${google_storage_bucket.index.name}/"
}

output "indexer_job_name" {
  description = "Cloud Run Job that builds and publishes the live index."
  value       = google_cloud_run_v2_job.indexer.name
}

output "scheduler_job_name" {
  description = "Cloud Scheduler job triggering the indexer every 15 minutes."
  value       = google_cloud_scheduler_job.indexer_poll.name
}

output "artifact_registry_repository" {
  description = "Artifact Registry repo holding the indexer image."
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.indexer.repository_id}"
}

output "workload_identity_provider" {
  description = "WIF provider resource name — GitHub secret GCP_WORKLOAD_IDENTITY_PROVIDER."
  value       = google_iam_workload_identity_pool_provider.github.name
}

output "github_service_account" {
  description = "Service account GitHub Actions impersonates — GitHub secret GCP_SERVICE_ACCOUNT."
  value       = google_service_account.github_actions.email
}

output "github_secrets" {
  description = "Exact GitHub secrets to set on castlemilk/startup-atlas (Settings > Secrets > Actions). ATLAS_CORPUS_BACKEND is the literal string 'gcs'."
  value = {
    GCP_WORKLOAD_IDENTITY_PROVIDER = google_iam_workload_identity_pool_provider.github.name
    GCP_SERVICE_ACCOUNT            = google_service_account.github_actions.email
    ATLAS_GCP_PROJECT              = var.project_id
    ATLAS_CORPUS_BUCKET            = google_storage_bucket.corpus.name
    ATLAS_CORPUS_INDEX_BUCKET      = google_storage_bucket.index.name
    ATLAS_CORPUS_BACKEND           = "gcs"
  }
}
