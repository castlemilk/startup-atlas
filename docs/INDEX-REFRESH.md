# Keeping the Startup Atlas index current

## What already updates automatically

Reviewed source data is versioned in GitHub. `data/startup-research.json` holds reviewed startup additions and updates; `scripts/make-graph.py` and `scripts/add-provider-edges.mjs` generate the public graph and Go fallback snapshot. `scripts/build-graph-db.py` builds the SQLite/FTS4 index with the 13 explicitly allowed public source documents and reviewed mappings. Do not commit the generated SQLite binary.

The existing Pages workflow builds and checks pull requests, and rebuilds and deploys main on each main update and daily at 03:17 UTC. The release uses `ATLAS_SOURCE_REVISION=github.sha`; its published graph and SQLite must agree on that exact revision. The deploy job runs `scripts/verify-published-graph.py`.

That daily job refreshes the index from reviewed repository inputs. It does not discover or verify new founder, funding, headcount or news facts. A pushed branch or draft PR is not a live index update. The private MCP is deployed separately from Pages.

## Proposed discovery and review loop

Keep discovery separate from publication. Extend the existing manual Partner research crawl workflow, rather than creating a second crawler. An initial weekly scheduled discovery run is sufficient; keep `workflow_dispatch` for targeted runs. Do not put a live crawl on every PR.

1. Use the existing curated source configuration and approved hosts. Preserve HTTPS/public-address validation, request and byte limits, per-host pacing, 429 stop behavior, and access restrictions. Preserve the repository's no-robots.txt-request requirement. Do not add paid APIs or new credentials.
2. Use a rotating, bounded work queue, initially at most 16 startups per weekly run and two followed news pages per configured source. Persist queue position in a review artifact. Prefer existing source URLs; new domains require identity/source review. Stop the run on repeated throttling and respect Retry-After.
3. Store candidate summaries, source URL, retrieval time, publication/effective time when explicit, content hash, capture status and extraction version in an artifact. Use conditional requests where supported. A 304 reuses only the matching prior capture; a failed fetch must never replace known facts with blanks. Do not redistribute whole source pages.
4. Deduplicate by canonical company identity, field, event identity and source. Preserve unknown currency/date, launch versus founding dates, partial founder lists, funding versus grants, total round versus a participant's cheque, and historical versus current headcount. Identity collisions or conflicting claims stay in review.
5. A reviewer checks changed claims against readable sources and prepares a minimal source patch. Invoke the deployed startup validate/propose tools only when they are actually exposed. Otherwise use the authorized GitHub draft-PR path and the same record/snapshot validation. Record the fresh main revision and reject stale overlapping updates.
6. Use one deterministic draft branch per reviewed batch. No-op hashes should create no commit or duplicate PR. Do not automatically merge unreviewed claims. The reviewer should see changed facts, preserved facts, excluded candidates and coverage gaps.
7. Run the existing data, graph, backend and browser checks. After an authorized merge, let the existing Pages release rebuild both graph and SQLite. Read back exact company/founder searches and a representative typo search, and compare published revision with main. Verify the MCP independently before calling it current.

## Reliability and cost controls

- Keep the existing discovery workflow's `contents: read`, 15-minute timeout and 14-day artifact retention. Add a single-run concurrency group when enabling the proposed schedule. Do not expand its token permissions merely to auto-create PRs.
- Reuse the existing authenticated review/write route for promotion. The daily Pages rebuild already supplies automatic index publication after a reviewed merge.
- Keep prior reviewed data available when discovery fails. Record source failures in the run summary; fail validation if generated graph/SQLite parity, provenance or referential integrity fails.
- A failed deployment is not a rollback of source truth. Re-run only the known failed release step after inspection, and verify the exact commit actually published.
- Track discovered, captured, reviewed, committed, merged and deployed counts separately. Coverage means presence of some sourced evidence, not completeness.
- Public-repository Actions and Pages use the existing service allocation. Check available quota before enabling a schedule; do not add spending or services.

## Current batch and remaining scope

The 2026-11-13 reviewed batch covers 19 of the 46 indexed startups and adds or confirms founders, funding details, selected news and time-scoped company facts. The generated graph contains 537 entities, 289 relationships, 17 funding records (15 non-grant records and two grants), and 26 articles. At least one sourced founder is present for 39/46 startups. This is not a complete founder list or complete funding history.

The other 27 startups still need a bounded research pass, and the 19 reviewed startups retain explicit gaps. Some investors remain named in round notes because the current schema has no typed participant records. The original non-startup index was not exhaustively enriched in this batch. One headline-only ENA funding candidate was excluded. Goterra's official website was identified from its indexed company page, but direct fetches failed; availability remains unverified.

The proposed scheduled discovery extension is documented here, not enabled by this data-only change. Existing daily index rebuilding remains unchanged.
