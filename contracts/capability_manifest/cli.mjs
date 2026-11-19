#!/usr/bin/env node
// Local JSON files only. No MCP requests, evidence resolution, or write mode.
import { lstat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ContractError, SCHEMA_VERSION, assessManifest, compareCatalogues,
  digestCatalogue, parseStrictJson, validateManifest,
} from './validator.mjs';

const MAX_BYTES = 4 * 1024 * 1024;
async function input(filename) {
  if (typeof filename !== 'string' || !filename || filename.startsWith('-') || /^[a-z][a-z0-9+.-]*:/i.test(filename)) throw new ContractError('LOCAL_FILE_REQUIRED', '', 'Supply a local JSON file path, never a URL or standard-input alias.');
  const info = await lstat(filename);
  if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_BYTES) throw new ContractError('INVALID_INPUT_FILE', '', 'Input must be a regular, non-symlink JSON file of at most 4 MiB.');
  const bytes = await readFile(filename);
  if (bytes.byteLength > MAX_BYTES) throw new ContractError('INPUT_TOO_LARGE', '', 'JSON input exceeds 4 MiB.');
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { throw new ContractError('INVALID_UTF8', '', 'Input must contain valid UTF-8.'); }
  return parseStrictJson(text);
}
const catalogue = value => Array.isArray(value) ? value : value?.tools;
const output = value => process.stdout.write(JSON.stringify(value, null, 2) + '\n');

export async function main(args = process.argv.slice(2)) {
  try {
    const [command, first, second, third] = args;
    if (command === 'validate' && args.length === 2) {
      const errors = validateManifest(await input(first));
      output({ schemaVersion: SCHEMA_VERSION, valid: errors.length === 0, errors });
      return errors.length ? 1 : 0;
    }
    if (command === 'assess' && args.length === 4 && second === '--now') {
      const result = assessManifest(await input(first), { now: third });
      output(result); return result.valid ? 0 : 1;
    }
    if (command === 'digest' && args.length === 2) {
      output(digestCatalogue(catalogue(await input(first)))); return 0;
    }
    if (command === 'compare' && args.length === 3) {
      const expected = await input(first), observed = await input(second);
      const result = compareCatalogues(catalogue(expected), catalogue(observed));
      output(result); return result.matching ? 0 : 1;
    }
    throw new ContractError('USAGE', '', 'Use validate FILE; assess FILE --now UTC; digest FILE; or compare EXPECTED OBSERVED. All inputs are local JSON files.');
  } catch (error) {
    output({ valid: false, errors: [{ code: error instanceof ContractError ? error.code : 'INPUT_UNAVAILABLE', path: error instanceof ContractError ? error.path : '', message: error instanceof ContractError ? error.message : 'The local input could not be read.' }] });
    return 2;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await main();
