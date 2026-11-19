#!/usr/bin/env python3
"""Reproduce four experimental source-condition illustrations and 12 SVG exports.

This is an asset generator, not an evidence classifier or runtime state machine.
No source records, timestamps, review decisions or freshness rules are inferred.
"""

import argparse
import hashlib
import json
from html import escape
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUT = ROOT / "web/assets/design-lab/signal-evidence-states/r1"
BASE = "2c003beae425507de206fbfa0f48416bd82e78d6"
DATE = "2026-11-17"
WIDTH, HEIGHT, MINIMUM = 256, 192, 64
PALETTES = {
    "light": {"ink": "#111318", "accent": "#315efb", "relief": "#dfe3e8"},
    "dark": {"ink": "#f4f6fa", "accent": "#9aafff", "relief": "#718096"},
    "mono": {"ink": "#111318", "accent": "#111318", "relief": "#111318"},
}
HOSTS = {"light": ["#ffffff", "#fafafc"], "dark": ["#111318"], "mono": ["#ffffff", "#fafafc"]}


def layer(identifier, d, role="ink", stroke=0, essential=True):
    return {"id": identifier, "d": d, "role": role, "stroke": stroke, "essential": essential}


def constructions():
    # A broad open source window and a shallow lower return. The relief is
    # decorative; recognition rests on the ink frame and separate state cue.
    frame = "M38 32 H112 L140 60 V152 H38 Z M48 42 H108 L130 64 V142 H48 Z"
    relief = "M38 152 H140 V158 H38 Z M140 60 L146 66 V158 H140 Z"
    base = [layer("source-relief", relief, "relief", essential=False),
            layer("source-window", frame)]
    return {
        "unknown": base + [
            layer("open-question", "M164 76 C164 49 213 49 213 75 C213 94 188 95 188 113", "accent", 12),
            layer("question-point", "M181 132 A7 7 0 1 0 195 132 A7 7 0 1 0 181 132 Z", "accent"),
        ],
        "unavailable": base + [
            layer("access-rail", "M148 107 H174", "ink", 10),
            layer("access-gate", "M210 77 V137 M199 77 H221 M199 137 H221", "accent", 12),
        ],
        "stale": base + [
            layer("time-dial", "M223 108 A34 34 0 1 0 155 108 A34 34 0 1 0 223 108 Z", "accent", 10),
            layer("time-hands", "M189 86 V108 L205 118", "ink", 8),
        ],
        "reviewed": base + [
            layer("annotation-bracket", "M222 62 H164 V144 H222", "accent", 10),
            layer("review-notation", "M180 88 H214 M180 112 H204", "ink", 8),
        ],
    }


SPECS = {
    "unknown": {
        "title": "Unknown",
        "definition": "The specified fact or evidence condition has not been established within the named research scope.",
        "visible_idea": "An open source frame stands beside a detached question hook and point.",
        "brief": "Give the unclosed question a clear vertical gesture and an isolated point. Keep it outside the source window so the source is not depicted as empty or absent.",
        "required_context": ["Name the unknown fact or condition", "State the research scope and missing basis"],
        "does_not_mean": ["Absent, zero or false", "Failed access attempt", "A generic synonym for a captured but unreviewed candidate"],
        "placement": "A scoped explanation of what research has not yet established.",
        "example_caption": "[Named fact] has not been established within [research scope].",
        "alpha_probes": [[0, 0], [84, 96], [188, 122]],
    },
    "unavailable": {
        "title": "Unavailable",
        "definition": "An identified source or resource could not be retrieved in a recorded access attempt.",
        "visible_idea": "A source-side access rail stops before a separate upright gate, leaving a clear gap.",
        "brief": "Keep the existing source window intact. Make the interrupted access gap wider than any relief seam; the gate represents one retrieval boundary, not a broken company relationship.",
        "required_context": ["Identify the affected source or section", "Give the attempt time and known reason", "Retain any previously recorded material"],
        "does_not_mean": ["The source never existed or was deleted", "The underlying claim is false", "Every source or the entire dataset failed"],
        "placement": "A source-specific access explanation beside existing evidence and recovery controls.",
        "example_caption": "[Source] could not be retrieved at [attempt time]: [recorded reason].",
        "alpha_probes": [[0, 0], [84, 96], [190, 107]],
    },
    "stale": {
        "title": "Stale",
        "definition": "A recorded observation needs a freshness review under an explicit policy or recorded review decision.",
        "visible_idea": "An intact source frame sits beside a time dial with separated hands.",
        "brief": "Preserve the source and its contrast. Use a detached time dial instead of fading the record; the drawn hand angles encode no timestamp or deadline.",
        "required_context": ["Keep the observation or review date visible", "Name the freshness rule or recorded reason", "State when the rule was evaluated if time-based"],
        "does_not_mean": ["False, revoked or expired", "A universal age threshold exists", "A build timestamp establishes factual recency"],
        "placement": "A dated observation requiring another check, with its original evidence still readable.",
        "example_caption": "[Observation date] needs another check under [policy or recorded decision].",
        "alpha_probes": [[0, 0], [84, 96], [175, 119]],
    },
    "reviewed": {
        "title": "Reviewed",
        "definition": "Specified evidence or a claim was examined within a recorded scope and review date.",
        "visible_idea": "An intact source frame is paired with an annotation bracket and two review-note strokes.",
        "brief": "Make examination visible through a separate annotation margin. Keep the bracket open; no checkmark, seal, shield or approval stamp is used.",
        "required_context": ["Identify the source, claim or revision reviewed", "Show review scope, date and recorded outcome", "Identify the review record or reviewer when available"],
        "does_not_mean": ["Verified true forever, complete or officially endorsed", "Eligible, merged or deployed", "Fresh or retrievable now", "A crawl checked_at timestamp alone proves review"],
        "placement": "A scoped review note that preserves the actual outcome and supporting evidence.",
        "example_caption": "[Review record] examined [source or claim] on [review date] within [scope]: [outcome].",
        "alpha_probes": [[0, 0], [84, 96], [192, 128]],
    },
}


def make_svg(state, theme, shapes):
    spec, palette = SPECS[state], PALETTES[theme]
    identifier = "evidence-" + state + "-r1"
    description = (spec["visible_idea"] + " " + spec["definition"] +
                   " Experimental illustration. Actual condition, source, scope and dates must be supplied by adjacent text; no live record is encoded.")
    lines = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{WIDTH}" height="{HEIGHT}" viewBox="0 0 {WIDTH} {HEIGHT}" role="img" aria-labelledby="{identifier}-title" aria-describedby="{identifier}-description">',
             f'  <title id="{identifier}-title">{escape(spec["title"])} — Signal evidence study r1, {theme}</title>',
             f'  <desc id="{identifier}-description">{escape(description)}</desc>']
    for shape in shapes:
        if shape["stroke"]:
            paint = f'fill="none" stroke="{palette[shape["role"]]}" stroke-width="{shape["stroke"]}" stroke-linecap="round" stroke-linejoin="round"'
        else:
            paint = f'fill="{palette[shape["role"]]}"'
        lines += [f'  <g id="{shape["id"]}" {paint}>',
                  f'    <path d="{shape["d"]}" fill-rule="evenodd"/>', "  </g>"]
    return "\n".join(lines + ["</svg>", ""])


def build(out):
    out.mkdir(parents=True, exist_ok=True)
    sources = [
        {"path": "web/design-tokens.css", "sha256": "c8e402037bb6a04f255909f418ca01c155f32bd8378b11040c16644b2e19be44", "use": "Frozen light export palette and supported backgrounds; gallery imports runtime CSS without editing it."},
        {"path": "web/design-aesthetic-tokens.css", "sha256": "3fc03959dce24e270b37eec0c0ec346c02722ed37190bec5cd5f12f0159529fc", "use": "Existing pale ink and cobalt roles for dark-surface studies only."},
        {"path": "web/assets/design-lab/signal-explorations/r2/manifest.json", "sha256": "47c185c08075819823b7f52024acd938ee033c5aa9ba90b693e3a0e7bd4410be", "use": "Signal material and semantic boundaries; Folio remains the neutral source-method illustration."},
        {"path": "web/atlas-icons.js", "sha256": "6753179f3c347d2e04f253eb31e4632c9080ced577d78ca112ea6903003f4fd2", "use": "Existing utility-icon ownership checked; source, calendar, warning and check icons are unchanged."},
    ]
    for source in sources:
        source["reference"] = f'https://github.com/castlemilk/startup-atlas/blob/{BASE}/{source["path"]}'
    manifest = {
        "schema_version": 1, "batch_id": "atlas-signal-evidence-states-r1", "revision": "r1",
        "created_at": DATE, "base_revision": BASE, "status": "experimental-review-collection",
        "operational_identity": False, "user_selection": None, "fact_source": None,
        "conditions_can_overlap": True, "state_machine": False, "automatic_classification": False,
        "coexistence": "Review, freshness and access describe different dimensions. Reviewed evidence may also be stale or temporarily unavailable; unknown must name its subject and scope.",
        "freshness_policy": None,
        "generator": "scripts/make-signal-evidence-states.py", "generator_version": 1,
        "provenance": {
            "class": "original-authored-vector", "method": "Fixed editable paths with a shared open source frame and four distinct condition cues.",
            "generated_image_source": None, "prompt": None,
            "license_note": "No external artwork, company logo, font or raster is embedded. No new license grant is declared; repository licensing is unchanged.",
            "description": "Four constructions, twelve theme exports. Labels describe illustrative conditions and encode no company record, date, claim or classification.",
        },
        "palettes": PALETTES, "supported_backgrounds": HOSTS,
        "contrast_contract": {
            "essential_roles": ["ink", "accent"], "essential_role_minimum_ratio": 3,
            "decorative_roles": {"relief": "Shallow lower/right return only; all essential contours remain in ink and accent."},
            "colour_only_meaning": False, "requires_live_text": True,
            "scope": "Source-colour calculations on listed solid backgrounds plus actual-size visual review. This is not a whole-page accessibility certification.",
        },
        "sources": sources,
        "background": "Transparent exterior and source window; no matte, filter, raster or external resource.",
        "artworks": [], "assets": [],
    }
    for state, shapes in constructions().items():
        spec, files = SPECS[state], {}
        for theme in PALETTES:
            filename = f"evidence-{state}-r1-{theme}.svg"
            raw = make_svg(state, theme, shapes).encode("utf-8")
            (out / filename).write_bytes(raw)
            files[theme] = filename
            manifest["assets"].append({
                "id": f"evidence-{state}-r1-{theme}", "family": state, "revision": "r1", "theme": theme,
                "file": filename, "sha256": hashlib.sha256(raw).hexdigest(), "bytes": len(raw),
                "width": WIDTH, "height": HEIGHT, "viewBox": f"0 0 {WIDTH} {HEIGHT}",
                "minimum_size_px": MINIMUM, "alt": spec["visible_idea"],
                "layers": [part["id"] for part in shapes],
                "essential_layers": [part["id"] for part in shapes if part["essential"]],
                "alpha_probes": spec["alpha_probes"],
            })
        manifest["artworks"].append({
            "id": "evidence-" + state, "condition": state, "revision": 1, **spec,
            "minimum_display_width": MINIMUM, "files": files, "operational_identity": False,
            "user_selection": None, "tier": "source-condition-illustration",
            "host_rule": "Pair with a visible condition label and scoped explanation. Use the existing utility icons below 64px; never use this art as a sole status indicator.",
        })
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    build(parser.parse_args().out)
