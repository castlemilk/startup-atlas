#!/usr/bin/env python3
"""Rebuild this frozen country staging packet only; no network or production writes."""
import json,pathlib,datetime,hashlib,re,unicodedata,collections,importlib.util,sys
OUT=pathlib.Path(__file__).resolve().parent;REPO=OUT.parents[3];BASE=OUT/'inputs'
at=json.loads((OUT/'run.json').read_text())['assembled_at'];reviewed_on='2026-11-18'
def read(p):return json.loads(pathlib.Path(p).read_text())
def write(name,v):
 (OUT/name).write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n')
def key(s):return re.sub(r'\s+',' ',unicodedata.normalize('NFKC',s)).strip().casefold()
def slug(s):return re.sub('[^a-z0-9]+','-',unicodedata.normalize('NFKD',s).encode('ascii','ignore').decode().lower()).strip('-')
def h(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def domain(u):
 from urllib.parse import urlsplit
 return urlsplit(u).hostname.lower().removeprefix('www.').rstrip('.') if u else None
paths=[BASE/f'saudi-{k}.json' for k in ('root','fintech','growth','ecosystem')]
missing=[str(p) for p in paths if not p.exists()]
if missing:sys.exit('Waiting for '+','.join(missing))
inputs=[read(p)for p in paths];sources={};claims=[];entities=[];candidates=[];ecosystem=[];logs=[];queue=[];changes=[];attempts=[]
id_map={e['entity_id']:e['proposed_id'] for x in inputs for e in x.get('entities',[]) if e.get('entity_id') and e.get('proposed_id') and e['entity_id']!=e['proposed_id']}
def remap(v):
 if isinstance(v,dict):return {k:remap(x) for k,x in v.items()}
 if isinstance(v,list):return [remap(x) for x in v]
 if isinstance(v,str):return id_map.get(v,v)
 return v
inputs=[remap(x) for x in inputs]
review_corrections=[]
for payload in inputs:
 for claim in payload.get('claims',[]):
  if claim['claim_id']in ('sa-fin-0151','sa-eco-c027'):
   original=claim['field'];claim['field']='operating_location'
   claim['normalization_note']='Peer review: based in/at is an operating-location observation; explicit headquarters remains unknown.'
   review_corrections.append({'claim_id':claim['claim_id'],'entity_id':claim['entity_id'],'original_field':original,'normalized_field':claim['field'],'source_url':claim['source_url'],'reason':claim['normalization_note'],'original_snapshot_preserved':True})
   ent=next(e for e in payload['entities']if e.get('entity_id',e.get('proposed_id'))==claim['entity_id'])
   ent['operating_location']=ent['headquarters'];ent['headquarters']={'city':None,'country':None,'as_of':None}
   ent.setdefault('field_dispositions',{})['headquarters']={'status':'searched_unknown','reason':'Reviewed sources establish an operating base but do not explicitly identify headquarters.'}
for payload,pth in zip(inputs,paths):
 for s in payload.get('sources',[]):
  s=dict(s);s['url']=s.get('url')or s.get('source_url');s['researcher_input']=pth.name
  if not s['url']:raise ValueError('Missing URL in '+pth.name)
  sources.setdefault(s['url'],s)
  if sources[s['url']] is not s:sources[s['url']].setdefault('additional_observations',[]).append(s)
 for c in payload.get('claims',[]):
  c=dict(c);c['publication_state']='unsubmitted';v=c.get('value')
  if c.get('source_kind')=='primary_programme':c['source_kind']='primary_investor';c['source_classification_note']='Programme operator testimony retained as primary institutional evidence.'
  if c['field']=='round_participant' and isinstance(v,dict):
   if 'name' not in v and 'participant_name'in v:v['name']=v['participant_name']
   if v.get('role') not in ('lead','participant','unspecified'):
    v['reported_role']=v.get('role');v['role']='lead' if v.get('role') in ('co-lead','co_lead') else 'unspecified'
   v.setdefault('resolved_entity_id',None)
  if c['field']=='funding_round' and isinstance(v,dict):
   if 'event_id' not in v and 'id'in v:v['event_id']=v['id']
   if 'date_precision' not in v:v['date_precision']='day' if v.get('announced_on')and len(v['announced_on'])==10 else 'month' if v.get('announced_on')and len(v['announced_on'])==7 else 'year' if v.get('announced_on')and len(v['announced_on'])==4 else None
  claims.append(c)
 entities.extend(payload.get('entities',[]));candidates.extend(payload.get('candidates',[]));ecosystem.extend(payload.get('ecosystem',[]));logs.extend(payload.get('discovery_log',[]));queue.extend(payload.get('next_queue',[]))
 attempts.extend([{'researcher_input':pth.name,**a} for a in payload.get('source_attempts',[])])
# IMF retrieval outcomes are cohort metadata, not a recomputed ranking.
for sid,url,status,ref,title,note in [('imf-api','https://www.imf.org/external/datamapper/api/v1/NGDPD/2026','blocked','turn600227775view0','Requested nominal-GDP API','DisabledError from web tool; GDP rank/value not recalculated.'),('imf-datamapper','https://www.imf.org/external/datamapper/datasets/WEO','partial','turn600227775view1','DataMapper WEO','JavaScript template only.'),('imf-profile','https://www.imf.org/external/datamapper/profile/SAU','partial','turn962747800view0','Saudi DataMapper profile','Open yielded template; search summary is not the numeric evidence authority.'),('imf-weo','https://data.imf.org/datasets/WEO','accessed','turn962747800view1','World Economic Outlook dataset','Official dataset identifies October 2026 vintage; no full ranking was recomputed.')]:
 sources[url]={'source_id':'sa-'+sid,'url':url,'publisher':'International Monetary Fund','title':title,'kind':'regulatory','access_status':status,'publication_date':None,'retrieved_at':read(OUT/'run.json')['cohort_vintage_verification']['retrieved_at'],'retrieval_precision':'research_session_checkpoint','web_ref':ref,'notes':note,'acquisition':'web_tool_page_read'}
# Deduplicate exact duplicate atomic assertions without discarding source observations.
seen={};unique=[]
for c in claims:
 ck=json.dumps({k:c.get(k)for k in ('entity_id','field','value','source_url','effective_on')},sort_keys=True,ensure_ascii=False)
 if ck in seen:changes.append({'kind':'exact_duplicate_claim','kept':seen[ck],'omitted':c.get('claim_id')});continue
 seen[ck]=c['claim_id'];unique.append(c)
claims=unique
# All candidate names are explicit finite work items, never search-engine result totals.
by={key(e['name']):e for e in entities};additional_leads=[]
for c in candidates:
 if c.get('assigned_batch') is False:
  additional_leads.append(c);continue
 if key(c['name'])not in by:by[key(c['name'])]={'name':c['name'],'proposed_id':'startup:'+slug(c['name']),'disposition':c.get('disposition','deferred'),'gaps':[c.get('reason','Pending review')]}
entities=list(by.values())
for e in entities:
 e['entity_id']=e.pop('proposed_id',e.get('entity_id','startup:'+slug(e['name'])))
 e['canonical_domain']=domain(e.get('website'));e['crawler_seed_approved']=False;e['canonical_id_status']='proposed_staging_identifier'
 d=str(e.get('disposition','deferred')).lower()
 e['disposition']='accepted' if d in ('accepted','reviewed_staged','accepted_with_gaps','accepted_with_conflicts','accepted_staged','accepted_for_staging') else 'rejected' if d in ('rejected','out_of_scope') else 'deferred'
 ec=[c for c in claims if c['entity_id']==e['entity_id']];found=set(c['field']for c in ec if c['status']=='reviewed_staged');conf=set(c['field']for c in ec if c['status']=='conflict')
 dims={'identity':('identity','name','canonical_name','canonical_domain','website'),'description_sectors':('description','sectors'),'headquarters':('headquarters',),'incorporation':('incorporation','incorporation_geography'),'legal_entity':('legal_entity','legal_name','related_legal_name'),'founding':('founded_year','founded','founding_date'),'founders':('founder',),'funding':('funding_round',),'round_participants':('round_participant',),'aliases':('alias','aliases'),'operating_status':('company_status','status','operating_status_observation','corporate_event')}
 original_dispositions=e.get('field_dispositions',{});e['researcher_field_dispositions']=original_dispositions;e['field_dispositions']={}
 for dim,fields in dims.items():
  dc=[c for c in ec if c['field']in fields];reviewed=[c['claim_id']for c in dc if c['status']=='reviewed_staged'];conflict=[c['claim_id']for c in dc if c['status']=='conflict']
  if conflict:state='conflict';reason='Competing or identity-sensitive source observations retained. Reviewed subset may still be projected.'
  elif reviewed:state='reviewed_staged';reason='At least one supported observation; list, time coverage and legal-scope completeness not implied.'
  else:state='unsearched';reason='No accepted claim in this checkpoint. See entity gaps and queued source review; absence is not zero or none.'
  explicit=[c for c in dc if c['status']in ('searched_unknown','blocked','not_applicable','unsearched')]
  if not reviewed and not conflict and explicit:state=explicit[0]['status'];reason=explicit[0].get('rationale',reason)
  prior=original_dispositions.get(dim,{})
  if isinstance(prior,str):prior={'status':prior}
  if not reviewed and not conflict and prior.get('status',prior.get('state')) in ('searched_unknown','blocked','not_applicable','unsearched'):
   state=prior.get('status',prior.get('state'));reason=prior.get('reason',reason)
  e['field_dispositions'][dim]={'status':state,'claim_ids':reviewed+conflict,'reason':reason}
 e.setdefault('incorporation',{'country':None,'legal_name':None});e.setdefault('headquarters',{'city':None,'country':None,'as_of':None});e.setdefault('founded',{'value':None,'precision':None});e.setdefault('gaps',[])
entities.sort(key=lambda e:key(e['name']))
# Projection draws facts only from reviewed claim ledger; unknowns and conflicts stay sidecar.
records=[];mapping=[]
for e in entities:
 if e['disposition']!='accepted':continue
 ec=[c for c in claims if c['entity_id']==e['entity_id'] and c['status']=='reviewed_staged'];desc=next((c for c in ec if c['field']=='description'),None)
 ident=next((c for c in ec if c['field']in ('identity','name','canonical_name','website','canonical_domain')),None)
 if not desc:raise ValueError('No description claim for '+e['name'])
 if not ident:raise ValueError('No identity claim for '+e['name'])
 r={'name':e['name'],'description':e['description'],'website':e['website'],'source':desc['source_url'],'reviewed_at':reviewed_on}
 pm={'entity_id':e['entity_id'],'name':e['name'],'fields':{'name':[ident['claim_id']],'description':[desc['claim_id']],'website':[c['claim_id']for c in ec if c['field']in ('identity','website','canonical_domain')]},'sidecar_only':[]}
 # Existing year field can carry the year component without inventing month/day.
 founding_fields=('founded_year','founded','founding_date')
 founding_conflicts=[c for c in claims if c['entity_id']==e['entity_id'] and c['field']in founding_fields and c['status']=='conflict']
 founding_claims=[c for c in ec if c['field']in founding_fields]
 supported_years={str(c['value'].get('value')if isinstance(c['value'],dict)else c['value'])[:4] for c in founding_claims}
 if not founding_conflicts and len(supported_years)==1:
  year=next(iter(supported_years))
  if re.fullmatch(r'\d{4}',year) and 1800<=int(year)<=2026:
   r['founded_year']=int(year);pm['fields']['founded_year']=[c['claim_id']for c in founding_claims]
 founders=[];fseen=set()
 for c in ec:
  if c['field']!='founder':continue
  v=c['value'];name=v.get('name')or v.get('person_name')or v.get('founder_name') if isinstance(v,dict)else v
  if not isinstance(name,str)or not name:continue
  if key(name)in fseen:continue
  if any(z['status']=='conflict' and z['field']=='founder' and isinstance(z.get('value'),dict) and z['value'].get('name')==name for z in claims if z['entity_id']==e['entity_id']):continue
  fseen.add(key(name));founders.append({'name':name,'source':c['source_url']});pm['fields']['founders.'+str(len(founders)-1)]=[c['claim_id']]
 if founders:r['founders']=founders
 rounds=[]
 for c in ec:
  if c['field']!='funding_round':continue
  v=c['value'];eid=v['event_id']
  entity_event=next((r for r in e.get('funding_rounds',[]) if r.get('event_id',r.get('id'))==eid),{})
  if v.get('projection_eligible') is False or entity_event.get('projection_eligible') is False:
   pm['sidecar_only'].append({'claim_id':c['claim_id'],'reason':'Researcher explicitly withheld event from production projection.'});continue
  rr={'id':eid,'stage':v.get('stage')or 'Financing announcement','source':c['source_url']}
  if v.get('announced_on')and v.get('date_precision')=='day':rr['announced_on']=v['announced_on']
  precision=v.get('amount_precision')or v.get('precision');amt=v.get('amount');cur=v.get('currency')
  numeric_allowed=v.get('legacy_numeric_projection_allowed') is not False and entity_event.get('legacy_numeric_projection_allowed') is not False
  if numeric_allowed and type(amt)is int and amt>0 and cur and precision not in ('approximate','lower_bound','upper_bound','range'):
   rr['amount']=amt;rr['currency']=cur
  elif numeric_allowed and isinstance(amt,str)and amt.isdecimal()and cur and precision not in ('approximate','lower_bound','upper_bound','range'):
   rr['amount']=int(amt);rr['currency']=cur
  if v.get('amount_text') and len(v['amount_text'])<=200:rr['amount_text']=v['amount_text']
  if not numeric_allowed and amt is not None and cur and not rr.get('amount_text'):
   rr['amount_text']=f'{cur} {amt:,} announced transaction including employee liquidity; primary/secondary allocation undisclosed.'
  notes=[v.get('note')or v.get('notes')or '',f'Transaction kind: {v.get("transaction_kind","unknown")}.']
  if v.get('amount_text') and len(v['amount_text'])>200:notes.append(v['amount_text'])
  if not numeric_allowed:notes.append('Structured numeric projection withheld. '+str(v.get('projection_note') or entity_event.get('projection_note') or 'See source-bound transaction details in claims.json.'))
  if v.get('transaction_status'):notes.append('Transaction status at announcement: '+str(v['transaction_status'])+'.')
  if v.get('announced_month'):notes.append('Announcement month: '+v['announced_month']+'; no day inferred.')
  if v.get('currency_source_url'):notes.append('Currency corroboration: '+v['currency_source_url'])
  if v.get('announced_period'):notes.append(f'Announcement period: {v["announced_period"]} ({v.get("date_precision")}); no day inferred.')
  if v.get('announced_on')and v.get('date_precision')!='day':notes.append(f'Announcement date precision: {v["announced_on"]} ({v.get("date_precision")}); no day inferred.')
  parts=[z for z in ec if z['field']=='round_participant'and z['value'].get('event_id')==eid]
  same=[z for z in parts if z['source_url']==c['source_url']]
  if same:notes.append('Named event participants: '+', '.join(z['value']['name']+(' (lead)'if z['value']['role']=='lead'else '')for z in same)+'. Canonical investor identities remain unresolved.')
  if any(z['source_url']!=c['source_url']for z in parts):notes.append('Additional event-specific participant evidence is retained with its own source in claims.json.')
  note=' '.join(str(n)for n in notes if n).strip()
  if len(note)>2000:raise ValueError('Funding note exceeds supported limit for '+eid)
  rr['note']=note;rounds.append(rr);pm['fields']['funding_rounds.'+str(len(rounds)-1)]=[c['claim_id']]+[z['claim_id']for z in same]
 if rounds:r['funding_rounds']=rounds
 facts=[]
 for field,label in [('sectors','Research sector classification'),('headquarters','Headquarters observation'),('operating_location','Operating location'),('incorporation','Legal incorporation observation'),('legal_name','Legal name observation'),('legal_entity','Legal entity observation'),('country_nexus','Saudi ecosystem connection'),('country_association','Country association'),('founded_year','Founding year'),('founded','Founding observation'),('founding_date','Founding observation'),('founding_geography','Founding geography'),('founding_location','Founding location'),('origins','Company origin'),('company_location','Company location'),('aliases','Aliases'),('alias','Alias'),('company_status','Company status'),('status','Company status'),('operating_status_observation','Operating status observation'),('corporate_event','Corporate event'),('legal_structure','Legal structure')]:
  for c in ec:
   if c['field']!=field:continue
   v=c['value'];value=v if isinstance(v,str)else ', '.join(str(x)for x in v)if isinstance(v,list)else json.dumps(v,ensure_ascii=False,separators=(',',':'))if isinstance(v,dict)else str(v)
   if len(value)>1000:pm['sidecar_only'].append({'claim_id':c['claim_id'],'reason':'Structured claim exceeds profile-fact display limit; retained losslessly in evidence ledger.'});continue
   facts.append({'key':slug(field)+'-'+str(len(facts)+1),'label':label,'value':value,'source':c['source_url'],'reviewed_at':reviewed_on});pm['fields']['profile_facts.'+str(len(facts)-1)]=[c['claim_id']]
 # Keep known conflicts visible in the legacy-compatible projection as sourced facts.
 conflicts=[c for c in claims if c['entity_id']==e['entity_id']and c['status']=='conflict']
 for c in conflicts[:15]:
  value=c.get('rationale','Source conflict')+' '+c.get('evidence','')
  if len(value)>1000:value=value[:997]+'...'
  facts.append({'key':'review-conflict-'+str(len(facts)+1),'label':'Unresolved source conflict','value':value,'source':c['source_url'],'reviewed_at':reviewed_on});pm['fields']['profile_facts.'+str(len(facts)-1)]=[c['claim_id']]
 if facts:r['profile_facts']=facts
 used={cid for group in pm['fields'].values()for cid in group}
 used.update(x['claim_id'] for x in pm['sidecar_only'])
 pm['sidecar_only'] += [{'claim_id':c['claim_id'],'reason':'Evidence retained outside the current startup schema; no automatic graph relationship.'}for c in ec if c['claim_id']not in used]
 records.append(r);mapping.append(pm)
# Explicit queue rows are stable checkpoint work units, not approved crawler seeds.
qout=[]
for i,q in enumerate(queue,1):
 qout.append({**q,'original_queue_id':q.get('queue_id'),'queue_id':f'sa-next-{i:03d}','name':q.get('name')or q.get('entity_name')or q.get('entity')or q.get('entity_id')or q.get('source')or f'Source work item {i}','status':q.get('status',q.get('state','unsearched')),'priority':q.get('priority',2),'urls':q.get('urls')or q.get('source_urls')or ([q['source_url']]if q.get('source_url') else []),'next_action':q.get('action')or q.get('next_action')or q.get('resume_action')or q.get('reason')or 'Review primary source identity and missing fields','reason':q.get('reason')or q.get('action')or q.get('next_action')or 'Bounded research checkpoint; additional source work required.','crawler_seed_approved':False})
qout.append({'queue_id':f'sa-next-{len(qout)+1:03d}','name':'IMF cohort rank recomputation','status':'blocked','priority':3,'urls':['https://www.imf.org/external/datamapper/api/v1/NGDPD/2026','https://data.imf.org/datasets/WEO'],'next_action':'Retrieve permitted October 2026 nominal-GDP country/economy dataset and recompute rank excluding aggregates.','reason':'Requested API unavailable; vintage is verified but GDP rank19 remains the user-assigned cohort label.','crawler_seed_approved':False})
for q in qout:
 if q.get('kind')in ('entity_lineage','entity_identity')or q.get('dimension')=='Financial reorganisation outcome':q['priority']=1
 if q['name'].startswith('Source work item '):q['name']='Fintech portfolio — '+str(q.get('dimension','continuation'))
qout.sort(key=lambda q:(q['priority'],q['queue_id']))
work_items=[]
for e in entities:
 for dimension,disposition in e['field_dispositions'].items():
  work_items.append({'work_item_id':e['entity_id']+'|'+dimension,'entity_id':e['entity_id'],'dimension':dimension,**disposition,'continuation':'Use source-bound claim IDs and next-source-queue.json; refresh current Atlas dedup before any proposal.','crawler_seed_approved':False})
write('coverage-work-items.json',{'scope':'Field states for the finite selected company set; supporting evidence is not field-history completeness.','items':work_items})
counts=collections.Counter(e['disposition']for e in entities)
sourcecounts=collections.Counter(s.get('access_status','unknown')for s in sources.values())
coverage={'schema_version':1,'scope':'Fixed explicitly selected Saudi startup candidate queue; not all Saudi startups','base_revision':read(OUT/'run.json')['base_revision'],'counts':{'discovered':len(entities),'reviewed':sum(e['disposition']in ('accepted','rejected')or bool([c for c in claims if c['entity_id']==e['entity_id']])for e in entities),'accepted':counts['accepted'],'rejected':counts['rejected'],'deferred':counts['deferred'],'claims':len(claims),'reviewed_claims':sum(c['status']=='reviewed_staged'for c in claims),'conflicting_claims':sum(c['status']=='conflict'for c in claims),'production_records_written':0,'crawler_runs':0,'source_registry_urls':len(sources),'queue_items':len(qout)},'claim_status_counts':dict(collections.Counter(c['status']for c in claims)),'source_outcomes':dict(sourcecounts),'field_presence':{dim:dict(collections.Counter(e['field_dispositions'][dim]['status']for e in entities if e['disposition']=='accepted'))for dim in next(e['field_dispositions']for e in entities)},'national_startup_denominator':None,'national_completeness_claimed':False,'pagination':{'status':'partial','note':'Source indexes are discovery surfaces. No national register, investor portfolio, programme cohort archive, or search engine is claimed exhausted. Full next-source queue retained.'},'source_count_note':'Unique URLs recorded by researchers, not HTTP exchanges. Search-result URLs not opened remain discovery leads. Repeated reads and redirects are not a national coverage denominator.'}
coverage['counts']['additional_unreviewed_leads']=len(additional_leads)
coverage['counts']['rejected_claims']=sum(c['status']=='rejected' for c in claims)
write('additional-discovery-leads.json',{'items':additional_leads,'count_note':'Not part of the assigned 28-candidate batch denominator; named in reviewed sources but not independently profiled.'})
write('source-attempts.json',{'attempts':attempts,'coverage_note':'Per-request logs only where researcher captured them; unique URL registry is the cross-lane denominator.'})
write('review-corrections.json',{'corrections':review_corrections,'additional_geography_qa_reads':{'fintech':4,'ecosystem':2},'note':'Post-packet peer review re-read existing registered sources. These QA requests are separate from original snapshot request counts.'})
write('research-decisions.json',{'id_normalization':id_map,'researcher_coverage':[{'input':p.name,'coverage':x.get('coverage',{}),'counts':x.get('counts',{}),'metrics':x.get('metrics',{}),'checks':x.get('checks',{})}for x,p in zip(inputs,paths)],'excluded_funding_candidates':[v for x in inputs for v in x.get('excluded_funding_candidates',[])],'discovery_notes':[v for x in inputs for v in x.get('discovery_notes',[])]})
write('entities.json',{'schema_version':1,'entities':entities});write('claims.json',{'run':read(OUT/'run.json'),'claims':claims});write('sources.json',{'sources':sorted(sources.values(),key=lambda s:s['url'])});write('startups.json',{'reviewed':reviewed_on,'startups':records});write('projection-map.json',{'records':mapping});write('ecosystem.json',{'nodes':ecosystem});write('discovery-log.json',{'queries':logs,'normalization_changes':changes});write('next-source-queue.json',{'items':qout});write('coverage.json',coverage)
write('manifest.json',{'schema_version':1,'country':'Saudi Arabia','base_revision':coverage['base_revision'],'state':'reviewed_staged','delivery_state':'reviewed_staged','production_target':'data/startup-research.json only after separate owner integration review','staging_prefix':'research/countries/sa/2026-11-18-batch-001/','counts':coverage['counts'],'claims_sha256':h(OUT/'claims.json'),'startups_sha256':h(OUT/'startups.json'),'queue_sha256':h(OUT/'next-source-queue.json'),'source_registry_sha256':h(OUT/'sources.json'),'source_inputs':[{'filename':p.name,'sha256':h(p)}for p in paths],'national_completeness_claimed':False,'crawler_seed_approval':False,'cursor':{'version':1,'next_queue_item':qout[0]['queue_id']if qout else None,'queue_sha256':h(OUT/'next-source-queue.json'),'resume_requires':'Same base revision and input hashes, otherwise refresh dedup and checkpoint; do not treat queue item as source approval.'}})
manifest=read(OUT/'manifest.json');manifest['coverage_work_items_sha256']=h(OUT/'coverage-work-items.json');manifest['cursor']['coverage_work_items_sha256']=manifest['coverage_work_items_sha256'];manifest['promotion_state']='owner_review_required';write('manifest.json',manifest)
print(json.dumps(coverage['counts'],indent=2));print('Dispositions:',[(e['name'],e['disposition'])for e in entities])
