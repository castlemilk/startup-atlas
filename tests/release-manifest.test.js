import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  RELEASE_MANIFEST_NAME,
  buildReleaseManifest,
  writeReleaseManifest,
} from '../scripts/release-manifest.mjs';

// Issue #69: the Pages release needs a manifest with per-file hashes and
// counts equivalent to the live-index manifest, so a published snapshot can
// be inventoried and compared against the tree the build produced.

async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), 'atlas-release-manifest-'));
  await mkdir(join(dir, 'data'), { recursive: true });
  await writeFile(join(dir, 'index.html'), '<h1>Atlas</h1>\n');
  await writeFile(join(dir, 'data', 'atlas.sqlite'), Buffer.from([0, 1, 2, 3]));
  return dir;
}

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

test('manifest lists every file with bytes and sha256, sorted by path', async () => {
  const dir = await fixture();
  const manifest = await buildReleaseManifest(dir, { sourceRevision: 'abc123' });
  assert.equal(manifest.schema_version, 1);
  assert.equal(manifest.source_revision, 'abc123');
  assert.deepEqual(
    manifest.files.map((f) => f.path),
    ['data/atlas.sqlite', 'index.html'],
  );
  const html = manifest.files.find((f) => f.path === 'index.html');
  assert.equal(html.bytes, 15);
  assert.equal(html.sha256, sha256('<h1>Atlas</h1>\n'));
  const db = manifest.files.find((f) => f.path === 'data/atlas.sqlite');
  assert.equal(db.bytes, 4);
  assert.equal(db.sha256, sha256(Buffer.from([0, 1, 2, 3])));
  assert.deepEqual(manifest.counts, { files: 2, bytes: 19 });
});

test('manifest is deterministic for an unchanged tree', async () => {
  const dir = await fixture();
  const first = await buildReleaseManifest(dir, { sourceRevision: 'abc123' });
  const second = await buildReleaseManifest(dir, { sourceRevision: 'abc123' });
  assert.deepEqual(first, second);
});

test('written manifest excludes itself and round-trips', async () => {
  const dir = await fixture();
  const written = await writeReleaseManifest(dir, { sourceRevision: 'abc123' });
  const onDisk = JSON.parse(
    await readFile(join(dir, RELEASE_MANIFEST_NAME), 'utf8'),
  );
  assert.deepEqual(onDisk, written);
  assert.ok(!onDisk.files.some((f) => f.path === RELEASE_MANIFEST_NAME));
  // Rebuilding over a tree that already contains a manifest stays stable.
  const rebuilt = await buildReleaseManifest(dir, { sourceRevision: 'abc123' });
  assert.deepEqual(rebuilt, written);
});

test('package.json runs the manifest step last in both build scripts', async () => {
  const pkg = JSON.parse(
    await readFile(new URL('../package.json', import.meta.url), 'utf8'),
  );
  for (const name of ['build', 'build:prepared']) {
    const steps = pkg.scripts[name].split(' && ');
    assert.equal(
      steps.at(-1),
      'node scripts/release-manifest.mjs',
      `${name} must emit the release manifest after every other dist write`,
    );
    assert.ok(
      steps.indexOf('node scripts/release-manifest.mjs') >
        steps.indexOf('python3 scripts/build-query-parquet.py'),
      `${name} must emit the manifest after the parquet build`,
    );
  }
});
