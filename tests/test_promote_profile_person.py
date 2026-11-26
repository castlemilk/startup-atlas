"""Tests for the #366 slice-4 promotion path (scripts/promote_profile_person.py).

Loads the script via importlib (the tests/test_graph.py pattern).
Fixtures are built in memory; nothing reads the live crawl artifact
or the repo data dir.
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


promote_mod = load("atlas_promote_profile_person",
                   "scripts/promote_profile_person.py")

LINKEDIN = "https://au.linkedin.com/in/jane-example?trk=public-profile"
TEAM = "https://example.vc/team"


def profiles_fixture():
    return {"Example VC": {"type": "Venture capital",
                           "geography": "Australia", "people": []}}


def people_row(**overrides):
    row = {"partner": "Example VC", "kind": "people", "name": "Jane Example",
           "candidate_url": "https://example.vc/team/jane-example",
           "source_url": TEAM, "checked_at": "2026-11-26T00:00:00Z",
           "review_required": True}
    row.update(overrides)
    return row


class PromoteTests(unittest.TestCase):
    def test_adds_person_with_linkedin_from_candidate_url(self):
        profiles = profiles_fixture()
        entry, action = promote_mod.promote(
            profiles, [people_row(candidate_url=LINKEDIN)],
            "Example VC", "Jane Example", role="Partner")
        self.assertEqual(action, "added")
        # The URL is recorded as published, not normalised (Decision 1).
        self.assertEqual(entry["linkedin"], LINKEDIN)
        self.assertEqual(entry["source"], TEAM)
        self.assertEqual(entry["role"], "Partner")
        self.assertEqual(profiles["Example VC"]["people"], [entry])

    def test_adds_person_with_linkedin_from_social_row(self):
        profiles = profiles_fixture()
        rows = [people_row(),
                {"partner": "Example VC", "kind": "social",
                 "name": "Jane Example", "candidate_url": LINKEDIN,
                 "source_url": TEAM, "review_required": True}]
        entry, action = promote_mod.promote(
            profiles, rows, "Example VC", "Jane Example", role="Partner")
        self.assertEqual(action, "added")
        self.assertEqual(entry["linkedin"], LINKEDIN)

    def test_adds_person_without_linkedin_plainly(self):
        profiles = profiles_fixture()
        entry, action = promote_mod.promote(
            profiles, [people_row()], "Example VC", "Jane Example",
            role="Partner")
        self.assertEqual(action, "added")
        self.assertNotIn("linkedin", entry)

    def test_company_linkedin_page_is_not_a_person_key(self):
        profiles = profiles_fixture()
        entry, _ = promote_mod.promote(
            profiles,
            [people_row(candidate_url="https://www.linkedin.com/company/example-vc")],
            "Example VC", "Jane Example", role="Partner")
        self.assertNotIn("linkedin", entry)

    def test_new_person_requires_role(self):
        with self.assertRaises(ValueError):
            promote_mod.promote(profiles_fixture(), [people_row()],
                                "Example VC", "Jane Example")

    def test_unknown_partner_refused(self):
        with self.assertRaises(ValueError):
            promote_mod.promote(profiles_fixture(), [people_row()],
                                "Other VC", "Jane Example", role="Partner")

    def test_conflicting_crawl_keys_refused(self):
        rows = [people_row(candidate_url=LINKEDIN),
                people_row(candidate_url="https://www.linkedin.com/in/jane-other")]
        with self.assertRaises(ValueError):
            promote_mod.promote(profiles_fixture(), rows,
                                "Example VC", "Jane Example", role="Partner")

    def test_existing_person_gains_linkedin(self):
        profiles = profiles_fixture()
        profiles["Example VC"]["people"].append(
            {"name": "Jane Example", "role": "Partner", "source": TEAM})
        entry, action = promote_mod.promote(
            profiles, [people_row(candidate_url=LINKEDIN)],
            "Example VC", "Jane Example")
        self.assertEqual(action, "updated")
        self.assertEqual(entry["linkedin"], LINKEDIN)

    def test_existing_person_same_key_is_unchanged(self):
        profiles = profiles_fixture()
        profiles["Example VC"]["people"].append(
            {"name": "Jane Example", "role": "Partner", "source": TEAM,
             "linkedin": "https://www.linkedin.com/in/jane-example"})
        entry, action = promote_mod.promote(
            profiles, [people_row(candidate_url=LINKEDIN)],
            "Example VC", "Jane Example")
        self.assertEqual(action, "unchanged")
        self.assertEqual(entry["linkedin"],
                         "https://www.linkedin.com/in/jane-example")

    def test_existing_person_conflicting_recorded_key_refused(self):
        profiles = profiles_fixture()
        profiles["Example VC"]["people"].append(
            {"name": "Jane Example", "role": "Partner", "source": TEAM,
             "linkedin": "https://www.linkedin.com/in/someone-else"})
        with self.assertRaises(ValueError):
            promote_mod.promote(
                profiles, [people_row(candidate_url=LINKEDIN)],
                "Example VC", "Jane Example")

    def test_cli_dry_run_writes_nothing_and_real_run_writes(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            artifact = base / "latest-profiles.json"
            artifact.write_text(json.dumps(
                {"candidates": [people_row(candidate_url=LINKEDIN)]}),
                encoding="utf-8")
            target = base / "partner-profiles.json"
            original = json.dumps(profiles_fixture(), indent=2) + "\n"
            target.write_text(original, encoding="utf-8")
            argv = ["--artifact", str(artifact), "--partner", "Example VC",
                    "--name", "Jane Example", "--role", "Partner",
                    "--profiles", str(target)]
            self.assertEqual(promote_mod.main(argv + ["--dry-run"]), 0)
            self.assertEqual(target.read_text(encoding="utf-8"), original)
            self.assertEqual(promote_mod.main(argv), 0)
            written = json.loads(target.read_text(encoding="utf-8"))
            person = written["Example VC"]["people"][0]
            self.assertEqual(person["linkedin"], LINKEDIN)

    def test_cli_unknown_person_in_artifact_fails(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            artifact = base / "latest-profiles.json"
            artifact.write_text(json.dumps({"candidates": []}),
                                encoding="utf-8")
            target = base / "partner-profiles.json"
            target.write_text(json.dumps(profiles_fixture()), encoding="utf-8")
            self.assertEqual(promote_mod.main(
                ["--artifact", str(artifact), "--partner", "Example VC",
                 "--name", "Jane Example", "--role", "Partner",
                 "--profiles", str(target)]), 1)


if __name__ == "__main__":
    unittest.main()
