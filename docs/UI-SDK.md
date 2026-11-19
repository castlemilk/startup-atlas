# Atlas UI SDK integration

The operational directory, treemap, knowledge graph and entity/partner profiles use **ui-sdk Web Components** with the light Signal design system. Atlas retains its static ESM architecture, route controllers and published research snapshots. The SDK supplies interaction behaviour; Atlas supplies layout, visual tokens and source-backed content.

## Dependencies and workflow

`package.json` and its lockfile pin `@ui-sdk/web` and `@ui-sdk/core` to **0.1.0-beta.6**. The project-scoped skill was installed with:

```sh
npx skills@latest add vercel-labs/ui --skill ui-sdk
```

The maintained workflow is in [`.agents/skills/ui-sdk/SKILL.md`](../.agents/skills/ui-sdk/SKILL.md), with its installation recorded in `skills-lock.json`. Start from the installed `node_modules/@ui-sdk/web/docs/llms.txt`, then read the relevant component pages. Use the installed docs and `.d.ts` files as the API reference; do not reverse-engineer compiled `dist/*.js`. Import components from their specific entries rather than the package root or internal core modules.

The SDK's `server-rendering.md` describes the static HTML upgrade boundary: native content is present before a component upgrades, while SDK-managed keyboard and state behaviour requires its browser module. Wait for `customElements.whenDefined()` before calling component properties in integration tests. This does not introduce a rendering server, cookies or a new preference system into Atlas.

## Ownership

| Owner | Responsibility |
| --- | --- |
| `web/atlas-sdk.js` | Component registration, native-control adapters, dynamic action enhancement and local agent instance |
| `web/atlas-sdk.css` | Atlas-specific SDK part/state styling and layout integration |
| `web/design-tokens.css` | Canonical light Signal colours, Geist families, radii, material/shadow roles and motion; declares `@layer ui-sdk` |
| `web/atlas-ui.js` / `web/atlas-ui.css` | Shared navigation, entity rendering, safe profile return context and common presentation |
| Existing route controllers | Search, filtering, URL/history state, record inspection, data loading, saved opportunities and visualization geometry |

The optional `@ui-sdk/core/web.css` is **not imported**. The light operational theme uses bespoke Signal styles. Dark, Flat/Tactile and Precise/Soft comparisons remain in the aesthetic workbench; they are not global research-view preferences.

## Behaviour inventory

| SDK component | Operational use | Preserved contract |
| --- | --- | --- |
| Input / Input Group / Clear | Directory, treemap and graph search fields | Real native input IDs, composition-safe input events, route query updates, named clear action and input focus restoration |
| Select | Single-choice filters, sorting, graph depth and treemap measure/currency/grouping | Native backing `<select>` IDs, option values/disabled state, ordinary `change` events and existing URL/data logic |
| Checkbox | Include unknown geography and Logo available options | Native checkbox IDs and checked state, one ordinary `change` event and route-driven synchronization |
| Segmented Control | Directory scope and treemap Map/Cards/Ranked list presentation | One selected value, keyboard navigation, existing named controls and route-backed selection |
| Tabs | Treemap Figure/Company inspection panels | Associated panels, keyboard selection and source-backed figure/company context |
| Button | Inspect, close, reset, load more, navigation and other authored actions, including dynamically rendered controls | Existing native button/link destinations and handlers; one activation per action; disabled state and meaningful accessible names |
| Agent | `window.atlasUIAgent`, created with `createAgent()` | Local discovery and operation of the same registered interface through `snapshot`, `query`, `act` and change observation |

The Select adapter keeps the original select in the DOM and hides it after enhancement. SDK selection writes the native value and dispatches the route's ordinary change event. Checkbox similarly keeps its hidden native backing control outside the wrapping label, synchronizes checked state and dispatches one change event for activation. Route-driven resets, restored history and changing option lists must update the SDK view in return without creating duplicate actions. This is a compatibility boundary, not a second source of filter state.

The installer observes dynamic markup, updates disabled/value state and avoids wrapping an already enhanced control. Route renderers may replace result rows and inspectors without losing their SDK action contracts. Generated IDs are not styling hooks; use authored classes, documented parts and exposed state attributes.

`window.atlasUIAgent` is a browser-local automation surface. The integration does not call an external model, send research data to an agent service, or establish an MCP connection. The public data MCP and the decorative MCP feature graphic retain their separate meanings.

## Publication

`scripts/build.mjs` uses esbuild to bundle the SDK entry into **`dist/atlas-sdk.js`**. The served routes load this local bundle and `atlas-sdk.css`; no runtime SDK CDN or third-party font request is required. Keep the entry, shared modules and styles in the release fingerprint/build inventory so a deployment cannot mix old adapters with new route markup.

`dist/vendor/ui-sdk-manifest.json` records the source revision, core/web versions, installed skill commit and SDK bundle SHA-256. The publication check verifies the manifest and bundle, and the design kit carries this provenance. SDK licence text is retained in `docs/UI-SDK-LICENSE.txt`.

Geist font files and their upstream licence/provenance remain under `web/assets/fonts`. The installed skill is development guidance, not a browser asset. Do not ship raw `node_modules` or use a successful local build as evidence that a revision is deployed.

## Acceptance contract

Run `npm test`, `npm run build` and the existing browser gates against the built output. `scripts/atlas-sdk-browser-checks.mjs`, called by `scripts/test-atlas-views-browser.mjs`, exercises SDK discovery and actions alongside the established directory/profile/graph/treemap checks.

Acceptance includes:

- Search, Select and segmented-control changes update real records and URL state; resets and Back/Forward synchronize the visible control and native backing state.
- Select keyboard operation, dismissal, focus return and popup placement work on desktop and a 390px viewport. Segmented controls have the intended single tab stop, and Figure/Company tabs keep their associated panels.
- Agent discovery exposes named controls and supported actions. Agent-driven search/filter/inspection triggers the existing native handler once and produces the same result as direct interaction.
- Dynamic Inspect buttons, close actions and profile destinations remain discoverable after rerendering. Mobile inspection reveals the focused heading and its next action.
- Graph root versus inspected selection, pan/zoom/manual placement, treemap measures/currencies, sources, coverage statements and unavailable/fallback states keep their existing meaning.
- Signal fonts, contrast, selected/focus states, reduced motion, long content and narrow overflow are checked in the rendered UI. A parsed stylesheet or agent snapshot alone does not establish visual accessibility.

Record the exact tested commit, CI result and deployment outcome in the release report. This document defines the implementation and acceptance boundary; it does not certify a particular release.
