import unittest

from scripts.check_ci_paths import lanes, shadow_report


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


class ShadowSelectionTests(unittest.TestCase):
    """Issue #150 (A4): shadow selection recorded inside full runs.

    The shadow report never changes what executes; it records what the
    dependency map *would* execute, distinguishing selected lanes from
    not-applicable ones, so a future enforced reduction has replay
    evidence. Unknown paths and workflow changes select full validation.
    """

    def test_documentation_only_is_patch_only(self):
        report = shadow_report(['README.md', 'docs/AGENT-RUNBOOK.md'])
        self.assertEqual(report['verdict'], 'patch-only')
        self.assertEqual(report['unknown_paths'], [])
        self.assertFalse(report['workflow_change'])
        self.assertTrue(all(
            value == 'not-applicable' for value in report['lanes'].values()))
        self.assertEqual(report['aggregate'], 'recorded')

    def test_unknown_paths_select_full_validation(self):
        report = shadow_report(['scripts/new-tool.py', 'tools/thing.txt'])
        self.assertEqual(report['verdict'], 'full')
        self.assertEqual(report['unknown_paths'],
                         ['scripts/new-tool.py', 'tools/thing.txt'])

    def test_workflow_changes_select_full_validation(self):
        report = shadow_report(['.github/workflows/live-index.yml'])
        self.assertEqual(report['verdict'], 'full')
        self.assertTrue(report['workflow_change'])
        self.assertEqual(report['lanes']['ci'], 'selected')

    def test_selected_lanes_distinguish_not_applicable(self):
        report = shadow_report(['data/startup-research.json'])
        self.assertEqual(report['verdict'], 'selected')
        self.assertEqual(report['lanes']['data'], 'selected')
        self.assertEqual(report['lanes']['hosted'], 'selected')
        self.assertEqual(report['lanes']['go'], 'not-applicable')
        self.assertEqual(report['lanes']['web'], 'not-applicable')

    def test_manifests_and_lockfiles_select_their_lanes(self):
        self.assertEqual(
            shadow_report(['package-lock.json'])['lanes']['web'], 'selected')
        self.assertEqual(
            shadow_report(['backend/hosted/package-lock.json'])['lanes']['hosted'],
            'selected')
        self.assertEqual(
            shadow_report(['backend/mcp/package.json'])['lanes']['mcp'],
            'selected')

    def test_shared_module_selects_every_dependent_lane(self):
        report = shadow_report(['scripts/catalogue-entries.mjs'])
        self.assertEqual(report['verdict'], 'selected')
        for lane in ('data', 'mcp', 'hosted'):
            self.assertEqual(report['lanes'][lane], 'selected', lane)

    def test_invalid_data_still_selects_the_data_lane(self):
        # Seeded invalid data must select the tests that catch it: any
        # data/* path selects data (and hosted, which reads data directly).
        report = shadow_report(['data/graph.json'])
        self.assertEqual(report['lanes']['data'], 'selected')
        self.assertEqual(report['lanes']['hosted'], 'selected')
        self.assertEqual(report['verdict'], 'selected')
