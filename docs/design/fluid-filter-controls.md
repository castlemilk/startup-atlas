# Atlas Fluid filter and control specimen

This isolated specimen adds selection continuity and finite feedback to a small Atlas filter surface. It uses the existing UI SDK for segmented selection, search/clear, Country selection and actions. The design remains Signal: Geist, porcelain and graphite surfaces, cobalt selection, existing radii, and 140/240ms timings. Eight explicitly fictional records make the interaction review reproducible without making research claims.

The implementation lives outside `web/`, so the normal site build does not publish it. It is not a Hardware installation, a React migration, an inspector-continuity implementation or a global motion adapter.

## Ownership and coordination

Initial main inspected was `a8da234e976142647277d799d84bae792d47bf98`. The branch was subsequently advanced to `01375e4c62fd0b057cd7d21a34223b26a9e23360`, preserving the merged MCP record and asset lanes. Signal, UI SDK and motion embedding guidance were read at those baselines; the latter updates changed no frontend owners or tokens.

Owned paths are limited to:

- `prototypes/fluid-filter-controls/`
- `tests/fluid-filter-controls.test.js`
- `scripts/test-fluid-filter-controls-browser.mjs`
- This document

The [canonical Design System Space](https://chatgpt.com/space/page_5167bcbbbb0c81919e1d565fd4d82e4a) and [specimen receipt](https://chatgpt.com/space/page_8734e3c819288191a08148ae557faf2c) carry the handoff. A bounded search found no published branch matching Fluid or Hardware at the initial audit; it does not establish that those owners are inactive. Their work remains reserved, as do inspector continuity and shared skills. Held PRs 107 and 135 are unrelated.

**Shared boundary:** the host owns committed filters, route/history state, records, result presentation and SDK semantics. A decorative selection indicator may consume those committed choices. Its motion is cancellable, instance-scoped and disposable; it cannot defer a semantic change or own inspector selection. Hosts call disposal before removing a root. This specimen proposes no shared adapter API and changes no global token or skill.

On 17 November 2026 the [compatibility lane](https://chatgpt.com/space/page_1ba70e20936881919ea2a0917e8646da) accepted this host-owned boundary. This lane acknowledged its reserved files and optional `mountFluidSignal(root)` / `transition` / `cancel` / `settle` / `destroy` proposal in that page's comment thread `13b29900-77b5-59c8-8d06-1957cea4b2b5`. The current CSS marker is not a validated consumer of its x/y translation layer; conversion requires separate review and must preserve one animation owner per layer.

The [inspector's draft PR 160](https://github.com/castlemilk/startup-atlas/pull/160), observed at `295dbe32b3914a0338aee118ccdba0255e83e484`, has non-overlapping paths. This lane acknowledged its canonical entity ID + opener to select/close/destroy boundary in canonical Space thread `7d2d193b-6d55-579d-9170-b7545d1ed874`. Filtering must not implicitly replace inspected identity, close its panel or move focus; handling an inspected record that leaves the result set remains a host/inspector integration decision. These are isolated proposal acknowledgments, not an integrated API acceptance. Hardware/Next.js owner confirmation remains pending.

## Interaction contract

| Action or condition | Observable outcome | Focus |
| --- | --- | --- |
| Choose entity type | The SDK radio group checks one choice; matching rows, count and active-filter chip update in the same task. A static check identifies the choice while its decorative background moves. | The activated item remains focused. Arrow movement belongs to the SDK. |
| Change Country | The SDK Select commits one country and closes its popup. It exposes the same setting to the local SDK agent. | The SDK returns focus to its trigger. |
| Search | Filtering follows committed input. An unfinished IME composition is not used as a query, and changing another filter does not overwrite its draft. | Remains in the input. |
| Clear search or reset | Cancels a pending composition and reconciles the native and SDK inputs even when committed query state was already empty. | Search input. |
| Remove an active filter | Removes only that criterion and updates results immediately. Chips have explicit removal names. | Entity type returns to All; Country to its trigger; query to the search input. |
| No matches | Shows an honest no-match message and working Clear all filters action. It does not depict loading or a data failure. | Stays at the active filter; explicit recovery focuses search. |
| Rapid A to B to C selection | C is authoritative immediately. The CSS transition retargets from its current computed position. No result state depends on transition completion. | Follows the actual SDK action. |
| Baseline | Same filters, counts, status and recovery, without the decorative marker transition or feedback pulse. | Same as enhanced mode. |
| Reduced mode or live device preference | Cancels local movement and displays the latest selection immediately. Turning reduction off does not replay; a subsequent deliberate change may animate. | Unchanged. |
| Hidden document | Stops owned transitions and feedback. Changes made while hidden remain authoritative; returning visible does not replay a backlog. | No artificial focus move. |
| Failed optional curve | Fully functional baseline; no retry loop and a truthful specimen notice. | Existing controls stay usable. |
| Destroy/remount | Abort local handlers and preference listener, cancel owned animation and disable the paused controls. Retain the last visible state with a truthful paused notice. Replacement mounts retain current values; an old destroy call cannot disable the replacement. | Host owns focus placement before removing its root. |

The native SDK radio pattern uses one tab stop, arrow-key selection and Space. Enter retains the SDK's native form semantics; this specimen has no submitting form. It does not introduce a custom tab pattern or intercept keys globally. The Country popup uses the installed SDK's keyboard and dismissal behavior. A focused control has a distinct 3px outline; the moving selection background is never the focus indicator.

The status region announces result/filter changes, not animation frames. Text, result rows and numeric values do not animate. Feedback is a short translucent background behind the result heading, not a fabricated loading or success signal. Result rows remain in stable authored order and are hidden or shown without rebuilding interactive controls.

## Fluid package evidence

The audit fetched the actual [npm registry metadata](https://registry.npmjs.org/@usefluid%2fmotion), verified the registry SHA-512 integrity against the [0.1.2 tarball](https://registry.npmjs.org/@usefluid/motion/-/motion-0.1.2.tgz), and inspected the declarations and source. The package was observed as npm latest on 17 November 2026; this is a dated observation, not a floating dependency.

| Item | Verified value |
| --- | --- |
| Package | `@usefluid/motion@0.1.2` |
| Licence | MIT; Copyright (c) 2026 Willian Figueiredo |
| npm source commit | `07ffba766bc7be5b4215384185a0e49363bb1d0e` |
| Tarball SHA-256 | `d8a9811603d55796c53d1b317d64e230eae06f3c752e41bd3e4a917377fec2fb` |
| Upstream main inspected separately | `0ad3688214d3f47cee09f51e1f426e7baff0c35b` |
| Runtime used here | Verbatim `spring.js`, with its `.d.ts` and MIT notice; per-file hashes in `vendor/manifest.json` |
| API | `springCss({ w, z }).easing`; no React requirement for this core function |

The specimen dynamically loads this audited module and samples a critically damped `{ w: 44, z: 1 }` curve. It deliberately uses the existing Atlas 240ms contextual duration rather than the package's computed duration. This is a local retiming experiment, not a new global spring token. The 140ms feedback pulse uses the existing fast duration. There is no perpetual ticker.

The public package API is distinct from the latest website. At audit time the [engine documentation](https://fluidui.willradoux.com/docs/engine/) described `scalePath`, but npm 0.1.2 did not export it. This specimen uses only the verified `springCss` export. The official [SegmentedPicker source and guidance](https://github.com/useFluid/fluidui/tree/07ffba766bc7be5b4215384185a0e49363bb1d0e/registry/segmented-picker) distinguishes same-list filters from panel tabs; Atlas retains its installed SDK implementation of that radio interaction rather than adopting the React component.

The vanilla spring/ticker module does not implement reduced-motion or document-visibility policy. The audited React `useReducedMotion` hook subscribes to live changes, but the other spring/morph/sequence effects inspect the preference when their target effect runs. They do not by themselves satisfy this specimen's live cancellation requirement. This implementation owns its preference/visibility listeners explicitly and avoids the shared ticker.

`CSS.supports('transition-timing-function', 'linear(0, 1)')` selects the generated curve only when supported. The compatibility path uses the existing `--atlas-ease` value with the same duration. The longhand transition properties remain independent of the curve. Both paths are acceptance targets. The specimen claims positional continuity under CSS retargeting, not preservation of physical spring velocity.

## Build and lifecycle

From the repository root, using the existing installed dependencies:

```sh
node prototypes/fluid-filter-controls/build.mjs /tmp/atlas-fluid-filter-preview
python3 -m http.server 4178 --bind 127.0.0.1 --directory /tmp/atlas-fluid-filter-preview
```

Open `http://127.0.0.1:4178/`. Query options `?mode=baseline`, `?mode=reduced`, `?theme=dark` and `?fallback=true` initialize review settings. They are specimen harness settings, not new product preferences or a filter-route contract. Device reduced motion takes priority over all harness modes.

`buildSpecimen(output)` bundles only the already installed UI SDK entries and the specimen controller. It copies the existing Atlas/Signal styles and self-hosted fonts. The optional spring module remains a local separate request, allowing failure and initial reduced-mode tests. No CDN, credentials, model call or external service is involved.

An embedding proposal uses complete authored markup with unique IDs and valid local references, the existing host tokens, and `controls.css`. It omits standalone `page.css` and the page bootstrap. `mountFilterControls(root, options)` returns an instance with `destroy()`, `getState()`, `getMotionState()`, `setMode()` and `setFallback()`. These are specimen-local APIs, not a shared adapter contract. The host disposes before removing the root so SDK custom elements receive their normal disconnect lifecycle. Do not nest roots or animate the indicator from another owner.

The root owns no RAF loop, resize observer, document mutation observer or polling timer. The SDK indicator owns its documented measurements. All reusable CSS is rooted at `[data-fluid-controls]`; only standalone page chrome uses `html[data-fluid-filter-page]`. Narrow layout follows the root's container width. Light consumes canonical Atlas values. The dark comparison uses the existing scoped Signal workbench values; it does not establish operational dark mode.

## Acceptance and evidence

```sh
node --test tests/fluid-filter-controls.test.js
node scripts/test-fluid-filter-controls-browser.mjs
npm test
npm run build
git diff --check
```

The focused source suite checks synchronous state/result commits, active-filter focus, composition across other filters, explicit clear/reset, reduced and baseline parity, live preference cancellation, injected hidden-document lifecycle, failed/deferred loading, replacement ownership, disposal, independent controllers and vendor hashes. Those are deterministic DOM/lifecycle checks, not rendered geometry or contrast evidence.

On GitHub Actions the existing `npm test` step also runs the dedicated browser acceptance script. Its outputs go beneath the existing `startup-atlas-graph/fluid-filter-controls` artifact directory, requiring no workflow or permission changes. Local execution of the browser script remains available independently; the source test reports the CI browser case as skipped outside that environment. The browser script must fail on an actual acceptance failure rather than silently converting it into a pass.

The browser run records source revision and hashes, actual keyboard actions, SDK agent parity, interruption geometry, reduced-motion media changes, compatibility easing, cleanup, no-JavaScript and failed-curve cases, and responsive/light-dark screenshots. Real tab visibility and any injected visibility seam must be reported separately. Actual screenshots require inspection before visual acceptance. Source-only colour calculations cannot establish rendered contrast.

Local browser constraints observed in this session: Browser extension bootstrap timed out; the cloud browser returned `ERR_CONNECTION_REFUSED` for the local preview; local Chromium with its sandbox enabled aborted with `socket() failed: Operation not permitted`. No permission, credential, sandbox or security changes were made. Exact CI receipts and any remaining browser gaps belong in the linked specimen receipt. A local build, draft PR or passing source suite is not a production release.

## Review status and integration gate

Independent source review reproduced and corrected IME draft loss on unrelated filter changes, stale result state after explicit SDK clear, reset of an uncommitted draft, and a misleading disposed-state message. The Country filter was promoted from a native-only control to a locally composed SDK Select so named filter actions are also available to the SDK agent. Regression tests cover those corrections.

Promotion remains contingent on independent review of the final revision and actual browser receipts, then acceptance of the concrete integration by the compatibility, inspector and Hardware owners. The specimen introduces no production migration, release, inspector changes, shared skill rewrite, source data edit or new global token. Browser/screen-reader/physical-device coverage that has not been executed must remain explicit.
