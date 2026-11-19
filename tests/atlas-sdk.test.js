import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { setupAtlasDOM, settleAtlasDOM } from './support/atlas-sdk-dom.js';

const dom = setupAtlasDOM();
const { installAtlasSDK, atlasUIAgent } = await import('../web/atlas-sdk.js');
const pages = new Map();
for (const name of ['index', 'treemap']) {
  const source = await readFile(new URL(`../web/${name}.html`, import.meta.url), 'utf8');
  const parsed = new window.DOMParser().parseFromString(source, 'text/html');
  pages.set(name, parsed.body.innerHTML);
}
let installation;

async function mountPage(name, { loading = false } = {}) {
  installation?.destroy();
  document.body.innerHTML = pages.get(name);
  installation = installAtlasSDK(document);
  await settleAtlasDOM();
  if (name === 'treemap' && !loading) await enableTreemapControls();
  return document;
}

async function enableTreemapControls() {
  const controls = document.querySelector('#treemap-controls');
  document.querySelector('#treemap-presentation').removeAttribute('disabled');
  controls.querySelectorAll('input,select,button').forEach(control => { control.disabled = false; });
  controls.setAttribute('aria-busy', 'false');
  document.dispatchEvent(new Event('atlas:controls-sync'));
  await settleAtlasDOM();
}

function visibleComponents() {
  return atlasUIAgent.snapshot().filter(entry => !entry.offPage && entry.component !== 'more');
}

function assertNamedComponents(required) {
  const components = visibleComponents();
  assert.ok(components.length > 0, 'The real page must expose SDK controls');
  for (const entry of components) assert.ok(entry.label, `${entry.component} ${entry.ref} needs a name`);
  for (const label of required) assert.ok(components.some(entry => entry.label === label), `${label} is absent from the SDK snapshot: ${JSON.stringify(components)}`);
  return components;
}

beforeEach(async () => { await mountPage('index'); });
after(() => { installation?.destroy(); dom.window.close(); });

test('SDK search changes preserve the native input contract exactly once', async () => {
  const input = document.querySelector('#search');
  const wrapper = input.closest('ui-input');
  const observed = [];
  input.addEventListener('input', () => observed.push(input.value));
  assertNamedComponents(['Search the directory', 'Entity type', 'Directory view']);
  const result = await atlasUIAgent.act({ steps: [{ ref: 'Search the directory', action: 'setValue', args: ['Canva'] }] });
  assert.equal(result.ok, true, result.error?.message);
  await settleAtlasDOM();
  assert.equal(input.value, 'Canva');
  assert.equal(wrapper.value, 'Canva');
  assert.deepEqual(observed, ['Canva']);
  input.value = 'Airwallex';
  input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: 'Airwallex' }));
  await settleAtlasDOM();
  assert.equal(wrapper.value, 'Airwallex');
  assert.deepEqual(observed, ['Canva', 'Airwallex']);
});

test('SDK clear restores search focus and emits one empty native value', async () => {
  const input = document.querySelector('#search');
  const clear = document.querySelector('#clear-search');
  input.closest('ui-input').api.setValue('Canva');
  await settleAtlasDOM();
  assert.equal(clear.hidden, false, 'Clear must become available when search has text');
  const values = [];
  input.addEventListener('input', () => values.push(input.value));
  clear.focus();
  clear.click();
  await settleAtlasDOM();
  assert.equal(input.value, '');
  assert.deepEqual(values, ['']);
  assert.equal(document.activeElement, input);
  assert.equal(clear.closest('ui-input-clear').hidden || clear.hidden, true);
});

test('SDK select discovers real choices, emits one native change and follows native resets', async () => {
  const native = document.querySelector('#entity-kind');
  const select = document.querySelector('ui-select[data-native-id="entity-kind"]');
  const events = [];
  native.addEventListener('change', () => events.push(native.value));
  const components = assertNamedComponents(['Entity type']);
  const entry = components.find(component => component.label === 'Entity type');
  const choices = entry.items;
  assert.ok(Array.isArray(choices), JSON.stringify(choices));
  const startup = choices.find(item => item.label === 'Startups');
  assert.ok(startup, 'Startups must be discoverable from the actual SDK list');
  const result = await atlasUIAgent.act({ steps: [{ ref: 'Entity type', action: 'setValue', args: [startup.label] }] });
  assert.equal(result.ok, true, result.error?.message);
  await settleAtlasDOM();
  assert.equal(native.value, 'startup');
  assert.equal(select.value, 'startup');
  assert.deepEqual(events, ['startup']);
  native.value = 'all';
  document.dispatchEvent(new Event('atlas:controls-sync'));
  await settleAtlasDOM();
  assert.equal(select.value, 'all');
  assert.equal(select.dataset.active, 'false');
  assert.deepEqual(events, ['startup'], 'Programmatic back-sync must not replay a user change');
});

test('SDK enhancement is idempotent and exposes a dynamic action through one existing click handler', async () => {
  const first = installAtlasSDK(document);
  assert.equal(installAtlasSDK(document), first);
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Inspect Canary Labs';
  let clicks = 0;
  button.addEventListener('click', () => { clicks++; });
  document.querySelector('#results-list').replaceChildren(button);
  await settleAtlasDOM();
  first.sync();
  first.sync();
  await settleAtlasDOM();
  assert.equal(document.querySelectorAll('ui-button ui-button').length, 0);
  assert.equal(document.querySelectorAll('ui-input ui-input').length, 0);
  assert.equal(document.querySelectorAll('ui-select[data-native-id="entity-kind"]').length, 1);
  assert.equal(button.parentElement.localName, 'ui-button');
  assertNamedComponents(['Inspect Canary Labs']);
  const result = await atlasUIAgent.act({ steps: [{ ref: 'Inspect Canary Labs', action: 'press' }] });
  assert.equal(result.ok, true, result.error?.message);
  assert.equal(clicks, 1, 'Agent presses must run the existing native action exactly once');
  button.click();
  assert.equal(clicks, 2, 'Human clicks must not be replayed by the SDK bridge');
});

test('SDK select preserves disabled choices and native disabled controls', async () => {
  await mountPage('treemap');
  assertNamedComponents(['Size by', 'Currency', 'Group by', 'Find a company', 'Presentation', 'Reset', 'Share view']);
  const native = document.querySelector('#treemap-metric');
  const select = document.querySelector('ui-select[data-native-id="treemap-metric"]');
  const disabled = select.querySelector('ui-select-item[value="market-cap"]');
  assert.equal(disabled.hasAttribute('disabled'), true);
  const rejected = await atlasUIAgent.act({ steps: [{ ref: 'Size by', action: 'setValue', args: ['Market cap (not recorded)'] }] });
  await settleAtlasDOM();
  assert.equal(native.value, 'valuation');
  assert.equal(select.value, 'valuation');
  assert.equal(rejected.ok, false, 'An agent must not choose a disabled option');
  native.disabled = true;
  await settleAtlasDOM();
  assert.equal(select.disabled, true);
  assert.equal(document.querySelector('#treemap-metric-trigger').disabled, true);
  native.disabled = false;
  await settleAtlasDOM();
  assert.equal(select.disabled, false);
  assert.equal(document.querySelector('#treemap-metric-trigger').hasAttribute('aria-disabled'), false);
  assert.equal(document.querySelector('#treemap-metric-trigger').disabled, false);
});


test('SDK observes directory facet metadata and native options added after enhancement', async () => {
  const native = document.querySelector('#country');
  const select = document.querySelector('ui-select[data-native-id="country"]');
  native.append(new window.Option('Germany', 'DE'));
  Object.assign(native.dataset, { atlasFacet: 'country', atlasIcon: 'location', atlasLabel: 'Market' });
  document.dispatchEvent(new Event('atlas:controls-sync'));
  await settleAtlasDOM();
  assertNamedComponents(['Market']);
  assert.equal(select.dataset.facet, 'country');
  assert.equal(select.querySelectorAll('.facet-trigger .facet-icon').length, 1);
  const query = await atlasUIAgent.query({ within: 'Market', text: 'Germany' });
  assert.ok(Array.isArray(query), JSON.stringify(query));
  const choice = query.flatMap(entry => entry.items || []).find(item => item.label === 'Germany');
  assert.ok(choice, 'The agent must discover options added after enhancement');
  const result = await atlasUIAgent.act({ steps: [{ ref: 'Market', action: 'setValue', args: [choice.label] }] });
  assert.equal(result.ok, true, result.error?.message);
  assert.equal(native.value, 'DE');
  assert.equal(select.value, 'DE');
  installation.sync();
  installation.sync();
  assert.equal(select.querySelectorAll('.facet-trigger .facet-icon').length, 1);
});

test('SDK keeps an existing disabled native action disabled across enhancement and updates', async () => {
  const button = document.querySelector('#reset-filters');
  button.disabled = true;
  await settleAtlasDOM();
  assert.equal(button.disabled, true);
  assert.equal(button.closest('ui-button').disabled, true);
  let clicks = 0;
  button.addEventListener('click', () => { clicks++; });
  const disabled = await atlasUIAgent.act({ steps: [{ ref: 'Reset', action: 'press' }] });
  assert.equal(disabled.ok, false);
  assert.equal(clicks, 0);
  button.disabled = false;
  await settleAtlasDOM();
  const enabled = await atlasUIAgent.act({ steps: [{ ref: 'Reset', action: 'press' }] });
  assert.equal(enabled.ok, true, enabled.error?.message);
  assert.equal(clicks, 1);
  assert.equal(button.hasAttribute('aria-disabled'), false);
});

test('SDK finds both real presentation controls and changes values using their published choices', async () => {
  let components = assertNamedComponents(['Directory view']);
  let entry = components.find(component => component.label === 'Directory view');
  let choice = entry.items.find(item => item.value === 'partners');
  assert.ok(choice);
  let result = await atlasUIAgent.act({ steps: [{ ref: 'Directory view', action: 'setValue', args: [choice.label] }] });
  assert.equal(result.ok, true, result.error?.message);
  assert.equal(document.querySelector('#directory-scope').value, choice.value);
  assert.equal(document.querySelector('#tab-partners').getAttribute('aria-checked'), 'true');
  assert.equal(document.querySelectorAll('.mode-switch button[tabindex="0"]').length, 1);
  await mountPage('treemap');
  components = assertNamedComponents(['Presentation', 'Find a company']);
  entry = components.find(component => component.label === 'Presentation');
  choice = entry.items.find(item => item.label === 'Ranked list');
  assert.ok(choice);
  result = await atlasUIAgent.act({ steps: [{ ref: 'Presentation', action: 'setValue', args: [choice.label] }] });
  assert.equal(result.ok, true, result.error?.message);
  assert.equal(document.querySelector('#treemap-presentation').value, choice.value);
  assert.equal(document.querySelector('#show-list').getAttribute('aria-checked'), 'true');
});


test('both directory checkboxes keep click, Space, agent changes and reset in one native state', async () => {
  const controls = [
    ['include-unknown', 'Include locations to verify'],
    ['partner-logo', 'Logo available'],
  ];
  assertNamedComponents(controls.map(([, label]) => label));
  for (const [id, label] of controls) {
    const native = document.getElementById(id);
    const checkbox = document.getElementById(id + '-control');
    const changes = [];
    native.addEventListener('change', () => changes.push(native.checked));
    assert.equal(native.hidden, true);
    assert.equal(native.closest('label'), null, 'The hidden native control must not receive a second label activation');
    checkbox.click();
    await settleAtlasDOM();
    assert.equal(native.checked, true);
    assert.equal(checkbox.checked, true);
    assert.deepEqual(changes, [true]);
    checkbox.focus();
    checkbox.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', keyCode: 32, bubbles: true, cancelable: true }));
    checkbox.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', code: 'Space', keyCode: 32, bubbles: true, cancelable: true }));
    await settleAtlasDOM();
    assert.equal(native.checked, false);
    assert.equal(checkbox.getAttribute('aria-checked'), 'false');
    assert.deepEqual(changes, [true, false]);
    const result = await atlasUIAgent.act({ steps: [{ ref: label, action: 'setChecked', args: [true] }] });
    assert.equal(result.ok, true, result.error?.message);
    await settleAtlasDOM();
    assert.equal(native.checked, true);
    assert.deepEqual(changes, [true, false, true]);
    native.checked = false;
    document.dispatchEvent(new Event('atlas:controls-sync'));
    await settleAtlasDOM();
    assert.equal(checkbox.checked, false);
    assert.deepEqual(changes, [true, false, true], 'Back-sync must not replay a checkbox change');
    native.disabled = true;
    await settleAtlasDOM();
    assert.equal(checkbox.disabled, true);
    const denied = await atlasUIAgent.act({ steps: [{ ref: label, action: 'setChecked', args: [true] }] });
    assert.equal(denied.ok, false);
    assert.equal(native.checked, false);
    native.disabled = false;
    await settleAtlasDOM();
    assert.equal(checkbox.disabled, false);
    assert.equal(checkbox.hasAttribute('aria-disabled'), false);
  }
});


test('treemap loading preserves every disabled native and SDK control until data is ready', async () => {
  await mountPage('treemap', { loading: true });
  const controls = document.querySelector('#treemap-controls');
  const input = document.querySelector('#treemap-query');
  const metric = document.querySelector('#treemap-metric');
  const presentation = document.querySelector('#treemap-presentation');
  const reset = document.querySelector('#treemap-reset');
  const share = document.querySelector('#treemap-share');
  assert.equal(controls.getAttribute('aria-busy'), 'true');
  for (const control of controls.querySelectorAll('input,select,button')) {
    assert.equal(control.disabled, true, `${control.id || control.getAttribute('aria-label')} must stay disabled after SDK enhancement`);
  }
  for (const select of controls.querySelectorAll('ui-select')) assert.equal(select.disabled, true);
  assert.equal(presentation.disabled, true);
  assert.equal(reset.closest('ui-button').disabled, true);
  assert.equal(share.closest('ui-button').disabled, true);
  const counts = { input: 0, metric: 0, presentation: 0, reset: 0, share: 0 };
  input.addEventListener('input', () => { counts.input++; });
  metric.addEventListener('change', () => { counts.metric++; });
  presentation.addEventListener('valuechange', () => { counts.presentation++; });
  reset.addEventListener('click', () => { counts.reset++; });
  share.addEventListener('click', () => { counts.share++; });
  for (const step of [
    { ref: 'Find a company', action: 'setValue', args: ['Canva'] },
    { ref: 'Size by', action: 'setValue', args: ['Company count'] },
    { ref: 'Presentation', action: 'setValue', args: ['Ranked list'] },
    { ref: 'Reset', action: 'press' },
    { ref: 'Share view', action: 'press' },
  ]) {
    const result = await atlasUIAgent.act({ steps: [step] });
    assert.equal(result.ok, false, `${step.ref} must reject agent interaction while loading`);
  }
  assert.deepEqual(counts, { input: 0, metric: 0, presentation: 0, reset: 0, share: 0 });
  assert.equal(input.value, '');
  assert.equal(metric.value, 'valuation');
  assert.equal(presentation.value, 'map');
  await enableTreemapControls();
  for (const control of controls.querySelectorAll('input,select,button')) {
    assert.equal(control.disabled, false, `${control.id || control.getAttribute('aria-label')} must enable after loading`);
  }
  assert.equal(metric.querySelector('option[value="market-cap"]').disabled, true, 'Loading must not enable an unavailable metric');
  assert.equal(document.querySelector('ui-select-item[value="market-cap"]').hasAttribute('disabled'), true);
  const result = await atlasUIAgent.act({ steps: [
    { ref: 'Find a company', action: 'setValue', args: ['Canva'] },
    { ref: 'Size by', action: 'setValue', args: ['Company count'] },
    { ref: 'Presentation', action: 'setValue', args: ['Ranked list'] },
    { ref: 'Reset', action: 'press' },
    { ref: 'Share view', action: 'press' },
  ] });
  assert.equal(result.ok, true, result.error?.message);
  await settleAtlasDOM();
  assert.deepEqual(counts, { input: 1, metric: 1, presentation: 1, reset: 1, share: 1 });
  assert.equal(input.value, 'Canva');
  assert.equal(metric.value, 'companies');
  assert.equal(presentation.value, 'list');
});
