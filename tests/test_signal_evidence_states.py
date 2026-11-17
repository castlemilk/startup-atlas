"""Portable-art and semantic contracts for the experimental evidence studies.

These checks inspect authored assets and guidance; they do not classify records.
Colour calculations concern solid source paints on the declared backgrounds,
not antialiased pixels or whole-page accessibility.
"""

import hashlib
import json
import re
import subprocess
import sys
import tempfile
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "web/assets/design-lab/signal-evidence-states/r1"
GENERATOR = ROOT / "scripts/make-signal-evidence-states.py"
NS = "{http://www.w3.org/2000/svg}"
CONDITIONS = {"unknown", "unavailable", "stale", "reviewed"}
THEMES = {"light", "dark", "mono"}


def luminance(colour):
    channels = [int(colour[index:index + 2], 16) / 255 for index in (1, 3, 5)]
    linear = [value / 12.92 if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4
              for value in channels]
    return sum(value * weight for value, weight in zip(linear, (0.2126, 0.7152, 0.0722)))


def contrast(first, second):
    high, low = sorted((luminance(first), luminance(second)), reverse=True)
    return (high + 0.05) / (low + 0.05)


def geometry(svg):
    """Ignore palette and prose, but preserve paths, strokes and paint order."""
    return [(element.tag, {key: value for key, value in element.attrib.items()
                           if key not in ("fill", "stroke")})
            for element in svg.iter() if element.tag in (NS + "g", NS + "path")]


class SignalEvidenceStudies(unittest.TestCase):
    def setUp(self):
        self.manifest = json.loads((OUT / "manifest.json").read_text(encoding="utf-8"))
        self.artworks = {item["condition"]: item for item in self.manifest["artworks"]}

    def test_cli_regeneration_is_deterministic_and_preserves_preceding_masters(self):
        previous = ROOT / "web/assets/design-lab/signal-explorations"
        protected = [path for directory in (previous, previous / "r2")
                     for path in (*directory.glob("*.svg"), directory / "manifest.json")]
        protected += [ROOT / "scripts/make-signal-studies.py",
                      ROOT / "scripts/make-signal-studies-r2.py"]
        before = {path: path.read_bytes() for path in protected}
        expected = {"manifest.json"} | {asset["file"] for asset in self.manifest["assets"]}
        with tempfile.TemporaryDirectory() as temporary:
            target = Path(temporary) / "exports"
            command = [sys.executable, "-B", str(GENERATOR), "--out", str(target)]
            subprocess.run(command, check=True, capture_output=True, text=True)
            first = {path.name: path.read_bytes() for path in target.iterdir()}
            self.assertEqual(set(first), expected)
            subprocess.run(command, check=True, capture_output=True, text=True)
            self.assertEqual(first, {path.name: path.read_bytes() for path in target.iterdir()})
            for name, raw in first.items():
                self.assertEqual(raw, (OUT / name).read_bytes(), name + " needs regeneration")
        self.assertEqual(before, {path: path.read_bytes() for path in protected})

    def test_asset_inventory_dimensions_and_checksums(self):
        self.assertEqual(len(self.manifest["artworks"]), 4)
        self.assertEqual(set(self.artworks), CONDITIONS)
        assets = self.manifest["assets"]
        self.assertEqual(len(assets), 12)
        self.assertEqual(len({asset["id"] for asset in assets}), 12)
        self.assertEqual(len({asset["file"] for asset in assets}), 12)
        self.assertEqual({asset["file"] for asset in assets}, {path.name for path in OUT.glob("*.svg")})
        self.assertEqual({(asset["family"], asset["theme"]) for asset in assets},
                         {(condition, theme) for condition in CONDITIONS for theme in THEMES})
        for condition, artwork in self.artworks.items():
            self.assertEqual(set(artwork["files"]), THEMES)
            self.assertEqual(artwork["minimum_display_width"], 64)
            for asset in (item for item in assets if item["family"] == condition):
                with self.subTest(file=asset["file"]):
                    self.assertEqual(Path(asset["file"]).name, asset["file"])
                    self.assertEqual(artwork["files"][asset["theme"]], asset["file"])
                    self.assertEqual((asset["width"], asset["height"]), (256, 192))
                    self.assertEqual(asset["viewBox"], "0 0 256 192")
                    self.assertEqual(asset["minimum_size_px"], 64)
                    raw = (OUT / asset["file"]).read_bytes()
                    self.assertEqual(hashlib.sha256(raw).hexdigest(), asset["sha256"])
                    self.assertEqual(len(raw), asset["bytes"])
                    self.assertTrue(asset["alt"].strip())
                    self.assertGreaterEqual(len(asset["alpha_probes"]), 3)
                    for x, y in asset["alpha_probes"]:
                        self.assertTrue(0 <= x < asset["width"] and 0 <= y < asset["height"])

    def test_collection_is_experimental_and_conditions_can_coexist(self):
        manifest = self.manifest
        self.assertEqual(manifest["status"], "experimental-review-collection")
        self.assertIs(manifest["conditions_can_overlap"], True)
        self.assertIs(manifest["state_machine"], False)
        self.assertIs(manifest["automatic_classification"], False)
        self.assertIsNone(manifest["freshness_policy"])
        self.assertIsNone(manifest["fact_source"])
        self.assertIsNone(manifest["user_selection"])
        self.assertIs(manifest["operational_identity"], False)
        self.assertEqual(manifest["provenance"]["class"], "original-authored-vector")
        self.assertIsNone(manifest["provenance"]["generated_image_source"])
        self.assertIsNone(manifest["provenance"]["prompt"])
        self.assertIs(manifest["contrast_contract"]["colour_only_meaning"], False)
        self.assertIs(manifest["contrast_contract"]["requires_live_text"], True)
        overlap = manifest["coexistence"].lower()
        for condition in ("reviewed", "stale", "unavailable"):
            self.assertIn(condition, overlap)
        for artwork in self.artworks.values():
            self.assertIs(artwork["operational_identity"], False)
            self.assertIsNone(artwork["user_selection"])
            rule = artwork["host_rule"].lower()
            self.assertRegex(rule, r"visible.*label")
            self.assertIn("scope", rule)
            self.assertRegex(rule, r"(?:not|never).*sole status")

    def test_provenance_references_are_pinned_and_local_paths_are_bounded(self):
        revision = self.manifest["base_revision"]
        self.assertRegex(revision, r"^[0-9a-f]{40}$")
        sources = self.manifest["sources"]
        self.assertEqual(len({source["path"] for source in sources}), len(sources))
        self.assertTrue(sources)
        for source in sources:
            path = Path(source["path"])
            self.assertFalse(path.is_absolute())
            self.assertNotIn("..", path.parts)
            self.assertTrue((ROOT / path).is_file())
            self.assertRegex(source["sha256"], r"^[0-9a-f]{64}$")
            self.assertEqual(source["reference"],
                             f"https://github.com/castlemilk/startup-atlas/blob/{revision}/{source['path']}")
            self.assertTrue(source["use"].strip())
        # These hashes describe the pinned revision, not mutable future tokens.
        self.assertEqual(self.manifest["generator"], str(GENERATOR.relative_to(ROOT)))

    def test_each_condition_requires_its_own_context(self):
        requirements = {
            "unknown": (r"fact|condition", r"scope", r"missing|basis"),
            "unavailable": (r"source|section", r"attempt", r"time|date", r"reason",
                            r"retain|preserv", r"previous|existing"),
            "stale": (r"observation|review", r"date", r"rule|policy|reason", r"evaluat"),
            "reviewed": (r"source|claim|revision", r"scope", r"date", r"outcome",
                         r"review record|reviewer"),
        }
        for condition, concepts in requirements.items():
            with self.subTest(condition=condition):
                artwork = self.artworks[condition]
                context = " ".join(artwork["required_context"]).lower()
                for concept in concepts:
                    self.assertRegex(context, concept)
                self.assertTrue(artwork["definition"].strip())
                self.assertTrue(artwork["placement"].strip())
                # A placeholder caption cannot quietly assert a company fact or date.
                self.assertGreaterEqual(len(re.findall(r"\[[^\]]+\]", artwork["example_caption"])), 2)
                self.assertNotRegex(artwork["example_caption"], r"\b\d{4}-\d{2}-\d{2}\b")

    def test_semantic_limits_preserve_missing_access_freshness_and_review_distinctions(self):
        exclusions = {
            "unknown": (r"absent", r"zero", r"false", r"access|fetch", r"unreviewed"),
            "unavailable": (r"never existed|deleted", r"false", r"entire|every source"),
            "stale": (r"false", r"revoked|expired", r"universal.*threshold", r"build.*recency"),
            "reviewed": (r"forever|complete", r"endors", r"eligible", r"merged|deployed",
                         r"fresh", r"retriev", r"checked_at"),
        }
        for condition, concepts in exclusions.items():
            with self.subTest(condition=condition):
                limits = " ".join(self.artworks[condition]["does_not_mean"]).lower()
                for concept in concepts:
                    self.assertRegex(limits, concept)
        stale = self.artworks["stale"]["definition"].lower()
        self.assertRegex(stale, r"explicit policy|recorded.*decision")
        reviewed = self.artworks["reviewed"]["definition"].lower()
        self.assertRegex(reviewed, r"examined|reviewed")
        self.assertIn("scope", reviewed)

    def test_svg_is_static_self_contained_and_has_accessible_descriptions(self):
        attributes = {
            "svg": {"width", "height", "viewBox", "role", "aria-labelledby", "aria-describedby"},
            "title": {"id"}, "desc": {"id"},
            "g": {"id", "fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin"},
            "path": {"d", "fill-rule"},
        }
        for asset in self.manifest["assets"]:
            with self.subTest(file=asset["file"]):
                raw = (OUT / asset["file"]).read_text(encoding="utf-8")
                self.assertNotRegex(raw, r"<!DOCTYPE|<!ENTITY|<\?(?!xml\s)")
                svg = ET.fromstring(raw)
                self.assertEqual(svg.tag, NS + "svg")
                self.assertEqual(svg.attrib["viewBox"], asset["viewBox"])
                self.assertEqual((int(svg.attrib["width"]), int(svg.attrib["height"])),
                                 (asset["width"], asset["height"]))
                self.assertEqual(svg.attrib["role"], "img")
                ids = [element.attrib["id"] for element in svg.iter() if "id" in element.attrib]
                self.assertEqual(len(ids), len(set(ids)))
                for attribute, tag in (("aria-labelledby", "title"), ("aria-describedby", "desc")):
                    element = svg.find(f"{NS}{tag}[@id='{svg.attrib[attribute]}']")
                    self.assertIsNotNone(element)
                    self.assertTrue(element.text and element.text.strip())
                self.assertIn(asset["family"], svg.find(NS + "title").text.lower())
                description = svg.find(NS + "desc").text.lower()
                self.assertIn("experimental", description)
                self.assertRegex(description, r"adjacent.*text")
                self.assertEqual([group.attrib["id"] for group in svg.findall(NS + "g")], asset["layers"])
                self.assertEqual(set(asset["essential_layers"]), set(asset["layers"]) - {"source-relief"})
                for element in svg.iter():
                    self.assertTrue(element.tag.startswith(NS))
                    tag = element.tag[len(NS):]
                    self.assertIn(tag, attributes)
                    self.assertLessEqual(set(element.attrib), attributes[tag])
                    for key, value in element.attrib.items():
                        if key in ("fill", "stroke"):
                            self.assertRegex(value, r"^(?:none|#[0-9a-f]{6})$")
                        if key == "d":
                            self.assertRegex(value, r"^[MmZzLlHhVvCcSsQqTtAa0-9,.\s+\-]+$")

    def test_themes_preserve_geometry_stroke_weight_and_layer_order(self):
        for artwork in self.artworks.values():
            themed = [geometry(ET.parse(OUT / artwork["files"][theme]).getroot())
                      for theme in ("light", "dark", "mono")]
            self.assertEqual(themed[0], themed[1], artwork["id"])
            self.assertEqual(themed[1], themed[2], artwork["id"])

    def test_condition_cues_differ_in_monochrome_while_preserving_the_source_window(self):
        windows, cues = set(), set()
        for artwork in self.artworks.values():
            svg = ET.parse(OUT / artwork["files"]["mono"]).getroot()
            windows.add(svg.find(f"{NS}g[@id='source-window']/{NS}path").attrib["d"])
            # IDs and colours cannot make otherwise identical drawings pass.
            cues.add(tuple((group.attrib.get("stroke-width"), path.attrib["d"])
                           for group in svg.findall(NS + "g")
                           if group.attrib["id"] not in ("source-window", "source-relief")
                           for path in group.findall(NS + "path")))
        self.assertEqual(len(windows), 1)
        self.assertEqual(len(cues), 4)

    def test_actual_essential_paints_meet_contrast_on_every_declared_background(self):
        contract = self.manifest["contrast_contract"]
        self.assertEqual(set(contract["essential_roles"]), {"ink", "accent"})
        self.assertEqual(contract["essential_role_minimum_ratio"], 3)
        self.assertEqual(set(contract["decorative_roles"]), {"relief"})
        self.assertEqual(set(self.manifest["supported_backgrounds"]), THEMES)
        for asset in self.manifest["assets"]:
            with self.subTest(file=asset["file"]):
                palette = self.manifest["palettes"][asset["theme"]]
                essential_colours = {palette[role] for role in contract["essential_roles"]}
                hosts = self.manifest["supported_backgrounds"][asset["theme"]]
                self.assertTrue(hosts)
                svg = ET.parse(OUT / asset["file"]).getroot()
                for group in svg.findall(NS + "g"):
                    if group.attrib["id"] not in asset["essential_layers"]:
                        continue
                    paints = {group.attrib[key] for key in ("fill", "stroke")
                              if group.attrib.get(key, "none") != "none"}
                    self.assertTrue(paints)
                    self.assertLessEqual(paints, essential_colours)
                    for background in hosts:
                        self.assertRegex(background, r"^#[0-9a-f]{6}$")
                        for paint in paints | essential_colours:
                            self.assertGreaterEqual(contrast(paint, background), 3,
                                                    f"{asset['file']}: {paint} on {background}")


if __name__ == "__main__":
    unittest.main()
