import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { posix } from 'node:path';
import { build } from 'esbuild';
import { atlasIcons, exportIcon } from '../web/atlas-icons.js';
import { featureSymbols, exportFeatureSymbol } from '../web/atlas-feature-symbols.js';
import { assets as designAssets } from '../web/design-handbook.js';
import { indexTreemapEvidence } from '../web/treemap-model.js';

// These documents are authored against repository paths, then served together
// under docs/. Resolve links after assets are copied so the published files work.
const publishedDesignDocs=new Map([
  ['DESIGN.md','DESIGN.md'],
  ['UX-CONTRACT.md','UX-CONTRACT.md'],
  ['docs/EXPLORER-VIEWS.md','EXPLORER-VIEWS.md'],
  ['docs/DESIGN-LAB.md','DESIGN-LAB.md'],
  ['docs/DESIGN-DIRECTION.md','DESIGN-DIRECTION.md'],
  ['docs/VIEW-DIRECTION-STUDIES.md','VIEW-DIRECTION-STUDIES.md'],
  ['docs/AESTHETIC-DIRECTION.md','AESTHETIC-DIRECTION.md'],
  ['docs/SIGNAL-COMPONENTS.md','SIGNAL-COMPONENTS.md'],
  ['docs/REFERENCE-EXTRACTION.md','REFERENCE-EXTRACTION.md'],
  ['docs/UI-SDK.md','UI-SDK.md'],
  ['docs/COMPONENTS.md','COMPONENTS.md'],
  ['docs/TOKENS.md','TOKENS.md'],
  ['docs/IMPLEMENTATION-RECIPES.md','IMPLEMENTATION-RECIPES.md']
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
const designFiles=['design-tokens.css','atlas-ui.css','atlas-ui.js','atlas-icons.js','design-system.html','design-system.css','design-system.js','design-lab.html','design-lab.css','design-lab.js','design-concepts.js','design-handbook.js','design-direction.html','design-direction.css','design-direction.js','design-assets.html','design-assets.css','design-assets.js'];
designFiles.push('design-component-specs.js','design-workbench.js','design-workbench.css','design-token-reference.js','design-token-reference.css','design-recipes.js','design-recipes.css');
designFiles.push('design-aesthetic.html','design-aesthetic.css','design-aesthetic.js','design-aesthetic-tokens.css','design-aesthetic-data.js','atlas-feature-symbols.js');
designFiles.push('signal-controls.js','signal-controls.css','atlas-sdk.js','atlas-sdk.css');
designFiles.push('atlas-exploration.js','atlas-explorer-controls.js','atlas-workspace.js','profile-evidence.js');
for (const file of designFiles) await cp(`web/${file}`,`dist/${file}`);
for (const file of ['analytics.js','analytics-config.js','treemap.html','treemap.js','treemap-model.js','treemap.css','index.html','partner.html','entity.html','entity.js','entity.css','graph.html','graph.css','graph.js','graph-layout.js','graph-model.js','graph-store.js','graph-sql.js','styles.css','gamma-components.css','globe.css','atlas-view.css','field-atlas.css','directory.css','profile.css','partner-profile.js','app.js','logic.js','relationships.js','table-model.js','logos.js','globe.js']) await cp(`web/${file}`,`dist/${file}`);
await build({entryPoints:['web/atlas-sdk.js'],outfile:'dist/atlas-sdk.js',bundle:true,format:'esm',platform:'browser',target:['chrome120','safari17','firefox128'],minify:true,legalComments:'eof',define:{'process.env.NODE_ENV':'"production"'}});
// Fingerprint local UI modules and styles as one release to avoid stale mixed versions.
const uiFiles=['treemap.js','treemap-model.js','treemap.css','styles.css','gamma-components.css','globe.css','atlas-view.css','field-atlas.css','directory.css','profile.css','entity.css','entity.js','graph.css','graph.js','graph-layout.js','graph-model.js','graph-store.js','graph-sql.js','partner-profile.js','app.js','logic.js','table-model.js','relationships.js','logos.js','globe.js'];
uiFiles.push(...designFiles.filter(file=>!file.endsWith('.html')));
const uiHash=createHash('sha256');
uiHash.update(await readFile('package-lock.json'));
uiHash.update(await readFile('dist/atlas-sdk.js'));
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
for (const file of designFiles.filter(file=>/\.(html|js)$/.test(file))) {
  const output='dist/'+file;
  await writeFile(output,versionReferences(await readFile(output,'utf8')));
}
await cp('data/catalogue.json','dist/data/catalogue.json');
await cp('data/graph.json','dist/data/graph.json');
const treemapSource = JSON.parse(await readFile('data/treemap-evidence.json','utf8'));
const graphForTreemap = JSON.parse(await readFile('data/graph.json','utf8'));
const treemapEvidence = indexTreemapEvidence(graphForTreemap,treemapSource);
if (treemapSource.version !== 1 || treemapEvidence.technology.size !== Object.keys(treemapSource.technology).length ||
    treemapEvidence.marketCaps.length !== treemapSource.market_caps.length ||
    treemapEvidence.ownership.size !== Object.keys(treemapSource.ownership ?? {}).length ||
    treemapEvidence.privateValuations.length !== (treemapSource.private_valuations ?? []).length) {
  throw new Error('Treemap evidence has an invalid, duplicate or unmatched record');
}
await cp('data/treemap-evidence.json','dist/data/treemap-evidence.json');
await cp('data/partners-reviewed.json','dist/data/partners-reviewed.json');
await cp('data/partner-profiles.json','dist/data/partner-profiles.json');
await cp('data/map-locations.json','dist/data/map-locations.json');
await cp('data/land.geojson','dist/data/land.geojson');
await cp('web/vendor','dist/vendor',{recursive:true});
await cp('docs/UI-SDK-LICENSE.txt','dist/vendor/UI-SDK-LICENSE.txt');
const sdkPackage=JSON.parse(await readFile('package.json','utf8'));
const sdkLock=JSON.parse(await readFile('skills-lock.json','utf8'));
await writeFile('dist/vendor/ui-sdk-manifest.json',JSON.stringify({
  sourceRevision:process.env.ATLAS_SOURCE_REVISION || process.env.GITHUB_SHA || gitValue(['rev-parse','HEAD']),
  coreVersion:sdkPackage.dependencies['@ui-sdk/core'],
  webVersion:sdkPackage.dependencies['@ui-sdk/web'],
  skillCommit:sdkLock.skills['ui-sdk'].commit,
  bundle:'atlas-sdk.js',
  sha256:createHash('sha256').update(await readFile('dist/atlas-sdk.js')).digest('hex')
},null,2)+'\n');
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
if (existsSync('web/assets/portraits')) await cp('web/assets/portraits','dist/assets/portraits',{recursive:true});
if (existsSync('web/assets/manifests')) await cp('web/assets/manifests','dist/assets/manifests',{recursive:true});
await cp('web/assets/design-lab','dist/assets/design-lab',{recursive:true});
if (existsSync('web/assets/fonts')) await cp('web/assets/fonts','dist/assets/fonts',{recursive:true});
await mkdir('dist/assets/design-icons',{recursive:true});
for (const icon of atlasIcons) await writeFile(`dist/assets/design-icons/${icon.id}.svg`,exportIcon(icon.id));
await mkdir('dist/assets/feature-symbols',{recursive:true});
for (const symbol of featureSymbols) await writeFile(`dist/assets/feature-symbols/${symbol.id}.svg`,exportFeatureSymbol(symbol.id));
await writeFile('dist/assets/feature-symbols/symbol-manifest.json',JSON.stringify({title:'Startup Atlas feature symbols',status:'Proposed Signal aesthetic',symbols:featureSymbols},null,2)+'\n');
const assetManifest={
  title:'Startup Atlas design assets',
  version:1,
  sourceRevision:process.env.ATLAS_SOURCE_REVISION || process.env.GITHUB_SHA || gitValue(['rev-parse','HEAD']),
  notes:'Source wireframes 01–05 guide visual hierarchy and composition. Proposed studies 06–10 add four research journeys and a list/search elevation study. Signal explores a separate aesthetic and four feature motifs, with scoped tokens and its own symbol family. Signal now supplies the operational light theme; dark and material variants remain exploration. Studies do not establish released features or replace factual records. Runtime CSS and SVG own exact geometry; published research records own factual content.',
  assets:await Promise.all(designAssets.map(async asset=>({...asset,
    sha256:createHash('sha256').update(await readFile('web/'+asset.image.replace(/^\.\//,''))).digest('hex')
  })))
};
await writeFile('dist/assets/design-lab/asset-manifest.json',JSON.stringify(assetManifest,null,2)+'\n');
await writeFile('dist/assets/design-icons/icon-manifest.json',JSON.stringify({viewBox:'0 0 24 24',size:24,strokeWidth:1.65,icons:atlasIcons},null,2)+'\n');
// Publish the reviewed snapshots without running a live reference-site crawl.
await cp('docs/reference-extraction-audit.json','dist/docs/reference-extraction-audit.json');
await cp('docs/reference-extraction','dist/docs/reference-extraction',{recursive:true});
for (const [sourceFile,filename] of publishedDesignDocs) {
  await writeFile(`dist/docs/${filename}`,resolveDesignDocLinks(await readFile(sourceFile,'utf8'),sourceFile));
}
execFileSync('python3',['scripts/build-design-kit.py'],{stdio:'inherit'});
console.log('Built static site in dist/');
