# Canonical public origin — decision record (#129)

Decision recorded 2026-11-26 (UTC). This closes the open decision in #129:
the one canonical public origin for Startup Atlas is the GitHub Pages
project site.

## Decision

- **Canonical origin:** `https://castlemilk.github.io/startup-atlas/`
- **Publisher:** `.github/workflows/pages.yml` builds `dist/` and publishes
  it to GitHub Pages from `main`. This is the only deployment workflow for
  the public site.
- **Vercel origin** (`https://startup-atlas-theta.vercel.app/`): retired as
  a public origin. `vercel.json` already disables git deployments
  (`git.deploymentEnabled: false`); it now also carries permanent redirects
  from every path on that origin to the canonical origin, so if the project
  ever deploys again it cannot re-emerge as a duplicate. Fully deleting or
  disconnecting the Vercel project needs Vercel project access and is an
  ops follow-up, not a code change.

## How the decision is applied

- Per-page `<link rel="canonical">`, `og:url` and Twitter meta on every
  published view point at the canonical origin (#418, PR #457).
- `web/robots.txt` allows all crawlers and names the canonical sitemap.
- `web/sitemap.xml` lists the intended public acquisition pages only (the
  top-level views); the build extends it with the prerendered
  credits/programmes cohort pages (#130). Arbitrary filter/query
  combinations are deliberately excluded.
- `scripts/opportunity-pages.mjs` exports the same origin as `SITE_BASE`;
  if the canonical origin ever changes, that constant and the surfaces
  above change together.

## Live verification (2026-11-26, UTC)

- `https://castlemilk.github.io/startup-atlas/` — 200; homepage HTML
  carries `rel="canonical"` to the canonical origin.
- `https://castlemilk.github.io/startup-atlas/robots.txt` — 200.
- `https://castlemilk.github.io/startup-atlas/sitemap.xml` — 200, 25 URLs
  (6 views + opportunities index + 18 cohort pages at check time). The
  point-in-time sitemap 503 recorded at filing (17 Nov 2026) does not
  reproduce.
- `https://castlemilk.github.io/robots.txt` (host root) — 404. The host
  root belongs to the user/organisation site, not this repository, so it
  is outside this repo's control; a 404 robots response is not a crawl
  block, and the project-path robots above is served correctly.
- `https://startup-atlas-theta.vercel.app/` — still serves duplicate 200
  HTML with no canonical tag at check time. This is the residual the
  `vercel.json` redirects and the project-retirement follow-up address;
  it is recorded here rather than silently ignored.

## Search Console

No authorised Google Search Console access is available to the agent, so
selected-canonical and coverage inspection inside Search Console has not
been performed and no result is claimed. If access is granted later,
inspect the homepage and one entity page against the canonicals above and
append the outcome to this record.
