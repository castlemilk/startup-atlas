// Tests for the live-index corpus publisher (backend/mcp/corpus.mjs) and its
// wiring into the partner/startup upsert results. All network calls are
// stubbed; no credentials are needed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import {
  corpusConfigFromEnv, publishAfterUpsert, publishReviewedFile, signRequest,
} from '../corpus.mjs';
import { PartnerStore } from '../partners.mjs';

const FIXED_DATE = new Date('2026-11-23T10:30:00.000Z');

function stubFetch(calls, { failPut = false } = {}) {
  return async (url, options = {}) => {
    calls.push({ url, method: options.method, headers: options.headers, body: options.body });
    if (failPut && options.method === 'PUT') {
      return { ok: false, status: 500 };
    }
    return { ok: true, status: options.method === 'POST' ? 204 : 200 };
  };
}

function config() {
  return {
    endpoint: 'https://example.invalid', bucket: 'test-corpus', region: 'auto',
    accessKey: 'AKID', secretKey: 'secret', repo: 'castlemilk/startup-atlas',
    githubToken: 'gh-test-token',
  };
}

async function fixtureRepo(t) {
  const dir = await mkdtemp(path.join(tmpdir(), 'atlas-corpus-publish-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(path.join(dir, 'data'));
  await writeFile(path.join(dir, 'data/partner-leads.json'), JSON.stringify(['Example Partner']) + '\n');
  await writeFile(path.join(dir, 'data/partners-reviewed.json'), JSON.stringify({}) + '\n');
  await writeFile(path.join(dir, 'data/catalogue.json'), JSON.stringify({ opportunities: [], partnerLeads: ['Example Partner'] }) + '\n');
  await writeFile(path.join(dir, 'data/partner-profiles.json'), JSON.stringify({}) + '\n');
  await writeFile(path.join(dir, 'data/startup-research.json'), JSON.stringify({ reviewed: '2026-01-01', startups: [] }) + '\n');
  return dir;
}

test('corpus config is absent without environment', () => {
  assert.equal(corpusConfigFromEnv({}), null);
  assert.equal(corpusConfigFromEnv({ ATLAS_CORPUS_ENDPOINT: 'https://x.invalid' }), null);
  const full = corpusConfigFromEnv({
    ATLAS_CORPUS_ENDPOINT: 'https://x.invalid', ATLAS_CORPUS_BUCKET: 'b',
    ATLAS_CORPUS_ACCESS_KEY_ID: 'k', ATLAS_CORPUS_SECRET_ACCESS_KEY: 's',
  });
  assert.equal(full.bucket, 'b');
  assert.equal(full.region, 'auto');
});

test('SigV4 signing is deterministic and body-sensitive', () => {
  const args = {
    method: 'PUT', url: 'https://example.invalid/bucket/key.json',
    headers: { 'Content-Type': 'application/json' }, body: Buffer.from('{"a": 1}'),
    accessKey: 'AKID', secretKey: 'secret', region: 'auto', now: FIXED_DATE,
  };
  const first = signRequest(args);
  const second = signRequest(args);
  assert.equal(first.Authorization, second.Authorization);
  const changed = signRequest({ ...args, body: Buffer.from('{"a": 2}') });
  assert.notEqual(changed.Authorization, first.Authorization);
  assert.match(first.Authorization, /^AWS4-HMAC-SHA256 Credential=AKID\/20261123\/auto\/s3\/aws4_request, SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/);
  assert.equal(first['x-amz-date'], '20261123T103000Z');
});

test('publishAfterUpsert skips cleanly when storage is not configured', async () => {
  const result = await publishAfterUpsert({ root: '/nonexistent', filename: 'partners-reviewed.json', config: null });
  assert.deepEqual(result, { status: 'skipped', detail: 'corpus_not_configured' });
});

test('publishReviewedFile uploads the file and the manifest', async (t) => {
  const dir = await fixtureRepo(t);
  const calls = [];
  const fetchImpl = stubFetch(calls);
  const uploaded = await publishReviewedFile({
    root: dir, filename: 'partners-reviewed.json', config: config(), fetchImpl,
  });
  assert.equal(uploaded.key, 'corpus/v1/reviewed/partners-reviewed.json');
  const puts = calls.filter((call) => call.method === 'PUT');
  assert.deepEqual(puts.map((call) => call.url), [
    'https://example.invalid/test-corpus/corpus/v1/reviewed/partners-reviewed.json',
    'https://example.invalid/test-corpus/corpus/v1/reviewed/manifest.json',
  ]);
  for (const call of puts) {
    assert.match(call.headers.Authorization, /^AWS4-HMAC-SHA256 /);
    assert.equal(call.headers['x-amz-date'].length, 16);
  }
  const manifest = JSON.parse(puts[1].body.toString('utf8'));
  assert.equal(manifest.files['partners-reviewed.json'].bytes, 3);
  assert.equal(
    manifest.files['partners-reviewed.json'].sha256,
    createHash('sha256').update('{}\n').digest('hex'));
  assert.equal(Object.keys(manifest.files).length, 4);
});

test('publishAfterUpsert reports queued with dispatch state', async (t) => {
  const dir = await fixtureRepo(t);
  const calls = [];
  const result = await publishAfterUpsert({
    root: dir, filename: 'partners-reviewed.json', config: config(),
    fetchImpl: stubFetch(calls),
  });
  assert.equal(result.status, 'queued');
  assert.equal(result.detail.indexer_dispatched, true);
  assert.equal(result.detail.key, 'corpus/v1/reviewed/partners-reviewed.json');
  const dispatch = calls.find((call) => call.method === 'POST');
  assert.equal(dispatch.url, 'https://api.github.com/repos/castlemilk/startup-atlas/dispatches');
  assert.equal(JSON.parse(dispatch.body).event_type, 'corpus-updated');
  assert.equal(JSON.parse(dispatch.body).client_payload.source, 'mcp');
  assert.equal(dispatch.headers.Authorization, 'Bearer gh-test-token');
});

test('publishAfterUpsert never throws: a failed upload reports failed', async (t) => {
  const dir = await fixtureRepo(t);
  const result = await publishAfterUpsert({
    root: dir, filename: 'partners-reviewed.json', config: config(),
    fetchImpl: stubFetch([], { failPut: true }),
  });
  assert.equal(result.status, 'failed');
  assert.match(result.detail, /HTTP 500/);
});

test('partner upsert carries a liveIndex field and keeps published:false', async (t) => {
  const dir = await fixtureRepo(t);
  const store = new PartnerStore(dir, { writeEnabled: true });
  const record = {
    website: 'https://example.com/', description: 'An example partner for the live-index test.',
    source: 'https://example.com/about', reviewed_at: '2026-01-01',
  };
  const validated = await store.validate('Example Partner', record);
  const saved = await store.upsert('Example Partner', record, validated.revision);
  assert.equal(saved.status, 'saved');
  assert.equal(saved.published, false);
  // No corpus credentials in this environment: skipped, not failed.
  assert.deepEqual(saved.liveIndex, { status: 'skipped', detail: 'corpus_not_configured' });
  const persisted = JSON.parse(await readFile(path.join(dir, 'data/partners-reviewed.json'), 'utf8'));
  assert.equal(persisted['Example Partner'].website, 'https://example.com/');
});
