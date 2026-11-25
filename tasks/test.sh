#!/usr/bin/env bash
# Run the Atlas test suites locally, sequentially.
# Usage: tasks/test.sh [worktree]   (default: this repo's root)
# Note: tests/test_graph_kg.py needs pyarrow; without it that one module
# errors on import locally — CI's coherent environment is the arbiter.
set -euo pipefail
WT="${1:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "$WT"
npm test
python3 -m unittest discover -s tests -p "test_*.py"
npm ci --prefix backend/mcp --ignore-scripts
npm --prefix backend/mcp test
echo "test: all suites finished in $WT"
