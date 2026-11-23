import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {recordRevision,readStartupRecord,prepareStartupEdit} from '../src/startup-edit.mjs';
const load=async name=>JSON.parse(await readFile(new URL('../../../data/'+name,import.meta.url),'utf8'));
for(const [slug,eventId] of [['puralink','puralink-2025-pre-seed'],['deeligence','deeligence-2024-funding']]){
 test(`${slug} primary funding retains uncertainty through strict preview`,async()=>{
  const research=await load('startup-research.json'),before=structuredClone(research),id='startup:'+slug;
  const record=readStartupRecord(research,id).record, round=record.funding_rounds.find(r=>r.id===eventId);
  assert.match(round.amount_text,slug==='puralink'?/currency unstated/:/currency unspecified/);
  for(const key of ['amount','currency','valuation','valuation_currency','investors'])assert.ok(!Object.hasOwn(round,key));
  if(slug==='puralink'){
   assert.equal(round.stage,'Pre-seed');assert.equal(round.announced_on,'2025-09-17');assert.match(round.amount_text,/\$2.5 million/);
   assert.equal(round.source,'https://puralink.com/news/pre-seed-round/');
   for(const value of ['Peak XV Partners-led pre-seed','No exact closing date or canonical amount is established','Side Stage Ventures','Startmate','NZVC','Wollemi Capital Group','Ashik Ahmed','Matt Jones','Matthew Dellavedova'])assert.ok(round.note.includes(value));
   assert.match(round.note,/customer\/design partners and accelerator support alone are not investment evidence/);
  }else{
   assert.equal(round.stage,'Funding round');assert.ok(!Object.hasOwn(round,'announced_on'));assert.match(round.amount_text,/\$1 million/);
   assert.equal(round.source,'https://launchvic.org/case-studies/the-legaltech-startup-revolutionising-due-diligence-with-ai/');
   assert.match(round.note,/early 2024/);assert.match(round.note,/Alice Anderson Fund/);assert.match(round.note,/lead status are not specified/);
  }
  if(slug==='puralink'){assert.match(round.note,/not exhaustive/);}
  else{assert.match(round.note,/not an exhaustive/);assert.match(round.note,/not resolved to.*canonical graph identit/);}
  const current={head:'a'.repeat(40),research,graph:await load('graph.json'),leads:await load('partner-leads.json'),catalogue:await load('catalogue.json')};
  const result=await prepareStartupEdit(current,{id,expectedRecordRevision:await recordRevision(id,record),patch:{reviewed_at:'2026-11-18'}});
  assert.deepEqual(result.merged.funding_rounds,record.funding_rounds);assert.deepEqual(result.merged.founders,record.founders);
  assert.deepEqual(research,before);assert.equal(result.persisted,false);assert.equal(result.published,false);
 });
}
test('Alloovium accelerator listing is not converted into assumed round terms',async()=>{
 const record=readStartupRecord(await load('startup-research.json'),'startup:alloovium').record;
 assert.equal((record.funding_rounds||[]).length,0);
});
