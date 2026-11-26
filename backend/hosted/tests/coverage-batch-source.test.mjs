import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const load=async()=>JSON.parse(await readFile(new URL('../../../data/startup-research.json',import.meta.url),'utf8'));
test('company chronology evidence distinguishes founding from incorporation',async()=>{
 const x=await load(), g=x.startups.find(r=>r.name==='Gilmour Space'),r=x.startups.find(r=>r.name==='Revolut');
 assert.equal(g.founded_year,2012);
 const fact=g.profile_facts.find(f=>f.key==='founding-year-source');
 assert.match(fact.value,/not a verified legal incorporation date/);assert.match(fact.source,/investgoldcoast.com/);assert.equal(fact.reviewed_at,'2026-11-26');
 assert.ok(!r.founded_year);
 const founding=r.profile_facts.find(f=>f.key==='company-reported-founding-2015'),inc=r.profile_facts.find(f=>f.key==='revolut-ltd-incorporation');
 assert.match(founding.value,/2015/);assert.match(inc.value,/6 December 2013/);assert.match(inc.source,/08804411$/);
 for(const f of [founding,inc])assert.equal(f.reviewed_at,'2026-11-26');
});
test('founder social references stay explicitly company-profile linked without role or image claims',async()=>{
 const c=(await load()).startups.find(r=>r.name==='Culture Amp'),f=c.founders.find(p=>p.name==='Didier Elzinga');
 assert.equal(f.socials.length,2);
 assert.deepEqual(f.socials.map(s=>s.url),['https://twitter.com/didierelzinga','https://www.linkedin.com/in/didierelzinga']);
 for(const s of f.socials){assert.match(s.label,/company-profile linked/);assert.equal(s.source,'https://www.cultureamp.com/contributors/didier-elzinga');assert.equal(s.reviewed_at,'2026-11-26');}
 assert.ok(!f.role);assert.ok(!f.logo);
});
