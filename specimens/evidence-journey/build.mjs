import { readFile, mkdir, writeFile, copyFile, cp } from 'node:fs/promises';
import { resolve, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { renderDocument } from './render.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repository = resolve(here, '../..');
export async function buildSpecimen(destination) {
  const output = resolve(destination);
  if (output === repository || output.startsWith(repository + sep)) throw new Error('Build the isolated artifact outside the repository.');
  const fixtures = JSON.parse(await readFile(resolve(here, 'fixtures.json'), 'utf8'));
  await mkdir(output, {recursive:true});
  const result = await build({ entryPoints:[resolve(here,'entry.mjs')], bundle:true, format:'esm', platform:'browser', target:'es2022',
    outfile:resolve(output,'entry.js'), metafile:true, minify:false, legalComments:'eof' });
  await writeFile(resolve(output,'index.html'), renderDocument(fixtures));
  await writeFile(resolve(output,'build-metafile.json'), JSON.stringify(result.metafile, null, 2) + '\n');
  for (const name of ['design-tokens.css','atlas-ui.css','atlas-sdk.css']) await copyFile(resolve(repository,'web',name),resolve(output,name));
  for (const name of ['journey.css','page.css']) await copyFile(resolve(here,name),resolve(output,name));
  await cp(resolve(repository,'web/assets/fonts'),resolve(output,'assets/fonts'),{recursive:true});
  await copyFile(resolve(repository,'docs/UI-SDK-LICENSE.txt'),resolve(output,'UI-SDK-LICENSE.txt'));
  return output;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv[2]) throw new Error('Pass an output directory outside the repository.');
  console.log(await buildSpecimen(process.argv[2]));
}
