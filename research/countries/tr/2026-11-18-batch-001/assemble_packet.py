#!/usr/bin/env python3
"""Rebuild this country-only staging packet from immutable research contributions.

Offline, deterministic, bounded to this directory. This is not a collector,
crawler seed workflow, production writer, schema migration or approval path.
"""
from collections import Counter
from copy import deepcopy
from pathlib import Path
import hashlib
import json
import re
import unicodedata

HERE = Path(__file__).resolve().parent
REVIEW_DATE = '2026-11-18'
BATCH_ID = 'tr-2026-11-18-batch-001'
LANES = ['root', 'fintech', 'games', 'ecosystem']


def read(name):
    return json.loads((HERE/name).read_text(encoding='utf-8'))


def write(name, value):
    (HERE/name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def slug(value):
    ascii_text = unicodedata.normalize('NFKD', value).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', '-', ascii_text).strip('-')


def main():
    lanes = {lane: read('contributions/' + lane + '.json') for lane in LANES}
    sources, claims, companies, held, findings, queues, changes = [], [], [], [], [], [], []
    for lane, data in lanes.items():
        for source in deepcopy(data['sources']):
            source.setdefault('crawler_seed_approved', False)
            source.setdefault('pagination', {'state': 'not_exhaustively_reviewed', 'eligible_population': None})
            source['research_lane'] = lane
            sources.append(source)
        for claim in deepcopy(data['claims']):
            claim['claim_id'] = claim.get('claim_id', claim['id'])
            claim.setdefault('publication_state', 'unsubmitted')
            claim['research_lane'] = lane
            if claim['claim_id']=='tr-fin-claim-087':
                claim['original_reviewed_at']=claim['reviewed_at']
                claim['reviewed_at']='2026-11-18T10:08:13Z'
                claim['normalization_note']='Root packet review followed the source recheck; original lane review timestamp retained separately.'
            claims.append(claim)
        for company in deepcopy(data['companies']):
            company['research_lane'] = lane
            if company['status'] == 'reviewed_staged':
                companies.append(company)
            else:
                held.append(company)
        for finding in deepcopy(data.get('ecosystem_findings', [])):
            finding['research_lane'] = lane
            findings.append(finding)
        for index, queue in enumerate(deepcopy(data.get('next_queue', [])), 1):
            queue['queue_id'] = f'tr-next-{lane}-{index:03d}'
            queue['research_lane'] = lane
            queue['crawler_seed_approved'] = False
            queue.setdefault('cursor', None)
            queue.setdefault('cursor_note', 'No source-wide completion or pagination cursor inferred.')
            queue.setdefault('status', 'pending_review')
            queue.setdefault('eligible_population', None)
            queues.append(queue)
    by_source = {s['source_id']: s for s in sources}
    assert len(by_source) == len(sources)

    # One stable slug per original staged event; no schema/API changes.
    event_map = {}
    for company in companies:
        for event in company['funding_events']:
            old = event['id']
            event_map[old] = slug(old.replace('staged:tr:', 'tr:'))
    assert len(set(event_map.values())) == len(event_map)

    def replace_refs(value):
        if isinstance(value, dict):
            return {k: replace_refs(v) for k, v in value.items()}
        if isinstance(value, list):
            return [replace_refs(v) for v in value]
        if isinstance(value, str) and value in event_map:
            return event_map[value]
        return value
    companies, claims = replace_refs(companies), replace_refs(claims)
    reverse_events = {v:k for k,v in event_map.items()}

    for company in companies:
        if any(isinstance(x,dict) for x in company['aliases']):
            company['alias_observations']=deepcopy(company['aliases'])
            company['former_domains']=[x for x in company['aliases'] if isinstance(x,dict) and x.get('kind')=='former_or_redirected_domain']
            company['aliases']=[x['name'] if isinstance(x,dict) else x for x in company['aliases'] if not isinstance(x,dict) or x.get('kind')!='former_or_redirected_domain']
            changes.append({'entity_id':company['entity_id'],'field':'aliases','change':'Separated sourced name/search variants from historical domain observations; original objects retained.'})
        dispositions = company['field_dispositions']
        for old, new in [('founding', 'founded'), ('funding', 'funding_events')]:
            if new not in dispositions and old in dispositions:
                dispositions[new] = deepcopy(dispositions[old])
        for dim in ['headquarters', 'incorporation', 'founded', 'founders', 'funding_events']:
            if company.get(dim) in (None, []) and dim not in dispositions:
                dispositions[dim] = {'status':'searched_unknown', 'reason':'No accepted assertion for this dimension in the bounded source review.'}
        company['delivery_state'] = 'unsubmitted'
        company['founders_completeness'] = 'partial; explicit public professional assertions only'
        company['funding_history_completeness'] = 'selected events only; not exhaustive'
        company['country_packet_inclusion'] = 'Türkiye ecosystem association; not a claim of current Turkish HQ or incorporation'
        if company['name']=='Marti':
            dispositions['funding_events']['status']='searched_unknown'
            dispositions['funding_events']['reason']='No ordinary financing round accepted in this pass. Sourced debt facilities and issuance observations are separate; earlier venture/SPAC history remains queued.'
        for event in company['funding_events']:
            event['original_staging_id'] = reverse_events[event['id']]
            event.setdefault('company_id', company['entity_id'])
            for field, precision in [('announced_on','announced_precision'), ('closed_on','closed_precision'), ('event_on','event_precision')]:
                event.setdefault(field, None)
                if event[field] is None:
                    event[precision] = 'unknown'
                elif not event.get(precision):
                    raise ValueError(f'Missing date precision: {event["id"]} {field}')
            event.setdefault('participants_completeness', 'partial; bounded source review')
            event.setdefault('currency', None)
            event.setdefault('amount', None)
            if event.get('stage') == 'unspecified':
                event['stage'] = None
                changes.append({'entity_id':company['entity_id'],'event_id':event['id'],'field':'stage','change':'Unknown stage normalized from literal unspecified to null; no stage inferred.'})
            if event['id']=='tr-iyzico-series-c-2017-extension-total':
                event['note']='Total round size after Amadeus joined; do not add this total to an earlier announcement.'
                changes.append({'entity_id':company['entity_id'],'event_id':event['id'],'field':'note','change':'Removed unverified earlier-tranche amount from lane narrative; accepted extension-total unchanged.'})
            if event['id']=='tr-sipay-series-b-2025':
                event['note']='Sipay company post (tr-fin-006) has an April 8 announcement dateline and April 16 page publication date. Companion government page tr-fin-008 supplies explicit USD. No valuation imported.'
            if event['id']=='tr-getir-series-c-2021':
                event['note']='Company says round completed by announcement; exact closing day unknown. Government companion source tr-fin-028 supplies explicit USD. No valuation imported.'

    # Correct source scope without rewriting immutable lane evidence.
    spyke = next(c for c in companies if c['name'] == 'Spyke Games')
    spyke['registered_office'] = spyke['headquarters']
    spyke['headquarters'] = None
    spyke['field_dispositions']['headquarters'] = {
        'status':'searched_unknown',
        'reason':'Statutory Şirket Merkezi identifies a registered company center/office, not a verified global operational HQ.'
    }
    for claim in claims:
        if claim['entity_id'] == spyke['entity_id'] and claim['field'] == 'headquarters':
            claim['field'] = 'registered_office'
            claim['normalization_note'] = 'Şirket Merkezi establishes a registered center; no global HQ inference.'
    changes.append({'entity_id':spyke['entity_id'],'field':'headquarters','change':'Moved company registered center to registered_office; global headquarters remains null.'})
    for name in ['ikas', 'Tarfin']:
        company = next(c for c in companies if c['name'] == name)
        hq = company['headquarters']
        hq['source_last_updated'] = hq.pop('effective_on')
        hq['effective_on'] = None
        for claim in claims:
            if claim['entity_id'] == company['entity_id'] and claim['field'] == 'headquarters':
                claim['effective_on'] = None
                if isinstance(claim['value'], dict):
                    claim['value']['effective_on'] = None
                    claim['value']['source_last_updated'] = hq['source_last_updated']
                claim['normalization_note'] = 'IFC last-updated date is an observation context, not a proven effective date of the headquarters fact.'
        changes.append({'entity_id':company['entity_id'],'field':'headquarters.effective_on','change':'Source last-updated date retained separately; effective date unknown.'})
    for name in ['Getir','Marti','Peak']:
        company = next(c for c in companies if c['name']==name)
        hq=company['headquarters']
        hq['source_reported_on']=hq['effective_on']
        hq['effective_on']=None
        for claim in claims:
            if claim['entity_id']==company['entity_id'] and claim['field']=='headquarters':
                claim['effective_on']=None
                claim['value']['effective_on']=None
                claim['value']['source_reported_on']=hq['source_reported_on']
        changes.append({'entity_id':company['entity_id'],'field':'headquarters.effective_on','change':'Announcement or filing date is the source reporting date; HQ establishment/effective date unknown.'})
    iyzico=next(c for c in companies if c['name']=='iyzico')
    iyzico['lifecycle']['historical_acquisition_source_rechecked_on']=iyzico['lifecycle'].pop('current_parentage_rechecked_on')
    changes.append({'entity_id':iyzico['entity_id'],'field':'lifecycle','change':'Rechecking a historical 2019 acquisition statement does not independently verify current parentage.'})

    # Complete field-level joins, preserving the particular page that states each fact.
    accepted = [c for c in claims if c['status'] == 'reviewed_staged']
    for company in companies:
        own = [c for c in accepted if c['entity_id'] == company['entity_id']]
        company['claim_ids'] = [c['claim_id'] for c in claims if c['entity_id'] == company['entity_id']]
        for event in company['funding_events']:
            ec = [c for c in own if isinstance(c.get('value'),dict) and (c['value'].get('event_id') or c['value'].get('id')) == event['id']]
            event['claim_ids'] = [c['claim_id'] for c in ec]
            event['field_claim_ids'] = {}
            for field in ['stage','announced_on','closed_on','event_on','amount','currency']:
                v = event.get(field)
                event['field_claim_ids'][field] = [c['claim_id'] for c in ec if v is not None and c['value'].get(field) == v]
            for participant in event.get('participants', []):
                participant['claim_ids'] = [c['claim_id'] for c in ec if c['field'] in {'round_participant','transaction_participant'} and c['value'].get('name') == participant['name'] and c['value'].get('role') == participant['role']]

    claim_by_id = {c['claim_id']:c for c in claims}
    records, maps, omissions = [], [], []
    for company in companies:
        own = [c for c in accepted if c['entity_id'] == company['entity_id']]
        description_claims = [c for c in own if c['field'] == 'description']
        assert description_claims, company['name']
        dc = description_claims[0]
        record = {'name':company['name'], 'website':company['website'], 'description':company['description'],
                  'source':dc['source_url'], 'reviewed_at':REVIEW_DATE}
        mapping = {'entity_id':company['entity_id'], 'name':company['name'],
                   'base_fields':{'description':[dc['claim_id']]}, 'founders':[], 'funding_rounds':[], 'profile_facts':[], 'omissions':[]}
        identity_claims = [c for c in own if c['field'] in {'identity','name','website','official_domain'}]
        mapping['base_fields']['identity'] = [c['claim_id'] for c in identity_claims]
        facts = []

        def fact(key, label, value, cs):
            if not cs or value is None: return
            text = str(value).strip()
            if not text: return
            assert len(text) <= 1000, (company['name'],key,len(text))
            evidence = cs[0]
            facts.append({'key':slug(key),'label':label,'value':text,
                          'source':evidence['source_url'],'reviewed_at':REVIEW_DATE})
            mapping['profile_facts'].append({'key':slug(key),'claim_ids':[c['claim_id'] for c in cs if c['source_id'] == evidence['source_id']]})

        founding = [c for c in own if c['field'] == 'founded_year']
        chosen_year = company['founded']['value'] if company['founded'] else None
        def founded_value(claim):
            v = claim['value']
            return str(v.get('year',v.get('value'))) if isinstance(v,dict) else str(v)
        founding = [c for c in founding if founded_value(c) == str(chosen_year)]
        same_source = [c for c in founding if c['source_id'] == dc['source_id']]
        if chosen_year and same_source:
            record['founded_year'] = int(str(chosen_year)[:4])
            mapping['base_fields']['founded_year'] = [c['claim_id'] for c in same_source]
        elif chosen_year:
            fact('reported-founding-year','Reported founding year',str(chosen_year)+' (year precision; company chronology and legal incorporation are separate)',founding)
            mapping['omissions'].append({'field':'founded_year','reason':'Existing base fields inherit one source; founding evidence is on a different page. Retained as a separately sourced profile fact and typed sidecar.'})
        else:
            mapping['omissions'].append({'field':'founded_year','reason':company['field_dispositions']['founded']['reason']})

        founders = []
        for founder in company['founders']:
            evidence = [c for c in own if c['field'] == 'founder' and isinstance(c['value'],dict) and c['value'].get('name') == founder['name'] and c['source_id'] in founder['source_ids']]
            assert evidence, founder
            e = evidence[0]
            f = {'name':founder['name'],'source':e['source_url']}
            profiles = [c for c in own if c['field']=='founder_profile' and isinstance(c['value'],dict) and c['value'].get('name') == founder['name']]
            if profiles:
                f['profile_url'] = profiles[0]['value']['url']
            founders.append(f)
            mapping['founders'].append({'name':founder['name'],'claim_ids':[c['claim_id'] for c in evidence + profiles]})
        if founders: record['founders'] = founders

        for dimension, label in [('headquarters','Headquarters observation'),('registered_office','Registered office observation'),('incorporation','Legal entity observation')]:
            value = company.get(dimension)
            if not value: continue
            cs = [c for c in own if c['field'] == dimension and c['source_id'] in value.get('source_ids',[])]
            if not cs: continue
            if dimension in {'headquarters','registered_office'}:
                text = ', '.join(str(value[x]) for x in ['city','country_code'] if value.get(x))
                scope = value.get('scope') or value.get('precision') or 'scope stated in sidecar'
                text += '; scope: '+scope
                if value.get('currentness'): text += '; '+value['currentness'].replace('_',' ')
                if value.get('effective_on'): text += '; source-scoped date '+value['effective_on']
                if value.get('source_last_updated'): text += '; source last updated '+value['source_last_updated']+'; effective date unknown'
                if value.get('source_reported_on'): text += '; source reported on '+value['source_reported_on']+'; HQ effective date unknown'
                if value.get('temporal_note'): text += '; '+value['temporal_note']
            else:
                text = '; '.join(str(value[x]) for x in ['legal_name','jurisdiction','legal_form','registration_number'] if value.get(x))
                if value.get('registration_date'): text += '; registered '+value['registration_date']
                if value.get('note'): text += '; '+value['note']
            fact(dimension,label,text,cs)
        for index, alias in enumerate(company.get('aliases', []),1):
            cs = [c for c in own if c['field'] in {'alias','aliases','former_name'} and (c['value']==alias or isinstance(c['value'],dict) and alias in c['value'].values())]
            if cs: fact('alias-'+str(index),'Name alias',alias,cs)
        sectors = [c for c in own if c['field']=='sectors']
        if sectors:
            fact('research-sectors','Research sector classification',', '.join(company['sectors'])+'; categories derived from the described products/services.',sectors)

        # Preserve lifecycle and entity-scope warnings in the legacy-readable
        # projection as well as in the richer ledger. They never become rounds.
        special_labels = {
            'lifecycle':'Company lifecycle observation',
            'corporate_event':'Corporate event, separate from funding',
            'ownership_transaction':'Acquisition, separate from funding',
            'financial_transaction':'Mixed financial transaction',
            'financing_facility':'Debt facility, separate from round proceeds',
            'excluded_financing_proposal':'Proposed financing, not completed funding',
            'founding_chronology':'Company and brand chronology',
        }
        for c in own:
            if c['field'] not in special_labels or not isinstance(c['value'],dict): continue
            value = c['value']
            parts = []
            for key in ['classification','transaction_kind','scope','manager','acquirer','acquisition_period','ticker','listing_started_on','decision_on','announced_on','closed_on','agreement_on','agreement_period','raw_amount_text','raw_commitment_text','note']:
                if value.get(key) is not None:
                    parts.append(key.replace('_',' ')+': '+str(value[key]).replace('_',' '))
            if c['field']=='financing_facility' and value.get('commitment_amount') is not None:
                parts.append('commitment ceiling: '+str(value['commitment_amount'])+' '+value.get('currency','')+'; not drawn proceeds')
            if c['field']=='founding_chronology' or not parts:
                parts = [json.dumps(value,ensure_ascii=False,separators=(', ',': '))]
            text = '; '.join(parts)
            if len(text)<=1000:
                fact('observation-'+c['claim_id'],special_labels[c['field']],text,[c])
            else:
                mapping['omissions'].append({'field':c['field'],'claim_id':c['claim_id'],'reason':'Structured observation exceeds the existing profile-fact limit; full assertion retained in typed sidecar.'})

        round_records = []
        for event in company['funding_events']:
            ec = [claim_by_id[x] for x in event['claim_ids']]
            if event['transaction_kind'] not in {'equity','unspecified'} or event['stage'] is None:
                reason = 'Not an ordinary financing round, or no sourced stage representable in the current required-stage schema; retained in typed sidecar.'
                item = {'entity_id':company['entity_id'],'event_id':event['id'],'reason':reason}
                omissions.append(item); mapping['omissions'].append(item)
                continue
            stage_claims = [c for c in ec if c['value'].get('stage') == event['stage']]
            assert stage_claims, (company['name'],event['id'],'stage')
            # Prefer a page that directly supports several projected fields.
            # Nothing is inherited from a companion URL silently.
            def score(c):
                sid = c['source_id']
                siblings = [x for x in ec if x['source_id']==sid]
                numeric = any(x['value'].get('amount') == event['amount'] and x['value'].get('currency') == event['currency'] for x in siblings) if event['amount'] is not None else False
                dated = any(x['value'].get('announced_on') == event['announced_on'] for x in siblings) if event['announced_on'] is not None else False
                primary = c['source_kind'] in {'primary_company','primary_investor'}
                return (numeric, dated, primary)
            base_claim = max(stage_claims, key=score)
            same = [c for c in ec if c['source_id']==base_claim['source_id']]
            projected = {'id':event['id'],'stage':event['stage'],'source':base_claim['source_url']}
            fm = {'event_id':event['id'],'source_id':base_claim['source_id'],
                  'fields':{'stage':[c['claim_id'] for c in same if c['value'].get('stage') == event['stage']]},
                  'retained_outside_projection':[]}
            for field in ['amount','announced_on']:
                value = event.get(field)
                supporting = [c for c in same if c['value'].get(field) == value] if value is not None else []
                if field == 'amount':
                    supporting = [c for c in supporting if c['value'].get('currency') == event['currency']]
                    if supporting:
                        projected['amount'], projected['currency'] = value, event['currency']
                        fm['fields']['amount'] = fm['fields']['currency'] = [c['claim_id'] for c in supporting]
                    elif value is not None:
                        fm['retained_outside_projection'].append('amount/currency need a companion source')
                        amount_claims = [claim_by_id[x] for x in event['field_claim_ids']['amount']]
                        fact(event['id']+'-amount','Sourced financing amount',str(value)+' '+event['currency']+'; event '+event['id']+'; instrument '+event['transaction_kind'],amount_claims)
                else:
                    if supporting and event['announced_precision']=='day':
                        projected[field] = value
                        fm['fields'][field] = [c['claim_id'] for c in supporting]
                    elif value is not None:
                        fm['retained_outside_projection'].append('announcement date is partial or needs a companion source')
                        date_claims = [claim_by_id[x] for x in event['field_claim_ids']['announced_on']]
                        fact(event['id']+'-announcement','Financing announcement date',value+' ('+event['announced_precision']+' precision); event '+event['id'],date_claims)
            raw = next((c['value'].get('amount_text') or c['value'].get('raw_amount_text') for c in same if c['value'].get('amount_text') or c['value'].get('raw_amount_text')),None)
            if raw: projected['amount_text'] = raw
            note = 'Selected historical financing; instrument: '+event['transaction_kind']+'. '
            if event['transaction_kind']=='unspecified': note += 'Instrument is unverified; do not relabel as equity. '
            if event.get('event_on'):
                note += 'Retrospective event period '+event['event_on']+' ('+event['event_precision']+' precision); not an announcement or closing date. '
            if event['amount'] is None:
                note += 'Numeric amount/currency unresolved or undisclosed; unknown is not zero. '
            if any(c['value'].get('amount_qualifier')=='round_total_after_extension' for c in same):
                note += 'Reported amount is the total after the extension, not an incremental tranche. '
            # Narrative from multiple source pages stays in the typed ledger.
            # Copying it under this single source would misattribute claims.
            if fm['retained_outside_projection']:
                note += ' Additional verified fields remain separately sourced in the country packet.'
            assert len(note.strip()) <= 2000
            projected['note'] = note.strip()
            round_records.append(projected); mapping['funding_rounds'].append(fm)
        if round_records: record['funding_rounds'] = round_records
        if facts: record['profile_facts'] = facts
        mapping['omissions'].append({'field':'typed_investor_relationships','reason':'Current startup schema has no event participant structure; unresolved typed participant claims remain in the sidecar. No entity or edge invented.'})
        records.append(record); maps.append(mapping)

    decisions = []
    for company in companies:
        decisions.append({'candidate_id':company['entity_id'],'entity_id':company['entity_id'],'name':company['name'],'website':company['website'],
                          'candidate_kind':'company','status':'accepted_staged','reason':company['evidence_summary'],
                          'claim_ids':company['claim_ids'],'crawler_seed_approved':False})
    for company in held:
        decisions.append({'candidate_id':company['entity_id'],'entity_id':company['entity_id'],'name':company['name'],'website':company.get('website'),
                          'candidate_kind':'company','status':'held','reason':company['evidence_summary'],
                          'source_ids':sorted({c['source_id'] for c in claims if c['entity_id']==company['entity_id']}),
                          'crawler_seed_approved':False})
    # Count explicitly enrolled candidates only, never every name seen in search.
    pending = deepcopy(lanes['ecosystem']['discovery_candidates'])
    for lead in lanes['games']['discovery_candidates']:
        if lead['status']=='candidate':
            item = deepcopy(lead)
            item['entity_id'] = 'discovery:tr:'+slug(item['name'])
            item['status']='discovery_only'; item['canonical_identity_verified']=False
            pending.append(item)
        elif lead['status']=='rejected':
            item = deepcopy(lead)
            item['candidate_id']='rejected:tr:spyke-com'
            item['status']='rejected'; item['crawler_seed_approved']=False
            decisions.append(item)
    for lead in lanes['fintech']['discovery_candidates']:
        if lead.get('disposition')=='rejected_identity_collision':
            item=deepcopy(lead)
            item.update(candidate_id='rejected:tr:midas-tokenization',entity_id=None,candidate_kind='company',status='rejected',crawler_seed_approved=False)
            decisions.append(item)
    for lead in pending:
        lead.setdefault('candidate_id',lead['entity_id'])
        lead.setdefault('candidate_kind','company')
        lead['crawler_seed_approved']=False
        decisions.append(lead)

    findings = [{'finding_id':f'tr-ecosystem-{i:03d}',**f} for i,f in enumerate(findings,1)]
    queues.sort(key=lambda q:(q.get('priority',9),q['queue_id']))
    write('companies.json',{'batch_id':BATCH_ID,'publication_state':'unsubmitted','companies':companies})
    write('claims.json',{'batch_id':BATCH_ID,'claims':claims})
    write('sources.json',{'batch_id':BATCH_ID,'sources':sources,'scope_note':'A registry of reviewed source observations, not a complete HTTP request log or crawler allowlist.'})
    write('ecosystem.json',{'batch_id':BATCH_ID,'findings':findings})
    write('review-decisions.json',{'batch_id':BATCH_ID,'decisions':decisions,'held_company_evidence':held})
    write('startup-records.json',{'startups':records})
    write('projection-map.json',{'batch_id':BATCH_ID,'production_import_ready':False,
          'policy':'Each projected value uses the particular source supporting it. Unsupported dimensions, partial dates and companion-source values remain in profile facts or typed sidecars. Unknown stage is not invented.',
          'event_id_map':event_map,'normalization_changes':changes,'records':maps,'excluded_events':omissions})
    write('next-source-queue.json',{'batch_id':BATCH_ID,'queue':queues,'pending_discovery_entity_ids':[x['entity_id'] for x in pending],
          'collection_complete':False,'crawler_seed_approvals':0,'note':'Research queue only. Existing planner owns approved source inventory and operational cursors.'})
    write('search-log.json',{'batch_id':BATCH_ID,'lanes':[{'lane':k,'search_log':v['search_log']} for k,v in lanes.items()],
          'limitations':'Heterogeneous bounded research logs; exact early query strings and one Sestek 404 URL were not retained by the games lane. Do not infer request counts or source exhaustion.'})

    def refs(ids):
        return ' '.join('['+sid+']('+by_source[sid]['url']+')' for sid in dict.fromkeys(ids))
    def cell(text):
        return str(text).replace('|','\\|').replace('\n',' ')
    index=['# Türkiye: reviewed company index — batch 001','',
           'Research cutoff: 18 November 2026. These are 21 accepted ecosystem identities, including acquired companies and a listed company. Acceptance is bounded to the selected assertions; it does not certify current private-startup status or a complete funding history. The typed company records and atomic claim ledger remain authoritative.','',
           'Numeric currency codes appear only where an accessed source explicitly disambiguates currency. Raw dollar text is preserved when its currency is unresolved. Date precision and entity scope must survive integration.','']
    for company in companies:
        own=[c for c in claims if c['entity_id']==company['entity_id']]
        index += ['## '+company['name'],'',
                  '**Canonical website:** ['+company['website']+']('+company['website']+').',
                  '**Aliases:** '+(', '.join(company['aliases']) if company['aliases'] else 'None accepted in this bounded review.') , '']
        dc=next(c for c in own if c['field']=='description' and c['status']=='reviewed_staged')
        index += [company['description']+' '+refs([dc['source_id']]),'',
                  '**Research sectors:** '+', '.join(company['sectors'])+'. Categories describe the sourced products/services.','']
        if company['founded']:
            f=company['founded']
            index += ['**Reported founding:** '+str(f['value'])+' ('+f['precision']+' precision). '+f.get('note','')+' '+refs(f['source_ids']),'']
        else:
            index += ['**Reported founding:** unknown. '+company['field_dispositions']['founded']['reason'],'']
        for dim,label in [('headquarters','Headquarters'),('incorporation','Incorporation / legal identity'),('registered_office','Registered office')]:
            value=company.get(dim)
            if value:
                details={k:v for k,v in value.items() if k not in {'source_ids','registered_address'} and v is not None}
                index += ['**'+label+':** '+json.dumps(details,ensure_ascii=False)+' '+refs(value['source_ids']),'']
            elif dim!='registered_office':
                index += ['**'+label+':** unknown or not independently established at the canonical-parent scope. '+company['field_dispositions'][dim]['reason'],'']
        index += ['**Public professional founder assertions:**','']
        for f in company['founders']:
            index += ['- '+f['name']+' — '+f.get('role','Founder')+'. '+refs(f['source_ids'])]
        index += ['','Founder lists are partial; role titles keep the source’s historical scope.','']
        if company['funding_events']:
            index += ['### Selected financing and corporate events','',
                      '| Stage / kind | Announcement or historical period | Amount and scope | Named event participants | Evidence |',
                      '| --- | --- | --- | --- | --- |']
            for e in company['funding_events']:
                when=(e['announced_on']+' ('+e['announced_precision']+' announcement precision)') if e['announced_on'] else ('event period '+e['event_on']+' ('+e['event_precision']+')' if e['event_on'] else 'Announcement date unknown')
                if e['closed_on']: when+='; closed '+e['closed_on']
                amount=(format(e['amount'],',')+' '+e['currency']) if e['amount'] is not None else 'Numeric amount/currency unknown'
                raw=e.get('amount_text') or e.get('raw_amount_text')
                if raw and e['amount'] is None: amount+='; source text '+raw
                amount+='; '+e.get('amount_qualifier','unspecified qualifier')
                participants='; '.join(p['name']+' ('+p['role']+((': '+p['role_text']) if p.get('role_text') else '')+')' for p in e.get('participants',[])) or 'Unknown / none accepted'
                index += ['| '+' | '.join(cell(x) for x in [(e['stage'] or 'Stage unknown')+' / '+e['transaction_kind'],when,amount,participants,refs(e['source_ids'])])+' |']
            index += ['']
            for e in company['funding_events']:
                if e.get('note'): index += ['- **'+e['id']+':** '+e['note']+' '+refs(e['source_ids'])]
            index += ['']
        else:
            index += ['**Selected ordinary financing events:** none accepted in this pass. '+company['field_dispositions']['funding_events']['reason'],'']
        scoped=[c for c in own if c['field'] in {'lifecycle','corporate_event','financing_facility','debt_issuance_observation','excluded_financing_proposal'} and c['status']=='reviewed_staged']
        if scoped:
            index += ['### Additional scope and lifecycle observations','']
            for c in scoped:
                index += ['- **'+c['field'].replace('_',' ')+':** '+json.dumps(c['value'],ensure_ascii=False)+' '+refs([c['source_id']])]
            index += ['']
        conflicts=[c for c in own if c['status'] in {'conflict','candidate'}]
        if conflicts:
            index += ['### Unresolved observations','']
            for c in conflicts:
                index += ['- **'+c['status']+' / '+c['field']+':** '+json.dumps(c['value'],ensure_ascii=False)+'. '+c['rationale']+' '+refs([c['source_id']])]
            index += ['']
        index += ['**Research boundary:** '+company['evidence_summary'],'']
    (HERE/'COMPANIES.md').write_text('\n'.join(index).rstrip()+'\n',encoding='utf-8')

    unique_urls = {s['url'] for s in sources}
    accepted_ids = [c['entity_id'] for c in companies]
    held_ids = [c['entity_id'] for c in held]
    pending_ids = [x['entity_id'] for x in pending]
    counts = {
        'enrolled_candidate_items':len(decisions),
        'enrolled_company_candidates':sum(x.get('candidate_kind')=='company' for x in decisions),
        'fully_reviewed_company_profiles':len(companies)+len(held),
        'reviewed_or_identity_triaged_items':sum(x['status']!='discovery_only' for x in decisions),
        'accepted_staged_company_identities':len(companies),
        'held_company_identities':len(held),
        'rejected_company_identity_candidates':sum(x['status']=='rejected' and x.get('candidate_kind')=='company' for x in decisions),
        'rejected_domain_identity_candidates':sum(x['status']=='rejected' and x.get('candidate_kind')!='company' for x in decisions),
        'pending_discovery_company_candidates':len(pending),
        'claim_count':len(claims),'claim_states':dict(Counter(c['status'] for c in claims)),
        'source_entries':len(sources),'unique_registered_source_urls':len(unique_urls),
        'source_access_states':dict(Counter(s['access_status'] for s in sources)),
        'source_kinds':dict(Counter(s['source_kind'] for s in sources)),
        'company_founder_assertions':sum(len(c['founders']) for c in companies),
        'funding_and_corporate_events_in_funding_sidecar':sum(len(c['funding_events']) for c in companies),
        'event_transaction_kinds':dict(Counter(e['transaction_kind'] for c in companies for e in c['funding_events'])),
        'projected_financing_rounds':sum(len(r.get('funding_rounds',[])) for r in records),
        'projected_numeric_round_amounts':sum('amount' in e for r in records for e in r.get('funding_rounds',[])),
        'separate_financing_facility_claims':sum(c['field']=='financing_facility' for c in claims),
        'separate_corporate_event_claims':sum(c['field']=='corporate_event' for c in claims),
        'ecosystem_findings':len(findings),'next_source_queue_items':len(queues),'production_published':0,
        'crawler_seed_approvals':0}
    bindings = {name:hashlib.sha256((HERE/name).read_bytes()).hexdigest() for name in ['companies.json','claims.json','sources.json','next-source-queue.json']}
    context = sorted(set(c['entity_id'] for c in claims) - set(accepted_ids))
    write('coverage.json',{'batch_id':BATCH_ID,'counts':counts,'context_entity_ids':context,
          'population_denominator':None,'country_completion_claim':False,
          'count_definitions':{
              'enrolled':'Deliberately selected identity or domain candidates only; names incidentally displayed in a portfolio/search page are excluded.',
              'reviewed':'22 company profiles received bounded source review; 2 other identity candidates were excluded during matching. Eleven leads remain discovery only.',
              'accepted':'Identity and selected claims accepted into research staging, not all fields verified and not active-private-startup certification.',
              'source_entries':'Includes multiple observations of the same URL, failed pages and discovery sources; not every network/search request.',
              'founders':'Company-founder assertions, not identity-resolved unique people; repeated cross-company founders retained.',
              'funding':'Selected historical events. Amounts cannot be summed across kinds, currencies, entity scopes or facility commitments.'},
          'checkpoint':{'population_denominator':None,'collection_complete':False,'production_published':0,'crawler_seed_approvals':0,
                        'accepted_entity_ids':accepted_ids,'held_entity_ids':held_ids,'reviewed_entity_ids':accepted_ids+held_ids,
                        'pending_entity_ids':pending_ids,'input_sha256':bindings},
          'gaps':[
              'National eligible startup population and source-list denominators unknown.',
              'Programme, portfolio and newsroom pagination not exhausted; exact UI cursors recorded only when observed.',
              'Current HQ/legal parent and full financing histories remain incomplete for multiple accepted companies.',
              'Current IMF release verified; 2026 NGDPD API values and rank could not be independently recomputed.',
              'Unavailable or partial sources are recorded without bypass; no robots.txt requests or crawler seed approvals.',
              'Some early search strings and one failed Sestek URL were not retained; registry counts are not request counts.',
              'Initial graph substituted 0 for missing founding_year. Owner PR179 merged in refreshed main; fresh graph check records whether absence is preserved. Production adoption still requires owner review and live revision verification.'
          ]})
    print(json.dumps(counts,ensure_ascii=False,indent=2))


if __name__ == '__main__':
    main()
