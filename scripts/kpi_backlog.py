#!/usr/bin/env python3
"""KPI backlog: the file that turns red indicators into GitHub issues.

The improvement loop files issues without any agent needing issue
permission. The loop appends an entry to ``data/kpi-backlog.json`` (this
script's ``add`` command); the ``kpi-backlog`` GitHub workflow reads the
file and files each open entry as an issue using only the repository's
default ``GITHUB_TOKEN``. Fixes land as branches/PRs (merged by the
owner); the loop marks the entry ``done`` once the fix is merged and
the indicator re-measures.

Schema (``data/kpi-backlog.json``)::

    {"version": 1, "entries": [entry, ...]}

Each entry::

    key:       unique id, e.g. "F3" (the KPI indicator id, or a
               distinct suffix such as "F3-a" if one indicator needs
               two tickets). Used as the dedup key everywhere.
    indicator: the KPI id the entry tracks, e.g. "F3".
    title:     short issue title (without the [kpi-backlog:KEY] prefix;
               the filing step adds it).
    body:      problem, evidence with numbers/dates, proposed fix.
    labels:    list; must include "kpi-backlog" (added automatically
               if missing). Any other label must already exist on the
               repository or ``gh issue create`` will fail.
    status:    "open" or "done".
    created:   YYYY-MM-DD.
    issue:     GitHub issue number once filed, or null. Filled in by
               the loop when observed — the workflow never writes
               this file, so it cannot record the number itself.

Idempotency: the filing step searches GitHub for an issue whose title
contains ``kpi-backlog:<key>`` with label ``kpi-backlog`` (any state,
so a closed issue still blocks a re-file) and creates the issue only
if none exists. To re-file a closed issue, reopen it or change the
entry's key.

    python3 scripts/kpi_backlog.py add --key F3 --indicator F3 \\
        --title "..." --body "..." [--labels kpi-backlog] [--created 2026-11-23]
    python3 scripts/kpi_backlog.py done F3
    python3 scripts/kpi_backlog.py list [--status open]
    python3 scripts/kpi_backlog.py file [--dry-run]

``file`` shells out to ``gh`` (pre-authenticated on GitHub Actions
runners; locally it uses the user's ``gh`` login). ``--dry-run`` still
calls ``gh issue list`` (read-only) but never creates an issue, so the
skip/create decision can be verified without writing anything.
"""

import argparse
import json
import re
import subprocess
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_BACKLOG = ROOT / "data" / "kpi-backlog.json"

LABEL = "kpi-backlog"
KEY_RE = re.compile(r"^[A-Z]+[0-9]+(-[a-z])?$")
FOOTER = (
    "\n\n---\n"
    "Filed automatically from data/kpi-backlog.json by the kpi-backlog "
    "workflow. The backlog entry is the source of truth; "
    "see docs/LIVE-INDEX-LOOP.md."
)


class BacklogError(ValueError):
    """Invalid backlog file or entry."""


def load_backlog(path):
    """Load the backlog file; return {"version": 1, "entries": [...]}."""
    data = json.loads(Path(path).read_text())
    if not isinstance(data, dict) or data.get("version") != 1:
        raise BacklogError(f"{path}: expected version 1 backlog")
    entries = data.get("entries")
    if not isinstance(entries, list):
        raise BacklogError(f"{path}: 'entries' must be a list")
    return data


def save_backlog(path, data):
    Path(path).write_text(json.dumps(data, indent=1) + "\n")


def validate_entry(entry):
    for field in ("key", "indicator", "title", "body"):
        if not entry.get(field) or not isinstance(entry[field], str):
            raise BacklogError(f"entry needs a non-empty string '{field}'")
    if not KEY_RE.match(entry["key"]):
        raise BacklogError(f"key {entry['key']!r} must look like F3 or Q4-a")
    if entry.get("status", "open") not in ("open", "done"):
        raise BacklogError(f"status must be 'open' or 'done', got {entry.get('status')!r}")
    labels = entry.get("labels") or []
    if not isinstance(labels, list) or not all(isinstance(x, str) for x in labels):
        raise BacklogError("labels must be a list of strings")
    if LABEL not in labels:
        labels = [LABEL] + labels
        entry["labels"] = labels
    return entry


def add_entry(data, entry):
    """Append an entry; raise BacklogError if the key already exists."""
    entry = validate_entry(dict(entry))
    entry.setdefault("status", "open")
    entry.setdefault("created", date.today().isoformat())
    entry.setdefault("issue", None)
    if any(e["key"] == entry["key"] for e in data["entries"]):
        raise BacklogError(f"key {entry['key']!r} already exists in the backlog")
    data["entries"].append(entry)
    return entry


def mark_done(data, key):
    """Mark the entry with ``key`` done; raise KeyError if absent."""
    for entry in data["entries"]:
        if entry["key"] == key:
            entry["status"] = "done"
            return entry
    raise KeyError(f"no backlog entry with key {key!r}")


def open_entries(data):
    return [e for e in data["entries"] if e.get("status", "open") == "open"]


def issue_title(entry):
    return f"[kpi-backlog:{entry['key']}] {entry['title']}"


def issue_search_query(entry):
    return f"kpi-backlog:{entry['key']} in:title"


def _run(argv):
    """One subprocess call; isolated here so tests can substitute a fake."""
    return subprocess.run(argv, capture_output=True, text=True)


def _ensure_label():
    """Create the kpi-backlog label if it is missing.

    A non-zero exit is expected when the label already exists and is
    ignored; a genuine failure surfaces later, when issue creation
    fails and the run fails loudly.
    """
    _run([
        "gh", "label", "create", LABEL,
        "--description", "Filed automatically from data/kpi-backlog.json by the KPI loop",
        "--color", "0E8A16",
    ])


def existing_issue_numbers(entry):
    """Issue numbers already filed for this entry's key (any state)."""
    result = _run([
        "gh", "issue", "list",
        "--search", issue_search_query(entry),
        "--label", LABEL, "--state", "all",
        "--json", "number",
    ])
    if result.returncode != 0:
        raise RuntimeError(
            f"gh issue list failed for key {entry['key']}: {result.stderr.strip()}")
    try:
        rows = json.loads(result.stdout or "[]")
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"gh issue list returned bad JSON for key {entry['key']}: {exc}")
    return [row["number"] for row in rows]


def create_issue(entry):
    """File the entry as an issue; return the new issue number."""
    argv = ["gh", "issue", "create", "--title", issue_title(entry),
            "--body", entry["body"].rstrip() + FOOTER]
    for label in entry.get("labels", [LABEL]):
        argv += ["--label", label]
    result = _run(argv)
    if result.returncode != 0:
        raise RuntimeError(
            f"gh issue create failed for key {entry['key']}: {result.stderr.strip()}")
    match = re.search(r"/(\d+)\s*$", result.stdout.strip())
    if not match:
        raise RuntimeError(
            f"gh issue create returned an unparsable URL for key {entry['key']}: {result.stdout!r}")
    return int(match.group(1))


def file_entries(backlog_path, dry_run=False):
    """File every open entry that has no issue yet. Returns (created, skipped).

    In dry-run mode the read-only ``gh issue list`` calls still run, but
    nothing is created: entries with no existing issue are reported as
    WOULD CREATE. The backlog file is never written by this command.
    """
    data = load_backlog(backlog_path)
    if not dry_run:
        _ensure_label()
    created, skipped = [], []
    for entry in open_entries(data):
        existing = existing_issue_numbers(entry)
        if existing:
            print(f"SKIP {entry['key']}: issue #{existing[0]} already exists")
            skipped.append(entry["key"])
            continue
        if dry_run:
            print(f"WOULD CREATE {entry['key']}: {issue_title(entry)}")
            created.append(entry["key"])
            continue
        number = create_issue(entry)
        print(f"CREATE {entry['key']}: issue #{number}")
        created.append(entry["key"])
    return created, skipped


def _add_args(parser):
    parser.add_argument("--key", required=True)
    parser.add_argument("--indicator", required=True)
    parser.add_argument("--title", required=True)
    parser.add_argument("--body", required=True)
    parser.add_argument("--body-file", help="read --body from this file instead")
    parser.add_argument("--labels", nargs="*", default=[LABEL])
    parser.add_argument("--created", default=None)


def main(argv=None):
    parser = argparse.ArgumentParser(description="KPI backlog (data/kpi-backlog.json)")
    parser.add_argument("--backlog", type=Path, default=DEFAULT_BACKLOG)
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("--backlog", type=Path, default=DEFAULT_BACKLOG)
    sub = parser.add_subparsers(dest="command", required=True)

    p_add = sub.add_parser("add", help="append an entry (dedupe by key)", parents=[common])
    _add_args(p_add)

    p_done = sub.add_parser("done", help="mark an entry done", parents=[common])
    p_done.add_argument("key")

    p_list = sub.add_parser("list", help="list entries", parents=[common])
    p_list.add_argument("--status", choices=["open", "done", "all"], default="open")

    p_file = sub.add_parser("file", help="file open entries as GitHub issues via gh", parents=[common])
    p_file.add_argument("--dry-run", action="store_true")

    args = parser.parse_args(argv)
    try:
        if args.command == "file":
            created, skipped = file_entries(args.backlog, dry_run=args.dry_run)
            print(f"filed: {len(created)}, skipped: {len(skipped)}")
            return 0

        data = load_backlog(args.backlog)
        if args.command == "add":
            body = args.body
            if args.body_file:
                body = Path(args.body_file).read_text()
            entry = add_entry(data, {
                "key": args.key, "indicator": args.indicator,
                "title": args.title, "body": body,
                "labels": args.labels, "created": args.created or date.today().isoformat(),
            })
            save_backlog(args.backlog, data)
            print(f"added {entry['key']}: {entry['title']}")
        elif args.command == "done":
            entry = mark_done(data, args.key)
            save_backlog(args.backlog, data)
            print(f"done {entry['key']}: {entry['title']}")
        elif args.command == "list":
            entries = data["entries"] if args.status == "all" else [
                e for e in data["entries"] if e.get("status", "open") == args.status]
            for entry in entries:
                issue = f"#{entry['issue']}" if entry.get("issue") else "-"
                print(f"{entry['key']:8} {entry.get('status', 'open'):5} "
                      f"{entry['indicator']:4} {issue:6} {entry['title']}")
        return 0
    except (BacklogError, KeyError, RuntimeError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
