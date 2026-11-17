/** Offline restricted asset profile. Never use for recordRevision or auth. */
import { createHash } from 'node:crypto';

export const PROFILE = 'atlas.asset-canonical.v0';
export const MAX_JSON_BYTES = 32768;
export const MAX_DEPTH = 16;
export const MAX_NODES = 4096;
const KEY = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const encoder = new TextEncoder();

export class CanonicalError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CanonicalError';
    this.code = 'CANONICAL_PROFILE';
  }
}
const fail = message => { throw new CanonicalError(message); };

function checkString(value) {
  for (const character of value) {
    const code = character.codePointAt(0);
    if (code >= 0xd800 && code <= 0xdfff) fail('Unpaired Unicode surrogate.');
  }
  if (encoder.encode(value).byteLength > MAX_JSON_BYTES) fail('String exceeds asset bound.');
}

export function canonicalBytes(value) {
  let nodes = 0;
  const ancestors = new Set();
  function serialize(item, depth) {
    if (++nodes > MAX_NODES || depth > MAX_DEPTH) fail('Depth or node bound exceeded.');
    if (item === null) return 'null';
    if (typeof item === 'boolean') return item ? 'true' : 'false';
    if (typeof item === 'string') {
      checkString(item);
      return JSON.stringify(item);
    }
    if (typeof item === 'number') {
      if (!Number.isSafeInteger(item) || item < 0 || Object.is(item, -0)) {
        fail('Only nonnegative JavaScript-safe integers are supported.');
      }
      return String(item);
    }
    if (typeof item !== 'object') fail('Only JSON values are supported.');
    if (ancestors.has(item)) fail('Cyclic values are not JSON.');
    ancestors.add(item);
    try {
      if (Array.isArray(item)) {
        if (Reflect.ownKeys(item).length !== item.length + 1) fail('Sparse or extended array.');
        const values = [];
        for (let index = 0; index < item.length; index++) {
          const descriptor = Object.getOwnPropertyDescriptor(item, String(index));
          if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) fail('Invalid array member.');
          values.push(serialize(descriptor.value, depth + 1));
        }
        return '[' + values.join(',') + ']';
      }
      const prototype = Object.getPrototypeOf(item);
      if (prototype !== Object.prototype && prototype !== null) fail('Only plain JSON objects are supported.');
      const keys = Reflect.ownKeys(item);
      if (keys.some(key => typeof key !== 'string' || !KEY.test(key))) fail('Object keys must be ASCII identifiers.');
      // Emit members directly. Object.fromEntries + JSON.stringify can reorder
      // numeric-looking keys; this profile rejects those keys as well.
      const members = keys.sort().map(key => {
        const descriptor = Object.getOwnPropertyDescriptor(item, key);
        if (!('value' in descriptor) || !descriptor.enumerable) fail('Accessors and hidden properties are unsupported.');
        return JSON.stringify(key) + ':' + serialize(descriptor.value, depth + 1);
      });
      return '{' + members.join(',') + '}';
    } finally {
      ancestors.delete(item);
    }
  }
  const bytes = encoder.encode(serialize(value, 0));
  if (bytes.byteLength > MAX_JSON_BYTES) fail('Canonical asset JSON exceeds 32768 bytes.');
  return bytes;
}

export function manifestRevision(value) {
  return 'sha256:' + createHash('sha256').update(canonicalBytes(value)).digest('hex');
}

export function parseStrictJson(source) {
  if (source instanceof Uint8Array) {
    if (source.byteLength > MAX_JSON_BYTES) fail('Input JSON exceeds 32768 bytes.');
    try {
      source = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(source);
    } catch {
      fail('Input must be valid UTF-8.');
    }
  }
  if (typeof source !== 'string') fail('Supply UTF-8 bytes or JSON text.');
  checkString(source);
  if (source.startsWith('\ufeff')) fail('A UTF-8 BOM is not accepted.');
  let offset = 0;
  let nodes = 0;
  const space = () => { while (' \n\r\t'.includes(source[offset]) && offset < source.length) offset++; };
  function string() {
    const start = offset++;
    while (offset < source.length) {
      const character = source[offset++];
      if (character === '\\') { offset++; continue; }
      if (character === '"') {
        let value;
        try { value = JSON.parse(source.slice(start, offset)); }
        catch { fail('Malformed JSON string.'); }
        checkString(value);
        return value;
      }
    }
    fail('Unterminated JSON string.');
  }
  function read(depth) {
    if (++nodes > MAX_NODES || depth > MAX_DEPTH) fail('Depth or node bound exceeded.');
    space();
    const character = source[offset];
    if (character === '"') return string();
    if (character === '{') {
      offset++;
      const result = Object.create(null);
      space();
      if (source[offset] === '}') { offset++; return result; }
      while (offset < source.length) {
        space();
        if (source[offset] !== '"') fail('Object key must be a JSON string.');
        const key = string();
        if (!KEY.test(key)) fail('Object keys must be ASCII identifiers.');
        if (Object.hasOwn(result, key)) fail('Duplicate JSON key, including escaped duplicate.');
        space();
        if (source[offset++] !== ':') fail('Missing object colon.');
        result[key] = read(depth + 1);
        space();
        const end = source[offset++];
        if (end === '}') return result;
        if (end !== ',') fail('Missing object separator.');
      }
      fail('Unterminated object.');
    }
    if (character === '[') {
      offset++;
      const result = [];
      space();
      if (source[offset] === ']') { offset++; return result; }
      while (offset < source.length) {
        result.push(read(depth + 1));
        space();
        const end = source[offset++];
        if (end === ']') return result;
        if (end !== ',') fail('Missing array separator.');
      }
      fail('Unterminated array.');
    }
    for (const [literal, value] of [['true', true], ['false', false], ['null', null]]) {
      if (source.startsWith(literal, offset)) { offset += literal.length; return value; }
    }
    const match = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(source.slice(offset));
    if (!match || !/^(?:0|[1-9][0-9]*)$/.test(match[0])) fail('Only unsigned integer numeric syntax is supported.');
    offset += match[0].length;
    const value = Number(match[0]);
    if (!Number.isSafeInteger(value)) fail('Integer exceeds JavaScript-safe range.');
    return value;
  }
  const value = read(0);
  space();
  if (offset !== source.length) fail('Trailing JSON content.');
  canonicalBytes(value);
  return value;
}
