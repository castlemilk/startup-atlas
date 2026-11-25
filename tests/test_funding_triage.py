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
    def test_only_reviewed_rounds_and_distinct_citations_added_with_only_sourced_participant_edges(self):
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
        # The two rounds carry sourced participants (Puralink's own newsroom names
        # Side Stage Ventures and Startmate; Deeligence's Alice Anderson Fund does
        # not resolve to a partner entity). The only new relationships allowed are
        # those rounds' own participated_in edges — nothing else may appear.
        added_edges = [edge for edge in after['edges'] if edge not in before['edges']]
        removed_edges = [edge for edge in before['edges'] if edge not in after['edges']]
        self.assertEqual(removed_edges, [])
        self.assertEqual(
            {(edge['from'], edge['to'], edge['kind'], edge['round_id']) for edge in added_edges},
            {('partner:side-stage-ventures', 'startup:puralink', 'participated_in', 'puralink-2025-pre-seed'),
             ('partner:startmate', 'startup:puralink', 'participated_in', 'puralink-2025-pre-seed')})
        added = [r for r in after['funding_rounds'] if r['id'] in ids]
        self.assertEqual({r['id'] for r in added}, ids)
        self.assertEqual([r for r in after['funding_rounds'] if r['id'] not in ids], before['funding_rounds'])
        before_articles = {(article['startup_id'], article['url']): article for article in before['articles']}
        after_articles = {(article['startup_id'], article['url']): article for article in after['articles']}
        round_sources = {(round['startup_id'], round['source']) for round in added}
        self.assertEqual(len(after_articles), len(after['articles']))
        self.assertEqual(after_articles.keys() - before_articles.keys(), round_sources - before_articles.keys())
        self.assertEqual({key: after_articles[key] for key in before_articles}, before_articles)
        for round in added:
            for key in ['amount','currency','valuation','valuation_currency','investors']:
                self.assertNotIn(key, round)
        deeligence = next(r for r in added if r['startup_id']=='startup:deeligence')
        self.assertNotIn('announced_on', deeligence)
        print('Funding graph:', len(after['entities']), 'entities;', len(after['funding_rounds']), 'rounds; unchanged identities, only the rounds\' own sourced participant edges added')
