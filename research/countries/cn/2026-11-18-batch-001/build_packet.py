"""Normalize this bounded research packet only; never writes production inputs.

Input receipts are preserved under inputs/. The output is a research sidecar,
not a new Atlas API or a collector. This does not fetch or re-review sources.
"""
from collections import Counter
from copy import deepcopy
import hashlib
import json
from pathlib import Path
import re
import unicodedata
from urllib.parse import urlsplit

HERE = Path(__file__).resolve().parent
REVIEWED_AT = '2026-11-18T09:58:54Z'
PACKET_RECORDED_AT = '2026-11-18T10:07:12Z'
DATE = '2026-11-18'
BASE = 'f4bcbf7030d741772bb750deee584efa3ee17749'

def read(name): return json.loads((HERE/name).read_text())
def write(name, data): (HERE/name).write_text(json.dumps(data, ensure_ascii=False, indent=2)+'\n')
def digest(value): return hashlib.sha256(json.dumps(value, ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()
def namekey(value): return ' '.join(unicodedata.normalize('NFKC', value).casefold().split())
def domain(value): return urlsplit(value).hostname.lower().removeprefix('www.') if value else None
def source_id(url): return 'cn-source-'+hashlib.sha256(url.encode()).hexdigest()[:16]
def strings(value):
    if isinstance(value, str): yield value
    elif isinstance(value, dict):
        for v in value.values(): yield from strings(v)
    elif isinstance(value, list):
        for v in value: yield from strings(v)

def normalize_participant(value, event, claim, scope='event_specific'):
    result = deepcopy(value)
    original = result.get('role', 'unspecified')
    result.update(event_id=event,
                  name=result.get('name') or result.get('name_as_reported') or result.get('name_original'),
                  role='lead' if original in ('lead','co_lead','co-lead') else 'participant' if original in ('participant','existing_investor_participating') else 'unspecified',
                  role_as_reported=original, resolved_entity_id=None,
                  evidence_scope=scope, source_url=result.get('source_url') or claim['source_url'],
                  supporting_claim_id=claim['claim_id'])
    result.setdefault('investment_vehicle', None)
    result.setdefault('contribution_amount', None)
    result.setdefault('contribution_currency', None)
    return result

lanes = {name:read('inputs/'+name+'.json') for name in ('ai','robotics','deeptech')}
ecosystem = read('inputs/ecosystem.json')
root_review = read('inputs/root-review.json')
baseline = read('baseline.json')
sources = {}

def register_source(source, lane):
    if isinstance(source, str): return
    url = source.get('url') or source.get('source_url')
    if not url: return
    row = sources.setdefault(url, {'source_id':source_id(url), 'url':url,
        'publisher':source.get('publisher'), 'title':source.get('title'),
        'source_kinds':[], 'languages':[], 'access_observations':[],
        'crawler_seed_approved':False, 'claim_ids':[],
        'rights_note':'Retained factual paraphrases and bibliographic links only; no page-body archive, contact harvesting or automatic crawler approval.'})
    obs = deepcopy(source); obs['lane'] = lane
    if obs not in row['access_observations']: row['access_observations'].append(obs)
    kind = source.get('source_kind')
    if kind and kind not in row['source_kinds']: row['source_kinds'].append(kind)
    language = source.get('language')
    if language and language not in row['languages']: row['languages'].append(language)
    if not row['publisher'] and source.get('publisher'): row['publisher']=source['publisher']
    if not row['title'] and source.get('title'): row['title']=source['title']

for lane, data in lanes.items():
    for source in data.get('source_registry', []): register_source(source,lane)
    for company in data['companies']:
        for source in company.get('sources', []): register_source(source,lane)
    for source in data.get('source_access_gaps', [])+data.get('access_gaps', []): register_source(source,lane)
for source in ecosystem['sources']: register_source(source,'ecosystem')
for source in root_review['sources']: register_source(source,'root_review')

claims, observations, companies = [], [], []
geography_fields = {'headquarters','headquarters_district','incorporation_geography',
    'operating_location','contact_office','principal_office','registered_location',
    'entity_administrative_geography','registered_geography','country_association','operating_locations'}
status_map = {'accepted':'reviewed_staged','reviewed_staged':'reviewed_staged',
    'conflicted':'conflict','reviewed_conflict':'conflict','resolved_conflict':'reviewed_staged'}

def normalize_claim(original, entity, lane, index=None):
    c = deepcopy(original)
    c['claim_id'] = f'cn:{entity}:{index:03d}' if index is not None else original['claim_id']
    c['entity_id'] = entity
    c['origin'] = {'lane':lane,'local_index':index,'original_id':original.get('id')}
    c.pop('id',None)
    c['original_status'] = original['status']
    if original['status'] not in status_map:
        c['status']='candidate'; c['publication_state']='unsubmitted'
        observations.append(c); return None
    c['status'] = status_map[original['status']]
    c['publication_state'] = 'unsubmitted'
    c['source_id'] = source_id(c['source_url'])
    c['original_source_id'] = original.get('source_id')
    c['retrieved_on'] = original['retrieved_at'][:10]
    c['retrieval_precision'] = original.get('retrieval_precision') or ('batch_receipt' if lane=='deeptech' else 'session_receipt' if lane=='ecosystem' else 'second')
    if len(c['retrieved_at'])==10:
        c['retrieved_at'] += 'T00:00:00Z'
        c['retrieval_precision']='day'
        c['retrieval_timestamp_semantics']='Lower bound of the known UTC date; midnight is not an observed request time.'
    elif lane in ('deeptech','ecosystem'):
        c['retrieval_timestamp_semantics']='Research-batch/session receipt clock, not exact per-page fetch time; retrieval date is authoritative.'
    c['original_reviewed_at'] = original.get('reviewed_at')
    if not original.get('reviewed_at') or len(original['reviewed_at'])==10:
        c['reviewed_at']=REVIEWED_AT
        c['review_timestamp_semantics']='Root structural/evidence-scope review of the received lane claim; source retrieval is not refreshed.'
    for field in ('published_on','effective_on'):
        c.setdefault(field,None)
        if c[field] and not re.fullmatch(r'\d{4}-\d{2}-\d{2}',c[field]):
            value=c[field]
            c[field+'_partial']={'value':value,'precision':'year' if len(value)==4 else 'month'}
            c[field]=None
    if c['field']=='funding_round.participant':
        c['field']='round_participant'
        c['value']=normalize_participant(c['value'],c['value']['event_id'],c)
    elif c['field']=='funding_round':
        c['value']['event_id']=c['value'].get('event_id') or c['value']['id']
        c['value'].setdefault('amount_scope','round_total')
        c['value']['participants']=[normalize_participant(p,c['value']['event_id'],c) for p in c['value'].get('participants',[])]
    elif c['field']=='funding_aggregate':
        c['value']['participants']=[normalize_participant(p,c['value']['id'],c,'aggregate_only') for p in c['value'].get('participants',[])]
    if c['source_url'] not in sources:
        register_source({'url':c['source_url'],'source_kind':c['source_kind'],'accessed':True,
            'access_status':'read_claim_receipt','retrieved_at':original['retrieved_at'],
            'note':'Source registered from an accessed claim receipt; original lane omitted separate registry row.'},lane)
    sources[c['source_url']]['claim_ids'].append(c['claim_id'])
    if c['source_kind'] not in sources[c['source_url']]['source_kinds']:
        sources[c['source_url']]['source_kinds'].append(c['source_kind'])
    claims.append(c)
    return c

existing_names={namekey(c['name']):c['id'] for c in baseline['existing_startups']}
existing_domains={domain(c['website']):c['id'] for c in baseline['existing_startups'] if c.get('website')}
for lane,data in lanes.items():
    for original in data['companies']:
        own=[]
        for i,c in enumerate(original['claims'],1):
            fact=normalize_claim(c,original['id'],lane,i)
            if fact: own.append(fact)
        status='accepted_staged' if original['candidate_status']=='accepted' else 'queued' if original['candidate_status']=='queued_unreviewed' else 'deferred'
        aliases=[]
        for alias in original['aliases']:
            refs=[c['claim_id'] for c in own if 'alias' in c['field'] or c['field'] in ('identity','legal_name','legal_name_observed')
                if any(namekey(alias)==namekey(s) for s in strings(c['value']))]
            aliases.append({'value':alias,'claim_ids':refs,'status':'reviewed_staged' if refs else 'candidate_label_only'})
        alias_matches=[{'label':a,'existing_id':existing_names[namekey(a)]} for a in [original['name']]+original['aliases'] if namekey(a) in existing_names]
        own_domains=[existing_domains[domain(original['website'])]] if domain(original['website']) in existing_domains else []
        company={'id':original['id'],'name':original['name'],'website':original['website'],
            'aliases':aliases,'lane':lane,'status':status,'original_disposition':original['candidate_status'],
            'disposition_reason':original.get('disposition_reason') or original.get('acceptance_meaning') or ('Await primary identity/domain review.' if status=='queued' else 'Evidence-ready bounded staging; not a complete or current-private-status certification.'),
            'claim_ids':[c['claim_id'] for c in own],
            'china_basis_claim_ids':[c['claim_id'] for c in own if c['field'] in geography_fields and any(s in ('CN','China','Hangzhou','Beijing','Shanghai','Shenzhen') for s in strings(c['value']))],
            'headquarters_claim_ids':[c['claim_id'] for c in own if c['field']=='headquarters'],
            'incorporation_claim_ids':[c['claim_id'] for c in own if 'incorporat' in c['field']],
            'founding_claim_ids':[c['claim_id'] for c in own if c['field'] in ('founding_date','founded','founded_on')],
            'founder_claim_ids':[c['claim_id'] for c in own if c['field'].startswith('founder')],
            'sector_claim_ids':[c['claim_id'] for c in own if c['field']=='sectors'],
            'unknowns':deepcopy(original['unknowns']),
            'conflicts':deepcopy(original.get('conflicts',[])),
            'deduplication':{'baseline_revision':BASE,'canonical_name_or_alias_matches':alias_matches,
                'canonical_domain_matches':own_domains,'existing_entity_resolution':'none' if not alias_matches+own_domains else 'review_required',
                'method':'NFKC/casefold/whitespace names and aliases; exact HTTPS hostname with www removed; no fuzzy identity merge.',
                'limits':'Committed/published inventories do not expose a complete alias register. Chinese aliases also checked against committed production JSON; absence is not a global identity proof.'},
            'publication_state':'unsubmitted'}
        for u in company['unknowns']:
            u.setdefault('value',None)
            u['status']=u.pop('disposition',u.get('status','searched_unknown'))
            if u['status']=='not_verified':u['status']='searched_unknown'
        companies.append(company)
for original in ecosystem['claims']: normalize_claim(original,original['entity_id'],'ecosystem')
for original in root_review['claims']: normalize_claim(original,original['entity_id'],'root_review')

# Index retained event components; never synthesize missing amounts or dates.
events={};aggregates=[];intentions=[]
for c in claims:
    field,value=c['field'],c['value']
    if field=='funding_aggregate':
        aggregates.append({'company_id':c['entity_id'],'claim_id':c['claim_id'],'aggregate_id':value['id'],'additive':False,'source_url':c['source_url']})
        continue
    if field=='funding_intent':
        intentions.append({'company_id':c['entity_id'],'claim_id':c['claim_id'],'source_url':c['source_url'],'completed_round':False})
        continue
    event=value.get('event_id') or value.get('round_id') or value.get('id') if isinstance(value,dict) and (field.startswith('funding_round') or field=='round_participant') else None
    if not event:continue
    row=events.setdefault(event,{'event_id':event,'company_id':c['entity_id'],'claim_ids':[],
        'component_claims':[],'participants':[],'participant_list_complete':False,
        'amount_observations':[],'date_observations':[],'graph_relationships_created':0,
        'production_state':'unsubmitted','additive_amount_aggregation_permitted':False})
    row['claim_ids'].append(c['claim_id']);row['component_claims'].append({'field':field,'claim_id':c['claim_id']})
    if field=='round_participant': row['participants'].append(deepcopy(value))
    if field=='funding_round': row['participants'].extend(deepcopy(value.get('participants',[])))
    if field in ('funding_round','funding_round.amount'):
        row['amount_observations'].append({'claim_id':c['claim_id'],'amount':value.get('amount'),
            'currency':value.get('currency'),'qualifier':value.get('amount_qualifier') or value.get('qualifier','unknown'),
            'amount_scope':value.get('amount_scope','round_total'),'amount_text':value.get('amount_text'),
            'source_url':c['source_url']})
    if field=='funding_round':
        for key in ('announced_on','closed_on','reported_on','reported_by'):
            if value.get(key):row['date_observations'].append({'claim_id':c['claim_id'],'kind':key,'value':value[key],'precision':'day' if len(value[key])==10 else 'month' if len(value[key])==7 else 'year'})
        if value.get('event_date'):row['date_observations'].append({'claim_id':c['claim_id'],'kind':'event_date',**value['event_date']})
    elif field not in ('funding_round.stage','funding_round.amount','round_participant') and value.get('date'):
        row['date_observations'].append({'claim_id':c['claim_id'],'kind':field.removeprefix('funding_round.'),'value':value['date'],'precision':value.get('precision'),'event_type':value.get('event_type')})
for company in companies:
    company['funding_event_ids']=[e['event_id'] for e in events.values() if e['company_id']==company['id']]
    for event in events.values():
        if event['company_id']==company['id']:event['company_status']=company['status']

for row in sources.values():
    row['accessed_for_retained_claim']=bool(row['claim_ids'])
    row['retained_claim_count']=len(row['claim_ids'])
    row['access_statuses']=sorted({o.get('access_status') or o.get('status') or 'unspecified' for o in row['access_observations']})
    row['pagination']={'exhausted':False,'status':'not_claimed','cursor':None}

queue=[];searches=[];decisions=[]
for lane,data in {**lanes,'ecosystem':ecosystem}.items():
    for i,item in enumerate(data.get('source_queue',[]),1):
        q=deepcopy(item);q['queue_id']=f'cn-next-{lane}-{i:02d}';q['lane']=lane
        q['crawler_seed_approved']=False;q.setdefault('status','queued');q.setdefault('priority',2)
        q['cursor']=q.get('cursor') or q.get('resume_cursor')
        q['cursor_semantics']='Observed source pagination; not an opaque API cursor. Recheck current controls before resuming.' if q['cursor'] else 'Manual next-source task; no source pagination cursor established.'
        queue.append(q)
    for item in data.get('search_log',[]):searches.append({'lane':lane,**item})
    for item in data.get('review_decisions',data.get('rejected_mappings',[])):decisions.append({'lane':lane,**item})

leads=[]
for i,item in enumerate(ecosystem['discovery_only_leads'],1):
    lead={'lead_id':f'cn-discovery-{i:03d}',**item,'crawler_seed_approved':False}
    match=next((c for c in companies if namekey(c['name'])==namekey(item['name'])),None)
    if match:lead.update(dedup_disposition='overlaps_reviewed_worklist',matched_entity_id=match['id'])
    elif namekey(item['name']) in existing_names:lead.update(dedup_disposition='existing_atlas_entity',matched_entity_id=existing_names[namekey(item['name'])])
    else:lead.update(dedup_disposition='new_discovery_label_unreviewed',matched_entity_id=None)
    leads.append(lead)

ordered=[c['id'] for c in companies]
reviewed=[c['id'] for c in companies if c['status']!='queued']
counts={'worklist_discovered':len(companies),'reviewed':len(reviewed),
    'accepted_staged':sum(c['status']=='accepted_staged' for c in companies),
    'deferred':sum(c['status']=='deferred' for c in companies),'queued':len(companies)-len(reviewed),
    'rejected_company_identities':0,'reviewed_claims_including_conflicts':len(claims),
    'unresolved_candidate_observations':len(observations),'source_urls_registered':len(sources),
    'source_urls_supporting_retained_claims':sum(bool(s['claim_ids']) for s in sources.values()),
    'funding_events_all_reviewed_candidates':len(events),
    'funding_events_accepted_candidates':sum(e['company_status']=='accepted_staged' for e in events.values()),
    'nonadditive_funding_aggregates':len(aggregates),'funding_intentions':len(intentions),
    'retained_review_decisions':len(decisions),'next_source_tasks':len(queue)}
counts['source_urls_without_retained_claims']=counts['source_urls_registered']-counts['source_urls_supporting_retained_claims']
coverage={'packet_version':1,'country_code':'CN','source_revision':BASE,'recorded_at':PACKET_RECORDED_AT,
    'normalization_review_started_at':REVIEWED_AT,
    'counts':counts,'eligible_population':{'denominator':None,'complete':False,
        'meaning':'No defensible national startup-population denominator; 22 is a deliberately selected worklist only.'},
    'discovery_queue_counts':dict(Counter(x['dedup_disposition'] for x in leads)),
    'checkpoint':{'ordered_ids':ordered,'worklist_sha256':digest(ordered),'reviewed_ids':reviewed,
        'pending_ids':[x for x in ordered if x not in reviewed],
        'resume_rule':'Reject changed worklist hash; resume only pending IDs. Review metadata/source queue separately; do not reset passed IDs or enlarge denominator silently.'},
    'source_queue':queue,'pagination_gaps':[
        {'source':'https://www.hsgcap.com/companies/','observed_rows':10,'denominator':None,'exhausted':False,'gap':'Only initial visible global-portfolio rows; page explicitly not exhaustive. Geography not implied.'},
        {'source':'https://www.qimingvc.com/','observed_rows':None,'denominator':None,'exhausted':False,'gap':'Selected company/funding pages only; no portfolio or news pagination sweep.'},
        {'source':'https://www.infinigence-ai.com/news.html','pages_reviewed':[1],'next_page':2,'pages_total_observed':21,'entries_total_observed':182,'denominator_kind':'news_posts_not_startups','exhausted':False,'gap':'Page controls are observed; later pages and full financing history remain unreviewed.'},
        {'source':'https://www.galbot.com/news/','pages_reviewed':[1],'next_page':2,'pages_total_observed':9,'denominator':None,'exhausted':False,'gap':'Nine-page control observed; later pages remain unreviewed.'},
        {'source':'company press/news archives','observed_rows':None,'denominator':None,'exhausted':False,'gap':'Targeted announcements, not complete histories or category/archive pagination.'},
        {'source':'national/provincial incubator and fund portfolios','observed_rows':None,'denominator':None,'exhausted':False,'gap':'Most regional rosters not enumerated in this first AI/robotics/deeptech-heavy pass.'}],
    'crawler_runs':0,'crawler_seeds_approved':0,'production_writes':0,'outreach_messages':0,
    'complete_funding_histories_claimed':0,
    'retrieval_note':'Counts measure retained evidence URLs, not total searches/requests or all successful pages. Date-only receipts carry explicit day precision; batch clocks do not imply exact fetch seconds.',
    'ownership_acknowledgement':'Coordination notice is not acknowledgement or source approval.'}

write('companies.json',{'schema_version':1,'country_code':'CN','companies':companies})
write('claims.json',{'schema_version':1,'scope':'China bounded research claims; not production writes','claims':claims})
write('unresolved.json',{'schema_version':1,'observations':observations,'review_decisions':decisions,
    'note':'Company-level unknowns are in companies.json; conflicts remain source assertions in claims.json. Rejected mappings are not rejected company identities.'})
write('source-registry.json',{'schema_version':1,'retrieval_date':DATE,'sources':sorted(sources.values(),key=lambda s:s['source_id'])})
write('funding-ledger.json',{'schema_version':1,'events':list(events.values()),'aggregates':aggregates,'intentions':intentions,
    'note':'Derived index of preserved claim IDs, not additional independent claims. No total capital sum; unresolved fund/manager/brand identities are not graph edges. Contributions are never round totals.'})
write('coverage.json',coverage)
write('country-scope.json',{'schema_version':1,**ecosystem['cohort'],
    'scope_rule':'Mainland-China company nexus is evidenced separately from holding-company incorporation. Taiwan, Hong Kong SAR and Macao SAR are not reassigned into the CHN cohort; cross-border sources can support distinct claims.',
    'imf_sources':['https://www.imf.org/external/datamapper/api/v1/NGDPD/2026','https://www.imf.org/external/datamapper/datasets/WEO','https://data.imf.org/datasets/WEO'],
    'api_value_state':'unavailable; no exact GDP value or independently recomputed rank asserted'})
write('discovery-leads.json',{'schema_version':1,'leads':leads,'counts':dict(Counter(x['dedup_disposition'] for x in leads)),
    'scope':'15 visible source labels; not 15 accepted China startups. Two overlap reviewed/existing identities. Remaining 13 need primary identity, geography and current-status review.'})
write('search-log.json',{'schema_version':1,'queries':searches,
    'scope':'Lane query summaries and exact queries where recorded; not a literal log or count of every web request. Source registry preserves selected access outcomes.'})
print(json.dumps(counts,indent=2))
