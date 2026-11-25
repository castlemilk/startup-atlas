#!/usr/bin/env python3
"""Load and validate the accelerator standard-deal table (issue #533).

The crawler self-critique of 2026-11-25 found that accelerator
participation was recorded as a graph edge, never as a transaction:
there was no standard-deal table for accelerator programmes, so cohort
participation could never become a funding round. The table in
``data/accelerator-deals.json`` is that missing reference data. The
cohort -> round conversion itself is issue #534; this module is only
the table's reader and shape checker, in the same way
``scripts/review_gating.py`` owns ``data/review-gating.json``.

Rules the validator enforces:

* Every entry names the graph entity it belongs to (``partner_id``
  and/or ``programme_id``); when a graph is supplied, those ids must
  exist in it.
* A ``published`` entry must carry a complete deal and an https
  ``source`` fetched from the programme's official pages, with the
  ``verified_on`` date of that fetch.
* An ``unknown`` entry must carry ``deal: null`` and a ``note`` saying
  why. Unknown is a first-class state: a programme whose deal is not
  public is recorded as unknown, never estimated.
* Currency follows the Atlas rule (see ``docs/CURRENCY.md``): USD is
  the base, originals are preserved, and a converted ``amount_usd``
  must use the committed fallback rate in ``data/fx-rates.json`` with
  that table's date recorded as ``fx_rate_date`` — so a stale or
  hand-invented rate fails validation instead of drifting silently.
* Deal components, when present, must sum to the deal amount in the
  deal's own currency.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_TABLE = ROOT / "data" / "accelerator-deals.json"
FX_TABLE = ROOT / "data" / "fx-rates.json"

BASE_CURRENCY = "USD"
DEAL_STATUSES = ("published", "unknown")
_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


def load_table(path=DEFAULT_TABLE):
    """Read the deal table JSON from ``path`` (default: the shipped file)."""
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def load_fx_table(path=FX_TABLE):
    """Read the committed fallback FX table used to check conversions."""
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def _is_number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _check_deal(entry_id, deal, fx, errors):
    where = f"deals[{entry_id}].deal"
    if not isinstance(deal, dict):
        errors.append(f"{where}: published entry must carry a deal object")
        return
    amount = deal.get("amount")
    currency = deal.get("currency")
    if not _is_number(amount) or amount <= 0:
        errors.append(f"{where}.amount: must be a positive number")
    if not (isinstance(currency, str) and re.fullmatch(r"[A-Z]{3}", currency)):
        errors.append(f"{where}.currency: must be a 3-letter ISO code")
        currency = None
    if not (isinstance(deal.get("instrument"), str) and deal["instrument"].strip()):
        errors.append(f"{where}.instrument: must be a non-empty string")
    if not (isinstance(deal.get("terms"), str) and deal["terms"].strip()):
        errors.append(f"{where}.terms: must be a non-empty string")

    equity = deal.get("equity_percent")
    if equity is not None and not (_is_number(equity) and 0 < equity <= 100):
        errors.append(f"{where}.equity_percent: must be null or in (0, 100]")

    cap = deal.get("valuation_cap")
    if cap is not None:
        if not _is_number(cap) or cap <= 0:
            errors.append(f"{where}.valuation_cap: must be null or a positive number")
        cap_ccy = deal.get("valuation_cap_currency")
        if not (isinstance(cap_ccy, str) and re.fullmatch(r"[A-Z]{3}", cap_ccy)):
            errors.append(
                f"{where}.valuation_cap_currency: required when valuation_cap is set"
            )

    # Currency rule: original preserved; USD figure must be derived with
    # the committed fallback rate and that table's date, never invented.
    amount_usd = deal.get("amount_usd")
    if currency is not None and _is_number(amount):
        rates = (fx or {}).get("to_usd") or {}
        if currency == BASE_CURRENCY:
            if amount_usd != amount:
                errors.append(f"{where}.amount_usd: must equal amount for USD deals")
            if deal.get("fx_rate") is not None or deal.get("fx_rate_date") is not None:
                errors.append(f"{where}: USD deals must leave fx_rate/fx_rate_date null")
        elif currency not in rates:
            errors.append(f"{where}.currency: {currency} has no rate in data/fx-rates.json")
        else:
            rate = rates[currency]
            if deal.get("fx_rate") != rate:
                errors.append(
                    f"{where}.fx_rate: must be the data/fx-rates.json rate "
                    f"for {currency} ({rate})"
                )
            if deal.get("fx_rate_date") != (fx or {}).get("date"):
                errors.append(
                    f"{where}.fx_rate_date: must be the data/fx-rates.json "
                    f"date ({(fx or {}).get('date')})"
                )
            if _is_number(deal.get("fx_rate")) and amount_usd != round(amount * deal["fx_rate"]):
                errors.append(
                    f"{where}.amount_usd: must equal round(amount * fx_rate) "
                    f"({round(amount * deal['fx_rate'])})"
                )

    components = deal.get("components")
    if components is None:
        components = []
    if not isinstance(components, list):
        errors.append(f"{where}.components: must be a list")
        return
    total = 0
    for i, comp in enumerate(components):
        cwhere = f"{where}.components[{i}]"
        if not isinstance(comp, dict):
            errors.append(f"{cwhere}: must be an object")
            continue
        if not _is_number(comp.get("amount")) or comp["amount"] <= 0:
            errors.append(f"{cwhere}.amount: must be a positive number")
        else:
            total += comp["amount"]
        if currency is not None and comp.get("currency") != currency:
            errors.append(f"{cwhere}.currency: must match the deal currency ({currency})")
        if not (isinstance(comp.get("instrument"), str) and comp["instrument"].strip()):
            errors.append(f"{cwhere}.instrument: must be a non-empty string")
        cequity = comp.get("equity_percent")
        if cequity is not None and not (_is_number(cequity) and 0 < cequity <= 100):
            errors.append(f"{cwhere}.equity_percent: must be null or in (0, 100]")
    if components and _is_number(amount) and total != amount:
        errors.append(
            f"{where}.components: amounts sum to {total}, not the deal amount {amount}"
        )


def validate_table(table, fx=None, entity_ids=None):
    """Return a list of shape errors for ``table`` (empty list = valid).

    ``fx`` defaults to the shipped ``data/fx-rates.json``. ``entity_ids``,
    when given (e.g. the ids in ``data/graph.json``), makes every
    partner_id / programme_id reference check against the real graph.
    """
    errors = []
    if fx is None:
        fx = load_fx_table()
    if not isinstance(table, dict):
        return ["table: must be a JSON object"]
    if table.get("version") != 1:
        errors.append("version: must be 1")
    if table.get("base_currency") != BASE_CURRENCY:
        errors.append(f"base_currency: must be {BASE_CURRENCY!r}")
    if not (isinstance(table.get("updated"), str) and _DATE_RE.match(table["updated"])):
        errors.append("updated: must be an ISO date (YYYY-MM-DD)")
    deals = table.get("deals")
    if not isinstance(deals, list) or not deals:
        errors.append("deals: must be a non-empty list")
        return errors

    seen_ids = set()
    for i, entry in enumerate(deals):
        where = f"deals[{i}]"
        if not isinstance(entry, dict):
            errors.append(f"{where}: must be an object")
            continue
        entry_id = entry.get("id")
        if not (isinstance(entry_id, str) and _SLUG_RE.match(entry_id)):
            errors.append(f"{where}.id: must be a lowercase slug")
            entry_id = f"#{i}"
        elif entry_id in seen_ids:
            errors.append(f"{where}.id: duplicate id {entry_id!r}")
        seen_ids.add(entry_id)
        where = f"deals[{entry_id}]"
        if not (isinstance(entry.get("name"), str) and entry["name"].strip()):
            errors.append(f"{where}.name: must be a non-empty string")

        partner_id = entry.get("partner_id")
        programme_id = entry.get("programme_id")
        if partner_id is None and programme_id is None:
            errors.append(f"{where}: must name a partner_id and/or programme_id")
        for key, value in (("partner_id", partner_id), ("programme_id", programme_id)):
            if value is None:
                continue
            if not (isinstance(value, str) and value.startswith(key.split("_")[0] + ":")):
                errors.append(f"{where}.{key}: must be a {key.split('_')[0]}: entity id")
            elif entity_ids is not None and value not in entity_ids:
                errors.append(f"{where}.{key}: {value!r} is not an entity in the graph")

        status = entry.get("deal_status")
        if status not in DEAL_STATUSES:
            errors.append(f"{where}.deal_status: must be one of {DEAL_STATUSES}")
        if not (isinstance(entry.get("verified_on"), str)
                and _DATE_RE.match(entry["verified_on"])):
            errors.append(f"{where}.verified_on: must be an ISO date (YYYY-MM-DD)")

        if status == "published":
            _check_deal(entry_id, entry.get("deal"), fx, errors)
            source = entry.get("source")
            if not (isinstance(source, str) and source.startswith("https://")):
                errors.append(f"{where}.source: published entries need an https source URL")
            if not (isinstance(entry.get("source_name"), str)
                    and entry["source_name"].strip()):
                errors.append(f"{where}.source_name: published entries need a source name")
        elif status == "unknown":
            if entry.get("deal") is not None:
                errors.append(f"{where}.deal: unknown entries must record deal as null")
            if not (isinstance(entry.get("note"), str) and entry["note"].strip()):
                errors.append(f"{where}.note: unknown entries must say why in a note")
    return errors


def deal_for_entity(table, entity_id):
    """Return the table entry for a partner or programme entity id, or None.

    This is the lookup issue #534's cohort -> round conversion uses:
    a cohort edge names the partner/programme entity; the entry's deal
    (when ``deal_status`` is ``published``) is the round to create.
    """
    for entry in table.get("deals", []):
        if entity_id in (entry.get("partner_id"), entry.get("programme_id")):
            return entry
    return None


if __name__ == "__main__":  # pragma: no cover - manual check entry point
    problems = validate_table(load_table())
    if problems:
        print("accelerator-deals.json is INVALID:")
        for problem in problems:
            print(f"  - {problem}")
        raise SystemExit(1)
    print("accelerator-deals.json: valid")
