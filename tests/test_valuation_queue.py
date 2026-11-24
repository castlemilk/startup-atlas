"""Tests for the valuation/listing fact intake (#414d).

``produce_value_facts`` in scripts/build-review-queue.py turns the
valuation, secondary-sale and market-cap figures a crawl's news
artifact carries (and the round producer deliberately skips) into
pending ``fact`` entries with a ``draft_value`` payload. Fixtures are
built in tempfile dirs; the recorded-fact cases mirror the live stores
(Airwallex's $11B Series H round valuation, Canva's $42B secondary,
UiPath's dated market caps) so dedup is pinned against the same shapes
``scripts/latest_value.py`` derives from.
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


queue_mod = load("atlas_valuation_queue", "scripts/build-review-queue.py")
gating_mod = load("atlas_review_gating", "scripts/review_gating.py")


def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data), encoding="utf-8")


def news_item(startup, title, mentions, published="2026-11-20",
              url="https://example.com/article"):
    return {"startup": startup, "title": title, "url": url,
            "discovered_from": "https://example.com/newsroom",
            "published_hint": published,
            "checked_at": "2026-11-23T07:14:55+00:00",
            "amount_mentions": [
                {"mention": text,
                 "normalised": {"value": value, "currency": currency}}
                for text, value, currency in mentions]}


class ValueFixture(unittest.TestCase):
    def setUp(self):
        self._td = tempfile.TemporaryDirectory()
        self.addCleanup(self._td.cleanup)
        base = Path(self._td.name)
        self.data_dir = base / "data"
        self.artifact = base / "artifact"
        self.queue_path = base / "queue.json"
        write_json(self.data_dir / "partners-reviewed.json", {})
        write_json(self.data_dir / "partner-leads.json", [])
        write_json(self.data_dir / "startup-research.json", {
            "startups": [
                {"name": "Revolut", "website": "https://www.revolut.com/",
                 "funding_rounds": [
                     {"stage": "Series E", "announced_on": "2021-07-15",
                      "source": "https://example.com/revolut-series-e"}]},
                {"name": "Airwallex",
                 "website": "https://www.airwallex.com/",
                 "funding_rounds": [
                     {"stage": "Series H", "announced_on": "2026-06-25",
                      "source": "https://example.com/airwallex-h",
                      "valuation": 11000000000,
                      "valuation_currency": "USD"}]},
                {"name": "Canva", "website": "https://www.canva.com/",
                 "funding_rounds": []},
                {"name": "UiPath", "website": "https://www.uipath.com/",
                 "funding_rounds": []},
                {"name": "Wayve", "website": "https://wayve.ai/",
                 "funding_rounds": []},
            ]})
        write_json(self.data_dir / "graph.json",
                   {"version": 1, "entities": [], "edges": []})
        write_json(self.data_dir / "treemap-evidence.json", {
            "version": 1, "technology": {}, "ownership": {},
            "private_valuations": [
                {"id": "canva-2025-investor-secondary",
                 "startup_id": "startup:canva",
                 "announced_on": "2025-08-25",
                 "stage": "Investor-led secondary share sale",
                 "valuation": 42000000000, "valuation_currency": "USD",
                 "source": "https://example.com/canva-secondary",
                 "approximate": True}],
            "market_caps": [
                {"startup_id": "startup:uipath", "ticker": "PATH",
                 "exchange": "NYSE", "observed_on": "2026-11-20",
                 "currency": "USD", "amount": 5711863282.64,
                 "source": "https://example.com/uipath-stock"}]})
        # The real gating config: build() applies it, so the tests also
        # prove value facts stay pending under production thresholds.
        write_json(self.data_dir / "review-gating.json", json.loads(
            (ROOT / "data" / "review-gating.json").read_text()))
        write_json(self.artifact / "latest-news.json", {"candidates": [
            # New: the Series E round is recorded but its $33B valuation
            # is not (mirrors the live Revolut record).
            news_item(
                "Revolut",
                "Revolut raises $800 million Series E at a $33 billion "
                "valuation",
                [("$800 million", 800000000.0, "USD"),
                 ("$33 billion", 33000000000.0, "USD")],
                published="2021-07-15",
                url="https://example.com/revolut-33b"),
            # Recorded: Airwallex's Series H round valuation ($11B).
            news_item(
                "Airwallex",
                "Airwallex secures $320 million in Series H funding at "
                "an $11 billion valuation",
                [("$320 million", 320000000.0, "USD"),
                 ("$11 billion", 11000000000.0, "USD")],
                published="2026-06-25",
                url="https://example.com/airwallex-11b"),
            # Recorded: Canva's $42B secondary in private_valuations.
            news_item(
                "Canva",
                "Canva completes secondary share sale at a $42 billion "
                "valuation",
                [("$42 billion", 42000000000.0, "USD")],
                published="2025-08-25",
                url="https://example.com/canva-42b"),
            # New: a market-cap observation that is not the recorded
            # 2026-11-20 one, with the ticker in literal headline form.
            news_item(
                "UiPath",
                "UiPath (NYSE: PATH) market cap climbs to $5.9 billion",
                [("$5.9 billion", 5900000000.0, "USD")],
                published="2026-11-21",
                url="https://example.com/uipath-cap"),
            # New: an unrecorded secondary-sale valuation.
            news_item(
                "Wayve",
                "Wayve completes secondary share sale at a $9 billion "
                "valuation",
                [("$9 billion", 9000000000.0, "USD")],
                published="2026-03-01",
                url="https://example.com/wayve-secondary"),
            # Tight phrasing: the raise amount sits immediately before
            # "at a $2 billion valuation" — only the $2B is a value
            # fact; the $200M raise must not inherit its signal.
            news_item(
                "NewBank",
                "NewBank raises $200 million Series C at a $2 billion "
                "valuation",
                [("$200 million", 200000000.0, "USD"),
                 ("$2 billion", 2000000000.0, "USD")],
                published="2026-11-01",
                url="https://example.com/newbank-2b"),
            # Recorded, headline-rounded: $5.71B on the recorded date
            # is the recorded 5,711,863,282.64 observation, restated.
            news_item(
                "UiPath",
                "UiPath (NYSE: PATH) market cap steady at $5.71 billion",
                [("$5.71 billion", 5710000000.0, "USD")],
                published="2026-11-20",
                url="https://example.com/uipath-cap-rounded"),
            # No value signal: a plain raise is the round producer's.
            news_item(
                "Bugcrowd",
                "Bugcrowd raises $50 million in Series F funding",
                [("$50 million", 50000000.0, "USD")],
                url="https://example.com/bugcrowd-raise"),
            # Mention never appears in the title: not a headline fact.
            news_item(
                "NewCo", "NewCo launches valuation tools for startups",
                [("$2 billion", 2000000000.0, "USD")],
                url="https://example.com/newco-tools"),
        ]})

    def produce(self):
        return queue_mod.produce_value_facts(
            self.artifact, self.data_dir, "45")


class ProducerTests(ValueFixture):
    def test_only_new_value_facts_are_proposed(self):
        entries = self.produce()
        subjects = sorted(e["subject"] for e in entries)
        self.assertEqual(subjects, ["startup:newbank", "startup:revolut",
                                    "startup:uipath", "startup:wayve"])

    def test_raise_amount_does_not_inherit_the_valuation_signal(self):
        entries = [e for e in self.produce()
                   if e["subject"] == "startup:newbank"]
        self.assertEqual(len(entries), 1)
        draft = entries[0]["draft_value"]
        self.assertEqual(draft["amount"], 2000000000.0)
        self.assertEqual(draft["event"], "last_round_post_money")
        self.assertEqual(draft["stage"], "Series C")

    def test_headline_rounded_cap_matches_the_recorded_observation(self):
        entries = [e for e in self.produce()
                   if e["subject"] == "startup:uipath"]
        self.assertEqual(len(entries), 1)
        self.assertEqual(entries[0]["draft_value"]["amount"],
                         5900000000.0)

    def test_round_valuation_entry_shape(self):
        entry = next(e for e in self.produce()
                     if e["subject"] == "startup:revolut")
        self.assertEqual(entry["kind"], "fact")
        self.assertEqual(entry["status"], "pending")
        self.assertEqual(entry["confidence"], 0.5)
        self.assertNotIn("draft_round", entry)
        draft = entry["draft_value"]
        self.assertEqual(draft["startup"], "Revolut")
        self.assertEqual(draft["amount"], 33000000000.0)
        self.assertEqual(draft["currency"], "USD")
        self.assertEqual(draft["date"], "2021-07-15")
        self.assertEqual(draft["event"], "last_round_post_money")
        self.assertEqual(draft["stage"], "Series E")
        self.assertIsNone(draft["exchange"])
        self.assertIsNone(draft["ticker"])
        self.assertEqual(draft["source_url"],
                         "https://example.com/revolut-33b")
        self.assertEqual(entry["evidence"],
                         ["https://example.com/newsroom",
                          "https://example.com/revolut-33b"])
        self.assertEqual(
            entry["evidence_fingerprint"],
            queue_mod.evidence_fingerprint(entry["evidence"]))

    def test_market_cap_entry_carries_literal_ticker(self):
        entry = next(e for e in self.produce()
                     if e["subject"] == "startup:uipath")
        draft = entry["draft_value"]
        self.assertEqual(draft["event"], "listed_market_cap")
        self.assertEqual(draft["exchange"], "NYSE")
        self.assertEqual(draft["ticker"], "PATH")
        self.assertIsNone(draft["stage"])

    def test_secondary_sale_entry_shape(self):
        entry = next(e for e in self.produce()
                     if e["subject"] == "startup:wayve")
        self.assertEqual(entry["draft_value"]["event"], "secondary_sale")
        self.assertEqual(entry["draft_value"]["amount"], 9000000000.0)

    def test_recorded_facts_are_not_reproposed(self):
        subjects = {e["subject"] for e in self.produce()}
        self.assertNotIn("startup:airwallex", subjects)
        self.assertNotIn("startup:canva", subjects)

    def test_saved_run_47_undated_original_does_not_requeue_series_h(self):
        write_json(self.artifact / "latest-news.json", {"candidates": [
            news_item("Airwallex", "Airwallex secures $320 million in "
                      "Series H funding, valuation hits $11 billion",
                      [("$320 million", 320000000, None),
                       ("$11 billion", 11000000000, None)], published="",
                      url="https://example.com/airwallex-h"),
        ]})
        self.assertEqual(self.produce(), [])

    def test_unrelated_undated_same_amount_stays_pending_without_crawl_date(self):
        write_json(self.artifact / "latest-news.json", {"candidates": [
            news_item("Airwallex", "Airwallex raises more in Series I, "
                      "valuation hits $11 billion",
                      [("$11 billion", 11000000000, None)], published="2026-11-31",
                      url="https://example.com/airwallex-i"),
        ]})
        entry, = self.produce()
        self.assertEqual(entry["status"], "pending")
        self.assertTrue(entry["id"].endswith(":undated"))
        self.assertIsNone(entry["draft_value"]["date"])
        self.assertEqual(entry["draft_value"]["stage"], "Series I")

    def test_undated_same_source_with_conflicting_currency_stays_pending(self):
        write_json(self.artifact / "latest-news.json", {"candidates": [
            news_item("Airwallex", "Airwallex Series H valuation hits A$11 billion",
                      [("A$11 billion", 11000000000, "AUD")], published="",
                      url="https://example.com/airwallex-h"),
        ]})
        entry, = self.produce()
        self.assertIsNone(entry["draft_value"]["date"])
        self.assertEqual(entry["draft_value"]["currency"], "AUD")

    def test_plain_raise_and_off_title_mentions_produce_nothing(self):
        subjects = {e["subject"] for e in self.produce()}
        self.assertNotIn("startup:bugcrowd", subjects)
        self.assertNotIn("startup:newco", subjects)


class GatingSafetyTests(ValueFixture):
    def test_value_fact_never_auto_proceeds(self):
        config = json.loads(
            (ROOT / "data" / "review-gating.json").read_text())
        for entry in self.produce():
            self.assertIsNone(gating_mod.check_entry(entry, config))
            # Even a (hypothetical) high-confidence value fact cannot
            # pass the fact rule: it inspects draft_round, and a value
            # fact deliberately carries draft_value instead.
            entry["confidence"] = 0.95
            self.assertIsNone(gating_mod.check_entry(entry, config))


class BuildIntegrationTests(ValueFixture):
    def test_build_queues_value_facts_pending_and_idempotently(self):
        queue, added, _ = queue_mod.build(
            self.artifact, "45", self.queue_path, self.data_dir)
        values = [e for e in added if e.get("draft_value")]
        self.assertEqual(len(values), 4)
        # Gating ran inside build() with the production config and
        # left every value fact pending.
        self.assertTrue(all(e["status"] == "pending" for e in values))
        queue2, added2, _ = queue_mod.build(
            self.artifact, "46", self.queue_path, self.data_dir)
        self.assertEqual([e for e in added2 if e.get("draft_value")], [])
        self.assertEqual(len(queue2["entries"]), len(queue["entries"]))

    def test_summary_renders_draft_value(self):
        queue, added, skipped = queue_mod.build(
            self.artifact, "45", self.queue_path, self.data_dir)
        summary = queue_mod.build_summary(queue, added, skipped, "45")
        self.assertIn("draft value: Revolut", summary)
        self.assertIn("listed_market_cap (NYSE: PATH)", summary)


if __name__ == "__main__":
    unittest.main()
