# Country packet integration instructions

## Ownership and scope

This branch owns only `research/countries/sa/2026-11-18-batch-001/`. Its pinned main revision is `988a4ddcc4dbbc853da0c7f7899b6d6e7579f840`. Do not copy the entire branch tree over a newer checkout or replace production arrays. Rebase the country directory onto current main, inspect any newly merged Saudi records and re-run deduplication before an owner-approved integration.

The [existing collection owner](https://chatgpt.com/c/6afbc931-0378-83ec-8434-cd7e8db42db2), [startup record owner](https://chatgpt.com/c/6afc35bc-3abc-83ec-aa2c-101dd825be51), [investor-round owner](https://chatgpt.com/c/6afd4caa-9b80-83ec-97a5-9b25e5a15e2d) and [coverage owner](https://chatgpt.com/c/6afd4c6b-0cf0-83ec-81d5-c64c1e4c7cb4) retain their respective responsibilities. This packet records review findings; it does not replace their implementation or release decisions. [Planner #177](https://github.com/castlemilk/startup-atlas/pull/177) and the subsequent synthetic replay work are reused as existing interfaces. Their source approval and transport controls remain unchanged.

## What can be consumed

`startups.json` has the existing overlay envelope and 25 schema-valid startup objects. These are proposed records, not a replacement for `data/startup-research.json`. Review them by normalized identity and domain, using the existing proposal/integration path only after the gates below are resolved.

The full evidence model is in `entities.json` and `claims.json`. Preserve those sidecars. The current hosted record contract has no typed fields for aliases, HQ geography, incorporation scope, partial dates or round participants. Selected supported assertions use `profile_facts` and funding notes; everything else remains losslessly in the ledger. `projection-map.json` explains each mapping and exclusion. Do not create unsupported fields in the hosted schema or infer investor IDs from names. Upstream [PR #181](https://github.com/castlemilk/startup-atlas/pull/181) now rejects changing a legacy funding source while inheriting unresubmitted claims. Omitted fields preserve old values; a future correction requiring deletion must use the owner-approved correction path, not an omission-only upsert. The synthetic-only investor-round fixture contract is not a production ingestion target for these real companies.

Unknown numbers and dates are null in the research sidecar. Optional fields that the current record validator does not accept as null are omitted from the projection. Funding amounts have exact original denomination only when supported. Lower bounds, conditional capacity, unspecified currencies, mixed transaction allocations and unresolved recipient entities are not converted to exact round amounts. Claimed participation always references a specific event and its evidence; generic portfolio membership does not establish a round.

## Offline validation from repository root

These commands inspect local data and use the existing repository validators. They perform no crawling, seed approval, production write or deployment.

```bash
node research/countries/sa/2026-11-18-batch-001/validate_records.mjs .
python3 research/countries/sa/2026-11-18-batch-001/validate_packet.py --repo .
python3 -m unittest discover -s tests -p 'test_graph.py'
python3 -m unittest discover -s tests -p 'test_company_profile_plan.py'
python3 research/countries/sa/2026-11-18-batch-001/verify_planner_checkpoint.py
```

Verify file bytes from the packet directory:

```bash
cd research/countries/sa/2026-11-18-batch-001
sha256sum --check SHA256SUMS
```

The original enrichment-ledger validator is an environment skill, not copied into this repository. If that skill is installed, its `scripts/enrichment.py validate --ledger claims.json --out <new-output-file>` command can reproduce the structural receipt. Do not overwrite an existing skill output or describe structural success as source-truth verification. The checked result is preserved in `validation-ledger.json`; all 469 claims passed.

To reconstruct the frozen derived packet from its preserved researcher inputs, run this from repository root:

```bash
python3 research/countries/sa/2026-11-18-batch-001/assemble_packet.py
```

The assembler writes only this country directory. It applies documented ID remapping and the two operating-location corrections, then rebuilds the derived JSON files. It uses the frozen assembly timestamp and does not fetch sources or alter the source snapshots, human report, validation receipts or checksum file. Check the regenerated hashes against the committed checksums before accepting a replay. Any intended evidence update requires a new checkpoint and new receipts/checksums.

## Required integration decisions

1. **Unknown founding years — resolved in source:** initial baseline f4bcbf7 synthesized zero for Edama, Hala, Nana, Polymeron and Sadeem. Upstream [PR #179](https://github.com/castlemilk/startup-atlas/pull/179) landed during research and is included in this final baseline. Packet tests now assert those five years stay absent in the native graph. No shared implementation was changed by this country branch, and hosted runtime deployment is not inferred. `production_integration_ready` remains false pending the person and source reviews below.
2. **Person matching:** the current graph builder creates person IDs from names alone. Abdulmajeed Alsukhan is sourced as a founder of both Tamara and Nana. This is a cross-company name match, not a completed canonical-person resolution. Confirm identity and any existing graph linkage before adding these founders through that builder.
3. **Investor identities and instruments:** all canonical investor IDs remain unresolved. No typed investor edges are proposed. Keep Lendo's facility, Edama predecessor funding, Polymeron's prize and SILQ group financing out of standalone venture-round totals. Tamara facility terms and Tabby's mixed liquidity transaction require their explicit qualifications.
4. **Currentness:** source review does not certify the company's present operating/legal status or complete funding history. Retain the nine conflicting observations, all field dispositions and the held identity records. A later source does not silently supersede a different scope or entity.
5. **Owners and release:** country research review, production proposal acceptance, collector approval, PR merge, release and live verification are separate outcomes. Coordinate with existing owners; never treat this staged PR or a source discovery as crawler-seed approval. No MCP deployment is requested or performed.

## Deduplication and concurrent changes

The baseline inspection covers 45 overlay records and all 46 startups in the committed graph, plus current graph entity names for collision review. Checks normalize NFKC/case/whitespace names, canonical `www`-free domains and reviewed aliases; the observed `rewaatech.com` → `rewaa.com` history is checked explicitly. No startup collision was found. Proposed startup IDs remain staging identifiers until owner acceptance.

`run.json` binds the input file bytes, including the overlay, committed graph, startup schema, graph builder and #177 planner. A mismatch is intentional evidence of drift, not a reason to edit the hash to force a pass. Reinspect the changed files, reconcile new records and regenerate the checkpoint against the new revision. The enrichment inventory uses canonical JSON hashes; `run.json` and `SHA256SUMS` use raw file SHA-256, so those hash values serve different purposes.

The committed graph snapshot contains 537 entities and 17 rounds. A clean in-memory build from main has 46 startups and 25 rounds. The simulated staged build has 71 startups and 57 rounds. These are separate snapshots, and none is a claim that the Saudi companies are published.

## Resume the research queue

`manifest.json` binds the queue and per-field work-item hashes to the pinned main and researcher input hashes. Its first queued ID names the first prioritized continuation. Keep original queue IDs and source URLs; do not skip a blocked field by declaring it empty. Use `coverage-work-items.json` for reviewed, conflict, searched-unknown and unsearched field states. `next-source-queue.json` is a finite list of research actions, not a crawler manifest.

For each new source batch, first determine the page's actual scope and visible pagination. Record source filter, last reviewed item or cursor, pages attempted, unique candidates discovered, duplicate mappings, accepted/rejected/deferred dispositions and stop reason. No national completeness percentage is justified by this packet. The existing #177 planner demonstrates replayable inventory over supplied overlay bytes only; it does not enumerate the web or authorize any of the 25 discovered sites.
