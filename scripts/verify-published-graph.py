#!/usr/bin/env python3
"""Check that Pages published a consistent graph and SQLite database."""
import json
import os
from pathlib import Path
import sqlite3
import tempfile
import time
from urllib.parse import urlencode
from urllib.request import Request, urlopen

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
    graph=json.loads(get('data/graph.json',5000000))
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
            if not db.execute("SELECT 1 FROM entity_search WHERE entity_search MATCH ?",('"canva*"',)).fetchone():raise ValueError('Published FTS index is not searchable')
    print(f'Verified published graph and SQLite at {REVISION}')


for attempt in range(12):
    try:
        verify();break
    except Exception as error:
        if attempt==11:raise
        print(f'Waiting for Pages to serve this revision: {type(error).__name__}: {error}')
        time.sleep(5)
