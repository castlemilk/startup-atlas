import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {validateStartupRecord, startupSlug} from '../../../../backend/hosted/src/startup-record.mjs';

const load = async name => JSON.parse(await readFile(new URL(name, import.meta.url), 'utf8'));
const {startups} = await load('production-projection.json');
const {companies} = await load('companies.json');
const baseline = await load('dedup-baseline.json');
const {claims} = await load('claims.json');
const {entries: mappings} = await load('projection-map.json');
const {sources} = await load('sources.json');

test('Every proposed record validates against the unchanged production validator', () => {
  for (const record of startups) {
    assert.equal(validateStartupRecord(record), record);
    assert.ok(record.website && record.description);
  }
});

test('Canonical proposed IDs are unique and absent from the pinned source graph', () => {
  const ids = startups.map(r => `startup:${startupSlug(r.name)}`);
  assert.equal(new Set(ids).size, ids.length);
  const existing = new Set(baseline.startups.map(r => r.id));
  assert.ok(ids.every(id => !existing.has(id)));
});

test('Every projected field group maps to existing claims and avoids held sources', () => {
  const byId = new Map(claims.map(c => [c.claim_id,c]));
  const held = new Set(sources.filter(s => s.rights_or_access_review_required).map(s => s.url));
  for (const mapping of mappings) {
    for (const field of mapping.mapped_fields) {
      assert.ok(field.claim_ids.length > 0, `${mapping.name} ${field.field}`);
      assert.ok(!held.has(field.source_url));
      for (const id of field.claim_ids) {
        assert.equal(byId.get(id)?.entity_id,mapping.staging_entity_id);
      }
    }
  }
});

test('Missing optional values are omitted; null and unmodelled fields stay in evidence', () => {
  for (const record of startups) {
    assert.ok(!Object.values(record).includes(null));
    assert.equal(record.headquarters, undefined);
    assert.equal(record.investors, undefined);
    for (const event of record.funding_rounds ?? []) {
      assert.equal(event.participants, undefined);
      assert.equal(Object.hasOwn(event,'amount'),Object.hasOwn(event,'currency'));
      if (Object.hasOwn(event,'amount')) assert.ok(event.amount > 0);
    }
  }
  const sample = startups[0];
  assert.throws(() => validateStartupRecord({...sample,founded_year:null}), {code:'VALIDATION_ERROR'});
  assert.throws(() => validateStartupRecord({...sample,investors:[]}), {code:'VALIDATION_ERROR'});
});

test('Projection creates no unsupported investor edges, assets or contact data', () => {
  for (const record of startups) {
    assert.equal(record.relationships, undefined);
    assert.equal(record.logo, undefined);
    for (const founder of record.founders ?? []) {
      assert.deepEqual(Object.keys(founder).sort(), ['name','source']);
    }
  }
});

test('Conflict and imprecise observations do not acquire fake exact dates or amounts', () => {
  for (const company of companies) {
    const record = startups.find(r => r.name === company.name);
    if (!record) continue;
    for (const event of record.funding_rounds ?? []) {
      const observation = company.funding_events.find(e => e.id === event.id);
      assert.ok(observation);
      if (event.announced_on) assert.equal(observation.date_precision,'day');
      if (event.amount !== undefined) {
        assert.equal(observation.amount,event.amount);
        assert.equal(observation.currency,event.currency);
        assert.equal(observation.amount_precision,'exact');
      }
      if (event.valuation !== undefined && observation.valuation_type) {
        assert.ok(event.note.includes(observation.valuation_type.replaceAll('_','-')));
      }
    }
  }
});
