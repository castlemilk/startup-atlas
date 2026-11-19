import { createHash, randomUUID } from 'node:crypto';
import { readFile, lstat, realpath, open, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { EntryError } from '../../scripts/catalogue-entries.mjs';
import { startupSlug } from '../hosted/src/startup-record.mjs';
import {
  STARTUP_EDIT_VERSION, describeStartupRecord, prepareStartupEdit,
} from '../hosted/src/startup-edit.mjs';

const sourceFile = 'data/startup-research.json';
const inputFiles = [sourceFile, 'data/graph.json', 'data/partner-leads.json', 'data/catalogue.json'];
const maxFileBytes = 5_000_000;
const normalize = value => value.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
const hexRevision = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const failure = (code, message, details) => Object.assign(new EntryError(code, message), { details });

// Uses the same lock as the opportunity and partner stores. No network, Git
// commands, authentication, publication, or paths supplied by a caller.
export class StartupStore {
  constructor(root, { writeEnabled = false } = {}) {
    this.root = path.resolve(root);
    this.writeEnabled = writeEnabled;
    this.file = path.join(this.root, sourceFile);
    this.lock = path.join(this.root, 'data/.atlas-mcp-write.lock');
  }

  async paths() {
    const root = await realpath(this.root);
    if (await realpath(path.join(root, 'data')) !== path.join(root, 'data')) {
      throw failure('UNSAFE_PATH', 'The data directory must not be a symlink.', { action: 'Inspect the local data directory before retrying.' });
    }
    for (const relative of inputFiles) {
      const stat = await lstat(path.join(this.root, relative));
      if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) {
        throw failure('UNSAFE_PATH', 'Startup edit inputs must be regular, unlinked files.', { sourceFile: relative, action: 'Inspect the local input file before retrying.' });
      }
      if (stat.size > maxFileBytes) {
        throw failure('INVALID_DATA', 'A startup edit input exceeds the 5 MB limit.', { sourceFile: relative, action: 'Review the input size; do not truncate evidence to force an update.' });
      }
    }
  }

  async snapshot() {
    await this.paths();
    const contents = await Promise.all(inputFiles.map(relative => readFile(path.join(this.root, relative))));
    if (contents.some(content => content.byteLength > maxFileBytes)) {
      throw failure('INVALID_DATA', 'A startup edit input exceeds the 5 MB limit.', { action: 'Review the input size before retrying.' });
    }
    let values;
    try { values = contents.map(content => JSON.parse(content.toString('utf8'))); }
    catch { throw failure('INVALID_DATA', 'Startup edit inputs must contain valid JSON.', { action: 'Inspect the local input files; no input was changed.' }); }
    const [research, graph, leads, catalogue] = values;
    if (!research || !Array.isArray(research.startups) || research.startups.some(record => !record || typeof record.name !== 'string') ||
        !graph || !Array.isArray(graph.entities) || !Array.isArray(leads) || leads.some(name => typeof name !== 'string') ||
        !catalogue || !Array.isArray(catalogue.opportunities)) {
      throw failure('INVALID_DATA', 'Startup edit input structures are invalid.', { action: 'Inspect the reviewed records and generated graph before retrying.' });
    }
    // The full raw input set is a local snapshot token, not a Git commit SHA.
    const revision = createHash('sha256').update(JSON.stringify(contents.map(content => content.toString('utf8')))).digest('hex');
    return { head: revision, revision, research, graph, leads, catalogue };
  }

  async search(query = '', limit = 20) {
    if (typeof query !== 'string' || query.length > 200 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw failure('VALIDATION_ERROR', 'Use a query up to 200 characters and a limit from 1 to 100.', { path: 'query/limit', action: 'Correct the search arguments.' });
    }
    const current = await this.snapshot();
    const matches = current.research.startups.filter(record => normalize([record.name, record.description || '', record.website || ''].join(' ')).includes(normalize(query)));
    const records = await Promise.all(matches.slice(0, limit).map(async record => {
      const result = await describeStartupRecord(current.research, `startup:${startupSlug(record.name)}`, current.revision);
      return { id: result.id, record: result.record, recordRevision: result.recordRevision };
    }));
    return { revision: current.revision, schemaVersion: STARTUP_EDIT_VERSION, sourceFile, origin: 'local_repository', total: matches.length, records, published: false };
  }

  async get(id) {
    const current = await this.snapshot();
    return { ...await describeStartupRecord(current.research, id, current.revision), origin: 'local_repository', published: false };
  }

  async validate(edit) {
    const current = await this.snapshot();
    const { research, ...preview } = await prepareStartupEdit(current, edit);
    return { ...preview, origin: 'local_repository', persisted: false, published: false };
  }

  async apply(edit, expectedRevision, validationToken) {
    if (!this.writeEnabled) {
      throw failure('READ_ONLY', 'Startup writes are disabled. Restart this local server with --write only when repository edits are intended.', { action: 'Use read and validation tools, or restart with the existing explicit --write option.' });
    }
    for (const [field, value] of [['expectedRevision', expectedRevision], ['validationToken', validationToken]]) {
      if (!hexRevision(value)) throw failure('VALIDATION_ERROR', `${field} must be the exact 64-character digest returned by validation.`, { path: field, action: 'Validate this exact edit and retain its returned revision and token.' });
    }
    await this.paths();
    let lock;
    try { lock = await open(this.lock, 'wx', 0o600); }
    catch (error) {
      if (error.code === 'EEXIST') throw failure('WRITE_BUSY', 'Another catalogue writer holds the shared lock.', { action: 'Wait for the writer to finish. Inspect a suspected abandoned lock before removing it.' });
      throw error;
    }
    let temporary, installed = false, prepared, result, errorToThrow;
    try {
      await lock.writeFile(JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }));
      const current = await this.snapshot();
      if (current.revision !== expectedRevision) {
        throw failure('STALE_REVISION', 'The local startup edit inputs changed. No record was replaced.', { path: 'expectedRevision', currentRevision: current.revision, action: 'Read the record again, reconcile the intended edit, then validate it again.' });
      }
      prepared = await prepareStartupEdit(current, edit);
      if (prepared.validationToken !== validationToken) {
        throw failure('VALIDATION_CONFLICT', 'The supplied validation token does not match this exact edit and snapshot.', { path: 'validationToken', action: 'Validate the complete intended edit again; do not only replace its revision.' });
      }
      if (isDeepStrictEqual(current.research, prepared.research)) {
        result = { ...await describeStartupRecord(current.research, edit.id, current.revision), status: 'already_present', origin: 'local_repository', persisted: false, published: false, intentDigest: prepared.intentDigest, nextRecordRevision: prepared.nextRecordRevision };
      } else {
        temporary = path.join(this.root, 'data', `.atlas-startup-${randomUUID()}.tmp`);
        const file = await open(temporary, 'wx', 0o600);
        try { await file.writeFile(JSON.stringify(prepared.research, null, 2) + '\n'); await file.sync(); }
        finally { await file.close(); }
        // Cooperating MCP writers hold the lock; this second read also catches
        // non-MCP changes made while the replacement was being prepared.
        if ((await this.snapshot()).revision !== expectedRevision) {
          throw failure('STALE_REVISION', 'The local startup edit inputs changed during preparation. No record was replaced.', { path: 'expectedRevision', action: 'Read and reconcile the current record, then validate again.' });
        }
        await rename(temporary, this.file);
        installed = true; temporary = null;
        const directory = await open(path.dirname(this.file), 'r');
        try { await directory.sync(); } finally { await directory.close(); }
        const saved = await this.snapshot();
        const readback = await describeStartupRecord(saved.research, edit.id, saved.revision);
        if (readback.recordRevision !== prepared.nextRecordRevision || !isDeepStrictEqual(saved.research, prepared.research)) {
          throw new Error('Startup edit readback differs from the prepared replacement.');
        }
        result = { ...readback, status: 'saved', origin: 'local_repository', persisted: true, published: false, baseRevision: current.revision, intentDigest: prepared.intentDigest, nextRecordRevision: prepared.nextRecordRevision, changedPaths: prepared.changedPaths };
      }
    } catch (error) { errorToThrow = error; }
    finally {
      if (temporary) {
        try { await unlink(temporary); } catch (error) { errorToThrow ??= error; }
      }
      try { await lock.close(); } catch (error) { errorToThrow ??= error; }
      try { await unlink(this.lock); } catch (error) { errorToThrow ??= error; }
    }
    if (errorToThrow) {
      if (installed) {
        throw failure('WRITE_UNCERTAIN', 'The replacement occurred, but durable completion, readback or lock cleanup could not be confirmed. Do not replay the write.', {
          id: edit.id, sourceFile, nextRecordRevision: prepared.nextRecordRevision,
          action: 'Call atlas_get_startup_record for this ID and compare recordRevision with nextRecordRevision. Inspect the local diff and shared lock before any further write.',
        });
      }
      throw errorToThrow;
    }
    return result;
  }
}
