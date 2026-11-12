---
version: alpha
name: Startup Atlas
description: An independent, evidence-led directory for comparing startup resources.
colors:
  primary: "#304ed8"
  ink: "#13203b"
  background: "#f6f5f1"
  surface: "#ffffff"
  border: "#dfe6ee"
  accentSoft: "#d4dafa"
  mint: "#b5e4dc"
typography:
  sans:
    fontFamily: '"Avenir Next", Avenir, "Segoe UI", sans-serif'
rounded:
  DEFAULT: "9px"
  control: "8px"
  pill: "999px"
omitted:
  - section: spacing
    reason: "The existing layout uses contextual spacing rather than one shared scale."
components:
  searchField: {}
  filterBar: {}
  badge: {}
  emptyState: {}
  tabs: {}
---

# Startup Atlas design context

## Purpose and visual direction

Startup Atlas helps founders compare programmes, benefits and conditions, and trace each claim to its source. The single English-language page combines a dark, cartographic introduction with a light, practical research workspace. The orbit motif is the identity; the workspace stays quiet enough for detailed reading. Partner leads are explicitly separate from researched opportunities. Country filters describe named markets and do not turn unknown eligibility into a promise.

The primary use is searching and comparing on a laptop or phone. Cards, controls and text carry meaning at rest; hover adds feedback rather than revealing essential content. Keep the existing navy, blue, pale-lilac and mint identity rather than introducing a new visual system for each feature.

## Tokens and ownership

`styles.css` is the canonical source for the existing palette, font and layout; this document mirrors its accepted values. `gamma-components.css` aliases Gamma semantic tokens to those values where roles match. Gamma-only semantic warning, danger and success roles are declared once in that adapter. Components consume `--gamma-*` roles. Updating a shared value requires updating its canonical CSS and this document together.

| Role | Canonical runtime token | Gamma alias / usage |
| --- | --- | --- |
| Primary action and focus | `--blue`, `--focus` | `--gamma-accent`, `--gamma-focus-ring` |
| Text and supporting text | `--ink`, `--muted` | `--gamma-ink`, `--gamma-muted` |
| Page, panel and border | `--page`, `--surface`, `--line` | `--gamma-bg`, `--gamma-surface`, `--gamma-border` |
| Accent surface | `--lilac` | `--gamma-accent-soft` |
| UI type | `--font-ui` | `--gamma-font-ui` |

## Gamma components

The `search-field`, `filter-bar`, `badge` and `empty-state` CSS sections come from the Gamma catalogue, retrieved on 11 November 2026. Their markup and behaviour are adapted in `index.html` and `app.js` to the existing native HTML/JavaScript application; this project does not ship React. The filter bar enhances the original selects into Gamma-inspired labelled disclosure panels with icon-led option buttons; the selects remain the state owner and fallback. The `tabs` keyboard model follows Gamma's tab guidance, with a shared panel, arrow keys and roving focus. Keep Gamma's semantic token names and document future adaptations here.

The visual direction draws on Gamma's Ledger and Nocturne systems: cyan for the map and active controls, a warm light reading surface, and compact hairline-separated results. Resource badges extend the Gamma badge with soft category-specific colours defined in `atlas-view.css`; these colours identify resource types rather than application status. Labels and status text remain explicit. The TanStack Table core row model handles opportunity ordering and the visible batch while the existing eligibility filter and semantic article markup remain authoritative.

Badges communicate metadata and never act as buttons. Filters use separately labelled native controls and removable buttons. Search retains focus when cleared. Empty and no-results states explain a recovery action. Opportunity details use a native disclosure. Saved items remain browser-local; the index does not submit applications or collect private business information.

## Layout, motion and accessibility

Use a horizontal search and filter toolbar and a compact result list on wide screens, with stacked filters and cards at narrow widths. Avoid fixed-height ancestors so long conditions and keyboard zoom remain readable. Results load in explicit batches. Preserve URL-backed query and filter state, visible focus, semantic buttons and links, accessible labels, and reduced-motion handling. Company logos are self-hosted with initials as fallback. Always show source and review date; a decorative colour or icon must not be the only indication of status.

The cartographic introduction includes a Three.js globe as an exploration aid, with a canvas fallback if WebGL is unavailable. A short, clearly labelled list of sourced city-level places provides the same selection without dragging. Office and programme locations do not imply eligibility or a verified commercial relationship. Auto-rotation has a pause control, honours reduced motion and stops outside the viewport. The map uses the existing navy, blue and mint tokens rather than a separate theme.

Place buttons retain native pressed semantics. Their check mark and the labelled selected-place panel make selection clear without relying on colour; the selected map pin carries a ring in both renderers. Following Gamma's Jelly Radio guidance, selection feedback does not reflow neighbouring controls and motion is removed for reduced-motion preferences. Choosing a place pauses rotation and animates the shortest route to it; manual controls interrupt the movement.

The hero places the globe beside a concise introduction and a sourced-place panel, with resource shortcuts that activate the same directory filter. The directory uses compact, source-visible rows on wide screens and stacked cards on narrow screens; category, market, amount, status and checked date remain available without hover. The partner index keeps its separate lead cards and never inherits programme-status labels.

Partner-index filters adapt Gamma's filter bar to labelled disclosure panels with icon-led option buttons for provider and evidence plus a logo availability checkbox. Removable chips expose active constraints; provider-specific evidence only matches the same provider relationship. Screenshot leads and provider listings remain separate evidence types, with no implied eligibility. URL parameters preserve those selections.
