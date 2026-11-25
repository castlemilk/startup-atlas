# Local pipeline — build / test / publish / deploy without runners

Directed by the owner 25 Nov 2026 (#143 E1, resolved by relocation): the
Atlas build, publish and deploy loop runs in the agent's own environment.
There is no dependency on an external runner — no Cuttlefish mapping, no
runner labels, no capacity questions owed by anyone.

## Defaults

- **Project identity:** `castlemilk/startup-atlas`.
- **Runner:** the agent's VM — plain shell tasks, one git worktree per
  change, suites run sequentially within the VM's capacity envelope.
- **Gates:** `scripts/preflight.sh` passes before any push (repo AGENTS.md).
- **Landing:** GitHub web UI under the owner's durable browser grant;
  never MCP `push_files` (per-call approval cards expire unanswered).

## Tasks

- `tasks/build.sh [worktree]` — install, regenerate data, build `dist/`.
- `tasks/test.sh [worktree]` — JS suite, Python suite, hosted MCP suite.
- `tasks/publish.sh [worktree]` — preflight gate for the browser landing.
- `tasks/deploy.sh` — the verified DeepHost deploy recipe for the hosted
  MCP app (short app name, `framework: "node"`, promote, verify /health).
