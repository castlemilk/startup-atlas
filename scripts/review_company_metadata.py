#!/usr/bin/env python3
"""Checkpoint field coverage from a bounded bundle of saved company evidence."""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
import json
from pathlib import Path
import sqlite3

try:
    from .collection_coverage import ConflictError, Ledger, MAX_EVENTS
    from .crawl import require_scoped_launcher
    from .plan_company_profiles import CrawlError, build_plan, digest, read_input, website_host
    from .replay_company_profiles import compile_replay, utc
    from .stage_early_investments import fields, load_json, matching, stage, text
except ImportError:
    from collection_coverage import ConflictError, Ledger, MAX_EVENTS
    from crawl import require_scoped_launcher
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
EVIDENCE_KINDS = {*REQUIRED_EVIDENCE.values(), 'company_profile_packet', 'early_investment_manifest'}
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
INTERPRETED_PUBLIC_FIELDS = {'headcount', 'founder_roles', 'round_participants'}


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


def validate_readback(value, company, revision):
    if (not isinstance(value, dict) or value.get('revision') != revision
            or value.get('mainRevision') != revision or value.get('indexStatus') != 'current'):
        raise ValueError('Published evidence needs an exact, current hosted readback')
    startup = value.get('startup')
    if (not isinstance(startup, dict) or startup.get('name') != company
            or startup.get('kind') != 'startup'):
        raise ValueError('Published evidence must identify the exact company')
    for field in ('relationships', 'related_entities', 'funding_rounds', 'articles'):
        rows = value.get(field)
        if not isinstance(rows, list) or any(not isinstance(row, dict) for row in rows):
            raise ValueError(f'Expected published readback rows for {field}')
    return matching(startup.get('id'), r'startup:[a-z0-9]+(?:-[a-z0-9]+)*', 'published startup ID')


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
        if person.get('kind') != 'person' or not any(
            row.get('kind') == 'founded' and row.get('from') == person.get('id') and row.get('to') == startup_id
            for row in readback.get('relationships', [])
        ):
            raise ValueError('Published person must have a founded relationship to this startup')
    if dimension in ('rounds', 'round_participants'):
        if readback['funding_rounds'][path[1]].get('startup_id') != startup_id:
            raise ValueError('Published round must belong to this startup')
    if dimension in ('news', 'milestones') and value.get('startup_id') != startup_id:
        raise ValueError('Published article must belong to this startup')
    if dimension == 'milestones' and value.get('kind') != 'technical milestone':
        raise ValueError('Published milestone must have the technical milestone kind')


def profile_dimensions(packet, replay, company, founders):
    if len(replay['observations']) != 1 or replay['observations'][0]['source_record_name'] != company:
        raise ValueError('Saved company-profile packet must be for one approved company')
    pages = {(row['final_url'], row['checked_at']) for row in packet['results'][0]['pages']
             if row['status'] == 'ok'}
    candidates = packet.get('candidates', [])
    if not isinstance(candidates, list) or len(candidates) > 500:
        raise ValueError('Expected bounded saved profile candidates')
    dimensions = set()
    for candidate in candidates:
        if (not isinstance(candidate, dict) or candidate.get('company') != company
                or not isinstance(candidate.get('source_url'), str)
                or not isinstance(candidate.get('checked_at'), str)
                or (candidate['source_url'], candidate['checked_at']) not in pages
                or candidate.get('review_required') is not True):
            raise ValueError('Saved candidate is outside its successful page evidence')
        kind = candidate.get('kind')
        if kind == 'company-profile':
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
            dimensions.update(field for field, key in (
                ('founder_roles', 'role'), ('founder_bios', 'bio'), ('founder_socials', 'social_candidates'),
                ('portrait_candidates', 'headshot_candidate'),
            ) if candidate.get(key))
    return dimensions


def load_bundle(batch_path, plan, overlay, approved):
    raw = read_input(batch_path)
    batch = fields(load_json(raw), ('version', 'revision', 'plan_id', 'as_of', 'reviewer', 'evidence', 'decisions'))
    revision, at = plan['revision'], batch['as_of']
    if (type(batch['version']) is not int or batch['version'] != 1
            or batch['revision'] != revision or batch['plan_id'] != plan['plan_id']
            or utc(at).strftime('%Y-%m-%dT%H:%M:%SZ') != at):
        raise ValueError('Batch must match the exact inventory plan, revision and UTC review timestamp')
    reviewer = text(batch['reviewer'], 'reviewer')
    names = {row['source_record_name'] for row in plan['items']}
    artifacts, readbacks, early, profiles, candidates = {}, {}, {}, {}, defaultdict(set)
    if not isinstance(batch['evidence'], list) or len(batch['evidence']) > MAX_ARTIFACTS:
        raise ValueError(f'Batch supports at most {MAX_ARTIFACTS} saved evidence artifacts')
    root = batch_path.resolve().parent
    total_bytes = 0
    for entry in batch['evidence']:
        fields(entry, ('id', 'name', 'kind', 'path', 'sha256'), ('source_url',))
        key = matching(entry['id'], r'[a-z0-9][a-z0-9-]{0,63}', 'evidence ID')
        kind = text(entry['kind'], 'evidence kind')
        name = text(entry['name'], 'source-record name', 256)
        if key in artifacts or name not in names or kind not in EVIDENCE_KINDS:
            raise ValueError('Evidence ID is repeated or evidence is outside the pinned company inventory')
        if kind in ('company_profile_packet', 'early_investment_manifest') and len(early) + len(profiles) >= MAX_SOURCE_BUNDLES:
            raise ValueError('Too many source bundles in this saved batch')
        if 'source_url' in entry and not website_host(text(entry['source_url'], 'source URL', 2048)):
            raise ValueError('Source reference must be a permitted HTTPS URL')
        path, evidence_raw = saved_artifact(root, entry)
        total_bytes += len(evidence_raw)
        if total_bytes > MAX_ARTIFACT_BYTES:
            raise ValueError('Saved evidence exceeds the bundle byte limit')
        saved = load_json(evidence_raw)
        if not isinstance(saved, dict) or not saved:
            raise ValueError('Saved evidence must be a nonempty JSON object')
        artifacts[key] = entry
        if kind == 'published_readback':
            startup_id = validate_readback(saved, name, revision)
            if any(readback['startup']['id'] == startup_id for readback in readbacks.values()):
                raise ValueError('Published identity is repeated across saved readbacks')
            readbacks[key] = saved
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

    by_company = {value['startup']['name']: value for value in readbacks.values()}
    for key, (saved, replay) in profiles.items():
        name = artifacts[key]['name']
        public = by_company.get(name, {})
        founder_ids = {edge.get('from') for edge in public.get('relationships', [])
                       if edge.get('kind') == 'founded' and edge.get('to') == public['startup']['id']}
        founders = [(person['name'], person['website']) for person in public.get('related_entities', [])
                    if person.get('kind') == 'person' and person.get('id') in founder_ids
                    and person.get('name') and website_host(person.get('website'))]
        for dimension in profile_dimensions(saved, replay, name, founders):
            candidates[name, dimension].add(key)
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
            if dimension in INTERPRETED_PUBLIC_FIELDS and 'review' not in kinds:
                raise ValueError(f'Published {dimension} requires claim review of its generic public field')
            readback = next(readbacks[item] for item in ids if item in readbacks)
            public_value(readback, dimension, decision.get('public_path'))
        elif 'public_path' in decision:
            raise ValueError('Only published decisions can reference a public readback path')
        decisions[key] = decision
    for (name, dimension), ids in candidates.items():
        decisions.setdefault((name, dimension), {'name': name, 'dimension': dimension,
            'disposition': 'candidate', 'evidence': sorted(ids),
            'note': 'Saved source observation awaits claim review.'})
    return at, reviewer, digest(raw), artifacts, decisions, candidates


def make_config(plan, at, batch_sha, decisions):
    population = {'status': 'exact', 'eligible_ids': [row['source_record_name'] for row in plan['items']],
                  'as_of': at, 'evidence': source_ref('company-profile-plan', plan['plan_id']),
                  'reason': 'Complete supplied overlay inventory only; external source coverage is unknown'}
    return {'version': 1, 'run_id': f'company-metadata:{batch_sha}', 'catalogue_revision': plan['revision'],
            'snapshot_kind': 'synthetic', 'created_at': at, 'attempt_budget': len(decisions),
            'scopes': [{'id': dimension, 'source_id': 'saved-company-metadata', 'host': 'saved-inputs.invalid',
                        'entity_kind': 'company_source_record', 'dimension': dimension,
                        'temporal_scope': 'saved-batch-review', 'source_revision': batch_sha,
                        'parser_version': 'company-metadata-review-v1',
                        'eligibility_rule': 'Exact source-record name in the pinned overlay inventory',
                        'population': population, 'freshness_seconds': None} for dimension in DIMENSIONS]}


def commit_company_batch(ledger, snapshot, next_names, grouped, at, batch_sha):
    events, touched = [], set()
    for name in next_names:
        for dimension, decision in grouped[name]:
            touched.add(dimension)
            detail = json.dumps(decision, sort_keys=True, ensure_ascii=False).encode()
            proof = source_ref('saved-metadata-decision', digest(batch_sha.encode() + detail))
            attempt_id = proof['sha256']
            disposition = decision['disposition']
            outcome, reason, retry = {
                'searched_unknown': ('searched_unknown', 'no_supported_value', 'none'),
                'blocked': ('unavailable', 'access_blocked', 'manual'),
            }.get(disposition, ('retrieved', None, 'none'))
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


def review(overlay, approved, revision, batch_path, ledger_path, limit=1):
    if type(limit) is not int or not 1 <= limit <= MAX_COMPANIES:
        raise ValueError(f'Limit must be 1 to {MAX_COMPANIES} companies per checkpoint')
    require_scoped_launcher(approved)
    plan = build_plan(overlay, approved, revision, limit=100)
    if not plan['inventory_exhausted']:
        raise ValueError('Metadata review requires the complete overlay of at most 100 companies')
    at, reviewer, batch_sha, artifacts, decisions, candidates = load_bundle(batch_path, plan, overlay, approved)
    config = make_config(plan, at, batch_sha, decisions)
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
        pending = sorted({name for name, _ in decisions.keys() - done}, key=lambda name: (name not in ready, name))
        selected = pending[:limit]
        if selected:
            snapshot = commit_company_batch(ledger, snapshot, selected, grouped, at, batch_sha)
            done = processed_cells(snapshot)

    def field_status(name, dimension):
        return decisions[name, dimension]['disposition'] if (name, dimension) in done else 'unsearched'

    def cohort(members):
        result = {}
        for dimension in DIMENSIONS:
            counts = Counter(field_status(name, dimension) for name in members)
            result[dimension] = {status: counts[status] for status in DISPOSITIONS}
        return {'companies': len(members), 'possible_field_cells': len(members) * len(DIMENSIONS), 'by_field': result}

    return {'version': 1, 'offline_only': True, 'revision': revision, 'review_as_of': at, 'reviewer': reviewer,
            'plan_id': plan['plan_id'], 'input_hashes': {key: plan[key] for key in ('overlay_sha256', 'seeds_sha256')},
            'batch_sha256': batch_sha, 'evidence': [artifacts[key] for key in sorted(artifacts)],
            'coverage': {'catalogue': cohort(names), 'approved_seed_ready': cohort(ready),
                         'seed_states': plan['population']['seed_states'], 'external_source_population': 'unknown'},
            'queue': [{'name': row['source_record_name'], 'seed_state': row['seed_state'],
                       'fields': {field: field_status(row['source_record_name'], field) for field in DIMENSIONS}}
                      for row in plan['items']],
            'checkpoint': {'sequence': snapshot['sequence'], 'applied_companies': selected,
                           'committed_field_cells': len(done), 'saved_batch_field_cells': len(decisions),
                           'remaining_companies': len(pending) - len(selected),
                           'next_company': pending[len(selected)] if len(pending) > len(selected) else None},
            'decisions': [{**decisions[key], 'candidate_inputs': sorted(candidates.get(key, ()))}
                          for key in sorted(done)]}


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
