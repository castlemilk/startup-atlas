# Choosing and using Atlas views

Start with the question, then choose the view. Atlas reads a published research snapshot: a polished card, a nearby graph node or a large rectangle is not additional evidence. Open the source before relying on a relationship, amount or eligibility claim.

This guide describes the static interfaces at the Signal baseline, not proposed screens or the separate Hardware/Next.js work. The [interaction contract](../UX-CONTRACT.md) owns behaviour; [explorer specifications](EXPLORER-VIEWS.md) distinguish current capabilities from future work.

## Choose a starting point

| Your question | Start here | Next action | Do not infer |
| --- | --- | --- | --- |
| Which records match my search? | [List and search](https://castlemilk.github.io/startup-atlas/?type=startup#directory) | Narrow the entity kind, inspect a record, then open its profile. | A match is not an eligibility decision or a complete market census. |
| How large are comparable recorded figures? | [Funding treemap in USD](https://castlemilk.github.io/startup-atlas/treemap.html?metric=funding&currency=USD) | Choose one measure and currency, then inspect the figure and its announcement. | Latest recorded event amount is not total funding raised or current company value. |
| Can I read the same figures without interpreting area? | [Company cards](https://castlemilk.github.io/startup-atlas/treemap.html?metric=funding&currency=USD&view=cards) or [ranked list](https://castlemilk.github.io/startup-atlas/treemap.html?metric=funding&currency=USD&view=list) | Select a company to open its evidence; use Company for broader context. | Card size is editorial, not proportional. Financial ordering is not a quality score. |
| What sourced relationships surround an entity? | [Knowledge graph](https://castlemilk.github.io/startup-atlas/graph.html?entity=startup%3Acanva) | Inspect a node, read the relationship and source, then choose Explore from here if you want a new root. | Proximity, line placement or portfolio membership does not prove investment in a particular round. |
| What is known about a company or person? | [Startup profile](https://castlemilk.github.io/startup-atlas/entity.html?id=startup%3Acanva) | Follow the applicable Founders, Company, Funding, Connections and Sources sections. | An unresearched section means unknown, not absent or zero. |
| What organisations, people and programmes are associated with a partner? | [Partner profile](https://castlemilk.github.io/startup-atlas/partner.html?name=Airtree) | Inspect a researched company or follow a person/programme and its evidence. | A researched sample is not the firm's entire portfolio; a provider relationship does not guarantee credits. |

## Continue through search results

The directory initially shows 12 matching records. **Load more** reveals the next batch and moves keyboard focus to the first newly revealed record's profile link, so you can continue reading and tabbing through that record. This also applies to the final, shorter batch when the Load more button disappears. The handoff is immediate, including with reduced motion enabled.

The displayed range is retained in the route's `shown` parameter. Opening a profile and using its return link restores that range and the supported search/filter context; it does not promise the same scroll position. Typing a query, changing filters or restoring history does not trigger the Load more focus handoff. Search and filter changes start a new 12-result range.

## Compare a measure without losing its meaning

1. Choose **Company count**, **Funding announcement**, **Recorded valuation** or **Market cap**. Market cap uses dated public-market observations for listed companies with source evidence.
2. For a financial measure, choose a single currency. Atlas does not convert or combine currencies. Only positive, dated, comparable numeric records contribute to the chart.
3. Use **Group by** to compare technology types, primary sectors, headquarters, funding stages, founding decades or individual companies. **Colour by** is independent. Select a country or a founding decade to drill into its companies and use the breadcrumb to return.
4. Switch between **Treemap**, **Cards** and **Ranked list** for the same filtered records. Area encodes the selected measure only in Treemap. Company count orders individual companies alphabetically in Cards/List.
5. Select a company and read **Figure** for the recorded date and source. Market-cap estimates show the closing price, share count and date of the share count. **Company** gives broader profile context and the source for its technology type. The displayed total sums the shown observations, which can have different dates.
6. Expand the missing-figure disclosure to inspect companies without a comparable figure. Switch to **Company count** to include them on the map.

**Share view** copies the current company-view URL with filters, presentation and selected company. If clipboard access fails, copy the address bar. A link to a financial view may later show newer published research; it is not an immutable financial snapshot. Browser Back/Forward restores supported URL state, not exact scroll position.

## Explore relationships without changing the question accidentally

The graph has two different concepts: the **root** defines the neighbourhood; the **selection** determines the inspector. Selecting a visible node inspects it without rerooting. **Explore from here** deliberately changes the root, while **Open profile** leaves the graph for the full record. Selecting a search result starts a new neighbourhood.

Use the connection list when the canvas is difficult to read. Read the recorded predicate and its evidence, not just the endpoints. **Fit view** changes the camera; **Reset layout** changes the arrangement. Layout and camera positions are not saved by a shared URL. A **view limited** notice means the drawing is capped, not that the selected entity has no other relationships.

A useful evidence-navigation exercise is **Airtree → Canva → Melanie Perkins → Fusion Books**. Follow the actual profile and relationship links at each step. This tests partner-to-company, company-to-founder and founder-to-other-company navigation; it does not establish funding-round participation.

## Move between views deliberately

Use profile links for an entity's full record and the graph link for its relationships. Directory filters, graph root/selection and company-view filters are separate state models. Do not assume that a partner profile creates a partner-scoped graph or treemap, or that every directory facet transfers to another route. Query propagation and supported return links do not imply identical result sets across views.

A copied address preserves only what that route encodes. Directory displayed-range restoration is not exact scroll restoration. The graph's root, selection and filters do not preserve its camera. Browser-local opportunity saves are not shared research collections or an account-backed workspace.

## Read incomplete and failed states correctly

- **No matches:** change the query or filters. This is different from a failed dataset load.
- **Not researched / not recorded:** follow the available sources; do not infer a negative fact.
- **Published JSON backup:** the SQLite reader fell back to the matching published JSON snapshot. This is not a live crawl.
- **Partial partner research:** optional data failed to load; the visible sample may be incomplete.
- **Unavailable view:** use the displayed reload or directory recovery link. A failed request must not be treated as an empty result set.

## Apply the design system to the next view

Preserve the five source wireframes' hierarchy while using the current light Signal finish: porcelain surfaces, graphite navigation, cobalt actions and self-hosted Geist. Use [runtime tokens](../web/design-tokens.css), [shared components](../web/atlas-ui.css) and [UI SDK behaviour](UI-SDK.md), rather than copying historical forest-and-paper colours or inventing another control system.

Keep three layers distinct: a toolbar changes scope, the result surface shows that scope, and an adjacent inspector explains the selected record. Selection must stay visible without hiding keyboard focus. Native links navigate; native buttons perform in-page actions. Cards may organise reading, but only chart geometry may encode a declared quantitative measure.

Before promoting a new view, check the real route at desktop and narrow widths, with keyboard-only navigation, reduced motion, long names, failed images, missing data, load errors, Back/Forward and direct links. Ensure that a source and a recovery action remain reachable. A workbench specimen or an image study is not proof that its depicted save, compare, filter or account behaviour exists.

### Implementation boundaries

This guide does not install SPEC-01, introduce Hardware, add sound/haptics, change data or add a new workflow. The separate component field guide and Hardware work retain their own implementation and review boundaries. Any new framework must preserve the route meanings above rather than silently replacing them.
