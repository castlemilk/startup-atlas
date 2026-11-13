import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {copyFileSync,mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import test from 'node:test';
import {getGraph,getOpportunity,getPublicDocument,getStartup,searchGraph} from '../web/graph-sql.js';

test('SQLite WASM searches the graph and preserves sourced startup records',async()=>{
  const temp=mkdtempSync(join(tmpdir(),'atlas-sqlite-'));
  try{
    const database=join(temp,'graph.sqlite'),module=join(temp,'sql-wasm.cjs');
    execFileSync('python3',['scripts/build-graph-db.py','--out',database]);
    copyFileSync('web/vendor/sql.js/sql-wasm.js',module);
    const SQL=await createRequire(import.meta.url)(module)({locateFile:()=>resolve('web/vendor/sql.js/sql-wasm.wasm')});
    const db=new SQL.Database(readFileSync(database));
    assert.ok(searchGraph(db,'air').some(x=>x.name==='Airwallex'));
    assert.ok(searchGraph(db,'Airtree').some(x=>x.name==='Canva'));
    assert.ok(searchGraph(db,'series h').some(x=>x.name==='Airwallex'));
    assert.ok(searchGraph(db,'Melanie Perkins').some(x=>x.kind==='person'));
    assert.ok(searchGraph(db,'Melanie Perkins').some(x=>x.id==='startup:canva'));
    assert.ok(searchGraph(db,'Startmate Accelerator').some(x=>x.kind==='programme'));
    const all=searchGraph(db,'',getGraph(db).entities.length);
    assert.equal(all.length,getGraph(db).entities.length);
    for (const kind of ['startup','person','partner','provider','programme']) assert.ok(all.some(item=>item.kind===kind));
    assert.equal(getOpportunity(db,'startmate').name,'Startmate Accelerator');
    const catalogue=JSON.parse(readFileSync('data/catalogue.json','utf8'));
    assert.deepEqual(getPublicDocument(db,'catalogue.json'),catalogue);
    assert.deepEqual(getPublicDocument(db,'map-locations.json'),JSON.parse(readFileSync('data/map-locations.json','utf8')));
    assert.throws(()=>getPublicDocument(db,'missing.json'),/unavailable/);
    assert.ok(getGraph(db).entities.some(x=>x.id==='person:melanie-perkins'));
    assert.deepEqual(searchGraph(db,'☃'),[]);
    assert.doesNotThrow(()=>searchGraph(db,'" OR 1=1; --'));
    const canva=getStartup(db,'startup:canva');
    assert.ok(canva.related.some(x=>x.name==='Melanie Perkins'));
    assert.equal(canva.startup.profile_facts.find(x=>x.key==='product-launch').value,'26 August 2013');
    assert.ok(canva.startup.profile_facts.every(x=>x.source.startsWith('https://')));
    assert.equal(canva.rounds.find(x=>x.id==='canva-2013-seed').currency,undefined);
    assert.equal(canva.rounds.find(x=>x.id==='canva-2013-seed').amount_text,'$3 million (currency unspecified)');
    assert.ok(canva.rounds.some(x=>x.amount===200000000&&x.currency==='USD'));
    assert.throws(()=>getStartup(db,'startup:missing'),/not found/);
    db.close();
  }finally{rmSync(temp,{recursive:true,force:true});}
});
