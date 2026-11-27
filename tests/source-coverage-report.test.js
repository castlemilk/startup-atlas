import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSourceCoverage, renderSourceCoverageMarkdown, sourceHost, successBucket } from '../scripts/source-coverage-report.mjs';

// #89 (OPS-01): the source-coverage report gives every recorded crawl
// source a denominator, a last-fetch and a last-success, and each crawl
// mode its latest completed run's attempted/succeeded/failed counts —
// so a source that has never succeeded is visible without raw logs.

test('sourceHost parses hosts and tolerates unparsed ids', () => {
  assert.equal(sourceHost('https://example.com/a/b'), 'example.com');
  assert.equal(sourceHost('not a url'), '(unparsed)');
});

test('successBucket ages last_success_at against the report date', () => {
  const today = Date.parse('2026-11-27T00:00:00Z');
  assert.equal(successBucket({ last_success_at: '2026-11-26T21:05:42+00:00' }, today), 'fresh');
  assert.equal(successBucket({ last_success_at: '2026-11-10T00:00:00Z' }, today), 'recent');
  assert.equal(successBucket({ last_success_at: '2026-10-01T00:00:00Z' }, today), 'stale');
  assert.equal(successBucket({ last_success_at: null }, today), 'never');
  assert.equal(successBucket({}, today), 'never');
});

const fixture = () => ({
  state: {
    updated_at: '2026-11-26T21:10:51+00:00',
    sources: {
      'https://a.example/one': {
        source_id: 'https://a.example/one', last_fetch_at: '2026-11-26T21:05:42+00:00',
        last_success_at: '2026-11-26T21:05:42+00:00', last_status: 200,
        consecutive_failures: 0, total_runs: 2, new_changed_rows_last_run: 5,
      },
      'https://a.example/two': {
        source_id: 'https://a.example/two', last_fetch_at: '2026-11-26T21:05:42+00:00',
        last_success_at: null, last_status: null,
        consecutive_failures: 1, total_runs: 1, new_changed_rows_last_run: 0,
      },
      'https://b.example/three': {
        source_id: 'https://b.example/three', last_fetch_at: '2026-11-20T00:00:00Z',
        last_success_at: '2026-11-19T00:00:00Z', last_status: 403,
        consecutive_failures: 2, total_runs: 3, new_changed_rows_last_run: 0,
      },
    },
  },
  runs: {
    runs: [
      {
        run_id: 'r1', mode: 'partners', status: 'completed',
        finished_at: '2026-11-25T00:00:00Z',
        outcome: { sources_attempted: 10, sources_succeeded: 9, sources_failed: 1 },
        scope: { source_ids: ['A', 'B'] },
      },
      {
        run_id: 'r2', mode: 'partners', status: 'failed',
        finished_at: '2026-11-26T00:00:00Z', outcome: {}, scope: {},
      },
      {
        run_id: 'r3', mode: 'news', status: 'completed',
        finished_at: '2026-11-26T00:00:00Z',
        outcome: { sources_attempted: 4, sources_succeeded: 4, sources_failed: 0 },
        scope: { source_ids: ['N'] },
      },
    ],
  },
});

test('buildSourceCoverage counts denominators, hosts and modes', () => {
  const today = Date.parse('2026-11-27T00:00:00Z');
  const report = buildSourceCoverage({ ...fixture(), today });

  assert.equal(report.summary.total, 3);
  assert.equal(report.summary.succeeded, 2);
  assert.equal(report.summary.never, 1);
  assert.equal(report.summary.failing, 2);
  assert.equal(report.summary.totalRuns, 6);
  assert.deepEqual(report.summary.buckets, { fresh: 1, recent: 1, stale: 0, never: 1 });
  assert.equal(report.summary.lastSuccessAt, '2026-11-26T21:05:42+00:00');

  const hosts = Object.fromEntries(report.hosts.map((h) => [h.host, h]));
  assert.equal(hosts['a.example'].total, 2);
  assert.equal(hosts['a.example'].never, 1);
  assert.equal(hosts['b.example'].failing, 1);

  const modes = Object.fromEntries(report.modes.map((m) => [m.mode, m]));
  assert.equal(modes.partners.runs, 2);
  assert.equal(modes.partners.completed, 1);
  assert.equal(modes.partners.failed, 1);
  // The latest *completed* run supplies the denominators, not the failed one.
  assert.equal(modes.partners.lastCompleted.sources_attempted, 10);
  assert.equal(modes.partners.lastCompleted.scope_sources, 2);
  assert.equal(modes.news.lastCompleted.sources_succeeded, 4);
});

test('renderSourceCoverageMarkdown emits summary, mode and never tables', () => {
  const today = Date.parse('2026-11-27T00:00:00Z');
  const report = buildSourceCoverage({ ...fixture(), today });
  const md = renderSourceCoverageMarkdown(report, { generatedAt: '2026-11-27', revision: 'abc1234' });
  assert.match(md, /# Source coverage and last successful scan/);
  assert.match(md, /from revision abc1234/);
  assert.match(md, /Sources recorded: 3\. Succeeded at least once: 2\. Never succeeded: 1\./);
  assert.match(md, /\| partners \| 2 \| 1 \| 1 \| 0 \| 2026-11-26 \| 10 \| 9 \| 1 \| 2 \|/);
  assert.match(md, /\| https:\/\/a\.example\/two \| 2026-11-26 \| 1 \|/);
});
