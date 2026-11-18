"""Offline graph integration checks for this staged country batch; no writes."""
from collections import Counter
import importlib.util
import json
from pathlib import Path
import sys
import unittest

sys.dont_write_bytecode = True
PACKET = Path(__file__).resolve().parent
ROOT = PACKET.parents[3]
SPEC = importlib.util.spec_from_file_location("atlas_graph", ROOT / "scripts/make-graph.py")
GRAPH = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(GRAPH)


def founder_ids(records, baseline):
    """Require review before names alone create or merge a person identity."""
    entities = {node["id"]: node for node in baseline["entities"]}
    founders = {edge["from"] for edge in baseline["edges"] if edge["kind"] == "founded"}
    # Partner people have scoped IDs, so inspect their names separately.
    teams = {
        "person:" + GRAPH.slug(entities[edge["from"]]["name"])
        for edge in baseline["edges"] if edge["kind"] == "team_member"
    }
    seen = {}
    for record in records:
        for founder in record.get("founders", []):
            slug = GRAPH.slug(founder["name"])
            if not slug:
                raise ValueError(f"Empty founder slug: {founder['name']!r}")
            identity = "person:" + slug
            if identity in founders:
                raise ValueError(f"Existing founder requires identity review: {identity}")
            if identity in teams:
                raise ValueError(f"Partner team name requires identity review: {identity}")
            if identity in seen:
                raise ValueError(f"Repeated founder identity requires review: {identity}; "
                                 f"{seen[identity]!r}, {record['name']!r}")
            seen[identity] = record["name"]
    return set(seen)


def isolated_graph(records, profiles=None):
    return GRAPH.build_graph(profiles or {}, [], {}, {"opportunities": []}, {"startups": records})


class StagedGraphTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.staged = json.loads((PACKET / "startup-records.json").read_text(encoding="utf-8"))["startups"]
        cls.context = [GRAPH.load(name) for name in (
            "partner-profiles.json", "partner-leads.json", "partners-reviewed.json", "catalogue.json")]
        cls.research = GRAPH.load("startup-research.json")
        cls.baseline = GRAPH.build_graph(*cls.context, cls.research)
        cls.combined = GRAPH.build_graph(*cls.context, {
            **cls.research, "startups": cls.research["startups"] + cls.staged})

    def test_new_startup_ids_are_unique_and_not_existing(self):
        slugs = [GRAPH.slug(row["name"]) for row in self.staged]
        self.assertTrue(all(slugs), "A staged startup has an empty graph slug")
        ids = ["startup:" + slug for slug in slugs]
        self.assertEqual(len(ids), len(set(ids)), "Staged startup IDs collide")
        existing = {node["id"] for node in self.baseline["entities"]}
        self.assertFalse(set(ids) & existing, "Staged record duplicates a baseline identity")

    def test_founder_names_do_not_create_unreviewed_identity_merges(self):
        ids = founder_ids(self.staged, self.baseline)
        self.assertEqual(len(ids), sum(len(row.get("founders", [])) for row in self.staged))

    def test_global_funding_round_ids_are_unique(self):
        ids = [event["id"] for row in self.research["startups"] + self.staged
               for event in row.get("funding_rounds", [])]
        self.assertEqual(len(ids), len(set(ids)), "Funding IDs must be globally unique")
        self.assertEqual(sorted(ids), [event["id"] for event in self.combined["funding_rounds"]])
        self.assertEqual(len(self.combined["funding_rounds"]) - len(self.baseline["funding_rounds"]),
                         sum(len(row.get("funding_rounds", [])) for row in self.staged))

    def test_entity_counts_increase_by_only_new_startups_and_founders(self):
        new_founders = founder_ids(self.staged, self.baseline)
        new_startups = {"startup:" + GRAPH.slug(row["name"]) for row in self.staged}
        baseline_ids = {node["id"] for node in self.baseline["entities"]}
        combined_ids = {node["id"] for node in self.combined["entities"]}
        self.assertEqual(combined_ids, baseline_ids | new_startups | new_founders)
        expected = Counter(node["kind"] for node in self.baseline["entities"])
        expected.update({"startup": len(self.staged), "person": len(new_founders)})
        self.assertEqual(Counter(node["kind"] for node in self.combined["entities"]), expected)

    def test_sourced_edge_and_article_counts(self):
        edge_key = lambda edge: (edge["from"], edge["to"], edge["kind"], edge["source"])
        expected_edges = {edge_key(edge) for edge in self.baseline["edges"]}
        expected_articles = {(row["startup_id"], row["url"]) for row in self.baseline["articles"]}
        for row in self.staged:
            startup = "startup:" + GRAPH.slug(row["name"])
            for founder in row.get("founders", []):
                expected_edges.add(("person:" + GRAPH.slug(founder["name"]), startup,
                                    "founded", founder["source"]))
            for relation in row.get("relationships", []):
                expected_edges.add((startup, relation["target_id"], relation["kind"], relation["source"]))
            expected_articles.update((startup, event["source"]) for event in row.get("funding_rounds", []))
            expected_articles.update((startup, article["url"]) for article in row.get("articles", []))
        self.assertEqual({edge_key(edge) for edge in self.combined["edges"]}, expected_edges)
        self.assertEqual(len(self.combined["edges"]), len(expected_edges))
        self.assertEqual({(row["startup_id"], row["url"]) for row in self.combined["articles"]},
                         expected_articles)
        self.assertEqual(len(self.combined["articles"]), len(expected_articles))


class GraphNegativeTests(unittest.TestCase):
    # Synthetic in-memory fixtures, never added to the staged packet.
    SOURCE = "https://example.com/evidence"

    def startup(self, name, founder=None, event=None):
        row = {"name": name, "source": self.SOURCE}
        if founder:
            row["founders"] = [{"name": founder, "source": self.SOURCE}]
        if event:
            row["funding_rounds"] = [{"id": event, "stage": "Stage unreported", "source": self.SOURCE}]
        return row

    def test_native_only_founder_slug_is_rejected_without_transliteration(self):
        rows = [self.startup("Synthetic Alpha", founder="김부기")]
        with self.assertRaisesRegex(ValueError, "Empty founder slug"):
            founder_ids(rows, isolated_graph([]))
        with self.assertRaisesRegex(ValueError, "Empty entity identity"):
            isolated_graph(rows)

    def test_duplicate_round_id_across_companies_is_rejected(self):
        rows = [self.startup(name, event="synthetic-round") for name in ("Synthetic Alpha", "Synthetic Beta")]
        with self.assertRaisesRegex(ValueError, "Funding round identifiers must be unique"):
            isolated_graph(rows)

    def test_founder_slug_collision_is_rejected(self):
        rows = [self.startup("Synthetic Alpha", founder="Test-Founder"),
                self.startup("Synthetic Beta", founder="Test Founder")]
        with self.assertRaisesRegex(ValueError, "Repeated founder identity"):
            founder_ids(rows, isolated_graph([]))
        with self.assertRaisesRegex(ValueError, "Ambiguous entity slug"):
            isolated_graph(rows)

    def test_identical_founder_name_needs_review_across_companies(self):
        baseline = isolated_graph([self.startup("Synthetic Alpha", founder="Test Founder")])
        with self.assertRaisesRegex(ValueError, "Existing founder requires identity review"):
            founder_ids([self.startup("Synthetic Beta", founder="Test Founder")], baseline)

    def test_scoped_partner_person_still_needs_founder_identity_review(self):
        profiles = {"Synthetic Partner": {"people": [{"name": "Test Founder", "source": self.SOURCE}]}}
        baseline = isolated_graph([], profiles)
        with self.assertRaisesRegex(ValueError, "Partner team name requires identity review"):
            founder_ids([self.startup("Synthetic Alpha", founder="Test Founder")], baseline)


if __name__ == "__main__":
    unittest.main()
