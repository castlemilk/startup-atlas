import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('atlas_crawl', Path(__file__).resolve().parents[1] / 'scripts/crawl.py')
crawl = importlib.util.module_from_spec(spec)
spec.loader.exec_module(crawl)

ROOT = 'https://www.startmate.com'
PORTFOLIO = ROOT + '/portfolio'


def page(html, url=PORTFOLIO):
    return {
        **crawl.extract_page(html.encode(), url),
        'final_url': url,
        'checked_at': '2026-11-22',
    }


class StartmatePortfolioTests(unittest.TestCase):
    def test_company_heading_not_the_flattened_portfolio_card(self):
        parsed = page('''
          <a href="/portfolio-companies/andromeda-2">
            <div><h3 fs-cmsfilter-field="company-name">Andromeda</h3>
              <p>''' + 'Additional card description ' * 8 + '''</p><div>W22 Accelerator</div></div>
          </a>
          <a href="/portfolio-companies/brandviz-ai">
            <h3 fs-cmsfilter-field="company-name">BrandViz.AI</h3><p>Card summary</p>
          </a>
        ''')
        leads = crawl.extract_profile_leads('Startmate', parsed, 'companies')
        self.assertEqual([(r['name'], r['candidate_url']) for r in leads], [
            ('Andromeda', ROOT + '/portfolio-companies/andromeda-2'),
            ('BrandViz.AI', ROOT + '/portfolio-companies/brandviz-ai'),
        ])
        self.assertTrue(all(r['review_required'] and r['source_url'] == PORTFOLIO for r in leads))
        self.assertNotIn('Accelerator', leads[0]['name'])
        self.assertEqual(leads[0]['name_evidence'], 'portfolio-card-company-heading')

    def test_unbound_ambiguous_and_unapproved_card_names_are_not_guessed(self):
        token = '<h3 fs-cmsfilter-field="company-name">Company name</h3>'
        signals = [
            '<a href="/portfolio-companies/no-heading">No verified heading</a>',
            '<a href="/portfolio-companies/wrong-field"><h3>Name-like teaser</h3></a>',
            '<a href="/portfolio-companies/hidden"><template>' + token + '</template>Hidden teaser</a>',
            '<a href="/portfolio-companies/conflict">' + token
                + '<h3 fs-cmsfilter-field="company-name">Different company</h3></a>',
            '<a href="/portfolio-companies/not-a-detail/nested">' + token + '</a>',
            '<a href="/portfolio-companies/tracking?session=ignored">' + token + '</a>',
            '<a href="https://other.example/portfolio-companies/other">' + token + '</a>',
            token + '<a href="/portfolio-companies/outside">Name is outside this link</a>',
        ]
        self.assertEqual(crawl.extract_profile_leads('Startmate', page('\n'.join(signals)), 'companies'), [])
        for url in [ROOT + '/other', 'https://other.example/portfolio']:
            data = page('<a href="/portfolio-companies/example">' + token + '</a>', url)
            self.assertEqual(crawl.extract_profile_leads('Example', data, 'companies'), [])

    def test_index_selection_does_not_follow_named_detail_links(self):
        data = page('''
          <a href="/portfolio-companies/puralink">Portfolio companies: Puralink</a>
          <a href="/portfolio-companies/example?other=one">Portfolio company: Example</a>
          <a href="/portfolio">Portfolio</a>
        ''', ROOT + '/')
        self.assertEqual(crawl.profile_landing_links(data, ROOT + '/', 2), [
            {'kind': 'companies', 'url': PORTFOLIO},
        ])
        normal = page('<a href="/portfolio/canva">Canva</a>', 'https://www.blackbird.vc/portfolio')
        self.assertEqual(crawl.extract_profile_leads('Blackbird Ventures', normal, 'companies')[0]['name'], 'Canva')

    def test_named_card_survives_an_earlier_filter_link_but_conflicts_do_not(self):
        parsed = page('''
          <a href="/portfolio-companies/ansight"><div fs-cmsfilter-field="company-name">Filter item</div></a>
          <a href="/portfolio-companies/ansight"><h3 fs-cmsfilter-field="company-name">Ansight</h3></a>
          <a href="/portfolio-companies/conflict"><h3 fs-cmsfilter-field="company-name">One identity</h3></a>
          <a href="/portfolio-companies/conflict"><h3 fs-cmsfilter-field="company-name">Other identity</h3></a>
        ''')
        self.assertEqual([r['name'] for r in crawl.extract_profile_leads('Startmate', parsed, 'companies')], ['Ansight'])

    def test_profiles_distinguish_lead_cap_from_a_fetch_or_a_scope_expansion(self):
        import tempfile
        import types

        class Transport:
            delay = 1

            def __init__(self):
                self.calls = []

            def request(self, url, host):
                self.calls.append((url, host))
                if url == ROOT + '/':
                    return 200, {'Content-Type': 'text/html'}, b'<a href="/portfolio">Portfolio</a>', url
                if url == PORTFOLIO:
                    cards = ''.join(
                        f'<a href="/portfolio-companies/example-{i}">'
                        f'<h3 fs-cmsfilter-field="company-name">Example {i}</h3><p>Card summary</p></a>'
                        for i in range(102)
                    )
                    cards += '<a href="/portfolio-companies/unlabelled">Unlabelled card</a>'
                    cards += '<a href="/portfolio-companies/example-101">Repeated filter item</a>'
                    return 200, {'Content-Type': 'text/html'}, cards.encode(), url
                raise AssertionError('Should not fetch company detail pages')

        with tempfile.TemporaryDirectory() as tmp:
            approved = Path(tmp) / 'partners.csv'
            approved.write_text('partner,qid,official_website,approved\nStartmate,,https://www.startmate.com/,yes\n')
            args = types.SimpleNamespace(approved=approved, partner=None, limit=0, follow=2)
            transport = Transport()
            report = crawl.crawl_profiles({'partnerLeads': ['Startmate']}, args, transport)
        self.assertEqual(transport.calls, [(ROOT + '/', 'www.startmate.com'), (PORTFOLIO, 'www.startmate.com')])
        self.assertEqual(report['coverage']['unreviewed_candidates'], 100)
        self.assertNotIn('people', report['coverage']['profile_leads_by_kind'])
        self.assertEqual(report['coverage']['profile_leads_by_kind']['companies'], {
            'pages_measured': 1, 'eligible_within_retained_links': 102,
            'returned': 100, 'omitted_by_lead_limit': 2, 'pages_at_profile_link_limit': 0,
        })
        self.assertEqual(report['results'][0]['pages'][1]['profile_lead_coverage'], {
            'eligible_within_retained_links': 102, 'returned': 100, 'omitted_by_lead_limit': 2,
            'profile_links_at_limit': False,
        })

    def test_profile_link_limit_does_not_claim_complete_coverage(self):
        captured = page(''.join(
            f'<a href="/portfolio-companies/index-card-{i}">'
            f'<h3 fs-cmsfilter-field="company-name">Card {i}</h3></a>' for i in range(503)
        ))
        rows, counts = crawl.profile_lead_batch('Startmate', captured, 'companies')
        self.assertEqual(len(rows), 100)
        self.assertEqual(counts, {
            'eligible_within_retained_links': 500, 'returned': 100, 'omitted_by_lead_limit': 400,
            'profile_links_at_limit': True,
        })
