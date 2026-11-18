#!/usr/bin/env python3
"""Validate this UAE packet offline against real repository schema and planner.

Run from any directory: python3 path/to/validate_packet.py --write-results
Only --write-results writes a file, validation-results.json beside this script.
Planner fixtures use temporary copies and never authorize or fetch a URL.
"""
from __future__ import annotations

import argparse
from collections import Counter
from copy import deepcopy
from datetime import date, datetime, timezone
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import socket
import subprocess
import sys
import tempfile
from unittest.mock import patch

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
sys.dont_write_bytecode = True
sys.path.insert(0, str(ROOT / 'scripts'))
import plan_company_profiles as planner
import crawl

FILES = ('observations.json', 'source-registry.json', 'claims.json', 'entities.json',
         'ecosystem.json', 'funding-events.json', 'startup-records.json',
         'projection-map.json', 'deduplication.json', 'coverage.json',
         'next-source-queue.json', 'inventory.json')
PROTECTED = ('data/startup-research.json', 'data/company-profile-seeds.csv',
             'data/graph.json', 'scripts/plan_company_profiles.py', 'scripts/crawl.py',
             'backend/hosted/src/startup-record.mjs', 'scripts/catalogue-entries.mjs',
             'scripts/make-graph.py')


class InvalidPacket(ValueError):
    pass


def require(condition, message):
    if not condition:
        raise InvalidPacket(message)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def load_module(path):
    spec = importlib.util.spec_from_file_location('ae_packet_assembler', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


assembler = load_module(HERE / 'build_packet.py')


def unique(rows, key, label):
    values = [row[key] for row in rows]
    require(len(values) == len(set(values)), f'Duplicate {label}')
    return {row[key]: row for row in rows}


def day(value, label):
    require(isinstance(value, str) and re.fullmatch(r'\d{4}-\d{2}-\d{2}', value), f'Invalid exact date: {label}')
    try:
        date.fromisoformat(value)
    except ValueError as error:
        raise InvalidPacket(f'Invalid calendar date: {label}') from error


def instant(value, label):
    try:
        parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
    except (ValueError, TypeError, AttributeError) as error:
        raise InvalidPacket(f'Invalid timestamp: {label}') from error
    require(parsed.tzinfo is not None, f'Timestamp needs a timezone: {label}')
    return parsed


def held_source(source):
    return any(o.get('rights_hold') or o.get('eligible_for_projection') is False
               or o.get('use_status', '').startswith('held')
               for o in source['observations'])


def pointed(record, pointer):
    require(pointer.startswith('/'), 'Projection pointer must be absolute')
    result = record
    try:
        for token in pointer[1:].split('/'):
            token = token.replace('~1', '/').replace('~0', '~')
            result = result[int(token)] if isinstance(result, list) else result[token]
    except (KeyError, IndexError, ValueError, TypeError) as error:
        raise InvalidPacket(f'Projection pointer does not resolve: {pointer}') from error
    return result


def check_provenance(packet):
    sources = unique(packet['source-registry.json']['sources'], 'source_id', 'source IDs')
    unique(list(sources.values()), 'url', 'source URLs')
    claims = unique(packet['claims.json']['claims'], 'claim_id', 'claim IDs')
    entities = unique(packet['entities.json']['entities'], 'entity_id', 'entity IDs')
    ecosystems = unique(packet['ecosystem.json']['entities'], 'entity_id', 'ecosystem IDs')
    subjects = {**entities, **ecosystems}
    require(len(subjects) == len(entities) + len(ecosystems), 'Startup/ecosystem ID collision')
    for source in sources.values():
        require(source['crawler_seed_approved'] is False, 'Research source became a crawler approval')
        require(source['source_id'] == 'ae-source-' + sha(source['url'].encode())[:16], 'Source ID no longer matches its URL')
        require(bool(source['observations']), 'Source lacks an access observation')
        for observation in source['observations']:
            instant(observation['retrieved_at'], 'source retrieval')
            require(isinstance(observation['accessed'], bool), 'Source access must be explicit')
            if observation['status'] in ('blocked', 'unopened', 'failed'):
                require(not observation['accessed'], 'Blocked/unopened source incorrectly marked accessed')
    for claim in claims.values():
        require(claim['source_id'] in sources, 'Claim has an orphan source ID')
        source = sources[claim['source_id']]
        require(claim['source_url'] == source['url'], 'Claim source URL/ID mismatch')
        require(claim['entity_id'] in subjects, 'Claim has an orphan entity ID')
        require(claim['claim_id'] in subjects[claim['entity_id']]['claim_ids'], 'Claim missing from its subject')
        require(bool(claim['evidence'].strip()) and bool(claim['rationale'].strip()), 'Claim lacks evidence or rationale')
        instant(claim['retrieved_at'], 'claim retrieval')
        instant(claim['reviewed_at'], 'claim review')
        require(claim['publication_state'] == 'unsubmitted', 'Research claim became a publication assertion')
        require(any(o['retrieved_at'] == claim['retrieved_at'] and o['accessed'] == claim['accessed']
                    for o in source['observations']), 'Claim access is not backed by source observation')
        if claim['status'] == 'reviewed_staged':
            require(claim['accessed'] and claim['source_kind'] != 'discovery', 'Reviewed claim rests on unread/discovery source')
        value = claim['value']
        if isinstance(value, dict) and 'company_id' in value:
            require(value['company_id'] == claim['entity_id'], 'Nested claim company ID mismatch')
        if claim['projection'] == 'startup-records.json':
            require(claim['entity_id'] in entities and entities[claim['entity_id']]['disposition'] == 'accepted', 'Deferred/rejected claim projected')
            require(claim['status'] in ('reviewed_staged', 'conflict'), 'Unreviewed claim projected')
            require(claim['accessed'] and claim['source_kind'] != 'discovery', 'Projected claim lacks accessed evidence')
            require(not held_source(source) and not claim.get('rights_hold'), 'Rights-held source projected')
    for entity in subjects.values():
        require(entity['publication_state'] == 'unsubmitted', 'Entity publication state changed')
        require(len(entity['claim_ids']) == len(set(entity['claim_ids'])), 'Duplicate entity claim membership')
        for cid in entity['claim_ids']:
            require(cid in claims and claims[cid]['entity_id'] == entity['entity_id'], 'Entity has foreign/orphan claim')
    for entity in entities.values():
        require(entity['canonical_entity_id'] is None and entity['seed_approval'] == 'not_approved', 'Provisional identity/seed silently approved')
        require(entity['domain'] == assembler.domain(entity['official_url']), 'Canonical domain normalization mismatch')
    return sources, claims, entities


def check_projection(packet):
    sources, claims, entities = check_provenance(packet)
    records = unique(packet['startup-records.json']['startups'], 'name', 'projected record names')
    maps = unique(packet['projection-map.json']['records'], 'record_name', 'projection mappings')
    require(set(records) == set(maps), 'Records and provenance mappings differ')
    accepted = {e['name']: e for e in entities.values() if e['disposition'] == 'accepted'}
    require(set(records) == set(accepted), 'Projection is not exactly the accepted candidate set')
    used_claims = set()
    for name, record in records.items():
        mapping = maps[name]
        entity = accepted[name]
        require(mapping['entity_id'] == entity['entity_id'], 'Mapped record belongs to the wrong entity')
        require(mapping['proposed_graph_id'] == entity['proposed_graph_id'], 'Projection graph ID mismatch')
        require(record['website'] == entity['official_url'], 'Projected canonical website drift')
        require(record['description'] == entity['fields']['description'], 'Projected description drift')
        fields = unique(mapping['fields'], 'pointer', 'projection pointers')
        expected = {'/name', '/description', '/website'}
        for collection in ('founders', 'funding_rounds', 'profile_facts', 'articles', 'relationships', 'socials'):
            expected.update(f'/{collection}/{i}' for i in range(len(record.get(collection, []))))
        for scalar in ('founded_year', 'logo', 'logo_source'):
            if scalar in record:
                expected.add('/' + scalar)
        require(set(fields) == expected, 'Projected field missing provenance mapping')
        for pointer, link in fields.items():
            value = pointed(record, pointer)
            require(bool(link['claim_ids']), 'Projection mapping contains no evidence')
            supported = []
            for cid in link['claim_ids']:
                require(cid in claims, 'Projection mapping has orphan claim')
                claim = claims[cid]
                require(claim['entity_id'] == entity['entity_id'], 'Projection mapping cites another company')
                require(claim['projection'] == 'startup-records.json', 'Mapped claim lacks projection disposition')
                require(claim['status'] in ('reviewed_staged', 'conflict'), 'Mapping cites an unreviewed claim')
                if claim['status'] == 'conflict':
                    require(pointer.startswith('/profile_facts/') and 'Unresolved source conflict.' in value['value'], 'Conflict silently converted to canonical data')
                supported.append(claim)
                used_claims.add(cid)
            require(set(link['source_urls']) == {c['source_url'] for c in supported}, 'Projection source list differs from claim sources')
            if pointer == '/name':
                names = [c['value'] if isinstance(c['value'], str) else c['value'].get('canonical_name', c['value'].get('name')) for c in supported if c['field'] == 'identity']
                require(value in names, 'Name lacks a matching identity claim')
            elif pointer == '/description':
                # Editorial paraphrases can differ from the concise observation.
                # Exact record/candidate equality was checked above; factual
                # entailment still depends on the source review, not word overlap.
                require(any(c['field'] == 'description' and isinstance(c['value'], str) and c['value'].strip() for c in supported), 'Description lacks a description claim')
                require(record['source'] in link['source_urls'], 'Record source is not its description evidence')
            elif pointer.startswith('/founders/'):
                require(any(c['field'] == 'founder' and (c['value'].get('name') if isinstance(c['value'], dict) else c['value']) == value['name'] for c in supported), 'Founder lacks a named founder claim')
            if isinstance(value, dict) and 'source' in value:
                require(value['source'] in link['source_urls'], 'Nested projected source lacks mapping')
    require(used_claims == {c['claim_id'] for c in claims.values() if c['projection'] == 'startup-records.json'}, 'Projection disposition is not reversible through map')
    return len(records), len(used_claims)


def check_funding(packet):
    claims = {c['claim_id']: c for c in packet['claims.json']['claims']}
    entities = {e['entity_id']: e for e in packet['entities.json']['entities']}
    funding = packet['funding-events.json']
    events = unique(funding['events'], 'event_id', 'funding event IDs')
    parts = unique(funding['participations'], 'claim_id', 'participation claim IDs')
    require(funding['canonical_edges_created'] == 0, 'Unresolved investor created a canonical edge')
    for event in events.values():
        require(event['company_id'] in entities, 'Funding event has an orphan company')
        require(event['entity_disposition'] == entities[event['company_id']]['disposition'], 'Funding disposition differs from company')
        origin = claims.get(event['claim_id'])
        require(origin is not None and origin['field'] == 'funding_round', 'Funding event lacks a funding-round claim')
        require(origin['entity_id'] == event['company_id'] and origin['value']['event_id'] == event['event_id'], 'Funding event points to another company/event')
        require(event['source_url'] == origin['source_url'], 'Funding event source drift')
        require(event['participants_complete'] is False, 'Partial event participants asserted complete')
        normalized = event.get('normalization_claim_ids', [event['claim_id']])
        require(bool(normalized) and event['claim_id'] in normalized, 'Funding normalization lacks origin evidence')
        evidence = []
        for cid in normalized:
            require(cid in claims and claims[cid]['entity_id'] == event['company_id'], 'Funding normalization has foreign/orphan evidence')
            c = claims[cid]
            require(isinstance(c['value'], dict) and c['value'].get('event_id') == event['event_id'], 'Funding normalization crosses event boundaries')
            evidence.append(c)
        if 'normalization_source_urls' in event:
            require(set(event['normalization_source_urls']) == {c['source_url'] for c in evidence}, 'Funding normalization source list mismatch')
        for amount, currency in (('amount', 'currency'), ('valuation', 'valuation_currency')):
            numeric, code = event.get(amount), event.get(currency)
            if numeric is not None:
                require(type(numeric) is int and numeric > 0 and isinstance(code, str) and re.fullmatch('[A-Z]{3}', code), 'Known funding amount lacks a positive integer/currency pair')
                require(any(c['value'].get(amount) == numeric and c['value'].get(currency) == code for c in evidence), 'Funding amount/currency not supported by event-specific evidence')
            elif code is not None:
                # A source may know the currency of an undisclosed amount. Projection omits both.
                require(isinstance(code, str) and re.fullmatch('[A-Z]{3}', code), 'Invalid currency with undisclosed amount')
        precision = event['date_precision']
        require(precision in ('day', 'month', 'year', 'unknown'), 'Unsupported funding date precision')
        if event.get('announced_on') is not None:
            day(event['announced_on'], 'announcement')
            require(precision == 'day', 'Month/year precision promoted to an announcement day')
        if event.get('closed_on') is not None:
            day(event['closed_on'], 'close')
        value = event.get('date_value')
        if value is not None:
            pattern = {'day': r'\d{4}-\d{2}-\d{2}', 'month': r'\d{4}-(0[1-9]|1[0-2])', 'year': r'\d{4}'}.get(precision)
            require(pattern is not None and re.fullmatch(pattern, value), 'Funding date value and precision disagree')
            if precision == 'day':
                day(value, 'funding date value')
        expected = {p['claim_id'] for p in parts.values() if p['event_id'] == event['event_id']}
        require(set(event['participants']) == expected and len(event['participants']) == len(expected), 'Event participation membership mismatch')
    for part in parts.values():
        require(part['event_id'] in events, 'Orphan participation event')
        event = events[part['event_id']]
        require(part['company_id'] == event['company_id'], 'Participation crosses companies')
        require(part['resolved_entity_id'] is None and part['canonical_edge_created'] is False, 'Unresolved participant promoted to canonical investor')
        require(part['role'] in ('lead', 'participant', 'unspecified'), 'Unsupported normalized participant role')
        claim = claims.get(part['claim_id'])
        require(claim is not None and claim['field'] == 'round_participant', 'Portfolio/general claim used as event participation')
        require(claim['entity_id'] == part['company_id'] and claim['value']['event_id'] == part['event_id'], 'Participation source claim relationship mismatch')
        require(part['source_url'] == claim['source_url'] and part['name'] == claim['value']['name'], 'Participant name/source differs from claim')
    for record in packet['startup-records.json']['startups']:
        company = next(e for e in entities.values() if e['name'] == record['name'])
        for projected in record.get('funding_rounds', []):
            require(projected['id'] in events, 'Projected funding event missing from ledger')
            event = events[projected['id']]
            require(event['company_id'] == company['entity_id'] and event['status'] == 'reviewed_staged', 'Unreviewed/foreign funding event projected')
            require(projected['source'] == event['source_url'], 'Projected funding source drift')
            require(projected.get('announced_on') == event.get('announced_on'), 'Exact announcement date invented or lost')
            for amount, currency in (('amount', 'currency'), ('valuation', 'valuation_currency')):
                if event.get(amount) is None or event.get(currency) is None:
                    require(amount not in projected and currency not in projected, 'Unknown funding number/currency projected')
                else:
                    require(projected.get(amount) == event[amount] and projected.get(currency) == event[currency], 'Projected funding amount/currency drift')
            for pid in event['participants']:
                p = parts[pid]
                if p['status'] == 'reviewed_staged':
                    require(p['name'] in projected.get('note', ''), 'Projected funding note loses a reviewed participant')
    return len(events), len(parts)


def collisions(candidate, previous):
    names = {assembler.normalized_name(n) for n in [candidate['name'], *candidate.get('aliases', [])]}
    target = candidate.get('proposed_graph_id', 'startup:' + assembler.slug(candidate['name']))
    host = candidate.get('domain') or assembler.domain(candidate.get('official_url'))
    return [p for p in previous if assembler.normalized_name(p['name']) in names
            or p.get('id') == target or (host and assembler.domain(p.get('website')) == host)]


def check_dedup(packet, graph, overlay):
    entities = packet['entities.json']['entities']
    decisions = unique(packet['deduplication.json']['decisions'], 'entity_id', 'deduplication decisions')
    require(set(decisions) == {e['entity_id'] for e in entities}, 'Deduplication did not review every candidate')
    require(packet['deduplication.json']['compared_graph_entities'] == len(graph['entities']), 'Graph comparison denominator drift')
    require(packet['deduplication.json']['compared_overlay_records'] == len(overlay['startups']), 'Overlay comparison denominator drift')
    accepted = [e for e in entities if e['disposition'] == 'accepted']
    for entity in entities:
        decision = decisions[entity['entity_id']]
        require(decision['canonical_identity_assigned'] is False, 'Deduplication assigned canonical identity')
        expected = {p['id'] for p in collisions(entity, graph['entities'])}
        require({p['id'] for p in decision['existing_matches']} == expected, 'Deduplication omitted/invented a graph match')
        if entity['disposition'] == 'accepted':
            require(not collisions(entity, graph['entities']) and not collisions(entity, overlay['startups']), 'Accepted candidate collides with existing records')
            other = [{'name': e['name'], 'id': e['proposed_graph_id'], 'website': e['official_url']} for e in accepted if e['entity_id'] != entity['entity_id']]
            require(not collisions(entity, other), 'Accepted candidates collide by name/alias/domain/slug')
    stake = next((e for e in entities if e['domain'] == 'getstake.com'), None)
    require(stake is not None and stake['disposition'] == 'deferred' and stake.get('integration_hold'), 'Stake rights/namespace hold was lost')
    require(all(assembler.domain(r.get('website')) != 'getstake.com' for r in packet['startup-records.json']['startups']), 'Stake entered initial projection')
    return len(accepted)


def check_counts(packet):
    count = packet['coverage.json']['counts']
    entities = packet['entities.json']['entities']
    states = Counter(e['disposition'] for e in entities)
    records = packet['startup-records.json']['startups']
    expected = {
        'discovered_named_candidates': len(entities) + len(packet['coverage.json']['discovery_leads']),
        'reviewed_candidates': len(entities) - states['discovered'],
        'accepted_records': len(records), 'deferred_candidates': states['deferred'],
        'rejected_candidates': states['rejected'],
        'unreviewed_discovery_candidates': states['discovered'] + len(packet['coverage.json']['discovery_leads']),
        'claims': len(packet['claims.json']['claims']),
        'unique_source_urls': len(packet['source-registry.json']['sources']),
        'funding_observations_all_dispositions': len(packet['funding-events.json']['events']),
        'accepted_record_funding_observations': sum(len(r.get('funding_rounds', [])) for r in records),
        'accepted_record_founder_links': sum(len(r.get('founders', [])) for r in records),
        'event_participation_claims_all_dispositions': len(packet['funding-events.json']['participations']),
        'ecosystem_entities': len(packet['ecosystem.json']['entities']),
    }
    for key, value in expected.items():
        require(count[key] == value, f'Coverage count mismatch: {key}')
    for key in ('production_records_written', 'crawler_runs', 'crawler_seeds_approved', 'canonical_investor_edges_created'):
        require(count[key] == 0, 'Research incorrectly reports a write/crawl/approval')
    pagination = packet['coverage.json']['pagination']
    require(pagination['national_denominator'] is None and pagination['source_directories_exhausted'] is False
            and pagination['claims_of_complete_country_coverage'] is False, 'Unsupported completeness assertion')
    queue = packet['next-source-queue.json']
    require(queue['exhausted'] is False and queue['source_pagination_cursor'] is None, 'Manual source queue asserted exhausted')
    unique(queue['queue'], 'queue_id', 'continuation queue IDs')
    require(all(q['crawler_seed_approved'] is False for q in queue['queue']), 'Discovery queue became seed approval')
    return count


def negative_checks(packet):
    outcomes = []

    def rejects(label, mutate, validator, expected):
        fixture = deepcopy(packet)
        mutate(fixture)
        try:
            validator(fixture)
        except InvalidPacket as error:
            require(expected in str(error), f'Negative fixture failed for an unrelated reason: {label}: {error}')
            outcomes.append({'name': label, 'rejected': True, 'reason': str(error)})
        else:
            raise InvalidPacket(f'Invalid fixture was accepted: {label}')

    rejects('orphan source', lambda p: p['claims.json']['claims'][0].update(source_id='missing'), check_provenance, 'orphan source')
    rejects('source URL substitution', lambda p: p['claims.json']['claims'][0].update(source_url='https://wrong.example.com/'), check_provenance, 'URL/ID mismatch')
    rejects('deferred candidate projection', lambda p: p['entities.json']['entities'][0].update(disposition='deferred'), check_projection, 'Deferred/rejected')
    rejects('missing field provenance', lambda p: p['projection-map.json']['records'][0]['fields'].pop(), check_projection, 'missing provenance')
    rejects('changed description', lambda p: p['startup-records.json']['startups'][0].update(description='Unsubstantiated replacement'), check_projection, 'description drift')

    def hold_projected(p):
        source_id = next(c['source_id'] for c in p['claims.json']['claims'] if c['projection'] == 'startup-records.json')
        next(s for s in p['source-registry.json']['sources'] if s['source_id'] == source_id)['observations'][0]['eligible_for_projection'] = False
    rejects('held source projection', hold_projected, check_provenance, 'Rights-held source')

    rejects('cross-company participation', lambda p: p['funding-events.json']['participations'][0].update(company_id='unresolved:ae:other'), check_funding, 'crosses companies')
    rejects('orphan participation event', lambda p: p['funding-events.json']['participations'][0].update(event_id='missing-event'), check_funding, 'membership mismatch')

    def portfolio_as_round(p):
        cid = p['funding-events.json']['participations'][0]['claim_id']
        next(c for c in p['claims.json']['claims'] if c['claim_id'] == cid)['field'] = 'portfolio_membership'
    rejects('portfolio membership as round evidence', portfolio_as_round, check_funding, 'Portfolio/general claim')

    def invent_amount(p):
        e = next(e for e in p['funding-events.json']['events'] if e.get('amount') is None)
        e.update(amount=0, currency='USD')
    rejects('unknown amount changed to zero', invent_amount, check_funding, 'positive integer/currency')

    def invent_date(p):
        e = next(e for e in p['funding-events.json']['events'] if e['date_precision'] == 'month')
        e['announced_on'] = e['date_value'] + '-01'
    rejects('month precision changed to first day', invent_date, check_funding, 'promoted to an announcement day')
    rejects('partial participants declared complete', lambda p: p['funding-events.json']['events'][0].update(participants_complete=True), check_funding, 'asserted complete')
    rejects('canonical investor edge invented', lambda p: p['funding-events.json']['participations'][0].update(canonical_edge_created=True), check_funding, 'canonical investor')
    rejects('source discovery treated as crawl approval', lambda p: p['source-registry.json']['sources'][0].update(crawler_seed_approved=True), check_provenance, 'crawler approval')
    return outcomes


def normalization_checks():
    require(assembler.normalized_name('  ＺＩＩＮＡ\u00a0 ') == 'ziina', 'NFKC name normalization regressed')
    require(assembler.normalized_name('Straße') == assembler.normalized_name('STRASSE'), 'Unicode case folding regressed')
    require(assembler.domain('https://WWW.Example.COM/path?x=1') == 'example.com', 'Domain normalization regressed')
    require(assembler.domain(None) is None, 'Missing domain became a value')
    require(assembler.slug('Éyewa') == 'eyewa', 'ASCII slug normalization regressed')
    val = assembler.normalized_value({'company_id': 'startup:fixture', 'amount': 10, 'currency': None,
                                      'amount_text': '$10; currency unspecified', 'current_role': 'CEO',
                                      'participants': [{'event_id': 'fixture-round', 'company_id': 'startup:fixture', 'role': 'co-lead'}]}, 'unresolved:ae:fixture')
    require(val['amount'] is None and val['amount_text'] == '$10; currency unspecified', 'Unknown currency normalization lost uncertainty')
    require(val['role_as_reported'] == 'CEO' and val['current_role_verified'] is False and 'current_role' not in val, 'Historical role became current employment')
    require(val['participants'][0]['company_id'] == 'unresolved:ae:fixture' and val['participants'][0]['role'] == 'lead'
            and val['participants'][0]['role_as_stated'] == 'co-lead', 'Nested funding normalization regressed')
    require(assembler.normalized_value(None, 'unresolved:ae:fixture') is None, 'Unknown null became a false/zero value')
    require(assembler.normalized_value({'amount': 10, 'currency': 'USD'}, 'unresolved:ae:fixture')['amount'] == 10, 'Known amount lost')
    fixtures = [
        ({'name': 'ＡＣＭＥ', 'official_url': 'https://fresh.example.com'}, {'name': 'Acme', 'website': 'https://old.example.com'}),
        ({'name': 'Fresh', 'aliases': ['ACME']}, {'name': 'Acme'}),
        ({'name': 'Fresh', 'official_url': 'https://www.example.com/a'}, {'name': 'Old', 'website': 'https://EXAMPLE.com/b'}),
        ({'name': 'A B'}, {'name': 'A-B', 'id': 'startup:a-b'}),
    ]
    for candidate, prior in fixtures:
        require(collisions(candidate, [prior]), 'Identity collision fixture escaped review')
    stake = {'name': 'Stake', 'official_url': 'https://getstake.com/'}
    australian = {'name': 'Stake', 'id': 'startup:stake', 'website': 'https://hellostake.com/'}
    require(collisions(stake, [australian]), 'Stake name/slug collision was missed')
    require(assembler.domain(stake['official_url']) != assembler.domain(australian['website']), 'Distinct Stake domains merged')
    return {'normalization_assertions': 11, 'collision_fixtures': 5, 'auto_merges_performed': 0}


def planner_checks(overlay_bytes, seed_bytes, staged, revision):
    with tempfile.TemporaryDirectory(prefix='uae-atlas-validation-') as temp:
        temp = Path(temp)
        overlay_path, seeds_path = temp / 'combined.json', temp / 'approved.csv'
        original = json.loads(overlay_bytes)
        combined = {**original, 'startups': [*original['startups'], *staged]}
        combined_bytes = (json.dumps(combined, ensure_ascii=False, indent=2) + '\n').encode()
        overlay_path.write_bytes(combined_bytes)
        seeds_path.write_bytes(seed_bytes)
        limit = 7
        pages, names = [], []
        with patch.object(crawl.Transport, 'request', side_effect=AssertionError('Network forbidden during offline validation')), \
             patch.object(socket, 'getaddrinfo', side_effect=AssertionError('DNS forbidden during offline validation')), \
             patch.object(socket, 'create_connection', side_effect=AssertionError('Connections forbidden during offline validation')):
            first = planner.build_plan(overlay_path, seeds_path, revision, limit)
            require(first == planner.build_plan(overlay_path, seeds_path, revision, limit), 'Planner deterministic replay changed')
            page = first
            while True:
                pages.append(page)
                names.extend(x['source_record_name'] for x in page['items'])
                if page['next_cursor'] is None:
                    break
                require(not page['inventory_exhausted'], 'Nonterminal planner page marked exhausted')
                resumed = planner.build_plan(overlay_path, seeds_path, revision, limit, page['next_cursor'])
                require(resumed == planner.build_plan(overlay_path, seeds_path, revision, limit, page['next_cursor']), 'Resume cursor replay changed page')
                page = resumed
                require(len(pages) <= len(combined['startups']), 'Planner cursor failed to advance')
            require(names == sorted(r['name'] for r in combined['startups']), 'Planner skipped, duplicated or reordered records')
            require(len(names) == len(set(names)) and page['inventory_exhausted'], 'Planner inventory did not terminate exactly once')
            staged_names = {r['name'] for r in staged}
            staged_items = [i for p in pages for i in p['items'] if i['source_record_name'] in staged_names]
            require(len(staged_items) == len(staged_names), 'Planner did not enumerate every staged record')
            require(all(i['seed_state'] == 'seed_review_required' and i['approved_url'] is None for i in staged_items), 'Staged discovery inherited a crawler approval')
            require(all(i['collection_state'] == 'not_assessed' for p in pages for i in p['items']), 'Planner inventory became factual/crawl verification')
            for dimension in planner.DIMENSIONS:
                expected = sum(r.get(dimension) not in (None, '', [], {}) for r in combined['startups'])
                require(first['field_presence_totals'][dimension] == expected, 'Planner missing/null field presence changed')
            cursor = first['next_cursor']
            require(cursor is not None, 'Fixture population too small to test resume')
            rejects = []

            def reject(label, fn):
                try:
                    fn()
                except (ValueError, crawl.CrawlError) as error:
                    rejects.append({'name': label, 'rejected': True, 'reason': str(error)})
                else:
                    raise InvalidPacket(f'Invalid planner replay accepted: {label}')

            reject('changed revision', lambda: planner.build_plan(overlay_path, seeds_path, ('0' if revision[0] != '0' else '1') + revision[1:], limit, cursor))
            reject('changed page size', lambda: planner.build_plan(overlay_path, seeds_path, revision, limit + 1, cursor))
            reject('changed cursor version', lambda: planner.build_plan(overlay_path, seeds_path, revision, limit, cursor.replace('v1:', 'v2:', 1)))
            reject('malformed cursor', lambda: planner.build_plan(overlay_path, seeds_path, revision, limit, 'bad'))
            reject('non-boundary offset', lambda: planner.build_plan(overlay_path, seeds_path, revision, limit, f'v1:{first["plan_id"]}:1'))
            reject('out-of-range offset', lambda: planner.build_plan(overlay_path, seeds_path, revision, limit, f'v1:{first["plan_id"]}:99999'))
            overlay_path.write_bytes(combined_bytes + b'\n')
            reject('changed overlay bytes', lambda: planner.build_plan(overlay_path, seeds_path, revision, limit, cursor))
            overlay_path.write_bytes(combined_bytes)
            seeds_path.write_bytes(seed_bytes + b'\n')
            reject('changed approved CSV bytes', lambda: planner.build_plan(overlay_path, seeds_path, revision, limit, cursor))
            seeds_path.write_bytes(seed_bytes)
            duplicate = deepcopy(combined)
            duplicate['startups'].append(deepcopy(duplicate['startups'][0]))
            overlay_path.write_text(json.dumps(duplicate))
            reject('duplicate source-record name', lambda: planner.build_plan(overlay_path, seeds_path, revision, limit))
            overlay_path.write_bytes(combined_bytes)
            require(seeds_path.read_bytes() == seed_bytes, 'Planner seed fixture was not restored')
        return {
            'planner': 'scripts/plan_company_profiles.py', 'planner_sha256': sha((ROOT / 'scripts/plan_company_profiles.py').read_bytes()),
            'original_overlay_records': len(original['startups']), 'staged_records': len(staged),
            'combined_population': len(names), 'page_size': limit, 'pages': len(pages),
            'revision': revision, 'plan_id': first['plan_id'],
            'combined_overlay_sha256': sha(combined_bytes), 'approved_csv_sha256': sha(seed_bytes),
            'seed_states': first['population']['seed_states'],
            'staged_seed_state': 'seed_review_required', 'collection_state': 'not_assessed',
            'inventory_exhausted': page['inventory_exhausted'], 'country_source_coverage_complete': False,
            'page_receipts': [{'offset': p['offset'], 'returned': p['returned'], 'names': [i['source_record_name'] for i in p['items']], 'next_cursor': p['next_cursor']} for p in pages],
            'deterministic_page_and_resume_replay': True, 'negative_replay_fixtures': rejects,
            'network_and_dns_tripwires_enabled': True,
        }


def graph_preview(packet, original_overlay, original_graph, committed):
    """Separate committed-snapshot drift from the bounded UAE graph increment."""
    module = load_module(ROOT / 'scripts/make-graph.py')
    input_names = ('partner-profiles.json', 'partner-leads.json',
                   'partners-reviewed.json', 'catalogue.json')
    inputs = {name: committed('data/' + name) for name in input_names}
    snapshot = json.loads(original_graph)
    baseline = module.build_graph(*(json.loads(inputs[name]) for name in input_names), json.loads(original_overlay))
    combined = json.loads(original_overlay)
    combined['startups'].extend(deepcopy(packet['startup-records.json']['startups']))
    preview = module.build_graph(*(json.loads(inputs[name]) for name in input_names), combined)
    nodes = unique(preview['entities'], 'id', 'combined graph entity IDs')
    base_nodes = unique(baseline['entities'], 'id', 'regenerated baseline entity IDs')
    snapshot_nodes = unique(snapshot['entities'], 'id', 'committed snapshot entity IDs')
    base_events = unique(baseline['funding_rounds'], 'id', 'regenerated baseline funding IDs')
    combined_events = unique(preview['funding_rounds'], 'id', 'combined graph funding IDs')
    snapshot_events = unique(snapshot['funding_rounds'], 'id', 'committed snapshot funding IDs')

    def startup_ids(graph):
        return {e['id'] for e in graph['entities'] if e['kind'] == 'startup'}

    def graph_counts(graph):
        return {'entities': len(graph['entities']), 'entity_kinds': dict(sorted(Counter(e['kind'] for e in graph['entities']).items())),
                'startups': len(startup_ids(graph)), 'funding_events': len(graph['funding_rounds']),
                'unique_funding_event_ids': len({e['id'] for e in graph['funding_rounds']})}

    snapshot_startups, baseline_startups = startup_ids(snapshot), startup_ids(baseline)
    baseline_drift = {
        'comparison': 'Fresh baseline regeneration minus committed graph snapshot; none of these differences are attributed to the UAE packet.',
        'committed_snapshot': graph_counts(snapshot), 'freshly_built_baseline': graph_counts(baseline),
        'startup_id_sets_equal': snapshot_startups == baseline_startups,
        'committed_startup_ids': sorted(snapshot_startups), 'fresh_baseline_startup_ids': sorted(baseline_startups),
        'startup_ids_added': sorted(baseline_startups - snapshot_startups),
        'startup_ids_removed': sorted(snapshot_startups - baseline_startups),
        'entity_ids_added': sorted(set(base_nodes) - set(snapshot_nodes)),
        'entity_ids_removed': sorted(set(snapshot_nodes) - set(base_nodes)),
        'shared_entity_ids_with_changed_content': sorted(eid for eid in set(base_nodes) & set(snapshot_nodes) if base_nodes[eid] != snapshot_nodes[eid]),
        'funding_event_ids_added': sorted(set(base_events) - set(snapshot_events)),
        'funding_event_ids_removed': sorted(set(snapshot_events) - set(base_events)),
        'shared_funding_event_ids_with_changed_content': sorted(eid for eid in set(base_events) & set(snapshot_events) if base_events[eid] != snapshot_events[eid]),
    }
    fresh_dedup = []
    for entity in packet['entities.json']['entities']:
        if entity['disposition'] != 'accepted':
            continue
        matches = collisions(entity, baseline['entities'])
        fresh_dedup.append({'entity_id': entity['entity_id'], 'name': entity['name'], 'domain': entity['domain'],
                            'proposed_graph_id': entity['proposed_graph_id'], 'fresh_baseline_matches': [e['id'] for e in matches]})
        require(not matches, 'Accepted staged identity collides with freshly regenerated baseline by name/alias/domain/ID')

    staged = packet['startup-records.json']['startups']
    staged_startups = {'startup:' + module.slug(r['name']) for r in staged}
    staged_events = [e['id'] for r in staged for e in r.get('funding_rounds', [])]
    staged_founders = ['person:' + module.slug(f['name']) for r in staged for f in r.get('founders', [])]
    distinct_founders = set(staged_founders)
    new_founders = distinct_founders - set(base_nodes)
    new_entity_ids = set(nodes) - set(base_nodes)
    new_event_ids = set(combined_events) - set(base_events)
    require(len(staged_startups) == len(staged), 'Staged graph startup IDs are not unique')
    require(len(staged_events) == len(set(staged_events)), 'Staged graph funding IDs are not unique')
    require(staged_startups == startup_ids(preview) - baseline_startups, 'UAE startup increment differs from staged identity set')
    require(new_event_ids == set(staged_events), 'UAE funding increment differs from staged event set')
    require(new_entity_ids == staged_startups | new_founders, 'Combined graph has unexplained entity additions beyond staged startups/founders')
    require(not (set(base_nodes) - set(nodes)), 'Combined graph removed baseline entities')
    require(not (set(base_events) - set(combined_events)), 'Combined graph removed baseline funding events')
    incremental = {
        'comparison': 'Combined graph minus freshly built baseline, using identical committed source inputs.',
        'combined_graph': graph_counts(preview),
        'entities_added': len(new_entity_ids), 'entity_ids_added': sorted(new_entity_ids),
        'startup_entities_added': len(staged_startups), 'startup_ids_added': sorted(staged_startups),
        'funding_events_added': len(new_event_ids), 'unique_funding_event_ids_added': sorted(new_event_ids),
        'founder_references_in_staged_records': len(staged_founders),
        'distinct_proposed_founder_ids': len(distinct_founders), 'unique_proposed_founder_ids': sorted(distinct_founders),
        'founder_entities_added': len(new_founders), 'founder_ids_added': sorted(new_founders),
        'founder_ids_reused_from_baseline': sorted(distinct_founders & set(base_nodes)),
        'baseline_entity_ids_changed_by_uae_append': sorted(eid for eid in set(base_nodes) & set(nodes) if base_nodes[eid] != nodes[eid]),
        'baseline_funding_event_ids_changed_by_uae_append': sorted(eid for eid in set(base_events) & set(combined_events) if base_events[eid] != combined_events[eid]),
        'baseline_entities_removed': 0, 'baseline_funding_events_removed': 0,
        'founder_identity_note': 'These are proposed IDs generated by the existing graph builder, not resolved person identities.',
    }
    affected, checked = [], []
    for record in packet['startup-records.json']['startups']:
        proposed = 'startup:' + module.slug(record['name'])
        require(proposed in nodes and nodes[proposed]['kind'] == 'startup', 'Graph preview lost a staged company')
        node = nodes[proposed]
        require(node['website'] == record['website'] and node['summary'] == record['description'], 'Graph preview changed company identity')
        require(node.get('profile_facts') == record.get('profile_facts', []), 'Graph preview lost sourced profile facts')
        observed_year = node.get('founded_year')
        checked.append({'name': record['name'], 'proposed_graph_id': proposed,
                        'input_scalar_founded_year_present': 'founded_year' in record,
                        'preview_scalar_founded_year': observed_year})
        if 'founded_year' not in record and observed_year == 0:
            affected.append(proposed)
        for event in record.get('funding_rounds', []):
            matches = [e for e in preview['funding_rounds'] if e['id'] == event['id']]
            require(len(matches) == 1 and matches[0]['startup_id'] == proposed, 'Graph preview changed funding relationship')
            require(matches[0]['source'] == event['source'], 'Graph preview changed explicit funding source')
    holds = []
    if affected:
        holds.append({
            'status': 'production_adoption_hold', 'defect': 'Omitted scalar founded_year becomes numeric zero in current graph builder.',
            'affected_staged_records': len(affected), 'proposed_graph_ids': affected,
            'owner_pr': 'https://github.com/castlemilk/startup-atlas/pull/179',
            'action': 'Keep packet staged. Coordinate adoption with the existing owner fix and rerun this preview after its reviewed merge; do not substitute a fabricated scalar year.',
        })
    return {
        'mode': 'in_memory_only', 'builder': 'scripts/make-graph.py',
        'builder_sha256': sha((ROOT / 'scripts/make-graph.py').read_bytes()),
        'baseline_input_sha256': {name: sha(data) for name, data in inputs.items()},
        'baseline_regeneration_drift': baseline_drift,
        'fresh_baseline_identity_deduplication': {'accepted_candidates_checked': len(fresh_dedup),
                                                'identity_matches': sum(bool(d['fresh_baseline_matches']) for d in fresh_dedup),
                                                'decisions': fresh_dedup},
        'uae_incremental_additions': incremental,
        'staged_records_checked': len(checked), 'records': checked,
        'preview_entity_count': len(preview['entities']), 'preview_funding_count': len(preview['funding_rounds']),
        'production_adoption_holds': holds, 'production_files_written': 0,
        'related_owner_fix': {
            'pr': 'https://github.com/castlemilk/startup-atlas/pull/181',
            'scope': 'Legacy funding source inheritance. Owner-reported coordination dependency; this scoped check preserves explicit sources on new staged funding events and does not duplicate or claim to verify the full legacy fix.',
        },
    }


def run():
    before = {name: sha((ROOT / name).read_bytes()) for name in PROTECTED}
    packet_bytes = {name: (HERE / name).read_bytes() for name in FILES}
    packet = {name: json.loads(data) for name, data in packet_bytes.items()}
    revision = packet['claims.json']['run']['base_revision']
    require(re.fullmatch('[0-9a-f]{40}', revision), 'Exact base revision required')

    def committed(path):
        return subprocess.run(['git', 'show', f'{revision}:{path}'], cwd=ROOT, capture_output=True, check=True).stdout

    original_overlay = committed('data/startup-research.json')
    original_seeds = committed('data/company-profile-seeds.csv')
    original_graph = committed('data/graph.json')
    require(original_seeds == (ROOT / 'data/company-profile-seeds.csv').read_bytes(), 'Approved seed CSV changed from reviewed baseline')
    require(original_overlay == (ROOT / 'data/startup-research.json').read_bytes(), 'Production overlay differs from reviewed baseline')
    require(original_graph == (ROOT / 'data/graph.json').read_bytes(), 'Production graph differs from reviewed baseline')
    schema = subprocess.run(['node', str(HERE / 'validate_packet.mjs')], cwd=ROOT, capture_output=True, text=True, check=True)
    schema_result = json.loads(schema.stdout)
    records, projected_claims = check_projection(packet)
    events, participations = check_funding(packet)
    check_dedup(packet, json.loads(original_graph), json.loads(original_overlay))
    counts = check_counts(packet)
    fixtures = negative_checks(packet)
    normalization = normalization_checks()
    planner_result = planner_checks(original_overlay, original_seeds, packet['startup-records.json']['startups'], revision)
    graph_result = graph_preview(packet, original_overlay, original_graph, committed)
    require(before == {name: sha((ROOT / name).read_bytes()) for name in PROTECTED}, 'Protected repository files changed during validation')
    require(all(data == (HERE / name).read_bytes() for name, data in packet_bytes.items()), 'Packet changed during validation; rerun against one stable snapshot')
    return {
        'status': 'passed', 'checked_at': datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z'),
        'command': 'python3 research/countries/ae/2026-11-18-batch-001/validate_packet.py --write-results',
        'base_revision': revision, 'scope': 'Offline UAE batch staging validation; no publication, crawler run, permission change or seed approval.',
        'counts': counts, 'schema': schema_result,
        'cross_file_checks': {'records': records, 'mapped_claims': projected_claims, 'funding_events': events, 'participation_claims': participations,
                              'source_provenance': 'passed', 'held_source_exclusion': 'passed', 'missing_and_null_values': 'passed',
                              'event_specific_investor_relationships': 'passed', 'base_and_within_batch_deduplication': 'passed',
                              'coverage_counts_and_incomplete_denominator': 'passed'},
        'normalization': normalization, 'negative_packet_fixtures': fixtures, 'planner': planner_result,
        'graph_preview': graph_result,
        'packet_input_sha256': {name: sha(data) for name, data in packet_bytes.items()},
        'protected_files_sha256': before,
        'validator_files_sha256': {name: sha((HERE / name).read_bytes()) for name in ('validate_packet.py', 'validate_packet.mjs')},
        'limitations': [
            'Offline checks verify representation, source references and relationships; they do not independently re-read webpages or resolve factual conflicts.',
            'Description paraphrases are checked against approved candidate fields and mapped description-source claims; semantic entailment is not mechanically established.',
            'All accepted records remain staged. Founder and investor canonical identities are unresolved; profile notes do not create canonical investor edges.',
            'The unchanged existing approved CSV is reused only for inventory tests. All staged records require seed review.',
            'Exhausted planner inventory covers only the supplied original overlay plus this bounded batch, not a national startup population or source-directory pagination.',
            'The caller-supplied revision is checked against committed baseline file bytes here; the existing planner alone does not establish Git ancestry.',
            'Production adoption remains subject to the independently reproduced graph founded-year hold owned in PR #179 and coordination with the legacy funding-source owner in PR #181; neither implementation is changed here.',
        ],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--write-results', action='store_true', help='Save actual run results beside this script.')
    args = parser.parse_args()
    try:
        result = run()
    except (OSError, ValueError, KeyError, TypeError, AssertionError, subprocess.CalledProcessError) as error:
        result = {'status': 'failed', 'checked_at': datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z'),
                  'error': str(error), 'scope': 'Actual offline validation attempt; no success asserted.'}
        if isinstance(error, subprocess.CalledProcessError):
            result['subprocess_stderr'] = error.stderr.decode() if isinstance(error.stderr, bytes) else error.stderr
    if args.write_results:
        (HERE / 'validation-results.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(result if result['status'] != 'passed' else {
        'status': result['status'], 'records': result['schema']['records_validated'],
        'schema_negative_fixtures': result['schema']['negative_fixture_count'],
        'packet_negative_fixtures': len(result['negative_packet_fixtures']),
        'planner_rejection_fixtures': len(result['planner']['negative_replay_fixtures']),
        'planner_population': result['planner']['combined_population'], 'planner_pages': result['planner']['pages'],
        'results_file': str(HERE / 'validation-results.json') if args.write_results else None,
    }, indent=2))
    return 0 if result['status'] == 'passed' else 1


if __name__ == '__main__':
    raise SystemExit(main())
