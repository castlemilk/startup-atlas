# Agent instructions

Startup Atlas is a source-backed startup opportunity and partner directory. Start by inspecting the latest main, open PRs, ongoing work and current deployment before editing.

- For collection and MCP work, use [the Startup Atlas collection skill](.agents/skills/startup-atlas-collection/SKILL.md).
- Read [the agent runbook](docs/AGENT-RUNBOOK.md) for the collector, MCP, OAuth, deployments and known failure modes.
- Partner names and image candidates are research leads. Verify identity, asset and source before publishing; a logo or matching name alone does not establish affiliation or entitlement.
- The owner has requested that the crawler not request or inspect robots.txt. Preserve host restrictions, per-host throttling, response limits, 429 handling and review of untrusted assets.
- For factual programme data, verify current primary sources and preserve provenance, review date, eligibility, geography, deadlines and uncertainty.
- Run relevant tests; inspect and report actual CI/deployment outcomes. A local or draft change is not a production deployment.

## Git hooks and preflight (mandatory)

- Fresh clone or worktree: run `bash scripts/setup-hooks.sh` once. It sets `core.hooksPath=.githooks`; the committed hooks are thin wrappers over `scripts/preflight.sh`.
- **pre-commit** runs fast staged checks: whitespace/conflict markers, JSON validity, Python/JS/shell syntax, and — whenever `data/` files are staged — the catalogue/graph integrity tests plus the review-queue/gating consistency tests.
- **pre-push** runs the CI lanes for the pushed range, selected by `scripts/check_ci_paths.py` (the same routing CI uses). It **includes the hosted-lane tests whenever the push touches `data/` or `backend/`** — the hosted tests read `data/` directly, and in Nov 2026 data merges that never triggered that lane put main into a red state nobody saw until later.
- **GitHub-MCP pushes bypass local git, so the hooks cannot fire.** Before any `push_files`/MCP-driven push, run `scripts/preflight.sh` from the worktree whose content you are pushing and only push when it passes. This binds the main agent, subagents, and the burn-down / agent-review cron jobs equally. (If the exec bit is missing — the GitHub API creates files as 0644 — run `bash scripts/preflight.sh` instead; `setup-hooks.sh` restores the exec bits.)
- Emergency bypass: `ATLAS_SKIP_HOOKS=1` skips the hooks/preflight with a loud warning. Use it only when the checks themselves are broken, and state the bypass in the PR — CI remains the backstop, never the plan.

## Frontend and ui-sdk

- Before changing ui-sdk integration, read [the installed ui-sdk skill](.agents/skills/ui-sdk/SKILL.md), then `node_modules/@ui-sdk/web/docs/llms.txt` and only the component pages needed for the task. Read `server-rendering.md` when changing initial HTML or upgrade behaviour; read core/rendering documentation only when building a new behaviour.
- Use documented component entry imports and `.d.ts` types. Do not inspect compiled package JavaScript in `dist/*.js` to infer or debug APIs; use the installed docs and a focused test. Do not hand-roll a behaviour that the installed SDK already supplies.
- Follow [the Atlas SDK contract](docs/UI-SDK.md). Preserve native backing-control IDs, route state, sources, fallback paths and focus restoration. Keep Signal values in `web/design-tokens.css`; the optional SDK default stylesheet is not the Atlas theme.
- Validate the built, self-hosted SDK bundle through the existing browser acceptance suite, including keyboard and local agent actions. Keep the project-scoped skill and `skills-lock.json` versioned with changes to the workflow.

## Durable design and evidence workflow

- Treat Signal's operational tokens and UI SDK behaviour as canonical. Concept boards, experimental artwork and reference libraries are not installed capabilities or selected production identities. Start with `docs/SIGNAL-COMPONENTS.md`; keep Hardware/framework work with its existing owner.
- For embedded motion, follow `docs/MOTION-EMBEDDING.md`: root-scoped styles, independent instances, host-owned lifecycle and unique IDs, readable reduced-motion/no-JavaScript/failed-runtime states. Do not animate factual values or imply evidence through artwork.
- Company research uses the collection skill's company-profile workflow. Separate source observations, captured bytes, identity review, asset-use permission and actual publication. An accessible logo download or labelled portrait alone does not clear those gates.
- Consolidate verified outcomes into the relevant repo documentation and project Space. Record exact source/release revisions and remaining holds; never turn a historical screenshot, stale draft or another owner's unfinished work into a claim of current completion.
