import json
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import patch

from scripts.collection_coverage import ConflictError
from scripts.crawl import company_profile_observation, extract_page
from scripts.plan_company_profiles import build_plan, digest
from scripts.review_company_metadata import DIMENSIONS, review, saved_role_observations
from scripts.rollup_company_metadata import rollup


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
        self.graph_path = self.root / 'graph.json'
        self.batch_path = self.root / 'batch.json'
        self.ledger = self.root / 'ledger.sqlite'
        self.write(self.overlay, {'startups': [{'name': COMPANY, 'website': SEED},
                                               {'name': 'Another Company', 'website': 'https://another.example/'}]})
        self.approved.write_text(f'partner,official_website,approved\n{COMPANY},{SEED},yes\n', encoding='utf-8')
        plan = build_plan(self.overlay, self.approved, REVISION, limit=100)
        self.batch = {'version': 1, 'revision': REVISION, 'plan_id': plan['plan_id'],
                      'as_of': AS_OF, 'reviewer': 'Offline test fixture', 'evidence': [], 'decisions': []}
        self.graph = {'version': 1, 'source_revision': REVISION, 'entities': [
            {'kind': 'startup', 'id': 'startup:psiquantum', 'name': COMPANY, 'website': SEED},
            {'kind': 'startup', 'id': 'startup:another-company', 'name': 'Another Company',
             'website': 'https://another.example/'},
        ]}
        self.pin_graph()

    @staticmethod
    def write(path, value):
        path.write_text(json.dumps(value), encoding='utf-8')

    def evidence(self, key, kind, value, name=COMPANY, path=None):
        path = path or self.root / f'{key}.json'
        self.write(path, value)
        self.batch['evidence'].append({'id': key, 'name': name, 'kind': kind,
                                       'path': str(path.relative_to(self.root)), 'sha256': digest(path.read_bytes())})

    def pin_graph(self):
        self.write(self.graph_path, self.graph)
        self.batch['identity_snapshot'] = {'path': self.graph_path.name, 'snapshot_kind': 'built',
                                           'sha256': digest(self.graph_path.read_bytes())}

    @staticmethod
    def staged_company(**overrides):
        return {'id': 'candidate:au:example-review', 'name': 'Saved Company',
                'website': 'https://www.saved.example/', 'identity_source': 'https://registry.example/a1',
                'reviewed_at': AS_OF, 'identity_note': 'Saved regulator and official site evidence match.',
                **overrides}

    def stage_inventory(self, *records):
        path = self.root / 'candidates.json'
        self.write(path, {'version': 1, 'revision': REVISION, 'records': records})
        self.batch['candidate_inventory'] = {'path': path.name, 'sha256': digest(path.read_bytes())}
        return path

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
                            'website': SEED, 'summary': 'Fixture summary', 'profile_facts': []},
                'relationships': [{'from': 'person:founder', 'to': 'startup:psiquantum', 'kind': 'founded'}],
                'related_entities': [{'id': 'person:founder', 'kind': 'person', 'name': 'Fixture Founder',
                                      'website': SEED + 'founder'}],
                'articles': [{'startup_id': 'startup:psiquantum', 'title': EXAMPLE_TITLE,
                              'kind': 'technical milestone', 'published_on': '2026-11-19', 'url': SEED + 'news'}],
                'funding_rounds': []}

    @staticmethod
    def search_log(dimension='rounds', **attempt_changes):
        return {'version': 1, 'name': COMPANY, 'revision': REVISION, 'dimension': dimension,
                'attempts': [{'url': SEED + 'news', 'query': 'PsiQuantum announced financing rounds',
                              'retrieved_at': AS_OF, 'outcome': 'no_supported_value',
                              'evidence': 'The archived newsroom listed technical milestones within the checked period.',
                              **attempt_changes}]}

    @staticmethod
    def alias_receipt(alias_name='Psi Quantum', alias_website='https://old.example/', **updates):
        return {'version': 1, 'name': COMPANY, 'revision': REVISION, 'startup_id': 'startup:psiquantum',
                'alias_name': alias_name, 'alias_website': alias_website, 'source_url': SEED + 'history',
                'retrieved_at': AS_OF,
                'support': f'{COMPANY} previously used the name {alias_name} and website {alias_website}.',
                **updates}

    @staticmethod
    def publication_claim(dimension, path, subject, source, value, support):
        return {'version': 1, 'name': COMPANY, 'revision': REVISION, 'dimension': dimension,
                'public_path': path, 'subject_id': subject, 'source_url': source, 'retrieved_at': AS_OF,
                'value': value, 'support': support}

    def bio_claim(self, url=SEED + 'founder', subject='person:founder'):
        return self.publication_claim('founder_bios', ['related_entities', 0, 'website'], subject, url,
                                      {'bio_url': url, 'title': 'Fixture Founder | Biography'},
                                      'Fixture Founder previously worked in academic research.')

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

    def social_receipt(self, links=None, *, review_date='2026-11-17', **changes):
        pinned = json.loads(self.overlay.read_bytes())
        stored = [
            {'label': 'LinkedIn', 'url': 'https://www.linkedin.com/company/psiquantum-ltd',
             'source': SEED, 'reviewed_at': review_date},
            {'label': 'X', 'url': 'https://x.com/PsiQuantum', 'source': SEED, 'reviewed_at': review_date},
        ]
        pinned['startups'][0]['socials'] = stored
        self.write(self.overlay, pinned)
        self.batch['plan_id'] = build_plan(self.overlay, self.approved, REVISION, limit=100)['plan_id']
        return {
            'version': 1, 'name': COMPANY, 'revision': REVISION, 'startup_id': 'startup:psiquantum',
            'source_url': SEED, 'observed_on': '2026-11-18', 'reviewed_since': '2026-11-17',
            'acquisition': 'issuer_anchor_capture', 'evidence': 'Saved issuer links and their recorded roles.',
            'links': links if links is not None else [
                {'label': row['label'], 'url': row['url'], 'role': 'company'} for row in stored
            ],
            **changes,
        }

    def test_company_socials_keep_exact_issuer_links_and_dedup_literal_variants(self):
        receipt = self.social_receipt()
        aliases = [
            {'label': 'Twitter', 'url': 'https://twitter.com/psiquantum/', 'role': 'company'},
            {'label': 'LinkedIn', 'url': receipt['links'][0]['url'] + '/', 'role': 'company'},
        ]
        receipt['links'] = [*aliases, *receipt['links']]
        self.evidence('company-socials', 'company_social_review', receipt)
        first = self.run_review()
        decision, = first['decisions']
        self.assertEqual((decision['dimension'], decision['disposition']), ('company_socials', 'reviewed'))
        detail = decision['company_social_review']
        self.assertEqual(detail['coverage'], 'partial')
        self.assertEqual(detail['counts'], {'reviewed': 2, 'duplicate': 2, 'held': 0, 'rejected': 0})
        self.assertEqual([row['url'] for row in detail['links']], [row['url'] for row in receipt['links']])
        self.assertEqual([row.get('duplicate_of') for row in detail['links']],
                         [receipt['links'][3]['url'], receipt['links'][2]['url'], None, None])
        self.assertTrue(all(row['source_url'] == SEED and row['role'] == 'company' for row in detail['links']))
        self.assertEqual(first['coverage']['catalogue']['by_field']['company_socials']['reviewed'], 1)
        self.assertEqual(first['coverage']['catalogue']['possible_field_cells'], 2 * (len(DIMENSIONS) + 1))
        self.assertEqual(self.run_review()['decisions'], first['decisions'])

    def test_company_socials_distinguish_non_profiles_uncertain_ownership_and_unsupported_links(self):
        receipt = self.social_receipt()
        receipt['links'] = [
            {'label': 'Founder', 'url': 'https://www.linkedin.com/in/fixture', 'role': 'founder'},
            {'label': 'Founder', 'url': 'https://www.linkedin.com/in/fixture', 'role': 'company'},
            {'label': 'Share', 'url': 'https://twitter.com/intent/tweet?url=https://example.org/', 'role': 'company'},
            {'label': 'Publisher widget', 'url': 'https://x.com/Publisher', 'role': 'incidental'},
            {'label': 'X', 'url': 'https://x.com/PsiQuantumLabs', 'role': 'other_organisation'},
            {'label': 'Lookalike', 'url': 'https://www.linkedin.com/company/psiquantum-labs', 'role': 'company'},
            {'label': 'Unfamiliar platform', 'url': 'https://social.example.org/@psiquantum', 'role': 'company'},
            {'label': 'X', 'url': 'https://x.com/PsiQuantum'},
            {'label': 'X', 'url': 'https://x.com@elsewhere.example.org/PsiQuantum', 'role': 'company'},
        ]
        self.evidence('company-socials', 'company_social_review', receipt)
        report = self.run_review()
        decision, = report['decisions']
        self.assertEqual(decision['disposition'], 'candidate')
        detail = decision['company_social_review']
        self.assertEqual(detail['coverage'], 'unknown')
        self.assertEqual(detail['counts'], {'reviewed': 0, 'duplicate': 0, 'held': 3, 'rejected': 6})
        self.assertEqual([row['reason'] for row in detail['links']],
                         ['founder', 'non_profile_url', 'non_profile_url', 'incidental', 'other_organisation',
                          'no_exact_issuer_review', 'unsupported_profile_url', 'ownership_unconfirmed',
                          'unsafe_profile_url'])
        self.assertEqual(report['queue'][-1]['fields']['founder_socials'], 'unsearched')

    def test_company_socials_hold_stale_missing_and_foreign_evidence(self):
        cases = [
            ({'source_url': 'https://www.psiquantum.example.org/'}, 'issuer_source_mismatch'),
            ({'source_url': SEED + 'different-document'}, 'no_exact_issuer_review'),
            ({'observed_on': None}, 'missing_observation_date'),
            ({'observed_on': '2026-11-16'}, 'stale_observation'),
            ({'reviewed_since': '2026-11-18'}, 'stale_review'),
            ({'review_date': None}, 'missing_review_date'),
            ({'review_date': '2026-11-20'}, 'future_review_date'),
        ]
        for index, (changes, reason) in enumerate(cases):
            with self.subTest(reason=reason):
                self.ledger = self.root / f'social-{index}.sqlite'
                self.batch['evidence'] = []
                self.evidence('company-socials', 'company_social_review', self.social_receipt(**changes))
                decision, = self.run_review()['decisions']
                self.assertEqual(decision['disposition'], 'candidate')
                self.assertEqual(decision['company_social_review']['coverage'], 'unknown')
                self.assertTrue(all(row['reason'] == reason for row in decision['company_social_review']['links']))

    def test_company_socials_require_exact_identity_and_typed_evidence(self):
        wrong = self.social_receipt(startup_id='startup:another-company')
        self.evidence('company-socials', 'company_social_review', wrong)
        with self.assertRaisesRegex(ValueError, 'exact canonical startup'):
            self.run_review()
        self.batch['evidence'] = []
        self.evidence('generic-review', 'review', {'assertion': 'Company accounts'})
        self.decision('company_socials', 'reviewed', ['generic-review'])
        with self.assertRaisesRegex(ValueError, 'Unknown or duplicate explicit field decision'):
            self.run_review()
        self.batch['decisions'] = []
        self.batch['evidence'] = []
        self.evidence('company-socials', 'company_social_review', self.social_receipt())
        del self.batch['identity_snapshot']
        with self.assertRaisesRegex(ValueError, 'pinned identity snapshot'):
            self.run_review()
        self.assertFalse(self.ledger.exists())

    def test_company_socials_roll_up_with_legacy_and_newer_stale_checkpoints(self):
        receipt = self.social_receipt()
        self.evidence('legacy', 'review', {'claims': ['Identity']})
        self.decision('identity', 'reviewed', ['legacy'])
        legacy, legacy_ledger = self.batch_path, self.ledger
        self.assertNotIn('company_socials', self.run_review()['coverage']['catalogue']['by_field'])

        self.batch['evidence'], self.batch['decisions'] = [], []
        self.batch['as_of'] = '2026-11-19T04:00:00Z'
        self.batch_path, self.ledger = self.root / 'social-fresh.json', self.root / 'social-fresh.sqlite'
        self.evidence('fresh', 'company_social_review', receipt)
        fresh, fresh_ledger = self.batch_path, self.ledger
        self.run_review()

        self.batch['evidence'] = []
        self.batch['as_of'] = '2026-11-19T04:30:00Z'
        self.batch_path, self.ledger = self.root / 'social-other.json', self.root / 'social-other.sqlite'
        self.evidence('empty', 'company_social_review', {**receipt, 'source_url': SEED + 'news', 'links': []})
        other = self.batch_path, self.ledger
        self.run_review()
        separate = rollup(self.overlay, self.approved, REVISION, [(fresh, fresh_ledger), other])
        self.assertEqual(separate['coverage']['catalogue']['by_field']['company_socials']['reviewed'], 1)

        self.batch['evidence'] = []
        self.batch['as_of'] = '2026-11-19T05:00:00Z'
        self.batch_path, self.ledger = self.root / 'social-stale.json', self.root / 'social-stale.sqlite'
        self.evidence('stale', 'company_social_review', {**receipt, 'reviewed_since': '2026-11-19'})
        self.run_review()
        combined = rollup(self.overlay, self.approved, REVISION,
                          [(legacy, legacy_ledger), (fresh, fresh_ledger), other, (self.batch_path, self.ledger)])
        states = combined['coverage']['catalogue']['by_field']['company_socials']
        self.assertEqual((states['candidate'], states['reviewed']), (1, 0))
        observed = next(row for row in combined['observations'] if row['dimension'] == 'company_socials')
        self.assertEqual([row['disposition'] for row in observed['history']], ['reviewed', 'searched_unknown', 'candidate'])
        self.assertEqual(observed['effective_batch_sha256'], observed['history'][-1]['batch_sha256'])
        self.assertEqual(observed['history'][-1]['company_social_review']['source_hold'], 'stale_observation')

    def test_company_socials_empty_inspected_archive_is_searched_unknown(self):
        self.evidence('empty', 'company_social_review', self.social_receipt(links=[]))
        decision, = self.run_review()['decisions']
        self.assertEqual(decision['disposition'], 'searched_unknown')
        self.assertEqual(decision['company_social_review']['coverage'], 'unknown')

    def test_company_socials_keep_whole_company_checkpoints_within_event_budget(self):
        template = self.social_receipt(links=[])
        companies = [{'name': f'Company {index}', 'website': f'https://example-{index}.org/'}
                     for index in range(4)]
        self.write(self.overlay, {'startups': companies})
        self.approved.write_text('partner,official_website,approved\nCompany 0,https://example-0.org/,yes\n',
                                 encoding='utf-8')
        self.batch['plan_id'] = build_plan(self.overlay, self.approved, REVISION, limit=100)['plan_id']
        self.graph['entities'] = [
            {'id': f'startup:company-{index}', 'kind': 'startup', **row}
            for index, row in enumerate(companies)
        ]
        self.pin_graph()
        for index, company in enumerate(companies):
            name = company['name']
            social = {**template, 'name': name, 'source_url': company['website'],
                      'startup_id': f'startup:company-{index}'}
            self.evidence(f'social-{index}', 'company_social_review', social, name=name)
            self.evidence(f'ordinary-{index}', 'review', {'claims': ['Pending review']}, name=name)
            for dimension in DIMENSIONS:
                self.decision(dimension, 'candidate', [f'ordinary-{index}'], name=name)
        first = self.run_review(limit=4)
        self.assertEqual(len(first['checkpoint']['applied_companies']), 3)
        self.assertEqual(first['checkpoint']['remaining_companies'], 1)
        resumed = self.run_review(limit=4)
        self.assertEqual(resumed['checkpoint']['committed_field_cells'], 4 * (len(DIMENSIONS) + 1))
        self.assertEqual(resumed['checkpoint']['remaining_companies'], 0)

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
        self.evidence('search', 'search_log', self.search_log())
        self.evidence('bio', 'publication_claim', self.bio_claim())
        self.evidence('another-review', 'review', {'claims': ['different identity']}, name='Another Company')
        self.decision('identity', 'published', ['live'], public_path=['startup', 'id'])
        self.decision('milestones', 'published', ['live'], public_path=['articles', 0])
        self.decision('headcount', 'conflict', ['review'])
        self.decision('founder_bios', 'published', ['live', 'bio'], public_path=['related_entities', 0, 'website'])
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

    def save_founder_role_bundle(self, label, subjects, claim, *, head='', known_founder=True, main_entity=None):
        bio = SEED + 'founder'
        html = ('<head>' + head + '</head><script type="application/ld+json">'
                + json.dumps({'@graph': subjects}) + '</script>').encode('utf-8')
        extracted = extract_page(html, bio)
        if main_entity is not None:
            # Model a saved packet which retained this explicit ProfilePage reference.
            profile = next(row for row in extracted['structured_data'] if row.get('@type') == 'ProfilePage')
            profile['mainEntity'] = main_entity
        packet = self.profile_packet([
            {**self.profile_candidate('professional-bio', name='Fixture Founder',
                                      candidate_url=bio, **claim),
             'source_url': bio},
            self.profile_candidate('company-profile', description='Independent source context'),
        ])
        packet['results'][0]['pages'].append({'url': bio, 'final_url': bio,
            'status': 'ok', 'http_status': 200, 'checked_at': AS_OF, **extracted})
        readback = self.readback()
        if not known_founder:
            readback['relationships'][0]['kind'] = 'employment'
        self.batch['evidence'] = []
        self.ledger = self.root / f'{label}.sqlite'
        self.evidence('profile', 'company_profile_packet', packet)
        self.evidence('live', 'published_readback', readback)

    def assert_founder_role_status(self, result, expected):
        states = next(row['fields'] for row in result['queue'] if row['name'] == COMPANY)
        self.assertEqual(states['description'], 'candidate')
        self.assertEqual(states['founders'], 'unsearched')
        self.assertEqual(states['founder_roles'], expected)
        if expected == 'conflict':
            role_review = next(row for row in result['decisions'] if row['dimension'] == 'founder_roles')
            self.assertEqual(role_review['evidence'], ['profile'])
            self.assertEqual(role_review['candidate_inputs'], [])

    def test_saved_founder_roles_require_the_same_person_page_issuer_and_title(self):
        official_bio = SEED + 'founder'
        claimed_role = 'Co-founder and former CTO'
        person = {'@type': 'Person', 'name': 'Fixture Founder', 'url': official_bio,
                  'worksFor': {'name': COMPANY, 'url': SEED}, 'jobTitle': claimed_role}
        outsider = {**person, 'worksFor': {'name': COMPANY, 'url': 'https://other.example/'}}
        advisor = {**person, 'jobTitle': 'Advisor'}
        cases = (
            ('exact_cofounder_role', [person], {}, True, 'candidate'),
            ('known_founder_now_advisor', [advisor], {'role': 'Advisor'}, True, 'candidate'),
            ('same_name_different_issuer', [outsider], {}, True, 'unsearched'),
            ('advisor_relabelled_cofounder', [advisor], {}, True, 'unsearched'),
            ('role_only_on_other_issuer', [advisor, outsider], {}, True, 'unsearched'),
            ('candidate_affiliation_changed', [person], {'affiliation': outsider['worksFor']}, True, 'unsearched'),
            ('wrong_person_page', [{**person, 'url': SEED + 'another-bio'}], {}, True, 'unsearched'),
            ('same_role_on_another_person', [{**person, 'name': 'Another Person'}], {}, True, 'unsearched'),
            ('missing_structured_person', [], {}, True, 'unsearched'),
            ('executive_without_founded_edge', [person], {}, False, 'unsearched'),
        )
        for label, subjects, overrides, known_founder, expected in cases:
            with self.subTest(case=label):
                claim = {'role': claimed_role, 'affiliation': person['worksFor'], **overrides}
                self.save_founder_role_bundle(label, subjects, claim, known_founder=known_founder)
                self.assert_founder_role_status(self.run_review(), expected)

    def test_saved_founder_role_page_evidence_and_conflicting_titles(self):
        bio = SEED + 'founder'
        issuer = {'name': COMPANY, 'url': SEED}
        person = {'@type': 'Person', 'name': 'Fixture Founder', 'url': bio,
                  'worksFor': issuer, 'jobTitle': 'Co-founder and current CEO'}
        advisor = {**person, 'jobTitle': 'No longer CEO; independent advisor'}
        anchored = {**person, '@id': '#person',
                    'mainEntityOfPage': {'@type': 'ProfilePage', '@id': bio + '#profile', 'url': bio},
                    'worksFor': {**issuer, '@type': 'Organization', '@id': SEED + '#organization'}}
        article = {'@type': 'NewsArticle', 'url': bio, 'publisher': issuer, 'headline': 'Issuer news'}
        foreign_document = 'https://another.example/team/other-person'
        canonical = f'<link rel="canonical" href="{bio}">'
        changed_canonical = f'<link rel="canonical" href="{SEED}other-bio">'
        cases = (
            ('same_page_fragments_and_canonical', anchored, [], canonical, 'candidate'),
            ('same_title_duplicate', person, [person], '', 'candidate'),
            ('unrelated_subject_has_different_title', person, [{**advisor, 'name': 'Other Person'}], '', 'candidate'),
            ('bio_with_unbound_article', person, [{**article, 'url': SEED + 'separate-story'}], '', 'candidate'),
            ('external_person_id', {**person, '@id': foreign_document + '#person'}, [], '', 'unsearched'),
            ('different_main_entity_page', {**person, 'mainEntityOfPage': SEED + 'other-bio'},
             [], '', 'unsearched'),
            ('contradictory_main_entity_references',
             {**person, 'mainEntityOfPage': {'url': bio, '@id': foreign_document + '#profile'}},
             [], '', 'unsearched'),
            ('other_issuer_id', {**person, 'worksFor': {**issuer, '@id': 'https://another.example/#organization'}},
             [], '', 'unsearched'),
            ('person_typed_issuer', {**person, 'worksFor': {**issuer, '@type': 'Person'}}, [], '', 'unsearched'),
            ('issuer_has_conflicting_types',
             {**person, 'worksFor': {**issuer, '@type': ['Person', 'Organization']}}, [], '', 'unsearched'),
            ('canonical_points_at_different_bio', person, [], changed_canonical, 'unsearched'),
            ('canonical_points_at_other_host', person, [],
             f'<link rel="canonical" href="{foreign_document}">', 'unsearched'),
            ('two_different_canonicals', person, [], canonical + changed_canonical, 'unsearched'),
            ('og_document_points_at_different_bio', person, [],
             f'<meta property="og:url" content="{SEED}other-bio">', 'unsearched'),
            ('issuer_newsroom_page', person, [article], '', 'unsearched'),
            ('competing_ceo_role', person, [advisor], '', 'conflict'),
            ('competing_advisor_role', advisor, [person], '', 'conflict'),
        )
        for label, subject, others, head, expected in cases:
            with self.subTest(case=label):
                claim = {'role': subject['jobTitle'], 'affiliation': subject['worksFor']}
                self.save_founder_role_bundle(label, [subject, *others], claim, head=head)
                self.assert_founder_role_status(self.run_review(), expected)

    def test_founder_role_conflict_requires_fresh_checkpoint_when_decision_changes(self):
        bio = SEED + 'founder'
        affiliation = {'name': COMPANY, 'url': SEED}
        role = 'Co-founder and current CEO'
        person = {'@type': 'Person', 'name': 'Fixture Founder', 'url': bio,
                  'worksFor': affiliation, 'jobTitle': role}
        advisor = {**person, 'jobTitle': 'No longer CEO; independent advisor'}
        self.save_founder_role_bundle('conflicting_titles', [person, advisor],
                                     {'role': role, 'affiliation': affiliation})

        # Model the previous replay, which could commit the first title as a candidate.
        with patch('scripts.review_company_metadata.saved_role_observations',
                   side_effect=lambda *args: saved_role_observations(*args)[:1]):
            self.assert_founder_role_status(self.run_review(), 'candidate')
        earlier = self.ledger.read_bytes()
        with self.assertRaisesRegex(ValueError, 'founder role decision changed'):
            self.run_review()
        self.assertEqual(self.ledger.read_bytes(), earlier)

        self.ledger = self.root / 'fresh-ledger.sqlite'
        fresh = self.run_review()
        self.assert_founder_role_status(fresh, 'conflict')
        resumed = self.run_review()
        self.assertEqual(fresh['decisions'], resumed['decisions'])
        self.assertEqual(fresh['checkpoint']['sequence'], resumed['checkpoint']['sequence'])

    def test_saved_founder_role_shared_node_and_profile_subject_bindings(self):
        bio = SEED + 'founder'
        issuer = {'@type': 'Organization', '@id': SEED + '#issuer', 'name': COMPANY, 'url': SEED}
        founder = {'@type': 'Person', '@id': '#founder', 'name': 'Fixture Founder', 'url': '/founder',
                   'jobTitle': 'Co-founder', 'worksFor': issuer}
        other = {**founder, '@id': '#other', 'name': 'Different Person', 'jobTitle': 'Advisor'}
        profile = {'@type': 'ProfilePage', '@id': bio + '#profile', 'url': bio}
        unrelated_issuer = {**issuer, 'name': 'Another Company', 'url': 'https://another.example/'}
        cases = (
            ('shared_id_exact_duplicate', [founder, founder, issuer], None, 'candidate'),
            ('distinct_person_ids', [founder, other], None, 'candidate'),
            ('profile_main_entity_names_founder', [founder, other, profile], {'@id': bio + '#founder'}, 'candidate'),
            ('shared_person_id', [founder, {**other, '@id': '#founder'}], None, 'unsearched'),
            ('shared_person_id_absolute_and_reordered',
             [{**other, '@id': bio + '#founder'}, founder, {k: v for k, v in founder.items() if k != '@id'}],
             None, 'unsearched'),
            ('two_ids_for_same_founder', [founder, {**founder, '@id': '#another-founder'}], None, 'unsearched'),
            ('shared_issuer_id', [founder, unrelated_issuer], None, 'unsearched'),
            ('profile_main_entity_names_other_person', [founder, other, profile], {'@id': bio + '#other'},
             'unsearched'),
            ('profile_main_entity_id_unresolved', [founder, profile], '#unretained', 'unsearched'),
            ('profile_main_entity_conflicting_inline_name', [founder, profile],
             {'@id': '#founder', 'name': 'Different Person'}, 'unsearched'),
        )
        claim = {'role': founder['jobTitle'], 'affiliation': issuer}
        for label, subjects, main_entity, expected in cases:
            with self.subTest(case=label):
                self.save_founder_role_bundle(label, subjects, claim, main_entity=main_entity)
                self.assert_founder_role_status(self.run_review(), expected)

    def test_actual_issuer_excerpt_is_candidate_and_never_a_round(self):
        self.evidence('live', 'published_readback', self.readback())
        self.stage_early()
        result = self.run_review()
        early, = result['decisions']
        self.assertEqual((early['dimension'], early['disposition'], early['evidence']),
                         ('early_financing', 'candidate', ['form-d']))
        self.assertEqual(result['coverage']['approved_seed_ready']['by_field']['rounds']['unsearched'], 1)

    def test_named_headcount_survives_from_html_to_review_candidate(self):
        html = (
            b'<p>As of January 2020, PsiQuantum currently employs <strong>130</strong> people across its '
            b'Australian operations and plans to expand.</p>'
            b'<time>21 May</time><p>Founded in Palo Alto, PsiQuantum has more than 100 team members globally, '
            b'with operations in Chicago and Melbourne.</p>'
            b'<p>"We have grown from seven to 130 staff," said a PsiQuantum founder.</p>'
            b'<p>A supplier of PsiQuantum employs 75 people.</p>'
            b'<p>PsiQuantum reported 60 staff at a supplier.</p>'
            b'<p>PsiQuantum has 50 employees of its customers in training.</p>'
            b'<p><script>PsiQuantum has 800 staff.</script></p>'
            b'<template><p>PsiQuantum reported 999 employees.</p></template>'
        )
        extracted = extract_page(html, SEED)
        self.assertEqual([entry['mention'] for entry in extracted['headcount_mentions']], [
            '130 people', 'more than 100 team members globally', 'We have grown from seven to 130 staff',
            '75 people', '60 staff', '50 employees',
        ])
        self.assertEqual(extracted['headcount_mentions'][-1]['employer_attribution'], 'unbound')
        page = {**extracted, 'status': 'ok', 'final_url': SEED, 'checked_at': AS_OF}
        candidate = company_profile_observation({'name': COMPANY, 'website': SEED}, page)
        self.assertEqual(candidate['headcount_mentions'], extracted['headcount_mentions'][:2])
        packet = self.profile_packet([candidate])
        packet['results'][0]['pages'][0].update(extracted)
        self.evidence('profile', 'company_profile_packet', packet)
        result = self.run_review()
        headcount, = result['decisions']
        self.assertEqual((headcount['dimension'], headcount['disposition'], headcount['evidence']),
                         ('headcount', 'candidate', ['profile']))
        self.assertEqual(self.run_review()['checkpoint']['applied_companies'], [])

    def test_headcount_with_wrong_subject_source_or_page_bytes_fails_closed(self):
        trusted = extract_page(b'<p>PsiQuantum employs 130 employees.</p>', SEED)['headcount_mentions']
        ambiguous = extract_page(
            b'<p>PsiQuantum has 130 employees of its customers in training.</p>', SEED,
        )['headcount_mentions']
        for unbound in (
            extract_page(b'<p>A supplier of PsiQuantum employs 75 people.</p>', SEED)['headcount_mentions'],
            extract_page(
                '<p>“We have grown from seven to 130 staff,” said a PsiQuantum founder.</p>'.encode(), SEED,
            )['headcount_mentions'],
            ambiguous,
            [{'mention': '130 employees', 'context': 'PsiQuantum employs 130 employees.', 'source': 'https://elsewhere.example/'}],
            [{'mention': '135 employees', 'context': 'PsiQuantum employs 135 employees.', 'source': SEED}],
        ):
            with self.subTest(mentions=unbound):
                self.batch['evidence'] = []
                candidate = self.profile_candidate('company-profile', headcount_mentions=unbound)
                packet = self.profile_packet([candidate])
                packet['results'][0]['pages'][0]['headcount_mentions'] = trusted + ambiguous
                self.evidence('profile', 'company_profile_packet', packet)
                with self.assertRaisesRegex(ValueError, 'named company and saved page evidence'):
                    self.run_review()
                self.assertFalse(self.ledger.exists())

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

    def test_same_name_does_not_bind_an_unrelated_id_or_website(self):
        for change in ({'id': 'startup:unrelated'}, {'website': 'https://unrelated.example/'},
                       {'id': 'startup:unrelated', 'website': 'https://unrelated.example/'}):
            with self.subTest(change=change):
                live = self.readback()
                live['startup'].update(change)
                self.batch['evidence'] = []
                self.batch['decisions'] = []
                self.evidence('live', 'published_readback', live)
                self.decision('identity', 'published', ['live'], public_path=['startup', 'id'])
                with self.assertRaisesRegex(ValueError, 'exact canonical ID and reviewed name and website'):
                    self.run_review()
                self.assertFalse(self.ledger.exists())

    def test_canonical_binding_rejects_missing_stale_ambiguous_or_tampered_snapshot(self):
        self.evidence('live', 'published_readback', self.readback())
        self.decision('identity', 'published', ['live'], public_path=['startup', 'id'])
        del self.batch['identity_snapshot']
        with self.assertRaisesRegex(ValueError, 'revision-pinned identity snapshot'):
            self.run_review()
        self.graph['source_revision'] = 'b' * 40
        self.pin_graph()
        with self.assertRaisesRegex(ValueError, 'exact source revision'):
            self.run_review()
        self.graph['source_revision'] = REVISION
        self.graph['entities'].append(
            {'kind': 'startup', 'id': 'startup:conflicting', 'name': COMPANY.upper(), 'website': 'https://other.example/'})
        self.pin_graph()
        with self.assertRaisesRegex(ValueError, 'ambiguous canonical'):
            self.run_review()
        self.graph['entities'].pop()
        self.pin_graph()
        self.graph['entities'][0]['website'] = 'https://wrong.example/'
        self.write(self.graph_path, self.graph)
        with self.assertRaisesRegex(ValueError, 'Evidence digest changed'):
            self.run_review()
        self.pin_graph()
        with self.assertRaisesRegex(ValueError, 'match the reviewed overlay website'):
            self.run_review()
        self.assertFalse(self.ledger.exists())

    def test_alternate_identity_requires_official_evidence_and_citation(self):
        live = self.readback()
        live['startup'].update(name='Psi Quantum', website='https://old.example/')
        self.evidence('live', 'published_readback', live)
        self.decision('identity', 'published', ['live'], public_path=['startup', 'id'])
        with self.assertRaisesRegex(ValueError, 'exact canonical ID'):
            self.run_review()
        self.evidence('alias', 'identity_alias', self.alias_receipt())
        with self.assertRaisesRegex(ValueError, 'cite the alternate identity receipt'):
            self.run_review()
        self.batch['decisions'][0]['evidence'].append('alias')
        report = self.run_review()
        row, = report['decisions']
        self.assertEqual((row['name'], row['disposition']), (COMPANY, 'published'))
        self.assertEqual(report['identity_snapshot'], self.batch['identity_snapshot'])

    def test_ambiguous_or_unsubstantiated_alternate_identity_fails_closed(self):
        self.evidence('live', 'published_readback', self.readback())
        for alias, error in [
            (self.alias_receipt(alias_name='Another Company'), 'conflicts with another'),
            (self.alias_receipt(alias_website='https://another.example/'), 'conflicts with another'),
            (self.alias_receipt(source_url='https://old.example/history'), 'matching reviewed official evidence'),
            (self.alias_receipt(support='PsiQuantum mentioned something else.'), 'matching reviewed official evidence'),
        ]:
            with self.subTest(alias=alias):
                self.batch['evidence'] = self.batch['evidence'][:1]
                self.evidence('alias', 'identity_alias', alias)
                with self.assertRaisesRegex(ValueError, error):
                    self.run_review()
        self.batch['evidence'] = self.batch['evidence'][:1]
        self.evidence('alias', 'identity_alias', self.alias_receipt())
        self.evidence('second-alias', 'identity_alias', self.alias_receipt(alias_name='Psi Quanta'))
        with self.assertRaisesRegex(ValueError, 'More than one alternate identity'):
            self.run_review()
        self.assertFalse(self.ledger.exists())

    def test_search_log_must_be_specific_to_a_completed_search_of_the_field(self):
        for log, error in [
            ({'irrelevant': True}, 'Expected fields'),
            (self.search_log('headcount'), 'exact field'),
            (self.search_log(outcome='access_blocked'), 'completed, company-specific search'),
            (self.search_log(query='General news about a different company'), 'company-specific search'),
            (self.search_log(url='http://example.com/'), 'public HTTPS source URL'),
            (self.search_log(retrieved_at='2026-11-20T00:00:00Z'), 'at or before the batch review'),
        ]:
            with self.subTest(log=log):
                self.batch['evidence'] = []
                self.batch['decisions'] = []
                self.evidence('search', 'search_log', log)
                self.decision('rounds', 'searched_unknown', ['search'])
                with self.assertRaisesRegex(ValueError, error):
                    self.run_review()
                self.assertFalse(self.ledger.exists())

    def interpreted_readback(self):
        live = self.readback()
        live['startup']['profile_facts'] = [
            {'key': 'headcount', 'source': SEED + 'team-size',
             'value': 'As of 19 November 2026, the company reported a global team of more than 500 people.'},
            {'key': 'founder-role', 'source': SEED + 'about',
             'value': 'PsiQuantum listed Fixture Founder as Chief Scientist.'},
        ]
        live['funding_rounds'] = [
            {'id': 'fixture-series-d', 'startup_id': 'startup:psiquantum', 'source': SEED + 'round',
             'note': 'Led by Example Lead, with participation from Financial Investor.'}
        ]
        return live

    def test_typed_publication_claims_qualify_the_exact_published_value(self):
        live = self.interpreted_readback()
        self.evidence('live', 'published_readback', live)
        claims = [
            self.bio_claim(),
            self.publication_claim('founder_roles', ['startup', 'profile_facts', 1], 'person:founder',
                                   SEED + 'about', {'role': 'Chief Scientist'},
                                   'Fixture Founder as Chief Scientist'),
            self.publication_claim('headcount', ['startup', 'profile_facts', 0], 'startup:psiquantum',
                                   SEED + 'team-size', {'as_of': '2026-11-19', 'measure': 'people',
                                                        'scope': 'global', 'as_stated': 'more than 500'},
                                   live['startup']['profile_facts'][0]['value']),
            self.publication_claim('round_participants', ['funding_rounds', 0, 'note'], 'fixture-series-d',
                                   SEED + 'round', {'name': 'Financial Investor', 'role': 'participant'},
                                   'with participation from Financial Investor'),
        ]
        for index, claim in enumerate(claims):
            key = f'claim-{index}'
            self.evidence(key, 'publication_claim', claim)
            self.decision(claim['dimension'], 'published', ['live', key], public_path=claim['public_path'])
        result = self.run_review()
        self.assertEqual({row['dimension'] for row in result['decisions']}, {claim['dimension'] for claim in claims})

    def test_generic_review_cannot_substitute_for_interpreted_publication_evidence(self):
        self.evidence('live', 'published_readback', self.interpreted_readback())
        self.evidence('generic', 'review', {'looks_reviewed': True})
        for field, path in [
            ('founder_bios', ['related_entities', 0, 'website']), ('round_participants', ['funding_rounds', 0, 'note']),
            ('founder_roles', ['startup', 'profile_facts', 1]), ('headcount', ['startup', 'profile_facts', 0]),
        ]:
            with self.subTest(field=field):
                self.batch['decisions'] = []
                self.decision(field, 'published', ['live', 'generic'], public_path=path)
                with self.assertRaisesRegex(ValueError, 'typed publication claim'):
                    self.run_review()
        self.assertFalse(self.ledger.exists())

    def test_company_homepage_and_unrelated_round_comment_do_not_qualify(self):
        live = self.interpreted_readback()
        live['related_entities'][0]['website'] = SEED
        live['funding_rounds'][0]['note'] = 'Financial Investor did not participate in this round.'
        self.evidence('live', 'published_readback', live)
        self.evidence('bio', 'publication_claim', self.bio_claim(SEED))
        self.decision('founder_bios', 'published', ['live', 'bio'], public_path=['related_entities', 0, 'website'])
        with self.assertRaisesRegex(ValueError, 'same-person evidence from the linked biography'):
            self.run_review()
        self.batch['decisions'] = []
        self.evidence('participant', 'publication_claim',
                      self.publication_claim('round_participants', ['funding_rounds', 0, 'note'], 'fixture-series-d',
                                             SEED + 'round', {'name': 'Financial Investor', 'role': 'participant'},
                                             live['funding_rounds'][0]['note']))
        self.decision('round_participants', 'published', ['live', 'participant'], public_path=['funding_rounds', 0, 'note'])
        with self.assertRaisesRegex(ValueError, 'explicit matching source-attributed round clause'):
            self.run_review()
        self.assertFalse(self.ledger.exists())

    def test_interpreted_claim_cannot_drop_a_qualifier_or_reattribute_a_past_investment(self):
        live = self.interpreted_readback()
        live['funding_rounds'][0]['note'] = 'The earlier Series C closed with participation from Financial Investor.'
        self.evidence('live', 'published_readback', live)
        self.evidence('headcount', 'publication_claim',
                      self.publication_claim('headcount', ['startup', 'profile_facts', 0], 'startup:psiquantum',
                                             SEED + 'team-size', {'as_of': '2026-11-19', 'measure': 'people',
                                                                  'scope': 'global', 'as_stated': '500'},
                                             live['startup']['profile_facts'][0]['value']))
        self.decision('headcount', 'published', ['live', 'headcount'], public_path=['startup', 'profile_facts', 0])
        with self.assertRaisesRegex(ValueError, 'cited number, scope and observation date'):
            self.run_review()
        self.batch['decisions'] = []
        self.evidence('participant', 'publication_claim',
                      self.publication_claim('round_participants', ['funding_rounds', 0, 'note'], 'fixture-series-d',
                                             SEED + 'round', {'name': 'Financial Investor', 'role': 'participant'},
                                             'with participation from Financial Investor'))
        self.decision('round_participants', 'published', ['live', 'participant'], public_path=['funding_rounds', 0, 'note'])
        with self.assertRaisesRegex(ValueError, 'explicit matching source-attributed round clause'):
            self.run_review()
        self.assertFalse(self.ledger.exists())

    def test_round_receipt_cannot_shorten_the_published_participants_name(self):
        self.evidence('live', 'published_readback', self.interpreted_readback())
        self.evidence('participant', 'publication_claim',
                      self.publication_claim('round_participants', ['funding_rounds', 0, 'note'], 'fixture-series-d',
                                             SEED + 'round', {'name': 'Financial', 'role': 'participant'},
                                             'with participation from Financial'))
        self.decision('round_participants', 'published', ['live', 'participant'], public_path=['funding_rounds', 0, 'note'])
        with self.assertRaisesRegex(ValueError, 'explicit matching source-attributed round clause'):
            self.run_review()
        self.assertFalse(self.ledger.exists())

    def test_empty_batch_has_an_exact_unsearched_denominator(self):
        review = self.run_review()
        self.assertEqual(review['checkpoint']['sequence'], 0)
        self.assertEqual(review['coverage']['catalogue']['by_field']['portrait_candidates']['unsearched'], 2)

    def test_staged_company_resumes_in_a_separate_cohort_without_hosted_readback(self):
        record = self.staged_company()
        self.stage_inventory(record)
        self.evidence('staged-review', 'review', {'founders': ['A source-named founder']}, name=record['name'])
        self.decision('founders', 'reviewed', ['staged-review'], name=record['name'])
        first = self.run_review()
        resumed = self.run_review()
        staged = first['coverage']['staged_candidates']
        self.assertEqual(first['coverage']['catalogue']['companies'], 2)
        self.assertEqual(first['coverage']['approved_seed_ready']['companies'], 1)
        self.assertEqual(staged['companies'], 1)
        self.assertEqual(staged['possible_field_cells'], len(DIMENSIONS))
        self.assertEqual(staged['by_field']['founders']['reviewed'], 1)
        self.assertEqual(staged['by_field']['identity']['unsearched'], 1)
        self.assertTrue(all(cells['published'] == 0 for cells in staged['by_field'].values()))
        self.assertEqual(first['queue'][-1]['seed_state'], 'staged_unpublished')
        self.assertEqual(first['queue'][-1]['candidate_id'], record['id'])
        self.assertEqual(first['decisions'], resumed['decisions'])
        self.assertEqual(first['checkpoint']['sequence'], resumed['checkpoint']['sequence'])
        self.assertEqual(resumed['checkpoint']['applied_companies'], [])

    def test_staged_company_cannot_substitute_for_any_published_or_crawled_identity(self):
        record = self.staged_company()
        self.stage_inventory(record)
        for kind in ('published_readback', 'identity_alias', 'company_profile_packet',
                     'early_investment_manifest', 'publication_claim'):
            with self.subTest(kind=kind):
                self.batch['evidence'] = []
                self.evidence('misbound', kind, {'unvalidated': True}, name=record['name'])
                with self.assertRaisesRegex(ValueError, 'accept saved review, search or hold evidence only'):
                    self.run_review()
        self.batch['evidence'] = []
        self.evidence('review', 'review', {'reported': 'Source evidence only'}, name=record['name'])
        self.decision('identity', 'published', ['review'], name=record['name'], public_path=['startup', 'id'])
        with self.assertRaisesRegex(ValueError, 'cannot have a published disposition'):
            self.run_review()
        self.assertFalse(self.ledger.exists())

    def test_staging_checks_duplicate_catalogue_and_graph_identities(self):
        self.graph['entities'].append({'kind': 'startup', 'id': 'startup:graph-only',
                                       'name': 'Graph Only', 'website': 'https://www.graph-only.example/'})
        self.pin_graph()
        for records in (
            (self.staged_company(name=COMPANY.upper()),),
            (self.staged_company(website='https://psiquantum.com/'),),
            (self.staged_company(name='Graph Only'),),
            (self.staged_company(website='https://graph-only.example/company'),),
            (self.staged_company(), self.staged_company(name='Another Candidate', website='https://new.example/')),
        ):
            with self.subTest(records=records):
                self.stage_inventory(*records)
                with self.assertRaisesRegex(ValueError, 'conflicts with an existing candidate, overlay or graph identity'):
                    self.run_review()
        self.assertFalse(self.ledger.exists())

    def test_staged_inventory_needs_pinned_graph_and_digest_and_cannot_change_in_place(self):
        record = self.staged_company()
        path = self.stage_inventory(record)
        del self.batch['identity_snapshot']
        with self.assertRaisesRegex(ValueError, 'identity snapshot for deduplication'):
            self.run_review()
        self.pin_graph()
        self.evidence('staged-review', 'review', {'description': 'Saved evidence'}, name=record['name'])
        self.decision('description', 'reviewed', ['staged-review'], name=record['name'])
        self.assertEqual(self.run_review()['checkpoint']['sequence'], 1)
        replacement = self.staged_company(identity_note='A second saved identity observation.')
        self.write(path, {'version': 1, 'revision': REVISION, 'records': [replacement]})
        with self.assertRaisesRegex(ValueError, 'Evidence digest changed'):
            self.run_review()
        self.stage_inventory(replacement)
        with self.assertRaisesRegex(ConflictError, 'run config changed'):
            self.run_review()

    def test_partial_inventory_is_rejected(self):
        self.write(self.overlay, {'startups': [{'name': f'Company {index}'} for index in range(101)]})
        self.approved.write_text('partner,official_website,approved\n', encoding='utf-8')
        with self.assertRaisesRegex(ValueError, 'complete overlay of at most 100'):
            self.run_review()
        self.assertFalse(self.ledger.exists())
