# Startup Atlas design direction

A practical handbook for extending Startup Atlas as an editorial field guide to companies, people, programmes and their sourced relationships. The aim is a recognisable visual language that makes research easier to inspect, compare and continue.

**Review baseline:** repository main `80b1f4f`, inspected on 16 November 2026. “Implemented” below describes the inspected code and its contracts. “Next” identifies further work, including its interaction or data prerequisites. Neither a direction board nor this document establishes that a particular revision has deployed.

## How to use the handbook

Read the principles before choosing a composition. Use the appropriate view playbook to decide the reading order, next action and data boundaries. Then compare the proposed component with the working catalogue and the operational route. Generated illustrations support discussion; actual values and relationships come from the published research snapshot.

| Review surface | Responsibility |
| --- | --- |
| [Design direction](../web/design-direction.html) | Principles, brand anatomy, voice, motion and view playbooks. |
| [Asset library](../web/design-assets.html) | Concept boards and editorial illustrations, with usage guidance, dimensions, provenance and downloads. |
| [Concept lab](../web/design-lab.html) | The five numbered interface studies and an explicitly fictional component playground. |
| [Working design system](../web/design-system.html) | Real view previews and shared component specimens from the same build. |

## Authority and boundaries

| Decision | Canonical owner |
| --- | --- |
| Runtime palette, typography, spacing and motion | [design-tokens.css](../web/design-tokens.css), documented by [DESIGN.md](../DESIGN.md). |
| Shared actions, badges, navigation, coverage and states | [atlas-ui.css](../web/atlas-ui.css) and [atlas-ui.js](../web/atlas-ui.js). |
| Interaction semantics, URL state and recovery | [UX-CONTRACT.md](../UX-CONTRACT.md). |
| View structure, data prerequisites and implementation sequence | [EXPLORER-VIEWS.md](EXPLORER-VIEWS.md). |
| Handbook content and asset descriptions | [design-handbook.js](../web/design-handbook.js); update this downloadable document when the guidance changes. |
| Research meaning and publication | [KNOWLEDGE-GRAPH.md](KNOWLEDGE-GRAPH.md) and the reviewed source records. |

This direction keeps the existing light field-guide presentation. It does not introduce authentication, a shared research workspace, data editing, universal saved entities or a new financial model. Current opportunity saves are browser-local preferences. The research snapshot remains read-only.

## Five design principles

### 01 · Keep evidence beside the claim.

A useful Atlas record lets a reader understand what is known, where it came from and what remains uncertain without leaving the immediate context.

**Do**

- Place the source and relevant date beside a fact, funding observation or relationship.
- Name the recorded relationship: founded, team member or listed in portfolio.
- Use a neutral initial when a sourced image is absent; keep the identity footprint stable.

**Avoid**

- A verified-looking badge that turns one reviewed source into a guarantee about the whole company.
- Inferring an investment, affiliation or eligibility from a logo, name match or position on a map.
- An attractive profile grid filled with invented sectors, locations, dates or financial values.

### 02 · Give each view a clear job.

The five views share an identity while supporting different decisions: find a record, compare a measure, follow a connection or understand an entity in depth.

**Do**

- Lead search with identity and relevance, a treemap with its measure, and a graph with its root and relationship context.
- Give a profile one obvious next step into its connections, with evidence as a close secondary action.
- Choose a list, table, map or reading column because it suits the information.

**Avoid**

- Forcing every view into the same card grid or filling the top of every page with summary metrics.
- Presenting a visual concept control as an available feature before its behaviour and data exist.
- Using a graph to imply financial scale or a treemap to imply unsourced relationships.

### 03 · Preserve the reader’s place.

Inspection should deepen an existing question. Scope changes and navigation should happen through deliberate, clearly named actions.

**Do**

- Keep graph inspection separate from rerooting; use Explore from here to change the neighbourhood.
- Retain supported query, filter and displayed-range state when returning from a profile.
- Distinguish route links, section anchors and in-place actions through native semantics and specific labels.

**Avoid**

- Rebuilding the map when a reader only selects a node, or resetting a list while opening a source.
- Calling Fit view and Reset layout the same operation.
- Promising exact scroll, camera or saved-workspace restoration when only URL and return-route context are stored.

### 04 · Make the limits readable.

Coverage, dates and exclusions are part of the result. A small researched sample can be useful when its boundaries are explicit.

**Do**

- State the population, matching total and displayed range; label a partner’s researched company sample as a sample.
- Compare one defined monetary measure in one currency and retain its announcement date.
- Give no results, unresearched data, partial loading and total failure different explanations and recovery paths.

**Avoid**

- Turning missing funding into zero, a portfolio sample into the full portfolio, or an old valuation into a current one.
- Adding figures across currencies, overlapping rounds or overlapping company groups without an explicit model.
- Displaying an unavailable dataset as a complete empty result.

### 05 · Keep every route to understanding open.

Responsive design changes the reading order and available space while preserving the task, the evidence and a usable next action.

**Do**

- Pair graph exploration with a connections list and treemap tiles with a ranked list.
- Stack inspectors into document flow on small screens; wrap names and keep controls reachable.
- Provide visible keyboard focus, non-drag actions and the same settled state under reduced motion.

**Avoid**

- Shrinking an entire desktop workspace until its node labels and source links become unreadable.
- Encoding entity kind, uncertainty or selection through colour alone.
- Hiding scrollbars, trapping page scrolling outside a visualization, or placing essential evidence only on hover.

## Brand anatomy

### A field-guide signature

**Role:** Recognition and orientation.

Retain the compact four-part mark and readable Startup Atlas wordmark. The forest masthead provides a stable point of return while the content beneath it changes.

**Use deliberately**

- Keep the mark small enough that the company or research question remains the page’s subject.
- Use a clear home link and name the current design or explorer surface.

**Avoid**

- Recreating real company logos in the Atlas house style.
- Using the Atlas mark as a source-verification or investment-quality seal.

### Editorial headings, precise interface text

**Role:** Voice and information hierarchy.

Georgia carries page headings and short narrative introductions. System sans carries names, controls, facts and evidence. Monospaced text is reserved for tokens and code; tabular figures support comparison.

**Use deliberately**

- Use the shared 12, 13, 15 and 18px scale for supporting interface roles, with responsive display headings.
- Let complete entity names wrap; keep sources and key actions readable at narrow widths.

**Avoid**

- Serif display styling on dense filters, node labels or every financial number.
- Reducing the whole interface to small annotation text to fit more records.

### Paper, canvas and a measured accent

**Role:** Task hierarchy.

Parchment introduces and explains. The pale green canvas supports sustained exploration. White gives controls and content a clear surface. Forest carries structure; terracotta marks a deliberate point of attention.

**Use deliberately**

- Consume the shared --atlas-* tokens and use thin rules before adding elevation.
- Reserve the overlay shadow for overlays and maintain a visible boundary around controls.

**Avoid**

- A new palette for every route, decorative gradients or a shadow on every fact.
- Treating a browser dark-mode preference as a complete supported dark theme.

### Space follows the research task

**Role:** Density and composition.

Build with the 4, 8, 12, 16, 24, 32 and 48px spacing scale. Use 8px control corners and 13px panel corners. A comparison workspace can be broad; a company dossier benefits from a quieter reading measure.

**Use deliberately**

- Align names, metadata and evidence consistently within rows and fact lists.
- Separate major profile sections with whitespace and rules; keep one purposeful primary action.

**Avoid**

- Turning every label/value pair into its own card.
- Using a fixed-height application shell that clips long profiles or source notes.

### State has a consistent meaning

**Role:** Recognition beyond colour.

Named entity badges describe type. Warning and error tones describe availability. Graph root, inspected selection and keyboard focus remain distinct even when they apply to the same node.

**Use deliberately**

- Pair a categorical mark with its text label and expose toggles through selected or pressed semantics.
- Use white focus outlines on dark headers and the focus token on pale surfaces.

**Avoid**

- Using green to imply an organisation is verified, funded or performing well.
- Reusing an entity-kind colour as the sole sign of a warning or error.

### Illustration makes room for the idea

**Role:** Editorial support.

Use symbolic illustrations at introductions and section transitions. Concept boards show a possible composition; actual records, charts and relationships continue to come from the implemented views.

**Use deliberately**

- Keep generated concepts visibly labelled and let readers open the corresponding working view.
- Place transparent artwork on a calm surface and keep text and controls outside its detailed areas.

**Avoid**

- Using a generated network as evidence of a real connection or generated chart geometry as quantitative data.
- Putting decorative art behind a source list, obscuring controls or substituting illustration for a real empty-state explanation.

### Foundation reference

These values are the inspected runtime mapping, not a second theme. Read current computed CSS in the working system when checking an implementation.

| Role | Token | Value |
| --- | --- | --- |
| Forest ink | `--atlas-ink` | `#173a2b` |
| Action | `--atlas-action` | `#184b32` |
| Working canvas | `--atlas-canvas` | `#f4f7ef` |
| Editorial paper | `--atlas-paper` | `#f6f0e5` |
| Content surface | `--atlas-surface` | `#ffffff` |
| Quiet border | `--atlas-border` | `#d8e1d2` |
| Control boundary | `--atlas-border-strong` | `#a7b8a0` |
| Supporting text | `--atlas-muted` | `#52675a` |
| Terracotta accent | `--atlas-accent` | `#b84d2b` |
| Keyboard focus | `--atlas-focus` | `#ad3d19` |

Named entity colours reinforce startup, person, partner, provider and programme labels. Warning and error tones describe availability independently. Consult the categorical pairs in [DESIGN.md](../DESIGN.md#categorical-and-state-pairs) when combining a foreground and a surface.

Use the 4/8/12/16/24/32/48px spacing scale, 8px control corners and 13px panel corners. Shared buttons have a 42px minimum height and view links have a 40px minimum height. Interface roles use the 12/13/15/18px type scale; display headings respond to available space. Graph annotation size is not the model for core names, actions or sources.

Wide comparison surfaces and quieter profile reading measures serve different tasks. Keep the document as the owner of page scrolling. A bounded chart may own its internal overflow; it does not justify a fixed application shell that clips a long profile.

## Voice and interface copy

Write as an observant research guide: specific, calm and clear about the available evidence. Use Australian English. Prefer a concrete noun and action over promotional language, and explain uncertainty without making the reader decode technical failure details. The bracketed values below are templates, not company facts.

| Situation | Prefer | Avoid | Reason |
| --- | --- | --- | --- |
| Introduce search | Explore companies, people and their connections. | Unlock the world’s most powerful startup intelligence. | Describe the task in plain language; avoid unsupported superlatives. |
| Funding research is absent | Funding has not been researched yet. | Total funding: $0. | An absent record is a research limitation, not a financial finding. |
| Show partner coverage | [Count] companies researched · selected sample. | Portfolio size: [count]. | Name the population actually counted; do not imply completeness. |
| Describe a dated observation | Recorded valuation · [currency] [amount] · Announced [date]. | Current company value: [amount]. | Keep the measure, currency and date attached to the figure. |
| Describe a portfolio relationship | Listed in portfolio · View evidence. | Invested in this company’s latest round. | A portfolio listing does not establish a particular funding event. |
| Optional company research fails | Company research could not be loaded. Reload to try again. | This organisation has no portfolio companies. | Explain the failed request without turning it into a claim about the organisation. |
| Change the graph root | Explore from here. | Expand. | Name a new starting point; reserve expansion language for an implemented branch-expansion action. |
| Explain an opportunity save | Saved in this browser. | Added to your shared research workspace. | Describe the existing local preference without implying an account, sync or entity collections. |

Use “source”, “recorded”, “announced” and “reviewed” for their separate meanings. A source publication date, event date and research-review date are not interchangeable. Avoid a generic “verified” label that implies more than the underlying review supports.

## Motion and change

| Runtime token | Standard value | Use |
| --- | --- | --- |
| `--atlas-duration-fast` | `140ms` | Small control feedback: hover, press and surface changes. |
| `--atlas-duration-normal` | `220ms` | A simple change of emphasis or local component state when a transition helps orientation. |
| `--atlas-ease` | `cubic-bezier(.2,.8,.2,1)` | Shared easing for short interface transitions. |

- Update the selected state and its accessible label immediately. A transition may explain the change, but must not delay the action.
- Use short colour, border or opacity changes. Keep research text readable throughout; avoid bouncing cards, ambient network drift and animated numbers.
- Preserve graph geometry during inspection. Force movement serves layout after a scope or arrangement change, not decoration.
- Treat Fit view as a camera operation and Reset layout as an arrangement operation. The animation must not conceal which state changed.
- The 140ms and 220ms tokens describe interface transitions, not loading deadlines or a fixed graph-simulation duration. Show real pending work honestly.

### Reduced motion

- The runtime sets both duration tokens to 0ms under prefers-reduced-motion: reduce; consume those tokens instead of overriding them locally.
- Remove decorative and prolonged movement while preserving selection, focus, actions and the settled graph result.
- A motion example must remain operable with animation removed. Show its resulting state through text and selection styling.

Check focus and the settled result independently of animation. A motion preview may demonstrate a local state change, but must not imply that selecting a graph node reroots the actual map.

## Five view playbooks

Each playbook separates the intended composition from implemented behaviour and further work. Use [the explorer specification](EXPLORER-VIEWS.md) and [the interaction contract](../UX-CONTRACT.md) to resolve detailed URL, data and recovery rules.

### List & search

**Question:** Which records deserve a closer look?

Help a founder find an entity or opportunity, understand why it matches and choose a useful profile, graph or source link.

[Open the implemented view](../web/index.html?type=startup#directory). Current behaviour is grounded in [app.js](../web/app.js), [table-model.js](../web/table-model.js) and the shared navigation helper.

#### Layout

- Scope first: make All, Opportunities and Partner index distinct. Put the query and the filters relevant to that scope together.
- Results second: lead each mixed-entity row with identity, a short description and a named type. Keep evidence and graph navigation secondary.
- Count before pagination: show the full matching total and the displayed range beside the result list, then offer explicit Load more.
- Inspection direction: a future selected-row panel should sit beside the list on wide screens and enter a clear reading order on small screens. The entity name remains a real profile link.

#### Interaction

- Keep focus in the active query or filter. Clearing the query applies immediately and returns focus to the search input.
- Changing a query or filter resets the displayed range. Load more reveals another bounded slice and updates the shown parameter.
- Opening a profile preserves the originating route and supported filters/range where session storage is available.
- Carry a query to another view only with an honest account of that destination’s population and matching rules.

#### Data boundaries

- All contains multiple entity types; a company treemap contains startups only. Identical query text does not mean an identical result population.
- Opportunity market and eligibility filters differ from partner office-location and identity-review filters. Do not transfer incompatible hidden restrictions.
- Count every matching record before slicing. A displayed batch is not the complete result total.
- Browser-local opportunity saves are implemented; saved entities, saved searches, comparison and shared collections are separate work.

#### Accessibility and narrow screens

- Use a semantic list for mixed entities and a table only when columns describe genuinely comparable fields.
- Label search independently of its placeholder, preserve complete names and make the clear action keyboard reachable.
- Respect text composition and avoid excessive result announcements while typing.
- Check native selectors and the existing authored facet menus for keyboard choice, Escape, focus return and narrow-width behaviour.

#### Implemented at the review baseline

- Cross-entity search and entity-kind choice, plus opportunity and partner-specific filter scopes.
- Twelve initial results and twelve more per Load more action, with matching total and displayed-range reporting.
- URL query/filter/shown state; valid displayed-range restoration is capped at 1200 records.
- Real profile and graph links, safe per-tab profile return context and browser-local opportunity saves.

#### Next implementation work

- Add explicit row selection and a non-modal inspector with a named close action and stable return focus.
- Restore an exact list scroll anchor without losing the existing supported range and filters.
- Add structured startup facets only after their sourced field definitions and coverage are available.
- Define entity collections and comparison independently from the existing opportunity-save preference.

### Company treemap

**Question:** How does this researched selection compare under one measure?

Make relative scale inspectable while keeping the selected measure, currency, observation dates and coverage visible.

[Open the implemented view](../web/treemap.html?metric=funding&currency=USD). Current behaviour is grounded in [treemap.js](../web/treemap.js) and [treemap-model.js](../web/treemap-model.js).

#### Layout

- Measure bar: place metric, currency, grouping and company search above the canvas; keep Treemap and Ranked list as equivalent ways to inspect the same selection.
- Coverage line: explain the plotted population and excluded records beside the measure, before the reader interprets area.
- Canvas: use proportional rectangles with identity marks that respect the available space; tiny labels must not be the only route to a company.
- Evidence inspector: separate the plotted observation from other company context. Keep its date, source, currency and Open full profile action together.
- Narrow layout: stack the company detail into document flow and preserve a readable ranked-list alternative.

#### Interaction

- Selecting a tile or its ranked-list equivalent identifies the same company and exposes the same observation.
- Changing metric or currency recomputes eligibility and coverage together; the title and inspector must not retain the previous measure.
- Founding-decade drill-down changes the visible cohort. Reset restores the route’s reviewed defaults.
- Open a founder, company profile or source through a real link, retaining the originating comparison route where supported.

#### Data boundaries

- Company count assigns one unit per startup. Financial metrics require a positive numeric value, valid announcement date, selected currency and source.
- Funding announcement amount describes an event, not cumulative funding. Recorded valuation is a historical observation, not a current valuation or public market capitalisation.
- Choose the latest eligible observation for the selected measure/currency. Keep a newer-unplotted-event notice when a later event is not comparable.
- Do not parse money from prose, silently convert currencies, count missing values as zero or sum overlapping events.
- Founding decade is the implemented grouping. Sector, geography and partner groupings need reviewed classifications and explicit overlap rules.

#### Accessibility and narrow screens

- Provide keyboard-operable tile controls and an equivalent ranked list with complete company names and sources.
- Keep selection distinct from hover and give the inspector a meaningful heading in normal reading order.
- Retain label and value access when tiles are too small for text; logos alone do not identify every company.
- At narrow widths, keep measure controls usable and prefer readable detail over a uniformly shrunken chart.

#### Implemented at the review baseline

- Company-count, funding-announcement and recorded-valuation measures with explicit currency, search and founding-decade controls.
- Proportional tiles, ranked list, cohort drill-down, coverage and source-linked observation details.
- The inspector also exposes sourced founder links/portraits, recorded company facts and separate financial context where available.
- Metric, currency, grouping, query, cohort and list mode have route state; the selected company does not yet have a dedicated deep-link parameter.

#### Next implementation work

- Persist selected-company state so a shared comparison link can reopen the intended inspector.
- Add sourced sector and geography groupings with a clear rule for companies in more than one category.
- Introduce partner-scoped distributions with unique company IDs and visible relationship/sample boundaries.
- Carry compatible originating scope between list and treemap through a documented adapter.

### Relationship graph

**Question:** How is this entity connected, and what should I follow next?

Explain a bounded neighbourhood of sourced relationships while letting the reader inspect a connection without losing the existing map.

[Open the implemented view](../web/graph.html?entity=startup%3Acanva&depth=2). Current behaviour is grounded in [graph.js](../web/graph.js), [graph-layout.js](../web/graph-layout.js) and [graph-model.js](../web/graph-model.js).

#### Layout

- Root context: name the entity that defines the neighbourhood above the canvas, alongside search, depth and entity-type controls.
- Canvas: give typed identity cards enough space for legible names. Edges represent recorded predicates; quiet grouping is spatial context only.
- Inspector: identify the selected entity, explain whether it is inside the current map and offer separate Open profile and Explore from here actions.
- Equivalent list: expose visible connections and their evidence through a readable list, with a clear disclosure when the map is limited.
- Responsive direction: retain an overview and zoom controls, then prioritise the connections list and inspector when node labels would become too small.

#### Interaction

- Click or Enter/Space inspects a node. Selection does not change the root or discard the current arrangement.
- Explore from here deliberately reroots the neighbourhood. Selecting a search result also starts a new root.
- Dragging or arrow-key movement arranges a node. Fit view changes the camera; Reset layout restores automatic placement.
- Selection-only Back within the same root, depth and type filters preserves the existing geometry and camera. A scope change or reload can recompute layout.
- A related entity may be inspected outside the rendered neighbourhood; label that state instead of inventing an on-map position.

#### Data boundaries

- Use the real predicate: founded, listed in portfolio, team member or another recorded relationship. Visual proximity is not evidence.
- A portfolio or support relationship does not establish a particular funding-round investment or the partner who led it.
- One or two hops and density limits define the visible neighbourhood. State when it is capped; do not imply the visible map is complete.
- Entity-type filters are implemented; incremental branch expansion and relationship-type filters remain separate features.

#### Accessibility and narrow screens

- Keep root, inspection and keyboard focus visibly distinct; repeat entity kinds and relationship meaning in text.
- Provide a non-drag route for positioning and a non-visualization route to each visible relationship and source.
- Preserve useful focus when a reroot removes the triggering node, and give icon-only controls clear accessible names.
- Respect reduced motion and prevent canvas gestures from trapping page scrolling outside the graph.

#### Implemented at the review baseline

- One/two-hop neighbourhoods, type filters, search, a force-directed layout and a source-linked connections list.
- Root/selection separation, an inspector with explicit rerooting, and an Outside current map state.
- Pointer dragging, keyboard node movement, zoom, Fit view and Reset layout.
- Root, selection, depth, types, query and list visibility are encoded in the route; camera and manual positions are not persisted across reload.

#### Next implementation work

- Design deliberate branch expansion with omitted-connection counts and a reversible scope change.
- Add relationship-type filters only when their names and inclusion rules are clear.
- Define persistence and reset behaviour for pins, camera and arrangements across reload and root changes.
- Refine the mobile arrangement so the overview, readable list and selected detail form one intentional journey.

### Startup explorer

**Question:** Who built this company, and what is known about it?

Present a company as a sourced research dossier, with founders and meaningful connections at the centre of the next exploration step.

[Open the implemented view](../web/entity.html?id=startup%3Acanva). Current behaviour is grounded in [entity.js](../web/entity.js) and its shared profile/return primitives.

#### Layout

- Identity: complete name, sourced summary, type and one primary Explore connections action. Follow with a compact statement of research coverage.
- Section anchors: Founders, Company, Funding, Connections and Sources lead to real headings in one document.
- Founder-first content: link each recorded founder as a person with relationship evidence, then present company facts in aligned label/value/source rows.
- Funding history: group each event’s stage, date, amount, valuation and note without implying that different measures are interchangeable.
- Evidence rail: keep source links and article context close to the dossier; stack the rail after the relevant content on narrow screens.

#### Interaction

- Open a founder to follow other researched ventures, or choose Explore connections to keep the same startup as graph root.
- Section anchors change the reading position without replacing the original return context.
- Keep website, source and internal entity links recognisable as different destinations.
- A directly opened or unavailable profile retains a useful graph/directory route even without saved session context.

#### Data boundaries

- Founders come from sourced founded relationships. A matching name or team role alone is insufficient.
- Missing founders or funding means unresearched information, not a founderless or unfunded company.
- Keep founding, product-launch, announcement and review dates separate. Rebuilding the snapshot does not refresh an old observation.
- Retain an announcement’s original currency uncertainty and instrument notes; do not infer round investors from portfolio connections.
- Structured sectors, operating geography, company status and ownership history need source-backed records before becoming universal profile fields.

#### Accessibility and narrow screens

- Use a logical heading order and real anchors; all research sections remain available in document flow.
- Wrap complete names and long source titles without forcing horizontal page scrolling.
- Give portraits/logos stable footprints with neutral fallbacks; adjacent names carry identity.
- Keep primary actions, source links and the original return link reachable at desktop and narrow widths.

#### Implemented at the review baseline

- Identity, research coverage, prominent founders, sourced company facts, funding events, connections and articles.
- Founders/Company/Funding/Connections/Sources anchors; generic person and programme pages expose only applicable sections.
- Source-linked historical amounts and explicit unresearched states, including unspecified currency where recorded.
- Contextual graph entry and safe internal return routes with supported originating filters and displayed range.

#### Next implementation work

- Build a dated company timeline that distinguishes operational milestones, ownership and funding events.
- Add structured sectors, geography and status only as their provenance and review model become available.
- Introduce event-specific investors and ownership history through explicit relationships, not inferred portfolio links.
- Define comparable-company discovery with sourced criteria and a visible explanation of why a company appears.

### Partner / VC explorer

**Question:** Which companies, people and programmes connect to this organisation?

Explain an organisation’s recorded role and the scope of its researched relationships, with companies before team members and programme details.

[Open the implemented view](../web/partner.html?name=Airtree). Current behaviour is grounded in [partner-profile.js](../web/partner-profile.js) and its separate optional-research readers.

#### Layout

- Identity: name the sourced organisation type and summary, with Explore connections as the primary route into its network.
- Coverage: place Companies researched and People researched in the context of a selected sample, not an assumed full portfolio or team.
- Company section: put the researched companies before people; each entry exposes a relationship/source and a profile route.
- People and programmes: keep role labels, optional programme supporters and programme relationships separate from company investments.
- Sources: explain identity review, sample review and geography/eligibility distinctions; retain the same document-flow hierarchy on small screens.

#### Interaction

- Use real section anchors and profile links to move through companies, people, programmes and sources.
- Open the organisation’s graph from its recorded identity, then inspect or reroot using the graph’s existing interaction model.
- Optional research failures preserve the organisation identity and explain which section is unavailable.
- Future company-list, treemap and graph lenses must act on one explicit researched company set and retain the selected company and relationship context.

#### Data boundaries

- Partner is an index category. A venture firm, accelerator, university, venture studio, fund and programme are not interchangeable entities.
- A sampled company list is not the full portfolio; a sampled people list is not the complete current team.
- Portfolio membership does not prove an event-specific investment, amount, fund identity or individual deal lead.
- Office location, investment geography and programme eligibility are different fields. Provider relationships do not guarantee access or credits.
- Any future monetary portfolio lens describes company observations, not the organisation’s invested capital, assets under management or returns.

#### Accessibility and narrow screens

- Preserve company-first reading order when the evidence rail stacks; do not move the main sample below a large decorative masthead.
- Name organisation type, people’s roles and relationship status in text rather than relying on badges or logos.
- Use the shared section/link focus treatment and keep the full identity and source names available.
- Distinguish unavailable optional research from a valid unresearched section in visible text and status.

#### Implemented at the review baseline

- Sourced organisation identity/type, company and people samples, programme/provider relationships and review notes.
- Companies before people, optional supporters, section anchors and a graph entry action.
- Visible sample boundaries and distinct optional-data failure states.
- Partner-name URLs and safe per-tab return context; the profile still has separate JSON readers from the graph-backed entity explorer.

#### Next implementation work

- Add partner-scoped list, treemap and graph lenses with deduplicated company IDs and visible coverage.
- Model investment thesis, stages, geography and fund identities through individually sourced, dated fields.
- Add relationship/date filters and a documented completeness model for portfolio coverage.
- Consolidate data access while preserving partial-data behaviour; migrate to stable IDs only when reviewed aliases and redirects exist.

## Asset roles and provenance

The asset library contains three kinds of material. Direction boards explore the overall visual and responsive language. Concept studies illustrate possible interfaces with fictional examples. Transparent editorial illustrations introduce ideas; they do not represent real entities, affiliations, geography or quantitative evidence.

| Asset | Kind | Intended role |
| --- | --- | --- |
| The editorial field guide | direction | Use to review the overall relationship between brand, interface density and research content. |
| One task across different spaces | direction | Review hierarchy and reading order across desktop and narrow layouts. |
| Discover | illustration | Place near an introductory research question or a field-guide section opening. |
| Connect | illustration | Introduce relationship exploration or a section about navigation continuity. |
| Evidence | illustration | Introduce source literacy, the evidence principle or research-method documentation. |
| List & search | concept | Review filtering, result hierarchy and a proposed adjacent inspector. |
| Company treemap | concept | Review the relationship between a measure, coverage, tile identity and company context. |
| Relationship graph | concept | Review root/selection distinction and a focused relationship neighbourhood. |
| Startup explorer | concept | Review founder prominence, company facts, timeline direction and evidence placement. |
| Partner / VC explorer | concept | Review company-first exploration, sample coverage and people/role context. |

All asset records live in [design-handbook.js](../web/design-handbook.js). The five interface concepts retain their canonical paths and exact generation instructions from [design-concepts.js](../web/design-concepts.js), including any separately recorded refinement prompt. The new boards and illustrations keep their own exact prompts and measured dimensions in the handbook manifest. An empty prompt or unmeasured dimension is a pending provenance field, not permission to invent one.

Use thumbnails for a gallery and the full image for inspection or download. Keep each pair on the same revision. Preserve alpha in transparent illustrations; preview them against a calm surface with enough contrast to see the silhouette. A checkerboard may explain transparency inside an asset inspector, but is not the product’s editorial background.

Keep actual facts, dates, links and interface labels in selectable HTML. If an illustration is purely decorative beside an equivalent heading, use an empty image alternative. If the image carries meaning that is not otherwise expressed, provide a concise description of that purpose. Generated interface text is not an accessible replacement for the real control or a source attribution.

### Known proposal boundaries in the images

- The list study’s structured startup facets and adjacent inspector are proposed work.
- The treemap study’s sector grouping is proposed; founding-decade grouping is implemented. Its sample figures and tile geometry are illustrative.
- The graph study uses fictional entities and relationships. Its topology cannot establish a real connection or investment.
- The startup study proposes a broader timeline and saved-research actions beyond the current dossier.
- The partner study proposes portfolio list/treemap/graph lenses and thesis content beyond the current company sample.
- The responsive board is direction-setting material. Verify the actual working views at narrow widths; the board does not certify their implementation.

## Choosing the next implementation slice

1. Choose the reader’s task and the view that owns it. Identify the existing code owner before adding a new component or state model.
2. Check whether the needed data exists with the right meaning, source and date. When it does not, keep the proposed control in the concept/roadmap layer.
3. Define selection, scope, navigation and return behaviour in words before polishing the composition. State which URL parameters persist.
4. Reuse the shared token and component owner. Introduce a new primitive only when its role cannot be expressed by the existing one.
5. Verify the affected working journey, including keyboard access, narrow screens and a meaningful missing/error state. Review the rendered result as well as the source.
6. Update the implementation status and record the exact review/build/deployment evidence. A polished image, passing local check or open PR is not a public release.

### Journeys that should continue to hold

- List/search → company profile → section anchor → return to the originating scope and displayed range.
- Company profile → graph rooted at the same company → select a person → inspect without moving the root → explicitly explore from that person.
- Treemap metric/currency → selected company evidence → full profile, with unknown and newer-unplotted observations still explained.
- Airtree → Canva → Melanie Perkins → Fusion Books through the existing researched relationships and their evidence.
- Partner identity with failed optional company research → an explicit partial-data state, retaining the identity and useful recovery.
- Every affected route at a narrow viewport with visible focus, complete names, reachable sources and an equivalent readable list where the visualization needs one.

These journeys are review criteria. They do not replace the repository’s browser checks or confirmation of the exact Pages deployment.
