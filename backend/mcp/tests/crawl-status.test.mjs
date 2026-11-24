import assert from 'node:assert/strict';
import test from 'node:test';
import { CrawlStatus, shapeStatus, progressUrl } from '../crawl-status.mjs';

const NOW = Date.parse('2026-11-24T02:00:00Z');

function runningRecord() {
  return {
    version: 1,
    kind: 'crawl-progress',
    run: {
      run_id: '45169210509', run_attempt: 1,
      run_url: 'https://github.com/castlemilk/startup-atlas/actions/runs/45169210509',
      trigger: 'workflow_dispatch', status: 'running',
      started_at: '2026-11-24T01:58:24Z', updated_at: '2026-11-24T01:59:56Z',
      finished_at: null, heartbeat_seq: 12, current_mode: 'profiles',
    },
    modes: {
      partners: { status: 'completed', sources_total: 12, sources_done: 12, sources_failed: 0, pages_attempted: 40, pages_succeeded: 39, candidates: 1564, errors: 0, current_source: null, last_error: null },
      programs: { status: 'completed', sources_total: 20, sources_done: 20, sources_failed: 0, pages_attempted: 20, pages_succeeded: 20, candidates: 156, errors: 0, current_source: null, last_error: null },
      news: { status: 'completed', sources_total: 7, sources_done: 7, sources_failed: 1, pages_attempted: 30, pages_succeeded: 28, candidates: 5, errors: 1, current_source: null, last_error: 'HTTP 500' },
      logos: { status: 'completed', sources_total: 32, sources_done: 32, sources_failed: 0, pages_attempted: 0, pages_succeeded: 0, candidates: 309, errors: 0, current_source: null, last_error: null },
      profiles: { status: 'running', sources_total: 32, sources_done: 19, sources_failed: 0, pages_attempted: 0, pages_succeeded: 0, candidates: 1204, errors: 0, current_source: 'Blackbird', last_error: null },
      portraits: { status: 'pending', sources_total: null, sources_done: 0, sources_failed: 0, pages_attempted: 0, pages_succeeded: 0, candidates: 0, errors: 0, current_source: null, last_error: null },
      'partner-candidates': { status: 'pending', sources_total: null, sources_done: 0, sources_failed: 0, pages_attempted: 0, pages_succeeded: 0, candidates: 0, errors: 0, current_source: null, last_error: null },
    },
    totals: { sources_total: 103, sources_done: 90, candidates: 3238, errors: 1 },
    last_completed: null,
  };
}

test('progressUrl targets the bucket root object', () => {
  assert.equal(progressUrl('bkt'), 'https://storage.googleapis.com/bkt/crawl-progress.json');
});

test('running record shapes with percent over declared totals only', () => {
  const out = shapeStatus(runningRecord(), NOW);
  assert.equal(out.state, 'running');
  assert.equal(out.run_id, '45169210509');
  assert.equal(out.elapsed_s, 96);
  assert.equal(out.heartbeat_age_s, 4);
  assert.equal(out.heartbeat_stale, false);
  assert.equal(out.current_mode, 'profiles');
  // (12+20+7+32+19) / (12+20+7+32+32) = 90/103 -> 87
  assert.equal(out.percent_complete, 87);
  assert.equal(out.modes.length, 7);
  assert.equal(out.modes[4].current_source, 'Blackbird');
  assert.deepEqual(out.totals, { sources_total: 103, sources_done: 90, candidates: 3238, errors: 1 });
});

test('stale heartbeat is flagged, never reclassified', () => {
  const record = runningRecord();
  record.run.updated_at = '2026-11-24T01:50:00Z';
  const out = shapeStatus(record, NOW);
  assert.equal(out.state, 'running');
  assert.equal(out.heartbeat_age_s, 600);
  assert.equal(out.heartbeat_stale, true);
});

test('include_modes=false trims the per-mode detail', () => {
  const out = shapeStatus(runningRecord(), NOW, { includeModes: false });
  assert.equal(out.modes, undefined);
  assert.equal(out.state, 'running');
});

test('terminal record shapes as idle with its own summary', () => {
  const record = runningRecord();
  record.run.status = 'completed';
  record.run.finished_at = '2026-11-24T01:59:59Z';
  record.run.current_mode = null;
  const out = shapeStatus(record, NOW);
  assert.equal(out.state, 'idle');
  assert.equal(out.last_completed.run_id, '45169210509');
  assert.equal(out.last_completed.status, 'completed');
  assert.equal(out.last_completed.modes[0].candidates, 1564);
});

test('idle uses a carried-forward last_completed when the run block has none', () => {
  const record = runningRecord();
  record.run = { updated_at: '2026-11-24T01:00:00Z' };
  record.last_completed = { run_id: '111', status: 'completed', totals: { candidates: 4432 } };
  const out = shapeStatus(record, NOW);
  assert.equal(out.state, 'idle');
  assert.equal(out.last_completed.run_id, '111');
  assert.equal(out.last_completed.totals.candidates, 4432);
});

test('fetch failure returns unknown with the error, never invented state', async () => {
  const status = new CrawlStatus({
    bucket: 'bkt', now: () => NOW,
    fetchImpl: async () => { throw new Error('network down'); },
  });
  const out = await status.status();
  assert.equal(out.state, 'unknown');
  assert.match(out.error, /network down/);
});

test('HTTP failure returns unknown', async () => {
  const status = new CrawlStatus({
    bucket: 'bkt', now: () => NOW,
    fetchImpl: async () => ({ ok: false, status: 404 }),
  });
  const out = await status.status();
  assert.equal(out.state, 'unknown');
  assert.match(out.error, /404/);
});

test('record is cached for 15 seconds', async () => {
  let fetches = 0;
  let now = NOW;
  const status = new CrawlStatus({
    bucket: 'bkt', now: () => now,
    fetchImpl: async () => {
      fetches += 1;
      return { ok: true, status: 200, json: async () => runningRecord() };
    },
  });
  await status.status();
  await status.status();
  assert.equal(fetches, 1);
  now += 16_000;
  await status.status();
  assert.equal(fetches, 2);
});
