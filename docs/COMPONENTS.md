# Atlas component workbench

The [working design system](../web/design-system.html#components) provides nine interactive component recipes. It uses canonical Atlas tokens and primitives. The catalogue is a review and implementation reference; it does not introduce a second production UI library.

All named example people, companies, organisations, dates, amounts and connections are fictional fixtures. The existing research-backed specimens elsewhere in the catalogue remain separate. View-navigation links are explicitly labelled as links to the operational Atlas routes.

## Runtime ownership

| Recipe | Existing owner | Workbench boundary |
| --- | --- | --- |
| Action hierarchy | `.atlas-button`, `.atlas-button-primary` in `web/atlas-ui.css` | Available, unavailable and busy specimens. The enabled action only reveals a local inspection note. |
| Entity badge | `entityBadge` in `web/atlas-ui.js`; categorical styles in `web/atlas-ui.css` | Five named entity kinds, without any verification implication. |
| Entity row | `renderEntityRow` in `web/atlas-ui.js` | Canonical renderer with fictional data. Only the preview links are adapted to a local detail disclosure. Production destinations remain route-owned. |
| Search and clear | `data-atlas-clear-for` enhancement in `web/atlas-ui.js` | Three local fictional labels; composition-aware matching and immediate clearing. |
| Source disclosure | Native `details`/`summary` | A documented composition with a fictional source note. It does not replace route data readers. |
| Claim and coverage | Semantic definition list; `.atlas-coverage` | Recorded, historic and unknown amounts demonstrate presentation. Domain models still decide comparability. |
| Relationship | Shared badges and icons; route-owned relationship records | A documented source → predicate → target composition. All preview relationships are fictional. |
| Research states | `.atlas-empty`, `.atlas-coverage`, semantic warning badge | Ready, loading, no results, partial and unavailable states. Recovery changes the local specimen only. |
| View navigation | `renderViewNavigation` and `installAtlasUI` in `web/atlas-ui.js` | Real route links with the selected current-view treatment. Route filters are not universally interchangeable. |

`web/design-component-specs.js` owns catalogue descriptions, variants and search metadata. It deliberately contains no copies of token values or icon geometry. `web/design-workbench.js` mounts the catalogue through `mountComponentWorkbench(rootElement)`. `web/design-workbench.css` supplies catalogue layout and the documented composition specimens; its `.dc-*` selectors do not restyle the operational routes.

Load the catalogue after `styles.css`, `field-atlas.css`, `design-tokens.css` and `atlas-ui.css`. The entity-row primitive currently depends on its established base layout in `field-atlas.css`; a copy of the renderer alone is not a complete portable component package.

## Catalogue navigation

The component browser is a set of native selection buttons, not a page-navigation menu or an ARIA tab list. Each button exposes its selected state with `aria-pressed`. The inspector heading identifies the active recipe. On a narrow viewport, choosing a recipe moves focus to that heading so the preview is reachable without traversing the entire catalogue again. On desktop, focus remains on the selected choice.

Search is local and immediate. The field has a visible label and the canonical clear control. Intermediate IME composition text does not change results; composition completion applies the query. Clear empties the query, restores the broader set and returns focus to the field. The category selector is a deliberate native `<select>`; its popup and keyboard behaviour belong to the operating system/browser.

Filtering does not silently replace the inspected component. If it is outside the filtered set, a visible note explains that it remains selected. A no-match result includes a reset action. Counts always state the complete matching set out of the nine recipes.

### Shareable state

| URL parameter | Meaning | Default |
| --- | --- | --- |
| `component` | Active recipe ID | `actions` |
| `componentq` | Local catalogue search, capped at 160 characters | Empty |
| `componentKind` | `actions`, `identity`, `research` or `navigation` | `all` |
| `variant` | Valid variant ID for the active recipe | First variant in its metadata |

Invalid IDs resolve to safe defaults. These parameters coexist with the working catalogue’s `pattern` and `device`, and any other supported module state. Selecting a component or variant adds a history entry; query and category edits replace the current entry. Back and Forward restore the component, variant and filters together.

Fixture interactions such as the search input, a row disclosure or action selection remain local to that preview and reset when its variant is changed or restored. The source-disclosure recipe mirrors its open/closed state into `variant` because disclosure is its only explicit variant. None of this state changes or persists research records.

## Interaction contracts

**Actions.** Native buttons keep the canonical 42px minimum height and actual disabled semantics. The ready primary action toggles `aria-pressed` and the local inspection note; reset clears it. Disabled and busy specimens cannot run. A busy specimen uses `aria-busy` and visible explanatory text without claiming a request is in flight. Comparison remains visibly planned and disabled.

**Entity rows.** Names wrap and retain their full accessible text. Missing connection counts remain unknown. Fixed initials serve as a fictional identity mark; no real organisation logo is generated or impersonated. Adapted preview links open the local disclosure and focus the corresponding profile/connections heading. Operational `renderEntityRow` output keeps real entity and graph URLs.

**Search.** The route supplies matching and state; the canonical enhancement supplies clearing and focus restoration. The preview filters a bounded fixture list, reports the full matching denominator and distinguishes a no-match result from data failure. Search events during composition are ignored until composition ends.

**Evidence and relationships.** A native disclosure preserves ordinary document reading order. Enter or Space on its summary reveals source context; there is no modal focus trap. Dates are clearly labelled examples. A portfolio listing does not establish a funding-round investment. An unresearched connection renders no invented edge.

**Research states.** The preview reserves a content region so each example remains in context. Loading, no results, partial and unavailable have different text. Recovery is explicitly a local specimen transition, announces the ready state and focuses its heading. It is not a substitute for the route’s real retry request or error handling.

**Navigation.** Real destinations use anchors. `aria-current` describes the selected example route treatment; the surrounding catalogue remains the actual current page. Normal new-tab behaviour remains available. Use actual tabs only for in-page panels such as the five working-view previews.

## HTML copy and download

The preview-markup disclosure shows the current preview’s HTML, including changed input values, selected state, open disclosures and available recovery controls. It is escaped through text content, so inspecting code cannot execute it.

Copy reports success only after `navigator.clipboard.writeText` resolves. Unavailable or rejected clipboard access opens a labelled, selectable text area. A sequence guard prevents an earlier request from reporting success after the inspected variant or markup changes. The fallback has sufficient height and internal scrolling; it cannot resize the catalogue unexpectedly.

Download produces the same current markup as an HTML fragment with a dependency/fictional-data comment. It is **markup**, not a self-contained interactive app. Include the Atlas styles and implement the documented behaviour owner when reusing it. Event listeners, runtime research loaders and their security/data contracts are not serialized into HTML. The document names its required styles; source links beside the preview point to the actual owner files.

Give each reused instance unique element IDs and update its label, clear-control and ARIA references together. The catalogue mounts one specimen at a time; copying two fragments with the same IDs would break those associations.

## Review expectations

Review desktop and 390px layouts, native selector operation, keyboard focus, filtered-out selection, query clearing, no-results recovery, Back/Forward and direct links. Compare shared controls against an operational sibling route. Exercise every component variant, long-name wrapping, unknown data, source disclosure, local recovery and real copy/download outcomes. Keep the existing working views and their research-backed examples functional.

The workbench changes no durable colour, typography, radius or spacing tokens. Visual review should confirm the established paper/forest identity, thin boundaries, Georgia headings, system-sans controls and reduced-motion behaviour.
