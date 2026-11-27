/**
 * Distributed crawl work queue — the /mcp/admin surface over
 * data/crawl-work-queue.json.
 *
 * Mirrors scripts/crawl_work_queue.py exactly: the Python module is the
 * semantics source of truth (dispatchers and local agents use its CLI),
 * and this module gives hosted agents the same claim/lease state machine
 * through the admin MCP tools. Both test suites pin the same behaviours
 * (claim contention, lease expiry/reclaim, idempotent completion,
 * fail -> retry -> dead).
 *
 * Durability follows the review-queue pattern: the queue file lives in
 * the repo and every mutation is a GitHub Contents API write through
 * QueueFileStore, whose sha check makes a competing claim fail with
 * QUEUE_CONFLICT instead of double-claiming a unit. Nothing is held in
 * process memory.
 *
 * Design: distributed-crawl-design.md (goal workspace, 27 Nov 2026) and
 * docs/CRAWL-COORDINATION.md (the contract this implements).
 */
import { AdminError } from './admin.mjs';
import { EntryError } from '../../scripts/catalogue-entries.mjs';

export const CRAWL_QUEUE_PATH = 'data/crawl-work-queue.json';
export const DEFAULT_LEASE_SECONDS = 1800;
const STATUSES = ['pending', 'claimed', 'done', 'failed', 'dead'];

export function isoSeconds(date) {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function parseTime(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Return units whose lease has expired to pending. Returns their ids. */
export function reclaimExpired(queue, now = new Date()) {
  const reclaimed = [];
  for (const unit of queue.units ?? []) {
    if (unit.status !== 'claimed') continue;
    const expires = parseTime(unit.lease_expires_at);
    if (expires && expires <= now) {
      unit.status = 'pending';
      unit.claimed_by = null;
      unit.claimed_at = null;
      unit.lease_expires_at = null;
      reclaimed.push(unit.unit_id);
    }
  }
  return reclaimed;
}

function findUnit(queue, unitId) {
  const unit = (queue.units ?? []).find(item => item.unit_id === unitId);
  if (!unit) throw new EntryError('NOT_FOUND', `No work unit with id ${unitId}.`);
  return unit;
}

function heldBy(unit, agentId) {
  return unit.status === 'claimed' && unit.claimed_by === agentId;
}

function notHeld(unit, agentId) {
  return new EntryError('NOT_HELD', `Unit ${unit.unit_id} is not claimed by ${agentId} (status ${unit.status}, claimed_by ${unit.claimed_by ?? 'null'}).`);
}

/** Claim the first matching pending unit, or return null when drained. */
export function claimNext(queue, agentId, { now = new Date(), leaseSeconds = DEFAULT_LEASE_SECONDS, runId, kind, mode, scopeId } = {}) {
  reclaimExpired(queue, now);
  const candidates = (queue.units ?? [])
    .filter(unit => unit.status === 'pending')
    .sort((a, b) => String(a.run_id).localeCompare(String(b.run_id)) || String(a.unit_id).localeCompare(String(b.unit_id)));
  for (const unit of candidates) {
    if (runId && unit.run_id !== runId) continue;
    if (kind && unit.kind !== kind) continue;
    if (mode && unit.mode !== mode) continue;
    if (scopeId && unit.scope_id !== scopeId) continue;
    unit.status = 'claimed';
    unit.claimed_by = agentId;
    unit.claimed_at = isoSeconds(now);
    unit.lease_expires_at = isoSeconds(new Date(now.getTime() + leaseSeconds * 1000));
    unit.attempts = (unit.attempts ?? 0) + 1;
    return unit;
  }
  return null;
}

export function heartbeatUnit(queue, unitId, agentId, { now = new Date(), leaseSeconds = DEFAULT_LEASE_SECONDS } = {}) {
  const unit = findUnit(queue, unitId);
  reclaimExpired(queue, now);
  if (!heldBy(unit, agentId)) throw notHeld(unit, agentId);
  unit.lease_expires_at = isoSeconds(new Date(now.getTime() + leaseSeconds * 1000));
  return unit;
}

/** Record a unit's result. Idempotent for the same agent + result_ref. */
export function completeUnit(queue, unitId, agentId, resultRef, outcome, { now = new Date() } = {}) {
  if (typeof resultRef !== 'string' || !resultRef.trim()) {
    throw new EntryError('VALIDATION_ERROR', 'result_ref must be a non-empty string.');
  }
  const unit = findUnit(queue, unitId);
  if (unit.status === 'done') {
    const result = unit.result ?? {};
    if (result.completed_by === agentId && result.result_ref === resultRef) {
      return { unit, alreadyDone: true };
    }
    throw new EntryError('ALREADY_DONE', `Unit ${unitId} is already done with a different result; the stored result stands.`);
  }
  reclaimExpired(queue, now);
  if (!heldBy(unit, agentId)) throw notHeld(unit, agentId);
  unit.status = 'done';
  unit.result = {
    result_ref: resultRef,
    outcome: outcome ?? {},
    completed_by: agentId,
    completed_at: isoSeconds(now),
  };
  unit.claimed_by = null;
  unit.claimed_at = null;
  unit.lease_expires_at = null;
  unit.last_error = null;
  return { unit, alreadyDone: false };
}

/** Record a failure: back to pending while attempts remain, else dead. */
export function failUnit(queue, unitId, agentId, error, { now = new Date() } = {}) {
  const unit = findUnit(queue, unitId);
  reclaimExpired(queue, now);
  if (!heldBy(unit, agentId)) throw notHeld(unit, agentId);
  unit.last_error = error ? String(error) : 'unspecified failure';
  unit.claimed_by = null;
  unit.claimed_at = null;
  unit.lease_expires_at = null;
  unit.status = (unit.attempts ?? 0) >= (unit.max_attempts ?? 3) ? 'dead' : 'pending';
  return unit;
}

export function statusSummary(queue, { now = new Date(), runId } = {}) {
  reclaimExpired(queue, now);
  const units = (queue.units ?? []).filter(unit => !runId || unit.run_id === runId);
  const byStatus = Object.fromEntries(STATUSES.map(status => [status, 0]));
  const runs = {};
  for (const unit of units) {
    byStatus[unit.status] = (byStatus[unit.status] ?? 0) + 1;
    const run = (runs[unit.run_id] ??= Object.fromEntries(STATUSES.map(status => [status, 0])));
    run[unit.status] = (run[unit.status] ?? 0) + 1;
  }
  return { total: units.length, by_status: byStatus, runs };
}

const isConflict = error => error instanceof AdminError && error.code === 'QUEUE_CONFLICT';

/**
 * Store-backed queue: every operation is load -> mutate -> Contents API
 * save. Claim retries once on a sha conflict (the reload either finds the
 * contested unit already claimed and takes the next one, or reports the
 * pool drained); other mutations surface the conflict to the caller.
 */
export class CrawlWorkQueue {
  constructor(store) {
    this.store = store;
  }

  async load() {
    const { data, sha, source } = await this.store.loadJson(CRAWL_QUEUE_PATH);
    if (!data || !Array.isArray(data.units)) {
      throw new EntryError('VALIDATION_ERROR', `${CRAWL_QUEUE_PATH} is not a crawl work queue file.`);
    }
    return { queue: data, sha, source };
  }

  async claim({ agentId, ...filters }) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const { queue, sha, source } = await this.load();
      const unit = claimNext(queue, agentId, filters);
      if (!unit) return { source, unit: null };
      try {
        const saved = await this.store.saveJson(CRAWL_QUEUE_PATH, queue, sha,
          `crawl-queue: claim ${unit.unit_id} by ${agentId}`);
        return { source, unit, commit: saved.commit };
      } catch (error) {
        if (isConflict(error) && attempt === 0) continue;
        throw error;
      }
    }
    throw new EntryError('CLAIM_LOST', 'The claim raced another agent twice; call claim again.');
  }

  async mutate(fn, message) {
    const { queue, sha, source } = await this.load();
    const result = fn(queue);
    const saved = await this.store.saveJson(CRAWL_QUEUE_PATH, queue, sha, message);
    return { source, ...result, commit: saved.commit };
  }

  async heartbeat({ unitId, agentId, leaseSeconds }) {
    return this.mutate(
      queue => ({ unit: heartbeatUnit(queue, unitId, agentId, { leaseSeconds }) }),
      `crawl-queue: heartbeat ${unitId} by ${agentId}`);
  }

  async complete({ unitId, agentId, resultRef, outcome }) {
    return this.mutate(
      queue => completeUnit(queue, unitId, agentId, resultRef, outcome),
      `crawl-queue: complete ${unitId} by ${agentId}`);
  }

  async fail({ unitId, agentId, error }) {
    return this.mutate(
      queue => ({ unit: failUnit(queue, unitId, agentId, error) }),
      `crawl-queue: fail ${unitId} by ${agentId}`);
  }

  async status({ runId } = {}) {
    const { queue, source } = await this.load();
    return { source, ...statusSummary(queue, { runId }) };
  }
}
