# Crawl readiness after all 30 country merges

Revision: `1d0c9d5cb424611ce715e67de9af3a29e285162d`. Offline snapshot, 2026-11-18. No DNS, HTTP collection, source approvals, production admission or robots requests performed.

## Measured populations

- Existing reviewed overlay: 45 source records; 1 approved-seed-ready (PsiQuantum), 43 seed-review-required, 1 missing reviewed website (Fusion Books). These are source records, not the graph's startup denominator. Ready still requires current access/identity and execution-route gates.
- Country seed CSV subset: 77 rows across Germany 29, Spain 25, Mexico 23; UK seed file empty. All 77 held, none approved (52 blank and 25 `no`). This is a bounded seed-review inventory, **not** all country companies or URLs. Each row retains path, line, original value and SHA-256. Domain claims are not independently verified by this pass.
- Research index owner measured all30: 5,845 record occurrences, 5,575 unique URL strings, 938 documents, 782 host-collision review groups. These count research artifacts including replay/baseline material, not canonical companies or approved crawl targets. The index's source references point back to exact evidence and holds; a hostname match cannot supply approval.

## Actionable gate order

1. **Identity and official domain.** For each candidate, inspect its original JSON pointer/CSV row and source evidence. Assign an existing canonical identity or keep unresolved. Confirm entity versus product, subsidiaries, aliases, country origin/HQ/incorporation. Record primary evidence URL, exact subject, observation time, reviewer and domain decision. No automatic name/hostname union. Start from 77 explicit seed candidates as a bounded review queue, not an execution frontier.
2. **Reviewed catalogue admission.** New country candidates must pass normal source-backed catalogue review before the company collector can accept them. The collector validates exact overlay names; inserting staging names into a partner seed file is not a substitute. Keep merge/review conflict records and property-level evidence. Research admission, source approval and publication are separate decisions.
3. **Separate source-approval patch.** Only after domain/identity review, propose explicit CSV changes; retain original blank/no until approved. PI.EXCHANGE/Mentana remains explicitly `no`; preserve Remi quarantine and existing asset-use restrictions. Already approved PsiQuantum must not imply approval for all article, investor, image or social hosts.
4. **Owner runtime contract.** Existing collection owner https://chatgpt.com/c/6afbc931-0378-83ec-8434-cd7e8db42db2 retains adapter decisions: exact eligible population, per-output unit mapping, termination, durable checkpoint location/retention and uncertain-worker reconciliation. Ledger/replay reference code is not live adoption. Saved-output replay should precede activating a runtime adapter.
5. **Bounded execution only after those gates.** Set exact source revision/input hashes, source set, request/time/byte budget, host delay, continuation limits and authorized execution route. Preserve HTTPS, approved-host/public-address and redirect checks and 429 host stop. Never request or inspect robots.txt. Current native-route hold is not permission to substitute a network workflow. The existing `--partner` selector is substring matching: verify the selected population rather than assume one exact entity.
6. **Review and publication readback.** Successful retrieval is not claim verification. Preserve failures, partial/empty pages and original timestamps. Keep investor/event participation and financing components atomic. No asset copying without rights review. Publish through the ordinary reviewed path and verify exact source revision plus live JSON/SQLite; private MCP code deployment remains separate.

## Tests and immutable inputs

Existing planner 16 tests and collector 49 tests passed offline against this snapshot. Test logs contain synthetic fixture statuses, not actual external requests. No source code changes were made.

Overlay SHA-256: `938bb23855f6b267ef7ebc97202a28bf4e8127ae112bbb57642a0dca5dbb4a41`.
Seed CSV SHA-256: `abe7dbbec49babe90555d89e3042ae6b8bd73e613149d4f629a2502f8bbf8d8e`.

Artifacts: `existing-overlay-plan.json` (all45 explicit dispositions) and `country-seed-review-inventory.json` (all77 staged CSV rows). The original repo docs `COMPANY-PROFILE-PLAN.md`, `COMPANY-PROFILE-REPLAY.md`, `COLLECTION-COVERAGE-CONTRACT.md` and collection runbook are the operational authority; this receipt does not override their gates.

## Bounded first identity review batch

See `first-batch-domain-review.json`: DeepL and n8n, selected from explicit German seed candidates. Official legal pages independently support their domain/operator associations. These checks do not admit either company or approve a seed. n8n's imprint expressly restricts commercial reuse, so automated collection remains held pending source-use review. DeepL service terms are not blanket crawling permission. All 77 original seed dispositions remain unchanged. The initial inventory above was offline; this subsequent bounded evidence check read two official pages through the web research tool, not the Atlas collector. No robots requests were made.
