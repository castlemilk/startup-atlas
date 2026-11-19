# Inspector specimen evidence

This receipt distinguishes the isolated source from the operational Atlas application. The specimen is not merged or integrated with Hardware, filters or the reserved adapter.

## Current source-only hold

**18 November 2026: native browser acceptance is BLOCKED.** The existing Chrome permission request remains unresolved. No browser permission, browser invocation, CI browser substitute or alternate native route is used by this continuation. Current source/DOM/unit results, guarded harness hash and exact missing native evidence are recorded in [SOURCE-ONLY.md](SOURCE-ONLY.md) and [ACCEPTANCE.md](ACCEPTANCE.md).

**Source push is also BLOCKED.** Read-only [publication evidence](evidence/source-only-20261118/publication-constraint.json) shows a successful Vercel status and Vercel App check on the historical inspector head, separate from its skipped Pages deployment. The earlier workflow-only assessment did not establish a deployment-free push. No new remote Git object/ref is written; the reviewed continuation is retained as a local checkpoint, incremental patch and exact Git bundle. No deployment setting, permission or credential is changed.

Everything below records the historical checkpoint `ce3956359ccd2f60f7bbe85bf162ee483e326fe1` and its earlier implementation. Original reports, PNGs, accessibility trees and manifests are preserved byte-for-byte. Their recorded pass is a historical fact, not current authorization or native acceptance. The existing PR head is frozen; the local `specimen/fluid-inspector-source-only` continuation is not published to GitHub.

## Historical source and review

| Item | Exact receipt |
| --- | --- |
| Draft | [PR 160](https://github.com/castlemilk/startup-atlas/pull/160), `specimen/fluid-inspector-continuity` |
| Initial inspected main / fixture | `a8da234e976142647277d799d84bae792d47bf98` |
| Refreshed implementation base | `01375e4c62fd0b057cd7d21a34223b26a9e23360` |
| Reviewed interaction and harness revision | `2fd01ace3bfb053e7ff04bf683e533770296156d` |
| Browser-tested PR merge checkout | `41781fce7f872d55a55c5c3d5c43f801442c446f` |
| Concurrent main used by that checkout | `fed3b7417f60ad58a1545a96e50e76ee66df6d07` |
| Controller SHA-256 | `a1c12c44f2d677094031c192e0824139150d8474c45bda9132fca686222aaf8b` |
| Browser harness SHA-256 | `8ab91a8cb613767360a2bdb72ec8dba4ab08ca4a375e2944c300a6bfb5d6d0de` |
| Focused test SHA-256 | `0a66cf5ae2e901d29b50273fef4dd9d1d861beeba633b75d9576e9843fb96998` |

Independent source review prompted corrections for desktop focus retention, stale opener reuse, consumed Escape, authored easing value/priority restoration, hidden/closed-state focus, actual `focus: 'preserve'` behavior, detached control ownership and ordinary modal Tab boundaries. The final source and strengthened browser harness were independently reviewed before publication. These are agent peer reviews, not a claim of a human GitHub approval or owner permission to integrate.

At that checkpoint the focused deterministic suite passed **33/33**. It used actual vendored Fluid 0.1.2 with explicitly labelled jsdom dialog, geometry, media and frame doubles. It proves controller decisions, not native browser rendering. Earlier full local validation passed 144 JavaScript and 139 Python tests plus image audit; this predates the final focus and detached-control corrections. The local static/SQLite build passed. The historical CI receipts below superseded that earlier local source coverage for the preserved checkpoint only.

## Historical browser-driven corrections

The failed runs are retained as diagnostic history; none is relabelled as a successful run.

| Run / PR head | Observation | Correction |
| --- | --- | --- |
| [44084929653](https://github.com/castlemilk/startup-atlas/actions/runs/44084929653) / `295dbe32b3914a0338aee118ccdba0255e83e484` | Removing only an opener button made a later row lookup null; dismissal threw before transition. | Capture authored button/row associations, update only still-owned nodes, preserve externally reparented controls, and add two regressions. Original native removal/click check retained. |
| [44085673754](https://github.com/castlemilk/startup-atlas/actions/runs/44085673754) / `ef88255e2ee04d58ba4b799092bad8e1ff0feb60` | Resize check sampled the old open/modal state before the browser delivered its media-query change; later failure capture already showed correct nonmodal state. | Bound synchronization to actual dimensions, media query, controller phase/mode and native modality; record real preference/visibility event delivery. |
| [44086238436](https://github.com/castlemilk/startup-atlas/actions/runs/44086238436) / `60e6a67fb01911463840fd61a7ffb30d98a1d987` | Mobile Tab reached `BODY` while the native modal remained open; document focus was not recorded, so browser UI versus a focused viewport was unresolved. | Add per-key `document.hasFocus()` and target traces, background focus rejection and native reentry checks. Do not infer the external focus destination. |
| [44087095923](https://github.com/castlemilk/startup-atlas/actions/runs/44087095923) / `2afbff6d7e1afa1534e071d9d837b66de3a608d1` | Close → source → profile → `BODY`, with `document.hasFocus() === true`; this failed the measured keyboard requirement. | Add a scoped modal Tab boundary guard, covering the closing interval and preserving consumed/modified/hidden input. Add three source regressions and require direct forward/reverse wrapping in the browser harness. |

Native modal background inertness does not by itself prohibit browser-control focus. The distinction is sourced in [ACCEPTANCE.md](ACCEPTANCE.md). The fourth run established a focused document viewport, so the final specimen strengthens ordinary Tab behavior rather than accepting that failure.

## Historical browser execution limits observed locally

The connected Browser tool timed out during initialization. The cloud browser opened the sibling chat URL but reached signed-out ChatGPT, so the private filter conversation was not read or messaged. No login, credential or permission change was attempted. Coordination was posted through the existing canonical Space connection.

The local command `chromium --headless=new --disable-gpu --dump-dom about:blank`, retaining the browser sandbox, exited 134 with `socket() failed: Operation not permitted (1)` in `process_singleton_posix.cc`. The cloud browser's attempt to open the local source preview returned `net::ERR_CONNECTION_REFUSED`. These are environment access limits, not application failures. No sandbox flag, network policy or security setting was altered.

At the historical checkpoint, the additive test entry used the existing repository PR workflow for isolated sandboxed Chrome execution and its existing `graph-review` artifact destination. The source-only continuation removes that automatic browser bridge and explicitly reports BLOCKED. No shared workflow, permission, dependency or release setting is changed.

## Historical acceptance result

**[CI 44087874141](https://github.com/castlemilk/startup-atlas/actions/runs/44087874141) completed successfully for the historical checkpoint.** Its inspector report records **18 executed browser scenario checks passed**, zero console errors and zero uncaught exceptions. The report's `sourceRevision` and `checkoutRevision` both identify the synthetic PR merge checkout above, not the branch head. Recorded file hashes match that reviewed implementation. The preservation commit `ce3956359ccd2f60f7bbe85bf162ee483e326fe1` did not change its controller, styles, fixtures, harness or source tests. The current continuation guards the harness and adds source tests; it makes no new native pass claim.

Full repository CI also passed 241 root JavaScript tests, 219 Python tests, 24 local MCP tests, 150 hosted/OAuth tests, Go service checks, the static/SQLite build and the existing graph, treemap, Atlas-view, profile/UI SDK, design-microsite and Signal-asset browser checks. No production deployment was requested by this lane.

### Preserved browser packet

The [machine-readable report](evidence/run-44087874141/inspector-browser-report.json), [SHA-256 manifest](evidence/run-44087874141/manifest.json), seven original PNGs and seven native accessibility-tree snapshots are preserved in this repository. Files are copied byte-for-byte from the successful workflow's `fluid-inspector/` artifact directory. The full shared workflow ZIP is not vendored.

| Provenance | Receipt |
| --- | --- |
| Browser | Chrome `157.0.8103.50`, Linux headless, sandbox enabled |
| Capture interval | `2026-11-17T12:56:58.637Z`–`2026-11-17T12:57:19.577Z` (17 November, 23:56–23:57 AEDT) |
| Original artifact | [`graph-review`, ID `14329603653`](https://github.com/castlemilk/startup-atlas/actions/runs/44087874141/artifacts/14329603653) |
| Original ZIP size | 29,299,068 bytes |
| Original artifact SHA-256 | `d11790d384aedd75d669b318e27922b485299b0ab20e44313e902451246bf1b1` |
| Original artifact expiry | `2026-11-24T12:59:07Z`; the checked-in inspector packet survives this expiry |
| Upstream verification | 14 unmodified vendored files verified against the pinned Fluid 0.1.2 package manifest |

### Responsive evidence and independent review

The independent acceptance reviewer inspected all six selected-focus captures, their six native accessibility trees, the no-JavaScript capture and the complete report. Source review, visual review and the separate package/coverage audit found no blocker to publishing the **isolated specimen packet for owner review**. These reviews do not approve runtime integration or certify every acceptance subcase.

| Viewport | Light PNG / accessibility tree | Dark PNG / accessibility tree | Observed result |
| --- | --- | --- | --- |
| 1440 × 1000 | [PNG](evidence/run-44087874141/1440-light-selected-focus.png) · [AX](evidence/run-44087874141/1440-light-selected-focus.ax.json) | [PNG](evidence/run-44087874141/1440-dark-selected-focus.png) · [AX](evidence/run-44087874141/1440-dark-selected-focus.ax.json) | Matching selected row and named details; opener focus visibly retained; nonmodal semantics; readable actions. |
| 390 × 844 | [PNG](evidence/run-44087874141/390-light-selected-focus.png) · [AX](evidence/run-44087874141/390-light-selected-focus.ax.json) | [PNG](evidence/run-44087874141/390-dark-selected-focus.png) · [AX](evidence/run-44087874141/390-dark-selected-focus.ax.json) | Named modal, focused heading, background controls excluded, complete fixed record and actions visible. |
| 320 × 740 | [PNG](evidence/run-44087874141/320-light-selected-focus.png) · [AX](evidence/run-44087874141/320-light-selected-focus.ax.json) | [PNG](evidence/run-44087874141/320-dark-selected-focus.png) · [AX](evidence/run-44087874141/320-dark-selected-focus.ax.json) | Clean wrapping, 8px panel margins, visible Close/source/profile, no horizontal overflow or clipped focus indicator. |

The [no-JavaScript PNG](evidence/run-44087874141/no-javascript-desktop.png) and [AX tree](evidence/run-44087874141/no-javascript-desktop.ax.json) show the disabled enhancement controls and truthful inline fallback; the browser report verifies three inline records and six source/profile links. The screenshot is a viewport capture, not a claim that all three records fit on one screen.

All four narrow viewport/theme traces record **Close → source → profile → Close → source → profile → Close → profile** (the last transition is Shift+Tab). Every step retains document focus, focus inside the panel and native modality. Programmatic background `.focus()` is rejected, and Escape returns to the selected Fusion Books opener. The measured Close control is 61.47 × 44 CSS pixels.

The actual hidden → visible tab transition cancels owned work and retains a paint count of 4 → 4 on return. Live browser reduced-motion changes interrupt opening and closing, settle the latest intent and restore full motion without replay. Close/reopen records exact spring position and velocity continuity at both interruption boundaries. The final 600ms idle sample records zero ongoing inspector frames/animations and no additional paints.

| Measured pair | Light contrast | Dark contrast |
| --- | --- | --- |
| Title / surface | 18.58:1 | 16.25:1 |
| Muted text / surface | 5.53:1 | 8.60:1 |
| Focus indicator / surface | 5.09:1 | 10.38:1 |
| Selected boundary / selected surface | 4.55:1 | 6.23:1 |

These are the report's measured pairs, not a complete colour audit or accessibility certification. Link contrast was not separately measured.

### Coverage that was partial at the historical checkpoint

The 18 executed checks aggregate multiple matrix IDs and repeat six viewport/theme captures; they do **not** mean that every subcase of all 18 matrix rows was executed in a browser.

The items below describe the preserved checkpoint. New deterministic I07/I18 coverage is recorded separately in [SOURCE-ONLY.md](SOURCE-ONLY.md); all current native gates remain BLOCKED.

- **I07:** native browser checks cover a removed opener and host invalidation. Disabled-opener fallback is covered by the deterministic suite. Hidden/inert opener fallback is source-inspected but has no explicit executed regression.
- **I11:** the real tab-switch trace hides during opening. Hidden-during-close behavior is deterministic source-test coverage.
- **I18:** individual modes check identity/profile/source destinations. No assertion compares the complete summary/evidence payload for the same entity across all four modes, and the missing-summary case has no explicit assertion.
- Live preference, visibility and teardown traces run on desktop. Narrow keyboard/layout evidence covers both mobile widths and both themes; the full viewport × theme × lifecycle cross-product is not exercised.
- Static captures use the three authored fixtures. Zoom, unusually long dynamic content, physical touch gestures and software-keyboard behavior remain untested.

## Remaining scope limits

- Physical devices, a physical OS preference-settings journey, WebKit/Firefox and screen-reader speech are outside the recorded Chrome evidence. Viewport/touch and media emulation are labelled as such.
- Forced CSS `linear()` capability failure exercises the fallback branch; it is not proof in an actual old browser without `linear()`.
- The dark comparison uses existing Signal workbench tokens; the operational app does not gain dark-mode support.
- The narrow modal is a specimen proposal. The existing deployed vanilla app stacks narrow inspectors; Hardware/Next.js is a separately owned source/integration path.
- Filter and compatibility owners accepted this lane's isolated paths and host seam. Filter membership does not implicitly close or retarget the inspector. Hardware/route-owner acknowledgment and a separately reviewed shared integration contract remain required. The positional WAAPI adapter is not a drop-in replacement for this spring velocity contract.
