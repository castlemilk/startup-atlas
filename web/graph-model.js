// Shared graph operations. Only reviewed edges in the published snapshot are
// traversed; visual proximity never creates a relationship.
import { sourceUrl } from './logic.js';

export const slug = name => name.normalize('NFKD').replace(/[^\x00-\x7f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
export const teamPersonId = (name,partner) => `person:${slug(name)}--${slug(partner)}`;
export const entityHref = entity => entity.kind==='partner'
  ? `./partner.html?name=${encodeURIComponent(entity.name)}`
  : `./entity.html?id=${encodeURIComponent(entity.id)}`;
export const kindName = kind => ({partner:'Partner',provider:'Provider',startup:'Startup',person:'Person',programme:'Programme'}[kind] || 'Organisation');

export function entityDetails(graph,id) {
  const entity=graph.entities.find(item=>item.id===id);
  if(!entity) throw new Error('Entity not found');
  const edges=graph.edges.filter(edge=>edge.from===id || edge.to===id);
  const identities=new Set(edges.map(edge=>edge.from===id ? edge.to : edge.from));
  return {entity,edges,related:graph.entities.filter(item=>identities.has(item.id)),
    rounds:graph.funding_rounds.filter(item=>item.startup_id===id),
    articles:graph.articles.filter(item=>item.startup_id===id)};
}

export function fundingTimelineArticles(articles, rounds) {
  const roundSources = new Set(rounds.map(round => sourceUrl(round.source)).filter(Boolean));
  return articles.filter(article => {
    const url = sourceUrl(article.url);
    // Preserve intentional article categories while suppressing round-link
    // duplicates in both current snapshots and cached legacy snapshots.
    return url && !(['funding source', 'funding announcement'].includes(article.kind) && roundSources.has(url));
  });
}

// Search ranking policy (#76; documented in docs/EXPLORER-VIEWS.md, "List
// and search"). One policy, shared by the SQLite search (graph-sql.js) and
// the JSON fallback below, so both paths order identical queries identically:
//   tier 0 — the query exactly equals the entity name;
//   tier 1 — the query exactly equals one of the entity's aliases
//            (former/alternate names from the identity registry);
//   tier 2 — the entity name starts with the query;
//   tier 3 — every query term appears in the entity name;
//   tier 4 — an alias starts with the query, or every term appears in an alias;
//   tier 5 — any other match (summary, connections, funding or article text).
// Within a tier: startups before other kinds, then name A–Z, then entity id,
// so ordering is fully deterministic and never depends on FTS defaults.
const normalizeSearchText = value => (value || '').normalize('NFKC').toLocaleLowerCase().trim();

export function searchTier(entity,query) {
  const q=normalizeSearchText(query);
  if(!q) return 0;
  const terms=q.match(/[\p{L}\p{N}]+/gu) || [];
  const name=normalizeSearchText(entity.name);
  const aliases=(entity.aliases || []).map(normalizeSearchText).filter(Boolean);
  if(name===q) return 0;
  if(aliases.includes(q)) return 1;
  if(name.startsWith(q)) return 2;
  if(terms.length && terms.every(term=>name.includes(term))) return 3;
  if(aliases.some(alias=>alias.startsWith(q)) || (terms.length && aliases.some(alias=>terms.every(term=>alias.includes(term))))) return 4;
  return 5;
}

export function rankSearchResults(results,query) {
  return [...results].sort((a,b)=>
    searchTier(a,query)-searchTier(b,query)
    || (b.kind==='startup')-(a.kind==='startup')
    || a.name.localeCompare(b.name)
    || a.id.localeCompare(b.id));
}

export function searchSnapshot(graph,query,limit=100) {
  const q=query.trim().normalize('NFKC').toLocaleLowerCase();
  const terms=q.match(/[\p{L}\p{N}]+/gu) || [];
  if(q && !terms.length) return [];
  const names=new Map(graph.entities.map(item=>[item.id,item.name]));
  const context=new Map(graph.entities.map(item=>[item.id,[]]));
  for(const edge of graph.edges) {
    context.get(edge.from)?.push(names.get(edge.to) || '');
    context.get(edge.to)?.push(names.get(edge.from) || '');
  }
  for(const round of graph.funding_rounds) context.get(round.startup_id)?.push(round.stage || '',round.note || '');
  for(const article of graph.articles) context.get(article.startup_id)?.push(article.title || '');
  const matches=graph.entities.filter(item=>{
    const haystack=[item.name,item.summary || '',...(item.aliases || []),...(context.get(item.id)||[])].join(' ').normalize('NFKC').toLocaleLowerCase();
    return terms.every(term=>haystack.includes(term));
  });
  return rankSearchResults(matches,q).slice(0,limit);
}

export function neighborhood(graph,rootId,{depth=1,kinds=null,limit=24}={}) {
  const byId=new Map(graph.entities.map(item=>[item.id,item]));
  if(!byId.has(rootId)) throw new Error('Entity not found');
  const allowed=kinds ? new Set(kinds) : null;
  const seen=new Map([[rootId,0]]);let frontier=[rootId],truncated=false;
  const priority={person:0,partner:1,startup:2,programme:3,provider:4};
  for(let level=1;level<=Math.min(2,Math.max(1,depth));level++) {
    const candidates=new Map();
    for(const id of frontier) for(const edge of graph.edges) {
      const other=edge.from===id?edge.to:edge.to===id?edge.from:null;
      if(other && byId.has(other) && !seen.has(other) && (!allowed || allowed.has(byId.get(other).kind))) {
        // On a constrained view, preserve a founder's other ventures before
        // less relevant second-hop team members of portfolio firms.
        const founderPath=level===2 && byId.get(id).kind==='person' && edge.kind==='founded' && byId.get(other).kind==='startup';
        const rank=(priority[byId.get(other).kind]??9)-(founderPath?10:0);
        candidates.set(other,Math.min(candidates.get(other)??Infinity,rank));
      }
    }
    const ordered=[...candidates.keys()].sort((a,b)=>candidates.get(a)-candidates.get(b) || byId.get(a).name.localeCompare(byId.get(b).name));
    frontier=[];
    for(const id of ordered) {if(seen.size>=limit){truncated=true;continue;}seen.set(id,level);frontier.push(id);}
  }
  return {nodes:[...seen].map(([id,level])=>({...byId.get(id),level})),
    edges:graph.edges.filter(edge=>seen.has(edge.from)&&seen.has(edge.to)),truncated};
}
