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
    def test_lazy_logo_variants_icons_and_metadata_are_candidates(self):
        source=b'''<head><meta itemprop="logo" content="/meta.svg"><link rel="apple-touch-icon" href="/touch.png"></head><body><img class="brandLogo" data-src="/lazy.svg" src="data:image/gif;base64,R0lG" data-srcset="/small.svg 1x, https://cdn.example.com/large.svg 2x"><img alt="company logo" srcset="data:image/png;base64,AAAA 1x, /invalid.png 2x"></body>'''
        rows=crawl.extract_page(source,'https://example.com/')['logo_candidates']
        urls={row['url']:row for row in rows}
        self.assertEqual(set(urls),{'https://example.com/lazy.svg','https://example.com/small.svg','https://cdn.example.com/large.svg','https://example.com/touch.png','https://example.com/meta.svg'})
        self.assertEqual(urls['https://example.com/touch.png']['kind'],'site-icon')
        self.assertEqual(urls['https://example.com/meta.svg']['kind'],'metadata-logo')
        self.assertFalse(urls['https://cdn.example.com/large.svg']['same_host'])
        self.assertTrue(all(row['review_required'] for row in rows))
    def test_directory_table_cells_exclude_nested_tables_and_hidden_text(self):
        source=b'''<table><tr><th>Partner</th><th>Type</th></tr><tr><td><a href="https://example.org">Example <b>Ventures</b></a><script>hidden</script><table><tr><td>nested</td></tr></table></td><td>Venture Capital</td></tr></table>'''
        rows=crawl.extract_page(source,'https://example.com/')['tables'][0]['rows']
        self.assertEqual(rows[1][0]['text'],'Example Ventures')
        self.assertEqual(rows[1][0]['links'],['https://example.org'])
        self.assertEqual(rows[1][1]['text'],'Venture Capital')
    def test_logo_candidates_retain_provenance_and_do_not_assume_social_art_is_a_logo(self):
        source=b'''<html><head><link rel="icon" href="/favicon.png"><meta property="og:image" content="https://cdn.example.com/social.png"><script type="application/ld+json">{"@type":"Organization","name":"Example","logo":{"url":"/brand.svg"}}</script></head><body><img class="site-logo" src="/logo.png" alt="Example logo"></body></html>'''
        rows=crawl.extract_page(source,'https://example.com/')['logo_candidates']
        self.assertEqual([row['kind'] for row in rows],['structured-logo','page-logo-image','site-icon','social-image'])
        self.assertTrue(all(row['review_required'] and row['source']=='https://example.com/' for row in rows))
        self.assertFalse(rows[-1]['same_host'])
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
    def test_nested_program_links_and_categorised_evidence(self):
        source=b'''<li><a href="/startup-accelerator"><h3>Frontier Accelerator</h3></a><p>Up to $20,000 in credits for seed startups.</p><p>Applications close 2026-12-01.</p><p>A matching cash contribution is required.</p></li>'''
        got=crawl.extract_page(source,'https://example.com/programs')
        link=next(x for x in got['links'] if x.get('url')=='https://example.com/startup-accelerator')
        self.assertEqual(link['text'],'Frontier Accelerator')
        self.assertIn('seed startups',link['context'])
        self.assertIn('benefits',got['evidence'])
        self.assertIn('duration_and_deadlines',got['evidence'])
        self.assertIn('equity_and_cost',got['evidence'])
        self.assertTrue(all(item['source']=='https://example.com/programs' for rows in got['evidence'].values() for item in rows))
    def test_supplied_excerpts_are_explicitly_marked_as_partial(self):
        result=crawl.process_text_captures({'documents':[{'name':'Example','url':'https://example.com/program','acquisition':'search excerpt','text':'L5: Up to $5,000 in startup credits.\nL6: Credits expire in 12 months.'}]})
        row=result['results'][0]
        self.assertEqual(row['status'],'provided_text')
        self.assertEqual(row['coverage'],'partial excerpt')
        self.assertIn('benefits',row['evidence'])
        self.assertIn('not direct crawler fetches',result['warning'])
        self.assertTrue(any('$5,000' in item['mention'] for item in row['amount_mentions']))
        self.assertTrue(all(not item['context'].startswith('L5:') for item in row['amount_mentions']))

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
    def test_directory_discovery_preserves_provenance_without_following_candidates(self):
        class Fake:
            delay=1
            def __init__(self): self.calls=[]
            def request(self,url,*args,**kwargs):
                self.calls.append(url)
                if url.endswith('/robots.txt'): return 404,{},b'',url
                html=b'''<table><tr><th>Navigation</th></tr></table><table><tr><th>Partner</th><th>Type</th></tr><tr><td><a href="https://new.example/">Example Ventures</a></td><td>Venture Capital, Startup Ecosystem Partner</td></tr><tr><td>8VC</td><td>Venture Capital</td></tr><tr><td>8VC</td><td>Venture Capital</td></tr><tr><td>Example Retail</td><td>Retail</td></tr></table>'''
                return 200,{'Content-Type':'text/html'},html,url
        registry={'sources':[{'id':'one','name':'Official directory','url':'https://example.com/partners','scope':'Not specified','provider':'Example provider','name_column':'Partner','type_column':'Type','accepted_types':['Venture Capital','Accelerator/Incubator','Startup Ecosystem Partner']}]}
        args=types.SimpleNamespace(only=[],approved=None,limit=0,follow=0,partners_only=False)
        transport=Fake(); result=crawl.crawl_partner_directories(registry,{'partnerLeads':['8VC']},args,transport)
        self.assertEqual([item['name'] for item in result['candidates']],['Example Ventures','8VC'])
        candidate=result['candidates'][0]
        self.assertEqual(candidate['source_url'],'https://example.com/partners')
        self.assertEqual(candidate['source_scope'],'Not specified')
        self.assertEqual(candidate['provider'],'Example provider')
        self.assertTrue(candidate['checked_at'])
        self.assertEqual(candidate['website_candidate'],'https://new.example/')
        self.assertFalse(candidate['existing_lead_exact'])
        self.assertTrue(result['candidates'][1]['existing_lead_exact'])
        self.assertTrue(all(item['review_required'] for item in result['candidates']))
        self.assertEqual(transport.calls,['https://example.com/robots.txt','https://example.com/partners'])
    def test_directory_missing_table_is_reported(self):
        class Fake:
            delay=1
            def request(self,url,*args,**kwargs):
                return (404,{},b'',url) if url.endswith('/robots.txt') else (200,{'Content-Type':'text/html'},b'<main>Directory loaded by script</main>',url)
        registry={'sources':[{'id':'one','name':'Directory','url':'https://example.com/','scope':'Not specified','provider':'Provider','name_column':'Partner','type_column':'Type','accepted_types':['Venture Capital']}]}
        args=types.SimpleNamespace(only=[],approved=None,limit=0,follow=0,partners_only=False)
        result=crawl.crawl_partner_directories(registry,{'partnerLeads':[]},args,Fake())
        self.assertEqual(result['candidates'],[])
        self.assertIn('No matching partner table',result['notes'][0]['message'])
    def test_directory_leads_can_be_enriched_without_losing_source_or_auto_approval(self):
        lead={'name':'=Example Ventures','reported_type':'Venture Capital','provider':'Provider','source_name':'Directory','source_url':'https://example.com/directory','source_scope':'Not specified','checked_at':'2026-11-12','website_candidate':'','existing_lead_exact':False}
        responses=[{'search':[{'id':'Q42','label':'Example Ventures'}]}, {'entities':{'Q42':{'claims':{}}}}]
        with tempfile.TemporaryDirectory() as tmp:
            directory=Path(tmp)/'directory.csv'; review=Path(tmp)/'review.csv'
            crawl.write_partner_directory_review_csv(directory,{'candidates':[lead]})
            args=types.SimpleNamespace(partner=None,limit=0,candidates=5,leads=directory)
            with patch.object(crawl,'api_json',side_effect=responses): result=crawl.discover({'partnerLeads':[]},args,object())
            self.assertEqual(result['results'][0]['partner'],'=Example Ventures')
            self.assertEqual(result['results'][0]['directory_source']['url'],'https://example.com/directory')
            crawl.write_review_csv(review,result)
            with review.open(newline='') as handle: row=next(csv.DictReader(handle))
            self.assertEqual(row['partner'],"'=Example Ventures")
            self.assertEqual(row['directory_checked_at'],'2026-11-12')
            self.assertEqual(row['approved'],'')
    def test_logo_capture_respects_robots_and_stages_only_same_host_logo_candidates(self):
        class Fake:
            delay=1
            calls=[]
            def request(self,url,*args,**kwargs):
                self.calls.append(url)
                if url.endswith('/robots.txt'): return 200,{},b'User-agent: *\nDisallow: /blocked.png\n',url
                return 200,{'Content-Type':'image/png'},b'\x89PNG\r\n\x1a\nexample',url
        with tempfile.TemporaryDirectory() as tmp:
            snapshot={'results':[{'name':'Example','pages':[{'status':'ok','final_url':'https://example.com/','logo_candidates':[
                {'url':'https://example.com/logo.png','kind':'page-logo-image','source':'https://example.com/','same_host':True,'review_required':True},
                {'url':'https://example.com/blocked.png','kind':'site-icon','source':'https://example.com/','same_host':True,'review_required':True},
                {'url':'https://cdn.example.com/logo.png','kind':'structured-logo','source':'https://example.com/','same_host':False,'review_required':True},
                {'url':'https://example.com/share.png','kind':'social-image','source':'https://example.com/','same_host':True,'review_required':True}]}]}]}
            transport=Fake();result=crawl.stage_partner_logos(snapshot,types.SimpleNamespace(out=Path(tmp),logo_limit=3),transport)
            self.assertEqual([r['status'] for r in result['candidates']],['captured','skipped','not_fetched','not_fetched'])
            self.assertTrue(Path(result['candidates'][0]['file']).name.endswith('.bin'))
            self.assertNotIn('https://example.com/blocked.png',transport.calls)
            self.assertNotIn('https://cdn.example.com/logo.png',transport.calls)
            self.assertNotIn('https://example.com/share.png',transport.calls)
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
    def test_program_discovery_keeps_candidates_unapproved(self):
        class Fake:
            delay=1
            def request(self,url,*args,**kwargs):
                if url.endswith('/robots.txt'): return 404,{},b'',url
                return 200,{'Content-Type':'text/html'},b'<li><a href="/founder-program"><h3>Founder Program</h3></a><p>For seed founders.</p></li>',url
        registry={'sources':[{'id':'one','name':'Official directory','url':'https://example.com/programs','scope':'Australia'}]}
        args=types.SimpleNamespace(only=[],approved=None,limit=0,follow=0,partners_only=False)
        result=crawl.crawl_program_directories(registry,args,Fake())
        candidate=result['candidates'][0]
        self.assertEqual(candidate['label'],'Founder Program')
        self.assertEqual(candidate['source_scope'],'Australia')
        self.assertTrue(candidate['review_required'])
    def test_named_heading_link_uses_following_programme_description(self):
        class Fake:
            delay=1
            def request(self,url,*args,**kwargs):
                if url.endswith('/robots.txt'): return 404,{},b'',url
                html=b'<h3><a href="https://health.example/">ANDHealth</a></h3><p>ACTIVATE is a six-month accelerator for Victorian health startups.</p>'
                return 200,{'Content-Type':'text/html'},html,url
        registry={'sources':[{'id':'one','name':'Official directory','url':'https://example.com/programs','scope':'Australia'}]}
        args=types.SimpleNamespace(only=[],approved=None,limit=0,follow=0,partners_only=False)
        result=crawl.crawl_program_directories(registry,args,Fake())
        self.assertEqual(result['candidates'][0]['label'],'ANDHealth')
        self.assertIn('accelerator',result['candidates'][0]['context'])
        self.assertEqual(result['candidates'][0]['program_url'],'https://health.example/')
    def test_discovery_keeps_ambiguous_candidates_unverified(self):
        responses=[{'search':[{'id':'Q42','label':'AIR','description':'an airline'}]}, {'entities':{'Q42':{'claims':{'P856':[{'mainsnak':{'datavalue':{'value':'https://example.com'}},'rank':'normal'}]}}}}]
        args=types.SimpleNamespace(partner=None,limit=0,candidates=5)
        with patch.object(crawl,'api_json',side_effect=responses):
            result=crawl.discover({'partnerLeads':['AIR']},args,object())
        self.assertIn('unverified',result['warning'].lower())
        candidate=result['results'][0]['candidates'][0]
        self.assertEqual(candidate['properties']['official_website'],['https://example.com'])
        self.assertNotIn('approved',candidate)
    def test_discovery_splits_oversized_entity_batches(self):
        responses=[{'search':[{'id':'Q1','label':'A'}, {'id':'Q2','label':'B'}]},
                   crawl.CrawlError('response exceeds size limit'),
                   {'entities':{'Q1':{'claims':{}}}}, {'entities':{'Q2':{'claims':{}}}}]
        args=types.SimpleNamespace(partner=None,limit=0,candidates=5)
        with patch.object(crawl,'api_json',side_effect=responses) as api:
            result=crawl.discover({'partnerLeads':['AIR']},args,object())
        self.assertEqual(len(result['results'][0]['candidates']),2)
        self.assertEqual(api.call_count,4)
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
