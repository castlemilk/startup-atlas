"""Select focused PR checks using changed paths in the checked-out merge tree.

Two modes:

- ``check_ci_paths.py <base-sha>`` prints the enforced lane selection as
  ``name=true|false`` lines (consumed by the Pages workflow and the
  pre-push hook).
- ``check_ci_paths.py --shadow <base-sha>`` prints a JSON shadow report
  (issue #150 A4): what the selector *would* execute for the same diff,
  recorded inside existing full runs without changing what they execute.
  Shadow mode never gates and always exits 0.
"""
from fnmatch import fnmatchcase
import json
import subprocess
import sys


RULES = {
    'ci': ('.github/workflows/pages.yml', '.github/workflows/deep-atlas-checks.yml',
           '.github/workflows/live-index.yml',
           'scripts/check_ci_paths.py', 'tests/test_ci_paths.py'),
    'data': ('data/*', 'scripts/make-data.py', 'scripts/make-graph.py', 'scripts/build-graph-db.py',
             'scripts/build-loom-atlas.py',
             'scripts/build-query-parquet.py', 'scripts/atlas_corpus.py',
             'scripts/build_live_index.py', 'scripts/publish_reviewed_corpus.py',
             '.github/workflows/publish-reviewed-corpus.yml',
             'scripts/add-provider-edges.mjs', 'scripts/catalogue-entries.mjs',
             'scripts/entity_resolution.py', 'scripts/accelerator_deals.py',
             'tests/test_graph.py', 'tests/catalogue.test.js', 'tests/graph-data.test.js',
             'tests/test_entity_resolution.py', 'tests/test_accelerator_deals.py',
             'tests/test_build_loom_atlas.py',
             'tests/test_query_parquet.py', 'tests/test_atlas_corpus.py',
             'tests/test_live_index.py'),
    'web': ('web/*', 'scripts/build.mjs', 'package.json', 'package-lock.json',
            'scripts/browser-transport.mjs', 'scripts/test-*-browser.mjs',
            'tests/fuzzy-search.test.js', 'tests/graph-layout.test.js', 'tests/graph-atlas.test.js', 'tests/treemap.test.js',
            'tests/analytics.test.js', 'tests/build-modules.test.js',
           'tests/accessibility.test.js', 'tests/browser-transport.test.js'),
    'collection': ('scripts/crawl.py', 'scripts/crawl_gap_report.py', 'scripts/publish_crawl_corpus.py',
                   'scripts/run_scoped_collection.py', 'scripts/*company*profile*.py',
                   'scripts/*company*metadata*.py', 'scripts/*early_investments.py', 'scripts/collection_coverage.py',
                   'tests/test_crawl*.py', 'tests/test_company*.py', 'tests/test_scoped_implementation.py',
                   'tests/test_early_investments.py', 'tests/test_collection_coverage.py'),
    'queue': ('scripts/build-review-queue.py', 'scripts/latest_value.py', 'scripts/review_gating.py',
              'tests/test_review_queue.py', 'tests/test_review_gating.py', 'tests/test_valuation_queue.py'),
    'research': ('research/countries/*', 'scripts/index_country_research.py', 'tests/test_country_research_index.py'),
    'mcp': ('backend/mcp/*', 'server.js', 'scripts/catalogue-entries.mjs'),
    # The hosted tests read data/ directly (profile previews, source
    # reads): data changes MUST run the hosted lane. Before Nov 2026
    # 'hosted' only fired on backend/hosted/*, so data merges landed
    # without ever running those tests and main went red invisibly.
    'hosted': ('backend/hosted/*', 'scripts/catalogue-entries.mjs', 'data/*'),
    'go': ('*.go', 'go.mod', 'go.sum', 'api/*', 'backend/internal/*'),
}


def lanes(paths):
    return {
        name: any(fnmatchcase(path, pattern) for path in paths for pattern in patterns)
        for name, patterns in RULES.items()
    }


ALL_PATTERNS = tuple(pattern for patterns in RULES.values() for pattern in patterns)

# Paths that legitimately select no lane: the patch check (git diff --check)
# and human review cover them, and no build or test input reads them. A path
# matched by no rule and not listed here is *unknown* — the shadow report
# treats unknown paths as selecting full validation (issue #150 A4).
PATCH_ONLY_PATTERNS = ('*.md', 'docs/*', 'LICENSE*', '.gitignore', '.gitattributes')

WORKFLOW_PREFIX = '.github/workflows/'


def shadow_report(paths):
    """Dependency-aware selection recorded in shadow mode (issue #150 A4).

    The verdict distinguishes what a full run would have executed:

    - ``full``: an unknown path (matched by no rule and not patch-only) or
      any workflow change — CI behaviour itself is in play, so every lane
      counts as selected.
    - ``selected``: at least one lane matched the dependency map.
    - ``patch-only``: every path is documentation/meta the patch check
      already covers.

    Per-lane values distinguish ``selected`` from ``not-applicable``; the
    aggregate of a shadow record is ``recorded`` — it is evidence for a
    future selection change, never a gate on the current run.
    """
    selected = lanes(paths)
    unknown = [
        path for path in paths
        if not any(fnmatchcase(path, pattern) for pattern in ALL_PATTERNS)
        and not any(fnmatchcase(path, pattern) for pattern in PATCH_ONLY_PATTERNS)
    ]
    workflow_change = any(path.startswith(WORKFLOW_PREFIX) for path in paths)
    if unknown or workflow_change:
        verdict = 'full'
    elif any(selected.values()):
        verdict = 'selected'
    else:
        verdict = 'patch-only'
    return {
        'mode': 'shadow',
        'verdict': verdict,
        'lanes': {
            name: 'selected' if enabled else 'not-applicable'
            for name, enabled in selected.items()
        },
        'unknown_paths': unknown,
        'workflow_change': workflow_change,
        'aggregate': 'recorded',
    }


def changed_paths(base):
    output = subprocess.check_output(
        ['git', 'diff', '--name-only', '--no-renames', '-z', base, 'HEAD', '--'],
    )
    return [path.decode('utf-8', errors='surrogateescape')
            for path in output.split(b'\0') if path]


def _base_sha(value):
    if len(value) != 40 or any(c not in '0123456789abcdef' for c in value):
        raise SystemExit('Expected the exact GitHub pull-request base SHA')
    return value


if __name__ == '__main__':
    if len(sys.argv) == 3 and sys.argv[1] == '--shadow':
        print(json.dumps(shadow_report(changed_paths(_base_sha(sys.argv[2]))),
                         indent=2, sort_keys=True))
    elif len(sys.argv) == 2:
        for name, selected in lanes(changed_paths(_base_sha(sys.argv[1]))).items():
            print(f'{name}={str(selected).lower()}')
    else:
        raise SystemExit('Expected the exact GitHub pull-request base SHA')
