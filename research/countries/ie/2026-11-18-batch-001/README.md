# Ireland — GDP cohort 27/30 — batch 001

**Research checkpoint: 18 November 2026.** This directory owns only Ireland research and staging, based on main [`f4bcbf7030d741772bb750deee584efa3ee17749`](https://github.com/castlemilk/startup-atlas/commit/f4bcbf7030d741772bb750deee584efa3ee17749). It is a reviewable data packet, not a production import. The IMF cohort is the user-supplied October 2026 WEO nominal GDP estimate cohort; independent rank/value verification remains blocked.

## Results and denominators

| Measure | Count / scope |
| --- | --- |
| Explicitly discovered company candidates | 43 |
| Reviewed company candidates | 25 |
| Accepted into proposed research staging | 21 |
| Boundary holds, separately schema-valid | 3: Fin/Intercom, Workhuman, LetsGetChecked |
| Rejected country candidate | 1: Fovotech discovery resolved to UK Fovotec/FOVO Technology Ltd |
| Queued company leads, unreviewed | 18 |
| Source-backed company dossiers | 24, including the three holds |
| Atomic claims | 458: 447 reviewed/staged, 9 conflicts, 2 candidates |
| Registered unique source URLs | 172; 153 accessed and 19 not accessed successfully |
| Accessible but non-evidentiary shell | 1 of those 153: IMF WEO landing page |
| Founder entries | 44; lists are partial, and FIRE1 has no inferred individual founder |
| Company-financing events | 28; history is partial, instruments and currencies are qualified |
| Other financing observations | 1 grant and 1 secondary sale in dossier event arrays; 3 separate grant, future-equity-commitment or debt items |
| Event-specific participant observations | 140; no automatic canonical investor edges |
| Production changes / approved crawler seeds | 0 / 0 |

The denominator for dispositions is the 43 explicitly named/domain candidates in `queue.json`. It is not the Irish startup population. The 25 reviewed candidates consist of 21 accepted, three held and one rejected. No proportion of national completeness is asserted. The 21 proposed profiles include scaleups, acquired businesses and companies whose Irish ecosystem connection is established while current HQ remains unknown; they are not a count of independent Ireland-HQ startups.

## Files

| File | Purpose |
| --- | --- |
| `ecosystem-report.md` | Country scope, hubs, sectors, programmes, funding context, investor networks and source gaps. |
| `company-index.md` | Readable enumeration of all 24 dossiers with geography/founding qualifications. |
| `companies.json` | Rich country-local research sidecar: identity, aliases, HQ versus legal geography, date precision, founders, events, participants, uncertainty and source references. This format is not a proposed production API. |
| `claims.json` | Atomic evidence ledger, including conflicts and candidates, per-claim source URL, retrieval/review timestamps and rationale. |
| `startup-records.json` | 21 records conforming to the existing `startupRecordSchema`; staged for owner review only. |
| `boundary-records.json` | Three schema-valid records held for geography/ownership/identity decisions. Do not append these automatically. |
| `source-registry.json` | Unique URLs and original observations, access outcomes, limitations and claim indexes. No full page bodies or contact lists. |
| `source-access-log.json` | Bounded discovery/read history and failures. Not an assertion that every query result was evaluated. |
| `projection-map.json` | Every claim mapped to a partial current-schema projection or retained as research-only, with omission reasons. |
| `deduplication.json` | Name, alias, domain and production-slug comparison against 45 overlay startups and all 537 entities in committed graph. |
| `field-coverage.json` | Per-company searched/unknown/conflicted/partial dimensions and follow-ups. |
| `queue.json` | Hash-bound, revision-bound continuation; 18 pending companies, source-resume tasks, field gaps and lane-specific queues. |
| `coverage.json`, `manifest.json` | Scope and reconcilable counts, ownership boundaries, baseline and delivery semantics. |
| `baseline-inventory.json`, `baseline-planner.json` | Pinned inventory and five offline pages of existing planner #177, covering all 45 overlay records exactly once. No crawler ran. |
| `integration-review.md` | Independent source/dedup review, corrections applied and remaining owner decisions. |
| `validation.json`, `packet-validation.json`, `evidence-validation.json` | Actual command receipts, graph-preview results and evidence-ledger validation. |
| `validate_packet.py`, `validate_startups.mjs`, `test_packet.py` | Offline reproducible country-local verification using the existing production validator. |
| `checksums.sha256` | SHA-256 of every deliverable file except itself. |

## Normalization and evidence rules

Names retain accents and branding; comparison uses Unicode NFKC/casefold/whitespace normalization, plus the production NFKD ASCII slug. Domains use lowercase hostname with a leading `www.` removed. A match is a review candidate, not authority to merge legal entities. Fin's Intercom alias matches **`provider:intercom`**, which already offers **`programme:intercom-early-stage`**. Those identities and the programme are preserved. No candidate matches an existing startup record. Founder-name comparisons found no matches to the 103 committed graph people; these exact checks do not resolve all person identity.

Unknown values remain `null` in the rich sidecar and absent in optional current-schema fields. Founding assertions are individually sourced profile facts; `founded_year` is omitted to avoid inheriting a different top-level source or silently deciding conflicts. Publication date, event date, review date and company formation are distinct. Partial dates are not padded with January 1 or a first day of month. Facts with a known effective or publication date retain those dates in the projected text.

Bare `$` remains raw amount text unless an explicit currency source is present. Where currency corroboration is a separate source, the ledger and event note identify it. Luminate's conflicting USD/EUR Series A is retained with **no numeric amount/currency in its legacy projection**. Provizio's €2,499,962.50 grant retains decimal precision in the sidecar; it is not rounded into the integer-only funding field. CroíValve's €10m EIC commitment is not treated as a closed round. Deciphex debt and Workhuman's secondary transaction remain distinct from primary company fundraising. No cross-currency funding total is calculated.

The current startup schema has no typed investor participation field. All 140 event relationships remain in the ledger/sidecar, with explicit event IDs and roles. No portfolio, accelerator network or existing-backers list is promoted to an event investment. Similar investor names are unresolved until identity review. The synthetic investor-round fixture contract is not applied to these real companies by mislabelling them synthetic.

## Reproduce verification

Run from the repository root using its ordinary Python and Node runtimes:

```bash
python -m unittest discover -s research/countries/ie/2026-11-18-batch-001 -p test_packet.py -v
node research/countries/ie/2026-11-18-batch-001/validate_startups.mjs
python research/countries/ie/2026-11-18-batch-001/validate_packet.py --graph-preview
node --test backend/hosted/tests/startup.test.mjs
python -m unittest discover -s tests -p test_company_profile_plan.py
cd research/countries/ie/2026-11-18-batch-001
sha256sum -c checksums.sha256
```

The packet regression suite has 22 tests, including invalid money/source/participant fixtures, Unicode/domain dedup, partial dates, conflicted currency, boundary holds and stale resume cursors. Existing startup tests pass 4/4 and planner tests 16/16 on the pinned baseline. All 24 projections pass the actual current schema. The in-memory graph preview builds 21 additional startup IDs without modifying graph or SQLite files: 555 baseline built entities/46 startups/25 rounds become 614 entities/67 startups/51 rounds. The committed `data/graph.json` is a different snapshot with 537 entities/46 startups/17 rounds; those baselines are not conflated.

**Current-main refresh:** Owner fixes #179 and #181 are merged on inspected main `9be40c46aae078224ad41b78ba2d05e27f927b04`. The graph now preserves omitted founding years; the packet preview checks this directly. The funding-source inheritance guard is merged, but omitted numeric fields still do not clear existing claims. This is repository verification, not proof of hosted MCP deployment. Original receipts remain historical; see `integration-history.json` and `current-main-review.json`. Production admission still requires combined-country identity/deduplication review. No records are promoted by this research-only refresh.

## Integration and ownership handoff

1. Review this directory and source-backed claims at the PR head. Check checksums, repeat the schema and relation checks, and inspect the nine unresolved claim conflicts and two candidates.
2. Refresh main and re-run dedup against current overlay and built graph, including concurrent country PRs. Keep Fin's cross-kind identity hold and the other two boundary dossiers separate.
3. Have the collection/record owner select accepted facts and decide any needed production representation. Keep this directory's ledger, source registry and projection map with the selected records; the legacy projection alone is not a lossless evidence export.
4. Coordinate any separately authorized production proposal, merge and release with the [existing collection owner](https://chatgpt.com/c/6afbc931-0378-83ec-8434-cd7e8db42db2) and [planner #177](https://github.com/castlemilk/startup-atlas/pull/177). Their ownership and seed decisions remain unchanged. Do not silently expand schema/API or deploy MCP.
5. After an owner-authorized production merge, verify the exact source revision, graph/SQLite representation and published readback. This packet makes no production-publication claim.

## Continuation

The first pending group is twelve outbound domain leads from the opened NDRC 2026 cohort. The next groups are Tyndall's Vivid Photonics, Pulpo Semi and Endurance Semiconductors, and IVCA leads Shorla Oncology, Aerska and Fresco. Names inferred only from domains remain null until verified. `queue.json` carries the precise discovery URL and review scope for every lead.

Seroba's archive page 1 exposes pages 2–4 and Next, which remain untraversed. NovaUCD, BioInnovate, New Frontiers campus cohorts and investor archives require separately bounded passes. Current HQ, legal incorporation/group hierarchy, disputed founding dates and explicit dollar denominations remain priority field follow-ups. The IMF API and accessible WEO shell are unresolved cohort-verification gaps. English primary sources are appropriate to this Irish pass; no claim is made to have exhausted Irish-language sources.

All continuation is research discovery. This packet does not approve crawler hosts, change allowlists/throttling/access controls, request robots.txt, procure data, collect personal contacts or send outreach. The immutable manifest records pre-submission staging; the linked GitHub PR and canonical Space are authoritative for subsequent delivery and owner decisions.
