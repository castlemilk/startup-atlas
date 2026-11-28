import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('partner profile reads its documents through the graph store, not direct data fetches (#70)', async () => {
  const source = await readFile(new URL('../web/partner-profile.js', import.meta.url), 'utf8');
  assert.match(source, /import \{ openGraph \} from '\.\/graph-store\.js';/);
  for (const name of ['catalogue.json', 'partners-reviewed.json', 'partner-profiles.json', 'map-locations.json']) {
    assert.match(source, new RegExp(`readDocument\\('${name.replace('.', '\\.')}'\\)`), `partner-profile.js must read ${name} through the graph store`);
  }
  assert.ok(!/\bfetch\(/.test(source), 'partner-profile.js must not fetch data documents directly');
  assert.ok(!/fetchJson/.test(source), 'partner-profile.js must not keep a direct fetch helper');
});

test('partner profile keeps the supplemental documents independently optional (#70)', async () => {
  const source = await readFile(new URL('../web/partner-profile.js', import.meta.url), 'utf8');
  assert.match(source, /Promise\.allSettled\(\[/);
  assert.match(source, /result\.status === 'fulfilled' \? result\.value : null/);
});
