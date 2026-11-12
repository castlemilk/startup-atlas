---
name: startup-atlas-collection
description: Collect and review Startup Atlas partner leads, logos, geographic evidence and programme metadata; validate and update the catalogue through the HTTP MCP and verify search and deployment. Use when continuing Startup Atlas crawling, partner enrichment, logo review or MCP publication.
---

# Startup Atlas collection and MCP

Read repository `AGENTS.md` and `docs/AGENT-RUNBOOK.md`; inspect current main, open PRs, running work and deployment before making changes. Avoid overlapping another active update.

## Collect

1. Search the existing partner index and reviewed records. Verify the exact organisation and official website from primary evidence before adding it to `data/partner-logo-seeds.csv`; keep aliases and provider relationships separate. Add a CDN host only after confirming it on that official site.
2. Run `npm run crawl -- partners --follow 0`, then `npm run crawl -- logos --approved data/partner-logo-seeds.csv --partners-only --follow 0 --logo-limit 2`, and `npm run crawl -- partner-candidates --approved data/partner-logo-seeds.csv --snapshot research/crawl/latest-logos.json`. Use the manual Partner research crawl workflow when the local environment cannot resolve public hosts. Inspect source statuses and retrieve its review artifact.
3. For deeper firm research, run `npm run crawl -- profiles --approved data/partner-logo-seeds.csv --follow 2` (optionally `--partner` or `--limit`). Treat names, context, candidate links and captured dates as review leads; verify each role or company relationship against the source before adding a profile entry. Profile candidates are never automatically published.
4. Do not request or inspect robots.txt, as directed by the owner. Preserve HTTPS and approved-host checks, public-address checks, rate limits, 429 stop handling, byte/time limits and opaque staging. Never bypass access challenges.
5. Distinguish discovered candidates, captured bytes, reviewed assets and published logos. Inspect image content, identity, provenance and usage terms; a page can contain portfolio logos or social graphics. Publish only a reviewed asset mapped explicitly to the exact directory name. Record source and review date; do not infer a provider affiliation from a name or logo.
6. Review metadata and geography against primary evidence. An office or programme location is not programme eligibility. Keep unknown and historical screenshot associations explicitly unverified.

## MCP and publication

1. Check `atlas_get_connection` and live tool discovery; search before writing. Confirm the deployed MCP's capabilities rather than assuming a repository implementation is live.
2. For new opportunities, verify current programme terms and source URLs; call `atlas_validate_opportunity`, then pass its revision to `atlas_add_opportunity` only when the user requested that source-backed entry. Inspect the resulting draft PR, generated data and CI before merging. Duplicate validation should not persist data.
3. For partner updates, use `atlas_validate_partner` and `atlas_propose_partner` only when exposed by the live MCP. If unavailable, report the deployment gap; do not represent a GitHub-only edit as an MCP write. Never replay an uncertain write or OAuth exchange; inspect resulting PRs first.
4. Run appropriate tests, merge only within the user's authorization, and verify Pages and private MCP deployments independently. After publication, verify an exact search and a typo search against fresh data. Browser search builds its Fuse index from the published catalogue; drafts are not searchable.
5. Report counts separately for discovered, captured, reviewed and published records, with sources, failure statuses and limitations. Do not claim unreviewed candidates are new firms or deployed logos.

For OAuth, Workers fetch/redirect constraints, workflow commands and deployment troubleshooting, consult `docs/AGENT-RUNBOOK.md`.
