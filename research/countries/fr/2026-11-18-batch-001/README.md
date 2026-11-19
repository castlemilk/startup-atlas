# France — GDP 7/30 — batch 001

**Review date:** 18 November 2026. **Country research only.** This packet proposes 23 startup records after reviewing 24 companies; Pasqal is retained separately as a listed-company alumnus. It contains 561 claim/disposition records, 32 selected financing events and six nonadditive package components. It does not publish data, approve sources, dispatch collection or change an API.

Read the [ecosystem report](ecosystem-report.md) for hubs, sectors, programmes, investor networks, the company table and coverage limits. The machine-readable evidence is authoritative where a compact report or production-compatible projection cannot carry all qualifications.

## Ownership and repository basis

- Owned directory: `research/countries/fr/2026-11-18-batch-001/`.
- Branch: `research/fr-gdp-07-batch-001-20261118`.
- Validated main revision: `ff4d51cf729d6a654787e9a1db63967b292df8c9`.
- Initial inspection revision: `f4bcbf7030d741772bb750deee584efa3ee17749`.
- [Existing collection owner](https://chatgpt.com/c/6afbc931-0378-83ec-8434-cd7e8db42db2) retains collection/source admission, transport and merge/release coordination.
- [Planner #177](https://github.com/castlemilk/startup-atlas/pull/177) is consumed unchanged. [Replay #178](https://github.com/castlemilk/startup-atlas/pull/178) remains in its existing implementation lane. The main refresh consumed the owner's [unknown-year fix #179](https://github.com/castlemilk/startup-atlas/pull/179).
- [Canonical Space](https://chatgpt.com/space/page_5167bcbbbb0c81919e1d565fd4d82e4a) carries the exact branch/commit/PR and delivery receipt. A coordination note does not mean the owner has acknowledged or approved admission.

The root `AGENTS.md`, collection skill, agent runbook, knowledge-graph documentation, current record validator, production inputs, existing PR lane and Space ownership were inspected before collection. No shared production dataset, seed CSV, allowlist, runtime, schema, API, deployment configuration or another country's files were edited.

The initial **committed** graph inventory is 537 entities / 46 startups / 17 funding events. The **source-built** graph on refreshed main is 555 entities / 46 startups / 25 events, from an overlay of 45 startup records plus portfolio-derived identities. These are different snapshots. The committed inventory is retained as an inspection receipt, not presented as the source-built current state or a national denominator.

## File map

| File | Purpose |
|---|---|
| `manifest.json` | Country ownership, cohort assumptions, revisions, input hashes and explicit scope. |
| `ecosystem-report.md` | Source-backed ecosystem analysis, 24-company table and next research routes. |
| `companies.json` | Rich normalized dossiers, nulls, precision, scope, conflicts, event components and IDs. |
| `claims.json` | Stable atomic claims/dispositions with per-claim URLs, retrieval/review times and evidence. |
| `sources.json` | Deduplicated URL registry, original source observations and access/reuse holds. |
| `search-log.json` | Contributor search/access logs and root source-read register; not an exact underlying HTTP request count. |
| `production-projection.json` | 23 **unsubmitted**, schema-compatible candidate startup records; 22 representable rounds. |
| `projection-map.json` | Links projected fields to claims/sources and explains deliberate omissions. |
| `normalization-decisions.json` | Explicit corrections and choices, including founding conflicts and Quandela relationships. |
| `dedup-baseline.json`, `deduplication.json` | Pinned source-built identity baseline and each company comparison. |
| `baseline-inventory.json` | Initial committed-graph inspection; presence does not mean fresh verification. |
| `planner-baseline.json` | Unmodified #177 planner result: 45 input records, one already approved seed, 43 requiring review, one missing website. |
| `coverage.json` | Computed discovered/reviewed/accepted/deferred/rejected/published counts and field/source gaps. |
| `review-queue.json`, `checkpoint.json` | Forty recorded identities, 24 bounded dossier reviews completed, 16 remaining, digest and revision fencing. |
| `source-queue.json`, `ecosystem-sources.json` | Ten source-level continuations, company follow-ups, programme denominators and IMF limitation. |
| `validate_packet.py`, `test_packet.py`, `test_projection.mjs` | Offline evidence, normalization, relationship and existing-schema checks. |
| `check_integration.py`, `integration-check.json` | Actual graph-builder dry run in memory, broader organization dedup and owner integration gates. |
| `validation/` | Passing validation and test receipts. |
| `reviews/` | Independent source reviews and normalized-packet audit, including defects found and corrected. |
| `SHA256SUMS` | SHA-256 for the final packet files; the checksum file excludes itself. |

## Meaning of acceptance and evidence

**Accepted staged** means a bounded dossier passed the evidence and identity checks and has a candidate projection. It does not mean production admission, exhaustive funding history, a complete founder list, approval to crawl, approval to reuse assets, or current private-company status verified against every corporate action.

The 40 discovery leads are identities explicitly saved in this packet's queue. Names incidentally visible on pages are not all enrolled. Twenty-four dossiers were reviewed; 23 were accepted for staging, one deferred as alumni, none rejected, and none published. The remaining 16 identities are unreviewed leads. No defensible national denominator or national completion percentage is claimed. Programme denominators refer to dated cohorts, not all French startups.

Canonical company names, reviewed trade aliases and official domains were compared with all 46 source-built startup identities. A separate check covered 332 organization identities, including partners and providers. No company matches were found. Existing person names were also checked before the candidate graph dry run; no automatic collision with the 57 projected founder assertions was found. These are comparisons against the pinned repository, not against unpublished work or every company database.

The rich packet keeps unknown values as null. The production validator does not accept null optional properties, so those properties are omitted. Founding observations use individually sourced `profile_facts`; four unresolved founding conflicts have no selected canonical date. Historical headquarters, operating sites, registered offices, holding companies and legal operators retain distinct scopes. All investor and person canonical IDs remain unresolved in evidence. Proposed startup IDs are candidates only.

Arrays contain the observations verified in this bounded pass. An empty alias or participant list means no qualifying entry was verified here; it does not establish that no alias or investor exists. Founder and funding lists are explicitly incomplete.

Dates preserve year, month or day precision. Pennylane's January 2026 financing and Electra's June 2021 seed have month-level event dates and null announcement days. Retrieval times may be contributor batch receipts rather than exact network-fetch times; that qualification is stored. Root ecosystem sources use day precision. Funding announcement dates, publication dates, legal closing dates, legal creation, registration and expected trading dates are separate facts.

Unspecified dollar denominations remain unnormalized. No FX conversion is performed. Package headlines, equity components, approved debt, conditional grants, cumulative financing and investor contributions are not summed as independent rounds. NVIDIA's announced future Pigment investment is planned only. At Quandela, the three explicitly new subscribers attach to the equity component; three historical backers remain contextual observations. Portfolio, incubation and membership evidence is never converted into event-specific investment evidence.

The 131 registry URLs include 120 with an access observation and 11 without accepted page evidence. Ninety-three URLs support company claims. Access can be partial, historical or context-only. Five company-page source holds are retained; their source URLs are excluded from the production projection. There was no proprietary bulk copy, contact harvesting, asset reuse, paid access, robots request or access-control bypass.

## Reproduce the checks

Run from the repository root with Python 3 and Node.js. These commands read the packet and repository inputs; tests use temporary fixtures. `check_integration.py` does not call the production graph-builder CLI or write generated graph/SQLite files.

```bash
python3 research/countries/fr/2026-11-18-batch-001/validate_packet.py
python3 -m unittest discover -s research/countries/fr/2026-11-18-batch-001 -p 'test_packet.py' -v
node --test research/countries/fr/2026-11-18-batch-001/test_projection.mjs
python3 research/countries/fr/2026-11-18-batch-001/check_integration.py
python3 -m unittest discover -s tests -p 'test_company_profile_plan.py' -v
python3 -m unittest discover -s tests -p 'test_graph.py' -v
```

From this packet directory, verify the saved bytes:

```bash
sha256sum -c SHA256SUMS
```

The checked result is **55 passing automated test cases**: 23 packet regressions, six production-schema checks, 16 planner tests and ten graph/SQLite tests. The installed enrichment helper also validated all 561 claims; its receipt is retained, but that optional skill installation is not required to run the packet's own checks.

The dry run builds 635 candidate entities / 69 startups / 47 funding events **in memory only**. All 555 existing entities and existing edges/rounds remain unchanged. All 23 omitted founding years stay absent after consuming the separately owned PR #179 fix. These candidate counts are not a production publication claim.

## Precise integration sequence for the owner

1. Review the France PR diff and verify that it touches only the owned directory. Merging this research packet is a distinct decision from admitting its candidates to production. Do not treat PR creation or review as a release request.
2. Verify `SHA256SUMS` and rerun the six command groups above at the PR head. Read the independent normalized-packet receipt and its frozen input hashes. If packet evidence changes, refresh the receipt or document the exact reviewed delta.
3. Fetch current main before later admission. Rebuild the identity inventory from the five source files listed in `dedup-baseline.json`; compare normalized names, reviewed aliases, official domains and legal scopes. If the baseline or saved review queue changes, reconcile it explicitly and create a new checkpoint digest. Never replay a stale cursor or silently assume that another country's additions cannot overlap.
4. Review the atomic claims and conflict dispositions, then the candidate projection. `production-projection.json` has a wrapper with a `startups` array; each array element conforms to `backend/hosted/src/startup-record.mjs`. It is not a replacement for `data/startup-research.json`. Validate each candidate and merge by the existing identity/field semantics, preserving every unrelated record and richer existing field.
5. Keep the rich ledger alongside any future import. The production round schema requires a stage and lacks structured package components and participant bindings. Eight selected accepted-company events therefore stay in evidence and source-qualified facts. Do not invent a stage, collapse packages, or convert the 187 event relationships into broad company-investor edges. Resolve fund/manager/vehicle and person identities through the existing owner's workflow before any separate relationship admission.
6. Review source/access and rights holds independently of factual correctness. Public research discovery grants no seed approval. Leave `data/company-profile-seeds.csv`, source allowlists, request bounds, throttling, transport and access controls unchanged unless the authorized collection owner conducts their existing admission process.
7. Coordinate production data merge, generated artifacts, index/public readback and any release with the existing owners. This country packet does not change runtime/schema/API code or deploy MCP. Record the exact admitted subset, commit, deployed revision and readback only after those actions actually occur.

## Resume research

The next 16 company leads are Entalpic, Cailabs, HyPrSpace, Leanspace, DIAMFAB, SteerLight, Inbolt, NIRYO, NETRI, SeqOne, YesWeHack, Welinq, Agicap, Deepki, Sweep and Akur8. Their programme-source URLs and candidate domains are in `review-queue.json`. They are not yet verified company dossiers.

`checkpoint.queue_sha256` hashes canonical JSON of the queue's **items array**, not the raw file. `remaining_work` verifies revision, digest and unique completed work IDs before returning the 16 remaining identities. Completed means the bounded initial dossier review was performed; it does not close the separate company-gap queue. Rechecking a current company and enumerating a new company are distinct work items.

Follow with regional cohorts and the Tremplin list to reduce the first batch's Paris and funding-visibility bias. Programme pages and directories were not fully paginated. The IMF API payload was unavailable, so the numerical GDP value remains null and France's rank 7 is the supplied cohort label rather than an independently recalculated result.
