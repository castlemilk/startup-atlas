// User-level checks for Signal's local component workbench.
// Runs in the existing microsite Chrome session; no separate framework or server.
import assert from 'node:assert/strict';

export async function checkSignalControls({command,evaluate,navigate,until,click,press,screenshot,assertNoOverflow}) {
  const ids=['startup:canva','startup:airwallex','startup:bugcrowd'];
  const ready="document.body.dataset.ready==='true'&&document.querySelector('#signal-controls-workbench')?.dataset.controlsReady==='true'";
  const specimen="document.querySelector('#signal-controls-workbench .signal-tactile')";
  const records="[...document.querySelectorAll('#signal-control-records [data-control-record]')].filter(button=>button.getClientRects().length).map(button=>button.dataset.controlRecord)";
  const settings=()=>evaluate(`({material:${specimen}.dataset.material,edges:${specimen}.dataset.edges,density:${specimen}.dataset.density})`);
  const paint=()=>evaluate("(()=>{const style=getComputedStyle(document.querySelector('#signal-control-save'));return {shadow:style.boxShadow,background:style.backgroundImage,radius:parseFloat(style.borderRadius)};})()");
  async function expectRecords(expected,message) {
    await until(async()=>JSON.stringify((await evaluate(records)).sort())===JSON.stringify([...expected].sort()),message);
  }
  async function reloadDocument() {
    const previousOrigin=await evaluate('performance.timeOrigin');
    await command('Page.reload',{ignoreCache:true});
    await until(()=>evaluate(`performance.timeOrigin!==${previousOrigin}&&(${ready})`),'The workbench reload commits a new ready document');
  }
  async function fill(selector,value) {
    await click(selector);
    await press('a','KeyA',65,2);
    if(value)await command('Input.insertText',{text:value});else await press('Backspace','Backspace',8);
  }
  async function selectWithKeyboard(id) {
    await evaluate(`document.querySelector('#signal-control-records [data-control-record="${id}"]').focus()`);
    await press('Enter','Enter',13);
    await until(()=>evaluate(`document.querySelector('#signal-control-inspector').dataset.selected===${JSON.stringify(id)}`),'Keyboard inspection selects the requested record');
    assert.equal(await evaluate('document.activeElement.dataset.controlRecord'),id,'Inspecting a record preserves the stable row control focus');
    assert.ok(await evaluate("getComputedStyle(document.activeElement).outlineStyle!=='none'"),'Keyboard inspection has a visible focus indicator');
    const profile=await evaluate("new URL(document.querySelector('#signal-control-profile').href).pathname+'?'+new URL(document.querySelector('#signal-control-profile').href).searchParams.toString()");
    assert.equal(profile,'/entity.html?id='+encodeURIComponent(id),'The inspector exposes the real Atlas profile for its selected record');
  }
  async function capture(name,selector='#controls') {
    await evaluate(`(async()=>{document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'start',behavior:'instant'});await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);})()`);
    await screenshot(name);
  }
  async function assertExistingScope(theme) {
    const scope=await evaluate("(()=>{const params=new URLSearchParams(location.search);return {feature:params.get('feature'),theme:params.get('theme'),placement:params.get('placement'),material:params.get('material'),edges:params.get('edges'),hash:location.hash};})()");
    assert.deepEqual(scope,{feature:'search',theme,placement:'header',material:'tactile',edges:'soft',hash:'#controls'},'Component choices preserve the surrounding aesthetic exploration scope');
  }

  await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1050,deviceScaleFactor:1,mobile:false});
  await navigate('/design-aesthetic.html?feature=search&theme=light&placement=header&material=flat&edges=precise#controls',ready);
  await evaluate('document.fonts.ready.then(()=>true)');
  assert.deepEqual(await settings(),{material:'flat',edges:'precise',density:'comfortable'},'Shared links restore the comparison choices');
  await expectRecords(ids,'The workbench begins with three named Atlas records');
  assert.equal(await evaluate("document.querySelector('#signal-control-inspector').dataset.selected"),'startup:canva');
  const flat=await paint();
  await click('#signal-material-tactile');
  await click('#signal-edges-soft');
  await until(async()=>{const next=await paint();return next.radius>flat.radius&&(next.shadow!==flat.shadow||next.background!==flat.background);},'Material and edge controls change the rendered component treatment');
  await assertExistingScope('light');
  await reloadDocument();
  assert.deepEqual(await settings(),{material:'tactile',edges:'soft',density:'comfortable'});
  await assertExistingScope('light');

  await fill('#signal-control-search','airw');
  await expectRecords(['startup:airwallex'],'Search filters the specimen records');
  await selectWithKeyboard('startup:airwallex');
  await click('#signal-control-save');
  assert.equal(await evaluate("document.querySelector('#signal-control-save').getAttribute('aria-pressed')"),'true');
  assert.equal(await evaluate('document.activeElement.id'),'signal-control-save','Saving keeps focus on its stable action');
  await fill('#signal-control-search','');
  await click('#signal-filter-saved');
  await expectRecords(['startup:airwallex'],'Saved filters to the actual in-memory selection');
  await click('#signal-control-save');
  await expectRecords([],'Removing the last saved record produces an actionable empty state');
  assert.equal(await evaluate('document.activeElement.id'),'signal-control-empty-action','Removing the focused saved record moves focus to its recovery action');
  assert.ok(await evaluate("document.querySelector('#signal-control-save').disabled"));
  await press('Enter','Enter',13);
  await expectRecords(ids,'The empty saved view can return to all records');
  assert.equal(await evaluate('document.activeElement.id'),'signal-filter-all');

  await fill('#signal-control-search','atlas-no-record-zzzz');
  await expectRecords([],'An unmatched query produces zero visible records');
  await click('#signal-control-empty-action');
  await expectRecords(ids,'Clear-search recovery restores the records');
  assert.equal(await evaluate('document.activeElement.id'),'signal-control-search');
  const comfortableHeight=await evaluate("document.querySelector('#signal-control-records [data-control-record]').getBoundingClientRect().height");
  await click('#signal-density-compact');
  await until(()=>evaluate(`document.querySelector('#signal-control-records [data-control-record]').getBoundingClientRect().height<${comfortableHeight}`),'Compact density reduces the actual record-row height');
  assert.equal((await settings()).density,'compact');
  await click('#signal-control-reset');
  assert.equal(await evaluate('document.activeElement.id'),'signal-control-reset','Reset preserves keyboard focus');
  assert.deepEqual(await settings(),{material:'tactile',edges:'soft',density:'comfortable'},'Reset restores local defaults while retaining comparison settings');
  await expectRecords(ids,'Reset returns to the complete specimen list');
  assert.equal(await evaluate("document.querySelector('#signal-control-inspector').dataset.selected"),'');
  assert.ok(await evaluate("document.querySelector('#signal-control-save').disabled"));
  await selectWithKeyboard('startup:canva');
  await assertNoOverflow('Desktop tactile controls in light appearance');
  await capture('atlas-signal-controls-light-desktop.png');

  await click('#signal-controls-theme-dark');
  assert.equal(await evaluate('document.body.dataset.theme'),'dark');
  assert.equal(await evaluate("document.querySelector('#signal-theme-dark').getAttribute('aria-pressed')"),'true','Both appearance-control groups stay synchronized');
  await click('#signal-material-flat');
  await until(()=>evaluate("getComputedStyle(document.querySelector('#signal-control-save')).boxShadow==='none'&&getComputedStyle(document.querySelector('.signal-control-workstation')).boxShadow==='none'"),'Flat material removes action and panel elevation in dark appearance');
  await click('#signal-material-tactile');
  await until(async()=>(await paint()).shadow!=='none','Tactile material restores the raised action in dark appearance');
  await assertExistingScope('dark');
  await assertNoOverflow('Desktop tactile controls in dark appearance');
  await capture('atlas-signal-controls-dark-desktop.png');

  await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});
  await assertNoOverflow('390px tactile controls in dark appearance');
  await click('#signal-controls-theme-light');
  await fill('#signal-control-search','bugcrowd');
  await expectRecords(['startup:bugcrowd'],'Search remains usable in the narrow workbench');
  await selectWithKeyboard('startup:bugcrowd');
  await click('#signal-control-save');
  await click('#signal-filter-saved');
  await expectRecords(['startup:bugcrowd'],'Narrow saved view retains the actual selection');
  await assertNoOverflow('390px tactile controls in light appearance');
  await capture('atlas-signal-controls-mobile.png');
  await capture('atlas-signal-controls-list-mobile.png','#signal-control-records');
  await reloadDocument();
  await click('#signal-filter-saved');
  await expectRecords([],'Specimen saves remain in memory and do not survive reload');
  await click('#signal-control-empty-action');
  await selectWithKeyboard('startup:canva');
  await command('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await click('#signal-control-save');
  assert.equal(await evaluate("document.querySelector('#signal-control-save').getAttribute('aria-pressed')"),'true','Reduced motion retains actual control behavior');
  assert.ok(await evaluate("getComputedStyle(document.querySelector('#signal-control-save')).transitionDuration.split(',').every(value=>parseFloat(value)===0)"),'Reduced motion removes control transitions');
  await command('Emulation.setEmulatedMedia',{features:[]});
}
