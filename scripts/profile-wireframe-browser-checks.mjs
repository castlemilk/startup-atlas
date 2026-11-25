import assert from 'node:assert/strict';

// Exercises the editorial profile hierarchy and exact evidence against published records.
export async function checkProfileWireframes({command, evaluate, navigate, until, click, press, screenshot, assertNoOverflow, partners, graph, catalogue}) {
  await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1050,deviceScaleFactor:1,mobile:false});
  await navigate('/entity.html?id=startup%3Acanva',"document.querySelector('#entity-profile')?.getAttribute('aria-busy')==='false'&&document.querySelector('h1')?.textContent==='Canva'");
  await evaluate('document.fonts.ready.then(()=>true)');
  await until(()=>evaluate("document.querySelector('.atlas-section-nav a')?.getAttribute('aria-selected')==='true'"),'Startup entry should select the first main section tab');
  assert.equal(await evaluate("document.querySelectorAll('.atlas-section-nav [aria-selected=\"true\"]').length"),1,'A startup profile has one selected section');
  const dossier = await evaluate(`(()=>{
    const main=document.querySelector('.entity-overview-main').getBoundingClientRect();
    const evidence=document.querySelector('.entity-overview-rail').getBoundingClientRect();
    const plate=document.querySelector('.entity-hero-identity > .entity-mark').getBoundingClientRect();
    const facts=document.querySelector('.entity-overview-facts').getBoundingClientRect();
    // Sections are tab panels (#419): people and funding are hidden until
    // selected, so their order is the DOM/tab order, not a visual stack.
    const peoplePanel=document.querySelector('#entity-founders');
    const fundingPanel=document.querySelector('#entity-funding');
    const ordered=!!(document.querySelector('.entity-overview-facts').compareDocumentPosition(peoplePanel)&Node.DOCUMENT_POSITION_FOLLOWING)&&!!(peoplePanel.compareDocumentPosition(fundingPanel)&Node.DOCUMENT_POSITION_FOLLOWING);
    return {beside:evidence.left>=main.right,aligned:Math.abs(evidence.top-main.top)<2,ordered,firstFold:document.querySelector('.entity-overview-related').getBoundingClientRect().bottom<=innerHeight,founders:document.querySelectorAll('.entity-founder-preview li').length,sourceCount:document.querySelectorAll('#entity-company .entity-fact-source a').length,split:main.width/(main.width+evidence.width),plateRatio:plate.width/plate.height};
  })()`);
  assert.ok(dossier.beside&&dossier.aligned,'Startup evidence should align beside the overview below the full-width identity');
  assert.ok(dossier.split >= .6 && dossier.split <= .66,'The overview and evidence rail should preserve the approved column proportion');
  assert.ok(dossier.plateRatio >= 1.85,'The company mark uses a horizontal identity plate');
  assert.ok(dossier.firstFold&&dossier.founders===3,'The published founders, historic funding snapshot and shared company are visible in the desktop overview');
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

  const seed=graph.funding_rounds.find(round=>round.id==='canva-2013-seed');
  await click('.entity-funding-sample a');
  await until(()=>evaluate(`location.hash==='#entity-funding'&&document.getElementById(${JSON.stringify(`entity-round-${seed.id}`)}).open`),'Opening the snapshot should expand its exact funding event');
  const seedAction='#entity-funding details[open] button[aria-label*="Seed round"]';
  await until(()=>evaluate("document.querySelector('.atlas-section-nav a[href=\"#entity-funding\"]').getAttribute('aria-selected')==='true'&&!document.querySelector('#entity-funding').hidden"),'Funding did not become the selected section');
  await evaluate(`document.querySelector(${JSON.stringify(seedAction)}).focus({preventScroll:true})`);
  await press('Enter','Enter',13);
  await until(()=>evaluate("!!document.querySelector('.profile-evidence-panel[data-presentation=dialog][data-open]')"),'The funding evidence did not open beside the chronology');
  assert.equal(await evaluate("document.querySelector('.profile-evidence-value').textContent"),seed.amount_text);
  await screenshot('atlas-wireframe-desktop-claim-evidence.png');
  await press('Escape','Escape',27);
  await until(()=>evaluate("!document.querySelector('.profile-evidence-panel[data-open]')"),'Escape did not dismiss funding evidence');
  await click('.atlas-section-nav a[href="#entity-founders"]');
  await until(()=>evaluate("(()=>{const nav=document.querySelector('.atlas-section-nav');return nav.querySelector('[aria-selected=true]')?.getAttribute('href')==='#entity-founders'&&!document.querySelector('#entity-founders').hidden;})()"),'People did not become the selected section');
  assert.equal(await evaluate("document.querySelectorAll('.entity-network-people a[data-atlas-profile-link]').length"),3,'The relationship preview links the recorded founders');
  await screenshot('atlas-wireframe-people-desktop.png');

  await navigate('/partner.html?name=Airtree',"document.querySelector('#profile')?.getAttribute('aria-busy')==='false'&&!!document.querySelector('#partner-company-detail')");
  await until(()=>evaluate("document.querySelector('.atlas-section-nav a')?.getAttribute('aria-selected')==='true'"),'Partner entry should select its first main section tab');
  assert.equal(await evaluate("document.querySelectorAll('.atlas-section-nav [aria-selected=\"true\"]').length"),1,'A partner profile has one selected section');
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

  const startmateReady="document.querySelector('#profile')?.getAttribute('aria-busy')==='false'&&!!document.querySelector('#partner-company-detail')";
  const lastCompany=partners.Startmate.companies.length-1;
  await navigate('/partner.html?name=Startmate',startmateReady);
  await click(`[data-company-index="${lastCompany}"]`);
  assert.equal(await evaluate("document.querySelector('#partner-company-title')?.textContent"),partners.Startmate.companies[lastCompany].name);
  assert.ok(await evaluate(`(()=>{
    const panel=document.querySelector('#partner-company-detail').getBoundingClientRect();
    const bar=document.querySelector('.profile-sticky').getBoundingClientRect();
    const button=document.querySelector('[data-company-index="${lastCompany}"]');
    return scrollY>700&&panel.top>=bar.bottom&&panel.bottom<=innerHeight&&document.activeElement===button;
  })()`),'Last-row desktop inspection keeps the detail and focused row in view');
  await assertNoOverflow('Wide Startmate portfolio');
  await screenshot('atlas-partner-last-row-desktop.png');

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

  const sample=partners.Startmate.companies[1];
  const inspect='[data-company-index="1"]';
  const source='#partner-company-detail .profile-source-action';
  for (const [width,height] of [[320,740],[568,320]]) {
    await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true});
    await navigate('/partner.html?name=Startmate',startmateReady);
    assert.ok(await evaluate(`(()=>{
      const nav=document.querySelector('.atlas-section-nav');
      const links=[...nav.querySelectorAll('a')];
      const bounds=nav.getBoundingClientRect();
      return links.length>=3&&links[0].textContent.trim()==='Companies'&&links.at(-1).textContent.trim()==='Programmes'&&nav.scrollWidth<=nav.clientWidth+1&&links.every(link=>{
        const r=link.getBoundingClientRect();
        return r.left>=bounds.left-1&&r.right<=bounds.right+1&&r.height>=44;
      });
    })()`),`All Startmate sections fit at ${width}px`);
    await click(inspect);
    assert.equal(await evaluate("document.querySelector('#partner-company-title')?.textContent"),sample.name);
    assert.ok(await evaluate(`(()=>{
      const panel=document.querySelector('#partner-company-detail');
      const bounds=panel.getBoundingClientRect();
      const nav=document.querySelector('.profile-sticky');
      const top=getComputedStyle(nav).position==='sticky'?Math.max(0,nav.getBoundingClientRect().bottom):0;
      return panel.previousElementSibling?.dataset.companyRow==='1'&&document.activeElement?.id==='partner-company-title'&&bounds.top>=top-1&&bounds.bottom<=innerHeight+1;
    })()`),`The whole Startmate inspector opens beside its selected row at ${width}×${height}`);
    await until(()=>evaluate(`!!document.querySelector(${JSON.stringify(source)})`),'The selected portfolio evidence did not upgrade');
    await press('Tab','Tab',9);
    assert.equal(await evaluate(`document.activeElement.matches(${JSON.stringify(source)})`),true,'Relationship evidence is the next control after the detail heading');
    await press('Enter','Enter',13);
    await until(()=>evaluate("!!document.querySelector('.profile-evidence-panel[data-open]')"),'The selected portfolio claim did not open');
    assert.equal(await evaluate("document.querySelector('.profile-evidence-value').textContent"),sample.relationship || 'Listed in portfolio');
    assert.equal(await evaluate("document.querySelector('.profile-evidence-citations a').href"),sample.source);
    await press('Escape','Escape',27);
    await until(()=>evaluate(`!document.querySelector('.profile-evidence-panel[data-open]')&&document.activeElement.matches(${JSON.stringify(source)})`),'Closing portfolio evidence restores its exact trigger');
    await press('Tab','Tab',9,8);
    await until(()=>evaluate(`(()=>{
      const button=document.querySelector(${JSON.stringify(inspect)});
      const r=button.getBoundingClientRect();
      return document.activeElement===button&&button.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));
    })()`),'Reverse Tab returns to the visible selected company');
    await assertNoOverflow(`Startmate portfolio at ${width}px`);
    await screenshot(`atlas-partner-selected-row-${width}.png`);
  }

  await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await navigate('/entity.html?id=startup%3Acanva',"document.querySelector('#entity-profile')?.getAttribute('aria-busy')==='false'&&document.querySelector('h1')?.textContent==='Canva'");
  await evaluate('document.fonts.ready.then(()=>true)');
  assert.ok(await evaluate(`(()=>{
    const fact=document.querySelector('.entity-mobile-facts .entity-overview-facts');
    const preview=document.querySelector('.entity-founder-preview');
    return !!fact && !!(fact.compareDocumentPosition(preview)&Node.DOCUMENT_POSITION_FOLLOWING) && fact.getBoundingClientRect().bottom<=preview.getBoundingClientRect().top;
  })()`),'On mobile the source-linked facts precede founders in both visual and keyboard order');
  assert.ok(await evaluate(`(()=>{
    const rect=selector=>document.querySelector(selector).getBoundingClientRect();
    const mark=rect('.entity-hero-identity .entity-mark'),title=rect('.entity-hero h1');
    const save=rect('.entity-actions [data-atlas-save-company]'),compare=rect('.entity-actions [data-atlas-compare]');
    const graph=rect('.entity-overview-mobile-graph');
    return mark.bottom<=title.top+1 && Math.abs(save.top-compare.top)<1 && save.right<compare.left && graph.width>=300 && graph.height>=44 && graph.bottom<=innerHeight+1;
  })()`),'The mobile profile stacks its identity, pairs the workspace actions, and exposes a full-width graph link');
  await assertNoOverflow('Wireframe startup dossier narrow');
  await screenshot('atlas-wireframe-startup-mobile.png');
  await click('.entity-mobile-facts-extra summary');
  assert.ok(await evaluate("document.querySelector('.entity-more-facts[open] .entity-facts').textContent.includes('Legal entity')"),'The compact overview preserves access to the additional company facts');
  await click('.atlas-section-nav a[href="#entity-funding"]');
  await until(()=>evaluate("document.querySelector('.atlas-section-nav [aria-selected=\"true\"]')?.getAttribute('href')==='#entity-funding'"),'Funding did not become the selected section');
  await click('#entity-funding .entity-timeline details summary');
  await click(seedAction);
  await until(()=>evaluate("(()=>{const sheet=document.querySelector('.profile-evidence-panel[data-presentation=sheet][data-open]')?.getBoundingClientRect();return sheet?.height>0&&Math.abs(sheet.bottom-innerHeight)<=1;})()"),'The mobile funding claim did not settle as a sheet');
  assert.equal(await evaluate("document.querySelector('.profile-evidence-value').textContent"),seed.amount_text);
  assert.equal(await evaluate("document.querySelector('.profile-evidence-citations a').href"),seed.source);
  await assertNoOverflow('Wireframe mobile funding evidence');
  await screenshot('atlas-wireframe-mobile-claim-evidence.png');
  await click('#profile-evidence-close');
  await until(()=>evaluate(`!document.querySelector('.profile-evidence-panel[data-open]')&&document.activeElement.matches(${JSON.stringify(seedAction)})`),'Closing the mobile funding claim did not restore focus');
  assert.ok(await evaluate("document.querySelector('#entity-funding details').open"),'Closing evidence preserves the expanded funding event');

  await command('Emulation.setDeviceMetricsOverride',{width:841,height:700,deviceScaleFactor:1,mobile:false});
  await navigate('/entity.html?id=startup%3Arevolut',"document.querySelector('#entity-profile')?.getAttribute('aria-busy')==='false'&&document.querySelector('h1')?.textContent==='Revolut'");
  assert.ok(await evaluate("document.querySelector('.entity-overview-facts').getBoundingClientRect().width>440"),'Company facts must use the available reading width on a tablet');
  await command('Emulation.setDeviceMetricsOverride',{width:320,height:480,deviceScaleFactor:1,mobile:true});
  await navigate('/entity.html?id=startup%3Acanva',"document.querySelector('#entity-profile')?.getAttribute('aria-busy')==='false'&&document.querySelector('h1')?.textContent==='Canva'");
  await evaluate('document.fonts.ready.then(()=>true)');
  assert.ok(await evaluate(`(() => {
    const nav=document.querySelector('.atlas-section-nav');
    const frame=nav.getBoundingClientRect();
    return nav.scrollWidth<=nav.clientWidth+1 && [...nav.querySelectorAll('a')].every(link=>{
      const bounds=link.getBoundingClientRect();
      return bounds.left>=frame.left-1 && bounds.right<=frame.right+1 && bounds.height>=44;
    });
  })()`),'Every company section link must fit and remain tappable at 320px');
  await click('.entity-overview-sources a[href="#entity-sources"]');
  await until(()=>evaluate(`(() => {
    const nav=document.querySelector('.profile-sticky');
    const top=document.querySelector('#entity-sources').getBoundingClientRect().top;
    return document.querySelector('.profile-sources-footer').open && top>=0 && top<innerHeight/2
      && (getComputedStyle(nav).position!=='sticky' || top>=nav.getBoundingClientRect().bottom);
  })()`),'Sources must open at a readable position below the section navigation');
  await assertNoOverflow('Short 320px company dossier');

  await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  for(const kind of ['person','programme','provider']) {
    const entity=graph.entities.find(item=>item.kind===kind);
    if(!entity)continue;
    await navigate('/entity.html?id='+encodeURIComponent(entity.id),"document.querySelector('#entity-profile')?.getAttribute('aria-busy')==='false'");
    assert.equal(await evaluate("document.querySelector('#entity-profile h1')?.textContent"),entity.name);
    assert.equal(await evaluate("document.querySelectorAll('#entity-founders,#entity-company,#entity-funding').length"),0,`${kind} must not acquire invented company/funding sections`);
    await assertNoOverflow(`Wireframe ${kind} dossier narrow`);
  }
  const offer=catalogue.opportunities.find(item=>item.id==='carbon-innovation-grants-wa');
  const personEdge=graph.edges.find(edge=>edge.from==='person:melanie-perkins'&&edge.to==='startup:canva');
  const profiles=[
    {id:personEdge.from, trigger:'button[aria-label="Sources for Founding relationship · Canva"]', original:personEdge.source, value:'Melanie Perkins founded Canva'},
    {id:`programme:${offer.id}`, trigger:'button[aria-label="Sources for Programme eligibility"]', original:offer.url, value:offer.eligibility}
  ];
  for (const [width,height] of [[1440,900],[320,568],[568,320]]) {
    await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<700});
    for (const profile of profiles) {
      await navigate('/entity.html?id='+encodeURIComponent(profile.id),"document.querySelector('#entity-profile')?.getAttribute('aria-busy')==='false'");
      await assertNoOverflow(`${profile.id} at ${width}×${height}`);
      if (profile.id.startsWith('programme:')) {
        assert.equal(await evaluate("document.querySelector('.entity-programme-source time')?.dateTime"),offer.checked);
        assert.ok(await evaluate(`(()=>{const sources=[...document.querySelectorAll('#entity-sources a')].map(a=>a.href);return ${JSON.stringify(offer.extra)}.every(url=>sources.includes(url));})()`),'Programme documents remain present in the source index');
      }
      await click('.profile-sources-summary');
      // The sources index renders asynchronously, so keep re-anchoring the
      // section until it reads at the top of the viewport.
      await until(()=>evaluate("(()=>{const s=document.querySelector('#entity-sources');s.scrollIntoView({block:'start',behavior:'instant'});return document.querySelector('.profile-sources-footer').open&&s.getBoundingClientRect().top<innerHeight/2;})()"),'The Sources section must open and read at the top of the viewport');
      // Tabbed profiles (#419): the evidence trigger may sit in a hidden
      // panel; select that panel's tab first so the control is reachable.
      await evaluate(`(()=>{const b=document.querySelector(${JSON.stringify(profile.trigger)});const panel=b?.closest('[role="tabpanel"]');if(panel&&panel.hidden)document.getElementById('tab-'+panel.id)?.click();})()`);
      await click(profile.trigger);
      await until(()=>evaluate(`(()=>{
        const panel=document.querySelector('.profile-evidence-panel[data-open]'),footer=panel?.querySelector('.profile-evidence-footer a');
        if(!footer)return false;
        const action=footer.getBoundingClientRect(),body=panel.querySelector('.profile-evidence-scroll');
        return action.top>=0&&action.bottom<=innerHeight+1&&action.height>=44&&body.scrollWidth<=body.clientWidth+1;
      })()`),`The original source stays visible in the ${width}×${height} evidence panel`);
      assert.equal(await evaluate("document.querySelector('.profile-evidence-value').textContent"),profile.value);
      assert.equal(await evaluate("document.querySelector('.profile-evidence-footer a').href"),profile.original);
      assert.equal(await evaluate('document.activeElement.id'),'profile-evidence-close');
      await press('Tab','Tab',9);
      if (await evaluate("document.activeElement.matches('.profile-evidence-scroll')")) await press('Tab','Tab',9);
      assert.ok(await evaluate("document.activeElement.matches('.profile-evidence-footer a')"),'Keyboard users can reach the visible original source');
      await screenshot(`atlas-claim-${profile.id.split(':')[0]}-${width}.png`);
      await press('Escape','Escape',27);
      await until(()=>evaluate(`!document.querySelector('.profile-evidence-panel[data-open]')&&document.activeElement.matches(${JSON.stringify(profile.trigger)})`),'Evidence returns focus to its exact trigger');
    }
  }
  await navigate('/entity.html?id=person%3Aphoebe-pincus--startmate',"document.querySelector('#entity-profile')?.getAttribute('aria-busy')==='false'");
  assert.equal(await evaluate("document.querySelector('#entity-employment h2')?.textContent"),'Employment roles','The people dossier uses a top-level section heading for employment');
  for (const [width,height] of [[1440,900],[320,640]]) {
    await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<700});
    for (const [id,key] of [['startup:airwallex','co-headquarters'],['startup:t-0','business-base']]) {
      const fact=graph.entities.find(item=>item.id===id).profile_facts.find(item=>item.key===key);
      const action=`#entity-company button[aria-label="Sources for ${fact.label}"]`;
      await navigate('/entity.html?id='+encodeURIComponent(id),"document.querySelector('#entity-profile')?.getAttribute('aria-busy')==='false'");
      await click(action);
      await until(()=>evaluate("!!document.querySelector('.profile-evidence-panel[data-open]')"),`The location evidence for ${id} must open`);
      assert.equal(await evaluate("document.querySelector('.profile-evidence-value').textContent"),fact.value);
      assert.equal(await evaluate("document.querySelector('.profile-evidence-citations a').href"),fact.source);
      assert.ok(await evaluate(`[...document.querySelectorAll('.profile-evidence-citations time')].some(time=>time.dateTime===${JSON.stringify(fact.reviewed_at)})`),'Location evidence includes its review date');
      await assertNoOverflow(`${id} location evidence at ${width}px`);
      await click('#profile-evidence-close');
    }
  }
  await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1050,deviceScaleFactor:1,mobile:false});
  console.log('Profile wireframe checks passed: ordered dossier, exact desktop and mobile claim evidence, focus and reading position, sourced partner inspection, and narrow reading order.');
}
