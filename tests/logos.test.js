import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { logoFor, logoEntries } from '../web/logos.js';
import { filterLeads } from '../web/logic.js';

test('reviewed company logos are local assets and ambiguous names use the fallback', async () => {
  assert.equal(logoFor('OpenAI'),'./assets/logos/openai.svg');
  assert.equal(logoFor('AIR'),null);
  assert.equal(logoFor('toString'),null);
  for (const [name] of logoEntries) {
    const path=logoFor(name);
    const bytes=await readFile(new URL(`../web/${path.slice(2)}`,import.meta.url));
    if (path.endsWith('.png')) {
      assert.deepEqual([...bytes.subarray(0,8)],[137,80,78,71,13,10,26,10],`${name} is a PNG`);
    } else {
      const svg=bytes.toString('utf8');
      assert.match(svg,/<svg\b/);
      assert.doesNotMatch(svg,/<(?:script|foreignObject)\b|\son[a-z]+\s*=/i);
    }
  }
});
test('reviewed partner descriptions are searchable without changing other leads',()=>{
  const records={'Acrew':{description:'early stage technology investor',website:'https://example.com'}};
  assert.deepEqual(filterLeads(['Acrew','AIR'],{query:'technology investor'},records),['Acrew']);
  assert.deepEqual(filterLeads(['Acrew','AIR'],{query:'AIR'},records),['AIR']);
});

test('initial partner results include reviewed logo mappings',()=>{
  assert.equal(logoFor('8VC'),'./assets/logos/8vc.svg');
  assert.equal(logoFor('a16z'),'./assets/logos/a16z.png');
  assert.equal(logoFor('Accel'),'./assets/logos/accel.svg');
  assert.equal(logoFor('Blackbird Ventures'),'./assets/logos/blackbird-ventures.svg');
});
