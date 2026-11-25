// Browser-level treemap and ranked-card checks. Uses the Chrome already installed
// on the GitHub Actions runner and Node's built-in CDP WebSocket client.
import assert from 'node:assert/strict';
import {makeView,formatValue,indexCompanyValues,indexTreemapEvidence} from '../dist/treemap-model.js';
import {logoFor} from '../dist/logos.js';
import {readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {launchBrowserTransport, saveScreenshot, unmappedExternalRequests} from './browser-transport.mjs';

const root=resolve('dist');
const screenshotDir=process.env.ATLAS_SCREENSHOTS_DIR||join(tmpdir(),'atlas-treemap-screenshots');
const requests=[];
let markFixture;
// Shared transport/lifecycle (#149): static server, Chrome spawn, CDP
// session, bounded commands, socket-exit rejection and phase timings. The
// markFixture override keeps serving a swapped graph document mid-suite,
// and the session counts document loads / paused Fetch requests for the
// navigation and loading-state checks below.
const transport=await launchBrowserTransport({
  root,
  profilePrefix:'atlas-treemap-chrome-',
  server:{requests,
    contentTypes:{'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.sqlite':'application/octet-stream','.svg':'image/svg+xml','.png':'image/png'},
    override:path=>path===join(root,'data','graph.json')?markFixture:undefined},
  session:{pollAttempts:100,exceptionText:details=>details.text},
});
const address=transport.address;
let captureFailure=async()=>{}, readDiagnostics=async()=>({state:'unavailable'});
try {
  const session=await transport.connect();
  const {command,evaluate,until}=session;
  const exceptions=session.exceptions, browserMessages=session.browserMessages;
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
    const params={format:'png'};
    if(fullPage){
      await evaluate("scrollTo({top:0,behavior:'instant'})");
      const size=await evaluate('({width:innerWidth,height:Math.min(document.documentElement.scrollHeight,3600)})');
      params.captureBeyondViewport=true;params.clip={x:0,y:0,...size,scale:1};
    }
    await saveScreenshot(session,screenshotDir,name,params);
  }
  captureFailure=screenshot;
  await command('Runtime.enable'); await command('Page.enable'); await command('Network.enable');
  await command('Page.bringToFront');
  await command('Emulation.setFocusEmulationEnabled',{enabled:true});
  await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});
  const settled=()=>until(()=>evaluate("document.querySelector('#treemap-workspace')?.getAttribute('aria-busy')==='false'"),'Treemap did not settle');
  const navigate = async suffix => {
    const before=session.documentLoads;
    await command('Page.navigate',{url:address+'/treemap.html'+suffix});
    await until(async()=>session.documentLoads>before,'Treemap navigation did not load a new document');
    await settled();
  };
  const reload=async()=>{
    const before=session.documentLoads;await command('Page.reload');
    await until(async()=>session.documentLoads>before,'Treemap reload did not load a new document');
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
  const indexedEvidence=indexTreemapEvidence(snapshot,evidence);
  const {technology,marketCaps}=indexedEvidence;
  const market=makeView(snapshot,{metric:'market-cap',currency:'USD',marketCaps});
  const companyValues=indexCompanyValues(snapshot,indexedEvidence);
  const values=makeView(snapshot,{metric:'company-value',currency:'USD',companyValues});
  const defaultChoices=['company-value','technology','technology'];
  const chartChoices=()=>evaluate("['metric','group','colour'].map(name=>document.querySelector('#treemap-'+name).value)");
  // Hold snapshot requests to observe the real loading state before data resolves.
  await command('Fetch.enable',{patterns:[{urlPattern:'*atlas.sqlite*'},{urlPattern:'*data/graph.json*'}]});
  await command('Page.navigate',{url:address+'/treemap.html'});
  await until(async()=>session.pausedRequests>0,'Snapshot request was not paused');
  assert.equal(await evaluate("Array.from(document.querySelectorAll('#treemap-controls input, #treemap-controls select, #treemap-controls button')).every(control=>control.disabled)"),true,'Loading controls must not accept changes that will be lost');
  assert.equal(await evaluate("document.querySelector('#treemap-controls').getAttribute('aria-busy')"),'true');
  assert.equal(await evaluate("document.querySelector('#treemap-controls').getAttribute('aria-describedby')"),'treemap-status');
  assert.match(await text('#treemap-status'),/Loading/);
  await command('Fetch.disable');
  await settled();
  assert.equal(await evaluate("document.querySelector('#treemap-controls').getAttribute('aria-busy')"),'false');
  assert.deepEqual(await chartChoices(),defaultChoices);
  assert.equal(await evaluate("document.querySelector('#treemap-currency').disabled"),false,'Company value compares figures in a selected currency');
  assert.ok(await evaluate("document.querySelector('#treemap-currency-field').getClientRects().length"),'Company value must show the currency field');
  assert.equal(await evaluate("document.querySelectorAll('#treemap-chart [data-company]').length"),values.rows.length,'Default company-value view plots only companies with a recorded value');
  assert.equal(await evaluate("document.querySelectorAll('#treemap-novalue [data-company]').length"),values.missing.length,'Companies without a recorded value appear in the equal-size no-value band, not the sized map');
  assert.equal(await evaluate("document.querySelector('#treemap-novalue').hidden"),false,'The no-value band is visible in the default map view');
  const tileTickers=await evaluate(`Object.fromEntries(Array.from(document.querySelectorAll('#treemap-chart [data-company] .treemap-tile-ticker'),el=>[el.closest('[data-company]').dataset.company,el.textContent]))`);
  assert.deepEqual(tileTickers,{'startup:uipath':'NYSE: PATH','startup:wise':'Nasdaq: WSE'},'Listed tiles must show EXCHANGE: TICKER in the default company-value view');
  assert.equal(await evaluate("new URL(location.href).searchParams.get('view')"),'map');
  assert.equal(await evaluate("document.querySelector('#treemap-chart [data-company=\"startup:psiquantum\"]').closest('.treemap-plot-group').getAttribute('aria-label')"),'Quantum technology');
  assert.match(await text('#treemap-legend'),/Technology type/);
  assert.deepEqual(await evaluate(`(() => {
    const mark=document.querySelector('[data-company="startup:cauldron"] .treemap-logo');
    return [mark.dataset.logoCanvas,getComputedStyle(mark).backgroundColor,getComputedStyle(mark.querySelector('img')).mixBlendMode];
  })()`),['white','rgba(0, 0, 0, 0)','darken'],'White logo canvases must blend with the tile');
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
  await screenshot('company-value-default-desktop.png');

  assert.equal(await evaluate("document.querySelector('#treemap-metric option[value=\"market-cap\"]').disabled"),false);
  await change('treemap-metric','market-cap');
  assert.deepEqual(await chartChoices(),['market-cap','technology','technology']);
  assert.match(await text('#treemap-summary'),new RegExp(`${market.rows.length} of ${market.filteredCount} matching companies plotted`));
  assert.match(await text('#treemap-missing-label'),new RegExp(`Market cap unavailable for ${market.missing.length} compan`));
  const measurements=()=>evaluate(`Array.from(document.querySelectorAll('#treemap-chart ${companyTiles}'),tile=>{
    const {width,height}=tile.getBoundingClientRect();
    const badge=tile.querySelector('[data-figure-basis]');
    const valueLayout=tile.matches('.treemap-value-row,.treemap-value-column');
    return {id:tile.dataset.company,area:width*height,group:tile.closest('.treemap-plot-group')?.getAttribute('aria-label'),
      basis:badge?.dataset.figureBasis, markerVisible:!!badge?.firstElementChild?.getClientRects().length,label:tile.getAttribute('aria-label'),
      valuesVisible:!valueLayout||['.treemap-tile-name','.treemap-value'].every(selector=>tile.querySelector(selector).getClientRects().length>0)};
  })`);
  const verifyAreas=async(figures,grouped)=>{
    const tiles=await measurements();
    assert.deepEqual(tiles.map(tile=>tile.id).sort(),figures.rows.map(row=>row.id).sort());
    const area=tiles.reduce((total,tile)=>total+tile.area,0);
    for(const tile of tiles){
      const row=figures.rows.find(item=>item.id===tile.id);
      assert.ok(tile.area>0&&Math.abs(tile.area/area-row.value/figures.total)<.001,`${row.entity.name} must have its recorded share of the chart area`);
      assert.equal(tile.group,grouped ? technology.get(tile.id)?.type || 'Technology type not recorded' : undefined);
      if(row.basis){
        assert.equal(tile.basis,row.basis);
        assert.ok(tile.markerVisible,`${row.entity.name} must visibly identify its figure`);
        assert.ok(tile.valuesVisible,`${row.entity.name} must show its name and amount in its tile layout`);
        assert.match(tile.label,row.basis==='market-cap' ? /Market cap/ : /Private valuation/);
      }
    }
  };
  await verifyAreas(market,true);
  await change('treemap-group','company');
  await verifyAreas(market,false);
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
  await click('#show-cards');
  await until(()=>evaluate(`(() => {
    const logo=document.querySelector('#treemap-cards [data-company="startup:wise"] .treemap-card-media img');
    return !!logo&&!logo.hidden&&logo.getBoundingClientRect().height>=138&&getComputedStyle(logo).objectFit==='contain';
  })()`),'Ranked company cards must show a larger, uncropped logo');
  await screenshot('market-cap-logos-cards.png');
  await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await navigate('?view=map&metric=market-cap&group=technology&colour=technology&selected=startup%3Awise');
  await until(()=>evaluate("document.querySelector('#treemap-inspector-sheet').open&&document.querySelector('#treemap-figure-panel')?.getClientRects().length>0"),'Market-cap deep link must open the figure sheet');
  assert.match(await text('#treemap-figure-panel'),/Shares used/);
  assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true,'Market cap must fit on mobile');
  await screenshot('market-cap-evidence-mobile.png');
  await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});

  await command('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await navigate('?metric=companies&group=company&colour=technology');
  assert.equal(await evaluate("document.querySelector('#treemap-metric option[value=\"company-value\"]').disabled"),false);
  await change('treemap-metric','company-value');
  assert.deepEqual(await chartChoices(),['company-value','technology','technology']);
  assert.match(await text('#treemap-summary'),new RegExp(`${values.rows.length} of ${values.filteredCount} matching companies plotted`));
  await verifyAreas(values,true);
  assert.deepEqual(await evaluate(`(() => {
    const mark=document.querySelector('#treemap-chart [data-company="startup:canva"] .treemap-logo');
    const image=getComputedStyle(mark.querySelector('img'));
    return [mark.dataset.logoCanvas,getComputedStyle(mark).backgroundColor,image.mixBlendMode,image.filter];
  })()`),['cream','rgba(0, 0, 0, 0)','darken','brightness(1.13)'],'Cream logo canvases must blend with the tile');
  await until(()=>evaluate("document.querySelector('#treemap-chart [data-company=\"startup:revolut\"] .treemap-logo img').getBoundingClientRect().height>100"),'The leading treemap mark should use the available height');
  await screenshot('company-value-desktop.png');
  await click('#treemap-chart [data-company="startup:wise"]');
  assert.match(await text('#treemap-figure-panel'),/Recorded public market cap.*Shares used/s);
  await click('#treemap-chart [data-company="startup:revolut"]');
  const revolut=companyValues.get('startup:revolut');
  assert.match(await text('#treemap-figure-panel'),/Private valuation.*Completed secondary share sale/s);
  assert.ok((await text('#treemap-figure-panel')).includes(formatValue(revolut.value,'valuation','USD',false)));
  assert.ok(await evaluate(`Array.from(document.querySelectorAll('#treemap-figure-panel a')).some(a=>a.href===${JSON.stringify(revolut.event.source)})`));
  await command('Emulation.setDeviceMetricsOverride',{width:901,height:680,deviceScaleFactor:1,mobile:false});
  await navigate('?metric=company-value&selected=startup%3Arevolut');
  assert.equal(await evaluate(`['group','metric','colour'].every(name=>{
    const value=document.querySelector('#treemap-'+name+'-trigger ui-select-value');
    return value.clientWidth>0 && value.scrollWidth<=value.clientWidth;
  })`),true,'The selected measure and grouping labels must fit at the column breakpoint');
  assert.equal(await evaluate(`(() => {
    const copy=document.querySelector('.treemap-detail-copy');
    const source=document.querySelector('#treemap-figure-panel a');
    return getComputedStyle(copy).overflowY==='visible' && copy.scrollHeight<=copy.clientHeight+1
      && source.getBoundingClientRect().bottom<=copy.getBoundingClientRect().bottom+1
      && document.documentElement.scrollWidth<=innerWidth;
  })()`),true,'The desktop rail must fit at the column breakpoint and put evidence in normal page flow');
  assert.equal(await evaluate(`(() => {
    const missing=document.querySelector('#treemap-missing');
    const footer=document.querySelector('.treemap-panel-footer');
    const groups=document.querySelector('#treemap-groups');
    const end=Math.max(footer.getBoundingClientRect().bottom,groups.getBoundingClientRect().bottom);
    return missing.closest('#treemap-panel')!==null && missing.getBoundingClientRect().top-end<=12
      && !groups.textContent.includes('No comparable figures');
  })()`),true,'The coverage disclosure must stay with the plot without duplicating unplotted groups');
  await evaluate("document.querySelector('#treemap-chart [data-company=\"startup:revolut\"]').focus()");
  await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,nativeVirtualKeyCode:13,text:'\r',unmodifiedText:'\r'});
  await command('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
  assert.equal(await evaluate('document.activeElement.id'),'treemap-detail','Keyboard inspection must go directly from the tile to its evidence');
  await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  await command('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  assert.equal(await evaluate('document.activeElement.dataset.company'),'startup:revolut','Escape must return to the invoking company');
  await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});
  await click('#treemap-chart [data-company="startup:revolut"]');
  await click('#treemap-company-tab');
  assert.match(await text('#treemap-company-panel'),/Privately held.*12,200.*REVOLUT LTD legal incorporation/s);
  const profile=snapshot.entities.find(entity=>entity.id==='startup:revolut');
  assert.equal(await evaluate("Array.from(document.querySelectorAll('#treemap-company-panel details')).find(panel=>panel.textContent.includes('sourced facts')).querySelectorAll('dt').length"),profile.profile_facts.length);
  await click('#show-list');
  assert.deepEqual(await evaluate("Array.from(document.querySelectorAll('#treemap-list [data-company]'),button=>button.dataset.company)"),values.rows.map(row=>row.id));
  assert.equal(await evaluate("document.querySelectorAll('#treemap-list [data-figure-basis]').length"),values.rows.length);
  await click('#show-cards');
  assert.deepEqual(await cardIds(),values.rows.map(row=>row.id));
  assert.equal(await evaluate("document.querySelectorAll('#treemap-cards [data-figure-basis]').length"),values.rows.length);
  await click('#treemap-missing summary');
  await click('#treemap-missing [data-company="startup:eucalyptus"]');
  assert.match(await text('#treemap-figure-panel'),/No standalone company value/);
  await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await navigate('?metric=company-value&selected=startup%3Arevolut');
  await until(()=>evaluate("document.querySelector('#treemap-inspector-sheet').open&&document.querySelector('#treemap-figure-panel')?.getClientRects().length>0"),'Company value deep link must open the private valuation sheet');
  assert.match(await text('#treemap-figure-panel'),/Private valuation/);
  assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true,'Company value must fit on mobile');
  await screenshot('company-value-evidence-mobile.png');
  await command('Emulation.setDeviceMetricsOverride',{width:320,height:480,deviceScaleFactor:1,mobile:true});
  await navigate('?metric=company-value&view=list&selected=startup%3Arevolut');
  await until(()=>evaluate("document.querySelector('#treemap-inspector-sheet').open&&document.activeElement.id==='treemap-detail'"),'The figure sheet must open and focus the inspector on a short phone');
  await evaluate('document.fonts.ready.then(()=>true)');
  assert.equal(await evaluate(`(() => {
    const sheet=document.querySelector('#treemap-sheet-content');
    const copy=document.querySelector('.treemap-detail-copy');
    const figure=document.querySelector('#treemap-figure-panel');
    // Exercise an unbroken evidence value and larger text in a short sheet.
    figure.querySelector('dd').textContent='USD '+ '1234567890'.repeat(5);
    figure.style.fontSize='150%';
    figure.querySelector('dl').style.fontSize='inherit';
    return document.documentElement.scrollWidth<=320 && sheet.scrollWidth===sheet.clientWidth
      && sheet.scrollHeight>sheet.clientHeight && getComputedStyle(copy).overflowY==='visible';
  })()`),true,'A short sheet must use one vertical scroller and reflow long evidence without horizontal scrolling');
  const focusedSource=await evaluate(`(() => {
    const source=document.querySelector('#treemap-figure-panel a');
    const sheet=document.querySelector('#treemap-sheet-content');
    source.focus();
    const bounds=sheet.getBoundingClientRect(), link=source.getBoundingClientRect();
    return {focused:source===document.activeElement,scroll:sheet.scrollTop,top:link.top-bounds.top,bottom:link.bottom-bounds.bottom};
  })()`);
  assert.ok(focusedSource.focused && focusedSource.scroll>0 && focusedSource.top>=0 && focusedSource.bottom<=1,
    `A focused evidence link must scroll into the visible sheet: ${JSON.stringify(focusedSource)}`);
  await command('Emulation.setEmulatedMedia',{features:[]});
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
  const reviewedFundingMarks = new Map([
    ['startup:synthesia','./assets/logos/synthesia.svg'],
    ['startup:culture-amp','./assets/logos/culture-amp.svg'],
    ['startup:quantum-brilliance','./assets/logos/quantum-brilliance.svg'],
  ]);
  const expectedFundingCards = defaultFunding.rows.map((row,index)=>({
    id:row.id, rank:String(index+1), amount:formatValue(row.value,'funding','USD'),
    mark:logoFor(row.entity.name) || reviewedFundingMarks.get(row.id) || null,
  }));
  const fundingCards=()=>evaluate(`Array.from(document.querySelectorAll('#treemap-cards [data-company]'), card=>({
    id:card.dataset.company, rank:card.querySelector('.treemap-card-rank').textContent,
    amount:card.querySelector('.treemap-card-value').textContent, mark:card.querySelector('img')?.getAttribute('src') ?? null
  }))`);
  assert.deepEqual(await fundingCards(),expectedFundingCards);
  const markSelector = id => `#treemap-cards [data-company="${id}"] img`;
  const loadFundingMarks = async()=>{
    for (const [id,path] of reviewedFundingMarks) {
      await until(()=>evaluate(`(()=>{const img=document.querySelector(${JSON.stringify(markSelector(id))});
        return img?.getAttribute('src')===${JSON.stringify(path)}&&img.naturalWidth>0&&!img.hidden&&img.nextElementSibling.hidden;})()`),
      `Reviewed funding mark did not load for ${id}`);
    }
  };
  await loadFundingMarks();
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
      return {top,width,featured:card.classList.contains('featured')};
    });
  })()`);
  assert.equal(boardLayout.length,7);
  assert.ok(boardLayout.slice(0,3).every(card=>card.featured&&card.top===boardLayout[0].top));
  assert.ok(boardLayout[0].width>boardLayout[1].width,'The lead card must be wider than the other featured cards');
  assert.ok(boardLayout.slice(3).every(card=>!card.featured&&card.top===boardLayout[3].top));
  assert.equal(await evaluate("document.querySelectorAll('#treemap-cards .compact-tail').length"),(defaultFunding.rows.length-3)%4);
  await screenshot('funding-default-desktop.png');
  for (const row of defaultFunding.rows) {
    await click(`#treemap-cards [data-company="${row.id}"]`);
    const sources=await evaluate("Array.from(document.querySelectorAll('#treemap-figure-panel a'), link=>link.href)");
    assert.ok(sources.includes(new URL(row.event.source).href),`Funding evidence must stay available for ${row.id}`);
    if (!reviewedFundingMarks.has(row.id)) continue;
    await click('#treemap-company-tab');
    await until(()=>evaluate(`Array.from(document.querySelectorAll('#treemap-company-panel a')).some(link=>
      link.textContent.includes('Logo source')&&link.href===${JSON.stringify(row.entity.logo_source)}&&link.getClientRects().length>0)`),
    `Reviewed logo attribution must be discoverable for ${row.id}`);
  }
  await click('#treemap-detail [data-treemap-clear-selection]');
  const failingMark=JSON.stringify(markSelector('startup:synthesia'));
  await evaluate(`document.querySelector(${failingMark}).src='/missing-reviewed-mark.svg'`);
  await until(()=>evaluate(`(()=>{const img=document.querySelector(${failingMark});
    return img.hidden&&!img.nextElementSibling.hidden&&img.nextElementSibling.textContent==='Synthesia';})()`),
  'A failed reviewed funding mark must show the typeset company name');
  await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await navigate('?view=cards&metric=funding');
  await loadFundingMarks();
  assert.deepEqual(await fundingCards(),expectedFundingCards);
  assert.equal(await evaluate(`(()=>{const cards=Array.from(document.querySelectorAll('#treemap-cards [data-company]'),
    card=>card.getBoundingClientRect());return document.documentElement.scrollWidth<=innerWidth&&
    cards.every((card,index)=>card.left===cards[0].left&&card.width===cards[0].width&&
      (index===0||card.top>cards[index-1].top));})()`),true,'Funding Cards must form one full-width column at 390px');
  await screenshot('funding-default-mobile.png',true);
  await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});
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
  await verifyAreas(market,true);
  await navigate('?metric=company-value');
  assert.match(await text('#treemap-status'),/JSON backup/);
  await verifyAreas(values,true);
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
  assert.match(await text('#treemap-status'),/different observation dates/);

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
  assert.deepEqual(unmappedExternalRequests(session,snapshot.entities.map(entity=>entity.logo)),[],'Treemap resources must remain self-hosted apart from sourced entity image URLs');
  console.log('Treemap phase timings:',JSON.stringify(transport.timings.summary()));
  console.log('Treemap browser checks passed: proportional views, Company value basis and evidence, public market cap, technology grouping, ranked cards, currencies, source caveats, country and city drilldown, independent colour, excluded selection and comparison, keyboard/profile navigation, desktop/mobile, SQLite/JSON fallback and unavailable state.');
} catch(error) {
  await captureFailure('treemap-failed.png').catch(()=>{});throw error;
} finally {
  await transport.close();
}
