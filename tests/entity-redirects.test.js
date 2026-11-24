import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildEntityRedirects, resolveEntityRedirect } from '../web/entity-redirects.js';

// #93: shared profile URLs must survive entity ID migrations. When records
// merge, the loser's ID is retired from the published graph; without a
// redirect the old link dead-ends on "Profile unavailable".

test('resolves a merged ID to its canonical successor', () => {
  const redirects = { 'partner:airtree-ventures': 'partner:airtree' };
  assert.equal(resolveEntityRedirect('partner:airtree-ventures', redirects), 'partner:airtree');
});

test('follows merge chains to the final winner', () => {
  const redirects = { 'partner:a': 'partner:b', 'partner:b': 'partner:c' };
  assert.equal(resolveEntityRedirect('partner:a', redirects), 'partner:c');
});

test('returns null for live IDs, unknown IDs and cycles', () => {
  const redirects = { 'partner:a': 'partner:b', 'partner:b': 'partner:a' };
  assert.equal(resolveEntityRedirect('partner:live', redirects), null);
  assert.equal(resolveEntityRedirect('partner:a', redirects), null);
  assert.equal(resolveEntityRedirect('partner:a', {}), null);
  assert.equal(resolveEntityRedirect('', redirects), null);
});

test('build keeps only redirects whose final target is published', () => {
  const identity = {
    entities: {
      'partner:old': { merged_into: 'partner:mid' },
      'partner:mid': { merged_into: 'partner:live' },
      'partner:gone': { merged_into: 'partner:unpublished' },
      'partner:live': {},
    },
  };
  const built = buildEntityRedirects(identity, new Set(['partner:live']));
  assert.deepEqual(built, { 'partner:mid': 'partner:live', 'partner:old': 'partner:live' });
});

test('every real merged ID redirects to a published graph entity', async () => {
  const identity = JSON.parse(await readFile(new URL('../data/identity.json', import.meta.url), 'utf8'));
  const graph = JSON.parse(await readFile(new URL('../data/graph.json', import.meta.url), 'utf8'));
  const validIds = new Set(graph.entities.map((entity) => entity.id));
  const built = buildEntityRedirects(identity, validIds);
  const merged = Object.values(identity.entities).filter((record) => record.merged_into).length;
  assert.ok(merged > 0, 'registry should contain merged records');
  assert.equal(Object.keys(built).length, merged);
  for (const [from, to] of Object.entries(built)) {
    assert.ok(validIds.has(to), `${from} redirects to unpublished ${to}`);
    assert.ok(!validIds.has(from), `${from} is merged but still published`);
  }
});
