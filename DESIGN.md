---
version: alpha
name: "Startup Atlas"
description: "An editorial field guide to startup opportunities and sourced relationships."
colors:
  primary: "#173a2b"
  action: "#184b32"
  canvas: "#f4f7ef"
  paper: "#f6f0e5"
  surface: "#ffffff"
  border: "#d8e1d2"
  textMuted: "#52675a"
  accent: "#b84d2b"
  focus: "#ad3d19"
  startup: "#346447"
  partner: "#567036"
  person: "#855437"
  programme: "#786019"
  provider: "#426476"
typography:
  display:
    fontFamily: "Georgia, Times New Roman, serif"
  interface:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
  utility:
    fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace"
rounded:
  control: "8px"
  panel: "13px"
spacing:
  page-max: "1640px"
  graph-gap: "16px"
  scale: "4px 8px 12px 16px 24px 32px 48px"
---

# Startup Atlas design context

## Overview

Startup Atlas is an open field guide for founders exploring programmes, people, companies and the organisations that connect them. The product combines editorial presentation with a practical research tool: serif headings and forest green anchor the field-guide identity, while controls and dense graph labels use the system sans face. Avoid an anonymous enterprise dashboard or a decorative network that implies relationships unsupported by evidence.

The current site is English-language and has desktop and mobile layouts. Global browsing is supported; location does not imply programme eligibility. The shared system now connects list/search, treemap, graph, startup and partner/VC views. [UX-CONTRACT.md](UX-CONTRACT.md) owns interaction rules and migration gaps; [explorer view specifications](docs/EXPLORER-VIEWS.md) describe detailed layouts, data requirements and subsequent work.

## Runtime ownership and mapping

This is an **existing runtime canonical** system. [web/design-tokens.css](web/design-tokens.css) owns token values; this document records their intent and current exact mapping. The YAML front matter is a descriptive subset, not a separate generated theme. No build step generates CSS from this file. Change durable visual decisions in both the canonical stylesheet and this document in the same changeset.

| Layer | Owner | Responsibility |
| --- | --- | --- |
| Foundations | `web/design-tokens.css` | Palette, type families/scale, spacing, radii, layout references, motion, overlay shadow and scrollbar colours. |
| Shared presentation | `web/atlas-ui.css` | Actions, entity badges, view/section navigation, coverage, emptiness, search clear, directory rows, focus and global scrollbar treatment. |
| Shared behaviour/rendering | `web/atlas-ui.js` | `icon`, `entityBadge`, `renderEntityRow`, `renderViewNavigation`, `safeAtlasReturn` and progressive navigation/clear/return-context helpers. |
| Domain composition | `web/graph.css`, `web/treemap.css`, `web/entity.css`, `web/profile.css` and existing directory styles | Graph/treemap geometry, profile structure and route-specific layout. New common visual values consume Atlas tokens. |
| Catalogue | `web/design-system.html`, `web/design-system.css`, `web/design-system.js` | Connected implementation reference, live view previews, foundations and sourced research examples. |
| Component reference | `web/design-component-specs.js`, `web/design-workbench.js`, `web/design-workbench.css` | Nine selectable recipes, canonical owner mapping, fictional interactive specimens and current-markup copy/download. |
| Token reference | `web/design-token-reference.js`, `web/design-token-reference.css` | Metadata for all canonical tokens; computed runtime values, grouped search, contrast comparisons and explicitly labelled snapshot exports. |
| Composition recipes | `web/design-recipes.js`, `web/design-recipes.css` | Five responsive structural diagrams, region ownership, scroll and data boundaries, and static HTML handoff scaffolds. |
| Visual design lab | `web/design-lab.html`, `web/design-lab.css`, `web/design-lab.js`, `web/design-concepts.js` | Generated concept gallery, accessible image review, shared runtime palette and an explicitly fictional component playground. |

The compatibility aliases in the token stylesheet are `--ink → --atlas-ink`, `--muted → --atlas-muted`, `--line → --atlas-border`, `--focus → --atlas-focus`, `--navy → --atlas-ink` and `--blue → --atlas-action`. They bridge older static styles; new components use `--atlas-*` directly. Existing CSS files still contain some route-specific literals, particularly treemap colours and graph annotation fills. Those are migration work, not additional canonical palettes. Do not duplicate them into new controls.

The shared stylesheet follows the established route styles where its primitives/adapters need to take precedence; route-specific catalogue composition may follow it. Verify computed styles rather than assuming a token declaration defeats a more specific legacy rule. There is no Tailwind or React theme provider. The reference can export computed JSON/CSS snapshots, including the current motion preference; these exports do not replace the canonical stylesheet or its media rules.

## Colors

Forest green carries navigation, text and actions. Parchment supports the editorial discovery/catalogue context; the pale green working canvas supports sustained exploration. White is the content surface, with thin green-grey borders and modest tonal differences. These surfaces describe a task hierarchy, not separate brands or themes.

| Runtime token | Exact value | Use |
| --- | --- | --- |
| `--atlas-ink` | `#173a2b` | Primary text, forest header and strong navigation state. |
| `--atlas-action` | `#184b32` | Primary action and source/navigation links. |
| `--atlas-action-hover` | `#256441` | Primary action hover. |
| `--atlas-muted` | `#52675a` | Supporting copy, metadata and placeholders. Replaces the lighter former text value. |
| `--atlas-canvas` | `#f4f7ef` | Pale working canvas. |
| `--atlas-paper` | `#f6f0e5` | Parchment discovery/catalogue surface and contextual notices. |
| `--atlas-surface` | `#ffffff` | Content panels and controls. |
| `--atlas-border` | `#d8e1d2` | Quiet separators and panel boundaries. |
| `--atlas-border-strong` | `#a7b8a0` | Control boundaries and stronger rules. |
| `--atlas-soft` | `#e8eedf` | Hover, grouped controls and quiet selected context. |
| `--atlas-accent` | `#b84d2b` | Restrained terracotta emphasis; inspected graph-node outline. |
| `--atlas-focus` | `#ad3d19` | Keyboard focus, kept distinct from category meaning. |
| `--atlas-on-action` | `#ffffff` | Text on dark action/navigation surfaces. |

### Categorical and state pairs

Dark categorical colours are for text/marks; their pale partners are backgrounds. A muted pastel that works as an avatar fill is not automatically suitable for small text. Entity kind always appears in text, and the connection list repeats graph meaning independently of colour.

| Meaning | Foreground token and value | Background token and value |
| --- | --- | --- |
| Startup | `--atlas-startup: #346447` | `--atlas-startup-soft: #e2edda` |
| Partner | `--atlas-partner: #567036` | `--atlas-partner-soft: #e9eed8` |
| Person | `--atlas-person: #855437` | `--atlas-person-soft: #f3e5d9` |
| Programme | `--atlas-programme: #786019` | `--atlas-programme-soft: #f5edd4` |
| Provider | `--atlas-provider: #426476` | `--atlas-provider-soft: #e0ebef` |
| Warning/partial data | `--atlas-warning: #815517` | `--atlas-warning-soft: #f8edda` |
| Error/unavailable | `--atlas-danger: #a13e32` | `--atlas-danger-soft: #f9e9e3` |

Keep entity kind separate from research status and chart measure. A programme's ochre colour is not a warning; a green startup badge is not verification or positive investment performance. Treemap group colour names the recorded grouping, while area expresses the selected measure.

## Typography

Georgia headlines and brief narrative introductions lend an editorial voice. System sans carries navigation, search, filters, entity names in dense lists, facts and graph labels. Use monospaced text for token names and technical specimen values, not for all financial content. Numerical comparisons and coverage counts use tabular numerals where useful.

| Token | Exact runtime value | Role |
| --- | --- | --- |
| `--atlas-font-display` | `Georgia, "Times New Roman", serif` | Page/section headings, selected narrative statements. |
| `--atlas-font-body` | `system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif` | Interface and research content. |
| `--atlas-font-mono` | `ui-monospace, SFMono-Regular, Consolas, monospace` | Token/code specimens. |
| `--atlas-text-xs` | `0.75rem` | Compact coverage and secondary navigation. |
| `--atlas-text-sm` | `0.8125rem` | Controls and compact metadata. |
| `--atlas-text-md` | `0.9375rem` | Standard entity/interface text. |
| `--atlas-text-lg` | `1.125rem` | More spacious supporting text. |

At a 16px root size the shared type scale is 12/13/15/18px. Route display headings use responsive sizes rather than one fixed token: graph headings reach 57px, startup profiles 64px, partner profiles 62px and catalogue headings 66px. Profile section headings are generally 26px; their evidence rail is quieter at 22px. Profile introductions use 18px Georgia with a 1.55 line-height. Do not turn dense control labels into display typography.

### Density

There is one deliberate compact research density, not a user-selectable density switch. Shared buttons have a 42px minimum height; view links have a 40px minimum height. Directory rows use 18px vertical/12px horizontal padding, a 44px identity column and 16px gaps at desktop widths. The primary name is 15px and the summary stays subordinate with a readable line-height. Profile facts use 16px vertical rhythm and long content wraps. Narrow rows reorganize the kind/graph link instead of shrinking the complete interface uniformly.

Small badge text and graph annotations are supplementary. Core names, actions and sources remain reachable in readable list/profile alternatives. Do not truncate the accessible entity name when a graph card wraps its visible label, and do not use tiny type to force a large network into one screen.

## Layout

The general page maximum is 1640px. The graph pairs a flexible canvas with a 335px inspector and 16px gap, stacking below 820px. Profiles intentionally use a narrower 1320px shell, a 280px evidence rail and more generous 48px section gaps; entity profiles stack below 900px. Treemaps own their canvas/list geometry and use a separate responsive inspector width. Do not force all five views into an identical grid when the research task differs.

| Token group | Exact mapping |
| --- | --- |
| Spacing | `--atlas-space-1: 4px`, `--atlas-space-2: 8px`, `--atlas-space-3: 12px`, `--atlas-space-4: 16px`, `--atlas-space-6: 24px`, `--atlas-space-8: 32px`, `--atlas-space-12: 48px` |
| Page and inspector | `--atlas-page-max: 1640px`, `--atlas-panel-width: 335px` |
| Corners | `--atlas-radius-control: 8px`, `--atlas-radius-panel: 13px` |

Keep search, depth, filters, zoom, profile navigation and equivalent lists usable at narrow widths. View navigation wraps; profile section links stay normal anchors. The document owns page scrolling. Only the visualization or bounded list owns its internal overflow. The graph may be panned and zoomed without trapping page scroll outside its canvas.

The shared scrollbar baseline applies to application-owned overflow regions. It uses `--atlas-scroll-thumb: #879b7f`, `--atlas-scroll-hover: #647c5e`, `--atlas-scroll-active: #42613b` and `--atlas-scroll-track: #eef1e7`. The engine fallback is 10px wide with a 2px track-coloured inset; standards-based styling uses a thin scrollbar. Forced colours return scrollbar colour to `auto`. Do not hide scrollbars to simplify a screenshot.

## Elevation & Depth

Use tonal separation, thin borders and minimal shadows. `--atlas-shadow-overlay` is `0 12px 28px rgb(23 58 43 / 12%)`, reserved for overlays rather than every content block. The graph root has soft forest fill and a green outline; the inspected selection gets a terracotta outline; keyboard focus gets a stronger focus-colour/dashed treatment. Root, selection and focus are different states and must remain distinguishable when they coincide.

Cluster shapes are quiet spatial context, not evidence of new relationships. Graph labels and connected paths remain readable during interaction; do not obscure them with decorative depth, glow or large atmospheric effects.

## Shapes

Panels use soft rectangular corners, controls use tighter corners, and avatars and node ports are circular. Source-backed edges use restrained curved lines.

Entity badges use small categorical marks, with the person mark circular. Company logos retain their own aspect ratio in stable frames. A fallback initial is a neutral identity aid, not a generated approximation of an organisation's real logo.

## Components

### Shared primitives

| Primitive | Normative use |
| --- | --- |
| `.atlas-view-nav` | Real links for **List & search**, **Treemap**, **Graph** and the design catalogue. Current route uses `aria-current="page"`; these are not ARIA tabs. |
| `.atlas-section-nav` | Anchors to visible profile headings. All sections remain in document flow. |
| `.atlas-button` / `.atlas-button-primary` | Neutral and primary actions. Native button for an operation, anchor for a destination. |
| `.atlas-badge[data-kind]` | Named entity kind with a categorical foreground/background pair. `data-tone` represents warning/error separately. |
| `.atlas-coverage` | Readable researched/available counts and uncertainty, with emphasized tabular figures. |
| `.atlas-empty` | Specific no-results, unresearched, partial, unavailable or loading content; preserve the difference in copy. |
| `.atlas-clear` and `[data-atlas-clear-for]` | One accessible clear action tied to a real input. Clear dispatches the route input update and restores focus. |
| `renderEntityRow` | Shared directory/specimen renderer for identity, summary, recorded connection count, source, kind and graph destination. |

Graph/treemap selectors and the directory entity-kind selector remain native `<select>` controls. Existing directory facets are authored `details`/`summary` menus in `web/app.js`, backed by the route's selection state and option buttons. Both are intentional current ownership decisions; do not silently describe all selectors as native or proliferate a third independent pattern. Keyboard, Escape and focus behaviour must be verified for the authored menu and the native popup.

### Control states

| State | Treatment and behaviour |
| --- | --- |
| Default | Clear hierarchy, visible boundary where needed, correct native action/link semantics. |
| Hover | Neutral actions/navigation receive the soft surface; primary actions use action-hover. Pointer targets get a pointer cursor. |
| Focus | Shared `:focus-visible` outline is 3px with 3px offset. Dark-header links use the white on-action colour for contrast; other shared controls use the focus token. Visualization controls may use a visible in-frame equivalent where an outside outline would be clipped. Never remove focus without a replacement. |
| Pressed/selected | Neutral button press uses the border tone; persistent toggles/tabs expose their selected/pressed semantics. Graph inspection is distinct from graph root. |
| Disabled | Muted text, soft surface, reduced opacity and non-action cursor; prevent the action in native behaviour/handlers. `aria-disabled` styling alone does not disable a link. Explain a nonobvious unavailable action in visible context. |
| Busy | Preserve control/content geometry and communicate loading through the owning status region. Do not introduce a second ad-hoc spinner system. |
| Error/partial | Specific explanation and reachable recovery, with warning/error tones where helpful. Missing research is neither a zero value nor an error. |

### Navigation and profile continuity

Shared `[data-atlas-view]` links carry the current query to the next view, and graph navigation can retain a known entity context. Query propagation does not imply identical matching rules or full filter transfer across all views. The directory records the displayed result range as `shown`: 12 is the default; a valid integer greater than 12 is restored up to 1200. Filtering resets the range. Do not promise exact scroll restoration.

Internal profile entry links capture their return route in per-tab `sessionStorage`. `safeAtlasReturn` accepts only the same origin/deployment directory and an explicit public-route allowlist. Return links retain supported query/filter/range state; direct entries and unavailable storage keep stable fallback links. This is navigation context, not an account or saved research workspace.

Startup profiles lead with identity, coverage and founders, then company facts, funding, connections and sources. Partner profiles use the actual sourced organisation type, lead with their researched company sample, then people, optional supporters, programmes and sources. Sources and historical qualifiers remain close to the claim. A sample is not the firm's complete portfolio, and a portfolio listing is not a round investment.

### Graph inspection and movement

Click or Enter/Space inspects a visible node without reconstructing the network. **Explore from here** explicitly changes root; choosing a search result starts a new root neighbourhood. An inspected related entity that is not in the rendered map is labelled **Outside current map**. **Open profile** remains a real link. The connection list exposes the same visible relationships with sources.

Graph cards support pointer dragging and arrow-key movement. **Fit view** changes the camera without clearing positions; **Reset layout** clears manual placement and restores the automatic arrangement. A capped neighbourhood discloses that it is limited. Root/selection, depth, types, query and list visibility have route state; persistent camera/pin arrangements across reload are future work.

### Motion

The shared motion tokens are `--atlas-duration-fast: 140ms`, `--atlas-duration-normal: 220ms` and `--atlas-ease: cubic-bezier(.2,.8,.2,1)`. Controls use short colour/surface transitions. Graph force movement serves spacing and exploration, not ambience. Under reduced motion, the duration tokens become `0ms`, shared control transitions stop and the graph reaches its settled result without prolonged animation. Preserve every action and final state.

## Living catalogue and review

[web/design-system.html](web/design-system.html) is the working catalogue for this system. Its five pattern tabs embed the real directory, treemap, graph, startup and partner routes from the same build with `embed=1`; they are not separately maintained screenshots. The embed mode removes surrounding discovery/navigation chrome for focused review. **Open full view** reaches the operational page.

The catalogue offers a full-width desktop preview and a nominal 390px mobile preview, constrained to its container. `pattern` and `device` query parameters make the chosen preview shareable. Pattern tabs use tab semantics and Arrow/Home/End keyboard navigation; route navigation retains link semantics.

Foundation swatches read the runtime CSS values. The **Sourced examples** section reads entity rows, facts/relationships and coverage from the published snapshot through `openGraph`, including its JSON fallback. The component workbench uses explicitly fictional records. Loading, no-results, partial and unavailable examples are labelled **specimens**; their controls demonstrate states rather than claim to retry a real request. Planned comparison is a disabled catalogue specimen, not a working product capability.

### Implementation workbench

The working reference shares the design microsite header and field-guide identity. A task index and section navigation connect the component workbench, live views, composition recipes, foundations, sourced examples and handoff guidance. The reference remains usable when the research snapshot fails to load.

The nine component entries cover actions, entity badges, entity rows, search/clear, source disclosure, claims/coverage, relationships, research states and view navigation. Shared primitives use the existing renderers and CSS. Higher-level specimens are labelled compositions and name their behaviour owner. Fictional profile links open local specimen details; the navigation specimen clearly links to operational routes. Copy and download follow the current preview markup, including local state changes. The downloaded fragment names its CSS and behaviour dependencies and does not claim to be a standalone explorer. [The component guide](docs/COMPONENTS.md) records this boundary.

All 53 canonical `--atlas-*` tokens appear across nine searchable families. Metadata owns purpose and grouping only; displayed and exported values come from computed CSS. The colour-pair checker keeps its pass/fail result outside the sampled colours so poor combinations remain readable. It reports text and meaningful-mark thresholds independently using the unrounded ratio; it is not a page-level accessibility certification. Reduced-motion changes update the displayed durations and exports. [The token guide](docs/TOKENS.md) explains snapshot scope and the authoritative colour formula.

Five composition recipes define semantic regions, current owners, responsive reading order, scroll ownership and data boundaries. Region selection reveals an annotation; the diagram is not a miniature product. Wide/narrow modes describe composition while the five live iframes remain the operational reference. Downloaded HTML scaffolds provide static labelled regions and canonical CSS links; research loading and interactions remain with the existing route owner. [The assembly guide](docs/IMPLEMENTATION-RECIPES.md) captures current breakpoints and outstanding work.

Controls follow the existing compact interface density. Source code uses the utility typeface in bounded, visible scroll regions; names and usage guidance wrap. Native selectors retain platform popup behaviour. Narrow layouts put the catalogue choices before the inspector and move component selection focus to its heading. Every search has immediate clear/reset, every copy has a visible selectable fallback, and all downloads reflect the inspected state or explicitly state that they include the full token set.

When changing a common component, review both its specimen and an operational route. Check desktop/narrow layouts, actual native/authored selectors, keyboard focus, broken media, long names, missing data, reduced motion and the profile return journey. The catalogue is a shared inspection surface; it does not replace browser checks or establish that a particular revision has deployed. Keep factual UI and visual implementation separate from source-data enrichment.

## Visual design lab

[web/design-lab.html](web/design-lab.html) is an image-led microsite for the five explorer studies. It uses the same runtime tokens and shared buttons/badges, with an editorial hero, numbered gallery, view briefs and component bench. Search, view filtering and the open study are shareable URL state. A native dialog provides full-image review, previous/next navigation, keyboard controls, downloads and the exact generation brief. Closing restores the invoking control.

The illustrations are fictional concept studies; their text and geometry do not establish product functionality or research facts. Each links to its implemented Atlas route and catalogue pattern. Palette values are read from canonical CSS and copied with visible success or a manual fallback. Density, entity type, selection and loading/empty/partial/error examples affect only the local specimen. Asset provenance and boundaries are recorded in [docs/DESIGN-LAB.md](docs/DESIGN-LAB.md). [The browser checks](scripts/test-design-lab-browser.mjs) cover the gallery, images, dialog, URL state, copy feedback and narrow layouts.

## Direction handbook and asset library

[The direction handbook](web/design-direction.html) extends the field-guide identity with five applied principles, six brand anatomy sections, voice examples, measured motion and responsive specimens, and detailed playbooks for all five views. [Its full text](docs/DESIGN-DIRECTION.md) records current behaviour separately from proposed next work. The generated boards explore composition; canonical geometry, colour values and behaviour remain in runtime CSS, SVGs and operational views.

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
