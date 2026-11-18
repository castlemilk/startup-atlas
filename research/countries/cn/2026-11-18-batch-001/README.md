# China — GDP cohort 2/30, first research batch

This directory is a **staged research packet**, separate from `data/` and all
production inputs. Read `ecosystem-report.md` for the ecosystem analysis and
`coverage.json` for measured scope and the remaining queue. Acceptance means
evidence-ready membership of this bounded packet. It does not certify a complete
company profile, current private-company status, production acceptance or live
publication.

## Executed checkpoint

The selected worklist contains **22 identities: 21 reviewed, 18 accepted for
staging, three deferred, one queued and zero rejected company identities**.
The evidence ledger contains **291 assertions** (287 reviewed/staged and four
conflicting source assertions), supported by 107 distinct URLs. The 146-URL
registry also preserves 39 URLs with access, discovery or incomplete-content
outcomes. A further 15 discovery labels contain two known overlaps and 13
unreviewed leads; they are not added to the accepted-company count.

The current-schema projection contains 18 records, 20 founder entries and 25
historical funding events. The funding index preserves 137 event-specific
participant observations for accepted companies, with investor graph identities
unresolved. Two non-additive financing aggregates and one investment intention
remain outside individual projected rounds. These are partial company histories.

**35 focused JavaScript checks and 11 existing-planner/graph/projection checks
passed.** The separate evidence-skill validator accepted all 291 assertions.
See `validation.json` and `test-results.txt` for executed scope and limits.
The 34-task source queue retains observed news pagination: Infinigence page 2
of 21 and Galbot page 2 of nine are next, subject to rechecking current controls.

## Integration validation refresh

The packet is now checked against main `80cbd405d57b12a903bbcd66e31d16cb79deb546`.
`baseline.json` retains the original research baseline and refreshes all guarded
input hashes without removing any guard. The changed graph-builder and graph
documentation hashes reflect #179; unknown founded years now remain absent.
All 18 projected companies already have sourced nonzero founding years.
Original source observations, published inventory and planner receipts remain
historical, not newly collected facts. #181 does not authorize production
submission: funding provenance and owner review must still be preserved.
See `validation.json.integration_refresh` for the new local check scope.
No production records, evidence claims, approval or identity holds changed.

## Ownership and baseline

Initial main: `f4bcbf7030d741772bb750deee584efa3ee17749`. This lane owns only this
directory, on branch `research/china-gdp02-20261118-batch01`.
The [collection owner](https://chatgpt.com/c/6afbc931-0378-83ec-8434-cd7e8db42db2)
retains collection, approved sources and transport. The record owner retains
accepted schemas, canonical identities and authenticated writes. Merges and
releases remain with existing owners. No acknowledgement is inferred from a
coordination notice.

[Planner #177](https://github.com/castlemilk/startup-atlas/pull/177) is consumed
unchanged in the offline coverage check. The investor-round contract in
`contracts/investor_rounds/` remains synthetic-only. Real facts in this packet
are **not** submitted to that contract under a false synthetic marker.

## Files and authority

| File | Purpose |
| --- | --- |
| `ecosystem-report.md` | Ecosystem analysis, accepted company index, edge cases and next-source priorities |
| `country-scope.json` | IMF vintage, economy scope and explicit raw-API verification gap |
| `baseline.json` | Exact input revision, hashes, deduplication inventory and owner boundaries |
| `companies.json` | Candidate identities, acceptance decisions, claim references and missing-field dispositions |
| `claims.json` | Atomic source assertions, retrieval/publication dates, precision, uncertainty and conflicts |
| `source-registry.json` | Access observations, source attribution and unapproved crawler status |
| `startup-records.json` | Separate records accepted by the existing startup validator; never an automatic production merge |
| `projection-map.json` | Field-to-claim provenance and representation decisions |
| `funding-ledger.json` | Funding/participation evidence with typed qualifiers; unresolved investor identities stay unresolved |
| `coverage.json` | Bounded counts, ordered-ID digest checkpoint and next-source queue, including observed pagination |
| `unresolved.json` | Unverified observations and rejected/withheld mappings; company unknowns remain in `companies.json` |
| `discovery-leads.json` | Additional directory/event leads, separate from reviewed company records |
| `search-log.json` | Actual research queries and reported access outcomes |
| `live-inventory.json` | Four-page, 332-entity read receipt for the connected tool's supported scope, including 46 startups |
| `inputs/`, `build_packet.py`, `build_projection.py` | Preserved lane receipts and reproducible, offline packet/projection builders |
| `packet-manifest.json`, `deduplication.json` | File authority, ownership, input digests and identity-review results |
| `validate.mjs`, `packet.test.mjs`, `test_planner.py` | Offline validation and focused regression checks |
| `validation.json`, `test-results.txt`, `planner-check.json` | Executed results and limitations |
| `checksums.sha256` | SHA-256 checksums of delivered files except this checksum file itself |

The source ledger is authoritative for evidence precision. The legacy projection
cannot carry all of it: unknown values are omitted, partial dates are not padded,
non-exact amounts remain text, and no new investor or geography API fields are
introduced. Chinese-only founders remain in the ledger when the current graph
cannot safely assign an ASCII identity. A contact address is not relabelled as
headquarters. Offshore legal incorporation is not replaced by operating location.

## Reproduce the checks

Run from the repository root with Node 20+ and Python 3:

```sh
node research/countries/cn/2026-11-18-batch-001/validate.mjs
node --test research/countries/cn/2026-11-18-batch-001/packet.test.mjs
python3 research/countries/cn/2026-11-18-batch-001/test_planner.py
```

The focused Python check builds a temporary merged overlay in memory/disk,
invokes the actual #177 planner against **unchanged** seed approvals, and checks
pagination, digest-bound resume rejection and graph generation. It does not
request network access or persist production data. The staged overlay's hash
does not claim that its bytes already belong to the source commit.

## Integration handoff

1. Read the current main, active proposals and each target again. Re-run
   normalized-name, official-domain, alias and canonical-ID matching; this
   packet's deduplication is pinned to its recorded baseline.
2. Review each source claim and its date/amount/subject scope. Resolve pending
   legal-entity, founder and investor identities without silently editing the
   preserved observations. Confirm current listing status separately when the
   intended catalogue requires only private companies.
3. Have the collection/record owners select the supported subset and bind its
   payload digest to the fresh authoritative record revision. Do not flatten
   the participation ledger into generic `backed_by` edges or interpret
   portfolio membership as funding-round participation.
4. Only through a separately authorised data proposal, merge the selected
   `startup-records.json` entries into the current overlay using existing
   merge/validation rules. Preserve concurrent fields and the packet's
   per-claim provenance. This research PR itself should remain confined here.
5. Review source approval separately. None of these URLs is an automatically
   approved crawler seed; #177 should continue to report the relevant gap.
6. After owner-coordinated merge/release, verify exact revisions and affected
   JSON/SQLite/MCP profiles. Until then, production writes and published coverage
   from this packet are zero.

To resume research, verify `coverage.json`'s worklist digest, keep already reviewed
IDs, and work through pending company IDs plus the separately prioritised source
queue. An exhausted first-pass identity queue does not mean metadata or national
coverage is complete. No recurring collection schedule is created here.
