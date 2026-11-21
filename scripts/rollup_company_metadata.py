#!/usr/bin/env python3
"""Reconcile exact-revision company metadata from saved batches and their journals."""
from __future__ import annotations

import argparse
from collections import defaultdict
import json
from pathlib import Path
import sqlite3

try:
    from .collection_coverage import Ledger
    from .company_metadata_evidence import site_url
    from .company_metadata_funding import prepare_funding_review
    from .company_metadata_socials import COMPANY_SOCIALS
    from .plan_company_profiles import CrawlError, website_host
    from .stage_early_investments import load_json
    from .review_company_metadata import (
        coverage_counts, decision_outcome, decision_proof, load_bundle,
        load_review_plan, make_config, processed_cells, review_dimensions, saved_artifact,
    )
except ImportError:
    from collection_coverage import Ledger
    from company_metadata_evidence import site_url
    from company_metadata_funding import prepare_funding_review
    from company_metadata_socials import COMPANY_SOCIALS
    from plan_company_profiles import CrawlError, website_host
    from stage_early_investments import load_json
    from review_company_metadata import (
        coverage_counts, decision_outcome, decision_proof, load_bundle,
        load_review_plan, make_config, processed_cells, review_dimensions, saved_artifact,
    )


MAX_BATCHES = 20
PRIORITY = {'blocked': 0, 'searched_unknown': 0, 'candidate': 1,
            'reviewed': 2, 'published': 2, 'conflict': 2, 'not_applicable': 2}

# The archived rebrand receipt binds the reviewed company and former name to
# the original committed batch, issuer URL and exact evidence bytes.
PINNED_FORMER_NAMES = {
    ('Arkeus', 'c994ae4480ec97ceb2b52df01baac9943a7fe6862013240546f79f1f3c1e9285',
     'https://arkeus.com/news/arkeus-rebrand',
     '011a8ba7cbbf257ea285cf5da15b6a9445fde519d9597695858609c9b0e52ae3'): 'IAS Asia Pacific',
}


def committed_decisions(snapshot, decisions, batch_sha, at):
    done = processed_cells(snapshot)
    companies = {name for name, _ in done}
    if done != {key for key in decisions if key[0] in companies}:
        raise ValueError('Checkpoint must commit complete companies from this batch')
    for name, dimension in done:
        decision = decisions[name, dimension]
        proof = decision_proof(batch_sha, decision)
        status, reason, retry = decision_outcome(decision['disposition'])
        item = snapshot['state']['scopes'][dimension]['items'][name]
        expected = {'id': proof['sha256'], 'started_at': at, 'finished_at': at,
                    'status': status, 'reason': reason, 'evidence': proof}
        if (item['attempts'] != [expected] or item['active_attempt_id'] is not None
                or item['discovery_evidence'] != [proof] or item['retry']['mode'] != retry):
            raise ValueError('Checkpoint decision proof does not match the saved batch')
    return done


def load_committed_batch(plan, overlay, approved, bundle_path, ledger_path):
    at, reviewer, sha, artifacts, decisions, _, batch, staged = load_bundle(bundle_path, plan, overlay, approved)
    config = make_config(plan, at, sha, decisions, staged, batch.get('candidate_inventory'))
    with Ledger.open(ledger_path, config, read_only=True) as ledger:
        snapshot = ledger.snapshot()
    done = committed_decisions(snapshot, decisions, sha, at)
    return {
        'batch_sha256': sha, 'review_as_of': at, 'reviewer': reviewer, 'sequence': snapshot['sequence'],
        'identity_sha256': batch.get('identity_snapshot', {}).get('sha256'),
        'staged': staged, 'done': done, 'decisions': decisions,
        'artifacts': artifacts, 'root': bundle_path.resolve().parent,
    }


def combine_staged(staged, identities, names, hosts):
    for name, record in staged.items():
        identity = record['id']
        website = site_url(record['website'])
        host = website_host(website).removeprefix('www.')
        expected = {'name': name, 'candidate_id': identity, 'website': website, 'seed_state': 'staged_unpublished'}
        if (identities.get(identity, expected) != expected or names.get(name.casefold(), identity) != identity
                or hosts.get(host, identity) != identity):
            raise ValueError('Staged identity conflicts across saved batches')
        identities[identity] = expected
        names[name.casefold()] = identity
        hosts[host] = identity


def committed_alias_evidence(effective, batches):
    evidence = {}
    for (name, dimension), decision in effective.items():
        if dimension != 'aliases' or decision['disposition'] not in ('reviewed', 'published'):
            continue
        batch_sha = decision['batch_sha256']
        batch = batches[batch_sha]
        for key in decision['evidence']:
            entry = batch['artifacts'][key]
            source = entry.get('source_url')
            former = PINNED_FORMER_NAMES.get((name, batch_sha, source, entry['sha256']))
            if entry['kind'] != 'review' or former is None:
                continue
            _, raw = saved_artifact(batch['root'], entry)
            support = load_json(raw)['support']
            evidence[name, key, former] = {'source_url': source, 'support': support,
                                           'sha256': entry['sha256'], 'batch_sha256': batch_sha}
    return evidence


def rollup(overlay, approved, revision, checkpoints, *, funding_review=None):
    if not 1 <= len(checkpoints) <= MAX_BATCHES:
        raise ValueError(f'Expected 1 to {MAX_BATCHES} saved bundle and ledger pairs')
    plan = load_review_plan(overlay, approved, revision)
    batches = {}
    for bundle_path, ledger_path in checkpoints:
        batch = load_committed_batch(plan, overlay, approved, bundle_path, ledger_path)
        sha, done = batch['batch_sha256'], batch['done']
        prior = batches.get(sha)
        if prior:
            if not (done <= prior['done'] or prior['done'] <= done):
                raise ValueError('Divergent checkpoints for the same saved batch')
            if (len(prior['done']), prior['sequence']) >= (len(done), batch['sequence']):
                continue
        batches[sha] = batch

    identity_digests = {batch['identity_sha256'] for batch in batches.values() if batch['identity_sha256']}
    if len(identity_digests) > 1:
        raise ValueError('Saved batches must share the same exact graph identity snapshot')

    receipts, histories = [], defaultdict(list)
    staged, staged_names, staged_hosts = {}, {}, {}
    for sha, batch in sorted(batches.items(), key=lambda entry: (entry[1]['review_as_of'], entry[0])):
        combine_staged(batch['staged'], staged, staged_names, staged_hosts)
        pending = {name for name, _ in batch['decisions'].keys() - batch['done']}
        receipts.append({key: batch[key] for key in ('batch_sha256', 'review_as_of', 'reviewer', 'sequence',
                                                       'identity_sha256')} | {
            'committed_field_cells': len(batch['done']), 'pending_companies': sorted(pending),
        })
        for key in sorted(batch['done']):
            decision = batch['decisions'][key]
            history = histories[key]
            if history and history[-1]['review_as_of'] == batch['review_as_of']:
                raise ValueError(f'Distinct batches committed {key[0]} / {key[1]} at the same review time')
            observation = {'batch_sha256': sha, 'review_as_of': batch['review_as_of'],
                           'disposition': decision['disposition'], 'decision_sha256': decision_proof(sha, decision)['sha256'],
                           'evidence': decision['evidence']}
            if key[1] == COMPANY_SOCIALS:
                observation['company_social_review'] = decision['company_social_review']
            history.append(observation)

    effective = {}
    for key, history in histories.items():
        current = history
        if key[1] == COMPANY_SOCIALS:
            # Refresh the same source without losing separate issuer evidence.
            current = {row['company_social_review']['source_url']: row for row in history}.values()
        effective[key] = max(current, key=lambda row: (PRIORITY[row['disposition']], row['review_as_of']))
    dimensions = review_dimensions(histories)

    def field_status(name, dimension):
        return effective.get((name, dimension), {}).get('disposition', 'unsearched')

    catalogue = [{'name': row['source_record_name'], 'seed_state': row['seed_state']} for row in plan['items']]
    staged_rows = sorted(staged.values(), key=lambda row: row['name'])
    queue = [{**row, 'fields': {field: field_status(row['name'], field) for field in dimensions}}
             for row in catalogue + staged_rows]
    report = {
        'version': 1, 'offline_only': True, 'revision': revision, 'plan_id': plan['plan_id'],
        'input_hashes': {key: plan[key] for key in ('overlay_sha256', 'seeds_sha256')},
        'identity_sha256': next(iter(identity_digests), None), 'review_as_of': receipts[-1]['review_as_of'],
        'coverage': {
            'catalogue': coverage_counts([row['name'] for row in catalogue], field_status, dimensions),
            'approved_seed_ready': coverage_counts([row['name'] for row in catalogue
                                                    if row['seed_state'] == 'approved_seed_ready'], field_status, dimensions),
            'staged_candidates': coverage_counts([row['name'] for row in staged_rows], field_status, dimensions),
            'seed_states': plan['population']['seed_states'], 'external_source_population': 'unknown',
        },
        'batches': receipts, 'queue': queue, 'committed_field_cells': len(histories),
        'observations': [{'name': name, 'dimension': dimension,
                          'effective_batch_sha256': effective[name, dimension]['batch_sha256'],
                          'history': history}
                         for (name, dimension), history in sorted(histories.items())],
    }

    if funding_review is not None:
        report['funding_review'] = prepare_funding_review(
            report, overlay, funding_review, committed_alias_evidence(effective, batches),
        )
    return report


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--overlay', type=Path, required=True)
    parser.add_argument('--approved', type=Path, required=True)
    parser.add_argument('--revision', required=True)
    parser.add_argument('--batch', type=Path, action='append', nargs=2, metavar=('BUNDLE', 'LEDGER'), required=True)
    parser.add_argument('--funding-review', type=Path, help='Rank saved financing leads and plan early-history review')
    args = parser.parse_args(argv)
    try:
        result = rollup(args.overlay, args.approved, args.revision, args.batch, funding_review=args.funding_review)
    except (OSError, ValueError, CrawlError, sqlite3.Error) as exc:
        parser.exit(1, f'Metadata rollup failed: {exc}\n')
    print(json.dumps(result, indent=2, ensure_ascii=False))


if __name__ == '__main__':
    main()
