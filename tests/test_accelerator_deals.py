"""Tests for the accelerator standard-deal table (issue #533).

The shipped table (data/accelerator-deals.json) is validated as-is:
shape, sourcing, currency conversion against data/fx-rates.json, and
references into data/graph.json. Synthetic mutations pin the RULES, so
a future terms update that is properly sourced does not silently
change what is asserted — except the coverage test, which pins the
point of the table: every accelerator with cohort participation in
the graph must have an entry (published or explicitly unknown), so a
new cohort can never again sit at zero rounds unnoticed (#534 builds
the conversion on top of this).
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


deals_mod = load("atlas_accelerator_deals", "scripts/accelerator_deals.py")

TABLE = deals_mod.load_table()
FX = deals_mod.load_fx_table()
GRAPH = json.loads((ROOT / "data" / "graph.json").read_text(encoding="utf-8"))
ENTITY_IDS = {entity["id"] for entity in GRAPH["entities"]}


def errors_for(table):
    return deals_mod.validate_table(table, fx=FX, entity_ids=ENTITY_IDS)


def entry(table, entry_id):
    return next(e for e in table["deals"] if e["id"] == entry_id)


class ShippedTableTests(unittest.TestCase):
    def test_shipped_table_is_valid(self):
        self.assertEqual(errors_for(TABLE), [])

    def test_known_programmes_are_published_with_sources(self):
        # The two cases the self-critique named: both must be present,
        # published and sourced — not placeholders.
        for entry_id in ("y-combinator", "startmate"):
            e = entry(TABLE, entry_id)
            self.assertEqual(e["deal_status"], "published", entry_id)
            self.assertIsNotNone(e["deal"], entry_id)
            self.assertTrue(e["source"].startswith("https://"), entry_id)

    def test_unknown_entries_are_explicit(self):
        unknowns = [e for e in TABLE["deals"] if e["deal_status"] == "unknown"]
        self.assertTrue(unknowns, "expected at least one explicitly-unknown programme")
        for e in unknowns:
            self.assertIsNone(e["deal"], e["id"])
            self.assertTrue(e["note"].strip(), e["id"])

    def test_every_cohort_accelerator_in_graph_has_an_entry(self):
        # Accelerators the graph already records cohort participation
        # for (edge text naming a cohort/batch) must be in the table.
        cohort_partners = set()
        for edge in GRAPH["edges"]:
            text = (edge.get("description") or "").lower()
            if "cohort" in text or "batch" in text:
                for endpoint in (edge.get("from"), edge.get("to")):
                    if endpoint and endpoint.startswith("partner:"):
                        cohort_partners.add(endpoint)
        self.assertIn("partner:startmate", cohort_partners)  # fixture sanity
        self.assertIn("partner:y-combinator", cohort_partners)
        for partner_id in sorted(cohort_partners):
            self.assertIsNotNone(
                deals_mod.deal_for_entity(TABLE, partner_id),
                f"{partner_id} has cohort edges but no accelerator-deals entry",
            )


class ValidationRuleTests(unittest.TestCase):
    def mutate(self, fn):
        table = copy.deepcopy(TABLE)
        fn(table)
        return errors_for(table)

    def test_unknown_entry_with_a_deal_is_rejected(self):
        def fn(table):
            e = entry(table, "boab-ai")
            e["deal"] = {"amount": 1, "currency": "AUD"}
        errors = self.mutate(fn)
        self.assertTrue(any("unknown entries must record deal as null" in e for e in errors))

    def test_published_entry_without_source_is_rejected(self):
        def fn(table):
            entry(table, "y-combinator")["source"] = None
        errors = self.mutate(fn)
        self.assertTrue(any("https source" in e for e in errors))

    def test_hand_invented_fx_rate_is_rejected(self):
        def fn(table):
            entry(table, "startmate")["deal"]["fx_rate"] = 0.5
        errors = self.mutate(fn)
        self.assertTrue(any("fx_rate" in e for e in errors))

    def test_stale_fx_rate_date_is_rejected(self):
        def fn(table):
            entry(table, "startmate")["deal"]["fx_rate_date"] = "2020-01-01"
        errors = self.mutate(fn)
        self.assertTrue(any("fx_rate_date" in e for e in errors))

    def test_wrong_usd_conversion_is_rejected(self):
        def fn(table):
            entry(table, "startmate")["deal"]["amount_usd"] = 120000
        errors = self.mutate(fn)
        self.assertTrue(any("amount_usd" in e for e in errors))

    def test_components_must_sum_to_the_deal_amount(self):
        def fn(table):
            entry(table, "y-combinator")["deal"]["components"][0]["amount"] = 100000
        errors = self.mutate(fn)
        self.assertTrue(any("components" in e for e in errors))

    def test_dangling_entity_reference_is_rejected(self):
        def fn(table):
            entry(table, "startmate")["partner_id"] = "partner:no-such-partner"
        errors = self.mutate(fn)
        self.assertTrue(any("not an entity in the graph" in e for e in errors))

    def test_duplicate_ids_are_rejected(self):
        def fn(table):
            table["deals"].append(copy.deepcopy(table["deals"][0]))
        errors = self.mutate(fn)
        self.assertTrue(any("duplicate id" in e for e in errors))

    def test_deal_for_entity_lookup(self):
        self.assertEqual(
            deals_mod.deal_for_entity(TABLE, "partner:y-combinator")["id"],
            "y-combinator",
        )
        self.assertEqual(
            deals_mod.deal_for_entity(TABLE, "programme:startmate")["id"],
            "startmate",
        )
        self.assertIsNone(deals_mod.deal_for_entity(TABLE, "partner:airtree"))


if __name__ == "__main__":
    unittest.main()
