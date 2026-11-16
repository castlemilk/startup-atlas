# Design lab concepts

The design lab presents the five wireframes that define Startup Atlas’s visual direction. Their compositions guide the shared masthead, serif identities, white research panels, terracotta selection and adjacent evidence inspectors. Names, financial figures, relationships and source labels inside the generated images remain fictional examples, separate from Atlas research records.

## Manifest and assets

The collection is now part of a three-area microsite: [interface studies](../web/design-lab.html), [the direction handbook](../web/design-direction.html) and [the asset/icon library](../web/design-assets.html). The handbook adds two direction boards and three transparent editorial illustrations alongside the original five concepts. [DESIGN-DIRECTION.md](DESIGN-DIRECTION.md) records the expanded guidance and asset families. The build creates individual SVG downloads and a complete design kit.

[The concept manifest](../web/design-concepts.js) owns the display order, titles, questions, focus notes, accessible image descriptions, working routes and generation prompts. It exports the same array as `concepts`, `designConcepts` and the default export. Keep the stable IDs and numbers when revising an image so review feedback remains traceable.

| Number | ID | Full image | Thumbnail | Existing view |
| --- | --- | --- | --- | --- |
| 01 | `list-search` | `01-list-search.webp` | `01-list-search-thumb.webp` | List and search |
| 02 | `treemap` | `02-treemap.webp` | `02-treemap-thumb.webp` | Company treemap |
| 03 | `graph` | `03-graph.webp` | `03-graph-thumb.webp` | Relationship graph |
| 04 | `startup` | `04-startup.webp` | `04-startup-thumb.webp` | Startup profile |
| 05 | `partner` | `05-partner.webp` | `05-partner-thumb.webp` | Partner profile |

All image paths are relative to `web/assets/design-lab/`. Full images and thumbnails should depict the same revision. Thumbnails are delivery derivatives, not separate concepts.

The accepted studies were generated with Create Image. Full images retain the 1536 × 1024 composition; 768 × 512 thumbnails reduce the gallery download. Both are encoded as WebP, with no semantic changes during conversion. The treemap has one image-generation revision: its fictional amount is explicitly marked as an example, and the coverage note excludes unknown amounts from the plotted measure.

## Provenance and review

Each record’s `prompt` stores the exact generation instructions when the asset is accepted. An optional `revisionPrompt` records a subsequent image edit. The prompt is review documentation, not a claim that every requested detail appears correctly in the generated image.

Inspect each resulting image before acceptance. Check that its description and alt text match the visible composition, examples remain clearly fictional, and the image supports the intended design question. Generated chart geometry, labels and numbers are unsuitable for factual comparison. Verify real treemap proportions and relationships in the working views against the source data.

## Concept and implementation boundaries

The **design lab** preserves the source wireframes. The **design-system catalogue** connects them to working views and shared component specimens. The directory and partner company inspectors, treemap Figure/Company tabs, joined graph inspector and profile evidence rails now implement that direction. Other pictured controls, such as sector filters and portfolio modes, still require their own sourced data and implementation; an image alone is not evidence that they work.

The manifest’s `route` opens an existing Atlas view with actual sourced data. Its `pattern` identifies the corresponding live catalogue preview. Fictional subjects in an illustration do not acquire real Atlas profiles through those links.

[DESIGN.md](../DESIGN.md) records how the wireframes map into the implemented visual system. Runtime tokens own exact values, while [UX-CONTRACT.md](../UX-CONTRACT.md) and [the explorer specifications](EXPLORER-VIEWS.md) distinguish current interactions from subsequent work. The research records retain authority over every fact and relationship.

Before publication, include the manifest, page modules and image directory in the static build, then check all five concepts, thumbnails, full images and working-view links under the GitHub Pages project path. A successful PR build is review evidence; public availability still depends on the main-branch Pages deployment.
