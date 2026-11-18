#!/usr/bin/env node
// Read-only bridge to the production validator. No duplicate production schema.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { validateStartupRecord } from '../../../../backend/hosted/src/startup-record.mjs';

const errors = [];
let records = [];
try {
  if (process.argv.length > 3 || (process.argv[2] && process.argv[2] !== '--stdin')) {
    throw new Error('Usage: node validate_legacy.mjs [--stdin]');
  }
  const input = process.argv[2] === '--stdin'
    ? fs.readFileSync(0, 'utf8')
    : fs.readFileSync(fileURLToPath(new URL('./records.staged.json', import.meta.url)), 'utf8');
  const document = JSON.parse(input);
  if (!document || !Array.isArray(document.startups)) throw new Error('startups must be an array');
  records = document.startups;
  for (const [index, record] of records.entries()) {
    try { validateStartupRecord(record); }
    catch (error) { errors.push({index, name:record?.name ?? null, message:error.message}); }
  }
} catch (error) {
  errors.push({message:error.message});
}
const result = {
  valid:errors.length === 0,
  records:records.length,
  schema_source:'backend/hosted/src/startup-record.mjs',
  errors,
};
process.stdout.write(`${JSON.stringify(result)}\n`);
if (!result.valid) process.exitCode = 1;
