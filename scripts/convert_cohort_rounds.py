#!/usr/bin/env python3
"""Convert recorded accelerator cohort participation into funding rounds.

Issue #534, building on the standard-deal table from #533
(``data/accelerator-deals.json``). The 2026-11-25 crawler self-critique
found that accelerator participation was recorded as an edge, never as
a transaction: a partner profile could list a startup in a cohort and
the graph would show the participation, yet the startup sat at zero
funding rounds (the whole Startmate Summer 2026 cohort did, until
Alloovium's two rounds were hand-recorded in #529). This script is the
conversion the critique called for. It runs first in
``npm run data:generate``, before the graph is built, so converted
rounds flow into the graph, the catalogue and the indexes like any
other reviewed round.

What counts as cohort participation (recorded membership only — the
conversion never infers membership):

* A partner profile (``data/partner-profiles.json``) whose company
  entry's relationship text names a cohort or batch (e.g. "Summer 2026
  accelerator cohort", "Named in 2021 cohort"). Plain "Listed in
  portfolio" entries are not cohort membership.
* A startup record (``data/startup-research.json``) carrying a
  ``participated_in`` relationship to a partner or programme (e.g.
  Alloovium -> Y Combinator, "Summer 2026 accelerator batch").

Each membership is resolved through
``accelerator_deals.deal_for_entity``:

* ``published`` deal -> a round is created in the startup's record,
  mirroring the shape of Alloovium's hand-recorded rounds (#529):
  stage "Accelerator", amount/currency from the deal, valuation from
  the deal's valuation cap where it has one, ``lead_investor`` the
  partner's name, ``source`` the deal's source URL, and a note that
  names the cohort listing and the standard deal it was converted
  from. ``announced_on`` is set only when a cohort date is actually
  carried by the record — none of the current membership records
  carries one, so the field stays absent rather than invented.
* ``unknown`` deal (Boab AI, Antler Australia, Melbourne Accelerator
  Program) -> no round, ever: the membership is listed in the report
  as an explicit unknown-deal skip, so the gap stays visible until a
  sourced deal lands in the table (#533).
* No table entry at all -> also reported, never silently skipped.

Idempotency: a startup that already has a live Accelerator round led
by the same partner (or one carrying the generated round id) is
reported as already present and left untouched — Alloovium's two
hand-recorded rounds are the standing test case. Running the script
twice changes nothing the second time.

Recorded mentions the conversion deliberately does NOT consume are
also listed in the report: startup ``supports`` relationships whose
text mentions a cohort or alumni status (Fluency, Andromeda Robotics)
are researcher annotations — two of them explicitly caution that
cohort membership does not establish participation in a funding
round — not cohort claims by the programme, and their cohorts predate
the published deal terms in the table. They stay unconverted until a
reviewed record states the participation plainly.

Currency follows the Atlas rule: amounts keep the deal's original
currency; the USD figure and its committed fx rate/date live on the
deal-table entry (#533), and downstream consumers convert from there.

``--dry-run`` prints the report without writing.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import accelerator_deals  # noqa: E402
from backfill_structured_fields import normalise_stage  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
RESEARCH = ROOT / "data" / "startup-research.json"
PROFILES = ROOT / "data" / "partner-profiles.json"
REVIEWED = ROOT / "data" / "partners-reviewed.json"

_COHORT_RE = re.compile(r"cohort|batch", re.IGNORECASE)
_MENTION_RE = re.compile(r"cohort|batch|alum", re.IGNORECASE)
_YEAR_RE = re.compile(r"(?:19|20)\d{2}")
_CURRENCY_SYMBOLS = {"AUD": "A$", "USD": "US$", "NZD": "NZ$", "GBP": "£", "EUR": "€"}


def slug(name):
    """The graph builder's slug (scripts/make-graph.py), for entity ids."""
    import unicodedata

    value = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", value).strip("-")


def format_amount(amount, currency):
    symbol = _CURRENCY_SYMBOLS.get(currency)
    return f"{symbol}{amount:,}" if symbol else f"{currency} {amount:,}"


def load_json(path):
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def partner_name_for(entity_id, profiles, reviewed):
    """Resolve a partner entity id to its recorded display name."""
    target = entity_id.split(":", 1)[-1]
    for name in list(profiles) + list(reviewed):
        if slug(name) == target:
            return name
    return None


def collect_memberships(research, profiles):
    """All recorded cohort memberships, deduped by (startup, entity).

    Returns (memberships, noted): memberships are dicts with
    startup_name, entity_id, label and source; noted are recorded
    cohort mentions the conversion deliberately does not consume
    (startup ``supports`` annotations), as (startup_name, entity_id,
    description) tuples for the report.
    """
    memberships = {}
    noted = []

    def add(startup_name, entity_id, label, source):
        key = (startup_name, entity_id)
        if key not in memberships:
            memberships[key] = {
                "startup_name": startup_name,
                "entity_id": entity_id,
                "label": label,
                "source": source,
            }

    for partner_name, profile in profiles.items():
        entity_id = "partner:" + slug(partner_name)
        for company in profile.get("companies", []):
            label = company.get("relationship") or "Listed in portfolio"
            if _COHORT_RE.search(label):
                add(company["name"], entity_id, label, company.get("source", ""))

    for startup in research.get("startups", []):
        for relation in startup.get("relationships", []):
            description = relation.get("description") or ""
            if relation.get("kind") == "participated_in":
                add(startup["name"], relation["target_id"], description,
                    relation.get("source", ""))
            elif _MENTION_RE.search(description):
                noted.append((startup["name"], relation["target_id"], description))

    return sorted(memberships.values(),
                  key=lambda m: (m["startup_name"].lower(), m["entity_id"])), noted


def build_round(membership, entry, partner_name):
    """The funding-round record for one published-deal membership."""
    deal = entry["deal"]
    startup_name = membership["startup_name"]
    year_match = _YEAR_RE.search(membership["label"] or "")
    parts = [slug(startup_name)]
    if year_match:
        parts.append(year_match.group(0))
    parts += [slug(partner_name), "accelerator"]
    round_id = "-".join(parts)

    note = (
        f"{partner_name} lists {startup_name} in its {membership['label']} "
        f"({membership['source']}). Converted to a funding round under #534 "
        f"from the published standard deal in data/accelerator-deals.json "
        f"({entry['source_name']}, verified {entry['verified_on']}): "
        f"{format_amount(deal['amount'], deal['currency'])} per accepted "
        f"company, {deal['instrument']}."
    )
    if deal.get("valuation_cap") is not None:
        note += (
            f" Valuation cap "
            f"{format_amount(deal['valuation_cap'], deal['valuation_cap_currency'])}."
        )
    note += (
        " Cohort participation was previously recorded only as a graph "
        "edge, never as a transaction."
    )

    record = {
        "id": round_id,
        "stage": "Accelerator",
        "amount": deal["amount"],
        "currency": deal["currency"],
    }
    if deal.get("valuation_cap") is not None:
        record["valuation"] = deal["valuation_cap"]
        record["valuation_currency"] = deal["valuation_cap_currency"]
    record["source"] = entry["source"]
    record["note"] = note
    record["stage_normalised"] = normalise_stage("Accelerator")
    record["lead_investor"] = partner_name
    return record


def convert(research, profiles, reviewed, table):
    """Apply the conversion to ``research`` in place; return the report.

    The report is a dict of lists: created (round dicts with their
    startup name), already_present, unknown_deal, no_table_entry,
    no_research_record and noted (mentions deliberately not consumed).
    """
    report = {
        "created": [],
        "already_present": [],
        "unknown_deal": [],
        "no_table_entry": [],
        "no_research_record": [],
        "noted": [],
    }
    by_name = {}
    for startup in research.get("startups", []):
        by_name.setdefault(startup["name"], startup)
        by_name.setdefault(slug(startup["name"]), startup)

    memberships, noted = collect_memberships(research, profiles)
    report["noted"] = noted

    for membership in memberships:
        startup_name = membership["startup_name"]
        entity_id = membership["entity_id"]
        entry = accelerator_deals.deal_for_entity(table, entity_id)
        if entry is None:
            report["no_table_entry"].append((startup_name, entity_id))
            continue
        if entry.get("deal_status") != "published":
            report["unknown_deal"].append(
                (startup_name, entry["name"], membership["label"]))
            continue
        startup = by_name.get(startup_name) or by_name.get(slug(startup_name))
        if startup is None:
            report["no_research_record"].append((startup_name, entry["name"]))
            continue
        partner_name = (
            partner_name_for(entity_id, profiles, reviewed) or entry["name"]
        )
        record = build_round(membership, entry, partner_name)
        live = [r for r in startup.get("funding_rounds", [])
                if "superseded_by" not in r]
        existing = next(
            (r for r in live
             if r.get("id") == record["id"]
             or (r.get("lead_investor") == partner_name
                 and r.get("stage") == "Accelerator")),
            None,
        )
        if existing is not None:
            report["already_present"].append(
                (startup_name, partner_name, existing.get("id")))
            continue
        startup.setdefault("funding_rounds", []).append(record)
        report["created"].append((startup_name, record))
    return report


def print_report(report):
    print(f"Cohort -> round conversion (#534): "
          f"{len(report['created'])} created, "
          f"{len(report['already_present'])} already present, "
          f"{len(report['unknown_deal'])} unknown-deal skips, "
          f"{len(report['no_table_entry'])} without a deal-table entry, "
          f"{len(report['no_research_record'])} without a research record, "
          f"{len(report['noted'])} recorded mentions not converted")
    for startup_name, record in report["created"]:
        print(f"  created: {startup_name}: {record['id']} "
              f"({format_amount(record['amount'], record['currency'])}, "
              f"lead {record['lead_investor']})")
    for startup_name, partner_name, round_id in report["already_present"]:
        print(f"  already present: {startup_name}: {partner_name} "
              f"Accelerator round {round_id}")
    for startup_name, entry_name, label in report["unknown_deal"]:
        print(f"  unknown deal, not converted: {startup_name}: "
              f"{entry_name} ({label}) — no sourced standard deal in "
              f"data/accelerator-deals.json")
    for startup_name, entity_id in report["no_table_entry"]:
        print(f"  no deal-table entry, not converted: {startup_name}: "
              f"{entity_id}")
    for startup_name, entry_name in report["no_research_record"]:
        print(f"  no research record, not converted: {startup_name}: "
              f"{entry_name}")
    for startup_name, entity_id, description in report["noted"]:
        print(f"  noted, not converted: {startup_name} -> {entity_id}: "
              f"{description}")


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--dry-run", action="store_true",
                        help="print the report without writing")
    args = parser.parse_args(argv)

    research = load_json(RESEARCH)
    profiles = load_json(PROFILES)
    reviewed = load_json(REVIEWED)
    table = accelerator_deals.load_table()
    problems = accelerator_deals.validate_table(table)
    if problems:
        print("accelerator-deals.json is INVALID; conversion aborted:")
        for problem in problems:
            print(f"  - {problem}")
        return 1

    report = convert(research, profiles, reviewed, table)
    print_report(report)
    if report["created"] and not args.dry_run:
        RESEARCH.write_text(
            json.dumps(research, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8")
        print(f"Wrote {len(report['created'])} new round(s) to {RESEARCH}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
