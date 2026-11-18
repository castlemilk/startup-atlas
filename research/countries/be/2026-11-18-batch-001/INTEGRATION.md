# Belgium batch 001: review and integration

## Deliverable boundary

This is a reviewable country research packet. Its 26 records satisfy the current record contract, but acceptance here means **accepted for research staging**, not owner approval, source approval, production publication or a complete founder/funding history. The PR intentionally owns only this directory.

The immutable research/dedup/queue input revision is `f4bcbf7030d741772bb750deee584efa3ee17749`. The country branch and integration validation were refreshed to `ff4d51cf729d6a654787e9a1db63967b292df8c9` after owner PR #179 merged. Before promoting any record, compare against current main and rerun entity/domain/alias deduplication; another country session may have added an overlapping multinational. Preserve all concurrent changes. Do not replace `data/startup-research.json` with `records.json`: this packet contains additions, not the full existing dataset.

## Files

| File | Contract and use |
|---|---|
| `README.md` | Country ecosystem report, accepted identity index, financing decisions and coverage gaps |
| `manifest.json` | Country scope, base revision, owners, counts, source/production boundaries and runtime limitation |
| `records.json` | `{ "startups": [...] }`; 26 proposed current-schema records, with unknown unsupported fields omitted |
| `companies.json` | Research sidecar: normalized identity, geography, founding precision, public founders, transactions, field status and claim references |
| `claims.json` | Claim-level source URL, retrieval/publication/effective dates, confidence, evidence paraphrase, conflict and unknown dispositions |
| `sources.json` | All 128 attempted URLs, including 15 failed accesses; no automatic crawler approval |
| `ecosystem.json` | Ecosystem claim IDs, cohort verification limitation and listed-company comparator |
| `projection-map.json` | Projected objects/fields mapped to source-scoped claim sets; read precise claims for qualifications |
| `coverage.json` | 50-candidate tracked set, exact dispositions, source/pagination gaps and 47-item continuation queue with SHA-256 fingerprint |
| `deduplication.json` | Name/domain/alias comparison against the source-rebuilt baseline; no candidate collisions |
| `baseline-audit.json` | Inspected schema/AGENTS/runbook fingerprints, ownership and distinction between source-rebuilt and stale committed graph |
| `validate_records.mjs` | Uses the repository's actual production record validator, plus substantive rejection/precision checks |
| `validate_packet.py` | Offline checks for provenance, funding relationships, normalization, deduplication, missing values and resumable coverage |
| `validation/` | Actual validation and independent source-review receipts; exact commands are recorded |
| `CHECKSUMS.sha256` | SHA-256 inventory of the complete packet except this checksum file itself |

Research sidecar formats are local to this packet. They do not expand any Atlas production schema, endpoint, allowlist or synthetic investor-contract fixture.

## Reproduce checks

From the repository root:

```bash
node research/countries/be/2026-11-18-batch-001/validate_records.mjs
python research/countries/be/2026-11-18-batch-001/validate_packet.py
```

Verify transferred file bytes from the packet directory:

```bash
cd research/countries/be/2026-11-18-batch-001
sha256sum --check CHECKSUMS.sha256
```

The validators are offline and must not request websites, robots.txt, credentials or a live crawler. They read current repository sources and stage data without rewriting the production overlay or generated graph. The external enrichment helper was also run against `claims.json`; its receipt records the actual helper path/version context. The packet's own validators remain runnable without that user-local skill installation.

## Promotion sequence for the existing owners

1. Review the PR and independent-source checks against the exact proposed commit. Reconcile source conflicts only when new evidence warrants it; do not erase conflicting observations because a record otherwise validates.
2. Rebase or refresh against current main using an isolated country branch. Rerun record validation and deduplication against the current source-rebuilt graph. A normalized-name collision is a review trigger, not permission to merge people, subsidiaries or investor vehicles.
3. Review the `field_status` and `gaps` for each selected company. Confirm whether acquired alumni, mature scale-ups and multinational HQ qualifications belong in the chosen production view. Agomab remains a separate listed comparator in this initial packet.
4. Preserve the missing-year fix from [owner PR #179](https://github.com/castlemilk/startup-atlas/pull/179). The original research baseline emitted zero for absent source years; current main `ff4d51c` omits them. This packet omits `founded_year` and uses separately sourced profile facts. Refreshed validation checks the current builder keeps the omission; do not reintroduce an artificial zero during import. No country runtime change is required or included.
5. Use the repository's existing reviewed startup proposal workflow to add selected records. Add or merge records by the verified canonical entity identity while preserving existing founders, facts, rounds and provenance. Never copy this partial file over the entire production overlay. Do not infer investor graph relationships from the free-text participant notes.
6. Keep the full sidecar ledger alongside any promotion: the production schema cannot represent all date precision, transaction kind, event grouping, legal geography or canonical-investor uncertainty. The synthetic-only investor-round contract is not an approved ingestion route for these real observations.
7. Coordinate production source approval, crawler-seed review and any release with the collection and record owners. A company domain observed here is a discovery result, not an approved fetch target. Preserve host allowlists, throttles, response limits and access controls. A failed source remains failed; no bypass is implied.
8. After any owner-approved merge/release, record the actual source commit, deployed revision and live read-back. Only verified live publication may change claim status to `published_verified`. The country PR itself must not be represented as that state.

## Funding and identity guards

Do not sum the 30 projected financing entries. They include non-equity/mixed facilities and qualified amounts; the richer sidecar additionally includes acquisitions and secondary transactions. Qover's two CIBC announcements share one provisional event group. Swave's June financing is an explicit extension of January. Magnax's 2022 figures conflict, and its 2026 two-stage increase is not presented as a single verified completed raise. I-care's refinancing component, Aerospacelab's institutional commitment, MICLEDI's cumulative figure and Solhyd's conditional ceiling retain separate meanings.

Null amounts/currencies, missing dates, unknown stage, lower bounds and partial founder lists do not mean zero, never-funded, no investors or no other founders. Company biographies can conflate product origin, launch, spin-out and legal incorporation; the four founding conflicts remain unresolved. Registered office, operating location and headquarters are distinct evidence types.

Canonical person/investor IDs remain unresolved unless independently matched. Corporate group names, subsidiaries, fund vehicles, historical domains and product brands are not collapsed automatically. Names such as imec, imec.istart and imec.xpand have separate roles. Public professional founder names are retained; personal contacts are not harvested.

## Continuation and ownership

`coverage.json` is a fixed snapshot of deliberately tracked candidates, not an externally exhaustive population. Continue in its `(priority, queue_id)` order using its revision and queue fingerprint. If new evidence changes the queue, regenerate its fingerprint and start a new checkpoint rather than pretending an old cursor remains valid. The continuation check is a packet test, not a replacement for planner #177 or replay #178.

Collection owner: [existing collection session](https://chatgpt.com/c/6afbc931-0378-83ec-8434-cd7e8db42db2). Planning boundary: [#177](https://github.com/castlemilk/startup-atlas/pull/177). Record owner: [existing record session](https://chatgpt.com/c/6afc35bc-3abc-83ec-aa2c-101dd825be51). Coordination was posted in [the country-lane notice](https://github.com/castlemilk/startup-atlas/pull/177#issuecomment-6974944469); owner acknowledgement remains pending. The [canonical Space](https://chatgpt.com/space/page_5167bcbbbb0c81919e1d565fd4d82e4a) holds the final commit, PR, tests, CI outcome and remaining gaps.

Manifest and claim publication states are checkpoint metadata captured before submission. The PR and Space receipt identify actual remote delivery; neither implies production publication. No merge, workflow dispatch, crawler run, credential change, new spending or MCP deployment is part of this packet.
