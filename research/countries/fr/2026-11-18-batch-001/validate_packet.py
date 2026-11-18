#!/usr/bin/env python3
"""Offline acceptance checks for this France evidence packet; no HTTP or writes.

This is a packet check, not a collector, seed approval mechanism, production
schema or replacement for the owner's coverage ledger.
"""
from __future__ import annotations

import argparse
from collections import Counter
from datetime import date, datetime
import hashlib
import ipaddress
import json
from pathlib import Path
import re
import unicodedata
from urllib.parse import urlsplit

HERE = Path(__file__).resolve().parent


def read(name, directory=HERE):
    return json.loads((directory / name).read_text(encoding="utf-8"))


def digest(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True,
                                     separators=(",", ":")).encode()).hexdigest()


def slug(value):
    value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", value).strip("-")


def domain(url):
    if not isinstance(url, str) or url != url.strip() or any(x.isspace() for x in url):
        raise ValueError("URL must be trimmed text")
    p = urlsplit(url)
    if p.scheme != "https" or not p.hostname or p.username or p.password or p.port not in (None, 443):
        raise ValueError("Credential-free HTTPS URL required")
    host = p.hostname.lower().rstrip(".")
    try:
        ipaddress.ip_address(host)
    except ValueError:
        pass
    else:
        raise ValueError("Literal IP is not a reviewed company domain")
    if "." not in host or host.endswith((".local", ".internal", ".localhost")):
        raise ValueError("Public company domain required")
    return host[4:] if host.startswith("www.") else host


def date_precision(value, precision):
    if value is None:
        return precision is None
    if not isinstance(value, str):
        return False
    if precision == "year":
        return bool(re.fullmatch(r"\d{4}", value)) and 1800 <= int(value) <= date.today().year
    if precision == "month":
        try:
            return bool(re.fullmatch(r"\d{4}-\d{2}", value)) and date.fromisoformat(value + "-01") <= date.today()
        except ValueError:
            return False
    if precision == "day":
        try:
            return date.fromisoformat(value).isoformat() == value and date.fromisoformat(value) <= date.today()
        except ValueError:
            return False
    return False


def timestamp(value):
    try:
        return isinstance(value, str) and datetime.fromisoformat(value.replace("Z", "+00:00")).utcoffset() is not None
    except ValueError:
        return False


def remaining_work(queue, checkpoint, base_revision):
    """Resume a saved, immutable human-review queue without changing its state."""
    ids = [x["work_id"] for x in queue]
    if len(ids) != len(set(ids)):
        raise ValueError("Duplicate work identity")
    if checkpoint["base_revision"] != base_revision or checkpoint["queue_sha256"] != digest(queue):
        raise ValueError("Checkpoint revision or queue bytes changed; reconcile first")
    done = checkpoint["completed_review_work_ids"]
    if len(done) != len(set(done)) or not set(done).issubset(ids):
        raise ValueError("Invalid completed-review identities")
    return [x for x in queue if x["work_id"] not in set(done)]


def duplicate_matches(company, baseline):
    names = {slug(company["name"]), *(slug(x) for x in company.get("aliases", []))}
    host = domain(company["website"])
    matches = []
    for old in baseline:
        reasons = []
        if slug(old["name"]) in names:
            reasons.append("normalized_name_or_reviewed_alias")
        if old.get("website") and domain(old["website"]) == host:
            reasons.append("official_domain")
        if reasons:
            matches.append({"id": old["id"], "name": old["name"], "reasons": reasons})
    return matches


def event_tree(events):
    """Traverse package components without treating them as additional rounds."""
    for event in events:
        yield event
        yield from event_tree(event.get("components", []))


def participation_claims(claims):
    return [c for c in claims if c.get("field") in ("round_participant", "funding_provider")
            or ".participants." in c.get("field", "")]


def validate_claims(claims, sources):
    errors = []
    ids = [c.get("claim_id") for c in claims]
    if any(not x for x in ids) or len(ids) != len(set(ids)):
        errors.append("Claim IDs must be present and unique")
    for c in claims:
        label = c.get("claim_id", "unknown")
        if c.get("status") in ("reviewed_staged", "conflict"):
            source = sources.get(c.get("source_url"))
            if not source or not source.get("accessed") or c.get("accessed") is not True:
                errors.append(label + ": reviewed evidence needs an accessed registered source")
            if c.get("value") is None:
                errors.append(label + ": null is a disposition, not an affirmative claim")
            if not c.get("evidence") or not c.get("rationale"):
                errors.append(label + ": evidence and rationale are required")
            if not timestamp(c.get("retrieved_at")) or not timestamp(c.get("reviewed_at")):
                errors.append(label + ": timezone-aware retrieval and review times required")
        if c.get("publication_state") not in (None, "unsubmitted"):
            errors.append(label + ": packet cannot claim production delivery")
    return errors


def validate(directory=HERE):
    manifest = read("manifest.json", directory)
    companies = read("companies.json", directory)["companies"]
    claims = read("claims.json", directory)["claims"]
    source_rows = read("sources.json", directory)["sources"]
    sources = {s["url"]: s for s in source_rows}
    baseline = read("dedup-baseline.json", directory)
    projection = read("production-projection.json", directory)["startups"]
    coverage = read("coverage.json", directory)
    queue = read("review-queue.json", directory)["items"]
    checkpoint = read("checkpoint.json", directory)
    errors = []

    def require(condition, message):
        if not condition:
            errors.append(message)

    require(len(companies) <= 50, "Initial company batch exceeds 50")
    require(len(source_rows) == len(sources), "Source registry has duplicate URLs")
    require(len({c["staging_entity_id"] for c in companies}) == len(companies), "Duplicate company IDs")
    require(len({slug(c["name"]) for c in companies}) == len(companies), "Normalized company-name collision")
    require(manifest["base_revision"] == baseline["revision"], "Baseline revision mismatch")
    require(manifest["production_modified"] is False, "Packet must be staged")
    require(manifest["crawler_seed_approval_granted"] is False, "Research cannot approve seeds")
    require(coverage["country_population_denominator"] is None, "No defensible national census denominator")
    errors.extend(validate_claims(claims, sources))
    claims_by_company = {c["staging_entity_id"]: [] for c in companies}
    for c in claims:
        require(c["entity_id"] in claims_by_company, "Orphan claim " + c["claim_id"])
        if c["entity_id"] in claims_by_company:
            claims_by_company[c["entity_id"]].append(c)

    all_events = set()
    accepted = []
    for c in companies:
        cid = c["staging_entity_id"]
        require(c["slug"] == slug(c["name"]), cid + ": noncanonical slug")
        try:
            domain(c["website"])
        except ValueError as exc:
            errors.append(cid + ": " + str(exc))
        require(c["claim_ids"] == [x["claim_id"] for x in claims_by_company[cid]], cid + ": claim membership mismatch")
        require(not duplicate_matches(c, baseline["startups"]), cid + ": existing identity needs reconciliation")
        require(c.get("crawler_seed_approved") is False, cid + ": seed approval must stay false")
        f = c["founding"]
        require(date_precision(f.get("value"), f.get("precision")), cid + ": invalid founding precision")
        require(c.get("field_dispositions") is not None, cid + ": missing field dispositions")
        if c["disposition"] == "accepted_staged":
            accepted.append(c["name"])
            require(c.get("france_nexus") is not None, cid + ": France nexus required")
        if c.get("lifecycle") == "listed_group_alumnus":
            require(c["disposition"] == "deferred_alumni", cid + ": listed group cannot count as accepted startup")
        company_events = list(event_tree(c.get("funding_events", [])))
        company_event_ids = {e["id"] for e in company_events}
        participant_claim_rows = participation_claims(claims_by_company[cid])
        for e in company_events:
            require(e["id"] not in all_events, "Duplicate event " + e["id"])
            all_events.add(e["id"])
            require(e["source_url"] in sources and sources[e["source_url"]]["accessed"], e["id"] + ": missing event provenance")
            require(date_precision(e.get("announced_on"), e.get("date_precision")), e["id"] + ": announcement precision invalid")
            if e.get("event_date"):
                require(date_precision(e["event_date"], e.get("event_date_precision")), e["id"] + ": event precision invalid")
            if e.get("parent_event_id"):
                require(e["parent_event_id"] in company_event_ids, e["id"] + ": orphan parent event")
            if e.get("components"):
                require(e.get("amount") is None, e["id"] + ": mixed package cannot become an exact amount")
                for component in e["components"]:
                    require(component.get("aggregation_rule") == "included_in_parent_do_not_sum_again", component["id"] + ": component needs nonadditive rule")
            if e.get("amount") is not None:
                require(type(e["amount"]) is int and e["amount"] > 0, e["id"] + ": unknown funding cannot become zero")
                require(bool(re.fullmatch(r"[A-Z]{3}", e.get("currency") or "")), e["id"] + ": numeric amount needs stated currency")
                require(e.get("amount_precision") == "exact", e["id"] + ": nonexact amount must retain bounds outside exact amount")
            for person in e.get("participants", []) + (e.get("providers") or []):
                require(person["event_id"] == e["id"], e["id"] + ": orphan participation")
                require(person["source_url"] in sources and sources[person["source_url"]]["accessed"], e["id"] + ": participant source missing")
                require(person.get("evidence_basis") == "event_announcement", e["id"] + ": portfolio is not participation evidence")
                require(person.get("role") in ("lead", "co_lead", "participant", "lender", "grantor", None), e["id"] + ": invalid sourced role")
                require(person.get("resolved_entity_id") is None, e["id"] + ": canonical investor binding needs owner review")
                matching = [q for q in participant_claim_rows if isinstance(q.get("value"), dict)
                            and q["value"].get("event_id") == e["id"]
                            and q["value"].get("name") == person["name"]
                            and q["value"].get("role") == person["role"]
                            and q["source_url"] == person["source_url"]
                            and q.get("status") in ("reviewed_staged", "conflict")]
                require(bool(matching), e["id"] + ": participation lacks matching atomic claim: " + person["name"])
            planned = {x["name"] for x in e.get("planned_participants", [])}
            require(not planned.intersection(x["name"] for x in e.get("participants", [])), e["id"] + ": planned investment promoted to completed participation")
        for q in participant_claim_rows:
            v = q.get("value", {})
            require(v.get("event_id") in company_event_ids, q["claim_id"] + ": participation claim references missing event")
            require(v.get("company_id", cid) == cid, q["claim_id"] + ": participation claim has stale company identity")
            target = next((e for e in company_events if e["id"] == v.get("event_id")), None)
            if target:
                counterparts = target.get("participants", []) + (target.get("providers") or [])
                require(any(p["name"] == v.get("name") and p["role"] == v.get("role")
                            and p["source_url"] == q["source_url"] for p in counterparts),
                        q["claim_id"] + ": participation claim has no matching event relationship")

    require(sorted(accepted) == sorted(x["name"] for x in projection), "Projection differs from accepted company set")
    disposition_counts = Counter(c["disposition"] for c in companies)
    require(coverage["reviewed_companies"] == len(companies), "Reviewed count mismatch")
    require(coverage["accepted_staged_companies"] == len(accepted), "Accepted count mismatch")
    require(coverage["deferred_companies"] == disposition_counts["deferred_alumni"], "Deferred count mismatch")
    require(coverage["rejected_companies"] == 0, "Rejected count mismatch")
    require(coverage["published_companies"] == 0, "Staged data cannot count as published")
    require(coverage["discovered_unique_company_leads"] == len(queue), "Discovery queue count mismatch")
    try:
        remaining = remaining_work(queue, checkpoint, manifest["base_revision"])
        require(len(remaining) == coverage["queued_company_leads"], "Resumable remainder count mismatch")
    except ValueError as exc:
        errors.append(str(exc))

    return {"valid": not errors, "errors": errors, "companies_reviewed": len(companies),
            "companies_accepted_staged": len(accepted), "claims": len(claims),
            "sources": len(sources), "events": len(all_events), "production_writes": 0}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--directory", type=Path, default=HERE)
    args = parser.parse_args()
    result = validate(args.directory)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["valid"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
