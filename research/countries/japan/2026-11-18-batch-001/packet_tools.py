"""Offline checks for this Japan research packet; no crawler or publication writes."""
from __future__ import annotations
import copy
import datetime as dt
import hashlib
import json
import re
import unicodedata
from pathlib import Path
from urllib.parse import unquote, urlsplit

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
STATES = {'accepted', 'alumni', 'held', 'rejected'}
NUMERIC_INSTRUMENTS = {'equity', 'new_share_allotment'}
NUMERIC_PRECISIONS = {'reported', 'exact'}
NUMERIC_SCOPES = {
    'event_total', 'round_at_announcement', 'primary_component',
    'named_investor_contribution', 'incremental', 'incremental_amount',
}
OVERLAP_STATES = {'no_known_overlap', 'overlapping_total', 'incremental', 'unknown'}

def digest(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True,
                                      separators=(',', ':')).encode()).hexdigest()

def normalized_name(value):
    if not isinstance(value, str) or not value.strip():
        raise ValueError('name must be nonempty text')
    return ' '.join(unicodedata.normalize('NFKC', value).casefold().split())

def slug(value):
    value = unicodedata.normalize('NFKD', value).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', '-', value).strip('-')

def normalized_host(value):
    parts = urlsplit(value)
    if parts.scheme != 'https' or not parts.hostname or parts.username or parts.password:
        raise ValueError('public HTTPS URL required')
    if parts.port not in (None, 443) or parts.hostname.endswith('.'):
        raise ValueError('nonstandard or ambiguous host')
    host = parts.hostname.encode('idna').decode().lower()
    if '.' not in host or ':' in host or re.fullmatch(r'[0-9.]+', host):
        raise ValueError('public DNS hostname required')
    if any(host.endswith('.' + x) for x in ('local', 'internal', 'test', 'invalid')):
        raise ValueError('nonpublic hostname')
    path = parts.path
    for _ in range(4):
        path = unquote(path)
    if 'robots.txt' in [x.casefold() for x in path.split('/')]:
        raise ValueError('excluded source path')
    return host[4:] if host.startswith('www.') else host

def valid_partial_date(value, precision):
    if value is None:
        if precision != 'unknown':
            raise ValueError('null date requires unknown precision')
        return
    patterns = {'year': r'\d{4}', 'month': r'\d{4}-\d{2}', 'day': r'\d{4}-\d{2}-\d{2}'}
    if precision not in patterns or not re.fullmatch(patterns[precision], value):
        raise ValueError('date does not match precision')
    padded = value + ('-01-01' if precision == 'year' else '-01' if precision == 'month' else '')
    dt.date.fromisoformat(padded)

def evidence_refs(item, sources):
    refs = item.get('source_ids')
    if not isinstance(refs, list) or not refs or len(set(refs)) != len(refs):
        raise ValueError('nonempty distinct source references required')
    for key in refs:
        if key not in sources or sources[key].get('accessed') is not True:
            raise ValueError('claim source is absent or was not accessed')

def validate_numeric_projection(value):
    """Keep a review flag from overriding the evidence's amount semantics."""
    if type(value.get('numeric_projection_allowed')) is not bool:
        raise ValueError('numeric projection permission must be an explicit boolean')
    for field in ('transaction_kind', 'amount_precision', 'amount_scope'):
        if not isinstance(value.get(field), str) or not value[field].strip():
            raise ValueError('funding amount semantics must be explicit')
    if value.get('overlap_status') not in OVERLAP_STATES:
        raise ValueError('funding overlap status must be explicit')
    if not value['numeric_projection_allowed']:
        return
    if (value.get('amount') is None
            or value['transaction_kind'] not in NUMERIC_INSTRUMENTS
            or value['amount_precision'] not in NUMERIC_PRECISIONS
            or value['amount_scope'] not in NUMERIC_SCOPES
            or value['overlap_status'] not in {'no_known_overlap', 'incremental'}):
        raise ValueError('unsafe numeric projection: requires exact non-overlapping equity with explicit scope')

def validate_packet(packet):
    if packet.get('packet_kind') != 'japan-country-research-v1':
        raise ValueError('wrong packet kind')
    if packet.get('delivery_state') not in ('unsubmitted', 'proposed'):
        raise ValueError('staged research cannot claim publication')
    if not re.fullmatch(r'[0-9a-f]{40}', packet.get('base_revision', '')):
        raise ValueError('exact base revision required')
    sources = {s['id']: s for s in packet['sources']}
    if len(sources) != len(packet['sources']):
        raise ValueError('duplicate source IDs')
    for source in sources.values():
        normalized_host(source['url'])
        if source.get('crawler_seed_approved') is not False:
            raise ValueError('research is not source approval')
        stamp = dt.datetime.fromisoformat(source['retrieved_at'].replace('Z', '+00:00'))
        if stamp.tzinfo is None:
            raise ValueError('source time requires timezone')
    companies = packet['companies']
    if not 1 <= len(companies) <= 50:
        raise ValueError('batch must contain 1 to 50 reviewed companies')
    ids, names, hosts, event_ids = set(), set(), set(), set()
    claim_ids = set()
    for company in companies:
        if company['disposition'] not in STATES or not company.get('disposition_reason'):
            raise ValueError('explicit review disposition required')
        key = company['id']
        if key in ids:
            raise ValueError('duplicate company ID')
        ids.add(key)
        if not slug(company['name']) or key != 'staged:jp:' + slug(company['name']):
            raise ValueError('unstable company ID')
        name, host = normalized_name(company['name']), normalized_host(company['website'])
        if name in names or host in hosts:
            raise ValueError('duplicate candidate name/domain needs identity review')
        names.add(name); hosts.add(host)
        if company.get('incorporation') is not None:
            evidence_refs(company['incorporation'], sources)
        for claim in company['claims']:
            if claim['id'] in claim_ids:
                raise ValueError('duplicate claim ID')
            claim_ids.add(claim['id'])
            evidence_refs(claim, sources)
            if not claim.get('evidence') or claim.get('status') not in ('reviewed_staged', 'conflict'):
                raise ValueError('claim lacks review evidence')
            field, value = claim['field'], claim['value']
            if field == 'founded':
                valid_partial_date(value['date'], value['precision'])
            if field != 'funding_round':
                continue
            if value['id'] in event_ids:
                raise ValueError('duplicate event ID')
            event_ids.add(value['id'])
            valid_partial_date(value['date'], value['date_precision'])
            amount, currency = value['amount'], value['currency']
            if (amount is None) != (currency is None):
                raise ValueError('unknown amount and currency must both be null')
            if amount is not None and (type(amount) is not int or amount <= 0 or not re.fullmatch(r'[A-Z]{3}', currency)):
                raise ValueError('amount must be positive integer with stated currency')
            validate_numeric_projection(value)
            seen_participants = set()
            for participant in value['participants']:
                evidence_refs(participant, sources)
                if participant['round_id'] != value['id']:
                    raise ValueError('participant not bound to its event')
                if participant['basis'] != 'explicit_event_announcement':
                    raise ValueError('portfolio membership cannot establish round participation')
                if participant['canonical_entity_id'] is not None:
                    raise ValueError('canonical investor links require separate identity review')
                if participant['role'] not in ('lead', 'co-lead', 'participant', 'lender', 'unspecified'):
                    raise ValueError('unsupported event role')
                pname = normalized_name(participant['name'])
                if pname in seen_participants:
                    raise ValueError('duplicate participant')
                seen_participants.add(pname)
    return {'companies': len(companies), 'sources': len(sources), 'claims': len(claim_ids), 'events': len(event_ids)}

def checkpoint(packet, completed_ids):
    """Deterministic handoff bookmark over this packet, not a crawler cursor."""
    population = [c['id'] for c in packet['companies']]
    completed = sorted(set(completed_ids))
    if len(completed) != len(completed_ids) or not set(completed) <= set(population):
        raise ValueError('invalid completed research IDs')
    return {'version': 1, 'binding': digest(packet), 'base_revision': packet['base_revision'],
            'population': population, 'completed_ids': completed,
            'remaining_ids': [x for x in population if x not in completed],
            'country_complete': False, 'national_denominator': None}

def resume(packet, bookmark):
    if bookmark['binding'] != digest(packet) or bookmark['base_revision'] != packet['base_revision']:
        raise ValueError('checkpoint belongs to different input or source revision')
    expected = checkpoint(packet, bookmark['completed_ids'])
    if expected != bookmark:
        raise ValueError('checkpoint state was modified')
    return expected['remaining_ids']

def check_sources(packet, ledger):
    sources = {s['id']: s for s in packet['sources']}
    expected, canonical_ids = {}, set()
    for company in packet['companies']:
        for claim in company['claims']:
            if claim['id'] in canonical_ids:
                raise ValueError('duplicate canonical claim ID')
            canonical_ids.add(claim['id'])
            evidence_refs(claim, sources)
            for source_id in claim['source_ids']:
                row_id = claim['id'] + ':source:' + source_id
                if row_id in expected:
                    raise ValueError('ambiguous ledger claim ID')
                expected[row_id] = {
                    'canonical_claim_id': claim['id'], 'claim_id': row_id,
                    'entity_id': company['id'], 'field': claim['field'],
                    'value': claim['value'], 'source_id': source_id,
                    'source_url': sources[source_id]['url'],
                    'evidence': claim['evidence'], 'status': claim['status'],
                }
    if not isinstance(ledger.get('claims'), list):
        raise ValueError('claim ledger must contain assertion rows')
    seen = set()
    for assertion in ledger['claims']:
        row_id = assertion.get('claim_id')
        if row_id not in expected:
            raise ValueError('unknown or fabricated ledger claim ID')
        if row_id in seen:
            raise ValueError('duplicate ledger assertion')
        seen.add(row_id)
        for field, value in expected[row_id].items():
            # Canonical JSON comparison also distinguishes true from 1 and
            # explicit null from an absent key; Python equality alone does not.
            if field not in assertion or digest(assertion[field]) != digest(value):
                label = 'source URL' if field == 'source_url' else field
                raise ValueError(f'ledger {label} drift')
    if seen != set(expected):
        raise ValueError('claim ledger lost an assertion or source binding')

if __name__ == '__main__':
    packet = json.loads((HERE / 'companies.json').read_text())
    ledger = json.loads((HERE / 'claims.json').read_text())
    stats = validate_packet(packet)
    check_sources(packet, ledger)
    coverage = json.loads((HERE / 'coverage.json').read_text())
    resume(packet, coverage['checkpoint'])
    print(json.dumps({'result': 'passed', **stats}, sort_keys=True))
