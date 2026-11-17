import assert from 'node:assert/strict';

/** Loading another batch should continue reading at its first native profile link. */
export async function checkDirectoryPagination({command,evaluate,navigate,until,click,press,screenshot,assertNoOverflow,graph}) {
  const rows='#results-list > article';
  const ready="document.body.dataset.atlasSdk==='ready'&&document.querySelector('#results-list')?.getAttribute('aria-busy')==='false'&&!!document.querySelector('#results-list > article')";
  const count=()=>evaluate(`document.querySelectorAll(${JSON.stringify(rows)}).length`);
  const viewport=(width)=>command('Emulation.setDeviceMetricsOverride',{width,height:width===1440?1050:844,deviceScaleFactor:1,mobile:width<900});
  async function loadMore({keyboard=false}={}) {
    const before=await count();
    const total=await evaluate("parseInt(document.querySelector('#result-count').textContent,10)");
    assert.ok(total>before,'The fixture must have another result batch');
    const parameters=await evaluate("Object.fromEntries([...new URLSearchParams(location.search)].filter(([key])=>key!=='shown'))");
    if(keyboard) {
      await evaluate("document.querySelector('#load-more').focus()");
      await press('Enter','Enter',13);
    } else await click('#load-more');
    const expected=Math.min(before+12,total);
    await until(()=>evaluate(`document.querySelectorAll(${JSON.stringify(rows)}).length===${expected}`),'Load more did not reveal the next batch');
    const firstNew=`${rows}:nth-child(${before+1})`;
    assert.equal(await evaluate(`document.activeElement===document.querySelector(${JSON.stringify(firstNew+' h3 a[href]')})`),true,'Load more must focus the first newly revealed native profile link');
    assert.ok(await evaluate("(()=>{const r=document.activeElement.getBoundingClientRect();return r.width>0&&r.height>0&&r.top>=0&&r.bottom<=innerHeight;})()"),'The new reading position must be visible immediately');
    assert.equal(await evaluate("document.querySelector('#result-range').textContent"),`Showing ${expected} of ${total} results`);
    assert.equal(await evaluate("document.querySelector('#result-range').getAttribute('role')"),'status');
    assert.deepEqual(await evaluate("Object.fromEntries([...new URLSearchParams(location.search)].filter(([key])=>key!=='shown'))"),parameters,'Loading more must retain the current scope and filters');
    assert.equal(await evaluate("Number(new URLSearchParams(location.search).get('shown'))"),before+12);
    assert.equal(await evaluate("document.querySelector('#load-more').hidden"),expected===total,'The final batch must hide Load more without losing the new reading position');
    return firstNew;
  }

  await viewport(1440);
  await navigate('/?type=startup#directory',ready);
  assert.equal(await count(),12);
  const firstNew=await loadMore({keyboard:true});
  await assertNoOverflow('Directory continuation desktop');await screenshot('directory-load-more-desktop.png');
  await press('Tab','Tab',9);
  assert.ok(await evaluate(`document.activeElement.closest('article')===document.querySelector(${JSON.stringify(firstNew)})`),'Tab must continue through the new record instead of skipping to the footer');
  await press('Tab','Tab',9,8);
  const destination=await evaluate('({href:document.activeElement.getAttribute("href"),name:document.activeElement.textContent})');
  assert.match(destination.href,/entity\.html\?id=startup%3A/,'The new reading position retains a native company destination');
  const returnUrl=await evaluate('location.pathname+location.search+location.hash');
  await press('Enter','Enter',13);
  await until(()=>evaluate(`document.querySelector('#entity-profile')?.getAttribute('aria-busy')==='false'&&document.querySelector('#entity-profile h1')?.textContent===${JSON.stringify(destination.name)}&&document.querySelector('[data-atlas-back]')?.textContent==='Back to search results'`),'Keyboard continuation did not open the new company profile');
  await click('[data-atlas-back]');
  await until(()=>evaluate(`location.pathname+location.search+location.hash===${JSON.stringify(returnUrl)}&&document.querySelectorAll(${JSON.stringify(rows)}).length===24`),'Returning from the new profile must restore the loaded range and scope');

  // Actual fragment history causes the directory's popstate renderer to run.
  // It must not apply the explicit Load more focus handoff during restoration.
  await click('.directory-context-links a[href="#atlas"]');
  await until(()=>evaluate("location.hash==='#atlas'"),'Places navigation did not create the history entry');
  await evaluate("document.querySelector('#search').focus({preventScroll:true});history.back()");
  await until(()=>evaluate("location.hash==='#directory'"),'Back did not restore the directory fragment');
  assert.equal(await count(),24);
  assert.equal(await evaluate('document.activeElement.id'),'search','History restoration must not steal search focus for a result');
  await evaluate('history.forward()');
  await until(()=>evaluate("location.hash==='#atlas'"),'Forward did not restore the places fragment');
  assert.equal(await count(),24);
  assert.equal(await evaluate('document.activeElement.id'),'search','Forward restoration must not apply Load more focus');
  await click('#search');await command('Input.insertText',{text:'Canva'});
  await until(()=>evaluate("new URLSearchParams(location.search).get('q')==='Canva'"),'Typing did not update the directory query');
  assert.equal(await evaluate('document.activeElement.id'),'search','Filtering must keep focus in the query');
  assert.equal(await evaluate("new URLSearchParams(location.search).has('shown')"),false,'A new query must reset the displayed range');

  // One pointer and one keyboard path cover the other directory row templates.
  for(const {width,path,label,keyboard} of [
    {width:390,path:'/?view=opportunities&sort=name#directory',label:'opportunities',keyboard:false},
    {width:320,path:'/?view=partners#directory',label:'partners',keyboard:true}
  ]) {
    await viewport(width);
    await command('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
    await navigate(path,ready);
    assert.equal(await count(),12);
    await loadMore({keyboard});
    await assertNoOverflow(`Directory continuation ${label} ${width}px`);
    await screenshot(`directory-load-more-${label}-${width}.png`);
  }

  // A direct link to the last populated batch exercises the disappearing trigger.
  const total=graph.entities.filter(entity=>entity.kind==='startup').length;
  const lastBatchStart=Math.floor((total-1)/12)*12;
  assert.ok(lastBatchStart>=12,'The published startup sample must span multiple batches');
  await viewport(390);
  await navigate(`/?type=startup&shown=${lastBatchStart}#directory`,ready);
  assert.equal(await count(),lastBatchStart);
  await loadMore({keyboard:true});
  assert.equal(await count(),total);
  await assertNoOverflow('Directory final batch 390px');await screenshot('directory-load-more-final-mobile.png');
  await command('Emulation.setEmulatedMedia',{features:[]});
  await viewport(1440);
  console.log('Directory continuation passed: native reading focus, final batch, profile return, Back/Forward, query reset, three row templates and 390/320px reduced-motion layouts.');
}
