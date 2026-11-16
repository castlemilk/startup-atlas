#!/usr/bin/env python3
"""Check that Pages published a consistent graph and SQLite database."""
import json
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
REVISION=os.environ['GITHUB_SHA']


def get(path, limit):
    url=BASE+path+'?'+urlencode({'revision':REVISION})
    with urlopen(Request(url,headers={'User-Agent':'Startup-Atlas-Publication-Check','Cache-Control':'no-cache'}),timeout=15) as response:
        data=response.read(limit+1)
    if len(data)>limit: raise ValueError(f'{path} exceeds the expected verification size')
    return data


def verify():
    page=get('graph.html',100000).decode('utf-8')
    if 'sql-wasm.js' not in page or 'graph.js' not in page: raise ValueError('Published explorer is missing its SQLite runtime')
    lab=get('design-lab.html',100000).decode('utf-8')
    if 'concept-dialog' not in lab or 'design-lab.js' not in lab: raise ValueError('Published design lab is missing its gallery or image viewer')
    direction=get('design-direction.html',100000).decode('utf-8')
    if 'view-playbooks' not in direction or 'design-direction.js' not in direction: raise ValueError('Published direction handbook is missing its playbooks')
    assets_page=get('design-assets.html',100000).decode('utf-8')
    if 'icon-preview' not in assets_page or 'asset-dialog' not in assets_page: raise ValueError('Published asset library is incomplete')
    system=get('design-system.html',100000).decode('utf-8')
    for marker in ('id="wireframes"','component-workbench','token-reference','layout-recipes','design-workbench.css','design-token-reference.css','design-recipes.css'):
        if marker not in system: raise ValueError(f'Published working system is missing {marker}')
    for filename in ('design-tokens.css','atlas-ui.css','directory.css','treemap.css','graph.css','entity.css','profile.css','design-workbench.css','design-token-reference.css','design-recipes.css'):
        if get(filename,100000)!=Path('web',filename).read_bytes():
            raise ValueError(f'Published system stylesheet differs from this revision: {filename}')
    for route in ('index.html','treemap.html','graph.html','entity.html','partner.html'):
        if 'data-atlas-masthead' not in get(route,100000).decode('utf-8'):
            raise ValueError(f'Published view is missing the wireframe masthead: {route}')
    concept_assets=sorted(Path('web/assets/design-lab').glob('*.webp'))
    if len(concept_assets)!=20: raise ValueError('The design microsite must contain ten full images and ten thumbnails')
    for asset in concept_assets:
        if get(asset.relative_to('web').as_posix(),1000000)!=asset.read_bytes():
            raise ValueError(f'Published design image differs from this revision: {asset.name}')
    manifest_bytes=get('assets/design-lab/asset-manifest.json',200000)
    manifest=json.loads(manifest_bytes)
    if manifest.get('sourceRevision')!=REVISION or len(manifest.get('assets',[]))!=10:
        raise ValueError('Published design asset manifest has not caught up')
    icons=json.loads(subprocess.check_output(['node','--input-type=module','-e',
        "import {atlasIcons,exportIcon} from './web/atlas-icons.js';console.log(JSON.stringify(Object.fromEntries(atlasIcons.map(icon=>[icon.id,exportIcon(icon.id)]))));"],text=True))
    if len(icons)!=32: raise ValueError('The design kit must publish 32 canonical SVG icons')
    for name,svg in icons.items():
        if get(f'assets/design-icons/{name}.svg',10000).decode('utf-8')!=svg:
            raise ValueError(f'Published icon differs from this revision: {name}')
    with ZipFile(io.BytesIO(get('assets/design-lab/atlas-design-kit.zip',10000000))) as kit:
        if kit.testzip() is not None: raise ValueError('Published design kit is corrupt')
        if kit.read('assets/design-lab/asset-manifest.json')!=manifest_bytes:
            raise ValueError('Published design kit has a stale manifest')
        for asset in concept_assets:
            if kit.read(asset.relative_to('web').as_posix())!=asset.read_bytes():
                raise ValueError(f'Design kit contains a stale image: {asset.name}')
        for name,svg in icons.items():
            if kit.read(f'assets/design-icons/{name}.svg').decode('utf-8')!=svg:
                raise ValueError(f'Design kit contains a stale icon: {name}')
        if kit.read('design-tokens.css')!=Path('web/design-tokens.css').read_bytes():
            raise ValueError('Design kit contains stale tokens')
        if kit.read('atlas-ui.css')!=Path('web/atlas-ui.css').read_bytes():
            raise ValueError('Design kit contains stale shared component styles')
        for name in ('DESIGN.md','UX-CONTRACT.md','EXPLORER-VIEWS.md','DESIGN-LAB.md','DESIGN-DIRECTION.md','COMPONENTS.md','TOKENS.md','IMPLEMENTATION-RECIPES.md'):
            published_doc=get('docs/'+name,100000)
            if not published_doc or kit.read('docs/'+name)!=published_doc:
                raise ValueError(f'Design kit has missing or stale guidance: {name}')
    graph=json.loads(get('data/graph.json',5000000))
    catalogue=json.loads(get('data/catalogue.json',5000000))
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
    print(f'Verified published graph, SQLite, component/token/recipe reference, design handbook, ten assets, 32 icons and design kit at {REVISION}')


for attempt in range(12):
    try:
        verify();break
    except Exception as error:
        if attempt==11:raise
        print(f'Waiting for Pages to serve this revision: {type(error).__name__}: {error}')
        time.sleep(5)
