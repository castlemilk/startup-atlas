#!/usr/bin/env python3
"""Build a graph preview in memory using the actual merge and graph functions."""
import importlib.util
import json
import subprocess
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[4]
spec = importlib.util.spec_from_file_location('atlas_uk_graph_preview', REPO / 'scripts/make-graph.py')
graph = importlib.util.module_from_spec(spec)
spec.loader.exec_module(graph)

def load(path): return json.loads((REPO / path).read_text())

class GraphPreviewTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        code = '''import fs from 'node:fs';
import {mergeStartup,validateStartupRecord} from './backend/hosted/src/startup-record.mjs';
const p='research/countries/GBR/2026-11-18/batch-01/';
const read=x=>JSON.parse(fs.readFileSync(x,'utf8'));
const baseline=read('data/startup-research.json');
const rows=new Map(baseline.startups.map(x=>[x.name,x]));
for(const patch of read(p+'existing-record-enrichment.json').startups){
  const merged=mergeStartup(rows.get(patch.name),patch);validateStartupRecord(merged);rows.set(patch.name,merged);
}
for(const row of read(p+'records.json').startups){
  if(rows.has(row.name))throw Error('Unexpected duplicate '+row.name);
  validateStartupRecord(row);rows.set(row.name,row);
}
process.stdout.write(JSON.stringify({...baseline,startups:[...rows.values()]}));'''
        research = json.loads(subprocess.check_output(['node', '--input-type=module', '-e', code], cwd=REPO, text=True))
        cls.baseline = graph.build_graph(load('data/partner-profiles.json'), load('data/partner-leads.json'), load('data/partners-reviewed.json'), load('data/catalogue.json'), load('data/startup-research.json'))
        cls.preview = graph.build_graph(load('data/partner-profiles.json'), load('data/partner-leads.json'), load('data/partners-reviewed.json'), load('data/catalogue.json'), research)

    def test_preview_adds_exactly_25_startups_and_excludes_five_context_holds(self):
        ids = {e['id'] for e in self.preview['entities'] if e['kind'] == 'startup'}
        self.assertEqual(len(ids), 71)
        self.assertTrue({'startup:revolut', 'startup:synthesia'}.issubset(ids))
        for name in ('GoCardless', 'ElevenLabs', 'Oxford Ionics', 'Phion Therapeutics', 'Ultraleap'):
            self.assertNotIn('startup:' + graph.slug(name), ids)

    def test_missing_years_and_ambiguous_currency_stay_absent_after_graph_projection(self):
        by_id = {e['id']: e for e in self.preview['entities']}
        for name in ('Chemify', 'Paragraf', 'Luminance'):
            self.assertNotIn('founded_year', by_id['startup:' + graph.slug(name)])
        rounds = {e['id']: e for e in self.preview['funding_rounds']}
        self.assertNotIn('amount', rounds['quantum-motion-series-c-second-close-2026'])
        self.assertNotIn('currency', rounds['polyai-2025-series-d'])
        self.assertEqual(rounds['pragmatic-semiconductor-series-d-first-close-2023']['amount'], 162000000)

    def test_no_dangling_edges_duplicate_rounds_or_inferred_investor_relationships(self):
        ids = {e['id'] for e in self.preview['entities']}
        for edge in self.preview['edges']:
            self.assertIn(edge['from'], ids); self.assertIn(edge['to'], ids)
        rounds = self.preview['funding_rounds']
        # Compare against the same current source build, not an older committed graph artifact.
        self.assertEqual(len(self.baseline['funding_rounds']), 25)
        self.assertEqual(len(rounds), 54)
        self.assertEqual(len({r['id'] for r in rounds}), 54)
        old_edges = {(e['from'], e['to'], e['kind'], e['source']) for e in self.baseline['edges']}
        added = [e for e in self.preview['edges'] if (e['from'], e['to'], e['kind'], e['source']) not in old_edges]
        self.assertTrue(all(e['kind'] == 'founded' for e in added))

if __name__ == '__main__': unittest.main(verbosity=2)
