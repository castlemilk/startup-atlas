"""Compose offline fixture layers without making a request or an edit."""
import base64
import copy
import json
from pathlib import Path
import unittest

from contracts.mcp_assets.public_projection import project_public_manifest
from contracts.mcp_assets.transport import (
    TransportError, encode_request, request_budget, validate_wire_body,
)
from scripts import atlas_assets


FIXTURES = Path(__file__).resolve().parents[1] / "contracts/mcp_assets/fixtures"
SLOT = ("params", "arguments", "content_base64")


class AdapterPacketTests(unittest.TestCase):
    def fixtures(self):
        return (
            json.loads((FIXTURES / "synthetic-review.json").read_text()),
            json.loads((FIXTURES / "request-envelope.json").read_text()),
        )

    def test_full_jsonrpc_envelope_counts_id_tool_wrapper_target_and_public_manifest(self):
        review, envelope = self.fixtures()
        budget = request_budget(envelope, SLOT)
        small = copy.deepcopy(envelope)
        del small["params"]["arguments"]["target"]
        self.assertGreater(budget["envelope_bytes"], request_budget(small, SLOT)["envelope_bytes"])
        self.assertEqual(budget["request_limit_bytes"], 131072)
        body = encode_request(b"x" * budget["max_raw_bytes"], envelope, SLOT)
        self.assertLessEqual(len(body), 131072)
        self.assertEqual(131072 - len(body), budget["alignment_slack_bytes"])
        with self.assertRaises(TransportError):
            encode_request(b"x" * (budget["max_raw_bytes"] + 1), envelope, SLOT)
        # These capacity-filling bytes are not an image and do not pass the image layer.
        with self.assertRaises(atlas_assets.AssetError):
            atlas_assets.inspect_png(b"x" * budget["max_raw_bytes"])

    def test_valid_synthetic_bytes_and_public_projection_survive_exact_wire_readback(self):
        review, envelope = self.fixtures()
        pixels = base64.b64decode(review["png_base64"], validate=True)
        validated = atlas_assets.validate_asset(pixels, review["private_manifest"]["provenance"])
        public = project_public_manifest(
            validated["manifest"], review["public_descriptor"], validated["asset_revision"]
        )
        args = envelope["params"]["arguments"]
        self.assertEqual(args["public_manifest"], public["public_manifest"])
        self.assertEqual(args["public_manifest_revision"], public["public_manifest_revision"])
        wire = encode_request(pixels, envelope, SLOT)
        receipt = validate_wire_body(wire, SLOT)
        self.assertEqual(receipt["asset_sha256"], validated["manifest"]["blob"]["sha256"])
        self.assertEqual(receipt["raw_bytes"], len(pixels))
        self.assertEqual(receipt["wire_bytes"], len(wire))
        self.assertFalse(receipt["sent"])
        self.assertFalse(receipt["schema_validated"])
        self.assertEqual(public["authorization"], "none")
        self.assertFalse(public["published"])
        self.assertNotIn(b"PRIVATE_", wire)
        self.assertNotIn(review["private_revision"].encode(), wire)
        self.assertEqual(
            base64.b64decode(json.loads(wire)["params"]["arguments"]["content_base64"], validate=True),
            pixels,
        )

    def test_private_evidence_has_no_automatic_request_slot(self):
        review, envelope = self.fixtures()
        self.assertNotIn("private_manifest", envelope["params"]["arguments"])
        self.assertNotIn("rights", envelope["params"]["arguments"])
        self.assertNotIn("authorization", envelope["params"]["arguments"])
        # The generic budgeter counts arbitrary fields; it does not approve them.
        envelope["params"]["arguments"]["forbidden_private_field"] = "PRIVATE_FIXTURE_ONLY"
        receipt = request_budget(envelope, SLOT)
        self.assertFalse(receipt["schema_validated"])
        self.assertFalse(receipt["sent"])


if __name__ == "__main__":
    unittest.main()
