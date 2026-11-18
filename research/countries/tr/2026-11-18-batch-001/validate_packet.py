#!/usr/bin/env python3
"""Offline checks for this reviewed Türkiye packet, not a new Atlas collector.

The existing company-profile planner owns source inventory and cursor semantics.
This checker only binds a saved research checkpoint to its exact saved files and
checks evidence references, nulls, relationships and proposed identity collisions.
It has no network, approval, production-write or publication path.
"""
from __future__ import annotations
import argparse
from collections import Counter
from datetime import date, datetime
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import subprocess
import unicodedata
from urllib.parse import urlsplit

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
STATES = {'reviewed_staged', 'unsearched', 'searched_unknown', 'conflict', 'blocked', 'not_applicable', 'candidate', 'rejected'}
PRECISION = {'day', 'month', 'year', 'unknown'}
FUNDING_PROJECTION_KINDS = {'equity', 'unspecified'}
EVENT_FIELDS = {'funding_round', 'financial_transaction', 'ownership_transaction', 'corporate_event'}
STAGE_FIELDS = EVENT_FIELDS | {'funding_round_stage', 'funding_stage'}
AMOUNT_FIELDS = EVENT_FIELDS | {'funding_round_amount', 'funding_amount'}
ANNOUNCEMENT_FIELDS = EVENT_FIELDS | {'funding_round_announcement_date', 'funding_announcement', 'transaction_announcement_date'}


def read(path):
    def unique(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError(f'Duplicate JSON key: {key}')
            result[key] = value
        return result
    return json.loads(Path(path).read_text(encoding='utf-8'), object_pairs_hook=unique)


def digest(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def name_key(name):
    # Candidate matching only. Never creates an identity merge.
    text = unicodedata.normalize('NFKD', name).casefold().replace('ı', 'i')
    text = ''.join(c for c in text if not unicodedata.combining(c))
    return re.sub(r'[^a-z0-9]+', ' ', text).strip()


def domain_key(url):
    parts = urlsplit(url)
    if parts.scheme != 'https' or not parts.hostname or parts.username or parts.password or parts.port not in (None, 443):
        raise ValueError(f'Not a public-style credential-free HTTPS URL: {url}')
    host = parts.hostname.rstrip('.').encode('idna').decode('ascii').lower()
    return host[4:] if host.startswith('www.') else host


def atlas_slug(name):
    # This mirrors the observed identifier for comparison, not a schema change.
    text = unicodedata.normalize('NFKD', name).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', '-', text).strip('-')


def date_with_precision(value, precision):
    if precision not in PRECISION:
        raise ValueError(f'Unknown date precision: {precision}')
    if precision == 'unknown':
        if value is not None:
            raise ValueError('An unknown date must remain null')
        return
    pattern = {'year': r'\d{4}', 'month': r'\d{4}-\d{2}', 'day': r'\d{4}-\d{2}-\d{2}'}[precision]
    if not isinstance(value, str) or not re.fullmatch(pattern, value):
        raise ValueError('Date value does not match its precision')
    date.fromisoformat(value + {'year': '-01-01', 'month': '-01', 'day': ''}[precision])


def require(condition, message):
    if not condition:
        raise ValueError(message)


def timestamp(value):
    require(isinstance(value, str), 'Timestamp is required')
    parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
    require(parsed.utcoffset() is not None, 'Timestamp must include timezone')
    return parsed


def identities_match(left, right):
    reasons = []
    if left.get('website') and right.get('website') and domain_key(left['website']) == domain_key(right['website']):
        reasons.append('same_official_host')
    a = {name_key(x) for x in [left['name'], *left.get('aliases', [])]}
    b = {name_key(x) for x in [right['name'], *right.get('aliases', [])]}
    if a & b:
        reasons.append('same_normalized_name_or_alias')
    if atlas_slug(left['name']) == atlas_slug(right['name']):
        reasons.append('same_legacy_slug')
    return reasons


def entity_id_set(values, label):
    require(isinstance(values, (list, tuple, set, frozenset)), f'{label} must be an identity collection')
    require(all(isinstance(value, str) and value.strip() for value in values), f'{label} has an empty or invalid identity')
    require(len(values) == len(set(values)), f'{label} repeats an identity')
    return set(values)


def check_checkpoint(checkpoint, bound_files, accepted_entity_ids=None, context_entity_ids=()):
    require(checkpoint['population_denominator'] is None, 'National startup denominator is unknown')
    require(checkpoint['collection_complete'] is False, 'A bounded packet is not collection completion')
    require(checkpoint['production_published'] == 0, 'Staging is not publication')
    require(checkpoint['crawler_seed_approvals'] == 0, 'Research is not seed approval')
    for name, raw in bound_files.items():
        require(checkpoint['input_sha256'].get(name) == hashlib.sha256(raw).hexdigest(), f'Stale checkpoint binding: {name}')
    accepted = entity_id_set(checkpoint.get('accepted_entity_ids'), 'Checkpoint accepted identities')
    held = entity_id_set(checkpoint.get('held_entity_ids'), 'Checkpoint held identities')
    completed = entity_id_set(checkpoint['reviewed_entity_ids'], 'Checkpoint reviewed identities')
    pending = entity_id_set(checkpoint['pending_entity_ids'], 'Checkpoint pending identities')
    context = entity_id_set(context_entity_ids, 'Context identities')
    if accepted_entity_ids is not None:
        expected = entity_id_set(accepted_entity_ids, 'Accepted inventory identities')
        require(accepted == expected, 'Checkpoint accepted identities differ from the company inventory')
    require(not accepted & held, 'An identity cannot be both accepted and held')
    require(held <= context, 'Held reviewed identities must be declared context entities')
    require(completed == accepted | held, 'Reviewed identities must equal accepted plus explicitly held identities')
    require(not completed & pending, 'A checkpoint identity cannot be both reviewed and pending')


def registered_sources(value, by_source, label):
    source_ids = value.get('source_ids')
    require(isinstance(source_ids, list) and bool(source_ids), f'{label} needs source IDs')
    require(all(isinstance(sid, str) and sid in by_source for sid in source_ids), f'{label} source is not registered')
    return source_ids


def reviewed_event_claims(company_id, event, claims, source_url=None):
    return [claim for claim in claims
            if claim['entity_id'] == company_id and claim.get('status') == 'reviewed_staged'
            and isinstance(claim.get('value'), dict)
            and claim['value'].get('event_id') == event['id']
            and claim['value'].get('company_id', company_id) == company_id
            and claim['source_id'] in event['source_ids']
            and (source_url is None or claim['source_url'] == source_url)]


def supports_stage(claim, stage):
    value = claim['value']
    return (claim['field'] in STAGE_FIELDS and value.get('stage') == stage
            and value.get('stage_source_id', claim['source_id']) == claim['source_id'])


def supports_amount(claim, amount, currency):
    value = claim['value']
    # Investor contributions and facility commitments are deliberately excluded.
    return claim['field'] in AMOUNT_FIELDS and value.get('amount') == amount and value.get('currency') == currency


def supports_announcement(claim, value, precision):
    if claim['field'] not in ANNOUNCEMENT_FIELDS or claim['value'].get('announced_on') != value:
        return False
    reported_precision = claim['value'].get('announced_precision', claim['value'].get('precision'))
    # A complete ISO value establishes its lexical precision when the older
    # claim shape has no precision key; this never pads a partial date.
    if reported_precision is None:
        reported_precision = {4: 'year', 7: 'month', 10: 'day'}.get(len(value)) if isinstance(value, str) else 'unknown'
    return reported_precision == precision


def supports_amount_text(claim, value):
    return claim['field'] in AMOUNT_FIELDS | ANNOUNCEMENT_FIELDS and value in (
        claim['value'].get('amount_text'), claim['value'].get('raw_amount_text'))


def supports_closed_date(claim, value, precision):
    if claim['field'] not in EVENT_FIELDS or claim['value'].get('closed_on') != value:
        return False
    reported_precision = claim['value'].get('closed_precision')
    if reported_precision is None:
        reported_precision = {4: 'year', 7: 'month', 10: 'day'}.get(len(value)) if isinstance(value, str) else 'unknown'
    return reported_precision == precision


def validate_data(companies, sources, claims, records, checkpoint=None, bound_files=None, context_entity_ids=()):
    require(0 < len(companies) <= 50, 'Expected a nonempty, bounded company batch')
    by_source = {s['source_id']: s for s in sources}
    require(len(by_source) == len(sources), 'Duplicate source ID')
    by_company = {c['entity_id']: c for c in companies}
    require(len(by_company) == len(companies), 'Duplicate staging company ID')
    context_ids = entity_id_set(context_entity_ids, 'Context identities')
    known_entity_ids = set(by_company) | context_ids
    ids = [c.get('claim_id', c.get('id')) for c in claims]
    require(all(ids) and len(ids) == len(set(ids)), 'Claim IDs must be present and unique')
    for source in sources:
        domain_key(source['url'])
        if source.get('retrieved_at') is not None:
            timestamp(source['retrieved_at'])
        else:
            require(source['access_status'] not in {'accessed', 'partial'}, 'Accepted source observation needs its retrieval timestamp')
            require(isinstance(source.get('retrieval_date'), str), 'An unavailable exact timestamp needs the retained retrieval date')
            date.fromisoformat(source['retrieval_date'])
        require(source.get('crawler_seed_approved', False) is False, 'Source discovery cannot approve a crawler seed')
    for claim in claims:
        require(claim.get('entity_id') in known_entity_ids, 'Claim references an undeclared entity')
        require(claim['status'] in STATES, 'Claim has invalid staging status')
        if claim['status'] not in {'reviewed_staged', 'conflict', 'candidate'}:
            require(bool(claim.get('rationale')), 'Disposition needs a rationale')
            continue
        source = by_source.get(claim.get('source_id'))
        require(source is not None, 'Claim references an unknown source')
        require(claim['source_url'] == source['url'], 'Claim/source URL mismatch')
        require(claim.get('source_kind') == source.get('source_kind') and bool(source.get('source_kind')), 'Claim/source kind mismatch')
        require(claim.get('value') is not None, 'Unknown is a disposition, not a null asserted fact')
        require(bool(claim.get('evidence')), 'Claim lacks a supporting paraphrase')
        retrieved_at = timestamp(claim['retrieved_at'])
        if claim['status'] == 'reviewed_staged':
            require(claim.get('accessed') is True, 'A snippet cannot become a reviewed claim')
            require(source['access_status'] in {'accessed', 'partial'}, 'Reviewed claim references an unavailable source')
            require(claim['source_kind'] != 'discovery', 'Discovery alone is not accepted evidence')
            require(timestamp(claim['reviewed_at']) >= retrieved_at, 'Accepted review cannot precede its source retrieval')
            require(claim.get('publication_state', 'unsubmitted') == 'unsubmitted', 'Country evidence is not a production proposal')
    event_ids = set()
    for company in companies:
        domain_key(company['website'])
        require(company['entity_id'].startswith('staged:tr:'), 'New identities must be explicitly staged')
        require(bool(company['description']) and bool(company['name']), 'Company identity/description missing')
        for dimension in ['headquarters', 'incorporation', 'founded', 'founders', 'funding_events']:
            require(dimension in company, f'Missing explicit company dimension: {dimension}')
            if company[dimension] in (None, []):
                disposition = company['field_dispositions'].get(dimension)
                require(isinstance(disposition, dict) and bool(disposition.get('reason')), f'Unknown {dimension} needs an explicit disposition')
                require(disposition.get('status') in STATES - {'reviewed_staged'}, 'An empty dimension is not fully verified')
        if company['founded'] is not None:
            f = company['founded']
            date_with_precision(str(f['value']), f['precision'])
            registered_sources(f, by_source, 'Founding')
        for dimension in ['headquarters', 'incorporation']:
            if company[dimension] is not None:
                require(isinstance(company[dimension], dict), f'{dimension} must be a sourced object or null')
                registered_sources(company[dimension], by_source, dimension)
        for founder in company['founders']:
            require(isinstance(founder, dict), 'Founder must be a sourced object')
            registered_sources(founder, by_source, 'Founder')
        for event in company['funding_events']:
            require(event['id'] not in event_ids, 'Funding event IDs must be globally unique')
            event_ids.add(event['id'])
            date_with_precision(event.get('announced_on'), event.get('announced_precision', 'unknown'))
            closed_precision = event.get('closed_precision')
            if event.get('closed_on') is None:
                require(closed_precision in (None, 'unknown'), 'A missing closing date cannot have known precision')
            else:
                date_with_precision(event['closed_on'], closed_precision)
            if event.get('amount') is not None:
                require(isinstance(event['amount'], (int, float)) and not isinstance(event['amount'], bool) and event['amount'] > 0, 'Unknown funding must not become zero or negative')
                require(bool(event.get('currency')) and re.fullmatch(r'[A-Z]{3}', event['currency']), 'Numeric amount needs explicit currency')
                require(event.get('amount_qualifier') not in {'undisclosed', 'unknown'}, 'Undisclosed amount must remain null')
            registered_sources(event, by_source, 'Funding event')
            evidence = reviewed_event_claims(company['entity_id'], event, claims)
            require(any(c['field'] in EVENT_FIELDS and c['value'].get('transaction_kind') == event['transaction_kind'] for c in evidence),
                    'Event needs reviewed event-specific evidence for its transaction kind')
            if event.get('stage') is not None and str(event['stage']).strip().casefold() != 'unspecified':
                require(any(supports_stage(c, event['stage']) for c in evidence), 'Event stage has no matching reviewed claim')
            if event.get('announced_on') is not None:
                require(any(supports_announcement(c, event['announced_on'], event['announced_precision']) for c in evidence),
                        'Event announcement date/precision has no matching reviewed claim')
            if event.get('closed_on') is not None:
                require(any(supports_closed_date(c, event['closed_on'], closed_precision) for c in evidence),
                        'Event closing date/precision has no matching reviewed claim')
            if event.get('amount') is not None:
                require(any(supports_amount(c, event['amount'], event['currency']) for c in evidence),
                        'Event amount/currency has no matching reviewed claim')
            for participant in event.get('participants', []):
                registered_sources(participant, by_source, 'Participant')
                require(participant.get('role') in {'lead', 'participant', 'unspecified'}, 'Participant role must be stated or explicitly unknown')
                participant_field = 'round_participant' if event['transaction_kind'] == 'equity' else 'transaction_participant'
                matches = [c for c in claims if c['entity_id'] == company['entity_id'] and c['field'] in ({participant_field} if participant_field == 'round_participant' else {'transaction_participant','round_participant'})
                           and c.get('status') == 'reviewed_staged' and isinstance(c.get('value'), dict)
                           and c['value'].get('event_id') == event['id'] and c['value'].get('name') == participant['name']]
                require(matches, 'Portfolio membership cannot substitute for event-specific participant evidence')
                require(any(c['source_id'] in participant['source_ids'] and c['value'].get('role') == participant['role'] for c in matches),
                        'Participant role or source differs from event-specific evidence')
    require(len(records) == len(companies), 'Every accepted company needs one existing-schema projection')
    for record in records:
        company = next((c for c in companies if c['name'] == record['name']), None)
        require(company is not None, 'Projection has no accepted company')
        require(record['website'] == company['website'], 'Projected website differs from reviewed canonical website')
        for event in record.get('funding_rounds', []):
            origin = next((e for e in company['funding_events'] if e['id'] == event['id']), None)
            require(origin is not None, 'Projected round has no staged funding event')
            require(origin['transaction_kind'] in FUNDING_PROJECTION_KINDS,
                    'Only equity or sourced rounds with unspecified instrument enter funding projections')
            require(isinstance(event.get('stage'), str) and bool(event['stage'].strip()) and event['stage'].strip().casefold() != 'unspecified',
                    'A projected round needs a sourced, specified stage')
            require(event['stage'] == origin.get('stage'), 'Projection changes the funding stage')
            require(isinstance(event.get('source'), str) and bool(event['source']), 'Projected round needs its selected source URL')
            evidence = reviewed_event_claims(company['entity_id'], origin, claims, event.get('source'))
            require(any(c['field'] == 'funding_round' and c['value'].get('transaction_kind') == origin['transaction_kind']
                        for c in reviewed_event_claims(company['entity_id'], origin, claims)),
                    'A projected funding round must have reviewed financing-round evidence')
            require(any(supports_stage(c, event['stage']) for c in evidence), 'Projected source does not directly support stage')
            if 'announced_on' in event:
                require(origin['announced_precision'] == 'day' and event['announced_on'] == origin['announced_on'], 'Projection pads a partial date')
                require(any(supports_announcement(c, event['announced_on'], 'day') for c in evidence),
                        'Projected source does not directly support announcement date')
            if 'amount' in event:
                require(event['amount'] == origin['amount'] and event['currency'] == origin['currency'], 'Projection changes funding amount or currency')
                require(any(supports_amount(c, event['amount'], event['currency']) for c in evidence),
                        'Projected source does not directly support amount and currency')
            if 'amount_text' in event:
                require(any(supports_amount_text(c, event['amount_text']) for c in evidence),
                        'Projected source does not directly support raw amount text')
            if 'valuation' in event:
                require(event['valuation'] == origin.get('valuation') and event.get('valuation_currency') == origin.get('valuation_currency'),
                        'Projection changes or invents valuation')
                require(any(c['field'] in EVENT_FIELDS | {'funding_round_valuation', 'funding_valuation'}
                            and c['value'].get('valuation') == event['valuation']
                            and c['value'].get('valuation_currency') == event.get('valuation_currency') for c in evidence),
                        'Projected source does not directly support valuation and currency')
    if checkpoint is not None:
        check_checkpoint(checkpoint, bound_files, set(by_company), context_ids)
    return {'valid': True, 'companies': len(companies), 'sources': len(sources), 'claims': len(claims),
            'staged_events': len(event_ids), 'source_states': dict(Counter(s['access_status'] for s in sources)),
            'claim_states': dict(Counter(c['status'] for c in claims)), 'production_write': False}


def load_packet(path=HERE):
    coverage = read(path/'coverage.json')
    return {'companies': read(path/'companies.json')['companies'], 'sources': read(path/'sources.json')['sources'],
            'claims': read(path/'claims.json')['claims'], 'records': read(path/'startup-records.json')['startups'],
            'checkpoint': coverage['checkpoint'], 'context_entity_ids': coverage.get('context_entity_ids', []),
            'bound_files': {n: (path/n).read_bytes() for n in ['companies.json','claims.json','sources.json','next-source-queue.json']}}


def check_imported_code(path, pinned_bytes):
    require(Path(path).read_bytes() == pinned_bytes, 'Imported graph builder differs from the pinned baseline')


def graph_semantic_blockers(records, graph):
    nodes = {node['id']: node for node in graph['entities'] if node['kind'] == 'startup'}
    blockers = []
    for record in records:
        entity_id = 'startup:' + atlas_slug(record['name'])
        node = nodes.get(entity_id)
        if node is not None and node.get('founded_year') == 0:
            blockers.append({'entity_id': entity_id, 'field': 'founded_year',
                             'record_value': record.get('founded_year'), 'graph_value': 0,
                             'reason': 'Existing graph builder represents a missing founding year as zero.',
                             'owner_dependency': 'https://github.com/castlemilk/startup-atlas/pull/179',
                             'owner_gate': 'Graph owner must preserve unknown founding values before production import.'})
    return blockers


def check_baseline_and_graph():
    baseline = read(HERE/'baseline.json')
    pinned_files = {}
    for item in baseline['files']:
        content = subprocess.check_output(['git', 'show', baseline['revision'] + ':' + item['path']], cwd=ROOT)
        require(hashlib.sha256(content).hexdigest() == item['sha256'], 'Pinned source differs from baseline receipt')
        pinned_files[item['path']] = content
    require('scripts/make-graph.py' in pinned_files, 'Graph builder must be included in the pinned baseline')
    check_imported_code(ROOT/'scripts/make-graph.py', pinned_files['scripts/make-graph.py'])
    spec = importlib.util.spec_from_file_location('atlas_country_graph_check', ROOT/'scripts/make-graph.py')
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    inputs = [json.loads(subprocess.check_output(['git','show',baseline['revision']+':data/'+x], cwd=ROOT))
              for x in ['partner-profiles.json','partner-leads.json','partners-reviewed.json','catalogue.json','startup-research.json']]
    graph = module.build_graph(*inputs)
    staged = read(HERE/'companies.json')['companies']
    existing = [e for e in graph['entities'] if e['kind'] == 'startup']
    matches = []
    for company in staged:
        for other in existing:
            reasons = identities_match(company, other)
            if reasons: matches.append({'staged':company['entity_id'], 'existing':other['id'], 'reasons':reasons})
    require(not matches, 'Potential existing-record identity match needs manual resolution: ' + str(matches))
    for i, left in enumerate(staged):
        for right in staged[i+1:]:
            require(not identities_match(left,right), 'Potential within-batch duplicate needs manual resolution')
    proposed_records = read(HERE/'startup-records.json')['startups']
    inputs[-1]['startups'].extend(proposed_records)
    preview = module.build_graph(*inputs)
    require(len([e for e in preview['entities'] if e['kind']=='startup']) == len(existing) + len(staged), 'Combined graph startup count does not reconcile')
    blockers = graph_semantic_blockers(proposed_records, preview)
    preview_nodes = {node['id']: node for node in preview['entities'] if node['kind']=='startup'}
    missing_years = [r for r in proposed_records if 'founded_year' not in r]
    known_years = [r for r in proposed_records if 'founded_year' in r]
    founding_check = {
        'omitted_records':len(missing_years),
        'omitted_years_remain_absent':all('founded_year' not in preview_nodes['startup:'+atlas_slug(r['name'])] for r in missing_years),
        'known_years_unchanged':all(r['founded_year']==preview_nodes['startup:'+atlas_slug(r['name'])].get('founded_year') for r in known_years),
    }
    return {'base_startups':len(existing), 'base_entities':len(graph['entities']), 'base_rounds':len(graph['funding_rounds']),
            'potential_duplicates':matches, 'preview_startups':len(existing)+len(staged),
            'preview_entities':len(preview['entities']), 'preview_rounds':len(preview['funding_rounds']),
            'schema_compatibility': True, 'downstream_semantic_blockers': blockers, 'founding_projection':founding_check, 'production_import_ready': False,
            'written':False, 'note':'In-memory source/graph compatibility and observed founding-value checks only. Owner review, fresh target revisions and publication verification remain separate; production inputs unchanged.'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--skip-git', action='store_true', help='Only for inspecting a transferable packet without its base repository')
    args = parser.parse_args()
    result = validate_data(**load_packet())
    if not args.skip_git: result['graph_check'] = check_baseline_and_graph()
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == '__main__': main()
