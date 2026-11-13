import importlib.util
import json
from pathlib import Path
import sqlite3
import shutil
import tempfile
import types
import unittest

ROOT=Path(__file__).resolve().parents[1]
def load(name,path):
    spec=importlib.util.spec_from_file_location(name,ROOT/path)
    mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod);return mod
graph=load('atlas_graph','scripts/make-graph.py')
crawl=load('atlas_crawl_news','scripts/crawl.py')
database=load('atlas_graph_db','scripts/build-graph-db.py')

class GraphTests(unittest.TestCase):
    def test_public_catalogue_snapshot_round_trips_sources_and_mappings(self):
        with tempfile.TemporaryDirectory() as temp:
            data_dir=Path(temp)/'data'; shutil.copytree(ROOT/'data',data_dir)
            (data_dir/'unreviewed.json').write_text('{"private":true}',encoding='utf-8')
            target=Path(temp)/'atlas.sqlite'
            database.build(data_dir/'graph.json',target,data_dir)
            catalogue=json.loads((data_dir/'catalogue.json').read_text(encoding='utf-8'))
            additions=json.loads((data_dir/'opportunities-added.json').read_text(encoding='utf-8'))['entries']
            profiles=json.loads((data_dir/'partner-profiles.json').read_text(encoding='utf-8'))
            mappings=database.read_mappings()
            with sqlite3.connect(target) as db:
                documents=dict(db.execute('select path,content from source_documents'))
                self.assertEqual(set(documents),set(database.PUBLIC_DATA_FILES))
                for name in database.PUBLIC_DATA_FILES:
                    self.assertEqual(documents[name],(data_dir/name).read_bytes().decode('utf-8'))
                self.assertEqual([json.loads(row[0]) for row in db.execute('select data from opportunities order by id')],
                                 sorted(catalogue['opportunities'],key=lambda item:item['id']))
                stored_additions=[json.loads(row[0]) for row in db.execute('select addition_data from opportunities where addition_data is not null')]
                self.assertEqual(sorted(stored_additions,key=lambda x:x['entry']['id']),sorted(additions,key=lambda x:x['entry']['id']))
                self.assertEqual(json.loads(db.execute('select profile_data from partner_records where name=?',('Startmate',)).fetchone()[0]),profiles['Startmate'])
                self.assertEqual(db.execute('select count(*) from locations').fetchone()[0],len(json.loads((data_dir/'map-locations.json').read_text())))
                self.assertEqual(db.execute('select count(*) from logo_mappings').fetchone()[0],len(mappings['logos']))
                self.assertEqual(db.execute('select count(*) from provider_relationships').fetchone()[0],sum(map(len,mappings['relationships'].values())))
                screenshot=[json.loads(row[0]) for row in db.execute('select data from provider_relationships where partner=?',('776',))]
                self.assertTrue(any(item['source'] is None and 'unverified' in item['relationship'] for item in screenshot))
                self.assertEqual(db.execute('PRAGMA integrity_check').fetchone()[0],'ok')
    def test_failed_rebuild_keeps_the_previous_snapshot(self):
        with tempfile.TemporaryDirectory() as temp:
            data_dir=Path(temp)/'data'; shutil.copytree(ROOT/'data',data_dir)
            target=Path(temp)/'atlas.sqlite'
            database.build(data_dir/'graph.json',target,data_dir)
            previous=target.read_bytes()
            catalogue=json.loads((data_dir/'catalogue.json').read_text(encoding='utf-8'))
            catalogue['opportunities'].append(catalogue['opportunities'][0])
            (data_dir/'catalogue.json').write_text(json.dumps(catalogue),encoding='utf-8')
            with self.assertRaises(sqlite3.IntegrityError):
                database.build(data_dir/'graph.json',target,data_dir)
            self.assertEqual(target.read_bytes(),previous)
            self.assertEqual(list(Path(temp).glob('.atlas-*.sqlite')),[])
    def test_graph_deduplicates_startups_and_preserves_round_currency(self):
        profiles={'Investor':{'companies':[{'name':'Example','source':'https://example.org/portfolio'}]},'Accelerator':{'companies':[{'name':'Example','source':'https://other.org/portfolio'}]}}
        research={'startups':[{'name':'Example','source':'https://example.com/','funding_rounds':[{'id':'example-seed','stage':'Seed','amount':500000,'currency':'AUD','announced_on':'2025-01-01','source':'https://example.com/news'}]}]}
        data=graph.build_graph(profiles,['Investor','Accelerator'],{}, {'opportunities':[]},research)
        self.assertEqual(len([x for x in data['entities'] if x['kind']=='startup']),1)
        self.assertEqual(len(data['edges']),2)
        self.assertEqual(data['funding_rounds'][0]['currency'],'AUD')
        self.assertTrue(all(x['source'].startswith('https://') for x in data['edges']))
    def test_distinct_names_cannot_silently_collapse_into_same_id(self):
        profiles={'P':{'companies':[{'name':'A&B','source':'https://example.com/'},{'name':'A B','source':'https://example.com/'}]}}
        with self.assertRaises(ValueError):graph.build_graph(profiles,['P'],{}, {'opportunities':[]},{'startups':[]})
    def test_reviewed_startup_updates_flow_into_the_sqlite_index(self):
        research={'startups':[{'name':'Example','description':'An Australian startup','source':'https://example.com/',
            'founders':[{'name':'Pat Founder','source':'https://example.com/team'}],
            'funding_rounds':[{'id':'example-series-a','stage':'Series A','source':'https://example.com/news'}],
            'articles':[{'title':'New investment','url':'https://example.com/news','published_on':'2026-01-01'}],
            'relationships':[{'target_id':'partner:acme','kind':'backed_by','description':'Backed by Acme','source':'https://example.com/partners'}]}]}
        data=graph.build_graph({},['Acme'],{}, {'opportunities':[]},research)
        self.assertEqual(len(data['articles']),1)
        self.assertEqual(data['articles'][0]['title'],'New investment')
        with tempfile.TemporaryDirectory() as temp:
            source=Path(temp)/'graph.json';target=Path(temp)/'graph.sqlite'
            source.write_text(json.dumps(data),encoding='utf-8');database.build(source,target)
            with sqlite3.connect(target) as db:
                self.assertEqual(db.execute('select count(*) from funding_rounds').fetchone()[0],1)
                self.assertEqual(db.execute('select count(*) from edges').fetchone()[0],2)
                matches=db.execute('select id from entity_search where entity_search match ?',('"acme*"',)).fetchall()
                self.assertIn(('startup:example',),matches)
        research['startups'][0]['relationships'][0]['target_id']='partner:missing'
        with self.assertRaises(ValueError):graph.build_graph({},['Acme'],{}, {'opportunities':[]},research)
    def test_news_collection_is_bounded_and_returns_unreviewed_amounts(self):
        class Transport:
            def __init__(self):self.calls=[]
            def request(self,url,host,**kwargs):
                self.calls.append(url)
                html=(b'<a href="/news/raised">Example raises funding</a><a href="https://elsewhere.test/funding">Other</a>' if len(self.calls)==1 else b'<title>Example raises AUD $2 million</title><p>Example raised AUD $2 million in a seed round.</p>')
                return 200,{'Content-Type':'text/html'},html,url
        t=Transport();args=types.SimpleNamespace(only=[],limit=0,follow=1)
        out=crawl.crawl_startup_news({'sources':[{'id':'example','name':'Example','url':'https://example.com/news'}]},args,t)
        self.assertEqual(len(t.calls),2);self.assertEqual(len(out['candidates']),1)
        candidate=out['candidates'][0];self.assertTrue(candidate['review_required']);self.assertEqual(candidate['startup'],'Example')
        self.assertTrue(candidate['amount_mentions']);self.assertEqual(candidate['discovered_from'],'https://example.com/news')
    def test_news_crawl_prioritizes_funding_without_exceeding_follow_limit(self):
        class Transport:
            def __init__(self):self.calls=[]
            def request(self,url,host,**kwargs):
                self.calls.append(url)
                html=(b'<a href="/launch">Example launches a new feature</a><a href="/funding">Example raises seed funding</a>' if len(self.calls)==1 else b'<title>Example raises funding</title>')
                return 200,{'Content-Type':'text/html'},html,url
        t=Transport();args=types.SimpleNamespace(only=[],limit=0,follow=1)
        crawl.crawl_startup_news({'sources':[{'id':'example','name':'Example','url':'https://example.com/news'}]},args,t)
        self.assertEqual(t.calls,['https://example.com/news','https://example.com/funding'])
