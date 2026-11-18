# Integrating the Poland research checkpoint

**Packet directory:** `research/countries/pl/2026-11-18-batch-001/`

**Research date:** 18 November 2026

**Recorded main baseline:** f4bcbf7030d741772bb750deee584efa3ee17749

**Publication state:** reviewed research staging; production remains unsubmitted; refreshed source compatibility is recorded after the existing owner fixes

This document explains how to review and later integrate the bounded Poland packet without losing evidence or changing the existing Startup Atlas schema, crawler or ownership. The packet reviews 24 candidates, expects 23 startup/scaleup acceptances, and retains QNA Technology separately as a listed-company comparator. Final counts and actual execution receipts are recorded in [manifest.json](manifest.json), [coverage.json](coverage.json) and the validation reports.

## Authority and delivery boundaries

This directory is research staging. Its existence, checksums, successful validation or inclusion in a GitHub PR does not perform an authenticated record write or grant automatic permission for a production merge. The country work leaves production datasets, crawler seed approvals, host allowlists, throttling, access controls, API schemas and MCP deployments with their existing owners.

Coordinate through the [canonical Space](https://chatgpt.com/space/page_5167bcbbbb0c81919e1d565fd4d82e4a), [collection owner](https://chatgpt.com/c/6afbc931-0378-83ec-8434-cd7e8db42db2) and [record owner](https://chatgpt.com/c/6afc35bc-3abc-83ec-aa2c-101dd825be51). [Planner PR #177](https://github.com/castlemilk/startup-atlas/pull/177) is already merged as offline coverage/planning work. Reuse its ownership and future adapter path; do not replace its planner, start an unapproved crawl or interpret research discovery as seed approval.

The [investor-round proposal under `contracts/investor_rounds/`](https://github.com/castlemilk/startup-atlas/tree/main/contracts/investor_rounds) is explicitly synthetic-only and additive. Do not label real Poland observations `synthetic: true` to pass its reference validator. Do not merge that proposal, expand the production schema or invent canonical investor edges in order to fit this country packet.

## Exact file roles

All paths below are relative to `research/countries/pl/2026-11-18-batch-001/`.

| File | Review or integration role |
| --- | --- |
| `README.md` | Country ecosystem report, selection scope, source-backed company checkpoint and access limitations. |
| `INTEGRATION.md` | This handoff and the conditions for later import. |
| `manifest.json` | Packet identity, baselines, file inventory and actual delivery/validation metadata. |
| `companies.json` | Rich company observations, including geography distinctions, aliases, founder facts and financing observations. |
| `claims.json` | Claim-level evidence, source URLs, temporal precision, review state, conflicts and unresolved identity references. |
| `source-registry.json` | Exact sources and retrieval/access/publication metadata; discovery and unsuccessful retrievals remain identifiable. |
| `ecosystem.json` | Hubs, sectors, programmes and investor-network research; not a source of automatically approved companies or seeds. |
| `startup-records.json` | Conservative startup-record candidates compatible with the existing strict record contract. No wrapper metadata belongs inside a record. |
| `projection-map.json` | Mapping from rich facts to record fields, with omissions and reasons. Necessary for detecting information loss. |
| `coverage.json` | Candidate/source/claim accounting and bounded coverage state. |
| `next-source-queue.json` | Follow-ups with exact scope, cursor or restart point, stopping rule and reason. |
| `search-log.json` | Searches and page outcomes, including empty, partial, unavailable and blocked states. |
| `deduplication.json` | Candidate identity checks and decisions tied to the recorded baseline. |
| `baseline-inventory.json` | Captured repository inventory used by this batch. |
| `baseline-published-inventory.json` | Captured published/read-surface inventory; its observation time is part of its meaning. |
| `baseline-startups.json` | Startup baseline retained for reproducible comparisons. |
| `packet.schema.json` | Validation of this staging packet’s shape only; not an accepted production schema addition. |
| `validate.py`, `test_packet.py` | Packet consistency and regression checks. |
| `validate-startup-records.mjs` | Validation using the repository’s actual startup-record contract. |
| `validation-report.json` | Actual structural/consistency test receipt. |
| `evidence-validation-report.json` | Evidence review and material source-support corrections; structural success cannot substitute for this review. |
| `CHECKSUMS.sha256` | Integrity of the exact supplied file bytes; does not prove source truth or authorise a write. |

Keep the rich packet, projection map and source registry together. Importing only `startup-records.json` would discard uncertainty, date precision, entity scope, financing types and evidence that the legacy shape cannot represent.

## Validate the exact staged bytes

Run the commands from the repository root using existing installed dependencies. The final checked-in receipt must record the exact commands, exit status, tested baseline and result counts:

```sh
python research/countries/pl/2026-11-18-batch-001/validate.py
python research/countries/pl/2026-11-18-batch-001/test_packet.py
node research/countries/pl/2026-11-18-batch-001/validate-startup-records.mjs
```

Integrity can be checked without contacting a source or modifying production:

```sh
cd research/countries/pl/2026-11-18-batch-001
sha256sum --check CHECKSUMS.sha256
```

The integration owner must verify at least the following properties against the actual files:

1. Each accepted startup candidate has a valid projected record and a traceable mapping back to its company and claim IDs. The listed QNA comparator remains excluded from startup acceptance/projection.
2. The current repository `validateStartupRecord` accepts every projected record. Unsupported rich fields do not enter the accepted record by bypassing that validator.
3. Names and domains normalise consistently for candidate matching, including Unicode and observed name/domain changes. Normalisation produces candidate matches, not proof of legal or person identity.
4. Event IDs remain unique and bound to one company. A later article, stage extension, rebrand or changed amount cannot silently create or collapse a financing identity.
5. Amount/currency pairs, partial dates, unknown values and source inheritance behave as described below. Null is not converted to zero, and an absent rich observation is not treated as a negative fact.
6. Every projected founder, funding event, profile fact and relationship retains the source supporting that specific claim. Investor participation is event-specific and cannot be inferred from a portfolio, biography, programme or generic shareholder list.
7. Conditional financings, tender/secondary liquidity and mixed totals held by the projection policy remain excluded; their evidence survives in the sidecar.
8. Candidate dispositions reconcile to the final counts, and replay/resume work retains cursors, failures and source/claim IDs instead of counting the same candidate again.

Record the actual result as **23 records / 22 projected financing events pass the unchanged startup-record validator; 421 company claims pass the evidence-ledger validator; all 15 focused packet regression checks pass. The original graph receipt records a historical blocker; the refreshed main receipt verifies the existing owner fix**. Do not report a pass from a different packet revision or use historical CI as this branch’s acceptance. Avoid broad commands that regenerate production data merely to validate this country folder; run the focused packet and strict record checks identified in the receipt.

## Mapping into the existing record contract

The current authoritative validator is [`backend/hosted/src/startup-record.mjs`](https://github.com/castlemilk/startup-atlas/blob/main/backend/hosted/src/startup-record.mjs). Re-read it at the integration revision. The observations below describe the inspected contract and are not permission to add new fields.

| Rich observation | Existing-record treatment |
| --- | --- |
| Canonical company name, official website and concise description | Use the corresponding supported fields with an attributable record source and review date. Preserve supporting per-field claims in the packet. |
| Country connection, HQ versus office versus registered seat | Use narrowly labelled, sourced `profile_facts` where appropriate. Do not flatten foreign headquarters into Poland, turn an office into HQ or treat a subsidiary as the ultimate parent. |
| Company founding with year or month precision | `founded_year` can hold an explicitly supported company-founding year. Retain full precision and event meaning in the rich packet/profile fact; do not substitute operating-since, project launch, legal conversion or incorporation dates. |
| Aliases and historical domains | Preserve documented evidence in the rich packet and supported profile facts as needed. The current record shape has no general alias array. Do not create a second startup for Vue Storefront/Alokai, Hyper Poland/Nevomo, SGPR.tech/WIDMO or SatRevolution/SatRev without an explicit identity decision. |
| Public professional founder information | Use sourced founder names and verified source-linked professional references. Omit unsupported optional fields. A company-linked account is not independently authenticated merely because its URL is present. No personal contact harvesting or portrait reuse is included. |
| Funding amount with explicit currency | Numeric amount and currency must be supplied together and satisfy the strict validator. Preserve amount semantics, including whether the value is a round total or something else. |
| Bare-dollar or otherwise unresolved currency | Omit both numeric amount and currency in the strict projection; retain `amount_text` and the uncertainty. Do not infer USD from geography, valuation currency, URL slug or industry convention. |
| Unknown amount, date or profile | Omit optional strict fields rather than sending null where the schema does not accept it. Preserve explicit null/status/reason in the rich packet. Do not manufacture zero, an empty string or a default date. |
| Month/year announcement precision | The legacy `announced_on` requires an exact day. Omit it when only a month/year is supported and retain the actual period in notes/sidecar. Do not pad `2025-06` to `2025-06-01`. |
| Unknown funding stage | Keep stage unknown/null in the rich observation. Where the strict schema requires a nonempty stage string, use only the documented `Undisclosed` projection convention, with a note; do not infer a Series label. |
| Investor/fund/person participation | Keep source-bound observations and unresolved canonical references in the sidecar. The current funding object has no normalised participant field; do not invent `supports` or investment relationships as a workaround. |
| Source publication, update, announcement and closing | Keep separate. A news article dated later than an announced event is not another event; an editorial update is not a new funding date. |
| Disputed or conflicting values | Retain both observations, their evidence and the selection/hold reason. Do not overwrite earlier evidence just because another page is newer. |

The full record validator rejects unsupported keys and checks amount/currency pairing. Founder, funding and profile-fact sources are not interchangeable. Before changing a whole-record source, inspect the existing writer’s inheritance/revision rules and resubmit or preserve inherited fields as required by that owner’s workflow; a sparse source replacement must not silently reattribute old claims.

### Financing observations deliberately excluded from the simple projection

The rich packet retains the following observations while the current projection policy omits them because the existing funding shape cannot reliably express their transaction state or amount semantics:

- **ElevenLabs employee tender:** secondary liquidity for employees, not fresh company fundraising. [Company announcement](https://elevenlabs.io/blog/tender-22bn).
- **Nomagic 2025 reported financing total:** includes previously signed EIB venture debt; neither the newly raised primary-equity component nor an additive sum with the earlier loan is established. [Company announcement](https://nomagic.ai/news/nomagic-secures-44-million-investment-to-drive-ai-innovation-in-robotics/).
- **Synerise 2022 transaction:** mixes primary financing and secondary share acquisition without a verified component split. [Company-issued release](https://www.globenewswire.com/news-release/2022/05/05/2437428/0/en/synerise-closes-23m-series-b-to-fuel-international-expansion.html).
- **ICEYE June 2026 transaction:** the announcement distinguishes primary and combined totals and states closing conditions and regulatory approvals. Final completion is not proved by the headline. [Company announcement](https://www.iceye.com/newsroom/press-releases/iceye-leads-a-new-era-of-sovereign-intelligence-from-space-with-1b-funding-round).
- **SatRev 2021 investment commitment:** signing and an expected later close do not establish completed funding; the round target and valuation are not amounts invested. [Issuer release](https://www.nasdaq.com/press-release/satrevolution-secures-series-b-funding-from-virgin-orbit-2021-12-14).

Other measure-specific constraints still apply. BioCam’s [PLN 2m Level2 ticket](https://level2.vc/news/biocam-has-raised-pln-2m-from-level2-ventures-for-further-development-of-its-ai-powered-endoscopic-capsule.html) must remain an investor contribution, not an invented round total. Cumulative funding, grants, valuations and target amounts do not become additional rounds. Portfolio membership alone does not establish an event-specific investment.

## Repeat deduplication immediately before any future import

The stored baselines describe what this batch inspected. Concurrent country sessions, collection work and normal repository activity can add or amend records after those snapshots. **Re-deduplication against fresh authoritative data is required before any later proposal or import.**

1. Refresh current main and the relevant authoritative record/read surface using the existing owner’s workflow. Record both source revision and observed record revisions; neither is interchangeable with a packet checksum.
2. Compare exact/canonical domains, company names, documented aliases, legal entity names/identifiers and historical domains. Inspect matches across startup, partner, provider and person scopes where relevant; identical display names do not prove identity.
3. Review cross-border entities explicitly. A Polish subsidiary, foreign parent, brand and operating office may be related without being the same legal entity. Preserve the company/brand record’s established scope.
4. Reconcile candidate IDs with existing canonical IDs through an explicit decision. A proposed slug is not a reserved production ID. Do not overwrite a newer record or create a duplicate merely because this packet used a different alias.
5. Check financing events against the company’s current event list using source and transaction context. A matching amount/date or shared source is not sufficient evidence to merge an extension, bridge, tender or separate tranche. Preserve exact existing event IDs when identity is established.
6. Store the decisions and any held ambiguity, then regenerate the conservative projection and rerun validation against the newly recorded baseline. Update hashes only after the reviewable files are final.

Use the existing proposal/write path only after the appropriate owner has reviewed the concrete changes. Bind the packet digest to fresh whole-record/source revisions and preserve retry/recovery state. This document is not an import command and does not authorise changing writer permissions or authentication.

## Resume research without changing crawler policy

Follow [next-source-queue.json](next-source-queue.json), not a freshly inferred “start over” query list. Each work item should retain its source, country/company/event scope, last processed section or cursor, bounded stopping rule, discovered candidates, duplicate decisions and unresolved fields. A blocked page or unknown final page is not a completed traversal. Distinguish an empty successful result from an access failure.

Programme and portfolio pages are leads. Check official company identity before accepting a company and dated event evidence before accepting participation. Retain programme edition and operator status: for example, the [Startups Exchange umbrella](https://www.parp.gov.pl/component/grants/grants/startup-booster-poland---Startups-Exchange-oferta-dla-startupow) is within its overall application window, but the displayed StartSmart CEE operator starts on 7 December 2026, after the research date. Research discovery adds no source to the crawler allowlist and approves no seed. Preserve host restrictions, throttling, byte/time limits, access challenges and the user’s no-robots instruction.

There is no defensible national startup denominator in this packet. PFR transaction populations, survey respondents, investor portfolios, accelerator capacity and this batch’s reviewed candidates have different scopes. Resume coverage by measurable source sections and identity decisions rather than asserting a percentage of “all Polish startups.”

## Review, repository delivery and later release receipts

The country branch should contain only this country packet and any explicitly scoped validation support. Preserve concurrent work. Confirm the staged diff and final checksums before committing/pushing through the user-authorised country branch and reviewable PR. Record actual commit/PR URLs and CI outcomes; do not fill receipt fields from intended actions.

Current receipt fields:

| Receipt | Actual value |
| --- | --- |
| Country branch | research/poland-gdp21-20261118 |
| Country commit | recorded by the immutable PR head and canonical Space receipt; run `git rev-parse HEAD` on this checkout |
| Reviewable country PR | [185](https://github.com/castlemilk/startup-atlas/pull/185) |
| Validation report | `research/countries/pl/2026-11-18-batch-001/validation-report.json` |
| Evidence review | `research/countries/pl/2026-11-18-batch-001/evidence-validation-report.json` |
| CI result for the country revision | reported separately for the actual PR head; local validation does not imply remote CI passed |
| Packet checksums | `research/countries/pl/2026-11-18-batch-001/CHECKSUMS.sha256` |
| Merge/release state | research-only review; no production merge or release performed by this lane |
| Canonical Space update receipt | exact commit/PR/test links recorded in the canonical Space after successful repository delivery |

Update the canonical Space with the exact folder/files, commit and PR links, actual tests and remaining holds while retaining existing ownership. A pushed research branch is not a production release. Any later accepted write requires the record owner’s normal revision/identity checks; any merge or release remains coordinated with the existing owners and needs its own actual readback/receipt. No MCP deployment or API/schema adoption is part of this packet.

If repository access is unavailable at delivery time, supply this exact directory as a transferable packet, including `CHECKSUMS.sha256`, the recorded baseline and validation receipts. State that it was not pushed. The receiving owner can verify integrity, re-deduplicate against fresh main, inspect the concrete diff and use the existing review path without requiring a new crawler, credentials or permission changes.

## Production preflight: existing owner fixes consumed

The initial in-memory preflight at `f4bcbf7030d741772bb750deee584efa3ee17749` found that `scripts/make-graph.py` converted an omitted `founded_year` into zero. All 23 projections retain founding as separately sourced profile facts, so this was a real import blocker. The original [graph compatibility receipt](graph-compatibility.json) is preserved as historical evidence.

During publication, the existing owners merged [PR #179](https://github.com/castlemilk/startup-atlas/pull/179) for missing-year preservation and [PR #181](https://github.com/castlemilk/startup-atlas/pull/181) for legacy funding-source inheritance. The country branch consumes those unchanged upstream commits. The [refreshed preflight](refreshed-main-validation.json) at `988a4ddcc4dbbc853da0c7f7899b6d6e7579f840` verifies that all 23 omitted founding scalars remain absent, with no zero-valued year introduced. Source records and planner implementation are unchanged, and the initial identity comparison remains valid through verified byte continuity.

**Production is still unsubmitted.** The country PR is a research review, not authority to write live records, approve seeds or deploy the hosted MCP. Before later adoption, the existing owners must review canonical identities, exact fields and source/revision rules against then-current records. Source-level compatibility does not establish hosted-runtime adoption.

## Packet-specific date and founder conventions

In the rich research sidecar, `announced_on` may contain a partial period when `date_precision` is `month`; `announced_period` duplicates that explicit period for readers needing a separate field. Booksy uses `2021-01` and Ramp Network uses `2022-11`. The existing production-shaped `announced_on` is omitted in both cases. A future importer must inspect precision rather than parse every research value as an exact day.

Founding is projected only into separately sourced `profile_facts`, preserving the actual year/month and event meaning. This avoids attributing a historical founding observation to the unrelated top-level description source. The rich null for Nevomo/Omnipack remains unknown. Nevomo’s Jacques Berrebi is explicitly qualified as a late cofounder in a sourced profile fact; the richer role qualification must accompany any legacy founder edge. The London headquarters observation for ElevenLabs retains its 2024-08-14 date.

## Existing planner compatibility receipt

The existing #177 `build_plan` implementation was exercised offline against a temporary 68-record combined overlay (45 baseline records plus 23 Poland projections), with existing seeds unchanged. It returned seven pages at limit 10, covered each record once, replayed its first page identically and rejected a cursor reused with a different page size. All 23 Poland entries remained `seed_review_required`, with collection `not_assessed` and no approved URL. This exhausts only that temporary overlay inventory, not any company website, external source directory or country ecosystem. [Exact input hashes and results](graph-compatibility.json).

Cross-border companies may also appear in another country’s staged packet. Country candidate IDs are local research handles; proposed `startup:` IDs use the shared canonical company name. Before any production write, reconcile ElevenLabs, ICEYE, Silent Eight, Docplanner and other cross-border identities against all current records and concurrent proposals. This packet claims no exclusive ownership of those company identities.

Refreshed integration source: [`988a4ddcc4dbbc853da0c7f7899b6d6e7579f840`](https://github.com/castlemilk/startup-atlas/commit/988a4ddcc4dbbc853da0c7f7899b6d6e7579f840). Initial research and published-search baselines remain explicitly pinned to `f4bcbf7`; no company data changed between these source revisions.
