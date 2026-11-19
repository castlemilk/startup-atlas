import json
from pathlib import Path
from shutil import copyfile
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from scripts.collection_coverage import Ledger
from scripts.plan_company_profiles import build_plan, digest
from scripts.review_company_metadata import decision_proof, load_bundle, make_config, review
from scripts.rollup_company_metadata import rollup


REVISION = 'a' * 40
FIRST = '2026-11-19T03:04:05Z'
SECOND = '2026-11-19T03:04:06Z'
THIRD = '2026-11-19T03:04:07Z'
COMPANY = 'Ready Company'
OTHER = 'Second Company'
STAGED = 'Staged Company'
SITE = 'https://ready.example/'


class CompanyMetadataRollupTests(unittest.TestCase):
    def setUp(self):
        temp = TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        self.overlay = self.root / 'overlay.json'
        self.approved = self.root / 'seeds.csv'
        self.write(self.overlay, {'startups': [
            {'name': COMPANY, 'website': SITE}, {'name': OTHER, 'website': 'https://second.example/'},
        ]})
        self.approved.write_text(f'partner,official_website,approved\n{COMPANY},{SITE},yes\n', encoding='utf-8')
        self.plan = build_plan(self.overlay, self.approved, REVISION, limit=100)
        self.graph = {'version': 1, 'source_revision': REVISION, 'entities': [
            {'id': 'startup:ready-company', 'kind': 'startup', 'name': COMPANY, 'website': SITE},
        ]}

    @staticmethod
    def write(path, value):
        path.write_text(json.dumps(value), encoding='utf-8')
        return digest(path.read_bytes())

    @staticmethod
    def staged(**changes):
        return {
            'id': 'candidate:staged', 'name': STAGED, 'website': 'https://www.staged.example/',
            'identity_source': 'https://registry.example/staged', 'reviewed_at': FIRST,
            'identity_note': 'Verified saved regulator record and official site.', **changes,
        }

    def bundle(self, key, at, observations, *, staged=None, graph=None):
        folder = self.root / key
        folder.mkdir()
        batch = {'version': 1, 'revision': REVISION, 'plan_id': self.plan['plan_id'],
                 'as_of': at, 'reviewer': 'Offline fixture', 'evidence': [], 'decisions': []}
        if staged or graph:
            sha = self.write(folder / 'graph.json', self.graph if graph is None else graph)
            batch['identity_snapshot'] = {'path': 'graph.json', 'sha256': sha, 'snapshot_kind': 'built'}
        if staged:
            sha = self.write(folder / 'staged.json', {'version': 1, 'revision': REVISION, 'records': [staged]})
            batch['candidate_inventory'] = {'path': 'staged.json', 'sha256': sha}
        for i, (name, field, disposition) in enumerate(observations):
            key = f'evidence-{i}'
            payload = {'support': 'Saved observation from identified public company material.'}
            kind = 'blocked_receipt' if disposition == 'blocked' else 'review'
            if disposition == 'searched_unknown':
                kind = 'search_log'
                payload = {'version': 1, 'name': name, 'revision': REVISION, 'dimension': field, 'attempts': [
                    {'url': SITE + 'news', 'query': f'{name}: {field}', 'retrieved_at': at,
                     'outcome': 'no_supported_value', 'evidence': 'The saved page contained no qualifying value.'},
                ]}
            sha = self.write(folder / (key + '.json'), payload)
            batch['evidence'].append({'id': key, 'name': name, 'kind': kind, 'path': key + '.json', 'sha256': sha})
            batch['decisions'].append({'name': name, 'dimension': field, 'disposition': disposition,
                                       'evidence': [key], 'note': 'Bounded fixture decision.'})
        self.write(folder / 'batch.json', batch)
        return folder / 'batch.json', folder / 'coverage.sqlite'

    def commit(self, pair, limit=4):
        return review(self.overlay, self.approved, REVISION, *pair, limit=limit)

    def reconcile(self, *pairs, revision=REVISION):
        with patch('socket.socket', side_effect=AssertionError('Rollup opened a socket')):
            return rollup(self.overlay, self.approved, revision, pairs)

    def test_counts_unique_cells_and_preserves_a_later_block(self):
        first = self.bundle('first', FIRST, [(COMPANY, 'description', 'reviewed'), (STAGED, 'identity', 'reviewed')],
                            staged=self.staged())
        second = self.bundle('second', SECOND, [(COMPANY, 'description', 'blocked'),
                             (COMPANY, 'rounds', 'searched_unknown'), (STAGED, 'founder_bios', 'candidate')],
                             staged=self.staged())
        self.commit(first)
        self.commit(second)
        before = [path.read_bytes() for pair in (first, second) for path in pair]
        report = self.reconcile(first, second)
        self.assertEqual(report, self.reconcile(second, first, second))
        self.assertEqual(before, [path.read_bytes() for pair in (first, second) for path in pair])
        self.assertEqual(report['committed_field_cells'], 4)
        counts = report['coverage']
        self.assertEqual(counts['catalogue']['possible_field_cells'], 38)
        self.assertEqual(counts['approved_seed_ready']['companies'], 1)
        self.assertEqual(counts['staged_candidates']['companies'], 1)
        self.assertEqual(counts['catalogue']['by_field']['description']['reviewed'], 1)
        self.assertEqual(counts['catalogue']['by_field']['rounds']['searched_unknown'], 1)
        self.assertEqual(counts['staged_candidates']['by_field']['founder_bios']['candidate'], 1)
        self.assertEqual(counts['external_source_population'], 'unknown')
        item = next(item for item in report['observations'] if item['dimension'] == 'description')
        self.assertEqual([row['disposition'] for row in item['history']], ['reviewed', 'blocked'])
        self.assertEqual(item['effective_batch_sha256'], item['history'][0]['batch_sha256'])

    def test_later_review_can_record_and_resolve_conflict(self):
        checkpoints = []
        for at, disposition in ((FIRST, 'reviewed'), (SECOND, 'conflict'), (THIRD, 'reviewed')):
            pair = self.bundle(str(len(checkpoints)), at, [(COMPANY, 'founding', disposition)])
            self.commit(pair)
            checkpoints.append(pair)
        pending = self.reconcile(*checkpoints[:2])
        self.assertEqual(pending['coverage']['catalogue']['by_field']['founding']['conflict'], 1)
        resolved = self.reconcile(*checkpoints)
        self.assertEqual(resolved['coverage']['catalogue']['by_field']['founding']['reviewed'], 1)
        self.assertEqual(len(resolved['observations'][0]['history']), 3)

    def test_resume_reads_only_committed_companies_and_deduplicates_checkpoints(self):
        pair = self.bundle('resume', FIRST, [(COMPANY, 'identity', 'reviewed'), (OTHER, 'identity', 'reviewed')])
        self.commit(pair, limit=1)
        saved = pair[1].with_name('prior.sqlite')
        copyfile(pair[1], saved)
        partial = self.reconcile(pair)
        self.assertEqual(partial['batches'][0]['pending_companies'], [OTHER])
        self.assertEqual(partial['committed_field_cells'], 1)
        self.commit(pair, limit=1)
        complete = self.reconcile((pair[0], saved), pair)
        self.assertEqual(complete, self.reconcile(pair, (pair[0], saved)))
        self.assertEqual(complete['committed_field_cells'], 2)
        self.assertEqual(len(complete['batches']), 1)
        self.assertEqual(complete['batches'][0]['sequence'], 2)
        self.assertEqual(complete['batches'][0]['pending_companies'], [])

    def test_different_revisions_or_graph_inputs_fail_closed(self):
        first = self.bundle('first', FIRST, [(COMPANY, 'identity', 'reviewed')], graph=self.graph)
        second = self.bundle('second', SECOND, [(OTHER, 'identity', 'reviewed')],
                             graph={**self.graph, 'entities': []})
        self.commit(first)
        self.commit(second)
        with self.assertRaisesRegex(ValueError, 'exact inventory plan'):
            self.reconcile(first, revision='b' * 40)
        with self.assertRaisesRegex(ValueError, 'exact graph identity snapshot'):
            self.reconcile(first, second)

    def test_staged_id_or_host_collisions_require_separate_review(self):
        first = self.bundle('first', FIRST, [], staged=self.staged())
        self.commit(first)
        for checkpoint, staged in (
                ('id', self.staged(name='Different Company', website='https://different.example/')),
                ('name', self.staged(id='candidate:other', website='https://new.example/')),
                ('host', self.staged(id='candidate:another', name='Third Company', website='https://staged.example/'))):
            with self.subTest(checkpoint=checkpoint):
                pair = self.bundle(checkpoint, SECOND, [], staged=staged)
                self.commit(pair)
                with self.assertRaisesRegex(ValueError, 'identity conflicts'):
                    self.reconcile(first, pair)

    def test_equal_time_overlap_requires_reconciliation(self):
        first = self.bundle('first', FIRST, [(COMPANY, 'identity', 'reviewed')])
        second = self.bundle('second', FIRST, [(COMPANY, 'identity', 'conflict')])
        self.commit(first)
        self.commit(second)
        with self.assertRaisesRegex(ValueError, 'same review time'):
            self.reconcile(second, first)

    def test_does_not_create_ledgers_or_count_incomplete_attempts(self):
        bundle, ledger_path = self.bundle('first', FIRST, [(COMPANY, 'identity', 'reviewed')])
        with self.assertRaisesRegex(ValueError, 'checkpoint file does not exist'):
            self.reconcile((bundle, ledger_path))
        self.assertFalse(ledger_path.exists())
        at, _, sha, _, decisions, _, batch, staged = load_bundle(bundle, self.plan, self.overlay, self.approved)
        config = make_config(self.plan, at, sha, decisions, staged, batch.get('candidate_inventory'))
        proof = decision_proof(sha, decisions[COMPANY, 'identity'])
        with Ledger.create(ledger_path, config) as ledger:
            context = {'entity_id': COMPANY, 'scope_id': 'identity', 'at': at}
            ledger.apply('unfinished', 0, [{**context, 'type': 'discover', 'evidence': proof},
                                           {**context, 'type': 'start', 'attempt_id': proof['sha256']}], at)
        with self.assertRaisesRegex(ValueError, 'decision proof'):
            self.reconcile((bundle, ledger_path))
