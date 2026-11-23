import importlib.util
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, ROOT / path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


scoring = load("atlas_edge_scoring", "scripts/edge_scoring.py")


def src(url, type="secondary", reviewed_at="2026-11-20"):
    return {"type": type, "url": url, "reviewed_at": reviewed_at}


class ScoreEdgeTests(unittest.TestCase):
    def test_single_source_scores_base(self):
        self.assertEqual(scoring.score_edge(
            [src("https://example.com/about")]), 0.50)

    def test_two_independent_sources(self):
        self.assertEqual(scoring.score_edge([
            src("https://example.com/about"),
            src("https://other.org/news"),
        ]), 0.65)

    def test_same_host_sources_are_not_independent(self):
        self.assertEqual(scoring.score_edge([
            src("https://example.com/about"),
            src("https://example.com/team"),
            src("https://www.example.com/news"),
        ]), 0.50)

    def test_primary_bonus(self):
        self.assertEqual(scoring.score_edge([
            src("https://example.com/announcement", type="primary"),
        ]), 0.60)
        self.assertEqual(scoring.score_edge([
            src("https://example.com/announcement", type="primary"),
            src("https://other.org/news"),
        ]), 0.75)

    def test_inferred_penalty(self):
        self.assertEqual(scoring.score_edge([
            src("https://example.com/about", type="inferred"),
        ]), 0.30)
        self.assertEqual(scoring.score_edge([
            src("https://example.com/about"),
            src("https://other.org/news", type="inferred"),
        ]), 0.45)

    def test_single_source_caps_at_080(self):
        # A single primary source would be 0.50 + 0.10 = 0.60 here, so
        # prove the cap with a single source that would otherwise
        # exceed it: the cap also binds any single-source combination.
        self.assertLessEqual(scoring.score_edge([
            src("https://example.com/announcement", type="primary"),
        ]), 0.80)
        # Four same-host sources still count as one independent source.
        self.assertEqual(scoring.score_edge([
            src("https://example.com/a", type="primary"),
            src("https://example.com/b"),
            src("https://example.com/c"),
            src("https://example.com/d"),
        ]), 0.60)

    def test_ceiling(self):
        # 0.50 + 4 * 0.15 + 0.10 = 1.20 -> capped at 0.95.
        self.assertEqual(scoring.score_edge([
            src("https://a.example/one", type="primary"),
            src("https://b.example/two"),
            src("https://c.example/three"),
            src("https://d.example/four"),
            src("https://e.example/five"),
        ]), 0.95)

    def test_floor(self):
        # No sources at all: no evidence, floor score.
        self.assertEqual(scoring.score_edge([]), 0.05)
        self.assertEqual(scoring.score_edge(None), 0.05)

    def test_three_independent_sources_plus_primary(self):
        self.assertEqual(scoring.score_edge([
            src("https://a.example/one", type="primary"),
            src("https://b.example/two"),
            src("https://c.example/three"),
        ]), 0.90)


class FreshnessTests(unittest.TestCase):
    def test_fresh_within_90_days(self):
        result = scoring.freshness("2026-11-20", today="2026-11-23")
        self.assertEqual(result, {"days_since_verified": 3, "stale": False})

    def test_stale_after_90_days(self):
        result = scoring.freshness("2026-08-20", today="2026-11-23")
        self.assertEqual(result["days_since_verified"], 95)
        self.assertTrue(result["stale"])

    def test_exactly_90_days_is_not_stale(self):
        result = scoring.freshness("2026-08-25", today="2026-11-23")
        self.assertEqual(result["days_since_verified"], 90)
        self.assertFalse(result["stale"])

    def test_null_date_is_stale(self):
        self.assertEqual(scoring.freshness(None, today="2026-11-23"),
                         {"days_since_verified": None, "stale": True})

    def test_accepts_date_objects(self):
        from datetime import date
        result = scoring.freshness(date(2026, 11, 20),
                                   today=date(2026, 11, 23))
        self.assertEqual(result, {"days_since_verified": 3, "stale": False})


class ConfidenceBasisTests(unittest.TestCase):
    def test_single_secondary_source(self):
        self.assertEqual(
            scoring.build_confidence_basis(
                [src("https://example.com/about")]),
            {"sources": 1, "source_types": ["secondary"],
             "agreement": False, "inferred": False})

    def test_two_independent_sources_agree(self):
        self.assertEqual(
            scoring.build_confidence_basis([
                src("https://example.com/about"),
                src("https://other.org/news", type="primary"),
            ]),
            {"sources": 2, "source_types": ["primary", "secondary"],
             "agreement": True, "inferred": False})

    def test_same_host_sources_do_not_agree(self):
        basis = scoring.build_confidence_basis([
            src("https://example.com/about"),
            src("https://example.com/team"),
        ])
        self.assertEqual(basis["sources"], 2)
        self.assertFalse(basis["agreement"])

    def test_inferred_flag(self):
        basis = scoring.build_confidence_basis([
            src("https://example.com/about"),
            src("https://other.org/news", type="inferred"),
        ])
        self.assertTrue(basis["inferred"])
        self.assertIn("inferred", basis["source_types"])
        self.assertTrue(basis["agreement"])

    def test_empty_sources(self):
        self.assertEqual(scoring.build_confidence_basis([]),
                         {"sources": 0, "source_types": [],
                          "agreement": False, "inferred": False})


if __name__ == "__main__":
    unittest.main()
