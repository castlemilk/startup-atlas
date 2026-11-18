# UAE packet integration and continuation

## Ownership and baseline

Owned path: `research/countries/ae/2026-11-18-batch-001/` only. Current baseline: `988a4ddcc4dbbc853da0c7f7899b6d6e7579f840`, refreshed after the existing owners merged PRs #179 and #181. The original research checkpoint used `f4bcbf7030d741772bb750deee584efa3ee17749`; its former unknown-year defect is historical context, not an unresolved source-level dependency. The [collection owner](https://chatgpt.com/c/6afbc931-0378-83ec-8434-cd7e8db42db2), [planner #177](https://github.com/castlemilk/startup-atlas/pull/177) and [canonical Space](https://chatgpt.com/space/page_5167bcbbbb0c81919e1d565fd4d82e4a) remain the coordination points. [coordination.json](coordination.json) preserves the record, investor-round and coverage owners and the initial notice. A sent notice is not an acknowledgement.

At the original checkpoint, the overlay contained 45 records and the committed graph contained 46 startup entities among 537 total entities and 17 funding events. Those are historical snapshot counts. The current [validation receipt](validation-results.json) separates the refreshed committed snapshot, freshly built baseline and UAE additions; a difference produced by the owner changes is not automatically attributed to this country packet.

## 1. Verify the exact research checkpoint

Review this packet's commit and file list in its PR. Only the owned directory should be changed. Run checksum verification from this directory, then run the offline validator from the repository root:

```bash
sha256sum -c SHA256SUMS
```

```bash
python3 research/countries/ae/2026-11-18-batch-001/validate_packet.py
```

The validator uses the actual `validateStartupRecord` implementation, the existing `plan_company_profiles.build_plan`, the committed baseline inputs and temporary/in-memory fixtures. It does not contact startup sites or modify the approved CSV, production overlay or generated graph. `--write-results` deliberately replaces the local validation receipt; use it only when preparing a new reviewed checkpoint and then regenerate the checksum file.

To reproduce the staged projections from the saved observations:

```bash
python3 research/countries/ae/2026-11-18-batch-001/build_packet.py
python3 research/countries/ae/2026-11-18-batch-001/validate_packet.py --write-results
```

The assembler writes the packet's JSON projections only. It does not change research facts or fetch sources. The `--inputs` argument is an initial assembly option for local lane inputs, not needed for transfer. Saved observations already exclude the held Stake company-derived facts and preserve unknown monetary values as null plus source text.

## 2. Refresh identity review before any production proposal

Fetch current main through the established repository workflow and compare its overlay, graph, schemas and ownership with this packet's pinned hashes. If they changed, inventory and deduplicate again against that exact revision; do not relabel this old receipt as a new baseline. Reconcile concurrent country packets before assigning canonical IDs.

The current packet has no matches against the committed baseline by normalized company name/alias, name-derived graph ID or normalized website host. These are review signals, not an automatic merge algorithm. Proposed `startup:*` identifiers remain provisional; `canonical_entity_id` is null and research subjects use an `unresolved:ae:*` namespace.

Particular boundaries need owner attention:

- **eyewa:** one identity with explicit Dubai/Riyadh dual HQ; coordinate the Saudi packet.
- **Immensa:** medium-confidence UAE/Saudi HQ observation; legal group structure and city scope remain unresolved.
- **Stake:** distinguish `getstake.com` from Australia's `hellostake.com` before any name-derived ID assignment. Entire company projection remains held. Do not resume company-domain extraction under the observed restrictions.
- **TruKKer, Maalexi, Derq, RemotePass:** reviewed but deferred; incorporation, operating presence and historical origin do not establish current global HQ.
- **Tabby:** current Riyadh HQ excludes it from this UAE projection; preserve its Dubai-origin history for cross-country resolution.

Founder names and investor names also remain unresolved identities. Do not merge similarly named people or fund managers without evidence. Founder assertions are public professional history, not verification of current employment or a complete founding team.

## 3. Confirm owner fixes and complete normal production review

The omitted-year-to-zero behaviour was reproduced for all 18 records at the original checkpoint. The owner's correction in [PR #179](https://github.com/castlemilk/startup-atlas/pull/179) is now merged into the current repository baseline, resolving the source-level defect. Review the refreshed graph validation receipt against that revision, and confirm the graph/SQLite path used for any subsequent publication. Preserve unknown as absent/null; do not substitute zero, a launch year or an incorporation year.

The packet intentionally uses sourced `profile_facts` for founding assertions rather than an unsourced scalar copied under a description page's provenance. Once the owner has a reviewed representation for an accepted scalar and its source, individual fields can be proposed with their original evidence. Conflicting Ziina, Bayzat and Letswork assertions must not be silently collapsed.

The separate [legacy funding-source fix in PR #181](https://github.com/castlemilk/startup-atlas/pull/181) is also merged into the refreshed baseline. The UAE batch adds new staged events only; it does not author either owner fix or deploy runtime changes. Retain the field-level evidence when proposing any existing-round update under a replacement source.

Normal production record review and release coordination remain pending. A fresh live-MCP graph readback reports current published data at `988a4ddcc4dbbc853da0c7f7899b6d6e7579f840`, with the exact query receipt in [coordination.json](coordination.json). That confirms the published data snapshot; it does not establish separate hosted-runtime adoption of PR #181's funding-source guard or publish these UAE records. Record runtime deployment and publication of the packet separately with the existing owners.

Typed investment participants are not supported by the current startup-record schema. Preserve [funding-events.json](funding-events.json) and the ledger; existing free-text notes include event names/roles and their source URLs without asserting canonical investor edges. Do not feed real research data into the repository's synthetic-only investor contract fixtures.

## 4. Propose a bounded production batch through the established path

After reviewing the refreshed validation and coordinating the normal production proposal with the existing owners, use the established record/proposal workflow for the **18 accepted objects** inside `startup-records.json`. It is an additive staged overlay, not a file to copy over `data/startup-research.json`. Preserve every existing record and concurrent change. The owner source fixes are resolved; production adoption, runtime release and live readback remain separate steps. This packet supplies research records and does not introduce an implementation or deployment command.

Keep [claims.json](claims.json), [source-registry.json](source-registry.json), [projection-map.json](projection-map.json), [funding-events.json](funding-events.json), [coverage.json](coverage.json) and [deduplication.json](deduplication.json) attached to the proposal. Do not promote deferred entities, conflict-only founder identities, held company-source facts or unreviewed discovery leads. The full ledger contains 366 observations across multiple dispositions; it is not an instruction to publish all of them.

Check the following at owner review:

1. **Dates:** retain year/month precision in sidecars; emit `announced_on` only for sourced exact days. Page publication and legal closing dates remain separate.
2. **Money:** numeric amounts require explicit currency. A bare dollar symbol remains text when currency was not established. Undisclosed amounts are omitted in schema records and null in sidecars.
3. **Transaction scope:** preserve convertible financing, mixed equity/non-equity, combined rounds, commitments and secondary components. Do not sum them into an unsupported equity total.
4. **Investors:** use named event-specific evidence. Portfolio membership, historic backers, clients, programme attendance or a manager/fund association does not establish a new investment.
5. **Source inheritance:** retain the field-to-claim mapping. Kitopi's numeric USD amount uses both company event evidence and transaction-counsel currency evidence.
6. **Readback:** record the exact accepted proposal, resulting commit, main revision and live publication readback separately. A pushed research PR is not production verification.

## 5. Continue the source queue without implying crawl approval

[next-source-queue.json](next-source-queue.json) contains 31 stable research-task IDs. Resume a task by its ID and preserve its source, priority, access gap and disposition. Each directory checkpoint currently has a null next cursor and `exhausted: false`: no directory pagination was completed, and null is not an end-of-directory claim.

For Hub71, Sheraa, in5 and DFDF, start with an accessible official cohort or directory page and record the observed page identifier, returned identities and continuation mechanism. For Wamda, review the four new unverified company leads individually before advancing its unvisited continuation. Keep historical cohort location, current HQ and incorporation as distinct facts.

The existing planner's validation inventory is 63 rows over nine pages. Its cursors are pinned to input bytes, revision and page size. They are demonstration receipts for that temporary overlay, not reusable cursors for a changed main branch. Regenerate the plan when any pinned input changes; do not edit a cursor to bypass a mismatch.

The approved CSV remains unchanged. All 18 new companies are `seed_review_required`; research discovery or an official HTTPS URL does not authorize a crawl. Preserve the existing allowlists, access controls and throttling. Rights-held sources remain held; timed-out and blocked sources retain their gaps rather than being reconstructed through a bypass.

## Capture bridge

[captures.json](captures.json) was generated with the existing enrichment helper from **accepted-company, reviewed-staged claims only**. It contains concise researcher paraphrases, not full source pages or a lossless export. Its full-ledger hash, selected-ledger hash and included claim IDs allow reconciliation to the authoritative ledger. The generation receipt is in [skill-validation.json](skill-validation.json).

These captures are available for an owner-approved replay path. They have not been submitted to a crawler or proposal endpoint. The structured ledger remains authoritative for exact monetary scope, precision, missing values, conflicts and participation relationships.
