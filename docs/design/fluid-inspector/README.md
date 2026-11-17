# Atlas Fluid inspector continuity specimen

This isolated vanilla specimen evaluates how a selected entity remains identifiable while its detail panel opens, is interrupted or is dismissed. It does not replace an Atlas view. The operational product, Hardware/Next.js integration, filter controls, shared token adapter and shared skills retain their existing owners.

## Scope and ownership

The lane owns `specimens/fluid-inspector/`, `docs/design/fluid-inspector/` and the additive `tests/fluid-inspector.test.js` test entry. It changes no `web/` runtime file, application route, root dependency, workflow, permission, research dataset or production build inventory. The existing PR workflow runs the test entry and retains browser outputs under its existing `graph-review` artifact. There is no new release or migration.

Initial source inspected: `a8da234e976142647277d799d84bae792d47bf98`. The three fixtures preserve names, IDs, summaries and recorded source URLs from that exact `data/graph.json`; they are not a refreshed research result. No company logo or portrait is requested or copied. Later implementation/review revisions are recorded in [EVIDENCE.md](EVIDENCE.md).

Coordination was requested in the [canonical Design System Space](https://chatgpt.com/space/page_5167bcbbbb0c81919e1d565fd4d82e4a), comment thread `7d2d193b-6d55-579d-9170-b7545d1ed874`. The [filter/control strand](https://chatgpt.com/c/6afc3784-4350-83ec-a419-05b97d3999b8) retains controls and filter state. Its [specimen receipt](https://chatgpt.com/space/page_8734e3c819288191a08148ae557faf2c) now contains this lane's acknowledgment of host-owned filter state, results, URL/history and native/SDK semantics, with the proposed invalidation/focus handoff (thread `dce6b3a9-9dac-53a9-8210-143f12d0c1a2`).

The [reserved compatibility/token-adapter and skill lane](https://chatgpt.com/space/page_1ba70e20936881919ea2a0917e8646da) owns its shared paths. Both filter and compatibility owners acknowledged the inspector's paths and host seam in the canonical thread on 17 November 2026. Filter membership changes will not implicitly close or retarget inspection; explicit invalidation remains a future host policy decision. The compatibility owner confirmed that its finite Web Animations adapter preserves position, not physical spring velocity, and is not a drop-in replacement for this driver. This lane accepted that distinction in thread `bd73ce06-cac2-595a-a7bf-56745e4887f6` and the canonical thread. The isolated boundaries are agreed; shared runtime adoption still requires a separately reviewed contract. Hardware/route-owner acknowledgment and the narrow modal decision remain pending before integration.

## Design decisions

Identity and evidence change synchronously on selection. No previous entity is cross-faded beneath a new title, no numeric value is interpolated, and motion never signifies source quality or a relationship. A persistent check and selected boundary connect the row to the named detail panel.

The finite panel movement is 12px horizontally on desktop and 20px vertically in the narrow specimen. It uses the pinned Fluid `firm` spring and the existing Atlas contextual-duration token, settling exactly at the end of that duration. Reversing open/close preserves the spring's position and velocity. Selecting another entity while opening changes content without restarting the opening trajectory; changing an already open selection adds no ornamental entrance.

Light appearance reads canonical `web/design-tokens.css`; the dark comparison reads the existing scoped `web/design-aesthetic-tokens.css`. No shared token values are rewritten, and no Fluid theme is imported. The specimen styles use those existing roles directly. Dark appearance is a workbench comparison, not operational dark-mode support.

Desktop inspection is a nonmodal native dialog. Native Inspect activation retains focus on the invoking button, and the detail controls remain in document tab order. The narrow layout uses a native modal sheet, with heading focus and platform-owned containment. **The current Atlas runtime instead stacks narrow inspectors in normal reading order.** The sheet is a proposed interaction requiring route/Hardware-owner acceptance; this specimen does not amend `UX-CONTRACT.md`.

The native dialog owns modal semantics and background inertness. A scoped ordinary-Tab boundary handler wraps between its rendered actions and handles reverse Tab from the initially focused heading. This was added after Chrome returned a focused document viewport at the end of the native Tab sequence; it preserves consumed keys and browser modifier shortcuts and is removed on teardown. There is no global focus listener, duplicated SDK adapter or React component. Existing SDK registration, agent discovery and runtime behavior remain unchanged. An eventual integration must use the approved host's semantics/controller rather than silently replacing them with this specimen.

## Running and reviewing

From the repository root, serve the source tree and open the specimen:

```sh
python3 -m http.server 4177 --bind 127.0.0.1
```

Open `http://127.0.0.1:4177/specimens/fluid-inspector/index.html` in a browser that can reach that process. The page loads only local scripts, styles and the existing Geist fonts. Source/profile links are ordinary destinations; the specimen does not fetch them.

```sh
node --test specimens/fluid-inspector/inspector.test.js
node --test tests/fluid-inspector.test.js
CHROME_BIN=google-chrome node specimens/fluid-inspector/browser-check.mjs
```

The root test entry runs the deterministic suite everywhere. Its isolated browser check runs under the existing CI environment; local source tests explicitly skip that CI-only entry. The standalone browser command requires a normal working sandboxed Chrome installation. Do not weaken browser or execution controls to run it.

Review actions beneath the specimen exercise rapid programmatic selection, close/reopen, appearance and mount lifecycle. They are test controls, not application filters. Query `?linear=off` forces only the capability-test fallback. Query `?motion=fail` deliberately fails the optional motion loader while retaining working immediate inspection. These are labelled test conditions, not claims about the browser's native support or network availability.

## Proposed host seam

```js
import { mountInspector } from './inspector.js';

const inspector = mountInspector(root);
inspector.select('startup:canva', { opener: inspectButton });
inspector.close({ reason: 'dismiss', restoreFocus: true });
inspector.destroy();
```

`root` must be connected and contain the complete authored specimen markup, including uniquely identified dialog/title elements, static fallback content and record templates. Sibling instances require unique authored IDs and local ARIA associations. Nested instances are outside the contract. The host owns outer layout, current records, filtering, route/history state and source correctness. This specimen's fixed record rows are a harness, not a dynamic production list renderer.

| Operation | Contract |
| --- | --- |
| `select(id, {opener, focus})` | Unknown IDs return false without mutation. A known ID commits title, detail content and selection immediately. Default `focus: 'auto'` preserves the invoking control on desktop and focuses the heading for the narrow modal. Explicit `'panel'` focuses the heading. `'preserve'` is useful for desktop host updates; modal containment still applies. |
| Same ID selected again | No new motion, content replacement or status announcement. An explicitly requested heading focus is honored. |
| New ID with no opener | Clears a previous entity's return target. Dismissal falls back to the authored records heading, rather than returning to the wrong row. |
| `close({reason, restoreFocus})` | Defaults to dismissal and return to the latest usable opener. Use `reason: 'invalidated', restoreFocus: false` when a host filter invalidates selection and already owns focus. A later external focus move during exit is preserved. |
| `destroy()` | Idempotently cancels frames, removes owned listeners, closes the dialog, restores authored style values and exposes static record details. The host calls it before removing or replacing an idle root. Old callbacks/destroy handles cannot dispose its replacement. |
| `snapshot()` | Read-only specimen diagnostics, including latest intent, phase, selected ID, pending frame count and spring state. This is a test seam, not a shared production interface. |

## Lifecycle rules

- Live reduced motion or a hidden document settles the latest open/closed intent and cancels the owned frame immediately. Returning to full motion/visibility does not replay it. CSS selection transitions are removed by the same state and live media rule.
- Only one specimen-owned frame may be queued. The official core `createSpring` is used without the package's shared `play()` ticker, so teardown can cancel its exact handle without affecting sibling animation.
- Runtime arrival after a static interaction starts from the already visible state. Arrival/rejection after destruction or remount cannot create new work. Failure retains working immediate inspection.
- A breakpoint change closes/reopens the native dialog with the appropriate modality, preserves selection and focus policy, then settles. A queued old native `close` event cannot dismiss the reopened panel.
- Focus is not manually moved while the document is hidden. Visibility restoration does not perform a deferred focus jump. Initial or already closed environment changes do not focus the fallback or old opener.
- Removing an opener button leaves dismissal and fallback focus functional and clears its surviving row marker. A control moved outside the root cannot activate the former inspector and retains its new host's attributes and enabled state on teardown.
- Source/profile links and full inline record details remain available without JavaScript. Initially disabled Inspect controls do not advertise a working action before enhancement.

The public API and license audit is in [UPSTREAM.md](UPSTREAM.md). The measurable acceptance gates and evidence distinctions are in [ACCEPTANCE.md](ACCEPTANCE.md) and [EVIDENCE.md](EVIDENCE.md).
