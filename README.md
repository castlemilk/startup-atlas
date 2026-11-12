# Startup Atlas

Browse the [partner index](docs/PARTNER-INDEX.md) for the original directory names, available logos and reviewed website links.

### Exploring the globe

The globe plots a small, curated sample of **city-level** office, campus and programme locations. These are not precise addresses, evidence of a provider partnership, or claims about programme eligibility. Each place lists its underlying organisations and source links. Drag the globe, use the rotation buttons, or choose a city directly; the city buttons and source links work without WebGL. Automatic rotation can be paused and is off when reduced motion is requested.

The site self-hosts Three.js r180 (MIT) and Natural Earth's 1:110m land geometry (public domain). When WebGL is unavailable it renders the same places with a two-dimensional canvas globe. See `vendor/THREE-LICENSE.txt` and `data/GEODATA-SOURCES.md`.

### Collecting partner logo candidates

Partner names are leads and may refer to multiple organisations. First review the candidate identities and websites produced by `npm run crawl -- discover`, then create an approved CSV as described below. To stage possible logos from those **approved websites**:

```sh
npm run crawl -- logos --approved data/partner-logo-seeds.csv --partners-only --follow 0 --logo-limit 2
```

The included seed file contains three independently identified organisations, with Wikidata IDs and official websites checked on 12 November 2026; it does not establish their relationship to any provider. Add further identities only after reviewing the discovery CSV. The process respects robots.txt and the crawler's host and rate limits. It records structured and metadata logos, logo-labelled images (including lazy-loaded URLs and `srcset` variants), site icons and social images as candidates; only a limited number of same-host logo/icon files are captured, as opaque `.bin` files under `research/crawl/logo-files/`. Social images and cross-host assets are not fetched automatically. Review identity, visual correctness, applicable usage rights and file safety before converting an asset to a self-hosted logo and mapping it in `logos.js`; no candidate is automatically published. Some sites block access or load branding dynamically, and unverified names keep their initials until reviewed.

A small, static directory of AI and cloud credits, founder programmes and partner research leads. It keeps provider offers distinct from community membership and investment routes, and treats unknown geographic eligibility as unknown.

The initial research snapshot is dated **11 November 2026**. Offers, eligibility, deadlines and terms can change. The directory is an index, not an approval or a commitment to provide credits.

## Develop

Requires Node.js 20 or newer and Python 3.10+ for catalogue generation. The browser uses self-hosted Three.js and TanStack Table core; no external runtime service is required. The optional local MCP server has an isolated, locked dependency set under `mcp/`.

```sh
npm ci --ignore-scripts
npm test
npm run build
```

Serve `dist/` with a static HTTP server to preview. The site uses relative paths and works under a GitHub Pages project subpath. Saved opportunities remain in the visitor's browser only; no account or tracking service is involved.

The UI uses Gamma catalogue styles and interaction patterns adapted to native HTML and JavaScript; component provenance, runtime token mapping and behaviour are documented in `DESIGN.md`.

## Update research

- `data/catalogue.json` is the data consumed by the site.
- `scripts/make-data.py` contains the curated opportunity records. `data/partner-leads.json` preserves the unverified names in the source index. Run `python3 scripts/make-data.py` from the repository root to regenerate the catalogue.
- `data/opportunities-added.json` stores source-backed MCP additions with provenance. Regeneration merges them with curated records, rejecting collisions rather than overwriting either source. Tests and builds regenerate automatically.
- Each opportunity has a primary HTTPS source, checked date, entry pathway, eligibility, constraints and explicit geographic scope. `WORLD` is reserved for a programme that explicitly accepts worldwide applicants; `UNKNOWN` means eligibility could not be established. A named country is evidence of a named market, not a guarantee for every founder.
- The partner index represents research leads; a name in that list does not establish an active relationship or a right to apply for credits. Do not silently guess an identity or eligibility.
- Review the original terms and update the snapshot date and tests when adding or changing data. Avoid mixing private application details into the public catalogue.

## Add opportunities with MCP

The [local Startup Atlas MCP server](docs/MCP.md) provides catalogue search, entry lookup, validation and add-only persistence. It runs over stdio, defaults to read-only, and requires an explicit `--write` launch option to edit this checkout. It does not create a public API, use credentials, or publish automatically.

```sh
npm ci --prefix mcp --ignore-scripts
npm run mcp -- --write
```

Use the [client connection instructions and publication workflow](docs/MCP.md) to register it with an MCP-capable local client. GitHub Pages cannot host this server.

## Deployment

GitHub Actions validates the data and filtering, builds `dist/`, and publishes it to GitHub Pages after a push to `main`. Pull requests run the checks without deployment. In repository **Settings → Pages**, set the build source to **GitHub Actions**. The workflow can also be started with `workflow_dispatch`.

## Collect and review more metadata

The local crawler requires **Python 3.10+** and internet access; it uses only the Python standard library. It never submits applications, signs in, runs page scripts, or silently changes the curated catalogue.

```sh
# Crawl three curated opportunities and their explicit source links.
npm run crawl -- sites --limit 3

# Crawl the full opportunity catalogue; follow up to two relevant same-host links per primary page.
npm run crawl -- sites

# Discover possible new programmes from the curated official directory seeds.
npm run crawl -- programs

# Discover VC, accelerator and ecosystem partner leads from curated directories.
npm run crawl -- partners --follow 0

# Look for possible Wikidata identities for one directory-review batch.
npm run crawl -- discover --leads research/crawl/partner-directory-review-REPLACE.csv --limit 10

# Search Wikidata for possible identities for a small batch, or for a specific name.
npm run crawl -- discover --limit 10
npm run crawl -- discover --partner Airtree

# For full discovery across the partner index, omit --limit.
npm run crawl -- discover
```

The `sites` mode gathers titles, descriptions, Open Graph metadata, canonical/icon links, headings, structured data, relevant links and bounded text snippets. It also groups candidate evidence by benefit, eligibility, funding stage, cost, duration, location, restrictions and application process, and records currency mentions with context. These are extracted snippets, not authoritative determinations. It records the source URL, time, HTTP outcome and any skip reason. It starts with the curated programme sources and their additional references, and follows only a small number of relevant links on the same host. Use `--only nvidia` (repeatable), `--follow 0`, `--limit N`, or `--delay 2` to narrow or slow a run.

The `programs` mode starts with the primary-source registry in `data/program-sources.json`, crawls permitted pages and writes a `program-review-*.csv` of candidate programme links and nearby descriptions. The source registry includes official provider and government directories. Discovered links are unverified leads: inspect the source, destination, current eligibility, geography and terms before manually adding an opportunity to `scripts/make-data.py`. The crawler does not fetch cross-host candidates automatically or publish them.

The `partners` mode starts from `data/partner-sources.json` and extracts organisation names and provider-reported types from matching directory tables into `partner-directory-review-*.csv`. Each lead carries its source, acquisition time and the directory's stated scope; an exact match with an existing lead is a review hint, not identity verification. A website link in the table is a candidate only and is not fetched automatically. If no matching table is present, the snapshot reports that the structure may have changed or require JavaScript. `discover --leads` can search these names on Wikidata while retaining directory provenance in its own review CSV. Confirm the identity and source relationship independently before manually adding a new name to `data/partner-leads.json`; only names already in that index can be used by the approved-site and import workflows below. Neither CSV publishes new names automatically.

If you already have attributable text, `npm run crawl -- captures --captures path/to/captures.json` runs the same evidence extraction offline. The file format is `{"documents":[{"name":"Example","url":"https://example.com/program","acquisition":"how it was obtained","captured_at":"2026-11-11T00:00:00Z","text":"Text to inspect"}]}`. These results are explicitly marked as provided, partial excerpts—not direct fetches or complete page snapshots. Always consult the current full primary source before publishing a claim.

The `discover` mode uses the documented Wikidata API to produce **candidates**, not automatic identity matches. Its JSON includes entity IDs, descriptions, official websites, headquarters and country IDs, inception dates, founder and industry IDs, social identifiers and logo filenames when Wikidata supplies them. Names, aliases and apparent similarity alone do not prove identity, current programme membership, commercial partnership or credit entitlement.

Results are written under `research/crawl/`, which is ignored by Git. Each run has a dated snapshot and a mode-specific `latest-*.json`. Partner discovery also writes a timestamped `partner-review-*.csv`. To publish selected identities:

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

## Run partner research on GitHub Actions

In Actions → **Partner research crawl**, choose **Run workflow** on the default branch. This manual workflow runs the partner-directory discovery and approved-site logo capture with the same robots, host and rate limits as the local crawler. It uploads `partner-crawl-review` as an artifact retained for 14 days. Download and inspect the CSV, snapshots and any captured files; candidates are unreviewed and never published automatically. A successful workflow does not guarantee every source or asset was accessible: inspect the per-source statuses and skip reasons.

## Logo assets

Company marks are self-hosted so browsing the directory does not call an external logo service. Sources, licenses and the exact maintained mapping are documented in `assets/logos/README.md` and `logos.js`; ambiguous names retain their initials until their identity is established.
