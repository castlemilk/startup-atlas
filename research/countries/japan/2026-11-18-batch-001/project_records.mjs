// Rebuild the two staged projections and complete field-to-claim map offline.
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateStartupRecord} from '../../../../backend/hosted/src/startup-record.mjs';
import {derive, factLabels, leaves} from './projection_rules.mjs';

const here=dirname(fileURLToPath(import.meta.url));
const packet=JSON.parse(readFileSync(resolve(here,'companies.json'),'utf8'));
const records=[], alumni=[], mappings=[];
for(const company of packet.companies) {
  if(!['accepted','alumni'].includes(company.disposition)) continue;
  const record={}, mapping={name:company.name,company_id:company.id,disposition:company.disposition,fields:{},bindings:{},research_only_claim_ids:[]};
  const bind=(object,key,pointer,claim,operation='claim_value',path=[]) => {
    const b={claim_id:claim.id,operation};
    if(path.length) b.path=path;
    if(operation==='source_url') b.source_id=claim.source_ids[0];
    object[key]=derive(b,company,packet);
    mapping.fields[pointer]=[claim.id]; mapping.bindings[pointer]=b;
  };
  const one=field=>company.claims.find(c=>c.field===field);
  const identity=one('canonical_name');
  assert(identity);
  bind(record,'name','/name',identity);
  bind(record,'source','/source',identity,'source_url');
  bind(record,'reviewed_at','/reviewed_at',identity,'review_date');
  for(const field of ['description','website']) if(one(field)) bind(record,field,`/${field}`,one(field));
  const founded=one('founded');
  if(founded?.value.date && !['business_commencement','holding_company_establishment'].includes(founded.value.kind)
      && !company.conflicts.some(x=>['founding','founding_date','legal_identity_and_founding'].includes(x.field))) {
    bind(record,'founded_year','/founded_year',founded,'founded_year');
  }
  const founders=company.claims.filter(c=>c.field==='founder');
  if(founders.length) {
    record.founders=[];
    for(const claim of founders) {
      const i=record.founders.length, founder={};
      bind(founder,'name',`/founders/${i}/name`,claim,'claim_value',['name']);
      bind(founder,'source',`/founders/${i}/source`,claim,'source_url');
      record.founders.push(founder);
    }
  }
  const rounds=company.claims.filter(c=>c.field==='funding_round');
  if(rounds.length) {
    record.funding_rounds=[];
    for(const claim of rounds) {
      const e=claim.value,i=record.funding_rounds.length,r={};
      bind(r,'id',`/funding_rounds/${i}/id`,claim,'claim_value',['id']);
      bind(r,'stage',`/funding_rounds/${i}/stage`,claim,'round_stage');
      bind(r,'source',`/funding_rounds/${i}/source`,claim,'source_url');
      if(e.date_precision==='day' && e.date_kind==='announcement') bind(r,'announced_on',`/funding_rounds/${i}/announced_on`,claim,'claim_value',['date']);
      if(e.numeric_projection_allowed) for(const key of ['amount','currency']) bind(r,key,`/funding_rounds/${i}/${key}`,claim,'claim_value',[key]);
      bind(r,'amount_text',`/funding_rounds/${i}/amount_text`,claim,'round_amount_text');
      bind(r,'note',`/funding_rounds/${i}/note`,claim,'round_note');
      record.funding_rounds.push(r);
    }
  }
  const facts=company.claims.filter(c=>Object.hasOwn(factLabels,c.field));
  if(facts.length) {
    record.profile_facts=[];
    for(const claim of facts) {
      const i=record.profile_facts.length,fact={};
      for(const [key,operation] of [['key','fact_key'],['label','fact_label'],['value','fact_value'],['source','source_url'],['reviewed_at','review_date']])
        bind(fact,key,`/profile_facts/${i}/${key}`,claim,operation);
      record.profile_facts.push(fact);
    }
  }
  const mapped=new Set(Object.values(mapping.fields).flat());
  mapping.research_only_claim_ids=company.claims.filter(c=>!mapped.has(c.id)).map(c=>c.id);
  assert.deepEqual(leaves(record).sort(),Object.keys(mapping.fields).sort());
  validateStartupRecord(record);
  (company.disposition==='accepted'?records:alumni).push(record);
  mappings.push(mapping);
}
for(const [name,value] of [['records.json',{reviewed:packet.reviewed_at.slice(0,10),startups:records}],
    ['alumni-records.json',{reviewed:packet.reviewed_at.slice(0,10),startups:alumni}],
    ['projection-map.json',{base_revision:packet.base_revision,policy:'existing Atlas schema only; unsupported typed claims remain research-only',records:mappings,
      excluded_company_ids:packet.companies.filter(c=>!['accepted','alumni'].includes(c.disposition)).map(c=>c.id)}]])
  writeFileSync(resolve(here,name),JSON.stringify(value,null,2)+'\n');
console.log(JSON.stringify({records:records.length,alumni:alumni.length,mapped_leaves:mappings.reduce((n,m)=>n+Object.keys(m.fields).length,0)}));
