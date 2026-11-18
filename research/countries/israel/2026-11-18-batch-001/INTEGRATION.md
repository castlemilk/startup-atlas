# Integration and continuation instructions

## Packet boundary and reviewed baseline

Branch: `research/israel-gdp25-20261118-batch01`.

Baseline: `f4bcbf7030d741772bb750deee584efa3ee17749`. Before research, the repository AGENTS, collection skill, agent runbook, graph conventions, strict startup record validator, synthetic investor-round contract, current production overlay and existing #177 collection planner were inspected. The live MCP inventory was paged four times: 332 searchable startup/partner/provider entities, including 46 startups. The separate committed overlay has 45 startup source records. The committed generated graph has 537 entities and was used only for an additional founder-name/slug collision screen.

The country packet may be merged as research documentation/data under its existing directory without putting any company into production. Such a merge is not source approval, a crawler activation, deployment, or a claim of live publication. Existing owners decide the merge and any later promotion/release.

Submission refresh: main advanced to `ff4d51cf729d6a654787e9a1db63967b292df8c9` with the existing owner's [merged #179](https://github.com/castlemilk/startup-atlas/pull/179). The country branch was fast-forwarded to this exact commit, with no edits to its six changed files. Overlay/seeds and the strict record validator are unchanged. An in-memory preview using the refreshed graph builder leaves Qodo's unknown founding year absent, retains all existing entities, and yields 67 startup nodes after the 21 ordinary records. The earlier baseline receipt remains historical evidence. This is not a live deployment assertion.

## Verify the exact branch before review

From an existing authorized clone:

```bash
git fetch origin research/israel-gdp25-20261118-batch01
git show --stat --oneline FETCH_HEAD
git diff --name-only ff4d51cf729d6a654787e9a1db63967b292df8c9 FETCH_HEAD
```

Review the exact PR head and its checksum manifest. All added files should be beneath `research/countries/israel/2026-11-18-batch-001/`. Use an isolated checkout if the working tree contains another country's work. Do not reset, overwrite or clean a shared checkout. The README gives the exact offline validation commands. Python 3.10+ and Node 20+ are sufficient; no package installation or new spending is required.

`validate_packet.py` intentionally fails when the pinned production overlay or seed input hashes differ. A later owner should compare those changes, re-run identity review against the new main and record a new baseline/checkpoint, rather than weakening the guard. The original packet remains immutable evidence of this review.

## Optional later production promotion — existing owner workflow

1. **Refresh and deduplicate.** Read current main, live graph revision, existing startup source records and pending country PRs. Match canonical domains, current/former names, legal names and graph identifiers across countries. Israel nexus is not a separate company identity. An international HQ does not justify a duplicate in another country's lane. The present packet had no company collisions and no founder name/person-slug candidates at the pinned snapshots; this is time-bounded.
2. **Resolve holds before selecting records.** Keep the three acquired-company records separate. Decide how Atlas should display historical companies through the existing model. Pentera and Deepdub have explicit access-review holds; this packet approves neither a crawler seed nor additional automated retrieval. Qodo's conflicting founding year stays omitted. Keep secondary/historical HQ descriptions qualified. Legal-name observations with null jurisdiction are not an incorporation-country fact.
3. **Use the existing proposal/update path.** Each object inside `staged-startups.json.startups` passes the current `validateStartupRecord`. It is not a bulk API envelope. Submit only owner-reviewed records through the existing guarded create/update workflow at a fresh source revision; retain claim/source sidecars in the research packet. Re-run full existing pipeline validation for that actual promotion. Do not copy this whole document over `data/startup-research.json`, convert it to a new endpoint, or expand the accepted schema.
4. **Keep relationship identity work explicit.** The 59 founder associations contain public professional names and source roles, with canonical person IDs unresolved. The 231 investor links apply only to their cited financing events; canonical investor IDs are also unresolved. Resolve fund versus manager, corporate vehicle versus parent and similarly named individuals against current graph entities before introducing typed edges. In particular, reuse the existing `partner:square-peg` identity if the owner confirms the exact relationship; do not create a duplicate because it appears in this country packet. Portfolio/programme membership never establishes a round investment. The repository investor-round contract is a synthetic development contract, not a live accepted API.
5. **Preserve transaction semantics.** AI21's expanded round is one event, with the final amount attached to its November completion announcement. Extensions remain linked to their parent events. No cumulative-funding, valuation, acquisition consideration or credit-facility amount becomes an equity round. USD is explicit for only two selected events; other `$` values remain textual until supported. Classiq's November event has month precision and an exact-day hold. The selected 33 events are not complete company funding histories.
6. **Read back the actual release.** Record the promotion PR, merge SHA, existing release run and live graph/source revision only after they occur. Verify returned entities/relationships against that revision. Do not mark this research packet `published_verified` merely because a PR is opened or merged.

## Resume bounded research

Read `next-source-queue.json`; validate `queue_sha256` over the canonical JSON of `pending_items` (UTF-8, sorted keys, compact separators). Load `completed_company_ids`, then start with `next_item_id`. Keep the original checkpoint and append a new packet for changed or additional evidence. The queue is an evidence worklist; it does not enqueue network requests.

The existing #177 planner was exercised offline against the pinned overlay/seeds using ten-record pages. Its five pages cover all 45 supplied source records: one ready approved seed, 43 needing seed review and one missing a reviewed website. All collection states remain `not_assessed`. Its bound cursor is not reusable against different input bytes or batch sizes. No implementation from #177 or the synthetic #178 replay was replaced, activated or duplicated.

The next research pass should resolve high-impact company conflicts, verify the twelve Techstars cohort leads individually, then take bounded slices of the Authority's 2026 directory and regional/university sources. That directory includes non-startup categories; its displayed 253 entries is not an eligible startup denominator. Record category, source-native identifier, page/cursor boundary, failures and termination evidence before claiming a bounded source is exhausted.

Respect existing allowlists, throttling and access controls. No robots.txt requests, restricted-source retries, proprietary bulk export, credentials, personal-contact collection, outreach or spending are authorized by this packet. An unreadable/blocked page is an access gap; it is not evidence of an absent company or zero funding.

## Transfer and provenance

The packet is self-contained research data inside the repository. `CHECKSUMS.sha256` covers every deliverable file except itself; `manifest.json` enumerates payload hashes while excluding itself and the checksum file to avoid self-reference. Keep the original raw shards, normalized claims and conflicts together. The bounded paraphrase captures are optional offline review inputs and retain claim IDs/subset hashes; they must not replace structured provenance or be treated as crawled source text.

The IMF API and WEO landing-page access limitations are recorded in `ecosystem-research.json`. Re-verify the requested October 2026 vintage directly before asserting an independently calculated GDP ranking; do not substitute another release vintage or a search snippet.
