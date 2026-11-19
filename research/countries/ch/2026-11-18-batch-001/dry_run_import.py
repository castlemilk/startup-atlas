#!/usr/bin/env python3
"""Build an in-memory prospective graph; never write the production overlay/graph.

This is a compatibility check, not an import command. The current source inputs
must match the pinned baseline. A different main revision requires a fresh review.
"""
import copy
import hashlib
import importlib.util
import json
from collections import Counter
from pathlib import Path

PACKET = Path(__file__).resolve().parent
REPO = PACKET.parents[3]

def file_hash(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def main():
    baseline = json.loads((PACKET / 'baseline.json').read_text())
    records = json.loads((PACKET / 'records.staged.json').read_text())['startups']
    before = {name:file_hash(REPO / name) for name in baseline['inputs']}
    assert before == baseline['inputs'], 'Source inputs changed: repeat deduplication and owner review.'
    spec = importlib.util.spec_from_file_location('atlas_make_graph', REPO / 'scripts/make-graph.py')
    graph_builder = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(graph_builder)
    m = graph_builder
    args = [m.load(name) for name in ['partner-profiles.json','partner-leads.json','partners-reviewed.json','catalogue.json']]
    overlay = m.load('startup-research.json')
    original = m.build_graph(*args, overlay)
    candidate = copy.deepcopy(overlay)
    candidate['startups'] += copy.deepcopy(records)
    graph = m.build_graph(*args, candidate)
    graph_again = m.build_graph(*args, candidate)
    assert graph == graph_again, 'Graph build is not deterministic.'
    original_ids = {e['id']:e for e in original['entities']}
    new_ids = {e['id']:e for e in graph['entities']}
    assert all(new_ids[key] == value for key, value in original_ids.items()), 'Existing entities changed during additive dry run.'
    assert all(edge in graph['edges'] for edge in original['edges'])
    original_rounds = {r['id']:r for r in original['funding_rounds']}
    new_rounds = {r['id']:r for r in graph['funding_rounds']}
    assert all(new_rounds[key] == value for key, value in original_rounds.items())
    expected_ids = {'startup:' + m.slug(r['name']) for r in records}
    assert len(expected_ids) == len(records)
    assert expected_ids.isdisjoint(original_ids)
    assert expected_ids.issubset(new_ids)
    added_rounds = [r for r in graph['funding_rounds'] if r['id'] not in original_rounds]
    assert len(added_rounds) == sum(len(r.get('funding_rounds', [])) for r in records)
    omitted_year = [r['name'] for r in records if 'founded_year' not in r]
    unknown_year = [new_ids['startup:'+m.slug(name)]['name'] for name in omitted_year
                    if new_ids['startup:'+m.slug(name)].get('founded_year') is None]
    assert len(unknown_year) == len(omitted_year), 'Unknown founding years must remain null, never zero.'
    after = {name:file_hash(REPO / name) for name in baseline['inputs']}
    assert before == after, 'Production inputs were mutated.'
    print(json.dumps({'valid':True, 'mode':'in_memory_only', 'production_files_changed':False,
        'base_revision':baseline['base_revision'], 'source_inputs_unchanged':True,
        'deterministic':True, 'existing_entities_and_events_preserved':True,
        'base_counts':dict(Counter(e['kind'] for e in original['entities'])),
        'prospective_counts':dict(Counter(e['kind'] for e in graph['entities'])),
        'new_startups':len(expected_ids), 'new_financing_entries':len(added_rounds),
        'unknown_founding_years':{'value':None,'affected_candidates':unknown_year,
            'meaning':'Missing/conflicting root years remain null after the owner fix in PR #179. Sourced profile facts retain known observations.'},
        'production_investor_edges_added':False,
        'warning':'Compatibility proof only. No records, seeds, deployed graph, MCP or external database were changed.'}, indent=2))

if __name__ == '__main__':
    main()
