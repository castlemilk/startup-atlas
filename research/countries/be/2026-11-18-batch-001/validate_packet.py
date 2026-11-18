#!/usr/bin/env python3
"""Offline, country-local evidence and projection checks; no crawler/runtime writes.

Run from any directory. Only --out writes a validation receipt. A base graph is
rebuilt in memory from the pinned repository sources, never from stale graph.json.
"""
from __future__ import annotations
import argparse
import copy
import hashlib
import ipaddress
import json
from collections import Counter
from datetime import date, datetime, timezone
from pathlib import Path
import re
import subprocess
import sys
import types
import unicodedata
from urllib.parse import urlsplit

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[3]
FILES = ('records.json', 'companies.json', 'claims.json', 'sources.json', 'coverage.json',
         'manifest.json', 'deduplication.json', 'ecosystem.json', 'projection-map.json', 'baseline-audit.json')
REVIEWED = {'reviewed_staged', 'conflict', 'published_verified'}
# These retained transactions do not establish new company financing. Their
# participants remain typed sidecar observations, outside funding_rounds.
NON_FUNDING_TRANSACTIONS = {
    'acquisition', 'minority_stake_acquisition', 'secondary_transfer',
    'investment_unspecified',
}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def unique_pairs(pairs):
    result = {}
    for key, value in pairs:
        require(key not in result, f'Duplicate JSON object key: {key}')
        result[key] = value
    return result


def strict_json(text):
    return json.loads(text, object_pairs_hook=unique_pairs,
                      parse_constant=lambda value: (_ for _ in ()).throw(ValueError(f'Nonfinite JSON: {value}')))


def canonical_bytes(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False).encode('utf-8')


def digest(value):
    return hashlib.sha256(canonical_bytes(value)).hexdigest()


def name_key(value):
    return ''.join(c for c in unicodedata.normalize('NFKC', value).casefold() if c.isalnum())


def slug(value):
    value = unicodedata.normalize('NFKD', value).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', '-', value).strip('-')


def domain(value):
    parts = urlsplit(value if '://' in value else 'https://' + value)
    require(parts.scheme == 'https' and parts.hostname and parts.username is None and parts.password is None,
            f'Invalid HTTPS identity URL/domain: {value}')
    require(parts.port in (None, 443), f'Nonstandard HTTPS port: {value}')
    host = parts.hostname.lower().encode('idna').decode('ascii')
    try:
        ipaddress.ip_address(host)
    except ValueError:
        pass
    else:
        raise ValueError(f'Literal IP is not a company canonical domain: {value}')
    return host.removeprefix('www.')


def timestamp(value):
    require(isinstance(value, str), 'Timestamp must be a string')
    parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
    require(parsed.tzinfo is not None, 'Timestamp must retain timezone')
    require(parsed <= datetime.now(timezone.utc), f'Future observation timestamp: {value}')
    return parsed


def temporal(value, precision):
    if value is None:
        return
    require(isinstance(value, str), f'Date value must retain string precision: {value!r}')
    if precision == 'day':
        require(re.fullmatch(r'\d{4}-\d{2}-\d{2}', value), f'Invalid day date: {value}')
        date.fromisoformat(value)
    elif precision == 'month':
        require(re.fullmatch(r'\d{4}-\d{2}', value), f'Invalid month date: {value}')
        date.fromisoformat(value + '-01')
    elif precision == 'year':
        require(re.fullmatch(r'\d{4}', value), f'Invalid year date: {value}')
        require(1800 <= int(value) <= datetime.now(timezone.utc).year, f'Invalid year: {value}')
    elif precision in {'season', 'unknown', 'unresolved_multiple_announcements', None}:
        return
    else:
        raise ValueError(f'Unsupported date precision: {precision}')


def source_ids(item):
    values = list(item.get('source_ids') or [])
    if item.get('source_id'):
        values.append(item['source_id'])
    return set(values)


def claim_id(claim):
    return claim.get('claim_id', claim.get('id'))


def event_id(event):
    return event.get('id', event.get('event_id'))


def participant_name(value):
    return value.get('name', value.get('stated_name', value.get('participant_name')))


def page_queue(queue, revision, limit=7, cursor=None):
    """Testable offline packet pagination, not a production collector adapter."""
    require(type(limit) is int and 1 <= limit <= 50, 'Page size must be 1..50')
    binding = digest({'queue_sha256': digest(queue), 'revision': revision, 'limit': limit})
    offset = 0
    if cursor is not None:
        match = re.fullmatch(r'be-v1:([a-f0-9]{64}):(\d+)', cursor)
        require(match and match[1] == binding, 'Resume cursor does not match revision, queue or limit')
        offset = int(match[2])
        require(0 < offset < len(queue) and offset % limit == 0, 'Invalid resume page boundary')
    end = min(offset + limit, len(queue))
    return queue[offset:end], (f'be-v1:{binding}:{end}' if end < len(queue) else None)


def indexed(data):
    companies = data['companies.json']['companies']
    claims = data['claims.json']['claims']
    sources = data['sources.json']['sources']
    return ({c['entity_id']: c for c in companies},
            {claim_id(c): c for c in claims}, {s['id']: s for s in sources})


def check_provenance(data):
    companies, claims, sources = indexed(data)
    raw = data['claims.json']['claims']
    require(len(claims) == len(raw) and None not in claims, 'Missing or duplicate claim IDs')
    require(len(sources) == len(data['sources.json']['sources']), 'Duplicate source IDs')
    require(len({s['url'] for s in sources.values()}) == len(sources), 'Duplicate source URLs require explicit registry reconciliation')
    ecosystem_ids = set(data['ecosystem.json'].get('entity_ids', []))
    for sid, source in sources.items():
        domain(source['url'])
        require(type(source.get('accessed')) is bool, f'Source access flag is not explicit: {sid}')
        timestamp(source['retrieved_at'])
        require(source.get('crawler_seed_approved') is False, f'Research source silently approved as crawler seed: {sid}')
    for cid, claim in claims.items():
        eid = claim.get('entity_id')
        require(eid in companies or eid in ecosystem_ids, f'Unknown claim entity: {cid}/{eid}')
        require(claim.get('publication_state', 'unsubmitted') in {'unsubmitted', 'proposed'}, f'Unverified published claim: {cid}')
        if claim['status'] in REVIEWED:
            require(claim.get('value') is not None, f'Reviewed/conflict claim lacks value: {cid}')
            sid = claim.get('source_id')
            require(sid in sources, f'Unknown reviewed claim source: {cid}/{sid}')
            source = sources[sid]
            require(source['accessed'] is True and claim.get('accessed') is True, f'Failed page promoted to fact: {cid}')
            require(claim['source_url'] == source['url'], f'Source ID/URL binding mismatch: {cid}')
            kind = claim.get('source_kind')
            original = claim.get('source_kind_original')
            require(kind == source['source_kind'] or (original == source['source_kind'] and kind == 'secondary' and claim.get('source_kind_mapping')),
                    f'Unexplained source-kind change: {cid}')
            require(timestamp(claim['reviewed_at']) >= timestamp(claim['retrieved_at']), f'Review predates retrieval: {cid}')
            require(claim['retrieved_at'] == source['retrieved_at'], f'Claim/source retrieval mismatch: {cid}')
            require(claim.get('evidence') and claim.get('rationale') and claim.get('confidence') in {'high', 'medium', 'low'}, f'Incomplete evidence disposition: {cid}')
            if claim.get('published_on') is not None:
                temporal(claim['published_on'], 'day')
        elif claim['status'] in {'searched_unknown', 'unsearched', 'blocked'}:
            require(claim.get('value') is None, f'Unknown claim unexpectedly has factual value: {cid}')
            if claim['status'] == 'searched_unknown':
                require(claim.get('search_log'), f'Searched unknown has no actual search log: {cid}')
                for observation in claim['search_log']:
                    require(observation['source_id'] in sources, f'Unknown search-log source: {cid}')
                    require(observation.get('url') == sources[observation['source_id']]['url'], f'Search-log URL binding mismatch: {cid}')
        else:
            require(claim['status'] in {'candidate', 'rejected', 'not_applicable'}, f'Unknown claim state: {cid}')
    for eid, company in companies.items():
        ids = company.get('claim_ids', [])
        require(ids and len(ids) == len(set(ids)), f'Company has missing/duplicate claim links: {eid}')
        for cid in ids:
            require(cid in claims and claims[cid]['entity_id'] == eid, f'Cross-company claim link: {eid}/{cid}')
    for cid in data['ecosystem.json'].get('claim_ids', []):
        require(cid in claims and claims[cid]['entity_id'] in ecosystem_ids, f'Invalid ecosystem claim link: {cid}')


def check_participations(data, baseline_entities):
    companies, claims, sources = indexed(data)
    events = {}
    for eid, company in companies.items():
        for event in company.get('events', []):
            rid = event_id(event)
            require(rid and rid not in events, f'Duplicate or missing sidecar event ID: {rid}')
            require(event.get('company_id') == eid, f'Cross-company event: {rid}')
            require(source_ids(event), f'Event has no provenance source: {rid}')
            for sid in source_ids(event):
                require(sid in sources and sources[sid]['accessed'], f'Event source inaccessible: {rid}/{sid}')
            events[rid] = (eid, event)
    baseline = {e['id']: e for e in baseline_entities}
    for rid, (eid, event) in events.items():
        expected_field = ('transaction_participant' if event.get('transaction_kind')
                          in NON_FUNDING_TRANSACTIONS else 'round_participant')
        seen = set()
        for person in event.get('participants', []):
            name = participant_name(person)
            require(isinstance(name, str) and name.strip(), f'Unnamed participant: {rid}')
            require(name_key(name) not in seen, f'Duplicate named participant: {rid}/{name}')
            seen.add(name_key(name))
            require(person.get('company_id', eid) == eid and person.get('event_id', rid) == rid, f'Participant attached to wrong event/company: {rid}/{name}')
            require(person.get('basis', person.get('evidence_basis')) not in {'portfolio', 'portfolio_membership', 'general_shareholder', 'programme_membership'}, f'Portfolio/shareholder membership promoted to event participation: {rid}/{name}')
            ids = person.get('claim_ids') or []
            require(ids, f'Participant lacks event-specific claim links: {rid}/{name}')
            relevant = []
            for cid in ids:
                require(cid in claims, f'Unknown participant claim: {cid}')
                claim = claims[cid]
                require(claim['entity_id'] == eid and claim['field'] == expected_field,
                        f'Participant relationship has wrong transaction/round type: {cid}; expected {expected_field}')
                value = claim.get('value') or {}
                require(value.get('event_id', value.get('round_id')) == rid, f'Participation claim names different event: {cid}')
                require(value.get('company_id', eid) == eid, f'Participation claim names different company: {cid}')
                require(name_key(participant_name(value) or '') == name_key(name), f'Participant name differs from its event claim: {cid}')
                require(value.get('role') == person.get('role') and person.get('role'),
                        f'Participant role differs from its event claim: {cid}')
                require(claim['source_id'] in source_ids(person), f'Participant claim/source mismatch: {cid}')
                require(claim['status'] == 'reviewed_staged', f'Unreviewed/conflicting participant projected as accepted: {cid}')
                relevant.append(claim)
            resolved = person.get('resolved_entity_id', person.get('canonical_entity_id'))
            if resolved is not None:
                require(resolved in baseline, f'Unrecognized canonical investor ID: {resolved}')
                require(person.get('identity_claim_ids'), f'Canonical investor ID asserted without explicit identity review: {resolved}')
    for cid, claim in claims.items():
        if claim.get('field') not in {'round_participant', 'transaction_participant'}:
            continue
        value = claim.get('value') or {}
        rid = value.get('event_id', value.get('round_id'))
        require(rid in events and events[rid][0] == claim['entity_id'], f'Orphan/cross-company participation claim: {cid}')
        expected_field = ('transaction_participant' if events[rid][1].get('transaction_kind')
                          in NON_FUNDING_TRANSACTIONS else 'round_participant')
        require(claim['field'] == expected_field, f'Participation claim has wrong event type: {cid}')
    return events


def check_projection(data):
    companies, claims, sources = indexed(data)
    records = data['records.json']['startups']
    by_name = {r['name']: r for r in records}
    require(len(by_name) == len(records) == len(companies), 'Projection/company count mismatch')
    require({c['name'] for c in companies.values()} == set(by_name), 'Projection names differ from accepted companies')
    zero_unknowns = []
    for eid, company in companies.items():
        record = by_name[company['name']]
        founding = company.get('founding')
        conflict = company.get('field_status', {}).get('founding') == 'conflict' or (isinstance(founding, dict) and (founding.get('disposition') == 'conflict' or founding.get('status') == 'conflict'))
        known = None if not isinstance(founding, dict) else founding.get('date', founding.get('value'))
        if conflict or known is None:
            require('founded_year' not in record, f'Disputed/unknown founding year projected: {record["name"]}')
            zero_unknowns.append(record['name'])
        elif 'founded_year' in record:
            expected = founding.get('year') or (int(known[:4]) if re.match(r'^\d{4}', known) else None)
            require(expected == record['founded_year'], f'Founding year differs from sidecar precision: {record["name"]}')
        require(record.get('founded_year') != 0, f'Unknown founding encoded as zero: {record["name"]}')
        events = {event_id(e): e for e in company.get('events', [])}
        for projected in record.get('funding_rounds', []):
            rid = projected['id']
            require(rid in events, f'Projected financing has no sidecar event: {rid}')
            event = events[rid]
            require(event.get('transaction_kind') not in NON_FUNDING_TRANSACTIONS,
                    f'Acquisition, secondary or unspecified transaction promoted to company funding: {rid}')
            require(projected['source'] in {sources[sid]['url'] for sid in source_ids(event)}, f'Projected event source not bound to sidecar: {rid}')
            amount = event.get('amount')
            if amount is None or event.get('amount_status') == 'conflict':
                require('amount' not in projected and 'currency' not in projected, f'Unknown/conflicting amount became numeric: {rid}')
            elif 'amount' in projected:
                require(projected['amount'] == amount and projected['currency'] == event.get('currency'), f'Projected money differs from event: {rid}')
            if projected.get('amount') == 0:
                require(amount == 0 and event.get('typed_amount_status') == 'disclosed', f'Unknown funding converted to zero: {rid}')
            value = event.get('announced_date', event.get('announced_on'))
            precision = event.get('date_precision', event.get('announced_precision'))
            temporal(value, precision)
            if precision != 'day':
                require('announced_on' not in projected, f'Partial/unknown funding date padded to day: {rid}')
            elif 'announced_on' in projected:
                require(projected['announced_on'] == value, f'Projection changed event date: {rid}')
        for founder in record.get('founders', []):
            require(founder['name'] in {f['name'] for f in company.get('founders', [])}, f'Projected founder absent from company: {eid}/{founder["name"]}')
            supporting = [c for c in claims.values() if c['entity_id'] == eid and c['field'] in {'founder', 'founders'} and c.get('status') == 'reviewed_staged' and isinstance(c.get('value'), dict) and c['value'].get('name') == founder['name'] and c.get('source_url') == founder['source']]
            require(supporting, f'Projected founder lacks matching sourced claim: {eid}/{founder["name"]}')
        require(not record.get('relationships'), f'Packet creates canonical relationship edges without explicit review contract: {eid}')
    mappings = data['projection-map.json']['records']
    require({m['record_name'] for m in mappings} == set(by_name), 'Projection map does not cover all records')
    for mapping in mappings:
        eid = mapping['entity_id']; record = by_name[mapping['record_name']]
        for item in mapping['fields']:
            value = record
            for part in item['path'].split('/')[1:]:
                token = part.replace('~1', '/').replace('~0', '~')
                value = value[int(token)] if isinstance(value, list) else value[token]
            require(item.get('claim_ids') and item.get('source_ids') and item.get('source_urls'), f'Unattributed projection map path: {mapping["record_name"]}{item["path"]}')
            for cid in item['claim_ids']:
                require(cid in claims and claims[cid]['entity_id'] == eid, f'Cross-company or missing projection-map claim: {cid}')
            for sid in item['source_ids']:
                require(sid in sources and sources[sid]['accessed'] and sources[sid]['url'] in item['source_urls'], f'Projection-map source mismatch: {sid}')
    return zero_unknowns


def check_normalization(data, baseline_entities):
    companies, _, _ = indexed(data)
    require(len(companies) == len(data['companies.json']['companies']), 'Duplicate staging company IDs')
    names = {}; domains = {}; startup_ids = set(); founders = {}
    baseline_by_id = {e['id']: e for e in baseline_entities}
    baseline_names = {name_key(e['name']): e['id'] for e in baseline_entities if e['kind'] == 'startup'}
    baseline_domains = {domain(e['website']): e['id'] for e in baseline_entities if e.get('website') and e['kind'] == 'startup'}
    for eid, company in companies.items():
        name = company['name']; require(name == name.strip() and name, f'Noncanonical company name: {eid}')
        expected = 'startup:' + slug(name)
        require(company['proposed_atlas_id'] == expected and expected not in startup_ids, f'Duplicate/incorrect startup slug: {name}')
        require(expected not in baseline_by_id, f'New-company ID collides with baseline: {expected}')
        startup_ids.add(expected)
        host = domain(company['website'])
        require(host == company['canonical_domain'] and host not in domains, f'Duplicate/noncanonical company domain: {name}/{host}')
        require(host not in baseline_domains, f'Company domain collides with baseline: {name}')
        domains[host] = eid
        aliases = [a if isinstance(a, str) else a['name'] for a in company.get('aliases', [])]
        for candidate in [name] + aliases:
            key = name_key(candidate)
            require(key and (key not in names or names[key] == eid), f'Cross-company alias/name collision: {candidate}')
            require(key not in baseline_names, f'Name/alias collides with existing startup: {candidate}')
            names[key] = eid
        for founder in company.get('founders', []):
            pid = 'person:' + slug(founder['name'])
            require(pid not in baseline_by_id, f'Founder matches existing person; explicit review needed: {pid}')
            require(pid not in founders or founders[pid] == founder['name'], f'Founder spellings collapse to same person ID: {pid}')
            founders[pid] = founder['name']
    audit = data['deduplication.json']
    require(audit['baseline_entity_count'] == len(baseline_entities), 'Baseline entity count mismatch')
    require(audit['baseline_sha256'] == digest(baseline_entities), 'Baseline entity hash mismatch')
    require(len(audit['results']) == len(companies), 'Deduplication result count mismatch')
    for result in audit['results']:
        require(result['entity_id'] in companies and not result['baseline_matches'], 'Deduplication audit conflicts with new-company staging')
    return len(founders)


def check_coverage(data):
    coverage = data['coverage.json']; counts = coverage['counts']; found = coverage['discovered']; queue = coverage['next_source_queue']
    companies = data['companies.json']['companies']; claims = data['claims.json']['claims']; sources = data['sources.json']['sources']; records = data['records.json']['startups']
    require(len({x['id'] for x in found}) == len(found), 'Duplicate discovered company IDs')
    require(len({name_key(x['name']) for x in found}) == len(found), 'Discovery aliases/names counted as separate companies')
    states = Counter(x['state'] for x in found)
    for state in states:
        require(state in {'accepted', 'rejected', 'deferred'}, f'Unknown discovered state: {state}')
    require(counts['discovered'] == len(found) == counts['accepted'] + counts['rejected'] + counts['deferred'], 'Discovery coverage equation fails')
    require(counts['reviewed'] == counts['accepted'] + counts['rejected'], 'Review coverage equation fails')
    for state in ('accepted', 'rejected', 'deferred'):
        require(counts[state] == states[state], f'Discovery state count mismatch: {state}')
    require(counts['accepted'] == len(companies) == len(records) == counts['projected_records'], 'Accepted/projected/company counts differ')
    require(counts['published_records'] == 0 and coverage['national_denominator'] is None, 'Unsupported publication or national denominator assertion')
    actual = {'source_registry_entries': len(sources), 'unique_source_urls':len({s['url'] for s in sources}), 'source_entries_accessed':sum(s['accessed'] for s in sources), 'source_entries_failed':sum(not s['accessed'] for s in sources), 'claims':len(claims), 'ecosystem_claims':sum(c['entity_id'].startswith('ecosystem:be:') for c in claims), 'projected_financing_events':sum(len(r.get('funding_rounds', [])) for r in records), 'sidecar_events':sum(len(c.get('events', [])) for c in companies), 'queue_items':len(queue), 'claim_statuses':dict(Counter(c['status'] for c in claims))}
    for key, value in actual.items():
        require(counts[key] == value, f'Coverage counter differs from records: {key}: {counts[key]} != {value}')
    require(data['manifest.json']['counts'] == counts, 'Manifest/coverage counts differ')
    require(queue == sorted(queue, key=lambda x:(x['priority'], x['queue_id'])), 'Queue order is not deterministic priority/ID order')
    require(len({q['queue_id'] for q in queue}) == len(queue), 'Duplicate queue work IDs')
    require(coverage['queue_sha256'] == digest(queue), 'Queue fingerprint mismatch')
    require(coverage['resume_contract']['base_revision'] == data['manifest.json']['base_revision'], 'Queue revision mismatch')
    for q in queue:
        require(q.get('state') and type(q['priority']) is int and q['priority'] >= 1, 'Queue item lacks actionable state or priority')
        require(q.get('crawler_seed_approved') is False, 'Queue item implies crawler seed approval')
    revision = data['manifest.json']['base_revision']; cursor = None; all_rows = []; pages = 0
    while True:
        rows, cursor = page_queue(queue, revision, 7, cursor)
        all_rows.extend(rows); pages += 1
        if cursor is None:
            break
    require(all_rows == queue and len({q['queue_id'] for q in all_rows}) == len(queue), 'Resume skips or repeats work')
    return pages


def load_baseline(data, baseline_path=None):
    if baseline_path:
        content = strict_json(Path(baseline_path).read_text())
        return content['entities'] if isinstance(content, dict) else content, None
    context = graph_context(data['manifest.json']['base_revision'])
    return context[2]['entities'], context


def graph_context(revision):
    """Load the builder AND source inputs from one exact commit, in memory."""
    require(re.fullmatch(r'[a-f0-9]{40}', revision), 'Baseline revision is not exact Git SHA')
    def git_text(path):
        return subprocess.run(['git', 'show', f'{revision}:{path}'], cwd=REPO, text=True, capture_output=True, check=True).stdout
    builder = git_text('scripts/make-graph.py')
    module = types.ModuleType('country_packet_graph_builder_' + revision)
    module.__file__ = str(REPO/'scripts/make-graph.py')
    exec(compile(builder, module.__file__, 'exec'), module.__dict__)
    def source(name):
        return strict_json(git_text('data/' + name))
    args = [source(name) for name in ('partner-profiles.json', 'partner-leads.json', 'partners-reviewed.json', 'catalogue.json', 'startup-research.json')]
    graph = module.build_graph(*args)
    return module, args, graph


def validation_context(data):
    revision = data['manifest.json'].get('validation_base_revision', data['manifest.json']['base_revision'])
    context = graph_context(revision)
    # A receipt must not quietly validate an obsolete builder while the checkout
    # contains a later implementation. Updates require an explicit base refresh.
    for path in ('scripts/make-graph.py', 'data/partner-profiles.json', 'data/partner-leads.json',
                 'data/partners-reviewed.json', 'data/catalogue.json', 'data/startup-research.json'):
        expected = subprocess.run(['git', 'show', f'{revision}:{path}'], cwd=REPO, capture_output=True, check=True).stdout
        require((REPO/path).read_bytes() == expected, f'Checkout differs from declared validation base: {path}')
    return context


def check_graph_founding(graph, records):
    entities = {entity['id']: entity for entity in graph['entities']}
    omitted = []
    for record in records:
        entity = entities['startup:' + slug(record['name'])]
        if 'founded_year' in record:
            require(entity.get('founded_year') == record['founded_year'], f'Graph changed stated founding year: {record["name"]}')
        else:
            require('founded_year' not in entity, f'Graph fabricated an absent founding year: {record["name"]}')
            omitted.append(record['name'])
    return omitted


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--packet', type=Path, default=HERE)
    parser.add_argument('--baseline', type=Path)
    parser.add_argument('--out', type=Path)
    args = parser.parse_args()
    checks = []; notes = []
    def check(label, fn):
        try:
            result = fn(); checks.append({'name':label, 'status':'passed'}); return result
        except Exception as exc:
            checks.append({'name':label, 'status':'failed', 'message':str(exc)}); return None
    def rejects(label, fn):
        def run():
            try: fn()
            except (ValueError, KeyError, TypeError): return
            raise ValueError('Invalid packet mutation was accepted')
        return check(label, run)
    data = {}
    for name in FILES:
        result = check(f'strict JSON: {name}', lambda name=name: strict_json((args.packet/name).read_text(encoding='utf-8')))
        if result is not None: data[name] = result
    if len(data) == len(FILES):
        baseline_result = check('rebuild exact baseline in memory', lambda: load_baseline(data, args.baseline))
        entities, historical_context = baseline_result if baseline_result else ([], None)
        build_context = check('rebuild current declared validation base with its exact builder and inputs', lambda: validation_context(data))
        check('claim/source/entity provenance and explicit unknowns', lambda: check_provenance(data))
        check('event-specific round/transaction participants, exact roles and no inferred investor edges', lambda: check_participations(data, entities))
        unknown_years = check('production projection preserves unknowns, conflicts and date precision', lambda: check_projection(data))
        founder_count = check('identity normalization, aliases, domains and baseline deduplication', lambda: check_normalization(data, entities))
        page_count = check('coverage equations and exact resume without overlap', lambda: check_coverage(data))
        def node_validation():
            result = subprocess.run(['node', str(args.packet/'validate_records.mjs'), '--packet', str(args.packet)], cwd=REPO, text=True, capture_output=True)
            parsed = strict_json(result.stdout)
            require(result.returncode == 0 and parsed['checks_failed'] == 0, json.dumps(parsed, ensure_ascii=False))
            return parsed
        node_report = check('actual production record validator and rejection probes', node_validation)
        graph_snapshot = {}
        if build_context:
            def merged_graph():
                module, graph_args, before = build_context
                combined = copy.deepcopy(graph_args)
                combined[-1]['startups'].extend(copy.deepcopy(data['records.json']['startups']))
                graph = module.build_graph(*combined)
                startups = [e for e in graph['entities'] if e['kind'] == 'startup']
                before_startups = sum(e['kind']=='startup' for e in before['entities'])
                require(len(startups) == before_startups+len(data['records.json']['startups']), 'Combined graph loses or merges startup identities')
                baseline_ids = {e['id'] for e in before['entities']}
                require(baseline_ids.issubset({e['id'] for e in graph['entities']}), 'Combined graph removes existing identities')
                require(len(graph['funding_rounds']) == len(before['funding_rounds']) + sum(len(r.get('funding_rounds',[])) for r in data['records.json']['startups']), 'Combined graph loses funding events')
                omitted = check_graph_founding(graph, data['records.json']['startups'])
                graph_snapshot.update(graph)
                notes.append({'integration_verification':'The declared current validation baseline preserves all absent founding years. This tests source behavior; no production graph or live release was written.', 'omitted_founding_year_company_names':omitted, 'conflict_or_unknown_founding_subset':unknown_years})
                return {'research_base_revision':data['manifest.json']['base_revision'], 'validation_base_revision':data['manifest.json'].get('validation_base_revision',data['manifest.json']['base_revision']), 'historical_baseline_entity_sha256':digest(entities), 'current_baseline_entity_sha256':digest(before['entities']), 'entities':len(graph['entities']), 'startups':len(startups), 'funding_rounds':len(graph['funding_rounds']), 'omitted_founding_years_preserved':len(omitted)}
            graph_report = check('combined graph preserves identities and event IDs without writing generated files', merged_graph)
        else:
            graph_report = None
        rejects('reject duplicate JSON keys', lambda: strict_json('{"name":"A","name":"B"}'))
        rejects('reject nonfinite JSON numbers', lambda: strict_json('{"amount":NaN}'))
        def wrong_source():
            changed = copy.deepcopy(data); item=next(c for c in changed['claims.json']['claims'] if c['status']=='reviewed_staged')
            item['source_url']='https://example.com/not-the-recorded-source'; check_provenance(changed)
        rejects('reject claim/source URL rebinding', wrong_source)
        def blocked_fact():
            changed=copy.deepcopy(data); item=next(c for c in changed['claims.json']['claims'] if c['status']=='reviewed_staged')
            source=next(s for s in changed['sources.json']['sources'] if s['id']==item['source_id']);source['accessed']=False;check_provenance(changed)
        rejects('reject failed source promoted to reviewed fact', blocked_fact)
        def unknown_zero():
            changed=copy.deepcopy(data); comps={c['name']:c for c in changed['companies.json']['companies']}
            for record in changed['records.json']['startups']:
                events={event_id(e):e for e in comps[record['name']]['events']}
                for event in record.get('funding_rounds',[]):
                    if events[event['id']].get('amount') is None:
                        event['amount']=0;event['currency']='EUR';check_projection(changed);return
            raise RuntimeError('No real unknown-amount fixture available')
        rejects('reject unknown financing converted to zero', unknown_zero)
        def graph_invented_year():
            require(graph_snapshot, 'Current combined graph fixture unavailable')
            changed=copy.deepcopy(graph_snapshot)
            record=next(r for r in data['records.json']['startups'] if 'founded_year' not in r)
            entity=next(e for e in changed['entities'] if e['id']=='startup:'+slug(record['name']))
            entity['founded_year']=0
            check_graph_founding(changed,data['records.json']['startups'])
        rejects('reject downstream graph inventing zero for an omitted founding year', graph_invented_year)
        def wrong_participant():
            changed=copy.deepcopy(data)
            for company in changed['companies.json']['companies']:
                for event in company['events']:
                    if event.get('participants'):
                        event['participants'][0]['event_id']='unrelated-event';check_participations(changed, entities);return
        rejects('reject participant reattached to a different event', wrong_participant)
        def portfolio_participant():
            changed=copy.deepcopy(data)
            for company in changed['companies.json']['companies']:
                for event in company['events']:
                    if event.get('participants'):
                        event['participants'][0]['basis']='portfolio_membership';check_participations(changed, entities);return
        rejects('reject general portfolio basis as a round participation', portfolio_participant)
        def wrong_participant_type():
            changed=copy.deepcopy(data)
            item=next(c for c in changed['claims.json']['claims'] if c['field']=='transaction_participant')
            item['field']='round_participant';check_participations(changed, entities)
        rejects('reject transaction participant relabeled as funding-round participant', wrong_participant_type)
        def wrong_participant_role():
            changed=copy.deepcopy(data)
            for company in changed['companies.json']['companies']:
                for event in company['events']:
                    if event.get('participants'):
                        event['participants'][0]['role']='unsupported_role_change';check_participations(changed, entities);return
        rejects('reject participant role changed without a matching claim', wrong_participant_role)
        def nonfunding_projection():
            changed=copy.deepcopy(data); sources={s['id']:s for s in changed['sources.json']['sources']}
            for company in changed['companies.json']['companies']:
                for event in company['events']:
                    if event.get('transaction_kind') in NON_FUNDING_TRANSACTIONS:
                        record=next(r for r in changed['records.json']['startups'] if r['name']==company['name'])
                        record.setdefault('funding_rounds',[]).append({'id':event_id(event),'stage':'Funding','source':sources[next(iter(source_ids(event)))]['url']})
                        check_projection(changed);return
            raise RuntimeError('No retained nonfunding transaction fixture available')
        rejects('reject acquisition or secondary transaction projected as company financing', nonfunding_projection)
        queue=data['coverage.json']['next_source_queue'];revision=data['manifest.json']['base_revision'];_, cursor=page_queue(queue,revision,7)
        require(cursor is not None, 'Expected multi-page resume fixture')
        rejects('reject cursor after revision change', lambda: page_queue(queue,'0'*40,7,cursor))
        rejects('reject cursor after page-size change', lambda: page_queue(queue,revision,8,cursor))
        changed_queue=copy.deepcopy(queue);changed_queue[0]['state']='changed-since-checkpoint'
        rejects('reject cursor after queue-state change', lambda: page_queue(changed_queue,revision,7,cursor))
        def reordered_queue():
            changed=copy.deepcopy(data);changed['coverage.json']['next_source_queue'].reverse();check_coverage(changed)
        rejects('reject unsorted/changed queue with stale fingerprint', reordered_queue)
        def changed_count():
            changed=copy.deepcopy(data);changed['coverage.json']['counts']['accepted']+=1;check_coverage(changed)
        rejects('reject unsupported coverage total', changed_count)
    else:
        node_report=graph_report=None; founder_count=page_count=None
    report={'validation_kind':'offline_country_evidence_packet','checked_at':datetime.now(timezone.utc).isoformat(),'checks_passed':sum(c['status']=='passed' for c in checks),'checks_failed':sum(c['status']=='failed' for c in checks),'checks':checks,'records_validation':node_report,'combined_in_memory_graph':graph_report,'distinct_projected_founder_names':founder_count,'resume_pages_tested':page_count,'input_sha256':{name:hashlib.sha256((args.packet/name).read_bytes()).hexdigest() for name in FILES if (args.packet/name).exists()},'notes':notes,'limitations':['Structural and cross-file checks do not prove that source passages are factually complete or truthful.','Event source and claim linkage are tested; semantic evidence review remains a separate review receipt.','No network, crawler run, source approval, production record write or generated graph write is performed.','Hashes identify bytes, not source authenticity or publication.']}
    if args.out:
        args.out.parent.mkdir(parents=True,exist_ok=True);args.out.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(report,ensure_ascii=False,indent=2))
    return 1 if report['checks_failed'] else 0

if __name__=='__main__':
    sys.exit(main())
