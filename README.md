# Startup Atlas

A small, static directory of AI and cloud credits, founder programmes and partner research leads. It keeps provider offers distinct from community membership and investment routes, and treats unknown geographic eligibility as unknown.

The initial research snapshot is dated **11 November 2026**. Offers, eligibility, deadlines and terms can change. The directory is an index, not an approval or a commitment to provide credits.

## Develop

Requires Node.js 20 or newer. There are no third-party runtime dependencies.

```sh
npm test
npm run build
```

Serve `dist/` with a static HTTP server to preview. The site uses relative paths and works under a GitHub Pages project subpath. Saved opportunities remain in the visitor's browser only; no account or tracking service is involved.

## Update research

- `data/catalogue.json` is the data consumed by the site.
- `scripts/make-data.py` contains the curated opportunity records. `data/partner-leads.json` preserves the unverified names in the source index. Run `python3 scripts/make-data.py` from the repository root to regenerate the catalogue.
- Each opportunity has a primary HTTPS source, checked date, entry pathway, eligibility, constraints and explicit geographic scope. `WORLD` is reserved for a programme that explicitly accepts worldwide applicants; `UNKNOWN` means eligibility could not be established. A named country is evidence of a named market, not a guarantee for every founder.
- The partner index represents research leads; a name in that list does not establish an active relationship or a right to apply for credits. Do not silently guess an identity or eligibility.
- Review the original terms and update the snapshot date and tests when adding or changing data. Avoid mixing private application details into the public catalogue.

## Deployment

GitHub Actions validates the data and filtering, builds `dist/`, and publishes it to GitHub Pages after a push to `main`. Pull requests run the checks without deployment. In repository **Settings → Pages**, set the build source to **GitHub Actions**. The workflow can also be started with `workflow_dispatch`.

## Collect and review more metadata

The local crawler requires **Python 3.10+** and internet access; it uses only the Python standard library. It never submits applications, signs in, runs page scripts, or silently changes the curated catalogue.

```sh
# Crawl three curated opportunities and their explicit source links.
npm run crawl -- sites --limit 3

# Crawl the full opportunity catalogue; follow up to two relevant same-host links per primary page.
npm run crawl -- sites

# Search Wikidata for possible identities for a small batch, or for a specific name.
npm run crawl -- discover --limit 10
npm run crawl -- discover --partner Airtree

# For full discovery across the partner index, omit --limit.
npm run crawl -- discover
```

The `sites` mode gathers titles, descriptions, Open Graph metadata, canonical/icon links, headings, structured data, relevant links and bounded text snippets. It records the source URL, time, HTTP outcome and any skip reason. It starts with the curated programme sources and their additional references, and follows only a small number of relevant links on the same host. Use `--only nvidia` (repeatable), `--follow 0`, `--limit N`, or `--delay 2` to narrow or slow a run.

The `discover` mode uses the documented Wikidata API to produce **candidates**, not automatic identity matches. Its JSON includes entity IDs, descriptions, official websites, headquarters and country IDs, inception dates, founder and industry IDs, social identifiers and logo filenames when Wikidata supplies them. Names, aliases and apparent similarity alone do not prove identity, current programme membership, commercial partnership or credit entitlement.

Results are written under `research/crawl/`, which is ignored by Git. Each run has a dated snapshot and a `latest-sites.json` or `latest-discover.json`. Discovery also writes a timestamped `partner-review-*.csv`. To publish selected identities:

1. Open that CSV, inspect the candidate and its sources, and enter `yes` in the `approved` column for **at most one candidate per partner**. Leave uncertain rows blank. An approved row needs an HTTPS official website.
2. Optionally collect the approved partners’ own site metadata:
   ```sh
   npm run crawl -- sites --partners-only --approved research/crawl/partner-review-REPLACE.csv
   ```
3. Import the reviewed entries, optionally including the most recent site descriptions:
   ```sh
   npm run crawl -- apply-reviewed --approved research/crawl/partner-review-REPLACE.csv --snapshot research/crawl/latest-sites.json
   npm test && npm run build
   ```
   Omit `--snapshot` if no site crawl was run. Review the resulting `data/partners-reviewed.json` diff, then commit and push it to publish. Existing reviewed partners not present in the CSV are preserved.

Requests use an identifiable User-Agent, a per-host minimum delay, bounded responses and timeouts. Website pages respect `robots.txt` and its crawl delay; inaccessible robots policies fail closed. A 429 pauses that host for the run. Redirects and discovered follow-up links remain on the approved HTTPS host. The Wikidata discovery mode uses its public API with `maxlag` rather than scraping search pages. JS-only pages, external redirects, bot challenges and unavailable sources are reported for review rather than bypassed. This is a local research tool for trusted, reviewed seed URLs—not a public endpoint for arbitrary URLs.

## Logo assets

Company marks are self-hosted so browsing the directory does not call an external logo service. Sources, licenses and the exact maintained mapping are documented in `assets/logos/README.md` and `logos.js`; ambiguous names retain their initials until their identity is established.
