#!/usr/bin/env python3
"""Confidence gating for the Startup Atlas review queue.

Applies the thresholds in ``data/review-gating.json`` (the ONE config
place) to pending entries in ``data/review-queue.json``: an entry whose
kind rule passes is marked ``approved`` with ``decided_by`` set to the
config's ``decided_by`` (``auto-gate``) and a ``decision_note`` naming
the score, the threshold and the rule that fired — the same decision
record shape a human decision uses, so every existing consumer
(identity replay at registry build, the MCP fact write path, the admin
panel) treats auto-decisions identically to human ones.

Rules are per kind and deliberately conservative:

- ``merge`` — confidence >= ``auto_approve_at`` AND, when
  ``require_identity_key`` is set, at least one candidate whose basis
  carries a shared identity key (website host or LinkedIn). Name
  similarity alone NEVER auto-approves (the KG connective-tissue rule).
- ``fact`` — confidence >= ``auto_approve_at`` AND, when
  ``require_complete_draft`` is set, the draft round has stage, amount,
  date and source URL.
- ``startup-lead`` — confidence >= ``auto_approve_at``.
- Any kind with ``auto_approve_at: null`` (``edge``, ``headshot`` in
  v1) never auto-proceeds; every such item queues for a human.

Safety rails: ``"enabled": false`` in the config is the kill switch —
nothing is decided. Decided entries are never touched. Auto-decisions
are fully visible in the admin panel's Auto-applied view and reversible
there (back to ``pending``); merges additionally reverse cleanly
because identity replay is deterministic over the queue's decisions.

Usage
-----
    python3 scripts/review_gating.py [--queue data/review-queue.json]
        [--config data/review-gating.json] [--dry-run]
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
IDENTITY_KEY_MARKERS = ("host", "linkedin", "website")


def utcnow_iso():
    """Current UTC time as an ISO-8601 Z string."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def load_json(path, default=None):
    path = Path(path)
    if not path.exists():
        return default
    with open(path, encoding="utf-8") as handle:
        return json.load(handle)


def _merge_rule(entry, rule):
    if rule.get("require_identity_key"):
        bases = [str(c.get("basis") or "").lower()
                 for c in entry.get("candidates") or []]
        if not any(any(marker in basis for marker in IDENTITY_KEY_MARKERS)
                   for basis in bases):
            return None
        return "candidate basis carries a shared identity key"
    return "no identity-key requirement configured"


def _fact_rule(entry, rule):
    if rule.get("require_complete_draft"):
        draft = entry.get("draft_round") or {}
        missing = [field for field in ("stage", "amount", "date", "source_url")
                   if not draft.get(field)]
        if missing:
            return None
        return "draft round is complete (stage, amount, date, source)"
    return "no completeness requirement configured"


def _generic_rule(entry, rule):
    return "confidence at or above the kind threshold"


_RULES = {"merge": _merge_rule, "fact": _fact_rule}


def check_entry(entry, config):
    """Return the rule description when ``entry`` auto-proceeds, else None."""
    if not config or not config.get("enabled", False):
        return None
    if entry.get("status") != "pending":
        return None
    rule = (config.get("kinds") or {}).get(entry.get("kind"))
    if not rule:
        return None
    threshold = rule.get("auto_approve_at")
    if threshold is None:
        return None
    confidence = entry.get("confidence")
    if confidence is None or float(confidence) < float(threshold):
        return None
    detail = _RULES.get(entry["kind"], _generic_rule)(entry, rule)
    if detail is None:
        return None
    return (f"confidence {float(confidence):.2f} >= {entry['kind']} "
            f"threshold {float(threshold):.2f}; {detail}")


def apply_gating(queue, config, now=None):
    """Auto-approve every pending entry whose kind rule passes.

    Mutates ``queue`` in place; returns the list of entries decided.
    """
    decided = []
    decided_by = (config or {}).get("decided_by") or "auto-gate"
    for entry in queue.get("entries", []):
        detail = check_entry(entry, config)
        if detail is None:
            continue
        entry["status"] = "approved"
        entry["decided_by"] = decided_by
        entry["decided_at"] = now or utcnow_iso()
        entry["decision_note"] = (
            f"Auto-approved by review gating: {detail}. "
            "Reversible from the admin panel (Auto-applied view).")
        decided.append(entry)
    return decided


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="Apply review-queue confidence gating.")
    parser.add_argument("--queue", default=str(ROOT / "data" / "review-queue.json"),
                        help="queue file (default: data/review-queue.json)")
    parser.add_argument("--config", default=str(ROOT / "data" / "review-gating.json"),
                        help="gating config (default: data/review-gating.json)")
    parser.add_argument("--dry-run", action="store_true",
                        help="report what would be decided without writing")
    args = parser.parse_args(argv)

    queue_path = Path(args.queue)
    queue = load_json(queue_path)
    if queue is None:
        print(f"no queue at {queue_path}", file=sys.stderr)
        return 1
    config = load_json(Path(args.config))
    if config is None:
        print(f"no gating config at {args.config}; nothing decided",
              file=sys.stderr)
        return 0
    decided = apply_gating(queue, config)
    for entry in decided:
        print(f"auto-approved {entry['id']} ({entry['kind']}, "
              f"confidence {entry['confidence']})")
    print(f"{len(decided)} entr{'y' if len(decided) == 1 else 'ies'} "
          f"auto-approved")
    if decided and not args.dry_run:
        entries = sorted(queue["entries"], key=lambda e: e["id"])
        with open(queue_path, "w", encoding="utf-8") as handle:
            json.dump({"version": queue.get("version", 1), "entries": entries},
                      handle, indent=2, ensure_ascii=False)
            handle.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
