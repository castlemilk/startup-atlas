"""Synthetic legacy graph/SQLite checks; no normalized runtime integration.

Run from the repository root:
    python3 -m unittest discover -s contracts/investor_rounds -p 'test_*.py' -v

Only the fixture below is read. Generated graphs and SQLite files are confined
to TemporaryDirectory; production data, crawler and browser paths are unused.
"""

import copy
import importlib.util
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[2]
FIXTURE = Path(__file__).resolve().parent / "fixtures" / "legacy-record.json"


def load_module(name, relative_path):
    spec = importlib.util.spec_from_file_location(name, ROOT / relative_path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


graph_builder = load_module("investor_round_legacy_graph", "scripts/make-graph.py")
sqlite_builder = load_module("investor_round_legacy_sqlite", "scripts/build-graph-db.py")


class LegacyFundingParityTests(unittest.TestCase):
    def setUp(self):
        self.record = json.loads(FIXTURE.read_text(encoding="utf-8"))
        self.profiles = {
            "Fixture Backer": {
                "companies": [
                    {
                        "name": "Fixture Orbit",
                        "relationship": "Listed in a synthetic portfolio",
                        "source": "https://portfolio.example/companies/orbit",
                    }
                ]
            }
        }

    def build_graph(self, records=None):
        return graph_builder.build_graph(
            copy.deepcopy(self.profiles),
            ["Fixture Backer"],
            {},
            {"opportunities": []},
            {"startups": copy.deepcopy(records if records is not None else [self.record])},
        )

    def test_graph_preserves_complete_round_values_and_sources(self):
        graph = self.build_graph()
        expected = sorted(
            [{"startup_id": "startup:fixture-orbit", **event}
             for event in self.record["funding_rounds"]],
            key=lambda event: event["id"],
        )
        self.assertEqual(graph["funding_rounds"], expected)
        self.assertEqual(len(graph["articles"]), len(expected))
        self.assertEqual(
            {article["url"] for article in graph["articles"]},
            {event["source"] for event in expected},
        )

    def test_missing_amount_currency_and_date_are_not_inferred(self):
        graph = self.build_graph()
        event = next(item for item in graph["funding_rounds"]
                     if item["id"] == "fixture-orbit-unresolved-currency")
        for field in ("amount", "currency", "announced_on", "investors", "participations"):
            self.assertNotIn(field, event)
        self.assertEqual(event["amount_text"], "$2.5 million (currency unspecified)")
        self.assertIn("early 2025", event["note"])
        article = next(item for item in graph["articles"] if item["url"] == event["source"])
        self.assertEqual(article["published_on"], "")

    def test_explicit_zero_is_distinct_from_absence(self):
        events = {item["id"]: item for item in self.build_graph()["funding_rounds"]}
        zero = events["fixture-orbit-explicit-zero"]
        absent = events["fixture-orbit-unresolved-currency"]
        self.assertEqual(zero["amount"], 0)
        self.assertEqual(zero["currency"], "USD")
        self.assertIn("amount", zero)
        self.assertNotIn("amount", absent)

    def test_portfolio_membership_does_not_create_participation_edges(self):
        graph = self.build_graph()
        self.assertEqual(
            {(entity["id"], entity["kind"]) for entity in graph["entities"]},
            {("partner:fixture-backer", "partner"), ("startup:fixture-orbit", "startup")},
        )
        self.assertEqual(graph["edges"], [{
            "from": "partner:fixture-backer",
            "to": "startup:fixture-orbit",
            "kind": "supports",
            "description": "Listed in a synthetic portfolio",
            "source": "https://portfolio.example/companies/orbit",
            # Graph format v2 (docs/KG-CONNECTIVE-TISSUE.md §2): every edge
            # carries freshness + confidence. This fixture edge has no
            # reviewed_at, so the dates are null and the edge is stale —
            # never invented.
            "first_seen": None,
            "last_verified": None,
            "confidence": 0.5,
            "confidence_basis": {
                "sources": 1,
                "source_types": ["secondary"],
                "agreement": False,
                "inferred": False,
            },
            "stale": True,
        }])
        self.assertNotIn("investors", graph)
        self.assertNotIn("participations", graph)

    def test_duplicate_event_id_within_startup_is_rejected(self):
        self.record["funding_rounds"].append(copy.deepcopy(self.record["funding_rounds"][0]))
        with self.assertRaisesRegex(ValueError, "Funding round identifiers must be unique"):
            self.build_graph()

    def test_duplicate_event_id_across_startups_is_rejected(self):
        second = copy.deepcopy(self.record)
        second["name"] = "Fixture Comet"
        with self.assertRaisesRegex(ValueError, "Funding round identifiers must be unique"):
            self.build_graph([self.record, second])

    def test_sqlite_round_trip_preserves_json_absence_zero_and_sources(self):
        graph = self.build_graph()
        original = copy.deepcopy(graph)
        with tempfile.TemporaryDirectory(prefix="atlas-investor-round-parity-") as temporary:
            directory = Path(temporary)
            source, target = directory / "graph.json", directory / "atlas.sqlite"
            source.write_text(json.dumps(graph, ensure_ascii=False), encoding="utf-8")
            # No data_dir: never read or export the repository's public catalogue.
            sqlite_builder.build(source, target)
            with sqlite3.connect(target) as database:
                rows = database.execute(
                    "SELECT startup_id, announced_on, data FROM funding_rounds"
                ).fetchall()
                events = {json.loads(row[2])["id"]: json.loads(row[2]) for row in rows}
                self.assertEqual(events, {event["id"]: event for event in graph["funding_rounds"]})
                self.assertTrue(all(row[0] == "startup:fixture-orbit" for row in rows))
                unresolved = next(row for row in rows
                                  if json.loads(row[2])["id"] == "fixture-orbit-unresolved-currency")
                self.assertIsNone(unresolved[1])
                self.assertNotIn("announced_on", json.loads(unresolved[2]))
                self.assertNotIn("amount", events["fixture-orbit-unresolved-currency"])
                self.assertEqual(events["fixture-orbit-explicit-zero"]["amount"], 0)
                self.assertEqual(
                    [json.loads(row[0]) for row in database.execute("SELECT data FROM edges")],
                    graph["edges"],
                )
                self.assertEqual(database.execute("SELECT count(*) FROM source_documents").fetchone()[0], 0)
                self.assertEqual(database.execute("PRAGMA integrity_check").fetchone()[0], "ok")
        self.assertEqual(graph, original)


if __name__ == "__main__":
    unittest.main()
