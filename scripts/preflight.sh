#!/usr/bin/env bash
# Startup Atlas preflight checks — the single implementation behind the
# git hooks (.githooks/) and the mandatory check for GitHub-MCP push flows,
# which bypass local git entirely.
#
# Usage:
#   scripts/preflight.sh              # full lane checks for this branch vs origin/main
#   scripts/preflight.sh --staged     # fast checks for staged changes (pre-commit)
#   scripts/preflight.sh --range A..B # full lane checks for an explicit range
#
# Lane selection reuses scripts/check_ci_paths.py — the same routing CI
# uses — so what runs locally is what CI would run for the same paths,
# including the hosted lane for data changes (the gap that let main go
# red invisibly in Nov 2026: data merges never triggered the hosted
# tests, which read data/).
#
# Emergency bypass: ATLAS_SKIP_HOOKS=1 skips every check and prints a
# loud warning. CI is the backstop; if you bypass, say so in the PR.
set -u
cd "$(git rev-parse --show-toplevel)" || exit 1

if [ "${ATLAS_SKIP_HOOKS:-}" = "1" ]; then
  echo "############################################################" >&2
  echo "## WARNING: ATLAS_SKIP_HOOKS=1 — ALL PREFLIGHT CHECKS SKIPPED" >&2
  echo "## CI is now the only gate. Mention this bypass in your PR." >&2
  echo "############################################################" >&2
  exit 0
fi

fail=0
note() { printf '\n== %s ==\n' "$*"; }
run() { note "$*"; "$@" || fail=1; }
# Run a python test module only when pyarrow is importable; CI always has it.
run_parquet_tests() {
  if python3 -c 'import pyarrow' 2>/dev/null; then
    run python3 -m unittest discover -s tests -p 'test_query_parquet.py'
  else
    echo "WARNING: pyarrow not installed locally — test_query_parquet skipped (CI runs it)." >&2
  fi
}

staged_files() { git diff --cached --name-only --no-renames; }
any_staged() { staged_files | grep -Eq "$1"; }

check_staged() {
  note "pre-commit: whitespace / conflict markers"
  git diff --cached --check || fail=1

  local f
  while IFS= read -r f; do
    [ -f "$f" ] || continue
    case "$f" in
      *.json)
        python3 -m json.tool "$f" >/dev/null 2>&1 || { echo "INVALID JSON: $f" >&2; fail=1; } ;;
      *.py)
        python3 -m py_compile "$f" || fail=1 ;;
      *.mjs|*.js)
        node --check "$f" 2>/dev/null || { echo "SYNTAX: $f" >&2; fail=1; } ;;
      *.sh)
        bash -n "$f" || fail=1 ;;
    esac
  done <<EOF
$(staged_files)
EOF

  if any_staged '^data/.*\.json$'; then
    note "pre-commit: catalogue / graph integrity (staged data change)"
    run node --test tests/catalogue.test.js tests/graph-data.test.js
    run python3 -m unittest discover -s tests -p 'test_graph.py'
  fi
  if any_staged '^(data/review-queue\.json|data/review-gating\.json|scripts/review_gating\.py|scripts/build-review-queue\.py)$'; then
    note "pre-commit: review queue / gating consistency"
    run python3 -m unittest tests.test_review_gating tests.test_review_queue
  fi
  if any_staged '^(data/accelerator-deals\.json|scripts/accelerator_deals\.py|tests/test_accelerator_deals\.py)$'; then
    note "pre-commit: accelerator standard-deal table consistency"
    run python3 -m unittest tests.test_accelerator_deals
  fi
  if any_staged '^(scripts/check_ci_paths\.py|tests/test_ci_paths\.py)$'; then
    note "pre-commit: CI routing fixtures"
    run python3 -m unittest discover -s tests -p 'test_ci_paths.py'
  fi
  if any_staged '^backend/hosted/'; then
    note "pre-commit: hosted lane (backend/hosted changed)"
    run npm --prefix backend/hosted test
  fi
  if any_staged '^backend/mcp/'; then
    note "pre-commit: MCP lane (backend/mcp changed)"
    run npm run test:mcp
  fi
}

lanes_for() { # newline-separated changed paths arrive on stdin
  local tmp; tmp="$(mktemp)"; cat > "$tmp"
  python3 - "$tmp" <<'PY'
import sys
sys.path.insert(0, 'scripts')
from check_ci_paths import lanes
with open(sys.argv[1], encoding='utf-8') as fh:
    paths = [line.strip() for line in fh if line.strip()]
for name, on in lanes(paths).items():
    print(f'{name}={str(on).lower()}')
PY
  rm -f "$tmp"
}

check_range() {
  local range="$1" paths lane_file
  lane_file="$(mktemp)"
  paths="$(git diff --name-only --no-renames "$range" --)"
  if [ -z "$paths" ]; then
    echo "preflight: no changes in $range — nothing to check."
    rm -f "$lane_file"; return 0
  fi
  echo "preflight: changed paths in $range:"
  echo "$paths" | sed 's/^/  /'
  echo "$paths" | lanes_for > "$lane_file"
  lane() { grep -q "^$1=true$" "$lane_file"; }

  note "diff hygiene"
  git diff --check "$range" -- || fail=1

  if lane ci; then
    run python3 -m unittest discover -s tests -p 'test_ci_paths.py'
  fi
  if lane data || lane web; then
    note "regenerate catalogue/graph and report committed-output drift"
    npm run data:generate >/dev/null || fail=1
    if [ -n "$(git status --porcelain -- data/)" ]; then
      # Block: generation is reproducible again since #443 (data:generate
      # now includes backfill_structured_fields.py, so regeneration no
      # longer drops status_controlled/deadline from catalogue.json).
      # Committed generated output must match the generators exactly.
      echo "ERROR: data:generate changed files under data/ — committed generated" >&2
      echo "output is out of sync with the generators. Commit the regenerated" >&2
      echo "files or fix the generator, then re-run preflight:" >&2
      git status --porcelain -- data/ >&2
      git checkout -- data/ 2>/dev/null || true
      fail=1
    fi
  fi
  if lane data; then
    run node --test tests/catalogue.test.js tests/graph-data.test.js
    run python3 -m unittest discover -s tests -p 'test_graph.py'
    run_parquet_tests
    run python3 -m unittest tests.test_live_index.ReviewedValuationInputTests
    if echo "$paths" | grep -Eq '^data/(review-queue|review-gating)\.json$'; then
      run python3 -m unittest tests.test_review_gating tests.test_review_queue
    fi
    if echo "$paths" | grep -Eq '^(data/accelerator-deals\.json|scripts/accelerator_deals\.py|tests/test_accelerator_deals\.py)$'; then
      run python3 -m unittest tests.test_accelerator_deals
    fi
  fi
  if lane web; then
    run node --test tests/fuzzy-search.test.js tests/graph-layout.test.js tests/treemap.test.js tests/analytics.test.js tests/build-modules.test.js tests/accessibility.test.js tests/browser-transport.test.js
  fi
  if lane collection; then
    run python3 -m unittest discover -s tests -p 'test_crawl*.py'
    run python3 -m unittest discover -s tests -p 'test_company*.py'
    run python3 -m unittest discover -s tests -p 'test_collection_coverage.py'
    run python3 -m unittest discover -s tests -p 'test_scoped_implementation.py'
    run python3 -m unittest discover -s tests -p 'test_early_investments.py'
  fi
  if lane queue; then
    run python3 -m unittest tests.test_review_queue tests.test_review_gating tests.test_valuation_queue
  fi
  if lane research; then
    run python3 -m unittest discover -s tests -p 'test_country_research_index.py'
  fi
  if lane mcp; then
    [ -d backend/mcp/node_modules ] || npm ci --prefix backend/mcp --ignore-scripts >/dev/null || fail=1
    run npm run test:mcp
  fi
  if lane hosted; then
    # The incident lane: hosted tests read data/, so this runs for data
    # changes too (see check_ci_paths.py). Never skip it silently.
    [ -d backend/hosted/node_modules ] || npm ci --prefix backend/hosted --ignore-scripts >/dev/null || fail=1
    run npm --prefix backend/hosted test
  fi
  if lane go; then
    if command -v go >/dev/null 2>&1; then
      run go test -mod=readonly ./backend/internal/graph ./api
    else
      echo "WARNING: go not installed locally — Go lane skipped (CI runs it)." >&2
    fi
  fi
  rm -f "$lane_file"
}

case "${1:-}" in
  --staged) check_staged ;;
  --range)  check_range "${2:?usage: preflight.sh --range A..B}" ;;
  "")       check_range "origin/main...HEAD" ;;
  *) echo "usage: preflight.sh [--staged | --range A..B]" >&2; exit 2 ;;
esac

if [ "$fail" -ne 0 ]; then
  echo "" >&2
  echo "PREFLIGHT FAILED — fix the failures above before committing/pushing." >&2
  echo "Emergency bypass (document it in your PR): ATLAS_SKIP_HOOKS=1" >&2
  exit 1
fi
echo ""
echo "preflight: all selected checks passed."
