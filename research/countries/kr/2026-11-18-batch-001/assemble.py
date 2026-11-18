#!/usr/bin/env python3
"""Rebuild this country checkpoint only; never writes production data or runs a crawler."""
import copy
import hashlib
import json
import re
import unicodedata
from collections import Counter
from pathlib import Path
from urllib.parse import urlsplit

HERE=Path(__file__).resolve().parent
REPO=HERE.parents[3]
PACKET='kr-2026-11-18-batch-001'
REV='f4bcbf7030d741772bb750deee584efa3ee17749'
DATE='2026-11-18'
def read(path):return json.loads((HERE/path).read_text())
def write(path,data):(HERE/path).write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
def sha(path):return hashlib.sha256((HERE/path).read_bytes()).hexdigest()
def norm(s):return ' '.join(unicodedata.normalize('NFKC',s).casefold().split())
def slug(s):return re.sub(r'[^a-z0-9]+','-',unicodedata.normalize('NFKD',s).encode('ascii','ignore').decode().lower()).strip('-')
def domain(s):return (urlsplit(s).hostname or '').lower().removeprefix('www.').rstrip('.')
def compact(v):return json.dumps(v,ensure_ascii=False,separators=(',',':'))

lanes={k:read('evidence/lanes/'+k+'.json') for k in ['hardware','software','consumer']}
eco=read('evidence/lanes/ecosystem.json')
sources=[];claims=[];companies=[];excluded=[];queue=[]
for lane,d in lanes.items():
    for s in d['sources']:
        s=copy.deepcopy(s);s['lane']=lane;s['accessed']=s.get('accessed',s['access_status']=='accessed');s['crawler_approval']=False;sources.append(s)
    for raw in d['companies']:
        c=copy.deepcopy(raw);rows=c.pop('claims');claims.extend(rows)
        c['lane']=lane;c['claim_ids']=[x['claim_id'] for x in rows]
        c['review_disposition']=c.get('review_disposition','accepted_staged')
        c['proposed_atlas_id']='startup:'+slug(c['canonical_name'])
        c['country_scope']='South Korea ecosystem association; HQ and incorporation are separately evidenced fields'
        c['history_complete']=False
        c['funding_events']=[{'claim_id':x['claim_id'],'status':x['status'],**x['value']} for x in rows if x['field']=='funding_round']
        c['round_participations']=[{'claim_id':x['claim_id'],'status':x['status'],**x['value']} for x in rows if x['field']=='round_participant']
        companies.append(c)
    for x in d.get('excluded',[]):
        if 'staging_id' not in x:continue  # Claim-level exclusions remain in the raw lane and claims.
        x=copy.deepcopy(x);claims.extend(x.pop('claims',[]));x['lane']=lane;excluded.append(x)
    for i,item in enumerate(d.get('next_queue',[]),1):
        queue.append({'id':f'kr-{lane}-q{i:02}','lane':lane,'status':'queued','crawler_approval':False,'task':item})
for s in eco['sources']:
    s=copy.deepcopy(s);s['lane']='ecosystem';s['source_kind']=s.get('source_kind','primary_'+s.get('publisher_type','programme'));s['accessed']=s.get('accessed',s['access_status']=='accessed');s['crawler_approval']=False;sources.append(s)
for i,item in enumerate(eco['next_source_queue'],1):queue.append({'id':f'kr-ecosystem-q{i:02}','lane':'ecosystem','status':'queued','crawler_approval':False,'task':item})
S={x['id']:x for x in sources};C={x['claim_id']:x for x in claims}
accepted=[c for c in companies if c['review_disposition']=='accepted_staged']
held=[c for c in companies if c['review_disposition']=='held']

# Source IDs are stable observations. Multiple URLs can be aliases or separately
# observed reads; counts below explicitly distinguish source rows and unique URLs.
write('sources.json',{'packet_id':PACKET,'scope':'company and ecosystem source observations; IMF responses are separate evidence files','sources':sources})
write('claims.json',{'packet_id':PACKET,'semantics':'Research claims, including held/conflicted/rejected observations. Status is not production approval.','claims':claims})
write('companies.json',{'packet_id':PACKET,'country_code':'KR','companies':companies,'listed_graduates':excluded})
write('next-source-queue.json',{'packet_id':PACKET,'country_population_denominator':None,'queue':queue})

projections=[];maps=[]
for c in accepted:
    rows=[C[x] for x in c['claim_ids'] if C[x]['status']=='reviewed_staged']
    identity=next(x for x in rows if x['field']=='identity')
    description=next(x for x in rows if x['field']=='description')
    r={'name':c['canonical_name'],'website':c['website'],'description':c['description'],'source':description['source_url'],'reviewed_at':DATE}
    m={'staging_id':c['staging_id'],'name':c['canonical_name'],'field_claim_ids':{'name':[identity['claim_id']],'website':[identity['claim_id']],'description':[description['claim_id']],'source':[description['claim_id']]},'omissions':[]}
    facts=[];founders=[];rounds=[]
    def fact(key,label,value,cl):
        value=' '.join(value.split())
        assert len(value)<=1000,(c['canonical_name'],key)
        n=len(facts);facts.append({'key':key,'label':label,'value':value,'source':cl['source_url'],'reviewed_at':DATE})
        m['field_claim_ids'][f'profile_facts.{n}']=[cl['claim_id']]
    for cl in rows:
        v=cl['value'];field=cl['field']
        if field=='founding_date':
            val=v.get('date',v.get('value'))
            if val:
                fact('founding-date','Founding date and scope',f"{val}; precision: {v.get('precision')}; {v.get('basis',v.get('meaning','source-reported company founding'))}.",cl)
                if cl['source_url']==r['source']:
                    r['founded_year']=int(val[:4]);m['field_claim_ids']['founded_year']=[cl['claim_id']]
                else:m['omissions'].append({'field':'founded_year','reason':'Founding has a different source; use the separately sourced profile fact.','claim_ids':[cl['claim_id']]})
        elif field=='founder':
            name=v['name']
            if not slug(name):
                fact('founder-'+str(len(facts)+1),'Public founder observation',name+'; '+v.get('role','founder')+'; native spelling retained.',cl)
                m['omissions'].append({'field':'founders','reason':'Native-only spelling cannot form the current graph ASCII person ID.','claim_ids':[cl['claim_id']]})
            else:
                n=len(founders);founders.append({'name':name,'source':cl['source_url']});m['field_claim_ids'][f'founders.{n}']=[cl['claim_id']]
        elif field in ['headquarters','operating_location','location','principal_place_of_business']:
            # A filed principal place of business remains that exact scope.
            label=v.get('kind',v.get('role',field if field in ['headquarters','principal_place_of_business'] else 'business location'))
            if field=='headquarters' and c['headquarters']:
                label=c['headquarters'].get('kind',label)
            place=', '.join(str(v[k]) for k in ['city','region','country_code','country'] if v.get(k))
            if place:fact('location-'+str(len(facts)+1),'Location — '+label.replace('_',' '),place+(f"; as of {v['as_of']}" if v.get('as_of') else '')+'.',cl)
        elif field in ['legal_establishment','incorporation']:
            fact('legal-establishment','Legal establishment evidence',compact(v),cl)
        elif field=='sectors':fact('sectors','Research sector classification',', '.join(v)+'.',cl)
        elif field in ['name_change','merger','service_rename','subsidiary_relationship','predecessor','country_affiliation']:
            fact(field.replace('_','-'),field.replace('_',' ').capitalize(),compact(v),cl)
        elif field in ['investment_event','strategic_stake']:
            fact('strategic-transaction','Strategic transaction — primary/secondary split unknown',compact(v),cl)
        elif field=='funding_round':
            e=v
            er={'id':e['event_id'],'stage':e.get('stage') or 'Investment (stage not reported)','source':cl['source_url']}
            n=len(rounds);m['field_claim_ids'][f'funding_rounds.{n}']=[cl['claim_id']]
            dt=e.get('announced_on')
            if dt and re.fullmatch(r'\d{4}-\d{2}-\d{2}',dt):er['announced_on']=dt
            if e.get('amount') is not None and e.get('currency') is not None:er.update(amount=e['amount'],currency=e['currency'])
            at=e.get('amount_text') or e.get('reported_amount_text')
            if at:er['amount_text']=at
            notes=[]
            if e.get('note'):notes.append(e['note'])
            if e.get('status'):notes.append('Source transaction status: '+e['status'].replace('_',' ')+'.')
            if dt and 'announced_on' not in er:notes.append('Source date precision: '+dt+'; no exact day projected.')
            if e.get('event_period'):notes.append('Source event period: '+e['event_period']+'. Publication date is not substituted.')
            if e.get('date') and not dt:notes.append('Source date observation: '+compact(e['date'])+'.')
            if e.get('amount') is None:notes.append('Numeric amount/currency omitted where unresolved; not zero.')
            if not e.get('stage'):notes.append('Series label not reported by this event source.')
            if e.get('primary_secondary_split') is None:notes.append('Primary/secondary split not established; excluded from aggregate new-money totals.')
            for stageclaim in rows:
                if stageclaim['field']=='funding_round_stage' and stageclaim['value']['event_id']==e['event_id']:
                    notes.append('Separate follow-up identifies '+stageclaim['value']['stage']+': '+stageclaim['source_url'])
                    m['field_claim_ids'][f'funding_rounds.{n}'].append(stageclaim['claim_id'])
            er['note']=' '.join(notes) if notes else 'Partial event observation; not a complete financing history.'
            assert len(er['note'])<=2000
            rounds.append(er)
    if founders:r['founders']=founders
    if facts:r['profile_facts']=facts
    if rounds:r['funding_rounds']=rounds
    for cl in [C[x] for x in c['claim_ids'] if C[x]['status']!='reviewed_staged']:
        m['omissions'].append({'field':cl['field'],'reason':'Claim status '+cl['status']+'; retained only in research ledger.','claim_ids':[cl['claim_id']]})
    m['omissions'].append({'field':'relationships','reason':'Investor entity IDs unresolved and current production contract cannot represent event-specific participation. All participant evidence stays in sidecar.','claim_ids':[x['claim_id'] for x in rows if x['field']=='round_participant']})
    projections.append(r);maps.append(m)
write('startup-records.json',{'reviewed':DATE,'startups':projections})
write('projection-map.json',{'packet_id':PACKET,'production_schema':'backend/hosted/src/startup-record.mjs','schema_revision':REV,'records':maps})

# Deduplicate exact normalized identity, graph slug and host; aliases are compared
# as scoped evidence, not silently merged into legal entities.
baseline=read('evidence/built-baseline.json')
base=json.loads((REPO/'data/startup-research.json').read_text())['startups']
base_by_id={x['id']:x for x in baseline['startups']}
for x in base:base_by_id['startup:'+slug(x['name'])]={**base_by_id.get('startup:'+slug(x['name']),{}),**x}
checks=[]
for c in companies:
    names={norm(c['canonical_name']),*(norm(a['name']) for a in c.get('aliases',[]))}
    hits=[]
    for bid,b in base_by_id.items():
        reasons=[]
        if norm(b['name']) in names:reasons.append('normalized_name_or_alias')
        if bid==c['proposed_atlas_id']:reasons.append('graph_slug')
        if b.get('website') and domain(b['website'])==c['canonical_domain']:reasons.append('canonical_domain')
        if reasons:hits.append({'id':bid,'reasons':reasons})
    checks.append({'staging_id':c['staging_id'],'proposed_atlas_id':c['proposed_atlas_id'],'canonical_domain':c['canonical_domain'],'matches':hits,'decision':'new_candidate' if not hits else 'review_match_before_promotion'})
within=[]
for i,a in enumerate(companies):
    an={norm(a['canonical_name']),*(norm(x['name']) for x in a.get('aliases',[]))}
    for b in companies[i+1:]:
        bn={norm(b['canonical_name']),*(norm(x['name']) for x in b.get('aliases',[]))}
        reasons=[]
        if an&bn:reasons.append('normalized_name_or_alias')
        if a['proposed_atlas_id']==b['proposed_atlas_id']:reasons.append('graph_slug')
        if a['canonical_domain']==b['canonical_domain']:reasons.append('canonical_domain')
        if reasons:within.append({'left':a['staging_id'],'right':b['staging_id'],'reasons':reasons})
write('deduplication.json',{'packet_id':PACKET,'source_revision':REV,'authoritative_overlay_count':len(base),'built_graph_startup_count':len(base_by_id),'exact_baseline_matches':sum(bool(c['matches']) for c in checks),'within_packet_collisions':within,'records':checks,'limitations':['Exact names/aliases, ASCII graph slugs and full website hosts checked. No claim that every worldwide legal entity or transliteration has been resolved.','Socra AI retains Riiid former-name evidence within one packet. Rebellions/Sapeon merger is not an alias merge.','Company IDs remain proposed; production and canonical investor/person identity adoption is owner-reviewed.']})

events=[x for x in claims if x['field']=='funding_round']
accepted_ids={c['staging_id'] for c in accepted}
accepted_events=[x for x in events if x['status']=='reviewed_staged' and x['entity_id'] in accepted_ids]
ae={x['value']['event_id'] for x in accepted_events}
participants=[x for x in claims if x['field'] in ['round_participant','event_participant']]
funding_participants=[x for x in participants if x['value']['event_id'] in ae and x['status']=='reviewed_staged']
company_counts={'selected_discovered':len(companies)+len(excluded)+1,'reviewed':len(companies)+len(excluded),'accepted_staged':len(accepted),'held':len(held),'rejected_from_this_startup_batch':len(excluded),'discovery_only':1,'accepted_complete_profiles':0}
coverage={'packet_id':PACKET,'denominator':{'kind':'explicitly selected country research candidates','selected_count':company_counts['selected_discovered'],'country_startup_population':None,'country_complete':False},'company_counts':company_counts,'claim_counts':dict(Counter(x['status'] for x in claims)),'company_claims_total':len(claims),'ecosystem_findings':len(eco['findings']),'source_counts':{'registry_observations':len(sources),'unique_urls':len({x['url'] for x in sources}),'accessed_observations':sum(x['accessed'] for x in sources),'unavailable_or_not_used':sum(not x['accessed'] for x in sources)},'funding':{'all_funding_observations':len(events),'accepted_company_reviewed_events':len(accepted_events),'projected_events':sum(len(x.get('funding_rounds',[])) for x in projections),'all_event_participant_observations_including_strategic':len(participants),'accepted_funding_event_participant_observations':len(funding_participants),'complete_funding_histories':0,'aggregate_funding_total':None},'founders':{'projected_public_professional_observations':sum(len(x.get('founders',[])) for x in projections),'complete_founder_lists':0},'queue':{'items':len(queue),'file':'next-source-queue.json','sha256':sha('next-source-queue.json')},'dispositions':[{'staging_id':c['staging_id'],'name':c['canonical_name'],'disposition':c['review_disposition'],'field_dispositions':c['field_dispositions']} for c in companies]+[{'staging_id':x['staging_id'],'name':x['canonical_name'],'disposition':'rejected_from_this_batch_listed_graduate','reason':x['reason']} for x in excluded]+[{'staging_id':'unresolved:kr:kurly','name':'Kurly','disposition':'discovery_only'}],'pagination_gaps':[{'source':'Pangyo consortium directory','reported_rows':38,'reported_pages':5,'pages_read':[1],'rows_read':8,'next_pages':[2,3,4,5],'is_startup_denominator':False},{'source':'Toss newsroom after redirect','reported_releases':124,'reported_pages':14,'pages_read':[1],'next_pages':list(range(2,15)),'old_article_verified':False},{'source':'Medical AI notices','reported_notices':21,'reported_pages':3,'notices_opened':1,'complete':False},{'source':'Mobilint newsroom','visible_initial_links':9,'load_more_traversed':False},{'source':'Other company/investor/programme archives','complete':False,'denominator':None}],'source_gaps':['Current Wrtn official domains blocked; historical domain source is retained with identity hold.','Deep Bio Series A title/body amount and chronology conflict; event and its participants are not promoted.','Medical AI founding/origin conflict remains unresolved.','Most HQ and incorporation fields unverified; office, research origin, nationality and principal place of business retain their own labels.','Programme selection lists, current TIPS operator roster and private VC portfolios not comprehensively traversed.','Search results are bounded discovery and are not a count of all companies encountered or all eligible startups.'],'request_ledgers':{'hardware':lanes['hardware']['run'].get('request_budget'),'software':lanes['software']['run'].get('request_counts'),'consumer':lanes['consumer']['run'].get('request_budget'),'ecosystem':eco['run'],'integration':'evidence/integration-review.json'},'crawler_runs':0,'source_approvals':0,'production_writes':0}
write('coverage.json',coverage)
completed=[x['staging_id'] for x in coverage['dispositions'] if x['disposition']!='discovery_only']
selection=[x['staging_id'] for x in coverage['dispositions']]
fingerprint=hashlib.sha256(compact({'revision':REV,'selection':selection,'queue_sha256':sha('next-source-queue.json')}).encode()).hexdigest()
write('checkpoint.json',{'packet_id':PACKET,'source_revision':REV,'kind':'static_research_checkpoint_not_a_crawler_cursor','selected_candidate_order':selection,'reviewed_candidate_ids':completed,'remaining_candidate_ids':['unresolved:kr:kurly'],'next_source_queue_sha256':sha('next-source-queue.json'),'configuration_fingerprint':fingerprint,'resume_rule':'Preserve reviewed claims and all unknown/conflict/access outcomes; resume queued source items in a new numbered country batch. Changes to revision, candidate order or queue require a new checkpoint fingerprint. No source approval is implied.','planner_reference':'Existing #177 scripts/plan_company_profiles.py, unchanged; original baseline result at evidence/planner-baseline.json.'})
manifest={'packet_id':PACKET,'country':{'name':'South Korea','iso2':'KR','imf_code':'KOR','gdp_cohort_position':12},'as_of':DATE,'cohort':{'definition':'IMF October 2026 WEO 2026 nominal GDP estimates; not final actuals; aggregates excluded; Taiwan follows IMF separately reported economy convention','observed_gdp_usd_billions':2245.847,'observed_rank':12,'vintage_caveat':'The DataMapper API response does not identify a vintage. The user-specified October 2026 cohort and current rank observation are distinguished.','evidence':'evidence/cohort-observation.json'},'source_revision':REV,'branch':'research/south-korea-gdp-12-batch-001-20261118','ownership':{'country_research_only':True,'collection_owner':'https://chatgpt.com/c/6afbc931-0378-83ec-8434-cd7e8db42db2','record_owner':'https://chatgpt.com/c/6afc35bc-3abc-83ec-aa2c-101dd825be51','planner':'https://github.com/castlemilk/startup-atlas/pull/177','canonical_space':'https://chatgpt.com/space/page_5167bcbbbb0c81919e1d565fd4d82e4a'},'status':'reviewed_staged_pending_owner_review','staging_only':True,'production_schema_changed':False,'production_writes':0,'crawler_seed_approvals':0,'crawler_runs':0,'deployments':0,'merge_or_release_authorized_by_this_packet':False,'selection_policy':'Purposive initial startup/scaleup checkpoint with source-backed South Korean ecosystem connections. Known listed graduates are separately retained; accepted does not certify current private-company or legal status.','company_counts':company_counts,'strict_projection':'startup-records.json','provenance_map':'projection-map.json','coverage':'coverage.json','resume_checkpoint':'checkpoint.json','source_registry':'sources.json','report':'README.md','ecosystem_report':'ECOSYSTEM.md','rights':'Short attributed factual paraphrases only; no copied proprietary datasets, article bodies, contact lists or images. No robots requests, access bypass, credentials, spending, outreach or permission changes.'}
write('manifest.json',manifest)
print(json.dumps({'companies':company_counts,'claims':len(claims),'sources':coverage['source_counts'],'funding':coverage['funding'],'queue':len(queue)},indent=2))
