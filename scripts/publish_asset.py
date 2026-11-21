#!/usr/bin/env python3
"""Publish a prepared Atlas asset into the public repository tree.

This is the reviewed adapter from docs/MCP-ASSETS.md: it resolves a staged
asset at an exact review revision, enforces the review gate (identity and
rights approved for public repository and website use), and only then writes
bytes and references through the normal branch/review path.

Publication transaction: one reviewed multi-file proposal. The asset bytes,
the public-safe manifest and the record/map update land in the same PR, so an
attachment never points at a missing or unreleased asset. A merge is the
owner's approval of the public use attested in the manifest.

Paths are derived by this script, never from caller filenames or URLs:
logos go to web/assets/logos/<slug>.png|.svg with a reviewed record reference
or a web/logos.js map entry for a partner;
portraits go to web/assets/portraits/<slug>.png|.svg with the person's
photo/photo_url field set to the published Pages URL. Manifests are public-safe
(provenance attestations only, no private correspondence) at
web/assets/manifests/<asset-sha256>.json.

Unreviewed assets can never be published: prepare_public_export refuses them
before any write. An existing target with different bytes is refused; an
identical re-publish is a no-op for the bytes. Use --dry-run to check the
plan without writing.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "atlas_assets", ROOT / "scripts" / "atlas_assets.py")
assets = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(assets)

SITE_ORIGIN = "https://castlemilk.github.io/startup-atlas"
PUBLIC_MANIFEST_SCHEMA = "atlas.asset-public-manifest.v0"
MAX_PUBLIC_MANIFEST_BYTES = 32_768
SLUG = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9 .&'\-]{0,119}$")


class PublishError(Exception):
    pass


def fail(message):
    raise PublishError(message)


def slugify(name):
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    if not SLUG.fullmatch(slug):
        fail(f"Cannot derive a safe file slug from name {name!r}.")
    return slug


def load_json(path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        fail(f"Cannot read {path}: {exc.__class__.__name__}.")


def write_new(path, payload):
    """Create a file without replacing an existing one; return False if identical."""
    try:
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o644)
    except FileExistsError:
        if path.read_bytes() == payload:
            return False
        fail(f"Refusing to overwrite {path}: existing bytes differ.")
    try:
        view = memoryview(payload)
        while view:
            count = os.write(fd, view)
            if count <= 0:
                raise OSError("Short write.")
            view = view[count:]
        os.fsync(fd)
    finally:
        os.close(fd)
    return True


def insert_js_map_entry(text, name, value):
    """Insert "name": "value" into the frozen logos map; refuse a conflicting entry."""
    marker = "const logos = Object.freeze({"
    start = text.find(marker)
    if start < 0:
        fail("web/logos.js does not contain the expected logos map.")
    end = text.find("});", start)
    if end < 0:
        fail("web/logos.js logos map has no closing brace.")
    block = text[start:end]
    match = re.search(rf"{re.escape(json.dumps(name))}\s*:\s*(\"[^\"]*\"|'[^']*')", block)
    if match:
        if match.group(1) != json.dumps(value):
            fail(f"web/logos.js already maps {name!r} to a different file.")
        return text, False
    head, tail = text[:end], text[end:]
    stripped = head.rstrip()
    if not stripped.endswith(("{", ",")):
        head = stripped + ",\n"
    return head + f"  {json.dumps(name)}:{json.dumps(value)},\n" + tail, True


def insert_js_set_entry(text, set_name, name):
    """Insert 'name' into a `const <set_name> = new Set([...])` literal."""
    marker = f"const {set_name} = new Set(["
    start = text.find(marker)
    if start < 0:
        fail(f"web/logos.js does not contain the {set_name} set.")
    end = text.find("]);", start)
    if end < 0:
        fail(f"web/logos.js {set_name} set has no closing bracket.")
    block = text[start:end]
    if json.dumps(name) in block or f"'{name}'" in block:
        return text, False
    head, tail = text[:end], text[end:]
    stripped = head.rstrip()
    if stripped.endswith("["):
        insert = json.dumps(name)
    elif stripped.endswith(","):
        insert = json.dumps(name) + ","
    else:
        insert = "," + json.dumps(name)
    return stripped + insert + tail, True


def publish(store, asset_id, asset_revision, name, subject_id, role, repo,
            site_origin, dark_tile, wide, dry_run, founder_of=None):
    if not NAME.fullmatch(name):
        fail(f"Name {name!r} is not an accepted directory name.")
    packet = store.prepare_public_export(asset_id, asset_revision,
                                         subject_id=subject_id, role=role)
    manifest = packet["manifest"]
    blob = manifest["blob"]
    provenance = manifest["provenance"]
    slug = slugify(name)
    if founder_of is not None and (role != "portrait" or subject_id != f"person:{slug}"):
        fail("A founder record can only be selected for its canonical person portrait.")
    extension = ".svg" if blob["mime"] == "image/svg+xml" else ".png"
    data = store.read_bytes(asset_id, asset_revision)
    if hashlib.sha256(data).hexdigest() != blob["sha256"]:
        fail("Read bytes do not match the manifest digest.")

    repo = Path(repo).resolve()
    organisation = None
    if role == "logo":
        asset_dir = repo / "web" / "assets" / "logos"
        kind = subject_id.split(":", 1)[0]
        if subject_id != f"{kind}:{slug}":
            fail(f"{subject_id!r} does not identify {name!r}.")
        if kind == "partner":
            reviewed = load_json(repo / "data" / "partners-reviewed.json")
            if name not in reviewed:
                fail(f"{name!r} is not a reviewed partner in data/partners-reviewed.json.")
        elif kind in ("startup", "provider"):
            record_path = repo / "data" / "startup-research.json"
            research = load_json(record_path)
            key = "startups" if kind == "startup" else "technology_providers"
            matches = [record for record in research.get(key, []) if record.get("name") == name]
            if len(matches) == 1:
                organisation = matches[0]
            elif kind == "provider" and not matches:
                catalogue = load_json(repo / "data" / "catalogue.json")
                if not any(offer.get("org") == name for offer in catalogue["opportunities"]):
                    fail(f"{name!r} is not a reviewed technology or programme provider.")
            else:
                fail(f"{name!r} does not match a unique reviewed {kind} in {record_path.name}.")
        else:
            fail(f"Unsupported logo subject {subject_id!r}.")
    else:
        asset_dir = repo / "web" / "assets" / "portraits"
        record_path = None
        profiles = load_json(repo / "data" / "partner-profiles.json") if founder_of is None else {}
        research = load_json(repo / "data" / "startup-research.json")
        hits = []
        for partner, entry in profiles.items():
            for person in entry.get("people", []):
                if person.get("name") == name:
                    hits.append(("partner-profiles", partner, person))
        for startup in research.get("startups", []):
            if founder_of is not None and startup["name"] != founder_of:
                continue
            for founder in startup.get("founders", []):
                if founder.get("name") == name:
                    hits.append(("startup-research", startup["name"], founder))
        if not hits:
            fail(f"{name!r} is not a recorded person in partner profiles or startup research.")
        if len(hits) > 1:
            fail(f"{name!r} matches more than one person record; resolve the subject first.")
    target = asset_dir / (slug + extension)
    target_rel = target.relative_to(repo).as_posix()
    public_url = site_origin.rstrip("/") + "/assets/" + (
        "logos" if role == "logo" else "portraits") + "/" + slug + extension
    if organisation is not None and organisation.get("logo") not in (None, "", public_url):
        fail(f"Refusing to overwrite the reviewed logo for {name!r}.")

    public_manifest = {
        "schema": PUBLIC_MANIFEST_SCHEMA,
        "asset_id": asset_id,
        "asset_revision": asset_revision,
        "target": target_rel,
        "name": name,
        "subject_id": subject_id,
        "role": role,
        "source_page": provenance["source_page"],
        "source_asset_url": provenance["source_asset_url"],
        "attribution": provenance["rights"]["attribution"],
        "reviewed_at": provenance["identity"]["reviewed_at"],
        "blob": {"sha256": blob["sha256"], "bytes": blob["bytes"], "mime": blob["mime"],
                 "width": blob["width"], "height": blob["height"]},
        "provenance": provenance,
    }
    encoded_manifest = json.dumps(public_manifest, sort_keys=True,
                                  separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    if len(encoded_manifest) > MAX_PUBLIC_MANIFEST_BYTES:
        fail("Public manifest exceeds the bounded size.")
    manifest_path = repo / "web" / "assets" / "manifests" / (blob["sha256"] + ".json")

    plan = {"asset_id": asset_id, "asset_revision": asset_revision,
            "name": name, "subject_id": subject_id, "role": role,
            "target": target_rel, "manifest": manifest_path.relative_to(repo).as_posix(),
            "public_url": public_url, "sha256": blob["sha256"],
            "format": "svg" if extension == ".svg" else "png",
            "width": blob["width"], "height": blob["height"]}
    if dry_run:
        return {**plan, "dry_run": True, "wrote": []}

    wrote = []
    asset_dir.mkdir(parents=True, exist_ok=True)
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    if write_new(target, data):
        wrote.append(target_rel)
    if write_new(manifest_path, encoded_manifest + b"\n"):
        wrote.append(manifest_path.relative_to(repo).as_posix())

    if role == "logo":
        if organisation is not None:
            source = provenance["source_page"]
            if organisation.get("logo") != public_url or organisation.get("logo_source") != source:
                organisation.update(logo=public_url, logo_source=source)
                record_path.write_text(json.dumps(research, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
                wrote.append(record_path.relative_to(repo).as_posix())
        if organisation is None or dark_tile or wide:
            map_path = repo / "web" / "logos.js"
            original = text = map_path.read_text(encoding="utf-8")
            if organisation is None:
                value = slug if extension == ".svg" else slug + ".png"
                text, _ = insert_js_map_entry(text, name, value)
            if dark_tile:
                text, _ = insert_js_set_entry(text, "darkTiles", name)
            if wide:
                text, _ = insert_js_set_entry(text, "wideMarks", name)
            if text != original:
                map_path.write_text(text, encoding="utf-8")
                wrote.append("web/logos.js")
    else:
        kind, owner, person = hits[0]
        if kind == "partner-profiles":
            person["photo"] = public_url
            person["photo_source"] = provenance["source_page"]
            path = repo / "data" / "partner-profiles.json"
            path.write_text(json.dumps(profiles, indent=2, ensure_ascii=False) + "\n",
                            encoding="utf-8")
        else:
            person["photo_url"] = public_url
            person["photo_source"] = provenance["source_page"]
            path = repo / "data" / "startup-research.json"
            path.write_text(json.dumps(research, indent=2, ensure_ascii=False) + "\n",
                            encoding="utf-8")
        wrote.append(path.relative_to(repo).as_posix())
    return {**plan, "wrote": wrote}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--store", required=True)
    parser.add_argument("--asset-id", required=True)
    parser.add_argument("--asset-revision", required=True)
    parser.add_argument("--name", required=True, help="Exact reviewed directory/person name.")
    parser.add_argument("--subject-id", required=True)
    parser.add_argument("--role", required=True, choices=("logo", "portrait"))
    parser.add_argument("--founder-of", help="Exact reviewed startup name for a founder portrait.")
    parser.add_argument("--repo", default=".")
    parser.add_argument("--site-origin", default=SITE_ORIGIN)
    parser.add_argument("--dark-tile", action="store_true",
                        help="Logo needs a dark tile (light mark on a light theme).")
    parser.add_argument("--wide", action="store_true",
                        help="Logo is a wide wordmark.")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv)
    try:
        store = assets.StageStore(args.store)
        result = publish(store, args.asset_id, args.asset_revision, args.name,
                         args.subject_id, args.role, args.repo, args.site_origin,
                         args.dark_tile, args.wide, args.dry_run, args.founder_of)
        print(json.dumps({"ok": True, "result": result}, sort_keys=True, ensure_ascii=False))
        return 0
    except (PublishError, assets.AssetError) as exc:
        print(json.dumps({"ok": False, "error": {"code": exc.__class__.__name__,
                                                 "message": str(exc)}}, sort_keys=True))
        return 1


if __name__ == "__main__":
    sys.exit(main())
