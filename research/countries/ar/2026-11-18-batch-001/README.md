# Argentina — GDP 24/30, batch 001

**18 November 2026 · reviewed staging packet · 20 accepted company records.**

This directory is the complete country-owned deliverable. Start with [the ecosystem report](report.md), then [the current-schema projections](atlas-startups.json), [the rich records](country-records.json) and [integration instructions](integration.md). No production catalogue, graph, API, schema, seed allowlist or deployment is changed.

## Counts and boundaries

| Measure | Count |
|---|---:|
| Distinct candidate names discovered in selected sources | 63 |
| Companies reviewed / accepted for staging | 20 / 20 |
| Companies deferred without review / rejected | 43 / 0 |
| Public professional founder observations | 50 |
| Financing-event observations | 26 |
| Named event-participant observations | 181 |
| Ledger entries / reviewed staged entries | 786 / 717 |
| Conflicts / held candidate entries | 9 / 2 |
| Searched-unknown / unsearched dispositions | 38 / 20 |
| Registered source URLs / read at least once | 119 / 116 |
| Next-source queue items | 32 |
| Production records changed / crawler seeds approved | 0 / 0 |

Accepted companies: **Tiendanube, Mural, Humand, Henry, Coderhouse, VU, Kilimo, BioHeuris, Puna Bio, Beeflow, Michroma, Stämm, ucrop.it, Ualá, Pomelo, tapi, Rebill, belo, Ripio and Lemon**. A company can belong to the Argentine ecosystem while having foreign headquarters or incorporation; those fields are separated. Lists of founders, financings and participants remain partial. Funding events include a linked Ualá extension and a provisionally grouped Puna Bio Series A; they are not 26 independent rounds or a country investment total.

## Files

| Purpose | Files |
|---|---|
| Human research and adoption | [report.md](report.md), [integration.md](integration.md), [review-resolutions.md](review-resolutions.md) |
| Existing Atlas schema | [atlas-startups.json](atlas-startups.json), [projection-map.json](projection-map.json) |
| Rich country facts and evidence | [country-records.json](country-records.json), [claims.json](claims.json), [source-registry.json](source-registry.json) |
| Deduplication and unresolved identities | [baseline-inventory.json](baseline-inventory.json), [entity-reconciliation.json](entity-reconciliation.json) |
| Bounded coverage and resumption | [candidate-manifest.json](candidate-manifest.json), [coverage.json](coverage.json), [next-source-queue.json](next-source-queue.json), [checkpoint.json](checkpoint.json), [research-log.json](research-log.json) |
| Paraphrase capture bridge | [evidence-captures-01.json](evidence-captures-01.json) — 92 source/entity/retrieval groups; no automatic submission |
| Reproducible validation | [verify.mjs](verify.mjs), [verify-integration.py](verify-integration.py), [validation.json](validation.json), [integration-validation.json](integration-validation.json), [enrichment-validation.json](enrichment-validation.json), [existing-tests.json](existing-tests.json) |
| Independent reviews | [software](ar-software-independent-review.json), [science](ar-science-independent-review.json), [fintech](ar-fintech-independent-review.json), [integrated](ar-integrated-independent-review.json) |
| Revisions and integrity | [build-provenance.json](build-provenance.json), [manifest.json](manifest.json), [SHA256SUMS](SHA256SUMS) |

## Verify

From the repository root:

```bash
node research/countries/ar/2026-11-18-batch-001/verify.mjs
python research/countries/ar/2026-11-18-batch-001/verify-integration.py
python -m unittest discover -s tests -p test_company_profile_plan.py
python -m unittest discover -s tests -p test_graph.py
```

From this directory:

```bash
sha256sum -c SHA256SUMS
```

These commands are offline. The integration check writes only temporary inputs and prints its receipt; do not redirect it over the committed receipt without explicitly recording a new checkpoint. The initial comparison baseline is `f4bcbf7030d741772bb750deee584efa3ee17749`; refreshed main/branch parent is `988a4ddcc4dbbc853da0c7f7899b6d6e7579f840`. Startup data and the validation schema are unchanged between them; #179 fixed unknown-year graph projection. See build provenance for the distinction.

The supplied IMF October 2026 WEO estimate cohort is retained; the exact GDP and ordinal could not be independently recomputed from the unavailable API. No national startup denominator or completeness claim is made. See the report for source/pagination gaps and current versus historical programme calls.
