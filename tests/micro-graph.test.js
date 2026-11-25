import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { edgeKindLabel, microGraphLayout, microGraphNameLines, microGraphNeighbours, microGraphNodeArt, MICRO_GRAPH_CAP } from '../web/micro-graph.js';

const entity = (id, kind, name) => ({ id, kind, name });
const graph = {
  entities: [
    entity('startup:acme', 'startup', 'Acme'),
    entity('person:ada', 'person', 'Ada Lovelace'),
    entity('person:grace', 'person', 'Grace Hopper'),
    entity('partner:fund', 'partner', 'Fund Co'),
    entity('programme:accel', 'programme', 'Accel'),
    entity('startup:other', 'startup', 'Other Co')
  ],
  edges: [
    { from: 'person:ada', to: 'startup:acme', kind: 'founded', confidence: 0.9, last_verified: '2026-11-01' },
    { from: 'person:grace', to: 'startup:acme', kind: 'team_member', confidence: 0.4, last_verified: '2026-11-20' },
    { from: 'person:grace', to: 'startup:acme', kind: 'founded', confidence: 0.7, last_verified: '2026-10-01' },
    { from: 'partner:fund', to: 'startup:acme', kind: 'supports', confidence: 0.7, last_verified: '2026-11-15' },
    { from: 'startup:acme', to: 'programme:accel', kind: 'participated_in', confidence: 0.2, last_verified: '2026-01-01' },
    { from: 'person:ada', to: 'startup:other', kind: 'founded', confidence: 1, last_verified: '2026-11-24' }
  ]
};

test('micro graph lists depth-1 neighbours only, strongest edge first', () => {
  const model = microGraphNeighbours(graph, 'startup:acme');
  assert.equal(model.center.id, 'startup:acme');
  assert.equal(model.total, 4);
  assert.equal(model.overflow, 0);
  // Ada (0.9) first; Grace's strongest edge is her 0.7 founding edge, and the
  // 0.7 tie with Fund Co breaks on verification recency (2026-11-15 first).
  assert.deepEqual(model.neighbours.map(item => item.entity.id),
    ['person:ada', 'partner:fund', 'person:grace', 'programme:accel']);
  const grace = model.neighbours.find(item => item.entity.id === 'person:grace');
  assert.equal(grace.edge.kind, 'founded');
  assert.deepEqual([...grace.kinds].sort(), ['founded', 'team_member']);
  // Depth-2 records (Ada's other company) never appear.
  assert.ok(!model.neighbours.some(item => item.entity.id === 'startup:other'));
});

test('micro graph caps neighbours and reports the overflow', () => {
  const many = {
    entities: [entity('startup:hub', 'startup', 'Hub'),
      ...Array.from({ length: 15 }, (_, i) => entity(`person:p${i}`, 'person', `Person ${i}`))],
    edges: Array.from({ length: 15 }, (_, i) => (
      { from: `person:p${i}`, to: 'startup:hub', kind: 'founded', confidence: i / 100, last_verified: '2026-11-01' }))
  };
  const model = microGraphNeighbours(many, 'startup:hub');
  assert.equal(model.neighbours.length, MICRO_GRAPH_CAP);
  assert.equal(model.total, 15);
  assert.equal(model.overflow, 3);
  assert.equal(model.neighbours[0].entity.id, 'person:p14');
});

test('micro graph rejects unknown roots and labels edge kinds', () => {
  assert.throws(() => microGraphNeighbours(graph, 'startup:missing'), /Entity not found/);
  assert.equal(edgeKindLabel('member_of_network'), 'Network member');
  assert.equal(edgeKindLabel('led_round'), 'Led round');
  assert.equal(edgeKindLabel('something_new'), 'Connected');
});

test('radial layout centres the root and spaces neighbours on the ellipse', () => {
  const { center, points } = microGraphLayout(4);
  assert.deepEqual(center, { x: 180, y: 130 });
  assert.equal(points.length, 4);
  assert.deepEqual(points[0], { x: 180, y: 40 });
  for (const point of points) {
    assert.ok(point.x >= 0 && point.x <= 360 && point.y >= 0 && point.y <= 260);
  }
  assert.deepEqual(microGraphLayout(0).points, []);
});

test('micro graph name labels wrap long names instead of truncating them', () => {
  // Names that fit one line stay on one line, unchanged.
  assert.deepEqual(microGraphNameLines('Canva'), ['Canva']);
  assert.deepEqual(microGraphNameLines('Sixteen Chars Co'), ['Sixteen Chars Co']);
  // Longer names split at the word boundary that best balances the lines.
  assert.deepEqual(microGraphNameLines('Blackbird Ventures'), ['Blackbird', 'Ventures']);
  assert.deepEqual(microGraphNameLines('MedTech Actuator Accelerator Australia'),
    ['MedTech Actuator', 'Accelerator Australia']);
  // Names that cannot wrap within two short lines keep the ellipsis
  // fallback, exactly as the single-line label rendered before.
  assert.deepEqual(microGraphNameLines('Government of Western Australia — Department of Water and Environmental Regulation'),
    ['Government of W…']);
  assert.deepEqual(microGraphNameLines('Antidisestablishmentarianism'), ['Antidisestablis…']);
});

test('micro graph node art renders a person headshot filling the node', () => {
  const art = microGraphNodeArt(
    { id: 'person:cielo', kind: 'person', name: 'Cielo Nicolosi', logo: 'https://castlemilk.github.io/startup-atlas/assets/portraits/cielo-nicolosi.png' },
    100, 50, 17);
  assert.match(art, /^<image class="entity-micro-art entity-micro-art-person" /);
  assert.ok(art.includes('href="./assets/portraits/cielo-nicolosi.png"'));
  assert.ok(art.includes('x="83" y="33" width="34" height="34"'));
  assert.ok(art.includes('preserveAspectRatio="xMidYMid slice"'));
});

test('micro graph node art fits a company logo whole inside the node', () => {
  const art = microGraphNodeArt(
    { id: 'startup:alloovium', kind: 'startup', name: 'Alloovium', logo: 'https://castlemilk.github.io/startup-atlas/assets/logos/alloovium.png' },
    180, 130, 23);
  assert.match(art, /^<image class="entity-micro-art" /);
  assert.ok(art.includes('href="./assets/logos/alloovium.png"'));
  assert.ok(art.includes('x="157" y="107" width="46" height="46"'));
  assert.ok(art.includes('preserveAspectRatio="xMidYMid meet"'));
});

test('micro graph node art falls back to the curated logo map, then to nothing', () => {
  // No logo field: the curated map used by the profile marks still applies.
  const curated = microGraphNodeArt({ id: 'startup:openai', kind: 'startup', name: 'OpenAI' }, 0, 0, 17);
  assert.ok(curated.includes('href="./assets/logos/openai.svg"'));
  // No artwork anywhere: empty string, so the caller renders initials.
  assert.equal(microGraphNodeArt({ id: 'partner:fund', kind: 'partner', name: 'Fund Co' }, 0, 0, 17), '');
  assert.equal(microGraphNodeArt({ id: 'person:ada', kind: 'person', name: 'Ada Lovelace' }, 0, 0, 17), '');
});

test('micro graph node art resolves the published example records', async () => {
  const published = JSON.parse(await readFile(new URL('../data/graph.json', import.meta.url), 'utf8'));
  const byId = new Map(published.entities.map(item => [item.id, item]));
  assert.ok(microGraphNodeArt(byId.get('person:cielo-nicolosi'), 0, 0, 17)
    .includes('href="./assets/portraits/cielo-nicolosi.png"'));
  assert.ok(microGraphNodeArt(byId.get('startup:alloovium'), 0, 0, 17)
    .includes('href="./assets/logos/alloovium.png"'));
});

test('micro graph reads the published graph without inventing neighbours', async () => {
  const published = JSON.parse(await readFile(new URL('../data/graph.json', import.meta.url), 'utf8'));
  const model = microGraphNeighbours(published, 'startup:canva');
  assert.ok(model.total > 0);
  assert.ok(model.neighbours.length <= MICRO_GRAPH_CAP);
  const ids = new Set(published.entities.map(item => item.id));
  for (const item of model.neighbours) assert.ok(ids.has(item.entity.id));
});
