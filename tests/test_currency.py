"""Currency parsing, USD normalisation and FX fallback (pinned rates)."""

import importlib.util
import io
import json
import unittest
from pathlib import Path
from unittest.mock import patch

from scripts import currency

ROOT = Path(__file__).resolve().parents[1]

# Pinned rates: deterministic, no network. Values chosen to avoid rounding ties.
PINNED = {"to_usd": {"AUD": 0.66, "EUR": 1.10, "GBP": 1.31, "JPY": 0.0063,
                     "SGD": 0.775, "CAD": 0.70, "NZD": 0.55, "USD": 1.0},
          "date": "2026-11-21", "source": "pinned-test"}


def normalise(mention, country=None):
    return currency.normalise_mention(mention, context_country=country,
                                      rate_bundle=PINNED)


def _load_crawl():
    spec = importlib.util.spec_from_file_location(
        "atlas_crawl", ROOT / "scripts" / "crawl.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class ParseTests(unittest.TestCase):
    def test_explicit_markers(self):
        self.assertEqual(currency.parse_amount("A$1.05B")["currency"], "AUD")
        self.assertEqual(currency.parse_amount("A$1.05B")["value"], 1050000000.0)
        self.assertEqual(currency.parse_amount("US$900M")["currency"], "USD")
        self.assertEqual(currency.parse_amount("€300M")["currency"], "EUR")
        self.assertEqual(currency.parse_amount("£500K")["currency"], "GBP")
        self.assertEqual(currency.parse_amount("¥100M")["currency"], "JPY")
        self.assertEqual(currency.parse_amount("S$2M")["currency"], "SGD")
        self.assertEqual(currency.parse_amount("A$120k")["value"], 120000.0)
        self.assertEqual(currency.parse_amount("US$1,000")["value"], 1000.0)
        self.assertEqual(currency.parse_amount("USD$3.2 million")["value"], 3200000.0)
        self.assertEqual(currency.parse_amount("82 million dollars")["currency"], "USD")
        self.assertEqual(currency.parse_amount("82 million dollars")["value"], 82000000.0)

    def test_qualifiers_are_preserved_not_flattened(self):
        self.assertEqual(currency.parse_amount("~US$740M")["qualifier"], "approximate")
        self.assertEqual(currency.parse_amount("over A$12B")["qualifier"], "minimum")
        self.assertEqual(currency.parse_amount("up to $5M")["qualifier"], "maximum")
        self.assertIsNone(currency.parse_amount("A$650M")["qualifier"])

    def test_ranges_keep_both_ends(self):
        parsed = currency.parse_amount("$250K–$5M", context_country="AU")
        self.assertEqual(parsed["currency"], "AUD")
        self.assertEqual(parsed["value"], {"low": 250000.0, "high": 5000000.0})
        parsed = currency.parse_amount("between $250K and $5M", context_country="US")
        self.assertEqual(parsed["currency"], "USD")
        self.assertEqual(parsed["value"], {"low": 250000.0, "high": 5000000.0})

    def test_bare_dollar_is_ambiguous_without_context(self):
        parsed = currency.parse_amount("$4.5B")
        self.assertEqual(parsed["status"], "ambiguous")
        self.assertIsNone(parsed["currency"])
        self.assertEqual(parsed["value"], 4500000000.0)

    def test_bare_dollar_resolves_from_context_and_records_the_assumption(self):
        parsed = currency.parse_amount("$4.5B", context_country="AU")
        self.assertEqual(parsed["status"], "parsed")
        self.assertEqual(parsed["currency"], "AUD")
        self.assertIn("AUD", parsed["assumption"])
        # A country with no dollar mapping stays ambiguous.
        self.assertEqual(currency.parse_amount("$4.5B", context_country="DE")["status"],
                         "ambiguous")

    def test_trailing_prose_and_non_amounts(self):
        self.assertEqual(currency.parse_amount("US$1,000 to start")["value"], 1000.0)
        parsed = currency.parse_amount("not an amount")
        self.assertEqual(parsed["status"], "unparsed")
        self.assertIsNone(parsed["value"])


class ConvertTests(unittest.TestCase):
    def test_real_crawled_examples_against_pinned_rates(self):
        # Blackbird Fund VI, Partech Impact Fund, USV fund cycle (21 Nov 2026 batch).
        blackbird = normalise("A$1.05B")
        self.assertEqual(blackbird["status"], "converted")
        self.assertEqual(blackbird["usd"], 693000000.0)
        self.assertEqual(blackbird["usd_display"], "US$693M")
        self.assertEqual((blackbird["rate"], blackbird["rate_date"],
                          blackbird["rate_source"]), (0.66, "2026-11-21", "pinned-test"))
        partech = normalise("€300M")
        self.assertEqual((partech["usd"], partech["usd_display"]), (330000000.0, "US$330M"))
        usv = normalise("$900M", country="US")
        self.assertEqual(usv["status"], "assumed")
        self.assertEqual((usv["usd"], usv["usd_display"]), (900000000.0, "US$900M"))
        airtree = normalise("A$650M")
        self.assertEqual((airtree["usd"], airtree["usd_display"]), (429000000.0, "US$429M"))

    def test_ambiguous_amount_is_never_converted(self):
        record = normalise("$4.5B")
        self.assertEqual(record["status"], "ambiguous")
        self.assertIsNone(record["usd"])
        self.assertIsNone(record["rate"])

    def test_ranges_convert_both_ends(self):
        record = normalise("$250K–$5M", country="AU")
        self.assertEqual(record["status"], "assumed")
        self.assertEqual(record["usd"], {"low": 165000.0, "high": 3300000.0})
        self.assertEqual(record["usd_display"], "US$165K–US$3.3M")

    def test_original_is_always_preserved(self):
        record = normalise("A$1.05B")
        self.assertEqual(record["original"], "A$1.05B")
        self.assertEqual(record["currency"], "AUD")
        self.assertEqual(record["value"], 1050000000.0)

    def test_format_usd(self):
        self.assertEqual(currency.format_usd(695000000), "US$695M")
        self.assertEqual(currency.format_usd(1000), "US$1K")
        self.assertEqual(currency.format_usd(850), "US$850")
        self.assertEqual(currency.format_usd({"low": 250000.0, "high": 5000000.0}),
                         "US$250K–US$5M")


class RatesTests(unittest.TestCase):
    def test_fallback_table_is_dated_and_covers_the_crawl_currencies(self):
        table = currency.load_fallback_table()
        self.assertEqual(table["date"], "2026-11-21")
        self.assertEqual(table["source"], "fallback-table")
        for code in ("AUD", "EUR", "GBP", "JPY", "SGD", "CAD", "NZD", "USD"):
            self.assertIn(code, table["to_usd"])
        self.assertAlmostEqual(table["to_usd"]["AUD"], 0.662)
        self.assertAlmostEqual(table["to_usd"]["EUR"], 1.0975)

    def test_get_rates_falls_back_when_live_fetch_fails(self):
        currency.reset_rates_cache()
        try:
            with patch.object(currency, "fetch_live_rates", return_value=None):
                bundle = currency.get_rates()
            self.assertEqual(bundle["source"], "fallback-table")
            self.assertEqual(bundle["date"], "2026-11-21")
        finally:
            currency.reset_rates_cache()

    def test_live_fetch_inverts_frankfurter_base_usd_rates(self):
        payload = json.dumps(
            {"base": "USD", "date": "2026-11-20",
             "rates": {"AUD": 1.51, "EUR": 0.91}}).encode()

        class FakeResponse(io.BytesIO):
            def __enter__(self):
                return self

            def __exit__(self, *args):
                return False

        with patch.object(currency.urllib.request, "urlopen",
                          return_value=FakeResponse(payload)):
            bundle = currency.fetch_live_rates()
        self.assertEqual(bundle["source"], "frankfurter-live")
        self.assertEqual(bundle["date"], "2026-11-20")
        self.assertAlmostEqual(bundle["to_usd"]["AUD"], 1 / 1.51, places=6)
        self.assertAlmostEqual(bundle["to_usd"]["EUR"], 1 / 0.91, places=6)
        self.assertEqual(bundle["to_usd"]["USD"], 1.0)


class CrawlWiringTests(unittest.TestCase):
    def test_amount_mentions_carry_a_normalised_record(self):
        crawl = _load_crawl()
        mentions = crawl.extract_amount_mentions(
            ["Fund VI closed at A$1.05B and a $900M round."],
            "https://example.com/", rate_bundle=PINNED)
        self.assertEqual([m["mention"] for m in mentions], ["A$1.05B", "$900M"])
        self.assertEqual(mentions[0]["normalised"]["status"], "converted")
        self.assertEqual(mentions[0]["normalised"]["usd"], 693000000.0)
        # The bare $ stays ambiguous in crawl output: no context is guessed.
        self.assertEqual(mentions[1]["normalised"]["status"], "ambiguous")
        self.assertIsNone(mentions[1]["normalised"]["usd"])
        # The raw mention string is kept verbatim.
        self.assertEqual(mentions[0]["mention"], "A$1.05B")


if __name__ == "__main__":
    unittest.main()
