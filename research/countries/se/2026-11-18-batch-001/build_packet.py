#!/usr/bin/env python3
"""Rebuild Sweden's research-only projections; never writes production inputs."""
import copy
import hashlib
import importlib.util
import json
import re
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path
from urllib.parse import urlsplit

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[3]
BASE='988a4ddcc4dbbc853da0c7f7899b6d6e7579f840'
DAY='2026-11-18'
LANES=('software','science','industrial','fintech')

def read(path): return json.loads(path.read_text(encoding='utf-8'))
def write(name,obj): (HERE/name).write_text(json.dumps(obj,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()
def digest(obj): return hashlib.sha256(json.dumps(obj,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()
def norm(value): return re.sub(r'[^\w]+',' ',unicodedata.normalize('NFKC',value).casefold()).strip()
def slug(value): return re.sub(r'[^a-z0-9]+','-',unicodedata.normalize('NFKD',value).encode('ascii','ignore').decode().lower()).strip('-')
def host(value):
    if not value: return None
    h=urlsplit(value if '://' in value else 'https://'+value).hostname
    return h.lower().removeprefix('www.') if h else None
def load_module(name,path):
    spec=importlib.util.spec_from_file_location(name,path); mod=importlib.util.module_from_spec(spec); spec.loader.exec_module(mod); return mod

def field_states(company):
    out={}
    for field,value in company['field_status'].items():
        v=copy.deepcopy(value) if isinstance(value,dict) else {'status':value,'reason':'See lane observations.'}
        raw=v['status']; v['original_status']=raw
        if raw=='verified': v['status']='reviewed_staged'
        if raw=='partial':
            v['status']='searched_unknown' if field=='headquarters' and not any(c['field']=='headquarters' for c in company['claims']) else 'reviewed_staged'
            v['coverage']='partial'
        if raw=='not_reviewed': v['status']='unsearched'
        if v['status'] in ('searched_unknown','unsearched','blocked'):
            v['value']=None
        if v['status']=='searched_unknown' and not v.get('search_log'):
            v['search_log']=[{'action':'Reviewed selected company sources; detailed queries in observations/'+company['lane']+'.json','source_urls':sorted({c['source_url'] for c in company['claims']})}]
        if field in ('founders','funding_rounds'): v['list_complete']=False
        out[field]=v
    return out

def fact_value(c):
    v=c['value']; field=c['field']
    if isinstance(v,str): return v
    if isinstance(v,list): return '; '.join(str(x) for x in v) or 'No additional aliases verified in this bounded pass.'
    if field=='founded': return f"{v['date']} ({v.get('precision','unspecified')} precision; {v.get('meaning','founding')})"+(('; '+v['qualifier']) if v.get('qualifier') else '')
    if field in ('headquarters','registered_office','office_location','operating_location','origin','principal_place_of_business','main_establishment'):
        location=', '.join(str(v[k]) for k in ('city','country') if v.get(k))
        rest='; '.join(f"{k.replace('_',' ')}: {value}" for k,value in v.items() if value is not None and k not in ('city','country'))
        return '; '.join(x for x in (location,rest) if x)
    return '; '.join(f"{k.replace('_',' ')}: {json.dumps(val,ensure_ascii=False) if isinstance(val,(dict,list)) else val}" for k,val in v.items() if val is not None)

def build():
    inputs={lane:read(HERE/'observations'/f'{lane}.json') for lane in LANES}
    eco=read(HERE/'observations/ecosystem.json')
    companies=[]; claims=[]; sources=defaultdict(list); queue=[]
    for lane,d in inputs.items():
        for original in d['companies']:
            company=copy.deepcopy(original); company['lane']=lane
            company['field_status']=field_states(company)
            company['claim_ids']=[]
            for c in company.pop('claims'):
                c['claim_id']=c.pop('id'); c['entity_id']=company['id']; c['publication_state']='unsubmitted'
                if c['field']=='round_participant' and c['value'].get('role') is None: c['value']['role']='unspecified'
                if c.get('conflict_group') or (c['field']=='founded' and company['field_status']['founded']['status']=='conflict'): c['status']='conflict'
                if c['field']=='sectors': c['researcher_classification']=True
                company['claim_ids'].append(c['claim_id']); claims.append(c)
            company['acceptance_scope']='Source-backed company identity and selected observations; not certification of current private/independent status, exhaustive founder list or complete financing history.'
            companies.append(company)
        for s in d['sources']: sources[s['url']].append({**s,'lane':lane})
        for i,q in enumerate(d['next_queue'],1):
            kind='company_discovery' if q['name'] in {'Graphmatech','Peafowl Solar Power','CorPower Ocean'} else 'field_followup'
            queue.append({**q,'queue_id':f'se-{lane}-{i:03d}','kind':kind,'lane':lane,'state':'queued','crawler_seed_approved':False})
    for c in eco['claims']:
        c=copy.deepcopy(c); c['claim_id']=c.pop('id'); c['publication_state']='unsubmitted'; claims.append(c)
    for s in eco['sources']: sources[s['url']].append({**s,'lane':'ecosystem'})
    queue=copy.deepcopy(eco['next_queue'])+queue
    source_list=[]
    for url,observations in sorted(sources.items()):
        chosen=next((x for x in observations if x['accessed']),observations[0])
        source_list.append({**chosen,'source_id':'src-'+hashlib.sha256(url.encode()).hexdigest()[:12],'accessed':any(x['accessed'] for x in observations),'observations':observations,'claim_ids':[c['claim_id'] for c in claims if c.get('source_url')==url],'seed_approval':'not_granted_by_research'})
    by_company=defaultdict(list)
    for c in claims: by_company[c['entity_id']].append(c)
    projection=[]; mapping=[]; research_only=[]
    fact_fields={'aliases','headquarters','incorporation','sectors','lifecycle','legal_entity','legal_entities','legal_form','legal_registry_id','registered_office','office_location','operating_location','origin','principal_place_of_business','main_establishment','corporate_origin','research_origin','founding_milestones'}
    excluded_kinds={'conditional_investment_commitment','equity_and_secondary','debt','financing_unspecified'}
    for company in sorted(companies,key=lambda x:norm(x['name'])):
        cs=by_company[company['id']]
        if company['disposition']!='accepted':
            for c in cs: research_only.append({'claim_id':c['claim_id'],'reason':'Company disposition is '+company['disposition']+'; see companies.json.'})
            continue
        identity=next(c for c in cs if c['field']=='identity')
        description=next(c for c in cs if c['field']=='description')
        record={'name':company['name'],'website':company['website'],'description':description['value'],'source':description['source_url'],'reviewed_at':DAY,'profile_facts':[]}
        def mapped(c,path,mode='direct'):
            mapping.append({'claim_id':c['claim_id'],'company_id':company['id'],'path':path,'mode':mode})
        mapped(identity,'name'); mapped(identity,'website'); mapped(description,'description')
        def fact(c,label=None,value=None):
            key='evidence-'+slug(c['claim_id'])
            text=value if value is not None else fact_value(c)
            if len(text)>1000:
                research_only.append({'claim_id':c['claim_id'],'reason':'Structured value exceeds legacy fact length; complete evidence retained in ledger.'}); return
            record['profile_facts'].append({'key':key,'label':label or c['field'].replace('_',' ').capitalize(),'value':text,'source':c['source_url'],'reviewed_at':DAY})
            mapped(c,'profile_facts.'+key,'sourced_text_projection')
        seen_founders=set()
        for c in cs:
            f=c['field']; v=c['value']
            if f=='founder' and norm(v['name']) not in seen_founders:
                record.setdefault('founders',[]).append({'name':v['name'],'source':c['source_url']}); seen_founders.add(norm(v['name'])); mapped(c,'founders.'+v['name'])
            elif f=='founded':
                conflict=company['field_status']['founded']['status']=='conflict'
                if not conflict and c['source_url']==record['source'] and re.fullmatch(r'\d{4}',v['date']):
                    record['founded_year']=int(v['date']); mapped(c,'founded_year')
                else: fact(c,'Founding observation'+(' (conflicting sources)' if conflict else ''))
            elif f in fact_fields:
                if not (f=='aliases' and not v): fact(c)
            elif f=='funding_round':
                event=v['event_id']; kind=v['transaction_kind']
                if kind in excluded_kinds:
                    fact(c,'Financing observation — '+kind.replace('_',' '),f"{v['announced_on'] or 'Date not established'}; {v['amount_text']}. {v.get('note','')}")
                    for item in mapping:
                        if item['claim_id']==c['claim_id']: item['unprojected_components']='Typed financing semantics remain research-only; no simple legacy funding round.'
                    continue
                rid=slug(event)
                row={'id':rid,'stage':v['stage'],'source':c['source_url'],'amount_text':v['amount_text']}
                if v.get('announced_on') and v.get('date_precision')=='day': row['announced_on']=v['announced_on']
                approximate=bool(re.search(r'\b(about|approx|around|over|up to|more than)\b',v['amount_text'],re.I))
                separate_currency=[x for x in cs if x['field']=='funding_currency' and x['value'].get('event_id')==event and x['source_url']!=c['source_url']]
                if v.get('amount') is not None and v.get('currency') and not approximate and not separate_currency:
                    row.update(amount=v['amount'],currency=v['currency'])
                if separate_currency:
                    row['amount_text']='$100 million' if event=='syre-2024-05-23-series-a' else v['amount_text']
                    for currency_claim in separate_currency:
                        amount=currency_claim['value']['amount']; code=currency_claim['value']['currency']
                        event_month=currency_claim['value'].get('event_month')
                        period=f" in {event_month} (month precision)" if event_month else ''
                        fact(currency_claim,'Financing currency corroboration',f"{code} {amount:,} for the {v['stage']}{period}; a later company source explicitly confirms currency. This is the same event, not additional funding.")
                note=v.get('note','')
                source_local_notes={
                    'mynt-2024-12-11-series-b':'Reported valuation approximately EUR175m, type unstated. Cumulative funding over EUR50m is not another event.',
                    'funding:tandem-health:2025-series-a':'Company reports $50m without explicitly naming the dollar currency. This is one financing event; other reporting observations are separately sourced profile facts.',
                    'mentimeter-2022-06-22-series-c':'Round reported as $42m; the announcement does not explicitly identify the dollar currency. Alternative reporting observations are separately sourced profile facts.',
                    'syre-2024-05-23-series-a':'The announcement identifies the date, Series A and participants and reports $100m. A later source provides explicit currency corroboration in a separate profile fact.'
                }
                note=source_local_notes.get(event,note)
                if kind!='equity': note=f"Instrument type: {kind}. "+note
                # Participants have their own claim-level sources. Legacy rows lack
                # typed participation semantics, so no investor graph edges are made.
                participants=[p for p in cs if p['field']=='round_participant' and p['value']['event_id']==event]
                same_source=[p for p in participants if p['source_url']==c['source_url']]
                if same_source:
                    names='; '.join(p['value']['name']+(' (lead)' if p['value']['role']=='lead' else '') for p in same_source)
                    note+=' Named participants in this source: '+names+'. List may be incomplete.'
                    for p in same_source: mapped(p,'funding_rounds.'+rid+'.note','text_only_no_resolved_investor_id')
                for p in participants:
                    if p not in same_source:
                        disclosure=p.get('published_on') or 'not dated in this source'
                        fact(p,'Additional sourced round participant',p['value']['name']+'; linked to the previously announced '+v['stage']+'; participation disclosed '+disclosure+'. '+p['evidence'])
                for other in cs:
                    if other['field']=='funding_amount_observation' and other['value'].get('event_id')==event:
                        ov=other['value']
                        period=f"; reported event period {ov['date']} ({ov.get('date_precision','unspecified')} precision)" if ov.get('date') else ''
                        fact(other,'Alternative financing amount observation',f"{ov['currency']} {ov['amount']:,}; {ov.get('precision','as-reported')} precision; observation concerning the same {v['stage']}{period}. {ov.get('meaning',ov.get('relation',''))}. Unreconciled reporting observation; do not add to the original event or infer an FX conversion.")
                if len(note)>2000: raise ValueError('Funding note too long: '+rid)
                row['note']=note.strip(); record.setdefault('funding_rounds',[]).append(row); mapped(c,'funding_rounds.'+rid)
                if v.get('closed_on'): fact(c,'Financing close date',f"{v['closed_on']} ({v.get('closed_date_precision','day' if len(v['closed_on'])==10 else 'unspecified')} precision); {v['stage']}; announcement date is recorded separately.")
        projection.append(record)
    mapped_ids={x['claim_id'] for x in mapping}
    existing_reasons={x['claim_id'] for x in research_only}
    for c in claims:
        if c['claim_id'] not in mapped_ids and c['claim_id'] not in existing_reasons:
            research_only.append({'claim_id':c['claim_id'],'reason':'Research-only structured observation, conflict, adviser, commitment, programme or unsupported typed relationship; no production schema extension.'})

    # Use the current builder without invoking its file-writing main().
    builder=load_module('sweden_graph_builder',ROOT/'scripts/make-graph.py')
    overlay=builder.load('startup-research.json')
    graph=builder.build_graph(*(builder.load(x) for x in ['partner-profiles.json','partner-leads.json','partners-reviewed.json','catalogue.json']),overlay)
    base_entities=graph['entities']
    dedup=[]
    for co in sorted(companies,key=lambda x:x['id']):
        names={norm(x) for x in [co['name']]+co.get('aliases',[]) if isinstance(x,str)}
        slugs={slug(x) for x in [co['name']]+co.get('aliases',[]) if isinstance(x,str)}
        domains={host(co['website']),host(co['canonical_domain'])}-{None}
        matches=[]
        for ent in base_entities:
            reasons=[]
            if norm(ent['name']) in names: reasons.append('normalized_name_or_alias')
            if slug(ent['name']) in slugs: reasons.append('ascii_slug_or_alias')
            if host(ent.get('website')) in domains: reasons.append('canonical_host')
            if reasons: matches.append({'entity_id':ent['id'],'name':ent['name'],'reasons':reasons})
        dedup.append({'company_id':co['id'],'names_checked':sorted(names),'slugs_checked':sorted(slugs),'domains_checked':sorted(domains),'matches':matches,'decision':'review_required' if matches else 'no_existing_match_in_pinned_inputs'})
    founder_matches=[]
    for record in projection:
        for person in record.get('founders',[]):
            matches=[e for e in base_entities if e['kind']=='person' and (norm(e['name'])==norm(person['name']) or slug(e['name'])==slug(person['name']))]
            if matches: founder_matches.append({'company':record['name'],'name':person['name'],'matches':[e['id'] for e in matches]})
    combined=copy.deepcopy(overlay); combined['startups']+=copy.deepcopy(projection)
    merged=builder.build_graph(*(builder.load(x) for x in ['partner-profiles.json','partner-leads.json','partners-reviewed.json','catalogue.json']),combined)
    expected_ids={e['id'] for e in base_entities}
    assert expected_ids.issubset({e['id'] for e in merged['entities']})
    assert all(next(e for e in merged['entities'] if e['id']==old['id'])==old for old in base_entities),'Existing entity modified in rehearsal'
    assert not founder_matches,'Founder identity overlap requires manual hold before projection'
    assert not any(d['matches'] for d in dedup),'Company overlap requires manual reconciliation'

    companies.sort(key=lambda x:x['id']); claims.sort(key=lambda x:x['claim_id'])
    named_leads=[]
    for q in eco['next_queue']:
        for name in q.get('selected_named_leads',[]): named_leads.append({'name':name,'source_url':q['url'],'status':'candidate','queue_id':q['queue_id'],'canonical_domain':None})
    for q in queue:
        if q['kind']=='company_discovery': named_leads.append({'name':q['name'],'source_url':q['url'],'status':'candidate','queue_id':q['queue_id'],'canonical_domain':None})
    # Count registered named discoveries once; field follow-ups add no identities.
    named_leads=list({norm(x['name']):x for x in named_leads}.values())
    states=Counter(c['disposition'] for c in companies)
    financial=[c for c in claims if c['field']=='funding_round']
    field_coverage={field:dict(Counter(c['field_status'][field]['status'] for c in companies)) for field in ('identity','headquarters','incorporation','founded','founders','funding_rounds','lifecycle')}
    coverage={'counts':{'registered_discovered_companies':len(companies)+len(named_leads),'reviewed_companies':len(companies),'accepted_company_profiles':states['accepted'],'held_companies':states['held'],'rejected_from_active_scope':states['rejected'],'unreviewed_named_discoveries':len(named_leads),'claim_observations':len(claims),'company_claim_observations':sum(c['entity_id'].startswith('startup:') for c in claims),'ecosystem_claim_observations':sum(c['entity_id']=='ecosystem:sweden' for c in claims),'funding_events_researched':len(financial),'legacy_funding_events_projected':sum(len(x.get('funding_rounds',[])) for x in projection),'founder_observations':sum(c['field']=='founder' for c in claims),'participant_observations':sum(c['field']=='round_participant' for c in claims),'distinct_source_urls':len(source_list),'accessed_source_urls':sum(s['accessed'] for s in source_list),'source_access_gaps':sum(not s['accessed'] for s in source_list),'queue_items':len(queue)},'field_states':field_coverage,'country_denominator':None,'country_completeness':False,'definition':'Discovery count covers explicitly registered company candidates only, not every name in search results or investor lists. Accepted means reviewed identity and useful supported facts, not all fields known or all companies independently private. Held/rejected histories remain in the ledger.','named_unreviewed_leads':named_leads,'pagination_gaps':[{'source':q['url'],'pagination':q['pagination'],'source_denominator':q.get('source_denominator')} for q in eco['next_queue']],'funding_history_complete':False,'founder_lists_complete':False,'other_gap':'Unresolved incorporation, current group headquarters, lifecycle, dollar currencies, legal succession and partial histories remain explicit; no country completion percentage.'}
    binding={'batch_id':'se-2026-11-18-001','base_revision':BASE,'country':'SE','ordered_queue_ids':[q['queue_id'] for q in queue],'queue_items_digest':digest(queue)}
    plan_id=digest(binding)
    queue_doc={'binding':binding,'plan_id':plan_id,'offset':0,'next_cursor':f'se-research-v1:{plan_id}:0','cursor_semantics':'Manual research queue only. Resume requires exact plan_id, unchanged inputs and index at a queue-item boundary. Not a crawler seed, scheduler or implementation replacement for #177.','items':queue}
    run={'batch_id':binding['batch_id'],'country':'Sweden','iso2':'SE','retrieval_date':DAY,'cohort':eco['cohort'],'base_revision':BASE,'publication_state':'unsubmitted','production_modified':False,'crawler_seed_approval':False}
    write('companies.json',{'run':run,'companies':companies})
    write('claims.json',{'run':run,'claims':claims})
    write('source-registry.json',{'run':run,'sources':source_list})
    funding_rows=[]
    for c in sorted(financial,key=lambda x:x['value']['event_id']):
        event=c['value']['event_id']
        related=[x for x in claims if isinstance(x.get('value'),dict) and x['value'].get('event_id')==event and x['claim_id']!=c['claim_id']]
        funding_rows.append({'company_id':c['entity_id'],'event':c['value'],'event_claim_id':c['claim_id'],'source_url':c['source_url'],'retrieved_at':c['retrieved_at'],'related_claims':[{'claim_id':x['claim_id'],'field':x['field'],'value':x['value'],'source_url':x['source_url'],'retrieved_at':x['retrieved_at']} for x in related],'numeric_summation_approved':False,'investor_ids_resolved':False})
    write('funding-ledger.json',{'run':run,'events':funding_rows,'warning':'Research view only. Event totals, investor commitments, allocations, alternate reported currencies, advisers and debt are distinct. Never sum all observations; no FX conversion or cumulative company funding computed.'})
    write('decisions.json',{'company_dispositions':[{'company_id':x['id'],'name':x['name'],'disposition':x['disposition'],'reason':x['disposition_reason']} for x in companies],'field_holds':[{'company_id':x['id'],'field':field,**state} for x in companies for field,state in x['field_status'].items() if state['status']!='reviewed_staged'],'conflicting_claim_ids':[c['claim_id'] for c in claims if c['status']=='conflict'],'ownership':'Collection owner and existing schema/record/round owners retain production adoption, seed approval, merge and release decisions.'})
    write('staged-startups.json',{'reviewed':DAY,'startups':projection})
    write('projection-map.json',{'mapped':mapping,'research_only':research_only,'note':'Distinct claim IDs in mapped versus research_only are disjoint and cover the ledger. Mapped text facts can retain unprojected typed components; those are marked inside the mapping item, not counted again. Several mapped paths may refer to one claim. No production schema changes.'})
    write('coverage.json',coverage)
    write('source-queue.json',queue_doc)
    write('deduplication.json',{'base_revision':BASE,'compared_built_entities':len(base_entities),'compared_source_startups':len(overlay['startups']),'company_checks':dedup,'existing_founder_identity_matches':founder_matches,'alias_completeness':False,'normalization':['Unicode NFKC casefold plus punctuation spacing','NFKD ASCII slug collision detection','lowercase hostname with www removed; no guessed registrable-domain collapse'],'pending_pr_crosscheck':'See handoff and final PR review receipt; this file binds to pinned main inputs.'})
    projected_by_id={'startup:'+slug(x['name']):x for x in projection}
    omitted_year_ids=[eid for eid,x in projected_by_id.items() if 'founded_year' not in x]
    assert all('founded_year' not in e for e in merged['entities'] if e['id'] in omitted_year_ids)
    write('graph-rehearsal.json',{'base_revision':BASE,'mode':'in-memory builder call; no data or backend files written','base_counts':{k:len(v) for k,v in graph.items() if isinstance(v,list)},'staged_counts':{k:len(v) for k,v in merged.items() if isinstance(v,list)},'existing_entities_unchanged':True,'new_startup_ids':list(projected_by_id),'unknown_founding_year_omission_verified':omitted_year_ids,'upstream_fix':'PR179 merged into ff4d51c; no local implementation fix','warning':'Unknown founding years remain absent in the current builder. Initial f4bcbf7 inspection observed the former zero sentinel; that historical issue is resolved at this refreshed main baseline. This rehearsal does not establish deployed publication.'})
    paths=['AGENTS.md','.agents/skills/startup-atlas-collection/SKILL.md','backend/hosted/src/startup-record.mjs','scripts/make-graph.py','scripts/plan_company_profiles.py','data/startup-research.json','data/company-profile-seeds.csv','data/graph.json']
    write('manifest.json',{'run':run,'branch':'research/sweden-gdp-26-batch-001-20261118','production_import_requires_owner_review':True,'owners':{'collection':'https://chatgpt.com/c/6afbc931-0378-83ec-8434-cd7e8db42db2','planner':'https://github.com/castlemilk/startup-atlas/pull/177','canonical_space':'https://chatgpt.com/space/page_5167bcbbbb0c81919e1d565fd4d82e4a'},'baseline_files_sha256':{x:sha(ROOT/x) for x in paths},'observation_files_sha256':{x.name:sha(x) for x in sorted((HERE/'observations').glob('*.json'))},'counts':coverage['counts'],'schema_contract':'Each staged-startups.json.startups[] must pass current validateStartupRecord. Rich claims follow the enrichment evidence contract; rich-only fields are not API additions. Investor-round synthetic contract is not used for real data.','rebuild_command':'python3 research/countries/se/2026-11-18-batch-001/build_packet.py','limitations':['Prepared and reviewed research only; no live ingestion, crawler seed approval, merge or deployment.','No definitive country-wide denominator or complete funding histories.','All numbers retain announced scope, date precision and original currencies; no FX or aggregate funding total.']})
    print(json.dumps(coverage['counts'],ensure_ascii=False))

if __name__=='__main__': build()
