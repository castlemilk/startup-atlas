#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { CatalogueStore } from './store.mjs';
import { PartnerStore } from './partners.mjs';
import { StartupStore } from './startups.mjs';
import { CrawlRegistry, CRAWL_MODES, CRAWL_STATUSES } from './crawls.mjs';
import { startupEditSchema, startupIdSchema } from '../hosted/src/startup-edit.mjs';
import { EntryError, opportunitySchema, provenanceSchema } from '../../scripts/catalogue-entries.mjs';

const readonly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const schema = properties => ({ type: 'object', properties, additionalProperties: false });
const candidate = { entry: opportunitySchema, provenance: provenanceSchema };
const partnerName={type:'string',minLength:1,maxLength:200};
const partnerRecord={type:'object',additionalProperties:false,required:['website','description','source','reviewed_at'],properties:{website:{type:'string',format:'uri'},description:{type:'string',minLength:8,maxLength:500},source:{type:'string',format:'uri'},reviewed_at:{type:'string',pattern:'^[0-9]{4}-[0-9]{2}-[0-9]{2}$'}}};
const tools = [
  { name:'atlas_search_startup_records', description:'Search authoritative startup records in this local checkout. Returns local snapshot and record digests; does not fetch sources or read the published graph.', inputSchema:schema({query:{type:'string',maxLength:200},limit:{type:'integer',minimum:1,maximum:100}}), annotations:readonly },
  { name:'atlas_get_startup_record', description:'Read the complete editable source record by canonical startup ID from this local checkout. Its digest is an edit precondition, not a published revision.', inputSchema:{...schema({id:startupIdSchema}),required:['id']}, annotations:readonly },
  { name:'atlas_validate_startup_edit', description:'Preview a canonical-ID startup edit against its record digest and this local snapshot. Validates structure, merged limits and source inheritance, not source truth. Nothing is persisted.', inputSchema:{...schema({edit:startupEditSchema}),required:['edit']}, annotations:readonly },
  { name:'atlas_apply_startup_edit', description:'Apply a validated startup edit to this local checkout only. Requires --write, the exact local revision and validation token; uses the shared write lock and returns authoritative readback. Never commits, pushes, merges or publishes. Inspect an uncertain result before another write.', inputSchema:{...schema({edit:startupEditSchema,expectedRevision:{type:'string',pattern:'^[a-f0-9]{64}$'},validationToken:{type:'string',pattern:'^[a-f0-9]{64}$'}}),required:['edit','expectedRevision','validationToken']}, annotations:{...readonly,readOnlyHint:false,idempotentHint:false} },
  { name:'atlas_search_partners', description:'Search existing partner leads and reviewed metadata; a name is not proof of a provider relationship.', inputSchema:schema({query:{type:'string',maxLength:200},limit:{type:'integer',minimum:1,maximum:100}}), annotations:readonly },
  { name:'atlas_get_partner', description:'Get one exact existing partner name and its reviewed metadata.', inputSchema:{...schema({name:partnerName}),required:['name']}, annotations:readonly },
  { name:'atlas_validate_partner', description:'Validate reviewed partner metadata and return its current revision; this does not independently verify claims.', inputSchema:{...schema({name:partnerName,record:partnerRecord}),required:['name','record']}, annotations:readonly },
  { name:'atlas_upsert_partner', description:'Add or update reviewed metadata for an existing partner lead. Requires --write and a fresh validated revision; no automatic publication.', inputSchema:{...schema({name:partnerName,record:partnerRecord,expectedRevision:{type:'string',pattern:'^[a-f0-9]{64}$'}}),required:['name','record','expectedRevision']}, annotations:{...readonly,readOnlyHint:false,idempotentHint:false} },
  { name: 'atlas_get_catalogue_info', description: 'Get the catalogue revision, entry categories, write mode, publication workflow and evidence requirements. Local data only; no source fetching.', inputSchema: schema({}), annotations: readonly },
  { name: 'atlas_search_opportunities', description: 'Search existing Startup Atlas opportunities before proposing an addition. Includes local additions awaiting publication.', inputSchema: schema({ query: { type: 'string', maxLength: 200 }, limit: { type: 'integer', minimum: 1, maximum: 100 } }), annotations: readonly },
  { name: 'atlas_get_opportunity', description: 'Read a full opportunity and, for MCP additions, its recorded provenance.', inputSchema: { ...schema({ id: { type: 'string', pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$' } }), required: ['id'] }, annotations: readonly },
  { name: 'atlas_validate_opportunity', description: 'Validate a proposed public opportunity, provenance, dates, HTTPS links, geography and duplicates without writing. Returns expectedRevision for adding. This validates structure, not the truth of source claims.', inputSchema: { ...schema(candidate), required: ['entry', 'provenance'] }, annotations: readonly },
  { name: 'atlas_add_opportunity', description: 'Persist one reviewed opportunity in this local repository. Requires --write and the revision returned by validation. Add-only and safe to retry with identical content. Never commits, pushes, publishes, fetches sources or changes existing entries. Do not include private application details.', inputSchema: { ...schema({ ...candidate, expectedRevision: { type: 'string', pattern: '^[a-f0-9]{64}$' } }), required: ['entry', 'provenance', 'expectedRevision'] }, annotations: { ...readonly, readOnlyHint: false } },
  { name: 'atlas_list_crawl_runs', description: 'List recorded crawl runs from data/crawl-runs.json, optionally filtered by mode, source, status or start date. Read-only; the registry is advisory and never triggers a crawl.', inputSchema: schema({ mode: { type: 'string', enum: CRAWL_MODES }, source_id: { type: 'string', maxLength: 200 }, status: { type: 'string', enum: CRAWL_STATUSES }, since: { type: 'string', maxLength: 100 }, limit: { type: 'integer', minimum: 1, maximum: 100 } }), annotations: readonly },
  { name: 'atlas_get_crawl_run', description: 'Read the full record for one crawl run ID, including its outcome, coverage reference and linked publication PR.', inputSchema: { ...schema({ run_id: { type: 'string', pattern: '^crawl-[0-9]{8}-[a-z0-9-]+-[0-9]{2}$' } }), required: ['run_id'] }, annotations: readonly },
  { name: 'atlas_get_crawl_claims', description: 'List current crawl claims per source, derived from claimed and running runs. A claim whose lease has expired is reported as stale, never as live.', inputSchema: schema({ mode: { type: 'string', enum: CRAWL_MODES }, source_id: { type: 'string', maxLength: 200 } }), annotations: readonly },
];

export function createServer(store) {
  const partners = new PartnerStore(store.root, {writeEnabled:store.writeEnabled});
  const startups = new StartupStore(store.root, {writeEnabled:store.writeEnabled});
  const crawls = new CrawlRegistry(store.root);
  const server = new Server({ name: 'startup-atlas', version: '1.0.0' }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));
  server.setRequestHandler(CallToolRequestSchema, async ({ params }) => {
    try {
      const tool = tools.find(item => item.name === params.name);
      if (!tool) throw new EntryError('UNKNOWN_TOOL', `Unknown tool ${params.name}`);
      const args = params.arguments ?? {};
      if (!args || typeof args !== 'object' || Array.isArray(args)) throw new EntryError('VALIDATION_ERROR', 'Tool arguments must be an object.');
      for (const key of Object.keys(args)) if (!Object.hasOwn(tool.inputSchema.properties, key)) throw new EntryError('VALIDATION_ERROR', `Unexpected argument: ${key}`);
      let result;
      switch (params.name) {
        case 'atlas_search_startup_records': result = await startups.search(args.query ?? '',args.limit ?? 20); break;
        case 'atlas_get_startup_record': result = await startups.get(args.id); break;
        case 'atlas_validate_startup_edit': result = await startups.validate(args.edit); break;
        case 'atlas_apply_startup_edit': result = await startups.apply(args.edit,args.expectedRevision,args.validationToken); break;
        case 'atlas_search_partners': result = await partners.search(args.query ?? '',args.limit ?? 20); break;
        case 'atlas_get_partner': result = await partners.get(args.name); break;
        case 'atlas_validate_partner': result = await partners.validate(args.name,args.record); break;
        case 'atlas_upsert_partner': result = await partners.upsert(args.name,args.record,args.expectedRevision); break;
        case 'atlas_get_catalogue_info': result = await store.info(); break;
        case 'atlas_search_opportunities': result = await store.search(args.query ?? '', args.limit ?? 20); break;
        case 'atlas_get_opportunity': result = await store.get(args.id); break;
        case 'atlas_validate_opportunity': result = await store.validate(args.entry, args.provenance); break;
        case 'atlas_add_opportunity': result = await store.add(args.entry, args.provenance, args.expectedRevision); break;
        case 'atlas_list_crawl_runs': result = await crawls.list(args); break;
        case 'atlas_get_crawl_run': result = await crawls.get(args.run_id); break;
        case 'atlas_get_crawl_claims': result = await crawls.claims(args); break;
      }
      return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result };
    } catch (error) {
      const code = error instanceof EntryError ? error.code : 'STORAGE_ERROR';
      // Filesystem errors can contain local paths; keep them off the tool output.
      const message = error instanceof EntryError ? error.message : 'Could not read or persist this catalogue. Inspect the local repository and server stderr; do not assume the write succeeded.';
      if (!(error instanceof EntryError)) console.error(error.message);
      const result = { code, message, ...(error instanceof EntryError && error.details ? { details: error.details } : {}) };
      return { isError: true, content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result };
    }
  });
  return server;
}

async function main() {
  let root = fileURLToPath(new URL('../../', import.meta.url));
  let writeEnabled = false;
  const args = process.argv.slice(2);
  for (let index = 0; index < args.length; index++) {
    if (args[index] === '--write') writeEnabled = true;
    else if (args[index] === '--repo' && args[index + 1] && !args[index + 1].startsWith('--')) root = path.resolve(args[++index]);
    else throw new Error('Usage: node backend/mcp/server.mjs [--repo /absolute/path/to/startup-atlas] [--write]');
  }
  const store = new CatalogueStore(root, { writeEnabled });
  await store.snapshot(); // Fail before advertising tools if the repository is unusable.
  await createServer(store).connect(new StdioServerTransport());
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
