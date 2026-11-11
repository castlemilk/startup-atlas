import { readFile } from 'node:fs/promises';
import { mergeAdditions } from './catalogue-entries.mjs';
let input = '';
for await (const chunk of process.stdin) input += chunk;
try {
  const additions = JSON.parse(await readFile(new URL('../data/opportunities-added.json', import.meta.url), 'utf8'));
  process.stdout.write(JSON.stringify(mergeAdditions(JSON.parse(input), additions)));
} catch (error) {
  console.error(`Cannot generate catalogue: ${error.message}`);
  process.exitCode = 1;
}
