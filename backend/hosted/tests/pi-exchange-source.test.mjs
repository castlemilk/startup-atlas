import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {recordRevision,readStartupRecord,prepareStartupEdit} from '../src/startup-edit.mjs';

test('real PI.EXCHANGE source supports strict revision-guarded edit preview without data loss',async()=>{
 const load=async name=>JSON.parse(await readFile(new URL('../../../data/'+name,import.meta.url),'utf8'));
 const research=await load('startup-research.json'), before=structuredClone(research);
 const id='startup:pi-exchange', record=readStartupRecord(research,id).record;
 const current={head:'a'.repeat(40),research,graph:await load('graph.json'),leads:await load('partner-leads.json'),catalogue:await load('catalogue.json')};
 const result=await prepareStartupEdit(current,{id,expectedRecordRevision:await recordRevision(id,record),patch:{reviewed_at:'2026-11-18'}});
 assert.deepEqual(result.merged.profile_facts,record.profile_facts);
 assert.equal(result.merged.name,'PI.EXCHANGE');
 assert.equal(result.merged.website,'https://www.mentana.ai/');
 assert.equal(result.persisted,false);assert.equal(result.published,false);
 assert.deepEqual(research,before);
});
