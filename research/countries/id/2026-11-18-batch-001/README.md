# Indonesia — GDP cohort 17/30 — research checkpoint 001

**23 source-backed company records are staged for review.** This packet also retains one listed alumnus, 15 unreviewed names from a finite university cohort, the ecosystem report, evidence ledger and resumable source queue. It does not alter production records or claim an exhaustive Indonesian startup census.

Research date: **18 November 2026**. Refreshed and validated baseline: [`ff4d51cf729d6a654787e9a1db63967b292df8c9`](https://github.com/castlemilk/startup-atlas/commit/ff4d51cf729d6a654787e9a1db63967b292df8c9). Initial research inspected `f4bcbf7030d741772bb750deee584efa3ee17749`; all five production source-data hashes remain unchanged after the refresh. Owned path: `research/countries/id/2026-11-18-batch-001/`. Branch: `research/indonesia-gdp17-20261118-batch01`.

The cohort label **GDP 17/30** is user supplied. The requested measure is IMF October 2026 WEO nominal GDP estimates for 2026, excluding aggregates; it is not final actual GDP. The official edition was observed during research, but the supplied NGDPD API could not be read, so Indonesia's numeric value and independently calculated rank remain null. No other vintage was substituted. See the exact evidence and retrieval limits in [manifest.json](manifest.json) and [ecosystem report](ecosystem-report.md).

## Deliverables

| File | Purpose |
| --- | --- |
| [ecosystem-report.md](ecosystem-report.md) | Hubs, sectors, programmes, incubators, capital networks, company table and remaining gaps, with primary-source links |
| [records.json](records.json) | 23 individually valid records for the existing Atlas startup-record schema; conservative scalar projection |
| [company-index.json](company-index.json) | Canonical names/domains, scoped aliases, founding/geography observations, unknowns and pointers into detailed evidence |
| [funding-events.json](funding-events.json) | 29 capital events, instrument/amount scope, date precision, components and event-specific participant evidence |
| [evidence-ledger.json](evidence-ledger.json) | 505 source-backed claims, conflicts and explicit dispositions, with stable claim IDs |
| [source-registry.json](source-registry.json) | 148 source observations across 147 distinct registered URLs; retrieval dates, kinds and access outcomes |
| [coverage.json](coverage.json) | Candidate denominator, outcomes, source/pagination gaps, search logs and a pinned 39-item research continuation queue |
| [projection-map.json](projection-map.json) | Mapping of 26 schema funding records to research events, including JULO's equity component |
| [deduplication.json](deduplication.json) | Name, host and production-ID comparisons against the pinned source inventory |
| [INTEGRATION.md](INTEGRATION.md) | Exact verification commands, owner gates and controlled integration steps |
| [validation.json](validation.json) and [validate-packet.py](validate-packet.py) | Reproducible offline validation and actual results |
| [review-receipt.json](review-receipt.json) | Independent semantic review corrections and supplementary source rechecks |
| [checksums.sha256](checksums.sha256) | SHA-256 integrity manifest for all packet files except the checksum manifest itself |

The four files in [evidence/](evidence/) retain the detailed company and ecosystem observations, source-specific review notes and search histories. They preserve richer metadata that the current production schema cannot express. They are research evidence, not native crawler captures.

## Bounded coverage

| Measure | Count | Meaning |
| --- | ---: | --- |
| Discovered profile candidates | 39 | Explicit registry: 24 selected profile candidates plus 15 names from ITB's 2025 roster |
| Reviewed profile candidates | 24 | Identity and available claim evidence reviewed within the documented source bounds |
| Accepted staged company records | 23 | Indonesia ecosystem relevance established; complete current lifecycle is not asserted |
| Listed-alumnus context | 1 | Fore Coffee, kept outside the startup projection pending collection-owner taxonomy |
| Rejected candidates | 0 | The listed company is a scoped context disposition, not an invalid-company rejection |
| Discovered, unreviewed candidates | 15 | Domains, identity, founders, geography and financing still require company-level verification |
| Public professional founder records | 52 | Sourced subsets; founder lists are not represented as exhaustive |
| Capital events in evidence | 29 | Includes venture financing, facilities and separately classified capital transactions |
| Funding records in schema projection | 26 | Three non-round transactions remain sidecar-only |
| Event-specific participant observations | 140 | Repeated across different events; this is not a unique-investor count |
| Claim/disposition rows | 505 | 457 reviewed claims, 8 conflict rows, 23 unsearched, 16 searched unknown and 1 blocked disposition |
| Registered source observations / unique URLs | 148 / 147 | Repeated URL observations remain identifiable; not a count of HTTP requests |

GoTo, Bukalapak and eFishery are additional ecosystem context, outside the profile-candidate denominator. Other names appearing incidentally in portfolio examples are not claimed as individually enumerated. The only complete source roster transcribed here is the **15-name ITB PRIME STeP 2025 selection list**; its 15 company profiles have not yet been verified. There is no defensible national startup denominator.

The accepted companies are **Ajaib, ALAMI, Aruna, Astro, CrediBook, DANA, Evermos, Fazz, FishLog, Flip, Halodoc, JALA, JULO, Kopi Kenangan, Mekari, Paxel, Pintu, Praktis, Ruangguru, SIRCLO, Traveloka, Waste4Change and Xendit**. Their canonical domains and evidence are in the company table and machine files.

## Evidence decisions that affect integration

**Geography has scope and time.** Traveloka's official history records Indonesian origin, while its current careers page names Singapore global headquarters and BSD City as the largest employee hub. JULO's Indonesian operating business and Singapore holding company are separate observations. Office addresses, announcement datelines, project countries and legal-name footers are not automatically incorporation or headquarters evidence.

**Amounts have transaction meaning.** JULO's USD80 million mixed financing contains USD30 million equity and a USD50 million facility; the schema projection uses only the equity component. Traveloka's USD300 million credit facility and DANA's USD25 million individual investor placement use `amount_text`, avoiding an ambiguous round-total scalar. DANA's USD200 million share transfer and USD55,759,624 receivables conversion are separate historical transactions. Fazz's USD75 million equity excludes a USD25 million debt-facility term sheet. These events are not summed into a country funding total.

**Unknown is not zero.** ALAMI's investment amount and Flip's second-close amount remain unknown. Paxel's USD23 million versus USD14.5 million source assertions remain unresolved in scope; numeric amount/currency are omitted from the schema projection. CrediBook's March/April event-date discrepancy remains unresolved. Date precision is retained rather than inventing a first-of-month or first-of-year day.

**Identity joins remain conservative.** Kopi Kenangan's brand/group and international-brand observations do not establish a single legal recipient across all historical financings. Fazz's Payfazz/Xfers predecessors are not aliases for automatic merging. Investor manager, fund, corporate parent and LP are distinct roles. All investor/founder canonical graph IDs remain unresolved pending owner reconciliation; no portfolio membership becomes a funding-round investment edge.

Detailed source URLs for these decisions are retained per claim and per event, and discussed in the [report](ecosystem-report.md).

## Validation and production boundary

All **23 records pass the current repository validator**. The ledger passes the enrichment skill's evidence validator. The country validator checks source joins, missing values, currency pairing, date precision, Unicode/name/host normalization, existing-record deduplication, participant-event bindings, component projection and resumable-queue integrity. Its four negative fixtures reject a missing currency, a zero standing for an unknown amount, a changed queue with a stale checkpoint and a completed candidate being requeued.

Rebuilding graph inputs **in memory** yields 69 startups and 51 funding records after adding the staged projection to the 46-startup/25-round source baseline. No existing company name, canonical host or startup ID collides. The committed `data/graph.json` was older than those source inputs: its 537 entities/17 rounds must not be confused with the rebuilt baseline's 555 entities/25 rounds. Both snapshots retain explicit provenance.

The review identified two existing integration behaviors and refreshed against the owner's intervening fix:

1. **Resolved on refreshed main:** [owner PR #179](https://github.com/castlemilk/startup-atlas/pull/179) fixes the graph builder's omitted-founding-year fallback. Revalidation at `ff4d51c` confirms all nine deliberate omissions remain absent and no staged unknown becomes zero. Earlier review notes retain the initial finding as historical evidence.
2. The startup merge function preserves old amount/currency fields when an incoming same-ID event omits them. The pinned baseline contains no duplicates, but a future overlapping record must receive a fresh merge review; omission does not clear an old value.

This packet includes the owner's fix through its refreshed base and makes no shared-component edits. It leaves production overlays, schemas, APIs, seeds, allowlists, workflows and deployment configuration unchanged. No crawl, robots.txt request, credential operation, paid acquisition, outreach or deployment was performed. The claims remain `unsubmitted` with respect to production, even when the research files themselves are proposed in a PR.

## Ownership and continuation

The [existing collection owner](https://chatgpt.com/c/6afbc931-0378-83ec-8434-cd7e8db42db2) retains collection decisions. The [canonical Space](https://chatgpt.com/space/page_5167bcbbbb0c81919e1d565fd4d82e4a) remains the coordination record. [Planner #177](https://github.com/castlemilk/startup-atlas/pull/177) and [saved-packet replay #178](https://github.com/castlemilk/startup-atlas/pull/178) are already merged at the pinned baseline; this country queue does not replace their inventory, cursors or source-approval workflow. [The Indonesia scope notice](https://github.com/castlemilk/startup-atlas/pull/177#issuecomment-6974838009) records this boundary. Owner acknowledgment was not observed during research.

Resume at `ID-EQ001`, the finite ITB roster, then follow the ordered queue and specific access/pagination gaps. Each further checkpoint should retain exact visited sources, field dispositions, bounded denominator and stop reason. Discovery remains separate from crawler-seed approval. Merges, production acceptance and releases stay with the existing owners.
