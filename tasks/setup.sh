#!/usr/bin/env bash
# Pre-flight install: every dependency the pipeline needs, in one place.
# Idempotent — safe to re-run; each step is satisfied quickly when the
# environment is already prepared. Run this first in any fresh worktree.
# Usage: tasks/setup.sh [worktree]   (default: this repo's root)
set -euo pipefail
WT="${1:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "$WT"
# Repo git hooks (documented fresh-worktree step) — only when unset.
[ "$(git config core.hooksPath || true)" = ".githooks" ] || bash scripts/setup-hooks.sh
# Node dependencies: site root and the hosted MCP backend.
npm ci --ignore-scripts
npm ci --prefix backend/mcp --ignore-scripts
# Python dependencies in a worktree-local venv: pyarrow powers the
# parquet build step and the graph KG tests; without it both degrade
# (the build skips parquet, test_graph_kg errors on import).
[ -x .venv/bin/python3 ] || python3 -m venv .venv
.venv/bin/pip install --quiet pyarrow
echo "setup: dependencies ready in $WT (node root + backend/mcp, .venv with pyarrow)"
