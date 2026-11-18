#!/usr/bin/env python3
"""Offline validation and resumable queue paging for this Norway checkpoint.

Does not fetch sources, alter production data, approve seeds, or publish records.
Run from any directory; outputs JSON on stdout. Requires the runtime's jsonschema.
"""
import argparse
import base64
import collections
import copy
import hashlib
import importlib.util
import json
import re
import subprocess
import unicodedata
from datetime import date, datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit

import jsonschema

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]

def load(name):
    return json.loads((HERE / name).read_text(encoding='utf-8'))

def canonical_hash(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()).hexdigest()

def slug(value):
    text = unicodedata.normalize('NFKD', value).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', '-', text).strip('-')

def normalized_name(value):
    return re.sub(r'\W+', '', unicodedata.normalize('NFKC', value).casefold())

def normalized_domain(value):
    host = (urlsplit(value if '://' in value else 'https://' + value).hostname or '').lower().rstrip('.')
    return host.removeprefix('www.').encode('idna').decode()

def require(condition, message):
    if not condition:
        raise ValueError(message)

def reject(fn, label):
    try:
        fn()
    except (ValueError, jsonschema.ValidationError, TypeError, KeyError):
        return {'test': label, 'passed': True}
    raise ValueError('Negative test unexpectedly accepted: ' + label)

def date_precision(value):
    require(isinstance(value, dict), 'Date observation must be an object')
    v, p = value.get('value'), value.get('precision')
    require(p in ['unknown', 'year', 'month', 'day'], 'Unsupported date precision')
    require((v is None) == (p == 'unknown'), 'Null date must have unknown precision')
    if p == 'unknown':
        return
    require(isinstance(v, str), 'Date value must be text')
    pattern = {'year': r'\d{4}', 'month': r'\d{4}-\d{2}', 'day': r'\d{4}-\d{2}-\d{2}'}[p]
    require(re.fullmatch(pattern, v) is not None, 'Date value/precision mismatch')
    date.fromisoformat(v + {'year': '-01-01', 'month': '-01', 'day': ''}[p])

def pointer(document, path):
    out = document
    for segment in path.split('/')[1:]:
        key = segment.replace('~1', '/').replace('~0', '~')
        out = out[int(key)] if isinstance(out, list) else out[key]
    return out

def leaf_paths(value, path=''):
    if isinstance(value, dict):
        for key, child in value.items():
            yield from leaf_paths(child, path + '/' + key)
    elif isinstance(value, list):
        for index, child in enumerate(value):
            yield from leaf_paths(child, path + '/' + str(index))
    else:
        yield path

def queue_page(queue, limit=10, cursor=None):
    require(isinstance(limit, int) and 1 <= limit <= 50, 'Queue limit must be 1..50')
    tasks = queue['tasks']
    state = {'version': 1, 'source_input_hash': canonical_hash(tasks), 'limit': limit}
    start = 0
    if cursor:
        try:
            decoded = json.loads(base64.urlsafe_b64decode(cursor.encode()).decode())
        except Exception as exc:
            raise ValueError('Malformed queue cursor') from exc
        require(all(decoded.get(k) == v for k, v in state.items()), 'Cursor does not match queue inputs, version or page size')
        start = decoded.get('offset')
        require(isinstance(start, int) and not isinstance(start, bool) and 0 <= start <= len(tasks), 'Cursor offset invalid')
    page = tasks[start:start + limit]
    next_offset = start + len(page)
    token = None
    if next_offset < len(tasks):
        token = base64.urlsafe_b64encode(json.dumps({**state, 'offset': next_offset}, sort_keys=True).encode()).decode()
    return {'items': page, 'offset': start, 'total_registered_tasks': len(tasks), 'next_cursor': token,
            'source_census_complete': False, 'crawl_seed_approved': False}

def validate_packet(packet):
    companies = packet['companies']['companies']
    claims = packet['claims']['claims']
    sources = packet['sources']['source_observations']
    events = packet['funding']['events']
    participants = packet['funding']['event_participations']
    projection = packet['projection']
    bindings = packet['bindings']['bindings']
    queue = packet['queue']
    manifest = packet['manifest']
    schema = packet['schema']
    jsonschema.Draft202012Validator(schema['$defs']['company_packet']).validate(packet['companies'])
    jsonschema.Draft202012Validator(schema['$defs']['event_packet']).validate(packet['funding'])
    ci = {c['claim_id']: c for c in claims}
    si = {s['source_id']: s for s in sources}
    ei = {e['event_id']: e for e in events}
    pi = {p['participation_id']: p for p in participants}
    require(len(ci) == len(claims), 'Duplicate claim ID')
    require(len(si) == len(sources), 'Duplicate source-observation ID')
    require(len(ei) == len(events), 'Duplicate event ID')
    require(len(pi) == len(participants), 'Duplicate participant ID')
    require(len({c['canonical_id'] for c in companies}) == len(companies), 'Company slug collision')
    require(len({c['domain'] for c in companies}) == len(companies), 'Company domain collision')
    for c in companies:
        require(c['canonical_id'] == 'startup:' + slug(c['name']), 'Company canonical ID mismatch')
        require(c['domain'] == normalized_domain(c['website']), 'Company website/domain mismatch')
        require(c['founder_list_complete'] is False and c['funding_history_complete'] is False, 'Unsupported exhaustive coverage assertion')
        require(all(x in ci for x in c['claim_ids']), 'Unknown company claim reference')
        require(all(x in ei for x in c['funding_event_ids']), 'Unknown company event reference')
        if c.get('founded'):
            date_precision(c['founded'])
        for founder in c.get('founders', []):
            require(founder['person_id'] is None, 'Unreviewed canonical person merge')
            require(founder['claim_ids'], 'Founder missing source claim')
        require(not c['deduplication']['matches'] or not c['projection_allowed'], 'Unresolved duplicate projected')
    for cl in claims:
        require(cl['source_id'] in si, 'Claim references unknown source ID')
        s = si[cl['source_id']]
        require(cl['source_url'] == s['url'], 'Claim source ID/URL mismatch')
        require(cl['publication_state'] == 'unsubmitted', 'Unexpected publication state')
        require(all(x in ci for x in cl.get('related_claim_ids', [])), 'Unknown companion source claim')
        if cl['status'] == 'reviewed_staged':
            require(cl['accessed'] and s['accessed'], 'Reviewed claim relies on unaccessed source')
            require(cl['source_kind'] != 'discovery', 'Discovery lead promoted without review')
        datetime.fromisoformat(cl['retrieved_at'].replace('Z', '+00:00'))
    for e in events:
        require(e['claim_ids'] and all(x in ci for x in e['claim_ids']), 'Event missing claim provenance')
        require(e['source_url'] in e['source_urls'], 'Event primary source absent from bindings')
        date_precision(e['announced_on']); date_precision(e['closed_on'])
        if e.get('awarded_date'):
            date_precision(e['awarded_date'])
        require((e.get('amount') is None) == (e.get('currency') is None), 'Amount/currency null pair mismatch')
        if e.get('amount') is not None:
            require(isinstance(e['amount'], int) and not isinstance(e['amount'], bool) and e['amount'] > 0, 'Unsupported zero/invalid funding amount')
            require(re.fullmatch('[A-Z]{3}', e['currency']) is not None, 'Invalid ISO currency')
        if e['transaction_kind'] == 'grant':
            require(not e['projection_allowed'], 'Grant projected into investment rounds')
            require(not e['participant_ids'], 'Grantor incorrectly treated as equity investor')
        require(all(x in pi for x in e['participant_ids']), 'Event references unknown participant')
    for p in participants:
        require(p['event_id'] in ei and p['company_id'] == ei[p['event_id']]['company_id'], 'Participant/event company mismatch')
        require(p['basis'] == 'explicit_event_announcement', 'Portfolio relationship promoted to round')
        require(p['role'] in ['lead', 'participant', 'unspecified'], 'Invalid investor role')
        require(p['resolved_entity_id'] is None, 'Unreviewed investor entity merge')
        require(p['claim_ids'], 'Participant has no event-specific claim')
        require(any(ci[x]['field'] == 'round_participant' and ci[x]['value'].get('event_id') == p['event_id'] and ci[x]['value'].get('name') == p['name'] for x in p['claim_ids']), 'Participant claim is not event-specific')
    records = projection['startups']
    require({r['name'] for r in records} == {c['name'] for c in companies if c['projection_allowed']}, 'Hold/acceptance projection mismatch')
    for r in records:
        for e in r.get('funding_rounds', []):
            rich = ei[e['id']]
            require(rich['projection_allowed'], 'Held event projected')
            if rich.get('amount_precision') != 'reported_exact' or r['name'] == 'Gelato':
                require('amount' not in e and 'currency' not in e, 'Bounded/ambiguous amount projected as exact')
            if 'amount' in e:
                require(e['amount'] == rich['amount'] and e['currency'] == rich['currency'], 'Projected amount changed')
            if 'announced_on' in e:
                require(rich['announced_on']['precision'] == 'day' and rich['announced_on']['value'] == e['announced_on'], 'Partial/changed announcement date projected')
            if rich.get('stage') is None:
                require(e['stage'] == 'Funding round (stage not stated)', 'Invented financing stage')
    binding_paths = []
    for b in bindings:
        pointer(projection, b['path'])
        require(b['claim_ids'] and all(x in ci for x in b['claim_ids']), 'Projection binding has no known claim')
        require(set(b['source_urls']) == {ci[x]['source_url'] for x in b['claim_ids']}, 'Projection source URL binding mismatch')
        binding_paths.append(b['path'])
    require(len(binding_paths) == len(set(binding_paths)), 'Duplicate projection path')
    for path in leaf_paths(projection):
        if path == '/reviewed':
            continue
        require(any(path == b or path.startswith(b + '/') for b in binding_paths), 'Unattributed projected field: ' + path)
    tasks = queue['tasks']
    require(len({x['queue_id'] for x in tasks}) == len(tasks), 'Duplicate resumable task ID')
    require(queue['resume']['source_input_hash'] == canonical_hash(tasks), 'Queue input hash mismatch')
    require(queue['resume']['plan_hash'] == canonical_hash([x['queue_id'] for x in tasks]), 'Queue plan hash mismatch')
    require(all(x['crawl_seed_approved'] is False for x in sources + tasks + queue['companies']), 'Research became crawler approval')
    counts = manifest['counts']
    require(counts['reviewed_companies'] == len(companies), 'Reviewed count mismatch')
    require(counts['accepted_staged_companies'] == len(records), 'Accepted count mismatch')
    require(counts['held_companies'] == sum(not c['projection_allowed'] for c in companies), 'Held count mismatch')
    require(counts['discovered_unreviewed_companies'] == len(queue['companies']), 'Discovery count mismatch')
    require(counts['retained_company_inventory'] == len(companies) + len(queue['companies']), 'Retained inventory mismatch')
    require(counts['claims'] == len(claims), 'Claim count mismatch')
    require(counts['source_observations'] == len(sources), 'Source observation count mismatch')
    require(counts['unique_source_urls'] == len({s['url'] for s in sources}), 'Source URL count mismatch')
    require(manifest['coverage']['national_population_denominator'] is None and manifest['coverage']['national_complete'] is False, 'Unjustified national completeness assertion')
    require(manifest['cohort']['independently_verified'] is False and manifest['cohort']['norway_rank'] is None, 'Unverified IMF rank promoted')
    return {'company_records': len(companies), 'production_schema_candidates': len(records), 'claims': len(claims),
            'source_observations': len(sources), 'financing_events': len(events), 'event_participations': len(participants),
            'projection_bindings': len(bindings), 'queue_tasks': len(tasks)}

def dry_run_graph(projection):
    spec = importlib.util.spec_from_file_location('norway_make_graph', ROOT / 'scripts/make-graph.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    def data(name): return json.loads((ROOT / 'data' / name).read_text())
    research = data('startup-research.json')
    research['startups'].extend(copy.deepcopy(projection['startups']))
    built = module.build_graph(data('partner-profiles.json'), data('partner-leads.json'), data('partners-reviewed.json'), data('catalogue.json'), research)
    ids = {'startup:' + slug(r['name']) for r in projection['startups']}
    added = [e for e in built['entities'] if e['id'] in ids]
    require(len(added) == len(ids), 'Graph dry-run lost a company')
    zeros = [e['name'] for e in added if e.get('founded_year') == 0]
    expected_missing = {'startup:' + slug(r['name']) for r in projection['startups'] if 'founded_year' not in r}
    actual_missing = {e['id'] for e in added if 'founded_year' not in e}
    require(not zeros and actual_missing == expected_missing, 'Graph does not preserve omitted founding years')
    return {'mode': 'in_memory_only_no_production_files_written', 'companies_preserved': len(added),
            'total_startups': sum(e['kind'] == 'startup' for e in built['entities']), 'total_funding_rounds': len(built['funding_rounds']),
            'unknown_year_default_zero_companies': zeros, 'omitted_years_preserved': len(actual_missing), 'unknown_year_semantics': 'preserved',
            'existing_owner_fix': 'Main PR #179 fixes the earlier zero default; no implementation change in the Norway packet.',
            'promotion_gate': 'Country research and multi-source projection still require existing collection-owner review before production promotion.'}

def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--out', type=Path)
    ap.add_argument('--queue-page', action='store_true')
    ap.add_argument('--limit', type=int, default=10)
    ap.add_argument('--cursor')
    args = ap.parse_args()
    if args.queue_page:
        print(json.dumps(queue_page(load('discovery-queue.json'), args.limit, args.cursor), ensure_ascii=False, indent=2))
        return
    files = {'companies':'companies.enriched.json','claims':'claims.json','sources':'source-registry.json','funding':'funding-events.json',
             'projection':'startups.staged.json','bindings':'projection-map.json','queue':'discovery-queue.json','manifest':'manifest.json','schema':'packet.schema.json'}
    packet = {key:load(name) for key,name in files.items()}
    summary = validate_packet(packet)
    tests = []
    require(normalized_domain('https://WWW.Example.COM/path') == normalized_domain('https://example.com/'), 'Domain normalization sentinel failed')
    require(slug('Völur') == slug('Vo\u0308lur') == 'volur', 'Unicode canonical slug sentinel failed')
    require(normalized_name('reMarkable') == normalized_name('REMARKABLE'), 'Case normalization sentinel failed')
    tests.append({'test':'Unicode/domain/name normalization', 'passed':True})
    for label, mutation in [
        ('duplicate canonical company ID', lambda p:p['companies']['companies'].append(copy.deepcopy(p['companies']['companies'][0]))),
        ('claim/source URL mismatch', lambda p:p['claims']['claims'][0].update(source_url='https://wrong.example/')),
        ('unaccessed reviewed source', lambda p:p['sources']['source_observations'][0].update(accessed=False)),
        ('invented zero event amount', lambda p:next(e for e in p['funding']['events'] if e.get('amount') is not None).update(amount=0)),
        ('portfolio inferred as round participation', lambda p:p['funding']['event_participations'][0].update(basis='portfolio_listing')),
        ('grant investor confusion', lambda p:next(e for e in p['funding']['events'] if e['transaction_kind']=='grant').update(projection_allowed=True)),
        ('upper bound as exact amount', lambda p:next(e for r in p['projection']['startups'] if r['name']=='Wind Catching Systems' for e in r['funding_rounds']).update(amount=10000000,currency='USD')),
        ('unattributed projected field', lambda p:p['projection']['startups'][0].update(logo='https://example.com/logo.png')),
        ('false nationwide completeness', lambda p:p['manifest']['coverage'].update(national_complete=True)),
    ]:
        changed = copy.deepcopy(packet);mutation(changed)
        tests.append(reject(lambda:validate_packet(changed), label))
    tests.append(reject(lambda:date_precision({'value':'2025-07','precision':'day'}), 'partial date promoted to day'))
    tests.append(reject(lambda:date_precision({'value':None,'precision':'year'}), 'unknown date given year precision'))
    queue=packet['queue']; seen=[]; cursor=None
    while True:
        page=queue_page(queue,10,cursor);seen.extend(x['queue_id'] for x in page['items']);cursor=page['next_cursor']
        if cursor is None:break
    require(seen == [x['queue_id'] for x in queue['tasks']] and len(seen) == len(set(seen)), 'Queue replay skipped/duplicated an item')
    tests.append({'test':'bounded queue resumes without skips or duplicates','passed':True})
    token=queue_page(queue,10)['next_cursor']
    changed_queue=copy.deepcopy(queue);changed_queue['tasks'][0]['reason']='changed source scope'
    tests.append(reject(lambda:queue_page(changed_queue,10,token), 'changed queue invalidates cursor'))
    tests.append(reject(lambda:queue_page(queue,11,token), 'changed page size invalidates cursor'))
    tests.append(reject(lambda:queue_page(queue,10,'bad-token'), 'malformed cursor'))
    result={'valid':True,'checked_at':datetime.now(timezone.utc).isoformat(),'scope':'country staged data; no factual completeness or publication assertion',
            'counts':summary,'negative_and_semantic_tests':tests,'graph_dry_run':dry_run_graph(packet['projection']),
            'validated_input_sha256':{name:hashlib.sha256((HERE/name).read_bytes()).hexdigest() for name in files.values()},
            'production_promotion_ready':False}
    text=json.dumps(result,ensure_ascii=False,indent=2)+'\n'
    if args.out:args.out.write_text(text)
    print(text,end='')

if __name__=='__main__':
    main()
