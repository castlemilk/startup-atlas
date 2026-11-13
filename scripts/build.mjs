import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
await rm('dist',{recursive:true,force:true});
await mkdir('dist/data',{recursive:true});
await mkdir('dist/docs',{recursive:true});
await cp('docs/partner-index.html','dist/docs/partner-index.html');
await cp('docs/PARTNER-INDEX.md','dist/docs/PARTNER-INDEX.md');
for (const file of ['index.html','partner.html','graph.html','graph.css','graph.js','graph-sql.js','styles.css','gamma-components.css','globe.css','atlas-view.css','field-atlas.css','profile.css','partner-profile.js','app.js','logic.js','relationships.js','table-model.js','logos.js','globe.js']) await cp(file,`dist/${file}`);
// Fingerprint local UI modules and styles as one release to avoid stale mixed versions.
const uiFiles=['styles.css','gamma-components.css','globe.css','atlas-view.css','field-atlas.css','profile.css','graph.css','graph.js','graph-sql.js','partner-profile.js','app.js','logic.js','table-model.js','relationships.js','logos.js','globe.js'];
const uiHash=createHash('sha256');
for (const file of uiFiles) uiHash.update(await readFile(file));
const uiVersion=uiHash.digest('hex').slice(0,12);
function versionReferences(source) {
  for (const file of uiFiles) {
    const escaped=file.replaceAll('.', '\\.');
    source=source.replace(new RegExp('\\./'+escaped+'(?:\\?v=[a-zA-Z0-9_-]+)?(?=["\\\'])','g'), './'+file+'?v='+uiVersion);
  }
  return source;
}
for (const file of ['index.html','partner.html','graph.html','graph.js','partner-profile.js','app.js','table-model.js','globe.js']) {
  const output='dist/'+file;
  await writeFile(output,versionReferences(await readFile(output,'utf8')));
}
await cp('data/catalogue.json','dist/data/catalogue.json');
await cp('data/graph.json','dist/data/graph.json');
await cp('data/partners-reviewed.json','dist/data/partners-reviewed.json');
await cp('data/partner-profiles.json','dist/data/partner-profiles.json');
await cp('data/map-locations.json','dist/data/map-locations.json');
await cp('data/land.geojson','dist/data/land.geojson');
await cp('vendor','dist/vendor',{recursive:true});
// Table Core's ESM build retains Node's environment checks. Resolve them at
// build time so the self-hosted module runs in an ordinary browser.
const tableCore=await readFile('node_modules/@tanstack/table-core/build/lib/index.mjs','utf8');
await writeFile('dist/vendor/tanstack-table-core.mjs',tableCore.replaceAll('process.env.NODE_ENV',JSON.stringify('production')));
await cp('node_modules/@tanstack/table-core/LICENSE','dist/vendor/TANSTACK-TABLE-LICENSE.txt');
const queryDir='node_modules/@tanstack/query-core/build/modern';
await mkdir('dist/vendor/tanstack-query',{recursive:true});
for (const file of await (await import('node:fs/promises')).readdir(queryDir)) {
  if (!file.endsWith('.js')) continue;
  const source=await readFile(`${queryDir}/${file}`,'utf8');
  await writeFile(`dist/vendor/tanstack-query/${file}`,source.replaceAll('process.env.NODE_ENV',JSON.stringify('production')));
}
await cp('node_modules/@tanstack/query-core/LICENSE','dist/vendor/TANSTACK-QUERY-LICENSE.txt');
await cp('assets/logos','dist/assets/logos',{recursive:true});
console.log('Built static site in dist/');
