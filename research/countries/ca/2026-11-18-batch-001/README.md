# Canada research packet — 18 November 2026, batch 001

**21 accepted staged companies from 24 reviewed candidates; 29 named candidates including five next-pass leads.** The country report, evidence, current-schema projections and validation receipts are a bounded review checkpoint. Nothing here publishes a company, approves a crawler seed or changes a production schema.

Read [REPORT.md](REPORT.md) for the ecosystem analysis, companies, financing interpretation and gaps.

## Files

| File | Purpose |
|---|---|
| [REPORT.md](REPORT.md) | Country ecosystem report and interpreted batch inventory |
| [startup-records.json](startup-records.json) | 21 records accepted by the repository's existing strict startup-record validator |
| [company-evidence.json](company-evidence.json) | HQ/incorporation distinctions, founder/alias evidence, 29 typed financing observations, uncertainties and projection decisions |
| [claims.json](claims.json) | Atomic source-backed claim ledger and explicit missing-field dispositions |
| [source-registry.json](source-registry.json) | URL registry, source type, access outcomes, retrieval observations and date qualifications |
| [ecosystem-evidence.json](ecosystem-evidence.json) | Hub/programme/investor observations and IMF cohort verification boundary |
| [search-log.json](search-log.json) | Recorded searches, scopes and outcomes |
| [coverage.json](coverage.json) | Accepted/rejected/held/queued candidates, bounded denominator and source/pagination gaps |
| [next-source-queue.json](next-source-queue.json) | Durable manual restart actions and a coverage-bound checkpoint |
| [baseline-review.json](baseline-review.json) | Exact pinned source hashes, committed/reconstructed populations and identity review |
| [committed-inventory.json](committed-inventory.json) | Enrichment inventory of the committed graph/overlay; not a live-completeness claim |
| [planner-baseline.json](planner-baseline.json) | Existing planner's read-only baseline inventory |
| [independent-reviews.json](independent-reviews.json) | Independent research review findings and resolution readback |
| [semantic-preflight.json](semantic-preflight.json) | Temporary graph/SQLite parity at the research baseline and the owners' updated main |
| [claims-validation.json](claims-validation.json) | Existing enrichment claim-ledger validation receipt |
| [validation-report.json](validation-report.json) | Actual country validation and existing regression-test results |
| [validate.py](validate.py) | Country-only offline validation; imports existing repository functions |
| [manifest.json](manifest.json) | Scope, baseline, country branch, owner boundaries and integration state |
| [checksums.sha256](checksums.sha256) | Raw-byte SHA-256 for every other packet file |

## Reproduce validation

Run from the repository root using Python 3 and Node.js already required by this repository:

```sh
python3 research/countries/ca/2026-11-18-batch-001/validate.py
python3 -m unittest discover -s tests -p 'test_company_profile_plan.py' -v
python3 -m unittest discover -s tests -p 'test_collection_coverage.py' -v
```

Verify file integrity from the packet directory:

```sh
cd research/countries/ca/2026-11-18-batch-001
sha256sum --check checksums.sha256
```

The validator keeps two exact revisions: historical research baseline `f4bcbf7030d741772bb750deee584efa3ee17749` and validation/PR base `988a4ddcc4dbbc853da0c7f7899b6d6e7579f840`. The owners' merged fixes in #179 and #181 are included in the latter; the five graph input files are unchanged. It reads historical Git objects, verifies the current files against the validation base, calls the existing JavaScript record validator, and runs the existing company-profile planner against a temporary combined overlay. It writes no production data, sends no network requests and approves no sources. A later runtime/source change is a review gate; do not weaken the baseline guard simply to make an import pass.

## Integration sequence for the collection owner

1. Review `REPORT.md`, the candidate dispositions and `company-evidence.json`. The research baseline is `f4bcbf7030d741772bb750deee584efa3ee17749`; the PR validation base is `988a4ddcc4dbbc853da0c7f7899b6d6e7579f840`; the working branch is `research/canada-gdp11-20261118-batch01`.
2. Run the commands above and check the manifest/checksums. Compare the intended target main against the recorded baseline. Repeat name/domain/alias, founder and event-ID checks if intervening PRs added identities. An absent collision at this baseline is not a guarantee about a later main.
3. Review each proposed company and select approved field projections. The top-level `startups` array is the current `data/startup-research.json` shape. Do not replace the full production overlay with this 21-record packet; preserve every existing record and merge only selected, independently reviewed entries through the existing workflow.
4. Keep the richer evidence with the integration review. Unknown values are omitted from legacy fields; bounded amounts, source-specific currencies and multiple HQs are retained in the sidecar. Conditional Cohere/Waabi commitments are research-only. Other instruments are labelled in stage/note and are not a comparable equity total. No numeric value should be restored merely because a headline contains a number.
5. Resolve canonical investor/fund and person identities before adding any graph relationship. The repository's investor-round reference contract is synthetic-only. No real participant should be sent through it or represented as synthetic. Portfolio and programme membership do not prove participation in a particular round.
6. Use existing collection planner #177 and the source-approval workflow for any future crawl. Every discovered URL in this packet remains `not_requested` for seed approval. Preserve existing host allowlists, throttles, access controls and no-robots-request policy. An accepted research claim is not a crawler transport instruction.
7. Submit production data integration separately, run the repository's relevant graph/SQLite and application tests for that actual change, and coordinate merge/release with existing owners. This packet PR alone has no production, schema/API or hosted MCP effect.

## Resume research

`next-source-queue.json` binds its completed and pending candidate IDs to the raw SHA-256 of `coverage.json`. Verify that binding before resuming. Start with the recorded manual action; preserve prior dispositions and add a new bounded checkpoint instead of relabelling an old pass complete. Directory totals and pagination cursors are unknown, so null must not be interpreted as exhaustion.

The first wider-coverage targets are Co.Labs, North Forge, Centech, Genesis and accessible Atlantic company/cohort pages. The existing-company follow-ups include Ada merger completion, Cohere's latest completed financing, Float's conflicting Series B evidence, Jane's founding definition and Certn's current HQ/currency. No national company denominator or complete funding history has been established.

## Ownership and coordination

This packet owns only its Canada directory. [Collection owner](https://chatgpt.com/c/6afbc931-0378-83ec-8434-cd7e8db42db2), [planner #177](https://github.com/castlemilk/startup-atlas/pull/177) and [canonical Space](https://chatgpt.com/space/page_5167bcbbbb0c81919e1d565fd4d82e4a) retain their existing roles. Exact commit/PR and validation links belong in the PR and Space receipt; approval or acknowledgement by another owner is not assumed.
