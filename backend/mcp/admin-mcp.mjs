/**
 * Startup Atlas admin MCP — a SEPARATE MCP surface served at
 * /mcp/admin on the hosted app (see docs/MCP-HTTP.md, "Admin MCP").
 *
 * Where /mcp serves the catalogue tools to allow-listed readers and
 * writers, /mcp/admin serves ONLY the admin account
 * (ben.ebsworth@gmail.com via ATLAS_ADMIN_EMAILS /
 * ATLAS_GOOGLE_WRITE_EMAILS — the HTTP layer enforces that before any
 * tool runs) and exposes the review queue: list, inspect, decide,
 * undo, gating config and the auto-applied audit trail. The HTTP layer
 * also accepts one non-Google credential on this surface only: the
 * ATLAS_ADMIN_SERVICE_TOKEN service token for the unattended agent
 * review pass (see http-server.mjs). It authenticates as a synthetic
 * service identity, never as the admin's Google account, and decisions
 * made with it are attributed exactly like OAuth-path agent decisions
 * (decided_by 'agent-review', below).
 *
 * Purpose: the assistant reviews the human-band queue items itself
 * wherever the evidence is clear-cut, so the owner only sees the calls
 * that are genuinely his. Every agent decision is recorded through the
 * SAME ReviewQueue write-back the admin panel uses (admin.mjs) — same
 * data/review-queue.json records, same commit convention, same
 * downstream consumers — attributed as decided_by 'agent-review' and
 * always carrying a note citing the evidence relied on. Decisions are
 * reversible with atlas_admin_undo_review_decision. This surface opens
 * no new path into published Atlas data: a decision here is
 * indistinguishable in effect from the same decision in the panel.
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { AdminError, QueueFileStore, ReviewQueue, gatingVerdict } from './admin.mjs';
import { EntryError } from '../../scripts/catalogue-entries.mjs';

export const AGENT_DECIDED_BY = 'agent-review';
const VIA = 'admin MCP';

const readonly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const write = { ...readonly, readOnlyHint: false, idempotentHint: false };
const schema = properties => ({ type: 'object', properties, additionalProperties: false });

const QUEUE_KINDS = ['merge', 'fact', 'startup-lead', 'headshot', 'edge'];

export const ADMIN_TOOLS = [
  {
    name: 'atlas_admin_list_review_queue',
    description: 'List review-queue entries (data/review-queue.json) with optional filters: kind, status and confidence band. Band "above_gate" means the entry meets its kind\'s auto-proceed threshold in data/review-gating.json (the verdict is included per entry); "below_gate" is the human band. Entries are returned lowest-confidence first, the order a reviewer should work them.',
    inputSchema: schema({
      kind: { type: 'string', enum: QUEUE_KINDS },
      status: { type: 'string', enum: ['pending', 'approved', 'rejected', 'deferred'] },
      band: { type: 'string', enum: ['above_gate', 'below_gate'] },
      limit: { type: 'integer', minimum: 1, maximum: 200 },
    }),
    annotations: readonly,
  },
  {
    name: 'atlas_admin_get_review_item',
    description: 'Read one review-queue entry in full — candidates, evidence, draft payload and any existing decision — plus its gating verdict (whether it would auto-proceed, the threshold, and why).',
    inputSchema: { ...schema({ id: { type: 'string', minLength: 1, maxLength: 300 } }), required: ['id'] },
    annotations: readonly,
  },
  {
    name: 'atlas_admin_decide_review_item',
    description: 'Record an approve/reject/defer decision on a pending or deferred review-queue entry, through the same GitHub Contents write-back the admin panel uses. Attributed decided_by "agent-review". Deferring is not final: it records what further evidence is needed and the entry can be decided for real later. A note is REQUIRED and must cite the evidence relied on (for a defer, the evidence still missing) — a decision without an evidence note is refused. Never retries a write; a conflict means the queue changed since it was read, so re-read and decide again.',
    inputSchema: {
      ...schema({
        id: { type: 'string', minLength: 1, maxLength: 300 },
        decision: { type: 'string', enum: ['approved', 'rejected', 'deferred'] },
        note: { type: 'string', minLength: 1, maxLength: 500 },
      }),
      required: ['id', 'decision', 'note'],
    },
    annotations: write,
  },
  {
    name: 'atlas_admin_preview_review_batch',
    description: 'Dry-run a batch of review decisions: returns the per-entry diff (from_status → to_status, attribution, note) the batch would write, plus the queue revision it was planned against. Writes nothing. Decisions are validated exactly as the apply path validates them, so an invalid batch fails here first. Each decision needs its own evidence note. Pass the returned revision as expected_revision to atlas_admin_decide_review_batch.',
    inputSchema: {
      ...schema({
        decisions: {
          type: 'array', minItems: 1, maxItems: 50,
          items: {
            type: 'object', additionalProperties: false,
            properties: {
              id: { type: 'string', minLength: 1, maxLength: 300 },
              decision: { type: 'string', enum: ['approved', 'rejected', 'deferred'] },
              note: { type: 'string', minLength: 1, maxLength: 500 },
            },
            required: ['id', 'decision', 'note'],
          },
        },
      }),
      required: ['decisions'],
    },
    annotations: readonly,
  },
  {
    name: 'atlas_admin_decide_review_batch',
    description: 'Apply a batch of review decisions in ONE GitHub write-back commit through the same ReviewQueue the panel uses, attributed decided_by "agent-review". Optimistic revision: expected_revision must be the revision returned by atlas_admin_preview_review_batch; if the queue changed since the preview, the whole batch is refused (QUEUE_CONFLICT) and nothing is written, so a retried or stale batch cannot duplicate decisions or overwrite newer ones. Validation is all-or-nothing and every decision needs an evidence note.',
    inputSchema: {
      ...schema({
        decisions: {
          type: 'array', minItems: 1, maxItems: 50,
          items: {
            type: 'object', additionalProperties: false,
            properties: {
              id: { type: 'string', minLength: 1, maxLength: 300 },
              decision: { type: 'string', enum: ['approved', 'rejected', 'deferred'] },
              note: { type: 'string', minLength: 1, maxLength: 500 },
            },
            required: ['id', 'decision', 'note'],
          },
        },
        expected_revision: { type: 'string', minLength: 1, maxLength: 200 },
      }),
      required: ['decisions', 'expected_revision'],
    },
    annotations: write,
  },
  {
    name: 'atlas_admin_undo_review_decision',
    description: 'Revert a decided review-queue entry (human, auto-gate or agent) back to pending. The undo is committed with its own message naming what was undone, so the audit trail keeps both entries.',
    inputSchema: { ...schema({ id: { type: 'string', minLength: 1, maxLength: 300 } }), required: ['id'] },
    annotations: write,
  },
  {
    name: 'atlas_admin_get_review_gating',
    description: 'Read data/review-gating.json: the confidence-gating config (enabled flag — false is the kill switch — and the per-kind auto-approve thresholds and requirements).',
    inputSchema: schema({}),
    annotations: readonly,
  },
  {
    name: 'atlas_admin_list_auto_applied',
    description: 'List the auto-applied audit trail: entries decided by the confidence auto-gate (decided_by from the gating config), newest first. These are the decisions that proceeded without a human; each is reversible with atlas_admin_undo_review_decision.',
    inputSchema: schema({
      kind: { type: 'string', enum: QUEUE_KINDS },
      limit: { type: 'integer', minimum: 1, maximum: 200 },
    }),
    annotations: readonly,
  },
];

/** Batch decisions carry the same evidence-note rule as single decisions. */
function validateBatchDecisions(decisions) {
  if (!Array.isArray(decisions) || !decisions.length) {
    throw new EntryError('VALIDATION_ERROR', 'decisions must be a non-empty array of { id, decision, note }.');
  }
  return decisions.map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new EntryError('VALIDATION_ERROR', 'Each batch decision must be an object.');
    for (const key of Object.keys(item)) if (!['id', 'decision', 'note'].includes(key)) throw new EntryError('VALIDATION_ERROR', `Unexpected batch decision field: ${key}`);
    if (typeof item.note !== 'string' || !item.note.trim()) {
      throw new EntryError('EVIDENCE_NOTE_REQUIRED', 'Every batch decision must carry a note citing the evidence relied on. Re-read the items, check their evidence, and decide again with notes.');
    }
    return { id: item.id, decision: item.decision, note: item.note.trim() };
  });
}

export function createAdminServer({ config, store, reviewQueue } = {}) {
  const queue = reviewQueue ?? new ReviewQueue(store ?? new QueueFileStore({
    token: config.githubToken, repo: config.githubRepo, branch: config.githubBranch,
    apiBase: config.githubApiBase, fetchImpl: config.fetchImpl, root: config.root,
  }));
  const server = new Server({ name: 'startup-atlas-admin', version: '1.0.0' }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: ADMIN_TOOLS }));
  server.setRequestHandler(CallToolRequestSchema, async ({ params }) => {
    try {
      const tool = ADMIN_TOOLS.find(item => item.name === params.name);
      if (!tool) throw new EntryError('UNKNOWN_TOOL', `Unknown tool ${params.name}`);
      const args = params.arguments ?? {};
      if (!args || typeof args !== 'object' || Array.isArray(args)) throw new EntryError('VALIDATION_ERROR', 'Tool arguments must be an object.');
      for (const key of Object.keys(args)) if (!Object.hasOwn(tool.inputSchema.properties, key)) throw new EntryError('VALIDATION_ERROR', `Unexpected argument: ${key}`);
      let result;
      switch (params.name) {
        case 'atlas_admin_list_review_queue': {
          const { queue: data, source } = await queue.loadQueue();
          const gating = await queue.loadGating();
          let entries = [...(data.entries ?? [])];
          if (args.kind) entries = entries.filter(entry => entry.kind === args.kind);
          if (args.status) entries = entries.filter(entry => entry.status === args.status);
          entries = entries.map(entry => ({ ...entry, gating: gatingVerdict(entry, gating) }));
          if (args.band === 'above_gate') entries = entries.filter(entry => entry.gating.auto);
          if (args.band === 'below_gate') entries = entries.filter(entry => !entry.gating.auto);
          entries.sort((a, b) => (Number(a.confidence) - Number(b.confidence)) || String(a.id).localeCompare(String(b.id)));
          const total = entries.length;
          result = { source, total, entries: entries.slice(0, args.limit ?? 50) };
          break;
        }
        case 'atlas_admin_get_review_item': {
          const { queue: data, source } = await queue.loadQueue();
          const entry = (data.entries ?? []).find(item => item.id === args.id);
          if (!entry) throw new EntryError('NOT_FOUND', `No queue entry with id ${args.id}.`);
          const gating = await queue.loadGating();
          result = { source, entry, gating: gatingVerdict(entry, gating) };
          break;
        }
        case 'atlas_admin_decide_review_item': {
          if (typeof args.note !== 'string' || !args.note.trim()) {
            throw new EntryError('EVIDENCE_NOTE_REQUIRED', 'An agent decision must carry a note citing the evidence relied on. Re-read the item, check its evidence, and decide again with the note.');
          }
          const decided = await queue.decide({
            id: args.id, decision: args.decision, note: args.note.trim(),
            decidedBy: AGENT_DECIDED_BY, via: VIA,
          });
          result = { ok: true, entry: decided.entry, commit: decided.commit };
          break;
        }
        case 'atlas_admin_preview_review_batch': {
          const decisions = validateBatchDecisions(args.decisions);
          const preview = await queue.previewBatch({ decisions, decidedBy: AGENT_DECIDED_BY });
          result = { ok: true, dry_run: true, source: preview.source, revision: preview.revision, changes: preview.changes };
          break;
        }
        case 'atlas_admin_decide_review_batch': {
          const decisions = validateBatchDecisions(args.decisions);
          const applied = await queue.decideBatch({
            decisions, decidedBy: AGENT_DECIDED_BY, via: VIA, expectedRevision: args.expected_revision,
          });
          result = { ok: true, entries: applied.entries, changes: applied.changes, commit: applied.commit, revision: applied.revision };
          break;
        }
        case 'atlas_admin_undo_review_decision': {
          const undone = await queue.undo({ id: args.id, via: VIA });
          result = { ok: true, entry: undone.entry, commit: undone.commit };
          break;
        }
        case 'atlas_admin_get_review_gating': {
          const gating = await queue.loadGating();
          if (!gating) throw new EntryError('NOT_CONFIGURED', 'data/review-gating.json could not be loaded.');
          result = { gating };
          break;
        }
        case 'atlas_admin_list_auto_applied': {
          const { queue: data, source } = await queue.loadQueue();
          const gating = await queue.loadGating();
          const autoBy = gating?.decided_by ?? 'auto-gate';
          let entries = (data.entries ?? []).filter(entry => entry.decided_by === autoBy);
          if (args.kind) entries = entries.filter(entry => entry.kind === args.kind);
          entries.sort((a, b) => String(b.decided_at ?? '').localeCompare(String(a.decided_at ?? '')) || String(a.id).localeCompare(String(b.id)));
          const total = entries.length;
          result = { source, decided_by: autoBy, total, entries: entries.slice(0, args.limit ?? 50) };
          break;
        }
      }
      return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result };
    } catch (error) {
      if (error instanceof AdminError) {
        const result = { code: error.code, message: error.message };
        return { isError: true, content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result };
      }
      const code = error instanceof EntryError ? error.code : 'STORAGE_ERROR';
      const message = error instanceof EntryError ? error.message : 'Could not read or persist the review queue. Inspect the server stderr; do not assume the write succeeded.';
      if (!(error instanceof EntryError)) console.error(error.message);
      const result = { code, message, ...(error instanceof EntryError && error.details ? { details: error.details } : {}) };
      return { isError: true, content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result };
    }
  });
  return server;
}
