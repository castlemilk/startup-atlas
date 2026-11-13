import { getGraph, getOpportunity, getPublicDocument, searchGraph } from './graph-sql.js';
import { searchSnapshot } from './graph-model.js';

let storePromise;
async function json(path) {
  const response=await fetch(path,{cache:'no-cache'});
  if(!response.ok) throw new Error('Data unavailable');
  return response.json();
}

// One read-only snapshot per page; if WASM is unavailable, preserve navigation
// and source attribution through the matching published JSON files.
export function openGraph() {
  if(!storePromise) storePromise=(async()=>{
    try {
      if(typeof globalThis.initSqlJs!=='function') throw new Error('SQLite unavailable');
      const [SQL,response]=await Promise.all([
        globalThis.initSqlJs({locateFile:file=>'./vendor/sql.js/'+file}),
        fetch('./data/atlas.sqlite',{cache:'no-cache'})
      ]);
      if(!response.ok) throw new Error('Database unavailable');
      const db=new SQL.Database(new Uint8Array(await response.arrayBuffer()));
      return {mode:'database',graph:getGraph(db),search:(query,limit)=>searchGraph(db,query,limit),
        document:name=>Promise.resolve(getPublicDocument(db,name)),
        opportunity:id=>Promise.resolve(getOpportunity(db,id))};
    } catch {
      const graph=await json('./data/graph.json');
      return {mode:'fallback',graph,search:(query,limit)=>searchSnapshot(graph,query,limit),
        document:name=>json('./data/'+name),
        opportunity:async id=>(await json('./data/catalogue.json')).opportunities.find(item=>item.id===id)||null};
    }
  })();
  return storePromise;
}
