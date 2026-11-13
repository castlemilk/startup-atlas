// Inventory references, not remote availability or identity verification.
import { readFile } from 'node:fs/promises';
import { logoFor } from '../logos.js';
const read=async path=>JSON.parse(await readFile(new URL(path,import.meta.url),'utf8'));
const [profiles,catalogue]=await Promise.all([read('../data/partner-profiles.json'),read('../data/catalogue.json')]);
const companyRows=Object.entries(profiles).flatMap(([partner,p])=>(p.companies||[]).map(c=>({partner,name:c.name,hasImage:!!logoFor(c.name)||!!(c.logo&&c.logo_source)})));
const programRows=catalogue.opportunities.map(o=>({name:o.name,provider:o.org,hasImage:!!logoFor(o.org)}));
for (const [label,rows] of [['companies',companyRows],['opportunities',programRows]]) {
  const missing=rows.filter(r=>!r.hasImage);
  console.log(JSON.stringify({kind:label,total:rows.length,withImage:rows.length-missing.length,missing:missing.length,unresolved:missing},null,2));
}
