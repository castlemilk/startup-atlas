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
