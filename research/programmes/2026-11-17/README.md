# Programme collection provenance — 17 November 2026

This packet accompanies a bounded collector improvement against [main `d9a63d86c285c139a413b6b1fe9e79d3f6d72460`](https://github.com/castlemilk/startup-atlas/tree/d9a63d86c285c139a413b6b1fe9e79d3f6d72460). It preserves failed crawl outcomes, separately acquired research and an explicit review queue. It does **not** add or update operational catalogue facts.

## What changed

Programme discovery previously deduplicated a link globally by programme URL and label. A second directory's observation disappeared, including its source and geographic context. The collector now deduplicates within a registry source and final source page. JSON and review CSV retain `source_id`, `source_url`, `source_scope` and `checked_at`; approval stays blank. `checked_at` is retrieval time, not a publication date or a reviewer decision.

The report distinguishes unique page-fetch operations from reused cached page observations, including cached failures. It also exposes the 1,000-observation output cap with observed, returned and omitted counts, globally and per source. These are source observations, not unique programme identities. A shared operator/domain is insufficient to merge programmes, and a directory's region does not establish applicant eligibility.

The source-loss regression is demonstrated with deterministic synthetic fixtures. **No same-named specific programme appearing on two of this batch's directory pages was confirmed.** Do not describe the research batch as recovery of real duplicate records.

## Measured collection outcomes

The approved registry contains **17 sources** at the pinned revision. This pass selected **4**, with no followed pages and a two-second per-host minimum delay. It used the existing one-megabyte response limit, twelve-second request timeout, public-address validation, approved-host and redirect checks, and 429 host-stop behavior. No source-access policy file was requested or inspected. No access-control bypass, new service, credentials, paid capacity or schedule was introduced.

```sh
python3 scripts/crawl.py programs \
  --only google-directory --only google-apac \
  --only victoria-accelerators --only victoria-pre-accelerators \
  --limit 4 --follow 0 --delay 2 --out OUT
```

| Acquisition | Attempted | Outcome | Candidate/fact disposition |
| --- | ---: | --- | --- |
| Direct crawler, one run at `2026-11-17T03:28:30Z` | 4 unique page-fetch operations | 0 downloaded; 4 DNS failures; exit code 1 | 0 extracted candidates; source contents unknown |
| Web research, separately attributed | 6 unique pages, 10 read operations including 4 independent reviewer repeats | 5 unique pages supplied readable text; 1 returned only a title | 25 directory observations staged; no complete-inventory claim |
| Primary programme review | 1 existing programme, 1 primary page | 7 atomic statements retained with source and review time | `reviewed_staged`, `unsubmitted`; 0 operational facts published |
| Saved-outcome replay | 4 saved failures, 0 network operations | `none_succeeded`, 4 failed attempts, 0 candidates | Reproduces reporting only; not another live crawl |

[crawl-baseline.json](crawl-baseline.json) is the unchanged direct-run JSON. [crawl-outcomes.json](crawl-outcomes.json) adds the input hash and coverage computed from that saved payload using the revised collector. The original run did not yet emit programme coverage. No network retry occurred during replay.

## Source review and identity boundaries

The source log and all 25 observations are in [programme-observations.json](programme-observations.json). Returned web text is a partial representation; it is not a crawler-downloaded page body.

| Source | Observed entries | What remains unresolved |
| --- | ---: | --- |
| [Google programme directory](https://startup.google.com/programs/directory/) | No programme cards in returned text | Listing coverage is unknown, not proof of zero programmes |
| [Google Asia Pacific accelerators](https://startup.google.com/intl/cloud/programs/accelerator/asia-pacific/) | 6 regional entries | Exact programme destinations, current intake and separate regional eligibility need review |
| [Innovation Victoria accelerators](https://www.innovationvictoria.com/pathways/programs/accelerator-programs) | 4 entries | Operator terms and dated intakes need review |
| [Innovation Victoria pre-accelerators](https://www.innovationvictoria.com/pathways/programs/pre-accelerator-programs) | 15 entries | Programme/operator identity and current terms remain a per-entry decision |
| [Generation AI](https://generationai.au/) | 1 programme page | No dated application window was established |
| [VICTOR:AI](https://victorai.win/) | Title only; no body text | Primary identity and terms remain unavailable in this representation |

The two Victoria directories distinguish **MedTech Actuator Accelerator** and **MedTech Actuator Origin**, despite their shared operator domain. Keep these as separate research observations. Generic “Learn more” links on four university entries also expose a possible link-label recall gap; the manual list does not establish what the direct crawler would extract.

Generation AI was matched to existing `programme:generation-ai` through the catalogue's exact `https://generationai.au/` extra URL and the government directory link. [claims.json](claims.json) separates programme name, duration, cost, location, conditional existing-startup requirements, participation funding and equity. Each statement has a primary source, acquisition method, retrieval/review time and an explicit unsubmitted state. Legal operator identity, credits entitlement and current admission are not inferred from logos or participation. Publication and effective dates remain unknown.

[claims-validation.json](claims-validation.json) records structural validation only. [captures.json](captures.json) is a partial paraphrase export for the existing offline extraction route, linked by ledger hash and seven claim IDs; the original ledger remains authoritative for structured values and qualifiers. The collector's `captures` mode successfully processed its single document locally, without fetching any page.

## Verification and ownership

Targeted regressions cover multiple sources and pages, duplicate fragments, matching display names with distinct source IDs, retrieval-time CSV preservation, blank approval, failed versus empty successful responses, cached-failure reuse, shared successful fetches, and the actual candidate cap. The transport and the protections merged in [PR 137](https://github.com/castlemilk/startup-atlas/pull/137) are unchanged.

Local validation passed: 46 targeted crawler tests, 100 JavaScript tests, 55 Python tests, the image-reference audit and the static/SQLite build. Commands were `python3 -m unittest discover -s tests -p test_crawl.py`, `npm test` and `npm run build`; consult the associated PR for exact-head CI results. Builds regenerate `data/graph.json` and `backend/internal/graph/snapshot.json`; those unrelated generated changes are excluded from this patch. No runtime, design, package, workflow, permission or reviewed catalogue files are changed.

At inspection, open PRs were [136](https://github.com/castlemilk/startup-atlas/pull/136) (component field guide), [135](https://github.com/castlemilk/startup-atlas/pull/135) (disabled analytics) and [107](https://github.com/castlemilk/startup-atlas/pull/107) (older company views). The separate Hardware/Next.js, artwork and motion work is outside this scope; its unpushed workspace was not inspected. The existing **Improve Startup Atlas** automation was disabled. The six recent repository workflow runs inspected were terminal.

## Publication and follow-up queue

The existing [Pages release run 44009003133](https://github.com/castlemilk/startup-atlas/actions/runs/44009003133) succeeded for `d9a63d8`, including its published graph/database parity check. That is evidence for the existing release, not this change. The live Atlas MCP exposed its thirteen tool names and `atlas_get_connection` returned connected, but a real `atlas_search_graph` read returned `GITHUB_ERROR` / HTTP 403. Its graph revision, `mainRevision` and running code version could not be verified. No MCP mutation, reconnect or deployment was attempted; GitHub connector access worked independently.

Next review work:

1. Re-run the same bounded source batch from an already authorized environment with working public DNS; retain the current failure receipt.
2. Resolve programme-page URLs and existing records before accepting the 25 discovery observations. Preserve source scope separately from eligibility.
3. Verify a dated Generation AI intake before changing its operational status; resolve VICTOR:AI through an accessible primary representation.
4. Investigate generic-link extraction recall with a permitted fixture before claiming full directory coverage.
5. Address the separately observed Wikidata detail-fetch reporting gap: `discover()` can currently lose a metadata-request failure and emit empty properties. This is not changed in this patch.
6. Restore and verify the private MCP's repository read through its owner before relying on revision-checked proposals. Repository CI and Pages do not prove the MCP is deployed.
