# Review and integration instructions

## Immutable inputs and ownership

Base main: `988a4ddcc4dbbc853da0c7f7899b6d6e7579f840`.

Country branch: `research/ru-gdp-08-batch-001-20261118`.

Only this directory is staged. The manifest pins the production overlay, committed graph, approved-seed file, record validator, planner and graph builder by SHA-256. Compare those hashes before reusing the recorded results; do not silently combine revisions.

The existing collection owner and planner#177 retain implementation, seed approval and durable-crawl ownership. This packet adds evidence and a continuation queue; its local validators are offline checks for this packet, not a replacement planner or crawler. The synthetic investor-round contract elsewhere in the repo is not adopted or populated with this real data.

## Reproduce the offline checks

From repository root:

```bash
node research/countries/ru/2026-11-18-batch-001/validate.mjs
node --test research/countries/ru/2026-11-18-batch-001/test_packet.mjs
python3 research/countries/ru/2026-11-18-batch-001/test_planner.py
python3 -m unittest discover -s tests -p test_company_profile_plan.py
node --test backend/hosted/tests/startup.test.mjs
python3 -m unittest discover -s tests -p test_graph.py
git diff --check
```

From this packet directory:

```bash
sha256sum --check SHA256SUMS
```

The optional enrichment-skill validator also passed for all 301 company-ledger entries; its exact receipt is included. That environment-owned helper is not copied or made a production dependency. The country validator and tests use only repository code and standard runtimes.

## Before any production proposal

1. Refresh main and source-record inventory. Re-run name, alias, domain and proposed-ID matching against new records and visible concurrent country packets. The recorded India comparison is a dated draft snapshot.
2. Retain the merged owner fix #179 in any adoption base. The initial main revision converted five correctly omitted years to zero; final main includes the fix and the country regression requires absence to survive graph projection. The existing graph/SQLite suite also passes. Do not replay this packet against an older compiler without that fix.
3. Review each candidate's entity scope and current status. This first batch verifies Russian operating-business connections; it does not assert all current HQs, parent jurisdictions, independent ownership or private-company eligibility. Mature venture-backed technology companies are retained for ecosystem context.
4. Review the projection with its claim ledger. `records.json` is current-schema compatible; omission preserves unknowns. `profiles.json` and `funding-events.json` contain richer research distinctions that would be lost in a bare projection.
5. Resolve investor canonical identities through the existing owner path. Fund, manager, sponsor, individual and corporate group cannot be collapsed automatically. Typed participants are not added to the current production record schema. Their proposed facts remain source-backed sidecars.
6. Submit only the approved records through the existing record proposal/review/apply workflow, in bounded batches. If an apparent new identity resolves to an existing event, preserve the source-inheritance protections merged by the existing owner in #181. Both owner fixes are present in the final base; this packet adds no replacement implementation.
7. Perform normal owner-controlled graph/build/release validation and live readback. The current packet has no production-write or publication receipt. An open or merged research PR is not a live data publication.

## Funding and date conventions

- Numeric projected amounts require an explicitly identified currency and supported company round total or investment-event proceeds. Investor contributions retain their own scope; textual projected contributions do not become numerical round totals.
- A bare dollar symbol or unspecified dollars stays in `amount_text`, with numeric amount/currency absent from the current-schema projection.
- `announced_on` is projected only with supported day precision. Publication, event period and closing dates are separate sidecar observations. A month or year is never padded to the first day.
- Grants, programme support, bond issues, proposed future investment, ownership consideration and international group funding are retained as separate observations when a company round cannot be established.
- Participant lists are partial. Portfolio membership, a prior shareholder relationship or fund sponsorship is insufficient to claim participation in a particular event.

## Resume collection without losing the checkpoint

Load `coverage.json` and `next-source-queue.json` together. Preserve the 24 reviewed candidate IDs, the 18 queued IDs and the 35 independent source/field tasks. ROBBO's Ingria label is already reconciled; do not create it again. The source queues include page/filter context, finite card observations, access restrictions and stop conditions.

Start with the 12 visible Sber500 alumni, then bounded Innopolis/IT Park directory pages and selected Ingria/ITMO companies. These are manual review choices; they do not authorise a crawler. Innopolis page 1 has 24 cards with 12 displayed pages; IT Park page 1 has 20 cards with 10 displayed pages and inaccessible page 2. Neither count may be multiplied into an eligible startup denominator.

All source and queue approvals remain false. The existing planner's cursor binds the input bytes, seed inventory, revision and page size; resume only with the identical inputs or start a new clearly labelled inventory after a change. Never treat an inaccessible page as empty.

## Timestamp and rights handling

Retrieval dates are 18November 2026. Timezone-aware ledger timestamps are review/capture checkpoints; individual HTTP-response timestamps were not logged. Publication/effective dates remain separately sourced and can be null. The IMF download has its own exact transfer receipt.

Retained content consists of factual paraphrases, canonical public identifiers, public professional founder information, exact source URLs and restricted bounded source observations. No full articles, proprietary database exports, marketing assets, personal contact lists or raw source workbook are included. Failed/blocked pages remain documented, without retrying through an access-control bypass.
