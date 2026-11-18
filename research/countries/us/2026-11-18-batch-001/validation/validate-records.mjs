#!/usr/bin/env node
// Validate staged projections with the unchanged production record contract.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateStartupRecord} from '../../../../../backend/hosted/src/startup-record.mjs';

const directory = process.argv[2] ? path.resolve(process.argv[2]) : fileURLToPath(new URL('../', import.meta.url));
const files = ['atlas-records.json', 'withheld-records.json'];
const receipt = {valid:true, validator:'backend/hosted/src/startup-record.mjs:validateStartupRecord', files:[], errors:[]};
for (const filename of files) {
  try {
    const packet = JSON.parse(fs.readFileSync(path.join(directory, filename), 'utf8'));
    if (!Array.isArray(packet.startups)) throw new Error('startups must be an array');
    let validated = 0;
    for (const [index, record] of packet.startups.entries()) {
      try { validateStartupRecord(record); validated++; }
      catch(error) {receipt.errors.push({file:filename, index, name:record?.name, message:error.message});}
    }
    receipt.files.push({file:filename, records:packet.startups.length, validated});
  } catch(error) {receipt.errors.push({file:filename, message:error.message});}
}
receipt.valid = receipt.errors.length === 0;
console.log(JSON.stringify(receipt));
process.exitCode = receipt.valid ? 0 : 1;
