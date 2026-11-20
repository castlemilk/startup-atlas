import assert from 'node:assert/strict';

export async function checkAtlasSdk({command,evaluate,navigate,until,click,press,screenshot,assertNoOverflow,partners}) {
  const sdkReady="document.body.dataset.atlasSdk==='ready'&&!!window.atlasUIAgent";
  const ready=condition=>`(${sdkReady})&&(${condition})`;
  const snapshot=()=>evaluate('window.atlasUIAgent.snapshot()');
  async function audit(label,required=[]) {
    const entries=(await snapshot()).filter(entry=>!entry.offPage&&entry.component!=='more');
    for(const entry of entries) {
      assert.ok(typeof entry.label==='string'&&entry.label.trim(),`${label}: ${entry.component} ${entry.ref} has no accessible name`);
      assert.ok(Array.isArray(entry.actions),`${label}: ${entry.label} has no action contract`);
    }
    for(const name of required)assert.ok(entries.some(entry=>entry.label===name),`${label}: ${name} is missing from the SDK snapshot`);
    return entries;
  }
  async function component(label,action) {
    await until(()=>evaluate(`window.atlasUIAgent.snapshot().some(entry=>!entry.offPage&&entry.label===${JSON.stringify(label)}&&entry.actions.includes(${JSON.stringify(action)}))`),`SDK component ${label} does not expose ${action}`);
    const matches=(await snapshot()).filter(entry=>!entry.offPage&&entry.label===label&&entry.actions.includes(action));
    assert.equal(matches.length,1,`SDK name ${label} should identify one ${action} target`);
    return matches[0];
  }
  async function act(label,action,args=[]) {
    const entry=await component(label,action);
    const result=await evaluate(`window.atlasUIAgent.act(${JSON.stringify({steps:[{ref:entry.ref,action,args}]})})`);
    assert.equal(result.ok,true,`${label} ${action}: ${result.error?.message||JSON.stringify(result)}`);
    return result;
  }
  async function choose(label,match) {
    const entry=await component(label,'setValue');
    const query=await evaluate(`window.atlasUIAgent.query(${JSON.stringify({within:entry.ref})})`);
    assert.ok(Array.isArray(query),`${label} choices could not be discovered: ${JSON.stringify(query)}`);
    const choices=query.flatMap(item=>item.items||[]);
    const choice=choices.find(item=>match.test(item.label));
    assert.ok(choice,`${label} is missing the requested choice ${match}: ${JSON.stringify(choices)}`);
    await act(label,'setValue',[choice.value]);
    return choice;
  }
  async function traceNative(selector,event,key) {
    await evaluate(`(()=>{const probe={count:0};(window.__atlasSdkNative||={})[${JSON.stringify(key)}]=probe;document.querySelector(${JSON.stringify(selector)}).addEventListener(${JSON.stringify(event)},()=>probe.count++);})()`);
  }
  const nativeCount=key=>evaluate(`window.__atlasSdkNative[${JSON.stringify(key)}].count`);
  async function traceChanges() {
    await evaluate("(()=>{window.__atlasSdkChanges=[];window.atlasUIAgent.subscribe(({label,key,value,source})=>window.__atlasSdkChanges.push({label,key,value,source}));})()");
  }
  async function assertAgentChange(label,value) {
    assert.ok(await evaluate(`window.__atlasSdkChanges.some(change=>change.label===${JSON.stringify(label)}&&change.key==='value'&&change.value===${JSON.stringify(value)}&&change.source==='agent')`),`${label} must retain the agent source when its value changes`);
  }
  async function assertOneTabStop(selector) {
    const state=await evaluate(`(()=>{const root=document.querySelector(${JSON.stringify(selector)});return {radios:root.querySelectorAll('[role="radio"]').length,checked:root.querySelectorAll('[role="radio"][aria-checked="true"]').length,tabbable:[...root.querySelectorAll('[role="radio"]')].filter(item=>item.tabIndex===0).length};})()`);
    assert.ok(state.radios>1,`${selector} must expose the SDK radio-group semantics`);
    assert.equal(state.checked,1,`${selector} must have one checked item`);
    assert.equal(state.tabbable,1,`${selector} must have one tab stop`);
  }
  async function assertPopupFits(nativeId) {
    await until(()=>evaluate(`(()=>{const popup=document.querySelector('ui-select[data-native-id="${nativeId}"] ui-select-content');return popup&&popup.checkVisibility({checkOpacity:true})&&Number(getComputedStyle(popup).opacity)>=.99;})()`),`${nativeId} popup did not finish opening`);
    const rect=await evaluate(`(()=>{const popup=document.querySelector('ui-select[data-native-id="${nativeId}"] ui-select-content');if(!popup)return null;const r=popup.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom,viewportWidth:innerWidth,viewportHeight:innerHeight};})()`);
    assert.ok(rect&&rect.width>0&&rect.height>0,`${nativeId} must expose a visible SDK popup`);
    assert.ok(rect.x>=-1&&rect.right<=rect.viewportWidth+1&&rect.y>=-1&&rect.bottom<=rect.viewportHeight+1,`${nativeId} popup must fit the viewport: ${JSON.stringify(rect)}`);
  }
  const settleTop=()=>evaluate("(async()=>{scrollTo({top:0,behavior:'instant'});await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);})()");

  await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1050,deviceScaleFactor:1,mobile:false});
  await navigate('/?type=startup#directory',ready("document.querySelector('#results-list')?.getAttribute('aria-busy')==='false'&&!!document.querySelector('[data-inspect-entity=\"startup:canva\"]')"));
  const directoryEntries=await audit('Directory',['Search the directory','Entity type','Directory view']);
  console.log('SDK directory snapshot:',JSON.stringify(directoryEntries.map(({component,label,actions})=>({component,label,actions}))));
  await traceChanges();
  await traceNative('#search','input','search');
  await act('Search the directory','setValue',['Canva']);
  await until(()=>evaluate("new URLSearchParams(location.search).get('q')==='Canva'&&!!document.querySelector('[data-inspect-entity=\"startup:canva\"]')"),'Agent search did not update the real directory and URL');
  assert.equal(await nativeCount('search'),1,'One SDK search action must dispatch one native input event');
  await assertAgentChange('Search the directory','Canva');
  await traceNative('#entity-kind','change','type');
  const allTypes=await choose('Entity type',/^All types$/);
  await until(()=>evaluate("document.querySelector('#entity-kind').value==='all'&&!new URLSearchParams(location.search).has('type')"),'Agent selection did not update the directory type');
  assert.equal(await nativeCount('type'),1,'One SDK select action must dispatch one native change event');
  await assertAgentChange('Entity type',allTypes.value);
  const trigger='ui-select[data-native-id="entity-kind"] .atlas-select-trigger';
  await evaluate(`document.querySelector(${JSON.stringify(trigger)}).focus()`);
  await press('Enter','Enter',13);
  await until(()=>evaluate(`document.querySelector(${JSON.stringify(trigger)}).getAttribute('aria-expanded')==='true'`),'Enter did not open the SDK Select');
  await assertPopupFits('entity-kind');
  await press('Escape','Escape',27);
  await until(()=>evaluate(`document.querySelector(${JSON.stringify(trigger)}).getAttribute('aria-expanded')==='false'&&document.activeElement===document.querySelector(${JSON.stringify(trigger)})`),'Escape did not close the Select and restore trigger focus');
  await press('Enter','Enter',13);
  await until(()=>evaluate(`document.querySelector(${JSON.stringify(trigger)}).getAttribute('aria-expanded')==='true'`),'The Select did not reopen');
  await press('Home','Home',36);await press('ArrowDown','ArrowDown',40);await press('ArrowDown','ArrowDown',40);await press('Enter','Enter',13);
  await until(()=>evaluate("document.querySelector('#entity-kind').value==='person'&&new URLSearchParams(location.search).get('type')==='person'"),'Select keyboard choice did not update the native model and URL');
  await click('#clear-search');
  await until(()=>evaluate("document.querySelector('#search').value===''&&!new URLSearchParams(location.search).has('q')"),'SDK clear did not clear the real query');
  assert.equal(await evaluate('document.activeElement.id'),'search','SDK clear returns focus to the search field');

  await evaluate("document.querySelector('#tab-all').focus()");
  await press('ArrowRight','ArrowRight',39);
  await until(()=>evaluate("new URLSearchParams(location.search).get('view')==='opportunities'"),'SDK scope arrow did not select Opportunities');
  assert.equal(await evaluate('document.activeElement.id'),'tab-opportunities');
  await assertOneTabStop('.mode-switch');
  await press('Tab','Tab',9);
  assert.equal(await evaluate("!!document.activeElement.closest('.mode-switch')"),false,'Tab must leave the scope group after its single tab stop');
  await press('Tab','Tab',9,8);
  assert.equal(await evaluate('document.activeElement.id'),'tab-opportunities','Shift+Tab returns to the checked scope');
  await press('ArrowLeft','ArrowLeft',37);
  await until(()=>evaluate("!new URLSearchParams(location.search).has('view')"),'SDK scope arrow did not return to All');
  await choose('Directory view',/^Partner index/);
  await until(()=>evaluate("new URLSearchParams(location.search).get('view')==='partners'&&!!document.querySelector('.lead-card')"),'Agent scope change did not render partner results');
  await choose('Directory view',/^All(?:\s|$)/);
  await choose('Entity type',/^Startups$/);
  await act('Search the directory','setValue',['Canva']);
  await until(()=>evaluate("!!document.querySelector('[data-inspect-entity=\"startup:canva\"]')"),'Canva result did not recover');
  await traceNative('[data-inspect-entity="startup:canva"]','click','inspect');
  const directoryUrl=await evaluate('location.href');
  await act('Inspect Canva','press');
  await until(()=>evaluate("document.querySelector('#directory-inspector-heading')?.textContent==='Canva'"),'Agent Inspect did not open the sourced record');
  assert.equal(await nativeCount('inspect'),1,'SDK Button must activate the native Inspect button once');
  const inspectedUrl=new URL(await evaluate('location.href'));
  assert.equal(inspectedUrl.searchParams.get('selected'),'startup:canva','Agent inspection persists the selected company');
  inspectedUrl.searchParams.delete('selected');
  assert.equal(inspectedUrl.href,directoryUrl,'Agent inspection preserves search context');
  await audit('Inspected directory',['Close record inspection']);
  await act('Close record inspection','press');
  assert.equal(await evaluate('document.activeElement.dataset.inspectEntity'),'startup:canva','Agent close restores the originating Inspect button');
  await settleTop();await assertNoOverflow('SDK directory desktop');await screenshot('atlas-sdk-directory-desktop.png');

  await navigate('/treemap.html?view=map&metric=funding&currency=USD',ready("document.querySelector('#treemap-workspace')?.getAttribute('aria-busy')==='false'"));
  await audit('Treemap',['Find a company','Size by','Currency','Group by','Presentation']);
  await act('Find a company','setValue',['Canva']);
  await until(()=>evaluate("new URLSearchParams(location.search).get('q')==='Canva'&&document.querySelectorAll('.treemap-tile').length===1"),'Agent treemap search did not filter companies');
  await choose('Presentation',/^List$/);
  await until(()=>evaluate("new URLSearchParams(location.search).get('view')==='list'&&!document.querySelector('#treemap-list').hidden"),'Agent presentation change did not reveal rankings');
  await assertOneTabStop('.treemap-view-switch');
  await evaluate("document.querySelector('#show-list').focus()");
  await press('ArrowLeft','ArrowLeft',37);
  await until(()=>evaluate("new URLSearchParams(location.search).get('view')==='cards'&&!document.querySelector('#treemap-cards').hidden"),'SDK presentation arrow did not reveal cards');
  assert.equal(await evaluate('document.activeElement.id'),'show-cards');
  await assertOneTabStop('.treemap-view-switch');
  await evaluate("document.querySelector('#treemap-filter-toggle').focus()");
  await press('Enter','Enter',13);
  await until(()=>evaluate("!document.querySelector('#treemap-filter-fields').hidden&&document.querySelector('#treemap-filter-toggle').getAttribute('aria-expanded')==='true'"),'The Filters button did not expand with Enter');
  await choose('Size by',/^Company count$/);
  await until(()=>evaluate("document.querySelector('#treemap-metric').value==='companies'&&new URLSearchParams(location.search).get('metric')==='companies'"),'Agent metric did not update the chart measure');
  await act('Filters','press');
  await until(()=>evaluate("document.querySelector('#treemap-filter-fields').hidden&&document.querySelector('#treemap-metric').value==='companies'"),'Collapsing filters lost the applied measure');
  await act('Filters','press');
  await act('Reset exploration','press');
  await until(()=>evaluate("document.querySelector('#treemap-metric').value==='companies'&&document.querySelector('#treemap-query').value===''&&!document.querySelector('#treemap-chart').hidden&&document.querySelector('#treemap-cards').hidden"),'SDK reset did not restore the company-count map');
  await assertOneTabStop('.treemap-view-switch');
  await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  const metricTrigger='ui-select[data-native-id="treemap-metric"] .atlas-select-trigger';
  await click(metricTrigger);
  await until(()=>evaluate(`document.querySelector(${JSON.stringify(metricTrigger)}).getAttribute('aria-expanded')==='true'`),'Mobile metric Select did not open');
  await assertPopupFits('treemap-metric');
  await assertNoOverflow('SDK mobile Select');await screenshot('atlas-sdk-select-mobile.png');
  await press('Escape','Escape',27);
  await until(()=>evaluate(`document.activeElement===document.querySelector(${JSON.stringify(metricTrigger)})&&document.querySelector(${JSON.stringify(metricTrigger)}).getAttribute('aria-expanded')==='false'`),'Mobile Select dismissal did not restore trigger focus');

  await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1050,deviceScaleFactor:1,mobile:false});
  await navigate('/graph.html?entity=startup%3Acanva',ready("document.querySelector('.network-node.is-root')?.dataset.node==='startup:canva'"));
  await audit('Knowledge graph',['Search the knowledge graph','Connection depth','Connections list']);
  await act('Search the knowledge graph','setValue',['Airwallex']);
  await until(()=>evaluate("!document.querySelector('#graph-results').hidden&&!!document.querySelector('#graph-results [data-explore=\"startup:airwallex\"]')"),'Agent graph query did not produce real search results');
  await choose('Connection depth',/^2 hops$/);
  await until(()=>evaluate("document.querySelector('#graph-depth').value==='2'&&new URLSearchParams(location.search).get('depth')==='2'"),'Agent connection depth did not update the graph');
  await traceNative('#graph-list-toggle','click','connections');
  await act('Connections list','press');
  await until(()=>evaluate("!document.querySelector('#graph-list').hidden&&new URLSearchParams(location.search).get('list')==='1'"),'Agent Connections list did not reveal the matching evidence list');
  assert.equal(await nativeCount('connections'),1,'The SDK action must toggle connections once');
  await act('Hide connections','press');
  assert.equal(await evaluate("document.querySelector('#graph-list').hidden"),true,'A repeated SDK action must restore the hidden list');
  await audit('Updated knowledge graph');

  await navigate('/partner.html?name=Airtree',ready("document.querySelector('#profile')?.getAttribute('aria-busy')==='false'&&!!document.querySelector('#partner-company-detail')"));
  const companyIndex=partners.Airtree.companies.length-1;
  const company=partners.Airtree.companies[companyIndex];
  await audit('Partner explorer',[`Inspect ${company.name}`]);
  await traceNative(`[data-company-index="${companyIndex}"]`,'click','company');
  const partnerUrl=await evaluate('location.href');
  await act(`Inspect ${company.name}`,'press');
  await until(()=>evaluate(`document.querySelector('#partner-company-title')?.textContent===${JSON.stringify(company.name)}`),'Agent company inspection did not update the partner dossier');
  assert.equal(await nativeCount('company'),1,'One SDK company action must invoke native inspection once');
  assert.equal(await evaluate('location.href'),partnerUrl,'Agent portfolio inspection keeps the partner context');
  assert.equal(await evaluate("document.querySelectorAll('[data-company-index][aria-pressed=true]').length"),1,'Partner inspection retains one selected company');
  assert.equal(await evaluate("document.querySelector('#partner-company-detail .profile-detail-source a').href"),company.source,'Agent inspection retains the company relationship source');
  await audit('Updated partner explorer');
  await navigate('/entity.html?id=startup%3Acanva',ready("document.querySelector('#entity-profile')?.getAttribute('aria-busy')==='false'&&document.querySelector('h1')?.textContent==='Canva'"));
  await audit('Startup explorer',['Explore graph']);
  await assertNoOverflow('SDK startup explorer');
  const profileAction=await component('Explore graph','press');
  await evaluate(`void window.atlasUIAgent.act(${JSON.stringify({steps:[{ref:profileAction.ref,action:'press'}]})})`);
  await until(()=>evaluate(ready("location.pathname.endsWith('/graph.html')&&document.querySelector('.network-node.is-root')?.dataset.node==='startup:canva'")),'The SDK profile action did not navigate to the same startup in the graph');
  console.log('UI SDK acceptance passed: named live controls, discoverable choices, agent query/selection/inspection, exactly-once native dispatch, keyboard Select dismissal and focus, single-tab-stop scopes, treemap presentations, graph controls, sourced partner inspection and mobile popup bounds.');
}
