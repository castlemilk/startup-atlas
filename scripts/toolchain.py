#!/usr/bin/env python3
"""Qualify the provisioned CI toolchain against ci/toolchain.json (issue #147).

Two modes:

  probe  Print ``<tool>_ready=true|false`` and ``<tool>_version=<found|missing>``
         lines (append the output to $GITHUB_OUTPUT in workflows). Never fails:
         workflows use it to skip a setup action when the intended-rig image
         already provides the contracted version, so warm jobs do not download
         an already-provisioned toolchain.

  check  Verify the selected tools and print a recorded-version table. Exits 1
         on any drift (wrong version or missing tool) so the failure is
         controlled and names the expected and found versions. Also verifies
         the contract itself still agrees with go.mod.

Stdlib only; safe to run before any dependency installation.
"""

import argparse
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TOOLS = ("go", "node", "python", "chrome")


def load_contract(path):
    with open(path, encoding="utf-8") as handle:
        return json.load(handle)


def go_mod_version(root):
    match = re.search(r"^go\s+(\d+\.\d+\.\d+)\s*$", (root / "go.mod").read_text(encoding="utf-8"), re.M)
    return match.group(1) if match else None


def found_version(tool, contract):
    """Return the installed version string for a tool, or None if absent."""
    if tool == "python":
        return ".".join(str(part) for part in sys.version_info[:3])
    binary = {"go": "go", "node": "node"}.get(tool)
    if tool == "chrome":
        binary = contract["chrome"].get("binary", "google-chrome")
    if binary is None or shutil.which(binary) is None:
        return None
    try:
        output = subprocess.run(
            [binary, "--version"], capture_output=True, text=True, timeout=30
        ).stdout
    except (OSError, subprocess.SubprocessError):
        return None
    if tool == "go":
        match = re.search(r"go(\d+\.\d+\.\d+)", output)
    elif tool == "node":
        match = re.search(r"v(\d+\.\d+\.\d+)", output)
    else:  # chrome: "Google Chrome 131.0.6778.204"
        match = re.search(r"(\d+\.\d+\.\d+\.\d+)", output)
    return match.group(1) if match else None


def matches(tool, contract, found):
    if found is None:
        return False
    spec = contract[tool]
    mode = spec.get("match", "exact")
    if mode == "present":
        return True
    expected = spec["version"]
    if mode == "exact":
        return found == expected
    if mode == "major":
        return found.split(".")[0] == expected
    if mode == "major.minor":
        return ".".join(found.split(".")[:2]) == expected
    raise ValueError(f"unknown match mode {mode!r} for {tool}")


def selected_tools(raw):
    if not raw:
        return list(TOOLS)
    tools = [part.strip() for part in raw.split(",") if part.strip()]
    unknown = [tool for tool in tools if tool not in TOOLS]
    if unknown:
        raise SystemExit(f"unknown tool(s): {', '.join(unknown)} (choose from {', '.join(TOOLS)})")
    return tools


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=("probe", "check"))
    parser.add_argument("--only", help="comma-separated subset of: " + ", ".join(TOOLS))
    parser.add_argument("--contract", default=str(ROOT / "ci" / "toolchain.json"))
    args = parser.parse_args(argv)

    contract = load_contract(args.contract)
    tools = selected_tools(args.only)

    if args.mode == "check":
        drift = []
        mod_version = go_mod_version(ROOT)
        if mod_version != contract["go"]["version"]:
            drift.append(
                f"contract: go {contract['go']['version']} disagrees with go.mod {mod_version}"
            )
        for tool in tools:
            found = found_version(tool, contract)
            ok = matches(tool, contract, found)
            expected = contract[tool].get("version", contract[tool].get("channel", "?"))
            print(f"{tool}: expected {expected} ({contract[tool].get('match', 'exact')}), "
                  f"found {found or 'missing'} -> {'ok' if ok else 'DRIFT'}")
            if not ok:
                drift.append(f"{tool}: expected {expected}, found {found or 'missing'}")
        if drift:
            print("toolchain drift detected; refresh the provisioned image/toolcache "
                  "or update ci/toolchain.json together with the source pins:", file=sys.stderr)
            for line in drift:
                print(f"  - {line}", file=sys.stderr)
            return 1
        return 0

    for tool in tools:
        found = found_version(tool, contract)
        print(f"{tool}_ready={str(matches(tool, contract, found)).lower()}")
        print(f"{tool}_version={found or 'missing'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
