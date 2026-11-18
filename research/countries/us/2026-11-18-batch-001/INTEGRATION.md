# Integration and resumption

This is a United States research packet, scoped to `research/countries/us/2026-11-18-batch-001/`. It changes no production data, API schema, crawler code, seed allowlist, throttling, workflow or deployment configuration. The country branch is `research/us-gdp-01-batch-001-20261118` and the inspected main revision is `f4bcbf7030d741772bb750deee584efa3ee17749`.

The [existing collection owner](https://chatgpt.com/c/6afbc931-0378-83ec-8434-cd7e8db42db2) retains collection, identity, source approval and release ownership. [Planner PR #177](https://github.com/castlemilk/startup-atlas/pull/177) is the existing planner; this packet does not replace it. Owner acknowledgement has not been received. Coordination and the exact submitted commit/PR receipt belong in the [canonical Space](https://chatgpt.com/space/page_5167bcbbbb0c81919e1d565fd4d82e4a).

## Files and contracts

| File | Purpose |
|---|---|
| `README.md` | Country ecosystem report, source links and research implications |
| `COMPANIES.md` | Human-readable review of company identities, founders, financing and qualifications |
| `cohort.json` | IMF estimate, rank calculation, vintage limitation and source provenance |
| `ecosystem.json` | Programme/hub claims, discovery-only leads and source gaps |
| `atlas-records.json` | Accepted staged records, each valid under the unchanged `validateStartupRecord` contract |
| `withheld-records.json` | Schema-valid projections kept out of the accepted file: Glean, Anysphere and Fervo |
| `companies.json` | Canonical names/domains, aliases, separate HQ/incorporation geography, precision, field dispositions and identity gates |
| `claims.json` | Per-claim provenance, event/participant identities, uncertainty and conflicting observations |
| `source-registry.json` | Read/failed/rejected source records, retrieval precision and URLs; no automatic crawler approval |
| `projection-map.json` | Claim bindings for the lossy projection into the existing API schema, including Cityblock's two-source amount/currency support |
| `dedup.json` | Exact normalized matches against baseline overlay and rebuilt graph |
| `coverage.json` | Counts, their definitions, null national denominator and per-company field coverage |
| `search-log.json` | Research-query summaries and outcomes; not a complete HTTP/search-engine audit log |
| `resume.json` | Stable pending tasks, input hashes, completed initial reviews and pagination gaps |
| `integration-audit.json` | Shard hashes, independent review findings and explicit normalization adjustments |
| `baseline/` | Inspected input hashes, identity indexes, existing planner pages and IMF rank inputs |
| `validation/` | Offline validation against the existing record contract and focused packet tests |
| `validation-results.json` | Actual local command results; distinct from any later CI outcome |
| `manifest.json`, `SHA256SUMS` | Bounded file inventory and byte-level integrity checks |

The JSON envelopes are research documents. Only individual records in `startups` use the existing production startup-record schema. Richer evidence fields are sidecars, not a new API or runtime contract. The existing typed investor-round work and its activation gate remain with their owners. Do not send `companies.json`, `claims.json` or a whole packet envelope to a production endpoint.

## Review gates before any production proposal

1. Check out the exact reviewed branch commit from the PR, verify `SHA256SUMS`, and refresh current main. Compare current input hashes with `baseline/inventory.json`; retain concurrent records and repeat deduplication if main changed. The committed graph was stale at inspection: 537 entities/17 rounds, versus 555 entities/25 rounds from current committed inputs rebuilt offline. `baseline/rebuilt-identity-index.json` is the source-build identity index, not a production deployment observation.
The baseline graph generator can synthesize `founded_year: 0` for research-only companies whose year is absent. The existing owner has [draft PR #179](https://github.com/castlemilk/startup-atlas/pull/179) addressing this; it was open at head `752784804b4a62753e9489f5c48d9e64626f9b4a` during final inspection. Verify that owner’s resolved behavior before a production import. This country packet does not duplicate that implementation.

2. Inspect `coverage.json`, `dedup.json` and the company's field dispositions. There were no matching startup records in the 45-record overlay or rebuilt 46-startup graph, but `provider:anthropic` matches Anthropic across entity kinds. Its inclusion means research acceptance, not permission to create a second organization or silently merge kinds. Resolve that identity with the collection owner. Person and investor names also remain unresolved; no person/fund is automatically merged by name.
3. Recheck dynamic lifecycle facts immediately before integration, especially Anthropic's preliminary IPO. Glean remains held for explicit HQ/country evidence. Fervo and Anysphere are researched alumni, excluded from the accepted independent-startup projection; preserve their evidence without adding them as new independent startups.
4. Review claim-level evidence and complete the missing dimensions required for the intended production use. Founding date is distinct from legal incorporation; older HQ statements retain their dates. Four conflicting founding observations remain in the ledger. Some founding years are represented as individually sourced profile facts because the existing top-level field otherwise inherits the record's different source.
5. Maintain event semantics: Mercury's mixed primary/secondary total is not a primary-capital amount; Helion and Redwood extensions are single events; lower bounds are not exact amounts; an unknown currency is not USD by default. Cityblock's USD normalization requires its explicitly mapped investor report as well as the company announcement. Event participant claims remain unallocated and are not generic company-investor edges.
6. A collection owner may prepare a separately reviewable, minimal production change using the approved existing pathway. This packet itself neither merges production records nor authorizes a crawl. No seed is approved by being listed here. Do not expand the API, deploy MCP or activate a ledger as an incidental integration step.

## Reproduce the checks

Run from the repository root with Python 3 and Node.js. These commands perform local reads and tests; they make no network requests or production writes.

```bash
node research/countries/us/2026-11-18-batch-001/validation/validate-records.mjs
node --test research/countries/us/2026-11-18-batch-001/validation/test_record_contract.mjs
python3 research/countries/us/2026-11-18-batch-001/validation/validate_packet.py
python3 -m unittest discover -s research/countries/us/2026-11-18-batch-001/validation -p 'test_*.py'
python3 -m unittest discover -s tests -p 'test_company_profile_plan.py'
cd research/countries/us/2026-11-18-batch-001
sha256sum -c SHA256SUMS
```

The existing enrichment-skill validator was also run on all claims. Its receipt is retained, but that external skill is not copied or installed by this packet. Structural passes establish schema/reference integrity, not independent verification of every source. Source review and bounded independent rereads are recorded separately.

## Resume without repeating or overstating coverage

First verify the `checkpoint_inputs` hashes in `resume.json`. A completed company ID means the initial bounded review was persisted; it does not mean all founders, rounds or legal dimensions are complete. Select queued work by explicit priority, with missing priority last and `task_id` as a stable tie-breaker. Persist an evidence/disposition receipt before marking a task complete. Preserve null cursors when a directory was never enumerated, and record the exact next cursor/filter only when actually observed.

The next named discovery leads are Cayuga Biotech, Hoofprint Biome, Still Bright, Calder Biosciences, Alloy and OpenLoop. Resolve their canonical domains, geography, lifecycle and Atlas identities individually. For broader enumeration, choose one accelerator cohort or one agency/fiscal-year award population, record that denominator and its filters, follow available pagination within permitted access, and deduplicate awards or cohort appearances to companies. Do not convert visible page totals or financing-deal counts into a national startup denominator.

Access failures remain gaps. In particular, a JavaScript shell, failed redirect, HTTP 403/404 or wrong-company response supplies no accepted company claim. Later EDA denial does not erase an earlier readable historical observation, but it prevents a fresh current-state assertion. Preserve normal access controls and existing rate limits; no robots.txt requests are part of this packet.
