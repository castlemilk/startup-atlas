import sys
import tempfile
import types
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import crawl

ROOT = 'https://www.usv.com'
PORTFOLIO = ROOT + '/portfolio'


def card(slug, content, stage='Seed, 2021', *, ident=None, attrs=''):
    href = slug if slug.startswith('https://') else '/portfolio/company/' + slug
    id_value = ident or 'company-example'
    return (f'<a id="{id_value}" class="group portfolio-company-card" href="{href}" {attrs}>'
            f'<div>{content}</div><div>{stage}</div></a>')


def page(markup, url=PORTFOLIO):
    return {**crawl.extract_page(markup.encode(), url), 'final_url': url, 'checked_at': '2026-11-22'}


class USVPortfolioTests(unittest.TestCase):
    def test_exact_logo_alt_or_heading_distinct_from_investment_text(self):
        parsed = page(
            card('floodmapp', '<img alt="Floodmapp logo"/>')
            + card('anthroenergy', '<img alt="Anthro Energy logo"/>', ident='company-anthro-energy')
            + card('tolans', '<img alt="Tolan logo"/>', '2026')
            + card('paradev', '<span>P</span><h3>Paradev</h3><p>Product description</p>', 'Seed')
            + card('agree', '<img alt="Agree logo"/><h3>Agree</h3>')
            + card('numeric', '<img alt="2012 Labs logo"/>', '')
        )
        leads, coverage = crawl.profile_lead_batch('USV', parsed, 'companies')
        self.assertEqual([r['name'] for r in leads], ['Floodmapp', 'Anthro Energy', 'Tolan', 'Paradev', 'Agree', '2012 Labs'])
        self.assertEqual(leads[0]['portfolio_card_text'], 'Seed, 2021')
        self.assertEqual(leads[2]['portfolio_card_text'], '2026')
        self.assertEqual([r['name_evidence'] for r in leads],
                         ['portfolio-card-logo-alt'] * 3 + ['portfolio-card-heading'] * 2
                         + ['portfolio-card-logo-alt'])
        self.assertEqual(leads[-1]['portfolio_card_text'], '')
        self.assertTrue(all(r['review_required'] and r['source_url'] == PORTFOLIO for r in leads))
        self.assertEqual(coverage, {'eligible_within_retained_links': 6, 'returned': 6,
                                   'omitted_by_lead_limit': 0, 'profile_links_at_limit': False,
                                   'unresolved_name_within_retained_links': 0})

    def test_ambiguous_hidden_imposter_and_flattened_names_are_not_guessed(self):
        parsed = page(
            '<a href="/portfolio/company/nomarker"><h3>Looks like a name</h3></a>'
            + card('stage', '')
            + card('year', '<img alt="2021 logo"/>')
            + card('funder', '<img alt="Series A, 2026 logo"/>')
            + card('hidden', '<div hidden><img alt="Hidden logo"/></div>')
            + card('template', '<template><h3>Not a name</h3></template>')
            + card('conflict', '<img alt="One name logo"/><h3>Other name</h3>')
            + card('duplicate', '<h3>First label</h3>') + card('duplicate', '<h3>Another label</h3>')
            + card('https://www.usv.com.evil.example/portfolio/company/imposter', '<h3>Cross host</h3>')
            + card('query?not=canonical', '<h3>Query variant</h3>')
            + card('nested/extra', '<h3>Nested path</h3>')
            + card('hidden-card', '<h3>Concealed card</h3>', attrs='aria-hidden="true"')
            + card('healthy', '<h3>Valid <span hidden>not this text</span>Name</h3>')
        )
        rows, counts = crawl.profile_lead_batch('USV', parsed, 'companies')
        self.assertEqual([r['name'] for r in rows], ['Valid Name'])
        self.assertEqual(counts['unresolved_name_within_retained_links'], 9)
        old = {'final_url': PORTFOLIO, 'checked_at': 'archive', 'profile_links': [
            {'url': PORTFOLIO + '/company/floodmapp', 'text': 'Seed, 2021'},
        ]}
        rows, counts = crawl.profile_lead_batch('USV', old, 'companies')
        self.assertEqual(rows, [])
        self.assertEqual(counts['unresolved_name_within_retained_links'], 1)
        outside = page(card('portfolio', '<h3>Not this record</h3>'), PORTFOLIO + '?sort=other')
        self.assertEqual(crawl.extract_profile_leads('USV', outside, 'companies'), [])

    def test_witnessed_paired_stream_is_bounded_and_not_arbitrary_hidden_markup(self):
        marker = '<main><!--$?--><template id="B:0"></template><p>Loading</p></main>'
        segment = ('<div hidden id="S:0"><div>' + card('floodmapp', '<img alt="Floodmapp logo"/>')
                   + card('hidden', '<div hidden><img alt="Wrong logo"/></div>') + '</div></div>')
        for markup, expected in [(marker + segment, ['Floodmapp']), (segment, []),
                                 (marker + segment + segment, []), (marker + marker + segment, []),
                                 (marker.replace('$?', 'random') + segment, []),
                                 (marker.replace('main', 'aside') + segment, []),
                                 (marker.replace('</main>', segment + '</main>'), [])]:
            with self.subTest(expected=expected, markup_length=len(markup)):
                rows, counts = crawl.profile_lead_batch('USV', page(markup), 'companies')
                self.assertEqual([row['name'] for row in rows], expected)
                self.assertEqual(counts['unresolved_name_within_retained_links'], 2 - len(expected))

    def test_caps_and_source_scope_remain_unchanged(self):
        contents = ''.join(card(f'example-{i}', f'<img alt="Example {i} logo"/>') for i in range(102))
        contents += card('noname', '', 'Series A, 2009')

        class Transport:
            delay = 1
            def __init__(self):
                self.calls = []
            def request(self, url, host):
                self.calls.append((url, host))
                if url == ROOT + '/':
                    return 200, {'Content-Type': 'text/html'}, b'<a href="/portfolio">Portfolio</a>', url
                if url == PORTFOLIO:
                    return 200, {'Content-Type': 'text/html'}, contents.encode(), url
                raise AssertionError('Profile lead extraction must not fetch detail pages')

        with tempfile.TemporaryDirectory() as directory:
            approved = Path(directory) / 'partners.csv'
            approved.write_text('partner,qid,official_website,approved\nUSV,,https://www.usv.com/,yes\n')
            args = types.SimpleNamespace(approved=approved, partner=None, limit=0, follow=2)
            transport = Transport()
            report = crawl.crawl_profiles({'partnerLeads': ['USV']}, args, transport)
        self.assertEqual(transport.calls, [(ROOT + '/', 'www.usv.com'), (PORTFOLIO, 'www.usv.com')])
        self.assertEqual(report['coverage']['profile_leads_by_kind']['companies'], {
            'pages_measured': 1, 'eligible_within_retained_links': 102, 'returned': 100,
            'omitted_by_lead_limit': 2, 'pages_at_profile_link_limit': 0,
            'unresolved_name_within_retained_links': 1, 'pages_measured_for_unresolved_names': 1,
        })
        self.assertEqual(report['candidates'][0]['name'], 'Example 0')
        self.assertEqual(report['candidates'][-1]['name'], 'Example 99')
        blackbird = page('<a href="/portfolio/canva">Canva</a>', 'https://www.blackbird.vc/portfolio')
        self.assertEqual(crawl.extract_profile_leads('Blackbird', blackbird, 'companies')[0]['name'], 'Canva')


if __name__ == '__main__':
    unittest.main()
