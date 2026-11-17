import { build } from 'esbuild';
import { cp, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const source = dirname(fileURLToPath(import.meta.url));
const repository = resolve(source, '../..');

export async function buildSpecimen(output) {
  await mkdir(output, { recursive: true });
  for (const file of ['index.html', 'controls.css', 'page.css']) await cp(resolve(source, file), resolve(output, file));
  await cp(resolve(source, 'vendor'), resolve(output, 'vendor'), { recursive: true });
  for (const file of ['design-tokens.css', 'design-aesthetic-tokens.css']) await cp(resolve(repository, 'web', file), resolve(output, file));
  await mkdir(resolve(output, 'assets/fonts'), { recursive: true });
  await cp(resolve(repository, 'web/assets/fonts'), resolve(output, 'assets/fonts'), { recursive: true });
  await build({ entryPoints: [resolve(source, 'entry.js')], outfile: resolve(output, 'entry.js'),
    bundle: true, format: 'esm', platform: 'browser', target: ['chrome120', 'safari17', 'firefox128'],
    external: ['./vendor/spring.js'], legalComments: 'eof', define: { 'process.env.NODE_ENV': '"production"' } });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!process.argv[2]) throw new Error('Pass an output directory outside the repository.');
  await buildSpecimen(resolve(process.argv[2]));
  console.log('Built the isolated filter specimen.');
}
