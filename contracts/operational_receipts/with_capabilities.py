#!/usr/bin/env python3
"""Offline bridge to the exact reviewed capability-manifest v1 validator."""

import argparse
import base64
import hashlib
import json
import os
import shutil
import subprocess
import sys

from report import ContractError, build_report, load_bytes, load_json, render_markdown, timestamp


OWNER_COMMIT = "6f76913b45f2b56ffdc3c14e15877319e155a52e"
VALIDATOR_SHA256 = "471e308cd2483632c7ad3354d81ff156632153fe9aec66742d8fa3ddfd3e62c1"
SCHEMA_VERSION = "atlas-capability-manifest/v1"

# The imported bytes are checked against the pinned owner artifact first.
# Its sole import is node:crypto. A data URL binds execution to the exact bytes
# read and hashed, avoiding a second path read after integrity verification.
NODE_BRIDGE = r"""
let data = '';
for await (const chunk of process.stdin) {
  data += chunk;
  if (Buffer.byteLength(data) > 2 * 1024 * 1024) throw new Error('input limit');
}
const request = JSON.parse(data);
const owner = await import('data:text/javascript;base64,' + request.validator);
if (owner.SCHEMA_VERSION !== request.schemaVersion) throw new Error('version mismatch');
const bytes = Buffer.from(request.manifest, 'base64');
const source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
const manifest = owner.parseStrictJson(source);
const projection = owner.assessManifest(manifest, { now: request.now });
process.stdout.write(JSON.stringify(projection));
"""


def canonical_consumer(validator_path):
    """Create a read-only consumer of a pinned local owner implementation."""
    code = load_bytes(validator_path)
    if hashlib.sha256(code).hexdigest() != VALIDATOR_SHA256:
        raise ContractError("capability validator bytes do not match the reviewed owner commit")
    node = shutil.which("node")
    if node is None:
        raise ContractError("Node.js is unavailable for the canonical capability validator")
    encoded_validator = base64.b64encode(code).decode("ascii")

    def consume(raw, version, as_of):
        if version != SCHEMA_VERSION:
            raise ContractError("unsupported capability schema version")
        when = timestamp(as_of)
        if when.microsecond % 1000:
            raise ContractError("canonical capability clock supports millisecond precision")
        request = {
            "validator": encoded_validator,
            "manifest": base64.b64encode(raw).decode("ascii"),
            "schemaVersion": version,
            "now": when.isoformat(timespec="milliseconds").replace("+00:00", "Z"),
        }
        result = subprocess.run(
            [node, "--input-type=module", "-e", NODE_BRIDGE],
            input=json.dumps(request), capture_output=True, text=True, timeout=10,
            check=False, shell=False,
            # No inherited credential variables or Node preload options.
            env={"PATH": os.environ.get("PATH", "")},
        )
        if result.returncode:
            raise ContractError("canonical capability validator rejected the local input")
        projection = load_json(result.stdout.encode("utf-8"))
        if not isinstance(projection, dict) or projection.get("authorizesActions") is not False:
            raise ContractError("canonical capability assessment has an unexpected shape")
        return projection

    return consume


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("receipt")
    parser.add_argument("--manifest", required=True, help="local lane 4 manifest bytes")
    parser.add_argument("--validator", required=True, help="validator.mjs from pinned lane 4 packet")
    parser.add_argument("--as-of", required=True)
    parser.add_argument("--format", choices=("json", "markdown"), default="markdown")
    args = parser.parse_args(argv)
    try:
        receipt = load_json(load_bytes(args.receipt))
        report = build_report(
            receipt, args.as_of, manifest_bytes=load_bytes(args.manifest),
            capability_consumer=canonical_consumer(args.validator),
        )
        output = json.dumps(report, sort_keys=True, ensure_ascii=False, indent=2) + "\n" if (
            args.format == "json") else render_markdown(report)
        sys.stdout.write(output)
        return 0  # Produced a report, never permission or a release gate result.
    except (ValueError, TypeError, OSError, RecursionError, subprocess.SubprocessError) as exc:
        sys.stderr.write("Invalid receipt dependency: " + str(exc) + "\n")
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
