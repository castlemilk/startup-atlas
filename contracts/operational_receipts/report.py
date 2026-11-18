#!/usr/bin/env python3
"""Offline operational evidence reporting. No network, processes or writes."""

from __future__ import annotations

import argparse
import copy
from datetime import datetime, timezone
import hashlib
import html
import json
from pathlib import Path
import re
import sys


MAX_BYTES = 1_048_576
SHA = re.compile(r"[0-9a-f]{40}\Z")
DIGEST = re.compile(r"[0-9a-f]{64}\Z")
CONCLUSIONS = {"success", "failure", "cancelled", "skipped", "pending", "unknown"}
COMMON = {"id", "kind", "at", "evidence_ref"}
EVENT_FIELDS = {
    "review": {"source_head", "reviewer", "scope", "conclusion"},
    "source_check": {"source_head", "check", "command", "conclusion"},
    "ci": {"workflow", "run_id", "attempt", "run_head", "checkout_head",
           "association", "conclusion", "jobs"},
    "merge": {"source_head", "merge_head", "base_ref", "pr_number"},
    "deployment": {"surface", "environment", "revision", "deployment_id", "conclusion"},
    "verification": {"surface", "environment", "revision", "scope", "mode", "conclusion"},
}


class ContractError(ValueError):
    """The supplied observation packet is not a v1 receipt."""


def require(condition, message):
    if not condition:
        raise ContractError(message)


def fields(value, required, name, optional=()):
    require(isinstance(value, dict), f"{name}: expected object")
    require(set(value) >= set(required), f"{name}: missing fields")
    require(set(value) <= set(required) | set(optional), f"{name}: unknown fields")


def nonempty(value, name):
    require(isinstance(value, str) and bool(value.strip()), f"{name}: expected nonempty string")


def positive(value, name):
    require(type(value) is int and value > 0, f"{name}: expected positive integer")


def timestamp(value):
    nonempty(value, "timestamp")
    require(re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})", value)
            is not None, "timestamp: expected ISO 8601 date/time with timezone")
    if not value.endswith("Z"):
        require(int(value[-5:-3]) < 24 and int(value[-2:]) < 60,
                "timestamp: invalid timezone offset")
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)
    except (ValueError, OverflowError) as exc:
        raise ContractError("timestamp: invalid date/time") from exc


def sha(value, name):
    require(isinstance(value, str) and SHA.fullmatch(value) is not None,
            f"{name}: expected full lowercase Git SHA")


def strings(values, name, allow_empty=False):
    require(isinstance(values, list), f"{name}: expected array")
    require(allow_empty or bool(values), f"{name}: must not be empty")
    for value in values:
        nonempty(value, name)
    require(len(values) == len(set(values)), f"{name}: duplicate value")


def validate_receipt(receipt, as_of):
    """Validate structure and time bindings; do not infer truth from references."""
    now = timestamp(as_of)
    fields(receipt, {"schema_version", "receipt_id", "repository", "source", "owner",
                     "release_owner", "policy", "history", "capability_manifest", "gates"},
           "receipt")
    require(type(receipt["schema_version"]) is int and receipt["schema_version"] == 1,
            "unsupported receipt schema_version")
    nonempty(receipt["receipt_id"], "receipt_id")
    require(isinstance(receipt["repository"], str) and
            re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", receipt["repository"]) is not None,
            "repository: expected owner/name")
    source = receipt["source"]
    fields(source, {"head", "ref", "observed_at", "evidence_ref"}, "source")
    sha(source["head"], "source.head")
    for key in ("ref", "evidence_ref"):
        nonempty(source[key], "source." + key)
    require(timestamp(source["observed_at"]) <= now, "source observation is in the future")
    for key in ("owner", "release_owner"):
        fields(receipt[key], {"name", "reference"}, key)
        for value in receipt[key].values():
            nonempty(value, key)
    policy = receipt["policy"]
    fields(policy, {"source_checks", "ci", "targets", "fresh_for_seconds", "merge_target_ref"}, "policy")
    nonempty(policy["merge_target_ref"], "merge_target_ref")
    strings(policy["source_checks"], "source_checks")
    positive(policy["fresh_for_seconds"], "fresh_for_seconds")
    require(policy["fresh_for_seconds"] <= 31_536_000, "freshness exceeds one year")
    for key in ("ci", "targets"):
        require(isinstance(policy[key], list), f"policy.{key}: expected array")
    workflows = []
    for rule in policy["ci"]:
        fields(rule, {"workflow", "jobs"}, "CI rule")
        nonempty(rule["workflow"], "workflow")
        strings(rule["jobs"], "required jobs")
        workflows.append(rule["workflow"])
    strings(workflows, "CI workflow names", allow_empty=True)
    targets = []
    for rule in policy["targets"]:
        fields(rule, {"surface", "environment", "verification_scopes"}, "target")
        for key in ("surface", "environment"):
            nonempty(rule[key], key)
        strings(rule["verification_scopes"], "verification_scopes")
        targets.append((rule["surface"], rule["environment"]))
    require(len(targets) == len(set(targets)), "duplicate target")
    require(isinstance(receipt["history"], list), "history: expected array")
    ids, ci_attempts = set(), set()
    for event in receipt["history"]:
        require(isinstance(event, dict), "event: expected object")
        kind = event.get("kind")
        require(isinstance(kind, str) and kind in EVENT_FIELDS, "unknown event kind")
        fields(event, COMMON | EVENT_FIELDS[kind], "event", {"note"})
        for key in ("id", "evidence_ref"):
            nonempty(event[key], "event." + key)
        if "note" in event:
            nonempty(event["note"], "note")
        require(event["id"] not in ids, "duplicate evidence ID")
        ids.add(event["id"])
        require(timestamp(event["at"]) <= now, "event observation is in the future")
        for key in ("source_head", "run_head", "merge_head", "revision"):
            if key in event:
                sha(event[key], key)
        for key in ("reviewer", "check", "command", "workflow", "run_id", "base_ref",
                    "surface", "environment", "deployment_id", "scope"):
            if key in event:
                nonempty(event[key], key)
        if kind == "review":
            require(event["scope"] == "source-only", "review scope must be source-only")
            require(event["conclusion"] in ("approved", "changes_requested", "commented"),
                    "invalid review conclusion")
        elif "conclusion" in event:
            require(isinstance(event["conclusion"], str) and
                    event["conclusion"] in CONCLUSIONS, "invalid conclusion")
        if kind == "ci":
            positive(event["attempt"], "attempt")
            identity = (event["workflow"], event["run_id"], event["attempt"])
            require(identity not in ci_attempts, "duplicate CI run/attempt")
            ci_attempts.add(identity)
            if event["checkout_head"] is not None:
                sha(event["checkout_head"], "checkout_head")
            association = event["association"]
            if association is not None:
                fields(association, {"source_head", "base_head", "checkout_head",
                                     "evidence_ref"}, "association")
                for key in ("source_head", "base_head", "checkout_head"):
                    sha(association[key], "association." + key)
                nonempty(association["evidence_ref"], "association.evidence_ref")
            require(isinstance(event["jobs"], list), "jobs: expected array")
            names = []
            for job in event["jobs"]:
                fields(job, {"name", "conclusion"}, "job")
                nonempty(job["name"], "job name")
                require(isinstance(job["conclusion"], str) and
                        job["conclusion"] in CONCLUSIONS, "invalid job conclusion")
                names.append(job["name"])
            strings(names, "job names", allow_empty=True)
        if kind == "merge":
            positive(event["pr_number"], "pr_number")
        if kind == "verification":
            require(event["mode"] in ("recorded_ci", "live_read", "offline"),
                    "invalid verification mode")
    manifest = receipt["capability_manifest"]
    fields(manifest, {"owner_ref", "artifact", "unavailable_reason"}, "capability_manifest")
    nonempty(manifest["owner_ref"], "capability manifest owner")
    artifact = manifest["artifact"]
    if artifact is None:
        nonempty(manifest["unavailable_reason"], "capability unavailable reason")
    else:
        fields(artifact, {"reference", "sha256", "schema_version"}, "manifest artifact")
        for key in ("reference", "schema_version"):
            nonempty(artifact[key], "artifact." + key)
        require(isinstance(artifact["sha256"], str) and DIGEST.fullmatch(artifact["sha256"]),
                "artifact.sha256: expected full lowercase SHA-256")
        require(manifest["unavailable_reason"] is None, "available artifact has unavailable reason")
    require(isinstance(receipt["gates"], list), "gates: expected array")
    gate_ids = []
    for gate in receipt["gates"]:
        fields(gate, {"id", "owner", "reason", "next_action"}, "gate")
        for value in gate.values():
            nonempty(value, "gate field")
        gate_ids.append(gate["id"])
    strings(gate_ids, "gate IDs", allow_empty=True)


def assessment(state, reason, events=()):
    return {"state": state, "reason": reason,
            "evidence_ids": sorted(event["id"] for event in events)}


def latest(events):
    if not events:
        return None, assessment("unknown", "no evidence supplied")
    newest = max(timestamp(e["at"]) for e in events)
    choices = [e for e in events if timestamp(e["at"]) == newest]
    if len(choices) != 1:
        return None, assessment("conflict", "equal-time evidence has no ordering", choices)
    return choices[0], None


def exact_assessment(events, head, sha_key, success="success"):
    event, problem = latest(events)
    if problem:
        return problem
    if event[sha_key] != head:
        return assessment("mismatch", "evidence names a different revision", [event])
    conclusion = event["conclusion"]
    if conclusion == success:
        return assessment("established", "exact revision evidence", [event])
    if conclusion in ("failure", "changes_requested"):
        return assessment("failed", "latest evidence reports failure", [event])
    return assessment("unknown", "latest conclusion is " + conclusion, [event])


def combine(parts, success_reason):
    ids = sorted({i for part in parts for i in part["evidence_ids"]})
    states = {part["state"] for part in parts}
    if states == {"established"}:
        return {"state": "established", "reason": success_reason, "evidence_ids": ids}
    state = next((s for s in ("conflict", "mismatch") if s in states), None)
    if state is None:
        state = "partial" if "established" in states else (
            "failed" if "failed" in states else "unknown")
    return {"state": state, "reason": "not all declared evidence is established",
            "evidence_ids": ids}


def ci_assessment(events, rule, head):
    # A later attempt supersedes an earlier attempt even if input order differs.
    attempts = {}
    for event in events:
        old = attempts.get(event["run_id"])
        if old is None or event["attempt"] > old["attempt"]:
            attempts[event["run_id"]] = event
    event, problem = latest(list(attempts.values()))
    if problem:
        return problem
    if event["run_head"] != head:
        result = assessment("mismatch", "CI run head differs from source head", [event])
    else:
        checkout = event["checkout_head"]
        binding = event["association"]
        if binding is not None and (
            binding["source_head"] != head or binding["checkout_head"] != checkout
            or binding["base_head"] in (head, checkout)
        ):
            result = assessment("mismatch", "CI checkout association contradicts the run", [event])
        elif checkout is None:
            result = assessment("unknown", "actual tested checkout is unknown", [event])
        elif checkout != head and not (
            binding is not None and binding["source_head"] == head
            and binding["checkout_head"] == checkout
            and binding["base_head"] not in (head, checkout)
        ):
            result = assessment("mismatch", "different checkout lacks matching PR-merge evidence", [event])
        else:
            jobs = {job["name"]: job["conclusion"] for job in event["jobs"]}
            results = [event["conclusion"]] + [jobs.get(name, "unknown") for name in rule["jobs"]]
            if all(value == "success" for value in results):
                result = assessment("established", "run and every required job succeeded", [event])
            else:
                state = "partial" if "success" in results else (
                    "failed" if "failure" in results else "unknown")
                result = assessment(state, "required CI outcomes: " + ", ".join(results), [event])
    result["latest"] = copy.deepcopy(event)
    return result


def capability_assessment(reference, raw, consumer, as_of, repository):
    result = {"state": "unavailable", "reason": reference["unavailable_reason"],
              "reference": copy.deepcopy(reference), "projection": None}
    artifact = reference["artifact"]
    if artifact is None:
        return result
    # The canonical v1 capability contract is Atlas-specific. Do not attach its
    # valid projection to a receipt for an unrelated repository.
    if (artifact["schema_version"] == "atlas-capability-manifest/v1"
            and repository != "castlemilk/startup-atlas"):
        result.update(state="invalid", reason="capability_repository_mismatch")
        return result
    if raw is None:
        result["reason"] = "capability_manifest_bytes_unavailable"
        return result
    if not isinstance(raw, bytes) or len(raw) > MAX_BYTES:
        result.update(state="invalid", reason="capability_manifest_bytes_invalid")
        return result
    if hashlib.sha256(raw).hexdigest() != artifact["sha256"]:
        result.update(state="digest_mismatch", reason="capability_manifest_digest_mismatch")
        return result
    if consumer is None:
        result["reason"] = "capability_consumer_contract_pending"
        return result
    try:
        projection = consumer(raw, artifact["schema_version"], as_of)
        require(isinstance(projection, dict), "projection must be an object")
        encoded = json.dumps(projection, allow_nan=False, ensure_ascii=False)
        require(len(encoded.encode("utf-8")) <= MAX_BYTES, "projection exceeds budget")
        result.update(state="consumed", reason="owner-supplied projection; no state re-derivation",
                      projection=copy.deepcopy(projection))
        if projection.get("valid") is False:
            result.update(state="invalid", reason="canonical capability validator rejected the manifest")
    except Exception:
        # Do not echo opaque adapter errors or credential-bearing diagnostic text.
        result.update(state="invalid", reason="capability_consumer_rejected")
    return result


def build_report(receipt, as_of, *, manifest_bytes=None, capability_consumer=None):
    validate_receipt(receipt, as_of)
    now = timestamp(as_of)
    result = copy.deepcopy(receipt)
    history = receipt["history"]
    head = receipt["source"]["head"]
    ttl = receipt["policy"]["fresh_for_seconds"]
    result.update(as_of=as_of, authorizes_actions=False)
    result["source"]["freshness"] = (
        "fresh" if (now - timestamp(receipt["source"]["observed_at"])).total_seconds() < ttl else "stale")
    result["source"]["freshness_scope"] = "recorded ref observation; no live refresh"
    review_events = [e for e in history if e["kind"] == "review"]
    result["review"] = exact_assessment(review_events, head, "source_head", "approved")
    result["review"]["latest"] = copy.deepcopy(latest(review_events)[0])
    result["source_checks"] = {
        name: exact_assessment([e for e in history if e["kind"] == "source_check" and e["check"] == name],
                               head, "source_head")
        for name in receipt["policy"]["source_checks"]
    }
    result["source_ready"] = combine(
        [result["review"], *result["source_checks"].values()],
        "source-only review and declared checks at exact head; no release authorization")
    result["ci"] = {
        rule["workflow"]: ci_assessment(
            [e for e in history if e["kind"] == "ci" and e["workflow"] == rule["workflow"]],
            rule, head)
        for rule in receipt["policy"]["ci"]
    }
    matching_merges = [e for e in history if e["kind"] == "merge"
                       and head in (e["source_head"], e["merge_head"])]
    merges = [e for e in matching_merges if e["base_ref"] == receipt["policy"]["merge_target_ref"]]
    # A historical merge fact is immutable; there may be multiple matching merges.
    result["merged"] = assessment("established", "matching merge into declared target recorded", merges) if merges else (
        assessment("mismatch", "matching revision was merged into a different target", matching_merges)
        if matching_merges else assessment("unknown", "no matching merge evidence"))
    result["targets"] = []
    for rule in receipt["policy"]["targets"]:
        target_events = [e for e in history if e.get("surface") == rule["surface"]
                         and e.get("environment") == rule["environment"]]
        deployments = [e for e in target_events if e["kind"] == "deployment"]
        deployed, problem = latest(deployments)
        last_success, success_problem = latest([e for e in deployments if e["conclusion"] == "success"])
        deployment = problem or exact_assessment(deployments, head, "revision")
        deployment["latest"] = copy.deepcopy(deployed)
        deployment["last_known_success"] = copy.deepcopy(last_success)
        deployment["last_success_state"] = (success_problem or {"state": "established"})["state"]
        deployment["current_serving"] = "unknown; use scoped fresh verification"
        verifications = {}
        for scope in rule["verification_scopes"]:
            events = [e for e in target_events if e["kind"] == "verification" and e["scope"] == scope]
            event, problem = latest(events)
            verified = problem or exact_assessment(events, head, "revision")
            if event is not None:
                verified["latest"] = copy.deepcopy(event)
                if event["mode"] == "offline":
                    verified.update(state="unknown", reason="offline evidence does not verify a served target")
                elif verified["state"] == "established":
                    superseding = [e for e in deployments
                                   if timestamp(e["at"]) >= timestamp(event["at"])
                                   and e["conclusion"] != "skipped"]
                    if superseding:
                        verified.update(state="stale", reason="deployment activity requires a subsequent verification")
                    elif (now - timestamp(event["at"])).total_seconds() >= ttl:
                        verified.update(state="stale", reason="successful observation is outside freshness window")
            verifications[scope] = verified
        result["targets"].append({"surface": rule["surface"], "environment": rule["environment"],
                                  "deployment": deployment, "verification": verifications})
    result["capabilities"] = capability_assessment(
        receipt["capability_manifest"], manifest_bytes, capability_consumer, as_of,
        receipt["repository"])
    return result


def cell(value):
    """Render data as text, never as Markdown links, HTML, or table structure."""
    if value is None:
        return "unknown"
    value = html.escape(str(value), quote=True)
    for char in ("|", "[", "]", "*", "_", chr(96), "\\"):
        value = value.replace(char, "&#" + str(ord(char)) + ";")
    return value.replace("\r", " ").replace("\n", " ")


def render_markdown(report):
    rows = ["# Atlas operational receipt", "",
            "**Report time:** " + cell(report["as_of"]),
            "**Repository:** " + cell(report["repository"]),
            "**Source head:** " + cell(report["source"]["head"]),
            "**Latest reviewed head:** " + cell((report["review"].get("latest") or {}).get("source_head")),
            "**Merge target:** " + cell(report["policy"]["merge_target_ref"]),
            "**Source observation:** " + cell(report["source"]["observed_at"]) +
            " (" + cell(report["source"]["freshness"]) + "; no live refresh)",
            "**Owner:** " + cell(report["owner"]["name"]),
            "**Release owner:** " + cell(report["release_owner"]["name"]), "",
            "This report authorizes no action. Source-ready is limited to source-only evidence.", "",
            "| Assessment | State | Evidence / reason |",
            "| --- | --- | --- |"]

    def row(label, item):
        rows.append("| " + cell(label) + " | " + cell(item["state"]) + " | " +
                    cell(", ".join(item["evidence_ids"]) or "none") + " — " +
                    cell(item["reason"]) + " |")

    row("Source-ready (source-only)", report["source_ready"])
    row("Exact-head source review", report["review"])
    for name, item in report["source_checks"].items():
        row("Source check: " + name, item)
    for name, item in report["ci"].items():
        row("CI: " + name, item)
        event = item.get("latest")
        if event:
            rows.append("| CI exact binding | " + cell(event["conclusion"]) + " | " +
                        cell("run " + event["run_id"] + " attempt " + str(event["attempt"]) +
                             "; run head " + event["run_head"] +
                             "; tested checkout " + (event["checkout_head"] or "unknown")) + " |")
    row("Merged", report["merged"])
    for target in report["targets"]:
        label = target["surface"] + " / " + target["environment"]
        row(label + " deployment", target["deployment"])
        success = target["deployment"]["last_known_success"]
        rows.append("| " + cell(label + " last known successful deployment") + " | historical | " +
                    cell(success["revision"] + " at " + success["at"] if success else "unknown") + " |")
        for scope, item in target["verification"].items():
            row(label + " verification: " + scope, item)
    cap = report["capabilities"]
    rows.extend(["", "## Capability-manifest consumer", "",
                 cell(cap["state"]) + ": " + cell(cap["reason"]),
                 "Owner reference: " + cell(cap["reference"]["owner_ref"])])
    artifact = cap["reference"]["artifact"]
    if artifact:
        rows.extend(["Artifact: " + cell(artifact["reference"]),
                     "Schema version: " + cell(artifact["schema_version"]),
                     "Exact-byte SHA-256: " + cell(artifact["sha256"])])
    projection = cap["projection"]
    if (projection is not None and projection.get("schemaVersion") == "atlas-capability-manifest/v1"
            and projection.get("valid") is True):
        rows.extend(["", "Canonical assessment time: " + cell(projection.get("assessedAt")),
                     "Evidence mode: " + cell(projection.get("evidenceMode")),
                     "Manifest source revisions: " + cell(", ".join(sorted({
                         str(c.get("source", {}).get("revision") or "unknown")
                         for c in projection.get("capabilities", [])}))),
                     "Runtime build revisions: " + cell(", ".join(sorted({
                         str(c.get("runtime", {}).get("revision") or "unknown")
                         for c in projection.get("capabilities", [])}))),
                     "All facet outcomes below come unchanged from lane 4's validator. "
                     "Registry-name observation does not establish live server discovery or authorization.",
                     "", "| Tool / transport | Discovery | Deployment | Authorization | Read / write verification |",
                     "| --- | --- | --- | --- | --- |"])
        for capability in projection.get("capabilities", []):
            facets = capability["facets"]
            def facet(name):
                value = facets[name]
                return str(value["effective"]) + " / " + str(value["freshness"])
            rows.append("| " + cell(capability["tool"] + " / " + capability["transport"]) +
                        " | " + cell(facet("discovered")) + " | " + cell(facet("deployed")) +
                        " | " + cell(facet("authorized")) + " | " +
                        cell(facet("verified_read") + " ; " + facet("verified_write")) + " |")
        if projection.get("errors"):
            rows.extend(["", "Canonical diagnostic errors: " + cell(json.dumps(projection["errors"], sort_keys=True))])
        rows.extend(["", "Exact source/runtime/data revisions, tool/schema digests, reasons and "
                     "per-facet evidence remain in the unchanged JSON projection."])
    elif projection is not None:
        rows.extend(["", "<pre>" + html.escape(json.dumps(
            projection, sort_keys=True, ensure_ascii=False, indent=2)) + "</pre>"])
    rows.extend(["", "## Open gates and next actions", "",
                 "| Gate | Owner | Reason | Next action |", "| --- | --- | --- | --- |"])
    for gate in report["gates"]:
        rows.append("| " + " | ".join(cell(gate[key]) for key in ("id", "owner", "reason", "next_action")) + " |")
    if not report["gates"]:
        rows.append("| none supplied | unknown | Absence of a gate is not permission | Obtain owner decision |")
    rows.extend(["", "## Evidence history", "",
                 "Historical observations remain scoped to their original revision and time.", "",
                 "| ID / kind | Observation time | Exact identities and outcome | Evidence reference |",
                 "| --- | --- | --- | --- |"])
    for event in sorted(report["history"], key=lambda e: (timestamp(e["at"]), e["id"])):
        details = {k: v for k, v in event.items() if k not in COMMON | {"note", "association"}}
        rows.append("| " + cell(event["id"] + " / " + event["kind"]) + " | " +
                    cell(event["at"]) + " | " + cell(json.dumps(details, sort_keys=True, ensure_ascii=False)) +
                    " | " + cell(event["evidence_ref"]) + " |")
    return "\n".join(rows) + "\n"


def load_bytes(path):
    with Path(path).open("rb") as handle:
        data = handle.read(MAX_BYTES + 1)
    require(len(data) <= MAX_BYTES, "input exceeds 1 MiB")
    return data


def load_json(data):
    def pairs(items):
        result = {}
        for key, value in items:
            require(key not in result, "duplicate JSON key")
            result[key] = value
        return result

    def bad_constant(_):
        raise ContractError("non-finite JSON number")

    try:
        return json.loads(data, object_pairs_hook=pairs, parse_constant=bad_constant)
    except (UnicodeError, json.JSONDecodeError, RecursionError) as exc:
        raise ContractError("invalid JSON encoding or structure") from exc


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("receipt", help="local v1 receipt JSON")
    parser.add_argument("--as-of", required=True, help="explicit ISO 8601 evaluation time")
    parser.add_argument("--format", choices=("json", "markdown"), default="markdown")
    parser.add_argument("--manifest", help="optional local manifest bytes; no guessed adapter is installed")
    args = parser.parse_args(argv)
    try:
        receipt = load_json(load_bytes(args.receipt))
        raw = load_bytes(args.manifest) if args.manifest else None
        report = build_report(receipt, args.as_of, manifest_bytes=raw)
        output = json.dumps(report, sort_keys=True, ensure_ascii=False, indent=2) + "\n" if (
            args.format == "json") else render_markdown(report)
        sys.stdout.write(output)
    except (ValueError, TypeError, OSError, RecursionError, OverflowError) as exc:
        sys.stderr.write("Invalid receipt: " + str(exc) + "\n")
        return 2
    # 0 means a valid report was produced, never permission or readiness.
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
