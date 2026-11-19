# Evidence journey specimen

One bounded integration specimen for **search/filter → canonical entity → claim/source → exact review → synthetic proposal outcome → independent authoritative readback**. It is isolated from operational Atlas routes and uses three fictional startups. The single correction changes Aster's deployment-region claim from “Australia” to “Australia and New Zealand”.

The composition uses existing Signal tokens, shared button/input/select enhancement and self-hosted Geist. A quiet results tray leads into a selected dossier and adjacent source rail; an explicit before/after review leads into three separately labelled readback contexts. Missing, conflicting and stale evidence stays visible. No UIArc implementation, new dependency, motion engine or global design system is introduced.

## Packet map

| Item | Purpose |
| --- | --- |
| [CONTRACT.md](CONTRACT.md) | State, provenance, adapter, lifecycle, keyboard/focus and progressive-enhancement contract |
| [HANDOFF.md](HANDOFF.md) | Exact existing owners, inspected PR heads, pending acknowledgements and next gate |
| [ACCEPTANCE.md](ACCEPTANCE.md) | Executed source/DOM matrix and explicit blocked native requirements |
| [EVIDENCE.md](EVIDENCE.md) | Commands, tool versions, review scope and source hashes |
| [UPSTREAM.md](UPSTREAM.md) | UIArc source/license/dependency limits and local Signal token mapping |
| [Specimen modules](../../../specimens/evidence-journey/) | Pure presentation, controller, synthetic adapter harness, fixtures and isolated builder |
| [Focused tests](../../../tests/evidence-journey.test.js) | Canonical fixtures, envelope integrity, SDK events and failure/lifecycle regressions |

## Source-only reproduction

Use the pinned repository baseline `d7b7aa805be24fa1e2da50bf2882ab99a3aa4c4f` and apply the packet's patch in an isolated branch. The bundle is an alternative representation of the same commit; do not apply both as separate changes. The packet's `receipt.json` pins the final source commit, tree, baseline, test result and artifact hashes. No remote branch publication is part of this packet.

The repository's pinned dependencies are sufficient. This task used `npm ci --ignore-scripts --no-audit --no-fund`; it changed no dependency manifest or lockfile. From the repository root:

```bash
node --test --test-reporter=tap tests/evidence-journey.test.js
node specimens/evidence-journey/build.mjs ../evidence-journey-artifact
```

The builder rejects an output path inside the repository. It writes static HTML, a bundled module, scoped composition styles, byte-identical canonical CSS, existing fonts/notices and the existing SDK license. It neither starts a server nor opens a browser, runs a browser harness, updates public assets, generates real data or modifies a deployment path. The built artifact is supplied for later permitted review, **not as evidence of rendered acceptance**. The existing browser/native testing hold applies before opening or serving it for acceptance testing.

Fixture reproduction is offline and uses the existing record validator:

```bash
node specimens/evidence-journey/fixture-source.mjs
```

That command rewrites only the synthetic `fixtures.json`; the focused suite checks exact deterministic parity. The reserved source URLs are examples and are never requested. The fixture's claim-freshness policy is illustrative, not a production freshness threshold.

## Integration boundary

`mountEvidenceJourney` receives rows, claims, a supplied correction candidate, read/validation callbacks and an optional existing inspector port. The harness owns only its local `ejq`/`ejcountry` URL keys. Production search/history, the inspector's modality/focus/motion, shared adapters and authenticated record operations remain with their existing owners.

`simulateProposal` and `resetDemo` are demonstration operations. They must not become live submission/recovery APIs by renaming or swapping in a writer. The first next gate is recorded agreement from controls, inspector, compatibility and record-writer owners on the bounded host adapters. No acknowledgement of this additional journey is assumed. Native browser acceptance and hosted credentials remain separately blocked; source acceptance or source merge does not establish either.
