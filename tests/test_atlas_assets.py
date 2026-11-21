"""Offline adversarial checks for the private image-asset staging boundary.

All images and entities are synthetic. No test fetches a source, changes an Atlas
record, writes a Git branch, or demonstrates publication.
"""

import copy
from contextlib import redirect_stdout
import hashlib
import importlib.util
import io
import json
from pathlib import Path
from random import Random
import struct
import tempfile
import unittest
from unittest.mock import patch
import zlib


SPEC = importlib.util.spec_from_file_location(
    "atlas_assets", Path(__file__).resolve().parents[1] / "scripts/atlas_assets.py"
)
assets = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(assets)

PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


def chunk(kind, payload=b"", crc=None):
    check = zlib.crc32(kind + payload) & 0xFFFFFFFF if crc is None else crc
    return struct.pack(">I", len(payload)) + kind + payload + struct.pack(">I", check)


def png(width=2, height=2, color_type=6, *, raw=None, before_idat=b"",
        after_idat=b"", compressed=None, bit_depth=8, interlace=0):
    channels = 3 if color_type == 2 else 4
    if raw is None:
        # Filter zero with visibly nonuniform pixels; this is a complete raster,
        # not just a signature plus an IHDR dimensions stub.
        pixel = b"\x18\x7f\xc2" + (b"\xff" if channels == 4 else b"")
        raw = (b"\x00" + pixel * width) * height
    header = struct.pack(">IIBBBBB", width, height, bit_depth, color_type, 0, 0, interlace)
    return (PNG_SIGNATURE + chunk(b"IHDR", header) + before_idat
            + chunk(b"IDAT", zlib.compress(raw) if compressed is None else compressed)
            + after_idat + chunk(b"IEND"))


def provenance():
    return {
        "subject_id": "startup:fixture-company",
        "role": "logo",
        "source_page": "https://example.com/brand",
        "source_asset_url": "https://assets.example.com/brand/logo.png",
        "final_url": "https://assets.example.com/brand/logo.png",
        "approved_asset_host": "assets.example.com",
        "host_evidence_url": "https://example.com/brand",
        "acquired_at": "2026-01-01T00:00:00Z",
        "acquisition": "synthetic-fixture",
        "source_kind": "official-brand",
        "identity": {
            "decision": "approved",
            "evidence": "Synthetic fixture is explicitly bound to Fixture Company.",
            "reviewer": "fixture-reviewer",
            "reviewed_at": "2026-01-01T00:00:00Z",
        },
        "rights": {
            "decision": "approved",
            "basis": "permission",
            "evidence_url": "https://example.com/brand/terms",
            "evidence": "Synthetic pixels authored for this offline test only.",
            "attribution": "Fixture author",
            "reviewer": "fixture-reviewer",
            "reviewed_at": "2026-01-01T00:00:00Z",
            "public_repository": True,
            "public_website": True,
        },
    }


class AssetAssertions(unittest.TestCase):
    def assertAssetError(self, function, *args, code=None, **kwargs):
        with self.assertRaises(assets.AssetError) as caught:
            function(*args, **kwargs)
        error = caught.exception
        result = error.as_dict()
        self.assertEqual(set(result), {"code", "field", "message"})
        self.assertTrue(result["code"])
        self.assertTrue(result["field"])
        self.assertTrue(result["message"])
        if code is not None:
            self.assertEqual(result["code"], code)
        return error


class PNGValidationTests(AssetAssertions):
    def test_rgb_and_rgba_images_report_the_measured_bytes(self):
        for color_type in (2, 6):
            with self.subTest(color_type=color_type):
                data = png(color_type=color_type)
                digest = hashlib.sha256(data).hexdigest()
                result = assets.inspect_png(data, expected_sha256=digest)
                self.assertEqual(result["asset_id"], "asset:sha256:" + digest)
                self.assertEqual(result["sha256"], digest)
                self.assertEqual(result["bytes"], len(data))
                self.assertEqual(result["mime"], "image/png")
                self.assertEqual((result["width"], result["height"]), (2, 2))
                self.assertEqual(result["color_type"], color_type)
                self.assertEqual(result["bit_depth"], 8)
                self.assertEqual(result["validation"], "png-rgb8-v0")
                self.assertIsNone(result["observed_mime"])
                self.assertEqual(result["declared_mime"], "image/png")
        observed = assets.inspect_png(png(), observed_mime="image/png")
        self.assertEqual(observed["observed_mime"], "image/png")

    def test_nonimages_and_active_svg_are_rejected(self):
        for data in (b"", b"not an image", b"<html>oops</html>",
                     b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
                     b'<svg><image href="https://example.com/tracker"/></svg>',
                     b'<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]><svg>&x;</svg>'):
            with self.subTest(data=data[:30]):
                self.assertAssetError(assets.inspect_png, data)

    def test_declared_and_observed_mime_cannot_disagree_with_bytes(self):
        for options in ({"declared_mime": "image/jpeg"},
                        {"declared_mime": "image/svg+xml"},
                        {"observed_mime": "text/html"},
                        {"observed_mime": "image/jpeg"}):
            with self.subTest(options=options):
                self.assertAssetError(assets.inspect_png, png(), **options)

    def test_claimed_digest_must_match_the_whole_file(self):
        self.assertAssetError(assets.inspect_png, png(), expected_sha256="0" * 64)
        for value in ("../escape", "a" * 63, "A" * 64):
            with self.subTest(value=value):
                self.assertAssetError(assets.inspect_png, png(), expected_sha256=value)

    def test_truncation_at_every_structural_boundary_fails(self):
        data = png()
        for length in (1, 8, 12, 20, 29, 32, 33, len(data) - 12, len(data) - 1):
            with self.subTest(length=length):
                self.assertAssetError(assets.inspect_png, data[:length])

    def test_chunk_crc_is_checked_even_when_dimensions_are_plausible(self):
        data = bytearray(png())
        data[29] ^= 1  # First byte of the IHDR CRC, not its contents.
        self.assertAssetError(assets.inspect_png, bytes(data))
        bad_idat = png()
        position = bad_idat.index(b"IDAT")
        payload_length = struct.unpack(">I", bad_idat[position - 4:position])[0]
        changed = bytearray(bad_idat)
        changed[position + 4 + payload_length] ^= 1
        self.assertAssetError(assets.inspect_png, bytes(changed))

    def test_png_subset_rejects_palette_grayscale_depth_and_interlace(self):
        for options in ({"color_type": 0}, {"color_type": 3}, {"color_type": 4},
                        {"bit_depth": 16}, {"interlace": 1}):
            with self.subTest(options=options):
                self.assertAssetError(assets.inspect_png, png(**options))

    def test_ancillary_metadata_animation_and_unknown_chunks_are_rejected(self):
        for kind, body in ((b"tEXt", b"key\x00content"), (b"iCCP", b"profile\x00data"),
                           (b"eXIf", b"metadata"), (b"acTL", struct.pack(">II", 2, 0)),
                           (b"ABCD", b"unknown")):
            with self.subTest(kind=kind):
                self.assertAssetError(assets.inspect_png, png(before_idat=chunk(kind, body)))

    def test_trailing_bytes_and_multiple_pngs_are_rejected(self):
        for suffix in (b"x", b"\x00", png(), b"<script>alert(1)</script>"):
            with self.subTest(suffix=suffix[:12]):
                self.assertAssetError(assets.inspect_png, png() + suffix)

    def test_deflate_data_must_be_valid_complete_and_exactly_one_stream(self):
        raw = (b"\x00" + b"\x18\x7f\xc2\xff" * 2) * 2
        compressed = zlib.compress(raw)
        for bad in (b"", b"not-deflate", compressed[:-1], compressed + b"junk",
                    compressed + zlib.compress(raw)):
            with self.subTest(compressed=bad[:12]):
                self.assertAssetError(assets.inspect_png, png(compressed=bad))

    def test_scanline_length_and_filter_byte_are_verified(self):
        expected = (b"\x00" + b"\x18\x7f\xc2\xff" * 2) * 2
        for raw in (expected[:-1], expected + b"\x00", b"\x05" + expected[1:]):
            with self.subTest(raw=raw):
                self.assertAssetError(assets.inspect_png, png(raw=raw))

    def test_small_header_cannot_hide_large_decompression(self):
        self.assertAssetError(assets.inspect_png, png(1, 1, compressed=zlib.compress(b"\x00" * 1_000_000)))

    def test_zero_and_unbounded_dimensions_are_rejected(self):
        for width, height in ((0, 1), (1, 0), (0xFFFFFFFF, 1), (1, 0xFFFFFFFF), (8192, 8192)):
            with self.subTest(width=width, height=height):
                with patch("zlib.decompressobj", side_effect=AssertionError("Dimensions must be bounded before decoding")):
                    self.assertAssetError(assets.inspect_png, png(width, height, raw=b"\x00"))

    def test_combined_pixel_limit_precedes_decompression(self):
        # Both sides are within 4096, but their product exceeds 16 million.
        with patch("zlib.decompressobj", side_effect=AssertionError("Pixel count must be bounded before decoding")):
            self.assertAssetError(assets.inspect_png, png(4000, 4001, raw=b"\x00"))

    def test_oversized_file_is_rejected(self):
        random = Random(19)
        raw = b"".join(b"\x00" + random.randbytes(512 * 4) for _ in range(512))
        data = png(512, 512, raw=raw)
        self.assertGreater(len(data), 1_000_000)
        with patch("zlib.decompressobj", side_effect=AssertionError("Byte limit must precede decoding")):
            self.assertAssetError(assets.inspect_png, data)


class ProvenanceValidationTests(AssetAssertions):
    def setUp(self):
        self.blob = assets.inspect_png(png())

    def test_complete_provenance_retains_attribution_and_source_scope(self):
        source = provenance()
        result = assets.validate_provenance(source, self.blob)
        self.assertEqual(result["schema"], "atlas.asset-review.v0")
        self.assertEqual(result["blob"], self.blob)
        self.assertEqual(result["provenance"], source)

    def test_missing_and_unknown_fields_fail_with_actionable_errors(self):
        for field in provenance():
            source = provenance()
            del source[field]
            with self.subTest(missing=field):
                self.assertAssetError(assets.validate_provenance, source, self.blob)
        source = provenance()
        source["auto_publish"] = True
        self.assertAssetError(assets.validate_provenance, source, self.blob)

    def test_private_ip_credentials_scheme_and_port_urls_are_rejected(self):
        bad_urls = (
            "http://example.com/source", "file:///etc/passwd", "data:image/png;base64,AAAA",
            "https://user:password@example.com/source", "https://example.com:8443/source",
            "https://127.0.0.1/source", "https://2130706433/source", "https://0x7f000001/source",
            "https://[::1]/source", "https://[::ffff:127.0.0.1]/source",
            "https://localhost/source", "https://machine.internal/source", "https://machine.local/source",
            "https://example.com./source", "https://example.com/line\nbreak",
        )
        for url in bad_urls:
            with self.subTest(url=url):
                source = provenance()
                source["source_page"] = url
                self.assertAssetError(assets.validate_provenance, source, self.blob)

    def test_source_urls_reject_robots_paths_without_network_activity(self):
        for url in ("https://example.com/robots.txt", "https://example.com/%72obots.txt",
                    "https://example.com/one/robots.txt/two"):
            with self.subTest(url=url):
                source = provenance()
                source["source_page"] = url
                with patch("socket.getaddrinfo", side_effect=AssertionError("DNS forbidden")), \
                     patch("socket.create_connection", side_effect=AssertionError("network forbidden")):
                    self.assertAssetError(assets.validate_provenance, source, self.blob)

    def test_asset_host_is_exact_and_cannot_be_self_expanded(self):
        for host in ("*.example.com", "https://assets.example.com", "example.com", "assets.example.com.evil.com"):
            source = provenance()
            source["approved_asset_host"] = host
            with self.subTest(host=host):
                self.assertAssetError(assets.validate_provenance, source, self.blob)
        for field in ("source_asset_url", "final_url"):
            source = provenance()
            source[field] = "https://assets.example.com.evil.com/image.png"
            with self.subTest(field=field):
                self.assertAssetError(assets.validate_provenance, source, self.blob)

    def test_redirect_evidence_cannot_contain_internal_or_unapproved_destinations(self):
        for target in ("https://127.0.0.1/logo.png", "https://other.example.com/logo.png",
                       "http://assets.example.com/logo.png", "https://assets.example.com/robots.txt"):
            source = provenance()
            source["redirects"] = [target]
            with self.subTest(target=target):
                self.assertAssetError(assets.validate_provenance, source, self.blob)
    def test_identity_and_rights_approval_need_evidence_and_review(self):
        for section in ("identity", "rights"):
            for field in ("evidence", "reviewer", "reviewed_at"):
                source = provenance()
                source[section][field] = "" if field != "reviewed_at" else None
                with self.subTest(section=section, field=field):
                    self.assertAssetError(assets.validate_provenance, source, self.blob)
        source = provenance()
        source["rights"]["evidence_url"] = None
        self.assertAssetError(assets.validate_provenance, source, self.blob)

    def test_dates_are_real_utc_times_and_cannot_be_in_the_future(self):
        for date in ("2026-02-30T00:00:00Z", "2026-01-01", "2099-01-01T00:00:00Z",
                     "2026-01-01T00:00:00+11:00"):
            source = provenance()
            source["acquired_at"] = date
            with self.subTest(date=date):
                self.assertAssetError(assets.validate_provenance, source, self.blob)

    def test_subject_and_role_reject_paths_and_malformed_identity(self):
        for subject in ("../startup:fixture", "/startup:fixture", "startup:../fixture", "fixture", "person:"):
            source = provenance()
            source["subject_id"] = subject
            with self.subTest(subject=subject):
                self.assertAssetError(assets.validate_provenance, source, self.blob)
        source = provenance()
        source["role"] = "../logo"
        self.assertAssetError(assets.validate_provenance, source, self.blob)


class PrivateStageTests(AssetAssertions):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="atlas-private-assets-test-")
        self.addCleanup(self.temporary.cleanup)
        # macOS temp roots may use /var -> /private/var; canonicalize only
        # the ordinary fixture, not the production no-symlink validation.
        self.base = Path(self.temporary.name).resolve(strict=True)
        self.root = self.base / "private-store"
        self.store = assets.StageStore(self.root)
        self.data = png()
        self.source = provenance()

    def stage(self, source=None):
        return self.store.stage(self.data, self.source if source is None else source)

    def read(self, receipt):
        return self.store.get(receipt["asset_id"], receipt["asset_revision"])

    def prepare(self, receipt, **kwargs):
        arguments = {"subject_id": self.source["subject_id"], "role": self.source["role"], **kwargs}
        return self.store.prepare_public_export(receipt["asset_id"], receipt["asset_revision"], **arguments)

    def inventory(self):
        return {str(path.relative_to(self.root)): path.read_bytes()
                for path in self.root.rglob("*") if path.is_file()}

    def manifest_path(self, receipt):
        return self.root / "reviews" / (receipt["asset_revision"].removeprefix("sha256:") + ".json")

    def receipt_path(self, receipt):
        return self.root / "receipts" / (receipt["asset_revision"].removeprefix("sha256:") + ".json")

    def blob_path(self, receipt):
        return self.root / "blobs" / (receipt["asset_id"].removeprefix("asset:sha256:") + ".png")

    def test_preflight_returns_stable_recovery_ids_without_filesystem_or_network(self):
        with patch("builtins.open", side_effect=AssertionError("Preflight must not open files")), \
             patch("os.open", side_effect=AssertionError("Preflight must not open file descriptors")), \
             patch("socket.getaddrinfo", side_effect=AssertionError("DNS forbidden")), \
             patch("socket.create_connection", side_effect=AssertionError("Network forbidden")):
            validated = assets.validate_asset(self.data, self.source)
        self.assertEqual(validated["state"], "validated")
        self.assertIs(validated["published"], False)
        self.assertFalse(self.root.exists())
        saved = self.stage()
        for field in ("asset_id", "asset_revision", "manifest"):
            self.assertEqual(validated[field], saved[field])

    def test_cli_preflight_ids_support_readback_after_first_interrupted_stage(self):
        image_path = self.base / "fixture.png"
        source_path = self.base / "provenance.json"
        image_path.write_bytes(self.data)
        source_path.write_text(json.dumps(self.source))
        before = {path.name: path.read_bytes() for path in self.base.iterdir()}
        stdout = io.StringIO()
        with redirect_stdout(stdout), \
             patch.object(assets, "_write_new", side_effect=AssertionError("Validation must not write")), \
             patch("socket.getaddrinfo", side_effect=AssertionError("DNS forbidden")), \
             patch("socket.create_connection", side_effect=AssertionError("Network forbidden")):
            status = assets.main(["validate", "--file", str(image_path), "--provenance", str(source_path)])
        self.assertEqual(status, 0)
        result = json.loads(stdout.getvalue())
        self.assertIs(result["ok"], True)
        validated = result["result"]
        self.assertEqual(validated["state"], "validated")
        self.assertEqual({path.name: path.read_bytes() for path in self.base.iterdir()}, before)

        original = assets._write_new

        def interrupt_before_receipt(path, payload):
            if path.parent.name == "receipts":
                raise OSError("Simulated interruption of the first stage request")
            return original(path, payload)

        with patch.object(assets, "_write_new", side_effect=interrupt_before_receipt):
            self.assertAssetError(self.stage, code="STAGE_UNCERTAIN")
        before_readback = self.inventory()
        stdout = io.StringIO()
        with redirect_stdout(stdout), \
             patch.object(assets, "_write_new", side_effect=AssertionError("Readback must not replay writes")):
            status = assets.main([
                "get", "--store", str(self.root),
                "--asset-id", validated["asset_id"],
                "--asset-revision", validated["asset_revision"],
            ])
        self.assertEqual(status, 1)
        result = json.loads(stdout.getvalue())
        self.assertIs(result["ok"], False)
        self.assertEqual(result["error"]["code"], "NOT_FOUND")
        self.assertEqual(self.inventory(), before_readback)

    def test_stage_and_readback_are_private_and_unpublished(self):
        with patch("socket.getaddrinfo", side_effect=AssertionError("DNS forbidden")), \
             patch("socket.create_connection", side_effect=AssertionError("network forbidden")):
            saved = self.stage()
            readback = self.read(saved)
        self.assertEqual(saved["state"], "staged")
        self.assertIs(saved["published"], False)
        self.assertEqual(readback["asset_id"], saved["asset_id"])
        self.assertEqual(readback["asset_revision"], saved["asset_revision"])
        self.assertEqual(readback["manifest"]["provenance"], self.source)
        self.assertEqual(self.blob_path(saved).read_bytes(), self.data)
        self.assertNotIn("public_url", saved)
        self.assertFalse(self.root.stat().st_mode & 0o077)
        self.assertTrue(all(not path.stat().st_mode & 0o077 for path in self.root.rglob("*") if path.is_file()))

    def test_mutable_input_cannot_change_between_validation_and_storage(self):
        mutable = bytearray(self.data)
        original = assets.inspect_png

        def inspect_then_mutate(data, *args, **kwargs):
            result = original(data, *args, **kwargs)
            mutable[:] = b"A caller changed its buffer after validation."
            return result

        with patch.object(assets, "inspect_png", side_effect=inspect_then_mutate):
            saved = self.store.stage(mutable, self.source)
        self.assertNotEqual(bytes(mutable), self.data)
        self.assertEqual(self.blob_path(saved).read_bytes(), self.data)
        self.assertEqual(saved["asset_id"], "asset:sha256:" + hashlib.sha256(self.data).hexdigest())
        self.assertEqual(self.read(saved)["asset_id"], saved["asset_id"])

    def test_existing_firm_scoped_person_identity_is_preserved_for_portraits(self):
        source = copy.deepcopy(self.source)
        source.update(subject_id="person:fixture-founder--fixture-firm", role="portrait", source_kind="labelled-portrait")
        saved = self.stage(source)
        result = self.prepare(saved, subject_id=source["subject_id"], role="portrait")
        self.assertEqual(result["manifest"]["provenance"]["subject_id"], source["subject_id"])
        self.assertEqual(result["manifest"]["provenance"]["role"], "portrait")
        self.assertIs(result["published"], False)

    def test_duplicate_input_and_reordered_json_produce_one_verified_object(self):
        saved = self.stage()
        before = self.inventory()
        reordered = json.loads(json.dumps(self.source, sort_keys=True))
        duplicate = self.stage(reordered)
        self.assertEqual(duplicate["asset_id"], saved["asset_id"])
        self.assertEqual(duplicate["asset_revision"], saved["asset_revision"])
        self.assertEqual(self.inventory(), before)
        self.assertEqual(len(list((self.root / "blobs").glob("*.png"))), 1)
        self.assertEqual(len(list((self.root / "reviews").glob("*.json"))), 1)

    def test_unicode_canonical_manifest_has_a_fixed_cross_language_revision(self):
        # These literal bytes make this a portable contract fixture independent
        # of the host zlib version used by the other generated-image tests.
        data = bytes.fromhex(
            "89504e470d0a1a0a0000000d494844520000000200000002080600000072b60d24"
            "0000001149444154789c6390a83ff41f8419600c004e8209614e4b844300000000"
            "49454e44ae426082"
        )
        source = provenance()
        source["rights"]["attribution"] = "Crédit Ω — 作者"
        receipt = self.store.stage(data, source)
        self.assertEqual(receipt["asset_id"],
                         "asset:sha256:733bb085d25acbd72c1a440f9d4eae5b7cabdf74b636a152afc65185c0d7f2b2")
        self.assertEqual(receipt["asset_revision"],
                         "sha256:39074a146f91bdae2c9d79c78da0133827aed6dcac262dd54df29f29035f9a6c")
        self.assertEqual(self.read(receipt)["manifest"]["provenance"]["rights"]["attribution"], "Crédit Ω — 作者")

    def test_same_bytes_keep_separate_provenance_reviews(self):
        first = self.stage()
        changed = copy.deepcopy(self.source)
        changed["source_page"] = "https://example.com/press"
        changed["identity"]["evidence"] = "A second independent synthetic source observation."
        second = self.stage(changed)
        self.assertEqual(first["asset_id"], second["asset_id"])
        self.assertNotEqual(first["asset_revision"], second["asset_revision"])
        self.assertEqual(len(list((self.root / "blobs").glob("*.png"))), 1)
        self.assertEqual(len(list((self.root / "reviews").glob("*.json"))), 2)
        self.assertEqual(self.read(first)["manifest"]["provenance"], self.source)
        self.assertEqual(self.read(second)["manifest"]["provenance"], changed)

    def test_public_preparation_preserves_ids_and_performs_no_public_write(self):
        saved = self.stage()
        before = self.inventory()
        result = self.prepare(saved)
        self.assertEqual(result["asset_id"], saved["asset_id"])
        self.assertEqual(result["asset_revision"], saved["asset_revision"])
        self.assertIs(result["published"], False)
        self.assertEqual(self.inventory(), before)
        self.assertFalse((self.base / "web").exists())

    def test_unknown_and_rejected_rights_can_stage_but_cannot_prepare_public_use(self):
        for decision in ("unknown", "rejected"):
            with self.subTest(decision=decision):
                source = copy.deepcopy(self.source)
                source["rights"].update(decision=decision, public_repository=False, public_website=False)
                if decision == "unknown":
                    source["rights"].update(basis="unresolved", evidence_url=None,
                                            evidence="", reviewer="", reviewed_at=None)
                else:
                    source["rights"]["evidence"] = "Synthetic review explicitly denies both public uses."
                saved = self.stage(source)
                self.assertEqual(self.read(saved)["manifest"]["provenance"]["rights"]["decision"], decision)
                before = self.inventory()
                self.assertAssetError(self.prepare, saved)
                self.assertEqual(self.inventory(), before)

    def test_both_public_repository_and_website_rights_are_required_for_export(self):
        for flag in ("public_repository", "public_website"):
            with self.subTest(flag=flag):
                source = copy.deepcopy(self.source)
                source["rights"][flag] = False
                saved = self.stage(source)
                self.assertAssetError(self.prepare, saved)

    def test_unreviewed_identity_is_never_treated_as_approved(self):
        source = copy.deepcopy(self.source)
        source["identity"].update(decision="unreviewed", evidence="", reviewer="", reviewed_at=None)
        saved = self.stage(source)
        self.assertAssetError(self.prepare, saved)

    def test_social_preview_is_not_automatically_a_logo(self):
        source = copy.deepcopy(self.source)
        source["source_kind"] = "social-preview"
        before = self.inventory()
        self.assertAssetError(self.stage, source)
        self.assertEqual(self.inventory(), before)

    def test_attachment_subject_and_role_must_match_the_review(self):
        saved = self.stage()
        before = self.inventory()
        self.assertAssetError(self.prepare, saved, subject_id="startup:different-company")
        self.assertAssetError(self.prepare, saved, role="portrait")
        self.assertEqual(self.inventory(), before)

    def test_unknown_asset_review_revision_cannot_resolve_or_prepare(self):
        saved = self.stage()
        stale = {**saved, "asset_revision": "sha256:" + "0" * 64}
        before = self.inventory()
        self.assertAssetError(self.read, stale)
        self.assertAssetError(self.prepare, stale)
        self.assertEqual(self.inventory(), before)

    def test_asset_and_review_identifiers_cannot_select_arbitrary_paths(self):
        saved = self.stage()
        for asset_id in ("../escape", "asset:sha256:../../escape", "/etc/passwd", "asset:sha256:" + "A" * 64):
            with self.subTest(asset_id=asset_id):
                self.assertAssetError(self.store.get, asset_id, saved["asset_revision"])
        for revision in ("../escape", "sha256:../../escape", "/etc/passwd"):
            with self.subTest(revision=revision):
                self.assertAssetError(self.store.get, saved["asset_id"], revision)

    def test_tampered_or_missing_bytes_fail_readback_and_duplicate_retry(self):
        saved = self.stage()
        blob = self.blob_path(saved)
        blob.write_bytes(png(3, 2))
        self.assertAssetError(self.read, saved)
        self.assertAssetError(self.stage)
        blob.unlink()
        self.assertAssetError(self.read, saved)
        self.assertAssetError(self.stage)
        self.assertFalse(blob.exists())

    def test_tampered_or_missing_manifest_fails_readback_without_repair(self):
        saved = self.stage()
        manifest = self.manifest_path(saved)
        content = json.loads(manifest.read_text())
        content["provenance"]["rights"]["attribution"] = "Modified attribution"
        manifest.write_text(json.dumps(content))
        self.assertAssetError(self.read, saved)
        self.assertAssetError(self.stage)
        manifest.unlink()
        self.assertAssetError(self.read, saved)
        self.assertAssetError(self.stage)
        self.assertFalse(manifest.exists())

    def test_tampered_or_missing_receipt_does_not_claim_a_completed_write(self):
        saved = self.stage()
        path = self.receipt_path(saved)
        content = json.loads(path.read_text())
        content["asset_id"] = "asset:sha256:" + "0" * 64
        path.write_text(json.dumps(content))
        self.assertAssetError(self.read, saved)
        self.assertAssetError(self.stage)
        path.unlink()
        self.assertAssetError(self.read, saved)
        self.assertAssetError(self.stage)
        self.assertFalse(path.exists())

    def test_interrupted_receipt_commit_leaves_uncertainty_and_never_auto_completes(self):
        original = assets._write_new

        def fail_before_receipt(path, payload):
            if path.parent.name == "receipts":
                raise OSError("Simulated interruption before receipt commit")
            return original(path, payload)

        with patch.object(assets, "_write_new", side_effect=fail_before_receipt):
            with self.assertRaises((assets.AssetError, OSError)):
                self.stage()
        before = self.inventory()
        self.assertEqual(len(list((self.root / "blobs").glob("*.png"))), 1)
        self.assertEqual(len(list((self.root / "reviews").glob("*.json"))), 1)
        self.assertEqual(len(list((self.root / "receipts").glob("*.json"))), 0)
        self.assertAssetError(self.stage, code="STAGE_UNCERTAIN")
        self.assertEqual(self.inventory(), before)

    def test_lost_acknowledgement_recovers_by_reading_the_completed_receipt(self):
        original = assets._write_new

        def fail_after_receipt(path, payload):
            result = original(path, payload)
            if path.parent.name == "receipts":
                raise OSError("Simulated lost acknowledgement after receipt commit")
            return result

        with patch.object(assets, "_write_new", side_effect=fail_after_receipt):
            with self.assertRaises((assets.AssetError, OSError)):
                self.stage()
        before = self.inventory()
        with patch.object(assets, "_write_new", side_effect=AssertionError("Recovery must be read-only")):
            recovered = self.stage()
        self.assertEqual(recovered["state"], "staged")
        self.assertIs(recovered["published"], False)
        self.assertEqual(self.inventory(), before)
        self.assertEqual(self.read(recovered)["asset_id"], recovered["asset_id"])

    def test_git_checkout_and_git_worktree_roots_are_refused(self):
        for marker in ("directory", "file"):
            with self.subTest(marker=marker):
                checkout = self.base / ("checkout-" + marker)
                checkout.mkdir()
                if marker == "directory":
                    (checkout / ".git").mkdir()
                else:
                    (checkout / ".git").write_text("gitdir: /some/other/repository")
                self.assertAssetError(assets.StageStore, checkout / "private" / "staging")
                self.assertFalse((checkout / "private").exists())

    def test_symlink_root_ancestor_is_refused(self):
        real = self.base / "real"
        real.mkdir()
        link = self.base / "linked"
        link.symlink_to(real, target_is_directory=True)
        self.assertAssetError(assets.StageStore, link / "private")
        self.assertFalse((real / "private").exists())

    def test_symlink_blob_cannot_escape_or_be_replaced(self):
        saved = self.stage()
        blob = self.blob_path(saved)
        outside = self.base / "outside.png"
        outside.write_bytes(self.data)
        blob.unlink()
        blob.symlink_to(outside)
        self.assertAssetError(self.read, saved)
        self.assertAssetError(self.stage)
        self.assertEqual(outside.read_bytes(), self.data)
        self.assertTrue(blob.is_symlink())

    def test_symlink_manifest_or_receipt_is_refused(self):
        saved = self.stage()
        for path in (self.manifest_path(saved), self.receipt_path(saved)):
            with self.subTest(path=path.parent.name):
                original = path.read_bytes()
                outside = self.base / (path.parent.name + "-outside.json")
                outside.write_bytes(original)
                path.unlink()
                path.symlink_to(outside)
                self.assertAssetError(self.read, saved)
                self.assertAssetError(self.stage)
                self.assertEqual(outside.read_bytes(), original)
                path.unlink()
                path.write_bytes(original)
                path.chmod(0o600)


def svg_fixture(body=b'<path d="M0 0h10v10H0z" fill="#123456"/>',
                attrs='width="124" height="23" viewBox="0 0 124 23"'):
    return b'<svg xmlns="http://www.w3.org/2000/svg" ' + attrs.encode() + b'>' + body + b'</svg>'


try:
    from PIL import Image as _PillowImage
    HAS_PILLOW = True
except ImportError:  # pragma: no cover - conversion tests skip without Pillow
    HAS_PILLOW = False


class SVGValidationTests(AssetAssertions):
    def test_plain_vector_logo_reports_measured_dimensions(self):
        result = assets.inspect_svg(svg_fixture())
        self.assertEqual(result['mime'], 'image/svg+xml')
        self.assertEqual((result['width'], result['height']), (124, 23))
        self.assertEqual(result['validation'], 'svg-safe-v0')
        self.assertIsNone(result['bit_depth'])
        self.assertIsNone(result['color_type'])
        viewbox = assets.inspect_svg(svg_fixture(attrs='viewBox="0 0 1900 213.23"'))
        self.assertEqual((viewbox['width'], viewbox['height']), (1900, 213))

    def test_active_and_remote_svg_content_is_rejected(self):
        for data in (
            svg_fixture(b'<script>alert(1)</script>'),
            svg_fixture(b'<foreignObject><p>hi</p></foreignObject>'),
            svg_fixture(b'<rect onclick="alert(1)" width="1" height="1"/>'),
            svg_fixture(b'<image href="https://example.com/tracker.png" width="1" height="1"/>'),
            svg_fixture(b'<use href="https://example.com/defs.svg#x"/>'),
            b'<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY x "y">]>' + svg_fixture(),
            b'<svg><svg>',
            svg_fixture(attrs=''),
        ):
            with self.subTest(data=data[:40]):
                self.assertAssetError(assets.inspect_svg, data)

    def test_local_fragment_use_and_style_are_allowed(self):
        data = svg_fixture(b'<defs><path id="p" d="M0 0h1v1H0z"/></defs><use href="#p"/><style>.a{fill:#fff;}</style>')
        result = assets.inspect_svg(data)
        self.assertEqual(result['validation'], 'svg-safe-v0')

    def test_style_can_reference_a_local_gradient_without_allowing_a_network_reference(self):
        gradient = b'<defs><linearGradient id="mark"/></defs>'
        styles = b'<style>.brand { fill: url(#mark); }</style>'
        self.assertEqual(assets.inspect_svg(svg_fixture(gradient + styles))['validation'], 'svg-safe-v0')
        external = b'<style>.other { fill: url(//example.com/mark.svg#paint); }</style>'
        self.assertAssetError(assets.inspect_svg, svg_fixture(gradient + styles + external))

    def test_svg_dispatches_by_declared_mime(self):
        result = assets.inspect_image(svg_fixture(), declared_mime='image/svg+xml')
        self.assertEqual(result['validation'], 'svg-safe-v0')
        self.assertAssetError(assets.inspect_image, svg_fixture(), declared_mime='image/png')


class ConversionTests(AssetAssertions):
    def test_svg_has_no_approved_rasterizer(self):
        self.assertAssetError(assets.convert_image, svg_fixture(), 'svg')

    @unittest.skipUnless(HAS_PILLOW, 'Pillow is required for conversion tests')
    def test_png_reencode_strips_ancillary_chunks(self):
        original = png(before_idat=chunk(b'tEXt', b'key\x00content'))
        self.assertAssetError(assets.inspect_png, original)
        converted, record = assets.convert_image(original, 'png')
        blob = assets.inspect_png(converted)
        self.assertEqual(record['original_sha256'], hashlib.sha256(original).hexdigest())
        self.assertEqual(record['derivative_sha256'], blob['sha256'])
        self.assertNotEqual(record['original_sha256'], record['derivative_sha256'])
        self.assertEqual(record['transformation'], 'png-strict-reencode')
        self.assertEqual((record['width'], record['height']), (2, 2))

    @unittest.skipUnless(HAS_PILLOW, 'Pillow is required for conversion tests')
    def test_interlaced_png_is_reencoded_not_relabeled(self):
        # A real 2x2 Adam7 image: passes 1, 6 and 7 carry pixels; the
        # fixture's scanlines are valid interlaced data, not a corrupt file.
        pixel = b'\x18\x7f\xc2\xff'
        passes = (b'\x00' + pixel) + (b'\x00' + pixel) + (b'\x00' + pixel * 2)
        header = struct.pack('>IIBBBBB', 2, 2, 8, 6, 0, 0, 1)
        original = (PNG_SIGNATURE + chunk(b'IHDR', header)
                    + chunk(b'IDAT', zlib.compress(passes)) + chunk(b'IEND'))
        self.assertAssetError(assets.inspect_png, original)
        converted, _record = assets.convert_image(original, 'png')
        self.assertEqual(assets.inspect_png(converted)['validation'], 'png-rgb8-v0')

    @unittest.skipUnless(HAS_PILLOW, 'Pillow is required for conversion tests')
    def test_png_conversion_preserves_transparent_pixels_without_metadata_chunks(self):
        source = _PillowImage.new('RGB', (2, 1))
        source.putdata([(20, 40, 60), (5, 10, 15)])
        buffer = io.BytesIO()
        source.save(buffer, format='PNG', transparency=(20, 40, 60), dpi=(144, 144))
        converted, _record = assets.convert_image(buffer.getvalue(), 'png')
        assets.inspect_png(converted)
        with _PillowImage.open(io.BytesIO(converted)) as image:
            self.assertEqual(image.getpixel((0, 0)), (20, 40, 60, 0))
            self.assertEqual(image.getpixel((1, 0)), (5, 10, 15, 255))

    @unittest.skipUnless(HAS_PILLOW, 'Pillow is required for conversion tests')
    def test_webp_converts_to_strict_png(self):
        buffer = io.BytesIO()
        _PillowImage.new('RGB', (4, 2), (10, 20, 30)).save(buffer, format='WEBP')
        converted, record = assets.convert_image(buffer.getvalue(), 'webp')
        self.assertEqual(record['transformation'], 'webp-to-png')
        self.assertEqual((record['width'], record['height']), (4, 2))
        self.assertEqual(assets.inspect_png(converted)['validation'], 'png-rgb8-v0')

    @unittest.skipUnless(HAS_PILLOW, 'Pillow is required for conversion tests')
    def test_declared_format_must_match_decoded_bytes(self):
        self.assertAssetError(assets.convert_image, png(), 'webp')


class ConversionProvenanceTests(AssetAssertions):
    def setUp(self):
        self.blob = assets.inspect_png(png())

    def test_conversion_record_binds_original_to_derivative(self):
        source = provenance()
        source['conversion'] = {
            'original_sha256': 'a' * 64, 'original_format': 'webp',
            'derivative_sha256': self.blob['sha256'], 'transformation': 'webp-to-png',
            'tool': 'Pillow 10.2.0'}
        result = assets.validate_provenance(source, self.blob)
        self.assertEqual(result['provenance']['conversion']['original_format'], 'webp')

    def test_conversion_with_a_mismatched_derivative_is_rejected(self):
        source = provenance()
        source['conversion'] = {
            'original_sha256': 'a' * 64, 'original_format': 'webp',
            'derivative_sha256': 'b' * 64, 'transformation': 'webp-to-png',
            'tool': 'Pillow 10.2.0'}
        self.assertAssetError(assets.validate_provenance, source, self.blob)

    def test_nominative_use_is_an_approved_rights_basis(self):
        source = provenance()
        source['rights'].update(basis='nominative',
                                evidence='The subject\u2019s own published brand mark, displayed with attribution.')
        result = assets.validate_provenance(source, self.blob)
        self.assertEqual(result['provenance']['rights']['basis'], 'nominative')


class SVGStageTests(PrivateStageTests):
    def test_svg_stages_and_prepares_through_the_same_gate(self):
        data = svg_fixture()
        source = provenance()
        source.update(subject_id='partner:fixture-company', source_kind='official-brand')
        saved = self.store.stage(data, source, declared_mime='image/svg+xml')
        self.assertEqual(saved['manifest']['blob']['validation'], 'svg-safe-v0')
        readback = self.read(saved)
        self.assertEqual(readback['manifest']['blob']['sha256'],
                         hashlib.sha256(data).hexdigest())
        prepared = self.prepare(saved, subject_id='partner:fixture-company', role='logo')
        self.assertIs(prepared['prepared'], True)
        self.assertEqual(self.store.read_bytes(saved['asset_id'], saved['asset_revision']), data)

    def test_nominative_rights_prepare_for_public_export(self):
        source = provenance()
        source['rights'].update(basis='nominative',
                                evidence='The subject\u2019s own published brand mark, displayed with attribution.')
        saved = self.stage(source)
        prepared = self.prepare(saved)
        self.assertIs(prepared['prepared'], True)


if __name__ == "__main__":
    unittest.main()
