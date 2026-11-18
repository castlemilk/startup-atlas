#!/usr/bin/env python3
"""Round-trip this staged Brazil packet through the existing graph and SQLite.

Run from the repository root:
    PYTHONDONTWRITEBYTECODE=1 python research/countries/br/2026-11-18-batch-001/test_graph_projection.py -v

The five production inputs are verified against the manifest's local commit.
Only a TemporaryDirectory receives generated graph and database files. Neither
builder's CLI entry point runs, and investor sidecars never become graph inputs.
"""
from __future__ import annotations

from contextlib import redirect_stdout
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import re
import socket
import sqlite3
import subprocess
import tempfile
import unittest
from unittest.mock import patch


BATCH = Path(__file__).resolve().parent
ROOT = BATCH.parents[3]
PRODUCTION_INPUTS = (
    "data/partner-profiles.json",
    "data/partner-leads.json",
    "data/partners-reviewed.json",
    "data/catalogue.json",
    "data/startup-research.json",
)


def load_module(name, relative_path):
    spec = importlib.util.spec_from_file_location(name, ROOT / relative_path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


graph_builder = load_module("atlas_brazil_packet_graph", "scripts/make-graph.py")
database_builder = load_module("atlas_brazil_packet_database", "scripts/build-graph-db.py")


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def canonical_json(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


class BrazilGraphProjectionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.manifest = json.loads((BATCH / "manifest.json").read_text(encoding="utf-8"))
        cls.revision = cls.manifest["base_revision"]
        if not re.fullmatch(r"[0-9a-f]{40}", cls.revision):
            raise AssertionError("Graph regression requires a pinned local commit")
        cls.packet = json.loads((BATCH / "startup-records.staged.json").read_text(encoding="utf-8"))
        cls.records = cls.packet["startups"]
        cls.dossiers = json.loads((BATCH / "dossiers.json").read_text(encoding="utf-8"))["companies"]
        cls.participants = json.loads((BATCH / "event-participants.json").read_text(encoding="utf-8"))["participants"]
        cls.registry = {
            source["url"]: source
            for source in json.loads((BATCH / "source-registry.json").read_text(encoding="utf-8"))["sources"]
        }
        if len(cls.records) != 22 or len(cls.dossiers) != 22:
            raise AssertionError("Expected the actual 22-company Brazil packet")
        if len(cls.participants) != 98:
            raise AssertionError("Expected the actual 98 research-only participant assertions")
        cls.by_name = {record["name"]: record for record in cls.records}
        cls.by_dossier_name = {company["name"]: company for company in cls.dossiers}
        if len(cls.by_name) != 22 or set(cls.by_name) != set(cls.by_dossier_name):
            raise AssertionError("Staged and dossier exact names differ")

        protected = [ROOT / path for path in PRODUCTION_INPUTS]
        protected += [
            ROOT / "data/company-profile-seeds.csv",
            ROOT / "data/graph.json",
            ROOT / "backend/internal/graph/snapshot.json",
            ROOT / "scripts/make-graph.py",
            ROOT / "scripts/build-graph-db.py",
        ]
        cls.protected_hashes = {path: digest(path) for path in protected if path.exists()}
        cls.network_mocks = []
        for target, attribute in (
            (socket, "getaddrinfo"),
            (socket, "create_connection"),
            (socket.socket, "connect"),
        ):
            blocker = patch.object(
                target, attribute, side_effect=AssertionError("Graph regression must remain offline")
            )
            cls.network_mocks.append(blocker.start())
            cls.addClassCleanup(blocker.stop)

        # git show only reads local objects. A missing object must fail rather
        # than triggering a partial-clone lazy fetch.
        local_git_env = dict(os.environ, GIT_NO_LAZY_FETCH="1")
        committed = {}
        for relative_path in PRODUCTION_INPUTS:
            result = subprocess.run(
                ["git", "show", f"{cls.revision}:{relative_path}"],
                cwd=ROOT, env=local_git_env, check=True, capture_output=True,
            )
            if (ROOT / relative_path).read_bytes() != result.stdout:
                raise AssertionError(f"Production input differs from pinned commit: {relative_path}")
            committed[Path(relative_path).name] = json.loads(result.stdout)
        cls.production = committed
        common = (
            committed["partner-profiles.json"],
            committed["partner-leads.json"],
            committed["partners-reviewed.json"],
            committed["catalogue.json"],
        )
        baseline_research = committed["startup-research.json"]
        cls.baseline_graph = graph_builder.build_graph(*common, baseline_research)
        merged = {**baseline_research, "startups": [*baseline_research["startups"], *cls.records]}
        cls.graph = graph_builder.build_graph(*common, merged)
        cls.graph["source_revision"] = cls.revision
        cls.entities = {entity["id"]: entity for entity in cls.graph["entities"]}
        cls.country_ids = {company["candidate_canonical_id"] for company in cls.dossiers}

        cls.temp = tempfile.TemporaryDirectory(prefix="br-graph-projection-")
        cls.addClassCleanup(cls.temp.cleanup)
        cls.graph_path = Path(cls.temp.name) / "graph.json"
        cls.database_path = Path(cls.temp.name) / "atlas.sqlite"
        cls.graph_path.write_text(json.dumps(cls.graph, ensure_ascii=False), encoding="utf-8")
        # Graph-only SQLite compilation deliberately omits public-document
        # ingestion and its optional Node mapping exporter.
        with patch.object(database_builder, "read_mappings", side_effect=AssertionError("No mapping exporter")), \
                redirect_stdout(io.StringIO()) as output:
            database_builder.build(cls.graph_path, cls.database_path, mappings={})
        cls.build_output = output.getvalue()
        cls.db = sqlite3.connect(cls.database_path)
        cls.addClassCleanup(cls.db.close)

    @classmethod
    def tearDownClass(cls):
        for path, before in cls.protected_hashes.items():
            if digest(path) != before:
                raise AssertionError(f"Production input or shared builder changed: {path}")
        for mocked in cls.network_mocks:
            mocked.assert_not_called()

    def test_exact_names_and_provisional_to_candidate_ids_round_trip(self):
        self.assertEqual(len(self.country_ids), 22)
        for company in self.dossiers:
            name = company["name"]
            suffix = graph_builder.slug(name)
            self.assertEqual(company["entity_id"], "unresolved:br:" + suffix)
            self.assertEqual(company["candidate_canonical_id"], "startup:" + suffix)
            identity = company["candidate_canonical_id"]
            entity = self.entities[identity]
            self.assertEqual((entity["kind"], entity["name"]), ("startup", name))
            rows = self.db.execute("SELECT id,name,data FROM entities WHERE id=?", (identity,)).fetchall()
            self.assertEqual(len(rows), 1)
            self.assertEqual(rows[0][:2], (identity, name))
            self.assertEqual(json.loads(rows[0][2]), entity)
        self.assertFalse(any(identity.startswith("unresolved:") for identity in self.entities))

    def test_unknown_founded_year_never_becomes_zero(self):
        omitted = []
        for name, record in self.by_name.items():
            identity = self.by_dossier_name[name]["candidate_canonical_id"]
            graph_entity = self.entities[identity]
            database_entity = json.loads(self.db.execute("SELECT data FROM entities WHERE id=?", (identity,)).fetchone()[0])
            if "founded_year" in record:
                self.assertEqual(graph_entity["founded_year"], record["founded_year"])
                self.assertEqual(database_entity["founded_year"], record["founded_year"])
            else:
                omitted.append(name)
                self.assertNotIn("founded_year", graph_entity, name)
                self.assertNotIn("founded_year", database_entity, name)
        self.assertTrue(omitted, "This packet must exercise missing founded-year behavior")
        self.assertIn("Dock", omitted)
        self.assertIn("Asaas", omitted)

    def test_all_25_funding_events_preserve_values_precision_and_notes(self):
        expected = {
            event["id"]: {"startup_id": self.by_dossier_name[record["name"]]["candidate_canonical_id"], **event}
            for record in self.records for event in record.get("funding_rounds", [])
        }
        self.assertEqual(len(expected), 25)
        actual = {event["id"]: event for event in self.graph["funding_rounds"] if event["startup_id"] in self.country_ids}
        self.assertEqual(actual, expected)
        database_rounds = {}
        for startup_id, announced_on, payload in self.db.execute("SELECT startup_id,announced_on,data FROM funding_rounds"):
            if startup_id not in self.country_ids:
                continue
            event = json.loads(payload)
            self.assertEqual(announced_on, event.get("announced_on"))
            database_rounds[event["id"]] = event
        self.assertEqual(database_rounds, expected)
        self.assertNotIn("announced_on", actual["qi-tech-series-b-extension-2025"])
        self.assertIn("2025-07 (month; announcement)", actual["qi-tech-series-b-extension-2025"]["note"])

    def test_explicit_articles_preserve_source_publication_not_event_date(self):
        graph_articles = {(article["startup_id"], article["url"]): article for article in self.graph["articles"]}
        database_articles = {}
        for startup_id, published_on, payload in self.db.execute("SELECT startup_id,published_on,data FROM articles"):
            article = json.loads(payload)
            self.assertEqual(published_on, article.get("published_on"))
            database_articles[(startup_id, article["url"])] = article
        for record in self.records:
            identity = self.by_dossier_name[record["name"]]["candidate_canonical_id"]
            explicit = {article["url"]: article for article in record.get("articles", [])}
            funding_sources = {event["source"] for event in record.get("funding_rounds", [])}
            self.assertTrue(funding_sources.issubset(explicit), f"Missing explicit funding article: {record['name']}")
            for url, article in explicit.items():
                source_date = self.registry[url].get("published_on")
                expected_date = source_date if isinstance(source_date, str) and re.fullmatch(r"\d{4}-\d{2}-\d{2}", source_date) else ""
                self.assertEqual(article.get("published_on", ""), expected_date)
                if not expected_date:
                    self.assertNotIn("published_on", article, "Unknown source date must be omitted from staged article")
                key = (identity, url)
                self.assertEqual(graph_articles[key]["published_on"], expected_date)
                self.assertEqual(database_articles[key], graph_articles[key])
        recarga = self.by_name["RecargaPay"]["funding_rounds"][0]
        self.assertEqual(recarga["announced_on"], "2021-02-24")
        recarga_key = (self.by_dossier_name["RecargaPay"]["candidate_canonical_id"], recarga["source"])
        self.assertEqual(graph_articles[recarga_key]["published_on"], "2021-03-26")
        self.assertEqual(database_articles[recarga_key]["published_on"], "2021-03-26")

    def test_98_participant_assertions_remain_sidecar_only(self):
        self.assertEqual(len(self.participants), 98)
        baseline_edges = {canonical_json(edge) for edge in self.baseline_graph["edges"]}
        added_edges = {canonical_json(edge) for edge in self.graph["edges"]} - baseline_edges
        expected_founder_edges = {
            canonical_json({"from": "person:" + graph_builder.slug(founder["name"]),
                            "to": self.by_dossier_name[record["name"]]["candidate_canonical_id"],
                            "kind": "founded", "description": "Founder", "source": founder["source"]})
            for record in self.records for founder in record.get("founders", [])
        }
        self.assertEqual(added_edges, expected_founder_edges - baseline_edges)
        database_edges = {canonical_json(json.loads(row[0])) for row in self.db.execute("SELECT data FROM edges")}
        self.assertEqual(database_edges, {canonical_json(edge) for edge in self.graph["edges"]})
        expected_new_ids = self.country_ids | {
            "person:" + graph_builder.slug(founder["name"])
            for record in self.records for founder in record.get("founders", [])
        }
        baseline_ids = {entity["id"] for entity in self.baseline_graph["entities"]}
        self.assertTrue((set(self.entities) - baseline_ids).issubset(expected_new_ids))
        self.assertTrue(all("participants" not in event for event in self.graph["funding_rounds"]))

    def test_builds_are_offline_and_production_inputs_are_unchanged(self):
        self.assertTrue(self.graph_path.is_relative_to(Path(self.temp.name)))
        self.assertTrue(self.database_path.is_relative_to(Path(self.temp.name)))
        for path, before in self.protected_hashes.items():
            self.assertEqual(digest(path), before, str(path))
        for mocked in self.network_mocks:
            mocked.assert_not_called()
        self.assertEqual(self.db.execute("SELECT value FROM metadata WHERE key='source_revision'").fetchone()[0], self.revision)
        self.assertEqual(self.db.execute("SELECT count(*) FROM source_documents").fetchone()[0], 0)


if __name__ == "__main__":
    unittest.main()
