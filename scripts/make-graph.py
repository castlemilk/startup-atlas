#!/usr/bin/env python3
"""Build a deterministic, attributed graph from reviewed repository data.

Edges from a portfolio are only labelled as the source describes; source text is
not evidence of an investment round or an active provider entitlement.
"""
import json
import os
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def load(name):
    return json.loads((ROOT / 'data' / name).read_text(encoding='utf-8'))

def slug(name):
    value = unicodedata.normalize('NFKD', name).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', '-', value).strip('-')

def build_graph(profiles, leads, reviewed, catalogue, research):
    nodes, edges, rounds, articles = {}, [], [], []
    def add(kind, name, **fields):
        identity = kind + ':' + slug(name)
        if not slug(name): raise ValueError(f'Empty entity identity: {name!r}')
        existing = nodes.get(identity)
        if existing and existing['name'].casefold() != name.casefold():
            raise ValueError(f'Ambiguous entity slug: {existing["name"]!r}, {name!r}')
        if existing: existing.update({k: v for k, v in fields.items() if v})
        else: nodes[identity] = {'id': identity, 'kind': kind, 'name': name, **fields}
        return identity
    for name in leads:
        record = reviewed.get(name, {})
        add('partner', name, summary=record.get('description',''), website=record.get('website',''), source=record.get('source',''))
    for offer in catalogue['opportunities']:
        add('provider', offer['org'])
    for partner, profile in profiles.items():
        partner_id=add('partner', partner)
        for company in profile.get('companies',[]):
            startup_id=add('startup', company['name'])
            if company.get('logo') and company.get('logo_source'):
                nodes[startup_id]['logo']=company['logo']; nodes[startup_id]['logo_source']=company['logo_source']
            edges.append({'from':partner_id,'to':startup_id,'kind':'supports','description':company.get('relationship','Listed in portfolio'),'source':company['source']})
    for startup in research['startups']:
        startup_id=add('startup',startup['name'],summary=startup.get('description',''),website=startup.get('website',''),source=startup.get('source',''),founded_year=startup.get('founded_year',0),logo=startup.get('logo',''),logo_source=startup.get('logo_source',''))
        for founder in startup.get('founders',[]):
            founder_id=add('person',founder['name'],source=founder['source'],website=founder.get('profile_url',''),logo=founder.get('photo_url',''),logo_source=founder.get('photo_source',''))
            edges.append({'from':founder_id,'to':startup_id,'kind':'founded','description':'Founder','source':founder['source']})
        for event in startup.get('funding_rounds',[]):
            rounds.append({'startup_id':startup_id,**event})
            articles.append({'startup_id':startup_id,'title':startup['name']+' — '+event['stage'],'url':event['source'],'published_on':event.get('announced_on',''),'kind':'funding announcement'})
        for article in startup.get('articles',[]):
            articles.append({'startup_id':startup_id,'title':article['title'],'url':article['url'],'published_on':article.get('published_on',''),'kind':article.get('kind','news')})
    for startup in research['startups']:
        startup_id='startup:'+slug(startup['name'])
        for relation in startup.get('relationships',[]):
            target=relation['target_id']
            if target not in nodes or target==startup_id: raise ValueError(f'Unknown or self relationship target: {target}')
            edges.append({'from':startup_id,'to':target,'kind':relation['kind'],'description':relation['description'],'source':relation['source']})
    round_ids=[round['id'] for round in rounds]
    if len(round_ids)!=len(set(round_ids)): raise ValueError('Funding round identifiers must be unique')
    key=lambda x: (x['from'],x['to'],x['kind'],x['source'])
    seen=set(); unique=[]
    for edge in sorted(edges,key=key):
        if key(edge) not in seen: unique.append(edge); seen.add(key(edge))
    # An article explicitly supplied by a reviewer can enrich the auto-created funding link.
    unique_articles={(article['startup_id'],article['url']):article for article in articles}
    return {'version':1,'entities':sorted(nodes.values(),key=lambda n:n['id']), 'edges':unique,
            'funding_rounds':sorted(rounds,key=lambda r:r['id']), 'articles':sorted(unique_articles.values(),key=lambda a:(a['startup_id'],a['url']))}

def main():
    graph=build_graph(load('partner-profiles.json'),load('partner-leads.json'),load('partners-reviewed.json'),load('catalogue.json'),load('startup-research.json'))
    if os.environ.get('ATLAS_SOURCE_REVISION'):
        graph['source_revision'] = os.environ['ATLAS_SOURCE_REVISION']
    content=json.dumps(graph,ensure_ascii=False,indent=2)+'\n'
    for name in ['data/graph.json','internal/graph/snapshot.json']:
        target=ROOT/name; target.parent.mkdir(parents=True,exist_ok=True); target.write_text(content,encoding='utf-8')
    print(f"Graph: {len(graph['entities'])} entities, {len(graph['edges'])} sourced edges, {len(graph['funding_rounds'])} funding rounds")

if __name__ == '__main__': main()
