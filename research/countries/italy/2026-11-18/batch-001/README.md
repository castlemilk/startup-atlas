# Italy — GDP 9/30 — first research checkpoint

**22 startup proposals, 24 reviewed companies, 24 additional unverified candidates. Staged research only.**

The country packet owns only this directory. Research began at `f4bcbf7030d741772bb750deee584efa3ee17749`; the branch and integration checks were refreshed to `988a4ddcc4dbbc853da0c7f7899b6d6e7579f840`, adopting the existing owners' #179 and #181 fixes. The startup schema is unchanged. This packet does not edit production records, graph snapshots, the API, collector, seed lists, allowlists, throttles, permissions or deployment configuration.

## Read the deliverables

| File | Purpose |
| --- | --- |
| `ecosystem-report.md` | Country ecosystem, hubs, programmes, investors, reviewed company table, findings and gaps. |
| `startup-proposals.json` | 22 new-record candidates using the current strict `startupRecordSchema`; unknown optional fields omitted. This is not a replacement production overlay. |
| `projection-map.json` | Field provenance, deliberately omitted information and lossy schema projections. |
| `company-index.json` | All 24 reviewed identities, canonical domains, aliases, decisions and pointers into evidence. |
| `funding-evidence.json` and `funding-evidence.schema.json` | Country research companion for events, tranche scope, participants, debt, proposed funding, uncertainty and provenance. It is not a new Atlas API contract. |
| `claims.json` | Atomic claim ledger, including explicit conflicts, searched unknowns, blocked facts and unsearched fields. |
| `source-registry.json` | 135 registered source URLs, retrieval precision, source kinds, failed/partial outcomes and rights notes. |
| `evidence/` | Source-backed company and ecosystem research packets with native precision and public professional founder information. No source page bodies, media assets or personal-contact lists. |
| `country-manifest.json` | Count definitions, cohort assumptions, scope, owner and publication state. |
| `deduplication.json`, `baseline-snapshot.json`, `baseline-*-inventory.json` | Existing-record reconciliation and the distinction between committed and rebuilt graph snapshots. |
| `pending-candidates.json`, `next-source-queue.json`, `checkpoint.json` | Bounded continuation, unfinished source paths and digest-bound research progress. These are local research checklists, not a replacement collection runtime. |
| `review/` | Independent source audits and disposition of the localized corrections. |
| `*-validation.json` and `SHA256SUMS` | Exact test receipts, including unchanged #177 planner compatibility, and final file-integrity manifest. |

## Reproduce offline checks

Run from the repository root with Python 3, the `jsonschema` Python package and Node available. No network, credentials or crawler execution is required. The builders only write this country directory; the graph check calls the existing builder in memory.

```sh
python3 research/countries/italy/2026-11-18/batch-001/build-packet.py
python3 research/countries/italy/2026-11-18/batch-001/build-proposals.py
python3 research/countries/italy/2026-11-18/batch-001/build-funding.py
node research/countries/italy/2026-11-18/batch-001/validate-proposals.mjs
python3 research/countries/italy/2026-11-18/batch-001/validate-funding.py
python3 research/countries/italy/2026-11-18/batch-001/validate-packet.py
git diff --check
```

The optional installed enrichment-skill validator was also run against `claims.json`; `claims-validation.json` records its result. That tool is environment-owned rather than a repository dependency. The packet validator reuses `scripts/plan_company_profiles.py` on a temporary 67-record combined overlay: seven pages, every source record once, all 22 additions still requiring seed review, and drift-bound cursors. Network/DNS calls are forbidden in that test. Rebuilding intentionally changes a receipt if its underlying evidence changes; the delivered checksum file describes the committed checkpoint, not arbitrary future edits.

To verify the delivered bytes without rebuilding, run:

```sh
cd research/countries/italy/2026-11-18/batch-001
sha256sum -c SHA256SUMS
```

## Integration instructions for the existing collection owner

1. Review this data-only PR and the source/projection decisions. The collection owner remains [the existing collection session](https://chatgpt.com/c/6afbc931-0378-83ec-8434-cd7e8db42db2); [planner #177](https://github.com/castlemilk/startup-atlas/pull/177) and the repository's subsequent replay work remain authoritative for implementation. An ownership notice was posted to [the existing planner thread](https://github.com/castlemilk/startup-atlas/pull/177#issuecomment-6974888294). A posted receipt is not an owner acknowledgement or a release approval.
2. Refresh main and rebuild its graph from current source inputs. Re-run company/domain/alias, person and round-ID checks against that fresh state. This packet has zero existing startup/person matches at its pinned base, but that fact can become stale as other countries land.
3. Review each proposed startup as an individual record. The source companion is authoritative for date precision, country nexus, corporate scope, amount qualifiers and conflicts. Keep Fiscozen and Bending Spoons as research references; they are intentionally absent from the 22 startup proposals.
4. Use the established collection/proposal path for actual import. Validate each complete merged record using the live validation revision and the current `validateStartupRecord`. Read back the exact proposal head. Do not copy this staged `startup-proposals.json` over `data/startup-research.json`, and do not overwrite an entire overlay from this old base.
5. Keep event participants in the research companion until the existing owner provides an appropriate reviewed production representation. The current schema can carry sourced notes; this does not establish typed investment edges. `contracts/investor_rounds` is synthetic-only and was not used for these real entities.
6. Merge/import sequentially and revalidate each resulting base. The current PR contains research artifacts only. A merged research PR does not publish these companies. Coordinate merges and releases with the existing owners; no merge, runtime activation, MCP deployment or production submission is authorized by the mere existence of a discovery source.
7. For continuation, verify checkpoint hashes, use saved pending IDs, and append a new dated batch. Start with the explicit unresolved fields and southern/island source queue. Preserve earlier failures, contradictory claims and historical observations. Ask the collection owner to assess crawler eligibility separately; no source here is approved automatically.

## Evidence and representation rules

- Amounts use the source currency without FX conversion. Unknown is null in evidence and omitted from strict production proposals; it is never zero. Lower bounds, approximate values, conflicting currency labels and rounded cumulative totals are not projected as exact numeric amounts.
- Year/month dates remain partial in evidence. Only a verified full announcement day becomes production `announced_on`. Founding/origin, product launch, legal incorporation, announcement and closing dates remain different concepts.
- The initial graph builder's zero sentinel for omitted founding years was corrected upstream in #179 while this research was underway. The refreshed integration check proves that Unobravo, Satispay and AAVantgarde remain without a numeric founding year in the generated graph. No shared builder change is bundled in this country PR.
- Current operational headquarters, dated historical headquarters, registered offices, local facilities and founder origin remain scoped observations. An Italian address or registry eligibility is not an incorporation conclusion.
- Company-issued wire releases and company publications on external hosts are labelled by issuer; republication is not independent corroboration. Portfolio, incubator and association membership is discovery evidence, never a specific funding-round investment by itself.
- Named founders and investors are partial lists. Public professional company roles are retained; no personal contacts were harvested. Legal-entity and person reconciliation remains unresolved unless explicitly evidenced.
- The research date is 18 November 2026. Per-source timestamps document either a recorded observation checkpoint or an explicit batch window, not invented provider network-fetch seconds. Historical events do not imply complete current funding histories.

## Coverage limits

The 48 discovered names comprise the 24 reviewed set and 24 additional candidate names. The reviewed set contains 22 accepted staged proposals and two reference-only rejections. No institutional directory was exhausted and the national Atlas-eligible population is unknown. The historical statutory count of 12,073 innovative startups at 31 October 2025 is a different population and is not a denominator for this batch.

The user-specified GDP cohort remains Italy 9/30, IMF October 2026 WEO 2026 nominal GDP estimates. The API and dataset surfaces did not provide usable underlying data in this session, so the exact value, vintage and sorted rank were not independently reproduced. No replacement GDP vintage was substituted.
