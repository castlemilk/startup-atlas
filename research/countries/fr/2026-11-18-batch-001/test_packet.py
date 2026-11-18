"""Regression checks for evidence-loss and resumption risks in this saved packet."""
import copy
import json
from pathlib import Path
import tempfile
import unittest

from validate_packet import (HERE, date_precision, digest, domain, duplicate_matches,
                             read, remaining_work, slug, validate, validate_claims)


class FrancePacketTests(unittest.TestCase):
    def test_real_packet(self):
        self.assertEqual(validate()["errors"], [])

    def test_normalization_accent_punctuation(self):
        self.assertEqual(slug("  Alice & Bob  "), "alice-bob")
        self.assertEqual(slug("Électra"), "electra")

    def test_domain_path_and_www_do_not_create_new_company(self):
        self.assertEqual(domain("https://WWW.EXAMPLE.COM/about?q=1"), "example.com")
        self.assertNotEqual(domain("https://fr.example.com/"), domain("https://example.com/"))

    def test_unsafe_or_credentialled_identity_urls_rejected(self):
        for url in ["http://example.com", "https://user:secret@example.com", "https://127.0.0.1/", "https://internal.local/"]:
            with self.subTest(url=url), self.assertRaises(ValueError):
                domain(url)

    def test_alias_and_domain_dedup(self):
        old = [{"id": "startup:old-name", "name": "Old Name", "website": "https://example.com/"}]
        renamed = {"name": "New Name", "aliases": ["Old Name"], "website": "https://www.example.com/new"}
        match = duplicate_matches(renamed, old)
        self.assertEqual(match[0]["id"], "startup:old-name")
        self.assertEqual(set(match[0]["reasons"]), {"normalized_name_or_reviewed_alias", "official_domain"})

    def test_name_only_does_not_hide_domain_change(self):
        old = [{"id": "startup:example", "name": "Example", "website": "https://one.example/"}]
        match = duplicate_matches({"name": "Example", "website": "https://two.example/"}, old)
        self.assertEqual(match[0]["reasons"], ["normalized_name_or_reviewed_alias"])

    def test_foundation_precision_is_not_padded(self):
        self.assertTrue(date_precision("2020", "year"))
        self.assertTrue(date_precision("2020-09", "month"))
        self.assertFalse(date_precision("2020-01-01", "year"))
        self.assertFalse(date_precision("2025-02-30", "day"))

    def test_unknown_is_distinct_from_zero_and_empty(self):
        self.assertTrue(date_precision(None, None))
        self.assertFalse(date_precision(0, "year"))
        self.assertFalse(date_precision("", "year"))
        self.assertFalse(date_precision(None, "day"))

    def test_review_requires_page_access(self):
        claim = next(c for c in read("claims.json")["claims"] if c["status"] == "reviewed_staged")
        sources = {s["url"]: s for s in read("sources.json")["sources"]}
        sources = copy.deepcopy(sources)
        sources[claim["source_url"]]["accessed"] = False
        self.assertTrue(any("accessed" in e for e in validate_claims([claim], sources)))

    def test_provenance_url_cannot_be_dropped(self):
        claim = next(c for c in read("claims.json")["claims"] if c["status"] == "reviewed_staged")
        self.assertTrue(validate_claims([claim], {}))

    def test_null_claim_cannot_masquerade_as_verified(self):
        claim = copy.deepcopy(next(c for c in read("claims.json")["claims"] if c["status"] == "reviewed_staged"))
        claim["value"] = None
        sources = {s["url"]: s for s in read("sources.json")["sources"]}
        self.assertTrue(any("null" in e for e in validate_claims([claim], sources)))

    def test_saved_queue_replays_without_repeating_reviewed_work(self):
        queue, cp = read("review-queue.json")["items"], read("checkpoint.json")
        remainder = remaining_work(queue, cp, cp["base_revision"])
        self.assertEqual(remainder, remaining_work(queue, cp, cp["base_revision"]))
        self.assertFalse(set(cp["completed_review_work_ids"]) & {x["work_id"] for x in remainder})

    def test_interrupted_review_retains_every_pending_identity(self):
        queue, cp = read("review-queue.json")["items"], copy.deepcopy(read("checkpoint.json"))
        cp["completed_review_work_ids"] = cp["completed_review_work_ids"][:3]
        remainder = remaining_work(queue, cp, cp["base_revision"])
        self.assertEqual(len(remainder), len(queue) - 3)
        self.assertEqual({x["work_id"] for x in queue}, set(cp["completed_review_work_ids"]) | {x["work_id"] for x in remainder})

    def test_changed_queue_or_revision_fences_stale_checkpoint(self):
        queue, cp = read("review-queue.json")["items"], read("checkpoint.json")
        altered = copy.deepcopy(queue)
        altered[0]["name"] += " changed"
        with self.assertRaises(ValueError):
            remaining_work(altered, cp, cp["base_revision"])
        with self.assertRaises(ValueError):
            remaining_work(queue, cp, "0" * 40)

    def test_duplicate_completion_is_rejected(self):
        queue, cp = read("review-queue.json")["items"], copy.deepcopy(read("checkpoint.json"))
        cp["completed_review_work_ids"].append(cp["completed_review_work_ids"][0])
        with self.assertRaises(ValueError):
            remaining_work(queue, cp, cp["base_revision"])

    def mutated_errors(self, name, mutate):
        with tempfile.TemporaryDirectory(prefix="fr-packet-") as temp:
            folder = Path(temp)
            for source in HERE.glob("*.json"):
                (folder / source.name).write_bytes(source.read_bytes())
            value = read(name, folder)
            mutate(value)
            (folder / name).write_text(json.dumps(value))
            return validate(folder)["errors"]

    def test_portfolio_membership_cannot_become_round_participation(self):
        def mutate(value):
            company = next(c for c in value["companies"] if any(e["participants"] for e in c["funding_events"]))
            event = next(e for e in company["funding_events"] if e["participants"])
            event["participants"][0]["evidence_basis"] = "portfolio_membership"
        self.assertTrue(any("portfolio" in e for e in self.mutated_errors("companies.json", mutate)))

    def test_planned_investor_not_promoted(self):
        def mutate(value):
            company = next(c for c in value["companies"] if c["name"] == "Pigment")
            event = next(e for e in company["funding_events"] if e.get("planned_participants"))
            event["participants"].append({**event["participants"][0], "name": "NVIDIA"})
        self.assertTrue(any("planned investment" in e for e in self.mutated_errors("companies.json", mutate)))

    def test_unknown_funding_not_zero(self):
        def mutate(value):
            company = next(c for c in value["companies"] if c["funding_events"])
            company["funding_events"][0]["amount"] = 0
        self.assertTrue(any("zero" in e for e in self.mutated_errors("companies.json", mutate)))

    def test_alumni_do_not_inflate_accepted_startups(self):
        def mutate(value):
            company = next(c for c in value["companies"] if c["name"] == "Pasqal")
            company["disposition"] = "accepted_staged"
        self.assertTrue(any("listed group" in e for e in self.mutated_errors("companies.json", mutate)))

    def test_mixed_package_bound_cannot_become_exact_equity(self):
        def mutate(value):
            company = next(c for c in value["companies"] if c["name"] == "Verkor")
            company["funding_events"][0]["amount"] = 2000000000
        self.assertTrue(any("mixed package" in e for e in self.mutated_errors("companies.json", mutate)))

    def test_component_participation_keeps_parent_and_claim(self):
        def mutate(value):
            company = next(c for c in value["companies"] if c["name"] == "Quandela")
            component = company["funding_events"][0]["components"][0]
            component["parent_event_id"] = "missing-package"
        self.assertTrue(any("orphan parent" in e for e in self.mutated_errors("companies.json", mutate)))

    def test_historical_shareholder_is_not_a_fresh_subscription(self):
        def mutate(value):
            company = next(c for c in value["companies"] if c["name"] == "Quandela")
            component = company["funding_events"][0]["components"][0]
            component["participants"].append({**component["participants"][0], "name":"OMNES Capital"})
        self.assertTrue(any("matching atomic claim" in e for e in self.mutated_errors("companies.json", mutate)))

    def test_old_contributor_company_reference_is_not_a_canonical_binding(self):
        def mutate(value):
            claim = next(q for q in value["claims"] if q["field"] == "round_participant" and q["value"].get("company_id"))
            claim["value"]["company_id"] = "staging:fr:startup:stale"
        self.assertTrue(any("stale company" in e for e in self.mutated_errors("claims.json", mutate)))


if __name__ == "__main__":
    unittest.main()
