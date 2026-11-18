// Use the existing production validator; this is a country-local offline receipt.
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import {validateStartupRecord,startupSlug} from '../../../../backend/hosted/src/startup-record.mjs';
const here=dirname(fileURLToPath(import.meta.url));
const errors=[];const results={};const names=new Set();
for(const file of ['startup-records.json','boundary-records.json']) {
 const records=JSON.parse(readFileSync(resolve(here,file),'utf8')).startups;
 for(const record of records) {
  try { validateStartupRecord(record); } catch(error) { errors.push({file,name:record.name,error:error.message}); }
  const id=startupSlug(record.name);
  if(names.has(id)) errors.push({file,name:record.name,error:'Duplicate projected startup slug'});
  names.add(id);
 }
 results[file]=records.length;
}
console.log(JSON.stringify({valid:errors.length===0,schema:'backend/hosted/src/startup-record.mjs',records:results,errors},null,2));
process.exitCode=errors.length?1:0;
