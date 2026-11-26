#!/usr/bin/env python3
"""Promote a reviewed profiles-crawl person into partner-profiles.json.

Issue #366 slice 4 (docs/PERSON-IDENTITY.md): when a profiles-crawl
person is approved into ``data/partner-profiles.json``, the verified
LinkedIn URL the crawl already surfaced must be carried into the row's
first-class ``linkedin`` field, so recording the identity key is part
of the normal review motion rather than a special pass (slices 2's
hand-recorded batches).

The crawl proposes; it never writes reviewed data. This tool is the
reviewer's hand on the write: it reads one profiles artifact
(``latest-profiles.json`` shape: a ``candidates`` list), finds the
people rows for one partner + person, and writes the reviewed row.

What counts as the verified LinkedIn URL:

- a matching people row whose ``candidate_url`` normalises to a
  LinkedIn identity key via ``entity_resolution.normalise_linkedin()``
  (the person's own profile link, as published on the firm's page —
  the row's ``source_url`` is that page, and becomes the row's
  ``source``); or
- a matching social row (same partner, same person name) whose
  ``candidate_url`` normalises the same way.

The recorded value is the URL **as published**, never its normalised
form (PERSON-IDENTITY.md Decision 1). Two different keys for the same
person are a data error and refuse the promotion; a ``linkedin``
already recorded on the row with a different key also refuses (fix
the row by hand — there is no override list). A person with no
LinkedIn in the crawl promotes plainly, with ``source`` only.

Usage
-----
    python3 scripts/promote_profile_person.py \
        --artifact research/crawl/latest-profiles.json \
        --partner "Airtree" --name "Jane Example" --role "Partner" \
        [--profiles data/partner-profiles.json] [--dry-run]

``--role`` is required when adding a new person (reviewed rows carry
a role and this tool never invents one); it is optional when the
person is already recorded, and then only updates the role when
given. The partner profile must already exist — creating one needs
type/geography judgements this tool does not make.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"
sys.path.insert(0, str(SCRIPTS))

try:
    import entity_resolution as _entity_resolution
except ImportError:  # pragma: no cover - the module ships with the repo
    _entity_resolution = None


def normalise_name(name):
    return " ".join(str(name or "").casefold().split())


def linkedin_key(url):
    """Identity key for a URL, via the one normaliser (#366 Decision 2)."""
    if _entity_resolution is not None:
        return _entity_resolution.normalise_linkedin(url or "")
    return ""


def find_linkedin(rows, partner, name):
    """The verified LinkedIn URL for one person in a profiles artifact.

    ``rows`` is the artifact's candidate list. Returns ``(raw_url,
    key)`` — the URL as published and its identity key — or
    ``(None, "")`` when the crawl surfaced no LinkedIn for this
    person. Raises ValueError when two different keys surface for
    the same person: that is a data error at the source, not a
    choice for this tool to make.
    """
    partner_key = normalise_name(partner)
    name_key = normalise_name(name)
    found = {}
    for row in rows:
        if normalise_name(row.get("partner")) != partner_key:
            continue
        if row.get("kind") not in ("people", "social"):
            continue
        if normalise_name(row.get("name")) != name_key:
            continue
        url = row.get("candidate_url") or ""
        key = linkedin_key(url)
        if key:
            found[key] = url
    if len(found) > 1:
        raise ValueError(
            f"conflicting LinkedIn URLs for {name!r} at {partner!r}: "
            + ", ".join(sorted(found.values())))
    if not found:
        return None, ""
    key, url = next(iter(found.items()))
    return url, key


def find_source(rows, partner, name):
    """The team/profile page a people row for this person came from."""
    partner_key = normalise_name(partner)
    name_key = normalise_name(name)
    for row in rows:
        if row.get("kind") != "people":
            continue
        if normalise_name(row.get("partner")) != partner_key:
            continue
        if normalise_name(row.get("name")) != name_key:
            continue
        if row.get("source_url"):
            return row["source_url"]
    return None


def promote(profiles, rows, partner, name, role=None):
    """Write one reviewed person row into ``profiles`` (in place).

    Returns ``(entry, action)`` where action is ``"added"``,
    ``"updated"`` or ``"unchanged"``. Raises ValueError for an
    unknown partner, a missing role on a new person, conflicting
    crawl LinkedIn keys, or a recorded ``linkedin`` that disagrees
    with the crawl's key.
    """
    partner_record = None
    for key, record in profiles.items():
        if normalise_name(key) == normalise_name(partner):
            partner_record = record
            break
    if partner_record is None:
        raise ValueError(
            f"partner {partner!r} has no profile in partner-profiles.json; "
            "create the profile first (type/geography are review calls)")
    linkedin_url, key = find_linkedin(rows, partner, name)
    people = partner_record.setdefault("people", [])
    existing = next(
        (p for p in people if normalise_name(p.get("name")) == normalise_name(name)),
        None)
    if existing is None:
        if not role:
            raise ValueError(
                f"--role is required to add {name!r}: reviewed people "
                "rows carry a role and this tool never invents one")
        source = find_source(rows, partner, name)
        if not source:
            raise ValueError(
                f"no profiles-crawl people row for {name!r} at "
                f"{partner!r} to take a source from")
        entry = {"name": name, "role": role, "source": source}
        if linkedin_url:
            entry["linkedin"] = linkedin_url
        people.append(entry)
        return entry, "added"
    changed = False
    if linkedin_url:
        recorded = existing.get("linkedin") or ""
        if recorded and linkedin_key(recorded) != key:
            raise ValueError(
                f"{name!r} already records linkedin {recorded!r}, which "
                f"normalises to a different key than the crawl's "
                f"{linkedin_url!r}; fix the row by hand")
        if not recorded:
            existing["linkedin"] = linkedin_url
            changed = True
    if role and existing.get("role") != role:
        existing["role"] = role
        changed = True
    return existing, "updated" if changed else "unchanged"


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--artifact", type=Path, required=True,
                        help="Profiles crawl artifact (latest-profiles.json)")
    parser.add_argument("--partner", required=True)
    parser.add_argument("--name", required=True)
    parser.add_argument("--role",
                        help="Role for a newly added person (required then)")
    parser.add_argument("--profiles", type=Path,
                        default=ROOT / "data" / "partner-profiles.json")
    parser.add_argument("--dry-run", action="store_true",
                        help="Print the resulting row without writing")
    args = parser.parse_args(argv)

    artifact = json.loads(args.artifact.read_text(encoding="utf-8"))
    rows = artifact.get("candidates", [])
    if not any(normalise_name(r.get("partner")) == normalise_name(args.partner)
               and normalise_name(r.get("name")) == normalise_name(args.name)
               and r.get("kind") == "people" for r in rows):
        print(f"No profiles-crawl people row for {args.name!r} at "
              f"{args.partner!r} in {args.artifact}.", file=sys.stderr)
        return 1
    profiles = json.loads(args.profiles.read_text(encoding="utf-8"))
    try:
        entry, action = promote(profiles, rows, args.partner, args.name,
                                role=args.role)
    except ValueError as exc:
        print(str(exc), file=sys.stderr)
        return 1
    if args.dry_run:
        print(f"[dry-run] would mark {args.name!r} as {action}: "
              + json.dumps(entry, ensure_ascii=False))
        return 0
    if action != "unchanged":
        with open(args.profiles, "w", encoding="utf-8") as handle:
            json.dump(profiles, handle, indent=2, ensure_ascii=False)
            handle.write("\n")
    print(f"{args.name!r} at {args.partner!r}: {action}"
          + (f" (linkedin {entry['linkedin']})" if entry.get("linkedin") else "")
          + ". Review the diff before committing.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
