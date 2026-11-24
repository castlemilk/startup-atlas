"""Offline HTML fixtures for company journey observations."""
import csv
from hashlib import sha256
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from scripts import crawl
from scripts.run_scoped_collection import snapshot, verified_modules


ROOT = Path(__file__).resolve().parents[1]
HOME = 'https://example.com/'
COMPANY = {'name': 'Example', 'website': HOME, 'founders': [{'name': 'Ada Example'}]}
ORGANIZATION = {'@type': 'Organization', 'name': 'Example', 'url': HOME}
REVIEWED_AT = '2026-11-19T01:00:00Z'


def jsonld(*subjects):
    data = json.dumps({'@graph': subjects})
    return f'<script type="application/ld+json">{data}</script>'


def html(*subjects, head='', body=''):
    return f'<head>{head}{jsonld(*subjects)}</head>{body}'.encode()


def page(path, *subjects, head='', body=''):
    url = HOME.rstrip('/') + path
    return {'final_url': url, 'checked_at': REVIEWED_AT, **crawl.extract_page(html(*subjects, head=head, body=body), url)}


def news(path, **fields):
    return {'@type': 'NewsArticle', 'url': path, 'headline': 'Example opens a research site',
            'publisher': ORGANIZATION, **fields}


def founder(path, **fields):
    return {'@type': 'Person', 'name': 'Ada Example', 'url': path, 'worksFor': ORGANIZATION,
            'jobTitle': 'Co-founder and engineer', 'description': 'A career in hardware research.', **fields}


def article_markup(path, content):
    return f'<article itemscope itemtype="https://schema.org/NewsArticle" itemid="{path}">{content}</article>'


class CompanyJourneyTests(unittest.TestCase):
    def article_candidates(self, *pages):
        observations = [item for entry in pages if (item := crawl.newsroom_observation(COMPANY, entry))]
        return list(crawl.stage_newsroom_articles(COMPANY['name'], observations))

    def test_syndication_preserves_both_observations_and_original_publish_day(self):
        canonical = '<link rel="canonical" href="/news/original">'
        original = page('/news/original', news('/news/original', datePublished='2025-02-26T23:45:00-08:00'))
        syndicated = page('/news/reprint', news('/news/original'), head=canonical)
        candidate, = self.article_candidates(syndicated, original)
        self.assertEqual(candidate['candidate_url'], HOME+'news/original')
        self.assertEqual(candidate['published_on'], '2025-02-26')
        self.assertEqual(candidate['date_state'], 'reported')
        self.assertTrue(candidate['review_required'])
        self.assertEqual([item['source_url'] for item in candidate['observations']],
                         [HOME+'news/reprint', HOME+'news/original'])
        self.assertEqual(candidate['observations'][1]['date_evidence'],
                         [{'field': 'structured.datePublished', 'value': '2025-02-26T23:45:00-08:00'}])
        self.assertEqual(self.article_candidates(syndicated)[0]['candidate_url'], HOME+'news/reprint')

    def test_syndication_with_conflicting_publication_days_exposes_the_gap(self):
        canonical = '<link rel="canonical" href="/news/original">'
        original = page('/news/original', news('/news/original', datePublished='2025-02-26'))
        syndicated = page('/news/reprint', news('/news/original', datePublished='2025-02-27'), head=canonical)
        candidate, = self.article_candidates(original, syndicated)
        self.assertEqual(candidate['date_state'], 'conflict')
        self.assertNotIn('published_on', candidate)

    def test_missing_date_does_not_inherit_modification_or_generic_event_time(self):
        article = page('/news/unknown', news('/news/unknown', dateModified='2025-03-03', datePublished='2025-02-30'),
                       head='<meta property="article:modified_time" content="2025-04-01">',
                       body='<time datetime="2025-01-01">Project start</time>')
        candidate, = self.article_candidates(article)
        self.assertEqual(candidate['date_state'], 'missing')
        self.assertNotIn('published_on', candidate)
        self.assertEqual(candidate['observations'][0]['date_evidence'],
                         [{'field': 'structured.datePublished', 'value': '2025-02-30'}])

    def test_explicit_html_publication_time_is_a_dated_candidate(self):
        head = '<title>Example breaks ground</title><meta property="og:type" content="article"><meta property="og:site_name" content="Example">'
        body = ('<article itemscope itemtype="https://schema.org/NewsArticle">'
                '<time itemprop="datePublished" datetime="2025-02-28">28 February</time>'
                '<link itemprop="url" href="/news/start"></article>')
        entry = page('/news/start', head=head, body=body)
        candidate, = self.article_candidates(entry)
        self.assertEqual(candidate['published_on'], '2025-02-28')
        self.assertEqual(candidate['observations'][0]['date_evidence'][0]['subject_url'], HOME+'news/start')

    def test_unrelated_article_time_stays_unbound(self):
        body = article_markup('/news/unrelated', '<a itemprop="url" href="/news/unrelated">Other story</a>'
                                                '<time itemprop="datePublished" datetime="2020-01-02">2020</time>')
        entry = page('/news/current', news('/news/current'), body=body)
        candidate, = self.article_candidates(entry)
        self.assertEqual(candidate['date_state'], 'missing')
        self.assertNotIn('published_on', candidate)
        self.assertEqual(candidate['observations'][0]['date_evidence'], [])

    def test_inactive_jsonld_cannot_date_the_current_article(self):
        path = '/news/current'
        inactive = jsonld(news(path, datePublished='2020-01-02'))
        for tag in ('template', 'noscript', 'iframe', 'textarea'):
            with self.subTest(tag=tag):
                entry = page(path, news(path), body=f'<{tag}>{inactive}</{tag}>')
                candidate, = self.article_candidates(entry)
                self.assertEqual(candidate['date_state'], 'missing')
                self.assertEqual(candidate['observations'][0]['date_evidence'], [])
                self.assertNotIn('published_on', candidate)
                self.assertEqual(len(entry['structured_data']), 1)

        nested = f'<template><template>{inactive}</template>{inactive}</template>'
        active = jsonld(news(path, datePublished='2025-03-01'))
        candidate, = self.article_candidates(page(path, news(path), body=nested+active))
        self.assertEqual(candidate['published_on'], '2025-03-01')
        for tag in ('noscript', 'textarea'):
            with self.subTest(raw_fallback=tag):
                fallback = f'<{tag}><template>Literal fallback text</{tag}>'
                candidate, = self.article_candidates(page(path, news(path), body=fallback+active))
                self.assertEqual(candidate['published_on'], '2025-03-01')

    def test_active_jsonld_without_current_article_identity_cannot_date_the_page(self):
        path = '/news/current'
        for identity in ({}, {'@id':'#article'}, {'@id':path+'#article'},
                         {'mainEntityOfPage':{'@id':'#webpage'}}):
            with self.subTest(identity=identity):
                unbound = news(path, datePublished='2021-01-02', **identity)
                del unbound['url']
                candidate, = self.article_candidates(page(path, news(path), body=jsonld(unbound)))
                self.assertEqual(candidate['date_state'], 'missing')
                self.assertEqual(candidate['observations'][0]['date_evidence'], [])
                self.assertNotIn('published_on', candidate)

    def test_verified_jsonld_page_identity_supports_dates(self):
        path = '/news/current'
        canonical = '<link rel="canonical" href="/news/original">'
        for identity, head in (
            ({'@id':HOME+'news/current'}, ''),
            ({'mainEntityOfPage':{'@type':'WebPage','@id':HOME+'news/current'}}, ''),
            ({'mainEntityOfPage':'/news/original','@id':'/news/original#article'}, canonical),
        ):
            with self.subTest(identity=identity):
                bound = news(path, datePublished='2025-02-26', **identity)
                del bound['url']
                candidate, = self.article_candidates(page(path, body=jsonld(bound), head=head))
                self.assertEqual(candidate['published_on'], '2025-02-26')

    def test_disagreeing_structured_page_identifiers_cannot_bind_a_date(self):
        path = '/news/current'
        for identity in ({'@id':'/news/other'}, {'@id':'/news/other#article'},
                         {'mainEntityOfPage':{'@id':path,'url':'/news/other'}},
                         {'mainEntityOfPage':'https://other.example/news/current'}):
            with self.subTest(identity=identity):
                ambiguous = news(path, datePublished='2020-01-02', **identity)
                candidate, = self.article_candidates(page(path, news(path), body=jsonld(ambiguous)))
                self.assertEqual(candidate['date_state'], 'missing')
                self.assertEqual(candidate['observations'][0]['date_evidence'], [])
                self.assertNotIn('published_on', candidate)

    def test_duplicate_meta_disagreement_stays_conflicted(self):
        head = ('<meta property="article:published_time" content="2024-01-01">'
                '<meta property="article:published_time" content="2025-01-01">')
        entry = page('/news/current', news('/news/current'), head=head)
        candidate, = self.article_candidates(entry)
        self.assertEqual(candidate['date_state'], 'conflict')
        self.assertNotIn('published_on', candidate)
        self.assertEqual([item['value'] for item in candidate['observations'][0]['date_evidence']],
                         ['2024-01-01', '2025-01-01'])

    def test_duplicate_scoped_times_remain_distinct(self):
        content = ('<time itemprop="datePublished" datetime="2024-01-01"></time>'
                   '<time itemprop="datePublished" datetime="2024-01-01"></time>'
                   '<time itemprop="datePublished" datetime="2025-01-01"></time>')
        entry = page('/news/current', news('/news/current'), body=article_markup('/news/current', content))
        candidate, = self.article_candidates(entry)
        self.assertEqual(candidate['date_state'], 'conflict')
        self.assertNotIn('published_on', candidate)
        self.assertEqual([item['value'] for item in candidate['observations'][0]['date_evidence']],
                         ['2024-01-01', '2025-01-01'])

    def test_unscoped_and_nested_items_do_not_supply_article_dates(self):
        earlier = '<time pubdate datetime="2020-01-02"></time>'
        nested = ('<div itemscope itemtype="https://schema.org/Person">'+earlier+'</div>'
                  '<article>'+earlier+'</article>')
        body = earlier + article_markup('/news/current', nested)
        body += '<meta property="article:published_time" content="2020-01-02">'
        candidate, = self.article_candidates(page('/news/current', news('/news/current'), body=body))
        self.assertEqual(candidate['date_state'], 'missing')
        self.assertNotIn('published_on', candidate)

    def test_conflicting_scope_identifiers_cannot_bind_a_date(self):
        body = article_markup('/news/current', '<time pubdate datetime="2020-01-02"></time>'
                                              '<link itemprop="url" href="/news/other">')
        candidate, = self.article_candidates(page('/news/current', news('/news/current'), body=body))
        self.assertEqual(candidate['date_state'], 'missing')
        self.assertNotIn('published_on', candidate)

    def test_unrelated_open_graph_metadata_and_body_canonical_cannot_bind(self):
        head = ('<meta property="og:url" content="/news/other">'
                '<meta property="article:published_time" content="2020-01-02">')
        body = '<link rel="canonical" href="/news/other">'
        body += article_markup('/news/other', '<time pubdate datetime="2020-01-02"></time>')
        candidate, = self.article_candidates(page('/news/current', news('/news/current'), head=head, body=body))
        self.assertEqual(candidate['date_state'], 'missing')
        self.assertNotIn('published_on', candidate)

    def test_inactive_template_and_unrelated_items_do_not_consume_current_date_evidence(self):
        template = ('<template>' + article_markup('/news/current', '<time pubdate datetime="2020-01-02"></time>')
                    + '</template>')
        teasers = ''.join(article_markup(f'/news/other-{index}', '<time pubdate datetime="2020-01-02"></time>')
                          for index in range(40))
        current = article_markup('/news/current', '<time pubdate datetime="2025-02-26"></time>')
        entry = page('/news/current', news('/news/current'), body=template+teasers+current)
        candidate, = self.article_candidates(entry)
        self.assertEqual(candidate['date_state'], 'reported')
        self.assertEqual(candidate['published_on'], '2025-02-26')

    def test_time_can_bind_to_the_same_host_canonical_article(self):
        head = '<link rel="canonical" href="/news/original">'
        body = article_markup('/news/original', '<time itemprop="datePublished" datetime="2025-02-26"></time>')
        current = page('/news/reprint', news('/news/original'), head=head, body=body)
        original = page('/news/original', news('/news/original'))
        candidate, = self.article_candidates(current, original)
        self.assertEqual(candidate['candidate_url'], HOME+'news/original')
        self.assertEqual(candidate['published_on'], '2025-02-26')
        self.assertEqual(candidate['observations'][0]['date_evidence'][0]['subject_url'], HOME+'news/original')

    def test_truncated_date_evidence_cannot_claim_unique_day(self):
        head = ''.join(f'<meta property="article:published_time" content="2025-01-01T00:{minute:02d}:00Z">'
                       for minute in range(60))
        candidate, = self.article_candidates(page('/news/current', news('/news/current'), head=head))
        self.assertEqual(candidate['date_state'], 'incomplete')
        self.assertNotIn('published_on', candidate)
        self.assertTrue(candidate['observations'][0]['date_evidence_truncated'])
        self.assertLess(len(candidate['observations'][0]['date_evidence']), 60)

    def test_names_and_generic_dates_do_not_verify_identity(self):
        foreign = {'@type': 'Organization', 'name': 'Example', 'url': 'https://other.example/'}
        wrong_person = founder('/team/ada')
        wrong_person['worksFor'] = foreign
        linked_other_page = founder('/team/other-page')
        unknown = founder('/team/ada')
        unknown['name'] = 'Alix Example'
        entry = page('/team/ada', wrong_person, linked_other_page, unknown, foreign,
                     {**ORGANIZATION, 'foundingDate': '2016'},
                     body='<img src="/ada.png" alt="Ada Example">')
        profile = crawl.company_profile_observation(COMPANY, entry)
        self.assertEqual(profile['organization_claims'], [{'name':'Example', 'url':HOME, 'foundingDate':'2016'}])
        self.assertEqual(list(crawl.professional_bio_observations(COMPANY, entry, [])), [])
        article = news('/not-ours')
        article['publisher'] = foreign
        head = '<meta property="og:site_name" content="Example"><meta property="article:published_time" content="2025-02-26">'
        self.assertEqual(self.article_candidates(page('/not-ours', article, head=head)), [])
        self.assertEqual(self.article_candidates(page('/terms', head=head)), [])

    def test_about_placeholder_links_recover_only_unvisited_reviewed_founder_profiles(self):
        company = {**COMPANY, 'founders': [
            {'name': "Jeremy O’Brien", 'profile_url': HOME + 'prof-jeremy-obrien'},
            {'name': 'Pete Shadbolt', 'profile_url': HOME + 'prof-pete-shadbolt'},
            {'name': 'Offsite Founder', 'profile_url': 'https://elsewhere.example/person'},
        ]}
        about = {**page('/about', body="""
          <a href="/prof-jeremy-obrien">+</a><a href="/prof-jeremy-obrien">+</a>
          <a href="/prof-pete-shadbolt">+</a><a href="/prof-mark-thompson">+</a>
          <a href="https://elsewhere.example/person">+</a>
        """), 'status': 'ok'}
        already_fetched = {**page('/prof-pete-shadbolt'), 'status': 'ok'}
        lead, = crawl.observed_founder_profile_leads(company, [about, already_fetched])
        self.assertEqual(lead['name'], "Jeremy O’Brien")
        self.assertEqual(lead['candidate_url'], HOME + 'prof-jeremy-obrien')
        self.assertEqual(lead['source_url'], HOME + 'about')
        self.assertEqual(lead['kind'], 'founder-bio-link')
        self.assertEqual(lead['link_text'], '+')
        self.assertTrue(lead['review_required'])
        self.assertNotIn('headshot_candidate', lead)
        self.assertNotIn('role', lead)

    def test_founder_links_reject_query_fragment_and_conflicting_roster_identity(self):
        target = HOME + 'team/ada'
        company = {**COMPANY, 'founders': [{'name': 'Ada Example', 'profile_url': target}]}
        about = {**page('/about', body="""
          <a href="/team/ada?tracking=1">Ada</a>
          <a href="/team/ada#not-a-document">Ada</a>
          <a href="https://example.com@elsewhere.example/team/ada">Ada</a>
        """), 'status': 'ok'}
        self.assertEqual(list(crawl.observed_founder_profile_leads(company, [about])), [])
        clean = {**page('/about', body='<a href="/team/ada">+</a>'), 'status': 'ok'}
        conflict = {**company, 'founders': company['founders'] +
                    [{'name': 'Other Person', 'profile_url': target}]}
        self.assertEqual(list(crawl.observed_founder_profile_leads(conflict, [clean])), [])
        self.assertEqual(list(crawl.observed_founder_profile_leads(
            company, [{**clean, 'status': 'error'}])), [])

    def test_only_direct_safe_socials_and_explicit_person_images_are_staged(self):
        path = '/team/ada'
        socials = ['https://www.linkedin.com/in/ada-example/','https://www.linkedin.com.evil.test/in/ada',
                   'https://www.linkedin.com/in/other/?token=no','https://www.linkedin.com/company/example',
                   'https://user@www.linkedin.com/in/ada','http://www.linkedin.com/in/ada','javascript:void(0)']
        portrait = 'https://other.example/ada.png'
        entry = page(path, founder(path, image={'contentUrl':portrait}, sameAs=socials),
                     head='<meta property="og:image" content="/group.png">')
        row, = crawl.professional_bio_observations(COMPANY, entry, ['cdn.example.com'])
        self.assertEqual(row['candidate_url'], HOME+'team/ada')
        self.assertEqual(row['role'], 'Co-founder and engineer')
        self.assertEqual(row['social_candidates'], [socials[0]])
        self.assertEqual(row['headshot_candidate']['candidate_url'], portrait)
        self.assertEqual(row['headshot_candidate']['status'], 'not_fetched')
        self.assertIn('External asset host', row['headshot_candidate']['reason'])
        self.assertTrue(row['review_required'])
        for unsafe in ['javascript:void(0)', 'http://example.com/ada.png', 'https://example.com:444/a.png',
                       'https://127.0.0.1/a.png', 'https://user@example.com/a.png', '/%72obots.txt',
                       'https:/ada.png', '///other.example/ada.png', 'https://exam\nple.com/ada.png']:
            with self.subTest(unsafe=unsafe):
                row, = crawl.professional_bio_observations(COMPANY, page(path, founder(path, image=unsafe)), [])
                self.assertNotIn('headshot_candidate', row)

    def test_scoped_candidate_packet_survives_staging_and_is_bound_to_offline_replay(self):
        news_url = HOME+'news/launch'
        bio_url = HOME+'team/ada'
        denied_url = HOME+'news/denied'
        overflow_url = HOME+'news/overflow'
        requests = []
        bodies = {
            HOME: html(ORGANIZATION, body='<a href="/team">Team</a><a href="/news/new">News</a><a href="/headshot.png">Founder photo</a>'),
            news_url: html(news('/news/launch'), founder('/news/launch'),
                           body=article_markup('/news/launch', '<time pubdate datetime="2025-02-26"></time>')),
            bio_url: html(founder('/team/ada', image='https://cdn.example.com/ada.png',
                                  sameAs='https://www.linkedin.com/in/ada-example')),
        }

        class FixtureTransport:
            def request(self, url, host, *, redirect_guard):
                requests.append(url)
                redirect_guard(url)
                if url not in bodies:
                    raise AssertionError(f'Unapproved fixture request {url}')
                return 200, {'Content-Type':'text/html'}, bodies[url], url

        with tempfile.TemporaryDirectory() as temp:
            fixture = Path(temp)
            approved = fixture/'approved.csv'
            scope = {'version':1, 'allowed_urls':[HOME, news_url, denied_url, bio_url, overflow_url],
                     'denied_urls':[denied_url], 'max_follow':2}
            with approved.open('w', newline='') as handle:
                writer = csv.writer(handle)
                writer.writerow(['partner','official_website','approved','asset_hosts','crawl_scope'])
                writer.writerow([COMPANY['name'],HOME,'yes','cdn.example.com',json.dumps(scope)])
            (fixture/'data').mkdir()
            overlay = fixture/'data'/'startup-research.json'
            overlay.write_text(json.dumps({'startups':[COMPANY]}), encoding='utf-8')
            out = fixture/'capture'
            digest = snapshot(ROOT)[2]['sha256']
            with verified_modules(ROOT, digest) as (modules, implementation):
                collector = modules['crawl']
                with patch.object(collector, 'ROOT', fixture), \
                        patch.object(collector, 'Transport', return_value=FixtureTransport()), \
                        patch.object(collector, 'utc_now', return_value=REVIEWED_AT):
                    collector.main(['company-profiles', '--approved', str(approved), '--follow', '5',
                                    '--limit', '1', '--out', str(out)])
                saved = out/'latest-company-profiles.json'
                packet = saved.read_bytes()
                dated, = out.glob('company-profiles-*.json')
                self.assertEqual(dated.read_bytes(), packet)
                replay = modules['replay_company_profiles'].compile_replay(
                    overlay, approved, saved, 'a'*40, REVIEWED_AT)
            report = json.loads(packet)
            self.assertEqual(report['implementation'], implementation)
            self.assertEqual(replay['packet_sha256'], sha256(packet).hexdigest())
            self.assertEqual(replay['start_batch']['events'][0]['evidence']['sha256'], replay['packet_sha256'])
            self.assertFalse(replay['runtime_supported'])
            self.assertEqual(len(replay['observations'][0]['pages']), 3)
            self.assertNotIn('candidates', replay)
            self.assertEqual(saved.read_bytes(), packet)
        self.assertEqual(requests, [HOME,news_url,bio_url])
        articles = [row for row in report['candidates'] if row['kind']=='newsroom-article']
        people = [row for row in report['candidates'] if row['kind']=='professional-bio']
        self.assertEqual([row['candidate_url'] for row in articles], [news_url])
        self.assertEqual([row['candidate_url'] for row in people], [bio_url])
        self.assertEqual(articles[0]['published_on'], '2025-02-26')
        self.assertEqual(articles[0]['observations'][0]['date_evidence'][0]['subject_url'], news_url)
        self.assertEqual(people[0]['social_candidates'], ['https://www.linkedin.com/in/ada-example'])
        self.assertEqual(people[0]['headshot_candidate']['reason'], 'Rights and image review required')
        self.assertEqual(people[0]['headshot_candidate']['status'], 'not_fetched')
        self.assertEqual(report['coverage']['pages_succeeded'], 3)
        self.assertTrue(all(row['review_required'] for row in report['candidates']))
