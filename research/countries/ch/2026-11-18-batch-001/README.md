# Switzerland batch001

**Research checkpoint: 18 November 2026. Status: validated research staging; no production ingestion.**

This packet retains **41 discovered worklist identities**: **24 reviewed**, comprising **19 accepted staged candidates** and **5 exclusions**, plus **17 unreviewed leads** (neon and 16 official ecosystem-source leads). Acceptance means sufficient evidence for owner review. It does not certify current independence, Swiss legal incorporation or current headquarters for every candidate. No national denominator or completeness claim is available.

The five exclusions are acquired companies **Araris Biotech, Memo Therapeutics, RIVR and Sevensense**, plus **ONWARD Medical**, whose Netherlands headquarters/public listing fall outside this candidate subset. Historical evidence remains in the ledger. [Manifest](manifest.json), [coverage](coverage.json), [companies](companies.staged.json).

## Repository and ownership

- Owned path: `research/countries/ch/2026-11-18-batch-001/`.
- Final validation base: `988a4ddcc4dbbc853da0c7f7899b6d6e7579f840`; initial inspection `f4bcbf7030d741772bb750deee584efa3ee17749`.
- Branch: `research/switzerland-gdp20-batch001-20261118`.
- [Collection owner](https://chatgpt.com/c/6afbc931-0378-83ec-8434-cd7e8db42db2), [record owner](https://chatgpt.com/c/6afc35bc-3abc-83ec-aa2c-101dd825be51) and [crawler planner #177](https://github.com/castlemilk/startup-atlas/pull/177) retain their responsibilities; [coordination receipt](https://github.com/castlemilk/startup-atlas/pull/177#issuecomment-6974835006).
- [Canonical Space](https://chatgpt.com/space/page_5167bcbbbb0c81919e1d565fd4d82e4a).
- Delivery links and exact commit/PR receipts are maintained in the canonical Space and PR discussion. [Local validation receipt](validation-results.json); no production publication is claimed.

## Accepted candidates

City/municipality and historical qualifications below reflect the cited observations, not incorporation. Amounts are selected events, not lifetime totals or necessarily latest rounds. “m” means million; `$` without ISO currency remains unresolved. Full dates, sources and participants: [funding ledger](funding.staged.json), [claims](claims.json).

| Company | Canonical domain | Geography precision | Selected financing; qualification |
|---|---|---|---|
| Alentis Therapeutics | alentis.ch | Basel HQ; October 2025 observation | 2024-11-12: USD 181.4m Series D; closing date unknown |
| ANYbotics | anybotics.com | Zurich HQ; December 2024 | 2024-12-12: USD 60m additional financing; stage unspecified |
| Bcomp | bcomp.com | Fribourg HQ; city | 2024-04-16: CHF 36m Series C; USD equivalent not additive |
| Climeworks | climeworks.com | Zurich global HQ; March 2024; separate US HQ | 2025-07-02: USD 162m new equity |
| Distalmotion | distalmotion.com | Reported Lausanne HQ; Epalinges contact municipality | 2025-11-18: USD 150m Series G; later investment undisclosed; debt capacity separate |
| Dufour Aerospace | dufour.aero | Visp HQ; July 2024 | 2023-01-23: Series B; amount/currency unknown |
| Engimmune Therapeutics | engimmune.com | Allschwil business address; HQ unverified | 2022-05-03: CHF 15.5m seed; equivalents not additive |
| Flyability | flyability.com | Paudex HQ; Lausanne area | 2022-09-07: CHF 22m Series C total, including earlier CHF 7m |
| HAYA Therapeutics | hayatx.com | Lausanne HQ, July 2024; Epalinges address | 2025-05-08: USD 65m Series A |
| Neural Concept | neuralconcept.com | Lausanne HQ; city | 2025-12-18: USD 100m Series C; earlier Series B separately retained |
| Planted | eatplanted.com | Kemptthal HQ; locality | 2022-09-01: CHF 70m Series B |
| Proton | proton.me | Geneva HQ; city | 2015-03-18: USD 2m historical financing; later ownership differs |
| Scailyte | scailyte.com | Basel business address; historical Sursee HQ | 2020-06-09: CHF 3.1m Pre-Series A |
| Scandit | scandit.com | Zurich HQ; city | 2022-02-09: $150m Series D; ISO currency unresolved |
| Sygnum | sygnum.com | Historical Zurich/Singapore group hubs; Swiss bank separately identified | 2025-01-14: USD 58m completed multi-stage round total |
| TOLREMO therapeutics | tolremo.com | Basel address; historical Zurich HQ | 2023-09-20: USD 39m completed Series A total |
| Vandria | vandria.com | Lausanne business location; HQ unverified | 2024-08-21: CHF 28.3m Series A total after second close |
| Verity | verity.net | Zurich business location; March 2023 | 2023-03-14: CHF 30m Series B initial close; extension retained separately |
| Wingtra | wingtra.com | Zurich HQ; city | 2023-03-21: $22m Series B; ISO currency unresolved |

## Evidence and integration files

Current ledger: **159 source URLs, 406 company claims, 26 financing observations and 112 named event-specific participations**. Company claims comprise 337 reviewed/staged, 5 conflicts and 64 unsearched dispositions; ecosystem claims are separate. Reconcile final counts from [manifest](manifest.json).

- [records.staged.json](records.staged.json): 19 legacy-format candidates; 22 projected financing entries.
- [companies.staged.json](companies.staged.json), [claims.json](claims.json), [funding.staged.json](funding.staged.json): authoritative qualifications, nulls and relationships.
- [sources.json](sources.json), [access-log.json](access-log.json): per-source URLs, retrieval/access outcomes; discovery grants no crawler approval.
- [projection-map.json](projection-map.json), [deduplication.json](deduplication.json), [peer-review.json](peer-review.json): provenance mapping, pinned-inventory comparison and review findings. No duplicate company match found in that inspected inventory.
- [ecosystem-report.md](ecosystem-report.md), [ecosystem-claims.json](ecosystem-claims.json): hubs, programmes and investor context.
- [queue.json](queue.json), [coverage.json](coverage.json): 41 source follow-ups, unreviewed identities and resumable checkpoint.

## Uncertainty and validation handoff

Neural Concept's founding year conflicts (2018/2019); Vandria's later funding total differs; Engimmune has a mismatched founder row; HAYA's founder title is inconsistent. Retain these conflicts. Preserve source-specific founding facts, amount bases and currency corroboration. Portfolio membership never establishes a round participant. Unknown values remain null/omitted, not zero.

Concurrent owner PRs [#179](https://github.com/castlemilk/startup-atlas/pull/179) and [#181](https://github.com/castlemilk/startup-atlas/pull/181) merged during research. This branch includes both. The final graph dry run verifies omitted founding years remain **null**; the earlier zero-sentinel caveat is retired. The source inventory was unchanged, and deduplication was rechecked. This packet makes no production schema/API, crawler, seed or deployment changes.

Completed local checks: **19/19 actual runtime records**, **6/6 research schema envelopes**, **406/406 claim ledger entries**, **32 packet tests**, **10 graph tests** and **16 planner tests** pass. The offline graph dry run adds 19 startups and 22 financing entries while preserving existing entities/events. Reproduce from the repository root:

```bash
python3 research/countries/ch/2026-11-18-batch-001/validate_packet.py --check-git-scope
python3 research/countries/ch/2026-11-18-batch-001/test_packet.py
```

Exact results are in [validation-results.json](validation-results.json), raw receipts in [validation](validation/), and payload hashes in [checksums.sha256](checksums.sha256). Checks cover normalization, provenance, deduplication, nulls, funding relationships and resumability against the unchanged [runtime contract](../../../../backend/hosted/src/startup-record.mjs). Recheck main and regenerate deduplication/checkpoint if the baseline changes.

Follow [INTEGRATION.md](INTEGRATION.md) for owner promotion, source-specific provenance and repeatable checks. Resume at worklist index 24 only after verifying its hash and base revision. Dynamic directories and archives are not exhausted. Priorities: official legal-entity checks, founding/currency conflicts, regional/Italian-language coverage and bounded funding archives. Null live-source cursors mean no continuation token was observed.

[IMF verification](cohort-verification.json) confirms October 2026 WEO rank **20**, Switzerland NGDPD **USD 1,135.739bn**, among 191 numeric economies. The Countries sheet excludes aggregates and retains separately reported economies; 2026 is an estimate/projection, not a final actual.
