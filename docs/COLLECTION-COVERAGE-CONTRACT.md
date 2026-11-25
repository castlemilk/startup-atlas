# Collection coverage and interrupted-run recovery contract

## Status and ownership

This is an **offline reference contract** for Atlas improvement 1 of 6.
Since #537 its eligible-population denominators are integrated in one
place: `scripts/loop_health_check.py` reports catalogue completeness
over the committed graph (eligible vs covered per scope, in this
contract's report shape) as a daily RED/WARN signal. The ledger itself
remains per-run and unwired to the crawler; the health check neither
opens nor creates ledgers.
It contributes to [OPS-01 / #89](https://github.com/castlemilk/startup-atlas/issues/89)
and hands an adapter boundary to
[CRAWL-01 / #77](https://github.com/castlemilk/startup-atlas/issues/77).
It does not replace the collection owner's frontier, transport or source adapters.

The inspected base is `d7b7aa805be24fa1e2da50bf2882ab99a3aa4c4f`, tree
`f8b66ea9bb4ca63ef5d52343cbda0cb96ff39e0a`. The refreshed open PR list contained
#163, #162, #160, #135 and #107. That list does not establish that another owner
has no unpublished work. Coordination and review gates are in the
[canonical Space](https://chatgpt.com/space/page_5167bcbbbb0c81919e1d565fd4d82e4a)
and the [existing collection backlog](https://chatgpt.com/space/page_ee16a19c0af881919e31b3306d594675).
The [existing collection owner](https://chatgpt.com/c/6afbc931-0378-83ec-8434-cd7e8db42db2)
retains integration decisions; no acknowledgement is assumed.

Only three additive paths belong to this packet:

- `scripts/collection_coverage.py`: standard-library SQLite contract.
- `tests/test_collection_coverage.py`: synthetic, offline acceptance tests.
- `docs/COLLECTION-COVERAGE-CONTRACT.md`: this specification and handoff.

`scripts/crawl.py`, its current tests, source registries, approved seeds, the
runbook and collection skill remain unchanged. No operational data, generated
snapshot, MCP API, investor/round schema, capability manifest, UI, workflow,
dependency or release path is changed. Sibling lanes retain those responsibilities.

## Source-confirmed gap

The inspected [collector](https://github.com/castlemilk/startup-atlas/blob/d7b7aa805be24fa1e2da50bf2882ab99a3aa4c4f/scripts/crawl.py)
already reports page-fetch outcomes, programme observations/caps and Wikidata
metadata outcomes. Its CLI writes timestamped and `latest-*` JSON only after the
selected collector returns. Its in-memory cache and temporary-file replacement
do not provide a per-item durable checkpoint. The
[runbook](https://github.com/castlemilk/startup-atlas/blob/d7b7aa805be24fa1e2da50bf2882ab99a3aa4c4f/docs/AGENT-RUNBOOK.md)
explicitly distinguishes these units:

| Existing output | Keep this meaning | Do not infer |
| --- | --- | --- |
| `page_fetch_coverage` | Attempted page observations and fetch outcomes | Eligible entity count or verified facts |
| `program_candidate_coverage` | Unique requested URLs; reused page observations; observed, returned and omitted candidates | HTTP exchanges, unique programmes or complete inventory |
| `directory_coverage` | Extracted observations, exact-name matches, parser notes and truncation | Reviewed identity or ecosystem denominator |
| `metadata_coverage` | Unique requested QIDs and outcomes; API client operations, including local rejection/splits | Verified identity, actual HTTP count or primary-source truth |

This module has no import of, call to, or adapter for those collectors. No source
requests were needed to implement the contract. All execution evidence is synthetic.

## Immutable eligible populations

One SQLite file holds one run. Creating it requires an immutable configuration:

| Field | Contract |
| --- | --- |
| `version`, `run_id` | Version 1 and explicit run identity |
| `catalogue_revision`, `snapshot_kind` | Exact 40-character source commit; `synthetic`, `committed`, `built` or `published`, supplied by the caller |
| `created_at`, `attempt_budget` | UTC creation time and nonnegative durable attempt budget |
| Each scope | Exact `id`, `source_id`, `host`, `entity_kind`, `dimension`, `temporal_scope`, source-byte SHA-256, parser version and eligibility rule |
| Population basis | `as_of`, evidence reference/digest and a textual basis or limitation |
| `status: exact` | A complete, explicit list of eligible identities, including an intentionally empty list |
| `status: unknown` | `eligible_ids: null`; failed, partial, capped or unenclosed enumeration is not promoted to an exact population |
| `freshness_seconds` | Explicit age threshold since verification, or `null` when no policy has been agreed |

The exact denominator is the length of the unique eligible-ID list. Duplicate
members and duplicate logical source/entity/dimension/temporal scopes fail
validation. IDs are preserved exactly; there is no case folding, label matching,
URL-based identity merge or inference from a shared domain. A single source ID
cannot be assigned different hosts in different scopes to evade a saved host pause.

**Unknown is not zero.** An exact empty list has denominator `0`, an unknown
population has denominator `null`, and both have a `null` verification ratio.
Neither becomes 100%. A source-reported estimate remains evidence for an unknown
population until the owner defines an independently reviewed estimate schema;
this packet does not turn an advertised total into an exact denominator.

Configuration normalization sorts scopes and exact IDs, and canonical JSON sorts
object keys. Reopening requires the same complete configuration. Changes to the
catalogue/source revision, population, parser, policy, budget or scope are rejected;
create a new run and record its relationship to the old one. This module does not
silently rebase work onto a changing catalogue or reset a budget on restart.

`snapshot_kind` and evidence references are caller assertions, not proof of a live
publication. The module checks shape and transitions; it neither fetches evidence
nor authenticates a reviewer. No report produced here establishes hosted capability.

## Counts and freshness

Reports contain one row per source/entity-kind/dimension/temporal scope. Counts
have these meanings:

| Counter | Unit and interpretation |
| --- | --- |
| `eligible_total` | Exact scoped identities, or `null` |
| `discovered` | Distinct admitted work items; repeated observations do not create another item |
| `attempted` | Distinct items with at least one durably started attempt |
| `attempts_total` | All durably started attempts, including retries and interrupted work |
| `verified` | Items with an explicit review linked to a completed retrieval and its evidence; not a publication count |
| `unavailable` | Items whose latest attempt has an unavailable outcome; starting a new attempt moves current status to in-flight while retaining the earlier failure in history |
| `searched_unknown` | Items whose latest attempt has a searched-unknown outcome: a successful bounded search found no supported value; this is not a claim of absence |
| `interrupted`, `in_flight` | Latest attempts with a recovered unknown outcome, or still awaiting reconciliation |
| `unavailable_attempts_total`, `interrupted_attempts_total` | All unavailable attempts and, separately, interrupted attempts with unknown outcomes; later success preserves both histories |
| `pending`, `undiscovered` | Discovered but never attempted work; known eligible identities not yet discovered (`null` if total unknown) |
| `stale`, `fresh_verified` | Reviewed items at/over, or below, the explicit policy age; both `null` if there is no policy |
| `freshness_unknown` | Discovered items without verification or without an applicable freshness policy |
| `retry_due`, `manual_review` | Work presently eligible for another recorded attempt after host/budget gates; work requiring a caller decision |

These dimensions **overlap**. An item can remain verified, become stale and have a
currently unavailable refresh. Do not add them into a partition or use the failure
count to erase prior evidence. `stale: 0` only describes assessed reviewed items;
the separate unknown count and undiscovered population still matter.

Verification age is measured from `verified_at`; equality with the threshold is
stale. `retrieved_at`, `effective_at` and the original evidence remain separate.
A new retrieval, failure, retry or checkpoint does not update `verified_at`.
An explicit new review records a new review time; it does not imply the captured
source itself became newer. Policy selection and factual relevance remain review
decisions. Every timestamp is strict UTC `YYYY-MM-DDTHH:MM:SSZ`. Reports reject an
`as_of` time preceding the durable checkpoint.

`entities_by_kind` deduplicates the exact IDs across source/dimension rows. Its
eligible union is `null` if any contributing scope has an unknown population.
There is no global verification percentage. This union assumes the supplied IDs
already have reviewed identity: unresolved candidates must use a separate candidate
kind and source-scoped IDs, not impersonate canonical entities. Observations and
work items remain attributed to their original source.

## Events, evidence and retry decisions

All events specify `type`, `scope_id` and logical event time `at`. Entity events
also specify exact `entity_id`. Evidence objects contain exactly `ref` and a
64-character lowercase `sha256`. A digest supports byte identity, not truth,
rights, authorization or authenticity. References should identify retained review
artifacts; never put credentials or secret-bearing cursors in this ledger.

| Event | Required additional fields | Effect |
| --- | --- | --- |
| `discover` | `entity_id`, `evidence` | Admit an eligible item; preserve independent evidence references and deduplicate identical ones |
| `start` | `entity_id`, unique `attempt_id` | Persist intent before a future external attempt; consume one durable attempt budget unit |
| `finish` | `entity_id`, `attempt_id`, `outcome`, `evidence`, `reason`, `retry` | Record `retrieved`, `searched_unknown` or `unavailable`; preserve attempt history |
| `verify` | `entity_id`, `attempt_id`, `reviewer`, `review` evidence, nullable `effective_at` | Explicitly record review of a successful retrieval; unavailable and searched-unknown attempts cannot become verified facts |
| `recover` | `entity_id`, `attempt_id`, reconciliation `evidence`, `retry` | Fence a still-active attempt as `interrupted` / `interrupted_outcome_unknown` |
| `requeue` | `entity_id`, `reason`, decision `evidence`, `retry` | Record an explicit retry/refresh decision without changing evidence or verification |
| `checkpoint` | `cursor`, `status`, `truncated`, `reason`, `evidence` | Save a bounded discovery position and its limitations in the same transaction as related work |

`retry` contains exactly `mode` and `after`. `automatic` requires an explicit
timestamp at or after the outcome; `manual` and `none` require `after: null`.
The persisted form also retains the reason. No retry is actually executed by this
module. A manual-to-automatic requeue is a caller-recorded decision, not a permission
grant or authenticated review operation.

Unavailable reasons are `network_dns`, `network_timeout`, `http_rate_limited`,
`http_server_error`, `access_blocked`, `source_unavailable`, `parser_error` and
`identity_unresolved`. Access, parser and identity blockers require manual review.
Other requeue reasons include `refresh_due`, `manual_review` and
`interrupted_outcome_unknown`. `searched_unknown` requires `no_supported_value` and
search-log evidence. Unknown retry reasons and silent terminal failures are rejected.

A rate limit requires a strictly future retry time. The same transaction persists
a pause for the source's host; it applies to every scope sharing that host, survives
reopening and cannot be shortened by a later rate-limit event. Budget exhaustion
remains visible across reopening. These are conservative contract checks, not a
replacement for the collector's HTTP request budget, Retry-After parsing, 429 stop,
approved hosts, DNS/public-address, redirect, timeout or response-size guards.

**Durable starts are not measured HTTP requests.** A crash can occur after intent
is persisted but before a request, or after a response but before its outcome is
saved. This contract cannot distinguish those external histories. The recovery
action must retain `outcome_unknown`; it cannot relabel the attempt as never run or
declare the source empty. Stop/reconcile the prior worker before recording recovery.
There are no worker leases, automatic expiry, network calls or scheduler here.

## Atomic checkpoints and resumability

`Ledger.create(path, config)` refuses an existing file. `Ledger.open(path, config)`
refuses a missing file, unsupported version, failed SQLite integrity check,
state/config digest mismatch, journal payload digest or sequence mismatch, or different configuration.
No schema migration or overwrite is attempted.

`apply(batch_id, expected_sequence, events, committed_at)` performs one
`BEGIN IMMEDIATE` transaction containing the new state, attempt outcomes, evidence,
deduplication state, host pauses, budget, cursor and batch receipt. SQLite uses full
synchronization and its transaction journal on a local filesystem. A stale sequence
fails before effects. Event time must be monotonic and no later than commit time;
commit time cannot go backwards.

The batch fingerprint includes the exact expected sequence, canonical event payload
and commit time. An identical retry returns its original sequence even if newer
batches have since committed. Reusing a batch ID with different content fails.
Checking a matching receipt precedes the sequence conflict check, which handles
lost acknowledgements without replaying effects.

Partial checkpoints may coexist with pending, manual-review or in-flight work.
**The opaque cursor is not the queue.** On resume, inspect the whole snapshot and
`resume_queue` before advancing discovery. The queue lists discovered items; derive
undiscovered eligible IDs from the exact configuration population minus stored item IDs.
For an unknown population, undiscovered membership itself remains unknown.
Queue actions distinguish reconciliation, manual review, host pause, budget block,
future retry, ready attempt and settled work. Never discard unresolved items just
because a cursor points to a later page.

A `complete` checkpoint requires an exact population, every member discovered,
every latest attempt successfully retrieved or searched-unknown, no active attempt,
no pending retry, no truncation and no next cursor. Its work digest binds it to the
actual discovery/attempt/retry state. Review alone does not invalidate collection
completion, while new work does. A known empty enumeration reports `known_empty`
with its population evidence and `as_of`, no full-scan timestamp and no percentage.
Unknown denominators and capped/failed/unfinished scans cannot close as complete.

`last_successful_full_scan_at` derives from completed attempt times, not checkpoint
writing time. Repeating a complete checkpoint over the same attempts cannot refresh
it. A subsequent full scan requires a new completed attempt for **every** eligible
member. Refreshing only one entity cannot move the full-scan timestamp. Historical
completion remains visible while the new work is partial.

Process-crash tests exercise rollback before COMMIT and idempotent replay after
COMMIT but before acknowledgement. They do not establish resilience to every storage
device failure, host loss or distributed filesystem. The eventual collection owner
must choose an existing approved durable checkpoint location, retention/backup policy
and worker-reconciliation boundary before integration. Use SQLite's backup operation
or copy a closed database for handoff. No hosted storage was provisioned.

State/config digests, journal payload hashes on reopen and sequence checks detect the corruption they cover.
The event journal is retained locally for audit but is not a signed, authenticated or
tamper-proof log. A database administrator can change data and recompute hashes;
application review/authorization remains separate.

Bounds are explicit: at most 128 scopes, 10,000 admitted work items or enumerated
members, 256 events / 2 MiB per batch, 16 MiB current state and 100,000 started
attempts. Journal retention is an owner decision; these limits do not impose an
overall journal-byte quota. A rejected bound rolls the whole batch back.

## Complete synthetic example

Run this from the repository root. It uses a temporary database and no network,
operational records or public assets. The report has denominator 1, one discovered
and attempted item, zero verified items, and a complete **collection** pass.

```python
from pathlib import Path
from tempfile import TemporaryDirectory
from scripts.collection_coverage import Ledger

at = "2026-11-18T00:00:00Z"
evidence = {"ref": "fixture:single-startup", "sha256": "b" * 64}
config = {
    "version": 1,
    "run_id": "synthetic-example",
    "catalogue_revision": "a" * 40,
    "snapshot_kind": "synthetic",
    "created_at": at,
    "attempt_budget": 2,
    "scopes": [{
        "id": "fixture-startups",
        "source_id": "fixture-directory",
        "host": "directory.test",
        "entity_kind": "startup",
        "dimension": "identity",
        "temporal_scope": "fixture-pass-1",
        "source_revision": "b" * 64,
        "parser_version": "fixture-v1",
        "eligibility_rule": "All identities in the complete synthetic directory",
        "population": {
            "status": "exact",
            "eligible_ids": ["startup:fixture-one"],
            "as_of": at,
            "evidence": evidence,
            "reason": "Complete one-item synthetic enumeration",
        },
        "freshness_seconds": None,
    }],
}
common = {"scope_id": "fixture-startups", "at": at}
item = {**common, "entity_id": "startup:fixture-one"}
events = [
    {**item, "type": "discover", "evidence": evidence},
    {**item, "type": "start", "attempt_id": "fixture-attempt-1"},
    {**item, "type": "finish", "attempt_id": "fixture-attempt-1",
     "outcome": "retrieved", "evidence": evidence, "reason": None,
     "retry": {"mode": "none", "after": None}},
    {**common, "type": "checkpoint", "cursor": None, "status": "complete",
     "truncated": False, "reason": None, "evidence": evidence},
]
with TemporaryDirectory() as directory:
    path = Path(directory) / "coverage.sqlite"
    with Ledger.create(path, config) as ledger:
        receipt = ledger.apply("fixture-batch-1", 0, events, at)
        assert receipt == {"sequence": 1, "replayed": False}
    with Ledger.open(path, config) as ledger:
        assert ledger.apply("fixture-batch-1", 0, events, at)["replayed"] is True
        row = ledger.report(at)["scopes"][0]
        assert row["eligible_total"] == 1
        assert row["counts"]["attempted"] == 1
        assert row["counts"]["verified"] == 0
        assert row["counts"]["stale"] is None
        assert row["completion"] == "complete"
```

The example batches start and outcome together only because the attempt is a known
synthetic fixture. A future real adapter must commit `start` separately **before**
performing external work, then atomically persist its outcome/evidence and cursor.
The ledger's structural API cannot prove that ordering across an external system.

## Acceptance and next integration gate

Run the isolated tests without starting the application or generating catalogue data:

```sh
python3 -m unittest discover -s tests -p 'test_collection_coverage.py' -v
```

The acceptance suite covers unknown/zero populations, membership and identity
deduplication, exact replay and changed-payload rejection, two-connection sequence
conflicts, scope/parser drift, malformed/corrupt checkpoints, process interruption
on both sides of COMMIT, in-flight recovery and late-result fencing, durable budgets
and shared-host pauses, explicit verification, failed refresh preservation,
freshness boundaries, completion binding and full-population refresh.

Before an adapter is added, the existing collection owner must review the mapping
from its actual output units and the evidence needed for exact population membership,
pagination termination, alias resolution, manual review and trustworthy timestamps.
Agree on checkpoint retention and reconciliation of uncertain in-flight requests.
Coordinate source/host retry policy without weakening the existing transport. A
bounded replay of owner-approved saved outputs should precede any real collection.

Public and private runtime activation remain separate from source review. The
inspected [Pages workflow](https://github.com/castlemilk/startup-atlas/blob/d7b7aa805be24fa1e2da50bf2882ab99a3aa4c4f/.github/workflows/pages.yml)
runs Chrome on pull-request events. Read-only combined commit status for the same
main revision also returned `Vercel: success`; the canonical Space records external
deployment checks on non-main branches. A deployment-free publication route has not
been established. The original packet was therefore delivered without publication under its
source-only assignment. On 18 November 2026 the coordinating integration lane
was subsequently authorized to independently review and test this packet and open
a reviewable draft PR through normal CI. This source-only integration does not
activate a collector adapter or resolve the owner decisions above. Local browser
permission and hosted MCP credential restrictions remain unchanged. No workflow
changes are made to evade them. Source merge does not establish runtime capability.
