# Fluid Signal adapter work

Follow the repository `AGENTS.md`, the existing UI SDK skill, its project-specific `references/atlas-fluid-signal.md` companion and `docs/design/fluid-signal-adapter.md`.

## Current source-only checkpoint

Read `SOURCE-ONLY.md` before continuing. Ben's 18 November 2026 instruction permits source, DOM and unit work only. Native acceptance is blocked by the unresolved browser permission hold. Do not request/grant permissions, use a different browser or CI as a substitute, or execute the held native entry. Its source gate has no runtime override. Historical reports retain their original revision and scope; they do not establish current consumer acceptance.

Keep PR163 at `208ef3762914765f3f828e1dd6dab3f4131d567b` while this hold applies. A PR synchronization triggers native workflows, and an active Vercel integration makes a non-main branch update insufficient evidence of deployment-free publication. Publish reviewed Git objects/patches without moving remote refs if the trigger boundary remains unverified. Do not change shared workflow or deployment settings to create an exception. Coordinate through the canonical Space.

- Own this package, the generated `web/assets/design-lab/fluid-signal-adapter/` distribution and its named additive tests/docs. Coordinate any shared package, build, workflow, token, skill-index or operational-controller edit.
- Pin the verified published package. Preserve release-age gates and `--ignore-scripts`; never substitute upstream main or relax policy.
- Keep motion visual, root-scoped and finite. No ticker, state, URL/history, focus, permission or success ownership belongs here.
- Run the isolated build check and source/DOM tests. During the current hold, new native evidence is missing and remains a gate. Regenerate source-derived output only for an intentional runtime change; retain the MIT notice and manifest hashes.
- Confirm source/bundle parity before review. Preserve all unrelated dirty files. Push only after owner coordination; merge/deploy require reviewed coordinated approval.
