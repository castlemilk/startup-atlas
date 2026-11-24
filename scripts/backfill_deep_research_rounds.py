#!/usr/bin/env python3
"""Backfill deep-research funding deltas into the review queue (#414c).

Adds one ``fact`` entry per missing primary round established by the
24 Nov 2026 deep-research reports (repo ``deep-research/``, PR #422):
Canva 9 rounds, Revolut 6 rounds + a Series E enrichment draft,
Airwallex 11 pre-2025 rounds, FlowGo's Startmate accelerator round.

Entries are created through ``build-review-queue.py``'s own helpers so
ids, subject keys, evidence fingerprints and dedup behave exactly as a
crawl-built queue. Confidence is 0.5 — deliberately below the 0.55 fact
auto-approve gate in ``data/review-gating.json`` — because the report
dates are month-precision and several amounts come from reputable
secondary databases rather than the primary announcement. Nothing here
publishes data; approval still goes through the review loop.

FlowGo's announced A$1.2M raise is NOT included: the report establishes
it as a target announced at Demo Day, not a closed round. Only the
completed Startmate A$120k investment is queued.

Run: python3 scripts/backfill_deep_research_rounds.py [--queue PATH]
Idempotent: re-running adds nothing (queue dedup on kind+subject_key).
"""

import argparse
import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

spec = importlib.util.spec_from_file_location(
    "build_review_queue", ROOT / "scripts" / "build-review-queue.py")
brq = importlib.util.module_from_spec(spec)
spec.loader.exec_module(brq)

RUN = "deep-research-2026-11-24"
CONFIDENCE = 0.5

CANVA_SRC = "https://www.revenuememo.com/p/canva-funding"
CANVA_EVIDENCE = [CANVA_SRC, "https://getlatka.com/companies/canva"]
REVOLUT_SRC = "https://www.clay.com/dossier/revolut-funding"
REVOLUT_EVIDENCE = [REVOLUT_SRC, "https://forgeglobal.com/insights/revolut-upcoming-ipo-news/"]
AIRWALLEX_SRC = "https://dossiertwist.com/dossiers/airwallex-pty-ltd/funding-and-investors/"
AIRWALLEX_EVIDENCE = [AIRWALLEX_SRC, "https://inforcapital.com/companies/airwallex/"]
FLOWGO_SRC = "https://www.startmate.com/writing/meet-our-summer26-accelerator-cohort"
FLOWGO_EVIDENCE = [FLOWGO_SRC,
                   "https://www.astn.com.au/sportstech-and-member-news-list?page=8&prop_ModuleId=3844"]

# (startup, stage, amount, currency, month, source_url, evidence)
ROUNDS = [
    # Canva — deep-research/australia-canva.md §5 (Atlas held 2013 seed + Sep 2021).
    ("Canva", "Seed extension", 3600000, "USD", "2014-07", CANVA_SRC, CANVA_EVIDENCE),
    ("Canva", "Seed extension", 6000000, "USD", "2015-05", CANVA_SRC, CANVA_EVIDENCE),
    ("Canva", "Series A", 15000000, "USD", "2015-10", CANVA_SRC, CANVA_EVIDENCE),
    ("Canva", "Series B", 15000000, "USD", "2016-09", CANVA_SRC, CANVA_EVIDENCE),
    ("Canva", "Series C", 40000000, "USD", "2018-01", CANVA_SRC, CANVA_EVIDENCE),
    ("Canva", "Series D", 70000000, "USD", "2019-05", CANVA_SRC, CANVA_EVIDENCE),
    ("Canva", "Series E", 85000000, "USD", "2019-10", CANVA_SRC, CANVA_EVIDENCE),
    ("Canva", "Growth round", 60000000, "USD", "2020-06", CANVA_SRC, CANVA_EVIDENCE),
    ("Canva", "Growth round", 71000000, "USD", "2021-04", CANVA_SRC, CANVA_EVIDENCE),
    # Revolut — deep-research/united-kingdom-revolut.md §5 (Atlas held Series E as text only).
    ("Revolut", "Seed", 1500000, "GBP", "2015-07", REVOLUT_SRC, REVOLUT_EVIDENCE),
    ("Revolut", "Series A", 10000000, "USD", "2016-07", REVOLUT_SRC, REVOLUT_EVIDENCE),
    ("Revolut", "Series B", 66000000, "USD", "2017-07", REVOLUT_SRC, REVOLUT_EVIDENCE),
    ("Revolut", "Series C", 250000000, "USD", "2018-04", REVOLUT_SRC, REVOLUT_EVIDENCE),
    ("Revolut", "Series D", 500000000, "USD", "2020-02", REVOLUT_SRC, REVOLUT_EVIDENCE),
    ("Revolut", "Series D extension", 80000000, "USD", "2020-07", REVOLUT_SRC, REVOLUT_EVIDENCE),
    # Series E enrichment: the held round is text-only ("$800 million", currency
    # not normalised, no amount). This draft gives the reviewer the established
    # amount/currency and the co-leads (SoftBank Vision Fund 2, Tiger Global).
    ("Revolut", "Series E", 800000000, "USD", "2021-07",
     "https://techcrunch.com/2021/07/15/revolut-confirms-a-fresh-800m-in-funding-at-a-33b-valuation-to-supercharge-its-financial-services-superapp/",
     ["https://techcrunch.com/2021/07/15/revolut-confirms-a-fresh-800m-in-funding-at-a-33b-valuation-to-supercharge-its-financial-services-superapp/",
      REVOLUT_SRC]),
    # Airwallex — deep-research/united-states-airwallex.md §5 (Atlas held F/G/H only).
    ("Airwallex", "Pre-Series A", 3000000, "USD", "2016-07", AIRWALLEX_SRC, AIRWALLEX_EVIDENCE),
    ("Airwallex", "Series A", 13000000, "USD", "2017-05", AIRWALLEX_SRC, AIRWALLEX_EVIDENCE),
    ("Airwallex", "Series A extension", 6000000, "USD", "2017-12", AIRWALLEX_SRC, AIRWALLEX_EVIDENCE),
    ("Airwallex", "Series B", 80000000, "USD", "2018-07", AIRWALLEX_SRC, AIRWALLEX_EVIDENCE),
    ("Airwallex", "Series C", 100000000, "USD", "2019-03", AIRWALLEX_SRC, AIRWALLEX_EVIDENCE),
    ("Airwallex", "Series D", 160000000, "USD", "2020-04", AIRWALLEX_SRC, AIRWALLEX_EVIDENCE),
    ("Airwallex", "Series D extension", 40000000, "USD", "2020-09", AIRWALLEX_SRC, AIRWALLEX_EVIDENCE),
    ("Airwallex", "Series D extension", 100000000, "USD", "2021-03", AIRWALLEX_SRC, AIRWALLEX_EVIDENCE),
    ("Airwallex", "Series E", 200000000, "USD", "2021-09", AIRWALLEX_SRC, AIRWALLEX_EVIDENCE),
    ("Airwallex", "Series E extension (E1)", 100000000, "USD", "2021-11", AIRWALLEX_SRC, AIRWALLEX_EVIDENCE),
    ("Airwallex", "Series E extension (E2)", 100000000, "USD", "2022-10", AIRWALLEX_SRC, AIRWALLEX_EVIDENCE),
    # FlowGo — deep-research/malaysia-flowgo.md §5: the completed Startmate
    # investment only (A$120k, Feb 2026). The A$1.2M figure is an announced
    # raise target, NOT a closed round, and is deliberately excluded.
    ("FlowGo", "Accelerator", 120000, "AUD", "2026-02", FLOWGO_SRC, FLOWGO_EVIDENCE),
]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--queue", default=str(ROOT / "data" / "review-queue.json"))
    args = parser.parse_args()
    queue_path = Path(args.queue)
    queue = brq.load_queue(queue_path)
    added = 0
    for startup, stage, amount, currency, month, source_url, evidence in ROUNDS:
        draft = {"startup": startup, "amount": amount, "currency": currency,
                 "stage": stage, "date": month, "source_url": source_url}
        key = f"{brq.slug(startup)}:{brq.slug(stage)}:{int(amount)}"
        entry = brq._new_entry(
            f"fact:{key}", "fact", f"startup:{brq.slug(startup)}", key,
            [], evidence, CONFIDENCE, RUN)
        entry["draft_round"] = draft
        if brq.add_entry(queue, entry):
            added += 1
        else:
            print(f"dedup blocked: {entry['id']}")
    brq.save_queue(queue, queue_path)
    print(f"added {added} fact entries ({len(ROUNDS)} candidates)")


if __name__ == "__main__":
    main()
