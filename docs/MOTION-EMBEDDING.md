# Signal motion embedding contract

This boundary extends the reviewed PR 140 artwork pilot. It supports a plain DOM host without introducing a framework, renderer or Hardware adapter. It does not animate the host or operational research views.

## Styles and theme ownership

| Resource | Owner and use |
| --- | --- |
| `web/design-tokens.css` and self-hosted Geist | Existing Atlas host theme. Load once through the host's established theme path; the pilot does not import, rewrite or inject it. This stylesheet includes document-level tokens and colour-scheme, so adopting it in an unrelated host is a separate theme decision. |
| `signal-motion-pilot/motion.css` | Reusable component styles. Every selector is rooted at `[data-motion-pilot]`, including box sizing, element defaults, focus, selection and reduced-motion rules. |
| `signal-motion-pilot/page.css` | Standalone document chrome: body margin, scroll padding/gutter, masthead, skip link and footer. Rules require `html[data-motion-page]`. Embedded hosts omit this file and document attribute. |
| `signal-motion-pilot/entry.js` | Standalone page lifecycle. Embedded hosts import `motion.js` directly and own mounting and teardown. |

The root establishes the canonical font/colour baseline and an inline-size container named `signal-motion`. Descendant layout and fluid type use that container's width. A narrow host column therefore receives the single-column composition even on a wide desktop viewport. Host layout owns the root's outer width, spacing and placement; the component does not change document scrolling or viewport metrics.

This is ordinary scoped CSS, not Shadow DOM. It prevents the pilot stylesheet from selecting host elements outside its root. Deliberate host overrides and inherited custom properties remain part of the normal cascade. Do not nest one pilot root inside another.

## Authored markup and identity

Use the existing study's `[data-motion-pilot]` content as the component source. The standalone masthead, skip link and footer are outside it. Choose a root element suitable for the host's document structure; an embedded section need not introduce a second `main` landmark.

| Hook | Required element |
| --- | --- |
| `[data-motion-pilot]` | One component root supplied to `mountMotionPilot` |
| `[data-motion-stage]` | The reserved decorative artwork stage, with its illustrative content hidden from the accessibility tree |
| `[data-motion-layer]` | The three decorative plates belonging to this root |
| `[data-motion-replay]` | Native replay button, initially disabled |
| `[data-motion-still]` | Native checkbox inside its implicit label, initially disabled |
| `[data-motion-status]` | Readable status element with `role="status"` |

Controller lookup uses these local hooks rather than fixed document IDs. Each rendered instance must nevertheless have **unique authored IDs** for its headings, status and any local navigation targets. Its `aria-labelledby`, `aria-describedby` and fragment links must reference those same instance-specific IDs. Keep these associations valid before JavaScript executes. The implicit checkbox label needs no document-wide `for` lookup.

The browser fixture derives two instances from the actual study markup, assigns distinct ID prefixes and rewrites local references before serving the page. That is test-fixture construction, not a shipped runtime renderer. The controller never changes IDs or rewrites content during mount.

Resolve image, module, stylesheet and research-link URLs against the host deployment's base path when authoring the fragment. Relative paths in the standalone page assume its existing directory. The runtime loader's own vendor URLs remain relative to its module URL.

## Mounting and disposal

`mountMotionPilot(root, {loadRuntime})` returns an idempotent destroy function. `loadRuntime` is optional; when supplied it resolves `{gsap, ScrollTrigger}` for that document. Hosts already using GSAP should inject their reviewed runtime. The default loader retains its existing version guards and per-document cache; it does not replace a different host runtime.

- Mount only a connected root with its complete authored markup. Multiple sibling roots can coexist and share a runtime.
- Mounting the same root again disposes its previous owner. A late completion from the old loader cannot create a context or disable the replacement's controls.
- Call the returned destroy function before removing or replacing the root. Destroy reverts that root's timeline/trigger and inline styles, disconnects its intersection/resize observers, removes its listeners, disables its controls and supplies a truthful static status. Calling an old destroy function again does not dispose a replacement.
- Destroying one root does not revert sibling roots or host animations. The implementation does not call global animation cleanup or alter ticker configuration. A cached shared GSAP library remains loaded.
- Device reduced motion takes precedence over the per-instance still control. Initial reduced mode and a checked still control gate the loader itself. Manual still state remains local to its checkbox and survives remount.
- A failed runtime leaves complete readable content and disabled replay in that instance. The host can remount to retry; no automatic retry loop is introduced.

With ResizeObserver, compact animation timing follows the root's content-box width: at 640px or below it uses the 320 ms sequence with 6px travel and no rotation/scale. Crossing that boundary reverts and rebuilds only the affected root's media context, without forcing a replay of an already played sequence. Padding and borders are excluded from the initial width measurement. When ResizeObserver is unavailable, the existing viewport media-query timing remains the fallback. CSS container layout does not depend on JavaScript.

## Regression evidence and limits

Run from the repository root:

```sh
node --test tests/signal-motion.test.js
npm test
npm run build
CHROME_BIN=google-chrome node scripts/test-signal-motion-browser.mjs
```

The focused tests exercise independent roots, replacement during deferred loading, repeated reduced-motion mounts, local manual/failure states, content-width changes and observer/listener ownership. The browser suite retains the standalone acceptance checks and adds a host fixture with colliding class/element names, native host controls and two independently identified pilots. It checks host style/focus/selection invariance, independent teardown/remount, a narrow container on a wide viewport and readable reduced/no-JavaScript/failed-runtime states. The fixture is served only by the test script and is not a new public route.

The existing motion workflow records its tested revision, individual checks, measurements and screenshots. Exact results belong to the embedding PR's CI receipts and the Design System Space; the older PR 140 measurements in [MOTION-REVIEW.md](MOTION-REVIEW.md) remain explicitly historical. Full-page review captures stay outside playback layout-measurement windows. Chrome viewport/touch emulation does not establish physical-device or WebKit behaviour. No deployment is implied by a passing PR check.
