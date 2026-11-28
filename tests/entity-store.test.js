import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('entity profile reads the identity registry through the graph store, not a direct data fetch (#70)', async () => {
  const source = await readFile(new URL('../web/entity.js', import.meta.url), 'utf8');
  assert.match(source, /import \{ openGraph \} from '\.\/graph-store\.js';/);
  assert.match(source, /store\.document\('identity\.json'\)/, 'entity.js must read identity.json through the graph store');
  assert.match(source, /buildEntityRedirects\(identityRegistry, new Set\(store\.graph\.entities\.map\(entity => entity\.id\)\)\)/,
    'entity.js must derive the redirect map from the registry with the shared builder');
  assert.ok(!/entity-redirects\.json/.test(source), 'entity.js must not fetch the build-generated redirect map directly');
  assert.ok(!/\bfetch\(/.test(source), 'entity.js must not fetch data documents directly');
});

test('the site build publishes identity.json for the graph store fallback mode (#70)', async () => {
  const build = await readFile(new URL('../scripts/build.mjs', import.meta.url), 'utf8');
  assert.match(build, /cp\('data\/identity\.json','dist\/data\/identity\.json'\)/,
    'build.mjs must copy identity.json into dist/data so fallback mode can read it');
});
