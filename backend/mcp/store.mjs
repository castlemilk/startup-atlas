import { createHash, randomUUID } from 'node:crypto';
import { readFile, lstat, realpath, open, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { EntryError, parseAdditions, validateOpportunity, validateProvenance } from '../../scripts/catalogue-entries.mjs';

const normalize = value => value.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
export class CatalogueStore {
  constructor(root, { writeEnabled = false } = {}) {
    this.root = path.resolve(root);
    this.writeEnabled = writeEnabled;
    this.additionsPath = path.join(this.root, 'data/opportunities-added.json');
    this.cataloguePath = path.join(this.root, 'data/catalogue.json');
    this.lockPath = path.join(this.root, 'data/.atlas-mcp-write.lock');
  }

  async paths() {
    const root = await realpath(this.root);
    if (await realpath(path.join(root, 'data')) !== path.join(root, 'data')) throw new EntryError('UNSAFE_PATH', 'The data directory must not be a symlink');
    for (const file of [this.additionsPath, this.cataloguePath]) {
      const info = await lstat(file);
      if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1) throw new EntryError('UNSAFE_PATH', 'Catalogue files must be regular, unlinked files');
    }
  }

  async snapshot() {
    await this.paths();
    const [catalogueText, additionsText, generatorText] = await Promise.all([
      readFile(this.cataloguePath, 'utf8'), readFile(this.additionsPath, 'utf8'), readFile(path.join(this.root, 'scripts/make-data.py'), 'utf8'),
    ]);
    const catalogue = JSON.parse(catalogueText);
    if (!Array.isArray(catalogue.opportunities) || !Array.isArray(catalogue.partnerLeads)) throw new EntryError('INVALID_CATALOGUE', 'Generate a valid Startup Atlas catalogue before starting the server');
    const additions = parseAdditions(JSON.parse(additionsText));
    // Catalogue may already contain generated additions. Never conceal a conflicting record.
    for (const { entry } of additions.entries) {
      const rendered = catalogue.opportunities.find(item => item.id === entry.id);
      if (rendered && !isDeepStrictEqual(rendered, entry)) throw new EntryError('CATALOGUE_CONFLICT', `Generated catalogue disagrees with addition ${entry.id}; regenerate and resolve the conflict`);
    }
    const ids = new Set(catalogue.opportunities.map(entry => entry.id));
    const opportunities = [...catalogue.opportunities, ...additions.entries.filter(record => !ids.has(record.entry.id)).map(record => record.entry)];
    const revision = createHash('sha256').update(JSON.stringify([catalogueText, additionsText, generatorText])).digest('hex');
    return { catalogue, additions, additionsText, opportunities, revision };
  }

  async info() {
    const current = await this.snapshot();
    return {
      revision: current.revision, writeEnabled: this.writeEnabled,
      opportunities: current.opportunities.length, partnerLeads: current.catalogue.partnerLeads.length,
      kinds: [...new Set(current.opportunities.map(x => x.kind))].sort(),
      accessRoutes: [...new Set(current.opportunities.map(x => x.access))].sort(),
      publication: 'Local repository edits only. Review, generate, test, build and commit/push through the existing GitHub Pages release workflow. No automatic publication.',
      evidence: 'Sources are supplied by the caller, not fetched or independently verified by this server. WORLD needs explicit worldwide eligibility; otherwise use named markets or UNKNOWN. Never include private application details.',
    };
  }

  async search(query = '', limit = 20) {
    if (typeof query !== 'string' || query.length > 200 || !Number.isInteger(limit) || limit < 1 || limit > 100) throw new EntryError('VALIDATION_ERROR', 'query must be text up to 200 characters; limit must be 1–100');
    const current = await this.snapshot();
    const matches = current.opportunities.filter(item => normalize([item.id, item.name, item.org, item.summary].join(' ')).includes(normalize(query)));
    return { revision: current.revision, total: matches.length, entries: matches.slice(0, limit) };
  }

  async get(id) {
    if (typeof id !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) throw new EntryError('VALIDATION_ERROR', 'id must be a lowercase slug');
    const current = await this.snapshot();
    const entry = current.opportunities.find(item => item.id === id);
    if (!entry) throw new EntryError('NOT_FOUND', `No opportunity has ID ${id}`);
    return { revision: current.revision, entry, provenance: current.additions.entries.find(record => record.entry.id === id)?.provenance ?? null };
  }

  validateInput(entry, provenance) {
    validateOpportunity(entry); validateProvenance(provenance, entry);
    if (entry.checked > new Date().toISOString().slice(0, 10)) throw new EntryError('VALIDATION_ERROR', 'checked cannot be in the future');
  }

  inspectCandidate(current, entry, provenance) {
    const previous = current.additions.entries.find(record => record.entry.id === entry.id);
    if (previous && isDeepStrictEqual(previous.entry, entry) && isDeepStrictEqual(previous.provenance, provenance)) return 'already_present';
    if (current.opportunities.some(item => item.id === entry.id)) throw new EntryError('DUPLICATE_ID', `ID ${entry.id} already exists; this add-only tool never replaces records`);
    const equivalent = current.opportunities.find(item => normalize(item.name) === normalize(entry.name) && normalize(item.org) === normalize(entry.org));
    if (equivalent) throw new EntryError('DUPLICATE_ENTRY', `The same name and organisation already exist as ${equivalent.id}; use a distinct name only for an evidenced, separate offer`);
    return 'valid';
  }

  async validate(entry, provenance) {
    this.validateInput(entry, provenance);
    const current = await this.snapshot();
    return { status: this.inspectCandidate(current, entry, provenance), revision: current.revision, persisted: false, entry };
  }

  async add(entry, provenance, expectedRevision) {
    if (!this.writeEnabled) throw new EntryError('READ_ONLY', 'Writes are disabled. Restart this local server with --write only when repository edits are intended.');
    this.validateInput(entry, provenance);
    if (typeof expectedRevision !== 'string' || !/^[a-f0-9]{64}$/.test(expectedRevision)) throw new EntryError('VALIDATION_ERROR', 'expectedRevision must be the SHA-256 revision returned by validation');
    await this.paths();
    let lock;
    try { lock = await open(this.lockPath, 'wx', 0o600); }
    catch (error) {
      if (error.code === 'EEXIST') throw new EntryError('WRITE_BUSY', 'Another writer holds the catalogue lock. Retry after it finishes. If a process crashed, inspect the lock and remove it only after confirming no writer is running.');
      throw error;
    }
    let temporary;
    try {
      await lock.writeFile(JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }));
      const current = await this.snapshot();
      if (this.inspectCandidate(current, entry, provenance) === 'already_present') return { status: 'already_present', id: entry.id, revision: current.revision, published: false };
      if (current.revision !== expectedRevision) throw new EntryError('STALE_REVISION', 'The catalogue changed. Search and validate again before adding. No files were changed.');
      const record = { entry, provenance, addedAt: new Date().toISOString() };
      const document = { ...current.additions, entries: [...current.additions.entries, record] };
      temporary = path.join(this.root, 'data', `.atlas-mcp-${randomUUID()}.tmp`);
      const file = await open(temporary, 'wx', 0o600);
      try { await file.writeFile(JSON.stringify(document, null, 2) + '\n'); await file.sync(); }
      finally { await file.close(); }
      // Catch edits from non-MCP writers while preparing the transaction.
      const latest = await this.snapshot();
      if (latest.revision !== expectedRevision) throw new EntryError('STALE_REVISION', 'The catalogue changed during this write. No data was replaced; validate again.');
      await rename(temporary, this.additionsPath);
      temporary = null;
      // Persist the directory entry as well as file contents before acknowledging.
      const directory = await open(path.dirname(this.additionsPath), 'r');
      try { await directory.sync(); } finally { await directory.close(); }
      const saved = await this.snapshot();
      return {
        status: 'added', id: entry.id, revision: saved.revision, published: false,
        sourceFile: 'data/opportunities-added.json',
        next: 'Run npm test && npm run build. Review and commit data/opportunities-added.json and generated data/catalogue.json, then use the existing release workflow. The live site has not changed.',
      };
    } finally {
      if (temporary) await unlink(temporary).catch(() => {});
      await lock.close();
      await unlink(this.lockPath);
    }
  }
}
