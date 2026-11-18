# Türkiye — GDP cohort 16/30 — first research checkpoint

**21 accepted company identities; 22 company profiles reviewed; no production records published.**

This bounded country packet was researched on 18 November 2026. It includes acquired companies, a public company and foreign-headquartered companies with sourced Türkiye associations. Acceptance means a reviewed identity and selected assertions, not that every field is known or that each company is currently a private startup.

The user supplied the ordinal 16/30 for the IMF October 2026 WEO cohort. October release metadata was verified; the requested NGDPD API values and exact country-only ranking could not be independently recomputed.

## Read first

| File | Purpose |
| --- | --- |
| [REPORT.md](REPORT.md) | Ecosystem analysis, hubs, sectors, programmes, networks, measurement and gaps |
| [COMPANIES.md](COMPANIES.md) | All 21 identities, canonical websites, founding/geography distinctions, founders, selected events and conflicts |
| [source-registry.md](source-registry.md) | Human-readable source catalogue with exact URLs and access observations |
| [sources.json](sources.json) | Machine-readable 152-source registry |
| [companies.json](companies.json) | Rich staged facts, nulls, scopes and event-specific participants |
| [claims.json](claims.json) | 366 atomic claims with provenance, retrieval/review times and dispositions |
| [startup-records.json](startup-records.json) | 21 conservative projections into the unchanged Atlas startup schema |
| [projection-map.json](projection-map.json) | Per-field claim joins, normalization corrections and omitted information |
| [coverage.json](coverage.json) | Counts, definitions and exact-byte resume checkpoint |
| [review-decisions.json](review-decisions.json) | Accepted identities, held Reengen, exclusions and 11 discovery-only leads |
| [next-source-queue.json](next-source-queue.json) | 32 prioritized continuation tasks; no crawler approvals |
| [INTEGRATION.md](INTEGRATION.md) | Reproduction, owner boundaries and precise integration gates |
| [REVIEW.md](REVIEW.md) | Independent review findings, corrections and remaining production limitation |
| [manifest.json](manifest.json) | Staged delivery manifest and validation inventory |
| [SHA256SUMS](SHA256SUMS) | SHA-256 for every other packet file |

`contributions/` preserves lane observations. Normalized files and their explicit corrections are authoritative. `evidence-captures/` contains partial researcher paraphrases, not downloaded pages or a lossless replacement for the claim ledger.

## Counts and denominators

| Measure | Count |
| --- | ---: |
| Deliberately enrolled company candidates | 34 |
| Separate domain-identity candidate | 1 |
| Company profiles fully reviewed in this pass | 22 |
| Accepted into research staging | 21 |
| Held company profile | 1 |
| Excluded company-name collision | 1 |
| Excluded domain candidate | 1 |
| Discovery-only company leads awaiting review | 11 |
| Claims: reviewed / conflict / candidate | 357 / 8 / 1 |
| Source URLs: accessed / partial / unavailable or failed | 129 / 8 / 15 |
| Company–founder assertions, not resolved unique people | 50 |
| Selected events in the funding/corporate sidecar | 29 |
| Current-schema financing-round projections | 24 |
| Separate debt-facility claims / corporate-event claims | 2 / 4 |
| Ecosystem findings / continuation tasks | 19 / 32 |
| Production publications / crawler-seed approvals | 0 / 0 |

The 29 selected events comprise 16 classified equity events, 10 financing events with unspecified instruments, two acquisitions and one mixed equity/secondary/debt transaction. They must not be summed as a national venture funding measure. Unknown amounts and currencies stay null. Only nine projected round amounts are numeric; other accepted companion-source amounts remain separately sourced.

The national startup denominator is unknown. Directory pagination, programme cohorts and historical funding histories have not been exhausted.

## Validation and production gate

The unchanged startup validator accepts all 21 projections. The packet checker validates identities, claim/source joins, event relationships, date precision, nulls and checkpoint hashes. The existing planner is exercised against a temporary 66-row overlay: all 21 new rows require seed review; a saved cursor resumes exactly and rejects revision, byte or page-size drift. No crawler runs.

An in-memory graph build produces 67 startup identities, with no matches against the 46-startup baseline or within this batch. Initial validation reproduced an unknown-year-to-zero issue for six projections; that receipt is retained in `validation/initial-packet.json`. The final main refresh incorporated merged owner [PR 179](https://github.com/castlemilk/startup-atlas/pull/179) and [PR 181](https://github.com/castlemilk/startup-atlas/pull/181). Fresh validation at `988a4dd` preserves all six omissions and all known years, with no identified graph semantic blocker. **Production adoption remains a separate owner review and live-revision gate.** No hosted deployment or record publication is claimed.

Run from the repository root:

```bash
python3 research/countries/tr/2026-11-18-batch-001/validate_packet.py
node research/countries/tr/2026-11-18-batch-001/validate-records.mjs
python3 research/countries/tr/2026-11-18-batch-001/validate-planner.py
python3 -m unittest discover -s research/countries/tr/2026-11-18-batch-001 -p 'test_packet.py' -v
```

## Ownership

Only this directory is owned by this country task. Source main is pinned in `baseline.json`; branch is `research/turkiye-gdp16-20261118-batch01`. The [collection owner](https://chatgpt.com/c/6afbc931-0378-83ec-8434-cd7e8db42db2), [planner 177](https://github.com/castlemilk/startup-atlas/pull/177), record owners and release owners retain their responsibilities. The synthetic replay contract from PR 178 is not a route for publishing these real companies.

The [canonical Space](https://chatgpt.com/space/page_5167bcbbbb0c81919e1d565fd4d82e4a) and country PR carry the exact commit, review and delivery receipt. No owner acknowledgement, merge or release approval is inferred. No production data, shared code, approved seed list, permissions, credentials, access controls or MCP deployment is changed.
