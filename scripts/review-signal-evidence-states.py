#!/usr/bin/env python3
"""Render the evidence SVG masters with installed Inkscape; audit alpha and colour.

Requires Inkscape and Pillow already installed. No dependencies are downloaded.
Review PNGs have labelled mattes; the SVG masters remain transparent.
"""

import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import tempfile

import PIL
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "web/assets/design-lab/signal-evidence-states/r1"
SIZES = (64, 96, 160, 256, 1600)


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def luminance(colour):
    channels = [int(colour[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    values = [v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in channels]
    return sum(v * w for v, w in zip(values, (.2126, .7152, .0722)))


def contrast(left, right):
    values = sorted((luminance(left), luminance(right)))
    return (values[1] + .05) / (values[0] + .05)


def render(task):
    executable, source, destination, asset, width = task
    result = subprocess.run([executable, str(source), "--export-type=png", "--export-background-opacity=0",
                             f"--export-filename={destination}", f"--export-width={width}"],
                            capture_output=True, text=True, timeout=45)
    if result.returncode:
        raise RuntimeError(f"Inkscape failed for {asset['file']}: {result.stderr}")
    picture = Image.open(destination).convert("RGBA")
    alpha = picture.getchannel("A")
    bounds = alpha.getbbox()
    expected_height = round(width * asset["height"] / asset["width"])
    if picture.size != (width, expected_height) or not bounds:
        raise AssertionError(f"Wrong or empty render: {asset['file']} at {width}")
    if not (bounds[0] > 0 and bounds[1] > 0 and bounds[2] < width and bounds[3] < expected_height):
        raise AssertionError(f"Clipped artwork: {asset['file']} at {width}")
    clear_fraction = alpha.histogram()[0] / (width * expected_height)
    if clear_fraction < .65:
        raise AssertionError(f"Unexpected opaque mass: {asset['file']} at {width}")
    probes = []
    for x, y in asset["alpha_probes"]:
        px, py = int(x * width / asset["width"]), int(y * expected_height / asset["height"])
        value = alpha.getpixel((px, py))
        probes.append({"source": [x, y], "pixel": [px, py], "alpha": value})
        if value:
            raise AssertionError(f"Cutout not transparent: {asset['file']} at {width}, {x},{y}: {value}")
    return {"file": asset["file"], "width": width, "height": expected_height,
            "png_sha256": sha(destination), "painted_bounds": list(bounds),
            "clear_pixel_fraction": round(clear_fraction, 6), "alpha_probes": probes,
            "status": "passed"}


def font(size):
    # Review-board labels only; no lettering is baked into the SVG masters.
    return ImageFont.truetype("DejaVuSans.ttf", size)


def boards(manifest, temporary, out):
    order = ["unknown", "unavailable", "stale", "reviewed"]
    themes = list(manifest["palettes"])
    board = Image.new("RGB", (1020, 1020), "#fafafc")
    draw = ImageDraw.Draw(board)
    draw.text((24, 18), "Signal / source and evidence conditions", font=font(23), fill="#111318")
    draw.text((24, 52), "Experimental illustrations. Conditions can overlap; labels carry scope.", font=font(14), fill="#626975")
    for row, state in enumerate(order):
        for column, theme in enumerate(themes):
            x, y = column * 340, 84 + row * 230
            background = "#111318" if theme == "dark" else "#ffffff" if theme == "light" else "#fafafc"
            foreground = "#f4f6fa" if theme == "dark" else "#111318"
            draw.rectangle((x, y, x + 339, y + 229), fill=background)
            draw.text((x + 22, y + 16), f"{state.title()} / {theme}", font=font(16), fill=foreground)
            name = f"evidence-{state}-r1-{theme}-256.png"
            picture = Image.open(temporary / name).convert("RGBA")
            board.paste(picture, (x + 42, y + 34), picture)
    board.save(out / "review-overview.png")

    minimum = Image.new("RGB", (1020, 760), "#fafafc")
    draw = ImageDraw.Draw(minimum)
    draw.text((24, 18), "Actual-size review / 64px and 96px", font=font(23), fill="#111318")
    draw.text((24, 52), "Same geometry across themes. Keep the full viewBox and a visible condition label.", font=font(13), fill="#626975")
    for row, state in enumerate(order):
        for column, theme in enumerate(themes):
            x, y = column * 340, 84 + row * 162
            background = "#111318" if theme == "dark" else "#ffffff" if theme == "light" else "#fafafc"
            foreground = "#f4f6fa" if theme == "dark" else "#111318"
            draw.rectangle((x, y, x + 339, y + 161), fill=background)
            draw.text((x + 22, y + 12), f"{state.title()} / {theme}", font=font(14), fill=foreground)
            for width, offset in ((64, 42), (96, 186)):
                picture = Image.open(temporary / f"evidence-{state}-r1-{theme}-{width}.png").convert("RGBA")
                minimum.paste(picture, (x + offset, y + 47), picture)
                draw.text((x + offset, y + 130), f"{width}px", font=font(12), fill=foreground)
    minimum.save(out / "review-minimum-sizes.png")


def review(out, work, executable):
    manifest_path = ASSETS / "manifest.json"
    manifest = json.loads(manifest_path.read_text())
    for asset in manifest["assets"]:
        if sha(ASSETS / asset["file"]) != asset["sha256"]:
            raise AssertionError("Source hash differs from the manifest: " + asset["file"])
    tasks = [(executable, ASSETS / a["file"], work / f"{Path(a['file']).stem}-{size}.png", a, size)
             for a in manifest["assets"] for size in SIZES]
    with ThreadPoolExecutor(max_workers=4) as executor:
        renders = list(executor.map(render, tasks))
    colours = []
    for theme, palette in manifest["palettes"].items():
        for background in manifest["supported_backgrounds"][theme]:
            for role in manifest["contrast_contract"]["essential_roles"]:
                ratio = contrast(palette[role], background)
                if ratio < 3:
                    raise AssertionError(f"Essential {theme}/{role} contrast failed on {background}")
                colours.append({"theme": theme, "role": role, "foreground": palette[role],
                                "background": background, "ratio": ratio, "minimum": 3, "status": "passed"})
    out.mkdir(parents=True, exist_ok=True)
    boards(manifest, work, out)
    report = {
        "schema_version": 1, "collection": manifest["batch_id"], "status": "passed",
        "manifest_sha256": sha(manifest_path), "generator_sha256": sha(ROOT / manifest["generator"]),
        "review_script_sha256": sha(Path(__file__)),
        "renderer": subprocess.check_output([executable, "--version"], text=True).strip(),
        "review_board_renderer": "Pillow " + PIL.__version__,
        "review_label_font": "DejaVu Sans, review PNG labels only; not embedded in artwork",
        "render_count": len(renders), "sizes_px": list(SIZES),
        "contrast": colours, "renders": renders,
        "contrast_scope": manifest["contrast_contract"]["scope"],
        "decorative_relief": "Excluded from essential-role contrast; the high-contrast frame remains independently legible.",
        "browser_acceptance": "Separate check; consult PR CI and evidence-browser-review.json.",
        "visual_review": "pending human or agent inspection of the generated images",
        "previews": [{"file": n, "sha256": sha(out / n), "transparent": False}
                     for n in ("review-overview.png", "review-minimum-sizes.png")],
    }
    (out / "vector-review.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({"status": report["status"], "renders": len(renders),
                      "minimum_essential_contrast": min(c["ratio"] for c in colours),
                      "visual_review": report["visual_review"]}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=ASSETS)
    parser.add_argument("--work-dir", type=Path, help="Keep individual transparent renders here for inspection.")
    args = parser.parse_args()
    renderer = shutil.which("inkscape")
    if not renderer:
        parser.error("An existing Inkscape installation is required.")
    if args.work_dir:
        args.work_dir.mkdir(parents=True, exist_ok=True)
        review(args.out, args.work_dir, renderer)
    else:
        with tempfile.TemporaryDirectory(prefix="atlas-evidence-review-") as temporary:
            review(args.out, Path(temporary), renderer)
