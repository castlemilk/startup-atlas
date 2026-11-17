import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {resolve, dirname} from 'node:path';

const guidePath = resolve('docs/VIEW-USAGE.md');
const guide = readFileSync(guidePath, 'utf8');
const links = [...guide.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)].map(match => match[1]);
const site = 'https://castlemilk.github.io/startup-atlas/';

test('view usage guide links resolve to repository files and published route sources', () => {
  assert.ok(links.length >= 10);
  for (const href of links) {
    const url = href.startsWith(site) ? new URL(href) : null;
    const target = url ? resolve('web', url.pathname.slice('/startup-atlas/'.length) || 'index.html') : resolve(dirname(guidePath), href);
    assert.ok(existsSync(target), `Missing guide target: ${href}`);
    if (url?.hash) assert.ok(readFileSync(target, 'utf8').includes(`id="${url.hash.slice(1)}"`), `Missing guide anchor: ${href}`);
  }
});

test('view usage examples refer to existing companies and partner identities', () => {
  const graph = JSON.parse(readFileSync('data/graph.json', 'utf8'));
  for (const href of links.filter(href => href.startsWith(site))) {
    const url = new URL(href);
    const id = url.searchParams.get('entity') || url.searchParams.get('id');
    if (id) assert.ok(graph.entities.some(entity => entity.id === id), `Unknown example entity: ${id}`);
    const name = url.searchParams.get('name');
    if (name) assert.ok(graph.entities.some(entity => entity.name === name), `Unknown example partner: ${name}`);
  }
});
