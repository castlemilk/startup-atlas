#!/usr/bin/env python3
"""Offline validation of this bounded research packet, never a publisher.

Uses the repository's actual Node validator for legacy records and, when present,
jsonschema for the six sidecar envelopes. Semantic checks use only the standard
library. No network, private skills, crawler, credentials or database are used.
"""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from datetime import date, datetime, timezone
import hashlib
import ipaddress
import json
from pathlib import Path, PurePosixPath
import re
import subprocess
import sys
import unicodedata
from urllib.parse import unquote, urlsplit

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[3]
OWNED_PATH = 'research/countries/ch/2026-11-18-batch-001/'
ACCEPTED = 'accepted_staged_candidate'
EXCLUDED = 'excluded_from_independent_swiss_candidate_batch'
FILES = (
    'manifest.json', 'companies.staged.json', 'claims.json', 'sources.json',
    'funding.staged.json', 'records.staged.json', 'projection-map.json',
    'queue.json', 'coverage.json', 'deduplication.json', 'baseline.json',
    'baseline-planner.json', 'ecosystem-claims.json', 'access-log.json',
)
SCHEMA_FILES = (
    'companies.staged.json', 'claims.json', 'sources.json',
    'funding.staged.json', 'projection-map.json', 'queue.json',
)
BASELINE_INPUTS = (
    'data/partner-profiles.json', 'data/partner-leads.json',
    'data/partners-reviewed.json', 'data/catalogue.json',
    'data/startup-research.json', 'data/company-profile-seeds.csv',
)
CLAIM_STATES = {
    'reviewed_staged', 'conflict', 'unsearched', 'searched_unknown',
    'blocked', 'rejected', 'candidate', 'not_applicable',
}
SOURCE_KINDS = {'primary_company', 'primary_investor', 'regulatory', 'secondary', 'discovery'}
# This bounded packet reports numeric financing in these two ISO 4217 currencies.
# New original currencies require an explicit review of the packet contract.
NUMERIC_CURRENCIES = {'CHF', 'USD'}
EMPTY_STATES = {'unsearched', 'searched_unknown', 'blocked', 'not_applicable'}
FOUNDING_FIELDS = {'founded', 'founded_date', 'founded_year'}


def normalize_name(value):
    ascii_name = unicodedata.normalize('NFKD', value).encode('ascii', 'ignore').decode()
    return re.sub(r'[^a-z0-9]+', '-', ascii_name.lower()).strip('-')


def normalized_domain(value):
    if not isinstance(value, str):
        return ''
    parsed = urlsplit(value if '://' in value else 'https://' + value)
    return (parsed.hostname or '').lower().removeprefix('www.').rstrip('.')


def canonical_hash(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False,
                                    separators=(',', ':')).encode()).hexdigest()


def date_valid(value):
    try:
        return isinstance(value, str) and date.fromisoformat(value).isoformat() == value
    except (TypeError, ValueError):
        return False


def timestamp_valid(value):
    try:
        return isinstance(value, str) and datetime.fromisoformat(value.replace('Z', '+00:00')).tzinfo is not None
    except (TypeError, ValueError):
        return False


def https_public(value):
    if not isinstance(value, str):
        return False
    try:
        u = urlsplit(value)
        if u.scheme != 'https' or not u.hostname or u.username or u.password:
            return False
        host = u.hostname.lower()
        if host == 'localhost' or host.endswith(('.localhost', '.local')):
            return False
        try:
            if not ipaddress.ip_address(host).is_global:
                return False
        except ValueError:
            if '.' not in host:
                return False
        path = u.path
        for _ in range(3):
            path = unquote(path)
        return 'robots.txt' not in path.lower().split('/')
    except ValueError:
        return False


def safe_relative(value):
    return (isinstance(value, str) and value and not value.startswith('/')
            and '\\' not in value and '..' not in PurePosixPath(value).parts)


def source_refs(value):
    """Find explicit source IDs and URLs, including supporting provenance."""
    refs = set()
    if isinstance(value, dict):
        for key, child in value.items():
            if key in {'source_id', 'source_url', 'currency_source_url'} and isinstance(child, str):
                refs.add(child)
            if key in {'source_ids', 'supporting_source_ids', 'supporting_source_urls'} and isinstance(child, list):
                refs.update(x for x in child if isinstance(x, str))
            refs.update(source_refs(child))
    elif isinstance(value, list):
        for child in value:
            refs.update(source_refs(child))
    return refs


def load_packet(packet_dir=HERE, repo_root=REPO):
    """Load only fixed local inputs. Reject symlinks and arbitrary manifest paths."""
    packet_dir = Path(packet_dir)
    if packet_dir.is_symlink():
        raise ValueError('Packet directory may not be a symlink')
    bundle = {}
    for name in FILES:
        path = packet_dir / name
        if path.is_symlink() or path.resolve().parent != packet_dir.resolve():
            raise ValueError(f'Unsafe packet file: {name}')
        bundle[name] = json.loads(path.read_text(encoding='utf-8'))
    schema = packet_dir / 'packet.schema.json'
    if schema.exists():
        if schema.is_symlink():
            raise ValueError('Schema may not be a symlink')
        bundle['packet.schema.json'] = json.loads(schema.read_text(encoding='utf-8'))
    repo_root = Path(repo_root)
    overlay = repo_root / 'data/startup-research.json'
    bundle['_overlay'] = json.loads(overlay.read_text(encoding='utf-8'))
    bundle['_actual_input_hashes'] = {
        name:hashlib.sha256((repo_root / name).read_bytes()).hexdigest()
        for name in BASELINE_INPUTS
    }
    bundle['_repo_root'] = str(repo_root.resolve())
    bundle['_packet_dir'] = str(packet_dir.resolve())
    return bundle


def validate_legacy(document):
    process = subprocess.run(
        ['node', str(HERE / 'validate_legacy.mjs'), '--stdin'],
        input=json.dumps(document, ensure_ascii=False), text=True,
        capture_output=True, timeout=30, check=False,
    )
    try:
        result = json.loads(process.stdout)
    except json.JSONDecodeError:
        return {'valid':False, 'errors':[{'message':process.stderr.strip() or 'Node validator returned invalid JSON'}]}
    if process.returncode and result.get('valid'):
        return {'valid':False, 'errors':[{'message':'Node validator exited unsuccessfully'}]}
    return result


def validate_packet(bundle, *, check_schema=True, check_legacy=True, changed_paths=None):
    errors, checks = [], []

    def require(condition, code, location, message):
        if not condition:
            errors.append({'code':code, 'location':location, 'message':message})
        return bool(condition)

    def index(rows, key, label):
        answer = {}
        for row in rows:
            identifier = row.get(key)
            require(isinstance(identifier, str) and bool(identifier), 'IDENTIFIER', label, f'Missing {key}')
            require(identifier not in answer, 'DUPLICATE_ID', label, f'Duplicate {identifier}')
            answer[identifier] = row
        return answer

    def precision(value, granularity, location, allow_unknown=True):
        if value is None:
            require(allow_unknown and granularity in {None, 'unknown'}, 'DATE_PRECISION', location,
                    'Unknown date needs null/unknown precision, not a fabricated date')
            return
        valid = False
        if granularity == 'year':
            valid = isinstance(value, str) and bool(re.fullmatch(r'\d{4}', value)) and 1800 <= int(value) <= 2100
        elif granularity == 'month':
            valid = isinstance(value, str) and bool(re.fullmatch(r'\d{4}-\d{2}', value)) and date_valid(value + '-01')
        elif granularity == 'day':
            valid = date_valid(value)
        require(valid, 'DATE_PRECISION', location, f'Date {value!r} does not match precision {granularity!r}')

    def money(value, location, currency_key='currency', amount_key='amount'):
        amount, currency = value.get(amount_key), value.get(currency_key)
        if amount is None:
            require(currency is None, 'MONEY_PAIR', location, 'Unknown amount must not carry an invented currency')
            return
        require(type(amount) is int and amount > 0, 'UNKNOWN_ZERO', location,
                'Financing amount must be a positive integer; unknown is null, never zero')
        require(currency in NUMERIC_CURRENCIES, 'MONEY_PAIR', location,
                'Numeric financing requires an explicit supported ISO currency (CHF or USD)')

    manifest = bundle['manifest.json']
    companies = bundle['companies.staged.json']['companies']
    claims = bundle['claims.json']['claims']
    sources = bundle['sources.json']['sources']
    events = bundle['funding.staged.json']['events']
    records = bundle['records.staged.json']['startups']
    projections = bundle['projection-map.json']['records']
    ecosystem = bundle['ecosystem-claims.json']['claims']
    queue = bundle['queue.json']
    baseline = bundle['baseline.json']
    dedup = bundle['deduplication.json']
    company_by_id = index(companies, 'entity_id', 'companies')
    claim_by_id = index(claims, 'claim_id', 'claims')
    source_by_id = index(sources, 'source_id', 'sources')
    source_by_url = index(sources, 'url', 'sources')
    event_by_id = index(events, 'event_id', 'events')
    ecosystem_by_id = index(ecosystem, 'claim_id', 'ecosystem')
    accepted = {c['entity_id'] for c in companies if c['disposition'] == ACCEPTED}
    excluded = {c['entity_id'] for c in companies if c['disposition'] == EXCLUDED}

    # Scope is constrained independently of evidence validity.
    require(manifest.get('owned_path') == OWNED_PATH, 'FILE_SCOPE', 'manifest.owned_path', 'Country packet scope must remain fixed')
    require(manifest.get('country_code') == 'CH', 'FILE_SCOPE', 'manifest.country_code', 'This validator owns only Switzerland')
    for key in ('checksums_file', 'validation_file'):
        value = manifest.get(key)
        require(safe_relative(value) and len(PurePosixPath(value).parts) == 1,
                'FILE_SCOPE', 'manifest.' + key, 'Output reference must be a local basename')
    for key in ('schema_api_changes', 'crawler_changes', 'seed_approvals', 'production_release_performed', 'mcp_deployment'):
        require(manifest.get(key) is False, 'PUBLICATION_SCOPE', 'manifest.' + key, 'This packet cannot authorize implementation or publication')
    require(manifest.get('manual_deployments') == 0 and manifest.get('existing_pr_automation_not_modified') is True,
            'PUBLICATION_SCOPE', 'manifest', 'No manual deployment or PR automation change belongs to this packet')
    require(manifest.get('production_records_changed') == 0, 'PUBLICATION_SCOPE', 'manifest', 'No production records may be changed')
    require(manifest.get('publication_state') == 'staged_research_files_only', 'PUBLICATION_SCOPE', 'manifest', 'Staging state changed')
    for path in changed_paths or []:
        require(safe_relative(path) and path.startswith(OWNED_PATH), 'FILE_SCOPE', path, 'Changed file is outside country-owned path')
    for name in SCHEMA_FILES:
        document = bundle[name]
        require(document.get('run_id') == manifest['run_id'] and document.get('country_code') == 'CH'
                and document.get('as_of') == manifest['as_of'], 'ENVELOPE', name, 'Run/country/date mismatch')
    require(date_valid(manifest['as_of']), 'DATE', 'manifest.as_of', 'Invalid review date')
    checks.append('country scope and staged-only envelope')

    if check_schema and 'packet.schema.json' in bundle:
        try:
            from jsonschema import Draft202012Validator, FormatChecker
            Draft202012Validator.check_schema(bundle['packet.schema.json'])
            validator = Draft202012Validator(bundle['packet.schema.json'], format_checker=FormatChecker())
            for name in SCHEMA_FILES:
                for error in validator.iter_errors(bundle[name]):
                    errors.append({'code':'JSON_SCHEMA', 'location':name + '/' + '/'.join(map(str, error.path)), 'message':error.message})
            checks.append('six JSON Schema envelopes with format checking')
        except ImportError:
            errors.append({'code':'DEPENDENCY', 'location':'packet.schema.json', 'message':'Install jsonschema to validate the present sidecar schema'})
        except Exception as error:
            errors.append({'code':'JSON_SCHEMA', 'location':'packet.schema.json', 'message':str(error)})

    # Registry rows can be unreadable; reviewed claim bindings cannot.
    for source in sources:
        sid = source['source_id']
        require(https_public(source.get('url')), 'SOURCE_URL', sid, 'Source must be a public HTTPS URL without credentials or robots path')
        require(source.get('canonical_source_id') == sid, 'SOURCE_CANONICAL', sid, 'Canonical source ID must resolve to this unique URL row')
        require(source.get('crawler_seed_approved') is False, 'SOURCE_APPROVAL', sid, 'Discovery cannot approve a crawler seed')
        require(type(source.get('accessed')) is bool, 'SOURCE_ACCESS', sid, 'Access state must be explicit')
        require(date_valid(source.get('retrieved_on')), 'DATE', sid, 'Source retrieval day is required')
        if source.get('published_on') is not None:
            precision(source['published_on'], source.get('published_on_precision', 'day'),
                      sid + '.published_on', allow_unknown=False)
        for cid in source.get('claim_ids', []):
            claim = claim_by_id.get(cid)
            require(claim is not None, 'CLAIM_REF', sid, f'Unknown backlink {cid}')
            if claim:
                refs = source_refs(claim)
                require(sid in refs or source['url'] in refs, 'SOURCE_BACKLINK', sid, f'Claim {cid} does not cite this primary/supporting source')
        for cid in source.get('ecosystem_claim_ids', []):
            claim = ecosystem_by_id.get(cid)
            require(claim is not None, 'CLAIM_REF', sid, f'Unknown ecosystem backlink {cid}')
            if claim:
                require(any(ref.get('source_id') == sid and ref.get('url') == source['url'] for ref in claim['sources']),
                        'SOURCE_BACKLINK', sid, f'Ecosystem claim {cid} does not cite source')

    def binding(claim, location):
        sid, url = claim.get('source_id'), claim.get('source_url')
        source = source_by_id.get(sid)
        require(source is not None, 'SOURCE_MISSING', location, f'Missing source {sid}')
        if source:
            require(url == source['url'], 'SOURCE_BINDING', location, 'Claim URL differs from registered source URL')
            require(source.get('accessed') is True and claim.get('accessed') is True,
                    'SOURCE_ACCESS', location, 'Retained evidence requires an accessed source, not a snippet or failed page')
            require(claim.get('source_kind') == source.get('source_kind'), 'SOURCE_KIND', location, 'Claim and source kinds disagree')
            require(claim['claim_id'] in source.get('claim_ids', []), 'SOURCE_BACKLINK', location, 'Source lacks claim backlink')
        require(claim.get('source_kind') in SOURCE_KINDS - {'discovery'}, 'SOURCE_KIND', location, 'Discovery alone is not reviewed evidence')
        for key in ('evidence', 'rationale', 'acquisition'):
            require(isinstance(claim.get(key), str) and bool(claim[key].strip()), 'PROVENANCE', location, f'Missing {key}')
        require(timestamp_valid(claim.get('retrieved_at')), 'DATE', location, 'Timezone-bearing retrieval timestamp required')
        require(timestamp_valid(claim.get('reviewed_at')), 'DATE', location, 'Timezone-bearing review timestamp required')
        for key in ('published_on', 'effective_on'):
            require(key in claim and (claim[key] is None or date_valid(claim[key])), 'DATE', location, f'{key} must be date or explicit null')
        for ref in source_refs(claim) - {sid, url}:
            linked = source_by_id.get(ref) or source_by_url.get(ref)
            require(linked is not None, 'SOURCE_MISSING', location, f'Missing supporting source {ref}')
            if linked:
                require(linked.get('accessed') is True, 'SOURCE_ACCESS', location, 'Supporting source was not accessed')

    for claim in claims:
        cid, state, field, value = claim['claim_id'], claim['status'], claim['field'], claim['value']
        require(claim.get('entity_id') in company_by_id, 'COMPANY_REF', cid, 'Unknown company')
        require(state in CLAIM_STATES, 'CLAIM_STATE', cid, 'Unknown claim state')
        require(claim.get('publication_state') == 'unsubmitted', 'PUBLICATION_SCOPE', cid, 'Claim must remain unsubmitted')
        if state in {'reviewed_staged', 'conflict', 'candidate'}:
            require(value is not None, 'NULL_VALUE', cid, 'Retained claim cannot have a null value')
            binding(claim, cid)
        elif state in EMPTY_STATES:
            require(value is None, 'UNKNOWN_ZERO', cid, 'Unknown/unsearched fields must stay null, not zero or a fabricated value')
        if state == 'searched_unknown':
            require(bool(claim.get('search_log')), 'PROVENANCE', cid, 'Searched-unknown needs a search log')
        if isinstance(value, dict) and 'company_id' in value:
            require(value['company_id'] == claim['entity_id'], 'COMPANY_REF', cid, 'Claim company binding disagrees')
        if field in FOUNDING_FIELDS and state in {'reviewed_staged', 'conflict'}:
            if field == 'founded_year':
                require(type(value) is int and 1800 <= value <= int(manifest['as_of'][:4]), 'DATE_PRECISION', cid, 'Invalid founding year')
            else:
                precision(value.get('value', value.get('date')), value.get('precision'), cid, allow_unknown=False)
        if field == 'funding_round' and state == 'reviewed_staged':
            money(value, cid)
        if field in {'round_participant', 'funding_currency', 'funding_announcement_date', 'funding_observation'}:
            eid = value.get('event_id') if isinstance(value, dict) else None
            event = event_by_id.get(eid)
            require(event is not None, 'EVENT_REF', cid, f'Unknown event {eid}')
            if event:
                require(event['company_id'] == claim['entity_id'], 'EVENT_COMPANY', cid, 'Event belongs to another company')
            if field == 'funding_currency' and event:
                require(value.get('currency') == event['currency'], 'MONEY_PAIR', cid, 'Currency corroboration contradicts event')
            if field == 'round_participant':
                require(state == 'reviewed_staged', 'PARTICIPATION_EVIDENCE', cid, 'Participation must be a reviewed event-specific claim')
                require(value.get('role') in {'lead', 'participant', 'unspecified'}, 'PARTICIPANT_ROLE', cid, 'Unsupported participant role')
                require(bool(value.get('name')), 'PARTICIPANT_ROLE', cid, 'Participant needs a stated name')
                for key in ('resolved_entity_id', 'canonical_investor_id', 'investor_id'):
                    require(value.get(key) is None, 'CANONICAL_EDGE', cid, 'Investor identities remain unresolved; no canonical edges')
                scope = str(value.get('participation_scope', value.get('relationship_scope', ''))).lower()
                require('portfolio' not in scope, 'PARTICIPATION_EVIDENCE', cid, 'Portfolio membership cannot establish round participation')
                require(not value.get('inferred_from_portfolio', False), 'PARTICIPATION_EVIDENCE', cid, 'Portfolio inference is forbidden')
                require(not re.search(r'portfolio membership only|inferred from portfolio|portfolio[-_ ]only',
                                      claim.get('evidence', ''), re.IGNORECASE),
                        'PARTICIPATION_EVIDENCE', cid, 'Portfolio-only evidence cannot support an event-specific investor claim')
            if field == 'funding_observation':
                require(value.get('additive', value.get('additive_to_later_total')) is False,
                        'TRANCHE_ADDITIVITY', cid, 'Historical/conflicting total must not be additive')
    for claim in ecosystem:
        for ref in claim['sources']:
            source = source_by_id.get(ref.get('source_id'))
            require(source is not None, 'SOURCE_MISSING', claim['claim_id'], 'Unknown ecosystem source')
            if source:
                require(source['url'] == ref.get('url') and source['accessed'] is True,
                        'SOURCE_BINDING', claim['claim_id'], 'Ecosystem source must be accessed and URL-bound')
                require(claim['claim_id'] in source['ecosystem_claim_ids'], 'SOURCE_BACKLINK', claim['claim_id'], 'Missing ecosystem backlink')
    checks.append('all company and ecosystem claims bound to accessed registered sources')

    # Independent identity comparison includes aliases and both pinned inventories.
    seen_names, seen_domains = {}, {}
    baseline_rows = baseline['startup_inventory']
    overlay_rows = bundle['_overlay']['startups']
    baseline_names = {normalize_name(row['name']) for row in baseline_rows + overlay_rows}
    baseline_domains = {normalized_domain(row.get('website', '')) for row in baseline_rows + overlay_rows} - {''}
    dedup_by_company = index(dedup['companies'], 'entity_id', 'deduplication')
    for company in companies:
        eid = company['entity_id']
        names = {normalize_name(company['name'])} | {normalize_name(alias['name']) for alias in company['aliases']}
        domain = normalized_domain(company['canonical_domain'])
        require(bool(domain) and domain == company['canonical_domain'], 'DOMAIN_NORMALIZATION', eid, 'Canonical domain must be normalized')
        require(domain == normalized_domain(company['website']), 'DOMAIN_NORMALIZATION', eid, 'Website and canonical domain differ')
        for name in names:
            require(name not in seen_names or seen_names[name] == eid, 'IDENTITY_COLLISION', eid, f'Name/alias collision: {name}')
            seen_names[name] = eid
        require(domain not in seen_domains or seen_domains[domain] == eid, 'DOMAIN_COLLISION', eid, f'Domain collision: {domain}')
        seen_domains[domain] = eid
        require(not (names & baseline_names) and domain not in baseline_domains, 'BASELINE_DUPLICATE', eid,
                'Company matches pinned Atlas name/alias/domain; cannot stage as a new unmatched identity')
        receipt = dedup_by_company.get(eid)
        require(receipt is not None, 'DEDUP_RECEIPT', eid, 'Missing deduplication receipt')
        if receipt:
            require(set(receipt['normalized_names']) == names and receipt['canonical_domain'] == domain,
                    'DEDUP_RECEIPT', eid, 'Deduplication receipt no longer matches company')
            require(receipt.get('result') == 'no_match' and receipt.get('matches') == [], 'DEDUP_RECEIPT', eid, 'Unresolved baseline duplicate')
        require(company.get('canonical_atlas_id') is None, 'CANONICAL_EDGE', eid, 'No fabricated canonical company ID')
        require(company.get('crawler_seed_approved') is False and company.get('publication_state') == 'unsubmitted',
                'PUBLICATION_SCOPE', eid, 'Company must remain staged and unapproved for crawling')
        actual_claim_ids = {c['claim_id'] for c in claims if c['entity_id'] == eid}
        require(set(company['claim_ids']) == actual_claim_ids, 'COMPANY_CLAIMS', eid, 'Company claim references do not match ledger')
        require(set(company['funding_event_ids']) == {event['event_id'] for event in events if event['company_id'] == eid},
                'EVENT_REF', eid, 'Company event references do not match ledger')
        founded = company['founded']
        precision(founded.get('value'), founded.get('precision'), eid + '.founded')
        conflict = any(c['entity_id'] == eid and c['field'] in FOUNDING_FIELDS and c['status'] == 'conflict' for c in claims)
        if conflict:
            require(founded.get('value') is None and founded.get('status') == 'conflict', 'FOUNDING_CONFLICT', eid, 'Unresolved founding conflict cannot select a value')
        require(company.get('headquarters') is None or isinstance(company['headquarters'], dict),
                'UNKNOWN_ZERO', eid + '.headquarters', 'Unknown geography must be null')
    require(baseline['base_revision'] == manifest['base_revision'] == dedup['base_revision']
            == bundle['baseline-planner.json']['revision'], 'BASE_REVISION', 'baseline', 'Pinned revisions disagree')
    require(len(baseline_rows) == baseline['committed_graph']['startups'] == baseline['built_from_pinned_source']['startups'],
            'BASELINE_COUNT', 'baseline', 'Graph inventory count mismatch')
    require(len(overlay_rows) == baseline['source_overlay_count'] == bundle['baseline-planner.json']['population']['source_records'],
            'BASELINE_COUNT', 'baseline', 'Overlay count mismatch')
    for name, digest in baseline['inputs'].items():
        require(name in BASELINE_INPUTS and digest == bundle['_actual_input_hashes'].get(name),
                'BASELINE_HASH', name, 'Pinned input changed: re-deduplicate and re-checkpoint before resuming')
    require(bundle['baseline-planner.json']['overlay_sha256'] == baseline['inputs']['data/startup-research.json'],
            'BASELINE_HASH', 'baseline-planner', 'Planner overlay hash disagrees')
    checks.append('normalized names/domains/aliases and pinned graph/overlay deduplication')

    # Projected events are faithful views of the retained original assertions.
    participant_ids = set()
    for event in events:
        eid = event['event_id']
        claim = claim_by_id.get(event['claim_id'])
        require(event['company_id'] in company_by_id, 'COMPANY_REF', eid, 'Unknown event company')
        require(claim is not None and claim['field'] == 'funding_round', 'CLAIM_REF', eid, 'Event needs a funding-round claim')
        if claim:
            require(claim['entity_id'] == event['company_id'] and claim['value']['event_id'] == eid,
                    'EVENT_COMPANY', eid, 'Event and source claim identities disagree')
            require(event['original_claim_value'] == claim['value'], 'EVENT_PROJECTION', eid, 'Original claim snapshot differs from ledger')
            require(event['source_id'] == claim['source_id'] and event['source_url'] == claim['source_url'],
                    'SOURCE_BINDING', eid, 'Event provenance differs from source claim')
            for key in ('amount', 'currency', 'announced_on', 'closed_on', 'transaction_kind'):
                require(event.get(key) == claim['value'].get(key), 'EVENT_PROJECTION', eid + '.' + key, 'Event value differs from source claim')
            require(event.get('related_event') == claim['value'].get('relationship_to_event'),
                    'TRANCHE_PROJECTION', eid, 'Related-event assertion was lost or changed in projection')
            require(event.get('components') == claim['value'].get('components'),
                    'TRANCHE_PROJECTION', eid, 'Tranche components differ from source assertion')
        money(event, eid)
        precision(event.get('announced_on'), event.get('announcement_date_precision'), eid + '.announced_on')
        precision(event.get('closed_on'), event.get('close_date_precision'), eid + '.closed_on')
        require(event.get('production_investor_edges_created') is False, 'CANONICAL_EDGE', eid, 'Production investor edges are forbidden')
        relation = event.get('related_event')
        if relation:
            target = event_by_id.get(relation.get('event_id'))
            require(target is not None and target['event_id'] != eid, 'TRANCHE_REF', eid, 'Related event missing or self-referential')
            if target:
                require(target['company_id'] == event['company_id'], 'TRANCHE_COMPANY', eid, 'Tranche must reference the same company')
        if event.get('components'):
            for component in event['components']:
                money(component, eid + '.components')
                require(component.get('currency') == event['currency'], 'TRANCHE_CURRENCY', eid, 'Components must share reported currency')
            if event.get('amount_measure') == 'round_total':
                require(sum(x['amount'] for x in event['components']) == event['amount'], 'TRANCHE_TOTAL', eid, 'Components disagree with total')
        if event.get('transaction_kind') == 'debt_facility':
            require(event.get('amount_measure') == 'facility_capacity' and event.get('amount_precision') == 'upper_bound'
                    and event.get('funds_drawn') is None, 'FACILITY_CAPACITY', eid, 'Capacity must not become cash drawn or equity')
        for participant in event['participants']:
            pid = participant['claim_id']
            require(pid not in participant_ids, 'PARTICIPANT_DUPLICATE', eid, 'Participation duplicated across events')
            participant_ids.add(pid)
            pclaim = claim_by_id.get(pid)
            require(pclaim is not None and pclaim['field'] == 'round_participant', 'CLAIM_REF', pid, 'Participant needs an explicit round claim')
            require(participant.get('canonical_investor_id') is None, 'CANONICAL_EDGE', pid, 'Canonical investor edge forbidden')
            if pclaim:
                value = pclaim['value']
                require(value.get('event_id') == eid and pclaim['entity_id'] == event['company_id'],
                        'EVENT_COMPANY', pid, 'Participant belongs to a different event/company')
                require(participant['name'] == value.get('name') and participant['role'] == value.get('role')
                        and participant['source_url'] == pclaim['source_url'], 'PARTICIPANT_PROJECTION', pid, 'Participant projection differs from claim')
    require(participant_ids == {c['claim_id'] for c in claims if c['field'] == 'round_participant'},
            'PARTICIPANT_PROJECTION', 'funding', 'Missing or extra event participation projection')
    # Follow links to reject cycles, even if every individual target exists.
    for event in events:
        visited, current = set(), event
        while current and current.get('related_event'):
            eid = current['event_id']
            if eid in visited:
                require(False, 'TRANCHE_CYCLE', eid, 'Cyclic tranche relationships')
                break
            visited.add(eid)
            current = event_by_id.get(current['related_event'].get('event_id'))
    checks.append('funding amounts, uncertainty, event relationships, participants and no canonical investor edges')

    # Legacy records have their own unchanged schema and must remain loss-aware.
    projection_by_name = index(projections, 'record_name', 'projection-map')
    projected_entities = set()
    record_names = set()
    for record in records:
        name = record['name']
        normalized = normalize_name(name)
        require(normalized not in record_names, 'IDENTITY_COLLISION', name, 'Duplicate normalized projection name')
        record_names.add(normalized)
        projection = projection_by_name.get(name)
        company = next((c for c in companies if c['name'] == name), None)
        require(company is not None, 'PROJECTION_REF', name, 'Projection has no reviewed company')
        if not company:
            continue
        entity = company['entity_id']
        projected_entities.add(entity)
        require(entity in accepted and entity not in excluded, 'PROJECTION_EXCLUDED', name, 'Excluded/rejected companies must not enter staged projection')
        require(projection is not None and projection.get('entity_id') == entity, 'PROJECTION_REF', name, 'Projection map binding missing or wrong')
        if projection:
            require(set(projection['all_claim_ids']) == set(company['claim_ids']), 'PROJECTION_REF', name, 'Projection claim coverage differs')
        require(not record.get('relationships'), 'CANONICAL_EDGE', name, 'No production investor/entity relationships in this packet')
        for url in [record['source']] + [x['source'] for x in record.get('profile_facts', [])]:
            source = source_by_url.get(url)
            require(source is not None and source.get('accessed') is True, 'SOURCE_BINDING', name, 'Projected source is not registered/accessed')
        if 'founded_year' in record:
            founded = company['founded']
            require(founded.get('status') != 'conflict' and founded.get('value') is not None,
                    'FOUNDING_CONFLICT', name, 'Conflicted/unknown founding cannot become a definitive founded_year')
            if founded.get('value'):
                require(record['founded_year'] == int(founded['value'][:4]), 'DATE_PRECISION', name, 'Projected year differs from evidence')
        company_claims = [c for c in claims if c['entity_id'] == entity]
        for founder in record.get('founders', []):
            require(any(c['field'] == 'founder' and c['status'] == 'reviewed_staged'
                        and normalize_name(c['value']['name']) == normalize_name(founder['name'])
                        and c['source_url'] == founder['source'] for c in company_claims),
                    'FOUNDER_PROJECTION', name, 'Projected founder lacks same-company name/source evidence')
        for funding in record.get('funding_rounds', []):
            eid = 'unresolved:funding:' + funding['id']
            event = event_by_id.get(eid)
            require(event is not None, 'EVENT_REF', name, 'Projected funding lacks staged event')
            if not event:
                continue
            require(event['company_id'] == entity, 'EVENT_COMPANY', eid, 'Projected round belongs to another company')
            require(funding['source'] == event['source_url'], 'SOURCE_BINDING', eid, 'Projected round source differs')
            if 'amount' in funding:
                money(funding, eid + '.legacy')
                require(funding['amount'] == event['amount'] and funding.get('currency') == event['currency'],
                        'EVENT_PROJECTION', eid, 'Projected amount/currency differs or converts unknown to zero')
                require(event['amount_measure'] != 'facility_capacity', 'FACILITY_CAPACITY', eid, 'Facility limit cannot be numeric cash raised in legacy')
            else:
                require('currency' not in funding, 'MONEY_PAIR', eid, 'Legacy currency requires amount')
            if 'announced_on' in funding:
                require(funding['announced_on'] == event['announced_on'], 'DATE_PRECISION', eid, 'Projected event date differs')
    require(projected_entities == accepted, 'PROJECTION_COVERAGE', 'records', 'Accepted companies and staged projection differ')
    require(set(projection_by_name) == {r['name'] for r in records}, 'PROJECTION_COVERAGE', 'projection-map', 'Extra or absent projection map record')
    legacy_result = None
    if check_legacy:
        try:
            legacy_result = validate_legacy(bundle['records.staged.json'])
            require(legacy_result.get('valid') is True, 'LEGACY_SCHEMA', 'records.staged.json', json.dumps(legacy_result.get('errors')))
        except (OSError, subprocess.SubprocessError) as error:
            require(False, 'LEGACY_SCHEMA', 'records.staged.json', str(error))
    checks.append('current production record schema and source-backed, exclusion-safe projection')

    # Resume token is a deterministic digest of the exact fixed worklist and base.
    worklist = queue['company_worklist']
    checkpoint = queue['checkpoint']
    work_by_id = index(worklist, 'item_id', 'queue.worklist')
    reviewed_ids = {x['item_id'] for x in worklist if x['state'] == 'reviewed'}
    queued_ids = {x['item_id'] for x in worklist if x['state'] == 'queued'}
    lead_ids = {x['candidate_id'] for x in queue['unreviewed_company_leads']}
    require(reviewed_ids == set(company_by_id), 'QUEUE_COVERAGE', 'queue', 'Reviewed worklist differs from adjudicated companies')
    require(queued_ids == lead_ids, 'QUEUE_COVERAGE', 'queue', 'Queued worklist differs from unreviewed leads')
    expected_hash = canonical_hash(worklist)
    require(checkpoint.get('worklist_sha256') == expected_hash, 'QUEUE_HASH', 'queue.checkpoint', 'Worklist changed without a new checkpoint')
    next_index = next((i for i, row in enumerate(worklist) if row['state'] == 'queued'), len(worklist))
    require(all(row['state'] == 'queued' for row in worklist[next_index:]), 'QUEUE_CURSOR', 'queue', 'Reviewed prefix must be contiguous')
    require(checkpoint.get('next_index') == next_index and checkpoint.get('cursor') == f'{expected_hash}:{next_index}',
            'QUEUE_CURSOR', 'queue.checkpoint', 'Cursor must point to first unreviewed item and bind current hash')
    expected_next = worklist[next_index]['item_id'] if next_index < len(worklist) else None
    require(checkpoint.get('next_item_id') == expected_next and checkpoint.get('base_revision') == manifest['base_revision'],
            'QUEUE_CURSOR', 'queue.checkpoint', 'Cursor next item/base revision mismatch')
    require(checkpoint.get('worklist_exhausted') == (next_index == len(worklist)), 'QUEUE_CURSOR', 'queue.checkpoint', 'Worklist exhaustion flag incorrect')
    tasks = queue['source_tasks']
    index(tasks, 'queue_id', 'queue.source_tasks')
    for task in tasks:
        require(task.get('crawler_seed_approved') is False, 'SOURCE_APPROVAL', task['queue_id'], 'Queued sources are not crawler approvals')
        if task.get('source_id'):
            require(task['source_id'] in source_by_id, 'SOURCE_MISSING', task['queue_id'], 'Queue source does not exist')
        if task.get('cursor_kind') == 'not_observed':
            require(task.get('cursor') is None, 'QUEUE_CURSOR', task['queue_id'], 'No live cursor was observed')
    for obj in (manifest, queue):
        require(obj.get('national_denominator') is None and obj.get('national_completeness_claim') is False,
                'COMPLETENESS', 'manifest/queue', 'Bounded worklist cannot claim national completeness')
    checks.append('hash-bound, base-bound resumable coverage and unapproved source queue')

    expected_counts = {
        'bounded_worklist_discovered':len(worklist),
        'company_identities_reviewed':len(companies),
        'accepted_staged_candidates':len(accepted),
        'excluded_from_independent_swiss_candidate_batch':len(excluded),
        'queued_unreviewed_company_leads':len(lead_ids),
        'new_country_records_published':0, 'crawler_seeds_approved':0,
        'duplicate_company_matches':sum(bool(x['matches']) for x in dedup['companies']),
        'company_claims':len(claims),
        'company_claim_statuses':dict(Counter(x['status'] for x in claims)),
        'founder_attribution_claims':sum(x['field'] == 'founder' for x in claims),
        'financing_observations':len(events),
        'event_specific_named_participations':sum(len(x['participants']) for x in events),
        'accepted_candidate_financing_observations':sum(x['company_id'] in accepted for x in events),
        'legacy_financing_entries':sum(len(x.get('funding_rounds', [])) for x in records),
        'ecosystem_claims':len(ecosystem), 'source_registry_entries':len(sources),
        'distinct_registry_urls':len(source_by_url),
        'claim_bearing_distinct_urls':sum(bool(x['claim_ids'] or x['ecosystem_claim_ids']) for x in sources),
        'source_followup_tasks':len(tasks),
    }
    require(manifest['counts'] == expected_counts, 'COUNT_MISMATCH', 'manifest.counts', 'Manifest counts disagree with packet contents')
    require(bundle['coverage.json']['counts'] == expected_counts, 'COUNT_MISMATCH', 'coverage.counts', 'Coverage counts disagree with packet contents')
    rows = bundle['coverage.json']['company_rows']
    require({x['entity_id'] for x in rows} == set(company_by_id) and len(rows) == len(companies),
            'COVERAGE', 'coverage.company_rows', 'Coverage rows differ from company universe')
    checks.append('manifest, source, claim, event and coverage denominators reconciled')
    return {
        'valid':not errors,
        'checked_at':datetime.now(timezone.utc).isoformat(),
        'run_id':manifest['run_id'], 'counts':expected_counts,
        'checks':checks, 'legacy_validator':legacy_result,
        'changed_file_scope_checked':changed_paths is not None,
        'errors':errors,
        'limitations':'Offline structural, provenance-binding and semantic consistency validation. It does not independently establish source truth, national completeness, access permission, current legal status or publication.',
    }


def git_changed_paths(repo, base_revision):
    """Optional read-only scope check, including untracked files."""
    paths = set()
    for args in (['git', 'diff', '--name-only', base_revision],
                 ['git', 'ls-files', '--others', '--exclude-standard']):
        process = subprocess.run(args, cwd=repo, capture_output=True, text=True, timeout=20, check=True)
        paths.update(line for line in process.stdout.splitlines() if line)
    return sorted(paths)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--packet-dir', type=Path, default=HERE)
    parser.add_argument('--check-git-scope', action='store_true', help='Read-only check of changed/untracked paths against country ownership')
    parser.add_argument('--out', type=Path, help='Optional validation receipt; otherwise stdout only')
    args = parser.parse_args()
    try:
        bundle = load_packet(args.packet_dir)
        changed = git_changed_paths(REPO, bundle['manifest.json']['base_revision']) if args.check_git_scope else None
        result = validate_packet(bundle, changed_paths=changed)
    except (KeyError, TypeError, ValueError, OSError, subprocess.SubprocessError) as error:
        result = {'valid':False, 'errors':[{'code':'LOAD_OR_STRUCTURE', 'message':str(error)}]}
    rendered = json.dumps(result, ensure_ascii=False, indent=2) + '\n'
    if args.out:
        args.out.write_text(rendered, encoding='utf-8')
    print(rendered, end='')
    return 0 if result['valid'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
