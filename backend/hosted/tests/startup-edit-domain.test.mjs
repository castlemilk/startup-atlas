import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {EntryError} from '../../../scripts/catalogue-entries.mjs';
import {validateStartupRecord,mergeStartup} from '../src/startup-record.mjs';
import {STARTUP_EDIT_VERSION,recordRevision,readStartupRecord,describeStartupRecord,startupEditIdentity,applyStartupEdit,prepareStartupEdit} from '../src/startup-edit.mjs';

const reviewed='2026-01-01', id='startup:example', head='a'.repeat(40);
const social=(suffix='one')=>({label:`Profile ${suffix}`,url:`https://social.example.com/${suffix}`,source:'https://example.com/team',reviewed_at:reviewed});
const fixture=()=>({
  reviewed,notes:'Preserve document-level provenance.',startups:[{
    name:'Example',description:'A source-backed company',website:'https://example.com/',
    source:'https://example.com/about',reviewed_at:reviewed,founded_year:2020,
    socials:[social()],
    founders:[{name:'Pat Founder',source:'https://example.com/team',profile_url:'https://example.com/pat',socials:[social('pat')]}],
    funding_rounds:[{id:'example-seed',stage:'Seed',amount:500000,currency:'AUD',announced_on:'2025-01-02',note:'Historical seed round.',source:'https://example.com/seed'}],
    profile_facts:[{key:'asset-review',label:'Image review',value:'Image permission is unresolved.',source:'https://example.com/terms',reviewed_at:reviewed}],
  },{name:'Other',description:'Another company',website:'https://other.example.com/',source:'https://other.example.com/about',reviewed_at:reviewed}],
});
const snapshot=(research=fixture(),revision=head)=>({head:revision,research,graph:{entities:[{id,kind:'startup',name:'Example'}]},leads:['Acme Ventures'],catalogue:{opportunities:[{org:'Provider Example'}]}});
async function editFor(research,patch={},target=id) {
  return {id:target,expectedRecordRevision:await recordRevision(target,readStartupRecord(research,target).record),patch:{reviewed_at:reviewed,...patch}};
}
function expectError(code,path) {
  return error=>{
    assert.ok(error instanceof EntryError);
    assert.equal(error.code,code);
    if(path!==undefined)assert.equal(error.details.path,path);
    assert.equal(typeof error.details.action,'string');
    return true;
  };
}

test('real PsiQuantum source read retains exact metadata and unresolved image permission',async()=>{
  const research=JSON.parse(await readFile(new URL('../../../data/startup-research.json',import.meta.url),'utf8'));
  const before=structuredClone(research), target='startup:psiquantum';
  const receipt=await describeStartupRecord(research,target,head);
  const original=research.startups.find(record=>record.name==='PsiQuantum');
  assert.deepEqual(receipt.record,original);
  assert.equal(receipt.sourceFile,'data/startup-research.json');
  assert.equal(receipt.schemaVersion,STARTUP_EDIT_VERSION);
  assert.match(receipt.recordRevision,/^[a-f0-9]{64}$/);
  assert.equal(receipt.published,false);
  assert.equal(receipt.record.socials.length,3);
  assert.match(receipt.record.profile_facts.find(fact=>fact.key==='official-press-materials').value,/permission remains unresolved/);
  assert.equal(receipt.record.logo,undefined);
  const updated=await applyStartupEdit(research,{id:target,expectedRecordRevision:receipt.recordRevision,patch:{reviewed_at:original.reviewed_at,socials:[]}});
  assert.deepEqual(updated.merged,original);
  assert.deepEqual(updated.changedPaths,[]);
  assert.deepEqual(research,before);
});

test('funding rounds accept canonical lead_investor and participants, and reject malformed ones',async()=>{
  const research=fixture();
  const base={id:'example-seed',stage:'Seed',source:'https://example.com/seed'};
  const updated=await applyStartupEdit(research,await editFor(research,{funding_rounds:[{...base,lead_investor:'Acme Ventures',participants:['Beta Capital','Gamma Fund']}]}));
  assert.equal(updated.merged.funding_rounds[0].lead_investor,'Acme Ventures');
  assert.deepEqual(updated.merged.funding_rounds[0].participants,['Beta Capital','Gamma Fund']);
  assert.equal(updated.merged.funding_rounds[0].amount,500000);
  await assert.rejects(applyStartupEdit(research,await editFor(research,{funding_rounds:[{...base,participants:'Beta Capital'}]})),expectError('VALIDATION_ERROR','/patch/funding_rounds/0/participants'));
  await assert.rejects(applyStartupEdit(research,await editFor(research,{funding_rounds:[{...base,lead_investor:''}]})),expectError('VALIDATION_ERROR','/patch/funding_rounds/0/lead_investor'));
  await assert.rejects(applyStartupEdit(research,await editFor(research,{funding_rounds:[{...base,participants:['Beta Capital','']}]})),expectError('VALIDATION_ERROR','/patch/funding_rounds/0/participants/1'));
});

test('canonical source IDs resolve exactly and reject missing or ambiguous records',()=>{
  const research=fixture();
  assert.deepEqual(readStartupRecord(research,id).record,research.startups[0]);
  assert.throws(()=>readStartupRecord(research,'startup:missing'),expectError('NOT_FOUND','/id'));
  assert.throws(()=>readStartupRecord(research,'Example'),expectError('VALIDATION_ERROR','/id'));
  research.startups.push({...research.startups[0],name:'Exampĺe'});
  assert.throws(()=>readStartupRecord(research,id),expectError('AMBIGUOUS_ID','/id'));
});

test('record and intent hashes ignore object-key order but preserve array order, URLs and prior revision',async()=>{
  const research=fixture(), record=research.startups[0];
  const reordered=Object.fromEntries(Object.entries(record).reverse());
  assert.equal(await recordRevision(id,record),await recordRevision(id,reordered));
  const edit=await editFor(research,{socials:[social('new'),social('second')]});
  const same={patch:{socials:edit.patch.socials.map(value=>Object.fromEntries(Object.entries(value).reverse())),reviewed_at:reviewed},expectedRecordRevision:edit.expectedRecordRevision,id};
  assert.deepEqual(await startupEditIdentity(edit),await startupEditIdentity(same));
  const identity=await startupEditIdentity(edit);
  assert.match(identity.branch,/^atlas-edit\/example-[a-f0-9]{24}$/);
  assert.match(identity.intentDigest,/^[a-f0-9]{64}$/);
  assert.notEqual(identity.intentDigest,(await startupEditIdentity({...edit,patch:{...edit.patch,socials:[...edit.patch.socials].reverse()}})).intentDigest);
  assert.notEqual(identity.intentDigest,(await startupEditIdentity({...edit,expectedRecordRevision:'f'.repeat(64)})).intentDigest);
  assert.notEqual(await recordRevision(id,{...record,socials:[social('one'),social('two')]}),await recordRevision(id,{...record,socials:[social('two'),social('one')]}));
  const exact='https://social.example.com/Profile?b=2&a=1';
  const updated=await applyStartupEdit(research,await editFor(research,{socials:[{...social(),url:exact}]}));
  assert.equal(updated.merged.socials.at(-1).url,exact);
});

test('stale record digest rejects without touching any input',async()=>{
  const research=fixture(), edit=await editFor(research,{description:'An updated description'});
  research.startups[0].website='https://example.com/new-home';
  const before=structuredClone(research);
  await assert.rejects(applyStartupEdit(research,edit),expectError('RECORD_CONFLICT','/expectedRecordRevision'));
  assert.deepEqual(research,before);
});

test('same record digest survives unrelated source changes but validation token is bound to snapshot revision',async()=>{
  const research=fixture(), edit=await editFor(research,{description:'An updated description'});
  const first=await prepareStartupEdit(snapshot(research),edit);
  research.startups[1].description='A separately reviewed update';
  const second=await prepareStartupEdit(snapshot(research,'b'.repeat(40)),edit);
  assert.equal(first.recordRevision,second.recordRevision);
  assert.equal(first.intentDigest,second.intentDigest);
  assert.equal(first.branch,second.branch);
  assert.notEqual(first.validationToken,second.validationToken);
  assert.equal(second.research.startups[1].description,'A separately reviewed update');
  assert.equal(second.persisted,false);assert.equal(second.published,false);
  const local=await prepareStartupEdit(snapshot(research,'c'.repeat(64)),edit);
  assert.equal(local.revision,'c'.repeat(64));
});

test('no-op edit preserves record hash and exact unchanged fields',async()=>{
  const research=fixture(), before=structuredClone(research);
  const result=await applyStartupEdit(research,await editFor(research,{}));
  assert.deepEqual(result.previous,before.startups[0]);
  assert.deepEqual(result.merged,before.startups[0]);
  assert.deepEqual(result.changedPaths,[]);
  assert.equal(result.recordRevision,result.nextRecordRevision);
  assert.deepEqual(result.research,before);
  assert.deepEqual(research,before);
});

test('social updates merge by exact URL and preserve omitted founder social entries recursively',async()=>{
  const research=fixture(), before=structuredClone(research);
  const result=await applyStartupEdit(research,await editFor(research,{
    socials:[{...social(),label:'Updated label'},social('new')],
    founders:[{name:'Pat Founder',source:'https://example.com/team',socials:[social('pat-new')]}],
  }));
  assert.deepEqual(result.merged.socials.map(item=>item.url),[social().url,social('new').url]);
  assert.deepEqual(result.merged.founders[0].socials,[social('pat'),social('pat-new')]);
  assert.equal(result.merged.founders[0].profile_url,before.startups[0].founders[0].profile_url);
  assert.deepEqual(result.merged.funding_rounds,before.startups[0].funding_rounds);
  assert.deepEqual(result.merged.profile_facts,before.startups[0].profile_facts);
  assert.deepEqual(result.changedPaths,['/founders/0/socials/1','/socials/0/label','/socials/1']);
  assert.deepEqual(research,before);
  assert.deepEqual(mergeStartup(before.startups[0],{founders:[{name:'Pat Founder',source:'https://example.com/team'}]}).founders[0].socials,[social('pat')]);
});

test('empty arrays preserve existing collections at both startup and founder levels',async()=>{
  const research=fixture();
  const result=await applyStartupEdit(research,await editFor(research,{socials:[],funding_rounds:[],profile_facts:[],founders:[{name:'Pat Founder',source:'https://example.com/team',socials:[]}]}));
  assert.deepEqual(result.merged,research.startups[0]);
  assert.deepEqual(result.changedPaths,[]);
});

test('top-level source replacement rejects inherited scalar attribution and allows explicit resubmission',async()=>{
  const research=fixture();
  await assert.rejects(applyStartupEdit(research,await editFor(research,{source:'https://example.com/new-source'})),error=>{
    expectError('SOURCE_INHERITANCE','/patch/source')(error);
    assert.deepEqual(error.details.inheritedPaths,['/patch/description','/patch/website','/patch/founded_year']);
    return true;
  });
  const {description,website,founded_year}=research.startups[0];
  const result=await applyStartupEdit(research,await editFor(research,{source:'https://example.com/new-source',description,website,founded_year}));
  assert.equal(result.merged.source,'https://example.com/new-source');
  assert.equal(result.warnings[0].code,'SOURCE_CHANGED');
  assert.equal(result.warnings[0].path,'/patch/source');
});

test('funding and founder source replacements cannot reattribute inherited fields',async()=>{
  const research=fixture();
  await assert.rejects(applyStartupEdit(research,await editFor(research,{funding_rounds:[{id:'example-seed',stage:'Seed',source:'https://example.com/new-seed'}]})),error=>{
    expectError('SOURCE_INHERITANCE','/patch/funding_rounds/0/source')(error);
    assert.ok(error.details.inheritedPaths.includes('/patch/funding_rounds/0/amount'));
    assert.ok(error.details.inheritedPaths.includes('/patch/funding_rounds/0/announced_on'));
    return true;
  });
  await assert.rejects(applyStartupEdit(research,await editFor(research,{founders:[{name:'Pat Founder',source:'https://example.com/new-team'}]})),expectError('SOURCE_INHERITANCE','/patch/founders/0/source'));
  const result=await applyStartupEdit(research,await editFor(research,{
    funding_rounds:[{...research.startups[0].funding_rounds[0],source:'https://example.com/new-seed'}],
    founders:[{name:'Pat Founder',source:'https://example.com/new-team',profile_url:'https://example.com/pat'}],
  }));
  assert.equal(result.warnings.length,2);
  assert.deepEqual(result.merged.founders[0].socials,[social('pat')]);
});

test('strict edit envelope rejects rename, removal, unknown, null and missing-review requests',async()=>{
  const research=fixture(), base=await editFor(research);
  for(const [patch,path] of [
    [{reviewed_at:reviewed,name:'Renamed'},'/patch/name'],
    [{reviewed_at:reviewed,remove:['socials']},'/patch/remove'],
    [{reviewed_at:reviewed,unset:['website']},'/patch/unset'],
    [{reviewed_at:reviewed,socials:null},'/patch/socials'],
    [{reviewed_at:reviewed,website:null},'/patch/website'],
    [{reviewed_at:reviewed,unknown:true},'/patch/unknown'],
    [{description:'Missing review date'},'/patch/reviewed_at'],
  ])await assert.rejects(applyStartupEdit(research,{...base,patch}),expectError('VALIDATION_ERROR',path));
  await assert.rejects(startupEditIdentity({...base,name:'Example'}),expectError('VALIDATION_ERROR','/name'));
  await assert.rejects(startupEditIdentity({...base,expectedRecordRevision:'A'.repeat(64)}),expectError('VALIDATION_ERROR','/expectedRecordRevision'));
});

test('malformed social metadata has precise paths and never silently normalizes or discards fields',async()=>{
  const research=fixture();
  for(const [change,path] of [
    [{url:'http://social.example.com/one'},'/patch/socials/0/url'],
    [{source:'https://127.0.0.1/source'},'/patch/socials/0/source'],
    [{source:' https://example.com/team'},'/patch/socials/0/source'],
    [{reviewed_at:'2026-02-30'},'/patch/socials/0/reviewed_at'],
    [{reviewed_at:'2100-01-01'},'/patch/socials/0/reviewed_at'],
    [{label:' '},'/patch/socials/0/label'],
    [{verified:true},'/patch/socials/0/verified'],
    [{url:null},'/patch/socials/0/url'],
  ])await assert.rejects(applyStartupEdit(research,await editFor(research,{socials:[{...social(),...change}]})),expectError('VALIDATION_ERROR',path));
  const missing={...social()};delete missing.source;
  await assert.rejects(applyStartupEdit(research,await editFor(research,{socials:[missing]})),expectError('VALIDATION_ERROR','/patch/socials/0/source'));
  await assert.rejects(applyStartupEdit(research,await editFor(research,{socials:[social(),social()]})),expectError('VALIDATION_ERROR','/patch/socials/1'));
  await assert.rejects(applyStartupEdit(research,await editFor(research,{founders:[{name:'Pat Founder',source:'https://example.com/team',socials:[social(),social()]}]})),expectError('VALIDATION_ERROR','/patch/founders/0/socials/1'));
  assert.throws(()=>validateStartupRecord({...research.startups[0],socials:[social(),social()]}),{code:'VALIDATION_ERROR'});
});

test('founder blurb carries its own sourced provenance (#528)',async()=>{
  const research=fixture();
  const blurb={text:'Co-founder of Example. Previously a site engineer.',sources:['https://example.com/team','https://example.org/profile'],verified_at:'2026-01-01'};
  const withBlurb={...research.startups[0],founders:[{name:'Pat Founder',source:'https://example.com/team',blurb}]};
  assert.equal(validateStartupRecord(withBlurb),withBlurb);
  for(const bad of [
    {...blurb,text:' '},
    {...blurb,sources:[]},
    {...blurb,sources:['http://example.com/team']},
    {...blurb,sources:'https://example.com/team'},
    {...blurb,verified_at:'2026-02-30'},
    {...blurb,verified_at:'2100-01-01'},
    {...blurb,extra:true},
    {sources:blurb.sources,verified_at:blurb.verified_at},
  ])assert.throws(()=>validateStartupRecord({...research.startups[0],founders:[{name:'Pat Founder',source:'https://example.com/team',blurb:bad}]}),{code:'VALIDATION_ERROR'});
});

test('full merged collection limits are checked after valid individual patches',async()=>{
  for(const nested of [false,true]) {
    const research=fixture(), links=Array.from({length:30},(_,index)=>social(String(index)));
    if(nested)research.startups[0].founders[0].socials=links;else research.startups[0].socials=links;
    const patch=nested?{founders:[{name:'Pat Founder',source:'https://example.com/team',socials:[social('extra')]}]}:{socials:[social('extra')]};
    await assert.rejects(applyStartupEdit(research,await editFor(research,patch)),expectError('VALIDATION_ERROR',nested?'/merged/founders/0/socials':'/merged/socials'));
  }
  const research=fixture();
  research.startups[0].funding_rounds=Array.from({length:100},(_,index)=>({id:`example-${index}`,stage:'Seed',source:'https://example.com/round'}));
  await assert.rejects(applyStartupEdit(research,await editFor(research,{funding_rounds:[{id:'example-extra',stage:'Series A',source:'https://example.com/round'}]})),expectError('VALIDATION_ERROR','/merged/funding_rounds'));
});

test('founder case, spelling and slug collisions require explicit identity migration',async()=>{
  const research=fixture();
  for(const name of ['PAT FOUNDER','Pat-Founder'])await assert.rejects(applyStartupEdit(research,await editFor(research,{founders:[{name,source:'https://example.com/team'}]})),expectError('IDENTITY_CONFLICT','/patch/founders/0/name'));
  await assert.rejects(applyStartupEdit(research,await editFor(research,{founders:[{name:'Alex Person',source:'https://example.com/team'},{name:'Alex-Person',source:'https://example.com/team'}]})),expectError('IDENTITY_CONFLICT','/merged/founders/2/name'));
});

test('relationship validation accepts existing graph/source/lead/provider targets and rejects unknown or self targets',async()=>{
  const research=fixture(), relation=target_id=>({target_id,kind:'supported_by',description:'Sourced relationship',source:'https://example.com/relationships'});
  for(const target of ['partner:acme-ventures','provider:provider-example','startup:other']) {
    const result=await prepareStartupEdit(snapshot(research),await editFor(research,{relationships:[relation(target)]}));
    assert.equal(result.merged.relationships[0].target_id,target);
  }
  for(const target of [id,'partner:missing'])await assert.rejects(prepareStartupEdit(snapshot(research),await editFor(research,{relationships:[relation(target)]})),expectError('VALIDATION_ERROR','/merged/relationships/0/target_id'));
});

test('graph/source identity disagreements and cross-startup funding IDs stop the edit',async()=>{
  const research=fixture(), current=snapshot(research);
  current.graph.entities[0].name='EXAMPLE';
  await assert.rejects(prepareStartupEdit(current,await editFor(research)),expectError('IDENTITY_CONFLICT','/id'));
  research.startups[1].funding_rounds=[{id:'example-seed',stage:'Seed',source:'https://other.example.com/seed'}];
  await assert.rejects(prepareStartupEdit(snapshot(research),await editFor(research)),expectError('IDENTITY_CONFLICT','/merged/funding_rounds/0/id'));
});

test('legacy records without reviewed_at are read exactly and acquire only the explicit edit review',async()=>{
  const research=fixture();delete research.startups[0].reviewed_at;
  assert.equal(readStartupRecord(research,id).record.reviewed_at,undefined);
  const result=await applyStartupEdit(research,await editFor(research));
  assert.equal(result.merged.reviewed_at,reviewed);
  assert.deepEqual(result.changedPaths,['/reviewed_at']);
});

test('new founder associations cannot coalesce with another startup person by exact name or slug',async()=>{
  const research=fixture();
  research.startups[1].founders=[{name:'Alex Smith',source:'https://other.example.com/team',photo_url:'https://other.example.com/alex.jpg',photo_source:'https://other.example.com/team'}];
  const before=structuredClone(research);
  for(const name of ['Alex Smith','Álex Smith']) {
    const edit=await editFor(research,{founders:[{name,source:'https://example.com/team'}]});
    await assert.rejects(prepareStartupEdit(snapshot(research),edit),expectError('IDENTITY_CONFLICT','/patch/founders/0/name'));
  }
  assert.deepEqual(research,before);
});

test('new founder associations cannot take a graph-only person identifier',async()=>{
  const research=fixture(), current=snapshot(research);
  current.graph.entities.push({id:'person:alex-smith',kind:'person',name:'Alex Smith',source:'https://example.com/existing-person'});
  for(const name of ['Alex Smith','Álex Smith'])await assert.rejects(prepareStartupEdit(current,await editFor(research,{founders:[{name,source:'https://example.com/team'}]})),expectError('IDENTITY_CONFLICT','/patch/founders/0/name'));
});

test('company-only edits and unchanged shared founder upserts preserve established associations',async()=>{
  const research=fixture();
  research.startups[1].founders=[{name:'Pat Founder',source:'https://other.example.com/team'}];
  const before=structuredClone(research);
  const company=await prepareStartupEdit(snapshot(research),await editFor(research,{description:'A company-only correction'}));
  assert.deepEqual(company.merged.founders,before.startups[0].founders);
  const unchanged=await prepareStartupEdit(snapshot(research),await editFor(research,{founders:[{name:'Pat Founder',source:'https://example.com/team'}]}));
  assert.deepEqual(unchanged.merged.founders,before.startups[0].founders);
  assert.deepEqual(unchanged.changedPaths,[]);
  assert.deepEqual(research,before);
});

test('metadata changes to shared founders require a person-scoped reviewed migration',async()=>{
  for(const sharing of ['source','graph']) {
    const research=fixture(), current=snapshot(research);
    if(sharing==='source')research.startups[1].founders=[{name:'Pat Founder',source:'https://other.example.com/team'}];
    else {
      current.graph.entities.push({id:'person:pat-founder',kind:'person',name:'Pat Founder'});
      current.graph.edges=[{from:'person:pat-founder',to:'startup:graph-only-company',kind:'founded'}];
    }
    await assert.rejects(prepareStartupEdit(current,await editFor(research,{founders:[{name:'Pat Founder',source:'https://example.com/team',socials:[social('new-profile')]}]})),expectError('IDENTITY_CONFLICT','/patch/founders/0'));
    await assert.rejects(prepareStartupEdit(current,await editFor(research,{founders:[{name:'Pat Founder',source:'https://example.com/new-team',profile_url:'https://example.com/pat'}]})),expectError('IDENTITY_CONFLICT','/patch/founders/0'));
  }
});

test('explicit existing founder upserts reject a conflicting graph person spelling',async()=>{
  const research=fixture(), current=snapshot(research);
  current.graph.entities.push({id:'person:pat-founder',kind:'person',name:'Pát Founder'});
  await assert.rejects(prepareStartupEdit(current,await editFor(research,{founders:[{name:'Pat Founder',source:'https://example.com/team'}]})),expectError('IDENTITY_CONFLICT','/patch/founders/0/name'));
  const companyOnly=await prepareStartupEdit(current,await editFor(research,{description:'Independent company correction'}));
  assert.equal(companyOnly.merged.description,'Independent company correction');
});
