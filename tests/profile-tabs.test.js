import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { installProfileTabs, tabIndexForHash, tabIndexForKey } from '../web/profile-tabs.js';

test('hash selects the matching panel and nothing else', () => {
  const ids = ['entity-company', 'entity-founders', 'entity-funding'];
  assert.equal(tabIndexForHash(ids, '#entity-funding'), 2);
  assert.equal(tabIndexForHash(ids, '#entity-company'), 0);
  assert.equal(tabIndexForHash(ids, '#entity-sources'), -1);
  assert.equal(tabIndexForHash(ids, ''), -1);
  assert.equal(tabIndexForHash(ids, null), -1);
});

test('tab keys follow the ARIA pattern with wrap-around', () => {
  assert.equal(tabIndexForKey(0, 'ArrowRight', 3), 1);
  assert.equal(tabIndexForKey(2, 'ArrowRight', 3), 0);
  assert.equal(tabIndexForKey(0, 'ArrowLeft', 3), 2);
  assert.equal(tabIndexForKey(1, 'ArrowDown', 3), 2);
  assert.equal(tabIndexForKey(1, 'ArrowUp', 3), 0);
  assert.equal(tabIndexForKey(2, 'Home', 3), 0);
  assert.equal(tabIndexForKey(0, 'End', 3), 2);
  assert.equal(tabIndexForKey(1, 'Enter', 3), -1);
  assert.equal(tabIndexForKey(0, 'ArrowRight', 0), -1);
});

const fixture = `<!doctype html><body><main id="profile">
  <nav class="atlas-section-nav" role="tablist" aria-label="Profile sections">
    <a role="tab" id="tab-one" href="#one" aria-controls="one" aria-selected="true" tabindex="0">One</a>
    <a role="tab" id="tab-two" href="#two" aria-controls="two" aria-selected="false" tabindex="-1">Two</a>
    <a role="tab" id="tab-three" href="#three" aria-controls="three" aria-selected="false" tabindex="-1">Three</a>
  </nav>
  <section id="one"><p>First</p><a href="#two" id="jump-two">View two</a> <a href="#sources" id="jump-sources">Sources</a></section>
  <section id="two"><p>Second</p></section>
  <section id="three"><p>Third</p><span id="deep-target">Deep</span></section>
  <details id="sources-details"><summary>Sources</summary><section id="sources">All sources</section></details>
</main></body>`;

function install(hash = '') {
  const dom = new JSDOM(fixture, { url: 'http://localhost/entity.html' });
  const { window } = dom;
  window.Element.prototype.scrollIntoView = () => {};
  const scope = window.document.getElementById('profile');
  for (const id of ['one', 'two', 'three']) {
    const panel = window.document.getElementById(id);
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', `tab-${id}`);
  }
  const location = { hash };
  const history = { replaceState: (_state, _title, url) => { location.hash = url; } };
  const api = installProfileTabs(scope, { history, location });
  return { dom, window, scope, api, location };
}

const visiblePanels = scope => [...scope.querySelectorAll('[role="tabpanel"]')].filter(panel => !panel.hidden).map(panel => panel.id);

test('installer shows one panel, deep-links from the hash, and syncs selection', () => {
  const { scope, api, location } = install('#two');
  assert.deepEqual(visiblePanels(scope), ['two']);
  assert.equal(scope.querySelector('#tab-two').getAttribute('aria-selected'), 'true');
  assert.equal(scope.querySelector('#tab-one').tabIndex, -1);

  scope.querySelector('#tab-three').click();
  assert.deepEqual(visiblePanels(scope), ['three']);
  assert.equal(api.activeIndex, 2);
  assert.equal(location.hash, '#three');
});

test('arrow keys move selection and focus between tabs', () => {
  const { window, scope } = install();
  const first = scope.querySelector('#tab-one');
  first.focus();
  first.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  assert.equal(window.document.activeElement.id, 'tab-two');
  assert.deepEqual(visiblePanels(scope), ['two']);
  scope.querySelector('#tab-two').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
  assert.equal(window.document.activeElement.id, 'tab-one');
  assert.deepEqual(visiblePanels(scope), ['one']);
});

test('in-page jump links activate the target panel and open the sources footer', () => {
  const { scope } = install();
  scope.querySelector('#jump-two').click();
  assert.deepEqual(visiblePanels(scope), ['two']);

  scope.querySelector('#jump-sources').click();
  assert.equal(scope.querySelector('#sources-details').open, true);
  // Sources is back-matter, not a tab: the visible panel is unchanged.
  assert.deepEqual(visiblePanels(scope), ['two']);
});
