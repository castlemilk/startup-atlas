# Prerendered opportunity cohort (#130)

The interactive directory renders catalogue opportunities client-side, so
the initial HTML carries placeholders. Since #130, the Pages build also
prerenders a small reviewed cohort of opportunities as static, script-free
HTML — the pattern `docs/partner-index.html` established — so credits and
programmes are readable (and crawlable) without JavaScript or the globe.

## What is published

- `opportunities.html` — the cohort index, grouped by benefit type.
- `opportunities/<id>.html` — one page per cohort record with a descriptive
  title/heading, summary, provider, benefit type, value, access, geography,
  eligibility, limits and terms, the structured facts extracted from the
  official source, the checked/review date and the official programme link.
- The built `sitemap.xml` gains the index and one URL per cohort page; the
  curated base entries from `web/sitemap.xml` are preserved verbatim.

Generation lives in `scripts/opportunity-pages.mjs`, wired into
`scripts/build.mjs`; `tests/opportunity-pages.test.js` pins the rule and
the rendering contract. Canonical/OG URLs use the origin configuration
that already exists on main (#418: `web/sitemap.xml`, `web/robots.txt`,
page canonicals).

## Cohort rule

A catalogue record joins the cohort only when all of these hold, using the
contracts in `scripts/catalogue-entries.mjs`:

1. `status_controlled` is `Open` or `Apply / verify` — currently
   actionable, never closed, paused or intake-unknown.
2. `facts` is non-empty — structured claims were extracted from the
   provider's official source during review (#71 source-attributed
   claims), the in-data evidence the record was source-reviewed.
3. Every publication field is present, including eligibility, limits, a
   `checked` date and an official http(s) URL.

The cohort is re-derived on every build (18 records on 25 November 2026);
a record whose review state changes enters or leaves automatically, and
the build fails if the cohort is ever empty. Nothing is hand-picked, and
no unverified lead is promoted: partner names remain research leads in
the partner index, and these pages describe provider-published
opportunities only. Geography is rendered exactly as recorded — an
`UNKNOWN` scope reads "Not specified by the provider", never worldwide.

## Origin (#129)

#129 still owns choosing the one canonical public origin. This slice does
not pre-empt it: pages use the same `castlemilk.github.io/startup-atlas/`
base the #418 surfaces already publish, held in one constant
(`SITE_BASE` in `scripts/opportunity-pages.mjs`). If #129 decides
otherwise, that constant and the #418 surfaces change together.

## Discovery measurement — baseline and limitations

- Baseline (this slice): the cohort pages are published, internally
  linked from the index, and listed in the built sitemap. That is the
  discovery surface #130 can honestly establish today.
- Source-click discovery is **not** measured. Public analytics is
  deliberately disabled (see `docs/ANALYTICS.md`): there are no click
  collectors, and enabling any requires the privacy review, a dedicated
  GA4 stream and the #129 origin decision. Search Console coverage
  likewise depends on #129 and authorized access, which is not available
  to the build; no coverage or ranking figure is claimed.
- An outbound click is discovery only — never evidence of an
  application, awarded credits or a programme place. Every cohort page
  says so next to its official link. Any future click baseline must keep
  that separation.
- Performance/media: cohort pages ship no images and no JavaScript, so
  the missing-image-dimensions question does not arise for them and no
  image presentation was changed. No CWV or layout claim is made for the
  wider site; field measurement remains open work under #130.
