const htmlEntities = {'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'};
const esc = value => String(value).replace(/[&<>"']/g, character=>htmlEntities[character]);

export function startupSourceCoverage(graph) {
  const sources = new Map();
  const people = new Set();
  function add(set, value) {
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:') return;
      url.hash = '';
      set.add(url.href);
    } catch { /* An invalid source contributes no coverage. */ }
  }

  for (const entity of graph.entities) {
    if (entity.kind === 'person') people.add(entity.id);
    if (entity.kind !== 'startup') continue;
    const groups = { profile: new Set(), founders: new Set(), funding: new Set() };
    add(groups.profile, entity.source);
    for (const fact of Array.isArray(entity.profile_facts) ? entity.profile_facts : []) {
      if (fact.label && fact.value) add(groups.profile, fact.source);
    }
    sources.set(entity.id, groups);
  }
  for (const edge of graph.edges) {
    const company = sources.get(edge.to);
    if (company && edge.kind === 'founded' && people.has(edge.from)) add(company.founders, edge.source);
  }
  for (const round of graph.funding_rounds) {
    const company = sources.get(round.startup_id);
    if (company) add(company.funding, round.source);
  }
  return new Map([...sources].map(([id, groups]) => [id, {
    profile: groups.profile.size, founders: groups.founders.size, funding: groups.funding.size,
  }]));
}

const groups = [['profile','Profile'], ['founders','Founders'], ['funding','Funding']];
const gapOptions = [['all','All companies'], ['any','Any missing area'], ...groups.map(([key,label])=>[key,`${label} missing`])];
const size = 40;
const countFormat = new Intl.NumberFormat('en');
const number = value=>countFormat.format(value);
const collator = new Intl.Collator('en',{sensitivity:'base',numeric:true});

export function coverageDashboard({graph,revision,head}, params) {
  const query=(params.get('q') || '').trim().slice(0,160);
  const search=query.toLowerCase();
  const gap=gapOptions.some(([key])=>key===params.get('gap')) ? params.get('gap') : 'all';
  const counts=startupSourceCoverage(graph);
  const records=graph.entities.filter(entity=>counts.has(entity.id)).map(entity=>{
    const sources=counts.get(entity.id);
    return {entity,sources,missing:groups.filter(([key])=>!sources[key]).length};
  });
  const matched=records.filter(({entity,sources,missing})=>
    `${entity.name} ${entity.id}`.toLowerCase().includes(search) &&
    (gap==='all' || (gap==='any' ? missing>0 : !sources[gap])));
  matched.sort((a,b)=>b.missing-a.missing || collator.compare(a.entity.name,b.entity.name) || a.entity.id.localeCompare(b.entity.id));
  const pages=Math.ceil(matched.length/size);
  const requested=Number(params.get('page'));
  const current=Number.isSafeInteger(requested) ? Math.max(1,Math.min(pages,requested)) : 1;
  const first=(current-1)*size;
  const rows=matched.slice(first,first+size);
  const revisionLabel=!revision ? 'Published revision unavailable' : revision===head ? 'Published graph matches main' : 'Published graph differs from main';
  const revisionLink=sha=>/^[a-f0-9]{40}$/.test(sha ?? '') ? `<a href="https://github.com/castlemilk/startup-atlas/commit/${esc(sha)}"><code>${esc(sha.slice(0,12))}</code></a>` : 'Unknown';
  const options=gapOptions.map(([key,label])=>`<option value="${key}"${key===gap?' selected':''}>${label}</option>`).join('');
  const pageLink=page=>`/coverage?${esc(new URLSearchParams({q:query,gap,page:String(page)}).toString())}`;
  const resultLabel=rows.length ? `Showing ${number(first+1)}–${number(first+rows.length)} of ${number(matched.length)} ${matched.length===1?'company':'companies'}` : 'No companies match these filters';
  return `<section class="coverage-dashboard" aria-labelledby="coverage-title">
  <a href="/">← Connection</a>
  <header><h2 id="coverage-title">Evidence coverage</h2><p>Review source gaps in the published company records.</p></header>
  <div class="coverage-revision"><strong>${revisionLabel}</strong><span>Published ${revisionLink(revision)} · Main ${revisionLink(head)}</span></div>
  <dl class="coverage-metrics" aria-label="Companies with sources">
    ${groups.map(([key,label])=>`<div><dt>${label}</dt><dd>${number(records.filter(({sources})=>sources[key]>0).length)} <small>of ${number(records.length)}</small></dd></div>`).join('')}
  </dl>
  <p class="coverage-note">Counts use distinct source URLs within each area. Open a profile to review the underlying sources.</p>
  <form class="coverage-filters" method="get" action="/coverage">
    <div class="coverage-filter-field"><label for="coverage-query">Company</label><input id="coverage-query" name="q" type="search" value="${esc(query)}" maxlength="160" placeholder="Search by name"></div>
    <div class="coverage-filter-field"><label for="coverage-gap">Coverage</label><select id="coverage-gap" name="gap">${options}</select></div>
    <button type="submit">Apply filters</button>
    ${query || gap!=='all' ? '<a href="/coverage">Clear filters</a>' : ''}
  </form>
  <p class="coverage-range">${resultLabel}</p>
  ${rows.length ? `<table class="coverage-table" role="table" aria-label="Source counts by company">
    <thead><tr><th scope="col">Company</th>${groups.map(([,label])=>`<th scope="col">${label}</th>`).join('')}</tr></thead>
    <tbody role="rowgroup">${rows.map(({entity,sources})=>`<tr role="row" data-company-id="${esc(entity.id)}">
      <th scope="row" role="rowheader"><a href="https://castlemilk.github.io/startup-atlas/entity.html?id=${encodeURIComponent(entity.id)}#entity-sources">${esc(entity.name)}</a></th>
      ${groups.map(([key,label])=>`<td role="cell" data-group="${key}" data-count="${sources[key]}"><span class="coverage-cell-label">${label}</span><span${sources[key]?'':' class="coverage-missing"'}>${sources[key] ? number(sources[key]) : 'Missing'}</span></td>`).join('')}
    </tr>`).join('')}</tbody></table>` : ''}
  ${pages>1 ? `<nav class="coverage-pages" aria-label="Coverage pages">${current>1?`<a href="${pageLink(current-1)}">← Previous</a>`:''}<span>Page ${number(current)} of ${number(pages)}</span>${current<pages?`<a href="${pageLink(current+1)}">Next →</a>`:''}</nav>` : ''}
  </section>`;
}

export const coverageStyles = `
body:has(.coverage-dashboard){max-width:67rem}
.coverage-dashboard header{margin:1.2rem 0}
.coverage-dashboard h2{font-size:clamp(1.8rem,5vw,2.55rem);letter-spacing:-.035em;margin:0}
.coverage-dashboard header p,.coverage-note{color:#b3c5bc;margin:.45rem 0}
.coverage-revision{display:flex;flex-wrap:wrap;gap:.3rem 1rem;padding:.75rem 1rem;background:#182b22;border:1px solid #385442;border-radius:.5rem}
.coverage-revision span,.coverage-note,.coverage-range{font-size:.875rem}
.coverage-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.5rem;margin:1rem 0 .6rem}
.coverage-metrics div{min-width:0;padding:.7rem clamp(.5rem,2vw,1rem);border:1px solid #385442;border-radius:.5rem}
.coverage-metrics dt,.coverage-cell-label{color:#b3c5bc;font-size:.8125rem}
.coverage-metrics dd{margin:0;font-size:1.4rem;font-weight:650;font-variant-numeric:tabular-nums}
.coverage-metrics small{display:inline;font-weight:450}
.coverage-filters{display:flex;flex-wrap:wrap;gap:.6rem;align-items:end;margin:1.25rem 0 .85rem}
.coverage-filter-field:first-child{flex:1 1 14rem}
.coverage-filter-field{min-width:0;font-size:.875rem}
.coverage-filters :is(input,select){display:block;width:100%;min-height:44px;margin:.3rem 0 0;padding:.5rem .6rem;font:inherit;font-size:1rem;color:inherit;background:#182521;border:1px solid #829b8f;border-radius:.4rem}
.coverage-filters button{padding:.35rem .85rem}
.coverage-filters a{padding:.55rem .3rem}
.coverage-filters select:focus-visible{outline:3px solid #b3e5cc;outline-offset:4px}
.coverage-range{margin:.5rem 0}
.coverage-table{width:100%;border-collapse:collapse;text-align:start}
.coverage-table th,.coverage-table td{padding:.6rem .75rem;border-bottom:1px solid #385442;text-align:start;overflow-wrap:anywhere}
.coverage-table thead{background:#182b22;color:#d9ede3}
.coverage-table td{font-variant-numeric:tabular-nums}
.coverage-cell-label{display:none}
.coverage-missing{color:#f1ba94;font-size:.9rem}
.coverage-pages{display:flex;flex-wrap:wrap;gap:1rem;align-items:center;margin:1rem 0}
.coverage-pages a{display:inline-flex;align-items:center;min-height:44px}
@media(max-width:520px){
  .coverage-filter-field{flex:1 1 10rem}
  .coverage-table,.coverage-table tbody{display:block}
  .coverage-table thead{display:none}
  .coverage-table tbody tr{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.4rem;padding:.65rem .75rem;border:1px solid #385442;border-radius:.5rem;margin-bottom:.5rem}
  .coverage-table tbody th{grid-column:1/-1}
  .coverage-table tbody :is(th,td){padding:0;border:0}
  .coverage-cell-label{display:block}
}`;
