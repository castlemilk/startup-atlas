# Startup Atlas knowledge graph

The first graph slice has distinct `startup`, `person`, `partner` and `provider` entities, attributed relationships, funding events and news links. `data/startup-research.json` is a deliberately small, reviewed overlay; `scripts/make-graph.py` imports existing portfolio links without claiming they were funding rounds, and `scripts/add-provider-edges.mjs` adds publicly sourced provider relationships. Screenshot-only claims stay in the existing directory and are not promoted to sourced graph edges. IDs are stable `kind:slug` values; a slug collision fails the build instead of merging unrelated names.

Run `npm run data:generate` to regenerate `data/graph.json` and the Connect server's embedded snapshot. The public explorer uses TanStack Query Core for caching and TanStack Table Core for the result model. It uses the Connect JSON endpoint when available and otherwise the generated snapshot on the existing static site. Four source-backed historical funding events are included; currencies and historical valuations are explicit. Missing founders, dates and amounts are unknown, never zero-value claims.

## Backend and deployment

`proto/atlas/graph/v1/graph.proto` defines the Buf/Connect-Go search and startup-detail API. Generate with `buf lint && buf generate`; run `go test ./internal/graph ./api`. The Vercel function accepts Connect JSON POSTs at `/api/graph?method=Search` and `/api/graph?method=GetStartup`. Without database configuration it serves the embedded, source-backed snapshot. With `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`, it queries the RLS-protected Supabase Data API. Both must be configured together. Only the publishable key is used; never expose a secret or service-role key.

The checked-in migration creates published/draft graph tables, search indexes, attribution, public read policies and no public write policies. Review the migration and use a dedicated Atlas Supabase project; do not apply it to an unrelated app. Generate an **insert-only** initial seed with `npm run data:generate && python3 scripts/make-graph-seed.py > graph-seed.sql`; inspect it before use. Conflict handling never overwrites editorial changes. A production-ready incremental sync and authenticated graph write API are still required before the database can become the source of truth: today the existing MCP remains GitHub-backed, and MCP additions are reflected in the generated static graph only after a build. Do not enable Supabase mode until migration, seed and parity checks succeed. Do not promote a database-backed deployment until cross-search, both startup detail and existing directory/MCP workflows are verified.

## News discovery

Run `npm run crawl -- news --follow 2` against `data/startup-news-sources.json`. Only curated HTTPS source hosts are fetched; rate limits, public-address checks and response limits are inherited from the collector. The output `research/crawl/latest-news.json` includes linked article URLs, extracted amount mentions and source evidence as unreviewed candidates. A news headline, a funding amount and a date do not by themselves establish the type of round, currency, investor, valuation or a current claim; verify the actual primary announcement before adding it to the reviewed graph. The collector does not request robots.txt and does not bypass access controls.

## Remaining work before cutover

- Create a dedicated Supabase project and apply/test migrations and insert-only seed.
- Make crawler and MCP graph proposals idempotent, reviewable and reflected in both database search and the static fallback; migrate and reconcile existing records without losing provenance.
- Add ingestion of verified news/funding candidates, source freshness, entity resolution and deduplication.
- Verify Connect, Supabase RLS and search, UI, OAuth MCP and Vercel preview end to end; keep GitHub Pages available until parity is demonstrated.
