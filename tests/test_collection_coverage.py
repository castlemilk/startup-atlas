"""Offline acceptance tests for the isolated collection coverage contract.

All populations, evidence and timestamps are synthetic. SQLite files live only
in temporary directories; the subprocesses exercise transaction durability and
never run a collector, a browser or an external request.
"""

from copy import deepcopy
from datetime import datetime, timedelta, timezone
import hashlib
import importlib.util
import json
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
MODULE = ROOT / "scripts" / "collection_coverage.py"
SPEC = importlib.util.spec_from_file_location("atlas_collection_coverage", MODULE)
coverage = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(coverage)


def stamp(seconds=0):
    start = datetime(2026, 11, 18, tzinfo=timezone.utc)
    return (start + timedelta(seconds=seconds)).strftime("%Y-%m-%dT%H:%M:%SZ")


def evidence(ref="fixture:source-a"):
    return {"ref": ref, "sha256": hashlib.sha256(ref.encode()).hexdigest()}


def scope(scope_id="source-a", ids=("startup:alpha", "startup:beta"),
          freshness=60, host="source-a.test"):
    return {
        "id": scope_id,
        "source_id": scope_id,
        "host": host,
        "entity_kind": "startup",
        "dimension": "founders",
        "temporal_scope": "fixture:2026-11-18",
        "source_revision": "b" * 64,
        "parser_version": "fixture-parser/1",
        "eligibility_rule": "Exact synthetic membership; no source enumeration",
        "population": {
            "status": "unknown" if ids is None else "exact",
            "eligible_ids": None if ids is None else list(ids),
            "as_of": stamp(),
            "evidence": evidence("fixture:population/" + scope_id),
            "reason": "Synthetic unknown universe" if ids is None else
                      "Complete synthetic fixture membership",
        },
        "freshness_seconds": freshness,
    }


def config(scopes=None, budget=10):
    return {
        "version": 1,
        "run_id": "synthetic-coverage-run",
        "catalogue_revision": "a" * 40,
        "snapshot_kind": "synthetic",
        "created_at": stamp(),
        "attempt_budget": budget,
        "scopes": [scope()] if scopes is None else scopes,
    }


def event(kind, seconds=10, scope_id="source-a", entity_id="startup:alpha", **fields):
    value = {"type": kind, "scope_id": scope_id, "at": stamp(seconds)}
    if kind != "checkpoint":
        value["entity_id"] = entity_id
    return {**value, **fields}


def discover(**kwargs):
    return event("discover", evidence=evidence("fixture:discovery"), **kwargs)


def start(attempt_id="attempt-a", **kwargs):
    return event("start", attempt_id=attempt_id, **kwargs)


def finish(attempt_id="attempt-a", outcome="retrieved", reason=None,
           retry=None, **kwargs):
    return event(
        "finish", attempt_id=attempt_id, outcome=outcome,
        evidence=evidence("fixture:response/" + attempt_id), reason=reason,
        retry={"mode": "none", "after": None} if retry is None else retry,
        **kwargs,
    )


def verify(attempt_id="attempt-a", **kwargs):
    return event(
        "verify", attempt_id=attempt_id, reviewer="synthetic-reviewer",
        review=evidence("fixture:review/" + attempt_id), effective_at=None,
        **kwargs,
    )


def checkpoint(status="partial", cursor="fixture:page-two", reason="pagination_incomplete",
               truncated=False, **kwargs):
    return event(
        "checkpoint", cursor=cursor, status=status, truncated=truncated,
        reason=reason, evidence=evidence("fixture:enumeration"), **kwargs,
    )


class CoverageLedgerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.directory = Path(self.temp.name)
        self.counter = 0

    def create(self, spec=None, name="ledger.sqlite"):
        spec = config() if spec is None else spec
        path = self.directory / name
        ledger = coverage.Ledger.create(path, spec)
        self.addCleanup(ledger.close)
        return ledger, path, spec

    def reopen(self, path, spec):
        ledger = coverage.Ledger.open(path, spec)
        self.addCleanup(ledger.close)
        return ledger

    def apply(self, ledger, *events, batch_id=None, expected=None, committed_at=None):
        self.counter += 1
        return ledger.apply(
            batch_id or "batch-%d" % self.counter,
            ledger.snapshot()["sequence"] if expected is None else expected,
            list(events),
            committed_at or max(row["at"] for row in events),
        )

    def scope_report(self, ledger, seconds=10, scope_id="source-a"):
        return next(row for row in ledger.report(stamp(seconds))["scopes"]
                    if row["scope_id"] == scope_id)

    def item(self, ledger, scope_id="source-a", entity_id="startup:alpha"):
        return ledger.snapshot()["state"]["scopes"][scope_id]["items"][entity_id]

    def seed_attempt(self, ledger, seconds=10, **kwargs):
        self.apply(ledger, discover(seconds=seconds, **kwargs),
                   start(seconds=seconds, **kwargs))

    def test_unknown_and_known_zero_survive_reopen_without_a_percentage(self):
        spec = config([scope("empty", ()), scope("unknown", None)])
        ledger, path, spec = self.create(spec)
        ledger.close()
        ledger = self.reopen(path, spec)
        reports = {row["scope_id"]: row for row in ledger.report(stamp())["scopes"]}
        self.assertEqual(reports["empty"]["eligible_total"], 0)
        self.assertIsNone(reports["unknown"]["eligible_total"])
        self.assertEqual(reports["empty"]["counts"]["undiscovered"], 0)
        self.assertIsNone(reports["unknown"]["counts"]["undiscovered"])
        self.assertIsNone(reports["empty"]["verification_ratio"])
        self.assertIsNone(reports["unknown"]["verification_ratio"])
        self.assertIsNone(ledger.report(stamp())["entities_by_kind"]["startup"]["eligible"])

    def test_empty_enumeration_has_explicit_known_empty_completion(self):
        ledger, _, _ = self.create(config([scope(ids=())]))
        self.apply(ledger, checkpoint(status="complete", cursor=None, reason=None))
        result = self.scope_report(ledger)
        self.assertEqual(result["completion"], "known_empty")
        self.assertEqual(result["counts"]["attempted"], 0)
        self.assertIsNone(result["verification_ratio"])

    def test_failed_or_unknown_enumeration_cannot_complete(self):
        ledger, _, _ = self.create(config([scope(ids=None)]))
        self.apply(ledger, checkpoint(status="blocked", cursor=None,
                                      reason="network_dns"))
        self.assertEqual(self.scope_report(ledger)["completion"], "partial")
        self.assertIsNone(self.scope_report(ledger)["eligible_total"])
        before = ledger.snapshot()
        with self.assertRaises(coverage.ContractError):
            self.apply(ledger, checkpoint(status="complete", cursor=None, reason=None))
        self.assertEqual(ledger.snapshot(), before)

    def test_complete_requires_every_eligible_item_and_no_truncation(self):
        ledger, _, _ = self.create()
        self.seed_attempt(ledger)
        self.apply(ledger, finish())
        with self.assertRaises(coverage.ContractError):
            self.apply(ledger, checkpoint(status="complete", cursor=None, reason=None))
        self.apply(ledger, discover(entity_id="startup:beta"),
                   start(attempt_id="attempt-b", entity_id="startup:beta"),
                   finish(attempt_id="attempt-b", entity_id="startup:beta"))
        with self.assertRaises(coverage.ContractError):
            self.apply(ledger, checkpoint(status="complete", cursor=None,
                                          reason=None, truncated=True))
        self.apply(ledger, checkpoint(status="complete", cursor=None, reason=None))
        result = self.scope_report(ledger)
        self.assertEqual(result["completion"], "complete")
        self.assertEqual(result["counts"]["verified"], 0)
        self.assertEqual(result["last_successful_full_scan_at"], stamp(10))

    def test_repeating_complete_checkpoint_does_not_freshen_old_scan(self):
        ledger, _, _ = self.create(config([scope(ids=("startup:alpha",))]))
        self.apply(ledger, discover(), start(), finish(),
                   checkpoint(status="complete", cursor=None, reason=None, seconds=20))
        self.assertEqual(self.scope_report(ledger, 20)["last_successful_full_scan_at"], stamp(10))
        self.apply(ledger, checkpoint(status="complete", cursor=None, reason=None, seconds=40))
        result = self.scope_report(ledger, 40)
        self.assertEqual(result["completion"], "complete")
        self.assertEqual(result["last_successful_full_scan_at"], stamp(10))

    def test_refreshed_work_requires_new_checkpoint_binding(self):
        ledger, _, _ = self.create(config([scope(ids=("startup:alpha",))]))
        self.apply(ledger, discover(), start(), finish(),
                   checkpoint(status="complete", cursor=None, reason=None))
        self.apply(ledger, event("requeue", seconds=20, reason="refresh_due",
                                 retry={"mode": "automatic", "after": stamp(20)},
                                 evidence=evidence("fixture:refresh-decision")),
                   start(attempt_id="refresh-a", seconds=20),
                   finish(attempt_id="refresh-a", seconds=30))
        pending = self.scope_report(ledger, 30)
        self.assertEqual(pending["completion"], "partial")
        self.assertEqual(pending["last_successful_full_scan_at"], stamp(10))
        self.apply(ledger, checkpoint(status="complete", cursor=None, reason=None, seconds=40))
        completed = self.scope_report(ledger, 40)
        self.assertEqual(completed["completion"], "complete")
        self.assertEqual(completed["last_successful_full_scan_at"], stamp(30))

    def test_partial_refresh_cannot_close_or_freshen_a_new_full_pass(self):
        ledger, _, _ = self.create()
        self.apply(ledger, discover(), start(), finish(),
                   discover(entity_id="startup:beta"),
                   start(attempt_id="attempt-b", entity_id="startup:beta"),
                   finish(attempt_id="attempt-b", entity_id="startup:beta"),
                   checkpoint(status="complete", cursor=None, reason=None))
        self.apply(ledger, event("requeue", seconds=20, reason="refresh_due",
                                 retry={"mode": "automatic", "after": stamp(20)},
                                 evidence=evidence("fixture:refresh-alpha")),
                   start(attempt_id="refresh-a", seconds=20),
                   finish(attempt_id="refresh-a", seconds=20))
        before = ledger.snapshot()
        with self.assertRaises(coverage.ContractError):
            self.apply(ledger, checkpoint(status="complete", cursor=None, reason=None, seconds=25))
        self.assertEqual(ledger.snapshot(), before)
        partial = self.scope_report(ledger, 25)
        self.assertEqual(partial["completion"], "partial")
        self.assertEqual(partial["last_successful_full_scan_at"], stamp(10))

        self.apply(ledger, event("requeue", entity_id="startup:beta", seconds=30,
                                 reason="refresh_due",
                                 retry={"mode": "automatic", "after": stamp(30)},
                                 evidence=evidence("fixture:refresh-beta")),
                   start(attempt_id="refresh-b", entity_id="startup:beta", seconds=30),
                   finish(attempt_id="refresh-b", entity_id="startup:beta", seconds=30),
                   checkpoint(status="complete", cursor=None, reason=None, seconds=40))
        complete = self.scope_report(ledger, 40)
        self.assertEqual(complete["completion"], "complete")
        self.assertEqual(complete["last_successful_full_scan_at"], stamp(30))

    def test_unavailable_latest_result_prevents_completion(self):
        ledger, _, _ = self.create(config([scope(ids=("startup:alpha",))]))
        self.seed_attempt(ledger)
        self.apply(ledger, finish(outcome="unavailable", reason="source_unavailable",
                                  retry={"mode": "manual", "after": None}))
        with self.assertRaises(coverage.ContractError):
            self.apply(ledger, checkpoint(status="complete", cursor=None, reason=None))
        result = self.scope_report(ledger)
        self.assertEqual(result["counts"]["unavailable"], 1)
        self.assertEqual(result["counts"]["attempted"], 1)
        self.assertEqual(result["completion"], "partial")

    def test_discovery_deduplicates_identity_and_same_evidence(self):
        ledger, _, _ = self.create()
        self.apply(ledger, discover(), discover())
        self.apply(ledger, discover(seconds=11))
        result = self.scope_report(ledger, 11)
        self.assertEqual(result["counts"]["discovered"], 1)
        self.assertEqual(result["counts"]["attempted"], 0)
        self.assertEqual(result["counts"]["undiscovered"], 1)
        self.assertEqual(len(self.item(ledger)["discovery_evidence"]), 1)
        self.assertEqual(self.item(ledger)["discovered_at"], stamp(10))

    def test_discover_outside_exact_population_is_rejected(self):
        ledger, _, _ = self.create()
        with self.assertRaises(coverage.ContractError):
            self.apply(ledger, discover(entity_id="startup:unlisted"))
        self.assertEqual(ledger.snapshot()["sequence"], 0)

    def test_unknown_population_can_record_observations_without_inventing_total(self):
        ledger, _, _ = self.create(config([scope(ids=None)]))
        self.apply(ledger, discover())
        result = self.scope_report(ledger)
        self.assertEqual(result["counts"]["discovered"], 1)
        self.assertIsNone(result["eligible_total"])
        self.assertIsNone(result["verification_ratio"])

    def test_same_entity_in_two_sources_preserves_scopes_and_union(self):
        spec = config([scope("source-a"), scope("source-b")])
        ledger, _, _ = self.create(spec)
        self.apply(ledger, discover(), discover(scope_id="source-b"))
        report = ledger.report(stamp(10))
        self.assertEqual([row["counts"]["discovered"] for row in report["scopes"]], [1, 1])
        self.assertEqual(report["entities_by_kind"]["startup"],
                         {"eligible": 2, "discovered": 1})

    def test_identical_batch_replay_after_later_commit_is_idempotent(self):
        ledger, _, _ = self.create()
        rows = [discover()]
        first = ledger.apply("stable-batch", 0, rows, stamp(10))
        self.apply(ledger, discover(entity_id="startup:beta", seconds=11))
        before = ledger.snapshot()
        replay = ledger.apply("stable-batch", 0, rows, stamp(10))
        self.assertEqual(first, {"sequence": 1, "replayed": False})
        self.assertEqual(replay, {"sequence": 1, "replayed": True})
        self.assertEqual(ledger.snapshot(), before)

    def test_batch_id_reuse_with_changed_payload_or_expected_sequence_is_rejected(self):
        ledger, _, _ = self.create()
        ledger.apply("stable-batch", 0, [discover()], stamp(10))
        before = ledger.snapshot()
        for expected, rows, when in (
            (0, [discover(entity_id="startup:beta")], stamp(10)),
            (1, [discover()], stamp(10)),
            (0, [discover()], stamp(11)),
        ):
            with self.subTest(expected=expected, rows=rows, when=when):
                with self.assertRaises(coverage.ConflictError):
                    ledger.apply("stable-batch", expected, rows, when)
                self.assertEqual(ledger.snapshot(), before)

    def test_stale_writer_cannot_overwrite_another_connection(self):
        first, path, spec = self.create()
        second = self.reopen(path, spec)
        self.apply(first, discover(), expected=0)
        with self.assertRaises(coverage.ConflictError):
            second.apply("stale", 0, [discover(entity_id="startup:beta")], stamp(10))
        self.assertEqual(first.snapshot(), second.snapshot())
        self.assertEqual(self.scope_report(first)["counts"]["discovered"], 1)

    def test_result_and_invalid_checkpoint_roll_back_together(self):
        ledger, _, _ = self.create()
        self.seed_attempt(ledger)
        before = ledger.snapshot()
        with self.assertRaises(coverage.ContractError):
            self.apply(ledger, finish(),
                       checkpoint(status="complete", cursor=None, reason=None),
                       batch_id="atomic-result")
        self.assertEqual(ledger.snapshot(), before)
        receipt = self.apply(ledger, finish(), checkpoint(), batch_id="atomic-result")
        self.assertFalse(receipt["replayed"])
        self.assertEqual(self.item(ledger)["attempts"][0]["status"], "retrieved")

    def test_retrieval_alone_does_not_verify_a_fact(self):
        ledger, _, _ = self.create()
        self.seed_attempt(ledger)
        self.apply(ledger, finish())
        result = self.scope_report(ledger)
        self.assertEqual(result["counts"]["attempted"], 1)
        self.assertEqual(result["counts"]["verified"], 0)
        self.assertEqual(result["counts"]["freshness_unknown"], 1)
        self.assertIsNone(self.item(ledger)["last_verification"])

    def test_searched_unknown_can_finish_pass_but_cannot_verify(self):
        ledger, _, _ = self.create(config([scope(ids=("startup:alpha",))]))
        self.seed_attempt(ledger)
        self.apply(ledger, finish(outcome="searched_unknown", reason="no_supported_value"),
                   checkpoint(status="complete", cursor=None, reason=None))
        result = self.scope_report(ledger)
        self.assertEqual(result["counts"]["searched_unknown"], 1)
        self.assertEqual(result["counts"]["verified"], 0)
        with self.assertRaises(coverage.ContractError):
            self.apply(ledger, verify())

    def test_verification_requires_retrieved_attempt_for_exact_item(self):
        ledger, _, _ = self.create()
        self.seed_attempt(ledger)
        with self.assertRaises(coverage.ContractError):
            self.apply(ledger, verify())
        self.apply(ledger, finish(), discover(entity_id="startup:beta"))
        with self.assertRaises(coverage.ContractError):
            self.apply(ledger, verify(entity_id="startup:beta"))
        self.apply(ledger, verify())
        self.assertEqual(self.scope_report(ledger)["counts"]["verified"], 1)

    def test_failed_refresh_preserves_last_review_and_overlapping_staleness(self):
        ledger, path, spec = self.create()
        self.seed_attempt(ledger)
        self.apply(ledger, finish(), verify())
        original_review = self.item(ledger)["last_verification"]
        self.apply(ledger, event("requeue", seconds=20, reason="refresh_due",
                                 retry={"mode": "automatic", "after": stamp(20)},
                                 evidence=evidence("fixture:refresh-decision")),
                   start(attempt_id="refresh-a", seconds=20),
                   finish(attempt_id="refresh-a", seconds=20, outcome="unavailable",
                          reason="network_dns",
                          retry={"mode": "automatic", "after": stamp(80)}))
        ledger.close()
        ledger = self.reopen(path, spec)
        result = self.scope_report(ledger, 70)
        self.assertEqual(self.item(ledger)["last_verification"], original_review)
        self.assertEqual(result["counts"]["verified"], 1)
        self.assertEqual(result["counts"]["stale"], 1)
        self.assertEqual(result["counts"]["unavailable"], 1)
        self.assertEqual(result["counts"]["attempted"], 1)
        self.assertEqual(result["counts"]["attempts_total"], 2)
        self.assertEqual(result["verification_ratio"], 0.5)
        self.assertEqual([a["status"] for a in self.item(ledger)["attempts"]],
                         ["retrieved", "unavailable"])

    def test_freshness_boundary_uses_review_time_not_checkpoint_time(self):
        ledger, _, _ = self.create()
        self.seed_attempt(ledger)
        self.apply(ledger, finish(), verify())
        self.apply(ledger, checkpoint(seconds=60))
        before = self.scope_report(ledger, 69)["counts"]
        boundary = self.scope_report(ledger, 70)["counts"]
        self.assertEqual((before["stale"], before["fresh_verified"]), (0, 1))
        self.assertEqual((boundary["stale"], boundary["fresh_verified"]), (1, 0))
        self.assertEqual(self.item(ledger)["last_verification"]["verified_at"], stamp(10))

    def test_successful_retry_preserves_failure_history_and_distinct_attempt_count(self):
        ledger, path, spec = self.create()
        self.seed_attempt(ledger)
        self.apply(ledger, finish(outcome="unavailable", reason="network_timeout",
                                  retry={"mode": "automatic", "after": stamp(30)}))
        ledger.close()
        ledger = self.reopen(path, spec)
        self.assertEqual(self.item(ledger)["retry"]["reason"], "network_timeout")
        self.assertEqual(self.item(ledger)["retry"]["after"], stamp(30))
        self.apply(ledger, start(attempt_id="retry-success", seconds=30),
                   finish(attempt_id="retry-success", seconds=30))
        counts = self.scope_report(ledger, 30)["counts"]
        self.assertEqual((counts["attempted"], counts["attempts_total"], counts["unavailable"]),
                         (1, 2, 0))
        self.assertEqual((counts["unavailable_attempts_total"],
                          counts["interrupted_attempts_total"]), (1, 0))
        attempts = self.item(ledger)["attempts"]
        self.assertEqual([a["status"] for a in attempts], ["unavailable", "retrieved"])
        self.assertEqual(attempts[0]["reason"], "network_timeout")

    def test_missing_freshness_policy_is_unknown_not_zero_stale(self):
        ledger, _, _ = self.create(config([scope(freshness=None)]))
        self.seed_attempt(ledger)
        self.apply(ledger, finish(), verify())
        counts = self.scope_report(ledger, 1000)["counts"]
        self.assertIsNone(counts["stale"])
        self.assertIsNone(counts["fresh_verified"])
        self.assertEqual(counts["freshness_unknown"], 1)

    def test_started_attempt_survives_reopen_as_in_flight_until_explicit_recovery(self):
        ledger, path, spec = self.create()
        self.seed_attempt(ledger)
        ledger.close()
        ledger = self.reopen(path, spec)
        counts = self.scope_report(ledger)["counts"]
        self.assertEqual((counts["attempted"], counts["attempts_total"], counts["in_flight"]),
                         (1, 1, 1))
        queue = self.scope_report(ledger)["resume_queue"]
        self.assertEqual((queue[0]["action"], queue[0]["reason"]),
                         ("reconcile_in_flight", "outcome_unknown_until_recorded"))
        self.assertEqual(self.item(ledger)["active_attempt_id"], "attempt-a")
        self.apply(ledger, event("recover", seconds=20, attempt_id="attempt-a",
                                 evidence=evidence("fixture:worker-exit"),
                                 retry={"mode": "automatic", "after": stamp(30)}))
        recovered = self.item(ledger)
        self.assertIsNone(recovered["active_attempt_id"])
        self.assertEqual(recovered["attempts"][0]["status"], "interrupted")
        self.assertEqual(recovered["retry"]["reason"], "interrupted_outcome_unknown")
        with self.assertRaises(coverage.ContractError):
            self.apply(ledger, finish(seconds=21))
        with self.assertRaises(coverage.ContractError):
            self.apply(ledger, start(attempt_id="attempt-retry", seconds=29))
        self.apply(ledger, start(attempt_id="attempt-retry", seconds=30),
                   finish(attempt_id="attempt-retry", seconds=30))
        counts = self.scope_report(ledger, 30)["counts"]
        self.assertEqual((counts["discovered"], counts["attempted"], counts["attempts_total"]),
                         (1, 1, 2))
        self.assertEqual((counts["unavailable_attempts_total"],
                          counts["interrupted_attempts_total"]), (0, 1))

    def test_budget_does_not_reset_when_interrupted_run_reopens(self):
        ledger, path, spec = self.create(config(budget=1))
        self.seed_attempt(ledger)
        self.apply(ledger, event("recover", seconds=20, attempt_id="attempt-a",
                                 evidence=evidence("fixture:worker-exit"),
                                 retry={"mode": "automatic", "after": stamp(20)}))
        ledger.close()
        ledger = self.reopen(path, spec)
        self.assertEqual(ledger.report(stamp(20))["attempt_budget_remaining"], 0)
        queue = self.scope_report(ledger, 20)["resume_queue"]
        self.assertEqual((queue[0]["action"], queue[0]["reason"]),
                         ("blocked_budget", "attempt_budget_exhausted"))
        with self.assertRaises(coverage.ContractError):
            self.apply(ledger, start(attempt_id="attempt-retry", seconds=20))
        self.assertEqual(self.scope_report(ledger, 20)["counts"]["attempts_total"], 1)

    def test_rate_limit_pause_survives_reopen_and_blocks_sibling_source(self):
        spec = config([scope("source-a", host="shared.test"),
                       scope("source-b", host="shared.test")])
        ledger, path, spec = self.create(spec)
        self.seed_attempt(ledger)
        self.apply(ledger, finish(outcome="unavailable", reason="http_rate_limited",
                                  retry={"mode": "automatic", "after": stamp(30)}),
                   discover(scope_id="source-b"))
        pauses = ledger.report(stamp(10))["host_pauses"]
        self.assertTrue(pauses)
        ledger.close()
        ledger = self.reopen(path, spec)
        self.assertEqual(ledger.report(stamp(20))["host_pauses"], pauses)
        queue = self.scope_report(ledger, 20, "source-b")["resume_queue"]
        self.assertEqual((queue[0]["action"], queue[0]["reason"]),
                         ("wait_for_host", "http_rate_limited"))
        with self.assertRaises(coverage.ContractError):
            self.apply(ledger, start(attempt_id="other-source", scope_id="source-b", seconds=29))
        self.apply(ledger, start(attempt_id="other-source", scope_id="source-b", seconds=30))
        self.assertEqual(self.scope_report(ledger, 30, "source-b")["counts"]["attempted"], 1)

    def test_second_rate_limit_cannot_shorten_existing_host_pause(self):
        ledger, _, _ = self.create()
        self.apply(ledger, discover(), start(), discover(entity_id="startup:beta"),
                   start(attempt_id="attempt-b", entity_id="startup:beta"))
        self.apply(ledger, finish(outcome="unavailable", reason="http_rate_limited",
                                  retry={"mode": "automatic", "after": stamp(40)}),
                   finish(attempt_id="attempt-b", entity_id="startup:beta", seconds=20,
                          outcome="unavailable", reason="http_rate_limited",
                          retry={"mode": "automatic", "after": stamp(30)}))
        with self.assertRaises(coverage.ContractError):
            self.apply(ledger, start(attempt_id="retry-b", entity_id="startup:beta", seconds=30))
        self.apply(ledger, start(attempt_id="retry-b", entity_id="startup:beta", seconds=40))

    def test_manual_failure_cannot_be_silently_retried(self):
        ledger, _, _ = self.create()
        self.seed_attempt(ledger)
        with self.assertRaises(coverage.ContractError):
            self.apply(ledger, finish(outcome="unavailable", reason="access_blocked",
                                      retry={"mode": "automatic", "after": stamp(20)}))
        self.apply(ledger, finish(outcome="unavailable", reason="access_blocked",
                                  retry={"mode": "manual", "after": None}))
        with self.assertRaises(coverage.ContractError):
            self.apply(ledger, start(attempt_id="unapproved-retry", seconds=20))
        self.assertEqual(self.scope_report(ledger, 20)["counts"]["manual_review"], 1)
        queue = self.scope_report(ledger, 20)["resume_queue"]
        self.assertEqual((queue[0]["action"], queue[0]["reason"]),
                         ("manual_review", "access_blocked"))
        self.apply(ledger, event("requeue", seconds=20, reason="manual_review",
                                 retry={"mode": "automatic", "after": stamp(20)},
                                 evidence=evidence("fixture:explicit-review-decision")),
                   start(attempt_id="reviewed-retry", seconds=20))

    def test_attempt_ids_are_unique_across_items_and_sources(self):
        ledger, _, _ = self.create()
        self.seed_attempt(ledger)
        self.apply(ledger, finish(), discover(entity_id="startup:beta"))
        with self.assertRaises(coverage.ContractError):
            self.apply(ledger, start(entity_id="startup:beta"))
        self.assertEqual(self.scope_report(ledger)["counts"]["attempts_total"], 1)

    def test_reopening_rejects_configuration_or_revision_drift(self):
        ledger, path, spec = self.create()
        changes = []
        for field, value in (("catalogue_revision", "c" * 40),
                             ("attempt_budget", 100), ("snapshot_kind", "committed")):
            changed = deepcopy(spec)
            changed[field] = value
            changes.append(changed)
        for field, value in (("parser_version", "fixture-parser/2"),
                             ("source_revision", "c" * 64),
                             ("temporal_scope", "fixture:another-pass")):
            changed = deepcopy(spec)
            changed["scopes"][0][field] = value
            changes.append(changed)
        for changed in changes:
            with self.subTest(spec=changed):
                with self.assertRaises(coverage.ContractError):
                    coverage.Ledger.open(path, changed)
        self.assertEqual(ledger.snapshot()["sequence"], 0)

    def test_population_order_is_canonical_but_duplicates_are_rejected(self):
        spec = config([scope("z", ("startup:beta", "startup:alpha")), scope("a")])
        ledger, path, spec = self.create(spec)
        reordered = deepcopy(spec)
        reordered["scopes"].reverse()
        for row in reordered["scopes"]:
            row["population"]["eligible_ids"].reverse()
        reopened = self.reopen(path, reordered)
        self.assertEqual(reopened.snapshot(), ledger.snapshot())
        duplicate = config([scope(ids=("startup:alpha", "startup:alpha"))])
        with self.assertRaises(coverage.ContractError):
            coverage.Ledger.create(self.directory / "duplicate.sqlite", duplicate)

    def test_one_source_cannot_use_different_hosts_in_different_dimensions(self):
        first = scope("source-a", host="one.test")
        second = scope("source-b", host="two.test")
        second["source_id"] = first["source_id"]
        second["dimension"] = "headcount"
        spec = config([first, second])
        with self.assertRaisesRegex(coverage.ContractError, "source id.*different host"):
            coverage.Ledger.create(self.directory / "changed-host.sqlite", spec)
        same_host = deepcopy(spec)
        same_host["scopes"][1]["host"] = "one.test"
        ledger, _, _ = self.create(same_host)
        self.assertEqual(len(ledger.report(stamp())["scopes"]), 2)

    def test_invalid_population_and_typed_inputs_are_rejected(self):
        invalid = []
        unknown_with_ids = config([scope(ids=None)])
        unknown_with_ids["scopes"][0]["population"]["eligible_ids"] = []
        invalid.append(unknown_with_ids)
        invalid.append(config(budget=True))
        extra = config()
        extra["unexpected"] = "not silently ignored"
        invalid.append(extra)
        bad_time = config()
        bad_time["created_at"] = "2026-11-18T00:00:00+00:00"
        invalid.append(bad_time)
        for index, spec in enumerate(invalid):
            with self.subTest(index=index):
                with self.assertRaises(coverage.ContractError):
                    coverage.Ledger.create(self.directory / ("bad-%d.sqlite" % index), spec)

    def test_unknown_event_fields_and_bad_evidence_fail_without_changes(self):
        ledger, _, _ = self.create()
        for row in (
            {**discover(), "verified": True},
            {**discover(), "evidence": {"ref": "fixture:bad", "sha256": "wrong"}},
            {**discover(), "at": "2026-11-18"},
        ):
            with self.subTest(row=row):
                with self.assertRaises(coverage.ContractError):
                    ledger.apply("bad-event", 0, [row], stamp(10))
                self.assertEqual(ledger.snapshot()["sequence"], 0)

    def test_future_or_retrograde_recording_time_is_rejected(self):
        ledger, _, _ = self.create()
        with self.assertRaises(coverage.ContractError):
            ledger.apply("future-event", 0, [discover(seconds=11)], stamp(10))
        self.apply(ledger, discover())
        with self.assertRaises(coverage.ContractError):
            self.apply(ledger, discover(seconds=9))
        with self.assertRaises(coverage.ContractError):
            ledger.report(stamp(9))

    def test_snapshot_and_report_cannot_mutate_persisted_state(self):
        ledger, _, _ = self.create()
        self.apply(ledger, discover())
        original = ledger.snapshot()
        copy = ledger.snapshot()
        copy["state"]["scopes"]["source-a"]["items"].clear()
        copy["config"]["scopes"].clear()
        report = ledger.report(stamp(10))
        report["scopes"][0]["counts"]["discovered"] = 999
        self.assertEqual(ledger.snapshot(), original)
        self.assertEqual(self.scope_report(ledger)["counts"]["discovered"], 1)

    def test_creation_does_not_overwrite_and_open_does_not_create(self):
        ledger, path, spec = self.create()
        self.apply(ledger, discover())
        before = ledger.snapshot()
        with self.assertRaises((coverage.ContractError, FileExistsError)):
            coverage.Ledger.create(path, spec)
        self.assertEqual(ledger.snapshot(), before)
        missing = self.directory / "missing.sqlite"
        with self.assertRaises((coverage.ContractError, FileNotFoundError)):
            coverage.Ledger.open(missing, spec)
        self.assertFalse(missing.exists())

    def test_unsupported_database_version_and_corruption_fail_closed(self):
        ledger, path, spec = self.create()
        ledger.close()
        with sqlite3.connect(path) as connection:
            connection.execute("PRAGMA user_version = 999")
        with self.assertRaises(coverage.ContractError):
            coverage.Ledger.open(path, spec)
        corrupt = self.directory / "corrupt.sqlite"
        corrupt.write_bytes(b"Synthetic corrupt database; not operational data")
        with self.assertRaises((coverage.ContractError, sqlite3.DatabaseError)):
            coverage.Ledger.open(corrupt, spec)

    def test_changed_journal_payload_without_matching_fingerprint_rejects_reopen(self):
        ledger, path, spec = self.create()
        self.apply(ledger, discover(), batch_id="original")
        ledger.close()
        with sqlite3.connect(path) as connection:
            connection.execute("UPDATE batches SET payload = payload || ' ' WHERE batch_id = ?",
                               ("original",))
        with self.assertRaisesRegex(coverage.ContractError, "journal payload digest mismatch"):
            coverage.Ledger.open(path, spec)

    def crash_apply(self, path, spec, phase, events):
        script = r'''
import json
import os
from pathlib import Path
import sqlite3
import sys
sys.path.insert(0, sys.argv[1])
import collection_coverage as coverage
phase = sys.argv[4]
connect = sqlite3.connect
class CrashConnection(sqlite3.Connection):
    def commit(self):
        if phase == "after":
            super().commit()
        os._exit(73)
coverage.sqlite3.connect = lambda *a, **kw: connect(*a, factory=CrashConnection, **kw)
ledger = coverage.Ledger.open(Path(sys.argv[2]), json.loads(sys.argv[3]))
ledger.apply("crash-batch", 1, json.loads(sys.argv[5]), sys.argv[6])
raise AssertionError("Expected termination at commit boundary")
'''
        result = subprocess.run(
            [sys.executable, "-c", script, str(ROOT / "scripts"), str(path),
             json.dumps(spec), phase, json.dumps(events), stamp(20)],
            capture_output=True, text=True, timeout=15,
        )
        self.assertEqual(result.returncode, 73, result.stderr)
        self.assertEqual(result.stdout, "")

    def crash_fixture(self):
        spec = config([scope(ids=("startup:alpha",))])
        ledger, path, spec = self.create(spec)
        self.apply(ledger, discover(), start(), checkpoint(), batch_id="seed")
        events = [finish(seconds=20), verify(seconds=20),
                  checkpoint(status="complete", cursor=None, reason=None, seconds=20)]
        return ledger, path, spec, events

    def test_process_crash_before_commit_rolls_back_result_review_and_cursor(self):
        ledger, path, spec, events = self.crash_fixture()
        before = ledger.snapshot()
        ledger.close()
        self.crash_apply(path, spec, "before", events)
        ledger = self.reopen(path, spec)
        self.assertEqual(ledger.snapshot(), before)
        self.assertEqual(self.item(ledger)["attempts"][0]["status"], "in_flight")
        self.assertIsNone(self.item(ledger)["last_verification"])
        self.assertEqual(self.scope_report(ledger, 20)["checkpoint"]["cursor"],
                         "fixture:page-two")
        replay = ledger.apply("crash-batch", 1, events, stamp(20))
        self.assertEqual(replay, {"sequence": 2, "replayed": False})

    def test_process_crash_after_commit_replays_without_duplicate_outcome(self):
        ledger, path, spec, events = self.crash_fixture()
        ledger.close()
        self.crash_apply(path, spec, "after", events)
        ledger = self.reopen(path, spec)
        before = ledger.snapshot()
        self.assertEqual(before["sequence"], 2)
        self.assertEqual(self.scope_report(ledger, 20)["completion"], "complete")
        self.assertEqual(self.scope_report(ledger, 20)["counts"]["verified"], 1)
        replay = ledger.apply("crash-batch", 1, events, stamp(20))
        self.assertEqual(replay, {"sequence": 2, "replayed": True})
        self.assertEqual(ledger.snapshot(), before)
        self.assertEqual(self.scope_report(ledger, 20)["counts"]["attempts_total"], 1)

        control, _, _ = self.create(spec, name="uninterrupted.sqlite")
        control.apply("seed", 0, [discover(), start(), checkpoint()], stamp(10))
        control.apply("crash-batch", 1, events, stamp(20))
        self.assertEqual(ledger.report(stamp(20)), control.report(stamp(20)))


if __name__ == "__main__":
    unittest.main()
