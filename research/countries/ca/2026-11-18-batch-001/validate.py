#!/usr/bin/env python3
"""Validate this Canada staging packet offline; never publish or alter source data.

Run from the repository root: python3 research/countries/ca/2026-11-18-batch-001/validate.py
The repository's real JS schema, graph builder and company planner are reused.
This checks structural/provenance consistency, not the truth or completeness of
external source claims. Final checksum generation remains a separate step.
"""
from __future__ import annotations

import collections
import datetime as dt
import hashlib
import json
import re
import subprocess
import sys
import tempfile
import types
import unicodedata
from pathlib import Path
from urllib.parse import urlsplit

sys.dont_write_bytecode = True
PACKET = Path(__file__).resolve().parent
ROOT = PACKET.parents[3]
PIN = 'f4bcbf7030d741772bb750deee584efa3ee17749'
TARGET_PIN = '988a4ddcc4dbbc853da0c7f7899b6d6e7579f840'
EXPECTED_OVERLAY = 45
EXPECTED_GRAPH_STARTUPS = 46
EXPECTED_COMBINED = 66
FILES = ('startup-records.json', 'company-evidence.json', 'claims.json',
         'source-registry.json', 'coverage.json', 'next-source-queue.json',
         'baseline-review.json', 'manifest.json')
GRAPH_INPUTS = ('data/partner-profiles.json', 'data/partner-leads.json',
                'data/partners-reviewed.json', 'data/catalogue.json',
                'data/startup-research.json')
SEEDS = 'data/company-profile-seeds.csv'
PROTECTED = (*GRAPH_INPUTS, SEEDS, 'data/graph.json',
             'backend/internal/graph/snapshot.json', 'scripts/make-graph.py',
             'scripts/plan_company_profiles.py', 'scripts/crawl.py',
             'scripts/catalogue-entries.mjs', 'backend/hosted/src/startup-record.mjs',
             'backend/hosted/src/github.mjs')


def require(condition, message):
    if not condition:
        raise ValueError(message)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def read_json(path):
    data = path.read_bytes()
    require(len(data) <= 16 * 1024 * 1024, f'Unbounded input: {path.name}')
    return json.loads(data)


def git_bytes(path, revision=PIN):
    result = subprocess.run(['git', 'show', f'{revision}:{path}'], cwd=ROOT,
                            check=True, capture_output=True, timeout=30)
    return result.stdout


def name_key(value):
    require(isinstance(value, str) and value.strip(), 'Name must be nonempty text')
    return ' '.join(unicodedata.normalize('NFKC', value).casefold().split())


def slug(value):
    text = unicodedata.normalize('NFKD', value).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', '-', text).strip('-')


def domain(value):
    parts = urlsplit(value)
    require(parts.scheme == 'https' and parts.hostname, f'Invalid HTTPS website: {value}')
    require(parts.username is None and parts.password is None and parts.port in (None, 443),
            f'Credentials or nonstandard port in website: {value}')
    host = parts.hostname.encode('idna').decode().lower().rstrip('.')
    return host.removeprefix('www.')


def aliases(record):
    values = [record['name']]
    for item in record.get('aliases', []):
        values.append(item.get('value', item.get('name')) if isinstance(item, dict) else item)
    return [v for v in values if isinstance(v, str) and v.strip()]


def walk(value, path=''):
    if isinstance(value, dict):
        for key, item in value.items():
            yield path + '.' + key, key, item
            yield from walk(item, path + '.' + key)
    elif isinstance(value, list):
        for index, item in enumerate(value):
            yield path + f'[{index}]', str(index), item
            yield from walk(item, path + f'[{index}]')


def utc_timestamp(value):
    require(isinstance(value, str), 'Retrieval timestamp missing')
    parsed = dt.datetime.fromisoformat(value.replace('Z', '+00:00'))
    require(parsed.tzinfo is not None and parsed.utcoffset() == dt.timedelta(0),
            f'Timestamp must be timezone-aware UTC: {value}')


def normalize_role(value):
    return {'co_lead': 'lead', 'co-lead': 'lead', 'unknown': 'unspecified',
            'lender': 'participant'}.get(value, value)


def load_revision_module(name, relative, revision):
    # Execute the reviewed Git blob in a non-main module. The working builder
    # may legitimately include owner fixes absent from the research baseline.
    module = types.ModuleType(name)
    module.__file__ = str(ROOT / relative)
    exec(compile(git_bytes(relative, revision), module.__file__, 'exec'), module.__dict__)
    return module


def check_sources(data):
    sources = data['source-registry.json']['sources']
    require(isinstance(sources, list) and sources, 'Empty source registry')
    urls, ids = {}, set()
    observations = 0
    for source in sources:
        url, sid = source['url'], source['source_id']
        require(url not in urls and sid not in ids, f'Duplicate source URL or ID: {url}')
        require(url.startswith('https://'), f'Non-HTTPS source: {url}')
        require(source['access_status'] in ('accessed', 'partial', 'blocked'),
                f'Unknown source access state: {url}')
        obs = source.get('observations')
        require(isinstance(obs, list) and obs, f'Source observations missing: {url}')
        for item in obs:
            utc_timestamp(item['retrieved_at'])
            if item.get('url') is not None:
                require(item['url'] == url, f'Observation bound to a different source: {url}')
        observations += len(obs)
        urls[url] = source
        ids.add(sid)
    for file in ('company-evidence.json', 'claims.json'):
        for path, key, value in walk(data[file]):
            if key.endswith('source_url') and value is not None:
                require(isinstance(value, str) and value in urls,
                        f'Unregistered source binding: {file}{path}: {value}')
    for record in data['startup-records.json']['startups']:
        for path, key, value in walk(record):
            if key in ('source', 'photo_source', 'logo_source'):
                require(value in urls and urls[value]['access_status'] == 'accessed',
                        f'Legacy record uses unaccessed/unregistered source: {record["name"]}{path}')
    claim_ids = set()
    for claim in data['claims.json']['claims']:
        require(claim.get('claim_id') and claim['claim_id'] not in claim_ids, 'Missing or duplicate claim ID')
        claim_ids.add(claim['claim_id'])
        if not claim.get('source_url'):
            require(claim.get('status') in ('unsearched', 'not_applicable') and
                    claim.get('rationale') and 'value' not in claim,
                    f'Factual claim lacks provenance: {claim.get("claim_id", claim.get("field"))}')
            continue
        source = urls[claim['source_url']]
        utc_timestamp(claim['retrieved_at'])
        if claim.get('status') in ('reviewed_staged', 'published_verified'):
            require(claim.get('accessed') is True and source['access_status'] == 'accessed',
                    f'Accepted claim uses incomplete source: {claim.get("claim_id", claim.get("field"))}')
    access_states = dict(collections.Counter(s['access_status'] for s in sources))
    expected_counts = {'unique_urls': len(sources), 'observations': observations, **access_states}
    require(data['source-registry.json'].get('counts') == expected_counts, 'Source-registry counts do not reconcile')
    return {'sources': len(sources), 'observations': observations,
            'unique_claim_ids': len(claim_ids), 'access_states': access_states}


def check_schema(data):
    records = data['startup-records.json']['startups']
    for record in records:
        require(not any(value is None for _, _, value in walk(record)),
                f'Legacy record must omit unknown fields, not write null: {record.get("name")}')
        for event in record.get('funding_rounds', []):
            for left, right in (('amount', 'currency'), ('valuation', 'valuation_currency')):
                require((left in event) == (right in event), f'Unpaired {left}/{right}: {event["id"]}')
            require(event.get('amount') != 0, f'Zero is not an unknown funding amount: {event["id"]}')
    js = r'''
import fs from 'node:fs';
import { validateStartupRecord, startupSlug } from './backend/hosted/src/startup-record.mjs';
const rows = JSON.parse(fs.readFileSync(0, 'utf8'));
const errors = [], identities = [];
for (const record of rows) {
  try { validateStartupRecord(record); identities.push('startup:' + startupSlug(record.name)); }
  catch (error) { errors.push({name:record.name, error:error.message}); }
}
process.stdout.write(JSON.stringify({validated:rows.length, identities, errors}));
'''
    result = subprocess.run(['node', '--input-type=module', '-e', js], cwd=ROOT,
                            input=json.dumps(records), text=True, capture_output=True,
                            check=True, timeout=30)
    outcome = json.loads(result.stdout)
    require(not outcome['errors'], 'Existing validateStartupRecord rejected: ' + json.dumps(outcome['errors']))
    require(len(set(outcome['identities'])) == len(records), 'JS startupSlug collision')
    return {'validated': len(records), 'schema': 'backend/hosted/src/startup-record.mjs',
            'null_legacy_fields': 0, 'unpaired_amounts': 0}


def check_identity(data, baseline):
    records = data['startup-records.json']['startups']
    companies = data['company-evidence.json']['companies']
    require(len(records) == len(companies) and 0 < len(records) <= 50, 'Projection/evidence count mismatch or batch exceeds 50')
    record_by_name = {name_key(r['name']): r for r in records}
    require(len(record_by_name) == len(records), 'Duplicate normalized legacy names')
    old_names, old_slugs, old_domains = set(), set(), set()
    for item in baseline['overlay']['startups'] + baseline['startup_entities']:
        for alias in aliases(item):
            old_names.add(name_key(alias)); old_slugs.add(slug(alias))
        if item.get('website'):
            old_domains.add(domain(item['website']))
    names, slugs, domains, identities = {}, {}, {}, set()
    for company in companies:
        name, eid = company['name'], company['entity_id']
        require(name == unicodedata.normalize('NFKC', name) and name == ' '.join(name.split()),
                f'Unnormalized canonical company name: {name}')
        require(eid == 'startup:' + slug(name) and eid not in identities, f'Invalid or duplicate entity ID: {eid}')
        identities.add(eid)
        require(name_key(name) in record_by_name, f'Evidence company absent from projections: {name}')
        current_domain = domain(company['website'])
        require(company['normalized_domain'] == current_domain, f'Incorrect normalized domain: {name}')
        require(domain(record_by_name[name_key(name)]['website']) == current_domain,
                f'Projection/evidence website mismatch: {name}')
        require(current_domain not in old_domains and current_domain not in domains,
                f'Domain requires duplicate review: {current_domain}')
        domains[current_domain] = name
        for alias in aliases(company):
            n, s = name_key(alias), slug(alias)
            require(n not in old_names and s not in old_slugs, f'Baseline name/alias collision: {name}: {alias}')
            require(names.get(n, eid) == eid and slugs.get(s, eid) == eid,
                    f'Within-packet name/alias collision: {name}: {alias}')
            names[n] = eid; slugs[s] = eid
        for founder in record_by_name[name_key(name)].get('founders', []):
            require(any(name_key(f['name']) == name_key(founder['name']) and
                        f['source_url'] == founder['source'] for f in company.get('founders', [])),
                    f'Unsourced projected founder: {name}: {founder["name"]}')
        projected_year = record_by_name[name_key(name)].get('founded_year')
        if projected_year is not None:
            founded = company.get('founded')
            require(founded and str(founded['value'])[:4] == str(projected_year),
                    f'Projected founding year differs from evidence: {name}')
    return {'new_companies': len(companies), 'baseline_overlay': len(baseline['overlay']['startups']),
            'baseline_graph_startups': len(baseline['startup_entities']),
            'names_and_aliases_checked': len(names), 'domain_collisions': 0}


def check_amount(amount, label):
    require(isinstance(amount, dict) and 'value' in amount and 'currency' in amount, f'Missing typed amount: {label}')
    value, precision = amount['value'], amount.get('precision')
    require(isinstance(precision, str) and precision, f'Missing amount precision: {label}')
    if precision != 'exact':
        require(value is None, f'Qualified amount masquerades as exact: {label}')
    if value is not None:
        require(type(value) in (int, float) and value > 0, f'Invalid or zero amount: {label}')
        require(isinstance(amount['currency'], str) and re.fullmatch(r'[A-Z]{3}', amount['currency']),
                f'Exact amount lacks explicit currency: {label}')
    for key in ('upper_bound', 'lower_bound'):
        if amount.get(key) is not None:
            require(type(amount[key]) in (int, float) and amount[key] > 0, f'Invalid {key}: {label}')
    if precision in ('up_to', 'lower_bound'):
        bound = 'upper_bound' if precision == 'up_to' else 'lower_bound'
        nested = 'upper' if precision == 'up_to' else 'lower'
        require(amount.get(bound) is not None or amount.get('bounds', {}).get(nested) is not None,
                f'Qualified amount lost its reported bound: {label}')


def check_funding(data, baseline):
    companies = data['company-evidence.json']['companies']
    source_map = {s['url']: s for s in data['source-registry.json']['sources']}
    claims = data['claims.json']['claims']
    events, expected_participants = {}, {}
    baseline_event_ids = {e['id'] for e in baseline['graph']['funding_rounds']}
    for company in companies:
        for event in company.get('funding_events', []):
            eid = event['event_id']
            require(eid not in events and eid not in baseline_event_ids, f'Global funding ID collision: {eid}')
            require(source_map[event['source_url']]['access_status'] == 'accessed', f'Unaccessed event source: {eid}')
            events[eid] = (company['entity_id'], event)
            check_amount(event['amount'], eid)
            for component in event.get('components', []):
                check_amount(component['amount'], eid + '/component')
            participant_names = set()
            for participant in event.get('participants', []):
                normalized = name_key(participant['name'])
                require(normalized not in participant_names, f'Duplicate participant within event: {eid}: {normalized}')
                participant_names.add(normalized)
                role = normalize_role(participant['role'])
                require(role in ('lead', 'participant', 'unspecified'), f'Unsupported participant role: {eid}: {role}')
                source = participant['source_url']
                require(source_map[source]['access_status'] == 'accessed', f'Unaccessed participation source: {eid}')
                require(participant.get('basis') not in ('portfolio', 'portfolio_only', 'portfolio_membership'),
                        f'Portfolio-only investor relationship: {eid}')
                expected_participants[(company['entity_id'], eid, normalized)] = (source, role)
    observed_participants, event_claims = {}, set()
    atomic_claims = {'funding_amount': set(), 'funding_announced_on': set()}
    observed_components = collections.Counter()
    for claim in claims:
        field = claim['field']
        if field not in ('funding_round', 'round_participant', 'funding_amount', 'funding_announced_on', 'funding_component'):
            continue
        value = claim['value']
        eid = value.get('event_id')
        require(eid in events, f'Claim references missing event: {eid}')
        require(events[eid][0] == claim['entity_id'], f'Funding claim crosses company identity: {eid}')
        evidence = events[eid][1]
        if field == 'funding_round':
            require(eid not in event_claims, f'Duplicate funding-round claim: {eid}')
            require(claim['source_url'] == evidence['source_url'] and
                    value['stage'] == evidence['stage'] and
                    value['transaction_kind'] == evidence['transaction_kind'],
                    f'Funding identity or source drift: {eid}')
            event_claims.add(eid)
            continue
        if field in atomic_claims:
            key = 'amount' if field == 'funding_amount' else 'announced_on'
            original = evidence[key]
            require(eid not in atomic_claims[field], f'Duplicate atomic {field}: {eid}')
            require(claim['source_url'] == original['source_url'] and
                    {k: v for k, v in value.items() if k != 'event_id'} ==
                    {k: v for k, v in original.items() if k != 'source_url'},
                    f'{field} ledger/evidence drift: {eid}')
            atomic_claims[field].add(eid)
            continue
        if field == 'funding_component':
            component = {k: v for k, v in value.items() if k != 'event_id'}
            signature = json.dumps(component, sort_keys=True, ensure_ascii=False)
            observed_components[(eid, claim['source_url'], signature)] += 1
            continue
        key = (claim['entity_id'], eid, name_key(value['name']))
        require(key in expected_participants and key not in observed_participants,
                f'Missing or duplicate event-specific participation: {key}')
        require((claim['source_url'], value['role']) == expected_participants[key],
                f'Participant source/role drift between evidence and ledger: {key}')
        require(value.get('participation_status') in ('confirmed_in_announcement', 'prospective_as_reported', 'conditional_commitment'),
                f'Participant lacks event-specific participation status: {key}')
        require(value.get('evidence_scope') == 'event_specific_announcement',
                f'Participant lacks event-specific evidence scope: {key}')
        require('canonical_investor_id' in value and value['canonical_investor_id'] is None,
                f'Unreviewed investor canonicalization: {key}')
        require(claim.get('accessed') is True and claim.get('evidence'), f'Participation lacks accessed evidence: {key}')
        observed_participants[key] = True
    require(set(events) == event_claims, 'Funding events and ledger funding-round claims differ')
    require(all(set(events) == ids for ids in atomic_claims.values()), 'Funding amount/date claim coverage is incomplete')
    expected_components = collections.Counter()
    for eid, (_, event) in events.items():
        for component in event.get('components', []):
            source = component.get('source_url') or component['amount']['source_url']
            value = {k: v for k, v in component.items() if k != 'source_url'}
            expected_components[(eid, source, json.dumps(value, sort_keys=True, ensure_ascii=False))] += 1
    require(observed_components == expected_components, 'Funding component ledger/evidence coverage or values differ')
    require(set(expected_participants) == set(observed_participants), 'Participant coverage differs between event evidence and ledger')
    projected = 0
    for record in data['startup-records.json']['startups']:
        for event in record.get('funding_rounds', []):
            eid = event['id']
            require(eid in events and events[eid][0] == 'startup:' + slug(record['name']),
                    f'Projected funding ID has no matching company event: {eid}')
            evidence = events[eid][1]
            require(event['source'] == evidence['source_url'], f'Projected event source changed: {eid}')
            if 'amount' in event:
                observed = evidence['amount']
                require(observed.get('precision') == 'exact' and observed.get('source_url') == event['source'],
                        f'Numeric projection lacks exact same-source support: {eid}')
                require(evidence['transaction_kind'] in ('equity', 'primary_equity'),
                        f'Non-equity transaction projected as simple numeric funding: {eid}')
                require((event['amount'], event['currency']) == (observed['value'], observed['currency']),
                        f'Projected amount/currency differs from evidence: {eid}')
            if 'announced_on' in event:
                observed = evidence.get('announced_on')
                require(isinstance(observed, dict) and observed.get('precision') == 'day' and
                        observed.get('value') == event['announced_on'], f'Padded or changed announcement date: {eid}')
            projected += 1
    return {'events': len(events), 'projected_events': projected,
            'atomic_amount_and_date_claims': sum(len(ids) for ids in atomic_claims.values()),
            'component_claims': sum(observed_components.values()),
            'event_specific_participation_rows': len(expected_participants),
            'portfolio_only_relationships_accepted': 0}


def check_coverage(data):
    coverage = data['coverage.json']
    candidates, counts = coverage['candidates'], coverage['counts']
    statuses = collections.Counter(c['disposition'] for c in candidates)
    require(set(statuses) <= {'accepted_staged', 'rejected', 'held', 'queued'}, 'Unnormalized candidate disposition')
    expected = {'discovered': len(candidates), 'reviewed': len(candidates) - statuses['queued'],
                'accepted': statuses['accepted_staged'], 'rejected': statuses['rejected'],
                'held': statuses['held'], 'queued': statuses['queued']}
    for key, value in expected.items():
        require(type(counts.get(key)) is int and counts[key] == value, f'Coverage {key} does not reconcile')
    require(expected == {'discovered': 29, 'reviewed': 24, 'accepted': 21, 'rejected': 2, 'held': 1, 'queued': 5},
            'Batch scope changed; review the country checkpoint before changing this gate')
    accepted = {name_key(c['name']) for c in candidates if c['disposition'] == 'accepted_staged'}
    proposed = {name_key(c['name']) for c in data['company-evidence.json']['companies']}
    require(accepted == proposed and len(accepted) == counts['accepted'], 'Accepted coverage and evidence names differ')
    require(len({name_key(c['name']) for c in candidates}) == len(candidates), 'Candidate names duplicate')
    require('national_startup_denominator' in coverage and coverage['national_startup_denominator'] is None,
            'A national completeness denominator has not been established')
    companies = data['company-evidence.json']['companies']
    expected_totals = {
        'funding_event_observations': sum(len(c.get('funding_events', [])) for c in companies),
        'current_schema_funding_projections': sum(len(c.get('funding_rounds', [])) for c in data['startup-records.json']['startups']),
        'founder_occurrences': sum(len(c.get('founders', [])) for c in companies),
        'round_participation_rows': sum(len(e.get('participants', [])) for c in companies for e in c.get('funding_events', [])),
        'conflict_groups': sum(len(c.get('conflicts', [])) for c in companies),
        'source_counts': dict(collections.Counter(s['access_status'] for s in data['source-registry.json']['sources']))}
    for key, value in expected_totals.items():
        require(coverage.get(key) == value, f'Coverage detail does not reconcile: {key}')
    items = data['next-source-queue.json']['items']
    require(isinstance(items, list) and items, 'No resumable next-source queue')
    queue_ids = [item.get('queue_id', item.get('id')) for item in items]
    require(all(isinstance(key, str) and key for key in queue_ids), 'Queue item lacks a stable ID')
    require(len(queue_ids) == len(set(queue_ids)), 'Duplicate next-source queue IDs')
    require(all(item.get('reason') or item.get('next_action') or item.get('next_step') or
                item.get('resume_action') for item in items),
            'Queue item lacks a reason or next action')
    manifest = data['manifest.json']
    revisions = [manifest[key] for key in ('research_base_revision', 'baseline_revision', 'source_revision', 'pinned_revision') if key in manifest]
    require(revisions and all(rev == PIN for rev in revisions), 'Manifest does not bind the pinned baseline revision')
    require(manifest.get('validation_base_revision') == TARGET_PIN,
            'Manifest does not bind the explicitly reviewed validation target')
    require(data['baseline-review.json']['source_revision'] == PIN, 'Independent baseline review is for another revision')
    require(manifest.get('country_code') == 'CA' and
            manifest.get('owned_path') == str(PACKET.relative_to(ROOT)) + '/',
            'Manifest needs the exact Canada staging scope')
    return {**expected, 'national_startup_denominator': None, 'queue_items': len(items)}


def check_resume(data, baseline):
    sys.path.insert(0, str(ROOT))
    from scripts.plan_company_profiles import build_plan
    combined = {**baseline['overlay'], 'startups': baseline['overlay']['startups'] + data['startup-records.json']['startups']}
    expected = sorted(row['name'] for row in combined['startups'])
    require(len(expected) == EXPECTED_COMBINED, 'Combined overlay count is not the reviewed 66')
    with tempfile.TemporaryDirectory(prefix='atlas-ca-validator-') as temp:
        directory = Path(temp)
        overlay, seeds = directory / 'overlay.json', directory / 'seeds.csv'
        original_overlay = (json.dumps(combined, ensure_ascii=False) + '\n').encode()
        original_seeds = baseline['seed_bytes']
        overlay.write_bytes(original_overlay); seeds.write_bytes(original_seeds)
        limit = 7
        first = build_plan(overlay, seeds, PIN, limit)
        second = build_plan(overlay, seeds, PIN, limit, first['next_cursor'])
        visited = first['items'] + second['items']
        checkpoint = directory / 'checkpoint.json'
        checkpoint.write_text(json.dumps({'cursor': second['next_cursor'], 'visited': visited}), encoding='utf-8')
        restored = read_json(checkpoint)
        cursor, visited = restored['cursor'], restored['visited']
        pages = 2
        while cursor is not None:
            page = build_plan(overlay, seeds, PIN, limit, cursor)
            visited.extend(page['items']); cursor = page['next_cursor']; pages += 1
            require(pages <= 100, 'Planner failed to terminate')
        names = [item['source_record_name'] for item in visited]
        require(names == expected and len(set(names)) == EXPECTED_COMBINED,
                'Interrupted resume omitted, duplicated or reordered source records')
        proposed_names = {row['name'] for row in data['startup-records.json']['startups']}
        require(all(item['seed_state'] == 'seed_review_required' for item in visited if item['source_record_name'] in proposed_names),
                'Research discovery unexpectedly approved a new crawler seed')
        rejected = []

        def rejects(label, revision=PIN, batch_limit=limit):
            try:
                build_plan(overlay, seeds, revision, batch_limit, restored['cursor'])
            except ValueError as error:
                require('Cursor does not match' in str(error), f'{label} failed for an unrelated reason: {error}')
                rejected.append(label)
            else:
                raise ValueError(f'Planner accepted {label} drift with an old cursor')

        rejects('revision', revision='0' * 40)
        rejects('limit', batch_limit=limit + 1)
        overlay.write_bytes(original_overlay + b'\n')
        rejects('overlay_bytes')
        overlay.write_bytes(original_overlay)
        seeds.write_bytes(original_seeds + b'\n')
        rejects('seed_bytes')
        seeds.write_bytes(original_seeds)
        require(overlay.read_bytes() == original_overlay and seeds.read_bytes() == original_seeds,
                'Temporary drift probes were not restored')
    return {'combined_records': len(expected), 'batch_limit': limit, 'pages': pages,
            'exactly_once_after_interruption': True, 'cursor_drift_rejections': rejected,
            'new_seed_approvals': 0, 'original_seed_sha256': sha(baseline['seed_bytes'])}


def main():
    checks, data, baseline = [], {}, {}
    protected_before = {name: (ROOT / name).read_bytes() for name in PROTECTED if (ROOT / name).is_file()}

    def run(label, function):
        try:
            details = function()
            checks.append({'check': label, 'status': 'passed', 'details': details})
            return True
        except Exception as error:
            checks.append({'check': label, 'status': 'failed', 'error': f'{type(error).__name__}: {error}'})
            return False

    def inputs():
        missing = [name for name in FILES if not (PACKET / name).is_file()]
        require(not missing, 'Packet assembly incomplete: ' + ', '.join(missing))
        data.update({name: read_json(PACKET / name) for name in FILES})
        return {'files': len(FILES)}

    def baseline_inputs():
        raw = {name: git_bytes(name) for name in GRAPH_INPUTS}
        for name, value in raw.items():
            require((ROOT / name).read_bytes() == value, f'Working source differs from pinned baseline: {name}')
        builder = load_revision_module('atlas_ca_graph_builder', 'scripts/make-graph.py', PIN)
        graph = builder.build_graph(*(json.loads(raw[name]) for name in GRAPH_INPUTS))
        overlay = json.loads(raw['data/startup-research.json'])
        entities = [entity for entity in graph['entities'] if entity['kind'] == 'startup']
        require(len(overlay['startups']) == EXPECTED_OVERLAY and len(entities) == EXPECTED_GRAPH_STARTUPS,
                'Pinned source denominator does not match baseline review')
        seed_bytes = git_bytes(SEEDS)
        require((ROOT / SEEDS).read_bytes() == seed_bytes, 'Seed allowlist changed from the pinned baseline')
        baseline.update(overlay=overlay, graph=graph, startup_entities=entities, seed_bytes=seed_bytes)
        return {'revision': PIN, 'overlay_records': len(overlay['startups']),
                'reconstructed_startups': len(entities), 'graph_builder_revision': PIN,
                'graph_written': False,
                'source_byte_sha256': {name: sha(value) for name, value in raw.items()}}

    def target_inputs():
        changed = subprocess.run(['git', 'diff', '--name-only', PIN, TARGET_PIN], cwd=ROOT,
                                 check=True, capture_output=True, text=True, timeout=30).stdout.splitlines()
        require(changed, 'Expected explicitly reviewed owner fixes between the two revisions')
        guarded = sorted(set(PROTECTED) | set(changed))
        for name in guarded:
            require((ROOT / name).read_bytes() == git_bytes(name, TARGET_PIN),
                    f'Current protected file differs from validation target: {name}')
        for name in GRAPH_INPUTS + (SEEDS,):
            require(git_bytes(name, PIN) == git_bytes(name, TARGET_PIN),
                    f'Data or seed inputs changed between reviewed revisions: {name}')
        return {'research_base_revision': PIN, 'validation_base_revision': TARGET_PIN,
                'current_files_match_validation_target': len(guarded),
                'graph_data_and_seed_inputs_unchanged': True,
                'owner_changed_paths_between_exact_revisions': changed,
                'owner_fixes': ['https://github.com/castlemilk/startup-atlas/pull/179',
                               'https://github.com/castlemilk/startup-atlas/pull/181']}

    ready = run('packet_inputs', inputs)
    base_ready = run('pinned_baseline_and_in_memory_graph', baseline_inputs)
    target_ready = run('explicit_validation_target_source_bytes', target_inputs)
    if ready:
        run('source_bindings_and_retrievals', lambda: check_sources(data))
        run('existing_js_startup_schema_and_missing_values', lambda: check_schema(data))
        run('coverage_reconciliation_and_scope', lambda: check_coverage(data))
    if ready and base_ready and target_ready:
        run('canonical_names_domains_aliases_and_deduplication', lambda: check_identity(data, baseline))
        run('funding_amounts_dates_and_event_participation', lambda: check_funding(data, baseline))
        run('existing_planner_interrupted_resume_and_drift', lambda: check_resume(data, baseline))

    def unchanged():
        for name, value in protected_before.items():
            require((ROOT / name).read_bytes() == value, f'Original source changed during validation: {name}')
        reviewed_files = data.get('baseline-review.json', {}).get('source_files', [])
        for item in reviewed_files:
            relative = Path(item['path'])
            require(not relative.is_absolute() and '..' not in relative.parts, 'Unsafe baseline source path')
            actual = (ROOT / relative).read_bytes()
            historical = git_bytes(item['path'], PIN)
            require(sha(historical) == item['sha256'],
                    f'Historical independent-review hash differs from its pinned Git blob: {item["path"]}')
            require(actual == git_bytes(item['path'], TARGET_PIN),
                    f'Current reviewed source differs from explicit validation target: {item["path"]}')
        return {'protected_files_unchanged': len(protected_before),
                'independent_review_hashes_rechecked': len(reviewed_files),
                'production_or_generated_files_written': 0}

    run('original_source_bytes_unchanged', unchanged)
    passed = all(check['status'] == 'passed' for check in checks)
    report = {'validator': 'canada-batch-001-offline', 'status': 'passed' if passed else 'failed',
              'baseline_revision': PIN, 'packet': str(PACKET.relative_to(ROOT)),
              'research_base_revision': PIN, 'validation_base_revision': TARGET_PIN,
              'checked_at': dt.datetime.now(dt.timezone.utc).isoformat(), 'network_requests': 0,
              'checks': checks, 'checksums': 'Final checksums.sha256 is a separate packaging step.',
              'limits': 'Structural and recorded-provenance validation; not independent web verification or national completeness.'}
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if passed else 1


if __name__ == '__main__':
    raise SystemExit(main())
