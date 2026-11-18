"""Offline-only scoped approval regression tests; no real DNS/HTTP."""
import csv
import json
from pathlib import Path
import sys
import tempfile
import types
import unittest
from unittest.mock import Mock, patch

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import crawl
from plan_company_profiles import build_plan
from replay_company_profiles import compile_replay

HOME='https://example.com/'
TEAM='https://example.com/team'


def policy(**updates):
    return dict(version=1,allowed_urls=[HOME,TEAM],denied_urls=[],max_follow=2,**updates)


class ScopeTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name); self.csv=self.root/'seeds.csv'
        self.overlay=self.root/'overlay.json'
        self.overlay.write_text(json.dumps({'startups':[{'name':'Example','website':HOME}]}))
        self.args=types.SimpleNamespace(approved=self.csv,partner=None,limit=0,follow=2,partners_only=True,only=[],out=self.root,logo_limit=2)

    def seeds(self,scope,approved='yes',name='Example',url=HOME):
        with self.csv.open('w') as f:
            writer=csv.DictWriter(f,fieldnames=['partner','official_website','approved','crawl_scope'])
            writer.writeheader();writer.writerow(dict(partner=name,official_website=url,approved=approved,crawl_scope=scope))

    def test_legacy_absent_and_blank_unchanged(self):
        row=dict(partner='Example',official_website=HOME,approved='yes')
        a=crawl.parse_approved_rows([row],{'Example'},False)
        self.assertNotIn('crawl_scope',a[0])
        self.assertEqual(a,crawl.parse_approved_rows([{**row,'crawl_scope':''}],{'Example'},False))

    def test_nonapproval_never_grants_permission(self):
        self.seeds(json.dumps(policy()),approved='no')
        self.assertEqual(crawl.load_approved_csv(self.csv,{'Example'},False),[])

    def test_malformed_contract_and_duplicate_keys_fail_closed(self):
        bad=['null','{}','[]','bad','{"version":1,"version":1}',json.dumps({**policy(),'version':True}),
             json.dumps({**policy(),'max_follow':True}),json.dumps({**policy(),'max_follow':21}),
             json.dumps({**policy(),'allowed_urls':[]}),json.dumps({**policy(),'unknown':1}),
             json.dumps({**policy(),'denied_urls':[HOME]}),json.dumps({**policy(),'allowed_urls':[TEAM]})]
        for raw in bad:
            with self.subTest(raw=raw), self.assertRaises(crawl.CrawlError): crawl.parse_crawl_scope(raw,HOME)

    def test_exact_host_path_query_and_denial_boundaries(self):
        scope=crawl.parse_crawl_scope(json.dumps({**policy(),'allowed_urls':[HOME,TEAM,TEAM+'?lang=en'],'denied_urls':[TEAM]}),HOME)
        crawl.check_crawl_scope(TEAM+'?lang=en',scope,'example.com')
        for url in [TEAM,TEAM+'/member',TEAM+'s',TEAM+'?lang=fr',TEAM+'?lang=en&x=1',
                    'https://sub.example.com/team','https://example.com.evil.test/team',
                    'https://example.com:444/team','http://example.com/team','https://x@example.com/team']:
            with self.subTest(url=url),self.assertRaises(crawl.CrawlError): crawl.check_crawl_scope(url,scope,'example.com')

    def test_ambiguous_paths_rejected_even_if_explicitly_listed(self):
        for path in ['/a/../team','/%2e%2e/team','/%252e%252e/team','/a%2fteam','/a\\team','//team','/team;x','/team.','/team#anchor']:
            with self.subTest(path=path),self.assertRaises(crawl.CrawlError):
                crawl.parse_crawl_scope(json.dumps({**policy(),'allowed_urls':[HOME,'https://example.com'+path]}),HOME)

    def test_disallowed_initial_url_never_reaches_transport(self):
        transport=Mock()
        with self.assertRaises(crawl.CrawlError): crawl.scoped_request(transport,TEAM+'/private','example.com',policy())
        transport.request.assert_not_called()

    def test_redirect_chain_cannot_escape_and_checks_each_hop(self):
        class Response:
            status=302
            def __init__(self,location): self.headers={'Location':location}
            def __enter__(self): return self
            def __exit__(self,*args): pass
        transport=crawl.Transport()
        with patch.object(crawl.socket,'getaddrinfo',return_value=[(0,0,0,'',('93.184.216.34',443))]),patch.object(crawl.time,'sleep'),patch.object(transport.opener,'open',side_effect=[Response(TEAM),Response('/private')]) as request:
            with self.assertRaises(crawl.CrawlError): crawl.scoped_request(transport,HOME,'example.com',policy())
            self.assertEqual(request.call_count,2)
            self.assertEqual([x.args[0].full_url for x in request.call_args_list],[HOME,TEAM])

    def test_final_readback_cannot_escape_with_nonstandard_transport(self):
        transport=Mock();transport.request.return_value=(200,{},b'','https://example.com/private')
        with self.assertRaises(crawl.CrawlError): crawl.scoped_request(transport,HOME,'example.com',policy())

    def test_follow_scope_denials_are_visible_without_requests(self):
        self.seeds(json.dumps({**policy(),'allowed_urls':[HOME]}))
        transport=Mock();transport.request.return_value=(200,{'Content-Type':'text/html'},b'<a href="/team">Team</a>',HOME)
        result=crawl.crawl_company_profiles([{'name':'Example','website':HOME}],self.args,transport)
        self.assertEqual(transport.request.call_count,1)
        self.assertEqual([x['status'] for x in result['results'][0]['pages']],['ok','skipped'])
        self.assertEqual(result['results'][0]['crawl_scope']['allowed_urls'],[HOME])

    def test_follow_cap_overrides_cli(self):
        self.seeds(json.dumps({**policy(),'max_follow':0}))
        transport=Mock();transport.request.return_value=(200,{},b'<a href="/team">Team</a>',HOME)
        result=crawl.crawl_company_profiles([{'name':'Example','website':HOME}],self.args,transport)
        self.assertEqual(transport.request.call_count,1);self.assertEqual(len(result['results'][0]['pages']),1)

    def test_scoped_asset_capture_is_denied(self):
        transport=Mock()
        page={'status':'ok','final_url':HOME,'logo_candidates':[{'url':HOME+'logo.png','kind':'logo','same_host':True}]}
        result=crawl.stage_partner_logos({'results':[{'name':'Example','crawl_scope':policy(),'pages':[page]}]},self.args,transport)
        transport.request.assert_not_called();self.assertEqual(result['candidates'][0]['status'],'not_fetched')

    def test_sites_does_not_reuse_broad_cached_result_for_narrow_scope(self):
        with self.csv.open('w') as f:
            writer=csv.DictWriter(f,fieldnames=['partner','official_website','approved','crawl_scope']);writer.writeheader()
            for name,scope in [('Broad',''),('Narrow',json.dumps({**policy(),'allowed_urls':[HOME]}))]:
                writer.writerow(dict(partner=name,official_website=HOME,approved='yes',crawl_scope=scope))
        transport=Mock()
        def fetch(url,*args,**kwargs): return 200,{},b'<a href="/team">startup team</a>',url
        transport.request.side_effect=fetch
        result=crawl.crawl_sites({'opportunities':[],'partnerLeads':['Broad','Narrow']},self.args,transport)
        self.assertEqual(result['results'][0]['pages'][1]['status'],'ok')
        self.assertEqual(result['results'][1]['pages'][1]['status'],'skipped')

    def test_planner_preserves_scope_and_rejects_malformed_input(self):
        self.seeds(json.dumps(policy()))
        result=build_plan(self.overlay,self.csv,'a'*40)
        self.assertEqual(result['items'][0]['crawl_scope'],policy())
        self.seeds('{}')
        with self.assertRaises(crawl.CrawlError): build_plan(self.overlay,self.csv,'a'*40)

    def test_replay_requires_matching_scope_and_rejects_out_of_scope_success(self):
        self.seeds(json.dumps(policy()));packet=self.root/'packet.json';at='2026-11-18T12:00:00Z'
        row={'name':'Example','url':HOME,'crawl_scope':policy(),'pages':[{'url':HOME,'final_url':HOME,'checked_at':at,'status':'ok','http_status':200}]}
        def replay():
            packet.write_text(json.dumps({'version':1,'mode':'company-profiles','generated_at':at,'results':[row],'candidates':[]}))
            return compile_replay(self.overlay,self.csv,packet,'a'*40,at)
        replay();row['pages'][0]['final_url']=HOME+'private'
        with self.assertRaises(crawl.CrawlError): replay()
        row['pages'][0]['final_url']=HOME;del row['crawl_scope']
        with self.assertRaises(ValueError): replay()

    def test_ambiguous_csv_cannot_downgrade_scope_to_legacy(self):
        for content in [
            'partner,official_website,approved,crawl_scope,crawl_scope\nExample,https://example.com/,yes,{malformed},\n',
            'partner,official_website,approved,crawl_scope\nExample,https://example.com/,yes\n',
            'partner,official_website,approved,crawl_scope\nExample,https://example.com/,yes,,extra\n']:
            self.csv.write_text(content)
            with self.assertRaises(crawl.CrawlError): crawl.load_approved_csv(self.csv,{'Example'},False)
            with self.assertRaises(ValueError): build_plan(self.overlay,self.csv,'a'*40)
