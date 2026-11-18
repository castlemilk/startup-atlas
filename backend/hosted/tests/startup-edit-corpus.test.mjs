import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {describeStartupRecord, prepareStartupEdit} from '../src/startup-edit.mjs';
import {startupSlug} from '../src/startup-record.mjs';

// Offline release-readiness coverage over the checked-out corpus. The snapshot
// revision is synthetic: this test establishes neither live MCP availability
// nor factual review of the inherited claims. No network or proposal is made.
const paths = ['startup-research.json', 'graph.json', 'partner-leads.json', 'catalogue.json'];
const load = async () => {
  const bytes = await Promise.all(paths.map(path => readFile(new URL(`../../../data/${path}`, import.meta.url), 'utf8')));
  const [research, graph, leads, catalogue] = bytes.map(JSON.parse);
  return {bytes, snapshot: {head: 'a'.repeat(40), research, graph, leads, catalogue}};
};

test('every researched startup has an exact detached canonical editable read', async () => {
  const {snapshot} = await load();
  const before = structuredClone(snapshot);
  const ids = new Set();
  assert.ok(snapshot.research.startups.length > 0);
  for (const record of snapshot.research.startups) {
    const id = `startup:${startupSlug(record.name)}`;
    assert.ok(!ids.has(id), `Duplicate canonical ID: ${id}`);
    ids.add(id);
    const read = await describeStartupRecord(snapshot.research, id, snapshot.head);
    assert.deepEqual(read.record, record, id);
    assert.equal(read.published, false, id);
    assert.match(read.recordRevision, /^[a-f0-9]{64}$/, id);
    read.record.description = 'Mutating a returned read must not alter source';
  }
  assert.deepEqual(snapshot, before);
});

test('every researched startup previews review-only edits without altering inherited evidence or source bytes', async () => {
  const {bytes, snapshot} = await load();
  const before = structuredClone(snapshot);
  for (const record of snapshot.research.startups) {
    const id = `startup:${startupSlug(record.name)}`;
    const read = await describeStartupRecord(snapshot.research, id, snapshot.head);
    const reviewed_at = record.reviewed_at ?? snapshot.research.reviewed;
    const preview = await prepareStartupEdit(snapshot, {
      id, expectedRecordRevision: read.recordRevision, patch: {reviewed_at},
    });
    assert.deepEqual(preview.previous, record, id);
    assert.deepEqual(preview.merged, {...record, reviewed_at}, id);
    assert.deepEqual(preview.changedPaths, Object.hasOwn(record, 'reviewed_at') ? [] : ['/reviewed_at'], id);
    assert.equal(preview.persisted, false, id);
    assert.equal(preview.published, false, id);
    assert.match(preview.validationToken, /^[a-f0-9]{64}$/, id);
    assert.deepEqual(snapshot, before, id);
  }
  assert.deepEqual((await load()).bytes, bytes);
});
