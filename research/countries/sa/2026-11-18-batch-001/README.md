# Saudi Arabia — batch 001 — 18 November 2026

**25 source-backed company records staged for owner review; production integration remains gated.**

- Selected candidate queue: 28 discovered, 27 reviewed, 25 accepted, 3 deferred, 0 rejected.
- Evidence: 469 claims (460 reviewed/staged, 9 conflicting), 153 unique source URLs.
- Financing: 36 observations; 32 current-schema events; 147 event-specific participant assertions.
- Founders: 54 sourced company–founder links, with one cross-company name match left unresolved.
- Next work: 43 source/field queue entries and 308 field-coverage work items; 8 extra unreviewed discovery leads.
- Production writes, crawler runs and new crawler approvals: zero.

## Read and review

| File | Purpose |
|---|---|
| [REPORT.md](REPORT.md) | Country research, company enumeration, material exceptions, coverage and gaps |
| [ECOSYSTEM.md](ECOSYSTEM.md) | Institutional, programme and hub detail with primary links |
| [startups.json](startups.json) | 25 records compatible with the current hosted startup-record schema |
| [entities.json](entities.json) | Lossless staged identity, geography, founding precision, gaps and field dispositions |
| [claims.json](claims.json) | Claim-level evidence, source URLs, dates, uncertainty and conflicts |
| [sources.json](sources.json) | 153 unique URLs and access outcomes |
| [projection-map.json](projection-map.json) | Claim-to-schema mapping and deliberate sidecar exclusions |
| [coverage.json](coverage.json) | Bounded counts and no national completeness assertion |
| [coverage-work-items.json](coverage-work-items.json) | 308 source-bound per-company field states |
| [next-source-queue.json](next-source-queue.json) | 43 prioritized resumable tasks, not approved crawler seeds |
| [manifest.json](manifest.json), [SHA256SUMS](SHA256SUMS) | Frozen input/output hashes and resume binding |
| [INTEGRATION.md](INTEGRATION.md) | Exact offline replay and owner integration instructions |
| [validation-packet.json](validation-packet.json) | Structural/provenance checks, dedup and actual graph simulation |
| [planner-checkpoint.json](planner-checkpoint.json) | Existing #177 planner baseline pagination and seed-state receipt |
| `inputs/`, `research-decisions.json`, `review-corrections.json`, `source-attempts.json` | Preserved research snapshots, mappings, corrections and available request logs |

The accepted label means suitable for country staging review, not published truth or eligibility for automatic import. `publication_state: unsubmitted` on individual source observations describes their frozen collection state. Git PR status is tracked in the canonical Space and PR, independently from source review and production publication.

## Ownership

- Owned path: `research/countries/sa/2026-11-18-batch-001/`.
- Branch: `research/saudi-arabia-gdp19-20261118-batch01`.
- Base main: `988a4ddcc4dbbc853da0c7f7899b6d6e7579f840`.
- [Canonical Space](https://chatgpt.com/space/page_5167bcbbbb0c81919e1d565fd4d82e4a).
- [Existing collector owner](https://chatgpt.com/c/6afbc931-0378-83ec-8434-cd7e8db42db2); [planner #177](https://github.com/castlemilk/startup-atlas/pull/177).
- No production arrays, shared schemas, APIs, crawler controls or release configuration changed.

## Integration gates

1. Unknown founding years remain null/omitted. The initial graph-zero finding was fixed upstream in [PR #179](https://github.com/castlemilk/startup-atlas/pull/179) and verified on the final baseline; no country-owned implementation change was needed.
2. Native graph name-only matching would coalesce the Tamara/Nana founder name Abdulmajeed Alsukhan. Confirm the canonical person mapping before promotion.
3. Existing collector/record/relationship owners must review identity and lossy-schema projection; typed investor edges are not added by this packet.

Full source histories, current company statuses, national coverage and roster pagination remain incomplete. See the report and queue for the exact gaps.
