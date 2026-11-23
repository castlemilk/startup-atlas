// Live-index corpus publisher for the MCP write path.
//
// After a validated upsert lands in the local checkout, the store calls
// publishAfterUpsert() best-effort: the changed reviewed file is PUT to the
// private corpus bucket, the reviewed manifest is rewritten from the local
// files, and a repository_dispatch nudges the async indexer. Nothing here
// ever fails an upsert — a corpus failure is reported as
// {status: 'failed'} and the indexer's 15-minute scheduled poll picks the
// change up instead.
//
// Configuration is environment only (same names as scripts/atlas_corpus.py):
//   ATLAS_CORPUS_ENDPOINT, ATLAS_CORPUS_BUCKET, ATLAS_CORPUS_REGION,
//   ATLAS_CORPUS_ACCESS_KEY_ID, ATLAS_CORPUS_SECRET_ACCESS_KEY,
//   ATLAS_INDEXER_REPO (owner/repo), GITHUB_TOKEN (dispatch auth).
// With no ATLAS_CORPUS_* environment the publisher reports 'skipped' and
// the upsert behaves exactly as before. Secrets are never logged.
import { createHash, createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { publishAfterUpsertGcs } from './gcs.mjs';

export const REVIEWED_FILES = [
  'catalogue.json',
  'partners-reviewed.json',
  'partner-profiles.json',
  'startup-research.json',
];
const CORPUS_PREFIX = 'corpus/v1';

const sha256Hex = (data) => createHash('sha256').update(data).digest('hex');
const hmac = (key, msg) => createHmac('sha256', key).update(msg, 'utf8').digest();

export function corpusConfigFromEnv(env = process.env) {
  const endpoint = (env.ATLAS_CORPUS_ENDPOINT || '').replace(/\/$/, '');
  const bucket = env.ATLAS_CORPUS_BUCKET || '';
  const accessKey = env.ATLAS_CORPUS_ACCESS_KEY_ID || '';
  const secretKey = env.ATLAS_CORPUS_SECRET_ACCESS_KEY || '';
  if (!endpoint || !bucket || !accessKey || !secretKey) return null;
  return {
    endpoint,
    bucket,
    region: env.ATLAS_CORPUS_REGION || 'auto',
    accessKey,
    secretKey,
    repo: env.ATLAS_INDEXER_REPO || env.GITHUB_REPOSITORY || '',
    githubToken: env.GITHUB_TOKEN || '',
  };
}

export function signRequest({ method, url, headers = {}, body = Buffer.alloc(0), accessKey, secretKey, region, now = new Date() }) {
  const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const dateStamp = amzDate.slice(0, 8);
  const parsed = new URL(url);
  const canonicalUri = encodeURI(parsed.pathname || '/').replace(/%2F/g, '/');
  const payloadHash = sha256Hex(body);
  const lower = Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [name.toLowerCase(), String(value).trim()]),
  );
  lower.host = parsed.host;
  lower['x-amz-content-sha256'] = payloadHash;
  lower['x-amz-date'] = amzDate;
  const signedHeaders = Object.keys(lower).sort();
  const canonicalHeaders = signedHeaders.map((name) => `${name}:${lower[name]}\n`).join('');
  const canonicalRequest = [method, canonicalUri, parsed.search.slice(1), canonicalHeaders, signedHeaders.join(';'), payloadHash].join('\n');
  const scope = `${dateStamp}/${region}/s3/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256Hex(canonicalRequest)].join('\n');
  let signingKey = hmac(`AWS4${secretKey}`, dateStamp);
  signingKey = hmac(signingKey, region);
  signingKey = hmac(signingKey, 's3');
  signingKey = hmac(signingKey, 'aws4_request');
  const signature = createHmac('sha256', signingKey).update(stringToSign, 'utf8').digest('hex');
  return {
    ...headers,
    'x-amz-date': amzDate,
    'x-amz-content-sha256': payloadHash,
    Authorization: `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${signedHeaders.join(';')}, Signature=${signature}`,
  };
}

async function putObject(config, key, body, contentType, fetchImpl = fetch) {
  const url = `${config.endpoint}/${config.bucket}/${key}`;
  const headers = signRequest({
    method: 'PUT', url, headers: { 'Content-Type': contentType }, body,
    accessKey: config.accessKey, secretKey: config.secretKey, region: config.region,
  });
  const response = await fetchImpl(url, { method: 'PUT', headers, body });
  if (!response.ok) {
    throw new Error(`Object store PUT ${config.bucket}/${key} failed (HTTP ${response.status})`);
  }
  return { key, sha256: sha256Hex(body), bytes: body.length };
}

async function notifyIndexer(config, payload, fetchImpl = fetch) {
  if (!config.repo || !config.githubToken) return false;
  const response = await fetchImpl(`https://api.github.com/repos/${config.repo}/dispatches`, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${config.githubToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ event_type: 'corpus-updated', client_payload: payload }),
  });
  return response.ok;
}

export async function publishReviewedFile({ root, filename, config, fetchImpl = fetch }) {
  const data = await readFile(path.join(root, 'data', filename));
  const uploaded = await putObject(
    config, `${CORPUS_PREFIX}/reviewed/${filename}`, data, 'application/json', fetchImpl);
  // Rewrite the reviewed manifest from the local files, so the indexer can
  // tell the corpus changed. Files are hashed from bytes just read or read
  // now — never trusted from a caller.
  const entries = {};
  for (const name of REVIEWED_FILES) {
    try {
      const bytes = name === filename ? data : await readFile(path.join(root, 'data', name));
      entries[name] = { sha256: sha256Hex(bytes), bytes: bytes.length };
    } catch {
      // A reviewed file absent from this checkout stays out of the manifest;
      // the indexer fails clearly instead of indexing a partial corpus.
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

// Best-effort corpus publish after an upsert. Never throws: callers attach
// the returned object as `liveIndex` on the upsert result.
export async function publishAfterUpsert({ root, filename, config = corpusConfigFromEnv(), fetchImpl = fetch }) {
  if ((process.env.ATLAS_CORPUS_BACKEND || 's3').toLowerCase() === 'gcs') {
    return publishAfterUpsertGcs({ root, filename, fetchImpl });
  }
  if (!config) return { status: 'skipped', detail: 'corpus_not_configured' };
  try {
    const uploaded = await publishReviewedFile({ root, filename, config, fetchImpl });
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
