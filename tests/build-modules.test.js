import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { posix } from 'node:path';

// Regression guard for #478 (24 Nov 2026): profile-tabs.js and micro-graph.js
// were imported by shipped pages but missing from scripts/build.mjs's explicit
// copy lists, so the deployed Pages snapshot 404'd them and profile pages hung
// while CI stayed green — the test suite runs against the repo tree, not the
// built snapshot. This test walks every local reference reachable from the
// shipped HTML pages (script/link tags, import maps, then transitive static
// and dynamic imports and CSS references between web modules) and asserts
// each referenced web/ file is actually shipped by the build: named in one of
// build.mjs's copy lists, produced as an esbuild bundle output, or covered by
// one of its recursive web/ copies. The copy lists are parsed out of
// build.mjs itself, so there is no second hardcoded list to drift.

const rootUrl = new URL('../', import.meta.url);
const webFile = (rel) => new URL(`web/${rel}`, rootUrl);
const readWeb = (rel) => readFile(webFile(rel), 'utf8');

function quotedStrings(segment) {
  return [...segment.matchAll(/'([^']+)'/g)].map((match) => match[1]);
}

async function parseBuild() {
  const source = await readFile(new URL('scripts/build.mjs', rootUrl), 'utf8');
  const shipped = new Set();

  const designFiles = quotedStrings(source.match(/const designFiles=\[([\s\S]*?)\];/)?.[1] ?? '');
  for (const push of source.matchAll(/designFiles\.push\(([\s\S]*?)\);/g)) {
    designFiles.push(...quotedStrings(push[1]));
  }
  for (const file of designFiles) shipped.add(file);

  const graphModules = quotedStrings(source.match(/const graphModules=\[([\s\S]*?)\];/)?.[1] ?? '');
  for (const file of graphModules) shipped.add(file);

  // The one-off cp loop over literal filenames (spreading named lists).
  const cpLoop = source.match(/for \(const file of \[([\s\S]*?)\]\) await cp\(`web\/\$\{file\}`/)?.[1] ?? '';
  const namedLists = { designFiles, graphModules };
  for (const spread of cpLoop.matchAll(/\.\.\.(\w+)/g)) {
    for (const file of namedLists[spread[1]] ?? []) shipped.add(file);
  }
  for (const file of quotedStrings(cpLoop)) shipped.add(file);

  // esbuild bundle outputs land in dist/ under their outfile name; their
  // entry sources are leaves for this walk because esbuild inlines the
  // entry's own imports (e.g. graph-loom.js imports graph-company-layout.js,
  // which is bundled, not copied — and a missing import fails the build).
  const bundleOutputs = new Set();
  const bundleEntries = new Set();
  for (const bundle of source.matchAll(/entryPoints:\['web\/([^']+)'\],outfile:'dist\/([^']+)'/g)) {
    bundleEntries.add(bundle[1]);
    bundleOutputs.add(bundle[2]);
    shipped.add(bundle[2]);
  }

  // Recursive copies (web/vendor, web/assets/*) ship everything beneath them.
  const recursivePrefixes = [...source.matchAll(/cp\('(web\/[^']+)','dist\/[^']+',\{recursive:true/g)]
    .map((match) => match[1]);

  // Fail loudly if build.mjs is restructured so the parse above goes empty:
  // a silently empty shipped set would make this test vacuous or useless.
  assert.ok(designFiles.length > 0, 'build.mjs parse: designFiles list not found');
  assert.ok(graphModules.length > 0, 'build.mjs parse: graphModules list not found');
  assert.ok(cpLoop.length > 0, 'build.mjs parse: literal cp list not found');
  assert.ok(bundleOutputs.size > 0, 'build.mjs parse: esbuild bundle outputs not found');
  assert.ok(recursivePrefixes.length > 0, 'build.mjs parse: recursive web copies not found');
  assert.ok(shipped.has('index.html') && shipped.has('entity.html'),
    'build.mjs parse: expected the main shipped pages in the copy lists');
  return { shipped, bundleEntries, recursivePrefixes };
}

function isShipped(rel, { shipped, recursivePrefixes }) {
  if (shipped.has(rel)) return true;
  const sourcePath = `web/${rel}`;
  return recursivePrefixes.some((prefix) => sourcePath === prefix || sourcePath.startsWith(`${prefix}/`));
}

function localReferences(kind, source) {
  const refs = [];
  if (kind === 'html') {
    for (const tag of source.matchAll(/<(?:script|link)\b[^>]*>/g)) {
      const ref = tag[0].match(/(?:src|href)="([^"]+)"/)?.[1];
      if (ref) refs.push(ref);
    }
    for (const map of source.matchAll(/<script type="importmap">([\s\S]*?)<\/script>/g)) {
      try {
        for (const target of Object.values(JSON.parse(map[1]).imports ?? {})) refs.push(target);
      } catch { /* a malformed import map is a page bug, not a copy-list bug */ }
    }
  } else if (kind === 'js') {
    for (const match of source.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*|\bexport\s+[^'"]*?\bfrom\s*)['"](\.[^'"]+)['"]/g)) {
      refs.push(match[1]);
    }
  } else if (kind === 'css') {
    for (const match of source.matchAll(/@import\s+(?:url\()?\s*['"]([^'"]+)['"]/g)) refs.push(match[1]);
    for (const match of source.matchAll(/url\((?!['"]?data:)['"]?(\.[^'")]+)['"]?\)/g)) refs.push(match[1]);
  }
  return refs;
}

test('every web module referenced by a shipped page is in the Pages build', async () => {
  const build = await parseBuild();
  const entries = [...build.shipped].filter((file) => file.endsWith('.html'));
  assert.ok(entries.length > 0, 'no shipped HTML pages found in the build lists');

  const missing = [];
  const seen = new Set();
  const queue = [];
  const consider = (rawRef, from) => {
    if (!rawRef || /^(?:#|\/\/|data:|mailto:|tel:|javascript:|[a-z][a-z0-9+.-]*:)/i.test(rawRef)) return;
    const ref = rawRef.split(/[?#]/)[0];
    if (!ref || ref.endsWith('/')) return;
    const rel = posix.normalize(posix.join(posix.dirname(from), ref));
    if (rel.startsWith('../') || rel === '..') return;
    // Only files that live under web/ are this build's to copy. References
    // that resolve outside web/ point at data/, docs/ or dist files the
    // build generates from node_modules (e.g. vendor/duckdb/*), which are
    // covered by their own build steps and fail the build when absent.
    if (!existsSync(webFile(rel))) return;
    if (!isShipped(rel, build)) missing.push(`${rel} (referenced by ${from})`);
    if (!seen.has(rel)) { seen.add(rel); queue.push(rel); }
  };

  for (const entry of entries) {
    seen.add(entry);
    for (const ref of localReferences('html', await readWeb(entry))) consider(ref, entry);
    queue.push(entry);
  }
  while (queue.length > 0) {
    const rel = queue.pop();
    // Bundle entries are leaves: esbuild inlines their imports (see above).
    if (build.bundleEntries.has(rel)) continue;
    const kind = rel.endsWith('.html') ? 'html' : rel.endsWith('.css') ? 'css'
      : /\.(?:js|mjs)$/.test(rel) ? 'js' : null;
    if (!kind) continue;
    for (const ref of localReferences(kind, await readWeb(rel))) consider(ref, rel);
  }

  assert.deepEqual([...new Set(missing)].sort(), [],
    'web files referenced by shipped pages but absent from scripts/build.mjs copy lists / bundle outputs / recursive copies');
});
