#!/usr/bin/env python3
"""Reproduce the isolated Signal r2 vector studies and their provenance manifest.

Geometry is authored, illustrative, and fixed. No AI raster, data, external artwork,
or font is traced. Palette snapshots preserve this revision when runtime tokens move.
"""

import argparse
import hashlib
import json
from html import escape
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUT = ROOT / "web/assets/design-lab/signal-explorations/r2"
BASE = "d9a63d86c285c139a413b6b1fe9e79d3f6d72460"
DATE = "2026-11-17"
PALETTES = {
    "light": {"ink": "#111318", "face": "#ffffff", "depth": "#dfe3e8", "edge": "#7d899b", "accent": "#315efb"},
    "dark": {"ink": "#f4f6fa", "face": "#f4f6fa", "depth": "#adb6c5", "edge": "#718096", "accent": "#9aafff"},
    "mono": {key: "#111318" for key in ("ink", "face", "depth", "edge", "accent")},
}


def number(value):
    return f"{value:.3f}".rstrip("0").rstrip(".") if value else "0"


def polygon(points):
    return "M" + " L".join(f"{number(x)} {number(y)}" for x, y in points) + " Z"


def chamfer(x, y, width, height, corner=7):
    return [(x + corner, y), (x + width - corner, y), (x + width, y + corner),
            (x + width, y + height - corner), (x + width - corner, y + height),
            (x + corner, y + height), (x, y + height - corner), (x, y + corner)]


def project(points, origin):
    # Shared orthographic, three-quarter plane. It is a drawing convention,
    # not a physical simulation, a geographic projection, or measured geometry.
    ox, oy = origin
    return [(ox + u + .27 * v, oy - .26 * u + .84 * v) for u, v in points]


def plane(origin, width, height, holes=(), corner=7):
    contours = [chamfer(0, 0, width, height, corner)]
    contours.extend(chamfer(*hole) for hole in holes)
    return " ".join(polygon(project(points, origin)) for points in contours)


def path(identifier, d, role, outline=False):
    return {"id": identifier, "d": d, "role": role, "outline": outline}


def plate(identifier, origin, width, height, holes, role="face", depth=(0, 9)):
    back = (origin[0] + depth[0], origin[1] + depth[1])
    return [path(identifier + "-depth", plane(back, width, height, holes), "depth", True),
            path(identifier, plane(origin, width, height, holes), role, True)]


def strip(identifier, origin, width, height, role="accent", corner=3):
    return path(identifier, plane(origin, width, height, corner=corner), role, role != "accent")


def constructions():
    cut = [path("aperture-frame", "M18 108 L52 20 H76 L110 108 H86 L64 48 L42 108 Z", "ink"),
           path("separated-shelf", "M57 84 H71 L75 98 H53 Z", "accent")]
    fold = [path("fold-upright", "M22 108 L55 24 L72 33 L42 108 Z", "ink"),
            path("fold-return", "M80 43 L108 108 H84 L66 60 Z", "accent"),
            path("fold-shelf", "M58 80 H68 L74 96 H52 Z", "ink")]

    source = []
    source += plate("supporting-sheet", (71, 116), 154, 137, [(21, 22, 112, 85, 5)])
    source += plate("source-dossier", (137, 154), 247, 150, [(24, 31, 196, 93, 5)])
    source += [strip("reference-tab", (156, 139), 55, 34),
               strip("exposed-binding", (144, 166), 8, 122, "ink", 2)]

    compare = []
    comparison_holes = [(20, 22, 108, 28, 4), (20, 66, 108, 53, 5)]
    compare += plate("comparison-plate-left", (65, 157), 148, 141, comparison_holes)
    compare += plate("comparison-plate-right", (248, 109.42), 148, 141, comparison_holes)
    # Identical footprints; this rail expresses a common frame, never a value.
    compare += [strip("common-datum", (109, 299), 331, 13, "ink", 3),
                strip("selected-reference", (222, 257), 70, 34),
                strip("datum-left-foot", (100, 280), 11, 31, "ink", 2),
                strip("datum-right-foot", (420, 196.8), 11, 31, "ink", 2)]

    collection = []
    # Narrow open dividers make an upright archive, distinct from Folio's loose
    # overlapping sheets. Clear gaps prevent a solid monochrome stack.
    collection_holes = [(13, 23, 20, 112, 4)]
    collection += plate("archive-left", (81, 146), 46, 158, collection_holes)
    collection += plate("archive-middle", (147, 128.84), 46, 158, collection_holes)
    collection += plate("archive-right", (213, 111.68), 46, 158, collection_holes)
    collection += [path("withdrawn-record", plane((284, 153), 128, 158, [(23, 25, 82, 108, 5)]), "accent"),
                   strip("archive-foot", (127, 302), 188, 13, "ink", 3)]

    relay = []
    relay_holes = [(27, 27, 78, 72, 6)]
    relay += plate("context-left", (65, 168), 132, 126, relay_holes)
    relay += plate("context-right", (291, 109.24), 132, 126, relay_holes)
    relay += [strip("context-bridge", (209.85, 174.82), 106, 33)]

    return {"aperture-cut": cut, "aperture-fold": fold, "folio-source": source,
            "measure-compare": compare, "index-collection": collection, "relay-context": relay}


SPECS = {
    "aperture-cut": {
        "title": "Aperture Cut", "tier": "identity-study", "width": 128, "height": 128, "minimum_size_px": 32,
        "meaning": "A broad survey opening with an isolated inspection shelf. The open space stays legible in one ink.",
        "placements": ["Identity review sheets", "Proposed editorial lockups", "Cover-mark comparisons"],
        "avoid": ["Production masthead or favicon before identity selection", "Verification badge", "16px utility icon"],
        "brief": "A stable frontal silhouette, a wide triangular void, and one separated low shelf. Preserve visible air between the shelf and uprights.",
        "alpha_probes": [[0, 0], [64, 65], [49, 97]],
    },
    "aperture-fold": {
        "title": "Aperture Fold", "tier": "identity-study", "width": 128, "height": 128, "minimum_size_px": 32,
        "meaning": "Two offset folded planes frame an open sightline. Its broken shoulder makes the silhouette more directional than Cut.",
        "placements": ["Alternate identity review", "Proposed editorial title-page lockups"],
        "avoid": ["Production identity before selection", "Navigation arrow", "Success or authentication state"],
        "brief": "Separate the upper shoulder, return plane and inner shelf. The diagonal asymmetry and negative-space breaks must survive monochrome.",
        "alpha_probes": [[0, 0], [77, 33], [62, 72]],
    },
    "folio-source": {
        "title": "Folio Source", "tier": "editorial-object", "width": 512, "height": 384, "minimum_size_px": 160,
        "meaning": "A broad open dossier sits beside a smaller supporting sheet. One reference tab brings source and record into view together.",
        "placements": ["Source-reading introductions", "Evidence-method headers", "Research documentation covers"],
        "avoid": ["Verified, trusted or reviewed badge", "Proof that a claim is correct", "Dense table rows"],
        "brief": "Use two unequal document planes with one exposed binding and cobalt tab; keep a broad open window, not an archive stack.",
        "alpha_probes": [[0, 0], [310, 165]],
    },
    "measure-compare": {
        "title": "Measure Compare", "tier": "editorial-object", "width": 512, "height": 384, "minimum_size_px": 160,
        "meaning": "Two equal plates align against one reference rail. They express the discipline of choosing a common comparison frame.",
        "placements": ["Comparison-method introductions", "Guides to measures and missing data", "Editorial feature headers"],
        "avoid": ["Actual metric chart", "Ranking, growth or funding amount", "Different-sized plates implying values"],
        "brief": "Build the same footprint twice along the same projection. Give the composition a long horizontal datum and one central cobalt reference.",
        "alpha_probes": [[0, 0], [140, 215]],
    },
    "index-collection": {
        "title": "Index Collection", "tier": "editorial-object", "width": 512, "height": 384, "minimum_size_px": 160,
        "meaning": "Parallel archive leaves and a withdrawn record express retrieval from a working collection. Their order and count are editorial.",
        "placements": ["Collection-building guides", "Retrieval feature introductions", "Saved-research editorial studies"],
        "avoid": ["Claim that a collection feature has shipped", "Record count or ranking", "Evidence of company affiliation"],
        "brief": "An upright, regularly spaced archive contrasts with the broad Folio dossier. Move one whole cobalt leaf forward, keeping the other records neutral.",
        "alpha_probes": [[0, 0], [125, 204], [361, 193]],
    },
    "relay-context": {
        "title": "Relay Context", "tier": "editorial-object", "width": 512, "height": 384, "minimum_size_px": 160,
        "meaning": "Exactly two open modules meet through one cobalt bridge, expressing an intentional context interface.",
        "placements": ["MCP feature introductions", "Context-transfer explanations", "Integration documentation covers"],
        "avoid": ["Live connected status", "Authentication or transfer success", "Recorded company relationships"],
        "brief": "Keep the two housings separately readable and the join uncluttered. Use no lights, ticks, network dots or extra modules.",
        "alpha_probes": [[0, 0], [147, 208], [374, 149]],
    },
}


def make_svg(family, theme, shapes):
    spec, palette = SPECS[family], PALETTES[theme]
    title_id, desc_id = family + "-title", family + "-description"
    lines = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{spec["width"]}" height="{spec["height"]}" viewBox="0 0 {spec["width"]} {spec["height"]}" role="img" aria-labelledby="{title_id}" aria-describedby="{desc_id}">',
             f'  <title id="{title_id}">{escape(spec["title"])} — Signal r2 {theme} study</title>',
             f'  <desc id="{desc_id}">{escape(spec["meaning"])} Experimental illustration; no factual data or live state is encoded.</desc>']
    for shape in shapes:
        # Each semantic part is an independently editable layer. Paint order is
        # explicit, because a foreground record may obscure a rear record.
        outline = f' stroke="{palette["edge"]}" stroke-width="1.25" stroke-linejoin="round"' if shape["outline"] else ""
        lines.extend([f'  <g id="{shape["id"]}" fill="{palette[shape["role"]]}"{outline}>',
                      f'    <path d="{shape["d"]}" fill-rule="evenodd"/>', "  </g>"])
    lines.append("</svg>")
    return "\n".join(lines) + "\n"


def build(out):
    out.mkdir(parents=True, exist_ok=True)
    sources = [
        {"reference": f"https://github.com/castlemilk/startup-atlas/blob/{BASE}/docs/SIGNAL-ASSET-STUDIES.md",
         "permission": "Existing project-owned design reference; no external artwork copied.",
         "use": "Aperture, Folio and Relay concepts; original r1 geometry remains unchanged."},
        {"reference": f"https://github.com/castlemilk/startup-atlas/blob/{BASE}/web/design-tokens.css",
         "sha256": "c8e402037bb6a04f255909f418ca01c155f32bd8378b11040c16644b2e19be44",
         "permission": "Existing project runtime tokens.", "use": "Frozen light export palette; gallery consumes current runtime CSS directly."},
        {"reference": f"https://github.com/castlemilk/startup-atlas/blob/{BASE}/web/design-aesthetic-tokens.css",
         "sha256": "3fc03959dce24e270b37eec0c0ec346c02722ed37190bec5cd5f12f0159529fc",
         "permission": "Existing project exploratory tokens.", "use": "Dark study palette only; no operational dark-mode claim."},
    ]
    manifest = {"schema_version": 1, "batch_id": "atlas-signal-studies-r2", "revision": "r2",
                "created_at": DATE, "base_revision": BASE, "status": "experimental-review-collection",
                "identity_approval": None, "fact_source": None,
                "provenance": {"class": "original-authored-vector", "method": "Fixed authored paths and a shared orthographic plane transform.",
                               "generated_image_source": None, "prompt": None,
                               "description": "Six constructions, eighteen theme exports. Palette variants are not separate concepts. No company names, figures or relationships are encoded.",
                               "license_note": "No external logo, artwork or typeface embedded; existing repository licensing is unchanged. Design review does not establish trademark clearance."},
                "generator": "scripts/make-signal-studies-r2.py", "generator_version": 1,
                "palettes": PALETTES, "sources": sources,
                "background": "transparent outside all shapes and through the documented cutouts",
                "artworks": [], "assets": []}
    for family, shapes in constructions().items():
        spec = SPECS[family]
        files = {}
        for theme in PALETTES:
            filename = f"{family}-r2-{theme}.svg"
            raw = make_svg(family, theme, shapes).encode("utf-8")
            (out / filename).write_bytes(raw)
            files[theme] = filename
            manifest["assets"].append({"id": f"{family}-r2-{theme}", "family": family, "revision": "r2", "theme": theme,
                                       "file": filename, "sha256": hashlib.sha256(raw).hexdigest(), "bytes": len(raw),
                                       "width": spec["width"], "height": spec["height"], "viewBox": f'0 0 {spec["width"]} {spec["height"]}',
                                       "minimum_size_px": spec["minimum_size_px"], "tier": spec["tier"],
                                       "alt": spec["meaning"], "layers": [part["id"] for part in shapes],
                                       "alpha_probes": spec["alpha_probes"]})
        manifest["artworks"].append({"id": family, "revision": 2, "title": spec["title"], "tier": spec["tier"],
                                     "style": "Signal constructed instrument", "brief": spec["brief"],
                                     "provenance": "original-authored-vector", "meaning": spec["meaning"],
                                     "minimum_display_width": spec["minimum_size_px"], "placements": spec["placements"],
                                     "avoid": spec["avoid"], "sources": sources, "files": files,
                                     "user_selection": None, "operational_identity": False})
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT, help="Output folder; defaults to the isolated r2 study folder.")
    build(parser.parse_args().out)
