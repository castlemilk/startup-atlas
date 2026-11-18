#!/usr/bin/env python3
"""Compile saved company-profile observations into a synthetic ledger replay.

Offline only: no network, production writes, source approvals or verification.
The emitted starts describe packet-analysis work, never historical HTTP starts.
"""
from __future__ import annotations
import argparse
from datetime import datetime, timezone
import hashlib
import json
import re
from pathlib import Path

try:
    from .plan_company_profiles import build_plan, read_input, website_host, CrawlError
except ImportError:
    from plan_company_profiles import build_plan, read_input, website_host, CrawlError


def utc(value):
    if not isinstance(value, str):
        raise ValueError('Observation timestamp is required')
    try:
        parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
    except ValueError as exc:
        raise ValueError('Invalid observation timestamp') from exc
    if parsed.tzinfo is None:
        raise ValueError('Timestamp must include a timezone')
    return parsed.astimezone(timezone.utc)


def no_duplicate_keys(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError('Duplicate JSON field in saved packet')
        result[key] = value
    return result


def compile_replay(overlay, seeds, packet_path, revision, replay_at):
    replay_time = utc(replay_at)
    if replay_time.strftime('%Y-%m-%dT%H:%M:%SZ') != replay_at:
        raise ValueError('Replay time must be UTC YYYY-MM-DDTHH:MM:SSZ')
    inventory = build_plan(overlay, seeds, revision, limit=100)
    if inventory['next_cursor'] is not None:
        raise ValueError('Replay is bounded to 100 overlay records; do not silently truncate')
    ready = {item['source_record_name']: item['approved_url'] for item in inventory['items']
             if item['seed_state'] == 'approved_seed_ready'}
    if not ready:
        raise ValueError('No approved matching company-profile seeds for replay')
    if any(not re.fullmatch(r'[a-z0-9]+(?:[.-][a-z0-9]+)*', website_host(url)) for url in ready.values()):
        raise ValueError('Approved host cannot be represented by the coverage-ledger contract')
    packet_bytes = read_input(packet_path)
    packet = json.loads(packet_bytes, object_pairs_hook=no_duplicate_keys,
                        parse_constant=lambda value: (_ for _ in ()).throw(ValueError('Nonfinite JSON')))
    if (not isinstance(packet, dict) or packet.get('mode') != 'company-profiles'
            or type(packet.get('version')) is not int or packet['version'] != 1
            or not isinstance(packet.get('results'), list) or len(packet['results']) > 100):
        raise ValueError('Expected bounded version 1 company-profiles packet')
    generated = utc(packet.get('generated_at'))
    if generated > replay_time:
        raise ValueError('Packet was generated after the replay time')
    packet_hash = hashlib.sha256(packet_bytes).hexdigest()
    binding = hashlib.sha256((inventory['plan_id'] + ':' + packet_hash + ':' + replay_at).encode()).hexdigest()
    evidence = {'ref': 'saved-company-profile-packet:sha256:' + packet_hash, 'sha256': packet_hash}
    population_evidence = {'ref': 'company-profile-input-plan:sha256:' + inventory['plan_id'],
                           'sha256': inventory['plan_id']}
    scopes, starts, outcomes, observations = [], [], [], []
    rows = {}
    for row in packet['results']:
        if not isinstance(row, dict) or not isinstance(row.get('name'), str):
            raise ValueError('Malformed company-profile result')
        name = row['name']
        if name not in ready or name in rows or row.get('url') != ready[name]:
            raise ValueError('Unapproved, duplicate or mismatched company-profile source')
        pages = row.get('pages')
        if not isinstance(pages, list) or len(pages) > 21:
            raise ValueError('Expected bounded pages list')
        seen = set(); page_summaries = []
        for index, page in enumerate(pages):
            if not isinstance(page, dict):
                raise ValueError('Malformed page observation')
            url = page.get('url')
            if (website_host(url) != website_host(ready[name]) or url in seen
                    or (index == 0 and url != ready[name])):
                raise ValueError('Page source is duplicated, blocked or outside approved host')
            seen.add(url)
            checked = utc(page.get('checked_at'))
            if checked > generated:
                raise ValueError('Page observation postdates packet generation')
            status = page.get('status')
            if status not in ('ok', 'skipped'):
                raise ValueError('Unknown page status must be reviewed, not assumed successful')
            if status == 'ok':
                if website_host(page.get('final_url')) != website_host(ready[name]):
                    raise ValueError('Successful final URL is outside the approved source')
                if type(page.get('http_status')) is not int or page['http_status'] != 200:
                    raise ValueError('Successful company profile page must retain HTTP 200')
            elif not isinstance(page.get('reason'), str) or not page['reason'].strip():
                raise ValueError('Skipped page requires its original failure reason')
            page_summaries.append({'url': url, 'status': status, 'checked_at': page['checked_at'],
                                   'reason': page.get('reason') if status == 'skipped' else None})
        rows[name] = page_summaries
    for name, url in sorted(ready.items()):
        scope_id = 'company-source:' + hashlib.sha256(name.encode()).hexdigest()
        scope = {'id': scope_id, 'source_id': scope_id, 'host': website_host(url),
                 'entity_kind': 'company_source_record', 'dimension': 'saved_profile_packet_analysis',
                 'temporal_scope': 'offline-replay:' + binding, 'source_revision': inventory['seeds_sha256'],
                 'parser_version': 'company-profile-replay-v1',
                 'eligibility_rule': 'Exact existing approved seed matching the pinned source-record website host',
                 'population': {'status': 'exact', 'eligible_ids': [name], 'as_of': replay_at,
                                'evidence': population_evidence,
                                'reason': 'Synthetic input inventory; not factual or current source verification'},
                 'freshness_seconds': None}
        scopes.append(scope)
        if name in rows:
            pages = rows[name]
            item = {'scope_id': scope_id, 'entity_id': name, 'at': replay_at}
            attempt_id = 'packet-analysis:' + hashlib.sha256((binding + name).encode()).hexdigest()
            starts.extend([{**item, 'type': 'discover', 'evidence': evidence},
                           {**item, 'type': 'start', 'attempt_id': attempt_id}])
            all_ok = bool(pages) and all(page['status'] == 'ok' for page in pages)
            outcomes.append({**item, 'type': 'finish', 'attempt_id': attempt_id,
                             'outcome': 'retrieved' if all_ok else 'unavailable', 'evidence': evidence,
                             'reason': None if all_ok else 'source_unavailable' if pages else 'parser_error',
                             'retry': {'mode': 'none' if all_ok else 'manual', 'after': None}})
            observations.append({'source_record_name': name, 'pages': pages,
                                 'mapping': 'all_saved_pages_ok' if all_ok else 'incomplete_or_failed_saved_pages'})
        outcomes.append({'type': 'checkpoint', 'scope_id': scope_id, 'at': replay_at, 'cursor': None,
                         'status': 'partial', 'truncated': False,
                         'reason': 'Offline packet replay does not establish source enumeration or full scan completion',
                         'evidence': evidence})
    config = {'version': 1, 'run_id': 'company-profile-replay:' + binding, 'catalogue_revision': revision,
              'snapshot_kind': 'synthetic', 'created_at': replay_at, 'attempt_budget': len(ready), 'scopes': scopes}
    return {'version': 1, 'offline_only': True, 'runtime_supported': False,
            'inventory': {key: inventory[key] for key in ('revision', 'overlay_sha256', 'seeds_sha256', 'population')},
            'packet_sha256': packet_hash, 'packet_generated_at': packet['generated_at'],
            'config': config,
            'start_batch': ({'batch_id': 'start:' + binding, 'expected_sequence': 0,
                             'events': starts, 'committed_at': replay_at} if starts else None),
            'outcome_batch': {'batch_id': 'outcome:' + binding, 'expected_sequence': 1 if starts else 0,
                              'events': outcomes, 'committed_at': replay_at},
            'observations': observations,
            'warning': 'Synthetic saved-packet analysis only. Starts are replay work, not actual HTTP starts. '
                       'Observation timestamps remain separate. No factual verification, freshness, publication, '
                       'full-scan completion, retry execution or interrupted-network reconciliation is established.'}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--overlay', type=Path, required=True)
    parser.add_argument('--approved', type=Path, required=True)
    parser.add_argument('--packet', type=Path, required=True)
    parser.add_argument('--revision', required=True)
    parser.add_argument('--replay-at', required=True)
    args = parser.parse_args(argv)
    try:
        result = compile_replay(args.overlay, args.approved, args.packet, args.revision, args.replay_at)
    except (OSError, UnicodeError, ValueError, CrawlError) as exc:
        parser.exit(1, f'Replay mapping failed: {exc}\n')
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
