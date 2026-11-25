#!/usr/bin/env bash
# Run the Atlas test suites locally, sequentially.
# Usage: tasks/test.sh [worktree]   (default: this repo's root)
set -euo pipefail
WT="${1:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "$WT"
# Pre-flight: install anything missing, and prefer the venv python so
# test_graph_kg can import pyarrow.
[ -d node_modules ] && [ -x .venv/bin/python3 ] || bash tasks/setup.sh "$WT"
[ -x .venv/bin/python3 ] && export PATH="$WT/.venv/bin:$PATH"
npm test
python3 -m unittest discover -s tests -p "test_*.py"
npm --prefix backend/mcp test
echo "test: all suites finished in $WT"
