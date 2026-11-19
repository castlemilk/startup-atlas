---
version: alpha
name: "Startup Atlas"
description: "Source-backed startup research with an editorial explorer and Signal design reference."
colors:
  primary: "#111318"
  action: "#315efb"
  canvas: "#fafafc"
  paper: "#fafafc"
  surface: "#ffffff"
  border: "#dfe3e8"
  textMuted: "#626975"
  accent: "#315efb"
  selection: "#eef2ff"
  focus: "#315efb"
  startup: "#3156ae"
  partner: "#6251a7"
  person: "#86501f"
  programme: "#855e18"
  provider: "#21677a"
typography:
  display:
    fontFamily: "Atlas Geist, Helvetica Neue, Arial, sans-serif"
  interface:
    fontFamily: "Atlas Geist, system-ui, -apple-system, Segoe UI, sans-serif"
  utility:
    fontFamily: "Atlas Geist Mono, ui-monospace, SFMono-Regular, Consolas, monospace"
rounded:
  control: "10px"
  row: "12px"
  panel: "18px"
  feature: "24px"
spacing:
  page-max: "1640px"
  graph-gap: "14px"
  scale: "4px 8px 12px 16px 24px 32px 48px"
---

# Startup Atlas design context

## Overview

Startup Atlas is an open research guide for founders exploring programmes, people, companies and the organisations that connect them. The research routes use an editorial finish from the Stitch studies: warm paper, deep forest navigation, rust selection and serif display type. Self-hosted Geist Sans and Geist Mono remain the interface and data faces. The design reference keeps its light Signal foundations and embeds the operational routes as live previews.

The current site is English-language and has desktop and mobile layouts. Global browsing is supported; location does not imply programme eligibility. The shared system now connects list/search, treemap, graph, startup and partner/VC views. [UX-CONTRACT.md](UX-CONTRACT.md) owns interaction rules and migration gaps; [explorer view specifications](docs/EXPLORER-VIEWS.md) describe detailed layouts, data requirements and subsequent work.

### Accepted wireframe reference

The five interface wireframes establish visual hierarchy and composition. The Stitch editorial directory, knowledge graph, treemap and entity studies inform type, colour and surface density. The ranked treemap uses the original logo-board composition with the ranked figures, compact controls and conditional marks. These references share a masthead, deliberate identity placement and adjacent evidence.

| Wireframe | Accepted composition |
| --- | --- |
| [01 · List & search](web/assets/design-lab/01-list-search.webp) | Search and scope above ruled results, with explicit inspection beside the list. |
| [02 · Treemap](web/assets/design-lab/02-treemap.webp) | Measure and coverage above the chart, with a company/figure evidence rail. |
| [03 · Graph](web/assets/design-lab/03-graph.webp) | One compact exploration workspace, dark root identity and an adjoining inspection rail. |
| [04 · Startup](web/assets/design-lab/04-startup.webp) | Founder-first company dossier, aligned facts and chronology, and a top-aligned source rail. |
| [05 · Partner / VC](web/assets/design-lab/05-partner.webp) | Full identity band, company-sample exploration with selection detail, and people/evidence alongside it. |

The wireframes guide composition and [UX-CONTRACT.md](UX-CONTRACT.md) governs behaviour. Reviewed source records supply names, amounts, dates and relationships. The concept screens illustrate appearance, including controls and numbers from a fictional dataset. Production views use real evidence and existing interactions.

## Runtime ownership and mapping

This is an **existing runtime canonical** system. [web/design-tokens.css](web/design-tokens.css) owns the Signal defaults described by the front matter and the tables below. [web/atlas-ui.css](web/atlas-ui.css) scopes the editorial overrides to the directory, treemap, graph, entity and partner documents. The overridden values flow through the shared and route components. Change durable visual decisions in their owning stylesheet and this document.

| Explorer role | Runtime value |
| --- | --- |
| Paper, canvas, working surface | `#fcf9f2`, `#f7f4ed`, `#fffefa` |
| Text, muted text | `#122b22`, `#535f55` |
| Action and focus, hover, selection wash | `#a23e18`, `#7d2d13`, `#f8ece1` |
| Panel rules, control boundaries, control tray | `#dfd9cd`, `#88877b`, `#eeebe2` |
| Display type | Georgia, Times New Roman, serif |
| Control, row, panel and feature radii | 6px, 7px, 9px and 10px |

| Layer | Owner | Responsibility |
| --- | --- | --- |
| Foundations | `web/design-tokens.css` | Palette, type families/scale, spacing, radii, layout references, motion, overlay shadow and scrollbar colours. |
| Shared presentation | `web/atlas-ui.css` | Operational masthead, actions, entity badges, view/section navigation, coverage, emptiness, search clear, inspectable directory rows, selection/focus and global scrollbar treatment. |
| Shared behaviour/rendering | `web/atlas-ui.js` | `icon`, `entityBadge`, `renderEntityRow`, `renderViewNavigation`, `renderAtlasMasthead`, `safeAtlasReturn`, optional interaction motion and section/navigation/clear/return-context helpers. |
| UI SDK integration | `web/atlas-sdk.js`, `web/atlas-sdk.css` | Web Component behaviour, native state adapters, dynamic controls and local agent access; see [UI-SDK.md](docs/UI-SDK.md). |
| Domain composition | `web/directory.css`, `web/graph.css`, `web/treemap.css`, `web/entity.css`, `web/profile.css` | Wireframe-derived result/inspector geometry, visualization workspaces and profile dossiers. Route controllers own inspection; common visual values consume Atlas tokens. |
| Catalogue | `web/design-system.html`, `web/design-system.css`, `web/design-system.js` | Connected implementation reference, live view previews, foundations and sourced research examples. |
| Component reference | `web/design-component-specs.js`, `web/design-workbench.js`, `web/design-workbench.css` | Nine selectable recipes, canonical owner mapping, fictional interactive specimens and current-markup copy/download. |
| Token reference | `web/design-token-reference.js`, `web/design-token-reference.css` | Metadata for all canonical tokens; computed runtime values, grouped search, contrast comparisons and explicitly labelled snapshot exports. |
| Composition recipes | `web/design-recipes.js`, `web/design-recipes.css` | Five responsive structural diagrams, region ownership, scroll and data boundaries, and static HTML handoff scaffolds. |
| Visual design lab | `web/design-lab.html`, `web/design-lab.css`, `web/design-lab.js`, `web/design-concepts.js` | Generated concept gallery, accessible image review, shared runtime palette and an explicitly fictional component playground. |

The compatibility aliases in the token stylesheet are `--ink → --atlas-ink`, `--muted → --atlas-muted`, `--line → --atlas-border`, `--focus → --atlas-focus`, `--navy → --atlas-ink` and `--blue → --atlas-action`. They bridge older static styles; new components use `--atlas-*` directly. Existing CSS files still contain some route-specific literals, particularly treemap colours and graph annotation fills. Those are migration work, not additional canonical palettes. Do not duplicate them into new controls.

The shared stylesheet follows the established route styles where its primitives/adapters need to take precedence; route-specific catalogue composition may follow it. Verify computed styles rather than assuming a token declaration defeats a more specific legacy rule. There is no Tailwind or React theme provider. The reference can export computed JSON/CSS snapshots, including the current motion preference; these exports do not replace the canonical stylesheet or its media rules.

## Colors

Graphite carries primary text, the masthead and the graph root. Porcelain is the light page canvas; white panels contain working results, charts and dossiers. Neutral wells and quiet source rails establish adjacent context. Cobalt identifies actions, selected inspection and keyboard focus. Entity colours remain categorical and do not communicate verification or investment performance.

| Runtime token | Exact value | Use |
| --- | --- | --- |
| `--atlas-ink` | `#111318` | Primary text, graphite header and graph root identity. |
| `--atlas-action` | `#315efb` | Primary action and source/navigation links. |
| `--atlas-action-hover` | `#2349d9` | Primary action hover. |
| `--atlas-muted` | `#626975` | Supporting copy, metadata and placeholders. Replaces the lighter former text value. |
| `--atlas-canvas` | `#fafafc` | Porcelain working canvas. |
| `--atlas-paper` | `#fafafc` | Light page and evidence canvas; retained as a distinct compatibility role. |
| `--atlas-surface` | `#ffffff` | Content panels and controls. |
| `--atlas-border` | `#dfe3e8` | Quiet separators and panel boundaries. |
| `--atlas-border-strong` | `#7d899b` | Control boundaries and stronger rules. |
| `--atlas-soft` | `#f0f2f6` | Hover, grouped controls and quiet selected context. |
| `--atlas-accent` | `#315efb` | Cobalt active-route/section emphasis, inspected outlines and highlighted profile destinations. |
| `--atlas-selection-soft` | `#eef2ff` | Pale cobalt fill for inspected rows, paired with a contrasting outline/marker and explicit state. |
| `--atlas-focus` | `#315efb` | Keyboard focus, kept distinct from category meaning. |
| `--atlas-on-action` | `#ffffff` | Text on dark action/navigation surfaces. |

### Categorical and state pairs

Dark categorical colours are for text/marks; their pale partners are backgrounds. A muted pastel that works as an avatar fill is not automatically suitable for small text. Entity kind always appears in text, and the connection list repeats graph meaning independently of colour.

| Meaning | Foreground token and value | Background token and value |
| --- | --- | --- |
| Startup | `--atlas-startup: #3156ae` | `--atlas-startup-soft: #eaf0ff` |
| Partner | `--atlas-partner: #6251a7` | `--atlas-partner-soft: #f0edfc` |
| Person | `--atlas-person: #86501f` | `--atlas-person-soft: #f9eedf` |
| Programme | `--atlas-programme: #855e18` | `--atlas-programme-soft: #faf0db` |
| Provider | `--atlas-provider: #21677a` | `--atlas-provider-soft: #e6f3f6` |
| Warning/partial data | `--atlas-warning: #855c14` | `--atlas-warning-soft: #faf0db` |
| Error/unavailable | `--atlas-danger: #ad3b39` | `--atlas-danger-soft: #fceceb` |

Keep entity kind separate from research status and chart measure. A programme's ochre colour is not a warning; a startup badge is not verification or positive investment performance. Treemap group colour names the recorded grouping, while area expresses the selected measure.

## Typography

Self-hosted Geist Sans carries the wordmark, headings, entity names, controls and research copy. The hierarchy preserves the wireframes while replacing their original serif material. Geist Mono carries commands, token names, dates and compact data annotations. Numerical comparisons and coverage counts use tabular figures. Font assets and their upstream licence/provenance are included under `web/assets/fonts`.

| Token | Exact runtime value | Role |
| --- | --- | --- |
| `--atlas-font-display` | `"Atlas Geist", "Helvetica Neue", Arial, sans-serif` | Wordmark, page/section headings, prominent entity/row/card names and narrative statements. |
| `--atlas-font-body` | `"Atlas Geist", system-ui, -apple-system, "Segoe UI", sans-serif` | Interface and research content. |
| `--atlas-font-mono` | `"Atlas Geist Mono", ui-monospace, SFMono-Regular, Consolas, monospace` | Commands, token/code specimens, dates and compact numerical annotations. |
| `--atlas-text-xs` | `0.75rem` | Compact coverage and secondary navigation. |
| `--atlas-text-sm` | `0.8125rem` | Controls and compact metadata. |
| `--atlas-text-md` | `0.9375rem` | Standard entity/interface text. |
| `--atlas-text-lg` | `1.125rem` | More spacious supporting text. |

At a 16px root size the shared interface scale is 12/13/15/18px. Route styles compose this into responsive page headings, compact entity names and readable evidence. Directory names use 18px; profile relationship names use 16px; graph card names use 18px with a 21px root name. Profile section titles use 22px and source-rail headings 18px. Introductions use 15px Geist Sans with generous line height. Exact responsive heading sizes remain with the route styles.

### Density

The operational views use a compact research density; the microsite density switch remains a specimen control. Primary interface actions, Inspect buttons and masthead links have 44px minimum targets. Directory rows retain 18px vertical/12px horizontal padding, a 48px identity column and 16px gaps at desktop widths. Profile facts use 15px vertical padding, relationship rows 16px, and major dossier sections approximately 28–32px separation. Narrow layouts preserve complete names, descriptions, evidence and separate inspection/navigation actions.

Small badge text and graph annotations are supplementary. Core names, actions and sources remain reachable in readable list/profile alternatives. Do not truncate the accessible entity name when a graph card wraps its visible label, and do not use tiny type to force a large network into one screen.

## Layout

The operational views share a 1640px maximum shell. Their panel arrangements follow the five wireframes and retain route-specific reading order.

Directory, Map/List and Graph use a compact ruled introduction so search and working content start higher. Treemap Cards starts with the selected measure, coverage and the existing ranked board rule. The Signal symbols remain in navigation. Profile headers keep the record identity in view and a common source-document symbol identifies the source section.

| View | Wide composition | Responsive changes |
| --- | --- | --- |
| List & search | Flexible results, 350px inspector and 22px gap inside one research panel. | Inspector reduces to 310px at 1200px; stacks at 900px. Other directory scopes retain their list layouts. |
| Treemap | Flexible chart/list and 350px evidence rail. | Rail reduces to 310px at 1200px; stacks at 820px. |
| Graph | Flexible network and 360px inspector, with a 14px gap between working surfaces. | Inspector reduces to 300px at 1150px; stacks at 820px. |
| Startup dossier | Flexible white dossier beside a 320px neutral sources rail, with 24px gap. | Facts/funding and hero actions stack at 1250px; evidence follows the dossier at 1000px. |
| Partner / VC dossier | Full identity band, flexible company panel and 320px people/evidence rail, with 24px gap. | Inner company inspector stacks at 1200px; the outer rail stacks at 1000px. |

The compact profile treatment applies at 600px. Startup facts and funding chronology share the wide overview only when sufficient reading width is available. Profile reading remains in document flow; selected-company inspection does not introduce a nested full-page scroller.

| Token group | Exact mapping |
| --- | --- |
| Spacing | `--atlas-space-1: 4px`, `--atlas-space-2: 8px`, `--atlas-space-3: 12px`, `--atlas-space-4: 16px`, `--atlas-space-6: 24px`, `--atlas-space-8: 32px`, `--atlas-space-12: 48px` |
| Page and graph inspector | `--atlas-page-max: 1640px`, `--atlas-panel-width: 360px`; other rail widths are documented route geometry. |
| Corners | `--atlas-radius-control: 10px`, `--atlas-radius-row: 12px`, `--atlas-radius-panel: 18px`, `--atlas-radius-feature: 24px` |

Keep search, depth, filters, zoom, profile navigation and equivalent lists usable at narrow widths. View navigation wraps; profile section links stay normal anchors. The document owns page scrolling. Only the visualization or bounded list owns its internal overflow. The graph may be panned and zoomed without trapping page scroll outside its canvas.

The shared scrollbar baseline applies to application-owned overflow regions. It uses `--atlas-scroll-thumb: #929aa8`, `--atlas-scroll-hover: #6f7989`, `--atlas-scroll-active: #505c70` and `--atlas-scroll-track: #f0f2f6`. The engine fallback is 10px wide with a 2px track-coloured inset; standards-based styling uses a thin scrollbar. Forced colours return scrollbar colour to `auto`. Do not hide scrollbars to simplify a screenshot.

## Elevation & Depth

Use shallow, role-based elevation: raised actions, inset input wells, restrained panel depth and a stronger floating-overlay shadow. Neutral faces run from `--atlas-face-top: #ffffff` to `--atlas-face-bottom: #e9edf3`; primary faces use `--atlas-action-top: #315efb`, `--atlas-action-bottom: #2349d9` and `--atlas-action-border: #2448c5`. `--atlas-shadow-control`, `--atlas-shadow-inset`, `--atlas-shadow-pressed`, `--atlas-shadow-panel` and `--atlas-shadow-overlay` own the exact material recipes in canonical CSS.

The graph root has a graphite fill and light name; inspection has a cobalt outline; keyboard focus retains a separate dashed treatment. Directory and partner selection combines pale cobalt fill with a contrasting outline/marker and explicit state on the Inspect action. Root, selection and focus remain distinct. Press feedback moves a control face 1px without reflowing its neighbours; reduced motion removes the travel.

Cluster shapes are quiet spatial context, not evidence of new relationships. Graph labels and connected paths remain readable during interaction; do not obscure them with decorative depth, glow or large atmospheric effects.

## Shapes

Panels use soft rectangular corners, controls use tighter corners, and avatars and node ports are circular. Source-backed edges use restrained curved lines.

Entity badges use small categorical marks, with the person mark circular. Company logos retain their own aspect ratio in stable frames. A fallback initial is a neutral identity aid, not a generated approximation of an organisation's real logo.

## Components

### Shared primitives

| Primitive | Normative use |
| --- | --- |
| `renderAtlasMasthead` / `.atlas-masthead` | One graphite operational masthead with the four-diamond mark, Geist wordmark and a single real-route navigation row. Embedded previews hide surrounding route chrome. |
| `.atlas-view-nav` | Real links for **List & search**, **Treemap**, **Graph** and the design catalogue. Current route uses `aria-current="page"`; these are not ARIA tabs. |
| `.atlas-section-nav` | Anchors to real profile headings. All sections remain in document flow; shared progressive scroll tracking exposes `aria-current="location"` with a cobalt underline. |
| `.atlas-button` / `.atlas-button-primary` / `.atlas-button-accent` | Neutral raised actions and cobalt primary/profile-destination emphasis. Native button for an operation, anchor for a destination. |
| `.atlas-badge[data-kind]` | Named entity kind with a categorical foreground/background pair. `data-tone` represents warning/error separately. |
| `.atlas-coverage` | Readable researched/available counts and uncertainty, with emphasized tabular figures. |
| `.atlas-empty` | Specific no-results, unresearched, partial, unavailable or loading content; preserve the difference in copy. |
| `.atlas-clear` and `[data-atlas-clear-for]` | One accessible clear action tied to a real input. Clear dispatches the route input update and restores focus. |
| `renderEntityRow` | Shared directory/specimen renderer for identity, summary, recorded connection count, source, kind and graph destination. Its `inspectable` option adds a native Inspect button and selected-row state; the directory owns actual inspection. |

Operational single-choice selectors use ui-sdk Select with native backing `<select>` elements. The adapter preserves existing IDs, values and change events; route controllers retain data and URL ownership. Directory scope and treemap presentation use Segmented Control; treemap Figure/Company panels use Tabs. Search/clear and dynamic actions use the corresponding SDK components. [The SDK contract](docs/UI-SDK.md) defines keyboard, focus, native-state synchronization and agent acceptance.

### Control states

| State | Treatment and behaviour |
| --- | --- |
| Default | Clear hierarchy, visible boundary where needed, correct native action/link semantics. |
| Hover | Neutral actions/navigation receive the soft surface; primary actions use action-hover. Pointer targets get a pointer cursor. |
| Focus | Shared `:focus-visible` outline is 3px with 3px offset. Dark-header links use the white on-action colour for contrast; other shared controls use the focus token. Visualization controls may use a visible in-frame equivalent where an outside outline would be clipped. Never remove focus without a replacement. |
| Pressed/selected | Neutral button press depresses its face and uses the pressed shadow; persistent controls expose their checked/selected/pressed semantics. Graph inspection is distinct from graph root. |
| Disabled | Muted text, soft surface, reduced opacity and non-action cursor; prevent the action in native behaviour/handlers. `aria-disabled` styling alone does not disable a link. Explain a nonobvious unavailable action in visible context. |
| Busy | Preserve control/content geometry and communicate loading through the owning status region. Do not introduce a second ad-hoc spinner system. |
| Error/partial | Specific explanation and reachable recovery, with warning/error tones where helpful. Missing research is neither a zero value nor an error. |

### Navigation and profile continuity

Shared `[data-atlas-view]` links carry the current query to the next view, and graph navigation can retain a known entity context. Query propagation does not imply identical matching rules or full filter transfer across all views. The directory records the displayed result range as `shown`: 12 is the default; a valid integer greater than 12 is restored up to 1200. Filtering resets the range. Do not promise exact scroll restoration.

Internal profile entry links capture their return route in per-tab `sessionStorage`. `safeAtlasReturn` accepts only the same origin/deployment directory and an explicit public-route allowlist. Return links retain supported query/filter/range state; direct entries and unavailable storage keep stable fallback links. This is navigation context, not an account or saved research workspace.

Startup profiles lead with identity, coverage and founders, then company facts, actual funding-event chronology and connections; sources align beside the whole dossier on wide screens and follow it on narrow screens. Funding chronology does not invent broader company milestones. Partner profiles use the sourced organisation type and lead with a researched company sample and adjacent selected-company inspector. People and sources occupy the outer rail; programmes/supporters remain in document flow. Historical qualifiers stay close to claims. A sample is not the full portfolio, and a portfolio listing is not a round investment.

Directory and partner company rows separate **Inspect** from profile/source navigation. Inspection is one transient local selection, not bulk selection or a saved research list. Directory selection clears when its record leaves the displayed result set; Close returns focus to its Inspect button when available. Narrow inspection focuses the detail heading. The partner inspector repeats only recorded identity, relationship, evidence and real profile/graph destinations. The treemap inspector uses genuine Figure/Company tabs to separate the plotted observation from sourced company context.

### Graph inspection and movement

Click or Enter/Space inspects a visible node without reconstructing the network. **Explore from here** explicitly changes root; choosing a search result starts a new root neighbourhood. An inspected related entity that is not in the rendered map is labelled **Outside current map**. **Open profile** remains a real link. The connection list exposes the same visible relationships with sources.

Graph cards support pointer dragging and arrow-key movement. **Fit view** changes the camera without clearing positions; **Reset layout** clears manual placement and restores the automatic arrangement. A capped neighbourhood discloses that it is limited. Root/selection, depth, types, query and list visibility have route state; persistent camera/pin arrangements across reload are future work.

### Motion

The shared motion tokens are `--atlas-duration-fast: 140ms`, `--atlas-duration-normal: 240ms` and `--atlas-ease: cubic-bezier(.2,.8,.2,1)`. Controls use short colour/surface transitions. Graph force movement serves spacing and exploration, not ambience. Under reduced motion, the duration tokens become `0ms`, shared control transitions stop and the graph reaches its settled result without prolonged animation. Preserve every action and final state.

After explicit Graph selection, the inspector identity and its visible connections acknowledge the new selection. A Treemap metric or grouping change can move visible tiles from their prior positions or fade in new tiles. These short enhancements use the existing self-hosted GSAP core after interaction. The route updates immediately and remains usable without the runtime. Reduced motion, document hiding and interrupted updates settle without leaving temporary styles behind.

## Living catalogue and review

[web/design-system.html](web/design-system.html) is the working catalogue for this system. Its five pattern tabs embed the real directory, treemap, graph, startup and partner routes from the same build with `embed=1`; they are not separately maintained screenshots. The embed mode removes surrounding discovery/navigation chrome for focused review. **Open full view** reaches the operational page.

The catalogue offers a full-width desktop preview and a nominal 390px mobile preview, constrained to its container. `pattern` and `device` query parameters make the chosen preview shareable. Pattern tabs use tab semantics and Arrow/Home/End keyboard navigation; route navigation retains link semantics.

Foundation swatches read the runtime CSS values. The **Sourced examples** section reads entity rows, facts/relationships and coverage from the published snapshot through `openGraph`, including its JSON fallback. The component workbench uses explicitly fictional records. Loading, no-results, partial and unavailable examples are labelled **specimens**; their controls demonstrate states rather than claim to retry a real request. Planned comparison is a disabled catalogue specimen, not a working product capability.

### Implementation workbench

The working reference shares the microsite navigation and canonical Signal foundations, while preserving historical direction studies as labelled artwork. A task index and section navigation connect the component workbench, live views, composition recipes, foundations, sourced examples and handoff guidance. The reference remains usable when the research snapshot fails to load.

The nine component entries cover actions, entity badges, entity rows, search/clear, source disclosure, claims/coverage, relationships, research states and view navigation. Shared primitives use the existing renderers and CSS. Higher-level specimens are labelled compositions and name their behaviour owner. Fictional profile links open local specimen details; the navigation specimen clearly links to operational routes. Copy and download follow the current preview markup, including local state changes. The downloaded fragment names its CSS and behaviour dependencies and does not claim to be a standalone explorer. [The component guide](docs/COMPONENTS.md) records this boundary.

All 65 canonical `--atlas-*` tokens appear across nine searchable families. Metadata owns purpose and grouping only; displayed and exported values come from computed CSS. The colour-pair checker keeps its pass/fail result outside the sampled colours so poor combinations remain readable. It reports text and meaningful-mark thresholds independently using the unrounded ratio; it is not a page-level accessibility certification. Reduced-motion changes update the displayed durations and exports. [The token guide](docs/TOKENS.md) explains snapshot scope and the authoritative colour formula.

Five composition recipes define semantic regions, current owners, responsive reading order, scroll ownership and data boundaries. Region selection reveals an annotation; the diagram is not a miniature product. Wide/narrow modes describe composition while the five live iframes remain the operational reference. Downloaded HTML scaffolds provide static labelled regions and canonical CSS links; research loading and interactions remain with the existing route owner. [The assembly guide](docs/IMPLEMENTATION-RECIPES.md) captures current breakpoints and outstanding work.

Controls follow the existing compact interface density. Source code uses the utility typeface in bounded, visible scroll regions; names and usage guidance wrap. Catalogue-only native selectors retain platform popup behaviour; operational route selectors use the SDK adapter. Narrow layouts put the catalogue choices before the inspector and move component selection focus to its heading. Every search has immediate clear/reset, every copy has a visible selectable fallback, and all downloads reflect the inspected state or explicitly state that they include the full token set.

When changing a common component, review both its specimen and an operational route. Check desktop/narrow layouts, actual SDK/native selectors, keyboard focus, broken media, long names, missing data, reduced motion and the profile return journey. The catalogue is a shared inspection surface; it does not replace browser checks or establish that a particular revision has deployed. Keep factual UI and visual implementation separate from source-data enrichment.

## Visual design lab

[web/design-lab.html](web/design-lab.html) is an image-led microsite for the five explorer studies. It uses the same runtime tokens and shared buttons/badges, with an editorial hero, numbered gallery, view briefs and component bench. Search, view filtering and the open study are shareable URL state. A native dialog provides full-image review, previous/next navigation, keyboard controls, downloads and the exact generation brief. Closing restores the invoking control.

The five interface studies define accepted composition; their original forest/serif finish is historical, and their example records, quantitative geometry and relationships remain fictional. They do not establish available functionality or research facts. Each links to its implemented Atlas route and catalogue pattern. Palette values are read from canonical CSS and copied with visible success or manual fallback. Density, entity type, selection and loading/empty/partial/error examples affect only the local specimen. Asset provenance and boundaries are recorded in [docs/DESIGN-LAB.md](docs/DESIGN-LAB.md). [The browser checks](scripts/test-design-lab-browser.mjs) cover gallery images, dialog, URL state, copy feedback and narrow layouts.

## Direction handbook and asset library

[The direction handbook](web/design-direction.html) preserves the original field-guide exploration with five applied principles, six brand anatomy sections, voice examples, measured motion and responsive specimens, and detailed playbooks for all five views. [Its full text](docs/DESIGN-DIRECTION.md) records current behaviour separately from proposed next work. The generated boards explore composition; canonical geometry, colour values and behaviour remain in runtime CSS, SVGs and operational views.

[The asset library](web/design-assets.html) brings the five interface concepts together with two direction boards and three transparent editorial illustrations. Every image has measured dimensions, full and thumbnail files, usage guidance, descriptive alt text and the exact generation prompt. Preserve transparency and the full image composition. The discover, connect and evidence illustrations belong at section openings and explanatory moments, away from data marks and dense controls.

`web/atlas-icons.js` is the canonical utility icon registry. It extends the original ten paths to 32 authored SVG marks, with a 24 × 24 viewBox, no fill, round caps/joins, default 1.65 stroke and inherited currentColor. `atlas-ui.icon` delegates to this registry. Existing unknown-name arrow fallback is preserved. The icon workbench supports 16/24/32/48px previews, three stroke options, token colours and contrasting backgrounds; copy and download use the same safe standalone export. Keep small utility icons distinct from engraved raster illustrations.

The build emits individual SVGs, asset/icon JSON manifests and `assets/design-lab/atlas-design-kit.zip`. The kit contains all full assets and thumbnails, SVGs, canonical tokens/registry and the published design documents. The asset manifest records exact prompts and content checksums; the ZIP carries the current source revision through that manifest. The browser suite and publication check cover the new pages, decoded assets, controls, SVG downloads and kit.

## Do's and Don'ts

- Do retain source links and distinguish a portfolio listing from funding or eligibility.
- Do keep controls readable, discoverable and usable without a pointer.
- Do use the canonical token stylesheet and compare the component catalogue with the affected operational view.
- Do distinguish graph root, inspected selection and keyboard focus.
- Don't infer a relationship from visual proximity, a logo or a matching name.
- Don't add decorative motion that obscures labels or interaction state.
- Don't fill a designed profile or chart with invented sectors, valuations, locations or portfolio counts.
- Don't treat a current query, return route or local saved opportunity as a fully synchronized research workspace.
