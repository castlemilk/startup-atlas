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

// CLI: run as the final step of `npm run build` / `build:prepared`, after
// build.mjs, build-graph-db.py and build-query-parquet.py have all written
// into dist/, so the manifest covers the complete published tree.
// Usage: node scripts/release-manifest.mjs [distDir]
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
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
