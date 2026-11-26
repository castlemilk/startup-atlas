"""The news frontier registry: shape, membership and traversal parity.

The crawl's news mode reads ``data/startup-news-sources.json`` only.
Until #536 the frontier was four company newsrooms (unchanged since
13 Nov 2026), so trade press — where most Australian rounds are
actually reported — was structurally unreachable. These tests pin the
registry shape the collector consumes, the trade-press membership,
and that ``crawl_startup_news`` traverses a publication listing
exactly the way it traverses a company newsroom: same-host funding
links followed, everything else left alone, candidates unreviewed.
No URL is fetched; transports are fixtures.
"""
import importlib.util
import json
from pathlib import Path
import types
import unittest
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location('crawl_news_sources', ROOT / 'scripts/crawl.py')
crawl = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(crawl)
REGISTRY = json.loads((ROOT / 'data/startup-news-sources.json').read_text())

NEWSROOMS = [
    {'id': 'canva-news', 'name': 'Canva', 'url': 'https://www.canva.com/newsroom/news/'},
    {'id': 'airwallex-news', 'name': 'Airwallex', 'url': 'https://www.airwallex.com/global/newsroom'},
    {'id': 'bugcrowd-news', 'name': 'Bugcrowd', 'url': 'https://www.bugcrowd.com/about/press-releases/'},
    {'id': 'morse-micro-news', 'name': 'Morse Micro', 'url': 'https://www.morsemicro.com/news'},
]
TRADE_PRESS = [
    {'id': 'startup-daily-funding', 'name': 'Startup Daily',
     'url': 'https://www.startupdaily.net/topic/funding/'},
    {'id': 'smartcompany-startupsmart', 'name': 'SmartCompany',
     'url': 'https://www.smartcompany.com.au/startupsmart/'},
    {'id': 'innovationaus-news', 'name': 'InnovationAus',
     'url': 'https://www.innovationaus.com/'},
    {'id': 'overnight-success-capital-raise', 'name': 'Overnight Success',
     'url': 'https://www.overnightsuccess.vc/t/capital-raise'},
]


class RegistryShapeTests(unittest.TestCase):
    def test_registry_is_the_file_the_collector_reads(self):
        self.assertEqual(crawl.STARTUP_NEWS_SOURCES,
                         ROOT / 'data/startup-news-sources.json')

    def test_entries_follow_the_existing_declaration_shape(self):
        self.assertEqual(set(REGISTRY), {'updated', 'sources'})
        ids = [entry['id'] for entry in REGISTRY['sources']]
        self.assertEqual(len(ids), len(set(ids)))
        for entry in REGISTRY['sources']:
            with self.subTest(id=entry['id']):
                self.assertEqual(set(entry), {'id', 'name', 'url'})
                self.assertTrue(entry['name'])
                parts = urlsplit(entry['url'])
                self.assertEqual(parts.scheme, 'https')
                self.assertTrue(parts.hostname)

    def test_original_newsrooms_are_unchanged(self):
        by_id = {entry['id']: entry for entry in REGISTRY['sources']}
        for entry in NEWSROOMS:
            self.assertEqual(by_id[entry['id']], entry)

    def test_trade_press_sources_are_in_the_frontier(self):
        by_id = {entry['id']: entry for entry in REGISTRY['sources']}
        for entry in TRADE_PRESS:
            with self.subTest(id=entry['id']):
                self.assertEqual(by_id[entry['id']], entry)
        self.assertEqual(len(REGISTRY['sources']),
                         len(NEWSROOMS) + len(TRADE_PRESS))


class FrontierTransport:
    """Serve every registry listing the same shaped page.

    Each listing carries one same-host funding article link, one
    off-host funding link and one same-host non-funding link, so the
    recorded calls prove which links the collector follows.
    """

    def __init__(self):
        self.calls = []

    def request(self, url, allowed_host=None, **kwargs):
        self.calls.append((url, allowed_host))
        parts = urlsplit(url)
        self.assert_host = parts.hostname
        if url.endswith('/article/acme-raises'):
            body = (b'<title>Acme raises AUD $2 million seed round</title>'
                    b'<p>Acme raised AUD $2 million in a seed round.</p>')
        else:
            article = f'{parts.scheme}://{parts.netloc}/article/acme-raises'
            body = (f'<a href="{article}">Acme raises $2 million seed round</a>'
                    f'<a href="https://elsewhere.example/funding">Other raises funding</a>'
                    f'<a href="{parts.scheme}://{parts.netloc}/about">About us</a>'
                    ).encode()
        return 200, {'Content-Type': 'text/html'}, body, url


class TradePressTraversalTests(unittest.TestCase):
    def run_frontier(self):
        transport = FrontierTransport()
        args = types.SimpleNamespace(only=[], limit=0, follow=1)
        out = crawl.crawl_startup_news(REGISTRY, args, transport)
        return out, transport

    def test_every_source_is_traversed_on_its_own_host(self):
        _, transport = self.run_frontier()
        listings = [url for url, _ in transport.calls
                    if not url.endswith('/article/acme-raises')]
        self.assertEqual(listings,
                         [entry['url'] for entry in REGISTRY['sources']])
        for url, allowed_host in transport.calls:
            self.assertEqual(allowed_host, urlsplit(url).hostname)

    def test_trade_press_listings_yield_unreviewed_candidates(self):
        out, _ = self.run_frontier()
        by_source = {c['source_name']: c for c in out['candidates']}
        for entry in TRADE_PRESS:
            with self.subTest(id=entry['id']):
                candidate = by_source[entry['name']]
                self.assertTrue(candidate['review_required'])
                self.assertEqual(candidate['discovered_from'], entry['url'])
                self.assertTrue(candidate['amount_mentions'])
                # F6: the fixture article is about "Acme", which Atlas
                # does not track, so the candidate is unattributed —
                # the publication is recorded as its source, never
                # stamped as its subject.
                self.assertIsNone(candidate['startup'])
                self.assertEqual(candidate['attribution'], 'unattributed')
                self.assertEqual(candidate['source_id'], entry['id'])
        coverage = {row['source']: row for row in out['coverage']['sources']}
        for entry in TRADE_PRESS:
            self.assertEqual(coverage[entry['name']]['status'], 'ok')
            self.assertGreaterEqual(coverage[entry['name']]['rows'], 1)

    def test_off_host_and_non_funding_links_are_never_followed(self):
        _, transport = self.run_frontier()
        fetched = [url for url, _ in transport.calls]
        self.assertFalse(any('elsewhere.example' in url for url in fetched))
        self.assertFalse(any(url.endswith('/about') for url in fetched))


TRADE_REGISTRY = {'sources': [
    {'id': 'startup-daily-funding', 'name': 'Startup Daily',
     'url': 'https://www.startupdaily.net/topic/funding/'}]}
NEWSROOM_REGISTRY = {'sources': [
    {'id': 'canva-news', 'name': 'Canva',
     'url': 'https://www.canva.com/newsroom/news/'}]}
TRACKED = [
    {'name': 'Alloovium', 'website': 'https://alloovium.com/'},
    {'name': 'Canva', 'website': 'https://www.canva.com/'},
]


class ArticleTransport:
    """Serve one listing whose links lead to shaped articles.

    ``articles`` maps slug -> (title, paragraph); the listing links to
    each article under its title, on the listing's own host.
    """

    def __init__(self, articles):
        self.articles = articles

    def request(self, url, allowed_host=None, **kwargs):
        parts = urlsplit(url)
        for slug, (title, paragraph) in self.articles.items():
            if url.endswith('/' + slug):
                body = (f'<title>{title}</title>'
                        f'<p>{paragraph}</p>').encode()
                return 200, {'Content-Type': 'text/html'}, body, url
        links = ''.join(
            f'<a href="{parts.scheme}://{parts.netloc}/article/{slug}">'
            f'{title}</a>'
            for slug, (title, _) in self.articles.items())
        return 200, {'Content-Type': 'text/html'}, links.encode(), url


class AttributionTests(unittest.TestCase):
    """F6: a news candidate's subject is the startup the article is
    about — never the publication that carried it."""

    def run_news(self, registry, articles, startups=TRACKED):
        args = types.SimpleNamespace(only=[], limit=0, follow=4)
        return crawl.crawl_startup_news(
            registry, args, ArticleTransport(articles), startups=startups)

    def test_trade_press_article_attributed_by_title(self):
        out = self.run_news(TRADE_REGISTRY, {
            'alloovium-raises': (
                'Alloovium raises $500,000 seed round',
                'Alloovium will use the funds to grow its team.')})
        self.assertEqual(len(out['candidates']), 1)
        candidate = out['candidates'][0]
        self.assertEqual(candidate['startup'], 'Alloovium')
        self.assertEqual(candidate['attribution'], 'article-title')
        self.assertEqual(candidate['source_name'], 'Startup Daily')
        self.assertEqual(candidate['source_id'], 'startup-daily-funding')

    def test_trade_press_article_attributed_by_evidence(self):
        out = self.run_news(TRADE_REGISTRY, {
            'sydney-startup-raises': (
                'Sydney startup raises $2 million seed round',
                'Alloovium has raised $2 million in seed funding to '
                'expand its hiring platform.')})
        candidate = out['candidates'][0]
        self.assertEqual(candidate['startup'], 'Alloovium')
        self.assertEqual(candidate['attribution'], 'article-evidence')

    def test_unattributable_article_queues_without_a_subject(self):
        out = self.run_news(TRADE_REGISTRY, {
            'zephyr-raises': (
                'Zephyr Labs raises $3 million seed round',
                'Zephyr Labs raised $3 million to build its product.')})
        candidate = out['candidates'][0]
        self.assertIsNone(candidate['startup'])
        self.assertEqual(candidate['attribution'], 'unattributed')
        self.assertEqual(candidate['source_name'], 'Startup Daily')

    def test_article_naming_two_tracked_startups_is_unattributed(self):
        out = self.run_news(TRADE_REGISTRY, {
            'two-raises': (
                'Canva and Alloovium raise new funding rounds',
                'Canva and Alloovium both announced raises this week.')})
        candidate = out['candidates'][0]
        self.assertIsNone(candidate['startup'])
        self.assertEqual(candidate['attribution'], 'unattributed')

    def test_company_newsroom_attributes_to_the_company(self):
        # The article names no tracked startup at all; the source IS
        # the company's own newsroom (name + host match), so the
        # company is the subject.
        out = self.run_news(NEWSROOM_REGISTRY, {
            'creator-fund': (
                'Creator fund announces $10 million in grants',
                'The fund will support creators worldwide.')})
        candidate = out['candidates'][0]
        self.assertEqual(candidate['startup'], 'Canva')
        self.assertEqual(candidate['attribution'], 'source-newsroom')
        self.assertEqual(candidate['source_name'], 'Canva')


if __name__ == '__main__':
    unittest.main()
