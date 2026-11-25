import test from 'node:test';
import assert from 'node:assert/strict';
import {
  atlasManifestUrls,
  atlasRuntimeUrls,
  initialTopic,
  nextLoadingMode,
  pickSummary,
  topicSummaries,
} from '../web/graph-atlas-model.js';

// Unit coverage for the pure half of the #367 atlas wiring: the reader
// URLs must match what scripts/build-loom-atlas.py publishes and what
// scripts/build.mjs vendors, and the fallback policy must retry a failed
// on-demand load exactly once through the full JSON reader.

const base = 'https://example.test/startup-atlas/graph-atlas.js';
const manifest = {
  topics: [
    { id: 0, label: 'Partners', color: '#6b4d6b', first: 0, count: 12, x: 0, y: -100 },
    { id: 1, label: 'People', color: '#76582a', first: 12, count: 40, x: 95, y: -31 },
    { id: 2, label: 'Startups', color: '#31513b', first: 52, count: 25, x: 59, y: 81 },
  ],
  connections: [[0, 2, 9], [1, 2, 31]],
  database: 'loom-atlas.sqlite',
  databaseBytes: 65536,
  pageSize: 4096,
  full: 'loom-atlas-full.json',
};

test('manifest urls resolve the published data files beside the page', () => {
  assert.deepEqual(atlasManifestUrls(manifest, base), {
    database: 'https://example.test/startup-atlas/data/loom-atlas.sqlite',
    full: 'https://example.test/startup-atlas/data/loom-atlas-full.json',
  });
});

test('runtime urls resolve the vendored SQLite worker and WASM', () => {
  assert.deepEqual(atlasRuntimeUrls(base), {
    worker: 'https://example.test/startup-atlas/vendor/atlas-runtime/sqlite.worker.js',
    wasm: 'https://example.test/startup-atlas/vendor/atlas-runtime/sql-wasm.wasm',
  });
});

test('topic summaries keep manifest order with counts', () => {
  assert.deepEqual(topicSummaries(manifest), [
    { id: 0, label: 'Partners', count: 12 },
    { id: 1, label: 'People', count: 40 },
    { id: 2, label: 'Startups', count: 25 },
  ]);
  assert.deepEqual(topicSummaries({}), []);
  assert.deepEqual(topicSummaries(null), []);
});

test('initial topic is the largest topic, or null when there are none', () => {
  assert.equal(initialTopic(manifest), 1);
  assert.equal(initialTopic({ topics: [] }), null);
  assert.equal(initialTopic(null), null);
});

test('fallback policy retries on-demand failures once via the full reader', () => {
  assert.equal(nextLoadingMode('on-demand', true), 'full');
  assert.equal(nextLoadingMode('on-demand', false), null);
  assert.equal(nextLoadingMode('full', true), null);
  assert.equal(nextLoadingMode('full', false), null);
});

test('pick summary names the topic for articles and guides for hubs', () => {
  assert.equal(
    pickSummary({ kind: 'article', label: 'Canva', topic: 2 }, manifest),
    'Canva · Startups',
  );
  assert.match(pickSummary({ kind: 'topic', label: 'Startups', topic: 2 }, manifest), /^Startups — /);
  assert.equal(pickSummary(null, manifest), '');
});
