# Evidence journey source receipt

Recorded **18 November 2026, Australia/Melbourne**. This is an isolated patch-ready source packet for improvement lane 5. The final commit and tree are recorded outside their own content in the packet's `receipt.json`, alongside the base, test log and per-file checksum manifest.

## Refreshed repository and coordination inputs

- Main was refreshed through GitHub at task start and again before packaging: `d7b7aa805be24fa1e2da50bf2882ab99a3aa4c4f` (unchanged).
- Open PRs observed: 163, 162, 160, 135 and 107. The controls, inspector and compatibility heads were reread and remain the exact values in [HANDOFF.md](HANDOFF.md).
- The canonical [Atlas Space](https://chatgpt.com/space/page_5167bcbbbb0c81919e1d565fd4d82e4a) was refreshed before implementation. This lane's own section records only its scope, receipt and requested owner gate. Other owners' sections and work were preserved.
- Changes are additive under `specimens/evidence-journey/`, `tests/evidence-journey.test.js` and `docs/design/evidence-journey/`. No existing tracked source, root dependency, token, API, workflow, route, record or public asset is changed.

## Executed verification

| Command / check | Result and scope |
| --- | --- |
| `node --test --test-reporter=tap tests/evidence-journey.test.js` | **39 pass, 0 fail, 0 skipped.** Pure domain checks and existing SDK/jsdom events; no browser executable or live transport. |
| `node specimens/evidence-journey/build.mjs ../evidence-preview` | Exit 0. Isolated static artifact and 171-input esbuild metadata; no server/browser/deployment. |
| Static artifact verification | Three canonical CSS files and five font/license files are byte-identical; both scoped CSS files parse with zero esbuild warnings and reference existing tokens. HTML runtime resources resolve locally. No writer, worker, Fluid specimen or browser-test launcher appears in bundle inputs. |
| Premium `audit_project.py --mode strict` | Exit 0, zero findings. Scoped component CSS plus the generated static HTML; existing canonical map/native-select ownership retained. Config/report are in the packet. `.mjs` is outside that auditor's suffix list and is exercised by the focused suite instead. |
| Patch application and Git bundle verification | Exact final receipt is in the packet. The packaging check applies the patch against the pinned baseline in a temporary index and compares the resulting Git tree with the committed tree. It does not alter the original checkout or any remote ref. |

Runtime: Node **v24.22.3**, jsdom **26.1.0**, esbuild **0.25.12**, `@ui-sdk/web` **0.1.0-beta.6**, Python **3.12.14**. Existing lockfile dependencies were installed with lifecycle scripts disabled. An initial offline install lacked cached `xmlchars`; the subsequent ordinary pinned install succeeded. No manifest or lockfile changed.

The first focused run exposed an incomplete synthetic search snapshot and an assertion that counted hidden fallback conflict rows. These were corrected. Later regressions exercise wrong-intent previews, mixed intent/result responses, source digest corruption, older proposal bases, public/main disagreement, no-op outcomes and stale validation eligibility. The final passing log is supplied; earlier failures are not presented as accepted behavior.

## Independent source review

An independent agent reviewed record/readback semantics and ran pure Node probes. Its final conclusion was that the identified blockers were resolved for this isolated source handoff. It did not independently rerun the complete 39-test suite and did not provide a human approval or another owner's acknowledgement.

The review checked exact-candidate and canonical-result binding using existing pure edit semantics; source identity/digest checks; older-base proposal recovery; explicit no-op receipts; persistent preview invalidation; independent context failures; and generation checking after asynchronous verification before retained-session mutation.

| Reviewed module | SHA-256 |
| --- | --- |
| `model.mjs` | `4b22074dd33163cb3208ee32be09d12f42099966e049a03053c1d1ad30ee2004` |
| `journey.mjs` | `7f64a19a9dd710cd184f148f71c5178f589cf36357c7a0cc0ca5e46bf74f6074` |
| `render.mjs` | `b04aa47e49a0e91029977c636f561b65fe17bd88af479f52333adc133532060e` |
| `demo.mjs` | `5d6bbdd5cf611a548647e0f89354ac54f4868afd2a56896e46a03c05b5a0c0d7` |

The final limited follow-up review covers the exact hashes above, including semantic heading-level corrections, a focusable skip target, cancellation status announcements and explicit failed-refresh retention copy. The root reran all 39 focused tests and the isolated build after these changes. The peer review is source inspection with targeted pure probes, not an independent execution of the full suite or native acceptance.

The pre-commit whitespace check subsequently removed one extra blank line at EOF in `model.mjs`; no executable text changed. The committed model hash is `29ad9b43b88c15bfbf6791ceabd8bafeedd7b81dac3f903f8b33329e83650241`. The other three reviewed hashes match committed source. The final packet's exact-commit test run includes this normalization.

## Holds and next gate

No browser/native test, screenshot, credential operation, robots request, spending, real record/asset write, push, merge, workflow change, deployment or release occurred. The existing PR/browser CI and external preview path is not established as safe under the holds, so this packet stays local and patch-ready. Source/DOM acceptance does not establish rendered acceptance; source merge does not establish hosted capability.

Next: the four existing owners record agreement on the adapter boundary in [HANDOFF.md](HANDOFF.md), and identify the actual host/mount owner. Native testing and hosted binding each require their existing holds to be resolved separately. No new permission request or fabricated acknowledgement is part of this receipt.
