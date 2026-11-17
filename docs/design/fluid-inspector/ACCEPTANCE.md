# Inspector continuity acceptance matrix

Each result must identify its tested revision, browser/version, viewport, theme and motion preference. Deterministic DOM/media/rAF doubles establish controller behavior; they do not establish native focus trapping, rendered layout or actual browser visibility. Current results belong to [EVIDENCE.md](EVIDENCE.md).

| ID | Scenario | Required observation |
| --- | --- | --- |
| I01 | Entity continuity | Selected marker, canonical ID, title, detail content and source/profile destinations agree immediately; URL, filters and graph root remain unchanged. |
| I02 | Desktop keyboard | Enter and Space activate native Inspect. Nonmodal inspection retains opener focus and permits another selection. Tab reaches detail actions. Dismissal returns to the latest usable opener. |
| I03 | Rapid A to B to C | Latest identity commits synchronously. The opening spring keeps its current trajectory; no stale content, completion or later focus jump appears. Programmatic burst evidence is labelled separately from native input. |
| I04 | Close then reopen | Reopening preserves current spring position and velocity; a stale close cannot hide the newly selected panel. |
| I05 | Same selection | Repeated selection does not replay motion, replace current content or repeat announcements. Explicit heading-focus requests remain available. |
| I06 | Narrow modal proposal | At 390px and 320px the native dialog is named, focuses its heading, contains Tab/Shift+Tab, blocks background interaction and dismisses with Escape. Close and source/profile actions remain reachable. |
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

## Evidence and integration boundary

Browser media emulation verifies live browser handling of a real `MediaQueryList` change; it does not prove a physical OS settings journey. Chrome viewport emulation does not prove physical touch-device or WebKit behavior. Forced CSS capability failure does not establish behavior in an actual browser lacking `linear()`.

Passing the matrix qualifies the isolated specimen for owner review. Integration also requires agreed filter/inspector selection and invalidation contracts, Hardware/route-owner agreement on the narrow modal proposal, and review by the reserved compatibility/token-adapter owner. It does not authorize replacing the deployed vanilla app, migrating to React, importing a Fluid theme or changing the shared skill/library.
