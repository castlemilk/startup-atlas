import {readFile,writeFile} from 'node:fs/promises';
import {partnerRelationships} from '../relationships.js';
import {logoFor} from '../logos.js';
const path=new URL('../data/graph.json',import.meta.url);
const graph=JSON.parse(await readFile(path,'utf8'));
const slug=s=>s.normalize('NFKD').replace(/[^\x00-\x7f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const ids=new Set(graph.entities.map(e=>e.id));
for(const entity of graph.entities){
  const local=logoFor(entity.name);
  if(!entity.logo && local){entity.logo=local;entity.logo_source='https://github.com/castlemilk/startup-atlas/blob/main/assets/logos/README.md';}
}
const known={AWS:'Amazon Web Services'};
for(const [partner,relationships] of Object.entries(partnerRelationships)) {
  const partnerId='partner:'+slug(partner); if(!ids.has(partnerId)) continue;
  for(const relation of relationships) {
    // Screenshot-only claims lack an attributable public source; keep them in
    // the existing directory, not in the sourced graph.
    if(!relation.source) continue;
    const providerName=known[relation.provider]||relation.provider, providerId='provider:'+slug(providerName);
    if(!ids.has(providerId)){graph.entities.push({id:providerId,kind:'provider',name:providerName});ids.add(providerId);}
    graph.edges.push({from:providerId,to:partnerId,kind:'programme_relationship',description:relation.programme+' · '+relation.relationship,source:relation.source});
  }
}
graph.entities.sort((a,b)=>a.id.localeCompare(b.id));
graph.edges.sort((a,b)=>[a.from,a.to,a.kind,a.source].join('\0').localeCompare([b.from,b.to,b.kind,b.source].join('\0')));
const content=JSON.stringify(graph,null,2)+'\n';
await writeFile(path,content);await writeFile(new URL('../internal/graph/snapshot.json',import.meta.url),content);
