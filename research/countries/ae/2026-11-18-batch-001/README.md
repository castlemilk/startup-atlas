# UAE GDP 29/30 — bounded research checkpoint

**Research date:** 18 November 2026. **Repository baseline:** `f4bcbf7030d741772bb750deee584efa3ee17749`. **Branch:** `research/uae-gdp29-20261118`.

This packet contributes UAE ecosystem research and **18 schema-valid startup records for review staging**. It owns only this directory. The existing collection, record, investor-round and release owners retain their responsibilities; coordination is recorded in [coordination.json](coordination.json) and [planner PR #177](https://github.com/castlemilk/startup-atlas/pull/177#issuecomment-6974939207).

Start with the [country ecosystem report](ECOSYSTEM.md) and [integration instructions](INTEGRATION.md). The [manifest](manifest.json) declares scope, inputs, delivery state and adoption dependencies. `SHA256SUMS` covers every other packet file.

## Research coverage

| Measure | This checkpoint |
|---|---:|
| Named candidates enrolled in discovery | 32 |
| Reviewed candidates | 25 |
| Accepted for staging | 18 |
| Deferred for evidence or identity review | 6 |
| Excluded from this UAE projection | 1 |
| Unreviewed discovery leads | 7 |
| Accepted founder links | 37 |
| Accepted financing observations | 23 |
| Accepted event-participation claims | 85 |
| All ledger claims, including conflicts and candidates | 366 |
| Ecosystem institutions/programmes/networks | 12 |
| Registered source URLs | 129 |
| Registered URLs attempted | 128 |
| Source URLs supporting ledger claims | 92 |
| Next-source tasks | 31 |

The registered URL outcomes are **103 accessed, 17 blocked, eight partial and one unopened**. Access does not automatically grant reuse: rights-held company-source facts are excluded from the projection. Independent review performed another **19 URL reopens**, 17 readable and two timeouts, on already registered sources. Those checks do not inflate unique-source counts. The packet records 114 discovery queries; incidental search hits are not counted as enrolled startups.

These are finite workflow denominators. No country population denominator is available; no startup directory was completely paginated. The supplied GDP 29/30 ordinal and October 2026 WEO vintage were not independently recomputed because the requested IMF API could not be retrieved. No GDP number or final actual is asserted.

### Accepted names

Bayzat, CAFU, eyewa, Grubtech, Huspy, Immensa, Kitopi, Letswork, Nabta Health, NymCard, Pure Harvest Smart Farms, Pyypl, Qashio, Sarwa, SQUATWOLF, TENDERD, XPANCEO and Ziina.

Acceptance requires a source-backed identity and a documented UAE connection. It does not imply current sole-UAE headquarters, complete financing history, verified holding-company incorporation or a complete founder list. Dates and source conflicts remain explicit.

**Deferred:** Stake, Seez, TruKKer, Maalexi, Derq and RemotePass. **Excluded from this UAE projection:** Tabby, whose current Riyadh headquarters are distinguished from its Dubai origin. **Unreviewed:** Holo, Ziwo, qeen.ai, ClearGrid, qlub, Wio and Zand.

## Files and their roles

| File | Purpose |
|---|---|
| [ECOSYSTEM.md](ECOSYSTEM.md) | Hubs, sectors, programmes, capital networks, all 18 accepted companies, conflicts and continuation priorities. |
| [startup-records.json](startup-records.json) | Exactly 18 records validated against the unchanged production startup-record validator. This is a staged overlay, not a replacement for production data. |
| [claims.json](claims.json) | Atomic claims with source, retrieval precision, evidence paraphrase, confidence, review status, publication state and uncertainty. |
| [projection-map.json](projection-map.json) | Field pointers connecting each projected claim to its exact ledger entries and source URLs. |
| [entities.json](entities.json) | Canonical-domain candidates, aliases, headquarters versus incorporation, founding precision, dispositions and unresolved IDs. |
| [funding-events.json](funding-events.json) | Event and participation sidecars; explicit transaction kinds, date precision, unknown amounts and unresolved investor identities. |
| [ecosystem.json](ecosystem.json) | Institutions and programmes linked to their ledger claims. |
| [source-registry.json](source-registry.json) | Primary/secondary source classification, access outcomes, retrieval observations and restrictions; every URL remains unapproved as a crawler seed. |
| [observations.json](observations.json) | Reviewed lane inputs with monetary normalization and rights-hold sanitation. No full webpages or personal contact lists are stored. |
| [coverage.json](coverage.json) | Counting rules, missing-field dispositions and incomplete pagination evidence. |
| [next-source-queue.json](next-source-queue.json) | Stable task IDs, priorities, source URLs, gaps and explicit unvisited directory checkpoints. |
| [deduplication.json](deduplication.json) | Name/alias/domain/proposed-ID comparisons against the pinned committed graph. |
| [inventory.json](inventory.json) | Existing committed graph/overlay inventory, labelled as a snapshot rather than live publication. |
| [existing-planner-inventory.json](existing-planner-inventory.json) | Actual existing planner output on the original 45-row overlay. |
| [independent-reviews.json](independent-reviews.json) | Two targeted factual cross-reviews, their source readbacks, gaps and normalization resolutions. |
| [validation-results.json](validation-results.json) | Actual schema, provenance, funding, deduplication, planner replay and in-memory graph checks with input hashes. |
| [skill-validation.json](skill-validation.json) | Existing enrichment helper's structural ledger validation, separate from factual verification. |
| [captures.json](captures.json) | Accepted-record evidence paraphrases generated by the existing helper; partial research summaries, not live crawler captures or a seed approval. |
| [build_packet.py](build_packet.py) | Offline country-specific assembler using saved observations; writes only this directory. |
| [validate_packet.py](validate_packet.py), [validate_packet.mjs](validate_packet.mjs) | Offline packet checks using the actual repository schema, existing planner and graph builder. |

## Verification

From the repository root:

```bash
python3 research/countries/ae/2026-11-18-batch-001/validate_packet.py
```

The successful receipt verifies all 18 records, 28 schema rejection fixtures, 14 packet rejection fixtures, 11 normalization assertions, five identity-collision fixtures and nine invalid planner-replay fixtures. The existing planner enumerates a temporary **63-record overlay** (45 original plus 18 staged) in nine pages of seven without skips or repeats. All 18 new rows remain `seed_review_required`; network and DNS tripwires are enabled during those checks. Protected production and implementation files retain their hashes.

For checksums, run inside this packet directory:

```bash
sha256sum -c SHA256SUMS
```

The offline checks establish representation and relationships. They do not mechanically prove the truth of every webpage assertion; targeted factual reviews and unresolved source conflicts are recorded separately.

## Production-adoption dependencies

The actual current graph builder converts omitted scalar founding years to zero. The in-memory preview reproduces this for all 18 proposed records. **Keep this packet staged until the existing owner resolves [PR #179](https://github.com/castlemilk/startup-atlas/pull/179) or an equivalent reviewed unknown-value path is verified.** Supported founding information is preserved in sourced profile facts and the research ledger; no year is fabricated to satisfy the old builder.

[PR #181](https://github.com/castlemilk/startup-atlas/pull/181) separately addresses legacy funding-source inheritance. Its runtime fix is owner work, not part of this packet. Event participants and richer geography/date data remain sidecars under the current schema; no unsupported typed edge or API field is introduced.

This packet writes no production records, approves no crawler seeds, performs no collection run and deploys no MCP service. Its PR is a research review checkpoint; production adoption and merge/release coordination remain explicit owner decisions.
