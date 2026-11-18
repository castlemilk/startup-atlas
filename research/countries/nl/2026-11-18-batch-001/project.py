#!/usr/bin/env python3
"""Rebuild this bounded research packet's projection and review receipts.

Reads country-owned evidence and the pinned repository data. Never writes to
production data, activates collection, resolves investor identities or deploys.
"""
import copy
import hashlib
import importlib.util
import json
import re
import subprocess
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path
from urllib.parse import urlsplit

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
BASE = 'f4bcbf7030d741772bb750deee584efa3ee17749'
REVIEW_DATE = '2026-11-18'
PRODUCTION_INPUTS = ['data/startup-research.json', 'data/graph.json', 'data/catalogue.json', 'data/partners-reviewed.json', 'data/partner-leads.json', 'data/partner-profiles.json']

def read(path): return json.loads(path.read_text())
def write(name, value): (HERE / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
def digest(value): return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
def file_hash(path): return hashlib.sha256(path.read_bytes()).hexdigest()
def norm_name(value): return ' '.join(unicodedata.normalize('NFKC', value).casefold().split())
def slug(value): return re.sub('[^a-z0-9]+', '-', unicodedata.normalize('NFKD', value).encode('ascii', 'ignore').decode().lower()).strip('-')
def domain(value): return (urlsplit(value).hostname or '').lower().removeprefix('www.')
def full_date(value): return isinstance(value, str) and bool(re.fullmatch(r'\d{4}-\d{2}-\d{2}', value))
def text_amount(event):
    if event.get('amount_text'): return event['amount_text']
    if event.get('raw_amount'): return event['raw_amount']
    if event.get('amount') is not None: return f"{event['currency']} {event['amount']:,}"
    return 'Amount not established in reviewed evidence'

def project(company):
    facts = []
    def fact(key, label, value, source):
        if value: facts.append({'key': key, 'label': label, 'value': value, 'source': source, 'reviewed_at': REVIEW_DATE})
    record = {'name': company['canonical_name'], 'website': company['website'], 'description': company['description']['text'], 'source': company['description']['source_url'], 'reviewed_at': REVIEW_DATE}
    if company.get('founded'):
        f = company['founded']
        record['founded_year'] = int(str(f['value'])[:4])
        fact('founding-date-precision', 'Company founding observation', f"{f['value']} ({f['precision']} precision; distinct from incorporation)", f['source_url'])
    if company.get('hq'):
        h = company['hq']
        value = ', '.join(str(h[k]) for k in ('city', 'country') if h.get(k))
        if h.get('as_of'): value += f"; source observation as of {h['as_of']}"
        if h.get('status') == 'historical_observation': value += '; historical headquarters observation'
        fact('headquarters-observation', 'Source-reported headquarters', value, h['source_url'])
    if company.get('incorporation'):
        i = company['incorporation']
        parts = [f'{key}: {i[key]}' for key in ('legal_entity', 'jurisdiction', 'incorporated_on', 'date', 'date_precision', 'identifier', 'entity_scope', 'verification') if i.get(key)]
        fact('legal-entity-observation', 'Qualified legal entity observation', '; '.join(parts), i['source_url'])
    for index, alias in enumerate(company.get('aliases', []), 1):
        fact(f'name-observation-{index}', 'Supported name or alias', alias['name'], alias['source_url'])
    fact('sector-classification', 'Researcher sector classification', '; '.join(company['sectors']['values']), company['sectors']['source_url'])
    if company.get('country_scope'):
        fact('country-scope', 'Country research scope', company['country_scope'], company['identity_source_url'])
    if company.get('founders'):
        record['founders'] = [{'name': f['name'], 'source': f['source_url']} for f in company['founders']]
    projected_events = []
    for event in company.get('funding_rounds', []):
        stage = event.get('stage') or ('Venture debt' if 'debt' in event['kind'] else 'Blended financing' if event['kind'] == 'blended_finance' else 'Funding (stage unspecified)')
        p = {'id': event['id'], 'stage': stage, 'source': event['source_url']}
        notes = [f"Instrument classification: {event['kind']}."] + event.get('notes', [])
        if event['date_precision'] == 'day' and full_date(event.get('announced_on')):
            p['announced_on'] = event['announced_on']
        else:
            notes.append(f"Announcement observation: {event.get('announced_on')} ({event['date_precision']} precision); exact day unknown.")
        # Typed mixed/debt/unspecified amounts remain available in companies.json.
        # The legacy numeric display is reserved for sourced venture/equity rounds.
        if event['kind'] in {'equity', 'venture_round'} and event.get('amount') is not None and event.get('currency'):
            p['amount'] = event['amount']; p['currency'] = event['currency']
        else:
            p['amount_text'] = text_amount(event)
        for key in ('amount_source_url', 'currency_source_url', 'stage_source_url'):
            if event.get(key) and event[key] != event['source_url']:
                notes.append(f"{key.replace('_', ' ')}: {event[key]}")
        notes.append('Event-specific participants and legal-entity uncertainties are retained in the staged evidence ledger; no investor graph edges are created.')
        p['note'] = ' '.join(notes)
        projected_events.append(p)
    if projected_events: record['funding_rounds'] = projected_events
    if facts: record['profile_facts'] = facts
    return record

def build():
    for path in PRODUCTION_INPUTS + ['scripts/make-graph.py', 'backend/hosted/src/startup-record.mjs', 'scripts/catalogue-entries.mjs']:
        pinned = subprocess.check_output(['git', 'show', f'{BASE}:{path}'], cwd=ROOT)
        if (ROOT / path).read_bytes() != pinned:
            raise ValueError(f'Pinned baseline changed: {path}. Refresh the country checkpoint and deduplication deliberately; do not silently relabel a new main as the old base.')
    package = read(HERE / 'companies.json')
    companies = package['companies']
    source_rows = read(HERE / 'source-registry.json')['sources']
    sources = {s['url']: s for s in source_rows}
    records = [project(c) for c in companies]
    write('startup-records.json', {'startups': records})

    claims = []
    seen = set()
    def claim(company, field, value, source_url, evidence, *, status='reviewed_staged', effective_on=None, confidence='high', rationale=None, path=None, supporting=None):
        if value is None: return
        source = sources[source_url]
        if not source.get('accessed') or source.get('evidence_usable') is False or source['source_kind'] == 'discovery':
            raise ValueError(f'Unusable claim source: {source_url}')
        entity = company['staging_id']
        key = digest([entity, field, value, source_url, effective_on])
        if key in seen: return
        seen.add(key)
        c = {'claim_id': 'nl-' + key[:20], 'entity_id': entity, 'canonical_entity_id': None, 'field': field, 'value': value, 'source_url': source_url, 'source_id': source['id'], 'source_kind': source['source_kind'], 'accessed': True, 'retrieved_at': source['retrieved_at'], 'published_on': source.get('published_on') if full_date(source.get('published_on')) else None, 'effective_on': effective_on if full_date(effective_on) else None, 'evidence': evidence or f'The cited source supports the {field.replace("_", " ")} observation.', 'acquisition': source.get('acquisition', 'web_tool_page_read'), 'confidence': confidence, 'rationale': rationale or 'Bounded source-backed observation; qualifications and unresolved legal identities remain in the research sidecar.', 'status': status, 'reviewed_at': company['reviewed_at'], 'publication_state': 'unsubmitted', 'company_data_path': path}
        if supporting: c['supporting_source_urls'] = supporting
        claims.append(c)
    def observation_walk(company, value, path):
        if isinstance(value, dict):
            source_url = value.get('source_url')
            if source_url:
                stripped = {k: v for k, v in value.items() if k not in {'source_url', 'evidence', 'notes', 'corroboration'}}
                claim(company, 'source_observation', {'path': path, 'observation': stripped}, source_url, value.get('evidence'), status='conflict' if 'conflict' in path or 'founding_observations' in path else 'reviewed_staged', effective_on=value.get('effective_on', value.get('as_of')), path=path)
            for k, v in value.items():
                if isinstance(v, (dict, list)): observation_walk(company, v, f'{path}.{k}')
        elif isinstance(value, list):
            for i, item in enumerate(value): observation_walk(company, item, f'{path}[{i}]')

    for company in companies:
        claim(company, 'canonical_name', company['canonical_name'], company['identity_source_url'], 'Reviewed official company identity and naming.', path='canonical_name')
        w = company.get('website_evidence', {})
        claim(company, 'website', company['website'], w.get('source_url', company['identity_source_url']), w.get('method', 'Official website identified.'), path='website')
        for key in ['description', 'sectors', 'hq', 'founded', 'incorporation']:
            value = company.get(key)
            if value:
                claim(company, key, {k: v for k, v in value.items() if k not in {'source_url', 'evidence'}}, value['source_url'], value.get('evidence') or ('Researcher classification from the sourced product description.' if key == 'sectors' else None), confidence=value.get('confidence', 'high'), path=key)
        for i, alias in enumerate(company.get('aliases', [])):
            claim(company, 'alias', alias['name'], alias['source_url'], alias.get('evidence', 'The cited company source supports this name variant.'), path=f'aliases[{i}]')
        for i, founder in enumerate(company.get('founders', [])):
            claim(company, 'founder', {'name': founder['name'], 'role': founder['role'], 'canonical_person_id': None, 'role_effective_on': founder.get('role_effective_on')}, founder['source_url'], founder.get('evidence'), effective_on=founder.get('role_effective_on'), confidence=founder.get('confidence', 'high'), path=f'founders[{i}]')
        for index, event in enumerate(company.get('funding_rounds', [])):
            path = f'funding_rounds[{index}]'
            common = {'event_id': event['id']}
            claim(company, 'funding_round', {**common, 'announced_on': event.get('announced_on'), 'date_precision': event['date_precision']}, event['source_url'], event.get('evidence'), effective_on=event.get('announced_on'), path=path)
            if event.get('stage'):
                claim(company, 'funding_stage', {**common, 'stage': event['stage']}, event.get('stage_source_url', event['source_url']), 'Source labels this financing stage.', path=path+'.stage')
            claim(company, 'financing_kind', {**common, 'kind': event['kind']}, event['source_url'], 'Instrument specificity is limited to the reviewed evidence; unspecified is retained where no instrument is stated.', path=path+'.kind')
            if event.get('amount') is not None:
                amount_source = event.get('amount_source_url', event.get('currency_source_url', event['source_url']))
                claim(company, 'funding_amount', {**common, 'amount': event['amount'], 'currency': event['currency'], 'scope': event.get('amount_precision', event['kind'])}, amount_source, 'Reported financing amount and currency; no FX calculation or cumulative-funding substitution.', path=path+'.amount', supporting=[event['source_url']] if amount_source != event['source_url'] else None)
            else:
                claim(company, 'funding_amount_observation', {**common, 'amount_text': text_amount(event), 'selected_amount': None, 'selected_currency': None}, event['source_url'], 'Amount text retained with unresolved precision, composition or currency.', status='conflict' if event.get('amount_precision') == 'conflict' else 'reviewed_staged', path=path+'.amount_text')
            for pindex, participant in enumerate(event.get('participants', [])):
                role = participant['role']
                field = 'round_participant' if role in {'lead', 'participant', 'unspecified'} else 'financing_support'
                claim(company, field, {**common, 'name': participant['name'], 'role': role, 'canonical_investor_id': None}, participant['source_url'], participant.get('evidence'), path=path+f'.participants[{pindex}]')
            for special in ['amount_observations', 'alternate_amounts', 'components', 'participant_name_observations', 'contribution_observations', 'valuation', 'unresolved_participant_mentions']:
                if event.get(special): observation_walk(company, event[special], path+'.'+special)
        for special in ['founding_observations', 'headquarters_history', 'locations', 'operating_geographies', 'operating_base', 'legal_entity_observations', 'legal_observations', 'corporate_identifiers', 'origin', 'conflicts', 'launch', 'other_financing_observations', 'lifecycle', 'shareholder_observations']:
            if company.get(special): observation_walk(company, company[special], special)
        # Explicit dispositions accompany nulls; reviewed-page checks are not a registry search.
        for field in ['hq', 'incorporation', 'founded', 'founders', 'funding_rounds']:
            if company.get(field): continue
            conflicts = company.get('founding_observations', []) if field == 'founded' else [o for o in company.get('legal_observations', []) if o.get('legal_entity') == 'Picnic B.V.'] if field == 'incorporation' and company['canonical_name'] == 'Picnic' else []
            if conflicts:
                claim(company, field, {'selected_value':None,'disposition':'conflicting_source_observations','observations':conflicts}, conflicts[0]['source_url'], 'Reviewed sources disagree; selected canonical value remains null.', status='conflict', confidence='high', rationale='High confidence that a source conflict exists, not confidence in either competing value.', path=field, supporting=[o['source_url'] for o in conflicts[1:]])
                continue
            raw = company.get('field_dispositions', {}).get({'hq':'headquarters','founded':'founding','funding_rounds':'funding'}.get(field,field), {})
            unsearched = field == 'incorporation' and (not raw or isinstance(raw, dict) and raw.get('status') == 'unsearched')
            status = 'unsearched' if unsearched else 'searched_unknown'
            rationale = raw.get('reason') if isinstance(raw, dict) else str(raw)
            c = {'claim_id': f"{company['staging_id']}-{field}-disposition", 'entity_id': company['staging_id'], 'field': field, 'value': None, 'status': status, 'publication_state':'unsubmitted', 'rationale': rationale or 'No unambiguous selected value established in the bounded reviewed pages; conflicting observations are retained separately.'}
            if status == 'searched_unknown': c['search_log'] = [{'action':'reviewed cited company and event pages for this field','source_urls':sorted({x['source_url'] for x in claims if x['entity_id']==company['staging_id'] and x.get('source_url')}),'boundary':'Does not imply a complete registry or whole-web search.'}]
            claims.append(c)
    write('claims.json', {'format':'nl-enrichment-ledger-v1','entity_id_namespace':'nl: identifiers are explicitly unresolved country staging identities, not existing Atlas IDs','publication_state_meaning':'Unsubmitted for production enrichment; a research packet PR is not publication of these claims in the application.','claims':claims})

    spec = importlib.util.spec_from_file_location('nl_graph', ROOT / 'scripts/make-graph.py')
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    baseline = module.build_graph(module.load('partner-profiles.json'),module.load('partner-leads.json'),module.load('partners-reviewed.json'),module.load('catalogue.json'),module.load('startup-research.json'))
    old_startups = [x for x in baseline['entities'] if x['kind']=='startup']
    rows = []
    for company in companies:
        names = {norm_name(company['canonical_name'])} | {norm_name(a['name']) for a in company.get('aliases', [])}
        matches = [x['id'] for x in old_startups if norm_name(x['name']) in names or company['proposed_atlas_id']==x['id'] or x.get('website') and domain(x['website'])==company['domain_normalized']]
        rows.append({'staging_id':company['staging_id'],'proposed_atlas_id':company['proposed_atlas_id'],'canonical_name':company['canonical_name'],'normalized_domain':company['domain_normalized'],'normalized_names':sorted(names),'matched_existing_ids':matches,'decision':'new_candidate_no_existing_match' if not matches else 'hold_for_identity_resolution'})
    founder_ids = defaultdict(list)
    old_people = {x['id']:x for x in baseline['entities'] if x['kind']=='person'}
    for company in companies:
        for person in company.get('founders',[]): founder_ids['person:'+slug(person['name'])].append({'company':company['canonical_name'],'name':person['name'],'source_url':person['source_url']})
    person_collisions = [{'proposed_id':k,'observations':v,'existing':old_people.get(k)} for k,v in founder_ids.items() if k in old_people or len(v)>1]
    investor_names = defaultdict(set)
    for company in companies:
        for event in company['funding_rounds']:
            for p in event.get('participants',[]):
                if p['role'] in {'lead','participant','unspecified'}: investor_names[p['name']].add(event['id'])
    investor_candidates = [{'name':name,'event_ids':sorted(events),'canonical_investor_id':None,'name_only_possible_matches':[x['id'] for x in baseline['entities'] if x['kind'] in {'partner','provider'} and norm_name(x['name'])==norm_name(name)],'resolution':'unresolved; exact name is a review candidate, not a legal fund/manager identity decision'} for name,events in sorted(investor_names.items())]
    write('deduplication.json', {'base_revision':BASE,'input_scope':'Fresh in-memory graph from six pinned source files; all 46 startup entities plus 45 overlay records','normalization':'Unicode NFKC/casefold/space; explicit aliases; ASCII Atlas slug; lowercase website host with www removed; no public-suffix or name-only legal merger','startup_checks':rows,'founder_identity_collisions':person_collisions,'investor_name_candidates':investor_candidates,'legal_continuity_notes':['Q*Bird and Falqon Systems are one sourced continuing entity.','Battolyser Systems and VDL Hydrogen Systems are predecessor businesses, not Alquion aliases.','Mews parent and OPCO, Cradle Swiss counterparty and Dutch operations, and Onera legal names remain scoped observations.']})

    candidates = read(HERE/'candidate-ledger.json')['candidates']
    queue = read(HERE/'next-sources.json')
    dispositions = Counter(x['decision'] for x in candidates)
    extra_gaps=read(HERE/'source-registry.json').get('additional_access_gap_registry',[])
    counts = {'discovered':len(candidates),'reviewed':sum(bool(x['reviewed']) for x in candidates),'accepted_staged':dispositions['accepted_staged'],'rejected':dispositions['rejected'],'deferred':sum(v for k,v in dispositions.items() if k.startswith('deferred_')),'pending_company_verification':dispositions['pending_company_verification'],'founder_attributions':sum(len(c['founders']) for c in companies),'financing_events':sum(len(c['funding_rounds']) for c in companies),'round_participant_relationships':sum(c['field']=='round_participant' for c in claims),'lender_or_programme_support_relationships':sum(c['field']=='financing_support' for c in claims),'source_registry_urls':len(sources),'source_registry_accessed_urls':sum(bool(s.get('accessed')) for s in source_rows),'source_registry_evidence_usable_urls':sum(bool(s.get('accessed')) and s.get('evidence_usable') is not False for s in source_rows),'additional_access_gap_urls':len(extra_gaps),'curated_source_and_gap_urls':len(set(sources)|{g['url'] for g in extra_gaps}),'company_claim_sources':len({c['source_url'] for c in claims if c.get('source_url')}),'claims_including_dispositions':len(claims),'queue_entries':len(queue['entries']),'actual_crawler_runs':0,'seeds_approved':0,'production_records_written':0}
    binding = {'base_revision':BASE,'companies_sha256':file_hash(HERE/'companies.json'),'candidate_ledger_sha256':file_hash(HERE/'candidate-ledger.json'),'source_registry_sha256':file_hash(HERE/'source-registry.json'),'queue_sha256':file_hash(HERE/'next-sources.json')}
    fingerprint = digest(binding)
    coverage = {'format':'nl-bounded-coverage-v1','complete':False,'national_denominator':None,'count_scope':'Fixed enumerated candidate ledger; reviewed includes accepted and deferred; discovery-only names are pending. This is not an estimate of all Dutch startups.','counts':counts,'dispositions':dict(dispositions),'bound_snapshot':binding,'snapshot_fingerprint':fingerprint,'resume_checkpoint':{'snapshot_fingerprint':fingerprint,'country':'NL','completed_candidate_ids':[x['candidate_id'] for x in candidates if x['reviewed']],'pending_candidate_ids':[x['candidate_id'] for x in candidates if not x['reviewed']],'next_queue_id':'NL-ECO-Q01','next_named_items':['PhotonBridge','EUCLYD','eyeo','Groove Quantum'],'page_cursor':None,'page_cursor_status':'not observed; must inspect public continuation before traversing','terminal_observed':False},'dimension_presence':{field:{'present':sum(bool(c.get(field)) for c in companies),'null_or_empty':sum(not bool(c.get(field)) for c in companies),'meaning':'Presence is not proof of completeness or legal verification.'} for field in ['hq','incorporation','founded','founders','funding_rounds']}}
    write('coverage.json', coverage)
    manifest = {'format':'nl-batch-manifest-v1','country':'Netherlands','country_code':'NL','batch':'2026-11-18-batch-001','base_revision':BASE,'base_tree':'854c7e4fd9d50f9c3cf50167c9f96dce934e4d96','branch':'research/netherlands-gdp18-20261118','owned_path':'research/countries/nl/2026-11-18-batch-001/','cohort':{'position_user_supplied':18,'size_user_supplied':30,'basis_user_supplied':'IMF October 2026 WEO 2026 nominal GDP estimates, excluding aggregates; Taiwan separately reported','verification':'unverified_access_gap','gdp_value':None,'verified_rank':None},'collection_owner_url':'https://chatgpt.com/c/6afbc931-0378-83ec-8434-cd7e8db42db2','planner_url':'https://github.com/castlemilk/startup-atlas/pull/177','space_url':'https://chatgpt.com/space/page_5167bcbbbb0c81919e1d565fd4d82e4a','ownership_acknowledgement':'pending; coordination notice and country packet only','production_state':'not submitted or merged into production data','research_delivery_receipt':'Exact branch head and PR are recorded in the PR and canonical Space; this content manifest intentionally does not embed its own circular commit hash.','counts':counts,'input_byte_sha256':{path:file_hash(ROOT/path) for path in PRODUCTION_INPUTS},'resume_snapshot_fingerprint':fingerprint,'boundaries':{'source_allowlists_changed':False,'schema_or_api_changed':False,'runtime_crawler_activated':False,'robots_requests':0,'outreach_messages':0,'new_spending':0,'mcp_deployed':False,'production_records_written':0},'integration_holds':['Refresh deduplication against latest main and all concurrent country packets before owner integration.','Canonical person/investor/fund identities remain unresolved; event relationships are staged without target graph IDs.','Existing graph builder substitutes founded_year=0 when missing; Qblox must remain unknown through any production importer/renderer. Do not patch runtime in this research PR.','mergeStartup omission preserves old scalar/array fields; owner must explicitly reconcile previous numeric values if an identity appears in newer main.','Mixed, debt, grant and unspecified instruments retain typed amounts in sidecar and amount_text in legacy projection.','Production merge/release remains with existing owners; no seed approval follows from research discovery.']}
    write('manifest.json', manifest)
    print(json.dumps(counts,indent=2))
    return counts

if __name__ == '__main__': build()
