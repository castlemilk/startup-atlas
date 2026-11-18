# Norway — GDP 30/30, first bounded research checkpoint

Reviewed on **18 November 2026**. This packet contains **15 production-schema-valid staged startup records**, backed by an ecosystem report, a claim ledger, a source registry and a resumable research queue. It is a country research checkpoint; merging these files does not import any company into production.

The retained inventory is **46 company identities: 18 reviewed and 28 additional unreviewed leads**. Fifteen reviewed companies are accepted for staging; **Cognite, Dune and Skyfri are held**. No company identity was rejected. The separate rejected-inference file records **13 unsupported interpretations**, which must not be counted as rejected companies. There is no defensible national startup denominator in this packet.

## Repository and ownership

| Item | Value |
| --- | --- |
| Repository | [castlemilk/startup-atlas](https://github.com/castlemilk/startup-atlas) |
| Country branch | `research/norway-gdp30-20261118-batch001` |
| Owned path | `research/countries/no/2026-11-18-batch-001/` |
| Initial inspected main | `f4bcbf7030d741772bb750deee584efa3ee17749` |
| Refreshed and validated main | [`ff4d51cf729d6a654787e9a1db63967b292df8c9`](https://github.com/castlemilk/startup-atlas/commit/ff4d51cf729d6a654787e9a1db63967b292df8c9) |
| Existing collection owner | [Owner conversation](https://chatgpt.com/c/6afbc931-0378-83ec-8434-cd7e8db42db2) |
| Planner coordination | [PR #177](https://github.com/castlemilk/startup-atlas/pull/177), [Norway scope comment](https://github.com/castlemilk/startup-atlas/pull/177#issuecomment-6974939448) |
| Canonical project checkpoint | [Startup Atlas Space](https://chatgpt.com/space/page_5167bcbbbb0c81919e1d565fd4d82e4a) |

The initial main defaulted an omitted founding year to zero in the generated graph. The existing owner independently fixed that behavior in [PR #179](https://github.com/castlemilk/startup-atlas/pull/179). This country branch incorporates that main revision and verifies the fix with an in-memory graph build. It makes no implementation change outside this directory.

The GDP cohort is the user-specified **October 2026 IMF WEO, 2026 nominal GDP estimates**, excluding aggregates and retaining the IMF separately reported economy convention for Taiwan. The requested [DataMapper API](https://www.imf.org/external/datamapper/api/v1/NGDPD/2026) was blocked; the [WEO dataset page](https://www.imf.org/external/datamapper/datasets/WEO) returned a shell. The packet therefore does **not** claim independent verification of Norway's rank, the requested edition or a GDP amount. These fields remain explicitly unresolved, and estimates are never described as final actuals.

## Exact checkpoint counts

| Measure | Count / disposition |
| --- | ---: |
| Retained company inventory | 46 |
| Company identities reviewed | 18 |
| Accepted for staged projection | 15 |
| Held from projection | 3 |
| Company identities rejected | 0 |
| Additional unreviewed company leads | 28 |
| Claim observations | 343: 328 reviewed staged, 3 conflicts, 12 candidates |
| Source observations / distinct attempted URLs | 147 / 144 |
| Source outcomes | 134 substantive accessed observations, 1 partial, 8 blocked, 4 insufficient |
| Distinct URLs used by claims | 117 |
| Financing events in rich research | 20: 15 projected, 3 separate grants, 2 events for held companies |
| Named event-investor relationships | 74 overall; 72 for accepted companies |
| Founder relationships in accepted records | 37 |
| Field-level projection bindings | 253 |
| Source, field and integration follow-up tasks | 40 |
| Existing reconstructed Atlas entities compared | 555, including 46 startups |
| Existing-company name/domain/slug matches | 0 |
| Production records changed / crawler seeds approved | 0 / 0 |

The 134 substantive observations include three root rechecks of already registered URLs. Counts describe this retained evidence packet, not every company encountered in search results. Reviewed claims for held companies remain factual observations; their review status is not permission to promote the company.

## Files

| File | Purpose |
| --- | --- |
| [ecosystem-report.md](ecosystem-report.md) | Hubs, sectors, accelerators, public programmes, investors, institutional changes and source gaps |
| [manifest.json](manifest.json) | Scope, cohort caveat, base revision, ownership, counts, holds and promotion gates |
| [companies.enriched.json](companies.enriched.json) | All 18 reviewed identities, aliases, founding precision, distinct geography, public professional founders, uncertainty and claim references |
| [startups.staged.json](startups.staged.json) | Fifteen records accepted by the existing production startup validator; no production file is changed |
| [claims.json](claims.json) | Per-claim sources, retrieval timestamps, confidence, dates, evidence paraphrases and dispositions |
| [source-registry.json](source-registry.json) | Exact URLs, source kinds, access results, retrieval semantics, rights notes and pagination limits |
| [funding-events.json](funding-events.json) | Twenty typed financing observations and 74 event-specific investor relationships; grants remain separate |
| [projection-map.json](projection-map.json) | Each projected field bound to supporting claims and exact URLs; no unsupported production-schema extensions |
| [discovery-queue.json](discovery-queue.json) | Twenty-eight named leads, 40 bounded follow-ups, input hashes and resumption metadata |
| [deduplication.json](deduplication.json) | Current-main name/domain/alias/slug comparisons and founder collision checks |
| [search-log.json](search-log.json) | Discovery queries and research scope |
| [rejected-inferences.json](rejected-inferences.json) | Unsupported interpretations, distinct from held or rejected company identities |
| [normalization-receipt.json](normalization-receipt.json) | Input hashes, source-local corrections and source-representation qualifications |
| [independent-review.json](independent-review.json) | Independent review and closure of the Ocean Oasis and Blueye attribution findings |
| [baseline-identities.json](baseline-identities.json) | All 555 reconstructed baseline identities used for deduplication |
| [baseline-built-inventory.json](baseline-built-inventory.json) | Inventory rebuilt from current main sources: 46 startups and 25 funding events |
| [baseline-inventory.json](baseline-inventory.json) | Separately labelled committed snapshot, which is stale relative to source files |
| [planner-baseline.json](planner-baseline.json) | Existing #177 planner output against 45 overlay records and unchanged seed approvals |
| [packet.schema.json](packet.schema.json) | Research-only sidecar schema; does not change the production API |
| [validate_packet.py](validate_packet.py) | Provenance, nulls, dates, funding relationships, deduplication, coverage and cursor tests; isolated graph build |
| [validate_projection.mjs](validate_projection.mjs) | Imports the real production validator and checks the staged batch plus schema failure cases |
| [packet-validation.json](packet-validation.json) | Successful semantic validation and graph dry run |
| [projection-validation.json](projection-validation.json) | Successful validation of all 15 records and 19 embedded schema/batch tests |
| [claim-validation.json](claim-validation.json) | Successful enrichment-ledger structural validation |
| [repository-test-results.json](repository-test-results.json) | Results of 30 relevant existing repository tests |
| [SHA256SUMS](SHA256SUMS) | SHA-256 for every other file in this directory |

## Interpretation rules

The rich research packet is authoritative for precision and qualifications. The production projection is intentionally narrower because the existing schema has no typed headquarters, incorporation, alias or investment-participant fields. Supported geography and dates appear as sourced profile facts; typed participants remain in the sidecar until canonical identities and a supported integration path are reviewed.

Unknown optional values are **omitted** in production-schema records and explicitly **null or unresolved** in the sidecar. An empty or absent founder list would not establish that no founder exists. Every founder and investor list is marked partial. Source retrieval timestamps are documented observation checkpoints or windows, not fabricated exact request times.

The funding projection contains seven exact amount/currency pairs, six text-only amounts and two unquantified events. Wind Catching Systems' **up to USD 10 million** and Hystar's **more than USD 36 million** stay text-only in exact numeric fields. Strise, Xeneta and Blueye have unresolved currency evidence. Gelato's transaction total is qualified separately from new company capital. Three grants remain outside the investment-round array. Portfolio membership and historical shareholder status never generate a round-participation edge.

Founding, incorporation, commercial launch, announcement, award and closing dates remain distinct. Nofence's July 2025 close has month precision; Ocean Oasis's undated financing announcement has no invented date. Blueye's exact announcement date is bound to its official press index. Völur's full announcement date includes the separate homepage year evidence. Ocean Oasis's 2020 incorporation statement is bound to the company homepage, separately from its registry identity.

Appfarm retains a 2017/2018 establishment-versus-source-version conflict and qualified founder-role observations. Plaace retains Tobias as a company-scoped unresolved founder and does not add NOK 2 million of public support to a NOK 10 million round without resolving their relationship. Registered business addresses and Norwegian offices are not automatically global headquarters. Tibber's group HQ remains unresolved; Heimdall Power explicitly has Oslo and Charlotte headquarters; Gelato has separately sourced company and investor HQ statements.

**Holds:** Cognite needs current group geography and acquisition-status reconciliation; Dune needs a permitted-source route after an observed automated-collection restriction; Skyfri needs reconciliation between Skyfri Minox, the group and legacy operating companies. All three are excluded from `startups.staged.json`. No further Dune domain requests are authorized by this queue.

## Reproduce the validation

From the repository root, the following commands only read the staged data and run local checks:

```bash
node research/countries/no/2026-11-18-batch-001/validate_projection.mjs
python3 research/countries/no/2026-11-18-batch-001/validate_packet.py
python3 -m unittest discover -s tests -p test_graph.py
python3 -m unittest discover -s tests -p test_company_profile_plan.py
node --test backend/hosted/tests/startup.test.mjs
```

`validate_packet.py` uses the runtime's `jsonschema` library. The Node validator uses built-in modules and the existing repository validator. The stored receipts record 19 projection tests, 16 semantic/resumption tests, and 30 existing repository tests (10 graph, 16 planner, 4 startup). Negative tests cover missing currency, null production values, unsupported fields, partial dates, Unicode collisions, broken provenance, portfolio-to-round inference, grants misclassified as investments, qualified amounts promoted to exact values, false completeness and stale cursors.

The isolated combined graph contains **61 startups and 40 funding events**, reflecting the 46-startup/25-event baseline plus this 15-startup/15-event projection. It preserves all seven omitted founding years without synthesizing zero and writes no production graph or SQLite snapshot.

Verify the delivered files from inside this directory:

```bash
sha256sum -c SHA256SUMS
```

The enrichment skill's independent ledger validator also passed all 343 claims; its receipt is included. That structural check does not independently verify source truth or completeness.

## Integration and next batch

1. Review this directory through the country PR and verify `SHA256SUMS`. The PR and exact pushed commit are recorded in the canonical Space checkpoint and planner conversation; the repository commit itself identifies the immutable file set.
2. Re-read current main and ownership before promotion. Rebuild its identity inventory and compare against `deduplication.json`; concurrent countries can introduce new matches after this checkpoint. Preserve all other country lanes.
3. Validate `startups.staged.json` with the existing production validator and review it alongside `projection-map.json`, `companies.enriched.json` and `funding-events.json`. These 15 records are proposed new identities at this baseline, not a replacement overlay. Do not overwrite `data/startup-research.json` with this smaller file.
4. Use the existing startup proposal/review workflow for any later bounded production promotion. Keep held companies, unreviewed leads, grants and unresolved canonical investor/person identities outside unsupported production representations. No schema/API or MCP deployment is supplied here.
5. Coordinate merge and any later release with the existing collection owner and #177 planner. Discovery alone does not approve a crawler seed; allowlists, throttling and access controls retain their existing authority.

Resume the registered source/field queue without network activity:

```bash
python3 research/countries/no/2026-11-18-batch-001/validate_packet.py --queue-page --limit 10
```

Pass the returned `next_cursor` using `--cursor` for the next page. Cursors are pinned to the complete task input hash, page size and version. An altered queue invalidates an old cursor rather than silently restarting it. Queue exhaustion means the **registered tasks** were paged, not that source pagination or Norway's ecosystem is complete.

The next named-company pass should verify the eleven retained **6AM Cohort 11** leads before continuing to Cohort 10. The other seventeen leads come from Nysnø, NMBU Eik Lab, Oslo Science Park and SNÖ. Startuplab's company navigation, VIS's embedded Airtable, NCE Seafood membership, Katapult's global portfolio, Alliance's active/exited distinctions, northern/southern/rural coverage, full funding histories and registry date gaps remain explicitly open. The report and queue give exact source entry points and stopping conditions.
