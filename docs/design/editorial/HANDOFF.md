# Editorial design package — implementation handoff

## Scope and authority

This change consolidates the user-approved paper/forest/rust design direction, its interaction specification, scoped foundation and 13 final wireframes. Ben's latest instruction authorizes pushing this design package. It does not establish that the proposed controls, saved state, private notes, comparison flow or profile interactions already exist or have passed runtime gates.

Use [design-system.md](design-system.md) as the proposed target contract and the [gallery](README.md) for visual intent. Preserve the current owners and operational responsibilities documented in [Signal components](../../SIGNAL-COMPONENTS.md), [UI SDK](../../UI-SDK.md) and [UX-CONTRACT.md](../../../UX-CONTRACT.md). Hardware/framework integration remains with its existing owner. This package does not supersede their implementations or accept another owner's unfinished work.

## Assets and portable provenance

Preserve the original selected PNG bytes under the descriptive filenames in `wireframes/`. The [asset manifest](asset-manifest.json) retains original filenames, relative destinations and SHA-256 digests so packaging can be checked independently. The [Stitch reference](references/stitch-design.md) records source inspiration; the approved specification governs the target.

The [source fixture](source-fixture.json) retains exact primary-source URLs, publication dates and check dates. Generated logos and screenshots are design references; source-backed company records and production asset permissions remain separate. Approximate chart areas, fixture geography and illustrative metrics must not become factual fixtures by copying image text.

## Checked source baseline

Read-only checks on **20 November 2026** confirmed:

| Item | Observed value |
|---|---|
| Checkout branch | `docs/editorial-design-handoff-20261120` |
| Local source HEAD | `6dc157dba25957e1de0b10ca618da5d2796398f4` |
| Initial working tree | Clean before package edits |
| Existing contract paths | Signal components, UI SDK and root UX contract present |

The 13 selected source images were visually inventoried; their combined original size is **21,691,448 bytes**. This is a local source/package observation, not a deployed revision or a claim that remote main cannot advance.

**Completed package checks:** all 13 PNGs match their original bytes, recorded SHA-256 digests and dimensions; each PNG decoded successfully. The manifest covers the complete selected image directory, all 40 relative Markdown references resolve inside the repository, and the source reference digest matches. The extracted CSS matches section 17, has balanced blocks and keeps all 32 selectors scoped under `.atlas`. The 22-file scope contains documentation and design assets only. The resulting commit, push and CI receipts are reported in the pull request; runtime and deployed-browser acceptance remain separate.

## Coordination snapshot

GitHub readback and the existing project design record supplied these states on 20 November 2026. Refresh exact heads and gates before integration; this document does not approve or merge either change.

| Work | Recorded head | Gate |
|---|---|---|
| [PR #237](https://github.com/castlemilk/startup-atlas/pull/237) | `0ef6fbbbb0755f0677b8df1f3c4e4fee49fc9617` | Open; conflicts and held canonical review |
| [PR #242](https://github.com/castlemilk/startup-atlas/pull/242) | `df6d1d1ce7c4f6b92521c2d8cc0893742fb0cbfc` | Draft |

Neither PR is superseded by the visual approval. Preserve their owner handoffs, conflict resolution and review gates.

## Implementation acceptance

1. Map the proposed tokens and components through existing owners. Scope styles, preserve backing controls and avoid introducing duplicate controllers or global resets.
2. Verify headquarters-country semantics, OR within countries, AND across facets and drill paths, explicit unknowns, draft Apply/Cancel, latest-request handling and distinct clearing actions.
3. Preserve query, viewport, inspected entity and comparison state across views. Label a selection outside current results and keep contextual graph nodes separate from company counts.
4. Calculate treemap areas and aggregates from the actual eligible population. Match legends to the chosen metric; retain currency, date precision and missing-data coverage.
5. Exercise company-to-person, round-to-investor and claim-to-source journeys. Keep founding history separate from dated employment and source-check age separate from verification.
6. Validate keyboard, touch, narrow layouts, focus return, asynchronous failure and reduced motion in the implemented runtime. Record exact source and release evidence through the existing release process.

Commit/push receipts and any later deployment verification belong to the coordinating owner. Completion of this artifact rollup should be reported separately from completion of those implementation steps.
