#!/usr/bin/env node
/** Offline validation of this country packet using the existing production validator. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {validateStartupRecord, startupSlug} from '../../../../backend/hosted/src/startup-record.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const args=process.argv.slice(2);
let packet=here, out=null;
for(let i=0;i<args.length;i++){
  if(args[i]==='--packet')packet=path.resolve(args[++i]);
  else if(args[i]==='--out')out=path.resolve(args[++i]);
  else throw new Error(`Unknown argument: ${args[i]}`);
}
const checks=[];
function check(name,fn){
  try {fn();checks.push({name,status:'passed'});}
  catch(error){checks.push({name,status:'failed',message:error.message});}
}
function mustReject(name,fn){
  check(name,()=>{let rejected=false;try{fn();}catch{rejected=true;}if(!rejected)throw new Error('Invalid record was accepted.');});
}
let records=[];
check('records.json contains a bounded, nonempty startups array',()=>{
  const parsed=JSON.parse(fs.readFileSync(path.join(packet,'records.json'),'utf8'));
  if(!Array.isArray(parsed.startups)||parsed.startups.length<1||parsed.startups.length>50)throw new Error('Expected 1..50 staged startup records.');
  records=parsed.startups;
});
for(const record of records){
  check(`production validator: ${record.name}`,()=>{
    validateStartupRecord(record);
    if(!record.website||!record.description)throw new Error('A new company requires website and description.');
    if(Object.hasOwn(record,'founded_year')&&record.founded_year===0)throw new Error('Unknown founding year must be absent, never zero.');
    function noNull(v,p='record'){
      if(v===null)throw new Error(`Null is unsupported in production projection at ${p}.`);
      if(Array.isArray(v))v.forEach((x,i)=>noNull(x,`${p}[${i}]`));
      else if(typeof v==='object')for(const [k,x] of Object.entries(v))noNull(x,`${p}.${k}`);
    }
    noNull(record);
  });
}
check('projected company IDs are unique',()=>{
  const ids=records.map(r=>`startup:${startupSlug(r.name)}`);
  if(new Set(ids).size!==ids.length)throw new Error('Company name normalization produces duplicate IDs.');
});
check('funding IDs are globally unique across projected companies',()=>{
  const ids=records.flatMap(r=>(r.funding_rounds||[]).map(e=>e.id));
  if(new Set(ids).size!==ids.length)throw new Error('Funding event ID repeated across companies.');
});
const fixture=()=>({name:'Packet Validator Fixture',description:'Synthetic offline validator fixture.',website:'https://example.com/',source:'https://example.com/about',reviewed_at:'2025-01-01',funding_rounds:[{id:'packet-validator-fixture-seed',stage:'Seed',source:'https://example.com/funding',announced_on:'2024-02-29'}]});
mustReject('reject null founding year',()=>validateStartupRecord({...fixture(),founded_year:null}));
mustReject('reject null funding amount',()=>{const r=fixture();r.funding_rounds[0].amount=null;r.funding_rounds[0].currency='EUR';validateStartupRecord(r);});
mustReject('reject invalid calendar date',()=>{const r=fixture();r.funding_rounds[0].announced_on='2025-02-29';validateStartupRecord(r);});
mustReject('reject partial day date in production field',()=>{const r=fixture();r.funding_rounds[0].announced_on='2024-02';validateStartupRecord(r);});
mustReject('reject amount without currency',()=>{const r=fixture();r.funding_rounds[0].amount=1000000;validateStartupRecord(r);});
mustReject('reject currency without numeric amount',()=>{const r=fixture();r.funding_rounds[0].currency='EUR';validateStartupRecord(r);});
mustReject('reject decimal numeric major-unit amount',()=>{const r=fixture();r.funding_rounds[0].amount=1.5;r.funding_rounds[0].currency='EUR';validateStartupRecord(r);});
mustReject('reject duplicate funding IDs',()=>{const r=fixture();r.funding_rounds.push({...r.funding_rounds[0]});validateStartupRecord(r);});
mustReject('reject duplicate profile fact keys',()=>{const r=fixture();const f={key:'headquarters',label:'Headquarters',value:'Example city',source:r.source,reviewed_at:r.reviewed_at};r.profile_facts=[f,{...f}];validateStartupRecord(r);});
mustReject('reject unsupported schema expansion',()=>validateStartupRecord({...fixture(),round_participants:[]}));
mustReject('reject unsupported top-level aliases',()=>validateStartupRecord({...fixture(),aliases:['Fixture']}));
mustReject('reject insecure source URL',()=>validateStartupRecord({...fixture(),source:'http://example.com/about'}));
check('unknown funding amount remains absent through actual validation',()=>{
  const r=fixture();const before=JSON.stringify(r);const result=validateStartupRecord(r);
  if(Object.hasOwn(result.funding_rounds[0],'amount')||Object.hasOwn(result.funding_rounds[0],'currency'))throw new Error('Unknown money was materialized.');
  if(before!==JSON.stringify(r))throw new Error('Validator mutated input.');
});
const validatorPath=new URL('../../../../backend/hosted/src/startup-record.mjs',import.meta.url);
const report={validation_kind:'offline_country_record_projection',checked_at:new Date().toISOString(),production_validator:'backend/hosted/src/startup-record.mjs',production_validator_sha256:crypto.createHash('sha256').update(fs.readFileSync(validatorPath)).digest('hex'),record_count:records.length,checks_passed:checks.filter(x=>x.status==='passed').length,checks_failed:checks.filter(x=>x.status==='failed').length,checks,limitations:['Schema validation does not verify source truth or completeness.','Python packet checks additionally reject duplicate JSON object keys and compare null/precision/provenance with the claim ledger.','No production data, crawler sources, API schemas, deployment or runtime behavior changed.']};
if(out){fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify(report,null,2));
if(report.checks_failed)process.exitCode=1;
