#!/usr/bin/env python3
"""Stamp and verify the shared generated-input set for the CI sequence (#145 Q2).

`npm run data:generate` runs a four-step chain (make-data, make-graph,
add-provider-edges, backfill) that produces the catalogue, the graph and the
Connect graph snapshot, and normalises the in/out source files the chain
itself consumes. Historically every top-level command regenerated that chain:
`npm test` generated once and `npm run build` generated again, so one CI
sequence paid for two identical generation passes.

This module is the contract that lets a CI sequence generate ONCE and share
the result:

- `stamp` runs at the end of `npm run data:generate`. It records the source
  revision plus a SHA-256 of every file in the generation closure (below)
  into `data/.generated-inputs.json` (git-ignored; never committed, so a
  stamp can never be reused across commits by accident — and the recorded
  revision makes cross-revision reuse fail verification anyway).
- `verify` runs at the start of the prepared entrypoints
  (`npm run test:prepared`, `npm run build:prepared`). It fails when the
  stamp is missing, when the recorded revision differs from the current
  checkout revision, or when any closure file is missing, changed, or new.
  A test step that mutates a shared generated input therefore fails the
  build step's verification instead of silently building from dirty inputs.

The developer commands `npm test` and `npm run build` stay self-contained
(they still regenerate); `npm run ci` is the shared-generation sequence:
generate once, then test:prepared, then build:prepared.

Generation closure — every file the chain reads or writes, so any source
edit after generation is detected as staleness and any output mutation is
detected as dirtiness:

- Generator code: the four chain entrypoints, the modules make-graph
  imports, and the catalogue merge helper pair.
- Web inputs read by add-provider-edges: relationships, logos, and the
  asset manifests.
- Data files: the pure sources, the in/out files the backfill normalises,
  and the three generated outputs.
"""

import argparse
import hashlib
import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STAMP_PATH = Path('data/.generated-inputs.json')

GENERATOR_CODE = [
    'scripts/make-data.py',
    'scripts/make-graph.py',
    'scripts/edge_scoring.py',
    'scripts/latest_value.py',
    'scripts/currency.py',
    'scripts/merge-additions.mjs',
    'scripts/catalogue-entries.mjs',
    'scripts/add-provider-edges.mjs',
    'scripts/backfill_structured_fields.py',
    'web/relationships.js',
    'web/logos.js',
]

DATA_FILES = [
    # Pure sources and in/out files (backfill normalises research,
    # catalogue and opportunities-added in place during generation).
    'data/partner-leads.json',
    'data/partner-profiles.json',
    'data/partners-reviewed.json',
    'data/startup-research.json',
    'data/opportunities-added.json',
    'data/identity.json',
    'data/treemap-evidence.json',
    # Generated outputs consumed by tests and the build.
    'data/catalogue.json',
    'data/graph.json',
    'backend/internal/graph/snapshot.json',
]

MANIFEST_GLOB = ('web/assets/manifests', '*.json')

# Optional inputs: recorded when present; appearing or disappearing after
# generation is a change verification must catch, like any other.
OPTIONAL = {'data/identity.json', 'data/treemap-evidence.json'}


def closure_paths(root):
    """Relative paths of every file in the generation closure."""
    paths = list(GENERATOR_CODE) + list(DATA_FILES)
    manifest_dir = root / MANIFEST_GLOB[0]
    if manifest_dir.is_dir():
        paths += sorted(
            str(p.relative_to(root))
            for p in manifest_dir.glob(MANIFEST_GLOB[1])
        )
    return paths


def digest(path):
    h = hashlib.sha256()
    with open(path, 'rb') as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def current_revision(root):
    """The revision the stamp binds to: CI's ATLAS_SOURCE_REVISION when set,
    else the checkout's HEAD, else None (hash checks still apply)."""
    env = os.environ.get('ATLAS_SOURCE_REVISION')
    if env:
        return env
    try:
        out = subprocess.run(
            ['git', 'rev-parse', 'HEAD'], cwd=root,
            capture_output=True, text=True, timeout=10,
        )
        if out.returncode == 0:
            return out.stdout.strip() or None
    except (OSError, subprocess.SubprocessError):
        pass
    return None


def collect(root):
    files = {}
    for rel in closure_paths(root):
        target = root / rel
        files[rel] = digest(target) if target.is_file() else None
    return files


def stamp(root):
    data = {
        'format': 1,
        'source_revision': current_revision(root),
        'generated_at': datetime.now(timezone.utc).isoformat(),
        'files': collect(root),
    }
    target = root / STAMP_PATH
    target.write_text(json.dumps(data, indent=2, sort_keys=True) + '\n',
                      encoding='utf-8')
    present = sum(1 for v in data['files'].values() if v is not None)
    print(f"Stamped {present} generated-input files "
          f"(revision {data['source_revision'] or 'unknown'}) "
          f"-> {STAMP_PATH}")
    return 0


def verify(root):
    target = root / STAMP_PATH
    if not target.is_file():
        print(f"ERROR: no generated-input stamp at {STAMP_PATH}. "
              "Run `npm run data:generate` first; prepared entrypoints "
              "never reuse unstamped or previous-revision output.",
              file=sys.stderr)
        return 1
    try:
        data = json.loads(target.read_text(encoding='utf-8'))
    except (OSError, json.JSONDecodeError) as error:
        print(f"ERROR: unreadable generated-input stamp {STAMP_PATH}: {error}",
              file=sys.stderr)
        return 1
    problems = []
    stamped_revision = data.get('source_revision')
    revision = current_revision(root)
    if stamped_revision and revision and stamped_revision != revision:
        problems.append(
            f"source revision changed since generation "
            f"(stamped {stamped_revision}, current {revision})")
    stamped_files = data.get('files') or {}
    current_files = collect(root)
    for rel in sorted(set(stamped_files) | set(current_files)):
        before, now = stamped_files.get(rel), current_files.get(rel)
        if before == now:
            continue
        if before is None:
            problems.append(f"{rel}: appeared after generation (stale inputs)")
        elif now is None:
            problems.append(f"{rel}: missing (was present at generation)")
        else:
            problems.append(f"{rel}: changed since generation")
    if problems:
        print("ERROR: generated inputs are stale or dirty — refusing to "
              "consume them:", file=sys.stderr)
        for problem in problems:
            print(f"  - {problem}", file=sys.stderr)
        print("Re-run `npm run data:generate` to regenerate and re-stamp.",
              file=sys.stderr)
        return 1
    present = sum(1 for v in current_files.values() if v is not None)
    print(f"Generated inputs verified: {present} files match the stamp "
          f"(revision {stamped_revision or 'unknown'}).")
    return 0


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['stamp', 'verify'])
    parser.add_argument('--root', type=Path, default=ROOT,
                        help='repository root (default: this script\'s repo)')
    args = parser.parse_args(argv)
    root = args.root.resolve()
    return stamp(root) if args.command == 'stamp' else verify(root)


if __name__ == '__main__':
    sys.exit(main())
