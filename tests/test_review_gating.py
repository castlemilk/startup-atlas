"""Tests for review-queue confidence gating + the headshot producer.

Gating thresholds live in data/review-gating.json; these tests use
their own config dicts (mirroring the shipped defaults) so a threshold
tune does not silently change what is asserted about the RULES —
except test_shipped_config_shape, which pins the shipped file's
safety-critical properties (kill switch present, headshot/edge never
auto, merge requires an identity key).
"""

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, ROOT / path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


gating = load("atlas_review_gating", "scripts/review_gating.py")
queue_mod = load("atlas_review_queue_gating", "scripts/build-review-queue.py")

CONFIG = {
    "version": 1,
    "enabled": True,
    "decided_by": "auto-gate",
    "kinds": {
        "merge": {"auto_approve_at": 0.88, "require_identity_key": True},
        "fact": {"auto_approve_at": 0.55, "require_complete_draft": True},
        "startup-lead": {"auto_approve_at": 0.65},
        "edge": {"auto_approve_at": None},
        "headshot": {"auto_approve_at": None},
    },
}


def entry(kind, confidence, **extra):
    base = {
        "id": f"{kind}:x", "kind": kind, "subject": "partner:x",
        "subject_key": "x", "candidates": [], "evidence": [],
        "confidence": confidence, "created_at": "2026-11-24T00:00:00Z",
        "run": "47", "status": "pending", "decided_by": None,
        "decided_at": None, "decision_note": None,
        "evidence_fingerprint": "x",
    }
    base.update(extra)
    return base


def queue_of(*entries):
    return {"version": 1, "entries": list(entries)}


class GatingRuleTests(unittest.TestCase):
    def test_merge_name_similarity_never_auto_approves(self):
        e = entry("merge", 0.89, candidates=[
            {"id": "partner:y", "score": 0.89, "basis": "name-similarity"}])
        decided = gating.apply_gating(queue_of(e), CONFIG)
        self.assertEqual(decided, [])
        self.assertEqual(e["status"], "pending")

    def test_merge_with_identity_key_basis_auto_approves(self):
        e = entry("merge", 0.89, candidates=[
            {"id": "partner:y", "score": 0.89, "basis": "website-host + name"}])
        decided = gating.apply_gating(queue_of(e), CONFIG)
        self.assertEqual(decided, [e])
        self.assertEqual(e["status"], "approved")
        self.assertEqual(e["decided_by"], "auto-gate")
        self.assertIn("identity key", e["decision_note"])

    def test_merge_below_threshold_stays_pending(self):
        e = entry("merge", 0.80, candidates=[
            {"id": "partner:y", "score": 0.80, "basis": "linkedin-url + name"}])
        self.assertEqual(gating.apply_gating(queue_of(e), CONFIG), [])

    def test_fact_complete_draft_auto_approves(self):
        e = entry("fact", 0.55, draft_round={
            "startup": "Airwallex", "amount": 320000000, "currency": None,
            "stage": "Series H", "date": "2026-06-25",
            "source_url": "https://example.com/news"})
        decided = gating.apply_gating(queue_of(e), CONFIG)
        self.assertEqual(decided, [e])

    def test_fact_incomplete_draft_stays_pending(self):
        e = entry("fact", 0.55, draft_round={
            "startup": "Airwallex", "amount": 320000000, "currency": None,
            "stage": "Series H", "date": None,
            "source_url": "https://example.com/news"})
        self.assertEqual(gating.apply_gating(queue_of(e), CONFIG), [])

    def test_fact_without_stage_stays_pending(self):
        e = entry("fact", 0.40, draft_round={
            "startup": "X", "amount": 100, "currency": None, "stage": None,
            "date": "2026-01-01", "source_url": "https://example.com/n"})
        self.assertEqual(gating.apply_gating(queue_of(e), CONFIG), [])

    def test_startup_lead_threshold(self):
        strong = entry("startup-lead", 0.65)
        weak = entry("startup-lead", 0.55)
        decided = gating.apply_gating(queue_of(strong, weak), CONFIG)
        self.assertEqual(decided, [strong])
        self.assertEqual(weak["status"], "pending")

    def test_headshot_and_edge_never_auto_approve(self):
        h = entry("headshot", 0.99)
        ed = entry("edge", 0.99)
        self.assertEqual(gating.apply_gating(queue_of(h, ed), CONFIG), [])

    def test_kill_switch_decides_nothing(self):
        config = dict(CONFIG, enabled=False)
        e = entry("startup-lead", 0.70)
        self.assertEqual(gating.apply_gating(queue_of(e), config), [])
        self.assertEqual(e["status"], "pending")

    def test_decided_entries_are_never_touched(self):
        e = entry("startup-lead", 0.70, status="rejected",
                  decided_by="ben@example.com")
        self.assertEqual(gating.apply_gating(queue_of(e), CONFIG), [])
        self.assertEqual(e["status"], "rejected")

    def test_deferred_entries_are_never_auto_approved(self):
        e = entry("startup-lead", 0.99, status="deferred",
                  decided_by="ben@example.com")
        self.assertEqual(gating.apply_gating(queue_of(e), CONFIG), [])
        self.assertEqual(e["status"], "deferred")


class ShippedConfigTests(unittest.TestCase):
    def test_shipped_config_shape(self):
        config = json.loads(
            (ROOT / "data" / "review-gating.json").read_text())
        self.assertIn("enabled", config)
        kinds = config["kinds"]
        self.assertIsNone(kinds["headshot"]["auto_approve_at"])
        self.assertIsNone(kinds["edge"]["auto_approve_at"])
        self.assertTrue(kinds["merge"]["require_identity_key"])
        self.assertGreaterEqual(kinds["merge"]["auto_approve_at"], 0.85)


class HeadshotProducerTests(unittest.TestCase):
    def test_profiles_rows_become_headshot_entries(self):
        with tempfile.TemporaryDirectory() as tmp:
            artifact = Path(tmp)
            (artifact / "latest-profiles.json").write_text(json.dumps({
                "candidates": [
                    {"kind": "professional-bio", "name": "Victor Peng",
                     "company": "PsiQuantum",
                     "source_url": "https://example.com/about",
                     "headshot_candidate": {
                         "candidate_url": "https://cdn.example.com/vp.jpg",
                         "source_url": "https://example.com/about",
                         "status": "not_fetched", "review_required": True,
                         "reason": "Rights and image review required"}},
                    {"kind": "professional-bio", "name": "External Person",
                     "company": "OtherCo",
                     "source_url": "https://example.org/team",
                     "headshot_candidate": {
                         "candidate_url": "https://elsewhere.example.net/p.jpg",
                         "source_url": "https://example.org/team",
                         "status": "not_fetched", "review_required": True,
                         "reason": "External asset host requires separate review"}},
                    {"kind": "companies", "name": "Not A Person",
                     "candidate_url": "https://example.com/x"},
                    {"kind": "professional-bio", "name": "No Photo",
                     "company": "PsiQuantum"},
                ]}))
            entries = queue_mod.produce_headshots(artifact, "47")
        self.assertEqual(len(entries), 2)
        by_name = {e["headshot"]["person_name"]: e for e in entries}
        self.assertEqual(by_name["Victor Peng"]["kind"], "headshot")
        self.assertEqual(by_name["Victor Peng"]["confidence"], 0.80)
        self.assertEqual(by_name["External Person"]["confidence"], 0.50)
        self.assertIn("https://cdn.example.com/vp.jpg",
                      by_name["Victor Peng"]["evidence"])


if __name__ == "__main__":
    unittest.main()
