# Sweden — bounded country research packet

**GDP 26/30 · 18 November 2026 · batch 001.** This folder is the sole owned change. It contains reviewable research and existing-schema projections, separate from production inputs.

Start with [ecosystem-report.md](ecosystem-report.md), then [company-review.md](company-review.md). The packet reviews 27 companies: 19 accepted for staged profiles, seven held and one historical exclusion. Twenty further named discoveries are queued; the total registered candidate population is 47. These are bounded research counts, not a count of Sweden's startup population.

## Files

| File | Purpose |
| --- | --- |
| `staged-startups.json` | 19 records accepted by the existing `validateStartupRecord`; 46 founder entries and 24 selected financing events |
| `companies.json` | Identities, aliases, domains, company dispositions, explicit field statuses and claim references |
| `claims.json` | Authoritative 504-observation ledger with per-claim sources, retrieval/review times, date precision and conflicts |
| `funding-ledger.json` | 35 event observations with event-specific participants, alternative amounts, advisers and commitments joined by ID |
| `source-registry.json` | 153 selected source URLs, access outcomes and claim links; 146 readable and seven access/content gaps |
| `projection-map.json` | Every claim accounted for; disjoint mapped/research-only claim categories, with typed limitations on text projections |
| `decisions.json` | Held/rejected identities and unresolved fields |
| `coverage.json`, `source-queue.json` | Counts, source/pagination limits, 20 named discovery leads and 48 resumable work items |
| `manifest.json`, `CHECKSUMS.sha256` | Snapshot/ownership contract, original-input hashes and checksums for every other packet file |
| `deduplication.json`, `concurrent-review.json` | Baseline and observed pending-country overlap checks |
| `baseline-*-inventory.json`, `baseline-*-planner.json` | Explicit initial and refreshed snapshot receipts; committed versus rebuilt graphs kept distinct |
| `live-baseline.json` | Published MCP probe; not evidence of this packet's publication |
| `graph-rehearsal.json`, `planner-replay.json` | In-memory graph integration and replay using the existing #177 planner |
| `validation.json`, `test-results.txt`, `enrichment-validation.json`, `REVIEW.md` | Executed checks and independent review corrections |
| `observations/` | Auditable lane inputs and ecosystem evidence; root-authored corrections are recorded in REVIEW |
| `captures/` | Four bounded exports of researcher paraphrases, explicitly not live crawler captures; complete claims remain authoritative |
| `build_packet.py`, `packet.test.mjs`, `check_planner_replay.py` | Reproducible country-only normalization and checks; no crawler/runtime implementation changes |

## Ownership and baseline

Initial main was `f4bcbf7030d741772bb750deee584efa3ee17749`. The final tested base is `988a4ddcc4dbbc853da0c7f7899b6d6e7579f840`, incorporating the existing owners' #179 and #181 fixes. The branch is `research/sweden-gdp-26-batch-001-20261118`.

The [existing collection owner](https://chatgpt.com/c/6afbc931-0378-83ec-8434-cd7e8db42db2) retains collection approvals and implementation. [Planner #177](https://github.com/castlemilk/startup-atlas/pull/177) remains the planner. [Canonical Space](https://chatgpt.com/space/page_5167bcbbbb0c81919e1d565fd4d82e4a) receives the exact commit/PR/check receipt. Ownership acknowledgement and merge/release decisions are not inferred from posting a handoff.

The `unsubmitted` claim publication state refers to production record adoption. A research review PR does not make its observations live Atlas records. The synthetic investor-round contract is not applied to these real companies. Investor names are retained with event-specific evidence, while canonical investor IDs remain unresolved.

## Reproduce the focused checks

Run from the repository root at the pinned base plus this folder:

```sh
python3 research/countries/se/2026-11-18-batch-001/build_packet.py
node --test research/countries/se/2026-11-18-batch-001/packet.test.mjs
python3 research/countries/se/2026-11-18-batch-001/check_planner_replay.py
python3 -m unittest discover -s tests -p 'test_company_profile_plan.py'
git diff --check
```

`build_packet.py` writes only generated files in this country folder. It imports the existing graph builder and invokes its pure `build_graph` function, never the production-writing entry point. The planner replay uses a temporary combined overlay, deletes it on exit, performs no fetch/crawl and preserves seed approval states. Rebuilds change packet files whose baseline/run bytes changed; regenerate checksums after an intentional update. The initial baseline receipts remain historical.

The optional installed enrichment helper validates `claims.json`; its executed output is retained. Capture exports are each below its 100-document bound and carry a hash of the lane-specific ledger subset. They are deliberately lossy paraphrases and must travel with the complete ledger. No direct crawler page bytes, images, contact lists or proprietary datasets are included.

## Integration instructions for existing owners

1. Review the country PR and exact evidence hashes. Refresh main and other country packet heads, then repeat normalized identity/domain/alias and founder checks. This checkpoint's baseline deduplication is not a permanent guarantee.
2. Resolve company-level holds before any active-profile promotion. Keep Sana, Planhat, Normative, Einride, Heart Aerospace, Stegra and X Shore in their documented review lanes; Northvolt remains historical. Alight's majority-owned category must remain visible. Field-level unknowns do not become zero or guessed jurisdiction/HQ values.
3. Use the existing record proposal/validation path to adopt only reviewed records from `staged-startups.json.startups`. Merge by reviewed identity; do not replace the whole production overlay. The current owner guard for funding-source replacement must remain effective, and unsupported typed fields stay in the research sidecar.
4. Preserve the provenance map. Later participant disclosures, currency corroboration and alternative reported amounts keep separate sources and their own date precision. Do not sum commitments, debt, secondary consideration, cumulative totals or alternative currencies as company equity. Portfolio membership and transaction advisers do not create investor participation edges.
5. Source discovery is not crawler approval. All 19 proposed additions remain `seed_review_required` in the existing planner rehearsal. Only the existing collection owner may approve seeds through the established process, preserving allowlists, throttles, access restrictions and the prohibition on robots.txt requests.
6. Owners coordinate merge and release through existing paths. After any future production adoption, inspect the deployed source revision and actual company/round/source readback before marking claims published. This research PR makes no production-publication claim.

## Resume contract

`source-queue.json` is a manual research worklist, not a replacement collector or scheduler. Its binding records the base revision, ordered queue IDs and a content digest. A resume cursor is valid only for those exact bytes and the declared item boundary; changing ordering or evidence requires a new binding. The owner planner's own cursor behavior is tested separately against 64 baseline-plus-staged records and rejects revision, input-byte and page-size drift.

Next-source enumeration should use bounded source cohorts and explicit status/pagination observations. The SSE summer 2026 list has eight observed names; Chalmers, Minc, Uminova and other directories remain unexhausted. National completeness, exhaustive founder rosters and full company funding histories are not claimed. The IMF October 2026 numeric payload/rank remains an explicit source-access gap.
