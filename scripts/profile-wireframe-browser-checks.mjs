import assert from 'node:assert/strict';

// Exercises the working dossiers against the hierarchy in studies 04 and 05.
export async function checkProfileWireframes({command, evaluate, navigate, until, click, press, screenshot, assertNoOverflow, partners, graph}) {
  await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1050,deviceScaleFactor:1,mobile:false});
  await navigate('/entity.html?id=startup%3Acanva',"document.querySelector('#entity-profile')?.getAttribute('aria-busy')==='false'&&document.querySelector('h1')?.textContent==='Canva'");
  const dossier = await evaluate(`(()=>{
    const main=document.querySelector('.entity-dossier').getBoundingClientRect();
    const evidence=document.querySelector('.entity-aside').getBoundingClientRect();
    const facts=document.querySelector('#entity-company').getBoundingClientRect();
    const funding=document.querySelector('#entity-funding').getBoundingClientRect();
    return {beside:evidence.left>=main.right,aligned:Math.abs(evidence.top-main.top)<2,overview:funding.left>=facts.right,sourceCount:document.querySelectorAll('#entity-company .entity-fact-source a').length};
  })()`);
  assert.ok(dossier.beside&&dossier.aligned,'Startup evidence should align beside the complete dossier, including its identity');
  assert.ok(dossier.overview,'Company facts and the real funding chronology should share the wide overview');
  assert.ok(dossier.sourceCount>0,'The compact facts retain their individual sources');
  await assertNoOverflow('Wireframe startup dossier desktop');
  await screenshot('atlas-wireframe-startup-desktop.png');

  await navigate('/partner.html?name=Airtree',"document.querySelector('#profile')?.getAttribute('aria-busy')==='false'&&!!document.querySelector('#partner-company-detail')");
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
  assert.ok(await evaluate("document.querySelector('#partner-company-detail .atlas-button').getBoundingClientRect().width>0"));
  await assertNoOverflow('Wireframe partner explorer narrow');
  await screenshot('atlas-wireframe-partner-mobile.png',true);
  await navigate('/entity.html?id=startup%3Acanva',"document.querySelector('#entity-profile')?.getAttribute('aria-busy')==='false'&&document.querySelector('h1')?.textContent==='Canva'");
  assert.ok(await evaluate("document.querySelector('.entity-aside').getBoundingClientRect().top>=document.querySelector('.entity-dossier').getBoundingClientRect().bottom"),'Narrow evidence follows the complete dossier in document flow');
  await assertNoOverflow('Wireframe startup dossier narrow');
  await screenshot('atlas-wireframe-startup-mobile.png',true);

  for(const kind of ['person','programme','provider']) {
    const entity=graph.entities.find(item=>item.kind===kind);
    if(!entity)continue;
    await navigate('/entity.html?id='+encodeURIComponent(entity.id),"document.querySelector('#entity-profile')?.getAttribute('aria-busy')==='false'");
    assert.equal(await evaluate("document.querySelector('#entity-profile h1')?.textContent"),entity.name);
    assert.equal(await evaluate("document.querySelectorAll('#entity-founders,#entity-company,#entity-funding').length"),0,`${kind} must not acquire invented company/funding sections`);
    await assertNoOverflow(`Wireframe ${kind} dossier narrow`);
  }
  await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1050,deviceScaleFactor:1,mobile:false});
  console.log('Profile wireframe checks passed: aligned startup evidence, sourced facts/funding, native partner company inspection, original destinations, narrow reading order and generic entity types.');
}
