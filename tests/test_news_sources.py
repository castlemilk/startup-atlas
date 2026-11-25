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
        by_startup = {c['startup']: c for c in out['candidates']}
        for entry in TRADE_PRESS:
            with self.subTest(id=entry['id']):
                candidate = by_startup[entry['name']]
                self.assertTrue(candidate['review_required'])
                self.assertEqual(candidate['discovered_from'], entry['url'])
                self.assertTrue(candidate['amount_mentions'])
        coverage = {row['source']: row for row in out['coverage']['sources']}
        for entry in TRADE_PRESS:
            self.assertEqual(coverage[entry['name']]['status'], 'ok')
            self.assertGreaterEqual(coverage[entry['name']]['rows'], 1)

    def test_off_host_and_non_funding_links_are_never_followed(self):
        _, transport = self.run_frontier()
        fetched = [url for url, _ in transport.calls]
        self.assertFalse(any('elsewhere.example' in url for url in fetched))
        self.assertFalse(any(url.endswith('/about') for url in fetched))


if __name__ == '__main__':
    unittest.main()
