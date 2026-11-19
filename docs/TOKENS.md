# Atlas token reference

The working design system includes a searchable reference for all 65 canonical `--atlas-*` tokens, an opaque colour-pair contrast checker, and JSON/CSS exports of the current computed values. The operational palette is light Signal: porcelain, graphite, cobalt and self-hosted Geist typography. Open `design-system.html#token-reference` in the published site.

## Ownership

`web/design-tokens.css` remains the only runtime value owner. `DESIGN.md` explains its intent and exact mapping. Shared components consume the variables through `web/atlas-ui.css`, `web/atlas-sdk.css` and the established route styles. The stylesheet declares the SDK layer; Atlas does not import the optional SDK default theme. [UI-SDK.md](UI-SDK.md) records behaviour and adapter ownership.

`web/design-aesthetic-tokens.css` remains scoped to the direction workbench, including dark and alternative material/geometry comparisons. Those exploratory values do not override the light operational theme. Historical artwork and its prompt palette retain their original provenance.

`web/design-token-reference.js` contains metadata: token names, groups, labels and usage guidance. It deliberately contains no duplicate palette, type scale, duration or spacing values. The reference reads `getComputedStyle(document.documentElement)` for the rendered values, copy actions, contrast calculation and exports. If a token changes in canonical CSS, its displayed value changes with it.

The reference covers nine families:

| Family | Scope |
| --- | --- |
| Colour & surfaces | Text, action hierarchy, backgrounds, separators, focus and neutral/primary face colours |
| Entity colours | Startup, partner, person, programme and provider foreground/surface pairs |
| Research states | Partial and unavailable foreground/surface pairs |
| Typography | Display, interface and utility families; compact interface size scale |
| Spacing | Shared spacing rhythm |
| Shape & depth | Control/row/panel/feature radii and control, inset, pressed, panel and overlay shadows |
| Layout | General page maximum and graph inspector width |
| Motion | Fast/normal durations and the shared easing curve |
| Scrollbars | Thumb, hover, active and track colours |

Compatibility aliases such as `--ink` are not a second token family and are not exported. Existing route-specific literals remain migration work; the reference does not promote them to shared decisions.

## Browsing and interaction

Search matches the variable name, human label, usage and group. The native family selector narrows the same collection. The count always reports matching tokens against the complete catalogue. Empty search results retain a reset action.

Native disclosure groups keep the complete reference available without a long, unbroken grid. Colour & surfaces is initially open. Search and a specific family selection open relevant groups; individual groups and **Expand all families** remain controllable with a keyboard. Opening and closing groups changes only this local presentation.

Each token supplies three real copy actions:

- **Name** copies the custom-property name.
- **Value** copies the current computed value.
- **CSS** copies a declaration using that name and value.

Copy success appears only after the clipboard promise resolves. If the clipboard is unavailable or denied, a labelled, selectable field contains the exact requested text. A request counter prevents an older asynchronous copy response from replacing the latest feedback. Closing the fallback returns focus to token search.

The search field has an explicit clear action supplied by the shared Atlas clear behaviour. Clearing applies immediately and restores input focus. Composition input is committed after composition ends, so intermediate IME text does not repeatedly filter the reference.

## URL state

| Parameter | Meaning | Default |
| --- | --- | --- |
| `tokenq` | Search query, bounded to 160 characters | Empty |
| `tokenGroup` | Recognized token family | `all` |
| `foreground` | Canonical colour token name | `--atlas-ink` |
| `background` | Canonical colour token name | `--atlas-surface` |

These parameters coexist with the live-view and component-workbench parameters. Writing token state preserves unrelated search parameters and the hash. Unknown family or colour names fall back to the defaults. Refresh and Back/Forward restore recognized state. Disclosure openness is intentionally local.

## Contrast checker

The checker compares two opaque colours from the canonical token palette. The sample uses those variables directly; readable result text remains outside the sample so an intentionally poor pair can still be assessed.

The calculation follows the [W3C relative luminance and contrast technique](https://www.w3.org/WAI/WCAG22/Techniques/general/G145): normalize sRGB channels, linearize them using the 0.04045 breakpoint, calculate luminance with 0.2126/0.7152/0.0722 coefficients, then divide the lighter luminance plus 0.05 by the darker luminance plus 0.05.

The displayed ratio is rounded for readability. Pass/fail decisions use the unrounded value; a value below a threshold never passes merely because its label rounds up.

| Check | Threshold | Scope |
| --- | --- | --- |
| Normal text | At least 4.5:1 | Ordinary text and images of text, subject to the criterion's exceptions |
| Large text | At least 3:1 | At least 18pt (24 CSS px), or 14pt (approximately 18.667 CSS px) bold |
| Meaningful interface marks | At least 3:1 | Visual information needed to identify a component/state or understand a graphic, against adjacent colours |

These thresholds and qualifications come from [W3C Understanding Text Contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) and [W3C Understanding Non-text Contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html). The checker evaluates this pair at full opacity. It does not establish complete component or page compliance, evaluate an image or gradient, or prove that every state has the correct semantics and focus treatment.

Colour meaning remains distinct from contrast. A startup's foreground is not an approval state; a warning pair does not identify a programme. Surface and on-action share the current white value, while canvas and paper share porcelain; these remain separate roles. Raised faces add gradient endpoints, so check the actual background behind a label as well as its solid token pairs.

## Exports and handoff

**All tokens · JSON** and **All tokens · CSS** always export the full catalogue, even while search or family filters are active. Both use the current computed values. The JSON includes each token's group, kind and usage. The CSS is a declaration snapshot and labels itself as such.

Under the operating system's reduced-motion preference, duration values resolve to zero. The reference refreshes its displayed values and downloads when that preference changes; the export explicitly records whether reduced motion is active. This makes a review reproducible without pretending that a computed snapshot contains the original conditional rules.

Use the separately linked canonical `design-tokens.css` for production handoff: it retains maintained declarations, compatibility adapters and the reduced-motion media rule. Do not replace the canonical stylesheet with a runtime export or maintain a new independent theme from a downloaded snapshot.

## Extending the reference

When adding a durable token:

1. Add the value to the canonical stylesheet and record its role in `DESIGN.md`.
2. Add its name and usage metadata to the reference; do not copy the value there.
3. Confirm it appears in the intended family, its computed preview and both full exports.
4. Review the affected shared component, operational route, narrow layout and relevant contrast/state treatment.

The reference exports DOM-free `parseColor`, `relativeLuminance`, `contrastRatio`, `tokenMetadata` and `tokenGroups` for deterministic checks. Mathematical checks should use independent known ratios and boundary values. Browser checks cover computed runtime parity, restoration, reduced motion, native controls, clipboard fallback and narrow layout.
