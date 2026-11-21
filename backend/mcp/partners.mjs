import { createHash, randomUUID } from 'node:crypto';
import { readFile, lstat, realpath, open, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { EntryError } from '../../scripts/catalogue-entries.mjs';

const digest=(...parts)=>createHash('sha256').update(JSON.stringify(parts)).digest('hex');
const normalize=s=>s.normalize('NFKC').toLocaleLowerCase().trim();
function safeURL(value) {
  try { const u=new URL(value); return u.protocol==='https:' && !!u.hostname && !u.username && !u.password && (!u.port || u.port==='443'); }
  catch { return false; }
}
const AMOUNT_CURRENCIES=['AUD','USD','EUR','GBP','JPY','SGD','CAD','NZD','HKD','CNY','INR'];
const AMOUNT_KEYS=['original','currency','value','qualifier','assumption','usd','usd_display','rate','rate_date','rate_source','status'];
const AMOUNT_STATUSES=['converted','assumed','ambiguous','unconverted','unparsed'];
const AMOUNT_QUALIFIERS=['approximate','minimum','maximum'];
const AMOUNT_RATE_SOURCES=['frankfurter-live','fallback-table','no-rates'];
function isAmountNumber(value) {
  if (typeof value==='number' && Number.isFinite(value) && value>=0) return true;
  return !!value && typeof value==='object' && !Array.isArray(value)
    && typeof value.low==='number' && typeof value.high==='number'
    && Number.isFinite(value.low) && Number.isFinite(value.high)
    && value.low>=0 && value.high>=value.low
    && Object.keys(value).every(k=>['low','high'].includes(k));
}
function isDateString(value) {
  return typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(Date.parse(value+'T00:00:00Z'))
    && new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
}
// Structured money figures (see docs/CURRENCY.md). Optional: a record without
// amounts still validates. When present, each amount keeps its original
// figure next to its USD conversion, the FX rate, rate date and source; a
// bare "$" with no context must be status "ambiguous" with no USD figure,
// never a silent guess.
function validateAmounts(amounts) {
  if (!Array.isArray(amounts) || amounts.length>10)
    throw new EntryError('VALIDATION_ERROR','amounts must be an array of at most 10 normalised amounts.');
  for (const item of amounts) {
    if (!item || typeof item!=='object' || Array.isArray(item) || Object.keys(item).some(k=>!AMOUNT_KEYS.includes(k)))
      throw new EntryError('VALIDATION_ERROR','Each amount must contain only original, currency, value, qualifier, assumption, usd, usd_display, rate, rate_date, rate_source and status.');
    if (typeof item.original!=='string' || !item.original.trim() || item.original.length>200)
      throw new EntryError('VALIDATION_ERROR','Each amount original must be text up to 200 characters.');
    if (item.currency!==null && !AMOUNT_CURRENCIES.includes(item.currency))
      throw new EntryError('VALIDATION_ERROR','Each amount currency must be null or a known ISO code.');
    if (item.value!==null && !isAmountNumber(item.value))
      throw new EntryError('VALIDATION_ERROR','Each amount value must be null, a non-negative number, or a {low, high} range.');
    if (item.qualifier!==null && !AMOUNT_QUALIFIERS.includes(item.qualifier))
      throw new EntryError('VALIDATION_ERROR','Each amount qualifier must be null, approximate, minimum or maximum.');
    if (item.assumption!==null && (typeof item.assumption!=='string' || item.assumption.length>200))
      throw new EntryError('VALIDATION_ERROR','Each amount assumption must be null or text up to 200 characters.');
    if (item.usd!==null && !isAmountNumber(item.usd))
      throw new EntryError('VALIDATION_ERROR','Each amount usd must be null, a non-negative number, or a {low, high} range.');
    if (item.usd_display!==null && (typeof item.usd_display!=='string' || item.usd_display.length>40))
      throw new EntryError('VALIDATION_ERROR','Each amount usd_display must be null or text up to 40 characters.');
    if (item.rate!==null && (typeof item.rate!=='number' || !Number.isFinite(item.rate) || item.rate<=0))
      throw new EntryError('VALIDATION_ERROR','Each amount rate must be null or a positive number.');
    if (item.rate_date!==null && !isDateString(item.rate_date))
      throw new EntryError('VALIDATION_ERROR','Each amount rate_date must be null or a valid YYYY-MM-DD date.');
    if (item.rate_source!==null && !AMOUNT_RATE_SOURCES.includes(item.rate_source))
      throw new EntryError('VALIDATION_ERROR','Each amount rate_source must be null, frankfurter-live, fallback-table or no-rates.');
    if (!AMOUNT_STATUSES.includes(item.status))
      throw new EntryError('VALIDATION_ERROR','Each amount status must be converted, assumed, ambiguous, unconverted or unparsed.');
    if ((item.status==='converted' || item.status==='assumed') && (item.usd===null || item.rate===null))
      throw new EntryError('VALIDATION_ERROR','A converted or assumed amount must carry its USD figure and FX rate.');
    if ((item.status==='ambiguous' || item.status==='unparsed') && (item.usd!==null || item.rate!==null))
      throw new EntryError('VALIDATION_ERROR','An ambiguous or unparsed amount must not carry a USD figure or FX rate.');
    if (item.status==='unconverted' && item.usd!==null)
      throw new EntryError('VALIDATION_ERROR','An unconverted amount must not carry a USD figure.');
    if (item.status==='ambiguous' && item.assumption!==null)
      throw new EntryError('VALIDATION_ERROR','An ambiguous amount must not carry an assumption; resolve it explicitly or leave it unconverted.');
  }
}
function validateRecord(record) {
  if (!record || Array.isArray(record) || typeof record!=='object' || Object.keys(record).some(k=>!['website','description','source','reviewed_at','amounts'].includes(k)))
    throw new EntryError('VALIDATION_ERROR','Record must contain only website, description, source, reviewed_at and optional amounts.');
  if (!safeURL(record.website) || !safeURL(record.source)) throw new EntryError('VALIDATION_ERROR','Website and source must be HTTPS URLs without credentials.');
  if (typeof record.description!=='string' || record.description.trim().length<8 || record.description.length>500)
    throw new EntryError('VALIDATION_ERROR','Description must be 8–500 characters.');
  if (typeof record.reviewed_at!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(record.reviewed_at) || Number.isNaN(Date.parse(record.reviewed_at+'T00:00:00Z')) || new Date(record.reviewed_at+'T00:00:00Z').toISOString().slice(0,10)!==record.reviewed_at || record.reviewed_at>new Date().toISOString().slice(0,10))
    throw new EntryError('VALIDATION_ERROR','reviewed_at must be a valid non-future date in YYYY-MM-DD format.');
  if (record.amounts!==undefined) validateAmounts(record.amounts);
}
export class PartnerStore {
  constructor(root,{writeEnabled=false}={}) {
    this.root=path.resolve(root); this.writeEnabled=writeEnabled;
    this.file=path.join(this.root,'data/partners-reviewed.json');
    this.leads=path.join(this.root,'data/partner-leads.json');
    this.lock=path.join(this.root,'data/.atlas-mcp-write.lock');
  }
  async snapshot() {
    const root=await realpath(this.root);
    if (await realpath(path.join(root,'data'))!==path.join(root,'data')) throw new EntryError('UNSAFE_PATH','Data directory must not be a symlink.');
    for (const file of [this.file,this.leads]) {
      const stat=await lstat(file);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink!==1) throw new EntryError('UNSAFE_PATH','Partner files must be regular unlinked files.');
    }
    const [leadsText,reviewedText]=await Promise.all([readFile(this.leads,'utf8'),readFile(this.file,'utf8')]);
    const leads=JSON.parse(leadsText), reviewed=JSON.parse(reviewedText);
    if (!Array.isArray(leads) || leads.some(n=>typeof n!=='string') || !reviewed || typeof reviewed!=='object' || Array.isArray(reviewed))
      throw new EntryError('INVALID_CATALOGUE','Invalid partner data.');
    return {leads,reviewed,revision:digest(leadsText,reviewedText)};
  }
  async search(query='',limit=20) {
    if (typeof query!=='string' || query.length>200 || !Number.isInteger(limit) || limit<1 || limit>100)
      throw new EntryError('VALIDATION_ERROR','query must be text up to 200 characters and limit must be 1–100.');
    const s=await this.snapshot();
    const rows=s.leads.filter(name=>normalize([name,s.reviewed[name]?.description||'',s.reviewed[name]?.website||''].join(' ')).includes(normalize(query)));
    return {revision:s.revision,total:rows.length,partners:rows.slice(0,limit).map(name=>({name,record:Object.hasOwn(s.reviewed,name)?s.reviewed[name]:null}))};
  }
  async get(name) {
    if (typeof name!=='string' || name.length>200) throw new EntryError('VALIDATION_ERROR','name must be text up to 200 characters.');
    const s=await this.snapshot();
    if (!s.leads.includes(name)) throw new EntryError('NOT_FOUND','Partner name is not in the index.');
    return {name,record:Object.hasOwn(s.reviewed,name)?s.reviewed[name]:null,revision:s.revision};
  }
  async validate(name,record) {
    validateRecord(record);
    const s=await this.snapshot();
    if (!s.leads.includes(name)) throw new EntryError('NOT_FOUND','Partner name is not in the index; resolve and add the lead through the research workflow first.');
    return {name,record,revision:s.revision,persisted:false,previous:Object.hasOwn(s.reviewed,name)?s.reviewed[name]:null};
  }
  async upsert(name,record,expectedRevision) {
    if (!this.writeEnabled) throw new EntryError('READ_ONLY','Restart with --write to edit partner records.');
    validateRecord(record);
    if (typeof expectedRevision!=='string' || !/^[a-f0-9]{64}$/.test(expectedRevision)) throw new EntryError('VALIDATION_ERROR','expectedRevision must be the revision from validation.');
    await this.snapshot();
    let lock;
    try { lock=await open(this.lock,'wx',0o600); }
    catch(e) { if(e.code==='EEXIST') throw new EntryError('WRITE_BUSY','Another catalogue writer holds the lock.'); throw e; }
    let temporary;
    try {
      await lock.writeFile(JSON.stringify({pid:process.pid,createdAt:new Date().toISOString()}));
      const s=await this.snapshot();
      if (s.revision!==expectedRevision) throw new EntryError('STALE_REVISION','Partner records changed; validate again.');
      if (!s.leads.includes(name)) throw new EntryError('NOT_FOUND','Partner name is not in the index.');
      const updated={...(Object.hasOwn(s.reviewed,name)?s.reviewed[name]:{}),...record};
      // Do not let older extracted site text hide the newly reviewed record.
      delete updated.site_description; delete updated.site_source; delete updated.site_checked_at;
      const data={...s.reviewed,[name]:updated};
      temporary=path.join(this.root,'data',`.atlas-partner-${randomUUID()}.tmp`);
      const file=await open(temporary,'wx',0o600);
      try { await file.writeFile(JSON.stringify(data,null,2)+'\n'); await file.sync(); } finally { await file.close(); }
      if ((await this.snapshot()).revision!==expectedRevision) throw new EntryError('STALE_REVISION','Partner records changed during the write.');
      await rename(temporary,this.file); temporary=null;
      const directory=await open(path.dirname(this.file),'r'); try { await directory.sync(); } finally { await directory.close(); }
      return {status:'saved',name,revision:(await this.snapshot()).revision,published:false,sourceFile:'data/partners-reviewed.json'};
    } finally {
      if (temporary) await unlink(temporary).catch(()=>{});
      await lock.close(); await unlink(this.lock);
    }
  }
}
