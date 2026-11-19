#!/usr/bin/env python3
"""Offline resumability checks for this 22-company Brazil staging packet.

Run from the repository root:
    PYTHONDONTWRITEBYTECODE=1 python research/countries/br/2026-11-18-batch-001/test_planner.py -v

The existing planner inventories supplied records; exhausting this fixture does
not mean Brazil coverage or collection is complete. All mutations use temporary
copies. The production seed CSV supplies its header only, never approved rows.
"""
from __future__ import annotations

import csv
import hashlib
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch


BATCH = Path(__file__).resolve().parent
ROOT = BATCH.parents[3]
STAGED = BATCH / "startup-records.staged.json"
PRODUCTION_SEEDS = ROOT / "data/company-profile-seeds.csv"
REVISION = json.loads((BATCH / "manifest.json").read_text(encoding="utf-8"))["base_revision"]
EXPECTED_COUNT = 22
PAGE_SIZE = 7

sys.path.insert(0, str(ROOT / "scripts"))
import plan_company_profiles as planner
import crawl


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


class BrazilStagingPlannerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if not STAGED.is_file():
            raise AssertionError(
                f"Missing actual staged input: {STAGED}. Create the country "
                "packet before running this regression; no synthetic fallback."
            )
        cls.original_overlay_bytes = STAGED.read_bytes()
        payload = json.loads(cls.original_overlay_bytes)
        if payload.get("reviewed") != "2026-11-18":
            raise AssertionError("This regression is scoped to the 2026-11-18 packet")
        rows = payload.get("startups")
        if not isinstance(rows, list) or len(rows) != EXPECTED_COUNT:
            raise AssertionError(f"Expected this packet's {EXPECTED_COUNT} actual records")
        names = [row["name"] for row in rows]
        if len(set(names)) != EXPECTED_COUNT:
            raise AssertionError("The actual staged packet has duplicate exact names")
        # Membership comes from the real packet, not a generated test catalogue.
        # Keep exact spelling, case and accents; graph IDs are a separate concern.
        cls.exact_source_names = tuple(sorted(names))
        cls.original_seed_header = PRODUCTION_SEEDS.read_bytes().splitlines(keepends=True)[0]
        headers = next(csv.reader(io.StringIO(cls.original_seed_header.decode("utf-8-sig"))))
        if not {"partner", "official_website", "approved"}.issubset(headers):
            raise AssertionError("Production CSV no longer exposes the planner's required header")

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="br-planner-test-")
        self.addCleanup(self.temp.cleanup)
        self.overlay = Path(self.temp.name) / "startup-records.staged.json"
        self.seeds = Path(self.temp.name) / "unapproved-seeds.csv"
        self.overlay.write_bytes(self.original_overlay_bytes)
        self.seeds.write_bytes(self.original_seed_header)
        self.protected_inputs = {
            path: sha256(path)
            for path in (PRODUCTION_SEEDS, ROOT / "data/startup-research.json")
        }
        # Fail immediately if a future planner change attempts collection or DNS.
        self.network_mocks = []
        for target, attribute in (
            (crawl.Transport, "request"),
            (crawl.socket, "getaddrinfo"),
            (crawl.socket, "create_connection"),
            (crawl.socket.socket, "connect"),
        ):
            blocker = patch.object(
                target, attribute, side_effect=AssertionError("Planner regression must remain offline")
            )
            self.network_mocks.append(blocker.start())
            self.addCleanup(blocker.stop)

    def tearDown(self):
        for path, before in self.protected_inputs.items():
            self.assertEqual(sha256(path), before, f"Production input mutated: {path}")
        for mocked in self.network_mocks:
            mocked.assert_not_called()

    def plan(self, *, cursor=None, revision=REVISION, limit=PAGE_SIZE):
        return planner.build_plan(self.overlay, self.seeds, revision, limit, cursor)

    def assert_unapproved(self, result):
        states = result["population"]["seed_states"]
        # The existing API's approval count is this seed-state total.
        approved_count = states["approved_seed_ready"]
        self.assertEqual(approved_count, 0)
        self.assertEqual(states["seed_review_required"], EXPECTED_COUNT)
        self.assertEqual(sum(states.values()), EXPECTED_COUNT)
        for item in result["items"]:
            self.assertEqual(item["seed_state"], "seed_review_required")
            self.assertIsNone(item["approved_url"])
            self.assertEqual(item["collection_state"], "not_assessed")

    def test_all_22_exact_names_paginate_once_in_7_7_7_1_pages(self):
        cursor = None
        seen = []
        plan_ids = set()
        for offset, size in ((0, 7), (7, 7), (14, 7), (21, 1)):
            result = self.plan(cursor=cursor)
            names = [item["source_record_name"] for item in result["items"]]
            self.assertEqual(result["offset"], offset)
            self.assertEqual(result["returned"], size)
            self.assertEqual(tuple(names), self.exact_source_names[offset : offset + size])
            self.assertTrue(set(seen).isdisjoint(names), "A resumed page repeats a company")
            self.assertEqual(result["population"]["source_records"], EXPECTED_COUNT)
            self.assert_unapproved(result)
            seen.extend(names)
            plan_ids.add(result["plan_id"])
            cursor = result["next_cursor"]
            self.assertEqual(result["inventory_exhausted"], offset == 21)
            self.assertEqual(cursor is None, offset == 21)
        self.assertEqual(tuple(seen), self.exact_source_names)
        self.assertEqual(len(seen), len(set(seen)))
        self.assertEqual(len(plan_ids), 1)

    def test_persisted_cursor_resumes_and_replays_the_same_page(self):
        first = self.plan()
        second = self.plan(cursor=first["next_cursor"])
        checkpoint = Path(self.temp.name) / "checkpoint.json"
        checkpoint.write_text(json.dumps({"cursor": first["next_cursor"]}), encoding="utf-8")
        resumed_cursor = json.loads(checkpoint.read_text(encoding="utf-8"))["cursor"]
        self.assertEqual(self.plan(cursor=resumed_cursor), second)
        self.assertEqual(self.plan(), first)
        self.assertEqual(second["offset"], PAGE_SIZE)
        self.assertFalse(second["inventory_exhausted"])

    def test_overlay_byte_change_rejects_stale_cursor(self):
        first = self.plan()
        # Whitespace preserves every record but changes the pinned input bytes.
        self.overlay.write_bytes(self.original_overlay_bytes + b"\n")
        with self.assertRaisesRegex(ValueError, "Cursor does not match"):
            self.plan(cursor=first["next_cursor"])
        fresh = self.plan()
        self.assertNotEqual(fresh["plan_id"], first["plan_id"])
        self.assertEqual(fresh["items"], first["items"])

    def test_seed_byte_change_rejects_stale_cursor_without_approving_anything(self):
        first = self.plan()
        # Another blank line leaves the CSV header-only and semantically empty.
        self.seeds.write_bytes(self.original_seed_header + b"\n")
        with self.assertRaisesRegex(ValueError, "Cursor does not match"):
            self.plan(cursor=first["next_cursor"])
        fresh = self.plan()
        self.assertNotEqual(fresh["plan_id"], first["plan_id"])
        self.assert_unapproved(fresh)

    def test_revision_and_page_size_changes_reject_stale_cursor(self):
        cursor = self.plan()["next_cursor"]
        for changed in ({"revision": "b" * 40}, {"limit": PAGE_SIZE + 1}):
            with self.subTest(changed=changed), self.assertRaisesRegex(ValueError, "Cursor does not match"):
                self.plan(cursor=cursor, **changed)

    def test_exhaustion_is_only_this_input_inventory_and_never_seed_approval(self):
        self.assertEqual(self.seeds.read_bytes(), self.original_seed_header)
        self.assertEqual(
            planner.approved_from_bytes(self.seeds.read_bytes(), set(self.exact_source_names)), {}
        )
        result = self.plan(limit=100)
        self.assertEqual(result["snapshot_kind"], "input_files")
        self.assertEqual(result["population"]["source_records"], EXPECTED_COUNT)
        self.assertEqual(
            result["population"]["scope"], "all records in the supplied startup-research overlay"
        )
        self.assertTrue(result["inventory_exhausted"])
        self.assertIsNone(result["next_cursor"])
        self.assertIn("not crawl completion", result["warning"])
        self.assertIn("Field presence is not factual verification", result["warning"])
        self.assert_unapproved(result)


if __name__ == "__main__":
    unittest.main()
