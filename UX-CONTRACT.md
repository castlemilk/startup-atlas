# Startup Atlas UX contract

This contract defines canonical behaviour for the read-oriented directory and explorers. It records decisions and migration gaps; its presence does not certify that every route already conforms. Detailed view specifications and future features are in [docs/EXPLORER-VIEWS.md](docs/EXPLORER-VIEWS.md).

## Product context

- **Audience:** founders and ecosystem researchers following programmes, people, companies and supporting organisations.
- **Primary jobs:** find a relevant record, inspect its evidence, compare a well-defined startup measure and navigate sourced relationships.
- **Markets and language:** global content, English interface, Australian English copy conventions. Geographic location and programme eligibility are separate concepts.
- **Dates and numbers:** preserve source calendar dates as dates; do not convert a date-only announcement through a timezone. Display explicit currency context for money. Localized numeric rendering must not alter the underlying measure.
- **Accessibility target:** WCAG 2.2 AA, with native semantics, visible keyboard focus, reduced motion and equivalent list access for visual exploration.
- **Mutation boundary:** these explorers read published research. Existing opportunity saves affect browser-local preferences only. They do not edit the source dataset, submit applications or create shared accounts.

## Authoritative context

| Scope | Source | Consequence for UI |
| --- | --- | --- |
| Reviewed entities, evidence and publication | [Knowledge graph contract](docs/KNOWLEDGE-GRAPH.md) | Use the published snapshot; preserve unknowns, sources, event dates and currencies. A draft proposal is not published research. |
| Identity and relationship roadmap | [Knowledge graph roadmap](docs/KNOWLEDGE-GRAPH-ROADMAP.md) | Do not infer identity merges, investment relationships or eligibility from names, logos or layout. |
| Opportunity and partner research | [README](README.md), [agent runbook](docs/AGENT-RUNBOOK.md) | Distinguish provider offers, partner leads, identity review and provider relationship evidence. |
| Accepted visual target | [The five original wireframes](DESIGN.md#accepted-wireframe-reference), `01-list-search.webp` through `05-partner.webp` | Derive visual hierarchy and composition from these studies. Fictional examples never become factual records or available features by implication. |
| Visual language and token mapping | [DESIGN.md](DESIGN.md) and `web/design-tokens.css` | Runtime CSS owns exact values; shared components implement the accepted wireframe hierarchy. |
| View design and implementation stages | [Explorer views](docs/EXPLORER-VIEWS.md) | Separate operational controls from planned features and data prerequisites. |

Billing, authentication, permissions administration, destructive CRUD and private contact workflows are outside this contract. Do not add such behaviour under a visual-polish change.

## Visual contract

`web/design-tokens.css` owns the 54 shared runtime tokens described by `DESIGN.md`. The five original interface wireframes own the accepted hierarchy and composition; reviewed records own facts. `web/atlas-ui.css` owns the common masthead, components, selected/focus treatments and scrollbar baseline. `web/atlas-ui.js` owns shared rendering and progressive behaviour. Route styles define the documented composition geometry and visualizations. New equivalent controls do not receive independent token values or interaction logic.

The supported design is the current light field-guide presentation. A future dark theme requires a reviewed token set and cross-route contrast/state checks. Do not treat a browser's dark-mode preference as evidence that a complete dark theme exists.

## Canonical UI Map

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
| --- | --- | --- | --- | --- |
| Tokens | `web/design-tokens.css`, documented by `DESIGN.md` | `DESIGN.md` and canonical runtime CSS | Semantic tokens and documented route geometry; no competing palette in new shared controls. | Inspect computed styles on catalogue and live routes. |
| Buttons and entity badges | `web/atlas-ui.css` | `DESIGN.md` and this component contract | Neutral, forest primary and terracotta profile-destination variants; named entity kinds; native button/action and anchor/destination semantics. | Hover, focus, pressed/selected and disabled states. |
| Select/Listbox | Native `<select>` on graph, treemap and entity-kind controls; existing authored directory facet menus in `web/app.js` | This contract; `web/app.js` owns authored facet behaviour | Native controls accept browser-owned popup geometry/keyboard behaviour. Directory `details`/`summary` menus and option buttons remain the intentional authored variant with route-owned state; extend that owner rather than creating another implementation. | Open native popup and authored menu, keyboard choose, Escape, focus return and narrow viewport. |
| Search clear | Shared enhancement in `web/atlas-ui.js`; existing directory state remains owned by `web/app.js` | This search/flow contract | One clear action per input. Reuse an existing accessible clear control rather than attaching a duplicate. Route handlers own query/state updates. | Clear immediately, dispatch the route's expected update, return input focus, no stale results. |
| Dataset loading | `openGraph` in `web/graph-store.js` | `docs/KNOWLEDGE-GRAPH.md` | SQLite first, matching JSON fallback. The partner profile retains separate JSON readers with visible optional-source failure states; reader consolidation remains a migration item. | Database, fallback, partial-data and total-failure paths. |
| Table/list navigation | Existing route models; `web/table-model.js` for opportunity rows | This dataset-navigation contract | Explicit Load more for directory and a ranked-list equivalent for treemap. One-record inspection is separate from bulk selection, which is not implemented. | Total versus shown count, filter reset and Load more. |
| Record inspection | `renderEntityRow` in `web/atlas-ui.js`, `web/app.js` directory controller and `web/partner-profile.js` company controller | This inspection/flow contract; sourced graph entities or partner company sample | Native Inspect buttons and one selected state. Directory inspection can close; partner sample retains an inspected company. Neither changes facts, saves research nor selects a bulk operation. | Native keyboard activation, separate navigation links, evidence parity, selection invalidation and narrow focus. |
| Treemap detail tabs | `showDetail` in `web/treemap.js` | This tab/metric contract | Figure and Company are in-place panels for the same company, with roving tab focus and actual hidden-panel state. | Pointer, Enter/Space, ArrowLeft/Right, Home/End, selected state and matching panel. |
| Scrollbar | Global baseline in `web/atlas-ui.css` | `DESIGN.md` and `web/design-tokens.css` | Component-specific geometry/gutter exceptions only; keep scrollbars operable and visible. | Overflow region and narrow-page checks. |
| View/section navigation | `renderAtlasMasthead`, `.atlas-view-nav`, `.atlas-section-nav` and progressive tracking in `web/atlas-ui.js/css` | This navigation contract | One operational masthead contains real route links with `aria-current="page"`. Section anchors retain document flow and expose `aria-current="location"` during scrolling. Neither is an ARIA tab set. | Single route-navigation landmark, destinations/query, focus, wrapping and current section. |
| Return context | `safeAtlasReturn` and internal-link helper in `web/atlas-ui.js` | This return-context contract | Per-tab `sessionStorage`, same origin/deployment directory and explicit public-route allowlist; stable fallback if context/storage is unavailable. | Direct link, internal journey, unavailable storage and rejection of external/disallowed destinations. |
| Inline status and emptiness | `.atlas-coverage`, `.atlas-empty` and route-owned status region | This resilience contract | Loading, no results, unresearched, fallback and error are distinct states. | Correct text, stable layout and accessible status. |
| Date and money presentation | Current route renderers, constrained by domain models | `docs/KNOWLEDGE-GRAPH.md` and this date/money contract | Read-only display only; ISO source dates and explicit currency semantics. Consolidating a shared formatter is subsequent work. | Missing/invalid values, currency clarity and date-only preservation. |
| Concept image dialog | Native `<dialog>` in `web/design-lab.html`, behaviour in `web/design-lab.js` | This contract and `docs/DESIGN-LAB.md` | Labelled modal with close, previous/next, arrow keys, Escape, backdrop dismissal, image status and download; restore the invoking control. | All five images decode, keyboard navigation, focus return, direct link and 390px overflow checks. |
| Token copy feedback | Design lab palette in `web/design-lab.js` | Runtime `web/design-tokens.css` | Clipboard success only after resolution; visible selectable fallback on unavailable or rejected clipboard. | Success or honest fallback; rapid clicks cannot overwrite the latest outcome. |
| Utility icon geometry | `web/atlas-icons.js`; `web/atlas-ui.js` delegates its existing `icon` API | 32 explicit SVG definitions, 24 × 24 viewBox, 1.65 default stroke and currentColor | Named, bounded size/stroke/colour export variants. Decorative inline SVG is hidden; meaningful icons receive a label. Generated artwork is a separate family. | Preserve existing paths and fallback; verify preview, copied SVG and static download parity. |
| Asset library and icon workbench | `web/design-assets.html/css/js`; shared content in `web/design-handbook.js` | Exact local asset files, prompts, measured dimensions and canonical icon registry | Local search and native filters; a labelled native image dialog follows the existing lab focus/history model. Actual SVG copy/download and a build-generated ZIP kit. | Ten decoded assets, filters/recovery, history/focus, icon controls, honest clipboard feedback, downloads and 390px layout. |
| Direction handbook | `web/design-direction.html/css/js`; `web/design-handbook.js` | This contract, `DESIGN.md` and `docs/DESIGN-DIRECTION.md` | Native principle/playbook disclosure, shareable playbook anchors, local responsive and selection/motion specimens. Runtime motion tokens and system reduced-motion preference remain authoritative. | Five playbooks, current/proposed boundaries, useful disclosure, working links, reduced-motion and narrow layout. |
| Component workbench | `web/design-component-specs.js` and `web/design-workbench.js/css`, mounted in the working catalogue | Canonical `atlas-ui.js/css` renderers and explicitly labelled local compositions | Nine searchable entries with native variant selection; fictional actions/search/recovery, local entity details, native source disclosure, current-markup copy/download and owner guidance. | All variants, keyboard/source disclosure, immediate clear, no-match recovery, disabled/busy geometry, export parity, copy fallback, URL restoration and narrow focus. |
| Runtime token reference | `web/design-token-reference.js/css` | `web/design-tokens.css`; metadata owns names/roles only | All 54 canonical tokens, nine disclosure families, full computed JSON/CSS snapshots and a contrast checker with unrounded thresholds. Native selectors; reduced-motion values refresh. | Exact coverage, colour math, search/reset, contrast, copy recovery, reduced-motion exports and narrow layout. |
| Composition recipes | `web/design-recipes.js/css` | Existing route/layout owners and `docs/IMPLEMENTATION-RECIPES.md` | Five annotated structural diagrams, native recipe selection, wide/narrow toggles and static HTML scaffolds. Region buttons inspect documentation only. | Five recipes, semantic region mapping, DOM reading order, URL/Back restoration, scaffold parity, copy recovery and responsive diagrams. |

Data-entry forms, toasts, uploads, bulk Table Selection and CRUD are not required for this read-only slice. Local record inspection cannot imply a bulk-selected set or saved workspace. The design lab owns its local filter/playground forms and native image dialog. A recurring capability needs a canonical owner before implementation. Native `alert`, `confirm` or `prompt` is not a product-feedback primitive.

## Component behaviour

| Component | Required behaviour |
| --- | --- |
| Action/link | Semantic element, clear name, deliberate hover, visible focus, meaningful selected/pressed state where applicable; disabled controls do not trigger actions. |
| Search | Label independent of placeholder; one visible clear action when nonempty; local clear is immediate. Suppress intermediate composition searches. Cancel pending timers or ignore stale results where asynchronous work exists. |
| Filter | Current value remains visible. A choice updates the owning view and its URL state where supported. Explain an unavailable choice through nearby text, not hover alone. |
| Entity mark | Fixed dimensions; initials on missing/broken images; empty image alternative text when the adjacent full name already identifies the entity. |
| Coverage label | State what was counted, what was omitted and the applicable population. Do not infer overall ecosystem size or full portfolio size. |
| Record/graph/tile selection | Expose inspection semantically and visually. Native Inspect controls remain separate from profile/source links; a selected row is not a bulk checkbox. Graph/tile selection changes inspection; explicit actions navigate or reroot. Terracotta selection remains distinct from keyboard focus. |
| Source link | Descriptive enough in context to identify evidence. Validate and escape data-derived URLs and labels. External destinations remain distinct from internal entity navigation. |

## Dataset navigation and URL state

The directory starts with 12 results and loads 12 more explicitly. Filtering/search changes reset the rendered range. The count is computed before slicing. `shown` records the displayed range in the URL when greater than 12; restoration accepts a valid integer greater than 12 and caps it at 1200, otherwise it uses 12. This restores the displayed range through reload, Back/Forward and captured profile return routes. It does not promise an exact previous scroll position.

Current URL vocabularies remain supported: directory query/scope/facets/`shown`, treemap metric/currency/group/query/cohort/list mode, graph root and supported graph view state, entity ID and partner name. Invalid parameter values fall back to documented route defaults. Stable entity IDs are preferred; partner-name URLs must remain valid until an explicit alias/identity migration supplies redirects.

The shared forest masthead contains one real-route navigation for List & search, Treemap, Graph and the design system, with the diamond mark and serif wordmark as a home link. Profiles do not claim to be a selected list/map route. Embedded previews hide surrounding masthead chrome. Shared `[data-atlas-view]` links propagate the current query, and graph links can retain an available entity context. This is not a universal filter adapter or identical matching guarantee. Transfer another filter only when the destination applies its meaning. Back/Forward and refresh restore every parameter the route claims to persist.

Profile section links remain real fragment anchors. All sections stay in document flow. Shared progressive tracking exposes `aria-current="location"` and a terracotta underline as scrolling or hash navigation changes the current section. It does not replace section content or overwrite the original return context.

Directory inspection is available in the All scope and is transient local state, not a URL parameter. Inspect selects a record; activating the same control again clears it. Query, scope or displayed-range changes clear a selection absent from the rendered results. Close clears inspection and returns focus to that record’s Inspect button when still rendered. At 900px or below, opening inspection focuses the stacked detail heading. Name, profile, graph and evidence links continue to navigate independently.

Partner company inspection uses only the organisation’s existing `detail.companies` sample. A nonempty sample initially shows its first company. Native Inspect buttons update the selected row, identity, recorded relationship, source and profile/graph destinations together. Selection is transient, with `aria-pressed` and a status announcement; it does not filter the sample, change the organisation or establish a funding-round investment. At 1200px or below, inspection reveals the stacked panel and focuses its heading; wider layouts retain button focus. A sample fetch failure remains unavailable, not an empty portfolio.

Profile return context is captured for internal entity/partner links in per-tab `sessionStorage`, keyed to the destination route. A return destination must pass `safeAtlasReturn`: same origin, within the current deployment directory and one of the explicitly allowed public routes. The stored source route retains its supported query/filter/`shown` parameters. Direct entries and storage failures keep normal fallback links. No externally supplied arbitrary redirect is accepted, and this mechanism does not synchronize separate tabs or persist a research account.

The graph root defines the neighbourhood; inspected selection defines the detail panel. Inspecting a visible node or related entity must not reroot. **Explore from here** makes the selection the root; selecting a search result also starts a new root neighbourhood. **Open profile** remains a link. An inspected related entity outside the rendered neighbourhood is labelled **Outside current map**.

Graph URL state is `entity` (root), optional `selected` (inspector), `depth` (1 or 2), `types` (comma-separated active kinds; omitted means all and empty means none except the root), `q` and `list=1`. Rerooting preserves the supported filter/depth state. Selection-only Back within the same root and unchanged depth/type filters preserves current geometry and camera; changing the root or depth/type filters can recompute the layout. Reload also recomputes layout. Serializing camera and manually arranged positions is a separate feature.

Treemap defaults are route-level decisions assessed against coverage. Explicit metric/currency links remain deterministic, and sparse coverage stays visible. Figure/Company inspection uses a genuine tab model: `tablist`, `tab`, `tabpanel`, `aria-controls`, `aria-selected`, roving `tabindex` and hidden inactive panels. Click or native activation selects a panel; Left/Right wrap and Home/End select first/last while moving focus. A plotted financial observation opens Figure; company-count inspection opens Company. A new company rebuilds its panels and selects that appropriate default. Panel choice is local, not URL state; selected-company deep links remain future work.

Design lab URL state is `q` (bounded concept search), `view` (a concept ID or omitted for all), and `concept` (the open study). Opening a study adds a history entry; stepping between studies replaces that entry. Closing a study opened locally returns to the gallery state, while closing a direct link removes the concept parameter without leaving the site. Unknown view/concept values fall back safely. Concept filters and specimen controls do not query or mutate the research dataset.

The asset library extends the same native dialog journey with `asset`, `kind` and `assetq`. Icon state is `icon`, `iconq`, `category`, `size`, `stroke`, `color` and `backdrop`; recognized values restore the workbench and invalid values use safe defaults. The icon preview, copied markup and downloaded variant must agree. A filtered-out selected icon can remain in the inspector with explicit context. Copy reports success only after the clipboard resolves, with a visible selectable code fallback on failure. The direction page uses `#playbook-ID` anchors that open their target disclosure. Motion and responsive composition controls are local specimens, not product route settings.

The working catalogue keeps independent URL namespaces: `pattern`/`device` for live previews; `component`, `componentq`, `componentKind` and `variant` for the component workbench; `tokenq`, `tokenGroup`, `foreground` and `background` for the token reference; and `recipe`/`layoutMode` for composition recipes. Each tool preserves the others' parameters. Known values restore on refresh and Back/Forward; invalid values use safe defaults and queries are bounded. Search updates replace the current entry; deliberate component/variant, contrast, token-family and recipe/mode choices can add history. Transient specimen input, source-note interaction outside its named variant, token-family disclosure state and annotation selection are local presentation state.

Filtering a component catalogue can leave its inspected entry selected, with explicit context that it is outside the filtered choices. Clear and reset restore focus to the relevant input; narrow component selection focuses its inspector heading. Native disclosure controls keep native Enter/Space behaviour. The component markup and download update after local state changes, but the exported HTML fragment does not bundle the route behaviour. Scaffold downloads and their displayed text agree. Token exports always include the full canonical set and are labelled computed snapshots; filters do not narrow their scope. Reduced-motion values are included in the snapshot, and the canonical stylesheet remains the maintained source of media rules.

Clipboard operations report success only after resolution. A rejected or unavailable clipboard reveals selectable content and useful focus; a later copy or specimen change invalidates stale copy feedback. These tools do not change research records or create a saved workspace. Their own reference content remains available when the optional sourced specimens cannot load.

## Flow ledger

| Operation | Trigger and pending state | Successful outcome | Failure/empty recovery | Focus outcome |
| --- | --- | --- | --- | --- |
| Open view | Route link; bounded loading/status region while data initializes. | Matching controls and content for the loaded snapshot. | Use JSON fallback when available; otherwise show unavailable state and a working return/retry path. | Normal document navigation; skip link remains available. |
| Search/filter | Input or native control; avoid unnecessary remote-loading UI for synchronous local filtering. | Updated count, results and supported URL parameters. | No-match message with clear/reset; dataset error remains distinguishable. | Keep focus in the active control. |
| Clear search | Clear button. | Empty query applied immediately and pending query work cancelled. | Remain usable if dataset is not yet loaded. | Search input. |
| Load more | Explicit button. | Append/reveal the next bounded result range, update `shown` URL state and retain correct shown/total text. | Preserve existing rows if future incremental loading fails. | Do not unexpectedly move focus to the start of the page. |
| Inspect directory record | Native Inspect button; local update. | One selected row with sourced details, retaining result scope. | Clear if absent from rendered results; distinguish unknown from unavailable. | Button at wide widths; stacked detail heading when narrow. Close returns to the available invoking button. |
| Inspect partner company | Native Inspect button; local update. | Selected sampled company with matching relationship, evidence and destinations. | Optional sample failure retains organisation identity and an unavailable message. | Button at wide widths; reveal and focus the stacked detail heading. |
| Inspect graph node | Pointer or Enter/Space on a visible node; related-entity selection. | Inspector changes; root and existing neighbourhood remain stable. Off-map selection is labelled. | Explain unavailable entity rather than inventing a node. | Preserve useful node/result focus; selection alone does not navigate. |
| Reroot graph | **Explore from here** or selection of a search result. | New neighbourhood, explicit root identity and supported state in history. | Keep search/directory recovery reachable. | Move to a useful new-root/canvas target when rerender removes the trigger. |
| Inspect treemap item | Tile or equivalent list control. | Same company/evidence from either representation, with Figure/Company panels. | Explain missing comparable values; never render them as zero. | Keep originating control usable; tabs/details remain in normal order. |
| Change treemap detail panel | Figure/Company tab, pointer or keyboard. | Matching selected tab and visible panel for the same company. | Rebuild the appropriate default when company selection changes. | Roving Left/Right and Home/End focus; native Enter/Space activation. |
| Open profile | Entity-name or **Open profile** link. | Full profile with sourced connections; safe local return context where captured. | Not-found/unavailable message with stable directory or graph route. | Normal document heading/navigation. |
| Save opportunity | Existing local save toggle. | Browser-local saved state and accessible pressed label update. | Browsing remains usable if storage is unavailable. | Remain on the toggle. |
| Return | Captured internal return link or fallback route. | Return to allowlisted local route with supported query/filter/displayed-range state. | Direct-entry fallback when context is missing/invalid or storage unavailable. | Normal route behaviour; exact prior scroll restoration remains a migration item. |

## Layout, keyboard and responsive behaviour

Profiles and the directory use document scrolling. The 1640px shell and route-specific rail dimensions/breakpoints are documented in [DESIGN.md](DESIGN.md#layout). Bounded graph/treemap panels do not authorize global `overflow: hidden` or fixed-height shells that clip other sections. Controls wrap or stack before overflowing. Narrow inspectors join normal reading order, with explicit controls, complete sources and the focus outcomes above; they are not hover-only tooltips.

Use a logical heading hierarchy, a skip link, labels for inputs and meaningful link names. Icon-only buttons require accessible names. Colour never carries entity kind, source status or selection by itself. Long entity names may wrap; keep their complete accessible text. Source titles and URLs must not create horizontal page overflow.

Every drag interaction has a non-drag route: graph nodes can be moved with the keyboard, and relationships can be explored through a list. Treemap tile selection and the ranked list expose equivalent company/source information. Reduced motion preserves the settled graph and suppresses decorative or prolonged movement. Verify that sticky elements do not obscure focused controls or anchor headings.

## Data honesty and resilience

- Use the snapshot loaded by `openGraph`; keep fallback mode visible on affected routes. A JSON fallback is published research, not a live backend response.
- Treat total dataset failure as unavailable, not an empty graph or zero-company portfolio. Preserve the partner profile's separate partial-data messages when optional research fails; data-reader consolidation must retain that distinction.
- Keep a company founding year, product launch, event announcement and research review date distinct. A rebuilt snapshot does not refresh old facts automatically.
- Missing founder, funding, location or image data remains missing. Only sourced comparable monetary values enter quantitative charts.
- State that portfolio lists and team lists are researched samples unless completeness has been established. A portfolio listing is not evidence of a specific funding round or amount.
- Session/local storage is optional. Its absence must not block reading, searching, opening a profile or following a source.
- The current snapshot is read-only. No optimistic dataset mutations, offline write queue, conflict resolution, login or auto-save behaviour is implied.
- Escape content and validate URLs using the existing safe helpers. Public data must not become executable markup or an arbitrary return redirect.

## Migration ledger

| Slice | Canonical decision | Remaining gap |
| --- | --- | --- |
| Design foundations | Accepted wireframes drive composition through shared tokens, one masthead, serif identity hierarchy, selection/focus treatments and the working catalogue. | Some legacy literals remain; migrate deliberately without treating old geometry as the visual target. |
| Search | Shared clear enhancement, query propagation, `shown` restoration and local All-scope inspection; route handlers own query/filter state. | Full filter adaptation and matching/debounce/composition behaviour are not identical across scopes; do not promise universal typo matching. |
| Profiles | Wireframe-derived dossiers, actual funding chronology, aligned source rails, native partner company inspection and safe return routes. | Broader milestones, sourced thesis fields, partner-scoped comparison lenses and persistent company selection remain future work. Partner readers still differ from the graph reader; exact list scroll restoration is not implemented. |
| Graph | Root and selection are distinct; reroot explicitly. | Persisted pins/camera, incremental expansion and omitted-edge browsing remain future work. |
| Treemap | One metric/currency model, proportional tiles, equivalent list and accessible Figure/Company tabs. | Selected-item deep links, new sourced groupings and partner-scoped metrics remain future work. |
| Saved/comparison | Existing browser-local opportunity saves only. | Saved entities/searches, comparison and exports require their own data and interaction contract. |

## Verification and release evidence

Run relevant repository checks for the actual changed capabilities, normally `npm test`, `npm run build` and `git diff --check`. Use the existing browser scripts where applicable: [graph browser checks](scripts/test-graph-browser.mjs) and [treemap browser checks](scripts/test-treemap-browser.mjs). Tests or commands for new catalogue/shared components should be recorded in the change that introduces them.

For affected routes, exercise desktop/narrow layouts, keyboard navigation, native selector popups and authored facet menus, clear/reset, direct links, Back/Forward, missing images, long labels, reduced motion, SQLite, JSON fallback and total failure. Verify the single masthead, section tracking, explicit directory/partner inspection, filtered-out selection reset, Close focus return, stacked-heading focus and treemap tab keyboard model. Verify query propagation and `shown` restoration, including invalid/over-limit values. Compare profile hierarchy with the accepted wireframes and the **Airtree → Canva → Melanie Perkins → Fusion Books** journey. Include storage failure and rejected return destinations when changing return helpers.

Inspect the rendered result as well as source. Static token/contract audits cannot prove focus restoration, accurate empty states or visual legibility. Record command results and browser evidence for the exact revision. A local build, design catalogue or draft PR is not a verified public deployment; check the actual Pages run before calling it live.
