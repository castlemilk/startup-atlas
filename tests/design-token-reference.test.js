import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { tokenMetadata, tokenGroups, parseColor, relativeLuminance, contrastRatio } from '../web/design-token-reference.js';

const closeTo = (actual,expected,epsilon = 1e-12) => assert.ok(Math.abs(actual - expected) < epsilon,`${actual} should be within ${epsilon} of ${expected}`);

test('the reference covers every canonical runtime token once without owning values', async () => {
  const css = await readFile(new URL('../web/design-tokens.css',import.meta.url),'utf8');
  const canonical = [...new Set([...css.matchAll(/(--atlas-[a-z0-9-]+)\s*:/g)].map(match => match[1]))].sort();
  const referenced = tokenMetadata.map(token => token.name);
  assert.equal(new Set(referenced).size,referenced.length,'A token must not appear in more than one family.');
  assert.deepEqual([...referenced].sort(),canonical,'Adding or retiring a canonical token must update the browsable reference.');
  const groups = new Set(tokenGroups.map(group => group.id));
  for (const token of tokenMetadata) {
    assert.ok(groups.has(token.group),`${token.name} belongs to a published family.`);
    assert.ok(token.label.trim() && token.usage.trim(),`${token.name} needs a readable role and usage.`);
    assert.equal(Object.hasOwn(token,'value'),false,`${token.name} must read its value from canonical CSS.`);
    assert.equal(Object.hasOwn(token,'defaultValue'),false,`${token.name} must not carry a copied fallback value.`);
    assert.ok(!Object.values(token).some(value => /^#[\da-f]{3,8}$/i.test(value)),`${token.name} must not duplicate a colour value in its metadata.`);
  }
  for (const group of tokenGroups) assert.ok(tokenMetadata.some(token => token.group === group.id),`${group.id} must not be an empty family.`);
});

test('opaque hexadecimal and sRGB inputs are parsed consistently', () => {
  assert.deepEqual(parseColor('#AbC'),[170,187,204]);
  assert.deepEqual(parseColor(' #173a2b '),[23,58,43]);
  assert.deepEqual(parseColor('rgb(23, 58, 43)'),[23,58,43]);
  assert.deepEqual(parseColor('rgb(23 58 43)'),[23,58,43]);
  assert.deepEqual(parseColor('RGB(23.5, 58.25, 43)'),[23.5,58.25,43]);
});

test('malformed, transparent and unsupported colours cannot produce a passing ratio', () => {
  for (const value of [undefined,null,'','red','transparent','#ggg','#12','#12345','#12345678','rgba(0,0,0,.5)','rgb(0 0 0 / 1)','rgb(1%,2%,3%)','rgb(256,0,0)','rgb(-1,0,0)','rgb(0,0 0)','rgb(0 0,0)','rgb(1,2,3) extra','hsl(0 0% 0%)']) {
    assert.equal(parseColor(value),null,String(value));
    assert.equal(contrastRatio(value,'#fff'),null,String(value));
    assert.equal(contrastRatio('#fff',value),null,String(value));
  }
  for (const value of [[],[0,0],[0,0,0,0],[NaN,0,0],[Infinity,0,0],[256,0,0],[-1,0,0],['0',0,0]]) assert.equal(relativeLuminance(value),null,JSON.stringify(value));
});

test('luminance and contrast match independent sRGB benchmarks', () => {
  closeTo(relativeLuminance('#000'),0);
  closeTo(relativeLuminance('#fff'),1);
  closeTo(relativeLuminance('#f00'),.2126);
  closeTo(relativeLuminance('#0f0'),.7152);
  closeTo(relativeLuminance('#00f'),.0722);
  closeTo(contrastRatio('#000','#fff'),21);
  closeTo(contrastRatio('#173a2b','#173a2b'),1);
  closeTo(contrastRatio('#173a2b','#ffffff'),12.525814294825278);
  for (const [foreground,background] of [['#173a2b','#ffffff'],['#b84d2b','#f6f0e5'],['#855437','#f3e5d9'],['#000','#fff']]) closeTo(contrastRatio(foreground,background),contrastRatio(background,foreground));
  closeTo(contrastRatio('rgb(23 58 43)','#fff'),contrastRatio('#173a2b','#fff'));
});

test('contrast retains precision around the text and meaningful-mark thresholds', () => {
  const belowText = contrastRatio('#777777','#ffffff');
  const aboveText = contrastRatio('#767676','#ffffff');
  const belowMark = contrastRatio('#959595','#ffffff');
  const aboveMark = contrastRatio('#949494','#ffffff');
  closeTo(belowText,4.478089453577214);
  closeTo(aboveText,4.542224959605253);
  closeTo(belowMark,2.9953461357088114);
  closeTo(aboveMark,3.0334698257384747);
  assert.ok(belowText < 4.5 && aboveText > 4.5);
  assert.ok(belowMark < 3 && aboveMark > 3);
  assert.equal(belowMark.toFixed(2),'3.00','A rounded display can reach 3.00 while the unrounded ratio still fails.');
});
