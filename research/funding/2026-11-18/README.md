# Bounded funding evidence pass

Base: `700f7961c89b74778411cc09c1a62a8096396f4c`; checked 18 November 2026 UTC.
Scope: existing Alloovium, Deeligence and Puralink funding gaps. Public web-tool search/page reads only, not a crawler run. No robots requests, new permissions, credentials, assets or paid sources. Existing identities and founder metadata are unchanged.

## Proposed supported facts

- **Puralink**: [company news archive](https://puralink.com/news/) supplies 17 September 2025 publication date, $2.5M, pre-seed and Peak XV Partners as lead. [Linked company detail](https://puralink.com/news/pre-seed-round/) names Side Stage Ventures, Startmate, NZVC, Wollemi Capital Group, Ashik Ahmed, Matt Jones and Matthew Dellavedova among backers. Both pages were accessed; neither explicitly specifies currency. Preserve the archive as event source and detail URL in its note, since the extracted detail lacks the archive's date/amount/lead. Publication is not a verified close date. Customers and development-support mentions are not investors. No canonical investor identities inferred.
- **Deeligence**: [LaunchVic case study](https://launchvic.org/case-studies/the-legaltech-startup-revolutionising-due-diligence-with-ai/) reports a $1M round announced in early 2024 including its Alice Anderson Fund. This participant/operator source supports the event but no exact day, currency, lead or stage. Those fields remain absent or generic. The [company-hosted AFR republication](https://www.deeligence.com/resources/new-legal-ai-tools-target-partners-dealmakers) calls a $1M round pre-seed; it is republished secondary reporting, not separate independent primary evidence, and its stage is not imported.

Both records use qualified amount text, not numerical amounts/currency; partial participant names remain attributed notes. No lifetime funding sum, valuation, inferred investment amounts or exhaustive investor claim.

## Searched but withheld

- **Alloovium**: [YC company profile](https://www.ycombinator.com/companies/alloovium) was accessed and identifies Summer 2026 participation, but does not establish a specific amount, instrument or close date. Search discovered CB Insights/Crunchbase/DFX and a secondary article repeating founder fundraising claims; these are leads, not verified primary round evidence. No standard accelerator deal terms assumed. Disposition: `searched_unknown` for primary funding terms, not no funding. Existing older founder evidence remains with its separate owner.
- **Deeligence**: directory search suggests a February 2026 round/Fuel Ventures; no corroborating primary source established in this bounded pass. Do not import it or infer currency from other directory figures.
- **Puralink**: directory search suggests September 2026 financing/Crane participation. Crane's portfolio search listing is not event evidence. No second round created from that lead.

Discovery queries covered each name + funding/investment, company-domain funding/news, Deeligence + LaunchVic and Puralink + Crane. Five primary/company-hosted pages were opened and read (Puralink archive/detail; LaunchVic case study; Deeligence AFR republication; YC Alloovium). The Deeligence homepage was returned in search. Search excerpts are not the basis for published claims.

## Checks and remaining work

Hosted strict preview and full current-record corpus: 160 tests passed. Real-source graph regression removes/readds exactly these events and verifies no entity/edge changes, preservation of prior rounds, two new articles, no guessed currency/numbers, and no manufactured exact Deeligence date. Independent review and exact-head CI/release are required before publication.

Baseline: 46 startups / 555 graph entities / 23 rounds across 18 startups. Proposed delta: two historical rounds, funding-covered startups +2; no entity or founder coverage delta. These are field-presence counts, not factual completeness. Live counts/revision must be verified after release.

## CI feedback

Initial PR CI correctly exposed an obsolete graph test that asserted Deeligence had no funding at all. The revised test still rejects cohort-sourced funding, explicitly requires the separately sourced LaunchVic event, and prohibits inferred amount/currency. Independent peer review accepted the correction. Local root JavaScript suite passes 214 tests; hosted suite passes 160. Full local Python suite ran 223 tests with 25 existing private-staging location errors in this worktree environment, so this is not a local full-suite pass. The focused funding regression passes; the normal clean GitHub CI environment remains the full-suite gate. Generated graph snapshots are excluded from the patch.
