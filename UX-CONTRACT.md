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
| View/section navigation | `renderAtlasMasthead`, `.atlas-view-nav`, `.atlas-section-nav` and progressive tracking in `web/atlas-ui.js/css` | This navigation contract | The explorer heading contains real view links with `aria-current="page"`. Section anchors retain document flow and expose `aria-current="location"` during scrolling. | View destinations/query, focus, wrapping and current section. |
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

The directory starts with 12 results and loads 12 more explicitly. Filtering and search reset the range. The count is computed before slicing. `shown` restores a valid range over 12 through reload, Back/Forward and profile return routes, up to 1200.

Current URL vocabularies remain supported: directory query/scope/facets/`shown`, treemap metric/currency/group/query/cohort/list mode, graph root and supported graph view state, entity ID and partner name. Invalid parameter values fall back to documented route defaults. Stable entity IDs are preferred; partner-name URLs must remain valid until an explicit alias/identity migration supplies redirects.

The editorial masthead provides site navigation and global search. The page toolbar switches between Treemap, Graph and List. View links carry `q`, repeated `hq`, `sector`, `stage`, `place`, `city`, `selected`, `anchor`, Directory `type` and `density`. A bare Directory URL opens companies, with Coverage on desktop and Details on mobile. Explicit `type=all` and global search browse the full catalogue. Embedded previews hide the masthead.

The headquarters selector applies draft choices on **Apply filters** and discards them on dismissal. On narrow screens the **Filters** sheet drafts headquarters, sector and stage together. Countries combine with OR. Sector, stage and the drill path combine with AND. Country option counts reflect the current search, other facets and drill path. **Clear filters** preserves the drill, query and inspection. **All ecosystems** clears the drill alone. **Reset exploration** clears the query, facets, drill, inspection and comparison and restores the company-count map grouped and coloured by technology type. Missing or conflicting classifications have explicit options.

Profile section links remain real fragment anchors. All sections stay in document flow. Shared progressive tracking exposes `aria-current="location"` and a terracotta underline as scrolling or hash navigation changes the current section. It does not replace section content or overwrite the original return context.

Directory inspection is available in the All scope and is addressed by `selected`. The inspector keeps a selected company outside the current results and offers **Adjust filters** and **Clear selection**. The narrow inspector opens as a modal sheet. Dismissal restores focus to the invoking control when available. Profile, graph and source links remain separate actions.

Partner company inspection uses only the organisation’s existing `detail.companies` sample. A nonempty sample initially shows its first company. Native Inspect buttons update the selected row, identity, recorded relationship, source and profile/graph destinations together. Selection is transient, with `aria-pressed` and a status announcement; it does not filter the sample, change the organisation or establish a funding-round investment. At 1200px or below, inspection reveals the stacked panel and focuses its heading; wider layouts retain button focus. A sample fetch failure remains unavailable, not an empty portfolio.

Internal entity and partner links capture the return URL and scroll position in the same tab. A return destination must pass `safeAtlasReturn`, which allows public routes in the same deployment directory. The return URL restores supported filters and `shown`. Scroll restoration runs once the page can reach the stored position. Direct entries and unavailable storage use ordinary fallback links.

The graph root defines the neighbourhood; inspected selection defines the detail panel. Inspecting a visible node or related entity must not reroot. **Explore from here** makes the selection the root; selecting a search result also starts a new root neighbourhood. **Open profile** remains a link. An inspected related entity outside the rendered neighbourhood is labelled **Outside current map**.

Graph-specific URL state adds `entity` (root), `depth`, `types` and `list=1`. Rerooting preserves the applied company filters and depth. Inspection leaves layout and camera alone. A tab retains camera and pins for each neighbourhood configuration. The company count excludes contextual nodes, which remain inspectable with their relationship evidence.

Treemap opens as a company-count map grouped and coloured by technology type. Explicit financial and legacy presentation links remain deterministic. Tile areas are proportional to the eligible count or recorded amount across groups. The selected colour defines its own legend. Missing comparable amounts remain accessible through the missing-figure list. The inspector opens Figure for a plotted financial observation and Company for company count. Market-cap estimates show the closing price and economic shares used, with observation dates and sources. Tabs use their standard keyboard model and the selected company survives a deep link.

Keep the coverage disclosure adjacent to the results. Show a group with no comparable values when it still offers a drill or filter action. Desktop evidence follows the page's reading flow. At 900px and below, the evidence sheet has a single vertical scroll area. Keyboard selection moves focus to the inspector and dismissal returns it to an available result control.

Selecting Company value groups by technology type. Its tiles, cards and ranked list identify the company-specific basis as Market cap or Private valuation. Small tiles retain a matching shape in the chart key and a full accessible label. The inspector exposes the selected figure and the recorded ownership, full sourced profile facts, founders and funding history. Missing, non-standalone and different-currency records remain inspectable.

Company logos sit directly on the treemap tiles. Reviewed paper-backed logos blend with the tile colour, and logo size follows the available space. Ranked cards give their bundled marks a larger, uncropped area.

Company saves, saved explorer URLs, comparison membership and personal notes are browser-local. Writes update the displayed saved state after storage succeeds. The comparison panel loads recorded headquarters, sector, funding stage and the last recorded profile fact review. Exports contain the names, types, stable IDs and public sources of the active result set. Personal notes stay in the browser and out of explorer URLs and CSV files.

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
| Inspect directory record | Native Inspect button. | Sourced detail and a shareable selected ID. | Keep the selected record with an outside-results label and recovery actions. | Desktop button and mobile sheet. Dismissal returns to the invoking button when available. |
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
| Search | Shared company facets, drill path, inspection and density across explorers. | Opportunity and partner catalogue scopes use their own search rules. |
| Profiles | Claim-level citations, independent founding and employment, funding chronology and return context. | Source records determine dates, role evidence and round participation coverage. |
| Graph | Separate root, inspection and context nodes, directed edges and tab-local camera. | The neighbourhood is bounded and links to the full record. |
| Treemap | Source-backed grouping and colour, proportional area, missing-figure list and selectable records. | Unrecorded fields remain visible as unknown. |
| Saved/comparison | Browser-local company saves, comparison and private notes. | Workspace storage is specific to the browser profile. |

## Verification and release evidence

Run relevant repository checks for the actual changed capabilities, normally `npm test`, `npm run build` and `git diff --check`. Use the existing browser scripts where applicable: [graph browser checks](scripts/test-graph-browser.mjs) and [treemap browser checks](scripts/test-treemap-browser.mjs). Tests or commands for new catalogue/shared components should be recorded in the change that introduces them.

For affected routes, exercise desktop and narrow layouts, keyboard navigation, filter draft dismissal, clear/reset, direct links, Back/Forward, missing images, reduced motion, SQLite, JSON fallback and total failure. Verify cross-view scope, excluded inspection, comparison, claim evidence, focus return, and restored ranges. The profile browser suite covers **Airtree → Canva → Melanie Perkins → Fusion Books**. Synthetic geography fixtures exercise multiple headquarters and city groups independently of public data coverage.

Inspect the rendered result as well as source. Static token/contract audits cannot prove focus restoration, accurate empty states or visual legibility. Record command results and browser evidence for the exact revision. A local build, design catalogue or draft PR is not a verified public deployment; check the actual Pages run before calling it live.

Use Impeccable critique and audit for layout changes to the Directory, Graph, Treemap, and startup dossier. Review direct-linked evidence and the result or map it came from across desktop, the affected breakpoints, and short portrait and landscape viewports. Check complete source links, long values, horizontal fit, coverage placement, and keyboard focus return in the built page. Verify keyboard focus in the zoomed graph and profile anchors below wrapped navigation.
