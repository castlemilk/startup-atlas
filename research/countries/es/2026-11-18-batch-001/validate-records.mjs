import fs from 'node:fs';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {startupRecordSchema, validateStartupRecord, startupSlug} from '../../../../backend/hosted/src/startup-record.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const records = JSON.parse(fs.readFileSync(path.join(here, 'startups.json'), 'utf8')).startups;
for (const record of records) validateStartupRecord(record);
assert.equal(new Set(records.map(r => startupSlug(r.name))).size, records.length);
const base = structuredClone(records[0]);
const invalid = [
  {...base, source: 'http://example.org'},
  {...base, founded_year: 0},
  {...base, founded_year: null},
  {...base, headquarters: 'Madrid'},
  {...base, funding_rounds: [{id:'test-unpaired',stage:'Series A',source:base.source,amount:1}]},
  {...base, funding_rounds: [{id:'test-month',stage:'Series A',source:base.source,announced_on:'2026-09'}]},
  {...base, funding_rounds: [{id:'test-participant',stage:'Series A',source:base.source,participants:[{name:'Unresolved'}]}]},
];
for (const record of invalid) assert.throws(() => validateStartupRecord(record));
if (process.argv.includes('--schema')) process.stdout.write(JSON.stringify(startupRecordSchema));
else process.stdout.write(JSON.stringify({valid:true,records:records.length,negative_fixtures:invalid.length,validator:'backend/hosted/src/startup-record.mjs'})+'\n');
