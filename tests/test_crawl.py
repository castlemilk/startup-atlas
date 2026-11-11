import csv
import importlib.util
import json
from pathlib import Path
import tempfile
import types
import unittest
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('atlas_crawl',Path(__file__).resolve().parents[1]/'scripts/crawl.py')
crawl=importlib.util.module_from_spec(spec); spec.loader.exec_module(crawl)

class RobotsTests(unittest.TestCase):
    def test_group_precedence_wildcards_and_allow_tie(self):
        rules,delay=crawl.robots_groups('''User-agent: *\nDisallow: /\nUser-agent: StartupAtlasResearchBot\nDisallow: /private\nAllow: /private/public\nDisallow: /*?secret=*\nCrawl-delay: 3\n''')
        self.assertEqual(delay,3)
        self.assertTrue(crawl.robots_allowed(rules,'https://example.com/about'))
        self.assertFalse(crawl.robots_allowed(rules,'https://example.com/private/terms'))
        self.assertTrue(crawl.robots_allowed(rules,'https://example.com/private/public'))
        self.assertFalse(crawl.robots_allowed(rules,'https://example.com/page?secret=1'))
        self.assertTrue(crawl.robots_allowed([('disallow','/x'),('allow','/x')],'https://example.com/x'))
    def test_robot_failure_denies_and_404_allows(self):
        class Fake:
            delay=1
            def __init__(self,status): self.status=status
            def request(self,*args,**kwargs): return self.status,{},b'',args[0]
        with self.assertRaises(crawl.CrawlError): crawl.RobotPolicy(Fake(503)).check('https://example.com/x')
        self.assertEqual(crawl.RobotPolicy(Fake(404)).check('https://example.com/x'),1)

class ExtractionTests(unittest.TestCase):
    def test_page_metadata_jsonld_and_bounded_same_host_follow(self):
        source=b'''<html lang="en"><head><title>Startup Program</title><meta name="description" content="Cloud credits"><meta property="og:image" content="https://example.com/logo.png"><link rel="icon" href="/favicon.svg"><script type="application/ld+json">{"@type":"Organization","name":"Example","foundingDate":"2020","url":"https://example.com/"}</script><script>alert('not visible')</script></head><body><h1>Credits for startups</h1><p>Eligibility requires a product.</p><a href="/apply">Apply now</a><a href="https://other.test/apply">Apply elsewhere</a></body></html>'''
        got=crawl.extract_page(source,'https://example.com/program')
        self.assertEqual(got['title'],'Startup Program')
        self.assertEqual(got['metadata']['description'],'Cloud credits')
        self.assertEqual(got['structured_data'][0]['foundingDate'],'2020')
        self.assertTrue(any('Eligibility' in x for x in got['signals']))
        self.assertFalse(any('not visible' in x for x in got['signals']))
        self.assertEqual(crawl.follow_links(got,'https://example.com/program',2),['https://example.com/apply'])
        self.assertEqual(crawl.follow_links(got,'https://example.com/program',0),[])

class TransportTests(unittest.TestCase):
    def test_redirects_cannot_escape_host_or_skip_robot_guard(self):
        class Response:
            status=302
            def __init__(self,location): self.headers={'Location':location}
            def __enter__(self): return self
            def __exit__(self,*args): pass
        t=crawl.Transport(); calls=[]
        def request_to(location):
            t.opener.open=lambda *args,**kwargs: (calls.append(args[0].full_url) or Response(location))
        with patch.object(crawl.socket,'getaddrinfo',return_value=[(0,0,0,'',('93.184.216.34',443))]), patch.object(crawl.time,'sleep'):
            request_to('https://other.example/private')
            with self.assertRaisesRegex(crawl.CrawlError,'leaves the approved'): t.request('https://example.com/start')
            self.assertEqual(len(calls),1)
            calls.clear(); request_to('/blocked')
            def deny(_): raise crawl.CrawlError('disallowed by robots.txt')
            with self.assertRaisesRegex(crawl.CrawlError,'robots.txt'): t.request('https://example.com/start',redirect_guard=deny)
            self.assertEqual(len(calls),1)

class WorkflowTests(unittest.TestCase):
    def test_untrusted_csv_cells_cannot_become_spreadsheet_formulas(self):
        for value in ('=1+1',' +cmd','@sum(A1:A2)','-1+2','\ttext'):
            self.assertTrue(crawl.csv_safe(value).startswith("'"))
        self.assertEqual(crawl.csv_safe('ordinary startup'),'ordinary startup')

    def test_sites_crawls_extra_sources_and_respects_robots(self):
        class Fake:
            delay=1
            def request(self,url,*args,**kwargs):
                if url.endswith('/robots.txt'): return 200,{},b'User-agent: *\nDisallow: /blocked\n',url
                return 200,{'Content-Type':'text/html'},b'<title>Program</title><a href="/blocked">Eligibility</a>',url
        catalogue={'opportunities':[{'id':'one','name':'One','url':'https://example.com/start','extra':['https://example.com/terms']}], 'partnerLeads':[]}
        args=types.SimpleNamespace(only=[],approved=None,limit=0,follow=1,partners_only=False)
        result=crawl.crawl_sites(catalogue,args,Fake())['results'][0]['pages']
        self.assertEqual([p['status'] for p in result],['ok','ok','skipped'])
        self.assertIn('robots.txt',result[2]['reason'])
    def test_discovery_keeps_ambiguous_candidates_unverified(self):
        responses=[{'search':[{'id':'Q42','label':'AIR','description':'an airline'}]}, {'entities':{'Q42':{'claims':{'P856':[{'mainsnak':{'datavalue':{'value':'https://example.com'}},'rank':'normal'}]}}}}]
        args=types.SimpleNamespace(partner=None,limit=0,candidates=5)
        with patch.object(crawl,'api_json',side_effect=responses):
            result=crawl.discover({'partnerLeads':['AIR']},args,object())
        self.assertIn('unverified',result['warning'].lower())
        candidate=result['results'][0]['candidates'][0]
        self.assertEqual(candidate['properties']['official_website'],['https://example.com'])
        self.assertNotIn('approved',candidate)
    def test_review_requires_explicit_selection_and_rejects_duplicates(self):
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'review.csv'
            with path.open('w',newline='') as f:
                w=csv.DictWriter(f,fieldnames=['partner','qid','official_website','description','approved']);w.writeheader()
                w.writerow({'partner':'AIR','qid':'Q42','official_website':'https://example.com','description':'A candidate','approved':''})
            self.assertEqual(crawl.load_approved_csv(path,{'AIR'}),[])
            with path.open('a',newline='') as f:
                w=csv.DictWriter(f,fieldnames=['partner','qid','official_website','description','approved']);w.writerow({'partner':'AIR','qid':'Q42','official_website':'https://example.com','approved':'yes'})
            self.assertEqual(crawl.load_approved_csv(path,{'AIR'})[0]['qid'],'Q42')
            with path.open('a',newline='') as f:
                w=csv.DictWriter(f,fieldnames=['partner','qid','official_website','description','approved']);w.writerow({'partner':'AIR','qid':'Q43','official_website':'https://other.com','approved':'yes'})
            with self.assertRaises(crawl.CrawlError): crawl.load_approved_csv(path,{'AIR'})
    def test_import_preserves_existing_reviewed_records_and_uses_matching_snapshot(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp); (root/'data').mkdir()
            (root/'data/catalogue.json').write_text(json.dumps({'partnerLeads':['AIR','Acrew'],'opportunities':[]}))
            (root/'data/partners-reviewed.json').write_text(json.dumps({'Acrew':{'website':'https://acrew.example','description':'existing'}}))
            review=root/'review.csv'
            review.write_text('partner,qid,official_website,description,approved\nAIR,Q42,https://example.com,manual description,yes\n')
            snapshot=root/'sites.json'
            snapshot.write_text(json.dumps({'results':[{'id':'partner:Q42','name':'AIR','url':'https://example.com','pages':[{'status':'ok','url':'https://example.com','final_url':'https://example.com/','checked_at':'2026-11-11','metadata':{'description':'site description'}}]}]}))
            with patch.object(crawl,'ROOT',root), patch.object(crawl,'CATALOGUE',root/'data/catalogue.json'):
                self.assertEqual(crawl.main(['apply-reviewed','--approved',str(review),'--snapshot',str(snapshot),'--out',str(root/'out')]),0)
            saved=json.loads((root/'data/partners-reviewed.json').read_text())
            self.assertEqual(saved['Acrew']['description'],'existing')
            self.assertEqual(saved['AIR']['site_description'],'site description')
            self.assertEqual(saved['AIR']['source'],'https://www.wikidata.org/wiki/Q42')

if __name__=='__main__': unittest.main()
