"""Tests for the cohort -> round conversion (issue #534).

The conversion (scripts/convert_cohort_rounds.py) turns recorded
accelerator cohort participation into funding rounds using the
standard-deal table from #533. These tests pin the rules the
self-critique demanded: the created round mirrors the shape of
Alloovium's hand-recorded rounds (#529), the conversion is
idempotent and never duplicates them, and programmes whose standard
deal is unknown (Boab AI, Antler Australia, Melbourne Accelerator
Program) are reported explicitly — never silently skipped and never
given an estimated round.
"""

import copy
import importlib.util
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, ROOT / path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


convert_mod = load("atlas_convert_cohort_rounds", "scripts/convert_cohort_rounds.py")
deals_mod = load("atlas_accelerator_deals", "scripts/accelerator_deals.py")

TABLE = deals_mod.load_table()
RESEARCH = convert_mod.load_json(convert_mod.RESEARCH)
PROFILES = convert_mod.load_json(convert_mod.PROFILES)
REVIEWED = convert_mod.load_json(convert_mod.REVIEWED)


def convert_on(research):
    return convert_mod.convert(research, PROFILES, REVIEWED, TABLE)


def startup(research, name):
    return next(s for s in research["startups"] if s["name"] == name)


def synthetic_inputs():
    """A minimal published-deal world: one profile cohort, one batch
    relationship, one portfolio listing that is NOT a cohort."""
    table = {
        "version": 1,
        "base_currency": "USD",
        "updated": "2026-11-25",
        "deals": [
            {
                "id": "acme-accelerator",
                "name": "Acme Accelerator",
                "partner_id": "partner:acme",
                "programme_id": None,
                "deal_status": "published",
                "deal": {
                    "amount": 50000,
                    "amount_usd": 50000,
                    "currency": "USD",
                    "instrument": "Post-money SAFE",
                    "terms": "Standard terms.",
                    "equity_percent": 10,
                    "fx_rate": None,
                    "fx_rate_date": None,
                    "valuation_cap": 500000,
                    "valuation_cap_currency": "USD",
                    "components": [],
                },
                "source": "https://acme.example/deal",
                "source_name": "Acme — standard deal",
                "verified_on": "2026-11-25",
                "note": None,
            },
            {
                "id": "mystery-programme",
                "name": "Mystery Programme",
                "partner_id": "partner:mystery",
                "programme_id": None,
                "deal_status": "unknown",
                "deal": None,
                "source": None,
                "source_name": None,
                "verified_on": "2026-11-25",
                "note": "No published standard deal has been sourced.",
            },
        ],
    }
    profiles = {
        "Acme": {
            "companies": [
                {"name": "Cohort Co", "relationship": "Spring 2027 accelerator cohort",
                 "source": "https://acme.example/cohort"},
                {"name": "Portfolio Co", "source": "https://acme.example/portfolio"},
            ]
        },
        "Mystery": {
            "companies": [
                {"name": "Mystery Co", "relationship": "Named in 2024 cohort",
                 "source": "https://mystery.example/cohort"},
            ]
        },
    }
    research = {
        "reviewed": "2026-11-25",
        "startups": [
            {"name": "Cohort Co", "funding_rounds": []},
            {"name": "Portfolio Co", "funding_rounds": []},
            {"name": "Mystery Co", "funding_rounds": []},
            {"name": "Batch Co", "funding_rounds": [], "relationships": [
                {"target_id": "partner:acme", "kind": "participated_in",
                 "description": "Spring 2027 accelerator batch",
                 "source": "https://acme.example/batch"},
            ]},
        ],
    }
    reviewed = {"Acme": {}, "Mystery": {}}
    return research, profiles, reviewed, table


class SyntheticConversionTests(unittest.TestCase):
    def test_created_round_mirrors_the_529_shape(self):
        research, profiles, reviewed, table = synthetic_inputs()
        report = convert_mod.convert(research, profiles, reviewed, table)
        self.assertEqual(len(report["created"]), 2)  # Cohort Co + Batch Co
        record = startup(research, "Cohort Co")["funding_rounds"][0]
        self.assertEqual(record["id"], "cohort-co-2027-acme-accelerator")
        self.assertEqual(record["stage"], "Accelerator")
        self.assertEqual(record["amount"], 50000)
        self.assertEqual(record["currency"], "USD")
        self.assertEqual(record["valuation"], 500000)
        self.assertEqual(record["valuation_currency"], "USD")
        self.assertEqual(record["source"], "https://acme.example/deal")
        self.assertEqual(record["lead_investor"], "Acme")
        self.assertEqual(record["stage_normalised"], "Accelerator")
        # No cohort date is carried by the membership record, so no
        # date is invented for the round.
        self.assertNotIn("announced_on", record)
        self.assertIn("Spring 2027 accelerator cohort", record["note"])
        self.assertIn("standard deal", record["note"])

    def test_portfolio_listing_is_not_a_cohort(self):
        research, profiles, reviewed, table = synthetic_inputs()
        convert_mod.convert(research, profiles, reviewed, table)
        self.assertEqual(startup(research, "Portfolio Co")["funding_rounds"], [])

    def test_unknown_deal_is_reported_and_never_estimated(self):
        research, profiles, reviewed, table = synthetic_inputs()
        report = convert_mod.convert(research, profiles, reviewed, table)
        self.assertEqual(
            [(name, entry) for name, entry, _ in report["unknown_deal"]],
            [("Mystery Co", "Mystery Programme")],
        )
        self.assertEqual(startup(research, "Mystery Co")["funding_rounds"], [])

    def test_conversion_is_idempotent(self):
        research, profiles, reviewed, table = synthetic_inputs()
        convert_mod.convert(research, profiles, reviewed, table)
        after_first = copy.deepcopy(research)
        report = convert_mod.convert(research, profiles, reviewed, table)
        self.assertEqual(report["created"], [])
        self.assertEqual(research, after_first)


class ShippedDataTests(unittest.TestCase):
    def test_529_rounds_are_never_duplicated(self):
        research = copy.deepcopy(RESEARCH)
        before = copy.deepcopy(startup(research, "Alloovium")["funding_rounds"])
        report = convert_on(research)
        after = startup(research, "Alloovium")["funding_rounds"]
        self.assertEqual(after, before)
        self.assertEqual(len(after), 2)
        present = {(name, partner) for name, partner, _ in report["already_present"]}
        self.assertIn(("Alloovium", "Startmate"), present)
        self.assertIn(("Alloovium", "Y Combinator"), present)

    def test_startmate_summer_2026_cohort_is_converted(self):
        # Reconstruct the pre-conversion state by stripping the rounds
        # the pipeline created, then check the conversion recreates
        # exactly those records — the shipped file is the conversion's
        # own output, so this also pins its determinism.
        research = copy.deepcopy(RESEARCH)
        stripped = {}
        for s in research["startups"]:
            if s["name"] == "Alloovium":
                continue
            kept = []
            for r in s.get("funding_rounds", []):
                if (r.get("lead_investor") == "Startmate"
                        and r.get("stage") == "Accelerator"):
                    stripped[s["name"]] = r
                else:
                    kept.append(r)
            s["funding_rounds"] = kept
        self.assertEqual(len(stripped), 18)
        report = convert_on(research)
        self.assertEqual(len(report["created"]), 18)
        for startup_name, record in report["created"]:
            self.assertEqual(record, stripped[startup_name], startup_name)
            self.assertEqual(record["stage"], "Accelerator", startup_name)
            self.assertEqual(record["amount"], 120000, startup_name)
            self.assertEqual(record["currency"], "AUD", startup_name)
            self.assertEqual(record["valuation"], 1500000, startup_name)
            self.assertEqual(record["valuation_currency"], "AUD", startup_name)
            self.assertEqual(record["lead_investor"], "Startmate", startup_name)
            self.assertEqual(
                record["source"],
                "https://www.startmate.com/writing/startmate-accelerator-investment-terms-101",
                startup_name,
            )

    def test_boab_cohort_is_reported_as_unknown_deal(self):
        research = copy.deepcopy(RESEARCH)
        report = convert_on(research)
        unknown = {name for name, _, _ in report["unknown_deal"]}
        self.assertEqual(unknown, {"PI.EXCHANGE", "Remi AI", "Strongroom AI"})
        # The conversion itself must never fabricate a Boab round from
        # cohort membership (the deal is unknown). A reviewed,
        # hand-recorded Boab round may still exist in the shipped data
        # where the investment itself is independently sourced — Remi
        # AI's is: the Victorian Government launch release names it in
        # the cohort and IT Brief reported the raise as its first
        # external capital raise.
        created_leads = {(name, record.get("lead_investor"))
                         for name, record in report["created"]}
        for name in unknown:
            self.assertNotIn((name, "Boab AI"), created_leads)

    def test_cautionary_supports_mentions_are_not_converted(self):
        research = copy.deepcopy(RESEARCH)
        report = convert_on(research)
        noted = {name for name, _, _ in report["noted"]}
        self.assertEqual(noted, {"Fluency", "Andromeda Robotics"})
        for name in noted:
            rounds = startup(research, name).get("funding_rounds", [])
            self.assertFalse(
                any(r.get("lead_investor") == "Startmate"
                    and r.get("stage") == "Accelerator" for r in rounds), name)

    def test_committed_research_is_fully_converted(self):
        # The shipped file is the pipeline's own output: running the
        # conversion over it must create nothing. If a future crawl
        # adds a cohort member, this fails until data:generate runs —
        # which is the point.
        research = copy.deepcopy(RESEARCH)
        report = convert_on(research)
        self.assertEqual(report["created"], [])
        self.assertEqual(research, RESEARCH)


if __name__ == "__main__":
    unittest.main()
