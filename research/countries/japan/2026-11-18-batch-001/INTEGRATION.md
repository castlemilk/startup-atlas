# Japan batch 001 — integration and owner handoff

## Scope and ownership

This packet owns only `research/countries/japan/2026-11-18-batch-001/` on branch `research/japan-gdp-04-batch-001-20261118`. Its initial source base was `f4bcbf7030d741772bb750deee584efa3ee17749`; its refreshed validation base is `988a4ddcc4dbbc853da0c7f7899b6d6e7579f840` in `castlemilk/startup-atlas`. It is proposed in [draft PR #187](https://github.com/castlemilk/startup-atlas/pull/187). It adds research and staged projections; it does not add companies to the production overlay or generated graph.

The [existing collection owner](https://chatgpt.com/c/6afbc931-0378-83ec-8434-cd7e8db42db2) retains collection, merge, release, registry and crawler ownership. Coordination began in [planner #177](https://github.com/castlemilk/startup-atlas/pull/177#issuecomment-6974828364). That planner PR was already merged when inspected; it is a coordination reference, not a second implementation assignment. The subsequent company-profile replay implementation #178 was also merged into the inspected base.

The [canonical Space](https://chatgpt.com/space/page_5167bcbbbb0c81919e1d565fd4d82e4a) and the country PR carry the exact post-commit delivery receipt. The initial packet commit `c3e233ad3012782010617ea6651fd6f2495b087b` retained its unsubmitted preparation state. The refreshed packet records delivery as *proposed* in PR #187; claim status remains `reviewed_staged`. A draft PR does not approve sources or prove production publication.

## Files and authority

| File | Meaning |
| --- | --- |
| `README.md` | Ecosystem report, full reviewed-company roster, financing and identity decisions, counts and gaps |
| `companies.json` | Canonical 30-company research packet with typed claims and a copy of the source registry |
| `claims.json` | Exact expansion of every canonical claim across its supporting sources: 703 assertions |
| `sources.json` | 165 unique source URLs, 166 retained registry observations, access outcomes and timestamp precision |
| `records.json` | 19 accepted research identities projected into the unchanged Atlas startup schema |
| `alumni-records.json` | Nine optional listed/acquired alumni projections, kept separate from private candidates |
| `projection-map.json` | Every projected leaf bound to a canonical claim and an explicit derivation; unsupported claims identified as research-only |
| `ecosystem.json` | Historical ecosystem-only checkpoint: 13 policy hubs, nine programmes, seven investor networks |
| `coverage.json` | Counts, field dispositions and content-bound research checkpoint; national denominator null |
| `next-source-queue.json` | **Authoritative resumption queue**, including the Sakana overlap already reconciled with the fifth J-Startup roster |
| `deduplication.json` | Matching decisions against the rebuilt source graph and production overlay at the pinned base |
| `captures-01.json` through `captures-03.json` | Optional researcher-paraphrase adapter inputs, split into 39/37/36 documents; never represented as live-fetched pages |
| `captures-manifest.json` | Binding from all three capture chunks to the complete ledger; no crawler job submitted |
| `validation.json`, `claims-validation-final.json`, `graph-validation.json` | Final local validation receipts; all five unknown years remain absent after upstream #179 |
| `validation-history/claims-validation-initial.json` | Superseded failed confidence-enum check, retained as an audit observation; fixed before final validation |
| `validation-history/graph-validation-initial.json`, `upstream-refresh.json` | Historical zero-year behavior and refresh evidence crediting the existing owner's #179/#181 fixes |
| `manifest.json`, `CHECKSUMS.sha256` | Staging boundary and byte checksums; no circular self-hash |

`ecosystem.json` retains its lane-local historical count of zero individual company reviews. Resume from `next-source-queue.json`, which incorporates the company lanes and resolves Sakana. Do not use the old ecosystem-only cursor to replay the reviewed overlap.

## Reproduce the country checks

From the repository root, using its normal Node and Python runtimes:

```bash
python3 research/countries/japan/2026-11-18-batch-001/packet_tools.py
python3 -m unittest discover -s research/countries/japan/2026-11-18-batch-001 -p test_packet.py -v
node research/countries/japan/2026-11-18-batch-001/validate_records.mjs
python3 research/countries/japan/2026-11-18-batch-001/validate_graph.py
```

The graph check rebuilds both baseline and hypothetical combined graphs **in memory**. It writes only its country-local receipt. It checks source hashes, existing startup names/aliases/domains, slug uniqueness, source graph coverage, founder IDs, edge endpoints and event IDs. It intentionally fails if its pinned input graph has changed: refresh the base and review deduplication decisions instead of weakening that assertion.

To verify the final bytes, run from this packet directory:

```bash
sha256sum -c CHECKSUMS.sha256
```

The evidence-ledger receipt also records validation by the `startup-atlas-enrichment` skill's unchanged `scripts/enrichment.py`. That skill is an environment dependency, not a new repository API. Its capture helper rejected an unsplit 112-document export because the existing limit is 100; the final three chunks respect the limit. No limit, allowlist, throttle or access control was changed.

`project_records.mjs` is a deterministic country-local projection helper. Run it only when intentionally updating the staged projections, then repeat checks, regenerate hashes and attach a new review receipt. It never writes production files.

## Production promotion gates

1. **Refresh current main and reconcile concurrent work.** Repeat the source-derived inventory and name, alias, host and slug matching. The inspected committed `data/graph.json` was stale: 537 entities versus 555 in the source rebuild. The 45-record research overlay alone also misses one portfolio-derived startup, so it is not a complete deduplication universe. The rebuilt baseline has 46 startup entities.

2. **Preserve the upstream fix for unknown years.** During publication the existing implementation lane merged [#179](https://github.com/castlemilk/startup-atlas/pull/179), commit `ff4d51cf729d6a654787e9a1db63967b292df8c9`. The refreshed graph check verifies that omitted `founded_year` stays absent for Josys, Interstellar Technologies, Astroscale, Axelspace and Paidy. Josys has distinct 2021 origin and 2022 establishment semantics; Interstellar's date is business commencement; Astroscale/Axelspace dates refer to holding companies rather than group/operating-company origins; Paidy's founding date was not reviewed. The original failure is retained as a historical receipt, not an unresolved current-main defect. Do not insert guessed years or duplicate the owner's implementation work.

3. **Decide record eligibility and entity scope explicitly.** The 19 accepted identities are evidence-reviewed candidates, not a complete current private-status certification. Review material listing/acquisition developments before promotion. Keep the nine alumni in their own decision set. Spiber remains held until former/successor identifiers and transfer continuity are resolved. GITAI remains excluded from the Japan-HQ projection; its Japan-origin connection can be handed to the US lane without copying a second parent record.

4. **Preserve typed financing evidence and suppression decisions.** The current startup schema has no typed round participants, date precision or incorporation fields. Keep those in the research ledger; do not silently add API properties. Numeric production amounts are allowed only for explicit reported equity/new-share components with usable scope and non-overlap. Mixed, approximate, lower-bound, cumulative, overlapping, debt and unresolved-instrument observations retain qualified `amount_text`/notes. Their numerical source values remain in the canonical evidence; this is not a claim that they were zero or absent.

5. **Retain event relationships without inventing legal matches.** All canonical investor IDs remain null. Resolve actual fund vehicles separately from managers, sponsors, LPs, lenders and advisers before adding edges. CADDi's two JPS fund vehicles are distinct from the manager-group label. WOTA's SMBC Nikko placement intermediary is not an investor. Portfolio membership and programme selection never create funding-round participation.

6. **Use the existing approved proposal and release path.** If the owner accepts a subset for production, prepare a separate reviewed production-data proposal at current main, using the existing startup record validator and merge behavior. Do not replace all of `data/startup-research.json`, rerun the crawler against an unapproved source list, expand the synthetic investor contract to real data by marking it synthetic, or deploy an MCP service. The synthetic-only contract from #174 is not this real-data packet's validation route.

   Current main also includes [#181](https://github.com/castlemilk/startup-atlas/pull/181), which rejects replacing a funding source while silently inheriting omitted claims. An omission-only upsert cannot remove an existing amount. If a future deduplication pass finds an existing event with unsupported numeric fields, prepare an explicit reviewed correction through the owner's supported path; do not assume this packet's missing numeric field deletes production data.

7. **Verify the promoted result after owner-controlled merge/release.** Record exact source and deployed revisions, read back the affected identities and preserved qualifiers, and then update only the publication fields supported by that receipt. A passing schema check, branch commit or draft PR alone is not `published_verified`.

## Resume research

Start with the 30 unresolved companies in the fixed 31-name fifth J-Startup cohort; Sakana has already been matched. The queue preserves Japanese names. Open each official company profile, current status and funding announcements, and repeat entity-level deduplication before acceptance. J-Startup membership is discovery evidence, not a verified company profile or crawler approval.

Next, enumerate NEDO DTSU/GX tables with programme/phase/year keys, deduplicating repeat rows and keeping grants separate from equity. Continue regional university rosters and the undercovered Hiroshima, Kitakyushu and five NEXT hubs. The 11-page Incubate portfolio, partial Tokyo database and blocked/empty source outcomes have explicit queue entries. Existing company queues preserve founder, incorporation, current ownership and event-completion gaps.

The content-bound checkpoint supports deterministic continuation of this **research review population**. It is not a production crawler cursor or an assertion of complete country coverage. The national startup denominator remains unknown.
