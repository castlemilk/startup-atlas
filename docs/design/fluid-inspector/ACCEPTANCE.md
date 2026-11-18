# Inspector continuity acceptance matrix

**Current native status: BLOCKED, 18 November 2026.** The unresolved Chrome permission request remains untouched. This continuation executes source/DOM/unit checks only. No row below receives current native acceptance from source tests, historical captures or an alternative browser/CI route.

Each result must identify its tested revision and execution environment. Native results additionally require browser/version, viewport, theme and motion preference. Deterministic DOM/media/rAF doubles establish controller behavior; they do not establish native focus trapping, rendered layout or actual browser visibility. Current source results belong to [SOURCE-ONLY.md](SOURCE-ONLY.md); [EVIDENCE.md](EVIDENCE.md) preserves the explicitly historical checkpoint.

## Required acceptance observations

| ID | Scenario | Required observation |
| --- | --- | --- |
| I01 | Entity continuity | Selected marker, canonical ID, title, detail content and source/profile destinations agree immediately; URL, filters and graph root remain unchanged. |
| I02 | Desktop keyboard | Enter and Space activate native Inspect. Nonmodal inspection retains opener focus and permits another selection. Tab reaches detail actions. Dismissal returns to the latest usable opener. |
| I03 | Rapid A to B to C | Latest identity commits synchronously. The opening spring keeps its current trajectory; no stale content, completion or later focus jump appears. Programmatic burst evidence is labelled separately from native input. |
| I04 | Close then reopen | Reopening preserves current spring position and velocity; a stale close cannot hide the newly selected panel. |
| I05 | Same selection | Repeated selection does not replay motion, replace current content or repeat announcements. Explicit heading-focus requests remain available. |
| I06 | Narrow modal proposal | At 390px and 320px the native dialog is named, focuses its heading, wraps ordinary Tab/Shift+Tab among its rendered actions, excludes background page controls from programmatic focus, and dismisses with Escape. Close and source/profile actions remain reachable. Consumed keys and browser modifier shortcuts remain owned by their existing handlers. |
| I07 | Return-target loss | Removed, disabled, hidden or inert opener falls back to a visible authored heading. New ID without an opener never returns to the previous record. Host invalidation or a later external focus move does not lose control. |
| I08 | Viewport crossing | Crossing 700px during opening, open or closing preserves latest identity/intent, correct native modality and usable focus. It leaves no stale top-layer dialog or inert background. |
| I09 | Initial reduced motion | Selection and dismissal work immediately with no geometry travel or delayed content. |
| I10 | Live reduced motion | A real running-browser media-preference change mid-open and mid-close settles current intent, cancels owned motion and preserves focus. Changing back does not replay. A fixture listener invocation alone cannot pass this browser gate. |
| I11 | Hidden tab | An actual document visibility change mid-transition cancels work and settles latest intent. Returning does not replay or perform a deferred focus jump. Synthetic visibility and unavailable headless background behavior are reported separately. |
| I12 | Unmount and remount | Destroy cancels frames/listeners, blocks late loader results and restores authored style values/priorities. Remount has one owner; an old destroy handle cannot remove it. |
| I13 | Independent siblings | Unique IDs/local ARIA remain valid. Destroying one root preserves another root's state and work. Already-consumed Escape remains owned by its original control. |
| I14 | CSS linear fallback | Native support is measured. Forced-unsupported capability testing uses a valid finite cubic-bezier easing with identical semantics. JS spring geometry does not depend on CSS linear support. |
| I15 | Failure and no JavaScript | Failed motion keeps immediate inspection functional. Disabled-JavaScript mode retains inline facts and native profile/source links, with disabled Inspect controls and truthful fallback text. |
| I16 | Settled work | After settlement there are zero pending inspector frames and no ongoing inspector animation. A bounded idle sample shows no continuing paints. |
| I17 | Responsive visual review | Inspect six screenshots: 1440px, 390px and 320px, light/dark. No horizontal overflow, clipped title/source/close control or clipped focus indicator. Text contrast is measured separately from screenshot inspection. |
| I18 | Content parity | Full-motion, reduced, failed-runtime and CSS-fallback modes expose the same selected identity and evidence. Missing summary remains explicitly missing. |

## Current source coverage and missing native evidence

The 37 deterministic tests use actual vendored Fluid 0.1.2 with explicitly labelled jsdom dialog, geometry, media, visibility and frame doubles. Their execution receipt and exact hashes are in [SOURCE-ONLY.md](SOURCE-ONLY.md). **Every native requirement in this table remains BLOCKED.** A skipped native test is an unresolved gate, not a pass.

| ID | Source/DOM assertions | Exact native evidence still missing for this continuation |
| --- | --- | --- |
| I01 | Synchronous selected ID, title, complete authored detail DOM, expected summary/evidence/profile/source and selection attributes. | Rendered marker/details agreement, real destinations and host integration with filters, URL or graph state. |
| I02 | Application focus policy, latest-opener return, preserve/panel choices and synthetic Escape/click handling. | Trusted Enter/Space/Tab/Escape, native nonmodal focus/dismissal, focus-visible geometry and scroll behavior. |
| I03 | A/B/C burst with the actual spring and controlled frame queue; latest content, unchanged trajectory/generation and one queued frame. | Rapid native input delivery, actual rendering between events and absence of stale visual or focus completion. The historical browser burst was programmatic. |
| I04 | Exact spring value/velocity carry across close/reopen; escaped stale frame cannot finish a replacement. | Real frame/compositor continuity, native close-event ordering and top-layer behavior. |
| I05 | Repeated selection preserves trajectory; explicit heading focus remains available. | Native repeated activation, visible replay absence and assistive-technology announcement behavior. |
| I06 | Synthetic Tab edge handling, heading reverse Tab, closing interval, untouched interior/consumed/modified keys and listener removal. | Actual 390px/320px layout, native modality/inertness, Tab traversal, Escape and visible action/focus geometry. |
| I07 | Removed/disabled opener, direct/ancestor hidden and inert states before/during exit, no-opener fallback, host invalidation and external/reparented ownership. | Native restoration and fallback visibility for all return-target loss cases. DOM geometry is a labelled visibility stub. |
| I08 | Mocked breakpoint changes settle current intent and ignore an old queued close event; closed changes do not reclaim focus. | Actual resize/media-event delivery, modal/nonmodal transitions and top-layer/inertness cleanup. |
| I09 | Initial reduced-motion double produces immediate selection and dismissal without queued frames. | Browser preference detection, rendered absence of travel/delay and computed CSS transition suppression. |
| I10 | Synthetic MediaQueryList changes mid-open/mid-close settle latest intent, cancel frames and prevent replay. | Real live preference delivery, CSS transition cancellation, actual scheduling and native focus preservation. |
| I11 | Synthetic visibility changes cover opening/closing, frame cancellation, no hidden focus calls and no replay on return. | Actual background-tab visibility/throttling/order and focus on restoration, including hidden-during-close. |
| I12 | Owned frame/listener disposal, late loader success/failure, detached root, remount/stale destroy and authored style restoration. | Actual browser scheduling, native dialog removal/inertness restoration and real CSS value/priority cascade. |
| I13 | Two roots with unique IDs/local ARIA, independent selection/frame handles, sibling-preserving teardown and consumed Escape ownership. | Rendered accessibility associations, real host-animation survival and native sibling/top-layer interaction. |
| I14 | Injected capability result selects official linear easing or finite cubic fallback with unchanged facts. | Current native support/computed easing/rendering and an actual engine without linear support. |
| I15 | Failed/deferred motion retains readable facts, immediate interaction and focus decisions; source HTML is parsed without executing its scripts or resources. | Actual failed-runtime interaction and a genuinely JavaScript-disabled browser journey. Running a JavaScript DOM test cannot prove no-JavaScript acceptance. |
| I16 | The controlled queue drains and lifecycle assertions prevent further owned frame work. | Real frame/compositor/CSS animation activity and a bounded browser idle sample. |
| I17 | Authored markup/CSS remain inspectable; no geometry stub is treated as a visual measurement. | All current light/dark responsive captures, overflow/clipping, focus geometry and computed contrast. |
| I18 | Every authored record has complete detail-DOM and exact expected payload parity across four modes, immediately and after settlement; Melanie's missing summary after Canva is explicit. | Rendered four-mode parity and assistive-technology output for the same record, including the missing-summary state. |

## Evidence and integration boundary

Browser media emulation verifies live browser handling of a real `MediaQueryList` change; it does not prove a physical OS settings journey. Chrome viewport emulation does not prove physical touch-device or WebKit behavior. Forced CSS capability failure does not establish behavior in an actual browser lacking `linear()`.

Native modal containment applies to page content. [Chrome's native-dialog guidance](https://developer.chrome.com/docs/modern-web-guidance/guides/accessibility/accessibility#native-dialog) and [W3C's focus-order examples](https://www.w3.org/WAI/WCAG21/Understanding/focus-order#examples) permit the browser's own controls in the focus cycle. A `BODY` active element alone is inconclusive. The harness therefore records `document.hasFocus()` with every Tab state and rejects focused document content outside the dialog. A subsequent Chrome trace established `BODY` with `document.hasFocus() === true`, so the specimen adds a scoped ordinary-Tab boundary handler instead of relabelling that state as browser chrome. Native modality/inertness remain in force; the guard preserves consumed keys and browser modifier shortcuts. An unfocused document proves departure from the document, not the exact external control reached. The report retains per-key targets and a programmatic background-focus rejection check.

The current source packet is reviewable with native gates explicitly unresolved. Complete native acceptance, when separately authorized, also needs Hardware/route-owner agreement on the narrow modal proposal and concrete review of the shared compatibility/token-adapter contract. Host-owned filter membership does not implicitly close or retarget inspection. This matrix does not authorize replacing the deployed vanilla app, migrating to React, importing a Fluid theme or changing the shared skill/library.
