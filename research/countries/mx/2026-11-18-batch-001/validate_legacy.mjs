import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { validateStartupRecord, startupRecordSchema, startupSlug } from '../../../../backend/hosted/src/startup-record.mjs';

const directory=path.dirname(fileURLToPath(import.meta.url));
const overlay=JSON.parse(fs.readFileSync(path.join(directory,'startups.staged.json'),'utf8'));
const errors=[];
for(const record of overlay.startups){
  try{validateStartupRecord(record);}catch(error){errors.push({name:record.name,error:error.message});}
}
const base={name:'Validation specimen',source:'https://example.com/source',reviewed_at:'2026-11-18'};
const invalid=[
  {...base,founded_year:null},
  {...base,founded_year:0},
  {...base,headquarters:'Mexico City'},
  {...base,funding_rounds:[{id:'test',stage:'Series A',source:base.source,amount:100}]},
  {...base,funding_rounds:[{id:'test',stage:'Series A',source:base.source,currency:'USD'}]},
  {...base,funding_rounds:[{id:'test',stage:'Series A',source:base.source,announced_on:'2021'}]},
  {...base,funding_rounds:[{id:'test',stage:'Series A',source:base.source,announced_on:'2021-07'}]},
  {...base,founders:[{name:'Founder without provenance'}]},
];
for(const specimen of invalid)assert.throws(()=>validateStartupRecord(specimen));
assert.equal(startupSlug('Jüsto'),startupSlug('Justo'));
assert.equal(startupSlug('Konfío'),startupSlug('Konfio'));
assert.equal(startupRecordSchema.additionalProperties,false);
const result={valid:errors.length===0,records:overlay.startups.length,errors,negative_cases_rejected:invalid.length,normalization_cases_passed:2,schema:'backend/hosted/src/startup-record.mjs',warning:'Existing production schema validation only; no API submission or publication.'};
console.log(JSON.stringify(result,null,2));
if(errors.length)process.exitCode=1;
