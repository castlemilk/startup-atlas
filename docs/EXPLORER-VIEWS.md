# Startup Atlas explorer views

This document defines the information architecture, data requirements and next implementation slices for the directory, treemaps, relationship graph, startup profiles and partner/VC profiles. It complements the visual decisions in [DESIGN.md](../DESIGN.md) and the interaction ownership in [UX-CONTRACT.md](../UX-CONTRACT.md).

The [approved editorial wireframes](design/editorial/README.md) govern the explorers and company profile. A slim paper masthead, separate view toolbar, serif identity, adjacent inspection and rust selection carry across them. Reviewed Atlas records supply the live names, figures and relationships.

[Direction studies 06–10](VIEW-DIRECTION-STUDIES.md) extend that language into founder dossiers, funding-event detail, startup comparison and browser-local research collections, plus a more elevated list/search treatment. These four new journeys and one visual refinement are proposals with explicit prerequisites, not additional deployed capabilities or runtime token changes.

**Status:** design-system expansion, 16 November 2026. A documented target is not a claim that it is deployed. The status table below distinguishes this pass from subsequent work; release verification still belongs to the exact commit and Pages deployment.

## Product model

Startup Atlas helps a founder identify an organisation, understand its sourced relationships, and move between a company, its founders, its supporting organisations and relevant programmes. The unit of exploration is an attributed entity or relationship, not an unsourced company card.

List, treemap and graph are complementary representations. The list answers which records match; the treemap compares a defined measure across startups; the graph explains connections around an entity. Startup and partner explorers are profile destinations that provide the detail behind all three representations.

The existing static architecture remains appropriate for this work: native ES modules, TanStack Table and Query core where already used, an immutable sql.js snapshot and a matching JSON fallback. This design does not require a new backend, authenticated workspace or paid service. See [knowledge graph storage](KNOWLEDGE-GRAPH.md) for the data and publication contract.

## Delivery status and boundaries

| Area | Existing or delivered in this pass | Subsequent work |
| --- | --- | --- |
| Foundations | Shared token stylesheet, wireframe-aligned masthead, serif identity rows, selected-state primitives and design-system catalogue. Existing route markup remains native HTML and JavaScript. | Maintain wireframe parity and token reuse as additional components are introduced. |
| Directory | Cross-entity search, startup facets, opportunity and partner filters, URL-addressed selection, incremental results, evidence coverage and company comparison. | Richer sourced facts and saved collections. |
| Treemap | Startup tiles, measure/currency controls, location drill-down, evidence inspector, ranked-list equivalent and shareable selection and scope. | Additional sourced measures and partner-scoped distributions. |
| Graph | Complete matching one- and two-hop neighbourhoods, drag and keyboard movement, type filters, and a sourced connections list. Node activation follows a relationship and Back restores the previous view. | Relationship-type filters and cross-device camera persistence. |
| Startup explorer | Founders, sourced company facts, connections, funding events and articles; clearer section hierarchy and shared visual primitives. | Structured operating geography/sectors/status, event participants, ownership history and independently sourced comparable-company discovery. |
| Partner/VC explorer | Identity/type, researched company and people samples, selected-company inspection, programme/provider relationships and review notes. | Partner-scoped company filtering and treemap/graph lenses, selected-company deep links, sourced investment thesis, fund identities, relationship/date filters and structured portfolio coverage. |
| Return context | Shared view links propagate query; internal profile links capture their source route in allowlisted per-tab session storage, including supported query/filter/displayed-range state. | Exact list scroll restoration, full filter adaptation across views, cross-tab context transfer and full graph viewport restoration. |

Saved opportunities, companies, explorer views, comparisons and notes are stored in the current browser. Save view keeps the explorer URL. Graph pins and camera remain session-local.

## Information architecture

### Global and contextual navigation

The shared masthead contains site navigation and global search. The explorer heading contains **Treemap**, **Graph** and **List** links with `aria-current="page"` on the active destination. **Save view** stores the scoped view URL in this browser, and **Export** downloads the current record set. Profile section navigation uses anchors into the current document.

### Responsive composition

| View | Wide composition | Narrow transition |
| --- | --- | --- |
| Directory / All | Result list and a 350px adjacent inspector; the rail becomes 310px at 1200px and below. | Stack at 900px and below; inspection moves focus to the detail heading. |
| Treemap | Measure-led canvas and a 350px evidence inspector; the rail becomes 310px at 1200px and below. | Stack at 820px and below; the ranked list remains an equivalent inspection route. |
| Graph | The canvas sits alongside the evidence inspector with a 14px gap. | Stack at 920px and below. Short landscape screens move company facets into Filters to bring the canvas into view sooner. |
| Startup and partner profiles | A 1640px maximum shell, a 340px context rail and a 24px column gap. | Stack the context rail at 1000px and below. The partner company inspector follows the selected row at widths of 1200px or less or heights of 540px or less. |

The document owns page scrolling. These dimensions do not impose a fixed-height application shell or hide long research sections.

Each profile has a full identity heading, an obvious route to its network, and a return destination. Internal entity/partner links capture the source route in per-tab `sessionStorage`; `safeAtlasReturn` accepts only the same origin/deployment directory and an explicit allowlist of public routes. A directly opened profile or unavailable storage retains a stable directory/graph fallback. Internal return context must never redirect to an arbitrary URL supplied in a query string.

### Scope and state

Do not imply that all current routes already consume one shared scope object. They have different semantics and different parameter vocabularies:

| Route | Current state owner | State to preserve or add next |
| --- | --- | --- |
| Directory | `web/app.js`: `view`, `q`, `type`, opportunity facets, partner facets and displayed range `shown`; inspected entity is local presentation state. | Selected-entity URL restoration and exact scroll anchor. |
| Treemap | `web/treemap.js`: `metric`, `currency`, `group`, `q`, `period`, `view`. | Selected startup and originating list/partner scope. |
| Graph | `web/graph.js`: `entity` root, optional `selected`, `depth`, `types`, `q`, `list`. | Browser history and tab-local camera retain earlier neighbourhoods. |
| Entity profile | `web/entity.js`: stable `id`. | In-document section and safe return context. |
| Partner profile | `web/partner-profile.js`: reviewed partner `name`; selected company is local presentation state. | Selected-company URL restoration; stable-ID route migration only after identity/alias redirects exist. |

Shared `[data-atlas-view]` links now carry the current query, and graph links can retain a known entity context. Transfer additional filters only when the destination can actually apply them. Treemaps currently operate on startup records. Entering from an all-entity list must say **Startups only** and report its resulting count. Do not silently label the treemap as representing people, providers and programmes too. The profile return helper preserves the originating route and its supported state; universal cross-view filter adaptation remains subsequent work.

Query semantics also differ today: graph search includes sourced connections and article terms, while treemap search matches company name/summary. Unification requires a deliberate search-model change and parity checks, not just passing the same `q` parameter.

## Shared component vocabulary

| Component | Information and behaviour |
| --- | --- |
| Entity identity | Logo/initials, complete name, entity kind and only sourced supplementary metadata. Reuse across rows, inspectors and profiles. A broken logo retains the same footprint and exposes initials. |
| Entity badge | `.atlas-badge` with `data-kind`; text carries the kind independently of colour. Entity kind and research status are separate meanings. |
| View navigation | Shared `.atlas-masthead` and `.atlas-view-nav`; real route links, active state, keyboard focus and wrapping at narrow widths. |
| Section navigation | `.atlas-section-nav`; links to real headings. Long profiles remain document-scrolling pages. |
| Action | `.atlas-button`, `.atlas-button-primary` and the terracotta `.atlas-button-accent` inspection destination; native button for actions, anchor for destinations. Use a primary action sparingly. |
| Coverage | `.atlas-coverage`; measured numerator/denominator, population definition and exclusion reason. A count of researched companies is not an ecosystem or complete portfolio count. |
| Empty state | `.atlas-empty`; a specific absence, its reason if known, and a useful next action. Do not reuse a load-error message for a valid zero-result query. |
| Fact/evidence row | Label, source-backed value, source link and relevant dates. Observation, publication and review dates remain distinct. |
| Relationship row | Other entity, explicit relationship predicate, historical qualifier where known and an evidence link. A logo or proximity is not relationship evidence. |
| Inspection panel | Details for the selected item plus **Open profile**. The panel does not silently change the scope or graph root. The small-screen equivalent stays reachable in document flow. |

Colour, typography, spacing and motion come from [DESIGN.md](../DESIGN.md) through `web/design-tokens.css`; component styling belongs in `web/atlas-ui.css`. Avoid copying token values into this specification.

## List and search

**Job:** find an entity or opportunity and understand why it is relevant before opening it.

The first row-level hierarchy is identity, concise description and kind. Show sourced metadata that helps discriminate between results; do not fill a fixed financial grid with invented or mostly empty values. Evidence and graph navigation remain secondary actions. Prefer a semantic list for mixed entity records; use a native table when the columns truly represent comparable fields.

The **All** scope searches startups, people, partners, providers and programmes. The **Opportunities** scope owns eligibility, resource and access-path filters. The **Partner index** owns reviewed identity/provider-evidence and recorded-location filters. These scopes must not inherit incompatible hidden restrictions. The current country vocabulary has distinct meanings: an opportunity market is not a partner's office location.

The List renders 12 results at a time. Near the end, a user scroll appends the next batch in place. **Load more** appends the same batch and moves keyboard focus to the first new profile link. The table owns scrolling on wider screens. At 720px and below, labelled company cards continue in the page flow. Counts describe all matching records. The URL records the displayed range in `shown` and supports reload, history and profile return. Filtering starts a new range.

Search must expose a clear action when nonempty, work during international text composition, and avoid announcing every keystroke excessively. Exact-name results should lead. Native selectors own graph/treemap and entity-kind choice; the existing directory facets use authored `details`/`summary` menus in `web/app.js`. Verify the authored menu's Escape/focus behaviour as well as the native popup. Do not promise typo tolerance for every scope: SQLite/JSON graph search and the opportunity/partner search paths have different current implementations.

**Implemented inspection pattern:** in All, each row has an explicit **Inspect** button and a separate profile-name link. Inspection leaves the query, filters and displayed range in place, marks the chosen row with a terracotta edge and tint, and shows sourced details in the adjacent non-modal panel. The close action returns focus to the row's Inspect button; narrow inspection focuses the detail heading. A scope change or a query that removes the selected row clears the inspection. Selection is transient and does not yet have a URL parameter.

## Treemaps

**Job:** compare the composition of a researched startup selection under a precisely defined measure.

The canvas, ranked list, metric controls and selected-company evidence panel must describe the same view. Area is proportional to a positive numeric measure; padding belongs inside the rectangle so small values retain their true proportions. The list is the equivalent interaction surface for small tiles, keyboard users and narrow layouts.

### Metric contract

| Metric | Plotting rule | Required explanation |
| --- | --- | --- |
| Company count | Each matching startup has weight 1. | The population is Atlas records, not all companies in a market. |
| Recorded valuation | Latest eligible dated positive numeric valuation for each startup in the selected currency, with an HTTPS source. | Historical observations on potentially different dates, not current valuations. |
| Funding announcement amount | Latest eligible dated positive numeric event amount for each startup in the selected currency, with an HTTPS source. | An announced event amount, not cumulative funding or necessarily primary equity capital. Preserve instrument/secondary-transfer notes. |
| Public market cap | Latest eligible positive market-cap observation for each listed company in the selected currency. | Give the listing, observation date and source. For estimates, show the closing price, economic shares used, the date of that share count and any share-class notes. |
| Company value | Use the latest eligible market-cap observation for a verified listed company or the latest eligible valuation for a verified privately held company. Plot the figure when its reported currency matches the chosen currency. | Label the figure basis on each tile, card and list entry. Show the valuation event or market-cap calculation, date and sources in Figure. Name why a company is missing a comparable value. |

No parsing money out of free text, implicit FX conversion, overlapping-event summation or missing-to-zero substitution. Same-date ties use a deterministic event-ID ordering. If a newer event is ineligible for the selected measure/currency, retain the older comparable observation and explain that a newer unplotted event exists. All events remain on the profile.

The default view shows company count grouped and coloured by technology type. Explicit metric and presentation links retain their settings. Atlas publishes the [reviewed market-cap observations and technology sources](../data/treemap-evidence.json) with the graph in JSON and SQLite. Earlier snapshots can still display the company catalogue and its existing measures.

Company value opens grouped by technology type. It selects one latest sourced positive figure across currencies before applying the currency choice, so an older USD valuation does not replace a newer AUD valuation. Standalone private valuations from reviewed transactions are stored alongside the ownership evidence. Funding amounts, valuation floors and acquisition prices are context for investigation. Subsidiaries, unresolved ownership and missing comparable figures remain inspectable in the excluded-company list. The Overview panel gives all available sourced profile facts, founders, funding announcements and links.

### Grouping and coverage

Technology type assigns a single sourced classification for each company's core product as described in its Atlas record. Companies without a reviewed classification appear in **Technology type not recorded**. Grouping also supports primary sector, headquarters country or city, funding stage, company and founding decade. Colour is an independent setting. Missing or invalid founding years belong to **Not recorded**.

Compute coverage from [the loaded graph snapshot](../data/graph.json) with [the treemap model's eligibility rules](../web/treemap-model.js). The catalogue derives its entity/startup totals and comparable-funding example from that build; this specification does not pin a second set of counts that can drift as research is regenerated. When recording review evidence, associate measured counts with the build's source revision.

Each company contributes its full weight to one group. Group headings reserve the same proportion of each box in the treemap mosaic, so a company's tile retains its proportion of the chart area across group boundaries.

Show the plotted count, excluded count and reason beside the measure. A sum of historical valuation observations must not be labelled market value, current ecosystem value or investment performance. Source/date detail is available through tile focus or selection, not hover alone.

## Relationship graph

**Job:** explain a selected neighbourhood and enable a deliberate next step through its evidence.

Graph opens on the matching companies grouped by primary sector, with technology type when a primary sector is unavailable. **Group by** switches to headquarters country and records that choice in `group=country`. Companies with missing group data have their own section. Selecting a company opens its Loom neighbourhood, and **Companies** returns to the overview. A link with an existing graph root opens that neighbourhood directly.

The graph uses a paper canvas, coloured organisation and person markers, and rust selection. The self-hosted [Loom](https://castlemilk.github.io/loom/) renderer draws directional connections. The compatibility SVG shows the same records with identity cards and edge captions. Company facets and search sit in the top tray. Type, depth, list and pin controls sit above the graph, with camera controls below. The inspector begins with the entity’s identity and a sourced relationship.

### Root, selection and layout

The **root** defines the neighbourhood. Click, tap, or press Enter/Space on a node to follow its connections and open its inspection. Related records, the connections list and search results give the same route. **Open profile** navigates to the full entity page. Shared links can restore a separate inspected record. Keyboard focus retains a distinct dashed treatment. **Previous view** and browser Back restore the prior neighbourhood and its selection.

`entity` encodes the root. `selected` is omitted when it is the root; `depth=2` overrides the one-hop default; `types` contains comma-separated active kinds, with an empty value meaning no non-root types and omission meaning all kinds. `q` preserves the search and `list=1` opens the connection list. Selection-only Back within the same root and unchanged depth/type filters preserves the current geometry and camera. Changing the root or depth/type filters can recompute the layout; reload also recomputes it. Do not describe this as persistent graph arrangements.

Dragging pins a node according to the route's existing layout model; keyboard movement supplies a non-drag alternative. **Fit view** changes the camera. **Reset layout** restores arrangement and must not be described as a camera-only action. Reduced motion removes prolonged settling animation while preserving the result. Pointer panning stays inside the canvas without trapping page scrolling outside it.

Depth is one or two hops. The connections list and **Full map** include every recorded relationship matching the chosen depth and entity types. Busy mobile Loom views open with a labelled overview of direct neighbours. **Full map** switches to the complete diagram and **Fit view** frames the current presentation. Full maps use rings for crowded and narrow neighbourhoods, prioritise the root and focused node when placing names, and reveal more names as users zoom. The inspector exposes all recorded direct relationships. It identifies neighbours that are available in the list when the overview leaves them out.

### Maintaining mobile Fit

- [Selection and geometry](../web/graph-mobile-fit.js) owns the responsive query, node threshold, slot count, row spacing, label height and marker radii. The overview currently applies above 12 nodes at widths up to 620px or in short layouts up to 920px wide and 540px tall. It takes up to five directly sourced neighbours, giving each recorded relationship kind a turn before filling another row. Founder links lead when present. Ties within a kind follow the neighbourhood order.
- [Loom adapter](../web/graph-loom.js) draws the selected edges and projects the root and neighbour columns. The fitted camera gives a world unit one CSS pixel and leaves a clear column for wrapped names. Pan, zoom and pins use the normal camera and collision checks. Fit keeps explicit pins, and **Reset layout** restores the automatic arrangement. Full map and the overview have separate camera and pin state within the tab.
- [Graph stylesheet](../web/graph.css) owns type, colour and focus treatment. Fitted labels allow up to three lines in touch-sized rows. If label height changes, keep row spacing larger than the label height plus the collision clearance in the Loom adapter. The full name remains on the node button and in the list.
- [Graph route](../web/graph.js) retains the complete matching neighbourhood for the list, evidence and export. The overview only changes the input passed to Loom. Full map is a local presentation choice during the visit. WebGL fallback uses the existing full SVG diagram.

After changing the policy or style, run `npm run build` and `node scripts/test-graph-browser.mjs`. Check the Startmate two-hop view at 320px, 390px and short landscape. The browser check requires six readable, non-intersecting names at Fit, verifies every list source against the build's matching edges, and exercises Full map, a touch traversal and Previous view. Use a sparsely connected root such as Canva to check the standard map as well.

### Relationship semantics

Render the real predicate in the inspector or connection list: **founded**, **listed in portfolio**, **team member**, **offers programme**, **programme relationship** or a sourced equivalent. Do not turn a `supports` edge into an investment-in-round claim. A venture firm's team membership does not prove that person led a company's investment. Visual edge direction and text must agree.

Loom draws arrows in the source-to-target direction. The [Loom theme](../web/graph-loom.js) gives context wires a solid, muted stroke and highlights the inspected node's links in rust. Atlas applies this styling through Loom's theme resolver so selecting a node keeps the rest of the map visible. The SVG view uses a stroke that stays legible as the canvas scales. Shorter SVG captions retain the full wording in a title. Both renderers preserve the predicate and source in the list and inspector. Following a direct connection with a recorded source brings that edge and source to the top of the inspector.

[Graph artwork](../web/graph-artwork.js) uses the recorded logo or portrait and the existing curated organisation logo lookup. Keep pale wordmarks on a dark surface, fit logos within their bounds, and crop portraits to their round frame. Add asset-specific treatments for the exact reviewed file, as with the LaunchVic footer wordmark. The node and inspector show initials until artwork loads and whenever it is unavailable.

Run `npm run data:generate` followed by `npm run audit:images -- --graph` to find nodes using initials. The report groups nodes by kind and ranks gaps by sourced connection count. It checks local file presence and counts remote references, which need separate browser verification. For each new image, check the exact subject and usage terms on the official source, then use the [reviewed asset intake](MCP-ASSETS.md#published-pipeline). Verify decoded artwork in the graph and inspector at desktop and mobile widths.

The present snapshot has no structured `invested_in_round` edges. A future funding-event node or investor participation filter requires event-specific evidence, endpoint rules and date/currency semantics. Relationships should eventually support valid-from/to and dispute/history states, as described in the [knowledge graph roadmap](KNOWLEDGE-GRAPH-ROADMAP.md).

## Startup explorer

**Job:** understand the company, its founders and its recorded history, then follow a meaningful connection.

Keep identity and a concise sourced summary at the top, followed by compact research coverage. The founder section is prominent, because founder-to-other-startup navigation is a core journey. Use linked people rather than embedding their names only in a paragraph. Do not merge two people based on a matching name.

The current startup section links are **Founders** (`#entity-founders`), **Company** (`#entity-company`), **Funding** (`#entity-funding`), **Connections** (`#entity-connections`) and **Sources** (`#entity-sources`). These are anchors; all sections remain in the document. Generic person/programme profiles expose only applicable sections.

| Section | Present data and behaviour | Extension requirement |
| --- | --- | --- |
| Company | Website, identity source, structured profile facts where supplied. | Normalize sector, headquarters/operating geography and status only with evidence and as-of context. |
| Founders | `founded` edges with linked person profiles and evidence. | Reconciled identities, dated roles and independently sourced other ventures. |
| Funding | Sorted event records, amounts/currencies, dates, valuations and notes. | Instrument/event classification and event-specific investors. Never infer investors from portfolio edges. |
| Connections | Related partners, programmes, ownership and other recorded edges. | Relationship filtering and historical validity without hiding incomplete coverage. |
| News and sources | Attributed article links and source notes. | Separate editorial news dates, fact observation dates and research review dates. |

Absent founders means **Founder information has not been researched yet**, not that the company has no founders. Absent rounds means no researched funding record, not bootstrapped. Missing currency preserves the announcement's text and uncertainty; it does not make the amount comparable in a chart.

The canonical navigation fixture is **Airtree → Canva → Melanie Perkins → Fusion Books**. It exercises partner-to-company, company-to-founder and founder-to-other-company relationships. Each step must remain a real link and retain its evidence context.

## Partner and VC explorer

**Job:** understand an organisation's roles and its researched company, team and programme relationships.

Partner is an index category, not a synonym for venture capital. Respect the sourced subtype: investor, accelerator, venture studio, university, programme operator or unclassified organisation. A firm, its funds, a cohort and a provider programme are distinct entities.

The profile should lead with identity, sourced type and description; follow with **Companies researched**, **People**, **Programme relationships** and research notes. Where the underlying source is a selected sample, label it as a sample. **3 companies researched** must not become **Portfolio: 3** or a claim of full coverage.

The current section anchors are `#partner-companies`, `#partner-people`, `#partner-programmes` and `#partner-sources`, with an optional Supporters section when supported by data. Companies precede the team list. Optional research-load failures now receive visible partial-data messages rather than being presented as a complete empty sample.

The company list has explicit **Inspect** controls and a selected-company panel containing the recorded relationship, source, profile destination and company graph link. The first researched company is initially selected. Selection is local to the page and does not change the partner identity or imply a partner-scoped graph. Names remain real profile links. On narrower layouts, inspection moves focus to the company detail heading.

Future VC detail can include investment stages, sectors, investment geography, fund identities and application routes. Every field needs its own source and date; a headquarters address cannot supply investment geography, and a provider listing cannot guarantee founder eligibility or credits. Funding-round participation cannot be inferred from being on a portfolio page.

Partner-scoped filtering and treemap/graph lenses remain subsequent features. They should reuse the shared views against a clearly labelled partner-specific set, preserve relationship type and deduplicate startup IDs. The implemented company list and inspector do not yet provide those lenses. Funding measures must describe the startups' observations rather than the firm's invested capital or returns.

## Acceptance matrix

These are release criteria for the affected capability. They are not a declaration that every future feature below exists.

| Surface | Main interaction | Missing/partial data | Error and recovery | Keyboard and small screens |
| --- | --- | --- | --- | --- |
| Shared shell | Correct active route; section links target real headings. | Unsupported facets are absent or explicitly unavailable. | Navigation remains reachable when content fails. | Visible focus, wrapping links, no clipped primary controls. |
| List/search | Exact-name search, clear, scope changes, Load more with `shown` restoration, local row inspection and real profile links. | Distinct no-match and not-yet-researched text; full filtered total independent of visible slice. | Dataset failure is not reported as zero results; retry/return path remains available. | IME-safe input, labelled filters, usable native popup/authored facet menu, inspection heading focus on narrow screens and close-to-row focus return. |
| Treemap | Metric/currency/grouping changes, drill-down, selection and source/profile navigation. | Unknowns counted, one currency, newer-unplotted notice, tiny tiles also in ranked list. | SQLite failure can use JSON; total failure has an explicit message and recovery action. | Tile buttons and list provide equivalent access; narrow view can use list without losing selection details. |
| Graph | Activate nodes and relationships to traverse. Retain depth, type filters, pan, zoom and reset. | Show the complete sourced neighbourhood for the current depth and type filters. | Search recovers an unavailable root. | Enter/Space traversal, keyboard movement, evidence list and reduced-motion support. |
| Startup | Founders, facts, rounds, connections, news and evidence navigation. | No founder/funding research is explicit; missing money/date never becomes zero/current. | Unknown ID and load failure have honest recovery copy. | Readable heading hierarchy, section anchors, no horizontal page overflow, full names remain accessible. |
| Partner/VC | Company inspection and profile/person links, provider/programme evidence, safe return context. | Sample scope, identity uncertainty and unresearched sections stay visible. | Failed optional research must not look like a complete empty portfolio. | Equivalent section navigation and link treatment to startup profiles; selected-company detail remains reachable and receives useful narrow-screen focus. |

Additionally check failed images, long names, long source titles, no local/session storage, browser Back/Forward, direct deep links and relative links under the GitHub Pages project path. Check shared query propagation, valid/invalid/over-limit `shown` values and rejection of external/disallowed profile return destinations. Displayed-range restoration does not imply exact list scroll or graph-camera restoration.

## Implementation sequence

Use the [next-view direction studies](VIEW-DIRECTION-STUDIES.md) when scoping person history, event-specific participants, comparisons, collections or the shared elevation refinement. Their gallery images and written briefs establish the intended reading order, surfaces and states; the sequence below still governs implementation readiness.

1. **Wireframe foundations and profile hierarchy — implemented.** Shared masthead, serif identity hierarchy, paper/white research surfaces, selected-state primitives, responsive rails and catalogue references follow the five numbered studies. Safe profile return context and consistent sections remain operational. Verify the actual changed routes at desktop and narrow widths.
2. **Inspection and navigation continuity — partly implemented.** Graph traversal with URL history, local directory and partner-company inspection, shared query propagation and displayed-range restoration through `shown` are available. Additional cross-view adapters and exact scroll restoration remain further work.
3. **Coverage and evidence components.** Consolidate observation/review dates, missing-data explanations, research-sample counts and relation labels into shared renderers. Preserve the partner profile's explicit optional-source failure messages when migrating its data reader.
4. **Partner-scoped exploration.** Add company-list filters and reuse treemap/graph views for a partner's researched relationships, with unique-company totals and relation/date filters.
5. **Structured enrichment.** Add normalized sectors, distinct geography meanings, company status, fund identity and round participants through the reviewed source pipeline. Introduce the corresponding UI only when its data contract is valid.
6. **Comparison, saved scopes and scale.** Define what is saved, storage scope, metric compatibility and export provenance before adding controls. Measure dataset/browser limits before adding virtualization or a new service.

For each slice, document the exact existing code owner, affected routes, data prerequisite and acceptance evidence. A polished design catalogue is a review surface; it does not substitute for production-route checks or a verified deployment.
