# Fluid inspector upstream receipt

This isolated specimen uses the published, framework-independent core of `@usefluid/motion@0.1.2`. The package is vendored as an unmodified core subset under `specimens/fluid-inspector/vendor/usefluid-motion-0.1.2/`. It introduces no root dependency, shared runtime, React integration, theme import, or token mapping.

## Package identity

Verified on 17 November 2026 from the primary npm registry and the original release archive.

| Field | Verified value |
| --- | --- |
| Package | `@usefluid/motion` |
| Published version and npm latest at inspection | `0.1.2` |
| Publication time | `2026-11-14T13:44:47.940Z` |
| Registry metadata | <https://registry.npmjs.org/@usefluid%2fmotion/0.1.2> |
| Tarball | <https://registry.npmjs.org/@usefluid/motion/-/motion-0.1.2.tgz> |
| Tarball SHA-1 | `2561bbf3397e7ba562f18b4d463770ed57e8d52d` |
| Tarball SHA-256 | `d8a9811603d55796c53d1b317d64e230eae06f3c752e41bd3e4a917377fec2fb` |
| Tarball npm integrity | `sha512-KADMAzh/A21PNuzIfaLyqku5bE24nTQQCVaBCBLrha3DRAjoiVxBPFGswhfb/ksY9hCuyb4+vwYS9kGqSsNEOw==` |
| Official repository | <https://github.com/useFluid/fluidui> |
| Release tag | `v0.1.2` |
| Release commit | `07ffba766bc7be5b4215384185a0e49363bb1d0e` |
| Upstream main inspected separately | `0ad3688214d3f47cee09f51e1f426e7baff0c35b` |
| License | MIT; copyright 2026 Willian Figueiredo |

Both the downloaded tarball's SHA-1 and SHA-512 matched the exact values returned by npm before files were written. The per-file manifest records the retrieval timestamp, npm tar member, byte count, and SHA-256 for every copied file. No copied upstream bytes were modified.

The official [reference](https://fluidui.willradoux.com/docs/reference) and [main changelog](https://github.com/useFluid/fluidui/blob/0ad3688214d3f47cee09f51e1f426e7baff0c35b/CHANGELOG.md) already describe `0.2.0` work, including `scalePath`. The primary registry still reported `latest: 0.1.2`; this specimen does not claim those newer APIs are published or available here. In particular, `scalePath` is absent from the verified core exports.

## Copied subset and entry point

The subset contains the six published core ESM modules (`index`, `spring`, `ticker`, `path`, `morph`, and `shapes`), their six `.d.ts` declarations, and the original `package.json` and `LICENSE`. `manifest.json` is a separately authored provenance receipt; it is not an upstream file.

Consumers must import through the public core entry:

```js
import {
  createSpring,
  springCss,
  springs,
} from "./vendor/usefluid-motion-0.1.2/index.js";
```

The original package manifest is retained byte-for-byte to preserve provenance and ESM interpretation. Its optional `./react` and `./theme.css` exports refer to files deliberately omitted from this specimen subset. This directory is not a complete npm installation and must not be consumed through those optional exports. The React entry, theme stylesheet, and package README are not copied. No default Fluid theme is applied to Atlas.

The verified runtime exports from `index.js` are `PathError`, `createMorpher`, `createSpring`, `fitPath`, `parsePath`, `play`, `sampleContours`, `serializePath`, `shapes`, `springCss`, `springs`, and `stepSpring`. The core has no runtime dependencies. The optional React entry in the complete published package declares React `>=18` as an optional peer.

## API and lifecycle implications

The published declarations and pinned [spring source](https://github.com/useFluid/fluidui/blob/07ffba766bc7be5b4215384185a0e49363bb1d0e/packages/motion/src/spring.ts) establish these contracts:

- `createSpring(initial, config?)` returns mutable `value`, `velocity`, and `target`, plus `step(dt)` and `jump(value)`.
- `dt` is in seconds. `step` returns `false` at rest, sets the value exactly to the target, and sets velocity to zero. Changing a target preserves current value and velocity.
- `jump(value)` sets value and target together and clears velocity.
- `springCss(config?, samples?)` returns a sampled CSS `linear()` easing, duration in milliseconds, and a `transition(property, delay?)` helper that supplies separate transition properties.

The core does not subscribe to reduced-motion or visibility changes. The pinned [ticker](https://github.com/useFluid/fluidui/blob/07ffba766bc7be5b4215384185a0e49363bb1d0e/packages/motion/src/ticker.ts) shares one animation-frame loop across callbacks. Its `play(tick)` stop function removes that tick but does not cancel an already scheduled shared frame. A strict inspector cleanup contract therefore needs explicit host lifecycle ownership. The inspector may step core springs using its own cancellable frame handle; this does not modify or replace the upstream engine.

The optional [React bindings](https://github.com/useFluid/fluidui/blob/07ffba766bc7be5b4215384185a0e49363bb1d0e/packages/motion/src/react.tsx) include a live `useReducedMotion` subscription, but their animation hooks query the preference only when their own target effects run. The copied [MorphDialog piece](https://github.com/useFluid/fluidui/blob/07ffba766bc7be5b4215384185a0e49363bb1d0e/registry/morph-dialog/MorphDialog.tsx) keys its geometry effect to `open`, not selection changes while already open. Neither is imported into this specimen. Live preference interruption, rapid selection, viewport changes, focus return, and teardown require inspector-specific acceptance evidence.

For CSS transitions, feature-detect `linear()` support and retain an explicit supported easing when unavailable. Spring-driven geometry does not itself depend on CSS `linear()`. Reduced motion must settle the latest intended semantic state without starting a replacement animation. Re-enabling full motion or returning from a hidden tab must not replay a settled transition.

## Verification and license preservation

After copying, all 14 upstream file lengths and SHA-256 values were rechecked against the manifest. A Node import through `index.js` resolved the 12 exports listed above without React or a browser. A core spring created with `springs.firm` reached an exact target of `1`, with velocity `0` and a resting return value, when stepped at `1/60` seconds. These checks establish module availability and the copied bytes; they are not browser or accessibility acceptance evidence.

Keep the original MIT `LICENSE` and its notice with redistributed copies or substantial portions. Any later upstream update must identify the published version, verify the new archive integrity, refresh the manifest, and rerun the inspector acceptance matrix. Do not edit these vendor bytes to solve inspector lifecycle behavior.

Hardware owns optional React integration. The separate compatibility/token strand owns shared mappings and skill/library changes. This receipt and the local inspector specimen do not grant permission to change either owner's runtime files or integrate into the deployed vanilla app.
