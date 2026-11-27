"""Offline tests for wiring crawl result rows into the coverage ledger (#89).

All rows, hosts and timestamps are synthetic; SQLite files live only in
temporary directories and no network or crawler fetch runs.
"""

import importlib.util
from pathlib import Path
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))


def _load(name, filename):
    spec = importlib.util.spec_from_file_location(name, ROOT / "scripts" / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


ledger_writer = _load("atlas_crawl_coverage_ledger", "crawl_coverage_ledger.py")
coverage = _load("atlas_collection_coverage_for_ledger", "collection_coverage.py")

CREATED_AT = "2026-11-18T00:00:00Z"
REVISION = "a" * 40


def row(entity_id, url, pages=None, **fields):
    value = {"id": entity_id, "url": url, **fields}
    if pages is not None:
        value["pages"] = pages
    return value


def ok_page(url):
    return {"url": url, "status": "ok", "http_status": 200}


def failed_page(url, reason, status="skipped"):
    return {"url": url, "status": status, "reason": reason}


class CrawlCoverageLedgerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / "ledger.sqlite"

    def record(self, results, mode="sites"):
        return ledger_writer.record_run_ledger(
            self.path, mode=mode, run_id="sites-test-run",
            catalogue_revision=REVISION, created_at=CREATED_AT,
            results=results)

    def scope(self, report, host):
        return next(row for row in report["scopes"]
                    if row["source_id"] == host)

    def test_all_ok_single_host_completes(self):
        results = [
            row("startup:alpha", "https://example.com/alpha",
                [ok_page("https://example.com/alpha")]),
            row("startup:beta", "https://example.com/beta",
                [ok_page("https://example.com/beta"),
                 failed_page("https://example.com/beta/about", "HTTP 404")]),
        ]
        report = self.record(results)
        self.assertTrue(self.path.is_file())
        scope = self.scope(report, "example.com")
        self.assertEqual(scope["eligible_total"], 2)
        self.assertEqual(scope["completion"], "complete")
        self.assertEqual(scope["checkpoint"]["status"], "complete")
        self.assertEqual(scope["last_successful_full_scan_at"], CREATED_AT)
        self.assertEqual(scope["counts"]["unavailable"], 0)
        self.assertEqual(report["attempt_budget_remaining"], 0)

    def test_mixed_outcomes_across_two_hosts(self):
        results = [
            row("startup:alpha", "https://good.example.com/alpha",
                [ok_page("https://good.example.com/alpha")]),
            row("startup:beta", "https://bad.example.com/beta",
                [failed_page("https://bad.example.com/beta", "HTTP 500")]),
            row("startup:gamma", "https://bad.example.com/gamma",
                [failed_page("https://bad.example.com/gamma", "connection failed")]),
        ]
        report = self.record(results)
        good = self.scope(report, "good.example.com")
        bad = self.scope(report, "bad.example.com")
        self.assertEqual(good["completion"], "complete")
        self.assertIsNotNone(good["last_successful_full_scan_at"])
        self.assertEqual(bad["completion"], "partial")
        self.assertEqual(bad["checkpoint"]["status"], "partial")
        self.assertIn("2 of 2", bad["checkpoint"]["reason"])
        self.assertEqual(bad["counts"]["unavailable"], 2)
        self.assertIsNone(bad["last_successful_full_scan_at"])

    def test_rate_limited_page_pauses_host_and_retries_automatically(self):
        results = [
            row("startup:alpha", "https://busy.example.com/alpha",
                [ok_page("https://busy.example.com/alpha")]),
            row("startup:beta", "https://busy.example.com/beta",
                [failed_page("https://busy.example.com/beta", "HTTP 429")]),
        ]
        report = self.record(results)
        pause = report["host_pauses"]["busy.example.com"]
        self.assertEqual(pause["reason"], "http_rate_limited")
        self.assertEqual(pause["until"], "2026-11-18T01:00:00Z")
        scope = self.scope(report, "busy.example.com")
        self.assertEqual(scope["counts"]["unavailable"], 1)
        self.assertEqual(scope["completion"], "partial")
        queue = {item["entity_id"]: item for item in scope["resume_queue"]}
        self.assertEqual(queue["startup:beta"]["retry"]["mode"], "automatic")
        self.assertEqual(queue["startup:beta"]["retry"]["after"],
                         "2026-11-18T01:00:00Z")
        self.assertEqual(queue["startup:beta"]["action"], "wait_for_host")

    def test_manual_failure_uses_manual_retry(self):
        results = [
            row("startup:alpha", "https://blocked.example.com/alpha",
                [failed_page("https://blocked.example.com/alpha",
                             "access_blocked")]),
        ]
        report = self.record(results)
        scope = self.scope(report, "blocked.example.com")
        self.assertEqual(scope["counts"]["unavailable"], 1)
        self.assertEqual(scope["counts"]["manual_review"], 1)
        self.assertEqual(scope["resume_queue"][0]["action"], "manual_review")

    def test_rows_without_pages_use_row_status(self):
        results = [
            row("partner:alpha", "https://flat.example.com/alpha",
                None, status="candidates"),
            row("partner:beta", "https://flat.example.com/beta",
                None, status="error"),
            {"name": "no-url-or-pages"},
        ]
        report = self.record(results, mode="discover")
        scope = self.scope(report, "flat.example.com")
        self.assertEqual(scope["eligible_total"], 2)
        self.assertEqual(scope["counts"]["unavailable"], 1)
        self.assertEqual(scope["completion"], "partial")

    def test_ledger_reopens_read_only_with_same_config(self):
        results = [
            row("startup:alpha", "https://example.com/alpha",
                [ok_page("https://example.com/alpha")]),
            row("startup:beta", "https://example.com/beta",
                [failed_page("https://example.com/beta", "HTTP 500")]),
        ]
        report = self.record(results)
        config, _selected = ledger_writer.build_ledger_config(
            mode="sites", run_id="sites-test-run",
            catalogue_revision=REVISION, created_at=CREATED_AT,
            results=results)
        reopened = coverage.Ledger.open(self.path, config, read_only=True)
        self.addCleanup(reopened.close)
        self.assertEqual(reopened.report(CREATED_AT), report)


if __name__ == "__main__":
    unittest.main()
