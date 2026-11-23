import assert from 'node:assert/strict';
import {checkDirectoryPagination} from './directory-pagination-browser-checks.mjs';
import {companyPlaceLabel, indexCompanies} from '../web/atlas-exploration.js';

/** Exercise the new inspection journeys against the same published snapshot. */
export async function checkDirectoryWireframes({command,evaluate,navigate,until,click,press,screenshot,assertNoOverflow,graph}) {
  await checkDirectoryPagination({command,evaluate,navigate,until,click,press,screenshot,assertNoOverflow,graph});
  const directoryReady="document.querySelector('#results-list')?.getAttribute('aria-busy')==='false'";
  const inspect='[data-inspect-entity="startup:canva"]';
  const ready=`${directoryReady}&&!!document.querySelector(${JSON.stringify(inspect)})`;
  const type=async(selector,value)=>{await click(selector);await press('a','KeyA',65,2);await command('Input.insertText',{text:value});};
  const settleTop=()=>evaluate("(async()=>{scrollTo({top:0,behavior:'instant'});await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);})()");
  async function checkGlobeLegibility() {
    const {width,labels,sweep}=await evaluate(`(()=>{
      const selectors=['#globe-count','#globe-hint','.globe-list-heading span:first-child','.globe-list-heading span:last-child'];
      const labels=selectors.map(selector=>{
        const label=document.querySelector(selector);
        return {selector,size:parseFloat(getComputedStyle(label).fontSize),visible:label.checkVisibility()};
      });
      const backdrop=getComputedStyle(document.getElementById('atlas'),'::after');
      return {width:innerWidth,labels,sweep:backdrop.animationName!=='none'&&backdrop.animationIterationCount.split(',').includes('infinite')};
    })()`);
    for(const label of labels) assert.ok(label.visible&&label.size>=12,`${width}px ${label.selector} should be visible at 12px or larger`);
    assert.equal(sweep,false,`${width}px Places section should have no repeating background sweep`);
  }
  await command('Emulation.setDeviceMetricsOverride',{width:1586,height:992,deviceScaleFactor:1,mobile:false});
  await navigate('/#directory',ready);
  await checkGlobeLegibility();
  assert.equal(await evaluate("document.querySelector('#entity-kind').value"),'startup','The desktop landing should open the company directory');
  assert.equal(await evaluate("location.pathname"),'/list.html','A legacy directory URL should open List');
  assert.ok(await evaluate("!document.querySelector('.directory-evidence-legend')"), 'Coverage counts belong in the backend');
  assert.equal(await evaluate("(()=>{const detail={};document.dispatchEvent(new CustomEvent('atlas:export-records',{detail}));return detail.records.length;})()"),graph.entities.filter(entity=>entity.kind==='startup').length,'Export includes every matching company before pagination');
  await navigate('/?shown=24#directory',ready);
  assert.equal(await evaluate("document.querySelector('#entity-kind').value"),'all','Older directory bookmarks retain the mixed catalogue');
  assert.equal(await evaluate("document.querySelectorAll('#results-list [data-entity-id]').length"),24,'An older bookmark restores its page depth');
  await navigate('/?type=all&q=Canva#directory',ready);
  assert.equal(await evaluate("document.querySelector('#entity-kind').value"),'all','An explicit All types search must stay across the catalogue');
  await navigate('/?type=startup#directory',ready);
  assert.ok(await evaluate("document.querySelector('#directory').getBoundingClientRect().top<document.querySelector('#atlas').getBoundingClientRect().top"),'The directory should lead the page before the places explorer');
  assert.equal(await evaluate("document.querySelectorAll('header.atlas-masthead').length"),1);
  const original=await evaluate('location.pathname+location.search+location.hash');
  const compare='#results-list [data-atlas-compare="startup:canva"]';
  await click(compare);
  assert.equal(await evaluate('location.pathname+location.search+location.hash'),original,'Comparison membership must be independent of inspection');
  await click(inspect);
  assert.equal(await evaluate("document.querySelector('#directory-inspector-heading')?.textContent"),'Canva');
  assert.equal(await evaluate("new URLSearchParams(location.search).get('selected')"),'startup:canva');
  assert.equal(await evaluate("(()=>{const url=new URL(location.href);url.searchParams.delete('selected');return url.pathname+url.search+url.hash;})()"),original,'Inspection must preserve the existing route parameters');
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(inspect)}).getAttribute('aria-pressed')`),'true');
  await click('.directory-inspector-tabs ui-tabs-tab[value="people"] button');
  const founders=graph.edges.filter(edge=>edge.kind==='founded'&&edge.to==='startup:canva'&&/^https?:\/\//.test(edge.source||''));
  assert.equal(await evaluate("document.querySelectorAll('#directory-inspector .directory-inspector-people li').length"),founders.length);
  for(const edge of founders) {
    const person=graph.entities.find(entity=>entity.id===edge.from);
    assert.ok(await evaluate(`document.querySelector('#directory-inspector').textContent.includes(${JSON.stringify(person.name)})`),'Inspector must retain the sourced founder name');
  }
  assert.ok(await evaluate("Array.from(document.querySelectorAll('#directory-inspector .directory-inspector-people li')).every(li=>li.querySelector('a[href^=\"https://\"]'))"),'Founder connections must expose their evidence');
  assert.match(await evaluate("document.querySelector('#directory-inspector .atlas-button-accent').getAttribute('href')"),/startup%3Acanva/);
  await settleTop();await assertNoOverflow('Wireframe directory desktop');await screenshot('wireframe-directory-desktop.png');
  await click('#close-directory-inspector');
  assert.equal(await evaluate('document.activeElement.dataset.inspectEntity'),'startup:canva','Closing inspection must return focus to its originating row');
  assert.equal(await evaluate("!!document.querySelector('#directory-inspector-heading')"),false);
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(compare)}).getAttribute('aria-pressed')`),'true','Closing an inspector must preserve comparison membership');
  await click(compare);

  await click(inspect);await type('#search','no atlas record matches this query');
  await until(()=>evaluate("document.querySelectorAll('#results-list .entity-row').length===0"),'Directory did not reach no-results');
  assert.equal(await evaluate("document.querySelector('#directory-inspector-heading')?.textContent"),'Canva','An excluded record stays in the inspector');
  assert.equal(await evaluate("document.querySelector('#directory-inspector-outside').hidden"),false,'Excluded inspection must explain its state');
  assert.equal(await evaluate('document.activeElement.id'),'search');
  await evaluate('history.back()');
  await until(()=>evaluate(`${ready}&&new URLSearchParams(location.search).get('selected')==='startup:canva'&&!new URLSearchParams(location.search).has('q')`),'Back must restore search and inspection together');
  await evaluate('history.forward()');
  await until(()=>evaluate("!document.querySelector('#directory-inspector-outside')?.hidden&&new URLSearchParams(location.search).get('selected')==='startup:canva'&&new URLSearchParams(location.search).has('q')"),'Forward must restore the excluded selection');
  await click('#clear-search');
  await until(()=>evaluate(ready),'Clearing search did not recover the directory');
  assert.equal(await evaluate("document.querySelector('#directory-inspector-outside').hidden"),true);
  await click('#tab-opportunities');
  assert.equal(await evaluate("document.querySelector('#directory-inspector').hidden"),true,'Opportunity scope must not retain an unrelated entity inspector');
  await click('ui-select[data-facet="country"] .facet-trigger');
  assert.equal(await evaluate("document.querySelector('ui-select[data-facet=country]').open"),true);
  await press('Escape','Escape',27);
  assert.equal(await evaluate("document.querySelector('ui-select[data-facet=country]').open"),false);
  assert.equal(await evaluate("document.activeElement.closest('ui-select')?.dataset.facet"),'country','Escape should return SDK filter focus');
  await click('#tab-all');
  assert.equal(await evaluate("document.querySelector('#directory-inspector-heading')?.textContent"),'Canva','The All tab must restore its selected record');
  await click('#close-directory-inspector');

  await until(()=>evaluate(ready),'Returning to the startup scope did not restore results');
  await click(inspect);
  const aligned=await evaluate("(()=>{const list=document.querySelector('.results').getBoundingClientRect(), rail=document.querySelector('#directory-inspector').getBoundingClientRect();return Math.abs(list.top-rail.top)<2&&rail.width/(list.width+rail.width)>.27&&rail.width/(list.width+rail.width)<.32;})()");
  assert.ok(aligned,'The table and inspector should share a top edge and a roughly 70/30 split');
  await click('.directory-inspector-tabs ui-tabs-tab[value="sources"] button');
  assert.ok(await evaluate("!!document.querySelector('#directory-inspector .directory-claim-source a[href]')"),'Individual claims retain their citations');
  await click('#close-directory-inspector');
  await click('[data-directory-sort="technology"]');
  await click('[data-directory-sort="name"]');
  await click('[data-directory-sort="name"]');
  assert.equal(await evaluate("new URLSearchParams(location.search).get('sort')"),'name-desc');
  const companyNames=await evaluate("[...document.querySelectorAll('.directory-company-row h3')].map(name=>name.textContent)");
  assert.deepEqual(companyNames,[...companyNames].sort((a,b)=>b.localeCompare(a,'en',{numeric:true,sensitivity:'base'})));
  const comfortableHeight=await evaluate("document.querySelector('.directory-company-row').getBoundingClientRect().height");
  await click('#directory-density-view [data-density-value=compact]');
  assert.equal(await evaluate("new URLSearchParams(location.search).get('density')"),'compact');
  assert.ok(await evaluate("document.querySelector('.directory-company-row').getBoundingClientRect().height")<comfortableHeight);
  await click('.directory-columns-trigger');await click('#column-source-check-control');
  assert.ok(await evaluate("!!document.querySelector('.directory-company-row td[data-column=source-check]')"));
  assert.match(await evaluate("new URLSearchParams(location.search).get('columns')"),/source-check/);
  await press('Escape','Escape',27);
  assert.ok(await evaluate("document.activeElement.matches('.directory-columns-trigger')"));

  await click('.exploration-country-trigger');
  await click('#atlas-hq-AU-control');
  assert.equal(await evaluate("new URLSearchParams(location.search).has('hq')"),false,'A country draft must not commit filters');
  await click('.exploration-apply');
  assert.deepEqual(await evaluate("new URLSearchParams(location.search).getAll('hq')"),['AU']);
  assert.equal(await evaluate("document.querySelectorAll('[data-remove-facet=country]').length"),1,'Native and enhanced inputs must add the same country once');
  const locations=indexCompanies(graph);
  const filteredRows=await evaluate("[...document.querySelectorAll('.directory-company-row')].map(row=>[row.dataset.entityId,row.querySelector('td[data-column=headquarters]').lastElementChild.textContent])");
  assert.ok(filteredRows.length>0);
  for (const [id,value] of filteredRows) {
    assert.equal(locations.get(id)?.country,'AU');
    assert.equal(value,companyPlaceLabel(locations.get(id)));
  }

  await command('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await command('Emulation.setDeviceMetricsOverride',{width:320,height:800,deviceScaleFactor:1,mobile:true});
  await navigate('/?type=startup&q=Canva&coverage=1#directory',ready);
  assert.equal(await evaluate("new URLSearchParams(location.search).has('coverage')"),false);
  assert.ok(await evaluate("document.querySelector('[data-entity-id=\"startup:canva\"] td[data-column=technology]').checkVisibility()"),'Mobile List must show selected metadata');
  await assertNoOverflow('320px company list');
  await click('#search');
  assert.equal(await evaluate("document.querySelector('label[for=search]').textContent.trim()"),'Search the directory');
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.directory-search-label')).transitionProperty"),'none');
  await evaluate("document.querySelector('#search').blur()");
  await settleTop();
  await screenshot('editorial-list-mobile.png');
  await command('Emulation.setEmulatedMedia',{features:[]});
  await checkGlobeLegibility();

  await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await navigate('/#directory',ready);
  await checkGlobeLegibility();
  assert.equal(await evaluate("document.querySelector('#directory-heading').textContent"),'Companies');
  await click('#directory-options-trigger');
  assert.ok(await evaluate("document.querySelector('#directory-options-panel-body #directory-scope').checkVisibility()"),'Catalogue scopes remain available in mobile Options');
  await press('Escape','Escape',27);
  await click('.directory-columns-trigger');
  await click('#column-founders-control');
  await press('Escape','Escape',27);
  assert.ok(await evaluate("document.querySelector('[data-entity-id=\"startup:canva\"] td[data-column=founders]').checkVisibility()"),'Choosing a mobile column must reveal its metadata');
  await settleTop();await screenshot('wireframe-directory-mobile.png');
  await navigate('/?type=startup&q=Canva#directory',ready);
  await click(inspect);
  assert.equal(await evaluate('document.activeElement.id'),'directory-inspector-heading','Narrow inspection should bring the detail heading into keyboard context');
  assert.ok(await evaluate("(()=>{const box=document.querySelector('#directory-inspector-heading').getBoundingClientRect();return box.top>=0&&box.bottom<=innerHeight;})()"),'Narrow inspection must reveal the focused heading immediately, without an unfinished smooth scroll');
  assert.ok(await evaluate("document.querySelector('#directory-inspector-graph').checkVisibility()"),'The compact row keeps its graph action within the inspector sheet');
  await assertNoOverflow('Wireframe directory inspector mobile');await screenshot('wireframe-directory-inspector-mobile.png');
  await click('#close-directory-inspector');
  assert.equal(await evaluate('document.activeElement.dataset.inspectEntity'),'startup:canva','Narrow close must return to the selected row');
  assert.ok(await evaluate("(()=>{const box=document.activeElement.getBoundingClientRect();return box.top>=0&&box.bottom<=innerHeight;})()"),'Narrow close must reveal its originating Inspect button');
  assert.ok(await evaluate(`(()=>{const button=document.querySelector(${JSON.stringify(inspect)});return button.getBoundingClientRect().width>=44&&!button.closest('.entity-row').querySelector('.entity-row-graph').checkVisibility();})()`),'Narrow rows should keep a single 44px inspect target');
  await settleTop();
  await evaluate('history.back()');
  await until(()=>evaluate("document.querySelector('#directory-inspector-sheet').open&&document.activeElement.id==='directory-inspector-heading'"),'Back should reopen the narrow inspector in context');
  await evaluate('history.forward()');
  await until(()=>evaluate("!document.querySelector('#directory-inspector-sheet').open&&!new URLSearchParams(location.search).has('selected')"),'Forward should restore the closed inspector');

  await navigate('/?type=startup&hq=unknown&selected=startup%3Acanva#directory',directoryReady);
  await until(()=>evaluate("document.querySelector('#directory-inspector-sheet').open&&!document.querySelector('#directory-inspector-outside')?.hidden"),'Opening a shared selection outside the scope should show its mobile inspector');
  await click('#directory-adjust-filters');
  await until(()=>evaluate("!document.querySelector('#directory-inspector-sheet').open&&document.querySelector('.exploration-country ui-popover').open"),'Adjust filters must give the mobile filter back its focus');
  await press('Escape','Escape',27);
  await click('#directory-inspector-reopen');
  assert.equal(await evaluate("new URLSearchParams(location.search).get('selected')"),'startup:canva');
  await press('Escape','Escape',27);
  await until(()=>evaluate("!new URLSearchParams(location.search).has('selected')"),'Dismissing the mobile inspector must clear the shareable selection');

  await command('Emulation.setDeviceMetricsOverride',{width:961,height:700,deviceScaleFactor:1,mobile:false});
  await navigate('/list.html?type=startup#directory',ready);
  assert.ok(await evaluate(`(() => {
    const table=document.querySelector('.directory-table-frame');
    const name=table.querySelector('.directory-company-row h3');
    return table.clientWidth>=850 && table.scrollWidth<=table.clientWidth+1
      && name.getBoundingClientRect().height<=2*parseFloat(getComputedStyle(name).lineHeight)+1;
  })()`),'The List must keep readable names and fit beside the inspector breakpoint');
  await command('Emulation.setDeviceMetricsOverride',{width:568,height:320,deviceScaleFactor:1,mobile:true});
  await navigate('/?type=startup&q=Canva&selected=startup%3Acanva#directory',ready);
  await until(()=>evaluate("document.querySelector('#directory-inspector-sheet').open&&document.activeElement.id==='directory-inspector-heading'"),'Landscape inspection must focus the loaded record');
  await evaluate('document.fonts.ready.then(()=>true)');
  await click('.directory-inspector-tabs ui-tabs-tab[value="sources"] button');
  const sourceLink='#directory-inspector .directory-claim-source a';
  await evaluate(`document.querySelector(${JSON.stringify(sourceLink)}).focus()`);
  await until(()=>evaluate(`(() => {
    const sheet=document.querySelector('#directory-sheet-content');
    const body=document.querySelector('.directory-inspector-scroll');
    const link=document.activeElement;
    const frame=sheet.getBoundingClientRect(), bounds=link.getBoundingClientRect();
    return link.matches(${JSON.stringify(sourceLink)}) && bounds.top>=frame.top && bounds.bottom<=frame.bottom+1
      && sheet.scrollHeight>sheet.clientHeight && sheet.scrollWidth<=sheet.clientWidth+1
      && getComputedStyle(body).overflowY==='visible';
  })()`),'A source must be visible and focusable using the single scroll area in a short sheet');
  await press('Escape','Escape',27);
  await until(()=>evaluate("document.activeElement?.dataset.inspectEntity==='startup:canva'"),'Closing the short sheet must restore focus to the result');

  await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1050,deviceScaleFactor:1,mobile:false});
  await navigate('/treemap.html?metric=funding&currency=USD',"document.querySelector('#treemap-workspace')?.getAttribute('aria-busy')==='false'&&!!document.querySelector('[data-company=\"startup:canva\"]')");
  await click('#treemap-chart [data-company="startup:canva"]');
  assert.equal(await evaluate("document.querySelector('#treemap-figure-tab').getAttribute('aria-selected')"),'true');
  assert.equal(await evaluate("document.querySelector('#treemap-figure-panel').hidden"),false);
  assert.ok(await evaluate("!!document.querySelector('#treemap-figure-panel a[href^=\"https://\"]')"),'The plotted figure needs its source in the figure panel');
  await click('#treemap-company-tab');
  assert.equal(await evaluate("document.querySelector('#treemap-company-panel').hidden"),false);
  assert.equal(await evaluate("document.querySelector('#treemap-figure-panel').hidden"),true);
  assert.ok(await evaluate("document.querySelector('#treemap-company-panel').textContent.includes('Founders')"));
  assert.match(await evaluate("document.querySelector('.treemap-profile').getAttribute('href')"),/startup%3Acanva/);
  await press('ArrowLeft','ArrowLeft',37);
  assert.equal(await evaluate('document.activeElement.id'),'treemap-figure-tab');
  assert.equal(await evaluate("document.querySelector('#treemap-figure-tab').getAttribute('aria-selected')"),'true');
  await press('End','End',35);
  assert.equal(await evaluate('document.activeElement.id'),'treemap-company-tab');
  await press('Home','Home',36);
  assert.equal(await evaluate('document.activeElement.id'),'treemap-figure-tab');
  await settleTop();await assertNoOverflow('Wireframe treemap desktop');await screenshot('wireframe-treemap-desktop.png');

  await evaluate("(()=>{const q=document.querySelector('#treemap-query');q.focus();q.value='Canva';q.dispatchEvent(new InputEvent('input',{bubbles:true,isComposing:true}));})()");
  assert.equal(await evaluate("new URLSearchParams(location.search).has('q')"),false,'Treemap must not commit partial composition text');
  await evaluate("document.querySelector('#treemap-query').dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'Canva'}))");
  assert.equal(await evaluate("new URLSearchParams(location.search).get('q')"),'Canva');
  await click('[data-atlas-clear-for="treemap-query"]');
  assert.equal(await evaluate('document.activeElement.id'),'treemap-query');
  await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await until(()=>evaluate("document.querySelector('#treemap-inspector-sheet').open&&document.querySelector('#treemap-sheet-content #treemap-detail h2')?.textContent==='Canva'"),'The selected company must move from the desktop rail into the mobile sheet');
  await settleTop();await assertNoOverflow('Wireframe treemap mobile');await screenshot('wireframe-treemap-mobile.png');
  await click('#treemap-company-tab');
  await assertNoOverflow('Wireframe treemap company context mobile');await screenshot('wireframe-treemap-company-mobile.png');
  await press('Escape','Escape',27);
  await until(()=>evaluate("!document.querySelector('#treemap-inspector-sheet').open && !new URLSearchParams(location.search).has('selected')"),'Closing the mobile sheet must clear its selected company');
  await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1050,deviceScaleFactor:1,mobile:false});
  console.log('Wireframe directory and treemap checks passed: explicit sourced inspection, close/focus, filter/scope recovery, authored facet Escape, Figure/Company keyboard tabs, composition-safe search and desktop/mobile layouts.');
}
