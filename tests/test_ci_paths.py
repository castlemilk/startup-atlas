import unittest

from scripts.check_ci_paths import lanes


class CiPathTests(unittest.TestCase):
    def test_documentation_changes_need_only_the_patch_check(self):
        self.assertFalse(any(lanes(['README.md', 'docs/AGENT-RUNBOOK.md']).values()))

    def test_data_and_web_are_independent(self):
        self.assertEqual(self.selected('data/startup-research.json'), {'data', 'hosted'})
        self.assertEqual(self.selected('web/entity.js'), {'web'})
        self.assertEqual(self.selected('tests/analytics.test.js'), {'web'})
        self.assertEqual(self.selected('tests/build-modules.test.js'), {'web'})
        self.assertEqual(self.selected('tests/accessibility.test.js'), {'web'})
        self.assertEqual(self.selected('scripts/build.mjs'), {'web'})
        self.assertEqual(self.selected('web/atlas-ui.css', 'data/graph.json'), {'data', 'web', 'hosted'})

    def test_data_changes_run_hosted_checks(self):
        # Regression guard for the Nov 2026 red-main incident: the hosted
        # tests read data/ (Quantum Brilliance strict preview, every-startup
        # review-only preview, PsiQuantum source read), so any data change
        # must select the hosted lane at PR time.
        for path in ('data/startup-research.json', 'data/catalogue.json',
                     'data/partners-reviewed.json', 'data/review-queue.json'):
            self.assertIn('hosted', self.selected(path), path)

    def test_shared_catalogue_contract_covers_both_mcp_hosts(self):
        self.assertEqual(self.selected('scripts/catalogue-entries.mjs'), {'data', 'mcp', 'hosted'})

    def test_crawler_and_staged_research_keep_separate_checks(self):
        self.assertEqual(self.selected('scripts/rollup_company_metadata.py'), {'collection'})
        self.assertEqual(self.selected('research/countries/au/batch/ecosystem.json'), {'research'})

    def test_ci_workflow_changes_run_routing_fixtures(self):
        self.assertEqual(self.selected('.github/workflows/pages.yml', 'tests/test_ci_paths.py'), {'ci'})

    def test_service_changes_have_focused_checks(self):
        self.assertEqual(self.selected('backend/hosted/package-lock.json'), {'hosted'})
        self.assertEqual(self.selected('backend/mcp/server.mjs'), {'mcp'})
        self.assertEqual(self.selected('server.js'), {'mcp'})
        self.assertEqual(self.selected('backend/internal/graph/service.go'), {'go'})

    def test_query_dataset_changes_run_data_checks(self):
        self.assertEqual(self.selected('scripts/build-query-parquet.py'), {'data'})
        self.assertEqual(self.selected('tests/test_query_parquet.py'), {'data'})

    def test_live_index_changes_run_data_checks(self):
        self.assertEqual(self.selected('scripts/atlas_corpus.py'), {'data'})
        self.assertEqual(self.selected('scripts/build_live_index.py'), {'data'})
        self.assertEqual(self.selected('scripts/publish_reviewed_corpus.py'), {'data'})
        self.assertEqual(self.selected('.github/workflows/publish-reviewed-corpus.yml'), {'data'})
        self.assertEqual(self.selected('tests/test_atlas_corpus.py'), {'data'})
        self.assertEqual(self.selected('tests/test_live_index.py'), {'data'})
        self.assertEqual(
            self.selected('.github/workflows/live-index.yml'), {'ci'})

    def test_crawl_corpus_publisher_runs_collection_checks(self):
        self.assertEqual(
            self.selected('scripts/publish_crawl_corpus.py'), {'collection'})
        self.assertEqual(
            self.selected('tests/test_crawl_corpus.py'), {'collection'})

    def test_valuation_queue_uses_only_fast_queue_lane(self):
        for path in ('scripts/build-review-queue.py', 'scripts/latest_value.py',
                     'tests/test_valuation_queue.py'):
            self.assertEqual(self.selected(path), {'queue'})

    @staticmethod
    def selected(*paths):
        return {name for name, enabled in lanes(paths).items() if enabled}
