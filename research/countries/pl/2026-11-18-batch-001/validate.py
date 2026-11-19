#!/usr/bin/env python3
"""Validate this offline research packet. Never writes to Atlas or runs a crawler."""
import argparse
import hashlib
import json
import re
import subprocess
import unicodedata
from collections import Counter
from datetime import date, datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit

import jsonschema

HERE = Path(__file__).resolve().parent
DAY = '2026-11-18'
FILES = ['manifest.json','companies.json','claims.json','source-registry.json','startup-records.json',
         'projection-map.json','coverage.json','next-source-queue.json','deduplication.json',
         'baseline-startups.json','ecosystem.json','packet.schema.json']

def normalize_name(value):
    return ' '.join(unicodedata.normalize('NFKC', value).lower().split())

def canonical_domain(value):
    parsed = urlsplit(value)
    if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError('Credential-free HTTPS URL required')
    return parsed.hostname.lower().removeprefix('www.')

def identity_matches(candidate, baseline):
    names = {normalize_name(candidate['name'])} | {normalize_name(a['name']) for a in candidate.get('aliases', [])}
    domains = {canonical_domain(candidate['website'])}
    domains |= {a['previous_domain'].lower().removeprefix('www.') for a in candidate.get('domain_aliases', []) if a.get('previous_domain')}
    matches = []
    for entry in baseline:
        if normalize_name(entry['name']) in names or (entry.get('website') and canonical_domain(entry['website']) in domains):
            matches.append(entry)
    return matches

def replay_checkpoint(previous, incoming):
    """Pure country-packet replay. A conflicting existing ID requires review, never overwrite."""
    result = dict(previous)
    for item in incoming:
        key = item['candidate_id']
        if key in result and result[key] != item:
            raise ValueError('Conflicting checkpoint identity: ' + key)
        result[key] = item
    return result

def load_bundle(path=HERE):
    return {name: json.loads((path / name).read_text()) for name in FILES}

def date_value_valid(value, precision):
    if value is None:
        return precision == 'unknown'
    pattern = {'day': r'\d{4}-\d{2}-\d{2}', 'month': r'\d{4}-\d{2}', 'year': r'\d{4}'}.get(precision)
    if not pattern or not re.fullmatch(pattern, value):
        return False
    try:
        date.fromisoformat(value + ('-01-01' if precision == 'year' else '-01' if precision == 'month' else ''))
        return True
    except ValueError:
        return False

def validate_bundle(bundle):
    errors = []
    def require(condition, message):
        if not condition: errors.append(message)
    schema = bundle['packet.schema.json']
    for err in jsonschema.Draft202012Validator(schema).iter_errors(bundle['companies.json']):
        errors.append('schema ' + '/'.join(map(str, err.absolute_path)) + ': ' + err.message)
    companies = bundle['companies.json']['companies']
    claims = bundle['claims.json']['claims']
    sources = bundle['source-registry.json']['sources']
    records = bundle['startup-records.json']['records']
    manifest = bundle['manifest.json']
    coverage = bundle['coverage.json']
    source_by_url = {s['url']: s for s in sources}
    claim_by_id = {c['claim_id']: c for c in claims}
    by_entity = {c['entity_id']: c for c in companies}
    by_name = {c['name']: c for c in companies}
    events = {f['id']: f for c in companies for f in c['funding_rounds']}
    candidate_ids = [c['candidate_id'] for c in companies]
    def accessed(url): return url in source_by_url and source_by_url[url]['accessed'] is True
    require(len(set(candidate_ids)) == len(companies), 'Duplicate candidate_id')
    require(len(by_entity) == len(companies), 'Duplicate entity_id')
    require(len(claim_by_id) == len(claims), 'Duplicate claim_id')
    require(len(source_by_url) == len(sources), 'Duplicate exact source URL')
    require(len(events) == sum(len(c['funding_rounds']) for c in companies), 'Duplicate funding event ID')
    require(manifest['staging_only'] and not manifest['production_changed'], 'Packet must remain staged')
    require(manifest['country_startup_denominator'] is None, 'Unknown national denominator cannot become zero or a convenience count')
    require(len(companies) <= manifest['bounded_candidate_limit'] <= 50, 'Bounded candidate limit exceeded')
    require(manifest['counts'] == coverage['counts'], 'Manifest/coverage counts differ')
    for src in sources:
        try: canonical_domain(src['url'])
        except ValueError: errors.append('Invalid source URL: ' + src['url'])
        require(not src['crawler_seed_approved'], 'Research discovery became seed approval')
        require(src['retrieved_on'] == DAY, 'Incorrect source retrieval date')
        require(src['source_id'] == 'source-' + hashlib.sha256(src['url'].encode()).hexdigest()[:16], 'Unstable source ID')
    for cl in claims:
        prefix = cl['claim_id'] + ': '
        require(cl['entity_id'] in by_entity, prefix + 'orphan company reference')
        require(cl['publication_state'] == 'unsubmitted', prefix + 'false production publication state')
        require(cl.get('source_url') in source_by_url, prefix + 'source absent from registry')
        if cl.get('source_url') in source_by_url:
            require(cl['source_id'] == source_by_url[cl['source_url']]['source_id'], prefix + 'source ID mismatch')
        if cl['status'] == 'reviewed_staged':
            require(cl['value'] is not None, prefix + 'null promoted to fact')
            require(cl.get('accessed') is True and accessed(cl['source_url']), prefix + 'unread source supports reviewed claim')
            require(cl['source_kind'] != 'discovery', prefix + 'discovery excerpt promoted to review')
        for field in ['published_on', 'effective_on']:
            require(cl.get(field) is None or date_value_valid(cl[field], 'day'), prefix + 'invalid exact claim date')
        if cl['field'] == 'round_participant':
            v = cl['value']; event = events.get(v['event_id'])
            require(event is not None, prefix + 'participant references nonexistent round')
            if event:
                require(event['company_id'] == cl['entity_id'], prefix + 'participant attached to another company')
                require(any(p['name'] == v['name'] and p['role'] == v['role'] and p['source_url'] == cl['source_url'] for p in event['participants']), prefix + 'participant not represented by event evidence')
    baseline = bundle['baseline-startups.json']['entries']
    for c in companies:
        localclaims = [claim_by_id[i] for i in c['claim_ids'] if i in claim_by_id]
        require(len(localclaims) == len(c['claim_ids']), c['name'] + ': missing claim IDs')
        require(all(x['entity_id'] == c['entity_id'] for x in localclaims), c['name'] + ': claim belongs to another company')
        require(c['canonical_domain'] == canonical_domain(c['website']), c['name'] + ': canonical domain mismatch')
        require(not identity_matches(c, baseline), c['name'] + ': existing Atlas identity requires reconciliation')
        require(c['deduplication']['status'] == 'no_match' and not c['deduplication']['matches'], c['name'] + ': dedup disposition mismatch')
        require(any(x['field'] == 'description' and x['value'] == c['description'] and x['source_url'] == c['description_source_url'] for x in localclaims), c['name'] + ': description/source lacks a claim')
        require(any(x['field'] in ['name', 'identity'] for x in localclaims), c['name'] + ': missing identity evidence')
        require(date_value_valid(c['founded']['value'], c['founded']['precision']), c['name'] + ': founding date/precision mismatch')
        for alias in c['aliases']:require(accessed(alias['source_url']), c['name'] + ': alias lacks read source')
        for p in c['founders']:
            require(any(x['field'] == 'founder' and x['value']['name'] == p['name'] and x['source_url'] == p['source_url'] for x in localclaims), c['name'] + ': founder lacks source-specific claim')
        for f in c['funding_rounds']:
            prefix = f['id'] + ': '
            require(f['company_id'] == c['entity_id'], prefix + 'event company mismatch')
            require(accessed(f['source_url']), prefix + 'funding source unread')
            require(any(x['field'] == 'funding_round' and x['value']['id'] == f['id'] and x['source_url'] == f['source_url'] for x in localclaims), prefix + 'funding event lacks claim')
            for amount, currency in [('amount','currency'), ('valuation','valuation_currency')]:
                require((f.get(amount) is None) == (f.get(currency) is None), prefix + 'amount/currency pair mismatch')
                require(f.get(amount) is None or isinstance(f[amount], int) and not isinstance(f[amount], bool) and f[amount] > 0, prefix + 'unknown amount encoded as zero or invalid value')
            period = f.get('announced_period') or f['announced_on']
            require(date_value_valid(period, f['date_precision']), prefix + 'announcement precision mismatch')
            require(date_value_valid(f['closed_on'], f['closed_date_precision']), prefix + 'closing precision mismatch')
            excluded = f['event_status'] == 'announced_conditional' or f['transaction_kind'] in ['employee_tender_secondary','mixed_primary_and_secondary','mixed_funding_including_prior_venture_debt']
            require(f['projection_eligible'] == (not excluded), prefix + 'unsafe financing projection gate')
            for p in f['participants']:
                require(p['event_id'] == f['id'] and p['company_id'] == c['entity_id'], prefix + 'participant relationship mismatch')
                require(p['resolved_entity_id'] is None, prefix + 'unverified canonical investor identity')
                require(p['evidence_scope'] == 'explicit_event_statement', prefix + 'portfolio membership used as round evidence')
                require((p['amount'] is None) == (p['currency'] is None), prefix + 'participant amount/currency mismatch')
                require(any(x['field'] == 'round_participant' and x['value']['event_id'] == f['id'] and x['value']['name'] == p['name'] and x['source_url'] == p['source_url'] for x in localclaims), prefix + 'participant lacks source-specific event claim')
    # Cross-candidate collision uses verified aliases as well as canonical names and domains.
    for index, c in enumerate(companies):
        other=[{'name':x['name'],'website':x['website']} for x in companies[index+1:]]
        require(not identity_matches(c, other), c['name'] + ': cross-candidate duplicate identity')
    accepted={c['name'] for c in companies if c['disposition']=='accepted_staged'}
    require({r['name'] for r in records} == accepted and len(records) == len(accepted), 'Projection company set differs from accepted dispositions')
    for r in records:
        c=by_name[r['name']]
        require(r['source'] == c['description_source_url'], r['name'] + ': description source inheritance error')
        require('relationships' not in r, r['name'] + ': unresolved investor relationship projected')
        require('founded_year' not in r, r['name'] + ': founding source/precision flattened; use separate sourced fact')
        expected={f['id'] for f in c['funding_rounds'] if f['projection_eligible']}
        require({f['id'] for f in r.get('funding_rounds',[])} == expected, r['name'] + ': event projection mismatch')
        for rr in r.get('funding_rounds',[]):
            f=events[rr['id']]
            require(rr['source'] == f['source_url'], rr['id'] + ': source inheritance error')
            require(rr.get('stage') == (f['stage'] or 'Undisclosed'), rr['id'] + ': unknown stage incorrectly canonicalized')
            for key in ['amount','currency']:
                require((key in rr) == (f[key] is not None), rr['id'] + ': null/missing projection mismatch')
                if key in rr:require(rr[key] == f[key], rr['id'] + ': wrong projected amount/currency')
            if 'announced_on' in rr:
                require(f['date_precision']=='day' and rr['announced_on']==f['announced_on'], rr['id'] + ': manufactured exact announcement day')
            else:require(f['date_precision']!='day' or not f['announced_on'], rr['id'] + ': lost verified exact date')
        def no_null(obj):
            if isinstance(obj,dict):return all(v is not None and no_null(v) for v in obj.values())
            if isinstance(obj,list):return all(no_null(v) for v in obj)
            return True
        require(no_null(r), r['name'] + ': null emitted into legacy production schema')
    for mapping in bundle['projection-map.json']['records']:
        c=by_name[mapping['record_name']]
        for binding in mapping['bindings']:
            require(all(i in c['claim_ids'] for i in binding['claim_ids']), c['name'] + ': projection mapped to unrelated claim')
            require(all(accessed(u) for u in binding['source_urls']), c['name'] + ': projection map source unread')
    for gap in coverage['field_gaps']:
        require(gap['value'] is None and bool(gap['reason']), gap['gap_id'] + ': missing/null disposition invalid')
        if gap['status']=='searched_unknown':require(bool(gap.get('search_log')), gap['gap_id'] + ': searched unknown without read/search context')
    cp=coverage['checkpoint']
    require(set(cp['completed_candidate_ids']) == set(candidate_ids), 'Resume checkpoint omits or invents candidates')
    require(cp['country_population_denominator'] is None and not cp['source_directories_exhausted'], 'False country/source completeness')
    checkpoint=replay_checkpoint({},companies)
    require(replay_checkpoint(checkpoint,companies)==checkpoint, 'Checkpoint replay is not idempotent')
    queue=bundle['next-source-queue.json']['queue']
    require(len({q['queue_id'] for q in queue})==len(queue), 'Duplicate continuation queue ID')
    require(all(q['status']=='queued' and not q['crawler_seed_approved'] and q['population_denominator'] is None for q in queue), 'Invalid queue/seed/denominator state')
    count=manifest['counts']
    require(count['tracked_discovered_candidates']==len(companies) and count['reviewed_candidates']==len(companies), 'Incorrect candidate counts')
    require(count['accepted_staged_companies']==len(records), 'Incorrect accepted count')
    require(count['company_claims']==len(claims), 'Incorrect claim count')
    require(count['unique_source_urls']==len(sources), 'Incorrect source count')
    require(count['financing_events']==len(events), 'Incorrect event count')
    require(count['projected_financing_events']==sum(len(r.get('funding_rounds',[])) for r in records), 'Incorrect projection event count')
    return errors

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--out', type=Path)
    args=parser.parse_args()
    bundle=load_bundle()
    errors=validate_bundle(bundle)
    node=subprocess.run(['node',str(HERE/'validate-startup-records.mjs')],capture_output=True,text=True)
    try:production=json.loads(node.stdout)
    except json.JSONDecodeError:production={'valid':False,'errors':[node.stdout,node.stderr]}
    if not production.get('valid'):errors.append('Unmodified production validator failed')
    result={'valid':not errors,'checked_at':datetime.now(timezone.utc).isoformat(),'packet_contract':'packet.schema.json','counts':bundle['manifest.json']['counts'],'production_validation':production,'errors':errors,'limitations':'Structural and cross-file validation, normalization, deduplication and projection gates. Primary-source review is recorded separately; this is not a crawler adapter test, national census or production publication.'}
    if args.out:args.out.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(result,ensure_ascii=False,indent=2))
    raise SystemExit(0 if result['valid'] else 1)

if __name__=='__main__':main()
