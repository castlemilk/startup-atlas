# Signal: Atlas aesthetic and asset direction

**Status: light operational aesthetic adopted; dark and material variants remain studies · 17 November 2026, Melbourne.** Signal gives Startup Atlas bright neutral surfaces, graphite typography, cobalt selection and a family of precise feature objects. It carries the research reading order established by the [source wireframes](../web/design-system.html#wireframes) into a different visual language.

The [direction workbench](../web/design-aesthetic.html) established light and dark previews, feature navigation, header compositions and a small pilot asset family. Light Signal now informs the directory, treemap, graph and company/partner dossiers, with ui-sdk supplying shared control behaviour. [UI-SDK.md](UI-SDK.md), [EXPLORER-VIEWS.md](EXPLORER-VIEWS.md) and [TOKENS.md](TOKENS.md) define the operational contract. Dark mode, alternate material comparisons and expanded asset placements remain workbench explorations; adopting the runtime aesthetic does not turn decorative feature art into data or a live MCP status.

## What the direction should communicate

Atlas helps a reader find a company, understand a measure, follow a relationship and take that context into a tool. Signal gives those operations a recognisable physical vocabulary: coupling, partitioning, indexing and connecting. The character comes from carefully constructed objects and exact interface composition.

The signature is one family of research instruments. Satin aluminium, porcelain and graphite provide a consistent construction; a single cobalt part identifies the active piece. Precise chamfers, plausible joints and disciplined negative space create the technical character. The surrounding interface gives records, controls and evidence a clear hierarchy.

The pilot is successful when all four objects look related without a logo, each remains distinguishable at navigation scale, and each suggests its feature's operation. A user should be able to read a menu, select a feature and understand the header preview without interpreting decorative diagrams.

## References and what Atlas takes from them

These observations describe the referenced products. Signal's palette, object family and application rules are Atlas-specific design decisions.

| Reference | Observed principle | Atlas application |
| --- | --- | --- |
| [Granola enterprise](https://www.granola.ai/enterprise) and its [brand rationale](https://www.granola.ai/blog/a-new-look-for-granola) | A calm product interface coexists with distinctive artwork and complementary display/UI typography. The feature navigation provides names and short descriptions alongside individual graphics. | Pair concise, readable navigation with recognisable feature marks and a larger contextual preview. Keep the interface quiet enough for the artwork to have a clear role. |
| [Clay homepage](https://www.clay.com/) and [homepage design rationale](https://www.clay.com/blog/new-homepage-2026) | A connected mechanical illustration expresses the product's primitives and continues through the page; product examples make the capabilities concrete. | Build one construction language whose parts express four related Atlas operations. Reuse the same object at navigation, feature and header scales. |
| [Geist typography](https://vercel.com/geist/typography), [materials](https://vercel.com/geist/materials) and [colours](https://vercel.com/geist/colors) | Type roles distinguish headings, labels, copy and data. Materials encode surface hierarchy. Colour steps distinguish backgrounds, boundaries and text; elevation stays restrained. | Use explicit token roles, a compact sans/mono hierarchy, fine keylines and a small number of surface levels. |
| [Vercel interface guidelines](https://vercel.com/design/guidelines) | Alignment, visible focus and meaningful motion are treated as part of interface quality. Motion should clarify cause and effect and support reduced-motion preferences. | Make feature transitions short, readable and input-driven. The static composition must remain complete. |

The references establish methods to learn from. Their logos, illustrations and product claims are not Atlas assets. The generated pilot artwork is an original exploration based on the grammar below.

## Foundations and token ownership

Operational values live in [design-tokens.css](../web/design-tokens.css) as `--atlas-*` roles. The workbench retains [design-aesthetic-tokens.css](../web/design-aesthetic-tokens.css), scoped to `.signal-app`, with dark values selected through `data-theme="dark"`. Components consume named roles rather than arbitrary colours. The table below describes the workbench palette; the light family is adopted in the operational token sheet, while the dark family remains an exploration.

| Role | Light | Dark | Intended use |
| --- | --- | --- | --- |
| `--signal-bg` | `#FAFAFC` | `#101114` | Outer canvas |
| `--signal-surface` | `#FFFFFF` | `#17191E` | Main working surface |
| `--signal-soft` | `#F0F2F6` | `#20242B` | Quiet grouping or secondary well |
| `--signal-ink` | `#111318` | `#F4F6FA` | Primary text and meaningful marks |
| `--signal-muted` | `#626975` | `#ADB6C5` | Supporting text and metadata |
| `--signal-line` | `#DFE3E8` | `#343B47` | Decorative separation |
| `--signal-line-strong` | `#7D899B` | `#718096` | More visible boundaries |
| `--signal-accent` | `#315EFB` | `#9AAFFF` | Action, selection and the active graphic part |
| `--signal-accent-soft` | `#EEF2FF` | `#242F50` | Selection background |
| `--signal-on-accent` | `#FFFFFF` | `#101114` | Text on a solid accent surface |
| `--signal-focus` | `#315EFB` | `#B5C5FF` | Keyboard-focus indication |

Colour belongs to a role. Cobalt is an action and selection cue; it does not establish verification, data quality, funding status or company rank. Entity kinds retain written labels. Operational warning and unavailable states use their named Atlas roles and a text explanation. Additional status treatments need the same explicit meaning before becoming shared primitives.

### Contrast and state cues

Target at least 4.5:1 for ordinary text and 3:1 for large text, following [WCAG contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html). Meaningful component states and graphic parts need 3:1 against adjacent colours, as described by [non-text contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html). Evaluate actual foreground/background pairs, including hover, selected and dark surfaces.

Fine keylines can be decorative. A control still needs identifiable content, and a selected or focused state needs a sufficiently visible indicator. Use the strong-line role where a boundary must be identifiable, with an explicit focus ring, text label, selected marker or contrasting filled shape where the meaning depends on it. Keep focus independently visible when an item is already selected.

### Type and density

Use **Geist Sans** for headings, navigation, labels and reading copy. Use **Geist Mono** for commands, identifiers and compact numerical annotations. The exploration's CSS family aliases are `Atlas Geist` and `Atlas Geist Mono`. Weight 400 is the reading default; 500–600 provides controlled emphasis. Avoid compressed or very light body text.

| Role | Direction target | Treatment |
| --- | --- | --- |
| Main page heading | 48–80px desktop, 36–48px narrow | Sans, deliberate wrapping, tight but open letter spacing |
| Section heading | 28–40px | Sans, clear hierarchy beneath the page heading |
| Menu or component title | 16–20px | Sans, 500–600 weight |
| Reading copy | 15–17px | Sans, approximately 1.5–1.65 line height |
| Dense interface label | 14px | Sans, clear icon/text alignment |
| Secondary data or caption | 12–13px | Sans or mono according to content, with adequate contrast |
| Command or identifier | 12–14px | Mono; preserve the complete value or provide an explicit copy action |

These are workbench composition targets; operational research views use the denser scale recorded in [DESIGN.md](../DESIGN.md), and the route stylesheet owns its implemented sizes. Values that are compared use tabular figures. UI copy uses sentence case. Long company names, source titles and translated labels must wrap without forcing the page wider. Mobile text inputs use at least 16px type. Touch actions have a 44px target even when their visible symbol is smaller.

### Geometry and surface hierarchy

Use the 4px spacing unit to build 8, 12, 16, 24, 32, 48 and 64px relationships. Align related controls to one baseline and related content to one edge. Preserve a visible gap between a feature's label and its illustration.

The component direction uses a deliberate radius hierarchy: 6px compact details, 10px controls, 12px selected rows, 18px trays/cards/menus and 24px feature panels. Fully round geometry is reserved for round primitives such as avatars, status dots and switches. Nested corners follow the outer radius minus their inset. Precise alignment and edges retain Signal's technical character as the corners become softer.

[Signal — tactile controls](SIGNAL-COMPONENTS.md) defines the button states, list hierarchy and related components around the [controls workbench](../web/design-aesthetic.html#controls). Raised buttons use a shallow face, top highlight and small lower lip; inputs are inset, while records stay flat within a shared tray. The light control/row/panel/feature radius roles are adopted in Atlas; the guide identifies remaining specimen-only interactions and future components.

Use three roles: the outer canvas, the working surface and floating context such as an open menu. Rows and facts remain flat inside their parent surface. Draw shared boundaries once. A shadow identifies a raised region; it does not surround every item. On dark surfaces, separation also comes from luminance and a restrained edge because a shadow alone has limited visibility.

## The feature graphic family

Every pilot uses the same orthographic three-quarter camera, a soft top-left studio light, controlled neutral materials and one cobalt activity piece. Keep the model centred with ample clear space. Use a similar apparent scale and baseline across the family. No text is embedded in the object; labels remain accessible interface text.

The shipped raster pilot uses **opaque porcelain-white presentation panels**. The white canvas is an intentional part of each composition and remains white in both UI themes. Editable feature SVGs are background-free, providing the flexible symbols for navigation and smaller placements. Future raster cutouts are a separate asset variant and require clean-matte inspection before acceptance.

| Feature | Core construction | Meaning carried by the form | Preserve |
| --- | --- | --- | --- |
| MCP | Two matching modules with a precise coupling | Context can pass through an intentional interface | Exactly two main halves; a legible joint and one active contact |
| Treemap | A bounded plate divided into fitted rectangular cells | One space is partitioned into interpretable parts | One outer boundary; one highlighted cell; visibly shared partition geometry |
| Search, rankings and list | An indexed stack with one withdrawn record | A record can be found, selected and inspected | Parallel records, consistent spacing and one selected plane |
| Knowledge graph | A sparse junction of entities and connections | A selected entity has distinct relationships | Few readable nodes; one selected node; clear links and open space |

The art is a feature metaphor. Its tile areas, record order and connections are illustrative, not a data encoding. Live treemaps, rankings and networks continue to use deterministic geometry, labels and actual research records.

### Asset tiers and placement

| Tier | Source and scale | Where it belongs | Rules |
| --- | --- | --- | --- |
| Feature symbol | Four background-free editable SVGs, each drawn on a 24-unit grid and previewed at 24px and 48px | Compact navigation, tabs, feature-menu rows and introductions | Monochrome or one meaningful accent; preserve the feature silhouette; pair with a label |
| Rendered feature object | Opaque porcelain-white raster panel, normally at least 1024px | Menu preview, feature header, explanatory panel | One coherent object and ample white space; retain the complete panel in both UI themes |
| Composition study | Generated or coded wider view | Aesthetic review and header/menu direction | Label as a study; retain editable live text in the coded composition |

The pilot uses one canonical 24-unit drawing per feature in [atlas-feature-symbols.js](../web/atlas-feature-symbols.js), resized for the 24px and 48px previews. An independently redrawn 48px family, with separate optical spacing and detail, is a possible future production extension. Utility actions such as close, back, copy and external navigation continue to use clear functional icons.

Compact menu placements can use an 80–120px rendered panel when its silhouette remains clear; an expanded preview can give it 240–400px of breathing room. Headers use a 240–480px composition with text in a separate column. These ranges describe display intent, not a fixed bitmap crop. Preserve the panel's whitespace and the feature's full silhouette. Its surrounding art surface stays white in both themes; do not invert the raster or blend away its background. Use the background-free SVG when the artwork needs to sit directly on a themed surface.

## Navigation, headers and reading order

The feature menu has one clear list of MCP, treemap, search/list and knowledge graph. Each item provides its mark, name and a short description. A larger preview reinforces the selected item. Opening the menu is a deliberate action; mouse hover can enhance an already usable keyboard and touch flow.

Keep preview selection and destination navigation unambiguous. A preview control changes the example. A named link opens a real feature route. In a direction workbench, controls that only alter the sample should say so through the surrounding context. A pictured MCP coupling must never be used as a live connection-status indicator.

An open menu supports Escape, a clear close action and predictable focus return. Selection is visible in text or structure as well as colour. On narrow screens, put the feature list first and the selected preview beneath it; avoid squeezing the desktop columns into unreadable miniatures.

A feature header leads with its name and user job, then a short explanation and one useful next action. The graphic supports that content. Actual record results, measures and source context appear in the appropriate working view. The same content should remain comprehensible if the illustration fails to load.

## States and evidence boundaries

| State | Required direction |
| --- | --- |
| Ready | Clear feature identity, readable description and an appropriate action |
| Hover | Small surface or edge change; avoid moving neighbouring content |
| Selected | Stable selected marker, a labelled preview and visible keyboard focus when applicable |
| Loading | Preserve layout; name the work; do not imply a successful connection or completed search |
| Empty | Explain what can be done next, using the actual query or feature context |
| Partial or unknown | Keep researched facts separate from unavailable fields; unknown is not zero |
| Failed | Retain useful context and give a specific retry or recovery action |
| Narrow | Preserve label → description → action → supporting graphic reading order |
| Reduced motion | Use the complete static state; selection and feedback remain visible |

MCP status comes from a confirmed connection result. Search relevance and rankings must name the measure and sorting rule. A treemap requires a comparable measure, units and treatment of missing observations. Graph edges need a recorded relationship and accessible source context. None of these facts can be supplied by a decorative graphic.

## Motion language

Both systems use 140ms for quick feedback and 240ms for contextual transitions. The workbench uses `cubic-bezier(.2,.7,.2,1)`; operational Atlas retains `cubic-bezier(.2,.8,.2,1)`. Use short transform or opacity transitions and avoid dimensions that reflow the interface. Reduced motion sets the duration roles to zero and removes pressure travel while retaining the selected/focus state.

| Feature | Optional motion operation | Static reduced-motion state |
| --- | --- | --- |
| MCP | Two modules align and meet at their coupling | The complete coupled form |
| Treemap | The selected tile separates slightly from the plate | A clearly marked tile within the partition |
| Search/list | One record moves a short distance into the selected position | A withdrawn or marked record |
| Knowledge graph | Immediate connections reveal from the selected node | All meaningful pilot connections visible |

Motion follows user input and can be interrupted. A decorative demonstration can make one short pass; there is no need for an endless pulsing network. Changes in orientation must preserve the shared camera and keep the feature recognisable. Follow the [Vercel motion guidance](https://vercel.com/design/guidelines#animations) for reduced motion, explicit animated properties and correct transform origins.

## Repeatable generation recipe

The accepted pilot images establish the material and camera reference for subsequent assets. The [aesthetic manifest](../web/design-aesthetic-data.js) stores the exact prompts and reference metadata; each revision should also record its input images and edit prompt. The recipe below is a reusable direction brief; it is not a claim that every word was used verbatim for every pilot.

### Master brief

```text
Use case: stylized-concept.
Asset type: original feature object on an opaque porcelain-white presentation
panel for the Startup Atlas Signal direction.
Subject: [FEATURE CONSTRUCTION AND OPERATION].
Create a precise, recognisable research instrument using satin aluminium,
porcelain and graphite. Use clean manufactured planes, fine chamfered edges
and plausible joins. One cobalt piece identifies the active element.
Match the accepted Signal pilot's orthographic three-quarter camera,
apparent scale, soft top-left studio illumination and restrained shading.
Keep a clear silhouette and ample empty white space around the entire object.
Render the complete composition on an opaque porcelain-white canvas.
The white panel is part of the artwork and is displayed unchanged within
both light and dark interfaces. Use natural self-occlusion on the object;
avoid a broad floor shadow, horizon, scenery or background gradient.
No transparency, checkerboard, text, logo, watermark, UI chrome,
real company records or quantitative data.
Preserve the feature's distinguishing geometry. Avoid diffuse neon glow,
glass haze, decorative circuitry, extra objects and miniature labels.
```

### Feature variables

| Feature | Substitute into the master brief | Reject an output when |
| --- | --- | --- |
| MCP | Two complementary modules aligned at a precise coupling; one active contact makes their relationship legible. | It becomes an unrelated single cube, adds a third main module or loses the interface between the halves. |
| Treemap | One bounded plate partitioned into fitted rectangular cells; one cobalt tile is the active part. | The cells become an arbitrary skyline, overlapping bars or a chart implying actual values. |
| Search/list | A parallel indexed stack of records with one cobalt selected record withdrawn slightly. | The stack loses its parallel order, gains fictional labels or becomes a financial growth chart. |
| Knowledge graph | A sparse junction with one cobalt selected node and a few clearly connected neutral nodes. | It becomes a dense orbital globe, obscures its links or appears to encode actual company relationships. |

Generate one pilot per feature and review the family together. A targeted edit should preserve camera, material, scale and all accepted geometry while naming the one requested change. Expand to another placement only after the four silhouettes and the common construction work in the menu and header previews.

## Naming, provenance and release discipline

The pilot uses stable feature IDs: `mcp`, `treemap`, `search` and `graph`, with descriptive filenames. For future revisions, add explicit direction, tier and version fields to the manifest, create versioned asset entries and record each source image and edit prompt. Keep original generated masters available for future crops or refinements.

Record the file path, alt text, intended placements, dimensions, background treatment, exact prompt, reference image IDs, creation date and content checksum. For the raster pilot, record an opaque panel and its porcelain-white canvas. A thumbnail has its own path and dimensions and retains the same background treatment. Keep the white presentation surface when encoding WebP previews. Background-free SVG symbols remain editable. Reference-site images serve as attributed research, not distributable Atlas kit assets.

Before accepting a family revision, review all four objects together and at their real placements. Check silhouette, relative scale, camera, light, edge treatment and the single active piece. Inspect the opaque panels for clean object boundaries, consistent white canvases and generous uncropped margins, then review them inside both UI themes. Review small symbols at 24px and 48px, long menu labels, narrow layout, focus, selected state and reduced motion. Confirm that every download corresponds to the displayed version and that the prompt/provenance record accompanies the kit. The published pilot contains accepted opaque panels and background-free SVG symbols.

Any future raster cutout needs a separate transparent master and provenance entry. Inspect its alpha and edge colours on white, graphite and a checkerboard at full size and at its intended display size. Reject white or blue fringes, background remnants, lost thin connections, accidental holes and opaque rectangular patches. Preserve verified alpha during encoding and inspect the encoded file again. A cutout only enters the published catalogue after it passes this clean-matte review; the accepted panel remains available as its own placement variant.

## Self-hosted typography

The pilot includes unmodified variable WOFF2 files from the official [vercel/geist-font v1.9.2 release](https://github.com/vercel/geist-font/releases/tag/v1.9.2). Both expose a `wght` axis from 100 to 900. The font binaries identify Geist Sans internally as version 1.800 and Geist Mono as version 1.700; those internal versions differ from the release-bundle version.

Files live in [web/assets/fonts](../web/assets/fonts/sources.json): `geist-sans-variable.woff2` and `geist-mono-variable.woff2`, accompanied by the upstream `LICENSE.txt`, `OFL.txt` and a `sources.json` record. That record captures source URLs, byte counts, Git blob IDs, SHA-256 checksums and decoded font metadata. The upstream copyright and SIL Open Font License notices travel with the fonts in the downloadable kit.

The CSS uses `font-display: swap`, explicit normal style and the 100–900 weight range. These local assets do not require a new frontend package or a third-party font request. See the [official Geist font page](https://vercel.com/font) for its distribution and typeface rationale.

## Further asset development

Light Signal is the operational baseline. Continue evaluating dark materials and new asset placements in the workbench before broadening runtime scope. Extend the accepted feature family to additional headers, empty states and navigation placements with the same silhouette, camera and material rules, carrying exact prompts and reusable symbols into the design kit. Preserve the original studies and pilot provenance rather than rewriting them as screenshots of the current product.
