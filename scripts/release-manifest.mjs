// Release manifest for the built Pages snapshot (issue #69): the live index
// publishes a manifest with per-file hashes and counts, but the Pages build
// had no equivalent, so a published snapshot could not be inventoried or
// compared against the tree the build produced. buildReleaseManifest walks
// a dist tree and returns a deterministic manifest object; writeReleaseManifest
// persists it as dist/release-manifest.json. The manifest never lists itself.
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

export const RELEASE_MANIFEST_NAME = 'release-manifest.json';
export const RELEASE_MANIFEST_SCHEMA = 1;

async function collectFiles(dir, root, out) {
  const entries = await readdir(dir, { withFileTypes: true });
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      await collectFiles(full, root, out);
    } else if (entry.isFile()) {
      const path = relative(root, full).split(sep).join('/');
      if (path !== RELEASE_MANIFEST_NAME) out.push({ full, path });
    }
  }
}

export async function buildReleaseManifest(rootDir, { sourceRevision = '' } = {}) {
  const found = [];
  await collectFiles(rootDir, rootDir, found);
  const files = [];
  let totalBytes = 0;
  for (const { full, path } of found) {
    const bytes = await readFile(full);
    totalBytes += bytes.length;
    files.push({
      path,
      bytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    });
  }
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return {
    schema_version: RELEASE_MANIFEST_SCHEMA,
    source_revision: sourceRevision,
    counts: { files: files.length, bytes: totalBytes },
    files,
  };
}

export async function writeReleaseManifest(rootDir, options = {}) {
  const manifest = await buildReleaseManifest(rootDir, options);
  await writeFile(
    join(rootDir, RELEASE_MANIFEST_NAME),
    JSON.stringify(manifest, null, 2) + '\n',
  );
  return manifest;
}

// Compare a tree against a release manifest (issue #69 rollback proof): the
// tree is rebuilt into a fresh manifest and every entry is diffed, so a
// restored prior release can be proven byte-identical to what was published
// before it goes live again. Returns { ok, problems } — problems are
// human-readable, one per discrepancy; nothing is written.
export async function verifyReleaseManifest(rootDir, expected) {
  const problems = [];
  if (expected.schema_version !== RELEASE_MANIFEST_SCHEMA) {
    problems.push(
      `schema_version ${expected.schema_version} != ${RELEASE_MANIFEST_SCHEMA}`,
    );
  }
  if (!Array.isArray(expected.files)) {
    problems.push('manifest has no files array');
    return { ok: false, problems };
  }
  if (
    expected.counts &&
    (expected.counts.files !== expected.files.length ||
      expected.counts.bytes !==
        expected.files.reduce((sum, f) => sum + f.bytes, 0))
  ) {
    problems.push('manifest counts do not match its own file entries');
  }
  const actual = await buildReleaseManifest(rootDir, {
    sourceRevision: expected.source_revision ?? '',
  });
  const actualByPath = new Map(actual.files.map((f) => [f.path, f]));
  const expectedPaths = new Set();
  for (const entry of expected.files) {
    expectedPaths.add(entry.path);
    const found = actualByPath.get(entry.path);
    if (!found) {
      problems.push(`missing: ${entry.path}`);
    } else if (found.bytes !== entry.bytes) {
      problems.push(
        `size differs: ${entry.path} (${found.bytes} != ${entry.bytes} bytes)`,
      );
    } else if (found.sha256 !== entry.sha256) {
      problems.push(`sha256 differs: ${entry.path}`);
    }
  }
  for (const entry of actual.files) {
    if (!expectedPaths.has(entry.path)) {
      problems.push(`unexpected: ${entry.path}`);
    }
  }
  return { ok: problems.length === 0, problems };
}

// CLI: run as the final step of `npm run build` / `build:prepared`, after
// build.mjs, build-graph-db.py and build-query-parquet.py have all written
// into dist/, so the manifest covers the complete published tree.
// Usage: node scripts/release-manifest.mjs [distDir]
// Verify mode (rollback proof, docs/RELEASE-ROLLBACK.md): compare a tree
// against a saved manifest without writing anything.
// Usage: node scripts/release-manifest.mjs --verify [distDir] [manifestPath]
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (process.argv[2] === '--verify') {
    const distDir = process.argv[3] ?? 'dist';
    const manifestPath =
      process.argv[4] ?? join(distDir, RELEASE_MANIFEST_NAME);
    const expected = JSON.parse(await readFile(manifestPath, 'utf8'));
    const { ok, problems } = await verifyReleaseManifest(distDir, expected);
    if (!ok) {
      console.error(
        `Release verification FAILED for ${distDir} against ${manifestPath} (revision ${expected.source_revision || '(unknown)'}):`,
      );
      for (const problem of problems) console.error(`  - ${problem}`);
      process.exit(1);
    }
    console.log(
      `Release verified: ${distDir} matches ${manifestPath} — ${expected.counts.files} files, ${expected.counts.bytes} bytes, revision ${expected.source_revision || '(unknown)'}`,
    );
    process.exit(0);
  }
  const distDir = process.argv[2] ?? 'dist';
  let sourceRevision =
    process.env.ATLAS_SOURCE_REVISION || process.env.GITHUB_SHA || '';
  if (!sourceRevision) {
    try {
      sourceRevision = execFileSync('git', ['rev-parse', 'HEAD'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
    } catch {
      sourceRevision = '';
    }
  }
  const manifest = await writeReleaseManifest(distDir, { sourceRevision });
  console.log(
    `Wrote ${distDir}/${RELEASE_MANIFEST_NAME}: ${manifest.counts.files} files, ${manifest.counts.bytes} bytes, revision ${sourceRevision || '(unknown)'}`,
  );
}
