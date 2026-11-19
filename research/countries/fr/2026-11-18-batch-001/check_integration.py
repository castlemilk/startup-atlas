#!/usr/bin/env python3
"""Read-only, in-memory comparison using the repository's actual graph builder.

The packet owns no production implementation. Known graph projection limitations
are reported as integration gates, not repaired or silently accepted here.
"""
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
from urllib.parse import urlsplit

from validate_packet import HERE, domain, read, slug

ROOT = HERE.parents[3]
INPUTS = ['partner-profiles.json','partner-leads.json','partners-reviewed.json',
          'catalogue.json','startup-research.json']


def run():
    spec=importlib.util.spec_from_file_location('atlas_graph',ROOT/'scripts/make-graph.py')
    graph_module=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(graph_module)
    paths=[ROOT/'data'/name for name in INPUTS]
    before={str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}
    inputs=[json.loads(p.read_text()) for p in paths]
    original_graph=graph_module.build_graph(*inputs)
    candidates=read('production-projection.json')['startups']
    candidate_inputs=copy.deepcopy(inputs)
    candidate_inputs[-1]['startups'].extend(candidates)
    proposed_graph=graph_module.build_graph(*candidate_inputs)
    after={str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}
    existing={x['id']:x for x in original_graph['entities']}
    proposed={x['id']:x for x in proposed_graph['entities']}
    errors=[]
    if before!=after:errors.append('Production source files changed')
    changed=[key for key,value in existing.items() if proposed.get(key)!=value]
    if changed:errors.append('Existing graph entities changed: '+', '.join(changed))
    if not all(e in proposed_graph['edges'] for e in original_graph['edges']):
        errors.append('Existing edges were removed or rewritten')
    if not all(e in proposed_graph['funding_rounds'] for e in original_graph['funding_rounds']):
        errors.append('Existing funding events were removed or rewritten')
    organization_matches=[]
    organizations=[x for x in original_graph['entities'] if x['kind'] in ('startup','partner','provider')]
    for c in read('companies.json')['companies']:
        names={slug(c['name']),*(slug(a) for a in c.get('aliases',[]))}
        host=domain(c['website'])
        matches=[]
        for old in organizations:
            reasons=[]
            if slug(old['name']) in names:reasons.append('normalized_name_or_reviewed_alias')
            old_url=old.get('website') or ''
            old_host=(urlsplit(old_url).hostname or '').lower().removeprefix('www.')
            if old_host and old_host==host:reasons.append('domain')
            if reasons:matches.append({'id':old['id'],'kind':old['kind'],'name':old['name'],'reasons':reasons})
        organization_matches.append({'name':c['name'],'matches':matches})
        if matches:errors.append(c['name']+': existing organization identity requires reconciliation')
    founders=[(r['name'],f) for r in candidates for f in r.get('founders',[])]
    person_matches=[{'company':company,'person':f['name'],'existing_id':old['id']}
                    for company,f in founders for old in original_graph['entities']
                    if old['kind']=='person' and slug(f['name'])==slug(old['name'])]
    if person_matches:errors.append('Existing person name candidates require explicit identity reconciliation')
    new_ids={'startup:'+slug(c['name']) for c in candidates}
    zeros=[proposed[i]['name'] for i in sorted(new_ids) if proposed[i].get('founded_year')==0]
    if zeros:errors.append('Missing founded_year became zero: '+', '.join(zeros))
    invented_years=[proposed[i]['name'] for i in sorted(new_ids) if 'founded_year' in proposed[i]]
    if invented_years:errors.append('An omitted founding year was introduced by projection')
    return {
        'validation_passed':not errors,'errors':errors,
        'baseline_revision':read('manifest.json')['base_revision'],
        'source_hashes_before':before,'source_hashes_after':after,
        'production_files_modified':False,'graph_written':False,
        'existing_entities':len(existing),'existing_startups':sum(x['kind']=='startup' for x in existing.values()),
        'organization_identities_compared':len(organizations),'organization_matches':organization_matches,
        'existing_person_name_candidates':person_matches,
        'proposed_in_memory_entities':len(proposed),'proposed_in_memory_startups':sum(x['kind']=='startup' for x in proposed.values()),
        'proposed_in_memory_funding_events':len(proposed_graph['funding_rounds']),
        'existing_entities_changed':changed,'candidate_founder_assertions':len(founders),
        'omitted_founding_years_preserved':len(new_ids)-len(invented_years),
        'resolved_implementation_observations':[
            {'code':'OMITTED_FOUNDING_YEAR_BECAME_ZERO','status':'resolved_by_existing_owner_pr_179',
             'observed_at_initial_revision':'f4bcbf7030d741772bb750deee584efa3ee17749',
             'resolved_at_current_base':'ff4d51cf729d6a654787e9a1db63967b292df8c9',
             'owner_pr':'https://github.com/castlemilk/startup-atlas/pull/179',
             'current_affected_candidate_count':len(zeros),
             'finding':'Initial builder synthesized zero for absent founding years. Fresh main already contains the owner fix; this packet consumes it and asserts omission for all candidate records. No implementation work duplicated.'}
        ],
        'production_ready':False,
        'integration_gates':[
            {'code':'RICH_RELATIONSHIPS_REQUIRE_OWNER_MAPPING','status':'expected_schema_limit',
             'finding':'The current startup-record schema has no structured round-participant binding or mixed-package component model. The evidence ledger is authoritative; no participant edge is projected.',
             'required_owner_action':'Review the rich ledger and resolve investor/fund/person identities within existing owner workflows. Any implementation change belongs in its separately owned lane.'},
            {'code':'SOURCE_AND_RIGHTS_ADMISSION','status':'pending_owner_review',
             'finding':'Research page review and a schema-valid candidate file do not authorize crawler seeds, commercial source reuse, merge or deployment.',
             'required_owner_action':'Respect the registry access/reuse holds and existing approval, allowlist, throttling and release controls.'}
        ]}


if __name__=='__main__':
    result=run()
    print(json.dumps(result,ensure_ascii=False,indent=2))
    raise SystemExit(0 if result['validation_passed'] else 1)
