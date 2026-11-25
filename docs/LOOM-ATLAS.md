# Loom atlas export

The graph explorer renders the reviewed graph with Loom (`loom-core`,
`web/graph-loom.js`). Until now it could only load the whole graph as one
JSON file (`data/graph.json`). The Loom atlas export gives the explorer a
second, on-demand way to read the same graph, so it can keep growing
without the first download growing with it.

## What the build emits

`scripts/build-loom-atlas.py` reads `data/graph.json` and writes three
files into `dist/data/` (it runs as the last step of `npm run build`):

- `loom-atlas.sqlite` — range-readable by Loom's `createSQLiteAtlasReader`
  (`loom-core/atlas-sqlite`). Two tables, exactly the schema that reader
  queries:
  - `articles(topic, id, title, degree)`
  - `edges(topic, source, target)`
  plus a `metadata` table (`schema_version`, `source_revision`,
  `entity_count`, `edge_count`, `topic_count`).
- `loom-atlas-manifest.json` — the `AtlasManifest` (`topics` with `id`,
  `label`, `color`, `first`, `count`, `x`, `y`; `connections` as
  `[source topic, target topic, hyperlink count]`), plus `database`,
  `databaseBytes`, `pageSize` and `full`, the fields the publisher in
  Loom's `docs/examples/atlas.ts` adds.
- `loom-atlas-full.json` — every topic block as one JSON array, for
  `createFullAtlasReader`, so the explorer keeps working without
  WebAssembly.

The SQLite worker and WASM the reader needs are vendored by
`scripts/build.mjs` from the installed `loom-core` package into
`dist/vendor/atlas-runtime/` (next to the existing `LOOM-LICENSE.txt`).

## Mapping

- One topic per entity kind (`partner`, `person`, `programme`,
  `provider`, `startup`), sorted alphabetically so topic ids are stable.
  Topic colours reuse the site's light-theme kind tokens from
  `web/design-tokens.css`; positions are a deterministic circle.
- Article ids are contiguous inside a topic, assigned in sorted
  entity-id order. `degree` is the incident edge count.
- Each edge is stored under its source entity's topic, matching Loom's
  convention that a block holds the edges out of its own articles.
  Cross-topic edges surface once both topics are open.
- The builder only reads the committed `graph.json`; it never
  regenerates the graph, so it stays usable while `make-graph.py` is
  blocked on a data fix. Outputs are deterministic: same graph in,
  same bytes out (verified in `tests/test_build_loom_atlas.py`).

## Explorer wiring (#367)

`web/graph.js` now mounts an "Atlas overview" section below the
neighbourhood explorer, wired by `web/graph-atlas.js` (bundled by
`scripts/build.mjs` like `graph-loom.js`):

- It fetches `data/loom-atlas-manifest.json`, builds the atlas with
  `createAtlas`, and mounts it with `mountAtlasMap`. The primary reader
  is the on-demand SQLite reader (`createSQLiteAtlasReader`) against
  `data/loom-atlas.sqlite`, with the worker and WASM served from
  `vendor/atlas-runtime/`.
- If an on-demand read fails, the atlas retries once through the full
  JSON reader (`createFullAtlasReader` against
  `data/loom-atlas-full.json`) — the policy lives in
  `web/graph-atlas-model.js` and is unit-tested in
  `tests/graph-atlas.test.js`.
- Topic buttons switch topics (mirroring the atlas expansion state);
  the largest topic opens on first mount. Picking a node shows its
  title and topic in a readout line.
- The wiring is additive and failure-isolated: if the manifest or the
  readers fail, the section stays hidden and the existing full-graph
  explorer (`createWireGraph`, with the SVG map behind it) is
  untouched. That path remains the fallback until the atlas path is
  verified live on Pages (topic switching, readout, search) — do not
  remove it before that check passes.

Known limitation: the export carries article titles, not entity ids,
so a picked article cannot yet open its explorer detail panel or
profile. Adding the entity id to the export (and resolving picks
through `web/graph.js`'s `traverse`) is the follow-up once the
on-demand path is verified live.

Related query paths, for contrast:

- `scripts/build-graph-db.py` builds `dist/data/atlas.sqlite`, the
  explorer's FTS4 search snapshot (different schema, different reader).
- `scripts/build-query-parquet.py` builds the DuckDB tables behind the
  query console (`web/query.html`) — tabular SQL over the catalogue,
  not graph neighbourhoods.
