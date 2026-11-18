# Netherlands — GDP cohort 18/30 — research batch 001

Research checkpoint: **18 November 2026**. This packet stages **23 company records**, **28 financing events**, **55 public founder attributions**, **132 event-specific investor/participant observations**, and **3 separately typed lender/programme observations**. It supplies an ecosystem report, a source registry, explicit uncertainty and conflict records, current-schema projections, and a bounded continuation queue. It does not change production records.

The country/economy cohort is the user's **IMF October 2026 WEO 2026 nominal GDP estimate** cohort, excluding aggregates, with Taiwan treated as a separately reported IMF economy. Netherlands position 18 is a **user-supplied scope label**. The specified IMF API returned `DisabledError`; the WEO page exposed a JavaScript template. The GDP value, exact edition and independently verified rank remain null. No other WEO vintage was substituted.

## Ownership and repository baseline

- Repository: [castlemilk/startup-atlas](https://github.com/castlemilk/startup-atlas).
- Pinned main: [`f4bcbf7030d741772bb750deee584efa3ee17749`](https://github.com/castlemilk/startup-atlas/commit/f4bcbf7030d741772bb750deee584efa3ee17749); base tree `854c7e4fd9d50f9c3cf50167c9f96dce934e4d96`.
- Country branch: `research/netherlands-gdp18-20261118`.
- Owned path: `research/countries/nl/2026-11-18-batch-001/` only.
- Existing collection owner: [collection session](https://chatgpt.com/c/6afbc931-0378-83ec-8434-cd7e8db42db2). Source-inventory and implementation coordination remains with [planner #177](https://github.com/castlemilk/startup-atlas/pull/177), whose merged source-inventory work was inspected. The synthetic packet replay merged through #178 is not activated for this research.
- Canonical coordination: [Startup Atlas Space](https://chatgpt.com/space/page_5167bcbbbb0c81919e1d565fd4d82e4a). This country's notice and final delivery receipt occupy its own section. Owner acknowledgement is pending; a posted checkpoint is not an acknowledged handoff.

Root `AGENTS.md`, the collection skill, runbook, knowledge-graph documentation, current record validator, graph builder, existing records, open work and the live index revision were inspected before research integration. Current implementation owners, unrelated open PRs and other country packets are preserved. Source allowlists, throttles, access controls, schema/API, collection runtime and deployment configuration are unchanged. No robots requests, spending, credential changes, private contact collection or outreach occurred.

## Counts and inclusion rules

| Measure | Count | Meaning |
|---|---:|---|
| Enumerated candidate identities | 35 | Fixed list in `candidate-ledger.json`; not every incidental company mention on a source page |
| Reviewed identities | 25 | Includes accepted and deferred identities |
| Accepted for research staging | 23 | Current-schema projections plus rich evidence; not production approval |
| Deferred | 2 | Meatable historical/status review; Battolyser Systems predecessor review |
| Rejected identities | 0 | No rejection of entity existence is implied by a historical hold |
| Pending company verification | 10 | Four Innovation Industries and six HighTechXL discovery leads |
| Financing events | 28 | Selected dated events; not a complete funding history |
| Public founder attributions | 55 | Verified subsets; no assertion that each roster is exhaustive |
| Event-specific participant observations | 132 | Names and source roles; canonical legal investor IDs unresolved |
| Lender/programme support observations | 3 | Kept outside the investor-participant count |
| Claims, conflicts and dispositions | 527 | Company ledger; ecosystem observations are separately sourced in `ecosystem.json` |
| Registry URLs | 155 | 153 accessed; 147 eligible for factual evidence |
| Additional access-gap URLs | 11 | Distinct URLs outside the 155-entry registry |
| Unique curated source/gap URLs | 166 | Not an HTTP-request count or a national source denominator |
| Continuation queue entries | 37 | Named-company follow-ups and bounded source batches |
| Actual crawler runs / seed approvals / production records written | 0 / 0 / 0 | Research discovery does not approve collection |

The arithmetic is **35 = 25 reviewed + 10 pending**, and **25 = 23 accepted + 2 deferred + 0 rejected**. Reviewed and accepted are overlapping categories, not totals to add together.

Inclusion is Netherlands headquarters **or a documented substantial Dutch operating base**. This deliberately retains geographically qualified cases such as Cradle's Amsterdam/Zurich footprint, Mews' Prague origin and Amsterdam headquarters, and Onera's historical US versus current Dutch headquarters. It is not a census of Dutch incorporated companies. Headquarters, operating sites, legal entities, incorporation dates and founding dates remain distinct.

The reviewed ecosystem report describes nine hubs, nine regional development agencies covering twelve provinces, five public financing/programme sections and nine investor managers. Techleap/TNO's 11,301 active-tech-company population describes their **2025 report universe**, not this packet's denominator. National startup completeness and the national registered-company population remain unknown.

## Files

| File | Purpose |
|---|---|
| [ecosystem-report.md](ecosystem-report.md) | Source-backed hub, sector, accelerator, programme, investor and coverage analysis |
| [company-register.md](company-register.md) | Readable register of the 23 staged companies and selected financing |
| [companies.json](companies.json) | Authoritative rich research sidecar: aliases, HQ/incorporation, precision, founders, instrument types, event participants, conflicts |
| [startup-records.json](startup-records.json) | 23 strict projections accepted by the existing `validateStartupRecord` schema |
| [claims.json](claims.json) | 527 source-backed company claims, source conflicts and explicit unknown/unsearched dispositions |
| [source-registry.json](source-registry.json) | Primary-source metadata, retrieval semantics, accessed/usable status, additional access-gap registry |
| [ecosystem.json](ecosystem.json) | Structured hub, programme, geography, investor and population observations |
| [candidate-ledger.json](candidate-ledger.json) | Every counted candidate and its acceptance/defer/pending decision |
| [coverage.json](coverage.json) | Reconciled counts, dimensions, bound input hashes and resume checkpoint |
| [next-sources.json](next-sources.json) | 37 bounded continuation entries; every seed remains unapproved |
| [research-log.json](research-log.json) | Search logs, reconstructed intent where labelled, access failures and unresolved research gaps |
| [baseline-inventory.json](baseline-inventory.json) | Pinned source-data inventory, with committed/built/live distinctions |
| [deduplication.json](deduplication.json) | Domain/name/alias/slug checks and unresolved investor-name match candidates |
| [manifest.json](manifest.json) | Base, ownership boundary, counts, source hashes and production integration holds |
| [validation.json](validation.json) | Actual schema, provenance, funding, graph, resume and existing-test receipts |
| [project.py](project.py) | Deterministic country-only projection and manifests, guarded by pinned source bytes |
| [validate-records.mjs](validate-records.mjs) | Current-schema and loss-aware projection checks, including negative controls |
| [validate.py](validate.py) | Provenance, identity, relationship, count, graph and resume validation |
| [checksums.sha256](checksums.sha256) | SHA-256 of every delivered file except the checksum file itself |

The country sidecar formats are research formats, **not additions to the application's runtime schema**. The current schema has no structured aliases, HQ/incorporation or round-participant fields. Supported `profile_facts` carry bounded sourced observations; the sidecar and claims ledger retain the richer distinctions. Do not discard those files after import.

## Material interpretation and integration decisions

**Identity continuity.** Q*Bird and Falqon Systems are one continuing company under an explicitly sourced rename. The September 15, 2026 date is the transition announcement; an independently verified registry-effective name-change date is unknown. Alquion is a merger-formed 2026 venture. Battolyser Systems and VDL Hydrogen Systems are predecessor businesses, not aliases, and their historical financing is not carried into Alquion.

**Lifecycle.** Agronomics' December 19, 2025 RNS reports a resolution to dissolve Meatable and terminate operations, with statutory winding-up to follow. The packet does not assert the completion date of legal dissolution. Meatable is held for a separate historical record rather than projected as an active startup.

**Geography and dates.** A lab, office, programme membership, registered office or B.V. suffix does not establish headquarters or a complete incorporation record. Source precision is retained: QuiX and Falqon founding months stay months; Nearfield's company-reported founding day is distinct from legal incorporation. Qblox's 2018/2019 conflict leaves its selected founding value null. Picnic's conflicting company-reported KvK identifiers are withheld. A `conflict` claim may describe alternative source observations with `selected_value: null`; that is not a positive assertion of either candidate value.

**Funding composition.** SMART Photonics' EUR100m and Axelera's EUR210m are mixed packages. Falqon's EIC award separates EUR2.5m grant and EUR5m equity. Catawiki's EUR150m combines primary and secondary transactions. Leyden's EIB agreement and Crisp's ABN AMRO facility are debt. Generic financing announcements with no explicit legal instrument remain unspecified. Whole-package and debt figures stay typed in the sidecar and use `amount_text` in the legacy projection. No aggregate total is calculated across currencies or instruments.

**Currency and event identity.** Bare dollar symbols remain unresolved where the reviewed sources do not identify the currency. Mews' investor-reported EUR264m and the same event's `$300m` display are one financing, without an assistant FX conversion. Qblox's differing dollar displays and EUR investor amount remain separate observations of one event. Onera's title/body precision conflict is not forced into a single exact numeric value. Separate currency evidence for Rocsys, Axelera, DataSnipper and Nearfield remains linked.

**Participants.** Portfolio membership, guarantees, programme support, shareholder status and event participation are separate relationships. Falqon's EIC Accelerator entry remains a programme; EIB and ABN AMRO remain lenders. Names, lead roles and source-specific fund/manager wording are retained. Canonical investor IDs are null until the existing identity owner resolves them; no investor graph target IDs are fabricated.

## Validation and owner handoff

The reproducible checks use Node and Python standard libraries and import the unchanged Atlas record validator and graph builder. From the repository root:

```bash
node research/countries/nl/2026-11-18-batch-001/validate-records.mjs
python3 research/countries/nl/2026-11-18-batch-001/validate.py
```

To rebuild the country projection after an intentional evidence correction, run:

```bash
python3 research/countries/nl/2026-11-18-batch-001/project.py
```

The projector refuses to use changed production source bytes or changed schema/builder code under the old base label. If main advances, compare its actual source files and concurrent country packets, rerun identity review, and explicitly establish a new checkpoint before importing. Do not disable the guard to manufacture a passing receipt.

Validation covers 23 records and all 28 events; malformed amount/currency pairs, month-only dates, missing founder provenance, duplicate event IDs and unsupported HQ schema fields are rejected. Additional checks cover Unicode/name/domain normalization, lossy slug collisions, source joins, nulls, event roles, disposition arithmetic, stale resume fingerprints and duplicated progress.

The pinned graph rebuilt in memory contains **555 entities and 46 startup identities**, from **45 startup overlay records**. The committed `data/graph.json` is older and contains **537 entities**. The live MCP index reported the pinned revision as current; its Netherlands string search returned zero matches, which is not a geographic census. The dry run with this batch contains **633 entities, 69 startup identities and 53 funding events**, with **55 new sourced founder edges** and existing records unchanged. These are test outputs, not published counts.

There is one explicit existing-runtime hold: `make-graph.py` serializes an absent founding year as `0`. **Qblox must preserve an unknown year through a production importer/renderer before publication.** Its staged current-schema record omits `founded_year`; the research PR does not modify the runtime to solve another owner's task. The dry-run validation records this behavior rather than hiding it.

The existing `mergeStartup` also preserves omitted values. If newer main already contains a matching company or financing ID, omission of an uncertain numeric amount or founding year will not clear the old value. Owner review must reconcile the previous value and provenance explicitly. Never use schema-invalid nulls as an erasure mechanism or append this batch blindly to production.

The appropriate handoff is a **country-only reviewable PR**, retaining this packet as staged evidence. Collection, investor/schema, merge and release owners decide their subsequent work. A successful packet PR, its CI or its preview does not mean the 23 companies have been published in Atlas, that any sources are approved for crawling, or that MCP was deployed.

## Resume and remaining gaps

The next named batch is **PhotonBridge, EUCLYD, eyeo and Groove Quantum**, discovered through Innovation Industries. The following six identity checks are **Zermicor, Maris Carbon, Perovix, Luba Labs, Grape Systems and Vialign**, discovered through HighTechXL. All ten canonical domains and HQ/incorporation fields remain null pending company-source review. The checkpoint binds candidate, company, source-registry and queue hashes; changed inputs require a new checkpoint.

Subsequent bounded sources prioritise Leiden Bio Science Park, StartLife, NOM/northern Netherlands, UtrechtInc, YES!Delft/Novel-T, PortXL and the remaining regional development agencies. HighTechXL exposed six cards against a 22-result UI count; Leiden List and Overview modes have different page sizes/counts; Rockstart exposed a JavaScript-dependent `Show(247)` control and one fallback card. None is treated as a unique Dutch startup denominator or an exhausted source.

Current-status conflicts remain visible: ACE's reported cessation versus stale university referrals, StartLife's inconsistent intake dates, and RVO Seed Capital's closed fund-tender window versus search summaries. The November 17 deep-tech report and the detailed State of Dutch Tech PDF were inaccessible through the available reader. Company histories, exact legal entities, undisclosed participants, full financing archives, the IMF vintage and some explicit currency labels remain bounded follow-up work. No completeness claim is made.
