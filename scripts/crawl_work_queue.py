#!/usr/bin/env python3
"""Distributed crawl work queue: partition a crawl run into claimable units.

Ben directed (27 Nov 2026) a distributed, schedulable crawl pipeline so
multiple agents can crawl concurrently without double-working entities.
Design: ~/workspace/goals/global-startup-tracking/hidden_files/
distributed-crawl-design.md

The queue is a single JSON file (data/crawl-work-queue.json) holding work
units. A unit is one mode x one partition shard of that mode's seed set, or
one coverage scope (from scripts/crawl_gap_report.py output) x one shard
of its uncovered entity ids. Agents claim units under a lease, heartbeat
to extend it, and complete/fail/release them; expired leases return to
the pool lazily on the next mutating operation. This module is the single
source of truth for the semantics; backend/mcp/crawl-work-queue.mjs
mirrors it for the /mcp/admin tools, and both test suites pin the same
behaviours.

The queue only coordinates. Crawl outputs keep flowing through the
existing paths (snapshots -> build-review-queue.py -> review gate ->
corpus/index); completing a unit records a result_ref pointing at the
output, never the output itself.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import sys
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(Path(__file__).resolve().parent))

from record_crawl_runs import MODE_SEED_FILES, WORKFLOW_MODES, seed_source_ids  # noqa: E402

VERSION = 1
DEFAULT_QUEUE = ROOT / 'data' / 'crawl-work-queue.json'
DEFAULT_LEASE_SECONDS = 1800  # 30 min, matching the crawl-runs.json precedent
DEFAULT_MAX_ATTEMPTS = 3
DEFAULT_SHARD_SIZE = 10

STATUSES = ('pending', 'claimed', 'done', 'failed', 'dead')


class QueueError(Exception):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


def _iso(moment):
    return moment.astimezone(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


def _parse_time(value):
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        parsed = datetime.fromisoformat(value.strip().replace('Z', '+00:00'))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def now_utc():
    return datetime.now(timezone.utc)


def new_queue():
    return {'version': VERSION, 'units': []}


def partition(ids, shard_size):
    """Split a sorted id list into consecutive shards of shard_size."""
    if shard_size < 1:
        raise QueueError('VALIDATION_ERROR', 'shard_size must be >= 1')
    ids = sorted(ids)
    return [ids[i:i + shard_size] for i in range(0, len(ids), shard_size)]


def _shard_size(total, shard_size, agents):
    if shard_size:
        return shard_size
    if agents:
        # Aim for ~2 shards per agent so faster agents can take a second
        # shard instead of idling while slower ones finish.
        return max(1, math.ceil(total / (2 * agents)))
    return DEFAULT_SHARD_SIZE


def build_units(run_id, *, root=ROOT, modes=None, gap_report=None,
                shard_size=None, agents=None, max_attempts=DEFAULT_MAX_ATTEMPTS):
    """Build the unit list for one run: seed-mode shards + coverage shards."""
    units = []
    seq = 0

    def add(kind, shard, **fields):
        nonlocal seq
        seq += 1
        unit = {
            'unit_id': f'cwu-{run_id}-{seq:03d}',
            'run_id': run_id,
            'kind': kind,
            'status': 'pending',
            'claimed_by': None,
            'claimed_at': None,
            'lease_expires_at': None,
            'attempts': 0,
            'max_attempts': max_attempts,
            'result': None,
            'last_error': None,
        }
        unit.update(fields)
        units.append(unit)

    for mode in (modes or []):
        if mode not in MODE_SEED_FILES:
            raise QueueError('VALIDATION_ERROR', f'Unknown crawl mode: {mode}')
        ids = seed_source_ids(root, mode)
        size = _shard_size(len(ids), shard_size, agents)
        for shard in partition(ids, size):
            add('mode', shard, mode=mode, scope_id=None,
                source_ids=shard, entity_ids=None)

    if gap_report:
        for scope in gap_report.get('scopes') or []:
            uncovered = scope.get('uncovered_ids') or []
            if not uncovered:
                continue
            size = _shard_size(len(uncovered), shard_size, agents)
            for shard in partition(uncovered, size):
                add('coverage', shard, mode=None, scope_id=scope.get('scope_id'),
                    source_ids=None, entity_ids=shard)
    return units


def enqueue(state, units, *, run_id):
    """Append a run's units. A run_id may only be enqueued once."""
    if any(u['run_id'] == run_id for u in state['units']):
        raise QueueError('RUN_EXISTS',
                         f'Run {run_id} is already enqueued; pick a new run_id.')
    state['units'].extend(units)
    return units


def reclaim_expired(state, moment):
    """Return units whose lease has expired to pending. Returns their ids."""
    reclaimed = []
    for unit in state['units']:
        if unit['status'] != 'claimed':
            continue
        expires = _parse_time(unit.get('lease_expires_at'))
        if expires is not None and expires <= moment:
            unit['status'] = 'pending'
            unit['claimed_by'] = None
            unit['claimed_at'] = None
            unit['lease_expires_at'] = None
            reclaimed.append(unit['unit_id'])
    return reclaimed


def _find(state, unit_id):
    for unit in state['units']:
        if unit['unit_id'] == unit_id:
            return unit
    raise QueueError('NOT_FOUND', f'No work unit with id {unit_id}.')


def _held_by(unit, agent_id):
    return unit['status'] == 'claimed' and unit.get('claimed_by') == agent_id


def claim_next(state, agent_id, moment, *, lease_seconds=DEFAULT_LEASE_SECONDS,
               run_id=None, kind=None, mode=None, scope_id=None):
    """Claim the first matching pending unit for agent_id, or return None.

    Exactly one agent can hold a unit: the caller persists the mutated
    state atomically (CLI lockfile, or the Contents API sha on the MCP
    surface), so a competing claim either sees the unit already claimed
    or fails its write and retries on the next unit.
    """
    reclaim_expired(state, moment)
    candidates = [u for u in state['units'] if u['status'] == 'pending']
    candidates.sort(key=lambda u: (u['run_id'], u['unit_id']))
    for unit in candidates:
        if run_id and unit['run_id'] != run_id:
            continue
        if kind and unit['kind'] != kind:
            continue
        if mode and unit.get('mode') != mode:
            continue
        if scope_id and unit.get('scope_id') != scope_id:
            continue
        unit['status'] = 'claimed'
        unit['claimed_by'] = agent_id
        unit['claimed_at'] = _iso(moment)
        unit['lease_expires_at'] = _iso(moment + timedelta(seconds=lease_seconds))
        unit['attempts'] += 1
        return unit
    return None


def heartbeat(state, unit_id, agent_id, moment, *, lease_seconds=DEFAULT_LEASE_SECONDS):
    unit = _find(state, unit_id)
    reclaim_expired(state, moment)
    if not _held_by(unit, agent_id):
        raise QueueError('NOT_HELD',
                         f'Unit {unit_id} is not claimed by {agent_id} '
                         f'(status {unit["status"]}, claimed_by {unit.get("claimed_by")}).')
    unit['lease_expires_at'] = _iso(moment + timedelta(seconds=lease_seconds))
    return unit


def complete(state, unit_id, agent_id, result_ref, outcome, moment):
    """Record a unit's result. Idempotent for the same agent + result_ref.

    Returns (unit, already_done). A late completion is accepted only while
    the unit is still held by the same agent (an expired lease that nobody
    else re-claimed is reclaimed lazily first, so a late completion after
    re-claim is rejected as NOT_HELD rather than overwriting the new
    holder's work).
    """
    if not isinstance(result_ref, str) or not result_ref.strip():
        raise QueueError('VALIDATION_ERROR', 'result_ref must be a non-empty string.')
    unit = _find(state, unit_id)
    if unit['status'] == 'done':
        result = unit.get('result') or {}
        if result.get('completed_by') == agent_id and result.get('result_ref') == result_ref:
            return unit, True
        raise QueueError('ALREADY_DONE',
                         f'Unit {unit_id} is already done with a different '
                         'result; the stored result stands.')
    reclaim_expired(state, moment)
    if not _held_by(unit, agent_id):
        raise QueueError('NOT_HELD',
                         f'Unit {unit_id} is not claimed by {agent_id} '
                         f'(status {unit["status"]}, claimed_by {unit.get("claimed_by")}).')
    unit['status'] = 'done'
    unit['result'] = {
        'result_ref': result_ref,
        'outcome': outcome or {},
        'completed_by': agent_id,
        'completed_at': _iso(moment),
    }
    unit['claimed_by'] = None
    unit['claimed_at'] = None
    unit['lease_expires_at'] = None
    unit['last_error'] = None
    return unit, False


def fail(state, unit_id, agent_id, error, moment):
    """Record a failure: back to pending while attempts remain, else dead."""
    unit = _find(state, unit_id)
    reclaim_expired(state, moment)
    if not _held_by(unit, agent_id):
        raise QueueError('NOT_HELD',
                         f'Unit {unit_id} is not claimed by {agent_id} '
                         f'(status {unit["status"]}, claimed_by {unit.get("claimed_by")}).')
    unit['last_error'] = str(error) if error else 'unspecified failure'
    unit['claimed_by'] = None
    unit['claimed_at'] = None
    unit['lease_expires_at'] = None
    unit['status'] = 'dead' if unit['attempts'] >= unit['max_attempts'] else 'pending'
    return unit


def release(state, unit_id, agent_id, moment):
    """Voluntarily give a unit back without consuming an attempt."""
    unit = _find(state, unit_id)
    reclaim_expired(state, moment)
    if not _held_by(unit, agent_id):
        raise QueueError('NOT_HELD',
                         f'Unit {unit_id} is not claimed by {agent_id} '
                         f'(status {unit["status"]}, claimed_by {unit.get("claimed_by")}).')
    unit['attempts'] = max(0, unit['attempts'] - 1)
    unit['status'] = 'pending'
    unit['claimed_by'] = None
    unit['claimed_at'] = None
    unit['lease_expires_at'] = None
    return unit


def status_summary(state, moment, *, run_id=None):
    """Counts by status (after lazy reclaim), overall and per run."""
    reclaim_expired(state, moment)
    units = [u for u in state['units'] if not run_id or u['run_id'] == run_id]
    by_status = {status: 0 for status in STATUSES}
    runs = {}
    for unit in units:
        by_status[unit['status']] = by_status.get(unit['status'], 0) + 1
        run = runs.setdefault(unit['run_id'], {status: 0 for status in STATUSES})
        run[unit['status']] = run.get(unit['status'], 0) + 1
    return {'total': len(units), 'by_status': by_status, 'runs': runs}


# ---------------------------------------------------------------- file IO

def load_queue(path):
    path = Path(path)
    if not path.exists():
        return new_queue()
    data = json.loads(path.read_text(encoding='utf-8'))
    if not isinstance(data, dict) or not isinstance(data.get('units'), list):
        raise QueueError('VALIDATION_ERROR', f'{path} is not a crawl work queue file.')
    return data


def save_queue(path, state):
    path = Path(path)
    text = json.dumps(state, indent=2, sort_keys=True, ensure_ascii=False) + '\n'
    tmp = path.with_suffix(path.suffix + '.tmp')
    tmp.write_text(text, encoding='utf-8')
    os.replace(tmp, path)


@contextmanager
def locked_update(path):
    """Load-modify-save under an flock so concurrent CLI claims in one
    checkout cannot both win the same unit."""
    import fcntl
    path = Path(path)
    lock_path = path.with_suffix(path.suffix + '.lock')
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    with open(lock_path, 'w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        state = load_queue(path)
        yield state
        save_queue(path, state)
        fcntl.flock(lock, fcntl.LOCK_UN)


# ---------------------------------------------------------------- CLI

def _print(payload):
    print(json.dumps(payload, indent=2, sort_keys=True))


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument('--queue', type=Path, default=DEFAULT_QUEUE)
    sub = parser.add_subparsers(dest='command', required=True)

    p = sub.add_parser('enqueue', help='Partition a run into work units')
    p.add_argument('--run-id', required=True)
    p.add_argument('--modes', default='',
                   help='Comma-separated modes, or "all" for the 8 workflow modes')
    p.add_argument('--gap-report', type=Path,
                   help='crawl_gap_report.py JSON output; its scopes become coverage units')
    p.add_argument('--shard-size', type=int)
    p.add_argument('--agents', type=int,
                   help='Tune shard size for this many agents (~2 shards each)')
    p.add_argument('--max-attempts', type=int, default=DEFAULT_MAX_ATTEMPTS)

    p = sub.add_parser('claim', help='Claim the next pending unit')
    p.add_argument('--agent', required=True)
    p.add_argument('--lease-seconds', type=int, default=DEFAULT_LEASE_SECONDS)
    p.add_argument('--run-id')
    p.add_argument('--kind', choices=['mode', 'coverage'])
    p.add_argument('--mode')
    p.add_argument('--scope-id')

    p = sub.add_parser('heartbeat', help='Extend a held unit lease')
    p.add_argument('--agent', required=True)
    p.add_argument('--unit-id', required=True)
    p.add_argument('--lease-seconds', type=int, default=DEFAULT_LEASE_SECONDS)

    p = sub.add_parser('complete', help='Record a held unit result (idempotent)')
    p.add_argument('--agent', required=True)
    p.add_argument('--unit-id', required=True)
    p.add_argument('--result-ref', required=True)
    p.add_argument('--outcome-json', default='{}')

    p = sub.add_parser('fail', help='Fail a held unit (retry or dead)')
    p.add_argument('--agent', required=True)
    p.add_argument('--unit-id', required=True)
    p.add_argument('--error', required=True)

    p = sub.add_parser('release', help='Give a held unit back, attempt refunded')
    p.add_argument('--agent', required=True)
    p.add_argument('--unit-id', required=True)

    p = sub.add_parser('sweep', help='Reclaim expired leases now')
    p = sub.add_parser('status', help='Queue counts by status')
    p.add_argument('--run-id')

    args = parser.parse_args(argv)
    moment = now_utc()
    try:
        if args.command == 'enqueue':
            modes = []
            if args.modes:
                modes = (list(WORKFLOW_MODES) if args.modes.strip() == 'all'
                         else [m.strip() for m in args.modes.split(',') if m.strip()])
            gap_report = None
            if args.gap_report:
                gap_report = json.loads(Path(args.gap_report).read_text(encoding='utf-8'))
            if not modes and not gap_report:
                raise QueueError('VALIDATION_ERROR',
                                 'enqueue needs --modes and/or --gap-report.')
            units = build_units(args.run_id, root=ROOT, modes=modes,
                                gap_report=gap_report, shard_size=args.shard_size,
                                agents=args.agents, max_attempts=args.max_attempts)
            with locked_update(args.queue) as state:
                enqueue(state, units, run_id=args.run_id)
            _print({'run_id': args.run_id, 'units_created': len(units)})
        elif args.command == 'claim':
            with locked_update(args.queue) as state:
                unit = claim_next(state, args.agent, moment,
                                  lease_seconds=args.lease_seconds,
                                  run_id=args.run_id, kind=args.kind,
                                  mode=args.mode, scope_id=args.scope_id)
            _print({'status': 'claimed', 'unit': unit} if unit else {'status': 'no_work'})
        elif args.command == 'heartbeat':
            with locked_update(args.queue) as state:
                unit = heartbeat(state, args.unit_id, args.agent, moment,
                                 lease_seconds=args.lease_seconds)
            _print({'status': 'ok', 'unit': unit})
        elif args.command == 'complete':
            outcome = json.loads(args.outcome_json)
            with locked_update(args.queue) as state:
                unit, already = complete(state, args.unit_id, args.agent,
                                         args.result_ref, outcome, moment)
            _print({'status': 'ok', 'already_done': already, 'unit': unit})
        elif args.command == 'fail':
            with locked_update(args.queue) as state:
                unit = fail(state, args.unit_id, args.agent, args.error, moment)
            _print({'status': 'ok', 'unit': unit})
        elif args.command == 'release':
            with locked_update(args.queue) as state:
                unit = release(state, args.unit_id, args.agent, moment)
            _print({'status': 'ok', 'unit': unit})
        elif args.command == 'sweep':
            with locked_update(args.queue) as state:
                reclaimed = reclaim_expired(state, moment)
            _print({'reclaimed': reclaimed})
        elif args.command == 'status':
            state = load_queue(args.queue)
            _print(status_summary(state, moment, run_id=args.run_id))
    except QueueError as error:
        _print({'error': error.code, 'message': str(error)})
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
