"""Synthetic offline manifest parity and public-disclosure boundary checks."""
import base64
import copy
import json
from pathlib import Path
import subprocess
import unittest

from contracts.mcp_assets.canonical import (
    CanonicalError, canonical_bytes, manifest_revision, parse_strict_json,
)
from contracts.mcp_assets.public_projection import project_public_manifest
from scripts import atlas_assets


ROOT = Path(__file__).resolve().parents[1]
FIXTURES = ROOT / "contracts/mcp_assets/fixtures"
VECTORS = json.loads((FIXTURES / "canonical-vectors.json").read_text())
REVIEW = json.loads((FIXTURES / "synthetic-review.json").read_text())


class ManifestParityTests(unittest.TestCase):
    def test_golden_vectors_have_exact_bytes_and_digests(self):
        for fixture in VECTORS["valid"]:
            with self.subTest(name=fixture["name"]):
                value = parse_strict_json(fixture["input_json"])
                self.assertEqual(canonical_bytes(value), fixture["canonical_utf8"].encode())
                self.assertEqual(manifest_revision(value), "sha256:" + fixture["sha256"])

    def test_invalid_raw_json_is_rejected_with_stable_error_type(self):
        for fixture in VECTORS["invalid"]:
            with self.subTest(name=fixture["name"]):
                with self.assertRaises(CanonicalError):
                    parse_strict_json(fixture["input_json"])
        with self.assertRaises(CanonicalError):
            parse_strict_json('{"n":' + "9" * 4301 + "}")

    def test_python_and_javascript_emit_identical_fixture_bytes(self):
        module = (ROOT / "contracts/mcp_assets/canonical.mjs").as_uri()
        script = (
            "import {canonicalBytes,manifestRevision,parseStrictJson} from "
            + json.dumps(module) + ";"
            "let source='';for await(const chunk of process.stdin)source+=chunk;"
            "const values=JSON.parse(source);"
            "process.stdout.write(JSON.stringify(values.map(source=>{"
            "const value=parseStrictJson(source);return {"
            "hex:Buffer.from(canonicalBytes(value)).toString('hex'),"
            "revision:manifestRevision(value)};})));"
        )
        result = subprocess.run(
            ["node", "--input-type=module", "--eval", script],
            input=json.dumps([item["input_json"] for item in VECTORS["valid"]]),
            capture_output=True, text=True, check=True, timeout=15,
        )
        for fixture, node in zip(VECTORS["valid"], json.loads(result.stdout), strict=True):
            with self.subTest(name=fixture["name"]):
                value = parse_strict_json(fixture["input_json"])
                self.assertEqual(node["hex"], canonical_bytes(value).hex())
                self.assertEqual(node["revision"], manifest_revision(value))

    def test_existing_review_revisions_are_not_rewritten(self):
        expected = {
            "merged_ascii_review": "sha256:9a6cfe884c7549d12949cfb57ddf5132bff12178fce47f206c25fd68eb479dc8",
            "merged_unicode_review": "sha256:39074a146f91bdae2c9d79c78da0133827aed6dcac262dd54df29f29035f9a6c",
        }
        for fixture in VECTORS["valid"]:
            if fixture["name"] in expected:
                value = parse_strict_json(fixture["input_json"])
                self.assertEqual(canonical_bytes(value), atlas_assets._canonical_bytes(value))
                self.assertEqual(manifest_revision(value), expected[fixture["name"]])
        measured = atlas_assets.validate_asset(
            base64.b64decode(REVIEW["png_base64"], validate=True),
            REVIEW["private_manifest"]["provenance"],
        )
        self.assertEqual(measured["manifest"], REVIEW["private_manifest"])
        self.assertEqual(measured["asset_revision"], REVIEW["private_revision"])

    def test_order_text_and_normalization_remain_significant(self):
        self.assertEqual(canonical_bytes({"b": 1, "a": 2}), canonical_bytes({"a": 2, "b": 1}))
        self.assertNotEqual(manifest_revision({"x": [1, 2]}), manifest_revision({"x": [2, 1]}))
        self.assertNotEqual(manifest_revision({"x": "é"}), manifest_revision({"x": "e\u0301"}))
        self.assertNotEqual(manifest_revision({"x": "https://example.com/a"}), manifest_revision({"x": "https://example.com/a/"}))

    def test_unsupported_in_memory_values_and_bounds_fail(self):
        cyclic = []
        cyclic.append(cyclic)
        values = [
            1.0, -1, float("nan"), float("inf"), 9007199254740992,
            {"é": 1}, {"10": 1}, {"a": "\ud800"}, cyclic, tuple(),
            {"x": "a" * 32768}, [0] * 4096,
        ]
        nested = None
        for _ in range(18):
            nested = [nested]
        values.append(nested)
        for value in values:
            with self.subTest(type=type(value).__name__):
                with self.assertRaises(CanonicalError):
                    canonical_bytes(value)
        for wire in (b'{"x":"\xff"}', b"\xef\xbb\xbf{}", b" " * 32769):
            with self.assertRaises(CanonicalError):
                parse_strict_json(wire)


class PublicProjectionTests(unittest.TestCase):
    def fixture(self):
        return copy.deepcopy(REVIEW)

    def project(self, fixture=None):
        fixture = self.fixture() if fixture is None else fixture
        return project_public_manifest(
            fixture["private_manifest"], fixture["public_descriptor"], fixture["private_revision"]
        )

    def test_allowlist_projection_is_exact_and_always_held(self):
        projected = self.project()
        self.assertEqual(projected["public_manifest"], REVIEW["expected_public_manifest"])
        self.assertEqual(projected["public_manifest_revision"], REVIEW["expected_public_revision"])
        self.assertEqual(projected["status"], "projection_candidate")
        self.assertEqual(projected["authorization"], "none")
        self.assertFalse(projected["published"])
        self.assertIn("authenticated_review_authority", projected["required_gates"])
        self.assertIn("private_to_public_review_binding", projected["required_gates"])
        self.assertIn("public_field_disclosure_review", projected["required_gates"])

    def test_no_private_correspondence_url_reviewer_or_revision_is_emitted(self):
        encoded = json.dumps(self.project(), ensure_ascii=False)
        self.assertNotIn("PRIVATE_", encoded)
        self.assertNotIn(REVIEW["private_revision"], encoded)
        for field in ("evidence_url", "reviewer", "redirects", "source_asset_url", "final_url", "identity", "rights"):
            self.assertNotIn('"' + field + '"', encoded)
        self.assertEqual(self.project()["public_manifest"]["attribution"], "Crédit Ω — 作者 🛰️")

    def test_private_only_changes_do_not_change_public_candidate(self):
        original = self.project()
        for group, key in (
            ("identity", "evidence"), ("identity", "reviewer"),
            ("rights", "evidence"), ("rights", "reviewer"), ("rights", "attribution"),
        ):
            fixture = self.fixture()
            fixture["private_manifest"]["provenance"][group][key] += " changed"
            fixture["private_revision"] = manifest_revision(fixture["private_manifest"])
            self.assertNotEqual(fixture["private_revision"], REVIEW["private_revision"])
            self.assertEqual(self.project(fixture), original)
        for key in ("source_page", "host_evidence_url", "source_asset_url", "final_url"):
            fixture = self.fixture()
            fixture["private_manifest"]["provenance"][key] += "-changed"
            fixture["private_revision"] = manifest_revision(fixture["private_manifest"])
            self.assertEqual(self.project(fixture), original)
        fixture = self.fixture()
        fixture["private_manifest"]["provenance"]["redirects"][0] += "-changed"
        fixture["private_revision"] = manifest_revision(fixture["private_manifest"])
        self.assertEqual(self.project(fixture), original)

    def test_private_revision_stays_a_separate_conflict_precondition(self):
        fixture = self.fixture()
        fixture["private_manifest"]["provenance"]["rights"]["evidence"] += " changed"
        with self.assertRaises(atlas_assets.AssetError) as caught:
            self.project(fixture)
        self.assertEqual(caught.exception.code, "REVIEW_REVISION_CONFLICT")

    def test_different_public_attribution_changes_public_revision(self):
        fixture = self.fixture()
        fixture["public_descriptor"]["attribution"] += " — alternate public wording"
        self.assertNotEqual(self.project(fixture)["public_manifest_revision"], REVIEW["expected_public_revision"])

    def test_caller_cannot_insert_private_or_authorization_fields(self):
        for key in ("rights", "identity", "evidence", "evidence_url", "reviewer", "approved", "asset_revision"):
            fixture = self.fixture()
            fixture["public_descriptor"][key] = "PRIVATE_INJECTION_SENTINEL"
            with self.assertRaises(atlas_assets.AssetError) as caught:
                self.project(fixture)
            self.assertEqual(caught.exception.code, "PUBLIC_FIELD_ALLOWLIST")

    def test_public_url_is_not_silently_rewritten_or_copied(self):
        for url in (
            REVIEW["private_manifest"]["provenance"]["source_page"],
            "https://example.com/brand#private", "https://example.com/brand?",
            "https://user:secret@example.com/brand", "http://example.com/brand",
            "https://127.0.0.1/brand", "https://example.com:8443/brand",
            "https://example.com/%72obots.txt",
        ):
            fixture = self.fixture()
            fixture["public_descriptor"]["source_page"] = url
            with self.assertRaises(atlas_assets.AssetError):
                self.project(fixture)

    def test_permission_correspondence_cannot_use_the_licence_slot(self):
        fixture = self.fixture()
        fixture["public_descriptor"]["licence_url"] = "https://example.com/private-permission"
        with self.assertRaises(atlas_assets.AssetError) as caught:
            self.project(fixture)
        self.assertEqual(caught.exception.code, "PUBLIC_PERMISSION_CORRESPONDENCE")

    def test_licence_basis_requires_separately_supplied_public_licence(self):
        fixture = self.fixture()
        fixture["private_manifest"]["provenance"]["rights"]["basis"] = "licence"
        fixture["private_revision"] = manifest_revision(fixture["private_manifest"])
        with self.assertRaises(atlas_assets.AssetError):
            self.project(fixture)
        fixture["public_descriptor"]["licence_url"] = "https://example.com/public-licence"
        result = self.project(fixture)
        self.assertEqual(result["authorization"], "none")
        self.assertEqual(result["public_manifest"]["licence_url"], "https://example.com/public-licence")

    def test_subject_role_and_unresolved_rights_block_preparation(self):
        for key, value in (("subject_id", "startup:another-company"), ("role", "portrait")):
            fixture = self.fixture()
            fixture["public_descriptor"][key] = value
            with self.assertRaises(atlas_assets.AssetError):
                self.project(fixture)
        fixture = self.fixture()
        rights = fixture["private_manifest"]["provenance"]["rights"]
        rights.update(decision="unknown", basis="unresolved", public_repository=False, public_website=False)
        fixture["private_revision"] = manifest_revision(fixture["private_manifest"])
        with self.assertRaises(atlas_assets.AssetError) as caught:
            self.project(fixture)
        self.assertEqual(caught.exception.code, "REVIEW_NOT_READY")

    def test_structural_projection_does_not_classify_explicit_public_text(self):
        fixture = self.fixture()
        fixture["public_descriptor"]["attribution"] = "Text deliberately supplied by a caller still needs disclosure review."
        result = self.project(fixture)
        self.assertEqual(result["authorization"], "none")
        self.assertIn("public_field_disclosure_review", result["required_gates"])
        self.assertFalse(result["published"])


if __name__ == "__main__":
    unittest.main()
