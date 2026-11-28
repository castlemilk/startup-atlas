import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { existsSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { posix } from 'node:path';
import { build } from 'esbuild';
import { atlasIcons, exportIcon } from '../web/atlas-icons.js';
import { featureSymbols, exportFeatureSymbol } from '../web/atlas-feature-symbols.js';
import { assets as designAssets } from '../web/design-handbook.js';
import { indexTreemapEvidence } from '../web/treemap-model.js';
import { buildEntityRedirects } from '../web/entity-redirects.js';
import { selectCohort, renderCohortIndex, renderOpportunityPage, withCohortUrls, opportunityPath } from '../scripts/opportunity-pages.mjs';

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

// DuckDB-WASM is vendored, not CDN-loaded: the query page imports the
// browser bundle from ./vendor/duckdb/ and instantiates it in a worker.
// Check early, before dist/ is wiped, so a missing install fails fast.
// Install it with: npm install --save-exact @duckdb/duckdb-wasm@1.32.0
const duckdbDist='node_modules/@duckdb/duckdb-wasm/dist';
if (!existsSync(`${duckdbDist}/duckdb-browser.mjs`)) {
  throw new Error('DuckDB-WASM is not installed (node_modules/@duckdb/duckdb-wasm is missing). Run: npm install --save-exact @duckdb/duckdb-wasm@1.32.0');
}

await rm('dist',{recursive:true,force:true});await mkdir('dist/data',{recursive:true});
await mkdir('dist/docs',{recursive:true});
await cp('docs/partner-index.html','dist/docs/partner-index.html');
await writeFile('dist/docs/PARTNER-INDEX.md',(await readFile('docs/PARTNER-INDEX.md','utf8')).replaceAll('../web/assets/','../assets/'));
const designFiles=['design-tokens.css','atlas-ui.css','atlas-ui.js','atlas-icons.js','design-system.html','design-system.css','design-system.js','design-lab.html','design-lab.css','design-lab.js','design-concepts.js','design-handbook.js','design-direction.html','design-direction.css','design-direction.js','design-assets.html','design-assets.css','design-assets.js'];
designFiles.push('design-component-specs.js','design-workbench.js','design-workbench.css','design-token-reference.js','design-token-reference.css','design-recipes.js','design-recipes.css');
designFiles.push('design-aesthetic.html','design-aesthetic.css','design-aesthetic.js','design-aesthetic-tokens.css','design-aesthetic-data.js','atlas-feature-symbols.js');
designFiles.push('signal-controls.js','signal-controls.css','atlas-sdk.js','atlas-sdk.css');
designFiles.push('atlas-exploration.js','atlas-explorer-controls.js','atlas-workspace.js','profile-evidence.js');
for (const file of designFiles) await cp(`web/${file}`,`dist/${file}`);
const graphModules=['graph.js','graph-layout.js','graph-model.js','graph-store.js','graph-sql.js','graph-mobile-fit.js','graph-artwork.js'];
for (const file of ['favicon.svg','favicon.ico','favicon-32.png','apple-touch-icon.png','og-image.png','robots.txt','sitemap.xml','analytics.js','analytics-config.js','treemap.html','treemap.js','treemap-model.js','treemap.css','landing.js','landing.css','company-columns.js','index.html','list.html','partner.html','entity.html','entity.js','entity.css','entity-redirects.js','profile-tabs.js','micro-graph.js','graph.html','graph.css','query.html','query.js','query.css',...graphModules,'styles.css','gamma-components.css','globe.css','atlas-view.css','field-atlas.css','directory.css','profile.css','partner-profile.js','app.js','logic.js','relationships.js','table-model.js','logos.js','globe.js']) await cp(`web/${file}`,`dist/${file}`);
await build({entryPoints:['web/atlas-sdk.js'],outfile:'dist/atlas-sdk.js',bundle:true,format:'esm',platform:'browser',target:['chrome120','safari17','firefox128'],minify:true,legalComments:'eof',define:{'process.env.NODE_ENV':'"production"'}});
await build({entryPoints:['web/graph-loom.js'],outfile:'dist/graph-loom.js',bundle:true,format:'esm',platform:'browser',target:['chrome120','safari17','firefox128'],minify:true,legalComments:'eof'});
await build({entryPoints:['web/graph-atlas.js'],outfile:'dist/graph-atlas.js',bundle:true,format:'esm',platform:'browser',target:['chrome120','safari17','firefox128'],minify:true,legalComments:'eof'});
// Fingerprint local UI modules and styles as one release to avoid stale mixed versions.
const uiFiles=['treemap.js','treemap-model.js','treemap.css','landing.js','landing.css','company-columns.js','styles.css','gamma-components.css','globe.css','atlas-view.css','field-atlas.css','directory.css','profile.css','entity.css','entity.js','entity-redirects.js','profile-tabs.js','micro-graph.js','graph.css','query.js','query.css',...graphModules,'graph-loom.js','graph-atlas.js','partner-profile.js','app.js','logic.js','table-model.js','relationships.js','logos.js','globe.js'];
uiFiles.push(...designFiles.filter(file=>!file.endsWith('.html')));
const uiHash=createHash('sha256');
uiHash.update(await readFile('package-lock.json'));
uiHash.update(await readFile('dist/atlas-sdk.js'));
uiHash.update(await readFile('dist/graph-loom.js'));
uiHash.update(await readFile('dist/graph-atlas.js'));
for (const file of uiFiles) uiHash.update(await readFile(`web/${file}`));
const uiVersion=uiHash.digest('hex').slice(0,12);
function versionReferences(source) {
  for (const file of uiFiles) {
    const escaped=file.replaceAll('.', '\\.');
    source=source.replace(new RegExp('\\./'+escaped+'(?:\\?v=[a-zA-Z0-9_-]+)?(?=["\\\'])','g'), './'+file+'?v='+uiVersion);
  }
  return source;
}
for (const file of ['treemap.html','treemap.js','treemap-model.js','landing.js','company-columns.js','index.html','list.html','partner.html','entity.html','entity.js','graph.html','query.html','query.js',...graphModules,'partner-profile.js','app.js','table-model.js','globe.js']) {
  const output='dist/'+file;
  await writeFile(output,versionReferences(await readFile(output,'utf8')));
}
for (const file of designFiles.filter(file=>/\.(html|js)$/.test(file))) {
  const output='dist/'+file;
  await writeFile(output,versionReferences(await readFile(output,'utf8')));
}
await cp('data/catalogue.json','dist/data/catalogue.json');
await cp('data/graph.json','dist/data/graph.json');
// The identity registry is a public graph-store document (#70): entity.js
// reads it through the store, whose fallback mode fetches the published
// JSON file, so it must ship alongside the other public documents.
await cp('data/identity.json','dist/data/identity.json');
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
// Shared profile links must survive entity merges (#93): publish the
// identity registry's merged_into chains, resolved to canonical targets
// that exist in the published graph, as a small redirect map for entity.js.
const identityRegistry = JSON.parse(await readFile('data/identity.json','utf8'));
const entityRedirects = buildEntityRedirects(identityRegistry, new Set(graphForTreemap.entities.map(entity => entity.id)));
await writeFile('dist/data/entity-redirects.json', JSON.stringify({ version: 1, redirects: entityRedirects }, null, 2) + '\n');
// Prerender the reviewed opportunity cohort (#130): static, script-free
// pages so the catalogue's checked credits/programmes are readable in the
// initial HTML. The cohort is derived from the catalogue at build time; an
// empty cohort means the review pipeline broke, so fail loudly.
const catalogue = JSON.parse(await readFile('data/catalogue.json','utf8'));
const opportunityCohort = selectCohort(catalogue.opportunities);
if (opportunityCohort.length === 0) throw new Error('Opportunity cohort is empty: no catalogue record meets the #130 review bar');
await mkdir('dist/opportunities',{recursive:true});
await writeFile('dist/opportunities.html', renderCohortIndex(opportunityCohort, { updated: catalogue.updated }));
for (const record of opportunityCohort) await writeFile(`dist/${opportunityPath(record.id)}`, renderOpportunityPage(record));
await writeFile('dist/sitemap.xml', withCohortUrls(await readFile('dist/sitemap.xml','utf8'), opportunityCohort));
console.log(`Prerendered ${opportunityCohort.length} reviewed opportunity pages (#130)`);
await mkdir('dist/vendor/duckdb',{recursive:true});
for (const file of ['duckdb-browser.mjs','duckdb-mvp.wasm','duckdb-eh.wasm','duckdb-browser-mvp.worker.js','duckdb-browser-eh.worker.js']) await cp(`${duckdbDist}/${file}`,`dist/vendor/duckdb/${file}`);
// @duckdb/duckdb-wasm 1.32.0 ships no LICENSE file (neither in dist/ nor the
// package root), so copy it only when a future version provides one.
if (existsSync(`${duckdbDist}/LICENSE`)) await cp(`${duckdbDist}/LICENSE`,`dist/vendor/duckdb/LICENSE`);
// DuckDB-WASM's browser bundle imports the bare specifier 'apache-arrow',
// and Arrow itself imports 'flatbuffers' and 'tslib'. Browsers cannot
// resolve bare specifiers, so web/query.html carries an import map pointing
// at these vendored copies. Without them the console fails with "Module
// name, 'apache-arrow' does not resolve to a valid URL" and no query runs.
// All three arrive as transitive dependencies of @duckdb/duckdb-wasm.
if (!existsSync('node_modules/apache-arrow/Arrow.dom.mjs')) {
  throw new Error('apache-arrow is not installed (expected as a transitive dependency of @duckdb/duckdb-wasm). Run: npm install --save-exact @duckdb/duckdb-wasm@1.32.0');
}
const esmOnly=src=>statSync(src).isDirectory()||src.endsWith('.mjs');
await cp('node_modules/apache-arrow','dist/vendor/duckdb/apache-arrow',{recursive:true,filter:esmOnly});
await cp('node_modules/flatbuffers/mjs','dist/vendor/duckdb/flatbuffers',{recursive:true,filter:src=>statSync(src).isDirectory()||src.endsWith('.js')});
await cp('node_modules/tslib/tslib.es6.mjs','dist/vendor/duckdb/tslib.mjs');
await cp('web/vendor','dist/vendor',{recursive:true});
await cp('docs/UI-SDK-LICENSE.txt','dist/vendor/UI-SDK-LICENSE.txt');
await cp('node_modules/loom-core/LICENSE','dist/vendor/LOOM-LICENSE.txt');
await cp('node_modules/loom-core/dist/atlas-runtime','dist/vendor/atlas-runtime',{recursive:true});
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
await cp('web/assets/landing','dist/assets/landing',{recursive:true});
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
