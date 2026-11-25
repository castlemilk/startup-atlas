#!/usr/bin/env bash
# Build Startup Atlas locally — no CI runner involved.
# Usage: tasks/build.sh [worktree]   (default: this repo's root)
set -euo pipefail
WT="${1:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "$WT"
# Pre-flight: install anything missing, and prefer the venv python so
# the parquet step runs instead of skipping for lack of pyarrow.
[ -d node_modules ] && [ -x .venv/bin/python3 ] || bash tasks/setup.sh "$WT"
[ -x .venv/bin/python3 ] && export PATH="$WT/.venv/bin:$PATH"
npm run data:generate
npm run build
echo "build: dist/ ready in $WT"
