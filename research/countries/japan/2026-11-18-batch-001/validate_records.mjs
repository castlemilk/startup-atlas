// Validates this staged packet with the unchanged authoritative Atlas schema.
// It does not propose, merge, publish, fetch, or approve any source.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { validateStartupRecord, startupSlug, startupRecordSchema } from '../../../../backend/hosted/src/startup-record.mjs';
import { derive, leaves, atPointer } from './projection_rules.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../../..');
const read = name => JSON.parse(readFileSync(resolve(here, name), 'utf8'));
const documents = ['records.json', 'alumni-records.json'].map(read);
const packet = read('companies.json');
const companies = packet.companies;
const projection = read('projection-map.json');
const dedup = read('deduplication.json');
assert.equal(dedup.base_revision,packet.base_revision);
assert.equal(dedup.existing_company_matches,0);
assert.equal(dedup.founder_slug_collisions.length,0);
const existing = JSON.parse(readFileSync(resolve(root, 'data/startup-research.json'), 'utf8'));
const existingNames = new Set(existing.startups.map(x => startupSlug(x.name)));
const names = new Set(), events = new Set();
let count = 0;
function validateBinding(record,company,mapping) {
  assert.deepEqual(leaves(record).sort(),Object.keys(mapping.fields).sort(),'projection field coverage');
  assert.deepEqual(Object.keys(mapping.fields).sort(),Object.keys(mapping.bindings).sort(),'derivation coverage');
  for(const [path,ids] of Object.entries(mapping.fields)) {
    assert.equal(ids.length,1);
    const binding=mapping.bindings[path];
    assert.equal(binding.claim_id,ids[0]);
    assert.deepEqual(atPointer(record,path),derive(binding,company,packet),`projected value drift ${company.name} ${path}`);
    const claim=company.claims.find(c=>c.id===binding.claim_id);
    const expectedField=path==='/name'?'canonical_name':path==='/website'?'website':path==='/description'?'description':
      path==='/founded_year'?'founded':path.startsWith('/funding_rounds/')?'funding_round':path.startsWith('/founders/')?'founder':null;
    if(expectedField) assert.equal(claim.field,expectedField,`wrong claim meaning ${path}`);
  }
  const mapped=new Set(Object.values(mapping.fields).flat());
  assert.deepEqual(mapping.research_only_claim_ids,[...company.claims.filter(c=>!mapped.has(c.id)).map(c=>c.id)]);
  assert.equal(record.name,company.name);
  assert.equal(record.website,company.website);
}
for (const [documentIndex,document] of documents.entries()) {
  const requiredDisposition=documentIndex===0?'accepted':'alumni';
  assert.deepEqual(document.startups.map(x=>x.name).sort(),companies.filter(x=>x.disposition===requiredDisposition).map(x=>x.name).sort());
  assert.deepEqual(Object.keys(document).sort(), ['reviewed', 'startups']);
  for (const record of document.startups) {
    assert.equal(validateStartupRecord(record), record);
    const id = startupSlug(record.name);
    assert(!names.has(id), `duplicate projected slug ${id}`);
    assert(!existingNames.has(id), `existing source record requires merge review: ${id}`);
    names.add(id);
    const company = companies.find(c => c.name === record.name);
    assert.equal(company?.disposition,requiredDisposition);
    assert.deepEqual(dedup.candidate_matches.find(x=>x.candidate_id===company.id)?.existing_matches,[]);
    const mapping = projection.records.find(c => c.name === record.name);
    assert(mapping, `missing projection evidence map: ${record.name}`);
    validateBinding(record,company,mapping);
    for (const [path, ids] of Object.entries(mapping.fields)) {
      assert(ids.length > 0, `empty evidence map ${record.name} ${path}`);
      for (const claimId of ids) assert(company.claims.some(c => c.id === claimId), `unbound claim ${claimId}`);
    }
    for (const round of record.funding_rounds || []) {
      assert(!events.has(round.id), `duplicate round ID ${round.id}`);
      events.add(round.id);
      const claim = company.claims.find(c => c.field === 'funding_round' && c.value.id === round.id);
      assert(claim, `round evidence missing: ${round.id}`);
      if (Object.hasOwn(round, 'amount')) {
        assert.equal(claim.value.numeric_projection_allowed, true, `unsafe numeric amount ${round.id}`);
        assert.equal(round.amount, claim.value.amount);
        assert.equal(round.currency, claim.value.currency);
      }
      if (Object.hasOwn(round, 'announced_on')) {
        assert.equal(claim.value.date_precision, 'day');
        assert.equal(claim.value.date_kind, 'announcement');
        assert.equal(round.announced_on, claim.value.date);
      }
    }
    count++;
  }
}

// Representation boundaries that protect unknowns and the unchanged public API.
const sample = structuredClone(documents[0].startups[0]);
assert.throws(() => validateStartupRecord({...sample, founded_year: null}));
assert.throws(() => validateStartupRecord({...sample, aliases: []}));
assert.throws(() => validateStartupRecord({...sample, incorporation: null}));
assert.throws(() => validateStartupRecord({...sample, funding_rounds: [{id:'synthetic-month', stage:'Seed', source:sample.source, announced_on:'2024-06'}]}));
assert.throws(() => validateStartupRecord({...sample, funding_rounds: [{id:'synthetic-participant', stage:'Seed', source:sample.source, participants:[]}]}));
assert(!Object.hasOwn(startupRecordSchema.properties, 'investors'));
// These adversarial checks guard source drift and unsupported semantic mappings.
const company=companies.find(c=>c.name===sample.name);
const mapping=projection.records.find(c=>c.name===sample.name);
const modified=structuredClone(sample);
modified.description='Fabricated business description';
assert.throws(()=>validateBinding(modified,company,mapping),/projected value drift/);
modified.description=sample.description;
modified.source='https://example.com/unread-source';
assert.throws(()=>validateBinding(modified,company,mapping),/projected value drift/);
const missing=structuredClone(mapping);
delete missing.fields['/website'];
assert.throws(()=>validateBinding(sample,company,missing),/projection field coverage/);
const rebinding=structuredClone(mapping);
rebinding.bindings['/description'].claim_id=company.claims.find(c=>c.field==='canonical_name').id;
assert.throws(()=>validateBinding(sample,company,rebinding));
const sakana=documents[0].startups.find(x=>x.name==='Sakana AI');
assert.equal(Object.hasOwn(sakana.funding_rounds[0],'announced_on'),false,'source update is not announcement');
for(const name of ['Josys','Interstellar Technologies'])
  assert.equal(Object.hasOwn(documents[0].startups.find(x=>x.name===name),'founded_year'),false);
for(const name of ['Astroscale','Axelspace','Paidy'])
  assert.equal(Object.hasOwn(documents[1].startups.find(x=>x.name===name),'founded_year'),false);
const wota=companies.find(c=>c.name==='WOTA').claims.find(c=>c.field==='funding_round').value;
assert(!wota.participants.some(p=>p.name==='SMBC Nikko Securities'));
assert(wota.related_parties.some(p=>p.name==='SMBC Nikko Securities'));
const caddi=companies.find(c=>c.name==='CADDi').claims.find(c=>c.field==='funding_round'&&c.value.stage==='Series D').value;
assert(!caddi.participants.some(p=>p.name==='Japan Post Bank Asset Management'));
assert.equal(caddi.participants.filter(p=>p.name.startsWith('JPS')).length,2);
console.log(JSON.stringify({result:'passed', records:count, rounds:events.size, mapped_leaves:projection.records.reduce((n,m)=>n+Object.keys(m.fields).length,0),
  boundary_assertions:6,adversarial_projection_checks:4,semantic_regressions:8,production_writes:0}));
