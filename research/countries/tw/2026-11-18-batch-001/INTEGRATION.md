# Taiwan packet integration and resumption

## Pinned inputs and ownership

Packet directory: `research/countries/tw/2026-11-18-batch-001/`.

Country branch: `research/taiwan-gdp22-batch01-20261118`.

Refreshed source baseline: `ff4d51cf729d6a654787e9a1db63967b292df8c9`. Initial inspection used `f4bcbf7030d741772bb750deee584efa3ee17749`; the only intervening changes were the existing owner's #179 unknown-year fix and its tests/docs. Production overlay, seeds and company identity inputs were unchanged.

The collection owner retains crawling/seed decisions and #177 retains planner ownership. The existing record owner retains canonical identity and schema semantics; the investor-round owner retains participant identity and event migrations. Review/merge/release remain with those owners. This packet does not deploy MCP or modify runtime, permissions, allowlists, throttling or production data.

## Verify the review packet

Run from the repository root at the country PR revision:

```sh
python3 research/countries/tw/2026-11-18-batch-001/validate-packet.py --checksums
python3 -m unittest discover -s tests -p test_company_profile_plan.py
python3 -m unittest discover -s tests -p test_graph.py
node --test backend/hosted/tests/startup-edit-domain.test.mjs backend/hosted/tests/startup-edit-corpus.test.mjs
```

The packet validator uses only Python's standard library and Node. It imports the actual current record validator and graph builder, constructs graphs in memory, calls the existing planner, verifies input hashes and performs ten rejecting negative probes. It never invokes the crawler or graph builder's file-writing entry point. `--report` deliberately rewrites `validation.json`; omit it when checking frozen checksums.

`SHA256SUMS` covers every packet file other than itself. To inspect the ordinary checksum receipt independently:

```sh
cd research/countries/tw/2026-11-18-batch-001
sha256sum -c SHA256SUMS
```

## Review before any production proposal

1. Read the ecosystem report, decisions and field uncertainties. Decide the product scope for listed alumni, protocol/project records and Taiwan ecosystem ties where current HQ is unknown. Accepted staging is not automatic production acceptance.
2. Re-read current `main`, AGENTS, source schema, production records and open collection work. If any manifest input hash differs, re-run deduplication and planner snapshots against the new baseline; do not bypass the validator's input-change failure. Refresh age-sensitive source evidence through permitted public paths.
3. Resolve legal/group identities separately from operating brands. Preserve 91APP's Cayman parent distinction, Appier/Avalanche holds, FunNow group/investee wording and unresolved incorporation. Recheck canonical domains and aliases against all entity kinds, not just startup nodes.
4. Review the complete `startup-records.json` object using the existing `validateStartupRecord` workflow. Retain omitted optional fields. Facts sourced elsewhere are represented by individually sourced profile facts; changing a top-level source must not reattribute inherited description, website or founding-year fields.
5. Preserve `claims.json`, `funding-events.json` and `projection-provenance.json` alongside the proposed records. The current schema cannot losslessly express alias identity, HQ versus incorporation, partial dates, amount bounds or typed investor participation. This packet does not propose a product-schema extension.
6. Keep all unresolved participant IDs null and create no investor edges from portfolio membership or an existing-investor list. Forty-seven participant observations are event-linked evidence, not forty-seven reconciled investor entities. Hotai's FunNow participation is prospective; KryptoGO's disputed funding headlines remain outside accepted events.
7. Submit only the owner-selected records through the existing review/proposal path, in a bounded additive batch, after refreshing identity conflicts. Do not concatenate this packet blindly into the production overlay or use the synthetic-only investor-round / #178 replay contract with real facts.
8. Once the appropriate owners approve production application, run the repository's normal data/graph/SQLite and acceptance gates on the exact proposed revision. Observe the actual merge and release before marking any claim published. A research PR, preview or green offline validation does not establish publication.

## Representation findings

The initial graph builder converted omitted founding years to zero. The owner resolved this in [#179](https://github.com/castlemilk/startup-atlas/pull/179), which is included in the refreshed baseline. The final packet check verifies that all eleven intentionally omitted years remain absent. No invented date was inserted to satisfy the old behaviour.

The graph builder still deduplicates article rows by company and URL. Jmem Tek has three event IDs but one generated funding article; JelloX and CancerFree each have two event IDs but one article. All event IDs survive. Use event counts, not article-row counts, for financing coverage. Do not invent URL fragments to defeat article deduplication.

Dcard's sourced Chinese founder name remains in staging/profile facts because the current ASCII person slug would be empty. Public professional spellings such as Birdman and KJB remain unresolved identities even though their slugs are currently non-colliding.

## Resume bounded research

Use the exact queue/decisions hashes and reviewed identity list in `coverage.json`. The next suggested source task is `tw-queue-tta-south-green`; it has a ten-page budget. TSS has a separate ten-page/five-company bound. ITIC, BE Health, FITI and accelerator cohorts are subsequent independent slices.

Remote directory cursors are **unknown**, not exhausted. Re-read the actual permitted continuation control before advancing and record its source/offset/token. Do not synthesize a pagination offset from the count of selected names. If queue or decision bytes change, issue a new checkpoint and retain the previous receipt in git history.

The baseline planner receipt deliberately reuses `scripts/plan_company_profiles.py`: five pages, forty-five unique source records, deterministic cursor binding to revision/input hashes/page size. It inventories the existing overlay; it does not claim to have crawled or reviewed those records.

The iKala host is paused following HTTP 429. NDF/TPEx/registry access restrictions and redirect failures remain recorded. No robots requests, credentials, login escalation, new spending or contact harvesting are part of this queue. A new official source discovered through research requires the existing owner's separate crawler-seed review.

`research-captures.json` is a bounded, lossy export of researcher paraphrases generated with the existing enrichment helper. It is not a collection of raw response bytes and is not a live crawl. The structured ledger remains authoritative; do not feed it to a synthetic fixture or use it to imply access approval.
