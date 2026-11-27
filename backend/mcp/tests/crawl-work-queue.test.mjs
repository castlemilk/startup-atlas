/**
 * Distributed crawl work queue — pins the same behaviours as
 * tests/test_crawl_work_queue.py for the Python source of truth:
 * exactly-one-winner claims (including the Contents API sha-conflict
 * retry), lease expiry/reclaim, idempotent completion, fail -> dead.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { AdminError } from '../admin.mjs';
import {
  CrawlWorkQueue, claimNext, completeUnit, failUnit, heartbeatUnit, statusSummary,
} from '../crawl-work-queue.mjs';

const T0 = new Date('2026-11-28T00:00:00Z');
const later = seconds => new Date(T0.getTime() + seconds * 1000);

function makeQueue(nUnits = 3, runId = 'run-1') {
  return {
    version: 1,
    units: Array.from({ length: nUnits }, (_, i) => ({
      unit_id: `cwu-${runId}-${String(i + 1).padStart(3, '0')}`,
      run_id: runId,
      kind: 'coverage',
      mode: null,
      scope_id: 'founder-photos',
      source_ids: null,
      entity_ids: [`founder:x:p${i}`],
      status: 'pending',
      claimed_by: null,
      claimed_at: null,
      lease_expires_at: null,
      attempts: 0,
      max_attempts: 3,
      result: null,
      last_error: null,
    })),
  };
}

/** In-memory QueueFileStore stand-in with real sha-conflict semantics. */
class FakeStore {
  constructor(queue) {
    this.data = structuredClone(queue);
    this.sha = 'sha-0';
    this.sequence = 0;
    this.conflictOnce = false;
  }

  async loadJson() {
    return { data: structuredClone(this.data), sha: this.sha, source: 'github' };
  }

  async saveJson(_path, data, sha) {
    if (this.conflictOnce) {
      this.conflictOnce = false;
      throw new AdminError('QUEUE_CONFLICT', 'simulated race', 409);
    }
    if (sha !== this.sha) throw new AdminError('QUEUE_CONFLICT', 'stale sha', 409);
    this.data = structuredClone(data);
    this.sequence += 1;
    this.sha = `sha-${this.sequence}`;
    return { commit: `commit-${this.sequence}` };
  }
}

test('two agents never share a unit; the pool drains to null', () => {
  const queue = makeQueue(2);
  const first = claimNext(queue, 'agent-a', { now: T0 });
  const second = claimNext(queue, 'agent-b', { now: T0 });
  assert.notEqual(first.unit_id, second.unit_id);
  assert.equal(claimNext(queue, 'agent-c', { now: T0 }), null);
  assert.equal(first.claimed_by, 'agent-a');
  assert.equal(first.attempts, 1);
});

test('store-level claim retries once on a sha conflict and still wins a unit', async () => {
  const store = new FakeStore(makeQueue(2));
  store.conflictOnce = true;
  const queue = new CrawlWorkQueue(store);
  const { unit } = await queue.claim({ agentId: 'agent-a' });
  assert.ok(unit);
  assert.equal(unit.claimed_by, 'agent-a');
  assert.equal(store.data.units.filter(item => item.status === 'claimed').length, 1);
});

test('two queues over one store claim different units', async () => {
  const store = new FakeStore(makeQueue(2));
  const a = new CrawlWorkQueue(store);
  const b = new CrawlWorkQueue(store);
  const first = await a.claim({ agentId: 'agent-a' });
  const second = await b.claim({ agentId: 'agent-b' });
  assert.notEqual(first.unit.unit_id, second.unit.unit_id);
  const third = await a.claim({ agentId: 'agent-c' });
  assert.equal(third.unit, null);
});

test('expired lease returns to the pool; a live lease does not', () => {
  const queue = makeQueue(1);
  const unit = claimNext(queue, 'agent-a', { now: T0, leaseSeconds: 60 });
  assert.equal(claimNext(queue, 'agent-b', { now: later(30), leaseSeconds: 60 }), null);
  const reclaimed = claimNext(queue, 'agent-b', { now: later(61), leaseSeconds: 60 });
  assert.equal(reclaimed.unit_id, unit.unit_id);
  assert.equal(reclaimed.claimed_by, 'agent-b');
  assert.equal(reclaimed.attempts, 2);
});

test('heartbeat extends the lease and requires the holder', () => {
  const queue = makeQueue(1);
  const unit = claimNext(queue, 'agent-a', { now: T0, leaseSeconds: 60 });
  assert.throws(
    () => heartbeatUnit(queue, unit.unit_id, 'agent-b', { now: T0 }),
    error => error.code === 'NOT_HELD');
  heartbeatUnit(queue, unit.unit_id, 'agent-a', { now: later(30), leaseSeconds: 60 });
  assert.equal(unit.lease_expires_at, '2026-11-28T00:01:30Z');
});

test('completion is idempotent for the same agent + ref, refused otherwise', () => {
  const queue = makeQueue(1);
  const unit = claimNext(queue, 'agent-a', { now: T0 });
  assert.throws(
    () => completeUnit(queue, unit.unit_id, 'agent-b', 'ref-1', {}, { now: T0 }),
    error => error.code === 'NOT_HELD');
  const done = completeUnit(queue, unit.unit_id, 'agent-a', 'ref-1', { candidates: 5 }, { now: T0 });
  assert.equal(done.alreadyDone, false);
  assert.equal(done.unit.status, 'done');
  assert.deepEqual(done.unit.result.outcome, { candidates: 5 });
  const again = completeUnit(queue, unit.unit_id, 'agent-a', 'ref-1', {}, { now: later(300) });
  assert.equal(again.alreadyDone, true);
  assert.throws(
    () => completeUnit(queue, unit.unit_id, 'agent-a', 'ref-2', {}, { now: T0 }),
    error => error.code === 'ALREADY_DONE');
});

test('late completion after the unit was re-claimed is refused', () => {
  const queue = makeQueue(1);
  const unit = claimNext(queue, 'agent-a', { now: T0, leaseSeconds: 60 });
  claimNext(queue, 'agent-b', { now: later(61), leaseSeconds: 60 });
  assert.throws(
    () => completeUnit(queue, unit.unit_id, 'agent-a', 'ref-late', {}, { now: later(61) }),
    error => error.code === 'NOT_HELD');
});

test('fail returns the unit to pending, then dead at max attempts', () => {
  const queue = makeQueue(1);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const unit = claimNext(queue, 'agent-a', { now: T0 });
    const failed = failUnit(queue, unit.unit_id, 'agent-a', 'boom', { now: T0 });
    assert.equal(failed.status, 'pending');
    assert.equal(failed.last_error, 'boom');
  }
  const unit = claimNext(queue, 'agent-a', { now: T0 });
  assert.equal(failUnit(queue, unit.unit_id, 'agent-a', 'boom', { now: T0 }).status, 'dead');
  assert.equal(claimNext(queue, 'agent-a', { now: T0 }), null);
});

test('status summary counts by status and per run', () => {
  const queue = makeQueue(3);
  const unit = claimNext(queue, 'agent-a', { now: T0 });
  completeUnit(queue, unit.unit_id, 'agent-a', 'ref', {}, { now: T0 });
  const summary = statusSummary(queue, { now: T0 });
  assert.equal(summary.total, 3);
  assert.equal(summary.by_status.done, 1);
  assert.equal(summary.by_status.pending, 2);
  assert.equal(summary.runs['run-1'].done, 1);
});
