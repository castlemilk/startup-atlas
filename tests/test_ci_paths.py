import unittest

from scripts.check_ci_paths import lanes


class CiPathTests(unittest.TestCase):
    def test_documentation_changes_need_only_the_patch_check(self):
        self.assertFalse(any(lanes(['README.md', 'docs/AGENT-RUNBOOK.md']).values()))

    def test_data_and_web_are_independent(self):
        self.assertEqual(self.selected('data/startup-research.json'), {'data'})
        self.assertEqual(self.selected('web/entity.js'), {'web'})
        self.assertEqual(self.selected('web/atlas-ui.css', 'data/graph.json'), {'data', 'web'})

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
        self.assertEqual(self.selected('backend/internal/graph/service.go'), {'go'})

    @staticmethod
    def selected(*paths):
        return {name for name, enabled in lanes(paths).items() if enabled}
