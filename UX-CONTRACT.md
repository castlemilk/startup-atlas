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
| Visual language and token mapping | [DESIGN.md](DESIGN.md) | Extend the established field-guide identity through canonical runtime tokens and shared components. |
| View design and implementation stages | [Explorer views](docs/EXPLORER-VIEWS.md) | Separate operational controls from planned features and data prerequisites. |

Billing, authentication, permissions administration, destructive CRUD and private contact workflows are outside this contract. Do not add such behaviour under a visual-polish change.

## Visual contract

`web/design-tokens.css` owns the shared runtime tokens described by `DESIGN.md`. `web/atlas-ui.css` owns shared component treatments and the global application scrollbar baseline. `web/atlas-ui.js` owns shared progressive interaction helpers. Existing route styles may define genuine geometry, density and domain-specific visualizations; new equivalent controls should not receive independent token values or interaction logic.

The supported design is the current light field-guide presentation. A future dark theme requires a reviewed token set and cross-route contrast/state checks. Do not treat a browser's dark-mode preference as evidence that a complete dark theme exists.

## Canonical UI Map

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
| --- | --- | --- | --- | --- |
| Tokens | `web/design-tokens.css`, documented by `DESIGN.md` | `DESIGN.md` and canonical runtime CSS | Semantic tokens and documented route geometry; no competing palette in new shared controls. | Inspect computed styles on catalogue and live routes. |
| Buttons and entity badges | `web/atlas-ui.css` | `DESIGN.md` and this component contract | `.atlas-button`, `.atlas-button-primary`, `.atlas-badge[data-kind]`; native button/action and anchor/destination semantics. | Hover, focus, pressed/selected and disabled states. |
| Select/Listbox | Native `<select>` on graph, treemap and entity-kind controls; existing authored directory facet menus in `web/app.js` | This contract; `web/app.js` owns authored facet behaviour | Native controls accept browser-owned popup geometry/keyboard behaviour. Directory `details`/`summary` menus and option buttons remain the intentional authored variant with route-owned state; extend that owner rather than creating another implementation. | Open native popup and authored menu, keyboard choose, Escape, focus return and narrow viewport. |
| Search clear | Shared enhancement in `web/atlas-ui.js`; existing directory state remains owned by `web/app.js` | This search/flow contract | One clear action per input. Reuse an existing accessible clear control rather than attaching a duplicate. Route handlers own query/state updates. | Clear immediately, dispatch the route's expected update, return input focus, no stale results. |
| Dataset loading | `openGraph` in `web/graph-store.js` | `docs/KNOWLEDGE-GRAPH.md` | SQLite first, matching JSON fallback. The partner profile retains separate JSON readers with visible optional-source failure states; reader consolidation remains a migration item. | Database, fallback, partial-data and total-failure paths. |
| Table/list navigation | Existing route models; `web/table-model.js` for opportunity rows | This dataset-navigation contract | Explicit Load more for the directory, ranked-list equivalent for treemap. No bulk row selection currently exists. | Total versus shown count, filter reset and Load more. |
| Scrollbar | Global baseline in `web/atlas-ui.css` | `DESIGN.md` and `web/design-tokens.css` | Component-specific geometry/gutter exceptions only; keep scrollbars operable and visible. | Overflow region and narrow-page checks. |
| View/section navigation | Shared `.atlas-view-nav` and `.atlas-section-nav` | This navigation contract | `[data-atlas-view]` route links use `aria-current` and carry the current query; section links target real headings. These are not interchangeable with ARIA tabs. | Correct destination/query, focus, wrapping and active route. |
| Return context | `safeAtlasReturn` and internal-link helper in `web/atlas-ui.js` | This return-context contract | Per-tab `sessionStorage`, same origin/deployment directory and explicit public-route allowlist; stable fallback if context/storage is unavailable. | Direct link, internal journey, unavailable storage and rejection of external/disallowed destinations. |
| Inline status and emptiness | `.atlas-coverage`, `.atlas-empty` and route-owned status region | This resilience contract | Loading, no results, unresearched, fallback and error are distinct states. | Correct text, stable layout and accessible status. |
| Date and money presentation | Current route renderers, constrained by domain models | `docs/KNOWLEDGE-GRAPH.md` and this date/money contract | Read-only display only; ISO source dates and explicit currency semantics. Consolidating a shared formatter is subsequent work. | Missing/invalid values, currency clarity and date-only preservation. |
| Concept image dialog | Native `<dialog>` in `web/design-lab.html`, behaviour in `web/design-lab.js` | This contract and `docs/DESIGN-LAB.md` | Labelled modal with close, previous/next, arrow keys, Escape, backdrop dismissal, image status and download; restore the invoking control. | All five images decode, keyboard navigation, focus return, direct link and 390px overflow checks. |
| Token copy feedback | Design lab palette in `web/design-lab.js` | Runtime `web/design-tokens.css` | Clipboard success only after resolution; visible selectable fallback on unavailable or rejected clipboard. | Success or honest fallback; rapid clicks cannot overwrite the latest outcome. |
| Utility icon geometry | `web/atlas-icons.js`; `web/atlas-ui.js` delegates its existing `icon` API | 32 explicit SVG definitions, 24 × 24 viewBox, 1.65 default stroke and currentColor | Named, bounded size/stroke/colour export variants. Decorative inline SVG is hidden; meaningful icons receive a label. Generated artwork is a separate family. | Preserve existing paths and fallback; verify preview, copied SVG and static download parity. |
| Asset library and icon workbench | `web/design-assets.html/css/js`; shared content in `web/design-handbook.js` | Exact local asset files, prompts, measured dimensions and canonical icon registry | Local search and native filters; a labelled native image dialog follows the existing lab focus/history model. Actual SVG copy/download and a build-generated ZIP kit. | Ten decoded assets, filters/recovery, history/focus, icon controls, honest clipboard feedback, downloads and 390px layout. |
| Direction handbook | `web/design-direction.html/css/js`; `web/design-handbook.js` | This contract, `DESIGN.md` and `docs/DESIGN-DIRECTION.md` | Native principle/playbook disclosure, shareable playbook anchors, local responsive and selection/motion specimens. Runtime motion tokens and system reduced-motion preference remain authoritative. | Five playbooks, current/proposed boundaries, useful disclosure, working links, reduced-motion and narrow layout. |

Data-entry forms, toasts, uploads, Table Selection and CRUD are not required capabilities for this read-only slice. The design lab owns its local filter/playground forms and native image dialog. A new recurring capability must receive a canonical owner before implementation. Native `alert`, `confirm` or `prompt` is not a product-feedback primitive.

## Component behaviour

| Component | Required behaviour |
| --- | --- |
| Action/link | Semantic element, clear name, deliberate hover, visible focus, meaningful selected/pressed state where applicable; disabled controls do not trigger actions. |
| Search | Label independent of placeholder; one visible clear action when nonempty; local clear is immediate. Suppress intermediate composition searches. Cancel pending timers or ignore stale results where asynchronous work exists. |
| Filter | Current value remains visible. A choice updates the owning view and its URL state where supported. Explain an unavailable choice through nearby text, not hover alone. |
| Entity mark | Fixed dimensions; initials on missing/broken images; empty image alternative text when the adjacent full name already identifies the entity. |
| Coverage label | State what was counted, what was omitted and the applicable population. Do not infer overall ecosystem size or full portfolio size. |
| Graph/tile selection | Expose selection semantically and visually. Selecting an item changes inspection; an explicit action performs navigation or rerooting. |
| Source link | Descriptive enough in context to identify evidence. Validate and escape data-derived URLs and labels. External destinations remain distinct from internal entity navigation. |

## Dataset navigation and URL state

The directory starts with 12 results and loads 12 more explicitly. Filtering/search changes reset the rendered range. The count is computed before slicing. `shown` records the displayed range in the URL when greater than 12; restoration accepts a valid integer greater than 12 and caps it at 1200, otherwise it uses 12. This restores the displayed range through reload, Back/Forward and captured profile return routes. It does not promise an exact previous scroll position.

Current URL vocabularies remain supported: directory query/scope/facets/`shown`, treemap metric/currency/group/query/cohort/list mode, graph root and supported graph view state, entity ID and partner name. Invalid parameter values fall back to documented route defaults. Stable entity IDs are preferred; partner-name URLs must remain valid until an explicit alias/identity migration supplies redirects.

Shared `[data-atlas-view]` navigation propagates the current search query, and graph links can retain an available entity context. This is not a universal filter adapter or a guarantee of identical matching rules. Only transfer another filter if the destination applies its meaning. A startup-only treemap must disclose that narrower population. Browser Back/Forward and refresh should restore every parameter the route claims to persist. Transient hover and pointer-drag position need not be encoded in the URL.

Profile return context is captured for internal entity/partner links in per-tab `sessionStorage`, keyed to the destination route. A return destination must pass `safeAtlasReturn`: same origin, within the current deployment directory and one of the explicitly allowed public routes. The stored source route retains its supported query/filter/`shown` parameters. Direct entries and storage failures keep normal fallback links. No externally supplied arbitrary redirect is accepted, and this mechanism does not synchronize separate tabs or persist a research account.

The graph root defines the neighbourhood; inspected selection defines the detail panel. Inspecting a visible node or related entity must not reroot. **Explore from here** makes the selection the root; selecting a search result also starts a new root neighbourhood. **Open profile** remains a link. An inspected related entity outside the rendered neighbourhood is labelled **Outside current map**.

Graph URL state is `entity` (root), optional `selected` (inspector), `depth` (1 or 2), `types` (comma-separated active kinds; omitted means all and empty means none except the root), `q` and `list=1`. Rerooting preserves the supported filter/depth state. Selection-only Back within the same root and unchanged depth/type filters preserves current geometry and camera; changing the root or depth/type filters can recompute the layout. Reload also recomputes layout. Serializing camera and manually arranged positions is a separate feature.

Treemap defaults are route-level decisions assessed against coverage. Do not hard-code a permanent company-count or financial default into shared UI primitives. Explicit metric/currency links must remain deterministic, and a sparse default must disclose its coverage.

Design lab URL state is `q` (bounded concept search), `view` (a concept ID or omitted for all), and `concept` (the open study). Opening a study adds a history entry; stepping between studies replaces that entry. Closing a study opened locally returns to the gallery state, while closing a direct link removes the concept parameter without leaving the site. Unknown view/concept values fall back safely. Concept filters and specimen controls do not query or mutate the research dataset.

The asset library extends the same native dialog journey with `asset`, `kind` and `assetq`. Icon state is `icon`, `iconq`, `category`, `size`, `stroke`, `color` and `backdrop`; recognized values restore the workbench and invalid values use safe defaults. The icon preview, copied markup and downloaded variant must agree. A filtered-out selected icon can remain in the inspector with explicit context. Copy reports success only after the clipboard resolves, with a visible selectable code fallback on failure. The direction page uses `#playbook-ID` anchors that open their target disclosure. Motion and responsive composition controls are local specimens, not product route settings.

## Flow ledger

| Operation | Trigger and pending state | Successful outcome | Failure/empty recovery | Focus outcome |
| --- | --- | --- | --- | --- |
| Open view | Route link; bounded loading/status region while data initializes. | Matching controls and content for the loaded snapshot. | Use JSON fallback when available; otherwise show unavailable state and a working return/retry path. | Normal document navigation; skip link remains available. |
| Search/filter | Input or native control; avoid unnecessary remote-loading UI for synchronous local filtering. | Updated count, results and supported URL parameters. | No-match message with clear/reset; dataset error remains distinguishable. | Keep focus in the active control. |
| Clear search | Clear button. | Empty query applied immediately and pending query work cancelled. | Remain usable if dataset is not yet loaded. | Search input. |
| Load more | Explicit button. | Append/reveal the next bounded result range, update `shown` URL state and retain correct shown/total text. | Preserve existing rows if future incremental loading fails. | Do not unexpectedly move focus to the start of the page. |
| Inspect graph node | Pointer or Enter/Space on a visible node; related-entity selection. | Inspector changes; root and existing neighbourhood remain stable. Off-map selection is labelled. | Explain unavailable entity rather than inventing a node. | Preserve a useful node/result focus; selection alone does not force document navigation. |
| Reroot graph | **Explore from here** or selection of a search result. | New neighbourhood, explicit root identity and supported state in history. | Keep search/directory recovery reachable. | Move to a useful new-root/canvas target when rerender removes the trigger. |
| Inspect treemap item | Tile or equivalent list control. | Same selected company and evidence details from either representation. | Explain missing comparable value; do not render it as zero. | Keep originating control usable; details reachable in normal order. |
| Open profile | Entity-name or **Open profile** link. | Full profile with sourced connections; safe local return context where captured. | Not-found/unavailable message with stable directory or graph route. | Normal document heading/navigation. |
| Save opportunity | Existing local save toggle. | Browser-local saved state and accessible pressed label update. | Browsing remains usable if storage is unavailable. | Remain on the toggle. |
| Return | Captured internal return link or fallback route. | Return to allowlisted local route with supported query/filter/displayed-range state. | Direct-entry fallback when context is missing/invalid or storage unavailable. | Normal route behaviour; exact prior scroll restoration remains a migration item. |

## Layout, keyboard and responsive behaviour

Profiles and the directory use document scrolling. A bounded graph or treemap panel does not authorize global `overflow: hidden` or a fixed-height shell that clips other sections. Controls and navigation wrap or stack before they overflow the viewport. The selected-detail panel stacks into the reading order on narrow screens; it must not become a hover-only tooltip.

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
| Design foundations | Shared tokens and primitives, route/section navigation and catalogue. | Some legacy route-specific styling remains until deliberate migration. |
| Search | Shared clear enhancement, query propagation in view links and `shown` restoration; route handlers own actual query/filter state. | Full cross-view filter adaptation and matching/debounce/composition behaviour are not yet identical across all scopes; verify touched inputs and do not promise universal typo matching. |
| Profiles | Shared hierarchy and controls, sourced facts/relationships, per-tab safe return route with displayed-range state. | Partner reader still differs from the graph-backed entity reader; exact list scroll restoration remains future work. |
| Graph | Root and selection are distinct; reroot explicitly. | Persisted pins/camera, incremental expansion and omitted-edge browsing remain future work. |
| Treemap | One metric/currency model, proportional tiles and equivalent list. | Selected-item deep links, new sourced groupings and partner-scoped metrics remain future work. |
| Saved/comparison | Existing browser-local opportunity saves only. | Saved entities/searches, comparison and exports require their own data and interaction contract. |

## Verification and release evidence

Run relevant repository checks for the actual changed capabilities, normally `npm test`, `npm run build` and `git diff --check`. Use the existing browser scripts where applicable: [graph browser checks](scripts/test-graph-browser.mjs) and [treemap browser checks](scripts/test-treemap-browser.mjs). Tests or commands for new catalogue/shared components should be recorded in the change that introduces them.

For affected routes, exercise desktop and one narrow viewport, keyboard-only navigation, a native selector popup and authored directory facet menu, clear/reset, direct links, Back/Forward, missing images, long labels, reduced motion, SQLite success, JSON fallback and total load failure. Verify query propagation and `shown` restoration, including invalid/over-limit values. Compare startup and partner profile hierarchy and the **Airtree → Canva → Melanie Perkins → Fusion Books** journey. Include no-storage and rejected return-destination behaviour when changing the return-context helper.

Inspect the rendered result as well as source. Static token/contract audits cannot prove focus restoration, accurate empty states or visual legibility. Record command results and browser evidence for the exact revision. A local build, design catalogue or draft PR is not a verified public deployment; check the actual Pages run before calling it live.
