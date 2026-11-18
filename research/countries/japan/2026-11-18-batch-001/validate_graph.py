"""Check staged projections against the current source graph without writing production."""
import hashlib
import importlib.util
import json
from collections import Counter
from pathlib import Path
from packet_tools import HERE, ROOT, digest, normalized_host, normalized_name, slug


def load(path):
    return json.loads(path.read_text())


def main():
    packet = load(HERE / 'companies.json')
    dedup = load(HERE / 'deduplication.json')
    assert dedup['base_revision'] == packet['base_revision'], 'dedup receipt and packet base revision differ'
    spec = importlib.util.spec_from_file_location('atlas_graph', ROOT / 'scripts/make-graph.py')
    graph_module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(graph_module)
    names = ['partner-profiles.json', 'partner-leads.json', 'partners-reviewed.json', 'catalogue.json', 'startup-research.json']
    data = [load(ROOT / 'data' / name) for name in names]
    before_hashes = {name: hashlib.sha256((ROOT / 'data' / name).read_bytes()).hexdigest() for name in names}
    baseline = graph_module.build_graph(*data)
    baseline['source_revision'] = packet['base_revision']
    assert digest(baseline) == dedup['baseline_inventory']['graph_hash'], 'source-derived baseline changed; re-deduplicate against current main'
    assert digest(data[-1]) == dedup['baseline_inventory']['overlay_hash']
    assert Counter(n['kind'] for n in baseline['entities']) == Counter(dedup['baseline_inventory']['entity_counts'])
    records = load(HERE / 'records.json')['startups'] + load(HERE / 'alumni-records.json')['startups']
    existing_startups = [n for n in baseline['entities'] if n['kind'] == 'startup']
    for company in packet['companies']:
        check = next(x for x in dedup['candidate_matches'] if x['candidate_id'] == company['id'])
        assert not check['existing_matches']
        normalized_aliases = {normalized_name(x) for x in [company['name'], *company['aliases']]}
        for old in existing_startups:
            assert normalized_name(old['name']) not in normalized_aliases
            assert slug(old['name']) != slug(company['name'])
            if old.get('website') and old['website'].startswith('https://'):
                assert normalized_host(old['website']) not in check['checked_domains']
    merged = {**data[-1], 'startups': data[-1]['startups'] + records}
    proposed = graph_module.build_graph(*data[:-1], merged)
    node_ids = {n['id'] for n in proposed['entities']}
    assert len(node_ids) == len(proposed['entities'])
    assert all(e['from'] in node_ids and e['to'] in node_ids for e in proposed['edges'])
    assert len({e['id'] for e in proposed['funding_rounds']}) == len(proposed['funding_rounds'])
    proposed_startups = [n for n in proposed['entities'] if n['kind'] == 'startup']
    assert len(proposed_startups) == len(existing_startups) + len(records)
    assert not any(r.get('relationships') for r in records), 'no unresolved investor edges may be projected'
    missing_year = {r['name'] for r in records if 'founded_year' not in r}
    assert missing_year == {'Josys', 'Interstellar Technologies', 'Astroscale', 'Axelspace', 'Paidy'}
    projected_ids = {'startup:' + slug(r['name']) for r in records}
    projected_nodes = {n['name']: n for n in proposed_startups if n['id'] in projected_ids}
    for name in missing_year:
        assert 'founded_year' not in projected_nodes[name], f'{name}: absent founding year must stay absent in the graph'
    assert {name for name, node in projected_nodes.items() if 'founded_year' not in node} == missing_year
    for name in names:
        assert before_hashes[name] == hashlib.sha256((ROOT / 'data' / name).read_bytes()).hexdigest()
    result = {
        'result': 'passed', 'base_revision': packet['base_revision'],
        'baseline_source_graph_sha256': digest(baseline), 'baseline_input_file_sha256': before_hashes,
        'baseline_counts': {'entities': len(baseline['entities']), 'edges':len(baseline['edges']), 'rounds':len(baseline['funding_rounds']), 'startups':len(existing_startups)},
        'hypothetical_combined_counts': {'entities': len(proposed['entities']), 'edges': len(proposed['edges']), 'rounds':len(proposed['funding_rounds']), 'startups':len(proposed_startups)},
        'company_duplicate_matches':0, 'production_writes':0, 'new_investor_edges':0,
        'production_promotion_ready':False,
        'graph_year_gate': {'status':'resolved_by_upstream_pr179', 'file':'scripts/make-graph.py',
            'upstream_commit':'ff4d51cf729d6a654787e9a1db63967b292df8c9',
            'upstream_pull_request_url':'https://github.com/castlemilk/startup-atlas/pull/179',
            'upstream_commit_url':'https://github.com/castlemilk/startup-atlas/commit/ff4d51cf729d6a654787e9a1db63967b292df8c9',
            'verified_at_base_revision':packet['base_revision'],
            'affected_staged_names':sorted(missing_year),
            'observation':'All five omitted founding-year fields remain absent in the source-built proposed graph.'},
        'production_promotion_gate': {'status':'owner_research_review_required',
            'owner_action':'Research remains staged. Existing collection and release owners must review eligibility, unresolved identity and funding qualifications before production promotion.'},
        'warning':'Counts are hypothetical in-memory compatibility checks only; no staged startup was added to production or live graph.'}
    (HERE / 'graph-validation.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(result,ensure_ascii=False))


if __name__ == '__main__':
    main()
