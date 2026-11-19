# Signal identity and research artwork r2

Six authored vector constructions extend the [r1 studies](SIGNAL-ASSET-STUDIES.md): two Aperture identity candidates and four editorial research objects. Each has light, dark and monochrome exports, giving **18 SVG files**. The [review gallery](../web/assets/design-lab/signal-explorations/r2/index.html) includes placement examples, actual-size specimens and individual downloads. The [manifest](../web/assets/design-lab/signal-explorations/r2/manifest.json) records the source, palette, meaning, dimensions, layers and SHA-256 of every export.

**Status: experimental review collection, 17 November 2026, Melbourne.** No identity has been selected. The proposed Geist wordmark composition is a spacing study. Published availability of these assets would not make them the operational logo or establish a shipped collections feature.

## Starting point and ownership

Work began from `main` at [`d9a63d86c285c139a413b6b1fe9e79d3f6d72460`](https://github.com/castlemilk/startup-atlas/tree/d9a63d86c285c139a413b6b1fe9e79d3f6d72460), the merge of [PR 139](https://github.com/castlemilk/startup-atlas/pull/139). The current [design-system Space](https://chatgpt.com/space/page_5167bcbbbb0c81919e1d565fd4d82e4a), [r1 Space record](https://chatgpt.com/space/page_ec06b6432a5081918604705f79b9d433), source wireframe and existing Signal artwork were inspected before authoring. The latest Pages run for that revision was successful; this establishes the starting release, not deployment of r2.

At inspection, [PR 136](https://github.com/castlemilk/startup-atlas/pull/136) remained draft at `a786636ac4a7d7d0c14a713cb393e44ab878e74d`, owning the component field guide and `design-aesthetic` files. [PR 135](https://github.com/castlemilk/startup-atlas/pull/135) owned the disabled analytics foundation, and [PR 107](https://github.com/castlemilk/startup-atlas/pull/107) contained legacy company-card work. The separately active Hardware/Next.js integration had no identifiable public PR or branch in the inspected state. Its implementation surface remains outside this asset change. The recorded Startup Atlas automation was disabled.

The r2 folder is additive. All nine r1 SVGs, its manifest and its generator are preserved byte-for-byte. The only r1 gallery change is a link to the new review set. Runtime controls, production identity, fonts, token definitions, sourced records and the component-field-guide files retain their existing owners. The existing CI browser step also visits the new nested gallery; its job, permissions and artifact destination are unchanged.

## Artistic direction

Signal should feel like a carefully assembled research instrument. The surrounding page uses porcelain surfaces, graphite navigation, cobalt actions, self-hosted Geist and restrained tactile depth. Artwork gives a reader one concrete operation to recognise: an opening, a source beside a record, equal frames for comparison, a retrievable leaf or a deliberate interface.

The logos use broad, flat silhouettes. The editorial objects use a shared orthographic plane, shallow extrusion, chamfered corners and open cutouts. The geometry stays editable and the exterior stays transparent. Depth comes from a few resolved planes and edges; no baked floor shadow, blur, raster texture or animated glow is required. One cobalt object establishes the focal relationship. Functional iconography still owns small controls.

The original wireframes govern operational composition. This gallery applies their readable title → explanation → action → supporting art order to an editorial review surface; it does not reconstruct a new data view. Its proposed lockup keeps the mark separate from live Geist text. The source-reading header uses editable text and an empty `alt` on its decorative repetition of the Folio illustration.

### The two identity studies

| Study | Visible construction | Where to explore it | Review decision |
| --- | --- | --- | --- |
| **Aperture Cut** | A stable frontal opening with a short detached shelf. Clear channels around the shelf remain open in monochrome. | Master-mark comparisons, publication covers and proposed identity lockups. | Retain as the clearer continuation of r1. Its larger opening and separated shelf are deliberate, not a selected replacement. |
| **Aperture Fold** | Offset uprights, a broken shoulder and one cobalt return plane. The silhouette shifts as well as the colour. | Alternate editorial signatures and title-page compositions. | Retain as the more directional alternative. Compare the split shoulder and interior shelf at 32px before choosing a direction. |

Both use a 128 × 128 viewBox and start at **32 CSS pixels**. The gallery shows real 32, 48 and 96px specimens. The stored artwork includes clear space; do not crop to the visible bounds or squeeze a mark into an unapproved 16px favicon. Proposed logo use still requires an explicit identity selection. Artistic review does not establish trademark clearance.

### The four editorial objects

| Object | Meaning | Intended placement | Semantic boundary |
| --- | --- | --- | --- |
| **Folio Source** | A broad open dossier and a smaller supporting sheet are brought into view through a reference tab. | Evidence-method headers, source-reading introductions and research documentation. | It introduces inspecting a source. It is not a verified or trusted badge and cannot establish whether a claim is correct. |
| **Measure Compare** | Two identical plate footprints align against one common reference rail. | Comparison-method introductions and guides to measures, units and missing observations. | Equal drawing geometry is editorial. No actual metric, funding amount, company ranking or comparison result is shown. |
| **Index Collection** | An upright slotted archive sits beside a withdrawn cobalt leaf. | Collection-building and retrieval editorial studies, reading lists and documentation. | The dividers are compositional. They do not count records, order companies or claim a saved-collections feature has shipped. |
| **Relay Context** | Exactly two open housings meet through one deliberate bridge. | MCP introductions, context-transfer explanations and integration documentation. | The bridge is a metaphor. Connected, authenticated and transferred states must come from the actual service. |

All four use a 512 × 384 viewBox and start at **160px wide**. The gallery includes actual 160 × 120px specimens. Larger introductions can use 240–480px compositions with generous space around the object. These are editorial illustrations, not replacements for the existing 24-unit feature symbols or utility icons.

## Palette and placement rules

The light exports freeze values from `web/design-tokens.css` at the starting revision: graphite `#111318`, cobalt `#315efb`, porcelain `#ffffff`, edge `#7d899b` and depth `#dfe3e8`. The gallery imports the current runtime stylesheet rather than redeclaring these roles.

Dark exports use the existing exploratory roles `#f4f6fa`, `#9aafff`, `#adb6c5` and `#718096`. Pale porcelain faces preserve the silhouette against graphite. These are dark-surface asset studies, not an operational application theme. Monochrome exports resolve every plane to graphite while retaining the same paths, layers and open cuts. The manifest records the exact source token files and their checksums; the revision is stable when future runtime tokens change.

- Use the light export on porcelain and the dark export on a dark stage. Use monochrome for single-ink review or a host requiring one neutral silhouette.
- Preserve the complete viewBox and aspect ratio. Clear space is part of the drawing.
- Use a descriptive `alt` when the object adds meaning; use `alt=""` for a decorative repeat whose text already explains it. A logo link needs an accessible destination name.
- Keep company names, measures, sources and relationship predicates in reviewed records and live text. No artwork in this packet contains company names, financial values, relationship data or status indicators.
- Keep controls immediate. This collection is static and readable without JavaScript; native details reveal theme variants. It adds no entrance choreography or continuous animation.

## Reproduction and provenance

These are **original authored SVG constructions**. They were not traced from raster images, derived from company logos or generated by an image model. There is consequently no invented image-generation prompt. The shared projection is an illustrative drawing convention, not a measured physical model. No font, external resource, script, raster image or filter is embedded in the SVGs.

Reproduce the shipped bytes without touching the gallery or r1:

```sh
python3 scripts/make-signal-studies-r2.py
python3 -m unittest discover -s tests -p 'test_signal_asset_studies*.py'
```

For an isolated comparison, generate into a temporary folder with `--out`. The manifest includes six artwork records and eighteen asset records. Each asset names its editable semantic layers, SHA-256, byte count, dimensions, palette and minimum size. `identity_approval` and `user_selection` remain null. Revision-specific colours are snapshots; changing a future palette must not silently rewrite this reviewed set.

Build and exercise the delivered gallery through the existing workflow:

```sh
npm ci --ignore-scripts
npm test
npm run build
CHROME_BIN=chromium ATLAS_SCREENSHOTS_DIR=/tmp/atlas-signal-r2 node scripts/test-signal-studies-r2-browser.mjs
```

The browser script uses the repository's dependency-free Chrome/CDP approach. CI's existing design-microsite step runs it and retains the screenshots with `graph-review`. It verifies the built page, source/build/download byte equality, local resources, fonts, image decoding, desktop and narrow layouts, keyboard use, theme disclosures, reduced motion and no-JavaScript readability. It also records the browser version and per-check outcomes in `browser-review.json`.

This nested collection is built through the existing recursive design-asset copy. It is separate from the canonical `design-handbook.js` catalogue and the existing 123-file design-kit ZIP. The r2 gallery and manifest are the review entry points; no claim of canonical kit inclusion or production identity adoption is made.

## Review record

The first vector render exposed two defects: overlapping archive frames merged into an opaque mass in monochrome, and dark filled faces lost their silhouette against graphite. The revised Index uses separated upright dividers and one withdrawn leaf; dark exports use pale porcelain faces. Open cutouts remain genuine alpha rather than background-coloured patches.

Source verification covers deterministic regeneration, all eighteen checksums, the constrained static SVG subset, named layers, accessible descriptions, theme-invariant geometry and identical comparison footprints. The [vector review](../web/assets/design-lab/signal-explorations/r2/vector-review.json) records 54 Inkscape renders, alpha probes, painted bounds, renderer version and per-asset observations. The [theme contact sheet](../web/assets/design-lab/signal-explorations/r2/review-overview.png) and [minimum-size sheet](../web/assets/design-lab/signal-explorations/r2/review-minimum-sizes.png) are opaque review images, not transparent masters or browser screenshots. The local Chrome process was blocked before page navigation by the execution environment's Unix-socket restriction. Desktop/mobile browser acceptance must therefore be collected through the existing PR CI; consult the PR and Space for the exact reviewed head, run and result. No local browser pass is inferred from successful image rendering.
