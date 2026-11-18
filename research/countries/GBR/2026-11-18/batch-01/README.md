# United Kingdom — GDP cohort 5/30, batch 01

Research checkpoint: **18 November 2026**. This is a staged, source-backed country packet for Startup Atlas. It is not a production overlay replacement, a crawler approval list or a claim to enumerate all UK startups.

## Result

| Measure | Count |
|---|---:|
| Named candidates discovered and reviewed | 32 |
| Accepted for country staging | 27 |
| Proposed new company records | 25 |
| Existing-record enrichments | 2 |
| Context/status holds | 5 |
| Rejected company candidates | 0 |
| Rejected relationship inferences | 2 |
| Production records written or accepted | 0 |
| Claims, including explicit unknown dispositions | 764 |
| Reviewed / candidate / conflict / unsearched claims | 595 / 7 / 8 / 152 |
| Distinct financing/transaction events | 42 |
| Event-specific participant claims | 210 |
| Unique source-registry URLs | 194 |
| URLs with successful access / no successful access recorded | 180 / 14 |
| URLs supporting any claim / reviewed claims | 149 / 141 |
| Pending follow-up queue items | 46 |

The accepted subset includes venture-backed startups and scaleups with UK headquarters, dual headquarters or an explicitly documented UK operating/research base. These are country associations, not exclusive global nationality assignments. A registry's active status alone does not prove current independence or commercial operations.

**New staged records:** Monzo, Starling Bank, Tide, Zilch, Cleo, Stream (formerly Wagestream), Wayve, Quantexa, PolyAI, Luminance, Matillion, Tractable, Oxford Quantum Circuits, Quantum Motion, Riverlane, CMR Surgical, Pragmatic Semiconductor, Paragraf, Tokamak Energy, Chemify, MiAlgae, EnteroBiotix, Amiqus, Space Forge and Cumulus Neuroscience.

**Existing records:** Revolut and Synthesia. The patches add sourced profile facts. Their original root source/review date, founders, founding assertions, existing facts and exact funding events remain unchanged.

**Context holds:** GoCardless and Oxford Ionics are acquired; Phion Therapeutics has an administration-status issue; Ultraleap has acquisition and operating/holding-company boundaries to resolve; ElevenLabs has a New York global parent and a UK affiliate. Their research remains in the packet and is excluded from the 27-company staging count.

## Files

| File | Purpose |
|---|---|
| [ecosystem-report.md](ecosystem-report.md) | Investment context, hubs, sectors, support programmes, investor networks and research implications |
| [company-index.md](company-index.md) | Readable 32-company enumeration with source links and scope |
| [records.json](records.json) | 25 proposed new records, each accepted by the existing strict startup-record validator |
| [existing-record-enrichment.json](existing-record-enrichment.json) | Two minimal, source-preserving patches for existing companies |
| [historical-context.json](historical-context.json) | Five separately held schema-valid company projections; not for an independent-startup import |
| [companies.json](companies.json) | Company-level dispositions, claim references, unknowns and conflicts |
| [claims.json](claims.json) | Atomic facts and dispositions, per-claim sources, retrieval dates, precision, uncertainty and provenance |
| [source-registry.json](source-registry.json) | Deduplicated URLs with access observations, publication/retrieval metadata and access gaps |
| [funding-events.json](funding-events.json) | Event and participant index; canonical investor IDs deliberately unresolved |
| [identity-review.json](identity-review.json) | Baseline matches, proposed IDs and 20 source-backed alias checks |
| [projection-map.json](projection-map.json) | Field-to-claim lineage and precondition hashes for existing records |
| [coverage.json](coverage.json) | Exact bounded denominator and reconciled dispositions |
| [next-source-queue.json](next-source-queue.json) | Stable follow-up IDs, source boundaries, blocking gaps and resume context |
| [research-log.json](research-log.json) | Research lanes, source-access audit and limits of retained search logs |
| [manifest.json](manifest.json) | Baseline, ownership, cohort framing, normalization and delivery boundaries |
| [research-checkpoint.json](research-checkpoint.json) | Completed candidate IDs, pending queue IDs and evidence hashes |
| [baseline-drift.json](baseline-drift.json) | Pre-existing difference between committed graph and a fresh in-memory build of current source data |
| [baseline-inventory.json](baseline-inventory.json), [baseline-planner.json](baseline-planner.json) | Inspected committed inventory and existing planner output |
| [staged-planner-page-01.json](staged-planner-page-01.json) | First bounded planner page using the no-approval fixture |
| [validation.json](validation.json), [ledger-validation.json](ledger-validation.json) | Recorded check results and structural ledger validation |
| [CHECKSUMS.sha256](CHECKSUMS.sha256) | SHA-256 checksums for all other packet files |

## Inspected baseline and ownership

Initial inspection used main `f4bcbf7030d741772bb750deee584efa3ee17749`, including merged [planner PR #177](https://github.com/castlemilk/startup-atlas/pull/177). During research, main advanced through [PR #179](https://github.com/castlemilk/startup-atlas/pull/179), which preserves omitted founding years in graph projection. The isolated country branch was fast-forwarded to **`ff4d51cf729d6a654787e9a1db63967b292df8c9`**; the inspected overlay, graph, startup schema and seed approval bytes were unchanged. No parallel change was replaced.

The baseline contains **45 research-overlay records and 46 graph startup entities**. These are different inventory scopes, not evidence of 45 or 46 UK startups. Existing UK matches in this named batch are `startup:revolut` and `startup:synthesia`. New IDs are proposals confined to this directory until owner review.

**Pre-existing graph drift:** a fresh in-memory build of the baseline source files contains 25 funding events, while committed `data/graph.json` contains 17. Both contain 46 startups; other entity/edge/article totals also differ. The UK preview therefore compares against a fresh baseline build, yielding 71 startups and 54 funding events after the proposed additions. This is an offline hypothetical preview, not a generated-file update or live-publication claim. Details and the eight additional baseline round IDs are in [baseline-drift.json](baseline-drift.json).

This lane owns only `research/countries/GBR/2026-11-18/batch-01/` on `research/uk-gdp05-20261118-batch01`. The [existing collection owner](https://chatgpt.com/c/6afbc931-0378-83ec-8434-cd7e8db42db2) retains crawler, seed, transport, implementation, merge and release coordination. The [canonical Space](https://chatgpt.com/space/page_5167bcbbbb0c81919e1d565fd4d82e4a) records the delivery commit, reviewable PR, exact files and remaining gates. An ownership acknowledgement is not assumed.

## Evidence and schema decisions

The authoritative contract remains `backend/hosted/src/startup-record.mjs`. Nothing in this packet adds production fields, changes an API or deploys MCP. The investor-round contract under `contracts/investor_rounds/` is synthetic-only and was not used for this real evidence.

- Unknown optional fields are omitted from strict record projections. Explicit nulls and reasons stay in the evidence ledger; they never become zero or a complete empty roster.
- Headquarters, office/R&D location, registered office and incorporation jurisdiction remain separate predicates with their source dates. Luminance's UK inclusion is based on a documented Cambridge research base; its global HQ is unresolved. Matillion's dual Manchester/Denver HQ is nonexclusive.
- Founding, legal incorporation, product launch and university spinout milestones retain their definitions. Year/month precision is never padded to a made-up day. Chemify and Paragraf have unresolved founding/establishment observations; no single founding year is projected for them.
- Dollar symbols do not establish USD. Reported numerals are retained as explicitly reported observations while normalized money remains null. CMR's URL slug alone was rejected as currency evidence.
- The projection excludes mixed primary/secondary sales, grants, mixed equity/debt and loan-note conversion packages from ordinary funding-round fields. Their complete typed scope remains in the ledger. Valuation is never substituted for financing proceeds.
- Original rounds, extensions, first/second closes, allocations, commitments and conditional investments retain separate scope. Quantum Motion's second-close proceeds remain unknown; Pragmatic's completed first close is £162m; Riverlane's original and later amounts conflict; CMR's acquisition is an option, not completed ownership.
- A named event participant can be a fund, vehicle, manager or adviser as stated. Event-specific participants are distinguished from generic portfolio lists, grant providers, service providers and overall-round lead references. All canonical investor IDs remain null. No production investor edges were created.
- Founder records contain only publicly sourced professional names/roles and source URLs. Global person-ID reuse still needs owner review. In particular, Monzo and separately held GoCardless share a sourced Tom Blomfield founder name; this is not an automatic person merge.
- Primary institutional, programme and transaction-adviser sources retain their original source labels and publisher roles. The existing enrichment ledger's narrower enum uses `secondary` where it has no institution/adviser-specific value; that does not erase the original source identity.

The original subpacket audit found and corrected ambiguous monetary numerals, stale event/source references, a missing participant name field, a contradictory Starling amount-text fallback and deeptech website claim lineage. Corrections were verified before commit. Claims with unresolved substance remain candidate/conflict dispositions.

## Reproduce the focused checks

Run from the repository root:

```bash
python3 research/countries/GBR/2026-11-18/batch-01/project-records.py
node --test research/countries/GBR/2026-11-18/batch-01/validate.test.mjs
python3 research/countries/GBR/2026-11-18/batch-01/test-resume.py
python3 research/countries/GBR/2026-11-18/batch-01/test-graph-preview.py
```

The projector writes only four local packet projections. The tests read the actual production validator and existing planner; they do not fetch sources or publish. Run checksum verification **before** regeneration when assessing a delivered snapshot:

```bash
cd research/countries/GBR/2026-11-18/batch-01
sha256sum --check CHECKSUMS.sha256
```

The planner rejects the production seed CSV when paired with a subset omitting an approved company's name. That guard is retained and explicitly tested. `staged-unapproved-seeds.csv` is a header-only **offline test fixture**, approving zero seeds. It is not a replacement for the production manifest. The staged planner walks 25 source records in pages of 7, 7, 7 and 4; replay is stable and changed input bytes, revision, seed bytes or page size reject stale cursors. This tests inventory pagination, not crawl completion.

## Integration handoff

1. Fetch current main and compare the baseline hashes and identity inventory. Re-run deduplication if another country or owner has added the same company, domain or alias. Do not force-push another lane or overwrite its directory.
2. Review the full claims for each intended import. A schema-valid projection is not an approval of every unresolved company, founder, legal entity or investor join. Keep the five context holds separate.
3. Apply selected new records through the existing reviewed startup-edit workflow. Never replace `data/startup-research.json` with this 25-record subset. Retain unrelated entries and current source-inheritance guards.
4. For Revolut and Synthesia, check `projection-map.json`'s current-record hash and use the existing merge semantics. These patches intentionally omit funding and founder changes; keep the exact existing event IDs and sources.
5. Review global founder IDs and fund/manager/vehicle identities before creating new graph relationships. Use the underlying event claim, including conditional or debt qualifications, rather than the participant index alone. The real-data investor schema remains an owner decision.
6. Re-run the repository's required graph/database/CI gates on the owner's proposed production diff. The supplied graph preview is in memory only and does not prove live publication.
7. Keep crawler-seed decisions with the collection owner. Discovery, a working website or a programme listing does not approve a seed. Existing access controls, allowlists, throttling and transport remain unchanged.
8. Coordinate merge and release with the existing owner and canonical Space. This research PR contains no merge, release, runtime or deployment action.

## Remaining coverage

The named queue is a purposeful first checkpoint, not a random sample or a country-wide denominator. Complete founder rosters, funding histories, current cap tables and all company statuses are unverified. Headcount was not systematically researched. Portfolio and programme pagination remains open. The next pass prioritizes Northern Gritstone and OSE company pages, Welsh development-bank sources, SETsquared, Techscaler/Catalyst cohorts, Seedcamp, individual UKRI competition pages, and company-specific identity/currency/status gaps.

The cohort is retained exactly as supplied: October 2026 WEO 2026 **nominal GDP estimates**, excluding aggregates, with Taiwan's separately reported economy convention. The supplied IMF endpoint failed through the research tool and the dataset/profile pages exposed JavaScript shells; the packet therefore leaves the GDP value null and does not claim to have recomputed the country's GDP rank.
