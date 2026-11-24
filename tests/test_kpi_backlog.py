"""KPI backlog helper: add/done/list dedupe and gh filing decisions."""
import copy
import importlib.util
import json
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, ROOT / path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


kpi_backlog = load("kpi_backlog_under_test", "scripts/kpi_backlog.py")


def entry(key="F3", **overrides):
    base = {
        "key": key, "indicator": key, "title": f"Title for {key}",
        "body": f"Body for {key}.", "labels": ["kpi-backlog"],
        "status": "open", "created": "2026-11-23", "issue": None,
    }
    base.update(overrides)
    return base


class FakeResult:
    def __init__(self, returncode=0, stdout="", stderr=""):
        self.returncode = returncode
        self.stdout = stdout
        self.stderr = stderr


class FakeGh:
    """Stand-in for the gh CLI: canned `issue list` answers, logged creates."""

    def __init__(self, existing):
        # existing: {key: issue_number} for keys that already have an issue
        self.existing = dict(existing)
        self.calls = []

    def __call__(self, argv):
        self.calls.append(list(argv))
        if argv[:3] == ["gh", "label", "create"]:
            return FakeResult(0, "", "")
        if argv[:3] == ["gh", "issue", "list"]:
            query = argv[argv.index("--search") + 1]
            key = query.split(":", 1)[1].split(" ", 1)[0]
            if key in self.existing:
                return FakeResult(0, json.dumps([{"number": self.existing[key]}]))
            return FakeResult(0, "[]")
        if argv[:3] == ["gh", "issue", "create"]:
            title = argv[argv.index("--title") + 1]
            number = 500 + len([c for c in self.calls if c[:3] == ["gh", "issue", "create"]])
            return FakeResult(0, f"https://github.com/castlemilk/startup-atlas/issues/{number}\n")
        raise AssertionError(f"unexpected gh call: {argv}")

    def creates(self):
        return [c for c in self.calls if c[:3] == ["gh", "issue", "create"]]


def backlog_with(*entries):
    return {"version": 1, "entries": [copy.deepcopy(e) for e in entries]}


class AddDoneListTests(unittest.TestCase):
    def test_add_appends_and_labels(self):
        data = backlog_with()
        added = kpi_backlog.add_entry(data, entry("F3", labels=[]))
        self.assertEqual(added["labels"], ["kpi-backlog"])
        self.assertEqual(len(data["entries"]), 1)

    def test_add_duplicate_key_raises(self):
        data = backlog_with(entry("F3"))
        with self.assertRaises(kpi_backlog.BacklogError):
            kpi_backlog.add_entry(data, entry("F3", title="different"))

    def test_add_rejects_bad_key(self):
        data = backlog_with()
        with self.assertRaises(kpi_backlog.BacklogError):
            kpi_backlog.add_entry(data, entry("f3-lowercase"))

    def test_add_requires_title_and_body(self):
        data = backlog_with()
        with self.assertRaises(kpi_backlog.BacklogError):
            kpi_backlog.add_entry(data, entry("F3", title=""))

    def test_done_marks_only_that_entry(self):
        data = backlog_with(entry("F3"), entry("F4"))
        kpi_backlog.mark_done(data, "F4")
        self.assertEqual(data["entries"][0]["status"], "open")
        self.assertEqual(data["entries"][1]["status"], "done")
        self.assertEqual([e["key"] for e in kpi_backlog.open_entries(data)], ["F3"])

    def test_done_unknown_key_raises(self):
        with self.assertRaises(KeyError):
            kpi_backlog.mark_done(backlog_with(), "Q9")

    def test_load_rejects_wrong_version(self):
        import tempfile
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as fh:
            json.dump({"version": 2, "entries": []}, fh)
            path = fh.name
        with self.assertRaises(kpi_backlog.BacklogError):
            kpi_backlog.load_backlog(path)

    def test_issue_title_and_search_use_the_key(self):
        e = entry("Q4")
        self.assertEqual(kpi_backlog.issue_title(e), "[kpi-backlog:Q4] Title for Q4")
        self.assertEqual(kpi_backlog.issue_search_query(e), "kpi-backlog:Q4 in:title")


class FilingTests(unittest.TestCase):
    def test_creates_only_entries_without_an_issue(self):
        data = backlog_with(entry("F3"), entry("F4"), entry("Q4", status="done"))
        fake = FakeGh(existing={"F3": 401})
        with mock.patch.object(kpi_backlog, "_run", fake):
            with mock.patch.object(kpi_backlog, "load_backlog", return_value=data):
                created, skipped = kpi_backlog.file_entries(Path("data/kpi-backlog.json"))
        self.assertEqual(created, ["F4"])
        self.assertEqual(skipped, ["F3"])
        self.assertEqual(len(fake.creates()), 1)
        create = fake.creates()[0]
        self.assertIn("[kpi-backlog:F4]", create[create.index("--title") + 1])
        self.assertIn("kpi-backlog", create)

    def test_dry_run_lists_but_never_creates(self):
        data = backlog_with(entry("F3"), entry("F4"))
        fake = FakeGh(existing={"F3": 401})
        with mock.patch.object(kpi_backlog, "_run", fake):
            with mock.patch.object(kpi_backlog, "load_backlog", return_value=data):
                created, skipped = kpi_backlog.file_entries(
                    Path("data/kpi-backlog.json"), dry_run=True)
        self.assertEqual(created, ["F4"])  # would-create, reported
        self.assertEqual(skipped, ["F3"])
        self.assertEqual(fake.creates(), [])
        # dry run makes no label call either
        self.assertFalse(any(c[:3] == ["gh", "label", "create"] for c in fake.calls))

    def test_closed_issue_still_blocks_refile(self):
        # --state all is passed, so a closed issue counts as existing.
        data = backlog_with(entry("F3"))
        fake = FakeGh(existing={"F3": 399})
        with mock.patch.object(kpi_backlog, "_run", fake):
            with mock.patch.object(kpi_backlog, "load_backlog", return_value=data):
                _, skipped = kpi_backlog.file_entries(Path("data/kpi-backlog.json"))
        list_call = [c for c in fake.calls if c[:3] == ["gh", "issue", "list"]][0]
        self.assertIn("all", list_call[list_call.index("--state") + 1])
        self.assertEqual(skipped, ["F3"])
        self.assertEqual(fake.creates(), [])

    def test_gh_failure_is_loud_not_silent(self):
        data = backlog_with(entry("F3"))
        fake = FakeGh(existing={})

        def failing(argv):
            if argv[:3] == ["gh", "issue", "list"]:
                return FakeResult(1, "", "HTTP 500")
            return fake(argv)

        with mock.patch.object(kpi_backlog, "_run", failing):
            with mock.patch.object(kpi_backlog, "load_backlog", return_value=data):
                with self.assertRaises(RuntimeError):
                    kpi_backlog.file_entries(Path("data/kpi-backlog.json"))

    def test_real_seed_file_loads_with_f3_and_q4_done(self):
        # F3 closed by the automation assessment on #384 and Q4 by PR #412
        # (#386); F4 stays open until PR #405 (#375/#385) merges.
        data = kpi_backlog.load_backlog(ROOT / "data" / "kpi-backlog.json")
        self.assertEqual([e["key"] for e in kpi_backlog.open_entries(data)],
                         ["F4"])
        self.assertEqual([e["key"] for e in data["entries"]],
                         ["F3", "F4", "Q4"])
        for e in data["entries"]:
            self.assertIn("kpi-backlog", e["labels"])
            self.assertIn("Evidence", e["body"])


if __name__ == "__main__":
    unittest.main()
