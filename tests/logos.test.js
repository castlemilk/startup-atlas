import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { logoFor, logoEntries } from '../logos.js';
import { filterLeads } from '../logic.js';

test('reviewed company logos are local assets and ambiguous names use the fallback', async () => {
  assert.equal(logoFor('OpenAI'),'./assets/logos/openai.svg');
  assert.equal(logoFor('AIR'),null);
  assert.equal(logoFor('toString'),null);
  for (const [name] of logoEntries) {
    const path=logoFor(name);
    const svg=await readFile(new URL(`../${path.slice(2)}`,import.meta.url),'utf8');
    assert.match(svg,/<svg\b/);
    assert.doesNotMatch(svg,/<(?:script|foreignObject)\b|\son[a-z]+\s*=/i);
  }
});
test('reviewed partner descriptions are searchable without changing other leads',()=>{
  const records={'Acrew':{description:'early stage technology investor',website:'https://example.com'}};
  assert.deepEqual(filterLeads(['Acrew','AIR'],{query:'technology investor'},records),['Acrew']);
  assert.deepEqual(filterLeads(['Acrew','AIR'],{query:'AIR'},records),['AIR']);
});
