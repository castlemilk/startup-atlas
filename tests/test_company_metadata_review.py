import json
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import patch

from scripts.collection_coverage import ConflictError
from scripts.crawl import company_profile_observation, extract_page
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
            b'<p>"We have grown from seven to 130 staff," said a PsiQuantum founder.</p>'
            b'<p>A supplier of PsiQuantum employs 75 people.</p>'
            b'<p>PsiQuantum reported 60 staff at a supplier.</p>'
            b'<p>PsiQuantum has 50 employees of its customers in training.</p>'
            b'<p><script>PsiQuantum has 800 staff.</script></p>'
            b'<template><p>PsiQuantum reported 999 employees.</p></template>'
        )
        extracted = extract_page(html, SEED)
        self.assertEqual([entry['mention'] for entry in extracted['headcount_mentions']], [
            '130 people', 'We have grown from seven to 130 staff', '75 people', '60 staff', '50 employees',
        ])
        self.assertEqual(extracted['headcount_mentions'][-1]['employer_attribution'], 'unbound')
        page = {**extracted, 'status': 'ok', 'final_url': SEED, 'checked_at': AS_OF}
        candidate = company_profile_observation({'name': COMPANY, 'website': SEED}, page)
        self.assertEqual(candidate['headcount_mentions'], extracted['headcount_mentions'][:1])
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
