#!/usr/bin/env python3
"""Checkpoint field coverage from a bounded bundle of saved company evidence."""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
import json
from pathlib import Path
import re
import sqlite3

try:
    from .collection_coverage import ConflictError, Ledger, MAX_EVENTS
    from .company_metadata_evidence import (
        INTERPRETED_FIELDS, canonical_startup, founder_subject, reviewed_alias, site_url, source_url,
        staged_company_inventory, startup_index, validate_publication_claim, validate_search_log,
    )
    from .company_metadata_socials import COMPANY_SOCIALS, company_social_review
    from .crawl import (
        company_headcount_mentions, evidence_url, newsroom_observation,
        professional_bio_observations, require_scoped_launcher, structured_types,
    )
    from .plan_company_profiles import CrawlError, build_plan, digest, read_input, website_host
    from .replay_company_profiles import compile_replay, utc
    from .stage_early_investments import fields, load_json, matching, stage, text
except ImportError:
    from collection_coverage import ConflictError, Ledger, MAX_EVENTS
    from company_metadata_evidence import (
        INTERPRETED_FIELDS, canonical_startup, founder_subject, reviewed_alias, site_url, source_url,
        staged_company_inventory, startup_index, validate_publication_claim, validate_search_log,
    )
    from company_metadata_socials import COMPANY_SOCIALS, company_social_review
    from crawl import (
        company_headcount_mentions, evidence_url, newsroom_observation,
        professional_bio_observations, require_scoped_launcher, structured_types,
    )
    from plan_company_profiles import CrawlError, build_plan, digest, read_input, website_host
    from replay_company_profiles import compile_replay, utc
    from stage_early_investments import fields, load_json, matching, stage, text


DIMENSIONS = (
    'identity', 'aliases', 'description', 'sectors', 'geography', 'founding',
    'news', 'milestones', 'headcount', 'founders', 'founder_roles', 'founder_bios',
    'founder_socials', 'portrait_candidates', 'portrait_rights', 'investors',
    'rounds', 'round_participants', 'early_financing',
)
DISPOSITIONS = (
    'unsearched', 'candidate', 'reviewed', 'published', 'searched_unknown',
    'conflict', 'blocked', 'not_applicable',
)
MAX_COMPANIES = (MAX_EVENTS - len(DIMENSIONS)) // (3 * len(DIMENSIONS))
MAX_ARTIFACTS = 100
MAX_ARTIFACT_BYTES = 16 * 1024 * 1024
MAX_SOURCE_BUNDLES = 8
REQUIRED_EVIDENCE = {
    'published': 'published_readback', 'reviewed': 'review', 'conflict': 'review',
    'searched_unknown': 'search_log', 'blocked': 'blocked_receipt', 'not_applicable': 'review',
}
EVIDENCE_KINDS = {
    *REQUIRED_EVIDENCE.values(), 'company_profile_packet', 'early_investment_manifest',
    'identity_alias', 'publication_claim', 'company_social_review',
}
STAGED_EVIDENCE_KINDS = {'review', 'search_log', 'blocked_receipt'}
PUBLIC_PATHS = {
    'identity': ('startup', 'id'), 'description': ('startup', 'summary'),
    'founding': ('startup', 'founded_year'),
    'news': ('articles', None), 'milestones': ('articles', None),
    'headcount': ('startup', 'profile_facts', None),
    'founders': ('relationships', None), 'founder_roles': ('startup', 'profile_facts', None),
    'founder_bios': ('related_entities', None, 'website'),
    'founder_socials': ('related_entities', None, 'socials'),
    'rounds': ('funding_rounds', None),
    'round_participants': ('funding_rounds', None, 'note'),
}


def source_ref(role, sha256):
    return {'ref': f'{role}:sha256:{sha256}', 'sha256': sha256}


def saved_artifact(root, entry):
    relative = Path(text(entry['path'], 'saved evidence path', 512))
    path = (root / relative).resolve()
    if (relative.is_absolute() or '..' in relative.parts or path.suffix != '.json'
            or not path.is_relative_to(root) or not path.is_file()):
        raise ValueError('Evidence must be a saved JSON file inside the batch directory')
    raw = read_input(path)
    if digest(raw) != entry['sha256']:
        raise ValueError(f"Evidence digest changed: {entry['id']}")
    return path, raw


def validate_readback(value, name, revision, startup_id, canonical_site, alias):
    if (not isinstance(value, dict) or value.get('revision') != revision
            or value.get('mainRevision') != revision or value.get('indexStatus') != 'current'):
        raise ValueError('Published evidence needs an exact, current hosted readback')
    startup = value.get('startup')
    if not isinstance(startup, dict) or startup.get('kind') != 'startup':
        raise ValueError('Published evidence must identify the exact company')
    for field in ('relationships', 'related_entities', 'funding_rounds', 'articles'):
        rows = value.get(field)
        if not isinstance(rows, list) or any(not isinstance(row, dict) for row in rows):
            raise ValueError(f'Expected published readback rows for {field}')
    identity = (startup.get('name'), site_url(startup.get('website')))
    if startup.get('id') != startup_id or identity not in ((name, canonical_site), alias):
        raise ValueError('Published startup must match the exact canonical ID and reviewed name and website')
    return identity == alias


def public_value(readback, dimension, path):
    expected = PUBLIC_PATHS.get(dimension)
    if not expected or not isinstance(path, list) or len(path) != len(expected):
        raise ValueError(f'No supported publication path for {dimension}')
    value = readback
    for key, part in zip(path, expected):
        if (part is None and type(key) is int and isinstance(value, list)
                and 0 <= key < len(value)):
            value = value[key]
        elif isinstance(part, str) and key == part and isinstance(value, dict) and key in value:
            value = value[key]
        else:
            raise ValueError(f'Missing or mismatched published value for {dimension}')
    if value in (None, False, '', [], {}):
        raise ValueError(f'Empty published value for {dimension}')
    startup_id = readback['startup']['id']
    if dimension == 'founders' and (value.get('kind') != 'founded' or value.get('to') != startup_id):
        raise ValueError('Published founder relationship must point to this startup')
    if dimension in ('founder_bios', 'founder_socials'):
        person = readback['related_entities'][path[1]]
        founder_subject(readback, person.get('id'))
    if dimension == 'founder_socials' and not (
        isinstance(value, list) and any(isinstance(item, dict) and site_url(item.get('url'))
                                        and site_url(item.get('source')) for item in value)
    ):
        raise ValueError('Published founder socials need at least one sourced social record')
    if dimension in ('rounds', 'round_participants'):
        if readback['funding_rounds'][path[1]].get('startup_id') != startup_id:
            raise ValueError('Published round must belong to this startup')
    if dimension in ('news', 'milestones') and value.get('startup_id') != startup_id:
        raise ValueError('Published article must belong to this startup')
    if dimension == 'milestones' and value.get('kind') != 'technical milestone':
        raise ValueError('Published milestone must have the technical milestone kind')
    return value


def load_identity_index(batch, plan, overlay, root):
    if 'identity_snapshot' not in batch:
        return {}, {}, None
    snapshot = fields(batch['identity_snapshot'], ('path', 'sha256', 'snapshot_kind'))
    if snapshot['snapshot_kind'] not in ('built', 'published'):
        raise ValueError('Expected a built or published graph identity snapshot')
    _, graph_raw = saved_artifact(root, {'id': 'identity snapshot', **snapshot})
    overlay_raw = read_input(overlay)
    if digest(overlay_raw) != plan['overlay_sha256']:
        raise ValueError('Overlay changed while binding canonical startup identities')
    companies = {row['name']: row for row in load_json(overlay_raw)['startups']}
    official_sites = {name: row.get('website') for name, row in companies.items()}
    startups = startup_index(load_json(graph_raw), plan['revision'])
    return companies, official_sites, startups


def bind_readbacks(readbacks, aliases, artifacts, batch, official_sites, startups):
    if readbacks and startups is None:
        raise ValueError('Published readbacks require a revision-pinned identity snapshot')
    by_company, canonical_sites, alias_proofs = {}, {}, {}
    alternate_names, alternate_sites = set(), set()
    for key, readback in readbacks.items():
        name = artifacts[key]['name']
        startup_id, canonical_site = canonical_startup(name, official_sites[name], startups)
        if name in by_company:
            raise ValueError('Published company is repeated across saved readbacks')
        alias = None
        if name in aliases:
            _, evidence = aliases[name]
            alias = reviewed_alias(evidence, name, batch['revision'], batch['as_of'], startup_id, canonical_site, startups)
            if alias[0].casefold() in alternate_names or alias[1] in alternate_sites:
                raise ValueError('Alternate startup identity is ambiguous across reviewed companies')
            alternate_names.add(alias[0].casefold())
            alternate_sites.add(alias[1])
        if validate_readback(readback, name, batch['revision'], startup_id, canonical_site, alias):
            alias_proofs[name] = aliases[name][0]
        by_company[name] = readback
        canonical_sites[name] = canonical_site
    return by_company, canonical_sites, alias_proofs


def matches_document_ref(value, source, document):
    if not isinstance(value, str) or not value or len(value) > 2048 or value != value.strip():
        return False
    url, separator, fragment = value.partition('#')
    if separator and not re.fullmatch(r'[A-Za-z0-9._~-]+', fragment):
        return False
    # An inline node identifier is additional context for the already bound document.
    return evidence_url(url or source, source) == document


def matches_identity_references(subject, source, document):
    if '@id' in subject and not matches_document_ref(subject['@id'], source, document):
        return False
    if 'mainEntityOfPage' not in subject:
        return True
    page = subject['mainEntityOfPage']
    if isinstance(page, dict):
        types = structured_types(page)
        if '@type' in page and (not types or types - {'WebPage', 'ProfilePage'}):
            return False
        refs = [page[key] for key in ('url', '@id') if key in page]
    else:
        refs = [page]
    return bool(refs) and all(matches_document_ref(ref, source, document) for ref in refs)


def saved_role_observations(record, page):
    subjects = page.get('structured_data')
    links = page.get('links', [])
    markup = page.get('article_markup', {})
    metadata = page.get('metadata', {})
    if (not isinstance(subjects, list) or len(subjects) > 10
            or any(not isinstance(subject, dict) for subject in subjects)
            or not isinstance(links, list) or len(links) > 250
            or any(not isinstance(link, dict) or not isinstance(link.get('rel', ''), str) for link in links)
            or not isinstance(markup, dict) or not isinstance(markup.get('date_evidence', []), list)
            or not isinstance(metadata, dict)):
        return []
    source = page['final_url']
    document = evidence_url(source, source)
    issuer_document = evidence_url(record['website'], source)
    if document is None or issuer_document is None:
        return []
    canonicals = [link.get('url') for link in links if 'canonical' in link.get('rel', '').lower().split()]
    if markup.get('canonical_hint') is not None:
        canonicals.append(markup['canonical_hint'])
    if 'og:url' in metadata:
        canonicals.append(metadata['og:url'])
    if any(evidence_url(ref, source) != document for ref in canonicals) or newsroom_observation(record, page):
        return []

    eligible = []
    for subject in subjects:
        issuer = subject.get('worksFor')
        if structured_types(subject) != {'Person'} or not isinstance(issuer, dict):
            continue
        types = structured_types(issuer)
        if '@type' in issuer and (not types or types - {'Organization', 'Corporation'}):
            continue
        if (matches_identity_references(subject, source, document)
                and matches_identity_references(issuer, source, issuer_document)):
            eligible.append(subject)
    # Keep the collector's exact name, bio document and named issuer checks on each Person.
    return list(professional_bio_observations(record, {**page, 'structured_data': eligible}, ()))


def profile_dimensions(packet, replay, company, founders, website):
    if len(replay['observations']) != 1 or replay['observations'][0]['source_record_name'] != company:
        raise ValueError('Saved company-profile packet must be for one approved company')
    captures = [((row['final_url'], row['checked_at']), row) for row in packet['results'][0]['pages']
                if row['status'] == 'ok']
    pages = dict(captures)
    captured = Counter(locator for locator, _ in captures)
    candidates = packet.get('candidates', [])
    if not isinstance(candidates, list) or len(candidates) > 500:
        raise ValueError('Expected bounded saved profile candidates')
    dimensions = set()
    role_conflict = False
    for candidate in candidates:
        if (not isinstance(candidate, dict) or candidate.get('company') != company
                or not isinstance(candidate.get('source_url'), str)
                or not isinstance(candidate.get('checked_at'), str)
                or (candidate['source_url'], candidate['checked_at']) not in pages
                or candidate.get('review_required') is not True):
            raise ValueError('Saved candidate is outside its successful page evidence')
        kind = candidate.get('kind')
        if kind == 'company-profile':
            if 'headcount_mentions' in candidate:
                page = pages[candidate['source_url'], candidate['checked_at']]
                mentions = company_headcount_mentions(company, page)
                if not mentions or candidate['headcount_mentions'] != mentions:
                    raise ValueError('Headcount candidate must match the named company and saved page evidence')
                dimensions.add('headcount')
            if candidate.get('description'):
                dimensions.add('description')
            claims = candidate.get('organization_claims', [])
            if not isinstance(claims, list) or any(not isinstance(claim, dict) for claim in claims):
                raise ValueError('Expected saved organization claims')
            for claim in claims:
                if claim.get('foundingDate'):
                    dimensions.add('founding')
                if claim.get('address') or claim.get('areaServed'):
                    dimensions.add('geography')
        elif kind == 'newsroom-article' and candidate.get('title'):
            dimensions.add('news')
        elif kind == 'professional-bio' and any(
            candidate.get('name') == name and candidate.get('candidate_url') == candidate['source_url'] == url
            for name, url in founders
        ):
            role = candidate.get('role')
            locator = candidate['source_url'], candidate['checked_at']
            if role and website and captured[locator] == 1:
                record = {'name': company, 'website': website, 'founders': [{'name': candidate['name']}]}
                observations = saved_role_observations(record, pages[locator])
                if any(row['role'] == role and row['candidate_url'] == candidate['candidate_url']
                       and row['affiliation'] == candidate.get('affiliation') for row in observations):
                    titles = {row['role'] for row in observations if row['role']}
                    if len(titles) == 1:
                        dimensions.add('founder_roles')
                    else:
                        role_conflict = True
            dimensions.update(field for field, key in (
                ('founder_bios', 'bio'), ('founder_socials', 'social_candidates'),
                ('portrait_candidates', 'headshot_candidate'),
            ) if candidate.get(key))
    if role_conflict:
        dimensions.discard('founder_roles')
    return dimensions, role_conflict


def load_bundle(batch_path, plan, overlay, approved):
    raw = read_input(batch_path)
    batch = fields(load_json(raw), ('version', 'revision', 'plan_id', 'as_of', 'reviewer', 'evidence', 'decisions'),
                   ('identity_snapshot', 'candidate_inventory'))
    revision, at = plan['revision'], batch['as_of']
    if (type(batch['version']) is not int or batch['version'] != 1
            or batch['revision'] != revision or batch['plan_id'] != plan['plan_id']
            or utc(at).strftime('%Y-%m-%dT%H:%M:%SZ') != at):
        raise ValueError('Batch must match the exact inventory plan, revision and UTC review timestamp')
    reviewer = text(batch['reviewer'], 'reviewer')
    root = batch_path.resolve().parent
    companies, official_sites, startups = load_identity_index(batch, plan, overlay, root)
    staged = {}
    if 'candidate_inventory' in batch:
        if startups is None:
            raise ValueError('Staged companies require a revision-pinned identity snapshot for deduplication')
        ref = fields(batch['candidate_inventory'], ('path', 'sha256'))
        _, archived = saved_artifact(root, {'id': 'candidate inventory', **ref})
        staged = staged_company_inventory(load_json(archived), revision, at, official_sites, startups)
    names = {row['source_record_name'] for row in plan['items']}
    names.update(staged)
    artifacts, readbacks, early, profiles, candidates = {}, {}, {}, {}, defaultdict(set)
    aliases, search_logs, publication_claims, social_decisions = {}, {}, {}, {}
    if not isinstance(batch['evidence'], list) or len(batch['evidence']) > MAX_ARTIFACTS:
        raise ValueError(f'Batch supports at most {MAX_ARTIFACTS} saved evidence artifacts')
    total_bytes = 0
    for entry in batch['evidence']:
        fields(entry, ('id', 'name', 'kind', 'path', 'sha256'), ('source_url',))
        key = matching(entry['id'], r'[a-z0-9][a-z0-9-]{0,63}', 'evidence ID')
        kind = text(entry['kind'], 'evidence kind')
        name = text(entry['name'], 'source-record name', 256)
        if key in artifacts or name not in names or kind not in EVIDENCE_KINDS:
            raise ValueError('Evidence ID is repeated or evidence is outside the pinned company inventory')
        if name in staged and kind not in STAGED_EVIDENCE_KINDS:
            raise ValueError('Staged companies accept saved review, search or hold evidence only')
        if kind in ('company_profile_packet', 'early_investment_manifest') and len(early) + len(profiles) >= MAX_SOURCE_BUNDLES:
            raise ValueError('Too many source bundles in this saved batch')
        if 'source_url' in entry:
            source_url(entry['source_url'])
        path, evidence_raw = saved_artifact(root, entry)
        total_bytes += len(evidence_raw)
        if total_bytes > MAX_ARTIFACT_BYTES:
            raise ValueError('Saved evidence exceeds the bundle byte limit')
        saved = load_json(evidence_raw)
        if not isinstance(saved, dict) or not saved:
            raise ValueError('Saved evidence must be a nonempty JSON object')
        artifacts[key] = entry
        if kind == 'published_readback':
            readbacks[key] = saved
        elif kind == 'identity_alias':
            if name in aliases:
                raise ValueError('More than one alternate identity receipt for the same company')
            aliases[name] = (key, saved)
        elif kind == 'search_log':
            search_logs[key] = saved
        elif kind == 'publication_claim':
            publication_claims[key] = saved
        elif kind == 'company_social_review':
            if startups is None or name in social_decisions:
                raise ValueError('Company social review needs one receipt per startup and a pinned identity snapshot')
            startup_id, canonical_site = canonical_startup(name, official_sites[name], startups)
            disposition, detail = company_social_review(saved, companies[name], revision, at, startup_id, canonical_site)
            if entry.get('source_url', detail['source_url']) != detail['source_url']:
                raise ValueError('Company social receipt and evidence entry must cite the same source')
            social_decisions[name] = {
                'name': name, 'dimension': COMPANY_SOCIALS, 'disposition': disposition, 'evidence': [key],
                'note': 'Saved company links only. External account coverage is unknown.',
                'company_social_review': detail,
            }
        elif kind == 'company_profile_packet':
            replay = compile_replay(overlay, approved, path, revision, at)
            if (replay['packet_sha256'] != entry['sha256']
                    or any(replay['inventory'][field] != plan[field] for field in ('overlay_sha256', 'seeds_sha256'))):
                raise ValueError('Replay and metadata review must share the exact saved inputs')
            profiles[key] = (saved, replay)
        elif kind == 'early_investment_manifest':
            result = stage(path)
            if result['catalogue_revision'] != revision or result['manifest_sha256'] != entry['sha256']:
                raise ValueError('Early-investment manifest is from another revision or changed during review')
            has_observations = any(row['issuer_state'] == 'resolved_issuer' for row in result['filings'])
            early[key] = (result['startup_id'], has_observations or bool(result['observations']))

    by_company, canonical_sites, alias_proofs = bind_readbacks(readbacks, aliases, artifacts, batch, official_sites, startups)
    conflicting_roles = defaultdict(set)
    for key, (saved, replay) in profiles.items():
        name = artifacts[key]['name']
        public = by_company.get(name, {})
        founder_ids = {edge.get('from') for edge in public.get('relationships', [])
                       if edge.get('kind') == 'founded' and edge.get('to') == public['startup']['id']}
        founders = [(person['name'], person['website']) for person in public.get('related_entities', [])
                    if person.get('kind') == 'person' and person.get('id') in founder_ids
                    and person.get('name') and website_host(person.get('website'))]
        observed, role_conflict = profile_dimensions(saved, replay, name, founders, official_sites.get(name))
        for dimension in observed:
            candidates[name, dimension].add(key)
        if role_conflict:
            conflicting_roles[name].add(key)
    for key, (startup_id, has_observations) in early.items():
        name = artifacts[key]['name']
        if by_company.get(name, {}).get('startup', {}).get('id') != startup_id:
            raise ValueError('Early financing requires the exact startup ID from current published readback')
        if has_observations:
            candidates[name, 'early_financing'].add(key)

    decisions = {}
    if not isinstance(batch['decisions'], list) or len(batch['decisions']) > len(names) * len(DIMENSIONS):
        raise ValueError('Expected bounded per-field decisions')
    for decision in batch['decisions']:
        fields(decision, ('name', 'dimension', 'disposition', 'evidence', 'note'), ('public_path',))
        name = text(decision['name'], 'source-record name', 256)
        dimension = text(decision['dimension'], 'dimension')
        disposition = text(decision['disposition'], 'disposition')
        key = (name, dimension)
        if (name not in names or dimension not in DIMENSIONS or key in decisions
                or disposition not in DISPOSITIONS[1:]):
            raise ValueError('Unknown or duplicate explicit field decision')
        if name in staged and disposition == 'published':
            raise ValueError('A staged company cannot have a published disposition')
        text(decision['note'], 'decision note', 1000)
        ids = decision['evidence']
        if (not isinstance(ids, list) or not 1 <= len(ids) <= MAX_ARTIFACTS
                or not all(isinstance(item, str) and item in artifacts and artifacts[item]['name'] == name for item in ids)
                or len(set(ids)) != len(ids)):
            raise ValueError('Decision evidence must be unique, saved and bound to the same company')
        kinds = {artifacts[item]['kind'] for item in ids}
        if disposition in REQUIRED_EVIDENCE and REQUIRED_EVIDENCE[disposition] not in kinds:
            raise ValueError(f'{disposition} requires {REQUIRED_EVIDENCE[disposition]} evidence')
        if disposition == 'published':
            if name in alias_proofs and alias_proofs[name] not in ids:
                raise ValueError('Published decision must cite the alternate identity receipt it uses')
            readback = next(readbacks[item] for item in ids if item in readbacks)
            path = decision.get('public_path')
            selected = public_value(readback, dimension, path)
            if dimension in INTERPRETED_FIELDS:
                claims = [publication_claims[item] for item in ids if item in publication_claims]
                if len(claims) != 1:
                    raise ValueError(f'Published {dimension} requires one typed publication claim for the field')
                validate_publication_claim(
                    claims[0], name, dimension, path, selected, readback, canonical_sites[name], revision, at
                )
        elif 'public_path' in decision:
            raise ValueError('Only published decisions can reference a public readback path')
        if disposition == 'searched_unknown':
            for item in ids:
                if item in search_logs:
                    validate_search_log(search_logs[item], name, dimension, revision, at)
        decisions[key] = decision
    for name, ids in conflicting_roles.items():
        decisions.setdefault((name, 'founder_roles'), {'name': name, 'dimension': 'founder_roles',
            'disposition': 'conflict', 'evidence': sorted(ids),
            'note': 'The same saved founder page reports distinct titles. Review the original observations.'})
    for (name, dimension), ids in candidates.items():
        decisions.setdefault((name, dimension), {'name': name, 'dimension': dimension,
            'disposition': 'candidate', 'evidence': sorted(ids),
            'note': 'Saved source observation awaits claim review.'})
    decisions.update(((name, COMPANY_SOCIALS), decision) for name, decision in social_decisions.items())
    return at, reviewer, digest(raw), artifacts, decisions, candidates, batch, staged


def review_dimensions(decisions):
    # A pre-existing saved bundle keeps its exact ledger scopes and coverage denominator.
    return (*DIMENSIONS, COMPANY_SOCIALS) if any(field == COMPANY_SOCIALS for _, field in decisions) else DIMENSIONS


def make_config(plan, at, batch_sha, decisions, staged, staged_ref):
    population = {'status': 'exact', 'eligible_ids': [row['source_record_name'] for row in plan['items']],
                  'as_of': at, 'evidence': source_ref('company-profile-plan', plan['plan_id']),
                  'reason': 'Complete supplied overlay inventory only; external source coverage is unknown'}
    parser_version = 'company-metadata-review-v2'
    eligibility = 'Exact source-record name in the pinned overlay inventory'
    if staged:
        binding = digest((plan['plan_id'] + ':' + staged_ref['sha256']).encode())
        population['eligible_ids'].extend(staged)
        population['evidence'] = source_ref('overlay-and-staged-inventory', binding)
        population['reason'] = 'Exact overlay and saved staged company inventory; external source coverage is unknown'
        parser_version = 'company-metadata-review-v3'
        eligibility = 'Exact source-record name in the pinned overlay or saved staged inventory'
    return {'version': 1, 'run_id': f'company-metadata:{batch_sha}', 'catalogue_revision': plan['revision'],
            'snapshot_kind': 'synthetic', 'created_at': at, 'attempt_budget': len(decisions),
            'scopes': [{'id': dimension, 'source_id': 'saved-company-metadata', 'host': 'saved-inputs.invalid',
                        'entity_kind': 'company_source_record', 'dimension': dimension,
                        'temporal_scope': 'saved-batch-review', 'source_revision': batch_sha,
                        'parser_version': 'company-social-review-v1' if dimension == COMPANY_SOCIALS else parser_version,
                        'eligibility_rule': eligibility,
                        'population': population, 'freshness_seconds': None} for dimension in review_dimensions(decisions)]}


def decision_proof(batch_sha, decision):
    detail = json.dumps(decision, sort_keys=True, ensure_ascii=False).encode()
    return source_ref('saved-metadata-decision', digest(batch_sha.encode() + detail))


def decision_outcome(disposition):
    return {
        'searched_unknown': ('searched_unknown', 'no_supported_value', 'none'),
        'blocked': ('unavailable', 'access_blocked', 'manual'),
    }.get(disposition, ('retrieved', None, 'none'))


def commit_company_batch(ledger, snapshot, next_names, grouped, at, batch_sha):
    events, touched = [], set()
    for name in next_names:
        for dimension, decision in grouped[name]:
            touched.add(dimension)
            proof = decision_proof(batch_sha, decision)
            attempt_id = proof['sha256']
            outcome, reason, retry = decision_outcome(decision['disposition'])
            base = {'scope_id': dimension, 'entity_id': name, 'at': at}
            events.extend((
                {**base, 'type': 'discover', 'evidence': proof},
                {**base, 'type': 'start', 'attempt_id': attempt_id},
                {**base, 'type': 'finish', 'attempt_id': attempt_id, 'evidence': proof,
                 'outcome': outcome, 'reason': reason, 'retry': {'mode': retry, 'after': None}},
            ))
    events.extend({'scope_id': field, 'at': at, 'type': 'checkpoint', 'status': 'partial',
                   'cursor': None, 'truncated': False, 'evidence': source_ref('saved-metadata-bundle', batch_sha),
                   'reason': 'Saved field decisions only; external source enumeration is unknown'}
                  for field in sorted(touched))
    sequence = snapshot['sequence']
    ledger.apply(f'metadata-review:{batch_sha}:{sequence}', sequence, events, at)
    return ledger.snapshot()


def processed_cells(snapshot):
    return {(name, field) for field, scope in snapshot['state']['scopes'].items()
            for name in scope['items']}


def load_review_plan(overlay, approved, revision):
    require_scoped_launcher(approved)
    plan = build_plan(overlay, approved, revision, limit=100)
    if not plan['inventory_exhausted']:
        raise ValueError('Metadata review requires the complete overlay of at most 100 companies')
    return plan


def coverage_counts(members, field_status, dimensions=DIMENSIONS):
    result = {}
    for dimension in dimensions:
        counts = Counter(field_status(name, dimension) for name in members)
        result[dimension] = {status: counts[status] for status in DISPOSITIONS}
    return {'companies': len(members), 'possible_field_cells': len(members) * len(dimensions), 'by_field': result}


def review(overlay, approved, revision, batch_path, ledger_path, limit=1):
    if type(limit) is not int or not 1 <= limit <= MAX_COMPANIES:
        raise ValueError(f'Limit must be 1 to {MAX_COMPANIES} companies per checkpoint')
    plan = load_review_plan(overlay, approved, revision)
    at, reviewer, batch_sha, artifacts, decisions, candidates, batch, staged = load_bundle(batch_path, plan, overlay, approved)
    dimensions = review_dimensions(decisions)
    config = make_config(plan, at, batch_sha, decisions, staged, batch.get('candidate_inventory'))
    names = [row['source_record_name'] for row in plan['items']]
    ready = {row['source_record_name'] for row in plan['items'] if row['seed_state'] == 'approved_seed_ready'}
    grouped = defaultdict(list)
    for (name, dimension), decision in sorted(decisions.items()):
        grouped[name].append((dimension, decision))
    if ledger_path.exists():
        ledger = Ledger.open(ledger_path, config)
    else:
        try:
            ledger = Ledger.create(ledger_path, config)
        except ConflictError:
            # The other writer may have initialized the same pinned ledger.
            ledger = Ledger.open(ledger_path, config)
    with ledger:
        snapshot = ledger.snapshot()
        done = processed_cells(snapshot)
        if not done <= decisions.keys():
            raise ValueError('Checkpoint contains fields outside this batch')
        role_items = snapshot['state']['scopes']['founder_roles']['items']
        for name, item in role_items.items():
            if item['discovery_evidence'] != [decision_proof(batch_sha, decisions[name, 'founder_roles'])]:
                raise ValueError('Checkpoint founder role decision changed; replay with a fresh ledger')
        pending = sorted({name for name, _ in decisions.keys() - done},
                         key=lambda name: (name not in ready, name in staged, name))
        selected, touched, field_count = [], set(), 0
        for name in pending[:limit]:
            fields_for_company = grouped[name]
            next_fields = touched | {field for field, _ in fields_for_company}
            next_count = field_count + len(fields_for_company)
            if 3 * next_count + len(next_fields) > MAX_EVENTS:
                break
            selected.append(name)
            touched, field_count = next_fields, next_count
        if selected:
            snapshot = commit_company_batch(ledger, snapshot, selected, grouped, at, batch_sha)
            done = processed_cells(snapshot)

    def field_status(name, dimension):
        return decisions[name, dimension]['disposition'] if (name, dimension) in done else 'unsearched'

    report = {'version': 1, 'offline_only': True, 'revision': revision, 'review_as_of': at, 'reviewer': reviewer,
            'plan_id': plan['plan_id'], 'input_hashes': {key: plan[key] for key in ('overlay_sha256', 'seeds_sha256')},
            'batch_sha256': batch_sha, 'evidence': [artifacts[key] for key in sorted(artifacts)],
            'identity_snapshot': batch.get('identity_snapshot'),
            'coverage': {'catalogue': coverage_counts(names, field_status, dimensions),
                         'approved_seed_ready': coverage_counts(ready, field_status, dimensions),
                         'seed_states': plan['population']['seed_states'], 'external_source_population': 'unknown'},
            'queue': [{'name': row['source_record_name'], 'seed_state': row['seed_state'],
                       'fields': {field: field_status(row['source_record_name'], field) for field in dimensions}}
                      for row in plan['items']],
            'checkpoint': {'sequence': snapshot['sequence'], 'applied_companies': selected,
                           'committed_field_cells': len(done), 'saved_batch_field_cells': len(decisions),
                           'remaining_companies': len(pending) - len(selected),
                           'next_company': pending[len(selected)] if len(pending) > len(selected) else None},
            'decisions': [{**decisions[key], 'candidate_inputs': sorted(candidates.get(key, ()))}
                          for key in sorted(done)]}
    if staged:
        report['candidate_inventory'] = batch['candidate_inventory']
        report['coverage']['staged_candidates'] = coverage_counts(staged, field_status, dimensions)
        report['queue'].extend({
            'name': name, 'candidate_id': staged[name]['id'], 'seed_state': 'staged_unpublished',
            'fields': {field: field_status(name, field) for field in dimensions},
        } for name in sorted(staged))
    return report


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--overlay', type=Path, required=True)
    parser.add_argument('--approved', type=Path, required=True)
    parser.add_argument('--revision', required=True)
    parser.add_argument('--batch', type=Path, required=True)
    parser.add_argument('--ledger', type=Path, required=True)
    parser.add_argument('--limit', type=int, default=1)
    args = parser.parse_args(argv)
    try:
        result = review(args.overlay, args.approved, args.revision, args.batch, args.ledger, args.limit)
    except (OSError, ValueError, CrawlError, sqlite3.Error) as exc:
        parser.exit(1, f'Metadata review failed: {exc}\n')
    print(json.dumps(result, indent=2, ensure_ascii=False))


if __name__ == '__main__':
    main()
