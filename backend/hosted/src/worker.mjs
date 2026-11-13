import { opportunitySchema, provenanceSchema, EntryError } from '../../../scripts/catalogue-entries.mjs';
import { GitHubOAuth } from './oauth.mjs';
import { GitHubCatalogue } from './github.mjs';
import { startupRecordSchema } from './startup-record.mjs';
import { GitHubClientConfig, saveSetup, setupForm } from './setup.mjs';
import { ServiceError, siteSettings, identity, browserPost, json, REPOSITORY } from './common.mjs';

const read = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };
const schema = (properties = {}, required = []) => ({ type: 'object', properties, required, additionalProperties: false });
const candidate = { entry: opportunitySchema, provenance: provenanceSchema };
const partnerName = { type: 'string', minLength: 1, maxLength: 200 };
const partnerRecord = { type: 'object', additionalProperties: false, required: ['website','description','source','reviewed_at'], properties: { website: { type:'string', format:'uri' }, description: { type:'string', minLength:8, maxLength:500 }, source: { type:'string', format:'uri' }, reviewed_at: { type:'string', pattern:'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' } } };
const supportedVersions = ['2026-07-28', '2025-06-18', '2025-03-26'];
export const tools = [
  { name:'atlas_search_graph', description:'Search the published graph across startups, partners and providers. Reports the published and current repository revisions.', inputSchema:schema({query:{type:'string',maxLength:200},limit:{type:'integer',minimum:1,maximum:100}}), annotations:read },
  { name:'atlas_get_startup', description:'Read a startup, its sourced connections, funding events and news from the published graph.', inputSchema:schema({id:{type:'string',pattern:'^startup:[a-z0-9]+(?:-[a-z0-9]+)*$'}},['id']), annotations:read },
  { name:'atlas_validate_startup', description:'Validate a source-backed startup addition or update and return its previous record and repository revision. It does not verify sources.', inputSchema:schema({record:startupRecordSchema},['record']), annotations:read },
  { name:'atlas_propose_startup', description:'Create a draft pull request adding or updating reviewed startup metadata, founders, funding, logos, articles and sourced relationships. Requires a fresh validation revision; never merges or publishes. Inspect any uncertain write before retrying.', inputSchema:schema({record:startupRecordSchema,expectedRevision:{type:'string',pattern:'^[a-f0-9]{40}$'}},['record','expectedRevision']), annotations:{...read,readOnlyHint:false,idempotentHint:false} },
  { name: 'atlas_get_connection', description: 'Check whether the signed-in caller has connected the repository-scoped GitHub App. Returns no credentials.', inputSchema: schema(), annotations: read },
  { name: 'atlas_search_partners', description: 'Search indexed partner leads and reviewed metadata. A name or logo does not establish a provider relationship.', inputSchema: schema({ query: { type: 'string', maxLength: 200 }, limit: { type: 'integer', minimum: 1, maximum: 100 } }), annotations: read },
  { name: 'atlas_get_partner', description: 'Read one exact partner lead and its reviewed metadata.', inputSchema: schema({ name: { type: 'string', minLength: 1, maxLength: 200 } }, ['name']), annotations: read },
  { name: 'atlas_validate_partner', description: 'Validate a reviewed partner update and return the current revision and previous record. Does not verify the evidence.', inputSchema: schema({name:partnerName,record:partnerRecord},['name','record']), annotations: read },
  { name: 'atlas_propose_partner', description: 'Create a draft pull request updating one existing partner after independent source and identity review. Requires a fresh validation revision; never merges or publishes. Do not automatically retry an uncertain write.', inputSchema: schema({name:partnerName,record:partnerRecord,expectedRevision:{type:'string',pattern:'^[a-f0-9]{40}$'}},['name','record','expectedRevision']), annotations: {...read,readOnlyHint:false,idempotentHint:false} },
  { name: 'atlas_search_opportunities', description: 'Search the current Startup Atlas repository catalogue before adding an entry.', inputSchema: schema({ query: { type: 'string', maxLength: 200 }, limit: { type: 'integer', minimum: 1, maximum: 100 } }), annotations: read },
  { name: 'atlas_get_opportunity', description: 'Read an opportunity and provenance from the current repository.', inputSchema: schema({ id: { type: 'string' } }, ['id']), annotations: read },
  { name: 'atlas_validate_opportunity', description: 'Validate a proposed source-backed entry and duplicates without writing. Returns the main commit revision. It does not fetch or verify programme terms.', inputSchema: schema(candidate, ['entry', 'provenance']), annotations: read },
  { name: 'atlas_add_opportunity', description: 'Create an idempotent data branch and draft pull request in castlemilk/startup-atlas using the caller’s OAuth connection. Requires the revision returned by validation. It never merges, deploys, edits existing entries or modifies code. Only use when the user requested adding this public, source-backed entry.', inputSchema: schema({ ...candidate, expectedRevision: { type: 'string', pattern: '^[a-f0-9]{40}$' } }, ['entry', 'provenance', 'expectedRevision']), annotations: { ...read, readOnlyHint: false } },
];
// Native navigation POSTs use Origin: null under no-referrer (Fetch §3.2).
// Preserve their same-origin Origin for CSRF checks without leaking external referrers.
// Chromium checks form-action on POST redirects. Permit the fixed provider only
// on the credential-free Connect page; setup and disconnect stay self-only.
// CSP skips the path check after redirects, allowing GitHub's login path too.
const page = (body, status = 200, { allowGitHubRedirect = false } = {}) => new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Startup Atlas MCP</title><style>
*{box-sizing:border-box}body{font:17px/1.6 system-ui;background:#101717;color:#edf6f2;max-width:48rem;margin:5vh auto;padding:2rem}h1{font-size:1.6rem;letter-spacing:-.03em;margin:0 0 1.6rem}h2{font-size:1.25rem;line-height:1.3;margin:0 0 .8rem}p{margin:.7rem 0 1rem}a{color:#b3e5cc;text-underline-offset:.2em;overflow-wrap:anywhere}button,.button{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:.7rem 1.1rem;font:inherit;font-weight:600;background:#c7eddb;color:#13231c;border:1px solid transparent;border-radius:.5rem;cursor:pointer;text-decoration:none;text-align:center}button:hover,.button:hover{background:#dcf5e9}.secondary{background:transparent;color:#c7eddb;border-color:#607b6d}.secondary:hover{background:#24392e}small,.muted{color:#b3c5bc}small{display:block;font-size:.875rem}form{margin:2rem 0}label,input{display:block}input{width:100%;margin:.5rem 0 1rem;padding:.7rem;font:inherit;border:1px solid #829b8f;border-radius:.4rem;background:#182521;color:inherit}button:focus-visible,input:focus-visible,a:focus-visible{outline:3px solid #b3e5cc;outline-offset:4px}.connection-card{border:1px solid #58846b;border-radius:1rem;padding:1.5rem;background:#182b22}.status-heading{display:flex;align-items:center;gap:1rem}.status-icon{display:flex;align-items:center;justify-content:center;flex:0 0 2.75rem;height:2.75rem;border-radius:50%;background:#c7eddb;color:#13231c;font-size:1.5rem;font-weight:700}.eyebrow{color:#b3e5cc;font-size:.75rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;margin:0 0 .3rem}.status-heading h2{font-size:1.75rem;letter-spacing:-.025em;margin:0}.connection-card>p:last-child{margin-bottom:0}.account{margin-top:1.25rem}.repository{margin:1.25rem 0 0;padding-top:1rem;border-top:1px solid #385442}.repository dt{font-size:.8rem;color:#b3c5bc}.repository dd{margin:.2rem 0 0;font-weight:600}.actions{display:flex;flex-wrap:wrap;gap:.7rem;margin:1.2rem 0 0}.next-steps{margin:2rem 0}.prompts{list-style:none;padding:0;display:grid;gap:.75rem}.prompts li{padding:1rem 1.2rem;background:#182521;border:1px solid #344e41;border-radius:.65rem}.prompts h3{font-size:.8rem;color:#b3c5bc;margin:0 0 .3rem}.prompts p{margin:0;overflow-wrap:anywhere}.review-note{font-size:.95rem;color:#c4d8cc}.connection-controls{border-top:1px solid #344e41;padding-top:1.3rem;margin-top:1.5rem}.connection-controls form{margin:0 0 1rem}@media(max-width:520px){body{margin:0 auto;padding:1.5rem 1rem}h1{font-size:1.4rem}.connection-card{padding:1.2rem}.status-heading{gap:.75rem}.status-heading h2{font-size:1.5rem}.actions{flex-direction:column}.actions .button{width:100%}}
</style></head><body><main><h1>Startup Atlas MCP</h1>${body}</main></body></html>`, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': `default-src 'none'; style-src 'unsafe-inline'; form-action 'self'${allowGitHubRedirect ? ' https://github.com/login/oauth/authorize' : ''}; base-uri 'none'; frame-ancestors 'none'`, 'Referrer-Policy': 'same-origin', 'X-Content-Type-Options': 'nosniff' } });

const connectedPanel = status => `
<section class="connection-card" aria-labelledby="connection-title">
  <div class="status-heading" role="status">
    <span class="status-icon" aria-hidden="true">✓</span>
    <div><p class="eyebrow">Connection complete</p><h2 id="connection-title">GitHub connected</h2></div>
  </div>
  ${status.githubLogin === REPOSITORY.split('/')[0] ? `<p class="account">Connected as <a href="https://github.com/${REPOSITORY.split('/')[0]}"><strong>@${REPOSITORY.split('/')[0]}</strong></a>. Your GitHub account was verified during authorization.</p>` : '<p class="account">Your GitHub connection is saved for this private Site.</p>'}
  <dl class="repository"><dt>Connected repository</dt><dd><a href="https://github.com/${REPOSITORY}">${REPOSITORY}</a></dd></dl>
  <div class="actions"><a class="button" href="https://castlemilk.github.io/startup-atlas/">Open Startup Atlas</a><a class="button secondary" href="https://github.com/${REPOSITORY}/pulls">Review pull requests</a></div>
</section>
<section class="next-steps" aria-labelledby="next-title">
  <h2 id="next-title">Try it in your chat</h2>
  <p>Return to your chat. If needed, select the Startup Atlas plugin there before trying a prompt. You can close this page.</p>
  <ul class="prompts">
    <li><h3>Find an opportunity</h3><p>Search Startup Atlas for Australian founder programmes.</p></li>
    <li><h3>Add an official source</h3><p>Add this opportunity to Startup Atlas using its official source: [paste URL].</p></li>
  </ul>
  <p class="review-note">New opportunities are checked for duplicates and proposed in a <strong>draft pull request for review</strong>. The existing review and publishing workflow still applies. This connection does not merge or publish changes.</p>
</section>
<section class="connection-controls" aria-label="Manage GitHub connection">
  <form method="post" action="/auth/github/disconnect"><button class="secondary">Disconnect GitHub</button></form>
  <small>OAuth credentials stay encrypted on the server. Writes are limited by this application to reviewed catalogue and startup data files; GitHub’s underlying permissions cover repository contents. Nothing is automatically merged or published.</small>
</section>`;

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

export function createWorker({ fetcher = globalThis.fetch.bind(globalThis) } = {}) {
  return { async fetch(request, env) {
    try {
      const user = identity(request); // Trusted only behind Sites dispatch; never expose this Worker directly.
      const config = siteSettings(env);
      const url = new URL(request.url);
      if (url.origin !== config.origin) throw new ServiceError('INVALID_ORIGIN', 'This request does not target the configured private Site.', 403);
      const credentials = new GitHubClientConfig(env);
      const oauth = new GitHubOAuth(env, { fetcher }); // Status is read-only and does not need a client secret.
      const connectedOAuth = async () => new GitHubOAuth(await credentials.forUser(user), { fetcher });
      if (url.pathname === '/setup') {
        if (url.search) throw new ServiceError('INVALID_SETUP', 'Use the setup page without query parameters. Never put credentials in a URL.', 400);
        if (request.method === 'GET') return page(await credentials.load(user) ? '<p>A GitHub client secret is already configured. This setup form cannot replace it.</p><p><a href="/">Return to connection</a></p>' : setupForm);
        await saveSetup(request, env, user);
        return new Response(null, { status: 303, headers: { Location: `${config.origin}/?setup=saved`, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' } });
      }
      if (url.pathname === '/auth/github/start') { browserPost(request, config.origin); return await (await connectedOAuth()).start(user); }
      if (url.pathname === '/auth/github/callback' && request.method === 'GET') return await (await connectedOAuth()).callback(request, user);
      if (url.pathname === '/auth/github/disconnect') {
        browserPost(request, config.origin);
        const result = await (await connectedOAuth()).disconnect(user);
        return page(`<p>GitHub disconnected from this Site. The app authorization and installation remain in GitHub Settings → Applications until you remove them.</p>${result.revoked ? '' : '<p>GitHub revocation could not be confirmed. Review this app in GitHub Settings → Applications.</p>'}<p><a href="/">Return</a></p>`);
      }
      if (url.pathname === '/' && request.method === 'GET') {
        if (!await credentials.load(user)) return page('<p>Your private MCP is available for discovery. Repository tools remain disabled until setup and GitHub authorization are complete.</p><p><a href="/setup">Finish private GitHub setup</a></p><p>Paste the existing client secret only in the private setup form yourself, never in chat.</p>');
        const status = await oauth.status(user);
        const saved = url.searchParams.get('setup') === 'saved' ? '<p>Your existing GitHub App client secret was saved encrypted for your Site account. Saving it did not authorize a new GitHub connection.</p>' : '';
        return page(`${saved}${status.connected ? connectedPanel(status) : '<p>A private, OAuth-connected tool for adding evidence-backed opportunities to Startup Atlas.</p><p>Repository: <strong>' + REPOSITORY + '</strong></p><p>Connect the private GitHub App installed on Startup Atlas only. It needs Contents and Pull requests read/write plus renewable OAuth access. It does not request administration or workflow permissions.</p><form method="post" action="/auth/github/start"><button>Connect GitHub</button></form><small>OAuth credentials stay encrypted on the server. Writes are limited by this application to reviewed catalogue and startup data files; GitHub’s underlying permissions cover repository contents. Nothing is automatically merged or published.</small>'}`, 200, { allowGitHubRedirect: !status.connected });
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
        if (name === 'atlas_get_connection') {
          const configured = Boolean(await credentials.load(user));
          result = { ...(configured ? await oauth.status(user) : { connected: false, repository: REPOSITORY }), setupRequired: !configured, connectUrl: config.origin, ...(!configured ? { setupUrl: `${config.origin}/setup` } : {}) };
        }
        else {
          const catalogue = new GitHubCatalogue(await (await connectedOAuth()).access(user), { fetcher });
          if (name === 'atlas_search_graph') result = await catalogue.searchGraph(args.query,args.limit);
          if (name === 'atlas_get_startup') result = await catalogue.getStartup(args.id);
          if (name === 'atlas_validate_startup') result = await catalogue.validateStartup(args.record);
          if (name === 'atlas_propose_startup') result = await catalogue.proposeStartup(args.record,args.expectedRevision);
          if (name === 'atlas_search_partners') result = await catalogue.searchPartners(args.query,args.limit);
          if (name === 'atlas_get_partner') result = await catalogue.getPartner(args.name);
          if (name === 'atlas_validate_partner') result = await catalogue.validatePartner(args.name,args.record);
          if (name === 'atlas_propose_partner') result = await catalogue.proposePartner(args.name,args.record,args.expectedRevision);
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
