import test from 'node:test';
import assert from 'node:assert/strict';
import { safeAtlasReturn, renderEntityRow, renderAtlasMasthead, installAtlasUI } from '../web/atlas-ui.js';

test('profile return context stays in the current Atlas deployment', () => {
  const base='https://example.test/startup-atlas/entity.html?id=startup%3Acanva';
  assert.equal(safeAtlasReturn('./?q=canva&shown=24#directory',base),'/startup-atlas/?q=canva&shown=24#directory');
  assert.equal(safeAtlasReturn('./graph.html?entity=startup%3Acanva&selected=person%3Amelanie-perkins',base),'/startup-atlas/graph.html?entity=startup%3Acanva&selected=person%3Amelanie-perkins');
  assert.equal(safeAtlasReturn('./design-lab.html?view=startup&concept=startup#gallery',base),'/startup-atlas/design-lab.html?view=startup&concept=startup#gallery');
  for(const value of ['https://unrelated.test/graph.html','//unrelated.test/graph.html','javascript:alert(1)','/other/entity.html','../graph.html','./data/graph.json','./subfolder/entity.html'])assert.equal(safeAtlasReturn(value,base),null,value);
});

test('shared entity rows escape untrusted labels and do not treat missing sources as verified', () => {
  const html=renderEntityRow({id:'startup:test',kind:'startup',name:'<script>bad</script>',summary:'A & B',source:'javascript:alert(1)'},0);
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('javascript:'));
  assert.match(html,/&lt;script&gt;bad&lt;\/script&gt;/);
  assert.match(html,/A &amp; B/);
  assert.match(html,/Source not recorded/);
  assert.match(html,/0 recorded connections/);
  assert.match(html,/data-kind="startup"/);
});

test('wireframe masthead keeps one active real route and all navigation destinations', () => {
  for (const active of ['directory','treemap','graph']) {
    const html=renderAtlasMasthead(active);
    assert.equal((html.match(/aria-current="page"/g)||[]).length,1);
    assert.match(html,new RegExp(`data-atlas-view="${active}"[^>]+aria-current="page"`));
    assert.match(html,/aria-label="Startup Atlas home"/);
    assert.match(html,/href="\.\/design-system.html"/);
    assert.doesNotMatch(html,/role="tab/);
  }
  assert.doesNotMatch(renderAtlasMasthead(''),/aria-current/);
});

test('row inspection is an explicit escaped action independent from profile navigation', () => {
  const item={id:'startup:a"b',kind:'startup',name:'A & <B>',summary:'Recorded company'};
  const html=renderEntityRow(item,2,{inspectable:true,selected:true});
  assert.match(html,/data-entity-id="startup:a&quot;b" data-selected="true"/);
  assert.match(html,/data-inspect-entity="startup:a&quot;b" aria-pressed="true" aria-label="Inspect A &amp; &lt;B&gt;"/);
  assert.match(html,/href="\.\/entity.html\?id=startup%3Aa%22b"/);
  assert.doesNotMatch(renderEntityRow(item,2),/data-inspect-entity/);
});

test('profile section navigation preserves the originating search return', async t => {
  const globals = ['location', 'window', 'MutationObserver', 'sessionStorage'];
  const originals = new Map(globals.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  t.after(() => {
    for (const name of globals) {
      const original = originals.get(name);
      if (original) Object.defineProperty(globalThis, name, original);
      else delete globalThis[name];
    }
  });

  for (const fixture of [
    {route:'entity.html?id=startup%3Acanva', title:'Canva', section:'entity-founders'},
    {route:'partner.html?name=Airtree', title:'Airtree', section:'partner-companies'}
  ]) {
    const location = new URL('https://example.test/startup-atlas/' + fixture.route);
    const storage = new Map(), events = new Map();
    const returnKey = 'atlas:return:' + location.pathname + location.search;
    const originalReturn = {href:'/startup-atlas/?q=canva&shown=24#directory', label:'Back to search results'};
    storage.set(returnKey, JSON.stringify(originalReturn));
    const backLink = {
      href:'./graph.html', textContent:'Back to graph',
      getAttribute(name) { return this[name]; },
      setAttribute(name, value) { this[name] = value; }
    };
    const doc = {
      title:fixture.title + ' — Startup Atlas', body:{classList:{add() {}}},
      querySelectorAll(selector) { return selector === '[data-atlas-back]' ? [backLink] : []; },
      getElementById() { return null; },
      addEventListener(name, callback) { events.set('document:' + name, callback); }
    };
    const environment = {
      location,
      window:{addEventListener(name, callback) { events.set('window:' + name, callback); }},
      MutationObserver:class { observe() {} },
      sessionStorage:{getItem:key => storage.get(key) ?? null, setItem:(key, value) => storage.set(key, value)}
    };
    for (const [name, value] of Object.entries(environment)) Object.defineProperty(globalThis, name, {configurable:true, writable:true, value});
    installAtlasUI(doc);
    const clickLink = href => {
      const link = {href, hasAttribute() { return false; }};
      events.get('document:click')({target:{closest:selector => selector === 'a[href]' ? link : null}});
    };

    clickLink(location.href + '#' + fixture.section);
    events.get('window:pageshow')();
    await Promise.resolve();
    assert.deepEqual(JSON.parse(storage.get(returnKey)), originalReturn, fixture.route);
    assert.equal(backLink.href, originalReturn.href);
    assert.equal(backLink.textContent, originalReturn.label);

    // A real transition still records the profile as the next entity's origin.
    const related = new URL('./entity.html?id=person%3Amelanie-perkins', location);
    clickLink(related.href);
    assert.deepEqual(JSON.parse(storage.get('atlas:return:' + related.pathname + related.search)), {
      href:location.pathname + location.search,
      label:'Back to ' + fixture.title
    });
  }
});
