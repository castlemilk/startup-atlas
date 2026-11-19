# Owner integration and resumption

This pull request proposes the **Switzerland research directory only**. `records.staged.json` contains 19 candidates using the unchanged startup-record contract. The other JSON files preserve information that the current production record cannot express safely. None is an instruction to import, publish or approve a crawler seed.

## Reproduce the checkpoint

From the repository root, run the packet validator, its negative regression tests and the in-memory graph check:

```bash
python3 research/countries/ch/2026-11-18-batch-001/validate_packet.py
python3 research/countries/ch/2026-11-18-batch-001/test_packet.py
python3 research/countries/ch/2026-11-18-batch-001/dry_run_import.py
python3 -m unittest discover -s tests -p 'test_graph.py' -v
python3 -m unittest discover -s tests -p 'test_company_profile_plan.py' -v
```

`validate_legacy.mjs` calls the repository's actual `validateStartupRecord`; no substitute production validator is introduced. The research JSON Schema is local to this packet. Python's `jsonschema` package is used for that additional check when available; its availability and result must be reported rather than silently claimed. `validation-results.json` and the receipts under `validation/` record what ran in this session.

Check the payload checksums from the packet directory:

```bash
cd research/countries/ch/2026-11-18-batch-001
sha256sum --check checksums.sha256
```

The IMF receipt identifies the official workbook URL and SHA-256. With a separately obtained matching workbook and `openpyxl` available, the offline reproducer is:

```bash
python3 research/countries/ch/2026-11-18-batch-001/verify_cohort.py /path/to/WEOOct2026all.xlsx
```

This reproducer performs no download. It selects `NGDPD` and numeric 2026 values from `Countries`, sorts descending and checks CHE rank 20, USD 1,135.739bn, 191 numeric economies and latest actual year 2025. Country groups are not mixed into the rank. The workbook itself is not copied into the repository.

## Promote records separately, through the existing owners

1. Refresh `main` and compare the source hashes in `baseline.json`. The final validation base is `988a4ddcc4dbbc853da0c7f7899b6d6e7579f840`; the original inspection was at `f4bcbf7030d741772bb750deee584efa3ee17749`. Existing owners merged PR #179 (unknown founding years) and PR #181 (legacy funding source inheritance) during this research; this branch was advanced to include both. Source-data hashes and the 45-overlay/46-graph-startup deduplication population remained unchanged. If relevant source data changes, repeat domain/name/alias deduplication and event reconciliation. Preserve other countries' additions; do not replace the entire startup overlay with this packet.
2. Review `companies.staged.json`, `claims.json`, `funding.staged.json` and `projection-map.json` together. There are 24 reviewed identities but only 19 proposed records. Keep the four acquired cases and ONWARD's foreign/public case out of that accepted subset. Current independence is not certified for every candidate, and Verity's evidence supports only a historical Swiss operating base.
3. Use the existing record writer's keyed merge behavior for accepted records in a separate owner-controlled change. Resolve any newly discovered company identity matches before allocating IDs. `unresolved:ch:*`, `unresolved:funding:*` and `proposed_atlas_id` are staging references, not live canonical identities. Match a funding record's slug to the corresponding staged event explicitly.
4. Preserve per-claim provenance. A record-level source does not automatically support a founding year from another page. The source-specific `profile_facts` retain those observations. Neural Concept's 2018/2019 conflict has no selected year.
5. Preserve the owner fix for unknown years. The initial inspection found the graph defaulting absent `founded_year` to zero. Concurrent owner PR [#179](https://github.com/castlemilk/startup-atlas/pull/179) changed that to null and was merged while this packet was being prepared. The final in-memory dry run verifies all six omitted root years remain null. The earlier integration caveat is retired; source-specific profile facts still carry their own provenance. This research PR makes no implementation or schema change.
6. Keep typed round participants in the sidecar until the record/contract owners approve a supported mapping. `contracts/investor_rounds/` is source work, not permission to activate a production API. There are no resolved canonical investor IDs or new production investor edges. A lender, portfolio member, programme award or unnamed participant must not become an inferred equity investor.
7. Let the collection and record owners coordinate merge, release and live readback. The research PR merge itself would only add staged files. A production publication claim requires a separate deployed-revision and record readback receipt.

## Resume bounded research

`queue.json` has an immutable, hashed company worklist and an offline cursor at index 24. Verify its SHA-256 and base revision before resuming at neon, followed by the 16 official ecosystem leads. If the worklist or Atlas source changes, create a fresh checkpoint after re-deduplication. The 41 source follow-ups include one already completed IMF task; statuses distinguish completed work from outstanding research.

Source-level `cursor: null` means no live page token was observed. It does not mean a directory is empty or fully enumerated. ETH and EPFL rendered directory shells, FONGIT's continuation archive, blocked Venture Leaders pages, Italian-language Ticino sources and dedicated Zug sources remain explicit gaps.

The three `captures/` files contain only concise researcher paraphrases in the existing capture envelope, with ledger hashes and included claim IDs. They are partial evidence aids, not downloaded pages, full claim exports or automatically approved crawler inputs. Use the structured ledger for conflicts, unknowns and amount semantics. Keep existing allowlists, access controls and throttling; source discovery does not alter them.
