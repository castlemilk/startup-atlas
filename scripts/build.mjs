import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
await rm('dist',{recursive:true,force:true});
await mkdir('dist/data',{recursive:true});
for (const file of ['index.html','styles.css','gamma-components.css','globe.css','atlas-view.css','app.js','logic.js','table-model.js','logos.js','globe.js']) await cp(file,`dist/${file}`);
await cp('data/catalogue.json','dist/data/catalogue.json');
await cp('data/partners-reviewed.json','dist/data/partners-reviewed.json');
await cp('data/map-locations.json','dist/data/map-locations.json');
await cp('data/land.geojson','dist/data/land.geojson');
await cp('vendor','dist/vendor',{recursive:true});
// Table Core's ESM build retains Node's environment checks. Resolve them at
// build time so the self-hosted module runs in an ordinary browser.
const tableCore=await readFile('node_modules/@tanstack/table-core/build/lib/index.mjs','utf8');
await writeFile('dist/vendor/tanstack-table-core.mjs',tableCore.replaceAll('process.env.NODE_ENV',JSON.stringify('production')));
await cp('node_modules/@tanstack/table-core/LICENSE','dist/vendor/TANSTACK-TABLE-LICENSE.txt');
await cp('assets/logos','dist/assets/logos',{recursive:true});
console.log('Built static site in dist/');
