"""Select focused PR checks using changed paths in the checked-out merge tree."""
from fnmatch import fnmatchcase
import subprocess
import sys


RULES = {
    'ci': ('.github/workflows/pages.yml', '.github/workflows/deep-atlas-checks.yml',
           '.github/workflows/live-index.yml',
           'scripts/check_ci_paths.py', 'tests/test_ci_paths.py'),
    'data': ('data/*', 'scripts/make-data.py', 'scripts/make-graph.py', 'scripts/build-graph-db.py',
             'scripts/build-query-parquet.py', 'scripts/atlas_corpus.py',
             'scripts/build_live_index.py',
             'scripts/add-provider-edges.mjs', 'scripts/catalogue-entries.mjs',
             'tests/test_graph.py', 'tests/catalogue.test.js', 'tests/graph-data.test.js',
             'tests/test_query_parquet.py', 'tests/test_atlas_corpus.py',
             'tests/test_live_index.py'),
    'web': ('web/*', 'scripts/build.mjs', 'package.json', 'package-lock.json',
            'tests/fuzzy-search.test.js', 'tests/graph-layout.test.js', 'tests/treemap.test.js',
            'tests/analytics.test.js'),
    'collection': ('scripts/crawl.py', 'scripts/publish_crawl_corpus.py',
                   'scripts/run_scoped_collection.py', 'scripts/*company*profile*.py',
                   'scripts/*company*metadata*.py', 'scripts/*early_investments.py', 'scripts/collection_coverage.py',
                   'tests/test_crawl*.py', 'tests/test_company*.py', 'tests/test_scoped_implementation.py',
                   'tests/test_early_investments.py', 'tests/test_collection_coverage.py'),
    'research': ('research/countries/*', 'scripts/index_country_research.py', 'tests/test_country_research_index.py'),
    'mcp': ('backend/mcp/*', 'server.js', 'scripts/catalogue-entries.mjs'),
    'hosted': ('backend/hosted/*', 'scripts/catalogue-entries.mjs'),
    'go': ('*.go', 'go.mod', 'go.sum', 'api/*', 'backend/internal/*'),
}


def lanes(paths):
    return {
        name: any(fnmatchcase(path, pattern) for path in paths for pattern in patterns)
        for name, patterns in RULES.items()
    }


def changed_paths(base):
    output = subprocess.check_output(
        ['git', 'diff', '--name-only', '--no-renames', '-z', base, 'HEAD', '--'],
    )
    return [path.decode('utf-8', errors='surrogateescape')
            for path in output.split(b'\0') if path]


if __name__ == '__main__':
    if len(sys.argv) != 2 or len(sys.argv[1]) != 40 or any(c not in '0123456789abcdef' for c in sys.argv[1]):
        raise SystemExit('Expected the exact GitHub pull-request base SHA')
    for name, selected in lanes(changed_paths(sys.argv[1])).items():
        print(f'{name}={str(selected).lower()}')
