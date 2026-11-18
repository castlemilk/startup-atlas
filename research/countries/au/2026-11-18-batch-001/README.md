# Australia · GDP cohort 14/30 · Research batch 001

**Reviewed 18 November 2026. Staged research and data only.** This packet contains 24 reviewed companies: **23 accepted for staging and one held**, with **16 proposed additions, seven guarded edits, and 24 further discovery candidates**. It is a bounded first checkpoint, not an Australian startup census or a complete financing history.

Read the [ecosystem report](ECOSYSTEM.md) for the hub, sector, accelerator, public programme and investor-network analysis. The complete company observations and source qualifications are in [companies.json](companies.json) and the [claim ledger](claims.json).

## Repository, cohort and ownership

Research and deduplication were pinned to main **`f4bcbf7030d741772bb750deee584efa3ee17749`**. The repository AGENTS instructions, collection skill, agent runbook, graph documentation, current startup record/edit schemas and funding relationship contract were inspected before research. The live Atlas read reported the same main revision. No API or production schema was expanded.

The branch is **`research/australia-gdp14-batch01-20261118`**. Its owned path is this directory only. The [existing collection owner](https://chatgpt.com/c/6afbc931-0378-83ec-8434-cd7e8db42db2) retains collection, source-retention and runtime decisions. The [crawler planner in PR #177](https://github.com/castlemilk/startup-atlas/pull/177) remains the implementation reference; this packet neither replaces that planner nor supplies approved crawler seeds. Record and investor owners retain identity/relationship promotion, merge and release decisions. The [canonical Space](https://chatgpt.com/space/page_5167bcbbbb0c81919e1d565fd4d82e4a) is the coordination record.

The country position **14/30 is user-assigned** under the IMF October 2026 WEO nominal GDP estimates for 2026, excluding aggregates and treating Taiwan under IMF's separately reported economy convention. The [NGDPD API](https://www.imf.org/external/datamapper/api/v1/NGDPD/2026) was disabled in the research tool; the [WEO dataset page](https://www.imf.org/external/datamapper/datasets/WEO) yielded a shell. Accordingly the packet stores no recovered numerical GDP and does not claim an independently verified rank. Estimates are not final actuals.

## Coverage and denominators

| Measure | Count | Meaning |
| --- | ---: | --- |
| Fixed discovered population | 48 | 24 reviewed selections plus 24 explicitly retained next candidates |
| Reviewed companies | 24 | Identity and Australian connection examined |
| Accepted for staging | 23 | Does not mean all fields are known or the company is newly founded |
| Held | 1 | Goterra: current lifecycle and successor identity unresolved |
| Rejected companies | 0 | No reviewed company was discarded as outside scope |
| Rejected inferences | 17 | Unsupported currency, event, identity or status assumptions; separate from company rejection |
| Existing Atlas identities reviewed | 8 | Seven staged edits; one hold |
| New staged identities | 16 | No canonical name/alias/domain match in the pinned graph |
| Company claims | 425 | 421 reviewed/staged assertions and four explicit conflict observations |
| Ecosystem claims | 30 | Separate day-precision research ledger |
| Public founder observations | 52 | Partial professional founder lists; no personal contact harvesting |
| Financing events | 29 | 25 have normalized amount/currency; 27 have a selected announcement day |
| Event-specific participant observations | 153 | Investor names unresolved to canonical entities; no production edges created |
| Unique source URL attempts | 165 | 149 yielded usable evidence; not an HTTP request count |
| Continuation candidates | 24 | Discovery only; country and canonical-domain review pending |
| Production records changed or published | 0 | All files are staged under this directory |

The fixed population is a reproducible research-work denominator. It excludes unselected names merely visible in directories and must not be described as all discovered Australian companies. The national eligible-startup denominator is **null**. Directory totals, investor portfolio claims, accelerator alumni and workspace residents have different scopes.

### Baseline discrepancy recorded, not repaired

The committed `data/graph.json` contained **537 entities / 46 startups / 17 funding events / 26 articles**. A fresh offline build from the pinned authoritative source produced **555 entities / 46 startups / 25 funding events / 37 articles**. Both contain 46 startup entities; the authoritative research overlay contains 45 records. The graph-only RemiAI record remains outside this lane. Deduplication used the fresh source build and overlay, not the stale derived artifact. No production graph regeneration is committed by this PR.

The baseline inventories, source-file hashes and #177 planner checkpoint are retained in `baseline-*.json`. The planner's source approvals remain unchanged. Later integration must refresh the baseline if main changes.

## Reviewed companies

Funding below is the selected evidence reviewed in this batch, **not each company's latest or complete funding history**. A date is an announcement or dated report, not a verified closing day. Exact source URLs and the full founder lists appear in the machine-readable files.

| Company and canonical domain | Geography / identity decision | Selected financing evidence | Atlas disposition |
| --- | --- | --- | --- |
| Gilmour Space · `gspace.com` | Gold Coast HQ; Gilmour Space Technologies is an expanded trading name | 20 Jan 2026 Series E: AUD217m; company-reported USD145m is an equivalent | Existing ID; facts only |
| ULUU · `uluu.com.au` | Perth HQ reported 29 Oct 2025 | 29 Oct 2025 Series A: AUD16m | Resolve prior date/currency gap using the existing event ID |
| Cauldron · `cauldronferm.com` | Orange HQ; Cauldron Ferm alias | 19 Mar 2024 Series A: AUD9.5m; Series A2 reports `$13.25m`, currency and announcement date unresolved | Preserve Series A; add one distinct, partly unknown A2 event |
| Loam Bio · `loambio.com` | Orange HQ retained through July 2026 leadership transition | 14 Feb 2023 Series B: AUD105m | Existing ID; facts only |
| Quantum Brilliance · `quantumbrilliance.com` | Australian/ANU origins; current explicit HQ unknown | 15 Jan 2025 Series A: USD20m | Existing ID; origin fact, no inferred HQ |
| Airwallex · `airwallex.com` | Melbourne origin; dual Singapore and San Francisco HQ | 25 Jun 2026 Series H: USD320m, with separately linked explicit-currency reporting | Existing ID; geography facts; historical Series F preserved |
| Canva · `canva.com` | Sydney HQ; team origin in 2012 distinct from 2013 product launch | 15 Sep 2021 financing: USD200m | Existing ID; shared founder metadata and exact historical launch precision preserved |
| Goterra · `goterra.com.au` | Historical Australian identity; 2026 liquidation reported, current primary notice unresolved | No new financing assertion | **Held; no staged production-schema record or deletion** |
| Fleet Space Technologies · `fleetspace.com` | Adelaide Airport HQ locality; Fleet Space alias | 12 Dec 2024 Series D: AUD150m | New staged identity |
| Myriota · `myriota.com` | Adelaide HQ | 27 Mar 2018 Series A: USD15m; 20 Dec 2024 financing `$50m`, currency/stage unresolved | New staged identity |
| Advanced Navigation · `advancednavigation.com` | Sydney HQ | 17 Nov 2022 Series B: USD68m; 18 Mar 2026 Series C: USD110m; one-day source differences retained | New staged identity |
| Vow · `eatvow.com` | Sydney HQ; verified redirect from `vowfood.com` | 14 Nov 2022 Series A: USD49.2m | New staged identity |
| Samsara Eco · `samsaraeco.com` | Jerrabomberra HQ observation, Sep 2025 | 27 Jun 2024 Series A+: AUD100m; USD65m is a reported equivalent | New staged identity |
| Cortical Labs · `corticallabs.com` | Melbourne HQ; Singapore descriptor and differing corporate names require legal-entity review | 4 Mar 2026 investment: amount and stage undisclosed | New staged identity; group incorporation remains unknown |
| MAKO · `mako.aero` | Formerly MicroTau; Sydney operating base, explicit HQ unknown | 30 Jun 2026 Series A: AUD28m | One new identity with former-name alias |
| Harrison.ai · `harrison.ai` | Haymarket/Sydney HQ; Annalise.ai consolidation is a distinct entity-review issue | 11 Feb 2025 Series C: USD112m | New staged identity; no automatic Annalise.ai alias merge |
| Employment Hero · `employmenthero.com` | Sydney HQ; 2014 founding narrative | Company article dated 23 Oct 2023 reports Series F AUD263m; first announcement and closing day not established | New staged identity |
| Mitti · `mitti.com` | Formerly SafetyCulture; Sydney/Surry Hills HQ | Sep 2024 AUD165m combined transaction: AUD75m primary plus AUD90m secondary | One new identity; mixed transaction explicitly labelled |
| Linktree · `linktr.ee` | Melbourne HQ; 2016 company narrative distinct from 2015 ABN activation | 16 Mar 2022 USD110m; Series C remains a stage candidate | New staged identity |
| Zeller · `myzeller.com` | Melbourne HQ; brand, holding and operating entities kept separate | Seed AUD6.3m; Series A AUD25m announced Mar 2021/raised during 2020; Series B `$100m`, currency unresolved | New staged identity; no assumed AUD/USD for Series B |
| Constantinople · `cxnpl.com` | Sydney HQ; similar-name `.com.au` website rejected as identity evidence | 16 May 2023 Seed AUD32m; Series A AUD50m, announcement date unknown | New staged identity |
| Dovetail · `dovetail.com` | Sydney HQ observation; founded 2017 | 20 Jan 2022 Series A: USD63m | New staged identity; ambiguous adviser/investor group excluded from round |
| Buildkite · `buildkite.com` | Melbourne HQ; founded 2013 | 15 Nov 2022 Series B: USD21m; unqualified `$31m` on another company page retained as conflict | New staged identity |
| Heidi · `heidihealth.com` | Melbourne HQ; Heidi Health and Oscer aliases | 6 Oct 2025 Series B: USD65m; conflicting 2026 page header retained | One new identity; no invented 2026 duplicate round |

## Findings that change integration decisions

**Identity requires current evidence.** [Blackbird's Mitti profile](https://www.blackbird.vc/portfolio/mitti) explicitly bridges SafetyCulture and Mitti and links the current domain. [MAKO's announcement](https://mako.aero/insights/mako-announces-28m-series-a) explicitly identifies MicroTau as the former name. Vow's previous domain redirects to its current company site. These names should not create duplicate companies. Harrison's described consolidation with Annalise.ai requires the record owner's entity model rather than a simple alias substitution.

**Australian origin, headquarters and incorporation are distinct.** [Airwallex's company history](https://www.airwallex.com/en-au/who-we-are) supports both Melbourne origin and overseas dual headquarters. Cortical's Melbourne base, a Singaporean investor descriptor, a Pte Ltd footer and an older Pty Ltd privacy document do not by themselves resolve the current corporate group. Brand/group incorporation is null for every company in this batch. Entity-scoped ABN/ACN and legal-policy observations for selected software companies remain available separately; registry activation is not substituted for incorporation or operating founding.

**Funding cannot be reduced to one number.** Mitti's [company funding post](https://www.linkedin.com/posts/safetyculturehq_itsgotime-activity-7238765585310924800-r68k) separates primary and secondary components. Airwallex's pre-existing Series F also retains its secondary-transfer qualification. Unqualified dollar amounts in Cauldron A2, Myriota 2024 and Zeller Series B remain text plus null normalized money. Cortical's undisclosed financing is not zero. Source-stated currency equivalents are not added as separate events or converted again. Advanced Navigation's 2022 source states definitive agreements were signed; a completed closing is not established.

**ULUU's previously incomplete event is now better supported.** The [company-issued 29 October 2025 release](https://www.prnewswire.com/news-releases/seaweed-startup-uluu-attracts-16m-to-scale-world-first-plastic-alternative-302598634.html) explicitly gives AU$16m and a publication date. The edit reuses `uluu-series-a-official-announcement`, replaces the old unknown-currency/date note and retains the original event identity. Wire distribution and the company version are one assertion group, not independent financing corroboration. General investor endorsements are not turned into round participants.

**Lifecycle review is necessary for Goterra.** [July 2026 reporting](https://www.smartcompany.com.au/startupsmart/goterra-enters-liquidation-after-hopes-of-sale-fall-through/) states liquidation, while the inspected ASIC notices could not be retrieved. Historical founder and investor evidence remains useful, but does not establish current operations or successor ownership. The record is held for owner review, with no automatic deletion or active-company assertion.

## Evidence conventions

Every company claim has a source URL/ID, source class, retrieval date, publication/effective date where known, evidence paraphrase, acquisition mode, confidence, review disposition and uncertainty rationale. ISO retrieval timestamps are lane review checkpoints; the retained precision is normally day or explicitly batch-end, not fabricated per-request seconds. Ecosystem retrieval records retain day precision directly.

Confidence concerns the particular source assertion, not complete truth, currentness or exhaustive coverage. Four conflict claims remain explicit. Government success stories and prize profiles use the ledger's available government/regulatory class but are not statutory incorporation records. Firsthand company releases distributed by a wire and investor reproductions are identified as such. Source observations record failed access, redirects and extraction limits. Short research notes are retained; no proprietary bulk directory or full-page corpus is included.

The 153 participant observations are joined to specific financing events. **All canonical investor IDs remain null.** Fund versus manager identity, aliases such as Main Sequence/Main Sequence Ventures, and similarly named investors require the existing investor owner's review. Portfolio membership and incubation are discovery or ecosystem evidence only. The 154 participant claims reflect one additional corroborating assertion for the same Samsara Eco participant, not 154 distinct relationships.

Company and claim `publication_state: unsubmitted` refers to submission through the production-record workflow. A research-packet PR proposes the staged files for review; it does not change that production status.

No personal emails, telephone numbers, private profiles or outreach targets were collected. There were no robots.txt requests, purchases, credential changes, access-control changes or bypasses. Three rate-limited company URLs were stopped; permitted public investor/company-profile sources were used for identity evidence.

## Machine-readable files

| File | Purpose |
| --- | --- |
| `manifest.json` | Country ownership, pinned base, cohort qualification, production separation and integration rules |
| `companies.json` | Rich company observations including aliases, geography, founding precision, public founders, financing and gaps |
| `claims.json` | 425 normalized source-attributed company claims; compatible with the existing enrichment ledger validator |
| `source-registry.json` | 165 unique source URLs with access observations and retrieval precision; no seed approvals |
| `funding-relationships.json` | 153 event-participant observations with claim joins and unresolved canonical investor IDs |
| `staged-additions.json` | 16 new records valid under the current `startup-record.mjs` contract |
| `staged-edits.json` | Seven revision-guarded edits valid under `startup-edit.mjs` |
| `staged-records.json` | 23 merged record previews for review; **not a replacement production overlay** |
| `projection-map.json` | Claim-to-field map, inherited-field qualifications, edit revisions and source-change warning |
| `ecosystem.json` | 30 ecosystem claims, 24 discovery candidates and 14 source continuation queues |
| `coverage.json` | Fixed 48-item population, exact state counts, population hash and resume cursor |
| `review-decisions.json` | Rejected inferences, normalization decisions, lifecycle hold and per-company gaps |
| `search-log.json` | Retained executed-query strings or labelled search topics, with source traversal scope |
| `baseline-*.json` | Current-source and committed-graph inventories, deduplication index and #177 planner checkpoint |
| `validate.mjs`, `validation-report.json` | Portable offline validation and recorded results |
| `ledger-validation.json`, `review-notes.json` | Enrichment-ledger validation bound to its input hash, and scoped independent reviews |
| `CHECKSUMS.sha256` | SHA-256 hashes for packet inputs and validator; excludes itself and the regenerable validation report |

## Validation and integration

Run from the repository root with Node.js and Python 3:

```bash
node research/countries/au/2026-11-18-batch-001/validate.mjs
```

The validator uses the repository's real record and guarded-edit implementations and builds the graph in memory from pinned source files. It checks normalization, full-graph/overlay deduplication, null/missing rules, source and claim joins, financing identity and participant consistency, preservation of production files, and fixed-population resume/replay. Negative fixtures check invalid money/nulls, stale revisions, source inheritance, shared-founder protection and the semantic duplicate-event case that the basic record schema cannot detect. These are offline structural checks, not a claim that software proves web-source truth or that data is published.

The existing enrichment helper independently validated all 425 company claims. Independent research review reopened the eight existing-record lane's key sources and all ten deep-tech financing announcements; a separate cross-file audit reconciled counts, provenance and event joins. See the validation report for the exact executable results.

1. Review this research-only PR and the held/conflicted observations. Merge/release coordination stays with the existing owners. A merge of this directory alone does not ingest any startup.
2. Before promotion, refresh main and the live source revision. Re-run deduplication, inspect overlapping country work and revalidate the existing schema. If any guarded record changes, recompute its revision after reconciling the actual delta; do not bypass the guard.
3. Treat `staged-additions.json` as proposed additions through the existing addition flow. Treat `staged-edits.json` as narrow edit inputs through the existing validation/proposal flow. **Do not copy `staged-records.json` over `data/startup-research.json`.** It contains only this batch's previews and inherited fields have not all been re-reviewed.
4. Keep the seven existing company IDs and existing financing IDs. Preserve Canva's shared founder metadata, exact historical product launch date and seed financing; preserve Airwallex's historical Series F. ULUU's source-change warning is expected and all old round fields are explicitly resubmitted with the resolved source.
5. Review richer sidecar facts before any projection. The current schema cannot represent every uncertainty, legal entity, timestamp precision, mixed transaction component or typed investor relationship. This PR changes neither schema nor API; no lossy projection should silently become an unqualified fact.
6. Keep Goterra held until the record owner reconciles current lifecycle/successor evidence. Keep investor identities unresolved until event-specific and fund/manager identity review completes. Production graph generation and deployment follow the existing release process.

## Next bounded work

The next cursor is **index 24 / `au-next-001`** in the fixed 48-item population. Check `population_sha256` before resuming; never replace the list silently and continue an old cursor. The 24 reviewed records form a complete processed prefix, with Goterra held for a separate revisit. The remaining 24 are discovery candidates, not accepted startups or approved crawler seeds.

The first continuation slices are six MAP names, six WA Nature Tech participants, six Airtree names and six Main Sequence names, listed in the ecosystem report. Start with direct company identity, Australia eligibility and canonical-domain deduplication, then founders and event-specific financing. A WA residency includes US participants; an Australian investor's portfolio can include foreign-headquartered companies.

Material source gaps remain explicit: Main Sequence exposes 65 public named entries against an 80-plus homepage statement; Blackbird's extracted directory does not expose its claimed 130-plus population; Airtree pagination variants and Canberra Innovation Network pages 2–3 remain unread. Boab's redirect yielded no usable content. Incorporation, full founder rosters, complete financing histories, successor entities and the IMF cohort API remain unresolved where documented. No national completeness claim is supported.
