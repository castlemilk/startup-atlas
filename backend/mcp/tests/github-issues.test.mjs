import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { GitHubIssuesClient, DEFAULT_GITHUB_REPO, dedupMarker } from '../github-issues.mjs';
import { CatalogueStore } from '../store.mjs';
import { createServer } from '../server.mjs';
import { EntryError } from '../../../scripts/catalogue-entries.mjs';

const repo = fileURLToPath(new URL('../../../', import.meta.url));
const FAKE_TOKEN = 'ghp_faketokenforunittests00000000000000';
const ISSUE = { number: 378, title: '[kpi-backlog:F3] Automate the manual loop steps', html_url: 'https://github.com/castlemilk/startup-atlas/issues/378', state: 'open' };

function jsonResponse(status, payload, headers = {}) {
  const map = new Map(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), String(value)]));
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: name => map.get(String(name).toLowerCase()) ?? null },
    json: async () => payload,
  };
}

/** A fetch stub that records every call and answers from `handler`. */
function fakeFetch(handler) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return handler(url, init, calls);
  };
  return { fetchImpl, calls };
}

const createdIssue = (overrides = {}) => ({ ...ISSUE, ...overrides });
const searchPayload = items => ({ total_count: items.length, incomplete_results: false, items });

function clientWith(handler, token = FAKE_TOKEN) {
  const { fetchImpl, calls } = fakeFetch(handler);
  return { client: new GitHubIssuesClient({ token, fetchImpl }), calls };
}

function assertError(promise, code) {
  return assert.rejects(promise, error => {
    assert.ok(error instanceof EntryError, `expected EntryError, got ${error}`);
    assert.equal(error.code, code);
    return true;
  });
}

test('creates an issue with the right request and never puts the token in the URL or body', async () => {
  const { client, calls } = clientWith(async url => {
    assert.match(url, /\/repos\/castlemilk\/startup-atlas\/issues$/);
    return jsonResponse(201, createdIssue({ title: 'Fix the loop health check' }));
  });
  const result = await client.createIssue({ title: 'Fix the loop health check', body: 'The console shipped a bug unnoticed.', labels: ['kpi-backlog'] });
  assert.equal(calls.length, 1);
  const call = calls[0];
  assert.equal(call.init.method, 'POST');
  assert.equal(call.init.headers.authorization, `Bearer ${FAKE_TOKEN}`);
  assert.equal(call.init.headers.accept, 'application/vnd.github+json');
  assert.equal(call.init.headers['x-github-api-version'], '2022-11-28');
  const sent = JSON.parse(call.init.body);
  assert.deepEqual(sent, { title: 'Fix the loop health check', body: 'The console shipped a bug unnoticed.', labels: ['kpi-backlog'] });
  assert.ok(!call.url.includes(FAKE_TOKEN) && !call.init.body.includes(FAKE_TOKEN));
  assert.deepEqual(result, {
    created: true,
    repository: DEFAULT_GITHUB_REPO,
    dedupKey: null,
    issue: { number: 378, title: 'Fix the loop health check', url: 'https://github.com/castlemilk/startup-atlas/issues/378', state: 'open' },
  });
});

test('dedup_key returns the existing open issue and never POSTs', async () => {
  const { client, calls } = clientWith(async url => {
    assert.match(url, /\/search\/issues\?q=/);
    assert.match(decodeURIComponent(url), /repo:castlemilk\/startup-atlas in:title \[kpi-backlog:F3\] state:open/);
    return jsonResponse(200, searchPayload([ISSUE]));
  });
  const result = await client.createIssue({ title: 'Automate the manual loop steps', body: 'Wall-clock is ~2h.', dedupKey: 'F3' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].init.method, 'GET');
  assert.deepEqual(result, { created: false, repository: DEFAULT_GITHUB_REPO, dedupKey: 'F3', issue: { number: 378, title: ISSUE.title, url: ISSUE.html_url, state: 'open' } });
});

test('dedup_key with no match prepends the marker and creates', async () => {
  const { client, calls } = clientWith(async (url, init) => {
    if (url.includes('/search/issues')) return jsonResponse(200, searchPayload([]));
    return jsonResponse(201, createdIssue());
  });
  const result = await client.createIssue({ title: 'Automate the manual loop steps', body: 'Wall-clock is ~2h.', dedupKey: 'F3' });
  assert.equal(result.created, true);
  assert.equal(calls.length, 2);
  const sent = JSON.parse(calls[1].init.body);
  assert.equal(sent.title, '[kpi-backlog:F3] Automate the manual loop steps');
  assert.equal(dedupMarker('F3'), '[kpi-backlog:F3]');
});

test('dedup_key does not double-prepend a title that already carries the marker', async () => {
  const { client, calls } = clientWith(async (url, init) => {
    if (url.includes('/search/issues')) return jsonResponse(200, searchPayload([]));
    return jsonResponse(201, createdIssue());
  });
  await client.createIssue({ title: '[kpi-backlog:F3] Automate the manual loop steps', body: 'Wall-clock is ~2h.', dedupKey: 'F3' });
  const sent = JSON.parse(calls[1].init.body);
  assert.equal(sent.title, '[kpi-backlog:F3] Automate the manual loop steps');
});

test('a closed issue with the same marker does not block a fresh create', async () => {
  const { client, calls } = clientWith(async (url, init) => {
    if (url.includes('/search/issues')) return jsonResponse(200, searchPayload([{ ...ISSUE, state: 'closed' }]));
    return jsonResponse(201, createdIssue());
  });
  const result = await client.createIssue({ title: 'Automate the manual loop steps', body: 'Re-file after the first was closed.', dedupKey: 'F3' });
  assert.equal(result.created, true);
  assert.equal(calls.length, 2);
});

test('without dedup_key no search runs and the issue is created directly', async () => {
  const { client, calls } = clientWith(async () => jsonResponse(201, createdIssue({ title: 'One-off issue' })));
  const result = await client.createIssue({ title: 'One-off issue', body: 'No dedup needed.' });
  assert.equal(calls.length, 1);
  assert.equal(result.created, true);
});

test('a missing token fails before any network call', async () => {
  const { client, calls } = clientWith(async () => jsonResponse(201, createdIssue()), '');
  await assertError(client.createIssue({ title: 'x', body: 'y' }), 'GITHUB_TOKEN_MISSING');
  assert.equal(calls.length, 0);
});

test('invalid arguments are rejected without a network call', async () => {
  const { client, calls } = clientWith(async () => jsonResponse(201, createdIssue()));
  const bad = [
    { title: 'x', body: 'y', repo: 'no-slash' },
    { title: '', body: 'y' },
    { title: 'x'.repeat(201), body: 'y' },
    { title: 'x', body: '' },
    { title: 'x', body: 'y', labels: Array.from({ length: 11 }, (_, i) => `l${i}`) },
    { title: 'x', body: 'y', labels: [''] },
    { title: 'x', body: 'y', dedupKey: 'f3' },
    { title: 'x', body: 'y', dedupKey: 'F3-1' },
    { title: 'x', body: 'y', dedupKey: 'F' },
  ];
  for (const args of bad) await assertError(client.createIssue(args), 'VALIDATION_ERROR');
  assert.equal(calls.length, 0);
});

test('GitHub failures map to specific codes and never leak the token', async () => {
  const cases = [
    { status: 401, payload: { message: 'Bad credentials' }, code: 'GITHUB_AUTH_ERROR' },
    { status: 403, payload: { message: 'Forbidden' }, code: 'GITHUB_FORBIDDEN' },
    { status: 404, payload: { message: 'Not Found' }, code: 'GITHUB_REPO_NOT_FOUND' },
    { status: 422, payload: { message: 'Validation Failed', errors: [{ message: "Label 'nope' does not exist" }] }, code: 'GITHUB_VALIDATION_ERROR' },
    { status: 500, payload: { message: 'Server Error' }, code: 'GITHUB_ERROR' },
  ];
  for (const { status, payload, code } of cases) {
    const { client } = clientWith(async () => jsonResponse(status, payload));
    await assert.rejects(
      client.createIssue({ title: 'x', body: 'y' }),
      error => {
        assert.equal(error.code, code);
        assert.ok(!error.message.includes(FAKE_TOKEN), 'error message must not contain the token');
        if (code === 'GITHUB_VALIDATION_ERROR') assert.match(error.message, /nope/);
        return true;
      },
    );
  }
});

test('a rate-limited 403 names the reset time and is not retried', async () => {
  const reset = Math.floor(Date.now() / 1000) + 3600;
  const { client, calls } = clientWith(async () => jsonResponse(403, { message: 'API rate limit exceeded' }, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(reset) }));
  await assert.rejects(
    client.createIssue({ title: 'x', body: 'y' }),
    error => {
      assert.equal(error.code, 'GITHUB_RATE_LIMITED');
      assert.match(error.message, new RegExp(new Date(reset * 1000).toISOString().slice(0, 13)));
      return true;
    },
  );
  assert.equal(calls.length, 1);
});

test('a failing search aborts before any create is attempted', async () => {
  const { client, calls } = clientWith(async url => {
    if (url.includes('/search/issues')) return jsonResponse(500, { message: 'Server Error' });
    return jsonResponse(201, createdIssue());
  });
  await assertError(client.createIssue({ title: 'x', body: 'y', dedupKey: 'F3' }), 'GITHUB_ERROR');
  assert.equal(calls.length, 1);
});

test('a network failure reports the outcome as unconfirmed, not as success or failure', async () => {
  const { client } = clientWith(async () => { throw new Error('socket hang up'); });
  await assert.rejects(
    client.createIssue({ title: 'x', body: 'y' }),
    error => {
      assert.equal(error.code, 'GITHUB_ERROR');
      assert.match(error.message, /not confirmed created/);
      return true;
    },
  );
});

// --- Server-level: the tool is listed, gated on --write, and passes through ---

async function connectServer(t, { write, githubIssues, githubToken }) {
  const dir = await mkdtemp(path.join(tmpdir(), 'atlas-issues-'));
  await cp(path.join(repo, 'data'), path.join(dir, 'data'), { recursive: true });
  await mkdir(path.join(dir, 'scripts'));
  await cp(path.join(repo, 'scripts/make-data.py'), path.join(dir, 'scripts/make-data.py'));
  const store = new CatalogueStore(dir, { writeEnabled: write });
  await store.snapshot();
  const server = createServer(store, { ...(githubIssues ? { githubIssues } : {}), ...(githubToken !== undefined ? { githubToken } : {}) });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: 'atlas-issues-test-client', version: '1.0.0' });
  t.after(async () => { await client.close(); await rm(dir, { recursive: true, force: true }); });
  await client.connect(clientTransport);
  return client;
}

const decoded = result => JSON.parse(result.content[0].text);

test('tools/list exposes atlas_create_issue as a write tool, bringing the total to 18', async t => {
  const client = await connectServer(t, { write: true, githubIssues: { createIssue: async () => ({ created: true }) } });
  const { tools } = await client.listTools();
  assert.equal(tools.length, 18);
  const tool = tools.find(item => item.name === 'atlas_create_issue');
  assert.ok(tool);
  assert.equal(tool.annotations.readOnlyHint, false);
  assert.equal(tool.annotations.idempotentHint, false);
  assert.deepEqual(tool.inputSchema.required, ['title', 'body']);
});

test('read-only server rejects atlas_create_issue with READ_ONLY and never calls GitHub', async t => {
  let calls = 0;
  const fake = { createIssue: async args => { calls += 1; return { created: true, repository: 'x', dedupKey: null, issue: { number: 1, title: args.title, url: 'https://example.com/1', state: 'open' } }; } };
  const client = await connectServer(t, { write: false, githubIssues: fake });
  const result = await client.callTool({ name: 'atlas_create_issue', arguments: { title: 'x', body: 'y' } });
  assert.equal(result.isError, true);
  assert.equal(decoded(result).code, 'READ_ONLY');
  assert.equal(calls, 0);
});

test('write server passes the call through to the GitHub client with the default repo', async t => {
  let seen = null;
  const fake = { createIssue: async args => { seen = args; return { created: true, repository: args.repo, dedupKey: args.dedupKey, issue: { number: 378, title: args.title, url: 'https://github.com/castlemilk/startup-atlas/issues/378', state: 'open' } }; } };
  const client = await connectServer(t, { write: true, githubIssues: fake });
  const result = await client.callTool({ name: 'atlas_create_issue', arguments: { title: '[kpi-backlog:F3] Automate the manual loop steps', body: 'Wall-clock is ~2h.', labels: ['kpi-backlog'], dedup_key: 'F3' } });
  assert.equal(result.isError, undefined);
  assert.deepEqual(decoded(result), {
    created: true,
    repository: 'castlemilk/startup-atlas',
    dedupKey: 'F3',
    issue: { number: 378, title: '[kpi-backlog:F3] Automate the manual loop steps', url: 'https://github.com/castlemilk/startup-atlas/issues/378', state: 'open' },
  });
  assert.deepEqual(seen, { repo: 'castlemilk/startup-atlas', title: '[kpi-backlog:F3] Automate the manual loop steps', body: 'Wall-clock is ~2h.', labels: ['kpi-backlog'], dedupKey: 'F3' });
});

test('write server without a token reports GITHUB_TOKEN_MISSING and makes no network call', async t => {
  const client = await connectServer(t, { write: true, githubToken: '' });
  const result = await client.callTool({ name: 'atlas_create_issue', arguments: { title: 'x', body: 'y' } });
  assert.equal(result.isError, true);
  assert.equal(decoded(result).code, 'GITHUB_TOKEN_MISSING');
});

test('a GitHub error from the client surfaces as the same code on the tool', async t => {
  const fake = { createIssue: async () => { throw new EntryError('GITHUB_RATE_LIMITED', 'GitHub rate limit exhausted (403); no issue was created.'); } };
  const client = await connectServer(t, { write: true, githubIssues: fake });
  const result = await client.callTool({ name: 'atlas_create_issue', arguments: { title: 'x', body: 'y' } });
  assert.equal(result.isError, true);
  assert.equal(decoded(result).code, 'GITHUB_RATE_LIMITED');
});
