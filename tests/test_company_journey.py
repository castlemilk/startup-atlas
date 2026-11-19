"""Offline HTML fixtures for company journey observations."""
import csv
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest

from scripts import crawl


HOME = 'https://example.com/'
COMPANY = {'name': 'Example', 'website': HOME, 'founders': [{'name': 'Ada Example'}]}
ORGANIZATION = {'@type': 'Organization', 'name': 'Example', 'url': HOME}
REVIEWED_AT = '2026-11-19T01:00:00Z'


def html(*subjects, head='', body=''):
    data = json.dumps({'@graph': subjects})
    return f'<head>{head}<script type="application/ld+json">{data}</script></head>{body}'.encode()


def page(path, *subjects, head='', body=''):
    url = HOME.rstrip('/') + path
    return {'final_url': url, 'checked_at': REVIEWED_AT, **crawl.extract_page(html(*subjects, head=head, body=body), url)}


def news(path, **fields):
    return {'@type': 'NewsArticle', 'url': path, 'headline': 'Example opens a research site',
            'publisher': ORGANIZATION, **fields}


def founder(path, **fields):
    return {'@type': 'Person', 'name': 'Ada Example', 'url': path, 'worksFor': ORGANIZATION,
            'jobTitle': 'Co-founder and engineer', 'description': 'A career in hardware research.', **fields}


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
        entry = page('/news/start', head=head,
                     body='<time itemprop="datePublished" datetime="2025-02-28">28 February</time>')
        candidate, = self.article_candidates(entry)
        self.assertEqual(candidate['published_on'], '2025-02-28')

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
                       'https://127.0.0.1/a.png', 'https://user@example.com/a.png', '/%72obots.txt']:
            with self.subTest(unsafe=unsafe):
                row, = crawl.professional_bio_observations(COMPANY, page(path, founder(path, image=unsafe)), [])
                self.assertNotIn('headshot_candidate', row)

    def test_company_scope_sets_request_budget_without_fetching_assets_or_unlisted_links(self):
        news_url = HOME+'news/launch'
        bio_url = HOME+'team/ada'
        denied_url = HOME+'news/denied'
        overflow_url = HOME+'news/overflow'
        requests = []
        bodies = {
            HOME: html(ORGANIZATION, body='<a href="/team">Team</a><a href="/news/new">News</a>'),
            news_url: html(news('/news/launch', datePublished='2025-02-26'), founder('/news/launch')),
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
            approved = Path(temp)/'approved.csv'
            scope = {'version':1, 'allowed_urls':[HOME, news_url, denied_url, bio_url, overflow_url],
                     'denied_urls':[denied_url], 'max_follow':2}
            with approved.open('w', newline='') as handle:
                writer = csv.writer(handle)
                writer.writerow(['partner','official_website','approved','asset_hosts','crawl_scope'])
                writer.writerow([COMPANY['name'],HOME,'yes','cdn.example.com',json.dumps(scope)])
            args = SimpleNamespace(approved=approved, partner=None, limit=1, follow=10)
            report = crawl.crawl_company_profiles([COMPANY], args, FixtureTransport())
        self.assertEqual(requests, [HOME,news_url,bio_url])
        articles = [row for row in report['candidates'] if row['kind']=='newsroom-article']
        people = [row for row in report['candidates'] if row['kind']=='professional-bio']
        self.assertEqual([row['candidate_url'] for row in articles], [news_url])
        self.assertEqual([row['candidate_url'] for row in people], [bio_url])
        self.assertEqual(people[0]['headshot_candidate']['reason'], 'Rights and image review required')
        self.assertEqual(people[0]['headshot_candidate']['status'], 'not_fetched')
        self.assertEqual(report['coverage']['pages_succeeded'], 3)
        self.assertTrue(all(row['review_required'] for row in report['candidates']))
