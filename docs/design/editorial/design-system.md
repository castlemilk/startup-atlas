# Startup Atlas — Editorial design system

**Status:** Chosen visual direction, proposed interaction specification and generated wireframes. This document does not establish an implemented or validated runtime.

**Repository handoff:** Approved editorial design target, packaged on 20 November 2026. See [the gallery](README.md), [implementation handoff](HANDOFF.md), and [asset manifest](asset-manifest.json). Runtime integration and its acceptance evidence are tracked separately.

**Version:** 1.1 · 20 November 2026

**Scope:** Startup discovery through treemaps, knowledge graphs, lists, entity inspectors and profiles.

**Visual authority:** The approved warm editorial wireframes and supplied Stitch export. The earlier porcelain/graphite/cobalt brief is historical exploration.

## 1. Purpose and character

Startup Atlas should feel like a precise research workspace with the readability of a well-edited publication. Warm paper, forest ink, expressive serif headings and compact controls establish its character. Company identities, relationships, measurements and evidence provide the visual interest.

The interface must support repeated analytical work: narrow a population, understand its distribution, inspect an entity, follow a relationship, check a source and return to the previous context. Every view is a representation of the same underlying entity and exploration state.

These specifications are design decisions. Generated screens illustrate composition and interaction moments; their labels, logos, numeric proportions, countries and company metadata do not prove factual accuracy or implementation behaviour. Prototype imagery may contain approximate chart geometry, category or country placements, and formatting. The text contracts and calculated layouts govern the build. Production assets and records require their own authoritative inputs.

## 2. Design principles

1. **Expose useful structure.** Show the scope, active filters, grouping and metric before asking someone to interpret a visualisation. Use borders, aligned columns and restrained section headings to make that structure visible.
2. **Preserve identity and context.** The same company keeps its canonical name, logo and entity ID across a tile, graph node, table row, inspector and profile. Changing views should preserve the user's question.
3. **Make density deliberate.** Put related facts close together, leave clear space between groups and let users choose comfortable or compact presentation. Do not achieve density through unreadable text or overlapping controls.
4. **Treat evidence as part of the record.** Present source attribution, dates and uncertainty beside relevant claims. An attractive badge or a source count alone does not establish verification.
5. **Give colour a defined job.** Forest anchors hierarchy; rust identifies deliberate actions and selected details; chart colours explain a declared encoding. Labels and geometry must also communicate state.
6. **Let motion explain change.** Movement should connect a selected entity to its details or explain regrouping. It should settle promptly and respect reduced-motion preferences.

Avoid decorative audit stamps, invented confidence percentages, arbitrary archival identifiers and ornamental terminal language. Use ordinary labels such as “Sources,” “Funding,” “Headquarters” and “Open profile.”

## 3. Colour system

| Role | Value | Intended use |
|---|---|---|
| Paper | `#F9F8F5` | Main application canvas |
| Recessed surface | `#EFECE4` | Toolbar trays, secondary regions |
| Record surface | `#FFFFFF` | Records, popovers, inspectors |
| Forest ink | `#122B22` | Primary text, strong structure |
| Muted ink | `#60675D` | Secondary text and metadata |
| Decorative rule | `#E2DDD3` | Nonessential separators |
| Rust accent | `#C85A32` | Accents and decorative emphasis |
| Rust text | `#9F3D1D` | Small rust text on white |
| Primary action | `#A84121` | Filled primary buttons with white text |
| Selection wash | `#F5E7DF` | Selected rows and contextual surfaces |
| Focus | `#1B382B` | Keyboard focus outline |

Computed solid-colour contrast ratios are **14.18:1 forest/paper**, **5.50:1 muted/paper**, **6.10:1 white/primary-action**, and **6.65:1 rust-text/white**. Bright rust on white is **4.23:1**: do not use it for normal-size small text or normal white-text buttons. These arithmetic checks are not full accessibility conformance. Transparency, photographs, chart backgrounds, actual typography and interactive states require separate evaluation.

The decorative rule is deliberately subtle. Use the stronger control boundary token where recognizing an input or action depends on its outline. Keep selection, keyboard focus, validation errors and quantitative chart colour distinguishable.

### Chart palette and legends

These proposed sector colours are separate from entity-type semantics. Use them only when the selected colour field has these categories; every legend must match the actual field and values.

| Proposed chart category | Tint / ink |
|---|---|
| Design | `#E9F1F0` / `#1F4E4B` |
| Developer tools | `#EBEFF9` / `#2C468A` |
| Finance | `#EFF3ED` / `#38543B` |
| Biotechnology | `#FAF1E3` / `#875317` |
| Industrial / other | `#F8EDE7` / `#91381E` |

For continuous values, use a sequential scale from `#EFF3ED` through `#82A291` to `#1B382B`, with higher values darker. Show numeric domain, units and period in the legend; choose contrasting label text for each fill. Unknown uses recessed `#EFECE4`, muted `#60675D` ink and an explicit “Unknown” label or pattern, outside the numeric scale. “Other” is a known residual category, not unknown. **Days since source check** measures elapsed time; it must not be labelled or interpreted as verification, reliability or confidence.

## 4. Typography and spacing

Use **Newsreader** for page titles, entity names in prominent contexts and editorial section headings. Use **Inter** for navigation, controls, body copy, metadata and tables. Provide explicit fallbacks and tolerate font-loading changes without losing controls or truncating essential labels.

| Role | Proposed size / line height | Treatment |
|---|---|---|
| Page title | 36 / 42px desktop; 28 / 34px narrow | Newsreader, regular |
| Profile title | 32 / 38px | Newsreader, regular |
| Section title | 22 / 28px | Newsreader, medium |
| Record title | 16 / 22px | Inter, semibold |
| Body and controls | 14 / 20px | Inter, regular or medium |
| Supporting data | 13 / 18px | Inter, regular |
| Short metadata label | 12 / 16px | Inter, medium |

Use tabular numerals for aligned counts, currency, percentages and dates. Sentence case is the default; uppercase is reserved for short structural labels. Long descriptions wrap naturally. Essential entity names must remain available through visible detail or accessible text when truncated.

Spacing follows **4, 8, 12, 16, 24, 32 and 48px**. Panels have 0–2px corners, controls 4px and dialogs 8px. Comfortable desktop controls are 36–40px high and rows 44–48px. Optional compact rows are 36px; coarse-pointer targets remain at least 44px.

## 5. Layout recipes

### Analytical workspace

Use the available width for the graph, treemap or list. A compact header provides product navigation, search and workspace actions. Below it, a scope row identifies the current drill path and result population. A toolbar holds view switching, filters, grouping, metric and density controls.

An optional **320–360px inspector** sits beside the main canvas. It must not squeeze the visualisation into an unusable column. A permanent left sidebar is not required; filters may live in a toolbar popover or drawer. Container width determines when the inspector becomes an overlay or separate panel.

### Profile and evidence

A full profile uses a readable maximum width of approximately **1240px**. Start with identity, location, concise description and important sourced facts. Follow with overview, people, funding, relationships and sources. The page may use a secondary evidence column, but reading order must remain clear when it collapses.

### Narrow and mobile layouts

Keep scope and result count visible. Move secondary filters into a drawer and give view switching a compact, labelled control. Inspectors become a sheet or full-screen detail view with a clear return action. Lists may scroll horizontally inside their own region or use deliberate record summaries; avoid page-wide horizontal overflow.

## 6. Core component inventory

| Component | Contract |
|---|---|
| Button | Verb-led label; primary, secondary, outline or quiet treatment; visible busy and disabled states |
| Icon button | Accessible name; tooltip on hover/focus; adequate hit area |
| Search | Clear scope, clear action and distinct pending/empty states |
| Single-select dropdown | Current value remains visible; selection commits immediately |
| Country multiselect | Searchable checkbox options, draft state and explicit Apply/Cancel |
| Applied filter chip | Applied constraint plus removal control; never represents an uncommitted draft |
| Entity identity | Canonical logo, name and type reused across views |
| Metric | Value, unit, period and missing-value semantics |
| Inspector | Selected entity, relevant facts, sources and “Open profile” |
| Source reference | Claim context, publisher/title, date and navigable reference |
| Comparison control | Membership independent from the inspected entity |
| Status notice | Describes current state and offers a concrete recovery action |

Primary actions use the darker action rust. Secondary actions may use forest. Quiet actions should retain an obvious interactive affordance. A busy action keeps its label and dimensions stable. Disable controls only when there is a meaningful reason, and expose that reason without requiring hover.

Dropdown triggers include their field label and value, for example “Size by: Disclosed funding.” A placeholder must not replace the field label. Dialogs and inspectors need visible close controls in addition to keyboard dismissal.

## 7. Country definitions and filtering

**Country means headquarters country by default for company anchors.** It must not silently alternate between headquarters, incorporation, founding location or a founder's nationality. In mixed graphs, founders, investors and programmes may appear as relationship context without matching a company's headquarters predicate. Label context nodes outside the company query and exclude them from company result counts; do not silently apply company geography semantics to every entity type.

| Basis | Meaning |
|---|---|
| Headquarters country | Recorded location of the company's primary headquarters |
| Incorporation country | Jurisdiction in which the relevant company entity is incorporated |
| Founding location | Recorded place where the company was founded |

Show the chosen basis near the filter and in relevant column headings. Unknown or contested headquarters remain unknown or contested until resolved; do not infer a country from a logo, domain, founder identity or investor relationship. Source and date location claims where available.

Countries combine with **OR**: Australia plus New Zealand includes either. Different facets and the drill path combine with **AND**. No selected countries means **All locations**, including records with missing country data. Offer “Country not recorded” as an explicit selectable option.

The country popover contains search, checkboxes, scoped counts, selected-count feedback and an Apply/Cancel footer. Country names remain visible beside optional flags. Its closed trigger shows “All locations,” selected country names, or an explicit selected-country count; never show “All countries (24)” when 24 means companies. Region selections expand into a defined country set, and partial selections show an indeterminate state. Avoid ambiguous labels for regional membership.

Option counts use the current drill path and other applied facets while excluding this country facet. Label them **“Companies in current scope.”** Distinguish a computed zero from unavailable or loading counts. Counts must represent unique canonical entities, with the eligible entity type stated when the view includes multiple types. Separately label the **company-query count**, which applies search and facets without the drill path, and the **visible company count**, which additionally applies the path. For the fixture: 12 companies match AU+NZ; 8 are visible in Australia.

### Draft and request lifecycle

Opening the control copies applied choices into a draft. Checkbox changes update the draft and leave existing results intact. Apply submits that entire draft atomically. Escape, Cancel and outside dismissal discard uncommitted changes and restore focus to the trigger.

During a request, mark previous results as still belonging to the previous applied state. On success, update the applied constraints, results, counts and shareable state together. On failure, preserve the draft, previous applied labels and previous results with a clear failure notice; offer Retry and Cancel. Never label stale results as matching an unsuccessful request. Associate every Apply and count-preview request with its exact query snapshot. Only the latest active snapshot may commit; older or cancelled responses cannot replace counts, results or applied labels.

Show a projected draft result count only if it was calculated for that exact draft. A spinner or “Updating count” is preferable to a misleading number. Disable duplicate Apply submissions without losing the user's choices.

## 8. Drilldown, clearing and exploration state

Breadcrumbs describe the current scope, such as **All ecosystems → Australia → Sydney**. A group expansion narrows the path; a company selection opens its inspector. Give these separate actions so inspecting a tile does not unexpectedly navigate away.

Preserve applied facets, chosen metrics, density and selected entity while drilling. Returning to a parent restores its previous viewport where practical. A country or city drill remains bound to the chosen location basis. If changing that basis invalidates a path, explain the change and return to the nearest valid parent.

The following actions have deliberately different meanings:

- **Clear filters:** remove facet constraints while retaining search text, the current drill breadcrumb, inspected entity and comparison membership.
- **All ecosystems:** return the drill path to its root while preserving the search query, applied facets, inspected entity and comparison membership.
- **Reset exploration:** clear search, facets, path, inspection and comparison membership, then restore the documented defaults of Treemap view, equal company-count area, technology type for grouping and colour, and comfortable density. Use this label only for that full operation.

A compact scope summary makes combined restrictions visible. For example: “Australia · HQ countries: Australia, New Zealand · Seed.” If filters and drill path have no intersection, show both constraints and offer a precise recovery action.

View changes retain the query, facets, drill path, inspection selection and comparison set. Preserve a selected entity even when it falls outside results: keep its inspector with **“Outside current results”**, **Adjust filters** and **Clear selection**. Never silently select the first remaining result.

## 9. Group, size and colour controls

These controls change representation immediately, without a second Apply step. They preserve entity selection and expose a busy state if recalculation is required.

**Group by** supports primary sector, country, city and funding stage. Use a canonical primary sector for additive sector totals. If a future mode supports multiple memberships, clearly distinguish repeated appearances from unique entity counts. Missing classifications belong to a labelled group.

**Size by** declares exactly what area represents. Examples include disclosed funding in a stated currency and period, or equal-sized company counts. Compute treemap areas from the underlying values; generated images are not geometric specifications. Do not distort small values to fit labels. Move details to focus/hover disclosure or a companion list instead.

**Colour by** uses a matching categorical or sequential legend. Categories need names; quantitative encodings need units and a defined scale. Do not encode an unrelated financial signal through selection colour. Use an outline or selection marker that leaves the metric readable.

Unknown, undisclosed and inapplicable values remain distinct. A company with an explicitly undisclosed round is different from one whose funding history is unknown. Zero is a recorded numeric value. Missing values must never become zero-sized evidence of no funding.

Totals must state their coverage: for example, “12 companies; funding amounts available for 9.” Aggregate compatible currencies or disclose the conversion basis and date. A chart built from only the current table page must say so; whole-result visualisations require the complete eligible population or an authoritative aggregate.

## 10. Logos and identity

Use canonical entity assets with preserved aspect ratio, transparent padding where appropriate and a neutral containment plate. Do not recolour logos to match the palette, crop away distinctive marks or reuse a similar company's asset. Keep asset identity stable across all views.

Suggested slots are 24px in dense rows, 32–40px in standard rows and tiles, and 48–64px in profile headers. Prefer an approved brand symbol at tiny sizes. A wide wordmark receives a wider slot while preserving aspect ratio; never shrink it into an illegible miniature inside a square. Initials are the missing-asset fallback, with the company name still available.

In treemaps, larger tiles show logo, name and metric; smaller tiles progressively reduce visible metadata. Every interactive tile retains a meaningful accessible name. Graph nodes can combine the logo with a type marker and label. Founder portraits should remain distinct from company logos.

Wireframe logos and company placements are illustrative. They do not validate a company's headquarters, sector, funding, partnerships or participation in a particular cohort.

## 11. View-specific behaviour

**Treemap:** expose grouping, area metric, colour legend and coverage together. Group headings show totals and an explicit drill action. Tile selection opens the inspector; labelled navigation opens a profile. Keep missing-metric entities reachable.

**Graph:** begin with a readable neighbourhood, labelled relationship types and bounded expansion. Provide Fit, Center selection and expansion controls. Edge direction must agree with its predicate. Keep layout stable while inspecting; avoid continuous movement. A list of relationships supplies a parallel route to the same information.

**List:** use aligned columns, tabular numerals, explicit sorting and configurable columns. Preserve distinguishable inspection, comparison and focus states. Numeric sorting must handle unknown values deliberately and consistently.

**Profile:** retain the company identity and source context from the inspector. Funding rows distinguish rounds, participants, amounts, currencies and date precision. Sources attach to individual claims; an entity-wide timestamp does not imply every field was checked together.

## 12. Keyboard, touch and focus

Choose semantics that match the control. Single-selection listboxes use arrow navigation; country options are checkboxes. Space toggles a focused checkbox. Enter activates the focused action. Escape closes the topmost dismissible surface and returns focus to its trigger.

Trap focus in modal dialogs and mobile filter drawers, with background content inert. Ordinary nonmodal inspectors must not trap focus. Preserve focus during updates whenever its target survives; when it disappears, move focus to an appropriate stable heading or results control and explain the change.

Make graph and treemap selection available without pointer precision. Provide keyboard-accessible records and relationship lists, and ensure dragging has an alternative. Hover details also appear on keyboard focus; essential actions must not depend on hover.

Touch controls use at least 44px targets. A visible focus outline is separate from selection. Announce completed result updates and failures with restrained live-region messages; avoid narrating every checkbox movement or animation frame.

## 13. Loading, empty, error and excluded states

| State | Presentation and action |
|---|---|
| Initial loading | Stable layout skeleton plus explicit loading label; no fabricated totals |
| Updating | Previous results identified as previous; current request visible |
| No matches | Applied scope, zero-result message and specific filter recovery |
| No records yet | Explain missing population and available next action |
| Missing metric | Label unknown/undisclosed; keep the entity reachable |
| Selected outside results | Retain inspector with Adjust filters / Clear selection |
| Failed filter apply | Preserve draft and previous results; Retry / Cancel |
| Failed source retrieval | Preserve claim context; show unavailable source state |
| Partial result set | State loaded versus eligible coverage and limitations |

Empty states should describe the user's current constraints. “No companies match Seed in Sydney” is more useful than “Nothing here.” Error notices must not impersonate an empty successful result. Comparison selections remain independent, with a count of members hidden by current filters.

## 14. Motion

Use approximately 120ms for colour feedback, 180ms for small panel transitions and 240ms for spatial regrouping. Treat these as adjustable tokens, not mandatory durations for every element. Coordinate transitions through one owner so selection, layout and inspector changes do not compete.

Preserve the selected entity as a visual anchor during a view change. Interrupt or retarget an animation when a new selection arrives. Stop graph simulation and nonessential animation when hidden or unmounted. Reduced motion removes spatial animation and smooth scrolling while preserving immediate state feedback.

## 15. Synthetic fixtures and wireframe subjects

The country demonstration uses **24 synthetic records**: Australia 8, New Zealand 4, United States 6, United Kingdom 4 and country missing 2. Australia plus New Zealand yields 12. Drilling into Australia yields 8; its synthetic city split is Sydney 4, Melbourne 3 and Brisbane 1.

These are mock mappings and counts, not verified headquarters facts. A recognizable logo placed in a screen does not authenticate the associated fixture. Keep generated screenshots labelled as illustrative wherever confusion is plausible.

The six detailed wireframe subjects are:

1. Country multiselect with a changed draft awaiting Apply.
2. Australia-to-city drilldown while Australia and New Zealand remain applied.
3. Group by, Size by and Colour by dropdown specimens with matching legends.
4. Applied filters, empty results, excluded selection and request-error states.
5. Mobile filter drawer, results and selected-entity inspector states.
6. Foundations and core components, including logo containment and focus.

## 16. Acceptance and implementation order

Accept the foundation only after checking real rendered text, focus, contrast across actual states, wrapping and coarse-pointer targets. Validate filter truth tables against synthetic fixtures: OR within countries, AND across facets and paths, unknown inclusion, draft cancellation, failed apply, and the distinct meanings of Clear filters and All ecosystems.

Verify selection continuity across views, excluded selections, comparison independence, exact treemap proportions, legend/metric agreement and complete-population coverage. Exercise keyboard-only and touch journeys, narrow layouts, interrupted transitions and live reduced-motion changes. Record what was tested and where; a generated image is not test evidence.

Implement in this order:

1. Scoped tokens, typography, identity component and layout primitives.
2. Buttons, fields, focus, dropdowns and country multiselect.
3. Canonical exploration state, query lifecycle and fixture-based contracts.
4. List and inspector as the reference journey, including sources and failures.
5. Treemap and drilldown with deterministic area and aggregate calculations.
6. Graph expansion and profile continuity using the same entity contracts.
7. Mobile adaptations, density, reduced motion and end-to-end acceptance.

## 17. Scoped CSS foundation

This block is a proposed starting foundation. It intentionally uses `.atlas` scope and makes no global resets. Load the chosen fonts through the application's existing font strategy. Component-specific visualisation layouts and interactive semantics remain implementation work.

```css
.atlas {
  /* Core surfaces and ink */
  --atlas-paper: #F9F8F5;
  --atlas-recessed: #EFECE4;
  --atlas-surface: #FFFFFF;
  --atlas-ink: #122B22;
  --atlas-muted: #60675D;
  --atlas-rule: #E2DDD3;
  --atlas-control-border: #60675D;
  --atlas-rust: #C85A32;
  --atlas-rust-text: #9F3D1D;
  --atlas-action: #A84121;
  --atlas-action-hover: #9F3D1D;
  --atlas-on-action: #FFFFFF;
  --atlas-selection: #F5E7DF;
  --atlas-selection-edge: #9F3D1D;
  --atlas-focus: #1B382B;

  /* Proposed chart categories; independent from entity-type colours. */
  --atlas-chart-design-tint: #E9F1F0;
  --atlas-chart-design-ink: #1F4E4B;
  --atlas-chart-devtools-tint: #EBEFF9;
  --atlas-chart-devtools-ink: #2C468A;
  --atlas-chart-finance-tint: #EFF3ED;
  --atlas-chart-finance-ink: #38543B;
  --atlas-chart-bio-tint: #FAF1E3;
  --atlas-chart-bio-ink: #875317;
  --atlas-chart-industrial-other-tint: #F8EDE7;
  --atlas-chart-industrial-other-ink: #91381E;
  --atlas-chart-sequential-low: #EFF3ED;
  --atlas-chart-sequential-mid: #82A291;
  --atlas-chart-sequential-high: #1B382B;
  --atlas-chart-unknown-tint: var(--atlas-recessed);
  --atlas-chart-unknown-ink: var(--atlas-muted);

  /* Semantic aliases: states also require text or icon cues. */
  --atlas-text-primary: var(--atlas-ink);
  --atlas-text-secondary: var(--atlas-muted);
  --atlas-text-link: var(--atlas-rust-text);
  --atlas-text-error: var(--atlas-rust-text);
  --atlas-text-success: var(--atlas-ink);
  --atlas-surface-selected: var(--atlas-selection);
  --atlas-surface-disabled: var(--atlas-recessed);
  --atlas-text-disabled: var(--atlas-muted);

  /* Typography */
  --atlas-font-editorial: "Newsreader", Georgia, serif;
  --atlas-font-ui: "Inter", system-ui, sans-serif;
  --atlas-type-page: 2.25rem;
  --atlas-type-profile: 2rem;
  --atlas-type-section: 1.375rem;
  --atlas-type-record: 1rem;
  --atlas-type-body: 0.875rem;
  --atlas-type-small: 0.8125rem;
  --atlas-type-label: 0.75rem;
  --atlas-line-page: 1.167;
  --atlas-line-heading: 1.25;
  --atlas-line-body: 1.429;
  --atlas-line-small: 1.385;
  --atlas-weight-regular: 400;
  --atlas-weight-medium: 500;
  --atlas-weight-semibold: 600;

  /* Spacing and geometry */
  --atlas-space-1: 0.25rem;
  --atlas-space-2: 0.5rem;
  --atlas-space-3: 0.75rem;
  --atlas-space-4: 1rem;
  --atlas-space-6: 1.5rem;
  --atlas-space-8: 2rem;
  --atlas-space-12: 3rem;
  --atlas-radius-panel: 0.125rem;
  --atlas-radius-control: 0.25rem;
  --atlas-radius-dialog: 0.5rem;
  --atlas-rule-width: 1px;
  --atlas-focus-width: 2px;
  --atlas-focus-offset: 2px;

  /* Density and layout */
  --atlas-control-min: 2.5rem;
  --atlas-control-small-min: 2.25rem;
  --atlas-row-min: 3rem;
  --atlas-target-min: 2.25rem;
  --atlas-cell-pad-block: 0.75rem;
  --atlas-cell-pad-inline: 1rem;
  --atlas-layout-gap: 1.5rem;
  --atlas-page-pad: clamp(1rem, 2vw, 2rem);
  --atlas-inspector-width: clamp(20rem, 24vw, 22.5rem);
  --atlas-profile-max: 77.5rem;
  --atlas-logo-dense: 1.5rem;
  --atlas-logo-standard: 2rem;
  --atlas-logo-profile: 3.5rem;

  /* Elevation is reserved for floating surfaces. */
  --atlas-shadow-popover:
    0 2px 8px rgb(18 43 34 / 0.04),
    0 8px 24px rgb(18 43 34 / 0.08);
  --atlas-overlay: rgb(18 43 34 / 0.28);
  --atlas-layer-sticky: 10;
  --atlas-layer-popover: 30;
  --atlas-layer-modal: 50;

  /* Motion */
  --atlas-duration-feedback: 120ms;
  --atlas-duration-panel: 180ms;
  --atlas-duration-layout: 240ms;
  --atlas-ease-standard: cubic-bezier(0.2, 0, 0, 1);
  --atlas-ease-enter: cubic-bezier(0, 0, 0.2, 1);

  color: var(--atlas-text-primary);
  background: var(--atlas-paper);
  font-family: var(--atlas-font-ui);
  font-size: var(--atlas-type-body);
  line-height: var(--atlas-line-body);
  accent-color: var(--atlas-focus);
}

.atlas[data-density="compact"] {
  --atlas-control-min: 2.25rem;
  --atlas-row-min: 2.25rem;
  --atlas-cell-pad-block: 0.5rem;
  --atlas-cell-pad-inline: 0.75rem;
  --atlas-layout-gap: 1rem;
}

.atlas .atlas-page-title,
.atlas .atlas-profile-title,
.atlas .atlas-section-title {
  font-family: var(--atlas-font-editorial);
  font-weight: var(--atlas-weight-regular);
  line-height: var(--atlas-line-heading);
  color: var(--atlas-ink);
}

.atlas .atlas-page-title {
  font-size: var(--atlas-type-page);
  line-height: var(--atlas-line-page);
}

.atlas .atlas-profile-title {
  font-size: var(--atlas-type-profile);
}

.atlas .atlas-section-title {
  font-size: var(--atlas-type-section);
}

.atlas .atlas-data {
  font-variant-numeric: tabular-nums;
}

.atlas .atlas-muted {
  color: var(--atlas-text-secondary);
}

.atlas .atlas-panel {
  background: var(--atlas-surface);
  border: var(--atlas-rule-width) solid var(--atlas-rule);
  border-radius: var(--atlas-radius-panel);
}

.atlas .atlas-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--atlas-space-2);
  padding: var(--atlas-space-3);
  background: var(--atlas-recessed);
  border-radius: var(--atlas-radius-panel);
}

.atlas .atlas-control {
  box-sizing: border-box;
  min-block-size: var(--atlas-control-min);
  min-inline-size: var(--atlas-target-min);
  padding: var(--atlas-space-2) var(--atlas-space-3);
  border: var(--atlas-rule-width) solid var(--atlas-control-border);
  border-radius: var(--atlas-radius-control);
  background: var(--atlas-surface);
  color: var(--atlas-text-primary);
  font: inherit;
  font-weight: var(--atlas-weight-medium);
}

.atlas .atlas-control--primary {
  color: var(--atlas-on-action);
  background: var(--atlas-action);
  border-color: var(--atlas-action);
}

.atlas .atlas-control--primary:hover:not(:disabled) {
  background: var(--atlas-action-hover);
  border-color: var(--atlas-action-hover);
}

.atlas .atlas-control:disabled {
  color: var(--atlas-text-disabled);
  background: var(--atlas-surface-disabled);
  border-color: var(--atlas-control-border);
  cursor: not-allowed;
}

.atlas :where(a, button, input, select, textarea, [tabindex]):focus-visible {
  outline: var(--atlas-focus-width) solid var(--atlas-focus);
  outline-offset: var(--atlas-focus-offset);
}

.atlas .atlas-record {
  box-sizing: border-box;
  min-block-size: var(--atlas-row-min);
  padding: var(--atlas-cell-pad-block) var(--atlas-cell-pad-inline);
  border-block-end: var(--atlas-rule-width) solid var(--atlas-rule);
}

.atlas .atlas-record[data-inspected="true"] {
  background: var(--atlas-surface-selected);
  box-shadow: inset 3px 0 var(--atlas-selection-edge);
}

.atlas .atlas-logo {
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  inline-size: var(--atlas-logo-standard);
  block-size: var(--atlas-logo-standard);
  padding: var(--atlas-space-1);
  box-sizing: border-box;
  background: var(--atlas-surface);
  border: var(--atlas-rule-width) solid var(--atlas-rule);
  border-radius: var(--atlas-radius-control);
}

.atlas .atlas-logo > img {
  display: block;
  max-inline-size: 100%;
  max-block-size: 100%;
  object-fit: contain;
}

.atlas .atlas-logo--dense {
  inline-size: var(--atlas-logo-dense);
  block-size: var(--atlas-logo-dense);
  padding: 2px;
}

.atlas .atlas-logo--profile {
  inline-size: var(--atlas-logo-profile);
  block-size: var(--atlas-logo-profile);
  padding: var(--atlas-space-2);
}

.atlas .atlas-logo--wordmark {
  inline-size: clamp(5rem, 12vw, 8rem);
  block-size: var(--atlas-logo-standard);
  padding-inline: var(--atlas-space-2);
}

.atlas .atlas-logo--wordmark.atlas-logo--profile {
  inline-size: clamp(8rem, 20vw, 12rem);
  block-size: var(--atlas-logo-profile);
}

.atlas .atlas-profile {
  inline-size: min(100%, var(--atlas-profile-max));
  margin-inline: auto;
}

.atlas .atlas-motion {
  transition-property: color, background-color, border-color;
  transition-duration: var(--atlas-duration-feedback);
  transition-timing-function: var(--atlas-ease-standard);
}

@media (max-width: 48rem) {
  .atlas {
    --atlas-type-page: 1.75rem;
    --atlas-type-profile: 1.75rem;
    --atlas-page-pad: 1rem;
    --atlas-layout-gap: 1rem;
  }
}

@media (any-pointer: coarse) {
  .atlas,
  .atlas[data-density="compact"] {
    --atlas-control-min: 2.75rem;
    --atlas-control-small-min: 2.75rem;
    --atlas-row-min: 2.75rem;
    --atlas-target-min: 2.75rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .atlas {
    --atlas-duration-feedback: 0ms;
    --atlas-duration-panel: 0ms;
    --atlas-duration-layout: 0ms;
  }

  .atlas .atlas-motion {
    animation: none;
    transition: none;
    scroll-behavior: auto;
  }
}
```

The application must additionally stop JavaScript-driven graph simulation, scrolling and layout animation when reduced motion is active. CSS tokens alone cannot provide that behaviour. If controls render through portals, their portal container must inherit the `.atlas` scope or an equivalent explicit token provider.


## 18. Image generation catalogue

The six wireframe subjects in this specification were created with the built-in image-generation tool, using the previously approved paper/forest/rust logo-treemap screen as a visual reference. The country-selector view received a final targeted refinement to align its country legend, result-count labels and count-based metric controls. These prompts describe visual concepts, with illustrative records and data; they do not establish a working implementation.

The attached reference mentioned in the retained prompts is [explorer-treemap.png](wireframes/explorer-treemap.png). The [asset manifest](asset-manifest.json) maps the selected outputs to their original filenames; a null prompt reference means that an exact prompt is not retained in this package.

For each new screen, combine the shared visual brief below with its corresponding screen brief. The component and state boards are documentation specimens, so multiple open menus or alternative states on one board are intentional comparisons.

### Shared visual brief

~~~text
Use case: ui-mockup. Create a detailed Startup Atlas product wireframe or component specimen, using the attached approved screenshot as the visual-language reference. Preserve the exact calm editorial research-tool identity: warm paper #F9F8F5, slightly recessed #EFECE4 toolbars, white record surfaces, forest ink #122B22, rust #C85A32 selection edges and accents, darker rust #A84121 for primary buttons with white text, warm hairline borders #E2DDD3. Newsreader-like editorial serif for wordmark, restrained page titles and entity headings; Inter-like crisp neutral sans for controls, body, company names in dense rows and data. Flat precise surfaces, mostly square geometry, 2–4px control corners, a subtle inner highlight on segmented controls and restrained small popover shadows. No giant black masthead, cobalt palette, pill overload, excessive hero whitespace, neon, illustration, fake confidence score or pseudo-archival certificate. High-resolution flat front-on landscape 16:10 desktop UI, entirely inside the image with readable type. No physical devices, perspective, browser chrome or large outer margins. Masthead around 56px tall: small rust asterisk and italic 'startup atlas', Explore / Saved / Sources, global search, small account. Use compact title and segmented view switch Treemap / Graph / List. Make controls and states meaningful. Logos are authentic-looking full-colour brand marks on neutral plates, with text labels: Canva turquoise-purple flowing script; Figma multicolour F; Notion black N cube; Linear violet striped circle; Vercel black triangle; Stripe purple wordmark; Replit orange linked blocks; and recognizable wordmarks for other requested companies. The selected entity remains Canva unless a screen explicitly says otherwise, thin rust selection edge, consistent logo in inspector. Use a separate checkbox for comparison and an offset forest outline for keyboard focus. All counts, country mappings and display metrics are synthetic interface examples, and a small footer says 'Illustrative dataset'. Never claim current real-world funding, location, totals, certifications or investment performance. Prioritize dense readable data, clear hierarchy, purposeful whitespace and the actual state described.
~~~

### Country multiselect

~~~text
SCREEN 1 — COUNTRY MULTISELECT, OPEN WITH TWO PENDING CHANGES. Product page 'Explore companies', view Treemap selected, a small '24 example companies' count. A tidy two-row toolbar with 'Headquarters country: All countries', Sector All, Stage All, Group by Country, Size by Company count, Colour by Sector, Editorial / Compact, Logos on. The main area is a country-grouped map with neutral logo tiles. The illustrative dataset contains Australia 8, New Zealand 4, United States 6, United Kingdom 4 and Country not recorded 2: total 24. Company country assignments are design samples. Show country-group labels and a handful of clear company logos, with the two unrecorded-country records in a clearly labelled small separate shelf. Keep a compact Canva inspector to the right with its logo and simple source tabs. The hero of this wireframe is an elegant 380px-wide COUNTRY MULTISELECT POPOVER anchored to the Headquarters country button, visible over the left part of the map. At its top persistent title 'Headquarters country', a compact field 'Location basis: Headquarters', a search input 'Search country or code', and concise helper 'Match any selected country'. Group the list under small noninteractive region headings. Under Oceania show Australia with a small flag, checkbox CHECKED, count 8; New Zealand checkbox CHECKED, count 4. Under North America show United States unchecked count 6. Under Europe show United Kingdom unchecked count 4. A separated row Country not recorded unchecked count 2. Country names remain readable and flags are secondary. The trigger and underlying result set still show All countries / 24 because these changes are not applied. The popover footer explicitly reads '2 countries selected · 12 matching companies', outlined 'Cancel', and dark rust primary 'Apply filters'. Show a clear 'Clear selection' text action that only changes this open draft. Use an offset forest keyboard focus outline on the New Zealand row, separate from the checked checkboxes. Outside the popover, leave enough of the treemap visible to understand context and keep the right inspector unobscured. Include a small applied-filter strip that currently says 'No country filter applied'. A high-fidelity realistic interaction-state wireframe, crisp and restrained.
~~~

### Country and city drilldown

~~~text
SCREEN 2 — APPLIED MULTI-COUNTRY FILTER AND COUNTRY→CITY DRILLDOWN. Use the same approved shell, with compact title 'Australia', breadcrumb 'All ecosystems / Oceania / Australia', and an explicit up action 'Back to Oceania'. Treemap active. Toolbar 'Headquarters country: Australia + New Zealand', Sector All, Stage All, Group by City, Size by Company count, Colour by Sector, Editorial / Compact. Applied filter chips underneath say 'HQ: Australia ×' and 'HQ: New Zealand ×', with a small label 'Match either country'. Distinguish the countries filter from the narrower breadcrumb: a clear summary reads '8 companies in this country · 12 match your filters'. A narrow sibling-country strip includes 'Australia 8' active with a rust underline, 'New Zealand 4', and 'View both countries'. Main content roughly 72% width is a city-grouped treemap with explicit expandable group headers: 'Sydney · 4 companies', 'Melbourne · 3 companies', 'Brisbane · 1 company'. Within each group, companies have equal weight because Size by is Company count. Show full-colour recognizable logo marks on neutral plates, plus readable names: Sydney includes Canva, Employment Hero, SafetyCulture, Immutable; Melbourne includes Culture Amp, Buildkite, Linktree; Brisbane includes Octopus Deploy. These country/city mappings are illustrative examples, not live data. The Canva tile is selected with a fine rust outline; its logo, name, 'Design platform', tiny source link and separate compare checkbox are clear. Every group header has an explicit expand arrow; show the Sydney header with an action 'Explore city ↗'. The right persistent inspector displays Canva’s logo, serif heading, sample location Sydney Australia, a subtle 'In current results' label, Overview / People / Sources, and Open profile / Show in graph. A compact bottom strip preserves navigation context with 'Country scope: Australia' and a quiet 'Return to all matching companies' action. Make the distinction between broad applied countries and the current country drilldown visually obvious through hierarchy. No financial figures or unsupported valuation statistics. Strong, legible and highly practical spatial navigation.
~~~

### Group, size and colour dropdowns

~~~text
SCREEN 3 — DESIGN SYSTEM SPECIMEN: GROUP BY / SIZE BY / COLOUR BY. This is explicitly a component documentation board inside the Startup Atlas design-system workbench, not a live app with three menus accidentally open. Heading 'Explore controls', subtitle 'Consistent dropdowns. Clear effects.' Compact brand masthead, then three equal-width columns of large exceptionally readable dropdown specimens. COLUMN 1 'Group by' shows trigger 'Country' and an open single-choice menu: Country (checked, sublabel 'Headquarters country'), City ('Within the current country'), Sector ('Use the primary sector'), Funding stage ('Latest known stage'). Use small appropriate line icons and a check at the trailing edge for selected, not large radio buttons or colour-only states. A clean footer under the specimen says 'Changes the hierarchy'. COLUMN 2 'Size by' shows Company count selected; open menu options Company count ('One unit per company'), Disclosed funding ('Requires amount and currency'), Headcount ('Known values only'), and Revenue disabled with visible reason 'Not available in this dataset'. An inset configuration preview under the funding option shows Currency USD and Period All time, clearly labelled 'Funding options'. Footer 'Changes tile area'. COLUMN 3 'Colour by' shows Sector selected; menu Sector ('Named category colours'), Country ('Named country colours'), Source freshness ('Days since last source check'), None ('Neutral surfaces'). Include a small category legend preview underneath with teal Design, indigo Developer tools, sage Finance, clay Other. Under it, a SEPARATE labelled preview 'Source freshness' showing a muted sage sequence labelled 0 / 30 / 90 / 180 days and an outlined Unknown swatch. The two legend previews must be explicitly labelled alternatives, never one combined unexplained legend. Footer 'Changes the legend and fill'. All open menus have 4px corners, warm borders, restrained float shadow, 40px or taller readable rows, medium size type, one selected row, one visible offset focus outline, and grey disabled content still legible. Along the bottom a disciplined full-width documentation strip has three labelled rules: 'Country filters: draft → Apply', 'View controls: update immediately', 'Selected entity: preserved'. Add a small 4-state mini specimen row of a compact dropdown trigger labelled Default, Hover, Focus, Disabled, visually distinct. Keep the layout geometric, calm, clear, polished and obviously reusable. Avoid arbitrary decorative numbering or unsupported API code.
~~~

### Filter and result states

~~~text
SCREEN 4 — DESIGN SYSTEM SPECIMEN: FILTER AND RESULT STATES. Create a refined landscape 2-by-2 grid of FOUR large self-contained UI state examples inside a documentation board headed 'Filtering states'. Maintain the approved warm paper, forest and rust system, clear headings and generous margins between four specimens. These are documented alternative states, not four live windows. TOP LEFT 'Applied filters': a compact results header '12 matching companies', grouped applied chips 'HQ: Australia ×' and 'HQ: New Zealand ×', helper 'Matches either country', a 'Clear filters' text action, and three company rows with clear logos Canva, Xero, Culture Amp. A small note 'The current drilldown is shown separately' points to breadcrumb 'All ecosystems'. TOP RIGHT 'No matching results': title '0 companies', visible chips HQ Australia, Stage Series D, Sector Quantum; clear message 'No companies match these filters.' Short text 'Try removing a stage or sector.' Show two clear actions 'Clear stage' and 'Clear filters'. Do not show a loading skeleton or a zero financial value in this empty state. BOTTOM LEFT 'Selection outside results': a narrow results list shows Canva and another sample Australian company; beside it a compact Figma inspector with the proper multicolour F logo, serif Figma name, prominent textual label 'Outside current results', explanation 'This company does not match your headquarters filter.', and buttons 'Adjust filters' and 'Clear selection'. A small comparison strip says '2 selected · 1 outside results' with Canva and Figma logos, making comparison membership separate from inspection. BOTTOM RIGHT 'Update failed': a country-filter popover fragment with Australia and New Zealand visibly checked, a restrained error message 'Couldn’t update results. Your choices are kept.', small context 'Showing previous results', and actions Cancel / Retry. The Retry button is dark rust, the draft checkboxes remain checked, and no successful applied-state marker appears. In a narrow footer across the board state 'Query, selection and comparison are separate states.' Include 'Illustrative dataset' quietly. Use normal product copy and readable control sizes; avoid ornamental error icons or large warning illustrations.
~~~

### Mobile filter, results and inspector

~~~text
SCREEN 5 — MOBILE FLOW SPECIMEN. This image is a landscape design board containing THREE large readable 390px-wide mobile UI frames side by side, no physical phone shells, no perspective and no browser chrome. The board title is 'Explore on a smaller screen'. Use the approved editorial system in every frame, 44px touch targets, readable Inter text, restrained Newsreader headings. FRAME 1 caption 'Filter': show a full-height filter drawer over a faint inert results background, title Filters and close icon. A 'Headquarters country' section with search 'Search countries', Australia checked (8), New Zealand checked (4), United States unchecked (6), United Kingdom unchecked (4), Country not recorded unchecked (2). A collapsed Sector row and Stage row both All. A visible draft summary 'Australia + New Zealand'. Sticky bottom footer '12 matching companies' and Cancel / Apply filters. The content scrolls independently of the footer. FRAME 2 caption 'Results': mobile Startup Atlas wordmark, compact title Companies, view switch Treemap / Graph / List with List active, filter button 'Filters · 2', applied chips HQ Australia and HQ New Zealand, breadcrumb All ecosystems, count '12 matching companies'. A practical six-row visible company list with genuine-looking logo plates and names Canva, Culture Amp, Employment Hero, SafetyCulture, Xero, Halter; additional items can continue below. The Canva row has a thin rust inspection edge, no comparison checkmark. Each row shows a concise sample country label and a separate open arrow. A small 'Showing 6 of 12' line and 'Illustrative dataset' footer. FRAME 3 caption 'Inspect': the same results page remains visibly behind a modal bottom sheet with a subtle dim overlay. The sheet fills approximately 70% of the frame. A clear close action, the Canva logo, serif company name, Sydney Australia sample context, tabs Overview / People / Sources, short description, Launched 2013 and three founder names as concise rows. Sticky sheet actions 'Open full profile' and 'Show in graph'. Keep the sheet scroll region separate from the sticky actions and retain the selected row context behind it. Do not imply that the three screens are simultaneous product windows: their captions identify consecutive flow states. Bottom of the board a concise rule 'Draft filters → apply → inspect without losing context'. All country mappings and counts are illustrative. Make each mobile screen look production-plausible, uncluttered and comfortably touchable.
~~~

### Foundations and core components

~~~text
SCREEN 6 — DESIGN SYSTEM FOUNDATIONS AND CORE COMPONENTS BOARD. This is a polished documentation/specimen board, not a chart of real data and not a marketing page. Header small Startup Atlas brand, title 'Core system', subtitle 'Paper. Forest. Rust. Clear structure.' Wide landscape composition with a precise grid and large readable specimens. TOP STRIP: six labelled colour swatches with exact short labels and hex captions: Paper #F9F8F5; Surface #FFFFFF; Forest #122B22; Muted #60675D; Rust #C85A32; Action #A84121. Beside or directly below this strip, two typography examples: 'Explore the ecosystem' in an elegant Newsreader-like serif labelled Headings / Newsreader, and 'Company names, controls and evidence' in crisp Inter labelled Interface / Inter. Include a concise token line 'Spacing 4 / 8 / 12 / 16 / 24 / 32 / 48' and 'Control radius 4px'. MIDDLE: THREE aligned component columns. LEFT 'Actions & navigation': a dark rust Open profile button, outlined Show in graph button, understated Read source text action; joined Treemap / Graph / List tabs with Graph forest-selected; a small checkbox trio unchecked, checked, mixed, and a Logos toggle on. CENTRE 'Inputs & filters': search field Search companies; a labelled Headquarters country dropdown set to Australia + New Zealand; removable HQ Australia chip; an applied-state summary; one dropdown with an offset FOREST focus outline. RIGHT 'Entity & evidence': a clean Canva logo plate plus company name, miniature entity tile with rust selected edge, a compact company row with logo and secondary text, a source row 'Company announcement' with external-link icon; small textual statuses 'Source available', 'Unknown', 'Outside current results' with restrained fills. Do not give Source available an automatic verified tick. BOTTOM: three compact, clearly labelled layout specimens using actual small UI blocks, not vague abstract diagrams: 'Explorer — canvas + inspector', 'Directory — table + inspector', 'Dossier — record + sources'. Each is a tiny coherent frame with readable primary labels and a recognizable Canva logo placement. Across the very bottom four principles as short clean text separated by rules: 'Structure carries meaning', 'Evidence stays close', 'Selection persists', 'Density is adjustable'. Show subtle hover/selected/focus differences in components through border and fill, not neon. No tiny pseudo-code, no random serial numbers, no fake financial claims. The board should feel like a complete, tightly curated practical design-system reference.
~~~

### Final country-selector refinement

Apply this edit to the generated country-selector view. This refined version is the country-filter reference for the set.

~~~text
Use case: ui-mockup. Perform a targeted consistency edit of this Startup Atlas COUNTRY MULTISELECT screenshot. Preserve the entire warm paper / forest / rust editorial appearance, typography, overall layout, open country popover, selected Australia and New Zealand, Canva inspector, logo quality and small details. Change only the following consistency details. 1) The closed country trigger must read 'All countries' with NO '(24)' suffix; the 24 example COMPANY result count remains separately visible. 2) Remove the Currency/USD control completely because Size by is Company count; keep density and Logos controls neatly aligned in the freed space. 3) Set the Colour by value to 'Country'. Replace the old Recent activity gradient legend at the bottom with a matching categorical legend explicitly reading 'Country (colour)' followed by Australia, New Zealand, United States, United Kingdom, and Country not recorded, with small matching category swatches. There must be NO activity gradient or currency control anywhere. 4) Keep counts exactly Australia 8, New Zealand 4, United States 6, United Kingdom 4, Country not recorded 2; total24; draft Australia+NewZealand12. The country popover must keep '2 countries selected · 12 matching companies', Cancel / Apply filters and focus on New Zealand. 5) In the background country sample groups, use internally consistent illustrative brands: Australia shows Canva, Employment Hero, SafetyCulture, Culture Amp, Linktree, and '+3 more'; United States shows Figma, Stripe, Notion and '+3 more'; United Kingdom shows Synthesia, Wise, Monzo and '+1 more'; New Zealand shows Xero and Halter and '+2 more'; Country not recorded shows neutral labelled records 'Example company A' and 'Example company B' with simple missing-logo fallback plates. All country placements remain expressly illustrative, not research evidence. Preserve a readable 'Illustrative dataset' footer. Do not add extra claims, panels or decorative elements. Keep the same flat landscape viewport, crisp readable type and restrained small-radius components. This is the refined final country-filter wireframe.
~~~

## 19. Reference material and provenance

The user-supplied `stitch_startup_ecosystem_knowledge_graph.zip` contains the editorial design system and earlier graph, treemap, list and dossier studies. Its original [design reference](references/stitch-design.md) is included in this package, with the current selected views in [the gallery](README.md). Its paper, forest, rust, Newsreader and Inter direction informs this specification. Generated examples remain separate from authoritative startup data and source assets.

Solid-colour contrast figures in section 3 were calculated from the stated sRGB hex values using linearised channel luminance. They are included as a palette check, not a substitute for rendered interface validation.

## 20. Company profiles

This extension specifies intended build contracts for company profiles within the approved warm editorial system. The accompanying overview, people/network, funding/evidence and mobile concepts are visual proposals. They do not establish implemented behaviour or verify the company facts shown. Continue using the existing paper, forest and rust palette, Newsreader/Inter typography, logo treatment and control primitives; no separate profile design system is required.

### 20.1 Profile shell and return context

Use a full-page profile with a readable maximum width of approximately **1240px**. A compact identity header contains the canonical company logo, name, concise description and sourced sector/location labels. Provide visible **Website**, **Save** and **Compare** actions; keep occasional actions in a labelled menu.

Place **Back to results** above the identity. Its retained context includes query, facets, drill path, view, selected company and viewport. Returning must restore that context rather than recreate a default search. A direct profile visit without originating results should offer **Open directory** instead of implying a previous journey.

Use sticky section navigation: **Overview · People · Funding · Relationships · Sources**. Each section has a stable addressable anchor, meaningful heading and visible active state. Changing sections preserves the profile identity and any open evidence context. Keep navigation compact enough that it does not obscure content on narrow or zoomed layouts.

### 20.2 Overview and fact/evidence rail

Use a broad primary column for the company description, products or markets, and a concise company-facts table. A supporting rail contains a small number of useful facts and their evidence affordances. Avoid duplicating the same complete fact table in both columns. Collapse the rail into the reading order when space is insufficient.

Useful fields include headquarters, founding date, status, primary sector and recorded funding stage. Expose the meaning and effective date of time-sensitive fields. Use explicit missing-value labels where absence affects interpretation; avoid filling every unknown field with a prominent empty metric card.

Every factual summary should lead to its detailed section or supporting claim. A relationship preview and **Explore relationships** action connect the overview to the graph. Company-authored descriptions, editorial summaries and private user notes must remain distinguishable.

### 20.3 People: founding versus employment

Treat **Founding relationships** and **Employment roles** as separate data fields. A combined people list may display both with distinct labels and dated evidence; a dedicated leadership section is useful when their populations differ. A founding relationship is a historical statement; a current job title is a dated claim. A person can remain a founder after leaving employment. Do not infer an active executive role from a founding record.

Each entry includes portrait or initials, canonical name, relationship, available start/end dates and **Open person**. Preserve date precision and label former roles explicitly. If current status is unknown, say so rather than marking the role active. Person profiles and related-company links should retain the originating company context.

### 20.4 Funding chronology and coverage

Present funding as expandable events ordered by the event date, with undated events grouped explicitly. Distinguish the financing event date from announcement, publication and retrieval dates. Preserve year-only or month-only precision; do not manufacture a day to satisfy sorting or display.

Each event contains its recorded type, amount, original currency, date and participants. Participant roles distinguish **Lead**, **Participant** and **Role not recorded**. Link each investor to its entity and supporting relationship. Do not infer an investor's contribution, ownership percentage or board seat from participation alone.

Aggregate figures must identify included event types, currencies, conversion basis when used, and coverage. A total based on disclosed rounds is not necessarily total lifetime funding. Keep unknown amounts, explicitly undisclosed amounts and recorded zero values distinct. Grants, debt and equity must remain distinguishable; corrections or duplicate reports must not inflate totals.

### 20.5 Claim-level evidence

A consistent **Sources** action beside a factual value opens evidence for that exact claim. The panel identifies the claim, recorded value, source title/publisher, navigable reference, relevant dates and last checked date. Source-check recency describes retrieval age, not verification or reliability.

Show competing values with their respective sources and dates when a claim is contested. Preserve the distinction between a superseded historical value and an unresolved conflict. Repeated reporting does not automatically become independent corroboration. An entity-wide source count or badge must not imply that all fields have equal support.

The Sources section provides an accessible index of these references and the claims they support. Unavailable links retain their citation and retrieval status. Evidence-panel dismissal restores focus to the originating claim without moving the profile scroll position.

### 20.6 Relationship context

The profile graph centres on the company and uses explicit predicates for founders, investors, programmes and other organisations. Directional edges must agree with their wording. Expansion reveals additional relationships deliberately and preserves the selected company as a stable reference.

Company-result filters do not silently apply company-headquarters rules to founders or contextual organisations. Label contextual nodes outside the originating company query and exclude them from company-result totals. Provide an equivalent **Related records** list with entity name, type, relationship, date context and source access so graph navigation does not depend on dragging or visual interpretation.

### 20.7 Mobile and personal workspace state

On mobile, keep identity and principal actions compact, with a scrollable section strip and readable stacked records. Evidence opens in a sheet with a visible close action, contained scrolling, modal focus handling and focus return. Returning to results preserves the original mobile exploration state.

**Save** and **Compare** represent separate user states. Comparison membership is independent of the inspected company and may persist outside current results. Display a completed saved state only after acknowledgement; retain an actionable error if a write fails.

Private notes belong to the user's workspace, not the company's public factual record. Distinguish draft, saving, saved and failed states, preserve unsaved text on failure, and clearly label note visibility. If saving or notes are unavailable, explain that state without showing a success affordance.

### 20.8 Loading, empty, conflict and error contracts

Keep the profile shell stable while sections load independently. Unknown counts must not appear as zero. Differentiate **No recorded funding**, **Funding history unavailable**, and **No events match this filter**; each describes a different condition.

On refresh failure, retain previously loaded facts with an explicit previous-data notice and a section-level retry action. A failed request must not erase the company identity or masquerade as an empty successful response. Only the latest active company/section request may commit results. Rapid navigation must never attach one company's facts, note state or evidence to another company's header.

## 21. Company profile visual set and source fixture

The profile extension has four visual references. The larger overview identity and compact interior-section identity use the same logo, name, actions and section order. In the intended build, the compact state also serves the sticky header after scrolling.

| View | Composition | Primary interaction |
|---|---|---|
| Company overview | Identity header, broad editorial body, narrower facts/sources/notes rail | Open a person, funding event, related company or exact claim |
| People and relationships | Founder directory beside a bounded relationship preview | Open person, inspect relationship, expand into the full graph |
| Funding and evidence | Expanded historical event beside its claim evidence | Inspect source without losing the selected event |
| Mobile profile | Stacked records, horizontally scrollable section navigation, evidence sheet | Preserve reading position and focus when opening or closing evidence |

Use forest text and an underline for the active profile section. Use dark rust for the primary exploration action and selected evidence. Keep the Canva wordmark in its original colours. Fusion Books uses the neutral **FB** initials fallback until its canonical asset is available. Person initials in these concepts are deliberate placeholders.

### Source fixture checked on 20 November 2026

These source records support selected examples in the concepts; their publication dates and retrieval dates remain separate fields. Exact URLs, date precision and claim scope are retained in [source-fixture.json](source-fixture.json).

| Source | Supported example |
|---|---|
| [About Canva](https://www.canva.com/about/) | Platform description and launch in 2013 |
| [Canva Research](https://www.canva.com/ai-research/) | Sydney location described as Canva's global headquarters |
| [Canva Create 2026](https://www.canva.com/canva-create/watch-sessions/?activeVideoId=9HkO8masPT0) | Executive titles as reported for that event; displayed separately from founding relationships |
| [Canva's seed-round announcement](https://www.canva.com/newsroom/news/aussie-startup-canva-announces-3-million-seed-round-world-class-investors/) | Announcement on 20 March 2013, reported $3 million amount, named participants, founders and Fusion Books history |

The funding example retains the source's dollar notation with **currency not specified**. Its date is labelled **announcement date**. The displayed historical event is not a calculation of present cumulative funding. Record only the participant roles and contribution amounts established by evidence.

### Alignment checks

The delivered concepts were reviewed for shared profile navigation, canonical company identity, consistent fallback initials, separation of historical founding and dated role claims, explicit funding coverage, and desktop/mobile access to the original source. They remain generated visual proposals; interaction behaviour is governed by section 20 and requires implementation.
