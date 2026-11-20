// Browser-level treemap and ranked-card checks. Uses the Chrome already installed
// on the GitHub Actions runner and Node's built-in CDP WebSocket client.
import assert from 'node:assert/strict';
import {makeView,formatValue,indexTreemapEvidence} from '../dist/treemap-model.js';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {mkdtemp, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {extname, join, resolve, sep} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';

const root=resolve('dist'), profile=await mkdtemp(join(tmpdir(),'atlas-treemap-chrome-'));
const screenshotDir=process.env.ATLAS_SCREENSHOTS_DIR||join(tmpdir(),'atlas-treemap-screenshots');
const contentTypes={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.sqlite':'application/octet-stream','.svg':'image/svg+xml','.png':'image/png'};
const requests=[];
let markFixture;
const server=createServer(async(req,res)=>{
  try {
    const path=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
    if(path!==root&&!path.startsWith(root+sep)){res.writeHead(403).end();return;}
    const bytes=markFixture && path===join(root,'data','graph.json')
      ? markFixture
      : await readFile(path===root?join(root,'index.html'):path);
    requests.push({url:req.url,status:200});
    res.writeHead(200,{'Content-Type':contentTypes[extname(path)]||'application/octet-stream'}).end(bytes);
  } catch {requests.push({url:req.url,status:404});res.writeHead(404).end();}
});
await new Promise((resolveListen,reject)=>server.once('error',reject).listen(0,'127.0.0.1',resolveListen));
const address=`http://127.0.0.1:${server.address().port}`;
const chrome=spawn(process.env.CHROME_BIN||'google-chrome',[
  '--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--disable-background-networking','--disable-extensions','--no-first-run',
  '--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'
],{stdio:['ignore','ignore','pipe']});
let socket, spawnError, chromeExit, chromeLog='';
let captureFailure=async()=>{}, readDiagnostics=async()=>({state:'unavailable'});
chrome.on('error',error=>{spawnError=error;});
chrome.on('exit',(code,signal)=>{chromeExit=`Chrome exited (${code ?? signal})`;});
chrome.stderr.on('data',chunk=>{chromeLog=(chromeLog+chunk.toString()).slice(-5000);});

async function until(fn,message,attempts=100) {
  for(let i=0;i<attempts;i++) {
    if(spawnError)throw spawnError;
    if(chromeExit)throw new Error(chromeExit+'\n'+chromeLog);
    const result=await fn().catch(()=>null);
    if(result)return result;
    await delay(100);
  }
  throw new Error(message+'\n'+chromeLog);
}
try {
  // Cold CI runners can take longer to start Chrome; allow 45 seconds only here.
  // Page interactions retain the normal polling budget.
  const port=await until(async()=>Number((await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]),'Chrome did not start',450);
  const target=await until(async()=>{
    const targets=await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    return targets.find(item=>item.type==='page');
  },'Chrome did not expose a page',450);
  socket=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolveOpen,reject)=>{socket.addEventListener('open',resolveOpen,{once:true});socket.addEventListener('error',reject,{once:true});});
  const pending=new Map(), exceptions=[], browserMessages=[];let sequence=0, documentLoads=0, pausedRequests=0;
  socket.addEventListener('message',event=>{
    const message=JSON.parse(event.data);
    if(message.method==='Page.domContentEventFired')documentLoads++;
    if(message.method==='Fetch.requestPaused')pausedRequests++;
    if(message.method==='Runtime.exceptionThrown')exceptions.push(message.params.exceptionDetails.exception?.description||message.params.exceptionDetails.text);
    if(message.method==='Runtime.consoleAPICalled'&&['error','warning'].includes(message.params.type))browserMessages.push(message.params.args.map(item=>item.value||item.description||'').join(' '));
    if(!message.id)return;
    const item=pending.get(message.id);if(!item)return;pending.delete(message.id);
    if(message.error)item.reject(new Error(message.error.message));else item.resolve(message.result);
  });
  function command(method,params={}) {
    const id=++sequence;
    return new Promise((resolveCommand,reject)=>{pending.set(id,{resolve:resolveCommand,reject});socket.send(JSON.stringify({id,method,params}));});
  }
  async function evaluate(expression) {
    const response=await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
    if(response.exceptionDetails)throw new Error(response.exceptionDetails.text);
    return response.result.value;
  }
  async function move(type,x,y,button='none',buttons=0) {
    await command('Input.dispatchMouseEvent',{type,x,y,button,buttons,clickCount:1});
  }
  async function drag(x,y,dx,dy) {
    await move('mouseMoved',x,y);
    await move('mousePressed',x,y,'left',1);
    await move('mouseMoved',x+dx,y+dy,'left',1);
    await move('mouseReleased',x+dx,y+dy,'left',0);
  }
  async function screenshot(name,fullPage=false) {
    await mkdir(screenshotDir,{recursive:true});
    const params={format:'png'};
    if(fullPage){
      await evaluate("scrollTo({top:0,behavior:'instant'})");
      const size=await evaluate('({width:innerWidth,height:Math.min(document.documentElement.scrollHeight,3600)})');
      params.captureBeyondViewport=true;params.clip={x:0,y:0,...size,scale:1};
    }
    const image=await command('Page.captureScreenshot',params);
    await writeFile(join(screenshotDir,name),Buffer.from(image.data,'base64'));
  }
  captureFailure=screenshot;
  await command('Runtime.enable'); await command('Page.enable');
  await command('Page.bringToFront');
  await command('Emulation.setFocusEmulationEnabled',{enabled:true});
  await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});
  const settled=()=>until(()=>evaluate("document.querySelector('#treemap-workspace')?.getAttribute('aria-busy')==='false'"),'Treemap did not settle');
  const navigate = async suffix => {
    const before=documentLoads;
    await command('Page.navigate',{url:address+'/treemap.html'+suffix});
    await until(async()=>documentLoads>before,'Treemap navigation did not load a new document');
    await settled();
  };
  const reload=async()=>{
    const before=documentLoads;await command('Page.reload');
    await until(async()=>documentLoads>before,'Treemap reload did not load a new document');
    await settled();
  };
  const change = (id,value) => evaluate(`(()=>{const e=document.getElementById(${JSON.stringify(id)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const text = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).textContent`);
  const cardIds=()=>evaluate("Array.from(document.querySelectorAll('#treemap-cards .treemap-card[data-company]'),card=>card.dataset.company)");
  const companyTiles='.treemap-tile[data-company]';
  const tileMarks=selector=>evaluate(`(()=>{
    const tiles=[...document.querySelectorAll(${JSON.stringify(selector)})];
    const missing=tiles.filter(tile=>{
      const mark=tile.querySelector('.treemap-logo');
      return !mark || !mark.getClientRects().length || getComputedStyle(mark).visibility!=='visible';
    }).map(tile=>tile.dataset.company);
    return {count:tiles.length,missing};
  })()`);
  const snapshot=JSON.parse(await readFile('dist/data/graph.json','utf8')), valuation=makeView(snapshot,{metric:'valuation',currency:'USD'});
  const evidence=JSON.parse(await readFile('dist/data/treemap-evidence.json','utf8'));
  const {technology,marketCaps}=indexTreemapEvidence(snapshot,evidence);
  const market=makeView(snapshot,{metric:'market-cap',currency:'USD',marketCaps});
  const defaultChoices=['companies','technology','technology'];
  const chartChoices=()=>evaluate("['metric','group','colour'].map(name=>document.querySelector('#treemap-'+name).value)");
  // Hold snapshot requests to observe the real loading state before data resolves.
  await command('Fetch.enable',{patterns:[{urlPattern:'*atlas.sqlite*'},{urlPattern:'*data/graph.json*'}]});
  await command('Page.navigate',{url:address+'/treemap.html'});
  await until(async()=>pausedRequests>0,'Snapshot request was not paused');
  assert.equal(await evaluate("Array.from(document.querySelectorAll('#treemap-controls input, #treemap-controls select, #treemap-controls button')).every(control=>control.disabled)"),true,'Loading controls must not accept changes that will be lost');
  assert.equal(await evaluate("document.querySelector('#treemap-controls').getAttribute('aria-busy')"),'true');
  assert.equal(await evaluate("document.querySelector('#treemap-controls').getAttribute('aria-describedby')"),'treemap-status');
  assert.match(await text('#treemap-status'),/Loading/);
  await command('Fetch.disable');
  await settled();
  assert.equal(await evaluate("document.querySelector('#treemap-controls').getAttribute('aria-busy')"),'false');
  assert.deepEqual(await chartChoices(),defaultChoices);
  assert.equal(await evaluate("document.querySelector('#treemap-currency').disabled"),true,'Company count needs no currency');
  assert.equal(await evaluate("document.querySelector('#treemap-currency-field').getClientRects().length"),0,'Company count must hide the currency field');
  assert.equal(await evaluate("document.querySelectorAll('#treemap-chart [data-company]').length"),snapshot.entities.filter(entity=>entity.kind==='startup').length);
  assert.equal(await evaluate("new URL(location.href).searchParams.get('view')"),'map');
  assert.equal(await evaluate("document.querySelector('#treemap-chart [data-company=\"startup:psiquantum\"]').closest('.treemap-plot-group').getAttribute('aria-label')"),'Quantum technology');
  assert.match(await text('#treemap-legend'),/Technology type/);
  const clippedGroupHeadings=await evaluate(`Array.from(document.querySelectorAll('.treemap-plot-heading')).filter(heading=>{
    const bounds=heading.getBoundingClientRect();
    return Array.from(heading.querySelectorAll('.treemap-group-title > *')).some(label=>{
      if(!label.getClientRects().length) return false;
      const rect=label.getBoundingClientRect();
      return rect.top<bounds.top-.5||rect.bottom>bounds.bottom+.5;
    });
  }).map(heading=>heading.closest('[aria-label]').getAttribute('aria-label'))`);
  assert.deepEqual(clippedGroupHeadings,[],'Group headings must fit above their tiles');
  assert.equal(await evaluate(`(() => {
    const country=document.querySelector('.exploration-country-trigger').getBoundingClientRect();
    const size=document.querySelector('#treemap-metric').closest('label').getBoundingClientRect();
    return country.x<size.x && Math.abs(country.top-size.top)<6 && document.querySelector('#treemap-chart').getBoundingClientRect().top<320;
  })()`),true,'The desktop toolbar must put headquarters and chart settings in one row above the plot');
  await screenshot('company-count-default-desktop.png');

  assert.equal(await evaluate("document.querySelector('#treemap-metric option[value=\"market-cap\"]').disabled"),false);
  await change('treemap-metric','market-cap');
  assert.deepEqual(await chartChoices(),['market-cap','technology','technology']);
  assert.match(await text('#treemap-summary'),new RegExp(`${market.rows.length} of ${market.filteredCount} matching companies plotted`));
  assert.match(await text('#treemap-missing-label'),new RegExp(`Market cap unavailable for ${market.missing.length} compan`));
  const measurements=()=>evaluate(`Array.from(document.querySelectorAll('#treemap-chart ${companyTiles}'),tile=>{
    const {width,height}=tile.getBoundingClientRect();
    return {id:tile.dataset.company,area:width*height,group:tile.closest('.treemap-plot-group')?.getAttribute('aria-label')};
  })`);
  const verifyMarketArea=async(grouped)=>{
    const tiles=await measurements();
    assert.deepEqual(tiles.map(tile=>tile.id).sort(),market.rows.map(row=>row.id).sort());
    const area=tiles.reduce((total,tile)=>total+tile.area,0);
    for(const tile of tiles){
      const row=market.rows.find(item=>item.id===tile.id);
      assert.ok(tile.area>0&&Math.abs(tile.area/area-row.value/market.total)<.001,`${row.entity.name} must have its recorded share of the chart area`);
      assert.equal(tile.group,grouped ? technology.get(tile.id)?.type || 'Technology type not recorded' : undefined);
    }
  };
  await verifyMarketArea(true);
  await change('treemap-group','company');
  await verifyMarketArea(false);
  assert.deepEqual(await chartChoices(),['market-cap','company','technology']);
  await change('treemap-group','technology');
  const wise=market.rows.find(row=>row.id==='startup:wise');
  await click('#treemap-chart [data-company="startup:wise"]');
  assert.ok((await text('#treemap-figure-panel')).includes(formatValue(wise.value,'market-cap','USD',false)));
  assert.ok((await text('#treemap-figure-panel')).includes(wise.event.observed_on));
  for(const [label,href] of [
    ['Closing price source',wise.event.source], ['Dated exchange data',wise.event.calculation.close_data],
    ['Shares outstanding source',wise.event.calculation.shares_source],
  ]) assert.equal(await evaluate(`Array.from(document.querySelectorAll('#treemap-figure-panel a')).find(link=>link.textContent.trim()===${JSON.stringify(label+' ↗')})?.href`),href);
  await screenshot('market-cap-technology-desktop.png');
  await click('#show-list');
  assert.deepEqual(await evaluate("Array.from(document.querySelectorAll('#treemap-list [data-company]'),button=>button.dataset.company)"),market.rows.map(row=>row.id));
  await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await navigate('?view=map&metric=market-cap&group=technology&colour=technology&selected=startup%3Awise');
  await until(()=>evaluate("document.querySelector('#treemap-inspector-sheet').open&&document.querySelector('#treemap-figure-panel')?.getClientRects().length>0"),'Market-cap deep link must open the figure sheet');
  assert.match(await text('#treemap-figure-panel'),/Shares used/);
  assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true,'Market cap must fit on mobile');
  await screenshot('market-cap-evidence-mobile.png');
  await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});

  await navigate('?view=cards&metric=funding');
  assert.equal(await evaluate("['metric','currency','group'].every(name=>!document.querySelector('#treemap-'+name).disabled)"),true,'Loaded funding controls must be available');
  assert.equal(await evaluate("document.querySelector('#treemap-metric').value"),'funding');
  assert.match(await text('#treemap-board-context'),/event amount/);
  const defaultFunding=makeView(snapshot,{metric:'funding',currency:'USD'});
  assert.equal(await evaluate("document.querySelector('#treemap-chart').hidden"),true);
  assert.equal(await evaluate("document.querySelector('#treemap-cards').hidden"),false);
  assert.equal(await evaluate("new URL(location.href).searchParams.get('view')"),'cards');
  assert.deepEqual(await cardIds(),defaultFunding.rows.map(row=>row.id));
  assert.equal(await text('#treemap-board-title'),'Funding announcements');
  assert.match(await text('#treemap-board-summary'),new RegExp(`^${defaultFunding.rows.length} of ${defaultFunding.filteredCount} matching companies shown$`));
  assert.equal(await evaluate("document.querySelector('#treemap-board-heading').getBoundingClientRect().bottom<document.querySelector('#treemap-controls').getBoundingClientRect().top"),true,'The ranking header must precede the toolbar');
  assert.equal(await evaluate("document.querySelector('#treemap-filter-fields').hidden&&document.querySelector('#treemap-filter-toggle').getAttribute('aria-expanded')==='false'"),true,'The default board starts with collapsed filters');
  assert.equal(await evaluate("document.querySelectorAll('#treemap-workspace img[src^=https]').length"),0,'Cards must use only bundled images');
  const textOnlyCards = await evaluate(`[...document.querySelectorAll('#treemap-cards [data-company]')].filter(card=>!card.querySelector('img')).map(card=>({
    id:card.dataset.company, name:card.querySelector('.treemap-card-word').textContent,
    repeatedName:card.querySelector('.treemap-card-name').getClientRects().length>0,
    initials:!!card.querySelector('.treemap-logo')
  }))`);
  assert.ok(textOnlyCards.length>0,'The default board must exercise companies without a bundled mark');
  for (const card of textOnlyCards) {
    assert.equal(card.name,defaultFunding.rows.find(row=>row.id===card.id).entity.name);
    assert.equal(card.repeatedName||card.initials,false);
  }
  const boardLayout=await evaluate(`(()=>{
    const cards=[...document.querySelectorAll('#treemap-cards [data-company]')];
    return cards.slice(0,7).map(card=>{
      const {top,width}=card.getBoundingClientRect();
      return {top,width,featured:card.classList.contains('featured'),mark:card.querySelector('.treemap-card-media').getBoundingClientRect().height};
    });
  })()`);
  assert.equal(boardLayout.length,7);
  assert.ok(boardLayout.slice(0,3).every(card=>card.featured&&card.top===boardLayout[0].top));
  assert.ok(boardLayout[0].width>boardLayout[1].width&&boardLayout[0].mark>boardLayout[4].mark);
  assert.ok(boardLayout.slice(3).every(card=>!card.featured&&card.top===boardLayout[3].top));
  assert.equal(await evaluate("document.querySelectorAll('#treemap-cards .compact-tail').length"),(defaultFunding.rows.length-3)%4);
  await screenshot('funding-default-desktop.png');
  await navigate('?view=map');
  assert.equal(await evaluate("document.querySelector('#treemap-chart').hidden"),false);
  await navigate('?metric=companies&view=cards');
  assert.equal(await evaluate("document.querySelector('#treemap-cards').hidden"),false);
  assert.doesNotMatch(await text('#treemap-cards'),/(USD|AUD) \d/);
  assert.equal(await evaluate("document.querySelectorAll('#treemap-cards .treemap-card-rank').length"),0);
  await evaluate("globalThis.cardLogoUnderTest=document.querySelector('#treemap-cards img[src*=revolut]')");
  await until(()=>evaluate("cardLogoUnderTest?.naturalWidth>0&&!cardLogoUnderTest.hidden&&cardLogoUnderTest.getBoundingClientRect().height>=100"),'Cards must display available bundled logos at card scale');
  assert.equal(await evaluate("cardLogoUnderTest.getAttribute('src')"),'./assets/logos/revolut.svg');
  await evaluate("cardLogoUnderTest.src='/missing-card-mark.svg'");
  await until(()=>evaluate("cardLogoUnderTest.hidden&&!cardLogoUnderTest.nextElementSibling.hidden&&cardLogoUnderTest.nextElementSibling.textContent==='Revolut'"),'A failed card image must show the typeset company name');
  await navigate('?metric=companies');
  assert.equal(await evaluate("document.querySelector('#treemap-metric').value"),'companies');
  assert.equal(await evaluate("document.querySelectorAll('.treemap-tile').length"),JSON.parse(await readFile('dist/data/graph.json','utf8')).entities.filter(entity=>entity.kind==='startup').length);
  await screenshot('companies-desktop.png');
  await change('treemap-metric','valuation');
  assert.equal(await evaluate("document.querySelector('#treemap-currency-field').getClientRects().length>0"),true,'Valuations must expose their currency field');
  assert.match(await text('#treemap-summary'),new RegExp(formatValue(valuation.total,'valuation','USD').replaceAll('.', '\\.')));
  assert.equal(await evaluate("document.querySelectorAll('.treemap-tile').length"),valuation.rows.length);
  await click('[data-company="startup:canva"]');
  assert.match(await text('#treemap-detail'),/USD 40B/);assert.match(await text('#treemap-detail'),/2021-09-15/);
  assert.match(await evaluate("document.querySelector('.treemap-profile').getAttribute('href')"),/startup%3Acanva/);
  await screenshot('valuation-desktop.png');
  await change('treemap-metric','funding');
  await click('[data-company="startup:psiquantum"]');
  assert.match(await text('#treemap-detail'),/USD 450M/);assert.match(await text('#treemap-detail'),/newer announcement/);
  await change('treemap-currency','AUD');
  assert.match(await text('#treemap-summary'),/AUD/);assert.doesNotMatch(await text('#treemap-summary'),/USD/);
  await screenshot('funding-aud-desktop.png');

  // Cards use the existing financial read model and keep its source caveats.
  await change('treemap-currency','USD');await click('#show-cards');
  const funding=makeView(snapshot,{metric:'funding',currency:'USD'});
  assert.equal(await evaluate("document.querySelector('#treemap-cards').hidden"),false);
  assert.match(await text('#treemap-instructions'),/card area does not encode value or company count/);
  assert.doesNotMatch(await text('#treemap-instructions'),/rectangle is proportional/);
  assert.equal(await evaluate("document.querySelector('#treemap-cards').getAttribute('aria-describedby')"),'treemap-instructions');

  assert.equal(await evaluate("document.querySelector('#treemap-chart').hidden"),true);
  assert.equal(await evaluate("document.querySelector('#treemap-list').hidden"),true);
  assert.deepEqual(await cardIds(),funding.rows.map(row=>row.id),'Cards must preserve the financial ranking and coverage');
  const cardText=await evaluate("Array.from(document.querySelectorAll('#treemap-cards .treemap-card[data-company]'),card=>card.textContent)");
  funding.rows.forEach((row,index)=>{
    assert.ok(cardText[index].includes(row.entity.name),'Cards must display their company name');
    assert.ok(cardText[index].includes(formatValue(row.value,'funding','USD')),'Cards must display the same monetary observation as the map');
  });
  await click('#treemap-cards [data-company="startup:psiquantum"]');
  assert.match(await text('#treemap-detail'),/USD 450M/);
  assert.match(await text('#treemap-detail'),/newer announcement/);
  const selectedFunding=funding.rows.find(row=>row.id==='startup:psiquantum');
  assert.ok((await text('#treemap-detail')).includes(selectedFunding.event.announced_on));
  assert.equal(await evaluate("document.querySelector('#treemap-detail .treemap-source').href"),new URL(selectedFunding.event.source).href);
  assert.equal(await evaluate("new URL(location.href).searchParams.get('company')"),'startup:psiquantum');
  assert.equal(await evaluate("new URL(location.href).searchParams.get('view')"),'cards');
  await screenshot('cards-funding-desktop.png',true);
  await click('#treemap-company-tab');
  assert.equal(await evaluate("document.querySelector('#treemap-company-panel').hidden"),false,'Cards retain the company inspector');
  await click('#treemap-figure-tab');
  assert.equal(await evaluate("document.querySelector('#treemap-figure-panel').hidden"),false,'Cards retain the figure inspector');
  const sharedUrl=await evaluate('location.href');
  await reload();
  assert.equal(await evaluate('location.href'),sharedUrl,'Shared card state must survive reload');
  assert.equal(await evaluate("document.querySelector('#treemap-cards').hidden"),false);
  assert.equal(await text('#treemap-detail h2'),'PsiQuantum');
  assert.deepEqual(await cardIds(),funding.rows.map(row=>row.id));
  await click('#show-list');assert.equal(await text('#treemap-detail h2'),'PsiQuantum');
  await click('#show-cards');assert.equal(await text('#treemap-detail h2'),'PsiQuantum');
  await evaluate('history.back()');
  await until(()=>evaluate("document.querySelector('#treemap-list').hidden===false"),'Back did not restore the list presentation');
  assert.equal(await text('#treemap-detail h2'),'PsiQuantum');
  await evaluate('history.forward()');
  await until(()=>evaluate("document.querySelector('#treemap-cards').hidden===false"),'Forward did not restore cards');
  assert.equal(await text('#treemap-detail h2'),'PsiQuantum');
  await click('#treemap-share');
  await until(()=>evaluate("document.querySelector('#treemap-share-status').textContent.trim().length>0"),'Sharing did not report copy success or its browser-address fallback');
  await evaluate("(()=>{const e=document.querySelector('#treemap-query');e.value='no company matches this';e.dispatchEvent(new Event('input',{bubbles:true}));})()");
  assert.equal((await cardIds()).length,0);
  assert.match(await text('#treemap-cards'),/No (?:comparable )?companies/);
  await evaluate("(()=>{const e=document.querySelector('#treemap-query');e.value='';e.dispatchEvent(new Event('input',{bubbles:true}));})()");
  assert.deepEqual(await cardIds(),funding.rows.map(row=>row.id));
  await click('#show-map');

  await change('treemap-metric','companies');await change('treemap-group','decade');
  assert.ok(await evaluate("document.querySelectorAll('[data-period]').length>=3"));
  await click('[data-period="2010s"]');assert.match(await text('#treemap-breadcrumb'),/2010s/);
  await click('.exploration-country-trigger');
  await until(()=>evaluate("Boolean(document.querySelector('.exploration-option-count'))"),'Cohort country choices did not appear');
  assert.equal(await evaluate("[...document.querySelectorAll('.exploration-option-count')].reduce((total, option)=>total+Number(option.textContent),0)"),
    makeView(snapshot,{metric:'companies',period:'2010s'}).filteredCount,'Country counts must respect the selected founding decade');
  await click('[data-draft-cancel]');
  await evaluate('history.back()');await until(()=>evaluate("document.querySelector('#treemap-breadcrumb').textContent==='All ecosystems'"),'Back did not restore cohort');
  await evaluate('history.forward()');await until(()=>evaluate("document.querySelector('#treemap-breadcrumb').textContent.includes('2010s')"),'Forward did not restore cohort');
  await click('[data-period="all"]');
  await click('#show-cards');
  const companyView=makeView(snapshot,{metric:'companies'});
  assert.deepEqual(await evaluate("Array.from(document.querySelectorAll('#treemap-cards [data-period]'),card=>card.dataset.period)"),companyView.groups.map(group=>group.id),'Grouped cards must preserve the existing founding-decade view');
  await click('#treemap-cards [data-period="2010s"]');
  assert.match(await text('#treemap-breadcrumb'),/2010s/);
  assert.deepEqual(await cardIds(),makeView(snapshot,{metric:'companies',period:'2010s'}).rows.map(row=>row.id),'A decade card must drill down to the same companies as its map');
  await click('#treemap-cards [data-company]');
  assert.match(await text('#treemap-figure-panel'),/card area does not encode company count/);
  assert.doesNotMatch(await text('#treemap-figure-panel'),/equal area/,'Cards must not claim proportional count areas');
  assert.match(await text('#method'),/In the treemap, companies have equal area/,'Method caveat scopes equal area to the treemap');
  await click('#show-map');
  assert.match(await text('#treemap-figure-panel'),/equal area in the treemap/,'Switching presentation updates the retained company evidence');
  assert.match(await text('#treemap-instructions'),/rectangle is proportional/);
  await click('#show-cards');
  assert.doesNotMatch(await text('#treemap-figure-panel'),/equal area/);
  await click('[data-period="all"]');await click('#show-list');
  assert.equal(await evaluate("document.querySelector('#treemap-list').hidden"),false);
  assert.match(await text('#treemap-instructions'),/Select a company in the list/);
  assert.equal(await evaluate("document.querySelector('#treemap-list').getAttribute('aria-describedby')"),'treemap-instructions');

  assert.ok(await evaluate("document.querySelectorAll('#treemap-list .treemap-logo img').length>0"),'Ranked list must retain logo images');
  await change('treemap-group','company');await click('#show-map');
  assert.equal((await tileMarks(companyTiles)).count,companyView.rows.length);
  assert.deepEqual((await tileMarks(companyTiles+':not(.micro)')).missing,[],'Desktop company tiles that have room must retain marks');
  await screenshot('company-logos-desktop.png');
  await evaluate("globalThis.logoUnderTest=document.querySelector('#treemap-list img[src*=revolut]')");
  await until(()=>evaluate("logoUnderTest.complete&&logoUnderTest.naturalWidth>0&&!logoUnderTest.hidden"),'Bundled logo must decode before testing failure');
  await evaluate("logoUnderTest.src='/missing-logo-regression.svg'");
  await until(()=>evaluate("logoUnderTest.complete&&!logoUnderTest.naturalWidth&&logoUnderTest.hidden&&!logoUnderTest.nextElementSibling.hidden"),'Failed logo must show initials');
  await click('#show-list');
  await click('#treemap-reset');
  assert.equal(await evaluate("document.querySelector('#treemap-chart').hidden"),false);
  assert.deepEqual(await chartChoices(),defaultChoices);
  await click('#show-map');
  await evaluate("(()=>{const e=document.querySelector('#treemap-query');e.value='no company matches this';e.dispatchEvent(new Event('input',{bubbles:true}));})()");
  assert.match(await text('#treemap-chart'),/No companies match/);
  await click('#treemap-reset');await click('#show-map');await change('treemap-metric','valuation');await change('treemap-currency','USD');
  await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await until(()=>evaluate("document.querySelector('#treemap-chart').getBoundingClientRect().width<390"),'Mobile did not resize');
  assert.equal(await evaluate('document.documentElement.scrollWidth<=window.innerWidth'),true,'No horizontal overflow on mobile');
  await screenshot('valuation-mobile.png');
  await change('treemap-metric','companies');
  await screenshot('company-logos-mobile.png');
  await command('Emulation.setDeviceMetricsOverride',{width:320,height:844,deviceScaleFactor:1,mobile:true});
  await until(()=>evaluate("document.querySelector('#treemap-chart').getBoundingClientRect().width<320"),'Small mobile did not resize');
  assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true,'No horizontal overflow at 320px');
  const masthead=await evaluate("(()=>{const links=[...document.querySelectorAll('[data-atlas-explorer-actions] [data-atlas-view]')].map(a=>a.getBoundingClientRect()),brand=document.querySelector('.atlas-wordmark').getBoundingClientRect(),system=document.querySelector('.atlas-masthead .atlas-system-link').getBoundingClientRect();return {sameRow:links.length===3&&Math.max(...links.map(r=>r.top))-Math.min(...links.map(r=>r.top))<1,brandClear:!system.width||brand.right<=system.left||brand.bottom<=system.top||system.bottom<=brand.top};})()");
  assert.ok(masthead.sameRow,'The three primary views should share one row at 320px');
  assert.ok(masthead.brandClear,'The home identity and design-system link must not overlap');
  await screenshot('company-logos-mobile-320.png');
  await change('treemap-metric','funding');await screenshot('funding-mobile-320.png');
  await change('treemap-metric','companies');
  assert.equal((await tileMarks(companyTiles)).count,companyView.rows.length);
  assert.deepEqual((await tileMarks(companyTiles+':not(.micro)')).missing,[],'Mobile company tiles that have room must retain marks');
  await change('treemap-metric','valuation');
  await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await click('#show-cards');
  assert.deepEqual(await cardIds(),valuation.rows.map(row=>row.id),'Mobile cards must preserve the valuation rows');
  assert.equal(await evaluate('document.documentElement.scrollWidth<=window.innerWidth'),true,'Cards must not overflow at 390px');
  await evaluate("scrollTo({top:0,behavior:'instant'})");
  assert.ok(await evaluate("document.querySelector('#treemap-cards .treemap-card').getBoundingClientRect().top<innerHeight/2"),'The lead card must begin in the upper half of the 390px viewport');
  await screenshot('cards-valuation-mobile.png',true);
  await command('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  assert.equal(await evaluate("document.querySelector('#treemap-inspector-sheet').open"),false);
  await evaluate("document.querySelector('#treemap-cards [data-company=\"startup:canva\"]').focus()");
  await click('#treemap-cards [data-company="startup:canva"]');
  await until(()=>evaluate("(()=>{const panel=document.querySelector('#treemap-detail'),r=panel.getBoundingClientRect();return document.querySelector('#treemap-inspector-sheet').open&&panel.querySelector('h2')?.textContent==='Canva'&&panel.contains(document.activeElement)&&r.top>=-1&&r.top<innerHeight-120;})()"),'Selecting a mobile company must focus the bottom inspector sheet');
  await screenshot('cards-evidence-mobile.png');
  await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  await command('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  await until(()=>evaluate("!document.querySelector('#treemap-inspector-sheet').open&&document.activeElement?.dataset.company==='startup:canva'"),'Closing the inspector must restore focus to the company card');
  assert.equal(await evaluate("new URLSearchParams(location.search).has('selected')"),false);
  await command('Emulation.setEmulatedMedia',{features:[]});
  await command('Emulation.setDeviceMetricsOverride',{width:320,height:844,deviceScaleFactor:1,mobile:true});
  assert.equal(await evaluate('document.documentElement.scrollWidth<=window.innerWidth'),true,'Cards must not overflow at 320px');
  await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await click('#show-list');
  await evaluate("document.querySelector('#treemap-list [data-company]').focus()");
  assert.equal(await evaluate("document.activeElement?.dataset.company"),'startup:canva','The visible company button must own keyboard focus');
  await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,nativeVirtualKeyCode:13,text:'\r',unmodifiedText:'\r'});
  await command('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
  await until(()=>evaluate("document.querySelector('#treemap-detail h2')?.textContent==='Canva'"),'Enter did not activate the focused company');
  assert.equal(await text('#treemap-detail h2'),'Canva');
  await click('.treemap-profile');await until(()=>evaluate("document.querySelector('#entity-profile')?.getAttribute('aria-busy')==='false'"),'Profile did not load');
  assert.equal(await text('h1'),'Canva');
  // Company context exposes existing reviewed founder/media evidence, not guessed metadata.
  await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});
  await navigate('?metric=companies&q=Morse');
  await click('#treemap-chart [data-company="startup:morse-micro"]');
  assert.equal(await evaluate("document.querySelectorAll('#treemap-detail .treemap-founder').length"),2);
  assert.equal(await evaluate("document.querySelectorAll('#treemap-detail .treemap-founder img').length"),2);
  assert.match(await text('#treemap-detail'),/Financial context/);
  assert.match(await text('#treemap-detail'),/Public market cap/);
  assert.match(await text('#treemap-detail'),/No recorded public market cap/);
  assert.match(await text('#treemap-detail'),/Semiconductors & connectivity/);
  assert.ok(await evaluate("Array.from(document.querySelectorAll('#treemap-detail .treemap-founder a')).some(a=>a.textContent.includes('Profile')&&a.href.includes('linkedin.com'))"),'Founder profile links must use recorded URLs');
  assert.ok(await evaluate("document.querySelector('#treemap-chart').getBoundingClientRect().height<=300"),'A single filtered company must not become an oversized empty tile');
  await screenshot('company-context-desktop.png');
  await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await until(()=>evaluate("document.querySelector('#treemap-chart').getBoundingClientRect().width<390"),'Context mobile did not resize');
  assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true,'Context must not overflow at390px');
  await screenshot('company-context-mobile.png');
  await navigate('?metric=companies&q=Revolut');await click('#treemap-chart [data-company="startup:revolut"]');
  assert.match(await text('#treemap-detail'),/Company details/);
  assert.match(await text('#treemap-detail'),/12,200/);
  // Exercise progressive fallback by rejecting only the database request.
  await command('Network.enable');await command('Network.setBlockedURLs',{urls:['*atlas.sqlite*']});
  await navigate('?metric=market-cap&group=technology');
  assert.match(await text('#treemap-status'),/JSON backup/);
  await verifyMarketArea(true);
  await navigate('?metric=valuation');assert.match(await text('#treemap-status'),/JSON backup/);
  assert.equal(await evaluate("document.querySelectorAll('.treemap-tile').length"),valuation.rows.length);
  await command('Network.setBlockedURLs',{urls:['*atlas.sqlite*','*treemap-evidence.json*']});
  await navigate('?metric=companies&group=technology');
  assert.match(await text('#treemap-status'),/evidence is unavailable/);
  assert.equal(await evaluate("document.querySelector('#treemap-metric option[value=\"market-cap\"]').disabled"),true);
  assert.equal((await tileMarks(companyTiles)).count,market.filteredCount);
  await command('Network.setBlockedURLs',{urls:['*atlas.sqlite*','*data/graph.json*']});
  await navigate('');assert.match(await text('#treemap-status'),/could not be loaded/);
  assert.equal(await evaluate("document.querySelector('#treemap-metric').disabled"),true);
  assert.equal(await evaluate("Array.from(document.querySelectorAll('#treemap-controls input, #treemap-controls select, #treemap-controls button')).every(control=>control.disabled)"),true);
  assert.match(await text('#treemap-chart'),/Reload this view/);
  await command('Network.setBlockedURLs',{urls:[]});
  await click('#treemap-chart a');
  await until(()=>evaluate("document.querySelector('#treemap-metric')?.disabled===false"),'Reload recovery did not restore controls');
  await settled();
  assert.match(await text('#treemap-status'),/Company count/);

  // A fixed set of equal-area tiles exercises both size classes as the catalogue grows.
  const fixtureCompanies=Array.from({length:24},(_,index)=>({
    id:`startup:mark-fixture-${index+1}`,kind:'startup',name:`Fixture company ${index+1}`,
  }));
  markFixture=JSON.stringify({version:snapshot.version,entities:fixtureCompanies,edges:[],funding_rounds:[],articles:[]});
  await command('Network.setBlockedURLs',{urls:['*atlas.sqlite*']});
  await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});
  await navigate('?metric=companies');
  assert.match(await text('#treemap-status'),/JSON backup/);
  assert.equal((await tileMarks(companyTiles)).count,fixtureCompanies.length);
  const compact=await tileMarks(companyTiles+'.compact');
  assert.ok(compact.count>0,'The fixed desktop layout must exercise compact company tiles');
  assert.deepEqual(compact.missing,[],'Compact company tiles must retain marks');
  await command('Emulation.setDeviceMetricsOverride',{width:320,height:844,deviceScaleFactor:1,mobile:true});
  const small=await until(async()=>{
    const marks=await tileMarks(companyTiles+'.tiny:not(.micro)');
    return marks.count>0 ? marks : null;
  },'The fixed mobile layout did not produce small company tiles');
  assert.deepEqual(small.missing,[],'Mobile small company tiles must retain marks');

  // Geography and profile fact reviews use a fixture separate from the released records.
  const source='https://example.com/company-evidence';
  const located=(key,name,headquarters,sector)=>({
    id:`startup:${key}`,kind:'startup',name,source,
    profile_facts:[...(headquarters ? [{label:'Headquarters',value:headquarters,source,reviewed_at:'2025-09-10'}] : []),
      ...(sector ? [{label:'Primary sector',value:sector,source}] : [])],
  });
  const sydney=located('scope-sydney','Sydney Fixture','Sydney, Australia','Developer tools');
  const melbourne=located('scope-melbourne','Melbourne Fixture','Melbourne, Australia','Energy');
  const auckland=located('scope-auckland','Auckland Fixture','Auckland, New Zealand','Developer tools');
  const unknown=located('scope-unknown','Unknown Fixture','','');
  const figure=(entity,amount,currency)=>({id:entity.id,startup_id:entity.id,stage:'Seed',amount,currency,announced_on:'2025-09-10',source});
  markFixture=JSON.stringify({version:snapshot.version,entities:[sydney,melbourne,auckland,unknown],edges:[],articles:[],
    funding_rounds:[figure(sydney,70,'AUD'),figure(melbourne,30,'AUD'),figure(auckland,40,'USD'),figure(unknown,0,'AUD')]});
  await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});
  await navigate('?metric=companies&group=country&colour=sector');
  await until(()=>evaluate("Boolean(document.querySelector('.exploration-country ui-popover')?.api)"),'Country control did not upgrade');
  const hqTrigger='.exploration-country-trigger', params=()=>evaluate('Object.fromEntries(new URLSearchParams(location.search))');
  assert.match((await text('#treemap-groups')) + (await text('#treemap-chart')),/Country not recorded/);
  assert.match(await text('#treemap-legend'),/Developer tools/);
  const weights=await evaluate(`(() => {
    const chart=document.querySelector('#treemap-chart');
    const areas=[...chart.querySelectorAll('[data-company]')].map(tile=>parseFloat(tile.style.width)*parseFloat(tile.style.height));
    const total=areas.reduce((sum,area)=>sum+area,0);
    return areas.map(area=>area/total);
  })()`);
  assert.equal(weights.length,4);
  assert.ok(weights.every(weight=>Math.abs(weight-.25)<1e-6),'Grouping must preserve equal area per company');
  await change('treemap-colour','freshness');
  assert.equal((await params()).group,'country');
  assert.match(await text('#treemap-legend'),/Days since last recorded fact review.*181\+ days.*Review date not recorded/s);
  assert.equal(await evaluate(`(() => {
    const tile=document.querySelector('#treemap-chart [data-company="startup:scope-sydney"] .treemap-tile-inner');
    const swatch=[...document.querySelectorAll('.treemap-legend-item')].find(item=>item.textContent==='181+ days').querySelector('i');
    return getComputedStyle(tile).backgroundColor===getComputedStyle(swatch).backgroundColor;
  })()`),true,'Review age and legend must use the same tile fill');

  await click(hqTrigger);
  await until(()=>evaluate("Boolean(document.querySelector('#atlas-hq-AU-control'))"),'Country choices did not appear');
  await click('#atlas-hq-AU-control');
  assert.equal(await evaluate("new URLSearchParams(location.search).getAll('hq').length"),0,'A country draft must not narrow treemap results');
  await click('[data-draft-cancel]');
  await click(hqTrigger);
  await until(()=>evaluate("Boolean(document.querySelector('#atlas-hq-AU-control'))"),'Reopened country choices were unavailable');
  assert.equal(await evaluate("document.querySelector('#atlas-hq-AU').checked"),false);
  await click('#atlas-hq-AU-control');
  await click('#atlas-hq-NZ-control');
  await click('.exploration-apply');
  assert.deepEqual(await evaluate("new URLSearchParams(location.search).getAll('hq')"),['AU','NZ']);
  assert.equal(await evaluate("document.querySelectorAll('#treemap-chart [data-company]').length"),3,'Apply must match either country');
  await click('#treemap-chart [data-company="startup:scope-auckland"]');
  await click('[data-atlas-compare="startup:scope-auckland"]');
  assert.match(await text('[data-atlas-panel="compare"]'),/\(1\)/);

  await click('[data-treemap-group="AU"]');
  const countryPath=await params();
  assert.equal(countryPath.place,'AU');
  assert.equal(countryPath.group,'city');
  assert.equal(countryPath.selected,'startup:scope-auckland');
  assert.equal(countryPath.colour,'freshness');
  assert.match(await text('.exploration-result-count'),/2 companies in this location.*3 companies match your filters/);
  assert.match(await text('#treemap-detail'),/Outside current results/);
  assert.equal(await evaluate("document.querySelector('[data-atlas-compare]').getAttribute('aria-pressed')"),'true');
  assert.equal(await evaluate("document.querySelectorAll('#treemap-chart .treemap-plot-group-row .treemap-plot-heading').length"),2,'Country drilldown displays each city with an inset heading');
  assert.deepEqual(await evaluate("(()=>{const detail={};document.dispatchEvent(new CustomEvent('atlas:export-records',{detail}));return detail.records.map(row=>row.id).sort()})()"),[melbourne.id,sydney.id].sort(),'Export must use the exact current filtered company population');

  const cityGroup='[data-treemap-group=\'["AU","Sydney"]\']';
  await click(cityGroup);
  assert.equal((await params()).city,'Sydney');
  assert.equal(await evaluate("document.querySelectorAll('#treemap-chart [data-company]').length"),1);
  await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await until(()=>evaluate("document.getElementById('treemap-filter-fields').hidden&&document.querySelector('#treemap-inspector-sheet').open"),'Mobile settings did not collapse or selected company sheet did not open');
  await click('#treemap-detail [data-treemap-adjust]');
  await until(()=>evaluate("!document.querySelector('#treemap-inspector-sheet').open&&document.querySelector('.exploration-country ui-popover').open"),'Adjust filters must open mobile filters without losing inspection');
  await click('[data-draft-cancel]');
  assert.equal(await evaluate("document.querySelector('.exploration-applied').getClientRects().length>0 && document.querySelector('.exploration-scope').getClientRects().length>0"),true,'Collapsed filters must retain applied constraints and scope');
  await evaluate("document.querySelector('[data-clear-facets]').focus()");
  await click('[data-clear-facets]');
  assert.equal(await evaluate("document.activeElement.matches('.exploration-country-trigger')"),true,'Clearing the last applied filter on mobile must focus the visible Filters control');
  assert.equal((await params()).city,'Sydney','Clear filters must preserve the drill path');
  assert.equal(await evaluate("new URLSearchParams(location.search).getAll('hq').length"),0);
  await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});
  await click('[data-drill-parent="all"]');
  assert.equal((await params()).place,undefined);
  assert.equal((await params()).selected,'startup:scope-auckland');
  assert.match(await text('[data-atlas-panel="compare"]'),/\(1\)/);

  await change('treemap-metric','funding');
  await change('treemap-currency','AUD');
  assert.match(await text('#treemap-summary'),/2 of 4 matching companies plotted.*AUD 100/);
  assert.match(await text('#treemap-missing'),/AUD 0 recorded/);
  await click('#treemap-missing summary');
  await click('#treemap-missing [data-company="startup:scope-unknown"]');
  assert.match(await text('#treemap-figure-panel'),/AUD 0 recorded.*2025-09-10/s);
  await click('#treemap-reset');
  assert.equal((await params()).selected,undefined);
  assert.equal(await text('[data-atlas-panel="compare"]'),'Compare');
  assert.deepEqual(await chartChoices(),defaultChoices);
  await command('Network.setBlockedURLs',{urls:[]});

  assert.deepEqual(exceptions,[],'Treemap must not raise unhandled JavaScript exceptions');
  console.log('Treemap browser checks passed: proportional views, public market-cap evidence, technology grouping, ranked cards, currencies, source caveats, country and city drilldown, independent colour, excluded selection and comparison, keyboard/profile navigation, desktop/mobile, SQLite/JSON fallback and unavailable state.');
} catch(error) {
  await captureFailure('treemap-failed.png').catch(()=>{});throw error;
} finally {
  socket?.close();chrome.kill();server.close();
  await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100}).catch(()=>{});
}
