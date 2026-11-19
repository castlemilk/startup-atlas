import json
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import patch

from scripts.collection_coverage import ConflictError
from scripts.plan_company_profiles import build_plan, digest
from scripts.review_company_metadata import DIMENSIONS, review


ROOT = Path(__file__).resolve().parents[1]
EARLY_EXAMPLE = ROOT / 'research/funding/2026-11-19-psiquantum'
REVISION = 'a' * 40
AS_OF = '2026-11-19T03:04:05Z'
SEED = 'https://www.psiquantum.com/'
COMPANY = 'PsiQuantum'
EXAMPLE_TITLE = 'Source-reported company milestone'


class CompanyMetadataReviewTests(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.root = Path(tmp.name)
        self.overlay = self.root / 'overlay.json'
        self.approved = self.root / 'seeds.csv'
        self.batch_path = self.root / 'batch.json'
        self.ledger = self.root / 'ledger.sqlite'
        self.write(self.overlay, {'startups': [{'name': COMPANY, 'website': SEED},
                                               {'name': 'Another Company', 'website': 'https://another.example/'}]})
        self.approved.write_text(f'partner,official_website,approved\n{COMPANY},{SEED},yes\n', encoding='utf-8')
        plan = build_plan(self.overlay, self.approved, REVISION, limit=100)
        self.batch = {'version': 1, 'revision': REVISION, 'plan_id': plan['plan_id'],
                      'as_of': AS_OF, 'reviewer': 'Offline test fixture', 'evidence': [], 'decisions': []}

    @staticmethod
    def write(path, value):
        path.write_text(json.dumps(value), encoding='utf-8')

    def evidence(self, key, kind, value, name=COMPANY, path=None):
        path = path or self.root / f'{key}.json'
        self.write(path, value)
        self.batch['evidence'].append({'id': key, 'name': name, 'kind': kind,
                                       'path': str(path.relative_to(self.root)), 'sha256': digest(path.read_bytes())})

    def decision(self, field, disposition, evidence, name=COMPANY, **extra):
        self.batch['decisions'].append({'name': name, 'dimension': field, 'disposition': disposition,
                                        'note': 'Bounded fixture review.', 'evidence': evidence, **extra})

    def run_review(self, limit=1):
        self.write(self.batch_path, self.batch)
        with patch('socket.socket', side_effect=AssertionError('Offline review opened a socket')):
            return review(self.overlay, self.approved, REVISION, self.batch_path, self.ledger, limit)

    @staticmethod
    def readback():
        return {'revision': REVISION, 'mainRevision': REVISION, 'indexStatus': 'current',
                'startup': {'kind': 'startup', 'id': 'startup:psiquantum', 'name': COMPANY,
                            'summary': 'Fixture summary', 'profile_facts': []},
                'relationships': [{'from': 'person:founder', 'to': 'startup:psiquantum', 'kind': 'founded'}],
                'related_entities': [{'id': 'person:founder', 'kind': 'person', 'name': 'Fixture Founder',
                                      'website': SEED + 'founder'}],
                'articles': [{'startup_id': 'startup:psiquantum', 'title': EXAMPLE_TITLE,
                              'kind': 'technical milestone', 'published_on': '2026-11-19', 'url': SEED + 'news'}],
                'funding_rounds': []}

    @staticmethod
    def profile_packet(candidates, final=SEED):
        return {'version': 1, 'mode': 'company-profiles', 'generated_at': AS_OF, 'candidates': candidates,
                'results': [{'name': COMPANY, 'url': SEED, 'pages': [
                    {'url': SEED, 'final_url': final, 'checked_at': AS_OF, 'status': 'ok', 'http_status': 200}
                ]}]}

    @staticmethod
    def profile_candidate(kind, **extra):
        return {'company': COMPANY, 'kind': kind, 'source_url': SEED, 'checked_at': AS_OF,
                'review_required': True, **extra}

    def stage_early(self, **overrides):
        folder = self.root / 'early'
        shutil.copytree(EARLY_EXAMPLE, folder)
        manifest = folder / 'manifest.json'
        staged = {**json.loads(manifest.read_bytes()), 'catalogue_revision': REVISION, **overrides}
        self.evidence('form-d', 'early_investment_manifest', staged, path=manifest)

    def test_exact_cohorts_all_dispositions_and_restart(self):
        self.evidence('live', 'published_readback', self.readback())
        self.evidence('review', 'review', {'claims': ['candidate', 'reviewed']})
        self.evidence('hold', 'blocked_receipt', {'reason': 'asset reuse permission unresolved'})
        self.evidence('search', 'search_log', {'scope': 'one source, unknown answer'})
        self.evidence('another-review', 'review', {'claims': ['different identity']}, name='Another Company')
        self.decision('identity', 'published', ['live'], public_path=['startup', 'id'])
        self.decision('milestones', 'published', ['live'], public_path=['articles', 0])
        self.decision('headcount', 'conflict', ['review'])
        self.decision('founder_bios', 'published', ['live'], public_path=['related_entities', 0, 'website'])
        self.decision('rounds', 'searched_unknown', ['search'])
        self.decision('founder_socials', 'candidate', ['review'])
        self.decision('portrait_rights', 'blocked', ['hold'])
        self.decision('aliases', 'reviewed', ['review'])
        self.decision('sectors', 'not_applicable', ['another-review'], name='Another Company')

        first = self.run_review()
        self.assertEqual(first['checkpoint'], {'sequence': 1, 'applied_companies': [COMPANY],
                                                'next_company': 'Another Company', 'remaining_companies': 1,
                                                'committed_field_cells': 8, 'saved_batch_field_cells': 9})
        self.assertEqual(first['coverage']['catalogue']['companies'], 2)
        self.assertEqual(first['coverage']['catalogue']['possible_field_cells'], 2 * len(DIMENSIONS))
        self.assertEqual(first['coverage']['approved_seed_ready']['companies'], 1)
        self.assertEqual(first['coverage']['external_source_population'], 'unknown')
        self.assertEqual(first['coverage']['seed_states']['seed_review_required'], 1)
        self.assertEqual(first['queue'][0]['fields']['sectors'], 'unsearched')
        self.assertEqual(first['coverage']['catalogue']['by_field']['identity']['published'], 1)
        self.assertEqual(first['coverage']['catalogue']['by_field']['sectors']['unsearched'], 2)

        second = self.run_review()
        self.assertEqual(second['checkpoint']['applied_companies'], ['Another Company'])
        self.assertEqual(second['checkpoint']['committed_field_cells'], 9)
        self.assertEqual(second['coverage']['catalogue']['by_field']['sectors']['not_applicable'], 1)
        self.assertEqual(second['coverage']['approved_seed_ready']['by_field']['sectors']['unsearched'], 1)
        repeated = self.run_review()
        self.assertEqual(repeated['checkpoint']['sequence'], 2)
        self.assertEqual(repeated['checkpoint']['applied_companies'], [])
        self.assertEqual(repeated['decisions'], second['decisions'])
        self.assertEqual(repeated['coverage'], second['coverage'])

    def test_replay_stages_candidates_keeps_manual_disposition_and_does_not_join_a_wrong_person(self):
        official_bio = SEED + 'founder'
        candidates = [
            self.profile_candidate('company-profile', description='From the website'),
            self.profile_candidate('newsroom-article', title=EXAMPLE_TITLE, date_state='conflict'),
            self.profile_candidate('professional-bio', name='Somebody Else', bio='Another person',
                                   social_candidates=['https://www.linkedin.com/in/someone-else/']),
            self.profile_candidate('professional-bio', name='Fixture Founder', candidate_url=SEED,
                                   bio='Same name on a different company page'),
            {**self.profile_candidate('professional-bio', name='Fixture Founder', candidate_url=official_bio,
                                      headshot_candidate={'status': 'not_fetched'}), 'source_url': official_bio},
        ]
        packet = self.profile_packet(candidates)
        packet['results'][0]['pages'].append({'url': official_bio, 'final_url': official_bio,
                                               'status': 'ok', 'checked_at': AS_OF, 'http_status': 200})
        self.evidence('profile', 'company_profile_packet', packet)
        self.evidence('live', 'published_readback', self.readback())
        self.decision('description', 'published', ['live'], public_path=['startup', 'summary'])
        result = self.run_review()
        states = {row['dimension']: row for row in result['decisions']}
        self.assertEqual(set(states), {'description', 'news', 'portrait_candidates'})
        self.assertEqual(states['description']['candidate_inputs'], ['profile'])
        self.assertEqual(states['description']['disposition'], 'published')
        self.assertEqual(states['news']['disposition'], 'candidate')
        self.assertEqual(states['portrait_candidates']['disposition'], 'candidate')
        self.assertEqual(result['coverage']['approved_seed_ready']['by_field']['portrait_rights']['unsearched'], 1)

    def test_off_scope_failed_or_wrong_timestamp_candidates_cannot_enter_ledger(self):
        for final, source, checked, error in [
            ('https://outside.example/', 'https://outside.example/', AS_OF, 'outside the approved source'),
            (SEED, SEED + 'unread', AS_OF, 'outside its successful page evidence'),
            (SEED, SEED, '2026-11-19T03:04:04Z', 'outside its successful page evidence'),
        ]:
            with self.subTest(final=final, source=source, checked=checked):
                self.batch['evidence'] = []
                candidate = {**self.profile_candidate('newsroom-article', title=EXAMPLE_TITLE),
                             'source_url': source, 'checked_at': checked}
                self.evidence('profile', 'company_profile_packet', self.profile_packet([candidate], final=final))
                with self.assertRaisesRegex(ValueError, error):
                    self.run_review()
                self.assertFalse(self.ledger.exists())

    def test_actual_issuer_excerpt_is_candidate_and_never_a_round(self):
        self.evidence('live', 'published_readback', self.readback())
        self.stage_early()
        result = self.run_review()
        early, = result['decisions']
        self.assertEqual((early['dimension'], early['disposition'], early['evidence']),
                         ('early_financing', 'candidate', ['form-d']))
        self.assertEqual(result['coverage']['approved_seed_ready']['by_field']['rounds']['unsearched'], 1)

    def test_issuer_from_wrong_startup_id_cannot_join_by_company_name(self):
        self.evidence('live', 'published_readback', self.readback())
        self.stage_early(startup_id='startup:another-company')
        with self.assertRaisesRegex(ValueError, 'exact startup ID'):
            self.run_review()
        self.assertFalse(self.ledger.exists())

    def test_artifact_change_and_new_bundle_cannot_overwrite_checkpoint(self):
        self.evidence('review', 'review', {'source': 'v1'})
        self.decision('founding', 'reviewed', ['review'])
        self.assertEqual(self.run_review()['checkpoint']['sequence'], 1)
        path = self.root / 'review.json'
        self.write(path, {'source': 'v2'})
        with self.assertRaisesRegex(ValueError, 'Evidence digest changed'):
            self.run_review()
        self.batch['evidence'][0]['sha256'] = digest(path.read_bytes())
        with self.assertRaisesRegex(ConflictError, 'run config changed'):
            self.run_review()
        self.approved.write_text('partner,official_website,approved\n', encoding='utf-8')
        with self.assertRaisesRegex(ValueError, 'exact inventory plan'):
            self.run_review()

    def test_duplicate_cross_company_and_missing_typed_evidence_are_rejected(self):
        self.evidence('review', 'review', {'claim': 'one'})
        self.decision('aliases', 'reviewed', ['review'])
        self.decision('aliases', 'candidate', ['review'])
        with self.assertRaisesRegex(ValueError, 'duplicate'):
            self.run_review()
        self.batch['decisions'] = []
        self.decision('aliases', 'reviewed', ['review'], name='Another Company')
        with self.assertRaisesRegex(ValueError, 'same company'):
            self.run_review()
        self.batch['decisions'] = []
        self.decision('portrait_rights', 'blocked', ['review'])
        with self.assertRaisesRegex(ValueError, 'blocked_receipt'):
            self.run_review()
        self.assertFalse(self.ledger.exists())

    def test_stale_readback_unsupported_or_wrong_publication_paths_are_rejected(self):
        live = self.readback()
        self.evidence('live', 'published_readback', {**live, 'mainRevision': 'b' * 40})
        with self.assertRaisesRegex(ValueError, 'exact, current hosted readback'):
            self.run_review()
        self.batch['evidence'] = []
        self.evidence('live', 'published_readback', live)
        self.decision('early_financing', 'published', ['live'], public_path=['funding_rounds', 0])
        with self.assertRaisesRegex(ValueError, 'No supported publication path'):
            self.run_review()
        self.batch['decisions'] = []
        self.decision('founders', 'published', ['live'], public_path=['startup', 'id'])
        with self.assertRaisesRegex(ValueError, 'mismatched published value'):
            self.run_review()

    def test_empty_batch_has_an_exact_unsearched_denominator(self):
        review = self.run_review()
        self.assertEqual(review['checkpoint']['sequence'], 0)
        self.assertEqual(review['coverage']['catalogue']['by_field']['portrait_candidates']['unsearched'], 2)

    def test_partial_inventory_is_rejected(self):
        self.write(self.overlay, {'startups': [{'name': f'Company {index}'} for index in range(101)]})
        self.approved.write_text('partner,official_website,approved\n', encoding='utf-8')
        with self.assertRaisesRegex(ValueError, 'complete overlay of at most 100'):
            self.run_review()
        self.assertFalse(self.ledger.exists())
