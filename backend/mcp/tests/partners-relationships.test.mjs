// Partner `aliases` / `relationships` validation (backend/mcp/partners.mjs,
// docs/KG-CONNECTIVE-TISSUE.md §3): the fields are optional, shape-checked,
// and persisted verbatim by an upsert; malformed entries are rejected.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PartnerStore } from '../partners.mjs';

async function fixtureRepo(t) {
  const dir = await mkdtemp(path.join(tmpdir(), 'atlas-partner-relationships-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(path.join(dir, 'data'));
  await writeFile(path.join(dir, 'data/partner-leads.json'), JSON.stringify(['Example Fund', 'Example Network']) + '\n');
  await writeFile(path.join(dir, 'data/partners-reviewed.json'), JSON.stringify({}) + '\n');
  return dir;
}

const base = {
  website: 'https://fund.example.com/', description: 'An example fund for relationship validation.',
  source: 'https://fund.example.com/', reviewed_at: '2026-11-24',
};
const relationship = {
  type: 'member_of_network', target: 'partner:example-network',
  note: 'Member of the Example Network since 2020.', source: 'https://network.example.com/members',
};

test('aliases and relationships validate and persist through an upsert', async (t) => {
  const dir = await fixtureRepo(t);
  const store = new PartnerStore(dir, { writeEnabled: true });
  const record = { ...base, aliases: ['Example', 'Example VC'], relationships: [relationship] };
  const validated = await store.validate('Example Fund', record);
  const saved = await store.upsert('Example Fund', record, validated.revision);
  assert.equal(saved.status, 'saved');
  const persisted = JSON.parse(await readFile(path.join(dir, 'data/partners-reviewed.json'), 'utf8'));
  assert.deepEqual(persisted['Example Fund'].aliases, ['Example', 'Example VC']);
  assert.deepEqual(persisted['Example Fund'].relationships, [relationship]);
});

test('relationship entries accept an optional reviewed_at', async (t) => {
  const dir = await fixtureRepo(t);
  const store = new PartnerStore(dir, { writeEnabled: true });
  const record = { ...base, relationships: [{ ...relationship, reviewed_at: '2026-11-20' }] };
  const validated = await store.validate('Example Fund', record);
  assert.equal(validated.name, 'Example Fund');
});

test('unknown relationship type is rejected', async (t) => {
  const dir = await fixtureRepo(t);
  const store = new PartnerStore(dir, { writeEnabled: true });
  const record = { ...base, relationships: [{ ...relationship, type: 'owned_by' }] };
  await assert.rejects(store.validate('Example Fund', record), { code: 'VALIDATION_ERROR' });
});

test('non-canonical relationship target is rejected', async (t) => {
  const dir = await fixtureRepo(t);
  const store = new PartnerStore(dir, { writeEnabled: true });
  const record = { ...base, relationships: [{ ...relationship, target: 'Example Network' }] };
  await assert.rejects(store.validate('Example Fund', record), { code: 'VALIDATION_ERROR' });
});

test('relationship with an unknown key or insecure source is rejected', async (t) => {
  const dir = await fixtureRepo(t);
  const store = new PartnerStore(dir, { writeEnabled: true });
  await assert.rejects(
    store.validate('Example Fund', { ...base, relationships: [{ ...relationship, extra: true }] }),
    { code: 'VALIDATION_ERROR' });
  await assert.rejects(
    store.validate('Example Fund', { ...base, relationships: [{ ...relationship, source: 'http://network.example.com/members' }] }),
    { code: 'VALIDATION_ERROR' });
});

test('malformed aliases are rejected', async (t) => {
  const dir = await fixtureRepo(t);
  const store = new PartnerStore(dir, { writeEnabled: true });
  await assert.rejects(store.validate('Example Fund', { ...base, aliases: 'Example' }), { code: 'VALIDATION_ERROR' });
  await assert.rejects(store.validate('Example Fund', { ...base, aliases: [''] }), { code: 'VALIDATION_ERROR' });
});
