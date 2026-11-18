# Fluid Signal source and DOM checkpoint

## Current scope — 18 November 2026, Melbourne

Ben has resumed this existing compatibility/token/skill lane for source, DOM and unit work only. The unresolved browser permission hold blocks new native acceptance. Do not request or grant Chrome permissions, substitute another browser or remote native route, or change deployment/security settings. This continuation does not run the native entry.

[PR163](https://github.com/castlemilk/startup-atlas/pull/163) remains fixed at `208ef3762914765f3f828e1dd6dab3f4131d567b`. Its prior reports remain historical at their exact hashes; they do not establish acceptance of this continuation or a consuming application. Current source is based on refreshed main `fed3b7417f60ad58a1545a96e50e76ee66df6d07`, which includes MCP157/158 and the subsequent record/image contracts. The original checkout and all other owners' files remain intact.

The [canonical design Space](https://chatgpt.com/space/page_5167bcbbbb0c81919e1d565fd4d82e4a) and [adapter receipt](https://chatgpt.com/space/page_1ba70e20936881919ea2a0917e8646da) hold exact review-commit, tree and publication status. Local continuation branch: `feat/fluid-signal-source-only-20261118`.

## Preserved adapter contract

The runtime, declarations, token aliases, package/lock and generated distribution are byte-identical to PR163's reviewed source. Bundle SHA-256: `0012a5fdffa60cb8251d67e0eb54647ee3db2c55e009b21ff861bfd110e14468`; 10,503 bytes. Source SHA-256: `b3fb3e1fc2f84a16f94b4213a4234d8a6a065800cd46a679745088c71fed2245`.

`mountFluidSignal(root)` continues to expose `transition(layer, {from: {x, y}, role})`, `cancel(layer)`, `settle()`, `destroy()` and diagnostics. A host commits final state/layout first. Dedicated layers consume the canonical destination delta; finite native effects use Fluid's firm curve at current Signal 140/240ms tokens. Interruption preserves position, with no physical velocity promise. Unsupported `linear()` uses Signal easing; unusable capability/tokens stay static. Reduction, hidden state and pagehide settle owned effects without replay. One document policy subscription serves independent root owners. No ticker, focus, state, success, permission or URL/history ownership is added.

The controls and inspector owners have acknowledged the optional API and reserved paths. Their implementations remain separate. A real filter-marker conversion requires a single-owner layer agreement. The inspector retains its velocity-preserving spring until a separately reviewed continuity decision. Shared runtime, tokens, workflow, root dependencies, crawler/MCP, artwork and provenance remain outside this lane's edits.

## Source changes in this continuation

- Remove this adapter's automatic GitHub Actions native-test bridge from its owned test file. The source/DOM suite now runs without launching a browser in either local or CI environments.
- Retain the native harness behind a source gate that blocks before server/browser setup. There is no environment or command-line override. Releasing the gate requires separately authorized, reviewed source work; do not invoke it during this hold.
- Add deterministic regressions for an unknown media event settling multiple owners and recovering only on a later known event; zero CSS timing arriving before preference notification; and a captured stale media callback after destroy/remount.
- Update only the Atlas-specific skill companion, package guidance and adapter documentation. The upstream UI SDK skill and lock record are unchanged.

The regressions model lifecycle ordering with DOM/Animation doubles. They do not establish browser scheduling, rendering, keyboard defaults or current consumer acceptance.

## Package and compatibility evidence

Official npm metadata and tarball were rechecked at `2026-11-17T13:27:19.394598Z` (18 November, Melbourne). The existing exact pin is still `@usefluid/motion@0.1.2`, MIT, published `2026-11-14T13:44:47.940Z`, source `07ffba766bc7be5b4215384185a0e49363bb1d0e`. All 18 installed files match the official tarball; SHA-1 `2561bbf3397e7ba562f18b4d463770ed57e8d52d` and full SRI are recorded in `source-only-checkpoint.json`. No package, registry, install-script or release-age setting changed. Receiving hosts must retain their own age policy; a release timestamp is not permission to bypass it.

| Surface | Source evidence | Remaining condition |
| --- | --- | --- |
| Separately deployed static Atlas | HTML/ESM; UI SDK Web/Core 0.1.0-beta.6; unchanged self-contained bundle | Operational adoption and current native acceptance remain held |
| React/Next/Hardware | No implementation or actual owner found in 128 published branches/open PRs; the named Next wireframes are static | Obtain actual owner, source/versions/router, rendering/lifecycle and package policy before integration |
| Upstream React peer | Optional React >=18; zero Fluid runtime dependencies | A peer range does not prove actual Atlas React/Next compatibility |
| Server import | Source suite imports without browser globals or a frame loop | Actual hydration, Strict Mode, Suspense/router and SDK consumers require the identified host |
| Existing motion | GSAP and inspector controllers retain their owners; adapter runtime is unchanged | No overlapping layer, cleanup or scheduler assignment |

Full token mapping and React lifecycle recipe remain in [the integration guide](../../docs/design/fluid-signal-adapter.md).

## Executed checks

| Check | Source-only result |
| --- | --- |
| Focused adapter source/DOM/import/manifest suite | 30 passed; zero failed or skipped |
| Full root suite against refreshed main | 237 JavaScript and 219 Python passed; zero JavaScript skips |
| Local static/SQLite build | Passed; incidental generated catalogue outputs excluded |
| Isolated build parity | All five generated files match; runtime bundle unchanged |
| Native harness | Syntax checked only; not executed; no new native evidence |

Use the existing source commands, with normal hooks and pinned dependencies:

```sh
node --test tests/fluid-signal-adapter.test.js
npm --prefix integrations/fluid-signal run check
npm test
npm run build
```

The exact locked nested dependencies were copied from the previously verified local install to avoid esbuild's source-path changes through a symlink. No dependency was installed or policy bypassed. The main source/lockfiles are unchanged. Checkpoints and logs distinguish these local results from historical CI.

## Reviewable publication without deployment

All three current GitHub workflow definitions were inspected: Pages accepts pushes to main/PRs/schedule/manual dispatch, Signal accepts selected PR changes/manual dispatch, and research is manual. A non-main branch push would not match those push triggers, but the repository also has an active Vercel integration. Its current preview-disable settings could not be verified through allowed read access. Therefore a new branch/ref is not established deployment-free.

Publish the independently reviewed source as Git tree/commit objects without moving a remote branch ref, creating/synchronizing a PR or dispatching a workflow. Record that exact distinction in the Space; do not claim a branch push or fresh CI. The user can review the immutable source and compare it with main. Keep PR163's prior head and evidence intact.

## Explicit gates

New native acceptance remains blocked. Missing host evidence includes actual React/Next/Hardware owner agreement, concrete filter/inspector integration, keyboard/focus/history in real consumers, hydration/router/Strict Mode, responsive visual/contrast review, older engines, Safari/Firefox, physical devices, assistive technology and BFCache restoration. Neither the source tests nor historical reports clear these gates. Merge and production activation require reviewed coordinated approval.
