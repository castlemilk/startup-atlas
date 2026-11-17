# Signal motion review and artwork pilot

## Scope and status

This change implements a standalone [Signal motion study](../web/assets/design-lab/signal-motion-pilot/index.html) with three existing feature artworks, a finite GSAP timeline, a native replay button and a still-artwork control. It is a bounded design-microsite pilot. It does not promote animation into research results, financial values or graph evidence. The public route after a future merge and successful Pages deployment will be `assets/design-lab/signal-motion-pilot/index.html`; a pushed PR is not a deployment.

The reviewed starting point is [main d9a63d86](https://github.com/castlemilk/startup-atlas/tree/d9a63d86c285c139a413b6b1fe9e79d3f6d72460), inspected on 17 November 2026. This remains a static ES-module app with `@ui-sdk/web`. The baseline [Pages run](https://github.com/castlemilk/startup-atlas/actions/runs/44009003133) completed successfully. The new pilot has its own browser acceptance workflow and no deployment job.

## Ownership and integration boundary

| Work at inspection | State | Boundary retained |
| --- | --- | --- |
| [PR 136](https://github.com/castlemilk/startup-atlas/pull/136), component field guide | Open draft at `a786636a` | No changes to `design-aesthetic.html`, its CSS/browser checks or `SIGNAL-COMPONENTS.md` |
| [PR 138](https://github.com/castlemilk/startup-atlas/pull/138), view usage | Merged as `69ece75d` | The [usage guide](VIEW-USAGE.md) governs the research destinations and their caveats |
| [PR 139](https://github.com/castlemilk/startup-atlas/pull/139), identity studies | Merged as `d9a63d86` | `signal-explorations/`, its generator and provenance remain separate |
| [PR 135](https://github.com/castlemilk/startup-atlas/pull/135), disabled analytics | Open draft at `1752c7ed` | No shared build, index, stylesheet or analytics edits |
| [PR 107](https://github.com/castlemilk/startup-atlas/pull/107), legacy company cards | Open, reported unmergeable | No treemap or company-card edits |
| Separate Hardware/Next.js work | Owner and checkout not identifiable in the available PR, branch or Space records | No framework, package/lockfile, shared layout, token or SDK changes |

The branch inventory and requested PR discussions did not establish the separate Hardware owner's integration surface. This is a limit of the available coordination record, not a claim that the owner is inactive. The chosen filesystem boundary is independent: the existing [static build](../scripts/build.mjs) already copies `web/assets/design-lab/` recursively. The pilot lives in a new sibling directory, so its publishing path requires no change to that shared build.

The controller exports `mountMotionPilot(root, {loadRuntime})` and returns an idempotent destroy function. A future host can inject a reviewed `{gsap, ScrollTrigger}` runtime and call destroy during unmount. That host adapter is proposed; no React or Hardware integration is included here. The standalone entry handles `pagehide` cleanup and persisted `pageshow` remounting.

## Review reference and preflight design plan

The requested `/Users/benebsworth/.agents/skills/gpt-taste/SKILL.md` was not accessible in this workspace. The user's supplied summary is the review reference; this is not a claim to have reread the full skill.

An actual Python run performed a **deterministic simulated layout selection**, using `random.Random(20261117).choice(...)` over these candidates:

1. Editorial split with one layered stage.
2. Wide stage with three equal caption columns.
3. Asymmetric headline with stacked artwork.

It selected **editorial split with one layered stage**. This simulation generated a starting composition, not evidence of design quality. The subsequent layout decisions are deliberate:

- A wide Geist headline spans two lines at the desktop target, with a fluid size and a single-column mobile layout. Its copy is never split or hidden by JavaScript.
- One contained artwork stage carries three decorative plates. The remaining content uses a divided definition list and a gapless three-column research row, rather than additional raised card collections.
- The editorial sequence introduces the idea, explains its restraint, shows the research destinations and offers direct navigation. Generous spacing belongs to this study, not operational tables.
- The stage reserves its aspect ratio and each image declares dimensions before loading. Text and controls sit outside animated layers.
- Porcelain, graphite, cobalt, radii, control feedback and self-hosted Geist all come from `web/design-tokens.css`. No parallel palette or new font is introduced.
- Existing Signal Index, Partition and Junction artwork is reused with [hash provenance](../web/assets/design-lab/signal-motion-pilot/artwork-provenance.json). Generic stock art would weaken the established research metaphors, so the summary's stock-asset recommendation is not applied.
- Body text uses the canonical ink/muted roles. The graphite header has a white focus ring; normal controls have the canonical cobalt ring. Hover adds affordance without revealing otherwise unavailable content.

## Existing motion findings

| Surface | Observed implementation | Decision |
| --- | --- | --- |
| [Signal tokens](../web/design-tokens.css) and [controls](../web/signal-controls.css) | 140/240 ms control timing, visible focus and reduced-motion CSS overrides | Retain CSS; GSAP adds no clear value to simple hover/press feedback |
| [Direction handbook](../web/design-direction.js) | Finite WAAPI detail fade, previous-animation cancellation, live device preference handling | Retain the current behaviour and immediately readable detail |
| [Globe](../web/globe.js) | Finite navigation flight, automatic-rotation visibility gates and reduced-motion handling | Preserve its single existing animation owner |
| [Graph](../web/graph.js) | Reduced motion is checked when relaxation starts, but not within already queued frames | Separate follow-up: interrupt relaxation on live preference changes |
| [Treemap](../web/treemap.js) | Narrow-screen evidence navigation switches from smooth to instant under reduced motion | Keep values, area encoding and evidence immediate |
| [Microsite loading specimens](../web/design-system.css) | CSS loading loops have reduced-motion overrides, but no explicit offscreen stop | Performance observation, not a measured defect; add no ambient loops to this pilot |

A deterministic Node probe of the actual graph `reheat()`/`stopSimulation()` helper bodies started relaxation, changed the preference after one frame and observed another tick plus a queued frame. That establishes the helper's live-preference gap, not a browser performance benchmark. The graph is outside this pilot's ownership scope.

The globe and handbook lack exported teardown functions. This is a repeated-mount risk for a future client-router migration; ordinary full-document navigation does not by itself establish a leak.

## Implemented motion contract

GSAP is justified here by coordinated timing across three decorative layers and a single reversible lifecycle. [ScrollTrigger](https://gsap.com/docs/v3/Plugins/ScrollTrigger/) initiates the composition on entry; the document retains ordinary scrolling. There is no pin, snap, scrub, smooth-scroll replacement, text reveal or continuous loop. Those richer editorial techniques remain proposals for a separately justified story.

| Behaviour | Implementation |
| --- | --- |
| Static baseline | All headings, explanatory text, links and the complete art composition are in authored HTML/CSS; no opacity-zero entry state |
| Normal desktop | Three transform/opacity tweens, staggered into a finite 720 ms sequence using the 240 ms canonical duration as the base |
| Narrow layout | At 640px or below, travel is 6px, rotation/scale are removed and total duration is 320 ms |
| Playback | One automatic entry sequence per controller; replay is a native button usable with pointer, touch, Space or Enter |
| Still mode | A native checkbox reverts the local media context, restoring authored styles; no global motion setting is changed |
| Device preference | Initial reduce mode requests no GSAP vendor files; a live change reverts local timelines and triggers; manual controls cannot override the device preference |
| Offscreen/background | IntersectionObserver and visibilitychange settle the finite sequence; re-entry does not force another playback |
| Navigation | Destroy removes local listeners/observer and reverts the scoped media context; late load completion cannot mount a disposed controller |
| Failed runtime | Complete static content remains, replay stays disabled and a short status explains that motion is unavailable |
| Host ownership | No global pause, ticker configuration or `killAll`; no animation of operational content |

[GSAP matchMedia](https://gsap.com/docs/v3/GSAP/gsap.matchMedia()/) owns both the timeline and ScrollTrigger. The replay handler restarts that pre-created timeline rather than creating untracked tweens after setup. `once: true` is not treated as cleanup; the explicit media-context reversion remains necessary.

The local runtime loader is restricted to the standalone route and pins GSAP/ScrollTrigger 3.15.1. Its two upstream distributions remain byte-identical, with copyright/license headers intact. [The vendor manifest](../web/assets/design-lab/signal-motion-pilot/vendor/manifest.json) records source, npm archive integrity and individual SHA-256 checksums. No root package dependencies or lockfiles change.

## Performance and verification

The added vendor payload is **118,040 bytes uncompressed**. Local deterministic gzip output totals **46,439 bytes**; that is a size estimate, not an observed server transfer. The three reused WebP images total **151,502 bytes**. The operational views load none of this pilot's JavaScript. No permanent `will-change` declaration or changing box shadow is used.

An executed sRGB contrast calculation against the canonical tokens gives 17.82:1 for ink on canvas, 5.31:1 for muted text on canvas, 4.93:1 for muted text on the soft surface, 5.09:1 for white on the cobalt action face, and 18.58:1 for white on graphite. These checks cover the authored colour pairs; they do not certify every rendered state or full accessibility conformance.

Run the focused checks and existing build from the repository root:

```sh
node --test tests/signal-motion.test.js
npm test
npm run build
CHROME_BIN=google-chrome node scripts/test-signal-motion-browser.mjs
```

Local Chromium launch is blocked by `process_singleton_posix.cc: socket() failed: Operation not permitted`. Browser checks therefore run through the isolated [Signal motion CI workflow](../.github/workflows/signal-motion.yml) on the existing public Linux runner. The workflow has only `contents: read`, is path-filtered, and retains screenshots and a JSON report for seven days. It does not deploy.

Browser acceptance and visual-review results will be recorded here after the actual run. The check set covers initial/live reduced motion, no-JS and failed runtime, keyboard/touch replay, source-content parity, 320/390px bounds, local cleanup, actual history navigation and measured settled layout shifts. A synthetic persisted-pageshow test is a lifecycle test; it is not proof that Chrome used its back/forward cache. No smoothness or hardware frame-rate claim is made without a trace.

## Follow-up proposals

- Coordinate a React/Hardware adapter only after that owner and its runtime/dependency surface are identifiable.
- Repair graph relaxation's live reduced-motion interruption in a separately owned change with a focused regression test.
- Consider a richer scroll-linked editorial chapter only if its story benefits from spatial sequencing. Keep source-backed data, financial comparisons and relationship meaning independent of animation.
