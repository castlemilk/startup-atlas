"""Draper modelling decision (Ben, 24 Nov 2026) + partner relationships.

Covers the partner ``relationships`` field added to
``data/partners-reviewed.json`` (docs/KG-CONNECTIVE-TISSUE.md §3):

- fixture-level: a reviewed partner record's relationships emit
  ``member_of_network`` edges in the graph builder; an unknown or self
  target fails the build;
- real-data: the three Draper organisations are three distinct partner
  entities (Draper Associates repaired from the bare "Draper" lead,
  Draper Startup House, Draper B1), none of them merged, all linked to
  ``partner:draper-venture-network`` by a member_of_network edge, and
  the three crawl-44 merge proposals are recorded as rejected.
"""
import importlib.util
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, ROOT / path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


graph = load('atlas_graph_draper', 'scripts/make-graph.py')
er = load('atlas_er_draper', 'scripts/entity_resolution.py')

TODAY = '2026-11-24'
DVN = 'partner:draper-venture-network'
DRAPERS = ('partner:draper-associates', 'partner:draper-startup-house',
           'partner:draper-b1')


def data(name):
    return json.loads((ROOT / 'data' / name).read_text(encoding='utf-8'))


class PartnerRelationshipFixtureTests(unittest.TestCase):
    def build(self, reviewed):
        leads = ['Example Fund', 'Example Network']
        return graph.build_graph({}, leads, reviewed,
                                 {'opportunities': []},
                                 {'reviewed': '2026-11-20', 'startups': []},
                                 today=TODAY)

    def test_member_of_network_edge_emitted(self):
        reviewed = {
            'Example Network': {
                'website': 'https://network.example.com/',
                'description': 'An example network.',
                'source': 'https://network.example.com/',
                'reviewed_at': '2026-11-24'},
            'Example Fund': {
                'website': 'https://fund.example.com/',
                'description': 'An example fund.',
                'source': 'https://fund.example.com/',
                'reviewed_at': '2026-11-24',
                'relationships': [{
                    'type': 'member_of_network',
                    'target': 'partner:example-network',
                    'note': 'Member of the Example Network since 2020.',
                    'source': 'https://network.example.com/members'}]},
        }
        result = self.build(reviewed)
        edges = [e for e in result['edges']
                 if e['kind'] == 'member_of_network']
        self.assertEqual(len(edges), 1)
        edge = edges[0]
        self.assertEqual(edge['from'], 'partner:example-fund')
        self.assertEqual(edge['to'], 'partner:example-network')
        self.assertEqual(edge['description'],
                         'Member of the Example Network since 2020.')
        self.assertEqual(edge['source'],
                         'https://network.example.com/members')
        self.assertEqual(edge['last_verified'], '2026-11-24')
        self.assertFalse(edge['stale'])

    def test_unknown_target_fails_the_build(self):
        reviewed = {'Example Fund': {
            'website': 'https://fund.example.com/',
            'description': 'An example fund.',
            'source': 'https://fund.example.com/',
            'reviewed_at': '2026-11-24',
            'relationships': [{
                'type': 'member_of_network',
                'target': 'partner:no-such-network',
                'note': 'Member of a network that is not a node.',
                'source': 'https://fund.example.com/'}]}}
        with self.assertRaises(ValueError):
            graph.build_graph({}, ['Example Fund'], reviewed,
                              {'opportunities': []},
                              {'reviewed': '2026-11-20', 'startups': []},
                              today=TODAY)

    def test_self_target_fails_the_build(self):
        reviewed = {'Example Fund': {
            'website': 'https://fund.example.com/',
            'description': 'An example fund.',
            'source': 'https://fund.example.com/',
            'reviewed_at': '2026-11-24',
            'relationships': [{
                'type': 'member_of_network',
                'target': 'partner:example-fund',
                'note': 'A partner cannot be its own network.',
                'source': 'https://fund.example.com/'}]}}
        with self.assertRaises(ValueError):
            graph.build_graph({}, ['Example Fund'], reviewed,
                              {'opportunities': []},
                              {'reviewed': '2026-11-20', 'startups': []},
                              today=TODAY)


class DraperRealDataTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.leads = data('partner-leads.json')
        cls.reviewed = data('partners-reviewed.json')
        cls.registry = er.build_registry()
        cls.graph = graph.build_graph(
            data('partner-profiles.json'), cls.leads, cls.reviewed,
            data('catalogue.json'), data('startup-research.json'),
            identity=data('identity.json'), today=TODAY)

    def test_three_distinct_entities_no_merges(self):
        entities = self.registry['entities']
        self.assertNotIn('partner:draper', entities)
        for entity_id in DRAPERS + (DVN,):
            self.assertIn(entity_id, entities)
            self.assertNotIn('merged_into', entities[entity_id])
        self.assertFalse(
            [m for m in self.registry['merges'] if 'draper' in m['from']
             or 'draper' in m['to']])

    def test_identity_keys_and_aliases(self):
        entities = self.registry['entities']
        associates = entities['partner:draper-associates']
        self.assertEqual(associates['identity_key'], 'draper.vc')
        self.assertEqual(associates['identity_basis'], 'website-host')
        self.assertEqual(associates['aliases'], ['Draper', 'Draper VC'])
        self.assertEqual(
            entities['partner:draper-startup-house']['identity_key'],
            'draperstartuphouse.com')
        self.assertEqual(entities['partner:draper-b1']['identity_key'],
                         'draperb1.vc')
        self.assertEqual(entities[DVN]['identity_key'], 'drapernetwork.com')

    def test_graph_nodes_and_network_edges(self):
        nodes = {n['id']: n for n in self.graph['entities']}
        self.assertNotIn('partner:draper', nodes)
        for entity_id in DRAPERS + (DVN,):
            self.assertIn(entity_id, nodes)
        self.assertEqual(nodes['partner:draper-associates']['aliases'],
                         ['Draper', 'Draper VC'])
        edges = [e for e in self.graph['edges']
                 if e['kind'] == 'member_of_network']
        self.assertEqual({(e['from'], e['to']) for e in edges},
                         {(entity_id, DVN) for entity_id in DRAPERS})
        for edge in edges:
            self.assertTrue(edge['source'].startswith('https://'))
            self.assertEqual(edge['last_verified'], '2026-11-24')

    def test_queue_proposals_rejected(self):
        queue = data('review-queue.json')
        entries = {e['id']: e for e in queue['entries']}
        for entry_id in ('merge:partner:draper-startup-house',
                         'merge:partner:draper-vc',
                         'merge:partner:draperb1'):
            entry = entries[entry_id]
            self.assertEqual(entry['status'], 'rejected')
            self.assertTrue(entry['decided_by'])
            self.assertTrue(entry['decided_at'])
            self.assertIn('member_of_network', entry['decision_note'])

    def test_reviewed_records_relationships_point_at_the_network(self):
        for name in ('Draper Associates', 'Draper Startup House',
                     'Draper B1'):
            relations = self.reviewed[name]['relationships']
            self.assertEqual(len(relations), 1)
            self.assertEqual(relations[0]['type'], 'member_of_network')
            self.assertEqual(relations[0]['target'], DVN)
            self.assertIn('Draper Venture Network', self.leads)


if __name__ == '__main__':
    unittest.main()
