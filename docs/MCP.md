# Startup Atlas MCP

For the separately configured remote OAuth implementation, see [Hosted OAuth MCP](../hosted/README.md). The local server below continues to work without a GitHub App or hosted service.

A local MCP server for finding and adding source-backed opportunities to this repository. It uses the official MCP SDK over **stdio**. The static website has no new runtime dependency, database, HTTP write endpoint, account or credentials.

## Connect an MCP client

Use Node.js 20+ and Python 3.10+. From a current repository checkout:

```sh
npm ci --prefix mcp --ignore-scripts
npm run data:generate
```

For Codex CLI, register the actual absolute path to your checkout:

```sh
codex mcp add startup-atlas -- node /absolute/path/to/startup-atlas/mcp/server.mjs --write
```

Or use this configuration in a client supporting local stdio MCP servers, replacing the absolute path:

```json
{
  "mcpServers": {
    "startup-atlas": {
      "command": "node",
      "args": ["/absolute/path/to/startup-atlas/mcp/server.mjs", "--write"]
    }
  }
}
```

The server defaults to the repository containing `mcp/server.mjs`, independent of the client's working directory. `--repo /absolute/path/to/another/checkout` explicitly selects another compatible checkout. Omit `--write` for read-only use. No client configuration is installed automatically by this repository.

GitHub Pages only hosts static files; the Pages URL is **not** an MCP endpoint. This stdio server runs on the machine containing the checkout. It does not make tools available to a remote chat client that cannot run local processes. A future hosted adapter would need explicit authentication, a protected write path and separately approved hosting/access setup. Do not expose this process through an unauthenticated HTTP bridge.

## Tools

- `atlas_get_catalogue_info`: inspect counts, existing categories, access routes, evidence guidance, write mode and current revision.
- `atlas_search_opportunities`: search existing and newly added opportunities by name, organisation, ID or summary.
- `atlas_get_opportunity`: read a complete entry and recorded provenance where available.
- `atlas_validate_opportunity`: validate a proposed entry and its provenance without writing. Returns the revision required for adding.
- `atlas_add_opportunity`: append a validated entry to `data/opportunities-added.json`. Requires `--write` and `expectedRevision`. Does not overwrite, commit, push or deploy.

Example request to your MCP-enabled assistant:

> Find whether Example Foundation is already in Startup Atlas. Review its official programme terms, prepare an entry with the current intake, country eligibility and restrictions, then validate it before adding it to this checkout. Do not claim the site is published until the release workflow passes.

The server does not fetch sources or determine whether a claim is true. The caller must check the primary source, distinguish programmes from partner leads and obtain any required approval before publishing information.

## Entry and provenance contract

The opportunity schema is the existing website schema: `id`, `name`, `org`, `kind`, `access`, `scope`, `value`, `summary`, `eligibility`, `limits`, `url`, `status`, `checked`, `extra` and `facts`. Tool discovery returns the complete JSON Schema. The info tool lists the existing category and access-route vocabulary.

- Use a stable lowercase slug ID, and a distinct programme name for genuinely separate offers. Duplicate IDs and matching name/organisation pairs are rejected.
- Record exact public HTTPS source links, without credentials, internal hosts or nonstandard ports. No source is fetched by the server.
- `UNKNOWN` and `WORLD` must each stand alone. Use `WORLD` only when worldwide applicants are explicitly supported, and named two-letter country codes only with evidence. Structural validation cannot prove geographic eligibility.
- Keep money, equity, repayment, renewal, deadlines, service exclusions and other material conditions visible in `eligibility`, `limits`, `value` and `facts`. A marketing maximum is not an award.
- `checked` and `provenance.reviewedOn` must be the same valid calendar date, not a date in the future. This is the caller's asserted research date, not an automatic verification badge.
- Provenance requires `sourceUrls` exactly matching the primary and extra sources, plus a public, nonempty `evidence` explanation. The server records the separate `addedAt` timestamp.
- Never store private application status, source emails, personal financial/medical/identity details, passwords or tokens. Both checked-in source data and deployed catalogue content may be public.

This version adds opportunities only. Partner leads and reviewed identities retain the existing crawler/review workflow. It deliberately provides no delete, overwrite, shell execution, URL fetch, Git credential or publication tool.

## Persistence and publication

The hand-curated records remain in `scripts/make-data.py`. MCP additions live in the separate JSON source, rather than only in generated `data/catalogue.json`. The generator merges both sources using the shared offline validator. An ID collision with curated research fails generation instead of replacing either record. The original `updated` research snapshot stays unchanged; each addition carries its own `checked` date.

An add returns `published: false`. To review and publish through the existing release path:

```sh
npm test
npm run test:mcp
npm run build
git diff -- data/opportunities-added.json data/catalogue.json
```

Commit the additions source and generated catalogue together. Use the normal branch/review workflow. A push to `main` triggers the existing GitHub Pages deployment. No test fixture is added to the real catalogue.

`npm test` and `npm run build` regenerate the catalogue, so regenerating cannot silently erase an MCP addition. A successful write is immediately searchable through MCP, but the browser preview needs regeneration and the live site needs a release.

## Concurrency and recovery

The validation revision covers the generated catalogue, additions file and curated generator. A changed revision requires revalidation. An exact retry of a previously added ID, entry and provenance returns `already_present`, even if the caller still has the original revision. Different content under that ID is never treated as an update.

MCP writers use an exclusive `data/.atlas-mcp-write.lock`, write a flushed temporary file, atomically rename it into place, and flush the parent directory before acknowledging success. A second MCP writer gets `WRITE_BUSY` or `STALE_REVISION` and should re-read before retrying. Writes recheck the revision immediately before replacement, but editors and other tools do not honor the lock automatically. Avoid editing the additions file manually while MCP writes are in progress; filesystem atomic rename is not a cross-tool database transaction.

If the process crashes, inspect the ignored lock file's PID and timestamp. Only remove a stale lock after verifying no writer is running. Existing catalogue data is never automatically rolled back. On an uncertain client disconnect, search/get the intended ID before retrying. Corrupt JSON and symlinked destinations fail closed.

## Verification

```sh
npm ci --prefix mcp --ignore-scripts
npm test
npm run test:mcp
npm run build
```

Tests cover validation, evidence, duplicate detection, safe retries, stale revisions, competing writers, read-only mode, corrupted data, symlink rejection and repeated full regeneration. Protocol tests launch the server as a child process and use the official MCP client for initialization, tool discovery, errors, reads and writes. All write fixtures use disposable temporary repositories. GitHub Actions runs these checks before deploying the static site.
