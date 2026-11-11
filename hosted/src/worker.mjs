import { opportunitySchema, provenanceSchema, EntryError } from '../../scripts/catalogue-entries.mjs';
import { GitHubOAuth } from './oauth.mjs';
import { GitHubCatalogue } from './github.mjs';
import { ServiceError, settings, identity, browserPost, json, REPOSITORY } from './common.mjs';

const read = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };
const schema = (properties = {}, required = []) => ({ type: 'object', properties, required, additionalProperties: false });
const candidate = { entry: opportunitySchema, provenance: provenanceSchema };
const supportedVersions = ['2026-07-28', '2025-06-18', '2025-03-26'];
export const tools = [
  { name: 'atlas_get_connection', description: 'Check whether the signed-in caller has connected the repository-scoped GitHub App. Returns no credentials.', inputSchema: schema(), annotations: read },
  { name: 'atlas_search_opportunities', description: 'Search the current Startup Atlas repository catalogue before adding an entry.', inputSchema: schema({ query: { type: 'string', maxLength: 200 }, limit: { type: 'integer', minimum: 1, maximum: 100 } }), annotations: read },
  { name: 'atlas_get_opportunity', description: 'Read an opportunity and provenance from the current repository.', inputSchema: schema({ id: { type: 'string' } }, ['id']), annotations: read },
  { name: 'atlas_validate_opportunity', description: 'Validate a proposed source-backed entry and duplicates without writing. Returns the main commit revision. It does not fetch or verify programme terms.', inputSchema: schema(candidate, ['entry', 'provenance']), annotations: read },
  { name: 'atlas_add_opportunity', description: 'Create an idempotent data branch and draft pull request in castlemilk/startup-atlas using the caller’s OAuth connection. Requires the revision returned by validation. It never merges, deploys, edits existing entries or modifies code. Only use when the user requested adding this public, source-backed entry.', inputSchema: schema({ ...candidate, expectedRevision: { type: 'string', pattern: '^[a-f0-9]{40}$' } }, ['entry', 'provenance', 'expectedRevision']), annotations: { ...read, readOnlyHint: false } },
];
const page = (body, status = 200) => new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Startup Atlas MCP</title><style>body{font:17px/1.6 system-ui;background:#101717;color:#edf6f2;max-width:44rem;margin:8vh auto;padding:2rem}a{color:#b3e5cc}button{padding:.8rem 1.2rem;font:inherit;background:#c7eddb;color:#13231c;border:0;border-radius:.5rem;cursor:pointer}small{color:#b3c5bc}form{margin:2rem 0}</style><h1>Startup Atlas MCP</h1>${body}</html>`, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'", 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' } });

async function boundedBody(request) {
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks = []; let size = 0; let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new ServiceError('REQUEST_TIMEOUT', 'MCP request body timed out.', 408)), 15000); });
  try {
  while (true) {
    const { value, done } = await Promise.race([reader.read(), timeout]);
    if (done) break;
    size += value.byteLength;
    if (size > 131072) { await reader.cancel(); throw new ServiceError('REQUEST_TOO_LARGE', 'MCP request exceeds 128 KiB.', 413); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
  } finally { clearTimeout(timer); await reader.cancel().catch(() => {}); }
}

export function createWorker({ fetcher = fetch } = {}) {
  return { async fetch(request, env) {
    try {
      const user = identity(request); // Trusted only behind Sites dispatch; never expose this Worker directly.
      const config = settings(env);
      const url = new URL(request.url);
      if (url.origin !== config.origin) throw new ServiceError('INVALID_ORIGIN', 'This request does not target the configured private Site.', 403);
      const oauth = new GitHubOAuth(env, { fetcher });
      if (url.pathname === '/auth/github/start') { browserPost(request, config.origin); return await oauth.start(user); }
      if (url.pathname === '/auth/github/callback' && request.method === 'GET') return await oauth.callback(request, user);
      if (url.pathname === '/auth/github/disconnect') {
        browserPost(request, config.origin);
        const result = await oauth.disconnect(user);
        return page(`<p>GitHub disconnected from this Site. The app authorization and installation remain in GitHub Settings → Applications until you remove them.</p>${result.revoked ? '' : '<p>GitHub revocation could not be confirmed. Review this app in GitHub Settings → Applications.</p>'}<p><a href="/">Return</a></p>`);
      }
      if (url.pathname === '/' && request.method === 'GET') {
        const status = await oauth.status(user);
        return page(`<p>A private, OAuth-connected tool for adding evidence-backed opportunities to Startup Atlas.</p><p>Repository: <strong>${REPOSITORY}</strong></p>${status.connected ? '<p>GitHub is connected. MCP additions create draft pull requests for review.</p><form method="post" action="/auth/github/disconnect"><button>Disconnect GitHub</button></form>' : '<p>Connect the private GitHub App installed on Startup Atlas only. It needs Contents and Pull requests read/write plus renewable OAuth access. It does not request administration or workflow permissions.</p><form method="post" action="/auth/github/start"><button>Connect GitHub</button></form>'}<small>OAuth credentials stay encrypted on the server. Catalogue writes are limited by this application to the two data files; GitHub’s underlying permissions cover repository contents. Nothing is automatically merged or published.</small>`);
      }
      if (url.pathname === '/mcp' && request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, { Allow: 'POST' });
      if (url.pathname !== '/mcp') return json({ error: 'Not found' }, 404);
      if (request.headers.get('Origin') && request.headers.get('Origin') !== config.origin) throw new ServiceError('FORBIDDEN_ORIGIN', 'Cross-origin requests are not permitted.', 403);
      if (!request.headers.get('Content-Type')?.startsWith('application/json')) return json({ error: 'Expected application/json' }, 415);
      const body = await boundedBody(request);
      let input;
      try { input = JSON.parse(body); } catch { return json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Invalid JSON' } }, 400); }
      if (!input || Array.isArray(input) || input.jsonrpc !== '2.0' || typeof input.method !== 'string') return json({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid request' } }, 400);
      if (!Object.hasOwn(input, 'id')) return new Response(null, { status: 202 });
      const id = input.id ?? null;
      const reply = result => json({ jsonrpc: '2.0', id, result });
      if (input.method === 'server/discover') return reply({ supportedVersions, capabilities: { tools: {} } });
      if (input.method === 'initialize') return reply({ protocolVersion: supportedVersions.includes(input.params?.protocolVersion) ? input.params.protocolVersion : supportedVersions[0], capabilities: { tools: {} }, serverInfo: { name: 'startup-atlas', version: '2.0.0' } });
      if (input.method === 'ping') return reply({});
      if (input.method === 'tools/list') return reply({ tools });
      if (input.method !== 'tools/call') return json({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Unknown method' } });
      try {
        const name = input.params?.name;
        const tool = tools.find(item => item.name === name);
        if (!tool) throw new ServiceError('UNKNOWN_TOOL', 'Unknown tool.');
        const args = input.params?.arguments ?? {};
        if (!args || typeof args !== 'object' || Array.isArray(args) || Object.keys(args).some(key => !Object.hasOwn(tool.inputSchema.properties, key))) throw new ServiceError('VALIDATION_ERROR', 'Unexpected tool arguments.');
        let result;
        if (name === 'atlas_get_connection') result = { ...await oauth.status(user), connectUrl: config.origin };
        else {
          const catalogue = new GitHubCatalogue(await oauth.access(user), { fetcher });
          if (name === 'atlas_search_opportunities') result = await catalogue.search(args.query, args.limit);
          if (name === 'atlas_get_opportunity') result = await catalogue.get(args.id);
          if (name === 'atlas_validate_opportunity') result = await catalogue.validateCandidate(args.entry, args.provenance);
          if (name === 'atlas_add_opportunity') result = await catalogue.add(args.entry, args.provenance, args.expectedRevision);
        }
        return reply({ content: [{ type: 'text', text: JSON.stringify(result) }], ...(request.headers.get('MCP-Protocol-Version') === '2025-03-26' ? {} : { structuredContent: result }) });
      } catch (error) {
        const known = error instanceof ServiceError || error instanceof EntryError;
        const result = { code: known ? error.code : 'INTERNAL_ERROR', message: known ? error.message : 'The operation could not be confirmed. Inspect the connection and repository before retrying.', connectUrl: config.origin };
        return reply({ isError: true, content: [{ type: 'text', text: JSON.stringify(result) }] });
      }
    } catch (error) {
      const known = error instanceof ServiceError;
      return json({ code: known ? error.code : 'INTERNAL_ERROR', message: known ? error.message : 'The request could not be completed. No credentials were returned.' }, known ? error.status : 500);
    }
  } };
}
export default createWorker();
