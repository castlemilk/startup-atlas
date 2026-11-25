#!/usr/bin/env bash
# Publish gate: verify a change is landable. Landing itself goes through
# the GitHub web UI under the owner's durable browser grant (file uploads,
# PR creation, squash-merge) — never MCP push_files, whose per-call
# approval cards expire unanswered.
# Usage: tasks/publish.sh [worktree]
set -euo pipefail
WT="${1:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "$WT"
bash scripts/preflight.sh --staged || bash scripts/preflight.sh
echo "publish: preflight passed in $WT — land via the browser route."
