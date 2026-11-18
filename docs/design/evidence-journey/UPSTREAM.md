# UIArc reference audit

Observed on 18 November 2026. This packet uses UIArc as a documentation reference only. It copies **zero UIArc implementation source**, adds no UIArc dependency or foundation stylesheet, and makes no purchase or authentication request. Atlas runtime tokens, existing controls and inspector owners remain authoritative.

## What was verified

The [official introduction](https://uiarc.dev/docs/introduction) describes source-distributed React/TypeScript components with CSS modules. The [official free-source license](https://uiarc.dev/license) and [upstream repository license](https://github.com/kuratlielia/arc-library/blob/main/LICENSE) identify MIT, copyright 2026 Elia Kuratli, for the free collection. Pro items have separate terms; neither Pro source nor assets were adopted.

| Candidate | Documented behavior that informed review | Dependency evidence |
| --- | --- | --- |
| [Search field](https://uiarc.dev/components/search-field) | Visible label, explicit clear action, focus return and stable space for clearing. The existing Atlas control owner retains implementation. | The official installation section names `motion` and `lucide-react`; this is documentation evidence, not an audited import graph. |
| [Filter toolbar](https://uiarc.dev/components/filter-toolbar) | Explicit applied filters, descriptive remove labels and accessible change feedback. No alternative toolbar was copied or built from UIArc source. | The official installation section names `motion` and `lucide-react`; its motion uses additional measuring and spring behavior. |
| [Timeline](https://uiarc.dev/components/timeline/markdown) | Explicit timestamps and labelled, expandable detail. The specimen separates proposal, authoritative main and published snapshot contexts instead of treating them as one success event. | The official Markdown names `registry/components/timeline/timeline.tsx`, `motion` and `lucide-react`. The actual implementation was not retrievable. |

The readable [upstream README](https://github.com/kuratlielia/arc-library) lists React 19, TypeScript, Next.js App Router or Vite, CSS modules and component-specific dependencies. Its [package manifest](https://github.com/kuratlielia/arc-library/blob/main/package.json) reports private version `0.0.0`. Mutable dependency ranges and a development version are not an immutable adoption pin.

## Limits on source verification

The web reader could not retrieve the registry payloads `https://uiarc.dev/r/search-field.json`, `https://uiarc.dev/r/filter-toolbar.json`, `https://uiarc.dev/r/timeline.json` or `https://uiarc.dev/r/arc-foundation.json`. The corresponding GitHub TSX/raw-source and generated `public/r` files were also unavailable through that reader. The upstream commit listing/API endpoint did not yield an immutable revision. These are retrieval limitations, not claims that the public files are absent.

Exact component bytes, commit SHA, source digest, transitive dependency graph and registry/source parity therefore remain **unverified**. Documentation claims about keyboard and reduced-motion behavior are upstream claims, not Atlas acceptance evidence. Future source adoption requires retrieving and pinning the complete relevant files, preserving MIT notices, inspecting dependencies and obtaining the existing runtime owners' agreement.

## Local mapping and composition decision

UIArc's [theming guide](https://uiarc.dev/docs/theming) specifies different global radii and an Inter body role. Its [motion guide](https://uiarc.dev/docs/motion) uses a separate `motion/react` system. Importing either foundation would conflict with this lane's bounded scope.

| Composition role | Existing Atlas token owner |
| --- | --- |
| Porcelain results tray / page | `--atlas-paper`, `--atlas-canvas` |
| Dossier, review and source surfaces | `--atlas-surface`, `--atlas-soft`, `--atlas-border` |
| Graphite text / secondary context | `--atlas-ink`, `--atlas-muted` |
| Cobalt action, selection and focus | `--atlas-action`, `--atlas-selection-soft`, `--atlas-focus` |
| Geist heading / body / exact IDs | `--atlas-font-display`, `--atlas-font-body`, `--atlas-font-mono` |
| Control / panel corners | `--atlas-radius-control`, `--atlas-radius-panel` |
| Spacing and control depth | Existing `--atlas-space-*`, `--atlas-shadow-control`, `--atlas-shadow-inset` |
| Motion | Existing shared control/compatibility owner; no new runtime, timeline, ticker, keyframes or travel |

All mappings consume [canonical runtime CSS](../../../web/design-tokens.css) and the [existing shared presentation](../../../web/atlas-ui.css). `journey.css` scopes composition to `[data-evidence-journey]`; `page.css` scopes document chrome to `html[data-evidence-journey-page]`. No global theme values are overwritten. The layout uses quiet ruled result rows, an adjacent claim/source rail, a before/after comparison and three separate readback columns that stack in narrow containers. Full IDs, URLs and source records wrap without truncation.

Static selector/token checks and source/DOM evidence do not establish rendered layout, native focus, assistive-technology behavior, contrast in context, viewport acceptance or live reduced-motion delivery. Those checks remain held with the existing native/browser gate. No browser screenshots or visual acceptance are claimed.
