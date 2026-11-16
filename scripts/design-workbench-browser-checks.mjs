// Exercises the reference as a user: native controls, local specimens and real exports.
// The existing Atlas browser harness supplies Chrome, screenshots and diagnostics.
import assert from 'node:assert/strict';

export async function checkDesignWorkbench({command,evaluate,navigate,until,click,press,screenshot,assertNoOverflow}) {
  const text=selector=>evaluate(`document.querySelector(${JSON.stringify(selector)})?.textContent||''`);
  const ready="document.querySelector('#component-workbench')?.dataset.componentReady==='true'&&document.querySelectorAll('#token-grid [data-token]').length===53&&document.querySelector('#dr-diagram')?.dataset.recipe==='search'";
  async function choose(selector,value) {
    const options=await evaluate(`[...document.querySelector(${JSON.stringify(selector)}).options].map(option=>option.value)`);
    const index=options.indexOf(value);
    assert.ok(index>=0,'Missing option '+value+' in '+selector);
    await click(selector);
    await press('Home','Home',36);
    for(let i=0;i<index;i++)await press('ArrowDown','ArrowDown',40);
    await press('Enter','Enter',13);
    await until(()=>evaluate(`document.querySelector(${JSON.stringify(selector)}).value===${JSON.stringify(value)}`),'Native selection did not change: '+selector);
  }
  async function fill(selector,value) {
    await click(selector);
    await press('a','KeyA',65,2);
    if(value)await command('Input.insertText',{text:value});else await press('Backspace','Backspace',8);
  }
  async function capture(selector,name) {
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'start',behavior:'instant'})`);
    await screenshot(name);
  }
  async function downloaded(selector) {
    return evaluate(`fetch(document.querySelector(${JSON.stringify(selector)}).href).then(response=>response.text())`);
  }

  await navigate('/design-system.html',ready);
  assert.equal(await evaluate("document.querySelectorAll('#component-list button[data-component]').length"),9);
  await capture('#components','atlas-workbench-desktop.png');
  await click('#dc-demo-action');
  assert.equal(await evaluate("document.querySelector('#dc-demo-action').getAttribute('aria-pressed')"),'true');
  assert.equal(await evaluate("document.querySelector('#dc-action-detail').hidden"),false);
  await click('[data-dc-reset-action]');
  assert.equal(await evaluate("document.querySelector('#dc-action-detail').hidden"),true);
  const actionSize=await evaluate("(()=>{const r=document.querySelector('#dc-demo-action').getBoundingClientRect();return {width:r.width,height:r.height};})()");
  await choose('#component-variant','busy');
  assert.equal(await evaluate("document.querySelector('#dc-demo-action').disabled"),true);
  const busySize=await evaluate("(()=>{const r=document.querySelector('#dc-demo-action').getBoundingClientRect();return {width:r.width,height:r.height};})()");
  assert.deepEqual(busySize,actionSize,'Busy controls retain the available control dimensions');

  // Every published component and variant must produce a usable, escaped specimen.
  const componentIds=await evaluate("[...document.querySelectorAll('#component-list button[data-component]')].map(button=>button.dataset.component)");
  for(const id of componentIds) {
    await click(`#component-list [data-component="${id}"]`);
    const variants=await evaluate("[...document.querySelector('#component-variant').options].map(option=>option.value)");
    for(const variant of variants) {
      await choose('#component-variant',variant);
      await until(()=>evaluate(`document.querySelector('#component-preview').dataset.component===${JSON.stringify(id)}&&document.querySelector('#component-preview').dataset.variant===${JSON.stringify(variant)}`),'Specimen variant did not render');
      assert.ok((await text('#component-code')).length>100,`${id}/${variant} needs actual markup`);
      assert.equal(await evaluate("document.querySelector('#component-code').children.length"),0,'HTML source is shown as text');
      const output=await downloaded('#component-download');
      assert.ok(output.includes((await text('#component-code')).trim()),'Download contains the current specimen HTML');
    }
  }
  await click('#component-list [data-component="entity-row"]');
  await choose('#component-variant','long');
  await click('#component-preview .entity-row-main a');
  assert.equal(await evaluate("document.activeElement.id"),'dc-row-profile');
  assert.equal(await evaluate("document.querySelector('#dc-row-details').open"),true);
  await choose('#component-variant','missing');
  assert.ok(!(await text('#component-preview .entity-row-meta')).includes('0 recorded'),'Unknown connection counts must not become zero');
  await capture('.dc-inspector','atlas-workbench-entity-desktop.png');

  await click('#component-list [data-component="search"]');
  await fill('#dc-demo-search','Maya');
  assert.match(await text('#dc-demo-search-count'),/1 of 3/);
  await click('[data-atlas-clear-for="dc-demo-search"]');
  assert.equal(await evaluate("document.activeElement.id"),'dc-demo-search');
  assert.match(await text('#dc-demo-search-count'),/3 of 3/);
  await fill('#component-search','zz-no-component');
  assert.equal(await evaluate("document.querySelector('#component-empty').hidden"),false);
  assert.match(await text('#component-selection-context'),/remains selected/);
  await click('#component-reset');
  assert.equal(await evaluate("document.activeElement.id"),'component-search');
  assert.equal(await evaluate("document.querySelectorAll('#component-list button').length"),9);
  await choose('#component-category','research');
  assert.equal(await evaluate("document.querySelectorAll('#component-list button').length"),3);
  await choose('#component-category','all');

  await click('#component-list [data-component="source"]');
  await evaluate("document.querySelector('#dc-source-disclosure summary').focus()");
  await press('Enter','Enter',13);
  await until(()=>evaluate("document.querySelector('#dc-source-disclosure').open&&document.querySelector('#component-variant').value==='expanded'"),'Native source disclosure did not activate with Enter');
  assert.equal(await evaluate("document.querySelector('#component-preview').dataset.variant"),'expanded','Native disclosure and inspected variant stay in sync');
  await capture('.dc-inspector','atlas-workbench-source-desktop.png');
  await click('#component-code-details > summary');
  await evaluate("Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:()=>Promise.reject(new Error('Deliberately unavailable for the recovery check'))}})");
  await click('#component-copy');
  await until(()=>evaluate("!document.querySelector('#component-copy-fallback').hidden"),'Markup copy must expose a manual fallback');
  assert.equal(await evaluate("document.querySelector('#component-copy-text').value"),await text('#component-code'));
  assert.equal(await evaluate("document.activeElement.id"),'component-copy-text');
  await click('#component-list [data-component="status"]');
  await choose('#component-variant','partial');
  await click('[data-dc-recover]');
  assert.equal(await evaluate("document.querySelector('#component-preview').dataset.variant"),'ready');
  assert.equal(await evaluate("document.activeElement.id"),'dc-ready-heading');

  // Runtime values, filtering and exports all share the canonical token owner.
  const tokenNames=await evaluate("[...document.querySelectorAll('#token-grid [data-token]')].map(card=>card.dataset.token)");
  assert.equal(new Set(tokenNames).size,53);
  const initialTokens=JSON.parse(await downloaded('#token-export-json'));
  assert.equal(Object.keys(initialTokens.tokens).length,53);
  for(const name of tokenNames) {
    const current=await evaluate(`getComputedStyle(document.documentElement).getPropertyValue(${JSON.stringify(name)}).trim()`);
    assert.equal(initialTokens.tokens[name].value,current,'Export preserves computed '+name);
  }
  await fill('#token-search','--atlas-focus');
  await evaluate("Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:()=>new Promise((resolve,reject)=>{window.__rejectAtlasTokenCopy=reject;})}})");
  await click('[data-token="--atlas-focus"] [data-token-copy="css"]');
  await click('#token-clear');
  await evaluate("window.__rejectAtlasTokenCopy(new Error('Delayed clipboard rejection')); Promise.resolve()");
  assert.equal(await evaluate("document.querySelector('#token-copy-fallback').hidden"),true,'An obsolete copy failure must not reopen a fallback after filtering');
  assert.equal(await evaluate("document.activeElement.id"),'token-search','A delayed copy failure must not steal focus from the next task');
  await evaluate("Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:()=>Promise.reject(new Error('Deliberately unavailable for recovery checks'))}})");
  await fill('#token-search','--atlas-focus');
  assert.match(await text('#token-count'),/^1 of 53/);
  await click('[data-token="--atlas-focus"] [data-token-copy="css"]');
  await until(()=>evaluate("!document.querySelector('#token-copy-fallback').hidden"),'Token copy must have an honest manual fallback');
  assert.equal(await evaluate("document.querySelector('#token-fallback-code').value"),'--atlas-focus: '+initialTokens.tokens['--atlas-focus'].value+';');
  await click('#token-fallback-close');
  await click('#token-clear');
  assert.equal(await evaluate("document.activeElement.id"),'token-search');
  await choose('#token-group','spacing');
  assert.match(await text('#token-count'),/^7 of 53/);
  assert.equal(Object.keys(JSON.parse(await downloaded('#token-export-json')).tokens).length,53,'Filtering does not silently narrow an all-token export');
  await capture('.dt-catalogue-heading','atlas-tokens-spacing-desktop.png');
  await fill('#token-search','zz-no-token');
  assert.equal(await evaluate("document.querySelector('#token-empty').hidden"),false);
  await click('#token-reset');
  assert.equal(await evaluate("document.activeElement.id"),'token-search');
  assert.equal(await evaluate("document.querySelectorAll('#token-grid [data-token]').length"),53);
  await click('#token-expand');
  assert.equal(await evaluate("[...document.querySelectorAll('#token-grid details')].every(item=>item.open)"),true);
  await click('#token-expand');
  assert.equal(await evaluate("[...document.querySelectorAll('#token-grid details')].every(item=>!item.open)"),true);

  assert.ok(Math.abs(Number(await evaluate("document.querySelector('#contrast-ratio').dataset.ratio"))-12.525814294825278)<1e-10);
  await capture('.dt-contrast','atlas-contrast-desktop.png');
  await choose('#contrast-foreground','--atlas-surface');
  assert.equal(await text('#contrast-ratio'),'1.00:1');
  assert.equal(await evaluate("document.querySelector('#contrast-normal').dataset.pass"),'false');
  await choose('#contrast-background','--atlas-ink');
  assert.equal(await evaluate("document.querySelector('#contrast-normal').dataset.pass"),'true');
  const beforeSwap=await text('#contrast-ratio');
  await click('#contrast-swap');
  assert.equal(await text('#contrast-ratio'),beforeSwap,'Contrast is symmetric');
  assert.equal(await evaluate("document.querySelector('#contrast-foreground').value"),'--atlas-ink');
  await command('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await until(()=>evaluate("document.querySelector('#token-runtime-note').dataset.reduced==='true'"),'Reduced motion must refresh the reference');
  const reduced=JSON.parse(await downloaded('#token-export-json'));
  assert.equal(reduced.reducedMotion,true);
  assert.equal(reduced.tokens['--atlas-duration-fast'].value,'0ms');
  assert.equal(reduced.tokens['--atlas-duration-normal'].value,'0ms');
  assert.match(await downloaded('#token-export-css'),/--atlas-duration-fast: 0ms;/);
  await command('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});

  for(const recipe of ['search','treemap','graph','startup','partner']) {
    await choose('#dr-recipe',recipe);
    assert.equal(await evaluate("document.querySelector('#dr-diagram').dataset.recipe"),recipe);
    const regions=await evaluate("[...document.querySelectorAll('[data-dr-region]')].map(button=>button.dataset.drRegion)");
    assert.ok(regions.length>=5,'Each recipe explains the complete reading surface');
    for(const region of regions) {
      await click(`[data-dr-region="${region}"]`);
      assert.equal(await evaluate(`document.querySelector('[data-dr-region="${region}"]').getAttribute('aria-pressed')`),'true');
      assert.match(await text('#dr-region-detail'),/Current owner/);
    }
    const scaffold=await downloaded('#dr-download');
    assert.match(scaffold,/<!doctype html>/i);
    assert.match(scaffold,/Composition scaffold/);
    assert.equal(scaffold,await evaluate("document.querySelector('#dr-scaffold').value"),'Scaffold download and preview agree');
  }
  await choose('#dr-recipe','graph');
  await capture('#recipes','atlas-recipe-graph-wide.png');
  await click('[data-dr-mode="narrow"]');
  assert.equal(await evaluate("document.querySelector('#dr-diagram').dataset.layout"),'narrow');
  await capture('#recipes','atlas-recipe-graph-narrow.png');
  await click('#dr-scaffold-details > summary');
  await click('#dr-copy');
  await until(()=>evaluate("!document.querySelector('#dr-copy-fallback').hidden"),'Scaffold copy must expose manual recovery');
  assert.equal(await evaluate('document.activeElement.id'),'dr-scaffold');
  await click('[data-dr-mode="wide"]');
  await evaluate('history.back()');
  await until(()=>evaluate("document.querySelector('#dr-diagram').dataset.layout==='narrow'"),'Back must restore the recipe composition');

  // Independent tools retain each other's state through a shared URL and reload.
  await navigate('/design-system.html?pattern=graph&device=mobile&component=source&variant=expanded&recipe=graph&layoutMode=narrow&tokenGroup=spacing&foreground=--atlas-on-action&background=--atlas-ink#components',"document.querySelector('#component-preview')?.dataset.component==='source'&&document.querySelector('#dr-diagram')?.dataset.recipe==='graph'&&document.querySelector('#token-group')?.value==='spacing'");
  assert.equal(await evaluate("document.querySelector('#dc-source-disclosure').open"),true);
  assert.equal(await evaluate("document.querySelector('#preview-stage').dataset.device"),'mobile');
  assert.equal(await evaluate("document.querySelector('#pattern-graph').getAttribute('aria-selected')"),'true');
  await choose('#component-variant','closed');
  assert.equal(await evaluate("new URLSearchParams(location.search).get('recipe')"),'graph');
  assert.equal(await evaluate("new URLSearchParams(location.search).get('tokenGroup')"),'spacing');
  await evaluate('history.back()');
  await until(()=>evaluate("document.querySelector('#component-variant').value==='expanded'"),'Back must restore the component variant');

  await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await navigate('/design-system.html',ready);
  await assertNoOverflow('390px complete design reference');
  await screenshot('atlas-system-mobile.png');
  await capture('#components','atlas-workbench-mobile.png');
  await click('#component-list [data-component="entity-row"]');
  assert.equal(await evaluate('document.activeElement.id'),'component-title','Narrow component selection places focus at the inspector');
  await choose('#component-variant','long');
  await assertNoOverflow('390px long identity specimen');
  await capture('.dc-inspector','atlas-workbench-entity-mobile.png');
  await choose('#dr-recipe','partner');
  await click('[data-dr-mode="narrow"]');
  await assertNoOverflow('390px partner composition recipe');
  await capture('#recipes','atlas-recipe-partner-mobile.png');
  await capture('.dt-contrast','atlas-contrast-mobile.png');
  await choose('#token-group','type');
  await assertNoOverflow('390px typography token reference');
  await capture('.dt-catalogue-heading','atlas-tokens-mobile.png');

  await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1050,deviceScaleFactor:1,mobile:false});
  await command('Network.setBlockedURLs',{urls:['*data/atlas.sqlite*','*data/graph.json*']});
  await navigate('/design-system.html',"document.querySelector('#component-workbench')?.dataset.componentReady==='true'&&document.querySelector('#ds-snapshot')?.textContent.includes('unavailable')");
  assert.equal(await evaluate("document.querySelectorAll('#token-grid [data-token]').length"),53,'Design reference remains available when research cannot load');
  await click('#dc-demo-action');
  assert.equal(await evaluate("document.querySelector('#dc-action-detail').hidden"),false);
  await command('Network.setBlockedURLs',{urls:[]});
  console.log('Design workbench checks passed: nine component recipes and variants, local interactions, native keyboard controls, token exports/contrast/reduced motion, five responsive compositions, copy recovery, URL restoration, narrow layouts and research-failure independence.');
}
