# Integration instructions — India batch 001

This is a reviewable research PR. It contains no change to `data/`, collector seeds, shared schemas, APIs, workflows or deployment configuration. The sidecar format is country-local research data, not an announced production contract.

## Verify this exact packet

From the repository root:

```bash
cd research/countries/india/2026-11-18-batch-001
sha256sum -c SHA256SUMS
cd ../../../..
node research/countries/india/2026-11-18-batch-001/validate-records.mjs
python3 research/countries/india/2026-11-18-batch-001/test_packet.py
python3 -m unittest discover -s tests -p test_company_profile_plan.py -v
node --test backend/hosted/tests/startup.test.mjs
```

The tests bind production inputs to the manifest's original main revision, `f4bcbf7030d741772bb750deee584efa3ee17749`. An input-hash failure after unrelated main changes is a prompt to refresh the baseline and re-run identity review; do not disable the guard or label the old result current.

## Owner-controlled adoption

1. Fetch current main and inspect concurrent country PRs. Reconcile each canonical name, known alias and domain against current `data/startup-research.json` and a fresh graph build. The current packet proposes `startup:<slug>` only; it does not allocate canonical IDs. Match people and investors explicitly rather than by display-name equality.
2. Review `company-identities.json` field dispositions, source-specific geography and projection holds. Review the six conflicts and eight held candidate claims. No candidate/conflict claim may become an unqualified production assertion. Digantara's CDN funding observation remains excluded until its authenticity is established.
3. **Do not blindly append the whole envelope.** The three unknown-founding records—Agnikul Cosmos, Digantara and Postman—would receive a zero founding year from the current graph builder. Keep their production adoption on hold until the existing implementation owner approves a supported unknown-value path. Do not insert a guessed year to pass this boundary. The country research records themselves are valid staging artifacts.
4. For approved fields, use the existing owner-controlled startup review/proposal path with a fresh repository revision, preserving existing founders, facts and events through the current merge semantics. `startup-records.json` is a compatible projection; the per-field evidence in `projection-map.json` and `claim-ledger.json` remains authoritative for attribution. No direct automatic bulk-write script is provided.
5. Keep `funding-events.json` and investor claims with the existing investor/round owner. Roles are event-specific and canonical investor IDs are null. An amount may be an agreement, mixed primary/secondary amount, aggregate or one investor's consideration. Preserve those scopes and do not add events together into a national total.
6. Pass the source queue to the existing collector owner and #177. A discovered URL is not an approved seed. `paraphrase-captures.json` contains researcher summaries, uses staged entity identifiers as names and is not a live transport receipt or an approved production collector input. It cannot establish fetch completeness, access permission or asset rights.
7. If owners subsequently merge a separate production data update, inspect the actual CI, Pages release and live graph/profile readback against its exact revision. A research PR merge alone does not publish these companies to Atlas. No MCP code deployment is requested.

## Resuming coverage

Use `next-source-queue.json` in priority order. The IITM first page exposes ten of a UI-reported 213 entries. Agnikul's detail page has been reviewed; nine listed names remain company-review tasks. The public load-more mechanism exposed no usable cursor, so `cursor` remains null and `exhausted` remains false. Establish a permitted continuation route before increasing page coverage. Do not invent page numbers, endpoint access rights or hidden pagination tokens.

The local planner test exercises immutable-input cursor binding with the existing #177 implementation. Its temporary 66-row overlay is a hypothetical adoption inventory, not evidence that those source rows are already in main or that crawling completed. Source approval, per-host throttles, response limits and 429 handling remain unchanged. No robots.txt request was made.

The precise IMF October 2026 edition/value/rank check, failed FITT pages, unreviewed company sources, legal identities, current status, current financing and several currency/date ambiguities remain open. Source access failures are not absence claims.
