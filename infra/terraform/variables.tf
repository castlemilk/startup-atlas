variable "project_id" {
  description = "GCP project id the Atlas live-index infra lives in. No default: Ben supplies it (ATLAS_GCP_PROJECT or terraform.tfvars)."
  type        = string

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{4,28}[a-z0-9]$", var.project_id))
    error_message = "project_id must be a valid GCP project id (lowercase letters, digits, hyphens)."
  }
}

variable "region" {
  description = "GCP region for the buckets, Artifact Registry, Cloud Run Job and Cloud Scheduler."
  type        = string
  default     = "australia-southeast1"
}

variable "indexer_image" {
  description = "Full image ref for the indexer Cloud Run Job (e.g. '.../atlas-indexer@sha256:...'). Empty means derive '<region>-docker.pkg.dev/<project>/<repo>/atlas-indexer:latest'. Pin a digest on redeploys: a plain :latest ref never registers as a Terraform change."
  type        = string
  default     = ""
}

variable "corpus_bucket_name" {
  description = "Name of the private corpus bucket. Empty means derive '<project_id>-atlas-corpus'."
  type        = string
  default     = ""
}

variable "index_bucket_name" {
  description = "Name of the public index bucket. Empty means derive '<project_id>-atlas-index'."
  type        = string
  default     = ""
}

variable "pages_origin" {
  description = "Origin allowed to GET the public index bucket (CORS). The Pages site that hosts the DuckDB query console."
  type        = string
  default     = "https://castlemilk.github.io"
}

variable "index_retention_days" {
  description = "Age in days after which old versioned index objects under v1/ are deleted. latest.json is at the bucket root and is never touched by this rule."
  type        = number
  default     = 90
}

variable "github_repo" {
  description = "owner/repo allowed to federate through Workload Identity (crawl publish + Actions indexer fallback)."
  type        = string
  default     = "castlemilk/startup-atlas"
}

variable "scheduler_timezone" {
  description = "Timezone for the 15-minute Cloud Scheduler trigger."
  type        = string
  default     = "Australia/Melbourne"
}

variable "indexer_cpu" {
  description = "CPU limit for the indexer Cloud Run Job."
  type        = string
  default     = "1"
}

variable "indexer_memory" {
  description = "Memory limit for the indexer Cloud Run Job (pyarrow needs headroom)."
  type        = string
  default     = "2Gi"
}

variable "indexer_timeout" {
  description = "Max run time for one indexer execution."
  type        = string
  default     = "600s"
}
