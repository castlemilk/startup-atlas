#!/usr/bin/env python3
"""Offline Saudi evidence-packet checks. Does not approve sources or write production."""
from __future__ import annotations
import argparse,collections,datetime,hashlib,importlib.util,json,pathlib,re,sys,unicodedata
from urllib.parse import urlsplit,urlunsplit,parse_qsl,urlencode
HERE=pathlib.Path(__file__).resolve().parent

def strict_load(path):
 def unique(pairs):
  out={}
  for k,v in pairs:
   if k in out:raise ValueError(f'Duplicate JSON key: {k}')
   out[k]=v
  return out
 return json.loads(pathlib.Path(path).read_text(),object_pairs_hook=unique,parse_constant=lambda x:(_ for _ in ()).throw(ValueError('Nonfinite JSON '+x)))
def sha(data):return hashlib.sha256(data).hexdigest()
def name_key(v):return re.sub(r'\s+',' ',unicodedata.normalize('NFKC',v)).casefold().strip()
def domain_key(v):
 if not v:return None
 p=urlsplit(v)
 if p.scheme!='https' or not p.hostname or p.username or p.password:raise ValueError('Invalid HTTPS domain identity')
 host=p.hostname.encode('idna').decode('ascii').lower().rstrip('.')
 return host.removeprefix('www.')
def date_precision(v,p):
 if v is None:return p in (None,'unknown')
 if p=='year':return bool(re.fullmatch(r'\d{4}',v))
 if p=='month':return bool(re.fullmatch(r'\d{4}-(0[1-9]|1[0-2])',v))
 if p=='day':
  try:return datetime.date.fromisoformat(v).isoformat()==v
  except ValueError:return False
 return False

def validate(packet=HERE,repo=None):
 packet=pathlib.Path(packet);repo=pathlib.Path(repo or packet.parents[3]);errors=[];checks=[]
 def check(ok,message):
  checks.append(message)
  if not ok:errors.append(message)
 run=strict_load(packet/'run.json');claims=strict_load(packet/'claims.json')['claims'];entities=strict_load(packet/'entities.json')['entities'];sources=strict_load(packet/'sources.json')['sources'];proj=strict_load(packet/'startups.json')['startups'];coverage=strict_load(packet/'coverage.json');manifest=strict_load(packet/'manifest.json');queue=strict_load(packet/'next-source-queue.json')['items']
 projection_map=strict_load(packet/'projection-map.json')['records'];ecosystem=strict_load(packet/'ecosystem.json')['nodes'];by_claim={c['claim_id']:c for c in claims};by_entity={e['entity_id']:e for e in entities};by_name={e['name']:e for e in entities};all_entity_ids=set(by_entity)|{e['entity_id']for e in ecosystem}
 by_source={s['url']:s for s in sources};check(len(by_source)==len(sources),'source URLs unique')
 ids=[x['entity_id'] for x in entities];check(len(ids)==len(set(ids)),'staged entity IDs unique')
 accepted=[x for x in entities if x['disposition']=='accepted'];check(len(accepted)<=50,'bounded at most 50 accepted startups')
 check(len(accepted)==len(proj),'accepted entities equal schema projection count')
 cn=[c['claim_id'] for c in claims];check(len(cn)==len(set(cn)),'claim IDs unique')
 active=[c for c in claims if c['status']=='reviewed_staged'];events={c['value']['event_id']:c for c in active if c['field']=='funding_round'}
 for c in claims:
  check(c['entity_id']in all_entity_ids,f'{c["claim_id"]}: entity endpoint exists in country or ecosystem inventory')
  check(c['status']!='published_verified',f'{c["claim_id"]}: no unverified publication label')
  if c['status'] in ('reviewed_staged','conflict','candidate'):
   check(c.get('source_url') in by_source,f'{c["claim_id"]}: source registry coverage')
  if c['status']=='reviewed_staged':
   check(c.get('accessed') is True,f'{c["claim_id"]}: source accessed')
   check(c.get('source_kind')!='discovery',f'{c["claim_id"]}: no snippet-only accepted evidence')
   try:aware=datetime.datetime.fromisoformat(c['retrieved_at'].replace('Z','+00:00')).utcoffset() is not None
   except (ValueError,KeyError):aware=False
   check(aware,f'{c["claim_id"]}: zoned retrieval timestamp')
   check(bool(c.get('evidence')) and bool(c.get('rationale')),f'{c["claim_id"]}: evidence and review rationale')
   if c['field']=='funding_round':
    v=c['value'];check(v.get('amount') is None or bool(v.get('currency')),f'{c["claim_id"]}: numeric funding currency explicit')
    check(v.get('company_id',c['entity_id'])==c['entity_id'],f'{c["claim_id"]}: nested company endpoint consistent')
    check(v.get('amount')!=0,f'{c["claim_id"]}: unknown funding is not zero')
    if v.get('announced_on'):check(date_precision(v['announced_on'],v.get('date_precision')),f'{c["claim_id"]}: exact date precision retained')
   if c['field']=='round_participant':
    v=c['value'];ev=events.get(v.get('event_id'));check(ev is not None,f'{c["claim_id"]}: participant references reviewed event')
    check(ev is not None and ev['entity_id']==c['entity_id'],f'{c["claim_id"]}: participant-company endpoint consistent')
    check(v.get('resolved_entity_id') is None,f'{c["claim_id"]}: no unreviewed canonical investor match')
    check(v.get('role') in ('lead','participant','unspecified'),f'{c["claim_id"]}: explicit or unknown role')
 for e in accepted:
  ec=[c for c in active if c['entity_id']==e['entity_id']]
  check(any(c['field'] in ('identity','name','website','canonical_domain','canonical_name') for c in ec),f'{e["name"]}: primary identity evidence')
  check(bool(e.get('field_dispositions')),f'{e["name"]}: missing field dispositions retained')
  check(domain_key(e['website'])==e['canonical_domain'],f'{e["name"]}: canonical domain normalization')
  check(e.get('crawler_seed_approved') is False,f'{e["name"]}: discovery not crawler approval')
 names=[name_key(e['name']) for e in accepted];domains=[e['canonical_domain'] for e in accepted]
 check(len(names)==len(set(names)),'accepted normalized names unique');check(len(domains)==len(set(domains)),'accepted canonical domains unique')
 overlay=strict_load(repo/'data/startup-research.json')['startups'];graph=strict_load(repo/'data/graph.json')['entities']
 existing_names={name_key(x['name']) for x in overlay+graph if x.get('name')};existing_domains={domain_key(x['website']) for x in overlay+graph if x.get('website') and x['website'].startswith('https://')}
 check(not set(names)&existing_names,'no current Atlas exact-name collision');check(not set(domains)&existing_domains,'no current Atlas canonical-domain collision')
 alias_matches=[];alias_owners=collections.defaultdict(set)
 for e in accepted:
  for alias in [e['name']]+e.get('aliases',[]):
   alias_owners[name_key(alias)].add(e['entity_id'])
   if name_key(alias)in existing_names:alias_matches.append({'entity_id':e['entity_id'],'alias':alias})
 check(not alias_matches,'no reviewed-name or alias match to current Atlas')
 cross_alias={k:sorted(v)for k,v in alias_owners.items()if len(v)>1}
 check(not cross_alias,'no cross-company exact alias collision inside accepted batch')
 domain_aliases=[]
 for c in active:
  if c['field']=='website_alias':
   v=c['value'];u=v if isinstance(v,str)else v.get('url')or v.get('website')or v.get('from_url')or v.get('previous_url')or ('https://'+v['domain']if v.get('domain')else None)
   if u and u.startswith('https://'):domain_aliases.append({'claim_id':c['claim_id'],'domain':domain_key(u)})
 check(not any(d['domain']in existing_domains for d in domain_aliases),'no historical-domain collision with current Atlas')
 founder_groups=collections.defaultdict(set)
 for r in proj:
  for f in r.get('founders',[]):founder_groups[name_key(f['name'])].add(r['name'])
 cross_founders=[{'normalized_name':n,'companies':sorted(cs),'resolution':'unresolved_name_match_only'}for n,cs in founder_groups.items()if len(cs)>1]
 existing_people={name_key(x['name'])for x in graph if x.get('kind')=='person'}
 old_founder_matches=[n for n in founder_groups if n in existing_people]
 for pm in projection_map:
  e=by_entity.get(pm['entity_id']);check(e is not None and e['disposition']=='accepted',f'{pm["name"]}: projection map accepted endpoint')
  mapped=[cid for group in pm['fields'].values()for cid in group];side=[x['claim_id']for x in pm['sidecar_only']]
  check(len(side)==len(set(side)),f'{pm["name"]}: sidecar exclusion IDs unique')
  for cid in set(mapped+side):check(cid in by_claim and by_claim[cid]['entity_id']==pm['entity_id'],f'{cid}: projection evidence endpoint consistent')
  needed={c['claim_id']for c in claims if c['entity_id']==pm['entity_id']and c['status']=='reviewed_staged'}
  check(needed.issubset(set(mapped+side)),f'{pm["name"]}: every accepted claim accounted in map or sidecar')
 for record in proj:
  entity=by_name[record['name']];projected_event_ids={x['id']for x in record.get('funding_rounds',[])}
  check(record['source'] in by_source,f'{record["name"]}: projection top-level source registered')
  check('headquarters' not in record and 'incorporation' not in record and 'aliases' not in record,f'{record["name"]}: no legacy schema expansion')
  check(all(v is not None for v in record.values()),f'{record["name"]}: optional nulls omitted from legacy projection')
  for r in record.get('funding_rounds',[]):
   original=events.get(r['id']);check(original is not None and original['entity_id']==entity['entity_id'],f'{r["id"]}: projected event has correct source company')
   v=original['value']if original else {};check(r['source']==original.get('source_url')if original else False,f'{r["id"]}: event source preserved')
   check(v.get('projection_eligible')is not False,f'{r["id"]}: explicitly excluded event not projected')
   if v.get('legacy_numeric_projection_allowed')is False:check('amount'not in r and 'currency'not in r,f'{r["id"]}: numeric withholding flag enforced')
   if 'amount'in r:check(r['amount']==v.get('amount')and r.get('currency')==v.get('currency'),f'{r["id"]}: projected money exactly matches reviewed claim')
   if 'announced_on'in r:check(r['announced_on']==v.get('announced_on'),f'{r["id"]}: projected day exactly matches reviewed claim')
   check(r['source'] in by_source,f'{r["id"]}: funding source registered')
   check('participants' not in r and 'investors' not in r,f'{r["id"]}: no unsupported investor edges')
   if 'announced_on'in r:check(date_precision(r['announced_on'],'day'),f'{r["id"]}: no partial-day fabrication')
  for ev in entity.get('funding_rounds',[]):
   if ev.get('projection_eligible')is False:check(ev['event_id']not in projected_event_ids,f'{ev["event_id"]}: entity-level event exclusion enforced')
 check(coverage['counts']['discovered']==len(entities),'coverage discovered denominator consistent')
 check(coverage['counts']['accepted']==len(accepted),'coverage accepted count consistent')
 check(sum(coverage['counts'][k] for k in ('accepted','rejected','deferred'))==coverage['counts']['discovered'],'all discovery candidates have a terminal batch disposition')
 check(coverage['counts']['production_records_written']==0,'no production writes')
 check(coverage['national_completeness_claimed'] is False,'no national completeness claim')
 check(len(queue)>0 and len({q['queue_id'] for q in queue})==len(queue),'resumable queue nonempty and unique')
 for q in queue:check(bool(q.get('next_action')) and bool(q.get('reason')),f'{q["queue_id"]}: actionable gap')
 check(manifest['queue_sha256']==sha((packet/'next-source-queue.json').read_bytes()),'resume queue hash bound')
 check(manifest['claims_sha256']==sha((packet/'claims.json').read_bytes()),'claim ledger hash bound')
 check(manifest['startups_sha256']==sha((packet/'startups.json').read_bytes()),'projection hash bound')
 check(manifest['source_registry_sha256']==sha((packet/'sources.json').read_bytes()),'source registry hash bound')
 work_items=strict_load(packet/'coverage-work-items.json')['items']
 check(manifest['coverage_work_items_sha256']==sha((packet/'coverage-work-items.json').read_bytes()),'field coverage hash bound')
 check(len(work_items)==sum(len(e['field_dispositions'])for e in entities),'field coverage work inventory complete for selected entities')
 check(len({w['work_item_id']for w in work_items})==len(work_items),'field work item IDs unique')
 check(manifest['cursor']['next_queue_item']==queue[0]['queue_id'],'resume cursor starts at first prioritized queued item')
 check(manifest['base_revision']==run['base_revision'],'manifest baseline bound')
 for filename,expected in run.get('inputs',{}).items():check(sha((repo/filename).read_bytes())==expected['sha256'],f'{filename}: pinned production input unchanged')
 # Mutation-based and normalization checks address the requested failure modes.
 check(name_key('  Ｔａｂｂｙ  ')==name_key('Tabby'),'NFKC/case/space name normalization')
 check(domain_key('https://www.Example.com/a?utm_source=x')==domain_key('https://example.com/'),'www/path/query domain deduplication')
 check(not date_precision('2024-02-31','day'),'invalid calendar date rejected')
 check(not date_precision('2024-01','day') and date_precision('2024-01','month'),'partial date never padded')
 check(sha((packet/'claims.json').read_bytes()+b' ')!=manifest['claims_sha256'],'changed input invalidates checksum binding')
 for special in ('Lean Technologies','Polymeron'):
  ent=by_name[special];check(ent['headquarters']['city']is None and ent.get('operating_location',{}).get('city')is not None,f'{special}: operating base not relabelled as headquarters')
 # Use actual repository graph builder with staged overlay only in memory.
 spec=importlib.util.spec_from_file_location('atlas_make_graph',repo/'scripts/make-graph.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
 load=lambda f:strict_load(repo/'data'/f)
 try:
  base=m.build_graph(load('partner-profiles.json'),load('partner-leads.json'),load('partners-reviewed.json'),load('catalogue.json'),{'startups':overlay})
  staged=m.build_graph(load('partner-profiles.json'),load('partner-leads.json'),load('partners-reviewed.json'),load('catalogue.json'),{'startups':overlay+proj})
  bstarts=sum(x['kind']=='startup' for x in base['entities']);sstarts=sum(x['kind']=='startup' for x in staged['entities'])
  check(sstarts-bstarts==len(proj),'actual graph builder adds each staged company exactly once')
  check(len(staged['funding_rounds'])-len(base['funding_rounds'])==sum(len(r.get('funding_rounds',[]))for r in proj),'actual graph builder preserves staged funding events')
  generated={x['name']:x for x in staged['entities']if x['kind']=='startup'}
  for row in proj:
   if 'founded_year'in row:check(generated[row['name']]['founded_year']==row['founded_year'],f'{row["name"]}: native graph preserves known founding year')
   else:check('founded_year'not in generated[row['name']],f'{row["name"]}: native graph preserves unknown founding year as absent')
  unknown_to_zero=[row['name']for row in proj if 'founded_year'not in row and generated[row['name']].get('founded_year')==0]
  graph_result={'base_startups':bstarts,'staged_startups':sstarts,'base_rounds':len(base['funding_rounds']),'staged_rounds':len(staged['funding_rounds']),'existing_builder_unknown_founding_to_zero':unknown_to_zero,'unknown_founding_preserved_as_absent':[row['name']for row in proj if 'founded_year'not in row and 'founded_year'not in generated[row['name']]],'founder_name_auto_merge_candidates':cross_founders,'existing_person_name_matches':old_founder_matches}
 except Exception as ex:errors.append('graph builder: '+str(ex));graph_result=None
 return {'valid':not errors,'production_integration_ready':False,'checks':len(checks),'errors':errors,'accepted':len(accepted),'claims':len(claims),'reviewed_claims':len(active),'sources':len(sources),'queue_items':len(queue),'dedup':{'overlay_records':len(overlay),'committed_graph_startups':sum(x.get('kind')=='startup'for x in graph),'name_alias_collisions':alias_matches,'cross_company_alias_collisions':cross_alias,'historical_domain_checks':domain_aliases,'founder_cross_company_name_matches':cross_founders},'graph_simulation':graph_result,'resolved_integration_findings':[{'finding':'Unknown founding years no longer synthesized as zero','upstream_pr':'https://github.com/castlemilk/startup-atlas/pull/179','verified_in_current_source':True,'runtime_deployment_claimed':False}],'integration_gates':['Explicit person identity review before native graph name-only founder coalescing.','Source and company identity review; no production writes or seed approvals authorized by this packet.'],'warning':'Local structural/evidence-link checks, not source truth, crawler approval, publication or national completeness.'}
if __name__=='__main__':
 ap=argparse.ArgumentParser();ap.add_argument('--repo',default=str(HERE.parents[3]));ap.add_argument('--packet',default=str(HERE));a=ap.parse_args();r=validate(a.packet,a.repo);print(json.dumps(r,indent=2));sys.exit(0 if r['valid'] else 1)
