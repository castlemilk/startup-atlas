#!/usr/bin/env python3
"""Check the published landing, explorer and consistent graph snapshot."""
import json
import hashlib
import io
import os
from pathlib import Path
import sqlite3
import subprocess
import tempfile
import time
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from zipfile import ZipFile

BASE='https://castlemilk.github.io/startup-atlas/'
REVISION=os.environ.get('GITHUB_SHA')


def get(path, limit):
    url=BASE+path+'?'+urlencode({'revision':REVISION})
    with urlopen(Request(url,headers={'User-Agent':'Startup-Atlas-Publication-Check','Cache-Control':'no-cache'}),timeout=15) as response:
        data=response.read(limit+1)
    if len(data)>limit: raise ValueError(f'{path} exceeds the expected verification size')
    return data


def verify_icon_exports(registry, exports, manifest, archive_paths=None):
    """Compare the published kit to the exact registry, not a fixed count."""
    ids = [icon['id'] for icon in registry]
    if not ids or len(set(ids)) != len(ids) or set(ids) != exports.keys():
        raise ValueError('The source icon registry has missing or duplicate exports')
    if manifest.get('icons') != registry:
        raise ValueError('Published icon manifest differs from this revision')
    if archive_paths is not None:
        paths = [path for path in archive_paths
                 if path.startswith('assets/design-icons/') and path.endswith('.svg')]
        expected = {f'assets/design-icons/{name}.svg' for name in ids}
        if len(paths) != len(expected) or set(paths) != expected:
            raise ValueError('Design kit icon files differ from this revision')


def verify():
    page=get('graph.html',100000).decode('utf-8')
    if 'sql-wasm.js' not in page or 'graph.js' not in page: raise ValueError('Published explorer is missing its SQLite runtime')
    if not all(marker in page for marker in ('id="graph-company-loom"', 'id="graph-company-group"', 'id="graph-company-directory"')):
        raise ValueError('Published explorer is missing the grouped company map or its list fallback')
    lab=get('design-lab.html',100000).decode('utf-8')
    if 'concept-dialog' not in lab or 'design-lab.js' not in lab or 'concept-collection' not in lab:
        raise ValueError('Published design lab is missing its gallery, collection scope or image viewer')
    direction=get('design-direction.html',100000).decode('utf-8')
    if 'view-playbooks' not in direction or 'design-direction.js' not in direction: raise ValueError('Published direction handbook is missing its playbooks')
    assets_page=get('design-assets.html',100000).decode('utf-8')
    if 'icon-preview' not in assets_page or 'asset-dialog' not in assets_page: raise ValueError('Published asset library is incomplete')
    aesthetic=get('design-aesthetic.html',100000)
    for marker in (b'signal-menu-toggle',b'signal-preview',b'signal-graphics',b'signal-symbols',b'design-aesthetic.js',b'signal-controls-workbench',b'signal-controls.css'):
        if marker not in aesthetic: raise ValueError(f'Published Signal specimen is missing {marker.decode()}')
    for name,content in (('design lab',lab),('direction handbook',direction),('asset library',assets_page)):
        if 'design-aesthetic.html' not in content: raise ValueError(f'Published {name} is missing its aesthetic exploration link')
    system=get('design-system.html',100000).decode('utf-8')
    for marker in ('id="wireframes"','component-workbench','token-reference','layout-recipes','design-workbench.css','design-token-reference.css','design-recipes.css'):
        if marker not in system: raise ValueError(f'Published working system is missing {marker}')
    if system.count('class="ds-wireframe"')!=5 or 'design-lab.html?collection=proposed#gallery' not in system:
        raise ValueError('Published working system must retain five source wireframes and link to proposed studies')
    for filename in ('design-tokens.css','atlas-ui.css','landing.css','directory.css','treemap.css','graph.css','entity.css','profile.css','design-workbench.css','design-token-reference.css','design-recipes.css','design-aesthetic-tokens.css','design-aesthetic.css','signal-controls.css','atlas-sdk.css'):
        if get(filename,100000)!=Path('web',filename).read_bytes():
            raise ValueError(f'Published system stylesheet differs from this revision: {filename}')
    landing=get('index.html',100000).decode('utf-8')
    for marker in ('landing.js?v=','landing.css?v=','href="./list.html"','href="./graph.html"','href="./treemap.html"','data-atlas-masthead'):
        if marker not in landing:
            raise ValueError(f'Published landing is missing {marker}')
    for name in ('atlas-list-wide.webp','atlas-list-compact.webp'):
        path=f'assets/landing/{name}'
        if path not in landing or get(path,100000)!=Path('web',path).read_bytes():
            raise ValueError(f'Published landing artwork differs from this revision: {name}')
    for route in ('list.html','treemap.html','graph.html','entity.html','partner.html'):
        markup=get(route,100000).decode('utf-8')
        if 'atlas-sdk.js?v=' not in markup or 'atlas-sdk.css?v=' not in markup:
            raise ValueError(f'Published view is missing the fingerprinted UI SDK: {route}')
        if 'data-atlas-masthead' not in markup:
            raise ValueError(f'Published view is missing the wireframe masthead: {route}')
    sdk_manifest=json.loads(get('vendor/ui-sdk-manifest.json',10000))
    sdk_bundle=get('atlas-sdk.js',600000)
    dependencies=json.loads(Path('package.json').read_text())['dependencies']
    if sdk_manifest.get('sourceRevision')!=REVISION or sdk_manifest.get('sha256')!=hashlib.sha256(sdk_bundle).hexdigest():
        raise ValueError('Published UI SDK bundle has a stale revision or checksum')
    if sdk_manifest.get('coreVersion')!=dependencies['@ui-sdk/core'] or sdk_manifest.get('webVersion')!=dependencies['@ui-sdk/web']:
        raise ValueError('Published UI SDK packages differ from the pinned versions')
    if get('vendor/UI-SDK-LICENSE.txt',50000)!=Path('docs/UI-SDK-LICENSE.txt').read_bytes():
        raise ValueError('Published UI SDK license differs from this revision')
    design_catalogue=json.loads(subprocess.check_output(['node','--input-type=module','-e',
        "import {assets} from './web/design-handbook.js';import {atlasIcons,exportIcon} from './web/atlas-icons.js';import {featureSymbols,exportFeatureSymbol} from './web/atlas-feature-symbols.js';console.log(JSON.stringify({assets,iconRegistry:atlasIcons,icons:Object.fromEntries(atlasIcons.map(icon=>[icon.id,exportIcon(icon.id)])),featureSymbols,featureExports:Object.fromEntries(featureSymbols.map(symbol=>[symbol.id,exportFeatureSymbol(symbol.id)]))}));"],text=True))
    expected_assets=design_catalogue['assets']
    expected_paths={asset[key].removeprefix('./') for asset in expected_assets for key in ('image','thumb')}
    concept_assets=sorted(Path('web/assets/design-lab').glob('*.webp'))
    if {path.relative_to('web').as_posix() for path in concept_assets}!=expected_paths:
        raise ValueError('The design microsite assets differ from the declared image catalogue')
    for asset in concept_assets:
        if get(asset.relative_to('web').as_posix(),1000000)!=asset.read_bytes():
            raise ValueError(f'Published design image differs from this revision: {asset.name}')
    manifest_bytes=get('assets/design-lab/asset-manifest.json',200000)
    manifest=json.loads(manifest_bytes)
    published_assets=[{key:value for key,value in asset.items() if key!='sha256'} for asset in manifest.get('assets',[])]
    if manifest.get('sourceRevision')!=REVISION or published_assets!=expected_assets:
        raise ValueError('Published design asset manifest has not caught up')
    icons=design_catalogue['icons']
    icon_manifest_path='assets/design-icons/icon-manifest.json'
    icon_manifest_bytes=get(icon_manifest_path,100000)
    icon_manifest=json.loads(icon_manifest_bytes)
    verify_icon_exports(design_catalogue['iconRegistry'],icons,icon_manifest)
    for name,svg in icons.items():
        if get(f'assets/design-icons/{name}.svg',10000).decode('utf-8')!=svg:
            raise ValueError(f'Published icon differs from this revision: {name}')
    feature_exports=design_catalogue['featureExports']
    if set(feature_exports)!={'mcp','treemap','search','graph'}:
        raise ValueError('Signal must publish four distinct feature symbols')
    for name,svg in feature_exports.items():
        if get(f'assets/feature-symbols/{name}.svg',20000).decode('utf-8')!=svg:
            raise ValueError(f'Published feature symbol differs from this revision: {name}')
    symbol_manifest=get('assets/feature-symbols/symbol-manifest.json',30000)
    if json.loads(symbol_manifest).get('symbols')!=design_catalogue['featureSymbols']:
        raise ValueError('Published feature-symbol manifest has not caught up')
    fonts={path.relative_to('web').as_posix():path.read_bytes() for path in Path('web/assets/fonts').rglob('*') if path.is_file()}
    for path,content in fonts.items():
        if get(path,2000000)!=content: raise ValueError(f'Published font or license differs from this revision: {path}')
    reference_snapshots={path.as_posix():path.read_bytes() for path in Path('docs/reference-extraction').rglob('*') if path.is_file()}
    reference_snapshots['docs/reference-extraction-audit.json']=Path('docs/reference-extraction-audit.json').read_bytes()
    for path,content in reference_snapshots.items():
        if get(path,200000)!=content: raise ValueError(f'Published reference snapshot differs from this revision: {path}')
    with ZipFile(io.BytesIO(get('assets/design-lab/atlas-design-kit.zip',10000000))) as kit:
        if kit.testzip() is not None: raise ValueError('Published design kit is corrupt')
        if kit.read('assets/design-lab/asset-manifest.json')!=manifest_bytes:
            raise ValueError('Published design kit has a stale manifest')
        for asset in concept_assets:
            if kit.read(asset.relative_to('web').as_posix())!=asset.read_bytes():
                raise ValueError(f'Design kit contains a stale image: {asset.name}')
        verify_icon_exports(design_catalogue['iconRegistry'],icons,icon_manifest,kit.namelist())
        if kit.read(icon_manifest_path)!=icon_manifest_bytes:
            raise ValueError('Design kit contains a stale icon manifest')
        for name,svg in icons.items():
            if kit.read(f'assets/design-icons/{name}.svg').decode('utf-8')!=svg:
                raise ValueError(f'Design kit contains a stale icon: {name}')
        for name,svg in feature_exports.items():
            if kit.read(f'assets/feature-symbols/{name}.svg').decode('utf-8')!=svg:
                raise ValueError(f'Design kit contains a stale feature symbol: {name}')
        if kit.read('assets/feature-symbols/symbol-manifest.json')!=symbol_manifest:
            raise ValueError('Design kit contains a stale feature-symbol manifest')
        for path,content in fonts.items():
            if kit.read(path)!=content: raise ValueError(f'Design kit contains a stale font or license: {path}')
        for path,content in reference_snapshots.items():
            if kit.read(path)!=content: raise ValueError(f'Design kit contains a stale reference snapshot: {path}')
        for filename in ('design-aesthetic.html','design-aesthetic.css','design-aesthetic.js','design-aesthetic-tokens.css','design-aesthetic-data.js','atlas-feature-symbols.js','signal-controls.js','signal-controls.css'):
            if kit.read(filename)!=get(filename,200000):
                raise ValueError(f'Design kit contains a stale Signal specimen source: {filename}')
        if kit.read('atlas-sdk.js')!=sdk_bundle or json.loads(kit.read('vendor/ui-sdk-manifest.json'))!=sdk_manifest:
            raise ValueError('Design kit contains a stale UI SDK implementation')
        if kit.read('design-tokens.css')!=Path('web/design-tokens.css').read_bytes():
            raise ValueError('Design kit contains stale tokens')
        if kit.read('atlas-ui.css')!=Path('web/atlas-ui.css').read_bytes():
            raise ValueError('Design kit contains stale shared component styles')
        for name in ('DESIGN.md','UX-CONTRACT.md','EXPLORER-VIEWS.md','DESIGN-LAB.md','DESIGN-DIRECTION.md','COMPONENTS.md','TOKENS.md','IMPLEMENTATION-RECIPES.md','VIEW-DIRECTION-STUDIES.md','AESTHETIC-DIRECTION.md','SIGNAL-COMPONENTS.md','REFERENCE-EXTRACTION.md','UI-SDK.md'):
            published_doc=get('docs/'+name,100000)
            if not published_doc or kit.read('docs/'+name)!=published_doc:
                raise ValueError(f'Design kit has missing or stale guidance: {name}')
    graph=json.loads(get('data/graph.json',5000000))
    catalogue=json.loads(get('data/catalogue.json',5000000))
    treemap_evidence=get('data/treemap-evidence.json',5000000)
    if treemap_evidence!=Path('data/treemap-evidence.json').read_bytes():
        raise ValueError('Published treemap evidence differs from this revision')
    if graph.get('source_revision')!=REVISION: raise ValueError('Published graph revision has not caught up')
    binary=get('data/atlas.sqlite',15000000)
    if not binary.startswith(b'SQLite format 3\x00'): raise ValueError('Published graph database is not SQLite')
    if not get('vendor/sql.js/sql-wasm.wasm',2000000).startswith(b'\x00asm'): raise ValueError('Published SQLite WASM is missing')
    with tempfile.TemporaryDirectory() as temp:
        path=Path(temp)/'atlas.sqlite';path.write_bytes(binary)
        with sqlite3.connect(f'file:{path}?mode=ro',uri=True) as db:
            if db.execute('PRAGMA quick_check').fetchone()[0]!='ok':raise ValueError('Published SQLite integrity check failed')
            revision=db.execute("SELECT value FROM metadata WHERE key='source_revision'").fetchone()
            if not revision or revision[0]!=REVISION:raise ValueError('Published SQLite revision differs from the graph')
            treemap_row=db.execute('SELECT content FROM source_documents WHERE path=?',('treemap-evidence.json',)).fetchone()
            if not treemap_row or treemap_row[0].encode('utf-8')!=treemap_evidence:
                raise ValueError('Published treemap evidence differs from the database')
            for table,key in [('entities','entities'),('edges','edges'),('funding_rounds','funding_rounds'),('articles','articles')]:
                if db.execute(f'SELECT count(*) FROM {table}').fetchone()[0]!=len(graph[key]):raise ValueError(f'{table} count differs from the graph')
            rows=[json.loads(row[0]) for row in db.execute('SELECT data FROM opportunities ORDER BY id')]
            if rows!=sorted(catalogue['opportunities'],key=lambda item:item['id']):raise ValueError('Published opportunities differ from the catalogue')
            for name in ('catalogue.json','graph.json','partners-reviewed.json','partner-profiles.json','map-locations.json','land.geojson'):
                row=db.execute('SELECT content FROM source_documents WHERE path=?',(name,)).fetchone()
                if not row or json.loads(row[0])!=json.loads(get('data/'+name,5000000)):
                    raise ValueError(f'Published {name} differs from the database')
            for table in ('partner_records','locations','logo_mappings','provider_relationships'):
                if not db.execute(f'SELECT 1 FROM {table} LIMIT 1').fetchone():raise ValueError(f'Published {table} is empty')
            if not db.execute("SELECT 1 FROM entity_search WHERE entity_search MATCH ?",('"canva*"',)).fetchone():raise ValueError('Published FTS index is not searchable')
    print(f'Verified published landing, List, graph, SQLite, component/token/recipe reference, design handbook, Signal specimen, {len(expected_assets)} assets, {len(icons)} utility icons, four feature symbols and design kit at {REVISION}')


if __name__=='__main__':
    if not REVISION:
        raise SystemExit('GITHUB_SHA is required')
    for attempt in range(12):
        try:
            verify();break
        except Exception as error:
            if attempt==11:raise
            print(f'Waiting for Pages to serve this revision: {type(error).__name__}: {error}')
            time.sleep(5)
