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
    assert len([n for n in proposed['entities'] if n['kind'] == 'startup']) == 46 + 28
    assert not any(r.get('relationships') for r in records), 'no unresolved investor edges may be projected'
    missing_year = {r['name'] for r in records if 'founded_year' not in r}
    assert missing_year == {'Josys', 'Interstellar Technologies', 'Astroscale', 'Axelspace', 'Paidy'}
    projected_ids = {'startup:' + slug(r['name']) for r in records}
    zero_year = [n['name'] for n in proposed['entities'] if n['id'] in projected_ids and n.get('founded_year') == 0]
    assert set(zero_year) == missing_year, 'known upstream null sentinel behavior changed; re-evaluate promotion gate'
    for name in names:
        assert before_hashes[name] == hashlib.sha256((ROOT / 'data' / name).read_bytes()).hexdigest()
    result = {
        'result': 'passed_with_documented_production_gate', 'base_revision': packet['base_revision'],
        'baseline_source_graph_sha256': digest(baseline), 'baseline_input_file_sha256': before_hashes,
        'baseline_counts': {'entities': len(baseline['entities']), 'edges':len(baseline['edges']), 'rounds':len(baseline['funding_rounds']), 'startups':46},
        'hypothetical_combined_counts': {'entities': len(proposed['entities']), 'edges': len(proposed['edges']), 'rounds':len(proposed['funding_rounds']), 'startups':74},
        'company_duplicate_matches':0, 'production_writes':0, 'new_investor_edges':0,
        'production_promotion_ready':False,
        'known_gate': {'file':'scripts/make-graph.py','expression':"startup.get('founded_year',0)",
            'affected_staged_names':sorted(missing_year),
            'effect':'Absent year becomes numeric zero in generated graph. Staged records correctly omit unknown/semantically ambiguous founding years.',
            'owner_action':'Preserve missing years in the existing implementation lane before production promotion; do not backfill guessed years and do not expand this country PR into an implementation change.'},
        'warning':'Counts are hypothetical in-memory compatibility checks only; no staged startup was added to production or live graph.'}
    (HERE / 'graph-validation.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(result,ensure_ascii=False))


if __name__ == '__main__':
    main()
