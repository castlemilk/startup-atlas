// Real Chrome coverage for the design catalogue and its connected profile flows.
// Uses the same built-in CDP harness as the graph and treemap browser checks.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {launchBrowserTransport, saveScreenshot, unmappedExternalRequests} from './browser-transport.mjs';
import {checkDesignWorkbench} from './design-workbench-browser-checks.mjs';
import {checkDirectoryWireframes} from './directory-wireframe-browser-checks.mjs';
import {checkProfileWireframes} from './profile-wireframe-browser-checks.mjs';
import {checkAtlasSdk} from './atlas-sdk-browser-checks.mjs';
import {checkEditorialExplorer} from './editorial-explorer-browser-checks.mjs';
import {contrastRatio} from '../web/design-token-reference.js';
import {companyColumns} from '../web/company-columns.js';

const root=resolve('dist');
const graph=JSON.parse(await readFile(join(root,'data/graph.json'),'utf8'));
const catalogue=JSON.parse(await readFile(join(root,'data/catalogue.json'),'utf8'));
const partners=JSON.parse(await readFile(join(root,'data/partner-profiles.json'),'utf8'));
const startups=graph.entities.filter(entity=>entity.kind==='startup');
const missingFunding=startups.find(entity=>!graph.funding_rounds.some(round=>round.startup_id===entity.id));
assert.ok(graph.entities.some(entity=>entity.id==='startup:canva'),'Canva is the profile navigation fixture');
assert.ok(partners.Airtree?.companies.length&&partners.Airtree?.people.length,'Airtree provides a sourced company and team sample');
assert.ok(missingFunding,'A startup without recorded funding is needed to verify unknown data');
const screenshotDir=process.env.ATLAS_SCREENSHOTS_DIR||join(tmpdir(),'atlas-view-screenshots');
const requests=[];
// Shared transport/lifecycle (#149): static server, Chrome spawn, CDP
// session, bounded commands, socket-exit rejection and phase timings.
// This suite keeps the object-shaped console capture ({level, text}).
const transport=await launchBrowserTransport({
  root,
  profilePrefix:'atlas-views-chrome-',
  server:{requests,contentTypes:{'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.sqlite':'application/octet-stream','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.md':'text/markdown'}},
  session:{consoleFormat:'object'},
});
const address=transport.address;
let captureFailure=async()=>{},readDiagnostics=async()=>({state:'unavailable'});
try {
  const session=await transport.connect();
  const {command,evaluate,until}=session;
  const exceptions=session.exceptions, browserMessages=session.browserMessages;
  async function navigate(path,ready) {
    const generation=session.navigationCount;
    await command('Page.navigate',{url:address+path});
    await until(async()=>session.navigationCount>generation,'Navigation did not commit: '+path);
    await until(()=>evaluate(ready),'View did not become ready: '+path);
  }
  let lastPointerAction;
  async function click(selector) {
    const quoted=JSON.stringify(selector);
    lastPointerAction={selector};
    await evaluate(`(()=>{
      const el=document.querySelector(${quoted});
      if(!el)throw new Error('Missing control: '+${quoted});
      const trace=window.__atlasTestPointerTrace||(window.__atlasTestPointerTrace={events:[]});
      trace.events=[];
      if(!trace.installed){
        trace.installed=true;
        for(const type of ['pointermove','pointerdown','pointerup','click'])document.addEventListener(type,event=>{
          const target=event.target.closest?.('button,a,input,select')||event.target;
          trace.events.push({type,target:target.tagName,id:target.id,pattern:target.dataset?.pattern,x:event.clientX,y:event.clientY,scrollY,trusted:event.isTrusted});
          if(trace.events.length>12)trace.events.shift();
        },true);
      }
      el.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'});
    })()`);
    // Scroll anchoring or an iframe fragment navigation can move a control after
    // scrollIntoView returns. Check geometry and hit targets across two frames,
    // move the real pointer, then check again before pressing at that position.
    const settledPoint=`(async()=>{
      const read=()=>{
        const el=document.querySelector(${quoted}),r=el?.getBoundingClientRect();
        if(!r||r.width<=0||r.height<=0||el.matches(':disabled'))return null;
        // A wrapping inline link has one client rectangle per line. The centre
        // of its union can be whitespace, even though every text line works.
        for(const fragment of el.getClientRects()) {
          const left=Math.max(0,fragment.left),right=Math.min(innerWidth,fragment.right);
          const top=Math.max(0,fragment.top),bottom=Math.min(innerHeight,fragment.bottom);
          if(right<=left||bottom<=top)continue;
          const x=(left+right)/2,y=(top+bottom)/2,hit=document.elementFromPoint(x,y);
          if(hit&&(hit===el||el.contains(hit)))return {x,y,width:r.width,height:r.height,scrollX,scrollY};
        }
        return null;
      };
      const first=read();await new Promise(requestAnimationFrame);
      const second=read();await new Promise(requestAnimationFrame);
      const third=read();
      return first&&second&&third&&Object.keys(first).every(key=>Math.abs(first[key]-second[key])<0.5&&Math.abs(second[key]-third[key])<0.5)?third:null;
    })()`;
    const point=await until(async()=>{
      // A preceding fragment link can finish its smooth scroll after the first
      // reveal. Retry only when the target's click point has left the viewport.
      const revealed=await evaluate(`(()=>{
        const el=document.querySelector(${quoted}),r=el?.getBoundingClientRect();
        if(!r)return false;
        const x=r.x+r.width/2,y=r.y+r.height/2,outside=x<=0||x>=innerWidth||y<=0||y>=innerHeight;
        if(outside)el.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'});
        return outside;
      })()`);
      if(revealed)lastPointerAction.scrollRetries=(lastPointerAction.scrollRetries||0)+1;
      const before=await evaluate(settledPoint);
      if(!before)return false;
      await command('Input.dispatchMouseEvent',{type:'mouseMoved',x:before.x,y:before.y,button:'none',buttons:0});
      const after=await evaluate(settledPoint);
      return after&&Math.abs(before.x-after.x)<0.5&&Math.abs(before.y-after.y)<0.5?after:false;
    },'Control did not remain reachable under the pointer: '+selector);
    lastPointerAction.point=point;
    await command('Input.dispatchMouseEvent',{type:'mousePressed',x:point.x,y:point.y,button:'left',buttons:1,clickCount:1});
    await command('Input.dispatchMouseEvent',{type:'mouseReleased',x:point.x,y:point.y,button:'left',buttons:0,clickCount:1});
    lastPointerAction.events=await evaluate('window.__atlasTestPointerTrace?.events').catch(()=>null);
  }
  async function press(key,code,keyCode,modifiers=0) {
    const character=key==='Enter'&&modifiers===0?{nativeVirtualKeyCode:keyCode,text:'\r',unmodifiedText:'\r'}:{};
    await command('Input.dispatchKeyEvent',{type:'keyDown',key,code,windowsVirtualKeyCode:keyCode,modifiers,...character});
    await command('Input.dispatchKeyEvent',{type:'keyUp',key,code,windowsVirtualKeyCode:keyCode,modifiers});
  }
  async function screenshot(name,fullPage=false) {
    const options={format:'png'};
    if(fullPage) {
      const size=(await command('Page.getLayoutMetrics')).cssContentSize;
      options.captureBeyondViewport=true;
      options.clip={x:0,y:0,width:size.width,height:size.height,scale:1};
    }
    await saveScreenshot(session,screenshotDir,name,options);
  }
  async function assertNoOverflow(label) {
    const dimensions=await evaluate('({scroll:document.documentElement.scrollWidth,viewport:innerWidth})');
    assert.ok(dimensions.scroll<=dimensions.viewport+1,`${label} overflows horizontally: ${JSON.stringify(dimensions)}`);
  }
  async function assertActionContrast(selector) {
    const paint=await evaluate(`(()=>{const style=getComputedStyle(document.querySelector(${JSON.stringify(selector)}));return {text:style.color,image:style.backgroundImage,surface:style.backgroundColor};})()`);
    const surfaces=paint.image==='none'?[paint.surface]:paint.image.match(/rgb\([^)]+\)/g)||[];
    assert.ok(surfaces.length,`${selector} needs a measurable painted surface`);
    for(const surface of surfaces)assert.ok(contrastRatio(paint.text,surface)>=4.5,`${selector} text must contrast with every gradient stop: ${JSON.stringify(paint)}`);
  }
  const text=selector=>evaluate(`document.querySelector(${JSON.stringify(selector)})?.textContent||''`);
  captureFailure=screenshot;
  readDiagnostics=async()=>({
    state:await evaluate(`({url:location.href,title:document.title,ready:document.readyState,viewport:{width:innerWidth,height:innerHeight},heading:document.querySelector('main h1')?.textContent,frame:document.querySelector('#view-preview')?.src,body:document.body?.innerText?.slice(-1800)})`).catch(()=>'<unavailable>'),
    lastPointerAction,exceptions,browserMessages,failedRequests:requests.filter(request=>request.status!==200)
  });
  await command('Page.enable');await command('Runtime.enable');await command('Network.enable');
  await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1050,deviceScaleFactor:1,mobile:false});

  const landingReady="document.querySelector('.landing-preview img')?.naturalWidth>0&&!!document.querySelector('.atlas-wordmark')";
  await navigate('/',landingReady);
  assert.deepEqual(await evaluate("[...document.querySelectorAll('.landing-views strong')].map(heading=>heading.textContent)"),['List','Graph','Treemap']);
  assert.match(await evaluate("document.querySelector('.landing-preview img').currentSrc"),/atlas-list-wide\.webp$/);
  assert.ok(await evaluate("document.querySelector('.skip-link').getBoundingClientRect().bottom<0"),'Skip link must stay out of view until focused');
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.landing-footer')).backgroundColor"),'rgba(0, 0, 0, 0)','Source links must be readable on the paper background');
  await assertNoOverflow('Desktop landing');
  await screenshot('atlas-landing-desktop.png');
  await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await until(()=>evaluate("document.querySelector('.landing-preview img').currentSrc.endsWith('atlas-list-compact.webp')"),'Landing did not select the compact StageShow artwork');
  assert.ok(await evaluate("document.querySelector('.landing-views a:last-child').getBoundingClientRect().bottom < document.querySelector('.landing-preview').getBoundingClientRect().top"),'Mobile navigation precedes the preview');
  await assertNoOverflow('Mobile landing');
  await screenshot('atlas-landing-mobile.png',true);
  await click('.landing-primary');
  await until(()=>evaluate("location.pathname==='/list.html'&&!!document.querySelector('[data-column=technology]')"),'Landing CTA did not open the company list');
  await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1050,deviceScaleFactor:1,mobile:false});
  await navigate('/list.html?type=startup&q=Canva&technology=Design+%26+media&columns=technology,founders,value',"!!document.querySelector('[data-entity-id=\"startup:canva\"] td[data-column=founders]')");
  assert.match(await text('[data-entity-id="startup:canva"] td[data-column=founders]'),/Melanie Perkins/);
  assert.match(await text('[data-entity-id="startup:canva"] td[data-column=value]'),/USD.*Private valuation/);
  await click('[data-atlas-view=graph]');
  await until(()=>evaluate("location.pathname==='/graph.html' && [...document.querySelectorAll('.graph-company-group h3')].length===1 && !!document.querySelector('[data-graph-company=\"startup:canva\"]')"),'Graph did not keep the List technology filter');
  await click('[data-atlas-view=treemap]');
  await until(()=>evaluate("location.pathname==='/treemap.html'&&!!document.querySelector('#treemap-chart [data-company=\"startup:canva\"]')"),'Treemap did not keep the filtered company');
  assert.equal(await evaluate("new URLSearchParams(location.search).get('technology')"),'Design & media');

  const columns=[...companyColumns.keys()].join(',');
  const companyListReady="document.querySelector('#results-list')?.getAttribute('aria-busy')==='false' && !!document.querySelector('.directory-table-frame')";
  await navigate('/list.html?type=startup&columns='+columns,companyListReady);
  await until(()=>evaluate("!document.querySelector('#directory-table-scroll').hidden"),'Wide tables must advertise horizontal scroll');
  const pinnedX=await evaluate("document.querySelector('.directory-company-row .entity-row-main').getBoundingClientRect().left");
  await click('#directory-columns-next');
  await until(()=>evaluate("document.querySelector('.directory-table-frame').scrollLeft>100"),'Next columns must scroll the table');
  assert.equal(await evaluate("document.querySelector('.directory-company-row .entity-row-main').getBoundingClientRect().left"),pinnedX,'Company identity stays in view');
  await assertNoOverflow('Desktop all company columns');
  await screenshot('atlas-list-wide-columns.png');
  await navigate('/list.html',companyListReady);
  const canScroll=await evaluate("(()=>{const frame=document.querySelector('.directory-table-frame');return frame.scrollHeight>frame.clientHeight;})()");
  assert.equal(canScroll,true,'The default table must give all loaded rows a real scroll range');
  await evaluate("document.querySelector('#search').focus({preventScroll:true})");
  const wheel=await evaluate("(()=>{const frame=document.querySelector('.directory-table-frame').getBoundingClientRect();return {x:Math.round(frame.left+frame.width/2),y:Math.round(frame.top+50)};})()");
  await command('Input.dispatchMouseEvent',{type:'mouseWheel',...wheel,deltaX:0,deltaY:1200});
  await until(()=>evaluate("document.querySelectorAll('.directory-company-row').length===24"),'Scroll should append another page of companies');
  assert.equal(await evaluate('document.activeElement.id'),'search','Automatic continuation preserves focus');
  assert.equal(await evaluate("new URL(location.href).searchParams.get('shown')"),'24');
  await navigate('/list.html?type=startup&q=Wise&columns=market-cap,ownership,listing,private-valuation,funding,founders',companyListReady);
  assert.match(await text('[data-entity-id="startup:wise"] [data-column=market-cap]'),/USD.*\d{4}-\d{2}-\d{2}/s);
  assert.match(await text('[data-entity-id="startup:wise"] [data-column=listing]'),/WSE/);
  assert.ok(await evaluate("!!document.querySelector('[data-entity-id=\"startup:wise\"] [data-column=market-cap] a[href^=\"https:\"]')"),'Market cap links to its source');
  await evaluate("document.querySelector('[data-directory-sort=market-cap]').focus()");
  await press('Enter','Enter',13);
  await until(()=>evaluate("document.activeElement?.dataset.directorySort==='market-cap'&&new URL(location.href).searchParams.get('sort')==='market-cap'"),'Sorting must restore focus to the current header');
  await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await navigate('/list.html?type=startup&q=Canva&columns='+columns,companyListReady);
  assert.equal(await evaluate("document.querySelector('[data-entity-id=\"startup:canva\"] [data-column=founders] a[href*=melanie-perkins]').textContent"),'Melanie Perkins');
  assert.match(await text('[data-entity-id="startup:canva"] [data-column=private-valuation]'),/USD/);
  await click('.directory-columns-trigger');
  await until(()=>evaluate("document.querySelector('#directory-columns').open"),'Mobile opens Columns directly');
  await assertNoOverflow('Mobile columns menu');
  await press('Escape','Escape',27);
  await assertNoOverflow('Mobile all company columns');
  await screenshot('atlas-list-mobile-columns.png');
  await navigate('/list.html',companyListReady);
  const mobileToolbar=await evaluate(`(()=>{
    const bounds=selector=>document.querySelector(selector).getBoundingClientRect();
    return {searchBottom:bounds('#search').bottom,filters:bounds('.exploration-country-trigger').top,
      columns:bounds('.directory-columns-trigger').top,options:bounds('#directory-options-trigger').top};
  })()`);
  assert.ok(mobileToolbar.searchBottom<mobileToolbar.filters,'Search gets a full row on mobile');
  assert.equal(mobileToolbar.columns,mobileToolbar.options,'Mobile options stay in the action row');
  const mobileScroll=await evaluate("Math.ceil(document.querySelector('.directory-company-row:last-child').getBoundingClientRect().bottom-innerHeight+64)");
  await command('Input.dispatchMouseEvent',{type:'mouseWheel',x:185,y:465,deltaX:0,deltaY:mobileScroll});
  await until(()=>evaluate("document.querySelectorAll('.directory-company-row').length===24"),'Mobile page scroll should append another batch');
  await navigate('/graph.html',"document.querySelector('#graph-company-overview')?.hidden===false");
  assert.equal(await evaluate("document.querySelectorAll('[data-graph-company]').length"),startups.length,'Graph defaults to every published company');
  assert.ok(await evaluate("document.querySelectorAll('.graph-company-group').length>1"),'Sector or technology groups should be visible');
  await evaluate("(()=>{const group=document.querySelector('#graph-company-group');group.value='country';group.dispatchEvent(new Event('change',{bubbles:true}));})()");
  assert.match(await text('#graph-company-groups'),/Australia/);
  await assertNoOverflow('Mobile grouped Graph overview');
  await screenshot('atlas-graph-company-overview.png');
  if (!await evaluate("document.querySelector('#graph-company-directory').open")) await click('#graph-company-directory > summary');
  await click('[data-graph-company="startup:canva"]');
  await until(()=>evaluate("document.querySelector('#graph-detail h2')?.textContent==='Canva'&&!document.querySelector('#graph-neighborhood').hidden"),'A company opens its graph');
  await evaluate('history.back()');
  await until(()=>evaluate("!document.querySelector('#graph-company-overview').hidden && new URL(location.href).searchParams.get('group')==='country'"),'Back returns to the chosen overview grouping');
  await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1050,deviceScaleFactor:1,mobile:false});

  // Every catalogue tab must load its actual route and meaningful data in the iframe.
  await navigate('/design-system.html',"document.querySelector('#entity-specimen')?.getAttribute('aria-busy')==='false'&&!!document.querySelector('#entity-specimen .entity-row')");
  await assertActionContrast('.ds-intro .atlas-button-primary');
  assert.match(await text('#ds-snapshot'),new RegExp(`${graph.entities.length} entity records`));
  const patterns=[
    {key:'search',path:'/list.html',ready:"d.querySelector('#entity-kind')?.value==='startup'&&d.querySelectorAll('#results-list .entity-row').length>0"},
    {key:'treemap',path:'/treemap.html',ready:"d.querySelectorAll('.treemap-tile').length>0&&d.querySelector('#treemap-metric')?.value==='company-value'&&d.querySelector('#treemap-group')?.value==='technology'"},
    {key:'graph',path:'/graph.html',ready:"d.querySelectorAll('.network-node').length>0&&d.querySelector('#graph-detail h2')?.textContent==='Canva'"},
    {key:'startup',path:'/entity.html',ready:"d.querySelector('#entity-profile')?.getAttribute('aria-busy')==='false'&&d.querySelector('#entity-profile h1')?.textContent==='Canva'"},
    {key:'partner',path:'/partner.html',ready:"d.querySelector('#profile')?.getAttribute('aria-busy')==='false'&&d.querySelector('#profile h1')?.textContent==='Airtree'"}
  ];
  for(const pattern of patterns) {
    await click(`[data-pattern="${pattern.key}"]`);
    await until(()=>evaluate(`document.querySelector('[data-pattern="${pattern.key}"]').getAttribute('aria-selected')==='true'`),'Catalogue tab did not activate '+pattern.key);
    await until(()=>evaluate(`(()=>{const f=document.querySelector('#view-preview'),d=f?.contentDocument;return f?.contentWindow?.location.pathname===${JSON.stringify(pattern.path)}&&d&&(${pattern.ready});})()`),'Catalogue iframe did not render '+pattern.key);
    assert.equal(await evaluate(`document.querySelector('[data-pattern="${pattern.key}"]').getAttribute('aria-selected')`),'true');
    assert.equal(await evaluate("document.querySelectorAll('[data-pattern][aria-selected=true]').length"),1);
    assert.equal(await evaluate("new URL(document.querySelector('#pattern-open').href).pathname"),pattern.path);
    assert.ok(await evaluate("document.querySelector('#view-preview').title.length>0"),'Iframe needs an accessible title');
    assert.equal(await evaluate(`(()=>{
      const doc=document.querySelector('#view-preview').contentDocument;
      return doc.defaultView.getComputedStyle(doc.body).getPropertyValue('--atlas-paper').trim();
    })()`),'#f9f8f5','Live previews use the approved paper palette');
    if (['search','treemap','graph'].includes(pattern.key)) {
      const intro=await evaluate(`(()=>{
        const doc=document.querySelector('#view-preview').contentDocument;
        const heading=[...doc.querySelectorAll('main h1')].find(node=>node.getClientRects().length);
        return {hasTitle:!!heading?.textContent.trim(),images:doc.querySelectorAll('.atlas-feature img').length};
      })()`);
      assert.deepEqual(intro,{hasTitle:true,images:0},'The working view leads with a compact, text-only introduction');
    } else {
      assert.ok(await evaluate("!!document.querySelector('#view-preview').contentDocument.querySelector('.atlas-evidence-heading [aria-hidden=true] .atlas-icon')"),'Profile sources share the decorative evidence mark');
    }
  }
  await evaluate("document.querySelector('#pattern-partner').focus()");
  await press('Home','Home',36);
  await until(()=>evaluate("document.querySelector('#pattern-search').getAttribute('aria-selected')==='true'&&document.querySelector('#view-preview').contentDocument?.querySelectorAll('#results-list .entity-row').length>0"),'Keyboard Home did not select the first explorer tab');
  await evaluate("(async()=>{scrollTo({top:0,behavior:'instant'});await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);})()");
  await assertNoOverflow('Desktop catalogue');
  await screenshot('atlas-catalogue-desktop.png');

  await click('[data-pattern="startup"]');
  await until(()=>evaluate("document.querySelector('#view-preview').contentDocument?.querySelector('#entity-profile h1')?.textContent==='Canva'"),'Startup preview did not load');
  await click('button[data-device="mobile"]');
  await until(()=>evaluate("document.querySelector('#view-preview').contentWindow.innerWidth===390"),'Mobile preview did not establish a 390px viewport');
  assert.ok(await evaluate("(()=>{const w=document.querySelector('#view-preview').contentWindow;return w.document.documentElement.scrollWidth<=w.innerWidth+1;})()"),'Startup preview must fit its 390px viewport');
  assert.equal(await evaluate("document.querySelector('button[data-device=mobile]').getAttribute('aria-pressed')"),'true');
  await evaluate("document.querySelector('.ds-preview-toolbar').scrollIntoView({block:'start',behavior:'instant'})");
  await screenshot('atlas-catalogue-mobile-preview.png');

  await checkDirectoryWireframes({command,evaluate,navigate,until,click,press,screenshot,assertNoOverflow,graph});
  await checkDesignWorkbench({command,evaluate,navigate,until,click,press,screenshot,assertNoOverflow});

  // A real directory flow must retain its scope and loaded range after profile anchors.
  await navigate('/?type=startup#directory',"document.querySelector('#results-list')?.getAttribute('aria-busy')==='false'&&document.querySelectorAll('#results-list .entity-row').length>0");
  assert.equal(await evaluate("document.querySelectorAll('#results-list .entity-row').length"),Math.min(12,startups.length));
  assert.match(await text('#result-count'),new RegExp(`${startups.length} results`));
  await click('#search');
  await command('Input.insertText',{text:'Canva'});
  await until(()=>evaluate("new URLSearchParams(location.search).get('q')==='Canva'&&!!document.querySelector('#results-list a[href*=\"startup%3Acanva\"]')"),'Directory search did not find Canva');
  await click('#clear-search');
  assert.equal(await evaluate("document.querySelector('#search').value"),'');
  assert.equal(await evaluate('document.activeElement.id'),'search','Clear must restore input focus');
  assert.equal(await evaluate("new URLSearchParams(location.search).has('q')"),false);
  await click('#load-more');
  const shown=Math.min(24,startups.length);
  await until(()=>evaluate(`document.querySelectorAll('#results-list .entity-row').length===${shown}`),'Load more did not append researched startups');
  assert.match(await text('#result-range'),new RegExp(`Showing ${shown} of ${startups.length} results`));
  const directoryReturn=await evaluate('location.pathname+location.search+location.hash');
  await evaluate("document.querySelector('#directory').scrollIntoView({block:'start',behavior:'instant'})");
  await screenshot('atlas-directory-desktop.png');
  await click('#results-list .entity-row-main a[href="./entity.html?id=startup%3Acanva"]');
  await until(()=>evaluate("document.querySelector('#entity-profile h1')?.textContent==='Canva'&&document.querySelector('[data-atlas-back]')?.textContent==='Back to search results'"),'Startup profile did not retain its directory entry point');
  assert.equal(await evaluate("new URL(document.querySelector('[data-atlas-back]').href).pathname+new URL(document.querySelector('[data-atlas-back]').href).search+new URL(document.querySelector('[data-atlas-back]').href).hash"),directoryReturn);
  const expectedFounders=graph.edges.filter(edge=>edge.kind==='founded'&&(edge.to==='startup:canva'||edge.from==='startup:canva')).length;
  assert.equal(await evaluate("document.querySelectorAll('#entity-founders .entity-connection').length"),expectedFounders);
  assert.ok(await evaluate("document.querySelectorAll('#entity-company .entity-fact-source a[href^=\"https://\"]').length>0"),'Company facts must expose source evidence');
  await evaluate("scrollTo({top:0,behavior:'instant'})");
  await assertActionContrast('.entity-actions .atlas-button-primary');
  await screenshot('atlas-startup-desktop.png');
  await click('.atlas-section-nav a[href="#entity-funding"]');
  await until(()=>evaluate("location.hash==='#entity-funding'"),'Funding section navigation did not update the fragment');
  await until(()=>evaluate("document.querySelector('.atlas-section-nav a[href=\"#entity-funding\"]').getAttribute('aria-selected')==='true'&&!document.querySelector('#entity-funding').hidden"),'Funding tab should be selected and its panel shown');
  assert.equal(await text('[data-atlas-back]'),'Back to search results','Section links must not replace the originating return with a self-link');
  assert.match(await text('#entity-funding'),/Historical announcements/);
  await click('[data-atlas-back]');
  await until(()=>evaluate(`document.querySelectorAll('#results-list .entity-row').length===${shown}&&document.querySelector('#entity-kind')?.value==='startup'`),'Returning from the profile did not restore directory scope and loaded range');
  assert.equal(await evaluate('location.pathname+location.search+location.hash'),directoryReturn);

  // The primary profile action opens this company, not the graph's default root.
  await click('#results-list .entity-row-main a[href="./entity.html?id=startup%3Acanva"]');
  await until(()=>evaluate("document.querySelector('#entity-profile h1')?.textContent==='Canva'"),'Canva did not reopen');
  await click('.entity-actions .atlas-button-primary');
  await until(()=>evaluate("document.querySelector('.network-node.is-root')?.dataset.node==='startup:canva'&&document.querySelector('#graph-detail h2')?.textContent==='Canva'"),'Startup-to-graph navigation lost the company');
  assert.equal(await evaluate("new URLSearchParams(location.search).get('entity')"),'startup:canva');

  await navigate('/partner.html?name=Airtree',"document.querySelector('#profile')?.getAttribute('aria-busy')==='false'&&document.querySelector('#profile h1')?.textContent==='Airtree'");
  assert.equal(await evaluate("document.querySelectorAll('#partner-companies .profile-item').length"),partners.Airtree.companies.length);
  assert.equal(await evaluate("document.querySelectorAll('#partner-people .profile-item').length"),partners.Airtree.people.length);
  assert.match(await text('#partner-companies .profile-sample'),/Selected portfolio sample/);
  assert.equal(await evaluate("document.querySelector('#partner-companies .profile-sample time')?.dateTime"),partners.Airtree.checked);
  const readingOrder=await evaluate("(()=>{const companies=document.querySelector('#partner-companies'),people=document.querySelector('#partner-people');return {dom:!!(companies.compareDocumentPosition(people)&Node.DOCUMENT_POSITION_FOLLOWING),companiesShown:!companies.hidden,peopleHidden:people.hidden};})()");
  assert.deepEqual(readingOrder,{dom:true,companiesShown:true,peopleHidden:true},'Companies should precede people in the DOM and be the panel shown first');
  await assertActionContrast('.profile-actions .atlas-button-primary');
  assert.ok(await evaluate("[...document.querySelectorAll('#partner-companies .profile-item-source,#partner-people .profile-item-source')].every(row=>row.querySelector('a[href^=\"https://\"]'))"),'Every researched company/person needs visible evidence');
  await assertNoOverflow('Desktop partner profile');
  await screenshot('atlas-partner-desktop.png');

  await navigate('/entity.html?id='+encodeURIComponent(missingFunding.id),"document.querySelector('#entity-profile')?.getAttribute('aria-busy')==='false'");
  assert.equal(await text('#entity-profile h1'),missingFunding.name);
  assert.equal(await evaluate("document.querySelectorAll('#entity-funding .entity-round').length"),0);
  assert.match(await text('#entity-funding'),/no recorded (?:funding|financing events)/i);

  await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await navigate('/entity.html?id=startup%3Acanva',"document.querySelector('#entity-profile')?.getAttribute('aria-busy')==='false'&&document.querySelector('#entity-profile h1')?.textContent==='Canva'");
  await assertNoOverflow('390px startup profile');
  await screenshot('atlas-startup-mobile.png',true);
  await click('.atlas-section-nav a[href="#entity-founders"]');
  assert.ok(await evaluate("document.querySelector('#entity-founders .entity-connection-copy a').getBoundingClientRect().width>0"),'Founder navigation remains available on mobile');
  await navigate('/partner.html?name=Airtree',"document.querySelector('#profile')?.getAttribute('aria-busy')==='false'&&document.querySelector('#profile h1')?.textContent==='Airtree'");
  await assertNoOverflow('390px partner profile');
  await screenshot('atlas-partner-mobile.png',true);

  await navigate('/list.html',"!!document.querySelector('[data-atlas-explorer-actions] [data-atlas-view=directory][aria-current=page]')");
  const masthead=await evaluate(`(()=>{
    const bar=document.querySelector('.atlas-masthead');
    return {
      brand:getComputedStyle(bar.querySelector('.atlas-wordmark')).fontFamily,
      body:getComputedStyle(document.body).fontFamily,
      paper:getComputedStyle(bar).backgroundColor,
      selected:getComputedStyle(document.querySelector('[data-atlas-explorer-actions] [aria-current=page]')).backgroundColor
    };
  })()`);
  assert.match(masthead.brand,/^"?Atlas Newsreader/);
  assert.match(masthead.body,/^"?Atlas Inter/);
  assert.equal(await evaluate(`Promise.all([
    document.fonts.load('400 32px "Atlas Newsreader"'),
    document.fonts.load('400 14px "Atlas Inter"')
  ]).then(sets=>sets.every(fonts=>fonts.some(font=>font.status==='loaded')))`),true,'Both editorial fonts must load from the build');
  assert.equal(masthead.paper,'rgb(249, 248, 245)');
  assert.equal(masthead.selected,'rgb(18, 43, 34)');
  assert.ok(await evaluate("document.querySelector('.search-wrap').getBoundingClientRect().top < 450"),'Directory search is visible early on a narrow viewport');
  await assertNoOverflow('390px directory feature');

  await command('Network.setBlockedURLs',{urls:['*partner-profiles.json*']});
  await navigate('/partner.html?name=Airtree',"document.querySelector('#profile')?.getAttribute('aria-busy')==='false'&&!!document.querySelector('.profile-notice')");
  assert.match(await text('.profile-notice'),/Some profile research is unavailable/);
  assert.match(await text('#partner-companies'),/could not be loaded/);
  assert.ok(!(await text('#partner-companies')).includes('No companies have been researched'),'A failed fetch must not look like an unresearched company sample');
  await screenshot('atlas-partner-partial.png');
  await command('Network.setBlockedURLs',{urls:[]});

  await checkProfileWireframes({command,evaluate,navigate,until,click,press,screenshot,assertNoOverflow,partners,graph,catalogue});

  await checkAtlasSdk({command,evaluate,navigate,until,click,press,screenshot,assertNoOverflow,partners});
  await checkEditorialExplorer({command,evaluate,navigate,until,click,press,screenshot,assertNoOverflow,graph});

  assert.deepEqual(exceptions,[],'Explorer views must not raise unhandled JavaScript exceptions');
  assert.deepEqual(unmappedExternalRequests(session,graph.entities.map(entity=>entity.logo)),[],'Explorer views must remain self-hosted apart from sourced entity image URLs');
  console.log('Atlas views phase timings:',JSON.stringify(transport.timings.summary()));
  assert.deepEqual(browserMessages.filter(message=>message.level==='error'),[],'Explorer views must not log application errors');
  // The Loom atlas manifest is exempt: the #367 on-demand overview probes
  // for its export bundle and hides itself when it is absent (the bundle is
  // published by the Loom export pipeline, not this repo's Pages build, and
  // the live site answers the same 404 until that path is verified live).
  const missingAssets=requests.filter(request=>request.status===404&&!request.url.startsWith('/favicon.ico')&&!request.url.endsWith('/data/loom-atlas-manifest.json'));
  assert.deepEqual(missingAssets,[],'All requested local page and module assets must be published');
  console.log('Atlas view browser checks passed: five real previews, 390px preview, search/profile return, graph continuity, partner evidence, unknown funding, mobile layouts and partial-data state.');
} catch(error) {
  console.error('Atlas view diagnostics:',JSON.stringify(await readDiagnostics().catch(()=>({state:'unavailable'}))));
  await captureFailure('atlas-views-failed.png').catch(()=>{});
  throw error;
} finally {
  await transport.close();
}
