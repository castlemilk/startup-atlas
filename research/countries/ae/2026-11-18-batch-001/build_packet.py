#!/usr/bin/env python3
"""Assemble this bounded, offline UAE staging packet. No network or production writes.

The observations are reviewed research inputs, not crawler output. This assembler
maps only existing startup-schema fields and keeps richer facts in the ledger.
The repository's existing planner supplies resumability; it is not reimplemented.
"""
import argparse
from collections import Counter
from copy import deepcopy
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import unicodedata
from urllib.parse import urlsplit

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
REVISION = 'f4bcbf7030d741772bb750deee584efa3ee17749'


def dump(name, value):
    (HERE / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def digest(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def slug(value):
    value = unicodedata.normalize('NFKD', value).encode('ascii', 'ignore').decode().lower()
    return re.sub('[^a-z0-9]+', '-', value).strip('-')


def normalized_name(value):
    return ' '.join(unicodedata.normalize('NFKC', value).casefold().split())


def domain(value):
    if not value:
        return None
    host = urlsplit(value).hostname
    return host.lower().removeprefix('www.') if host else None


def normalized_value(value, entity_id):
    value = deepcopy(value)
    if isinstance(value, list):
        return [normalized_value(v, entity_id) for v in value]
    if not isinstance(value, dict):
        return value
    value = {k: normalized_value(v, entity_id) for k, v in value.items()}
    if 'company_id' in value:
        value['company_id'] = entity_id
    for amount, currency in [('amount', 'currency'), ('valuation', 'valuation_currency')]:
        if value.get(amount) is not None and value.get(currency) is None:
            # Original symbols and scale stay in the supplied textual observation.
            value[amount] = None
    if 'current_role' in value:
        value['role_as_reported'] = value.pop('current_role')
        value['current_role_verified'] = False
    if 'event_id' in value and value.get('role') not in (None, 'lead', 'participant', 'unspecified'):
        value['role_as_stated'] = value['role']
        value['role'] = 'lead' if value['role'] in ('co-lead', 'co_lead') else 'unspecified'
    if 'participants' in value:
        value['participants'] = [normalized_value(x, entity_id) for x in value['participants']]
    return value


def text_value(value):
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        return '; '.join(text_value(x) for x in value)
    if isinstance(value, dict):
        return '; '.join(k.replace('_', ' ') + ': ' + text_value(v) for k, v in value.items()
                         if v is not None and k not in ('source_url', 'company_id', 'resolved_entity_id', 'person_id'))
    return str(value)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--inputs', type=Path, help='Initial research lane directory; omit to rebuild saved observations')
    args = parser.parse_args()
    if args.inputs:
        lanes = [json.loads((args.inputs / (n + '.json')).read_text())
                 for n in ('fintech', 'commerce', 'ecosystem', 'boundaries')]
        for lane in lanes:
            for candidate in lane['candidates']:
                eid = 'unresolved:ae:' + candidate['slug']
                candidate['fields'] = normalized_value(candidate['fields'], eid)
                for claim in candidate['claims']:
                    claim['value'] = normalized_value(claim.get('value'), eid)
                held = candidate.pop('held_observations', [])
                if held:
                    candidate['withheld_observations'] = {
                        'count': len(held),
                        'fields': sorted(set(x['field'] for x in held)),
                        'source_urls': sorted(set(x['source_url'] for x in held)),
                        'reason': 'Company-source facts withheld after observed use restrictions; no values or evidence text exported.'}
                candidate.pop('held_metadata', None)
        dump('observations.json', {'scope': 'UAE batch 001 research inputs; brief factual paraphrases, paired monetary normalization and rights-hold sanitation applied', 'lanes': lanes})
    else:
        lanes = json.loads((HERE / 'observations.json').read_text())['lanes']
    checked_at = max(x['checked_at'] for x in lanes)
    sources = {}
    for lane in lanes:
        for raw in lane['sources']:
            url = raw['url']
            entry = sources.setdefault(url, {
                'source_id': 'ae-source-' + hashlib.sha256(url.encode()).hexdigest()[:16],
                'url': url, 'title': raw['title'], 'publisher': raw['publisher'],
                'source_kind': raw['source_kind'], 'observations': [],
                'crawler_seed_approved': False,
            })
            observation = {k: v for k, v in raw.items() if k not in ('id', 'source_id', 'url', 'title', 'publisher', 'source_kind')}
            observation['lane'] = lane['lane']
            entry['observations'].append(observation)
    claims, entities, ecosystem, records, mapping, events, participations, field_dispositions = [], [], [], [], [], [], [], []
    claim_keys = set()
    for lane in lanes:
        local_sources = {s['url']: s for s in lane['sources']}
        subjects = [(x, False) for x in lane['candidates']] + [(x, True) for x in lane.get('ecosystem', [])]
        for candidate, is_eco in subjects:
            s = candidate.get('slug') or slug(candidate['name'])
            eid = ('ecosystem:ae:' if is_eco else 'unresolved:ae:') + s
            cclaims = []
            for raw in candidate['claims']:
                url = raw['source_url']
                source = local_sources.get(url)
                if source is None:
                    raise ValueError(f'Unregistered source: {candidate["name"]}: {url}')
                val = normalized_value(raw.get('value'), eid)
                field = raw['field']
                if field == 'round_participant' and isinstance(val, dict):
                    val['name'] = val.get('name') or val.get('stated_name') or val.get('stated_participant_name')
                    val['resolved_entity_id'] = None
                original_status = raw.get('status') or 'reviewed_staged'
                status = {'deferred_independent_investor_review': 'candidate',
                          'attributed_month_not_normalized': 'conflict'}.get(original_status, original_status)
                if not source.get('accessed') and status == 'reviewed_staged':
                    raise ValueError(f'Unaccessed claim cannot be reviewed: {candidate["name"]} {field}')
                if status == 'reviewed_staged' and source['source_kind'] == 'discovery':
                    raise ValueError(f'Discovery source cannot establish claim: {candidate["name"]}')
                key = digest({'entity_id': eid, 'field': field, 'value': val, 'source_url': url})
                if key in claim_keys:
                    continue
                claim_keys.add(key)
                effective = None
                if isinstance(val, dict):
                    day = val.get('announced_on') or val.get('as_of') or val.get('effective_on')
                    if isinstance(day, str) and re.fullmatch(r'\d{4}-\d{2}-\d{2}', day):
                        effective = day
                claim = {
                    'claim_id': 'ae-claim-' + key[:20], 'entity_id': eid, 'field': field,
                    'value': val, 'source_id': sources[url]['source_id'], 'source_url': url,
                    'source_kind': source['source_kind'], 'publisher': source['publisher'],
                    'accessed': bool(source.get('accessed')), 'retrieved_at': source['retrieved_at'],
                    'retrieval_time_precision': source.get('retrieval_time_precision', source.get('retrieval_timestamp_precision', 'batch_checkpoint')),
                    'published_on': source.get('published_on'), 'effective_on': effective,
                    'evidence': raw['evidence'], 'acquisition': source['acquisition'],
                    'confidence': raw.get('confidence', 'medium'),
                    'rationale': raw.get('rationale', 'Explicit source assertion reviewed in this bounded research pass.'),
                    'status': status, 'reviewed_at': lane['checked_at'], 'publication_state': 'unsubmitted',
                    'research_disposition': original_status,
                    'projection': 'research_only',
                }
                if raw.get('search_log'):
                    claim['search_log'] = raw['search_log']
                if raw.get('rights_hold'):
                    claim['rights_hold'] = raw['rights_hold']
                claims.append(claim)
                cclaims.append(claim)
            if is_eco:
                ecosystem.append({**{k:v for k,v in candidate.items() if k!='claims'}, 'entity_id': eid,
                                  'claim_ids': [c['claim_id'] for c in cclaims], 'publication_state':'unsubmitted'})
                continue
            fields = {k: normalized_value(v, eid) for k, v in candidate['fields'].items()}
            fields.pop('funding_events', None)
            entity = {'entity_id': eid, 'proposed_graph_id': 'startup:' + slug(candidate['name']),
                      'canonical_entity_id': None, 'name': candidate['name'], 'official_url': candidate['official_url'],
                      'domain': domain(candidate['official_url']), 'aliases': candidate['aliases'],
                      'disposition': candidate['disposition'], 'reason': candidate['reason'],
                      'fields': fields, 'claim_ids': [c['claim_id'] for c in cclaims],
                      'gaps': candidate['gaps'], 'source_lane': lane['lane'],
                      'seed_approval': 'not_approved', 'publication_state': 'unsubmitted'}
            if s == 'qlub':
                entity['disposition'] = 'discovered'
            if s == 'stake':
                entity['disposition'] = 'deferred'
                entity['integration_hold'] = 'Company-source use/access hold and cross-country name/slug collision with Australian Stake. Investor-supported claims remain research-only.'
            entities.append(entity)
            for field in ('identity','headquarters','incorporation','founded','founder','funding_round','round_participant','company_size','news'):
                alternatives = {'founded': ['founded','founded_year','founding_chronology'], 'news':['news','article']}.get(field,[field])
                related = [x for x in cclaims if x['field'] in alternatives]
                state = ('conflict' if any(x['status']=='conflict' for x in related) else
                         'reviewed_staged' if any(x['status']=='reviewed_staged' for x in related) else
                         'blocked' if any(x['status']=='blocked' for x in related) else 'unsearched')
                field_dispositions.append({'entity_id':eid,'field':field,'status':state,
                    'claim_ids':[x['claim_id'] for x in related],
                    'reason':'Claim-backed observation; list is not asserted complete.' if related else
                             'No value accepted in this pass; targeted follow-up required. No claim of an exhaustive unsuccessful search.'})
            eclaims = [x for x in cclaims if x['field']=='funding_round']
            for ec in eclaims:
                ev = deepcopy(ec['value'])
                ev['source_url'] = ec['source_url']
                ev['claim_id'] = ec['claim_id']
                ev['entity_disposition'] = entity['disposition']
                ev['status'] = ec['status']
                ev.setdefault('amount', None); ev.setdefault('currency', None)
                ev.setdefault('announced_on', None); ev.setdefault('closed_on', None)
                ev.setdefault('date_precision', 'unknown'); ev.setdefault('participants_complete', False)
                supplements = [x for x in cclaims if x['field'] in ('funding_currency', 'funding_amount_currency')
                               and x['status'] == 'reviewed_staged' and isinstance(x['value'], dict)
                               and x['value'].get('event_id') == ev['event_id']]
                for supplement in supplements:
                    sv = supplement['value']
                    if sv.get('currency') and sv.get('amount') is not None:
                        if ev.get('currency') and (ev['currency'], ev['amount']) != (sv['currency'], sv['amount']):
                            raise ValueError('Unresolved conflicting normalized funding amount: ' + ev['event_id'])
                        ev['amount'], ev['currency'] = sv['amount'], sv['currency']
                ev['normalization_claim_ids'] = [ec['claim_id'], *[x['claim_id'] for x in supplements]]
                ev['normalization_source_urls'] = list(dict.fromkeys([ec['source_url'], *[x['source_url'] for x in supplements]]))
                ev['participants'] = []
                events.append(ev)
                for pc in cclaims:
                    if pc['field']=='round_participant' and pc['value']['event_id']==ev['event_id']:
                        pv = {**pc['value'], 'company_id':eid, 'source_url':pc['source_url'], 'claim_id':pc['claim_id'],
                              'status':pc['status'], 'canonical_edge_created':False}
                        participations.append(pv)
                        ev['participants'].append(pc['claim_id'])
            if entity['disposition'] != 'accepted':
                continue
            good = [c for c in cclaims if c['status']=='reviewed_staged']
            desc = next(c for c in good if c['field']=='description')
            identity = next(c for c in good if c['field']=='identity')
            website_claims = [c for c in good if c['field']=='website'] or [identity]
            record = {'name': candidate['name'], 'description': fields['description'], 'website': candidate['official_url'],
                      'source': desc['source_url'], 'reviewed_at': checked_at[:10]}
            rmap = {'entity_id':eid,'proposed_graph_id':entity['proposed_graph_id'],'record_name':record['name'], 'fields':[]}
            def bind(pointer, use):
                rmap['fields'].append({'pointer':pointer,'claim_ids':[x['claim_id'] for x in use],
                                      'source_urls':list(dict.fromkeys(x['source_url'] for x in use))})
                for x in use:
                    x['projection']='startup-records.json'
            bind('/name',[identity]); bind('/description',[desc]); bind('/website',website_claims)
            facts=[]
            fact_counts=Counter()
            for c in cclaims:
                if c['field'] not in ('founded','founded_year','headquarters','incorporation','origin','operating_base',
                    'operating_locations','location','legal_entity','legal_name','legal_entities','regional_headquarters',
                    'alias','sector','funding_stage_conflict') and c['status']!='conflict':
                    continue
                if c['status'] not in ('reviewed_staged','conflict'):
                    continue
                field=c['field']; fact_counts[field]+=1
                value = text_value(c['value'])
                if c['status']=='conflict':
                    value = 'Unresolved source conflict. ' + c['evidence'] + ' ' + value
                if c['effective_on']:
                    value += f' (as reported {c["effective_on"]})'
                elif c['published_on'] and field in ('headquarters','location','origin'):
                    value += f' (source dated {c["published_on"]}; not a fresh current-HQ assertion)'
                value=' '.join(value.split())
                if len(value)>1000:
                    raise ValueError(f'Fact requires editorial shortening: {record["name"]} {field}')
                fact={'key':slug(field)+'-'+str(fact_counts[field]), 'label':field.replace('_',' ').capitalize(),
                      'value':value,'source':c['source_url'],'reviewed_at':checked_at[:10]}
                bind('/profile_facts/'+str(len(facts)),[c]); facts.append(fact)
            if facts:
                record['profile_facts']=facts
            founders=[]
            seen_founders=set()
            for c in good:
                if c['field']!='founder':continue
                val=c['value']; name=val['name'] if isinstance(val,dict) else val
                if normalized_name(name) in seen_founders:continue
                seen_founders.add(normalized_name(name))
                founders.append({'name':name,'source':c['source_url']})
                bind('/founders/'+str(len(founders)-1),[c])
            if founders:record['founders']=founders
            rounds=[]
            for c in good:
                if c['field']!='funding_round':continue
                event_id=c['value']['event_id']
                ev=next(x for x in events if x['claim_id']==c['claim_id'])
                r={'id':event_id,'stage':ev.get('stage') or 'Funding round (stage not stated)','source':c['source_url']}
                if ev.get('announced_on') and re.fullmatch(r'\d{4}-\d{2}-\d{2}',ev['announced_on']):r['announced_on']=ev['announced_on']
                for amount,currency in [('amount','currency'),('valuation','valuation_currency')]:
                    if ev.get(amount) is not None and ev.get(currency):r[amount]=ev[amount];r[currency]=ev[currency]
                if ev.get('amount_text'):r['amount_text']=ev['amount_text']
                pcs=[pc for pc in good if pc['field']=='round_participant' and pc['value']['event_id']==event_id]
                related=[x for x in good if x['field'] in ('funding_currency','funding_amount_currency','funding_date','funding_instrument')
                         and isinstance(x['value'],dict) and x['value'].get('event_id')==event_id]
                note=[]
                if ev.get('transaction_kind'):note.append('Transaction: '+ev['transaction_kind'].replace('_',' ')+'.')
                for k in ('note','stage_note','round_target_text','valuation_text'):
                    if ev.get(k):note.append(ev[k])
                if not ev.get('announced_on') and (ev.get('date_value') or ev.get('reported_on')):
                    note.append('Date observation: '+str(ev.get('date_value') or ev.get('reported_on'))+'; precision '+ev.get('date_precision','unknown')+'; exact announcement day unverified.')
                if ev.get('published_on') and ev.get('announced_on') and ev['published_on']!=ev['announced_on']:
                    note.append('Displayed publication date '+ev['published_on']+' differs from announcement dateline.')
                if pcs:
                    names=[]
                    for pc in pcs:
                        pv=pc['value']; role=pv.get('role_as_stated') or pv.get('role') or 'unspecified'
                        names.append(pv['name']+' ('+role+')')
                    note.append('Named event participants: '+', '.join(names)+'. List may be partial; canonical investor identities unresolved.')
                extra=list(dict.fromkeys(x['source_url'] for x in [*pcs,*related] if x['source_url']!=c['source_url']))
                extra+=list(dict.fromkeys(u for u in ev.get('extra_sources',[]) if u!=c['source_url'] and u not in extra))
                if ev.get('currency_source_url') and ev['currency_source_url'] not in extra:extra.append(ev['currency_source_url'])
                if extra:note.append('Additional evidence: '+' ; '.join(extra))
                if note:r['note']=' '.join(' '.join(note).split())
                if len(r.get('note',''))>2000:raise ValueError('Funding note needs editorial shortening: '+event_id)
                bind('/funding_rounds/'+str(len(rounds)),[c,*pcs,*related]);rounds.append(r)
            if rounds:record['funding_rounds']=rounds
            records.append(record);mapping.append(rmap)
    # Add named discovery leads without treating portfolio membership as identity or funding proof.
    known={normalized_name(x['name']) for x in entities}
    discoveries=[]
    for lane in lanes:
        for d in lane.get('discovery_leads',[]):
            name=d.get('name') or d.get('company')
            if name and normalized_name(name) not in known:
                known.add(normalized_name(name));discoveries.append({**d,'disposition':'discovered','source_lane':lane['lane']})
        for q in lane.get('next_sources',[]):
            name=q.get('company')
            if name and normalized_name(name) not in known:
                known.add(normalized_name(name));discoveries.append({'name':name,'url':q.get('url'),'disposition':'discovered',
                    'reason':q.get('task'),'source_lane':lane['lane']})
    graph=json.loads((ROOT/'data/graph.json').read_text());overlay=json.loads((ROOT/'data/startup-research.json').read_text())
    base_entities=graph['entities']
    dedup=[]
    for entity in entities:
        matches=[]; key_names={normalized_name(n) for n in [entity['name'],*entity['aliases']]}
        for prior in base_entities:
            reasons=[]
            if normalized_name(prior['name']) in key_names:reasons.append('normalized_name_or_alias')
            if prior['id']==entity['proposed_graph_id']:reasons.append('proposed_graph_id')
            if entity['domain'] and domain(prior.get('website'))==entity['domain']:reasons.append('official_domain')
            if reasons:matches.append({'id':prior['id'],'name':prior['name'],'kind':prior['kind'],'reasons':reasons})
        dedup.append({'entity_id':entity['entity_id'],'name':entity['name'],'domain':entity['domain'],
                      'proposed_graph_id':entity['proposed_graph_id'],'existing_matches':matches,
                      'decision':'new_candidate_no_existing_match' if not matches else 'owner_identity_review_required',
                      'cross_country_hold':entity.get('integration_hold'),
                      'canonical_identity_assigned':False})
        if entity['disposition']=='accepted' and matches:raise ValueError('Accepted candidate needs dedup review: '+entity['name'])
    queue=[]
    for lane in lanes:
        for q in lane.get('next_sources',[]):
            queue.append({**q,'queue_id':'ae-queue-'+digest({'lane':lane['lane'],'item':q})[:16],
                          'priority':q.get('priority',3),
                          'entity_name':q.get('company') or q.get('entity'),
                          'source_url':q.get('source_url') or q.get('url'),
                          'purpose':q.get('purpose') or q.get('task') or q.get('resume'),
                          'research_status':q.get('status') or q.get('state') or 'queued',
                          'source_lane':lane['lane'],'crawler_seed_approved':False,
                          'pagination_checkpoint':{'last_verified_directory_page':None,'next_cursor':None,
                              'exhausted':False,'reason':'This is a review task, not a completed directory traversal. Preserve the first observed page/cursor before continuation.'}})
    counts=Counter(x['disposition'] for x in entities)
    source_status=Counter()
    for s in sources.values():
        statuses={o['status'] for o in s['observations']}
        status='accessed' if 'accessed' in statuses else 'partial' if 'partial' in statuses else sorted(statuses)[0]
        s['access_summary']=status;source_status[status]+=1
    coverage={'base_revision':REVISION,'checked_at':checked_at,
        'scope':'Finite named UAE research queue, not the UAE startup population; staged acceptance can rest on dated UAE nexus, with HQ unknown or dual where stated.',
        'counts':{'discovered_named_candidates':len(entities)+len(discoveries),'reviewed_candidates':len(entities)-counts['discovered'],
                  'accepted_records':len(records),'deferred_candidates':counts['deferred'],'rejected_candidates':counts['rejected'],
                  'unreviewed_discovery_candidates':len(discoveries)+counts['discovered'],'existing_duplicate_matches':sum(bool(x['existing_matches']) for x in dedup),
                  'ecosystem_entities':len(ecosystem),'claims':len(claims),'funding_observations_all_dispositions':len(events),
                  'accepted_record_funding_observations':sum(len(r.get('funding_rounds',[])) for r in records),
                  'accepted_record_founder_links':sum(len(r.get('founders',[])) for r in records),
                  'event_participation_claims_all_dispositions':len(participations),
                  'accepted_event_participation_claims':sum(1 for p in participations if next(e for e in entities if e['entity_id']==p['company_id'])['disposition']=='accepted' and p['status']=='reviewed_staged'),
                  'unique_source_urls':len(sources),'unique_attempted_source_urls':len(sources)-source_status['unopened'],
                  'claim_supporting_source_urls':len({c['source_url'] for c in claims}),
                  'source_access_summary':dict(source_status),'search_queries':sum(len(l.get('search_log',[])) for l in lanes),
                  'next_source_tasks':len(queue),
                  'production_records_written':0,'crawler_runs':0,'crawler_seeds_approved':0,'canonical_investor_edges_created':0},
        'claim_status_counts':dict(Counter(c['status'] for c in claims)),
        'field_dispositions':field_dispositions,'discovery_leads':discoveries,
        'pagination':{'national_denominator':None,'source_directories_exhausted':False,'claims_of_complete_country_coverage':False,
                      'note':'No startup directory fully paginated. Existing repository overlay inventory is separately exhausted; this does not establish research or crawl completeness.'}}
    coverage['counting_notes'] = [
        'Discovered means explicitly enrolled named candidates, not every incidental search hit.',
        'Reviewed includes accepted, deferred and rejected candidates; unreviewed leads remain outside reviewed counts.',
        'Source access counts are unique registered URLs, not HTTP exchanges or all search results. An accessed source may still have a rights-use hold.',
        'Independent reopens are recorded separately in independent-reviews.json; they do not inflate unique-source counts.',
        'Startup acceptance is research staging and does not imply current sole-UAE headquarters, complete field coverage or production publication.'
    ]
    dump('source-registry.json',{'sources':sorted(sources.values(),key=lambda s:s['source_id'])})
    dump('claims.json',{'run':{'country_code':'AE','base_revision':REVISION,'checked_at':checked_at,
          'publication_state':'unsubmitted','scope':'Review staging, including deferred and conflicting observations'},'claims':claims})
    dump('entities.json',{'entities':entities})
    dump('ecosystem.json',{'entities':ecosystem})
    dump('funding-events.json',{'events':events,'participations':participations,'canonical_edges_created':0})
    dump('startup-records.json',{'reviewed':checked_at[:10],'startups':records})
    dump('projection-map.json',{'records':mapping,'note':'Other ledger claims remain research-only. All proposed IDs are provisional and no production write occurred.'})
    dump('deduplication.json',{'base_revision':REVISION,'compared_graph_entities':len(base_entities),
          'compared_overlay_records':len(overlay['startups']),'decisions':dedup,
          'note':'Name/domain matches are review signals, never automatic merges. Founder names and investor names do not resolve person/fund identities.'})
    dump('coverage.json',coverage)
    dump('next-source-queue.json',{'base_revision':REVISION,'queue':queue,'exhausted':False,
          'source_pagination_cursor':None,'note':'Manual research queue. URLs do not approve crawler seeds. Revisit failed sources only through a permitted, useful route.'})
    print(json.dumps(coverage['counts'],indent=2))


if __name__=='__main__':main()
