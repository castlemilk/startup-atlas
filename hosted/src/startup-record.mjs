import { EntryError, publicHttps, validDate } from '../../scripts/catalogue-entries.mjs';

const text = maxLength => ({type:'string',minLength:1,maxLength});
const url = {type:'string',format:'uri',maxLength:2048};
const date = {type:'string',pattern:'^\\d{4}-\\d{2}-\\d{2}$'};
const fields = properties => ({type:'object',additionalProperties:false,properties});
const founder = {...fields({name:text(200),source:url,profile_url:url,photo_url:url,photo_source:url}),required:['name','source']};
const funding = {...fields({id:{...text(100),pattern:'^[a-z0-9]+(?:-[a-z0-9]+)*$'},stage:text(100),announced_on:date,amount:{type:'integer',minimum:0},currency:{type:'string',pattern:'^[A-Z]{3}$'},valuation:{type:'integer',minimum:0},valuation_currency:{type:'string',pattern:'^[A-Z]{3}$'},note:text(2000),source:url}),required:['id','stage','source']};
const article = {...fields({title:text(300),url,published_on:date,kind:text(100)}),required:['title','url']};
const relationship = {...fields({target_id:{type:'string',pattern:'^(startup|partner|provider):[a-z0-9]+(?:-[a-z0-9]+)*$'},kind:{type:'string',pattern:'^[a-z][a-z0-9_]{0,49}$'},description:text(300),source:url}),required:['target_id','kind','description','source']};
export const startupRecordSchema = {...fields({
  name:text(200),description:text(2000),website:url,source:url,reviewed_at:date,
  founded_year:{type:'integer',minimum:1800,maximum:2100},logo:url,logo_source:url,
  founders:{type:'array',maxItems:30,items:founder},funding_rounds:{type:'array',maxItems:100,items:funding},
  articles:{type:'array',maxItems:100,items:article},relationships:{type:'array',maxItems:100,items:relationship},
}),required:['name','source','reviewed_at']};

const fail = message => {throw new EntryError('VALIDATION_ERROR',message);};
function checkObject(value, spec, label) {
  if(!value || typeof value!=='object' || Array.isArray(value))fail(`${label} must be an object.`);
  for(const key of Object.keys(value)){
    if(!Object.hasOwn(spec.properties,key))fail(`${label}.${key} is not supported.`);
    if(value[key]===undefined)fail(`${label}.${key} must not be undefined.`);
  }
  for(const key of spec.required||[])if(!Object.hasOwn(value,key))fail(`${label}.${key} is required.`);
}
function checkText(value,label,max){
  if(typeof value!=='string'||!value.trim()||value!==value.trim()||value.length>max||/[\u0000-\u001f\u007f]/.test(value))fail(`${label} must be trimmed text of at most ${max} characters.`);
}
const normalize = value => value.normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim();
export const startupSlug = value => value.normalize('NFKD').replace(/[^\x00-\x7f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
function checkDate(value,label) {validDate(value,label);if(value>new Date().toISOString().slice(0,10))fail(`${label} cannot be in the future.`);}
function checkPair(value, left, right, label) {if(Object.hasOwn(value,left)!==Object.hasOwn(value,right))fail(`${label} requires ${left} and ${right} together.`);}
function checkRecords(value,key,max,spec,validate){
  if(!Array.isArray(value)||value.length>max)fail(`${key} must be an array with at most ${max} items.`);
  const seen=new Set();for(const item of value){checkObject(item,spec,key);validate(item);const id=key==='founders'?normalize(item.name):key==='funding_rounds'?item.id:key==='articles'?item.url:[item.kind,item.target_id,item.source].join('|');if(seen.has(id))fail(`${key} contains duplicates.`);seen.add(id);}
}
export function validateStartupRecord(record){
  checkObject(record,startupRecordSchema,'record');
  checkText(record.name,'record.name',200);if(!startupSlug(record.name))fail('record.name needs a stable ASCII identifier.');
  publicHttps(record.source,'record.source');checkDate(record.reviewed_at,'record.reviewed_at');
  if(record.description!==undefined)checkText(record.description,'record.description',2000);
  for(const key of ['website','logo','logo_source'])if(record[key]!==undefined)publicHttps(record[key],`record.${key}`);
  checkPair(record,'logo','logo_source','Logo');
  if(record.founded_year!==undefined&&(!Number.isInteger(record.founded_year)||record.founded_year<1800||record.founded_year>new Date().getUTCFullYear()))fail('record.founded_year must be a plausible non-future year.');
  if(record.founders!==undefined)checkRecords(record.founders,'founders',30,founder,item=>{
    checkText(item.name,'founder.name',200);publicHttps(item.source,'founder.source');
    for(const key of ['profile_url','photo_url','photo_source'])if(item[key]!==undefined)publicHttps(item[key],`founder.${key}`);
    checkPair(item,'photo_url','photo_source','Founder photo');
  });
  if(record.funding_rounds!==undefined)checkRecords(record.funding_rounds,'funding_rounds',100,funding,item=>{
    checkText(item.id,'funding.id',100);if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.id))fail('funding.id must be a slug.');
    checkText(item.stage,'funding.stage',100);publicHttps(item.source,'funding.source');
    if(item.announced_on!==undefined)checkDate(item.announced_on,'funding.announced_on');
    if(item.note!==undefined)checkText(item.note,'funding.note',2000);
    for(const key of ['amount','valuation'])if(item[key]!==undefined&&(!Number.isSafeInteger(item[key])||item[key]<0))fail(`funding.${key} must be a non-negative safe integer.`);
    for(const key of ['currency','valuation_currency'])if(item[key]!==undefined&&!/^[A-Z]{3}$/.test(item[key]))fail(`funding.${key} must be an uppercase ISO currency code.`);
    checkPair(item,'amount','currency','Funding');checkPair(item,'valuation','valuation_currency','Valuation');
  });
  if(record.articles!==undefined)checkRecords(record.articles,'articles',100,article,item=>{
    checkText(item.title,'article.title',300);publicHttps(item.url,'article.url');
    if(item.kind!==undefined)checkText(item.kind,'article.kind',100);
    if(item.published_on!==undefined)checkDate(item.published_on,'article.published_on');
  });
  if(record.relationships!==undefined)checkRecords(record.relationships,'relationships',100,relationship,item=>{
    if(typeof item.target_id!=='string'||! /^(startup|partner|provider):[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.target_id))fail('relationship.target_id must be a graph identifier.');
    if(typeof item.kind!=='string'||! /^[a-z][a-z0-9_]{0,49}$/.test(item.kind))fail('relationship.kind must be a simple relation identifier.');
    checkText(item.description,'relationship.description',300);publicHttps(item.source,'relationship.source');
  });
  return record;
}

export function mergeStartup(previous, incoming){
  const result={...previous,...incoming};
  for(const [field,key] of [['founders',x=>normalize(x.name)],['funding_rounds',x=>x.id],['articles',x=>x.url],['relationships',x=>[x.kind,x.target_id,x.source].join('|')]]){
    if(incoming[field]===undefined)continue;
    const merged=new Map((previous[field]||[]).map(item=>[key(item),item]));
    for(const item of incoming[field])merged.set(key(item),{...(merged.get(key(item))||{}),...item});
    result[field]=[...merged.values()];
  }
  return result;
}
