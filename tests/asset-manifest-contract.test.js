import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  canonicalBytes, manifestRevision, parseStrictJson, CanonicalError,
} from '../contracts/mcp_assets/canonical.mjs';

const vectors = JSON.parse(readFileSync(
  new URL('../contracts/mcp_assets/fixtures/canonical-vectors.json', import.meta.url), 'utf8',
));

test('asset profile exactly matches all shared Python/JavaScript golden vectors', () => {
  for (const fixture of vectors.valid) {
    const value = parseStrictJson(fixture.input_json);
    assert.equal(Buffer.from(canonicalBytes(value)).toString('utf8'), fixture.canonical_utf8, fixture.name);
    assert.equal(manifestRevision(value), 'sha256:' + fixture.sha256, fixture.name);
  }
});

test('strict asset parser rejects every ambiguous or unsupported raw vector', () => {
  for (const fixture of vectors.invalid) {
    assert.throws(() => parseStrictJson(fixture.input_json), CanonicalError, fixture.name);
  }
  assert.throws(() => parseStrictJson('{"n":' + '9'.repeat(4301) + '}'), CanonicalError);
});

test('Unicode normalization and array ordering remain significant', () => {
  assert.notEqual(manifestRevision({ x: 'é' }), manifestRevision({ x: 'e\u0301' }));
  assert.notEqual(manifestRevision({ x: [1, 2] }), manifestRevision({ x: [2, 1] }));
  assert.equal(manifestRevision({ a: '🚀' }), manifestRevision(parseStrictJson('{"a":"\\ud83d\\ude80"}')));
});

test('reserved own keys are plain data and cannot mutate prototypes', () => {
  const parsed = parseStrictJson('{"__proto__":{"polluted":true},"constructor":"data"}');
  assert.equal(Object.getPrototypeOf(parsed), null);
  assert.equal(Object.getPrototypeOf(parsed.__proto__), null);
  assert.equal(Object.prototype.polluted, undefined);
  assert.equal(parsed.constructor, 'data');
  assert.equal(Buffer.from(canonicalBytes(parsed)).toString(), '{"__proto__":{"polluted":true},"constructor":"data"}');
});

test('unsafe values, accessors, holes, classes, cycles and bounds fail explicitly', () => {
  const cyclic = []; cyclic.push(cyclic);
  const hidden = Object.defineProperty({}, 'x', { value: 1 });
  const accessor = Object.defineProperty({}, 'x', { enumerable: true, get() { throw new Error('must not execute'); } });
  const symbol = { [Symbol('private')]: 'value' };
  let nested = null;
  for (let depth = 0; depth < 18; depth++) nested = [nested];
  for (const value of [
    -0, -1, 1.5, NaN, Infinity, 9007199254740992, 1n, undefined, () => 1,
    { é: 1 }, { '2': 1 }, { x: '\ud800' }, new Array(1), cyclic, hidden,
    accessor, symbol, new Date(), nested, { x: 'a'.repeat(32768) }, Array(4096).fill(0),
  ]) assert.throws(() => canonicalBytes(value), CanonicalError);
});

test('wire JSON rejects invalid UTF-8, BOM, extra data and oversized input', () => {
  assert.throws(() => parseStrictJson(Uint8Array.of(0xff)), CanonicalError);
  assert.throws(() => parseStrictJson(Uint8Array.of(0xef, 0xbb, 0xbf, 0x7b, 0x7d)), CanonicalError);
  assert.throws(() => parseStrictJson(' '.repeat(32769)), CanonicalError);
  assert.throws(() => parseStrictJson('{}{}'), CanonicalError);
});
