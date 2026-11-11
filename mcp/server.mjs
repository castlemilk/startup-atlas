#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { CatalogueStore } from './store.mjs';
import { EntryError, opportunitySchema, provenanceSchema } from '../scripts/catalogue-entries.mjs';

const readonly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const schema = properties => ({ type: 'object', properties, additionalProperties: false });
const candidate = { entry: opportunitySchema, provenance: provenanceSchema };
const tools = [
  { name: 'atlas_get_catalogue_info', description: 'Get the catalogue revision, entry categories, write mode, publication workflow and evidence requirements. Local data only; no source fetching.', inputSchema: schema({}), annotations: readonly },
  { name: 'atlas_search_opportunities', description: 'Search existing Startup Atlas opportunities before proposing an addition. Includes local additions awaiting publication.', inputSchema: schema({ query: { type: 'string', maxLength: 200 }, limit: { type: 'integer', minimum: 1, maximum: 100 } }), annotations: readonly },
  { name: 'atlas_get_opportunity', description: 'Read a full opportunity and, for MCP additions, its recorded provenance.', inputSchema: { ...schema({ id: { type: 'string', pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$' } }), required: ['id'] }, annotations: readonly },
  { name: 'atlas_validate_opportunity', description: 'Validate a proposed public opportunity, provenance, dates, HTTPS links, geography and duplicates without writing. Returns expectedRevision for adding. This validates structure, not the truth of source claims.', inputSchema: { ...schema(candidate), required: ['entry', 'provenance'] }, annotations: readonly },
  { name: 'atlas_add_opportunity', description: 'Persist one reviewed opportunity in this local repository. Requires --write and the revision returned by validation. Add-only and safe to retry with identical content. Never commits, pushes, publishes, fetches sources or changes existing entries. Do not include private application details.', inputSchema: { ...schema({ ...candidate, expectedRevision: { type: 'string', pattern: '^[a-f0-9]{64}$' } }), required: ['entry', 'provenance', 'expectedRevision'] }, annotations: { ...readonly, readOnlyHint: false } },
];

export function createServer(store) {
  const server = new Server({ name: 'startup-atlas', version: '1.0.0' }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));
  server.setRequestHandler(CallToolRequestSchema, async ({ params }) => {
    try {
      const tool = tools.find(item => item.name === params.name);
      if (!tool) throw new EntryError('UNKNOWN_TOOL', `Unknown tool ${params.name}`);
      const args = params.arguments ?? {};
      for (const key of Object.keys(args)) if (!(key in tool.inputSchema.properties)) throw new EntryError('VALIDATION_ERROR', `Unexpected argument: ${key}`);
      let result;
      switch (params.name) {
        case 'atlas_get_catalogue_info': result = await store.info(); break;
        case 'atlas_search_opportunities': result = await store.search(args.query ?? '', args.limit ?? 20); break;
        case 'atlas_get_opportunity': result = await store.get(args.id); break;
        case 'atlas_validate_opportunity': result = await store.validate(args.entry, args.provenance); break;
        case 'atlas_add_opportunity': result = await store.add(args.entry, args.provenance, args.expectedRevision); break;
      }
      return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result };
    } catch (error) {
      const code = error instanceof EntryError ? error.code : 'STORAGE_ERROR';
      // Filesystem errors can contain local paths; keep them off the tool output.
      const message = error instanceof EntryError ? error.message : 'Could not read or persist this catalogue. Inspect the local repository and server stderr; do not assume the write succeeded.';
      if (!(error instanceof EntryError)) console.error(error.message);
      return { isError: true, content: [{ type: 'text', text: JSON.stringify({ code, message }) }] };
    }
  });
  return server;
}

async function main() {
  let root = fileURLToPath(new URL('../', import.meta.url));
  let writeEnabled = false;
  const args = process.argv.slice(2);
  for (let index = 0; index < args.length; index++) {
    if (args[index] === '--write') writeEnabled = true;
    else if (args[index] === '--repo' && args[index + 1] && !args[index + 1].startsWith('--')) root = path.resolve(args[++index]);
    else throw new Error('Usage: node mcp/server.mjs [--repo /absolute/path/to/startup-atlas] [--write]');
  }
  const store = new CatalogueStore(root, { writeEnabled });
  await store.snapshot(); // Fail before advertising tools if the repository is unusable.
  await createServer(store).connect(new StdioServerTransport());
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
