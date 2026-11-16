import assert from 'node:assert/strict';

/** Exercise the new inspection journeys against the same published snapshot. */
export async function checkDirectoryWireframes({command,evaluate,navigate,until,click,press,screenshot,assertNoOverflow,graph}) {
  const ready="document.querySelector('#results-list')?.getAttribute('aria-busy')==='false'&&!!document.querySelector('[data-inspect-entity=\"startup:canva\"]')";
  const inspect='[data-inspect-entity="startup:canva"]';
  const type=async(selector,value)=>{await click(selector);await press('a','KeyA',65,2);await command('Input.insertText',{text:value});};
  const settleTop=()=>evaluate("(async()=>{scrollTo({top:0,behavior:'instant'});await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);})()");
  await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1050,deviceScaleFactor:1,mobile:false});
  await navigate('/?type=startup#directory',ready);
  assert.ok(await evaluate("document.querySelector('#directory').getBoundingClientRect().top<document.querySelector('#atlas').getBoundingClientRect().top"),'The directory should lead the page before the places explorer');
  assert.equal(await evaluate("document.querySelectorAll('header.atlas-masthead').length"),1);
  const original=await evaluate('location.pathname+location.search+location.hash');
  await click(inspect);
  assert.equal(await evaluate("document.querySelector('#directory-inspector-heading')?.textContent"),'Canva');
  assert.equal(await evaluate('location.pathname+location.search+location.hash'),original,'Inspecting a result must preserve the current search route');
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(inspect)}).getAttribute('aria-pressed')`),'true');
  const founders=graph.edges.filter(edge=>edge.kind==='founded'&&edge.to==='startup:canva'&&/^https?:\/\//.test(edge.source||'')).slice(0,3);
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

  await click(inspect);await type('#search','no atlas record matches this query');
  await until(()=>evaluate("document.querySelectorAll('#results-list .entity-row').length===0"),'Directory did not reach no-results');
  assert.equal(await evaluate("!!document.querySelector('#directory-inspector-heading')"),false,'Filtering away the inspected record clears the inspector');
  assert.equal(await evaluate('document.activeElement.id'),'search');
  await click('#clear-search');
  await until(()=>evaluate(ready),'Clearing search did not recover the directory');
  await click(inspect);await click('#tab-opportunities');
  assert.equal(await evaluate("document.querySelector('#directory-inspector').hidden"),true,'Opportunity scope must not retain an unrelated entity inspector');
  await click('details[data-facet="country"] summary');
  assert.equal(await evaluate("document.querySelector('details[data-facet=country]').open"),true);
  await press('Escape','Escape',27);
  assert.equal(await evaluate("document.querySelector('details[data-facet=country]').open"),false);
  assert.equal(await evaluate("document.activeElement.closest('details')?.dataset.facet"),'country','Escape should return authored filter focus');
  await click('#tab-all');
  assert.equal(await evaluate("!!document.querySelector('#directory-inspector-heading')"),false,'Scope restoration must not silently reselect an old entity');

  await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await navigate('/?type=startup&q=Canva#directory',ready);
  await click(inspect);
  assert.equal(await evaluate('document.activeElement.id'),'directory-inspector-heading','Narrow inspection should bring the detail heading into keyboard context');
  assert.ok(await evaluate("(()=>{const box=document.querySelector('#directory-inspector-heading').getBoundingClientRect();return box.top>=0&&box.bottom<=innerHeight;})()"),'Narrow inspection must reveal the focused heading immediately, without an unfinished smooth scroll');
  await assertNoOverflow('Wireframe directory inspector mobile');await screenshot('wireframe-directory-inspector-mobile.png');
  await click('#close-directory-inspector');
  assert.equal(await evaluate('document.activeElement.dataset.inspectEntity'),'startup:canva','Narrow close must return to the selected row');
  assert.ok(await evaluate("(()=>{const box=document.activeElement.getBoundingClientRect();return box.top>=0&&box.bottom<=innerHeight;})()"),'Narrow close must reveal its originating Inspect button');
  assert.ok(await evaluate(`(()=>{const button=document.querySelector(${JSON.stringify(inspect)});const action=button.getBoundingClientRect();const link=button.closest('.entity-row').querySelector('.entity-row-graph').getBoundingClientRect();return link.left>=action.right&&Math.abs(link.top-action.top)<8;})()`),'Narrow Inspect and Graph actions should share a horizontal row');
  await settleTop();await screenshot('wireframe-directory-mobile.png');

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
  await click('#treemap-chart [data-company="startup:canva"]');
  await settleTop();await assertNoOverflow('Wireframe treemap mobile');await screenshot('wireframe-treemap-mobile.png');
  await click('#treemap-company-tab');
  await assertNoOverflow('Wireframe treemap company context mobile');await screenshot('wireframe-treemap-company-mobile.png');
  await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1050,deviceScaleFactor:1,mobile:false});
  console.log('Wireframe directory and treemap checks passed: explicit sourced inspection, close/focus, filter/scope recovery, authored facet Escape, Figure/Company keyboard tabs, composition-safe search and desktop/mobile layouts.');
}
