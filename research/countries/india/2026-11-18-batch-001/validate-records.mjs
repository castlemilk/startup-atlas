#!/usr/bin/env node
// Country-local verification only; imports the unchanged production validator.
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {validateStartupRecord, startupSlug} from '../../../../backend/hosted/src/startup-record.mjs';

const packet = JSON.parse(readFileSync(new URL('./startup-records.json', import.meta.url), 'utf8'));
const ids = new Set();
for (const record of packet.startups) {
  validateStartupRecord(record);
  assert(record.website && record.description, `${record.name}: new record needs website and description`);
  const id = startupSlug(record.name);
  assert(!ids.has(id), `${record.name}: normalized identifier collision`);
  ids.add(id);
}
const example = structuredClone(packet.startups.find(r => r.funding_rounds?.some(f => f.amount)));
const event = example.funding_rounds.find(f => f.amount);
delete event.currency;
assert.throws(() => validateStartupRecord(example), /requires amount and currency together/);
const nullYear = {...packet.startups[0], founded_year:null};
assert.throws(() => validateStartupRecord(nullYear), /founded_year/);
const typedParticipants = {...packet.startups[0], investors:[]};
assert.throws(() => validateStartupRecord(typedParticipants), /not supported/);
console.log(JSON.stringify({valid:true, schema:'backend/hosted/src/startup-record.mjs', records:packet.startups.length, negative_contract_checks:3, production_writes:0}));
