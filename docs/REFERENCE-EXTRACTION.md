# Signal reference extraction

**Recorded 17 November 2026.** We used the normalisation and JSON/CSS generation functions from [extract-design-system v0.1.11](https://github.com/arvindrk/extract-design-system/tree/1873741ba8dea755e35e6e15134f7918cd58e036), with computed-style observations collected through the supported browser. This adds measured reference evidence to the [Signal component direction](SIGNAL-COMPONENTS.md).

The result covers **29 selected elements**, all at **1363 × 936, DPR 1, desktop light appearance**. Granola and Clay include explicitly opened navigation menus; Geist covers its resting material specimens. There are no dark-reference measurements or systematic hover, pressed, focus, mobile or error-state captures. These snapshots describe the sampled pages and states, not each product's complete design system.

## Reviewable outputs

| Reference | Samples | Original observations | Generated starter files |
| --- | --- | --- | --- |
| [Granola enterprise](https://www.granola.ai/enterprise) | 9 | [observations.json](reference-extraction/granola/observations.json) | [tokens.json](reference-extraction/granola/tokens.json) · [tokens.css](reference-extraction/granola/tokens.css) |
| [Clay homepage](https://www.clay.com/) | 9 | [observations.json](reference-extraction/clay/observations.json) | [tokens.json](reference-extraction/clay/tokens.json) · [tokens.css](reference-extraction/clay/tokens.css) |
| [Geist materials](https://vercel.com/geist/materials) | 11 | [observations.json](reference-extraction/geist/observations.json) | [tokens.json](reference-extraction/geist/tokens.json) · [tokens.css](reference-extraction/geist/tokens.css) |

The [machine-readable audit](reference-extraction-audit.json) records collection metadata, source hashes, file checksums, selected findings and Atlas decisions. Original captures retain selectors, sample keys, per-element state, dimensions and computed property strings. The starter CSS is a reference artifact with unscoped variables; it is not imported into Atlas styling. No third-party images or font binaries were copied.

## What was measured

| Reference | Observed component evidence | Implication for Signal — design interpretation |
| --- | --- | --- |
| Granola | The open feature tray and MCP row both have 8px radii. The tray has 8px padding and a computed 1px border; both report no box shadow. Navigation sales is 38px high, while the separate hero sales action is 56px. Their giant computed radius is a browser-clamped pill value. | Keep rows planar inside a shared container. Give navigation and hero actions different scale roles. Signal's 12px selected rows and 18px trays are authored values. |
| Clay | Navigation actions and use-case tabs have 12px radii; the prompt field has a 20px radius. The sampled field has no visible border or box shadow. The prompt preset uses different top/bottom edge colours and no box shadow. | Rounded rectangles support the softer direction. A restrained edge can provide tactility; Signal's inset fields and convex button faces are additional design choices. |
| Geist | Material base/small/tooltip use 6px radii; medium/large/menu/modal use 12px; fullscreen uses 16px. Boundaries and depth use layered shadow rings even though CSS border width is zero. Menu and modal specimens add progressively larger shadows. | Assign depth by surface role and keep ordinary content flat. Signal's 6/10/12/18/24px hierarchy adapts that method to its own controls and feature panels. |

Granola's observed heading uses the Quadrant stack at 54px and its body uses Melange. Clay's sampled heading uses Roobert at 88px. Geist's page heading uses Geist Sans at 40px. These are contextual typography observations; Signal retains its self-hosted Geist family and its own application scale.

The sampled elements produce these **candidate buckets**, after filtering and de-duplication:

| Reference | Colour values | Nonzero spacing values | Radius values | Unique non-`none` shadows |
| --- | --- | --- | --- | --- |
| Granola | 5 | 7 | `0px`, `8px`, `3.35544e+07px` | 0 |
| Clay | 8 | 6 | `0px`, `12px`, `20px` | 0 |
| Geist | 4 | 3 | `0px`, `4px`, `6px`, `12px`, `16px` | 7 |

The counts describe this sample. They do not establish exhaustive palettes or official token scales. In particular, zero sampled shadows on Granola or Clay does not establish that every surface on either site is flat.

## Observation versus Atlas decisions

Signal's **cobalt action**, **porcelain/graphite material**, **1–2px button lip**, **1px pressed travel**, **inset input**, **44px control target**, and **76/100px row minimums** are Atlas decisions. The component workbench demonstrates those choices in both Signal themes. The references support the broader principles of controlled curvature, quiet reading surfaces and selective elevation; they do not provide those exact Atlas values or dark-theme evidence.

Preserve these distinctions when reusing the audit:

- Granola's capture key `primary-action` identifies its navigation sales link. The hero action is a separate sample. No global primary colour is inferred from that key.
- Granola's `3.35544e+07px` radius remains unchanged in the evidence. “Pill” is its interpretation; Atlas's `999px` is its own implementation choice.
- Use computed values when reporting a measurement: Granola's tray class mentions `0.5px`, but its captured border computes to `1px`.
- Border colour alone does not establish a visible border. Geist's shadow rings are not CSS borders, and its 240 × 100px examples are documentation specimen dimensions.
- An offscreen flag does not mean an element is hidden. A hover utility class or transition duration does not establish an operated hover state.

## How the upstream tool was used

The reviewed commit is `1873741ba8dea755e35e6e15134f7918cd58e036`. Its [normalizer](https://github.com/arvindrk/extract-design-system/blob/1873741ba8dea755e35e6e15134f7918cd58e036/src/normalize/normalize.ts) accepts colour strings, font roles, spacing/radius arrays and shadow arrays. Its [writer](https://github.com/arvindrk/extract-design-system/blob/1873741ba8dea755e35e6e15134f7918cd58e036/src/commands/write-design-system.ts) saves JSON and calls the [CSS generator](https://github.com/arvindrk/extract-design-system/blob/1873741ba8dea755e35e6e15134f7918cd58e036/src/generators/css-vars.ts).

Our [reproduction adapter](../scripts/normalize-design-reference.mjs) prepares those buckets from recorded observations, then calls the unchanged functions. Font roles come from observed body/heading tags; no primary, secondary or accent colour is inferred. Fully transparent colour values, zero-width borders and zero/normal/auto spacing are excluded from candidate buckets while the original capture stays intact. Border colour shorthands are separated into their reported colour values. Pill radii retain their exact measured strings.

The upstream schema fixes `source.extractor` to `dembrandt`. The adapter corrects that field to `supported-browser-computed-styles` before persisting any output, and identifies the normalizer/version/commit separately. Consequently, use this adapter to regenerate these files; unmodified upstream `init` expects its fixed collector literal. The full browser-extraction CLI was not run. This workflow launches no local browser.

The recorded run verified the pinned source and MIT licence against Git blob hashes, stripped TypeScript syntax for local execution, and used Zod 4.4.3 with Node 24.22.1. The project contains the adapter and evidence files, with no vendored upstream implementation or additional app dependency.

## Regenerate from the recorded captures

From the Atlas repository root, with ordinary Git/npm access, prepare an external checkout and use its own build:

```bash
atlas_ref_work="$(mktemp -d)"
git clone https://github.com/arvindrk/extract-design-system.git "$atlas_ref_work/extractor"
git -C "$atlas_ref_work/extractor" checkout --detach 1873741ba8dea755e35e6e15134f7918cd58e036
npm --prefix "$atlas_ref_work/extractor" ci --ignore-scripts --no-audit --no-fund
npm --prefix "$atlas_ref_work/extractor" run build

for atlas_ref_name in granola clay geist; do
  node scripts/normalize-design-reference.mjs \
    --upstream "$atlas_ref_work/extractor" \
    --input "docs/reference-extraction/$atlas_ref_name/observations.json" \
    --output "$atlas_ref_work/output/$atlas_ref_name"
done
```

The adapter verifies the relevant source hashes and version, then writes `observations.json`, `tokens.json` and `tokens.css` into each separate output directory. Re-running it regenerates both starter formats from the saved captures. A fresh observation pass requires the supported browser, explicit page/state coverage and a new capture timestamp; regeneration alone does not refresh the evidence.
