# Independent audit — normalized France packet

**Final receipt:** 2026-11-18T10:12:05Z.
**Audited directory:** `startup-atlas-france/research/countries/fr/2026-11-18-batch-001`.
**Final repository HEAD and packet base:** `ff4d51cf729d6a654787e9a1db63967b292df8c9`.
**Disposition:** pass for the scoped normalized-packet audit. All actionable packet defects raised during this review were corrected and independently rechecked. Collection-owner admission, investor/entity reconciliation and merge/release coordination remain separate responsibilities.

This reviewer read the assembled files without modifying them. Only this review receipt was written. No git, Space, production, crawler or permission changes were made, and no broad external research was performed.

## Frozen final input hashes

These hashes describe the exact file contents read by the final audit. A subsequent change requires reconciling this receipt with the changed files.

| File | SHA-256 |
|---|---|
| `companies.json` | `b31e5b2e9bd5688cbb8bb2fb84bb79ee9ce4feb11314c615f6dc7f1e393c89c6` |
| `claims.json` | `3559bd8d7b70cb4f6b37fa97a956489a988de13f18c67a57eefd15a57792814d` |
| `sources.json` | `a4eedbc123ad67adf6b98a884654c7e9413ad9180d7115d2ff2dff003305de89` |
| `production-projection.json` | `2cd35f57107ac1e6a98bc600332d4efafefa5ee6007d8f32c5878af128cff4e9` |
| `projection-map.json` | `187536e0f99f319b29640fcdeddb6a03088da7cf9eb1a203624e3dd56ed213f5` |
| `coverage.json` | `86ece1cedc042b5ae766ea4f46ec7651feabaa1dd6e41c4d0a022ed91d9a2eda` |
| `checkpoint.json` | `d2e5eb8ec20cbd27327dbb92e85cf32be3f54a08ff69a7fa3f1d2baf67ddd778` |
| `review-queue.json` | `42ab923886b2955b87cd860752f0165f70388bb4f15ea3ab935d376b66bf43c1` |

The graph builder was separately read at fresh main: `scripts/make-graph.py`, SHA-256 `0e65145d5f7b985f99424d990a0248e5aec53613b70f80a9e53274021ad7beb4`.

## Scope and results

The audit examined companies, claims, sources, production projection, projection map, coverage and checkpoint. Supporting reads included the review queue, normalization decisions, manifest and relevant graph-builder code.

The final packet contains:

| Measure | Verified count |
|---|---:|
| Reviewed companies | 24 |
| Accepted staged companies | 23 |
| Deferred company dossiers | 1 |
| Claims | 561 |
| Source-registry URLs | 131 |
| Financing event nodes, including components | 38 |
| Named event participations | 187 |
| Typed lender/grantor relationships | 2 |
| Projected companies | 23 |
| Projected funding rounds | 22 |
| Remaining review-queue items | 16 |

Independent read-only checks returned:

- No unresolved company, event or parent-event references in claim values.
- No mismatched participant event ownership, including package components.
- Valid company-to-claim, company-to-source and claim-to-source references.
- No empty claim-link arrays in mapped projection fields and no nonexistent mapped claim IDs.
- All 187 named participations matched an event-specific claim with the same event, participant name, role and source URL.
- No projected source reference intersected the registry's rights/access-review hold URLs.
- All computed counts matched `coverage.json`.
- The checkpoint matched the canonical hash of the review-queue **items**, with unique completed work IDs and 16 remaining items. Its hash is intentionally not the raw review-queue file hash.

These checks verify normalization and relationships. They do not independently establish every source assertion's truth, re-open every source, or establish complete country coverage.

## Findings raised and resolution

### 1. Stale nested company identifiers — resolved

The initial assembled ledger had **85** nested `claim.value.company_id` references in the contributor namespace `staging:fr:startup:<slug>`, while canonical staged company IDs and outer claim entity IDs used `staging:fr:<slug>`. Twenty were founder claims and 65 were round-participant claims across the deeptech dossiers.

Example: a Verkor participation claim had outer entity `staging:fr:verkor` but inner company `staging:fr:startup:verkor`. Event IDs and parent-event IDs already resolved correctly.

The integrator normalized nested company references and added recursive handling. The final audit traversed claim values recursively and found **zero unresolved nested company or event references**. Historical contributor identities remain appropriate only in explicitly designated provenance metadata.

### 2. Incomplete projection claim links — resolved

The initial projection map had empty claim-ID arrays for **15 of 22 projected rounds**: ten AI/software rounds and five deeptech rounds. Most founder and profile-fact mappings also omitted direct claim IDs. Funding sources remained attached, but the map did not provide the intended claim-level trace.

The integrator expanded mapping to handle both path-style funding claims and generic claims whose event ID is in the claim value, and added founder/profile-fact links. The final map has **zero empty mapped claim links and zero invalid mapped claim references**.

### 3. Mistral valuation basis lost in projection — resolved

The rich record explicitly identifies Mistral's EUR 11.7bn valuation as post-money, while the initial projection retained only the numeric valuation and currency. The final round note now includes **"Valuation basis: post-money."** No production-schema expansion was required.

### 4. Quandela package participation refinement — integrated and checked

While this audit was in progress, the integrator's targeted source review distinguished three explicitly named subscribers from three historical backers. The three current subscribers were moved to the capital component; historical Bpifrance, OMNES and Quantonation context was separated from current round participation.

This audit checked the resulting normalized relationships and counts, rather than performing another source review. The final named participation count is **187**, reduced from 190, and every remaining participant has a matching event/name/role/source claim. Package components retain their parent links and non-additive aggregation instructions.

### 5. Absent founding years in graph generation — RESOLVED_BY_EXISTING_OWNER_PR179

The initially inspected graph builder used `startup.get('founded_year', 0)`, which would turn deliberately omitted founding years into zero during downstream graph generation. That was an existing implementation issue outside this research packet.

The collection owner merged PR **#179**, "Preserve absent founding years", while the audit was running. The France branch fast-forwarded to `ff4d51cf729d6a654787e9a1db63967b292df8c9`. A fresh local read confirmed that the graph builder now passes `founded_year` only when the input contains it. This consumes the owner's fix and does not duplicate implementation work. The old zero-value issue is **not an active integration hold** in this receipt.

The final claim envelope, checkpoint and projection-schema revision point to fresh main. The source-record values and source evidence were not changed by that baseline refresh. Root owns the renewed in-memory graph dry run and repository test results.

## Information preserved through normalization

**Founding conflicts.** Pennylane, Qonto, Electra and Greenerwave retain null canonical founding values and precision, with the competing observations, source URLs and meanings preserved. Their projections use separate source-qualified observations; none of the 23 projected records introduces an unqualified `founded_year`.

**Month precision.** Pennylane's January 2026 financing and Electra's June 2021 seed retain `event_date_precision:month`, while announcement dates and announcement precision remain null. Electra's projected note explicitly retains the event month and the unknown announcement day. A source's publication day is not substituted for an event month or legal close.

**Amounts and packages.** Unknown monetary values remain null. Unresolved dollar denomination is not converted into USD. Quandela's strict lower-bound package and Verkor's package, equity lower bound, approved debt and approximate public support remain distinct. Component amounts are not flattened into additive independent rounds. Unknown-stage events are represented as sourced profile facts when the existing round schema cannot express them.

**Aliases and legal scope.** Qonto's legal-name transition retains its typed aliases and validity dates. Back Market's Jung SAS observation remains scoped to the Back Market Pro legal operator and is excluded from unqualified company aliases. The production legal-entity fact retains that scope. Investor funds, managers and public professional individuals remain unresolved canonical identities rather than forced merges.

**Rights holds.** Five flagged source URLs were checked against all nested projection source references: the C12 terms page and four Verkor company pages. None leaked into the production projection. Verkor headquarters, company-only founder information and legal-entity facts backed by held pages have explicit projection omissions; its usable investor-source observations remain separately sourced.

**Planned participation.** Pigment's NVIDIA investment remains planned and is not among reported event participants. Historical founder titles remain in the rich ledger; the projection includes founder identity without silently promoting historical executive roles to current roles.

**Coverage and resumption.** The packet states a bounded, purposive sample, with no national population denominator or completeness percentage. The completed review IDs are unique, the queue digest is valid for the current baseline, and the remaining queue is reproducible. Research discovery is not crawler approval, and production publication remains outside the packet.

## Concurrent-change record

The files were actively being corrected while the review ran. The following initial hashes, observed around 10:06 UTC, are **superseded** by the final hashes above:

| File | Initial SHA-256 |
|---|---|
| `companies.json` | `3e888c2b6ec49edb94d203fd1b1f6a6391b7ebc8ae3ee455d2d5cfc5d50cd292` |
| `claims.json` | `8bb05a4b85f51d1d60f60b0d125c1f7f0d1a631de30129c049c908fd25a62b98` |
| `sources.json` | `a4eedbc123ad67adf6b98a884654c7e9413ad9180d7115d2ff2dff003305de89` |
| `production-projection.json` | `4ce3d74d61aa8531350fceedac918e17d1da910014d2a42f9a50d7c7db5b966a` |
| `projection-map.json` | `ac9dc225e9b94210d914024487003fca0e9e57f6ca698f70158b958331167468` |
| `coverage.json` | `e1b4f13bfd18b56488be060d923051bb6e3f6c1120aa725f33ed9ebf684dad6a` |
| `checkpoint.json` | `1a6473ac2bcfcbdcd8cc211755659c6f3adc6da3b6a683a711a85c85cdd31e4e` |

Changes during review addressed nested identifiers, projection traceability, valuation semantics, Quandela participant classification and fresh-main metadata. Sources and the review queue remained unchanged in the final receipt. The final checks were rerun after the owner-provided graph fix and packet baseline refresh.
