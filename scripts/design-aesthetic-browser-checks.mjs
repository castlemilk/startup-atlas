// Focused acceptance of the proposed aesthetic through its actual controls and exports.
// The existing microsite harness supplies Chrome, diagnostics and screenshot storage.
import assert from 'node:assert/strict';
import {checkSignalControls} from './signal-controls-browser-checks.mjs';

export async function checkDesignAesthetic({command,evaluate,navigate,until,click,press,screenshot,assertNoOverflow,features,symbols,exportFeatureSymbol}) {
  const ids=['mcp','treemap','search','graph'];
  const ready="document.body.dataset.ready==='true'&&!!document.querySelector('#signal-preview-art')";
  const active=id=>`document.querySelector('#signal-preview')?.dataset.feature===${JSON.stringify(id)}&&document.querySelector('#signal-preview-art')?.complete&&document.querySelector('#signal-preview-art')?.naturalWidth>0`;
  async function capture(selector,name) {
    await evaluate(`(async()=>{document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'start',behavior:'instant'});await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);})()`);
    await screenshot(name);
  }
  async function selectFeature(id) {
    await click(`#signal-feature-tabs [data-feature="${id}"]`);
    await until(()=>evaluate(active(id)),'Feature control must load its matching artwork: '+id);
    const src=await evaluate("new URL(document.querySelector('#signal-preview-art').currentSrc).pathname");
    assert.match(src,new RegExp('/signal-'+id+'(?:-thumb)?\\.webp$'),'The active feature must show its own graphic');
    assert.equal(await evaluate(`document.querySelector('#signal-feature-tabs [data-feature="${id}"]').getAttribute('aria-pressed')`),'true');
    assert.equal(await evaluate("document.querySelectorAll('#signal-feature-tabs [aria-pressed=true]').length"),1,'Exactly one feature is selected');
    const feature=features.find(item=>item.id===id);
    const action=await evaluate("(()=>{const id=document.querySelector('#signal-preview').dataset.placement==='header'?'signal-header-link':'signal-live-link';const link=document.getElementById(id);return {href:link.getAttribute('href'),visible:link.getClientRects().length>0};})()");
    assert.ok(action.visible,'The selected feature has a visible working-view action');
    assert.equal(action.href,feature.route,'Working links retain the declared real destination');
  }

  assert.deepEqual(features.map(feature=>feature.id),ids,'The specimen must cover the four requested feature families');
  assert.deepEqual(symbols.map(symbol=>symbol.id),ids,'Feature symbols follow the same stable feature identities');
  await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1050,deviceScaleFactor:1,mobile:false});
  await navigate('/design-aesthetic.html?feature=graph&theme=dark&placement=header',ready+'&&'+active('graph'));
  await evaluate('document.fonts.ready.then(()=>true)');
  assert.equal(await evaluate('document.body.dataset.theme'),'dark','Shared links restore the requested appearance');
  assert.equal(await evaluate("document.querySelector('#signal-preview').dataset.placement"),'header','Shared links restore the requested placement');
  assert.equal(await evaluate("document.querySelector('#signal-theme-dark').getAttribute('aria-pressed')"),'true');
  assert.equal(await evaluate("[...document.styleSheets].some(sheet=>sheet.href&&new URL(sheet.href).pathname.endsWith('/design-tokens.css'))"),false,'The proposed page has an isolated token foundation');
  await assertNoOverflow('Desktop Signal direction');
  await evaluate("scrollTo({top:0,behavior:'instant'})");
  await screenshot('atlas-signal-hero-desktop.png');
  assert.equal(await evaluate("document.querySelectorAll('#component-field-guide article').length"),3);
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.signal-field-guide-list dd')).fontSize"),'14px');
  await capture('#component-field-guide','atlas-signal-field-guide-desktop.png');
  await assertNoOverflow('Signal component field guide desktop');


  for(const id of ids)await selectFeature(id);
  await press('Home','Home',36);
  await until(()=>evaluate(active('mcp')),'Home selects the first feature from the feature controls');
  assert.equal(await evaluate('document.activeElement.dataset.feature'),'mcp','Keyboard selection follows the focused feature');
  await press('End','End',35);
  await until(()=>evaluate(active('graph')),'End selects the last feature from the feature controls');
  await capture('#signal-preview','atlas-signal-graph-dark-desktop.png');
  await click('#signal-theme-light');
  assert.equal(await evaluate('document.body.dataset.theme'),'light');
  await click('#signal-placement-menu');
  await until(()=>evaluate("document.querySelector('#signal-preview').dataset.placement==='menu'"),'Placement control opens the navigation specimen');
  if(await evaluate("document.querySelector('#signal-menu-toggle').getAttribute('aria-expanded')!=='true'"))await click('#signal-menu-toggle');
  await click('[data-menu-feature="treemap"]');
  await until(()=>evaluate(active('treemap')),'Menu feature choice must update the selected artwork');
  const sharedUrl=await evaluate('location.pathname+location.search+location.hash');
  await navigate(sharedUrl,ready+'&&'+active('treemap'));
  assert.equal(await evaluate('document.body.dataset.theme'),'light','Sharing the selected specimen retains its appearance');
  assert.equal(await evaluate("document.querySelector('#signal-preview').dataset.placement"),'menu','Sharing the selected specimen retains its placement');
  await capture('#signal-preview','atlas-signal-menu-desktop.png');
  // The disclosure has one named trigger and a predictable keyboard exit.
  if(await evaluate("document.querySelector('#signal-menu-toggle').getAttribute('aria-expanded')!=='true'"))await click('#signal-menu-toggle');
  await evaluate("document.querySelector('[data-menu-feature=treemap]').focus({preventScroll:true})");
  await press('Escape','Escape',27);
  assert.equal(await evaluate("document.querySelector('#signal-menu-toggle').getAttribute('aria-expanded')"),'false');
  assert.equal(await evaluate('document.activeElement.id'),'signal-menu-toggle','Escape returns focus to the menu trigger');
  assert.equal(await evaluate("document.querySelector('#signal-preview').dataset.placement"),'header');

  const graphicIds=await evaluate("[...document.querySelectorAll('#signal-graphics article[data-graphic]')].map(node=>node.dataset.graphic)");
  assert.deepEqual(graphicIds,ids,'The asset family contains each feature once');
  for(const id of ids) {
    const link=await evaluate(`document.querySelector('[data-download-graphic="${id}"]')?.getAttribute('href')`);
    assert.match(link,new RegExp('/signal-'+id+'\\.webp$'),'Artwork downloads point to the full graphic');
    const exported=await evaluate(`fetch(document.querySelector('[data-download-symbol="${id}"]').href).then(response=>response.text())`);
    assert.equal(exported,exportFeatureSymbol(id),'Feature-symbol download contains the canonical SVG: '+id);
  }
  await evaluate("(async()=>{const image=document.querySelector('#signal-system-art');const element=image.tagName==='IMG'?image:image.querySelector('img');element.scrollIntoView({block:'center',behavior:'instant'});await element.decode();})()");
  assert.ok(await evaluate("document.querySelectorAll('#signal-references a[href^=https]').length>=3"),'The direction attributes its reviewed references');
  assert.ok(await evaluate("document.querySelector('#signal-prompts').textContent.length>300"),'Accepted generation prompts remain available beside the assets');

  await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});
  await navigate('/design-aesthetic.html?feature=search&theme=light&placement=menu',ready+'&&'+active('search'));
  await selectFeature('search');
  await assertNoOverflow('390px Signal navigation specimen');
  await capture('#component-field-guide','atlas-signal-field-guide-mobile.png');
  assert.equal(await evaluate("(()=>{const cards=[...document.querySelectorAll('#component-field-guide article')];return cards.every(card=>Math.abs(card.getBoundingClientRect().x-cards[0].getBoundingClientRect().x)<1);})()"),true,'Field guide families stack on mobile');
  await assertNoOverflow('390px component field guide');

  await capture('#signal-preview','atlas-signal-menu-mobile.png');
  await click('#signal-placement-header');
  await selectFeature('mcp');
  await assertNoOverflow('390px Signal header specimen');
  await capture('#signal-preview','atlas-signal-header-mobile.png');
  await click('#signal-theme-dark');
  assert.equal(await evaluate('document.body.dataset.theme'),'dark');
  await assertNoOverflow('390px dark Signal specimen');

  await command('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await selectFeature('graph');
  assert.ok(await evaluate("getComputedStyle(document.querySelector('#signal-menu-toggle svg')).transitionDuration.split(',').every(value=>parseFloat(value)===0)"),'Reduced motion removes the menu transition while selection remains usable');
  await assertNoOverflow('390px reduced-motion Signal specimen');
  await command('Emulation.setEmulatedMedia',{features:[]});
  await checkSignalControls({command,evaluate,navigate,until,click,press,screenshot,assertNoOverflow});
}
