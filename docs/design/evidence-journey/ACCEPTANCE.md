# Evidence journey acceptance matrix

Observed 18 November 2026. **39 focused Node/jsdom tests pass.** All results below are source or simulated DOM evidence; none is native/browser acceptance. Exact source identity and command receipts are in [EVIDENCE.md](EVIDENCE.md) and the packet's `receipt.json`.

| Contract | Executed evidence | Result |
| --- | --- | --- |
| One deterministic synthetic correction | Fixture regeneration through existing `prepareStartupEdit`, one changed profile-fact path, distinct proposal/main revisions | PASS — source |
| Progressive fallback and useful semantics | Complete static dossiers; local anchors and labels resolve; script-only controls disabled; no media embeds | PASS — parsed DOM |
| Unknown, empty, zero and conflict remain distinct | Claim-value cases; empty entity claims; both conflict alternatives retained; unsupported correction blocked | PASS — source/DOM |
| Claim provenance and freshness | Exact URL preservation; unsafe links escaped/disabled; claim-specific date and supplied policy/evaluation context | PASS — source/DOM |
| Canonical source identity and integrity | Wrong entity/origin/schema/revision/digest rejected; cloned envelope cannot change during hashing | PASS — source |
| Exact intent → canonical preview | Wrong intent, mixed intent/result, altered baseline, changed result digest rejected using existing pure edit semantics | PASS — source |
| Proposal outcome is separate | Full result/intent/head checks; older-base same-intent proposal accepted; closed/merged remain unpublished; already-present is an explicit no-op | PASS — source/DOM |
| Main and published contexts stay independent | Full main record and digest comparison, projection revision consistency, disagreement between observed main revisions, independent failures | PASS — source/DOM |
| Preview invalidation survives unrelated reads | Source snapshot/record changes and failed revalidation retain review but block stale proposal token | PASS — source/DOM |
| Uncertain outcome never auto-replays | Exact intent retained across selection; recovery uses read-only callback; `not_found` does not permit retry | PASS — source/DOM |
| Search membership does not retarget inspection | Filtered-out entity retained with notice; zero results differs from failed search; unrelated query keys preserved | PASS — source/DOM |
| Current action controls focus and async application | Explicit heading/close fallback; late source/readback/digest ignored; hidden interruption/cancel suppress replay | PASS — simulated DOM events/focus |
| SDK and lifecycle ownership | Existing SDK agent operates search/select/review; IME/clear committed-query checks; sibling isolation, remount/disposal and foreign-inspector teardown boundary | PASS — SDK in jsdom |
| Scoped visual implementation | Both styles parse, token references resolve, no new animation declarations; canonical CSS/fonts copied byte-for-byte | PASS — static source/build |
| Isolated build | Browser-targeted bundle resolves existing pure helpers/SDK without importing a writer, worker, Fluid owner or browser-test launcher | PASS — build metadata |
| Premium static rules | Strict audit of scoped CSS and generated static HTML using existing canonical map: zero findings | PASS — limited static audit |

## Explicit missing acceptance

The static auditor does not inspect `.mjs` modules. The focused suite executes those modules and checks state/DOM behavior; this is not a replacement for native rendering or input. jsdom uses the repository's existing DOM/media/frame doubles. Simulated `visibilitychange`, focus, IME and SDK events do not prove trusted-event behavior, real scheduling or accessibility speech.

Every native requirement in [HANDOFF.md](HANDOFF.md) remains **BLOCKED**: actual Tab/Shift+Tab/Enter/Space and popup ownership; trusted IME/clear behavior; visible focus and scroll placement; actual announcements; 320/390/desktop rendering, zoom, long content and contrast; live reduced-motion/background handling; no-JavaScript and failed-runtime browsing. No screenshot, native AX capture or browser run was produced for this specimen.

The page entry disposes enhancement on `pagehide`; the authored static fallback remains available. Automatic enhancement restoration from the back/forward cache has not been implemented or accepted. Production host lifecycle decisions remain with the eventual mount owner.

Hosted transport, authorization, service readback, actual proposals, real records, merges, publication and deployment were not exercised. Tests use supplied synthetic envelopes and establish their consistency only. This matrix neither resolves the hosted credential hold nor certifies other improvement lanes.
