#!/usr/bin/env node
// Offline schema checks. Import the production validator; do not copy its schema.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  validateStartupRecord, startupRecordSchema, startupSlug,
} from '../../../../backend/hosted/src/startup-record.mjs';

const schemaPath = fileURLToPath(new URL('../../../../backend/hosted/src/startup-record.mjs', import.meta.url));
const inputPath = process.argv[2] || fileURLToPath(new URL('./startup-records.json', import.meta.url));
const sha256 = value => createHash('sha256').update(value).digest('hex');
const document = JSON.parse(readFileSync(inputPath, 'utf8'));
assert.ok(Array.isArray(document.startups), 'Expected the staged startups array.');
assert.ok(document.startups.length > 0, 'An empty packet is not successful record validation.');
const checked = [];
for (const record of document.startups) {
  const before = JSON.stringify(record);
  validateStartupRecord(record);
  assert.equal(JSON.stringify(record), before, 'Schema validation must not mutate input.');
  checked.push({ name: record.name, proposed_graph_id: `startup:${startupSlug(record.name)}` });
}

const positive = {
  name: 'Validation Fixture', source: 'https://source.example.com/announcement',
  reviewed_at: '2020-01-02', website: 'https://example.com/',
};
const round = { id: 'fixture-seed', stage: 'Seed', source: positive.source };
const negativeFixtures = [
  ['missing required name', r => { delete r.name; }],
  ['blank name', r => { r.name = ' '; }],
  ['untrimmed name', r => { r.name = ' Fixture'; }],
  ['unsupported headquarters field', r => { r.headquarters = 'Dubai'; }],
  ['undefined description', r => { r.description = undefined; }],
  ['null founded year', r => { r.founded_year = null; }],
  ['zero is not an unknown founding year', r => { r.founded_year = 0; }],
  ['future founded year', r => { r.founded_year = new Date().getUTCFullYear() + 1; }],
  ['HTTP source', r => { r.source = 'http://source.example.com/'; }],
  ['credential-bearing URL', r => { r.website = 'https://user:password@example.com/'; }],
  ['nonpublic website', r => { r.website = 'https://127.0.0.1/'; }],
  ['unpaired logo source', r => { r.logo = 'https://example.com/logo.png'; }],
  ['founder without source', r => { r.founders = [{ name: 'Fixture Founder' }]; }],
  ['normalized duplicate founders', r => { r.founders = [
    { name: 'Sarah Toukan', source: r.source },
    { name: 'ＳＡＲＡＨ  ＴＯＵＫＡＮ', source: r.source },
  ]; }],
  ['unpaired founder photo', r => { r.founders = [{ name: 'Founder', source: r.source, photo_url: 'https://example.com/photo.png' }]; }],
  ['duplicate funding IDs', r => { r.funding_rounds = [{ ...round }, { ...round }]; }],
  ['amount without currency', r => { r.funding_rounds = [{ ...round, amount: 100 }]; }],
  ['currency without amount', r => { r.funding_rounds = [{ ...round, currency: 'USD' }]; }],
  ['null amount is omitted in projection', r => { r.funding_rounds = [{ ...round, amount: null, currency: 'USD' }]; }],
  ['negative amount', r => { r.funding_rounds = [{ ...round, amount: -1, currency: 'USD' }]; }],
  ['fractional amount', r => { r.funding_rounds = [{ ...round, amount: 0.5, currency: 'USD' }]; }],
  ['unsafe amount', r => { r.funding_rounds = [{ ...round, amount: Number.MAX_SAFE_INTEGER + 1, currency: 'USD' }]; }],
  ['lowercase currency', r => { r.funding_rounds = [{ ...round, amount: 100, currency: 'usd' }]; }],
  ['unpaired valuation', r => { r.funding_rounds = [{ ...round, valuation: 100 }]; }],
  ['month is not an exact announcement day', r => { r.funding_rounds = [{ ...round, announced_on: '2020-02' }]; }],
  ['invalid calendar day', r => { r.funding_rounds = [{ ...round, announced_on: '2020-02-30' }]; }],
  ['unsupported funding participants array', r => { r.funding_rounds = [{ ...round, participants: [] }]; }],
  ['duplicate profile facts', r => { const f = { key: 'fact', label: 'Fact', value: 'Value', source: r.source, reviewed_at: r.reviewed_at }; r.profile_facts = [f, { ...f }]; }],
];
validateStartupRecord(positive);
validateStartupRecord({ ...positive, funding_rounds: [{ ...round, amount_text: 'Undisclosed' }] });
validateStartupRecord({ ...positive, funding_rounds: [{ ...round, amount: 100, currency: 'USD' }] });
for (const [label, change] of negativeFixtures) {
  const record = structuredClone(positive);
  change(record);
  assert.throws(() => validateStartupRecord(record), error => error.code === 'VALIDATION_ERROR', label);
}
assert.equal(startupSlug('  Éyewa  '), 'eyewa');
assert.equal(startupSlug('A-B'), startupSlug('A B'), 'Slug equivalence must be treated as a collision signal.');
assert.equal(startupSlug('Stake'), 'stake');
process.stdout.write(JSON.stringify({
  status: 'passed', validator: 'backend/hosted/src/startup-record.mjs',
  validator_sha256: sha256(readFileSync(schemaPath)),
  records_validated: checked.length, records: checked,
  positive_fixture_count: 3, negative_fixture_count: negativeFixtures.length,
  negative_fixtures: negativeFixtures.map(([name]) => name),
  actual_schema_top_level_fields: Object.keys(startupRecordSchema.properties),
  scope: 'Every staged startup record is checked by the existing production validator. No schema, API, graph or production data is changed.',
}, null, 2) + '\n');
