#!/usr/bin/env python3
"""Deterministic Italy research receipt builder; never writes production data."""
import hashlib
import importlib.util
import json
import re
import sys
import unicodedata
from collections import Counter
from pathlib import Path
from urllib.parse import urlsplit

sys.dont_write_bytecode = True

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[4]
BASE = '988a4ddcc4dbbc853da0c7f7899b6d6e7579f840'
INITIAL_BASE = 'f4bcbf7030d741772bb750deee584efa3ee17749'
DATE = '2026-11-18'
LANES = ('general', 'fintech', 'deeptech')
INPUTS = ('partner-profiles.json', 'partner-leads.json', 'partners-reviewed.json', 'catalogue.json', 'startup-research.json')

def read(path):
    return json.loads(path.read_text(encoding='utf-8'))

def write(name, value):
    (HERE/name).write_text(json.dumps(value, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()

def norm_name(value):
    return ' '.join(unicodedata.normalize('NFKC', value).casefold().split())

def slug(value):
    value = unicodedata.normalize('NFKD', value).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', '-', value).strip('-')

def domain(value):
    if not value:
        return None
    parsed = urlsplit(value if '://' in value else 'https://'+value)
    host = (parsed.hostname or '').lower().rstrip('.')
    if not host or parsed.username or parsed.password:
        raise ValueError('Invalid public company URL')
    return host.removeprefix('www.')

def graph_from_source(research=None):
    spec = importlib.util.spec_from_file_location('italy_graph_builder', ROOT/'scripts/make-graph.py')
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    inputs = [read(ROOT/'data'/name) for name in INPUTS]
    if research is not None:
        inputs[-1] = research
    return mod.build_graph(*inputs)

def source_state(s):
    if s.get('access_status') == 'partial' or 'partial' in s.get('access_outcome', ''):
        return 'partial'
    return 'usable' if s.get('accessed') else 'unavailable'

def main():
    packets = {lane: read(HERE/'evidence'/f'{lane}.json') for lane in LANES}
    eco = read(HERE/'evidence/ecosystem-sources.json')
    all_sources = []
    claims = []
    company_rows = []
    for lane, packet in packets.items():
        for index, s in enumerate(packet['sources']):
            all_sources.append({**s, 'packet': lane, 'evidence_pointer': f'evidence/{lane}.json#/sources/{index}', 'content_state': source_state(s), 'crawler_seed_approved': False})
            if '240925-Genespire-Series-B' in s['url']:
                all_sources[-1]['rights_notice']='Public company press-release PDF bears a Riservato / Confidential footer. Only bounded factual paraphrases and the URL are retained; no original document or full page body is included.'
        claims.extend(packet['claims'])
        for index, c in enumerate(packet['companies']):
            name = c.get('name', c.get('canonical_name'))
            cid = c.get('id', c.get('entity_id'))
            website = c['website']['value'] if isinstance(c['website'], dict) else c['website']
            accepted = name not in ('Fiscozen', 'Bending Spoons')
            company_rows.append({
                'id': cid, 'name': name, 'website': website, 'canonical_domain': domain(website),
                'aliases': c.get('aliases', []), 'atlas_candidate_id': 'startup:'+slug(name),
                'decision': 'accepted_staging' if accepted else 'rejected_reference_only',
                'reason': 'Primary identity/activity and Italy nexus reviewed; current legal lifecycle not comprehensively registry-audited.' if accepted else ('Acquisition by Visma in April 2024 is explicitly documented.' if name == 'Fiscozen' else 'September 2026 company release explicitly identifies NASDAQ:BSP.'),
                'source_packet': f'evidence/{lane}.json', 'evidence_pointer': f'/companies/{index}',
                'founders': [{'name': p['name'], 'atlas_candidate_id': 'person:'+slug(p['name']), 'canonical_person_id': None} for p in c.get('founders', [])],
                'published': False,
            })
    for index, s in enumerate(eco['sources']):
        all_sources.append({**s, 'packet': 'ecosystem', 'evidence_pointer': f'evidence/ecosystem-sources.json#/sources/{index}', 'content_state': source_state(s), 'crawler_seed_approved': False})
    # Fintech logs contain two failed URL reads beyond its claim-bearing registry.
    known_urls = {s['url'] for s in all_sources}
    for i, obs in enumerate(packets['fintech']['access_log']):
        if obs.get('url') and obs['url'] not in known_urls:
            sid = f'it-fin-access-{i+1:02d}'
            all_sources.append({'id': sid, 'url': obs['url'], 'title': 'Unusable source attempt', 'publisher': 'Company or official media host', 'source_kind': 'discovery', 'accessed': False, 'retrieved_at': obs['checked_at'], 'retrieval_time_precision': 'batch_checkpoint', 'published_on': None, 'acquisition': 'web_tool_page_read', 'access_outcome': obs['outcome'], 'evidence': obs['reason'], 'packet': 'fintech', 'evidence_pointer': f'evidence/fintech.json#/access_log/{i}', 'content_state': 'unavailable', 'crawler_seed_approved': False})
            known_urls.add(obs['url'])
    eco_claims = read(HERE/'evidence/ecosystem-claims.json')
    claims.extend({**c, 'publication_state': 'unsubmitted'} for c in eco_claims['claims'])
    all_sources.sort(key=lambda s: s['id'])
    company_rows.sort(key=lambda c: c['id'])
    claims.sort(key=lambda c: c['claim_id'])
    write('source-registry.json', {'schema_version': 1, 'retrieved_on': DATE, 'count_semantics': 'Unique registered URL evidence and failed attempts, not every web-tool invocation or search result. Repeated reads/finds and independent-review rereads do not add source URLs. Partial source content is not proof of subject facts.', 'sources': all_sources})
    write('claims.json', {'run': {'country': 'Italy', 'base_revision': BASE, 'initial_research_revision': INITIAL_BASE, 'reviewed_on': DATE, 'publication_state': 'unsubmitted'}, 'claims': claims})
    write('company-index.json', {'schema_version': 1, 'companies': company_rows})

    graph = graph_from_source()
    baseline = {'base_revision': BASE, 'inputs': {f'data/{name}': sha(ROOT/'data'/name) for name in INPUTS}, 'builder_sha256': sha(ROOT/'scripts/make-graph.py'), 'startup_entities': [{'id': n['id'], 'name': n['name'], 'website': n.get('website') or None, 'canonical_domain': domain(n.get('website'))} for n in graph['entities'] if n['kind']=='startup'], 'person_entities': [{'id': n['id'], 'name': n['name']} for n in graph['entities'] if n['kind']=='person'], 'funding_round_ids': [r['id'] for r in graph['funding_rounds']], 'counts': {'entities':len(graph['entities']), 'startups':sum(n['kind']=='startup' for n in graph['entities']), 'edges':len(graph['edges']), 'funding_rounds':len(graph['funding_rounds']), 'articles':len(graph['articles'])}}
    write('baseline-snapshot.json', baseline)
    matches = []
    founders = []
    for c in company_rows:
        names = {norm_name(c['name'])} | {norm_name(a if isinstance(a, str) else a['name']) for a in c['aliases']}
        hits = [{'id': b['id'], 'name': b['name'], 'reasons': [reason for reason, yes in [('name_or_alias', norm_name(b['name']) in names), ('domain', b['canonical_domain'] and b['canonical_domain']==c['canonical_domain']), ('graph_slug', b['id']==c['atlas_candidate_id'])] if yes]} for b in baseline['startup_entities']]
        hits = [h for h in hits if h['reasons']]
        matches.append({'company_id': c['id'], 'exact_matches': hits, 'disposition': 'requires_identity_review' if hits else 'no_existing_match_in_pinned_snapshot', 'automatic_merge': False})
        for p in c['founders']:
            hits = [b for b in baseline['person_entities'] if b['id']==p['atlas_candidate_id'] or norm_name(b['name'])==norm_name(p['name'])]
            founders.append({'company_id':c['id'], **p, 'existing_matches':hits, 'automatic_merge':False})
    within = []
    for i, c in enumerate(company_rows):
        for other in company_rows[i+1:]:
            if c['canonical_domain']==other['canonical_domain'] or c['atlas_candidate_id']==other['atlas_candidate_id']:
                within.append([c['id'],other['id']])
    write('deduplication.json', {'base_revision': BASE, 'snapshot_kind': 'rebuilt_from_source', 'startup_denominator':len(baseline['startup_entities']), 'rules': ['NFKC/casefold/whitespace names and explicit aliases', 'Lowercase host, remove www and trailing dot; preserve subdomains and registrable-domain boundaries', 'Atlas NFKD slug collisions flagged separately', 'No legal-suffix stripping, fuzzy merge, person-name-only reconciliation or portfolio-based round inference'], 'companies':matches, 'founders':founders, 'within_batch_identity_collisions':within, 'matched_existing_company_count':sum(bool(x['exact_matches']) for x in matches), 'founder_match_count':sum(bool(x['existing_matches']) for x in founders)})

    leads = read(HERE/'evidence/startup-leads.json')['leads']
    pending = []
    existing_names = {norm_name(c['name']) for c in company_rows}
    for lead in leads:
        if norm_name(lead['candidate_name']) not in existing_names:
            pending.append({**lead, 'id':'candidate:it:'+slug(lead['candidate_name']), 'decision':'pending_primary_identity_review'})
    write('pending-candidates.json', {'schema_version':1, 'candidates':pending, 'denominator':None, 'pagination_exhausted':False})
    queue = read(HERE/'evidence/next-source-queue.json')['items']
    for lane in ('fintech','deeptech'):
        tasks=packets[lane].get('next_queue',packets[lane].get('next_source_queue',[]))
        for i, task in enumerate(tasks):
            queue.append({**task, 'queue_id':f'it-{lane}-refresh-{i+1:02d}', 'status':'pending', 'max_pages':5, 'crawler_seed_approved':False, 'pagination_exhausted':False})
    general_tasks = [
        ('WeRoad currency', 'Reconcile the conflicting $58m and €58m Series C labels with a second primary source.', ['it-general-weroad-seriesc']),
        ('Domyn completed funding', 'Verify an actually closed round and legal issuer; treat fundraising targets and unavailable SEC XML as unresolved.', ['it-general-domyn-home','it-general-domyn-sec-blocked']),
        ('Unobravo chronology', 'Reconcile 2019 initiative and 2020 founding wording; verify 2022 round via an accessible primary release.', ['it-general-unobravo-about','it-general-unobravo-exit','it-general-unobravo-2022-blocked']),
        ('General geography and incorporation', 'Verify current HQ for Serenis/Musixmatch, exact SQIM legal rename date and legal incorporation separately from company origins.', ['it-general-serenis-legal','it-general-musixmatch-tpg','it-general-sqim-hq']),
        ('South and islands', 'Allocate the next company pass to Puglia, Sicily, Sardinia, Calabria, Abruzzo and Basilicata using official regional and university sources.', []),
    ]
    for i,(title,task,sids) in enumerate(general_tasks):
        queue.append({'queue_id':f'it-general-refresh-{i+1:02d}', 'priority':1 if i<2 else 2, 'title':title, 'next_action':task, 'source_ids':sids, 'max_pages':5, 'status':'pending', 'pagination_exhausted':False, 'crawler_seed_approved':False})
    queue.sort(key=lambda q:(q.get('priority',9),q['queue_id']))
    write('next-source-queue.json', {'schema_version':1, 'collection_owner':'https://chatgpt.com/c/6afbc931-0378-83ec-8434-cd7e8db42db2', 'planner':'https://github.com/castlemilk/startup-atlas/pull/177', 'owner_acknowledgement':None, 'country_scope':'IT', 'items':queue, 'source_policy':'Research discovery is not crawler-seed approval.'})
    url_states = {}
    for s in all_sources:
        url_states.setdefault(s['url'],set()).add(s['content_state'])
    counts = Counter('usable' if 'usable' in v else 'partial' if 'partial' in v else 'unavailable' for v in url_states.values())
    manifest = {'schema_version':1, 'packet_id':'italy-gdp09-20261118-batch001', 'country':'Italy', 'country_code':'IT', 'reviewed_on':DATE, 'base_revision':BASE, 'branch':'research/italy-gdp09-batch01-20261118', 'staging_only':True, 'production_writes':0, 'cohort':{'source':'user-specified IMF October 2026 WEO 2026 nominal GDP estimates, excluding aggregates', 'rank':9, 'size':30, 'gdp_value':None, 'independently_verified':False, 'source_ids':['it-eco:imf-api','it-eco:imf-weo']}, 'counts':{'discovered_unique_candidates':len(company_rows)+len(pending), 'reviewed_companies':len(company_rows), 'accepted_staging':sum(c['decision']=='accepted_staging' for c in company_rows), 'rejected_reference_only':sum(c['decision']=='rejected_reference_only' for c in company_rows), 'pending_primary_identity_review':len(pending), 'published_companies':0, 'registered_source_entries':len(all_sources), 'registered_unique_source_urls':len(url_states), 'source_url_content_outcomes':dict(sorted(counts.items())), 'claims':len(claims), 'claim_statuses':dict(sorted(Counter(c['status'] for c in claims).items()))}, 'denominators':{'bounded_reviewed_set':len(company_rows), 'national_atlas_eligible_startup_population':None, 'statutory_startups_2025_10_31':12073, 'statutory_count_is_batch_denominator':False}, 'source_pagination_exhausted':False, 'founder_lists_complete':False, 'funding_histories_complete':False, 'investor_lists_complete':False, 'incorporation_registry_audit_complete':False, 'all_sources_crawler_approved':False, 'ownership':{'collection':'https://chatgpt.com/c/6afbc931-0378-83ec-8434-cd7e8db42db2', 'coordination':'https://github.com/castlemilk/startup-atlas/pull/177#issuecomment-6974888294', 'acknowledgement_received':False, 'owned_paths':['research/countries/italy/2026-11-18/batch-001/']}, 'material_gaps':['Exact IMF vintage/value/ranking not independently reproduced.', 'No national or complete institutional directory denominator.', 'Northern investor and university sources overrepresented; south/islands next.', 'Historical funding reviewed, not an exhaustive latest-round refresh for every company.', 'Current HQ and incorporation are separate; unknowns preserved.', 'No resolved canonical investor entities or typed production funding participation.', 'Known stale committed graph; deduplication uses a source rebuild.']}
    manifest['initial_research_revision']=INITIAL_BASE
    manifest['upstream_updates_adopted']=[{'pr':179,'scope':'Preserve omitted founding years in generated graph'},{'pr':181,'scope':'Reject legacy funding-source replacement that would silently inherit claims'}]
    write('country-manifest.json', manifest)
    checkpoint = {'schema_version':1, 'packet_id':manifest['packet_id'], 'base_revision':BASE, 'evidence_sha256':{f'evidence/{lane}.json':sha(HERE/'evidence'/f'{lane}.json') for lane in LANES}, 'source_registry_sha256':sha(HERE/'source-registry.json'), 'reviewed_ids':[c['id'] for c in company_rows], 'accepted_ids':[c['id'] for c in company_rows if c['decision']=='accepted_staging'], 'rejected_ids':[c['id'] for c in company_rows if c['decision']=='rejected_reference_only'], 'pending_candidate_ids':[c['id'] for c in pending], 'pending_queue_ids':[q['queue_id'] for q in queue], 'resume_policy':'Validate hashes and refresh current main, deduplication and owner handoff before any next batch. Source directory cursors remain null; saved IDs are a local research checklist, not a crawler runtime or #177 replacement.', 'production_submitted_ids':[]}
    checkpoint['state_sha256']=digest(checkpoint)
    write('checkpoint.json',checkpoint)
    print(json.dumps(manifest['counts'],ensure_ascii=False))

if __name__ == '__main__':
    main()
