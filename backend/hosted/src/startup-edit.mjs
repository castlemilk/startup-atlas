import { EntryError, publicHttps, validDate } from '../../../scripts/catalogue-entries.mjs';
import { startupRecordSchema, startupSlug, validateStartupRecord, mergeStartup } from './startup-record.mjs';

export const STARTUP_EDIT_VERSION = 'startup-edit-v1';
export const startupIdSchema = {type:'string',pattern:'^startup:[a-z0-9]+(?:-[a-z0-9]+)*$',maxLength:200};
export const recordRevisionSchema = {type:'string',pattern:'^[a-f0-9]{64}$'};
const patchProperties = Object.fromEntries(Object.entries(startupRecordSchema.properties).filter(([key])=>key!=='name'));
export const startupEditSchema = {
  type:'object',additionalProperties:false,required:['id','expectedRecordRevision','patch'],
  properties:{
    id:startupIdSchema,
    expectedRecordRevision:recordRevisionSchema,
    patch:{type:'object',additionalProperties:false,required:['reviewed_at'],properties:patchProperties},
  },
};

const own = (value,key) => Object.hasOwn(value,key);
const object = value => value!==null && typeof value==='object' && !Array.isArray(value) && (Object.getPrototypeOf(value)===Object.prototype || Object.getPrototypeOf(value)===null);
const normalizeName = value => value.normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim();
const pointer = key => String(key).replaceAll('~','~0').replaceAll('/','~1');
function fail(code,message,path,action,details={}) {
  const error=new EntryError(code,message);
  error.details={path,action,...details};
  throw error;
}
const invalid = (message,path,details={}) => fail('VALIDATION_ERROR',message,path,'Correct this field and validate the complete edit again.',details);

// Validate the advertised schema before hashing. In particular, JSON omission,
// null, unsupported keys and non-finite numbers must never collapse to one intent.
function checkSchema(value,spec,path) {
  if(value===null || value===undefined)invalid(`${path} must not be null or undefined; omission preserves an existing field.`,path);
  if(spec.type==='object') {
    if(!object(value))invalid(`${path} must be an object.`,path);
    for(const key of Object.keys(value))if(!own(spec.properties,key))invalid(`${path}/${key} is not supported. Renames and removals require a separate reviewed migration.`,`${path}/${pointer(key)}`);
    for(const key of spec.required||[])if(!own(value,key))invalid(`${path}/${key} is required.`,`${path}/${pointer(key)}`);
    for(const [key,item] of Object.entries(value))checkSchema(item,spec.properties[key],`${path}/${pointer(key)}`);
    for(const [left,right] of [['logo','logo_source'],['photo_url','photo_source'],['amount','currency'],['valuation','valuation_currency']]) {
      if(own(spec.properties,left) && own(value,left)!==own(value,right))invalid(`${left} and ${right} must be supplied together.`,`${path}/${own(value,left)?right:left}`,{pairedWith:`${path}/${own(value,left)?left:right}`});
    }
    return;
  }
  if(spec.type==='array') {
    if(!Array.isArray(value) || value.length>spec.maxItems)invalid(`${path} must contain at most ${spec.maxItems} items.`,path);
    const field=path.split('/').at(-1), seen=new Set();
    const keyFor={socials:item=>item.url,founders:item=>normalizeName(item.name),funding_rounds:item=>item.id,articles:item=>item.url,profile_facts:item=>item.key,relationships:item=>JSON.stringify([item.kind,item.target_id,item.source])}[field];
    for(const [index,item] of value.entries()) {
      checkSchema(item,spec.items,`${path}/${index}`);
      if(keyFor) {
        const key=keyFor(item);
        if(seen.has(key))invalid(`${path} contains a duplicate item key.`,`${path}/${index}`,{key});
        seen.add(key);
      }
    }
    return;
  }
  if(spec.type==='string') {
    if(typeof value!=='string' || value!==value.trim() || /[\u0000-\u001f\u007f]/.test(value) || (spec.minLength!==undefined && value.length<spec.minLength) || (spec.maxLength!==undefined && value.length>spec.maxLength) || (spec.pattern && !new RegExp(spec.pattern).test(value)))invalid(`${path} must match its string contract.`,path);
    try {
      if(spec.format==='uri')publicHttps(value,path);
      if(spec.pattern==='^\\d{4}-\\d{2}-\\d{2}$') {
        validDate(value,path);
        if(value>new Date().toISOString().slice(0,10))invalid(`${path} cannot be in the future.`,path);
      }
    } catch(error) {
      if(error instanceof EntryError && !error.details)invalid(error.message,path);
      throw error;
    }
    return;
  }
  if(spec.type==='integer') {
    if(!Number.isSafeInteger(value) || value<spec.minimum || value>Math.min(spec.maximum??Infinity,path.endsWith('/founded_year')?new Date().getUTCFullYear():Infinity))invalid(`${path} must be an integer within the supported range.`,path);
    return;
  }
  invalid('Unsupported contract schema.',path);
}

function canonical(value,path='') {
  if(Array.isArray(value))return value.map((item,index)=>canonical(item,`${path}/${index}`));
  if(object(value))return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key],`${path}/${pointer(key)}`)]));
  if(value===null || typeof value==='string' || typeof value==='boolean' || (typeof value==='number' && Number.isFinite(value)))return value;
  invalid('Only JSON values can participate in a record revision or edit identity.',path);
}
const stableJson = value => JSON.stringify(canonical(value));
async function sha256(value) {
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(stableJson(value)));
  return [...new Uint8Array(bytes)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}

export async function recordRevision(id,record) {
  checkSchema(id,startupIdSchema,'/id');
  if(!object(record))invalid('The authoritative record must be an object.','/record');
  return sha256({id,record});
}

export function readStartupRecord(research,id) {
  checkSchema(id,startupIdSchema,'/id');
  if(!object(research) || !Array.isArray(research.startups))fail('INVALID_DATA','The startup source document has no startup list.','/research/startups','Inspect the authoritative source document before editing.');
  const matches=[];
  for(const [index,record] of research.startups.entries()) {
    if(!object(record) || typeof record.name!=='string')fail('INVALID_DATA','A startup source record has no name.',`/research/startups/${index}/name`,'Repair the source record through a reviewed migration.');
    if(`startup:${startupSlug(record.name)}`===id)matches.push(record);
  }
  if(matches.length===0)fail('NOT_FOUND','No authoritative startup record has this exact canonical ID.','/id','Read the source-backed startup ID; graph-only entities require the existing addition flow.',{id});
  if(matches.length!==1)fail('AMBIGUOUS_ID','Multiple authoritative records produce this canonical ID.','/id','Resolve the source identity collision before editing.',{id,names:matches.map(record=>record.name)});
  return {id,record:structuredClone(matches[0])};
}

export async function describeStartupRecord(research,id,revision) {
  const result=readStartupRecord(research,id);
  return {...result,revision,recordRevision:await recordRevision(id,result.record),schemaVersion:STARTUP_EDIT_VERSION,sourceFile:'data/startup-research.json',published:false};
}

export async function startupEditIdentity(edit) {
  checkSchema(edit,startupEditSchema,'');
  const intentDigest=await sha256({schemaVersion:STARTUP_EDIT_VERSION,...edit});
  return {id:edit.id,intentDigest,branch:`atlas-edit/${edit.id.slice('startup:'.length).slice(0,55)}-${intentDigest.slice(0,24)}`};
}

function checkSourceInheritance(previous,incoming,fields,path,warnings) {
  if(!own(incoming,'source') || incoming.source===previous.source)return;
  const inherited=fields.filter(key=>own(previous,key) && !own(incoming,key));
  if(inherited.length)fail('SOURCE_INHERITANCE','A replacement source would be attached to inherited claims that were not explicitly resubmitted.',`${path}/source`,'Keep the previous source, or verify and explicitly resubmit every affected claim with the replacement source.',{inheritedPaths:inherited.map(key=>`${path}/${pointer(key)}`),previousSource:previous.source});
  warnings.push({code:'SOURCE_CHANGED',path:`${path}/source`,action:'Independently verify every resubmitted claim against the replacement source.'});
}

function checkFounderIdentities(previous,incoming) {
  const existing=previous.founders||[];
  for(const [index,founder] of (incoming.founders||[]).entries()) {
    const equivalent=existing.find(item=>normalizeName(item.name)===normalizeName(founder.name) || startupSlug(item.name)===startupSlug(founder.name));
    if(equivalent && equivalent.name!==founder.name)fail('IDENTITY_CONFLICT','A founder spelling change would reuse or collide with an existing person identifier.',`/patch/founders/${index}/name`,'Use the exact existing founder spelling; person renames require a separate reviewed migration.',{existingName:equivalent.name});
  }
}

function checkMergedFounderIds(record) {
  const seen=new Map();
  for(const [index,founder] of (record.founders||[]).entries()) {
    const slug=startupSlug(founder.name);
    if(!slug || seen.has(slug))fail('IDENTITY_CONFLICT','Founder names must produce distinct nonempty existing person identifiers.',`/merged/founders/${index}/name`,'Resolve the person identity collision before editing.',{...(seen.has(slug)?{existingName:seen.get(slug)}:{}),personId:`person:${slug}`});
    seen.set(slug,founder.name);
  }
}

function changedPaths(previous,merged,path='') {
  if(stableJson(previous)===stableJson(merged))return [];
  if(object(previous) && object(merged))return [...new Set([...Object.keys(previous),...Object.keys(merged)])].sort().flatMap(key=>{
    const child=`${path}/${pointer(key)}`;
    return own(previous,key) && own(merged,key)?changedPaths(previous[key],merged[key],child):[child];
  });
  if(Array.isArray(previous) && Array.isArray(merged))return Array.from({length:Math.max(previous.length,merged.length)},(_,index)=>{
    const child=`${path}/${index}`;
    return index<previous.length && index<merged.length?changedPaths(previous[index],merged[index],child):[child];
  }).flat();
  return [path||'/'];
}

export async function applyStartupEdit(research,edit) {
  checkSchema(edit,startupEditSchema,'');
  const {record:previous}=readStartupRecord(research,edit.id);
  const currentRecordRevision=await recordRevision(edit.id,previous);
  if(currentRecordRevision!==edit.expectedRecordRevision)fail('RECORD_CONFLICT','The authoritative startup record changed after it was read.','/expectedRecordRevision','Read the current record, reconcile the intended changes and validate again.',{expectedRecordRevision:edit.expectedRecordRevision,recordRevision:currentRecordRevision});
  const warnings=[];
  checkFounderIdentities(previous,edit.patch);
  checkSourceInheritance(previous,edit.patch,['description','website','founded_year'],'/patch',warnings);
  for(const [index,incoming] of (edit.patch.funding_rounds||[]).entries()) {
    const before=(previous.funding_rounds||[]).find(item=>item.id===incoming.id);
    if(before)checkSourceInheritance(before,incoming,Object.keys(before).filter(key=>!['id','source'].includes(key)),`/patch/funding_rounds/${index}`,warnings);
  }
  for(const [index,incoming] of (edit.patch.founders||[]).entries()) {
    const before=(previous.founders||[]).find(item=>item.name===incoming.name);
    if(before)checkSourceInheritance(before,incoming,['profile_url'],`/patch/founders/${index}`,warnings);
  }
  const merged=mergeStartup(previous,{...edit.patch,name:previous.name});
  checkSchema(merged,startupRecordSchema,'/merged');
  checkMergedFounderIds(merged);
  try {validateStartupRecord(merged);} catch(error) {
    if(error instanceof EntryError && !error.details)invalid(error.message,'/merged');
    throw error;
  }
  const identity=await startupEditIdentity(edit);
  const nextRecordRevision=await recordRevision(edit.id,merged);
  const nextResearch={...research,reviewed:typeof research.reviewed==='string' && research.reviewed>edit.patch.reviewed_at?research.reviewed:edit.patch.reviewed_at,startups:research.startups.map(item=>`startup:${startupSlug(item.name)}`===edit.id?merged:item)};
  return {...identity,previous,merged,research:nextResearch,recordRevision:currentRecordRevision,nextRecordRevision,changedPaths:changedPaths(previous,merged),warnings,schemaVersion:STARTUP_EDIT_VERSION};
}

function checkSharedFounderIdentities(current,edit,result) {
  // A company-scoped patch cannot decide that an existing global person is a
  // new founder association, or rewrite person metadata shared by companies.
  // Company-only edits deliberately skip this check for inherited founders.
  for(const [index,incoming] of (edit.patch.founders||[]).entries()) {
    const personId=`person:${startupSlug(incoming.name)}`;
    const previous=(result.previous.founders||[]).find(founder=>founder.name===incoming.name);
    const merged=(result.merged.founders||[]).find(founder=>founder.name===incoming.name);
    const elsewhere=current.research.startups.filter(record=>`startup:${startupSlug(record.name)}`!==edit.id).flatMap(record=>(record.founders||[]).filter(founder=>`person:${startupSlug(founder.name)}`===personId).map(founder=>({startupId:`startup:${startupSlug(record.name)}`,name:founder.name})));
    const nodes=current.graph.entities.filter(entity=>entity.id===personId);
    const conflictingNames=[...elsewhere,...nodes].filter(founder=>founder.name!==incoming.name).map(founder=>founder.name);
    if(conflictingNames.length)fail('IDENTITY_CONFLICT','This founder spelling collides with an existing global person identifier.',`/patch/founders/${index}/name`,'Resolve the person identity through a separate reviewed migration before editing its company association.',{personId,existingNames:[...new Set(conflictingNames)]});
    if(!previous && (elsewhere.length || nodes.length))fail('IDENTITY_CONFLICT','A new founder association would reuse an existing global person identifier.',`/patch/founders/${index}/name`,'Review the shared person identity and association in a separate person-scoped migration.',{personId,otherStartupIds:[...new Set(elsewhere.map(founder=>founder.startupId))]});
    const graphShared=(current.graph.edges||[]).some(edge=>edge.from===personId && edge.kind==='founded' && edge.to!==edit.id);
    if(previous && (elsewhere.length || graphShared) && stableJson(previous)!==stableJson(merged))fail('IDENTITY_CONFLICT','This company-scoped edit would change metadata for a founder shared with another company.',`/patch/founders/${index}`,'Omit the unchanged founder, or use a separate person-scoped reviewed migration for shared metadata changes.',{personId,otherStartupIds:[...new Set(elsewhere.map(founder=>founder.startupId))]});
  }
}

export async function prepareStartupEdit(current,edit) {
  if(!object(current) || typeof current.head!=='string' || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(current.head) || !object(current.graph) || !Array.isArray(current.graph.entities) || !Array.isArray(current.leads) || !object(current.catalogue) || !Array.isArray(current.catalogue.opportunities))fail('INVALID_DATA','A complete revision-pinned startup snapshot is required.','/current','Read the current source snapshot before validating this edit.');
  const result=await applyStartupEdit(current.research,edit);
  checkSharedFounderIdentities(current,edit,result);
  const collision=current.graph.entities.find(item=>item.id===edit.id && item.name!==result.merged.name);
  if(collision)fail('IDENTITY_CONFLICT','The graph and authoritative source disagree on the startup identity.','/id','Reconcile the source identity before proposing an edit.',{id:edit.id,graphName:collision.name,recordName:result.merged.name});
  const otherRounds=new Set(current.research.startups.filter(item=>`startup:${startupSlug(item.name)}`!==edit.id).flatMap(item=>(item.funding_rounds||[]).map(round=>round.id)));
  for(const [index,round] of (result.merged.funding_rounds||[]).entries())if(otherRounds.has(round.id))fail('IDENTITY_CONFLICT','A funding event ID belongs to another startup.',`/merged/funding_rounds/${index}/id`,'Resolve the funding event identity before editing.',{id:round.id});
  const known=new Set(current.graph.entities.map(item=>item.id));
  for(const startup of current.research.startups)known.add(`startup:${startupSlug(startup.name)}`);
  for(const name of current.leads)if(typeof name==='string')known.add(`partner:${startupSlug(name)}`);
  for(const offer of current.catalogue.opportunities)if(typeof offer.org==='string')known.add(`provider:${startupSlug(offer.org)}`);
  for(const [index,relationship] of (result.merged.relationships||[]).entries())if(relationship.target_id===edit.id || !known.has(relationship.target_id))fail('VALIDATION_ERROR','A relationship must target a different existing graph entity.',`/merged/relationships/${index}/target_id`,'Choose an exact existing target ID after independently reviewing the relationship.',{targetId:relationship.target_id});
  const validationToken=await sha256({schemaVersion:STARTUP_EDIT_VERSION,revision:current.head,intentDigest:result.intentDigest,nextRecordRevision:result.nextRecordRevision});
  return {...result,revision:current.head,validationToken,persisted:false,published:false};
}
