import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../web/design-aesthetic.html',import.meta.url),'utf8');
const doc=readFileSync(new URL('../docs/SIGNAL-COMPONENTS.md',import.meta.url),'utf8');
test('Signal field guide is reachable, named and distinguishes concepts from runtime',()=>{
 assert.match(html,/href="#component-field-guide"/);
 assert.match(html,/id="component-field-guide"[^>]+aria-labelledby="signal-field-guide-title"/);
 assert.match(html,/id="signal-field-guide-title"/);
 assert.match(html,/concepts, not screenshots of implemented features/);
 const guide=html.split('id="component-field-guide"')[1].split('<section id="graphics"')[0];
 assert.equal((guide.match(/<article /g)||[]).length,3);
 for(const href of ['#controls','./design-system.html','#applications','./docs/SIGNAL-COMPONENTS.md#recovered-board-interpretation'])assert.ok(guide.includes(`href="${href}"`));
 assert.doesNotMatch(guide,/<button|onclick=|<input/);
});
test('Recovered interpretation preserves integration and evidence boundaries',()=>{
 assert.match(doc,/New implementation/);
 assert.match(doc,/not an installed dependency/);
 assert.match(doc,/Original generation prompts were unavailable/);
 assert.match(doc,/fictional sample records/);
 assert.match(doc,/Reduced motion retains information/);
});
