# Spain batch 001: integration and owner handoff

This directory is a country-owned research packet for Spain, reviewed on 18 November 2026. It stages evidence and a bounded, reviewable projection against the existing Startup Atlas record contract. It does not import companies into production, approve crawler sources, change runtime schemas or APIs, run a crawler, or deploy the public site or private MCP.

The baseline is pinned in [baseline.json](baseline.json) and [baseline-inventory.json](baseline-inventory.json). That baseline is an input snapshot, not a guarantee that current main, pending proposals or published data still match it. Production data is unchanged by this packet.

The final compatibility refresh is [validation-baseline.json](validation-baseline.json), pinned to `ff4d51cf729d6a654787e9a1db63967b292df8c9`. While this research ran, the existing owner merged [PR #179](https://github.com/castlemilk/startup-atlas/pull/179), correcting the initial graph builder's conversion of unknown founding years to zero. This branch incorporates that upstream commit. The final validation verifies that INBRAIN and Quibim retain omission through the in-memory graph; [verification-initial-base.json](verification-initial-base.json) records the historical finding and is superseded by [verification.json](verification.json). No duplicate fix was implemented. [Draft #181](https://github.com/castlemilk/startup-atlas/pull/181) separately addresses legacy funding-source inheritance and remains with its owner; reconsider that gate before future updates to existing rounds.

## Ownership and coordination

The existing collection owner remains [the collection-owner conversation](https://chatgpt.com/c/6afbc931-0378-83ec-8434-cd7e8db42db2). The collector planner implementation from [PR #177](https://github.com/castlemilk/startup-atlas/pull/177) is reused. Country coordination is recorded in [the #177 handoff comment](https://github.com/castlemilk/startup-atlas/pull/177#issuecomment-6974845249). A posted handoff is not an owner acknowledgement, source approval, merge approval or release receipt; consult the current response and the recorded acknowledgement state.

The [canonical Space](https://chatgpt.com/space/page_5167bcbbbb0c81919e1d565fd4d82e4a) receives the exact reviewed files, commit and PR links, checksums, test receipts and remaining gaps from the country integration owner. Existing implementation, source-approval and merge/release owners retain their responsibilities. This packet does not replace their planner, collector, coverage adapter or deployment workflow.

Repository authorities remain:

- [AGENTS.md](../../../../AGENTS.md) and the [Startup Atlas collection skill](../../../../.agents/skills/startup-atlas-collection/SKILL.md).
- The [agent runbook](../../../../docs/AGENT-RUNBOOK.md), [company-profile planner](../../../../docs/COMPANY-PROFILE-PLAN.md) and [knowledge-graph contract](../../../../docs/KNOWLEDGE-GRAPH.md).
- The actual [startup record schema and validator](../../../../backend/hosted/src/startup-record.mjs), including `validateStartupRecord`, `startupSlug` and `mergeStartup`.

## Evidence sidecars and legacy records serve different purposes

[companies.json](companies.json) retains the researched company observations. [claims.json](claims.json) and [source-registry.json](source-registry.json) retain field-level attribution, source dates, retrieval information, evidence status and conflicts. [access-log.json](access-log.json) records inspected sources and access outcomes. [next-source-queue.json](next-source-queue.json) preserves unresolved work. The ecosystem files describe hubs, sectors, programmes and networks; they are not company-record imports.

The validated legacy projection is a separate staging deliverable identified by the packet manifest and validation receipt. It is a deliberately narrower view of the evidence. Neither JSON validity nor a passing legacy-schema check means that a record is imported, merged, deployed or published. Do not treat either sidecar company objects or the projection as an automatic import feed.

| Research information | Existing record representation | Integration rule |
| --- | --- | --- |
| Canonical company name, official website and bounded description | `name`, `website`, `description`, record `source` and `reviewed_at` | Use verified identity and appropriate source attribution. Required record fields are `name`, `source` and `reviewed_at`; a new-company proposal also needs the identity/description requirements enforced by the existing proposal path. |
| Business founding with day, month or year precision | Optional integer `founded_year` | Project a supported business-founding year only. Keep the original precision and meaning in the sidecar. Do not turn incorporation, a research project, commercial launch or redomiciliation into company founding. |
| Headquarters, reported operating base, registered office, incorporation jurisdiction and legal-entity scope | No dedicated top-level geographic or incorporation fields; a reviewed `profile_facts` entry can hold a bounded sourced statement | Keep these meanings separate. A city described as a base or registered office is not automatically global headquarters. The country cohort does not establish a company's HQ or incorporation country. Unsupported or unresolved assertions remain in the ledger. |
| Aliases, former names, alternative domains and legal entities | No top-level `aliases` field | Retain identity observations in sidecars and the deduplication decision. Do not add a schema field or create separate companies automatically from aliases. Parent, subsidiary, branch and brand observations are not interchangeable. |
| Explicit founder relationships and public professional information | `founders[]` supports `name`, `source` and optional profile, image and social fields | Each accepted founder needs explicit relationship evidence. Preserve roles and their temporal scope in sidecars or a suitable sourced fact. Do not infer founder status from an executive title. Assets and contacts were not collected for import. |
| Funding stage, exact amount/currency, announcement date and contextual notes | `funding_rounds[]` supports `id`, `stage`, `source`, optional `announced_on`, `amount`/`currency`, `amount_text`, `valuation`/`valuation_currency` and `note` | The legacy object requires a stage string, event ID and source. Do not invent a factual stage to satisfy that requirement. Hold an event or retain a source-backed fact when it has no safe, truthful projection. |
| Event participants, lead roles, fund/manager relationships, instrument components, limits and unresolved investor identities | No typed participant collection or resolved-investor field in this startup-record contract | The typed funding-participant ledger is research data, not a runtime graph import. Preserve event-specific provenance and unresolved investor IDs. A narrative note is not a typed participation edge. Do not silently expand the schema/API or assign an investor ID from a matching name. |
| Supported relationship to an already resolved Atlas entity | `relationships[]` requires a valid target ID, kind, description and source | Use only after explicit entity and relationship review against current Atlas records. Portfolio membership supports a portfolio relationship, not an investment in a particular event. |
| News and source publications | `articles[]` supports title, URL and optional day-precision publication date/kind | A publication date is not automatically the transaction announcement or close date. Retain uncertainty and date roles in the ledger. |

A record-level source is not universal evidence for every nested fact. Founders, rounds, profile facts and relationships retain their own appropriate source. Where the legacy contract can represent only one source, keep all corroboration and competing claims in the sidecar and choose the projection source for the actual claim it supports.

## Missing values, amount precision and dates

**Omission in the legacy projection and null in the evidence ledger are different.** Optional fields in `startup-record.mjs` accept their stated types; they do not generally accept JSON null. Unknown optional runtime values must therefore be omitted. The ledger may use null together with a field disposition and reason such as searched unknown, access blocked, conflict, not searched or unresolved identity. Null is not zero, false, an empty string or a claim that no evidence exists.

The existing merge helper preserves omitted fields and merges keyed collections. An omitted founder or round in a bounded update does not delete the previous reviewed item. An empty list is not an instruction to erase an existing collection under this merge helper. Inspect the entire merged preview; do not rely on an unreviewed replacement file, a rename, a null assignment or a local subset to preserve concurrent work.

Funding `amount` and `currency` are a pair, as are `valuation` and `valuation_currency`. An unqualified dollar symbol does not establish USD. A cap, lower bound, cumulative total, fundraising target, debt facility, grant package or primary/secondary transaction is not an exact new-equity amount. Preserve original currency and qualifiers in the sidecar; omit unsafe numerical pairs from the projection. Where an event otherwise has a supported representation, `amount_text` and `note` can retain concise qualified wording. Do not use a legacy amount to conceal a mixed transaction, sum a cumulative round total with an extension, or equate a facility limit with cash drawn.

The legacy date fields use valid `YYYY-MM-DD` dates. They cannot faithfully carry a month-only, year-only or quarter-only event date. Do not append a first day to create false precision. Preserve exact dates only in the field with the correct meaning:

- `announced_on` is an evidenced announcement date.
- Source `published_on`, signing, close, incorporation, operations-start and redomiciliation dates retain their separate roles.
- Month/year/quarter dates and unknown effective dates remain in sidecars; omit unsupported day-precision fields.
- `reviewed_at` is the actual record review date, not an event date.
- Per-claim URLs, source publication/effective dates, retrieval timestamps and retrieval precision or timestamp basis remain attached to the evidence. A UTC review checkpoint after a tool read must not be described as an exact source-server fetch timestamp when that was not exposed.

## Identity, deduplication and concurrent changes

Company slug normalization is a lookup aid, not proof of identity. The existing `startupSlug` creates an ASCII slug from a display name. Name variants may yield different slugs, while unrelated names can normalize to the same slug. Compare official domains, evidenced alternate domains, legal-entity scope, geography, aliases and source histories against both the current overlay and graph. Do not remove meaningful domain distinctions or merge parent/subsidiary records to make a collision disappear.

Founder name normalization within a record is not a global person-identity resolution mechanism. Staged founder IDs and unresolved investor IDs are not newly approved Atlas graph identities. Namesakes, initials, accent variants and firm-scoped people require explicit reconciliation before any graph linkage. Preserve stable evidence IDs and the mapping decision rather than renaming observations into a presumed existing entity.

The baseline found no matching Spain overlay records at its pinned revision. That result is not a continuing deduplication guarantee. Other country sessions and owners may add overlapping cross-border companies, alternative brands, founders or investors after the baseline.

## Validation and reuse of the existing planner

From the repository root, run the packet's focused offline checks at the exact reviewed commit:

```sh
python3 research/countries/es/2026-11-18-batch-001/validate.py
node research/countries/es/2026-11-18-batch-001/validate-records.mjs
```

These are the country-packet validation entry points, not crawler commands. The Python check should validate normalization, identity/provenance references, missing/null handling, funding relationships, hold dispositions and resumable queue/manifest integrity. The Node check must apply the existing repository record validator to the staged legacy projection. Test results, covered counts and exact commit belong in the validation receipt; this guide does not itself claim either command has run or passed.

Use the already merged planner for a refreshed inventory of the existing overlay when its input files match the supplied revision:

```sh
python3 scripts/plan_company_profiles.py \
  --overlay data/startup-research.json \
  --approved data/company-profile-seeds.csv \
  --revision "$(git rev-parse HEAD)" \
  --limit 10
```

Run that command from a checkout of the intended pinned revision with the exact input bytes being inventoried. Preserve its output revision and hashes. Resume only with the same input bytes, revision, page size and planner version; use its returned cursor for the next inventory page. A changed input invalidates the old cursor. The cursor paginates the overlay inventory, not interrupted HTTP work, and an exhausted page sequence does not establish a complete research or collection pass.

The planner does not automatically include new companies held only in this directory. Their eventual admission to the reviewed overlay and their seed review are distinct owner decisions. Do not implement a parallel planner or activate a new coverage adapter as part of this research packet.

## Collector seed and access boundary

Every row in this packet's `collector-seeds.csv` is `approved=no`. The file is a staged discovery list, not the production approved-source registry. A known official domain, an accepted research claim, a passing validator or a PR merge does not independently approve a crawler seed.

Any future source approval requires the existing owner's review of the exact company identity, official host, source terms and permitted collection scope through the current workflow. Keep restricted sources and rights-review holds visible. Substitute independently supported evidence only when it supports the same claim; do not change a citation merely to remove a rights flag.

Preserve existing allowlists, HTTPS and public-address checks, redirects, byte/time limits, per-host throttling and 429 host-stop behaviour. Do not request or inspect robots.txt, bypass sign-in or access challenges, retry a forbidden route through an alternate mechanism, harvest personal contacts, copy proprietary datasets or fetch unapproved assets. Web-tool page reads and researcher paraphrases are identified as such; they are not direct crawler downloads. Failed, inaccessible, partial and successful-empty outcomes remain distinct.

## Future integration sequence

1. **Reconfirm ownership and pin fresh inputs.** Read the existing owner's response and current #177 coordination state. Refresh main, open proposals and relevant owner work through the authorised repository route. Record the new full revision and input hashes. Keep this country branch isolated from unrelated changes.
2. **Reconcile the packet against the refreshed inventory.** Re-run bounded deduplication against the current reviewed overlay, graph and pending proposals. Resolve canonical company/domain matches and cross-country overlap before allocating IDs. Recompute accepted, existing, ambiguous, held and rejected counts against the stated packet denominator; do not carry stale results forward.
3. **Resolve or preserve holds.** Review time-sensitive geography, lifecycle, rights restrictions, inconsistent founding dates, partial financing composition, ambiguous currency and investor identities. Preserve unverified claims and next-source items with their reasons. A held observation need not block otherwise supported company facts, but must not re-enter the projection through a summary, default or inherited source.
4. **Prepare a sparse legacy projection.** Map only supported fields and explicitly reviewed relationships into the current record contract. Leave the full evidence in the sidecars. For an existing record, inspect the complete merged result and preserve omitted founders, funding, articles, profile facts, socials and unrelated concurrent updates.
5. **Validate and review the concrete diff.** Run the two focused checks above, the relevant existing repository tests for the proposed change, and any owner-required gates. Verify every projected field's evidence mapping and the exact PR head. A shape-valid record still needs factual review. Do not broaden testing or build new infrastructure solely for this country packet.
6. **Use the existing review path.** The owner may use the deployed startup validate/propose capabilities only after confirming they are actually exposed and bound to the intended repository, or prepare the equivalent revision-checked GitHub data PR. Inspect the merged preview and current revision first. This guide does not authorise automatic import, direct production writes or a new API. Keep the country research PR and any later production-data proposal distinct and reviewable.
7. **Review seeds separately if collection is needed.** Keep all staged seed approvals at no until the existing source-approval workflow accepts a specific patch. Reuse the current collector and transport safeguards only through an authorised route. The present packet has no crawler execution or runtime/deployment step.
8. **Let the existing owners coordinate merge and release.** Recheck the final head against fresh main and concurrent proposals before merge. Record actual CI, merge and publication receipts separately. Do not claim publication from a local validation, staged file, draft PR or merge alone. Any later Pages/MCP readback belongs to the owner's existing release process, with exact published revisions and live data checks.
9. **Update the canonical Space with the handoff receipt.** Record exact files, checksums, commit/PR links, tests, dispositions, source/pagination gaps and the next resumable queue. Mark research, proposed, merged and published states accurately; leave owners and outstanding holds explicit.

The batch is bounded by its named companies and sources. It has no defensible denominator for all Spanish startups, all funding events or every source page on the web. Additional research resumes from the recorded queue under the same ownership and access boundaries.
