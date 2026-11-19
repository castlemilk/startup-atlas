"""Opt-in offline integration tests against the pinned lane 4 packet.

Run this file with --contract-root PATH, or set ATLAS_RECEIPT_CAPABILITY_ROOT.
Explicit invocation without a dependency fails with exit 2. Generic unittest
discovery without a configured dependency reports this class as skipped; it
does not count the integration as passed. No dependency files are copied or
modified. Node executes only local code already pinned by the bridge.
"""

import argparse
import base64
from copy import deepcopy
import hashlib
import importlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch


HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from fixtures import receipt  # noqa: E402


CONTRACT_ROOT = os.environ.get("ATLAS_RECEIPT_CAPABILITY_ROOT")
OBSERVED = "2026-11-18T07:07:20Z"
FRESH = "2026-11-18T07:30:00Z"
EXPIRED = "2026-11-18T08:07:20Z"
SOURCE_REVISION = "d7b7aa805be24fa1e2da50bf2882ab99a3aa4c4f"
OWNER_COMMIT = "6f76913b45f2b56ffdc3c14e15877319e155a52e"
VALIDATOR_SHA256 = "471e308cd2483632c7ad3354d81ff156632153fe9aec66742d8fa3ddfd3e62c1"


class CapabilityBridgeIntegrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if not CONTRACT_ROOT:
            raise unittest.SkipTest(
                "Capability integration NOT RUN: supply --contract-root or ATLAS_RECEIPT_CAPABILITY_ROOT"
            )
        cls.root = Path(CONTRACT_ROOT).resolve()
        cls.validator = cls.root / "validator.mjs"
        cls.cli = cls.root / "cli.mjs"
        cls.baseline = cls.root / "source-baseline.json"
        for path in (cls.validator, cls.cli, cls.baseline, cls.root / "evidence/connector-registry.json"):
            if not path.is_file():
                raise ValueError("Capability integration dependency missing: " + str(path))
        cls.bridge = importlib.import_module("with_capabilities")
        cls.report = importlib.import_module("report")
        cls.raw = cls.baseline.read_bytes()
        cls.registry = json.loads((cls.root / "evidence/connector-registry.json").read_text())
        cls.consumer = staticmethod(cls.bridge.canonical_consumer(cls.validator))

    def input_receipt(self, raw=None, version=None):
        value = receipt()
        value["repository"] = "castlemilk/startup-atlas"
        value["source"]["head"] = SOURCE_REVISION
        value["source"]["observed_at"] = OBSERVED
        value["source"]["evidence_ref"] = "fixture:dated-source-baseline"
        value["capability_manifest"] = {
            "owner_ref": "fixture:canonical-capability-owner",
            "artifact": {
                "reference": "source-baseline.json at owner commit " + OWNER_COMMIT,
                "sha256": hashlib.sha256(self.raw if raw is None else raw).hexdigest(),
                "schema_version": version or self.bridge.SCHEMA_VERSION,
            },
            "unavailable_reason": None,
        }
        return value

    def assess(self, raw=None, as_of=FRESH):
        raw = self.raw if raw is None else raw
        return self.report.build_report(
            self.input_receipt(raw), as_of,
            manifest_bytes=raw, capability_consumer=self.consumer,
        )

    def assert_runtime_unestablished(self, projection):
        self.assertIs(projection["authorizesActions"], False)
        for capability in projection["capabilities"]:
            self.assertEqual(capability["source"]["revision"], SOURCE_REVISION)
            self.assertIsNone(capability["runtimeId"])
            self.assertIsNone(capability["runtime"]["revision"])
            self.assertIsNone(capability["runtime"]["sourceRevision"])
            self.assertIsNone(capability["principal"])
            self.assertEqual(capability["parity"]["status"], "unknown")
            for facet in ("deployed", "authorized", "verified_read", "verified_write"):
                self.assertNotEqual(capability["facets"][facet]["effective"], "confirmed")

    def test_exact_owner_pin_is_the_supplied_validator(self):
        self.assertEqual(self.bridge.OWNER_COMMIT, OWNER_COMMIT)
        self.assertEqual(self.bridge.VALIDATOR_SHA256, VALIDATOR_SHA256)
        self.assertEqual(hashlib.sha256(self.validator.read_bytes()).hexdigest(), VALIDATOR_SHA256)

    def test_atlas_capabilities_cannot_be_attached_to_another_repository(self):
        value = self.input_receipt()
        value["repository"] = "unrelated/other-product"
        with patch.object(self.bridge.subprocess, "run") as run:
            result = self.report.build_report(
                value, FRESH, manifest_bytes=self.raw, capability_consumer=self.consumer,
            )
            run.assert_not_called()
        self.assertEqual(result["capabilities"]["state"], "invalid")
        self.assertEqual(result["capabilities"]["reason"], "capability_repository_mismatch")
        self.assertIsNone(result["capabilities"]["projection"])

    def test_wrong_validator_bytes_reject_before_any_process(self):
        with tempfile.TemporaryDirectory(prefix="atlas-capability-pin-") as directory:
            wrong = Path(directory) / "validator.mjs"
            wrong.write_text("// synthetic nonmatching validator; never execute\n")
            with patch.object(self.bridge.subprocess, "run") as run:
                with self.assertRaises(ValueError):
                    self.bridge.canonical_consumer(wrong)
                run.assert_not_called()

    def test_unsupported_reference_schema_is_invalid_before_execution(self):
        value = self.input_receipt(version="unsupported/synthetic-version")
        with patch.object(self.bridge.subprocess, "run") as run:
            result = self.report.build_report(
                value, FRESH, manifest_bytes=self.raw, capability_consumer=self.consumer,
            )
            run.assert_not_called()
        self.assertEqual(result["capabilities"]["state"], "invalid")
        self.assertEqual(result["capabilities"]["reason"], "capability_consumer_rejected")
        self.assertIsNone(result["capabilities"]["projection"])

    def test_dated_baseline_has_17_source_definitions_and_13_limited_registry_names(self):
        value = self.input_receipt()
        before = deepcopy(value)
        result = self.report.build_report(
            value, FRESH, manifest_bytes=self.raw, capability_consumer=self.consumer,
        )
        self.assertEqual(value, before)
        self.assertEqual(result["capabilities"]["state"], "consumed")
        projection = result["capabilities"]["projection"]
        self.assertIs(projection["valid"], True)
        self.assertEqual(projection["evidenceMode"], "observed")
        self.assertEqual(len(projection["capabilities"]), 17)
        for facet in ("implemented_in_source", "merged"):
            self.assertEqual(sum(
                c["facets"][facet]["effective"] == "confirmed"
                for c in projection["capabilities"]
            ), 17)
        discovered = {
            c["tool"] for c in projection["capabilities"]
            if c["facets"]["discovered"]["effective"] == "confirmed"
        }
        self.assertEqual(len(discovered), 13)
        self.assertEqual(discovered, set(self.registry["tools"]))
        self.assertFalse(self.registry["completeServerToolsList"])
        self.assert_runtime_unestablished(projection)

    def test_registry_observation_expires_exactly_at_deadline_without_runtime_promotion(self):
        result = self.assess(as_of=EXPIRED)
        projection = result["capabilities"]["projection"]
        self.assertIs(projection["valid"], True)
        discovered = [c["facets"]["discovered"] for c in projection["capabilities"]]
        self.assertEqual(sum(f["effective"] == "stale" for f in discovered), 13)
        self.assertEqual(sum(f["effective"] == "unknown" for f in discovered), 4)
        self.assertEqual(sum(f["effective"] == "confirmed" for f in discovered), 0)
        self.assertEqual(sum(
            c["facets"]["implemented_in_source"]["effective"] == "confirmed"
            for c in projection["capabilities"]
        ), 17)
        for facet in discovered:
            if facet["effective"] == "stale":
                self.assertIn("EVIDENCE_EXPIRED", facet["reasonCodes"])
                self.assertEqual(facet["evidence"][0]["observedAt"], OBSERVED)
        self.assert_runtime_unestablished(projection)

    def test_bridge_projection_equals_owner_cli_at_equivalent_millisecond_clock(self):
        node = shutil.which("node")
        self.assertIsNotNone(node)
        observed = subprocess.run([
            node, str(self.cli), "assess", str(self.baseline), "--now", "2026-11-18T07:30:00.000Z",
        ], text=True, capture_output=True, timeout=10, check=False, shell=False,
            env={"PATH": os.environ.get("PATH", "")})
        self.assertEqual(observed.returncode, 0, observed.stderr)
        expected = json.loads(observed.stdout)
        actual = self.assess()["capabilities"]["projection"]
        self.assertEqual(actual, expected)
        self.assertEqual(actual["assessedAt"], "2026-11-18T07:30:00.000Z")

    def test_malformed_and_duplicate_key_documents_yield_invalid_without_tool_names(self):
        for raw in (b"{broken", b'{"schemaVersion":"first","schemaVersion":"second"}'):
            with self.subTest(raw=raw):
                result = self.assess(raw=raw)
                self.assertEqual(result["capabilities"]["state"], "invalid")
                self.assertIsNone(result["capabilities"]["projection"])
                self.assertNotIn('"tool"', json.dumps(result["capabilities"]))

    def test_invalid_owner_assessment_remains_invalid_with_unchanged_diagnostics(self):
        malformed_schema = json.loads(self.raw)
        malformed_schema["schemaVersion"] = "synthetic-unsupported-internal-version"
        raw = json.dumps(malformed_schema).encode("utf-8")
        expected = self.consumer(raw, self.bridge.SCHEMA_VERSION, FRESH)
        self.assertIs(expected["valid"], False)
        self.assertTrue(any(error["path"] == "/schemaVersion" for error in expected["errors"]))
        result = self.assess(raw=raw)
        self.assertEqual(result["capabilities"]["state"], "invalid")
        self.assertEqual(result["capabilities"]["projection"], expected)
        rendered = self.report.render_markdown(result)
        self.assertNotIn("| Tool / transport | Discovery |", rendered)
        self.assertIn("<pre>", rendered)
        self.assertIn("&quot;valid&quot;: false", rendered)

    def test_node_options_and_credentials_are_not_inherited(self):
        projection = {"authorizesActions": False, "valid": True, "capabilities": []}
        result = subprocess.CompletedProcess([], 0, json.dumps(projection), "")
        injected = {
            "NODE_OPTIONS": "--import=file:///synthetic-untrusted-module.mjs",
            "NODE_PATH": "/synthetic-untrusted-modules",
            "GITHUB_TOKEN": "synthetic-secret-never-forwarded",
            "AWS_ACCESS_KEY_ID": "synthetic-never-forwarded",
            "PATH": "/synthetic-path-only",
        }
        with patch.dict(os.environ, injected), patch.object(self.bridge.subprocess, "run", return_value=result) as run:
            actual = self.consumer(self.raw, self.bridge.SCHEMA_VERSION, FRESH)
        self.assertEqual(actual, projection)
        run.assert_called_once()
        args, kwargs = run.call_args
        self.assertEqual(kwargs["env"], {"PATH": "/synthetic-path-only"})
        self.assertIs(kwargs["shell"], False)
        self.assertEqual(kwargs["timeout"], 10)
        self.assertEqual(args[0][1:3], ["--input-type=module", "-e"])
        request = json.loads(kwargs["input"])
        self.assertEqual(base64.b64decode(request["manifest"]), self.raw)
        self.assertEqual(hashlib.sha256(base64.b64decode(request["validator"])).hexdigest(), VALIDATOR_SHA256)
        self.assertNotIn("synthetic-secret-never-forwarded", kwargs["input"])
        self.assertNotIn("synthetic-secret-never-forwarded", " ".join(args[0]))

    def test_missing_or_wrong_manifest_bytes_never_start_validator(self):
        with patch.object(self.bridge.subprocess, "run") as run:
            missing = self.report.build_report(
                self.input_receipt(), FRESH, capability_consumer=self.consumer,
            )
            mismatch = self.report.build_report(
                self.input_receipt(), FRESH, manifest_bytes=b"synthetic-mismatch",
                capability_consumer=self.consumer,
            )
            run.assert_not_called()
        self.assertEqual(missing["capabilities"]["state"], "unavailable")
        self.assertEqual(mismatch["capabilities"]["state"], "digest_mismatch")

    def test_submillisecond_clock_rejects_without_rounding_or_execution(self):
        with patch.object(self.bridge.subprocess, "run") as run:
            result = self.report.build_report(
                self.input_receipt(), "2026-11-18T07:30:00.000001Z",
                manifest_bytes=self.raw, capability_consumer=self.consumer,
            )
            run.assert_not_called()
        self.assertEqual(result["capabilities"]["state"], "invalid")
        self.assertIsNone(result["capabilities"]["projection"])

    def test_explicit_integration_invocation_without_dependency_is_an_error(self):
        result = subprocess.run([
            sys.executable, str(HERE / "test_capability_bridge.py"),
        ], text=True, capture_output=True, timeout=10, check=False,
            env={"PATH": os.environ.get("PATH", "")})
        self.assertEqual(result.returncode, 2)
        self.assertIn("--contract-root", result.stderr)
        self.assertNotIn("OK", result.stderr)


def main(argv=None):
    global CONTRACT_ROOT
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--contract-root", default=CONTRACT_ROOT,
                        help="local contracts/capability_manifest directory from the pinned owner packet")
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args(argv)
    if not args.contract_root:
        parser.error("--contract-root or ATLAS_RECEIPT_CAPABILITY_ROOT is required; integration was not run")
    CONTRACT_ROOT = args.contract_root
    tests = unittest.defaultTestLoader.loadTestsFromTestCase(CapabilityBridgeIntegrationTests)
    result = unittest.TextTestRunner(verbosity=2 if args.verbose else 1).run(tests)
    return 0 if result.wasSuccessful() else 1


if __name__ == "__main__":
    raise SystemExit(main())
