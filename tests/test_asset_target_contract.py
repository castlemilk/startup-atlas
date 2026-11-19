"""Offline target-mapping fixtures; no live Atlas read, mutation or approval."""

import copy
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch


SPEC = importlib.util.spec_from_file_location(
    "asset_targeting", Path(__file__).resolve().parents[1] / "contracts/mcp_assets/targeting.py"
)
targeting = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(targeting)

SOURCE_COMMIT = "a" * 40
ASSET_COMMIT = "b" * 40
# These are deliberately opaque synthetic read tokens, not a second
# implementation of backend/hosted/src/startup-edit.mjs::recordRevision.
RECORD_A = "1" * 64
RECORD_B = "2" * 64
LOCAL_SNAPSHOT = "c" * 64


def fixture(mode="hosted", portrait=False):
    snapshot = SOURCE_COMMIT if mode == "hosted" else LOCAL_SNAPSHOT
    origin = "repository" if mode == "hosted" else "local_repository"
    startups = [
        {"name": "Fixture Company", "description": "Synthetic company A.",
         "source": "https://example.com/fixture", "reviewed_at": "2026-01-01",
         "founders": [{"name": "Pat Example", "source": "https://example.com/team"}]},
        {"name": "Other Company", "description": "Synthetic company B.",
         "source": "https://example.com/other", "reviewed_at": "2026-01-01",
         "founders": [{"name": "Casey Example", "source": "https://example.com/other/team"}]},
    ]
    reads = []
    for index, (identifier, revision) in enumerate((("startup:fixture-company", RECORD_A), ("startup:other-company", RECORD_B))):
        reads.append({"source_pointer": f"/startups/{index}", "read": {
            "id": identifier, "record": copy.deepcopy(startups[index]),
            "recordRevision": revision, "revision": snapshot, "origin": origin,
            "sourceFile": "data/startup-research.json", "schemaVersion": "startup-edit-v1", "published": False,
        }})
    authority = {
        "mode": mode, "snapshot_revision": snapshot, "repository_commit": SOURCE_COMMIT,
        "research": {"reviewed": "2026-01-01", "startups": startups}, "record_reads": reads,
        "graph_origin": "repository_snapshot" if mode == "hosted" else "local_snapshot",
        "graph_read_revision": snapshot,
        "graph": {
            "source_revision": "9" * 40,
            "entities": [
                {"id": "startup:fixture-company", "kind": "startup", "name": "Fixture Company"},
                {"id": "startup:other-company", "kind": "startup", "name": "Other Company"},
                {"id": "person:pat-example", "kind": "person", "name": "Pat Example"},
                {"id": "person:casey-example", "kind": "person", "name": "Casey Example"},
            ],
            "edges": [
                {"from": "person:pat-example", "to": "startup:fixture-company", "kind": "founded"},
                {"from": "person:casey-example", "to": "startup:other-company", "kind": "founded"},
            ],
        },
        "mapping": {
            "schema": "atlas.asset-target-mapping.v0",
            "source_snapshot_revision": snapshot, "graph_read_revision": snapshot,
            "review": {"status": "reviewed", "reviewer": "Synthetic fixture reviewer",
                       "evidence": "Fixture-only mapping; not authenticated or real-world identity evidence."},
            "founders": [
                {"record_id": "startup:fixture-company", "founder_pointer": "/founders/0",
                 "founder_name": "Pat Example", "person_id": "person:pat-example"},
                {"record_id": "startup:other-company", "founder_pointer": "/founders/0",
                 "founder_name": "Casey Example", "person_id": "person:casey-example"},
            ],
        },
    }
    plan = {
        "edited_record_id": "startup:fixture-company", "expected_record_revision": RECORD_A,
        "expected_snapshot_revision": snapshot, "asset_repository_commit": ASSET_COMMIT,
        "subject_id": "person:pat-example" if portrait else "startup:fixture-company",
        "role": "portrait" if portrait else "logo",
        "target": {"kind": "founder-portrait", "founder_pointer": "/founders/0", "founder_name": "Pat Example"}
                  if portrait else {"kind": "startup-logo"},
    }
    return plan, authority


class TargetContractTests(unittest.TestCase):
    def reject(self, plan, authority, code=None):
        with self.assertRaises(targeting.TargetError) as caught:
            targeting.validate_target(plan, authority)
        result = caught.exception.as_dict()
        self.assertEqual(set(result), {"code", "path", "message"})
        self.assertTrue(result["path"].startswith("/"))
        self.assertTrue(result["message"])
        if code:
            self.assertEqual(result["code"], code)

    def test_startup_logo_candidate_retains_all_distinct_revisions(self):
        plan, authority = fixture()
        result = targeting.validate_target(plan, authority)
        self.assertEqual(result["target_pointer"], "/logo")
        self.assertEqual(result["subject_id"], result["edited_record_id"])
        self.assertEqual(result["expected_record_revision"], RECORD_A)
        self.assertEqual(result["expected_snapshot_revision"], SOURCE_COMMIT)
        self.assertEqual(result["source_repository_commit"], SOURCE_COMMIT)
        self.assertEqual(result["asset_repository_commit"], ASSET_COMMIT)
        self.assertEqual(result["authorization"], "none")
        self.assertIs(result["strict_record_preview_required"], True)
        self.assertIs(result["record_edit_constructed"], False)
        self.assertIs(result["published"], False)
        self.assertNotIn("patch", result)
        self.assertNotIn("validationToken", result)

    def test_portrait_has_person_subject_and_distinct_edited_startup(self):
        plan, authority = fixture(portrait=True)
        result = targeting.validate_target(plan, authority)
        self.assertEqual(result["edited_record_id"], "startup:fixture-company")
        self.assertEqual(result["subject_id"], "person:pat-example")
        self.assertEqual(result["target_pointer"], "/founders/0/photo_url")
        self.assertEqual(result["expected_record_revision"], RECORD_A)

    def test_mapping_is_supplied_and_no_name_to_id_fallback_exists(self):
        plan, authority = fixture(portrait=True)
        authority["mapping"]["founders"].pop(0)
        self.reject(plan, authority, "INCOMPLETE_PERSON_MAPPING")

    def test_scoped_team_person_cannot_be_converted_to_startup_founder_by_mapping(self):
        plan, authority = fixture(portrait=True)
        exact_id = "person:pat-example--fixture-firm"
        plan["subject_id"] = exact_id
        authority["mapping"]["founders"][0]["person_id"] = exact_id
        authority["graph"]["entities"][2]["id"] = exact_id
        authority["graph"]["edges"][0]["from"] = exact_id
        before = copy.deepcopy((plan, authority))
        self.reject(plan, authority, "UNSUPPORTED_PERSON_BINDING")
        self.assertEqual((plan, authority), before)
        self.assertEqual(plan["subject_id"], exact_id)

    def test_scoped_team_nodes_remain_distinct_supporting_graph_evidence(self):
        plan, authority = fixture(portrait=True)
        team_id = "person:pat-example--fixture-firm"
        authority["graph"]["entities"].append({"id": team_id, "kind": "person", "name": "Pat Example"})
        authority["graph"]["edges"].append({"from": team_id, "to": "partner:fixture-firm", "kind": "team_member"})
        result = targeting.validate_target(plan, authority)
        self.assertEqual(result["subject_id"], "person:pat-example")
        self.assertEqual(result["target_pointer"], "/founders/0/photo_url")

    def test_founder_array_position_is_guarded_by_whole_record_revision(self):
        plan, authority = fixture(portrait=True)
        record = authority["research"]["startups"][0]
        record["founders"].insert(0, {"name": "Jordan Example", "source": "https://example.com/team"})
        authority["record_reads"][0]["read"].update(record=copy.deepcopy(record), recordRevision="4" * 64)
        authority["mapping"]["founders"][0]["founder_pointer"] = "/founders/1"
        authority["mapping"]["founders"].append({"record_id": "startup:fixture-company", "founder_pointer": "/founders/0",
                                                   "founder_name": "Jordan Example", "person_id": "person:jordan-example"})
        authority["graph"]["entities"].append({"id": "person:jordan-example", "kind": "person", "name": "Jordan Example"})
        authority["graph"]["edges"].append({"from": "person:jordan-example", "to": "startup:fixture-company", "kind": "founded"})
        self.reject(plan, authority, "STALE_RECORD")
        plan["expected_record_revision"] = "4" * 64
        self.reject(plan, authority, "SUBJECT_MISMATCH")
        plan["target"]["founder_pointer"] = "/founders/1"
        self.assertEqual(targeting.validate_target(plan, authority)["target_pointer"], "/founders/1/photo_url")

    def test_wrong_logo_subject_is_rejected(self):
        plan, authority = fixture()
        plan["subject_id"] = "startup:other-company"
        self.reject(plan, authority, "SUBJECT_MISMATCH")

    def test_portrait_cannot_be_switched_to_top_level_logo(self):
        plan, authority = fixture(portrait=True)
        plan["target"]["kind"] = "startup-logo"
        self.reject(plan, authority, "ROLE_MISMATCH")
        plan, authority = fixture()
        plan["target"]["kind"] = "founder-portrait"
        self.reject(plan, authority, "SUBJECT_MISMATCH")

    def test_exact_nested_founder_name_and_pointer_are_required(self):
        for field, value in (("founder_name", "pat example"), ("founder_name", "Casey Example"),
                             ("founder_pointer", "/founders/1"), ("founder_pointer", "/founders/-1"),
                             ("founder_pointer", "/founders/00"), ("founder_pointer", "../founders/0")):
            plan, authority = fixture(portrait=True)
            plan["target"][field] = value
            with self.subTest(field=field, value=value):
                self.reject(plan, authority)

    def test_person_from_another_record_cannot_attach_here(self):
        plan, authority = fixture(portrait=True)
        plan["subject_id"] = "person:casey-example"
        self.reject(plan, authority, "SUBJECT_MISMATCH")

    def test_whole_record_revision_conflict_is_separate_from_snapshot(self):
        plan, authority = fixture()
        plan["expected_record_revision"] = "3" * 64
        self.reject(plan, authority, "STALE_RECORD")
        plan, authority = fixture()
        plan["expected_snapshot_revision"] = "d" * 40
        self.reject(plan, authority, "STALE_SNAPSHOT")

    def test_local_snapshot_is_not_reused_as_git_commit(self):
        plan, authority = fixture(mode="local", portrait=True)
        result = targeting.validate_target(plan, authority)
        self.assertEqual(result["expected_snapshot_revision"], LOCAL_SNAPSHOT)
        self.assertEqual(result["source_repository_commit"], SOURCE_COMMIT)
        self.assertEqual(result["asset_repository_commit"], ASSET_COMMIT)
        plan["asset_repository_commit"] = LOCAL_SNAPSHOT
        self.reject(plan, authority, "INVALID_REVISION")

    def test_hosted_and_local_snapshot_tokens_are_not_interchangeable(self):
        for mode, wrong in (("hosted", LOCAL_SNAPSHOT), ("local", SOURCE_COMMIT)):
            plan, authority = fixture(mode=mode)
            plan["expected_snapshot_revision"] = wrong
            with self.subTest(mode=mode):
                self.reject(plan, authority, "INVALID_REVISION")
        plan, authority = fixture()
        authority["repository_commit"] = ASSET_COMMIT
        self.reject(plan, authority, "REVISION_MISMATCH")

    def test_incomplete_and_duplicate_source_inventory_are_rejected(self):
        plan, authority = fixture()
        authority["record_reads"].pop()
        self.reject(plan, authority, "INCOMPLETE_SOURCE_INVENTORY")
        for change in ("id", "pointer"):
            plan, authority = fixture()
            if change == "id":
                authority["record_reads"][1]["read"]["id"] = "startup:fixture-company"
            else:
                authority["record_reads"][1]["source_pointer"] = "/startups/0"
            with self.subTest(change=change):
                self.reject(plan, authority, "AMBIGUOUS_TARGET")

    def test_read_must_match_complete_source_record_and_origin(self):
        plan, authority = fixture()
        authority["record_reads"][0]["read"]["record"]["description"] = "Projection summary, not source."
        self.reject(plan, authority, "SOURCE_MISMATCH")
        for key, value in (("origin", "published_graph"), ("revision", "c" * 40),
                           ("sourceFile", "data/graph.json"), ("published", True)):
            plan, authority = fixture()
            authority["record_reads"][0]["read"][key] = value
            with self.subTest(key=key):
                self.reject(plan, authority)

    def test_source_comparison_distinguishes_json_booleans_from_numbers(self):
        for source_value, read_value in ((False, 0), (True, 1), ([False], [0]), ({"flag": True}, {"flag": 1})):
            plan, authority = fixture()
            authority["research"]["startups"][0]["fixture_value"] = source_value
            authority["record_reads"][0]["read"]["record"]["fixture_value"] = read_value
            with self.subTest(source_value=source_value, read_value=read_value):
                self.reject(plan, authority, "SOURCE_MISMATCH")

    def test_json_integer_and_decimal_encodings_keep_numeric_semantics(self):
        plan, authority = fixture()
        authority["research"]["startups"][0]["founded_year"] = 2020.0
        authority["record_reads"][0]["read"]["record"]["founded_year"] = 2020
        self.assertEqual(targeting.validate_target(plan, authority)["expected_record_revision"], RECORD_A)

    def test_non_json_and_unbounded_source_records_are_rejected(self):
        cyclic = []
        cyclic.append(cyclic)
        deep = []
        for _ in range(34):
            deep = [deep]
        invalid_values = (
            float("nan"), float("inf"), b"bytes", {"not-a-json-set"}, (1, 2),
            {1: "nonstring-key"}, cyclic, deep, [0] * 20001, "x" * 1000001, 1 << 1025,
        )
        for number, value in enumerate(invalid_values):
            plan, authority = fixture()
            # Reusing the same value must not allow Python identity/equality to
            # bless a non-JSON object as complete matching source evidence.
            authority["research"]["startups"][0]["fixture_value"] = value
            authority["record_reads"][0]["read"]["record"]["fixture_value"] = value
            with self.subTest(case=number):
                self.reject(plan, authority, "INVALID_TARGET_EVIDENCE")

    def test_graph_only_entity_never_becomes_an_editable_record(self):
        plan, authority = fixture()
        plan["edited_record_id"] = plan["subject_id"] = "startup:graph-only"
        authority["graph"]["entities"].append({"id": "startup:graph-only", "kind": "startup", "name": "Graph Only"})
        self.reject(plan, authority, "TARGET_NOT_FOUND")

    def test_graph_retrieval_and_reviewed_mapping_must_be_pinned(self):
        for field, value in (("graph_read_revision", "d" * 40), ("graph_origin", "published_graph")):
            plan, authority = fixture()
            authority[field] = value
            with self.subTest(field=field):
                self.reject(plan, authority, "UNPINNED_GRAPH")
        for field in ("source_snapshot_revision", "graph_read_revision"):
            plan, authority = fixture()
            authority["mapping"][field] = "d" * 40
            with self.subTest(field=field):
                self.reject(plan, authority, "UNPINNED_MAPPING")

    def test_unreviewed_or_unexplained_mapping_does_not_suffice(self):
        plan, authority = fixture()
        authority["mapping"]["review"]["status"] = "candidate"
        self.reject(plan, authority, "UNREVIEWED_MAPPING")
        for key in ("reviewer", "evidence"):
            plan, authority = fixture()
            authority["mapping"]["review"][key] = ""
            with self.subTest(key=key):
                self.reject(plan, authority)

    def test_source_graph_disagreement_and_duplicate_person_ids_are_rejected(self):
        plan, authority = fixture()
        authority["graph"]["entities"][0]["name"] = "Unrelated Company"
        self.reject(plan, authority, "IDENTITY_CONFLICT")
        plan, authority = fixture(portrait=True)
        authority["graph"]["entities"].append(copy.deepcopy(authority["graph"]["entities"][2]))
        self.reject(plan, authority, "AMBIGUOUS_TARGET")

    def test_person_mapping_requires_node_name_and_founded_edge(self):
        for change in ("name", "node", "edge", "source-name"):
            plan, authority = fixture(portrait=True)
            if change == "name":
                authority["graph"]["entities"][2]["name"] = "A different Pat"
            elif change == "node":
                authority["graph"]["entities"].pop(2)
            elif change == "edge":
                authority["graph"]["edges"][0]["kind"] = "team_member"
            else:
                authority["mapping"]["founders"][0]["founder_name"] = "PAT EXAMPLE"
            with self.subTest(change=change):
                self.reject(plan, authority, "IDENTITY_CONFLICT")

    def test_ambiguous_mapping_and_omitted_other_founders_are_rejected(self):
        plan, authority = fixture(portrait=True)
        authority["mapping"]["founders"].append(copy.deepcopy(authority["mapping"]["founders"][0]))
        self.reject(plan, authority, "AMBIGUOUS_TARGET")
        plan, authority = fixture(portrait=True)
        authority["mapping"]["founders"].pop(1)
        self.reject(plan, authority, "INCOMPLETE_PERSON_MAPPING")

    def test_shared_person_from_source_inventory_requires_migration(self):
        plan, authority = fixture(portrait=True)
        other = authority["research"]["startups"][1]
        other["founders"][0]["name"] = "Pat Example"
        authority["record_reads"][1]["read"]["record"] = copy.deepcopy(other)
        authority["mapping"]["founders"][1].update(founder_name="Pat Example", person_id="person:pat-example")
        authority["graph"]["edges"][1]["from"] = "person:pat-example"
        self.reject(plan, authority, "SHARED_PERSON_REQUIRES_MIGRATION")
        # A company-only image candidate does not change inherited shared people.
        plan.update(role="logo", subject_id="startup:fixture-company", target={"kind": "startup-logo"})
        self.assertEqual(targeting.validate_target(plan, authority)["target_pointer"], "/logo")

    def test_shared_person_visible_only_in_graph_is_not_ignored(self):
        plan, authority = fixture(portrait=True)
        authority["graph"]["edges"].append({"from": "person:pat-example", "to": "startup:graph-only", "kind": "founded"})
        self.reject(plan, authority, "SHARED_PERSON_REQUIRES_MIGRATION")

    def test_same_source_name_cannot_evade_guard_using_distinct_mapping_ids(self):
        plan, authority = fixture(portrait=True)
        authority["research"]["startups"][1]["founders"][0]["name"] = "Pat Example"
        authority["record_reads"][1]["read"]["record"] = copy.deepcopy(authority["research"]["startups"][1])
        authority["mapping"]["founders"][1]["founder_name"] = "Pat Example"
        authority["graph"]["entities"][3]["name"] = "Pat Example"
        self.reject(plan, authority, "SHARED_PERSON_REQUIRES_MIGRATION")

    def test_unknown_fields_and_path_shaped_ids_fail_closed(self):
        plan, authority = fixture()
        plan["approved"] = True
        self.reject(plan, authority)
        for key, value in (("edited_record_id", "../startup:fixture-company"),
                           ("subject_id", "/startup:fixture-company"),
                           ("asset_repository_commit", "../commit")):
            plan, authority = fixture()
            plan[key] = value
            with self.subTest(key=key):
                self.reject(plan, authority)

    def test_malformed_mapping_key_and_huge_pointer_return_contract_errors(self):
        plan, authority = fixture(portrait=True)
        authority["mapping"]["founders"][0]["record_id"] = []
        self.reject(plan, authority, "INVALID_REVISION")
        plan, authority = fixture(portrait=True)
        plan["target"]["founder_pointer"] = "/founders/" + "9" * 5000
        self.reject(plan, authority, "INVALID_TARGET")
        plan, authority = fixture(portrait=True)
        authority["mapping"]["founders"][0]["founder_pointer"] = "/founders/" + "9" * 5000
        self.reject(plan, authority, "INVALID_TARGET")

    def test_no_inputs_are_modified_and_no_io_or_network_is_performed(self):
        plan, authority = fixture(portrait=True)
        previous = copy.deepcopy((plan, authority))
        with patch("builtins.open", side_effect=AssertionError("No file I/O")), \
             patch("os.open", side_effect=AssertionError("No filesystem descriptors")), \
             patch("socket.getaddrinfo", side_effect=AssertionError("No DNS")), \
             patch("socket.create_connection", side_effect=AssertionError("No network")), \
             patch("subprocess.run", side_effect=AssertionError("No delegated execution")):
            result = targeting.validate_target(plan, authority)
        self.assertEqual((plan, authority), previous)
        self.assertEqual(result["evidence"], "supplied-offline-snapshot-only")


if __name__ == "__main__":
    unittest.main()
