---
version: alpha
name: "Startup Atlas"
description: "An editorial field guide to startup opportunities and sourced relationships."
colors:
  primary: "#173a2b"
  action: "#184b32"
  canvas: "#f4f7ef"
  surface: "#ffffff"
  border: "#d8e1d2"
  textMuted: "#617b65"
  person: "#bb8567"
  programme: "#c2a15f"
  provider: "#8196a8"
typography:
  display:
    fontFamily: "Georgia, serif"
  interface:
    fontFamily: "system-ui, sans-serif"
rounded:
  control: "8px"
  panel: "13px"
spacing:
  page-max: "1640px"
  graph-gap: "16px"
components:
  graph-card:
    description: "White card, quiet border, type-coloured avatar, visible focus."
  graph-link:
    description: "Muted curved connection backed by a published source."
  search:
    description: "Prominent labelled input with a dark green action."
---

# Startup Atlas design context

## Overview

Startup Atlas is an open field guide for founders exploring programmes, people, companies and the organisations that connect them. The product combines editorial presentation with a practical research tool: serif headings and forest green anchor the field-guide identity, while controls and dense graph labels use the system sans face. Avoid an anonymous enterprise dashboard or a decorative network that implies relationships unsupported by evidence.

The current site is English-language and has desktop and mobile layouts. Global browsing is supported; location does not imply programme eligibility. `web/styles.css` and route-specific stylesheets are the runtime source of truth; this document records their existing design intent and does not generate tokens.

## Colors

Forest green carries navigation, text and actions. White panels sit on a pale, green-tinted canvas with restrained borders. Graph entity accents distinguish people, programmes and providers; labels and an accessible connection list carry meaning independently of color. Check contrast and visible focus when changing these colors.

## Typography

Georgia headlines lend an editorial voice. System sans is used for controls, labels and compact data. Do not truncate the accessible entity name when a graph card wraps its visible label.

## Layout

The explorer uses a flexible graph and a 335px detail panel, changing to a stacked layout below 820px. The page is bounded at 1640px. Keep search, depth, filters, zoom, profile navigation and the equivalent connection list usable at narrow widths. The graph may be panned and zoomed without trapping page scroll outside its canvas.

## Elevation & Depth

Use tonal separation, thin borders and minimal shadows. The selected graph card receives a stronger outline and a modest shadow; cluster shapes are quiet context, not evidence of new relationships.

## Shapes

Panels use soft rectangular corners, controls use tighter corners, and avatars and node ports are circular. Source-backed edges use restrained curved lines.

## Components

Native buttons, links and selectors own their keyboard and focus behavior. Graph cards support pointer dragging and arrow-key movement; Enter opens a node, and reset restores the automatic arrangement. The connection list exposes the same visible relationships with source links. Search, no-results and unavailable states should remain explicit. Respect reduced-motion settings.

## Do's and Don'ts

- Do retain source links and distinguish a portfolio listing from funding or eligibility.
- Do keep controls readable, discoverable and usable without a pointer.
- Don't infer a relationship from visual proximity, a logo or a matching name.
- Don't add decorative motion that obscures labels or interaction state.
