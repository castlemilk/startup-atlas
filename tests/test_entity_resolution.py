import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, ROOT / path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


er = load('atlas_entity_resolution', 'scripts/entity_resolution.py')


def tiny_registry():
    """A small hand-built registry (not the seeded one) for matching tests."""
    return {'version': 1, 'generated_at': '2026-11-23T00:00:00Z',
            'source_revision': 'test', 'entities': {
                'startup:canva': {'name': 'Canva', 'kind': 'startup',
                                  'aliases': ['Canva Pty Ltd'],
                                  'identity_key': 'canva.com',
                                  'identity_basis': 'website-host',
                                  'merged_from': [],
                                  'updated_at': '2026-11-23T00:00:00Z'},
                'partner:airtree': {'name': 'Airtree', 'kind': 'partner',
                                    'aliases': [],
                                    'identity_key': 'airtree.vc',
                                    'identity_basis': 'website-host',
                                    'merged_from': [],
                                    'updated_at': '2026-11-23T00:00:00Z'},
                'partner:unreviewed': {'name': 'Unreviewed', 'kind': 'partner',
                                       'aliases': [],
                                       'identity_key': None,
                                       'identity_basis': 'name-only',
                                       'merged_from': [],
                                       'updated_at': '2026-11-23T00:00:00Z'},
                'person:jane-example': {'name': 'Jane Example',
                                        'kind': 'person', 'aliases': [],
                                        'identity_key': 'linkedin.com/in/jane-example',
                                        'identity_basis': 'linkedin-url',
                                        'merged_from': [],
                                        'updated_at': '2026-11-23T00:00:00Z'},
            }, 'merges': []}


class NormaliserTests(unittest.TestCase):
    def test_host_normalisation_strips_www_trailing_dot_and_case(self):
        self.assertEqual(er.normalise_host('https://www.Canva.com/'), 'canva.com')
        self.assertEqual(er.normalise_host('canva.com.'), 'canva.com')
        self.assertEqual(er.normalise_host('https://airtree.vc/path?q=1'), 'airtree.vc')
        self.assertEqual(er.normalise_host(''), '')
        self.assertEqual(er.normalise_host(None), '')

    def test_linkedin_normalisation_collapses_locale_and_strips_query(self):
        self.assertEqual(
            er.normalise_linkedin('https://au.linkedin.com/in/billbartee'),
            'linkedin.com/in/billbartee')
        self.assertEqual(
            er.normalise_linkedin('https://www.linkedin.com/in/DidierElzinga/?trk=public'),
            'linkedin.com/in/didierelzinga')
        self.assertEqual(
            er.normalise_linkedin('https://www.linkedin.com/in/michael-de-nil/'),
            'linkedin.com/in/michael-de-nil')

    def test_linkedin_normalisation_rejects_non_profile_urls(self):
        self.assertEqual(er.normalise_linkedin('https://linkedin.com/company/example'), '')
        self.assertEqual(er.normalise_linkedin('https://example.com/in/jane'), '')
        self.assertEqual(er.normalise_linkedin(''), '')
        self.assertEqual(er.normalise_linkedin(None), '')

    def test_slug_reuses_make_graph_rules(self):
        self.assertEqual(er.slug('Café & Co.'), 'cafe-co')
        self.assertEqual(er.slug('LaunchVic'), 'launchvic')


class MatchingTests(unittest.TestCase):
    def test_exact_host_match_auto_merges(self):
        candidates = er.match_candidates(
            'Canva', 'https://www.canva.com/', 'startup', tiny_registry())
        self.assertEqual(len(candidates), 1)
        self.assertEqual(candidates[0]['id'], 'startup:canva')
        self.assertEqual(candidates[0]['score'], 1.0)
        self.assertEqual(candidates[0]['basis'], 'identity-key')
        self.assertTrue(candidates[0]['auto_merge'])

    def test_linkedin_match_across_partners_auto_merges(self):
        # Same LinkedIn URL seen at a second firm is the same person,
        # even when the name spelling differs slightly.
        candidates = er.match_candidates(
            'Jane  Example', 'https://linkedin.com/in/jane-example',
            'person', tiny_registry())
        self.assertEqual(candidates[0]['id'], 'person:jane-example')
        self.assertEqual(candidates[0]['score'], 1.0)
        self.assertTrue(candidates[0]['auto_merge'])

    def test_name_only_never_auto_merges(self):
        # An exact name match against a name-only entry is a review
        # proposal at most: no shared identity key, no auto-merge.
        candidates = er.match_candidates(
            'Unreviewed', None, 'partner', tiny_registry())
        self.assertEqual(len(candidates), 1)
        self.assertEqual(candidates[0]['id'], 'partner:unreviewed')
        self.assertLess(candidates[0]['score'], er.AUTO_MERGE_THRESHOLD)
        self.assertFalse(candidates[0]['auto_merge'])

    def test_name_similarity_alone_is_review_band_only(self):
        candidates = er.match_candidates(
            'Canva Pty Ltd', None, 'startup', tiny_registry())
        self.assertEqual(len(candidates), 1)
        self.assertEqual(candidates[0]['id'], 'startup:canva')
        self.assertGreaterEqual(candidates[0]['score'], er.REVIEW_MIN_SCORE)
        self.assertLess(candidates[0]['score'], er.AUTO_MERGE_THRESHOLD)
        self.assertFalse(candidates[0]['auto_merge'])

    def test_unrelated_name_produces_no_proposal(self):
        self.assertEqual(
            er.match_candidates('Zebra Finch', None, 'startup', tiny_registry()),
            [])

    def test_matching_is_scoped_to_kind(self):
        # 'Airtree' the startup must not match the partner of the same name.
        self.assertEqual(
            er.match_candidates('Airtree', None, 'startup', tiny_registry()),
            [])


class MergeTests(unittest.TestCase):
    def test_merge_record_round_trip(self):
        registry = tiny_registry()
        registry['entities']['person:jane-example--airtree'] = {
            'name': 'Jane Example', 'kind': 'person', 'aliases': [],
            'identity_key': 'linkedin.com/in/jane-example',
            'identity_basis': 'linkedin-url', 'merged_from': [],
            'updated_at': '2026-11-23T00:00:00Z'}
        er.apply_merge(registry, 'person:jane-example--airtree',
                       'person:jane-example', basis='linkedin-url',
                       decided_by='review-queue',
                       decided_at='2026-11-23T01:00:00Z')
        winner = registry['entities']['person:jane-example']
        self.assertEqual(winner['merged_from'],
                         ['person:jane-example--airtree'])
        self.assertEqual(registry['merges'], [{
            'from': 'person:jane-example--airtree',
            'to': 'person:jane-example', 'basis': 'linkedin-url',
            'decided_by': 'review-queue',
            'decided_at': '2026-11-23T01:00:00Z'}])
        loser = registry['entities']['person:jane-example--airtree']
        self.assertEqual(loser['merged_into'], 'person:jane-example')
        self.assertEqual(
            er.resolve_canonical_id(registry, 'person:jane-example--airtree'),
            'person:jane-example')
        self.assertEqual(
            er.resolve_canonical_id(registry, 'person:jane-example'),
            'person:jane-example')

    def test_merge_rejects_unknown_ids_self_merge_and_double_merge(self):
        registry = tiny_registry()
        with self.assertRaises(ValueError):
            er.apply_merge(registry, 'person:missing', 'person:jane-example',
                           'linkedin-url', 'review-queue')
        with self.assertRaises(ValueError):
            er.apply_merge(registry, 'person:jane-example',
                           'person:jane-example', 'linkedin-url', 'review-queue')
        registry['entities']['person:jane-example--airtree'] = {
            'name': 'Jane Example', 'kind': 'person', 'aliases': [],
            'identity_key': 'linkedin.com/in/jane-example',
            'identity_basis': 'linkedin-url', 'merged_from': [],
            'updated_at': '2026-11-23T00:00:00Z'}
        er.apply_merge(registry, 'person:jane-example--airtree',
                       'person:jane-example', 'linkedin-url', 'review-queue')
        with self.assertRaises(ValueError):
            er.apply_merge(registry, 'person:jane-example--airtree',
                           'person:jane-example', 'linkedin-url', 'review-queue')

    def test_merge_inherits_loser_aliases(self):
        registry = tiny_registry()
        registry['entities']['person:jane-example--airtree'] = {
            'name': 'J. Example', 'kind': 'person', 'aliases': ['Janey'],
            'identity_key': 'linkedin.com/in/jane-example',
            'identity_basis': 'linkedin-url', 'merged_from': [],
            'updated_at': '2026-11-23T00:00:00Z'}
        er.apply_merge(registry, 'person:jane-example--airtree',
                       'person:jane-example', 'linkedin-url', 'review-queue')
        winner = registry['entities']['person:jane-example']
        self.assertIn('J. Example', winner['aliases'])
        self.assertIn('Janey', winner['aliases'])


class SeedTests(unittest.TestCase):
    def test_registry_seed_is_structurally_sound(self):
        registry = er.build_registry()
        self.assertEqual(registry['version'], 1)
        self.assertTrue(registry['generated_at'])
        self.assertTrue(registry['source_revision'])
        entities = registry['entities']
        kinds = {}
        for entity_id, entity in entities.items():
            # Canonical IDs are kind:slug(name); profile people stay
            # scoped per partner as person:<slug>--<partner>.
            expected = f"{entity['kind']}:{er.slug(entity['name'])}"
            if entity['kind'] == 'person' and '--' in entity_id:
                self.assertRegex(
                    entity_id,
                    r'^person:[a-z0-9-]+--[a-z0-9-]+$')
                self.assertTrue(entity_id.startswith(expected + '--'))
            else:
                self.assertEqual(entity_id, expected)
            self.assertEqual(set(entity), {
                'name', 'kind', 'aliases', 'identity_key', 'identity_basis',
                'merged_from', 'updated_at'} |
                ({'merged_into'} if entity.get('merged_into') else set()))
            self.assertIn(entity['identity_basis'],
                          {'website-host', 'linkedin-url', 'name-only'})
            self.assertTrue(entity['updated_at'])
            if entity['identity_basis'] == 'name-only':
                self.assertIsNone(entity['identity_key'])
            else:
                self.assertTrue(entity['identity_key'])
            self.assertIsInstance(entity['aliases'], list)
            self.assertIsInstance(entity['merged_from'], list)
            kinds[entity['kind']] = kinds.get(entity['kind'], 0) + 1
        # Every merge is recorded in both places and resolves.
        for merge in registry['merges']:
            self.assertIn(merge['from'], entities)
            self.assertIn(merge['to'], entities)
            self.assertIn(merge['from'], entities[merge['to']]['merged_from'])
            self.assertEqual(entities[merge['from']]['merged_into'], merge['to'])
            self.assertEqual(er.resolve_canonical_id(registry, merge['from']),
                             merge['to'])
        self.assertTrue(all(kinds.values()))
        # Spot-check real records from the files on disk (branch data).
        self.assertEqual(entities['startup:canva']['identity_key'], 'canva.com')
        self.assertEqual(entities['startup:canva']['identity_basis'], 'website-host')
        self.assertEqual(entities['partner:airtree']['identity_key'], 'airtree.vc')
        self.assertEqual(entities['startup:fusion-books']['identity_basis'], 'name-only')
        self.assertIsNone(entities['startup:fusion-books']['identity_key'])
        self.assertEqual(
            entities['person:bill-bartee']['identity_key'],
            'linkedin.com/in/billbartee')
        self.assertEqual(
            entities['person:bill-bartee']['merged_from'],
            ['person:bill-bartee--main-sequence'])
        self.assertEqual(
            entities['person:didier-elzinga']['identity_key'],
            'linkedin.com/in/didierelzinga')
        self.assertEqual(
            entities['person:michael-de-nil']['identity_key'],
            'linkedin.com/in/michael-de-nil')
        # The four LinkedIn-carrying profile people are the seeded merges.
        seeded = [m for m in registry['merges']
                  if m['decided_by'] == 'seed:reviewed-data']
        self.assertEqual(len(seeded), 4)
        self.assertEqual(
            {m['to'] for m in seeded},
            {'person:bill-bartee', 'person:phoebe-pincus', 'person:ben-simai',
             'person:emma-grife'})
        self.assertTrue(all(m['basis'] == 'linkedin-url' for m in seeded))
        # On top of the seed, build_registry replays the APPROVED
        # review-queue merges (41 from the first validation pass);
        # rejected and pending proposals record no merge.
        replayed = [m for m in registry['merges']
                    if m['decided_by'] != 'seed:reviewed-data']
        self.assertEqual(len(registry['merges']), 45)
        self.assertEqual(len(replayed), 41)
        self.assertIn('partner:airtree-ventures',
                      entities['partner:airtree']['merged_from'])
        self.assertEqual(
            entities['partner:airtree-ventures']['merged_into'],
            'partner:airtree')
        self.assertIn('partner:blackbird',
                      entities['partner:blackbird-ventures']['merged_from'])
        for rejected_from in ('partner:monk-s-hill-ventures',
                              'partner:boost-cp', 'startup:morse'):
            self.assertNotIn(rejected_from,
                             {m['from'] for m in registry['merges']})
        for pending_from in ('partner:draper-vc', 'partner:amity-vc'):
            self.assertNotIn(pending_from,
                             {m['from'] for m in registry['merges']})
        # Partner leads with no reviewed website are name-only.
        reviewed = json.loads((ROOT / 'data' / 'partners-reviewed.json').read_text())
        leads = json.loads((ROOT / 'data' / 'partner-leads.json').read_text())
        unreviewed = [name for name in leads if name not in reviewed]
        self.assertTrue(unreviewed)
        for name in unreviewed:
            self.assertEqual(entities[f'partner:{er.slug(name)}']['identity_basis'],
                             'name-only')

    def test_seed_writes_to_tempfile_not_the_repo(self):
        with tempfile.TemporaryDirectory() as temp:
            registry = er.build_registry()
            target = Path(temp) / 'identity.json'
            target.write_text(json.dumps(registry), encoding='utf-8')
            reloaded = json.loads(target.read_text(encoding='utf-8'))
            self.assertEqual(reloaded['entities']['startup:canva']['identity_key'],
                             'canva.com')

    def test_seeded_registry_file_loads_and_matches_builder(self):
        stored = er.load_registry()
        self.assertEqual(stored['version'], 1)
        built = er.build_registry(
            generated_at=stored['generated_at'],
            source_revision=stored['source_revision'])
        self.assertEqual(stored, built)


class ReplayTests(unittest.TestCase):
    """Approved queue merges replay; rejected/pending change nothing."""

    def _queue_file(self, temp, entries):
        path = Path(temp) / 'review-queue.json'
        path.write_text(json.dumps({'version': 1, 'entries': entries}),
                        encoding='utf-8')
        return path

    def _entry(self, subject, target, status, **overrides):
        entry = {'id': f'merge:{subject}', 'kind': 'merge',
                 'subject': subject, 'subject_key': subject.split(':', 1)[1],
                 'candidates': [{'id': target, 'score': 0.89,
                                 'basis': 'name-similarity'}],
                 'evidence': [], 'confidence': 0.89,
                 'created_at': '2026-11-23T08:00:00Z', 'run': '44',
                 'status': status, 'decided_by': 'tester',
                 'decided_at': '2026-11-23T09:00:00Z',
                 'decision_note': None, 'evidence_fingerprint': 'x'}
        entry.update(overrides)
        return entry

    def test_replay_applies_only_approved_merges(self):
        with tempfile.TemporaryDirectory() as temp:
            queue_path = self._queue_file(temp, [
                self._entry('partner:canva-capital', 'partner:airtree',
                            'approved'),
                self._entry('partner:rejected-co', 'partner:airtree',
                            'rejected'),
                self._entry('partner:pending-co', 'partner:airtree',
                            'pending'),
                self._entry('startup:canva', 'partner:airtree', 'approved',
                            kind='fact'),
            ])
            registry = tiny_registry()
            er.replay_queue_decisions(registry, temp, queue_path=queue_path)
            # The approved subject was not seeded: replay adds it as a
            # minimal entry, then merges it, exactly as decide() does.
            loser = registry['entities']['partner:canva-capital']
            self.assertEqual(loser['merged_into'], 'partner:airtree')
            self.assertEqual(loser['name'], 'Canva Capital')
            self.assertEqual(
                registry['entities']['partner:airtree']['merged_from'],
                ['partner:canva-capital'])
            self.assertEqual(registry['merges'], [{
                'from': 'partner:canva-capital', 'to': 'partner:airtree',
                'basis': 'name-similarity', 'decided_by': 'tester',
                'decided_at': '2026-11-23T09:00:00Z'}])
            self.assertNotIn('partner:rejected-co', registry['entities'])
            self.assertNotIn('partner:pending-co', registry['entities'])

    def test_replay_is_deterministic_and_idempotent(self):
        with tempfile.TemporaryDirectory() as temp:
            queue_path = self._queue_file(temp, [
                self._entry('partner:canva-capital', 'partner:airtree',
                            'approved')])
            first = er.replay_queue_decisions(
                tiny_registry(), temp, queue_path=queue_path)
            second = er.replay_queue_decisions(
                tiny_registry(), temp, queue_path=queue_path)
            self.assertEqual(first, second)
            # Replaying over an already-replayed registry is a no-op.
            again = er.replay_queue_decisions(
                first, temp, queue_path=queue_path)
            self.assertEqual(first, again)

    def test_replay_without_queue_file_is_a_no_op(self):
        with tempfile.TemporaryDirectory() as temp:
            registry = tiny_registry()
            er.replay_queue_decisions(registry, temp)
            self.assertEqual(registry, tiny_registry())


if __name__ == '__main__':
    unittest.main()
