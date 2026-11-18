# Israel — GDP cohort 25/30 — research batch 001

Evidence date: **18 November 2026**. Pinned repository and live inventory revision: `f4bcbf7030d741772bb750deee584efa3ee17749`.

Before submission the isolated branch was fast-forwarded to verified main `ff4d51cf729d6a654787e9a1db63967b292df8c9`, preserving the existing owner's merged #179 unknown-founding-year fix. The research baseline remains explicit; overlay, seeds and strict record schema were unchanged. See [main-refresh.json](main-refresh.json).

This is a staged, source-backed country research packet. The branch owns only `research/countries/israel/2026-11-18-batch-001/`. Production data, schema/API, collector implementation, source registries, seeds, access controls, deployment and release ownership are unchanged.

## Read first

- [Country ecosystem report and 24-company table](ECOSYSTEM.md)
- [Integration instructions and owner handoff](INTEGRATION.md)
- [Coverage, counts and limits](coverage.json)
- [Manifest](manifest.json) and [SHA-256 checksums](CHECKSUMS.sha256)

| Checkpoint measure | Count |
|---|---:|
| Discovered company candidates | 36 |
| Reviewed company identities | 24 |
| Accepted into ordinary research staging | 21 |
| Held as acquired/historical companies | 3 |
| Unreviewed cohort leads | 12 |
| Rejected company identities | 0 |
| Claim-candidate rejection/deferral entries | 18 |
| Registered source URLs / accessed | 153 / 152 |
| Selected financing events, ordinary / historical | 30 / 3 |
| Company-scoped public founder relationships | 59 |
| Event-specific investor participation claims | 231 |
| Ledger entries, reviewed / unknown or held | 514 / 42 |
| Follow-up queue items | 45 |
| Production changes, publication, crawls, seed approvals | 0 |

“Accepted” means evidence accepted for this bounded research packet. Current independent/private status is unresolved for the 21 ordinary records. Hailo, Oasis Security and Bluewhite are held separately because primary sources establish acquisitions. The national startup denominator is null. No percentage-complete claim is defensible.

The IMF October 2026 WEO cohort and rank 25/30 are user-supplied context. The requested API was blocked and the dataset landing page returned a JavaScript shell. GDP value and independently recalculated rank remain unverified; no search-excerpt value is promoted.

## Data layout

| Files | Meaning |
|---|---|
| `staged-startups.json` | 21 individual records compatible with the current `startupRecordSchema`; the enclosing document is a staged artifact, not an API request. |
| `historical-startups.json` | Three schema-compatible historical records requiring an owner disposition before promotion. |
| `companies.json`, `claims.json` | Full structured research, precision, source IDs/URLs, reviewed dates, uncertainty, event-specific participants and unresolved identities. These are research sidecars, not new production fields. |
| `sources.json`, `source-attempts.json` | Source registry, retrieval dates, concise evidence, access outcomes and incomplete action accounting. Backend HTTP counts are unknown. |
| `evidence/*.json`, `ecosystem-research.json` | Original bounded research shards and ecosystem evidence; preserve them with normalized outputs. |
| `projection-map.json`, `normalization-decisions.json`, `conflicts.json` | Exact staging disposition, schema projection limits, applied corrections, conflicting claims and company-level qualifications. |
| `baseline-identities.json`, `baseline-planner.json` | Pinned overlay/live inventory and five-page replay of the existing #177 planner. Inventory exhaustion does not mean company research completion. |
| `deduplication.json`, `founder-identity-review.json` | Company domain/name/alias screening and founder name/slug candidate screening. No canonical person or investor identity was created. |
| `discovery-candidates.json`, `next-source-queue.json` | Twelve historical Techstars cohort leads and 45 explicitly pending work items, bound to a deterministic digest. This is a manual research queue, not a replacement crawler planner. |
| `captures/*.json` | Three bounded sets of reviewed factual paraphrases: 31, 27 and 43 documents. They are offline evidence exports, not fetched pages, ingestion approvals or lossless substitutes for the ledger. |
| `validate_packet.py`, `validation/*` | Reproducible packet checks, actual existing-regression results and evidence-ledger structural validation. |

Raw research observations may retain an original numeric magnitude alongside an unresolved currency. The claim ledger and production projections do not turn ambiguous `$` into USD: only Qodo's USD40m Series A and Qedma's USD26m Series A have explicit USD support. Unknown production scalar fields are omitted; sidecars retain null plus rationale. Year/month precision is never expanded to an invented day.

## Validation

Run from the repository root:

```bash
python3 research/countries/israel/2026-11-18-batch-001/validate_packet.py
python3 -m unittest discover -s tests -p 'test_company_profile_plan.py'
node --test backend/hosted/tests/startup-edit-domain.test.mjs
```

Run checksum verification from this packet directory:

```bash
sha256sum -c CHECKSUMS.sha256
```

Nine packet checks, sixteen existing planner tests and twenty-two existing startup-edit tests passed. The packet checks import the repository's real strict record validator and include negative cases for unsupported fields, invalid dates, missing amount/currency pairs, duplicate event IDs and placeholder zero founding years. Explicit zero money is schema-valid in a fixture; unknown money is never substituted with zero in the researched records. An in-memory current-main graph preview preserves all existing entities, adds 21 ordinary company identities (67 startups total), and keeps Qodo's founding year absent. The unchanged #177 planner traverses the temporary 66-record overlay in seven pages; all 21 added records remain `seed_review_required`.

## Ownership

The existing [collection owner](https://chatgpt.com/c/6afbc931-0378-83ec-8434-cd7e8db42db2) retains collector, crawler-frontier, transport and implementation decisions. [Planner #177](https://github.com/castlemilk/startup-atlas/pull/177) remains the coordination point; the [initial scope notice](https://github.com/castlemilk/startup-atlas/pull/177#issuecomment-6974912644) identifies this lane. Review and release are coordinated through the country PR and [canonical Space](https://chatgpt.com/space/page_5167bcbbbb0c81919e1d565fd4d82e4a). A coordination notice is not owner acknowledgement or merge approval.
