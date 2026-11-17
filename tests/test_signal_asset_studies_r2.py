"""Provenance and portable-geometry contracts for the isolated r2 study packet."""

import hashlib
import importlib.util
import json
import re
import tempfile
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "web/assets/design-lab/signal-explorations/r2"
NS = "{http://www.w3.org/2000/svg}"
SPEC = importlib.util.spec_from_file_location("signal_r2_generator", ROOT / "scripts/make-signal-studies-r2.py")
GENERATOR = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(GENERATOR)


class SignalR2Studies(unittest.TestCase):
    def setUp(self):
        self.manifest = json.loads((OUT / "manifest.json").read_text())

    def test_reproduction_matches_delivered_bytes_without_touching_r1(self):
        r1 = {p.name: p.read_bytes() for p in OUT.parent.iterdir() if p.is_file()}
        with tempfile.TemporaryDirectory() as temporary:
            target = Path(temporary)
            GENERATOR.build(target)
            first = {p.name: p.read_bytes() for p in target.iterdir()}
            GENERATOR.build(target)
            self.assertEqual(first, {p.name: p.read_bytes() for p in target.iterdir()})
            for name, raw in first.items():
                self.assertEqual(raw, (OUT / name).read_bytes(), name + " is stale")
        self.assertEqual(r1, {p.name: p.read_bytes() for p in OUT.parent.iterdir() if p.is_file()})

    def test_complete_manifest_and_experimental_provenance(self):
        manifest = self.manifest
        self.assertEqual(manifest["status"], "experimental-review-collection")
        self.assertIsNone(manifest["identity_approval"])
        self.assertIsNone(manifest["fact_source"])
        self.assertEqual(manifest["provenance"]["class"], "original-authored-vector")
        self.assertIsNone(manifest["provenance"]["generated_image_source"])
        self.assertIsNone(manifest["provenance"]["prompt"])
        self.assertEqual(len(manifest["artworks"]), 6)
        self.assertEqual(len(manifest["assets"]), 18)
        self.assertEqual(len({item["file"] for item in manifest["assets"]}), 18)
        self.assertEqual({item["file"] for item in manifest["assets"]}, {p.name for p in OUT.glob("*.svg")})
        for artwork in manifest["artworks"]:
            self.assertFalse(artwork["operational_identity"])
            self.assertIsNone(artwork["user_selection"])
            self.assertTrue(artwork["meaning"] and artwork["placements"] and artwork["avoid"] and artwork["sources"])
            self.assertEqual(set(artwork["files"]), {"light", "dark", "mono"})
        for asset in manifest["assets"]:
            self.assertEqual(Path(asset["file"]).name, asset["file"])
            raw = (OUT / asset["file"]).read_bytes()
            self.assertEqual(hashlib.sha256(raw).hexdigest(), asset["sha256"])
            self.assertEqual(len(raw), asset["bytes"])
            self.assertIn(asset["minimum_size_px"], (32, 160))
            self.assertGreater(len(asset["alpha_probes"]), 1)

    def test_self_contained_static_svg_and_accessible_layers(self):
        allowed = {"svg", "title", "desc", "g", "path"}
        for asset in self.manifest["assets"]:
            raw = (OUT / asset["file"]).read_text()
            self.assertNotRegex(raw, r"<!DOCTYPE|<!ENTITY|<\?(?!xml\s)")
            svg = ET.fromstring(raw)
            self.assertEqual(svg.tag, NS + "svg")
            self.assertEqual(svg.attrib["viewBox"], asset["viewBox"])
            self.assertEqual(int(svg.attrib["width"]), asset["width"])
            self.assertEqual(int(svg.attrib["height"]), asset["height"])
            ids = [el.attrib["id"] for el in svg.iter() if "id" in el.attrib]
            self.assertEqual(len(ids), len(set(ids)))
            self.assertIn(svg.attrib["aria-labelledby"], ids)
            self.assertIn(svg.attrib["aria-describedby"], ids)
            self.assertIn("Experimental illustration", svg.find(NS + "desc").text)
            self.assertEqual([el.attrib["id"] for el in svg.findall(NS + "g")], asset["layers"])
            for el in svg.iter():
                self.assertIn(el.tag.removeprefix(NS), allowed)
                for key, value in el.attrib.items():
                    self.assertFalse(key.lower().startswith("on"))
                    self.assertNotIn("href", key.lower())
                    self.assertNotIn(key, ("style", "filter", "clip-path"))
                    if key in ("fill", "stroke"):
                        self.assertRegex(value, r"^#[0-9a-f]{6}$")

    def test_theme_exports_preserve_geometry_and_paint_order(self):
        for artwork in self.manifest["artworks"]:
            geometry = []
            for file in artwork["files"].values():
                svg = ET.parse(OUT / file).getroot()
                geometry.append([(el.tag, {k: v for k, v in el.attrib.items() if k not in ("fill", "stroke")})
                                 for el in svg.iter() if el.tag in (NS + "g", NS + "path")])
            self.assertEqual(geometry[0], geometry[1], artwork["id"])
            self.assertEqual(geometry[1], geometry[2], artwork["id"])

    def test_comparison_plates_are_the_same_shape_translated(self):
        svg = ET.parse(OUT / "measure-compare-r2-light.svg").getroot()
        numbers = []
        for name in ("comparison-plate-left", "comparison-plate-right"):
            d = svg.find(f"{NS}g[@id='{name}']/{NS}path").attrib["d"]
            values = [float(v) for v in re.findall(r"-?\d+(?:\.\d+)?", d)]
            numbers.append(list(zip(values[::2], values[1::2])))
        self.assertEqual(len(numbers[0]), len(numbers[1]))
        for left, right in zip(*numbers):
            self.assertAlmostEqual(right[0] - left[0], 183, places=3)
            self.assertAlmostEqual(right[1] - left[1], -47.58, places=3)


if __name__ == "__main__":
    unittest.main()
