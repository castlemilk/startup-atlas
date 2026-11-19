# Inspector source-only continuation

**18 November 2026 — native browser acceptance BLOCKED.** The existing Chrome permission request is unresolved. This continuation uses source inspection and deterministic DOM/unit tests only. It does not request or grant permission, execute a browser or use CI as an alternative native acceptance route. There are no current screenshots or native accessibility-tree captures.

**Source push is BLOCKED as well.** The existing inspector checkpoint has a successful Vercel deployment status and Vercel App check, independent of the skipped GitHub Pages deploy. A deployment-free push has not been established. The reviewed continuation is delivered as a local checkpoint, incremental patches and exact Git bundle; no new remote Git object/ref or PR is written.

## Preserved checkpoint and refreshed main

| Item | Exact reference |
| --- | --- |
| Existing draft, kept frozen | [PR 160](https://github.com/castlemilk/startup-atlas/pull/160), `specimen/fluid-inspector-continuity` |
| Preserved checkpoint | `ce3956359ccd2f60f7bbe85bf162ee483e326fe1` |
| Refreshed main | `fed3b7417f60ad58a1545a96e50e76ee66df6d07` |
| Combined checkpoint/main tree before these edits | `dea440333c0e561366bd6808c6601c5082091d0e` |
| Local continuation branch, not pushed | `specimen/fluid-inspector-source-only` |
| Coordination and exact local checkpoint/artifact receipt | [Canonical Design System Space](https://chatgpt.com/space/page_5167bcbbbb0c81919e1d565fd4d82e4a), thread `7d2d193b-6d55-579d-9170-b7545d1ed874` |

The checkpoint's original report, seven PNGs, seven AX snapshots and manifest remain byte-for-byte unchanged. Their historical result is retained in [EVIDENCE.md](EVIDENCE.md). It does not supply current native acceptance. The 25 MCP contract files arriving from refreshed main are preserved without edits; they are not inspector-owned changes.

The local source-only branch continues the existing implementation and paths. It is not a second inspector or a competing integration. No controller, authored fixture, style, existing token, runtime route or dependency changed in this continuation.

## Source validation

The focused source suite passes **37/37**, preserving the original 33 tests and adding four meaningful regressions. The root entry executes those same 37 tests and an explicitly skipped/BLOCKED native marker: **38 reported tests, 37 passes, 0 failures, 1 skip**. The skip is an unresolved acceptance gate.

The [recorded TAP output](evidence/source-only-20261118/source-tests.tap) and [source/hash manifest](evidence/source-only-20261118/manifest.json) preserve this exact local command:

```sh
node --test --test-reporter=tap tests/fluid-inspector.test.js
```

It ran with `CI=true` and `RUNNER_TEMP` set to an unused task-local path, confirming that these variables no longer cause this entry to spawn the historical browser harness. No runner output directory was created. This was a local Node test invocation, not a GitHub Actions workflow. The runtime was Node `v24.22.1` and jsdom `26.1.0`; the captured command exited 0.

The separate focused command was also executed successfully:

```sh
node --test specimens/fluid-inspector/inspector.test.js
```

Syntax inspection of the guarded harness and root entry passed with `node --check`; neither command executes those files. Whitespace validation passed.

Independent source/acceptance review repeated the 37 passing DOM/unit cases and explicit blocked marker under the CI variables. A separate evidence reviewer checked the native guard, current-versus-historical claims and immutable packet. Both approved the local artifact handoff; neither review approves native execution, remote publication or runtime integration.

### Added regressions

| Addition | Executed source assertions |
| --- | --- |
| Hidden opener fallback | The opener or its ancestor becomes hidden before or during dismissal. Selection clears, close settles, no frame remains, the authored fallback receives application focus, and the unusable opener is never targeted. |
| Inert opener fallback | Equivalent direct/ancestor and before/during-exit cases for inert return targets. Together the two tests cover eight availability-loss combinations. |
| Complete payload parity | All three authored records across full motion, reduced motion, failed runtime and forced CSS fallback: complete detail DOM and exact title, ID, summary, evidence note/source URL and profile link agree immediately and after settlement. Animated cases also check the in-flight controlled frame. |
| Explicit missing summary | Selecting Melanie Perkins after Canva retains the exact missing-summary text, removes the previous summary and preserves identity/evidence/profile in all four modes. |

The authored HTML is read into jsdom with scripts and external resources disabled by its default configuration. Its expected facts are checked against the pinned fixture data, not treated as refreshed research. The suite continues to exercise rapid A/B/C, position/velocity interruption, same selection, dismissal/focus policy, live media doubles, hidden state, late loading, unmount/remount, stale callbacks and independent instances.

These tests use the actual vendored Fluid 0.1.2 spring. Dialog methods, geometry, media queries, document visibility and animation frames remain explicit doubles. In particular, DOM focus decisions are not native keyboard navigation or browser modality; a visibility event fixture is not a real hidden tab.

## Guarded browser entry and blocked publication

`tests/fluid-inspector.test.js` now imports the deterministic suite and reports an unconditional BLOCKED native test. The `spawn` import, executable browser callback and CI-dependent enablement were removed. There is no environment-variable opt-in.

`specimens/fluid-inspector/browser-check.mjs` retains the historical harness for inspection but throws unconditionally after its Node built-in imports, before repository/output initialization, `execFileSync`, server/browser setup or evidence output. The guard is outside its later try/finally. It was checked as source and syntax, not invoked. The unguarded historical version remains at the frozen checkpoint; it is not an authorized alternate route.

The three workflow definitions were inspected at refreshed main:

| Existing workflow | Automatic trigger relevant to this source handoff |
| --- | --- |
| `pages.yml` | Push to `main` or a PR targeting `main`; its PR jobs independently execute Chrome. |
| `signal-motion.yml` | A PR targeting `main` with its listed Signal paths. |
| `partner-research.yml` | No automatic trigger; manual dispatch only. |

Updating the existing PR branch would start shared browser jobs, so its head stays frozen. A non-main branch without a PR would not match these workflow triggers, but that alone does not establish a deployment-free push. Before any remote write, the filter owner identified Vercel automation outside the workflows. This lane independently read the frozen inspector head's [combined status](https://api.github.com/repos/castlemilk/startup-atlas/commits/ce3956359ccd2f60f7bbe85bf162ee483e326fe1/status) and [check runs](https://api.github.com/repos/castlemilk/startup-atlas/commits/ce3956359ccd2f60f7bbe85bf162ee483e326fe1/check-runs): `Vercel=success` points to a deployment, and `Vercel Preview Comments` is a successful Vercel App check while the Pages deploy is skipped. The exact relevant fields are preserved in [publication-constraint.json](evidence/source-only-20261118/publication-constraint.json).

The earlier branch-only publication proposal is superseded. No remote branch, Git object, ref update, PR or workflow dispatch is made for this continuation. No deployment setting, branch protection, required gate, permission, credential or skip-CI convention is changed. The exact local commit is retained in the bundle and handoff receipt. A confirmed existing deployment-free path is required before a source push; native acceptance and integration remain separately blocked. No new CI result, native pass, merge into main or deployment is claimed.

## Exact source identities

The [manifest](evidence/source-only-20261118/manifest.json) records the inspected inspector source, authored fixture, stylesheet, canonical token and dependency-lock hashes. The unchanged vendored package retains its separate [upstream provenance](UPSTREAM.md). Key values are:

| File | SHA-256 |
| --- | --- |
| Unchanged `inspector.js` | `a1c12c44f2d677094031c192e0824139150d8474c45bda9132fca686222aaf8b` |
| Expanded `inspector.test.js` | `7aeeb79b1250b5c3e86683137808398bda695bdce95a98d75c8a0a6fc22e49fc` |
| Guarded current `browser-check.mjs` | `109bed217e1ed6c55b55f61a77bfed83e7491567d68b6ce13a3b1c03659dc05e` |
| Source-only root entry | `a49fc5c38c417c610a9c15d2e26083e553134054aaac2d9efd0377e689404722` |

The historical harness hash `8ab91a8cb613767360a2bdb72ec8dba4ab08ca4a375e2944c300a6bfb5d6d0de` identifies the original checkpoint, not the guarded current file. The exact local commit/tree and patch/bundle hashes are recorded in the handoff and canonical Space after independent review and local reproduction checks. They are not remote publication SHAs.

## Native evidence that remains blocked

The complete per-row distinction is in [ACCEPTANCE.md](ACCEPTANCE.md). Current native evidence is still missing for trusted Enter/Space/Tab/Shift+Tab/Escape and focus return; modal/background inertness and top-layer transitions; real resize and live reduced-motion delivery; actual hidden-tab scheduling; teardown and sibling interaction in a browser; rendered CSS linear/fallback behavior; failed-runtime and genuinely disabled-JavaScript journeys; light/dark responsive layout, contrast and focus clipping; browser idle work; and rendered content parity/assistive-technology output.

The new I07 and I18 assertions close their named deterministic gaps only. Physical devices, OS settings, WebKit/Firefox, screen-reader speech, zoom, long dynamic content, software keyboards and an actual browser lacking `linear()` remain outside the evidence. No current native requirement is marked passed.

## Owner boundaries

Ben's current [compatibility/token and shared skill/library owner](https://chatgpt.com/c/6afc3963-c358-83ec-883f-e4f4be682ef6) and [filter/control owner](https://chatgpt.com/c/6afc3784-4350-83ec-a419-05b97d3999b8) were named in the canonical coordination reply for this continuation. Previously acknowledged paths and API remain unchanged: this inspector accepts canonical ID plus opener and owns its local focus/motion; the host owns facts, filters, membership, URL/history, SDK semantics and outer lifecycle. Filter membership never implicitly closes or retargets inspection or moves focus.

The reserved positional WAAPI adapter is not substituted for the velocity-preserving spring controller. Concrete shared integration still requires joint review. The actual Hardware/React/Next.js owner, source and mount contract remain unconfirmed. The deployed static site's stacked narrow inspector and the specimen's proposed modal sheet remain separate; dark appearance remains a workbench-token comparison. No operational/Hardware, control, adapter, shared skill/library, MCP or crawler implementation is taken over.
