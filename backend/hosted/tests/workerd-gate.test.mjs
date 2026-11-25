import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

// Workers-compatible release gate (#143 V2). The rest of this suite runs the
// hosted worker under Node, where fetch-receiver.test.mjs can only *simulate*
// workerd's receiver rules with a mock. This gate runs the real esbuild
// bundle of src/worker.mjs under workerd (via Miniflare), with a real D1
// database and the worker's default fetcher — globalThis.fetch bound to the
// workerd global — talking to a stub GitHub API through workerd's outbound
// service hook. No network access is used.
//
// The gate skips, with the reason stated in the test report, only when the
// workerd runtime itself is unavailable (Miniflare not installed, or its
// platform binary missing). Any failure of the worker under workerd fails.

// Miniflare's entry worker rejects Host/Origin hostnames that are neither
// localhost nor the upstream host (a DNS-rebinding guard), so the gate uses
// an https localhost origin where the Node suite uses atlas.example.com.
// The worker's own origin checks run unchanged against this origin.
const ORIGIN = 'https://localhost';
const REVISION = 'a'.repeat(40);

// Same fixtures as tests/helpers.mjs, restated because helpers.mjs imports
// node:sqlite/node:fs and cannot run inside workerd's outbound stub worker.
const tokenResponse = { access_token: 'ghu_test_not_real', refresh_token: 'ghr_test_not_real', token_type: 'bearer', scope: '', expires_in: 28800, refresh_token_expires_in: 15897600 };
const stubScript = `
const tokenResponse = ${JSON.stringify(tokenResponse)};
export default { async fetch(request) {
  const url = request.url;
  if (url.includes('/repos/')) {
    if (url.endsWith('/git/ref/heads/main')) return Response.json({ object: { sha: '${REVISION}' } });
    const data = url.includes('partner-leads.json') ? ['Synthetic Partner'] : {};
    return Response.json({ type: 'file', encoding: 'base64', size: 100, content: btoa(JSON.stringify(data)) });
  }
  if (url === 'https://github.com/login/oauth/access_token') return Response.json(tokenResponse);
  if (url === 'https://api.github.com/user') return Response.json({ id: 7474316, login: 'castlemilk' });
  if (url === 'https://api.github.com/user/installations?per_page=100') return Response.json({ installations: [{ id: 42, account: { id: 7474316 }, repository_selection: 'selected', permissions: { contents: 'write', pull_requests: 'write', metadata: 'read' } }] });
  if (url === 'https://api.github.com/user/installations/42/repositories?per_page=100') return Response.json({ total_count: 1, repositories: [{ id: 1453828311, full_name: 'castlemilk/startup-atlas' }] });
  if (url.endsWith('/token') && request.method === 'DELETE') return new Response(null, { status: 204 });
  return new Response('Unexpected stub URL ' + url, { status: 500 });
} }`;

// Control probe: proves the runtime executing the gate is genuinely workerd.
// Both behaviours below differ from Node: workerd rejects a fetch called with
// a wrong-object receiver ("Illegal invocation") and rejects redirect:'error'.
const probeScript = `
export default { async fetch() {
  const out = [];
  try { await globalThis.fetch.call({}, 'https://api.github.com/user'); out.push('receiver:no-throw'); }
  catch (error) { out.push('receiver:' + error.message); }
  try { await fetch('https://api.github.com/user', { redirect: 'error' }); out.push('redirect:no-throw'); }
  catch (error) { out.push('redirect:' + error.message); }
  return new Response(out.join('\\n'));
} }`;

let mf = null;
let unavailable = null;

const runtimeMissing = error => {
  const message = String(error?.message ?? error);
  return error?.code === 'ENOENT' || /workerd/i.test(message) && /(spawn|ENOENT|not found|no such file|exited with code)/i.test(message);
};

before(async () => {
  let Miniflare;
  try {
    ({ Miniflare } = await import('miniflare'));
  } catch (error) {
    unavailable = `workerd gate unavailable: miniflare is not installed (${error.message})`;
    return;
  }
  try {
    const { build } = await import('esbuild');
    // Same bundling contract as `npm run build`, kept in memory and passed as
    // an inline module: a scriptPath outside the package tree makes workerd
    // reject the module root ("can't use .. to break out of starting directory").
    const bundled = await build({ entryPoints: [new URL('../src/worker.mjs', import.meta.url).pathname], bundle: true, format: 'esm', platform: 'browser', target: 'es2022', write: false, logLevel: 'silent' });
    mf = new Miniflare({
      workers: [
        {
          name: 'atlas-hosted',
          modules: true,
          script: bundled.outputFiles[0].text,
          compatibilityDate: '2025-06-01',
          bindings: {
            PUBLIC_ORIGIN: ORIGIN,
            GITHUB_CLIENT_ID: 'test-client',
            GITHUB_CLIENT_SECRET: 'test-client-secret-not-real',
            OAUTH_ENCRYPTION_KEY: Buffer.from('a'.repeat(32)).toString('base64'),
          },
          d1Databases: { DB: 'atlas-hosted-workerd-gate' },
          outboundService: 'github-api-stub',
        },
        { name: 'github-api-stub', modules: true, script: stubScript, compatibilityDate: '2025-06-01' },
        { name: 'runtime-probe', modules: true, script: probeScript, compatibilityDate: '2025-06-01', outboundService: 'github-api-stub' },
      ],
    });
    // Apply every standalone migration in publication order, as helpers.mjs
    // does. D1's exec() cannot take multi-line statements, so run the files
    // as prepared statements; the migrations are DDL-only (no triggers or
    // semicolon-bearing literals), so splitting on ';' is exact for them.
    const db = await mf.getD1Database('DB');
    const migrations = readdirSync(new URL('../migrations/', import.meta.url)).filter(name => name.endsWith('.sql')).sort();
    for (const name of migrations) {
      const statements = readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8').split(';').map(sql => sql.trim()).filter(Boolean);
      await db.batch(statements.map(sql => db.prepare(sql)));
    }
    await mf.ready;
  } catch (error) {
    if (runtimeMissing(error)) {
      unavailable = `workerd gate unavailable: the workerd runtime could not start (${error.message})`;
      await mf?.dispose().catch(() => {});
      mf = null;
      return;
    }
    throw error;
  }
});

after(async () => { await mf?.dispose().catch(() => {}); });

test('workerd gate: the executing runtime enforces workerd fetch semantics', async t => {
  if (unavailable) return t.skip(unavailable);
  const probe = await mf.getWorker('runtime-probe');
  const lines = (await (await probe.fetch(`${ORIGIN}/`)).text()).split('\n');
  assert.match(lines[0], /^receiver:.*Illegal invocation/);
  assert.match(lines[1], /^redirect:.*Invalid redirect value/);
});

test('workerd gate: OAuth flow, MCP partner search and revocation run under workerd with the default fetcher', async t => {
  if (unavailable) return t.skip(unavailable);
  const worker = await mf.getWorker('atlas-hosted');
  // redirect: 'manual' — unlike the direct worker.fetch calls in the Node
  // suite, Miniflare's fetcher is a real HTTP client and would otherwise
  // follow the OAuth 303s out of the worker.
  const request = (path, init = {}) => worker.fetch(`${ORIGIN}${path}`, { redirect: 'manual', ...init, headers: { 'oai-authenticated-user-id': 'owner', ...init.headers } });

  const start = await request('/auth/github/start', { method: 'POST', headers: { Origin: ORIGIN } });
  assert.equal(start.status, 303);
  const authorization = new URL(start.headers.get('Location'));
  const cookie = start.headers.get('Set-Cookie').split(';')[0];

  const callback = await request(`/auth/github/callback?${new URLSearchParams({ state: authorization.searchParams.get('state'), code: 'synthetic-code' })}`, { headers: { Cookie: cookie } });
  assert.equal(callback.status, 303);

  const search = await (await request('/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'atlas_search_partners', arguments: {} } }) })).json();
  assert.equal(search.result.structuredContent.revision, REVISION);
  assert.deepEqual(search.result.structuredContent.partners, [{ name: 'Synthetic Partner', record: null }]);

  // Disconnect exercises revokeToken's DELETE through the default fetcher;
  // the page only omits the warning when revocation was confirmed upstream.
  const disconnect = await request('/auth/github/disconnect', { method: 'POST', headers: { Origin: ORIGIN } });
  assert.equal(disconnect.status, 200);
  const page = await disconnect.text();
  assert.match(page, /GitHub disconnected/);
  assert.doesNotMatch(page, /revocation could not be confirmed/);
});
