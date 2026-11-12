---
version: alpha
name: Startup Atlas
description: An independent, evidence-led directory for comparing startup resources.
colors:
  primary: "#1e563c"
  ink: "#173a2b"
  background: "#f6f0e5"
  surface: "#fbf7ef"
  border: "#cfd5c2"
  accentSoft: "#e4e8d5"
  mint: "#d9e4c6"
typography:
  sans:
    fontFamily: '"Avenir Next", Avenir, "Segoe UI", sans-serif'
rounded:
  DEFAULT: "9px"
  control: "7px"
  pill: "999px"
components:
  searchField: {}
  filterBar: {}
  badge: {}
  emptyState: {}
  tabs: {}
---

# Startup Atlas design context

## Visual direction

Field Atlas is an editorial cartographic directory: warm ivory, forest ink, sage geography and restrained vermilion. A Georgia display face gives the page a field-guide voice; the existing UI sans keeps controls and dense data legible. The sourced globe is the signature. Use quiet surfaces, hairline dividers and compact rows so research remains the focus.

`field-atlas.css`, loaded after the existing styles, owns the current visual overrides and canonical runtime token values. The root token aliases continue to feed the existing Gamma adapters; `globe.js` owns the canvas map colours. Keep this document and runtime values in sync. The existing native HTML/JavaScript controls and Gamma-adapted components remain the behavioral owners.

## Behavior and evidence

Keep opportunity eligibility separate from geographic office and programme locations. Do not imply provider relationships from historical screenshots, company names or logos. Show sources and review dates where available. The country filter uses the explicitly curated map locations and retains an unmapped option; it must not promise eligibility.

Keep search, query and filter state in the URL, keyboard-visible focus, semantic controls, explicit empty and error states, and reduced-motion support. The globe has selectable city buttons and a canvas fallback, pauses for selection, and offers a non-drag alternative. Self-host logos and fall back to initials.

Keep the directory compact on wide screens and reflow partner and opportunity rows into a readable single-column mobile layout. The custom filter disclosures retain native select state as a fallback, visible option icons, source logos where available, and textual labels and selected states.
