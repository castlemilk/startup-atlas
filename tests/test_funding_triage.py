"""Real-source funding projection regression; no network or generated file writes."""
import copy
import importlib.util
import json
from pathlib import Path
import unittest
ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('funding_graph', ROOT/'scripts/make-graph.py')
graph = importlib.util.module_from_spec(spec)
spec.loader.exec_module(graph)
class FundingTriageTests(unittest.TestCase):
    def test_only_two_rounds_and_articles_added_without_entity_or_edge_inference(self):
        read = lambda name: json.loads((ROOT/'data'/name).read_text())
        research = read('startup-research.json')
        base = copy.deepcopy(research)
        ids = {'puralink-2025-pre-seed', 'deeligence-2024-funding'}
        for startup in base['startups']:
            if startup['name'] in {'Puralink', 'Deeligence'}:
                startup['funding_rounds'] = [r for r in startup.get('funding_rounds', []) if r['id'] not in ids]
        args = [read(name) for name in ['partner-profiles.json','partner-leads.json','partners-reviewed.json','catalogue.json']]
        before, after = [graph.build_graph(*args, source) for source in [base, research]]
        self.assertEqual(before['entities'], after['entities'])
        self.assertEqual(before['edges'], after['edges'])
        added = [r for r in after['funding_rounds'] if r['id'] in ids]
        self.assertEqual({r['id'] for r in added}, ids)
        self.assertEqual([r for r in after['funding_rounds'] if r['id'] not in ids], before['funding_rounds'])
        self.assertEqual(len(after['articles']), len(before['articles']) + 2)
        for round in added:
            for key in ['amount','currency','valuation','valuation_currency','investors']:
                self.assertNotIn(key, round)
        deeligence = next(r for r in added if r['startup_id']=='startup:deeligence')
        self.assertNotIn('announced_on', deeligence)
        print('Funding graph:', len(after['entities']), 'entities;', len(after['funding_rounds']), 'rounds; unchanged identities and edges')
