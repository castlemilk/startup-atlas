import datetime as dt
import importlib.util
import json
from pathlib import Path
import tempfile
import types
import unittest

ROOT = Path(__file__).resolve().parents[1]
FIXTURES = ROOT / 'tests/fixtures'


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, ROOT / path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


sampling = load('atlas_crawl_sampling', 'scripts/crawl_sampling.py')
crawl = load('atlas_crawl_sampling_crawl', 'scripts/crawl.py')

NOW = dt.datetime(2026, 11, 23, 12, 0, tzinfo=dt.timezone.utc)


def fixture(name):
    return json.loads((FIXTURES / name).read_text(encoding='utf-8'))


class SamplerScoringTests(unittest.TestCase):
    def test_fresh_source_with_no_signals_scores_zero(self):
        record = {'last_success_at': NOW.isoformat(), 'new_changed_rows_last_run': 0,
                  'low_confidence_edges': 0, 'consecutive_failures': 0}
        self.assertEqual(sampling.score_source(record, now=NOW), 0)

    def test_staleness_is_one_point_per_day_capped_at_thirty(self):
        self.assertEqual(sampling.score_source(
            {'last_success_at': (NOW - dt.timedelta(days=10)).isoformat()}, now=NOW), 10)
        self.assertEqual(sampling.score_source(
            {'last_success_at': (NOW - dt.timedelta(days=45)).isoformat()}, now=NOW), 30)
        self.assertEqual(sampling.score_source(
            {'last_success_at': (NOW + dt.timedelta(days=2)).isoformat()}, now=NOW), 0)

    def test_never_fetched_source_is_maximally_stale(self):
        self.assertEqual(sampling.score_source({}, now=NOW), 30)
        self.assertEqual(sampling.score_source({'last_success_at': 'not-a-date'}, now=NOW), 30)

    def test_change_signal_is_five_points_per_row_capped_at_twenty_five(self):
        base = {'last_success_at': NOW.isoformat()}
        self.assertEqual(sampling.score_source({**base, 'new_changed_rows_last_run': 3}, now=NOW), 15)
        self.assertEqual(sampling.score_source({**base, 'new_changed_rows_last_run': 9}, now=NOW), 25)

    def test_low_confidence_supply_is_two_points_per_edge_capped_at_twenty(self):
        base = {'last_success_at': NOW.isoformat()}
        self.assertEqual(sampling.score_source({**base, 'low_confidence_edges': 4}, now=NOW), 8)
        self.assertEqual(sampling.score_source({**base, 'low_confidence_edges': 40}, now=NOW), 20)

    def test_components_add_up_and_clamp_at_one_hundred(self):
        record = {'last_success_at': (NOW - dt.timedelta(days=30)).isoformat(),
                  'new_changed_rows_last_run': 5, 'low_confidence_edges': 10}
        self.assertEqual(sampling.score_source(record, now=NOW), 75)

    def test_failure_backoff_ladder_halves_then_quarters_then_skips(self):
        base = {'last_success_at': (NOW - dt.timedelta(days=40)).isoformat(),
                'new_changed_rows_last_run': 2}  # base priority 30 + 10 = 40
        self.assertEqual(sampling.score_source({**base, 'consecutive_failures': 0}, now=NOW), 40)
        self.assertEqual(sampling.score_source({**base, 'consecutive_failures': 1}, now=NOW), 20)
        self.assertEqual(sampling.score_source({**base, 'consecutive_failures': 2}, now=NOW), 10)
        self.assertEqual(sampling.score_source({**base, 'consecutive_failures': 3}, now=NOW), 0)
        self.assertEqual(sampling.score_source({**base, 'consecutive_failures': 7}, now=NOW), 0)
        self.assertFalse(sampling.is_backed_off({**base, 'consecutive_failures': 2}))
        self.assertTrue(sampling.is_backed_off({**base, 'consecutive_failures': 3}))

    def test_order_sources_sorts_by_priority_and_reports_backoff(self):
        state = {'version': 1, 'sources': {
            'https://stale.example/': {'last_success_at': (NOW - dt.timedelta(days=20)).isoformat()},
            'https://fresh.example/': {'last_success_at': NOW.isoformat()},
            'https://dead.example/': {'last_success_at': (NOW - dt.timedelta(days=90)).isoformat(),
                                      'consecutive_failures': 3, 'last_failure_status': 500},
            'https://new.example/': {},
        }}
        entries = [{'url': 'https://fresh.example/', 'name': 'Fresh'},
                   {'url': 'https://dead.example/', 'name': 'Dead'},
                   {'url': 'https://stale.example/', 'name': 'Stale'},
                   {'url': 'https://new.example/', 'name': 'New'}]
        ordered, skipped = sampling.order_sources(entries, state, now=NOW)
        # Never fetched (30) beats 20 days stale (20), which beats fresh (0).
        self.assertEqual([item['name'] for item in ordered], ['New', 'Stale', 'Fresh'])
        self.assertEqual([item['sampling_priority'] for item in ordered], [30, 20, 0])
        self.assertEqual([item['name'] for item in skipped], ['Dead'])
        self.assertTrue(skipped[0]['sampling_skipped'])
        self.assertIn('3 consecutive failures', skipped[0]['sampling_reason'])
        # Ordering is stable: equal priorities keep catalogue order.
        tied, _ = sampling.order_sources(
            [{'url': 'https://a.example/'}, {'url': 'https://b.example/'}], {'version': 1, 'sources': {}})
        self.assertEqual([item['url'] for item in tied],
                         ['https://a.example/', 'https://b.example/'])

    def test_record_outcome_resets_on_success_and_grows_on_failure(self):
        state = {'version': 1, 'sources': {}}
        record = sampling.record_outcome(state, 'https://example.com/', ok=True, status=200,
                                         new_changed_rows=4, low_confidence_edges=2, now=NOW)
        self.assertEqual(record['consecutive_failures'], 0)
        self.assertEqual(record['last_success_at'], NOW.isoformat(timespec='seconds'))
        self.assertEqual(record['last_status'], 200)
        self.assertEqual(record['new_changed_rows_last_run'], 4)
        self.assertEqual(record['low_confidence_edges'], 2)
        self.assertEqual(record['total_runs'], 1)
        sampling.record_outcome(state, 'https://example.com/', ok=False, status=503, now=NOW)
        sampling.record_outcome(state, 'https://example.com/', ok=False, status=503, now=NOW)
        record = state['sources']['https://example.com/']
        self.assertEqual(record['consecutive_failures'], 2)
        self.assertEqual(record['last_failure_status'], 503)
        self.assertEqual(record['new_changed_rows_last_run'], 0)
        self.assertEqual(record['total_runs'], 3)
        # Staleness 0 (fetched today) + 0 change rows + 2 low-confidence
        # edges (4 points), quartered by the 2-failure backoff.
        self.assertEqual(sampling.score_source(record, now=NOW), 1)

    def test_record_run_outcomes_attributes_rows_and_status(self):
        state = {'version': 1, 'sources': {}}
        results = [
            {'name': 'Ok', 'url': 'https://ok.example/', 'pages': [
                {'status': 'ok', 'http_status': 200}]},
            {'name': 'Broken', 'url': 'https://broken.example/', 'pages': [
                {'status': 'skipped', 'reason': 'HTTP 404'},
                {'status': 'skipped', 'reason': 'DNS lookup failed'}]},
        ]
        candidates = [{'partner': 'Ok'}, {'partner': 'Ok'}, {'partner': 'Broken'}]
        sampling.record_run_outcomes(state, results, candidates, now=NOW)
        ok = state['sources']['https://ok.example/']
        broken = state['sources']['https://broken.example/']
        self.assertEqual((ok['last_status'], ok['new_changed_rows_last_run']), (200, 2))
        self.assertEqual(broken['consecutive_failures'], 1)
        self.assertEqual(broken['last_failure_status'], 404)
        self.assertEqual(broken['new_changed_rows_last_run'], 0)

    def test_reset_source_clears_the_backoff_but_keeps_history(self):
        state = {'version': 1, 'sources': {
            'https://dead.example/': {'consecutive_failures': 4, 'last_failure_status': 500}}}
        self.assertTrue(sampling.reset_source(state, 'https://dead.example/'))
        record = state['sources']['https://dead.example/']
        self.assertEqual(record['consecutive_failures'], 0)
        self.assertEqual(record['last_failure_status'], 500)
        self.assertIn('manually_reset_at', record)
        self.assertFalse(sampling.reset_source(state, 'https://missing.example/'))

    def test_state_round_trips_through_tempfile_and_missing_file_seeds_empty(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'state.json'
            self.assertEqual(sampling.load_state(path), {'version': 1, 'sources': {}})
            state = {'version': 1, 'sources': {'https://example.com/': {'consecutive_failures': 1}}}
            sampling.save_state(state, path)
            self.assertEqual(sampling.load_state(path), state)
            (Path(tmp) / 'bad.json').write_text('{nope', encoding='utf-8')
            with self.assertRaises(ValueError):
                sampling.load_state(Path(tmp) / 'bad.json')


class SkipUnchangedTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # The #349 lesson: this test reads REAL reviewed records from the
        # repo file. A fixture with the wrong field name is how the bug
        # shipped -- reviewed records carry `description`, not
        # `site_description` (0 of 33 have the latter).
        cls.reviewed = json.loads((ROOT / 'data/partners-reviewed.json').read_text(encoding='utf-8'))
        assert 'description' in cls.reviewed['Artesian']
        assert 'site_description' not in cls.reviewed['Artesian']

    def test_real_reviewed_record_skips_when_description_and_website_match(self):
        record = self.reviewed['Artesian']
        candidate = {'site_description': record['description'], 'website': record['website']}
        self.assertTrue(sampling.should_skip_unchanged(candidate, record))

    def test_real_reviewed_record_skips_through_suggested_record(self):
        record = self.reviewed['Entrepreneur First']
        candidate = {'suggested_record': {'description': record['description'],
                                          'website': record['website']}}
        self.assertTrue(sampling.should_skip_unchanged(candidate, record))

    def test_comparison_is_normalised_for_case_whitespace_and_website_form(self):
        record = self.reviewed['Artesian']
        candidate = {'site_description': '  ' + record['description'].upper() + '\n',
                     'website': record['website'].rstrip('/') + '/'}
        self.assertTrue(sampling.should_skip_unchanged(candidate, record))
        www = {'site_description': record['description'],
               'website': 'https://www.artesianinvest.com'}
        self.assertTrue(sampling.should_skip_unchanged(www, record))

    def test_changed_description_or_website_never_skips(self):
        record = self.reviewed['Artesian']
        changed = {'site_description': record['description'] + ' New fund closed.',
                   'website': record['website']}
        self.assertFalse(sampling.should_skip_unchanged(changed, record))
        moved = {'site_description': record['description'],
                 'website': 'https://artesian.example/'}
        self.assertFalse(sampling.should_skip_unchanged(moved, record))

    def test_missing_description_on_either_side_never_skips(self):
        record = self.reviewed['Artesian']
        self.assertFalse(sampling.should_skip_unchanged(
            {'site_description': '', 'website': record['website']}, record))
        self.assertFalse(sampling.should_skip_unchanged(
            {'site_description': record['description'], 'website': record['website']}, {}))
        self.assertFalse(sampling.should_skip_unchanged(
            {'site_description': record['description'], 'website': ''}, record))

    def test_record_with_only_site_description_never_skips(self):
        # The #349 bug shape: a record carrying only `site_description`
        # must not skip, because the reviewed description is unknown.
        record = {'website': 'https://www.artesianinvest.com/',
                  'site_description': 'Global alternative asset manager founded in 2004.'}
        candidate = {'site_description': record['site_description'],
                     'website': record['website']}
        self.assertFalse(sampling.should_skip_unchanged(candidate, record))

    def test_partner_update_candidates_skips_unchanged_against_real_reviewed(self):
        snapshot = fixture('partner-update-snapshot.json')
        approved = [{'name': 'Artesian', 'url': 'https://www.artesianinvest.com/'},
                    {'name': 'Entrepreneur First', 'url': 'https://www.joinef.com/'},
                    {'name': 'Blackbird Ventures', 'url': 'https://www.blackbird.vc/'}]
        data = crawl.partner_update_candidates(snapshot, approved, self.reviewed)
        self.assertEqual(data['skipped_unchanged'], 2)
        self.assertEqual(data['skipped_unchanged_names'],
                         ['Artesian', 'Entrepreneur First'])
        self.assertEqual([c['name'] for c in data['candidates']], ['Blackbird Ventures'])
        candidate = data['candidates'][0]
        self.assertTrue(candidate['site_description'].startswith('Blackbird is an Australasian'))
        self.assertEqual(candidate['suggested_record']['description'], candidate['site_description'])

    def test_partner_update_candidates_without_reviewed_emits_everything(self):
        snapshot = fixture('partner-update-snapshot.json')
        approved = [{'name': 'Artesian', 'url': 'https://www.artesianinvest.com/'}]
        data = crawl.partner_update_candidates(snapshot, approved)
        self.assertEqual(data['skipped_unchanged'], 0)
        self.assertEqual(len(data['candidates']), 1)


class SlugNameTests(unittest.TestCase):
    def test_usv_card_evidence_names_win_over_badges(self):
        # Reconciled with main (23 Nov): USV portfolio links carry a
        # company-name evidence field captured at extraction time, and
        # that evidence name wins over both the round-badge link text and
        # any slug guess — USV names are never derived from badges (an
        # evidence-less USV link is counted unresolved, per main's
        # test_crawl_usv_cards). Slug derivation covers pages whose links
        # carry no such evidence (the tests below).
        page = fixture('usv-portfolio-profile-links.json')
        rows = crawl.extract_profile_leads('USV', page, 'companies')
        self.assertEqual([row['name'] for row in rows],
                         ['Abridge', 'Radiant', 'Tutor Intelligence', 'Coinbase',
                          'Efficient Computer', 'fomo'])
        self.assertTrue(all(row['name_evidence'] == 'portfolio-card-logo-alt' for row in rows))
        self.assertTrue(all(row['review_required'] for row in rows))
        self.assertEqual(rows[0]['candidate_url'], 'https://www.usv.com/portfolio/company/abridge')
        # The badge text is kept as evidence on the row (round + year).
        self.assertEqual(rows[0]['portfolio_card_text'], 'Seed, 2019')

    def test_partech_full_profile_badges_derive_from_slugs(self):
        page = fixture('partech-companies-profile-links.json')
        rows = crawl.extract_profile_leads('Partech', page, 'companies')
        # 'ai-coustics' derives literally as 'Ai Coustics' -- slug names are
        # inferred approximations, which is why they are flagged url_slug.
        self.assertEqual([row['name'] for row in rows],
                         ['Ablefy', 'Advano', 'Agicap', 'Ai Coustics', 'Akeneo'])
        self.assertTrue(all(row['name_source'] == 'url_slug' for row in rows))

    def test_pear_link_text_derives_from_slugs(self):
        page = fixture('pear-team-profile-links.json')
        rows = crawl.extract_profile_leads('Pear', page, 'people')
        self.assertEqual([row['name'] for row in rows],
                         ['Ajay Kamat', 'Alex Gao', 'Andrew Parambath', 'Aparna Sinha',
                          'Arash Afrakhteh'])
        self.assertTrue(all(row['name_source'] == 'url_slug' for row in rows))

    def test_artesian_full_profile_derives_from_slugs(self):
        page = fixture('artesian-team-profile-links.json')
        rows = crawl.extract_profile_leads('Artesian', page, 'people')
        self.assertEqual([row['name'] for row in rows],
                         ['Matthew Clunies Ross', 'John Mccartney', 'David Gallagher',
                          'Nikolaos Koukiasas'])

    def test_category_label_text_derives_from_slugs(self):
        page = fixture('main-sequence-portfolio-profile-links.json')
        rows = crawl.extract_profile_leads('Main Sequence', page, 'companies')
        self.assertEqual([row['name'] for row in rows],
                         ['Advanced Navigation', 'Aigentsphere', 'Amber Electric'])
        self.assertTrue(all(row['name_source'] == 'url_slug' for row in rows))
        blackbird = fixture('blackbird-team-profile-links.json')
        rows = crawl.extract_profile_leads('Blackbird Ventures', blackbird, 'people')
        self.assertEqual([row['name'] for row in rows],
                         ['Alex Apoifis', 'Alex Gifford', 'Alissa Lucas'])

    def test_real_names_keep_link_text_and_missing_text_derives(self):
        page = {'final_url': 'https://example.com/team', 'checked_at': '2026-11-23',
                'profile_links': [
                    {'url': 'https://example.com/team/jane-doe', 'text': 'Jane Doe'},
                    {'url': 'https://example.com/team/john-smith', 'text': ''},
                    {'url': 'https://example.com/team', 'text': 'Team'},
                    {'url': 'https://example.com/team/123', 'text': 'link'},
                    {'url': 'https://example.com/team/sam-lee', 'text': 'Seed, 2021'},
                ]}
        rows = crawl.extract_profile_leads('Example', page, 'people')
        self.assertEqual([(row['name'], row['name_source']) for row in rows],
                         [('Jane Doe', 'link_text'), ('John Smith', 'url_slug'),
                          ('Sam Lee', 'url_slug')])
        # 'Team' is a navigation label (skipped, as before); a numeric-only
        # slug cannot yield a name, so that row is skipped too.

    def test_slug_derivation_handles_trailing_slashes_and_empty_segments(self):
        self.assertEqual(crawl.slug_derived_name('https://pear.vc/members/ajay-kamat/'), 'Ajay Kamat')
        self.assertEqual(crawl.slug_derived_name('https://example.com/companies/co2-ai'), 'Co2 Ai')
        self.assertEqual(crawl.slug_derived_name('https://example.com/companies/'), 'Companies')
        self.assertIsNone(crawl.slug_derived_name('https://example.com/'))
        self.assertIsNone(crawl.slug_derived_name('https://example.com/team/12345'))


class DedupeTests(unittest.TestCase):
    def test_cross_page_dupes_keep_first_occurrence_only(self):
        data = fixture('profiles-cross-page-dupes.json')
        kept, dropped = crawl.dedupe_profile_candidates(data['candidates'])
        self.assertEqual(dropped, 6)
        self.assertEqual(len(kept), 4)
        self.assertEqual([row['name'] for row in kept],
                         ['Menu Close Icon', 'Menu Open Icon', 'LinkedIn', 'Metacognition'])
        # First occurrence wins, so the earliest source page is retained.
        self.assertEqual(kept[0]['source_url'], 'https://www.mseq.vc/')

    def test_dedupe_normalises_name_case_and_whitespace(self):
        rows = [{'name': '  Ada  Example ', 'candidate_url': 'https://example.com/ada.jpg'},
                {'name': 'ada example', 'candidate_url': 'https://example.com/ada.jpg'},
                {'name': 'Ada Example', 'candidate_url': 'https://example.com/other.jpg'}]
        kept, dropped = crawl.dedupe_profile_candidates(rows)
        self.assertEqual((len(kept), dropped), (2, 1))

    def test_dedupe_shares_seen_set_across_pages(self):
        seen = set()
        first, _ = crawl.dedupe_profile_candidates(
            [{'name': 'Logo', 'candidate_url': 'https://example.com/logo.svg'}], seen)
        second, dropped = crawl.dedupe_profile_candidates(
            [{'name': 'Logo', 'candidate_url': 'https://example.com/logo.svg'}], seen)
        self.assertEqual((len(first), len(second), dropped), (1, 0, 1))

    def test_crawl_profiles_dedupes_media_rows_across_pages(self):
        class Fake:
            def request(self, url, allowed_host=None, **kwargs):
                pages = {
                    'https://example.com/': (
                        b'<a href="/team">Our Team</a>'
                        b'<img alt="Menu Icon" src="/menu.svg">'
                        b'<a href="https://www.linkedin.com/company/example">LinkedIn</a>'),
                    'https://example.com/team': (
                        b'<a href="/team/jane-doe">Jane Doe</a>'
                        b'<img alt="Menu Icon" src="/menu.svg">'
                        b'<a href="https://www.linkedin.com/company/example">LinkedIn</a>'),
                }
                return 200, {'Content-Type': 'text/html'}, pages[url], url
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'approved.csv'
            path.write_text('partner,qid,official_website,approved\nExample,,https://example.com/,yes\n')
            args = types.SimpleNamespace(approved=path, partner=None, limit=0, follow=2)
            got = crawl.crawl_profiles({'partnerLeads': ['Example']}, args, Fake())
            self.assertEqual([row['name'] for row in got['candidates']],
                             ['Menu Icon', 'LinkedIn', 'Jane Doe'])
            self.assertEqual(got['results'][0]['duplicates_dropped'], 2)


class PerSourceStatusTests(unittest.TestCase):
    def test_coverage_records_per_source_status_and_rows(self):
        results = [
            {'name': 'Ok', 'url': 'https://ok.example/', 'pages': [{'status': 'ok'}]},
            {'name': 'Broken', 'url': 'https://broken.example/', 'pages': [
                {'status': 'skipped', 'reason': 'HTTP 404'},
                {'status': 'skipped', 'reason': 'DNS failure'}]},
            {'name': 'Untried', 'url': 'https://untried.example/', 'pages': []},
        ]
        candidates = [{'partner': 'Ok'}, {'partner': 'Ok'}, {'source_name': 'Broken'}]
        coverage = crawl.page_fetch_coverage(results, candidates)
        self.assertEqual(coverage['fetch_status'], 'partial')
        sources = {row['source']: row for row in coverage['sources']}
        self.assertEqual((sources['Ok']['status'], sources['Ok']['pages_ok'],
                          sources['Ok']['rows']), ('ok', 1, 2))
        self.assertEqual((sources['Broken']['status'], sources['Broken']['pages_ok'],
                          sources['Broken']['rows']), ('failed', 0, 1))
        self.assertIn('No pages fetched successfully', sources['Broken']['note'])
        self.assertEqual(sources['Untried']['status'], 'not_attempted')
        self.assertNotIn('note', sources['Untried'])

    def test_crawl_profiles_orders_by_priority_and_skips_backed_off_sources(self):
        class Fake:
            def __init__(self):
                self.calls = []
            def request(self, url, allowed_host=None, **kwargs):
                self.calls.append(url)
                return 200, {'Content-Type': 'text/html'}, b'<a href="/team">Our Team</a>', url
        real_now = dt.datetime.now(dt.timezone.utc)
        state = {'version': 1, 'sources': {
            'https://stale.example/': {'last_success_at': (real_now - dt.timedelta(days=20)).isoformat()},
            'https://fresh.example/': {'last_success_at': real_now.isoformat()},
            'https://dead.example/': {'consecutive_failures': 3},
        }}
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'approved.csv'
            path.write_text('partner,qid,official_website,approved\n'
                            'Fresh,,https://fresh.example/,yes\n'
                            'Stale,,https://stale.example/,yes\n'
                            'Dead,,https://dead.example/,yes\n')
            args = types.SimpleNamespace(approved=path, partner=None, limit=0, follow=0)
            transport = Fake()
            got = crawl.crawl_profiles(
                {'partnerLeads': ['Fresh', 'Stale', 'Dead']}, args, transport, source_state=state)
            # Stale (priority 20) runs before Fresh (0); Dead never fetches.
            self.assertEqual([row['name'] for row in got['results']], ['Stale', 'Fresh'])
            self.assertEqual(transport.calls, ['https://stale.example/', 'https://fresh.example/'])
            self.assertEqual([row['sampling_priority'] for row in got['results']], [20, 0])
            self.assertEqual([row['name'] for row in got['sampling_skipped']], ['Dead'])
            self.assertEqual(got['coverage']['sources'][0]['status'], 'ok')


if __name__ == '__main__':
    unittest.main()
