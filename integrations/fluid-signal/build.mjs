import { build, version as esbuildVersion } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = dirname(fileURLToPath(import.meta.url));
const output = resolve(directory, '../../web/assets/design-lab/fluid-signal-adapter');
const check = process.argv.includes('--check');
const sha256 = value => createHash('sha256').update(value).digest('hex');
const read = path => readFile(resolve(directory, path));
const packageInfo = JSON.parse(await read('node_modules/@usefluid/motion/package.json'));
if (packageInfo.version !== '0.1.2' || packageInfo.license !== 'MIT' || esbuildVersion !== '0.25.12') {
  throw new Error('Unexpected Fluid/esbuild version or license; review the isolated dependency pin.');
}
const result = await build({
  absWorkingDir: directory,
  entryPoints: ['src/index.js'],
  outfile: 'adapter.js',
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: ['chrome120', 'safari17', 'firefox128'],
  write: false,
  metafile: true,
  treeShaking: true,
  legalComments: 'inline',
  banner: { js: '// Atlas Fluid Signal adapter. Generated from integrations/fluid-signal/src/index.js.\n// Includes @usefluid/motion 0.1.2 (MIT); see THIRD-PARTY.txt.' },
});
const bundle = result.outputFiles[0].contents;
const bundledInputs = Object.entries(result.metafile.outputs['adapter.js'].inputs)
  .filter(([, detail]) => detail.bytesInOutput > 0)
  .map(([path]) => path);
if (bundledInputs.some(path => /(?:ticker|react|sequence|morph)\.js$/.test(path))) {
  throw new Error('Unexpected scheduler, React or morph implementation in the bounded adapter bundle.');
}
const files = new Map([
  ['adapter.js', bundle],
  ['adapter.d.ts', await read('src/index.d.ts')],
  ['tokens.css', await read('src/tokens.css')],
  ['THIRD-PARTY.txt', await read('node_modules/@usefluid/motion/LICENSE')],
]);
const sources = {};
for (const path of ['src/index.js', 'src/index.d.ts', 'src/tokens.css', 'build.mjs', 'package.json', 'package-lock.json']) {
  sources[path] = sha256(await read(path));
}
const manifest = {
  schemaVersion: 1,
  adapterVersion: '0.1.0',
  fluidVersion: packageInfo.version,
  fluidLicense: packageInfo.license,
  fluidSourceRevision: '07ffba766bc7be5b4215384185a0e49363bb1d0e',
  esbuildVersion,
  bundledInputs,
  sourceSha256: sources,
  outputSha256: Object.fromEntries([...files].map(([path, bytes]) => [path, sha256(bytes)])),
  activation: 'No operational route imports this bundle. Host lifecycle and reviewed integration are required.',
};
files.set('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2) + '\n'));
if (!check) await mkdir(output, { recursive: true });
for (const [name, bytes] of files) {
  const path = resolve(output, name);
  if (check) {
    if (!Buffer.from(bytes).equals(await readFile(path))) throw new Error(`Generated file differs: ${name}`);
  } else await writeFile(path, bytes);
}
console.log(`${check ? 'Verified' : 'Built'} ${files.size} Fluid adapter files; ${bundle.length} JavaScript bytes; no ticker/React bundle.`);
