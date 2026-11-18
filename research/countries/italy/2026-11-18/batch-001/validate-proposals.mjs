#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { startupRecordSchema, validateStartupRecord } from '../../../../../backend/hosted/src/startup-record.mjs';

const root=dirname(fileURLToPath(import.meta.url));
const repo=resolve(root,'../../../../..');
const read=name=>JSON.parse(readFileSync(join(root,name),'utf8'));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const proposal=read('startup-proposals.json'), map=read('projection-map.json');
const packets=Object.fromEntries(['general','fintech','deeptech'].map(group=>[group,read(`evidence/${group}.json`)]));
const sources=new Map(Object.values(packets).flatMap(p=>p.sources).map(s=>[s.id,s]));
const claims=new Map(Object.values(packets).flatMap(p=>p.claims).map(q=>[q.claim_id,q]));
const companies=new Map(Object.values(packets).flatMap(p=>p.companies).map(c=>[c.id||c.entity_id,c]));
const checks=[];
const assert=(condition,message)=>{if(!condition)throw new Error(message);};
const check=(name,fn)=>{fn();checks.push(name);};
const norm=s=>s.normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim();
const canonicalDomain=website=>new URL(website).hostname.toLowerCase().replace(/^www\./,'');
const isPrefix=(mapping,path)=>path===mapping.path||path.startsWith(mapping.path+'/');
const walk=(value,path='')=>value&&typeof value==='object'
  ? Object.entries(value).flatMap(([key,child])=>walk(child,path+'/'+key))
  : [{path,value}];
const rawEventId=e=>e.event_id||e.id;
const rawEvent=(c,id)=>(c.funding_events||c.funding_rounds||[]).find(e=>rawEventId(e)===id);
const safePrecisions=new Set(['exact','as_reported']);

check('Existing strict schema and validator are used without expansion',()=>{
  assert(startupRecordSchema.additionalProperties===false,'schema is no longer strict');
  assert(map.target_schema==='backend/hosted/src/startup-record.mjs#startupRecordSchema','unexpected target schema');
  assert(map.target_schema_sha256===sha(readFileSync(join(repo,'backend/hosted/src/startup-record.mjs'))),'schema revision changed');
});
check('Envelope contains exactly reviewed and startups with 22 records',()=>{
  assert(Object.keys(proposal).sort().join(',')==='reviewed,startups','extra envelope field');
  assert(proposal.reviewed==='2026-11-18'&&proposal.startups.length===22&&map.record_count===22,'count/review mismatch');
});
check('All 22 records pass current validateStartupRecord',()=>proposal.startups.forEach(validateStartupRecord));
check('Production projections contain no null or empty-string placeholders',()=>{
  for(const leaf of walk(proposal))assert(leaf.value!==null&&leaf.value!=='',`unknown placeholder: ${leaf.path}`);
});
check('Candidate identities and canonical domains are unique',()=>{
  assert(new Set(proposal.startups.map(r=>norm(r.name))).size===22,'duplicate company name');
  assert(new Set(proposal.startups.map(r=>canonicalDomain(r.website))).size===22,'duplicate domain');
});
check('Seven general, seven fintech and eight deeptech records are represented',()=>{
  const counts={general:0,fintech:0,deeptech:0};
  for(const r of map.records)counts[r.packet.match(/evidence\/(.+)\.json/)[1]]++;
  assert(counts.general===7&&counts.fintech===7&&counts.deeptech===8,'lane counts differ');
});
check('Acquired Fiscozen and publicly listed Bending Spoons remain excluded',()=>{
  assert(map.excluded_records.length===2,'wrong exclusion count');
  assert(!proposal.startups.some(r=>['Fiscozen','Bending Spoons'].includes(r.name)),'excluded company projected');
});
check('Frozen evidence checksums match projection inputs',()=>{
  for(const input of map.inputs)assert(input.sha256===sha(readFileSync(join(root,input.path))),`stale input ${input.path}`);
});
check('Every emitted leaf has an explicit field or object mapping',()=>{
  for(const m of map.records){
    assert(proposal.startups[m.output_index].name===m.name,'record mapping index mismatch');
    for(const leaf of walk(proposal.startups[m.output_index]))assert(m.field_mappings.some(f=>isPrefix(f,leaf.path)),`missing map ${m.name}${leaf.path}`);
  }
});
check('Every sourced mapping resolves to accessed sources and same-entity claims',()=>{
  for(const m of map.records)for(const f of m.field_mappings){
    if(f.kind==='administrative')continue;
    assert(f.source_ids.length>0&&f.claim_ids.length>0,`empty provenance ${m.name}${f.path}`);
    assert(f.source_ids.length===f.source_urls.length,`source URL map mismatch ${m.name}${f.path}`);
    f.source_ids.forEach((sid,index)=>{
      const s=sources.get(sid); assert(s?.accessed===true&&s.url===f.source_urls[index],`unaccessed source ${sid}`);
    });
    for(const qid of f.claim_ids){
      const q=claims.get(qid); assert(q&&q.entity_id===m.entity_id&&q.accessed===true,`invalid claim ${qid}`);
      const support=new Set([q.source_id,...(q.source_ids||[]),...(q.support_source_ids||[])]);
      for(const [sid,s] of sources)if((q.supporting_source_urls||[]).includes(s.url))support.add(sid);
      assert(f.source_ids.some(sid=>support.has(sid)),`unjoined claim/source ${qid}`);
    }
  }
});
check('Founder sources come from explicit person-specific founder claims',()=>{
  for(const m of map.records){
    const r=proposal.startups[m.output_index];
    for(const [index,f] of (r.founders||[]).entries()){
      const fm=m.field_mappings.find(x=>x.path===`/founders/${index}`);
      assert(fm&&fm.source_urls.includes(f.source),'founder source mismatch');
      assert(fm.claim_ids.some(id=>{const q=claims.get(id);return q.field==='founder'&&q.value.name===f.name;}),`missing founder claim ${f.name}`);
    }
  }
});
check('All numeric funding amounts are exact/as-reported positive safe integers',()=>{
  for(const m of map.records){
    const c=companies.get(m.entity_id),r=proposal.startups[m.output_index];
    for(const f of m.funding_projections){
      const out=r.funding_rounds[f.output_index],raw=rawEvent(c,f.raw_event_id);
      assert(raw,'missing original event');
      if(Object.hasOwn(out,'amount')){
        assert(Number.isSafeInteger(out.amount)&&out.amount>0,'unsafe numeric amount');
        assert(safePrecisions.has(raw.amount_precision),'bounded or approximate numeric amount');
        assert(out.amount===raw.amount&&out.currency===raw.currency,'amount/currency changed or converted');
      }else assert(!Object.hasOwn(out,'currency'),'orphan currency');
    }
  }
});
check('Full-day funding dates match source precision without padding',()=>{
  for(const m of map.records)for(const f of m.funding_projections){
    const out=proposal.startups[m.output_index].funding_rounds[f.output_index];
    if(out.announced_on)assert(f.input_announcement.precision==='day'&&f.input_announcement.value===out.announced_on,'invented day precision');
  }
});
check('Participant fields and canonical investor relationships are absent',()=>{
  for(const r of proposal.startups){
    assert(!Object.hasOwn(r,'relationships'),'unresolved canonical relationship');
    for(const f of r.funding_rounds||[])assert(!Object.hasOwn(f,'participants')&&!Object.hasOwn(f,'investors'),'unsupported participant array');
  }
});
check('Participant names, roles and tranche scopes remain in mapped funding notes',()=>{
  for(const m of map.records){
    const c=companies.get(m.entity_id);
    for(const fm of m.funding_projections){
      const raw=rawEvent(c,fm.raw_event_id),out=proposal.startups[m.output_index].funding_rounds[fm.output_index];
      for(const p of raw.participants||[]){
        assert(out.note?.includes(p.name),`participant omitted from note: ${p.name}`);
        if(p.participation_scope)assert(out.note.includes(p.participation_scope),`tranche scope missing: ${p.name}`);
      }
    }
  }
});
check('Sector tags explicitly remain researcher classifications',()=>{
  for(const r of proposal.startups){
    const f=r.profile_facts.find(f=>f.key==='sector-tags');
    assert(f?.label.includes('researcher classification')&&f.value.startsWith('Researcher classification'),'unlabeled taxonomy');
  }
});
check('Unknown headquarters are not promoted from office or origin evidence',()=>{
  for(const m of map.records){
    const c=companies.get(m.entity_id),hq=c.headquarters;
    const known=hq&&(!Object.hasOwn(hq,'value')||hq.value!==null);
    if(!known)assert(!proposal.startups[m.output_index].profile_facts.some(f=>f.key==='headquarters'),'unknown HQ promoted');
  }
});
check('Conflicting founding years and unknown AAVantgarde founding remain nonnumeric',()=>{
  for(const name of ['Satispay','Unobravo','AAVantgarde Bio'])assert(!Object.hasOwn(proposal.startups.find(r=>r.name===name),'founded_year'),`founding uncertainty lost: ${name}`);
});
check('Satispay proposal is a fact, not completed funding',()=>{
  const r=proposal.startups.find(r=>r.name==='Satispay');
  assert(r.funding_rounds.length===1&&r.funding_rounds[0].amount===60000000,'Satispay proposal duplicated as funding');
  assert(r.profile_facts.some(f=>f.key==='proposed-capital-increase'&&f.value.includes('unverified')),'proposal qualification missing');
});
check('WeRoad, Caracol B, D-Orbit, AIKO and Planckian uncertainty remains textual',()=>{
  for(const name of ['WeRoad','D-Orbit','AIKO','Planckian']){
    const fs=proposal.startups.find(r=>r.name===name).funding_rounds;
    assert(fs.every(f=>!Object.hasOwn(f,'amount')&&f.amount_text),'uncertain numeric amount promoted');
  }
  const caracol=proposal.startups.find(r=>r.name==='Caracol').funding_rounds.find(f=>f.stage==='Series B');
  assert(!Object.hasOwn(caracol,'amount')&&caracol.amount_text.includes('currency'),'Caracol currency inferred');
});
check('Casavo debt and lower bound remain separate, nonnumeric observations',()=>{
  const r=proposal.startups.find(r=>r.name==='Casavo');
  assert(r.funding_rounds.find(f=>f.id.endsWith('series-d')).amount===100000000,'Casavo equity aggregate wrong');
  const debt=r.funding_rounds.find(f=>f.id.endsWith('debt'));
  assert(!Object.hasOwn(debt,'amount')&&debt.amount_text.startsWith('Up to'),'debt bound lost');
  const later=r.funding_rounds.find(f=>f.id.includes('2026-04-14'));
  assert(!Object.hasOwn(later,'amount')&&later.amount_text.startsWith('More than'),'strict lower bound lost');
});
check('Cumulative totals and components do not become duplicated events',()=>{
  for(const name of ['D-Orbit','Energy Dome','AIKO','Leaf Space'])assert(proposal.startups.find(r=>r.name===name).funding_rounds.length===1,`overlapping events duplicated: ${name}`);
  assert(proposal.startups.find(r=>r.name==='Energy Dome').funding_rounds[0].amount===55000000,'Energy Dome total wrong');
  assert(proposal.startups.find(r=>r.name==='Leaf Space').funding_rounds[0].amount===20000000,'Leaf equity includes unfinished debt');
});
check('Scalapay USD, Jet stage and Caracol announcement have separate field sources',()=>{
  const get=name=>map.records.find(m=>m.name===name);
  assert(get('Scalapay').field_mappings.find(f=>f.path==='/funding_rounds/0/currency').source_ids.includes('it-fin-scalapay-2022-extension'),'Scalapay currency attribution absent');
  assert(get('Jet HR').field_mappings.find(f=>f.path==='/funding_rounds/0/stage').source_ids.includes('it-fin-jet-about'),'Jet stage attribution absent');
  assert(get('Caracol').field_mappings.find(f=>f.path==='/funding_rounds/0/announced_on').source_ids.includes('it-deep-09'),'Caracol date attribution absent');
});
check('Proposal and map are byte-reproducible from frozen evidence',()=>{
  execFileSync('python3',[join(root,'build-proposals.py'),'--check'],{encoding:'utf8',stdio:'pipe'});
});

const report={valid:true,reviewed:'2026-11-18',schema:'backend/hosted/src/startup-record.mjs#startupRecordSchema',
  schema_sha256:map.target_schema_sha256,records:proposal.startups.length,
  founders:proposal.startups.reduce((n,r)=>n+(r.founders?.length||0),0),
  funding_rounds:proposal.startups.reduce((n,r)=>n+(r.funding_rounds?.length||0),0),
  numeric_funding_amounts:proposal.startups.flatMap(r=>r.funding_rounds||[]).filter(f=>Object.hasOwn(f,'amount')).length,
  profile_facts:proposal.startups.reduce((n,r)=>n+(r.profile_facts?.length||0),0),
  checks_passed:checks.length,checks,inputs:map.inputs,
  proposal_sha256:sha(readFileSync(join(root,'startup-proposals.json'))),
  projection_map_sha256:sha(readFileSync(join(root,'projection-map.json'))),
  production_writes:0,limitations:['Structural validation and evidence-projection guards do not establish latest-world completeness.','Canonical investor relationships and live Atlas publication are deliberately absent.','Existing Atlas deduplication and publication approval are integrating-owner responsibilities.']};
writeFileSync(join(root,'projection-validation.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({valid:true,records:report.records,founders:report.founders,funding_rounds:report.funding_rounds,numeric_funding_amounts:report.numeric_funding_amounts,profile_facts:report.profile_facts,checks_passed:checks.length},null,2));
