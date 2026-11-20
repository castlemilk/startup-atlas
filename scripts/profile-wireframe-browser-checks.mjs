import assert from 'node:assert/strict';

// Exercises the editorial profile hierarchy and exact evidence against published records.
export async function checkProfileWireframes({command, evaluate, navigate, until, click, press, screenshot, assertNoOverflow, partners, graph}) {
  await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1050,deviceScaleFactor:1,mobile:false});
  await navigate('/entity.html?id=startup%3Acanva',"document.querySelector('#entity-profile')?.getAttribute('aria-busy')==='false'&&document.querySelector('h1')?.textContent==='Canva'");
  await until(()=>evaluate("document.querySelector('.atlas-section-nav a')?.getAttribute('aria-current')==='location'"),'Startup entry should highlight the first main section, not the top-aligned source rail');
  assert.equal(await evaluate("document.querySelectorAll('.atlas-section-nav [aria-current=\"location\"]').length"),1,'A startup profile has one current section');
  const dossier = await evaluate(`(()=>{
    const main=document.querySelector('.entity-dossier').getBoundingClientRect();
    const evidence=document.querySelector('.entity-aside').getBoundingClientRect();
    const facts=document.querySelector('#entity-company').getBoundingClientRect();
    const funding=document.querySelector('#entity-funding').getBoundingClientRect();
    const people=document.querySelector('#entity-founders').getBoundingClientRect();
    return {beside:evidence.left>=main.right,aligned:Math.abs(evidence.top-main.top)<2,ordered:facts.bottom<=people.top&&people.bottom<=funding.top,sourceCount:document.querySelectorAll('#entity-company .entity-fact-source a').length};
  })()`);
  assert.ok(dossier.beside&&dossier.aligned,'Startup evidence should align beside the overview below the full-width identity');
  assert.ok(dossier.ordered,'Overview, people and funding follow the section navigation order');
  assert.ok(dossier.sourceCount>0,'The compact facts retain their individual sources');
  await assertNoOverflow('Wireframe startup dossier desktop');
  await screenshot('atlas-wireframe-startup-desktop.png');

  const headquarters=graph.entities.find(entity=>entity.id==='startup:canva').profile_facts.find(fact=>fact.label==='Headquarters');
  const factAction='#entity-company button[aria-label="Sources for Headquarters"]';
  await until(()=>evaluate(`!!document.querySelector(${JSON.stringify(factAction)})`),'Company fact evidence did not upgrade');
  await click(factAction);
  await until(()=>evaluate("!!document.querySelector('.profile-evidence-panel[data-open]')"),'The exact headquarters claim did not open');
  assert.equal(await evaluate("document.querySelector('.profile-evidence-value').textContent"),headquarters.value);
  assert.equal(await evaluate("document.querySelector('.profile-evidence-citations a').href"),headquarters.source);
  assert.equal(await evaluate("document.querySelector('.profile-evidence-citations time').dateTime"),headquarters.reviewed_at);
  assert.equal(await evaluate('document.activeElement.id'),'profile-evidence-close');
  const readingPosition=await evaluate('scrollY');
  await press('Tab','Tab',9);
  assert.ok(await evaluate("document.activeElement.matches('.profile-evidence-citations a')"),'Keyboard focus stays in the evidence panel');
  await press('Escape','Escape',27);
  await until(()=>evaluate(`!document.querySelector('.profile-evidence-panel[data-open]')&&document.activeElement.matches(${JSON.stringify(factAction)})`),'Escape did not close and restore focus to the exact claim');
  assert.ok(Math.abs(await evaluate('scrollY')-readingPosition)<=1,'Evidence dismissal preserves profile reading position');

  await navigate('/partner.html?name=Airtree',"document.querySelector('#profile')?.getAttribute('aria-busy')==='false'&&!!document.querySelector('#partner-company-detail')");
  await until(()=>evaluate("document.querySelector('.atlas-section-nav a')?.getAttribute('aria-current')==='location'"),'Partner entry should highlight its first main section');
  assert.equal(await evaluate("document.querySelectorAll('.atlas-section-nav [aria-current=\"location\"]').length"),1,'A partner profile has one current section');
  const companyIndex=partners.Airtree.companies.length-1;
  const company=partners.Airtree.companies[companyIndex];
  const originalLocation=await evaluate('location.href');
  await click(`[data-company-index="${companyIndex}"]`);
  await until(()=>evaluate(`document.querySelector('#partner-company-title')?.textContent===${JSON.stringify(company.name)}`),'Company inspection did not update its visible identity');
  const selected=await evaluate(`(()=>{
    const detail=document.querySelector('#partner-company-detail');
    return {pressed:document.querySelectorAll('[data-company-index][aria-pressed="true"]').length,selected:document.querySelectorAll('[data-company-row][data-selected="true"]').length,source:detail.querySelector('.profile-detail-source a')?.href,profile:detail.querySelector('[data-atlas-profile-link]')?.getAttribute('href'),announcement:document.querySelector('#partner-company-selection').textContent,url:location.href};
  })()`);
  assert.equal(selected.pressed,1); assert.equal(selected.selected,1);
  assert.equal(selected.source,company.source);
  assert.ok(selected.profile?.startsWith('./entity.html?id=startup%3A'),'Inspection retains a separate real profile destination');
  assert.ok(selected.announcement.includes(company.name));
  assert.equal(selected.url,originalLocation,'Company inspection is local and does not navigate away from the organisation');
  const keyboardIndex=companyIndex===0?0:companyIndex-1;
  await evaluate(`document.querySelector('[data-company-index="${keyboardIndex}"]').focus()`);
  await press(' ','Space',32);
  await until(()=>evaluate(`document.querySelector('#partner-company-title')?.textContent===${JSON.stringify(partners.Airtree.companies[keyboardIndex].name)}`),'Native Space activation did not inspect the company');
  await assertNoOverflow('Wireframe partner explorer desktop');
  await screenshot('atlas-wireframe-partner-desktop.png');

  await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await navigate('/partner.html?name=Airtree',"document.querySelector('#profile')?.getAttribute('aria-busy')==='false'&&!!document.querySelector('#partner-company-detail')");
  await click(`[data-company-index="${companyIndex}"]`);
  assert.equal(await evaluate("document.querySelector('#partner-company-title').textContent"),company.name);
  assert.equal(await evaluate('document.activeElement?.id'),'partner-company-title','Stacked inspection moves focus to the selected detail heading');
  const narrowInspection=await evaluate(`(()=>{
    const heading=document.querySelector('#partner-company-title').getBoundingClientRect();
    const action=document.querySelector('#partner-company-detail .atlas-button').getBoundingClientRect();
    return {headingVisible:heading.top>=0&&heading.bottom<=innerHeight,actionVisible:action.top>=0&&action.bottom<=innerHeight&&action.width>0};
  })()`);
  assert.ok(narrowInspection.headingVisible,'Stacked inspection immediately reveals the focused heading in the viewport');
  assert.ok(narrowInspection.actionVisible,'Stacked inspection immediately reveals its company-profile action in the viewport');
  await assertNoOverflow('Wireframe partner explorer narrow');
  await screenshot('atlas-wireframe-partner-mobile.png',true);
  await navigate('/entity.html?id=startup%3Acanva',"document.querySelector('#entity-profile')?.getAttribute('aria-busy')==='false'&&document.querySelector('h1')?.textContent==='Canva'");
  assert.ok(await evaluate("document.querySelector('.entity-aside').getBoundingClientRect().top>=document.querySelector('.entity-dossier').getBoundingClientRect().bottom"),'Narrow evidence follows the complete dossier in document flow');
  await assertNoOverflow('Wireframe startup dossier narrow');
  await screenshot('atlas-wireframe-startup-mobile.png',true);
  await click('.atlas-section-nav a[href="#entity-funding"]');
  await until(()=>evaluate("document.querySelector('.atlas-section-nav [aria-current=location]')?.getAttribute('href')==='#entity-funding'"),'Funding did not become current');
  const seed=graph.funding_rounds.find(round=>round.id==='canva-2013-seed');
  await click('#entity-funding .entity-timeline details summary');
  const seedAction='#entity-funding details[open] button[aria-label*="Seed round"]';
  await click(seedAction);
  await until(()=>evaluate("(()=>{const sheet=document.querySelector('.profile-evidence-panel[data-presentation=sheet][data-open]')?.getBoundingClientRect();return sheet?.height>0&&Math.abs(sheet.bottom-innerHeight)<=1;})()"),'The mobile funding claim did not settle as a sheet');
  assert.equal(await evaluate("document.querySelector('.profile-evidence-value').textContent"),seed.amount_text);
  assert.equal(await evaluate("document.querySelector('.profile-evidence-citations a').href"),seed.source);
  await assertNoOverflow('Wireframe mobile funding evidence');
  await screenshot('atlas-wireframe-mobile-claim-evidence.png');
  await click('#profile-evidence-close');
  await until(()=>evaluate(`!document.querySelector('.profile-evidence-panel[data-open]')&&document.activeElement.matches(${JSON.stringify(seedAction)})`),'Closing the mobile funding claim did not restore focus');
  assert.ok(await evaluate("document.querySelector('#entity-funding details').open"),'Closing evidence preserves the expanded funding event');

  for(const kind of ['person','programme','provider']) {
    const entity=graph.entities.find(item=>item.kind===kind);
    if(!entity)continue;
    await navigate('/entity.html?id='+encodeURIComponent(entity.id),"document.querySelector('#entity-profile')?.getAttribute('aria-busy')==='false'");
    assert.equal(await evaluate("document.querySelector('#entity-profile h1')?.textContent"),entity.name);
    assert.equal(await evaluate("document.querySelectorAll('#entity-founders,#entity-company,#entity-funding').length"),0,`${kind} must not acquire invented company/funding sections`);
    await assertNoOverflow(`Wireframe ${kind} dossier narrow`);
  }
  await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1050,deviceScaleFactor:1,mobile:false});
  console.log('Profile wireframe checks passed: ordered dossier, exact desktop and mobile claim evidence, focus and reading position, sourced partner inspection, and narrow reading order.');
}
