// Exercise the built explorer's static-host fallback and its user-visible output.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const snapshot = JSON.parse(await readFile(new URL('../dist/data/graph.json', import.meta.url), 'utf8'));
const elements = new Map();
for (const id of ['graph-search', 'graph-query', 'graph-results', 'graph-detail', 'result-count']) {
  elements.set(id, {
    textContent: '', innerHTML: '', value: '', handlers: {},
    addEventListener(event, callback) { this.handlers[event] = callback; },
  });
}
globalThis.document = { getElementById: id => elements.get(id) };
globalThis.location = { search: '?startup=startup%3Acanva', href: '' };
let selectedUrl;
globalThis.history = { replaceState(_state, _title, url) { selectedUrl = url; } };
let failRpc = false;
globalThis.fetch = async url => {
  if (String(url).startsWith('./api/graph')) return new Response('', { status: failRpc ? 500 : 404 });
  if (url === './data/graph.json') return Response.json(snapshot);
  throw new Error(`Unexpected request: ${url}`);
};

async function until(predicate) {
  for (let i = 0; i < 100; i++) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.fail('Explorer did not update');
}

await import('../dist/graph.js');
await until(() => elements.get('graph-detail').innerHTML.includes('<h2>Canva</h2>'));
assert.match(elements.get('graph-detail').innerHTML, /Melanie Perkins/);
assert.match(elements.get('graph-detail').innerHTML, /200,000,000/);
assert.match(selectedUrl, /startup%3Acanva/);
await until(() => elements.get('result-count').textContent.endsWith('results'));
elements.get('graph-query').value = 'Airwallex';
elements.get('graph-search').handlers.submit({ preventDefault() {} });
await until(() => elements.get('result-count').textContent === '1 result');
assert.match(elements.get('graph-results').innerHTML, /Airwallex/);
elements.get('graph-results').handlers.click({ target: { closest() {
  return { dataset: { kind: 'startup', id: 'startup:airwallex', name: 'Airwallex' } };
} } });
await until(() => elements.get('graph-detail').innerHTML.includes('<h2>Airwallex</h2>'));
const profile = elements.get('graph-detail').innerHTML;
assert.ok(profile.indexOf('Series H') < profile.indexOf('Series F'));
failRpc = true;
elements.get('graph-query').value = 'an unavailable query';
elements.get('graph-search').handlers.submit({ preventDefault() {} });
await until(() => elements.get('graph-results').innerHTML.includes('could not be loaded'));
console.log('Graph explorer smoke test passed');
