"""Offline checks for the reviewed asset publishing adapter.

All images and entities are synthetic. No test fetches a source, writes a
real repository branch, or demonstrates publication.
"""

from contextlib import redirect_stdout
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import struct
import tempfile
import unittest
import zlib

SPEC = importlib.util.spec_from_file_location(
    "publish_asset", Path(__file__).resolve().parents[1] / "scripts" / "publish_asset.py")
publish = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(publish)
ASSETS_SPEC = importlib.util.spec_from_file_location(
    "atlas_assets", Path(__file__).resolve().parents[1] / "scripts" / "atlas_assets.py")
assets = importlib.util.module_from_spec(ASSETS_SPEC)
ASSETS_SPEC.loader.exec_module(assets)

PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


def chunk(kind, payload=b""):
    return struct.pack(">I", len(payload)) + kind + payload + struct.pack(">I", zlib.crc32(kind + payload) & 0xFFFFFFFF)


def png(width=2, height=2):
    raw = (b"\x00" + b"\x18\x7f\xc2\xff" * width) * height
    header = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    return PNG_SIGNATURE + chunk(b"IHDR", header) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND")


SVG = (b'<svg xmlns="http://www.w3.org/2000/svg" width="124" height="23" viewBox="0 0 124 23">'
       b'<path d="M0 0h10v10H0z" fill="#123456"/></svg>')


def provenance(subject_id="partner:example-ventures", role="logo", **overrides):
    base = {
        "subject_id": subject_id,
        "role": role,
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
            "evidence": "Synthetic fixture is explicitly bound to Example Ventures.",
            "reviewer": "fixture-reviewer",
            "reviewed_at": "2026-01-01T00:00:00Z",
        },
        "rights": {
            "decision": "approved",
            "basis": "nominative",
            "evidence_url": "https://example.com/brand",
            "evidence": "The subject's own published brand mark, displayed with attribution.",
            "attribution": "Example Ventures",
            "reviewer": "fixture-reviewer",
            "reviewed_at": "2026-01-01T00:00:00Z",
            "public_repository": True,
            "public_website": True,
        },
    }
    base.update(overrides)
    return base


LOGOS_JS = """// Only explicitly reviewed names are mapped; no name-to-identity guessing.
const logos = Object.freeze({
  'Existing':'existing'
});
export function logoFor(name) {
  const slug=Object.hasOwn(logos,name)?logos[name]:null;
  return slug ? `./assets/logos/${slug.endsWith('.png') ? slug : `${slug}.svg`}` : null;
}
export const logoEntries=Object.freeze(Object.entries(logos));

const darkTiles = new Set(['Existing']);
const wideMarks = new Set([]);
export function logoClassFor(name) {
  return [darkTiles.has(name)?'logo-on-dark':'',wideMarks.has(name)?'logo-wide':''].filter(Boolean).join(' ');
}
"""


def make_repo(base):
    repo = base / "repo"
    (repo / "data").mkdir(parents=True)
    (repo / "web" / "assets" / "logos").mkdir(parents=True)
    (repo / "data" / "partners-reviewed.json").write_text(json.dumps({
        "Example Ventures": {"website": "https://example.com/", "description": "x",
                             "source": "https://example.com/", "reviewed_at": "2026-11-21"}}))
    (repo / "data" / "partner-profiles.json").write_text(json.dumps({
        "Example Ventures": {"type": "Venture capital", "people": [
            {"name": "Alex Example", "role": "Founder", "source": "https://example.com/team"}]}}))
    (repo / "data" / "startup-research.json").write_text(json.dumps({
        "startups": [{"name": "Example Co", "founders": [
            {"name": "Sam Sample", "source": "https://example.com/team"}]}]}))
    (repo / "web" / "logos.js").write_text(LOGOS_JS)
    return repo


class PublishTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="atlas-publish-test-")
        self.addCleanup(self.temporary.cleanup)
        self.base = Path(self.temporary.name).resolve(strict=True)
        self.repo = make_repo(self.base)
        self.store = assets.StageStore(self.base / "private-store")
        self.data = png()

    def stage(self, data=None, source=None, **kwargs):
        return self.store.stage(self.data if data is None else data,
                                provenance() if source is None else source, **kwargs)

    def run_publish(self, receipt, name, subject_id, role, extra=None):
        args = ["--store", str(self.base / "private-store"),
                "--asset-id", receipt["asset_id"], "--asset-revision", receipt["asset_revision"],
                "--name", name, "--subject-id", subject_id, "--role", role,
                "--repo", str(self.repo)] + (extra or [])
        stdout = io.StringIO()
        with redirect_stdout(stdout):
            status = publish.main(args)
        return status, json.loads(stdout.getvalue())

    def test_logo_publish_writes_bytes_manifest_and_map(self):
        receipt = self.stage()
        status, result = self.run_publish(receipt, "Example Ventures", "partner:example-ventures", "logo")
        self.assertEqual(status, 0, result)
        self.assertIs(result["ok"], True)
        target = self.repo / "web" / "assets" / "logos" / "example-ventures.png"
        self.assertEqual(target.read_bytes(), self.data)
        manifest = json.loads((self.repo / "web" / "assets" / "manifests" /
                               (receipt["asset_id"].removeprefix("asset:sha256:") + ".json")).read_text())
        self.assertEqual(manifest["asset_id"], receipt["asset_id"])
        self.assertEqual(manifest["name"], "Example Ventures")
        self.assertEqual(manifest["provenance"]["rights"]["basis"], "nominative")
        self.assertIn('"Example Ventures":"example-ventures.png"',
                      (self.repo / "web" / "logos.js").read_text())
        self.assertIn("web/assets/logos/example-ventures.png", result["result"]["wrote"])

    def test_logo_publish_with_tile_flags_writes_valid_entries(self):
        receipt = self.stage()
        status, result = self.run_publish(receipt, "Example Ventures", "partner:example-ventures",
                                          "logo", ["--dark-tile", "--wide"])
        self.assertEqual(status, 0, result)
        text = (self.repo / "web" / "logos.js").read_text()
        self.assertIn("  'Existing':'existing',\n  \"Example Ventures\":\"example-ventures.png\",\n});", text)
        self.assertIn("const darkTiles = new Set(['Existing',\"Example Ventures\"]);", text)
        self.assertIn("const wideMarks = new Set([\"Example Ventures\"]);", text)

    def test_colon_in_reviewed_name_preserved_with_safe_logo_path(self):
        records = self.repo / "data" / "startup-research.json"
        records.write_text(json.dumps({"startups": [{"name": "T:0"}]}))
        receipt = self.stage(source=provenance(subject_id="startup:t-0"))
        status, result = self.run_publish(receipt, "T:0", "startup:t-0", "logo")
        self.assertEqual(status, 0, result)
        self.assertEqual(result["result"]["target"], "web/assets/logos/t-0.png")
        self.assertEqual(json.loads(records.read_text())["startups"][0], {
            "name": "T:0",
            "logo": publish.SITE_ORIGIN + "/assets/logos/t-0.png",
            "logo_source": "https://example.com/brand",
        })

    def test_dry_run_writes_nothing(self):
        receipt = self.stage()
        status, result = self.run_publish(receipt, "Example Ventures", "partner:example-ventures",
                                          "logo", ["--dry-run"])
        self.assertEqual(status, 0, result)
        self.assertIs(result["result"]["dry_run"], True)
        self.assertFalse(list((self.repo / "web" / "assets" / "logos").iterdir()))

    def test_unreviewed_asset_is_refused_before_any_write(self):
        source = provenance()
        source["rights"]["decision"] = "unknown"
        source["rights"]["public_repository"] = False
        source["rights"]["public_website"] = False
        receipt = self.stage(source=source)
        status, result = self.run_publish(receipt, "Example Ventures", "partner:example-ventures", "logo")
        self.assertEqual(status, 1)
        self.assertIs(result["ok"], False)
        self.assertFalse(list((self.repo / "web" / "assets" / "logos").iterdir()))

    def test_unknown_name_is_refused(self):
        receipt = self.stage()
        status, result = self.run_publish(receipt, "No Such Org", "partner:no-such-org", "logo")
        self.assertEqual(status, 1)
        self.assertIs(result["ok"], False)
        self.assertFalse(list((self.repo / "web" / "assets" / "logos").iterdir()))

    def test_republish_is_idempotent(self):
        receipt = self.stage()
        first = self.run_publish(receipt, "Example Ventures", "partner:example-ventures", "logo")
        self.assertEqual(first[0], 0, first[1])
        second = self.run_publish(receipt, "Example Ventures", "partner:example-ventures", "logo")
        self.assertEqual(second[0], 0, second[1])
        self.assertEqual(second[1]["result"]["wrote"], [])

    def test_existing_different_bytes_are_refused(self):
        target = self.repo / "web" / "assets" / "logos" / "example-ventures.png"
        target.write_bytes(b"not the reviewed logo")
        receipt = self.stage()
        status, result = self.run_publish(receipt, "Example Ventures", "partner:example-ventures", "logo")
        self.assertEqual(status, 1)
        self.assertIs(result["ok"], False)
        self.assertEqual(target.read_bytes(), b"not the reviewed logo")

    def test_svg_logo_publishes_with_svg_extension(self):
        source = provenance()
        receipt = self.stage(data=SVG, source=source, declared_mime="image/svg+xml")
        status, result = self.run_publish(receipt, "Example Ventures", "partner:example-ventures", "logo")
        self.assertEqual(status, 0, result)
        self.assertTrue((self.repo / "web" / "assets" / "logos" / "example-ventures.svg").exists())
        self.assertIn('"Example Ventures":"example-ventures"',
                      (self.repo / "web" / "logos.js").read_text())

    def test_portrait_publish_sets_partner_person_photo(self):
        source = provenance(subject_id="person:alex-example", role="portrait",
                            source_kind="labelled-portrait")
        receipt = self.stage(source=source)
        status, result = self.run_publish(receipt, "Alex Example", "person:alex-example",
                                          "portrait")
        self.assertEqual(status, 0, result)
        profiles = json.loads((self.repo / "data" / "partner-profiles.json").read_text())
        person = profiles["Example Ventures"]["people"][0]
        self.assertEqual(person["photo"],
                         "https://castlemilk.github.io/startup-atlas/assets/portraits/alex-example.png")
        self.assertEqual(person["photo_source"], "https://example.com/brand")
        self.assertTrue((self.repo / "web" / "assets" / "portraits" / "alex-example.png").exists())

    def test_founder_portrait_sets_photo_url(self):
        source = provenance(subject_id="person:sam-sample", role="portrait",
                            source_kind="labelled-portrait")
        receipt = self.stage(source=source)
        status, result = self.run_publish(receipt, "Sam Sample", "person:sam-sample", "portrait")
        self.assertEqual(status, 0, result)
        research = json.loads((self.repo / "data" / "startup-research.json").read_text())
        founder = research["startups"][0]["founders"][0]
        self.assertEqual(founder["photo_url"],
                         "https://castlemilk.github.io/startup-atlas/assets/portraits/sam-sample.png")
        self.assertEqual(founder["photo_source"], "https://example.com/brand")

    def test_startup_logo_sets_attributed_asset_on_exact_record(self):
        receipt = self.stage(data=SVG, source=provenance(subject_id="startup:example-co"),
                             declared_mime="image/svg+xml")
        status, result = self.run_publish(receipt, "Example Co", "startup:example-co", "logo")
        self.assertEqual(status, 0, result)
        record = json.loads((self.repo / "data" / "startup-research.json").read_text())["startups"][0]
        self.assertEqual(record["logo"], "https://castlemilk.github.io/startup-atlas/assets/logos/example-co.svg")
        self.assertEqual(record["logo_source"], "https://example.com/brand")
        self.assertEqual((self.repo / "web" / "logos.js").read_text(), LOGOS_JS)
        self.assertEqual(self.run_publish(receipt, "Example Co", "startup:example-co", "logo")[1]["result"]["wrote"], [])

    def test_startup_logo_rejects_different_subject_before_writing(self):
        receipt = self.stage(source=provenance(subject_id="startup:another-company"))
        status, result = self.run_publish(receipt, "Example Co", "startup:another-company", "logo")
        self.assertEqual(status, 1, result)
        self.assertFalse((self.repo / "web" / "assets" / "logos" / "example-co.png").exists())

    def test_catalogue_logo_requires_the_exact_provider_name(self):
        catalogue = self.repo / "data" / "catalogue.json"
        catalogue.write_text(json.dumps({"opportunities": [{"org": "Example Cloud"}]}))
        receipt = self.stage(source=provenance(subject_id="provider:example-cloud"))
        status, result = self.run_publish(receipt, "Example Cloud", "provider:example-cloud", "logo")
        self.assertEqual(status, 0, result)
        self.assertIn('"Example Cloud":"example-cloud.png"', (self.repo / "web" / "logos.js").read_text())
        unknown = self.stage(source=provenance(subject_id="provider:other-cloud"))
        self.assertEqual(self.run_publish(unknown, "Other Cloud", "provider:other-cloud", "logo")[0], 1)
        self.assertFalse((self.repo / "web" / "assets" / "logos" / "other-cloud.png").exists())

    def test_name_pattern_accepts_unicode_letters_and_apostrophes(self):
        for name in ("Jeremy O’Brien", "Kristo Käärmann", "Alex Example", "T:0"):
            self.assertIsNotNone(publish.NAME.fullmatch(name), name)
        for name in ("../Evil Name", "Evil/Name", "Evil\\Name", ".Evil Name",
                     "Evil;Name", "Evil*Name", ""):
            self.assertIsNone(publish.NAME.fullmatch(name), name)

    def test_portrait_publish_accepts_unicode_founder_names(self):
        records = self.repo / "data" / "startup-research.json"
        records.write_text(json.dumps({"startups": [{"name": "Example Co", "founders": [
            {"name": "Kristo Käärmann", "source": "https://example.com/team"},
            {"name": "Jeremy O’Brien", "source": "https://example.com/team"}]}]}))
        for name, subject, data in (("Kristo Käärmann", "person:kristo-k-rmann", None),
                                    ("Jeremy O’Brien", "person:jeremy-o-brien", png(3, 3))):
            receipt = self.stage(data=data, source=provenance(
                subject_id=subject, role="portrait", source_kind="labelled-portrait"))
            status, result = self.run_publish(receipt, name, subject, "portrait")
            self.assertEqual(status, 0, result)
        founders = json.loads(records.read_text())["startups"][0]["founders"]
        self.assertEqual(founders[0]["photo_url"],
                         publish.SITE_ORIGIN + "/assets/portraits/kristo-k-rmann.png")
        self.assertEqual(founders[1]["photo_url"],
                         publish.SITE_ORIGIN + "/assets/portraits/jeremy-o-brien.png")
        self.assertTrue((self.repo / "web" / "assets" / "portraits" /
                         "kristo-k-rmann.png").exists())
        self.assertTrue((self.repo / "web" / "assets" / "portraits" /
                         "jeremy-o-brien.png").exists())

    def test_founder_selection_updates_only_the_named_reviewed_startup(self):
        path = self.repo / "data" / "startup-research.json"
        research = json.loads(path.read_text())
        research["startups"].append({"name": "Other Co", "founders": [
            {"name": "Sam Sample", "source": "https://example.com/other-team"}]})
        path.write_text(json.dumps(research))
        receipt = self.stage(source=provenance(subject_id="person:sam-sample", role="portrait",
                                               source_kind="labelled-portrait"))
        args = (receipt, "Sam Sample", "person:sam-sample", "portrait")
        self.assertEqual(self.run_publish(*args)[0], 1)
        status, result = self.run_publish(*args, extra=["--founder-of", "Example Co"])
        self.assertEqual(status, 0, result)
        updated = json.loads(path.read_text())
        self.assertIn("photo_url", updated["startups"][0]["founders"][0])
        self.assertEqual(updated["startups"][1], research["startups"][1])


if __name__ == "__main__":
    unittest.main()
