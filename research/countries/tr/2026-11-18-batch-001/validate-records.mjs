// Read-only validation against the repository's accepted startup contract.
// This file neither writes the overlay nor invokes a proposal or crawler.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateStartupRecord, startupRecordSchema, startupSlug } from '../../../../backend/hosted/src/startup-record.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const packet = JSON.parse(fs.readFileSync(path.join(here, 'startup-records.json'), 'utf8'));
const seen = new Set();
const events = new Set();
for (const record of packet.startups) {
  validateStartupRecord(record);
  const id = `startup:${startupSlug(record.name)}`;
  if (seen.has(id)) throw new Error(`Duplicate projected identity: ${id}`);
  seen.add(id);
  for (const round of record.funding_rounds || []) {
    if (events.has(round.id)) throw new Error(`Duplicate projected event: ${round.id}`);
    events.add(round.id);
  }
}
if (packet.startups.length > 50) throw new Error('Country batch exceeds the requested 50-record ceiling.');
if (process.argv.includes('--schema')) console.log(JSON.stringify(startupRecordSchema, null, 2));
else console.log(JSON.stringify({valid:true, records:seen.size, funding_events:events.size,
  validator:'backend/hosted/src/startup-record.mjs', production_write:false,
  note:'Accepted-record shape only; source review remains separate.'}, null, 2));
