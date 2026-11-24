import { createHash } from 'node:crypto';
import { readFile, lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { EntryError } from '../../scripts/catalogue-entries.mjs';

const digest = (...parts) => createHash('sha256').update(JSON.stringify(parts)).digest('hex');
const isHex = (value, length) => typeof value === 'string' && new RegExp(`^[a-f0-9]{${length}}$`).test(value);
const isTimestamp = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(value) && !Number.isNaN(Date.parse(value));
const isHttpsUrl = value => {
  if (value === null) return true;
  try { const url = new URL(value); return url.protocol === 'https:' && !!url.hostname && !url.username && !url.password; }
  catch { return false; }
};
const isRunId = value => typeof value === 'string' && /^crawl-\d{8}-[a-z0-9-]+-\d{2}$/.test(value);

export const CRAWL_MODES = ['sites', 'discover', 'programs', 'partners', 'captures', 'apply-reviewed', 'logos', 'partner-candidates', 'profiles', 'company-profiles', 'news'];
export const CRAWL_STATUSES = ['claimed', 'running', 'completed', 'failed', 'abandoned', 'superseded'];
export const CRAWL_REVIEW_STATUSES = ['unreviewed', 'in_review', 'reviewed', 'published'];
export const MAX_REGISTRY_RUNS = 200;

const RUN_KEYS = ['version', 'run_id', 'mode', 'scope', 'args', 'catalogue_revision', 'source_revisions', 'claimed_by', 'claimed_at', 'lease_expires_at', 'status', 'started_at', 'finished_at', 'outcome', 'snapshot_sha256', 'artifact_url', 'run_url', 'review_status', 'published_pr', 'supersedes', 'superseded_by'];
const OUTCOME_KEYS = ['sources_attempted', 'sources_succeeded', 'sources_failed', 'candidates_discovered', 'coverage_reference', 'notes', 'sources'];
const SOURCE_STATUSES = ['ok', 'failed', 'not_attempted'];
const SOURCE_KEYS = ['source', 'status', 'pages_ok', 'pages_attempted'];

function fail(message) { throw new EntryError('VALIDATION_ERROR', message); }
function isRecord(value, keys) {
  return !!value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(key => keys.includes(key));
}

export function validateRunRecord(run) {
  if (!isRecord(run, RUN_KEYS)) fail('A crawl run record must be an object with only the documented run fields.');
  for (const key of RUN_KEYS) if (!Object.hasOwn(run, key)) fail(`A crawl run record is missing ${key}.`);
  if (run.version !== 1) fail('A crawl run record must have version 1.');
  if (!isRunId(run.run_id)) fail('run_id must look like crawl-YYYYMMDD-<mode>-<nn>.');
  if (!CRAWL_MODES.includes(run.mode)) fail(`mode must be one of ${CRAWL_MODES.join(', ')}.`);
  if (!isRecord(run.scope, ['source_ids', 'seed_file', 'seed_sha256'])) fail('scope must contain only source_ids, seed_file and seed_sha256.');
  if (!Array.isArray(run.scope.source_ids) || run.scope.source_ids.length === 0 || run.scope.source_ids.some(id => typeof id !== 'string' || id.length === 0)) fail('scope.source_ids must be a non-empty list of source IDs.');
  if (typeof run.scope.seed_file !== 'string' || run.scope.seed_file.length === 0) fail('scope.seed_file must be a path to the seed file the run used.');
  if (!isHex(run.scope.seed_sha256, 64)) fail('scope.seed_sha256 must be the SHA-256 of the seed file bytes.');
  if (!isRecord(run.args, Object.keys(run.args))) fail('args must be an object.');
  if (!isHex(run.catalogue_revision, 40)) fail('catalogue_revision must be the 40-character main commit the run was based on.');
  if (!isRecord(run.source_revisions, Object.keys(run.source_revisions)) || Object.values(run.source_revisions).some(value => !isHex(value, 64))) fail('source_revisions must map each source ID to the SHA-256 of the file that defines it.');
  for (const sourceId of run.scope.source_ids) if (!Object.hasOwn(run.source_revisions, sourceId)) fail(`source_revisions is missing ${sourceId}.`);
  if (typeof run.claimed_by !== 'string' || run.claimed_by.trim().length === 0) fail('claimed_by must name the agent or person that claimed the run.');
  if (!isTimestamp(run.claimed_at) || !isTimestamp(run.lease_expires_at) || !isTimestamp(run.started_at)) fail('claimed_at, lease_expires_at and started_at must be UTC timestamps.');
  if (run.finished_at !== null && !isTimestamp(run.finished_at)) fail('finished_at must be a UTC timestamp or null.');
  if (!CRAWL_STATUSES.includes(run.status)) fail(`status must be one of ${CRAWL_STATUSES.join(', ')}.`);
  if ((run.status === 'claimed' || run.status === 'running') && run.finished_at !== null) fail('A claimed or running run must not have finished_at set.');
  if (!isRecord(run.outcome, OUTCOME_KEYS)) fail('outcome must contain only the documented outcome fields.');
  for (const key of ['sources_attempted', 'sources_succeeded', 'sources_failed', 'candidates_discovered']) {
    if (!Number.isInteger(run.outcome[key]) || run.outcome[key] < 0) fail(`outcome.${key} must be a non-negative integer.`);
  }
  if (run.outcome.sources_succeeded + run.outcome.sources_failed > run.outcome.sources_attempted) fail('outcome succeeded and failed sources cannot exceed attempted sources.');
  if (run.outcome.sources !== undefined) {
    if (!Array.isArray(run.outcome.sources)) fail('outcome.sources must be a list of per-source status entries.');
    for (const entry of run.outcome.sources) {
      if (!isRecord(entry, SOURCE_KEYS)) fail('Each outcome.sources entry must be an object with only source, status, pages_ok and pages_attempted.');
      for (const key of SOURCE_KEYS) if (!Object.hasOwn(entry, key)) fail(`An outcome.sources entry is missing ${key}.`);
      if (typeof entry.source !== 'string' || entry.source.length === 0) fail('outcome.sources source must be a non-empty source name.');
      if (!SOURCE_STATUSES.includes(entry.status)) fail(`outcome.sources status must be one of ${SOURCE_STATUSES.join(', ')}.`);
      if (!Number.isInteger(entry.pages_ok) || entry.pages_ok < 0) fail('outcome.sources pages_ok must be a non-negative integer.');
      if (!Number.isInteger(entry.pages_attempted) || entry.pages_attempted < 0) fail('outcome.sources pages_attempted must be a non-negative integer.');
      if (entry.pages_ok > entry.pages_attempted) fail('outcome.sources pages_ok cannot exceed pages_attempted.');
    }
  }
  if (run.outcome.coverage_reference !== null && (typeof run.outcome.coverage_reference !== 'string' || run.outcome.coverage_reference.length === 0)) fail('outcome.coverage_reference must name the crawl snapshot or coverage file, or be null before the run produces one.');
  if (typeof run.outcome.notes !== 'string') fail('outcome.notes must be text.');
  if (!isHex(run.snapshot_sha256, 64) && run.snapshot_sha256 !== null) fail('snapshot_sha256 must be the SHA-256 of the crawl snapshot file, or null.');
  if (!isHttpsUrl(run.artifact_url) || !isHttpsUrl(run.run_url)) fail('artifact_url and run_url must be HTTPS URLs, or null.');
  if (!CRAWL_REVIEW_STATUSES.includes(run.review_status)) fail(`review_status must be one of ${CRAWL_REVIEW_STATUSES.join(', ')}.`);
  if (run.published_pr !== null && (!Number.isInteger(run.published_pr) || run.published_pr < 1)) fail('published_pr must be a pull request number, or null.');
  if (run.supersedes !== null && !isRunId(run.supersedes)) fail('supersedes must be a run ID, or null.');
  if (run.superseded_by !== null && !isRunId(run.superseded_by)) fail('superseded_by must be a run ID, or null.');
  return run;
}

export class CrawlRegistry {
  constructor(root) {
    this.root = path.resolve(root);
    this.file = path.join(this.root, 'data/crawl-runs.json');
  }

  async snapshot() {
    const root = await realpath(this.root);
    if (await realpath(path.join(root, 'data')) !== path.join(root, 'data')) throw new EntryError('UNSAFE_PATH', 'The data directory must not be a symlink.');
    const stat = await lstat(this.file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw new EntryError('UNSAFE_PATH', 'The crawl registry must be a regular unlinked file.');
    let document;
    try { document = JSON.parse(await readFile(this.file, 'utf8')); }
    catch { throw new EntryError('INVALID_REGISTRY', 'The crawl registry is not valid JSON.'); }
    if (!isRecord(document, ['version', 'runs'])) throw new EntryError('INVALID_REGISTRY', 'The crawl registry must contain only version and runs.');
    if (document.version !== 1) throw new EntryError('INVALID_REGISTRY', 'The crawl registry must have version 1.');
    if (!Array.isArray(document.runs)) throw new EntryError('INVALID_REGISTRY', 'The crawl registry runs must be a list.');
    if (document.runs.length > MAX_REGISTRY_RUNS) throw new EntryError('INVALID_REGISTRY', `The crawl registry holds more than ${MAX_REGISTRY_RUNS} runs; archive older runs to research/crawl/ packets.`);
    const seen = new Set();
    for (const run of document.runs) {
      validateRunRecord(run);
      if (seen.has(run.run_id)) throw new EntryError('INVALID_REGISTRY', `Duplicate crawl run ID ${run.run_id}.`);
      seen.add(run.run_id);
    }
    const text = await readFile(this.file, 'utf8');
    return { runs: document.runs, revision: digest(text) };
  }

  async list({ mode, source_id, status, since, limit = 20 } = {}) {
    if (mode !== undefined && !CRAWL_MODES.includes(mode)) fail(`mode must be one of ${CRAWL_MODES.join(', ')}.`);
    if (status !== undefined && !CRAWL_STATUSES.includes(status)) fail(`status must be one of ${CRAWL_STATUSES.join(', ')}.`);
    if (source_id !== undefined && (typeof source_id !== 'string' || source_id.length === 0)) fail('source_id must be a source ID.');
    let sinceDate = null;
    if (since !== undefined) {
      if (typeof since !== 'string' || Number.isNaN(Date.parse(since))) fail('since must be a date or timestamp.');
      sinceDate = new Date(since);
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) fail('limit must be 1–100.');
    const { runs, revision } = await this.snapshot();
    const matches = runs.filter(run =>
      (mode === undefined || run.mode === mode) &&
      (source_id === undefined || run.scope.source_ids.includes(source_id)) &&
      (status === undefined || run.status === status) &&
      (sinceDate === null || new Date(run.started_at) >= sinceDate));
    return { revision, total: matches.length, runs: matches.slice(0, limit) };
  }

  async get(run_id) {
    if (!isRunId(run_id)) fail('run_id must look like crawl-YYYYMMDD-<mode>-<nn>.');
    const { runs, revision } = await this.snapshot();
    const run = runs.find(item => item.run_id === run_id);
    if (!run) throw new EntryError('NOT_FOUND', `No crawl run has ID ${run_id}.`);
    return { revision, run };
  }

  async claims({ mode, source_id } = {}) {
    if (mode !== undefined && !CRAWL_MODES.includes(mode)) fail(`mode must be one of ${CRAWL_MODES.join(', ')}.`);
    if (source_id !== undefined && (typeof source_id !== 'string' || source_id.length === 0)) fail('source_id must be a source ID.');
    const { runs, revision } = await this.snapshot();
    const now = new Date();
    const claims = [];
    for (const run of runs) {
      if (run.status !== 'claimed' && run.status !== 'running') continue;
      if (mode !== undefined && run.mode !== mode) continue;
      const live = new Date(run.lease_expires_at) > now;
      for (const id of run.scope.source_ids) {
        if (source_id !== undefined && id !== source_id) continue;
        claims.push({ mode: run.mode, source_id: id, run_id: run.run_id, claimed_by: run.claimed_by, lease_expires_at: run.lease_expires_at, status: live ? 'live' : 'stale' });
      }
    }
    claims.sort((a, b) => a.lease_expires_at.localeCompare(b.lease_expires_at));
    return { revision, total: claims.length, claims };
  }
}
