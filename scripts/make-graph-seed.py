#!/usr/bin/env python3
"""Emit a repeatable, insert-only seed from reviewed graph data.

Run the output only against the intended new Atlas database. It deliberately
does not overwrite later editorial changes, and is not an automatic sync.
"""
import json
from pathlib import Path

root=Path(__file__).resolve().parents[1]
graph=json.loads((root/'data/graph.json').read_text(encoding='utf-8'))

def q(value):
    if value is None or value=='': return 'NULL'
    if isinstance(value,int): return str(value)
    return "'"+str(value).replace("'","''")+"'"

def emit(table,columns,rows,conflict):
    for row in rows:
        values=','.join(q(row.get(field)) for field in columns)
        print(f"INSERT INTO public.{table} ({','.join(columns)}) VALUES ({values}) ON CONFLICT {conflict} DO NOTHING;")

print('-- Generated from the reviewed graph snapshot. Insert-only; review before applying.\nBEGIN;')
entities=[]
for e in graph['entities']:
    entities.append({'id':e['id'],'kind':e['kind'],'name':e['name'],'summary':e.get('summary',''),
                     'website':e.get('website'),'source_url':e.get('source'),'logo_url':e.get('logo'),
                     'logo_source_url':e.get('logo_source'),'founded_year':e.get('founded_year') or None,
                     'publication_status':'published'})
# summary is NOT NULL; missing descriptions are intentionally empty, not a guess.
for e in entities:
    columns=list(e);values=["''" if k=='summary' and e[k]=='' else q(e[k]) for k in columns]
    print(f"INSERT INTO public.atlas_entities ({','.join(columns)}) VALUES ({','.join(values)}) ON CONFLICT DO NOTHING;")
edges=[{'from_id':e['from'],'to_id':e['to'],'kind':e['kind'],'description':e['description'],'source_url':e['source'],'publication_status':'published'} for e in graph['edges']]
emit('atlas_edges',['from_id','to_id','kind','description','source_url','publication_status'],edges,'(from_id,to_id,kind,source_url)')
rounds=[]
for r in graph['funding_rounds']:
    rounds.append({'id':r['id'],'startup_id':r['startup_id'],'stage':r['stage'],'announced_on':r.get('announced_on'),
                   'amount':r.get('amount'),'currency':r.get('currency'),'valuation':r.get('valuation'),
                   'valuation_currency':r.get('valuation_currency'),'note':r.get('note') or '',
                   'source_url':r['source'],'publication_status':'published'})
for r in rounds:
    columns=list(r); values=["''" if k=='note' and r[k]=='' else q(r[k]) for k in columns]
    print(f"INSERT INTO public.atlas_funding_rounds ({','.join(columns)}) VALUES ({','.join(values)}) ON CONFLICT (id) DO NOTHING;")
articles=[{'startup_id':a['startup_id'],'title':a['title'],'url':a['url'],'published_on':a['published_on'],'kind':a['kind'],'publication_status':'published'} for a in graph['articles']]
emit('atlas_articles',['startup_id','title','url','published_on','kind','publication_status'],articles,'(startup_id,url)')
print('COMMIT;')
