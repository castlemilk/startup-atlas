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
identity=load('atlas_identity','scripts/entity_resolution.py')

class GraphTests(unittest.TestCase):
    def test_missing_founding_year_stays_absent_in_graph_and_sqlite(self):
        for portfolio in (False, True):
            for year in (None, 2018):
                with self.subTest(portfolio=portfolio, year=year):
                    startup={'name':'Example','source':'https://example.com/'}
                    if year is not None: startup['founded_year']=year
                    profiles={'Investor':{'companies':[{'name':'Example','source':'https://example.org/portfolio'}]}} if portfolio else {}
                    result=graph.build_graph(profiles,[],{}, {'opportunities':[]},{'startups':[startup]})
                    entity=next(item for item in result['entities'] if item['id']=='startup:example')
                    if year is None: self.assertNotIn('founded_year',entity)
                    else: self.assertEqual(entity['founded_year'],year)
                    with tempfile.TemporaryDirectory() as temp:
                        source=Path(temp)/'graph.json'; target=Path(temp)/'graph.sqlite'
                        source.write_text(json.dumps(result),encoding='utf-8')
                        database.build(source,target)
                        with sqlite3.connect(target) as db:
                            stored=json.loads(db.execute('select data from entities where id=?',('startup:example',)).fetchone()[0])
                        self.assertEqual(stored,entity)

    def test_founder_social_references_survive_source_to_graph_projection(self):
        socials=[{'label':'LinkedIn','url':'https://www.linkedin.com/in/example-founder',
                  'source':'https://example.com/team','reviewed_at':'2026-01-01'}]
        research={'startups':[{'name':'Example','source':'https://example.com/about',
                              'founders':[{'name':'Example Founder','source':'https://example.com/team',
                                           'socials':socials}]}]}
        result=graph.build_graph({},[],{},{'opportunities':[]},research)
        founder=next(entity for entity in result['entities'] if entity['id']=='person:example-founder')
        self.assertEqual(founder['socials'],socials)
        self.assertEqual(result['edges'][0]['source'],'https://example.com/team')
        self.assertEqual(result['edges'][0]['to'],'startup:example')

    def test_founder_blurb_survives_source_to_graph_projection(self):
        blurb={'text':'Co-founder of Example. Previously a site engineer.',
               'sources':['https://example.com/team','https://example.org/profile'],
               'verified_at':'2026-01-01'}
        research={'startups':[{'name':'Example','source':'https://example.com/about',
                              'founders':[{'name':'Example Founder','source':'https://example.com/team',
                                           'blurb':blurb},
                                          {'name':'Other Founder','source':'https://example.com/team'}]}]}
        result=graph.build_graph({},[],{},{'opportunities':[]},research)
        founder=next(entity for entity in result['entities'] if entity['id']=='person:example-founder')
        self.assertEqual(founder['blurb'],blurb)
        other=next(entity for entity in result['entities'] if entity['id']=='person:other-founder')
        self.assertNotIn('blurb',other)

    def test_cofounder_edges_join_founders_of_the_same_startup(self):
        research={'reviewed':'2026-01-15','startups':[{'name':'Example','source':'https://example.com/about',
            'founders':[
                {'name':'Zoe Founder','source':'https://example.com/team','reviewed_at':'2026-01-02'},
                {'name':'Amy Founder','source':'https://example.com/team','reviewed_at':'2026-01-05'},
                {'name':'Max Founder','source':'https://example.org/press'}]}]}
        result=graph.build_graph({},[],{},{'opportunities':[]},research)
        pairs=[edge for edge in result['edges'] if edge['kind']=='co_founder']
        self.assertEqual(len(pairs),3)
        for edge in pairs:
            self.assertLess(edge['from'],edge['to'])
            self.assertEqual(edge['startup_id'],'startup:example')
            self.assertEqual(edge['description'],'Co-founder of Example')
            self.assertEqual(edge['confidence_basis']['inferred'],False)
            self.assertGreaterEqual(edge['confidence'],0.5)
        shared=next(edge for edge in pairs if {edge['from'],edge['to']}=={'person:amy-founder','person:zoe-founder'})
        self.assertEqual(shared['source'],'https://example.com/team')
        self.assertEqual(shared['last_verified'],'2026-01-05')
        mixed=next(edge for edge in pairs if {edge['from'],edge['to']}=={'person:amy-founder','person:max-founder'})
        self.assertEqual(mixed['source'],'https://example.com/about')
    def test_cofounder_edges_need_two_distinct_founders(self):
        single={'startups':[{'name':'Solo','source':'https://example.com/about',
            'founders':[{'name':'Only Founder','source':'https://example.com/team'}]}]}
        result=graph.build_graph({},[],{},{'opportunities':[]},single)
        self.assertEqual([edge for edge in result['edges'] if edge['kind']=='co_founder'],[])
        duplicated={'startups':[{'name':'Echo','source':'https://example.com/about',
            'founders':[{'name':'Same Person','source':'https://example.com/team'},
                        {'name':'Same Person','source':'https://example.com/team'}]}]}
        result=graph.build_graph({},[],{},{'opportunities':[]},duplicated)
        self.assertEqual([edge for edge in result['edges'] if edge['kind']=='co_founder'],[])
    def test_cofounder_edges_are_scoped_per_startup(self):
        founders=[{'name':'Amy Founder','source':'https://example.com/team'},
                  {'name':'Zoe Founder','source':'https://example.com/team'}]
        research={'startups':[
            {'name':'First','source':'https://example.com/about','founders':founders},
            {'name':'Second','source':'https://example.com/about','founders':founders}]}
        result=graph.build_graph({},[],{},{'opportunities':[]},research)
        pairs=[edge for edge in result['edges'] if edge['kind']=='co_founder']
        self.assertEqual(sorted(edge['startup_id'] for edge in pairs),['startup:first','startup:second'])
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
    def test_shared_evidence_preserves_distinct_funding_round_edges(self):
        source = 'https://example.com/two-rounds'
        profiles = {'Investor': {'companies': [
            {'name': 'Example', 'source': source},
            {'name': 'Example', 'source': source},
        ]}}
        rounds = [
            {'id': 'seed', 'stage': 'Seed', 'source': source,
             'lead_investor': 'Investor', 'participants': ['Member', 'Member']},
            {'id': 'series-a', 'stage': 'Series A', 'source': source,
             'lead_investor': 'Investor', 'participants': ['Member']},
        ]
        result = graph.build_graph(profiles, ['Investor', 'Member'], {},
                                   {'opportunities': []},
                                   {'startups': [{'name': 'Example', 'funding_rounds': rounds}]})
        expected = [
            ('led_round', 'seed'), ('led_round', 'series-a'),
            ('participated_in', 'seed'), ('participated_in', 'series-a'),
            ('supports', ''),
        ]

        def roles(edges):
            return sorted((edge['kind'], edge.get('round_id', '')) for edge in edges)

        self.assertEqual(roles(result['edges']), expected)
        self.assertTrue(all(edge['source'] == source for edge in result['edges']))
        with tempfile.TemporaryDirectory() as temp:
            artifact = Path(temp) / 'graph.json'
            sqlite_path = Path(temp) / 'graph.sqlite'
            artifact.write_text(json.dumps(result), encoding='utf-8')
            database.build(artifact, sqlite_path)
            with sqlite3.connect(sqlite_path) as db:
                stored = list(map(lambda row: json.loads(row[0]),
                                  db.execute('select data from edges')))
            self.assertEqual(roles(stored), expected)

    def test_rejected_merge_does_not_leave_a_funding_alias(self):
        reviewed = {'Canonical Capital': {'website': 'https://canonical.example/',
                                           'aliases': ['Canonical VC']}}
        leads = list(reviewed)
        research = {'startups': [{'name': 'Example', 'funding_rounds': [
            {'id': 'revoked-lead', 'stage': 'Seed', 'lead_investor': 'Unrelated Ventures',
             'source': 'https://example.com/seed'},
            {'id': 'reviewed-lead', 'stage': 'Series A', 'lead_investor': 'Canonical VC',
             'source': 'https://example.com/series-a'},
        ]}]}
        decision = {'kind': 'merge', 'subject': 'partner:unrelated-ventures',
                    'subject_key': 'unrelated-ventures', 'status': 'approved',
                    'candidates': [{'id': 'partner:canonical-capital', 'basis': 'name-similarity'}]}
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            def put(name, value):
                (directory / name).write_text(json.dumps(value), encoding='utf-8')
            for name, value in [('partner-leads.json', leads), ('partners-reviewed.json', reviewed),
                                ('partner-profiles.json', {}), ('startup-research.json', research)]:
                put(name, value)

            def regenerate(status):
                put('review-queue.json', {'entries': [{**decision, 'status': status}]})
                return identity.build_registry(directory, source_revision='fixture',
                                               generated_at='2026-11-25T00:00:00Z')

            def funding_edges(registry):
                result = graph.build_graph({}, leads, reviewed, {'opportunities': []}, research,
                                           identity=registry)
                return sorted((e['round_id'], e['from']) for e in result['edges']
                              if e['kind'] == 'led_round')

            approved = regenerate('approved')
            self.assertEqual(funding_edges(approved), [('reviewed-lead', 'partner:canonical-capital'),
                                                       ('revoked-lead', 'partner:canonical-capital')])
            put('identity.json', approved)
            rejected = regenerate('rejected')
            self.assertEqual(rejected['merges'], [])
            self.assertEqual(rejected['entities']['partner:canonical-capital']['aliases'],
                             ['Canonical VC'])
            self.assertEqual(funding_edges(rejected), [('reviewed-lead', 'partner:canonical-capital')])
            put('identity.json', rejected)
            self.assertEqual(regenerate('rejected'), rejected)

    def test_derived_funding_links_do_not_claim_to_be_announcements(self):
        # The exact Goterra draft initially mislabelled both retrospective
        # counsel's credentials and the intermediary's closed-offer record.
        sources = [
            'https://img.legalvision.com.au/wp-content/uploads/2022/09/01194909/Capital-Raising-Capability-Statement.pdf',
            'https://www.onmarket.com.au/for-companies/past-transactions/',
            'https://tenacious.ventures/insights/investment-notes-goterra',
        ]
        explicit = {'title': 'Explicit investor announcement', 'url': sources[2],
                    'published_on': '2020-04-14', 'kind': 'funding announcement'}
        startup = {'name': 'Goterra', 'funding_rounds': [
            {'id': f'fixture-{i}', 'stage': stage, 'source': source}
            for i, (stage, source) in enumerate(zip(('Seed', 'Equity crowdfunding', 'Series A'), sources))
        ], 'articles': [explicit]}
        result = graph.build_graph({}, [], {}, {'opportunities': []}, {'startups': [startup]})
        self.assertEqual(len(result['articles']), 3)
        articles = {a['url']: a for a in result['articles']}
        self.assertEqual([articles[url]['kind'] for url in sources], ['funding source', 'funding source', 'funding announcement'])
        self.assertEqual(articles[sources[2]], {'startup_id': 'startup:goterra', **explicit})
        self.assertEqual([articles[url]['published_on'] for url in sources], ['', '', '2020-04-14'])

    def test_distinct_names_cannot_silently_collapse_into_same_id(self):
        profiles={'P':{'companies':[{'name':'A&B','source':'https://example.com/'},{'name':'A B','source':'https://example.com/'}]}}
        with self.assertRaises(ValueError):graph.build_graph(profiles,['P'],{}, {'opportunities':[]},{'startups':[]})
    def test_startup_socials_preserve_reviewed_source_attribution(self):
        socials=[{'label':'LinkedIn','url':'https://linkedin.com/company/example','source':'https://example.com/','reviewed_at':'2026-11-17'}]
        data=graph.build_graph({},[],{}, {'opportunities':[]},{'startups':[{'name':'Example','source':'https://example.com/','socials':socials}]})
        self.assertEqual(data['entities'][0]['socials'],socials)

    def test_reviewed_startup_updates_flow_into_the_sqlite_index(self):
        research={'startups':[{'name':'Example','description':'An Australian startup','source':'https://example.com/',
            'founders':[{'name':'Pat Founder','source':'https://example.com/team'}],
            'funding_rounds':[{'id':'example-series-a','stage':'Series A','source':'https://example.com/news'}],
            'articles':[{'title':'New investment','url':'https://example.com/news','published_on':'2026-01-01'}],
            'relationships':[{'target_id':'partner:acme','kind':'backed_by','description':'Backed by Acme','source':'https://example.com/partners'}]}]}
        data=graph.build_graph({},['Acme'],{}, {'opportunities':[]},research)
        next(e for e in data['entities'] if e['id']=='startup:example')['aliases']=['Exemplar']
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
                alias_matches=db.execute('select id from entity_search where entity_search match ?',('"exemplar*"',)).fetchall()
                self.assertIn(('startup:example',),alias_matches)
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
