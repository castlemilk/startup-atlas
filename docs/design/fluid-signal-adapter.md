# Fluid and Signal compatibility adapter

This is an additive integration package, not an activation of Fluid on the operational Atlas routes. It uses the verified `@usefluid/motion@0.1.2` spring-curve generator, canonical Signal tokens and finite native Web Animations. The filter and inspector specimens keep their separate owners. The React/Next.js direction remains valid; its actual Hardware implementation, router, versions and owner must be identified before integration into that application.

Baseline: `01375e4c62fd0b057cd7d21a34223b26a9e23360`, refreshed from the original `a8da234e976142647277d799d84bae792d47bf98`. The [canonical design Space](https://chatgpt.com/space/page_5167bcbbbb0c81919e1d565fd4d82e4a) and [adapter receipt](https://chatgpt.com/space/page_1ba70e20936881919ea2a0917e8646da) hold coordination and review status. A local branch, a saved source packet and a draft PR are distinct from reviewed integration and publication.

## Compatibility matrix

| Surface | Observed source | Supported boundary and remaining gate |
| --- | --- | --- |
| Deployed static architecture | HTML/ESM, UI SDK Web/Core 0.1.0-beta.6, TanStack Query Core 5.107.1 and Table Core 8.21.3 | The self-contained ESM adapter can be imported from the host's deployment base. It does not introduce a framework or change the static build. Operational routes do not import it. |
| Build and tests | Adapter Node >=20; repository CI and native harness Node 22+; esbuild 0.25.12; jsdom 26.1.0 | Browser bundle targets match the existing SDK build: Chrome 120, Safari 17 and Firefox 128. Target configuration is not evidence of tests in those browsers. |
| Hardware/Next.js lane | Documentation names `design/signal-hardware-system`; no corresponding published branch or React/Next package was found | Actual React/Next versions, App/Pages Router, SSR/hydration, package policy, style ownership and component owner remain unverified. Use the client lifecycle recipe only after owner review. |
| React upstream peer | Fluid 0.1.2 declares optional `react >=18` | A dependency range does not prove Atlas React 18/19 or Next compatibility. This adapter does not import Fluid's React hooks or install React. |
| Server import | Adapter imports pure spring calculations; no DOM access during module evaluation | Import is safe in a Node process without `window`. Mount only a connected client root after commit. Server-rendered content must already represent the current state. |
| Signal artwork pilot | Scoped GSAP/ScrollTrigger 3.15.1, `mountMotionPilot(root, {loadRuntime})` | Preserve its layers, injected runtime and teardown. Never mount this adapter over its animated elements. |
| Globe, graph and handbook | Separate route-owned motion, with known lifecycle limitations documented in `MOTION-REVIEW.md` | No global cleanup, ticker change or remediation is attempted here. Coordinate a future framework mount with those owners. |
| No JavaScript or missing animation API | Host semantic state and final layout exist without enhancement | No delayed mount, hidden content, focus transfer or URL change depends on the adapter. Missing APIs stay static. |

The branch called `feat/atlas-next-view-wireframes` contains static proposed view studies; its name is not evidence of Next.js. PR 136's merged field guide is an interpretation of reference boards, not installed Hardware. Existing artwork and provenance remain unchanged.

## Verified package and release policy

The [official registry](https://registry.npmjs.org/@usefluid%2Fmotion) identified 0.1.2 as latest at verification. It was published on `2026-11-14T13:44:47.940Z` from [07ffba766bc7be5b4215384185a0e49363bb1d0e](https://github.com/useFluid/fluidui/tree/07ffba766bc7be5b4215384185a0e49363bb1d0e/packages/motion). The package is ESM, MIT, has no runtime dependencies and has an optional React peer. [The upstream receipt](../../integrations/fluid-signal/upstream.json) records retrieval times, tarball integrity, installed-file parity and documentation hashes.

The [live documentation index](https://fluidui.willradoux.com/llms.txt) and upstream main `0ad3688214d3f47cee09f51e1f426e7baff0c35b` include unpublished 0.2.0 additions, including `scalePath` and coded path errors. Those are not 0.1.2 APIs. This adapter imports only documented `springCss` and `springs.firm` from the published entry.

The exact dependency and esbuild pin live in `integrations/fluid-signal/package.json` and its lockfile. The root dependency files are unchanged. Install/rebuild uses `--ignore-scripts`, matching repository CI. No repository release-age setting was found and the isolated install succeeded with the existing npm configuration; the Hardware owner's policy is still unknown. If any receiving environment blocks the package's age, keep the static fallback and wait for that policy's eligibility time. Do not add exclusions, relax settings, switch registries or substitute unpublished main. The release reaches 72 hours on **18 November 2026 at 00:44:47 AEDT**, and seven days on **22 November at 00:44:47 AEDT**.

The generated `THIRD-PARTY.txt` retains Fluid's complete MIT notice. The build manifest records exact source and output hashes. A reproducibility check compares every generated file without rewriting it.

## Motion choice

Fluid's `springCss(springs.firm)` produces a critically damped curve with a natural duration of 325ms. This adapter deliberately normalizes that curve into Signal's 140ms feedback and 240ms contextual timings. It uses Fluid's shape, not its natural spring timescale. Interrupted transitions preserve rendered position, then restart the finite curve; this is **not velocity-continuous physical spring simulation**.

The adapter does not call Fluid `play`, create a requestAnimationFrame loop, import React, or touch GSAP. The browser already schedules finite Web Animations. The build rejects inclusion of the upstream ticker, React, sequence or morph implementations. This avoids adding another ticking owner to existing motion.

The stock Fluid 0.1.2 hooks read reduced motion when their effects run; they do not stop an in-flight animation merely because the preference changes. Its shared ticker also has no visibility listener and retains one queued empty frame after its final unsubscribe. These are reasons for this bounded lifecycle wrapper, not claims that the adapter fixes upstream generally. See the exact [ticker](https://github.com/useFluid/fluidui/blob/07ffba766bc7be5b4215384185a0e49363bb1d0e/packages/motion/src/ticker.ts) and [React source](https://github.com/useFluid/fluidui/blob/07ffba766bc7be5b4215384185a0e49363bb1d0e/packages/motion/src/react.tsx).

## Signal token mapping

Load the existing host's `web/design-tokens.css` and Geist fonts once. Then load the adapter's `tokens.css`; it contains only scoped aliases and no global Fluid theme, font, colour scheme, reset or geometry rule.

| Fluid or adapter variable | Canonical Signal input | Meaning |
| --- | --- | --- |
| `--fluid-accent` | `--atlas-action` | Action/selection colour, not truth or verification |
| `--fluid-on-accent` | `--atlas-on-action` | Action text |
| `--fluid-surface` | `--atlas-surface` | Surface |
| `--fluid-surface-2` | `--atlas-soft` | Quiet secondary surface |
| `--fluid-text` | `--atlas-ink` | Primary text |
| `--fluid-text-2` | `--atlas-muted` | Supporting text |
| `--fluid-border` | `--atlas-border-strong` | Identifiable control edge; decorative dividers retain their host role |
| `--fluid-focus` | `--atlas-focus` | Existing focus colour; no focus behavior is added |
| `--fluid-radius` | `--atlas-radius-control` | 10px control radius; not the 18px panel or 24px feature radius |
| `--fluid-font` | `--atlas-font-body` | Self-hosted Atlas Geist |
| `--atlas-fluid-duration-feedback` | `--atlas-duration-fast` | 140ms, or approved host override |
| `--atlas-fluid-duration-context` | `--atlas-duration-normal` | 240ms, or approved host override |
| `--atlas-fluid-ease-fallback` | `--atlas-ease` | `cubic-bezier(.2,.8,.2,1)` in the current theme |

Aliases exist only under `[data-atlas-fluid]`. JavaScript reads the **canonical tokens from that root for each request**, respecting scoped host overrides and intentional zero. It does not copy the historical handbook's stale 220ms value. Invalid/missing durations produce a static result; durations above 1000ms are rejected for this finite UI contract. Supported Fluid `linear()` can animate without a fallback easing token. When Fluid easing is unavailable, a valid Signal fallback is required; otherwise the result stays static. Returning to non-reduced mode does not replay earlier work.

Operational Signal is light. An exploratory dark host must supply its separately reviewed Signal variables. This file neither invents a dark palette nor proves contrast. Radii, material, typography, focus geometry and reduced-motion appearance remain with the host and its acceptance review.

## API and visual ownership

The source API and generated ESM export `mountFluidSignal(root)`, `getSignalMotionProfile(root, role)` and `fluidSignalVersion`. Types are shipped alongside both.

```js
import { mountFluidSignal } from './assets/design-lab/fluid-signal-adapter/adapter.js';

export function attachSelectionMotion(root, layer) {
  const motion = mountFluidSignal(root);
  return {
    afterCommit(previousDestination, nextDestination) {
      return motion.transition(layer, {
        from: {
          x: previousDestination.left - nextDestination.left,
          y: previousDestination.top - nextDestination.top,
        },
        role: 'context',
      });
    },
    destroy() {
      motion.destroy();
    },
  };
}
```

This helper consumes a committed host change. It does not implement selection or a control. `previousDestination` and `nextDestination` describe **canonical destination geometry**, not the currently animated bounding rectangle. Passing the animated rectangle would count the interrupted offset twice. Commit the new layout and call the adapter in the same rendering turn. On interruption, the adapter samples its own current transform, combines that with the host destination delta, cancels only its previous effect and starts from the resulting position.

The root must be connected and carry `data-atlas-fluid`. Each layer must be an exclusive descendant marked `data-atlas-fluid-layer`, with canonical `transform: none`; root and nested-root layers are rejected. Let the host position a marker using layout/its surrounding element, and put movement on this dedicated layer. Do not put it on a UI SDK popup presence host, graph/globe camera, GSAP artwork layer, another controller's animation target, or an element that already uses a transform for persistent state. Existing transforms or active foreign native animations cause a static result and remain untouched. JS-driven foreign ownership cannot be inferred reliably, so exclusive assignment is a caller obligation.

| Method | Contract |
| --- | --- |
| `transition(layer, {from: {x, y}, role})` | Finite translation to the host's already-committed final layout. Defaults are zero offset and contextual timing. Returns `{animated, reason}` about enhancement only. No completion callback. |
| `cancel(layer)` | Cancels that root's current effect on the layer; final host layout is immediately visible. |
| `settle()` | Cancels all effects owned by this root, leaving all semantic state and CSS intact. |
| `destroy()` | Idempotent settle, policy unsubscribe and root-owner release. Call before removing/replacing the root. |
| `inspect()` | Motion diagnostics only: disposed, known/unknown reduced preference, ability to observe it, document hidden state, number of owned effects. |
| `getSignalMotionProfile(root, role)` | Reads current timing/easing/capability. It does not install a loop or mutate styles. |

The adapter writes no inline styles, state attributes, ARIA, text, focus, URL/history or storage. It does not add a key handler, observer, delayed action, success message or permission check. Native content remains fully readable; this adapter does not fade research text. Finishing motion is not proof of a successful operation or of evidence quality.

## Reduction, visibility and teardown

One policy subscription per document is shared by the mounted instances; it owns no scheduler. Each root retains its own finite animations. Initial reduction skips motion; a live switch to reduction cancels all owned effects immediately. A missing or unobservable preference yields `preference-unavailable`, not an assertion that the user selected reduction. Both modern and legacy media-query listener APIs are supported.

The policy reads its initial preference once and updates a cached value from each native change event. Diagnostics report that last observed value without polling the watched media query before notification. This prevents diagnostic reads from altering a browser's media-query comparison cache; the source regression covers that ordering. Signal's live zero-duration CSS tokens remain an independent transition-time guard.

Hidden-document and `pagehide` notifications settle the owned effects. Returning to visible or ordinary-motion mode does not replay them. The host still owns page/router lifetime and calls `destroy()` before removal. A full-document host can pair pagehide cleanup and persisted pageshow remount, following the existing motion embedding contract. This adapter does not automatically register a second router lifecycle.

Unmount removes that instance's subscription. The final unmount removes the shared preference, visibility and pagehide listeners. Same-root remount disposes the previous instance; a late old finish/cancel callback cannot remove a newer effect. Destroying one sibling does not cancel another sibling or a host animation.

The easing capability check uses `CSS.supports('animation-timing-function', generatedLinearCurve)`. Unsupported CSS `linear()` uses the root's Signal cubic-bezier explicitly. If native `animate()` nevertheless rejects the curve, it retries once with that fallback; missing/rejected native animation stays static. No external polyfill or compatibility download is introduced.

## React and Next integration recipe

The following is a complete client-side lifecycle example for the Hardware owner to adapt after agreeing the actual stack and package path. It is not evidence of an installed or compiled Next application. The package exports a typed source entry; resolving `@startup-atlas/fluid-signal-adapter` through the host's reviewed local workspace/file dependency belongs to that owner. Do not change the root package or install a framework merely to make the example resolve.

```jsx
'use client';

import { useLayoutEffect, useRef } from 'react';
import { mountFluidSignal } from '@startup-atlas/fluid-signal-adapter';

export function SignalMotionLayer({ revision, deltaX = 0, deltaY = 0, children }) {
  const rootRef = useRef(null);
  const layerRef = useRef(null);
  const motionRef = useRef(null);

  useLayoutEffect(() => {
    const motion = mountFluidSignal(rootRef.current);
    motionRef.current = motion;
    return () => {
      motion.destroy();
      if (motionRef.current === motion) motionRef.current = null;
    };
  }, []);

  useLayoutEffect(() => {
    motionRef.current?.transition(layerRef.current, {
      from: { x: deltaX, y: deltaY },
      role: 'context',
    });
  }, [revision, deltaX, deltaY]);

  return (
    <section ref={rootRef} data-atlas-fluid="">
      <div ref={layerRef} data-atlas-fluid-layer="">{children}</div>
    </section>
  );
}
```

Render final semantic content and final layout normally. Supply zero initial deltas for hydration; calculate later destination deltas in the host. Mount occurs only after a client commit. The cleanup closes over the exact controller so Strict Mode's mount/cleanup/remount cannot dispose a replacement. A real host must validate route changes, Suspense/streaming, reconciliation, SDK upgrade, hydration and Strict Mode with its actual dependencies. No stock Fluid hook is needed. Do not pass animation completion into permission, saving, focus-return or history logic.

## Tests and reproducibility

From the repository root, using Node 22 or newer for the native harness's built-in WebSocket (the adapter itself retains Node >=20 import compatibility):

```sh
npm ci --ignore-scripts
npm --prefix integrations/fluid-signal ci --ignore-scripts
npm --prefix integrations/fluid-signal run check
node --test tests/fluid-signal-adapter.test.js
npm test
npm run build
CHROME_BIN=chromium node integrations/fluid-signal/test-native.mjs
```

Use `npm --prefix integrations/fluid-signal run build` only when intentionally rebuilding the additive distribution. The root tests import the committed self-contained bundle and require no nested install; they also verify the manifest's source/output hashes. A GitHub Actions-only test entry runs the native harness with the runner's existing Chrome and saves its report in the existing `graph-review` artifact directory. Local runs explicitly skip that CI entry; the standalone command still reports local launch failures. No workflow or permission changes are made. The isolated esbuild reproducibility command remains a separate review check. Root test/build regenerate catalogue files; exclude incidental generated changes from this lane.

| Evidence type | What it can establish | What it cannot establish |
| --- | --- | --- |
| Node import and DOM/Animation doubles | No browser access at import; state invariance; token decisions; listener/resource ownership; deterministic interruption and stale-callback behavior | Native interpolation, real browser key defaults, contrast, actual tab scheduling |
| Reproducible build | Exact source/bundle parity, package pin and license; no ticker/React payload | Host integration or deployed activation |
| Native isolated harness | Only the exact browser and scenarios reported by that run | Actual Hardware/Next, sibling filter/inspector acceptance, physical touch, Safari/WebKit or Firefox |
| Owner acceptance and publication checks | Reviewed integration/release at exact revisions when performed | No implication from a draft, local test, concept image or saved document |

The current run's executed results and outstanding decisions are retained in the adapter receipt. Continue to label synthetic visibility events separately from an actual background-tab change. No deployment or new external sharing is authorized by these commands.

## Reusable guidance and promotion gates

The [Atlas-specific UI SDK companion](../../.agents/skills/ui-sdk/references/atlas-fluid-signal.md) augments the installed skill without changing its upstream text or lock record. [Package agent guidance](../../integrations/fluid-signal/AGENTS.md) makes the companion discoverable for work in this isolated package. A single upstream-skill index link can be proposed during coordinated integration; it has not been silently installed into unrelated instructions.

Before shared integration: agree exact paths and API with the filter/inspector lanes, identify the actual Hardware/Next owner and dependency policy, decide which existing controller owns each layer, and verify the host's focus/history/presence contract. Then run exact-head tests and independent review. Push only after coordination; merge/deploy only after reviewed coordinated approval. Preserve the static site's separate build and compatibility contract throughout.
