"""Offline test over retained Side Stage homepage observations (crawl #46)."""
import importlib.util
import json
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location('atlas_crawl', ROOT / 'scripts/crawl.py')
crawl = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(crawl)
SAVED = ROOT / 'tests/fixtures/sidestage-home-team-crawl-46.json'
HOME = 'https://www.sidestage.vc/'
REPORT = HOME + 'outliers-report-2025'


class SideStageHomeTeamTests(unittest.TestCase):
    def run_saved(self, page, seed=HOME):
        calls = []

        class SavedOnly:
            def request(self, url, host):
                calls.append(url)
                return 200, {'Content-Type': 'text/html'}, b'', url

        def extract(_, url, **kwargs):
            return page if url == seed else {}

        with (patch.object(crawl, 'load_approved_csv', return_value=[
                {'name': 'Side Stage Ventures', 'url': seed, 'asset_hosts': []}]),
              patch.object(crawl, 'extract_page', side_effect=extract)):
            result = crawl.crawl_profiles({'partnerLeads': ['Side Stage Ventures']}, SimpleNamespace(
                approved=None, partner=None, limit=0, follow=2), SavedOnly())
        return calls, result

    def test_saved_dummy_links_bind_to_visible_team_headings_without_following(self):
        page = json.loads(SAVED.read_text())['observation']
        calls, result = self.run_saved(page)
        rows = result['candidates']
        self.assertEqual(len(rows), 8)
        self.assertEqual(calls, [HOME])
        self.assertEqual(rows[0]['name'], 'Markus Kahlbetzer')
        elli = next(r for r in rows if r['name'] == 'Elli Hanson')
        self.assertEqual(elli['candidate_url'], HOME + 'team/elli-hanson-2')
        self.assertEqual(elli['source_url'], HOME)
        self.assertEqual(elli['name_evidence'], 'homepage-team-heading-and-profile-path')
        self.assertTrue(all(r['review_required'] and 'headshot_candidate' not in r for r in rows))
        self.assertEqual(result['coverage']['profile_leads_by_kind']['people']['returned'], 8)

    def test_section_scope_collision_and_off_host_links_are_not_promoted(self):
        page = {
            'final_url': HOME, 'checked_at': '2026-11-23',
            'headings': [
                {'level': 'h2', 'text': 'team'}, {'level': 'h3', 'text': 'Ada Reed'},
                {'level': 'h3', 'text': 'Sam West'}, {'level': 'h3', 'text': 'Lee Bell'},
                {'level': 'h2', 'text': 'Portfolio'}, {'level': 'h3', 'text': 'Casey North'},
            ],
            'profile_links': [
                {'url': HOME + 'team/ada-reed', 'text': 'Dummy Link'},
                {'url': HOME + 'team/ada-reed-2', 'text': 'Dummy Link'},
                {'url': HOME + 'team/casey-north', 'text': 'Dummy Link'},
                {'url': HOME + 'team/sam-west?preview=1', 'text': 'Dummy Link'},
                {'url': 'https://outside.example/team/lee-bell', 'text': 'Dummy Link'},
            ],
        }
        self.assertEqual(self.run_saved(page)[1]['candidates'], [])
        page['profile_links'] = [{'url': HOME + 'team/ada-reed', 'text': 'Dummy Link'}]
        self.assertEqual(self.run_saved(page, seed=HOME + 'other')[1]['candidates'], [])

    def test_article_filter_keeps_real_team_and_other_hosts(self):
        for base in (HOME, 'https://other.example/'):
            page = {'final_url': base, 'profile_links': [
                {'url': base + 'outliers-report-2025', 'text': 'Thought Leadership 30.6.2025'},
                {'url': base + 'team', 'text': 'Team'},
            ]}
            self.assertEqual(crawl.profile_landing_links(page, base, 1),
                             [{'kind': 'people', 'url': base + 'team'}])
        self.assertEqual(crawl.profile_landing_links(
            {'final_url': HOME, 'profile_links': [
                {'url': REPORT, 'text': 'Thought Leadership 30.6.2025'}]}, HOME, 2), [])
        other = 'https://other.example/'
        targets = crawl.profile_landing_links({'final_url': other, 'profile_links': [
            {'url': other + 'outliers-report-2025', 'text': 'Thought Leadership 30.6.2025'},
        ]}, other, 2)
        self.assertEqual(targets, [{'kind': 'people', 'url': other + 'outliers-report-2025'}])
