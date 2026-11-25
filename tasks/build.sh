#!/usr/bin/env bash
# Build Startup Atlas locally — no CI runner involved.
# Usage: tasks/build.sh [worktree]   (default: this repo's root)
set -euo pipefail
WT="${1:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "$WT"
npm ci --ignore-scripts
npm run data:generate
npm run build
echo "build: dist/ ready in $WT"
