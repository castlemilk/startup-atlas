# Integration and owner handoff

## Scope and prerequisites

This PR adds only `research/countries/ar/2026-11-18-batch-001/`. It is a reviewed proposal for country research, not a production-record replacement. `atlas-startups.json` has the existing `{reviewed, startups}` envelope; each of its 20 objects passes `backend/hosted/src/startup-record.mjs`. The richer JSON files are research sidecars, not a proposed API or runtime schema.

Initial comparison main: `f4bcbf7030d741772bb750deee584efa3ee17749`. Refreshed main and branch parent: `988a4ddcc4dbbc853da0c7f7899b6d6e7579f840`. The refresh merged the existing owner's [#179](https://github.com/castlemilk/startup-atlas/pull/179), preserving omitted founding years. The overlay, committed graph and startup validator are unchanged. Main and open PRs were inspected again before preparing this handoff; concurrent country directories are outside this PR.

## Read and verify the packet

1. Verify `SHA256SUMS`, then read `report.md`, `coverage.json`, the independent reviews and `review-resolutions.md`.
2. Run `verify.mjs` and `verify-integration.py` using the README commands. The latter directly uses the existing #177 planner and graph builder against temporary prospective data; it does not implement a new collector.
3. Treat `entity_id: unresolved:ar:*` and `proposed_atlas_id` as staging identifiers. They are not claims that the entities already exist in production. `entity-reconciliation.json` provides name-only investor/founder match candidates without resolving fund/legal-person identity.

## Adopt records only through existing owners and paths

For each country record, refresh the current main overlay and live connection/graph search before changing production. Recheck canonical domain, aliases and existing ID against new concurrent work. An initial zero-match result does not authorize duplicate creation later. If a match appears, preserve the existing identity and merge reviewed fields with its current record; do not replace the entire overlay with this 20-row file.

Use the deployed `atlas_validate_startup` then `atlas_propose_startup` flow **only if those tools are currently exposed and their version is verified**, as specified by `docs/AGENT-RUNBOOK.md`. Otherwise hand the current-schema objects to the existing record owner for the repository's normal review path. Inspect the fresh previous record, returned revision, exact proposal diff and PR head. Preserve omitted fields and prior evidence; do not relabel inherited values under a new source. Legacy source-inheritance work is separately owned and was merged separately in [#181](https://github.com/castlemilk/startup-atlas/pull/181); this packet adds no implementation fix and makes no deployment claim about it.

Resolve founder and investor identities before creating canonical graph entities or typed funding relationships. Event-participant observations retain source names, explicit roles and event IDs; no portfolio membership is promoted into an investment. Name-only matches, fund managers, funds, individuals and their employers must remain distinct until verified. No graph `relationships` entries are invented for unresolved investors.

## Preserve the evidence model during projection

| Research field | Existing-schema representation |
|---|---|
| Canonical name, description, website | Top-level fields; `source` supports the description. |
| Founding year supported by the same top source | `founded_year` when unequivocal; an operating launch is not substituted. |
| Founding claim with a different source or chronology conflict | Individually sourced `profile_facts`; full observations/conflicts remain in the sidecar. |
| HQ, historical HQ, operations, local legal entity, domicile, incorporation | Source-specific profile facts where representable; typed scope and uncertainty remain in `country-records.json`. |
| Funding amount with explicit ISO currency | Paired `amount` / `currency`. Unknown/conflicting values are omitted from the projection and null in the sidecar. |
| Bare dollar amount or undisclosed amount | `amount_text`; never numeric zero. |
| Exact supported announcement day | `announced_on`; month/year/investor-notice-only dates remain notes plus sidecar precision. |
| Closing date, extension/parent link, component sources | Sidecar fields plus concise sourced notes; no schema expansion. |
| Round participants and lead roles | Source-specific sidecar relationships and partial participant notes; canonical investor IDs remain unresolved. |
| News and headcount | No claim of full history. Headcount is unsearched; financing links are not a broad news census. |

All 12 omitted top-level founding-year scalars remain omitted in the prospective graph on refreshed main. Some have known years in separately sourced profile facts. Validate this behaviour again if adopting onto another graph-builder version; do not manually fill zero or a guessed date.

## Resume research and collection separately

`checkpoint.json` binds the exact queue and candidate-manifest bytes. Continue the 43 deferred candidate IDs and 32 source tasks from their recorded section/page or field-specific gaps. A changed queue, candidate set, planner revision or page size requires a new explicit checkpoint. Do not skip a previously reviewed company when a specific unresolved field is the assigned follow-up; record that field-refresh reason.

The existing #177 planner traversed a temporary 65-row overlay in seven pages (10/10/10/10/10/10/5). Every new Argentina row remains `seed_review_required` and `collection_state: not_assessed`. A traversed inventory is not a completed crawl. The #178 replay contract is synthetic-only and was not run against these real records. No seed CSV, allowlist, throttle, access control, crawler code or scheduled workflow is changed.

`evidence-captures-01.json` is a bounded bridge of researcher paraphrases, not fetched page bytes and not an automatically approved seed list. Its 92 documents map to the complete structured ledger. If an existing owner explicitly chooses an eligible ingestion path, retain the ledger alongside it; the capture does not preserve every typed relationship by itself. Rebill source holds and other access limits continue to apply. Do not fetch robots files or bypass failed/gated access.

## Merge and release coordination

The [existing collection owner](https://chatgpt.com/c/6afbc931-0378-83ec-8434-cd7e8db42db2) retains collection and source approval; [#177](https://github.com/castlemilk/startup-atlas/pull/177) and [#178](https://github.com/castlemilk/startup-atlas/pull/178) retain their existing implementation owners. Investor/record schema adoption and releases remain with their owners. The [canonical Space](https://chatgpt.com/space/page_5167bcbbbb0c81919e1d565fd4d82e4a) records the country files, final commit/PR, checks and gaps. Acknowledgement is pending; a handoff note is not approval.

Merging this research directory only archives evidence. Actual production adoption needs its own owner-reviewed change and existing validation/release gates. Verify the exact deployed Pages and private-MCP revisions independently after an authorized release. No merge, deployment, credentials, permissions, outreach, asset publication or paid service is performed by this country packet.
