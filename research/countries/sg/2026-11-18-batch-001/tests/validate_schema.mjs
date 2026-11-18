#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const packet = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repo = path.resolve(packet, '../../../..');
const {validateStartupRecord, startupSlug} = await import(pathToFileURL(path.join(repo, 'backend/hosted/src/startup-record.mjs')));
const load = file => JSON.parse(fs.readFileSync(path.join(packet, file), 'utf8'));
const startups = load('staging/startup-records.json');
const alumni = load('staging/alumni-records.json');
const failures = [];
for (const record of [...startups, ...alumni]) {
  try {validateStartupRecord(record);} catch (error) {failures.push({name: record.name, error: error.message});}
}
const negativeCases = [
  ['null optional year', r => {r.founded_year = null;}],
  ['unsupported country field', r => {r.country_code = 'SG';}],
  ['currency missing for amount', r => {r.funding_rounds = [{id:'fixture-round',stage:'Seed',amount:100,source:r.source}];}],
  ['date precision inflated or partial', r => {r.funding_rounds = [{id:'fixture-round',stage:'Seed',announced_on:'2023-02',source:r.source}];}],
  ['unsupported round participants', r => {r.funding_rounds = [{id:'fixture-round',stage:'Seed',source:r.source,participants:[]}];}],
  ['null numeric unknown', r => {r.funding_rounds = [{id:'fixture-round',stage:'Seed',source:r.source,amount:null,currency:null}];}],
  ['duplicate founder identity', r => {r.founders = [{name:'Same Person',source:r.source},{name:'same person',source:r.source}];}],
];
let rejected = 0;
for (const [label, mutate] of negativeCases) {
  const record = structuredClone(startups[0]);
  mutate(record);
  try {validateStartupRecord(record); failures.push({negative_case:label,error:'Malformed fixture unexpectedly accepted'});} catch {rejected++;}
}
assert.equal(startupSlug('Coda'), 'coda');
assert.equal(startupSlug('Horizon Quantum'), 'horizon-quantum');
const result = {valid: failures.length === 0, schema_module:'backend/hosted/src/startup-record.mjs', startup_records:startups.length, alumni_records:alumni.length, negative_cases:negativeCases.length, malformed_records_rejected:rejected, failures, scope:'Uses the unchanged repository validator. Structural validity is not source-truth or production-import approval.'};
process.stdout.write(JSON.stringify(result, null, 2) + '\n');
process.exitCode = result.valid ? 0 : 1;
