import {readdir,readFile,writeFile} from 'node:fs/promises';
import {partnerRelationships} from '../web/relationships.js';
import {logoFor} from '../web/logos.js';
const path=new URL('../data/graph.json',import.meta.url);
const graph=JSON.parse(await readFile(path,'utf8'));
const slug=s=>s.normalize('NFKD').replace(/[^\x00-\x7f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const ids=new Set(graph.entities.map(e=>e.id));
const byId=new Map(graph.entities.map(e=>[e.id,e]));
const known={AWS:'Amazon Web Services'};
// §2 freshness + confidence enrichment, mirroring scripts/make-graph.py and
// scripts/edge_scoring.py (this script runs after make-graph in the
// data:generate chain, so edges added here must carry the same fields).
// The verification stamp is the relation's own recorded `checked` date from
// web/relationships.js — never invented: an absent/unparseable stamp leaves
// first_seen/last_verified null and the edge stale, exactly as in the
// Python model.
const hostOf=url=>{if(!url) return ''; try{return new URL(url).hostname.toLowerCase().replace(/^www\./,'').replace(/\.$/,'');}catch{return '';}};
const asDate=value=>{if(typeof value!=='string') return null; const m=value.trim().match(/^\d{4}-\d{2}-\d{2}/); if(!m) return null; const d=new Date(m[0]+'T00:00:00Z'); return Number.isNaN(d.getTime())?null:m[0];};
const todayUTC=new Date().toISOString().slice(0,10);
const enrich=(edge,verified)=>{
  const lastVerified=asDate(verified);
  const sourceHost=hostOf(edge.source);
  const endpointHosts=new Set([byId.get(edge.from)?.website,byId.get(edge.to)?.website].map(hostOf).filter(Boolean));
  const isPrimary=Boolean(sourceHost)&&endpointHosts.has(sourceHost);
  const type=isPrimary?'primary':'secondary';
  // Single source: base 0.50, +0.10 when primary, single-source cap 0.80,
  // floor 0.05 / ceiling 0.95 (edge_scoring.score_edge).
  const confidence=Math.min(0.8,Math.max(0.05,0.5+(isPrimary?0.1:0)));
  edge.first_seen=lastVerified;
  edge.last_verified=lastVerified;
  edge.confidence=Math.round(confidence*100)/100;
  edge.confidence_basis={sources:1,source_types:[type],agreement:false,inferred:false};
  edge.stale=lastVerified===null||(Date.parse(todayUTC)-Date.parse(lastVerified))/86400000>90;
  return edge;
};
for(const [partner,relationships] of Object.entries(partnerRelationships)) {
  const partnerId='partner:'+slug(partner); if(!ids.has(partnerId)) continue;
  for(const relation of relationships) {
    // Screenshot-only claims lack an attributable public source; keep them in
    // the existing directory, not in the sourced graph.
    if(!relation.source) continue;
    const providerName=known[relation.provider]||relation.provider, providerId='provider:'+slug(providerName);
    if(!ids.has(providerId)){const entity={id:providerId,kind:'provider',name:providerName}; graph.entities.push(entity); byId.set(providerId,entity); ids.add(providerId);}
    graph.edges.push(enrich({from:providerId,to:partnerId,kind:'programme_relationship',description:relation.programme+' · '+relation.relationship,source:relation.source},relation.checked));
  }
}
const manifests=new URL('../web/assets/manifests/',import.meta.url);
const files=(await readdir(manifests)).filter(name=>name.endsWith('.json')).sort();
const logoSources=new Map();
for(const file of files){
  const asset=JSON.parse(await readFile(new URL(file,manifests),'utf8'));
  if(asset.role==='logo') logoSources.set(`${asset.name}\0${asset.target}`,asset.source_page);
}
for(const entity of graph.entities){
  const local=entity.kind!=='person' && logoFor(entity.name);
  if(!entity.logo && local){
    entity.logo=local;
    entity.logo_source=logoSources.get(`${entity.name}\0web/${local.slice(2)}`) || 'https://github.com/castlemilk/startup-atlas/blob/main/web/assets/logos/README.md';
  }
}
graph.entities.sort((a,b)=>a.id.localeCompare(b.id));
graph.edges.sort((a,b)=>[a.from,a.to,a.kind,a.source].join('\0').localeCompare([b.from,b.to,b.kind,b.source].join('\0')));
const content=JSON.stringify(graph,null,2)+'\n';
await writeFile(path,content);await writeFile(new URL('../backend/internal/graph/snapshot.json',import.meta.url),content);
