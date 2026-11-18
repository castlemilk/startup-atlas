#!/usr/bin/env python3
"""Offline packet joins and research invariants; not a second Atlas record schema.

The companion Node script calls the production validator. These checks concern
the staging packet only and neither fetch URLs nor mutate catalogue data.
"""
import argparse
from collections import Counter, defaultdict
from datetime import datetime
import hashlib
import json
from pathlib import Path
import re
import unicodedata
from urllib.parse import urlsplit, urlunsplit

FILES = ('atlas-records.json', 'withheld-records.json', 'companies.json', 'claims.json', 'source-registry.json')


def normalize_name(value):
    # Match dedup.json exactly: preserve accents, punctuation and legal suffixes.
    return ' '.join(unicodedata.normalize('NFKC',value).casefold().split())


def normalize_domain(value):
    """Fold only www and case; do not collapse unrelated subdomains or namesakes."""
    parsed = urlsplit(value if '://' in value else 'https://' + value)
    host = (parsed.hostname or '').lower().rstrip('.')
    return host[4:] if host.startswith('www.') else host


def source_url(value):
    if not isinstance(value, str):
        return None
    try:
        p = urlsplit(value)
        if p.scheme != 'https' or not p.hostname or p.username or p.password or p.port not in (None,443):
            return None
        return urlunsplit(('https', p.hostname.lower(), p.path.rstrip('/'), p.query, ''))
    except ValueError:
        return None


def timestamp(value):
    try:
        return datetime.fromisoformat(value.replace('Z','+00:00')).utcoffset() is not None
    except (ValueError, AttributeError):
        return False


def load_packet(directory):
    bundle = {name: json.loads((directory / name).read_text(encoding='utf-8')) for name in FILES}
    baseline_path = directory / 'baseline' / 'rebuilt-identity-index.json'
    baseline = json.loads(baseline_path.read_text(encoding='utf-8')).get('identity_index',[]) if baseline_path.exists() else []
    return bundle, baseline


def queued_task_order(tasks):
    """A pure inspection order, not a task runner; absent priority sorts last."""
    return sorted((t for t in tasks if t.get('status')=='queued'),
                  key=lambda t:(t.get('priority') is None,t.get('priority') or 0,t['task_id']))


def validate_resume(resume, companies, ecosystem, coverage, directory):
    errors=[]
    def check(condition,message):
        if not condition:
            errors.append(message)
    company_ids={c['staging_id'] for c in companies}
    completed=resume.get('completed_company_reviews',[])
    discoveries={c['candidate_id'] for c in ecosystem.get('discovery_only_candidates',[])}
    pending=resume.get('pending_discovery_ids',[])
    check(set(completed)==company_ids and len(completed)==len(company_ids), 'completed initial reviews do not exactly match company IDs')
    check(set(pending)==discoveries and len(pending)==len(discoveries), 'pending discovery IDs do not exactly match ecosystem candidate IDs')
    tasks=resume.get('tasks',[])
    task_ids=[t.get('task_id') for t in tasks]
    check(all(isinstance(x,str) and x for x in task_ids) and len(task_ids)==len(set(task_ids)), 'resume task IDs must be nonempty and unique')
    for task in tasks:
        label=task.get('task_id')
        check(task.get('status')=='queued', f'{label}: initial packet task is not queued')
        check(task.get('automatic_execution') is False and task.get('auto_execute',False) is False, f'{label}: automatic execution is not explicitly disabled')
        check(task.get('crawler_seed_approved') is False, f'{label}: discovery task has crawler-seed approval')
        check(task.get('priority') is None or type(task['priority']) is int, f'{label}: priority must be an integer or absent')
    hashes=resume.get('checkpoint_inputs',{})
    check(bool(hashes), 'resume checkpoint has no input fingerprints')
    for filename,digest in hashes.items():
        path=(directory / filename).resolve()
        check(path.is_relative_to(directory.resolve()), f'{filename}: checkpoint path escapes packet')
        if not path.is_relative_to(directory.resolve()):
            continue
        check(bool(re.fullmatch('[a-f0-9]{64}',digest or '')), f'{filename}: invalid SHA-256 fingerprint')
        try:
            actual=hashlib.sha256(path.read_bytes()).hexdigest()
        except OSError:
            actual=None
        check(actual==digest, f'{filename}: checkpoint fingerprint does not match current file')
    rows=coverage.get('field_coverage',[])
    check({r['company_id'] for r in rows}==company_ids, 'field coverage rows do not match company review scope')
    for row in rows:
        check(row.get('founder_list_complete') is False and row.get('funding_history_complete') is False,
              f'{row["company_id"]}: initial review was promoted to complete founder/funding history')
    denominator=coverage.get('denominator',{})
    check(denominator.get('country_startup_population') is None, 'unestablished country startup denominator became a number')
    check(denominator.get('directory_pagination_exhausted') is False, 'bounded source review became exhausted pagination')
    check(coverage.get('counts',{}).get('next_source_tasks')==len(tasks), 'coverage task count differs from resume queue')
    check(coverage.get('counts',{}).get('discovery_only_queued')==len(discoveries), 'coverage discovery count differs from candidate queue')
    return {'valid':not errors,'errors':errors,'checkpoint_inputs_verified':len(hashes),
            'completed_initial_reviews':len(completed),'pending_discoveries':len(pending),
            'queued_tasks':len(tasks),'task_order':[t['task_id'] for t in queued_task_order(tasks)],
            'selection_rule':'Numeric priority first; absent/null priority last; stable task_id breaks ties. Inspection only; no execution.'}


def validate_bundle(bundle, baseline=()):
    errors = []
    def check(condition, message):
        if not condition:
            errors.append(message)

    companies = bundle['companies.json']['companies']
    claims = bundle['claims.json']['claims']
    sources = bundle['source-registry.json']['sources']
    accepted = bundle['atlas-records.json']['startups']
    withheld = bundle['withheld-records.json']['startups']
    records = accepted + withheld
    ids = [c['staging_id'] for c in companies]
    claim_ids = [c['claim_id'] for c in claims]
    source_ids = [s['id'] for s in sources]
    for label, values in [('company',ids),('claim',claim_ids),('source',source_ids)]:
        check(len(values)==len(set(values)), f'duplicate {label} IDs')
    by_company = {c['staging_id']:c for c in companies}
    by_source = {s['id']:s for s in sources}
    by_record = {normalize_name(r['name']):r for r in records}
    accepted_names = {normalize_name(r['name']) for r in accepted}
    withheld_names = {normalize_name(r['name']) for r in withheld}
    check(len(by_record)==len(records), 'duplicate normalized company names across projections')
    check(not accepted_names & withheld_names, 'accepted and withheld projections overlap')
    check(len(companies)==len(records), 'company registry and projection counts differ')

    domain_owners, alias_owners = defaultdict(set), defaultdict(set)
    actual_claim_ids, actual_source_ids = defaultdict(set), defaultdict(set)
    for c in claims:
        eid = c['entity_id']
        check(eid in by_company, f'{c["claim_id"]}: unknown company')
        actual_claim_ids[eid].add(c['claim_id'])
        refs = c.get('source_ids',[])
        check(isinstance(refs,list) and bool(refs), f'{c["claim_id"]}: missing source IDs')
        actual_source_ids[eid].update(refs)
        check(all(sid in by_source for sid in refs), f'{c["claim_id"]}: unknown source reference')
        check(c.get('publication_state')=='unsubmitted', f'{c["claim_id"]}: staged claim has a publication state other than unsubmitted')
        if c.get('status') in {'reviewed_staged','conflict'}:
            check(c.get('value') is not None, f'{c["claim_id"]}: reviewed null is not an observed fact')
            check(c.get('accessed') is True, f'{c["claim_id"]}: reviewed claim was not accessed')
            check(timestamp(c.get('retrieved_at')), f'{c["claim_id"]}: missing timezone-aware retrieval time')
            check(c.get('source_kind')!='discovery', f'{c["claim_id"]}: discovery-only material promoted to reviewed claim')
            for sid in refs:
                if sid in by_source:
                    check(by_source[sid].get('accessed') is True, f'{c["claim_id"]}: references inaccessible source {sid}')
                    if c.get('status')=='reviewed_staged':
                        check(by_source[sid].get('review_outcome')!='rejected_identity_mismatch',
                              f'{c["claim_id"]}: source identity mismatch was promoted to an accepted claim')
            joined_urls = {source_url(by_source[sid].get('url')) for sid in refs if sid in by_source}
            check(source_url(c.get('source_url')) is not None and source_url(c.get('source_url')) in joined_urls,
                  f'{c["claim_id"]}: source URL does not join its source registry IDs')

    cross_kind_matches=[]
    for co in companies:
        eid, name = co['staging_id'], co['canonical_name']
        key = normalize_name(name)
        check(key in by_record, f'{eid}: no matching projection')
        disposition = co.get('disposition')
        check(disposition in {'accepted_staged','held_geography','excluded_alumni'}, f'{eid}: unsupported packet disposition')
        check(key in (accepted_names if disposition=='accepted_staged' else withheld_names), f'{eid}: disposition/projection mismatch')
        check(set(co.get('claim_ids',[]))==actual_claim_ids[eid], f'{eid}: claim IDs differ from actual ledger ownership')
        check(actual_source_ids[eid] <= set(co.get('source_ids',[])), f'{eid}: company source IDs omit claim sources')
        check(set(co.get('source_ids',[])) <= set(by_source), f'{eid}: company references unknown sources')
        domain = normalize_domain(co['canonical_domain'])
        check(bool(domain), f'{eid}: missing canonical domain')
        domain_owners[domain].add(eid)
        if key in by_record and by_record[key].get('website'):
            check(normalize_domain(by_record[key]['website'])==domain, f'{eid}: canonical domain and projected website differ')
        names = [name] + [a if isinstance(a,str) else a.get('name','') for a in co.get('aliases',[])]
        names = {normalize_name(n) for n in names if n}
        for n in names:
            alias_owners[n].add(eid)
        for old in baseline:
            if normalize_name(old['name']) in names or (old.get('website') and normalize_domain(old['website'])==domain):
                if old.get('kind')=='startup':
                    check(False, f'{eid}: matches baseline startup {old["id"]}; requires explicit existing-record integration')
                else:
                    cross_kind_matches.append({'staging_id':eid,'existing_id':old['id'],'existing_kind':old.get('kind')})
    for kind, mapping in [('domain',domain_owners),('name or alias',alias_owners)]:
        for key, owners in mapping.items():
            check(len(owners)==1, f'duplicate {kind} across candidate identities: {key}')

    events, event_evidence = {}, defaultdict(list)
    for c in claims:
        if c['field'] not in {'funding_round','funding_amount_currency'} or not isinstance(c.get('value'),dict):
            continue
        v=c['value']; event_id=v.get('event_id'); key=(c['entity_id'],event_id)
        check(bool(event_id), f'{c["claim_id"]}: funding evidence has no event ID')
        if c['field']=='funding_round':
            events.setdefault(key,[]).append(c)
        event_evidence[key].append(c)
        for money,currency in [('amount','currency'),('valuation','valuation_currency')]:
            if v.get(money) is not None:
                check(type(v[money]) is int and v[money]>=0, f'{c["claim_id"]}: invalid {money}')
                check(bool(re.fullmatch('[A-Z]{3}',v.get(currency) or '')), f'{c["claim_id"]}: numeric {money} lacks explicit currency')

    pending=0; participants=0
    for c in claims:
        if c['field']!='round_participant':
            continue
        participants+=1; v=c['value']; key=(c['entity_id'],v.get('event_id'))
        check(key in events, f'{c["claim_id"]}: participant references a missing or different-company funding event')
        check(bool(v.get('name')), f'{c["claim_id"]}: participant has no stated name')
        check(v.get('role') in {'lead','participant'}, f'{c["claim_id"]}: participant role is not an explicit lead or participant')
        check(v.get('participation_source_scope') not in {'portfolio','portfolio_membership'}, f'{c["claim_id"]}: portfolio membership is not event participation')
        pending += v.get('resolved_entity_id') is None

    projected_events=set()
    for co in companies:
        record=by_record.get(normalize_name(co['canonical_name']),{})
        for fr in record.get('funding_rounds',[]):
            key=(co['staging_id'],fr['id']); projected_events.add(key)
            check(key in events, f'{co["staging_id"]}/{fr["id"]}: projected event has no funding ledger claim')
            evidence=[c['value'] for c in event_evidence[key] if c.get('status')=='reviewed_staged']
            for money,currency in [('amount','currency'),('valuation','valuation_currency')]:
                if money in fr:
                    check(any(v.get(money)==fr[money] and v.get(currency)==fr.get(currency) for v in evidence),
                          f'{co["staging_id"]}/{fr["id"]}: projected {money} has no matching reviewed amount/currency evidence')
            lower_bound=any(v.get('amount_precision')=='lower_bound' or v.get('lower_bound') is not None or v.get('reported_amount_lower_bound') is not None for v in evidence)
            if lower_bound:
                check('amount' not in fr, f'{co["staging_id"]}/{fr["id"]}: lower bound promoted to exact numeric amount')
                check(bool(fr.get('amount_text')), f'{co["staging_id"]}/{fr["id"]}: lower-bound text omitted')
        resolved={c['value'].get('resolved_entity_id') for c in claims if c['entity_id']==co['staging_id'] and c['field']=='round_participant'}-{None}
        for relation in record.get('relationships',[]):
            if re.search(r'fund|invest|participant',relation['kind']):
                check(relation.get('target_id') in resolved, f'{co["staging_id"]}: unresolved investor promoted to a production relationship')
    check(projected_events==set(events), 'funding ledger event set differs from projection; observations or debt must not become extra rounds')

    return {'valid':not errors,'errors':errors,'counts':{
        'companies':len(companies),'accepted_records':len(accepted),'withheld_records':len(withheld),
        'claims':len(claims),'claim_states':dict(Counter(c.get('status') for c in claims)),
        'sources':len(sources),'accessed_sources':sum(s.get('accessed') is True for s in sources),
        'unique_funding_events':len(events),'projected_funding_events':len(projected_events),
        'participant_claims':participants,'unresolved_participant_claims':pending},
        'cross_kind_identity_matches':cross_kind_matches,
        'limits':'Offline structure and join checks only; source truth, independent-company eligibility, currentness and completeness require research review. No requests or mutations performed.'}


def coverage_receipt_errors(bundle, ecosystem, coverage, receipt):
    """Compare declared counts with the packet; no fixed target batch size."""
    companies=bundle['companies.json']['companies']
    claims=bundle['claims.json']['claims']
    sources=bundle['source-registry.json']['sources']
    accepted={c['staging_id'] for c in companies if c['disposition']=='accepted_staged'}
    discovery_count=len(ecosystem.get('discovery_only_candidates',[]))
    accepted_events={(c['entity_id'],c['value']['event_id']) for c in claims if c['field']=='funding_round' and c['entity_id'] in accepted}
    all_urls={s['url'] for s in sources}
    read_urls={s['url'] for s in sources if s.get('accessed') is True}
    counts=receipt['counts']
    expected={
        'registered_discoveries':len(companies)+discovery_count,
        'reviewed_company_packets':len(companies),'accepted_staged':len(accepted),
        'held_geography':sum(c['disposition']=='held_geography' for c in companies),
        'excluded_alumni':sum(c['disposition']=='excluded_alumni' for c in companies),
        'discovery_only_queued':discovery_count,'company_claims':len(claims),
        'ecosystem_claims':len(ecosystem.get('claims',[])),
        'company_claim_statuses':dict(Counter(c['status'] for c in claims)),
        'funding_events_all_reviewed':counts['unique_funding_events'],
        'funding_events_accepted_records':len(accepted_events),
        'round_participant_assertions_all_reviewed':counts['participant_claims'],
        'founder_assertions_all_reviewed':sum(c['field']=='founder' for c in claims),
        'round_participant_assertions_accepted':sum(c['field']=='round_participant' and c['entity_id'] in accepted for c in claims),
        'founder_assertions_accepted':sum(c['field']=='founder' and c['entity_id'] in accepted for c in claims),
        'source_registry_entries':len(sources),'unique_source_urls':len(all_urls),
        'source_entries_read':sum(s.get('accessed') is True for s in sources),
        'source_entries_unavailable':sum(s.get('accessed') is not True for s in sources),
        'unique_urls_with_readable_response':len(read_urls),
        'unique_urls_without_readable_response':len(all_urls-read_urls),
    }
    reported=coverage.get('counts',{})
    return [f'coverage count {key} does not match packet: reported {reported.get(key)!r}, derived {value!r}'
            for key,value in expected.items() if reported.get(key)!=value]


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory',nargs='?',type=Path,default=Path(__file__).resolve().parent.parent)
    args=parser.parse_args()
    try:
        bundle,baseline=load_packet(args.directory)
        result=validate_bundle(bundle,baseline)
        resume=json.loads((args.directory/'resume.json').read_text())
        ecosystem=json.loads((args.directory/'ecosystem.json').read_text())
        coverage=json.loads((args.directory/'coverage.json').read_text())
        result['errors'].extend(coverage_receipt_errors(bundle,ecosystem,coverage,result))
        result['resume']=validate_resume(resume,bundle['companies.json']['companies'],ecosystem,coverage,args.directory)
        result['errors'].extend(result['resume']['errors'])
        result['valid']=not result['errors']
    except (OSError,ValueError,KeyError,TypeError) as exc:
        result={'valid':False,'errors':[str(exc)]}
    print(json.dumps(result,ensure_ascii=False))
    raise SystemExit(0 if result['valid'] else 1)
