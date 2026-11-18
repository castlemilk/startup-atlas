# Independent integration review — Singapore batch 001

**Result: PASS for the reviewed fixes and generated-artifact scope.**

Reviewed by `sg_platforms` on 2026-11-18 at 10:06:53 UTC, with a bounded main-refresh inspection at 10:13:40 UTC. The review read the country builder and the generated companions/staging files. It did not execute the builder, edit tracked files, or read additional web sources.

Packet root: `/workspace/scratch/b4f5bb8bbff9/startup-atlas-singapore/research/countries/sg/2026-11-18-batch-001/`

## Verified fixes

- **Carousell founding:** the builder now accepts `founding_date`. The generated record includes `founded_year: 2012` and a distinct `2012-08` month-precision founding observation, sourced to the company Group page. The map references the original supporting claim.
- **Resolvable pointers:** all **371** emitted field-map pointers resolve against their identified record. All **260** retained logical selectors match the name, ID or key of the object reached by the numeric pointer. Every mapping has supporting claim IDs, and mapped source URLs equal those claims' URLs.
- **AMILI provenance:** headquarters claim `sg-dt-41ae270d8909f362` now has medium confidence. Its generated headquarters fact identifies the LinkedIn self-report, unauthenticated profile ownership and separation from incorporation evidence.
- **Legal-entity observations:** all **10** generated legal-entity profile facts have one source-specific supporting claim, matching source URL, and a parsed value identical to that claim. This includes Augmentus' two contracting entities. All 25 rich company records retain unknown incorporation country as null.
- **Unknowns and cohort separation:** Glints has no `founded_year` property in the schema projection and retains null founding value in its companion. The generated files contain **24 startup candidates** and **one separate Horizon Quantum alumnus**.

The earlier code review found direct writes confined to the country packet. The imported graph module's guarded entry point is not invoked by `build_graph()`. The corrected mapping block and added legal-entity facts introduce no new output destination.

## Main refresh and independent owner fix

Initial research used `f4bcbf7030d741772bb750deee584efa3ee17749`. Local Git history confirms the checkout now points to `ff4d51cf729d6a654787e9a1db63967b292df8c9`, the merge of the existing owner's [PR #179](https://github.com/castlemilk/startup-atlas/pull/179). That independent change preserves absent founding years in the shared graph projection. The country packet did not implement or duplicate this shared fix.

The country builder and packet-test `BASE` now identify the refreshed main. `provenance/main-refresh.json` records the fast-forward at `2026-11-18T10:13:07Z`. The final replay metadata reports **14 absent projected founding years and zero zero-valued year sentinels**, with the initial replay retained in `provenance/graph-replay-initial-main.json`. These 14 omissions include years deliberately represented only in separately sourced profile facts; they are not a count of 14 unknown business-founding dates.

The refreshed manifest retains the separate owner review/import gate and attributes the shared correction to PR #179. The rich companies, claims, sources, both staged record files and projection map are byte-for-byte unchanged from the earlier verified state. The existing validation receipt reports 27 passing packet tests and schema validation of 24 startup records plus one alumnus, rejecting all seven malformed cases. The main-refresh receipt reports 10 passing existing graph tests. Those receipts were inspected, not rerun by this reviewer.

## Reviewed SHA-256 values

Paths below are relative to the packet root. These hashes identify the exact reviewed state, rather than later edits or regenerations.

| File | SHA-256 |
|---|---|
| `tools/build_packet.py` | `fd905314ca414447e7ae1bcb06d94a89a9bd18b164ee480c331d703c2f7a987e` |
| `inputs/integration.json` | `2466da984ed2cfad854bc8c51407f313982add7681ba486314829ec4c9b1a0b9` |
| `companies.json` | `b84af37328ec6a25ae93a30d18e4f52cdf844aa820898adc1a29a8c85a36b644` |
| `claims.json` | `fa6a883f298ddc0cf601ad0decd8907dca18e4573c8922e86eb080bff30eaaf3` |
| `sources.json` | `761227daa6af32f0d42f733498e0fdba8e1370b7e5c725b95c13d13aebecac4f` |
| `staging/startup-records.json` | `b33eb8f2efacd303a5391c986b909db3767a66944ac169bb04da28b9d8c86fa7` |
| `staging/alumni-records.json` | `c192802b7b88ae521a7e9e1994e97284c13a41f0fe0c7f5fc3febbbfc014fd14` |
| `staging/projection-map.json` | `8227a3969e6d917cd8d676acb30220bc5828aa021a5ccaf6592fa8a25a6e88d3` |
| `staging/manifest.json` | `c33a33e31f8032ef97ad7c522d27f62cff440b2fa7ed82fb4aec229f8f6a8914` |
| `provenance/graph-replay.json` | `0a95e7bddaca901a6cec75c5dea699990b8f87b70c6abe11034b8e78ec1cdab1` |
| `provenance/main-refresh.json` | `3464673c4eea605ed8d857dbb82e3fed1ed3dac3dc74429b0a22bf02d1a06823` |
| `tests/validate_packet.py` | `efe71c7a00fd756c0ee72d7daadc1a572fd6896d09cf63a5a4007e9eef02218c` |
| `validation.json` | `7da45be484a6d0ee2e840649e39727a33c3a7199f1552112f298f6b69f946d2a` |

The pre-refresh builder reviewed at 10:06:53 UTC had SHA-256 `985872fa1831e1841587625e690c2de0bd782128ef7c84ad865bbd4544ba5de7`. Its review findings remain satisfied by the unchanged data and pointer artifacts above.

## Limitations and integration scope

This checks correction propagation, source relationships, navigation of the captured artifacts and the bounded base-refresh changes. It does not replace the owner's schema/regression tests, reverify every research claim, establish current legal status for every company, or approve production import. Source-specific date/currency gaps and pending current-headquarters checks remain owner integration considerations; the earlier zero-sentinel defect is resolved by the independent owner change in the final reviewed base. The country builder is specific to this fixed batch; this review does not establish general handling of arbitrary future names or evidence shapes.
