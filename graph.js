import { QueryClient } from './vendor/tanstack-query/index.js';
import { createTable, getCoreRowModel, getPaginationRowModel } from './vendor/tanstack-table-core.mjs';
import { escapeHtml as esc, sourceUrl } from './logic.js';

const $=id=>document.getElementById(id);
const client=new QueryClient({defaultOptions:{queries:{staleTime:60_000,retry:false}}});
let snapshot, searchSequence=0;
const source=(url,label='Source')=>{const u=sourceUrl(url);return u?`<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>`:'';};
async function readSnapshot(){if(!snapshot){const response=await fetch('./data/graph.json',{cache:'no-cache'});if(!response.ok)throw new Error('Graph data unavailable');snapshot=await response.json();}return snapshot;}
async function rpc(method,body){
  const response=await fetch('./api/graph?method='+method,{method:'POST',headers:{'Content-Type':'application/json','Connect-Protocol-Version':'1'},body:JSON.stringify(body)});
  if(response.status===404 || response.status===405)return null;
  if(!response.ok)throw new Error('Graph service unavailable');
  return response.json();
}
async function search(query){
  let result; try { result=await rpc('Search',{query,kinds:['startup','partner','provider'],limit:100}); } catch(error){ throw error; }
  if(result)return result.entities||[];
  const graph=await readSnapshot(), q=query.trim().toLocaleLowerCase();
  return graph.entities.filter(e=>['startup','partner','provider'].includes(e.kind)&&(!q||(e.name+' '+(e.summary||'')).toLocaleLowerCase().includes(q))).sort((a,b)=>b.kind.localeCompare(a.kind)||a.name.localeCompare(b.name)).slice(0,100);
}
async function startup(id){
  const live=await rpc('GetStartup',{id});if(live)return {startup:live.startup,edges:live.relationships||[],related:live.relatedEntities||[],rounds:live.fundingRounds||[],articles:live.articles||[]};
  const g=await readSnapshot(), entity=g.entities.find(e=>e.id===id&&e.kind==='startup');if(!entity)throw new Error('Startup not found');
  const edges=g.edges.filter(e=>e.from===id||e.to===id), ids=new Set(edges.map(e=>e.from===id?e.to:e.from));
  return {startup:entity,edges,related:g.entities.filter(e=>ids.has(e.id)),rounds:g.funding_rounds.filter(r=>r.startup_id===id),articles:g.articles.filter(a=>a.startup_id===id)};
}
const money=(value,currency)=>value && currency?new Intl.NumberFormat('en-AU',{style:'currency',currency,maximumFractionDigits:0}).format(Number(value)):'Amount not disclosed';
function showDetail(data){
  const {startup:s,edges,related,rounds,articles}=data, names=Object.fromEntries(related.map(e=>[e.id,e]));
  rounds.sort((a,b)=>(b.announcedOn||b.announced_on||'').localeCompare(a.announcedOn||a.announced_on||''));
  articles.sort((a,b)=>(b.publishedOn||b.published_on||'').localeCompare(a.publishedOn||a.published_on||''));
  const relationships=edges.map(e=>{let other=names[e.from===s.id?e.to:e.from];if(!other)return '';let label=other.name,href=other.kind==='partner'?'./partner.html?name='+encodeURIComponent(label):'';return `<li>${href?`<a href="${esc(href)}">${esc(label)}</a>`:esc(label)} · ${esc(e.description)} ${source(e.source)}</li>`;}).join('');
  const logo=sourceUrl(s.logo)||(/^\.\/assets\/logos\/[a-z0-9-]+\.(?:svg|png)$/.test(s.logo||'')?s.logo:'');
  $('graph-detail').innerHTML=`<span class="graph-badge">Startup profile</span>${logo?`<img class="graph-logo" src="${esc(logo)}" alt="" referrerpolicy="no-referrer">`:''}<h2>${esc(s.name)}</h2><p>${esc(s.summary||'This startup is named in a sourced portfolio; its profile is still being researched.')}</p>${s.foundedYear||s.founded_year?`<p class="graph-muted">Founded ${esc(String(s.foundedYear||s.founded_year))}</p>`:''}${source(s.website,'Website')} ${source(s.source)} ${source(s.logoSource||s.logo_source,'Logo source')}<h3>Connections</h3>${relationships?`<ul>${relationships}</ul>`:'<p>No reviewed connections yet.</p>'}<h3>Funding</h3>${rounds.length?rounds.map(r=>`<div class="graph-funding"><strong>${esc(r.stage)} · ${esc(money(r.amount,r.currency))}</strong><p>${esc(r.announcedOn||r.announced_on||'Date unknown')}${r.valuation?` · historical valuation ${esc(money(r.valuation,r.valuationCurrency||r.valuation_currency))}`:''}</p>${r.note?`<p>${esc(r.note)}</p>`:''}${source(r.source)}</div>`).join(''):'<p>Funding has not yet been researched.</p>'}<h3>News &amp; sources</h3>${articles.length?`<ul>${articles.map(a=>`<li>${source(a.url,a.title)} <span class="graph-muted">${esc(a.publishedOn||a.published_on||'')}</span></li>`).join('')}</ul>`:'<p>No reviewed news articles yet.</p>'}<p class="graph-muted">Historical reporting and selected sources; funding and valuations are not necessarily current.</p>`;
}
async function loadStartup(id){$('graph-detail').innerHTML='<p>Loading startup…</p>';try{const value=await client.fetchQuery({queryKey:['startup',id],queryFn:()=>startup(id)});showDetail(value);history.replaceState(null,'',`?startup=${encodeURIComponent(id)}`);}catch{$('graph-detail').innerHTML='<p class="graph-error">Unable to load this startup. Please try again.</p>';}}
async function render(query){
  const sequence=++searchSequence;
  $('graph-results').textContent='Searching…';try{const rows=await client.fetchQuery({queryKey:['graph-search',query],queryFn:()=>search(query)});
    if(sequence!==searchSequence)return;
    const table=createTable({data:rows,columns:[{id:'name',accessorKey:'name'}],state:{pagination:{pageIndex:0,pageSize:100}},onStateChange:()=>{},renderFallbackValue:null,getCoreRowModel:getCoreRowModel(),getPaginationRowModel:getPaginationRowModel()});
    const count=table.getPrePaginationRowModel().rows.length;
    $('result-count').textContent=`${count}${rows.length===100?'+':''} ${count===1?'result':'results'}`;
    $('graph-results').innerHTML=table.getRowModel().rows.map(({original:e})=>`<button type="button" class="graph-row" data-kind="${esc(e.kind)}" data-id="${esc(e.id)}" data-name="${esc(e.name)}"><strong>${esc(e.name)}</strong><small>${esc(e.kind)}</small>${e.summary?`<p>${esc(e.summary)}</p>`:''}</button>`).join('')||'<p>No results found.</p>';
  }catch{if(sequence===searchSequence)$('graph-results').innerHTML='<p class="graph-error">The graph could not be loaded. Please retry.</p>';}}
$('graph-search').addEventListener('submit',e=>{e.preventDefault();render($('graph-query').value.trim());});
$('graph-results').addEventListener('click',e=>{const row=e.target.closest('button[data-id]');if(!row)return;if(row.dataset.kind==='startup')loadStartup(row.dataset.id);else if(row.dataset.kind==='partner')location.href='./partner.html?name='+encodeURIComponent(row.dataset.name);else { $('graph-detail').innerHTML=`<span class="graph-badge">Provider</span><h2>${esc(row.dataset.name)}</h2><p>Explore this provider's opportunities in the directory.</p><a href="./?q=${encodeURIComponent(row.dataset.name)}#directory">View opportunities ↗</a>`; }});
render('');const selected=new URLSearchParams(location.search).get('startup');if(selected)loadStartup(selected);
