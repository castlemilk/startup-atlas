import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { validateStartupRecord, startupSlug } from '../../../../backend/hosted/src/startup-record.mjs';

const packetDir = new URL('./', import.meta.url);
const projection = JSON.parse(fs.readFileSync(new URL('startup-records.json', packetDir), 'utf8'));
const companies = JSON.parse(fs.readFileSync(new URL('companies.json', packetDir), 'utf8')).companies;
const errors = [];
for (const record of projection.records) {
  try {
    validateStartupRecord(record);
    const company = companies.find(c => c.name === record.name);
    if (!company || company.proposed_entity_id !== `startup:${startupSlug(record.name)}`) {
      errors.push(`${record.name}: proposed identifier differs from production startupSlug`);
    }
  } catch (error) {
    errors.push(`${record.name}: ${error.message}`);
  }
}
const result = {
  valid: errors.length === 0,
  records: projection.records.length,
  funding_events: projection.records.reduce((n, r) => n + (r.funding_rounds || []).length, 0),
  validator: 'backend/hosted/src/startup-record.mjs#validateStartupRecord',
  errors,
  note: 'Calls the unmodified production validator. Validation does not publish or independently verify source truth.'
};
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
process.exitCode = errors.length ? 1 : 0;
