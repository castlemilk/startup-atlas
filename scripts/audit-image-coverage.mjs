// Inventory references, not remote availability or identity verification.
import { access, readFile } from 'node:fs/promises';
import { logoFor } from '../web/logos.js';
import { graphArtwork } from '../web/graph-artwork.js';
const read=async path=>JSON.parse(await readFile(new URL(path,import.meta.url),'utf8'));

if (process.argv.includes('--graph')) {
  const graph=await read('../data/graph.json');
  const connections=new Map();
  for (const {from,to} of graph.edges) {
    connections.set(from,1+(connections.get(from)||0));
    connections.set(to,1+(connections.get(to)||0));
  }
  const kinds={};
  for (const entity of graph.entities) {
    const {url}=graphArtwork(entity);
    const row=kinds[entity.kind] ??= {total:0,local:0,remote:0,initials:0,unresolved:[]};
    row.total++;
    const local=url.startsWith('./');
    if (local && await access(new URL(url.slice(2),new URL('../web/',import.meta.url))).then(()=>true,()=>false)) row.local++;
    else if (!local && url) row.remote++;
    else {
      row.initials++;
      row.unresolved.push({id:entity.id,name:entity.name,connections:connections.get(entity.id)||0,
        source:entity.website||entity.source||null,reason:local?'missing-local-file':'no-reviewed-image'});
    }
  }
  for (const row of Object.values(kinds)) {
    row.unresolved.sort((a,b)=>b.connections-a.connections||a.name.localeCompare(b.name));
  }
  console.log(JSON.stringify({revision:graph.source_revision||null,kinds},null,2));
} else {
  const [profiles,catalogue,research]=await Promise.all([read('../data/partner-profiles.json'),read('../data/catalogue.json'),read('../data/startup-research.json')]);
  const companyRows=Object.entries(profiles).flatMap(([partner,p])=>(p.companies||[]).map(c=>({partner,name:c.name,hasImage:!!logoFor(c.name)||!!(c.logo&&c.logo_source)})));
  const programRows=catalogue.opportunities.map(o=>({name:o.name,provider:o.org,hasImage:!!logoFor(o.org)}));
  const partnerRows=Object.keys(profiles).map(name=>({name,hasImage:!!logoFor(name)}));
  const portraitRows=[
    ...Object.entries(profiles).flatMap(([partner,p])=>(p.people||[]).map(person=>({partner,name:person.name,hasImage:!!(person.photo&&person.photo_source)}))),
    ...research.startups.flatMap(s=>(s.founders||[]).map(f=>({company:s.name,name:f.name,hasImage:!!(f.photo_url&&f.photo_source)})))
  ];
  for (const [label,rows] of [['companies',companyRows],['opportunities',programRows],['partners',partnerRows],['portraits',portraitRows]]) {
    const missing=rows.filter(r=>!r.hasImage);
    console.log(JSON.stringify({kind:label,total:rows.length,withImage:rows.length-missing.length,missing:missing.length,unresolved:missing},null,2));
  }
}
