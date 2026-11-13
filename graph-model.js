// Shared graph operations. Only reviewed edges in the published snapshot are
// traversed; visual proximity never creates a relationship.
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
  return graph.entities.filter(item=>{
    const haystack=[item.name,item.summary || '',...(context.get(item.id)||[])].join(' ').normalize('NFKC').toLocaleLowerCase();
    return terms.every(term=>haystack.includes(term));
  }).sort((a,b)=>{
    const rank=item=>item.name.toLocaleLowerCase()===q?0:item.name.toLocaleLowerCase().startsWith(q)?1:2;
    return rank(a)-rank(b) || (b.kind==='startup')-(a.kind==='startup') || a.name.localeCompare(b.name);
  }).slice(0,limit);
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
