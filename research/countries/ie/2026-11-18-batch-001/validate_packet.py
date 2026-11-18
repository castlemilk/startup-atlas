#!/usr/bin/env python3
"""Offline checks for this country-local packet. Does not fetch, crawl or publish."""
import argparse, copy, datetime as dt, hashlib, importlib.util, json, re, unicodedata
from collections import Counter
from pathlib import Path
from urllib.parse import urlsplit
HERE=Path(__file__).resolve().parent
REPO=HERE.parents[3]
FILES=['companies','claims','source-registry','startup-records','boundary-records','projection-map','queue','manifest','coverage','deduplication','field-coverage']
REVIEWED={'reviewed_staged'}
KINDS={'primary_company','primary_investor','regulatory','secondary','discovery'}

def digest(value):
 return hashlib.sha256(json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()).hexdigest()
def name_key(value):return ' '.join(unicodedata.normalize('NFKC',value).casefold().split())
def slug(value):return re.sub(r'[^a-z0-9]+','-',unicodedata.normalize('NFKD',value).encode('ascii','ignore').decode().lower()).strip('-')
def domain(value):
 host=(urlsplit(value).hostname or '').casefold().rstrip('.')
 return host[4:] if host.startswith('www.') else host

def load_packet(path=HERE):return {key:json.loads((path/(key+'.json')).read_text()) for key in FILES}
def event_id(value):return value.get('event_id') or value.get('id')
def timestamp(value):
 try:return isinstance(value,str) and dt.datetime.fromisoformat(value.replace('Z','+00:00')).tzinfo is not None
 except (ValueError,TypeError):return False

def resume(queue,cursor=None,limit=10):
 """Page pending research candidates; stale cursors fail closed without mutation."""
 if not 1<=limit<=50:raise ValueError('limit must be 1..50')
 actual=digest(queue['payload'])
 if actual!=queue['queue_sha256']:raise ValueError('queue payload hash mismatch')
 cursor=cursor or {'queue_sha256':actual,'baseline_revision':queue['payload']['baseline_revision'],'offset':0}
 if cursor['queue_sha256']!=actual or cursor['baseline_revision']!=queue['payload']['baseline_revision']:raise ValueError('stale revision/hash cursor')
 pending=[c for c in queue['payload']['candidates'] if c['disposition']=='queued']
 offset=cursor['offset']
 if type(offset) is not int or not 0<=offset<=len(pending):raise ValueError('invalid cursor offset')
 items=pending[offset:offset+limit];n=offset+len(items)
 nxt={**cursor,'offset':n} if n<len(pending) else None
 return {'items':items,'next_cursor':nxt,'total_pending':len(pending)}

def validate_packet(p):
 errors=[]
 def check(ok,msg):
  if not ok:errors.append(msg)
 companies=p['companies']['companies'];claims=p['claims']['claims'];sources=p['source-registry']['sources']
 source_map={s['url']:s for s in sources};company_map={c['entity_id']:c for c in companies}
 check(len(company_map)==len(companies),'duplicate company ID')
 check(len(source_map)==len(sources),'duplicate source URL')
 for key,fn in [('name',name_key),('website',domain)]:check(len({fn(c[key]) for c in companies})==len(companies),'duplicate canonical '+key)
 check(len({slug(c['name']) for c in companies})==len(companies),'duplicate company slug')
 aliases={}
 for c in companies:
  for n in [c['name']]+c['alias_names']:
   k=name_key(n)
   check(k not in aliases or aliases[k]==c['entity_id'],'duplicate alias across companies: '+k);aliases[k]=c['entity_id']
  check(c.get('crawler_seed_approved') is False,'company cannot approve seed')
  check(c['canonical_domain']==domain(c['website']),'canonical domain drift')
  check(c['incorporation'].get('date') is None or bool(re.fullmatch(r'\d{4}-\d{2}-\d{2}',c['incorporation']['date'])),'incorporation date precision')
  f=c['founded'];fv=f.get('value');fp=f.get('precision')
  if fv is not None:
   check(fp in ('year','month','day'),'invalid founding precision')
   pattern={'year':r'\d{4}','month':r'\d{4}-\d{2}','day':r'\d{4}-\d{2}-\d{2}'}.get(fp,r'(?!)')
   check(bool(re.fullmatch(pattern,str(fv))),'founding value does not match precision')
 events={}
 for c in companies:
  for e in c['funding_rounds']:
   check(e['id'] not in events,'duplicate event ID');events[e['id']]=(c,e)
   a=e.get('amount');cur=e.get('currency')
   check((a is None)==(cur is None),'amount and currency must both be known or null: '+e['id'])
   if a is not None:check(type(a) in (int,float) and a>0 and bool(re.fullmatch('[A-Z]{3}',cur or '')),'invalid money or zero-imputed unknown: '+e['id'])
   when=e.get('announced_on');precision=e.get('date_precision')
   if when is not None:
    pattern={'day':r'\d{4}-\d{2}-\d{2}','month':r'\d{4}-\d{2}','year':r'\d{4}'}.get(precision,r'(?!)')
    check(bool(re.fullmatch(pattern,str(when))),'event date/precision mismatch: '+e['id'])
   seen=set()
   for pa in e.get('participants',[]):
    k=name_key(pa['name']);check(k not in seen,'duplicate event participant');seen.add(k)
    check(pa['role'] in ('lead','participant','unspecified'),'unsupported participant role')
    check(pa.get('resolved_entity_id') is None,'unreviewed canonical investor ID')
    for u in pa['source_urls']:check(u in source_map and source_map[u]['accessed'],'unaccessed participant source')
   for u in e['source_urls']:check(u in source_map and source_map[u]['accessed'],'unaccessed event source')
 claim_ids=set();round_claim_ids=set()
 for cl in claims:
  cid=cl['claim_id'];check(cid not in claim_ids,'duplicate claim ID');claim_ids.add(cid)
  check(cl['source_kind'] in KINDS,'invalid source kind')
  u=cl.get('source_url');parsed=urlsplit(u or '')
  check(parsed.scheme=='https' and bool(parsed.hostname) and not parsed.username and not parsed.password,'invalid source HTTPS URL')
  check(u in source_map,'unregistered claim source: '+cid)
  check(timestamp(cl.get('retrieved_at')),'retrieval timestamp requires timezone: '+cid)
  for field in ('published_on','effective_on'):
   val=cl.get(field)
   if val is not None:
    try:dt.date.fromisoformat(val)
    except (ValueError,TypeError):errors.append('invalid precise date: '+cid)
  if cl['status'] in REVIEWED:
   check(cl.get('accessed') is True and source_map.get(u,{}).get('accessed') is True,'unaccessed reviewed claim: '+cid)
   check(cl['source_kind']!='discovery','discovery cannot support reviewed fact')
   check(cl.get('value') is not None,'unknown null represented as reviewed fact')
   check(timestamp(cl.get('reviewed_at')),'review timestamp missing')
   check(cl['source_kind'] in source_map.get(u,{}).get('source_kinds',[]),'source kind mismatch: '+cid)
  value=cl.get('value')
  if cl['field']=='funding_round' and cl['status'] in REVIEWED:
   eid=event_id(value);check(eid in events,'orphan funding claim: '+cid)
   if eid in events:check(events[eid][0]['entity_id']==cl['entity_id'],'cross-company funding claim: '+cid)
   round_claim_ids.add(eid)
  if cl['field']=='round_participant' and cl['status'] in REVIEWED:
   eid=event_id(value);check(eid in events,'orphan participant: '+cid)
   if eid in events:
    company,event=events[eid];check(company['entity_id']==cl['entity_id'],'cross-company participant: '+cid)
    check(any(name_key(x['name'])==name_key(value['name']) and x['role']==value['role'] and u in x['source_urls'] for x in event.get('participants',[])),'participant not sourced on same event: '+cid)
  if cl['field']=='funding_currency' and cl['status'] in REVIEWED:
   eid=event_id(value);check(eid in events and events[eid][0]['entity_id']==cl['entity_id'],'orphan currency normalization: '+cid)
 check(set(events)==round_claim_ids,'company events and atomic round claims differ')
 for s in sources:
  check(s.get('crawler_seed_approved') is False,'source cannot approve seed')
  check(set(s['claim_ids'])=={c['claim_id'] for c in claims if c.get('source_url')==s['url']},'source claim index drift')
 projections=p['startup-records']['startups']+p['boundary-records']['startups']
 check(len(projections)==len(companies),'projection dossier count differs')
 for r in projections:
  c=next((x for x in companies if x['name']==r['name']),None)
  check(c is not None,'unknown projected company')
  check('founded_year' not in r,'founding scalar lacks independent source field')
  check(not r.get('relationships'),'unresolved investor relationships projected')
  for fr in r.get('funding_rounds',[]):
   raw=events[fr['id']][1]
   check(raw['transaction_kind'] not in ('grant','secondary_share_sale'),'non-round projected as funding')
   if raw['date_precision']!='day':check('announced_on' not in fr,'partial funding date padded to day')
   if raw.get('amount') is None:check('amount' not in fr and 'currency' not in fr,'unknown money became scalar')
   if fr['id']=='luminate-medical-2024-09-series-a':check('amount' not in fr and 'currency' not in fr,'conflicting Luminate currency projected')
   if 'amount' in fr:check(fr['amount']==raw['amount'] and fr.get('currency')==raw['currency'],'projected money changed')
  for fact in r.get('profile_facts',[]):
   check(fact['source'] in source_map and source_map[fact['source']]['accessed'],'unaccessed profile fact source')
 holds={c['name'] for c in companies if c['admission']['disposition']=='held_boundary'}
 check(holds=={r['name'] for r in p['boundary-records']['startups']},'boundary hold leaked into proposed records')
 maps=p['projection-map']['claims'];check(len(maps)==len(claims) and {x['claim_id'] for x in maps}==claim_ids,'claim projection map is incomplete')
 q=p['queue']
 try:
  first=resume(q,limit=10);seen=[x['candidate_id'] for x in first['items']];nxt=first['next_cursor']
  while nxt:
   page=resume(q,nxt,10);seen.extend(x['candidate_id'] for x in page['items']);nxt=page['next_cursor']
  check(seen==q['pending_company_candidate_ids'] and len(seen)==len(set(seen)),'resume dropped or repeated candidates')
 except (ValueError,KeyError) as exc:errors.append(str(exc))
 cc=p['coverage']['counts'];candidates=q['payload']['candidates']
 check(cc==p['manifest']['counts'],'manifest/coverage count mismatch')
 recomputed={'company_candidates_discovered':len(candidates),'company_candidates_reviewed':sum(c['disposition']!='queued' for c in candidates),'accepted_staged':len(p['startup-records']['startups']),'held_boundary':len(p['boundary-records']['startups']),'rejected':sum(c['disposition']=='rejected' for c in candidates),'queued_unreviewed':sum(c['disposition']=='queued' for c in candidates),'source_backed_company_dossiers':len(companies),'atomic_claims':len(claims),'claim_statuses':dict(Counter(c['status'] for c in claims)),'registered_unique_urls':len(sources),'accessed_unique_urls':sum(s['accessed'] for s in sources),'unaccessed_unique_urls':sum(not s['accessed'] for s in sources)}
 for k,v in recomputed.items():check(cc[k]==v,'count mismatch: '+k)
 check(cc['company_candidates_discovered']==cc['company_candidates_reviewed']+cc['queued_unreviewed'],'discovery count fails reconciliation')
 check(cc['company_candidates_reviewed']==cc['accepted_staged']+cc['held_boundary']+cc['rejected'],'review count fails reconciliation')
 check(p['coverage']['country_population_denominator'] is None and p['coverage']['country_completeness_claim'] is False,'unsupported country completeness')
 return {'valid':not errors,'errors':errors,'companies':len(companies),'claims':len(claims),'sources':len(sources),'events':len(events),'pending_candidates':cc['queued_unreviewed'],'limitation':'Structural/relational checks do not establish source truth; independent human-readable source review is recorded separately.'}

def graph_preview(p):
 spec=importlib.util.spec_from_file_location('atlas_graph',REPO/'scripts/make-graph.py');mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
 def load(name):return json.loads((REPO/'data'/name).read_text())
 inputs=[load(x) for x in ['partner-profiles.json','partner-leads.json','partners-reviewed.json','catalogue.json']]
 research=load('startup-research.json');before=mod.build_graph(*inputs,research)
 combined=copy.deepcopy(research);combined['startups']+=p['startup-records']['startups'];after=mod.build_graph(*inputs,combined)
 base_ids={n['id'] for n in before['entities']};new_ids={n['id'] for n in after['entities']}-base_ids
 expected={'startup:'+slug(r['name']) for r in p['startup-records']['startups']}
 if not expected<=new_ids:raise ValueError('Unexpected startup ID merge in graph preview')
 entities={n['id']:n for n in after['entities']}
 omitted=[r for r in p['startup-records']['startups'] if 'founded_year' not in r]
 if any('founded_year' in entities['startup:'+slug(r['name'])] for r in omitted):raise ValueError('Unknown founding year was synthesized in graph preview')
 return {'valid':True,'baseline_built_entities':len(before['entities']),'baseline_built_startups':sum(n['kind']=='startup' for n in before['entities']),'baseline_built_rounds':len(before['funding_rounds']),'preview_entities':len(after['entities']),'preview_startups':sum(n['kind']=='startup' for n in after['entities']),'preview_rounds':len(after['funding_rounds']),'new_startups':len(expected),'files_written':False,'boundary_records_included':False,'omitted_founding_years_preserved':len(omitted),'warning':'Read-only current-checkout preview, not production admission or hosted deployment. Boundary holds and combined-country identity review remain required.'}

if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--out');parser.add_argument('--graph-preview',action='store_true');args=parser.parse_args()
 packet=load_packet();result=validate_packet(packet)
 if args.graph_preview and result['valid']:result['graph_preview']=graph_preview(packet)
 text=json.dumps(result,ensure_ascii=False,indent=2)+'\n'
 if args.out:Path(args.out).write_text(text)
 print(text,end='');raise SystemExit(0 if result['valid'] else 1)
