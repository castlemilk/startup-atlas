"""Offline regression tests for the operational receipt proposal.

All revisions, events, owners and outcomes here are synthetic. CLI subprocesses
invoke only the local report reader; no browser, network or Git command is run.
"""

import ast
from copy import deepcopy
import hashlib
import importlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from fixtures import (  # noqa: E402
    AS_OF, AT, BASE, CHECKOUT, LATER, OLD, OTHER, SOURCE,
    event, receipt, source_ready_receipt,
)


class ReportContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.report = importlib.import_module("report")

    def build(self, value=None, **kwargs):
        return self.report.build_report(value if value is not None else receipt(), AS_OF, **kwargs)

    def target(self, result):
        return result["targets"][0]

    def assert_state(self, assessment, state):
        self.assertEqual(assessment["state"], state, assessment)
        self.assertIsInstance(assessment["reason"], str)
        self.assertTrue(assessment["reason"])
        self.assertIsInstance(assessment["evidence_ids"], list)

    def test_empty_evidence_is_unknown_and_authorizes_nothing(self):
        result = self.build()
        self.assert_state(result["source_ready"], "unknown")
        self.assert_state(result["review"], "unknown")
        self.assert_state(result["source_checks"]["unit"], "unknown")
        self.assert_state(result["ci"]["pages.yml"], "unknown")
        self.assert_state(result["merged"], "unknown")
        self.assert_state(self.target(result)["deployment"], "unknown")
        self.assert_state(self.target(result)["verification"]["graph"], "unknown")
        self.assertEqual(result["capabilities"]["state"], "unavailable")
        self.assertIs(result["authorizes_actions"], False)

    def test_source_ready_is_exact_head_source_only(self):
        result = self.build(source_ready_receipt())
        self.assert_state(result["source_ready"], "established")
        self.assert_state(result["ci"]["pages.yml"], "unknown")
        self.assert_state(result["merged"], "unknown")
        self.assert_state(self.target(result)["deployment"], "unknown")

    def test_new_source_does_not_inherit_old_review_or_checks(self):
        value = source_ready_receipt()
        value["source"]["head"] = OTHER
        result = self.build(value)
        self.assert_state(result["review"], "mismatch")
        self.assert_state(result["source_checks"]["unit"], "mismatch")
        self.assertNotEqual(result["source_ready"]["state"], "established")
        self.assertEqual(result["history"], value["history"])

    def test_later_other_head_review_does_not_fall_back_to_old_approval(self):
        value = source_ready_receipt()
        value["history"].append(event("review", "review-b", source_head=OTHER, at=LATER))
        self.assert_state(self.build(value)["review"], "mismatch")

    def test_failed_check_prevents_source_ready(self):
        value = source_ready_receipt()
        value["history"][1]["conclusion"] = "failure"
        result = self.build(value)
        self.assert_state(result["source_checks"]["unit"], "failed")
        self.assertNotEqual(result["source_ready"]["state"], "established")

    def test_direct_checkout_ci_established(self):
        value = receipt()
        value["history"] = [event("ci", "ci-a")]
        self.assert_state(self.build(value)["ci"]["pages.yml"], "established")

    def test_explicit_pr_merge_checkout_preserves_both_shas(self):
        value = receipt()
        observed = event("ci", "ci-merge", checkout_head=CHECKOUT, association={
            "source_head": SOURCE, "base_head": BASE, "checkout_head": CHECKOUT,
            "evidence_ref": "fixture:merge-parents",
        })
        value["history"] = [observed]
        result = self.build(value)
        self.assert_state(result["ci"]["pages.yml"], "established")
        self.assertEqual(result["history"][0]["run_head"], SOURCE)
        self.assertEqual(result["history"][0]["checkout_head"], CHECKOUT)

    def test_unassociated_checkout_cannot_satisfy_ci(self):
        value = receipt()
        value["history"] = [event("ci", "ci-unbound", checkout_head=CHECKOUT)]
        self.assertNotEqual(self.build(value)["ci"]["pages.yml"]["state"], "established")

    def test_wrong_pr_merge_source_association_cannot_satisfy_ci(self):
        value = receipt()
        value["history"] = [event("ci", "ci-wrong-binding", checkout_head=CHECKOUT, association={
            "source_head": OTHER, "base_head": BASE, "checkout_head": CHECKOUT,
            "evidence_ref": "fixture:wrong-merge-parents",
        })]
        self.assertNotEqual(self.build(value)["ci"]["pages.yml"]["state"], "established")

    def test_missing_checkout_is_not_exact_checkout_evidence(self):
        value = receipt()
        value["history"] = [event("ci", "ci-no-checkout", checkout_head=None)]
        self.assertNotEqual(self.build(value)["ci"]["pages.yml"]["state"], "established")

    def test_direct_checkout_does_not_ignore_contradictory_association(self):
        for binding in (
            {"source_head": OTHER, "base_head": BASE, "checkout_head": SOURCE},
            {"source_head": SOURCE, "base_head": BASE, "checkout_head": OTHER},
            {"source_head": SOURCE, "base_head": SOURCE, "checkout_head": SOURCE},
        ):
            with self.subTest(binding=binding):
                value = receipt()
                value["history"] = [event("ci", "contradictory-direct", association={
                    **binding, "evidence_ref": "fixture:contradictory-association",
                })]
                self.assert_state(self.build(value)["ci"]["pages.yml"], "mismatch")

    def test_success_at_other_ci_head_is_mismatch(self):
        value = receipt()
        value["history"] = [event("ci", "ci-other", run_head=OTHER, checkout_head=OTHER)]
        self.assert_state(self.build(value)["ci"]["pages.yml"], "mismatch")

    def test_failed_rerun_cannot_be_hidden_by_older_green_attempt(self):
        value = receipt()
        value["history"] = [
            event("ci", "attempt-1"),
            event("ci", "attempt-2", attempt=2, conclusion="failure", at=LATER,
                  jobs=[{"name": "build", "conclusion": "failure"}]),
        ]
        result = self.build(value)
        self.assert_state(result["ci"]["pages.yml"], "failed")
        self.assertIn("attempt-2", result["ci"]["pages.yml"]["evidence_ids"])
        self.assertEqual(len(result["history"]), 2)

    def test_required_skipped_job_is_partial_even_with_green_aggregate(self):
        value = receipt()
        value["policy"]["ci"][0]["jobs"].append("publish")
        value["history"] = [event("ci", "ci-partial", jobs=[
            {"name": "build", "conclusion": "success"},
            {"name": "publish", "conclusion": "skipped"},
        ])]
        result = self.build(value)
        self.assert_state(result["ci"]["pages.yml"], "partial")
        self.assert_state(self.target(result)["deployment"], "unknown")

    def test_required_missing_job_does_not_satisfy_ci(self):
        value = receipt()
        value["policy"]["ci"][0]["jobs"].append("publication-verification")
        value["history"] = [event("ci", "ci-incomplete")]
        self.assert_state(self.build(value)["ci"]["pages.yml"], "partial")

    def test_merged_fact_does_not_expire_or_establish_deployment(self):
        value = receipt()
        value["history"] = [event("merge", "merged-old", at=OLD)]
        result = self.build(value)
        self.assert_state(result["merged"], "established")
        self.assert_state(self.target(result)["deployment"], "unknown")

    def test_exact_merge_commit_is_recognized_without_ancestry_guessing(self):
        value = receipt()
        value["source"]["head"] = CHECKOUT
        value["history"] = [event("merge", "merged-exact")]
        self.assert_state(self.build(value)["merged"], "established")
        value["source"]["head"] = OTHER
        self.assertNotEqual(self.build(value)["merged"]["state"], "established")

    def test_merge_into_other_target_does_not_establish_declared_target(self):
        value = receipt()
        value["history"] = [event("merge", "merged-staging", base_ref="staging")]
        result = self.build(value)
        self.assert_state(result["merged"], "mismatch")
        self.assertEqual(result["history"], value["history"])

    def test_deployment_failure_preserves_last_success_without_claiming_rollback(self):
        value = receipt()
        previous = event("deployment", "deploy-old", revision=OTHER, at=OLD)
        failed = event("deployment", "deploy-new-failed", conclusion="failure", at=LATER)
        value["history"] = [previous, failed]
        result = self.build(value)
        deployment = self.target(result)["deployment"]
        self.assert_state(deployment, "failed")
        self.assertEqual(deployment["latest"], failed)
        self.assertEqual(deployment["last_known_success"], previous)
        self.assert_state(self.target(result)["verification"]["graph"], "unknown")

    def test_deployment_success_and_verification_failure_remain_separate(self):
        value = receipt()
        value["history"] = [event("deployment", "deployed"), event(
            "verification", "verify-failed", conclusion="failure", at=LATER,
        )]
        result = self.build(value)
        self.assert_state(self.target(result)["deployment"], "established")
        self.assert_state(self.target(result)["verification"]["graph"], "failed")

    def test_preview_success_does_not_establish_production_deployment(self):
        value = receipt()
        value["history"] = [event("deployment", "preview", environment="preview")]
        self.assert_state(self.target(self.build(value))["deployment"], "unknown")

    def test_pages_success_does_not_establish_mcp_deployment(self):
        value = receipt()
        value["policy"]["targets"].append({
            "surface": "private-mcp", "environment": "production", "verification_scopes": ["read"],
        })
        value["history"] = [event("deployment", "pages-only")]
        result = self.build(value)
        mcp = next(item for item in result["targets"] if item["surface"] == "private-mcp")
        self.assert_state(mcp["deployment"], "unknown")

    def test_offline_verification_does_not_establish_served_behavior(self):
        value = receipt()
        value["history"] = [event("verification", "offline", mode="offline")]
        self.assertNotEqual(self.target(self.build(value))["verification"]["graph"]["state"], "established")

    def test_offline_failure_does_not_assert_served_failure(self):
        value = receipt()
        value["history"] = [event("verification", "offline-failed", mode="offline", conclusion="failure")]
        result = self.build(value)
        self.assert_state(self.target(result)["verification"]["graph"], "unknown")
        self.assertEqual(result["history"][0]["conclusion"], "failure")

    def test_verification_requires_exact_revision(self):
        value = receipt()
        value["history"] = [event("verification", "wrong-revision", revision=OTHER)]
        self.assert_state(self.target(self.build(value))["verification"]["graph"], "mismatch")

    def test_stale_verification_keeps_original_historical_success(self):
        value = receipt()
        value["history"] = [event("verification", "historical-ci", at=OLD, mode="recorded_ci")]
        result = self.build(value)
        self.assert_state(self.target(result)["verification"]["graph"], "stale")
        self.assertEqual(result["history"], value["history"])
        self.assertEqual(result["history"][0]["at"], OLD)

    def test_expiry_upper_bound_is_exclusive(self):
        value = receipt()
        value["history"] = [event("verification", "expiry")]
        just_before = self.report.build_report(value, "2026-11-18T10:59:59Z")
        at_expiry = self.report.build_report(value, "2026-11-18T11:00:00Z")
        self.assert_state(self.target(just_before)["verification"]["graph"], "established")
        self.assert_state(self.target(at_expiry)["verification"]["graph"], "stale")
        self.assertEqual(at_expiry["source"]["freshness"], "stale")

    def test_maximum_representable_date_freshness_does_not_overflow(self):
        value = receipt()
        value["source"]["observed_at"] = "9999-12-31T23:59:59Z"
        value["history"] = [event("verification", "date-max", at="9999-12-31T23:59:59Z")]
        result = self.report.build_report(value, "9999-12-31T23:59:59.500000Z")
        self.assertEqual(result["source"]["freshness"], "fresh")
        self.assert_state(self.target(result)["verification"]["graph"], "established")

    def test_invalid_timezone_minutes_and_utc_normalization_boundaries_raise_value_error(self):
        invalid = (
            "0001-01-01T00:00:00+00:01",
            "9999-12-31T23:59:59-00:01",
            "2026-11-18T10:00:00+00:99",
        )
        for timestamp in invalid:
            with self.subTest(timestamp=timestamp, field="as_of"):
                with self.assertRaises(ValueError):
                    self.report.build_report(receipt(), timestamp)
            with self.subTest(timestamp=timestamp, field="source.observed_at"):
                value = receipt()
                value["source"]["observed_at"] = timestamp
                with self.assertRaises(ValueError):
                    self.report.build_report(value, "9999-12-31T23:59:59.999999Z")

    def test_freshness_budget_above_one_year_is_invalid(self):
        value = receipt()
        value["policy"]["fresh_for_seconds"] = 31_536_001
        with self.assertRaises(ValueError):
            self.build(value)

    def test_later_deployment_supersedes_unexpired_live_verification(self):
        value = receipt()
        value["history"] = [
            event("verification", "previous-read"),
            event("deployment", "different-revision", revision=OTHER, at=LATER),
        ]
        before = deepcopy(value)
        result = self.build(value)
        self.assert_state(self.target(result)["verification"]["graph"], "stale")
        self.assertEqual(result["history"], before["history"])
        self.assertEqual(value, before)

    def test_later_uncertain_deployment_activity_requires_readback(self):
        for conclusion in ("failure", "cancelled", "pending", "unknown"):
            with self.subTest(conclusion=conclusion):
                value = receipt()
                value["history"] = [
                    event("verification", "previous-read"),
                    event("deployment", "later-attempt", conclusion=conclusion, at=LATER),
                ]
                result = self.build(value)
                self.assert_state(self.target(result)["verification"]["graph"], "stale")
                self.assertEqual(result["history"], value["history"])

    def test_same_time_deployment_requires_subsequent_readback(self):
        value = receipt()
        value["history"] = [event("verification", "same-time-read"), event("deployment", "same-time-deploy")]
        self.assert_state(self.target(self.build(value))["verification"]["graph"], "stale")

    def test_skipped_deployment_does_not_invalidate_live_verification(self):
        value = receipt()
        value["history"] = [
            event("verification", "previous-read"),
            event("deployment", "skipped", conclusion="skipped", at=LATER),
        ]
        self.assert_state(self.target(self.build(value))["verification"]["graph"], "established")

    def test_subsequent_readback_restores_scoped_verification(self):
        value = receipt()
        value["history"] = [
            event("verification", "old-read", at=OLD),
            event("deployment", "attempt", conclusion="failure"),
            event("verification", "fresh-read", at=LATER),
        ]
        result = self.build(value)
        self.assert_state(self.target(result)["deployment"], "failed")
        self.assert_state(self.target(result)["verification"]["graph"], "established")

    def test_source_freshness_does_not_erase_immutable_events(self):
        value = source_ready_receipt()
        value["source"]["observed_at"] = OLD
        value["history"].append(event("deployment", "old-deploy", at=OLD))
        result = self.build(value)
        self.assertEqual(result["source"]["freshness"], "stale")
        self.assert_state(result["review"], "established")
        self.assert_state(self.target(result)["deployment"], "established")

    def test_partial_verification_scopes_do_not_collapse_to_global_success(self):
        value = receipt()
        value["policy"]["targets"][0]["verification_scopes"] = ["graph", "search"]
        value["history"] = [event("verification", "graph-ok")]
        result = self.build(value)
        checks = self.target(result)["verification"]
        self.assert_state(checks["graph"], "established")
        self.assert_state(checks["search"], "unknown")

    def test_equal_time_competing_observations_are_conflict(self):
        value = receipt()
        value["history"] = [event("review", "first"), event("review", "second", conclusion="changes_requested")]
        self.assert_state(self.build(value)["review"], "conflict")

    def test_input_order_does_not_select_older_evidence(self):
        value = source_ready_receipt()
        value["history"].append(event("review", "newer-failed", at=LATER, conclusion="changes_requested"))
        reversed_value = deepcopy(value)
        reversed_value["history"].reverse()
        forward = self.build(value)
        backward = self.build(reversed_value)
        self.assertEqual(forward["review"], backward["review"])
        self.assertEqual(forward["source_ready"], backward["source_ready"])
        self.assertEqual(forward["history"], value["history"])
        self.assertEqual(backward["history"], reversed_value["history"])

    def test_inputs_are_immutable_and_repeated_report_is_deterministic(self):
        value = source_ready_receipt()
        before = deepcopy(value)
        first = self.build(value)
        second = self.build(value)
        self.assertEqual(value, before)
        self.assertEqual(first, second)
        self.assertEqual(self.report.render_markdown(first), self.report.render_markdown(second))
        first["history"][0]["reviewer"] = "Changed output only"
        self.assertEqual(value, before)

    def test_future_source_and_event_times_are_invalid(self):
        value = receipt()
        value["source"]["observed_at"] = "2026-11-18T11:00:00Z"
        with self.assertRaises(ValueError):
            self.build(value)
        value = receipt()
        value["history"] = [event("review", "future", at="2026-11-18T11:00:00Z")]
        with self.assertRaises(ValueError):
            self.build(value)

    def test_naive_as_of_is_invalid(self):
        with self.assertRaises(ValueError):
            self.report.build_report(receipt(), "2026-11-18T10:30:00")

    def test_duplicate_ids_and_unknown_fields_are_rejected(self):
        value = receipt()
        value["history"] = [event("review", "duplicate"), event("source_check", "duplicate")]
        with self.assertRaises(ValueError):
            self.build(value)
        value = receipt()
        value["inferred_capabilities"] = ["invented"]
        with self.assertRaises(ValueError):
            self.build(value)

    def test_invalid_revision_and_missing_or_empty_outcomes_are_rejected(self):
        for sha in ("1234567", "A" * 40, "g" * 40, None):
            with self.subTest(sha=sha):
                value = receipt()
                value["source"]["head"] = sha
                with self.assertRaises(ValueError):
                    self.build(value)
        for outcome in (None, "", "passed", True):
            with self.subTest(outcome=outcome):
                value = receipt()
                value["history"] = [event("source_check", "invalid", conclusion=outcome)]
                with self.assertRaises(ValueError):
                    self.build(value)
        value = receipt()
        value["history"] = [event("ci", "missing")]
        del value["history"][0]["conclusion"]
        with self.assertRaises(ValueError):
            self.build(value)

    def manifest_reference(self, value, raw=b'{"synthetic":true}'):
        value["capability_manifest"]["artifact"] = {
            "reference": "fixture:lane-4-document",
            "sha256": hashlib.sha256(raw).hexdigest(),
            "schema_version": "synthetic-v1",
        }
        value["capability_manifest"]["unavailable_reason"] = None
        return raw

    def test_manifest_missing_is_unavailable_not_empty_catalogue(self):
        result = self.build()
        self.assertEqual(result["capabilities"]["state"], "unavailable")
        self.assertIsNone(result["capabilities"].get("projection"))

    def test_manifest_bytes_missing_and_consumer_pending_remain_unavailable(self):
        value = receipt()
        raw = self.manifest_reference(value)
        missing = self.build(value)
        self.assertEqual(missing["capabilities"]["state"], "unavailable")
        pending = self.build(value, manifest_bytes=raw)
        self.assertEqual(pending["capabilities"]["state"], "unavailable")
        self.assertEqual(pending["capabilities"]["reason"], "capability_consumer_contract_pending")

    def test_digest_mismatch_never_calls_consumer(self):
        value = receipt()
        self.manifest_reference(value)
        def forbidden_consumer(*args):
            self.fail("digest-mismatched bytes reached capability consumer")
        result = self.build(value, manifest_bytes=b"wrong", capability_consumer=forbidden_consumer)
        self.assertEqual(result["capabilities"]["state"], "digest_mismatch")

    def test_consumer_receives_exact_bytes_version_clock_and_projection_is_unchanged(self):
        value = receipt()
        raw = self.manifest_reference(value, b'{ "synthetic" : true }\n')
        projection = {
            "source_revision": SOURCE,
            "runtime_revision": OTHER,
            "graph_revision": CHECKOUT,
            "verified_read": {"state": "established", "scope": "fixture-read"},
            "verified_write": {"state": "blocked", "reason": "synthetic-hold"},
        }
        calls = []
        def consumer(*args):
            calls.append(args)
            return deepcopy(projection)
        result = self.build(value, manifest_bytes=raw, capability_consumer=consumer)
        self.assertEqual(calls, [(raw, "synthetic-v1", AS_OF)])
        self.assertEqual(result["capabilities"]["state"], "consumed")
        self.assertEqual(result["capabilities"]["projection"], projection)

    def test_consumer_rejection_is_contained_without_fabricated_capabilities(self):
        value = receipt()
        raw = self.manifest_reference(value)
        def reject(*args):
            raise ValueError("unsupported synthetic version")
        result = self.build(value, manifest_bytes=raw, capability_consumer=reject)
        self.assertEqual(result["capabilities"]["state"], "invalid")
        self.assertEqual(result["capabilities"]["reason"], "capability_consumer_rejected")
        self.assertIsNone(result["capabilities"].get("projection"))

    def test_markdown_escapes_untrusted_owner_and_reference_text(self):
        value = receipt()
        value["owner"]["name"] = "name|column\n# forged heading"
        value["source"]["evidence_ref"] = "[click](javascript:bad)"
        rendered = self.report.render_markdown(self.build(value))
        self.assertNotIn("name|column\n# forged heading", rendered)
        self.assertNotIn("[click](javascript:bad)", rendered)

    def test_report_has_no_network_subprocess_or_mutation_api_integration(self):
        tree = ast.parse((HERE / "report.py").read_text())
        forbidden_modules = {"socket", "urllib", "requests", "http", "aiohttp", "subprocess"}
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    self.assertNotIn(alias.name.split(".")[0], forbidden_modules)
            elif isinstance(node, ast.ImportFrom):
                self.assertNotIn((node.module or "").split(".")[0], forbidden_modules)
            elif isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
                self.assertNotIn(node.func.attr, {
                    "write_text", "write_bytes", "unlink", "rename", "system", "popen",
                })


class ReportCliTests(unittest.TestCase):
    def invoke(self, raw):
        with tempfile.TemporaryDirectory(prefix="atlas-receipt-cli-") as directory:
            path = Path(directory) / "input.json"
            path.write_text(raw)
            before = path.read_bytes()
            result = subprocess.run([
                sys.executable, str(HERE / "report.py"), str(path),
                "--as-of", AS_OF, "--format", "json",
            ], cwd=directory, text=True, capture_output=True, timeout=10)
            self.assertEqual(path.read_bytes(), before)
            self.assertEqual(sorted(item.name for item in Path(directory).iterdir()), ["input.json"])
            return result

    def test_valid_blocked_report_exits_zero_but_authorizes_nothing(self):
        result = self.invoke(json.dumps(receipt()))
        self.assertEqual(result.returncode, 0, result.stderr)
        document = json.loads(result.stdout)
        self.assertFalse(document["authorizes_actions"])
        self.assertEqual(document["source_ready"]["state"], "unknown")

    def test_invalid_receipt_exits_two_without_success_document(self):
        result = self.invoke('{"schema_version":1}')
        self.assertEqual(result.returncode, 2, result.stderr)
        self.assertEqual(result.stdout, "")

    def test_duplicate_json_keys_are_rejected(self):
        raw = json.dumps(receipt())
        raw = raw.replace('"schema_version": 1', '"schema_version": 1, "schema_version": 1', 1)
        result = self.invoke(raw)
        self.assertEqual(result.returncode, 2, result.stderr)
        self.assertEqual(result.stdout, "")

    def test_nonfinite_json_numbers_are_rejected(self):
        raw = json.dumps(receipt()).replace('"fresh_for_seconds": 3600', '"fresh_for_seconds": NaN')
        result = self.invoke(raw)
        self.assertEqual(result.returncode, 2, result.stderr)
        self.assertEqual(result.stdout, "")


if __name__ == "__main__":
    unittest.main()
