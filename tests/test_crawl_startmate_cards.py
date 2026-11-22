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
