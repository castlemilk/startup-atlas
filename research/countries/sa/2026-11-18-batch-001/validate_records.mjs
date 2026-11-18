import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const repo = path.resolve(process.argv[2] || '.');
const packet = path.dirname(new URL(import.meta.url).pathname);
const {validateStartupRecord, mergeStartup, startupSlug, startupRecordSchema} = await import(pathToFileURL(path.join(repo,'backend/hosted/src/startup-record.mjs')));
const projection = JSON.parse(fs.readFileSync(path.join(packet,'startups.json'),'utf8'));
const existing = JSON.parse(fs.readFileSync(path.join(repo,'data/startup-research.json'),'utf8')).startups;
const all = new Map(existing.map(x=>[startupSlug(x.name),x]));
const rounds=new Set(existing.flatMap(x=>(x.funding_rounds||[]).map(r=>r.id)));
let checked=0;
for(const record of projection.startups){
  validateStartupRecord(record);
  const key=startupSlug(record.name);
  if(all.has(key)) throw new Error(`New-record projection collides with ${all.get(key).name}`);
  for(const r of record.funding_rounds||[]){if(rounds.has(r.id))throw new Error(`Round ID collision ${r.id}`); rounds.add(r.id);}
  all.set(key,record);checked++;
}
const adversarial=[];
const sample=projection.startups[0];
function rejects(name,mutate){let rejected=false;try{validateStartupRecord(mutate(structuredClone(sample)));}catch{rejected=true;}if(!rejected)throw new Error(`Expected rejection: ${name}`);adversarial.push(name);}
rejects('null founding year is not coerced to zero',x=>({...x,founded_year:null}));
rejects('unsupported headquarters field is not silently expanded',x=>({...x,headquarters:'Riyadh'}));
rejects('partial funding day is not padded',x=>({...x,funding_rounds:[{id:'adversarial-date',stage:'Seed',announced_on:'2024-01',source:x.source}]}));
rejects('amount without currency is invalid',x=>({...x,funding_rounds:[{id:'adversarial-money',stage:'Seed',amount:100,source:x.source}]}));
rejects('duplicate founder normalization is rejected',x=>({...x,founders:[{name:'Example Person',source:x.source},{name:'EXAMPLE  PERSON',source:x.source}]}));
rejects('typed participants remain outside legacy schema',x=>({...x,funding_rounds:[{id:'adversarial-participant',stage:'Seed',source:x.source,participants:['Example Fund']}]}));
const preserved=mergeStartup({name:'Example',source:'https://example.com/',reviewed_at:'2026-11-18',founders:[{name:'Example Person',source:'https://example.com/founder'}]},{profile_facts:[{key:'place',label:'Place',value:'Riyadh',source:'https://example.com/place',reviewed_at:'2026-11-18'}]});
if(preserved.founders.length!==1||preserved.source!=='https://example.com/')throw new Error('Merge omitted-field preservation failed');
const output={valid:true,validator:'backend/hosted/src/startup-record.mjs::validateStartupRecord',projection_records:checked,existing_overlay_records:existing.length,adversarial_checks:adversarial.length,adversarial,omitted_field_merge_preservation:true,additional_properties:startupRecordSchema.additionalProperties,warning:'Shape and collision checks only. No network, proposal, merge, or publication.'};
console.log(JSON.stringify(output,null,2));
