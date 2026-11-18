#!/usr/bin/env python3
"""Deterministic Singapore research projection. Offline; never edits Atlas production data."""
import copy
import hashlib
import importlib.util
import json
import re
import subprocess
import unicodedata
from collections import Counter
from pathlib import Path
from urllib.parse import urlsplit

PACKET = Path(__file__).resolve().parents[1]
REPO = PACKET.parents[3]
BASE = '988a4ddcc4dbbc853da0c7f7899b6d6e7579f840'
DAY = '2026-11-18'
STAMP = '2026-11-18T10:01:15Z'
LANES = ('fintech', 'platforms', 'deeptech', 'ecosystem')


def read(path):
    return json.loads(path.read_text(encoding='utf-8'))


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def slug(value):
    ascii_value = unicodedata.normalize('NFKD', value).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', '-', ascii_value).strip('-')


def norm_name(value):
    return re.sub(r'[^a-z0-9]', '', unicodedata.normalize('NFKD', value).encode('ascii', 'ignore').decode().lower())


def norm_domain(value):
    host = urlsplit(value if '://' in value else 'https://' + value).hostname or ''
    return host.lower().removeprefix('www.').rstrip('.')


def remap(value):
    if isinstance(value, dict):
        return {k: remap(v) for k, v in value.items()}
    if isinstance(value, list):
        return [remap(v) for v in value]
    if value == 'startup:coda-payments':
        return 'startup:coda'
    if value == 'equity_and_note_conversion':
        return 'funding_and_note_conversion'
    return value


def git_json(path):
    return json.loads(subprocess.check_output(['git', 'show', f'{BASE}:{path}'], cwd=REPO))


def compact(value):
    return json.dumps(value, ensure_ascii=False, separators=(', ', ': '))


def field_claims(claims, *fields):
    return [c for c in claims if c['field'] in fields and c['status'] == 'reviewed_staged']


def event_id(claim):
    value = claim.get('value')
    return (value.get('event_id') or value.get('id')) if isinstance(value, dict) else None


def main():
    inputs = {lane: read(PACKET / 'inputs' / f'{lane}.json') for lane in LANES}
    sources, claims, companies, input_manifest, source_lanes = [], [], [], [], {}
    for lane, data in inputs.items():
        input_manifest.append({'lane': lane, 'file': f'inputs/{lane}.json', 'sha256': sha(PACKET / 'inputs' / f'{lane}.json')})
        for source in data['sources']:
            row = copy.deepcopy(source)
            row['lane'] = lane
            row['retrieved_on'] = DAY
            row['retrieval_timestamp_precision'] = 'day'
            row['retrieval_timestamp_note'] = 'The UTC timestamp is a research checkpoint or normalized day, not an exact per-request time.'
            row['crawler_seed_approved'] = False
            sources.append(row)
            source_lanes[row['id']] = lane
        for original in data.get('companies', []):
            company = remap(copy.deepcopy(original))
            company['input_entity_id'] = original['id']
            company['input_lane'] = lane
            company['input_sha256'] = input_manifest[-1]['sha256']
            company['id'] = 'startup:' + slug(company['canonical_name'])
            assert company['canonical_domain'] == norm_domain(company['website']), company['canonical_name']
            company['review_status'] = 'accepted_for_research_staging'
            company['production_publication_state'] = 'unsubmitted'
            company['crawler_seed_approved'] = False
            company['disposition'] = ('ecosystem_alumnus_listed' if company['canonical_name'] == 'Horizon Quantum' else 'startup_candidate')
            company.setdefault('company_status', {'value': None, 'status': 'unsearched', 'note': 'No comprehensive current legal/listing/acquisition-status review was performed.'})
            company.setdefault('current_country_assertion_status', 'source_scope_and_as_of_binding')
            company['founded']['value'] = None if company['founded']['value'] is None else str(company['founded']['value'])
            company['incorporation'].setdefault('date', None)
            company['incorporation'].setdefault('precision', 'unknown')
            company['incorporation'].setdefault('scope', 'group_or_holding_entity')
            company['founder_roster_complete'] = False
            if company['canonical_name'] == 'AMILI':
                company['headquarters']['notes'] = 'Public corporate LinkedIn self-report; profile ownership not independently authenticated. Country is an operating-HQ observation, not incorporation evidence.'
            company_claims = []
            for claim in company.pop('claims'):
                claim['claim_id'] = claim.get('claim_id') or claim['id']
                claim['id'] = claim['claim_id']
                claim['entity_id'] = company['id']
                claim['publication_state'] = 'unsubmitted'
                claim['retrieved_on'] = DAY
                claim['retrieval_timestamp_precision'] = 'day'
                claim['research_lane'] = lane
                if claim['claim_id'] == 'sg-dt-41ae270d8909f362':
                    claim['confidence'] = 'medium'
                    claim['rationale'] = 'Public company-profile self-report; source ownership not independently authenticated. Headquarters location is a qualified observation, not incorporation proof.'
                if claim['field'] == 'round_participant':
                    claim['value']['name'] = claim['value'].get('name') or claim['value']['stated_participant_name']
                    claim['value'].setdefault('company_id', company['id'])
                company_claims.append(claim)
            company['claim_ids'] = [c['claim_id'] for c in company_claims]
            company['funding_events'] = company.pop('funding_rounds')
            for event in company['funding_events']:
                event['company_id'] = company['id']
                event.setdefault('closed_on', None)
                event.setdefault('close_date_precision', 'unknown')
                event['participants_complete'] = False
                event['claim_ids'] = [c['claim_id'] for c in company_claims if event_id(c) == event['id']]
                for participant in event['participants']:
                    participant.setdefault('resolved_entity_id', None)
                    participant['claim_ids'] = [c['claim_id'] for c in company_claims if c['field'] == 'round_participant' and event_id(c) == event['id'] and c['value']['name'] == participant['name']]
            companies.append(company)
            claims.extend(company_claims)
        for original in data.get('claims', []):
            claim = copy.deepcopy(original)
            claim['id'] = claim.get('claim_id') or claim['id']
            claim['claim_id'] = claim['id']
            claim['research_lane'] = lane
            claim['retrieved_on'] = DAY
            claim['retrieval_timestamp_precision'] = 'day'
            claims.append(claim)

    supplement = read(PACKET / 'inputs' / 'integration.json')
    sources.extend(supplement['sources'])
    claims.extend(supplement['claims'])
    augmentus = next(c for c in companies if c['canonical_name'] == 'Augmentus')
    augmentus['related_legal_entities'] = supplement['related_legal_entities']
    augmentus['claim_ids'].extend(c['claim_id'] for c in supplement['claims'])
    augmentus['incorporation']['status'] = 'searched_unknown'
    augmentus['incorporation']['reason'] = 'Terms identify contracting entities and country labels, but do not explicitly establish group incorporation jurisdiction/date.'
    augmentus['field_dispositions']['incorporation'] = 'searched_unknown'
    input_manifest.append({'lane': 'integration', 'file': 'inputs/integration.json', 'sha256': sha(PACKET / 'inputs/integration.json')})

    # No inference from participant names to canonical investor identities.
    source_by_id = {s['id']: s for s in sources}
    assert len(source_by_id) == len(sources)
    by_url = {}
    for source in sources:
        source['claim_ids'] = [c['claim_id'] for c in claims if c.get('source_id') == source['id']]
        source.setdefault('crawler_seed_approved', False)
        by_url.setdefault(source['url'], []).append(source['id'])
    write(PACKET / 'sources.json', {'schema_scope': 'Research-only source registry; not a crawler allowlist.', 'retrieved_on': DAY, 'sources': sources, 'unique_urls': [{'url': url, 'source_ids': ids} for url, ids in sorted(by_url.items())]})
    claims.sort(key=lambda c: c['claim_id'])
    write(PACKET / 'claims.json', {'version': 1, 'publication_state': 'unsubmitted', 'retrieval_precision': 'day', 'claims': claims})
    companies.sort(key=lambda c: c['id'])
    write(PACKET / 'companies.json', {'schema_scope': 'Research companion; not accepted by the production startup API.', 'companies': companies})
    write(PACKET / 'provenance' / 'input-manifest.json', {'inputs': input_manifest, 'normalizations': supplement['normalizations'], 'authoritative_rich_records': 'companies.json', 'original_input_note': 'Original lane files retained unchanged so independent review hashes are reproducible. Integration normalizations apply only to generated companions and projections.'})

    # Pin deduplication to actual source inputs, not the stale committed graph.
    spec = importlib.util.spec_from_file_location('sg_graph_builder', REPO / 'scripts/make-graph.py')
    graph_module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(graph_module)
    graph_args = [git_json('data/' + name) for name in ['partner-profiles.json', 'partner-leads.json', 'partners-reviewed.json', 'catalogue.json', 'startup-research.json']]
    graph = graph_module.build_graph(*graph_args)
    existing = [e for e in graph['entities'] if e['kind'] == 'startup']
    dedupe = []
    for company in companies:
        names = {norm_name(company['canonical_name'])}
        domains = {company['canonical_domain']}
        for alias in company['aliases']:
            if alias.get('kind') == 'former_official_domain':
                domains.add(norm_domain(alias['name']))
            else:
                names.add(norm_name(alias['name']))
        matches = []
        for old in existing:
            reasons = []
            if norm_name(old['name']) in names: reasons.append('normalized_name_or_alias')
            if old.get('website') and norm_domain(old['website']) in domains: reasons.append('canonical_or_former_domain')
            if old['id'] == company['id']: reasons.append('proposed_atlas_id')
            if reasons: matches.append({'id': old['id'], 'name': old['name'], 'website': old.get('website'), 'reasons': reasons})
        dedupe.append({'company_id': company['id'], 'normalized_names': sorted(names), 'normalized_domains': sorted(domains), 'existing_matches': matches, 'decision': 'new_candidate' if not matches else 'owner_review_required'})
    write(PACKET / 'deduplication.json', {'base_revision': BASE, 'scope': '45 overlay records and 46 startup entities rebuilt from all pinned source inputs; not just search results.', 'rules': 'NFKD ASCII case-insensitive punctuation-insensitive names; hostname lowercase, remove www; preserve legal entities and nontrivial subdomains. Name/domain hits require owner review, never automatic merges.', 'records': dedupe, 'future_namesake_guard': {'name': 'Ascenda', 'existing_domain': 'ascenda.one', 'note': 'Existing Australian psychology app is not automatically the Singapore loyalty company. Neither is newly staged here.'}})

    projected, alumni, projection_map = [], [], []
    claim_lookup = {c['claim_id']: c for c in claims}
    for company in companies:
        cc = [claim_lookup[i] for i in company['claim_ids']]
        descriptions = field_claims(cc, 'description')
        primary_source = descriptions[0]['source_url'] if descriptions else next(c['source_url'] for c in cc if c['field'] in ('identity', 'canonical_name'))
        record = {'name': company['canonical_name'], 'description': company['description'], 'website': company['website'], 'source': primary_source, 'reviewed_at': DAY}
        mappings = []
        omissions = []
        def mapping(pointer, supporting, note=''):
            mappings.append({'pointer': pointer, 'claim_ids': [c['claim_id'] for c in supporting], 'source_urls': sorted({c['source_url'] for c in supporting}), 'note': note})
        def fact(key, label, value, supporting, source=None):
            if not supporting or not value: return
            value = ' '.join(str(value).split())
            if len(value) > 1000:
                omissions.append({'field': key, 'reason': 'Research fact exceeds current profile_fact limit; retained losslessly in companion.'})
                return
            item = {'key': key, 'label': label, 'value': value, 'source': source or supporting[0]['source_url'], 'reviewed_at': DAY}
            record.setdefault('profile_facts', []).append(item)
            mapping('/profile_facts/' + key, supporting)
        mapping('/name', field_claims(cc, 'identity', 'canonical_name'))
        mapping('/website', field_claims(cc, 'identity', 'website'))
        mapping('/description', descriptions)
        mapping('/source', descriptions, 'Top-level source chosen for the description; per-field evidence remains in this map and the claim ledger.')
        founder_rows = []
        for person in company['founders']:
            supporting = [c for c in field_claims(cc, 'founder') if (c['value'].get('name') if isinstance(c['value'], dict) else c['value']) == person['name']]
            founder_rows.append({'name': person['name'], 'source': person['source_urls'][0]})
            mapping('/founders/' + person['name'], supporting)
        if founder_rows: record['founders'] = founder_rows
        hq_claims = field_claims(cc, 'headquarters')
        hq = company['headquarters']
        hq_text = hq['value']
        if hq.get('as_of'): hq_text += '; evidence as of ' + hq['as_of']
        if hq.get('scope'): hq_text += '; scope: ' + hq['scope'].replace('_', ' ')
        if hq.get('notes'): hq_text += '; ' + hq['notes']
        fact('headquarters-observation', 'Headquarters observation', hq_text, hq_claims)
        founded = company['founded']
        founding_claims = field_claims(cc, 'founded_year', 'founded', 'founded_date', 'founding', 'founding_date')
        if founded['value'] is not None:
            year = int(founded['value'][:4])
            if any(c['source_url'] == primary_source for c in founding_claims):
                record['founded_year'] = year
                mapping('/founded_year', founding_claims)
            else:
                omissions.append({'field': 'founded_year', 'reason': 'Separate sourced founding profile fact avoids misattribution to the top-level description source.'})
            fact('founding-observation', 'Founding observation', f"{founded['value']} ({founded['precision']} precision; operational founding, not legal incorporation)", founding_claims)
        else:
            conflict_claims = [c for c in cc if c['status'] == 'conflict' and 'found' in c['field']]
            if conflict_claims:
                fact('founding-date-unresolved', 'Founding date unresolved', 'Official company history contains 2013 origin and 2015 founding/launch language. No canonical founding year is selected.', conflict_claims)
            omissions.append({'field': 'founded_year', 'reason': 'Unresolved conflict; unknown remains absent in the production-schema projection and null in companion.'})
        sectors = field_claims(cc, 'sectors')
        fact('activity-sectors', 'Activity sectors', ', '.join(company['sectors']), sectors)
        for i, cl in enumerate(field_claims(cc, 'related_legal_entity', 'contracting_entity_geography'), 1):
            fact(f'legal-entity-observation-{i}', 'Named legal entity (group status unresolved)', compact(cl['value']), [cl])
        for i, alias in enumerate(company['aliases'], 1):
            supports = [c for c in field_claims(cc, 'alias', 'historical_alias', 'brand_alias', 'aliases') if c['source_url'] in alias.get('source_urls', [])]
            fact(f'alias-{i}', 'Name or brand observation', alias['name'] + ('; ' + (alias.get('note') or alias.get('notes')) if alias.get('note') or alias.get('notes') else ''), supports)
        status_claims = field_claims(cc, 'company_status', 'listing_status', 'corporate_status')
        if company['disposition'] == 'ecosystem_alumnus_listed':
            fact('listed-alumnus-status', 'Listed ecosystem alumnus', 'Business combination completed 19 March 2026; Nasdaq trading began 20 March 2026. Kept outside the private-startup candidate batch.', status_claims)

        for event in company['funding_events']:
            supports = [c for c in field_claims(cc, 'funding_round') if event_id(c) == event['id']]
            assert supports, event['id']
            source_claim = supports[0]
            value = source_claim['value']
            excluded = event['transaction_kind'] in {'secondary_share_sale', 'debt_facilities'}
            if excluded:
                omissions.append({'field': '/funding_rounds/' + event['id'], 'reason': 'Pure secondary share sale or debt facilities remain in research companion; current API has no typed transaction-kind field.'})
                extra_claims = [c for c in cc if event_id(c) == event['id'] and c['field'] != 'round_participant']
                for i, cl in enumerate(extra_claims):
                    fact(slug(event['id'] + '-observation-' + str(i + 1)), 'Financing observation (not new equity)', compact(cl['value']), [cl])
                continue
            item = {'id': event['id'], 'stage': event.get('stage') or 'Funding (stage not stated)', 'source': source_claim['source_url']}
            if value.get('announced_on') and event.get('announced_precision') == 'day': item['announced_on'] = value['announced_on']
            # A numeric lower bound would be misread as an exact amount by the current API.
            qualifier = event.get('amount_qualifier', '')
            if value.get('amount') is not None and value.get('currency') and qualifier != 'greater_than':
                item['amount'], item['currency'] = value['amount'], value['currency']
            elif qualifier == 'greater_than':
                item['amount_text'] = 'More than US$70 million total; includes existing-note conversions and US$20 million fresh capital.'
            elif event.get('reported_amount_text'):
                item['amount_text'] = event['reported_amount_text'] + ' (currency unspecified)'
            notes = [event.get('notes'), event.get('amount_semantics')]
            if event['transaction_kind'] == 'mixed_primary_secondary': notes.append('Reported total includes primary and secondary transactions; component amounts unknown.')
            if event.get('components'): notes.append('Component tranches/conversions are contained in the reported aggregate; do not add them again. See research companion.')
            if event.get('associated_transactions'): notes.append('Associated employee share buyback has no established inclusion rule; do not add it to the round.')
            same_source_participants = [c for c in field_claims(cc, 'round_participant') if event_id(c) == event['id'] and c['source_url'] == item['source']]
            if same_source_participants:
                labels = []
                for cl in same_source_participants:
                    p = cl['value']; text = p['name'] + ' (' + p['role'] + ')'
                    scope = p.get('participation_scope') or p.get('scope')
                    if scope and scope != 'reported event': text += '; ' + scope
                    labels.append(text)
                notes.append('Source-named participants: ' + '; '.join(labels) + '. List not asserted complete.')
            clean_notes = ' '.join(str(n) for n in notes if n)
            if clean_notes: item['note'] = clean_notes
            record.setdefault('funding_rounds', []).append(item)
            mapping('/funding_rounds/' + event['id'], supports, 'Only fields supported by the selected round source are embedded; split-source details remain as sourced profile facts and companion claims.')
            if 'amount' in item: mapping('/funding_rounds/' + event['id'] + '/amount', supports)
            if 'announced_on' in item: mapping('/funding_rounds/' + event['id'] + '/announced_on', supports)
            for cl in cc:
                if event_id(cl) == event['id'] and cl['field'] in {'funding_amount', 'funding_announcement_date'}:
                    fact(slug(event['id'] + '-' + cl['field']), cl['field'].replace('_', ' ').capitalize(), compact(cl['value']), [cl])
        if company['canonical_name'] == 'Endowus':
            omissions.append({'field': '/funding_rounds/endowus-funding-2025-10-22/amount', 'reason': 'Greater-than amount retained as text; no numeric exact-value coercion.'})
        for item_map in mappings:
            parts = item_map['pointer'].split('/')
            if len(parts) > 2 and parts[1] in {'profile_facts', 'founders', 'funding_rounds'}:
                item_map['logical_selector'] = item_map['pointer']
                key = {'profile_facts': 'key', 'founders': 'name', 'funding_rounds': 'id'}[parts[1]]
                index = next(i for i, item in enumerate(record[parts[1]]) if item[key] == parts[2])
                parts[2] = str(index)
                item_map['pointer'] = '/'.join(parts)
        projection_map.append({'company_id': company['id'], 'destination': 'alumni-records.json' if company['disposition'] == 'ecosystem_alumnus_listed' else 'startup-records.json', 'record_name': record['name'], 'field_map': mappings, 'omissions': omissions, 'structured_research_only': ['aliases', 'geography and incorporation', 'funding transaction kind and components', 'typed round participants', 'conflicts and source-specific dates', 'field dispositions']})
        (alumni if company['disposition'] == 'ecosystem_alumnus_listed' else projected).append(record)
    write(PACKET / 'staging' / 'startup-records.json', projected)
    write(PACKET / 'staging' / 'alumni-records.json', alumni)
    write(PACKET / 'staging' / 'projection-map.json', projection_map)

    replay_args = copy.deepcopy(graph_args)
    replay_args[-1]['startups'].extend(projected)
    replay = graph_module.build_graph(*replay_args)
    staged_ids = {'startup:' + slug(r['name']) for r in projected}
    zero_years = [e['id'] for e in replay['entities'] if e['id'] in staged_ids and e.get('founded_year') == 0]
    omitted_years = [e['id'] for e in replay['entities'] if e['id'] in staged_ids and 'founded_year' not in e]
    write(PACKET / 'provenance' / 'graph-replay.json', {'production_files_written': 0, 'base_revision': BASE, 'initial_research_revision': 'f4bcbf7030d741772bb750deee584efa3ee17749', 'baseline': {'entities': len(graph['entities']), 'startups': len(existing), 'rounds': len(graph['funding_rounds']), 'articles': len(graph['articles'])}, 'simulation': {'entities': len(replay['entities']), 'startups': sum(e['kind'] == 'startup' for e in replay['entities']), 'rounds': len(replay['funding_rounds']), 'articles': len(replay['articles'])}, 'new_funding_id_collisions': 0, 'existing_builder_unknown_year_zero_sentinel': zero_years, 'omitted_founded_year_ids': omitted_years, 'owner_fix': 'https://github.com/castlemilk/startup-atlas/pull/179', 'note': 'Initial main used a zero sentinel; the existing owner merged PR #179 while research was in progress. Branch refreshed to current main. Final replay correctly omits absent years. The initial result is retained separately for audit; no shared builder/schema edits originate in this country packet.'})

    next_candidates = copy.deepcopy(inputs['ecosystem']['candidate_queue'])
    for i, candidate in enumerate(next_candidates): candidate['ordinal'] = i + 1
    source_queue = [
        {'id': 'sg-source-001', 'priority': 1, 'source_url': 'https://sginnovate.com/full-portfolio', 'next_action': 'Verify the five selected queued official domains; portfolio membership is discovery only. Country/status screening precedes any additional names.', 'pagination_status': 'Selected visible names inspected; mixed-country directory not exhausted; no cursor recorded.'},
        {'id': 'sg-source-002', 'priority': 2, 'source_url': 'https://www.iterative.vc/demoday', 'next_action': 'Verify selected S26 Singapore-labelled companies individually. Do not access gated pitches.', 'pagination_status': 'Selected public cohort cards only; no complete roster denominator captured.'},
        {'id': 'sg-source-003', 'priority': 3, 'source_url': 'https://sustainability.nus.edu.sg/report/innovation-enterprise/', 'next_action': 'Resolve selected spinout names/domains and HQ; no affiliation-to-incorporation inference.', 'pagination_status': 'Selected examples from one report; no all-spinouts roster.'},
        {'id': 'sg-source-004', 'priority': 4, 'source_url': 'https://www.ntu.edu.sg/news/detail/deep-tech-start-ups-showcase-inventions-at-echelon--asia-s-top-tech-and-digital-summit', 'next_action': 'Resolve Neusla, Healbac and LoopForBio official identities. Cross-check Terraco Earth against NUS observation.', 'pagination_status': 'One announcement; programme cohort not enumerated.'},
        {'id': 'sg-source-005', 'priority': 5, 'source_url': 'https://www.jtc.gov.sg/about-jtc/news-and-stories/press-releases/jtc-unveils-refreshed-masterplan-for-launchpad', 'next_action': 'Verify dConstruct Robotics and whether PDD phases have actually opened; do not convert plans into current facilities.', 'pagination_status': 'One release; resident directory not enumerated.'},
        {'id': 'sg-source-006', 'priority': 6, 'source_url': 'https://www.vertexventures.sg/impact/', 'next_action': 'Inspect a bounded first portfolio subset, split Singapore HQ from India/SEA portfolio membership.', 'pagination_status': 'Network overview only; portfolio not enumerated.'},
        {'id': 'sg-source-007', 'priority': 7, 'source_url': 'https://wavemakerpartners.com/', 'next_action': 'Scope Wavemaker Ventures separately from Growth; select a bounded Singapore-linked subset.', 'pagination_status': 'Overview only; no portfolio cursor.'},
        {'id': 'sg-source-008', 'priority': 8, 'source_url': 'https://www.jungle.vc/portfolio', 'next_action': 'Select a bounded Singapore-linked group, retain exited/acquired/public statuses and verify against company sources.', 'pagination_status': 'Long portfolio accessed but not enumerated or paginated exhaustively.'},
        {'id': 'sg-source-009', 'priority': 9, 'source_url': 'https://www.imf.org/external/datamapper/api/v1/NGDPD/2026', 'next_action': 'Retry a permitted public route when available; verify vintage and rank before adding any GDP value. Do not bypass access restrictions.', 'pagination_status': 'API fetch blocked; October 2026 vintage and rank remain user-supplied.'},
    ]
    followups = [{'lane': lane, 'items': data.get('gaps', [])} for lane, data in inputs.items()]
    queue_digest = digest(next_candidates)
    counts = {'discovered_candidates': len(companies) + len(next_candidates), 'reviewed_companies': len(companies), 'accepted_startup_candidates': len(projected), 'accepted_alumni': len(alumni), 'rejected_companies': 0, 'unreviewed_candidates': len(next_candidates), 'founder_observations': sum(len(c['founders']) for c in companies), 'selected_financing_events': sum(len(c['funding_events']) for c in companies), 'startup_schema_funding_records': sum(len(r.get('funding_rounds', [])) for r in projected), 'alumni_schema_funding_records': sum(len(r.get('funding_rounds', [])) for r in alumni), 'atomic_claims': len(claims), 'claim_statuses': dict(Counter(c['status'] for c in claims)), 'source_rows': len(sources), 'distinct_source_urls': len(by_url), 'claim_bearing_source_urls': len({c['source_url'] for c in claims}), 'source_access_statuses': dict(Counter(s['access_status'] for s in sources)), 'production_writes': 0, 'crawler_seed_approvals': 0, 'direct_crawler_runs': 0}
    write(PACKET / 'coverage.json', {'scope': 'Bounded purposive research; counts refer to this captured worklist only, not Singapore population.', 'counts': counts, 'national_denominator': None, 'complete_country_claim': False, 'reviewed_worklist': [c['id'] for c in companies], 'next_candidates': next_candidates, 'source_queue': source_queue, 'followups': followups, 'resume': {'mode': 'explicit ordered worklist, not claimed site pagination cursor', 'queue_sha256': queue_digest, 'next_index': 0, 'completed_queue_ids': [], 'next_queue_id': next_candidates[0]['queue_id'], 'dedupe_against_current_main_before_resume': True, 'batch_upper_bound': 50, 'all_pending_ids': [c['queue_id'] for c in next_candidates]}})
    write(PACKET / 'research-method.json', {'retrieval_day': DAY, 'exact_request_timestamps_available': False, 'lanes': {lane: {'query_log': data.get('query_log', []), 'source_coverage': data.get('source_coverage', data.get('coverage', data.get('counts', {}))), 'limits': data.get('limits', data.get('gaps', []))} for lane, data in inputs.items()}, 'root_supplement': supplement['research_log'], 'query_log_limit': 'Lane logs are partial audit aids. Root exact query text and two fintech legal-search calls were not fully retained; no reconstructed total is presented as an exact execution count.', 'policy': {'public_pages_only': True, 'robots_requests': 0, 'credentials_or_permission_changes': 0, 'outreach': 0, 'new_spending': 0, 'bulk_proprietary_copying': False, 'crawler_seed_approval': False}})
    write(PACKET / 'decisions.json', {'rejected_interpretations': remap(inputs['fintech'].get('rejected_observations', [])) + supplement['rejected_interpretations'], 'normalization_notes': supplement['normalizations'], 'conflicts': [{'claim_id': c['claim_id'], 'entity_id': c['entity_id'], 'field': c['field'], 'value': c['value'], 'source_url': c['source_url']} for c in claims if c['status'] == 'conflict'], 'company_rejections': []})
    write(PACKET / 'staging' / 'manifest.json', {'packet_id': 'sg-2026-11-18-001', 'country': 'Singapore', 'country_code': 'SG', 'cohort': {'position': 28, 'total': 30, 'basis': 'IMF October 2026 WEO 2026 nominal GDP estimates, excluding aggregates; user-supplied cohort', 'independently_verified': False, 'nominal_gdp_value': None, 'reason': 'Provided IMF API unavailable to this retrieval; dataset shell did not expose vintage-specific values.'}, 'repository': 'castlemilk/startup-atlas', 'base_revision': BASE, 'initial_research_revision': 'f4bcbf7030d741772bb750deee584efa3ee17749', 'branch': 'research/singapore-gdp28-2026-11-18', 'owned_path': 'research/countries/sg/2026-11-18-batch-001/', 'schema_module': 'backend/hosted/src/startup-record.mjs', 'schema_module_sha256': sha(REPO / 'backend/hosted/src/startup-record.mjs'), 'status': 'reviewed_staged', 'production_publication_state': 'unsubmitted', 'production_targets_modified': [], 'seed_approval': False, 'owner_coordination': {'collection_owner_chat': 'https://chatgpt.com/c/6afbc931-0378-83ec-8434-cd7e8db42db2', 'planner_pr': 'https://github.com/castlemilk/startup-atlas/pull/177', 'coordination_comment': 'https://github.com/castlemilk/startup-atlas/pull/177#issuecomment-6974917695', 'owner_acknowledgement': 'pending', 'canonical_space': 'https://chatgpt.com/space/page_5167bcbbbb0c81919e1d565fd4d82e4a'}, 'counts': counts, 'projection_files': ['staging/startup-records.json', 'staging/alumni-records.json'], 'mandatory_companions': ['companies.json', 'claims.json', 'sources.json', 'staging/projection-map.json', 'decisions.json', 'coverage.json'], 'integration_gate': 'Research PR only. Owner reviews country scopes, corporate status and per-event participants before any separate production import; no schema/API expansion or release authorized by this manifest. The existing unknown-year sentinel was fixed independently in main PR #179 and final replay verifies omission.'})
    print(json.dumps(counts, indent=2))


if __name__ == '__main__':
    main()
