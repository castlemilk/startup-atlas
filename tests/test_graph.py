import importlib.util
from pathlib import Path
import types
import unittest

ROOT=Path(__file__).resolve().parents[1]
def load(name,path):
    spec=importlib.util.spec_from_file_location(name,ROOT/path)
    mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod);return mod
graph=load('atlas_graph','scripts/make-graph.py')
crawl=load('atlas_crawl_news','scripts/crawl.py')

class GraphTests(unittest.TestCase):
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
