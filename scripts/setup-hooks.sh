#!/usr/bin/env bash
# One-command hook setup for a fresh clone or worktree:
#   bash scripts/setup-hooks.sh
# Points git at the committed hooks in .githooks/ (pre-commit + pre-push,
# both thin wrappers over scripts/preflight.sh).
set -eu
cd "$(git rev-parse --show-toplevel)"
git config core.hooksPath .githooks
chmod +x .githooks/pre-commit .githooks/pre-push scripts/preflight.sh
echo "Hooks enabled: core.hooksPath=$(git config core.hooksPath)"
echo "  pre-commit: staged lint/syntax/JSON + data & review-queue validators"
echo "  pre-push:   CI-lane checks for the pushed range (incl. hosted lane on data changes)"
echo "Emergency bypass: ATLAS_SKIP_HOOKS=1 (loud warning; mention it in your PR)"
