import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {recordRevision,readStartupRecord,prepareStartupEdit} from '../src/startup-edit.mjs';
test('Go1 primary round preserves lower bound and unspecified currency through strict preview',async()=>{
 const load=async name=>JSON.parse(await readFile(new URL('../../../data/'+name,import.meta.url),'utf8'));
 const research=await load('startup-research.json'), before=structuredClone(research), id='startup:go1';
 const record=readStartupRecord(research,id).record, round=record.funding_rounds.find(r=>r.id==='go1-2022-06-funding');
 assert.equal(round.stage,'Funding round');assert.equal(round.announced_on,'2022-06-09');
 assert.match(round.amount_text,/Over \$100 million/);assert.match(round.amount_text,/currency unspecified/);
 for(const key of ['amount','currency','valuation','valuation_currency'])assert.ok(!Object.hasOwn(round,key));
 assert.match(round.note,/closed in May 2022/);assert.match(round.note,/not the closing date/);
 assert.match(round.note,/Five Sigma led the round/);assert.match(round.note,/not an exhaustive/);
 assert.equal(round.source,'https://www.go1.com/blog/go1-secures-fresh-support-after-year-of-record-growth');
 const current={head:'a'.repeat(40),research,graph:await load('graph.json'),leads:await load('partner-leads.json'),catalogue:await load('catalogue.json')};
 const result=await prepareStartupEdit(current,{id,expectedRecordRevision:await recordRevision(id,record),patch:{reviewed_at:'2026-11-18'}});
 assert.deepEqual(result.merged.funding_rounds,record.funding_rounds);assert.deepEqual(result.merged.founders,record.founders);
 assert.deepEqual(research,before);assert.equal(result.persisted,false);assert.equal(result.published,false);
});
