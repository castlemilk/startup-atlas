"""Tests for scripts/crawl_work_queue.py — the distributed crawl queue.

Pins the behaviours the multi-agent crawl depends on: partitioning,
exactly-one-winner claims, lease expiry/reclaim, idempotent completion,
and fail -> retry -> dead. The JS mirror (backend/mcp/crawl-work-queue.mjs)
is pinned to the same behaviours by backend/mcp/tests/crawl-work-queue.test.mjs.
"""
import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))

import crawl_work_queue as cwq  # noqa: E402

T0 = datetime(2026, 11, 28, 0, 0, 0, tzinfo=timezone.utc)


def make_state(n_units=3, run_id='run-1'):
    state = cwq.new_queue()
    units = [{
        'unit_id': f'cwu-{run_id}-{i + 1:03d}',
        'run_id': run_id,
        'kind': 'coverage',
        'mode': None,
        'scope_id': 'founder-photos',
        'source_ids': None,
        'entity_ids': [f'founder:x:p{i}'],
        'status': 'pending',
        'claimed_by': None,
        'claimed_at': None,
        'lease_expires_at': None,
        'attempts': 0,
        'max_attempts': 3,
        'result': None,
        'last_error': None,
    } for i in range(n_units)]
    cwq.enqueue(state, units, run_id=run_id)
    return state


class PartitionTests(unittest.TestCase):
    def test_partition_shards_sorted_ids(self):
        shards = cwq.partition(['c', 'a', 'b', 'e', 'd'], 2)
        self.assertEqual(shards, [['a', 'b'], ['c', 'd'], ['e']])

    def test_build_units_from_gap_report(self):
        gap = {'scopes': [
            {'scope_id': 'founder-photos',
             'uncovered_ids': [f'founder:s:p{i}' for i in range(25)]},
            {'scope_id': 'partner-logos', 'uncovered_ids': []},
        ]}
        units = cwq.build_units('run-g', gap_report=gap, shard_size=10)
        self.assertEqual(len(units), 3)  # empty scope produces no units
        self.assertTrue(all(u['kind'] == 'coverage' for u in units))
        self.assertTrue(all(u['scope_id'] == 'founder-photos' for u in units))
        covered = [e for u in units for e in u['entity_ids']]
        self.assertEqual(len(covered), 25)
        self.assertEqual(len(set(covered)), 25)  # no entity in two units
        ids = [u['unit_id'] for u in units]
        self.assertEqual(ids, sorted(ids))

    def test_build_units_agents_tunes_shard_size(self):
        gap = {'scopes': [{'scope_id': 's', 'uncovered_ids': [str(i) for i in range(40)]}]}
        units = cwq.build_units('run-g', gap_report=gap, agents=4)
        self.assertEqual(len(units), 8)  # ~2 shards per agent

    def test_enqueue_rejects_duplicate_run(self):
        state = make_state()
        with self.assertRaises(cwq.QueueError) as ctx:
            cwq.enqueue(state, [], run_id='run-1')
        self.assertEqual(ctx.exception.code, 'RUN_EXISTS')


class ClaimTests(unittest.TestCase):
    def test_two_agents_never_share_a_unit(self):
        state = make_state(n_units=2)
        first = cwq.claim_next(state, 'agent-a', T0)
        second = cwq.claim_next(state, 'agent-b', T0)
        third = cwq.claim_next(state, 'agent-c', T0)
        self.assertIsNotNone(first)
        self.assertIsNotNone(second)
        self.assertNotEqual(first['unit_id'], second['unit_id'])
        self.assertIsNone(third)  # pool drained; nobody double-claimed
        self.assertEqual(first['claimed_by'], 'agent-a')
        self.assertEqual(first['attempts'], 1)

    def test_claim_filters(self):
        state = make_state()
        unit = cwq.claim_next(state, 'agent-a', T0, scope_id='founder-photos')
        self.assertEqual(unit['scope_id'], 'founder-photos')
        self.assertIsNone(cwq.claim_next(state, 'agent-a', T0, scope_id='partner-logos'))

    def test_heartbeat_extends_lease_and_requires_holder(self):
        state = make_state(n_units=1)
        unit = cwq.claim_next(state, 'agent-a', T0, lease_seconds=60)
        with self.assertRaises(cwq.QueueError) as ctx:
            cwq.heartbeat(state, unit['unit_id'], 'agent-b', T0)
        self.assertEqual(ctx.exception.code, 'NOT_HELD')
        later = T0 + timedelta(seconds=30)
        cwq.heartbeat(state, unit['unit_id'], 'agent-a', later, lease_seconds=60)
        self.assertEqual(unit['lease_expires_at'],
                         cwq._iso(later + timedelta(seconds=60)))


class LeaseRecoveryTests(unittest.TestCase):
    def test_expired_lease_returns_to_pool(self):
        state = make_state(n_units=1)
        unit = cwq.claim_next(state, 'agent-a', T0, lease_seconds=60)
        later = T0 + timedelta(seconds=61)
        reclaimed_unit = cwq.claim_next(state, 'agent-b', later)
        self.assertEqual(reclaimed_unit['unit_id'], unit['unit_id'])
        self.assertEqual(reclaimed_unit['claimed_by'], 'agent-b')
        self.assertEqual(reclaimed_unit['attempts'], 2)

    def test_live_lease_is_not_reclaimed(self):
        state = make_state(n_units=1)
        cwq.claim_next(state, 'agent-a', T0, lease_seconds=3600)
        self.assertIsNone(cwq.claim_next(state, 'agent-b', T0 + timedelta(seconds=60)))

    def test_sweep_reports_reclaimed(self):
        state = make_state(n_units=1)
        unit = cwq.claim_next(state, 'agent-a', T0, lease_seconds=60)
        reclaimed = cwq.reclaim_expired(state, T0 + timedelta(seconds=61))
        self.assertEqual(reclaimed, [unit['unit_id']])
        self.assertEqual(unit['status'], 'pending')


class CompletionTests(unittest.TestCase):
    def test_complete_records_result(self):
        state = make_state(n_units=1)
        unit = cwq.claim_next(state, 'agent-a', T0)
        done, already = cwq.complete(state, unit['unit_id'], 'agent-a',
                                     'research/crawl/latest-portraits.json',
                                     {'candidates': 5}, T0)
        self.assertFalse(already)
        self.assertEqual(done['status'], 'done')
        self.assertEqual(done['result']['result_ref'],
                         'research/crawl/latest-portraits.json')
        self.assertEqual(done['result']['outcome'], {'candidates': 5})

    def test_complete_is_idempotent_for_same_agent_and_ref(self):
        state = make_state(n_units=1)
        unit = cwq.claim_next(state, 'agent-a', T0)
        cwq.complete(state, unit['unit_id'], 'agent-a', 'ref-1', {}, T0)
        done, already = cwq.complete(state, unit['unit_id'], 'agent-a',
                                     'ref-1', {}, T0 + timedelta(minutes=5))
        self.assertTrue(already)
        self.assertEqual(done['status'], 'done')

    def test_complete_rejected_for_other_agent_or_other_ref(self):
        state = make_state(n_units=1)
        unit = cwq.claim_next(state, 'agent-a', T0)
        with self.assertRaises(cwq.QueueError) as ctx:
            cwq.complete(state, unit['unit_id'], 'agent-b', 'ref-1', {}, T0)
        self.assertEqual(ctx.exception.code, 'NOT_HELD')
        cwq.complete(state, unit['unit_id'], 'agent-a', 'ref-1', {}, T0)
        with self.assertRaises(cwq.QueueError) as ctx:
            cwq.complete(state, unit['unit_id'], 'agent-a', 'ref-2', {}, T0)
        self.assertEqual(ctx.exception.code, 'ALREADY_DONE')

    def test_late_completion_after_reclaim_is_rejected(self):
        state = make_state(n_units=1)
        unit = cwq.claim_next(state, 'agent-a', T0, lease_seconds=60)
        later = T0 + timedelta(seconds=61)
        cwq.claim_next(state, 'agent-b', later)  # reclaims the expired unit
        with self.assertRaises(cwq.QueueError) as ctx:
            cwq.complete(state, unit['unit_id'], 'agent-a', 'ref-late', {}, later)
        self.assertEqual(ctx.exception.code, 'NOT_HELD')


class FailTests(unittest.TestCase):
    def test_fail_returns_to_pending_then_dead(self):
        state = make_state(n_units=1)
        for attempt in (1, 2):
            unit = cwq.claim_next(state, 'agent-a', T0)
            unit = cwq.fail(state, unit['unit_id'], 'agent-a', 'boom', T0)
            self.assertEqual(unit['status'], 'pending')
            self.assertEqual(unit['last_error'], 'boom')
        unit = cwq.claim_next(state, 'agent-a', T0)
        unit = cwq.fail(state, unit['unit_id'], 'agent-a', 'boom', T0)
        self.assertEqual(unit['status'], 'dead')
        self.assertIsNone(cwq.claim_next(state, 'agent-a', T0))

    def test_release_refunds_attempt(self):
        state = make_state(n_units=1)
        unit = cwq.claim_next(state, 'agent-a', T0)
        self.assertEqual(unit['attempts'], 1)
        unit = cwq.release(state, unit['unit_id'], 'agent-a', T0)
        self.assertEqual(unit['status'], 'pending')
        self.assertEqual(unit['attempts'], 0)


class StatusTests(unittest.TestCase):
    def test_status_summary(self):
        state = make_state(n_units=3)
        unit = cwq.claim_next(state, 'agent-a', T0)
        cwq.complete(state, unit['unit_id'], 'agent-a', 'ref', {}, T0)
        summary = cwq.status_summary(state, T0)
        self.assertEqual(summary['total'], 3)
        self.assertEqual(summary['by_status']['done'], 1)
        self.assertEqual(summary['by_status']['pending'], 2)
        self.assertEqual(summary['runs']['run-1']['done'], 1)


if __name__ == '__main__':
    unittest.main()
