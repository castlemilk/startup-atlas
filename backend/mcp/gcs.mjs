// GCS backend for the MCP live-index corpus publisher.
//
// Ben re-scoped the live-index infra to GCP (23 Nov 2026): same corpus
// layout and latest.json protocol as backend/mcp/corpus.mjs, but storage is
// Google Cloud Storage and auth is Application Default Credentials — no
// long-lived keys. This module mirrors the corpus.mjs surface
// (publishAfterUpsert -> {status, detail}) so the store can dispatch to it
// when ATLAS_CORPUS_BACKEND=gcs; see the one-line patch in PATCHES.md.
//
// Token resolution order (same as scripts/atlas_gcp.py):
//   1. ATLAS_GCP_ACCESS_TOKEN (explicit; GitHub Actions gets it from the
//      google-github-actions/auth token output)
//   2. The GCE metadata server (Cloud Run, GCE, Cloud Shell)
//   3. `gcloud auth application-default print-access-token` (local dev)
// service_account ADC files are not used here (RS256 JWT signing); the
// gcloud CLI covers that case locally. Tokens are never logged.

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import { REVIEWED_FILES } from './corpus.mjs';

const execFileAsync = promisify(execFile);

const GCS_API_BASE = 'https://storage.googleapis.com';
const GCS_UPLOAD_BASE = 'https://storage.googleapis.com/upload/storage/v1';
const METADATA_BASE =
  process.env.ATLAS_GCP_METADATA_BASE || 'http://metadata.google.internal';
const CORPUS_PREFIX = 'corpus/v1';

const sha256Hex = (data) => createHash('sha256').update(data).digest('hex');

export function gcsConfigFromEnv(env = process.env) {
  if ((env.ATLAS_CORPUS_BACKEND || 's3').toLowerCase() !== 'gcs') return null;
  const bucket = env.ATLAS_CORPUS_BUCKET || '';
  if (!bucket) return null;
  return {
    bucket,
    indexBucket: env.ATLAS_CORPUS_INDEX_BUCKET || '',
    project: env.ATLAS_GCP_PROJECT || '',
  };
}

async function metadataToken(fetchImpl = fetch) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2000);
  try {
    const response = await fetchImpl(
      `${METADATA_BASE}/computeMetadata/v1/instance/service-accounts/default/token`,
      { headers: { 'Metadata-Flavor': 'Google' }, signal: controller.signal },
    );
    if (!response.ok) return null;
    const body = await response.json();
    return body.access_token || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function gcloudToken() {
  try {
    const { stdout } = await execFileAsync('gcloud', [
      'auth', 'application-default', 'print-access-token',
    ], { timeout: 30000 });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

export async function getAccessToken(env = process.env, fetchImpl = fetch) {
  const explicit = (env.ATLAS_GCP_ACCESS_TOKEN || '').trim();
  if (explicit) return explicit;
  return (await metadataToken(fetchImpl)) || (await gcloudToken());
}

async function gcsRequest(config, token, method, url, body, contentType, fetchImpl) {
  const headers = { Authorization: `Bearer ${token}` };
  if (contentType) headers['Content-Type'] = contentType;
  let response = await fetchImpl(url, { method, headers, body });
  if (response.status === 401) {
    // Token may have expired: resolve once more and retry once.
    const fresh = await getAccessToken(process.env, fetchImpl);
    if (fresh && fresh !== token) {
      headers.Authorization = `Bearer ${fresh}`;
      response = await fetchImpl(url, { method, headers, body });
    }
  }
  return response;
}

async function putObject(config, key, body, contentType, fetchImpl = fetch) {
  const token = await getAccessToken(process.env, fetchImpl);
  if (!token) {
    throw new Error(
      'GCS is not authenticated: no Application Default Credentials found. ' +
      'Run `gcloud auth application-default login`, set ATLAS_GCP_ACCESS_TOKEN, or run on GCP.',
    );
  }
  const url = `${GCS_UPLOAD_BASE}/b/${config.bucket}/o?uploadType=media&name=${encodeURIComponent(key)}`;
  const response = await gcsRequest(config, token, 'PUT', url, body, contentType, fetchImpl);
  if (!response.ok) {
    throw new Error(`GCS PUT ${config.bucket}/${key} failed (HTTP ${response.status})`);
  }
  return { key, sha256: sha256Hex(body), bytes: body.length };
}

async function notifyIndexer(config, payload, fetchImpl = fetch) {
  const repo = process.env.ATLAS_INDEXER_REPO || process.env.GITHUB_REPOSITORY || '';
  const githubToken = process.env.GITHUB_TOKEN || '';
  if (!repo || !githubToken) return false;
  const response = await fetchImpl(`https://api.github.com/repos/${repo}/dispatches`, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${githubToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ event_type: 'corpus-updated', client_payload: payload }),
  });
  return response.ok;
}

export async function publishReviewedFileGcs({ root, filename, config, fetchImpl = fetch }) {
  const data = await readFile(path.join(root, 'data', filename));
  const uploaded = await putObject(
    config, `${CORPUS_PREFIX}/reviewed/${filename}`, data, 'application/json', fetchImpl);
  const entries = {};
  for (const name of REVIEWED_FILES) {
    try {
      const bytes = name === filename ? data : await readFile(path.join(root, 'data', name));
      entries[name] = { sha256: sha256Hex(bytes), bytes: bytes.length };
    } catch {
      // A reviewed file absent from this checkout stays out of the manifest.
    }
  }
  const manifest = {
    version: 1,
    generated_at: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
    source_revision: '',
    files: entries,
    sha256: sha256Hex(JSON.stringify(entries)),
  };
  await putObject(
    config, `${CORPUS_PREFIX}/reviewed/manifest.json`,
    Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`), 'application/json', fetchImpl);
  return uploaded;
}

// Best-effort corpus publish after an upsert (GCS backend). Never throws:
// callers attach the returned object as `liveIndex` on the upsert result.
export async function publishAfterUpsertGcs({ root, filename, config = gcsConfigFromEnv(), fetchImpl = fetch }) {
  if (!config) return { status: 'skipped', detail: 'corpus_not_configured' };
  try {
    const uploaded = await publishReviewedFileGcs({ root, filename, config, fetchImpl });
    let dispatched = false;
    try {
      dispatched = await notifyIndexer(
        config, { source: 'mcp', file: filename }, fetchImpl);
    } catch {
      dispatched = false; // the scheduled indexer poll covers a missed dispatch
    }
    return { status: 'queued', detail: { key: uploaded.key, sha256: uploaded.sha256, indexer_dispatched: dispatched } };
  } catch (error) {
    return { status: 'failed', detail: String(error?.message || error) };
  }
}
