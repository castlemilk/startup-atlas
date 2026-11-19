#!/usr/bin/env python3
"""Build the Italy-only funding research companion from immutable evidence.

Run from any directory: python build-funding.py [--check].  This script has no
network access and does not import or modify any Startup Atlas production code.
Its JSON Schema is local to this reviewed country packet, not an ingestion API.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parent
LANES = ("general", "fintech", "deeptech")
EXCLUDED = {
    "staging:it:bending-spoons": "Publicly listed; retained as a reviewed historical reference.",
    "staging:it:fiscozen": "Acquired by Visma; retained as a reviewed historical reference.",
}
EXPLICIT_EQUITY = {
    "it-serenis-2025-09-29-series-a",
    "staging:it:satispay:2024-11-11-capital-increase",
    "staging:it:scalapay:2022-05-03-series-b-extension",
    "staging:it:casavo:2022-07-19-series-d",
    "staging:it:casavo:2026-04-14-capital-increase",
    "staging:it:tot:2025-09-11-pre-series-a",
    "it-leaf-space-series-b-2023",
}


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def sha(value):
    return hashlib.sha256(value).hexdigest()


def encoded(value):
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode()


def resolve(document, pointer):
    value = document
    if not pointer:
        return value
    for token in pointer.lstrip("/").split("/"):
        token = token.replace("~1", "/").replace("~0", "~")
        value = value[int(token)] if isinstance(value, list) else value[token]
    return value


def date_value(raw):
    if raw is None:
        return {"value": None, "precision": "unknown"}
    if isinstance(raw, str):
        return {"value": raw, "precision": {4: "year", 7: "month", 10: "day"}[len(raw)]}
    return {"value": raw.get("value"), "precision": raw.get("precision", "unknown")}


def amount_value(raw, precision=None, amount_key="amount"):
    old_precision = precision or raw.get("amount_precision", "as_reported")
    precision_map = {
        "undisclosed_in_accessed_source": "unknown",
        "strict_lower_bound": "lower_bound",
    }
    new_precision = precision_map.get(old_precision, old_precision)
    value = raw.get(amount_key)
    lower, upper, inclusive = None, None, None
    if new_precision == "lower_bound":
        lower = raw.get("amount_lower_bound", value)
        value, inclusive = None, False
    if new_precision == "upper_bound":
        upper, value, inclusive = value, None, True
    if new_precision in {"unknown", "currency_unresolved", "conflict"}:
        value = None
    return {
        "value": value,
        "currency": raw.get("currency"),
        "precision": new_precision,
        "lower_bound": lower,
        "upper_bound": upper,
        "bound_inclusive": inclusive,
        "reported_text": raw.get("amount_text"),
        "basis": raw.get("amount_basis", "Source-reported denomination; no independent FX conversion."),
    }


def schema_document():
    """The strict schema describes this packet only; arbitrary raw payloads stay referenced."""
    string = {"type": "string", "minLength": 1}
    nullable_string = {"type": ["string", "null"]}
    strings = {"type": "array", "items": string, "uniqueItems": True}
    boolean = {"type": "boolean"}
    nullable_number = {"type": ["number", "null"], "minimum": 0}

    def obj(properties, required=None):
        return {"type": "object", "properties": properties,
                "required": list(properties) if required is None else required,
                "additionalProperties": False}

    def arr(reference):
        return {"type": "array", "items": {"$ref": "#/$defs/" + reference}}

    ref = obj({"packet_id": {"enum": list(LANES)}, "pointer": string,
               "fragment_sha256": {"type": "string", "pattern": "^[0-9a-f]{64}$"}})
    mapping = obj({
        "field": {"type": "string", "pattern": "^/"},
        "raw_pointers": strings, "source_ids": strings, "claim_ids": strings,
        "mode": {"enum": ["direct", "conservative_normalization", "structural", "unknown"]},
        "rationale": string,
    })
    date = {
        "oneOf": [
            obj({"value": {"type": "null"}, "precision": {"const": "unknown"}}),
            obj({"value": {"type": "string", "pattern": "^[0-9]{4}$"}, "precision": {"const": "year"}}),
            obj({"value": {"type": "string", "pattern": "^[0-9]{4}-[0-9]{2}$"}, "precision": {"const": "month"}}),
            obj({"value": {"type": "string", "format": "date"}, "precision": {"const": "day"}}),
        ]
    }
    amount = obj({
        "value": nullable_number,
        "currency": {"type": ["string", "null"], "pattern": "^[A-Z]{3}$"},
        "precision": {"enum": ["exact", "as_reported", "approximate", "reported_rounded_total",
                                 "lower_bound", "upper_bound", "conflict", "currency_unresolved", "unknown"]},
        "lower_bound": nullable_number, "upper_bound": nullable_number,
        "bound_inclusive": {"type": ["boolean", "null"]},
        "reported_text": nullable_string, "basis": string,
    })
    common = {
        "company_id": string, "startup_candidate": boolean,
        "raw_ref": {"$ref": "#/$defs/raw_ref"},
        "source_ids": strings, "claim_ids": strings, "field_mappings": arr("field_mapping"),
    }
    event = obj({
        **common, "event_id": string, "stage": string,
        "transaction_kind": {"enum": ["equity", "unknown"]},
        "raw_transaction_kind": nullable_string,
        "instrument_basis": {"enum": ["explicit_source_wording", "not_established"]},
        "announced": {"$ref": "#/$defs/date"}, "closed": {"$ref": "#/$defs/date"},
        "event_date": {"$ref": "#/$defs/date"},
        "amount": {"$ref": "#/$defs/amount"},
        "amount_scope": {"enum": ["reported_round_observation", "first_close_total",
                                    "round_total_after_multiple_closes", "incremental_extension"]},
        "round_group_id": nullable_string, "related_event_ids": strings,
        "note": nullable_string,
        "null_reasons": {"type": "object", "additionalProperties": string},
        "primary_amount": {"type": "null"}, "secondary_amount": {"type": "null"},
        "participants_complete": {"const": False}, "funding_history_complete": {"const": False},
        "aggregation_permitted_without_review": {"const": False},
    })
    observation = obj({
        **common, "observation_id": string,
        "kind": {"enum": ["debt_capacity", "proposed_capital_increase", "later_same_round_total",
                           "first_tranche", "venture_debt_availability", "mixed_aggregate_reference",
                           "earlier_same_round_total", "extension_component"]},
        "linked_event_ids": strings, "round_group_id": nullable_string,
        "transaction_kind": {"enum": ["equity", "debt", "mixed", "unknown"]},
        "completion_status": {"enum": ["reported_financing_observation", "capacity_not_drawdown",
                                        "proposal_not_completed", "not_yet_fully_finalized", "mixed_status_reference"]},
        "announced": {"$ref": "#/$defs/date"}, "closed": {"$ref": "#/$defs/date"},
        "amount": {"$ref": "#/$defs/amount"},
        "amount_scope": {"enum": ["facility_limit", "proposal_ceiling", "same_round_total",
                                    "included_component", "mixed_instrument_aggregate"]},
        "count_as_additional_completed_round": {"const": False},
        "approximate_committed_fraction": {"type": ["number", "null"], "minimum": 0, "maximum": 1},
        "note": string,
    })
    participant = obj({
        **common, "participation_id": string,
        "target_id": string, "target_kind": {"enum": ["funding_event", "financing_observation"]},
        "name": string, "resolved_investor_id": {"type": "null"},
        "role": {"enum": ["lead", "participant", "lender", "prospective_lender", "subscriber_commitment"]},
        "participation_scope": nullable_string,
        "assertion_basis": {"const": "explicit_named_relationship_in_reviewed_evidence"},
        "not_portfolio_inference": {"const": True},
    })
    conflict = obj({
        **common, "conflict_id": string, "event_ids": strings, "field": string,
        "resolution": string,
    })
    context = obj({
        **common, "context_id": string, "kind": {"const": "acquisition_reference"},
        "count_as_funding_round": {"const": False}, "note": string,
    })
    company = obj({
        "company_id": string, "canonical_name": string, "startup_candidate": boolean,
        "scope_reason": string, "raw_ref": {"$ref": "#/$defs/raw_ref"},
        "event_ids": strings, "observation_ids": strings,
        "funding_history_complete": {"const": False},
        "coverage_disposition": {"enum": ["reviewed_subset", "no_accepted_round_in_this_pass"]},
        "absence_meaning": string,
    })
    source = obj({
        "source_id": string, "raw_ref": {"$ref": "#/$defs/raw_ref"},
        "url": {"type": "string", "format": "uri"}, "title": string, "publisher": string,
        "source_kind": string, "accessed": {"const": True},
        "retrieved_at": {"type": "string", "format": "date-time"},
        "published_on": nullable_string, "acquisition": {"const": "web_tool_page_read"},
        "retrieval_context": {"type": "object"},
        "paraphrase": string, "crawler_seed_approved": {"const": False},
    })
    group = obj({
        "group_id": string, "company_id": string, "record_ids": strings,
        "policy": {"enum": ["non_additive_overlapping_observations", "separate_instruments_and_statuses",
                             "explicit_increment_without_derived_total"]},
        "preferred_total_record_id": nullable_string, "reason": string,
    })
    return {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$id": "urn:startup-atlas:research:italy:2026-11-18:funding-evidence:1",
        "title": "Italy batch 001 funding evidence research companion (not an Atlas API)",
        **obj({
            "$schema": {"const": "./funding-evidence.schema.json"},
            "schema_version": {"const": "italy-funding-evidence-v1"},
            "packet_kind": {"const": "country_research_companion"},
            "country_code": {"const": "IT"}, "as_of": {"const": "2026-11-18"},
            "production_write": {"const": False},
            "input_packets": arr("input_packet"),
            "method": strings, "companies": arr("company"), "funding_events": arr("event"),
            "financing_observations": arr("observation"), "participations": arr("participant"),
            "conflicts": arr("conflict"), "context_observations": arr("context"),
            "round_groups": arr("group"), "sources": arr("source"),
            "summary": {"type": "object", "additionalProperties": {"type": "integer", "minimum": 0}},
        }),
        "$defs": {
            "raw_ref": ref, "field_mapping": mapping, "date": date, "amount": amount,
            "input_packet": obj({"packet_id": {"enum": list(LANES)}, "path": string,
                                 "sha256": {"type": "string", "pattern": "^[0-9a-f]{64}$"}}),
            "company": company, "event": event, "observation": observation,
            "participant": participant, "conflict": conflict, "context": context,
            "source": source, "group": group,
        },
    }


def build(root=ROOT):
    packets = {}
    inputs = []
    for lane in LANES:
        path = f"evidence/{lane}.json"
        contents = (root / path).read_bytes()
        packets[lane] = json.loads(contents)
        inputs.append({"packet_id": lane, "path": path, "sha256": sha(contents)})
    sources = {}
    for lane, packet in packets.items():
        for i, source in enumerate(packet["sources"]):
            if source["id"] in sources:
                raise ValueError("Duplicate raw source ID: " + source["id"])
            sources[source["id"]] = (lane, f"/sources/{i}", source)

    def raw_ref(lane, pointer):
        return {"packet_id": lane, "pointer": pointer,
                "fragment_sha256": sha(canonical(resolve(packets[lane], pointer)).encode())}

    def find_claims(lane, company_id, event_id=None, name=None, value=None):
        found = []
        for claim in packets[lane]["claims"]:
            if claim["entity_id"] != company_id:
                continue
            candidate = claim.get("value")
            if not isinstance(candidate, dict):
                continue
            if value is not None and candidate == value:
                found.append(claim["claim_id"])
            elif event_id and (candidate.get("event_id") or candidate.get("id")) == event_id:
                if name is not None and candidate.get("name") == name:
                    found.append(claim["claim_id"])
                elif name is None and claim["field"] == "funding_round":
                    found.append(claim["claim_id"])
        return sorted(set(found))

    def mapping(field, pointer=None, source_ids=(), claim_ids=(), mode="direct", reason=None):
        return {"field": field, "raw_pointers": [] if pointer is None else [pointer],
                "source_ids": sorted(set(source_ids)), "claim_ids": sorted(set(claim_ids)),
                "mode": mode,
                "rationale": reason or ("Direct value in the reviewed source-backed raw record." if mode == "direct"
                                         else "Preserve unknown or apply the documented conservative normalization.")}

    companies, events, observations, participations, conflicts, contexts = [], [], [], [], [], []
    raw_company_index = {}
    event_index = {}

    def base_record(lane, company_id, pointer, source_ids, claim_ids):
        return {"company_id": company_id, "startup_candidate": company_id not in EXCLUDED,
                "raw_ref": raw_ref(lane, pointer), "source_ids": sorted(set(source_ids)),
                "claim_ids": claim_ids, "field_mappings": []}

    def participation(lane, company_id, target_id, target_kind, pointer, participant,
                      role=None, name_key="name", scope=None):
        name = participant[name_key] if isinstance(participant, dict) else participant
        source_ids = participant.get("source_ids", []) if isinstance(participant, dict) else []
        claim_ids = find_claims(lane, company_id, target_id, name)
        row = base_record(lane, company_id, pointer, source_ids, claim_ids)
        row.update({
            "participation_id": "it-participation-" + sha((target_id + "\0" + name).encode())[:18],
            "target_id": target_id, "target_kind": target_kind, "name": name,
            "resolved_investor_id": None,
            "role": role or participant["role"],
            "participation_scope": scope if scope is not None else participant.get("participation_scope"),
            "assertion_basis": "explicit_named_relationship_in_reviewed_evidence",
            "not_portfolio_inference": True,
        })
        row["field_mappings"] = [
            mapping("/name", pointer + "/" + name_key, source_ids, claim_ids),
            mapping("/role", pointer + "/role" if "role" in participant else None,
                    source_ids, claim_ids, "direct" if role is None else "conservative_normalization",
                    "Role is scoped to this explicit event or financing observation; no portfolio inference."),
            mapping("/participation_scope", pointer + "/participation_scope" if "participation_scope" in participant else None,
                    source_ids if row["participation_scope"] is not None else [], claim_ids,
                    "direct" if "participation_scope" in participant and scope is None else "structural",
                    "Keep stated tranche scope; a lead role is not propagated to other closings."),
        ]
        participations.append(row)
        return row

    def observed(lane, company_id, pointer, raw, observation_id, kind, linked, source_ids,
                 amount_raw=None, amount_key="amount", precision=None, announced=None, closed=None,
                 instrument="unknown", status="reported_financing_observation", amount_scope="same_round_total", note=""):
        claim_ids = find_claims(lane, company_id, value=raw)
        row = base_record(lane, company_id, pointer, source_ids, claim_ids)
        amount_raw = amount_raw or raw
        row.update({
            "observation_id": observation_id, "kind": kind, "linked_event_ids": linked,
            "round_group_id": None, "transaction_kind": instrument, "completion_status": status,
            "announced": date_value(announced), "closed": date_value(closed),
            "amount": amount_value(amount_raw, precision=precision, amount_key=amount_key),
            "amount_scope": amount_scope, "count_as_additional_completed_round": False,
            "approximate_committed_fraction": raw.get("approximately_committed_fraction"), "note": note,
        })
        row["field_mappings"] = [
            mapping("/amount", pointer, source_ids, claim_ids, "conservative_normalization",
                    "Amount qualifiers and the raw source object determine value, bound, currency, and scope."),
            mapping("/announced", pointer, source_ids if announced else [], claim_ids, "conservative_normalization",
                    "Use only an announcement/as-of date explicitly present in this observation."),
            mapping("/closed", pointer, source_ids if closed else [], claim_ids, "conservative_normalization",
                    "No missing closing day is imputed."),
            mapping("/transaction_kind", pointer, source_ids, claim_ids, "conservative_normalization",
                    "Separate instrument or proposal type from whether money was raised or drawn."),
            mapping("/completion_status", pointer, source_ids, claim_ids, "conservative_normalization",
                    "Availability, ceilings, and commitments are not proof of completed proceeds."),
            mapping("/approximate_committed_fraction", pointer + "/approximately_committed_fraction" if "approximately_committed_fraction" in raw else None,
                    source_ids if "approximately_committed_fraction" in raw else [], claim_ids,
                    "direct" if "approximately_committed_fraction" in raw else "unknown",
                    "Retain only a stated approximate commitment fraction; never derive completed cash proceeds."),
            mapping("/note", pointer, source_ids, claim_ids, "conservative_normalization",
                    "Researcher paraphrase of the scoped raw financing observation."),
        ]
        observations.append(row)
        return row

    for lane, packet in packets.items():
        for ci, company in enumerate(packet["companies"]):
            cid = company.get("entity_id", company.get("id"))
            cp = f"/companies/{ci}"
            raw_company_index[cid] = (lane, cp, company)
            companies.append({
                "company_id": cid, "canonical_name": company.get("canonical_name", company.get("name")),
                "startup_candidate": cid not in EXCLUDED,
                "scope_reason": EXCLUDED.get(cid, "Reviewed startup candidate; production admission requires owner review."),
                "raw_ref": raw_ref(lane, cp), "event_ids": [], "observation_ids": [],
                "funding_history_complete": False, "coverage_disposition": "no_accepted_round_in_this_pass",
                "absence_meaning": "An empty event list means no accepted event in this bounded pass, not zero lifetime funding.",
            })
            round_key = "funding_events" if "funding_events" in company else "funding_rounds"
            for ri, raw in enumerate(company.get(round_key, [])):
                rp = f"{cp}/{round_key}/{ri}"
                event_id = raw.get("event_id", raw.get("id"))
                source_ids = raw["source_ids"]
                if raw["transaction_kind"] == "debt":
                    observed(lane, cid, rp, raw, event_id, "debt_capacity", [], source_ids,
                             precision="upper_bound", announced=raw.get("announced"),
                             instrument="debt", status="capacity_not_drawdown", amount_scope="facility_limit",
                             note="Up to EUR 300m of debt capacity; no assertion of drawn proceeds or equity participation.")
                    for pi, lender in enumerate(raw.get("lenders", [])):
                        participation(lane, cid, event_id, "financing_observation", f"{rp}/lenders/{pi}", lender)
                    continue
                claim_ids = find_claims(lane, cid, event_id)
                event = base_record(lane, cid, rp, source_ids, claim_ids)
                date_keys = {"announced": next((k for k in ["announced", "announced_on", "announced_date"] if k in raw), None),
                             "closed": next((k for k in ["closed", "closed_on", "closed_date"] if k in raw), None),
                             "event_date": "event_date" if "event_date" in raw else None}
                kind = "equity" if event_id in EXPLICIT_EQUITY and raw["transaction_kind"] == "equity" else "unknown"
                amount_scope = "reported_round_observation"
                if "first closing" in raw["stage"]:
                    amount_scope = "first_close_total"
                elif "total" in raw["stage"]:
                    amount_scope = "round_total_after_multiple_closes"
                elif "extension" in raw["stage"].lower():
                    amount_scope = "incremental_extension"
                event.update({
                    "event_id": event_id, "stage": raw["stage"], "transaction_kind": kind,
                    "raw_transaction_kind": raw.get("transaction_kind"),
                    "instrument_basis": "explicit_source_wording" if kind == "equity" else "not_established",
                    **{field: date_value(raw.get(key)) if key else date_value(None) for field, key in date_keys.items()},
                    "amount": amount_value(raw), "amount_scope": amount_scope,
                    "round_group_id": None,
                    "related_event_ids": [raw["related_event_id"]] if raw.get("related_event_id") else [],
                    "note": raw.get("note"), "null_reasons": {},
                    "primary_amount": None, "secondary_amount": None,
                    "participants_complete": False, "funding_history_complete": False,
                    "aggregation_permitted_without_review": False,
                })

                def sources_for(key):
                    if key == "note":
                        return source_ids
                    if key == "announced" and raw.get("date_source_ids"):
                        return raw["date_source_ids"]
                    if key == "currency" and raw.get("currency_source_ids"):
                        return raw["currency_source_ids"]
                    if key == "stage" and raw.get("stage_source_ids"):
                        return raw["stage_source_ids"]
                    return raw.get("field_sources", {}).get(key, source_ids[:1])

                event["field_mappings"] = [
                    mapping("/stage", rp + "/stage", sources_for("stage"), claim_ids),
                    mapping("/transaction_kind", rp + "/transaction_kind", sources_for("transaction_kind"), claim_ids,
                            "direct" if kind == raw["transaction_kind"] else "conservative_normalization",
                            "Round stage alone never establishes equity; retain only an explicitly supported instrument."),
                    mapping("/raw_transaction_kind", rp + "/transaction_kind", source_ids, claim_ids),
                    mapping("/note", rp + "/note" if "note" in raw else None, source_ids, claim_ids,
                            "direct" if "note" in raw else "unknown"),
                    mapping("/amount_scope", rp, source_ids, claim_ids, "conservative_normalization",
                            "Scope distinguishes an incremental close from an overlapping round total."),
                ]
                for field, key in date_keys.items():
                    is_unknown = event[field]["value"] is None
                    event["field_mappings"].append(mapping(
                        "/" + field, rp + "/" + key if key else None,
                        [] if is_unknown else sources_for(field), claim_ids,
                        "direct" if key and raw.get(key) == event[field] else "unknown" if is_unknown else "conservative_normalization",
                        "Date precision is preserved; publication is not silently treated as the closing date."))
                    if is_unknown:
                        event["null_reasons"][field] = "Not established in the reviewed evidence at this date precision."
                for field in ["value", "currency", "precision", "lower_bound", "upper_bound", "bound_inclusive", "reported_text", "basis"]:
                    raw_key = {"value": "amount", "precision": "amount_precision", "reported_text": "amount_text",
                               "lower_bound": "amount_lower_bound", "basis": "amount_basis"}.get(field, field)
                    if field == "lower_bound" and raw_key not in raw and raw.get("amount_precision") in {"lower_bound", "strict_lower_bound"}:
                        raw_key = "amount"
                    if field == "upper_bound" and raw.get("amount_precision") == "upper_bound":
                        raw_key = "amount"
                    raw_pointer = rp + "/" + raw_key if raw_key in raw else rp
                    direct = raw_key in raw and raw[raw_key] == event["amount"][field]
                    event["field_mappings"].append(mapping(
                        "/amount/" + field, raw_pointer,
                        sources_for("currency" if field == "currency" else "amount"), claim_ids,
                        "direct" if direct else "conservative_normalization",
                        "Preserve the stated denomination and qualifier; bounds and conflicts are not exact amounts."))
                if event["amount"]["value"] is None:
                    event["null_reasons"]["amount.value"] = "Exact scalar absent, disputed, currency-unresolved, or represented as a bound; see amount.precision."
                if kind == "unknown":
                    event["null_reasons"]["transaction_kind"] = "Reviewed evidence does not independently establish the financing instrument."
                event["null_reasons"]["primary_amount"] = "No accepted allocation of this event total to newly issued primary capital."
                event["null_reasons"]["secondary_amount"] = "No accepted amount of secondary share transfers."
                events.append(event)
                event_index[event_id] = event
                for pi, participant in enumerate(raw.get("participants", [])):
                    participation(lane, cid, event_id, "funding_event", f"{rp}/participants/{pi}", participant)
                for oi, component in enumerate(raw.get("components", [])):
                    observed(lane, cid, f"{rp}/components/{oi}", component, event_id + ":component:" + str(oi + 1),
                             component["kind"], [event_id], component["source_ids"], closed=component.get("closed_date"),
                             amount_scope="included_component",
                             note="This earlier tranche is included in the reported later total; it is not additional to that total.")

            for oi, observation in enumerate(company.get("related_funding_observations", [])):
                raw = observation["value"]
                op = f"{cp}/related_funding_observations/{oi}/value"
                target = raw.get("event_id", raw.get("linked_event_id"))
                kind = raw.get("observation_kind", raw.get("kind"))
                debt = kind == "venture_debt_availability"
                row = observed(lane, cid, op, raw, target + ":observation:" + kind, kind, [target], observation["source_ids"],
                               announced=raw.get("announced_date", raw.get("as_of")),
                               instrument="debt" if debt else "unknown",
                               status="not_yet_fully_finalized" if debt else "reported_financing_observation",
                               amount_scope="facility_limit" if debt else "included_component" if kind == "extension_component" else "same_round_total",
                               note="Debt availability is not completed or drawn proceeds." if debt else
                                    "Same-round total/component observation; do not add it to the overlapping main event amount.")
                if debt:
                    lender = {"lender_name": raw["lender_name"], "source_ids": observation["source_ids"]}
                    participation(lane, cid, row["observation_id"], "financing_observation", op, lender,
                                  role="prospective_lender", name_key="lender_name", scope="not yet fully finalized")

            for oi, raw in enumerate(company.get("other_events", [])):
                op = f"{cp}/other_events/{oi}"
                if raw["kind"] == "proposed_capital_increase":
                    row = observed(lane, cid, op, raw, raw["event_id"], raw["kind"], [], raw["source_ids"],
                                   amount_key="maximum_amount", precision="upper_bound", announced=raw["announced_on"],
                                   instrument="equity", status="proposal_not_completed", amount_scope="proposal_ceiling",
                                   note="A proposed ceiling and approximate commitments do not establish completion; no EUR60m proceeds are derived from the fraction.")
                    for pi, name in enumerate(raw["subscription_commitment_names"]):
                        participant = {"name": name, "source_ids": raw["source_ids"]}
                        p = participation(lane, cid, row["observation_id"], "financing_observation", op, participant,
                                          role="subscriber_commitment", scope="proposed capital increase")
                        p["field_mappings"][0]["raw_pointers"] = [f"{op}/subscription_commitment_names/{pi}"]
                elif raw["kind"] == "acquisition":
                    row = base_record(lane, cid, op, raw["source_ids"], find_claims(lane, cid, value=raw))
                    row.update({"context_id": cid + ":acquisition-reference:" + str(oi + 1),
                                "kind": "acquisition_reference", "count_as_funding_round": False,
                                "note": "Acquisition context retained by raw pointer; it is not reclassified as startup financing."})
                    row["field_mappings"] = [mapping("/note", op, raw["source_ids"], row["claim_ids"], "structural")]
                    contexts.append(row)

            for xi, raw in enumerate(company.get("conflicts", [])):
                inner = raw.get("value", raw)
                field = raw.get("field", inner.get("field", "round_participant_role"))
                if "fund" not in field and field not in {"earlier_close_month", "round_participant_role"}:
                    continue
                xp = f"{cp}/conflicts/{xi}"
                linked = inner.get("event_id", inner.get("related_event_id"))
                linked_ids = [linked] if linked else [e["event_id"] for e in events if e["company_id"] == cid]
                row = base_record(lane, cid, xp, raw["source_ids"], find_claims(lane, cid, value=inner))
                row.update({"conflict_id": cid + ":funding-conflict:" + str(xi + 1),
                            "event_ids": linked_ids, "field": field,
                            "resolution": inner.get("resolution", inner.get("reason", "Keep conflicting raw statements; do not manufacture precision."))})
                row["field_mappings"] = [mapping("/resolution", xp, raw["source_ids"], row["claim_ids"], "conservative_normalization")]
                conflicts.append(row)
                if field == "funding_amount_scope" and inner.get("reported_amount") is not None:
                    observed(lane, cid, xp + "/value", inner, linked + ":observation:mixed-aggregate", "mixed_aggregate_reference",
                             [linked], raw["source_ids"], amount_raw={"amount": inner["reported_amount"], "currency": inner["currency"]},
                             instrument="mixed", status="mixed_status_reference", amount_scope="mixed_instrument_aggregate",
                             note=inner["resolution"])

    groups = []

    def group(company_id, group_id, ids, policy, preferred, reason):
        groups.append({"group_id": group_id, "company_id": company_id, "record_ids": ids,
                       "policy": policy, "preferred_total_record_id": preferred, "reason": reason})
        for record in events + observations:
            if record.get("event_id", record.get("observation_id")) in ids:
                record["round_group_id"] = group_id

    for company_id, event_id, preferred, policy, reason in [
        ("staging:it:d-orbit", "it-d-orbit-series-c-2024", "it-d-orbit-series-c-2024:observation:later_same_round_total",
         "non_additive_overlapping_observations", "About EUR100m first close and EUR150m later total describe the same Series C. The final announcement day is unknown."),
        ("staging:it:energy-dome", "it-energy-dome-series-b-2023", "it-energy-dome-series-b-2023",
         "non_additive_overlapping_observations", "EUR55m total includes the EUR40m first tranche; the second tranche is not independently quantified here."),
        ("staging:it:aiko", "it-aiko-series-a-2024-2025", "it-aiko-series-a-2024-2025",
         "non_additive_overlapping_observations", "Reported rounded EUR4m total overlaps EUR3.5m initial total and EUR520k extension; do not substitute EUR4.02m or the EUR5m target."),
        ("staging:it:leaf-space", "it-leaf-space-series-b-2023", None,
         "separate_instruments_and_statuses", "EUR20m equity, EUR15m not-yet-finalized debt availability, and EUR35m mixed timeline aggregate cannot be added as completed equity proceeds."),
    ]:
        members = [event_id] + [o["observation_id"] for o in observations if event_id in o["linked_event_ids"]]
        group(company_id, "group:" + event_id, members, policy, preferred, reason)
    scalapay = [e["event_id"] for e in events if e["company_id"] == "staging:it:scalapay"]
    group("staging:it:scalapay", "group:it-scalapay-series-b-2022", scalapay,
          "explicit_increment_without_derived_total", None,
          "USD27m is explicitly additional to the USD497m base financing. No derived aggregate or whole-round equity classification is asserted.")
    casavo = [e["event_id"] for e in events if e["company_id"] == "staging:it:casavo" and "2026" not in e["event_id"]]
    casavo += [o["observation_id"] for o in observations if o["company_id"] == "staging:it:casavo"]
    group("staging:it:casavo", "group:it-casavo-2022-financing-and-extension", casavo,
          "separate_instruments_and_statuses", None,
          "EUR100m equity and up-to-EUR300m debt capacity are different instruments; EUR20m 2024 extension is an increment. Do not turn capacity into drawn capital.")

    for company in companies:
        cid = company["company_id"]
        company["event_ids"] = [e["event_id"] for e in events if e["company_id"] == cid]
        company["observation_ids"] = [o["observation_id"] for o in observations if o["company_id"] == cid]
        if company["event_ids"]:
            company["coverage_disposition"] = "reviewed_subset"

    used_sources = set()
    for row in events + observations + participations + conflicts + contexts:
        for m in row["field_mappings"]:
            row["source_ids"] = sorted(set(row["source_ids"]) | set(m["source_ids"]))
        used_sources.update(row["source_ids"])
    selected_sources = []
    for sid in sorted(used_sources):
        lane, pointer, source = sources[sid]
        if not source["accessed"]:
            raise ValueError("Unaccessed source cannot support normalized evidence: " + sid)
        context = {k: source[k] for k in ["retrieval_time_precision", "retrieval_window", "retrieval_window_start", "timestamp_basis"] if k in source}
        selected_sources.append({
            "source_id": sid, "raw_ref": raw_ref(lane, pointer), "url": source["url"],
            "title": source["title"], "publisher": source["publisher"], "source_kind": source["source_kind"],
            "accessed": source["accessed"], "retrieved_at": source["retrieved_at"],
            "published_on": source.get("published_on"), "acquisition": source["acquisition"],
            "retrieval_context": context,
            "paraphrase": source.get("paraphrase", source.get("evidence_paraphrase", source.get("evidence"))),
            "crawler_seed_approved": False,
        })

    return {
        "$schema": "./funding-evidence.schema.json", "schema_version": "italy-funding-evidence-v1",
        "packet_kind": "country_research_companion", "country_code": "IT", "as_of": "2026-11-18",
        "production_write": False, "input_packets": inputs,
        "method": [
            "Country-local research companion; no production investor schema, API, or synthetic-only graph contract is expanded.",
            "Only immutable reviewed evidence files are consumed. SHA256 file and fragment bindings make provenance reviewable.",
            "Funding stages do not establish financing instruments. Only explicit equity/capital-increase wording is retained as equity.",
            "Every participation is linked to one explicit event, tranche scope, named lender relationship, or proposed subscription; portfolio membership is not evidence.",
            "Bounds, approximate values, partial dates, unresolved currencies, and conflicts are preserved. Unknown is never zero.",
            "Overlapping totals and tranches are not additive. No company lifetime funding total or coverage completeness is calculated.",
            "Source retrieval timestamps retain their original checkpoint/window semantics; they are not reconstructed exact request times.",
            "Source discovery and manual page review do not approve crawler seeds, access, throttling changes, or production admission.",
        ],
        "companies": companies, "funding_events": events, "financing_observations": observations,
        "participations": participations, "conflicts": conflicts, "context_observations": contexts,
        "round_groups": groups, "sources": selected_sources,
        "summary": {
            "companies_reviewed": len(companies), "startup_candidates": sum(c["startup_candidate"] for c in companies),
            "historical_references_excluded": sum(not c["startup_candidate"] for c in companies),
            "funding_events": len(events), "candidate_funding_events": sum(e["startup_candidate"] for e in events),
            "financing_observations": len(observations),
            "funding_event_participations": sum(p["target_kind"] == "funding_event" for p in participations),
            "observation_relationships": sum(p["target_kind"] == "financing_observation" for p in participations),
            "funding_conflicts": len(conflicts), "accessed_supporting_sources": len(selected_sources),
            "acquisition_context_observations": len(contexts), "round_groups": len(groups),
        },
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Compare deterministic outputs without writing.")
    args = parser.parse_args()
    outputs = {"funding-evidence.json": build(), "funding-evidence.schema.json": schema_document()}
    for name, content in outputs.items():
        target = ROOT / name
        result = encoded(content)
        if args.check:
            if not target.exists() or target.read_bytes() != result:
                raise SystemExit("Rebuild differs: " + name)
        else:
            target.write_bytes(result)
    print(json.dumps({"status": "matched" if args.check else "built", **outputs["funding-evidence.json"]["summary"]}))


if __name__ == "__main__":
    main()
