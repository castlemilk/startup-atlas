#!/usr/bin/env python3
"""Read-only prospective checks using the existing #177 planner and graph builder.

Only temporary overlay bytes are written. No network, seed approval, production
file write, #178 synthetic replay, publication or deployment occurs.
"""
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
from unittest.mock import patch

PACKET = Path(__file__).resolve().parent
REPO = PACKET.parents[3]
sys.path.insert(0, str(REPO / 'scripts'))
import plan_company_profiles as planner
import crawl

def load(path):
    return json.loads(Path(path).read_text())

def graph_module():
    spec = importlib.util.spec_from_file_location('atlas_make_graph', REPO / 'scripts/make-graph.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

def main():
    provenance = load(PACKET / 'build-provenance.json')
    revision = provenance.get('refreshed_main_revision', provenance['base_revision'])
    baseline = load(REPO / 'data/startup-research.json')
    staged = load(PACKET / 'atlas-startups.json')
    combined = {**baseline, 'startups': baseline['startups'] + staged['startups']}
    new_names = {r['name'] for r in staged['startups']}
    pages = []
    cursor = None
    with tempfile.TemporaryDirectory(prefix='atlas-ar-plan-') as td:
        overlay = Path(td) / 'prospective-overlay.json'
        overlay.write_text(json.dumps(combined, ensure_ascii=False, indent=2) + '\n')
        seeds = REPO / 'data/company-profile-seeds.csv'
        with patch.object(crawl.Transport, 'request', side_effect=AssertionError('No network authorized')), \
                patch.object(crawl.socket, 'getaddrinfo', side_effect=AssertionError('No DNS required')):
            while True:
                page = planner.build_plan(overlay, seeds, revision, limit=10, cursor=cursor)
                pages.append(page)
                cursor = page['next_cursor']
                if cursor is None:
                    break
            all_rows = [row for page in pages for row in page['items']]
            names = [r['source_record_name'] for r in all_rows]
            assert names == sorted(r['name'] for r in combined['startups'])
            assert len(names) == len(set(names)) == 65
            new_rows = [r for r in all_rows if r['source_record_name'] in new_names]
            assert len(new_rows) == 20
            assert all(r['seed_state'] == 'seed_review_required' for r in new_rows)
            assert all(r['collection_state'] == 'not_assessed' for r in new_rows)
            assert planner.build_plan(overlay, seeds, revision, limit=10) == pages[0]
            first_cursor = pages[0]['next_cursor']
            rejection_checks = []
            for label, rev, size in [('revision drift', '0' * 40, 10), ('page size drift', revision, 5)]:
                try:
                    planner.build_plan(overlay, seeds, rev, limit=size, cursor=first_cursor)
                except ValueError:
                    rejection_checks.append(label)
                else:
                    raise AssertionError(label + ' accepted')
            overlay.write_text(overlay.read_text() + '\n')
            try:
                planner.build_plan(overlay, seeds, revision, limit=10, cursor=first_cursor)
            except ValueError:
                rejection_checks.append('input byte drift')
            else:
                raise AssertionError('input byte drift accepted')

    builder = graph_module()
    args = [load(REPO / 'data' / name) for name in [
        'partner-profiles.json', 'partner-leads.json', 'partners-reviewed.json', 'catalogue.json']]
    baseline_built = builder.build_graph(*args, baseline)
    prospective = builder.build_graph(*args, combined)
    base_startups = {e['id'] for e in baseline_built['entities'] if e['kind'] == 'startup'}
    next_startups = {e['id'] for e in prospective['entities'] if e['kind'] == 'startup'}
    new_ids = {'startup:' + builder.slug(n) for n in new_names}
    assert next_startups - base_startups == new_ids
    assert len(base_startups) == 46 and len(next_startups) == 66
    nodes = {e['id']: e for e in prospective['entities']}
    omitted = []
    for row in staged['startups']:
        node = nodes['startup:' + builder.slug(row['name'])]
        if 'founded_year' not in row:
            assert 'founded_year' not in node, row['name']
            omitted.append(row['name'])
        else:
            assert node['founded_year'] == row['founded_year']
    round_ids = [r['id'] for r in prospective['funding_rounds']]
    assert len(round_ids) == len(set(round_ids))
    packet_rounds = {r['id'] for c in staged['startups'] for r in c['funding_rounds']}
    assert packet_rounds.issubset(set(round_ids))
    assert all(e['from'] in nodes and e['to'] in nodes for e in prospective['edges'])
    result = {
        'passed': True, 'revision_checked': revision,
        'input_scope': 'Temporary combination of 45 baseline overlay rows and 20 staged records; not main production data.',
        'planner': {'implementation': 'scripts/plan_company_profiles.py (#177)',
            'pages': pages, 'page_sizes': [p['returned'] for p in pages],
            'new_rows': len(new_rows), 'new_seed_states': {'seed_review_required': len(new_rows)},
            'collection_state': 'not_assessed', 'changed_cursor_bindings_rejected': rejection_checks},
        'graph': {'implementation': 'scripts/make-graph.py', 'built_baseline_startups': len(base_startups),
            'prospective_startups': len(next_startups), 'new_startup_ids': sorted(new_ids),
            'unknown_founded_year_preserved_by_omission': omitted,
            'new_funding_event_ids': sorted(packet_rounds), 'duplicate_funding_event_ids': False,
            'committed_graph_replaced': False},
        'network_requests': 0, 'production_writes': 0, 'seed_approvals': 0,
        'warning': 'Prospective structural acceptance only. No national completeness, collection completion or live publication is established.'
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))

if __name__ == '__main__':
    main()
