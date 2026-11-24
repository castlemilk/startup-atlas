import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

import pyarrow.parquet as pq

ROOT = Path(__file__).resolve().parents[1]


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, ROOT / path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


graph = load('atlas_graph_kg', 'scripts/make-graph.py')
backfill = load('atlas_backfill_kg', 'scripts/backfill_structured_fields.py')
edges_parquet = load('atlas_edges_parquet_kg', 'scripts/graph_edges_parquet.py')

TODAY = '2026-11-23'


def simple_research(**startup_overrides):
    startup = {'name': 'Example', 'source': 'https://example.com/'}
    startup.update(startup_overrides)
    return {'reviewed': '2026-11-20', 'startups': [startup]}


class VersionTwoTests(unittest.TestCase):
    def test_entities_and_edges_carry_version_two_fields(self):
        research = simple_research(
            website='https://example.com/',
            founders=[{'name': 'Pat Founder', 'source': 'https://example.com/team'}])
        result = graph.build_graph({}, [], {}, {'opportunities': []}, research, today=TODAY)
        self.assertEqual(result['version'], 2)
        entity = next(item for item in result['entities'] if item['id'] == 'startup:example')
        self.assertEqual(entity['canonical_id'], 'startup:example')
        self.assertEqual(entity['aliases'], [])
        self.assertEqual(len(result['edges']), 1)
        edge = result['edges'][0]
        for field in ('first_seen', 'last_verified', 'confidence',
                      'confidence_basis', 'stale'):
            self.assertIn(field, edge)
        # Founder edge: source is the startup's own site, so primary;
        # verified via the research file's reviewed date (2026-11-20).
        self.assertEqual(edge['last_verified'], '2026-11-20')
        self.assertEqual(edge['first_seen'], '2026-11-20')
        self.assertEqual(edge['confidence'], 0.6)
        self.assertEqual(edge['confidence_basis'],
                         {'sources': 1, 'source_types': ['primary'],
                          'agreement': False, 'inferred': False})
        self.assertFalse(edge['stale'])

    def test_edge_with_no_known_date_is_stale(self):
        profiles = {'Investor': {'companies': [
            {'name': 'Example', 'source': 'https://example.org/portfolio'}]}}
        result = graph.build_graph(profiles, ['Investor'], {},
                                   {'opportunities': []},
                                   {'startups': []}, today=TODAY)
        edge = result['edges'][0]
        self.assertIsNone(edge['last_verified'])
        self.assertIsNone(edge['first_seen'])
        self.assertTrue(edge['stale'])
        # Secondary source (portfolio page is not the startup's own site).
        self.assertEqual(edge['confidence'], 0.5)


class FundingEdgeTests(unittest.TestCase):
    def test_lead_investor_and_participants_emit_funding_edges(self):
        research = simple_research(funding_rounds=[{
            'id': 'example-series-a', 'stage': 'Series A',
            'announced_on': '2026-01-15',
            'source': 'https://example.com/news/series-a',
            'lead_investor': 'Airtree',
            'participants': ['Blackbird'],
        }])
        result = graph.build_graph({}, ['Airtree', 'Blackbird'], {},
                                   {'opportunities': []}, research, today=TODAY)
        by_kind = {edge['kind']: edge for edge in result['edges']}
        led = by_kind['led_round']
        self.assertEqual(led['from'], 'partner:airtree')
        self.assertEqual(led['to'], 'startup:example')
        self.assertEqual(led['round_id'], 'example-series-a')
        self.assertEqual(led['source'], 'https://example.com/news/series-a')
        self.assertEqual(led['last_verified'], '2026-11-20')
        participated = by_kind['participated_in']
        self.assertEqual(participated['from'], 'partner:blackbird')
        self.assertEqual(participated['to'], 'startup:example')
        self.assertEqual(participated['round_id'], 'example-series-a')
        self.assertEqual(result['warnings'], [])

    def test_missing_funder_skips_with_warning_and_no_exception(self):
        research = simple_research(funding_rounds=[{
            'id': 'example-seed', 'stage': 'Seed',
            'source': 'https://example.com/news/seed',
            'lead_investor': 'No Such Firm',
            'participants': ['Airtree', 'Also Missing'],
        }])
        result = graph.build_graph({}, ['Airtree'], {}, {'opportunities': []},
                                   research, today=TODAY)
        kinds = [edge['kind'] for edge in result['edges']]
        self.assertNotIn('led_round', kinds)
        # The known participant still gets its edge; only the unknown ones skip.
        self.assertIn('participated_in', kinds)
        self.assertEqual(len(result['warnings']), 2)
        self.assertTrue(any('No Such Firm' in warning for warning in result['warnings']))
        self.assertTrue(any('Also Missing' in warning for warning in result['warnings']))
        self.assertEqual(len(result['funding_rounds']), 1)


class IdentityHookTests(unittest.TestCase):
    IDENTITY = {
        'version': 1,
        'entities': {
            'person:jane': {
                'aliases': ['Jane Example'], 'identity_key': '',
                'merged_from': ['person:jane--airtree'],
                'updated_at': '2026-11-23',
            },
        },
        'merges': [{'from': 'person:jane--airtree', 'to': 'person:jane',
                    'basis': 'linkedin-url', 'decided_by': 'review-queue',
                    'decided_at': '2026-11-23'}],
    }

    def test_merged_identity_resolves_to_the_winner(self):
        profiles = {'Airtree': {'people': [
            {'name': 'Jane', 'source': 'https://airtree.vc/team'}]}}
        result = graph.build_graph(profiles, ['Airtree'], {},
                                   {'opportunities': []}, {'startups': []},
                                   identity=self.IDENTITY, today=TODAY)
        ids = {entity['id'] for entity in result['entities']}
        self.assertIn('person:jane', ids)
        self.assertNotIn('person:jane--airtree', ids)
        person = next(entity for entity in result['entities']
                      if entity['id'] == 'person:jane')
        self.assertEqual(person['canonical_id'], 'person:jane')
        self.assertIn('person:jane--airtree', person['aliases'])
        self.assertIn('Jane Example', person['aliases'])
        self.assertEqual(result['edges'][0]['from'], 'person:jane')
        self.assertEqual(result['edges'][0]['to'], 'partner:airtree')

    def test_without_identity_the_scoped_id_is_unchanged(self):
        profiles = {'Airtree': {'people': [
            {'name': 'Jane', 'source': 'https://airtree.vc/team'}]}}
        result = graph.build_graph(profiles, ['Airtree'], {},
                                   {'opportunities': []}, {'startups': []},
                                   today=TODAY)
        ids = {entity['id'] for entity in result['entities']}
        self.assertIn('person:jane--airtree', ids)


class SupersededTests(unittest.TestCase):
    def test_superseded_rounds_and_facts_are_excluded_from_the_live_graph(self):
        research = simple_research(
            profile_facts=[
                {'key': 'headquarters', 'label': 'Headquarters',
                 'value': 'Sydney, Australia', 'source': 'https://example.com/'},
                {'key': 'headquarters', 'label': 'Headquarters',
                 'value': 'Oldtown, Australia', 'source': 'https://example.com/',
                 'superseded_by': 'headquarters', 'superseded_at': '2026-11-20'},
            ],
            funding_rounds=[
                {'id': 'example-seed', 'stage': 'Seed',
                 'source': 'https://example.com/news/seed'},
                {'id': 'example-seed-old', 'stage': 'Seed',
                 'source': 'https://example.com/news/seed-old',
                 'superseded_by': 'example-seed'},
            ])
        result = graph.build_graph({}, [], {}, {'opportunities': []}, research,
                                   today=TODAY)
        self.assertEqual([round_['id'] for round_ in result['funding_rounds']],
                         ['example-seed'])
        entity = next(item for item in result['entities'] if item['id'] == 'startup:example')
        self.assertEqual([fact['value'] for fact in entity['profile_facts']],
                         ['Sydney, Australia'])


class BackfillMappingTests(unittest.TestCase):
    def test_hq_parse(self):
        self.assertEqual(backfill.parse_hq('Sydney, Australia'),
                         ('Sydney', 'Australia'))
        self.assertEqual(backfill.parse_hq('Sydney, Australia (reported in FY2023)'),
                         ('Sydney', 'Australia'))
        self.assertEqual(
            backfill.parse_hq('Q-CTRL announced Sydney, Australia, as the location '
                              'of its global headquarters in June 2023.'),
            ('Sydney', 'Australia'))

    def test_hq_parse_refuses_ambiguous_values(self):
        self.assertIsNone(backfill.parse_hq('Sydney and Melbourne, Australia'))
        self.assertIsNone(backfill.parse_hq('Headquartered in Australia'))
        self.assertIsNone(backfill.parse_hq(''))

    def test_stage_map(self):
        self.assertEqual(backfill.normalise_stage('Seed round'), 'Seed')
        self.assertEqual(backfill.normalise_stage('Series A-2'), 'Series A')
        self.assertEqual(backfill.normalise_stage('Series A+'), 'Series A')
        self.assertEqual(backfill.normalise_stage('Series A+Series B'), 'Unknown')
        self.assertEqual(backfill.normalise_stage('Series D extension'), 'Series D')
        self.assertEqual(backfill.normalise_stage('Pre-seed'), 'Pre-Seed')
        self.assertEqual(backfill.normalise_stage('Grant award (non-equity)'), 'Grant')
        self.assertEqual(backfill.normalise_stage('Series A'), 'Series A')
        self.assertEqual(backfill.normalise_stage('Funding round (stage not stated)'),
                         'Unknown')
        # Series G/H are in the vocabulary (Airwallex raised both).
        self.assertEqual(backfill.normalise_stage('Series G'), 'Series G')
        self.assertEqual(backfill.normalise_stage('Series H'), 'Series H')
        self.assertEqual(backfill.normalise_stage('Seed extension'), 'Seed')
        # Outside the controlled vocabulary: original preserved, normalised Unknown.
        self.assertEqual(backfill.normalise_stage('Series I'), 'Unknown')
        self.assertEqual(backfill.normalise_stage('Pre-Series A'), 'Unknown')
        self.assertEqual(backfill.normalise_stage('Strategic growth financing'),
                         'Unknown')

    def test_deadline_parse(self):
        self.assertEqual(backfill.parse_deadline('Open until 4 February 2027'),
                         '2027-02-04')
        self.assertEqual(backfill.parse_deadline('Applications closed 31 May 2026'),
                         '2026-05-31')
        self.assertEqual(
            backfill.parse_deadline('Open for proposals until 22 December 2026, '
                                    '14:00 Eastern'),
            '2026-12-22')

    def test_deadline_parse_refuses(self):
        # Two streams share one line: the date belongs to one of them.
        self.assertIsNone(backfill.parse_deadline(
            'Stream A year-round; Stream B Round 2 closes 30 November 2026'))
        self.assertIsNone(backfill.parse_deadline('Programme listed; no deadline stated'))
        self.assertIsNone(backfill.parse_deadline('2026 applications closed'))
        self.assertIsNone(backfill.parse_deadline('Closes 31 February 2026'))

    def test_status_map(self):
        self.assertEqual(backfill.map_status('Open until 4 February 2027'), 'Open')
        self.assertEqual(backfill.map_status('Closes 23 November 2026, 12:00 pm Pacific'),
                         'Closing soon')
        self.assertEqual(backfill.map_status('Applications closed'), 'Closed')
        self.assertEqual(backfill.map_status('Pitch / verify'), 'Apply / verify')
        self.assertEqual(backfill.map_status('Apply directly'), 'Apply / verify')
        self.assertEqual(backfill.map_status('Intake to verify'), 'Check intake')
        self.assertEqual(backfill.map_status('Eligibility review'), 'Eligibility review')
        self.assertEqual(backfill.map_status('Partner required'), 'Partner required')
        self.assertEqual(backfill.map_status('Browse programmes'), 'Unknown')

    def test_backfill_writes_fields_and_report(self):
        with tempfile.TemporaryDirectory() as temp:
            research_path = Path(temp) / 'startup-research.json'
            catalogue_path = Path(temp) / 'catalogue.json'
            research_path.write_text(json.dumps({
                'reviewed': '2026-11-20',
                'startups': [{
                    'name': 'Example', 'source': 'https://example.com/',
                    'profile_facts': [{'key': 'headquarters', 'label': 'Headquarters',
                                       'value': 'Sydney, Australia',
                                       'source': 'https://example.com/'}],
                    'funding_rounds': [{'id': 'example-seed', 'stage': 'Seed round',
                                        'source': 'https://example.com/news'}],
                }]}), encoding='utf-8')
            catalogue_path.write_text(json.dumps({'opportunities': [{
                'id': 'opp-1', 'name': 'Opp', 'org': 'Org',
                'status': 'Open until 4 February 2027'}]}), encoding='utf-8')
            report = backfill.backfill(research_path, catalogue_path, dry_run=True)
            self.assertEqual(report['hq']['filled'], ['Example'])
            self.assertEqual(report['stages']['normalised'], 1)
            self.assertEqual(report['opportunities']['deadline_extracted'], ['opp-1'])
            # Dry run writes nothing.
            self.assertNotIn('hq_country', research_path.read_text(encoding='utf-8'))
            backfill.backfill(research_path, catalogue_path, dry_run=False)
            research = json.loads(research_path.read_text(encoding='utf-8'))
            startup = research['startups'][0]
            self.assertEqual(startup['hq_city'], 'Sydney')
            self.assertEqual(startup['hq_country'], 'Australia')
            self.assertEqual(startup['funding_rounds'][0]['stage_normalised'], 'Seed')
            self.assertEqual(startup['funding_rounds'][0]['stage'], 'Seed round')
            catalogue = json.loads(catalogue_path.read_text(encoding='utf-8'))
            opp = catalogue['opportunities'][0]
            # Additive shape: status keeps the original text verbatim; the
            # controlled vocabulary lives in status_controlled.
            self.assertEqual(opp['status'], 'Open until 4 February 2027')
            self.assertEqual(opp['status_controlled'], 'Open')
            self.assertNotIn('status_text', opp)
            self.assertEqual(opp['deadline'], '2027-02-04')

    def test_backfill_is_idempotent_and_syncs_additions(self):
        with tempfile.TemporaryDirectory() as temp:
            research_path = Path(temp) / 'startup-research.json'
            catalogue_path = Path(temp) / 'catalogue.json'
            additions_path = Path(temp) / 'opportunities-added.json'
            research_path.write_text(json.dumps(
                {'startups': [{'name': 'Example', 'source': 'https://example.com/'}]}),
                encoding='utf-8')
            catalogue_path.write_text(json.dumps({'opportunities': [{
                'id': 'opp-1', 'name': 'Opp', 'org': 'Org',
                'status': 'Open until 4 February 2027'}]}), encoding='utf-8')
            additions_path.write_text(json.dumps({
                'schemaVersion': 1, 'entries': [{'entry': {
                    'id': 'opp-1', 'name': 'Opp', 'org': 'Org',
                    'status': 'Open until 4 February 2027'}}]}), encoding='utf-8')
            first = backfill.backfill(research_path, catalogue_path, dry_run=False)
            self.assertEqual(first['opportunities']['additions_synced'], 1)
            # Second run: status still holds the original text, the
            # controlled value and deadline survive, and the additions
            # mirror stays in sync.
            second = backfill.backfill(research_path, catalogue_path, dry_run=False)
            self.assertEqual(second['opportunities']['additions_synced'], 0)
            catalogue = json.loads(catalogue_path.read_text(encoding='utf-8'))
            opp = catalogue['opportunities'][0]
            self.assertEqual(opp['status'], 'Open until 4 February 2027')
            self.assertEqual(opp['status_controlled'], 'Open')
            self.assertEqual(opp['deadline'], '2027-02-04')
            additions = json.loads(additions_path.read_text(encoding='utf-8'))
            self.assertEqual(additions['entries'][0]['entry'], opp)


class ParquetTests(unittest.TestCase):
    FIXTURE_GRAPH = {
        'version': 2,
        'entities': [
            {'id': 'partner:airtree', 'canonical_id': 'partner:airtree',
             'aliases': [], 'kind': 'partner', 'name': 'Airtree'},
            {'id': 'startup:example', 'canonical_id': 'startup:example',
             'aliases': [], 'kind': 'startup', 'name': 'Example'},
        ],
        'edges': [
            {'from': 'partner:airtree', 'to': 'startup:example',
             'kind': 'supports', 'description': 'Listed in portfolio',
             'source': 'https://airtree.vc/portfolio',
             'first_seen': '2026-11-21', 'last_verified': '2026-11-21',
             'confidence': 0.6,
             'confidence_basis': {'sources': 1, 'source_types': ['primary'],
                                  'agreement': False, 'inferred': False},
             'stale': False},
            {'from': 'startup:example', 'to': 'partner:airtree',
             'kind': 'supports', 'description': 'Listed in portfolio',
             'source': 'https://example.com/', 'first_seen': None,
             'last_verified': None, 'confidence': 0.5,
             'confidence_basis': {'sources': 1, 'source_types': ['secondary'],
                                  'agreement': False, 'inferred': False},
             'stale': True},
        ],
        'funding_rounds': [], 'articles': [],
    }

    def test_tables_round_trip_with_expected_columns_and_rows(self):
        tables = edges_parquet.build_tables(self.FIXTURE_GRAPH)
        self.assertEqual(set(tables), {'edges', 'relationships'})
        for table in tables.values():
            self.assertEqual(table.column_names, list(edges_parquet.EDGE_COLUMNS))
            self.assertEqual(table.num_rows, 2)
        with tempfile.TemporaryDirectory() as temp:
            out = Path(temp) / 'graph'
            manifest = edges_parquet.build(out, graph=self.FIXTURE_GRAPH,
                                           source_revision='test-rev')
            for name in ('edges', 'relationships'):
                stored = pq.read_table(out / f'{name}.parquet')
                self.assertEqual(stored.column_names, list(edges_parquet.EDGE_COLUMNS))
                self.assertEqual(stored.num_rows, 2)
                self.assertEqual(stored.column('source').to_pylist(),
                                 ['partner:airtree', 'startup:example'])
                self.assertEqual(stored.column('stale').to_pylist(), [False, True])
                self.assertEqual(stored.column('confidence').to_pylist(), [0.6, 0.5])
            self.assertEqual(manifest['version'], 1)
            self.assertEqual(manifest['source_revision'], 'test-rev')
            self.assertEqual(manifest['tables']['edges']['rows'], 2)
            self.assertEqual(manifest['tables']['edges']['file'], 'edges.parquet')
            self.assertEqual(manifest['tables']['edges']['columns'],
                             list(edges_parquet.EDGE_COLUMNS))


if __name__ == '__main__':
    unittest.main()
