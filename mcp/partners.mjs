import { createHash, randomUUID } from 'node:crypto';
import { readFile, lstat, realpath, open, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { EntryError } from '../scripts/catalogue-entries.mjs';

const digest=(...parts)=>createHash('sha256').update(JSON.stringify(parts)).digest('hex');
const normalize=s=>s.normalize('NFKC').toLocaleLowerCase().trim();
function safeURL(value) {
  try { const u=new URL(value); return u.protocol==='https:' && !!u.hostname && !u.username && !u.password && (!u.port || u.port==='443'); }
  catch { return false; }
}
function validateRecord(record) {
  if (!record || Array.isArray(record) || typeof record!=='object' || Object.keys(record).some(k=>!['website','description','source','reviewed_at'].includes(k)))
    throw new EntryError('VALIDATION_ERROR','Record must contain only website, description, source and reviewed_at.');
  if (!safeURL(record.website) || !safeURL(record.source)) throw new EntryError('VALIDATION_ERROR','Website and source must be HTTPS URLs without credentials.');
  if (typeof record.description!=='string' || record.description.trim().length<8 || record.description.length>500)
    throw new EntryError('VALIDATION_ERROR','Description must be 8–500 characters.');
  if (typeof record.reviewed_at!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(record.reviewed_at) || Number.isNaN(Date.parse(record.reviewed_at+'T00:00:00Z')) || new Date(record.reviewed_at+'T00:00:00Z').toISOString().slice(0,10)!==record.reviewed_at || record.reviewed_at>new Date().toISOString().slice(0,10))
    throw new EntryError('VALIDATION_ERROR','reviewed_at must be a valid non-future date in YYYY-MM-DD format.');
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
      const data={...s.reviewed,[name]:{...(Object.hasOwn(s.reviewed,name)?s.reviewed[name]:{}),...record}};
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
