# Atlas implementation recipes

These recipes connect the design system’s shared parts to the current list, treemap, graph, startup and partner explorers. Use them with the [working system](https://castlemilk.github.io/startup-atlas/design-system.html#layout-recipes), [visual foundations](../DESIGN.md), [interaction contract](../UX-CONTRACT.md) and [full view specifications](EXPLORER-VIEWS.md).

The interactive diagrams are **composition schematics**. Selecting a region explains its current code owner, component vocabulary and semantic landmark; it does not select a research entity. Wide and narrow controls describe intended region arrangement rather than simulate an operational route. The live previews elsewhere in the system remain the place to try the working explorers.

## Start with the existing owner

Atlas uses native HTML, CSS and ES modules. A recipe extends the current route; it does not introduce another application shell, framework, dataset or independently maintained copy of a component.

| Concern | Owner | Handoff rule |
| --- | --- | --- |
| Token values | `web/design-tokens.css` | Read the canonical CSS. Use the token reference for current values and export; do not copy a new palette into a route. |
| Shared presentation | `web/atlas-ui.css` | Reuse actions, badges, navigation, coverage, empty states, clear controls and entity rows. |
| Shared behaviour | `web/atlas-ui.js` | Reuse navigation, search-clear enhancement, entity row rendering and safe local return context. |
| Utility icons | `web/atlas-icons.js` | Use named icons through the shared renderer. Keep utility marks separate from editorial raster illustrations. |
| Graph snapshot | `web/graph-store.js` | Use the existing SQLite-first reader and published JSON fallback where the route already does so. |
| Domain-specific behaviour | Current route and its model | Metric eligibility, graph root/selection and research interpretation remain in their domain owners. |
| Composition recipes | `web/design-recipes.js` and `web/design-recipes.css` | Keep implementation guidance and annotation controls separate from product behaviour. |

The partner profile currently owns separate JSON readers and explicitly reports optional-source failures. Do not remove that distinction during a future reader consolidation.

## How to use the recipe workbench

1. Choose an explorer recipe. **Open working view** reaches its operational route.
2. Switch between **Wide** and **Narrow** to inspect the region order and layout guidance.
3. Select a labelled region. The accompanying annotation identifies the current owner, building blocks and appropriate landmark.
4. Check scroll ownership, state vocabulary and the three acceptance checks before changing a route.
5. Open **HTML composition scaffold** to copy or download the complete static handoff.

`recipe` accepts `search`, `treemap`, `graph`, `startup` or `partner`; omission and unknown values use `search`. `layoutMode=narrow` selects the stacked schematic; omission and unknown values use `wide`. Selecting a recipe or layout adds a history entry. Back/Forward restores both values while retaining other design-system parameters. The currently inspected region is local annotation state.

The scaffold is a complete static HTML file with semantic, labelled regions and composition CSS. It references `design-tokens.css` and `atlas-ui.css` beside the file. Place it beside those published styles or adjust the paths. Its local route link likewise assumes the Atlas deployment directory. It does **not** load research or implement search, graph, treemap or profile interactions. Bring changes into the current route owner after reviewing the composition; the scaffold should not become a competing explorer implementation.

Copy reports success only after the clipboard operation resolves. If clipboard access is missing or rejected, the selected HTML remains available in the code field, and the same file can be downloaded. Copy results for an earlier recipe cannot overwrite the current recipe’s feedback.

## List and search

**Current owners:** `web/app.js`, `web/styles.css`, `web/field-atlas.css`, and shared entity rows in `web/atlas-ui.js`.

**Composition:** identity and route links → labelled search and scope controls → full matching count and shown range → entity result list → explicit range continuation. These regions remain in document flow. There is no separate scrollable result pane or implemented shared row inspector.

| Region | Assembly and contract |
| --- | --- |
| Navigation | Real route links with `aria-current`, not an ARIA tab widget. |
| Search and scope | Labelled input, one immediate clear action, native entity-kind choice and the current authored facet menus where applicable. |
| Coverage | Count the entire filtered population before slicing; expose the visible range separately. |
| Result row | Complete entity identity, description, kind, recorded connection count when known, profile source and graph link. Use `renderEntityRow`. |
| Continuation | Explicit **Load more** adds the next 12 results. Filtering resets the range. |

Narrow layouts wrap controls and move secondary row metadata under identity. They preserve complete accessible names and real links. Search clears immediately, returns focus to its field and does not apply intermediate IME composition values.

State belongs to the current `view`, `q`, `type`, scope-specific facets and `shown` vocabulary. Valid `shown` values greater than 12 restore up to 1200; absent or invalid values use the initial 12. A profile return can preserve this displayed range without restoring an exact scroll coordinate. Different scopes do not silently inherit incompatible filters.

**Verify:** native selector and authored facet menu keyboard behaviour; valid zero matches versus dataset failure; Load more and profile-return range restoration; narrow full-name/source access.

**Still to build:** shared row inspection, exact scroll restoration, saved entity collections and comparison. Keep these out of operational controls until their contracts and behaviour exist.

## Treemap

**Current owners:** `web/treemap.js`, `web/treemap-model.js`, `web/treemap.css` and `web/treemap.html` method notes.

**Composition:** shared navigation → measure/currency/grouping controls → named measure and coverage → proportional tiles or equivalent ranked list beside the selected-company inspector → method and caveats. The inspector is 310px, reduces to 260px below 1000px and follows the visualization below 760px.

| Region | Assembly and contract |
| --- | --- |
| Controls | Native selectors change the same metric model. Founding decade is the current sourced grouping. |
| Coverage | Name the startup-only population, plotted count and exclusions beside the selected measure. |
| Visualization/list | Linear area from eligible positive values. The ranked list exposes the same items and evidence, including tiny tiles. |
| Inspector | Selected company, figure, currency, date, source and any newer unplotted event. Opening the profile is a distinct navigation action. |
| Method | Keep metric limitations and coverage explanations in document flow. |

The document remains scrollable; the ranked list owns a bounded internal scroller. A bounded visualization must not clip its inspector or method notes, and source details cannot depend on hover.

The current URL vocabulary is `metric`, `currency`, `group`, `q`, `period` and `view`. Financial comparison uses one currency and the model’s eligibility rules. Missing values are excluded and counted, never converted to zero. A funding announcement amount is an event measure, not cumulative funding; a historical valuation is not a current market value. No implicit FX conversion or summing overlapping events is allowed.

**Verify:** tile/list parity for the same company; metric/currency changes and exclusions; newer unplotted-event notice; keyboard selection and narrow inspector order.

**Still to build:** selected-tile URL state, additional sourced groupings, partner-scoped distributions and fuller scope transfer.

## Relationship graph

**Current owners:** `web/graph.js`, `web/graph-model.js`, `web/graph.css` and the existing layout model.

**Composition:** root identity and search → depth/type/view controls → flexible network panel with its equivalent relationship list beside the inspector. The current desktop inspector is 335px with a 16px gap, reducing to 300px below 1150px. Below 820px it follows the network panel.

| Region | Assembly and contract |
| --- | --- |
| Root and search | Root determines the neighbourhood. Choosing a search result deliberately starts a new root. |
| Controls | One/two-hop depth, entity kinds, list visibility and camera controls retain separate meanings. |
| Network | The existing canvas owns graph layout. Root, inspected node and keyboard focus are visually and semantically distinct. |
| Equivalent list | Expose the visible relationship predicates and evidence as a nonvisualization reading path. |
| Inspector | Selection changes this panel; **Explore from here** changes the root; **Open profile** is a real link. Off-map selections are named. |

The canvas owns panning and zoom; the document owns scrolling outside it. Do not make the entire page a fixed-height canvas shell. Dragging has a keyboard alternative. **Fit view** moves the camera while preserving positions; **Reset layout** clears manual arrangement. Reduced motion keeps the settled result and every action.

State uses `entity`, `selected`, `depth`, `types`, `q` and `list`. Selection-only history within an unchanged neighbourhood preserves existing geometry and camera. Reload or a changed root/depth/type set can recompute layout; this is not persisted graph arrangement.

A bounded neighbourhood must disclose limits. Spatial proximity, cluster shading or entity type never creates an evidence edge. Keep exact recorded predicates: a portfolio listing is not an investment-in-round claim, and a team member is not automatically an investment lead.

**Verify:** inspect without rerooting; explicit rerooting; Enter/Space and arrow-key movement; Fit versus Reset; list evidence parity; limited and reduced-motion states.

**Still to build:** persisted pins/camera, deliberate branch expansion and omitted-connection browsing.

## Startup explorer

**Current owners:** `web/entity.js`, `web/entity.css` and shared profile styles in `web/profile.css`.

**Composition:** identity, sourced introduction, coverage and safe return route → real section anchors → founders followed by company facts, funding and connections in the main column → source/context rail. The profile shell is 1320px, the rail 280px and major section rhythm 48px. Below 900px the rail follows the main profile.

| Region | Assembly and contract |
| --- | --- |
| Identity | Complete name, logo or stable initials, sourced summary, kind, coverage and graph destination. |
| Section navigation | Anchors to `entity-founders`, `entity-company`, `entity-funding`, `entity-connections` and `entity-sources`. All content remains in the document. |
| Founders | Linked people and sourced `founded` relationships, with unresearched copy when absent. |
| Facts and history | Sources stay beside facts. Funding events retain announcement date, amount, currency, historical valuation and source notes. |
| Evidence rail | Profile/image sources and context. Keep article, observation and review dates distinct. |

The stable profile parameter is `id`. Local return context uses the existing allowlisted per-tab helper. A direct entry or unavailable storage retains a stable fallback. It does not create cross-tab saved research state.

Missing founders or funding mean not yet researched. They do not imply a founderless company, zero funding or bootstrapping. A portfolio relationship must not be promoted into a funding-event participant. Wrap long names and source titles rather than shrinking or hiding their accessible text.

**Verify:** the existing company → founder → other-company journey; section anchor destinations; unknown ID versus unavailable dataset; broken-image fallback; narrow source-rail order.

**Still to build:** structured operating geography, event-specific investor participation and a richer sourced timeline.

## Partner / VC explorer

**Current owners:** `web/partner-profile.js` and `web/profile.css`.

**Composition:** sourced identity/type and sample coverage → anchored section navigation → companies and people in the main column, with optional supporters → programme relationships and source context in the rail. The 280px rail follows the main column below 900px.

| Region | Assembly and contract |
| --- | --- |
| Identity and coverage | Preserve the recorded organisation subtype and researched sample scope. Partner is an index category, not a synonym for VC. |
| Section navigation | Anchors to `partner-companies`, `partner-people`, `partner-programmes` and `partner-sources`; optional Supporters appears only with a corresponding section. |
| Companies | The sourced company sample leads the profile. A sample count does not claim complete portfolio coverage. |
| People | Linked people and recorded roles, without inferred investment leadership. |
| Rail | Programme relationships, identity evidence and source context, including explicit optional-source failure. |

The route currently uses `name`; stable-ID migration requires a separate reviewed alias/redirect plan. Local safe return context follows the same shared helper as startup profiles. All profile sections remain document-scrolling content.

Firms, funds, cohorts, provider programmes and operators are distinct entities. Identity review, provider evidence, recorded geography and programme eligibility describe different things. Do not infer an eligible offer or funding-round investment from a logo, programme listing or portfolio relationship.

**Verify:** company/person navigation and safe return; direct entry without storage; optional-source failure versus empty research; company-first reading order and narrow programme/source access.

**Still to build:** partner-scoped list/treemap/graph lenses, sourced investment thesis, fund identities and structured portfolio coverage.

## Release review

Review both the affected component specimen and its operational route. Test desktop and a narrow viewport, native/authored controls, keyboard focus, source navigation, missing data, partial/unavailable states, URL restoration and reduced motion where applicable. A composition guide or passing static build does not establish deployment; release evidence must identify the actual commit and published Pages result.
