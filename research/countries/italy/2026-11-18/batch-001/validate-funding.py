#!/usr/bin/env python3
"""Validate the local Italy funding companion, including adversarial regressions.

Run: python validate-funding.py
Requires the already available Python jsonschema package. No network or Atlas
production access is used. Outputs funding-validation.json beside this script.
"""

from __future__ import annotations

import copy
import datetime as dt
import hashlib
import importlib.metadata
import importlib.util
import json
from pathlib import Path
import re
import sys
import unicodedata

import jsonschema


ROOT = Path(__file__).resolve().parent
sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location("italy_funding_builder", ROOT / "build-funding.py")
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


def normalized_name(name):
    return re.sub(r"\s+", " ", unicodedata.normalize("NFKC", name)).strip().casefold()


def audit(document, schema, packets):
    issues = []

    def fail(code, detail):
        issues.append({"code": code, "detail": detail})

    validator = jsonschema.Draft202012Validator(schema, format_checker=jsonschema.FormatChecker())
    for error in validator.iter_errors(document):
        fail("json_schema", "/" + "/".join(map(str, error.absolute_path)) + ": " + error.message)
    if issues:
        return issues

    if len(document["input_packets"]) != 3 or {p["packet_id"] for p in document["input_packets"]} != set(builder.LANES):
        fail("input_manifest", "Exactly the three reviewed research lanes must be bound.")
    for entry in document["input_packets"]:
        if entry["path"] != f"evidence/{entry['packet_id']}.json":
            fail("input_manifest", "Unexpected input path.")
            continue
        if entry["sha256"] != builder.sha((ROOT / entry["path"]).read_bytes()):
            fail("input_hash", entry["path"])

    source_map = {s["source_id"]: s for s in document["sources"]}
    if len(source_map) != len(document["sources"]):
        fail("source_duplicate", "Source IDs must be unique.")
    raw_sources = {s["id"]: s for packet in packets.values() for s in packet["sources"]}
    claims = {c["claim_id"]: c for packet in packets.values() for c in packet["claims"]}

    for source in document["sources"]:
        original = raw_sources.get(source["source_id"])
        if not original:
            fail("source_missing", source["source_id"])
            continue
        for field in ["url", "title", "publisher", "source_kind", "accessed", "retrieved_at", "published_on", "acquisition"]:
            if source[field] != original.get(field):
                fail("source_changed", source["source_id"] + ":" + field)
        if original.get("accessed") is not True or original.get("acquisition") != "web_tool_page_read":
            fail("source_not_accessed", source["source_id"])
        expected_context = {k: original[k] for k in ["retrieval_time_precision", "retrieval_window", "retrieval_window_start", "timestamp_basis"] if k in original}
        if source["retrieval_context"] != expected_context:
            fail("retrieval_precision", source["source_id"])

    company_map = {c["company_id"]: c for c in document["companies"]}
    event_map = {e["event_id"]: e for e in document["funding_events"]}
    observation_map = {o["observation_id"]: o for o in document["financing_observations"]}
    records = {**event_map, **observation_map}
    if len(company_map) != len(document["companies"]):
        fail("company_duplicate", "Duplicate company IDs.")
    if len(event_map) != len(document["funding_events"]):
        fail("event_duplicate", "Duplicate event IDs.")
    if len(observation_map) != len(document["financing_observations"]):
        fail("observation_duplicate", "Duplicate observation IDs.")
    if set(event_map) & set(observation_map):
        fail("event_observation_collision", "One ID cannot mean both an accepted event and another observation.")
    if len(company_map) != 24 or sum(c["startup_candidate"] for c in company_map.values()) != 22:
        fail("company_scope", "Expected reviewed scope is 24, with 22 startup candidates.")
    for cid, company in company_map.items():
        if company["startup_candidate"] != (cid not in builder.EXCLUDED):
            fail("company_scope", cid)
        expected_events = [e["event_id"] for e in document["funding_events"] if e["company_id"] == cid]
        expected_observations = [o["observation_id"] for o in document["financing_observations"] if o["company_id"] == cid]
        if company["event_ids"] != expected_events or company["observation_ids"] != expected_observations:
            fail("company_event_index", cid)
        expected_coverage = "reviewed_subset" if expected_events else "no_accepted_round_in_this_pass"
        if company["coverage_disposition"] != expected_coverage:
            fail("unknown_not_zero", cid)

    raw_rounds = {}
    for lane, packet in packets.items():
        for ci, company in enumerate(packet["companies"]):
            key = "funding_events" if "funding_events" in company else "funding_rounds"
            for ri, event in enumerate(company.get(key, [])):
                eid = event.get("event_id", event.get("id"))
                raw_rounds[eid] = (lane, f"/companies/{ci}/{key}/{ri}", event)
    mapped_round_ids = set(event_map) | {o["observation_id"] for o in observation_map.values() if o["kind"] == "debt_capacity"}
    if mapped_round_ids != set(raw_rounds):
        fail("raw_round_coverage", "Every reviewed raw funding record must have one, and only one, normalized placement.")

    sections = ["companies", "sources", "funding_events", "financing_observations", "participations", "conflicts", "context_observations"]
    for section in sections:
        for index, row in enumerate(document[section]):
            label = f"{section}/{index}"
            reference = row["raw_ref"]
            try:
                raw = builder.resolve(packets[reference["packet_id"]], reference["pointer"])
            except (KeyError, IndexError, ValueError, TypeError):
                fail("raw_pointer", label)
                continue
            if builder.sha(builder.canonical(raw).encode()) != reference["fragment_sha256"]:
                fail("raw_fragment_hash", label)
            if "company_id" in row and section != "companies":
                if row["company_id"] not in company_map:
                    fail("company_link", label)
                elif row["startup_candidate"] != company_map[row["company_id"]]["startup_candidate"]:
                    fail("historical_scope", label)
            if "source_ids" not in row:
                continue
            if not row["source_ids"]:
                fail("missing_provenance", label)
            for sid in row["source_ids"]:
                if sid not in source_map or source_map[sid]["accessed"] is not True:
                    fail("source_link", label + ":" + sid)
            for claim_id in row["claim_ids"]:
                if claim_id not in claims or claims[claim_id]["entity_id"] != row["company_id"]:
                    fail("claim_entity_link", label + ":" + claim_id)
            fields = []
            for mapping in row["field_mappings"]:
                fields.append(mapping["field"])
                try:
                    output_value = builder.resolve(row, mapping["field"])
                    input_values = [builder.resolve(packets[reference["packet_id"]], p) for p in mapping["raw_pointers"]]
                except (KeyError, IndexError, ValueError, TypeError):
                    fail("field_pointer", label + mapping["field"])
                    continue
                if not set(mapping["source_ids"]).issubset(row["source_ids"]):
                    fail("field_source_scope", label + mapping["field"])
                for claim_id in mapping["claim_ids"]:
                    if claim_id not in claims or claims[claim_id]["entity_id"] != row["company_id"]:
                        fail("field_claim_scope", label + mapping["field"])
                if mapping["mode"] == "direct" and (len(input_values) != 1 or output_value != input_values[0]):
                    fail("direct_field_changed", label + mapping["field"])
                typed_unknown_date = output_value == {"value": None, "precision": "unknown"}
                if output_value is not None and not typed_unknown_date and mapping["mode"] in {"direct", "conservative_normalization"} and not mapping["source_ids"]:
                    fail("field_missing_source", label + mapping["field"])
            if len(fields) != len(set(fields)):
                fail("duplicate_field_mapping", label)

    def check_amount(row, label):
        amount = row["amount"]
        values = [amount[k] for k in ["value", "lower_bound", "upper_bound"]]
        if any(v is not None for v in values) and amount["currency"] is None:
            fail("amount_currency_pair", label)
        if any(v == 0 for v in values if v is not None):
            fail("unknown_not_zero", label)
        precision = amount["precision"]
        if precision == "lower_bound":
            if amount["value"] is not None or amount["lower_bound"] is None or amount["upper_bound"] is not None or amount["bound_inclusive"] is not False:
                fail("amount_bound", label)
        elif precision == "upper_bound":
            if amount["value"] is not None or amount["upper_bound"] is None or amount["lower_bound"] is not None or amount["bound_inclusive"] is not True:
                fail("amount_bound", label)
        elif precision in {"conflict", "currency_unresolved", "unknown"}:
            if any(v is not None for v in values):
                fail("unresolved_scalar", label)
            if precision in {"conflict", "currency_unresolved"} and amount["currency"] is not None:
                fail("unresolved_currency", label)
        else:
            if amount["value"] is None or amount["lower_bound"] is not None or amount["upper_bound"] is not None:
                fail("amount_precision", label)
        if precision not in {"lower_bound", "upper_bound"} and amount["bound_inclusive"] is not None:
            fail("amount_bound", label)

    raw_event_pointers = []
    for event in document["funding_events"]:
        eid = event["event_id"]
        check_amount(event, eid)
        raw_event_pointers.append((event["raw_ref"]["packet_id"], event["raw_ref"]["pointer"]))
        if not event["claim_ids"]:
            fail("event_claim_missing", eid)
        if event["transaction_kind"] == "equity" and (eid not in builder.EXPLICIT_EQUITY or event["instrument_basis"] != "explicit_source_wording"):
            fail("instrument_inference", eid)
        if event["transaction_kind"] == "unknown" and event["instrument_basis"] != "not_established":
            fail("instrument_inference", eid)
        if event["raw_transaction_kind"] in {"unknown", "financing_unspecified"} and event["transaction_kind"] == "equity":
            fail("instrument_inference", eid)
        for related in event["related_event_ids"]:
            if related not in event_map or event_map[related]["company_id"] != event["company_id"]:
                fail("related_event", eid)
        required_maps = {"/stage", "/transaction_kind", "/announced", "/closed", "/event_date",
                         "/amount/value", "/amount/currency", "/amount/precision", "/amount/lower_bound", "/amount/upper_bound"}
        if not required_maps.issubset({m["field"] for m in event["field_mappings"]}):
            fail("funding_field_coverage", eid)
        for field in ["announced", "closed", "event_date"]:
            value = event[field]["value"]
            if value is None and field not in event["null_reasons"]:
                fail("unknown_reason", eid + ":" + field)
            if event[field]["precision"] == "month":
                try:
                    dt.datetime.strptime(value, "%Y-%m")
                except ValueError:
                    fail("date_precision", eid)
    if len(raw_event_pointers) != len(set(raw_event_pointers)):
        fail("event_raw_duplicate", "A raw event was copied into multiple distinct event IDs.")

    for observation in document["financing_observations"]:
        oid = observation["observation_id"]
        check_amount(observation, oid)
        for linked in observation["linked_event_ids"]:
            if linked not in event_map or event_map[linked]["company_id"] != observation["company_id"]:
                fail("observation_event_link", oid)
        if observation["kind"] == "proposed_capital_increase" and (observation["completion_status"] != "proposal_not_completed" or observation["amount"]["precision"] != "upper_bound"):
            fail("proposal_completion", oid)
        if observation["kind"] == "debt_capacity" and (observation["completion_status"] != "capacity_not_drawdown" or observation["transaction_kind"] != "debt"):
            fail("debt_capacity_scope", oid)

    seen_participations, seen_participation_ids = set(), set()
    for p in document["participations"]:
        pid = p["participation_id"]
        duplicate_key = (p["target_id"], normalized_name(p["name"]))
        if duplicate_key in seen_participations or pid in seen_participation_ids:
            fail("participation_duplicate", pid)
        seen_participations.add(duplicate_key)
        seen_participation_ids.add(pid)
        target_map = event_map if p["target_kind"] == "funding_event" else observation_map
        target = target_map.get(p["target_id"])
        if not target:
            fail("participant_event_link", pid)
            continue
        if target["company_id"] != p["company_id"]:
            fail("participant_company_link", pid)
        if not set(p["source_ids"]).issubset(target["source_ids"]):
            fail("participant_source_scope", pid)
        if p["target_kind"] == "funding_event":
            if p["role"] not in {"lead", "participant"}:
                fail("participant_role_scope", pid)
            matching = [claims[c] for c in p["claim_ids"] if c in claims and claims[c]["field"] == "round_participant"
                        and claims[c].get("value", {}).get("event_id") == p["target_id"]
                        and claims[c].get("value", {}).get("name") == p["name"]
                        and claims[c].get("value", {}).get("role") == p["role"]]
            if not matching:
                fail("participant_explicit_evidence", pid)
            if matching and not any(c.get("accessed") is True and c.get("source_id") in p["source_ids"] and c.get("status") == "reviewed_staged" for c in matching):
                fail("participant_review_access", pid)
        elif p["role"] not in {"lender", "prospective_lender", "subscriber_commitment"}:
            fail("observation_role_scope", pid)
        if p["role"] == "subscriber_commitment" and target.get("kind") != "proposed_capital_increase":
            fail("commitment_scope", pid)
        if p["role"] == "prospective_lender" and target.get("completion_status") != "not_yet_fully_finalized":
            fail("prospective_lender_scope", pid)

    groups = {g["group_id"]: g for g in document["round_groups"]}
    if len(groups) != len(document["round_groups"]):
        fail("group_duplicate", "Group IDs must be unique.")
    for group in groups.values():
        for rid in group["record_ids"]:
            if rid not in records:
                fail("group_record_link", rid)
            elif records[rid]["round_group_id"] != group["group_id"] or records[rid]["company_id"] != group["company_id"]:
                fail("group_scope", rid)
        if group["preferred_total_record_id"] is not None and group["preferred_total_record_id"] not in group["record_ids"]:
            fail("group_preferred_total", group["group_id"])
    for rid, record in records.items():
        gid = record["round_group_id"]
        if gid is not None and (gid not in groups or rid not in groups[gid]["record_ids"]):
            fail("group_membership", rid)

    def expect(condition, code, detail):
        if not condition:
            fail(code, detail)

    def e(eid):
        return event_map.get(eid, {})

    def o(oid):
        return observation_map.get(oid, {})

    # These are independently reviewed acceptance cases, rather than a second
    # implementation of the builder's loops. They protect the important traps.
    try:
        dorbit = e("it-d-orbit-series-c-2024")
        dorbit_total = o("it-d-orbit-series-c-2024:observation:later_same_round_total")
        expect(dorbit["amount"]["value"] == 100000000 and dorbit["amount"]["precision"] == "approximate"
               and dorbit_total["amount"]["value"] == 150000000 and dorbit_total["announced"]["value"] is None
               and groups[dorbit["round_group_id"]]["policy"] == "non_additive_overlapping_observations",
               "dorbit_nonadditivity", "First close is included in the later same-round total; final exact date is unknown.")
        energy = e("it-energy-dome-series-b-2023")
        energy_first = o("it-energy-dome-series-b-2023:component:1")
        expect(energy["amount"]["value"] == 55000000 and energy_first["amount"]["value"] == 40000000
               and energy_first["closed"] == {"value": "2023-04", "precision": "month"}
               and groups[energy["round_group_id"]]["policy"] == "non_additive_overlapping_observations",
               "energy_nonadditivity", "EUR40m is inside EUR55m; no independent second-tranche amount is calculated.")
        aiko = e("it-aiko-series-a-2024-2025")
        aiko_initial = o("it-aiko-series-a-2024-2025:observation:earlier_same_round_total")
        aiko_extension = o("it-aiko-series-a-2024-2025:observation:extension_component")
        expect(aiko["amount"]["value"] == 4000000 and aiko["amount"]["precision"] == "reported_rounded_total"
               and aiko_initial["amount"]["value"] == 3500000 and aiko_extension["amount"]["value"] == 520000
               and aiko["closed"]["value"] is None
               and groups[aiko["round_group_id"]]["policy"] == "non_additive_overlapping_observations",
               "aiko_nonadditivity", "Do not sum overlapping observations, derive EUR4.02m, or use the EUR5m target.")
        for p in document["participations"]:
            if p["target_id"] == aiko["event_id"] and "Deep Blue Ventures" in p["name"]:
                expect(p["participation_scope"] == "initial closing" and p["source_ids"] == ["it-deep-18"],
                       "aiko_tranche_scope", "Initial lead role remains source-specific.")
        leaf = e("it-leaf-space-series-b-2023")
        leaf_debt = o("it-leaf-space-series-b-2023:observation:venture_debt_availability")
        leaf_total = o("it-leaf-space-series-b-2023:observation:mixed-aggregate")
        expect(leaf["amount"]["value"] == 20000000 and leaf["transaction_kind"] == "equity"
               and leaf_debt["amount"]["value"] == 15000000 and leaf_debt["completion_status"] == "not_yet_fully_finalized"
               and leaf_total["amount"]["value"] == 35000000 and leaf_total["transaction_kind"] == "mixed"
               and groups[leaf["round_group_id"]]["policy"] == "separate_instruments_and_statuses",
               "leaf_instrument_scope", "EUR35m is not completed equity; the debt remains separate and unfinished.")
        caracol = e("it-caracol-series-b-2025")
        expect(caracol["amount"]["value"] is None and caracol["amount"]["currency"] is None
               and caracol["amount"]["precision"] == "currency_unresolved"
               and caracol["primary_amount"] is None and caracol["secondary_amount"] is None,
               "caracol_currency_split", "The dollar denomination and primary/secondary split remain unknown.")
        caracol_a = e("it-caracol-series-a-2023")
        date_map = next(m for m in caracol_a["field_mappings"] if m["field"] == "/announced")
        expect(date_map["source_ids"] == ["it-deep-09"] and caracol_a["announced"]["value"] == "2023-03-29",
               "caracol_date_provenance", "The dated matching company link, not the undated article body, supports the date.")
        planckian = e("it-planckian-pre-seed-2023")["amount"]
        expect(planckian["value"] is None and planckian["lower_bound"] == 2700000 and planckian["bound_inclusive"] is False,
               "strict_lower_bound", "More than EUR2.7m is not exactly EUR2.7m.")
        weroad = e("it-weroad-2026-05-27-series-c")["amount"]
        expect(weroad["value"] is None and weroad["currency"] is None and weroad["precision"] == "conflict",
               "weroad_currency_conflict", "Dollar/euro conflict remains unresolved.")
        casavo = e("staging:it:casavo:2026-04-14-capital-increase")["amount"]
        expect(casavo["value"] is None and casavo["lower_bound"] == 12000000 and casavo["bound_inclusive"] is False,
               "strict_lower_bound", "Over EUR12m remains a strict lower bound.")
        debt = o("staging:it:casavo:2022-07-19-debt")
        expect(debt["amount"]["value"] is None and debt["amount"]["upper_bound"] == 300000000
               and debt["completion_status"] == "capacity_not_drawdown", "casavo_debt_capacity", "Debt capacity is not drawn proceeds.")
        expect(e("it-aavantgarde-seed-2021")["amount"]["value"] is None
               and e("it-aavantgarde-seed-2021")["event_date"] == {"value": "2021-06", "precision": "month"}
               and e("it-aavantgarde-series-a-2023")["closed"] == {"value": "2023-06", "precision": "month"}
               and e("it-aavantgarde-series-a-2023")["announced"]["value"] is None,
               "aavantgarde_partial_dates", "Distinct seed and Series A histories retain unknown amounts and partial dates.")
        proposal = o("staging:it:satispay:2026-06-11-proposed-capital-increase")
        expect(proposal["amount"]["value"] is None and proposal["amount"]["upper_bound"] == 120000000
               and proposal["approximate_committed_fraction"] == 0.5 and proposal["completion_status"] == "proposal_not_completed",
               "satispay_proposal", "The proposal ceiling and approximate commitments are not a completed EUR120m or EUR60m raise.")
        scalapay = e("staging:it:scalapay:2022-02-23-series-b")
        currency_map = next(m for m in scalapay["field_mappings"] if m["field"] == "/amount/currency")
        expect(scalapay["transaction_kind"] == "unknown" and currency_map["source_ids"] == ["it-fin-scalapay-2022-extension"],
               "scalapay_instrument_currency", "USD is explicitly corroborated; whole-round equity is not established.")
        tot = e("staging:it:tot:2025-09-11-pre-series-a")
        type_map = next(m for m in tot["field_mappings"] if m["field"] == "/transaction_kind")
        expect(tot["transaction_kind"] == "equity" and "it-fin-tot-cdp" in type_map["source_ids"],
               "tot_instrument_source", "CDP's explicit capital-increase statement supports the instrument.")
    except (KeyError, StopIteration):
        fail("acceptance_case_missing", "A reviewed edge-case event, observation, group, or field mapping disappeared.")

    recalculated = {
        "companies_reviewed": len(company_map), "startup_candidates": sum(c["startup_candidate"] for c in company_map.values()),
        "historical_references_excluded": sum(not c["startup_candidate"] for c in company_map.values()),
        "funding_events": len(document["funding_events"]), "candidate_funding_events": sum(e["startup_candidate"] for e in event_map.values()),
        "financing_observations": len(document["financing_observations"]),
        "funding_event_participations": sum(p["target_kind"] == "funding_event" for p in document["participations"]),
        "observation_relationships": sum(p["target_kind"] == "financing_observation" for p in document["participations"]),
        "funding_conflicts": len(document["conflicts"]), "accessed_supporting_sources": len(document["sources"]),
        "acquisition_context_observations": len(document["context_observations"]), "round_groups": len(document["round_groups"]),
    }
    if document["summary"] != recalculated:
        fail("summary_counts", "Reported counts disagree with records.")
    return issues


def regression_tests(document, schema, packets):
    tests = []

    def run(name, mutate, expected):
        changed = copy.deepcopy(document)
        mutate(changed)
        detected = sorted({i["code"] for i in audit(changed, schema, packets)})
        tests.append({"name": name, "expected_rejection_code": expected,
                      "detected_codes": detected, "passed": expected in detected})

    def event(d, eid):
        return next(e for e in d["funding_events"] if e["event_id"] == eid)

    def observation(d, oid):
        return next(o for o in d["financing_observations"] if o["observation_id"] == oid)

    run("reject_duplicate_event_id", lambda d: d["funding_events"].append(copy.deepcopy(d["funding_events"][0])), "event_duplicate")
    run("reject_duplicate_participant", lambda d: d["participations"].append(copy.deepcopy(d["participations"][0])), "participation_duplicate")
    run("reject_inaccessible_supporting_source", lambda d: d["sources"][0].update(accessed=False), "json_schema")
    run("reject_forged_source_url", lambda d: d["sources"][0].update(url="https://example.invalid/funding"), "source_changed")
    run("reject_changed_input_checksum", lambda d: d["input_packets"][0].update(sha256="0" * 64), "input_hash")
    run("reject_detached_participant", lambda d: d["participations"][0].update(target_id="missing-event"), "participant_event_link")
    run("reject_portfolio_only_name_injection", lambda d: d["participations"][0].update(name="Unsubstantiated Portfolio Logo"), "participant_explicit_evidence")
    run("reject_unsubstantiated_lead_upgrade", lambda d: next(p for p in d["participations"] if p["role"] == "participant").update(role="lead"), "participant_explicit_evidence")
    run("reject_amount_without_currency", lambda d: d["funding_events"][0]["amount"].update(currency=None), "amount_currency_pair")
    run("reject_unknown_amount_as_zero", lambda d: event(d, "it-aavantgarde-seed-2021")["amount"].update(value=0), "unknown_not_zero")
    run("reject_exact_lower_bound", lambda d: event(d, "it-planckian-pre-seed-2023")["amount"].update(value=2700000), "amount_bound")
    run("reject_capacity_as_drawn_amount", lambda d: observation(d, "staging:it:casavo:2022-07-19-debt")["amount"].update(value=300000000), "amount_bound")
    run("reject_fabricated_dollar_currency", lambda d: event(d, "it-caracol-series-b-2025")["amount"].update(currency="USD"), "unresolved_currency")
    run("reject_precision_padding", lambda d: event(d, "it-aavantgarde-series-a-2023").update(closed={"value": "2023-06-01", "precision": "day"}), "aavantgarde_partial_dates")
    run("reject_energy_tranche_as_extra_round", lambda d: observation(d, "it-energy-dome-series-b-2023:component:1").update(count_as_additional_completed_round=True), "json_schema")
    run("reject_recomputed_aiko_total", lambda d: event(d, "it-aiko-series-a-2024-2025")["amount"].update(value=4020000), "aiko_nonadditivity")
    run("reject_leaf_unfinished_debt_as_completed", lambda d: observation(d, "it-leaf-space-series-b-2023:observation:venture_debt_availability").update(completion_status="reported_financing_observation"), "leaf_instrument_scope")
    run("reject_proposed_raise_as_completed", lambda d: observation(d, "staging:it:satispay:2026-06-11-proposed-capital-increase").update(completion_status="reported_financing_observation"), "proposal_completion")
    run("reject_excluded_company_as_candidate", lambda d: next(c for c in d["companies"] if c["company_id"] == "staging:it:fiscozen").update(startup_candidate=True), "company_scope")
    run("reject_stage_based_equity_inference", lambda d: event(d, "it-genespire-series-b-2024").update(transaction_kind="equity", instrument_basis="explicit_source_wording"), "instrument_inference")
    run("reject_removed_nonadditivity_membership", lambda d: d["round_groups"][0]["record_ids"].pop(), "group_membership")
    run("reject_unapproved_production_field", lambda d: d.update(production_total_funding=999999999), "json_schema")
    return tests


def main():
    document = json.loads((ROOT / "funding-evidence.json").read_text())
    schema = json.loads((ROOT / "funding-evidence.schema.json").read_text())
    packets = {lane: json.loads((ROOT / "evidence" / (lane + ".json")).read_text()) for lane in builder.LANES}
    jsonschema.Draft202012Validator.check_schema(schema)
    issues = audit(document, schema, packets)
    deterministic_data = builder.encoded(builder.build(ROOT)) == (ROOT / "funding-evidence.json").read_bytes()
    deterministic_schema = builder.encoded(builder.schema_document()) == (ROOT / "funding-evidence.schema.json").read_bytes()
    if not deterministic_data or not deterministic_schema:
        issues.append({"code": "deterministic_rebuild", "detail": "Committed output differs from immutable-input rebuild."})
    tests = regression_tests(document, schema, packets)
    passed = not issues and all(test["passed"] for test in tests)
    report = {
        "status": "passed" if passed else "failed",
        "validated_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "command": "python validate-funding.py",
        "json_schema_draft": "2020-12", "jsonschema_version": importlib.metadata.version("jsonschema"),
        "scope": "Italy country research companion only; no production writes or schema/API changes.",
        "input_packet_hashes": document["input_packets"],
        "artifact_hashes": {name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest() for name in
                            ["build-funding.py", "validate-funding.py", "funding-evidence.json", "funding-evidence.schema.json"]},
        "checks": {
            "strict_local_schema": not any(i["code"] == "json_schema" for i in issues),
            "deterministic_data_rebuild": deterministic_data, "deterministic_schema_rebuild": deterministic_schema,
            "source_access_and_hash_bound_provenance": not any(i["code"] in {"source_not_accessed", "source_changed", "input_hash", "raw_fragment_hash"} for i in issues),
            "event_scoped_participants": not any("participant" in i["code"] for i in issues),
            "amount_currency_bounds_and_nulls": not any("amount" in i["code"] or "currency" in i["code"] or i["code"] == "unknown_not_zero" for i in issues),
            "known_nonadditivity_and_instrument_cases": not any(i["code"] in {"dorbit_nonadditivity", "energy_nonadditivity", "aiko_nonadditivity", "leaf_instrument_scope", "instrument_inference"} for i in issues),
            "raw_round_coverage_and_historical_scope": not any(i["code"] in {"raw_round_coverage", "company_scope", "historical_scope"} for i in issues),
        },
        "summary": document["summary"], "issues": issues,
        "adversarial_regressions": {"passed": sum(t["passed"] for t in tests), "total": len(tests), "tests": tests},
        "limitations": [
            "Validation checks the reviewed packet and its normalization, not independent completion of every financing history.",
            "No cumulative company funding amount or exhaustive startup denominator is calculated.",
            "Investor names remain unresolved source labels; distinct funds, managers and corporate entities are not silently merged.",
            "D-Orbit final close day, AIKO close-month conflict, Leaf Space debt finalization, Caracol currency/split and other recorded unknowns remain open.",
            "The complete source-attempt/access-gap registry and next-source coverage queue are maintained by the country packet outside this companion.",
        ],
    }
    (ROOT / "funding-validation.json").write_bytes(builder.encoded(report))
    print(json.dumps({"status": report["status"], "issues": issues,
                      "adversarial_regressions_passed": report["adversarial_regressions"]["passed"],
                      "adversarial_regressions_total": len(tests), "summary": document["summary"]}))
    raise SystemExit(0 if passed else 1)


if __name__ == "__main__":
    main()
