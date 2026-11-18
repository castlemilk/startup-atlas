"""Synthetic inputs only; no operational observations or remote integrations."""

from copy import deepcopy


SOURCE = "1" * 40
OTHER = "2" * 40
BASE = "3" * 40
CHECKOUT = "4" * 40
AT = "2026-11-18T10:00:00Z"
LATER = "2026-11-18T10:10:00Z"
AS_OF = "2026-11-18T10:30:00Z"
OLD = "2026-11-18T08:00:00Z"


def receipt():
    return {
        "schema_version": 1,
        "receipt_id": "synthetic-operational-receipt",
        "repository": "synthetic/atlas",
        "source": {
            "head": SOURCE,
            "ref": "refs/heads/synthetic",
            "observed_at": AT,
            "evidence_ref": "fixture:source-head",
        },
        "owner": {"name": "Synthetic receipt owner", "reference": "fixture:owner"},
        "release_owner": {
            "name": "Existing release owner; exact identity unconfirmed",
            "reference": "fixture:release-owner-reserved",
        },
        "policy": {
            "source_checks": ["unit"],
            "ci": [{"workflow": "pages.yml", "jobs": ["build"]}],
            "targets": [{
                "surface": "pages",
                "environment": "production",
                "verification_scopes": ["graph"],
            }],
            "fresh_for_seconds": 3600,
            "merge_target_ref": "main",
        },
        "history": [],
        "capability_manifest": {
            "owner_ref": "fixture:capability-owner",
            "artifact": None,
            "unavailable_reason": "owner_contract_pending",
        },
        "gates": [{
            "id": "synthetic-hold",
            "owner": "Synthetic release owner",
            "reason": "Source-only fixture; no release authorization",
            "next_action": "Review the contract without triggering automation",
        }],
    }


def event(kind, identifier, **changes):
    common = {
        "id": identifier,
        "kind": kind,
        "at": AT,
        "evidence_ref": "fixture:" + identifier,
    }
    by_kind = {
        "review": {
            "source_head": SOURCE,
            "reviewer": "Synthetic peer reviewer",
            "scope": "source-only",
            "conclusion": "approved",
        },
        "source_check": {
            "source_head": SOURCE,
            "check": "unit",
            "command": "python3 -m unittest synthetic_fixture",
            "conclusion": "success",
        },
        "ci": {
            "workflow": "pages.yml",
            "run_id": "synthetic-run-1",
            "attempt": 1,
            "run_head": SOURCE,
            "checkout_head": SOURCE,
            "association": None,
            "conclusion": "success",
            "jobs": [{"name": "build", "conclusion": "success"}],
        },
        "merge": {
            "source_head": SOURCE,
            "merge_head": CHECKOUT,
            "base_ref": "main",
            "pr_number": 1,
        },
        "deployment": {
            "surface": "pages",
            "environment": "production",
            "revision": SOURCE,
            "deployment_id": "synthetic-deployment-1",
            "conclusion": "success",
        },
        "verification": {
            "surface": "pages",
            "environment": "production",
            "revision": SOURCE,
            "scope": "graph",
            "mode": "live_read",
            "conclusion": "success",
        },
    }
    common.update(deepcopy(by_kind[kind]))
    common.update(changes)
    return common


def source_ready_receipt():
    value = receipt()
    value["history"] = [event("review", "review-a"), event("source_check", "test-a")]
    return value
