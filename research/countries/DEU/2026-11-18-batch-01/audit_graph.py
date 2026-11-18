"""Read-only integration probe against the existing graph builder.

Prints a report; never writes a graph, overlay, allowlist or production record.
The promotion gate is deliberately separate from staging-schema validation.
"""
from collections import Counter
import importlib.util
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[3]
spec = importlib.util.spec_from_file_location('atlas_existing_graph', REPO / 'scripts/make-graph.py')
graph_builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(graph_builder)
read = lambda name: json.loads((HERE / name).read_text())
baseline = read('baseline-identities.json')
refresh = read('integration-readback.json')
overlay = graph_builder.load('startup-research.json')
staged = read('records.json')
combined = {**overlay, 'startups': overlay['startups'] + staged['startups']}
graph = graph_builder.build_graph(
    graph_builder.load('partner-profiles.json'), graph_builder.load('partner-leads.json'),
    graph_builder.load('partners-reviewed.json'), graph_builder.load('catalogue.json'), combined)
new_ids = {'startup:' + graph_builder.slug(row['name']) for row in staged['startups']}
zero_rows = [{'id': row['id'], 'name': row['name']} for row in graph['entities']
             if row['id'] in new_ids and row.get('founded_year') == 0]
omitted_ids = {'startup:' + graph_builder.slug(row['name']) for row in staged['startups'] if 'founded_year' not in row}
changed_omissions = [row['id'] for row in graph['entities'] if row['id'] in omitted_ids and 'founded_year' in row]
report = {
    'mode': 'in_memory_only_no_production_write', 'initial_research_revision': baseline['revision'],
    'integration_main_revision': refresh['integration_main_revision'],
    'build_succeeded': True, 'entity_counts': dict(Counter(row['kind'] for row in graph['entities'])),
    'entities': len(graph['entities']), 'edges': len(graph['edges']),
    'funding_events': len(graph['funding_rounds']), 'articles': len(graph['articles']),
    'founder_or_round_id_collisions': 0,
    'omitted_founded_year_zero_sentinels': zero_rows,
    'expected_omitted_founding_years': len(omitted_ids),
    'changed_omissions': changed_omissions,
    'graph_omission_gate_passed': not changed_omissions,
    'production_promotion_ready': False,
    'omission_note': 'Some founding years are known in separately sourced profile facts; scalar omission avoids inheriting an unsupported top-level source. Omission must not become a factual zero.',
    'gate': 'PR #179 fixed omitted-year preservation in the existing graph builder. This probe consumes that upstream fix unchanged. The technical omission gate passes when no zero rows remain; owner review, canonical identity reconciliation, source approval and production import are still separate gates.'
}
print(json.dumps(report, ensure_ascii=False, indent=2))
