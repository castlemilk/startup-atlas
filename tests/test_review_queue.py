"""Tests for the human-in-the-loop validation queue (design section 5).

Loads scripts/build-review-queue.py via importlib (the tests/test_graph.py
pattern). All fixtures are built in tempfile dirs; nothing reads the live
crawl artifact or the repo data dir.
"""

import importlib.util
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, ROOT / path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


queue_mod = load("atlas_review_queue", "scripts/build-review-queue.py")


def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data), encoding="utf-8")


class FixtureCase(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(self._testMethodName)
        self._td = __import__("tempfile").TemporaryDirectory()
        self.addCleanup(self._td.cleanup)
        base = Path(self._td.name)
        self.data_dir = base / "data"
        self.artifact = base / "artifact"
        self.queue_path = base / "queue.json"
        self.identity_path = base / "identity.json"
        write_json(self.data_dir / "partners-reviewed.json", {
            "Square Peg": {"website": "https://www.squarepegcap.com/",
                           "description": "VC firm."},
            "Airtree": {"website": "https://www.airtree.vc/",
                        "description": "VC firm."},
        })
        write_json(self.data_dir / "partner-leads.json", ["Accel"])
        write_json(self.data_dir / "startup-research.json", {
            "startups": [
                {"name": "Gilmour Space",
                 "website": "https://www.gilmourspace.com/"},
                {"name": "Canva", "website": "https://www.canva.com/"},
            ]})
        write_json(self.data_dir / "graph.json", {
            "version": 1, "entities": [], "edges": [
                {"from": "partner:airtree", "to": "startup:canva",
                 "kind": "supports", "description": "Listed in portfolio",
                 "source": "https://www.airtree.vc/companies",
                 "confidence": 0.30},
                {"from": "partner:square-peg", "to": "startup:canva",
                 "kind": "supports", "description": "Listed in portfolio",
                 "source": "https://www.squarepegcap.com/portfolio",
                 "confidence": 0.80},
            ], "funding_rounds": [], "articles": []})
        write_json(self.artifact / "latest-partners.json", {
            "candidates": [
                {"name": "Square Peg Capital", "reported_type": "Venture Capital",
                 "provider": "Test", "source_url": "https://example.com/dir",
                 "website_candidate": "", "existing_lead_exact": False},
                {"name": "Airtree", "reported_type": "Venture Capital",
                 "provider": "Test", "source_url": "https://example.com/dir",
                 "website_candidate": "", "existing_lead_exact": False},
            ]})
        write_json(self.artifact / "latest-profiles.json", {
            "candidates": [
                {"partner": "Airtree", "kind": "companies",
                 "name": "Gilmour Space Technologies",
                 "candidate_url": "https://www.airtree.vc/portfolio/gilmour",
                 "source_url": "https://www.airtree.vc/portfolio"},
                {"partner": "Airtree", "kind": "companies", "name": "Canva",
                 "candidate_url": "https://www.airtree.vc/portfolio/canva",
                 "source_url": "https://www.airtree.vc/portfolio"},
                {"partner": "Square Peg", "kind": "companies",
                 "name": "NewCo One",
                 "candidate_url": "https://example.com/newco-one",
                 "source_url": "https://example.com/portfolio"},
            ]})
        write_json(self.artifact / "latest-news.json", {
            "candidates": [
                {"startup": "Airwallex",
                 "title": "Airwallex secures $320 million in Series H funding",
                 "url": "https://example.com/news/airwallex-series-h",
                 "discovered_from": "https://example.com/newsroom",
                 "published_hint": "2026-11-20",
                 "checked_at": "2026-11-23T07:14:55+00:00",
                 "amount_mentions": [
                     {"mention": "$320 million",
                      "normalised": {"value": 320000000.0,
                                     "currency": None}},
                     {"mention": "$11 billion",
                      "normalised": {"value": 11000000000.0,
                                     "currency": None}},
                 ]},
                {"startup": "Bugcrowd",
                 "title": "Bugcrowd launches a new product",
                 "url": "https://example.com/news/bugcrowd-launch",
                 "discovered_from": "https://example.com/newsroom",
                 "published_hint": "", "checked_at": "2026-11-23T07:14:57+00:00",
                 "amount_mentions": []},
            ]})

    def build(self, run="44"):
        return queue_mod.build(self.artifact, run, self.queue_path,
                               self.data_dir)


class GuardTests(unittest.TestCase):
    def test_self_merge_is_never_plausible(self):
        self.assertFalse(queue_mod.merge_is_plausible(
            "partner:greylock", "partner:greylock"))

    def test_generic_token_only_match_is_not_plausible(self):
        self.assertFalse(queue_mod.merge_is_plausible(
            "partner:1616-ventures", "partner:645-ventures"))
        self.assertFalse(queue_mod.merge_is_plausible(
            "partner:acir-foundation", "partner:foundation"))

    def test_distinctive_token_match_is_plausible(self):
        self.assertTrue(queue_mod.merge_is_plausible(
            "partner:square-peg-capital", "partner:square-peg"))
        self.assertTrue(queue_mod.merge_is_plausible(
            "startup:gilmour-space-technologies",
            "startup:gilmour-space"))

    def test_slug_containment_match_is_plausible(self):
        self.assertTrue(queue_mod.merge_is_plausible(
            "partner:box-group", "partner:boxgroup"))
        self.assertTrue(queue_mod.merge_is_plausible(
            "partner:ycombinator", "partner:y-combinator"))


class BuildTests(FixtureCase):
    def test_generic_only_merge_is_not_queued(self):
        # "Apex Ventures" shares only the generic token "ventures" with
        # the reviewed "Index Ventures": the matcher scores it in the
        # review band, but the queue guard drops it.
        reviewed = json.loads(
            (self.data_dir / "partners-reviewed.json").read_text())
        reviewed["Index Ventures"] = {"website": "https://indexventures.com/",
                                      "description": "VC firm."}
        write_json(self.data_dir / "partners-reviewed.json", reviewed)
        partners = json.loads(
            (self.artifact / "latest-partners.json").read_text())
        partners["candidates"].append(
            {"name": "Apex Ventures", "reported_type": "Venture Capital",
             "provider": "Test", "source_url": "https://example.com/dir",
             "website_candidate": "", "existing_lead_exact": False})
        write_json(self.artifact / "latest-partners.json", partners)
        _, added, _ = self.build()
        self.assertFalse(any(e["id"] == "merge:partner:apex-ventures"
                             for e in added))

    def test_self_merge_is_not_queued(self):
        # "Greylock" is a registry entity (via identity.json) but not a
        # lead or reviewed partner, so the matcher proposes it against
        # itself; the guard drops the self-merge.
        write_json(self.data_dir / "identity.json", {
            "version": 1, "generated_at": "2026-11-23T00:00:00Z",
            "source_revision": None,
            "entities": {
                "partner:greylock": {
                    "name": "Greylock", "kind": "partner", "aliases": [],
                    "identity_key": "greylock.com",
                    "identity_basis": "website-host", "merged_from": [],
                    "updated_at": "2026-11-23T00:00:00Z"}},
            "merges": []})
        partners = json.loads(
            (self.artifact / "latest-partners.json").read_text())
        partners["candidates"].append(
            {"name": "Greylock", "reported_type": "Venture Capital",
             "provider": "Test", "source_url": "https://example.com/dir",
             "website_candidate": "", "existing_lead_exact": False})
        write_json(self.artifact / "latest-partners.json", partners)
        _, added, _ = self.build()
        self.assertFalse(any(e["id"] == "merge:partner:greylock"
                             for e in added))

    def test_producers_emit_expected_kinds(self):
        queue, added, skipped = self.build()
        by_kind = {}
        for entry in added:
            by_kind.setdefault(entry["kind"], []).append(entry)
        # Two review-band merges: Square Peg Capital + Gilmour Space Tech.
        self.assertEqual(len(by_kind.get("merge", [])), 2)
        self.assertTrue(all(0.65 <= e["confidence"] <= 0.90
                            for e in by_kind["merge"]))
        # One low-confidence edge (0.30); the 0.80 edge is not queued.
        self.assertEqual(len(by_kind.get("edge", [])), 1)
        self.assertEqual(by_kind["edge"][0]["confidence"], 0.30)
        # One draft funding fact (Airwallex Series H); the product
        # launch has no funding signal and is not queued.
        self.assertEqual(len(by_kind.get("fact", [])), 1)
        draft = by_kind["fact"][0]["draft_round"]
        self.assertEqual(draft["startup"], "Airwallex")
        self.assertEqual(draft["amount"], 320000000.0)
        self.assertEqual(draft["stage"], "Series H")
        self.assertEqual(draft["date"], "2026-11-20")
        # One startup-lead (NewCo One); Canva is already in the index
        # and Gilmour Space Technologies is proposed as a merge, not a lead.
        self.assertEqual(len(by_kind.get("startup-lead", [])), 1)
        self.assertEqual(by_kind["startup-lead"][0]["subject"],
                         "startup:newco-one")
        self.assertEqual(skipped, 0)

    def _bio_row(self, name, company, url, reason):
        return {"partner": company, "company": company,
                "kind": "professional-bio", "name": name,
                "candidate_url": "https://example.com/team",
                "source_url": "https://example.com/team",
                "checked_at": "2026-11-25T21:10:00+00:00",
                "role": "Co-founder", "bio": "Builds things.",
                "social_candidates": [],
                "headshot_candidate": {
                    "candidate_url": url,
                    "source_url": "https://example.com/team",
                    "status": "not_fetched", "review_required": True,
                    "reason": reason}}

    def test_headshots_come_from_company_profiles_artifact(self):
        # professional-bio rows are emitted by the company-profiles
        # mode, not profiles mode: the producer must read that artifact
        # or no headshot can ever queue (round-2 critique F1).
        write_json(self.artifact / "latest-company-profiles.json", {
            "candidates": [
                self._bio_row("Melanie Perkins", "Canva",
                              "https://example.com/melanie.jpg",
                              "Rights and image review required"),
                self._bio_row("Casey Ellis", "Bugcrowd",
                              "https://cdn.example.net/casey.jpg",
                              "External asset host requires separate review"),
                # A bio row without a headshot candidate is not queued.
                {"company": "Canva", "kind": "professional-bio",
                 "name": "No Photo", "source_url": "https://example.com/t"},
            ]})
        queue, added, skipped = self.build()
        headshots = [e for e in added if e["kind"] == "headshot"]
        self.assertEqual(len(headshots), 2)
        by_subject = {e["subject"]: e for e in headshots}
        same_host = by_subject["person:melanie-perkins"]
        self.assertEqual(same_host["confidence"], 0.80)
        self.assertEqual(same_host["headshot"]["candidate_url"],
                         "https://example.com/melanie.jpg")
        self.assertEqual(same_host["headshot"]["company"], "Canva")
        external = by_subject["person:casey-ellis"]
        self.assertEqual(external["confidence"], 0.50)

    def test_headshots_deduped_across_artifacts(self):
        row = self._bio_row("Melanie Perkins", "Canva",
                            "https://example.com/melanie.jpg",
                            "Rights and image review required")
        write_json(self.artifact / "latest-company-profiles.json",
                   {"candidates": [row]})
        write_json(self.artifact / "latest-profiles.json", {
            "candidates": [
                *json.loads((self.artifact / "latest-profiles.json")
                            .read_text(encoding="utf-8"))["candidates"],
                row]})
        queue, added, skipped = self.build()
        headshots = [e for e in added if e["kind"] == "headshot"]
        self.assertEqual(len(headshots), 1)

    def test_headshots_skip_founders_with_recorded_photo(self):
        # Coverage rule: a founder who already records a photo_url in
        # the reviewed data is not a gap and must never queue, however
        # often the crawl re-captures a candidate for them. A founder
        # with no recorded photo still queues.
        write_json(self.data_dir / "startup-research.json", {
            "startups": [
                {"name": "Gilmour Space",
                 "website": "https://www.gilmourspace.com/"},
                {"name": "Canva", "website": "https://www.canva.com/",
                 "founders": [{"name": "Melanie Perkins",
                               "photo_url":
                                   "https://example.com/melanie.png"}]},
            ]})
        write_json(self.artifact / "latest-company-profiles.json", {
            "candidates": [
                self._bio_row("Melanie Perkins", "Canva",
                              "https://example.com/melanie.jpg",
                              "Rights and image review required"),
                self._bio_row("Casey Ellis", "Bugcrowd",
                              "https://cdn.example.net/casey.jpg",
                              "External asset host requires separate review"),
            ]})
        queue, added, skipped = self.build()
        headshots = [e for e in added if e["kind"] == "headshot"]
        self.assertEqual([e["subject"] for e in headshots],
                         ["person:casey-ellis"])

    def test_headshots_come_from_portraits_artifact(self):
        # The portraits mode carries the same bio rows plus staging;
        # when it is the only artifact present (company-profiles step
        # failed or was reused), headshots must still queue.
        write_json(self.artifact / "latest-portraits.json", {
            "candidates": [
                self._bio_row("Melanie Perkins", "Canva",
                              "https://example.com/melanie.jpg",
                              "Rights and image review required"),
            ]})
        queue, added, skipped = self.build()
        headshots = [e for e in added if e["kind"] == "headshot"]
        self.assertEqual(len(headshots), 1)
        self.assertEqual(headshots[0]["subject"], "person:melanie-perkins")

    def test_dedup_on_rerun(self):
        _, added_first, _ = self.build()
        queue, added_second, skipped_second = self.build()
        self.assertEqual(len(added_second), 0)
        self.assertGreater(skipped_second, 0)
        self.assertEqual(len(queue["entries"]), len(added_first))

    def test_rejected_entry_never_reproposed_for_identical_evidence(self):
        queue, added, _ = self.build()
        lead = next(e for e in added
                    if e["kind"] == "startup-lead"
                    and e["subject"] == "startup:newco-one")
        queue_mod.decide(queue, lead["id"], "rejected", "tester",
                         "not a real startup")
        queue_mod.save_queue(queue, self.queue_path)
        queue2, added2, _ = self.build()
        self.assertFalse(any(e["id"] == lead["id"] for e in added2))
        self.assertFalse(any(e["kind"] == "startup-lead"
                             for e in added2))
        self.assertEqual(
            next(e for e in queue2["entries"]
                 if e["id"] == lead["id"])["status"], "rejected")

    def test_rejected_entry_reproposed_when_evidence_changes(self):
        queue, added, _ = self.build()
        lead = next(e for e in added
                    if e["kind"] == "startup-lead"
                    and e["subject"] == "startup:newco-one")
        queue_mod.decide(queue, lead["id"], "rejected", "tester",
                         "not a real startup")
        queue_mod.save_queue(queue, self.queue_path)
        profiles = json.loads(
            (self.artifact / "latest-profiles.json").read_text())
        for row in profiles["candidates"]:
            if row["name"] == "NewCo One":
                row["source_url"] = "https://example.com/other-portfolio"
        write_json(self.artifact / "latest-profiles.json", profiles)
        _, added2, _ = self.build()
        reproposed = [e for e in added2 if e["kind"] == "startup-lead"]
        self.assertEqual(len(reproposed), 1)
        self.assertNotEqual(reproposed[0]["id"], lead["id"])

    def test_startup_lead_cap_of_100(self):
        rows = []
        for i in range(150):
            rows.append({"partner": "Airtree", "kind": "companies",
                         "name": f"CapTest {i:03d}",
                         "candidate_url": f"https://example.com/cap{i}",
                         "source_url": "https://example.com/portfolio"})
        write_json(self.artifact / "latest-profiles.json",
                   {"candidates": rows})
        # Reviewed startup-research still excludes only Canva/Gilmour.
        _, added, _ = self.build()
        leads = [e for e in added if e["kind"] == "startup-lead"]
        self.assertEqual(len(leads), 100)

    def test_polluted_lead_names_are_cleaned_to_company_name(self):
        # #462: run-44 style labels bake a theme heading and/or the
        # company's marketing description into the name. The queue key
        # must be the company name only, derived from the profile URL.
        rows = [
            {"partner": "Main Sequence", "kind": "companies",
             "name": "Decarbonise the planet Avarni AI-powered carbon "
                     "management for your supply chain",
             "candidate_url": "https://www.mseq.vc/portfolio/avarni",
             "source_url": "https://www.mseq.vc/portfolio"},
            {"partner": "Brandon Capital", "kind": "companies",
             "name": "Currus Biologics Developing the next generation "
                     "of CAR T-cell therapies to treat solid cancers",
             "candidate_url":
                 "https://brandoncapital.vc/portfolio/currus-biologics/",
             "source_url": "https://brandoncapital.vc/investment-portfolio/"},
            # A genuinely long name whose slug words do not appear in
            # the text is left untouched.
            {"partner": "Airtree", "kind": "companies",
             "name": "Some Very Long Named Australian Technology "
                     "Company Holdings Group",
             "candidate_url": "https://example.com/portfolio/other-co",
             "source_url": "https://example.com/portfolio"},
        ]
        write_json(self.artifact / "latest-profiles.json",
                   {"candidates": rows})
        _, added, _ = self.build()
        leads = {e["subject_key"] for e in added
                 if e["kind"] == "startup-lead"}
        self.assertEqual(leads, {
            "avarni", "currus-biologics",
            "some-very-long-named-australian-technology-company-holdings-group",
        })

    def test_theme_pages_are_not_startup_leads(self):
        # #460: Madrona's Companies nav lists theme pages (AI &
        # Intelligent Apps, Consumer & Marketplace, ...) that profile
        # other companies. A name built only from taxonomy words is a
        # theme label, never a company lead.
        rows = [
            {"partner": "Madrona", "kind": "companies",
             "name": "AI-Enabled Biotech",
             "candidate_url":
                 "https://www.madrona.com/companies/ai-enabled-biotech/",
             "source_url": "https://www.madrona.com/companies/"},
            {"partner": "Madrona", "kind": "companies",
             "name": "Consumer & Marketplace",
             "candidate_url":
                 "https://www.madrona.com/companies/consumer-marketplace/",
             "source_url": "https://www.madrona.com/companies/"},
            {"partner": "Madrona", "kind": "companies",
             "name": "Data & Infrastructure",
             "candidate_url":
                 "https://www.madrona.com/companies/data-infrastructure/",
             "source_url": "https://www.madrona.com/companies/"},
            # A real company on the same listing still leads.
            {"partner": "Madrona", "kind": "companies",
             "name": "Vilya",
             "candidate_url": "https://www.madrona.com/companies/vilya/",
             "source_url": "https://www.madrona.com/companies/"},
        ]
        write_json(self.artifact / "latest-profiles.json",
                   {"candidates": rows})
        _, added, _ = self.build()
        leads = {e["subject_key"] for e in added
                 if e["kind"] == "startup-lead"}
        self.assertEqual(leads, {"vilya"})

    def test_listing_page_subject_is_not_a_startup_lead(self):
        # #460: the Partech "Full Profile" lead aggregated ~30
        # different companies' profile URLs as one subject's evidence.
        rows = [
            {"partner": "Partech", "kind": "companies",
             "name": "Full Profile",
             "candidate_url":
                 f"https://partechpartners.com/companies/company-{i}",
             "source_url": "https://partechpartners.com/companies"}
            for i in range(12)
        ]
        # The same company listed by several partners, one profile URL
        # each, is a genuine lead and survives the guard.
        for partner in ("Airtree", "Blackbird", "Square Peg"):
            rows.append(
                {"partner": partner, "kind": "companies",
                 "name": "Multi Partner Co",
                 "candidate_url":
                     f"https://{partner.lower().replace(' ', '')}.example"
                     "/portfolio/multi-partner-co",
                 "source_url":
                     f"https://{partner.lower().replace(' ', '')}.example"
                     "/portfolio"})
        write_json(self.artifact / "latest-profiles.json",
                   {"candidates": rows})
        _, added, _ = self.build()
        leads = {e["subject_key"] for e in added
                 if e["kind"] == "startup-lead"}
        self.assertEqual(leads, {"multi-partner-co"})

    def test_ui_label_is_not_a_startup_lead(self):
        # #501: a single "Full Profile" card slipped past the #460
        # listing guard (too few URLs to look like a listing scrape)
        # and queued as startup-lead:full-profile with the card's
        # company page as its website. UI link text is not a name:
        # the rows are dropped (fresh crawls slug-derive the real
        # company name at extraction), and a real lead alongside
        # them still queues.
        rows = [
            {"partner": "Partech", "kind": "companies",
             "name": "Full Profile",
             "candidate_url": "https://partechpartners.com/companies/co2-ai",
             "source_url": "https://partechpartners.com/companies"},
            {"partner": "Partech", "kind": "companies",
             "name": "( FULL PROFILE )",
             "candidate_url": "https://partechpartners.com/companies",
             "source_url": "https://partechpartners.com/companies"},
            {"partner": "Partech", "kind": "companies",
             "name": "Co2 Ai",
             "candidate_url": "https://partechpartners.com/companies/co2-ai",
             "source_url": "https://partechpartners.com/companies"},
        ]
        write_json(self.artifact / "latest-profiles.json",
                   {"candidates": rows})
        _, added, _ = self.build()
        leads = {e["subject_key"] for e in added
                 if e["kind"] == "startup-lead"}
        self.assertEqual(leads, {"co2-ai"})

    def test_is_ui_label_unit(self):
        self.assertTrue(queue_mod.is_ui_label("Full Profile"))
        self.assertTrue(queue_mod.is_ui_label("( FULL PROFILE )"))
        self.assertTrue(queue_mod.is_ui_label("Learn More"))
        self.assertFalse(queue_mod.is_ui_label("Full Circle"))
        self.assertFalse(queue_mod.is_ui_label("Profile Software"))

    def test_same_name_distinct_companies_are_split(self):
        # #487: two different Sydney startups share the name Alloy.
        # Blackbird's profile slug is alloy-index (Alloy, formerly
        # Index); Square Peg's is alloy (the robot-data company).
        # Keying leads on the name alone merged them into one lead.
        rows = [
            {"partner": "Blackbird Ventures", "kind": "companies",
             "name": "Alloy",
             "candidate_url":
                 "https://www.blackbird.vc/portfolio/alloy-index",
             "source_url": "https://www.blackbird.vc/portfolio"},
            {"partner": "Square Peg", "kind": "companies",
             "name": "Alloy",
             "candidate_url": "https://www.squarepeg.vc/portfolio/alloy",
             "source_url": "https://www.squarepeg.vc/portfolio"},
        ]
        write_json(self.artifact / "latest-profiles.json",
                   {"candidates": rows})
        _, added, _ = self.build()
        leads = {e["subject_key"]: e for e in added
                 if e["kind"] == "startup-lead"}
        self.assertEqual(set(leads), {"alloy", "alloy-index"})
        self.assertEqual(leads["alloy"]["mentions"]["partners"],
                         ["Square Peg"])
        self.assertEqual(leads["alloy-index"]["mentions"]["partners"],
                         ["Blackbird Ventures"])
        self.assertIn("https://www.squarepeg.vc/portfolio/alloy",
                      leads["alloy"]["evidence"])
        self.assertNotIn("https://www.blackbird.vc/portfolio/alloy-index",
                         leads["alloy"]["evidence"])
        self.assertIn("https://www.blackbird.vc/portfolio/alloy-index",
                      leads["alloy-index"]["evidence"])

    def test_same_company_slug_variants_stay_one_lead(self):
        # #487 guard-rail: generic-suffix slug variants of one company
        # (foo vs foo-labs) are one identity, not two leads, and the
        # multi-partner mention still merges.
        rows = [
            {"partner": partner, "kind": "companies", "name": "Foo",
             "candidate_url": f"https://{host}/portfolio/{suffix}",
             "source_url": f"https://{host}/portfolio"}
            for partner, host, suffix in (
                ("Airtree", "airtree.example", "foo"),
                ("Blackbird Ventures", "blackbird.example", "foo-labs"),
                ("Square Peg", "squarepeg.example", "foo"))
        ]
        write_json(self.artifact / "latest-profiles.json",
                   {"candidates": rows})
        _, added, _ = self.build()
        leads = [e for e in added if e["kind"] == "startup-lead"]
        self.assertEqual(len(leads), 1)
        self.assertEqual(leads[0]["subject_key"], "foo")
        self.assertEqual(len(leads[0]["mentions"]["partners"]), 3)

    def test_candidate_identity_unit(self):
        identity = queue_mod._candidate_identity
        self.assertEqual(
            identity("https://www.blackbird.vc/portfolio/alloy-index"),
            "alloy-index")
        self.assertEqual(
            identity("https://www.squarepeg.vc/portfolio/alloy"), "alloy")
        self.assertEqual(identity("https://example.com/portfolio/foo-labs"),
                         "foo")
        self.assertEqual(identity("https://example.com/portfolio/foo-2"),
                         "foo")
        self.assertIsNone(identity("https://example.com/"))
        self.assertIsNone(identity(""))
        self.assertIsNone(identity(None))

    def test_is_theme_label_unit(self):
        is_theme = queue_mod.is_theme_label
        self.assertTrue(is_theme("AI & Intelligent Apps"))
        self.assertTrue(is_theme("Data & Infrastructure"))
        self.assertFalse(is_theme("Vilya"))
        self.assertFalse(is_theme("NewCo One"))
        # One taxonomy word plus a distinctive word is a name.
        self.assertFalse(is_theme("Data Zoo"))
        # A single taxonomy word alone is not enough to fire.
        self.assertFalse(is_theme("Fintech"))

    def test_clean_lead_name_unit(self):
        clean = queue_mod.clean_lead_name
        self.assertEqual(
            clean("Decarbonise the planet MGA Thermal Continuous "
                  "renewable thermal energy to decarbonise industry",
                  "https://www.mseq.vc/portfolio/mga-thermal"),
            "Mga Thermal")
        # Short names and slug-free labels pass through unchanged.
        self.assertEqual(clean("Avarni", "https://www.mseq.vc/portfolio/avarni"),
                         "Avarni")
        self.assertEqual(
            clean("A long label with no slug words in it at all whatsoever",
                  "https://example.com/portfolio/zzz"),
            "A long label with no slug words in it at all whatsoever")
        self.assertEqual(clean("Anything Long " * 5, ""), "Anything Long " * 5)

    def test_summary_contains_entry_counts(self):
        queue, added, skipped = self.build()
        summary = queue_mod.build_summary(queue, added, skipped, "44")
        self.assertIn("run 44", summary)
        self.assertIn("merge", summary)
        self.assertIn("startup-lead", summary)
        self.assertIn(str(len(added)), summary)
        self.assertIn("merge:partner:square-peg-capital", summary)

    def test_edge_without_confidence_is_scored_not_guessed(self):
        # A single secondary source scores 0.50, so it is not queued.
        graph = json.loads((self.data_dir / "graph.json").read_text())
        for edge in graph["edges"]:
            edge.pop("confidence", None)
        write_json(self.data_dir / "graph.json", graph)
        _, added, _ = self.build()
        self.assertEqual([e for e in added if e["kind"] == "edge"], [])


class NewsDraftTests(FixtureCase):
    """F6: draft rounds need an attributed startup, and investors come
    only from the article's own round sentences."""

    def _append_news(self, candidate):
        news = json.loads(
            (self.artifact / "latest-news.json").read_text())
        news["candidates"].append(candidate)
        write_json(self.artifact / "latest-news.json", news)

    def _drafts(self, added):
        return [e["draft_round"] for e in added
                if e["kind"] == "fact" and "draft_round" in e]

    def _series_f_candidate(self, evidence_text):
        return {
            "startup": "Airwallex",
            "title": "Airwallex raises $200 million in Series F funding",
            "url": "https://example.com/news/airwallex-series-f",
            "discovered_from": "https://example.com/trade-press",
            "published_hint": "2026-11-21",
            "checked_at": "2026-11-23T07:15:00+00:00",
            "amount_mentions": [
                {"mention": "$200 million",
                 "normalised": {"value": 200000000.0, "currency": None}}],
            "evidence": {"funding_stage": [
                {"text": evidence_text,
                 "source": "https://example.com/news/airwallex-series-f"}]}}

    def test_unattributed_news_item_produces_no_draft(self):
        # The crawl leaves startup empty when no tracked startup can be
        # named; a round without a company is not a fact.
        self._append_news({
            "startup": None, "attribution": "unattributed",
            "source_name": "Startup Daily",
            "title": "Zephyr Labs raises $3 million seed round",
            "url": "https://example.com/news/zephyr-seed",
            "discovered_from": "https://example.com/trade-press",
            "published_hint": "2026-11-21",
            "checked_at": "2026-11-23T07:16:00+00:00",
            "amount_mentions": [
                {"mention": "$3 million",
                 "normalised": {"value": 3000000.0, "currency": None}}]})
        _, added, _ = self.build()
        amounts = [d["amount"] for d in self._drafts(added)]
        self.assertNotIn(3000000.0, amounts)
        self.assertTrue(all(d["startup"] for d in self._drafts(added)))

    def test_named_lead_and_participants_are_extracted(self):
        # "Square Peg" and "Airtree" are recorded investors in the
        # fixture data dir (partners-reviewed.json).
        self._append_news(self._series_f_candidate(
            "The Series F round was led by Square Peg, with "
            "participation from Airtree."))
        _, added, _ = self.build()
        draft = next(d for d in self._drafts(added)
                     if d["amount"] == 200000000.0)
        self.assertEqual(draft["lead_investor"], "Square Peg")
        self.assertEqual(draft["participants"], ["Airtree"])
        self.assertEqual(draft["investors_source"],
                         "crawl-extracted (unverified)")

    def test_boilerplate_backer_list_is_not_extracted(self):
        # The sentence names recorded investors and carries round
        # words, but it is about-the-company boilerplate ("existing
        # investors"), not this round's syndicate.
        self._append_news(self._series_f_candidate(
            "The company's existing investors include Square Peg and "
            "Airtree, both long-standing backers since the seed round."))
        _, added, _ = self.build()
        draft = next(d for d in self._drafts(added)
                     if d["amount"] == 200000000.0)
        self.assertNotIn("lead_investor", draft)
        self.assertNotIn("participants", draft)
        self.assertNotIn("investors_source", draft)

    def test_unrecorded_investor_name_is_not_extracted(self):
        # "Zephyr Capital" is named as lead in the article's own words
        # but is not an investor Atlas records, so it cannot be
        # checked and is left for human research.
        self._append_news(self._series_f_candidate(
            "The Series F round was led by Zephyr Capital."))
        _, added, _ = self.build()
        draft = next(d for d in self._drafts(added)
                     if d["amount"] == 200000000.0)
        self.assertNotIn("lead_investor", draft)


class PersonLinkedinTests(FixtureCase):
    """#366 slice 3: same-LinkedIn-key person pairs queue as merges."""

    def _person_registry(self, entities, merges=()):
        write_json(self.data_dir / "identity.json", {
            "version": 1, "generated_at": "2026-11-25T00:00:00Z",
            "source_revision": None, "entities": entities,
            "merges": list(merges)})

    def _person(self, name, key):
        return {"name": name, "kind": "person", "aliases": [],
                "identity_key": key, "identity_basis": "linkedin-url",
                "merged_from": [], "updated_at": "2026-11-25T00:00:00Z"}

    def test_linkedin_key_normalisation_is_shared(self):
        key = queue_mod.linkedin_key
        self.assertEqual(
            key("https://au.linkedin.com/in/Jane-Example/?trk=public"),
            "linkedin.com/in/jane-example")
        self.assertEqual(key("https://www.linkedin.com/company/acme"), "")
        self.assertEqual(key("https://example.com/in/jane"), "")
        self.assertEqual(key(""), "")

    def test_cross_firm_crawl_pair_with_exact_key_is_queued(self):
        # The registry already holds the same LinkedIn key under a
        # different name spelling; the crawl sees the URL (locale
        # subdomain + tracking params) at two firms. Previously the
        # exact match was dropped as "auto-merge, not queued",
        # although no path applies merges from unreviewed crawl rows.
        self._person_registry({
            "person:j-example": self._person(
                "J Example", "linkedin.com/in/jane-example")})
        rows = [
            {"partner": "Airtree", "kind": "people", "name": "Jane Example",
             "candidate_url": "https://au.linkedin.com/in/jane-example/",
             "source_url": "https://www.airtree.vc/team"},
            {"partner": "Square Peg", "kind": "people",
             "name": "Jane Example",
             "candidate_url":
                 "https://www.linkedin.com/in/jane-example?trk=public",
             "source_url": "https://www.squarepegcap.com/team"},
        ]
        write_json(self.artifact / "latest-profiles.json",
                   {"candidates": rows})
        _, added, _ = self.build()
        merges = [e for e in added if e["kind"] == "merge"
                  and e["subject"] == "person:jane-example"]
        self.assertEqual(len(merges), 1)
        self.assertEqual(merges[0]["confidence"], 1.0)
        self.assertEqual(merges[0]["subject_key"],
                         "linkedin.com/in/jane-example")
        self.assertIn("linkedin", merges[0]["candidates"][0]["basis"])

    def test_registry_same_key_different_name_pair_is_queued(self):
        self._person_registry({
            "person:jane-example": self._person(
                "Jane Example", "linkedin.com/in/jane-example"),
            "person:j-example": self._person(
                "J Example", "linkedin.com/in/jane-example")})
        _, added, _ = self.build()
        merges = [e for e in added if e["kind"] == "merge"
                  and e["subject_key"] == "linkedin.com/in/jane-example"]
        self.assertEqual(len(merges), 1)
        self.assertEqual(merges[0]["confidence"], 1.0)
        pair = {merges[0]["subject"], merges[0]["candidates"][0]["id"]}
        self.assertEqual(pair, {"person:jane-example", "person:j-example"})

    def test_registry_seed_merged_pair_is_not_queued(self):
        canonical = self._person("Jane Example",
                                 "linkedin.com/in/jane-example")
        canonical["merged_from"] = ["person:jane-example--airtree"]
        self._person_registry(
            {"person:jane-example": canonical,
             "person:jane-example--airtree": self._person(
                 "Jane Example", "linkedin.com/in/jane-example")},
            merges=[{"from": "person:jane-example--airtree",
                     "to": "person:jane-example", "basis": "linkedin-url",
                     "decided_by": "seed:reviewed-data",
                     "decided_at": "2026-11-25T00:00:00Z"}])
        _, added, _ = self.build()
        self.assertFalse(any(
            e["kind"] == "merge"
            and e["subject_key"] == "linkedin.com/in/jane-example"
            for e in added))


class DecideTests(FixtureCase):
    def test_approve_and_reject_transitions(self):
        queue, added, _ = self.build()
        merge = next(e for e in added if e["kind"] == "merge")
        decided = queue_mod.decide(queue, merge["id"], "approved", "ben",
                                   "same firm", self.identity_path)
        self.assertEqual(decided["status"], "approved")
        self.assertEqual(decided["decided_by"], "ben")
        self.assertEqual(decided["decision_note"], "same firm")
        self.assertIsNotNone(decided["decided_at"])
        fact = next(e for e in added if e["kind"] == "fact")
        queue_mod.decide(queue, fact["id"], "rejected", "ben", "no source")
        self.assertEqual(fact["status"], "rejected")

    def test_decide_rejects_bad_input(self):
        queue, added, _ = self.build()
        entry = added[0]
        with self.assertRaises(ValueError):
            queue_mod.decide(queue, "merge:nope", "approved", "ben")
        with self.assertRaises(ValueError):
            queue_mod.decide(queue, entry["id"], "maybe", "ben")
        queue_mod.decide(queue, entry["id"], "approved", "ben",
                         identity_path=self.identity_path)
        with self.assertRaises(ValueError):
            queue_mod.decide(queue, entry["id"], "rejected", "ben")

    def test_approved_merge_writes_identity_registry(self):
        queue, added, _ = self.build()
        merge = next(e for e in added if e["kind"] == "merge")
        winner = merge["candidates"][0]["id"]
        queue_mod.decide(queue, merge["id"], "approved", "ben",
                         "same firm", self.identity_path)
        registry = json.loads(self.identity_path.read_text())
        self.assertIn(merge["subject"],
                      registry["entities"][winner]["merged_from"])
        self.assertTrue(any(m["from"] == merge["subject"]
                            and m["to"] == winner
                            and m["decided_by"] == "ben"
                            for m in registry["merges"]))

    def test_defer_records_who_and_why_and_applies_nothing(self):
        queue, added, _ = self.build()
        merge = next(e for e in added if e["kind"] == "merge")
        deferred = queue_mod.decide(queue, merge["id"], "deferred", "ben",
                                    "need a second source for the firm",
                                    self.identity_path)
        self.assertEqual(deferred["status"], "deferred")
        self.assertEqual(deferred["decided_by"], "ben")
        self.assertEqual(deferred["decision_note"],
                         "need a second source for the firm")
        self.assertIsNotNone(deferred["decided_at"])
        # A deferral is not an approval: no registry write happens.
        self.assertFalse(self.identity_path.exists())

    def test_deferred_entry_can_be_decided_for_real(self):
        queue, added, _ = self.build()
        fact = next(e for e in added if e["kind"] == "fact")
        queue_mod.decide(queue, fact["id"], "deferred", "ben",
                         "awaiting the press release")
        decided = queue_mod.decide(queue, fact["id"], "approved", "ben",
                                   "press release confirms it")
        self.assertEqual(decided["status"], "approved")
        self.assertEqual(decided["decision_note"],
                         "press release confirms it")
        with self.assertRaises(ValueError):
            queue_mod.decide(queue, fact["id"], "deferred", "ben")

    def test_deferred_blocks_same_evidence_but_not_new_evidence(self):
        queue, added, _ = self.build()
        lead = next(e for e in added if e["kind"] == "startup-lead")
        queue_mod.decide(queue, lead["id"], "deferred", "ben",
                         "need more evidence")
        same = dict(lead, id="startup-lead:again", status="pending",
                    decided_by=None, decided_at=None, decision_note=None)
        self.assertFalse(queue_mod.add_entry(queue, same))
        refreshed = dict(same, id="startup-lead:refreshed",
                         evidence_fingerprint="different-fingerprint")
        self.assertTrue(queue_mod.add_entry(queue, refreshed))

    def test_approved_fact_does_not_edit_reviewed_files(self):
        before = (self.data_dir / "startup-research.json").read_text()
        queue, added, _ = self.build()
        fact = next(e for e in added if e["kind"] == "fact")
        queue_mod.decide(queue, fact["id"], "approved", "ben",
                         "verified", self.identity_path)
        self.assertEqual(fact["status"], "approved")
        self.assertEqual(fact["decided_by"], "ben")
        self.assertEqual(
            (self.data_dir / "startup-research.json").read_text(), before)
        self.assertFalse(self.identity_path.exists())


class WorkflowWiringTests(unittest.TestCase):
    def test_crawl_workflow_builds_the_queue_into_the_artifact(self):
        workflow = (ROOT / ".github" / "workflows"
                    / "partner-research.yml").read_text()
        self.assertIn("scripts/build-review-queue.py", workflow)
        self.assertIn("--queue research/crawl/review-queue.json", workflow)
        self.assertIn("--summary-md research/crawl/review-queue-summary.md",
                      workflow)

    def test_company_profiles_mode_is_wired_into_the_workflow(self):
        # Issue #535: the deep company-profiles mode runs for every
        # approved company seed in the scheduled workflow, appears in the
        # run summary, and is registered in every mode list that the
        # progress/bookkeeping consumers read.
        workflow = (ROOT / ".github" / "workflows"
                    / "partner-research.yml").read_text()
        self.assertIn(
            "crawl.py company-profiles "
            "--approved data/company-profile-seeds.csv", workflow)
        self.assertIn("'company-profiles', 'portraits'", workflow)
        self.assertIn(
            "'company-profiles'",
            (ROOT / "scripts" / "crawl_progress.py").read_text())
        self.assertIn(
            "'company-profiles': 'data/company-profile-seeds.csv'",
            (ROOT / "scripts" / "record_crawl_runs.py").read_text())
        self.assertIn(
            "'company-profiles'",
            (ROOT / "backend" / "mcp" / "crawl-status.mjs").read_text())

    def test_profiles_limit_is_derived_from_the_seed_csv(self):
        workflow = (ROOT / ".github" / "workflows"
                    / "partner-research.yml").read_text()
        self.assertNotIn("--limit 32", workflow)
        self.assertIn("partner-logo-seeds.csv", workflow)
        self.assertIn('--limit "$seeds"', workflow)


class SocialProducerTests(unittest.TestCase):
    """F5: crawled socials queue as ``social`` entries for known people.

    Until this producer existed the crawl captured socials in two
    places — professional-bio ``social_candidates`` and profiles-mode
    ``social`` rows — and nothing consumed either, so every recorded
    social came from a manual batch.
    """

    def setUp(self):
        self._td = __import__("tempfile").TemporaryDirectory()
        self.addCleanup(self._td.cleanup)
        base = Path(self._td.name)
        self.data_dir = base / "data"
        self.artifact = base / "artifact"
        write_json(self.data_dir / "startup-research.json", {
            "startups": [{
                "name": "Canva",
                "founders": [
                    {"name": "Melanie Perkins"},
                    {"name": "Cliff Obrecht",
                     "linkedin":
                         "https://www.linkedin.com/in/cliffobrecht"},
                ]}]})
        write_json(self.data_dir / "partner-profiles.json", {
            "Airtree": {"people": [
                {"name": "Elicia McDonald", "role": "CEO & Partner",
                 "socials": [{"label": "X",
                              "url": "https://twitter.com/eliciam",
                              "source": "https://www.airtree.vc/team"}]}]}})

    def produce(self):
        return queue_mod.produce_socials(self.artifact, self.data_dir, "48")

    def _bio_row(self, name, company, social_candidates):
        return {"company": company, "kind": "professional-bio",
                "name": name,
                "candidate_url": "https://example.com/team",
                "source_url": "https://example.com/team",
                "social_candidates": social_candidates}

    def _social_row(self, partner, name, url):
        return {"partner": partner, "kind": "social",
                "page_kind": "team", "name": name,
                "candidate_url": url,
                "source_url": "https://example.com/team",
                "review_required": True}

    def test_structured_candidate_queues(self):
        write_json(self.artifact / "latest-company-profiles.json", {
            "candidates": [self._bio_row(
                "Melanie Perkins", "Canva",
                ["https://www.linkedin.com/in/melanieperkins"])]})
        entries = self.produce()
        self.assertEqual(len(entries), 1)
        entry = entries[0]
        self.assertEqual(entry["kind"], "social")
        self.assertEqual(entry["id"],
                         "social:canva:melanie-perkins:linkedin")
        self.assertEqual(entry["subject"], "person:melanie-perkins")
        self.assertEqual(entry["status"], "pending")
        # Structured sameAs evidence from the company's own page is
        # the strongest crawl signal, but still conservative.
        self.assertEqual(entry["confidence"], 0.70)
        social = entry["social"]
        self.assertEqual(social["platform"], "linkedin")
        self.assertEqual(social["candidate_urls"],
                         ["https://www.linkedin.com/in/melanieperkins"])
        self.assertEqual(social["sources"], {
            "https://www.linkedin.com/in/melanieperkins":
                "https://example.com/team"})
        self.assertIsNone(social["conflict"])
        self.assertIn("https://www.linkedin.com/in/melanieperkins",
                      entry["evidence"])
        self.assertIn("https://example.com/team", entry["evidence"])

    def test_structured_candidate_queues_from_portraits_artifact(self):
        # The portraits artifact carries the same professional-bio
        # rows; social evidence must queue from it even when the
        # company-profiles artifact is absent.
        write_json(self.artifact / "latest-portraits.json", {
            "candidates": [self._bio_row(
                "Melanie Perkins", "Canva",
                ["https://www.linkedin.com/in/melanieperkins"])]})
        entries = self.produce()
        self.assertEqual(len(entries), 1)
        self.assertEqual(entries[0]["id"],
                         "social:canva:melanie-perkins:linkedin")

    def test_recorded_linkedin_respelled_is_not_requeued(self):
        # Locale subdomain + trailing slash: the identity key is the
        # same, so the recorded profile must not look new.
        write_json(self.artifact / "latest-company-profiles.json", {
            "candidates": [self._bio_row(
                "Cliff Obrecht", "Canva",
                ["https://au.linkedin.com/in/cliffobrecht/"])]})
        self.assertEqual(self.produce(), [])

    def test_conflicting_linkedin_is_flagged_distinctly(self):
        write_json(self.artifact / "latest-company-profiles.json", {
            "candidates": [self._bio_row(
                "Cliff Obrecht", "Canva",
                ["https://www.linkedin.com/in/cliff-obrecht-1a2b3c"])]})
        entries = self.produce()
        self.assertEqual(len(entries), 1)
        entry = entries[0]
        self.assertTrue(entry["subject_key"].endswith(":conflict"))
        self.assertEqual(entry["social"]["conflict"], {
            "recorded_urls": ["https://www.linkedin.com/in/cliffobrecht"]})
        self.assertEqual(entry["social"]["candidate_urls"],
                         ["https://www.linkedin.com/in/cliff-obrecht-1a2b3c"])
        self.assertEqual(entry["confidence"], 0.50)

    def test_profiles_social_row_queues(self):
        write_json(self.artifact / "latest-profiles.json", {
            "candidates": [self._social_row(
                "Airtree", "Elicia McDonald",
                "https://au.linkedin.com/in/eliciamcdonald")]})
        entries = self.produce()
        self.assertEqual(len(entries), 1)
        entry = entries[0]
        self.assertEqual(entry["id"],
                         "social:airtree:elicia-mcdonald:linkedin")
        self.assertEqual(entry["confidence"], 0.50)
        self.assertEqual(entry["social"]["via"], ["labelled-link"])

    def test_profiles_social_row_already_recorded_is_skipped(self):
        # Recorded as twitter.com/eliciam; the crawl's www. + trailing
        # slash spelling is the same profile.
        write_json(self.artifact / "latest-profiles.json", {
            "candidates": [self._social_row(
                "Airtree", "Elicia McDonald",
                "https://www.twitter.com/eliciam/")]})
        self.assertEqual(self.produce(), [])

    def test_unattributable_social_rows_are_skipped(self):
        write_json(self.artifact / "latest-profiles.json", {
            "candidates": [
                # A firm's own footer link: anchor text is not a person.
                self._social_row("Airtree", "LinkedIn",
                                 "https://www.linkedin.com/company/airtree"),
                self._social_row("Airtree", "Unknown Person",
                                 "https://twitter.com/unknownperson"),
            ]})
        self.assertEqual(self.produce(), [])

    def test_socials_deduped_across_artifacts(self):
        url = "https://www.linkedin.com/in/melanieperkins"
        write_json(self.artifact / "latest-company-profiles.json", {
            "candidates": [self._bio_row("Melanie Perkins", "Canva", [url])]})
        write_json(self.artifact / "latest-profiles.json", {
            "candidates": [self._social_row("Airtree", "Melanie Perkins",
                                            url)]})
        entries = self.produce()
        self.assertEqual(len(entries), 1)
        self.assertEqual(entries[0]["social"]["candidate_urls"], [url])
        # The structured sighting sets the group's confidence.
        self.assertEqual(entries[0]["confidence"], 0.70)
        self.assertEqual(entries[0]["social"]["via"],
                         ["labelled-link", "structured"])

    def test_ambiguous_name_is_skipped(self):
        write_json(self.data_dir / "startup-research.json", {
            "startups": [
                {"name": "Canva", "founders": [{"name": "Melanie Perkins"}]},
                {"name": "OtherCo",
                 "founders": [{"name": "Melanie Perkins"}]},
            ]})
        write_json(self.artifact / "latest-profiles.json", {
            "candidates": [self._social_row(
                "Airtree", "Melanie Perkins",
                "https://www.linkedin.com/in/melanieperkins")]})
        self.assertEqual(self.produce(), [])

    def test_socials_never_auto_approve_under_shipped_config(self):
        write_json(self.artifact / "latest-company-profiles.json", {
            "candidates": [
                self._bio_row("Melanie Perkins", "Canva",
                              ["https://www.linkedin.com/in/melanieperkins"]),
                self._bio_row("Cliff Obrecht", "Canva",
                              ["https://www.linkedin.com/in/cliff-obrecht-x"]),
            ]})
        entries = self.produce()
        self.assertEqual(len(entries), 2)
        gating = queue_mod._review_gating
        self.assertIsNotNone(gating)
        config = json.loads(
            (ROOT / "data" / "review-gating.json").read_text())
        queue = {"version": 1, "entries": entries}
        decided = gating.apply_gating(queue, config)
        self.assertEqual(decided, [])
        self.assertTrue(all(e["status"] == "pending" for e in entries))
        # Conflicts sort ahead of plain proposals on the worklist.
        self.assertEqual(entries[0]["social"]["conflict"], {
            "recorded_urls": ["https://www.linkedin.com/in/cliffobrecht"]})


if __name__ == "__main__":
    unittest.main()
