import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { posix } from 'node:path';

// These documents are authored against repository paths, then served together
// under docs/. Resolve links after assets are copied so the published files work.
const publishedDesignDocs=new Map([
  ['DESIGN.md','DESIGN.md'],
  ['UX-CONTRACT.md','UX-CONTRACT.md'],
  ['docs/EXPLORER-VIEWS.md','EXPLORER-VIEWS.md'],
  ['docs/DESIGN-LAB.md','DESIGN-LAB.md']
]);
function gitValue(args) {
  try { return execFileSync('git',args,{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim(); }
  catch { return ''; }
}
const mainSourceRef=gitValue(['rev-parse','--verify','refs/remotes/origin/main']) || gitValue(['rev-parse','--verify','refs/heads/main']);
const currentSourceRef=process.env.ATLAS_SOURCE_REVISION || process.env.GITHUB_SHA || gitValue(['branch','--show-current']) || gitValue(['rev-parse','HEAD']) || 'main';
const mainPathCache=new Map();
function sourceRefFor(path) {
  if(!mainPathCache.has(path))mainPathCache.set(path,Boolean(mainSourceRef && gitValue(['ls-tree',mainSourceRef,'--',path])));
  return mainPathCache.get(path)?'main':currentSourceRef;
}
function resolveDesignDocLinks(markdown,sourceFile) {
  return markdown.replace(/(\[[^\]\n]+\]\()([^\s)]+)(\))/g,(match,prefix,target,suffix)=>{
    if(target.startsWith('#') || target.startsWith('/') || /^[a-z][a-z0-9+.-]*:/i.test(target))return match;
    const [,path,fragment='']=target.match(/^([^?#]+)([?#].*)?$/) || [];
    if(!path)return match;
    const sourcePath=posix.normalize(posix.join(posix.dirname(sourceFile),path));
    if(sourcePath.startsWith('../') || !existsSync(sourcePath))throw new Error(`Unresolved design-doc link in ${sourceFile}: ${target}`);
    if(publishedDesignDocs.has(sourcePath))return prefix+publishedDesignDocs.get(sourcePath)+fragment+suffix;
    const publicPath=sourcePath.startsWith('web/')?sourcePath.slice(4):sourcePath;
    if(existsSync('dist/'+publicPath))return prefix+'../'+publicPath+fragment+suffix;
    return prefix+'https://github.com/castlemilk/startup-atlas/blob/'+sourceRefFor(sourcePath)+'/'+sourcePath+fragment+suffix;
  });
}

await rm('dist',{recursive:true,force:true});
await mkdir('dist/data',{recursive:true});
await mkdir('dist/docs',{recursive:true});
await cp('docs/partner-index.html','dist/docs/partner-index.html');
await writeFile('dist/docs/PARTNER-INDEX.md',(await readFile('docs/PARTNER-INDEX.md','utf8')).replaceAll('../web/assets/','../assets/'));
const designFiles=['design-tokens.css','atlas-ui.css','atlas-ui.js','design-system.html','design-system.css','design-system.js','design-lab.html','design-lab.css','design-lab.js','design-concepts.js'];
for (const file of designFiles) await cp(`web/${file}`,`dist/${file}`);
for (const file of ['treemap.html','treemap.js','treemap-model.js','treemap.css','index.html','partner.html','entity.html','entity.js','entity.css','graph.html','graph.css','graph.js','graph-layout.js','graph-model.js','graph-store.js','graph-sql.js','styles.css','gamma-components.css','globe.css','atlas-view.css','field-atlas.css','profile.css','partner-profile.js','app.js','logic.js','relationships.js','table-model.js','logos.js','globe.js']) await cp(`web/${file}`,`dist/${file}`);
// Fingerprint local UI modules and styles as one release to avoid stale mixed versions.
const uiFiles=['treemap.js','treemap-model.js','treemap.css','styles.css','gamma-components.css','globe.css','atlas-view.css','field-atlas.css','profile.css','entity.css','entity.js','graph.css','graph.js','graph-layout.js','graph-model.js','graph-store.js','graph-sql.js','partner-profile.js','app.js','logic.js','table-model.js','relationships.js','logos.js','globe.js'];
uiFiles.push(...designFiles.filter(file=>!file.endsWith('.html')));
const uiHash=createHash('sha256');
for (const file of uiFiles) uiHash.update(await readFile(`web/${file}`));
const uiVersion=uiHash.digest('hex').slice(0,12);
function versionReferences(source) {
  for (const file of uiFiles) {
    const escaped=file.replaceAll('.', '\\.');
    source=source.replace(new RegExp('\\./'+escaped+'(?:\\?v=[a-zA-Z0-9_-]+)?(?=["\\\'])','g'), './'+file+'?v='+uiVersion);
  }
  return source;
}
for (const file of ['treemap.html','treemap.js','treemap-model.js','index.html','partner.html','entity.html','entity.js','graph.html','graph.js','graph-store.js','graph-model.js','partner-profile.js','app.js','table-model.js','globe.js']) {
  const output='dist/'+file;
  await writeFile(output,versionReferences(await readFile(output,'utf8')));
}
for (const file of ['design-system.html','design-system.js','design-lab.html','design-lab.js','design-concepts.js','atlas-ui.js']) {
  const output='dist/'+file;
  await writeFile(output,versionReferences(await readFile(output,'utf8')));
}
await cp('data/catalogue.json','dist/data/catalogue.json');
await cp('data/graph.json','dist/data/graph.json');
await cp('data/partners-reviewed.json','dist/data/partners-reviewed.json');
await cp('data/partner-profiles.json','dist/data/partner-profiles.json');
await cp('data/map-locations.json','dist/data/map-locations.json');
await cp('data/land.geojson','dist/data/land.geojson');
await cp('web/vendor','dist/vendor',{recursive:true});
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
await cp('web/assets/logos','dist/assets/logos',{recursive:true});
await cp('web/assets/design-lab','dist/assets/design-lab',{recursive:true});
for (const [sourceFile,filename] of publishedDesignDocs) {
  await writeFile(`dist/docs/${filename}`,resolveDesignDocLinks(await readFile(sourceFile,'utf8'),sourceFile));
}
console.log('Built static site in dist/');
